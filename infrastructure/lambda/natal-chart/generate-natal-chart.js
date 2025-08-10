"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const ephemeris_1 = require("ephemeris");
const crypto = __importStar(require("crypto"));
const dynamoClient = new client_dynamodb_1.DynamoDBClient({});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
// Import swisseph from the Lambda Layer
let swisseph;
try {
    swisseph = require('/opt/nodejs/node_modules/swisseph');
}
catch (error) {
    console.warn('Swiss Ephemeris not available from layer, falling back to local if available');
    try {
        swisseph = require('swisseph');
    }
    catch (e) {
        console.error('Swiss Ephemeris not available');
    }
}
const ZODIAC_SIGNS = [
    'Aries',
    'Taurus',
    'Gemini',
    'Cancer',
    'Leo',
    'Virgo',
    'Libra',
    'Scorpio',
    'Sagittarius',
    'Capricorn',
    'Aquarius',
    'Pisces',
];
const validateEvent = (event) => {
    if (!event.userId ||
        !event.birthDate ||
        !event.latitude ||
        !event.longitude ||
        !event.ianaTimeZone) {
        throw new Error('Missing required event properties');
    }
    // Validate coordinates
    if (event.latitude < -90 || event.latitude > 90) {
        throw new Error('Invalid latitude: must be between -90 and 90');
    }
    if (event.longitude < -180 || event.longitude > 180) {
        throw new Error('Invalid longitude: must be between -180 and 180');
    }
    return event;
};
const getDegreeInfo = (degree) => {
    const normalizedDegree = degree % 360;
    const signIndex = Math.floor(normalizedDegree / 30);
    const degreeInSign = normalizedDegree % 30;
    const wholeDegrees = Math.floor(degreeInSign);
    const minutes = Math.round((degreeInSign - wholeDegrees) * 60);
    return {
        sign: ZODIAC_SIGNS[signIndex],
        degreeInSign: wholeDegrees,
        minutes,
    };
};
const calculateHousesWithSwisseph = async (birthDateTime, latitude, longitude) => {
    if (!swisseph) {
        console.warn('Swiss Ephemeris not available, skipping house calculations');
        return null;
    }
    try {
        // Set ephemeris path if provided
        const ephePath = process.env.EPHEMERIS_PATH || '/opt/nodejs/node_modules/swisseph/ephe';
        swisseph.swe_set_ephe_path(ephePath);
        // Calculate Julian Day
        const year = birthDateTime.getUTCFullYear();
        const month = birthDateTime.getUTCMonth() + 1;
        const day = birthDateTime.getUTCDate();
        const hour = birthDateTime.getUTCHours() +
            birthDateTime.getUTCMinutes() / 60 +
            birthDateTime.getUTCSeconds() / 3600;
        const julianDay = swisseph.swe_julday(year, month, day, hour, swisseph.SE_GREG_CAL);
        // Calculate houses using Placidus system
        const houseData = swisseph.swe_houses(julianDay, latitude, longitude, 'P');
        if (!houseData || !houseData.house || !houseData.ascendant || !houseData.mc) {
            throw new Error('Failed to calculate houses');
        }
        // Process house cusps
        const houses = [];
        for (let i = 0; i < 12; i++) {
            const cuspDegree = houseData.house[i];
            const degreeInfo = getDegreeInfo(cuspDegree);
            houses.push({
                houseNumber: i + 1,
                cuspDegree,
                cuspSign: degreeInfo.sign,
                cuspDegreeInSign: degreeInfo.degreeInSign,
                cuspMinutes: degreeInfo.minutes,
            });
        }
        // Process Ascendant
        const ascInfo = getDegreeInfo(houseData.ascendant);
        const ascendant = {
            degree: houseData.ascendant,
            sign: ascInfo.sign,
            degreeInSign: ascInfo.degreeInSign,
            minutes: ascInfo.minutes,
        };
        // Process Midheaven
        const mcInfo = getDegreeInfo(houseData.mc);
        const midheaven = {
            degree: houseData.mc,
            sign: mcInfo.sign,
            degreeInSign: mcInfo.degreeInSign,
            minutes: mcInfo.minutes,
        };
        // Calculate planet positions using Swiss Ephemeris for accuracy
        const planetHouses = {};
        const planetIds = [
            swisseph.SE_SUN,
            swisseph.SE_MOON,
            swisseph.SE_MERCURY,
            swisseph.SE_VENUS,
            swisseph.SE_MARS,
            swisseph.SE_JUPITER,
            swisseph.SE_SATURN,
            swisseph.SE_URANUS,
            swisseph.SE_NEPTUNE,
            swisseph.SE_PLUTO,
        ];
        const planetNames = [
            'sun',
            'moon',
            'mercury',
            'venus',
            'mars',
            'jupiter',
            'saturn',
            'uranus',
            'neptune',
            'pluto',
        ];
        for (let i = 0; i < planetIds.length; i++) {
            const planetData = swisseph.swe_calc_ut(julianDay, planetIds[i], swisseph.SEFLG_SPEED);
            if (planetData && planetData.longitude !== undefined) {
                const planetLongitude = planetData.longitude;
                // Determine which house the planet is in
                for (let h = 0; h < 12; h++) {
                    const currentCusp = houses[h].cuspDegree;
                    const nextCusp = houses[(h + 1) % 12].cuspDegree;
                    // Handle cusp wrap-around at 360 degrees
                    if (currentCusp > nextCusp) {
                        // House spans 0 degrees
                        if (planetLongitude >= currentCusp || planetLongitude < nextCusp) {
                            planetHouses[planetNames[i]] = h + 1;
                            break;
                        }
                    }
                    else {
                        if (planetLongitude >= currentCusp && planetLongitude < nextCusp) {
                            planetHouses[planetNames[i]] = h + 1;
                            break;
                        }
                    }
                }
            }
        }
        // Close Swiss Ephemeris
        swisseph.swe_close();
        return {
            houses,
            ascendant,
            midheaven,
            planetHouses,
        };
    }
    catch (error) {
        console.error('Error calculating houses with Swiss Ephemeris:', error);
        // Close Swiss Ephemeris on error
        if (swisseph && swisseph.swe_close) {
            swisseph.swe_close();
        }
        return null;
    }
};
const generateCacheKey = (birthDate, birthTime, latitude, longitude) => {
    const input = `${birthDate}T${birthTime}:00Z_${latitude}_${longitude}_placidus_tropical_v2.10.03`;
    return crypto.createHash('sha256').update(input).digest('hex');
};
const getCachedHouseData = async (cacheKey) => {
    const NATAL_CHART_TABLE_NAME = process.env.NATAL_CHART_TABLE_NAME;
    try {
        const result = await docClient.send(new lib_dynamodb_1.GetCommand({
            TableName: NATAL_CHART_TABLE_NAME,
            Key: {
                userId: `CACHE#${cacheKey}`,
                chartType: 'house_cache',
            },
        }));
        if (result.Item) {
            console.log('Cache hit for house calculations');
            return result.Item.houseData;
        }
    }
    catch (error) {
        console.error('Error retrieving cached data:', error);
    }
    return null;
};
const saveCachedHouseData = async (cacheKey, houseData) => {
    const NATAL_CHART_TABLE_NAME = process.env.NATAL_CHART_TABLE_NAME;
    try {
        const ttl = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 days TTL
        await docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: NATAL_CHART_TABLE_NAME,
            Item: {
                userId: `CACHE#${cacheKey}`,
                chartType: 'house_cache',
                houseData,
                ttl,
                createdAt: new Date().toISOString(),
            },
        }));
    }
    catch (error) {
        console.error('Error saving cached data:', error);
    }
};
const handler = async (event) => {
    const NATAL_CHART_TABLE_NAME = process.env.NATAL_CHART_TABLE_NAME;
    console.log('Received event:', JSON.stringify(event, null, 2));
    const validatedEvent = validateEvent(event);
    const { userId, birthDate, latitude, longitude, ianaTimeZone } = validatedEvent;
    // Birth time is now required per KAN-7
    if (!validatedEvent.birthTime) {
        throw new Error('Birth time is required for house calculations');
    }
    const birthTime = validatedEvent.birthTime;
    const isTimeEstimated = false; // Since birth time is now required
    // Create a date object that represents the local time at the birth location
    const birthDateTimeStr = `${birthDate}T${birthTime}:00`;
    const birthDateTime = new Date(birthDateTimeStr);
    // Calculate timezone offset
    const timezoneOffsetInHours = new Date(birthDateTime.toLocaleString('en-US', { timeZone: ianaTimeZone })).getTimezoneOffset() /
        -60;
    try {
        // Calculate planetary positions using existing ephemeris library
        const chartData = (0, ephemeris_1.getAllPlanets)(birthDateTime, longitude, latitude, timezoneOffsetInHours);
        // Extract planetary positions from the observed namespace
        const planets = {};
        if (chartData.observed) {
            Object.keys(chartData.observed).forEach((planetName) => {
                const planetData = chartData.observed[planetName];
                if (planetData) {
                    planets[planetName] = {
                        longitude: planetData.apparentLongitudeDd || 0,
                        longitudeDms: planetData.apparentLongitudeDms360 || '',
                        distanceKm: planetData.geocentricDistanceKm || 0,
                        name: planetData.name || planetName,
                    };
                }
            });
        }
        // Check cache for house calculations
        const cacheKey = generateCacheKey(birthDate, birthTime, latitude, longitude);
        let houseData = await getCachedHouseData(cacheKey);
        if (!houseData) {
            // Calculate houses using Swiss Ephemeris
            houseData = await calculateHousesWithSwisseph(birthDateTime, latitude, longitude);
            if (houseData) {
                // Save to cache
                await saveCachedHouseData(cacheKey, houseData);
            }
        }
        // Prepare the item to store
        const item = {
            userId,
            chartType: 'natal',
            createdAt: new Date().toISOString(),
            isTimeEstimated,
            birthInfo: {
                ...validatedEvent,
                birthTime,
            },
            planets,
            metadata: {
                calculationTimestamp: new Date().toISOString(),
                algoVersion: '2.0.0',
                ephemerisVersion: '2.10.03',
                swetestVersion: '2.10.03',
                inputHash: cacheKey,
            },
        };
        // Add house data if available
        if (houseData) {
            item.houses = {
                status: 'success',
                data: houseData.houses,
            };
            item.ascendant = houseData.ascendant;
            item.midheaven = houseData.midheaven;
            item.planetHouses = houseData.planetHouses;
        }
        else {
            item.houses = {
                status: 'failed',
                error: 'House calculations unavailable',
            };
        }
        // Store the natal chart
        await docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: NATAL_CHART_TABLE_NAME,
            Item: item,
        }));
        console.log(`Successfully generated and stored natal chart for userId: ${userId}`);
    }
    catch (error) {
        console.error('Error calculating or storing natal chart:', error);
        throw error;
    }
};
exports.handler = handler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGUtbmF0YWwtY2hhcnQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJnZW5lcmF0ZS1uYXRhbC1jaGFydC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLDhEQUEwRDtBQUMxRCx3REFBdUY7QUFDdkYseUNBQTBDO0FBQzFDLCtDQUFpQztBQUVqQyxNQUFNLFlBQVksR0FBRyxJQUFJLGdDQUFjLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDNUMsTUFBTSxTQUFTLEdBQUcscUNBQXNCLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO0FBRTVELHdDQUF3QztBQUN4QyxJQUFJLFFBQWEsQ0FBQztBQUNsQixJQUFJLENBQUM7SUFDSCxRQUFRLEdBQUcsT0FBTyxDQUFDLG1DQUFtQyxDQUFDLENBQUM7QUFDMUQsQ0FBQztBQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7SUFDZixPQUFPLENBQUMsSUFBSSxDQUFDLDhFQUE4RSxDQUFDLENBQUM7SUFDN0YsSUFBSSxDQUFDO1FBQ0gsUUFBUSxHQUFHLE9BQU8sQ0FBQyxVQUFVLENBQUMsQ0FBQztJQUNqQyxDQUFDO0lBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztRQUNYLE9BQU8sQ0FBQyxLQUFLLENBQUMsK0JBQStCLENBQUMsQ0FBQztJQUNqRCxDQUFDO0FBQ0gsQ0FBQztBQTBCRCxNQUFNLFlBQVksR0FBRztJQUNuQixPQUFPO0lBQ1AsUUFBUTtJQUNSLFFBQVE7SUFDUixRQUFRO0lBQ1IsS0FBSztJQUNMLE9BQU87SUFDUCxPQUFPO0lBQ1AsU0FBUztJQUNULGFBQWE7SUFDYixXQUFXO0lBQ1gsVUFBVTtJQUNWLFFBQVE7Q0FDVCxDQUFDO0FBRUYsTUFBTSxhQUFhLEdBQUcsQ0FBQyxLQUFVLEVBQW1CLEVBQUU7SUFDcEQsSUFDRSxDQUFDLEtBQUssQ0FBQyxNQUFNO1FBQ2IsQ0FBQyxLQUFLLENBQUMsU0FBUztRQUNoQixDQUFDLEtBQUss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QyxTQUFTLENBQUM7WUFDckMsSUFBSSxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUMsU0FBUyxDQUFDO1lBQ3JDLElBQUksQ0FBQyxZQUFZLEdBQUcsU0FBUyxDQUFDLFlBQVksQ0FBQztRQUM3QyxDQUFDO2FBQU0sQ0FBQztZQUNOLElBQUksQ0FBQyxNQUFNLEdBQUc7Z0JBQ1osTUFBTSxFQUFFLFFBQVE7Z0JBQ2hCLEtBQUssRUFBRSxnQ0FBZ0M7YUFDeEMsQ0FBQztRQUNKLENBQUM7UUFFRCx3QkFBd0I7UUFDeEIsTUFBTSxTQUFTLENBQUMsSUFBSSxDQUNsQixJQUFJLHlCQUFVLENBQUM7WUFDYixTQUFTLEVBQUUsc0JBQXNCO1lBQ2pDLElBQUksRUFBRSxJQUFJO1NBQ1gsQ0FBQyxDQUNILENBQUM7UUFFRixPQUFPLENBQUMsR0FBRyxDQUFDLDZEQUE2RCxNQUFNLEVBQUUsQ0FBQyxDQUFDO0lBQ3JGLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQywyQ0FBMkMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNsRSxNQUFNLEtBQUssQ0FBQztJQUNkLENBQUM7QUFDSCxDQUFDLENBQUM7QUEzR1csUUFBQSxPQUFPLFdBMkdsQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IER5bmFtb0RCQ2xpZW50IH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LWR5bmFtb2RiJztcbmltcG9ydCB7IER5bmFtb0RCRG9jdW1lbnRDbGllbnQsIFB1dENvbW1hbmQsIEdldENvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9saWItZHluYW1vZGInO1xuaW1wb3J0IHsgZ2V0QWxsUGxhbmV0cyB9IGZyb20gJ2VwaGVtZXJpcyc7XG5pbXBvcnQgKiBhcyBjcnlwdG8gZnJvbSAnY3J5cHRvJztcblxuY29uc3QgZHluYW1vQ2xpZW50ID0gbmV3IER5bmFtb0RCQ2xpZW50KHt9KTtcbmNvbnN0IGRvY0NsaWVudCA9IER5bmFtb0RCRG9jdW1lbnRDbGllbnQuZnJvbShkeW5hbW9DbGllbnQpO1xuXG4vLyBJbXBvcnQgc3dpc3NlcGggZnJvbSB0aGUgTGFtYmRhIExheWVyXG5sZXQgc3dpc3NlcGg6IGFueTtcbnRyeSB7XG4gIHN3aXNzZXBoID0gcmVxdWlyZSgnL29wdC9ub2RlanMvbm9kZV9tb2R1bGVzL3N3aXNzZXBoJyk7XG59IGNhdGNoIChlcnJvcikge1xuICBjb25zb2xlLndhcm4oJ1N3aXNzIEVwaGVtZXJpcyBub3QgYXZhaWxhYmxlIGZyb20gbGF5ZXIsIGZhbGxpbmcgYmFjayB0byBsb2NhbCBpZiBhdmFpbGFibGUnKTtcbiAgdHJ5IHtcbiAgICBzd2lzc2VwaCA9IHJlcXVpcmUoJ3N3aXNzZXBoJyk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBjb25zb2xlLmVycm9yKCdTd2lzcyBFcGhlbWVyaXMgbm90IGF2YWlsYWJsZScpO1xuICB9XG59XG5cbmludGVyZmFjZSBOYXRhbENoYXJ0RXZlbnQge1xuICB1c2VySWQ6IHN0cmluZztcbiAgYmlydGhEYXRlOiBzdHJpbmc7IC8vIFlZWVktTU0tRERcbiAgYmlydGhUaW1lPzogc3RyaW5nOyAvLyBISDpNTVxuICBsYXRpdHVkZTogbnVtYmVyO1xuICBsb25naXR1ZGU6IG51bWJlcjtcbiAgaWFuYVRpbWVab25lOiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBIb3VzZURhdGEge1xuICBob3VzZU51bWJlcjogbnVtYmVyO1xuICBjdXNwRGVncmVlOiBudW1iZXI7XG4gIGN1c3BTaWduOiBzdHJpbmc7XG4gIGN1c3BEZWdyZWVJblNpZ246IG51bWJlcjtcbiAgY3VzcE1pbnV0ZXM6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIEFuZ2xlRGF0YSB7XG4gIGRlZ3JlZTogbnVtYmVyO1xuICBzaWduOiBzdHJpbmc7XG4gIGRlZ3JlZUluU2lnbjogbnVtYmVyO1xuICBtaW51dGVzOiBudW1iZXI7XG59XG5cbmNvbnN0IFpPRElBQ19TSUdOUyA9IFtcbiAgJ0FyaWVzJyxcbiAgJ1RhdXJ1cycsXG4gICdHZW1pbmknLFxuICAnQ2FuY2VyJyxcbiAgJ0xlbycsXG4gICdWaXJnbycsXG4gICdMaWJyYScsXG4gICdTY29ycGlvJyxcbiAgJ1NhZ2l0dGFyaXVzJyxcbiAgJ0NhcHJpY29ybicsXG4gICdBcXVhcml1cycsXG4gICdQaXNjZXMnLFxuXTtcblxuY29uc3QgdmFsaWRhdGVFdmVudCA9IChldmVudDogYW55KTogTmF0YWxDaGFydEV2ZW50ID0+IHtcbiAgaWYgKFxuICAgICFldmVudC51c2VySWQgfHxcbiAgICAhZXZlbnQuYmlydGhEYXRlIHx8XG4gICAgIWV2ZW50LmxhdGl0dWRlIHx8XG4gICAgIWV2ZW50LmxvbmdpdHVkZSB8fFxuICAgICFldmVudC5pYW5hVGltZVpvbmVcbiAgKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdNaXNzaW5nIHJlcXVpcmVkIGV2ZW50IHByb3BlcnRpZXMnKTtcbiAgfVxuXG4gIC8vIFZhbGlkYXRlIGNvb3JkaW5hdGVzXG4gIGlmIChldmVudC5sYXRpdHVkZSA8IC05MCB8fCBldmVudC5sYXRpdHVkZSA+IDkwKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGxhdGl0dWRlOiBtdXN0IGJlIGJldHdlZW4gLTkwIGFuZCA5MCcpO1xuICB9XG4gIGlmIChldmVudC5sb25naXR1ZGUgPCAtMTgwIHx8IGV2ZW50LmxvbmdpdHVkZSA+IDE4MCkge1xuICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBsb25naXR1ZGU6IG11c3QgYmUgYmV0d2VlbiAtMTgwIGFuZCAxODAnKTtcbiAgfVxuXG4gIHJldHVybiBldmVudDtcbn07XG5cbmNvbnN0IGdldERlZ3JlZUluZm8gPSAoZGVncmVlOiBudW1iZXIpOiB7IHNpZ246IHN0cmluZzsgZGVncmVlSW5TaWduOiBudW1iZXI7IG1pbnV0ZXM6IG51bWJlciB9ID0+IHtcbiAgY29uc3Qgbm9ybWFsaXplZERlZ3JlZSA9IGRlZ3JlZSAlIDM2MDtcbiAgY29uc3Qgc2lnbkluZGV4ID0gTWF0aC5mbG9vcihub3JtYWxpemVkRGVncmVlIC8gMzApO1xuICBjb25zdCBkZWdyZWVJblNpZ24gPSBub3JtYWxpemVkRGVncmVlICUgMzA7XG4gIGNvbnN0IHdob2xlRGVncmVlcyA9IE1hdGguZmxvb3IoZGVncmVlSW5TaWduKTtcbiAgY29uc3QgbWludXRlcyA9IE1hdGgucm91bmQoKGRlZ3JlZUluU2lnbiAtIHdob2xlRGVncmVlcykgKiA2MCk7XG5cbiAgcmV0dXJuIHtcbiAgICBzaWduOiBaT0RJQUNfU0lHTlNbc2lnbkluZGV4XSxcbiAgICBkZWdyZWVJblNpZ246IHdob2xlRGVncmVlcyxcbiAgICBtaW51dGVzLFxuICB9O1xufTtcblxuY29uc3QgY2FsY3VsYXRlSG91c2VzV2l0aFN3aXNzZXBoID0gYXN5bmMgKFxuICBiaXJ0aERhdGVUaW1lOiBEYXRlLFxuICBsYXRpdHVkZTogbnVtYmVyLFxuICBsb25naXR1ZGU6IG51bWJlcixcbik6IFByb21pc2U8e1xuICBob3VzZXM6IEhvdXNlRGF0YVtdO1xuICBhc2NlbmRhbnQ6IEFuZ2xlRGF0YTtcbiAgbWlkaGVhdmVuOiBBbmdsZURhdGE7XG4gIHBsYW5ldEhvdXNlczogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbn0gfCBudWxsPiA9PiB7XG4gIGlmICghc3dpc3NlcGgpIHtcbiAgICBjb25zb2xlLndhcm4oJ1N3aXNzIEVwaGVtZXJpcyBub3QgYXZhaWxhYmxlLCBza2lwcGluZyBob3VzZSBjYWxjdWxhdGlvbnMnKTtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIHRyeSB7XG4gICAgLy8gU2V0IGVwaGVtZXJpcyBwYXRoIGlmIHByb3ZpZGVkXG4gICAgY29uc3QgZXBoZVBhdGggPSBwcm9jZXNzLmVudi5FUEhFTUVSSVNfUEFUSCB8fCAnL29wdC9ub2RlanMvbm9kZV9tb2R1bGVzL3N3aXNzZXBoL2VwaGUnO1xuICAgIHN3aXNzZXBoLnN3ZV9zZXRfZXBoZV9wYXRoKGVwaGVQYXRoKTtcblxuICAgIC8vIENhbGN1bGF0ZSBKdWxpYW4gRGF5XG4gICAgY29uc3QgeWVhciA9IGJpcnRoRGF0ZVRpbWUuZ2V0VVRDRnVsbFllYXIoKTtcbiAgICBjb25zdCBtb250aCA9IGJpcnRoRGF0ZVRpbWUuZ2V0VVRDTW9udGgoKSArIDE7XG4gICAgY29uc3QgZGF5ID0gYmlydGhEYXRlVGltZS5nZXRVVENEYXRlKCk7XG4gICAgY29uc3QgaG91ciA9XG4gICAgICBiaXJ0aERhdGVUaW1lLmdldFVUQ0hvdXJzKCkgK1xuICAgICAgYmlydGhEYXRlVGltZS5nZXRVVENNaW51dGVzKCkgLyA2MCArXG4gICAgICBiaXJ0aERhdGVUaW1lLmdldFVUQ1NlY29uZHMoKSAvIDM2MDA7XG5cbiAgICBjb25zdCBqdWxpYW5EYXkgPSBzd2lzc2VwaC5zd2VfanVsZGF5KHllYXIsIG1vbnRoLCBkYXksIGhvdXIsIHN3aXNzZXBoLlNFX0dSRUdfQ0FMKTtcblxuICAgIC8vIENhbGN1bGF0ZSBob3VzZXMgdXNpbmcgUGxhY2lkdXMgc3lzdGVtXG4gICAgY29uc3QgaG91c2VEYXRhID0gc3dpc3NlcGguc3dlX2hvdXNlcyhcbiAgICAgIGp1bGlhbkRheSxcbiAgICAgIGxhdGl0dWRlLFxuICAgICAgbG9uZ2l0dWRlLFxuICAgICAgJ1AnLCAvLyBQbGFjaWR1cyBob3VzZSBzeXN0ZW1cbiAgICApO1xuXG4gICAgaWYgKCFob3VzZURhdGEgfHwgIWhvdXNlRGF0YS5ob3VzZSB8fCAhaG91c2VEYXRhLmFzY2VuZGFudCB8fCAhaG91c2VEYXRhLm1jKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZhaWxlZCB0byBjYWxjdWxhdGUgaG91c2VzJyk7XG4gICAgfVxuXG4gICAgLy8gUHJvY2VzcyBob3VzZSBjdXNwc1xuICAgIGNvbnN0IGhvdXNlczogSG91c2VEYXRhW10gPSBbXTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IDEyOyBpKyspIHtcbiAgICAgIGNvbnN0IGN1c3BEZWdyZWUgPSBob3VzZURhdGEuaG91c2VbaV07XG4gICAgICBjb25zdCBkZWdyZWVJbmZvID0gZ2V0RGVncmVlSW5mbyhjdXNwRGVncmVlKTtcbiAgICAgIGhvdXNlcy5wdXNoKHtcbiAgICAgICAgaG91c2VOdW1iZXI6IGkgKyAxLFxuICAgICAgICBjdXNwRGVncmVlLFxuICAgICAgICBjdXNwU2lnbjogZGVncmVlSW5mby5zaWduLFxuICAgICAgICBjdXNwRGVncmVlSW5TaWduOiBkZWdyZWVJbmZvLmRlZ3JlZUluU2lnbixcbiAgICAgICAgY3VzcE1pbnV0ZXM6IGRlZ3JlZUluZm8ubWludXRlcyxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIFByb2Nlc3MgQXNjZW5kYW50XG4gICAgY29uc3QgYXNjSW5mbyA9IGdldERlZ3JlZUluZm8oaG91c2VEYXRhLmFzY2VuZGFudCk7XG4gICAgY29uc3QgYXNjZW5kYW50OiBBbmdsZURhdGEgPSB7XG4gICAgICBkZWdyZWU6IGhvdXNlRGF0YS5hc2NlbmRhbnQsXG4gICAgICBzaWduOiBhc2NJbmZvLnNpZ24sXG4gICAgICBkZWdyZWVJblNpZ246IGFzY0luZm8uZGVncmVlSW5TaWduLFxuICAgICAgbWludXRlczogYXNjSW5mby5taW51dGVzLFxuICAgIH07XG5cbiAgICAvLyBQcm9jZXNzIE1pZGhlYXZlblxuICAgIGNvbnN0IG1jSW5mbyA9IGdldERlZ3JlZUluZm8oaG91c2VEYXRhLm1jKTtcbiAgICBjb25zdCBtaWRoZWF2ZW46IEFuZ2xlRGF0YSA9IHtcbiAgICAgIGRlZ3JlZTogaG91c2VEYXRhLm1jLFxuICAgICAgc2lnbjogbWNJbmZvLnNpZ24sXG4gICAgICBkZWdyZWVJblNpZ246IG1jSW5mby5kZWdyZWVJblNpZ24sXG4gICAgICBtaW51dGVzOiBtY0luZm8ubWludXRlcyxcbiAgICB9O1xuXG4gICAgLy8gQ2FsY3VsYXRlIHBsYW5ldCBwb3NpdGlvbnMgdXNpbmcgU3dpc3MgRXBoZW1lcmlzIGZvciBhY2N1cmFjeVxuICAgIGNvbnN0IHBsYW5ldEhvdXNlczogUmVjb3JkPHN0cmluZywgbnVtYmVyPiA9IHt9O1xuICAgIGNvbnN0IHBsYW5ldElkcyA9IFtcbiAgICAgIHN3aXNzZXBoLlNFX1NVTixcbiAgICAgIHN3aXNzZXBoLlNFX01PT04sXG4gICAgICBzd2lzc2VwaC5TRV9NRVJDVVJZLFxuICAgICAgc3dpc3NlcGguU0VfVkVOVVMsXG4gICAgICBzd2lzc2VwaC5TRV9NQVJTLFxuICAgICAgc3dpc3NlcGguU0VfSlVQSVRFUixcbiAgICAgIHN3aXNzZXBoLlNFX1NBVFVSTixcbiAgICAgIHN3aXNzZXBoLlNFX1VSQU5VUyxcbiAgICAgIHN3aXNzZXBoLlNFX05FUFRVTkUsXG4gICAgICBzd2lzc2VwaC5TRV9QTFVUTyxcbiAgICBdO1xuICAgIGNvbnN0IHBsYW5ldE5hbWVzID0gW1xuICAgICAgJ3N1bicsXG4gICAgICAnbW9vbicsXG4gICAgICAnbWVyY3VyeScsXG4gICAgICAndmVudXMnLFxuICAgICAgJ21hcnMnLFxuICAgICAgJ2p1cGl0ZXInLFxuICAgICAgJ3NhdHVybicsXG4gICAgICAndXJhbnVzJyxcbiAgICAgICduZXB0dW5lJyxcbiAgICAgICdwbHV0bycsXG4gICAgXTtcblxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcGxhbmV0SWRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCBwbGFuZXREYXRhID0gc3dpc3NlcGguc3dlX2NhbGNfdXQoanVsaWFuRGF5LCBwbGFuZXRJZHNbaV0sIHN3aXNzZXBoLlNFRkxHX1NQRUVEKTtcbiAgICAgIGlmIChwbGFuZXREYXRhICYmIHBsYW5ldERhdGEubG9uZ2l0dWRlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgY29uc3QgcGxhbmV0TG9uZ2l0dWRlID0gcGxhbmV0RGF0YS5sb25naXR1ZGU7XG4gICAgICAgIC8vIERldGVybWluZSB3aGljaCBob3VzZSB0aGUgcGxhbmV0IGlzIGluXG4gICAgICAgIGZvciAobGV0IGggPSAwOyBoIDwgMTI7IGgrKykge1xuICAgICAgICAgIGNvbnN0IGN1cnJlbnRDdXNwID0gaG91c2VzW2hdLmN1c3BEZWdyZWU7XG4gICAgICAgICAgY29uc3QgbmV4dEN1c3AgPSBob3VzZXNbKGggKyAxKSAlIDEyXS5jdXNwRGVncmVlO1xuXG4gICAgICAgICAgLy8gSGFuZGxlIGN1c3Agd3JhcC1hcm91bmQgYXQgMzYwIGRlZ3JlZXNcbiAgICAgICAgICBpZiAoY3VycmVudEN1c3AgPiBuZXh0Q3VzcCkge1xuICAgICAgICAgICAgLy8gSG91c2Ugc3BhbnMgMCBkZWdyZWVzXG4gICAgICAgICAgICBpZiAocGxhbmV0TG9uZ2l0dWRlID49IGN1cnJlbnRDdXNwIHx8IHBsYW5ldExvbmdpdHVkZSA8IG5leHRDdXNwKSB7XG4gICAgICAgICAgICAgIHBsYW5ldEhvdXNlc1twbGFuZXROYW1lc1tpXV0gPSBoICsgMTtcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGlmIChwbGFuZXRMb25naXR1ZGUgPj0gY3VycmVudEN1c3AgJiYgcGxhbmV0TG9uZ2l0dWRlIDwgbmV4dEN1c3ApIHtcbiAgICAgICAgICAgICAgcGxhbmV0SG91c2VzW3BsYW5ldE5hbWVzW2ldXSA9IGggKyAxO1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBDbG9zZSBTd2lzcyBFcGhlbWVyaXNcbiAgICBzd2lzc2VwaC5zd2VfY2xvc2UoKTtcblxuICAgIHJldHVybiB7XG4gICAgICBob3VzZXMsXG4gICAgICBhc2NlbmRhbnQsXG4gICAgICBtaWRoZWF2ZW4sXG4gICAgICBwbGFuZXRIb3VzZXMsXG4gICAgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBjYWxjdWxhdGluZyBob3VzZXMgd2l0aCBTd2lzcyBFcGhlbWVyaXM6JywgZXJyb3IpO1xuICAgIC8vIENsb3NlIFN3aXNzIEVwaGVtZXJpcyBvbiBlcnJvclxuICAgIGlmIChzd2lzc2VwaCAmJiBzd2lzc2VwaC5zd2VfY2xvc2UpIHtcbiAgICAgIHN3aXNzZXBoLnN3ZV9jbG9zZSgpO1xuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufTtcblxuY29uc3QgZ2VuZXJhdGVDYWNoZUtleSA9IChcbiAgYmlydGhEYXRlOiBzdHJpbmcsXG4gIGJpcnRoVGltZTogc3RyaW5nLFxuICBsYXRpdHVkZTogbnVtYmVyLFxuICBsb25naXR1ZGU6IG51bWJlcixcbik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGlucHV0ID0gYCR7YmlydGhEYXRlfVQke2JpcnRoVGltZX06MDBaXyR7bGF0aXR1ZGV9XyR7bG9uZ2l0dWRlfV9wbGFjaWR1c190cm9waWNhbF92Mi4xMC4wM2A7XG4gIHJldHVybiBjcnlwdG8uY3JlYXRlSGFzaCgnc2hhMjU2JykudXBkYXRlKGlucHV0KS5kaWdlc3QoJ2hleCcpO1xufTtcblxuY29uc3QgZ2V0Q2FjaGVkSG91c2VEYXRhID0gYXN5bmMgKGNhY2hlS2V5OiBzdHJpbmcpOiBQcm9taXNlPGFueSB8IG51bGw+ID0+IHtcbiAgY29uc3QgTkFUQUxfQ0hBUlRfVEFCTEVfTkFNRSA9IHByb2Nlc3MuZW52Lk5BVEFMX0NIQVJUX1RBQkxFX05BTUUhO1xuXG4gIHRyeSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQoXG4gICAgICBuZXcgR2V0Q29tbWFuZCh7XG4gICAgICAgIFRhYmxlTmFtZTogTkFUQUxfQ0hBUlRfVEFCTEVfTkFNRSxcbiAgICAgICAgS2V5OiB7XG4gICAgICAgICAgdXNlcklkOiBgQ0FDSEUjJHtjYWNoZUtleX1gLFxuICAgICAgICAgIGNoYXJ0VHlwZTogJ2hvdXNlX2NhY2hlJyxcbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICBpZiAocmVzdWx0Lkl0ZW0pIHtcbiAgICAgIGNvbnNvbGUubG9nKCdDYWNoZSBoaXQgZm9yIGhvdXNlIGNhbGN1bGF0aW9ucycpO1xuICAgICAgcmV0dXJuIHJlc3VsdC5JdGVtLmhvdXNlRGF0YTtcbiAgICB9XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgcmV0cmlldmluZyBjYWNoZWQgZGF0YTonLCBlcnJvcik7XG4gIH1cblxuICByZXR1cm4gbnVsbDtcbn07XG5cbmNvbnN0IHNhdmVDYWNoZWRIb3VzZURhdGEgPSBhc3luYyAoY2FjaGVLZXk6IHN0cmluZywgaG91c2VEYXRhOiBhbnkpOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgY29uc3QgTkFUQUxfQ0hBUlRfVEFCTEVfTkFNRSA9IHByb2Nlc3MuZW52Lk5BVEFMX0NIQVJUX1RBQkxFX05BTUUhO1xuXG4gIHRyeSB7XG4gICAgY29uc3QgdHRsID0gTWF0aC5mbG9vcihEYXRlLm5vdygpIC8gMTAwMCkgKyAzMCAqIDI0ICogNjAgKiA2MDsgLy8gMzAgZGF5cyBUVExcblxuICAgIGF3YWl0IGRvY0NsaWVudC5zZW5kKFxuICAgICAgbmV3IFB1dENvbW1hbmQoe1xuICAgICAgICBUYWJsZU5hbWU6IE5BVEFMX0NIQVJUX1RBQkxFX05BTUUsXG4gICAgICAgIEl0ZW06IHtcbiAgICAgICAgICB1c2VySWQ6IGBDQUNIRSMke2NhY2hlS2V5fWAsXG4gICAgICAgICAgY2hhcnRUeXBlOiAnaG91c2VfY2FjaGUnLFxuICAgICAgICAgIGhvdXNlRGF0YSxcbiAgICAgICAgICB0dGwsXG4gICAgICAgICAgY3JlYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICAgIH0sXG4gICAgICB9KSxcbiAgICApO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHNhdmluZyBjYWNoZWQgZGF0YTonLCBlcnJvcik7XG4gIH1cbn07XG5cbmV4cG9ydCBjb25zdCBoYW5kbGVyID0gYXN5bmMgKGV2ZW50OiBhbnkpOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgY29uc3QgTkFUQUxfQ0hBUlRfVEFCTEVfTkFNRSA9IHByb2Nlc3MuZW52Lk5BVEFMX0NIQVJUX1RBQkxFX05BTUUhO1xuICBjb25zb2xlLmxvZygnUmVjZWl2ZWQgZXZlbnQ6JywgSlNPTi5zdHJpbmdpZnkoZXZlbnQsIG51bGwsIDIpKTtcblxuICBjb25zdCB2YWxpZGF0ZWRFdmVudCA9IHZhbGlkYXRlRXZlbnQoZXZlbnQpO1xuICBjb25zdCB7IHVzZXJJZCwgYmlydGhEYXRlLCBsYXRpdHVkZSwgbG9uZ2l0dWRlLCBpYW5hVGltZVpvbmUgfSA9IHZhbGlkYXRlZEV2ZW50O1xuXG4gIC8vIEJpcnRoIHRpbWUgaXMgbm93IHJlcXVpcmVkIHBlciBLQU4tN1xuICBpZiAoIXZhbGlkYXRlZEV2ZW50LmJpcnRoVGltZSkge1xuICAgIHRocm93IG5ldyBFcnJvcignQmlydGggdGltZSBpcyByZXF1aXJlZCBmb3IgaG91c2UgY2FsY3VsYXRpb25zJyk7XG4gIH1cblxuICBjb25zdCBiaXJ0aFRpbWUgPSB2YWxpZGF0ZWRFdmVudC5iaXJ0aFRpbWU7XG4gIGNvbnN0IGlzVGltZUVzdGltYXRlZCA9IGZhbHNlOyAvLyBTaW5jZSBiaXJ0aCB0aW1lIGlzIG5vdyByZXF1aXJlZFxuXG4gIC8vIENyZWF0ZSBhIGRhdGUgb2JqZWN0IHRoYXQgcmVwcmVzZW50cyB0aGUgbG9jYWwgdGltZSBhdCB0aGUgYmlydGggbG9jYXRpb25cbiAgY29uc3QgYmlydGhEYXRlVGltZVN0ciA9IGAke2JpcnRoRGF0ZX1UJHtiaXJ0aFRpbWV9OjAwYDtcbiAgY29uc3QgYmlydGhEYXRlVGltZSA9IG5ldyBEYXRlKGJpcnRoRGF0ZVRpbWVTdHIpO1xuXG4gIC8vIENhbGN1bGF0ZSB0aW1lem9uZSBvZmZzZXRcbiAgY29uc3QgdGltZXpvbmVPZmZzZXRJbkhvdXJzID1cbiAgICBuZXcgRGF0ZShiaXJ0aERhdGVUaW1lLnRvTG9jYWxlU3RyaW5nKCdlbi1VUycsIHsgdGltZVpvbmU6IGlhbmFUaW1lWm9uZSB9KSkuZ2V0VGltZXpvbmVPZmZzZXQoKSAvXG4gICAgLTYwO1xuXG4gIHRyeSB7XG4gICAgLy8gQ2FsY3VsYXRlIHBsYW5ldGFyeSBwb3NpdGlvbnMgdXNpbmcgZXhpc3RpbmcgZXBoZW1lcmlzIGxpYnJhcnlcbiAgICBjb25zdCBjaGFydERhdGEgPSBnZXRBbGxQbGFuZXRzKGJpcnRoRGF0ZVRpbWUsIGxvbmdpdHVkZSwgbGF0aXR1ZGUsIHRpbWV6b25lT2Zmc2V0SW5Ib3Vycyk7XG5cbiAgICAvLyBFeHRyYWN0IHBsYW5ldGFyeSBwb3NpdGlvbnMgZnJvbSB0aGUgb2JzZXJ2ZWQgbmFtZXNwYWNlXG4gICAgY29uc3QgcGxhbmV0czogUmVjb3JkPHN0cmluZywgYW55PiA9IHt9O1xuICAgIGlmIChjaGFydERhdGEub2JzZXJ2ZWQpIHtcbiAgICAgIE9iamVjdC5rZXlzKGNoYXJ0RGF0YS5vYnNlcnZlZCkuZm9yRWFjaCgocGxhbmV0TmFtZSkgPT4ge1xuICAgICAgICBjb25zdCBwbGFuZXREYXRhID0gY2hhcnREYXRhLm9ic2VydmVkW3BsYW5ldE5hbWVdO1xuICAgICAgICBpZiAocGxhbmV0RGF0YSkge1xuICAgICAgICAgIHBsYW5ldHNbcGxhbmV0TmFtZV0gPSB7XG4gICAgICAgICAgICBsb25naXR1ZGU6IHBsYW5ldERhdGEuYXBwYXJlbnRMb25naXR1ZGVEZCB8fCAwLFxuICAgICAgICAgICAgbG9uZ2l0dWRlRG1zOiBwbGFuZXREYXRhLmFwcGFyZW50TG9uZ2l0dWRlRG1zMzYwIHx8ICcnLFxuICAgICAgICAgICAgZGlzdGFuY2VLbTogcGxhbmV0RGF0YS5nZW9jZW50cmljRGlzdGFuY2VLbSB8fCAwLFxuICAgICAgICAgICAgbmFtZTogcGxhbmV0RGF0YS5uYW1lIHx8IHBsYW5ldE5hbWUsXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgY2FjaGUgZm9yIGhvdXNlIGNhbGN1bGF0aW9uc1xuICAgIGNvbnN0IGNhY2hlS2V5ID0gZ2VuZXJhdGVDYWNoZUtleShiaXJ0aERhdGUsIGJpcnRoVGltZSwgbGF0aXR1ZGUsIGxvbmdpdHVkZSk7XG4gICAgbGV0IGhvdXNlRGF0YSA9IGF3YWl0IGdldENhY2hlZEhvdXNlRGF0YShjYWNoZUtleSk7XG5cbiAgICBpZiAoIWhvdXNlRGF0YSkge1xuICAgICAgLy8gQ2FsY3VsYXRlIGhvdXNlcyB1c2luZyBTd2lzcyBFcGhlbWVyaXNcbiAgICAgIGhvdXNlRGF0YSA9IGF3YWl0IGNhbGN1bGF0ZUhvdXNlc1dpdGhTd2lzc2VwaChiaXJ0aERhdGVUaW1lLCBsYXRpdHVkZSwgbG9uZ2l0dWRlKTtcblxuICAgICAgaWYgKGhvdXNlRGF0YSkge1xuICAgICAgICAvLyBTYXZlIHRvIGNhY2hlXG4gICAgICAgIGF3YWl0IHNhdmVDYWNoZWRIb3VzZURhdGEoY2FjaGVLZXksIGhvdXNlRGF0YSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gUHJlcGFyZSB0aGUgaXRlbSB0byBzdG9yZVxuICAgIGNvbnN0IGl0ZW06IGFueSA9IHtcbiAgICAgIHVzZXJJZCxcbiAgICAgIGNoYXJ0VHlwZTogJ25hdGFsJyxcbiAgICAgIGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgaXNUaW1lRXN0aW1hdGVkLFxuICAgICAgYmlydGhJbmZvOiB7XG4gICAgICAgIC4uLnZhbGlkYXRlZEV2ZW50LFxuICAgICAgICBiaXJ0aFRpbWUsXG4gICAgICB9LFxuICAgICAgcGxhbmV0cyxcbiAgICAgIG1ldGFkYXRhOiB7XG4gICAgICAgIGNhbGN1bGF0aW9uVGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICAgIGFsZ29WZXJzaW9uOiAnMi4wLjAnLFxuICAgICAgICBlcGhlbWVyaXNWZXJzaW9uOiAnMi4xMC4wMycsXG4gICAgICAgIHN3ZXRlc3RWZXJzaW9uOiAnMi4xMC4wMycsXG4gICAgICAgIGlucHV0SGFzaDogY2FjaGVLZXksXG4gICAgICB9LFxuICAgIH07XG5cbiAgICAvLyBBZGQgaG91c2UgZGF0YSBpZiBhdmFpbGFibGVcbiAgICBpZiAoaG91c2VEYXRhKSB7XG4gICAgICBpdGVtLmhvdXNlcyA9IHtcbiAgICAgICAgc3RhdHVzOiAnc3VjY2VzcycsXG4gICAgICAgIGRhdGE6IGhvdXNlRGF0YS5ob3VzZXMsXG4gICAgICB9O1xuICAgICAgaXRlbS5hc2NlbmRhbnQgPSBob3VzZURhdGEuYXNjZW5kYW50O1xuICAgICAgaXRlbS5taWRoZWF2ZW4gPSBob3VzZURhdGEubWlkaGVhdmVuO1xuICAgICAgaXRlbS5wbGFuZXRIb3VzZXMgPSBob3VzZURhdGEucGxhbmV0SG91c2VzO1xuICAgIH0gZWxzZSB7XG4gICAgICBpdGVtLmhvdXNlcyA9IHtcbiAgICAgICAgc3RhdHVzOiAnZmFpbGVkJyxcbiAgICAgICAgZXJyb3I6ICdIb3VzZSBjYWxjdWxhdGlvbnMgdW5hdmFpbGFibGUnLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBTdG9yZSB0aGUgbmF0YWwgY2hhcnRcbiAgICBhd2FpdCBkb2NDbGllbnQuc2VuZChcbiAgICAgIG5ldyBQdXRDb21tYW5kKHtcbiAgICAgICAgVGFibGVOYW1lOiBOQVRBTF9DSEFSVF9UQUJMRV9OQU1FLFxuICAgICAgICBJdGVtOiBpdGVtLFxuICAgICAgfSksXG4gICAgKTtcblxuICAgIGNvbnNvbGUubG9nKGBTdWNjZXNzZnVsbHkgZ2VuZXJhdGVkIGFuZCBzdG9yZWQgbmF0YWwgY2hhcnQgZm9yIHVzZXJJZDogJHt1c2VySWR9YCk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgY2FsY3VsYXRpbmcgb3Igc3RvcmluZyBuYXRhbCBjaGFydDonLCBlcnJvcik7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn07Il19