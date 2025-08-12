import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import * as crypto from 'crypto';
import { calculateChartWithSwisseph } from './calculator.js';
import { ChartData, NatalChartEvent } from './types.js';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const generateCacheKey = (
  birthDate: string,
  birthTime: string,
  latitude: number,
  longitude: number,
): string => {
  const input = `${birthDate}T${birthTime}:00Z_${latitude}_${longitude}_placidus_tropical_v2.10.03_refactored`;
  return crypto.createHash('sha256').update(input).digest('hex');
};

const getCachedChartData = async (cacheKey: string): Promise<ChartData | null> => {
  const NATAL_CHART_TABLE_NAME = process.env.NATAL_CHART_TABLE_NAME!;
  try {
    const result = await docClient.send(
      new GetCommand({
        TableName: NATAL_CHART_TABLE_NAME,
        Key: { userId: `CACHE#${cacheKey}`, chartType: 'chart_cache' },
      }),
    );
    if (result.Item) {
      console.info('Cache hit for chart calculations');
      return result.Item.chartData as ChartData;
    }
  } catch (error) {
    console.error('Error retrieving cached data:', error);
  }
  return null;
};

const saveCachedChartData = async (cacheKey: string, chartData: ChartData): Promise<void> => {
  const NATAL_CHART_TABLE_NAME = process.env.NATAL_CHART_TABLE_NAME!;
  try {
    const ttl = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 days TTL
    await docClient.send(
      new PutCommand({
        TableName: NATAL_CHART_TABLE_NAME,
        Item: {
          userId: `CACHE#${cacheKey}`,
          chartType: 'chart_cache',
          chartData,
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
  console.info('Received event:', JSON.stringify(event, null, 2));

  const validatedEvent = validateEvent(event);
  const { userId, birthDate, latitude, longitude, ianaTimeZone } = validatedEvent;

  if (!validatedEvent.birthTime) {
    throw new Error('Birth time is required for house calculations');
  }

  const birthTime = validatedEvent.birthTime;

  try {
    const { fromZonedTime } = await import('date-fns-tz');
    const birthDateTimeStr = `${birthDate}T${birthTime}`;
    const birthDateTime = fromZonedTime(birthDateTimeStr, ianaTimeZone);

    const cacheKey = generateCacheKey(birthDate, birthTime, latitude, longitude);
    let chartData = await getCachedChartData(cacheKey);

    if (!chartData) {
      console.info('Cache miss. Calculating chart with Swiss Ephemeris.');
      chartData = calculateChartWithSwisseph(birthDateTime, latitude, longitude);
      if (chartData) {
        await saveCachedChartData(cacheKey, chartData);
      }
    }

    if (!chartData) {
      throw new Error('Failed to generate natal chart data.');
    }

    const item = {
      userId,
      chartType: 'natal',
      createdAt: new Date().toISOString(),
      isTimeEstimated: false,
      birthInfo: { ...validatedEvent },
      planets: chartData.planets,
      houses: { status: 'success', data: chartData.houses },
      ascendant: chartData.ascendant,
      midheaven: chartData.midheaven,
      planetHouses: Object.entries(chartData.planets).reduce(
        (acc, [name, data]: [string, { house: number }]) => {
          acc[name] = data.house;
          return acc;
        },
        {} as Record<string, number>,
      ),
      metadata: {
        calculationTimestamp: new Date().toISOString(),
        algoVersion: '2.1.0-refactored',
        swetestVersion: '2.10.03',
        inputHash: cacheKey,
      },
    };

    await docClient.send(
      new PutCommand({
        TableName: NATAL_CHART_TABLE_NAME,
        Item: item,
      }),
    );

    console.info(`Successfully generated and stored natal chart for userId: ${userId}`);
  } catch (error) {
    console.error('Error calculating or storing natal chart:', error);
  }
};

function validateEvent(event: any): NatalChartEvent {
  if (
    !event.userId ||
    !event.birthDate ||
    event.latitude === undefined ||
    event.longitude === undefined ||
    !event.ianaTimeZone
  ) {
    throw new Error('Missing required event properties');
  }
  if (event.latitude < -90 || event.latitude > 90) {
    throw new Error('Invalid latitude');
  }
  if (event.longitude < -180 || event.longitude > 180) {
    throw new Error('Invalid longitude');
  }
  return event;
}
