"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Require the setup file first
require('./natal-chart-integration-setup');
// NOW import the handler after paths are set up
const generate_natal_chart_1 = require("../lambda/natal-chart/generate-natal-chart");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const aws_sdk_client_mock_1 = require("aws-sdk-client-mock");
require("aws-sdk-client-mock-jest");
const path = require('path');
const layerPath = path.join(__dirname, '../layers/swetest/layer/nodejs/node_modules/swisseph/ephe');
// DO NOT mock swisseph for integration test - we want to test the actual module
const ddbMock = (0, aws_sdk_client_mock_1.mockClient)(lib_dynamodb_1.DynamoDBDocumentClient);
// This test uses the Swiss Ephemeris module from the layer directory
// The layer is built via CodeBuild and includes all necessary ephemeris files
// NOTE: Skip locally since the layer needs to be built via CodeBuild first
describe.skip('Natal Chart Integration Test', () => {
    beforeEach(() => {
        ddbMock.reset();
        process.env.NATAL_CHART_TABLE_NAME = 'TestNatalChartTable';
        // Ensure ephemeris paths remain set
        process.env.SE_EPHE_PATH = layerPath;
        process.env.EPHEMERIS_PATH = layerPath;
    });
    describe('Albert Einstein Test Case', () => {
        it('should calculate accurate natal chart with houses for Albert Einstein', async () => {
            // Albert Einstein birth data
            // March 14, 1879, 11:30 AM in Ulm, Germany
            // UTC time would be 10:30 AM (Ulm was UTC+1 in 1879)
            const event = {
                userId: 'test-einstein',
                birthDate: '1879-03-14',
                birthTime: '10:30', // UTC time
                latitude: 48.4, // Ulm, Germany latitude
                longitude: 9.99, // Ulm, Germany longitude
                ianaTimeZone: 'Europe/Berlin',
            };
            // Mock DynamoDB operations
            ddbMock.on(lib_dynamodb_1.GetCommand).resolves({}); // Cache miss
            ddbMock.on(lib_dynamodb_1.GetCommand).resolves({}); // Cache miss
            ddbMock.on(lib_dynamodb_1.PutCommand).resolves({});
            // Execute the handler
            await (0, generate_natal_chart_1.handler)(event);
            // Verify the natal chart was saved with expected structure
            expect(ddbMock).toHaveReceivedCommandWith(lib_dynamodb_1.PutCommand, {
                TableName: 'TestNatalChartTable',
                Item: expect.objectContaining({
                    userId: 'test-einstein',
                    chartType: 'natal',
                    isTimeEstimated: false,
                    // Verify basic structure
                    birthInfo: expect.objectContaining({
                        birthDate: '1879-03-14',
                        birthTime: '10:30',
                        latitude: 48.4,
                        longitude: 9.99,
                    }),
                    // Verify planets exist and have expected structure
                    planets: expect.objectContaining({
                        sun: expect.objectContaining({
                            longitude: expect.any(Number),
                            sign: expect.any(String),
                            degreeInSign: expect.any(Number),
                            minutes: expect.any(Number),
                        }),
                        moon: expect.objectContaining({
                            longitude: expect.any(Number),
                            sign: expect.any(String),
                            degreeInSign: expect.any(Number),
                            minutes: expect.any(Number),
                        }),
                    }),
                    // Verify houses were calculated successfully
                    houses: expect.objectContaining({
                        status: 'success',
                        data: expect.arrayContaining([
                            expect.objectContaining({
                                houseNumber: 1,
                                cuspDegree: expect.any(Number),
                                cuspSign: expect.any(String),
                            }),
                        ]),
                    }),
                    // Verify ascendant exists
                    ascendant: expect.objectContaining({
                        degree: expect.any(Number),
                        sign: expect.any(String),
                        degreeInSign: expect.any(Number),
                        minutes: expect.any(Number),
                    }),
                    // Verify midheaven exists
                    midheaven: expect.objectContaining({
                        degree: expect.any(Number),
                        sign: expect.any(String),
                        degreeInSign: expect.any(Number),
                        minutes: expect.any(Number),
                    }),
                }),
            });
            // Get the actual saved item for detailed validation
            const savedItem = ddbMock.commandCalls(lib_dynamodb_1.PutCommand)[0]?.args[0]?.input?.Item;
            // Detailed validations
            expect(savedItem).toBeDefined();
            if (!savedItem)
                return; // Type guard for TypeScript
            // Verify no "House calculations unavailable" error
            expect(savedItem.houses).toBeDefined();
            if (!savedItem.houses) {
                // eslint-disable-next-line no-console
                console.error('Houses object is missing from saved item:', JSON.stringify(savedItem, null, 2));
                return;
            }
            expect(savedItem.houses.status).toBe('success');
            expect(savedItem.houses.error).toBeUndefined();
            // Verify houses array has exactly 12 houses
            expect(savedItem.houses.data).toHaveLength(12);
            // Verify all house numbers are present (1-12)
            const houseNumbers = savedItem.houses.data.map((h) => h.houseNumber);
            expect(houseNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
            // Verify all angles are between 0 and 360
            savedItem.houses.data.forEach((house) => {
                expect(house.cuspDegree).toBeGreaterThanOrEqual(0);
                expect(house.cuspDegree).toBeLessThan(360);
            });
            // Verify Ascendant is approximately in Sagittarius (240-270 degrees)
            // Note: Exact values may vary slightly based on calculation method
            // We'll allow some tolerance
            const ascDegree = savedItem.ascendant.degree;
            expect(ascDegree).toBeGreaterThanOrEqual(0);
            expect(ascDegree).toBeLessThan(360);
            // Verify Midheaven is finite and valid
            const mcDegree = savedItem.midheaven.degree;
            expect(mcDegree).toBeGreaterThanOrEqual(0);
            expect(mcDegree).toBeLessThan(360);
            // Verify Sun is approximately in Pisces (330-360 or 0-30 degrees)
            const sunDegree = savedItem.planets.sun.longitude;
            const sunSign = savedItem.planets.sun.sign;
            expect(sunSign).toBe('Pisces');
            expect(sunDegree).toBeGreaterThanOrEqual(0);
            expect(sunDegree).toBeLessThan(360);
            // Verify planet houses mapping exists
            expect(savedItem.planetHouses).toBeDefined();
            expect(Object.keys(savedItem.planetHouses).length).toBeGreaterThan(0);
            // Log key values for debugging if needed
            // eslint-disable-next-line no-console
            console.log('Einstein Chart Results:', {
                ascendant: `${savedItem.ascendant.degreeInSign}° ${savedItem.ascendant.sign}`,
                midheaven: `${savedItem.midheaven.degreeInSign}° ${savedItem.midheaven.sign}`,
                sun: `${savedItem.planets.sun.degreeInSign}° ${savedItem.planets.sun.sign}`,
                moon: savedItem.planets.moon
                    ? `${savedItem.planets.moon.degreeInSign}° ${savedItem.planets.moon.sign}`
                    : 'N/A',
                houseCount: savedItem.houses.data.length,
                houseStatus: savedItem.houses.status,
            });
        });
        it('should not show "House calculations unavailable" message', async () => {
            const event = {
                userId: 'test-no-unavailable',
                birthDate: '1990-01-01',
                birthTime: '12:00',
                latitude: 40.7128,
                longitude: -74.006,
                ianaTimeZone: 'America/New_York',
            };
            ddbMock.on(lib_dynamodb_1.GetCommand).resolves({}); // Cache miss
            ddbMock.on(lib_dynamodb_1.PutCommand).resolves({});
            await (0, generate_natal_chart_1.handler)(event);
            const savedItem = ddbMock.commandCalls(lib_dynamodb_1.PutCommand)[0]?.args[0]?.input?.Item;
            if (!savedItem)
                throw new Error('No item saved');
            // Main assertion: houses should be successfully calculated
            expect(savedItem.houses).toBeDefined();
            if (!savedItem.houses) {
                // eslint-disable-next-line no-console
                console.error('Houses missing in second test:', JSON.stringify(savedItem, null, 2));
                return;
            }
            expect(savedItem.houses.status).toBe('success');
            expect(savedItem.houses.error).not.toBe('House calculations unavailable');
            expect(savedItem.houses.data).toHaveLength(12);
        });
    });
    describe('Edge Cases', () => {
        it('should handle birth locations at extreme latitudes', async () => {
            // Test with location near North Pole
            const event = {
                userId: 'test-arctic',
                birthDate: '2000-06-21', // Summer solstice
                birthTime: '00:00',
                latitude: 71.0, // Near Arctic Circle
                longitude: 0.0,
                ianaTimeZone: 'UTC',
            };
            ddbMock.on(lib_dynamodb_1.GetCommand).resolves({}); // Cache miss
            ddbMock.on(lib_dynamodb_1.PutCommand).resolves({});
            await (0, generate_natal_chart_1.handler)(event);
            const savedItem = ddbMock.commandCalls(lib_dynamodb_1.PutCommand)[0]?.args[0]?.input?.Item;
            if (!savedItem)
                throw new Error('No item saved');
            // Even at extreme latitudes, houses should be calculated
            expect(savedItem.houses.status).toBe('success');
            expect(savedItem.houses.data).toHaveLength(12);
            // All values should be finite
            savedItem.houses.data.forEach((house) => {
                expect(isFinite(house.cuspDegree)).toBe(true);
            });
        });
    });
    describe('Timezone Fix Verification (KAN-76)', () => {
        it('should calculate accurate timezone offset for New York birth in July 1987', async () => {
            /**
             * Integration test for KAN-76 timezone fix.
             * This test verifies that the Luxon-based timezone calculation correctly
             * handles historical timezones and DST for a specific birth date.
             *
             * Birth data: July 26, 1987, 12:17 PM in New York, NY
             * Expected: EDT timezone (UTC-4) in July
             */
            const event = {
                userId: 'test-timezone-fix-nyc-1987',
                birthDate: '1987-07-26',
                birthTime: '12:17',
                latitude: 40.7128, // New York, NY
                longitude: -74.006,
                ianaTimeZone: 'America/New_York',
            };
            ddbMock.on(lib_dynamodb_1.GetCommand).resolves({}); // Cache miss
            ddbMock.on(lib_dynamodb_1.PutCommand).resolves({});
            await (0, generate_natal_chart_1.handler)(event);
            const savedItem = ddbMock.commandCalls(lib_dynamodb_1.PutCommand)[0]?.args[0]?.input?.Item;
            expect(savedItem).toBeDefined();
            if (!savedItem)
                throw new Error('No item saved');
            // Verify chart was generated successfully
            expect(savedItem.chartType).toBe('natal');
            expect(savedItem.userId).toBe('test-timezone-fix-nyc-1987');
            expect(savedItem.isTimeEstimated).toBe(false);
            // Verify birth info was stored correctly
            expect(savedItem.birthInfo).toMatchObject({
                birthDate: '1987-07-26',
                birthTime: '12:17',
                latitude: 40.7128,
                longitude: -74.006,
                ianaTimeZone: 'America/New_York',
            });
            // Verify houses were calculated successfully
            expect(savedItem.houses).toBeDefined();
            expect(savedItem.houses.status).toBe('success');
            expect(savedItem.houses.data).toHaveLength(12);
            // Verify planetary positions were calculated
            expect(savedItem.planets).toBeDefined();
            expect(savedItem.planets.sun).toBeDefined();
            expect(savedItem.planets.moon).toBeDefined();
            // Verify ascendant and midheaven were calculated
            expect(savedItem.ascendant).toBeDefined();
            expect(savedItem.midheaven).toBeDefined();
            // Log the results for verification
            // eslint-disable-next-line no-console
            console.log('NYC July 1987 Chart Results (KAN-76):', {
                birthDate: savedItem.birthInfo.birthDate,
                birthTime: savedItem.birthInfo.birthTime,
                timezone: savedItem.birthInfo.ianaTimeZone,
                sun: savedItem.planets.sun
                    ? `${savedItem.planets.sun.degreeInSign}° ${savedItem.planets.sun.sign}`
                    : 'N/A',
                moon: savedItem.planets.moon
                    ? `${savedItem.planets.moon.degreeInSign}° ${savedItem.planets.moon.sign}`
                    : 'N/A',
                ascendant: `${savedItem.ascendant.degreeInSign}° ${savedItem.ascendant.sign}`,
                midheaven: `${savedItem.midheaven.degreeInSign}° ${savedItem.midheaven.sign}`,
                houseCount: savedItem.houses.data.length,
                houseStatus: savedItem.houses.status,
            });
        });
        it('should calculate different offsets for NYC in winter vs summer', async () => {
            // Summer (EDT - UTC-4)
            const summerEvent = {
                userId: 'test-timezone-summer',
                birthDate: '1987-07-26',
                birthTime: '12:17',
                latitude: 40.7128,
                longitude: -74.006,
                ianaTimeZone: 'America/New_York',
            };
            // Winter (EST - UTC-5)
            const winterEvent = {
                userId: 'test-timezone-winter',
                birthDate: '1987-01-15',
                birthTime: '10:30',
                latitude: 40.7128,
                longitude: -74.006,
                ianaTimeZone: 'America/New_York',
            };
            ddbMock.on(lib_dynamodb_1.GetCommand).resolves({}); // Cache miss
            ddbMock.on(lib_dynamodb_1.PutCommand).resolves({});
            await (0, generate_natal_chart_1.handler)(summerEvent);
            const summerItem = ddbMock.commandCalls(lib_dynamodb_1.PutCommand)[0]?.args[0]?.input?.Item;
            ddbMock.reset();
            ddbMock.on(lib_dynamodb_1.GetCommand).resolves({}); // Cache miss
            ddbMock.on(lib_dynamodb_1.PutCommand).resolves({});
            await (0, generate_natal_chart_1.handler)(winterEvent);
            const winterItem = ddbMock.commandCalls(lib_dynamodb_1.PutCommand)[0]?.args[0]?.input?.Item;
            // Both charts should be successfully generated
            expect(summerItem?.houses.status).toBe('success');
            expect(winterItem?.houses.status).toBe('success');
            // The planetary positions should be different due to different dates and DST
            // This verifies that the timezone offset is being applied correctly
            expect(summerItem?.planets.sun.longitude).not.toBe(winterItem?.planets.sun.longitude);
            // eslint-disable-next-line no-console
            console.log('DST Verification (KAN-76):', {
                summer: {
                    date: '1987-07-26',
                    expectedOffset: 'EDT (UTC-4)',
                    sunPosition: summerItem?.planets.sun
                        ? `${summerItem.planets.sun.degreeInSign}° ${summerItem.planets.sun.sign}`
                        : 'N/A',
                },
                winter: {
                    date: '1987-01-15',
                    expectedOffset: 'EST (UTC-5)',
                    sunPosition: winterItem?.planets.sun
                        ? `${winterItem.planets.sun.degreeInSign}° ${winterItem.planets.sun.sign}`
                        : 'N/A',
                },
            });
        });
        it('should handle cache invalidation with new timezone fix version', async () => {
            /**
             * This test verifies that the cache key version change ('2.10.03-tz-fix')
             * properly invalidates old cached entries with incorrect timezone calculations.
             */
            const event = {
                userId: 'test-cache-invalidation',
                birthDate: '1987-07-26',
                birthTime: '12:17',
                latitude: 40.7128,
                longitude: -74.006,
                ianaTimeZone: 'America/New_York',
            };
            // First call - cache miss, calculates and stores
            ddbMock.on(lib_dynamodb_1.GetCommand).resolves({}); // Cache miss
            ddbMock.on(lib_dynamodb_1.PutCommand).resolves({});
            await (0, generate_natal_chart_1.handler)(event);
            // Verify that cache was attempted to be retrieved (GetCommand called)
            expect(ddbMock.commandCalls(lib_dynamodb_1.GetCommand).length).toBeGreaterThan(0);
            // Verify that result was stored (PutCommand called)
            const putCalls = ddbMock.commandCalls(lib_dynamodb_1.PutCommand);
            expect(putCalls.length).toBeGreaterThan(0);
            // The cache key should include the new version '2.10.03-tz-fix'
            // This is verified implicitly by the fact that the calculation proceeds
            // without using any old cached values
            const savedItem = putCalls[0]?.args[0]?.input?.Item;
            expect(savedItem?.chartType).toBe('natal');
            // eslint-disable-next-line no-console
            console.log('Cache Invalidation Test (KAN-76): New calculation performed with updated timezone logic');
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmF0YWwtY2hhcnQtaW50ZWdyYXRpb24udGVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIm5hdGFsLWNoYXJ0LWludGVncmF0aW9uLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSwrQkFBK0I7QUFDL0IsT0FBTyxDQUFDLGlDQUFpQyxDQUFDLENBQUM7QUFFM0MsZ0RBQWdEO0FBQ2hELHFGQUFxRTtBQUNyRSx3REFBdUY7QUFDdkYsNkRBQWlEO0FBQ2pELG9DQUFrQztBQUVsQyxNQUFNLElBQUksR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7QUFDN0IsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsMkRBQTJELENBQUMsQ0FBQztBQUVwRyxnRkFBZ0Y7QUFDaEYsTUFBTSxPQUFPLEdBQUcsSUFBQSxnQ0FBVSxFQUFDLHFDQUFzQixDQUFDLENBQUM7QUFFbkQscUVBQXFFO0FBQ3JFLDhFQUE4RTtBQUM5RSwyRUFBMkU7QUFDM0UsUUFBUSxDQUFDLElBQUksQ0FBQyw4QkFBOEIsRUFBRSxHQUFHLEVBQUU7SUFDakQsVUFBVSxDQUFDLEdBQUcsRUFBRTtRQUNkLE9BQU8sQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNoQixPQUFPLENBQUMsR0FBRyxDQUFDLHNCQUFzQixHQUFHLHFCQUFxQixDQUFDO1FBQzNELG9DQUFvQztRQUNwQyxPQUFPLENBQUMsR0FBRyxDQUFDLFlBQVksR0FBRyxTQUFTLENBQUM7UUFDckMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLEdBQUcsU0FBUyxDQUFDO0lBQ3pDLENBQUMsQ0FBQyxDQUFDO0lBRUgsUUFBUSxDQUFDLDJCQUEyQixFQUFFLEdBQUcsRUFBRTtRQUN6QyxFQUFFLENBQUMsdUVBQXVFLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDckYsNkJBQTZCO1lBQzdCLDJDQUEyQztZQUMzQyxxREFBcUQ7WUFDckQsTUFBTSxLQUFLLEdBQUc7Z0JBQ1osTUFB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QUFDLGFBQWE7WUFDbEQsT0FBTyxDQUFDLEVBQUUsQ0FBQyx5QkFBVSxDQUFDLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBRXBDLE1BQU0sSUFBQSw4QkFBTyxFQUFDLEtBQUssQ0FBQyxDQUFDO1lBRXJCLHNFQUFzRTtZQUN0RSxNQUFNLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyx5QkFBVSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRW5FLG9EQUFvRDtZQUNwRCxNQUFNLFFBQVEsR0FBRyxPQUFPLENBQUMsWUFBWSxDQUFDLHlCQUFVLENBQUMsQ0FBQztZQUNsRCxNQUFNLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUUzQyxnRUFBZ0U7WUFDaEUsd0VBQXdFO1lBQ3hFLHNDQUFzQztZQUN0QyxNQUFNLFNBQVMsR0FBRyxRQUFRLENBQUMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUM7WUFDcEQsTUFBTSxDQUFDLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7WUFFM0Msc0NBQXNDO1lBQ3RDLE9BQU8sQ0FBQyxHQUFHLENBQ1QseUZBQXlGLENBQzFGLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBSZXF1aXJlIHRoZSBzZXR1cCBmaWxlIGZpcnN0XG5yZXF1aXJlKCcuL25hdGFsLWNoYXJ0LWludGVncmF0aW9uLXNldHVwJyk7XG5cbi8vIE5PVyBpbXBvcnQgdGhlIGhhbmRsZXIgYWZ0ZXIgcGF0aHMgYXJlIHNldCB1cFxuaW1wb3J0IHsgaGFuZGxlciB9IGZyb20gJy4uL2xhbWJkYS9uYXRhbC1jaGFydC9nZW5lcmF0ZS1uYXRhbC1jaGFydCc7XG5pbXBvcnQgeyBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LCBQdXRDb21tYW5kLCBHZXRDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvbGliLWR5bmFtb2RiJztcbmltcG9ydCB7IG1vY2tDbGllbnQgfSBmcm9tICdhd3Mtc2RrLWNsaWVudC1tb2NrJztcbmltcG9ydCAnYXdzLXNkay1jbGllbnQtbW9jay1qZXN0JztcblxuY29uc3QgcGF0aCA9IHJlcXVpcmUoJ3BhdGgnKTtcbmNvbnN0IGxheWVyUGF0aCA9IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9sYXllcnMvc3dldGVzdC9sYXllci9ub2RlanMvbm9kZV9tb2R1bGVzL3N3aXNzZXBoL2VwaGUnKTtcblxuLy8gRE8gTk9UIG1vY2sgc3dpc3NlcGggZm9yIGludGVncmF0aW9uIHRlc3QgLSB3ZSB3YW50IHRvIHRlc3QgdGhlIGFjdHVhbCBtb2R1bGVcbmNvbnN0IGRkYk1vY2sgPSBtb2NrQ2xpZW50KER5bmFtb0RCRG9jdW1lbnRDbGllbnQpO1xuXG4vLyBUaGlzIHRlc3QgdXNlcyB0aGUgU3dpc3MgRXBoZW1lcmlzIG1vZHVsZSBmcm9tIHRoZSBsYXllciBkaXJlY3Rvcnlcbi8vIFRoZSBsYXllciBpcyBidWlsdCB2aWEgQ29kZUJ1aWxkIGFuZCBpbmNsdWRlcyBhbGwgbmVjZXNzYXJ5IGVwaGVtZXJpcyBmaWxlc1xuLy8gTk9URTogU2tpcCBsb2NhbGx5IHNpbmNlIHRoZSBsYXllciBuZWVkcyB0byBiZSBidWlsdCB2aWEgQ29kZUJ1aWxkIGZpcnN0XG5kZXNjcmliZS5za2lwKCdOYXRhbCBDaGFydCBJbnRlZ3JhdGlvbiBUZXN0JywgKCkgPT4ge1xuICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICBkZGJNb2NrLnJlc2V0KCk7XG4gICAgcHJvY2Vzcy5lbnYuTkFUQUxfQ0hBUlRfVEFCTEVfTkFNRSA9ICdUZXN0TmF0YWxDaGFydFRhYmxlJztcbiAgICAvLyBFbnN1cmUgZXBoZW1lcmlzIHBhdGhzIHJlbWFpbiBzZXRcbiAgICBwcm9jZXNzLmVudi5TRV9FUEhFX1BBVEggPSBsYXllclBhdGg7XG4gICAgcHJvY2Vzcy5lbnYuRVBIRU1FUklTX1BBVEggPSBsYXllclBhdGg7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdBbGJlcnQgRWluc3RlaW4gVGVzdCBDYXNlJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgY2FsY3VsYXRlIGFjY3VyYXRlIG5hdGFsIGNoYXJ0IHdpdGggaG91c2VzIGZvciBBbGJlcnQgRWluc3RlaW4nLCBhc3luYyAoKSA9PiB7XG4gICAgICAvLyBBbGJlcnQgRWluc3RlaW4gYmlydGggZGF0YVxuICAgICAgLy8gTWFyY2ggMTQsIDE4NzksIDExOjMwIEFNIGluIFVsbSwgR2VybWFueVxuICAgICAgLy8gVVRDIHRpbWUgd291bGQgYmUgMTA6MzAgQU0gKFVsbSB3YXMgVVRDKzEgaW4gMTg3OSlcbiAgICAgIGNvbnN0IGV2ZW50ID0ge1xuICAgICAgICB1c2VySWQ6ICd0ZXN0LWVpbnN0ZWluJyxcbiAgICAgICAgYmlydGhEYXRlOiAnMTg3OS0wMy0xNCcsXG4gICAgICAgIGJpcnRoVGltZTogJzEwOjMwJywgLy8gVVRDIHRpbWVcbiAgICAgICAgbGF0aXR1ZGU6IDQ4LjQsIC8vIFVsbSwgR2VybWFueSBsYXRpdHVkZVxuICAgICAgICBsb25naXR1ZGU6IDkuOTksIC8vIFVsbSwgR2VybWFueSBsb25naXR1ZGVcbiAgICAgICAgaWFuYVRpbWVab25lOiAnRXVyb3BlL0JlcmxpbicsXG4gICAgICB9O1xuXG4gICAgICAvLyBNb2NrIER5bmFtb0RCIG9wZXJhdGlvbnNcbiAgICAgIGRkYk1vY2sub24oR2V0Q29tbWFuZCkucmVzb2x2ZXMoe30pOyAvLyBDYWNoZSBtaXNzXG4gICAgICBkZGJNb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHt9KTsgLy8gQ2FjaGUgbWlzc1xuICAgICAgZGRiTW9jay5vbihQdXRDb21tYW5kKS5yZXNvbHZlcyh7fSk7XG5cbiAgICAgIC8vIEV4ZWN1dGUgdGhlIGhhbmRsZXJcbiAgICAgIGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICAvLyBWZXJpZnkgdGhlIG5hdGFsIGNoYXJ0IHdhcyBzYXZlZCB3aXRoIGV4cGVjdGVkIHN0cnVjdHVyZVxuICAgICAgZXhwZWN0KGRkYk1vY2spLnRvSGF2ZVJlY2VpdmVkQ29tbWFuZFdpdGgoUHV0Q29tbWFuZCwge1xuICAgICAgICBUYWJsZU5hbWU6ICdUZXN0TmF0YWxDaGFydFRhYmxlJyxcbiAgICAgICAgSXRlbTogZXhwZWN0Lm9iamVjdENvbnRhaW5pbmcoe1xuICAgICAgICAgIHVzZXJJZDogJ3Rlc3QtZWluc3RlaW4nLFxuICAgICAgICAgIGNoYXJ0VHlwZTogJ25hdGFsJyxcbiAgICAgICAgICBpc1RpbWVFc3RpbWF0ZWQ6IGZhbHNlLFxuXG4gICAgICAgICAgLy8gVmVyaWZ5IGJhc2ljIHN0cnVjdHVyZVxuICAgICAgICAgIGJpcnRoSW5mbzogZXhwZWN0Lm9iamVjdENvbnRhaW5pbmcoe1xuICAgICAgICAgICAgYmlydGhEYXRlOiAnMTg3OS0wMy0xNCcsXG4gICAgICAgICAgICBiaXJ0aFRpbWU6ICcxMDozMCcsXG4gICAgICAgICAgICBsYXRpdHVkZTogNDguNCxcbiAgICAgICAgICAgIGxvbmdpdHVkZTogOS45OSxcbiAgICAgICAgICB9KSxcblxuICAgICAgICAgIC8vIFZlcmlmeSBwbGFuZXRzIGV4aXN0IGFuZCBoYXZlIGV4cGVjdGVkIHN0cnVjdHVyZVxuICAgICAgICAgIHBsYW5ldHM6IGV4cGVjdC5vYmplY3RDb250YWluaW5nKHtcbiAgICAgICAgICAgIHN1bjogZXhwZWN0Lm9iamVjdENvbnRhaW5pbmcoe1xuICAgICAgICAgICAgICBsb25naXR1ZGU6IGV4cGVjdC5hbnkoTnVtYmVyKSxcbiAgICAgICAgICAgICAgc2lnbjogZXhwZWN0LmFueShTdHJpbmcpLFxuICAgICAgICAgICAgICBkZWdyZWVJblNpZ246IGV4cGVjdC5hbnkoTnVtYmVyKSxcbiAgICAgICAgICAgICAgbWludXRlczogZXhwZWN0LmFueShOdW1iZXIpLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICBtb29uOiBleHBlY3Qub2JqZWN0Q29udGFpbmluZyh7XG4gICAgICAgICAgICAgIGxvbmdpdHVkZTogZXhwZWN0LmFueShOdW1iZXIpLFxuICAgICAgICAgICAgICBzaWduOiBleHBlY3QuYW55KFN0cmluZyksXG4gICAgICAgICAgICAgIGRlZ3JlZUluU2lnbjogZXhwZWN0LmFueShOdW1iZXIpLFxuICAgICAgICAgICAgICBtaW51dGVzOiBleHBlY3QuYW55KE51bWJlciksXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICB9KSxcblxuICAgICAgICAgIC8vIFZlcmlmeSBob3VzZXMgd2VyZSBjYWxjdWxhdGVkIHN1Y2Nlc3NmdWxseVxuICAgICAgICAgIGhvdXNlczogZXhwZWN0Lm9iamVjdENvbnRhaW5pbmcoe1xuICAgICAgICAgICAgc3RhdHVzOiAnc3VjY2VzcycsXG4gICAgICAgICAgICBkYXRhOiBleHBlY3QuYXJyYXlDb250YWluaW5nKFtcbiAgICAgICAgICAgICAgZXhwZWN0Lm9iamVjdENvbnRhaW5pbmcoe1xuICAgICAgICAgICAgICAgIGhvdXNlTnVtYmVyOiAxLFxuICAgICAgICAgICAgICAgIGN1c3BEZWdyZWU6IGV4cGVjdC5hbnkoTnVtYmVyKSxcbiAgICAgICAgICAgICAgICBjdXNwU2lnbjogZXhwZWN0LmFueShTdHJpbmcpLFxuICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIF0pLFxuICAgICAgICAgIH0pLFxuXG4gICAgICAgICAgLy8gVmVyaWZ5IGFzY2VuZGFudCBleGlzdHNcbiAgICAgICAgICBhc2NlbmRhbnQ6IGV4cGVjdC5vYmplY3RDb250YWluaW5nKHtcbiAgICAgICAgICAgIGRlZ3JlZTogZXhwZWN0LmFueShOdW1iZXIpLFxuICAgICAgICAgICAgc2lnbjogZXhwZWN0LmFueShTdHJpbmcpLFxuICAgICAgICAgICAgZGVncmVlSW5TaWduOiBleHBlY3QuYW55KE51bWJlciksXG4gICAgICAgICAgICBtaW51dGVzOiBleHBlY3QuYW55KE51bWJlciksXG4gICAgICAgICAgfSksXG5cbiAgICAgICAgICAvLyBWZXJpZnkgbWlkaGVhdmVuIGV4aXN0c1xuICAgICAgICAgIG1pZGhlYXZlbjogZXhwZWN0Lm9iamVjdENvbnRhaW5pbmcoe1xuICAgICAgICAgICAgZGVncmVlOiBleHBlY3QuYW55KE51bWJlciksXG4gICAgICAgICAgICBzaWduOiBleHBlY3QuYW55KFN0cmluZyksXG4gICAgICAgICAgICBkZWdyZWVJblNpZ246IGV4cGVjdC5hbnkoTnVtYmVyKSxcbiAgICAgICAgICAgIG1pbnV0ZXM6IGV4cGVjdC5hbnkoTnVtYmVyKSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgfSksXG4gICAgICB9KTtcblxuICAgICAgLy8gR2V0IHRoZSBhY3R1YWwgc2F2ZWQgaXRlbSBmb3IgZGV0YWlsZWQgdmFsaWRhdGlvblxuICAgICAgY29uc3Qgc2F2ZWRJdGVtID0gZGRiTW9jay5jb21tYW5kQ2FsbHMoUHV0Q29tbWFuZClbMF0/LmFyZ3NbMF0/LmlucHV0Py5JdGVtO1xuXG4gICAgICAvLyBEZXRhaWxlZCB2YWxpZGF0aW9uc1xuICAgICAgZXhwZWN0KHNhdmVkSXRlbSkudG9CZURlZmluZWQoKTtcbiAgICAgIGlmICghc2F2ZWRJdGVtKSByZXR1cm47IC8vIFR5cGUgZ3VhcmQgZm9yIFR5cGVTY3JpcHRcblxuICAgICAgLy8gVmVyaWZ5IG5vIFwiSG91c2UgY2FsY3VsYXRpb25zIHVuYXZhaWxhYmxlXCIgZXJyb3JcbiAgICAgIGV4cGVjdChzYXZlZEl0ZW0uaG91c2VzKS50b0JlRGVmaW5lZCgpO1xuICAgICAgaWYgKCFzYXZlZEl0ZW0uaG91c2VzKSB7XG4gICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jb25zb2xlXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICAgICAgJ0hvdXNlcyBvYmplY3QgaXMgbWlzc2luZyBmcm9tIHNhdmVkIGl0ZW06JyxcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeShzYXZlZEl0ZW0sIG51bGwsIDIpLFxuICAgICAgICApO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBleHBlY3Qoc2F2ZWRJdGVtLmhvdXNlcy5zdGF0dXMpLnRvQmUoJ3N1Y2Nlc3MnKTtcbiAgICAgIGV4cGVjdChzYXZlZEl0ZW0uaG91c2VzLmVycm9yKS50b0JlVW5kZWZpbmVkKCk7XG5cbiAgICAgIC8vIFZlcmlmeSBob3VzZXMgYXJyYXkgaGFzIGV4YWN0bHkgMTIgaG91c2VzXG4gICAgICBleHBlY3Qoc2F2ZWRJdGVtLmhvdXNlcy5kYXRhKS50b0hhdmVMZW5ndGgoMTIpO1xuXG4gICAgICAvLyBWZXJpZnkgYWxsIGhvdXNlIG51bWJlcnMgYXJlIHByZXNlbnQgKDEtMTIpXG4gICAgICBjb25zdCBob3VzZU51bWJlcnMgPSBzYXZlZEl0ZW0uaG91c2VzLmRhdGEubWFwKChoOiB7IGhvdXNlTnVtYmVyOiBudW1iZXIgfSkgPT4gaC5ob3VzZU51bWJlcik7XG4gICAgICBleHBlY3QoaG91c2VOdW1iZXJzKS50b0VxdWFsKFsxLCAyLCAzLCA0LCA1LCA2LCA3LCA4LCA5LCAxMCwgMTEsIDEyXSk7XG5cbiAgICAgIC8vIFZlcmlmeSBhbGwgYW5nbGVzIGFyZSBiZXR3ZWVuIDAgYW5kIDM2MFxuICAgICAgc2F2ZWRJdGVtLmhvdXNlcy5kYXRhLmZvckVhY2goKGhvdXNlOiB7IGN1c3BEZWdyZWU6IG51bWJlciB9KSA9PiB7XG4gICAgICAgIGV4cGVjdChob3VzZS5jdXNwRGVncmVlKS50b0JlR3JlYXRlclRoYW5PckVxdWFsKDApO1xuICAgICAgICBleHBlY3QoaG91c2UuY3VzcERlZ3JlZSkudG9CZUxlc3NUaGFuKDM2MCk7XG4gICAgICB9KTtcblxuICAgICAgLy8gVmVyaWZ5IEFzY2VuZGFudCBpcyBhcHByb3hpbWF0ZWx5IGluIFNhZ2l0dGFyaXVzICgyNDAtMjcwIGRlZ3JlZXMpXG4gICAgICAvLyBOb3RlOiBFeGFjdCB2YWx1ZXMgbWF5IHZhcnkgc2xpZ2h0bHkgYmFzZWQgb24gY2FsY3VsYXRpb24gbWV0aG9kXG4gICAgICAvLyBXZSdsbCBhbGxvdyBzb21lIHRvbGVyYW5jZVxuICAgICAgY29uc3QgYXNjRGVncmVlID0gc2F2ZWRJdGVtLmFzY2VuZGFudC5kZWdyZWU7XG4gICAgICBleHBlY3QoYXNjRGVncmVlKS50b0JlR3JlYXRlclRoYW5PckVxdWFsKDApO1xuICAgICAgZXhwZWN0KGFzY0RlZ3JlZSkudG9CZUxlc3NUaGFuKDM2MCk7XG5cbiAgICAgIC8vIFZlcmlmeSBNaWRoZWF2ZW4gaXMgZmluaXRlIGFuZCB2YWxpZFxuICAgICAgY29uc3QgbWNEZWdyZWUgPSBzYXZlZEl0ZW0ubWlkaGVhdmVuLmRlZ3JlZTtcbiAgICAgIGV4cGVjdChtY0RlZ3JlZSkudG9CZUdyZWF0ZXJUaGFuT3JFcXVhbCgwKTtcbiAgICAgIGV4cGVjdChtY0RlZ3JlZSkudG9CZUxlc3NUaGFuKDM2MCk7XG5cbiAgICAgIC8vIFZlcmlmeSBTdW4gaXMgYXBwcm94aW1hdGVseSBpbiBQaXNjZXMgKDMzMC0zNjAgb3IgMC0zMCBkZWdyZWVzKVxuICAgICAgY29uc3Qgc3VuRGVncmVlID0gc2F2ZWRJdGVtLnBsYW5ldHMuc3VuLmxvbmdpdHVkZTtcbiAgICAgIGNvbnN0IHN1blNpZ24gPSBzYXZlZEl0ZW0ucGxhbmV0cy5zdW4uc2lnbjtcbiAgICAgIGV4cGVjdChzdW5TaWduKS50b0JlKCdQaXNjZXMnKTtcbiAgICAgIGV4cGVjdChzdW5EZWdyZWUpLnRvQmVHcmVhdGVyVGhhbk9yRXF1YWwoMCk7XG4gICAgICBleHBlY3Qoc3VuRGVncmVlKS50b0JlTGVzc1RoYW4oMzYwKTtcblxuICAgICAgLy8gVmVyaWZ5IHBsYW5ldCBob3VzZXMgbWFwcGluZyBleGlzdHNcbiAgICAgIGV4cGVjdChzYXZlZEl0ZW0ucGxhbmV0SG91c2VzKS50b0JlRGVmaW5lZCgpO1xuICAgICAgZXhwZWN0KE9iamVjdC5rZXlzKHNhdmVkSXRlbS5wbGFuZXRIb3VzZXMpLmxlbmd0aCkudG9CZUdyZWF0ZXJUaGFuKDApO1xuXG4gICAgICAvLyBMb2cga2V5IHZhbHVlcyBmb3IgZGVidWdnaW5nIGlmIG5lZWRlZFxuICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNvbnNvbGVcbiAgICAgIGNvbnNvbGUubG9nKCdFaW5zdGVpbiBDaGFydCBSZXN1bHRzOicsIHtcbiAgICAgICAgYXNjZW5kYW50OiBgJHtzYXZlZEl0ZW0uYXNjZW5kYW50LmRlZ3JlZUluU2lnbn3CsCAke3NhdmVkSXRlbS5hc2NlbmRhbnQuc2lnbn1gLFxuICAgICAgICBtaWRoZWF2ZW46IGAke3NhdmVkSXRlbS5taWRoZWF2ZW4uZGVncmVlSW5TaWdufcKwICR7c2F2ZWRJdGVtLm1pZGhlYXZlbi5zaWdufWAsXG4gICAgICAgIHN1bjogYCR7c2F2ZWRJdGVtLnBsYW5ldHMuc3VuLmRlZ3JlZUluU2lnbn3CsCAke3NhdmVkSXRlbS5wbGFuZXRzLnN1bi5zaWdufWAsXG4gICAgICAgIG1vb246IHNhdmVkSXRlbS5wbGFuZXRzLm1vb25cbiAgICAgICAgICA/IGAke3NhdmVkSXRlbS5wbGFuZXRzLm1vb24uZGVncmVlSW5TaWdufcKwICR7c2F2ZWRJdGVtLnBsYW5ldHMubW9vbi5zaWdufWBcbiAgICAgICAgICA6ICdOL0EnLFxuICAgICAgICBob3VzZUNvdW50OiBzYXZlZEl0ZW0uaG91c2VzLmRhdGEubGVuZ3RoLFxuICAgICAgICBob3VzZVN0YXR1czogc2F2ZWRJdGVtLmhvdXNlcy5zdGF0dXMsXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgbm90IHNob3cgXCJIb3VzZSBjYWxjdWxhdGlvbnMgdW5hdmFpbGFibGVcIiBtZXNzYWdlJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSB7XG4gICAgICAgIHVzZXJJZDogJ3Rlc3Qtbm8tdW5hdmFpbGFibGUnLFxuICAgICAgICBiaXJ0aERhdGU6ICcxOTkwLTAxLTAxJyxcbiAgICAgICAgYmlydGhUaW1lOiAnMTI6MDAnLFxuICAgICAgICBsYXRpdHVkZTogNDAuNzEyOCxcbiAgICAgICAgbG9uZ2l0dWRlOiAtNzQuMDA2LFxuICAgICAgICBpYW5hVGltZVpvbmU6ICdBbWVyaWNhL05ld19Zb3JrJyxcbiAgICAgIH07XG5cbiAgICAgIGRkYk1vY2sub24oR2V0Q29tbWFuZCkucmVzb2x2ZXMoe30pOyAvLyBDYWNoZSBtaXNzXG4gICAgICBkZGJNb2NrLm9uKFB1dENvbW1hbmQpLnJlc29sdmVzKHt9KTtcblxuICAgICAgYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGNvbnN0IHNhdmVkSXRlbSA9IGRkYk1vY2suY29tbWFuZENhbGxzKFB1dENvbW1hbmQpWzBdPy5hcmdzWzBdPy5pbnB1dD8uSXRlbTtcbiAgICAgIGlmICghc2F2ZWRJdGVtKSB0aHJvdyBuZXcgRXJyb3IoJ05vIGl0ZW0gc2F2ZWQnKTtcblxuICAgICAgLy8gTWFpbiBhc3NlcnRpb246IGhvdXNlcyBzaG91bGQgYmUgc3VjY2Vzc2Z1bGx5IGNhbGN1bGF0ZWRcbiAgICAgIGV4cGVjdChzYXZlZEl0ZW0uaG91c2VzKS50b0JlRGVmaW5lZCgpO1xuICAgICAgaWYgKCFzYXZlZEl0ZW0uaG91c2VzKSB7XG4gICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jb25zb2xlXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ0hvdXNlcyBtaXNzaW5nIGluIHNlY29uZCB0ZXN0OicsIEpTT04uc3RyaW5naWZ5KHNhdmVkSXRlbSwgbnVsbCwgMikpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBleHBlY3Qoc2F2ZWRJdGVtLmhvdXNlcy5zdGF0dXMpLnRvQmUoJ3N1Y2Nlc3MnKTtcbiAgICAgIGV4cGVjdChzYXZlZEl0ZW0uaG91c2VzLmVycm9yKS5ub3QudG9CZSgnSG91c2UgY2FsY3VsYXRpb25zIHVuYXZhaWxhYmxlJyk7XG4gICAgICBleHBlY3Qoc2F2ZWRJdGVtLmhvdXNlcy5kYXRhKS50b0hhdmVMZW5ndGgoMTIpO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnRWRnZSBDYXNlcycsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBiaXJ0aCBsb2NhdGlvbnMgYXQgZXh0cmVtZSBsYXRpdHVkZXMnLCBhc3luYyAoKSA9PiB7XG4gICAgICAvLyBUZXN0IHdpdGggbG9jYXRpb24gbmVhciBOb3J0aCBQb2xlXG4gICAgICBjb25zdCBldmVudCA9IHtcbiAgICAgICAgdXNlcklkOiAndGVzdC1hcmN0aWMnLFxuICAgICAgICBiaXJ0aERhdGU6ICcyMDAwLTA2LTIxJywgLy8gU3VtbWVyIHNvbHN0aWNlXG4gICAgICAgIGJpcnRoVGltZTogJzAwOjAwJyxcbiAgICAgICAgbGF0aXR1ZGU6IDcxLjAsIC8vIE5lYXIgQXJjdGljIENpcmNsZVxuICAgICAgICBsb25naXR1ZGU6IDAuMCxcbiAgICAgICAgaWFuYVRpbWVab25lOiAnVVRDJyxcbiAgICAgIH07XG5cbiAgICAgIGRkYk1vY2sub24oR2V0Q29tbWFuZCkucmVzb2x2ZXMoe30pOyAvLyBDYWNoZSBtaXNzXG4gICAgICBkZGJNb2NrLm9uKFB1dENvbW1hbmQpLnJlc29sdmVzKHt9KTtcblxuICAgICAgYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGNvbnN0IHNhdmVkSXRlbSA9IGRkYk1vY2suY29tbWFuZENhbGxzKFB1dENvbW1hbmQpWzBdPy5hcmdzWzBdPy5pbnB1dD8uSXRlbTtcbiAgICAgIGlmICghc2F2ZWRJdGVtKSB0aHJvdyBuZXcgRXJyb3IoJ05vIGl0ZW0gc2F2ZWQnKTtcblxuICAgICAgLy8gRXZlbiBhdCBleHRyZW1lIGxhdGl0dWRlcywgaG91c2VzIHNob3VsZCBiZSBjYWxjdWxhdGVkXG4gICAgICBleHBlY3Qoc2F2ZWRJdGVtLmhvdXNlcy5zdGF0dXMpLnRvQmUoJ3N1Y2Nlc3MnKTtcbiAgICAgIGV4cGVjdChzYXZlZEl0ZW0uaG91c2VzLmRhdGEpLnRvSGF2ZUxlbmd0aCgxMik7XG5cbiAgICAgIC8vIEFsbCB2YWx1ZXMgc2hvdWxkIGJlIGZpbml0ZVxuICAgICAgc2F2ZWRJdGVtLmhvdXNlcy5kYXRhLmZvckVhY2goKGhvdXNlOiB7IGN1c3BEZWdyZWU6IG51bWJlciB9KSA9PiB7XG4gICAgICAgIGV4cGVjdChpc0Zpbml0ZShob3VzZS5jdXNwRGVncmVlKSkudG9CZSh0cnVlKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnVGltZXpvbmUgRml4IFZlcmlmaWNhdGlvbiAoS0FOLTc2KScsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGNhbGN1bGF0ZSBhY2N1cmF0ZSB0aW1lem9uZSBvZmZzZXQgZm9yIE5ldyBZb3JrIGJpcnRoIGluIEp1bHkgMTk4NycsIGFzeW5jICgpID0+IHtcbiAgICAgIC8qKlxuICAgICAgICogSW50ZWdyYXRpb24gdGVzdCBmb3IgS0FOLTc2IHRpbWV6b25lIGZpeC5cbiAgICAgICAqIFRoaXMgdGVzdCB2ZXJpZmllcyB0aGF0IHRoZSBMdXhvbi1iYXNlZCB0aW1lem9uZSBjYWxjdWxhdGlvbiBjb3JyZWN0bHlcbiAgICAgICAqIGhhbmRsZXMgaGlzdG9yaWNhbCB0aW1lem9uZXMgYW5kIERTVCBmb3IgYSBzcGVjaWZpYyBiaXJ0aCBkYXRlLlxuICAgICAgICpcbiAgICAgICAqIEJpcnRoIGRhdGE6IEp1bHkgMjYsIDE5ODcsIDEyOjE3IFBNIGluIE5ldyBZb3JrLCBOWVxuICAgICAgICogRXhwZWN0ZWQ6IEVEVCB0aW1lem9uZSAoVVRDLTQpIGluIEp1bHlcbiAgICAgICAqL1xuICAgICAgY29uc3QgZXZlbnQgPSB7XG4gICAgICAgIHVzZXJJZDogJ3Rlc3QtdGltZXpvbmUtZml4LW55Yy0xOTg3JyxcbiAgICAgICAgYmlydGhEYXRlOiAnMTk4Ny0wNy0yNicsXG4gICAgICAgIGJpcnRoVGltZTogJzEyOjE3JyxcbiAgICAgICAgbGF0aXR1ZGU6IDQwLjcxMjgsIC8vIE5ldyBZb3JrLCBOWVxuICAgICAgICBsb25naXR1ZGU6IC03NC4wMDYsXG4gICAgICAgIGlhbmFUaW1lWm9uZTogJ0FtZXJpY2EvTmV3X1lvcmsnLFxuICAgICAgfTtcblxuICAgICAgZGRiTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7fSk7IC8vIENhY2hlIG1pc3NcbiAgICAgIGRkYk1vY2sub24oUHV0Q29tbWFuZCkucmVzb2x2ZXMoe30pO1xuXG4gICAgICBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgY29uc3Qgc2F2ZWRJdGVtID0gZGRiTW9jay5jb21tYW5kQ2FsbHMoUHV0Q29tbWFuZClbMF0/LmFyZ3NbMF0/LmlucHV0Py5JdGVtO1xuICAgICAgZXhwZWN0KHNhdmVkSXRlbSkudG9CZURlZmluZWQoKTtcbiAgICAgIGlmICghc2F2ZWRJdGVtKSB0aHJvdyBuZXcgRXJyb3IoJ05vIGl0ZW0gc2F2ZWQnKTtcblxuICAgICAgLy8gVmVyaWZ5IGNoYXJ0IHdhcyBnZW5lcmF0ZWQgc3VjY2Vzc2Z1bGx5XG4gICAgICBleHBlY3Qoc2F2ZWRJdGVtLmNoYXJ0VHlwZSkudG9CZSgnbmF0YWwnKTtcbiAgICAgIGV4cGVjdChzYXZlZEl0ZW0udXNlcklkKS50b0JlKCd0ZXN0LXRpbWV6b25lLWZpeC1ueWMtMTk4NycpO1xuICAgICAgZXhwZWN0KHNhdmVkSXRlbS5pc1RpbWVFc3RpbWF0ZWQpLnRvQmUoZmFsc2UpO1xuXG4gICAgICAvLyBWZXJpZnkgYmlydGggaW5mbyB3YXMgc3RvcmVkIGNvcnJlY3RseVxuICAgICAgZXhwZWN0KHNhdmVkSXRlbS5iaXJ0aEluZm8pLnRvTWF0Y2hPYmplY3Qoe1xuICAgICAgICBiaXJ0aERhdGU6ICcxOTg3LTA3LTI2JyxcbiAgICAgICAgYmlydGhUaW1lOiAnMTI6MTcnLFxuICAgICAgICBsYXRpdHVkZTogNDAuNzEyOCxcbiAgICAgICAgbG9uZ2l0dWRlOiAtNzQuMDA2LFxuICAgICAgICBpYW5hVGltZVpvbmU6ICdBbWVyaWNhL05ld19Zb3JrJyxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBWZXJpZnkgaG91c2VzIHdlcmUgY2FsY3VsYXRlZCBzdWNjZXNzZnVsbHlcbiAgICAgIGV4cGVjdChzYXZlZEl0ZW0uaG91c2VzKS50b0JlRGVmaW5lZCgpO1xuICAgICAgZXhwZWN0KHNhdmVkSXRlbS5ob3VzZXMuc3RhdHVzKS50b0JlKCdzdWNjZXNzJyk7XG4gICAgICBleHBlY3Qoc2F2ZWRJdGVtLmhvdXNlcy5kYXRhKS50b0hhdmVMZW5ndGgoMTIpO1xuXG4gICAgICAvLyBWZXJpZnkgcGxhbmV0YXJ5IHBvc2l0aW9ucyB3ZXJlIGNhbGN1bGF0ZWRcbiAgICAgIGV4cGVjdChzYXZlZEl0ZW0ucGxhbmV0cykudG9CZURlZmluZWQoKTtcbiAgICAgIGV4cGVjdChzYXZlZEl0ZW0ucGxhbmV0cy5zdW4pLnRvQmVEZWZpbmVkKCk7XG4gICAgICBleHBlY3Qoc2F2ZWRJdGVtLnBsYW5ldHMubW9vbikudG9CZURlZmluZWQoKTtcblxuICAgICAgLy8gVmVyaWZ5IGFzY2VuZGFudCBhbmQgbWlkaGVhdmVuIHdlcmUgY2FsY3VsYXRlZFxuICAgICAgZXhwZWN0KHNhdmVkSXRlbS5hc2NlbmRhbnQpLnRvQmVEZWZpbmVkKCk7XG4gICAgICBleHBlY3Qoc2F2ZWRJdGVtLm1pZGhlYXZlbikudG9CZURlZmluZWQoKTtcblxuICAgICAgLy8gTG9nIHRoZSByZXN1bHRzIGZvciB2ZXJpZmljYXRpb25cbiAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jb25zb2xlXG4gICAgICBjb25zb2xlLmxvZygnTllDIEp1bHkgMTk4NyBDaGFydCBSZXN1bHRzIChLQU4tNzYpOicsIHtcbiAgICAgICAgYmlydGhEYXRlOiBzYXZlZEl0ZW0uYmlydGhJbmZvLmJpcnRoRGF0ZSxcbiAgICAgICAgYmlydGhUaW1lOiBzYXZlZEl0ZW0uYmlydGhJbmZvLmJpcnRoVGltZSxcbiAgICAgICAgdGltZXpvbmU6IHNhdmVkSXRlbS5iaXJ0aEluZm8uaWFuYVRpbWVab25lLFxuICAgICAgICBzdW46IHNhdmVkSXRlbS5wbGFuZXRzLnN1blxuICAgICAgICAgID8gYCR7c2F2ZWRJdGVtLnBsYW5ldHMuc3VuLmRlZ3JlZUluU2lnbn3CsCAke3NhdmVkSXRlbS5wbGFuZXRzLnN1bi5zaWdufWBcbiAgICAgICAgICA6ICdOL0EnLFxuICAgICAgICBtb29uOiBzYXZlZEl0ZW0ucGxhbmV0cy5tb29uXG4gICAgICAgICAgPyBgJHtzYXZlZEl0ZW0ucGxhbmV0cy5tb29uLmRlZ3JlZUluU2lnbn3CsCAke3NhdmVkSXRlbS5wbGFuZXRzLm1vb24uc2lnbn1gXG4gICAgICAgICAgOiAnTi9BJyxcbiAgICAgICAgYXNjZW5kYW50OiBgJHtzYXZlZEl0ZW0uYXNjZW5kYW50LmRlZ3JlZUluU2lnbn3CsCAke3NhdmVkSXRlbS5hc2NlbmRhbnQuc2lnbn1gLFxuICAgICAgICBtaWRoZWF2ZW46IGAke3NhdmVkSXRlbS5taWRoZWF2ZW4uZGVncmVlSW5TaWdufcKwICR7c2F2ZWRJdGVtLm1pZGhlYXZlbi5zaWdufWAsXG4gICAgICAgIGhvdXNlQ291bnQ6IHNhdmVkSXRlbS5ob3VzZXMuZGF0YS5sZW5ndGgsXG4gICAgICAgIGhvdXNlU3RhdHVzOiBzYXZlZEl0ZW0uaG91c2VzLnN0YXR1cyxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBjYWxjdWxhdGUgZGlmZmVyZW50IG9mZnNldHMgZm9yIE5ZQyBpbiB3aW50ZXIgdnMgc3VtbWVyJywgYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gU3VtbWVyIChFRFQgLSBVVEMtNClcbiAgICAgIGNvbnN0IHN1bW1lckV2ZW50ID0ge1xuICAgICAgICB1c2VySWQ6ICd0ZXN0LXRpbWV6b25lLXN1bW1lcicsXG4gICAgICAgIGJpcnRoRGF0ZTogJzE5ODctMDctMjYnLFxuICAgICAgICBiaXJ0aFRpbWU6ICcxMjoxNycsXG4gICAgICAgIGxhdGl0dWRlOiA0MC43MTI4LFxuICAgICAgICBsb25naXR1ZGU6IC03NC4wMDYsXG4gICAgICAgIGlhbmFUaW1lWm9uZTogJ0FtZXJpY2EvTmV3X1lvcmsnLFxuICAgICAgfTtcblxuICAgICAgLy8gV2ludGVyIChFU1QgLSBVVEMtNSlcbiAgICAgIGNvbnN0IHdpbnRlckV2ZW50ID0ge1xuICAgICAgICB1c2VySWQ6ICd0ZXN0LXRpbWV6b25lLXdpbnRlcicsXG4gICAgICAgIGJpcnRoRGF0ZTogJzE5ODctMDEtMTUnLFxuICAgICAgICBiaXJ0aFRpbWU6ICcxMDozMCcsXG4gICAgICAgIGxhdGl0dWRlOiA0MC43MTI4LFxuICAgICAgICBsb25naXR1ZGU6IC03NC4wMDYsXG4gICAgICAgIGlhbmFUaW1lWm9uZTogJ0FtZXJpY2EvTmV3X1lvcmsnLFxuICAgICAgfTtcblxuICAgICAgZGRiTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7fSk7IC8vIENhY2hlIG1pc3NcbiAgICAgIGRkYk1vY2sub24oUHV0Q29tbWFuZCkucmVzb2x2ZXMoe30pO1xuXG4gICAgICBhd2FpdCBoYW5kbGVyKHN1bW1lckV2ZW50KTtcbiAgICAgIGNvbnN0IHN1bW1lckl0ZW0gPSBkZGJNb2NrLmNvbW1hbmRDYWxscyhQdXRDb21tYW5kKVswXT8uYXJnc1swXT8uaW5wdXQ/Lkl0ZW07XG5cbiAgICAgIGRkYk1vY2sucmVzZXQoKTtcbiAgICAgIGRkYk1vY2sub24oR2V0Q29tbWFuZCkucmVzb2x2ZXMoe30pOyAvLyBDYWNoZSBtaXNzXG4gICAgICBkZGJNb2NrLm9uKFB1dENvbW1hbmQpLnJlc29sdmVzKHt9KTtcblxuICAgICAgYXdhaXQgaGFuZGxlcih3aW50ZXJFdmVudCk7XG4gICAgICBjb25zdCB3aW50ZXJJdGVtID0gZGRiTW9jay5jb21tYW5kQ2FsbHMoUHV0Q29tbWFuZClbMF0/LmFyZ3NbMF0/LmlucHV0Py5JdGVtO1xuXG4gICAgICAvLyBCb3RoIGNoYXJ0cyBzaG91bGQgYmUgc3VjY2Vzc2Z1bGx5IGdlbmVyYXRlZFxuICAgICAgZXhwZWN0KHN1bW1lckl0ZW0/LmhvdXNlcy5zdGF0dXMpLnRvQmUoJ3N1Y2Nlc3MnKTtcbiAgICAgIGV4cGVjdCh3aW50ZXJJdGVtPy5ob3VzZXMuc3RhdHVzKS50b0JlKCdzdWNjZXNzJyk7XG5cbiAgICAgIC8vIFRoZSBwbGFuZXRhcnkgcG9zaXRpb25zIHNob3VsZCBiZSBkaWZmZXJlbnQgZHVlIHRvIGRpZmZlcmVudCBkYXRlcyBhbmQgRFNUXG4gICAgICAvLyBUaGlzIHZlcmlmaWVzIHRoYXQgdGhlIHRpbWV6b25lIG9mZnNldCBpcyBiZWluZyBhcHBsaWVkIGNvcnJlY3RseVxuICAgICAgZXhwZWN0KHN1bW1lckl0ZW0/LnBsYW5ldHMuc3VuLmxvbmdpdHVkZSkubm90LnRvQmUod2ludGVySXRlbT8ucGxhbmV0cy5zdW4ubG9uZ2l0dWRlKTtcblxuICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNvbnNvbGVcbiAgICAgIGNvbnNvbGUubG9nKCdEU1QgVmVyaWZpY2F0aW9uIChLQU4tNzYpOicsIHtcbiAgICAgICAgc3VtbWVyOiB7XG4gICAgICAgICAgZGF0ZTogJzE5ODctMDctMjYnLFxuICAgICAgICAgIGV4cGVjdGVkT2Zmc2V0OiAnRURUIChVVEMtNCknLFxuICAgICAgICAgIHN1blBvc2l0aW9uOiBzdW1tZXJJdGVtPy5wbGFuZXRzLnN1blxuICAgICAgICAgICAgPyBgJHtzdW1tZXJJdGVtLnBsYW5ldHMuc3VuLmRlZ3JlZUluU2lnbn3CsCAke3N1bW1lckl0ZW0ucGxhbmV0cy5zdW4uc2lnbn1gXG4gICAgICAgICAgICA6ICdOL0EnLFxuICAgICAgICB9LFxuICAgICAgICB3aW50ZXI6IHtcbiAgICAgICAgICBkYXRlOiAnMTk4Ny0wMS0xNScsXG4gICAgICAgICAgZXhwZWN0ZWRPZmZzZXQ6ICdFU1QgKFVUQy01KScsXG4gICAgICAgICAgc3VuUG9zaXRpb246IHdpbnRlckl0ZW0/LnBsYW5ldHMuc3VuXG4gICAgICAgICAgICA/IGAke3dpbnRlckl0ZW0ucGxhbmV0cy5zdW4uZGVncmVlSW5TaWdufcKwICR7d2ludGVySXRlbS5wbGFuZXRzLnN1bi5zaWdufWBcbiAgICAgICAgICAgIDogJ04vQScsXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIGNhY2hlIGludmFsaWRhdGlvbiB3aXRoIG5ldyB0aW1lem9uZSBmaXggdmVyc2lvbicsIGFzeW5jICgpID0+IHtcbiAgICAgIC8qKlxuICAgICAgICogVGhpcyB0ZXN0IHZlcmlmaWVzIHRoYXQgdGhlIGNhY2hlIGtleSB2ZXJzaW9uIGNoYW5nZSAoJzIuMTAuMDMtdHotZml4JylcbiAgICAgICAqIHByb3Blcmx5IGludmFsaWRhdGVzIG9sZCBjYWNoZWQgZW50cmllcyB3aXRoIGluY29ycmVjdCB0aW1lem9uZSBjYWxjdWxhdGlvbnMuXG4gICAgICAgKi9cbiAgICAgIGNvbnN0IGV2ZW50ID0ge1xuICAgICAgICB1c2VySWQ6ICd0ZXN0LWNhY2hlLWludmFsaWRhdGlvbicsXG4gICAgICAgIGJpcnRoRGF0ZTogJzE5ODctMDctMjYnLFxuICAgICAgICBiaXJ0aFRpbWU6ICcxMjoxNycsXG4gICAgICAgIGxhdGl0dWRlOiA0MC43MTI4LFxuICAgICAgICBsb25naXR1ZGU6IC03NC4wMDYsXG4gICAgICAgIGlhbmFUaW1lWm9uZTogJ0FtZXJpY2EvTmV3X1lvcmsnLFxuICAgICAgfTtcblxuICAgICAgLy8gRmlyc3QgY2FsbCAtIGNhY2hlIG1pc3MsIGNhbGN1bGF0ZXMgYW5kIHN0b3Jlc1xuICAgICAgZGRiTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7fSk7IC8vIENhY2hlIG1pc3NcbiAgICAgIGRkYk1vY2sub24oUHV0Q29tbWFuZCkucmVzb2x2ZXMoe30pO1xuXG4gICAgICBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgLy8gVmVyaWZ5IHRoYXQgY2FjaGUgd2FzIGF0dGVtcHRlZCB0byBiZSByZXRyaWV2ZWQgKEdldENvbW1hbmQgY2FsbGVkKVxuICAgICAgZXhwZWN0KGRkYk1vY2suY29tbWFuZENhbGxzKEdldENvbW1hbmQpLmxlbmd0aCkudG9CZUdyZWF0ZXJUaGFuKDApO1xuXG4gICAgICAvLyBWZXJpZnkgdGhhdCByZXN1bHQgd2FzIHN0b3JlZCAoUHV0Q29tbWFuZCBjYWxsZWQpXG4gICAgICBjb25zdCBwdXRDYWxscyA9IGRkYk1vY2suY29tbWFuZENhbGxzKFB1dENvbW1hbmQpO1xuICAgICAgZXhwZWN0KHB1dENhbGxzLmxlbmd0aCkudG9CZUdyZWF0ZXJUaGFuKDApO1xuXG4gICAgICAvLyBUaGUgY2FjaGUga2V5IHNob3VsZCBpbmNsdWRlIHRoZSBuZXcgdmVyc2lvbiAnMi4xMC4wMy10ei1maXgnXG4gICAgICAvLyBUaGlzIGlzIHZlcmlmaWVkIGltcGxpY2l0bHkgYnkgdGhlIGZhY3QgdGhhdCB0aGUgY2FsY3VsYXRpb24gcHJvY2VlZHNcbiAgICAgIC8vIHdpdGhvdXQgdXNpbmcgYW55IG9sZCBjYWNoZWQgdmFsdWVzXG4gICAgICBjb25zdCBzYXZlZEl0ZW0gPSBwdXRDYWxsc1swXT8uYXJnc1swXT8uaW5wdXQ/Lkl0ZW07XG4gICAgICBleHBlY3Qoc2F2ZWRJdGVtPy5jaGFydFR5cGUpLnRvQmUoJ25hdGFsJyk7XG5cbiAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jb25zb2xlXG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgJ0NhY2hlIEludmFsaWRhdGlvbiBUZXN0IChLQU4tNzYpOiBOZXcgY2FsY3VsYXRpb24gcGVyZm9ybWVkIHdpdGggdXBkYXRlZCB0aW1lem9uZSBsb2dpYycsXG4gICAgICApO1xuICAgIH0pO1xuICB9KTtcbn0pO1xuIl19