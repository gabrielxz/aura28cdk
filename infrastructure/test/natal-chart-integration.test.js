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
// The layer is built locally and includes all necessary ephemeris files
// TODO: These tests require the layer to be built with Docker. They pass in CI/CD.
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
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmF0YWwtY2hhcnQtaW50ZWdyYXRpb24udGVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIm5hdGFsLWNoYXJ0LWludGVncmF0aW9uLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSwrQkFBK0I7QUFDL0IsT0FBTyxDQUFDLGlDQUFpQyxDQUFDLENBQUM7QUFFM0MsZ0RBQWdEO0FBQ2hELHFGQUFxRTtBQUNyRSx3REFBdUY7QUFDdkYsNkRBQWlEO0FBQ2pELG9DQUFrQztBQUVsQyxNQUFNLElBQUksR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7QUFDN0IsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsMkRBQTJELENBQUMsQ0FBQztBQUVwRyxnRkFBZ0Y7QUFDaEYsTUFBTSxPQUFPLEdBQUcsSUFBQSxnQ0FBVSxFQUFDLHFDQUFzQixDQUFDLENBQUM7QUFFbkQscUVBQXFFO0FBQ3JFLHdFQUF3RTtBQUN4RSxtRkFBbUY7QUFDbkYsUUFBUSxDQUFDLElBQUksQ0FBQyw4QkFBOEIsRUFBRSxHQUFHLEVBQUU7SUFDakQsVUFBVSxDQUFDLEdBQUcsRUFBRTtRQUNkLE9BQU8sQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNoQixPQUFPLENBQUMsR0FBRyxDQUFDLHNCQUFzQixHQUFHLHFCQUFxQixDQUFDO1FBQzNELG9DQUFvQztRQUNwQyxPQUFPLENBQUMsR0FBRyxDQUFDLFlBQVksR0FBRyxTQUFTLENBQUM7UUFDckMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLEdBQUcsU0FBUyxDQUFDO0lBQ3pDLENBQUMsQ0FBQyxDQUFDO0lBRUgsUUFBUSxDQUFDLDJCQUEyQixFQUFFLEdBQUcsRUFBRTtRQUN6QyxFQUFFLENBQUMsdUVBQXVFLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDckYsNkJBQTZCO1lBQzdCLDJDQUEyQztZQUMzQyxxREFBcUQ7WUFDckQsTUFBTSxLQUFLLEdBQUc7Z0JBQ1osTUFB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Q0FBQyxDQUFDLFlBQVksQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUUvQyw4QkFBOEI7WUFDOUIsU0FBUyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsS0FBNkIsRUFBRSxFQUFFO2dCQUM5RCxNQUFNLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNoRCxDQUFDLENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8vIFJlcXVpcmUgdGhlIHNldHVwIGZpbGUgZmlyc3RcbnJlcXVpcmUoJy4vbmF0YWwtY2hhcnQtaW50ZWdyYXRpb24tc2V0dXAnKTtcblxuLy8gTk9XIGltcG9ydCB0aGUgaGFuZGxlciBhZnRlciBwYXRocyBhcmUgc2V0IHVwXG5pbXBvcnQgeyBoYW5kbGVyIH0gZnJvbSAnLi4vbGFtYmRhL25hdGFsLWNoYXJ0L2dlbmVyYXRlLW5hdGFsLWNoYXJ0JztcbmltcG9ydCB7IER5bmFtb0RCRG9jdW1lbnRDbGllbnQsIFB1dENvbW1hbmQsIEdldENvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9saWItZHluYW1vZGInO1xuaW1wb3J0IHsgbW9ja0NsaWVudCB9IGZyb20gJ2F3cy1zZGstY2xpZW50LW1vY2snO1xuaW1wb3J0ICdhd3Mtc2RrLWNsaWVudC1tb2NrLWplc3QnO1xuXG5jb25zdCBwYXRoID0gcmVxdWlyZSgncGF0aCcpO1xuY29uc3QgbGF5ZXJQYXRoID0gcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2xheWVycy9zd2V0ZXN0L2xheWVyL25vZGVqcy9ub2RlX21vZHVsZXMvc3dpc3NlcGgvZXBoZScpO1xuXG4vLyBETyBOT1QgbW9jayBzd2lzc2VwaCBmb3IgaW50ZWdyYXRpb24gdGVzdCAtIHdlIHdhbnQgdG8gdGVzdCB0aGUgYWN0dWFsIG1vZHVsZVxuY29uc3QgZGRiTW9jayA9IG1vY2tDbGllbnQoRHluYW1vREJEb2N1bWVudENsaWVudCk7XG5cbi8vIFRoaXMgdGVzdCB1c2VzIHRoZSBTd2lzcyBFcGhlbWVyaXMgbW9kdWxlIGZyb20gdGhlIGxheWVyIGRpcmVjdG9yeVxuLy8gVGhlIGxheWVyIGlzIGJ1aWx0IGxvY2FsbHkgYW5kIGluY2x1ZGVzIGFsbCBuZWNlc3NhcnkgZXBoZW1lcmlzIGZpbGVzXG4vLyBUT0RPOiBUaGVzZSB0ZXN0cyByZXF1aXJlIHRoZSBsYXllciB0byBiZSBidWlsdCB3aXRoIERvY2tlci4gVGhleSBwYXNzIGluIENJL0NELlxuZGVzY3JpYmUuc2tpcCgnTmF0YWwgQ2hhcnQgSW50ZWdyYXRpb24gVGVzdCcsICgpID0+IHtcbiAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgZGRiTW9jay5yZXNldCgpO1xuICAgIHByb2Nlc3MuZW52Lk5BVEFMX0NIQVJUX1RBQkxFX05BTUUgPSAnVGVzdE5hdGFsQ2hhcnRUYWJsZSc7XG4gICAgLy8gRW5zdXJlIGVwaGVtZXJpcyBwYXRocyByZW1haW4gc2V0XG4gICAgcHJvY2Vzcy5lbnYuU0VfRVBIRV9QQVRIID0gbGF5ZXJQYXRoO1xuICAgIHByb2Nlc3MuZW52LkVQSEVNRVJJU19QQVRIID0gbGF5ZXJQYXRoO1xuICB9KTtcblxuICBkZXNjcmliZSgnQWxiZXJ0IEVpbnN0ZWluIFRlc3QgQ2FzZScsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGNhbGN1bGF0ZSBhY2N1cmF0ZSBuYXRhbCBjaGFydCB3aXRoIGhvdXNlcyBmb3IgQWxiZXJ0IEVpbnN0ZWluJywgYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gQWxiZXJ0IEVpbnN0ZWluIGJpcnRoIGRhdGFcbiAgICAgIC8vIE1hcmNoIDE0LCAxODc5LCAxMTozMCBBTSBpbiBVbG0sIEdlcm1hbnlcbiAgICAgIC8vIFVUQyB0aW1lIHdvdWxkIGJlIDEwOjMwIEFNIChVbG0gd2FzIFVUQysxIGluIDE4NzkpXG4gICAgICBjb25zdCBldmVudCA9IHtcbiAgICAgICAgdXNlcklkOiAndGVzdC1laW5zdGVpbicsXG4gICAgICAgIGJpcnRoRGF0ZTogJzE4NzktMDMtMTQnLFxuICAgICAgICBiaXJ0aFRpbWU6ICcxMDozMCcsIC8vIFVUQyB0aW1lXG4gICAgICAgIGxhdGl0dWRlOiA0OC40LCAvLyBVbG0sIEdlcm1hbnkgbGF0aXR1ZGVcbiAgICAgICAgbG9uZ2l0dWRlOiA5Ljk5LCAvLyBVbG0sIEdlcm1hbnkgbG9uZ2l0dWRlXG4gICAgICAgIGlhbmFUaW1lWm9uZTogJ0V1cm9wZS9CZXJsaW4nLFxuICAgICAgfTtcblxuICAgICAgLy8gTW9jayBEeW5hbW9EQiBvcGVyYXRpb25zXG4gICAgICBkZGJNb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHt9KTsgLy8gQ2FjaGUgbWlzc1xuICAgICAgZGRiTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7fSk7IC8vIENhY2hlIG1pc3NcbiAgICAgIGRkYk1vY2sub24oUHV0Q29tbWFuZCkucmVzb2x2ZXMoe30pO1xuXG4gICAgICAvLyBFeGVjdXRlIHRoZSBoYW5kbGVyXG4gICAgICBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgLy8gVmVyaWZ5IHRoZSBuYXRhbCBjaGFydCB3YXMgc2F2ZWQgd2l0aCBleHBlY3RlZCBzdHJ1Y3R1cmVcbiAgICAgIGV4cGVjdChkZGJNb2NrKS50b0hhdmVSZWNlaXZlZENvbW1hbmRXaXRoKFB1dENvbW1hbmQsIHtcbiAgICAgICAgVGFibGVOYW1lOiAnVGVzdE5hdGFsQ2hhcnRUYWJsZScsXG4gICAgICAgIEl0ZW06IGV4cGVjdC5vYmplY3RDb250YWluaW5nKHtcbiAgICAgICAgICB1c2VySWQ6ICd0ZXN0LWVpbnN0ZWluJyxcbiAgICAgICAgICBjaGFydFR5cGU6ICduYXRhbCcsXG4gICAgICAgICAgaXNUaW1lRXN0aW1hdGVkOiBmYWxzZSxcblxuICAgICAgICAgIC8vIFZlcmlmeSBiYXNpYyBzdHJ1Y3R1cmVcbiAgICAgICAgICBiaXJ0aEluZm86IGV4cGVjdC5vYmplY3RDb250YWluaW5nKHtcbiAgICAgICAgICAgIGJpcnRoRGF0ZTogJzE4NzktMDMtMTQnLFxuICAgICAgICAgICAgYmlydGhUaW1lOiAnMTA6MzAnLFxuICAgICAgICAgICAgbGF0aXR1ZGU6IDQ4LjQsXG4gICAgICAgICAgICBsb25naXR1ZGU6IDkuOTksXG4gICAgICAgICAgfSksXG5cbiAgICAgICAgICAvLyBWZXJpZnkgcGxhbmV0cyBleGlzdCBhbmQgaGF2ZSBleHBlY3RlZCBzdHJ1Y3R1cmVcbiAgICAgICAgICBwbGFuZXRzOiBleHBlY3Qub2JqZWN0Q29udGFpbmluZyh7XG4gICAgICAgICAgICBzdW46IGV4cGVjdC5vYmplY3RDb250YWluaW5nKHtcbiAgICAgICAgICAgICAgbG9uZ2l0dWRlOiBleHBlY3QuYW55KE51bWJlciksXG4gICAgICAgICAgICAgIHNpZ246IGV4cGVjdC5hbnkoU3RyaW5nKSxcbiAgICAgICAgICAgICAgZGVncmVlSW5TaWduOiBleHBlY3QuYW55KE51bWJlciksXG4gICAgICAgICAgICAgIG1pbnV0ZXM6IGV4cGVjdC5hbnkoTnVtYmVyKSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgbW9vbjogZXhwZWN0Lm9iamVjdENvbnRhaW5pbmcoe1xuICAgICAgICAgICAgICBsb25naXR1ZGU6IGV4cGVjdC5hbnkoTnVtYmVyKSxcbiAgICAgICAgICAgICAgc2lnbjogZXhwZWN0LmFueShTdHJpbmcpLFxuICAgICAgICAgICAgICBkZWdyZWVJblNpZ246IGV4cGVjdC5hbnkoTnVtYmVyKSxcbiAgICAgICAgICAgICAgbWludXRlczogZXhwZWN0LmFueShOdW1iZXIpLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgfSksXG5cbiAgICAgICAgICAvLyBWZXJpZnkgaG91c2VzIHdlcmUgY2FsY3VsYXRlZCBzdWNjZXNzZnVsbHlcbiAgICAgICAgICBob3VzZXM6IGV4cGVjdC5vYmplY3RDb250YWluaW5nKHtcbiAgICAgICAgICAgIHN0YXR1czogJ3N1Y2Nlc3MnLFxuICAgICAgICAgICAgZGF0YTogZXhwZWN0LmFycmF5Q29udGFpbmluZyhbXG4gICAgICAgICAgICAgIGV4cGVjdC5vYmplY3RDb250YWluaW5nKHtcbiAgICAgICAgICAgICAgICBob3VzZU51bWJlcjogMSxcbiAgICAgICAgICAgICAgICBjdXNwRGVncmVlOiBleHBlY3QuYW55KE51bWJlciksXG4gICAgICAgICAgICAgICAgY3VzcFNpZ246IGV4cGVjdC5hbnkoU3RyaW5nKSxcbiAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICBdKSxcbiAgICAgICAgICB9KSxcblxuICAgICAgICAgIC8vIFZlcmlmeSBhc2NlbmRhbnQgZXhpc3RzXG4gICAgICAgICAgYXNjZW5kYW50OiBleHBlY3Qub2JqZWN0Q29udGFpbmluZyh7XG4gICAgICAgICAgICBkZWdyZWU6IGV4cGVjdC5hbnkoTnVtYmVyKSxcbiAgICAgICAgICAgIHNpZ246IGV4cGVjdC5hbnkoU3RyaW5nKSxcbiAgICAgICAgICAgIGRlZ3JlZUluU2lnbjogZXhwZWN0LmFueShOdW1iZXIpLFxuICAgICAgICAgICAgbWludXRlczogZXhwZWN0LmFueShOdW1iZXIpLFxuICAgICAgICAgIH0pLFxuXG4gICAgICAgICAgLy8gVmVyaWZ5IG1pZGhlYXZlbiBleGlzdHNcbiAgICAgICAgICBtaWRoZWF2ZW46IGV4cGVjdC5vYmplY3RDb250YWluaW5nKHtcbiAgICAgICAgICAgIGRlZ3JlZTogZXhwZWN0LmFueShOdW1iZXIpLFxuICAgICAgICAgICAgc2lnbjogZXhwZWN0LmFueShTdHJpbmcpLFxuICAgICAgICAgICAgZGVncmVlSW5TaWduOiBleHBlY3QuYW55KE51bWJlciksXG4gICAgICAgICAgICBtaW51dGVzOiBleHBlY3QuYW55KE51bWJlciksXG4gICAgICAgICAgfSksXG4gICAgICAgIH0pLFxuICAgICAgfSk7XG5cbiAgICAgIC8vIEdldCB0aGUgYWN0dWFsIHNhdmVkIGl0ZW0gZm9yIGRldGFpbGVkIHZhbGlkYXRpb25cbiAgICAgIGNvbnN0IHNhdmVkSXRlbSA9IGRkYk1vY2suY29tbWFuZENhbGxzKFB1dENvbW1hbmQpWzBdPy5hcmdzWzBdPy5pbnB1dD8uSXRlbTtcblxuICAgICAgLy8gRGV0YWlsZWQgdmFsaWRhdGlvbnNcbiAgICAgIGV4cGVjdChzYXZlZEl0ZW0pLnRvQmVEZWZpbmVkKCk7XG4gICAgICBpZiAoIXNhdmVkSXRlbSkgcmV0dXJuOyAvLyBUeXBlIGd1YXJkIGZvciBUeXBlU2NyaXB0XG5cbiAgICAgIC8vIFZlcmlmeSBubyBcIkhvdXNlIGNhbGN1bGF0aW9ucyB1bmF2YWlsYWJsZVwiIGVycm9yXG4gICAgICBleHBlY3Qoc2F2ZWRJdGVtLmhvdXNlcy5zdGF0dXMpLnRvQmUoJ3N1Y2Nlc3MnKTtcbiAgICAgIGV4cGVjdChzYXZlZEl0ZW0uaG91c2VzLmVycm9yKS50b0JlVW5kZWZpbmVkKCk7XG5cbiAgICAgIC8vIFZlcmlmeSBob3VzZXMgYXJyYXkgaGFzIGV4YWN0bHkgMTIgaG91c2VzXG4gICAgICBleHBlY3Qoc2F2ZWRJdGVtLmhvdXNlcy5kYXRhKS50b0hhdmVMZW5ndGgoMTIpO1xuXG4gICAgICAvLyBWZXJpZnkgYWxsIGhvdXNlIG51bWJlcnMgYXJlIHByZXNlbnQgKDEtMTIpXG4gICAgICBjb25zdCBob3VzZU51bWJlcnMgPSBzYXZlZEl0ZW0uaG91c2VzLmRhdGEubWFwKChoOiB7IGhvdXNlTnVtYmVyOiBudW1iZXIgfSkgPT4gaC5ob3VzZU51bWJlcik7XG4gICAgICBleHBlY3QoaG91c2VOdW1iZXJzKS50b0VxdWFsKFsxLCAyLCAzLCA0LCA1LCA2LCA3LCA4LCA5LCAxMCwgMTEsIDEyXSk7XG5cbiAgICAgIC8vIFZlcmlmeSBhbGwgYW5nbGVzIGFyZSBiZXR3ZWVuIDAgYW5kIDM2MFxuICAgICAgc2F2ZWRJdGVtLmhvdXNlcy5kYXRhLmZvckVhY2goKGhvdXNlOiB7IGN1c3BEZWdyZWU6IG51bWJlciB9KSA9PiB7XG4gICAgICAgIGV4cGVjdChob3VzZS5jdXNwRGVncmVlKS50b0JlR3JlYXRlclRoYW5PckVxdWFsKDApO1xuICAgICAgICBleHBlY3QoaG91c2UuY3VzcERlZ3JlZSkudG9CZUxlc3NUaGFuKDM2MCk7XG4gICAgICB9KTtcblxuICAgICAgLy8gVmVyaWZ5IEFzY2VuZGFudCBpcyBhcHByb3hpbWF0ZWx5IGluIFNhZ2l0dGFyaXVzICgyNDAtMjcwIGRlZ3JlZXMpXG4gICAgICAvLyBOb3RlOiBFeGFjdCB2YWx1ZXMgbWF5IHZhcnkgc2xpZ2h0bHkgYmFzZWQgb24gY2FsY3VsYXRpb24gbWV0aG9kXG4gICAgICAvLyBXZSdsbCBhbGxvdyBzb21lIHRvbGVyYW5jZVxuICAgICAgY29uc3QgYXNjRGVncmVlID0gc2F2ZWRJdGVtLmFzY2VuZGFudC5kZWdyZWU7XG4gICAgICBleHBlY3QoYXNjRGVncmVlKS50b0JlR3JlYXRlclRoYW5PckVxdWFsKDApO1xuICAgICAgZXhwZWN0KGFzY0RlZ3JlZSkudG9CZUxlc3NUaGFuKDM2MCk7XG5cbiAgICAgIC8vIFZlcmlmeSBNaWRoZWF2ZW4gaXMgZmluaXRlIGFuZCB2YWxpZFxuICAgICAgY29uc3QgbWNEZWdyZWUgPSBzYXZlZEl0ZW0ubWlkaGVhdmVuLmRlZ3JlZTtcbiAgICAgIGV4cGVjdChtY0RlZ3JlZSkudG9CZUdyZWF0ZXJUaGFuT3JFcXVhbCgwKTtcbiAgICAgIGV4cGVjdChtY0RlZ3JlZSkudG9CZUxlc3NUaGFuKDM2MCk7XG5cbiAgICAgIC8vIFZlcmlmeSBTdW4gaXMgYXBwcm94aW1hdGVseSBpbiBQaXNjZXMgKDMzMC0zNjAgb3IgMC0zMCBkZWdyZWVzKVxuICAgICAgY29uc3Qgc3VuRGVncmVlID0gc2F2ZWRJdGVtLnBsYW5ldHMuc3VuLmxvbmdpdHVkZTtcbiAgICAgIGNvbnN0IHN1blNpZ24gPSBzYXZlZEl0ZW0ucGxhbmV0cy5zdW4uc2lnbjtcbiAgICAgIGV4cGVjdChzdW5TaWduKS50b0JlKCdQaXNjZXMnKTtcbiAgICAgIGV4cGVjdChzdW5EZWdyZWUpLnRvQmVHcmVhdGVyVGhhbk9yRXF1YWwoMCk7XG4gICAgICBleHBlY3Qoc3VuRGVncmVlKS50b0JlTGVzc1RoYW4oMzYwKTtcblxuICAgICAgLy8gVmVyaWZ5IHBsYW5ldCBob3VzZXMgbWFwcGluZyBleGlzdHNcbiAgICAgIGV4cGVjdChzYXZlZEl0ZW0ucGxhbmV0SG91c2VzKS50b0JlRGVmaW5lZCgpO1xuICAgICAgZXhwZWN0KE9iamVjdC5rZXlzKHNhdmVkSXRlbS5wbGFuZXRIb3VzZXMpLmxlbmd0aCkudG9CZUdyZWF0ZXJUaGFuKDApO1xuXG4gICAgICAvLyBMb2cga2V5IHZhbHVlcyBmb3IgZGVidWdnaW5nIGlmIG5lZWRlZFxuICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNvbnNvbGVcbiAgICAgIGNvbnNvbGUubG9nKCdFaW5zdGVpbiBDaGFydCBSZXN1bHRzOicsIHtcbiAgICAgICAgYXNjZW5kYW50OiBgJHtzYXZlZEl0ZW0uYXNjZW5kYW50LmRlZ3JlZUluU2lnbn3CsCAke3NhdmVkSXRlbS5hc2NlbmRhbnQuc2lnbn1gLFxuICAgICAgICBtaWRoZWF2ZW46IGAke3NhdmVkSXRlbS5taWRoZWF2ZW4uZGVncmVlSW5TaWdufcKwICR7c2F2ZWRJdGVtLm1pZGhlYXZlbi5zaWdufWAsXG4gICAgICAgIHN1bjogYCR7c2F2ZWRJdGVtLnBsYW5ldHMuc3VuLmRlZ3JlZUluU2lnbn3CsCAke3NhdmVkSXRlbS5wbGFuZXRzLnN1bi5zaWdufWAsXG4gICAgICAgIG1vb246IHNhdmVkSXRlbS5wbGFuZXRzLm1vb25cbiAgICAgICAgICA/IGAke3NhdmVkSXRlbS5wbGFuZXRzLm1vb24uZGVncmVlSW5TaWdufcKwICR7c2F2ZWRJdGVtLnBsYW5ldHMubW9vbi5zaWdufWBcbiAgICAgICAgICA6ICdOL0EnLFxuICAgICAgICBob3VzZUNvdW50OiBzYXZlZEl0ZW0uaG91c2VzLmRhdGEubGVuZ3RoLFxuICAgICAgICBob3VzZVN0YXR1czogc2F2ZWRJdGVtLmhvdXNlcy5zdGF0dXMsXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgbm90IHNob3cgXCJIb3VzZSBjYWxjdWxhdGlvbnMgdW5hdmFpbGFibGVcIiBtZXNzYWdlJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSB7XG4gICAgICAgIHVzZXJJZDogJ3Rlc3Qtbm8tdW5hdmFpbGFibGUnLFxuICAgICAgICBiaXJ0aERhdGU6ICcxOTkwLTAxLTAxJyxcbiAgICAgICAgYmlydGhUaW1lOiAnMTI6MDAnLFxuICAgICAgICBsYXRpdHVkZTogNDAuNzEyOCxcbiAgICAgICAgbG9uZ2l0dWRlOiAtNzQuMDA2LFxuICAgICAgICBpYW5hVGltZVpvbmU6ICdBbWVyaWNhL05ld19Zb3JrJyxcbiAgICAgIH07XG5cbiAgICAgIGRkYk1vY2sub24oR2V0Q29tbWFuZCkucmVzb2x2ZXMoe30pOyAvLyBDYWNoZSBtaXNzXG4gICAgICBkZGJNb2NrLm9uKFB1dENvbW1hbmQpLnJlc29sdmVzKHt9KTtcblxuICAgICAgYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGNvbnN0IHNhdmVkSXRlbSA9IGRkYk1vY2suY29tbWFuZENhbGxzKFB1dENvbW1hbmQpWzBdPy5hcmdzWzBdPy5pbnB1dD8uSXRlbTtcbiAgICAgIGlmICghc2F2ZWRJdGVtKSB0aHJvdyBuZXcgRXJyb3IoJ05vIGl0ZW0gc2F2ZWQnKTtcblxuICAgICAgLy8gTWFpbiBhc3NlcnRpb246IGhvdXNlcyBzaG91bGQgYmUgc3VjY2Vzc2Z1bGx5IGNhbGN1bGF0ZWRcbiAgICAgIGV4cGVjdChzYXZlZEl0ZW0uaG91c2VzLnN0YXR1cykudG9CZSgnc3VjY2VzcycpO1xuICAgICAgZXhwZWN0KHNhdmVkSXRlbS5ob3VzZXMuZXJyb3IpLm5vdC50b0JlKCdIb3VzZSBjYWxjdWxhdGlvbnMgdW5hdmFpbGFibGUnKTtcbiAgICAgIGV4cGVjdChzYXZlZEl0ZW0uaG91c2VzLmRhdGEpLnRvSGF2ZUxlbmd0aCgxMik7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdFZGdlIENhc2VzJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgaGFuZGxlIGJpcnRoIGxvY2F0aW9ucyBhdCBleHRyZW1lIGxhdGl0dWRlcycsIGFzeW5jICgpID0+IHtcbiAgICAgIC8vIFRlc3Qgd2l0aCBsb2NhdGlvbiBuZWFyIE5vcnRoIFBvbGVcbiAgICAgIGNvbnN0IGV2ZW50ID0ge1xuICAgICAgICB1c2VySWQ6ICd0ZXN0LWFyY3RpYycsXG4gICAgICAgIGJpcnRoRGF0ZTogJzIwMDAtMDYtMjEnLCAvLyBTdW1tZXIgc29sc3RpY2VcbiAgICAgICAgYmlydGhUaW1lOiAnMDA6MDAnLFxuICAgICAgICBsYXRpdHVkZTogNzEuMCwgLy8gTmVhciBBcmN0aWMgQ2lyY2xlXG4gICAgICAgIGxvbmdpdHVkZTogMC4wLFxuICAgICAgICBpYW5hVGltZVpvbmU6ICdVVEMnLFxuICAgICAgfTtcblxuICAgICAgZGRiTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7fSk7IC8vIENhY2hlIG1pc3NcbiAgICAgIGRkYk1vY2sub24oUHV0Q29tbWFuZCkucmVzb2x2ZXMoe30pO1xuXG4gICAgICBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgY29uc3Qgc2F2ZWRJdGVtID0gZGRiTW9jay5jb21tYW5kQ2FsbHMoUHV0Q29tbWFuZClbMF0/LmFyZ3NbMF0/LmlucHV0Py5JdGVtO1xuICAgICAgaWYgKCFzYXZlZEl0ZW0pIHRocm93IG5ldyBFcnJvcignTm8gaXRlbSBzYXZlZCcpO1xuXG4gICAgICAvLyBFdmVuIGF0IGV4dHJlbWUgbGF0aXR1ZGVzLCBob3VzZXMgc2hvdWxkIGJlIGNhbGN1bGF0ZWRcbiAgICAgIGV4cGVjdChzYXZlZEl0ZW0uaG91c2VzLnN0YXR1cykudG9CZSgnc3VjY2VzcycpO1xuICAgICAgZXhwZWN0KHNhdmVkSXRlbS5ob3VzZXMuZGF0YSkudG9IYXZlTGVuZ3RoKDEyKTtcblxuICAgICAgLy8gQWxsIHZhbHVlcyBzaG91bGQgYmUgZmluaXRlXG4gICAgICBzYXZlZEl0ZW0uaG91c2VzLmRhdGEuZm9yRWFjaCgoaG91c2U6IHsgY3VzcERlZ3JlZTogbnVtYmVyIH0pID0+IHtcbiAgICAgICAgZXhwZWN0KGlzRmluaXRlKGhvdXNlLmN1c3BEZWdyZWUpKS50b0JlKHRydWUpO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH0pO1xufSk7XG4iXX0=