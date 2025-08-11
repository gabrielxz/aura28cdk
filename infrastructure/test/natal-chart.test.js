"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const generate_natal_chart_1 = require("../lambda/natal-chart/generate-natal-chart");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const aws_sdk_client_mock_1 = require("aws-sdk-client-mock");
require("aws-sdk-client-mock-jest");
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
const ddbMock = (0, aws_sdk_client_mock_1.mockClient)(lib_dynamodb_1.DynamoDBDocumentClient);
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
        ddbMock.on(lib_dynamodb_1.GetCommand).resolves({}); // Cache miss
        ddbMock.on(lib_dynamodb_1.PutCommand).resolves({});
        await (0, generate_natal_chart_1.handler)(event);
        expect(ddbMock).toHaveReceivedCommandWith(lib_dynamodb_1.PutCommand, {
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
        await expect((0, generate_natal_chart_1.handler)(event)).rejects.toThrow('Birth time is required for house calculations');
    });
    it('should throw an error if userId is missing', async () => {
        const event = {
            birthDate: '1990-01-01',
            birthTime: '12:00',
            latitude: 34.0522,
            longitude: -118.2437,
            ianaTimeZone: 'America/Los_Angeles',
        };
        await expect((0, generate_natal_chart_1.handler)(event)).rejects.toThrow('Missing required event properties');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmF0YWwtY2hhcnQudGVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIm5hdGFsLWNoYXJ0LnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSxxRkFBcUU7QUFDckUsd0RBQXVGO0FBQ3ZGLDZEQUFpRDtBQUNqRCxvQ0FBa0M7QUFFbEMsNkJBQTZCO0FBQzdCLElBQUksQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUM7SUFDNUIsYUFBYSxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQztRQUM1QixRQUFRLEVBQUU7WUFDUixHQUFHLEVBQUU7Z0JBQ0gsbUJBQW1CLEVBQUUsSUFBSTtnQkFDekIsdUJBQXVCLEVBQUUsWUFBWTtnQkFDckMsb0JBQW9CLEVBQUUsV0FBVztnQkFDakMsSUFBSSxFQUFFLEtBQUs7YUFDWjtZQUNELElBQUksRUFBRTtnQkFDSixtQkFBbUIsRUFBRSxJQUFJO2dCQUN6Qix1QkFBdUIsRUFBRSxZQUFZO2dCQUNyQyxvQkFBb0IsRUFBRSxNQUFNO2dCQUM1QixJQUFJLEVBQUUsTUFBTTthQUNiO1NBQ0Y7S0FDRixDQUFDLENBQUM7Q0FDSixDQUFDLENBQUMsQ0FBQztBQUVKLCtDQUErQztBQUMvQyxJQUFJLENBQUMsSUFBSSxDQUFDLG1DQUFtQyxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksRUFBRSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO0FBQzlFLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksRUFBRSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO0FBRXJELE1BQU0sT0FBTyxHQUFHLElBQUEsZ0NBQVUsRUFBQyxxQ0FBc0IsQ0FBQyxDQUFDO0FBRW5ELFFBQVEsQ0FBQyw2QkFBNkIsRUFBRSxHQUFHLEVBQUU7SUFDM0MsVUFBVSxDQUFDLEdBQUcsRUFBRTtRQUNkLE9BQU8sQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNoQixPQUFPLENBQUMsR0FBRyxDQUFDLHNCQUFzQixHQUFHLHFCQUFxQixDQUFDO0lBQzdELENBQUMsQ0FBQyxDQUFDO0lBRUgsRUFBRSxDQUFDLHFFQUFxRSxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ25GLE1BQU0sS0FBSyxHQUFHO1lBQ1osTUFBTSxFQUFFLGFBQWE7WUFDckIsU0FBUyxFQUFFLFlBQVk7WUFDdkIsU0FBUyxFQUFFLE9BQU87WUFDbEIsUUFBUSxFQUFFLE9BQU87WUFDakIsU0FBUyxFQUFFLENBQUMsUUFBUTtZQUNwQixZQUFZLEVBQUUscUJBQXFCO1NBQ3BDLENBQUM7UUFFRixPQUFPLENBQUMsRUFBRSxDQUFDLHlCQUFVLENBQUMsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxhQUFhO1FBQ2xELE9BQU8sQ0FBQyxFQUFFLENBQUMseUJBQVUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUVwQyxNQUFNLElBQUEsOEJBQU8sRUFBQyxLQUFLLENBQUMsQ0FBQztRQUVyQixNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMseUJBQXlCLENBQUMseUJBQVUsRUFBRTtZQUNwRCxTQUFTLEVBQUUscUJBQXFCO1lBQ2hDLElBQUksRUFBRSxNQUFNLENBQUMsZ0JBQWdCLENBQUM7Z0JBQzVCLE1BQU0sRUFBRSxhQUFhO2dCQUNyQixlQUFlLEVBQUUsS0FBSztnQkFDdEIsU0FBUyxFQUFFLE9BQU87Z0JBQ2xCLE9BQU8sRUFBRSxNQUFNLENBQUMsZ0JBQWdCLENBQUM7b0JBQy9CLEdBQUcsRUFBRSxNQUFNLENBQUMsZ0JBQWdCLENBQUM7d0JBQzNCLFNBQVMsRUFBRSxFQUFFO3dCQUNiLElBQUksRUFBRSxLQUFLO3dCQUNYLElBQUksRUFBRSxPQUFPO3FCQUNkLENBQUM7b0JBQ0YsSUFBSSxFQUFFLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQzt3QkFDNUIsU0FBUyxFQUFFLElBQUk7d0JBQ2YsSUFBSSxFQUFFLE1BQU07d0JBQ1osSUFBSSxFQUFFLFFBQVE7cUJBQ2YsQ0FBQztpQkFDSCxDQUFDO2FBQ0gsQ0FBQztTQUNILENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0lBRUgsRUFBRSxDQUFDLGdEQUFnRCxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQzlELE1BQU0sS0FBSyxHQUFHO1lBQ1osTUFBTSxFQUFFLGFBQWE7WUFDckIsU0FBUyxFQUFFLFlBQVk7WUFDdkIsUUFBUSxFQUFFLE9BQU87WUFDakIsU0FBUyxFQUFFLENBQUMsTUFBTTtZQUNsQixZQUFZLEVBQUUsa0JBQWtCO1NBQ2pDLENBQUM7UUFFRixNQUFNLE1BQU0sQ0FBQyxJQUFBLDhCQUFPLEVBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLCtDQUErQyxDQUFDLENBQUM7SUFDaEcsQ0FBQyxDQUFDLENBQUM7SUFFSCxFQUFFLENBQUMsNENBQTRDLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDMUQsTUFBTSxLQUFLLEdBQUc7WUFDWixTQUFTLEVBQUUsWUFBWTtZQUN2QixTQUFTLEVBQUUsT0FBTztZQUNsQixRQUFRLEVBQUUsT0FBTztZQUNqQixTQUFTLEVBQUUsQ0FBQyxRQUFRO1lBQ3BCLFlBQVksRUFBRSxxQkFBcUI7U0FDcEMsQ0FBQztRQUVGLE1BQU0sTUFBTSxDQUFDLElBQUEsOEJBQU8sRUFBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsbUNBQW1DLENBQUMsQ0FBQztJQUNwRixDQUFDLENBQUMsQ0FBQztBQUNMLENBQUMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgaGFuZGxlciB9IGZyb20gJy4uL2xhbWJkYS9uYXRhbC1jaGFydC9nZW5lcmF0ZS1uYXRhbC1jaGFydCc7XG5pbXBvcnQgeyBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LCBQdXRDb21tYW5kLCBHZXRDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvbGliLWR5bmFtb2RiJztcbmltcG9ydCB7IG1vY2tDbGllbnQgfSBmcm9tICdhd3Mtc2RrLWNsaWVudC1tb2NrJztcbmltcG9ydCAnYXdzLXNkay1jbGllbnQtbW9jay1qZXN0JztcblxuLy8gTW9jayB0aGUgZXBoZW1lcmlzIGxpYnJhcnlcbmplc3QubW9jaygnZXBoZW1lcmlzJywgKCkgPT4gKHtcbiAgZ2V0QWxsUGxhbmV0czogamVzdC5mbigoKSA9PiAoe1xuICAgIG9ic2VydmVkOiB7XG4gICAgICBzdW46IHtcbiAgICAgICAgYXBwYXJlbnRMb25naXR1ZGVEZDogMTAuMCxcbiAgICAgICAgYXBwYXJlbnRMb25naXR1ZGVEbXMzNjA6ICcxMMKwMDBcXCcwMFwiJyxcbiAgICAgICAgZ2VvY2VudHJpY0Rpc3RhbmNlS206IDE0OTU5Nzg3MC43LFxuICAgICAgICBuYW1lOiAnc3VuJyxcbiAgICAgIH0sXG4gICAgICBtb29uOiB7XG4gICAgICAgIGFwcGFyZW50TG9uZ2l0dWRlRGQ6IDQ1LjUsXG4gICAgICAgIGFwcGFyZW50TG9uZ2l0dWRlRG1zMzYwOiAnNDXCsDMwXFwnMDBcIicsXG4gICAgICAgIGdlb2NlbnRyaWNEaXN0YW5jZUttOiAzODQ0MDAsXG4gICAgICAgIG5hbWU6ICdtb29uJyxcbiAgICAgIH0sXG4gICAgfSxcbiAgfSkpLFxufSkpO1xuXG4vLyBNb2NrIHRoZSBzd2lzc2VwaCBtb2R1bGUgKGZyb20gTGFtYmRhIExheWVyKVxuamVzdC5tb2NrKCcvb3B0L25vZGVqcy9ub2RlX21vZHVsZXMvc3dpc3NlcGgnLCAoKSA9PiBudWxsLCB7IHZpcnR1YWw6IHRydWUgfSk7XG5qZXN0Lm1vY2soJ3N3aXNzZXBoJywgKCkgPT4gbnVsbCwgeyB2aXJ0dWFsOiB0cnVlIH0pO1xuXG5jb25zdCBkZGJNb2NrID0gbW9ja0NsaWVudChEeW5hbW9EQkRvY3VtZW50Q2xpZW50KTtcblxuZGVzY3JpYmUoJ0dlbmVyYXRlIE5hdGFsIENoYXJ0IExhbWJkYScsICgpID0+IHtcbiAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgZGRiTW9jay5yZXNldCgpO1xuICAgIHByb2Nlc3MuZW52Lk5BVEFMX0NIQVJUX1RBQkxFX05BTUUgPSAnVGVzdE5hdGFsQ2hhcnRUYWJsZSc7XG4gIH0pO1xuXG4gIGl0KCdzaG91bGQgY2FsY3VsYXRlIGFuZCBzdG9yZSBhIG5hdGFsIGNoYXJ0IHdpdGggYSBwcm92aWRlZCBiaXJ0aCB0aW1lJywgYXN5bmMgKCkgPT4ge1xuICAgIGNvbnN0IGV2ZW50ID0ge1xuICAgICAgdXNlcklkOiAndGVzdC11c2VyLTEnLFxuICAgICAgYmlydGhEYXRlOiAnMTk5MC0wMS0wMScsXG4gICAgICBiaXJ0aFRpbWU6ICcxMjowMCcsXG4gICAgICBsYXRpdHVkZTogMzQuMDUyMixcbiAgICAgIGxvbmdpdHVkZTogLTExOC4yNDM3LFxuICAgICAgaWFuYVRpbWVab25lOiAnQW1lcmljYS9Mb3NfQW5nZWxlcycsXG4gICAgfTtcblxuICAgIGRkYk1vY2sub24oR2V0Q29tbWFuZCkucmVzb2x2ZXMoe30pOyAvLyBDYWNoZSBtaXNzXG4gICAgZGRiTW9jay5vbihQdXRDb21tYW5kKS5yZXNvbHZlcyh7fSk7XG5cbiAgICBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgIGV4cGVjdChkZGJNb2NrKS50b0hhdmVSZWNlaXZlZENvbW1hbmRXaXRoKFB1dENvbW1hbmQsIHtcbiAgICAgIFRhYmxlTmFtZTogJ1Rlc3ROYXRhbENoYXJ0VGFibGUnLFxuICAgICAgSXRlbTogZXhwZWN0Lm9iamVjdENvbnRhaW5pbmcoe1xuICAgICAgICB1c2VySWQ6ICd0ZXN0LXVzZXItMScsXG4gICAgICAgIGlzVGltZUVzdGltYXRlZDogZmFsc2UsXG4gICAgICAgIGNoYXJ0VHlwZTogJ25hdGFsJyxcbiAgICAgICAgcGxhbmV0czogZXhwZWN0Lm9iamVjdENvbnRhaW5pbmcoe1xuICAgICAgICAgIHN1bjogZXhwZWN0Lm9iamVjdENvbnRhaW5pbmcoe1xuICAgICAgICAgICAgbG9uZ2l0dWRlOiAxMCxcbiAgICAgICAgICAgIG5hbWU6ICdzdW4nLFxuICAgICAgICAgICAgc2lnbjogJ0FyaWVzJyxcbiAgICAgICAgICB9KSxcbiAgICAgICAgICBtb29uOiBleHBlY3Qub2JqZWN0Q29udGFpbmluZyh7XG4gICAgICAgICAgICBsb25naXR1ZGU6IDQ1LjUsXG4gICAgICAgICAgICBuYW1lOiAnbW9vbicsXG4gICAgICAgICAgICBzaWduOiAnVGF1cnVzJyxcbiAgICAgICAgICB9KSxcbiAgICAgICAgfSksXG4gICAgICB9KSxcbiAgICB9KTtcbiAgfSk7XG5cbiAgaXQoJ3Nob3VsZCB0aHJvdyBhbiBlcnJvciBpZiBiaXJ0aCB0aW1lIGlzIG1pc3NpbmcnLCBhc3luYyAoKSA9PiB7XG4gICAgY29uc3QgZXZlbnQgPSB7XG4gICAgICB1c2VySWQ6ICd0ZXN0LXVzZXItMicsXG4gICAgICBiaXJ0aERhdGU6ICcxOTk1LTA1LTE1JyxcbiAgICAgIGxhdGl0dWRlOiA0MC43MTI4LFxuICAgICAgbG9uZ2l0dWRlOiAtNzQuMDA2LFxuICAgICAgaWFuYVRpbWVab25lOiAnQW1lcmljYS9OZXdfWW9yaycsXG4gICAgfTtcblxuICAgIGF3YWl0IGV4cGVjdChoYW5kbGVyKGV2ZW50KSkucmVqZWN0cy50b1Rocm93KCdCaXJ0aCB0aW1lIGlzIHJlcXVpcmVkIGZvciBob3VzZSBjYWxjdWxhdGlvbnMnKTtcbiAgfSk7XG5cbiAgaXQoJ3Nob3VsZCB0aHJvdyBhbiBlcnJvciBpZiB1c2VySWQgaXMgbWlzc2luZycsIGFzeW5jICgpID0+IHtcbiAgICBjb25zdCBldmVudCA9IHtcbiAgICAgIGJpcnRoRGF0ZTogJzE5OTAtMDEtMDEnLFxuICAgICAgYmlydGhUaW1lOiAnMTI6MDAnLFxuICAgICAgbGF0aXR1ZGU6IDM0LjA1MjIsXG4gICAgICBsb25naXR1ZGU6IC0xMTguMjQzNyxcbiAgICAgIGlhbmFUaW1lWm9uZTogJ0FtZXJpY2EvTG9zX0FuZ2VsZXMnLFxuICAgIH07XG5cbiAgICBhd2FpdCBleHBlY3QoaGFuZGxlcihldmVudCkpLnJlamVjdHMudG9UaHJvdygnTWlzc2luZyByZXF1aXJlZCBldmVudCBwcm9wZXJ0aWVzJyk7XG4gIH0pO1xufSk7XG4iXX0=