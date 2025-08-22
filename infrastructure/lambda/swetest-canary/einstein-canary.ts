export const handler = async (): Promise<void> => {
  console.info('Starting Einstein canary test for Swiss Ephemeris layer');

  const testResult = {
    success: false,
    error: null as string | null,
    houseCount: 0,
    executionTime: 0,
  };

  const startTime = Date.now();

  try {
    // Import Swiss Ephemeris - this validates the layer is working
    const swisseph = require('swisseph');

    // Set ephemeris path
    process.env.SE_EPHE_PATH = '/opt/nodejs/node_modules/swisseph/ephe';
    swisseph.swe_set_ephe_path(process.env.SE_EPHE_PATH);

    // Albert Einstein birth data
    const birthDate = new Date('1879-03-14T10:30:00Z'); // UTC time
    const julianDay = swisseph.swe_julday(
      birthDate.getUTCFullYear(),
      birthDate.getUTCMonth() + 1,
      birthDate.getUTCDate(),
      birthDate.getUTCHours() + birthDate.getUTCMinutes() / 60,
      swisseph.SE_GREG_CAL,
    );

    // Ulm, Germany coordinates
    const latitude = 48.4;
    const longitude = 9.99;

    // Calculate houses using Placidus system
    const houses = swisseph.swe_houses(
      julianDay,
      latitude,
      longitude,
      'P', // Placidus
    );

    if (!houses || !houses.house || houses.house.length < 12) {
      throw new Error('House calculation failed - invalid result structure');
    }

    // Validate we got 12 houses
    const houseCount = houses.house.filter((h: number) => h !== undefined).length;
    if (houseCount < 12) {
      throw new Error(`Only ${houseCount} houses calculated, expected 12`);
    }

    // Calculate Sun position for additional validation
    const sunResult = swisseph.swe_calc_ut(julianDay, swisseph.SE_SUN, swisseph.SEFLG_SPEED);
    if (!sunResult || typeof sunResult.longitude !== 'number') {
      throw new Error('Sun calculation failed');
    }

    // Validate Sun is approximately in Pisces (330-360 or 0-30 degrees)
    const sunLongitude = sunResult.longitude;
    const expectedSign = 'Pisces';
    const signStart = 330;
    const signEnd = 360;

    if (sunLongitude < signStart || sunLongitude > signEnd) {
      console.warn(
        `Sun position validation: ${sunLongitude}° (may not be in ${expectedSign} as expected)`,
      );
    }

    testResult.success = true;
    testResult.houseCount = houseCount;
    console.info('Einstein canary test PASSED', {
      houseCount,
      firstHouse: houses.house[0],
      sunLongitude,
    });
  } catch (error) {
    testResult.error = error instanceof Error ? error.message : String(error);
    console.error('Einstein canary test FAILED:', testResult.error);
  }

  testResult.executionTime = Date.now() - startTime;

  // Send metric to CloudWatch (using dynamic import to avoid bundling issues)
  try {
    // @ts-ignore - Dynamic import for runtime
    const { CloudWatchClient, PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
    const cloudwatch = new CloudWatchClient({});

    await cloudwatch.send(
      new PutMetricDataCommand({
        Namespace: 'Aura28/Canary',
        MetricData: [
          {
            MetricName: 'SwissEphemerisLayerHealth',
            Value: testResult.success ? 1 : 0,
            Unit: 'Count',
            Timestamp: new Date(),
            Dimensions: [
              {
                Name: 'Environment',
                Value: process.env.ENVIRONMENT || 'unknown',
              },
              {
                Name: 'Test',
                Value: 'Einstein',
              },
            ],
          },
          {
            MetricName: 'SwissEphemerisExecutionTime',
            Value: testResult.executionTime,
            Unit: 'Milliseconds',
            Timestamp: new Date(),
          },
        ],
      }),
    );
  } catch (metricError) {
    console.error('Failed to send CloudWatch metric:', metricError);
  }

  // Throw error if test failed to trigger alarm
  if (!testResult.success) {
    throw new Error(`Canary test failed: ${testResult.error}`);
  }
};
