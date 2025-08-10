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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmF0YWwtY2hhcnQudGVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIm5hdGFsLWNoYXJ0LnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSxxRkFBcUU7QUFDckUsd0RBQXVGO0FBQ3ZGLDZEQUFpRDtBQUNqRCxvQ0FBa0M7QUFFbEMsNkJBQTZCO0FBQzdCLElBQUksQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUM7SUFDNUIsYUFBYSxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQztRQUM1QixRQUFRLEVBQUU7WUFDUixHQUFHLEVBQUU7Z0JBQ0gsbUJBQW1CLEVBQUUsSUFBSTtnQkFDekIsdUJBQXVCLEVBQUUsWUFBWTtnQkFDckMsb0JBQW9CLEVBQUUsV0FBVztnQkFDakMsSUFBSSxFQUFFLEtBQUs7YUFDWjtZQUNELElBQUksRUFBRTtnQkFDSixtQkFBbUIsRUFBRSxJQUFJO2dCQUN6Qix1QkFBdUIsRUFBRSxZQUFZO2dCQUNyQyxvQkFBb0IsRUFBRSxNQUFNO2dCQUM1QixJQUFJLEVBQUUsTUFBTTthQUNiO1NBQ0Y7S0FDRixDQUFDLENBQUM7Q0FDSixDQUFDLENBQUMsQ0FBQztBQUVKLCtDQUErQztBQUMvQyxJQUFJLENBQUMsSUFBSSxDQUFDLG1DQUFtQyxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksRUFBRSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO0FBQzlFLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksRUFBRSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO0FBRXJELE1BQU0sT0FBTyxHQUFHLElBQUEsZ0NBQVUsRUFBQyxxQ0FBc0IsQ0FBQyxDQUFDO0FBRW5ELFFBQVEsQ0FBQyw2QkFBNkIsRUFBRSxHQUFHLEVBQUU7SUFDM0MsVUFBVSxDQUFDLEdBQUcsRUFBRTtRQUNkLE9BQU8sQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNoQixPQUFPLENBQUMsR0FBRyxDQUFDLHNCQUFzQixHQUFHLHFCQUFxQixDQUFDO0lBQzdELENBQUMsQ0FBQyxDQUFDO0lBRUgsRUFBRSxDQUFDLHFFQUFxRSxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ25GLE1BQU0sS0FBSyxHQUFHO1lBQ1osTUFBTSxFQUFFLGFBQWE7WUFDckIsU0FBUyxFQUFFLFlBQVk7WUFDdkIsU0FBUyxFQUFFLE9BQU87WUFDbEIsUUFBUSxFQUFFLE9BQU87WUFDakIsU0FBUyxFQUFFLENBQUMsUUFBUTtZQUNwQixZQUFZLEVBQUUscUJBQXFCO1NBQ3BDLENBQUM7UUFFRixPQUFPLENBQUMsRUFBRSxDQUFDLHlCQUFVLENBQUMsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxhQUFhO1FBQ2xELE9BQU8sQ0FBQyxFQUFFLENBQUMseUJBQVUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUVwQyxNQUFNLElBQUEsOEJBQU8sRUFBQyxLQUFLLENBQUMsQ0FBQztRQUVyQixNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMseUJBQXlCLENBQUMseUJBQVUsRUFBRTtZQUNwRCxTQUFTLEVBQUUscUJBQXFCO1lBQ2hDLElBQUksRUFBRSxNQUFNLENBQUMsZ0JBQWdCLENBQUM7Z0JBQzVCLE1BQU0sRUFBRSxhQUFhO2dCQUNyQixlQUFlLEVBQUUsS0FBSztnQkFDdEIsU0FBUyxFQUFFLE9BQU87Z0JBQ2xCLE9BQU8sRUFBRSxNQUFNLENBQUMsZ0JBQWdCLENBQUM7b0JBQy9CLEdBQUcsRUFBRSxNQUFNLENBQUMsZ0JBQWdCLENBQUM7d0JBQzNCLFNBQVMsRUFBRSxJQUFJO3dCQUNmLFlBQVksRUFBRSxZQUFZO3dCQUMxQixJQUFJLEVBQUUsS0FBSztxQkFDWixDQUFDO29CQUNGLElBQUksRUFBRSxNQUFNLENBQUMsZ0JBQWdCLENBQUM7d0JBQzVCLFNBQVMsRUFBRSxJQUFJO3dCQUNmLFlBQVksRUFBRSxZQUFZO3dCQUMxQixJQUFJLEVBQUUsTUFBTTtxQkFDYixDQUFDO2lCQUNILENBQUM7YUFDSCxDQUFDO1NBQ0gsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7SUFFSCxFQUFFLENBQUMsZ0RBQWdELEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDOUQsTUFBTSxLQUFLLEdBQUc7WUFDWixNQUFNLEVBQUUsYUFBYTtZQUNyQixTQUFTLEVBQUUsWUFBWTtZQUN2QixRQUFRLEVBQUUsT0FBTztZQUNqQixTQUFTLEVBQUUsQ0FBQyxNQUFNO1lBQ2xCLFlBQVksRUFBRSxrQkFBa0I7U0FDakMsQ0FBQztRQUVGLE1BQU0sTUFBTSxDQUFDLElBQUEsOEJBQU8sRUFBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsK0NBQStDLENBQUMsQ0FBQztJQUNoRyxDQUFDLENBQUMsQ0FBQztJQUVILEVBQUUsQ0FBQyw0Q0FBNEMsRUFBRSxLQUFLLElBQUksRUFBRTtRQUMxRCxNQUFNLEtBQUssR0FBRztZQUNaLFNBQVMsRUFBRSxZQUFZO1lBQ3ZCLFNBQVMsRUFBRSxPQUFPO1lBQ2xCLFFBQVEsRUFBRSxPQUFPO1lBQ2pCLFNBQVMsRUFBRSxDQUFDLFFBQVE7WUFDcEIsWUFBWSxFQUFFLHFCQUFxQjtTQUNwQyxDQUFDO1FBRUYsTUFBTSxNQUFNLENBQUMsSUFBQSw4QkFBTyxFQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxtQ0FBbUMsQ0FBQyxDQUFDO0lBQ3BGLENBQUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBoYW5kbGVyIH0gZnJvbSAnLi4vbGFtYmRhL25hdGFsLWNoYXJ0L2dlbmVyYXRlLW5hdGFsLWNoYXJ0JztcbmltcG9ydCB7IER5bmFtb0RCRG9jdW1lbnRDbGllbnQsIFB1dENvbW1hbmQsIEdldENvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9saWItZHluYW1vZGInO1xuaW1wb3J0IHsgbW9ja0NsaWVudCB9IGZyb20gJ2F3cy1zZGstY2xpZW50LW1vY2snO1xuaW1wb3J0ICdhd3Mtc2RrLWNsaWVudC1tb2NrLWplc3QnO1xuXG4vLyBNb2NrIHRoZSBlcGhlbWVyaXMgbGlicmFyeVxuamVzdC5tb2NrKCdlcGhlbWVyaXMnLCAoKSA9PiAoe1xuICBnZXRBbGxQbGFuZXRzOiBqZXN0LmZuKCgpID0+ICh7XG4gICAgb2JzZXJ2ZWQ6IHtcbiAgICAgIHN1bjoge1xuICAgICAgICBhcHBhcmVudExvbmdpdHVkZURkOiAxMC4wLFxuICAgICAgICBhcHBhcmVudExvbmdpdHVkZURtczM2MDogJzEwwrAwMFxcJzAwXCInLFxuICAgICAgICBnZW9jZW50cmljRGlzdGFuY2VLbTogMTQ5NTk3ODcwLjcsXG4gICAgICAgIG5hbWU6ICdzdW4nLFxuICAgICAgfSxcbiAgICAgIG1vb246IHtcbiAgICAgICAgYXBwYXJlbnRMb25naXR1ZGVEZDogNDUuNSxcbiAgICAgICAgYXBwYXJlbnRMb25naXR1ZGVEbXMzNjA6ICc0NcKwMzBcXCcwMFwiJyxcbiAgICAgICAgZ2VvY2VudHJpY0Rpc3RhbmNlS206IDM4NDQwMCxcbiAgICAgICAgbmFtZTogJ21vb24nLFxuICAgICAgfSxcbiAgICB9LFxuICB9KSksXG59KSk7XG5cbi8vIE1vY2sgdGhlIHN3aXNzZXBoIG1vZHVsZSAoZnJvbSBMYW1iZGEgTGF5ZXIpXG5qZXN0Lm1vY2soJy9vcHQvbm9kZWpzL25vZGVfbW9kdWxlcy9zd2lzc2VwaCcsICgpID0+IG51bGwsIHsgdmlydHVhbDogdHJ1ZSB9KTtcbmplc3QubW9jaygnc3dpc3NlcGgnLCAoKSA9PiBudWxsLCB7IHZpcnR1YWw6IHRydWUgfSk7XG5cbmNvbnN0IGRkYk1vY2sgPSBtb2NrQ2xpZW50KER5bmFtb0RCRG9jdW1lbnRDbGllbnQpO1xuXG5kZXNjcmliZSgnR2VuZXJhdGUgTmF0YWwgQ2hhcnQgTGFtYmRhJywgKCkgPT4ge1xuICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICBkZGJNb2NrLnJlc2V0KCk7XG4gICAgcHJvY2Vzcy5lbnYuTkFUQUxfQ0hBUlRfVEFCTEVfTkFNRSA9ICdUZXN0TmF0YWxDaGFydFRhYmxlJztcbiAgfSk7XG5cbiAgaXQoJ3Nob3VsZCBjYWxjdWxhdGUgYW5kIHN0b3JlIGEgbmF0YWwgY2hhcnQgd2l0aCBhIHByb3ZpZGVkIGJpcnRoIHRpbWUnLCBhc3luYyAoKSA9PiB7XG4gICAgY29uc3QgZXZlbnQgPSB7XG4gICAgICB1c2VySWQ6ICd0ZXN0LXVzZXItMScsXG4gICAgICBiaXJ0aERhdGU6ICcxOTkwLTAxLTAxJyxcbiAgICAgIGJpcnRoVGltZTogJzEyOjAwJyxcbiAgICAgIGxhdGl0dWRlOiAzNC4wNTIyLFxuICAgICAgbG9uZ2l0dWRlOiAtMTE4LjI0MzcsXG4gICAgICBpYW5hVGltZVpvbmU6ICdBbWVyaWNhL0xvc19BbmdlbGVzJyxcbiAgICB9O1xuXG4gICAgZGRiTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7fSk7IC8vIENhY2hlIG1pc3NcbiAgICBkZGJNb2NrLm9uKFB1dENvbW1hbmQpLnJlc29sdmVzKHt9KTtcblxuICAgIGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgZXhwZWN0KGRkYk1vY2spLnRvSGF2ZVJlY2VpdmVkQ29tbWFuZFdpdGgoUHV0Q29tbWFuZCwge1xuICAgICAgVGFibGVOYW1lOiAnVGVzdE5hdGFsQ2hhcnRUYWJsZScsXG4gICAgICBJdGVtOiBleHBlY3Qub2JqZWN0Q29udGFpbmluZyh7XG4gICAgICAgIHVzZXJJZDogJ3Rlc3QtdXNlci0xJyxcbiAgICAgICAgaXNUaW1lRXN0aW1hdGVkOiBmYWxzZSxcbiAgICAgICAgY2hhcnRUeXBlOiAnbmF0YWwnLFxuICAgICAgICBwbGFuZXRzOiBleHBlY3Qub2JqZWN0Q29udGFpbmluZyh7XG4gICAgICAgICAgc3VuOiBleHBlY3Qub2JqZWN0Q29udGFpbmluZyh7XG4gICAgICAgICAgICBsb25naXR1ZGU6IDEwLjAsXG4gICAgICAgICAgICBsb25naXR1ZGVEbXM6ICcxMMKwMDBcXCcwMFwiJyxcbiAgICAgICAgICAgIG5hbWU6ICdzdW4nLFxuICAgICAgICAgIH0pLFxuICAgICAgICAgIG1vb246IGV4cGVjdC5vYmplY3RDb250YWluaW5nKHtcbiAgICAgICAgICAgIGxvbmdpdHVkZTogNDUuNSxcbiAgICAgICAgICAgIGxvbmdpdHVkZURtczogJzQ1wrAzMFxcJzAwXCInLFxuICAgICAgICAgICAgbmFtZTogJ21vb24nLFxuICAgICAgICAgIH0pLFxuICAgICAgICB9KSxcbiAgICAgIH0pLFxuICAgIH0pO1xuICB9KTtcblxuICBpdCgnc2hvdWxkIHRocm93IGFuIGVycm9yIGlmIGJpcnRoIHRpbWUgaXMgbWlzc2luZycsIGFzeW5jICgpID0+IHtcbiAgICBjb25zdCBldmVudCA9IHtcbiAgICAgIHVzZXJJZDogJ3Rlc3QtdXNlci0yJyxcbiAgICAgIGJpcnRoRGF0ZTogJzE5OTUtMDUtMTUnLFxuICAgICAgbGF0aXR1ZGU6IDQwLjcxMjgsXG4gICAgICBsb25naXR1ZGU6IC03NC4wMDYsXG4gICAgICBpYW5hVGltZVpvbmU6ICdBbWVyaWNhL05ld19Zb3JrJyxcbiAgICB9O1xuXG4gICAgYXdhaXQgZXhwZWN0KGhhbmRsZXIoZXZlbnQpKS5yZWplY3RzLnRvVGhyb3coJ0JpcnRoIHRpbWUgaXMgcmVxdWlyZWQgZm9yIGhvdXNlIGNhbGN1bGF0aW9ucycpO1xuICB9KTtcblxuICBpdCgnc2hvdWxkIHRocm93IGFuIGVycm9yIGlmIHVzZXJJZCBpcyBtaXNzaW5nJywgYXN5bmMgKCkgPT4ge1xuICAgIGNvbnN0IGV2ZW50ID0ge1xuICAgICAgYmlydGhEYXRlOiAnMTk5MC0wMS0wMScsXG4gICAgICBiaXJ0aFRpbWU6ICcxMjowMCcsXG4gICAgICBsYXRpdHVkZTogMzQuMDUyMixcbiAgICAgIGxvbmdpdHVkZTogLTExOC4yNDM3LFxuICAgICAgaWFuYVRpbWVab25lOiAnQW1lcmljYS9Mb3NfQW5nZWxlcycsXG4gICAgfTtcblxuICAgIGF3YWl0IGV4cGVjdChoYW5kbGVyKGV2ZW50KSkucmVqZWN0cy50b1Rocm93KCdNaXNzaW5nIHJlcXVpcmVkIGV2ZW50IHByb3BlcnRpZXMnKTtcbiAgfSk7XG59KTtcbiJdfQ==