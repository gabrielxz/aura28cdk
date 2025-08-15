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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGUtbmF0YWwtY2hhcnQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJnZW5lcmF0ZS1uYXRhbC1jaGFydC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLDhEQUEwRDtBQUMxRCx3REFBdUY7QUFDdkYseUNBQTBDO0FBQzFDLCtDQUFpQztBQUVqQyxNQUFNLFlBQVksR0FBRyxJQUFJLGdDQUFjLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDNUMsTUFBTSxTQUFTLEdBQUcscUNBQXNCLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO0FBRTVELHdDQUF3QztBQUN4Qyw4REFBOEQ7QUFDOUQsSUFBSSxRQUFhLENBQUM7QUFDbEIsSUFBSSxhQUFpQyxDQUFDO0FBRXRDLHFEQUFxRDtBQUNyRCxNQUFNLFlBQVksR0FBRyxHQUFHLEVBQUU7SUFDeEIsOENBQThDO0lBQzlDLE1BQU0sSUFBSSxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUM3QixNQUFNLEVBQUUsR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7SUFFekIsMkRBQTJEO0lBQzNELElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxZQUFZLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLEVBQUUsQ0FBQztRQUMzRCxNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDOUQsSUFBSSxFQUFFLENBQUMsVUFBVSxDQUFDLGNBQWMsQ0FBQyxFQUFFLENBQUM7WUFDbEMsSUFBSSxDQUFDO2dCQUNILFFBQVEsR0FBRyxPQUFPLENBQUMsY0FBYyxDQUFDLENBQUM7Z0JBQ25DLGFBQWEsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQztnQkFFekMsT0FBTyxDQUFDLElBQUksQ0FBQyw0Q0FBNEMsRUFBRTtvQkFDekQsSUFBSSxF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MUhXLFFBQUEsT0FBTyxXQTBIbEIiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBEeW5hbW9EQkNsaWVudCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1keW5hbW9kYic7XG5pbXBvcnQgeyBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LCBQdXRDb21tYW5kLCBHZXRDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvbGliLWR5bmFtb2RiJztcbmltcG9ydCB7IGdldEFsbFBsYW5ldHMgfSBmcm9tICdlcGhlbWVyaXMnO1xuaW1wb3J0ICogYXMgY3J5cHRvIGZyb20gJ2NyeXB0byc7XG5cbmNvbnN0IGR5bmFtb0NsaWVudCA9IG5ldyBEeW5hbW9EQkNsaWVudCh7fSk7XG5jb25zdCBkb2NDbGllbnQgPSBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LmZyb20oZHluYW1vQ2xpZW50KTtcblxuLy8gSW1wb3J0IHN3aXNzZXBoIGZyb20gdGhlIExhbWJkYSBMYXllclxuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbmxldCBzd2lzc2VwaDogYW55O1xubGV0IGVwaGVtZXJpc1BhdGg6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuLy8gQ29sZCBzdGFydCBsb2dnaW5nIGZvciBlcGhlbWVyaXMgcGF0aCB2ZXJpZmljYXRpb25cbmNvbnN0IGluaXRTd2lzc0VwaCA9ICgpID0+IHtcbiAgLy8gVHJ5IGRpZmZlcmVudCBwYXRocyB0byBmaW5kIFN3aXNzIEVwaGVtZXJpc1xuICBjb25zdCBwYXRoID0gcmVxdWlyZSgncGF0aCcpO1xuICBjb25zdCBmcyA9IHJlcXVpcmUoJ2ZzJyk7XG5cbiAgLy8gVXNlIGVudmlyb25tZW50IHZhcmlhYmxlcyBpZiBzZXQgKGZvciB0ZXN0IGVudmlyb25tZW50cylcbiAgaWYgKHByb2Nlc3MuZW52LlNFX0VQSEVfUEFUSCAmJiBwcm9jZXNzLmVudi5FUEhFTUVSSVNfUEFUSCkge1xuICAgIGNvbnN0IHRlc3RNb2R1bGVQYXRoID0gcGF0aC5kaXJuYW1lKHByb2Nlc3MuZW52LlNFX0VQSEVfUEFUSCk7XG4gICAgaWYgKGZzLmV4aXN0c1N5bmModGVzdE1vZHVsZVBhdGgpKSB7XG4gICAgICB0cnkge1xuICAgICAgICBzd2lzc2VwaCA9IHJlcXVpcmUodGVzdE1vZHVsZVBhdGgpO1xuICAgICAgICBlcGhlbWVyaXNQYXRoID0gcHJvY2Vzcy5lbnYuU0VfRVBIRV9QQVRIO1xuXG4gICAgICAgIGNvbnNvbGUuaW5mbygnU3dpc3MgRXBoZW1lcmlzIGluaXRpYWxpemF0aW9uIChmcm9tIGVudik6Jywge1xuICAgICAgICAgIHBhdGg6IGVwaGVtZXJpc1BhdGgsXG4gICAgICAgICAgbW9kdWxlUGF0aDogdGVzdE1vZHVsZVBhdGgsXG4gICAgICAgICAgZW52U0VfRVBIRV9QQVRIOiBwcm9jZXNzLmVudi5TRV9FUEhFX1BBVEgsXG4gICAgICAgICAgZW52RVBIRU1FUklTX1BBVEg6IHByb2Nlc3MuZW52LkVQSEVNRVJJU19QQVRILFxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBWZXJpZnkgZXBoZW1lcmlzIGRpcmVjdG9yeSBleGlzdHNcbiAgICAgICAgaWYgKGZzLmV4aXN0c1N5bmMoZXBoZW1lcmlzUGF0aCkpIHtcbiAgICAgICAgICBjb25zdCBmaWxlcyA9IGZzLnJlYWRkaXJTeW5jKGVwaGVtZXJpc1BhdGgpO1xuICAgICAgICAgIGNvbnN0IHNlRmlsZXMgPSBmaWxlcy5maWx0ZXIoXG4gICAgICAgICAgICAoZjogc3RyaW5nKSA9PiBmLmVuZHNXaXRoKCcuc2UxJykgfHwgZiA9PT0gJ3NlbGVhcHNlYy50eHQnIHx8IGYgPT09ICdzZW9yYmVsLnR4dCcsXG4gICAgICAgICAgKTtcbiAgICAgICAgICBjb25zb2xlLmluZm8oJ0VwaGVtZXJpcyBmaWxlcyBmb3VuZDonLCBzZUZpbGVzLmxlbmd0aCwgJ2ZpbGVzOicsIHNlRmlsZXMuc2xpY2UoMCwgNSkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0VwaGVtZXJpcyBkaXJlY3RvcnkgZG9lcyBub3QgZXhpc3Q6JywgZXBoZW1lcmlzUGF0aCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm47IC8vIFN1Y2Nlc3NmdWxseSBsb2FkZWQgZnJvbSBlbnZpcm9ubWVudFxuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLndhcm4oJ0ZhaWxlZCB0byBsb2FkIGZyb20gZW52aXJvbm1lbnQgcGF0aHM6JywgZSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgY29uc3QgcG9zc2libGVQYXRocyA9IFtcbiAgICAnL29wdC9ub2RlanMvbm9kZV9tb2R1bGVzL3N3aXNzZXBoJywgLy8gTGFtYmRhIGxheWVyIHBhdGhcbiAgICBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vbGF5ZXJzL3N3ZXRlc3QvbGF5ZXIvbm9kZWpzL25vZGVfbW9kdWxlcy9zd2lzc2VwaCcpLCAvLyBUZXN0IGVudmlyb25tZW50IHBhdGhcbiAgICAnc3dpc3NlcGgnLCAvLyBOb3JtYWwgcmVxdWlyZSBwYXRoXG4gIF07XG5cbiAgZm9yIChjb25zdCBtb2R1bGVQYXRoIG9mIHBvc3NpYmxlUGF0aHMpIHtcbiAgICB0cnkge1xuICAgICAgc3dpc3NlcGggPSByZXF1aXJlKG1vZHVsZVBhdGgpO1xuXG4gICAgICAvLyBTZXQgZXBoZW1lcmlzIHBhdGggYmFzZWQgb24gZW52aXJvbm1lbnRcbiAgICAgIGlmIChwcm9jZXNzLmVudi5TRV9FUEhFX1BBVEgpIHtcbiAgICAgICAgZXBoZW1lcmlzUGF0aCA9IHByb2Nlc3MuZW52LlNFX0VQSEVfUEFUSDtcbiAgICAgIH0gZWxzZSBpZiAocHJvY2Vzcy5lbnYuRVBIRU1FUklTX1BBVEgpIHtcbiAgICAgICAgZXBoZW1lcmlzUGF0aCA9IHByb2Nlc3MuZW52LkVQSEVNRVJJU19QQVRIO1xuICAgICAgfSBlbHNlIGlmIChtb2R1bGVQYXRoLnN0YXJ0c1dpdGgoJy9vcHQnKSkge1xuICAgICAgICBlcGhlbWVyaXNQYXRoID0gJy9vcHQvbm9kZWpzL25vZGVfbW9kdWxlcy9zd2lzc2VwaC9lcGhlJztcbiAgICAgIH0gZWxzZSBpZiAobW9kdWxlUGF0aC5pbmNsdWRlcygnbGF5ZXJzL3N3ZXRlc3QnKSkge1xuICAgICAgICBlcGhlbWVyaXNQYXRoID0gcGF0aC5qb2luKG1vZHVsZVBhdGgsICdlcGhlJyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBlcGhlbWVyaXNQYXRoID0gcGF0aC5qb2luKHBhdGguZGlybmFtZShyZXF1aXJlLnJlc29sdmUobW9kdWxlUGF0aCkpLCAnZXBoZScpO1xuICAgICAgfVxuXG4gICAgICAvLyBMb2cgZXBoZW1lcmlzIHBhdGggb24gY29sZCBzdGFydFxuICAgICAgY29uc29sZS5pbmZvKCdTd2lzcyBFcGhlbWVyaXMgaW5pdGlhbGl6YXRpb246Jywge1xuICAgICAgICBwYXRoOiBlcGhlbWVyaXNQYXRoLFxuICAgICAgICBtb2R1bGVQYXRoOiBtb2R1bGVQYXRoLFxuICAgICAgICBlbnZTRV9FUEhFX1BBVEg6IHByb2Nlc3MuZW52LlNFX0VQSEVfUEFUSCxcbiAgICAgICAgZW52RVBIRU1FUklTX1BBVEg6IHByb2Nlc3MuZW52LkVQSEVNRVJJU19QQVRILFxuICAgICAgfSk7XG5cbiAgICAgIC8vIFZlcmlmeSBlcGhlbWVyaXMgZGlyZWN0b3J5IGV4aXN0c1xuICAgICAgaWYgKGZzLmV4aXN0c1N5bmMoZXBoZW1lcmlzUGF0aCkpIHtcbiAgICAgICAgY29uc3QgZmlsZXMgPSBmcy5yZWFkZGlyU3luYyhlcGhlbWVyaXNQYXRoKTtcbiAgICAgICAgY29uc3Qgc2VGaWxlcyA9IGZpbGVzLmZpbHRlcihcbiAgICAgICAgICAoZjogc3RyaW5nKSA9PiBmLmVuZHNXaXRoKCcuc2UxJykgfHwgZiA9PT0gJ3NlbGVhcHNlYy50eHQnIHx8IGYgPT09ICdzZW9yYmVsLnR4dCcsXG4gICAgICAgICk7XG4gICAgICAgIGNvbnNvbGUuaW5mbygnRXBoZW1lcmlzIGZpbGVzIGZvdW5kOicsIHNlRmlsZXMubGVuZ3RoLCAnZmlsZXM6Jywgc2VGaWxlcy5zbGljZSgwLCA1KSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdFcGhlbWVyaXMgZGlyZWN0b3J5IGRvZXMgbm90IGV4aXN0OicsIGVwaGVtZXJpc1BhdGgpO1xuICAgICAgfVxuXG4gICAgICAvLyBTdWNjZXNzZnVsbHkgbG9hZGVkXG4gICAgICBicmVhaztcbiAgICB9IGNhdGNoIChfZXJyb3IpIHtcbiAgICAgIC8vIFRyeSBuZXh0IHBhdGhcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgfVxuXG4gIGlmICghc3dpc3NlcGgpIHtcbiAgICBjb25zb2xlLmVycm9yKCdTd2lzcyBFcGhlbWVyaXMgbm90IGF2YWlsYWJsZSBmcm9tIGFueSBwYXRoJyk7XG4gIH1cbn07XG5cbi8vIEluaXRpYWxpemUgb24gY29sZCBzdGFydFxuaW5pdFN3aXNzRXBoKCk7XG5cbmludGVyZmFjZSBOYXRhbENoYXJ0RXZlbnQge1xuICB1c2VySWQ6IHN0cmluZztcbiAgYmlydGhEYXRlOiBzdHJpbmc7IC8vIFlZWVktTU0tRERcbiAgYmlydGhUaW1lPzogc3RyaW5nOyAvLyBISDpNTVxuICBsYXRpdHVkZTogbnVtYmVyO1xuICBsb25naXR1ZGU6IG51bWJlcjtcbiAgaWFuYVRpbWVab25lOiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBIb3VzZURhdGEge1xuICBob3VzZU51bWJlcjogbnVtYmVyO1xuICBjdXNwRGVncmVlOiBudW1iZXI7XG4gIGN1c3BTaWduOiBzdHJpbmc7XG4gIGN1c3BEZWdyZWVJblNpZ246IG51bWJlcjtcbiAgY3VzcE1pbnV0ZXM6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIEFuZ2xlRGF0YSB7XG4gIGRlZ3JlZTogbnVtYmVyO1xuICBzaWduOiBzdHJpbmc7XG4gIGRlZ3JlZUluU2lnbjogbnVtYmVyO1xuICBtaW51dGVzOiBudW1iZXI7XG59XG5cbmNvbnN0IFpPRElBQ19TSUdOUyA9IFtcbiAgJ0FyaWVzJyxcbiAgJ1RhdXJ1cycsXG4gICdHZW1pbmknLFxuICAnQ2FuY2VyJyxcbiAgJ0xlbycsXG4gICdWaXJnbycsXG4gICdMaWJyYScsXG4gICdTY29ycGlvJyxcbiAgJ1NhZ2l0dGFyaXVzJyxcbiAgJ0NhcHJpY29ybicsXG4gICdBcXVhcml1cycsXG4gICdQaXNjZXMnLFxuXTtcblxuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbmNvbnN0IHZhbGlkYXRlRXZlbnQgPSAoZXZlbnQ6IGFueSk6IE5hdGFsQ2hhcnRFdmVudCA9PiB7XG4gIGlmIChcbiAgICAhZXZlbnQudXNlcklkIHx8XG4gICAgIWV2ZW50LmJpcnRoRGF0ZSB8fFxuICAgICFldmVudC5sYXRpdHVkZSB8fFxuICAgICFldmVudC5sb25naXR1ZGUgfHxcbiAgICAhZXZlbnQuaWFuYVRpbWVab25lXG4gICkge1xuICAgIHRocm93IG5ldyBFcnJvcignTWlzc2luZyByZXF1aXJlZCBldmVudCBwcm9wZXJ0aWVzJyk7XG4gIH1cblxuICAvLyBWYWxpZGF0ZSBjb29yZGluYXRlc1xuICBpZiAoZXZlbnQubGF0aXR1ZGUgPCAtOTAgfHwgZXZlbnQubGF0aXR1ZGUgPiA5MCkge1xuICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBsYXRpdHVkZTogbXVzdCBiZSBiZXR3ZWVuIC05MCBhbmQgOTAnKTtcbiAgfVxuICBpZiAoZXZlbnQubG9uZ2l0dWRlIDwgLTE4MCB8fCBldmVudC5sb25naXR1ZGUgPiAxODApIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgbG9uZ2l0dWRlOiBtdXN0IGJlIGJldHdlZW4gLTE4MCBhbmQgMTgwJyk7XG4gIH1cblxuICByZXR1cm4gZXZlbnQ7XG59O1xuXG5jb25zdCBnZXREZWdyZWVJbmZvID0gKGRlZ3JlZTogbnVtYmVyKTogeyBzaWduOiBzdHJpbmc7IGRlZ3JlZUluU2lnbjogbnVtYmVyOyBtaW51dGVzOiBudW1iZXIgfSA9PiB7XG4gIGNvbnN0IG5vcm1hbGl6ZWREZWdyZWUgPSBkZWdyZWUgJSAzNjA7XG4gIGNvbnN0IHNpZ25JbmRleCA9IE1hdGguZmxvb3Iobm9ybWFsaXplZERlZ3JlZSAvIDMwKTtcbiAgY29uc3QgZGVncmVlSW5TaWduID0gbm9ybWFsaXplZERlZ3JlZSAlIDMwO1xuICBjb25zdCB3aG9sZURlZ3JlZXMgPSBNYXRoLmZsb29yKGRlZ3JlZUluU2lnbik7XG4gIGNvbnN0IG1pbnV0ZXMgPSBNYXRoLnJvdW5kKChkZWdyZWVJblNpZ24gLSB3aG9sZURlZ3JlZXMpICogNjApO1xuXG4gIHJldHVybiB7XG4gICAgc2lnbjogWk9ESUFDX1NJR05TW3NpZ25JbmRleF0sXG4gICAgZGVncmVlSW5TaWduOiB3aG9sZURlZ3JlZXMsXG4gICAgbWludXRlcyxcbiAgfTtcbn07XG5cbmNvbnN0IGNhbGN1bGF0ZUhvdXNlc1dpdGhTd2lzc2VwaCA9IGFzeW5jIChcbiAgYmlydGhEYXRlVGltZTogRGF0ZSxcbiAgbGF0aXR1ZGU6IG51bWJlcixcbiAgbG9uZ2l0dWRlOiBudW1iZXIsXG4pOiBQcm9taXNlPHtcbiAgaG91c2VzOiBIb3VzZURhdGFbXTtcbiAgYXNjZW5kYW50OiBBbmdsZURhdGE7XG4gIG1pZGhlYXZlbjogQW5nbGVEYXRhO1xuICBwbGFuZXRIb3VzZXM6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG59IHwgbnVsbD4gPT4ge1xuICBpZiAoIXN3aXNzZXBoKSB7XG4gICAgY29uc29sZS53YXJuKCdTd2lzcyBFcGhlbWVyaXMgbm90IGF2YWlsYWJsZSwgc2tpcHBpbmcgaG91c2UgY2FsY3VsYXRpb25zJyk7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICB0cnkge1xuICAgIC8vIFNldCBlcGhlbWVyaXMgcGF0aCBleHBsaWNpdGx5XG4gICAgY29uc3QgZXBoZVBhdGggPVxuICAgICAgZXBoZW1lcmlzUGF0aCB8fFxuICAgICAgcHJvY2Vzcy5lbnYuU0VfRVBIRV9QQVRIIHx8XG4gICAgICBwcm9jZXNzLmVudi5FUEhFTUVSSVNfUEFUSCB8fFxuICAgICAgJy9vcHQvbm9kZWpzL25vZGVfbW9kdWxlcy9zd2lzc2VwaC9lcGhlJztcbiAgICBzd2lzc2VwaC5zd2Vfc2V0X2VwaGVfcGF0aChlcGhlUGF0aCk7XG4gICAgY29uc29sZS5pbmZvKCdTZXR0aW5nIGVwaGVtZXJpcyBwYXRoIGZvciBob3VzZSBjYWxjdWxhdGlvbnM6JywgZXBoZVBhdGgpO1xuXG4gICAgLy8gQ2FsY3VsYXRlIEp1bGlhbiBEYXlcbiAgICBjb25zdCB5ZWFyID0gYmlydGhEYXRlVGltZS5nZXRVVENGdWxsWWVhcigpO1xuICAgIGNvbnN0IG1vbnRoID0gYmlydGhEYXRlVGltZS5nZXRVVENNb250aCgpICsgMTtcbiAgICBjb25zdCBkYXkgPSBiaXJ0aERhdGVUaW1lLmdldFVUQ0RhdGUoKTtcbiAgICBjb25zdCBob3VyID1cbiAgICAgIGJpcnRoRGF0ZVRpbWUuZ2V0VVRDSG91cnMoKSArXG4gICAgICBiaXJ0aERhdGVUaW1lLmdldFVUQ01pbnV0ZXMoKSAvIDYwICtcbiAgICAgIGJpcnRoRGF0ZVRpbWUuZ2V0VVRDU2Vjb25kcygpIC8gMzYwMDtcblxuICAgIGNvbnN0IGp1bGlhbkRheSA9IHN3aXNzZXBoLnN3ZV9qdWxkYXkoeWVhciwgbW9udGgsIGRheSwgaG91ciwgc3dpc3NlcGguU0VfR1JFR19DQUwpO1xuXG4gICAgLy8gQ2FsY3VsYXRlIGhvdXNlcyB1c2luZyBQbGFjaWR1cyBzeXN0ZW1cbiAgICBjb25zdCBob3VzZURhdGEgPSBzd2lzc2VwaC5zd2VfaG91c2VzKFxuICAgICAganVsaWFuRGF5LFxuICAgICAgbGF0aXR1ZGUsXG4gICAgICBsb25naXR1ZGUsXG4gICAgICAnUCcsIC8vIFBsYWNpZHVzIGhvdXNlIHN5c3RlbVxuICAgICk7XG5cbiAgICBpZiAoIWhvdXNlRGF0YSB8fCAhaG91c2VEYXRhLmhvdXNlIHx8ICFob3VzZURhdGEuYXNjZW5kYW50IHx8ICFob3VzZURhdGEubWMpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignRmFpbGVkIHRvIGNhbGN1bGF0ZSBob3VzZXMnKTtcbiAgICB9XG5cbiAgICAvLyBQcm9jZXNzIGhvdXNlIGN1c3BzXG4gICAgY29uc3QgaG91c2VzOiBIb3VzZURhdGFbXSA9IFtdO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgMTI7IGkrKykge1xuICAgICAgY29uc3QgY3VzcERlZ3JlZSA9IGhvdXNlRGF0YS5ob3VzZVtpXTtcbiAgICAgIGNvbnN0IGRlZ3JlZUluZm8gPSBnZXREZWdyZWVJbmZvKGN1c3BEZWdyZWUpO1xuICAgICAgaG91c2VzLnB1c2goe1xuICAgICAgICBob3VzZU51bWJlcjogaSArIDEsXG4gICAgICAgIGN1c3BEZWdyZWUsXG4gICAgICAgIGN1c3BTaWduOiBkZWdyZWVJbmZvLnNpZ24sXG4gICAgICAgIGN1c3BEZWdyZWVJblNpZ246IGRlZ3JlZUluZm8uZGVncmVlSW5TaWduLFxuICAgICAgICBjdXNwTWludXRlczogZGVncmVlSW5mby5taW51dGVzLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gUHJvY2VzcyBBc2NlbmRhbnRcbiAgICBjb25zdCBhc2NJbmZvID0gZ2V0RGVncmVlSW5mbyhob3VzZURhdGEuYXNjZW5kYW50KTtcbiAgICBjb25zdCBhc2NlbmRhbnQ6IEFuZ2xlRGF0YSA9IHtcbiAgICAgIGRlZ3JlZTogaG91c2VEYXRhLmFzY2VuZGFudCxcbiAgICAgIHNpZ246IGFzY0luZm8uc2lnbixcbiAgICAgIGRlZ3JlZUluU2lnbjogYXNjSW5mby5kZWdyZWVJblNpZ24sXG4gICAgICBtaW51dGVzOiBhc2NJbmZvLm1pbnV0ZXMsXG4gICAgfTtcblxuICAgIC8vIFByb2Nlc3MgTWlkaGVhdmVuXG4gICAgY29uc3QgbWNJbmZvID0gZ2V0RGVncmVlSW5mbyhob3VzZURhdGEubWMpO1xuICAgIGNvbnN0IG1pZGhlYXZlbjogQW5nbGVEYXRhID0ge1xuICAgICAgZGVncmVlOiBob3VzZURhdGEubWMsXG4gICAgICBzaWduOiBtY0luZm8uc2lnbixcbiAgICAgIGRlZ3JlZUluU2lnbjogbWNJbmZvLmRlZ3JlZUluU2lnbixcbiAgICAgIG1pbnV0ZXM6IG1jSW5mby5taW51dGVzLFxuICAgIH07XG5cbiAgICAvLyBDYWxjdWxhdGUgcGxhbmV0IHBvc2l0aW9ucyB1c2luZyBTd2lzcyBFcGhlbWVyaXMgZm9yIGFjY3VyYWN5XG4gICAgY29uc3QgcGxhbmV0SG91c2VzOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+ID0ge307XG4gICAgY29uc3QgcGxhbmV0SWRzID0gW1xuICAgICAgc3dpc3NlcGguU0VfU1VOLFxuICAgICAgc3dpc3NlcGguU0VfTU9PTixcbiAgICAgIHN3aXNzZXBoLlNFX01FUkNVUlksXG4gICAgICBzd2lzc2VwaC5TRV9WRU5VUyxcbiAgICAgIHN3aXNzZXBoLlNFX01BUlMsXG4gICAgICBzd2lzc2VwaC5TRV9KVVBJVEVSLFxuICAgICAgc3dpc3NlcGguU0VfU0FUVVJOLFxuICAgICAgc3dpc3NlcGguU0VfVVJBTlVTLFxuICAgICAgc3dpc3NlcGguU0VfTkVQVFVORSxcbiAgICAgIHN3aXNzZXBoLlNFX1BMVVRPLFxuICAgIF07XG4gICAgY29uc3QgcGxhbmV0TmFtZXMgPSBbXG4gICAgICAnc3VuJyxcbiAgICAgICdtb29uJyxcbiAgICAgICdtZXJjdXJ5JyxcbiAgICAgICd2ZW51cycsXG4gICAgICAnbWFycycsXG4gICAgICAnanVwaXRlcicsXG4gICAgICAnc2F0dXJuJyxcbiAgICAgICd1cmFudXMnLFxuICAgICAgJ25lcHR1bmUnLFxuICAgICAgJ3BsdXRvJyxcbiAgICBdO1xuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBwbGFuZXRJZHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IHBsYW5ldERhdGEgPSBzd2lzc2VwaC5zd2VfY2FsY191dChqdWxpYW5EYXksIHBsYW5ldElkc1tpXSwgc3dpc3NlcGguU0VGTEdfU1BFRUQpO1xuICAgICAgaWYgKHBsYW5ldERhdGEgJiYgcGxhbmV0RGF0YS5sb25naXR1ZGUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBjb25zdCBwbGFuZXRMb25naXR1ZGUgPSBwbGFuZXREYXRhLmxvbmdpdHVkZTtcbiAgICAgICAgLy8gRGV0ZXJtaW5lIHdoaWNoIGhvdXNlIHRoZSBwbGFuZXQgaXMgaW5cbiAgICAgICAgZm9yIChsZXQgaCA9IDA7IGggPCAxMjsgaCsrKSB7XG4gICAgICAgICAgY29uc3QgY3VycmVudEN1c3AgPSBob3VzZXNbaF0uY3VzcERlZ3JlZTtcbiAgICAgICAgICBjb25zdCBuZXh0Q3VzcCA9IGhvdXNlc1soaCArIDEpICUgMTJdLmN1c3BEZWdyZWU7XG5cbiAgICAgICAgICAvLyBIYW5kbGUgY3VzcCB3cmFwLWFyb3VuZCBhdCAzNjAgZGVncmVlc1xuICAgICAgICAgIGlmIChjdXJyZW50Q3VzcCA+IG5leHRDdXNwKSB7XG4gICAgICAgICAgICAvLyBIb3VzZSBzcGFucyAwIGRlZ3JlZXNcbiAgICAgICAgICAgIGlmIChwbGFuZXRMb25naXR1ZGUgPj0gY3VycmVudEN1c3AgfHwgcGxhbmV0TG9uZ2l0dWRlIDwgbmV4dEN1c3ApIHtcbiAgICAgICAgICAgICAgcGxhbmV0SG91c2VzW3BsYW5ldE5hbWVzW2ldXSA9IGggKyAxO1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKHBsYW5ldExvbmdpdHVkZSA+PSBjdXJyZW50Q3VzcCAmJiBwbGFuZXRMb25naXR1ZGUgPCBuZXh0Q3VzcCkge1xuICAgICAgICAgICAgICBwbGFuZXRIb3VzZXNbcGxhbmV0TmFtZXNbaV1dID0gaCArIDE7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIENsb3NlIFN3aXNzIEVwaGVtZXJpc1xuICAgIHN3aXNzZXBoLnN3ZV9jbG9zZSgpO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGhvdXNlcyxcbiAgICAgIGFzY2VuZGFudCxcbiAgICAgIG1pZGhlYXZlbixcbiAgICAgIHBsYW5ldEhvdXNlcyxcbiAgICB9O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGNhbGN1bGF0aW5nIGhvdXNlcyB3aXRoIFN3aXNzIEVwaGVtZXJpczonLCBlcnJvcik7XG4gICAgLy8gQ2xvc2UgU3dpc3MgRXBoZW1lcmlzIG9uIGVycm9yXG4gICAgaWYgKHN3aXNzZXBoICYmIHN3aXNzZXBoLnN3ZV9jbG9zZSkge1xuICAgICAgc3dpc3NlcGguc3dlX2Nsb3NlKCk7XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xuICB9XG59O1xuXG5jb25zdCBnZW5lcmF0ZUNhY2hlS2V5ID0gKFxuICBiaXJ0aERhdGU6IHN0cmluZyxcbiAgYmlydGhUaW1lOiBzdHJpbmcsXG4gIGxhdGl0dWRlOiBudW1iZXIsXG4gIGxvbmdpdHVkZTogbnVtYmVyLFxuKTogc3RyaW5nID0+IHtcbiAgLy8gT25seSBpbmNsdWRlIGlucHV0cyB0aGF0IGFmZmVjdCBjYWxjdWxhdGlvbnNcbiAgY29uc3QgY2FjaGVEYXRhID0ge1xuICAgIGJpcnRoRGF0ZVRpbWU6IGAke2JpcnRoRGF0ZX1UJHtiaXJ0aFRpbWV9OjAwWmAsIC8vIFVUQyBJU08gZm9ybWF0XG4gICAgbGF0OiBsYXRpdHVkZSxcbiAgICBsb246IGxvbmdpdHVkZSxcbiAgICBob3VzZVN5c3RlbTogJ3BsYWNpZHVzJyxcbiAgICB6b2RpYWNUeXBlOiAndHJvcGljYWwnLFxuICAgIGVwaGVtZXJpc1ZlcnNpb246ICcyLjEwLjAzJywgLy8gT25seSBjaGFuZ2Ugd2hlbiBlcGhlbWVyaXMgZGF0YSBjaGFuZ2VzXG4gIH07XG5cbiAgLy8gVXNlIHN0YWJsZSBKU09OIHN0cmluZ2lmaWNhdGlvbiAoa2V5cyBpbiBhbHBoYWJldGljYWwgb3JkZXIpXG4gIGNvbnN0IHNvcnRlZEtleXMgPSBPYmplY3Qua2V5cyhjYWNoZURhdGEpLnNvcnQoKTtcbiAgY29uc3Qgc3RhYmxlSnNvbiA9IHNvcnRlZEtleXNcbiAgICAubWFwKChrZXkpID0+IGBcIiR7a2V5fVwiOiR7SlNPTi5zdHJpbmdpZnkoY2FjaGVEYXRhW2tleSBhcyBrZXlvZiB0eXBlb2YgY2FjaGVEYXRhXSl9YClcbiAgICAuam9pbignLCcpO1xuICBjb25zdCBpbnB1dCA9IGB7JHtzdGFibGVKc29ufX1gO1xuXG4gIHJldHVybiBjcnlwdG8uY3JlYXRlSGFzaCgnc2hhMjU2JykudXBkYXRlKGlucHV0KS5kaWdlc3QoJ2hleCcpO1xufTtcblxuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbmNvbnN0IGdldENhY2hlZEhvdXNlRGF0YSA9IGFzeW5jIChjYWNoZUtleTogc3RyaW5nKTogUHJvbWlzZTxhbnkgfCBudWxsPiA9PiB7XG4gIGNvbnN0IE5BVEFMX0NIQVJUX1RBQkxFX05BTUUgPSBwcm9jZXNzLmVudi5OQVRBTF9DSEFSVF9UQUJMRV9OQU1FITtcblxuICB0cnkge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKFxuICAgICAgbmV3IEdldENvbW1hbmQoe1xuICAgICAgICBUYWJsZU5hbWU6IE5BVEFMX0NIQVJUX1RBQkxFX05BTUUsXG4gICAgICAgIEtleToge1xuICAgICAgICAgIHVzZXJJZDogYENBQ0hFIyR7Y2FjaGVLZXl9YCxcbiAgICAgICAgICBjaGFydFR5cGU6ICdob3VzZV9jYWNoZScsXG4gICAgICAgIH0sXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgaWYgKHJlc3VsdC5JdGVtKSB7XG4gICAgICBjb25zb2xlLmluZm8oJ0NhY2hlIGhpdCBmb3IgaG91c2UgY2FsY3VsYXRpb25zJyk7XG4gICAgICByZXR1cm4gcmVzdWx0Lkl0ZW0uaG91c2VEYXRhO1xuICAgIH1cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciByZXRyaWV2aW5nIGNhY2hlZCBkYXRhOicsIGVycm9yKTtcbiAgfVxuXG4gIHJldHVybiBudWxsO1xufTtcblxuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbmNvbnN0IHNhdmVDYWNoZWRIb3VzZURhdGEgPSBhc3luYyAoY2FjaGVLZXk6IHN0cmluZywgaG91c2VEYXRhOiBhbnkpOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgY29uc3QgTkFUQUxfQ0hBUlRfVEFCTEVfTkFNRSA9IHByb2Nlc3MuZW52Lk5BVEFMX0NIQVJUX1RBQkxFX05BTUUhO1xuXG4gIHRyeSB7XG4gICAgY29uc3QgdHRsID0gTWF0aC5mbG9vcihEYXRlLm5vdygpIC8gMTAwMCkgKyAzMCAqIDI0ICogNjAgKiA2MDsgLy8gMzAgZGF5cyBUVExcblxuICAgIGF3YWl0IGRvY0NsaWVudC5zZW5kKFxuICAgICAgbmV3IFB1dENvbW1hbmQoe1xuICAgICAgICBUYWJsZU5hbWU6IE5BVEFMX0NIQVJUX1RBQkxFX05BTUUsXG4gICAgICAgIEl0ZW06IHtcbiAgICAgICAgICB1c2VySWQ6IGBDQUNIRSMke2NhY2hlS2V5fWAsXG4gICAgICAgICAgY2hhcnRUeXBlOiAnaG91c2VfY2FjaGUnLFxuICAgICAgICAgIGhvdXNlRGF0YSxcbiAgICAgICAgICB0dGwsXG4gICAgICAgICAgY3JlYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICAgIH0sXG4gICAgICB9KSxcbiAgICApO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHNhdmluZyBjYWNoZWQgZGF0YTonLCBlcnJvcik7XG4gIH1cbn07XG5cbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5leHBvcnQgY29uc3QgaGFuZGxlciA9IGFzeW5jIChldmVudDogYW55KTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gIGNvbnN0IE5BVEFMX0NIQVJUX1RBQkxFX05BTUUgPSBwcm9jZXNzLmVudi5OQVRBTF9DSEFSVF9UQUJMRV9OQU1FITtcbiAgY29uc29sZS5pbmZvKCdSZWNlaXZlZCBldmVudDonLCBKU09OLnN0cmluZ2lmeShldmVudCwgbnVsbCwgMikpO1xuXG4gIGNvbnN0IHZhbGlkYXRlZEV2ZW50ID0gdmFsaWRhdGVFdmVudChldmVudCk7XG4gIGNvbnN0IHsgdXNlcklkLCBiaXJ0aERhdGUsIGxhdGl0dWRlLCBsb25naXR1ZGUsIGlhbmFUaW1lWm9uZSB9ID0gdmFsaWRhdGVkRXZlbnQ7XG5cbiAgLy8gQmlydGggdGltZSBpcyBub3cgcmVxdWlyZWQgcGVyIEtBTi03XG4gIGlmICghdmFsaWRhdGVkRXZlbnQuYmlydGhUaW1lKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdCaXJ0aCB0aW1lIGlzIHJlcXVpcmVkIGZvciBob3VzZSBjYWxjdWxhdGlvbnMnKTtcbiAgfVxuXG4gIGNvbnN0IGJpcnRoVGltZSA9IHZhbGlkYXRlZEV2ZW50LmJpcnRoVGltZTtcbiAgY29uc3QgaXNUaW1lRXN0aW1hdGVkID0gZmFsc2U7IC8vIFNpbmNlIGJpcnRoIHRpbWUgaXMgbm93IHJlcXVpcmVkXG5cbiAgLy8gQ3JlYXRlIGEgZGF0ZSBvYmplY3QgdGhhdCByZXByZXNlbnRzIHRoZSBsb2NhbCB0aW1lIGF0IHRoZSBiaXJ0aCBsb2NhdGlvblxuICBjb25zdCBiaXJ0aERhdGVUaW1lU3RyID0gYCR7YmlydGhEYXRlfVQke2JpcnRoVGltZX06MDBgO1xuICBjb25zdCBiaXJ0aERhdGVUaW1lID0gbmV3IERhdGUoYmlydGhEYXRlVGltZVN0cik7XG5cbiAgLy8gQ2FsY3VsYXRlIHRpbWV6b25lIG9mZnNldFxuICBjb25zdCB0aW1lem9uZU9mZnNldEluSG91cnMgPVxuICAgIG5ldyBEYXRlKFxuICAgICAgYmlydGhEYXRlVGltZS50b0xvY2FsZVN0cmluZygnZW4tVVMnLCB7IHRpbWVab25lOiBpYW5hVGltZVpvbmUgfSksXG4gICAgKS5nZXRUaW1lem9uZU9mZnNldCgpIC8gLTYwO1xuXG4gIHRyeSB7XG4gICAgLy8gQ2FsY3VsYXRlIHBsYW5ldGFyeSBwb3NpdGlvbnMgdXNpbmcgZXhpc3RpbmcgZXBoZW1lcmlzIGxpYnJhcnlcbiAgICBjb25zdCBjaGFydERhdGEgPSBnZXRBbGxQbGFuZXRzKGJpcnRoRGF0ZVRpbWUsIGxvbmdpdHVkZSwgbGF0aXR1ZGUsIHRpbWV6b25lT2Zmc2V0SW5Ib3Vycyk7XG5cbiAgICAvLyBFeHRyYWN0IHBsYW5ldGFyeSBwb3NpdGlvbnMgZnJvbSB0aGUgb2JzZXJ2ZWQgbmFtZXNwYWNlXG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICBjb25zdCBwbGFuZXRzOiBSZWNvcmQ8c3RyaW5nLCBhbnk+ID0ge307XG4gICAgaWYgKGNoYXJ0RGF0YS5vYnNlcnZlZCkge1xuICAgICAgT2JqZWN0LmtleXMoY2hhcnREYXRhLm9ic2VydmVkKS5mb3JFYWNoKChwbGFuZXROYW1lKSA9PiB7XG4gICAgICAgIGNvbnN0IHBsYW5ldERhdGEgPSBjaGFydERhdGEub2JzZXJ2ZWRbcGxhbmV0TmFtZV07XG4gICAgICAgIGlmIChwbGFuZXREYXRhICYmIHBsYW5ldE5hbWUgIT09ICdzaXJpdXMnKSB7XG4gICAgICAgICAgY29uc3QgbG9uZ2l0dWRlID0gcGxhbmV0RGF0YS5hcHBhcmVudExvbmdpdHVkZURkIHx8IDA7XG4gICAgICAgICAgLy8gQ2FsY3VsYXRlIHpvZGlhYyBzaWduIGluZm9ybWF0aW9uXG4gICAgICAgICAgY29uc3Qgbm9ybWFsaXplZExvbmdpdHVkZSA9ICgobG9uZ2l0dWRlICUgMzYwKSArIDM2MCkgJSAzNjA7XG4gICAgICAgICAgY29uc3Qgc2lnbkluZGV4ID0gTWF0aC5mbG9vcihub3JtYWxpemVkTG9uZ2l0dWRlIC8gMzApO1xuICAgICAgICAgIGNvbnN0IHNpZ24gPSBaT0RJQUNfU0lHTlNbc2lnbkluZGV4XTtcbiAgICAgICAgICBjb25zdCBkZWdyZWVJblNpZ24gPSBub3JtYWxpemVkTG9uZ2l0dWRlIC0gc2lnbkluZGV4ICogMzA7XG4gICAgICAgICAgY29uc3Qgd2hvbGVEZWdyZWVzID0gTWF0aC5mbG9vcihkZWdyZWVJblNpZ24pO1xuICAgICAgICAgIGNvbnN0IG1pbnV0ZXMgPSBNYXRoLnJvdW5kKChkZWdyZWVJblNpZ24gLSB3aG9sZURlZ3JlZXMpICogNjApO1xuXG4gICAgICAgICAgcGxhbmV0c1twbGFuZXROYW1lXSA9IHtcbiAgICAgICAgICAgIGxvbmdpdHVkZTogbG9uZ2l0dWRlLFxuICAgICAgICAgICAgbG9uZ2l0dWRlRG1zOiBgJHt3aG9sZURlZ3JlZXMudG9TdHJpbmcoKS5wYWRTdGFydCgyLCAnMCcpfcKwJHttaW51dGVzLnRvU3RyaW5nKCkucGFkU3RhcnQoMiwgJzAnKX0nICR7c2lnbn1gLFxuICAgICAgICAgICAgZGlzdGFuY2VLbTogcGxhbmV0RGF0YS5nZW9jZW50cmljRGlzdGFuY2VLbSB8fCAwLFxuICAgICAgICAgICAgbmFtZTogcGxhbmV0RGF0YS5uYW1lIHx8IHBsYW5ldE5hbWUsXG4gICAgICAgICAgICBzaWduOiBzaWduLFxuICAgICAgICAgICAgZGVncmVlSW5TaWduOiB3aG9sZURlZ3JlZXMsXG4gICAgICAgICAgICBtaW51dGVzOiBtaW51dGVzLFxuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIENoZWNrIGNhY2hlIGZvciBob3VzZSBjYWxjdWxhdGlvbnNcbiAgICBjb25zdCBjYWNoZUtleSA9IGdlbmVyYXRlQ2FjaGVLZXkoYmlydGhEYXRlLCBiaXJ0aFRpbWUsIGxhdGl0dWRlLCBsb25naXR1ZGUpO1xuICAgIGxldCBob3VzZURhdGEgPSBhd2FpdCBnZXRDYWNoZWRIb3VzZURhdGEoY2FjaGVLZXkpO1xuXG4gICAgaWYgKCFob3VzZURhdGEpIHtcbiAgICAgIC8vIENhbGN1bGF0ZSBob3VzZXMgdXNpbmcgU3dpc3MgRXBoZW1lcmlzXG4gICAgICBob3VzZURhdGEgPSBhd2FpdCBjYWxjdWxhdGVIb3VzZXNXaXRoU3dpc3NlcGgoYmlydGhEYXRlVGltZSwgbGF0aXR1ZGUsIGxvbmdpdHVkZSk7XG5cbiAgICAgIGlmIChob3VzZURhdGEpIHtcbiAgICAgICAgLy8gU2F2ZSB0byBjYWNoZVxuICAgICAgICBhd2FpdCBzYXZlQ2FjaGVkSG91c2VEYXRhKGNhY2hlS2V5LCBob3VzZURhdGEpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFByZXBhcmUgdGhlIGl0ZW0gdG8gc3RvcmVcbiAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgIGNvbnN0IGl0ZW06IGFueSA9IHtcbiAgICAgIHVzZXJJZCxcbiAgICAgIGNoYXJ0VHlwZTogJ25hdGFsJyxcbiAgICAgIGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgaXNUaW1lRXN0aW1hdGVkLFxuICAgICAgYmlydGhJbmZvOiB7XG4gICAgICAgIC4uLnZhbGlkYXRlZEV2ZW50LFxuICAgICAgICBiaXJ0aFRpbWUsXG4gICAgICB9LFxuICAgICAgcGxhbmV0cyxcbiAgICAgIG1ldGFkYXRhOiB7XG4gICAgICAgIGNhbGN1bGF0aW9uVGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICAgIGVwaGVtZXJpc1ZlcnNpb246ICcyLjEwLjAzJyxcbiAgICAgICAgc3dldGVzdFZlcnNpb246ICcyLjEwLjAzJyxcbiAgICAgICAgaG91c2VTeXN0ZW06ICdwbGFjaWR1cycsXG4gICAgICAgIHpvZGlhY1R5cGU6ICd0cm9waWNhbCcsXG4gICAgICB9LFxuICAgIH07XG5cbiAgICAvLyBBZGQgaG91c2UgZGF0YSBpZiBhdmFpbGFibGVcbiAgICBpZiAoaG91c2VEYXRhKSB7XG4gICAgICBpdGVtLmhvdXNlcyA9IHtcbiAgICAgICAgc3RhdHVzOiAnc3VjY2VzcycsXG4gICAgICAgIGRhdGE6IGhvdXNlRGF0YS5ob3VzZXMsXG4gICAgICB9O1xuICAgICAgaXRlbS5hc2NlbmRhbnQgPSBob3VzZURhdGEuYXNjZW5kYW50O1xuICAgICAgaXRlbS5taWRoZWF2ZW4gPSBob3VzZURhdGEubWlkaGVhdmVuO1xuICAgICAgaXRlbS5wbGFuZXRIb3VzZXMgPSBob3VzZURhdGEucGxhbmV0SG91c2VzO1xuICAgIH0gZWxzZSB7XG4gICAgICBpdGVtLmhvdXNlcyA9IHtcbiAgICAgICAgc3RhdHVzOiAnZmFpbGVkJyxcbiAgICAgICAgZXJyb3I6ICdIb3VzZSBjYWxjdWxhdGlvbnMgdW5hdmFpbGFibGUnLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBTdG9yZSB0aGUgbmF0YWwgY2hhcnRcbiAgICBhd2FpdCBkb2NDbGllbnQuc2VuZChcbiAgICAgIG5ldyBQdXRDb21tYW5kKHtcbiAgICAgICAgVGFibGVOYW1lOiBOQVRBTF9DSEFSVF9UQUJMRV9OQU1FLFxuICAgICAgICBJdGVtOiBpdGVtLFxuICAgICAgfSksXG4gICAgKTtcblxuICAgIGNvbnNvbGUuaW5mbyhgU3VjY2Vzc2Z1bGx5IGdlbmVyYXRlZCBhbmQgc3RvcmVkIG5hdGFsIGNoYXJ0IGZvciB1c2VySWQ6ICR7dXNlcklkfWApO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGNhbGN1bGF0aW5nIG9yIHN0b3JpbmcgbmF0YWwgY2hhcnQ6JywgZXJyb3IpO1xuICAgIHRocm93IGVycm9yO1xuICB9XG59O1xuIl19