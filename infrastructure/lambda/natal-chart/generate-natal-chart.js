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
    const timezoneOffsetInHours = new Date(birthDateTime.toLocaleString('en-US', { timeZone: ianaTimeZone })).getTimezoneOffset() / -60;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGUtbmF0YWwtY2hhcnQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJnZW5lcmF0ZS1uYXRhbC1jaGFydC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLDhEQUEwRDtBQUMxRCx3REFBdUY7QUFDdkYseUNBQTBDO0FBQzFDLCtDQUFpQztBQUVqQyxNQUFNLFlBQVksR0FBRyxJQUFJLGdDQUFjLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDNUMsTUFBTSxTQUFTLEdBQUcscUNBQXNCLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO0FBRTVELHdDQUF3QztBQUN4QyxJQUFJLFFBQWEsQ0FBQztBQUNsQixJQUFJLENBQUM7SUFDSCxRQUFRLEdBQUcsT0FBTyxDQUFDLG1DQUFtQyxDQUFDLENBQUM7QUFDMUQsQ0FBQztBQUFDLE9BQU8sTUFBTSxFQUFFLENBQUM7SUFDaEIsT0FBTyxDQUFDLElBQUksQ0FBQyw4RUFBOEUsQ0FBQyxDQUFDO0lBQzdGLElBQUksQ0FBQztRQUNILFFBQVEsR0FBRyxPQUFPLENBQUMsVUFBVSxDQUFDLENBQUM7SUFDakMsQ0FBQztJQUFDLE9BQU8sRUFBRSxFQUFFLENBQUM7UUFDWixPQUFPLENBQUMsS0FBSyxDQUFDLCtCQUErQixDQUFDLENBQUM7SUFDakQsQ0FBQztBQUNILENBQUM7QUEwQkQsTUFBTSxZQUFZLEdBQUc7SUFDbkIsT0FBTztJQUNQLFFBQVE7SUFDUixRQUFRO0lBQ1IsUUFBUTtJQUNSLEtBQUs7SUFDTCxPQUFPO0lBQ1AsT0FBTztJQUNQLFNBQVM7SUFDVCxhQUFhO0lBQ2IsV0FBVztJQUNYLFVBQVU7SUFDVixRQUFRO0NBQ1QsQ0FBQztBQUVGLE1BQU0sYUFBYSxHQUFHLENBQUMsS0FBVSxFQUFtQixFQUFFO0lBQ3BELElBQ0UsQ0FBQyxLQUFLLENBQUMsTUFBTTtRQUNiLENBQUMsS0FBSyxDQUFDLFNBQVM7UUFDaEIsQ0FBQyxLQUFL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QUFDLFNBQVMsQ0FBQztZQUNyQyxJQUFJLENBQUMsU0FBUyxHQUFHLFNBQVMsQ0FBQyxTQUFTLENBQUM7WUFDckMsSUFBSSxDQUFDLFlBQVksR0FBRyxTQUFTLENBQUMsWUFBWSxDQUFDO1FBQzdDLENBQUM7YUFBTSxDQUFDO1lBQ04sSUFBSSxDQUFDLE1BQU0sR0FBRztnQkFDWixNQUFNLEVBQUUsUUFBUTtnQkFDaEIsS0FBSyxFQUFFLGdDQUFnQzthQUN4QyxDQUFDO1FBQ0osQ0FBQztRQUVELHdCQUF3QjtRQUN4QixNQUFNLFNBQVMsQ0FBQyxJQUFJLENBQ2xCLElBQUkseUJBQVUsQ0FBQztZQUNiLFNBQVMsRUFBRSxzQkFBc0I7WUFDakMsSUFBSSxFQUFFLElBQUk7U0FDWCxDQUFDLENBQ0gsQ0FBQztRQUVGLE9BQU8sQ0FBQyxHQUFHLENBQUMsNkRBQTZELE1BQU0sRUFBRSxDQUFDLENBQUM7SUFDckYsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLDJDQUEyQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ2xFLE1BQU0sS0FBSyxDQUFDO0lBQ2QsQ0FBQztBQUNILENBQUMsQ0FBQztBQTVHVyxRQUFBLE9BQU8sV0E0R2xCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgRHluYW1vREJDbGllbnQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtZHluYW1vZGInO1xuaW1wb3J0IHsgRHluYW1vREJEb2N1bWVudENsaWVudCwgUHV0Q29tbWFuZCwgR2V0Q29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYic7XG5pbXBvcnQgeyBnZXRBbGxQbGFuZXRzIH0gZnJvbSAnZXBoZW1lcmlzJztcbmltcG9ydCAqIGFzIGNyeXB0byBmcm9tICdjcnlwdG8nO1xuXG5jb25zdCBkeW5hbW9DbGllbnQgPSBuZXcgRHluYW1vREJDbGllbnQoe30pO1xuY29uc3QgZG9jQ2xpZW50ID0gRHluYW1vREJEb2N1bWVudENsaWVudC5mcm9tKGR5bmFtb0NsaWVudCk7XG5cbi8vIEltcG9ydCBzd2lzc2VwaCBmcm9tIHRoZSBMYW1iZGEgTGF5ZXJcbmxldCBzd2lzc2VwaDogYW55O1xudHJ5IHtcbiAgc3dpc3NlcGggPSByZXF1aXJlKCcvb3B0L25vZGVqcy9ub2RlX21vZHVsZXMvc3dpc3NlcGgnKTtcbn0gY2F0Y2ggKF9lcnJvcikge1xuICBjb25zb2xlLndhcm4oJ1N3aXNzIEVwaGVtZXJpcyBub3QgYXZhaWxhYmxlIGZyb20gbGF5ZXIsIGZhbGxpbmcgYmFjayB0byBsb2NhbCBpZiBhdmFpbGFibGUnKTtcbiAgdHJ5IHtcbiAgICBzd2lzc2VwaCA9IHJlcXVpcmUoJ3N3aXNzZXBoJyk7XG4gIH0gY2F0Y2ggKF9lKSB7XG4gICAgY29uc29sZS5lcnJvcignU3dpc3MgRXBoZW1lcmlzIG5vdCBhdmFpbGFibGUnKTtcbiAgfVxufVxuXG5pbnRlcmZhY2UgTmF0YWxDaGFydEV2ZW50IHtcbiAgdXNlcklkOiBzdHJpbmc7XG4gIGJpcnRoRGF0ZTogc3RyaW5nOyAvLyBZWVlZLU1NLUREXG4gIGJpcnRoVGltZT86IHN0cmluZzsgLy8gSEg6TU1cbiAgbGF0aXR1ZGU6IG51bWJlcjtcbiAgbG9uZ2l0dWRlOiBudW1iZXI7XG4gIGlhbmFUaW1lWm9uZTogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSG91c2VEYXRhIHtcbiAgaG91c2VOdW1iZXI6IG51bWJlcjtcbiAgY3VzcERlZ3JlZTogbnVtYmVyO1xuICBjdXNwU2lnbjogc3RyaW5nO1xuICBjdXNwRGVncmVlSW5TaWduOiBudW1iZXI7XG4gIGN1c3BNaW51dGVzOiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBBbmdsZURhdGEge1xuICBkZWdyZWU6IG51bWJlcjtcbiAgc2lnbjogc3RyaW5nO1xuICBkZWdyZWVJblNpZ246IG51bWJlcjtcbiAgbWludXRlczogbnVtYmVyO1xufVxuXG5jb25zdCBaT0RJQUNfU0lHTlMgPSBbXG4gICdBcmllcycsXG4gICdUYXVydXMnLFxuICAnR2VtaW5pJyxcbiAgJ0NhbmNlcicsXG4gICdMZW8nLFxuICAnVmlyZ28nLFxuICAnTGlicmEnLFxuICAnU2NvcnBpbycsXG4gICdTYWdpdHRhcml1cycsXG4gICdDYXByaWNvcm4nLFxuICAnQXF1YXJpdXMnLFxuICAnUGlzY2VzJyxcbl07XG5cbmNvbnN0IHZhbGlkYXRlRXZlbnQgPSAoZXZlbnQ6IGFueSk6IE5hdGFsQ2hhcnRFdmVudCA9PiB7XG4gIGlmIChcbiAgICAhZXZlbnQudXNlcklkIHx8XG4gICAgIWV2ZW50LmJpcnRoRGF0ZSB8fFxuICAgICFldmVudC5sYXRpdHVkZSB8fFxuICAgICFldmVudC5sb25naXR1ZGUgfHxcbiAgICAhZXZlbnQuaWFuYVRpbWVab25lXG4gICkge1xuICAgIHRocm93IG5ldyBFcnJvcignTWlzc2luZyByZXF1aXJlZCBldmVudCBwcm9wZXJ0aWVzJyk7XG4gIH1cblxuICAvLyBWYWxpZGF0ZSBjb29yZGluYXRlc1xuICBpZiAoZXZlbnQubGF0aXR1ZGUgPCAtOTAgfHwgZXZlbnQubGF0aXR1ZGUgPiA5MCkge1xuICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBsYXRpdHVkZTogbXVzdCBiZSBiZXR3ZWVuIC05MCBhbmQgOTAnKTtcbiAgfVxuICBpZiAoZXZlbnQubG9uZ2l0dWRlIDwgLTE4MCB8fCBldmVudC5sb25naXR1ZGUgPiAxODApIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgbG9uZ2l0dWRlOiBtdXN0IGJlIGJldHdlZW4gLTE4MCBhbmQgMTgwJyk7XG4gIH1cblxuICByZXR1cm4gZXZlbnQ7XG59O1xuXG5jb25zdCBnZXREZWdyZWVJbmZvID0gKGRlZ3JlZTogbnVtYmVyKTogeyBzaWduOiBzdHJpbmc7IGRlZ3JlZUluU2lnbjogbnVtYmVyOyBtaW51dGVzOiBudW1iZXIgfSA9PiB7XG4gIGNvbnN0IG5vcm1hbGl6ZWREZWdyZWUgPSBkZWdyZWUgJSAzNjA7XG4gIGNvbnN0IHNpZ25JbmRleCA9IE1hdGguZmxvb3Iobm9ybWFsaXplZERlZ3JlZSAvIDMwKTtcbiAgY29uc3QgZGVncmVlSW5TaWduID0gbm9ybWFsaXplZERlZ3JlZSAlIDMwO1xuICBjb25zdCB3aG9sZURlZ3JlZXMgPSBNYXRoLmZsb29yKGRlZ3JlZUluU2lnbik7XG4gIGNvbnN0IG1pbnV0ZXMgPSBNYXRoLnJvdW5kKChkZWdyZWVJblNpZ24gLSB3aG9sZURlZ3JlZXMpICogNjApO1xuXG4gIHJldHVybiB7XG4gICAgc2lnbjogWk9ESUFDX1NJR05TW3NpZ25JbmRleF0sXG4gICAgZGVncmVlSW5TaWduOiB3aG9sZURlZ3JlZXMsXG4gICAgbWludXRlcyxcbiAgfTtcbn07XG5cbmNvbnN0IGNhbGN1bGF0ZUhvdXNlc1dpdGhTd2lzc2VwaCA9IGFzeW5jIChcbiAgYmlydGhEYXRlVGltZTogRGF0ZSxcbiAgbGF0aXR1ZGU6IG51bWJlcixcbiAgbG9uZ2l0dWRlOiBudW1iZXIsXG4pOiBQcm9taXNlPHtcbiAgaG91c2VzOiBIb3VzZURhdGFbXTtcbiAgYXNjZW5kYW50OiBBbmdsZURhdGE7XG4gIG1pZGhlYXZlbjogQW5nbGVEYXRhO1xuICBwbGFuZXRIb3VzZXM6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG59IHwgbnVsbD4gPT4ge1xuICBpZiAoIXN3aXNzZXBoKSB7XG4gICAgY29uc29sZS53YXJuKCdTd2lzcyBFcGhlbWVyaXMgbm90IGF2YWlsYWJsZSwgc2tpcHBpbmcgaG91c2UgY2FsY3VsYXRpb25zJyk7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICB0cnkge1xuICAgIC8vIFNldCBlcGhlbWVyaXMgcGF0aCBpZiBwcm92aWRlZFxuICAgIGNvbnN0IGVwaGVQYXRoID0gcHJvY2Vzcy5lbnYuRVBIRU1FUklTX1BBVEggfHwgJy9vcHQvbm9kZWpzL25vZGVfbW9kdWxlcy9zd2lzc2VwaC9lcGhlJztcbiAgICBzd2lzc2VwaC5zd2Vfc2V0X2VwaGVfcGF0aChlcGhlUGF0aCk7XG5cbiAgICAvLyBDYWxjdWxhdGUgSnVsaWFuIERheVxuICAgIGNvbnN0IHllYXIgPSBiaXJ0aERhdGVUaW1lLmdldFVUQ0Z1bGxZZWFyKCk7XG4gICAgY29uc3QgbW9udGggPSBiaXJ0aERhdGVUaW1lLmdldFVUQ01vbnRoKCkgKyAxO1xuICAgIGNvbnN0IGRheSA9IGJpcnRoRGF0ZVRpbWUuZ2V0VVRDRGF0ZSgpO1xuICAgIGNvbnN0IGhvdXIgPVxuICAgICAgYmlydGhEYXRlVGltZS5nZXRVVENIb3VycygpICtcbiAgICAgIGJpcnRoRGF0ZVRpbWUuZ2V0VVRDTWludXRlcygpIC8gNjAgK1xuICAgICAgYmlydGhEYXRlVGltZS5nZXRVVENTZWNvbmRzKCkgLyAzNjAwO1xuXG4gICAgY29uc3QganVsaWFuRGF5ID0gc3dpc3NlcGguc3dlX2p1bGRheSh5ZWFyLCBtb250aCwgZGF5LCBob3VyLCBzd2lzc2VwaC5TRV9HUkVHX0NBTCk7XG5cbiAgICAvLyBDYWxjdWxhdGUgaG91c2VzIHVzaW5nIFBsYWNpZHVzIHN5c3RlbVxuICAgIGNvbnN0IGhvdXNlRGF0YSA9IHN3aXNzZXBoLnN3ZV9ob3VzZXMoXG4gICAgICBqdWxpYW5EYXksXG4gICAgICBsYXRpdHVkZSxcbiAgICAgIGxvbmdpdHVkZSxcbiAgICAgICdQJywgLy8gUGxhY2lkdXMgaG91c2Ugc3lzdGVtXG4gICAgKTtcblxuICAgIGlmICghaG91c2VEYXRhIHx8ICFob3VzZURhdGEuaG91c2UgfHwgIWhvdXNlRGF0YS5hc2NlbmRhbnQgfHwgIWhvdXNlRGF0YS5tYykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdGYWlsZWQgdG8gY2FsY3VsYXRlIGhvdXNlcycpO1xuICAgIH1cblxuICAgIC8vIFByb2Nlc3MgaG91c2UgY3VzcHNcbiAgICBjb25zdCBob3VzZXM6IEhvdXNlRGF0YVtdID0gW107XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCAxMjsgaSsrKSB7XG4gICAgICBjb25zdCBjdXNwRGVncmVlID0gaG91c2VEYXRhLmhvdXNlW2ldO1xuICAgICAgY29uc3QgZGVncmVlSW5mbyA9IGdldERlZ3JlZUluZm8oY3VzcERlZ3JlZSk7XG4gICAgICBob3VzZXMucHVzaCh7XG4gICAgICAgIGhvdXNlTnVtYmVyOiBpICsgMSxcbiAgICAgICAgY3VzcERlZ3JlZSxcbiAgICAgICAgY3VzcFNpZ246IGRlZ3JlZUluZm8uc2lnbixcbiAgICAgICAgY3VzcERlZ3JlZUluU2lnbjogZGVncmVlSW5mby5kZWdyZWVJblNpZ24sXG4gICAgICAgIGN1c3BNaW51dGVzOiBkZWdyZWVJbmZvLm1pbnV0ZXMsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBQcm9jZXNzIEFzY2VuZGFudFxuICAgIGNvbnN0IGFzY0luZm8gPSBnZXREZWdyZWVJbmZvKGhvdXNlRGF0YS5hc2NlbmRhbnQpO1xuICAgIGNvbnN0IGFzY2VuZGFudDogQW5nbGVEYXRhID0ge1xuICAgICAgZGVncmVlOiBob3VzZURhdGEuYXNjZW5kYW50LFxuICAgICAgc2lnbjogYXNjSW5mby5zaWduLFxuICAgICAgZGVncmVlSW5TaWduOiBhc2NJbmZvLmRlZ3JlZUluU2lnbixcbiAgICAgIG1pbnV0ZXM6IGFzY0luZm8ubWludXRlcyxcbiAgICB9O1xuXG4gICAgLy8gUHJvY2VzcyBNaWRoZWF2ZW5cbiAgICBjb25zdCBtY0luZm8gPSBnZXREZWdyZWVJbmZvKGhvdXNlRGF0YS5tYyk7XG4gICAgY29uc3QgbWlkaGVhdmVuOiBBbmdsZURhdGEgPSB7XG4gICAgICBkZWdyZWU6IGhvdXNlRGF0YS5tYyxcbiAgICAgIHNpZ246IG1jSW5mby5zaWduLFxuICAgICAgZGVncmVlSW5TaWduOiBtY0luZm8uZGVncmVlSW5TaWduLFxuICAgICAgbWludXRlczogbWNJbmZvLm1pbnV0ZXMsXG4gICAgfTtcblxuICAgIC8vIENhbGN1bGF0ZSBwbGFuZXQgcG9zaXRpb25zIHVzaW5nIFN3aXNzIEVwaGVtZXJpcyBmb3IgYWNjdXJhY3lcbiAgICBjb25zdCBwbGFuZXRIb3VzZXM6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7fTtcbiAgICBjb25zdCBwbGFuZXRJZHMgPSBbXG4gICAgICBzd2lzc2VwaC5TRV9TVU4sXG4gICAgICBzd2lzc2VwaC5TRV9NT09OLFxuICAgICAgc3dpc3NlcGguU0VfTUVSQ1VSWSxcbiAgICAgIHN3aXNzZXBoLlNFX1ZFTlVTLFxuICAgICAgc3dpc3NlcGguU0VfTUFSUyxcbiAgICAgIHN3aXNzZXBoLlNFX0pVUElURVIsXG4gICAgICBzd2lzc2VwaC5TRV9TQVRVUk4sXG4gICAgICBzd2lzc2VwaC5TRV9VUkFOVVMsXG4gICAgICBzd2lzc2VwaC5TRV9ORVBUVU5FLFxuICAgICAgc3dpc3NlcGguU0VfUExVVE8sXG4gICAgXTtcbiAgICBjb25zdCBwbGFuZXROYW1lcyA9IFtcbiAgICAgICdzdW4nLFxuICAgICAgJ21vb24nLFxuICAgICAgJ21lcmN1cnknLFxuICAgICAgJ3ZlbnVzJyxcbiAgICAgICdtYXJzJyxcbiAgICAgICdqdXBpdGVyJyxcbiAgICAgICdzYXR1cm4nLFxuICAgICAgJ3VyYW51cycsXG4gICAgICAnbmVwdHVuZScsXG4gICAgICAncGx1dG8nLFxuICAgIF07XG5cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHBsYW5ldElkcy5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3QgcGxhbmV0RGF0YSA9IHN3aXNzZXBoLnN3ZV9jYWxjX3V0KGp1bGlhbkRheSwgcGxhbmV0SWRzW2ldLCBzd2lzc2VwaC5TRUZMR19TUEVFRCk7XG4gICAgICBpZiAocGxhbmV0RGF0YSAmJiBwbGFuZXREYXRhLmxvbmdpdHVkZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGNvbnN0IHBsYW5ldExvbmdpdHVkZSA9IHBsYW5ldERhdGEubG9uZ2l0dWRlO1xuICAgICAgICAvLyBEZXRlcm1pbmUgd2hpY2ggaG91c2UgdGhlIHBsYW5ldCBpcyBpblxuICAgICAgICBmb3IgKGxldCBoID0gMDsgaCA8IDEyOyBoKyspIHtcbiAgICAgICAgICBjb25zdCBjdXJyZW50Q3VzcCA9IGhvdXNlc1toXS5jdXNwRGVncmVlO1xuICAgICAgICAgIGNvbnN0IG5leHRDdXNwID0gaG91c2VzWyhoICsgMSkgJSAxMl0uY3VzcERlZ3JlZTtcblxuICAgICAgICAgIC8vIEhhbmRsZSBjdXNwIHdyYXAtYXJvdW5kIGF0IDM2MCBkZWdyZWVzXG4gICAgICAgICAgaWYgKGN1cnJlbnRDdXNwID4gbmV4dEN1c3ApIHtcbiAgICAgICAgICAgIC8vIEhvdXNlIHNwYW5zIDAgZGVncmVlc1xuICAgICAgICAgICAgaWYgKHBsYW5ldExvbmdpdHVkZSA+PSBjdXJyZW50Q3VzcCB8fCBwbGFuZXRMb25naXR1ZGUgPCBuZXh0Q3VzcCkge1xuICAgICAgICAgICAgICBwbGFuZXRIb3VzZXNbcGxhbmV0TmFtZXNbaV1dID0gaCArIDE7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpZiAocGxhbmV0TG9uZ2l0dWRlID49IGN1cnJlbnRDdXNwICYmIHBsYW5ldExvbmdpdHVkZSA8IG5leHRDdXNwKSB7XG4gICAgICAgICAgICAgIHBsYW5ldEhvdXNlc1twbGFuZXROYW1lc1tpXV0gPSBoICsgMTtcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gQ2xvc2UgU3dpc3MgRXBoZW1lcmlzXG4gICAgc3dpc3NlcGguc3dlX2Nsb3NlKCk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgaG91c2VzLFxuICAgICAgYXNjZW5kYW50LFxuICAgICAgbWlkaGVhdmVuLFxuICAgICAgcGxhbmV0SG91c2VzLFxuICAgIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgY2FsY3VsYXRpbmcgaG91c2VzIHdpdGggU3dpc3MgRXBoZW1lcmlzOicsIGVycm9yKTtcbiAgICAvLyBDbG9zZSBTd2lzcyBFcGhlbWVyaXMgb24gZXJyb3JcbiAgICBpZiAoc3dpc3NlcGggJiYgc3dpc3NlcGguc3dlX2Nsb3NlKSB7XG4gICAgICBzd2lzc2VwaC5zd2VfY2xvc2UoKTtcbiAgICB9XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn07XG5cbmNvbnN0IGdlbmVyYXRlQ2FjaGVLZXkgPSAoXG4gIGJpcnRoRGF0ZTogc3RyaW5nLFxuICBiaXJ0aFRpbWU6IHN0cmluZyxcbiAgbGF0aXR1ZGU6IG51bWJlcixcbiAgbG9uZ2l0dWRlOiBudW1iZXIsXG4pOiBzdHJpbmcgPT4ge1xuICBjb25zdCBpbnB1dCA9IGAke2JpcnRoRGF0ZX1UJHtiaXJ0aFRpbWV9OjAwWl8ke2xhdGl0dWRlfV8ke2xvbmdpdHVkZX1fcGxhY2lkdXNfdHJvcGljYWxfdjIuMTAuMDNgO1xuICByZXR1cm4gY3J5cHRvLmNyZWF0ZUhhc2goJ3NoYTI1NicpLnVwZGF0ZShpbnB1dCkuZGlnZXN0KCdoZXgnKTtcbn07XG5cbmNvbnN0IGdldENhY2hlZEhvdXNlRGF0YSA9IGFzeW5jIChjYWNoZUtleTogc3RyaW5nKTogUHJvbWlzZTxhbnkgfCBudWxsPiA9PiB7XG4gIGNvbnN0IE5BVEFMX0NIQVJUX1RBQkxFX05BTUUgPSBwcm9jZXNzLmVudi5OQVRBTF9DSEFSVF9UQUJMRV9OQU1FITtcblxuICB0cnkge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKFxuICAgICAgbmV3IEdldENvbW1hbmQoe1xuICAgICAgICBUYWJsZU5hbWU6IE5BVEFMX0NIQVJUX1RBQkxFX05BTUUsXG4gICAgICAgIEtleToge1xuICAgICAgICAgIHVzZXJJZDogYENBQ0hFIyR7Y2FjaGVLZXl9YCxcbiAgICAgICAgICBjaGFydFR5cGU6ICdob3VzZV9jYWNoZScsXG4gICAgICAgIH0sXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgaWYgKHJlc3VsdC5JdGVtKSB7XG4gICAgICBjb25zb2xlLmxvZygnQ2FjaGUgaGl0IGZvciBob3VzZSBjYWxjdWxhdGlvbnMnKTtcbiAgICAgIHJldHVybiByZXN1bHQuSXRlbS5ob3VzZURhdGE7XG4gICAgfVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHJldHJpZXZpbmcgY2FjaGVkIGRhdGE6JywgZXJyb3IpO1xuICB9XG5cbiAgcmV0dXJuIG51bGw7XG59O1xuXG5jb25zdCBzYXZlQ2FjaGVkSG91c2VEYXRhID0gYXN5bmMgKGNhY2hlS2V5OiBzdHJpbmcsIGhvdXNlRGF0YTogYW55KTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gIGNvbnN0IE5BVEFMX0NIQVJUX1RBQkxFX05BTUUgPSBwcm9jZXNzLmVudi5OQVRBTF9DSEFSVF9UQUJMRV9OQU1FITtcblxuICB0cnkge1xuICAgIGNvbnN0IHR0bCA9IE1hdGguZmxvb3IoRGF0ZS5ub3coKSAvIDEwMDApICsgMzAgKiAyNCAqIDYwICogNjA7IC8vIDMwIGRheXMgVFRMXG5cbiAgICBhd2FpdCBkb2NDbGllbnQuc2VuZChcbiAgICAgIG5ldyBQdXRDb21tYW5kKHtcbiAgICAgICAgVGFibGVOYW1lOiBOQVRBTF9DSEFSVF9UQUJMRV9OQU1FLFxuICAgICAgICBJdGVtOiB7XG4gICAgICAgICAgdXNlcklkOiBgQ0FDSEUjJHtjYWNoZUtleX1gLFxuICAgICAgICAgIGNoYXJ0VHlwZTogJ2hvdXNlX2NhY2hlJyxcbiAgICAgICAgICBob3VzZURhdGEsXG4gICAgICAgICAgdHRsLFxuICAgICAgICAgIGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBzYXZpbmcgY2FjaGVkIGRhdGE6JywgZXJyb3IpO1xuICB9XG59O1xuXG5leHBvcnQgY29uc3QgaGFuZGxlciA9IGFzeW5jIChldmVudDogYW55KTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gIGNvbnN0IE5BVEFMX0NIQVJUX1RBQkxFX05BTUUgPSBwcm9jZXNzLmVudi5OQVRBTF9DSEFSVF9UQUJMRV9OQU1FITtcbiAgY29uc29sZS5sb2coJ1JlY2VpdmVkIGV2ZW50OicsIEpTT04uc3RyaW5naWZ5KGV2ZW50LCBudWxsLCAyKSk7XG5cbiAgY29uc3QgdmFsaWRhdGVkRXZlbnQgPSB2YWxpZGF0ZUV2ZW50KGV2ZW50KTtcbiAgY29uc3QgeyB1c2VySWQsIGJpcnRoRGF0ZSwgbGF0aXR1ZGUsIGxvbmdpdHVkZSwgaWFuYVRpbWVab25lIH0gPSB2YWxpZGF0ZWRFdmVudDtcblxuICAvLyBCaXJ0aCB0aW1lIGlzIG5vdyByZXF1aXJlZCBwZXIgS0FOLTdcbiAgaWYgKCF2YWxpZGF0ZWRFdmVudC5iaXJ0aFRpbWUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0JpcnRoIHRpbWUgaXMgcmVxdWlyZWQgZm9yIGhvdXNlIGNhbGN1bGF0aW9ucycpO1xuICB9XG5cbiAgY29uc3QgYmlydGhUaW1lID0gdmFsaWRhdGVkRXZlbnQuYmlydGhUaW1lO1xuICBjb25zdCBpc1RpbWVFc3RpbWF0ZWQgPSBmYWxzZTsgLy8gU2luY2UgYmlydGggdGltZSBpcyBub3cgcmVxdWlyZWRcblxuICAvLyBDcmVhdGUgYSBkYXRlIG9iamVjdCB0aGF0IHJlcHJlc2VudHMgdGhlIGxvY2FsIHRpbWUgYXQgdGhlIGJpcnRoIGxvY2F0aW9uXG4gIGNvbnN0IGJpcnRoRGF0ZVRpbWVTdHIgPSBgJHtiaXJ0aERhdGV9VCR7YmlydGhUaW1lfTowMGA7XG4gIGNvbnN0IGJpcnRoRGF0ZVRpbWUgPSBuZXcgRGF0ZShiaXJ0aERhdGVUaW1lU3RyKTtcblxuICAvLyBDYWxjdWxhdGUgdGltZXpvbmUgb2Zmc2V0XG4gIGNvbnN0IHRpbWV6b25lT2Zmc2V0SW5Ib3VycyA9XG4gICAgbmV3IERhdGUoXG4gICAgICBiaXJ0aERhdGVUaW1lLnRvTG9jYWxlU3RyaW5nKCdlbi1VUycsIHsgdGltZVpvbmU6IGlhbmFUaW1lWm9uZSB9KSxcbiAgICApLmdldFRpbWV6b25lT2Zmc2V0KCkgLyAtNjA7XG5cbiAgdHJ5IHtcbiAgICAvLyBDYWxjdWxhdGUgcGxhbmV0YXJ5IHBvc2l0aW9ucyB1c2luZyBleGlzdGluZyBlcGhlbWVyaXMgbGlicmFyeVxuICAgIGNvbnN0IGNoYXJ0RGF0YSA9IGdldEFsbFBsYW5ldHMoYmlydGhEYXRlVGltZSwgbG9uZ2l0dWRlLCBsYXRpdHVkZSwgdGltZXpvbmVPZmZzZXRJbkhvdXJzKTtcblxuICAgIC8vIEV4dHJhY3QgcGxhbmV0YXJ5IHBvc2l0aW9ucyBmcm9tIHRoZSBvYnNlcnZlZCBuYW1lc3BhY2VcbiAgICBjb25zdCBwbGFuZXRzOiBSZWNvcmQ8c3RyaW5nLCBhbnk+ID0ge307XG4gICAgaWYgKGNoYXJ0RGF0YS5vYnNlcnZlZCkge1xuICAgICAgT2JqZWN0LmtleXMoY2hhcnREYXRhLm9ic2VydmVkKS5mb3JFYWNoKChwbGFuZXROYW1lKSA9PiB7XG4gICAgICAgIGNvbnN0IHBsYW5ldERhdGEgPSBjaGFydERhdGEub2JzZXJ2ZWRbcGxhbmV0TmFtZV07XG4gICAgICAgIGlmIChwbGFuZXREYXRhKSB7XG4gICAgICAgICAgcGxhbmV0c1twbGFuZXROYW1lXSA9IHtcbiAgICAgICAgICAgIGxvbmdpdHVkZTogcGxhbmV0RGF0YS5hcHBhcmVudExvbmdpdHVkZURkIHx8IDAsXG4gICAgICAgICAgICBsb25naXR1ZGVEbXM6IHBsYW5ldERhdGEuYXBwYXJlbnRMb25naXR1ZGVEbXMzNjAgfHwgJycsXG4gICAgICAgICAgICBkaXN0YW5jZUttOiBwbGFuZXREYXRhLmdlb2NlbnRyaWNEaXN0YW5jZUttIHx8IDAsXG4gICAgICAgICAgICBuYW1lOiBwbGFuZXREYXRhLm5hbWUgfHwgcGxhbmV0TmFtZSxcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBDaGVjayBjYWNoZSBmb3IgaG91c2UgY2FsY3VsYXRpb25zXG4gICAgY29uc3QgY2FjaGVLZXkgPSBnZW5lcmF0ZUNhY2hlS2V5KGJpcnRoRGF0ZSwgYmlydGhUaW1lLCBsYXRpdHVkZSwgbG9uZ2l0dWRlKTtcbiAgICBsZXQgaG91c2VEYXRhID0gYXdhaXQgZ2V0Q2FjaGVkSG91c2VEYXRhKGNhY2hlS2V5KTtcblxuICAgIGlmICghaG91c2VEYXRhKSB7XG4gICAgICAvLyBDYWxjdWxhdGUgaG91c2VzIHVzaW5nIFN3aXNzIEVwaGVtZXJpc1xuICAgICAgaG91c2VEYXRhID0gYXdhaXQgY2FsY3VsYXRlSG91c2VzV2l0aFN3aXNzZXBoKGJpcnRoRGF0ZVRpbWUsIGxhdGl0dWRlLCBsb25naXR1ZGUpO1xuXG4gICAgICBpZiAoaG91c2VEYXRhKSB7XG4gICAgICAgIC8vIFNhdmUgdG8gY2FjaGVcbiAgICAgICAgYXdhaXQgc2F2ZUNhY2hlZEhvdXNlRGF0YShjYWNoZUtleSwgaG91c2VEYXRhKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBQcmVwYXJlIHRoZSBpdGVtIHRvIHN0b3JlXG4gICAgY29uc3QgaXRlbTogYW55ID0ge1xuICAgICAgdXNlcklkLFxuICAgICAgY2hhcnRUeXBlOiAnbmF0YWwnLFxuICAgICAgY3JlYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICBpc1RpbWVFc3RpbWF0ZWQsXG4gICAgICBiaXJ0aEluZm86IHtcbiAgICAgICAgLi4udmFsaWRhdGVkRXZlbnQsXG4gICAgICAgIGJpcnRoVGltZSxcbiAgICAgIH0sXG4gICAgICBwbGFuZXRzLFxuICAgICAgbWV0YWRhdGE6IHtcbiAgICAgICAgY2FsY3VsYXRpb25UaW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgYWxnb1ZlcnNpb246ICcyLjAuMCcsXG4gICAgICAgIGVwaGVtZXJpc1ZlcnNpb246ICcyLjEwLjAzJyxcbiAgICAgICAgc3dldGVzdFZlcnNpb246ICcyLjEwLjAzJyxcbiAgICAgICAgaW5wdXRIYXNoOiBjYWNoZUtleSxcbiAgICAgIH0sXG4gICAgfTtcblxuICAgIC8vIEFkZCBob3VzZSBkYXRhIGlmIGF2YWlsYWJsZVxuICAgIGlmIChob3VzZURhdGEpIHtcbiAgICAgIGl0ZW0uaG91c2VzID0ge1xuICAgICAgICBzdGF0dXM6ICdzdWNjZXNzJyxcbiAgICAgICAgZGF0YTogaG91c2VEYXRhLmhvdXNlcyxcbiAgICAgIH07XG4gICAgICBpdGVtLmFzY2VuZGFudCA9IGhvdXNlRGF0YS5hc2NlbmRhbnQ7XG4gICAgICBpdGVtLm1pZGhlYXZlbiA9IGhvdXNlRGF0YS5taWRoZWF2ZW47XG4gICAgICBpdGVtLnBsYW5ldEhvdXNlcyA9IGhvdXNlRGF0YS5wbGFuZXRIb3VzZXM7XG4gICAgfSBlbHNlIHtcbiAgICAgIGl0ZW0uaG91c2VzID0ge1xuICAgICAgICBzdGF0dXM6ICdmYWlsZWQnLFxuICAgICAgICBlcnJvcjogJ0hvdXNlIGNhbGN1bGF0aW9ucyB1bmF2YWlsYWJsZScsXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIFN0b3JlIHRoZSBuYXRhbCBjaGFydFxuICAgIGF3YWl0IGRvY0NsaWVudC5zZW5kKFxuICAgICAgbmV3IFB1dENvbW1hbmQoe1xuICAgICAgICBUYWJsZU5hbWU6IE5BVEFMX0NIQVJUX1RBQkxFX05BTUUsXG4gICAgICAgIEl0ZW06IGl0ZW0sXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgY29uc29sZS5sb2coYFN1Y2Nlc3NmdWxseSBnZW5lcmF0ZWQgYW5kIHN0b3JlZCBuYXRhbCBjaGFydCBmb3IgdXNlcklkOiAke3VzZXJJZH1gKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBjYWxjdWxhdGluZyBvciBzdG9yaW5nIG5hdGFsIGNoYXJ0OicsIGVycm9yKTtcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxufTtcbiJdfQ==