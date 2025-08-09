"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const generate_natal_chart_1 = require("../lambda/natal-chart/generate-natal-chart");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const aws_sdk_client_mock_1 = require("aws-sdk-client-mock");
require("aws-sdk-client-mock-jest");
// Mock the ephemeris library
jest.mock('ephemeris', () => ({
    getAllPlanets: jest.fn(() => ({
        planets: { sun: { longitude: 10.0 } },
        houses: { '1': { longitude: 20.0 } },
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmF0YWwtY2hhcnQudGVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIm5hdGFsLWNoYXJ0LnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSxxRkFBcUU7QUFDckUsd0RBQTJFO0FBQzNFLDZEQUFpRDtBQUNqRCxvQ0FBa0M7QUFFbEMsNkJBQTZCO0FBQzdCLElBQUksQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUM7SUFDNUIsYUFBYSxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQztRQUM1QixPQUFPLEVBQUUsRUFBRSxHQUFHLEVBQUUsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLEVBQUU7UUFDckMsTUFBTSxFQUFFLEVBQUUsR0FBRyxFQUFFLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxFQUFFO0tBQ3JDLENBQUMsQ0FBQztDQUNKLENBQUMsQ0FBQyxDQUFDO0FBRUosTUFBTSxPQUFPLEdBQUcsSUFBQSxnQ0FBVSxFQUFDLHFDQUFzQixDQUFDLENBQUM7QUFFbkQsUUFBUSxDQUFDLDZCQUE2QixFQUFFLEdBQUcsRUFBRTtJQUMzQyxVQUFVLENBQUMsR0FBRyxFQUFFO1FBQ2QsT0FBTyxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ2hCLE9BQU8sQ0FBQyxHQUFHLENBQUMsc0JBQXNCLEdBQUcscUJBQXFCLENBQUM7SUFDN0QsQ0FBQyxDQUFDLENBQUM7SUFFSCxFQUFFLENBQUMscUVBQXFFLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDbkYsTUFBTSxLQUFLLEdBQUc7WUFDWixNQUFNLEVBQUUsYUFBYTtZQUNyQixTQUFTLEVBQUUsWUFBWTtZQUN2QixTQUFTLEVBQUUsT0FBTztZQUNsQixRQUFRLEVBQUUsT0FBTztZQUNqQixTQUFTLEVBQUUsQ0FBQyxRQUFRO1lBQ3BCLFlBQVksRUFBRSxxQkFBcUI7U0FDcEMsQ0FBQztRQUVGLE9BQU8sQ0FBQyxFQUFFLENBQUMseUJBQVUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUVwQyxNQUFNLElBQUEsOEJBQU8sRUFBQyxLQUFLLENBQUMsQ0FBQztRQUVyQixNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMseUJBQXlCLENBQUMseUJBQVUsRUFBRTtZQUNwRCxTQUFTLEVBQUUscUJBQXFCO1lBQ2hDLElBQUksRUFBRSxNQUFNLENBQUMsZ0JBQWdCLENBQUM7Z0JBQzVCLE1BQU0sRUFBRSxhQUFhO2dCQUNyQixlQUFlLEVBQUUsS0FBSztnQkFDdEIsU0FBUyxFQUFFLE9BQU87Z0JBQ2xCLE9BQU8sRUFBRSxFQUFFLEdBQUcsRUFBRSxFQUFFLFNBQVMsRUFBRSxFQUFFLEVBQUUsRUFBRTtnQkFDbkMsTUFBTSxFQUFFLEVBQUUsR0FBRyxFQUFFLEVBQUUsU0FBUyxFQUFFLEVBQUUsRUFBRSxFQUFFO2FBQ25DLENBQUM7U0FDSCxDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztJQUVILEVBQUUsQ0FBQywyRUFBMkUsRUFBRSxLQUFLLElBQUksRUFBRTtRQUN6RixNQUFNLEtBQUssR0FBRztZQUNaLE1BQU0sRUFBRSxhQUFhO1lBQ3JCLFNBQVMsRUFBRSxZQUFZO1lBQ3ZCLFFBQVEsRUFBRSxPQUFPO1lBQ2pCLFNBQVMsRUFBRSxDQUFDLE1BQU07WUFDbEIsWUFBWSxFQUFFLGtCQUFrQjtTQUNqQyxDQUFDO1FBRUYsT0FBTyxDQUFDLEVBQUUsQ0FBQyx5QkFBVSxDQUFDLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBRXBDLE1BQU0sSUFBQSw4QkFBTyxFQUFDLEtBQUssQ0FBQyxDQUFDO1FBRXJCLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyx5QkFBeUIsQ0FBQyx5QkFBVSxFQUFFO1lBQ3BELFNBQVMsRUFBRSxxQkFBcUI7WUFDaEMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQztnQkFDNUIsTUFBTSxFQUFFLGFBQWE7Z0JBQ3JCLGVBQWUsRUFBRSxJQUFJO2FBQ3RCLENBQUM7U0FDSCxDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztJQUVILEVBQUUsQ0FBQyw0Q0FBNEMsRUFBRSxLQUFLLElBQUksRUFBRTtRQUMxRCxNQUFNLEtBQUssR0FBRztZQUNaLFNBQVMsRUFBRSxZQUFZO1lBQ3ZCLFNBQVMsRUFBRSxPQUFPO1lBQ2xCLFFBQVEsRUFBRSxPQUFPO1lBQ2pCLFNBQVMsRUFBRSxDQUFDLFFBQVE7WUFDcEIsWUFBWSxFQUFFLHFCQUFxQjtTQUNwQyxDQUFDO1FBRUYsTUFBTSxNQUFNLENBQUMsSUFBQSw4QkFBTyxFQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxtQ0FBbUMsQ0FBQyxDQUFDO0lBQ3BGLENBQUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBoYW5kbGVyIH0gZnJvbSAnLi4vbGFtYmRhL25hdGFsLWNoYXJ0L2dlbmVyYXRlLW5hdGFsLWNoYXJ0JztcbmltcG9ydCB7IER5bmFtb0RCRG9jdW1lbnRDbGllbnQsIFB1dENvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9saWItZHluYW1vZGInO1xuaW1wb3J0IHsgbW9ja0NsaWVudCB9IGZyb20gJ2F3cy1zZGstY2xpZW50LW1vY2snO1xuaW1wb3J0ICdhd3Mtc2RrLWNsaWVudC1tb2NrLWplc3QnO1xuXG4vLyBNb2NrIHRoZSBlcGhlbWVyaXMgbGlicmFyeVxuamVzdC5tb2NrKCdlcGhlbWVyaXMnLCAoKSA9PiAoe1xuICBnZXRBbGxQbGFuZXRzOiBqZXN0LmZuKCgpID0+ICh7XG4gICAgcGxhbmV0czogeyBzdW46IHsgbG9uZ2l0dWRlOiAxMC4wIH0gfSxcbiAgICBob3VzZXM6IHsgJzEnOiB7IGxvbmdpdHVkZTogMjAuMCB9IH0sXG4gIH0pKSxcbn0pKTtcblxuY29uc3QgZGRiTW9jayA9IG1vY2tDbGllbnQoRHluYW1vREJEb2N1bWVudENsaWVudCk7XG5cbmRlc2NyaWJlKCdHZW5lcmF0ZSBOYXRhbCBDaGFydCBMYW1iZGEnLCAoKSA9PiB7XG4gIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgIGRkYk1vY2sucmVzZXQoKTtcbiAgICBwcm9jZXNzLmVudi5OQVRBTF9DSEFSVF9UQUJMRV9OQU1FID0gJ1Rlc3ROYXRhbENoYXJ0VGFibGUnO1xuICB9KTtcblxuICBpdCgnc2hvdWxkIGNhbGN1bGF0ZSBhbmQgc3RvcmUgYSBuYXRhbCBjaGFydCB3aXRoIGEgcHJvdmlkZWQgYmlydGggdGltZScsIGFzeW5jICgpID0+IHtcbiAgICBjb25zdCBldmVudCA9IHtcbiAgICAgIHVzZXJJZDogJ3Rlc3QtdXNlci0xJyxcbiAgICAgIGJpcnRoRGF0ZTogJzE5OTAtMDEtMDEnLFxuICAgICAgYmlydGhUaW1lOiAnMTI6MDAnLFxuICAgICAgbGF0aXR1ZGU6IDM0LjA1MjIsXG4gICAgICBsb25naXR1ZGU6IC0xMTguMjQzNyxcbiAgICAgIGlhbmFUaW1lWm9uZTogJ0FtZXJpY2EvTG9zX0FuZ2VsZXMnLFxuICAgIH07XG5cbiAgICBkZGJNb2NrLm9uKFB1dENvbW1hbmQpLnJlc29sdmVzKHt9KTtcblxuICAgIGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgZXhwZWN0KGRkYk1vY2spLnRvSGF2ZVJlY2VpdmVkQ29tbWFuZFdpdGgoUHV0Q29tbWFuZCwge1xuICAgICAgVGFibGVOYW1lOiAnVGVzdE5hdGFsQ2hhcnRUYWJsZScsXG4gICAgICBJdGVtOiBleHBlY3Qub2JqZWN0Q29udGFpbmluZyh7XG4gICAgICAgIHVzZXJJZDogJ3Rlc3QtdXNlci0xJyxcbiAgICAgICAgaXNUaW1lRXN0aW1hdGVkOiBmYWxzZSxcbiAgICAgICAgY2hhcnRUeXBlOiAnbmF0YWwnLFxuICAgICAgICBwbGFuZXRzOiB7IHN1bjogeyBsb25naXR1ZGU6IDEwIH0gfSxcbiAgICAgICAgaG91c2VzOiB7ICcxJzogeyBsb25naXR1ZGU6IDIwIH0gfSxcbiAgICAgIH0pLFxuICAgIH0pO1xuICB9KTtcblxuICBpdCgnc2hvdWxkIGNhbGN1bGF0ZSBhbmQgc3RvcmUgYSBuYXRhbCBjaGFydCB3aXRoIGEgZGVmYXVsdCBiaXJ0aCB0aW1lIChub29uKScsIGFzeW5jICgpID0+IHtcbiAgICBjb25zdCBldmVudCA9IHtcbiAgICAgIHVzZXJJZDogJ3Rlc3QtdXNlci0yJyxcbiAgICAgIGJpcnRoRGF0ZTogJzE5OTUtMDUtMTUnLFxuICAgICAgbGF0aXR1ZGU6IDQwLjcxMjgsXG4gICAgICBsb25naXR1ZGU6IC03NC4wMDYsXG4gICAgICBpYW5hVGltZVpvbmU6ICdBbWVyaWNhL05ld19Zb3JrJyxcbiAgICB9O1xuXG4gICAgZGRiTW9jay5vbihQdXRDb21tYW5kKS5yZXNvbHZlcyh7fSk7XG5cbiAgICBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgIGV4cGVjdChkZGJNb2NrKS50b0hhdmVSZWNlaXZlZENvbW1hbmRXaXRoKFB1dENvbW1hbmQsIHtcbiAgICAgIFRhYmxlTmFtZTogJ1Rlc3ROYXRhbENoYXJ0VGFibGUnLFxuICAgICAgSXRlbTogZXhwZWN0Lm9iamVjdENvbnRhaW5pbmcoe1xuICAgICAgICB1c2VySWQ6ICd0ZXN0LXVzZXItMicsXG4gICAgICAgIGlzVGltZUVzdGltYXRlZDogdHJ1ZSxcbiAgICAgIH0pLFxuICAgIH0pO1xuICB9KTtcblxuICBpdCgnc2hvdWxkIHRocm93IGFuIGVycm9yIGlmIHVzZXJJZCBpcyBtaXNzaW5nJywgYXN5bmMgKCkgPT4ge1xuICAgIGNvbnN0IGV2ZW50ID0ge1xuICAgICAgYmlydGhEYXRlOiAnMTk5MC0wMS0wMScsXG4gICAgICBiaXJ0aFRpbWU6ICcxMjowMCcsXG4gICAgICBsYXRpdHVkZTogMzQuMDUyMixcbiAgICAgIGxvbmdpdHVkZTogLTExOC4yNDM3LFxuICAgICAgaWFuYVRpbWVab25lOiAnQW1lcmljYS9Mb3NfQW5nZWxlcycsXG4gICAgfTtcblxuICAgIGF3YWl0IGV4cGVjdChoYW5kbGVyKGV2ZW50KSkucmVqZWN0cy50b1Rocm93KCdNaXNzaW5nIHJlcXVpcmVkIGV2ZW50IHByb3BlcnRpZXMnKTtcbiAgfSk7XG59KTtcbiJdfQ==