import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { getAllPlanets } from 'ephemeris';
import * as crypto from 'crypto';
import { DateTime } from 'luxon';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Import swisseph from the Lambda Layer
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let swisseph: any;
let ephemerisPath: string | undefined;

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
          const seFiles = files.filter(
            (f: string) => f.endsWith('.se1') || f === 'seleapsec.txt' || f === 'seorbel.txt',
          );
          console.info('Ephemeris files found:', seFiles.length, 'files:', seFiles.slice(0, 5));
        } else {
          console.error('Ephemeris directory does not exist:', ephemerisPath);
        }

        return; // Successfully loaded from environment
      } catch (e) {
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
      } else if (process.env.EPHEMERIS_PATH) {
        ephemerisPath = process.env.EPHEMERIS_PATH;
      } else if (modulePath.startsWith('/opt')) {
        ephemerisPath = '/opt/nodejs/node_modules/swisseph/ephe';
      } else if (modulePath.includes('layers/swetest')) {
        ephemerisPath = path.join(modulePath, 'ephe');
      } else {
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
        const seFiles = files.filter(
          (f: string) => f.endsWith('.se1') || f === 'seleapsec.txt' || f === 'seorbel.txt',
        );
        console.info('Ephemeris files found:', seFiles.length, 'files:', seFiles.slice(0, 5));
      } else {
        console.error('Ephemeris directory does not exist:', ephemerisPath);
      }

      // Successfully loaded
      break;
    } catch (_error) {
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

interface NatalChartEvent {
  userId: string;
  birthDate: string; // YYYY-MM-DD
  birthTime?: string; // HH:MM
  latitude: number;
  longitude: number;
  ianaTimeZone: string;
}

interface HouseData {
  houseNumber: number;
  cuspDegree: number;
  cuspSign: string;
  cuspDegreeInSign: number;
  cuspMinutes: number;
}

interface AngleData {
  degree: number;
  sign: string;
  degreeInSign: number;
  minutes: number;
}

interface CelestialBodyData {
  degree: number;
  sign: string;
  degreeInSign: number;
  minutes: number;
  name: string;
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const validateEvent = (event: any): NatalChartEvent => {
  if (
    !event.userId ||
    !event.birthDate ||
    !event.latitude ||
    !event.longitude ||
    !event.ianaTimeZone
  ) {
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

const getDegreeInfo = (degree: number): { sign: string; degreeInSign: number; minutes: number } => {
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
const calculateDerivedAngles = (
  ascendant: AngleData,
  midheaven: AngleData,
): { descendant: AngleData; imumCoeli: AngleData } => {
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
const calculatePartOfFortune = (
  ascendantDegree: number,
  moonLongitude: number,
  sunLongitude: number,
): CelestialBodyData => {
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
const calculateLunarNodes = (
  julianDay: number,
): { northNode: CelestialBodyData; southNode: CelestialBodyData } | null => {
  if (!swisseph) {
    console.warn('Swiss Ephemeris not available, skipping lunar nodes calculation');
    return null;
  }

  try {
    // Calculate True North Node
    const northNodeData = swisseph.swe_calc_ut(
      julianDay,
      swisseph.SE_TRUE_NODE,
      swisseph.SEFLG_SPEED,
    );

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
  } catch (error) {
    console.error('Error calculating lunar nodes:', error);
    return null;
  }
};

/**
 * Calculate asteroids and minor celestial bodies
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const calculateAsteroids = (julianDay: number): any | null => {
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
    const asteroids: any = {};

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
            name: asteroidNames[key as keyof typeof asteroidNames],
          };
        } else {
          console.warn(`Failed to calculate asteroid: ${key}`);
          // Set default/placeholder data for missing asteroids
          asteroids[key] = {
            degree: 0,
            sign: 'Unknown',
            degreeInSign: 0,
            minutes: 0,
            name: asteroidNames[key as keyof typeof asteroidNames],
          };
        }
      } catch (error) {
        console.error(`Error calculating asteroid ${key}:`, error);
        // Continue with next asteroid on error
        asteroids[key] = {
          degree: 0,
          sign: 'Unknown',
          degreeInSign: 0,
          minutes: 0,
          name: asteroidNames[key as keyof typeof asteroidNames],
        };
      }
    }

    return asteroids;
  } catch (error) {
    console.error('Error calculating asteroids:', error);
    return null;
  }
};

const calculateHousesWithSwisseph = async (
  birthDateTime: Date,
  latitude: number,
  longitude: number,
): Promise<{
  houses: HouseData[];
  ascendant: AngleData;
  midheaven: AngleData;
  planetHouses: Record<string, number>;
  vertex?: AngleData;
  julianDay: number;
} | null> => {
  if (!swisseph) {
    console.warn('Swiss Ephemeris not available, skipping house calculations');
    return null;
  }

  try {
    // Set ephemeris path explicitly
    const ephePath =
      ephemerisPath ||
      process.env.SE_EPHE_PATH ||
      process.env.EPHEMERIS_PATH ||
      '/opt/nodejs/node_modules/swisseph/ephe';
    swisseph.swe_set_ephe_path(ephePath);
    console.info('Setting ephemeris path for house calculations:', ephePath);

    // Calculate Julian Day
    const year = birthDateTime.getUTCFullYear();
    const month = birthDateTime.getUTCMonth() + 1;
    const day = birthDateTime.getUTCDate();
    const hour =
      birthDateTime.getUTCHours() +
      birthDateTime.getUTCMinutes() / 60 +
      birthDateTime.getUTCSeconds() / 3600;

    const julianDay = swisseph.swe_julday(year, month, day, hour, swisseph.SE_GREG_CAL);

    // Calculate houses using Placidus system
    const houseData = swisseph.swe_houses(
      julianDay,
      latitude,
      longitude,
      'P', // Placidus house system
    );

    if (!houseData || !houseData.house || !houseData.ascendant || !houseData.mc) {
      throw new Error('Failed to calculate houses');
    }

    // Process house cusps
    const houses: HouseData[] = [];
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
    const ascendant: AngleData = {
      degree: houseData.ascendant,
      sign: ascInfo.sign,
      degreeInSign: ascInfo.degreeInSign,
      minutes: ascInfo.minutes,
    };

    // Process Midheaven
    const mcInfo = getDegreeInfo(houseData.mc);
    const midheaven: AngleData = {
      degree: houseData.mc,
      sign: mcInfo.sign,
      degreeInSign: mcInfo.degreeInSign,
      minutes: mcInfo.minutes,
    };

    // Extract Vertex if available
    let vertex: AngleData | undefined;
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
    const planetHouses: Record<string, number> = {};
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
          } else {
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
  } catch (error) {
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
const generateCacheKey = (
  birthDate: string,
  birthTime: string,
  latitude: number,
  longitude: number,
): string => {
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
    .map((key) => `"${key}":${JSON.stringify(cacheData[key as keyof typeof cacheData])}`)
    .join(',');
  const input = `{${stableJson}}`;

  return crypto.createHash('sha256').update(input).digest('hex');
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getCachedHouseData = async (cacheKey: string): Promise<any | null> => {
  const NATAL_CHART_TABLE_NAME = process.env.NATAL_CHART_TABLE_NAME!;

  try {
    const result = await docClient.send(
      new GetCommand({
        TableName: NATAL_CHART_TABLE_NAME,
        Key: {
          userId: `CACHE#${cacheKey}`,
          chartType: 'house_cache',
        },
      }),
    );

    if (result.Item) {
      console.info('Cache hit for house calculations');
      return result.Item.houseData;
    }
  } catch (error) {
    console.error('Error retrieving cached data:', error);
  }

  return null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const saveCachedHouseData = async (cacheKey: string, houseData: any): Promise<void> => {
  const NATAL_CHART_TABLE_NAME = process.env.NATAL_CHART_TABLE_NAME!;

  try {
    const ttl = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 days TTL

    await docClient.send(
      new PutCommand({
        TableName: NATAL_CHART_TABLE_NAME,
        Item: {
          userId: `CACHE#${cacheKey}`,
          chartType: 'house_cache',
          houseData,
          ttl,
          createdAt: new Date().toISOString(),
        },
      }),
    );
  } catch (error) {
    console.error('Error saving cached data:', error);
  }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const handler = async (event: any): Promise<void> => {
  const NATAL_CHART_TABLE_NAME = process.env.NATAL_CHART_TABLE_NAME!;
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
  const birthDateTimeLocal = DateTime.fromISO(birthDateTimeStr, { zone: ianaTimeZone });

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
    const chartData = getAllPlanets(birthDateTime, longitude, latitude, timezoneOffsetInHours);

    // Extract planetary positions from the observed namespace
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const planets: Record<string, any> = {};
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
    const item: any = {
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
      let partOfFortune: CelestialBodyData | undefined;
      if (planets.sun && planets.moon) {
        partOfFortune = calculatePartOfFortune(
          houseData.ascendant.degree,
          planets.moon.longitude,
          planets.sun.longitude,
        );
      }

      // Calculate lunar nodes
      console.info('Calculating lunar nodes');
      const lunarNodes = calculateLunarNodes(houseData.julianDay);

      // Build additionalPoints object
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const additionalPoints: any = {
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
    } else {
      item.houses = {
        status: 'failed',
        error: 'House calculations unavailable',
      };
    }

    // Store the natal chart
    await docClient.send(
      new PutCommand({
        TableName: NATAL_CHART_TABLE_NAME,
        Item: item,
      }),
    );

    console.info(`Successfully generated and stored natal chart for userId: ${userId}`);
  } catch (error) {
    console.error('Error calculating or storing natal chart:', error);
    throw error;
  }
};
