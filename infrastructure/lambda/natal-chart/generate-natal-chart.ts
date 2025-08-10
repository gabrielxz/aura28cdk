import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { getAllPlanets } from 'ephemeris';
import * as crypto from 'crypto';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Import swisseph from the Lambda Layer
let swisseph: any;
try {
  swisseph = require('/opt/nodejs/node_modules/swisseph');
} catch (_error) {
  console.warn('Swiss Ephemeris not available from layer, falling back to local if available');
  try {
    swisseph = require('swisseph');
  } catch (_e) {
    console.error('Swiss Ephemeris not available');
  }
}

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

const calculateHousesWithSwisseph = async (
  birthDateTime: Date,
  latitude: number,
  longitude: number,
): Promise<{
  houses: HouseData[];
  ascendant: AngleData;
  midheaven: AngleData;
  planetHouses: Record<string, number>;
} | null> => {
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

const generateCacheKey = (
  birthDate: string,
  birthTime: string,
  latitude: number,
  longitude: number,
): string => {
  const input = `${birthDate}T${birthTime}:00Z_${latitude}_${longitude}_placidus_tropical_v2.10.03`;
  return crypto.createHash('sha256').update(input).digest('hex');
};

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
      console.log('Cache hit for house calculations');
      return result.Item.houseData;
    }
  } catch (error) {
    console.error('Error retrieving cached data:', error);
  }

  return null;
};

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

export const handler = async (event: any): Promise<void> => {
  const NATAL_CHART_TABLE_NAME = process.env.NATAL_CHART_TABLE_NAME!;
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
  const timezoneOffsetInHours =
    new Date(birthDateTime.toLocaleString('en-US', { timeZone: ianaTimeZone })).getTimezoneOffset() /
    -60;

  try {
    // Calculate planetary positions using existing ephemeris library
    const chartData = getAllPlanets(birthDateTime, longitude, latitude, timezoneOffsetInHours);

    // Extract planetary positions from the observed namespace
    const planets: Record<string, any> = {};
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

    console.log(`Successfully generated and stored natal chart for userId: ${userId}`);
  } catch (error) {
    console.error('Error calculating or storing natal chart:', error);
    throw error;
  }
};