import { handler } from '../lambda/natal-chart/generate-natal-chart';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';

// Mock the ephemeris library
jest.mock('ephemeris', () => ({
  getAllPlanets: jest.fn(() => ({
    observed: {
      sun: {
        apparentLongitudeDd: 10.0,
        apparentLongitudeDms360: '10°00\'00"',
        geocentricDistanceKm: 149597870.7,
        name: 'sun',
      },
      moon: {
        apparentLongitudeDd: 45.5,
        apparentLongitudeDms360: '45°30\'00"',
        geocentricDistanceKm: 384400,
        name: 'moon',
      },
    },
  })),
}));

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('Generate Natal Chart Lambda', () => {
  beforeEach(() => {
    ddbMock.reset();
    process.env.NATAL_CHART_TABLE_NAME = 'TestNatalChartTable';
  });

  it('should calculate and store a natal chart with a provided birth time', async () => {
    const event = {
      userId: 'test-user-1',
      birthDate: '1990-01-01',
      birthTime: '12:00',
      latitude: 34.0522,
      longitude: -118.2437,
      ianaTimeZone: 'America/Los_Angeles',
    };

    ddbMock.on(PutCommand).resolves({});

    await handler(event);

    expect(ddbMock).toHaveReceivedCommandWith(PutCommand, {
      TableName: 'TestNatalChartTable',
      Item: expect.objectContaining({
        userId: 'test-user-1',
        isTimeEstimated: false,
        chartType: 'natal',
        planets: expect.objectContaining({
          sun: expect.objectContaining({
            longitude: 10.0,
            longitudeDms: '10°00\'00"',
            name: 'sun',
          }),
          moon: expect.objectContaining({
            longitude: 45.5,
            longitudeDms: '45°30\'00"',
            name: 'moon',
          }),
        }),
      }),
    });
  });

  it('should calculate and store a natal chart with a default birth time (noon)', async () => {
    const event = {
      userId: 'test-user-2',
      birthDate: '1995-05-15',
      latitude: 40.7128,
      longitude: -74.006,
      ianaTimeZone: 'America/New_York',
    };

    ddbMock.on(PutCommand).resolves({});

    await handler(event);

    expect(ddbMock).toHaveReceivedCommandWith(PutCommand, {
      TableName: 'TestNatalChartTable',
      Item: expect.objectContaining({
        userId: 'test-user-2',
        isTimeEstimated: true,
      }),
    });
  });

  it('should throw an error if userId is missing', async () => {
    const event = {
      birthDate: '1990-01-01',
      birthTime: '12:00',
      latitude: 34.0522,
      longitude: -118.2437,
      ianaTimeZone: 'America/Los_Angeles',
    };

    await expect(handler(event)).rejects.toThrow('Missing required event properties');
  });
});
