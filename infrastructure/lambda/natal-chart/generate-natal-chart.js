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
/**
 * Calculate derived angular points (Descendant and IC) from existing angles
 */
const calculateDerivedAngles = (ascendant, midheaven) => {
    // Descendant is opposite to Ascendant (180° difference)
    const descendantDegree = (ascendant.degree + 180) % 360;
    const descendantInfo = getDegreeInfo(descendantDegree);
    // Imum Coeli (IC) is opposite to Midheaven (180° difference)
    const icDegree = (midheaven.degree + 180) % 360;
    const icInfo = getDegreeInfo(icDegree);
    return {
        descendant: {
            degree: descendantDegree,
            sign: descendantInfo.sign,
            degreeInSign: descendantInfo.degreeInSign,
            minutes: descendantInfo.minutes,
        },
        imumCoeli: {
            degree: icDegree,
            sign: icInfo.sign,
            degreeInSign: icInfo.degreeInSign,
            minutes: icInfo.minutes,
        },
    };
};
/**
 * Calculate Part of Fortune using tropical zodiac formula
 * Formula: Ascendant + Moon - Sun
 */
const calculatePartOfFortune = (ascendantDegree, moonLongitude, sunLongitude) => {
    // Calculate Part of Fortune
    let fortuneDegree = ascendantDegree + moonLongitude - sunLongitude;
    // Normalize to 0-360° range
    fortuneDegree = ((fortuneDegree % 360) + 360) % 360;
    const fortuneInfo = getDegreeInfo(fortuneDegree);
    return {
        degree: fortuneDegree,
        sign: fortuneInfo.sign,
        degreeInSign: fortuneInfo.degreeInSign,
        minutes: fortuneInfo.minutes,
        name: 'Part of Fortune',
    };
};
/**
 * Calculate lunar nodes (North Node and South Node)
 */
