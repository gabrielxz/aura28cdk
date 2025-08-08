import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { getAllPlanets } from 'ephemeris';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

interface NatalChartEvent {
  userId: string;
  birthDate: string; // YYYY-MM-DD
  birthTime?: string; // HH:MM
  latitude: number;
  longitude: number;
  ianaTimeZone: string;
}

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
  return event;
};

export const handler = async (event: any): Promise<void> => {
  const NATAL_CHART_TABLE_NAME = process.env.NATAL_CHART_TABLE_NAME!;
  console.log('Received event:', JSON.stringify(event, null, 2));

  const validatedEvent = validateEvent(event);
  const { userId, birthDate, latitude, longitude, ianaTimeZone } = validatedEvent;

  const isTimeEstimated = !validatedEvent.birthTime;
  const birthTime = validatedEvent.birthTime || '12:00';

  // The ephemeris library expects date and time to be combined.
  // It also needs the timezone offset. We can create a date object
  // in the target timezone and then get the UTC offset.
  const birthDateTimeStr = `${birthDate}T${birthTime}:00`;

  // Create a date object that represents the local time at the birth location
  const tempDate = new Date(birthDateTimeStr);

  // This is a simplified way to get timezone offset. A robust solution would use a library
  // that handles historical timezone changes, but for this scope, this is sufficient.
  const timezoneOffsetInHours =
    new Date(tempDate.toLocaleString('en-US', { timeZone: ianaTimeZone })).getTimezoneOffset() /
    -60;

  try {
    const chartData = getAllPlanets(birthDateTimeStr, longitude, latitude, timezoneOffsetInHours);

    const item = {
      userId,
      chartType: 'natal',
      createdAt: new Date().toISOString(),
      isTimeEstimated,
      birthInfo: {
        ...validatedEvent,
        birthTime, // ensure birthTime is stored even if estimated
      },
      planets: chartData.planets,
      houses: chartData.houses,
    };

    await docClient.send(
      new PutCommand({
        TableName: NATAL_CHART_TABLE_NAME,
        Item: item,
      }),
    );

    console.log(`Successfully generated and stored natal chart for userId: ${userId}`);
  } catch (error) {
    console.error('Error calculating or storing natal chart:', error);
    // Depending on requirements, might add to a DLQ or re-throw
    throw error;
  }
};
