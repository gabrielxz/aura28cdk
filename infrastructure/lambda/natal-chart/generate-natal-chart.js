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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGUtbmF0YWwtY2hhcnQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJnZW5lcmF0ZS1uYXRhbC1jaGFydC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLDhEQUEwRDtBQUMxRCx3REFBdUY7QUFDdkYseUNBQTBDO0FBQzFDLCtDQUFpQztBQUVqQyxNQUFNLFlBQVksR0FBRyxJQUFJLGdDQUFjLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDNUMsTUFBTSxTQUFTLEdBQUcscUNBQXNCLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO0FBRTVELHdDQUF3QztBQUN4Qyw4REFBOEQ7QUFDOUQsSUFBSSxRQUFhLENBQUM7QUFDbEIsSUFBSSxhQUFpQyxDQUFDO0FBRXRDLHFEQUFxRDtBQUNyRCxNQUFNLFlBQVksR0FBRyxHQUFHLEVBQUU7SUFDeEIsOENBQThDO0lBQzlDLE1BQU0sSUFBSSxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUM3QixNQUFNLEVBQUUsR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7SUFFekIsMkRBQTJEO0lBQzNELElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxZQUFZLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLEVBQUUsQ0FBQztRQUMzRCxNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDOUQsSUFBSSxFQUFFLENBQUMsVUFBVSxDQUFDLGNBQWMsQ0FBQyxFQUFFLENBQUM7WUFDbEMsSUFBSSxDQUFDO2dCQUNILFFBQVEsR0FBRyxPQUFPLENBQUMsY0FBYyxDQUFDLENBQUM7Z0JBQ25DLGFBQWEsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQztnQkFFekMsT0FBTyxDQUFDLElBQUksQ0FBQyw0Q0FBNEMsRUFBRTtvQkFDekQsSUFBSSxF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QUFnQixDQUFDLFNBQVMsR0FBRyxVQUFVLENBQUMsU0FBUyxDQUFDO1lBQ3BELENBQUM7WUFFRCxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsZ0JBQWdCLENBQUM7WUFFekMsc0JBQXNCO1lBQ3RCLE9BQU8sQ0FBQyxJQUFJLENBQUMsdUJBQXVCLENBQUMsQ0FBQztZQUN0QyxNQUFNLFNBQVMsR0FBRyxrQkFBa0IsQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDMUQsSUFBSSxTQUFTLEVBQUUsQ0FBQztnQkFDZCxJQUFJLENBQUMsU0FBUyxHQUFHLFNBQVMsQ0FBQztZQUM3QixDQUFDO1FBQ0gsQ0FBQzthQUFNLENBQUM7WUFDTixJQUFJLENBQUMsTUFBTSxHQUFHO2dCQUNaLE1BQU0sRUFBRSxRQUFRO2dCQUNoQixLQUFLLEVBQUUsZ0NBQWdDO2FBQ3hDLENBQUM7UUFDSixDQUFDO1FBRUQsd0JBQXdCO1FBQ3hCLE1BQU0sU0FBUyxDQUFDLElBQUksQ0FDbEIsSUFBSSx5QkFBVSxDQUFDO1lBQ2IsU0FBUyxFQUFFLHNCQUFzQjtZQUNqQyxJQUFJLEVBQUUsSUFBSTtTQUNYLENBQUMsQ0FDSCxDQUFDO1FBRUYsT0FBTyxDQUFDLElBQUksQ0FBQyw2REFBNkQsTUFBTSxFQUFFLENBQUMsQ0FBQztJQUN0RixDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsMkNBQTJDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDbEUsTUFBTSxLQUFLLENBQUM7SUFDZCxDQUFDO0FBQ0gsQ0FBQyxDQUFDO0FBM0tXLFFBQUEsT0FBTyxXQTJLbEIiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBEeW5hbW9EQkNsaWVudCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1keW5hbW9kYic7XG5pbXBvcnQgeyBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LCBQdXRDb21tYW5kLCBHZXRDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvbGliLWR5bmFtb2RiJztcbmltcG9ydCB7IGdldEFsbFBsYW5ldHMgfSBmcm9tICdlcGhlbWVyaXMnO1xuaW1wb3J0ICogYXMgY3J5cHRvIGZyb20gJ2NyeXB0byc7XG5cbmNvbnN0IGR5bmFtb0NsaWVudCA9IG5ldyBEeW5hbW9EQkNsaWVudCh7fSk7XG5jb25zdCBkb2NDbGllbnQgPSBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LmZyb20oZHluYW1vQ2xpZW50KTtcblxuLy8gSW1wb3J0IHN3aXNzZXBoIGZyb20gdGhlIExhbWJkYSBMYXllclxuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbmxldCBzd2lzc2VwaDogYW55O1xubGV0IGVwaGVtZXJpc1BhdGg6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuLy8gQ29sZCBzdGFydCBsb2dnaW5nIGZvciBlcGhlbWVyaXMgcGF0aCB2ZXJpZmljYXRpb25cbmNvbnN0IGluaXRTd2lzc0VwaCA9ICgpID0+IHtcbiAgLy8gVHJ5IGRpZmZlcmVudCBwYXRocyB0byBmaW5kIFN3aXNzIEVwaGVtZXJpc1xuICBjb25zdCBwYXRoID0gcmVxdWlyZSgncGF0aCcpO1xuICBjb25zdCBmcyA9IHJlcXVpcmUoJ2ZzJyk7XG5cbiAgLy8gVXNlIGVudmlyb25tZW50IHZhcmlhYmxlcyBpZiBzZXQgKGZvciB0ZXN0IGVudmlyb25tZW50cylcbiAgaWYgKHByb2Nlc3MuZW52LlNFX0VQSEVfUEFUSCAmJiBwcm9jZXNzLmVudi5FUEhFTUVSSVNfUEFUSCkge1xuICAgIGNvbnN0IHRlc3RNb2R1bGVQYXRoID0gcGF0aC5kaXJuYW1lKHByb2Nlc3MuZW52LlNFX0VQSEVfUEFUSCk7XG4gICAgaWYgKGZzLmV4aXN0c1N5bmModGVzdE1vZHVsZVBhdGgpKSB7XG4gICAgICB0cnkge1xuICAgICAgICBzd2lzc2VwaCA9IHJlcXVpcmUodGVzdE1vZHVsZVBhdGgpO1xuICAgICAgICBlcGhlbWVyaXNQYXRoID0gcHJvY2Vzcy5lbnYuU0VfRVBIRV9QQVRIO1xuXG4gICAgICAgIGNvbnNvbGUuaW5mbygnU3dpc3MgRXBoZW1lcmlzIGluaXRpYWxpemF0aW9uIChmcm9tIGVudik6Jywge1xuICAgICAgICAgIHBhdGg6IGVwaGVtZXJpc1BhdGgsXG4gICAgICAgICAgbW9kdWxlUGF0aDogdGVzdE1vZHVsZVBhdGgsXG4gICAgICAgICAgZW52U0VfRVBIRV9QQVRIOiBwcm9jZXNzLmVudi5TRV9FUEhFX1BBVEgsXG4gICAgICAgICAgZW52RVBIRU1FUklTX1BBVEg6IHByb2Nlc3MuZW52LkVQSEVNRVJJU19QQVRILFxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBWZXJpZnkgZXBoZW1lcmlzIGRpcmVjdG9yeSBleGlzdHNcbiAgICAgICAgaWYgKGZzLmV4aXN0c1N5bmMoZXBoZW1lcmlzUGF0aCkpIHtcbiAgICAgICAgICBjb25zdCBmaWxlcyA9IGZzLnJlYWRkaXJTeW5jKGVwaGVtZXJpc1BhdGgpO1xuICAgICAgICAgIGNvbnN0IHNlRmlsZXMgPSBmaWxlcy5maWx0ZXIoXG4gICAgICAgICAgICAoZjogc3RyaW5nKSA9PiBmLmVuZHNXaXRoKCcuc2UxJykgfHwgZiA9PT0gJ3NlbGVhcHNlYy50eHQnIHx8IGYgPT09ICdzZW9yYmVsLnR4dCcsXG4gICAgICAgICAgKTtcbiAgICAgICAgICBjb25zb2xlLmluZm8oJ0VwaGVtZXJpcyBmaWxlcyBmb3VuZDonLCBzZUZpbGVzLmxlbmd0aCwgJ2ZpbGVzOicsIHNlRmlsZXMuc2xpY2UoMCwgNSkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0VwaGVtZXJpcyBkaXJlY3RvcnkgZG9lcyBub3QgZXhpc3Q6JywgZXBoZW1lcmlzUGF0aCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm47IC8vIFN1Y2Nlc3NmdWxseSBsb2FkZWQgZnJvbSBlbnZpcm9ubWVudFxuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLndhcm4oJ0ZhaWxlZCB0byBsb2FkIGZyb20gZW52aXJvbm1lbnQgcGF0aHM6JywgZSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgY29uc3QgcG9zc2libGVQYXRocyA9IFtcbiAgICAnL29wdC9ub2RlanMvbm9kZV9tb2R1bGVzL3N3aXNzZXBoJywgLy8gTGFtYmRhIGxheWVyIHBhdGhcbiAgICBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vbGF5ZXJzL3N3ZXRlc3QvbGF5ZXIvbm9kZWpzL25vZGVfbW9kdWxlcy9zd2lzc2VwaCcpLCAvLyBUZXN0IGVudmlyb25tZW50IHBhdGhcbiAgICAnc3dpc3NlcGgnLCAvLyBOb3JtYWwgcmVxdWlyZSBwYXRoXG4gIF07XG5cbiAgZm9yIChjb25zdCBtb2R1bGVQYXRoIG9mIHBvc3NpYmxlUGF0aHMpIHtcbiAgICB0cnkge1xuICAgICAgc3dpc3NlcGggPSByZXF1aXJlKG1vZHVsZVBhdGgpO1xuXG4gICAgICAvLyBTZXQgZXBoZW1lcmlzIHBhdGggYmFzZWQgb24gZW52aXJvbm1lbnRcbiAgICAgIGlmIChwcm9jZXNzLmVudi5TRV9FUEhFX1BBVEgpIHtcbiAgICAgICAgZXBoZW1lcmlzUGF0aCA9IHByb2Nlc3MuZW52LlNFX0VQSEVfUEFUSDtcbiAgICAgIH0gZWxzZSBpZiAocHJvY2Vzcy5lbnYuRVBIRU1FUklTX1BBVEgpIHtcbiAgICAgICAgZXBoZW1lcmlzUGF0aCA9IHByb2Nlc3MuZW52LkVQSEVNRVJJU19QQVRIO1xuICAgICAgfSBlbHNlIGlmIChtb2R1bGVQYXRoLnN0YXJ0c1dpdGgoJy9vcHQnKSkge1xuICAgICAgICBlcGhlbWVyaXNQYXRoID0gJy9vcHQvbm9kZWpzL25vZGVfbW9kdWxlcy9zd2lzc2VwaC9lcGhlJztcbiAgICAgIH0gZWxzZSBpZiAobW9kdWxlUGF0aC5pbmNsdWRlcygnbGF5ZXJzL3N3ZXRlc3QnKSkge1xuICAgICAgICBlcGhlbWVyaXNQYXRoID0gcGF0aC5qb2luKG1vZHVsZVBhdGgsICdlcGhlJyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBlcGhlbWVyaXNQYXRoID0gcGF0aC5qb2luKHBhdGguZGlybmFtZShyZXF1aXJlLnJlc29sdmUobW9kdWxlUGF0aCkpLCAnZXBoZScpO1xuICAgICAgfVxuXG4gICAgICAvLyBMb2cgZXBoZW1lcmlzIHBhdGggb24gY29sZCBzdGFydFxuICAgICAgY29uc29sZS5pbmZvKCdTd2lzcyBFcGhlbWVyaXMgaW5pdGlhbGl6YXRpb246Jywge1xuICAgICAgICBwYXRoOiBlcGhlbWVyaXNQYXRoLFxuICAgICAgICBtb2R1bGVQYXRoOiBtb2R1bGVQYXRoLFxuICAgICAgICBlbnZTRV9FUEhFX1BBVEg6IHByb2Nlc3MuZW52LlNFX0VQSEVfUEFUSCxcbiAgICAgICAgZW52RVBIRU1FUklTX1BBVEg6IHByb2Nlc3MuZW52LkVQSEVNRVJJU19QQVRILFxuICAgICAgfSk7XG5cbiAgICAgIC8vIFZlcmlmeSBlcGhlbWVyaXMgZGlyZWN0b3J5IGV4aXN0c1xuICAgICAgaWYgKGZzLmV4aXN0c1N5bmMoZXBoZW1lcmlzUGF0aCkpIHtcbiAgICAgICAgY29uc3QgZmlsZXMgPSBmcy5yZWFkZGlyU3luYyhlcGhlbWVyaXNQYXRoKTtcbiAgICAgICAgY29uc3Qgc2VGaWxlcyA9IGZpbGVzLmZpbHRlcihcbiAgICAgICAgICAoZjogc3RyaW5nKSA9PiBmLmVuZHNXaXRoKCcuc2UxJykgfHwgZiA9PT0gJ3NlbGVhcHNlYy50eHQnIHx8IGYgPT09ICdzZW9yYmVsLnR4dCcsXG4gICAgICAgICk7XG4gICAgICAgIGNvbnNvbGUuaW5mbygnRXBoZW1lcmlzIGZpbGVzIGZvdW5kOicsIHNlRmlsZXMubGVuZ3RoLCAnZmlsZXM6Jywgc2VGaWxlcy5zbGljZSgwLCA1KSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdFcGhlbWVyaXMgZGlyZWN0b3J5IGRvZXMgbm90IGV4aXN0OicsIGVwaGVtZXJpc1BhdGgpO1xuICAgICAgfVxuXG4gICAgICAvLyBTdWNjZXNzZnVsbHkgbG9hZGVkXG4gICAgICBicmVhaztcbiAgICB9IGNhdGNoIChfZXJyb3IpIHtcbiAgICAgIC8vIFRyeSBuZXh0IHBhdGhcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgfVxuXG4gIGlmICghc3dpc3NlcGgpIHtcbiAgICBjb25zb2xlLmVycm9yKCdTd2lzcyBFcGhlbWVyaXMgbm90IGF2YWlsYWJsZSBmcm9tIGFueSBwYXRoJyk7XG4gIH1cbn07XG5cbi8vIEluaXRpYWxpemUgb24gY29sZCBzdGFydFxuaW5pdFN3aXNzRXBoKCk7XG5cbmludGVyZmFjZSBOYXRhbENoYXJ0RXZlbnQge1xuICB1c2VySWQ6IHN0cmluZztcbiAgYmlydGhEYXRlOiBzdHJpbmc7IC8vIFlZWVktTU0tRERcbiAgYmlydGhUaW1lPzogc3RyaW5nOyAvLyBISDpNTVxuICBsYXRpdHVkZTogbnVtYmVyO1xuICBsb25naXR1ZGU6IG51bWJlcjtcbiAgaWFuYVRpbWVab25lOiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBIb3VzZURhdGEge1xuICBob3VzZU51bWJlcjogbnVtYmVyO1xuICBjdXNwRGVncmVlOiBudW1iZXI7XG4gIGN1c3BTaWduOiBzdHJpbmc7XG4gIGN1c3BEZWdyZWVJblNpZ246IG51bWJlcjtcbiAgY3VzcE1pbnV0ZXM6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIEFuZ2xlRGF0YSB7XG4gIGRlZ3JlZTogbnVtYmVyO1xuICBzaWduOiBzdHJpbmc7XG4gIGRlZ3JlZUluU2lnbjogbnVtYmVyO1xuICBtaW51dGVzOiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBDZWxlc3RpYWxCb2R5RGF0YSB7XG4gIGRlZ3JlZTogbnVtYmVyO1xuICBzaWduOiBzdHJpbmc7XG4gIGRlZ3JlZUluU2lnbjogbnVtYmVyO1xuICBtaW51dGVzOiBudW1iZXI7XG4gIG5hbWU6IHN0cmluZztcbn1cblxuY29uc3QgWk9ESUFDX1NJR05TID0gW1xuICAnQXJpZXMnLFxuICAnVGF1cnVzJyxcbiAgJ0dlbWluaScsXG4gICdDYW5jZXInLFxuICAnTGVvJyxcbiAgJ1ZpcmdvJyxcbiAgJ0xpYnJhJyxcbiAgJ1Njb3JwaW8nLFxuICAnU2FnaXR0YXJpdXMnLFxuICAnQ2Fwcmljb3JuJyxcbiAgJ0FxdWFyaXVzJyxcbiAgJ1Bpc2NlcycsXG5dO1xuXG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuY29uc3QgdmFsaWRhdGVFdmVudCA9IChldmVudDogYW55KTogTmF0YWxDaGFydEV2ZW50ID0+IHtcbiAgaWYgKFxuICAgICFldmVudC51c2VySWQgfHxcbiAgICAhZXZlbnQuYmlydGhEYXRlIHx8XG4gICAgIWV2ZW50LmxhdGl0dWRlIHx8XG4gICAgIWV2ZW50LmxvbmdpdHVkZSB8fFxuICAgICFldmVudC5pYW5hVGltZVpvbmVcbiAgKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdNaXNzaW5nIHJlcXVpcmVkIGV2ZW50IHByb3BlcnRpZXMnKTtcbiAgfVxuXG4gIC8vIFZhbGlkYXRlIGNvb3JkaW5hdGVzXG4gIGlmIChldmVudC5sYXRpdHVkZSA8IC05MCB8fCBldmVudC5sYXRpdHVkZSA+IDkwKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGxhdGl0dWRlOiBtdXN0IGJlIGJldHdlZW4gLTkwIGFuZCA5MCcpO1xuICB9XG4gIGlmIChldmVudC5sb25naXR1ZGUgPCAtMTgwIHx8IGV2ZW50LmxvbmdpdHVkZSA+IDE4MCkge1xuICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBsb25naXR1ZGU6IG11c3QgYmUgYmV0d2VlbiAtMTgwIGFuZCAxODAnKTtcbiAgfVxuXG4gIHJldHVybiBldmVudDtcbn07XG5cbmNvbnN0IGdldERlZ3JlZUluZm8gPSAoZGVncmVlOiBudW1iZXIpOiB7IHNpZ246IHN0cmluZzsgZGVncmVlSW5TaWduOiBudW1iZXI7IG1pbnV0ZXM6IG51bWJlciB9ID0+IHtcbiAgY29uc3Qgbm9ybWFsaXplZERlZ3JlZSA9IGRlZ3JlZSAlIDM2MDtcbiAgY29uc3Qgc2lnbkluZGV4ID0gTWF0aC5mbG9vcihub3JtYWxpemVkRGVncmVlIC8gMzApO1xuICBjb25zdCBkZWdyZWVJblNpZ24gPSBub3JtYWxpemVkRGVncmVlICUgMzA7XG4gIGNvbnN0IHdob2xlRGVncmVlcyA9IE1hdGguZmxvb3IoZGVncmVlSW5TaWduKTtcbiAgY29uc3QgbWludXRlcyA9IE1hdGgucm91bmQoKGRlZ3JlZUluU2lnbiAtIHdob2xlRGVncmVlcykgKiA2MCk7XG5cbiAgcmV0dXJuIHtcbiAgICBzaWduOiBaT0RJQUNfU0lHTlNbc2lnbkluZGV4XSxcbiAgICBkZWdyZWVJblNpZ246IHdob2xlRGVncmVlcyxcbiAgICBtaW51dGVzLFxuICB9O1xufTtcblxuLyoqXG4gKiBDYWxjdWxhdGUgZGVyaXZlZCBhbmd1bGFyIHBvaW50cyAoRGVzY2VuZGFudCBhbmQgSUMpIGZyb20gZXhpc3RpbmcgYW5nbGVzXG4gKi9cbmNvbnN0IGNhbGN1bGF0ZURlcml2ZWRBbmdsZXMgPSAoXG4gIGFzY2VuZGFudDogQW5nbGVEYXRhLFxuICBtaWRoZWF2ZW46IEFuZ2xlRGF0YSxcbik6IHsgZGVzY2VuZGFudDogQW5nbGVEYXRhOyBpbXVtQ29lbGk6IEFuZ2xlRGF0YSB9ID0+IHtcbiAgLy8gRGVzY2VuZGFudCBpcyBvcHBvc2l0ZSB0byBBc2NlbmRhbnQgKDE4MMKwIGRpZmZlcmVuY2UpXG4gIGNvbnN0IGRlc2NlbmRhbnREZWdyZWUgPSAoYXNjZW5kYW50LmRlZ3JlZSArIDE4MCkgJSAzNjA7XG4gIGNvbnN0IGRlc2NlbmRhbnRJbmZvID0gZ2V0RGVncmVlSW5mbyhkZXNjZW5kYW50RGVncmVlKTtcblxuICAvLyBJbXVtIENvZWxpIChJQykgaXMgb3Bwb3NpdGUgdG8gTWlkaGVhdmVuICgxODDCsCBkaWZmZXJlbmNlKVxuICBjb25zdCBpY0RlZ3JlZSA9IChtaWRoZWF2ZW4uZGVncmVlICsgMTgwKSAlIDM2MDtcbiAgY29uc3QgaWNJbmZvID0gZ2V0RGVncmVlSW5mbyhpY0RlZ3JlZSk7XG5cbiAgcmV0dXJuIHtcbiAgICBkZXNjZW5kYW50OiB7XG4gICAgICBkZWdyZWU6IGRlc2NlbmRhbnREZWdyZWUsXG4gICAgICBzaWduOiBkZXNjZW5kYW50SW5mby5zaWduLFxuICAgICAgZGVncmVlSW5TaWduOiBkZXNjZW5kYW50SW5mby5kZWdyZWVJblNpZ24sXG4gICAgICBtaW51dGVzOiBkZXNjZW5kYW50SW5mby5taW51dGVzLFxuICAgIH0sXG4gICAgaW11bUNvZWxpOiB7XG4gICAgICBkZWdyZWU6IGljRGVncmVlLFxuICAgICAgc2lnbjogaWNJbmZvLnNpZ24sXG4gICAgICBkZWdyZWVJblNpZ246IGljSW5mby5kZWdyZWVJblNpZ24sXG4gICAgICBtaW51dGVzOiBpY0luZm8ubWludXRlcyxcbiAgICB9LFxuICB9O1xufTtcblxuLyoqXG4gKiBDYWxjdWxhdGUgUGFydCBvZiBGb3J0dW5lIHVzaW5nIHRyb3BpY2FsIHpvZGlhYyBmb3JtdWxhXG4gKiBGb3JtdWxhOiBBc2NlbmRhbnQgKyBNb29uIC0gU3VuXG4gKi9cbmNvbnN0IGNhbGN1bGF0ZVBhcnRPZkZvcnR1bmUgPSAoXG4gIGFzY2VuZGFudERlZ3JlZTogbnVtYmVyLFxuICBtb29uTG9uZ2l0dWRlOiBudW1iZXIsXG4gIHN1bkxvbmdpdHVkZTogbnVtYmVyLFxuKTogQ2VsZXN0aWFsQm9keURhdGEgPT4ge1xuICAvLyBDYWxjdWxhdGUgUGFydCBvZiBGb3J0dW5lXG4gIGxldCBmb3J0dW5lRGVncmVlID0gYXNjZW5kYW50RGVncmVlICsgbW9vbkxvbmdpdHVkZSAtIHN1bkxvbmdpdHVkZTtcblxuICAvLyBOb3JtYWxpemUgdG8gMC0zNjDCsCByYW5nZVxuICBmb3J0dW5lRGVncmVlID0gKChmb3J0dW5lRGVncmVlICUgMzYwKSArIDM2MCkgJSAzNjA7XG5cbiAgY29uc3QgZm9ydHVuZUluZm8gPSBnZXREZWdyZWVJbmZvKGZvcnR1bmVEZWdyZWUpO1xuXG4gIHJldHVybiB7XG4gICAgZGVncmVlOiBmb3J0dW5lRGVncmVlLFxuICAgIHNpZ246IGZvcnR1bmVJbmZvLnNpZ24sXG4gICAgZGVncmVlSW5TaWduOiBmb3J0dW5lSW5mby5kZWdyZWVJblNpZ24sXG4gICAgbWludXRlczogZm9ydHVuZUluZm8ubWludXRlcyxcbiAgICBuYW1lOiAnUGFydCBvZiBGb3J0dW5lJyxcbiAgfTtcbn07XG5cbi8qKlxuICogQ2FsY3VsYXRlIGx1bmFyIG5vZGVzIChOb3J0aCBOb2RlIGFuZCBTb3V0aCBOb2RlKVxuICovXG5jb25zdCBjYWxjdWxhdGVMdW5hck5vZGVzID0gKFxuICBqdWxpYW5EYXk6IG51bWJlcixcbik6IHsgbm9ydGhOb2RlOiBDZWxlc3RpYWxCb2R5RGF0YTsgc291dGhOb2RlOiBDZWxlc3RpYWxCb2R5RGF0YSB9IHwgbnVsbCA9PiB7XG4gIGlmICghc3dpc3NlcGgpIHtcbiAgICBjb25zb2xlLndhcm4oJ1N3aXNzIEVwaGVtZXJpcyBub3QgYXZhaWxhYmxlLCBza2lwcGluZyBsdW5hciBub2RlcyBjYWxjdWxhdGlvbicpO1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgdHJ5IHtcbiAgICAvLyBDYWxjdWxhdGUgVHJ1ZSBOb3J0aCBOb2RlXG4gICAgY29uc3Qgbm9ydGhOb2RlRGF0YSA9IHN3aXNzZXBoLnN3ZV9jYWxjX3V0KFxuICAgICAganVsaWFuRGF5LFxuICAgICAgc3dpc3NlcGguU0VfVFJVRV9OT0RFLFxuICAgICAgc3dpc3NlcGguU0VGTEdfU1BFRUQsXG4gICAgKTtcblxuICAgIGlmICghbm9ydGhOb2RlRGF0YSB8fCBub3J0aE5vZGVEYXRhLmxvbmdpdHVkZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZhaWxlZCB0byBjYWxjdWxhdGUgTm9ydGggTm9kZScpO1xuICAgIH1cblxuICAgIGNvbnN0IG5vcnRoTm9kZUluZm8gPSBnZXREZWdyZWVJbmZvKG5vcnRoTm9kZURhdGEubG9uZ2l0dWRlKTtcblxuICAgIC8vIFNvdXRoIE5vZGUgaXMgYWx3YXlzIDE4MMKwIG9wcG9zaXRlIHRvIE5vcnRoIE5vZGVcbiAgICBjb25zdCBzb3V0aE5vZGVEZWdyZWUgPSAobm9ydGhOb2RlRGF0YS5sb25naXR1ZGUgKyAxODApICUgMzYwO1xuICAgIGNvbnN0IHNvdXRoTm9kZUluZm8gPSBnZXREZWdyZWVJbmZvKHNvdXRoTm9kZURlZ3JlZSk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgbm9ydGhOb2RlOiB7XG4gICAgICAgIGRlZ3JlZTogbm9ydGhOb2RlRGF0YS5sb25naXR1ZGUsXG4gICAgICAgIHNpZ246IG5vcnRoTm9kZUluZm8uc2lnbixcbiAgICAgICAgZGVncmVlSW5TaWduOiBub3J0aE5vZGVJbmZvLmRlZ3JlZUluU2lnbixcbiAgICAgICAgbWludXRlczogbm9ydGhOb2RlSW5mby5taW51dGVzLFxuICAgICAgICBuYW1lOiAnTm9ydGggTm9kZScsXG4gICAgICB9LFxuICAgICAgc291dGhOb2RlOiB7XG4gICAgICAgIGRlZ3JlZTogc291dGhOb2RlRGVncmVlLFxuICAgICAgICBzaWduOiBzb3V0aE5vZGVJbmZvLnNpZ24sXG4gICAgICAgIGRlZ3JlZUluU2lnbjogc291dGhOb2RlSW5mby5kZWdyZWVJblNpZ24sXG4gICAgICAgIG1pbnV0ZXM6IHNvdXRoTm9kZUluZm8ubWludXRlcyxcbiAgICAgICAgbmFtZTogJ1NvdXRoIE5vZGUnLFxuICAgICAgfSxcbiAgICB9O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGNhbGN1bGF0aW5nIGx1bmFyIG5vZGVzOicsIGVycm9yKTtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufTtcblxuLyoqXG4gKiBDYWxjdWxhdGUgYXN0ZXJvaWRzIGFuZCBtaW5vciBjZWxlc3RpYWwgYm9kaWVzXG4gKi9cbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5jb25zdCBjYWxjdWxhdGVBc3Rlcm9pZHMgPSAoanVsaWFuRGF5OiBudW1iZXIpOiBhbnkgfCBudWxsID0+IHtcbiAgaWYgKCFzd2lzc2VwaCkge1xuICAgIGNvbnNvbGUud2FybignU3dpc3MgRXBoZW1lcmlzIG5vdCBhdmFpbGFibGUsIHNraXBwaW5nIGFzdGVyb2lkIGNhbGN1bGF0aW9ucycpO1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgdHJ5IHtcbiAgICAvLyBBc3Rlcm9pZCBudW1iZXJpbmc6IEZvciBudW1iZXJlZCBhc3Rlcm9pZHMsIHVzZSBTRV9BU1RfT0ZGU0VUICsgYXN0ZXJvaWQgbnVtYmVyXG4gICAgY29uc3QgYXN0ZXJvaWRJZHMgPSB7XG4gICAgICBjZXJlczogc3dpc3NlcGguU0VfQ0VSRVMgfHwgMiwgLy8gTWFpbiBiZWx0IGFzdGVyb2lkXG4gICAgICBwYWxsYXM6IHN3aXNzZXBoLlNFX1BBTExBUyB8fCAzLCAvLyBNYWluIGJlbHQgYXN0ZXJvaWRcbiAgICAgIGp1bm86IHN3aXNzZXBoLlNFX0pVTk8gfHwgNCwgLy8gTWFpbiBiZWx0IGFzdGVyb2lkXG4gICAgICB2ZXN0YTogc3dpc3NlcGguU0VfVkVTVEEgfHwgNSwgLy8gTWFpbiBiZWx0IGFzdGVyb2lkXG4gICAgICBlcmlzOiBzd2lzc2VwaC5TRV9BU1RfT0ZGU0VUICsgMTM2MTk5LCAvLyBEd2FyZiBwbGFuZXRcbiAgICAgIHBob2x1czogc3dpc3NlcGguU0VfQVNUX09GRlNFVCArIDUxNDUsIC8vIENlbnRhdXJcbiAgICAgIG5lc3N1czogc3dpc3NlcGguU0VfQVNUX09GRlNFVCArIDcwNjYsIC8vIENlbnRhdXJcbiAgICAgIGl4aW9uOiBzd2lzc2VwaC5TRV9BU1RfT0ZGU0VUICsgMjg5NzgsIC8vIFBsdXRpbm9cbiAgICAgIG9yY3VzOiBzd2lzc2VwaC5TRV9BU1RfT0ZGU0VUICsgOTA0ODIsIC8vIFBsdXRpbm9cbiAgICAgIHF1YW9hcjogc3dpc3NlcGguU0VfQVNUX09GRlNFVCArIDUwMDAwLCAvLyBUcmFucy1OZXB0dW5pYW4gb2JqZWN0XG4gICAgICBzZWRuYTogc3dpc3NlcGguU0VfQVNUX09GRlNFVCArIDkwMzc3LCAvLyBUcmFucy1OZXB0dW5pYW4gb2JqZWN0XG4gICAgICB2YXJ1bmE6IHN3aXNzZXBoLlNFX0FTVF9PRkZTRVQgKyAyMDAwMCwgLy8gVHJhbnMtTmVwdHVuaWFuIG9iamVjdFxuICAgIH07XG5cbiAgICBjb25zdCBhc3Rlcm9pZE5hbWVzID0ge1xuICAgICAgY2VyZXM6ICdDZXJlcycsXG4gICAgICBwYWxsYXM6ICdQYWxsYXMgQXRoZW5lJyxcbiAgICAgIGp1bm86ICdKdW5vJyxcbiAgICAgIHZlc3RhOiAnVmVzdGEnLFxuICAgICAgZXJpczogJ0VyaXMnLFxuICAgICAgcGhvbHVzOiAnUGhvbHVzJyxcbiAgICAgIG5lc3N1czogJ05lc3N1cycsXG4gICAgICBpeGlvbjogJ0l4aW9uJyxcbiAgICAgIG9yY3VzOiAnT3JjdXMnLFxuICAgICAgcXVhb2FyOiAnUXVhb2FyJyxcbiAgICAgIHNlZG5hOiAnU2VkbmEnLFxuICAgICAgdmFydW5hOiAnVmFydW5hJyxcbiAgICB9O1xuXG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICBjb25zdCBhc3Rlcm9pZHM6IGFueSA9IHt9O1xuXG4gICAgLy8gQ2FsY3VsYXRlIGVhY2ggYXN0ZXJvaWRcbiAgICBmb3IgKGNvbnN0IFtrZXksIGFzdGVyb2lkSWRdIG9mIE9iamVjdC5lbnRyaWVzKGFzdGVyb2lkSWRzKSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgYXN0ZXJvaWREYXRhID0gc3dpc3NlcGguc3dlX2NhbGNfdXQoanVsaWFuRGF5LCBhc3Rlcm9pZElkLCBzd2lzc2VwaC5TRUZMR19TUEVFRCk7XG5cbiAgICAgICAgaWYgKGFzdGVyb2lkRGF0YSAmJiBhc3Rlcm9pZERhdGEubG9uZ2l0dWRlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBjb25zdCBhc3Rlcm9pZEluZm8gPSBnZXREZWdyZWVJbmZvKGFzdGVyb2lkRGF0YS5sb25naXR1ZGUpO1xuXG4gICAgICAgICAgYXN0ZXJvaWRzW2tleV0gPSB7XG4gICAgICAgICAgICBkZWdyZWU6IGFzdGVyb2lkRGF0YS5sb25naXR1ZGUsXG4gICAgICAgICAgICBzaWduOiBhc3Rlcm9pZEluZm8uc2lnbixcbiAgICAgICAgICAgIGRlZ3JlZUluU2lnbjogYXN0ZXJvaWRJbmZvLmRlZ3JlZUluU2lnbixcbiAgICAgICAgICAgIG1pbnV0ZXM6IGFzdGVyb2lkSW5mby5taW51dGVzLFxuICAgICAgICAgICAgbmFtZTogYXN0ZXJvaWROYW1lc1trZXkgYXMga2V5b2YgdHlwZW9mIGFzdGVyb2lkTmFtZXNdLFxuICAgICAgICAgIH07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29uc29sZS53YXJuKGBGYWlsZWQgdG8gY2FsY3VsYXRlIGFzdGVyb2lkOiAke2tleX1gKTtcbiAgICAgICAgICAvLyBTZXQgZGVmYXVsdC9wbGFjZWhvbGRlciBkYXRhIGZvciBtaXNzaW5nIGFzdGVyb2lkc1xuICAgICAgICAgIGFzdGVyb2lkc1trZXldID0ge1xuICAgICAgICAgICAgZGVncmVlOiAwLFxuICAgICAgICAgICAgc2lnbjogJ1Vua25vd24nLFxuICAgICAgICAgICAgZGVncmVlSW5TaWduOiAwLFxuICAgICAgICAgICAgbWludXRlczogMCxcbiAgICAgICAgICAgIG5hbWU6IGFzdGVyb2lkTmFtZXNba2V5IGFzIGtleW9mIHR5cGVvZiBhc3Rlcm9pZE5hbWVzXSxcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKGBFcnJvciBjYWxjdWxhdGluZyBhc3Rlcm9pZCAke2tleX06YCwgZXJyb3IpO1xuICAgICAgICAvLyBDb250aW51ZSB3aXRoIG5leHQgYXN0ZXJvaWQgb24gZXJyb3JcbiAgICAgICAgYXN0ZXJvaWRzW2tleV0gPSB7XG4gICAgICAgICAgZGVncmVlOiAwLFxuICAgICAgICAgIHNpZ246ICdVbmtub3duJyxcbiAgICAgICAgICBkZWdyZWVJblNpZ246IDAsXG4gICAgICAgICAgbWludXRlczogMCxcbiAgICAgICAgICBuYW1lOiBhc3Rlcm9pZE5hbWVzW2tleSBhcyBrZXlvZiB0eXBlb2YgYXN0ZXJvaWROYW1lc10sXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGFzdGVyb2lkcztcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBjYWxjdWxhdGluZyBhc3Rlcm9pZHM6JywgZXJyb3IpO1xuICAgIHJldHVybiBudWxsO1xuICB9XG59O1xuXG5jb25zdCBjYWxjdWxhdGVIb3VzZXNXaXRoU3dpc3NlcGggPSBhc3luYyAoXG4gIGJpcnRoRGF0ZVRpbWU6IERhdGUsXG4gIGxhdGl0dWRlOiBudW1iZXIsXG4gIGxvbmdpdHVkZTogbnVtYmVyLFxuKTogUHJvbWlzZTx7XG4gIGhvdXNlczogSG91c2VEYXRhW107XG4gIGFzY2VuZGFudDogQW5nbGVEYXRhO1xuICBtaWRoZWF2ZW46IEFuZ2xlRGF0YTtcbiAgcGxhbmV0SG91c2VzOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICB2ZXJ0ZXg/OiBBbmdsZURhdGE7XG4gIGp1bGlhbkRheTogbnVtYmVyO1xufSB8IG51bGw+ID0+IHtcbiAgaWYgKCFzd2lzc2VwaCkge1xuICAgIGNvbnNvbGUud2FybignU3dpc3MgRXBoZW1lcmlzIG5vdCBhdmFpbGFibGUsIHNraXBwaW5nIGhvdXNlIGNhbGN1bGF0aW9ucycpO1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgdHJ5IHtcbiAgICAvLyBTZXQgZXBoZW1lcmlzIHBhdGggZXhwbGljaXRseVxuICAgIGNvbnN0IGVwaGVQYXRoID1cbiAgICAgIGVwaGVtZXJpc1BhdGggfHxcbiAgICAgIHByb2Nlc3MuZW52LlNFX0VQSEVfUEFUSCB8fFxuICAgICAgcHJvY2Vzcy5lbnYuRVBIRU1FUklTX1BBVEggfHxcbiAgICAgICcvb3B0L25vZGVqcy9ub2RlX21vZHVsZXMvc3dpc3NlcGgvZXBoZSc7XG4gICAgc3dpc3NlcGguc3dlX3NldF9lcGhlX3BhdGgoZXBoZVBhdGgpO1xuICAgIGNvbnNvbGUuaW5mbygnU2V0dGluZyBlcGhlbWVyaXMgcGF0aCBmb3IgaG91c2UgY2FsY3VsYXRpb25zOicsIGVwaGVQYXRoKTtcblxuICAgIC8vIENhbGN1bGF0ZSBKdWxpYW4gRGF5XG4gICAgY29uc3QgeWVhciA9IGJpcnRoRGF0ZVRpbWUuZ2V0VVRDRnVsbFllYXIoKTtcbiAgICBjb25zdCBtb250aCA9IGJpcnRoRGF0ZVRpbWUuZ2V0VVRDTW9udGgoKSArIDE7XG4gICAgY29uc3QgZGF5ID0gYmlydGhEYXRlVGltZS5nZXRVVENEYXRlKCk7XG4gICAgY29uc3QgaG91ciA9XG4gICAgICBiaXJ0aERhdGVUaW1lLmdldFVUQ0hvdXJzKCkgK1xuICAgICAgYmlydGhEYXRlVGltZS5nZXRVVENNaW51dGVzKCkgLyA2MCArXG4gICAgICBiaXJ0aERhdGVUaW1lLmdldFVUQ1NlY29uZHMoKSAvIDM2MDA7XG5cbiAgICBjb25zdCBqdWxpYW5EYXkgPSBzd2lzc2VwaC5zd2VfanVsZGF5KHllYXIsIG1vbnRoLCBkYXksIGhvdXIsIHN3aXNzZXBoLlNFX0dSRUdfQ0FMKTtcblxuICAgIC8vIENhbGN1bGF0ZSBob3VzZXMgdXNpbmcgUGxhY2lkdXMgc3lzdGVtXG4gICAgY29uc3QgaG91c2VEYXRhID0gc3dpc3NlcGguc3dlX2hvdXNlcyhcbiAgICAgIGp1bGlhbkRheSxcbiAgICAgIGxhdGl0dWRlLFxuICAgICAgbG9uZ2l0dWRlLFxuICAgICAgJ1AnLCAvLyBQbGFjaWR1cyBob3VzZSBzeXN0ZW1cbiAgICApO1xuXG4gICAgaWYgKCFob3VzZURhdGEgfHwgIWhvdXNlRGF0YS5ob3VzZSB8fCAhaG91c2VEYXRhLmFzY2VuZGFudCB8fCAhaG91c2VEYXRhLm1jKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZhaWxlZCB0byBjYWxjdWxhdGUgaG91c2VzJyk7XG4gICAgfVxuXG4gICAgLy8gUHJvY2VzcyBob3VzZSBjdXNwc1xuICAgIGNvbnN0IGhvdXNlczogSG91c2VEYXRhW10gPSBbXTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IDEyOyBpKyspIHtcbiAgICAgIGNvbnN0IGN1c3BEZWdyZWUgPSBob3VzZURhdGEuaG91c2VbaV07XG4gICAgICBjb25zdCBkZWdyZWVJbmZvID0gZ2V0RGVncmVlSW5mbyhjdXNwRGVncmVlKTtcbiAgICAgIGhvdXNlcy5wdXNoKHtcbiAgICAgICAgaG91c2VOdW1iZXI6IGkgKyAxLFxuICAgICAgICBjdXNwRGVncmVlLFxuICAgICAgICBjdXNwU2lnbjogZGVncmVlSW5mby5zaWduLFxuICAgICAgICBjdXNwRGVncmVlSW5TaWduOiBkZWdyZWVJbmZvLmRlZ3JlZUluU2lnbixcbiAgICAgICAgY3VzcE1pbnV0ZXM6IGRlZ3JlZUluZm8ubWludXRlcyxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIFByb2Nlc3MgQXNjZW5kYW50XG4gICAgY29uc3QgYXNjSW5mbyA9IGdldERlZ3JlZUluZm8oaG91c2VEYXRhLmFzY2VuZGFudCk7XG4gICAgY29uc3QgYXNjZW5kYW50OiBBbmdsZURhdGEgPSB7XG4gICAgICBkZWdyZWU6IGhvdXNlRGF0YS5hc2NlbmRhbnQsXG4gICAgICBzaWduOiBhc2NJbmZvLnNpZ24sXG4gICAgICBkZWdyZWVJblNpZ246IGFzY0luZm8uZGVncmVlSW5TaWduLFxuICAgICAgbWludXRlczogYXNjSW5mby5taW51dGVzLFxuICAgIH07XG5cbiAgICAvLyBQcm9jZXNzIE1pZGhlYXZlblxuICAgIGNvbnN0IG1jSW5mbyA9IGdldERlZ3JlZUluZm8oaG91c2VEYXRhLm1jKTtcbiAgICBjb25zdCBtaWRoZWF2ZW46IEFuZ2xlRGF0YSA9IHtcbiAgICAgIGRlZ3JlZTogaG91c2VEYXRhLm1jLFxuICAgICAgc2lnbjogbWNJbmZvLnNpZ24sXG4gICAgICBkZWdyZWVJblNpZ246IG1jSW5mby5kZWdyZWVJblNpZ24sXG4gICAgICBtaW51dGVzOiBtY0luZm8ubWludXRlcyxcbiAgICB9O1xuXG4gICAgLy8gRXh0cmFjdCBWZXJ0ZXggaWYgYXZhaWxhYmxlXG4gICAgbGV0IHZlcnRleDogQW5nbGVEYXRhIHwgdW5kZWZpbmVkO1xuICAgIGlmIChob3VzZURhdGEudmVydGV4ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGNvbnN0IHZlcnRleEluZm8gPSBnZXREZWdyZWVJbmZvKGhvdXNlRGF0YS52ZXJ0ZXgpO1xuICAgICAgdmVydGV4ID0ge1xuICAgICAgICBkZWdyZWU6IGhvdXNlRGF0YS52ZXJ0ZXgsXG4gICAgICAgIHNpZ246IHZlcnRleEluZm8uc2lnbixcbiAgICAgICAgZGVncmVlSW5TaWduOiB2ZXJ0ZXhJbmZvLmRlZ3JlZUluU2lnbixcbiAgICAgICAgbWludXRlczogdmVydGV4SW5mby5taW51dGVzLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBDYWxjdWxhdGUgcGxhbmV0IHBvc2l0aW9ucyB1c2luZyBTd2lzcyBFcGhlbWVyaXMgZm9yIGFjY3VyYWN5XG4gICAgY29uc3QgcGxhbmV0SG91c2VzOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+ID0ge307XG4gICAgY29uc3QgcGxhbmV0SWRzID0gW1xuICAgICAgc3dpc3NlcGguU0VfU1VOLFxuICAgICAgc3dpc3NlcGguU0VfTU9PTixcbiAgICAgIHN3aXNzZXBoLlNFX01FUkNVUlksXG4gICAgICBzd2lzc2VwaC5TRV9WRU5VUyxcbiAgICAgIHN3aXNzZXBoLlNFX01BUlMsXG4gICAgICBzd2lzc2VwaC5TRV9KVVBJVEVSLFxuICAgICAgc3dpc3NlcGguU0VfU0FUVVJOLFxuICAgICAgc3dpc3NlcGguU0VfVVJBTlVTLFxuICAgICAgc3dpc3NlcGguU0VfTkVQVFVORSxcbiAgICAgIHN3aXNzZXBoLlNFX1BMVVRPLFxuICAgIF07XG4gICAgY29uc3QgcGxhbmV0TmFtZXMgPSBbXG4gICAgICAnc3VuJyxcbiAgICAgICdtb29uJyxcbiAgICAgICdtZXJjdXJ5JyxcbiAgICAgICd2ZW51cycsXG4gICAgICAnbWFycycsXG4gICAgICAnanVwaXRlcicsXG4gICAgICAnc2F0dXJuJyxcbiAgICAgICd1cmFudXMnLFxuICAgICAgJ25lcHR1bmUnLFxuICAgICAgJ3BsdXRvJyxcbiAgICBdO1xuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBwbGFuZXRJZHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IHBsYW5ldERhdGEgPSBzd2lzc2VwaC5zd2VfY2FsY191dChqdWxpYW5EYXksIHBsYW5ldElkc1tpXSwgc3dpc3NlcGguU0VGTEdfU1BFRUQpO1xuICAgICAgaWYgKHBsYW5ldERhdGEgJiYgcGxhbmV0RGF0YS5sb25naXR1ZGUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBjb25zdCBwbGFuZXRMb25naXR1ZGUgPSBwbGFuZXREYXRhLmxvbmdpdHVkZTtcbiAgICAgICAgLy8gRGV0ZXJtaW5lIHdoaWNoIGhvdXNlIHRoZSBwbGFuZXQgaXMgaW5cbiAgICAgICAgZm9yIChsZXQgaCA9IDA7IGggPCAxMjsgaCsrKSB7XG4gICAgICAgICAgY29uc3QgY3VycmVudEN1c3AgPSBob3VzZXNbaF0uY3VzcERlZ3JlZTtcbiAgICAgICAgICBjb25zdCBuZXh0Q3VzcCA9IGhvdXNlc1soaCArIDEpICUgMTJdLmN1c3BEZWdyZWU7XG5cbiAgICAgICAgICAvLyBIYW5kbGUgY3VzcCB3cmFwLWFyb3VuZCBhdCAzNjAgZGVncmVlc1xuICAgICAgICAgIGlmIChjdXJyZW50Q3VzcCA+IG5leHRDdXNwKSB7XG4gICAgICAgICAgICAvLyBIb3VzZSBzcGFucyAwIGRlZ3JlZXNcbiAgICAgICAgICAgIGlmIChwbGFuZXRMb25naXR1ZGUgPj0gY3VycmVudEN1c3AgfHwgcGxhbmV0TG9uZ2l0dWRlIDwgbmV4dEN1c3ApIHtcbiAgICAgICAgICAgICAgcGxhbmV0SG91c2VzW3BsYW5ldE5hbWVzW2ldXSA9IGggKyAxO1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKHBsYW5ldExvbmdpdHVkZSA+PSBjdXJyZW50Q3VzcCAmJiBwbGFuZXRMb25naXR1ZGUgPCBuZXh0Q3VzcCkge1xuICAgICAgICAgICAgICBwbGFuZXRIb3VzZXNbcGxhbmV0TmFtZXNbaV1dID0gaCArIDE7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIENsb3NlIFN3aXNzIEVwaGVtZXJpc1xuICAgIHN3aXNzZXBoLnN3ZV9jbG9zZSgpO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGhvdXNlcyxcbiAgICAgIGFzY2VuZGFudCxcbiAgICAgIG1pZGhlYXZlbixcbiAgICAgIHBsYW5ldEhvdXNlcyxcbiAgICAgIHZlcnRleCxcbiAgICAgIGp1bGlhbkRheSxcbiAgICB9O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGNhbGN1bGF0aW5nIGhvdXNlcyB3aXRoIFN3aXNzIEVwaGVtZXJpczonLCBlcnJvcik7XG4gICAgLy8gQ2xvc2UgU3dpc3MgRXBoZW1lcmlzIG9uIGVycm9yXG4gICAgaWYgKHN3aXNzZXBoICYmIHN3aXNzZXBoLnN3ZV9jbG9zZSkge1xuICAgICAgc3dpc3NlcGguc3dlX2Nsb3NlKCk7XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xuICB9XG59O1xuXG5jb25zdCBnZW5lcmF0ZUNhY2hlS2V5ID0gKFxuICBiaXJ0aERhdGU6IHN0cmluZyxcbiAgYmlydGhUaW1lOiBzdHJpbmcsXG4gIGxhdGl0dWRlOiBudW1iZXIsXG4gIGxvbmdpdHVkZTogbnVtYmVyLFxuKTogc3RyaW5nID0+IHtcbiAgLy8gT25seSBpbmNsdWRlIGlucHV0cyB0aGF0IGFmZmVjdCBjYWxjdWxhdGlvbnNcbiAgY29uc3QgY2FjaGVEYXRhID0ge1xuICAgIGJpcnRoRGF0ZVRpbWU6IGAke2JpcnRoRGF0ZX1UJHtiaXJ0aFRpbWV9OjAwWmAsIC8vIFVUQyBJU08gZm9ybWF0XG4gICAgbGF0OiBsYXRpdHVkZSxcbiAgICBsb246IGxvbmdpdHVkZSxcbiAgICBob3VzZVN5c3RlbTogJ3BsYWNpZHVzJyxcbiAgICB6b2RpYWNUeXBlOiAndHJvcGljYWwnLFxuICAgIGVwaGVtZXJpc1ZlcnNpb246ICcyLjEwLjAzJywgLy8gT25seSBjaGFuZ2Ugd2hlbiBlcGhlbWVyaXMgZGF0YSBjaGFuZ2VzXG4gIH07XG5cbiAgLy8gVXNlIHN0YWJsZSBKU09OIHN0cmluZ2lmaWNhdGlvbiAoa2V5cyBpbiBhbHBoYWJldGljYWwgb3JkZXIpXG4gIGNvbnN0IHNvcnRlZEtleXMgPSBPYmplY3Qua2V5cyhjYWNoZURhdGEpLnNvcnQoKTtcbiAgY29uc3Qgc3RhYmxlSnNvbiA9IHNvcnRlZEtleXNcbiAgICAubWFwKChrZXkpID0+IGBcIiR7a2V5fVwiOiR7SlNPTi5zdHJpbmdpZnkoY2FjaGVEYXRhW2tleSBhcyBrZXlvZiB0eXBlb2YgY2FjaGVEYXRhXSl9YClcbiAgICAuam9pbignLCcpO1xuICBjb25zdCBpbnB1dCA9IGB7JHtzdGFibGVKc29ufX1gO1xuXG4gIHJldHVybiBjcnlwdG8uY3JlYXRlSGFzaCgnc2hhMjU2JykudXBkYXRlKGlucHV0KS5kaWdlc3QoJ2hleCcpO1xufTtcblxuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbmNvbnN0IGdldENhY2hlZEhvdXNlRGF0YSA9IGFzeW5jIChjYWNoZUtleTogc3RyaW5nKTogUHJvbWlzZTxhbnkgfCBudWxsPiA9PiB7XG4gIGNvbnN0IE5BVEFMX0NIQVJUX1RBQkxFX05BTUUgPSBwcm9jZXNzLmVudi5OQVRBTF9DSEFSVF9UQUJMRV9OQU1FITtcblxuICB0cnkge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKFxuICAgICAgbmV3IEdldENvbW1hbmQoe1xuICAgICAgICBUYWJsZU5hbWU6IE5BVEFMX0NIQVJUX1RBQkxFX05BTUUsXG4gICAgICAgIEtleToge1xuICAgICAgICAgIHVzZXJJZDogYENBQ0hFIyR7Y2FjaGVLZXl9YCxcbiAgICAgICAgICBjaGFydFR5cGU6ICdob3VzZV9jYWNoZScsXG4gICAgICAgIH0sXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgaWYgKHJlc3VsdC5JdGVtKSB7XG4gICAgICBjb25zb2xlLmluZm8oJ0NhY2hlIGhpdCBmb3IgaG91c2UgY2FsY3VsYXRpb25zJyk7XG4gICAgICByZXR1cm4gcmVzdWx0Lkl0ZW0uaG91c2VEYXRhO1xuICAgIH1cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciByZXRyaWV2aW5nIGNhY2hlZCBkYXRhOicsIGVycm9yKTtcbiAgfVxuXG4gIHJldHVybiBudWxsO1xufTtcblxuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbmNvbnN0IHNhdmVDYWNoZWRIb3VzZURhdGEgPSBhc3luYyAoY2FjaGVLZXk6IHN0cmluZywgaG91c2VEYXRhOiBhbnkpOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgY29uc3QgTkFUQUxfQ0hBUlRfVEFCTEVfTkFNRSA9IHByb2Nlc3MuZW52Lk5BVEFMX0NIQVJUX1RBQkxFX05BTUUhO1xuXG4gIHRyeSB7XG4gICAgY29uc3QgdHRsID0gTWF0aC5mbG9vcihEYXRlLm5vdygpIC8gMTAwMCkgKyAzMCAqIDI0ICogNjAgKiA2MDsgLy8gMzAgZGF5cyBUVExcblxuICAgIGF3YWl0IGRvY0NsaWVudC5zZW5kKFxuICAgICAgbmV3IFB1dENvbW1hbmQoe1xuICAgICAgICBUYWJsZU5hbWU6IE5BVEFMX0NIQVJUX1RBQkxFX05BTUUsXG4gICAgICAgIEl0ZW06IHtcbiAgICAgICAgICB1c2VySWQ6IGBDQUNIRSMke2NhY2hlS2V5fWAsXG4gICAgICAgICAgY2hhcnRUeXBlOiAnaG91c2VfY2FjaGUnLFxuICAgICAgICAgIGhvdXNlRGF0YSxcbiAgICAgICAgICB0dGwsXG4gICAgICAgICAgY3JlYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICAgIH0sXG4gICAgICB9KSxcbiAgICApO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHNhdmluZyBjYWNoZWQgZGF0YTonLCBlcnJvcik7XG4gIH1cbn07XG5cbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5leHBvcnQgY29uc3QgaGFuZGxlciA9IGFzeW5jIChldmVudDogYW55KTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gIGNvbnN0IE5BVEFMX0NIQVJUX1RBQkxFX05BTUUgPSBwcm9jZXNzLmVudi5OQVRBTF9DSEFSVF9UQUJMRV9OQU1FITtcbiAgY29uc29sZS5pbmZvKCdSZWNlaXZlZCBldmVudDonLCBKU09OLnN0cmluZ2lmeShldmVudCwgbnVsbCwgMikpO1xuXG4gIGNvbnN0IHZhbGlkYXRlZEV2ZW50ID0gdmFsaWRhdGVFdmVudChldmVudCk7XG4gIGNvbnN0IHsgdXNlcklkLCBiaXJ0aERhdGUsIGxhdGl0dWRlLCBsb25naXR1ZGUsIGlhbmFUaW1lWm9uZSB9ID0gdmFsaWRhdGVkRXZlbnQ7XG5cbiAgLy8gQmlydGggdGltZSBpcyBub3cgcmVxdWlyZWQgcGVyIEtBTi03XG4gIGlmICghdmFsaWRhdGVkRXZlbnQuYmlydGhUaW1lKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdCaXJ0aCB0aW1lIGlzIHJlcXVpcmVkIGZvciBob3VzZSBjYWxjdWxhdGlvbnMnKTtcbiAgfVxuXG4gIGNvbnN0IGJpcnRoVGltZSA9IHZhbGlkYXRlZEV2ZW50LmJpcnRoVGltZTtcbiAgY29uc3QgaXNUaW1lRXN0aW1hdGVkID0gZmFsc2U7IC8vIFNpbmNlIGJpcnRoIHRpbWUgaXMgbm93IHJlcXVpcmVkXG5cbiAgLy8gQ3JlYXRlIGEgZGF0ZSBvYmplY3QgdGhhdCByZXByZXNlbnRzIHRoZSBsb2NhbCB0aW1lIGF0IHRoZSBiaXJ0aCBsb2NhdGlvblxuICBjb25zdCBiaXJ0aERhdGVUaW1lU3RyID0gYCR7YmlydGhEYXRlfVQke2JpcnRoVGltZX06MDBgO1xuICBjb25zdCBiaXJ0aERhdGVUaW1lID0gbmV3IERhdGUoYmlydGhEYXRlVGltZVN0cik7XG5cbiAgLy8gQ2FsY3VsYXRlIHRpbWV6b25lIG9mZnNldFxuICBjb25zdCB0aW1lem9uZU9mZnNldEluSG91cnMgPVxuICAgIG5ldyBEYXRlKFxuICAgICAgYmlydGhEYXRlVGltZS50b0xvY2FsZVN0cmluZygnZW4tVVMnLCB7IHRpbWVab25lOiBpYW5hVGltZVpvbmUgfSksXG4gICAgKS5nZXRUaW1lem9uZU9mZnNldCgpIC8gLTYwO1xuXG4gIHRyeSB7XG4gICAgLy8gQ2FsY3VsYXRlIHBsYW5ldGFyeSBwb3NpdGlvbnMgdXNpbmcgZXhpc3RpbmcgZXBoZW1lcmlzIGxpYnJhcnlcbiAgICBjb25zdCBjaGFydERhdGEgPSBnZXRBbGxQbGFuZXRzKGJpcnRoRGF0ZVRpbWUsIGxvbmdpdHVkZSwgbGF0aXR1ZGUsIHRpbWV6b25lT2Zmc2V0SW5Ib3Vycyk7XG5cbiAgICAvLyBFeHRyYWN0IHBsYW5ldGFyeSBwb3NpdGlvbnMgZnJvbSB0aGUgb2JzZXJ2ZWQgbmFtZXNwYWNlXG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICBjb25zdCBwbGFuZXRzOiBSZWNvcmQ8c3RyaW5nLCBhbnk+ID0ge307XG4gICAgaWYgKGNoYXJ0RGF0YS5vYnNlcnZlZCkge1xuICAgICAgT2JqZWN0LmtleXMoY2hhcnREYXRhLm9ic2VydmVkKS5mb3JFYWNoKChwbGFuZXROYW1lKSA9PiB7XG4gICAgICAgIGNvbnN0IHBsYW5ldERhdGEgPSBjaGFydERhdGEub2JzZXJ2ZWRbcGxhbmV0TmFtZV07XG4gICAgICAgIGlmIChwbGFuZXREYXRhICYmIHBsYW5ldE5hbWUgIT09ICdzaXJpdXMnKSB7XG4gICAgICAgICAgY29uc3QgbG9uZ2l0dWRlID0gcGxhbmV0RGF0YS5hcHBhcmVudExvbmdpdHVkZURkIHx8IDA7XG4gICAgICAgICAgLy8gQ2FsY3VsYXRlIHpvZGlhYyBzaWduIGluZm9ybWF0aW9uXG4gICAgICAgICAgY29uc3Qgbm9ybWFsaXplZExvbmdpdHVkZSA9ICgobG9uZ2l0dWRlICUgMzYwKSArIDM2MCkgJSAzNjA7XG4gICAgICAgICAgY29uc3Qgc2lnbkluZGV4ID0gTWF0aC5mbG9vcihub3JtYWxpemVkTG9uZ2l0dWRlIC8gMzApO1xuICAgICAgICAgIGNvbnN0IHNpZ24gPSBaT0RJQUNfU0lHTlNbc2lnbkluZGV4XTtcbiAgICAgICAgICBjb25zdCBkZWdyZWVJblNpZ24gPSBub3JtYWxpemVkTG9uZ2l0dWRlIC0gc2lnbkluZGV4ICogMzA7XG4gICAgICAgICAgY29uc3Qgd2hvbGVEZWdyZWVzID0gTWF0aC5mbG9vcihkZWdyZWVJblNpZ24pO1xuICAgICAgICAgIGNvbnN0IG1pbnV0ZXMgPSBNYXRoLnJvdW5kKChkZWdyZWVJblNpZ24gLSB3aG9sZURlZ3JlZXMpICogNjApO1xuXG4gICAgICAgICAgcGxhbmV0c1twbGFuZXROYW1lXSA9IHtcbiAgICAgICAgICAgIGxvbmdpdHVkZTogbG9uZ2l0dWRlLFxuICAgICAgICAgICAgbG9uZ2l0dWRlRG1zOiBgJHt3aG9sZURlZ3JlZXMudG9TdHJpbmcoKS5wYWRTdGFydCgyLCAnMCcpfcKwJHttaW51dGVzLnRvU3RyaW5nKCkucGFkU3RhcnQoMiwgJzAnKX0nICR7c2lnbn1gLFxuICAgICAgICAgICAgZGlzdGFuY2VLbTogcGxhbmV0RGF0YS5nZW9jZW50cmljRGlzdGFuY2VLbSB8fCAwLFxuICAgICAgICAgICAgbmFtZTogcGxhbmV0RGF0YS5uYW1lIHx8IHBsYW5ldE5hbWUsXG4gICAgICAgICAgICBzaWduOiBzaWduLFxuICAgICAgICAgICAgZGVncmVlSW5TaWduOiB3aG9sZURlZ3JlZXMsXG4gICAgICAgICAgICBtaW51dGVzOiBtaW51dGVzLFxuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIENoZWNrIGNhY2hlIGZvciBob3VzZSBjYWxjdWxhdGlvbnNcbiAgICBjb25zdCBjYWNoZUtleSA9IGdlbmVyYXRlQ2FjaGVLZXkoYmlydGhEYXRlLCBiaXJ0aFRpbWUsIGxhdGl0dWRlLCBsb25naXR1ZGUpO1xuICAgIGxldCBob3VzZURhdGEgPSBhd2FpdCBnZXRDYWNoZWRIb3VzZURhdGEoY2FjaGVLZXkpO1xuXG4gICAgaWYgKCFob3VzZURhdGEpIHtcbiAgICAgIC8vIENhbGN1bGF0ZSBob3VzZXMgdXNpbmcgU3dpc3MgRXBoZW1lcmlzXG4gICAgICBob3VzZURhdGEgPSBhd2FpdCBjYWxjdWxhdGVIb3VzZXNXaXRoU3dpc3NlcGgoYmlydGhEYXRlVGltZSwgbGF0aXR1ZGUsIGxvbmdpdHVkZSk7XG5cbiAgICAgIGlmIChob3VzZURhdGEpIHtcbiAgICAgICAgLy8gU2F2ZSB0byBjYWNoZVxuICAgICAgICBhd2FpdCBzYXZlQ2FjaGVkSG91c2VEYXRhKGNhY2hlS2V5LCBob3VzZURhdGEpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFByZXBhcmUgdGhlIGl0ZW0gdG8gc3RvcmVcbiAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgIGNvbnN0IGl0ZW06IGFueSA9IHtcbiAgICAgIHVzZXJJZCxcbiAgICAgIGNoYXJ0VHlwZTogJ25hdGFsJyxcbiAgICAgIGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgaXNUaW1lRXN0aW1hdGVkLFxuICAgICAgYmlydGhJbmZvOiB7XG4gICAgICAgIC4uLnZhbGlkYXRlZEV2ZW50LFxuICAgICAgICBiaXJ0aFRpbWUsXG4gICAgICB9LFxuICAgICAgcGxhbmV0cyxcbiAgICAgIG1ldGFkYXRhOiB7XG4gICAgICAgIGNhbGN1bGF0aW9uVGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICAgIGVwaGVtZXJpc1ZlcnNpb246ICcyLjEwLjAzJyxcbiAgICAgICAgc3dldGVzdFZlcnNpb246ICcyLjEwLjAzJyxcbiAgICAgICAgaG91c2VTeXN0ZW06ICdwbGFjaWR1cycsXG4gICAgICAgIHpvZGlhY1R5cGU6ICd0cm9waWNhbCcsXG4gICAgICAgIHNjaGVtYVZlcnNpb246ICcyLjAuMCcsIC8vIFRyYWNrIHNjaGVtYSB2ZXJzaW9uIGZvciBuZXcgY2VsZXN0aWFsIGJvZGllc1xuICAgICAgfSxcbiAgICB9O1xuXG4gICAgLy8gQWRkIGhvdXNlIGRhdGEgaWYgYXZhaWxhYmxlXG4gICAgaWYgKGhvdXNlRGF0YSkge1xuICAgICAgaXRlbS5ob3VzZXMgPSB7XG4gICAgICAgIHN0YXR1czogJ3N1Y2Nlc3MnLFxuICAgICAgICBkYXRhOiBob3VzZURhdGEuaG91c2VzLFxuICAgICAgfTtcbiAgICAgIGl0ZW0uYXNjZW5kYW50ID0gaG91c2VEYXRhLmFzY2VuZGFudDtcbiAgICAgIGl0ZW0ubWlkaGVhdmVuID0gaG91c2VEYXRhLm1pZGhlYXZlbjtcbiAgICAgIGl0ZW0ucGxhbmV0SG91c2VzID0gaG91c2VEYXRhLnBsYW5ldEhvdXNlcztcblxuICAgICAgLy8gQ2FsY3VsYXRlIGFuZCBhZGQgYWRkaXRpb25hbCBhbmd1bGFyIHBvaW50c1xuICAgICAgY29uc29sZS5pbmZvKCdDYWxjdWxhdGluZyBhZGRpdGlvbmFsIGFuZ3VsYXIgcG9pbnRzIChEZXNjZW5kYW50LCBJQyknKTtcbiAgICAgIGNvbnN0IGRlcml2ZWRBbmdsZXMgPSBjYWxjdWxhdGVEZXJpdmVkQW5nbGVzKGhvdXNlRGF0YS5hc2NlbmRhbnQsIGhvdXNlRGF0YS5taWRoZWF2ZW4pO1xuXG4gICAgICAvLyBDYWxjdWxhdGUgUGFydCBvZiBGb3J0dW5lIChyZXF1aXJlcyBTdW4gYW5kIE1vb24gcG9zaXRpb25zKVxuICAgICAgY29uc29sZS5pbmZvKCdDYWxjdWxhdGluZyBQYXJ0IG9mIEZvcnR1bmUnKTtcbiAgICAgIGxldCBwYXJ0T2ZGb3J0dW5lOiBDZWxlc3RpYWxCb2R5RGF0YSB8IHVuZGVmaW5lZDtcbiAgICAgIGlmIChwbGFuZXRzLnN1biAmJiBwbGFuZXRzLm1vb24pIHtcbiAgICAgICAgcGFydE9mRm9ydHVuZSA9IGNhbGN1bGF0ZVBhcnRPZkZvcnR1bmUoXG4gICAgICAgICAgaG91c2VEYXRhLmFzY2VuZGFudC5kZWdyZWUsXG4gICAgICAgICAgcGxhbmV0cy5tb29uLmxvbmdpdHVkZSxcbiAgICAgICAgICBwbGFuZXRzLnN1bi5sb25naXR1ZGUsXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIC8vIENhbGN1bGF0ZSBsdW5hciBub2Rlc1xuICAgICAgY29uc29sZS5pbmZvKCdDYWxjdWxhdGluZyBsdW5hciBub2RlcycpO1xuICAgICAgY29uc3QgbHVuYXJOb2RlcyA9IGNhbGN1bGF0ZUx1bmFyTm9kZXMoaG91c2VEYXRhLmp1bGlhbkRheSk7XG5cbiAgICAgIC8vIEJ1aWxkIGFkZGl0aW9uYWxQb2ludHMgb2JqZWN0XG4gICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgY29uc3QgYWRkaXRpb25hbFBvaW50czogYW55ID0ge1xuICAgICAgICBkZXNjZW5kYW50OiBkZXJpdmVkQW5nbGVzLmRlc2NlbmRhbnQsXG4gICAgICAgIGltdW1Db2VsaTogZGVyaXZlZEFuZ2xlcy5pbXVtQ29lbGksXG4gICAgICB9O1xuXG4gICAgICBpZiAocGFydE9mRm9ydHVuZSkge1xuICAgICAgICBhZGRpdGlvbmFsUG9pbnRzLnBhcnRPZkZvcnR1bmUgPSBwYXJ0T2ZGb3J0dW5lO1xuICAgICAgfVxuXG4gICAgICBpZiAoaG91c2VEYXRhLnZlcnRleCkge1xuICAgICAgICBhZGRpdGlvbmFsUG9pbnRzLnZlcnRleCA9IGhvdXNlRGF0YS52ZXJ0ZXg7XG4gICAgICB9XG5cbiAgICAgIGlmIChsdW5hck5vZGVzKSB7XG4gICAgICAgIGFkZGl0aW9uYWxQb2ludHMubm9ydGhOb2RlID0gbHVuYXJOb2Rlcy5ub3J0aE5vZGU7XG4gICAgICAgIGFkZGl0aW9uYWxQb2ludHMuc291dGhOb2RlID0gbHVuYXJOb2Rlcy5zb3V0aE5vZGU7XG4gICAgICB9XG5cbiAgICAgIGl0ZW0uYWRkaXRpb25hbFBvaW50cyA9IGFkZGl0aW9uYWxQb2ludHM7XG5cbiAgICAgIC8vIENhbGN1bGF0ZSBhc3Rlcm9pZHNcbiAgICAgIGNvbnNvbGUuaW5mbygnQ2FsY3VsYXRpbmcgYXN0ZXJvaWRzJyk7XG4gICAgICBjb25zdCBhc3Rlcm9pZHMgPSBjYWxjdWxhdGVBc3Rlcm9pZHMoaG91c2VEYXRhLmp1bGlhbkRheSk7XG4gICAgICBpZiAoYXN0ZXJvaWRzKSB7XG4gICAgICAgIGl0ZW0uYXN0ZXJvaWRzID0gYXN0ZXJvaWRzO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBpdGVtLmhvdXNlcyA9IHtcbiAgICAgICAgc3RhdHVzOiAnZmFpbGVkJyxcbiAgICAgICAgZXJyb3I6ICdIb3VzZSBjYWxjdWxhdGlvbnMgdW5hdmFpbGFibGUnLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBTdG9yZSB0aGUgbmF0YWwgY2hhcnRcbiAgICBhd2FpdCBkb2NDbGllbnQuc2VuZChcbiAgICAgIG5ldyBQdXRDb21tYW5kKHtcbiAgICAgICAgVGFibGVOYW1lOiBOQVRBTF9DSEFSVF9UQUJMRV9OQU1FLFxuICAgICAgICBJdGVtOiBpdGVtLFxuICAgICAgfSksXG4gICAgKTtcblxuICAgIGNvbnNvbGUuaW5mbyhgU3VjY2Vzc2Z1bGx5IGdlbmVyYXRlZCBhbmQgc3RvcmVkIG5hdGFsIGNoYXJ0IGZvciB1c2VySWQ6ICR7dXNlcklkfWApO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGNhbGN1bGF0aW5nIG9yIHN0b3JpbmcgbmF0YWwgY2hhcnQ6JywgZXJyb3IpO1xuICAgIHRocm93IGVycm9yO1xuICB9XG59O1xuIl19