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
    it('should calculate and store a natal chart with a default birth time (noon)', async () => {
        const event = {
            userId: 'test-user-2',
            birthDate: '1995-05-15',
            latitude: 40.7128,
            longitude: -74.006,
            ianaTimeZone: 'America/New_York',
        };
        ddbMock.on(lib_dynamodb_1.PutCommand).resolves({});
        await (0, generate_natal_chart_1.handler)(event);
        expect(ddbMock).toHaveReceivedCommandWith(lib_dynamodb_1.PutCommand, {
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
        await expect((0, generate_natal_chart_1.handler)(event)).rejects.toThrow('Missing required event properties');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmF0YWwtY2hhcnQudGVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIm5hdGFsLWNoYXJ0LnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSxxRkFBcUU7QUFDckUsd0RBQTJFO0FBQzNFLDZEQUFpRDtBQUNqRCxvQ0FBa0M7QUFFbEMsNkJBQTZCO0FBQzdCLElBQUksQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUM7SUFDNUIsYUFBYSxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQztRQUM1QixRQUFRLEVBQUU7WUFDUixHQUFHLEVBQUU7Z0JBQ0gsbUJBQW1CLEVBQUUsSUFBSTtnQkFDekIsdUJBQXVCLEVBQUUsWUFBWTtnQkFDckMsb0JBQW9CLEVBQUUsV0FBVztnQkFDakMsSUFBSSxFQUFFLEtBQUs7YUFDWjtZQUNELElBQUksRUFBRTtnQkFDSixtQkFBbUIsRUFBRSxJQUFJO2dCQUN6Qix1QkFBdUIsRUFBRSxZQUFZO2dCQUNyQyxvQkFBb0IsRUFBRSxNQUFNO2dCQUM1QixJQUFJLEVBQUUsTUFBTTthQUNiO1NBQ0Y7S0FDRixDQUFDLENBQUM7Q0FDSixDQUFDLENBQUMsQ0FBQztBQUVKLE1BQU0sT0FBTyxHQUFHLElBQUEsZ0NBQVUsRUFBQyxxQ0FBc0IsQ0FBQyxDQUFDO0FBRW5ELFFBQVEsQ0FBQyw2QkFBNkIsRUFBRSxHQUFHLEVBQUU7SUFDM0MsVUFBVSxDQUFDLEdBQUcsRUFBRTtRQUNkLE9BQU8sQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNoQixPQUFPLENBQUMsR0FBRyxDQUFDLHNCQUFzQixHQUFHLHFCQUFxQixDQUFDO0lBQzdELENBQUMsQ0FBQyxDQUFDO0lBRUgsRUFBRSxDQUFDLHFFQUFxRSxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ25GLE1BQU0sS0FBSyxHQUFHO1lBQ1osTUFBTSxFQUFFLGFBQWE7WUFDckIsU0FBUyxFQUFFLFlBQVk7WUFDdkIsU0FBUyxFQUFFLE9BQU87WUFDbEIsUUFBUSxFQUFFLE9BQU87WUFDakIsU0FBUyxFQUFFLENBQUMsUUFBUTtZQUNwQixZQUFZLEVBQUUscUJBQXFCO1NBQ3BDLENBQUM7UUFFRixPQUFPLENBQUMsRUFBRSxDQUFDLHlCQUFVLENBQUMsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7UUFFcEMsTUFBTSxJQUFBLDhCQUFPLEVBQUMsS0FBSyxDQUFDLENBQUM7UUFFckIsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLHlCQUF5QixDQUFDLHlCQUFVLEVBQUU7WUFDcEQsU0FBUyxFQUFFLHFCQUFxQjtZQUNoQyxJQUFJLEVBQUUsTUFBTSxDQUFDLGdCQUFnQixDQUFDO2dCQUM1QixNQUFNLEVBQUUsYUFBYTtnQkFDckIsZUFBZSxFQUFFLEtBQUs7Z0JBQ3RCLFNBQVMsRUFBRSxPQUFPO2dCQUNsQixPQUFPLEVBQUUsTUFBTSxDQUFDLGdCQUFnQixDQUFDO29CQUMvQixHQUFHLEVBQUUsTUFBTSxDQUFDLGdCQUFnQixDQUFDO3dCQUMzQixTQUFTLEVBQUUsSUFBSTt3QkFDZixZQUFZLEVBQUUsWUFBWTt3QkFDMUIsSUFBSSxFQUFFLEtBQUs7cUJBQ1osQ0FBQztvQkFDRixJQUFJLEVBQUUsTUFBTSxDQUFDLGdCQUFnQixDQUFDO3dCQUM1QixTQUFTLEVBQUUsSUFBSTt3QkFDZixZQUFZLEVBQUUsWUFBWTt3QkFDMUIsSUFBSSxFQUFFLE1BQU07cUJBQ2IsQ0FBQztpQkFDSCxDQUFDO2FBQ0gsQ0FBQztTQUNILENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0lBRUgsRUFBRSxDQUFDLDJFQUEyRSxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ3pGLE1BQU0sS0FBSyxHQUFHO1lBQ1osTUFBTSxFQUFFLGFBQWE7WUFDckIsU0FBUyxFQUFFLFlBQVk7WUFDdkIsUUFBUSxFQUFFLE9BQU87WUFDakIsU0FBUyxFQUFFLENBQUMsTUFBTTtZQUNsQixZQUFZLEVBQUUsa0JBQWtCO1NBQ2pDLENBQUM7UUFFRixPQUFPLENBQUMsRUFBRSxDQUFDLHlCQUFVLENBQUMsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7UUFFcEMsTUFBTSxJQUFBLDhCQUFPLEVBQUMsS0FBSyxDQUFDLENBQUM7UUFFckIsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLHlCQUF5QixDQUFDLHlCQUFVLEVBQUU7WUFDcEQsU0FBUyxFQUFFLHFCQUFxQjtZQUNoQyxJQUFJLEVBQUUsTUFBTSxDQUFDLGdCQUFnQixDQUFDO2dCQUM1QixNQUFNLEVBQUUsYUFBYTtnQkFDckIsZUFBZSxFQUFFLElBQUk7YUFDdEIsQ0FBQztTQUNILENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0lBRUgsRUFBRSxDQUFDLDRDQUE0QyxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQzFELE1BQU0sS0FBSyxHQUFHO1lBQ1osU0FBUyxFQUFFLFlBQVk7WUFDdkIsU0FBUyxFQUFFLE9BQU87WUFDbEIsUUFBUSxFQUFFLE9BQU87WUFDakIsU0FBUyxFQUFFLENBQUMsUUFBUTtZQUNwQixZQUFZLEVBQUUscUJBQXFCO1NBQ3BDLENBQUM7UUFFRixNQUFNLE1BQU0sQ0FBQyxJQUFBLDhCQUFPLEVBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLG1DQUFtQyxDQUFDLENBQUM7SUFDcEYsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGhhbmRsZXIgfSBmcm9tICcuLi9sYW1iZGEvbmF0YWwtY2hhcnQvZ2VuZXJhdGUtbmF0YWwtY2hhcnQnO1xuaW1wb3J0IHsgRHluYW1vREJEb2N1bWVudENsaWVudCwgUHV0Q29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYic7XG5pbXBvcnQgeyBtb2NrQ2xpZW50IH0gZnJvbSAnYXdzLXNkay1jbGllbnQtbW9jayc7XG5pbXBvcnQgJ2F3cy1zZGstY2xpZW50LW1vY2stamVzdCc7XG5cbi8vIE1vY2sgdGhlIGVwaGVtZXJpcyBsaWJyYXJ5XG5qZXN0Lm1vY2soJ2VwaGVtZXJpcycsICgpID0+ICh7XG4gIGdldEFsbFBsYW5ldHM6IGplc3QuZm4oKCkgPT4gKHtcbiAgICBvYnNlcnZlZDoge1xuICAgICAgc3VuOiB7XG4gICAgICAgIGFwcGFyZW50TG9uZ2l0dWRlRGQ6IDEwLjAsXG4gICAgICAgIGFwcGFyZW50TG9uZ2l0dWRlRG1zMzYwOiAnMTDCsDAwXFwnMDBcIicsXG4gICAgICAgIGdlb2NlbnRyaWNEaXN0YW5jZUttOiAxNDk1OTc4NzAuNyxcbiAgICAgICAgbmFtZTogJ3N1bicsXG4gICAgICB9LFxuICAgICAgbW9vbjoge1xuICAgICAgICBhcHBhcmVudExvbmdpdHVkZURkOiA0NS41LFxuICAgICAgICBhcHBhcmVudExvbmdpdHVkZURtczM2MDogJzQ1wrAzMFxcJzAwXCInLFxuICAgICAgICBnZW9jZW50cmljRGlzdGFuY2VLbTogMzg0NDAwLFxuICAgICAgICBuYW1lOiAnbW9vbicsXG4gICAgICB9LFxuICAgIH0sXG4gIH0pKSxcbn0pKTtcblxuY29uc3QgZGRiTW9jayA9IG1vY2tDbGllbnQoRHluYW1vREJEb2N1bWVudENsaWVudCk7XG5cbmRlc2NyaWJlKCdHZW5lcmF0ZSBOYXRhbCBDaGFydCBMYW1iZGEnLCAoKSA9PiB7XG4gIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgIGRkYk1vY2sucmVzZXQoKTtcbiAgICBwcm9jZXNzLmVudi5OQVRBTF9DSEFSVF9UQUJMRV9OQU1FID0gJ1Rlc3ROYXRhbENoYXJ0VGFibGUnO1xuICB9KTtcblxuICBpdCgnc2hvdWxkIGNhbGN1bGF0ZSBhbmQgc3RvcmUgYSBuYXRhbCBjaGFydCB3aXRoIGEgcHJvdmlkZWQgYmlydGggdGltZScsIGFzeW5jICgpID0+IHtcbiAgICBjb25zdCBldmVudCA9IHtcbiAgICAgIHVzZXJJZDogJ3Rlc3QtdXNlci0xJyxcbiAgICAgIGJpcnRoRGF0ZTogJzE5OTAtMDEtMDEnLFxuICAgICAgYmlydGhUaW1lOiAnMTI6MDAnLFxuICAgICAgbGF0aXR1ZGU6IDM0LjA1MjIsXG4gICAgICBsb25naXR1ZGU6IC0xMTguMjQzNyxcbiAgICAgIGlhbmFUaW1lWm9uZTogJ0FtZXJpY2EvTG9zX0FuZ2VsZXMnLFxuICAgIH07XG5cbiAgICBkZGJNb2NrLm9uKFB1dENvbW1hbmQpLnJlc29sdmVzKHt9KTtcblxuICAgIGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgZXhwZWN0KGRkYk1vY2spLnRvSGF2ZVJlY2VpdmVkQ29tbWFuZFdpdGgoUHV0Q29tbWFuZCwge1xuICAgICAgVGFibGVOYW1lOiAnVGVzdE5hdGFsQ2hhcnRUYWJsZScsXG4gICAgICBJdGVtOiBleHBlY3Qub2JqZWN0Q29udGFpbmluZyh7XG4gICAgICAgIHVzZXJJZDogJ3Rlc3QtdXNlci0xJyxcbiAgICAgICAgaXNUaW1lRXN0aW1hdGVkOiBmYWxzZSxcbiAgICAgICAgY2hhcnRUeXBlOiAnbmF0YWwnLFxuICAgICAgICBwbGFuZXRzOiBleHBlY3Qub2JqZWN0Q29udGFpbmluZyh7XG4gICAgICAgICAgc3VuOiBleHBlY3Qub2JqZWN0Q29udGFpbmluZyh7XG4gICAgICAgICAgICBsb25naXR1ZGU6IDEwLjAsXG4gICAgICAgICAgICBsb25naXR1ZGVEbXM6ICcxMMKwMDBcXCcwMFwiJyxcbiAgICAgICAgICAgIG5hbWU6ICdzdW4nLFxuICAgICAgICAgIH0pLFxuICAgICAgICAgIG1vb246IGV4cGVjdC5vYmplY3RDb250YWluaW5nKHtcbiAgICAgICAgICAgIGxvbmdpdHVkZTogNDUuNSxcbiAgICAgICAgICAgIGxvbmdpdHVkZURtczogJzQ1wrAzMFxcJzAwXCInLFxuICAgICAgICAgICAgbmFtZTogJ21vb24nLFxuICAgICAgICAgIH0pLFxuICAgICAgICB9KSxcbiAgICAgIH0pLFxuICAgIH0pO1xuICB9KTtcblxuICBpdCgnc2hvdWxkIGNhbGN1bGF0ZSBhbmQgc3RvcmUgYSBuYXRhbCBjaGFydCB3aXRoIGEgZGVmYXVsdCBiaXJ0aCB0aW1lIChub29uKScsIGFzeW5jICgpID0+IHtcbiAgICBjb25zdCBldmVudCA9IHtcbiAgICAgIHVzZXJJZDogJ3Rlc3QtdXNlci0yJyxcbiAgICAgIGJpcnRoRGF0ZTogJzE5OTUtMDUtMTUnLFxuICAgICAgbGF0aXR1ZGU6IDQwLjcxMjgsXG4gICAgICBsb25naXR1ZGU6IC03NC4wMDYsXG4gICAgICBpYW5hVGltZVpvbmU6ICdBbWVyaWNhL05ld19Zb3JrJyxcbiAgICB9O1xuXG4gICAgZGRiTW9jay5vbihQdXRDb21tYW5kKS5yZXNvbHZlcyh7fSk7XG5cbiAgICBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgIGV4cGVjdChkZGJNb2NrKS50b0hhdmVSZWNlaXZlZENvbW1hbmRXaXRoKFB1dENvbW1hbmQsIHtcbiAgICAgIFRhYmxlTmFtZTogJ1Rlc3ROYXRhbENoYXJ0VGFibGUnLFxuICAgICAgSXRlbTogZXhwZWN0Lm9iamVjdENvbnRhaW5pbmcoe1xuICAgICAgICB1c2VySWQ6ICd0ZXN0LXVzZXItMicsXG4gICAgICAgIGlzVGltZUVzdGltYXRlZDogdHJ1ZSxcbiAgICAgIH0pLFxuICAgIH0pO1xuICB9KTtcblxuICBpdCgnc2hvdWxkIHRocm93IGFuIGVycm9yIGlmIHVzZXJJZCBpcyBtaXNzaW5nJywgYXN5bmMgKCkgPT4ge1xuICAgIGNvbnN0IGV2ZW50ID0ge1xuICAgICAgYmlydGhEYXRlOiAnMTk5MC0wMS0wMScsXG4gICAgICBiaXJ0aFRpbWU6ICcxMjowMCcsXG4gICAgICBsYXRpdHVkZTogMzQuMDUyMixcbiAgICAgIGxvbmdpdHVkZTogLTExOC4yNDM3LFxuICAgICAgaWFuYVRpbWVab25lOiAnQW1lcmljYS9Mb3NfQW5nZWxlcycsXG4gICAgfTtcblxuICAgIGF3YWl0IGV4cGVjdChoYW5kbGVyKGV2ZW50KSkucmVqZWN0cy50b1Rocm93KCdNaXNzaW5nIHJlcXVpcmVkIGV2ZW50IHByb3BlcnRpZXMnKTtcbiAgfSk7XG59KTtcbiJdfQ==