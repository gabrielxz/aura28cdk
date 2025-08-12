import { handler } from '../lambda/natal-chart/generate-natal-chart';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
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

// Mock the swisseph module (from Lambda Layer)
jest.mock('/opt/nodejs/node_modules/swisseph', () => null, { virtual: true });
jest.mock('swisseph', () => null, { virtual: true });

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

    ddbMock.on(GetCommand).resolves({}); // Cache miss
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
            longitude: 10,
            name: 'sun',
            sign: 'Aries',
          }),
          moon: expect.objectContaining({
            longitude: 45.5,
            name: 'moon',
            sign: 'Taurus',
          }),
        }),
      }),
    });
  });

  it('should throw an error if birth time is missing', async () => {
    const event = {
      userId: 'test-user-2',
      birthDate: '1995-05-15',
      latitude: 40.7128,
      longitude: -74.006,
      ianaTimeZone: 'America/New_York',
    };

    await expect(handler(event)).rejects.toThrow('Birth time is required for house calculations');
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
