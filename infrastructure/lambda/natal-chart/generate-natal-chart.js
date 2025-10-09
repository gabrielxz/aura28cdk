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
const luxon_1 = require("luxon");
const dynamoClient = new client_dynamodb_1.DynamoDBClient({});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
// Import swisseph from the Lambda Layer
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let swisseph;
let ephemerisPath;
// Cold start logging for ephemeris path verification
const initSwissEph = () => {
    // Try different paths to find Swiss Ephemeris
    const path = require('path');
    const fs = require('fs');
    // Use environment variables if set (for test environments)
    if (process.env.SE_EPHE_PATH && process.env.EPHEMERIS_PATH) {
        const testModulePath = path.dirname(process.env.SE_EPHE_PATH);
        if (fs.existsSync(testModulePath)) {
            try {
                swisseph = require(testModulePath);
                ephemerisPath = process.env.SE_EPHE_PATH;
                console.info('Swiss Ephemeris initialization (from env):', {
                    path: ephemerisPath,
                    modulePath: testModulePath,
                    envSE_EPHE_PATH: process.env.SE_EPHE_PATH,
                    envEPHEMERIS_PATH: process.env.EPHEMERIS_PATH,
                });
                // Verify ephemeris directory exists
                if (fs.existsSync(ephemerisPath)) {
                    const files = fs.readdirSync(ephemerisPath);
                    const seFiles = files.filter((f) => f.endsWith('.se1') || f === 'seleapsec.txt' || f === 'seorbel.txt');
                    console.info('Ephemeris files found:', seFiles.length, 'files:', seFiles.slice(0, 5));
                }
                else {
                    console.error('Ephemeris directory does not exist:', ephemerisPath);
                }
                return; // Successfully loaded from environment
            }
            catch (e) {
                console.warn('Failed to load from environment paths:', e);
            }
        }
    }
    const possiblePaths = [
        '/opt/nodejs/node_modules/swisseph', // Lambda layer path
        path.join(__dirname, '../../layers/swetest/layer/nodejs/node_modules/swisseph'), // Test environment path
        'swisseph', // Normal require path
    ];
    for (const modulePath of possiblePaths) {
        try {
            swisseph = require(modulePath);
            // Set ephemeris path based on environment
            if (process.env.SE_EPHE_PATH) {
                ephemerisPath = process.env.SE_EPHE_PATH;
            }
            else if (process.env.EPHEMERIS_PATH) {
                ephemerisPath = process.env.EPHEMERIS_PATH;
            }
            else if (modulePath.startsWith('/opt')) {
                ephemerisPath = '/opt/nodejs/node_modules/swisseph/ephe';
            }
            else if (modulePath.includes('layers/swetest')) {
                ephemerisPath = path.join(modulePath, 'ephe');
            }
            else {
                ephemerisPath = path.join(path.dirname(require.resolve(modulePath)), 'ephe');
            }
            // Log ephemeris path on cold start
            console.info('Swiss Ephemeris initialization:', {
                path: ephemerisPath,
                modulePath: modulePath,
                envSE_EPHE_PATH: process.env.SE_EPHE_PATH,
                envEPHEMERIS_PATH: process.env.EPHEMERIS_PATH,
            });
            // Verify ephemeris directory exists
            if (fs.existsSync(ephemerisPath)) {
                const files = fs.readdirSync(ephemerisPath);
                const seFiles = files.filter((f) => f.endsWith('.se1') || f === 'seleapsec.txt' || f === 'seorbel.txt');
                console.info('Ephemeris files found:', seFiles.length, 'files:', seFiles.slice(0, 5));
            }
            else {
                console.error('Ephemeris directory does not exist:', ephemerisPath);
            }
            // Successfully loaded
            break;
        }
        catch (_error) {
            // Try next path
            continue;
        }
    }
    if (!swisseph) {
        console.error('Swiss Ephemeris not available from any path');
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
/**
 * Generate cache key for house calculations.
 *
 * Note: ephemerisVersion includes '-tz-fix' suffix to invalidate all cached
 * entries calculated with the incorrect timezone offset. This ensures users
 * get accurate recalculations with the fixed timezone logic.
 */
const generateCacheKey = (birthDate, birthTime, latitude, longitude) => {
    // Only include inputs that affect calculations
    const cacheData = {
        birthDateTime: `${birthDate}T${birthTime}:00Z`, // UTC ISO format
        lat: latitude,
        lon: longitude,
        houseSystem: 'placidus',
        zodiacType: 'tropical',
        ephemerisVersion: '2.10.03-tz-fix', // Only change when ephemeris data changes
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
    /**
     * Calculate timezone offset using Luxon for accurate historical timezone handling.
     *
     * Previous implementation used Date.toLocaleString() which was incorrect because:
     * 1. It converted to locale string (losing timezone info)
     * 2. Created new Date in system timezone (not birth location timezone)
     * 3. Returned Lambda execution environment offset instead of birth location offset
     *
     * Luxon correctly:
     * - Parses date/time in the specified IANA timezone
     * - Calculates accurate historical offsets (including DST)
     * - Returns the offset for the birth location and date
     */
    const birthDateTimeStr = `${birthDate}T${birthTime}:00`;
    const birthDateTimeLocal = luxon_1.DateTime.fromISO(birthDateTimeStr, { zone: ianaTimeZone });
    // Calculate accurate timezone offset in hours
    const timezoneOffsetInHours = birthDateTimeLocal.offset / 60;
    // Log timezone calculation details for debugging
    console.info('Timezone calculation:', {
        birthDateTimeStr,
        ianaTimeZone,
        localDateTime: birthDateTimeLocal.toString(),
        offset: birthDateTimeLocal.offset,
        offsetInHours: timezoneOffsetInHours,
        utcDateTime: birthDateTimeLocal.toUTC().toISO(),
    });
    // Convert to JavaScript Date for ephemeris library (in UTC)
    const birthDateTime = birthDateTimeLocal.toJSDate();
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGUtbmF0YWwtY2hhcnQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJnZW5lcmF0ZS1uYXRhbC1jaGFydC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLDhEQUEwRDtBQUMxRCx3REFBdUY7QUFDdkYseUNBQTBDO0FBQzFDLCtDQUFpQztBQUNqQyxpQ0FBaUM7QUFFakMsTUFBTSxZQUFZLEdBQUcsSUFBSSxnQ0FBYyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBQzVDLE1BQU0sU0FBUyxHQUFHLHFDQUFzQixDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztBQUU1RCx3Q0FBd0M7QUFDeEMsOERBQThEO0FBQzlELElBQUksUUFBYSxDQUFDO0FBQ2xCLElBQUksYUFBaUMsQ0FBQztBQUV0QyxxREFBcUQ7QUFDckQsTUFBTSxZQUFZLEdBQUcsR0FBRyxFQUFFO0lBQ3hCLDhDQUE4QztJQUM5QyxNQUFNLElBQUksR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDN0IsTUFBTSxFQUFFLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBRXpCLDJEQUEyRDtJQUMzRCxJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsWUFBWSxJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsY0FBYyxFQUFFLENBQUM7UUFDM0QsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQzlELElBQUksRUFBRSxDQUFDLFVBQVUsQ0FBQyxjQUFjLENBQUMsRUFBRSxDQUFDO1lBQ2xDLElBQUksQ0FBQztnQkFDSCxRQUFRLEdBQUcsT0FBTyxDQUFDLGNBQWMsQ0FBQyxDQUFDO2dCQUNuQyxhQUFhLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUM7Z0JBRXpDLE9BQU8sQ0FBQyxJQUFJLENBQUMsNENBQTRDLEVBQUU7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QVMsQ0FBQyxJQUFJLENBQ2xCLElBQUkseUJBQVUsQ0FBQztZQUNiLFNBQVMsRUFBRSxzQkFBc0I7WUFDakMsSUFBSSxFQUFFLElBQUk7U0FDWCxDQUFDLENBQ0gsQ0FBQztRQUVGLE9BQU8sQ0FBQyxJQUFJLENBQUMsNkRBQTZELE1BQU0sRUFBRSxDQUFDLENBQUM7SUFDdEYsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLDJDQUEyQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ2xFLE1BQU0sS0FBSyxDQUFDO0lBQ2QsQ0FBQztBQUNILENBQUMsQ0FBQztBQWhKVyxRQUFBLE9BQU8sV0FnSmxCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgRHluYW1vREJDbGllbnQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtZHluYW1vZGInO1xuaW1wb3J0IHsgRHluYW1vREJEb2N1bWVudENsaWVudCwgUHV0Q29tbWFuZCwgR2V0Q29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYic7XG5pbXBvcnQgeyBnZXRBbGxQbGFuZXRzIH0gZnJvbSAnZXBoZW1lcmlzJztcbmltcG9ydCAqIGFzIGNyeXB0byBmcm9tICdjcnlwdG8nO1xuaW1wb3J0IHsgRGF0ZVRpbWUgfSBmcm9tICdsdXhvbic7XG5cbmNvbnN0IGR5bmFtb0NsaWVudCA9IG5ldyBEeW5hbW9EQkNsaWVudCh7fSk7XG5jb25zdCBkb2NDbGllbnQgPSBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LmZyb20oZHluYW1vQ2xpZW50KTtcblxuLy8gSW1wb3J0IHN3aXNzZXBoIGZyb20gdGhlIExhbWJkYSBMYXllclxuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbmxldCBzd2lzc2VwaDogYW55O1xubGV0IGVwaGVtZXJpc1BhdGg6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuLy8gQ29sZCBzdGFydCBsb2dnaW5nIGZvciBlcGhlbWVyaXMgcGF0aCB2ZXJpZmljYXRpb25cbmNvbnN0IGluaXRTd2lzc0VwaCA9ICgpID0+IHtcbiAgLy8gVHJ5IGRpZmZlcmVudCBwYXRocyB0byBmaW5kIFN3aXNzIEVwaGVtZXJpc1xuICBjb25zdCBwYXRoID0gcmVxdWlyZSgncGF0aCcpO1xuICBjb25zdCBmcyA9IHJlcXVpcmUoJ2ZzJyk7XG5cbiAgLy8gVXNlIGVudmlyb25tZW50IHZhcmlhYmxlcyBpZiBzZXQgKGZvciB0ZXN0IGVudmlyb25tZW50cylcbiAgaWYgKHByb2Nlc3MuZW52LlNFX0VQSEVfUEFUSCAmJiBwcm9jZXNzLmVudi5FUEhFTUVSSVNfUEFUSCkge1xuICAgIGNvbnN0IHRlc3RNb2R1bGVQYXRoID0gcGF0aC5kaXJuYW1lKHByb2Nlc3MuZW52LlNFX0VQSEVfUEFUSCk7XG4gICAgaWYgKGZzLmV4aXN0c1N5bmModGVzdE1vZHVsZVBhdGgpKSB7XG4gICAgICB0cnkge1xuICAgICAgICBzd2lzc2VwaCA9IHJlcXVpcmUodGVzdE1vZHVsZVBhdGgpO1xuICAgICAgICBlcGhlbWVyaXNQYXRoID0gcHJvY2Vzcy5lbnYuU0VfRVBIRV9QQVRIO1xuXG4gICAgICAgIGNvbnNvbGUuaW5mbygnU3dpc3MgRXBoZW1lcmlzIGluaXRpYWxpemF0aW9uIChmcm9tIGVudik6Jywge1xuICAgICAgICAgIHBhdGg6IGVwaGVtZXJpc1BhdGgsXG4gICAgICAgICAgbW9kdWxlUGF0aDogdGVzdE1vZHVsZVBhdGgsXG4gICAgICAgICAgZW52U0VfRVBIRV9QQVRIOiBwcm9jZXNzLmVudi5TRV9FUEhFX1BBVEgsXG4gICAgICAgICAgZW52RVBIRU1FUklTX1BBVEg6IHByb2Nlc3MuZW52LkVQSEVNRVJJU19QQVRILFxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBWZXJpZnkgZXBoZW1lcmlzIGRpcmVjdG9yeSBleGlzdHNcbiAgICAgICAgaWYgKGZzLmV4aXN0c1N5bmMoZXBoZW1lcmlzUGF0aCkpIHtcbiAgICAgICAgICBjb25zdCBmaWxlcyA9IGZzLnJlYWRkaXJTeW5jKGVwaGVtZXJpc1BhdGgpO1xuICAgICAgICAgIGNvbnN0IHNlRmlsZXMgPSBmaWxlcy5maWx0ZXIoXG4gICAgICAgICAgICAoZjogc3RyaW5nKSA9PiBmLmVuZHNXaXRoKCcuc2UxJykgfHwgZiA9PT0gJ3NlbGVhcHNlYy50eHQnIHx8IGYgPT09ICdzZW9yYmVsLnR4dCcsXG4gICAgICAgICAgKTtcbiAgICAgICAgICBjb25zb2xlLmluZm8oJ0VwaGVtZXJpcyBmaWxlcyBmb3VuZDonLCBzZUZpbGVzLmxlbmd0aCwgJ2ZpbGVzOicsIHNlRmlsZXMuc2xpY2UoMCwgNSkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0VwaGVtZXJpcyBkaXJlY3RvcnkgZG9lcyBub3QgZXhpc3Q6JywgZXBoZW1lcmlzUGF0aCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm47IC8vIFN1Y2Nlc3NmdWxseSBsb2FkZWQgZnJvbSBlbnZpcm9ubWVudFxuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLndhcm4oJ0ZhaWxlZCB0byBsb2FkIGZyb20gZW52aXJvbm1lbnQgcGF0aHM6JywgZSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgY29uc3QgcG9zc2libGVQYXRocyA9IFtcbiAgICAnL29wdC9ub2RlanMvbm9kZV9tb2R1bGVzL3N3aXNzZXBoJywgLy8gTGFtYmRhIGxheWVyIHBhdGhcbiAgICBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vbGF5ZXJzL3N3ZXRlc3QvbGF5ZXIvbm9kZWpzL25vZGVfbW9kdWxlcy9zd2lzc2VwaCcpLCAvLyBUZXN0IGVudmlyb25tZW50IHBhdGhcbiAgICAnc3dpc3NlcGgnLCAvLyBOb3JtYWwgcmVxdWlyZSBwYXRoXG4gIF07XG5cbiAgZm9yIChjb25zdCBtb2R1bGVQYXRoIG9mIHBvc3NpYmxlUGF0aHMpIHtcbiAgICB0cnkge1xuICAgICAgc3dpc3NlcGggPSByZXF1aXJlKG1vZHVsZVBhdGgpO1xuXG4gICAgICAvLyBTZXQgZXBoZW1lcmlzIHBhdGggYmFzZWQgb24gZW52aXJvbm1lbnRcbiAgICAgIGlmIChwcm9jZXNzLmVudi5TRV9FUEhFX1BBVEgpIHtcbiAgICAgICAgZXBoZW1lcmlzUGF0aCA9IHByb2Nlc3MuZW52LlNFX0VQSEVfUEFUSDtcbiAgICAgIH0gZWxzZSBpZiAocHJvY2Vzcy5lbnYuRVBIRU1FUklTX1BBVEgpIHtcbiAgICAgICAgZXBoZW1lcmlzUGF0aCA9IHByb2Nlc3MuZW52LkVQSEVNRVJJU19QQVRIO1xuICAgICAgfSBlbHNlIGlmIChtb2R1bGVQYXRoLnN0YXJ0c1dpdGgoJy9vcHQnKSkge1xuICAgICAgICBlcGhlbWVyaXNQYXRoID0gJy9vcHQvbm9kZWpzL25vZGVfbW9kdWxlcy9zd2lzc2VwaC9lcGhlJztcbiAgICAgIH0gZWxzZSBpZiAobW9kdWxlUGF0aC5pbmNsdWRlcygnbGF5ZXJzL3N3ZXRlc3QnKSkge1xuICAgICAgICBlcGhlbWVyaXNQYXRoID0gcGF0aC5qb2luKG1vZHVsZVBhdGgsICdlcGhlJyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBlcGhlbWVyaXNQYXRoID0gcGF0aC5qb2luKHBhdGguZGlybmFtZShyZXF1aXJlLnJlc29sdmUobW9kdWxlUGF0aCkpLCAnZXBoZScpO1xuICAgICAgfVxuXG4gICAgICAvLyBMb2cgZXBoZW1lcmlzIHBhdGggb24gY29sZCBzdGFydFxuICAgICAgY29uc29sZS5pbmZvKCdTd2lzcyBFcGhlbWVyaXMgaW5pdGlhbGl6YXRpb246Jywge1xuICAgICAgICBwYXRoOiBlcGhlbWVyaXNQYXRoLFxuICAgICAgICBtb2R1bGVQYXRoOiBtb2R1bGVQYXRoLFxuICAgICAgICBlbnZTRV9FUEhFX1BBVEg6IHByb2Nlc3MuZW52LlNFX0VQSEVfUEFUSCxcbiAgICAgICAgZW52RVBIRU1FUklTX1BBVEg6IHByb2Nlc3MuZW52LkVQSEVNRVJJU19QQVRILFxuICAgICAgfSk7XG5cbiAgICAgIC8vIFZlcmlmeSBlcGhlbWVyaXMgZGlyZWN0b3J5IGV4aXN0c1xuICAgICAgaWYgKGZzLmV4aXN0c1N5bmMoZXBoZW1lcmlzUGF0aCkpIHtcbiAgICAgICAgY29uc3QgZmlsZXMgPSBmcy5yZWFkZGlyU3luYyhlcGhlbWVyaXNQYXRoKTtcbiAgICAgICAgY29uc3Qgc2VGaWxlcyA9IGZpbGVzLmZpbHRlcihcbiAgICAgICAgICAoZjogc3RyaW5nKSA9PiBmLmVuZHNXaXRoKCcuc2UxJykgfHwgZiA9PT0gJ3NlbGVhcHNlYy50eHQnIHx8IGYgPT09ICdzZW9yYmVsLnR4dCcsXG4gICAgICAgICk7XG4gICAgICAgIGNvbnNvbGUuaW5mbygnRXBoZW1lcmlzIGZpbGVzIGZvdW5kOicsIHNlRmlsZXMubGVuZ3RoLCAnZmlsZXM6Jywgc2VGaWxlcy5zbGljZSgwLCA1KSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdFcGhlbWVyaXMgZGlyZWN0b3J5IGRvZXMgbm90IGV4aXN0OicsIGVwaGVtZXJpc1BhdGgpO1xuICAgICAgfVxuXG4gICAgICAvLyBTdWNjZXNzZnVsbHkgbG9hZGVkXG4gICAgICBicmVhaztcbiAgICB9IGNhdGNoIChfZXJyb3IpIHtcbiAgICAgIC8vIFRyeSBuZXh0IHBhdGhcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgfVxuXG4gIGlmICghc3dpc3NlcGgpIHtcbiAgICBjb25zb2xlLmVycm9yKCdTd2lzcyBFcGhlbWVyaXMgbm90IGF2YWlsYWJsZSBmcm9tIGFueSBwYXRoJyk7XG4gIH1cbn07XG5cbi8vIEluaXRpYWxpemUgb24gY29sZCBzdGFydFxuaW5pdFN3aXNzRXBoKCk7XG5cbmludGVyZmFjZSBOYXRhbENoYXJ0RXZlbnQge1xuICB1c2VySWQ6IHN0cmluZztcbiAgYmlydGhEYXRlOiBzdHJpbmc7IC8vIFlZWVktTU0tRERcbiAgYmlydGhUaW1lPzogc3RyaW5nOyAvLyBISDpNTVxuICBsYXRpdHVkZTogbnVtYmVyO1xuICBsb25naXR1ZGU6IG51bWJlcjtcbiAgaWFuYVRpbWVab25lOiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBIb3VzZURhdGEge1xuICBob3VzZU51bWJlcjogbnVtYmVyO1xuICBjdXNwRGVncmVlOiBudW1iZXI7XG4gIGN1c3BTaWduOiBzdHJpbmc7XG4gIGN1c3BEZWdyZWVJblNpZ246IG51bWJlcjtcbiAgY3VzcE1pbnV0ZXM6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIEFuZ2xlRGF0YSB7XG4gIGRlZ3JlZTogbnVtYmVyO1xuICBzaWduOiBzdHJpbmc7XG4gIGRlZ3JlZUluU2lnbjogbnVtYmVyO1xuICBtaW51dGVzOiBudW1iZXI7XG59XG5cbmNvbnN0IFpPRElBQ19TSUdOUyA9IFtcbiAgJ0FyaWVzJyxcbiAgJ1RhdXJ1cycsXG4gICdHZW1pbmknLFxuICAnQ2FuY2VyJyxcbiAgJ0xlbycsXG4gICdWaXJnbycsXG4gICdMaWJyYScsXG4gICdTY29ycGlvJyxcbiAgJ1NhZ2l0dGFyaXVzJyxcbiAgJ0NhcHJpY29ybicsXG4gICdBcXVhcml1cycsXG4gICdQaXNjZXMnLFxuXTtcblxuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbmNvbnN0IHZhbGlkYXRlRXZlbnQgPSAoZXZlbnQ6IGFueSk6IE5hdGFsQ2hhcnRFdmVudCA9PiB7XG4gIGlmIChcbiAgICAhZXZlbnQudXNlcklkIHx8XG4gICAgIWV2ZW50LmJpcnRoRGF0ZSB8fFxuICAgICFldmVudC5sYXRpdHVkZSB8fFxuICAgICFldmVudC5sb25naXR1ZGUgfHxcbiAgICAhZXZlbnQuaWFuYVRpbWVab25lXG4gICkge1xuICAgIHRocm93IG5ldyBFcnJvcignTWlzc2luZyByZXF1aXJlZCBldmVudCBwcm9wZXJ0aWVzJyk7XG4gIH1cblxuICAvLyBWYWxpZGF0ZSBjb29yZGluYXRlc1xuICBpZiAoZXZlbnQubGF0aXR1ZGUgPCAtOTAgfHwgZXZlbnQubGF0aXR1ZGUgPiA5MCkge1xuICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBsYXRpdHVkZTogbXVzdCBiZSBiZXR3ZWVuIC05MCBhbmQgOTAnKTtcbiAgfVxuICBpZiAoZXZlbnQubG9uZ2l0dWRlIDwgLTE4MCB8fCBldmVudC5sb25naXR1ZGUgPiAxODApIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgbG9uZ2l0dWRlOiBtdXN0IGJlIGJldHdlZW4gLTE4MCBhbmQgMTgwJyk7XG4gIH1cblxuICByZXR1cm4gZXZlbnQ7XG59O1xuXG5jb25zdCBnZXREZWdyZWVJbmZvID0gKGRlZ3JlZTogbnVtYmVyKTogeyBzaWduOiBzdHJpbmc7IGRlZ3JlZUluU2lnbjogbnVtYmVyOyBtaW51dGVzOiBudW1iZXIgfSA9PiB7XG4gIGNvbnN0IG5vcm1hbGl6ZWREZWdyZWUgPSBkZWdyZWUgJSAzNjA7XG4gIGNvbnN0IHNpZ25JbmRleCA9IE1hdGguZmxvb3Iobm9ybWFsaXplZERlZ3JlZSAvIDMwKTtcbiAgY29uc3QgZGVncmVlSW5TaWduID0gbm9ybWFsaXplZERlZ3JlZSAlIDMwO1xuICBjb25zdCB3aG9sZURlZ3JlZXMgPSBNYXRoLmZsb29yKGRlZ3JlZUluU2lnbik7XG4gIGNvbnN0IG1pbnV0ZXMgPSBNYXRoLnJvdW5kKChkZWdyZWVJblNpZ24gLSB3aG9sZURlZ3JlZXMpICogNjApO1xuXG4gIHJldHVybiB7XG4gICAgc2lnbjogWk9ESUFDX1NJR05TW3NpZ25JbmRleF0sXG4gICAgZGVncmVlSW5TaWduOiB3aG9sZURlZ3JlZXMsXG4gICAgbWludXRlcyxcbiAgfTtcbn07XG5cbmNvbnN0IGNhbGN1bGF0ZUhvdXNlc1dpdGhTd2lzc2VwaCA9IGFzeW5jIChcbiAgYmlydGhEYXRlVGltZTogRGF0ZSxcbiAgbGF0aXR1ZGU6IG51bWJlcixcbiAgbG9uZ2l0dWRlOiBudW1iZXIsXG4pOiBQcm9taXNlPHtcbiAgaG91c2VzOiBIb3VzZURhdGFbXTtcbiAgYXNjZW5kYW50OiBBbmdsZURhdGE7XG4gIG1pZGhlYXZlbjogQW5nbGVEYXRhO1xuICBwbGFuZXRIb3VzZXM6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG59IHwgbnVsbD4gPT4ge1xuICBpZiAoIXN3aXNzZXBoKSB7XG4gICAgY29uc29sZS53YXJuKCdTd2lzcyBFcGhlbWVyaXMgbm90IGF2YWlsYWJsZSwgc2tpcHBpbmcgaG91c2UgY2FsY3VsYXRpb25zJyk7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICB0cnkge1xuICAgIC8vIFNldCBlcGhlbWVyaXMgcGF0aCBleHBsaWNpdGx5XG4gICAgY29uc3QgZXBoZVBhdGggPVxuICAgICAgZXBoZW1lcmlzUGF0aCB8fFxuICAgICAgcHJvY2Vzcy5lbnYuU0VfRVBIRV9QQVRIIHx8XG4gICAgICBwcm9jZXNzLmVudi5FUEhFTUVSSVNfUEFUSCB8fFxuICAgICAgJy9vcHQvbm9kZWpzL25vZGVfbW9kdWxlcy9zd2lzc2VwaC9lcGhlJztcbiAgICBzd2lzc2VwaC5zd2Vfc2V0X2VwaGVfcGF0aChlcGhlUGF0aCk7XG4gICAgY29uc29sZS5pbmZvKCdTZXR0aW5nIGVwaGVtZXJpcyBwYXRoIGZvciBob3VzZSBjYWxjdWxhdGlvbnM6JywgZXBoZVBhdGgpO1xuXG4gICAgLy8gQ2FsY3VsYXRlIEp1bGlhbiBEYXlcbiAgICBjb25zdCB5ZWFyID0gYmlydGhEYXRlVGltZS5nZXRVVENGdWxsWWVhcigpO1xuICAgIGNvbnN0IG1vbnRoID0gYmlydGhEYXRlVGltZS5nZXRVVENNb250aCgpICsgMTtcbiAgICBjb25zdCBkYXkgPSBiaXJ0aERhdGVUaW1lLmdldFVUQ0RhdGUoKTtcbiAgICBjb25zdCBob3VyID1cbiAgICAgIGJpcnRoRGF0ZVRpbWUuZ2V0VVRDSG91cnMoKSArXG4gICAgICBiaXJ0aERhdGVUaW1lLmdldFVUQ01pbnV0ZXMoKSAvIDYwICtcbiAgICAgIGJpcnRoRGF0ZVRpbWUuZ2V0VVRDU2Vjb25kcygpIC8gMzYwMDtcblxuICAgIGNvbnN0IGp1bGlhbkRheSA9IHN3aXNzZXBoLnN3ZV9qdWxkYXkoeWVhciwgbW9udGgsIGRheSwgaG91ciwgc3dpc3NlcGguU0VfR1JFR19DQUwpO1xuXG4gICAgLy8gQ2FsY3VsYXRlIGhvdXNlcyB1c2luZyBQbGFjaWR1cyBzeXN0ZW1cbiAgICBjb25zdCBob3VzZURhdGEgPSBzd2lzc2VwaC5zd2VfaG91c2VzKFxuICAgICAganVsaWFuRGF5LFxuICAgICAgbGF0aXR1ZGUsXG4gICAgICBsb25naXR1ZGUsXG4gICAgICAnUCcsIC8vIFBsYWNpZHVzIGhvdXNlIHN5c3RlbVxuICAgICk7XG5cbiAgICBpZiAoIWhvdXNlRGF0YSB8fCAhaG91c2VEYXRhLmhvdXNlIHx8ICFob3VzZURhdGEuYXNjZW5kYW50IHx8ICFob3VzZURhdGEubWMpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignRmFpbGVkIHRvIGNhbGN1bGF0ZSBob3VzZXMnKTtcbiAgICB9XG5cbiAgICAvLyBQcm9jZXNzIGhvdXNlIGN1c3BzXG4gICAgY29uc3QgaG91c2VzOiBIb3VzZURhdGFbXSA9IFtdO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgMTI7IGkrKykge1xuICAgICAgY29uc3QgY3VzcERlZ3JlZSA9IGhvdXNlRGF0YS5ob3VzZVtpXTtcbiAgICAgIGNvbnN0IGRlZ3JlZUluZm8gPSBnZXREZWdyZWVJbmZvKGN1c3BEZWdyZWUpO1xuICAgICAgaG91c2VzLnB1c2goe1xuICAgICAgICBob3VzZU51bWJlcjogaSArIDEsXG4gICAgICAgIGN1c3BEZWdyZWUsXG4gICAgICAgIGN1c3BTaWduOiBkZWdyZWVJbmZvLnNpZ24sXG4gICAgICAgIGN1c3BEZWdyZWVJblNpZ246IGRlZ3JlZUluZm8uZGVncmVlSW5TaWduLFxuICAgICAgICBjdXNwTWludXRlczogZGVncmVlSW5mby5taW51dGVzLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gUHJvY2VzcyBBc2NlbmRhbnRcbiAgICBjb25zdCBhc2NJbmZvID0gZ2V0RGVncmVlSW5mbyhob3VzZURhdGEuYXNjZW5kYW50KTtcbiAgICBjb25zdCBhc2NlbmRhbnQ6IEFuZ2xlRGF0YSA9IHtcbiAgICAgIGRlZ3JlZTogaG91c2VEYXRhLmFzY2VuZGFudCxcbiAgICAgIHNpZ246IGFzY0luZm8uc2lnbixcbiAgICAgIGRlZ3JlZUluU2lnbjogYXNjSW5mby5kZWdyZWVJblNpZ24sXG4gICAgICBtaW51dGVzOiBhc2NJbmZvLm1pbnV0ZXMsXG4gICAgfTtcblxuICAgIC8vIFByb2Nlc3MgTWlkaGVhdmVuXG4gICAgY29uc3QgbWNJbmZvID0gZ2V0RGVncmVlSW5mbyhob3VzZURhdGEubWMpO1xuICAgIGNvbnN0IG1pZGhlYXZlbjogQW5nbGVEYXRhID0ge1xuICAgICAgZGVncmVlOiBob3VzZURhdGEubWMsXG4gICAgICBzaWduOiBtY0luZm8uc2lnbixcbiAgICAgIGRlZ3JlZUluU2lnbjogbWNJbmZvLmRlZ3JlZUluU2lnbixcbiAgICAgIG1pbnV0ZXM6IG1jSW5mby5taW51dGVzLFxuICAgIH07XG5cbiAgICAvLyBDYWxjdWxhdGUgcGxhbmV0IHBvc2l0aW9ucyB1c2luZyBTd2lzcyBFcGhlbWVyaXMgZm9yIGFjY3VyYWN5XG4gICAgY29uc3QgcGxhbmV0SG91c2VzOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+ID0ge307XG4gICAgY29uc3QgcGxhbmV0SWRzID0gW1xuICAgICAgc3dpc3NlcGguU0VfU1VOLFxuICAgICAgc3dpc3NlcGguU0VfTU9PTixcbiAgICAgIHN3aXNzZXBoLlNFX01FUkNVUlksXG4gICAgICBzd2lzc2VwaC5TRV9WRU5VUyxcbiAgICAgIHN3aXNzZXBoLlNFX01BUlMsXG4gICAgICBzd2lzc2VwaC5TRV9KVVBJVEVSLFxuICAgICAgc3dpc3NlcGguU0VfU0FUVVJOLFxuICAgICAgc3dpc3NlcGguU0VfVVJBTlVTLFxuICAgICAgc3dpc3NlcGguU0VfTkVQVFVORSxcbiAgICAgIHN3aXNzZXBoLlNFX1BMVVRPLFxuICAgIF07XG4gICAgY29uc3QgcGxhbmV0TmFtZXMgPSBbXG4gICAgICAnc3VuJyxcbiAgICAgICdtb29uJyxcbiAgICAgICdtZXJjdXJ5JyxcbiAgICAgICd2ZW51cycsXG4gICAgICAnbWFycycsXG4gICAgICAnanVwaXRlcicsXG4gICAgICAnc2F0dXJuJyxcbiAgICAgICd1cmFudXMnLFxuICAgICAgJ25lcHR1bmUnLFxuICAgICAgJ3BsdXRvJyxcbiAgICBdO1xuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBwbGFuZXRJZHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IHBsYW5ldERhdGEgPSBzd2lzc2VwaC5zd2VfY2FsY191dChqdWxpYW5EYXksIHBsYW5ldElkc1tpXSwgc3dpc3NlcGguU0VGTEdfU1BFRUQpO1xuICAgICAgaWYgKHBsYW5ldERhdGEgJiYgcGxhbmV0RGF0YS5sb25naXR1ZGUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBjb25zdCBwbGFuZXRMb25naXR1ZGUgPSBwbGFuZXREYXRhLmxvbmdpdHVkZTtcbiAgICAgICAgLy8gRGV0ZXJtaW5lIHdoaWNoIGhvdXNlIHRoZSBwbGFuZXQgaXMgaW5cbiAgICAgICAgZm9yIChsZXQgaCA9IDA7IGggPCAxMjsgaCsrKSB7XG4gICAgICAgICAgY29uc3QgY3VycmVudEN1c3AgPSBob3VzZXNbaF0uY3VzcERlZ3JlZTtcbiAgICAgICAgICBjb25zdCBuZXh0Q3VzcCA9IGhvdXNlc1soaCArIDEpICUgMTJdLmN1c3BEZWdyZWU7XG5cbiAgICAgICAgICAvLyBIYW5kbGUgY3VzcCB3cmFwLWFyb3VuZCBhdCAzNjAgZGVncmVlc1xuICAgICAgICAgIGlmIChjdXJyZW50Q3VzcCA+IG5leHRDdXNwKSB7XG4gICAgICAgICAgICAvLyBIb3VzZSBzcGFucyAwIGRlZ3JlZXNcbiAgICAgICAgICAgIGlmIChwbGFuZXRMb25naXR1ZGUgPj0gY3VycmVudEN1c3AgfHwgcGxhbmV0TG9uZ2l0dWRlIDwgbmV4dEN1c3ApIHtcbiAgICAgICAgICAgICAgcGxhbmV0SG91c2VzW3BsYW5ldE5hbWVzW2ldXSA9IGggKyAxO1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKHBsYW5ldExvbmdpdHVkZSA+PSBjdXJyZW50Q3VzcCAmJiBwbGFuZXRMb25naXR1ZGUgPCBuZXh0Q3VzcCkge1xuICAgICAgICAgICAgICBwbGFuZXRIb3VzZXNbcGxhbmV0TmFtZXNbaV1dID0gaCArIDE7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIENsb3NlIFN3aXNzIEVwaGVtZXJpc1xuICAgIHN3aXNzZXBoLnN3ZV9jbG9zZSgpO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGhvdXNlcyxcbiAgICAgIGFzY2VuZGFudCxcbiAgICAgIG1pZGhlYXZlbixcbiAgICAgIHBsYW5ldEhvdXNlcyxcbiAgICB9O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGNhbGN1bGF0aW5nIGhvdXNlcyB3aXRoIFN3aXNzIEVwaGVtZXJpczonLCBlcnJvcik7XG4gICAgLy8gQ2xvc2UgU3dpc3MgRXBoZW1lcmlzIG9uIGVycm9yXG4gICAgaWYgKHN3aXNzZXBoICYmIHN3aXNzZXBoLnN3ZV9jbG9zZSkge1xuICAgICAgc3dpc3NlcGguc3dlX2Nsb3NlKCk7XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xuICB9XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIGNhY2hlIGtleSBmb3IgaG91c2UgY2FsY3VsYXRpb25zLlxuICpcbiAqIE5vdGU6IGVwaGVtZXJpc1ZlcnNpb24gaW5jbHVkZXMgJy10ei1maXgnIHN1ZmZpeCB0byBpbnZhbGlkYXRlIGFsbCBjYWNoZWRcbiAqIGVudHJpZXMgY2FsY3VsYXRlZCB3aXRoIHRoZSBpbmNvcnJlY3QgdGltZXpvbmUgb2Zmc2V0LiBUaGlzIGVuc3VyZXMgdXNlcnNcbiAqIGdldCBhY2N1cmF0ZSByZWNhbGN1bGF0aW9ucyB3aXRoIHRoZSBmaXhlZCB0aW1lem9uZSBsb2dpYy5cbiAqL1xuY29uc3QgZ2VuZXJhdGVDYWNoZUtleSA9IChcbiAgYmlydGhEYXRlOiBzdHJpbmcsXG4gIGJpcnRoVGltZTogc3RyaW5nLFxuICBsYXRpdHVkZTogbnVtYmVyLFxuICBsb25naXR1ZGU6IG51bWJlcixcbik6IHN0cmluZyA9PiB7XG4gIC8vIE9ubHkgaW5jbHVkZSBpbnB1dHMgdGhhdCBhZmZlY3QgY2FsY3VsYXRpb25zXG4gIGNvbnN0IGNhY2hlRGF0YSA9IHtcbiAgICBiaXJ0aERhdGVUaW1lOiBgJHtiaXJ0aERhdGV9VCR7YmlydGhUaW1lfTowMFpgLCAvLyBVVEMgSVNPIGZvcm1hdFxuICAgIGxhdDogbGF0aXR1ZGUsXG4gICAgbG9uOiBsb25naXR1ZGUsXG4gICAgaG91c2VTeXN0ZW06ICdwbGFjaWR1cycsXG4gICAgem9kaWFjVHlwZTogJ3Ryb3BpY2FsJyxcbiAgICBlcGhlbWVyaXNWZXJzaW9uOiAnMi4xMC4wMy10ei1maXgnLCAvLyBPbmx5IGNoYW5nZSB3aGVuIGVwaGVtZXJpcyBkYXRhIGNoYW5nZXNcbiAgfTtcblxuICAvLyBVc2Ugc3RhYmxlIEpTT04gc3RyaW5naWZpY2F0aW9uIChrZXlzIGluIGFscGhhYmV0aWNhbCBvcmRlcilcbiAgY29uc3Qgc29ydGVkS2V5cyA9IE9iamVjdC5rZXlzKGNhY2hlRGF0YSkuc29ydCgpO1xuICBjb25zdCBzdGFibGVKc29uID0gc29ydGVkS2V5c1xuICAgIC5tYXAoKGtleSkgPT4gYFwiJHtrZXl9XCI6JHtKU09OLnN0cmluZ2lmeShjYWNoZURhdGFba2V5IGFzIGtleW9mIHR5cGVvZiBjYWNoZURhdGFdKX1gKVxuICAgIC5qb2luKCcsJyk7XG4gIGNvbnN0IGlucHV0ID0gYHske3N0YWJsZUpzb259fWA7XG5cbiAgcmV0dXJuIGNyeXB0by5jcmVhdGVIYXNoKCdzaGEyNTYnKS51cGRhdGUoaW5wdXQpLmRpZ2VzdCgnaGV4Jyk7XG59O1xuXG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuY29uc3QgZ2V0Q2FjaGVkSG91c2VEYXRhID0gYXN5bmMgKGNhY2hlS2V5OiBzdHJpbmcpOiBQcm9taXNlPGFueSB8IG51bGw+ID0+IHtcbiAgY29uc3QgTkFUQUxfQ0hBUlRfVEFCTEVfTkFNRSA9IHByb2Nlc3MuZW52Lk5BVEFMX0NIQVJUX1RBQkxFX05BTUUhO1xuXG4gIHRyeSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQoXG4gICAgICBuZXcgR2V0Q29tbWFuZCh7XG4gICAgICAgIFRhYmxlTmFtZTogTkFUQUxfQ0hBUlRfVEFCTEVfTkFNRSxcbiAgICAgICAgS2V5OiB7XG4gICAgICAgICAgdXNlcklkOiBgQ0FDSEUjJHtjYWNoZUtleX1gLFxuICAgICAgICAgIGNoYXJ0VHlwZTogJ2hvdXNlX2NhY2hlJyxcbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICBpZiAocmVzdWx0Lkl0ZW0pIHtcbiAgICAgIGNvbnNvbGUuaW5mbygnQ2FjaGUgaGl0IGZvciBob3VzZSBjYWxjdWxhdGlvbnMnKTtcbiAgICAgIHJldHVybiByZXN1bHQuSXRlbS5ob3VzZURhdGE7XG4gICAgfVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHJldHJpZXZpbmcgY2FjaGVkIGRhdGE6JywgZXJyb3IpO1xuICB9XG5cbiAgcmV0dXJuIG51bGw7XG59O1xuXG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuY29uc3Qgc2F2ZUNhY2hlZEhvdXNlRGF0YSA9IGFzeW5jIChjYWNoZUtleTogc3RyaW5nLCBob3VzZURhdGE6IGFueSk6IFByb21pc2U8dm9pZD4gPT4ge1xuICBjb25zdCBOQVRBTF9DSEFSVF9UQUJMRV9OQU1FID0gcHJvY2Vzcy5lbnYuTkFUQUxfQ0hBUlRfVEFCTEVfTkFNRSE7XG5cbiAgdHJ5IHtcbiAgICBjb25zdCB0dGwgPSBNYXRoLmZsb29yKERhdGUubm93KCkgLyAxMDAwKSArIDMwICogMjQgKiA2MCAqIDYwOyAvLyAzMCBkYXlzIFRUTFxuXG4gICAgYXdhaXQgZG9jQ2xpZW50LnNlbmQoXG4gICAgICBuZXcgUHV0Q29tbWFuZCh7XG4gICAgICAgIFRhYmxlTmFtZTogTkFUQUxfQ0hBUlRfVEFCTEVfTkFNRSxcbiAgICAgICAgSXRlbToge1xuICAgICAgICAgIHVzZXJJZDogYENBQ0hFIyR7Y2FjaGVLZXl9YCxcbiAgICAgICAgICBjaGFydFR5cGU6ICdob3VzZV9jYWNoZScsXG4gICAgICAgICAgaG91c2VEYXRhLFxuICAgICAgICAgIHR0bCxcbiAgICAgICAgICBjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgICk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3Igc2F2aW5nIGNhY2hlZCBkYXRhOicsIGVycm9yKTtcbiAgfVxufTtcblxuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbmV4cG9ydCBjb25zdCBoYW5kbGVyID0gYXN5bmMgKGV2ZW50OiBhbnkpOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgY29uc3QgTkFUQUxfQ0hBUlRfVEFCTEVfTkFNRSA9IHByb2Nlc3MuZW52Lk5BVEFMX0NIQVJUX1RBQkxFX05BTUUhO1xuICBjb25zb2xlLmluZm8oJ1JlY2VpdmVkIGV2ZW50OicsIEpTT04uc3RyaW5naWZ5KGV2ZW50LCBudWxsLCAyKSk7XG5cbiAgY29uc3QgdmFsaWRhdGVkRXZlbnQgPSB2YWxpZGF0ZUV2ZW50KGV2ZW50KTtcbiAgY29uc3QgeyB1c2VySWQsIGJpcnRoRGF0ZSwgbGF0aXR1ZGUsIGxvbmdpdHVkZSwgaWFuYVRpbWVab25lIH0gPSB2YWxpZGF0ZWRFdmVudDtcblxuICAvLyBCaXJ0aCB0aW1lIGlzIG5vdyByZXF1aXJlZCBwZXIgS0FOLTdcbiAgaWYgKCF2YWxpZGF0ZWRFdmVudC5iaXJ0aFRpbWUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0JpcnRoIHRpbWUgaXMgcmVxdWlyZWQgZm9yIGhvdXNlIGNhbGN1bGF0aW9ucycpO1xuICB9XG5cbiAgY29uc3QgYmlydGhUaW1lID0gdmFsaWRhdGVkRXZlbnQuYmlydGhUaW1lO1xuICBjb25zdCBpc1RpbWVFc3RpbWF0ZWQgPSBmYWxzZTsgLy8gU2luY2UgYmlydGggdGltZSBpcyBub3cgcmVxdWlyZWRcblxuICAvKipcbiAgICogQ2FsY3VsYXRlIHRpbWV6b25lIG9mZnNldCB1c2luZyBMdXhvbiBmb3IgYWNjdXJhdGUgaGlzdG9yaWNhbCB0aW1lem9uZSBoYW5kbGluZy5cbiAgICpcbiAgICogUHJldmlvdXMgaW1wbGVtZW50YXRpb24gdXNlZCBEYXRlLnRvTG9jYWxlU3RyaW5nKCkgd2hpY2ggd2FzIGluY29ycmVjdCBiZWNhdXNlOlxuICAgKiAxLiBJdCBjb252ZXJ0ZWQgdG8gbG9jYWxlIHN0cmluZyAobG9zaW5nIHRpbWV6b25lIGluZm8pXG4gICAqIDIuIENyZWF0ZWQgbmV3IERhdGUgaW4gc3lzdGVtIHRpbWV6b25lIChub3QgYmlydGggbG9jYXRpb24gdGltZXpvbmUpXG4gICAqIDMuIFJldHVybmVkIExhbWJkYSBleGVjdXRpb24gZW52aXJvbm1lbnQgb2Zmc2V0IGluc3RlYWQgb2YgYmlydGggbG9jYXRpb24gb2Zmc2V0XG4gICAqXG4gICAqIEx1eG9uIGNvcnJlY3RseTpcbiAgICogLSBQYXJzZXMgZGF0ZS90aW1lIGluIHRoZSBzcGVjaWZpZWQgSUFOQSB0aW1lem9uZVxuICAgKiAtIENhbGN1bGF0ZXMgYWNjdXJhdGUgaGlzdG9yaWNhbCBvZmZzZXRzIChpbmNsdWRpbmcgRFNUKVxuICAgKiAtIFJldHVybnMgdGhlIG9mZnNldCBmb3IgdGhlIGJpcnRoIGxvY2F0aW9uIGFuZCBkYXRlXG4gICAqL1xuICBjb25zdCBiaXJ0aERhdGVUaW1lU3RyID0gYCR7YmlydGhEYXRlfVQke2JpcnRoVGltZX06MDBgO1xuICBjb25zdCBiaXJ0aERhdGVUaW1lTG9jYWwgPSBEYXRlVGltZS5mcm9tSVNPKGJpcnRoRGF0ZVRpbWVTdHIsIHsgem9uZTogaWFuYVRpbWVab25lIH0pO1xuXG4gIC8vIENhbGN1bGF0ZSBhY2N1cmF0ZSB0aW1lem9uZSBvZmZzZXQgaW4gaG91cnNcbiAgY29uc3QgdGltZXpvbmVPZmZzZXRJbkhvdXJzID0gYmlydGhEYXRlVGltZUxvY2FsLm9mZnNldCAvIDYwO1xuXG4gIC8vIExvZyB0aW1lem9uZSBjYWxjdWxhdGlvbiBkZXRhaWxzIGZvciBkZWJ1Z2dpbmdcbiAgY29uc29sZS5pbmZvKCdUaW1lem9uZSBjYWxjdWxhdGlvbjonLCB7XG4gICAgYmlydGhEYXRlVGltZVN0cixcbiAgICBpYW5hVGltZVpvbmUsXG4gICAgbG9jYWxEYXRlVGltZTogYmlydGhEYXRlVGltZUxvY2FsLnRvU3RyaW5nKCksXG4gICAgb2Zmc2V0OiBiaXJ0aERhdGVUaW1lTG9jYWwub2Zmc2V0LFxuICAgIG9mZnNldEluSG91cnM6IHRpbWV6b25lT2Zmc2V0SW5Ib3VycyxcbiAgICB1dGNEYXRlVGltZTogYmlydGhEYXRlVGltZUxvY2FsLnRvVVRDKCkudG9JU08oKSxcbiAgfSk7XG5cbiAgLy8gQ29udmVydCB0byBKYXZhU2NyaXB0IERhdGUgZm9yIGVwaGVtZXJpcyBsaWJyYXJ5IChpbiBVVEMpXG4gIGNvbnN0IGJpcnRoRGF0ZVRpbWUgPSBiaXJ0aERhdGVUaW1lTG9jYWwudG9KU0RhdGUoKTtcblxuICB0cnkge1xuICAgIC8vIENhbGN1bGF0ZSBwbGFuZXRhcnkgcG9zaXRpb25zIHVzaW5nIGV4aXN0aW5nIGVwaGVtZXJpcyBsaWJyYXJ5XG4gICAgY29uc3QgY2hhcnREYXRhID0gZ2V0QWxsUGxhbmV0cyhiaXJ0aERhdGVUaW1lLCBsb25naXR1ZGUsIGxhdGl0dWRlLCB0aW1lem9uZU9mZnNldEluSG91cnMpO1xuXG4gICAgLy8gRXh0cmFjdCBwbGFuZXRhcnkgcG9zaXRpb25zIGZyb20gdGhlIG9ic2VydmVkIG5hbWVzcGFjZVxuICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgY29uc3QgcGxhbmV0czogUmVjb3JkPHN0cmluZywgYW55PiA9IHt9O1xuICAgIGlmIChjaGFydERhdGEub2JzZXJ2ZWQpIHtcbiAgICAgIE9iamVjdC5rZXlzKGNoYXJ0RGF0YS5vYnNlcnZlZCkuZm9yRWFjaCgocGxhbmV0TmFtZSkgPT4ge1xuICAgICAgICBjb25zdCBwbGFuZXREYXRhID0gY2hhcnREYXRhLm9ic2VydmVkW3BsYW5ldE5hbWVdO1xuICAgICAgICBpZiAocGxhbmV0RGF0YSAmJiBwbGFuZXROYW1lICE9PSAnc2lyaXVzJykge1xuICAgICAgICAgIGNvbnN0IGxvbmdpdHVkZSA9IHBsYW5ldERhdGEuYXBwYXJlbnRMb25naXR1ZGVEZCB8fCAwO1xuICAgICAgICAgIC8vIENhbGN1bGF0ZSB6b2RpYWMgc2lnbiBpbmZvcm1hdGlvblxuICAgICAgICAgIGNvbnN0IG5vcm1hbGl6ZWRMb25naXR1ZGUgPSAoKGxvbmdpdHVkZSAlIDM2MCkgKyAzNjApICUgMzYwO1xuICAgICAgICAgIGNvbnN0IHNpZ25JbmRleCA9IE1hdGguZmxvb3Iobm9ybWFsaXplZExvbmdpdHVkZSAvIDMwKTtcbiAgICAgICAgICBjb25zdCBzaWduID0gWk9ESUFDX1NJR05TW3NpZ25JbmRleF07XG4gICAgICAgICAgY29uc3QgZGVncmVlSW5TaWduID0gbm9ybWFsaXplZExvbmdpdHVkZSAtIHNpZ25JbmRleCAqIDMwO1xuICAgICAgICAgIGNvbnN0IHdob2xlRGVncmVlcyA9IE1hdGguZmxvb3IoZGVncmVlSW5TaWduKTtcbiAgICAgICAgICBjb25zdCBtaW51dGVzID0gTWF0aC5yb3VuZCgoZGVncmVlSW5TaWduIC0gd2hvbGVEZWdyZWVzKSAqIDYwKTtcblxuICAgICAgICAgIHBsYW5ldHNbcGxhbmV0TmFtZV0gPSB7XG4gICAgICAgICAgICBsb25naXR1ZGU6IGxvbmdpdHVkZSxcbiAgICAgICAgICAgIGxvbmdpdHVkZURtczogYCR7d2hvbGVEZWdyZWVzLnRvU3RyaW5nKCkucGFkU3RhcnQoMiwgJzAnKX3CsCR7bWludXRlcy50b1N0cmluZygpLnBhZFN0YXJ0KDIsICcwJyl9JyAke3NpZ259YCxcbiAgICAgICAgICAgIGRpc3RhbmNlS206IHBsYW5ldERhdGEuZ2VvY2VudHJpY0Rpc3RhbmNlS20gfHwgMCxcbiAgICAgICAgICAgIG5hbWU6IHBsYW5ldERhdGEubmFtZSB8fCBwbGFuZXROYW1lLFxuICAgICAgICAgICAgc2lnbjogc2lnbixcbiAgICAgICAgICAgIGRlZ3JlZUluU2lnbjogd2hvbGVEZWdyZWVzLFxuICAgICAgICAgICAgbWludXRlczogbWludXRlcyxcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBDaGVjayBjYWNoZSBmb3IgaG91c2UgY2FsY3VsYXRpb25zXG4gICAgY29uc3QgY2FjaGVLZXkgPSBnZW5lcmF0ZUNhY2hlS2V5KGJpcnRoRGF0ZSwgYmlydGhUaW1lLCBsYXRpdHVkZSwgbG9uZ2l0dWRlKTtcbiAgICBsZXQgaG91c2VEYXRhID0gYXdhaXQgZ2V0Q2FjaGVkSG91c2VEYXRhKGNhY2hlS2V5KTtcblxuICAgIGlmICghaG91c2VEYXRhKSB7XG4gICAgICAvLyBDYWxjdWxhdGUgaG91c2VzIHVzaW5nIFN3aXNzIEVwaGVtZXJpc1xuICAgICAgaG91c2VEYXRhID0gYXdhaXQgY2FsY3VsYXRlSG91c2VzV2l0aFN3aXNzZXBoKGJpcnRoRGF0ZVRpbWUsIGxhdGl0dWRlLCBsb25naXR1ZGUpO1xuXG4gICAgICBpZiAoaG91c2VEYXRhKSB7XG4gICAgICAgIC8vIFNhdmUgdG8gY2FjaGVcbiAgICAgICAgYXdhaXQgc2F2ZUNhY2hlZEhvdXNlRGF0YShjYWNoZUtleSwgaG91c2VEYXRhKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBQcmVwYXJlIHRoZSBpdGVtIHRvIHN0b3JlXG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICBjb25zdCBpdGVtOiBhbnkgPSB7XG4gICAgICB1c2VySWQsXG4gICAgICBjaGFydFR5cGU6ICduYXRhbCcsXG4gICAgICBjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgIGlzVGltZUVzdGltYXRlZCxcbiAgICAgIGJpcnRoSW5mbzoge1xuICAgICAgICAuLi52YWxpZGF0ZWRFdmVudCxcbiAgICAgICAgYmlydGhUaW1lLFxuICAgICAgfSxcbiAgICAgIHBsYW5ldHMsXG4gICAgICBtZXRhZGF0YToge1xuICAgICAgICBjYWxjdWxhdGlvblRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgICBlcGhlbWVyaXNWZXJzaW9uOiAnMi4xMC4wMycsXG4gICAgICAgIHN3ZXRlc3RWZXJzaW9uOiAnMi4xMC4wMycsXG4gICAgICAgIGhvdXNlU3lzdGVtOiAncGxhY2lkdXMnLFxuICAgICAgICB6b2RpYWNUeXBlOiAndHJvcGljYWwnLFxuICAgICAgfSxcbiAgICB9O1xuXG4gICAgLy8gQWRkIGhvdXNlIGRhdGEgaWYgYXZhaWxhYmxlXG4gICAgaWYgKGhvdXNlRGF0YSkge1xuICAgICAgaXRlbS5ob3VzZXMgPSB7XG4gICAgICAgIHN0YXR1czogJ3N1Y2Nlc3MnLFxuICAgICAgICBkYXRhOiBob3VzZURhdGEuaG91c2VzLFxuICAgICAgfTtcbiAgICAgIGl0ZW0uYXNjZW5kYW50ID0gaG91c2VEYXRhLmFzY2VuZGFudDtcbiAgICAgIGl0ZW0ubWlkaGVhdmVuID0gaG91c2VEYXRhLm1pZGhlYXZlbjtcbiAgICAgIGl0ZW0ucGxhbmV0SG91c2VzID0gaG91c2VEYXRhLnBsYW5ldEhvdXNlcztcbiAgICB9IGVsc2Uge1xuICAgICAgaXRlbS5ob3VzZXMgPSB7XG4gICAgICAgIHN0YXR1czogJ2ZhaWxlZCcsXG4gICAgICAgIGVycm9yOiAnSG91c2UgY2FsY3VsYXRpb25zIHVuYXZhaWxhYmxlJyxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gU3RvcmUgdGhlIG5hdGFsIGNoYXJ0XG4gICAgYXdhaXQgZG9jQ2xpZW50LnNlbmQoXG4gICAgICBuZXcgUHV0Q29tbWFuZCh7XG4gICAgICAgIFRhYmxlTmFtZTogTkFUQUxfQ0hBUlRfVEFCTEVfTkFNRSxcbiAgICAgICAgSXRlbTogaXRlbSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICBjb25zb2xlLmluZm8oYFN1Y2Nlc3NmdWxseSBnZW5lcmF0ZWQgYW5kIHN0b3JlZCBuYXRhbCBjaGFydCBmb3IgdXNlcklkOiAke3VzZXJJZH1gKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBjYWxjdWxhdGluZyBvciBzdG9yaW5nIG5hdGFsIGNoYXJ0OicsIGVycm9yKTtcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxufTtcbiJdfQ==