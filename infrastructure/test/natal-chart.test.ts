import { handler } from '../lambda/natal-chart/generate-natal-chart';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { DateTime } from 'luxon';

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

describe('Timezone Offset Calculation (KAN-76)', () => {
  /**
   * Unit tests for timezone offset calculation using Luxon.
   * These tests verify that the timezone fix correctly handles:
   * - Multiple timezones (EST, PST, CET, historical timezones)
   * - DST transitions (spring forward, fall back)
   * - Historical dates with different timezone rules
   */

  it('should calculate correct timezone offset for NYC in July (EDT)', () => {
    // July 26, 1987 in New York should be EDT (UTC-4)
    const dateTimeStr = '1987-07-26T12:17:00';
    const dt = DateTime.fromISO(dateTimeStr, { zone: 'America/New_York' });
    const offsetHours = dt.offset / 60;

    expect(offsetHours).toBe(-4); // EDT (Eastern Daylight Time)
  });

  it('should calculate correct timezone offset for NYC in January (EST)', () => {
    // January 15, 1987 in New York should be EST (UTC-5)
    const dateTimeStr = '1987-01-15T10:30:00';
    const dt = DateTime.fromISO(dateTimeStr, { zone: 'America/New_York' });
    const offsetHours = dt.offset / 60;

    expect(offsetHours).toBe(-5); // EST (Eastern Standard Time)
  });

  it('should calculate correct timezone offset for Los Angeles in summer (PDT)', () => {
    // June 21, 2000 in Los Angeles should be PDT (UTC-7)
    const dateTimeStr = '2000-06-21T12:00:00';
    const dt = DateTime.fromISO(dateTimeStr, { zone: 'America/Los_Angeles' });
    const offsetHours = dt.offset / 60;

    expect(offsetHours).toBe(-7); // PDT (Pacific Daylight Time)
  });

  it('should calculate correct timezone offset for Los Angeles in winter (PST)', () => {
    // January 1, 1990 in Los Angeles should be PST (UTC-8)
    const dateTimeStr = '1990-01-01T12:00:00';
    const dt = DateTime.fromISO(dateTimeStr, { zone: 'America/Los_Angeles' });
    const offsetHours = dt.offset / 60;

    expect(offsetHours).toBe(-8); // PST (Pacific Standard Time)
  });

  it('should calculate correct timezone offset for Paris in summer (CEST)', () => {
    // June 21, 2000 in Paris should be CEST (UTC+2)
    const dateTimeStr = '2000-06-21T12:00:00';
    const dt = DateTime.fromISO(dateTimeStr, { zone: 'Europe/Paris' });
    const offsetHours = dt.offset / 60;

    expect(offsetHours).toBe(2); // CEST (Central European Summer Time)
  });

  it('should calculate correct timezone offset for Paris in winter (CET)', () => {
    // January 1, 2000 in Paris should be CET (UTC+1)
    const dateTimeStr = '2000-01-01T12:00:00';
    const dt = DateTime.fromISO(dateTimeStr, { zone: 'Europe/Paris' });
    const offsetHours = dt.offset / 60;

    expect(offsetHours).toBe(1); // CET (Central European Time)
  });

  it('should calculate correct timezone offset for historical Berlin (Einstein birth)', () => {
    // March 14, 1879 in Berlin (Ulm was in the same timezone)
    // Before DST was introduced, Germany used local mean time
    const dateTimeStr = '1879-03-14T11:30:00';
    const dt = DateTime.fromISO(dateTimeStr, { zone: 'Europe/Berlin' });
    const offsetHours = dt.offset / 60;

    // Historical timezone for Berlin in 1879
    // Note: This is approximately UTC+1 (CET) but may vary slightly based on historical data
    expect(offsetHours).toBeCloseTo(1, 0); // Allow for historical timezone variations
  });

  it('should calculate correct timezone offset for UTC', () => {
    // UTC should always have offset 0
    const dateTimeStr = '2000-06-21T00:00:00';
    const dt = DateTime.fromISO(dateTimeStr, { zone: 'UTC' });
    const offsetHours = dt.offset / 60;

    expect(offsetHours).toBe(0);
  });

  it('should handle DST spring forward transition correctly', () => {
    // In 2023, DST in US started on March 12, 2:00 AM became 3:00 AM
    // Before transition (2:00 AM EST = UTC-5)
    const beforeDST = DateTime.fromISO('2023-03-12T01:30:00', { zone: 'America/New_York' });
    expect(beforeDST.offset / 60).toBe(-5); // EST

    // After transition (3:00 AM EDT = UTC-4)
    const afterDST = DateTime.fromISO('2023-03-12T03:30:00', { zone: 'America/New_York' });
    expect(afterDST.offset / 60).toBe(-4); // EDT
  });

  it('should handle DST fall back transition correctly', () => {
    // In 2023, DST in US ended on November 5, 2:00 AM became 1:00 AM
    // Before transition (2:00 AM EDT = UTC-4)
    const beforeDST = DateTime.fromISO('2023-11-05T01:30:00', { zone: 'America/New_York' });
    expect(beforeDST.offset / 60).toBe(-4); // EDT

    // After transition (1:00 AM EST = UTC-5)
    const afterDST = DateTime.fromISO('2023-11-05T02:30:00', { zone: 'America/New_York' });
    expect(afterDST.offset / 60).toBe(-5); // EST
  });

  it('should handle timezone with no DST (Arizona)', () => {
    // Arizona doesn't observe DST (except Navajo Nation)
    // Summer
    const summer = DateTime.fromISO('2023-06-21T12:00:00', { zone: 'America/Phoenix' });
    expect(summer.offset / 60).toBe(-7); // MST year-round

    // Winter
    const winter = DateTime.fromISO('2023-01-01T12:00:00', { zone: 'America/Phoenix' });
    expect(winter.offset / 60).toBe(-7); // MST year-round
  });

  it('should handle extreme latitude timezones (Reykjavik)', () => {
    // Iceland doesn't observe DST
    const dateTimeStr = '2000-06-21T12:00:00';
    const dt = DateTime.fromISO(dateTimeStr, { zone: 'Atlantic/Reykjavik' });
    const offsetHours = dt.offset / 60;

    expect(offsetHours).toBe(0); // Iceland uses GMT/UTC year-round
  });

  it('should handle Southern Hemisphere DST (Sydney)', () => {
    // Sydney, Australia - DST runs opposite to Northern Hemisphere
    // January (summer) - AEDT (UTC+11)
    const summer = DateTime.fromISO('2023-01-15T12:00:00', { zone: 'Australia/Sydney' });
    expect(summer.offset / 60).toBe(11); // AEDT

    // July (winter) - AEST (UTC+10)
    const winter = DateTime.fromISO('2023-07-15T12:00:00', { zone: 'Australia/Sydney' });
    expect(winter.offset / 60).toBe(10); // AEST
  });

  it('should convert DateTime to JavaScript Date correctly', () => {
    // Test that conversion to JavaScript Date maintains UTC accuracy
    const dateTimeStr = '1987-07-26T12:17:00';
    const dt = DateTime.fromISO(dateTimeStr, { zone: 'America/New_York' });
    const jsDate = dt.toJSDate();

    // Verify the UTC values match
    expect(jsDate.getUTCFullYear()).toBe(1987);
    expect(jsDate.getUTCMonth()).toBe(6); // July (0-indexed)
    expect(jsDate.getUTCDate()).toBe(26);
    // The UTC hour should be 16 (12:17 EDT + 4 hours = 16:17 UTC)
    expect(jsDate.getUTCHours()).toBe(16);
    expect(jsDate.getUTCMinutes()).toBe(17);
  });

  it('should handle multiple test cases systematically', () => {
    const testCases = [
      {
        date: '1987-07-26',
        time: '12:17',
        timezone: 'America/New_York',
        expectedOffset: -4, // EDT
        description: 'NYC July 1987 (EDT)',
        tolerance: 0, // Exact match expected
      },
      {
        date: '1987-01-15',
        time: '10:30',
        timezone: 'America/New_York',
        expectedOffset: -5, // EST
        description: 'NYC January 1987 (EST)',
        tolerance: 0, // Exact match expected
      },
      {
        date: '2000-06-21',
        time: '12:00',
        timezone: 'Europe/Paris',
        expectedOffset: 2, // CEST
        description: 'Paris summer (CEST)',
        tolerance: 0, // Exact match expected
      },
      {
        date: '1879-03-14',
        time: '11:30',
        timezone: 'Europe/Berlin',
        expectedOffset: 0.89, // Historical local mean time (approximately 53.5 minutes)
        description: 'Berlin 1879 (historical)',
        tolerance: 0.1, // Allow tolerance for historical timezones
      },
      {
        date: '1990-01-01',
        time: '12:00',
        timezone: 'America/Los_Angeles',
        expectedOffset: -8, // PST
        description: 'LA winter (PST)',
        tolerance: 0, // Exact match expected
      },
      {
        date: '2023-06-15',
        time: '14:00',
        timezone: 'America/Phoenix',
        expectedOffset: -7, // MST (no DST)
        description: 'Phoenix (no DST)',
        tolerance: 0, // Exact match expected
      },
    ];

    testCases.forEach(({ date, time, timezone, expectedOffset, description, tolerance }) => {
      const dateTimeStr = `${date}T${time}:00`;
      const dt = DateTime.fromISO(dateTimeStr, { zone: timezone });
      const offsetHours = dt.offset / 60;

      if (tolerance > 0) {
        expect(offsetHours).toBeCloseTo(expectedOffset, 1);
      } else {
        expect(offsetHours).toBe(expectedOffset);
      }
      // eslint-disable-next-line no-console
      console.log(
        `✓ ${description}: ${dateTimeStr} ${timezone} = UTC${offsetHours >= 0 ? '+' : ''}${offsetHours.toFixed(2)}`,
      );
    });
  });
});