const calculateLunarNodes = (julianDay) => {
    if (!swisseph) {
        console.warn('Swiss Ephemeris not available, skipping lunar nodes calculation');
        return null;
    }
    try {
        // Calculate True North Node
        const northNodeData = swisseph.swe_calc_ut(julianDay, swisseph.SE_TRUE_NODE, swisseph.SEFLG_SPEED);
        if (!northNodeData || northNodeData.longitude === undefined) {
            throw new Error('Failed to calculate North Node');
        }
        const northNodeInfo = getDegreeInfo(northNodeData.longitude);
        // South Node is always 180° opposite to North Node
        const southNodeDegree = (northNodeData.longitude + 180) % 360;
        const southNodeInfo = getDegreeInfo(southNodeDegree);
        return {
            northNode: {
                degree: northNodeData.longitude,
                sign: northNodeInfo.sign,
                degreeInSign: northNodeInfo.degreeInSign,
                minutes: northNodeInfo.minutes,
                name: 'North Node',
            },
            southNode: {
                degree: southNodeDegree,
                sign: southNodeInfo.sign,
                degreeInSign: southNodeInfo.degreeInSign,
                minutes: southNodeInfo.minutes,
                name: 'South Node',
            },
        };
    }
    catch (error) {
        console.error('Error calculating lunar nodes:', error);
        return null;
    }
};
/**
 * Calculate asteroids and minor celestial bodies
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const calculateAsteroids = (julianDay) => {
    if (!swisseph) {
        console.warn('Swiss Ephemeris not available, skipping asteroid calculations');
        return null;
    }
    try {
        // Asteroid numbering: For numbered asteroids, use SE_AST_OFFSET + asteroid number
        const asteroidIds = {
            ceres: swisseph.SE_CERES || 2, // Main belt asteroid
            pallas: swisseph.SE_PALLAS || 3, // Main belt asteroid
            juno: swisseph.SE_JUNO || 4, // Main belt asteroid
            vesta: swisseph.SE_VESTA || 5, // Main belt asteroid
            eris: swisseph.SE_AST_OFFSET + 136199, // Dwarf planet
            pholus: swisseph.SE_AST_OFFSET + 5145, // Centaur
            nessus: swisseph.SE_AST_OFFSET + 7066, // Centaur
            ixion: swisseph.SE_AST_OFFSET + 28978, // Plutino
            orcus: swisseph.SE_AST_OFFSET + 90482, // Plutino
            quaoar: swisseph.SE_AST_OFFSET + 50000, // Trans-Neptunian object
            sedna: swisseph.SE_AST_OFFSET + 90377, // Trans-Neptunian object
            varuna: swisseph.SE_AST_OFFSET + 20000, // Trans-Neptunian object
        };
        const asteroidNames = {
            ceres: 'Ceres',
            pallas: 'Pallas Athene',
            juno: 'Juno',
            vesta: 'Vesta',
            eris: 'Eris',
            pholus: 'Pholus',
            nessus: 'Nessus',
            ixion: 'Ixion',
            orcus: 'Orcus',
            quaoar: 'Quaoar',
            sedna: 'Sedna',
            varuna: 'Varuna',
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const asteroids = {};
        // Calculate each asteroid
        for (const [key, asteroidId] of Object.entries(asteroidIds)) {
            try {
                const asteroidData = swisseph.swe_calc_ut(julianDay, asteroidId, swisseph.SEFLG_SPEED);
                if (asteroidData && asteroidData.longitude !== undefined) {
                    const asteroidInfo = getDegreeInfo(asteroidData.longitude);
                    asteroids[key] = {
                        degree: asteroidData.longitude,
                        sign: asteroidInfo.sign,
                        degreeInSign: asteroidInfo.degreeInSign,
                        minutes: asteroidInfo.minutes,
                        name: asteroidNames[key],
                    };
                }
                else {
                    console.warn(`Failed to calculate asteroid: ${key}`);
                    // Set default/placeholder data for missing asteroids
                    asteroids[key] = {
                        degree: 0,
                        sign: 'Unknown',
                        degreeInSign: 0,
                        minutes: 0,
                        name: asteroidNames[key],
                    };
                }
            }
            catch (error) {
                console.error(`Error calculating asteroid ${key}:`, error);
                // Continue with next asteroid on error
                asteroids[key] = {
                    degree: 0,
                    sign: 'Unknown',
                    degreeInSign: 0,
                    minutes: 0,
                    name: asteroidNames[key],
                };
            }
        }
        return asteroids;
    }
    catch (error) {
        console.error('Error calculating asteroids:', error);
        return null;
    }
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
        // Extract Vertex if available
        let vertex;
        if (houseData.vertex !== undefined) {
            const vertexInfo = getDegreeInfo(houseData.vertex);
            vertex = {
                degree: houseData.vertex,
                sign: vertexInfo.sign,
                degreeInSign: vertexInfo.degreeInSign,
                minutes: vertexInfo.minutes,
            };
        }
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
            vertex,
            julianDay,
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
                schemaVersion: '2.0.0', // Track schema version for new celestial bodies
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
            // Calculate and add additional angular points
            console.info('Calculating additional angular points (Descendant, IC)');
            const derivedAngles = calculateDerivedAngles(houseData.ascendant, houseData.midheaven);
            // Calculate Part of Fortune (requires Sun and Moon positions)
            console.info('Calculating Part of Fortune');
            let partOfFortune;
            if (planets.sun && planets.moon) {
                partOfFortune = calculatePartOfFortune(houseData.ascendant.degree, planets.moon.longitude, planets.sun.longitude);
            }
            // Calculate lunar nodes
            console.info('Calculating lunar nodes');
            const lunarNodes = calculateLunarNodes(houseData.julianDay);
            // Build additionalPoints object
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const additionalPoints = {
                descendant: derivedAngles.descendant,
                imumCoeli: derivedAngles.imumCoeli,
            };
            if (partOfFortune) {
                additionalPoints.partOfFortune = partOfFortune;
            }
            if (houseData.vertex) {
                additionalPoints.vertex = houseData.vertex;
            }
            if (lunarNodes) {
                additionalPoints.northNode = lunarNodes.northNode;
                additionalPoints.southNode = lunarNodes.southNode;
            }
            item.additionalPoints = additionalPoints;
            // Calculate asteroids
            console.info('Calculating asteroids');
            const asteroids = calculateAsteroids(houseData.julianDay);
            if (asteroids) {
                item.asteroids = asteroids;
            }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGUtbmF0YWwtY2hhcnQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJnZW5lcmF0ZS1uYXRhbC1jaGFydC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLDhEQUEwRDtBQUMxRCx3REFBdUY7QUFDdkYseUNBQTBDO0FBQzFDLCtDQUFpQztBQUNqQyxpQ0FBaUM7QUFFakMsTUFBTSxZQUFZLEdBQUcsSUFBSSxnQ0FBYyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBQzVDLE1BQU0sU0FBUyxHQUFHLHFDQUFzQixDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztBQUU1RCx3Q0FBd0M7QUFDeEMsOERBQThEO0FBQzlELElBQUksUUFBYSxDQUFDO0FBQ2xCLElBQUksYUFBaUMsQ0FBQztBQUV0QyxxREFBcUQ7QUFDckQsTUFBTSxZQUFZLEdBQUcsR0FBRyxFQUFFO0lBQ3hCLDhDQUE4QztJQUM5QyxNQUFNLElBQUksR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDN0IsTUFBTSxFQUFFLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBRXpCLDJEQUEyRDtJQUMzRCxJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsWUFBWSxJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsY0FBYyxFQUFFLENBQUM7UUFDM0QsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQzlELElBQUksRUFBRSxDQUFDLFVBQVUsQ0FBQyxjQUFjLENBQUMsRUFBRSxDQUFDO1lBQ2xDLElBQUksQ0FBQztnQkFDSCxRQUFRLEdBQUcsT0FBTyxDQUFDLGNBQWMsQ0FBQyxDQUFDO2dCQUNuQyxhQUFhLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUM7Z0JBRXpDLE9BQU8sQ0FBQyxJQUFJLENBQUMsNENBQTRDLEVBQUU7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S0FBSyxDQUFDLDJDQUEyQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ2xFLE1BQU0sS0FBSyxDQUFDO0lBQ2QsQ0FBQztBQUNILENBQUMsQ0FBQztBQWpNVyxRQUFBLE9BQU8sV0FpTWxCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgRHluYW1vREJDbGllbnQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtZHluYW1vZGInO1xuaW1wb3J0IHsgRHluYW1vREJEb2N1bWVudENsaWVudCwgUHV0Q29tbWFuZCwgR2V0Q29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYic7XG5pbXBvcnQgeyBnZXRBbGxQbGFuZXRzIH0gZnJvbSAnZXBoZW1lcmlzJztcbmltcG9ydCAqIGFzIGNyeXB0byBmcm9tICdjcnlwdG8nO1xuaW1wb3J0IHsgRGF0ZVRpbWUgfSBmcm9tICdsdXhvbic7XG5cbmNvbnN0IGR5bmFtb0NsaWVudCA9IG5ldyBEeW5hbW9EQkNsaWVudCh7fSk7XG5jb25zdCBkb2NDbGllbnQgPSBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LmZyb20oZHluYW1vQ2xpZW50KTtcblxuLy8gSW1wb3J0IHN3aXNzZXBoIGZyb20gdGhlIExhbWJkYSBMYXllclxuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbmxldCBzd2lzc2VwaDogYW55O1xubGV0IGVwaGVtZXJpc1BhdGg6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuLy8gQ29sZCBzdGFydCBsb2dnaW5nIGZvciBlcGhlbWVyaXMgcGF0aCB2ZXJpZmljYXRpb25cbmNvbnN0IGluaXRTd2lzc0VwaCA9ICgpID0+IHtcbiAgLy8gVHJ5IGRpZmZlcmVudCBwYXRocyB0byBmaW5kIFN3aXNzIEVwaGVtZXJpc1xuICBjb25zdCBwYXRoID0gcmVxdWlyZSgncGF0aCcpO1xuICBjb25zdCBmcyA9IHJlcXVpcmUoJ2ZzJyk7XG5cbiAgLy8gVXNlIGVudmlyb25tZW50IHZhcmlhYmxlcyBpZiBzZXQgKGZvciB0ZXN0IGVudmlyb25tZW50cylcbiAgaWYgKHByb2Nlc3MuZW52LlNFX0VQSEVfUEFUSCAmJiBwcm9jZXNzLmVudi5FUEhFTUVSSVNfUEFUSCkge1xuICAgIGNvbnN0IHRlc3RNb2R1bGVQYXRoID0gcGF0aC5kaXJuYW1lKHByb2Nlc3MuZW52LlNFX0VQSEVfUEFUSCk7XG4gICAgaWYgKGZzLmV4aXN0c1N5bmModGVzdE1vZHVsZVBhdGgpKSB7XG4gICAgICB0cnkge1xuICAgICAgICBzd2lzc2VwaCA9IHJlcXVpcmUodGVzdE1vZHVsZVBhdGgpO1xuICAgICAgICBlcGhlbWVyaXNQYXRoID0gcHJvY2Vzcy5lbnYuU0VfRVBIRV9QQVRIO1xuXG4gICAgICAgIGNvbnNvbGUuaW5mbygnU3dpc3MgRXBoZW1lcmlzIGluaXRpYWxpemF0aW9uIChmcm9tIGVudik6Jywge1xuICAgICAgICAgIHBhdGg6IGVwaGVtZXJpc1BhdGgsXG4gICAgICAgICAgbW9kdWxlUGF0aDogdGVzdE1vZHVsZVBhdGgsXG4gICAgICAgICAgZW52U0VfRVBIRV9QQVRIOiBwcm9jZXNzLmVudi5TRV9FUEhFX1BBVEgsXG4gICAgICAgICAgZW52RVBIRU1FUklTX1BBVEg6IHByb2Nlc3MuZW52LkVQSEVNRVJJU19QQVRILFxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBWZXJpZnkgZXBoZW1lcmlzIGRpcmVjdG9yeSBleGlzdHNcbiAgICAgICAgaWYgKGZzLmV4aXN0c1N5bmMoZXBoZW1lcmlzUGF0aCkpIHtcbiAgICAgICAgICBjb25zdCBmaWxlcyA9IGZzLnJlYWRkaXJTeW5jKGVwaGVtZXJpc1BhdGgpO1xuICAgICAgICAgIGNvbnN0IHNlRmlsZXMgPSBmaWxlcy5maWx0ZXIoXG4gICAgICAgICAgICAoZjogc3RyaW5nKSA9PiBmLmVuZHNXaXRoKCcuc2UxJykgfHwgZiA9PT0gJ3NlbGVhcHNlYy50eHQnIHx8IGYgPT09ICdzZW9yYmVsLnR4dCcsXG4gICAgICAgICAgKTtcbiAgICAgICAgICBjb25zb2xlLmluZm8oJ0VwaGVtZXJpcyBmaWxlcyBmb3VuZDonLCBzZUZpbGVzLmxlbmd0aCwgJ2ZpbGVzOicsIHNlRmlsZXMuc2xpY2UoMCwgNSkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0VwaGVtZXJpcyBkaXJlY3RvcnkgZG9lcyBub3QgZXhpc3Q6JywgZXBoZW1lcmlzUGF0aCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm47IC8vIFN1Y2Nlc3NmdWxseSBsb2FkZWQgZnJvbSBlbnZpcm9ubWVudFxuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLndhcm4oJ0ZhaWxlZCB0byBsb2FkIGZyb20gZW52aXJvbm1lbnQgcGF0aHM6JywgZSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgY29uc3QgcG9zc2libGVQYXRocyA9IFtcbiAgICAnL29wdC9ub2RlanMvbm9kZV9tb2R1bGVzL3N3aXNzZXBoJywgLy8gTGFtYmRhIGxheWVyIHBhdGhcbiAgICBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vbGF5ZXJzL3N3ZXRlc3QvbGF5ZXIvbm9kZWpzL25vZGVfbW9kdWxlcy9zd2lzc2VwaCcpLCAvLyBUZXN0IGVudmlyb25tZW50IHBhdGhcbiAgICAnc3dpc3NlcGgnLCAvLyBOb3JtYWwgcmVxdWlyZSBwYXRoXG4gIF07XG5cbiAgZm9yIChjb25zdCBtb2R1bGVQYXRoIG9mIHBvc3NpYmxlUGF0aHMpIHtcbiAgICB0cnkge1xuICAgICAgc3dpc3NlcGggPSByZXF1aXJlKG1vZHVsZVBhdGgpO1xuXG4gICAgICAvLyBTZXQgZXBoZW1lcmlzIHBhdGggYmFzZWQgb24gZW52aXJvbm1lbnRcbiAgICAgIGlmIChwcm9jZXNzLmVudi5TRV9FUEhFX1BBVEgpIHtcbiAgICAgICAgZXBoZW1lcmlzUGF0aCA9IHByb2Nlc3MuZW52LlNFX0VQSEVfUEFUSDtcbiAgICAgIH0gZWxzZSBpZiAocHJvY2Vzcy5lbnYuRVBIRU1FUklTX1BBVEgpIHtcbiAgICAgICAgZXBoZW1lcmlzUGF0aCA9IHByb2Nlc3MuZW52LkVQSEVNRVJJU19QQVRIO1xuICAgICAgfSBlbHNlIGlmIChtb2R1bGVQYXRoLnN0YXJ0c1dpdGgoJy9vcHQnKSkge1xuICAgICAgICBlcGhlbWVyaXNQYXRoID0gJy9vcHQvbm9kZWpzL25vZGVfbW9kdWxlcy9zd2lzc2VwaC9lcGhlJztcbiAgICAgIH0gZWxzZSBpZiAobW9kdWxlUGF0aC5pbmNsdWRlcygnbGF5ZXJzL3N3ZXRlc3QnKSkge1xuICAgICAgICBlcGhlbWVyaXNQYXRoID0gcGF0aC5qb2luKG1vZHVsZVBhdGgsICdlcGhlJyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBlcGhlbWVyaXNQYXRoID0gcGF0aC5qb2luKHBhdGguZGlybmFtZShyZXF1aXJlLnJlc29sdmUobW9kdWxlUGF0aCkpLCAnZXBoZScpO1xuICAgICAgfVxuXG4gICAgICAvLyBMb2cgZXBoZW1lcmlzIHBhdGggb24gY29sZCBzdGFydFxuICAgICAgY29uc29sZS5pbmZvKCdTd2lzcyBFcGhlbWVyaXMgaW5pdGlhbGl6YXRpb246Jywge1xuICAgICAgICBwYXRoOiBlcGhlbWVyaXNQYXRoLFxuICAgICAgICBtb2R1bGVQYXRoOiBtb2R1bGVQYXRoLFxuICAgICAgICBlbnZTRV9FUEhFX1BBVEg6IHByb2Nlc3MuZW52LlNFX0VQSEVfUEFUSCxcbiAgICAgICAgZW52RVBIRU1FUklTX1BBVEg6IHByb2Nlc3MuZW52LkVQSEVNRVJJU19QQVRILFxuICAgICAgfSk7XG5cbiAgICAgIC8vIFZlcmlmeSBlcGhlbWVyaXMgZGlyZWN0b3J5IGV4aXN0c1xuICAgICAgaWYgKGZzLmV4aXN0c1N5bmMoZXBoZW1lcmlzUGF0aCkpIHtcbiAgICAgICAgY29uc3QgZmlsZXMgPSBmcy5yZWFkZGlyU3luYyhlcGhlbWVyaXNQYXRoKTtcbiAgICAgICAgY29uc3Qgc2VGaWxlcyA9IGZpbGVzLmZpbHRlcihcbiAgICAgICAgICAoZjogc3RyaW5nKSA9PiBmLmVuZHNXaXRoKCcuc2UxJykgfHwgZiA9PT0gJ3NlbGVhcHNlYy50eHQnIHx8IGYgPT09ICdzZW9yYmVsLnR4dCcsXG4gICAgICAgICk7XG4gICAgICAgIGNvbnNvbGUuaW5mbygnRXBoZW1lcmlzIGZpbGVzIGZvdW5kOicsIHNlRmlsZXMubGVuZ3RoLCAnZmlsZXM6Jywgc2VGaWxlcy5zbGljZSgwLCA1KSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdFcGhlbWVyaXMgZGlyZWN0b3J5IGRvZXMgbm90IGV4aXN0OicsIGVwaGVtZXJpc1BhdGgpO1xuICAgICAgfVxuXG4gICAgICAvLyBTdWNjZXNzZnVsbHkgbG9hZGVkXG4gICAgICBicmVhaztcbiAgICB9IGNhdGNoIChfZXJyb3IpIHtcbiAgICAgIC8vIFRyeSBuZXh0IHBhdGhcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgfVxuXG4gIGlmICghc3dpc3NlcGgpIHtcbiAgICBjb25zb2xlLmVycm9yKCdTd2lzcyBFcGhlbWVyaXMgbm90IGF2YWlsYWJsZSBmcm9tIGFueSBwYXRoJyk7XG4gIH1cbn07XG5cbi8vIEluaXRpYWxpemUgb24gY29sZCBzdGFydFxuaW5pdFN3aXNzRXBoKCk7XG5cbmludGVyZmFjZSBOYXRhbENoYXJ0RXZlbnQge1xuICB1c2VySWQ6IHN0cmluZztcbiAgYmlydGhEYXRlOiBzdHJpbmc7IC8vIFlZWVktTU0tRERcbiAgYmlydGhUaW1lPzogc3RyaW5nOyAvLyBISDpNTVxuICBsYXRpdHVkZTogbnVtYmVyO1xuICBsb25naXR1ZGU6IG51bWJlcjtcbiAgaWFuYVRpbWVab25lOiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBIb3VzZURhdGEge1xuICBob3VzZU51bWJlcjogbnVtYmVyO1xuICBjdXNwRGVncmVlOiBudW1iZXI7XG4gIGN1c3BTaWduOiBzdHJpbmc7XG4gIGN1c3BEZWdyZWVJblNpZ246IG51bWJlcjtcbiAgY3VzcE1pbnV0ZXM6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIEFuZ2xlRGF0YSB7XG4gIGRlZ3JlZTogbnVtYmVyO1xuICBzaWduOiBzdHJpbmc7XG4gIGRlZ3JlZUluU2lnbjogbnVtYmVyO1xuICBtaW51dGVzOiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBDZWxlc3RpYWxCb2R5RGF0YSB7XG4gIGRlZ3JlZTogbnVtYmVyO1xuICBzaWduOiBzdHJpbmc7XG4gIGRlZ3JlZUluU2lnbjogbnVtYmVyO1xuICBtaW51dGVzOiBudW1iZXI7XG4gIG5hbWU6IHN0cmluZztcbn1cblxuY29uc3QgWk9ESUFDX1NJR05TID0gW1xuICAnQXJpZXMnLFxuICAnVGF1cnVzJyxcbiAgJ0dlbWluaScsXG4gICdDYW5jZXInLFxuICAnTGVvJyxcbiAgJ1ZpcmdvJyxcbiAgJ0xpYnJhJyxcbiAgJ1Njb3JwaW8nLFxuICAnU2FnaXR0YXJpdXMnLFxuICAnQ2Fwcmljb3JuJyxcbiAgJ0FxdWFyaXVzJyxcbiAgJ1Bpc2NlcycsXG5dO1xuXG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuY29uc3QgdmFsaWRhdGVFdmVudCA9IChldmVudDogYW55KTogTmF0YWxDaGFydEV2ZW50ID0+IHtcbiAgaWYgKFxuICAgICFldmVudC51c2VySWQgfHxcbiAgICAhZXZlbnQuYmlydGhEYXRlIHx8XG4gICAgIWV2ZW50LmxhdGl0dWRlIHx8XG4gICAgIWV2ZW50LmxvbmdpdHVkZSB8fFxuICAgICFldmVudC5pYW5hVGltZVpvbmVcbiAgKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdNaXNzaW5nIHJlcXVpcmVkIGV2ZW50IHByb3BlcnRpZXMnKTtcbiAgfVxuXG4gIC8vIFZhbGlkYXRlIGNvb3JkaW5hdGVzXG4gIGlmIChldmVudC5sYXRpdHVkZSA8IC05MCB8fCBldmVudC5sYXRpdHVkZSA+IDkwKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGxhdGl0dWRlOiBtdXN0IGJlIGJldHdlZW4gLTkwIGFuZCA5MCcpO1xuICB9XG4gIGlmIChldmVudC5sb25naXR1ZGUgPCAtMTgwIHx8IGV2ZW50LmxvbmdpdHVkZSA+IDE4MCkge1xuICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBsb25naXR1ZGU6IG11c3QgYmUgYmV0d2VlbiAtMTgwIGFuZCAxODAnKTtcbiAgfVxuXG4gIHJldHVybiBldmVudDtcbn07XG5cbmNvbnN0IGdldERlZ3JlZUluZm8gPSAoZGVncmVlOiBudW1iZXIpOiB7IHNpZ246IHN0cmluZzsgZGVncmVlSW5TaWduOiBudW1iZXI7IG1pbnV0ZXM6IG51bWJlciB9ID0+IHtcbiAgY29uc3Qgbm9ybWFsaXplZERlZ3JlZSA9IGRlZ3JlZSAlIDM2MDtcbiAgY29uc3Qgc2lnbkluZGV4ID0gTWF0aC5mbG9vcihub3JtYWxpemVkRGVncmVlIC8gMzApO1xuICBjb25zdCBkZWdyZWVJblNpZ24gPSBub3JtYWxpemVkRGVncmVlICUgMzA7XG4gIGNvbnN0IHdob2xlRGVncmVlcyA9IE1hdGguZmxvb3IoZGVncmVlSW5TaWduKTtcbiAgY29uc3QgbWludXRlcyA9IE1hdGgucm91bmQoKGRlZ3JlZUluU2lnbiAtIHdob2xlRGVncmVlcykgKiA2MCk7XG5cbiAgcmV0dXJuIHtcbiAgICBzaWduOiBaT0RJQUNfU0lHTlNbc2lnbkluZGV4XSxcbiAgICBkZWdyZWVJblNpZ246IHdob2xlRGVncmVlcyxcbiAgICBtaW51dGVzLFxuICB9O1xufTtcblxuLyoqXG4gKiBDYWxjdWxhdGUgZGVyaXZlZCBhbmd1bGFyIHBvaW50cyAoRGVzY2VuZGFudCBhbmQgSUMpIGZyb20gZXhpc3RpbmcgYW5nbGVzXG4gKi9cbmNvbnN0IGNhbGN1bGF0ZURlcml2ZWRBbmdsZXMgPSAoXG4gIGFzY2VuZGFudDogQW5nbGVEYXRhLFxuICBtaWRoZWF2ZW46IEFuZ2xlRGF0YSxcbik6IHsgZGVzY2VuZGFudDogQW5nbGVEYXRhOyBpbXVtQ29lbGk6IEFuZ2xlRGF0YSB9ID0+IHtcbiAgLy8gRGVzY2VuZGFudCBpcyBvcHBvc2l0ZSB0byBBc2NlbmRhbnQgKDE4MMKwIGRpZmZlcmVuY2UpXG4gIGNvbnN0IGRlc2NlbmRhbnREZWdyZWUgPSAoYXNjZW5kYW50LmRlZ3JlZSArIDE4MCkgJSAzNjA7XG4gIGNvbnN0IGRlc2NlbmRhbnRJbmZvID0gZ2V0RGVncmVlSW5mbyhkZXNjZW5kYW50RGVncmVlKTtcblxuICAvLyBJbXVtIENvZWxpIChJQykgaXMgb3Bwb3NpdGUgdG8gTWlkaGVhdmVuICgxODDCsCBkaWZmZXJlbmNlKVxuICBjb25zdCBpY0RlZ3JlZSA9IChtaWRoZWF2ZW4uZGVncmVlICsgMTgwKSAlIDM2MDtcbiAgY29uc3QgaWNJbmZvID0gZ2V0RGVncmVlSW5mbyhpY0RlZ3JlZSk7XG5cbiAgcmV0dXJuIHtcbiAgICBkZXNjZW5kYW50OiB7XG4gICAgICBkZWdyZWU6IGRlc2NlbmRhbnREZWdyZWUsXG4gICAgICBzaWduOiBkZXNjZW5kYW50SW5mby5zaWduLFxuICAgICAgZGVncmVlSW5TaWduOiBkZXNjZW5kYW50SW5mby5kZWdyZWVJblNpZ24sXG4gICAgICBtaW51dGVzOiBkZXNjZW5kYW50SW5mby5taW51dGVzLFxuICAgIH0sXG4gICAgaW11bUNvZWxpOiB7XG4gICAgICBkZWdyZWU6IGljRGVncmVlLFxuICAgICAgc2lnbjogaWNJbmZvLnNpZ24sXG4gICAgICBkZWdyZWVJblNpZ246IGljSW5mby5kZWdyZWVJblNpZ24sXG4gICAgICBtaW51dGVzOiBpY0luZm8ubWludXRlcyxcbiAgICB9LFxuICB9O1xufTtcblxuLyoqXG4gKiBDYWxjdWxhdGUgUGFydCBvZiBGb3J0dW5lIHVzaW5nIHRyb3BpY2FsIHpvZGlhYyBmb3JtdWxhXG4gKiBGb3JtdWxhOiBBc2NlbmRhbnQgKyBNb29uIC0gU3VuXG4gKi9cbmNvbnN0IGNhbGN1bGF0ZVBhcnRPZkZvcnR1bmUgPSAoXG4gIGFzY2VuZGFudERlZ3JlZTogbnVtYmVyLFxuICBtb29uTG9uZ2l0dWRlOiBudW1iZXIsXG4gIHN1bkxvbmdpdHVkZTogbnVtYmVyLFxuKTogQ2VsZXN0aWFsQm9keURhdGEgPT4ge1xuICAvLyBDYWxjdWxhdGUgUGFydCBvZiBGb3J0dW5lXG4gIGxldCBmb3J0dW5lRGVncmVlID0gYXNjZW5kYW50RGVncmVlICsgbW9vbkxvbmdpdHVkZSAtIHN1bkxvbmdpdHVkZTtcblxuICAvLyBOb3JtYWxpemUgdG8gMC0zNjDCsCByYW5nZVxuICBmb3J0dW5lRGVncmVlID0gKChmb3J0dW5lRGVncmVlICUgMzYwKSArIDM2MCkgJSAzNjA7XG5cbiAgY29uc3QgZm9ydHVuZUluZm8gPSBnZXREZWdyZWVJbmZvKGZvcnR1bmVEZWdyZWUpO1xuXG4gIHJldHVybiB7XG4gICAgZGVncmVlOiBmb3J0dW5lRGVncmVlLFxuICAgIHNpZ246IGZvcnR1bmVJbmZvLnNpZ24sXG4gICAgZGVncmVlSW5TaWduOiBmb3J0dW5lSW5mby5kZWdyZWVJblNpZ24sXG4gICAgbWludXRlczogZm9ydHVuZUluZm8ubWludXRlcyxcbiAgICBuYW1lOiAnUGFydCBvZiBGb3J0dW5lJyxcbiAgfTtcbn07XG5cbi8qKlxuICogQ2FsY3VsYXRlIGx1bmFyIG5vZGVzIChOb3J0aCBOb2RlIGFuZCBTb3V0aCBOb2RlKVxuICovXG5jb25zdCBjYWxjdWxhdGVMdW5hck5vZGVzID0gKFxuICBqdWxpYW5EYXk6IG51bWJlcixcbik6IHsgbm9ydGhOb2RlOiBDZWxlc3RpYWxCb2R5RGF0YTsgc291dGhOb2RlOiBDZWxlc3RpYWxCb2R5RGF0YSB9IHwgbnVsbCA9PiB7XG4gIGlmICghc3dpc3NlcGgpIHtcbiAgICBjb25zb2xlLndhcm4oJ1N3aXNzIEVwaGVtZXJpcyBub3QgYXZhaWxhYmxlLCBza2lwcGluZyBsdW5hciBub2RlcyBjYWxjdWxhdGlvbicpO1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgdHJ5IHtcbiAgICAvLyBDYWxjdWxhdGUgVHJ1ZSBOb3J0aCBOb2RlXG4gICAgY29uc3Qgbm9ydGhOb2RlRGF0YSA9IHN3aXNzZXBoLnN3ZV9jYWxjX3V0KFxuICAgICAganVsaWFuRGF5LFxuICAgICAgc3dpc3NlcGguU0VfVFJVRV9OT0RFLFxuICAgICAgc3dpc3NlcGguU0VGTEdfU1BFRUQsXG4gICAgKTtcblxuICAgIGlmICghbm9ydGhOb2RlRGF0YSB8fCBub3J0aE5vZGVEYXRhLmxvbmdpdHVkZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZhaWxlZCB0byBjYWxjdWxhdGUgTm9ydGggTm9kZScpO1xuICAgIH1cblxuICAgIGNvbnN0IG5vcnRoTm9kZUluZm8gPSBnZXREZWdyZWVJbmZvKG5vcnRoTm9kZURhdGEubG9uZ2l0dWRlKTtcblxuICAgIC8vIFNvdXRoIE5vZGUgaXMgYWx3YXlzIDE4MMKwIG9wcG9zaXRlIHRvIE5vcnRoIE5vZGVcbiAgICBjb25zdCBzb3V0aE5vZGVEZWdyZWUgPSAobm9ydGhOb2RlRGF0YS5sb25naXR1ZGUgKyAxODApICUgMzYwO1xuICAgIGNvbnN0IHNvdXRoTm9kZUluZm8gPSBnZXREZWdyZWVJbmZvKHNvdXRoTm9kZURlZ3JlZSk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgbm9ydGhOb2RlOiB7XG4gICAgICAgIGRlZ3JlZTogbm9ydGhOb2RlRGF0YS5sb25naXR1ZGUsXG4gICAgICAgIHNpZ246IG5vcnRoTm9kZUluZm8uc2lnbixcbiAgICAgICAgZGVncmVlSW5TaWduOiBub3J0aE5vZGVJbmZvLmRlZ3JlZUluU2lnbixcbiAgICAgICAgbWludXRlczogbm9ydGhOb2RlSW5mby5taW51dGVzLFxuICAgICAgICBuYW1lOiAnTm9ydGggTm9kZScsXG4gICAgICB9LFxuICAgICAgc291dGhOb2RlOiB7XG4gICAgICAgIGRlZ3JlZTogc291dGhOb2RlRGVncmVlLFxuICAgICAgICBzaWduOiBzb3V0aE5vZGVJbmZvLnNpZ24sXG4gICAgICAgIGRlZ3JlZUluU2lnbjogc291dGhOb2RlSW5mby5kZWdyZWVJblNpZ24sXG4gICAgICAgIG1pbnV0ZXM6IHNvdXRoTm9kZUluZm8ubWludXRlcyxcbiAgICAgICAgbmFtZTogJ1NvdXRoIE5vZGUnLFxuICAgICAgfSxcbiAgICB9O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGNhbGN1bGF0aW5nIGx1bmFyIG5vZGVzOicsIGVycm9yKTtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufTtcblxuLyoqXG4gKiBDYWxjdWxhdGUgYXN0ZXJvaWRzIGFuZCBtaW5vciBjZWxlc3RpYWwgYm9kaWVzXG4gKi9cbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5jb25zdCBjYWxjdWxhdGVBc3Rlcm9pZHMgPSAoanVsaWFuRGF5OiBudW1iZXIpOiBhbnkgfCBudWxsID0+IHtcbiAgaWYgKCFzd2lzc2VwaCkge1xuICAgIGNvbnNvbGUud2FybignU3dpc3MgRXBoZW1lcmlzIG5vdCBhdmFpbGFibGUsIHNraXBwaW5nIGFzdGVyb2lkIGNhbGN1bGF0aW9ucycpO1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgdHJ5IHtcbiAgICAvLyBBc3Rlcm9pZCBudW1iZXJpbmc6IEZvciBudW1iZXJlZCBhc3Rlcm9pZHMsIHVzZSBTRV9BU1RfT0ZGU0VUICsgYXN0ZXJvaWQgbnVtYmVyXG4gICAgY29uc3QgYXN0ZXJvaWRJZHMgPSB7XG4gICAgICBjZXJlczogc3dpc3NlcGguU0VfQ0VSRVMgfHwgMiwgLy8gTWFpbiBiZWx0IGFzdGVyb2lkXG4gICAgICBwYWxsYXM6IHN3aXNzZXBoLlNFX1BBTExBUyB8fCAzLCAvLyBNYWluIGJlbHQgYXN0ZXJvaWRcbiAgICAgIGp1bm86IHN3aXNzZXBoLlNFX0pVTk8gfHwgNCwgLy8gTWFpbiBiZWx0IGFzdGVyb2lkXG4gICAgICB2ZXN0YTogc3dpc3NlcGguU0VfVkVTVEEgfHwgNSwgLy8gTWFpbiBiZWx0IGFzdGVyb2lkXG4gICAgICBlcmlzOiBzd2lzc2VwaC5TRV9BU1RfT0ZGU0VUICsgMTM2MTk5LCAvLyBEd2FyZiBwbGFuZXRcbiAgICAgIHBob2x1czogc3dpc3NlcGguU0VfQVNUX09GRlNFVCArIDUxNDUsIC8vIENlbnRhdXJcbiAgICAgIG5lc3N1czogc3dpc3NlcGguU0VfQVNUX09GRlNFVCArIDcwNjYsIC8vIENlbnRhdXJcbiAgICAgIGl4aW9uOiBzd2lzc2VwaC5TRV9BU1RfT0ZGU0VUICsgMjg5NzgsIC8vIFBsdXRpbm9cbiAgICAgIG9yY3VzOiBzd2lzc2VwaC5TRV9BU1RfT0ZGU0VUICsgOTA0ODIsIC8vIFBsdXRpbm9cbiAgICAgIHF1YW9hcjogc3dpc3NlcGguU0VfQVNUX09GRlNFVCArIDUwMDAwLCAvLyBUcmFucy1OZXB0dW5pYW4gb2JqZWN0XG4gICAgICBzZWRuYTogc3dpc3NlcGguU0VfQVNUX09GRlNFVCArIDkwMzc3LCAvLyBUcmFucy1OZXB0dW5pYW4gb2JqZWN0XG4gICAgICB2YXJ1bmE6IHN3aXNzZXBoLlNFX0FTVF9PRkZTRVQgKyAyMDAwMCwgLy8gVHJhbnMtTmVwdHVuaWFuIG9iamVjdFxuICAgIH07XG5cbiAgICBjb25zdCBhc3Rlcm9pZE5hbWVzID0ge1xuICAgICAgY2VyZXM6ICdDZXJlcycsXG4gICAgICBwYWxsYXM6ICdQYWxsYXMgQXRoZW5lJyxcbiAgICAgIGp1bm86ICdKdW5vJyxcbiAgICAgIHZlc3RhOiAnVmVzdGEnLFxuICAgICAgZXJpczogJ0VyaXMnLFxuICAgICAgcGhvbHVzOiAnUGhvbHVzJyxcbiAgICAgIG5lc3N1czogJ05lc3N1cycsXG4gICAgICBpeGlvbjogJ0l4aW9uJyxcbiAgICAgIG9yY3VzOiAnT3JjdXMnLFxuICAgICAgcXVhb2FyOiAnUXVhb2FyJyxcbiAgICAgIHNlZG5hOiAnU2VkbmEnLFxuICAgICAgdmFydW5hOiAnVmFydW5hJyxcbiAgICB9O1xuXG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICBjb25zdCBhc3Rlcm9pZHM6IGFueSA9IHt9O1xuXG4gICAgLy8gQ2FsY3VsYXRlIGVhY2ggYXN0ZXJvaWRcbiAgICBmb3IgKGNvbnN0IFtrZXksIGFzdGVyb2lkSWRdIG9mIE9iamVjdC5lbnRyaWVzKGFzdGVyb2lkSWRzKSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgYXN0ZXJvaWREYXRhID0gc3dpc3NlcGguc3dlX2NhbGNfdXQoanVsaWFuRGF5LCBhc3Rlcm9pZElkLCBzd2lzc2VwaC5TRUZMR19TUEVFRCk7XG5cbiAgICAgICAgaWYgKGFzdGVyb2lkRGF0YSAmJiBhc3Rlcm9pZERhdGEubG9uZ2l0dWRlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBjb25zdCBhc3Rlcm9pZEluZm8gPSBnZXREZWdyZWVJbmZvKGFzdGVyb2lkRGF0YS5sb25naXR1ZGUpO1xuXG4gICAgICAgICAgYXN0ZXJvaWRzW2tleV0gPSB7XG4gICAgICAgICAgICBkZWdyZWU6IGFzdGVyb2lkRGF0YS5sb25naXR1ZGUsXG4gICAgICAgICAgICBzaWduOiBhc3Rlcm9pZEluZm8uc2lnbixcbiAgICAgICAgICAgIGRlZ3JlZUluU2lnbjogYXN0ZXJvaWRJbmZvLmRlZ3JlZUluU2lnbixcbiAgICAgICAgICAgIG1pbnV0ZXM6IGFzdGVyb2lkSW5mby5taW51dGVzLFxuICAgICAgICAgICAgbmFtZTogYXN0ZXJvaWROYW1lc1trZXkgYXMga2V5b2YgdHlwZW9mIGFzdGVyb2lkTmFtZXNdLFxuICAgICAgICAgIH07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29uc29sZS53YXJuKGBGYWlsZWQgdG8gY2FsY3VsYXRlIGFzdGVyb2lkOiAke2tleX1gKTtcbiAgICAgICAgICAvLyBTZXQgZGVmYXVsdC9wbGFjZWhvbGRlciBkYXRhIGZvciBtaXNzaW5nIGFzdGVyb2lkc1xuICAgICAgICAgIGFzdGVyb2lkc1trZXldID0ge1xuICAgICAgICAgICAgZGVncmVlOiAwLFxuICAgICAgICAgICAgc2lnbjogJ1Vua25vd24nLFxuICAgICAgICAgICAgZGVncmVlSW5TaWduOiAwLFxuICAgICAgICAgICAgbWludXRlczogMCxcbiAgICAgICAgICAgIG5hbWU6IGFzdGVyb2lkTmFtZXNba2V5IGFzIGtleW9mIHR5cGVvZiBhc3Rlcm9pZE5hbWVzXSxcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKGBFcnJvciBjYWxjdWxhdGluZyBhc3Rlcm9pZCAke2tleX06YCwgZXJyb3IpO1xuICAgICAgICAvLyBDb250aW51ZSB3aXRoIG5leHQgYXN0ZXJvaWQgb24gZXJyb3JcbiAgICAgICAgYXN0ZXJvaWRzW2tleV0gPSB7XG4gICAgICAgICAgZGVncmVlOiAwLFxuICAgICAgICAgIHNpZ246ICdVbmtub3duJyxcbiAgICAgICAgICBkZWdyZWVJblNpZ246IDAsXG4gICAgICAgICAgbWludXRlczogMCxcbiAgICAgICAgICBuYW1lOiBhc3Rlcm9pZE5hbWVzW2tleSBhcyBrZXlvZiB0eXBlb2YgYXN0ZXJvaWROYW1lc10sXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGFzdGVyb2lkcztcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBjYWxjdWxhdGluZyBhc3Rlcm9pZHM6JywgZXJyb3IpO1xuICAgIHJldHVybiBudWxsO1xuICB9XG59O1xuXG5jb25zdCBjYWxjdWxhdGVIb3VzZXNXaXRoU3dpc3NlcGggPSBhc3luYyAoXG4gIGJpcnRoRGF0ZVRpbWU6IERhdGUsXG4gIGxhdGl0dWRlOiBudW1iZXIsXG4gIGxvbmdpdHVkZTogbnVtYmVyLFxuKTogUHJvbWlzZTx7XG4gIGhvdXNlczogSG91c2VEYXRhW107XG4gIGFzY2VuZGFudDogQW5nbGVEYXRhO1xuICBtaWRoZWF2ZW46IEFuZ2xlRGF0YTtcbiAgcGxhbmV0SG91c2VzOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICB2ZXJ0ZXg/OiBBbmdsZURhdGE7XG4gIGp1bGlhbkRheTogbnVtYmVyO1xufSB8IG51bGw+ID0+IHtcbiAgaWYgKCFzd2lzc2VwaCkge1xuICAgIGNvbnNvbGUud2FybignU3dpc3MgRXBoZW1lcmlzIG5vdCBhdmFpbGFibGUsIHNraXBwaW5nIGhvdXNlIGNhbGN1bGF0aW9ucycpO1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgdHJ5IHtcbiAgICAvLyBTZXQgZXBoZW1lcmlzIHBhdGggZXhwbGljaXRseVxuICAgIGNvbnN0IGVwaGVQYXRoID1cbiAgICAgIGVwaGVtZXJpc1BhdGggfHxcbiAgICAgIHByb2Nlc3MuZW52LlNFX0VQSEVfUEFUSCB8fFxuICAgICAgcHJvY2Vzcy5lbnYuRVBIRU1FUklTX1BBVEggfHxcbiAgICAgICcvb3B0L25vZGVqcy9ub2RlX21vZHVsZXMvc3dpc3NlcGgvZXBoZSc7XG4gICAgc3dpc3NlcGguc3dlX3NldF9lcGhlX3BhdGgoZXBoZVBhdGgpO1xuICAgIGNvbnNvbGUuaW5mbygnU2V0dGluZyBlcGhlbWVyaXMgcGF0aCBmb3IgaG91c2UgY2FsY3VsYXRpb25zOicsIGVwaGVQYXRoKTtcblxuICAgIC8vIENhbGN1bGF0ZSBKdWxpYW4gRGF5XG4gICAgY29uc3QgeWVhciA9IGJpcnRoRGF0ZVRpbWUuZ2V0VVRDRnVsbFllYXIoKTtcbiAgICBjb25zdCBtb250aCA9IGJpcnRoRGF0ZVRpbWUuZ2V0VVRDTW9udGgoKSArIDE7XG4gICAgY29uc3QgZGF5ID0gYmlydGhEYXRlVGltZS5nZXRVVENEYXRlKCk7XG4gICAgY29uc3QgaG91ciA9XG4gICAgICBiaXJ0aERhdGVUaW1lLmdldFVUQ0hvdXJzKCkgK1xuICAgICAgYmlydGhEYXRlVGltZS5nZXRVVENNaW51dGVzKCkgLyA2MCArXG4gICAgICBiaXJ0aERhdGVUaW1lLmdldFVUQ1NlY29uZHMoKSAvIDM2MDA7XG5cbiAgICBjb25zdCBqdWxpYW5EYXkgPSBzd2lzc2VwaC5zd2VfanVsZGF5KHllYXIsIG1vbnRoLCBkYXksIGhvdXIsIHN3aXNzZXBoLlNFX0dSRUdfQ0FMKTtcblxuICAgIC8vIENhbGN1bGF0ZSBob3VzZXMgdXNpbmcgUGxhY2lkdXMgc3lzdGVtXG4gICAgY29uc3QgaG91c2VEYXRhID0gc3dpc3NlcGguc3dlX2hvdXNlcyhcbiAgICAgIGp1bGlhbkRheSxcbiAgICAgIGxhdGl0dWRlLFxuICAgICAgbG9uZ2l0dWRlLFxuICAgICAgJ1AnLCAvLyBQbGFjaWR1cyBob3VzZSBzeXN0ZW1cbiAgICApO1xuXG4gICAgaWYgKCFob3VzZURhdGEgfHwgIWhvdXNlRGF0YS5ob3VzZSB8fCAhaG91c2VEYXRhLmFzY2VuZGFudCB8fCAhaG91c2VEYXRhLm1jKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZhaWxlZCB0byBjYWxjdWxhdGUgaG91c2VzJyk7XG4gICAgfVxuXG4gICAgLy8gUHJvY2VzcyBob3VzZSBjdXNwc1xuICAgIGNvbnN0IGhvdXNlczogSG91c2VEYXRhW10gPSBbXTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IDEyOyBpKyspIHtcbiAgICAgIGNvbnN0IGN1c3BEZWdyZWUgPSBob3VzZURhdGEuaG91c2VbaV07XG4gICAgICBjb25zdCBkZWdyZWVJbmZvID0gZ2V0RGVncmVlSW5mbyhjdXNwRGVncmVlKTtcbiAgICAgIGhvdXNlcy5wdXNoKHtcbiAgICAgICAgaG91c2VOdW1iZXI6IGkgKyAxLFxuICAgICAgICBjdXNwRGVncmVlLFxuICAgICAgICBjdXNwU2lnbjogZGVncmVlSW5mby5zaWduLFxuICAgICAgICBjdXNwRGVncmVlSW5TaWduOiBkZWdyZWVJbmZvLmRlZ3JlZUluU2lnbixcbiAgICAgICAgY3VzcE1pbnV0ZXM6IGRlZ3JlZUluZm8ubWludXRlcyxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIFByb2Nlc3MgQXNjZW5kYW50XG4gICAgY29uc3QgYXNjSW5mbyA9IGdldERlZ3JlZUluZm8oaG91c2VEYXRhLmFzY2VuZGFudCk7XG4gICAgY29uc3QgYXNjZW5kYW50OiBBbmdsZURhdGEgPSB7XG4gICAgICBkZWdyZWU6IGhvdXNlRGF0YS5hc2NlbmRhbnQsXG4gICAgICBzaWduOiBhc2NJbmZvLnNpZ24sXG4gICAgICBkZWdyZWVJblNpZ246IGFzY0luZm8uZGVncmVlSW5TaWduLFxuICAgICAgbWludXRlczogYXNjSW5mby5taW51dGVzLFxuICAgIH07XG5cbiAgICAvLyBQcm9jZXNzIE1pZGhlYXZlblxuICAgIGNvbnN0IG1jSW5mbyA9IGdldERlZ3JlZUluZm8oaG91c2VEYXRhLm1jKTtcbiAgICBjb25zdCBtaWRoZWF2ZW46IEFuZ2xlRGF0YSA9IHtcbiAgICAgIGRlZ3JlZTogaG91c2VEYXRhLm1jLFxuICAgICAgc2lnbjogbWNJbmZvLnNpZ24sXG4gICAgICBkZWdyZWVJblNpZ246IG1jSW5mby5kZWdyZWVJblNpZ24sXG4gICAgICBtaW51dGVzOiBtY0luZm8ubWludXRlcyxcbiAgICB9O1xuXG4gICAgLy8gRXh0cmFjdCBWZXJ0ZXggaWYgYXZhaWxhYmxlXG4gICAgbGV0IHZlcnRleDogQW5nbGVEYXRhIHwgdW5kZWZpbmVkO1xuICAgIGlmIChob3VzZURhdGEudmVydGV4ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGNvbnN0IHZlcnRleEluZm8gPSBnZXREZWdyZWVJbmZvKGhvdXNlRGF0YS52ZXJ0ZXgpO1xuICAgICAgdmVydGV4ID0ge1xuICAgICAgICBkZWdyZWU6IGhvdXNlRGF0YS52ZXJ0ZXgsXG4gICAgICAgIHNpZ246IHZlcnRleEluZm8uc2lnbixcbiAgICAgICAgZGVncmVlSW5TaWduOiB2ZXJ0ZXhJbmZvLmRlZ3JlZUluU2lnbixcbiAgICAgICAgbWludXRlczogdmVydGV4SW5mby5taW51dGVzLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBDYWxjdWxhdGUgcGxhbmV0IHBvc2l0aW9ucyB1c2luZyBTd2lzcyBFcGhlbWVyaXMgZm9yIGFjY3VyYWN5XG4gICAgY29uc3QgcGxhbmV0SG91c2VzOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+ID0ge307XG4gICAgY29uc3QgcGxhbmV0SWRzID0gW1xuICAgICAgc3dpc3NlcGguU0VfU1VOLFxuICAgICAgc3dpc3NlcGguU0VfTU9PTixcbiAgICAgIHN3aXNzZXBoLlNFX01FUkNVUlksXG4gICAgICBzd2lzc2VwaC5TRV9WRU5VUyxcbiAgICAgIHN3aXNzZXBoLlNFX01BUlMsXG4gICAgICBzd2lzc2VwaC5TRV9KVVBJVEVSLFxuICAgICAgc3dpc3NlcGguU0VfU0FUVVJOLFxuICAgICAgc3dpc3NlcGguU0VfVVJBTlVTLFxuICAgICAgc3dpc3NlcGguU0VfTkVQVFVORSxcbiAgICAgIHN3aXNzZXBoLlNFX1BMVVRPLFxuICAgIF07XG4gICAgY29uc3QgcGxhbmV0TmFtZXMgPSBbXG4gICAgICAnc3VuJyxcbiAgICAgICdtb29uJyxcbiAgICAgICdtZXJjdXJ5JyxcbiAgICAgICd2ZW51cycsXG4gICAgICAnbWFycycsXG4gICAgICAnanVwaXRlcicsXG4gICAgICAnc2F0dXJuJyxcbiAgICAgICd1cmFudXMnLFxuICAgICAgJ25lcHR1bmUnLFxuICAgICAgJ3BsdXRvJyxcbiAgICBdO1xuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBwbGFuZXRJZHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IHBsYW5ldERhdGEgPSBzd2lzc2VwaC5zd2VfY2FsY191dChqdWxpYW5EYXksIHBsYW5ldElkc1tpXSwgc3dpc3NlcGguU0VGTEdfU1BFRUQpO1xuICAgICAgaWYgKHBsYW5ldERhdGEgJiYgcGxhbmV0RGF0YS5sb25naXR1ZGUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBjb25zdCBwbGFuZXRMb25naXR1ZGUgPSBwbGFuZXREYXRhLmxvbmdpdHVkZTtcbiAgICAgICAgLy8gRGV0ZXJtaW5lIHdoaWNoIGhvdXNlIHRoZSBwbGFuZXQgaXMgaW5cbiAgICAgICAgZm9yIChsZXQgaCA9IDA7IGggPCAxMjsgaCsrKSB7XG4gICAgICAgICAgY29uc3QgY3VycmVudEN1c3AgPSBob3VzZXNbaF0uY3VzcERlZ3JlZTtcbiAgICAgICAgICBjb25zdCBuZXh0Q3VzcCA9IGhvdXNlc1soaCArIDEpICUgMTJdLmN1c3BEZWdyZWU7XG5cbiAgICAgICAgICAvLyBIYW5kbGUgY3VzcCB3cmFwLWFyb3VuZCBhdCAzNjAgZGVncmVlc1xuICAgICAgICAgIGlmIChjdXJyZW50Q3VzcCA+IG5leHRDdXNwKSB7XG4gICAgICAgICAgICAvLyBIb3VzZSBzcGFucyAwIGRlZ3JlZXNcbiAgICAgICAgICAgIGlmIChwbGFuZXRMb25naXR1ZGUgPj0gY3VycmVudEN1c3AgfHwgcGxhbmV0TG9uZ2l0dWRlIDwgbmV4dEN1c3ApIHtcbiAgICAgICAgICAgICAgcGxhbmV0SG91c2VzW3BsYW5ldE5hbWVzW2ldXSA9IGggKyAxO1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKHBsYW5ldExvbmdpdHVkZSA+PSBjdXJyZW50Q3VzcCAmJiBwbGFuZXRMb25naXR1ZGUgPCBuZXh0Q3VzcCkge1xuICAgICAgICAgICAgICBwbGFuZXRIb3VzZXNbcGxhbmV0TmFtZXNbaV1dID0gaCArIDE7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIENsb3NlIFN3aXNzIEVwaGVtZXJpc1xuICAgIHN3aXNzZXBoLnN3ZV9jbG9zZSgpO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGhvdXNlcyxcbiAgICAgIGFzY2VuZGFudCxcbiAgICAgIG1pZGhlYXZlbixcbiAgICAgIHBsYW5ldEhvdXNlcyxcbiAgICAgIHZlcnRleCxcbiAgICAgIGp1bGlhbkRheSxcbiAgICB9O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGNhbGN1bGF0aW5nIGhvdXNlcyB3aXRoIFN3aXNzIEVwaGVtZXJpczonLCBlcnJvcik7XG4gICAgLy8gQ2xvc2UgU3dpc3MgRXBoZW1lcmlzIG9uIGVycm9yXG4gICAgaWYgKHN3aXNzZXBoICYmIHN3aXNzZXBoLnN3ZV9jbG9zZSkge1xuICAgICAgc3dpc3NlcGguc3dlX2Nsb3NlKCk7XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xuICB9XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIGNhY2hlIGtleSBmb3IgaG91c2UgY2FsY3VsYXRpb25zLlxuICpcbiAqIE5vdGU6IGVwaGVtZXJpc1ZlcnNpb24gaW5jbHVkZXMgJy10ei1maXgnIHN1ZmZpeCB0byBpbnZhbGlkYXRlIGFsbCBjYWNoZWRcbiAqIGVudHJpZXMgY2FsY3VsYXRlZCB3aXRoIHRoZSBpbmNvcnJlY3QgdGltZXpvbmUgb2Zmc2V0LiBUaGlzIGVuc3VyZXMgdXNlcnNcbiAqIGdldCBhY2N1cmF0ZSByZWNhbGN1bGF0aW9ucyB3aXRoIHRoZSBmaXhlZCB0aW1lem9uZSBsb2dpYy5cbiAqL1xuY29uc3QgZ2VuZXJhdGVDYWNoZUtleSA9IChcbiAgYmlydGhEYXRlOiBzdHJpbmcsXG4gIGJpcnRoVGltZTogc3RyaW5nLFxuICBsYXRpdHVkZTogbnVtYmVyLFxuICBsb25naXR1ZGU6IG51bWJlcixcbik6IHN0cmluZyA9PiB7XG4gIC8vIE9ubHkgaW5jbHVkZSBpbnB1dHMgdGhhdCBhZmZlY3QgY2FsY3VsYXRpb25zXG4gIGNvbnN0IGNhY2hlRGF0YSA9IHtcbiAgICBiaXJ0aERhdGVUaW1lOiBgJHtiaXJ0aERhdGV9VCR7YmlydGhUaW1lfTowMFpgLCAvLyBVVEMgSVNPIGZvcm1hdFxuICAgIGxhdDogbGF0aXR1ZGUsXG4gICAgbG9uOiBsb25naXR1ZGUsXG4gICAgaG91c2VTeXN0ZW06ICdwbGFjaWR1cycsXG4gICAgem9kaWFjVHlwZTogJ3Ryb3BpY2FsJyxcbiAgICBlcGhlbWVyaXNWZXJzaW9uOiAnMi4xMC4wMy10ei1maXgnLCAvLyBPbmx5IGNoYW5nZSB3aGVuIGVwaGVtZXJpcyBkYXRhIGNoYW5nZXNcbiAgfTtcblxuICAvLyBVc2Ugc3RhYmxlIEpTT04gc3RyaW5naWZpY2F0aW9uIChrZXlzIGluIGFscGhhYmV0aWNhbCBvcmRlcilcbiAgY29uc3Qgc29ydGVkS2V5cyA9IE9iamVjdC5rZXlzKGNhY2hlRGF0YSkuc29ydCgpO1xuICBjb25zdCBzdGFibGVKc29uID0gc29ydGVkS2V5c1xuICAgIC5tYXAoKGtleSkgPT4gYFwiJHtrZXl9XCI6JHtKU09OLnN0cmluZ2lmeShjYWNoZURhdGFba2V5IGFzIGtleW9mIHR5cGVvZiBjYWNoZURhdGFdKX1gKVxuICAgIC5qb2luKCcsJyk7XG4gIGNvbnN0IGlucHV0ID0gYHske3N0YWJsZUpzb259fWA7XG5cbiAgcmV0dXJuIGNyeXB0by5jcmVhdGVIYXNoKCdzaGEyNTYnKS51cGRhdGUoaW5wdXQpLmRpZ2VzdCgnaGV4Jyk7XG59O1xuXG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuY29uc3QgZ2V0Q2FjaGVkSG91c2VEYXRhID0gYXN5bmMgKGNhY2hlS2V5OiBzdHJpbmcpOiBQcm9taXNlPGFueSB8IG51bGw+ID0+IHtcbiAgY29uc3QgTkFUQUxfQ0hBUlRfVEFCTEVfTkFNRSA9IHByb2Nlc3MuZW52Lk5BVEFMX0NIQVJUX1RBQkxFX05BTUUhO1xuXG4gIHRyeSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQoXG4gICAgICBuZXcgR2V0Q29tbWFuZCh7XG4gICAgICAgIFRhYmxlTmFtZTogTkFUQUxfQ0hBUlRfVEFCTEVfTkFNRSxcbiAgICAgICAgS2V5OiB7XG4gICAgICAgICAgdXNlcklkOiBgQ0FDSEUjJHtjYWNoZUtleX1gLFxuICAgICAgICAgIGNoYXJ0VHlwZTogJ2hvdXNlX2NhY2hlJyxcbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICBpZiAocmVzdWx0Lkl0ZW0pIHtcbiAgICAgIGNvbnNvbGUuaW5mbygnQ2FjaGUgaGl0IGZvciBob3VzZSBjYWxjdWxhdGlvbnMnKTtcbiAgICAgIHJldHVybiByZXN1bHQuSXRlbS5ob3VzZURhdGE7XG4gICAgfVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHJldHJpZXZpbmcgY2FjaGVkIGRhdGE6JywgZXJyb3IpO1xuICB9XG5cbiAgcmV0dXJuIG51bGw7XG59O1xuXG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuY29uc3Qgc2F2ZUNhY2hlZEhvdXNlRGF0YSA9IGFzeW5jIChjYWNoZUtleTogc3RyaW5nLCBob3VzZURhdGE6IGFueSk6IFByb21pc2U8dm9pZD4gPT4ge1xuICBjb25zdCBOQVRBTF9DSEFSVF9UQUJMRV9OQU1FID0gcHJvY2Vzcy5lbnYuTkFUQUxfQ0hBUlRfVEFCTEVfTkFNRSE7XG5cbiAgdHJ5IHtcbiAgICBjb25zdCB0dGwgPSBNYXRoLmZsb29yKERhdGUubm93KCkgLyAxMDAwKSArIDMwICogMjQgKiA2MCAqIDYwOyAvLyAzMCBkYXlzIFRUTFxuXG4gICAgYXdhaXQgZG9jQ2xpZW50LnNlbmQoXG4gICAgICBuZXcgUHV0Q29tbWFuZCh7XG4gICAgICAgIFRhYmxlTmFtZTogTkFUQUxfQ0hBUlRfVEFCTEVfTkFNRSxcbiAgICAgICAgSXRlbToge1xuICAgICAgICAgIHVzZXJJZDogYENBQ0hFIyR7Y2FjaGVLZXl9YCxcbiAgICAgICAgICBjaGFydFR5cGU6ICdob3VzZV9jYWNoZScsXG4gICAgICAgICAgaG91c2VEYXRhLFxuICAgICAgICAgIHR0bCxcbiAgICAgICAgICBjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgICk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3Igc2F2aW5nIGNhY2hlZCBkYXRhOicsIGVycm9yKTtcbiAgfVxufTtcblxuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbmV4cG9ydCBjb25zdCBoYW5kbGVyID0gYXN5bmMgKGV2ZW50OiBhbnkpOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgY29uc3QgTkFUQUxfQ0hBUlRfVEFCTEVfTkFNRSA9IHByb2Nlc3MuZW52Lk5BVEFMX0NIQVJUX1RBQkxFX05BTUUhO1xuICBjb25zb2xlLmluZm8oJ1JlY2VpdmVkIGV2ZW50OicsIEpTT04uc3RyaW5naWZ5KGV2ZW50LCBudWxsLCAyKSk7XG5cbiAgY29uc3QgdmFsaWRhdGVkRXZlbnQgPSB2YWxpZGF0ZUV2ZW50KGV2ZW50KTtcbiAgY29uc3QgeyB1c2VySWQsIGJpcnRoRGF0ZSwgbGF0aXR1ZGUsIGxvbmdpdHVkZSwgaWFuYVRpbWVab25lIH0gPSB2YWxpZGF0ZWRFdmVudDtcblxuICAvLyBCaXJ0aCB0aW1lIGlzIG5vdyByZXF1aXJlZCBwZXIgS0FOLTdcbiAgaWYgKCF2YWxpZGF0ZWRFdmVudC5iaXJ0aFRpbWUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0JpcnRoIHRpbWUgaXMgcmVxdWlyZWQgZm9yIGhvdXNlIGNhbGN1bGF0aW9ucycpO1xuICB9XG5cbiAgY29uc3QgYmlydGhUaW1lID0gdmFsaWRhdGVkRXZlbnQuYmlydGhUaW1lO1xuICBjb25zdCBpc1RpbWVFc3RpbWF0ZWQgPSBmYWxzZTsgLy8gU2luY2UgYmlydGggdGltZSBpcyBub3cgcmVxdWlyZWRcblxuICAvKipcbiAgICogQ2FsY3VsYXRlIHRpbWV6b25lIG9mZnNldCB1c2luZyBMdXhvbiBmb3IgYWNjdXJhdGUgaGlzdG9yaWNhbCB0aW1lem9uZSBoYW5kbGluZy5cbiAgICpcbiAgICogUHJldmlvdXMgaW1wbGVtZW50YXRpb24gdXNlZCBEYXRlLnRvTG9jYWxlU3RyaW5nKCkgd2hpY2ggd2FzIGluY29ycmVjdCBiZWNhdXNlOlxuICAgKiAxLiBJdCBjb252ZXJ0ZWQgdG8gbG9jYWxlIHN0cmluZyAobG9zaW5nIHRpbWV6b25lIGluZm8pXG4gICAqIDIuIENyZWF0ZWQgbmV3IERhdGUgaW4gc3lzdGVtIHRpbWV6b25lIChub3QgYmlydGggbG9jYXRpb24gdGltZXpvbmUpXG4gICAqIDMuIFJldHVybmVkIExhbWJkYSBleGVjdXRpb24gZW52aXJvbm1lbnQgb2Zmc2V0IGluc3RlYWQgb2YgYmlydGggbG9jYXRpb24gb2Zmc2V0XG4gICAqXG4gICAqIEx1eG9uIGNvcnJlY3RseTpcbiAgICogLSBQYXJzZXMgZGF0ZS90aW1lIGluIHRoZSBzcGVjaWZpZWQgSUFOQSB0aW1lem9uZVxuICAgKiAtIENhbGN1bGF0ZXMgYWNjdXJhdGUgaGlzdG9yaWNhbCBvZmZzZXRzIChpbmNsdWRpbmcgRFNUKVxuICAgKiAtIFJldHVybnMgdGhlIG9mZnNldCBmb3IgdGhlIGJpcnRoIGxvY2F0aW9uIGFuZCBkYXRlXG4gICAqL1xuICBjb25zdCBiaXJ0aERhdGVUaW1lU3RyID0gYCR7YmlydGhEYXRlfVQke2JpcnRoVGltZX06MDBgO1xuICBjb25zdCBiaXJ0aERhdGVUaW1lTG9jYWwgPSBEYXRlVGltZS5mcm9tSVNPKGJpcnRoRGF0ZVRpbWVTdHIsIHsgem9uZTogaWFuYVRpbWVab25lIH0pO1xuXG4gIC8vIENhbGN1bGF0ZSBhY2N1cmF0ZSB0aW1lem9uZSBvZmZzZXQgaW4gaG91cnNcbiAgY29uc3QgdGltZXpvbmVPZmZzZXRJbkhvdXJzID0gYmlydGhEYXRlVGltZUxvY2FsLm9mZnNldCAvIDYwO1xuXG4gIC8vIExvZyB0aW1lem9uZSBjYWxjdWxhdGlvbiBkZXRhaWxzIGZvciBkZWJ1Z2dpbmdcbiAgY29uc29sZS5pbmZvKCdUaW1lem9uZSBjYWxjdWxhdGlvbjonLCB7XG4gICAgYmlydGhEYXRlVGltZVN0cixcbiAgICBpYW5hVGltZVpvbmUsXG4gICAgbG9jYWxEYXRlVGltZTogYmlydGhEYXRlVGltZUxvY2FsLnRvU3RyaW5nKCksXG4gICAgb2Zmc2V0OiBiaXJ0aERhdGVUaW1lTG9jYWwub2Zmc2V0LFxuICAgIG9mZnNldEluSG91cnM6IHRpbWV6b25lT2Zmc2V0SW5Ib3VycyxcbiAgICB1dGNEYXRlVGltZTogYmlydGhEYXRlVGltZUxvY2FsLnRvVVRDKCkudG9JU08oKSxcbiAgfSk7XG5cbiAgLy8gQ29udmVydCB0byBKYXZhU2NyaXB0IERhdGUgZm9yIGVwaGVtZXJpcyBsaWJyYXJ5IChpbiBVVEMpXG4gIGNvbnN0IGJpcnRoRGF0ZVRpbWUgPSBiaXJ0aERhdGVUaW1lTG9jYWwudG9KU0RhdGUoKTtcblxuICB0cnkge1xuICAgIC8vIENhbGN1bGF0ZSBwbGFuZXRhcnkgcG9zaXRpb25zIHVzaW5nIGV4aXN0aW5nIGVwaGVtZXJpcyBsaWJyYXJ5XG4gICAgY29uc3QgY2hhcnREYXRhID0gZ2V0QWxsUGxhbmV0cyhiaXJ0aERhdGVUaW1lLCBsb25naXR1ZGUsIGxhdGl0dWRlLCB0aW1lem9uZU9mZnNldEluSG91cnMpO1xuXG4gICAgLy8gRXh0cmFjdCBwbGFuZXRhcnkgcG9zaXRpb25zIGZyb20gdGhlIG9ic2VydmVkIG5hbWVzcGFjZVxuICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgY29uc3QgcGxhbmV0czogUmVjb3JkPHN0cmluZywgYW55PiA9IHt9O1xuICAgIGlmIChjaGFydERhdGEub2JzZXJ2ZWQpIHtcbiAgICAgIE9iamVjdC5rZXlzKGNoYXJ0RGF0YS5vYnNlcnZlZCkuZm9yRWFjaCgocGxhbmV0TmFtZSkgPT4ge1xuICAgICAgICBjb25zdCBwbGFuZXREYXRhID0gY2hhcnREYXRhLm9ic2VydmVkW3BsYW5ldE5hbWVdO1xuICAgICAgICBpZiAocGxhbmV0RGF0YSAmJiBwbGFuZXROYW1lICE9PSAnc2lyaXVzJykge1xuICAgICAgICAgIGNvbnN0IGxvbmdpdHVkZSA9IHBsYW5ldERhdGEuYXBwYXJlbnRMb25naXR1ZGVEZCB8fCAwO1xuICAgICAgICAgIC8vIENhbGN1bGF0ZSB6b2RpYWMgc2lnbiBpbmZvcm1hdGlvblxuICAgICAgICAgIGNvbnN0IG5vcm1hbGl6ZWRMb25naXR1ZGUgPSAoKGxvbmdpdHVkZSAlIDM2MCkgKyAzNjApICUgMzYwO1xuICAgICAgICAgIGNvbnN0IHNpZ25JbmRleCA9IE1hdGguZmxvb3Iobm9ybWFsaXplZExvbmdpdHVkZSAvIDMwKTtcbiAgICAgICAgICBjb25zdCBzaWduID0gWk9ESUFDX1NJR05TW3NpZ25JbmRleF07XG4gICAgICAgICAgY29uc3QgZGVncmVlSW5TaWduID0gbm9ybWFsaXplZExvbmdpdHVkZSAtIHNpZ25JbmRleCAqIDMwO1xuICAgICAgICAgIGNvbnN0IHdob2xlRGVncmVlcyA9IE1hdGguZmxvb3IoZGVncmVlSW5TaWduKTtcbiAgICAgICAgICBjb25zdCBtaW51dGVzID0gTWF0aC5yb3VuZCgoZGVncmVlSW5TaWduIC0gd2hvbGVEZWdyZWVzKSAqIDYwKTtcblxuICAgICAgICAgIHBsYW5ldHNbcGxhbmV0TmFtZV0gPSB7XG4gICAgICAgICAgICBsb25naXR1ZGU6IGxvbmdpdHVkZSxcbiAgICAgICAgICAgIGxvbmdpdHVkZURtczogYCR7d2hvbGVEZWdyZWVzLnRvU3RyaW5nKCkucGFkU3RhcnQoMiwgJzAnKX3CsCR7bWludXRlcy50b1N0cmluZygpLnBhZFN0YXJ0KDIsICcwJyl9JyAke3NpZ259YCxcbiAgICAgICAgICAgIGRpc3RhbmNlS206IHBsYW5ldERhdGEuZ2VvY2VudHJpY0Rpc3RhbmNlS20gfHwgMCxcbiAgICAgICAgICAgIG5hbWU6IHBsYW5ldERhdGEubmFtZSB8fCBwbGFuZXROYW1lLFxuICAgICAgICAgICAgc2lnbjogc2lnbixcbiAgICAgICAgICAgIGRlZ3JlZUluU2lnbjogd2hvbGVEZWdyZWVzLFxuICAgICAgICAgICAgbWludXRlczogbWludXRlcyxcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBDaGVjayBjYWNoZSBmb3IgaG91c2UgY2FsY3VsYXRpb25zXG4gICAgY29uc3QgY2FjaGVLZXkgPSBnZW5lcmF0ZUNhY2hlS2V5KGJpcnRoRGF0ZSwgYmlydGhUaW1lLCBsYXRpdHVkZSwgbG9uZ2l0dWRlKTtcbiAgICBsZXQgaG91c2VEYXRhID0gYXdhaXQgZ2V0Q2FjaGVkSG91c2VEYXRhKGNhY2hlS2V5KTtcblxuICAgIGlmICghaG91c2VEYXRhKSB7XG4gICAgICAvLyBDYWxjdWxhdGUgaG91c2VzIHVzaW5nIFN3aXNzIEVwaGVtZXJpc1xuICAgICAgaG91c2VEYXRhID0gYXdhaXQgY2FsY3VsYXRlSG91c2VzV2l0aFN3aXNzZXBoKGJpcnRoRGF0ZVRpbWUsIGxhdGl0dWRlLCBsb25naXR1ZGUpO1xuXG4gICAgICBpZiAoaG91c2VEYXRhKSB7XG4gICAgICAgIC8vIFNhdmUgdG8gY2FjaGVcbiAgICAgICAgYXdhaXQgc2F2ZUNhY2hlZEhvdXNlRGF0YShjYWNoZUtleSwgaG91c2VEYXRhKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBQcmVwYXJlIHRoZSBpdGVtIHRvIHN0b3JlXG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICBjb25zdCBpdGVtOiBhbnkgPSB7XG4gICAgICB1c2VySWQsXG4gICAgICBjaGFydFR5cGU6ICduYXRhbCcsXG4gICAgICBjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgIGlzVGltZUVzdGltYXRlZCxcbiAgICAgIGJpcnRoSW5mbzoge1xuICAgICAgICAuLi52YWxpZGF0ZWRFdmVudCxcbiAgICAgICAgYmlydGhUaW1lLFxuICAgICAgfSxcbiAgICAgIHBsYW5ldHMsXG4gICAgICBtZXRhZGF0YToge1xuICAgICAgICBjYWxjdWxhdGlvblRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgICBlcGhlbWVyaXNWZXJzaW9uOiAnMi4xMC4wMycsXG4gICAgICAgIHN3ZXRlc3RWZXJzaW9uOiAnMi4xMC4wMycsXG4gICAgICAgIGhvdXNlU3lzdGVtOiAncGxhY2lkdXMnLFxuICAgICAgICB6b2RpYWNUeXBlOiAndHJvcGljYWwnLFxuICAgICAgICBzY2hlbWFWZXJzaW9uOiAnMi4wLjAnLCAvLyBUcmFjayBzY2hlbWEgdmVyc2lvbiBmb3IgbmV3IGNlbGVzdGlhbCBib2RpZXNcbiAgICAgIH0sXG4gICAgfTtcblxuICAgIC8vIEFkZCBob3VzZSBkYXRhIGlmIGF2YWlsYWJsZVxuICAgIGlmIChob3VzZURhdGEpIHtcbiAgICAgIGl0ZW0uaG91c2VzID0ge1xuICAgICAgICBzdGF0dXM6ICdzdWNjZXNzJyxcbiAgICAgICAgZGF0YTogaG91c2VEYXRhLmhvdXNlcyxcbiAgICAgIH07XG4gICAgICBpdGVtLmFzY2VuZGFudCA9IGhvdXNlRGF0YS5hc2NlbmRhbnQ7XG4gICAgICBpdGVtLm1pZGhlYXZlbiA9IGhvdXNlRGF0YS5taWRoZWF2ZW47XG4gICAgICBpdGVtLnBsYW5ldEhvdXNlcyA9IGhvdXNlRGF0YS5wbGFuZXRIb3VzZXM7XG5cbiAgICAgIC8vIENhbGN1bGF0ZSBhbmQgYWRkIGFkZGl0aW9uYWwgYW5ndWxhciBwb2ludHNcbiAgICAgIGNvbnNvbGUuaW5mbygnQ2FsY3VsYXRpbmcgYWRkaXRpb25hbCBhbmd1bGFyIHBvaW50cyAoRGVzY2VuZGFudCwgSUMpJyk7XG4gICAgICBjb25zdCBkZXJpdmVkQW5nbGVzID0gY2FsY3VsYXRlRGVyaXZlZEFuZ2xlcyhob3VzZURhdGEuYXNjZW5kYW50LCBob3VzZURhdGEubWlkaGVhdmVuKTtcblxuICAgICAgLy8gQ2FsY3VsYXRlIFBhcnQgb2YgRm9ydHVuZSAocmVxdWlyZXMgU3VuIGFuZCBNb29uIHBvc2l0aW9ucylcbiAgICAgIGNvbnNvbGUuaW5mbygnQ2FsY3VsYXRpbmcgUGFydCBvZiBGb3J0dW5lJyk7XG4gICAgICBsZXQgcGFydE9mRm9ydHVuZTogQ2VsZXN0aWFsQm9keURhdGEgfCB1bmRlZmluZWQ7XG4gICAgICBpZiAocGxhbmV0cy5zdW4gJiYgcGxhbmV0cy5tb29uKSB7XG4gICAgICAgIHBhcnRPZkZvcnR1bmUgPSBjYWxjdWxhdGVQYXJ0T2ZGb3J0dW5lKFxuICAgICAgICAgIGhvdXNlRGF0YS5hc2NlbmRhbnQuZGVncmVlLFxuICAgICAgICAgIHBsYW5ldHMubW9vbi5sb25naXR1ZGUsXG4gICAgICAgICAgcGxhbmV0cy5zdW4ubG9uZ2l0dWRlLFxuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICAvLyBDYWxjdWxhdGUgbHVuYXIgbm9kZXNcbiAgICAgIGNvbnNvbGUuaW5mbygnQ2FsY3VsYXRpbmcgbHVuYXIgbm9kZXMnKTtcbiAgICAgIGNvbnN0IGx1bmFyTm9kZXMgPSBjYWxjdWxhdGVMdW5hck5vZGVzKGhvdXNlRGF0YS5qdWxpYW5EYXkpO1xuXG4gICAgICAvLyBCdWlsZCBhZGRpdGlvbmFsUG9pbnRzIG9iamVjdFxuICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgIGNvbnN0IGFkZGl0aW9uYWxQb2ludHM6IGFueSA9IHtcbiAgICAgICAgZGVzY2VuZGFudDogZGVyaXZlZEFuZ2xlcy5kZXNjZW5kYW50LFxuICAgICAgICBpbXVtQ29lbGk6IGRlcml2ZWRBbmdsZXMuaW11bUNvZWxpLFxuICAgICAgfTtcblxuICAgICAgaWYgKHBhcnRPZkZvcnR1bmUpIHtcbiAgICAgICAgYWRkaXRpb25hbFBvaW50cy5wYXJ0T2ZGb3J0dW5lID0gcGFydE9mRm9ydHVuZTtcbiAgICAgIH1cblxuICAgICAgaWYgKGhvdXNlRGF0YS52ZXJ0ZXgpIHtcbiAgICAgICAgYWRkaXRpb25hbFBvaW50cy52ZXJ0ZXggPSBob3VzZURhdGEudmVydGV4O1xuICAgICAgfVxuXG4gICAgICBpZiAobHVuYXJOb2Rlcykge1xuICAgICAgICBhZGRpdGlvbmFsUG9pbnRzLm5vcnRoTm9kZSA9IGx1bmFyTm9kZXMubm9ydGhOb2RlO1xuICAgICAgICBhZGRpdGlvbmFsUG9pbnRzLnNvdXRoTm9kZSA9IGx1bmFyTm9kZXMuc291dGhOb2RlO1xuICAgICAgfVxuXG4gICAgICBpdGVtLmFkZGl0aW9uYWxQb2ludHMgPSBhZGRpdGlvbmFsUG9pbnRzO1xuXG4gICAgICAvLyBDYWxjdWxhdGUgYXN0ZXJvaWRzXG4gICAgICBjb25zb2xlLmluZm8oJ0NhbGN1bGF0aW5nIGFzdGVyb2lkcycpO1xuICAgICAgY29uc3QgYXN0ZXJvaWRzID0gY2FsY3VsYXRlQXN0ZXJvaWRzKGhvdXNlRGF0YS5qdWxpYW5EYXkpO1xuICAgICAgaWYgKGFzdGVyb2lkcykge1xuICAgICAgICBpdGVtLmFzdGVyb2lkcyA9IGFzdGVyb2lkcztcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgaXRlbS5ob3VzZXMgPSB7XG4gICAgICAgIHN0YXR1czogJ2ZhaWxlZCcsXG4gICAgICAgIGVycm9yOiAnSG91c2UgY2FsY3VsYXRpb25zIHVuYXZhaWxhYmxlJyxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gU3RvcmUgdGhlIG5hdGFsIGNoYXJ0XG4gICAgYXdhaXQgZG9jQ2xpZW50LnNlbmQoXG4gICAgICBuZXcgUHV0Q29tbWFuZCh7XG4gICAgICAgIFRhYmxlTmFtZTogTkFUQUxfQ0hBUlRfVEFCTEVfTkFNRSxcbiAgICAgICAgSXRlbTogaXRlbSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICBjb25zb2xlLmluZm8oYFN1Y2Nlc3NmdWxseSBnZW5lcmF0ZWQgYW5kIHN0b3JlZCBuYXRhbCBjaGFydCBmb3IgdXNlcklkOiAke3VzZXJJZH1gKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBjYWxjdWxhdGluZyBvciBzdG9yaW5nIG5hdGFsIGNoYXJ0OicsIGVycm9yKTtcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxufTtcbiJdfQ==