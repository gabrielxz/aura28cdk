import { handler } from '../lambda/natal-chart/generate-natal-chart';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';

// Mock the ephemeris library
jest.mock('ephemeris', () => ({
  getAllPlanets: jest.fn(() => ({
    planets: { sun: { longitude: 10.0 } },
    houses: { '1': { longitude: 20.0 } },
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
        planets: { sun: { longitude: 10 } },
        houses: { '1': { longitude: 20 } },
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
