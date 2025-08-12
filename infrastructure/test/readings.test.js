"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const generate_reading_1 = require("../lambda/readings/generate-reading");
const get_readings_1 = require("../lambda/readings/get-readings");
const get_reading_detail_1 = require("../lambda/readings/get-reading-detail");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const client_ssm_1 = require("@aws-sdk/client-ssm");
const aws_sdk_client_mock_1 = require("aws-sdk-client-mock");
// Mock the DynamoDB and SSM clients
const dynamoMock = (0, aws_sdk_client_mock_1.mockClient)(lib_dynamodb_1.DynamoDBDocumentClient);
const ssmMock = (0, aws_sdk_client_mock_1.mockClient)(client_ssm_1.SSMClient);
// Mock fetch for OpenAI API calls
global.fetch = jest.fn();
describe('Readings Lambda Functions', () => {
    beforeEach(() => {
        dynamoMock.reset();
        ssmMock.reset();
        global.fetch.mockReset();
        // Set required environment variables
        process.env.READINGS_TABLE_NAME = 'test-readings-table';
        process.env.USER_TABLE_NAME = 'test-user-table';
        process.env.NATAL_CHART_TABLE_NAME = 'test-natal-chart-table';
        process.env.OPENAI_API_KEY_PARAMETER_NAME = '/test/openai-key';
    });
    describe('generateReadingHandler', () => {
        it('should generate a reading successfully', async () => {
            const userId = 'test-user-123';
            const event = {
                pathParameters: { userId },
                requestContext: {
                    authorizer: {
                        claims: { sub: userId },
                    },
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                },
            };
            // Mock user profile
            dynamoMock
                .on(lib_dynamodb_1.GetCommand, {
                TableName: 'test-user-table',
                Key: { userId, createdAt: 'PROFILE' },
            })
                .resolves({
                Item: {
                    userId,
                    profile: {
                        birthName: 'Test User',
                        birthDate: '1990-01-01',
                        birthTime: '12:00',
                        birthCity: 'New York',
                        birthState: 'NY',
                        birthCountry: 'USA',
                    },
                },
            });
            // Mock natal chart
            dynamoMock
                .on(lib_dynamodb_1.GetCommand, {
                TableName: 'test-natal-chart-table',
                Key: { userId },
            })
                .resolves({
                Item: {
                    userId,
                    planets: {
                        sun: { sign: 'Capricorn', degreeInSign: 10 },
                        moon: { sign: 'Cancer', degreeInSign: 15 },
                    },
                },
            });
            // Mock SSM parameter (OpenAI API key)
            ssmMock.on(client_ssm_1.GetParameterCommand).resolves({
                Parameter: {
                    Value: 'test-api-key',
                },
            });
            // Mock OpenAI API response
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    choices: [
                        {
                            message: {
                                content: 'Your Soul Blueprint reading: You are a Capricorn Sun...',
                            },
                        },
                    ],
                }),
            });
            // Mock DynamoDB put commands for storing the reading
            dynamoMock.on(lib_dynamodb_1.PutCommand).resolves({});
            const response = await (0, generate_reading_1.handler)(event);
            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.body);
            expect(body.message).toBe('Reading generated successfully');
            expect(body.readingId).toBeDefined();
            expect(body.status).toBe('Ready');
        });
        it('should return 403 if user is not authorized', async () => {
            const event = {
                pathParameters: { userId: 'user-123' },
                requestContext: {
                    authorizer: {
                        claims: { sub: 'different-user' },
                    },
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                },
            };
            const response = await (0, generate_reading_1.handler)(event);
            expect(response.statusCode).toBe(403);
            const body = JSON.parse(response.body);
            expect(body.message).toBe('Unauthorized to generate reading for this user');
        });
        it('should return 400 if natal chart is not found', async () => {
            const userId = 'test-user-123';
            const event = {
                pathParameters: { userId },
                requestContext: {
                    authorizer: {
                        claims: { sub: userId },
                    },
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                },
            };
            // Mock user profile
            dynamoMock
                .on(lib_dynamodb_1.GetCommand, {
                TableName: 'test-user-table',
                Key: { userId, createdAt: 'PROFILE' },
            })
                .resolves({
                Item: {
                    userId,
                    profile: {},
                },
            });
            // Mock no natal chart
            dynamoMock
                .on(lib_dynamodb_1.GetCommand, {
                TableName: 'test-natal-chart-table',
                Key: { userId },
            })
                .resolves({ Item: undefined });
            const response = await (0, generate_reading_1.handler)(event);
            expect(response.statusCode).toBe(400);
            const body = JSON.parse(response.body);
            expect(body.message).toBe('Natal chart not generated. Please complete your profile first.');
        });
    });
    describe('getReadingsHandler', () => {
        it('should return list of readings for a user', async () => {
            const userId = 'test-user-123';
            const event = {
                pathParameters: { userId },
                requestContext: {
                    authorizer: {
                        claims: { sub: userId },
                    },
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                },
            };
            const mockReadings = [
                {
                    readingId: 'reading-1',
                    type: 'Soul Blueprint',
                    status: 'Ready',
                    createdAt: '2024-01-01T00:00:00Z',
                    updatedAt: '2024-01-01T00:01:00Z',
                },
                {
                    readingId: 'reading-2',
                    type: 'Soul Blueprint',
                    status: 'Processing',
                    createdAt: '2024-01-02T00:00:00Z',
                    updatedAt: '2024-01-02T00:00:00Z',
                },
            ];
            dynamoMock.on(lib_dynamodb_1.QueryCommand).resolves({
                Items: mockReadings,
            });
            const response = await (0, get_readings_1.handler)(event);
            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.body);
            expect(body.readings).toHaveLength(2);
            expect(body.count).toBe(2);
            expect(body.readings[0].readingId).toBe('reading-1');
        });
        it('should return empty list if no readings exist', async () => {
            const userId = 'test-user-123';
            const event = {
                pathParameters: { userId },
                requestContext: {
                    authorizer: {
                        claims: { sub: userId },
                    },
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                },
            };
            dynamoMock.on(lib_dynamodb_1.QueryCommand).resolves({
                Items: [],
            });
            const response = await (0, get_readings_1.handler)(event);
            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.body);
            expect(body.readings).toHaveLength(0);
            expect(body.count).toBe(0);
        });
    });
    describe('getReadingDetailHandler', () => {
        it('should return reading detail successfully', async () => {
            const userId = 'test-user-123';
            const readingId = 'reading-123';
            const event = {
                pathParameters: { userId, readingId },
                requestContext: {
                    authorizer: {
                        claims: { sub: userId },
                    },
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                },
            };
            const mockReading = {
                userId,
                readingId,
                type: 'Soul Blueprint',
                status: 'Ready',
                content: 'Your detailed Soul Blueprint reading...',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:01:00Z',
            };
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({
                Item: mockReading,
            });
            const response = await (0, get_reading_detail_1.handler)(event);
            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.body);
            expect(body.readingId).toBe(readingId);
            expect(body.content).toBe('Your detailed Soul Blueprint reading...');
        });
        it('should return 404 if reading not found', async () => {
            const userId = 'test-user-123';
            const readingId = 'non-existent';
            const event = {
                pathParameters: { userId, readingId },
                requestContext: {
                    authorizer: {
                        claims: { sub: userId },
                    },
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                },
            };
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({
                Item: undefined,
            });
            const response = await (0, get_reading_detail_1.handler)(event);
            expect(response.statusCode).toBe(404);
            const body = JSON.parse(response.body);
            expect(body.message).toBe('Reading not found');
        });
        it('should return 403 if user is not authorized', async () => {
            const event = {
                pathParameters: { userId: 'user-123', readingId: 'reading-123' },
                requestContext: {
                    authorizer: {
                        claims: { sub: 'different-user' },
                    },
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                },
            };
            const response = await (0, get_reading_detail_1.handler)(event);
            expect(response.statusCode).toBe(403);
            const body = JSON.parse(response.body);
            expect(body.message).toBe('Unauthorized to view this reading');
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVhZGluZ3MudGVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInJlYWRpbmdzLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSwwRUFBd0Y7QUFDeEYsa0VBQWdGO0FBQ2hGLDhFQUEyRjtBQUUzRix3REFLK0I7QUFDL0Isb0RBQXFFO0FBQ3JFLDZEQUFpRDtBQUVqRCxvQ0FBb0M7QUFDcEMsTUFBTSxVQUFVLEdBQUcsSUFBQSxnQ0FBVSxFQUFDLHFDQUFzQixDQUFDLENBQUM7QUFDdEQsTUFBTSxPQUFPLEdBQUcsSUFBQSxnQ0FBVSxFQUFDLHNCQUFTLENBQUMsQ0FBQztBQUV0QyxrQ0FBa0M7QUFDbEMsTUFBTSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsRUFBRSxFQUFFLENBQUM7QUFFekIsUUFBUSxDQUFDLDJCQUEyQixFQUFFLEdBQUcsRUFBRTtJQUN6QyxVQUFVLENBQUMsR0FBRyxFQUFFO1FBQ2QsVUFBVSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ25CLE9BQU8sQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNmLE1BQU0sQ0FBQyxLQUFtQixDQUFDLFNBQVMsRUFBRSxDQUFDO1FBRXhDLHFDQUFxQztRQUNyQyxPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFtQixHQUFHLHFCQUFxQixDQUFDO1FBQ3hELE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZSxHQUFHLGlCQUFpQixDQUFDO1FBQ2hELE9BQU8sQ0FBQyxHQUFHLENBQUMsc0JBQXNCLEdBQUcsd0JBQXdCLENBQUM7UUFDOUQsT0FBTyxDQUFDLEdBQUcsQ0FBQyw2QkFBNkIsR0FBRyxrQkFBa0IsQ0FBQztJQUNqRSxDQUFDLENBQUMsQ0FBQztJQUVILFFBQVEsQ0FBQyx3QkFBd0IsRUFBRSxHQUFHLEVBQUU7UUFDdEMsRUFBRSxDQUFDLHdDQUF3QyxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ3RELE1BQU0sTUFBTSxHQUFHLGVBQWUsQ0FBQztZQUMvQixNQUFNLEtBQUssR0FB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Q0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDdkMsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsQ0FBQztRQUNqRCxDQUFDLENBQUMsQ0FBQztRQUVILEVBQUUsQ0FBQyw2Q0FBNkMsRUFBRSxLQUFLLElBQUksRUFBRTtZQUMzRCxNQUFNLEtBQUssR0FBa0M7Z0JBQzNDLGNBQWMsRUFBRSxFQUFFLE1BQU0sRUFBRSxVQUFVLEVBQUUsU0FBUyxFQUFFLGFBQWEsRUFBRTtnQkFDaEUsY0FBYyxFQUFFO29CQUNkLFVBQVUsRUFBRTt3QkFDVixNQUFNLEVBQUUsRUFBRSxHQUFHLEVBQUUsZ0JBQWdCLEVBQUU7cUJBQ2xDO29CQUNELDhEQUE4RDtpQkFDeEQ7YUFDVCxDQUFDO1lBRUYsTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFBLDRCQUF1QixFQUFDLEtBQTZCLENBQUMsQ0FBQztZQUU5RSxNQUFNLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUN0QyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN2QyxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxtQ0FBbUMsQ0FBQyxDQUFDO1FBQ2pFLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGhhbmRsZXIgYXMgZ2VuZXJhdGVSZWFkaW5nSGFuZGxlciB9IGZyb20gJy4uL2xhbWJkYS9yZWFkaW5ncy9nZW5lcmF0ZS1yZWFkaW5nJztcbmltcG9ydCB7IGhhbmRsZXIgYXMgZ2V0UmVhZGluZ3NIYW5kbGVyIH0gZnJvbSAnLi4vbGFtYmRhL3JlYWRpbmdzL2dldC1yZWFkaW5ncyc7XG5pbXBvcnQgeyBoYW5kbGVyIGFzIGdldFJlYWRpbmdEZXRhaWxIYW5kbGVyIH0gZnJvbSAnLi4vbGFtYmRhL3JlYWRpbmdzL2dldC1yZWFkaW5nLWRldGFpbCc7XG5pbXBvcnQgeyBBUElHYXRld2F5UHJveHlFdmVudCB9IGZyb20gJ2F3cy1sYW1iZGEnO1xuaW1wb3J0IHtcbiAgRHluYW1vREJEb2N1bWVudENsaWVudCxcbiAgR2V0Q29tbWFuZCxcbiAgUHV0Q29tbWFuZCxcbiAgUXVlcnlDb21tYW5kLFxufSBmcm9tICdAYXdzLXNkay9saWItZHluYW1vZGInO1xuaW1wb3J0IHsgU1NNQ2xpZW50LCBHZXRQYXJhbWV0ZXJDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXNzbSc7XG5pbXBvcnQgeyBtb2NrQ2xpZW50IH0gZnJvbSAnYXdzLXNkay1jbGllbnQtbW9jayc7XG5cbi8vIE1vY2sgdGhlIER5bmFtb0RCIGFuZCBTU00gY2xpZW50c1xuY29uc3QgZHluYW1vTW9jayA9IG1vY2tDbGllbnQoRHluYW1vREJEb2N1bWVudENsaWVudCk7XG5jb25zdCBzc21Nb2NrID0gbW9ja0NsaWVudChTU01DbGllbnQpO1xuXG4vLyBNb2NrIGZldGNoIGZvciBPcGVuQUkgQVBJIGNhbGxzXG5nbG9iYWwuZmV0Y2ggPSBqZXN0LmZuKCk7XG5cbmRlc2NyaWJlKCdSZWFkaW5ncyBMYW1iZGEgRnVuY3Rpb25zJywgKCkgPT4ge1xuICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICBkeW5hbW9Nb2NrLnJlc2V0KCk7XG4gICAgc3NtTW9jay5yZXNldCgpO1xuICAgIChnbG9iYWwuZmV0Y2ggYXMgamVzdC5Nb2NrKS5tb2NrUmVzZXQoKTtcblxuICAgIC8vIFNldCByZXF1aXJlZCBlbnZpcm9ubWVudCB2YXJpYWJsZXNcbiAgICBwcm9jZXNzLmVudi5SRUFESU5HU19UQUJMRV9OQU1FID0gJ3Rlc3QtcmVhZGluZ3MtdGFibGUnO1xuICAgIHByb2Nlc3MuZW52LlVTRVJfVEFCTEVfTkFNRSA9ICd0ZXN0LXVzZXItdGFibGUnO1xuICAgIHByb2Nlc3MuZW52Lk5BVEFMX0NIQVJUX1RBQkxFX05BTUUgPSAndGVzdC1uYXRhbC1jaGFydC10YWJsZSc7XG4gICAgcHJvY2Vzcy5lbnYuT1BFTkFJX0FQSV9LRVlfUEFSQU1FVEVSX05BTUUgPSAnL3Rlc3Qvb3BlbmFpLWtleSc7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdnZW5lcmF0ZVJlYWRpbmdIYW5kbGVyJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgZ2VuZXJhdGUgYSByZWFkaW5nIHN1Y2Nlc3NmdWxseScsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHVzZXJJZCA9ICd0ZXN0LXVzZXItMTIzJztcbiAgICAgIGNvbnN0IGV2ZW50OiBQYXJ0aWFsPEFQSUdhdGV3YXlQcm94eUV2ZW50PiA9IHtcbiAgICAgICAgcGF0aFBhcmFtZXRlcnM6IHsgdXNlcklkIH0sXG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICAgICAgY2xhaW1zOiB7IHN1YjogdXNlcklkIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgICB9IGFzIGFueSxcbiAgICAgIH07XG5cbiAgICAgIC8vIE1vY2sgdXNlciBwcm9maWxlXG4gICAgICBkeW5hbW9Nb2NrXG4gICAgICAgIC5vbihHZXRDb21tYW5kLCB7XG4gICAgICAgICAgVGFibGVOYW1lOiAndGVzdC11c2VyLXRhYmxlJyxcbiAgICAgICAgICBLZXk6IHsgdXNlcklkLCBjcmVhdGVkQXQ6ICdQUk9GSUxFJyB9LFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoe1xuICAgICAgICAgIEl0ZW06IHtcbiAgICAgICAgICAgIHVzZXJJZCxcbiAgICAgICAgICAgIHByb2ZpbGU6IHtcbiAgICAgICAgICAgICAgYmlydGhOYW1lOiAnVGVzdCBVc2VyJyxcbiAgICAgICAgICAgICAgYmlydGhEYXRlOiAnMTk5MC0wMS0wMScsXG4gICAgICAgICAgICAgIGJpcnRoVGltZTogJzEyOjAwJyxcbiAgICAgICAgICAgICAgYmlydGhDaXR5OiAnTmV3IFlvcmsnLFxuICAgICAgICAgICAgICBiaXJ0aFN0YXRlOiAnTlknLFxuICAgICAgICAgICAgICBiaXJ0aENvdW50cnk6ICdVU0EnLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgLy8gTW9jayBuYXRhbCBjaGFydFxuICAgICAgZHluYW1vTW9ja1xuICAgICAgICAub24oR2V0Q29tbWFuZCwge1xuICAgICAgICAgIFRhYmxlTmFtZTogJ3Rlc3QtbmF0YWwtY2hhcnQtdGFibGUnLFxuICAgICAgICAgIEtleTogeyB1c2VySWQgfSxcbiAgICAgICAgfSlcbiAgICAgICAgLnJlc29sdmVzKHtcbiAgICAgICAgICBJdGVtOiB7XG4gICAgICAgICAgICB1c2VySWQsXG4gICAgICAgICAgICBwbGFuZXRzOiB7XG4gICAgICAgICAgICAgIHN1bjogeyBzaWduOiAnQ2Fwcmljb3JuJywgZGVncmVlSW5TaWduOiAxMCB9LFxuICAgICAgICAgICAgICBtb29uOiB7IHNpZ246ICdDYW5jZXInLCBkZWdyZWVJblNpZ246IDE1IH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICAvLyBNb2NrIFNTTSBwYXJhbWV0ZXIgKE9wZW5BSSBBUEkga2V5KVxuICAgICAgc3NtTW9jay5vbihHZXRQYXJhbWV0ZXJDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIFBhcmFtZXRlcjoge1xuICAgICAgICAgIFZhbHVlOiAndGVzdC1hcGkta2V5JyxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBNb2NrIE9wZW5BSSBBUEkgcmVzcG9uc2VcbiAgICAgIChnbG9iYWwuZmV0Y2ggYXMgamVzdC5Nb2NrKS5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2Uoe1xuICAgICAgICBvazogdHJ1ZSxcbiAgICAgICAganNvbjogYXN5bmMgKCkgPT4gKHtcbiAgICAgICAgICBjaG9pY2VzOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIG1lc3NhZ2U6IHtcbiAgICAgICAgICAgICAgICBjb250ZW50OiAnWW91ciBTb3VsIEJsdWVwcmludCByZWFkaW5nOiBZb3UgYXJlIGEgQ2Fwcmljb3JuIFN1bi4uLicsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIF0sXG4gICAgICAgIH0pLFxuICAgICAgfSk7XG5cbiAgICAgIC8vIE1vY2sgRHluYW1vREIgcHV0IGNvbW1hbmRzIGZvciBzdG9yaW5nIHRoZSByZWFkaW5nXG4gICAgICBkeW5hbW9Nb2NrLm9uKFB1dENvbW1hbmQpLnJlc29sdmVzKHt9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBnZW5lcmF0ZVJlYWRpbmdIYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkubWVzc2FnZSkudG9CZSgnUmVhZGluZyBnZW5lcmF0ZWQgc3VjY2Vzc2Z1bGx5Jyk7XG4gICAgICBleHBlY3QoYm9keS5yZWFkaW5nSWQpLnRvQmVEZWZpbmVkKCk7XG4gICAgICBleHBlY3QoYm9keS5zdGF0dXMpLnRvQmUoJ1JlYWR5Jyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHJldHVybiA0MDMgaWYgdXNlciBpcyBub3QgYXV0aG9yaXplZCcsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50OiBQYXJ0aWFsPEFQSUdhdGV3YXlQcm94eUV2ZW50PiA9IHtcbiAgICAgICAgcGF0aFBhcmFtZXRlcnM6IHsgdXNlcklkOiAndXNlci0xMjMnIH0sXG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICAgICAgY2xhaW1zOiB7IHN1YjogJ2RpZmZlcmVudC11c2VyJyB9LFxuICAgICAgICAgIH0sXG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgICAgfSBhcyBhbnksXG4gICAgICB9O1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGdlbmVyYXRlUmVhZGluZ0hhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSg0MDMpO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5tZXNzYWdlKS50b0JlKCdVbmF1dGhvcml6ZWQgdG8gZ2VuZXJhdGUgcmVhZGluZyBmb3IgdGhpcyB1c2VyJyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHJldHVybiA0MDAgaWYgbmF0YWwgY2hhcnQgaXMgbm90IGZvdW5kJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgdXNlcklkID0gJ3Rlc3QtdXNlci0xMjMnO1xuICAgICAgY29uc3QgZXZlbnQ6IFBhcnRpYWw8QVBJR2F0ZXdheVByb3h5RXZlbnQ+ID0ge1xuICAgICAgICBwYXRoUGFyYW1ldGVyczogeyB1c2VySWQgfSxcbiAgICAgICAgcmVxdWVzdENvbnRleHQ6IHtcbiAgICAgICAgICBhdXRob3JpemVyOiB7XG4gICAgICAgICAgICBjbGFpbXM6IHsgc3ViOiB1c2VySWQgfSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICAgIH0gYXMgYW55LFxuICAgICAgfTtcblxuICAgICAgLy8gTW9jayB1c2VyIHByb2ZpbGVcbiAgICAgIGR5bmFtb01vY2tcbiAgICAgICAgLm9uKEdldENvbW1hbmQsIHtcbiAgICAgICAgICBUYWJsZU5hbWU6ICd0ZXN0LXVzZXItdGFibGUnLFxuICAgICAgICAgIEtleTogeyB1c2VySWQsIGNyZWF0ZWRBdDogJ1BST0ZJTEUnIH0sXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgSXRlbToge1xuICAgICAgICAgICAgdXNlcklkLFxuICAgICAgICAgICAgcHJvZmlsZToge30sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgIC8vIE1vY2sgbm8gbmF0YWwgY2hhcnRcbiAgICAgIGR5bmFtb01vY2tcbiAgICAgICAgLm9uKEdldENvbW1hbmQsIHtcbiAgICAgICAgICBUYWJsZU5hbWU6ICd0ZXN0LW5hdGFsLWNoYXJ0LXRhYmxlJyxcbiAgICAgICAgICBLZXk6IHsgdXNlcklkIH0sXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7IEl0ZW06IHVuZGVmaW5lZCB9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBnZW5lcmF0ZVJlYWRpbmdIYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoNDAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkubWVzc2FnZSkudG9CZSgnTmF0YWwgY2hhcnQgbm90IGdlbmVyYXRlZC4gUGxlYXNlIGNvbXBsZXRlIHlvdXIgcHJvZmlsZSBmaXJzdC4nKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ2dldFJlYWRpbmdzSGFuZGxlcicsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIHJldHVybiBsaXN0IG9mIHJlYWRpbmdzIGZvciBhIHVzZXInLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCB1c2VySWQgPSAndGVzdC11c2VyLTEyMyc7XG4gICAgICBjb25zdCBldmVudDogUGFydGlhbDxBUElHYXRld2F5UHJveHlFdmVudD4gPSB7XG4gICAgICAgIHBhdGhQYXJhbWV0ZXJzOiB7IHVzZXJJZCB9LFxuICAgICAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgICAgIGF1dGhvcml6ZXI6IHtcbiAgICAgICAgICAgIGNsYWltczogeyBzdWI6IHVzZXJJZCB9LFxuICAgICAgICAgIH0sXG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgICAgfSBhcyBhbnksXG4gICAgICB9O1xuXG4gICAgICBjb25zdCBtb2NrUmVhZGluZ3MgPSBbXG4gICAgICAgIHtcbiAgICAgICAgICByZWFkaW5nSWQ6ICdyZWFkaW5nLTEnLFxuICAgICAgICAgIHR5cGU6ICdTb3VsIEJsdWVwcmludCcsXG4gICAgICAgICAgc3RhdHVzOiAnUmVhZHknLFxuICAgICAgICAgIGNyZWF0ZWRBdDogJzIwMjQtMDEtMDFUMDA6MDA6MDBaJyxcbiAgICAgICAgICB1cGRhdGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAxOjAwWicsXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICByZWFkaW5nSWQ6ICdyZWFkaW5nLTInLFxuICAgICAgICAgIHR5cGU6ICdTb3VsIEJsdWVwcmludCcsXG4gICAgICAgICAgc3RhdHVzOiAnUHJvY2Vzc2luZycsXG4gICAgICAgICAgY3JlYXRlZEF0OiAnMjAyNC0wMS0wMlQwMDowMDowMFonLFxuICAgICAgICAgIHVwZGF0ZWRBdDogJzIwMjQtMDEtMDJUMDA6MDA6MDBaJyxcbiAgICAgICAgfSxcbiAgICAgIF07XG5cbiAgICAgIGR5bmFtb01vY2sub24oUXVlcnlDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIEl0ZW1zOiBtb2NrUmVhZGluZ3MsXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBnZXRSZWFkaW5nc0hhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5yZWFkaW5ncykudG9IYXZlTGVuZ3RoKDIpO1xuICAgICAgZXhwZWN0KGJvZHkuY291bnQpLnRvQmUoMik7XG4gICAgICBleHBlY3QoYm9keS5yZWFkaW5nc1swXS5yZWFkaW5nSWQpLnRvQmUoJ3JlYWRpbmctMScpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gZW1wdHkgbGlzdCBpZiBubyByZWFkaW5ncyBleGlzdCcsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHVzZXJJZCA9ICd0ZXN0LXVzZXItMTIzJztcbiAgICAgIGNvbnN0IGV2ZW50OiBQYXJ0aWFsPEFQSUdhdGV3YXlQcm94eUV2ZW50PiA9IHtcbiAgICAgICAgcGF0aFBhcmFtZXRlcnM6IHsgdXNlcklkIH0sXG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICAgICAgY2xhaW1zOiB7IHN1YjogdXNlcklkIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgICB9IGFzIGFueSxcbiAgICAgIH07XG5cbiAgICAgIGR5bmFtb01vY2sub24oUXVlcnlDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIEl0ZW1zOiBbXSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGdldFJlYWRpbmdzSGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LnJlYWRpbmdzKS50b0hhdmVMZW5ndGgoMCk7XG4gICAgICBleHBlY3QoYm9keS5jb3VudCkudG9CZSgwKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ2dldFJlYWRpbmdEZXRhaWxIYW5kbGVyJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgcmV0dXJuIHJlYWRpbmcgZGV0YWlsIHN1Y2Nlc3NmdWxseScsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHVzZXJJZCA9ICd0ZXN0LXVzZXItMTIzJztcbiAgICAgIGNvbnN0IHJlYWRpbmdJZCA9ICdyZWFkaW5nLTEyMyc7XG4gICAgICBjb25zdCBldmVudDogUGFydGlhbDxBUElHYXRld2F5UHJveHlFdmVudD4gPSB7XG4gICAgICAgIHBhdGhQYXJhbWV0ZXJzOiB7IHVzZXJJZCwgcmVhZGluZ0lkIH0sXG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICAgICAgY2xhaW1zOiB7IHN1YjogdXNlcklkIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgICB9IGFzIGFueSxcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IG1vY2tSZWFkaW5nID0ge1xuICAgICAgICB1c2VySWQsXG4gICAgICAgIHJlYWRpbmdJZCxcbiAgICAgICAgdHlwZTogJ1NvdWwgQmx1ZXByaW50JyxcbiAgICAgICAgc3RhdHVzOiAnUmVhZHknLFxuICAgICAgICBjb250ZW50OiAnWW91ciBkZXRhaWxlZCBTb3VsIEJsdWVwcmludCByZWFkaW5nLi4uJyxcbiAgICAgICAgY3JlYXRlZEF0OiAnMjAyNC0wMS0wMVQwMDowMDowMFonLFxuICAgICAgICB1cGRhdGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAxOjAwWicsXG4gICAgICB9O1xuXG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgSXRlbTogbW9ja1JlYWRpbmcsXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBnZXRSZWFkaW5nRGV0YWlsSGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LnJlYWRpbmdJZCkudG9CZShyZWFkaW5nSWQpO1xuICAgICAgZXhwZWN0KGJvZHkuY29udGVudCkudG9CZSgnWW91ciBkZXRhaWxlZCBTb3VsIEJsdWVwcmludCByZWFkaW5nLi4uJyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHJldHVybiA0MDQgaWYgcmVhZGluZyBub3QgZm91bmQnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCB1c2VySWQgPSAndGVzdC11c2VyLTEyMyc7XG4gICAgICBjb25zdCByZWFkaW5nSWQgPSAnbm9uLWV4aXN0ZW50JztcbiAgICAgIGNvbnN0IGV2ZW50OiBQYXJ0aWFsPEFQSUdhdGV3YXlQcm94eUV2ZW50PiA9IHtcbiAgICAgICAgcGF0aFBhcmFtZXRlcnM6IHsgdXNlcklkLCByZWFkaW5nSWQgfSxcbiAgICAgICAgcmVxdWVzdENvbnRleHQ6IHtcbiAgICAgICAgICBhdXRob3JpemVyOiB7XG4gICAgICAgICAgICBjbGFpbXM6IHsgc3ViOiB1c2VySWQgfSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICAgIH0gYXMgYW55LFxuICAgICAgfTtcblxuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIEl0ZW06IHVuZGVmaW5lZCxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGdldFJlYWRpbmdEZXRhaWxIYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoNDA0KTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkubWVzc2FnZSkudG9CZSgnUmVhZGluZyBub3QgZm91bmQnKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgcmV0dXJuIDQwMyBpZiB1c2VyIGlzIG5vdCBhdXRob3JpemVkJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQ6IFBhcnRpYWw8QVBJR2F0ZXdheVByb3h5RXZlbnQ+ID0ge1xuICAgICAgICBwYXRoUGFyYW1ldGVyczogeyB1c2VySWQ6ICd1c2VyLTEyMycsIHJlYWRpbmdJZDogJ3JlYWRpbmctMTIzJyB9LFxuICAgICAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgICAgIGF1dGhvcml6ZXI6IHtcbiAgICAgICAgICAgIGNsYWltczogeyBzdWI6ICdkaWZmZXJlbnQtdXNlcicgfSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICAgIH0gYXMgYW55LFxuICAgICAgfTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBnZXRSZWFkaW5nRGV0YWlsSGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDQwMyk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5Lm1lc3NhZ2UpLnRvQmUoJ1VuYXV0aG9yaXplZCB0byB2aWV3IHRoaXMgcmVhZGluZycpO1xuICAgIH0pO1xuICB9KTtcbn0pO1xuIl19