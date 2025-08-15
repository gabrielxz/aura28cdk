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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let swisseph;
let ephemerisPath;
// Cold start logging for ephemeris path verification
const initSwissEph = () => {
    try {
        swisseph = require('/opt/nodejs/node_modules/swisseph');
        ephemerisPath =
            process.env.SE_EPHE_PATH ||
                process.env.EPHEMERIS_PATH ||
                '/opt/nodejs/node_modules/swisseph/ephe';
        // Log ephemeris path on cold start
        console.info('Swiss Ephemeris initialization:', {
            path: ephemerisPath,
            envSE_EPHE_PATH: process.env.SE_EPHE_PATH,
            envEPHEMERIS_PATH: process.env.EPHEMERIS_PATH,
        });
        // Verify ephemeris directory exists
        const fs = require('fs');
        if (fs.existsSync(ephemerisPath)) {
            const files = fs.readdirSync(ephemerisPath);
            const seFiles = files.filter((f) => f.endsWith('.se1') || f === 'seleapsec.txt' || f === 'seorbel.txt');
            console.info('Ephemeris files found:', seFiles.length, 'files:', seFiles.slice(0, 5));
        }
        else {
            console.error('Ephemeris directory does not exist:', ephemerisPath);
        }
    }
    catch (_error) {
        console.warn('Swiss Ephemeris not available from layer, falling back to local if available');
        try {
            swisseph = require('swisseph');
            ephemerisPath = './node_modules/swisseph/ephe';
            console.info('Using local Swiss Ephemeris');
        }
        catch (_e) {
            console.error('Swiss Ephemeris not available');
        }
    }
};
// Initialize on cold start
initSwissEph();
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        // Set ephemeris path explicitly
        const ephePath = ephemerisPath ||
            process.env.SE_EPHE_PATH ||
            process.env.EPHEMERIS_PATH ||
            '/opt/nodejs/node_modules/swisseph/ephe';
        swisseph.swe_set_ephe_path(ephePath);
        console.info('Setting ephemeris path for house calculations:', ephePath);
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
    // Only include inputs that affect calculations
    const cacheData = {
        birthDateTime: `${birthDate}T${birthTime}:00Z`, // UTC ISO format
        lat: latitude,
        lon: longitude,
        houseSystem: 'placidus',
        zodiacType: 'tropical',
        ephemerisVersion: '2.10.03', // Only change when ephemeris data changes
    };
    // Use stable JSON stringification (keys in alphabetical order)
    const sortedKeys = Object.keys(cacheData).sort();
    const stableJson = sortedKeys
        .map((key) => `"${key}":${JSON.stringify(cacheData[key])}`)
        .join(',');
    const input = `{${stableJson}}`;
    return crypto.createHash('sha256').update(input).digest('hex');
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
                ephemerisVersion: '2.10.03',
                swetestVersion: '2.10.03',
                houseSystem: 'placidus',
                zodiacType: 'tropical',
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGUtbmF0YWwtY2hhcnQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJnZW5lcmF0ZS1uYXRhbC1jaGFydC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLDhEQUEwRDtBQUMxRCx3REFBdUY7QUFDdkYseUNBQTBDO0FBQzFDLCtDQUFpQztBQUVqQyxNQUFNLFlBQVksR0FBRyxJQUFJLGdDQUFjLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDNUMsTUFBTSxTQUFTLEdBQUcscUNBQXNCLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO0FBRTVELHdDQUF3QztBQUN4Qyw4REFBOEQ7QUFDOUQsSUFBSSxRQUFhLENBQUM7QUFDbEIsSUFBSSxhQUFpQyxDQUFDO0FBRXRDLHFEQUFxRDtBQUNyRCxNQUFNLFlBQVksR0FBRyxHQUFHLEVBQUU7SUFDeEIsSUFBSSxDQUFDO1FBQ0gsUUFBUSxHQUFHLE9BQU8sQ0FBQyxtQ0FBbUMsQ0FBQyxDQUFDO1FBQ3hELGFBQWE7WUFDWCxPQUFPLENBQUMsR0FBRyxDQUFDLFlBQVk7Z0JBQ3hCLE9BQU8sQ0FBQyxHQUFHLENBQUMsY0FBYztnQkFDMUIsd0NBQXdDLENBQUM7UUFFM0MsbUNBQW1DO1FBQ25DLE9BQU8sQ0FBQyxJQUFJLENBQUMsaUNBQWlDLEVBQUU7WUFDOUMsSUFBSSxFQUFFLGFBQWE7WUFDbkIsZUFBZSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsWUFBWTtZQUN6QyxpQkFBaUIsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLGNBQWM7U0FDOUMsQ0FBQyxDQUFDO1FBRUgsb0NBQW9DO1FBQ3BDLE1BQU0sRUFBRSxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN6QixJQUFJLEVBQUUsQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQztZQUNqQyxNQUFNLEtBQUssR0FBRyxFQUFFLENBQUMsV0FBVyxDQUFDLGFBQWEsQ0FBQyxDQUFDO1lBQzVDLE1BQU0sT0FBTyxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQzFCLENBQUMsQ0FBUyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxlQUFlLElBQUksQ0FBQyxLQUFLLGFBQWEsQ0FDbEYsQ0FBQztZQUNGLE9BQU8sQ0FBQyxJQUFJLENBQUMsd0JBQXdCLEVBQUUsT0FBTyxDQUFDLE1BQU0sRUFBRSxRQUFRLEVBQUUsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN4RixDQUFDO2FBQU0sQ0FBQztZQUNOLE9BQU8sQ0FBQyxLQUFLLENBQUMscUNBQXFDLEVBQUUsYUFBYSxDQUFDLENBQUM7UUFDdEUsQ0FBQztJQUNILENBQUM7SUFBQyxPQUFPLE1BQU0sRUFBRSxDQUFDO1FBQ2hCLE9BQU8sQ0FBQyxJQUFJLENBQUMsOEVBQThFLENBQUMsQ0FBQztRQUM3RixJQUFJLENBQUM7WUFDSCxRQUFRLEdBQUcsT0FBTyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQy9CLGFBQWEsR0FBRyw4QkFBOEIsQ0FBQztZQUMvQyxPQUFPLENBQUMsSUFBSSxDQUFDLDZCQUE2QixDQUFDLENBQUM7UUFDOUMsQ0FBQztRQUFDLE9BQU8sRUFBRSxFQUFFLENBQUM7WUFDWixPQUFPLENBQUMsS0FBSyxDQUFDLCtCQUErQixDQUFDLENBQUM7UUFDakQsQ0FBQztJQUNILENBQUM7QUFDSCxDQUFDLENBQUM7QUFFRiwyQkFBMkI7QUFDM0IsWUFBWSxFQUFFLENBQUM7QUEwQmYsTUFBTSxZQUFZLEdBQUc7SUFDbkIsT0FBTztJQUNQLFFBQVE7SUFDUixRQUFRO0lBQ1IsUUFBUTtJQUNSLEtBQUs7SUFDTCxPQUFPO0lBQ1AsT0FBTztJQUNQLFNBQVM7SUFDVCxhQUFhO0lBQ2IsV0FBVztJQUNYLFVBQVU7SUFDVixRQUFRO0NBQ1QsQ0FBQztBQUVGLDhEQUE4RDtBQUM5RCxNQUFNLGFBQWEsR0FBRyxDQUFDLEtBQVUsRUFBbUIsRUFBRTtJQUNwRCxJQUNFLENBQUMsS0FBSyxDQUFDLE1BQU07UUFDYixDQUFDLEtBQUssQ0FBQyxTQUFTO1FBQ2hCLENBQUMsS0FBSyxDQUFDLFFBQVE7UUFDZixDQUFDLEtBQUssQ0FBQyxTQUFTO1FBQ2hCLENBQUMsS0FBSyxDQUFDLFlBQVksRUFDbkIsQ0FBQztRQUNELE1BQU0sSUFBSSxLQUFLLENBQUMsbUNBQW1DLENBQUMsQ0FBQztJQUN2RCxDQUFDO0lBRUQsdUJBQXVCO0lBQ3ZCLElBQUksS0FBSyxDQUFDLFFBQVEsR0FBRyxDQUFDLEVBQUUsSUFBSSxLQUFLLENBQUMsUUFBUSxHQUFHLEVBQUUsRUFBRSxDQUFDO1FBQ2hELE1BQU0sSUFBSSxLQUFLLENBQUMsOENBQThDLENBQUMsQ0FBQztJQUNsRSxDQUFDO0lBQ0QsSUFBSSxLQUFLLENBQUMsU0FBUyxHQUFHLENBQUMsR0FBRyxJQUFJLEtBQUssQ0FBQyxTQUFTLEdBQUcsR0FBRyxFQUFFLENBQUM7UUFDcEQsTUFBTSxJQUFJLEtBQUssQ0FBQyxpREFBaUQsQ0FBQyxDQUFDO0lBQ3JFLENBQUM7SUFFRCxPQUFPLEtBQUssQ0FBQztBQUNmLENBQUMsQ0FBQztBQUVGLE1BQU0sYUFBYSxHQUFHLENBQUMsTUFBYyxFQUEyRCxFQUFFO0lBQ2hHLE1BQU0sZ0JBQWdCLEdBQUcsTUFBTSxHQUFHLEdBQUcsQ0FBQztJQUN0QyxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLGdCQUFnQixHQUFHLEVBQUUsQ0FBQyxDQUFDO0lBQ3BELE1BQU0sWUFBWSxHQUFHLGdCQUFnQixHQUFHLEVBQUUsQ0FBQztJQUMzQyxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxDQUFDO0lBQzlDLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxZQUFZLEdBQUcsWUFBWSxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUM7SUFFL0QsT0FBTztRQUNMLElBQUksRUFBRSxZQUFZLENBQUMsU0FBUyxDQUFDO1FBQzdCLFlBQVksRUFBRSxZQUFZO1FBQzFCLE9BQU87S0FDUixDQUFDO0FBQ0osQ0FBQyxDQUFDO0FBRUYsTUFBTSwyQkFBMkIsR0FBRyxLQUFLLEVBQ3ZDLGFBQW1CLEVBQ25CLFFBQWdCLEVBQ2hCLFNBQWlCLEVBTVQsRUFBRTtJQUNWLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUNkLE9BQU8sQ0FBQyxJQUFJLENBQUMsNERBQTRELENBQUMsQ0FBQztRQUMzRSxPQUFPLElBQUksQ0FBQztJQUNkLENBQUM7SUFFRCxJQUFJLENBQUM7UUFDSCxnQ0FBZ0M7UUFDaEMsTUFBTSxRQUFRLEdBQ1osYUFBYTtZQUNiLE9BQU8sQ0FBQyxHQUFHLENBQUMsWUFBWTtZQUN4QixPQUFPLENBQUMsR0FBRyxDQUFDLGNBQWM7WUFDMUIsd0NBQXdDLENBQUM7UUFDM0MsUUFBUSxDQUFDLGlCQUFpQixDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ3JDLE9BQU8sQ0FBQyxJQUFJLENBQUMsZ0RBQWdELEVBQUUsUUFBUSxDQUFDLENBQUM7UUFFekUsdUJBQXVCO1FBQ3ZCLE1BQU0sSUFBSSxHQUFHLGFBQWEsQ0FBQyxjQUFjLEVBQUUsQ0FBQztRQUM1QyxNQUFNLEtBQUssR0FBRyxhQUFhLENBQUMsV0FBVyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQzlDLE1BQU0sR0FBRyxHQUFHLGFBQWEsQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUN2QyxNQUFNLElBQUksR0FDUixhQUFhLENBQUMsV0FBVyxFQUFFO1lBQzNCLGFBQWEsQ0FBQyxhQUFhLEVBQUUsR0FBRyxFQUFFO1lBQ2xDLGFBQWEsQ0FBQyxhQUFhLEVBQUUsR0FBRyxJQUFJLENBQUM7UUFFdkMsTUFBTSxTQUFTLEdBQUcsUUFBUSxDQUFDLFVBQVUsQ0FBQyxJQUFJLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBRXBGLHlDQUF5QztRQUN6QyxNQUFNLFNBQVMsR0FBRyxRQUFRLENBQUMsVUFBVSxDQUNuQyxTQUFTLEVBQ1QsUUFBUSxFQUNSLFNBQVMsRUFDVCxHQUFHLENBQ0osQ0FBQztRQUVGLElBQUksQ0FBQyxTQUFTLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxJQUFJLENBQUMsU0FBUyxDQUFDLFNBQVMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUM1RSxNQUFNLElBQUksS0FBSyxDQUFDLDRCQUE0QixDQUFDLENBQUM7UUFDaEQsQ0FBQztRQUVELHNCQUFzQjtRQUN0QixNQUFNLE1BQU0sR0FBZ0IsRUFBRSxDQUFDO1FBQy9CLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUM1QixNQUFNLFVBQVUsR0FBRyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3RDLE1BQU0sVUFBVSxHQUFHLGFBQWEsQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUM3QyxNQUFNLENBQUMsSUFBSSxDQUFDO2dCQUNWLFdBQVcsRUFBRSxDQUFDLEdBQUcsQ0FBQztnQkFDbEIsVUFBVTtnQkFDVixRQUFRLEVBQUUsVUFBVSxDQUFDLElBQUk7Z0JBQ3pCLGdCQUFnQixFQUFFLFVBQVUsQ0FBQyxZQUFZO2dCQUN6QyxXQUFXLEVBQUUsVUFBVSxDQUFDLE9BQU87YUFDaEMsQ0FBQyxDQUFDO1FBQ0wsQ0FBQztRQUVELG9CQUFvQjtRQUNwQixNQUFNLE9BQU8sR0FBRyxhQUFhLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ25ELE1BQU0sU0FBUyxHQUFjO1lBQzNCLE1BQU0sRUFBRSxTQUFTLENBQUMsU0FBUztZQUMzQixJQUFJLEVBQUUsT0FBTyxDQUFDLElBQUk7WUFDbEIsWUFBWSxFQUFFLE9BQU8sQ0FBQyxZQUFZO1lBQ2xDLE9BQU8sRUFBRSxPQUFPLENBQUMsT0FBTztTQUN6QixDQUFDO1FBRUYsb0JBQW9CO1FBQ3BCLE1BQU0sTUFBTSxHQUFHLGFBQWEsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDM0MsTUFBTSxTQUFTLEdBQWM7WUFDM0IsTUFBTSxFQUFFLFNBQVMsQ0FBQyxFQUFFO1lBQ3BCLElBQUksRUFBRSxNQUFNLENBQUMsSUFBSTtZQUNqQixZQUFZLEVBQUUsTUFBTSxDQUFDLFlBQVk7WUFDakMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxPQUFPO1NBQ3hCLENBQUM7UUFFRixnRUFBZ0U7UUFDaEUsTUFBTSxZQUFZLEdBQTJCLEVBQUUsQ0FBQztRQUNoRCxNQUFNLFNBQVMsR0FBRztZQUNoQixRQUFRLENBQUMsTUFBTTtZQUNmLFFBQVEsQ0FBQyxPQUFPO1lBQ2hCLFFBQVEsQ0FBQyxVQUFVO1lBQ25CLFFBQVEsQ0FBQyxRQUFRO1lBQ2pCLFFBQVEsQ0FBQyxPQUFPO1lBQ2hCLFFBQVEsQ0FBQyxVQUFVO1lBQ25CLFFBQVEsQ0FBQyxTQUFTO1lBQ2xCLFFBQVEsQ0FBQyxTQUFTO1lBQ2xCLFFBQVEsQ0FBQyxVQUFVO1lBQ25CLFFBQVEsQ0FBQyxRQUFRO1NBQ2xCLENBQUM7UUFDRixNQUFNLFdBQVcsR0FBRztZQUNsQixLQUFLO1lBQ0wsTUFBTTtZQUNOLFNBQVM7WUFDVCxPQUFPO1lBQ1AsTUFBTTtZQUNOLFNBQVM7WUFDVCxRQUFRO1lBQ1IsUUFBUTtZQUNSLFNBQVM7WUFDVCxPQUFPO1NBQ1IsQ0FBQztRQUVGLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxTQUFTLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDMUMsTUFBTSxVQUFVLEdBQUcsUUFBUSxDQUFDLFdBQVcsQ0FBQyxTQUFTLEVBQUUsU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUN2RixJQUFJLFVBQVUsSUFBSSxVQUFVLENBQUMsU0FBUyxLQUFLLFNBQVMsRUFBRSxDQUFDO2dCQUNyRCxNQUFNLGVBQWUsR0FBRyxVQUFVLENBQUMsU0FBUyxDQUFDO2dCQUM3Qyx5Q0FBeUM7Z0JBQ3pDLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztvQkFDNUIsTUFBTSxXQUFXLEdBQUcsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQztvQkFDekMsTUFBTSxRQUFRLEdBQUcsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLFVBQVUsQ0FBQztvQkFFakQseUNBQXlDO29CQUN6QyxJQUFJLFdBQVcsR0FBRyxRQUFRLEVBQUUsQ0FBQzt3QkFDM0Isd0JBQXdCO3dCQUN4QixJQUFJLGVBQWUsSUFBSSxXQUFXLElBQUksZUFBZSxHQUFHLFFBQVEsRUFBRSxDQUFDOzRCQUNqRSxZQUFZLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQzs0QkFDckMsTUFBTTt3QkFDUixDQUFDO29CQUNILENBQUM7eUJBQU0sQ0FBQzt3QkFDTixJQUFJLGVBQWUsSUFBSSxXQUFXLElBQUksZUFBZSxHQUFHLFFBQVEsRUFBRSxDQUFDOzRCQUNqRSxZQUFZLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQzs0QkFDckMsTUFBTTt3QkFDUixDQUFDO29CQUNILENBQUM7Z0JBQ0gsQ0FBQztZQUNILENBQUM7UUFDSCxDQUFDO1FBRUQsd0JBQXdCO1FBQ3hCLFFBQVEsQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUVyQixPQUFPO1lBQ0wsTUFBTTtZQUNOLFNBQVM7WUFDVCxTQUFTO1lBQ1QsWUFBWTtTQUNiLENBQUM7SUFDSixDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsZ0RBQWdELEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDdkUsaUNBQWlDO1FBQ2pDLElBQUksUUFBUSxJQUFJLFFBQVEsQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUNuQyxRQUFRLENBQUMsU0FBUyxFQUFFLENBQUM7UUFDdkIsQ0FBQztRQUNELE9BQU8sSUFBSSxDQUFDO0lBQ2QsQ0FBQztBQUNILENBQUMsQ0FBQztBQUVGLE1BQU0sZ0JBQWdCLEdBQUcsQ0FDdkIsU0FBaUIsRUFDakIsU0FBaUIsRUFDakIsUUFBZ0IsRUFDaEIsU0FBaUIsRUFDVCxFQUFFO0lBQ1YsK0NBQStDO0lBQy9DLE1BQU0sU0FBUyxHQUFHO1FBQ2hCLGFBQWEsRUFBRSxHQUFHLFNBQVMsSUFBSSxTQUFTLE1BQU0sRUFBRSxpQkFBaUI7UUFDakUsR0FBRyxFQUFFLFFBQVE7UUFDYixHQUFHLEVBQUUsU0FBUztRQUNkLFdBQVcsRUFBRSxVQUFVO1FBQ3ZCLFVBQVUsRUFBRSxVQUFVO1FBQ3RCLGdCQUFnQixFQUFFLFNBQVMsRUFBRSwwQ0FBMEM7S0FDeEUsQ0FBQztJQUVGLCtEQUErRDtJQUMvRCxNQUFNLFVBQVUsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO0lBQ2pELE1BQU0sVUFBVSxHQUFHLFVBQVU7U0FDMUIsR0FBRyxDQUFDLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxJQUFJLEdBQUcsS0FBSyxJQUFJLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxHQUE2QixDQUFDLENBQUMsRUFBRSxDQUFDO1NBQ3BGLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUNiLE1BQU0sS0FBSyxHQUFHLElBQUksVUFBVSxHQUFHLENBQUM7SUFFaEMsT0FBTyxNQUFNLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDakUsQ0FBQyxDQUFDO0FBRUYsOERBQThEO0FBQzlELE1BQU0sa0JBQWtCLEdBQUcsS0FBSyxFQUFFLFFBQWdCLEVBQXVCLEVBQUU7SUFDekUsTUFBTSxzQkFBc0IsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLHNCQUF1QixDQUFDO0lBRW5FLElBQUksQ0FBQztRQUNILE1BQU0sTUFBTSxHQUFHLE1BQU0sU0FBUyxDQUFDLElBQUksQ0FDakMsSUFBSSx5QkFBVSxDQUFDO1lBQ2IsU0FBUyxFQUFFLHNCQUFzQjtZQUNqQyxHQUFHLEVBQUU7Z0JBQ0gsTUFBTSxFQUFFLFNBQVMsUUFBUSxFQUFFO2dCQUMzQixTQUFTLEVBQUUsYUFBYTthQUN6QjtTQUNGLENBQUMsQ0FDSCxDQUFDO1FBRUYsSUFBSSxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDaEIsT0FBTyxDQUFDLElBQUksQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDO1lBQ2pELE9BQU8sTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUM7UUFDL0IsQ0FBQztJQUNILENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQywrQkFBK0IsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUN4RCxDQUFDO0lBRUQsT0FBTyxJQUFJLENBQUM7QUFDZCxDQUFDLENBQUM7QUFFRiw4REFBOEQ7QUFDOUQsTUFBTSxtQkFBbUIsR0FBRyxLQUFLLEVBQUUsUUFBZ0IsRUFBRSxTQUFjLEVBQWlCLEVBQUU7SUFDcEYsTUFBTSxzQkFBc0IsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLHNCQUF1QixDQUFDO0lBRW5FLElBQUksQ0FBQztRQUNILE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxHQUFHLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDLGNBQWM7UUFFN0UsTUFBTSxTQUFTLENBQUMsSUFBSSxDQUNsQixJQUFJLHlCQUFVLENBQUM7WUFDYixTQUFTLEVBQUUsc0JBQXNCO1lBQ2pDLElBQUksRUFBRTtnQkFDSixNQUFNLEVBQUUsU0FBUyxRQUFRLEVBQUU7Z0JBQzNCLFNBQVMsRUFBRSxhQUFhO2dCQUN4QixTQUFTO2dCQUNULEdBQUc7Z0JBQ0gsU0FBUyxFQUFFLElBQUksSUFBSSxFQUFFLENBQUMsV0FBVyxFQUFFO2FBQ3BDO1NBQ0YsQ0FBQyxDQUNILENBQUM7SUFDSixDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsMkJBQTJCLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDcEQsQ0FBQztBQUNILENBQUMsQ0FBQztBQUVGLDhEQUE4RDtBQUN2RCxNQUFNLE9BQU8sR0FBRyxLQUFLLEVBQUUsS0FBVSxFQUFpQixFQUFFO0lBQ3pELE1BQU0sc0JBQXNCLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxzQkFBdUIsQ0FBQztJQUNuRSxPQUFPLENBQUMsSUFBSSxDQUFDLGlCQUFpQixFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRWhFLE1BQU0sY0FBYyxHQUFHLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUM1QyxNQUFNLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLFlBQVksRUFBRSxHQUFHLGNBQWMsQ0FBQztJQUVoRix1Q0FBdUM7SUFDdkMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUM5QixNQUFNLElBQUksS0FBSyxDQUFDLCtDQUErQyxDQUFDLENBQUM7SUFDbkUsQ0FBQztJQUVELE1BQU0sU0FBUyxHQUFHLGNBQWMsQ0FBQyxTQUFTLENBQUM7SUFDM0MsTUFBTSxlQUFlLEdBQUcsS0FBSyxDQUFDLENBQUMsbUNBQW1DO0lBRWxFLDRFQUE0RTtJQUM1RSxNQUFNLGdCQUFnQixHQUFHLEdBQUcsU0FBUyxJQUFJLFNBQVMsS0FBSyxDQUFDO0lBQ3hELE1BQU0sYUFBYSxHQUFHLElBQUksSUFBSSxDQUFDLGdCQUFnQixDQUFDLENBQUM7SUFFakQsNEJBQTRCO0lBQzVCLE1BQU0scUJBQXFCLEdBQ3pCLElBQUksSUFBSSxDQUNOLGFBQWEsQ0FBQyxjQUFjLENBQUMsT0FBTyxFQUFFLEVBQUUsUUFBUSxFQUFFLFlBQVksRUFBRSxDQUFDLENBQ2xFLENBQUMsaUJBQWlCLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQztJQUU5QixJQUFJLENBQUM7UUFDSCxpRUFBaUU7UUFDakUsTUFBTSxTQUFTLEdBQUcsSUFBQSx5QkFBYSxFQUFDLGFBQWEsRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLHFCQUFxQixDQUFDLENBQUM7UUFFM0YsMERBQTBEO1FBQzFELDhEQUE4RDtRQUM5RCxNQUFNLE9BQU8sR0FBd0IsRUFBRSxDQUFDO1FBQ3hDLElBQUksU0FBUyxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ3ZCLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLFVBQVUsRUFBRSxFQUFFO2dCQUNyRCxNQUFNLFVBQVUsR0FBRyxTQUFTLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxDQUFDO2dCQUNsRCxJQUFJLFVBQVUsSUFBSSxVQUFVLEtBQUssUUFBUSxFQUFFLENBQUM7b0JBQzFDLE1BQU0sU0FBUyxHQUFHLFVBQVUsQ0FBQyxtQkFBbUIsSUFBSSxDQUFDLENBQUM7b0JBQ3RELG9DQUFvQztvQkFDcEMsTUFBTSxtQkFBbUIsR0FBRyxDQUFDLENBQUMsU0FBUyxHQUFHLEdBQUcsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxHQUFHLEdBQUcsQ0FBQztvQkFDNUQsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxtQkFBbUIsR0FBRyxFQUFFLENBQUMsQ0FBQztvQkFDdkQsTUFBTSxJQUFJLEdBQUcsWUFBWSxDQUFDLFNBQVMsQ0FBQyxDQUFDO29CQUNyQyxNQUFNLFlBQVksR0FBRyxtQkFBbUIsR0FBRyxTQUFTLEdBQUcsRUFBRSxDQUFDO29CQUMxRCxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxDQUFDO29CQUM5QyxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsWUFBWSxHQUFHLFlBQVksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDO29CQUUvRCxPQUFPLENBQUMsVUFBVSxDQUFDLEdBQUc7d0JBQ3BCLFNBQVMsRUFBRSxTQUFTO3dCQUNwQixZQUFZLEVBQUUsR0FBRyxZQUFZLENBQUMsUUFBUSxFQUFFLENBQUMsUUFBUSxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsSUFBSSxPQUFPLENBQUMsUUFBUSxFQUFFLENBQUMsUUFBUSxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsS0FBSyxJQUFJLEVBQUU7d0JBQzNHLFVBQVUsRUFBRSxVQUFVLENBQUMsb0JBQW9CLElBQUksQ0FBQzt3QkFDaEQsSUFBSSxFQUFFLFVBQVUsQ0FBQyxJQUFJLElBQUksVUFBVTt3QkFDbkMsSUFBSSxFQUFFLElBQUk7d0JBQ1YsWUFBWSxFQUFFLFlBQVk7d0JBQzFCLE9BQU8sRUFBRSxPQUFPO3FCQUNqQixDQUFDO2dCQUNKLENBQUM7WUFDSCxDQUFDLENBQUMsQ0FBQztRQUNMLENBQUM7UUFFRCxxQ0FBcUM7UUFDckMsTUFBTSxRQUFRLEdBQUcsZ0JBQWdCLENBQUMsU0FBUyxFQUFFLFNBQVMsRUFBRSxRQUFRLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDN0UsSUFBSSxTQUFTLEdBQUcsTUFBTSxrQkFBa0IsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUVuRCxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDZix5Q0FBeUM7WUFDekMsU0FBUyxHQUFHLE1BQU0sMkJBQTJCLENBQUMsYUFBYSxFQUFFLFFBQVEsRUFBRSxTQUFTLENBQUMsQ0FBQztZQUVsRixJQUFJLFNBQVMsRUFBRSxDQUFDO2dCQUNkLGdCQUFnQjtnQkFDaEIsTUFBTSxtQkFBbUIsQ0FBQyxRQUFRLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFDakQsQ0FBQztRQUNILENBQUM7UUFFRCw0QkFBNEI7UUFDNUIsOERBQThEO1FBQzlELE1BQU0sSUFBSSxHQUFRO1lBQ2hCLE1BQU07WUFDTixTQUFTLEVBQUUsT0FBTztZQUNsQixTQUFTLEVBQUUsSUFBSSxJQUFJLEVBQUUsQ0FBQyxXQUFXLEVBQUU7WUFDbkMsZUFBZTtZQUNmLFNBQVMsRUFBRTtnQkFDVCxHQUFHLGNBQWM7Z0JBQ2pCLFNBQVM7YUFDVjtZQUNELE9BQU87WUFDUCxRQUFRLEVBQUU7Z0JBQ1Isb0JBQW9CLEVBQUUsSUFBSSxJQUFJLEVBQUUsQ0FBQyxXQUFXLEVBQUU7Z0JBQzlDLGdCQUFnQixFQUFFLFNBQVM7Z0JBQzNCLGNBQWMsRUFBRSxTQUFTO2dCQUN6QixXQUFXLEVBQUUsVUFBVTtnQkFDdkIsVUFBVSxFQUFFLFVBQVU7YUFDdkI7U0FDRixDQUFDO1FBRUYsOEJBQThCO1FBQzlCLElBQUksU0FBUyxFQUFFLENBQUM7WUFDZCxJQUFJLENBQUMsTUFBTSxHQUFHO2dCQUNaLE1BQU0sRUFBRSxTQUFTO2dCQUNqQixJQUFJLEVBQUUsU0FBUyxDQUFDLE1BQU07YUFDdkIsQ0FBQztZQUNGLElBQUksQ0FBQyxTQUFTLEdBQUcsU0FBUyxDQUFDLFNBQVMsQ0FBQztZQUNyQyxJQUFJLENBQUMsU0FBUyxHQUFHLFNBQVMsQ0FBQyxTQUFTLENBQUM7WUFDckMsSUFBSSxDQUFDLFlBQVksR0FBRyxTQUFTLENBQUMsWUFBWSxDQUFDO1FBQzdDLENBQUM7YUFBTSxDQUFDO1lBQ04sSUFBSSxDQUFDLE1BQU0sR0FBRztnQkFDWixNQUFNLEVBQUUsUUFBUTtnQkFDaEIsS0FBSyxFQUFFLGdDQUFnQzthQUN4QyxDQUFDO1FBQ0osQ0FBQztRQUVELHdCQUF3QjtRQUN4QixNQUFNLFNBQVMsQ0FBQyxJQUFJLENBQ2xCLElBQUkseUJBQVUsQ0FBQztZQUNiLFNBQVMsRUFBRSxzQkFBc0I7WUFDakMsSUFBSSxFQUFFLElBQUk7U0FDWCxDQUFDLENBQ0gsQ0FBQztRQUVGLE9BQU8sQ0FBQyxJQUFJLENBQUMsNkRBQTZELE1BQU0sRUFBRSxDQUFDLENBQUM7SUFDdEYsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLDJDQUEyQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ2xFLE1BQU0sS0FBSyxDQUFDO0lBQ2QsQ0FBQztBQUNILENBQUMsQ0FBQztBQTFIVyxRQUFBLE9BQU8sV0EwSGxCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgRHluYW1vREJDbGllbnQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtZHluYW1vZGInO1xuaW1wb3J0IHsgRHluYW1vREJEb2N1bWVudENsaWVudCwgUHV0Q29tbWFuZCwgR2V0Q29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYic7XG5pbXBvcnQgeyBnZXRBbGxQbGFuZXRzIH0gZnJvbSAnZXBoZW1lcmlzJztcbmltcG9ydCAqIGFzIGNyeXB0byBmcm9tICdjcnlwdG8nO1xuXG5jb25zdCBkeW5hbW9DbGllbnQgPSBuZXcgRHluYW1vREJDbGllbnQoe30pO1xuY29uc3QgZG9jQ2xpZW50ID0gRHluYW1vREJEb2N1bWVudENsaWVudC5mcm9tKGR5bmFtb0NsaWVudCk7XG5cbi8vIEltcG9ydCBzd2lzc2VwaCBmcm9tIHRoZSBMYW1iZGEgTGF5ZXJcbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5sZXQgc3dpc3NlcGg6IGFueTtcbmxldCBlcGhlbWVyaXNQYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cbi8vIENvbGQgc3RhcnQgbG9nZ2luZyBmb3IgZXBoZW1lcmlzIHBhdGggdmVyaWZpY2F0aW9uXG5jb25zdCBpbml0U3dpc3NFcGggPSAoKSA9PiB7XG4gIHRyeSB7XG4gICAgc3dpc3NlcGggPSByZXF1aXJlKCcvb3B0L25vZGVqcy9ub2RlX21vZHVsZXMvc3dpc3NlcGgnKTtcbiAgICBlcGhlbWVyaXNQYXRoID1cbiAgICAgIHByb2Nlc3MuZW52LlNFX0VQSEVfUEFUSCB8fFxuICAgICAgcHJvY2Vzcy5lbnYuRVBIRU1FUklTX1BBVEggfHxcbiAgICAgICcvb3B0L25vZGVqcy9ub2RlX21vZHVsZXMvc3dpc3NlcGgvZXBoZSc7XG5cbiAgICAvLyBMb2cgZXBoZW1lcmlzIHBhdGggb24gY29sZCBzdGFydFxuICAgIGNvbnNvbGUuaW5mbygnU3dpc3MgRXBoZW1lcmlzIGluaXRpYWxpemF0aW9uOicsIHtcbiAgICAgIHBhdGg6IGVwaGVtZXJpc1BhdGgsXG4gICAgICBlbnZTRV9FUEhFX1BBVEg6IHByb2Nlc3MuZW52LlNFX0VQSEVfUEFUSCxcbiAgICAgIGVudkVQSEVNRVJJU19QQVRIOiBwcm9jZXNzLmVudi5FUEhFTUVSSVNfUEFUSCxcbiAgICB9KTtcblxuICAgIC8vIFZlcmlmeSBlcGhlbWVyaXMgZGlyZWN0b3J5IGV4aXN0c1xuICAgIGNvbnN0IGZzID0gcmVxdWlyZSgnZnMnKTtcbiAgICBpZiAoZnMuZXhpc3RzU3luYyhlcGhlbWVyaXNQYXRoKSkge1xuICAgICAgY29uc3QgZmlsZXMgPSBmcy5yZWFkZGlyU3luYyhlcGhlbWVyaXNQYXRoKTtcbiAgICAgIGNvbnN0IHNlRmlsZXMgPSBmaWxlcy5maWx0ZXIoXG4gICAgICAgIChmOiBzdHJpbmcpID0+IGYuZW5kc1dpdGgoJy5zZTEnKSB8fCBmID09PSAnc2VsZWFwc2VjLnR4dCcgfHwgZiA9PT0gJ3Nlb3JiZWwudHh0JyxcbiAgICAgICk7XG4gICAgICBjb25zb2xlLmluZm8oJ0VwaGVtZXJpcyBmaWxlcyBmb3VuZDonLCBzZUZpbGVzLmxlbmd0aCwgJ2ZpbGVzOicsIHNlRmlsZXMuc2xpY2UoMCwgNSkpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdFcGhlbWVyaXMgZGlyZWN0b3J5IGRvZXMgbm90IGV4aXN0OicsIGVwaGVtZXJpc1BhdGgpO1xuICAgIH1cbiAgfSBjYXRjaCAoX2Vycm9yKSB7XG4gICAgY29uc29sZS53YXJuKCdTd2lzcyBFcGhlbWVyaXMgbm90IGF2YWlsYWJsZSBmcm9tIGxheWVyLCBmYWxsaW5nIGJhY2sgdG8gbG9jYWwgaWYgYXZhaWxhYmxlJyk7XG4gICAgdHJ5IHtcbiAgICAgIHN3aXNzZXBoID0gcmVxdWlyZSgnc3dpc3NlcGgnKTtcbiAgICAgIGVwaGVtZXJpc1BhdGggPSAnLi9ub2RlX21vZHVsZXMvc3dpc3NlcGgvZXBoZSc7XG4gICAgICBjb25zb2xlLmluZm8oJ1VzaW5nIGxvY2FsIFN3aXNzIEVwaGVtZXJpcycpO1xuICAgIH0gY2F0Y2ggKF9lKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdTd2lzcyBFcGhlbWVyaXMgbm90IGF2YWlsYWJsZScpO1xuICAgIH1cbiAgfVxufTtcblxuLy8gSW5pdGlhbGl6ZSBvbiBjb2xkIHN0YXJ0XG5pbml0U3dpc3NFcGgoKTtcblxuaW50ZXJmYWNlIE5hdGFsQ2hhcnRFdmVudCB7XG4gIHVzZXJJZDogc3RyaW5nO1xuICBiaXJ0aERhdGU6IHN0cmluZzsgLy8gWVlZWS1NTS1ERFxuICBiaXJ0aFRpbWU/OiBzdHJpbmc7IC8vIEhIOk1NXG4gIGxhdGl0dWRlOiBudW1iZXI7XG4gIGxvbmdpdHVkZTogbnVtYmVyO1xuICBpYW5hVGltZVpvbmU6IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIEhvdXNlRGF0YSB7XG4gIGhvdXNlTnVtYmVyOiBudW1iZXI7XG4gIGN1c3BEZWdyZWU6IG51bWJlcjtcbiAgY3VzcFNpZ246IHN0cmluZztcbiAgY3VzcERlZ3JlZUluU2lnbjogbnVtYmVyO1xuICBjdXNwTWludXRlczogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgQW5nbGVEYXRhIHtcbiAgZGVncmVlOiBudW1iZXI7XG4gIHNpZ246IHN0cmluZztcbiAgZGVncmVlSW5TaWduOiBudW1iZXI7XG4gIG1pbnV0ZXM6IG51bWJlcjtcbn1cblxuY29uc3QgWk9ESUFDX1NJR05TID0gW1xuICAnQXJpZXMnLFxuICAnVGF1cnVzJyxcbiAgJ0dlbWluaScsXG4gICdDYW5jZXInLFxuICAnTGVvJyxcbiAgJ1ZpcmdvJyxcbiAgJ0xpYnJhJyxcbiAgJ1Njb3JwaW8nLFxuICAnU2FnaXR0YXJpdXMnLFxuICAnQ2Fwcmljb3JuJyxcbiAgJ0FxdWFyaXVzJyxcbiAgJ1Bpc2NlcycsXG5dO1xuXG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuY29uc3QgdmFsaWRhdGVFdmVudCA9IChldmVudDogYW55KTogTmF0YWxDaGFydEV2ZW50ID0+IHtcbiAgaWYgKFxuICAgICFldmVudC51c2VySWQgfHxcbiAgICAhZXZlbnQuYmlydGhEYXRlIHx8XG4gICAgIWV2ZW50LmxhdGl0dWRlIHx8XG4gICAgIWV2ZW50LmxvbmdpdHVkZSB8fFxuICAgICFldmVudC5pYW5hVGltZVpvbmVcbiAgKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdNaXNzaW5nIHJlcXVpcmVkIGV2ZW50IHByb3BlcnRpZXMnKTtcbiAgfVxuXG4gIC8vIFZhbGlkYXRlIGNvb3JkaW5hdGVzXG4gIGlmIChldmVudC5sYXRpdHVkZSA8IC05MCB8fCBldmVudC5sYXRpdHVkZSA+IDkwKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGxhdGl0dWRlOiBtdXN0IGJlIGJldHdlZW4gLTkwIGFuZCA5MCcpO1xuICB9XG4gIGlmIChldmVudC5sb25naXR1ZGUgPCAtMTgwIHx8IGV2ZW50LmxvbmdpdHVkZSA+IDE4MCkge1xuICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBsb25naXR1ZGU6IG11c3QgYmUgYmV0d2VlbiAtMTgwIGFuZCAxODAnKTtcbiAgfVxuXG4gIHJldHVybiBldmVudDtcbn07XG5cbmNvbnN0IGdldERlZ3JlZUluZm8gPSAoZGVncmVlOiBudW1iZXIpOiB7IHNpZ246IHN0cmluZzsgZGVncmVlSW5TaWduOiBudW1iZXI7IG1pbnV0ZXM6IG51bWJlciB9ID0+IHtcbiAgY29uc3Qgbm9ybWFsaXplZERlZ3JlZSA9IGRlZ3JlZSAlIDM2MDtcbiAgY29uc3Qgc2lnbkluZGV4ID0gTWF0aC5mbG9vcihub3JtYWxpemVkRGVncmVlIC8gMzApO1xuICBjb25zdCBkZWdyZWVJblNpZ24gPSBub3JtYWxpemVkRGVncmVlICUgMzA7XG4gIGNvbnN0IHdob2xlRGVncmVlcyA9IE1hdGguZmxvb3IoZGVncmVlSW5TaWduKTtcbiAgY29uc3QgbWludXRlcyA9IE1hdGgucm91bmQoKGRlZ3JlZUluU2lnbiAtIHdob2xlRGVncmVlcykgKiA2MCk7XG5cbiAgcmV0dXJuIHtcbiAgICBzaWduOiBaT0RJQUNfU0lHTlNbc2lnbkluZGV4XSxcbiAgICBkZWdyZWVJblNpZ246IHdob2xlRGVncmVlcyxcbiAgICBtaW51dGVzLFxuICB9O1xufTtcblxuY29uc3QgY2FsY3VsYXRlSG91c2VzV2l0aFN3aXNzZXBoID0gYXN5bmMgKFxuICBiaXJ0aERhdGVUaW1lOiBEYXRlLFxuICBsYXRpdHVkZTogbnVtYmVyLFxuICBsb25naXR1ZGU6IG51bWJlcixcbik6IFByb21pc2U8e1xuICBob3VzZXM6IEhvdXNlRGF0YVtdO1xuICBhc2NlbmRhbnQ6IEFuZ2xlRGF0YTtcbiAgbWlkaGVhdmVuOiBBbmdsZURhdGE7XG4gIHBsYW5ldEhvdXNlczogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbn0gfCBudWxsPiA9PiB7XG4gIGlmICghc3dpc3NlcGgpIHtcbiAgICBjb25zb2xlLndhcm4oJ1N3aXNzIEVwaGVtZXJpcyBub3QgYXZhaWxhYmxlLCBza2lwcGluZyBob3VzZSBjYWxjdWxhdGlvbnMnKTtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIHRyeSB7XG4gICAgLy8gU2V0IGVwaGVtZXJpcyBwYXRoIGV4cGxpY2l0bHlcbiAgICBjb25zdCBlcGhlUGF0aCA9XG4gICAgICBlcGhlbWVyaXNQYXRoIHx8XG4gICAgICBwcm9jZXNzLmVudi5TRV9FUEhFX1BBVEggfHxcbiAgICAgIHByb2Nlc3MuZW52LkVQSEVNRVJJU19QQVRIIHx8XG4gICAgICAnL29wdC9ub2RlanMvbm9kZV9tb2R1bGVzL3N3aXNzZXBoL2VwaGUnO1xuICAgIHN3aXNzZXBoLnN3ZV9zZXRfZXBoZV9wYXRoKGVwaGVQYXRoKTtcbiAgICBjb25zb2xlLmluZm8oJ1NldHRpbmcgZXBoZW1lcmlzIHBhdGggZm9yIGhvdXNlIGNhbGN1bGF0aW9uczonLCBlcGhlUGF0aCk7XG5cbiAgICAvLyBDYWxjdWxhdGUgSnVsaWFuIERheVxuICAgIGNvbnN0IHllYXIgPSBiaXJ0aERhdGVUaW1lLmdldFVUQ0Z1bGxZZWFyKCk7XG4gICAgY29uc3QgbW9udGggPSBiaXJ0aERhdGVUaW1lLmdldFVUQ01vbnRoKCkgKyAxO1xuICAgIGNvbnN0IGRheSA9IGJpcnRoRGF0ZVRpbWUuZ2V0VVRDRGF0ZSgpO1xuICAgIGNvbnN0IGhvdXIgPVxuICAgICAgYmlydGhEYXRlVGltZS5nZXRVVENIb3VycygpICtcbiAgICAgIGJpcnRoRGF0ZVRpbWUuZ2V0VVRDTWludXRlcygpIC8gNjAgK1xuICAgICAgYmlydGhEYXRlVGltZS5nZXRVVENTZWNvbmRzKCkgLyAzNjAwO1xuXG4gICAgY29uc3QganVsaWFuRGF5ID0gc3dpc3NlcGguc3dlX2p1bGRheSh5ZWFyLCBtb250aCwgZGF5LCBob3VyLCBzd2lzc2VwaC5TRV9HUkVHX0NBTCk7XG5cbiAgICAvLyBDYWxjdWxhdGUgaG91c2VzIHVzaW5nIFBsYWNpZHVzIHN5c3RlbVxuICAgIGNvbnN0IGhvdXNlRGF0YSA9IHN3aXNzZXBoLnN3ZV9ob3VzZXMoXG4gICAgICBqdWxpYW5EYXksXG4gICAgICBsYXRpdHVkZSxcbiAgICAgIGxvbmdpdHVkZSxcbiAgICAgICdQJywgLy8gUGxhY2lkdXMgaG91c2Ugc3lzdGVtXG4gICAgKTtcblxuICAgIGlmICghaG91c2VEYXRhIHx8ICFob3VzZURhdGEuaG91c2UgfHwgIWhvdXNlRGF0YS5hc2NlbmRhbnQgfHwgIWhvdXNlRGF0YS5tYykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdGYWlsZWQgdG8gY2FsY3VsYXRlIGhvdXNlcycpO1xuICAgIH1cblxuICAgIC8vIFByb2Nlc3MgaG91c2UgY3VzcHNcbiAgICBjb25zdCBob3VzZXM6IEhvdXNlRGF0YVtdID0gW107XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCAxMjsgaSsrKSB7XG4gICAgICBjb25zdCBjdXNwRGVncmVlID0gaG91c2VEYXRhLmhvdXNlW2ldO1xuICAgICAgY29uc3QgZGVncmVlSW5mbyA9IGdldERlZ3JlZUluZm8oY3VzcERlZ3JlZSk7XG4gICAgICBob3VzZXMucHVzaCh7XG4gICAgICAgIGhvdXNlTnVtYmVyOiBpICsgMSxcbiAgICAgICAgY3VzcERlZ3JlZSxcbiAgICAgICAgY3VzcFNpZ246IGRlZ3JlZUluZm8uc2lnbixcbiAgICAgICAgY3VzcERlZ3JlZUluU2lnbjogZGVncmVlSW5mby5kZWdyZWVJblNpZ24sXG4gICAgICAgIGN1c3BNaW51dGVzOiBkZWdyZWVJbmZvLm1pbnV0ZXMsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBQcm9jZXNzIEFzY2VuZGFudFxuICAgIGNvbnN0IGFzY0luZm8gPSBnZXREZWdyZWVJbmZvKGhvdXNlRGF0YS5hc2NlbmRhbnQpO1xuICAgIGNvbnN0IGFzY2VuZGFudDogQW5nbGVEYXRhID0ge1xuICAgICAgZGVncmVlOiBob3VzZURhdGEuYXNjZW5kYW50LFxuICAgICAgc2lnbjogYXNjSW5mby5zaWduLFxuICAgICAgZGVncmVlSW5TaWduOiBhc2NJbmZvLmRlZ3JlZUluU2lnbixcbiAgICAgIG1pbnV0ZXM6IGFzY0luZm8ubWludXRlcyxcbiAgICB9O1xuXG4gICAgLy8gUHJvY2VzcyBNaWRoZWF2ZW5cbiAgICBjb25zdCBtY0luZm8gPSBnZXREZWdyZWVJbmZvKGhvdXNlRGF0YS5tYyk7XG4gICAgY29uc3QgbWlkaGVhdmVuOiBBbmdsZURhdGEgPSB7XG4gICAgICBkZWdyZWU6IGhvdXNlRGF0YS5tYyxcbiAgICAgIHNpZ246IG1jSW5mby5zaWduLFxuICAgICAgZGVncmVlSW5TaWduOiBtY0luZm8uZGVncmVlSW5TaWduLFxuICAgICAgbWludXRlczogbWNJbmZvLm1pbnV0ZXMsXG4gICAgfTtcblxuICAgIC8vIENhbGN1bGF0ZSBwbGFuZXQgcG9zaXRpb25zIHVzaW5nIFN3aXNzIEVwaGVtZXJpcyBmb3IgYWNjdXJhY3lcbiAgICBjb25zdCBwbGFuZXRIb3VzZXM6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7fTtcbiAgICBjb25zdCBwbGFuZXRJZHMgPSBbXG4gICAgICBzd2lzc2VwaC5TRV9TVU4sXG4gICAgICBzd2lzc2VwaC5TRV9NT09OLFxuICAgICAgc3dpc3NlcGguU0VfTUVSQ1VSWSxcbiAgICAgIHN3aXNzZXBoLlNFX1ZFTlVTLFxuICAgICAgc3dpc3NlcGguU0VfTUFSUyxcbiAgICAgIHN3aXNzZXBoLlNFX0pVUElURVIsXG4gICAgICBzd2lzc2VwaC5TRV9TQVRVUk4sXG4gICAgICBzd2lzc2VwaC5TRV9VUkFOVVMsXG4gICAgICBzd2lzc2VwaC5TRV9ORVBUVU5FLFxuICAgICAgc3dpc3NlcGguU0VfUExVVE8sXG4gICAgXTtcbiAgICBjb25zdCBwbGFuZXROYW1lcyA9IFtcbiAgICAgICdzdW4nLFxuICAgICAgJ21vb24nLFxuICAgICAgJ21lcmN1cnknLFxuICAgICAgJ3ZlbnVzJyxcbiAgICAgICdtYXJzJyxcbiAgICAgICdqdXBpdGVyJyxcbiAgICAgICdzYXR1cm4nLFxuICAgICAgJ3VyYW51cycsXG4gICAgICAnbmVwdHVuZScsXG4gICAgICAncGx1dG8nLFxuICAgIF07XG5cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHBsYW5ldElkcy5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3QgcGxhbmV0RGF0YSA9IHN3aXNzZXBoLnN3ZV9jYWxjX3V0KGp1bGlhbkRheSwgcGxhbmV0SWRzW2ldLCBzd2lzc2VwaC5TRUZMR19TUEVFRCk7XG4gICAgICBpZiAocGxhbmV0RGF0YSAmJiBwbGFuZXREYXRhLmxvbmdpdHVkZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGNvbnN0IHBsYW5ldExvbmdpdHVkZSA9IHBsYW5ldERhdGEubG9uZ2l0dWRlO1xuICAgICAgICAvLyBEZXRlcm1pbmUgd2hpY2ggaG91c2UgdGhlIHBsYW5ldCBpcyBpblxuICAgICAgICBmb3IgKGxldCBoID0gMDsgaCA8IDEyOyBoKyspIHtcbiAgICAgICAgICBjb25zdCBjdXJyZW50Q3VzcCA9IGhvdXNlc1toXS5jdXNwRGVncmVlO1xuICAgICAgICAgIGNvbnN0IG5leHRDdXNwID0gaG91c2VzWyhoICsgMSkgJSAxMl0uY3VzcERlZ3JlZTtcblxuICAgICAgICAgIC8vIEhhbmRsZSBjdXNwIHdyYXAtYXJvdW5kIGF0IDM2MCBkZWdyZWVzXG4gICAgICAgICAgaWYgKGN1cnJlbnRDdXNwID4gbmV4dEN1c3ApIHtcbiAgICAgICAgICAgIC8vIEhvdXNlIHNwYW5zIDAgZGVncmVlc1xuICAgICAgICAgICAgaWYgKHBsYW5ldExvbmdpdHVkZSA+PSBjdXJyZW50Q3VzcCB8fCBwbGFuZXRMb25naXR1ZGUgPCBuZXh0Q3VzcCkge1xuICAgICAgICAgICAgICBwbGFuZXRIb3VzZXNbcGxhbmV0TmFtZXNbaV1dID0gaCArIDE7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpZiAocGxhbmV0TG9uZ2l0dWRlID49IGN1cnJlbnRDdXNwICYmIHBsYW5ldExvbmdpdHVkZSA8IG5leHRDdXNwKSB7XG4gICAgICAgICAgICAgIHBsYW5ldEhvdXNlc1twbGFuZXROYW1lc1tpXV0gPSBoICsgMTtcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gQ2xvc2UgU3dpc3MgRXBoZW1lcmlzXG4gICAgc3dpc3NlcGguc3dlX2Nsb3NlKCk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgaG91c2VzLFxuICAgICAgYXNjZW5kYW50LFxuICAgICAgbWlkaGVhdmVuLFxuICAgICAgcGxhbmV0SG91c2VzLFxuICAgIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgY2FsY3VsYXRpbmcgaG91c2VzIHdpdGggU3dpc3MgRXBoZW1lcmlzOicsIGVycm9yKTtcbiAgICAvLyBDbG9zZSBTd2lzcyBFcGhlbWVyaXMgb24gZXJyb3JcbiAgICBpZiAoc3dpc3NlcGggJiYgc3dpc3NlcGguc3dlX2Nsb3NlKSB7XG4gICAgICBzd2lzc2VwaC5zd2VfY2xvc2UoKTtcbiAgICB9XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn07XG5cbmNvbnN0IGdlbmVyYXRlQ2FjaGVLZXkgPSAoXG4gIGJpcnRoRGF0ZTogc3RyaW5nLFxuICBiaXJ0aFRpbWU6IHN0cmluZyxcbiAgbGF0aXR1ZGU6IG51bWJlcixcbiAgbG9uZ2l0dWRlOiBudW1iZXIsXG4pOiBzdHJpbmcgPT4ge1xuICAvLyBPbmx5IGluY2x1ZGUgaW5wdXRzIHRoYXQgYWZmZWN0IGNhbGN1bGF0aW9uc1xuICBjb25zdCBjYWNoZURhdGEgPSB7XG4gICAgYmlydGhEYXRlVGltZTogYCR7YmlydGhEYXRlfVQke2JpcnRoVGltZX06MDBaYCwgLy8gVVRDIElTTyBmb3JtYXRcbiAgICBsYXQ6IGxhdGl0dWRlLFxuICAgIGxvbjogbG9uZ2l0dWRlLFxuICAgIGhvdXNlU3lzdGVtOiAncGxhY2lkdXMnLFxuICAgIHpvZGlhY1R5cGU6ICd0cm9waWNhbCcsXG4gICAgZXBoZW1lcmlzVmVyc2lvbjogJzIuMTAuMDMnLCAvLyBPbmx5IGNoYW5nZSB3aGVuIGVwaGVtZXJpcyBkYXRhIGNoYW5nZXNcbiAgfTtcblxuICAvLyBVc2Ugc3RhYmxlIEpTT04gc3RyaW5naWZpY2F0aW9uIChrZXlzIGluIGFscGhhYmV0aWNhbCBvcmRlcilcbiAgY29uc3Qgc29ydGVkS2V5cyA9IE9iamVjdC5rZXlzKGNhY2hlRGF0YSkuc29ydCgpO1xuICBjb25zdCBzdGFibGVKc29uID0gc29ydGVkS2V5c1xuICAgIC5tYXAoKGtleSkgPT4gYFwiJHtrZXl9XCI6JHtKU09OLnN0cmluZ2lmeShjYWNoZURhdGFba2V5IGFzIGtleW9mIHR5cGVvZiBjYWNoZURhdGFdKX1gKVxuICAgIC5qb2luKCcsJyk7XG4gIGNvbnN0IGlucHV0ID0gYHske3N0YWJsZUpzb259fWA7XG5cbiAgcmV0dXJuIGNyeXB0by5jcmVhdGVIYXNoKCdzaGEyNTYnKS51cGRhdGUoaW5wdXQpLmRpZ2VzdCgnaGV4Jyk7XG59O1xuXG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuY29uc3QgZ2V0Q2FjaGVkSG91c2VEYXRhID0gYXN5bmMgKGNhY2hlS2V5OiBzdHJpbmcpOiBQcm9taXNlPGFueSB8IG51bGw+ID0+IHtcbiAgY29uc3QgTkFUQUxfQ0hBUlRfVEFCTEVfTkFNRSA9IHByb2Nlc3MuZW52Lk5BVEFMX0NIQVJUX1RBQkxFX05BTUUhO1xuXG4gIHRyeSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQoXG4gICAgICBuZXcgR2V0Q29tbWFuZCh7XG4gICAgICAgIFRhYmxlTmFtZTogTkFUQUxfQ0hBUlRfVEFCTEVfTkFNRSxcbiAgICAgICAgS2V5OiB7XG4gICAgICAgICAgdXNlcklkOiBgQ0FDSEUjJHtjYWNoZUtleX1gLFxuICAgICAgICAgIGNoYXJ0VHlwZTogJ2hvdXNlX2NhY2hlJyxcbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICBpZiAocmVzdWx0Lkl0ZW0pIHtcbiAgICAgIGNvbnNvbGUuaW5mbygnQ2FjaGUgaGl0IGZvciBob3VzZSBjYWxjdWxhdGlvbnMnKTtcbiAgICAgIHJldHVybiByZXN1bHQuSXRlbS5ob3VzZURhdGE7XG4gICAgfVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHJldHJpZXZpbmcgY2FjaGVkIGRhdGE6JywgZXJyb3IpO1xuICB9XG5cbiAgcmV0dXJuIG51bGw7XG59O1xuXG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuY29uc3Qgc2F2ZUNhY2hlZEhvdXNlRGF0YSA9IGFzeW5jIChjYWNoZUtleTogc3RyaW5nLCBob3VzZURhdGE6IGFueSk6IFByb21pc2U8dm9pZD4gPT4ge1xuICBjb25zdCBOQVRBTF9DSEFSVF9UQUJMRV9OQU1FID0gcHJvY2Vzcy5lbnYuTkFUQUxfQ0hBUlRfVEFCTEVfTkFNRSE7XG5cbiAgdHJ5IHtcbiAgICBjb25zdCB0dGwgPSBNYXRoLmZsb29yKERhdGUubm93KCkgLyAxMDAwKSArIDMwICogMjQgKiA2MCAqIDYwOyAvLyAzMCBkYXlzIFRUTFxuXG4gICAgYXdhaXQgZG9jQ2xpZW50LnNlbmQoXG4gICAgICBuZXcgUHV0Q29tbWFuZCh7XG4gICAgICAgIFRhYmxlTmFtZTogTkFUQUxfQ0hBUlRfVEFCTEVfTkFNRSxcbiAgICAgICAgSXRlbToge1xuICAgICAgICAgIHVzZXJJZDogYENBQ0hFIyR7Y2FjaGVLZXl9YCxcbiAgICAgICAgICBjaGFydFR5cGU6ICdob3VzZV9jYWNoZScsXG4gICAgICAgICAgaG91c2VEYXRhLFxuICAgICAgICAgIHR0bCxcbiAgICAgICAgICBjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgICk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3Igc2F2aW5nIGNhY2hlZCBkYXRhOicsIGVycm9yKTtcbiAgfVxufTtcblxuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbmV4cG9ydCBjb25zdCBoYW5kbGVyID0gYXN5bmMgKGV2ZW50OiBhbnkpOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgY29uc3QgTkFUQUxfQ0hBUlRfVEFCTEVfTkFNRSA9IHByb2Nlc3MuZW52Lk5BVEFMX0NIQVJUX1RBQkxFX05BTUUhO1xuICBjb25zb2xlLmluZm8oJ1JlY2VpdmVkIGV2ZW50OicsIEpTT04uc3RyaW5naWZ5KGV2ZW50LCBudWxsLCAyKSk7XG5cbiAgY29uc3QgdmFsaWRhdGVkRXZlbnQgPSB2YWxpZGF0ZUV2ZW50KGV2ZW50KTtcbiAgY29uc3QgeyB1c2VySWQsIGJpcnRoRGF0ZSwgbGF0aXR1ZGUsIGxvbmdpdHVkZSwgaWFuYVRpbWVab25lIH0gPSB2YWxpZGF0ZWRFdmVudDtcblxuICAvLyBCaXJ0aCB0aW1lIGlzIG5vdyByZXF1aXJlZCBwZXIgS0FOLTdcbiAgaWYgKCF2YWxpZGF0ZWRFdmVudC5iaXJ0aFRpbWUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0JpcnRoIHRpbWUgaXMgcmVxdWlyZWQgZm9yIGhvdXNlIGNhbGN1bGF0aW9ucycpO1xuICB9XG5cbiAgY29uc3QgYmlydGhUaW1lID0gdmFsaWRhdGVkRXZlbnQuYmlydGhUaW1lO1xuICBjb25zdCBpc1RpbWVFc3RpbWF0ZWQgPSBmYWxzZTsgLy8gU2luY2UgYmlydGggdGltZSBpcyBub3cgcmVxdWlyZWRcblxuICAvLyBDcmVhdGUgYSBkYXRlIG9iamVjdCB0aGF0IHJlcHJlc2VudHMgdGhlIGxvY2FsIHRpbWUgYXQgdGhlIGJpcnRoIGxvY2F0aW9uXG4gIGNvbnN0IGJpcnRoRGF0ZVRpbWVTdHIgPSBgJHtiaXJ0aERhdGV9VCR7YmlydGhUaW1lfTowMGA7XG4gIGNvbnN0IGJpcnRoRGF0ZVRpbWUgPSBuZXcgRGF0ZShiaXJ0aERhdGVUaW1lU3RyKTtcblxuICAvLyBDYWxjdWxhdGUgdGltZXpvbmUgb2Zmc2V0XG4gIGNvbnN0IHRpbWV6b25lT2Zmc2V0SW5Ib3VycyA9XG4gICAgbmV3IERhdGUoXG4gICAgICBiaXJ0aERhdGVUaW1lLnRvTG9jYWxlU3RyaW5nKCdlbi1VUycsIHsgdGltZVpvbmU6IGlhbmFUaW1lWm9uZSB9KSxcbiAgICApLmdldFRpbWV6b25lT2Zmc2V0KCkgLyAtNjA7XG5cbiAgdHJ5IHtcbiAgICAvLyBDYWxjdWxhdGUgcGxhbmV0YXJ5IHBvc2l0aW9ucyB1c2luZyBleGlzdGluZyBlcGhlbWVyaXMgbGlicmFyeVxuICAgIGNvbnN0IGNoYXJ0RGF0YSA9IGdldEFsbFBsYW5ldHMoYmlydGhEYXRlVGltZSwgbG9uZ2l0dWRlLCBsYXRpdHVkZSwgdGltZXpvbmVPZmZzZXRJbkhvdXJzKTtcblxuICAgIC8vIEV4dHJhY3QgcGxhbmV0YXJ5IHBvc2l0aW9ucyBmcm9tIHRoZSBvYnNlcnZlZCBuYW1lc3BhY2VcbiAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgIGNvbnN0IHBsYW5ldHM6IFJlY29yZDxzdHJpbmcsIGFueT4gPSB7fTtcbiAgICBpZiAoY2hhcnREYXRhLm9ic2VydmVkKSB7XG4gICAgICBPYmplY3Qua2V5cyhjaGFydERhdGEub2JzZXJ2ZWQpLmZvckVhY2goKHBsYW5ldE5hbWUpID0+IHtcbiAgICAgICAgY29uc3QgcGxhbmV0RGF0YSA9IGNoYXJ0RGF0YS5vYnNlcnZlZFtwbGFuZXROYW1lXTtcbiAgICAgICAgaWYgKHBsYW5ldERhdGEgJiYgcGxhbmV0TmFtZSAhPT0gJ3Npcml1cycpIHtcbiAgICAgICAgICBjb25zdCBsb25naXR1ZGUgPSBwbGFuZXREYXRhLmFwcGFyZW50TG9uZ2l0dWRlRGQgfHwgMDtcbiAgICAgICAgICAvLyBDYWxjdWxhdGUgem9kaWFjIHNpZ24gaW5mb3JtYXRpb25cbiAgICAgICAgICBjb25zdCBub3JtYWxpemVkTG9uZ2l0dWRlID0gKChsb25naXR1ZGUgJSAzNjApICsgMzYwKSAlIDM2MDtcbiAgICAgICAgICBjb25zdCBzaWduSW5kZXggPSBNYXRoLmZsb29yKG5vcm1hbGl6ZWRMb25naXR1ZGUgLyAzMCk7XG4gICAgICAgICAgY29uc3Qgc2lnbiA9IFpPRElBQ19TSUdOU1tzaWduSW5kZXhdO1xuICAgICAgICAgIGNvbnN0IGRlZ3JlZUluU2lnbiA9IG5vcm1hbGl6ZWRMb25naXR1ZGUgLSBzaWduSW5kZXggKiAzMDtcbiAgICAgICAgICBjb25zdCB3aG9sZURlZ3JlZXMgPSBNYXRoLmZsb29yKGRlZ3JlZUluU2lnbik7XG4gICAgICAgICAgY29uc3QgbWludXRlcyA9IE1hdGgucm91bmQoKGRlZ3JlZUluU2lnbiAtIHdob2xlRGVncmVlcykgKiA2MCk7XG5cbiAgICAgICAgICBwbGFuZXRzW3BsYW5ldE5hbWVdID0ge1xuICAgICAgICAgICAgbG9uZ2l0dWRlOiBsb25naXR1ZGUsXG4gICAgICAgICAgICBsb25naXR1ZGVEbXM6IGAke3dob2xlRGVncmVlcy50b1N0cmluZygpLnBhZFN0YXJ0KDIsICcwJyl9wrAke21pbnV0ZXMudG9TdHJpbmcoKS5wYWRTdGFydCgyLCAnMCcpfScgJHtzaWdufWAsXG4gICAgICAgICAgICBkaXN0YW5jZUttOiBwbGFuZXREYXRhLmdlb2NlbnRyaWNEaXN0YW5jZUttIHx8IDAsXG4gICAgICAgICAgICBuYW1lOiBwbGFuZXREYXRhLm5hbWUgfHwgcGxhbmV0TmFtZSxcbiAgICAgICAgICAgIHNpZ246IHNpZ24sXG4gICAgICAgICAgICBkZWdyZWVJblNpZ246IHdob2xlRGVncmVlcyxcbiAgICAgICAgICAgIG1pbnV0ZXM6IG1pbnV0ZXMsXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgY2FjaGUgZm9yIGhvdXNlIGNhbGN1bGF0aW9uc1xuICAgIGNvbnN0IGNhY2hlS2V5ID0gZ2VuZXJhdGVDYWNoZUtleShiaXJ0aERhdGUsIGJpcnRoVGltZSwgbGF0aXR1ZGUsIGxvbmdpdHVkZSk7XG4gICAgbGV0IGhvdXNlRGF0YSA9IGF3YWl0IGdldENhY2hlZEhvdXNlRGF0YShjYWNoZUtleSk7XG5cbiAgICBpZiAoIWhvdXNlRGF0YSkge1xuICAgICAgLy8gQ2FsY3VsYXRlIGhvdXNlcyB1c2luZyBTd2lzcyBFcGhlbWVyaXNcbiAgICAgIGhvdXNlRGF0YSA9IGF3YWl0IGNhbGN1bGF0ZUhvdXNlc1dpdGhTd2lzc2VwaChiaXJ0aERhdGVUaW1lLCBsYXRpdHVkZSwgbG9uZ2l0dWRlKTtcblxuICAgICAgaWYgKGhvdXNlRGF0YSkge1xuICAgICAgICAvLyBTYXZlIHRvIGNhY2hlXG4gICAgICAgIGF3YWl0IHNhdmVDYWNoZWRIb3VzZURhdGEoY2FjaGVLZXksIGhvdXNlRGF0YSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gUHJlcGFyZSB0aGUgaXRlbSB0byBzdG9yZVxuICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgY29uc3QgaXRlbTogYW55ID0ge1xuICAgICAgdXNlcklkLFxuICAgICAgY2hhcnRUeXBlOiAnbmF0YWwnLFxuICAgICAgY3JlYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICBpc1RpbWVFc3RpbWF0ZWQsXG4gICAgICBiaXJ0aEluZm86IHtcbiAgICAgICAgLi4udmFsaWRhdGVkRXZlbnQsXG4gICAgICAgIGJpcnRoVGltZSxcbiAgICAgIH0sXG4gICAgICBwbGFuZXRzLFxuICAgICAgbWV0YWRhdGE6IHtcbiAgICAgICAgY2FsY3VsYXRpb25UaW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgZXBoZW1lcmlzVmVyc2lvbjogJzIuMTAuMDMnLFxuICAgICAgICBzd2V0ZXN0VmVyc2lvbjogJzIuMTAuMDMnLFxuICAgICAgICBob3VzZVN5c3RlbTogJ3BsYWNpZHVzJyxcbiAgICAgICAgem9kaWFjVHlwZTogJ3Ryb3BpY2FsJyxcbiAgICAgIH0sXG4gICAgfTtcblxuICAgIC8vIEFkZCBob3VzZSBkYXRhIGlmIGF2YWlsYWJsZVxuICAgIGlmIChob3VzZURhdGEpIHtcbiAgICAgIGl0ZW0uaG91c2VzID0ge1xuICAgICAgICBzdGF0dXM6ICdzdWNjZXNzJyxcbiAgICAgICAgZGF0YTogaG91c2VEYXRhLmhvdXNlcyxcbiAgICAgIH07XG4gICAgICBpdGVtLmFzY2VuZGFudCA9IGhvdXNlRGF0YS5hc2NlbmRhbnQ7XG4gICAgICBpdGVtLm1pZGhlYXZlbiA9IGhvdXNlRGF0YS5taWRoZWF2ZW47XG4gICAgICBpdGVtLnBsYW5ldEhvdXNlcyA9IGhvdXNlRGF0YS5wbGFuZXRIb3VzZXM7XG4gICAgfSBlbHNlIHtcbiAgICAgIGl0ZW0uaG91c2VzID0ge1xuICAgICAgICBzdGF0dXM6ICdmYWlsZWQnLFxuICAgICAgICBlcnJvcjogJ0hvdXNlIGNhbGN1bGF0aW9ucyB1bmF2YWlsYWJsZScsXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIFN0b3JlIHRoZSBuYXRhbCBjaGFydFxuICAgIGF3YWl0IGRvY0NsaWVudC5zZW5kKFxuICAgICAgbmV3IFB1dENvbW1hbmQoe1xuICAgICAgICBUYWJsZU5hbWU6IE5BVEFMX0NIQVJUX1RBQkxFX05BTUUsXG4gICAgICAgIEl0ZW06IGl0ZW0sXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgY29uc29sZS5pbmZvKGBTdWNjZXNzZnVsbHkgZ2VuZXJhdGVkIGFuZCBzdG9yZWQgbmF0YWwgY2hhcnQgZm9yIHVzZXJJZDogJHt1c2VySWR9YCk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgY2FsY3VsYXRpbmcgb3Igc3RvcmluZyBuYXRhbCBjaGFydDonLCBlcnJvcik7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn07XG4iXX0=