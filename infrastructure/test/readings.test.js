"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const generate_reading_1 = require("../lambda/readings/generate-reading");
const get_readings_1 = require("../lambda/readings/get-readings");
const get_reading_detail_1 = require("../lambda/readings/get-reading-detail");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const client_ssm_1 = require("@aws-sdk/client-ssm");
const client_s3_1 = require("@aws-sdk/client-s3");
const aws_sdk_client_mock_1 = require("aws-sdk-client-mock");
// Mock the DynamoDB, SSM, and S3 clients
const dynamoMock = (0, aws_sdk_client_mock_1.mockClient)(lib_dynamodb_1.DynamoDBDocumentClient);
const ssmMock = (0, aws_sdk_client_mock_1.mockClient)(client_ssm_1.SSMClient);
const s3Mock = (0, aws_sdk_client_mock_1.mockClient)(client_s3_1.S3Client);
// Mock fetch for OpenAI API calls
global.fetch = jest.fn();
describe('Readings Lambda Functions', () => {
    beforeEach(() => {
        dynamoMock.reset();
        ssmMock.reset();
        s3Mock.reset();
        global.fetch.mockReset();
        // Set required environment variables
        process.env.READINGS_TABLE_NAME = 'test-readings-table';
        process.env.USER_TABLE_NAME = 'test-user-table';
        process.env.NATAL_CHART_TABLE_NAME = 'test-natal-chart-table';
        process.env.CONFIG_BUCKET_NAME = 'test-config-bucket';
        process.env.OPENAI_API_KEY_PARAMETER_NAME = '/test/openai-key';
        process.env.READING_MODEL_PARAMETER_NAME = '/test/reading-model';
        process.env.READING_TEMPERATURE_PARAMETER_NAME = '/test/reading-temperature';
        process.env.READING_MAX_TOKENS_PARAMETER_NAME = '/test/reading-max-tokens';
        process.env.SYSTEM_PROMPT_S3KEY_PARAMETER_NAME = '/test/system-prompt-key';
        process.env.USER_PROMPT_S3KEY_PARAMETER_NAME = '/test/user-prompt-key';
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
            // Mock SSM parameters for OpenAI configuration
            ssmMock
                .on(client_ssm_1.GetParameterCommand, {
                Name: '/test/openai-key',
            })
                .resolves({
                Parameter: {
                    Value: 'test-api-key',
                },
            });
            ssmMock
                .on(client_ssm_1.GetParameterCommand, {
                Name: '/test/reading-model',
            })
                .resolves({
                Parameter: {
                    Value: 'gpt-4-turbo-preview',
                },
            });
            ssmMock
                .on(client_ssm_1.GetParameterCommand, {
                Name: '/test/reading-temperature',
            })
                .resolves({
                Parameter: {
                    Value: '0.7',
                },
            });
            ssmMock
                .on(client_ssm_1.GetParameterCommand, {
                Name: '/test/reading-max-tokens',
            })
                .resolves({
                Parameter: {
                    Value: '2000',
                },
            });
            ssmMock
                .on(client_ssm_1.GetParameterCommand, {
                Name: '/test/system-prompt-key',
            })
                .resolves({
                Parameter: {
                    Value: 'prompts/test/soul_blueprint/system.txt',
                },
            });
            ssmMock
                .on(client_ssm_1.GetParameterCommand, {
                Name: '/test/user-prompt-key',
            })
                .resolves({
                Parameter: {
                    Value: 'prompts/test/soul_blueprint/user_template.md',
                },
            });
            // Mock S3 responses for prompt files
            const createS3Response = (content) => ({
                Body: {
                    transformToString: async () => content,
                },
                ETag: '"test-etag"',
            });
            s3Mock
                .on(client_s3_1.GetObjectCommand, {
                Bucket: 'test-config-bucket',
                Key: 'prompts/test/soul_blueprint/system.txt',
            })
                .resolves(createS3Response('You are an expert astrologer providing Soul Blueprint readings.'));
            s3Mock
                .on(client_s3_1.GetObjectCommand, {
                Bucket: 'test-config-bucket',
                Key: 'prompts/test/soul_blueprint/user_template.md',
            })
                .resolves(createS3Response('Generate a Soul Blueprint reading for {{birthName}} born on {{birthDate}}.'));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVhZGluZ3MudGVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInJlYWRpbmdzLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSwwRUFBd0Y7QUFDeEYsa0VBQWdGO0FBQ2hGLDhFQUEyRjtBQUUzRix3REFLK0I7QUFDL0Isb0RBQXFFO0FBQ3JFLGtEQUFnRTtBQUNoRSw2REFBaUQ7QUFFakQseUNBQXlDO0FBQ3pDLE1BQU0sVUFBVSxHQUFHLElBQUEsZ0NBQVUsRUFBQyxxQ0FBc0IsQ0FBQyxDQUFDO0FBQ3RELE1BQU0sT0FBTyxHQUFHLElBQUEsZ0NBQVUsRUFBQyxzQkFBUyxDQUFDLENBQUM7QUFDdEMsTUFBTSxNQUFNLEdBQUcsSUFBQSxnQ0FBVSxFQUFDLG9CQUFRLENBQUMsQ0FBQztBQUVwQyxrQ0FBa0M7QUFDbEMsTUFBTSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsRUFBRSxFQUFFLENBQUM7QUFFekIsUUFBUSxDQUFDLDJCQUEyQixFQUFFLEdBQUcsRUFBRTtJQUN6QyxVQUFVLENBQUMsR0FBRyxFQUFFO1FBQ2QsVUFBVSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ25CLE9BQU8sQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNoQixNQUFNLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDZCxNQUFNLENBQUMsS0FBbUIsQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUV4QyxxQ0FBcUM7UUFDckMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsR0FBRyxxQkFBcUIsQ0FBQztRQUN4RCxPQUFPLENBQUMsR0FBRyxDQUFDLGVBQWUsR0FBRyxpQkFBaUIsQ0FBQztRQUNoRCxPQUFPLENBQUMsR0FBRyxDQUFDLHNCQUFzQixHQUFHLHdCQUF3QixDQUFDO1FBQzlELE9BQU8sQ0FBQyxHQUFHLENBQUMsa0JBQWtCLEdBQUcsb0JBQW9CLENBQUM7UUFDdEQsT0FBTyxDQUFDLEdBQUcsQ0FBQyw2QkFBNkIsR0FBRyxrQkFBa0IsQ0FBQztRQUMv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QUU7WUFDM0QsTUFBTSxLQUFLLEdBQWtDO2dCQUMzQyxjQUFjLEVBQUUsRUFBRSxNQUFNLEVBQUUsVUFBVSxFQUFFLFNBQVMsRUFBRSxhQUFhLEVBQUU7Z0JBQ2hFLGNBQWMsRUFBRTtvQkFDZCxVQUFVLEVBQUU7d0JBQ1YsTUFBTSxFQUFFLEVBQUUsR0FBRyxFQUFFLGdCQUFnQixFQUFFO3FCQUNsQztvQkFDRCw4REFBOEQ7aUJBQ3hEO2FBQ1QsQ0FBQztZQUVGLE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBQSw0QkFBdUIsRUFBQyxLQUE2QixDQUFDLENBQUM7WUFFOUUsTUFBTSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDdEMsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDdkMsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsbUNBQW1DLENBQUMsQ0FBQztRQUNqRSxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBoYW5kbGVyIGFzIGdlbmVyYXRlUmVhZGluZ0hhbmRsZXIgfSBmcm9tICcuLi9sYW1iZGEvcmVhZGluZ3MvZ2VuZXJhdGUtcmVhZGluZyc7XG5pbXBvcnQgeyBoYW5kbGVyIGFzIGdldFJlYWRpbmdzSGFuZGxlciB9IGZyb20gJy4uL2xhbWJkYS9yZWFkaW5ncy9nZXQtcmVhZGluZ3MnO1xuaW1wb3J0IHsgaGFuZGxlciBhcyBnZXRSZWFkaW5nRGV0YWlsSGFuZGxlciB9IGZyb20gJy4uL2xhbWJkYS9yZWFkaW5ncy9nZXQtcmVhZGluZy1kZXRhaWwnO1xuaW1wb3J0IHsgQVBJR2F0ZXdheVByb3h5RXZlbnQgfSBmcm9tICdhd3MtbGFtYmRhJztcbmltcG9ydCB7XG4gIER5bmFtb0RCRG9jdW1lbnRDbGllbnQsXG4gIEdldENvbW1hbmQsXG4gIFB1dENvbW1hbmQsXG4gIFF1ZXJ5Q29tbWFuZCxcbn0gZnJvbSAnQGF3cy1zZGsvbGliLWR5bmFtb2RiJztcbmltcG9ydCB7IFNTTUNsaWVudCwgR2V0UGFyYW1ldGVyQ29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zc20nO1xuaW1wb3J0IHsgUzNDbGllbnQsIEdldE9iamVjdENvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtczMnO1xuaW1wb3J0IHsgbW9ja0NsaWVudCB9IGZyb20gJ2F3cy1zZGstY2xpZW50LW1vY2snO1xuXG4vLyBNb2NrIHRoZSBEeW5hbW9EQiwgU1NNLCBhbmQgUzMgY2xpZW50c1xuY29uc3QgZHluYW1vTW9jayA9IG1vY2tDbGllbnQoRHluYW1vREJEb2N1bWVudENsaWVudCk7XG5jb25zdCBzc21Nb2NrID0gbW9ja0NsaWVudChTU01DbGllbnQpO1xuY29uc3QgczNNb2NrID0gbW9ja0NsaWVudChTM0NsaWVudCk7XG5cbi8vIE1vY2sgZmV0Y2ggZm9yIE9wZW5BSSBBUEkgY2FsbHNcbmdsb2JhbC5mZXRjaCA9IGplc3QuZm4oKTtcblxuZGVzY3JpYmUoJ1JlYWRpbmdzIExhbWJkYSBGdW5jdGlvbnMnLCAoKSA9PiB7XG4gIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgIGR5bmFtb01vY2sucmVzZXQoKTtcbiAgICBzc21Nb2NrLnJlc2V0KCk7XG4gICAgczNNb2NrLnJlc2V0KCk7XG4gICAgKGdsb2JhbC5mZXRjaCBhcyBqZXN0Lk1vY2spLm1vY2tSZXNldCgpO1xuXG4gICAgLy8gU2V0IHJlcXVpcmVkIGVudmlyb25tZW50IHZhcmlhYmxlc1xuICAgIHByb2Nlc3MuZW52LlJFQURJTkdTX1RBQkxFX05BTUUgPSAndGVzdC1yZWFkaW5ncy10YWJsZSc7XG4gICAgcHJvY2Vzcy5lbnYuVVNFUl9UQUJMRV9OQU1FID0gJ3Rlc3QtdXNlci10YWJsZSc7XG4gICAgcHJvY2Vzcy5lbnYuTkFUQUxfQ0hBUlRfVEFCTEVfTkFNRSA9ICd0ZXN0LW5hdGFsLWNoYXJ0LXRhYmxlJztcbiAgICBwcm9jZXNzLmVudi5DT05GSUdfQlVDS0VUX05BTUUgPSAndGVzdC1jb25maWctYnVja2V0JztcbiAgICBwcm9jZXNzLmVudi5PUEVOQUlfQVBJX0tFWV9QQVJBTUVURVJfTkFNRSA9ICcvdGVzdC9vcGVuYWkta2V5JztcbiAgICBwcm9jZXNzLmVudi5SRUFESU5HX01PREVMX1BBUkFNRVRFUl9OQU1FID0gJy90ZXN0L3JlYWRpbmctbW9kZWwnO1xuICAgIHByb2Nlc3MuZW52LlJFQURJTkdfVEVNUEVSQVRVUkVfUEFSQU1FVEVSX05BTUUgPSAnL3Rlc3QvcmVhZGluZy10ZW1wZXJhdHVyZSc7XG4gICAgcHJvY2Vzcy5lbnYuUkVBRElOR19NQVhfVE9LRU5TX1BBUkFNRVRFUl9OQU1FID0gJy90ZXN0L3JlYWRpbmctbWF4LXRva2Vucyc7XG4gICAgcHJvY2Vzcy5lbnYuU1lTVEVNX1BST01QVF9TM0tFWV9QQVJBTUVURVJfTkFNRSA9ICcvdGVzdC9zeXN0ZW0tcHJvbXB0LWtleSc7XG4gICAgcHJvY2Vzcy5lbnYuVVNFUl9QUk9NUFRfUzNLRVlfUEFSQU1FVEVSX05BTUUgPSAnL3Rlc3QvdXNlci1wcm9tcHQta2V5JztcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ2dlbmVyYXRlUmVhZGluZ0hhbmRsZXInLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBnZW5lcmF0ZSBhIHJlYWRpbmcgc3VjY2Vzc2Z1bGx5JywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgdXNlcklkID0gJ3Rlc3QtdXNlci0xMjMnO1xuICAgICAgY29uc3QgZXZlbnQ6IFBhcnRpYWw8QVBJR2F0ZXdheVByb3h5RXZlbnQ+ID0ge1xuICAgICAgICBwYXRoUGFyYW1ldGVyczogeyB1c2VySWQgfSxcbiAgICAgICAgcmVxdWVzdENvbnRleHQ6IHtcbiAgICAgICAgICBhdXRob3JpemVyOiB7XG4gICAgICAgICAgICBjbGFpbXM6IHsgc3ViOiB1c2VySWQgfSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICAgIH0gYXMgYW55LFxuICAgICAgfTtcblxuICAgICAgLy8gTW9jayB1c2VyIHByb2ZpbGVcbiAgICAgIGR5bmFtb01vY2tcbiAgICAgICAgLm9uKEdldENvbW1hbmQsIHtcbiAgICAgICAgICBUYWJsZU5hbWU6ICd0ZXN0LXVzZXItdGFibGUnLFxuICAgICAgICAgIEtleTogeyB1c2VySWQsIGNyZWF0ZWRBdDogJ1BST0ZJTEUnIH0sXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgSXRlbToge1xuICAgICAgICAgICAgdXNlcklkLFxuICAgICAgICAgICAgcHJvZmlsZToge1xuICAgICAgICAgICAgICBiaXJ0aE5hbWU6ICdUZXN0IFVzZXInLFxuICAgICAgICAgICAgICBiaXJ0aERhdGU6ICcxOTkwLTAxLTAxJyxcbiAgICAgICAgICAgICAgYmlydGhUaW1lOiAnMTI6MDAnLFxuICAgICAgICAgICAgICBiaXJ0aENpdHk6ICdOZXcgWW9yaycsXG4gICAgICAgICAgICAgIGJpcnRoU3RhdGU6ICdOWScsXG4gICAgICAgICAgICAgIGJpcnRoQ291bnRyeTogJ1VTQScsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICAvLyBNb2NrIG5hdGFsIGNoYXJ0XG4gICAgICBkeW5hbW9Nb2NrXG4gICAgICAgIC5vbihHZXRDb21tYW5kLCB7XG4gICAgICAgICAgVGFibGVOYW1lOiAndGVzdC1uYXRhbC1jaGFydC10YWJsZScsXG4gICAgICAgICAgS2V5OiB7IHVzZXJJZCB9LFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoe1xuICAgICAgICAgIEl0ZW06IHtcbiAgICAgICAgICAgIHVzZXJJZCxcbiAgICAgICAgICAgIHBsYW5ldHM6IHtcbiAgICAgICAgICAgICAgc3VuOiB7IHNpZ246ICdDYXByaWNvcm4nLCBkZWdyZWVJblNpZ246IDEwIH0sXG4gICAgICAgICAgICAgIG1vb246IHsgc2lnbjogJ0NhbmNlcicsIGRlZ3JlZUluU2lnbjogMTUgfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgIC8vIE1vY2sgU1NNIHBhcmFtZXRlcnMgZm9yIE9wZW5BSSBjb25maWd1cmF0aW9uXG4gICAgICBzc21Nb2NrXG4gICAgICAgIC5vbihHZXRQYXJhbWV0ZXJDb21tYW5kLCB7XG4gICAgICAgICAgTmFtZTogJy90ZXN0L29wZW5haS1rZXknLFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoe1xuICAgICAgICAgIFBhcmFtZXRlcjoge1xuICAgICAgICAgICAgVmFsdWU6ICd0ZXN0LWFwaS1rZXknLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICBzc21Nb2NrXG4gICAgICAgIC5vbihHZXRQYXJhbWV0ZXJDb21tYW5kLCB7XG4gICAgICAgICAgTmFtZTogJy90ZXN0L3JlYWRpbmctbW9kZWwnLFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoe1xuICAgICAgICAgIFBhcmFtZXRlcjoge1xuICAgICAgICAgICAgVmFsdWU6ICdncHQtNC10dXJiby1wcmV2aWV3JyxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgc3NtTW9ja1xuICAgICAgICAub24oR2V0UGFyYW1ldGVyQ29tbWFuZCwge1xuICAgICAgICAgIE5hbWU6ICcvdGVzdC9yZWFkaW5nLXRlbXBlcmF0dXJlJyxcbiAgICAgICAgfSlcbiAgICAgICAgLnJlc29sdmVzKHtcbiAgICAgICAgICBQYXJhbWV0ZXI6IHtcbiAgICAgICAgICAgIFZhbHVlOiAnMC43JyxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgc3NtTW9ja1xuICAgICAgICAub24oR2V0UGFyYW1ldGVyQ29tbWFuZCwge1xuICAgICAgICAgIE5hbWU6ICcvdGVzdC9yZWFkaW5nLW1heC10b2tlbnMnLFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoe1xuICAgICAgICAgIFBhcmFtZXRlcjoge1xuICAgICAgICAgICAgVmFsdWU6ICcyMDAwJyxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgc3NtTW9ja1xuICAgICAgICAub24oR2V0UGFyYW1ldGVyQ29tbWFuZCwge1xuICAgICAgICAgIE5hbWU6ICcvdGVzdC9zeXN0ZW0tcHJvbXB0LWtleScsXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgUGFyYW1ldGVyOiB7XG4gICAgICAgICAgICBWYWx1ZTogJ3Byb21wdHMvdGVzdC9zb3VsX2JsdWVwcmludC9zeXN0ZW0udHh0JyxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgc3NtTW9ja1xuICAgICAgICAub24oR2V0UGFyYW1ldGVyQ29tbWFuZCwge1xuICAgICAgICAgIE5hbWU6ICcvdGVzdC91c2VyLXByb21wdC1rZXknLFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoe1xuICAgICAgICAgIFBhcmFtZXRlcjoge1xuICAgICAgICAgICAgVmFsdWU6ICdwcm9tcHRzL3Rlc3Qvc291bF9ibHVlcHJpbnQvdXNlcl90ZW1wbGF0ZS5tZCcsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgIC8vIE1vY2sgUzMgcmVzcG9uc2VzIGZvciBwcm9tcHQgZmlsZXNcbiAgICAgIGNvbnN0IGNyZWF0ZVMzUmVzcG9uc2UgPSAoY29udGVudDogc3RyaW5nKSA9PiAoe1xuICAgICAgICBCb2R5OiB7XG4gICAgICAgICAgdHJhbnNmb3JtVG9TdHJpbmc6IGFzeW5jICgpID0+IGNvbnRlbnQsXG4gICAgICAgIH0gYXMgYW55LFxuICAgICAgICBFVGFnOiAnXCJ0ZXN0LWV0YWdcIicsXG4gICAgICB9KTtcblxuICAgICAgczNNb2NrXG4gICAgICAgIC5vbihHZXRPYmplY3RDb21tYW5kLCB7XG4gICAgICAgICAgQnVja2V0OiAndGVzdC1jb25maWctYnVja2V0JyxcbiAgICAgICAgICBLZXk6ICdwcm9tcHRzL3Rlc3Qvc291bF9ibHVlcHJpbnQvc3lzdGVtLnR4dCcsXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyhjcmVhdGVTM1Jlc3BvbnNlKCdZb3UgYXJlIGFuIGV4cGVydCBhc3Ryb2xvZ2VyIHByb3ZpZGluZyBTb3VsIEJsdWVwcmludCByZWFkaW5ncy4nKSk7XG5cbiAgICAgIHMzTW9ja1xuICAgICAgICAub24oR2V0T2JqZWN0Q29tbWFuZCwge1xuICAgICAgICAgIEJ1Y2tldDogJ3Rlc3QtY29uZmlnLWJ1Y2tldCcsXG4gICAgICAgICAgS2V5OiAncHJvbXB0cy90ZXN0L3NvdWxfYmx1ZXByaW50L3VzZXJfdGVtcGxhdGUubWQnLFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoY3JlYXRlUzNSZXNwb25zZSgnR2VuZXJhdGUgYSBTb3VsIEJsdWVwcmludCByZWFkaW5nIGZvciB7e2JpcnRoTmFtZX19IGJvcm4gb24ge3tiaXJ0aERhdGV9fS4nKSk7XG5cbiAgICAgIC8vIE1vY2sgT3BlbkFJIEFQSSByZXNwb25zZVxuICAgICAgKGdsb2JhbC5mZXRjaCBhcyBqZXN0Lk1vY2spLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7XG4gICAgICAgIG9rOiB0cnVlLFxuICAgICAgICBqc29uOiBhc3luYyAoKSA9PiAoe1xuICAgICAgICAgIGNob2ljZXM6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgbWVzc2FnZToge1xuICAgICAgICAgICAgICAgIGNvbnRlbnQ6ICdZb3VyIFNvdWwgQmx1ZXByaW50IHJlYWRpbmc6IFlvdSBhcmUgYSBDYXByaWNvcm4gU3VuLi4uJyxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgXSxcbiAgICAgICAgfSksXG4gICAgICB9KTtcblxuICAgICAgLy8gTW9jayBEeW5hbW9EQiBwdXQgY29tbWFuZHMgZm9yIHN0b3JpbmcgdGhlIHJlYWRpbmdcbiAgICAgIGR5bmFtb01vY2sub24oUHV0Q29tbWFuZCkucmVzb2x2ZXMoe30pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGdlbmVyYXRlUmVhZGluZ0hhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5tZXNzYWdlKS50b0JlKCdSZWFkaW5nIGdlbmVyYXRlZCBzdWNjZXNzZnVsbHknKTtcbiAgICAgIGV4cGVjdChib2R5LnJlYWRpbmdJZCkudG9CZURlZmluZWQoKTtcbiAgICAgIGV4cGVjdChib2R5LnN0YXR1cykudG9CZSgnUmVhZHknKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgcmV0dXJuIDQwMyBpZiB1c2VyIGlzIG5vdCBhdXRob3JpemVkJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQ6IFBhcnRpYWw8QVBJR2F0ZXdheVByb3h5RXZlbnQ+ID0ge1xuICAgICAgICBwYXRoUGFyYW1ldGVyczogeyB1c2VySWQ6ICd1c2VyLTEyMycgfSxcbiAgICAgICAgcmVxdWVzdENvbnRleHQ6IHtcbiAgICAgICAgICBhdXRob3JpemVyOiB7XG4gICAgICAgICAgICBjbGFpbXM6IHsgc3ViOiAnZGlmZmVyZW50LXVzZXInIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgICB9IGFzIGFueSxcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZ2VuZXJhdGVSZWFkaW5nSGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDQwMyk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5Lm1lc3NhZ2UpLnRvQmUoJ1VuYXV0aG9yaXplZCB0byBnZW5lcmF0ZSByZWFkaW5nIGZvciB0aGlzIHVzZXInKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgcmV0dXJuIDQwMCBpZiBuYXRhbCBjaGFydCBpcyBub3QgZm91bmQnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCB1c2VySWQgPSAndGVzdC11c2VyLTEyMyc7XG4gICAgICBjb25zdCBldmVudDogUGFydGlhbDxBUElHYXRld2F5UHJveHlFdmVudD4gPSB7XG4gICAgICAgIHBhdGhQYXJhbWV0ZXJzOiB7IHVzZXJJZCB9LFxuICAgICAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgICAgIGF1dGhvcml6ZXI6IHtcbiAgICAgICAgICAgIGNsYWltczogeyBzdWI6IHVzZXJJZCB9LFxuICAgICAgICAgIH0sXG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgICAgfSBhcyBhbnksXG4gICAgICB9O1xuXG4gICAgICAvLyBNb2NrIHVzZXIgcHJvZmlsZVxuICAgICAgZHluYW1vTW9ja1xuICAgICAgICAub24oR2V0Q29tbWFuZCwge1xuICAgICAgICAgIFRhYmxlTmFtZTogJ3Rlc3QtdXNlci10YWJsZScsXG4gICAgICAgICAgS2V5OiB7IHVzZXJJZCwgY3JlYXRlZEF0OiAnUFJPRklMRScgfSxcbiAgICAgICAgfSlcbiAgICAgICAgLnJlc29sdmVzKHtcbiAgICAgICAgICBJdGVtOiB7XG4gICAgICAgICAgICB1c2VySWQsXG4gICAgICAgICAgICBwcm9maWxlOiB7fSxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgLy8gTW9jayBubyBuYXRhbCBjaGFydFxuICAgICAgZHluYW1vTW9ja1xuICAgICAgICAub24oR2V0Q29tbWFuZCwge1xuICAgICAgICAgIFRhYmxlTmFtZTogJ3Rlc3QtbmF0YWwtY2hhcnQtdGFibGUnLFxuICAgICAgICAgIEtleTogeyB1c2VySWQgfSxcbiAgICAgICAgfSlcbiAgICAgICAgLnJlc29sdmVzKHsgSXRlbTogdW5kZWZpbmVkIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGdlbmVyYXRlUmVhZGluZ0hhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSg0MDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5tZXNzYWdlKS50b0JlKCdOYXRhbCBjaGFydCBub3QgZ2VuZXJhdGVkLiBQbGVhc2UgY29tcGxldGUgeW91ciBwcm9maWxlIGZpcnN0LicpO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnZ2V0UmVhZGluZ3NIYW5kbGVyJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgcmV0dXJuIGxpc3Qgb2YgcmVhZGluZ3MgZm9yIGEgdXNlcicsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHVzZXJJZCA9ICd0ZXN0LXVzZXItMTIzJztcbiAgICAgIGNvbnN0IGV2ZW50OiBQYXJ0aWFsPEFQSUdhdGV3YXlQcm94eUV2ZW50PiA9IHtcbiAgICAgICAgcGF0aFBhcmFtZXRlcnM6IHsgdXNlcklkIH0sXG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICAgICAgY2xhaW1zOiB7IHN1YjogdXNlcklkIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgICB9IGFzIGFueSxcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IG1vY2tSZWFkaW5ncyA9IFtcbiAgICAgICAge1xuICAgICAgICAgIHJlYWRpbmdJZDogJ3JlYWRpbmctMScsXG4gICAgICAgICAgdHlwZTogJ1NvdWwgQmx1ZXByaW50JyxcbiAgICAgICAgICBzdGF0dXM6ICdSZWFkeScsXG4gICAgICAgICAgY3JlYXRlZEF0OiAnMjAyNC0wMS0wMVQwMDowMDowMFonLFxuICAgICAgICAgIHVwZGF0ZWRBdDogJzIwMjQtMDEtMDFUMDA6MDE6MDBaJyxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIHJlYWRpbmdJZDogJ3JlYWRpbmctMicsXG4gICAgICAgICAgdHlwZTogJ1NvdWwgQmx1ZXByaW50JyxcbiAgICAgICAgICBzdGF0dXM6ICdQcm9jZXNzaW5nJyxcbiAgICAgICAgICBjcmVhdGVkQXQ6ICcyMDI0LTAxLTAyVDAwOjAwOjAwWicsXG4gICAgICAgICAgdXBkYXRlZEF0OiAnMjAyNC0wMS0wMlQwMDowMDowMFonLFxuICAgICAgICB9LFxuICAgICAgXTtcblxuICAgICAgZHluYW1vTW9jay5vbihRdWVyeUNvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgSXRlbXM6IG1vY2tSZWFkaW5ncyxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGdldFJlYWRpbmdzSGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LnJlYWRpbmdzKS50b0hhdmVMZW5ndGgoMik7XG4gICAgICBleHBlY3QoYm9keS5jb3VudCkudG9CZSgyKTtcbiAgICAgIGV4cGVjdChib2R5LnJlYWRpbmdzWzBdLnJlYWRpbmdJZCkudG9CZSgncmVhZGluZy0xJyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHJldHVybiBlbXB0eSBsaXN0IGlmIG5vIHJlYWRpbmdzIGV4aXN0JywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgdXNlcklkID0gJ3Rlc3QtdXNlci0xMjMnO1xuICAgICAgY29uc3QgZXZlbnQ6IFBhcnRpYWw8QVBJR2F0ZXdheVByb3h5RXZlbnQ+ID0ge1xuICAgICAgICBwYXRoUGFyYW1ldGVyczogeyB1c2VySWQgfSxcbiAgICAgICAgcmVxdWVzdENvbnRleHQ6IHtcbiAgICAgICAgICBhdXRob3JpemVyOiB7XG4gICAgICAgICAgICBjbGFpbXM6IHsgc3ViOiB1c2VySWQgfSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICAgIH0gYXMgYW55LFxuICAgICAgfTtcblxuICAgICAgZHluYW1vTW9jay5vbihRdWVyeUNvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgSXRlbXM6IFtdLFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZ2V0UmVhZGluZ3NIYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkucmVhZGluZ3MpLnRvSGF2ZUxlbmd0aCgwKTtcbiAgICAgIGV4cGVjdChib2R5LmNvdW50KS50b0JlKDApO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnZ2V0UmVhZGluZ0RldGFpbEhhbmRsZXInLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gcmVhZGluZyBkZXRhaWwgc3VjY2Vzc2Z1bGx5JywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgdXNlcklkID0gJ3Rlc3QtdXNlci0xMjMnO1xuICAgICAgY29uc3QgcmVhZGluZ0lkID0gJ3JlYWRpbmctMTIzJztcbiAgICAgIGNvbnN0IGV2ZW50OiBQYXJ0aWFsPEFQSUdhdGV3YXlQcm94eUV2ZW50PiA9IHtcbiAgICAgICAgcGF0aFBhcmFtZXRlcnM6IHsgdXNlcklkLCByZWFkaW5nSWQgfSxcbiAgICAgICAgcmVxdWVzdENvbnRleHQ6IHtcbiAgICAgICAgICBhdXRob3JpemVyOiB7XG4gICAgICAgICAgICBjbGFpbXM6IHsgc3ViOiB1c2VySWQgfSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICAgIH0gYXMgYW55LFxuICAgICAgfTtcblxuICAgICAgY29uc3QgbW9ja1JlYWRpbmcgPSB7XG4gICAgICAgIHVzZXJJZCxcbiAgICAgICAgcmVhZGluZ0lkLFxuICAgICAgICB0eXBlOiAnU291bCBCbHVlcHJpbnQnLFxuICAgICAgICBzdGF0dXM6ICdSZWFkeScsXG4gICAgICAgIGNvbnRlbnQ6ICdZb3VyIGRldGFpbGVkIFNvdWwgQmx1ZXByaW50IHJlYWRpbmcuLi4nLFxuICAgICAgICBjcmVhdGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAwOjAwWicsXG4gICAgICAgIHVwZGF0ZWRBdDogJzIwMjQtMDEtMDFUMDA6MDE6MDBaJyxcbiAgICAgIH07XG5cbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBJdGVtOiBtb2NrUmVhZGluZyxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGdldFJlYWRpbmdEZXRhaWxIYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkucmVhZGluZ0lkKS50b0JlKHJlYWRpbmdJZCk7XG4gICAgICBleHBlY3QoYm9keS5jb250ZW50KS50b0JlKCdZb3VyIGRldGFpbGVkIFNvdWwgQmx1ZXByaW50IHJlYWRpbmcuLi4nKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgcmV0dXJuIDQwNCBpZiByZWFkaW5nIG5vdCBmb3VuZCcsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHVzZXJJZCA9ICd0ZXN0LXVzZXItMTIzJztcbiAgICAgIGNvbnN0IHJlYWRpbmdJZCA9ICdub24tZXhpc3RlbnQnO1xuICAgICAgY29uc3QgZXZlbnQ6IFBhcnRpYWw8QVBJR2F0ZXdheVByb3h5RXZlbnQ+ID0ge1xuICAgICAgICBwYXRoUGFyYW1ldGVyczogeyB1c2VySWQsIHJlYWRpbmdJZCB9LFxuICAgICAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgICAgIGF1dGhvcml6ZXI6IHtcbiAgICAgICAgICAgIGNsYWltczogeyBzdWI6IHVzZXJJZCB9LFxuICAgICAgICAgIH0sXG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgICAgfSBhcyBhbnksXG4gICAgICB9O1xuXG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgSXRlbTogdW5kZWZpbmVkLFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZ2V0UmVhZGluZ0RldGFpbEhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSg0MDQpO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5tZXNzYWdlKS50b0JlKCdSZWFkaW5nIG5vdCBmb3VuZCcpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gNDAzIGlmIHVzZXIgaXMgbm90IGF1dGhvcml6ZWQnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudDogUGFydGlhbDxBUElHYXRld2F5UHJveHlFdmVudD4gPSB7XG4gICAgICAgIHBhdGhQYXJhbWV0ZXJzOiB7IHVzZXJJZDogJ3VzZXItMTIzJywgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnIH0sXG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICAgICAgY2xhaW1zOiB7IHN1YjogJ2RpZmZlcmVudC11c2VyJyB9LFxuICAgICAgICAgIH0sXG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgICAgfSBhcyBhbnksXG4gICAgICB9O1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGdldFJlYWRpbmdEZXRhaWxIYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoNDAzKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkubWVzc2FnZSkudG9CZSgnVW5hdXRob3JpemVkIHRvIHZpZXcgdGhpcyByZWFkaW5nJyk7XG4gICAgfSk7XG4gIH0pO1xufSk7XG4iXX0=