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
catch (_error) {
    console.warn('Swiss Ephemeris not available from layer, falling back to local if available');
    try {
        swisseph = require('swisseph');
    }
    catch (_e) {
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
            console.info('Cache hit for house calculations');
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
    console.info('Received event:', JSON.stringify(event, null, 2));
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
    const timezoneOffsetInHours = new Date(birthDateTime.toLocaleString('en-US', { timeZone: ianaTimeZone })).getTimezoneOffset() / -60;
    try {
        // Calculate planetary positions using existing ephemeris library
        const chartData = (0, ephemeris_1.getAllPlanets)(birthDateTime, longitude, latitude, timezoneOffsetInHours);
        // Extract planetary positions from the observed namespace
        const planets = {};
        if (chartData.observed) {
            Object.keys(chartData.observed).forEach((planetName) => {
                const planetData = chartData.observed[planetName];
                if (planetData && planetName !== 'sirius') {
                    const longitude = planetData.apparentLongitudeDd || 0;
                    // Calculate zodiac sign information
                    const normalizedLongitude = ((longitude % 360) + 360) % 360;
                    const signIndex = Math.floor(normalizedLongitude / 30);
                    const sign = ZODIAC_SIGNS[signIndex];
                    const degreeInSign = normalizedLongitude - signIndex * 30;
                    const wholeDegrees = Math.floor(degreeInSign);
                    const minutes = Math.round((degreeInSign - wholeDegrees) * 60);
                    planets[planetName] = {
                        longitude: longitude,
                        longitudeDms: `${wholeDegrees.toString().padStart(2, '0')}°${minutes.toString().padStart(2, '0')}' ${sign}`,
                        distanceKm: planetData.geocentricDistanceKm || 0,
                        name: planetData.name || planetName,
                        sign: sign,
                        degreeInSign: wholeDegrees,
                        minutes: minutes,
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
        console.info(`Successfully generated and stored natal chart for userId: ${userId}`);
    }
    catch (error) {
        console.error('Error calculating or storing natal chart:', error);
        throw error;
    }
};
exports.handler = handler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGUtbmF0YWwtY2hhcnQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJnZW5lcmF0ZS1uYXRhbC1jaGFydC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLDhEQUEwRDtBQUMxRCx3REFBdUY7QUFDdkYseUNBQTBDO0FBQzFDLCtDQUFpQztBQUVqQyxNQUFNLFlBQVksR0FBRyxJQUFJLGdDQUFjLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDNUMsTUFBTSxTQUFTLEdBQUcscUNBQXNCLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO0FBRTVELHdDQUF3QztBQUN4QyxJQUFJLFFBQWEsQ0FBQztBQUNsQixJQUFJLENBQUM7SUFDSCxRQUFRLEdBQUcsT0FBTyxDQUFDLG1DQUFtQyxDQUFDLENBQUM7QUFDMUQsQ0FBQztBQUFDLE9BQU8sTUFBTSxFQUFFLENBQUM7SUFDaEIsT0FBTyxDQUFDLElBQUksQ0FBQyw4RUFBOEUsQ0FBQyxDQUFDO0lBQzdGLElBQUksQ0FBQztRQUNILFFBQVEsR0FBRyxPQUFPLENBQUMsVUFBVSxDQUFDLENBQUM7SUFDakMsQ0FBQztJQUFDLE9BQU8sRUFBRSxFQUFFLENBQUM7UUFDWixPQUFPLENBQUMsS0FBSyxDQUFDLCtCQUErQixDQUFDLENBQUM7SUFDakQsQ0FBQztBQUNILENBQUM7QUEwQkQsTUFBTSxZQUFZLEdBQUc7SUFDbkIsT0FBTztJQUNQLFFBQVE7SUFDUixRQUFRO0lBQ1IsUUFBUTtJQUNSLEtBQUs7SUFDTCxPQUFPO0lBQ1AsT0FBTztJQUNQLFNBQVM7SUFDVCxhQUFhO0lBQ2IsV0FBVztJQUNYLFVBQVU7SUFDVixRQUFRO0NBQ1QsQ0FBQztBQUVGLE1BQU0sYUFBYSxHQUFHLENBQUMsS0FBVSxFQUFtQixFQUFFO0lBQ3BELElBQ0UsQ0FBQyxLQUFLLENBQUMsTUFBTTtRQUNiLENBQUMsS0FBSyxDQUFDLFNBQVM7UUFDaEIsQ0FBQyxLQUFL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SUFBSSx5QkFBVSxDQUFDO1lBQ2IsU0FBUyxFQUFFLHNCQUFzQjtZQUNqQyxJQUFJLEVBQUUsSUFBSTtTQUNYLENBQUMsQ0FDSCxDQUFDO1FBRUYsT0FBTyxDQUFDLElBQUksQ0FBQyw2REFBNkQsTUFBTSxFQUFFLENBQUMsQ0FBQztJQUN0RixDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsMkNBQTJDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDbEUsTUFBTSxLQUFLLENBQUM7SUFDZCxDQUFDO0FBQ0gsQ0FBQyxDQUFDO0FBeEhXLFFBQUEsT0FBTyxXQXdIbEIiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBEeW5hbW9EQkNsaWVudCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1keW5hbW9kYic7XG5pbXBvcnQgeyBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LCBQdXRDb21tYW5kLCBHZXRDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvbGliLWR5bmFtb2RiJztcbmltcG9ydCB7IGdldEFsbFBsYW5ldHMgfSBmcm9tICdlcGhlbWVyaXMnO1xuaW1wb3J0ICogYXMgY3J5cHRvIGZyb20gJ2NyeXB0byc7XG5cbmNvbnN0IGR5bmFtb0NsaWVudCA9IG5ldyBEeW5hbW9EQkNsaWVudCh7fSk7XG5jb25zdCBkb2NDbGllbnQgPSBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LmZyb20oZHluYW1vQ2xpZW50KTtcblxuLy8gSW1wb3J0IHN3aXNzZXBoIGZyb20gdGhlIExhbWJkYSBMYXllclxubGV0IHN3aXNzZXBoOiBhbnk7XG50cnkge1xuICBzd2lzc2VwaCA9IHJlcXVpcmUoJy9vcHQvbm9kZWpzL25vZGVfbW9kdWxlcy9zd2lzc2VwaCcpO1xufSBjYXRjaCAoX2Vycm9yKSB7XG4gIGNvbnNvbGUud2FybignU3dpc3MgRXBoZW1lcmlzIG5vdCBhdmFpbGFibGUgZnJvbSBsYXllciwgZmFsbGluZyBiYWNrIHRvIGxvY2FsIGlmIGF2YWlsYWJsZScpO1xuICB0cnkge1xuICAgIHN3aXNzZXBoID0gcmVxdWlyZSgnc3dpc3NlcGgnKTtcbiAgfSBjYXRjaCAoX2UpIHtcbiAgICBjb25zb2xlLmVycm9yKCdTd2lzcyBFcGhlbWVyaXMgbm90IGF2YWlsYWJsZScpO1xuICB9XG59XG5cbmludGVyZmFjZSBOYXRhbENoYXJ0RXZlbnQge1xuICB1c2VySWQ6IHN0cmluZztcbiAgYmlydGhEYXRlOiBzdHJpbmc7IC8vIFlZWVktTU0tRERcbiAgYmlydGhUaW1lPzogc3RyaW5nOyAvLyBISDpNTVxuICBsYXRpdHVkZTogbnVtYmVyO1xuICBsb25naXR1ZGU6IG51bWJlcjtcbiAgaWFuYVRpbWVab25lOiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBIb3VzZURhdGEge1xuICBob3VzZU51bWJlcjogbnVtYmVyO1xuICBjdXNwRGVncmVlOiBudW1iZXI7XG4gIGN1c3BTaWduOiBzdHJpbmc7XG4gIGN1c3BEZWdyZWVJblNpZ246IG51bWJlcjtcbiAgY3VzcE1pbnV0ZXM6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIEFuZ2xlRGF0YSB7XG4gIGRlZ3JlZTogbnVtYmVyO1xuICBzaWduOiBzdHJpbmc7XG4gIGRlZ3JlZUluU2lnbjogbnVtYmVyO1xuICBtaW51dGVzOiBudW1iZXI7XG59XG5cbmNvbnN0IFpPRElBQ19TSUdOUyA9IFtcbiAgJ0FyaWVzJyxcbiAgJ1RhdXJ1cycsXG4gICdHZW1pbmknLFxuICAnQ2FuY2VyJyxcbiAgJ0xlbycsXG4gICdWaXJnbycsXG4gICdMaWJyYScsXG4gICdTY29ycGlvJyxcbiAgJ1NhZ2l0dGFyaXVzJyxcbiAgJ0NhcHJpY29ybicsXG4gICdBcXVhcml1cycsXG4gICdQaXNjZXMnLFxuXTtcblxuY29uc3QgdmFsaWRhdGVFdmVudCA9IChldmVudDogYW55KTogTmF0YWxDaGFydEV2ZW50ID0+IHtcbiAgaWYgKFxuICAgICFldmVudC51c2VySWQgfHxcbiAgICAhZXZlbnQuYmlydGhEYXRlIHx8XG4gICAgIWV2ZW50LmxhdGl0dWRlIHx8XG4gICAgIWV2ZW50LmxvbmdpdHVkZSB8fFxuICAgICFldmVudC5pYW5hVGltZVpvbmVcbiAgKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdNaXNzaW5nIHJlcXVpcmVkIGV2ZW50IHByb3BlcnRpZXMnKTtcbiAgfVxuXG4gIC8vIFZhbGlkYXRlIGNvb3JkaW5hdGVzXG4gIGlmIChldmVudC5sYXRpdHVkZSA8IC05MCB8fCBldmVudC5sYXRpdHVkZSA+IDkwKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGxhdGl0dWRlOiBtdXN0IGJlIGJldHdlZW4gLTkwIGFuZCA5MCcpO1xuICB9XG4gIGlmIChldmVudC5sb25naXR1ZGUgPCAtMTgwIHx8IGV2ZW50LmxvbmdpdHVkZSA+IDE4MCkge1xuICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBsb25naXR1ZGU6IG11c3QgYmUgYmV0d2VlbiAtMTgwIGFuZCAxODAnKTtcbiAgfVxuXG4gIHJldHVybiBldmVudDtcbn07XG5cbmNvbnN0IGdldERlZ3JlZUluZm8gPSAoZGVncmVlOiBudW1iZXIpOiB7IHNpZ246IHN0cmluZzsgZGVncmVlSW5TaWduOiBudW1iZXI7IG1pbnV0ZXM6IG51bWJlciB9ID0+IHtcbiAgY29uc3Qgbm9ybWFsaXplZERlZ3JlZSA9IGRlZ3JlZSAlIDM2MDtcbiAgY29uc3Qgc2lnbkluZGV4ID0gTWF0aC5mbG9vcihub3JtYWxpemVkRGVncmVlIC8gMzApO1xuICBjb25zdCBkZWdyZWVJblNpZ24gPSBub3JtYWxpemVkRGVncmVlICUgMzA7XG4gIGNvbnN0IHdob2xlRGVncmVlcyA9IE1hdGguZmxvb3IoZGVncmVlSW5TaWduKTtcbiAgY29uc3QgbWludXRlcyA9IE1hdGgucm91bmQoKGRlZ3JlZUluU2lnbiAtIHdob2xlRGVncmVlcykgKiA2MCk7XG5cbiAgcmV0dXJuIHtcbiAgICBzaWduOiBaT0RJQUNfU0lHTlNbc2lnbkluZGV4XSxcbiAgICBkZWdyZWVJblNpZ246IHdob2xlRGVncmVlcyxcbiAgICBtaW51dGVzLFxuICB9O1xufTtcblxuY29uc3QgY2FsY3VsYXRlSG91c2VzV2l0aFN3aXNzZXBoID0gYXN5bmMgKFxuICBiaXJ0aERhdGVUaW1lOiBEYXRlLFxuICBsYXRpdHVkZTogbnVtYmVyLFxuICBsb25naXR1ZGU6IG51bWJlcixcbik6IFByb21pc2U8e1xuICBob3VzZXM6IEhvdXNlRGF0YVtdO1xuICBhc2NlbmRhbnQ6IEFuZ2xlRGF0YTtcbiAgbWlkaGVhdmVuOiBBbmdsZURhdGE7XG4gIHBsYW5ldEhvdXNlczogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbn0gfCBudWxsPiA9PiB7XG4gIGlmICghc3dpc3NlcGgpIHtcbiAgICBjb25zb2xlLndhcm4oJ1N3aXNzIEVwaGVtZXJpcyBub3QgYXZhaWxhYmxlLCBza2lwcGluZyBob3VzZSBjYWxjdWxhdGlvbnMnKTtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIHRyeSB7XG4gICAgLy8gU2V0IGVwaGVtZXJpcyBwYXRoIGlmIHByb3ZpZGVkXG4gICAgY29uc3QgZXBoZVBhdGggPSBwcm9jZXNzLmVudi5FUEhFTUVSSVNfUEFUSCB8fCAnL29wdC9ub2RlanMvbm9kZV9tb2R1bGVzL3N3aXNzZXBoL2VwaGUnO1xuICAgIHN3aXNzZXBoLnN3ZV9zZXRfZXBoZV9wYXRoKGVwaGVQYXRoKTtcblxuICAgIC8vIENhbGN1bGF0ZSBKdWxpYW4gRGF5XG4gICAgY29uc3QgeWVhciA9IGJpcnRoRGF0ZVRpbWUuZ2V0VVRDRnVsbFllYXIoKTtcbiAgICBjb25zdCBtb250aCA9IGJpcnRoRGF0ZVRpbWUuZ2V0VVRDTW9udGgoKSArIDE7XG4gICAgY29uc3QgZGF5ID0gYmlydGhEYXRlVGltZS5nZXRVVENEYXRlKCk7XG4gICAgY29uc3QgaG91ciA9XG4gICAgICBiaXJ0aERhdGVUaW1lLmdldFVUQ0hvdXJzKCkgK1xuICAgICAgYmlydGhEYXRlVGltZS5nZXRVVENNaW51dGVzKCkgLyA2MCArXG4gICAgICBiaXJ0aERhdGVUaW1lLmdldFVUQ1NlY29uZHMoKSAvIDM2MDA7XG5cbiAgICBjb25zdCBqdWxpYW5EYXkgPSBzd2lzc2VwaC5zd2VfanVsZGF5KHllYXIsIG1vbnRoLCBkYXksIGhvdXIsIHN3aXNzZXBoLlNFX0dSRUdfQ0FMKTtcblxuICAgIC8vIENhbGN1bGF0ZSBob3VzZXMgdXNpbmcgUGxhY2lkdXMgc3lzdGVtXG4gICAgY29uc3QgaG91c2VEYXRhID0gc3dpc3NlcGguc3dlX2hvdXNlcyhcbiAgICAgIGp1bGlhbkRheSxcbiAgICAgIGxhdGl0dWRlLFxuICAgICAgbG9uZ2l0dWRlLFxuICAgICAgJ1AnLCAvLyBQbGFjaWR1cyBob3VzZSBzeXN0ZW1cbiAgICApO1xuXG4gICAgaWYgKCFob3VzZURhdGEgfHwgIWhvdXNlRGF0YS5ob3VzZSB8fCAhaG91c2VEYXRhLmFzY2VuZGFudCB8fCAhaG91c2VEYXRhLm1jKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZhaWxlZCB0byBjYWxjdWxhdGUgaG91c2VzJyk7XG4gICAgfVxuXG4gICAgLy8gUHJvY2VzcyBob3VzZSBjdXNwc1xuICAgIGNvbnN0IGhvdXNlczogSG91c2VEYXRhW10gPSBbXTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IDEyOyBpKyspIHtcbiAgICAgIGNvbnN0IGN1c3BEZWdyZWUgPSBob3VzZURhdGEuaG91c2VbaV07XG4gICAgICBjb25zdCBkZWdyZWVJbmZvID0gZ2V0RGVncmVlSW5mbyhjdXNwRGVncmVlKTtcbiAgICAgIGhvdXNlcy5wdXNoKHtcbiAgICAgICAgaG91c2VOdW1iZXI6IGkgKyAxLFxuICAgICAgICBjdXNwRGVncmVlLFxuICAgICAgICBjdXNwU2lnbjogZGVncmVlSW5mby5zaWduLFxuICAgICAgICBjdXNwRGVncmVlSW5TaWduOiBkZWdyZWVJbmZvLmRlZ3JlZUluU2lnbixcbiAgICAgICAgY3VzcE1pbnV0ZXM6IGRlZ3JlZUluZm8ubWludXRlcyxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIFByb2Nlc3MgQXNjZW5kYW50XG4gICAgY29uc3QgYXNjSW5mbyA9IGdldERlZ3JlZUluZm8oaG91c2VEYXRhLmFzY2VuZGFudCk7XG4gICAgY29uc3QgYXNjZW5kYW50OiBBbmdsZURhdGEgPSB7XG4gICAgICBkZWdyZWU6IGhvdXNlRGF0YS5hc2NlbmRhbnQsXG4gICAgICBzaWduOiBhc2NJbmZvLnNpZ24sXG4gICAgICBkZWdyZWVJblNpZ246IGFzY0luZm8uZGVncmVlSW5TaWduLFxuICAgICAgbWludXRlczogYXNjSW5mby5taW51dGVzLFxuICAgIH07XG5cbiAgICAvLyBQcm9jZXNzIE1pZGhlYXZlblxuICAgIGNvbnN0IG1jSW5mbyA9IGdldERlZ3JlZUluZm8oaG91c2VEYXRhLm1jKTtcbiAgICBjb25zdCBtaWRoZWF2ZW46IEFuZ2xlRGF0YSA9IHtcbiAgICAgIGRlZ3JlZTogaG91c2VEYXRhLm1jLFxuICAgICAgc2lnbjogbWNJbmZvLnNpZ24sXG4gICAgICBkZWdyZWVJblNpZ246IG1jSW5mby5kZWdyZWVJblNpZ24sXG4gICAgICBtaW51dGVzOiBtY0luZm8ubWludXRlcyxcbiAgICB9O1xuXG4gICAgLy8gQ2FsY3VsYXRlIHBsYW5ldCBwb3NpdGlvbnMgdXNpbmcgU3dpc3MgRXBoZW1lcmlzIGZvciBhY2N1cmFjeVxuICAgIGNvbnN0IHBsYW5ldEhvdXNlczogUmVjb3JkPHN0cmluZywgbnVtYmVyPiA9IHt9O1xuICAgIGNvbnN0IHBsYW5ldElkcyA9IFtcbiAgICAgIHN3aXNzZXBoLlNFX1NVTixcbiAgICAgIHN3aXNzZXBoLlNFX01PT04sXG4gICAgICBzd2lzc2VwaC5TRV9NRVJDVVJZLFxuICAgICAgc3dpc3NlcGguU0VfVkVOVVMsXG4gICAgICBzd2lzc2VwaC5TRV9NQVJTLFxuICAgICAgc3dpc3NlcGguU0VfSlVQSVRFUixcbiAgICAgIHN3aXNzZXBoLlNFX1NBVFVSTixcbiAgICAgIHN3aXNzZXBoLlNFX1VSQU5VUyxcbiAgICAgIHN3aXNzZXBoLlNFX05FUFRVTkUsXG4gICAgICBzd2lzc2VwaC5TRV9QTFVUTyxcbiAgICBdO1xuICAgIGNvbnN0IHBsYW5ldE5hbWVzID0gW1xuICAgICAgJ3N1bicsXG4gICAgICAnbW9vbicsXG4gICAgICAnbWVyY3VyeScsXG4gICAgICAndmVudXMnLFxuICAgICAgJ21hcnMnLFxuICAgICAgJ2p1cGl0ZXInLFxuICAgICAgJ3NhdHVybicsXG4gICAgICAndXJhbnVzJyxcbiAgICAgICduZXB0dW5lJyxcbiAgICAgICdwbHV0bycsXG4gICAgXTtcblxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcGxhbmV0SWRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCBwbGFuZXREYXRhID0gc3dpc3NlcGguc3dlX2NhbGNfdXQoanVsaWFuRGF5LCBwbGFuZXRJZHNbaV0sIHN3aXNzZXBoLlNFRkxHX1NQRUVEKTtcbiAgICAgIGlmIChwbGFuZXREYXRhICYmIHBsYW5ldERhdGEubG9uZ2l0dWRlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgY29uc3QgcGxhbmV0TG9uZ2l0dWRlID0gcGxhbmV0RGF0YS5sb25naXR1ZGU7XG4gICAgICAgIC8vIERldGVybWluZSB3aGljaCBob3VzZSB0aGUgcGxhbmV0IGlzIGluXG4gICAgICAgIGZvciAobGV0IGggPSAwOyBoIDwgMTI7IGgrKykge1xuICAgICAgICAgIGNvbnN0IGN1cnJlbnRDdXNwID0gaG91c2VzW2hdLmN1c3BEZWdyZWU7XG4gICAgICAgICAgY29uc3QgbmV4dEN1c3AgPSBob3VzZXNbKGggKyAxKSAlIDEyXS5jdXNwRGVncmVlO1xuXG4gICAgICAgICAgLy8gSGFuZGxlIGN1c3Agd3JhcC1hcm91bmQgYXQgMzYwIGRlZ3JlZXNcbiAgICAgICAgICBpZiAoY3VycmVudEN1c3AgPiBuZXh0Q3VzcCkge1xuICAgICAgICAgICAgLy8gSG91c2Ugc3BhbnMgMCBkZWdyZWVzXG4gICAgICAgICAgICBpZiAocGxhbmV0TG9uZ2l0dWRlID49IGN1cnJlbnRDdXNwIHx8IHBsYW5ldExvbmdpdHVkZSA8IG5leHRDdXNwKSB7XG4gICAgICAgICAgICAgIHBsYW5ldEhvdXNlc1twbGFuZXROYW1lc1tpXV0gPSBoICsgMTtcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGlmIChwbGFuZXRMb25naXR1ZGUgPj0gY3VycmVudEN1c3AgJiYgcGxhbmV0TG9uZ2l0dWRlIDwgbmV4dEN1c3ApIHtcbiAgICAgICAgICAgICAgcGxhbmV0SG91c2VzW3BsYW5ldE5hbWVzW2ldXSA9IGggKyAxO1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBDbG9zZSBTd2lzcyBFcGhlbWVyaXNcbiAgICBzd2lzc2VwaC5zd2VfY2xvc2UoKTtcblxuICAgIHJldHVybiB7XG4gICAgICBob3VzZXMsXG4gICAgICBhc2NlbmRhbnQsXG4gICAgICBtaWRoZWF2ZW4sXG4gICAgICBwbGFuZXRIb3VzZXMsXG4gICAgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBjYWxjdWxhdGluZyBob3VzZXMgd2l0aCBTd2lzcyBFcGhlbWVyaXM6JywgZXJyb3IpO1xuICAgIC8vIENsb3NlIFN3aXNzIEVwaGVtZXJpcyBvbiBlcnJvclxuICAgIGlmIChzd2lzc2VwaCAmJiBzd2lzc2VwaC5zd2VfY2xvc2UpIHtcbiAgICAgIHN3aXNzZXBoLnN3ZV9jbG9zZSgpO1xuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufTtcblxuY29uc3QgZ2VuZXJhdGVDYWNoZUtleSA9IChcbiAgYmlydGhEYXRlOiBzdHJpbmcsXG4gIGJpcnRoVGltZTogc3RyaW5nLFxuICBsYXRpdHVkZTogbnVtYmVyLFxuICBsb25naXR1ZGU6IG51bWJlcixcbik6IHN0cmluZyA9PiB7XG4gIGNvbnN0IGlucHV0ID0gYCR7YmlydGhEYXRlfVQke2JpcnRoVGltZX06MDBaXyR7bGF0aXR1ZGV9XyR7bG9uZ2l0dWRlfV9wbGFjaWR1c190cm9waWNhbF92Mi4xMC4wM2A7XG4gIHJldHVybiBjcnlwdG8uY3JlYXRlSGFzaCgnc2hhMjU2JykudXBkYXRlKGlucHV0KS5kaWdlc3QoJ2hleCcpO1xufTtcblxuY29uc3QgZ2V0Q2FjaGVkSG91c2VEYXRhID0gYXN5bmMgKGNhY2hlS2V5OiBzdHJpbmcpOiBQcm9taXNlPGFueSB8IG51bGw+ID0+IHtcbiAgY29uc3QgTkFUQUxfQ0hBUlRfVEFCTEVfTkFNRSA9IHByb2Nlc3MuZW52Lk5BVEFMX0NIQVJUX1RBQkxFX05BTUUhO1xuXG4gIHRyeSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQoXG4gICAgICBuZXcgR2V0Q29tbWFuZCh7XG4gICAgICAgIFRhYmxlTmFtZTogTkFUQUxfQ0hBUlRfVEFCTEVfTkFNRSxcbiAgICAgICAgS2V5OiB7XG4gICAgICAgICAgdXNlcklkOiBgQ0FDSEUjJHtjYWNoZUtleX1gLFxuICAgICAgICAgIGNoYXJ0VHlwZTogJ2hvdXNlX2NhY2hlJyxcbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICBpZiAocmVzdWx0Lkl0ZW0pIHtcbiAgICAgIGNvbnNvbGUuaW5mbygnQ2FjaGUgaGl0IGZvciBob3VzZSBjYWxjdWxhdGlvbnMnKTtcbiAgICAgIHJldHVybiByZXN1bHQuSXRlbS5ob3VzZURhdGE7XG4gICAgfVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHJldHJpZXZpbmcgY2FjaGVkIGRhdGE6JywgZXJyb3IpO1xuICB9XG5cbiAgcmV0dXJuIG51bGw7XG59O1xuXG5jb25zdCBzYXZlQ2FjaGVkSG91c2VEYXRhID0gYXN5bmMgKGNhY2hlS2V5OiBzdHJpbmcsIGhvdXNlRGF0YTogYW55KTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gIGNvbnN0IE5BVEFMX0NIQVJUX1RBQkxFX05BTUUgPSBwcm9jZXNzLmVudi5OQVRBTF9DSEFSVF9UQUJMRV9OQU1FITtcblxuICB0cnkge1xuICAgIGNvbnN0IHR0bCA9IE1hdGguZmxvb3IoRGF0ZS5ub3coKSAvIDEwMDApICsgMzAgKiAyNCAqIDYwICogNjA7IC8vIDMwIGRheXMgVFRMXG5cbiAgICBhd2FpdCBkb2NDbGllbnQuc2VuZChcbiAgICAgIG5ldyBQdXRDb21tYW5kKHtcbiAgICAgICAgVGFibGVOYW1lOiBOQVRBTF9DSEFSVF9UQUJMRV9OQU1FLFxuICAgICAgICBJdGVtOiB7XG4gICAgICAgICAgdXNlcklkOiBgQ0FDSEUjJHtjYWNoZUtleX1gLFxuICAgICAgICAgIGNoYXJ0VHlwZTogJ2hvdXNlX2NhY2hlJyxcbiAgICAgICAgICBob3VzZURhdGEsXG4gICAgICAgICAgdHRsLFxuICAgICAgICAgIGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBzYXZpbmcgY2FjaGVkIGRhdGE6JywgZXJyb3IpO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgaGFuZGxlciA9IGFzeW5jIChldmVudDogYW55KTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gIGNvbnN0IE5BVEFMX0NIQVJUX1RBQkxFX05BTUUgPSBwcm9jZXNzLmVudi5OQVRBTF9DSEFSVF9UQUJMRV9OQU1FITtcbiAgY29uc29sZS5pbmZvKCdSZWNlaXZlZCBldmVudDonLCBKU09OLnN0cmluZ2lmeShldmVudCwgbnVsbCwgMikpO1xuXG4gIGNvbnN0IHZhbGlkYXRlZEV2ZW50ID0gdmFsaWRhdGVFdmVudChldmVudCk7XG4gIGNvbnN0IHsgdXNlcklkLCBiaXJ0aERhdGUsIGxhdGl0dWRlLCBsb25naXR1ZGUsIGlhbmFUaW1lWm9uZSB9ID0gdmFsaWRhdGVkRXZlbnQ7XG5cbiAgLy8gQmlydGggdGltZSBpcyBub3cgcmVxdWlyZWQgcGVyIEtBTi03XG4gIGlmICghdmFsaWRhdGVkRXZlbnQuYmlydGhUaW1lKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdCaXJ0aCB0aW1lIGlzIHJlcXVpcmVkIGZvciBob3VzZSBjYWxjdWxhdGlvbnMnKTtcbiAgfVxuXG4gIGNvbnN0IGJpcnRoVGltZSA9IHZhbGlkYXRlZEV2ZW50LmJpcnRoVGltZTtcbiAgY29uc3QgaXNUaW1lRXN0aW1hdGVkID0gZmFsc2U7IC8vIFNpbmNlIGJpcnRoIHRpbWUgaXMgbm93IHJlcXVpcmVkXG5cbiAgLy8gQ3JlYXRlIGEgZGF0ZSBvYmplY3QgdGhhdCByZXByZXNlbnRzIHRoZSBsb2NhbCB0aW1lIGF0IHRoZSBiaXJ0aCBsb2NhdGlvblxuICBjb25zdCBiaXJ0aERhdGVUaW1lU3RyID0gYCR7YmlydGhEYXRlfVQke2JpcnRoVGltZX06MDBgO1xuICBjb25zdCBiaXJ0aERhdGVUaW1lID0gbmV3IERhdGUoYmlydGhEYXRlVGltZVN0cik7XG5cbiAgLy8gQ2FsY3VsYXRlIHRpbWV6b25lIG9mZnNldFxuICBjb25zdCB0aW1lem9uZU9mZnNldEluSG91cnMgPVxuICAgIG5ldyBEYXRlKFxuICAgICAgYmlydGhEYXRlVGltZS50b0xvY2FsZVN0cmluZygnZW4tVVMnLCB7IHRpbWVab25lOiBpYW5hVGltZVpvbmUgfSksXG4gICAgKS5nZXRUaW1lem9uZU9mZnNldCgpIC8gLTYwO1xuXG4gIHRyeSB7XG4gICAgLy8gQ2FsY3VsYXRlIHBsYW5ldGFyeSBwb3NpdGlvbnMgdXNpbmcgZXhpc3RpbmcgZXBoZW1lcmlzIGxpYnJhcnlcbiAgICBjb25zdCBjaGFydERhdGEgPSBnZXRBbGxQbGFuZXRzKGJpcnRoRGF0ZVRpbWUsIGxvbmdpdHVkZSwgbGF0aXR1ZGUsIHRpbWV6b25lT2Zmc2V0SW5Ib3Vycyk7XG5cbiAgICAvLyBFeHRyYWN0IHBsYW5ldGFyeSBwb3NpdGlvbnMgZnJvbSB0aGUgb2JzZXJ2ZWQgbmFtZXNwYWNlXG4gICAgY29uc3QgcGxhbmV0czogUmVjb3JkPHN0cmluZywgYW55PiA9IHt9O1xuICAgIGlmIChjaGFydERhdGEub2JzZXJ2ZWQpIHtcbiAgICAgIE9iamVjdC5rZXlzKGNoYXJ0RGF0YS5vYnNlcnZlZCkuZm9yRWFjaCgocGxhbmV0TmFtZSkgPT4ge1xuICAgICAgICBjb25zdCBwbGFuZXREYXRhID0gY2hhcnREYXRhLm9ic2VydmVkW3BsYW5ldE5hbWVdO1xuICAgICAgICBpZiAocGxhbmV0RGF0YSAmJiBwbGFuZXROYW1lICE9PSAnc2lyaXVzJykge1xuICAgICAgICAgIGNvbnN0IGxvbmdpdHVkZSA9IHBsYW5ldERhdGEuYXBwYXJlbnRMb25naXR1ZGVEZCB8fCAwO1xuICAgICAgICAgIC8vIENhbGN1bGF0ZSB6b2RpYWMgc2lnbiBpbmZvcm1hdGlvblxuICAgICAgICAgIGNvbnN0IG5vcm1hbGl6ZWRMb25naXR1ZGUgPSAoKGxvbmdpdHVkZSAlIDM2MCkgKyAzNjApICUgMzYwO1xuICAgICAgICAgIGNvbnN0IHNpZ25JbmRleCA9IE1hdGguZmxvb3Iobm9ybWFsaXplZExvbmdpdHVkZSAvIDMwKTtcbiAgICAgICAgICBjb25zdCBzaWduID0gWk9ESUFDX1NJR05TW3NpZ25JbmRleF07XG4gICAgICAgICAgY29uc3QgZGVncmVlSW5TaWduID0gbm9ybWFsaXplZExvbmdpdHVkZSAtIHNpZ25JbmRleCAqIDMwO1xuICAgICAgICAgIGNvbnN0IHdob2xlRGVncmVlcyA9IE1hdGguZmxvb3IoZGVncmVlSW5TaWduKTtcbiAgICAgICAgICBjb25zdCBtaW51dGVzID0gTWF0aC5yb3VuZCgoZGVncmVlSW5TaWduIC0gd2hvbGVEZWdyZWVzKSAqIDYwKTtcblxuICAgICAgICAgIHBsYW5ldHNbcGxhbmV0TmFtZV0gPSB7XG4gICAgICAgICAgICBsb25naXR1ZGU6IGxvbmdpdHVkZSxcbiAgICAgICAgICAgIGxvbmdpdHVkZURtczogYCR7d2hvbGVEZWdyZWVzLnRvU3RyaW5nKCkucGFkU3RhcnQoMiwgJzAnKX3CsCR7bWludXRlcy50b1N0cmluZygpLnBhZFN0YXJ0KDIsICcwJyl9JyAke3NpZ259YCxcbiAgICAgICAgICAgIGRpc3RhbmNlS206IHBsYW5ldERhdGEuZ2VvY2VudHJpY0Rpc3RhbmNlS20gfHwgMCxcbiAgICAgICAgICAgIG5hbWU6IHBsYW5ldERhdGEubmFtZSB8fCBwbGFuZXROYW1lLFxuICAgICAgICAgICAgc2lnbjogc2lnbixcbiAgICAgICAgICAgIGRlZ3JlZUluU2lnbjogd2hvbGVEZWdyZWVzLFxuICAgICAgICAgICAgbWludXRlczogbWludXRlcyxcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBDaGVjayBjYWNoZSBmb3IgaG91c2UgY2FsY3VsYXRpb25zXG4gICAgY29uc3QgY2FjaGVLZXkgPSBnZW5lcmF0ZUNhY2hlS2V5KGJpcnRoRGF0ZSwgYmlydGhUaW1lLCBsYXRpdHVkZSwgbG9uZ2l0dWRlKTtcbiAgICBsZXQgaG91c2VEYXRhID0gYXdhaXQgZ2V0Q2FjaGVkSG91c2VEYXRhKGNhY2hlS2V5KTtcblxuICAgIGlmICghaG91c2VEYXRhKSB7XG4gICAgICAvLyBDYWxjdWxhdGUgaG91c2VzIHVzaW5nIFN3aXNzIEVwaGVtZXJpc1xuICAgICAgaG91c2VEYXRhID0gYXdhaXQgY2FsY3VsYXRlSG91c2VzV2l0aFN3aXNzZXBoKGJpcnRoRGF0ZVRpbWUsIGxhdGl0dWRlLCBsb25naXR1ZGUpO1xuXG4gICAgICBpZiAoaG91c2VEYXRhKSB7XG4gICAgICAgIC8vIFNhdmUgdG8gY2FjaGVcbiAgICAgICAgYXdhaXQgc2F2ZUNhY2hlZEhvdXNlRGF0YShjYWNoZUtleSwgaG91c2VEYXRhKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBQcmVwYXJlIHRoZSBpdGVtIHRvIHN0b3JlXG4gICAgY29uc3QgaXRlbTogYW55ID0ge1xuICAgICAgdXNlcklkLFxuICAgICAgY2hhcnRUeXBlOiAnbmF0YWwnLFxuICAgICAgY3JlYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICBpc1RpbWVFc3RpbWF0ZWQsXG4gICAgICBiaXJ0aEluZm86IHtcbiAgICAgICAgLi4udmFsaWRhdGVkRXZlbnQsXG4gICAgICAgIGJpcnRoVGltZSxcbiAgICAgIH0sXG4gICAgICBwbGFuZXRzLFxuICAgICAgbWV0YWRhdGE6IHtcbiAgICAgICAgY2FsY3VsYXRpb25UaW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgYWxnb1ZlcnNpb246ICcyLjAuMCcsXG4gICAgICAgIGVwaGVtZXJpc1ZlcnNpb246ICcyLjEwLjAzJyxcbiAgICAgICAgc3dldGVzdFZlcnNpb246ICcyLjEwLjAzJyxcbiAgICAgICAgaW5wdXRIYXNoOiBjYWNoZUtleSxcbiAgICAgIH0sXG4gICAgfTtcblxuICAgIC8vIEFkZCBob3VzZSBkYXRhIGlmIGF2YWlsYWJsZVxuICAgIGlmIChob3VzZURhdGEpIHtcbiAgICAgIGl0ZW0uaG91c2VzID0ge1xuICAgICAgICBzdGF0dXM6ICdzdWNjZXNzJyxcbiAgICAgICAgZGF0YTogaG91c2VEYXRhLmhvdXNlcyxcbiAgICAgIH07XG4gICAgICBpdGVtLmFzY2VuZGFudCA9IGhvdXNlRGF0YS5hc2NlbmRhbnQ7XG4gICAgICBpdGVtLm1pZGhlYXZlbiA9IGhvdXNlRGF0YS5taWRoZWF2ZW47XG4gICAgICBpdGVtLnBsYW5ldEhvdXNlcyA9IGhvdXNlRGF0YS5wbGFuZXRIb3VzZXM7XG4gICAgfSBlbHNlIHtcbiAgICAgIGl0ZW0uaG91c2VzID0ge1xuICAgICAgICBzdGF0dXM6ICdmYWlsZWQnLFxuICAgICAgICBlcnJvcjogJ0hvdXNlIGNhbGN1bGF0aW9ucyB1bmF2YWlsYWJsZScsXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIFN0b3JlIHRoZSBuYXRhbCBjaGFydFxuICAgIGF3YWl0IGRvY0NsaWVudC5zZW5kKFxuICAgICAgbmV3IFB1dENvbW1hbmQoe1xuICAgICAgICBUYWJsZU5hbWU6IE5BVEFMX0NIQVJUX1RBQkxFX05BTUUsXG4gICAgICAgIEl0ZW06IGl0ZW0sXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgY29uc29sZS5pbmZvKGBTdWNjZXNzZnVsbHkgZ2VuZXJhdGVkIGFuZCBzdG9yZWQgbmF0YWwgY2hhcnQgZm9yIHVzZXJJZDogJHt1c2VySWR9YCk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgY2FsY3VsYXRpbmcgb3Igc3RvcmluZyBuYXRhbCBjaGFydDonLCBlcnJvcik7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn07XG4iXX0=