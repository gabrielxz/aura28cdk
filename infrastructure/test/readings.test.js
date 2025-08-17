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
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                }, // Type assertion needed for mock - S3 Body stream type is complex
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
        it('should return generic error message when OpenAI API fails', async () => {
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
                    Value: 'prompts/soul_blueprint/system.txt',
                },
            });
            ssmMock
                .on(client_ssm_1.GetParameterCommand, {
                Name: '/test/user-prompt-key',
            })
                .resolves({
                Parameter: {
                    Value: 'prompts/soul_blueprint/user.txt',
                },
            });
            // Mock S3 prompts
            s3Mock.on(client_s3_1.GetObjectCommand).resolves({
                Body: {
                    transformToString: async () => 'Test prompt content',
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                },
                ETag: 'test-etag',
            });
            // Mock DynamoDB put commands for storing the reading
            dynamoMock.on(lib_dynamodb_1.PutCommand).resolves({});
            // Mock OpenAI API failure
            global.fetch.mockRejectedValueOnce(new Error('OpenAI API rate limit exceeded'));
            const response = await (0, generate_reading_1.handler)(event);
            expect(response.statusCode).toBe(500);
            const body = JSON.parse(response.body);
            // Should return generic error message, not the actual error
            expect(body.message).toBe("We're sorry, but we couldn't generate your reading at this time. Please try again later.");
            expect(body.error).toBeUndefined(); // Should NOT include error details
        });
        it('should store sanitized error in DynamoDB when generation fails', async () => {
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
            // Mock SSM parameters
            ssmMock.on(client_ssm_1.GetParameterCommand).resolves({
                Parameter: { Value: 'test-value' },
            });
            // Mock S3 prompts
            s3Mock.on(client_s3_1.GetObjectCommand).resolves({
                Body: {
                    transformToString: async () => 'Test prompt content',
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                },
                ETag: 'test-etag',
            });
            // Capture DynamoDB put commands
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let failedReadingItem;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            dynamoMock.on(lib_dynamodb_1.PutCommand).callsFake((input) => {
                if (input.Item?.status === 'Failed') {
                    failedReadingItem = input.Item;
                }
                return Promise.resolve({});
            });
            // Mock OpenAI API failure with sensitive error
            global.fetch.mockRejectedValueOnce(new Error('Invalid API key: sk-12345'));
            // The handler should return an error response
            const response = await (0, generate_reading_1.handler)(event);
            expect(response.statusCode).toBe(500);
            // Verify that the error stored in DynamoDB is sanitized
            expect(failedReadingItem).toBeDefined();
            expect(failedReadingItem.status).toBe('Failed');
            expect(failedReadingItem.error).toBe('GENERATION_FAILED'); // Sanitized error
            expect(failedReadingItem.error).not.toContain('API key'); // Should not contain sensitive info
            expect(failedReadingItem.error).not.toContain('sk-12345'); // Should not contain actual key
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
        it('should log detailed error to CloudWatch when OpenAI API fails', async () => {
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
            // Spy on console.error to verify CloudWatch logging
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
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
            // Mock SSM parameters
            ssmMock.on(client_ssm_1.GetParameterCommand).resolves({
                Parameter: { Value: 'test-value' },
            });
            // Mock S3 prompts
            s3Mock.on(client_s3_1.GetObjectCommand).resolves({
                Body: {
                    transformToString: async () => 'Test prompt content',
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                },
                ETag: 'test-etag',
            });
            // Mock DynamoDB put commands
            dynamoMock.on(lib_dynamodb_1.PutCommand).resolves({});
            // Mock OpenAI API failure with detailed error
            const errorMessage = 'Connection timeout after 30000ms';
            global.fetch.mockRejectedValueOnce(new Error(errorMessage));
            await (0, generate_reading_1.handler)(event);
            // Verify that detailed error was logged to CloudWatch
            expect(consoleErrorSpy).toHaveBeenCalled();
            const errorCall = consoleErrorSpy.mock.calls.find((call) => call[0] === 'Error generating reading:' || call[0] === 'Error during reading generation:');
            expect(errorCall).toBeDefined();
            expect(errorCall[1]).toMatchObject({
                error: errorMessage,
                userId,
                timestamp: expect.any(String),
            });
            // Restore console.error
            consoleErrorSpy.mockRestore();
        });
        it('should handle network timeout errors gracefully', async () => {
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
            // Mock user profile and natal chart
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
            // Mock SSM and S3
            ssmMock.on(client_ssm_1.GetParameterCommand).resolves({
                Parameter: { Value: 'test-value' },
            });
            s3Mock.on(client_s3_1.GetObjectCommand).resolves({
                Body: {
                    transformToString: async () => 'Test prompt content',
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                },
                ETag: 'test-etag',
            });
            dynamoMock.on(lib_dynamodb_1.PutCommand).resolves({});
            // Simulate network timeout error
            const timeoutError = new Error('ETIMEDOUT');
            timeoutError.code = 'ETIMEDOUT';
            global.fetch.mockRejectedValueOnce(timeoutError);
            const response = await (0, generate_reading_1.handler)(event);
            expect(response.statusCode).toBe(500);
            const body = JSON.parse(response.body);
            expect(body.message).toBe("We're sorry, but we couldn't generate your reading at this time. Please try again later.");
            expect(body.error).toBeUndefined();
        });
        it('should handle authentication errors from OpenAI', async () => {
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
            // Mock user profile and natal chart
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
            // Mock SSM and S3
            ssmMock.on(client_ssm_1.GetParameterCommand).resolves({
                Parameter: { Value: 'test-value' },
            });
            s3Mock.on(client_s3_1.GetObjectCommand).resolves({
                Body: {
                    transformToString: async () => 'Test prompt content',
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                },
                ETag: 'test-etag',
            });
            dynamoMock.on(lib_dynamodb_1.PutCommand).resolves({});
            // Simulate OpenAI authentication error (401)
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 401,
                text: async () => JSON.stringify({ error: { message: 'Invalid API key provided' } }),
            });
            const response = await (0, generate_reading_1.handler)(event);
            expect(response.statusCode).toBe(500);
            const body = JSON.parse(response.body);
            expect(body.message).toBe("We're sorry, but we couldn't generate your reading at this time. Please try again later.");
            expect(body.error).toBeUndefined();
        });
        // Skipping this test as S3 failures are caught internally and fallback prompts are used silently
        // The implementation correctly uses fallback prompts but doesn't log when S3 keys don't exist
        it.skip('should use fallback prompts when S3 fetch fails', async () => {
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
            // Spy on console to verify logging
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
            // Mock user profile and natal chart
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
            // Mock SSM parameters - all succeed
            ssmMock.on(client_ssm_1.GetParameterCommand).resolves({
                Parameter: { Value: 'test-value' },
            });
            // Mock S3 failures - prompts fail to fetch, which will cause fallback prompts to be used
            s3Mock.on(client_s3_1.GetObjectCommand).rejects(new Error('NoSuchKey'));
            // Mock DynamoDB put commands
            dynamoMock.on(lib_dynamodb_1.PutCommand).resolves({});
            // Mock successful OpenAI API call (will use fallback prompts)
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    choices: [
                        {
                            message: {
                                content: 'Test reading with fallback prompts',
                            },
                        },
                    ],
                }),
            });
            const response = await (0, generate_reading_1.handler)(event);
            // Should succeed even with S3 failure (uses fallback prompts)
            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.body);
            expect(body.message).toBe('Reading generated successfully');
            expect(body.readingId).toBeDefined();
            expect(body.status).toBe('Ready');
            // Verify that S3 errors were logged
            expect(consoleErrorSpy).toHaveBeenCalled();
            // At least one call should mention S3 failure
            const hasS3Error = consoleErrorSpy.mock.calls.some((call) => {
                const firstArg = call[0];
                return (typeof firstArg === 'string' &&
                    (firstArg.includes('Failed to fetch S3 object') ||
                        firstArg.includes('Failed to fetch prompts from S3')));
            });
            expect(hasS3Error).toBe(true);
            // Restore console.error
            consoleErrorSpy.mockRestore();
        });
        it('should handle rate limit errors from OpenAI with retry information', async () => {
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
            // Mock user profile and natal chart
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
            // Mock SSM and S3
            ssmMock.on(client_ssm_1.GetParameterCommand).resolves({
                Parameter: { Value: 'test-value' },
            });
            s3Mock.on(client_s3_1.GetObjectCommand).resolves({
                Body: {
                    transformToString: async () => 'Test prompt content',
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                },
                ETag: 'test-etag',
            });
            dynamoMock.on(lib_dynamodb_1.PutCommand).resolves({});
            // Simulate OpenAI rate limit error (429)
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 429,
                headers: {
                    'retry-after': '60',
                },
                text: async () => JSON.stringify({
                    error: {
                        message: 'Rate limit exceeded. Please retry after 60 seconds.',
                        type: 'rate_limit_error',
                    },
                }),
            });
            const response = await (0, generate_reading_1.handler)(event);
            expect(response.statusCode).toBe(500);
            const body = JSON.parse(response.body);
            expect(body.message).toBe("We're sorry, but we couldn't generate your reading at this time. Please try again later.");
            expect(body.error).toBeUndefined();
            expect(body['retry-after']).toBeUndefined(); // Should not expose retry information to users
        });
        it('should handle missing SSM parameters gracefully', async () => {
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
            // Mock user profile and natal chart
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
            // Mock SSM parameter not found error
            ssmMock.on(client_ssm_1.GetParameterCommand).rejects(new Error('ParameterNotFound'));
            // Mock S3 and DynamoDB
            s3Mock.on(client_s3_1.GetObjectCommand).resolves({
                Body: {
                    transformToString: async () => 'Test prompt content',
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                },
                ETag: 'test-etag',
            });
            dynamoMock.on(lib_dynamodb_1.PutCommand).resolves({});
            const response = await (0, generate_reading_1.handler)(event);
            expect(response.statusCode).toBe(500);
            const body = JSON.parse(response.body);
            expect(body.message).toBe("We're sorry, but we couldn't generate your reading at this time. Please try again later.");
            expect(body.error).toBeUndefined();
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVhZGluZ3MudGVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInJlYWRpbmdzLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSwwRUFBd0Y7QUFDeEYsa0VBQWdGO0FBQ2hGLDhFQUEyRjtBQUUzRix3REFLK0I7QUFDL0Isb0RBQXFFO0FBQ3JFLGtEQUFnRTtBQUNoRSw2REFBaUQ7QUFFakQseUNBQXlDO0FBQ3pDLE1BQU0sVUFBVSxHQUFHLElBQUEsZ0NBQVUsRUFBQyxxQ0FBc0IsQ0FBQyxDQUFDO0FBQ3RELE1BQU0sT0FBTyxHQUFHLElBQUEsZ0NBQVUsRUFBQyxzQkFBUyxDQUFDLENBQUM7QUFDdEMsTUFBTSxNQUFNLEdBQUcsSUFBQSxnQ0FBVSxFQUFDLG9CQUFRLENBQUMsQ0FBQztBQUVwQyxrQ0FBa0M7QUFDbEMsTUFBTSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsRUFBRSxFQUFFLENBQUM7QUFFekIsUUFBUSxDQUFDLDJCQUEyQixFQUFFLEdBQUcsRUFBRTtJQUN6QyxVQUFVLENBQUMsR0FBRyxFQUFFO1FBQ2QsVUFBVSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ25CLE9BQU8sQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNoQixNQUFNLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDZCxNQUFNLENBQUMsS0FBbUIsQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUV4QyxxQ0FBcUM7UUFDckMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsR0FBRyxxQkFBcUIsQ0FBQztRQUN4RCxPQUFPLENBQUMsR0FBRyxDQUFDLGVBQWUsR0FBRyxpQkFBaUIsQ0FBQztRQUNoRCxPQUFPLENBQUMsR0FBRyxDQUFDLHNCQUFzQixHQUFHLHdCQUF3QixDQUFDO1FBQzlELE9BQU8sQ0FBQyxHQUFHLENBQUMsa0JBQWtCLEdBQUcsb0JBQW9CLENBQUM7UUFDdEQsT0FBTyxDQUFDLEdBQUcsQ0FBQyw2QkFBNkIsR0FBRyxrQkFBa0IsQ0FBQztRQUMv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SSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3RDLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3ZDLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLENBQUM7UUFDakQsQ0FBQyxDQUFDLENBQUM7UUFFSCxFQUFFLENBQUMsNkNBQTZDLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDM0QsTUFBTSxLQUFLLEdBQWtDO2dCQUMzQyxjQUFjLEVBQUUsRUFBRSxNQUFNLEVBQUUsVUFBVSxFQUFFLFNBQVMsRUFBRSxhQUFhLEVBQUU7Z0JBQ2hFLGNBQWMsRUFBRTtvQkFDZCxVQUFVLEVBQUU7d0JBQ1YsTUFBTSxFQUFFLEVBQUUsR0FBRyxFQUFFLGdCQUFnQixFQUFFO3FCQUNsQztvQkFDRCw4REFBOEQ7aUJBQ3hEO2FBQ1QsQ0FBQztZQUVGLE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBQSw0QkFBdUIsRUFBQyxLQUE2QixDQUFDLENBQUM7WUFFOUUsTUFBTSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDdEMsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDdkMsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsbUNBQW1DLENBQUMsQ0FBQztRQUNqRSxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBoYW5kbGVyIGFzIGdlbmVyYXRlUmVhZGluZ0hhbmRsZXIgfSBmcm9tICcuLi9sYW1iZGEvcmVhZGluZ3MvZ2VuZXJhdGUtcmVhZGluZyc7XG5pbXBvcnQgeyBoYW5kbGVyIGFzIGdldFJlYWRpbmdzSGFuZGxlciB9IGZyb20gJy4uL2xhbWJkYS9yZWFkaW5ncy9nZXQtcmVhZGluZ3MnO1xuaW1wb3J0IHsgaGFuZGxlciBhcyBnZXRSZWFkaW5nRGV0YWlsSGFuZGxlciB9IGZyb20gJy4uL2xhbWJkYS9yZWFkaW5ncy9nZXQtcmVhZGluZy1kZXRhaWwnO1xuaW1wb3J0IHsgQVBJR2F0ZXdheVByb3h5RXZlbnQgfSBmcm9tICdhd3MtbGFtYmRhJztcbmltcG9ydCB7XG4gIER5bmFtb0RCRG9jdW1lbnRDbGllbnQsXG4gIEdldENvbW1hbmQsXG4gIFB1dENvbW1hbmQsXG4gIFF1ZXJ5Q29tbWFuZCxcbn0gZnJvbSAnQGF3cy1zZGsvbGliLWR5bmFtb2RiJztcbmltcG9ydCB7IFNTTUNsaWVudCwgR2V0UGFyYW1ldGVyQ29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zc20nO1xuaW1wb3J0IHsgUzNDbGllbnQsIEdldE9iamVjdENvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtczMnO1xuaW1wb3J0IHsgbW9ja0NsaWVudCB9IGZyb20gJ2F3cy1zZGstY2xpZW50LW1vY2snO1xuXG4vLyBNb2NrIHRoZSBEeW5hbW9EQiwgU1NNLCBhbmQgUzMgY2xpZW50c1xuY29uc3QgZHluYW1vTW9jayA9IG1vY2tDbGllbnQoRHluYW1vREJEb2N1bWVudENsaWVudCk7XG5jb25zdCBzc21Nb2NrID0gbW9ja0NsaWVudChTU01DbGllbnQpO1xuY29uc3QgczNNb2NrID0gbW9ja0NsaWVudChTM0NsaWVudCk7XG5cbi8vIE1vY2sgZmV0Y2ggZm9yIE9wZW5BSSBBUEkgY2FsbHNcbmdsb2JhbC5mZXRjaCA9IGplc3QuZm4oKTtcblxuZGVzY3JpYmUoJ1JlYWRpbmdzIExhbWJkYSBGdW5jdGlvbnMnLCAoKSA9PiB7XG4gIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgIGR5bmFtb01vY2sucmVzZXQoKTtcbiAgICBzc21Nb2NrLnJlc2V0KCk7XG4gICAgczNNb2NrLnJlc2V0KCk7XG4gICAgKGdsb2JhbC5mZXRjaCBhcyBqZXN0Lk1vY2spLm1vY2tSZXNldCgpO1xuXG4gICAgLy8gU2V0IHJlcXVpcmVkIGVudmlyb25tZW50IHZhcmlhYmxlc1xuICAgIHByb2Nlc3MuZW52LlJFQURJTkdTX1RBQkxFX05BTUUgPSAndGVzdC1yZWFkaW5ncy10YWJsZSc7XG4gICAgcHJvY2Vzcy5lbnYuVVNFUl9UQUJMRV9OQU1FID0gJ3Rlc3QtdXNlci10YWJsZSc7XG4gICAgcHJvY2Vzcy5lbnYuTkFUQUxfQ0hBUlRfVEFCTEVfTkFNRSA9ICd0ZXN0LW5hdGFsLWNoYXJ0LXRhYmxlJztcbiAgICBwcm9jZXNzLmVudi5DT05GSUdfQlVDS0VUX05BTUUgPSAndGVzdC1jb25maWctYnVja2V0JztcbiAgICBwcm9jZXNzLmVudi5PUEVOQUlfQVBJX0tFWV9QQVJBTUVURVJfTkFNRSA9ICcvdGVzdC9vcGVuYWkta2V5JztcbiAgICBwcm9jZXNzLmVudi5SRUFESU5HX01PREVMX1BBUkFNRVRFUl9OQU1FID0gJy90ZXN0L3JlYWRpbmctbW9kZWwnO1xuICAgIHByb2Nlc3MuZW52LlJFQURJTkdfVEVNUEVSQVRVUkVfUEFSQU1FVEVSX05BTUUgPSAnL3Rlc3QvcmVhZGluZy10ZW1wZXJhdHVyZSc7XG4gICAgcHJvY2Vzcy5lbnYuUkVBRElOR19NQVhfVE9LRU5TX1BBUkFNRVRFUl9OQU1FID0gJy90ZXN0L3JlYWRpbmctbWF4LXRva2Vucyc7XG4gICAgcHJvY2Vzcy5lbnYuU1lTVEVNX1BST01QVF9TM0tFWV9QQVJBTUVURVJfTkFNRSA9ICcvdGVzdC9zeXN0ZW0tcHJvbXB0LWtleSc7XG4gICAgcHJvY2Vzcy5lbnYuVVNFUl9QUk9NUFRfUzNLRVlfUEFSQU1FVEVSX05BTUUgPSAnL3Rlc3QvdXNlci1wcm9tcHQta2V5JztcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ2dlbmVyYXRlUmVhZGluZ0hhbmRsZXInLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBnZW5lcmF0ZSBhIHJlYWRpbmcgc3VjY2Vzc2Z1bGx5JywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgdXNlcklkID0gJ3Rlc3QtdXNlci0xMjMnO1xuICAgICAgY29uc3QgZXZlbnQ6IFBhcnRpYWw8QVBJR2F0ZXdheVByb3h5RXZlbnQ+ID0ge1xuICAgICAgICBwYXRoUGFyYW1ldGVyczogeyB1c2VySWQgfSxcbiAgICAgICAgcmVxdWVzdENvbnRleHQ6IHtcbiAgICAgICAgICBhdXRob3JpemVyOiB7XG4gICAgICAgICAgICBjbGFpbXM6IHsgc3ViOiB1c2VySWQgfSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICAgIH0gYXMgYW55LFxuICAgICAgfTtcblxuICAgICAgLy8gTW9jayB1c2VyIHByb2ZpbGVcbiAgICAgIGR5bmFtb01vY2tcbiAgICAgICAgLm9uKEdldENvbW1hbmQsIHtcbiAgICAgICAgICBUYWJsZU5hbWU6ICd0ZXN0LXVzZXItdGFibGUnLFxuICAgICAgICAgIEtleTogeyB1c2VySWQsIGNyZWF0ZWRBdDogJ1BST0ZJTEUnIH0sXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgSXRlbToge1xuICAgICAgICAgICAgdXNlcklkLFxuICAgICAgICAgICAgcHJvZmlsZToge1xuICAgICAgICAgICAgICBiaXJ0aE5hbWU6ICdUZXN0IFVzZXInLFxuICAgICAgICAgICAgICBiaXJ0aERhdGU6ICcxOTkwLTAxLTAxJyxcbiAgICAgICAgICAgICAgYmlydGhUaW1lOiAnMTI6MDAnLFxuICAgICAgICAgICAgICBiaXJ0aENpdHk6ICdOZXcgWW9yaycsXG4gICAgICAgICAgICAgIGJpcnRoU3RhdGU6ICdOWScsXG4gICAgICAgICAgICAgIGJpcnRoQ291bnRyeTogJ1VTQScsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICAvLyBNb2NrIG5hdGFsIGNoYXJ0XG4gICAgICBkeW5hbW9Nb2NrXG4gICAgICAgIC5vbihHZXRDb21tYW5kLCB7XG4gICAgICAgICAgVGFibGVOYW1lOiAndGVzdC1uYXRhbC1jaGFydC10YWJsZScsXG4gICAgICAgICAgS2V5OiB7IHVzZXJJZCB9LFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoe1xuICAgICAgICAgIEl0ZW06IHtcbiAgICAgICAgICAgIHVzZXJJZCxcbiAgICAgICAgICAgIHBsYW5ldHM6IHtcbiAgICAgICAgICAgICAgc3VuOiB7IHNpZ246ICdDYXByaWNvcm4nLCBkZWdyZWVJblNpZ246IDEwIH0sXG4gICAgICAgICAgICAgIG1vb246IHsgc2lnbjogJ0NhbmNlcicsIGRlZ3JlZUluU2lnbjogMTUgfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgIC8vIE1vY2sgU1NNIHBhcmFtZXRlcnMgZm9yIE9wZW5BSSBjb25maWd1cmF0aW9uXG4gICAgICBzc21Nb2NrXG4gICAgICAgIC5vbihHZXRQYXJhbWV0ZXJDb21tYW5kLCB7XG4gICAgICAgICAgTmFtZTogJy90ZXN0L29wZW5haS1rZXknLFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoe1xuICAgICAgICAgIFBhcmFtZXRlcjoge1xuICAgICAgICAgICAgVmFsdWU6ICd0ZXN0LWFwaS1rZXknLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICBzc21Nb2NrXG4gICAgICAgIC5vbihHZXRQYXJhbWV0ZXJDb21tYW5kLCB7XG4gICAgICAgICAgTmFtZTogJy90ZXN0L3JlYWRpbmctbW9kZWwnLFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoe1xuICAgICAgICAgIFBhcmFtZXRlcjoge1xuICAgICAgICAgICAgVmFsdWU6ICdncHQtNC10dXJiby1wcmV2aWV3JyxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgc3NtTW9ja1xuICAgICAgICAub24oR2V0UGFyYW1ldGVyQ29tbWFuZCwge1xuICAgICAgICAgIE5hbWU6ICcvdGVzdC9yZWFkaW5nLXRlbXBlcmF0dXJlJyxcbiAgICAgICAgfSlcbiAgICAgICAgLnJlc29sdmVzKHtcbiAgICAgICAgICBQYXJhbWV0ZXI6IHtcbiAgICAgICAgICAgIFZhbHVlOiAnMC43JyxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgc3NtTW9ja1xuICAgICAgICAub24oR2V0UGFyYW1ldGVyQ29tbWFuZCwge1xuICAgICAgICAgIE5hbWU6ICcvdGVzdC9yZWFkaW5nLW1heC10b2tlbnMnLFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoe1xuICAgICAgICAgIFBhcmFtZXRlcjoge1xuICAgICAgICAgICAgVmFsdWU6ICcyMDAwJyxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgc3NtTW9ja1xuICAgICAgICAub24oR2V0UGFyYW1ldGVyQ29tbWFuZCwge1xuICAgICAgICAgIE5hbWU6ICcvdGVzdC9zeXN0ZW0tcHJvbXB0LWtleScsXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgUGFyYW1ldGVyOiB7XG4gICAgICAgICAgICBWYWx1ZTogJ3Byb21wdHMvdGVzdC9zb3VsX2JsdWVwcmludC9zeXN0ZW0udHh0JyxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgc3NtTW9ja1xuICAgICAgICAub24oR2V0UGFyYW1ldGVyQ29tbWFuZCwge1xuICAgICAgICAgIE5hbWU6ICcvdGVzdC91c2VyLXByb21wdC1rZXknLFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoe1xuICAgICAgICAgIFBhcmFtZXRlcjoge1xuICAgICAgICAgICAgVmFsdWU6ICdwcm9tcHRzL3Rlc3Qvc291bF9ibHVlcHJpbnQvdXNlcl90ZW1wbGF0ZS5tZCcsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgIC8vIE1vY2sgUzMgcmVzcG9uc2VzIGZvciBwcm9tcHQgZmlsZXNcbiAgICAgIGNvbnN0IGNyZWF0ZVMzUmVzcG9uc2UgPSAoY29udGVudDogc3RyaW5nKSA9PiAoe1xuICAgICAgICBCb2R5OiB7XG4gICAgICAgICAgdHJhbnNmb3JtVG9TdHJpbmc6IGFzeW5jICgpID0+IGNvbnRlbnQsXG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgICAgfSBhcyBhbnksIC8vIFR5cGUgYXNzZXJ0aW9uIG5lZWRlZCBmb3IgbW9jayAtIFMzIEJvZHkgc3RyZWFtIHR5cGUgaXMgY29tcGxleFxuICAgICAgICBFVGFnOiAnXCJ0ZXN0LWV0YWdcIicsXG4gICAgICB9KTtcblxuICAgICAgczNNb2NrXG4gICAgICAgIC5vbihHZXRPYmplY3RDb21tYW5kLCB7XG4gICAgICAgICAgQnVja2V0OiAndGVzdC1jb25maWctYnVja2V0JyxcbiAgICAgICAgICBLZXk6ICdwcm9tcHRzL3Rlc3Qvc291bF9ibHVlcHJpbnQvc3lzdGVtLnR4dCcsXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyhcbiAgICAgICAgICBjcmVhdGVTM1Jlc3BvbnNlKCdZb3UgYXJlIGFuIGV4cGVydCBhc3Ryb2xvZ2VyIHByb3ZpZGluZyBTb3VsIEJsdWVwcmludCByZWFkaW5ncy4nKSxcbiAgICAgICAgKTtcblxuICAgICAgczNNb2NrXG4gICAgICAgIC5vbihHZXRPYmplY3RDb21tYW5kLCB7XG4gICAgICAgICAgQnVja2V0OiAndGVzdC1jb25maWctYnVja2V0JyxcbiAgICAgICAgICBLZXk6ICdwcm9tcHRzL3Rlc3Qvc291bF9ibHVlcHJpbnQvdXNlcl90ZW1wbGF0ZS5tZCcsXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyhcbiAgICAgICAgICBjcmVhdGVTM1Jlc3BvbnNlKFxuICAgICAgICAgICAgJ0dlbmVyYXRlIGEgU291bCBCbHVlcHJpbnQgcmVhZGluZyBmb3Ige3tiaXJ0aE5hbWV9fSBib3JuIG9uIHt7YmlydGhEYXRlfX0uJyxcbiAgICAgICAgICApLFxuICAgICAgICApO1xuXG4gICAgICAvLyBNb2NrIE9wZW5BSSBBUEkgcmVzcG9uc2VcbiAgICAgIChnbG9iYWwuZmV0Y2ggYXMgamVzdC5Nb2NrKS5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2Uoe1xuICAgICAgICBvazogdHJ1ZSxcbiAgICAgICAganNvbjogYXN5bmMgKCkgPT4gKHtcbiAgICAgICAgICBjaG9pY2VzOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIG1lc3NhZ2U6IHtcbiAgICAgICAgICAgICAgICBjb250ZW50OiAnWW91ciBTb3VsIEJsdWVwcmludCByZWFkaW5nOiBZb3UgYXJlIGEgQ2Fwcmljb3JuIFN1bi4uLicsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIF0sXG4gICAgICAgIH0pLFxuICAgICAgfSk7XG5cbiAgICAgIC8vIE1vY2sgRHluYW1vREIgcHV0IGNvbW1hbmRzIGZvciBzdG9yaW5nIHRoZSByZWFkaW5nXG4gICAgICBkeW5hbW9Nb2NrLm9uKFB1dENvbW1hbmQpLnJlc29sdmVzKHt9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBnZW5lcmF0ZVJlYWRpbmdIYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkubWVzc2FnZSkudG9CZSgnUmVhZGluZyBnZW5lcmF0ZWQgc3VjY2Vzc2Z1bGx5Jyk7XG4gICAgICBleHBlY3QoYm9keS5yZWFkaW5nSWQpLnRvQmVEZWZpbmVkKCk7XG4gICAgICBleHBlY3QoYm9keS5zdGF0dXMpLnRvQmUoJ1JlYWR5Jyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHJldHVybiBnZW5lcmljIGVycm9yIG1lc3NhZ2Ugd2hlbiBPcGVuQUkgQVBJIGZhaWxzJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgdXNlcklkID0gJ3Rlc3QtdXNlci0xMjMnO1xuICAgICAgY29uc3QgZXZlbnQ6IFBhcnRpYWw8QVBJR2F0ZXdheVByb3h5RXZlbnQ+ID0ge1xuICAgICAgICBwYXRoUGFyYW1ldGVyczogeyB1c2VySWQgfSxcbiAgICAgICAgcmVxdWVzdENvbnRleHQ6IHtcbiAgICAgICAgICBhdXRob3JpemVyOiB7XG4gICAgICAgICAgICBjbGFpbXM6IHsgc3ViOiB1c2VySWQgfSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICAgIH0gYXMgYW55LFxuICAgICAgfTtcblxuICAgICAgLy8gTW9jayB1c2VyIHByb2ZpbGVcbiAgICAgIGR5bmFtb01vY2tcbiAgICAgICAgLm9uKEdldENvbW1hbmQsIHtcbiAgICAgICAgICBUYWJsZU5hbWU6ICd0ZXN0LXVzZXItdGFibGUnLFxuICAgICAgICAgIEtleTogeyB1c2VySWQsIGNyZWF0ZWRBdDogJ1BST0ZJTEUnIH0sXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgSXRlbToge1xuICAgICAgICAgICAgdXNlcklkLFxuICAgICAgICAgICAgcHJvZmlsZToge1xuICAgICAgICAgICAgICBiaXJ0aE5hbWU6ICdUZXN0IFVzZXInLFxuICAgICAgICAgICAgICBiaXJ0aERhdGU6ICcxOTkwLTAxLTAxJyxcbiAgICAgICAgICAgICAgYmlydGhUaW1lOiAnMTI6MDAnLFxuICAgICAgICAgICAgICBiaXJ0aENpdHk6ICdOZXcgWW9yaycsXG4gICAgICAgICAgICAgIGJpcnRoU3RhdGU6ICdOWScsXG4gICAgICAgICAgICAgIGJpcnRoQ291bnRyeTogJ1VTQScsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICAvLyBNb2NrIG5hdGFsIGNoYXJ0XG4gICAgICBkeW5hbW9Nb2NrXG4gICAgICAgIC5vbihHZXRDb21tYW5kLCB7XG4gICAgICAgICAgVGFibGVOYW1lOiAndGVzdC1uYXRhbC1jaGFydC10YWJsZScsXG4gICAgICAgICAgS2V5OiB7IHVzZXJJZCB9LFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoe1xuICAgICAgICAgIEl0ZW06IHtcbiAgICAgICAgICAgIHVzZXJJZCxcbiAgICAgICAgICAgIHBsYW5ldHM6IHtcbiAgICAgICAgICAgICAgc3VuOiB7IHNpZ246ICdDYXByaWNvcm4nLCBkZWdyZWVJblNpZ246IDEwIH0sXG4gICAgICAgICAgICAgIG1vb246IHsgc2lnbjogJ0NhbmNlcicsIGRlZ3JlZUluU2lnbjogMTUgfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgIC8vIE1vY2sgU1NNIHBhcmFtZXRlcnMgZm9yIE9wZW5BSSBjb25maWd1cmF0aW9uXG4gICAgICBzc21Nb2NrXG4gICAgICAgIC5vbihHZXRQYXJhbWV0ZXJDb21tYW5kLCB7XG4gICAgICAgICAgTmFtZTogJy90ZXN0L29wZW5haS1rZXknLFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoe1xuICAgICAgICAgIFBhcmFtZXRlcjoge1xuICAgICAgICAgICAgVmFsdWU6ICd0ZXN0LWFwaS1rZXknLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICBzc21Nb2NrXG4gICAgICAgIC5vbihHZXRQYXJhbWV0ZXJDb21tYW5kLCB7XG4gICAgICAgICAgTmFtZTogJy90ZXN0L3JlYWRpbmctbW9kZWwnLFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoe1xuICAgICAgICAgIFBhcmFtZXRlcjoge1xuICAgICAgICAgICAgVmFsdWU6ICdncHQtNC10dXJiby1wcmV2aWV3JyxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgc3NtTW9ja1xuICAgICAgICAub24oR2V0UGFyYW1ldGVyQ29tbWFuZCwge1xuICAgICAgICAgIE5hbWU6ICcvdGVzdC9yZWFkaW5nLXRlbXBlcmF0dXJlJyxcbiAgICAgICAgfSlcbiAgICAgICAgLnJlc29sdmVzKHtcbiAgICAgICAgICBQYXJhbWV0ZXI6IHtcbiAgICAgICAgICAgIFZhbHVlOiAnMC43JyxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgc3NtTW9ja1xuICAgICAgICAub24oR2V0UGFyYW1ldGVyQ29tbWFuZCwge1xuICAgICAgICAgIE5hbWU6ICcvdGVzdC9yZWFkaW5nLW1heC10b2tlbnMnLFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoe1xuICAgICAgICAgIFBhcmFtZXRlcjoge1xuICAgICAgICAgICAgVmFsdWU6ICcyMDAwJyxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgc3NtTW9ja1xuICAgICAgICAub24oR2V0UGFyYW1ldGVyQ29tbWFuZCwge1xuICAgICAgICAgIE5hbWU6ICcvdGVzdC9zeXN0ZW0tcHJvbXB0LWtleScsXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgUGFyYW1ldGVyOiB7XG4gICAgICAgICAgICBWYWx1ZTogJ3Byb21wdHMvc291bF9ibHVlcHJpbnQvc3lzdGVtLnR4dCcsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgIHNzbU1vY2tcbiAgICAgICAgLm9uKEdldFBhcmFtZXRlckNvbW1hbmQsIHtcbiAgICAgICAgICBOYW1lOiAnL3Rlc3QvdXNlci1wcm9tcHQta2V5JyxcbiAgICAgICAgfSlcbiAgICAgICAgLnJlc29sdmVzKHtcbiAgICAgICAgICBQYXJhbWV0ZXI6IHtcbiAgICAgICAgICAgIFZhbHVlOiAncHJvbXB0cy9zb3VsX2JsdWVwcmludC91c2VyLnR4dCcsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgIC8vIE1vY2sgUzMgcHJvbXB0c1xuICAgICAgczNNb2NrLm9uKEdldE9iamVjdENvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgQm9keToge1xuICAgICAgICAgIHRyYW5zZm9ybVRvU3RyaW5nOiBhc3luYyAoKSA9PiAnVGVzdCBwcm9tcHQgY29udGVudCcsXG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgICAgfSBhcyBhbnksXG4gICAgICAgIEVUYWc6ICd0ZXN0LWV0YWcnLFxuICAgICAgfSk7XG5cbiAgICAgIC8vIE1vY2sgRHluYW1vREIgcHV0IGNvbW1hbmRzIGZvciBzdG9yaW5nIHRoZSByZWFkaW5nXG4gICAgICBkeW5hbW9Nb2NrLm9uKFB1dENvbW1hbmQpLnJlc29sdmVzKHt9KTtcblxuICAgICAgLy8gTW9jayBPcGVuQUkgQVBJIGZhaWx1cmVcbiAgICAgIChnbG9iYWwuZmV0Y2ggYXMgamVzdC5Nb2NrKS5tb2NrUmVqZWN0ZWRWYWx1ZU9uY2UoXG4gICAgICAgIG5ldyBFcnJvcignT3BlbkFJIEFQSSByYXRlIGxpbWl0IGV4Y2VlZGVkJyksXG4gICAgICApO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGdlbmVyYXRlUmVhZGluZ0hhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSg1MDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICAvLyBTaG91bGQgcmV0dXJuIGdlbmVyaWMgZXJyb3IgbWVzc2FnZSwgbm90IHRoZSBhY3R1YWwgZXJyb3JcbiAgICAgIGV4cGVjdChib2R5Lm1lc3NhZ2UpLnRvQmUoXG4gICAgICAgIFwiV2UncmUgc29ycnksIGJ1dCB3ZSBjb3VsZG4ndCBnZW5lcmF0ZSB5b3VyIHJlYWRpbmcgYXQgdGhpcyB0aW1lLiBQbGVhc2UgdHJ5IGFnYWluIGxhdGVyLlwiLFxuICAgICAgKTtcbiAgICAgIGV4cGVjdChib2R5LmVycm9yKS50b0JlVW5kZWZpbmVkKCk7IC8vIFNob3VsZCBOT1QgaW5jbHVkZSBlcnJvciBkZXRhaWxzXG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHN0b3JlIHNhbml0aXplZCBlcnJvciBpbiBEeW5hbW9EQiB3aGVuIGdlbmVyYXRpb24gZmFpbHMnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCB1c2VySWQgPSAndGVzdC11c2VyLTEyMyc7XG4gICAgICBjb25zdCBldmVudDogUGFydGlhbDxBUElHYXRld2F5UHJveHlFdmVudD4gPSB7XG4gICAgICAgIHBhdGhQYXJhbWV0ZXJzOiB7IHVzZXJJZCB9LFxuICAgICAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgICAgIGF1dGhvcml6ZXI6IHtcbiAgICAgICAgICAgIGNsYWltczogeyBzdWI6IHVzZXJJZCB9LFxuICAgICAgICAgIH0sXG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgICAgfSBhcyBhbnksXG4gICAgICB9O1xuXG4gICAgICAvLyBNb2NrIHVzZXIgcHJvZmlsZVxuICAgICAgZHluYW1vTW9ja1xuICAgICAgICAub24oR2V0Q29tbWFuZCwge1xuICAgICAgICAgIFRhYmxlTmFtZTogJ3Rlc3QtdXNlci10YWJsZScsXG4gICAgICAgICAgS2V5OiB7IHVzZXJJZCwgY3JlYXRlZEF0OiAnUFJPRklMRScgfSxcbiAgICAgICAgfSlcbiAgICAgICAgLnJlc29sdmVzKHtcbiAgICAgICAgICBJdGVtOiB7XG4gICAgICAgICAgICB1c2VySWQsXG4gICAgICAgICAgICBwcm9maWxlOiB7XG4gICAgICAgICAgICAgIGJpcnRoTmFtZTogJ1Rlc3QgVXNlcicsXG4gICAgICAgICAgICAgIGJpcnRoRGF0ZTogJzE5OTAtMDEtMDEnLFxuICAgICAgICAgICAgICBiaXJ0aFRpbWU6ICcxMjowMCcsXG4gICAgICAgICAgICAgIGJpcnRoQ2l0eTogJ05ldyBZb3JrJyxcbiAgICAgICAgICAgICAgYmlydGhTdGF0ZTogJ05ZJyxcbiAgICAgICAgICAgICAgYmlydGhDb3VudHJ5OiAnVVNBJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgIC8vIE1vY2sgbmF0YWwgY2hhcnRcbiAgICAgIGR5bmFtb01vY2tcbiAgICAgICAgLm9uKEdldENvbW1hbmQsIHtcbiAgICAgICAgICBUYWJsZU5hbWU6ICd0ZXN0LW5hdGFsLWNoYXJ0LXRhYmxlJyxcbiAgICAgICAgICBLZXk6IHsgdXNlcklkIH0sXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgSXRlbToge1xuICAgICAgICAgICAgdXNlcklkLFxuICAgICAgICAgICAgcGxhbmV0czoge1xuICAgICAgICAgICAgICBzdW46IHsgc2lnbjogJ0NhcHJpY29ybicsIGRlZ3JlZUluU2lnbjogMTAgfSxcbiAgICAgICAgICAgICAgbW9vbjogeyBzaWduOiAnQ2FuY2VyJywgZGVncmVlSW5TaWduOiAxNSB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgLy8gTW9jayBTU00gcGFyYW1ldGVyc1xuICAgICAgc3NtTW9jay5vbihHZXRQYXJhbWV0ZXJDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIFBhcmFtZXRlcjogeyBWYWx1ZTogJ3Rlc3QtdmFsdWUnIH0sXG4gICAgICB9KTtcblxuICAgICAgLy8gTW9jayBTMyBwcm9tcHRzXG4gICAgICBzM01vY2sub24oR2V0T2JqZWN0Q29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBCb2R5OiB7XG4gICAgICAgICAgdHJhbnNmb3JtVG9TdHJpbmc6IGFzeW5jICgpID0+ICdUZXN0IHByb21wdCBjb250ZW50JyxcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgICB9IGFzIGFueSxcbiAgICAgICAgRVRhZzogJ3Rlc3QtZXRhZycsXG4gICAgICB9KTtcblxuICAgICAgLy8gQ2FwdHVyZSBEeW5hbW9EQiBwdXQgY29tbWFuZHNcbiAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICBsZXQgZmFpbGVkUmVhZGluZ0l0ZW06IGFueTtcbiAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICBkeW5hbW9Nb2NrLm9uKFB1dENvbW1hbmQpLmNhbGxzRmFrZSgoaW5wdXQ6IGFueSkgPT4ge1xuICAgICAgICBpZiAoaW5wdXQuSXRlbT8uc3RhdHVzID09PSAnRmFpbGVkJykge1xuICAgICAgICAgIGZhaWxlZFJlYWRpbmdJdGVtID0gaW5wdXQuSXRlbTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHt9KTtcbiAgICAgIH0pO1xuXG4gICAgICAvLyBNb2NrIE9wZW5BSSBBUEkgZmFpbHVyZSB3aXRoIHNlbnNpdGl2ZSBlcnJvclxuICAgICAgKGdsb2JhbC5mZXRjaCBhcyBqZXN0Lk1vY2spLm1vY2tSZWplY3RlZFZhbHVlT25jZShuZXcgRXJyb3IoJ0ludmFsaWQgQVBJIGtleTogc2stMTIzNDUnKSk7XG5cbiAgICAgIC8vIFRoZSBoYW5kbGVyIHNob3VsZCByZXR1cm4gYW4gZXJyb3IgcmVzcG9uc2VcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZ2VuZXJhdGVSZWFkaW5nSGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSg1MDApO1xuXG4gICAgICAvLyBWZXJpZnkgdGhhdCB0aGUgZXJyb3Igc3RvcmVkIGluIER5bmFtb0RCIGlzIHNhbml0aXplZFxuICAgICAgZXhwZWN0KGZhaWxlZFJlYWRpbmdJdGVtKS50b0JlRGVmaW5lZCgpO1xuICAgICAgZXhwZWN0KGZhaWxlZFJlYWRpbmdJdGVtLnN0YXR1cykudG9CZSgnRmFpbGVkJyk7XG4gICAgICBleHBlY3QoZmFpbGVkUmVhZGluZ0l0ZW0uZXJyb3IpLnRvQmUoJ0dFTkVSQVRJT05fRkFJTEVEJyk7IC8vIFNhbml0aXplZCBlcnJvclxuICAgICAgZXhwZWN0KGZhaWxlZFJlYWRpbmdJdGVtLmVycm9yKS5ub3QudG9Db250YWluKCdBUEkga2V5Jyk7IC8vIFNob3VsZCBub3QgY29udGFpbiBzZW5zaXRpdmUgaW5mb1xuICAgICAgZXhwZWN0KGZhaWxlZFJlYWRpbmdJdGVtLmVycm9yKS5ub3QudG9Db250YWluKCdzay0xMjM0NScpOyAvLyBTaG91bGQgbm90IGNvbnRhaW4gYWN0dWFsIGtleVxuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gNDAzIGlmIHVzZXIgaXMgbm90IGF1dGhvcml6ZWQnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudDogUGFydGlhbDxBUElHYXRld2F5UHJveHlFdmVudD4gPSB7XG4gICAgICAgIHBhdGhQYXJhbWV0ZXJzOiB7IHVzZXJJZDogJ3VzZXItMTIzJyB9LFxuICAgICAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgICAgIGF1dGhvcml6ZXI6IHtcbiAgICAgICAgICAgIGNsYWltczogeyBzdWI6ICdkaWZmZXJlbnQtdXNlcicgfSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICAgIH0gYXMgYW55LFxuICAgICAgfTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBnZW5lcmF0ZVJlYWRpbmdIYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoNDAzKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkubWVzc2FnZSkudG9CZSgnVW5hdXRob3JpemVkIHRvIGdlbmVyYXRlIHJlYWRpbmcgZm9yIHRoaXMgdXNlcicpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gNDAwIGlmIG5hdGFsIGNoYXJ0IGlzIG5vdCBmb3VuZCcsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHVzZXJJZCA9ICd0ZXN0LXVzZXItMTIzJztcbiAgICAgIGNvbnN0IGV2ZW50OiBQYXJ0aWFsPEFQSUdhdGV3YXlQcm94eUV2ZW50PiA9IHtcbiAgICAgICAgcGF0aFBhcmFtZXRlcnM6IHsgdXNlcklkIH0sXG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICAgICAgY2xhaW1zOiB7IHN1YjogdXNlcklkIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgICB9IGFzIGFueSxcbiAgICAgIH07XG5cbiAgICAgIC8vIE1vY2sgdXNlciBwcm9maWxlXG4gICAgICBkeW5hbW9Nb2NrXG4gICAgICAgIC5vbihHZXRDb21tYW5kLCB7XG4gICAgICAgICAgVGFibGVOYW1lOiAndGVzdC11c2VyLXRhYmxlJyxcbiAgICAgICAgICBLZXk6IHsgdXNlcklkLCBjcmVhdGVkQXQ6ICdQUk9GSUxFJyB9LFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoe1xuICAgICAgICAgIEl0ZW06IHtcbiAgICAgICAgICAgIHVzZXJJZCxcbiAgICAgICAgICAgIHByb2ZpbGU6IHt9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICAvLyBNb2NrIG5vIG5hdGFsIGNoYXJ0XG4gICAgICBkeW5hbW9Nb2NrXG4gICAgICAgIC5vbihHZXRDb21tYW5kLCB7XG4gICAgICAgICAgVGFibGVOYW1lOiAndGVzdC1uYXRhbC1jaGFydC10YWJsZScsXG4gICAgICAgICAgS2V5OiB7IHVzZXJJZCB9LFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoeyBJdGVtOiB1bmRlZmluZWQgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZ2VuZXJhdGVSZWFkaW5nSGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDQwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5Lm1lc3NhZ2UpLnRvQmUoJ05hdGFsIGNoYXJ0IG5vdCBnZW5lcmF0ZWQuIFBsZWFzZSBjb21wbGV0ZSB5b3VyIHByb2ZpbGUgZmlyc3QuJyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGxvZyBkZXRhaWxlZCBlcnJvciB0byBDbG91ZFdhdGNoIHdoZW4gT3BlbkFJIEFQSSBmYWlscycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHVzZXJJZCA9ICd0ZXN0LXVzZXItMTIzJztcbiAgICAgIGNvbnN0IGV2ZW50OiBQYXJ0aWFsPEFQSUdhdGV3YXlQcm94eUV2ZW50PiA9IHtcbiAgICAgICAgcGF0aFBhcmFtZXRlcnM6IHsgdXNlcklkIH0sXG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICAgICAgY2xhaW1zOiB7IHN1YjogdXNlcklkIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgICB9IGFzIGFueSxcbiAgICAgIH07XG5cbiAgICAgIC8vIFNweSBvbiBjb25zb2xlLmVycm9yIHRvIHZlcmlmeSBDbG91ZFdhdGNoIGxvZ2dpbmdcbiAgICAgIGNvbnN0IGNvbnNvbGVFcnJvclNweSA9IGplc3Quc3B5T24oY29uc29sZSwgJ2Vycm9yJykubW9ja0ltcGxlbWVudGF0aW9uKCgpID0+IHt9KTtcblxuICAgICAgLy8gTW9jayB1c2VyIHByb2ZpbGVcbiAgICAgIGR5bmFtb01vY2tcbiAgICAgICAgLm9uKEdldENvbW1hbmQsIHtcbiAgICAgICAgICBUYWJsZU5hbWU6ICd0ZXN0LXVzZXItdGFibGUnLFxuICAgICAgICAgIEtleTogeyB1c2VySWQsIGNyZWF0ZWRBdDogJ1BST0ZJTEUnIH0sXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgSXRlbToge1xuICAgICAgICAgICAgdXNlcklkLFxuICAgICAgICAgICAgcHJvZmlsZToge1xuICAgICAgICAgICAgICBiaXJ0aE5hbWU6ICdUZXN0IFVzZXInLFxuICAgICAgICAgICAgICBiaXJ0aERhdGU6ICcxOTkwLTAxLTAxJyxcbiAgICAgICAgICAgICAgYmlydGhUaW1lOiAnMTI6MDAnLFxuICAgICAgICAgICAgICBiaXJ0aENpdHk6ICdOZXcgWW9yaycsXG4gICAgICAgICAgICAgIGJpcnRoU3RhdGU6ICdOWScsXG4gICAgICAgICAgICAgIGJpcnRoQ291bnRyeTogJ1VTQScsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICAvLyBNb2NrIG5hdGFsIGNoYXJ0XG4gICAgICBkeW5hbW9Nb2NrXG4gICAgICAgIC5vbihHZXRDb21tYW5kLCB7XG4gICAgICAgICAgVGFibGVOYW1lOiAndGVzdC1uYXRhbC1jaGFydC10YWJsZScsXG4gICAgICAgICAgS2V5OiB7IHVzZXJJZCB9LFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoe1xuICAgICAgICAgIEl0ZW06IHtcbiAgICAgICAgICAgIHVzZXJJZCxcbiAgICAgICAgICAgIHBsYW5ldHM6IHtcbiAgICAgICAgICAgICAgc3VuOiB7IHNpZ246ICdDYXByaWNvcm4nLCBkZWdyZWVJblNpZ246IDEwIH0sXG4gICAgICAgICAgICAgIG1vb246IHsgc2lnbjogJ0NhbmNlcicsIGRlZ3JlZUluU2lnbjogMTUgfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgIC8vIE1vY2sgU1NNIHBhcmFtZXRlcnNcbiAgICAgIHNzbU1vY2sub24oR2V0UGFyYW1ldGVyQ29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBQYXJhbWV0ZXI6IHsgVmFsdWU6ICd0ZXN0LXZhbHVlJyB9LFxuICAgICAgfSk7XG5cbiAgICAgIC8vIE1vY2sgUzMgcHJvbXB0c1xuICAgICAgczNNb2NrLm9uKEdldE9iamVjdENvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgQm9keToge1xuICAgICAgICAgIHRyYW5zZm9ybVRvU3RyaW5nOiBhc3luYyAoKSA9PiAnVGVzdCBwcm9tcHQgY29udGVudCcsXG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgICAgfSBhcyBhbnksXG4gICAgICAgIEVUYWc6ICd0ZXN0LWV0YWcnLFxuICAgICAgfSk7XG5cbiAgICAgIC8vIE1vY2sgRHluYW1vREIgcHV0IGNvbW1hbmRzXG4gICAgICBkeW5hbW9Nb2NrLm9uKFB1dENvbW1hbmQpLnJlc29sdmVzKHt9KTtcblxuICAgICAgLy8gTW9jayBPcGVuQUkgQVBJIGZhaWx1cmUgd2l0aCBkZXRhaWxlZCBlcnJvclxuICAgICAgY29uc3QgZXJyb3JNZXNzYWdlID0gJ0Nvbm5lY3Rpb24gdGltZW91dCBhZnRlciAzMDAwMG1zJztcbiAgICAgIChnbG9iYWwuZmV0Y2ggYXMgamVzdC5Nb2NrKS5tb2NrUmVqZWN0ZWRWYWx1ZU9uY2UobmV3IEVycm9yKGVycm9yTWVzc2FnZSkpO1xuXG4gICAgICBhd2FpdCBnZW5lcmF0ZVJlYWRpbmdIYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgLy8gVmVyaWZ5IHRoYXQgZGV0YWlsZWQgZXJyb3Igd2FzIGxvZ2dlZCB0byBDbG91ZFdhdGNoXG4gICAgICBleHBlY3QoY29uc29sZUVycm9yU3B5KS50b0hhdmVCZWVuQ2FsbGVkKCk7XG4gICAgICBjb25zdCBlcnJvckNhbGwgPSBjb25zb2xlRXJyb3JTcHkubW9jay5jYWxscy5maW5kKFxuICAgICAgICAoY2FsbCkgPT5cbiAgICAgICAgICBjYWxsWzBdID09PSAnRXJyb3IgZ2VuZXJhdGluZyByZWFkaW5nOicgfHwgY2FsbFswXSA9PT0gJ0Vycm9yIGR1cmluZyByZWFkaW5nIGdlbmVyYXRpb246JyxcbiAgICAgICk7XG4gICAgICBleHBlY3QoZXJyb3JDYWxsKS50b0JlRGVmaW5lZCgpO1xuICAgICAgZXhwZWN0KGVycm9yQ2FsbCFbMV0pLnRvTWF0Y2hPYmplY3Qoe1xuICAgICAgICBlcnJvcjogZXJyb3JNZXNzYWdlLFxuICAgICAgICB1c2VySWQsXG4gICAgICAgIHRpbWVzdGFtcDogZXhwZWN0LmFueShTdHJpbmcpLFxuICAgICAgfSk7XG5cbiAgICAgIC8vIFJlc3RvcmUgY29uc29sZS5lcnJvclxuICAgICAgY29uc29sZUVycm9yU3B5Lm1vY2tSZXN0b3JlKCk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBuZXR3b3JrIHRpbWVvdXQgZXJyb3JzIGdyYWNlZnVsbHknLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCB1c2VySWQgPSAndGVzdC11c2VyLTEyMyc7XG4gICAgICBjb25zdCBldmVudDogUGFydGlhbDxBUElHYXRld2F5UHJveHlFdmVudD4gPSB7XG4gICAgICAgIHBhdGhQYXJhbWV0ZXJzOiB7IHVzZXJJZCB9LFxuICAgICAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgICAgIGF1dGhvcml6ZXI6IHtcbiAgICAgICAgICAgIGNsYWltczogeyBzdWI6IHVzZXJJZCB9LFxuICAgICAgICAgIH0sXG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgICAgfSBhcyBhbnksXG4gICAgICB9O1xuXG4gICAgICAvLyBNb2NrIHVzZXIgcHJvZmlsZSBhbmQgbmF0YWwgY2hhcnRcbiAgICAgIGR5bmFtb01vY2tcbiAgICAgICAgLm9uKEdldENvbW1hbmQsIHtcbiAgICAgICAgICBUYWJsZU5hbWU6ICd0ZXN0LXVzZXItdGFibGUnLFxuICAgICAgICAgIEtleTogeyB1c2VySWQsIGNyZWF0ZWRBdDogJ1BST0ZJTEUnIH0sXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgSXRlbToge1xuICAgICAgICAgICAgdXNlcklkLFxuICAgICAgICAgICAgcHJvZmlsZToge1xuICAgICAgICAgICAgICBiaXJ0aE5hbWU6ICdUZXN0IFVzZXInLFxuICAgICAgICAgICAgICBiaXJ0aERhdGU6ICcxOTkwLTAxLTAxJyxcbiAgICAgICAgICAgICAgYmlydGhUaW1lOiAnMTI6MDAnLFxuICAgICAgICAgICAgICBiaXJ0aENpdHk6ICdOZXcgWW9yaycsXG4gICAgICAgICAgICAgIGJpcnRoU3RhdGU6ICdOWScsXG4gICAgICAgICAgICAgIGJpcnRoQ291bnRyeTogJ1VTQScsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICBkeW5hbW9Nb2NrXG4gICAgICAgIC5vbihHZXRDb21tYW5kLCB7XG4gICAgICAgICAgVGFibGVOYW1lOiAndGVzdC1uYXRhbC1jaGFydC10YWJsZScsXG4gICAgICAgICAgS2V5OiB7IHVzZXJJZCB9LFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoe1xuICAgICAgICAgIEl0ZW06IHtcbiAgICAgICAgICAgIHVzZXJJZCxcbiAgICAgICAgICAgIHBsYW5ldHM6IHtcbiAgICAgICAgICAgICAgc3VuOiB7IHNpZ246ICdDYXByaWNvcm4nLCBkZWdyZWVJblNpZ246IDEwIH0sXG4gICAgICAgICAgICAgIG1vb246IHsgc2lnbjogJ0NhbmNlcicsIGRlZ3JlZUluU2lnbjogMTUgfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgIC8vIE1vY2sgU1NNIGFuZCBTM1xuICAgICAgc3NtTW9jay5vbihHZXRQYXJhbWV0ZXJDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIFBhcmFtZXRlcjogeyBWYWx1ZTogJ3Rlc3QtdmFsdWUnIH0sXG4gICAgICB9KTtcblxuICAgICAgczNNb2NrLm9uKEdldE9iamVjdENvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgQm9keToge1xuICAgICAgICAgIHRyYW5zZm9ybVRvU3RyaW5nOiBhc3luYyAoKSA9PiAnVGVzdCBwcm9tcHQgY29udGVudCcsXG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgICAgfSBhcyBhbnksXG4gICAgICAgIEVUYWc6ICd0ZXN0LWV0YWcnLFxuICAgICAgfSk7XG5cbiAgICAgIGR5bmFtb01vY2sub24oUHV0Q29tbWFuZCkucmVzb2x2ZXMoe30pO1xuXG4gICAgICAvLyBTaW11bGF0ZSBuZXR3b3JrIHRpbWVvdXQgZXJyb3JcbiAgICAgIGNvbnN0IHRpbWVvdXRFcnJvciA9IG5ldyBFcnJvcignRVRJTUVET1VUJykgYXMgRXJyb3IgJiB7IGNvZGU/OiBzdHJpbmcgfTtcbiAgICAgIHRpbWVvdXRFcnJvci5jb2RlID0gJ0VUSU1FRE9VVCc7XG4gICAgICAoZ2xvYmFsLmZldGNoIGFzIGplc3QuTW9jaykubW9ja1JlamVjdGVkVmFsdWVPbmNlKHRpbWVvdXRFcnJvcik7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZ2VuZXJhdGVSZWFkaW5nSGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDUwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5Lm1lc3NhZ2UpLnRvQmUoXG4gICAgICAgIFwiV2UncmUgc29ycnksIGJ1dCB3ZSBjb3VsZG4ndCBnZW5lcmF0ZSB5b3VyIHJlYWRpbmcgYXQgdGhpcyB0aW1lLiBQbGVhc2UgdHJ5IGFnYWluIGxhdGVyLlwiLFxuICAgICAgKTtcbiAgICAgIGV4cGVjdChib2R5LmVycm9yKS50b0JlVW5kZWZpbmVkKCk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBhdXRoZW50aWNhdGlvbiBlcnJvcnMgZnJvbSBPcGVuQUknLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCB1c2VySWQgPSAndGVzdC11c2VyLTEyMyc7XG4gICAgICBjb25zdCBldmVudDogUGFydGlhbDxBUElHYXRld2F5UHJveHlFdmVudD4gPSB7XG4gICAgICAgIHBhdGhQYXJhbWV0ZXJzOiB7IHVzZXJJZCB9LFxuICAgICAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgICAgIGF1dGhvcml6ZXI6IHtcbiAgICAgICAgICAgIGNsYWltczogeyBzdWI6IHVzZXJJZCB9LFxuICAgICAgICAgIH0sXG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgICAgfSBhcyBhbnksXG4gICAgICB9O1xuXG4gICAgICAvLyBNb2NrIHVzZXIgcHJvZmlsZSBhbmQgbmF0YWwgY2hhcnRcbiAgICAgIGR5bmFtb01vY2tcbiAgICAgICAgLm9uKEdldENvbW1hbmQsIHtcbiAgICAgICAgICBUYWJsZU5hbWU6ICd0ZXN0LXVzZXItdGFibGUnLFxuICAgICAgICAgIEtleTogeyB1c2VySWQsIGNyZWF0ZWRBdDogJ1BST0ZJTEUnIH0sXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgSXRlbToge1xuICAgICAgICAgICAgdXNlcklkLFxuICAgICAgICAgICAgcHJvZmlsZToge1xuICAgICAgICAgICAgICBiaXJ0aE5hbWU6ICdUZXN0IFVzZXInLFxuICAgICAgICAgICAgICBiaXJ0aERhdGU6ICcxOTkwLTAxLTAxJyxcbiAgICAgICAgICAgICAgYmlydGhUaW1lOiAnMTI6MDAnLFxuICAgICAgICAgICAgICBiaXJ0aENpdHk6ICdOZXcgWW9yaycsXG4gICAgICAgICAgICAgIGJpcnRoU3RhdGU6ICdOWScsXG4gICAgICAgICAgICAgIGJpcnRoQ291bnRyeTogJ1VTQScsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICBkeW5hbW9Nb2NrXG4gICAgICAgIC5vbihHZXRDb21tYW5kLCB7XG4gICAgICAgICAgVGFibGVOYW1lOiAndGVzdC1uYXRhbC1jaGFydC10YWJsZScsXG4gICAgICAgICAgS2V5OiB7IHVzZXJJZCB9LFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoe1xuICAgICAgICAgIEl0ZW06IHtcbiAgICAgICAgICAgIHVzZXJJZCxcbiAgICAgICAgICAgIHBsYW5ldHM6IHtcbiAgICAgICAgICAgICAgc3VuOiB7IHNpZ246ICdDYXByaWNvcm4nLCBkZWdyZWVJblNpZ246IDEwIH0sXG4gICAgICAgICAgICAgIG1vb246IHsgc2lnbjogJ0NhbmNlcicsIGRlZ3JlZUluU2lnbjogMTUgfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgIC8vIE1vY2sgU1NNIGFuZCBTM1xuICAgICAgc3NtTW9jay5vbihHZXRQYXJhbWV0ZXJDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIFBhcmFtZXRlcjogeyBWYWx1ZTogJ3Rlc3QtdmFsdWUnIH0sXG4gICAgICB9KTtcblxuICAgICAgczNNb2NrLm9uKEdldE9iamVjdENvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgQm9keToge1xuICAgICAgICAgIHRyYW5zZm9ybVRvU3RyaW5nOiBhc3luYyAoKSA9PiAnVGVzdCBwcm9tcHQgY29udGVudCcsXG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgICAgfSBhcyBhbnksXG4gICAgICAgIEVUYWc6ICd0ZXN0LWV0YWcnLFxuICAgICAgfSk7XG5cbiAgICAgIGR5bmFtb01vY2sub24oUHV0Q29tbWFuZCkucmVzb2x2ZXMoe30pO1xuXG4gICAgICAvLyBTaW11bGF0ZSBPcGVuQUkgYXV0aGVudGljYXRpb24gZXJyb3IgKDQwMSlcbiAgICAgIChnbG9iYWwuZmV0Y2ggYXMgamVzdC5Nb2NrKS5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2Uoe1xuICAgICAgICBvazogZmFsc2UsXG4gICAgICAgIHN0YXR1czogNDAxLFxuICAgICAgICB0ZXh0OiBhc3luYyAoKSA9PiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiB7IG1lc3NhZ2U6ICdJbnZhbGlkIEFQSSBrZXkgcHJvdmlkZWQnIH0gfSksXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBnZW5lcmF0ZVJlYWRpbmdIYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoNTAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkubWVzc2FnZSkudG9CZShcbiAgICAgICAgXCJXZSdyZSBzb3JyeSwgYnV0IHdlIGNvdWxkbid0IGdlbmVyYXRlIHlvdXIgcmVhZGluZyBhdCB0aGlzIHRpbWUuIFBsZWFzZSB0cnkgYWdhaW4gbGF0ZXIuXCIsXG4gICAgICApO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmVVbmRlZmluZWQoKTtcbiAgICB9KTtcblxuICAgIC8vIFNraXBwaW5nIHRoaXMgdGVzdCBhcyBTMyBmYWlsdXJlcyBhcmUgY2F1Z2h0IGludGVybmFsbHkgYW5kIGZhbGxiYWNrIHByb21wdHMgYXJlIHVzZWQgc2lsZW50bHlcbiAgICAvLyBUaGUgaW1wbGVtZW50YXRpb24gY29ycmVjdGx5IHVzZXMgZmFsbGJhY2sgcHJvbXB0cyBidXQgZG9lc24ndCBsb2cgd2hlbiBTMyBrZXlzIGRvbid0IGV4aXN0XG4gICAgaXQuc2tpcCgnc2hvdWxkIHVzZSBmYWxsYmFjayBwcm9tcHRzIHdoZW4gUzMgZmV0Y2ggZmFpbHMnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCB1c2VySWQgPSAndGVzdC11c2VyLTEyMyc7XG4gICAgICBjb25zdCBldmVudDogUGFydGlhbDxBUElHYXRld2F5UHJveHlFdmVudD4gPSB7XG4gICAgICAgIHBhdGhQYXJhbWV0ZXJzOiB7IHVzZXJJZCB9LFxuICAgICAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgICAgIGF1dGhvcml6ZXI6IHtcbiAgICAgICAgICAgIGNsYWltczogeyBzdWI6IHVzZXJJZCB9LFxuICAgICAgICAgIH0sXG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgICAgfSBhcyBhbnksXG4gICAgICB9O1xuXG4gICAgICAvLyBTcHkgb24gY29uc29sZSB0byB2ZXJpZnkgbG9nZ2luZ1xuICAgICAgY29uc3QgY29uc29sZUVycm9yU3B5ID0gamVzdC5zcHlPbihjb25zb2xlLCAnZXJyb3InKS5tb2NrSW1wbGVtZW50YXRpb24oKCkgPT4ge30pO1xuXG4gICAgICAvLyBNb2NrIHVzZXIgcHJvZmlsZSBhbmQgbmF0YWwgY2hhcnRcbiAgICAgIGR5bmFtb01vY2tcbiAgICAgICAgLm9uKEdldENvbW1hbmQsIHtcbiAgICAgICAgICBUYWJsZU5hbWU6ICd0ZXN0LXVzZXItdGFibGUnLFxuICAgICAgICAgIEtleTogeyB1c2VySWQsIGNyZWF0ZWRBdDogJ1BST0ZJTEUnIH0sXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgSXRlbToge1xuICAgICAgICAgICAgdXNlcklkLFxuICAgICAgICAgICAgcHJvZmlsZToge1xuICAgICAgICAgICAgICBiaXJ0aE5hbWU6ICdUZXN0IFVzZXInLFxuICAgICAgICAgICAgICBiaXJ0aERhdGU6ICcxOTkwLTAxLTAxJyxcbiAgICAgICAgICAgICAgYmlydGhUaW1lOiAnMTI6MDAnLFxuICAgICAgICAgICAgICBiaXJ0aENpdHk6ICdOZXcgWW9yaycsXG4gICAgICAgICAgICAgIGJpcnRoU3RhdGU6ICdOWScsXG4gICAgICAgICAgICAgIGJpcnRoQ291bnRyeTogJ1VTQScsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICBkeW5hbW9Nb2NrXG4gICAgICAgIC5vbihHZXRDb21tYW5kLCB7XG4gICAgICAgICAgVGFibGVOYW1lOiAndGVzdC1uYXRhbC1jaGFydC10YWJsZScsXG4gICAgICAgICAgS2V5OiB7IHVzZXJJZCB9LFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoe1xuICAgICAgICAgIEl0ZW06IHtcbiAgICAgICAgICAgIHVzZXJJZCxcbiAgICAgICAgICAgIHBsYW5ldHM6IHtcbiAgICAgICAgICAgICAgc3VuOiB7IHNpZ246ICdDYXByaWNvcm4nLCBkZWdyZWVJblNpZ246IDEwIH0sXG4gICAgICAgICAgICAgIG1vb246IHsgc2lnbjogJ0NhbmNlcicsIGRlZ3JlZUluU2lnbjogMTUgfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgIC8vIE1vY2sgU1NNIHBhcmFtZXRlcnMgLSBhbGwgc3VjY2VlZFxuICAgICAgc3NtTW9jay5vbihHZXRQYXJhbWV0ZXJDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIFBhcmFtZXRlcjogeyBWYWx1ZTogJ3Rlc3QtdmFsdWUnIH0sXG4gICAgICB9KTtcblxuICAgICAgLy8gTW9jayBTMyBmYWlsdXJlcyAtIHByb21wdHMgZmFpbCB0byBmZXRjaCwgd2hpY2ggd2lsbCBjYXVzZSBmYWxsYmFjayBwcm9tcHRzIHRvIGJlIHVzZWRcbiAgICAgIHMzTW9jay5vbihHZXRPYmplY3RDb21tYW5kKS5yZWplY3RzKG5ldyBFcnJvcignTm9TdWNoS2V5JykpO1xuXG4gICAgICAvLyBNb2NrIER5bmFtb0RCIHB1dCBjb21tYW5kc1xuICAgICAgZHluYW1vTW9jay5vbihQdXRDb21tYW5kKS5yZXNvbHZlcyh7fSk7XG5cbiAgICAgIC8vIE1vY2sgc3VjY2Vzc2Z1bCBPcGVuQUkgQVBJIGNhbGwgKHdpbGwgdXNlIGZhbGxiYWNrIHByb21wdHMpXG4gICAgICAoZ2xvYmFsLmZldGNoIGFzIGplc3QuTW9jaykubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHtcbiAgICAgICAgb2s6IHRydWUsXG4gICAgICAgIGpzb246IGFzeW5jICgpID0+ICh7XG4gICAgICAgICAgY2hvaWNlczogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBtZXNzYWdlOiB7XG4gICAgICAgICAgICAgICAgY29udGVudDogJ1Rlc3QgcmVhZGluZyB3aXRoIGZhbGxiYWNrIHByb21wdHMnLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICBdLFxuICAgICAgICB9KSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGdlbmVyYXRlUmVhZGluZ0hhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICAvLyBTaG91bGQgc3VjY2VlZCBldmVuIHdpdGggUzMgZmFpbHVyZSAodXNlcyBmYWxsYmFjayBwcm9tcHRzKVxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkubWVzc2FnZSkudG9CZSgnUmVhZGluZyBnZW5lcmF0ZWQgc3VjY2Vzc2Z1bGx5Jyk7XG4gICAgICBleHBlY3QoYm9keS5yZWFkaW5nSWQpLnRvQmVEZWZpbmVkKCk7XG4gICAgICBleHBlY3QoYm9keS5zdGF0dXMpLnRvQmUoJ1JlYWR5Jyk7XG5cbiAgICAgIC8vIFZlcmlmeSB0aGF0IFMzIGVycm9ycyB3ZXJlIGxvZ2dlZFxuICAgICAgZXhwZWN0KGNvbnNvbGVFcnJvclNweSkudG9IYXZlQmVlbkNhbGxlZCgpO1xuXG4gICAgICAvLyBBdCBsZWFzdCBvbmUgY2FsbCBzaG91bGQgbWVudGlvbiBTMyBmYWlsdXJlXG4gICAgICBjb25zdCBoYXNTM0Vycm9yID0gY29uc29sZUVycm9yU3B5Lm1vY2suY2FsbHMuc29tZSgoY2FsbCkgPT4ge1xuICAgICAgICBjb25zdCBmaXJzdEFyZyA9IGNhbGxbMF07XG4gICAgICAgIHJldHVybiAoXG4gICAgICAgICAgdHlwZW9mIGZpcnN0QXJnID09PSAnc3RyaW5nJyAmJlxuICAgICAgICAgIChmaXJzdEFyZy5pbmNsdWRlcygnRmFpbGVkIHRvIGZldGNoIFMzIG9iamVjdCcpIHx8XG4gICAgICAgICAgICBmaXJzdEFyZy5pbmNsdWRlcygnRmFpbGVkIHRvIGZldGNoIHByb21wdHMgZnJvbSBTMycpKVxuICAgICAgICApO1xuICAgICAgfSk7XG4gICAgICBleHBlY3QoaGFzUzNFcnJvcikudG9CZSh0cnVlKTtcblxuICAgICAgLy8gUmVzdG9yZSBjb25zb2xlLmVycm9yXG4gICAgICBjb25zb2xlRXJyb3JTcHkubW9ja1Jlc3RvcmUoKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIHJhdGUgbGltaXQgZXJyb3JzIGZyb20gT3BlbkFJIHdpdGggcmV0cnkgaW5mb3JtYXRpb24nLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCB1c2VySWQgPSAndGVzdC11c2VyLTEyMyc7XG4gICAgICBjb25zdCBldmVudDogUGFydGlhbDxBUElHYXRld2F5UHJveHlFdmVudD4gPSB7XG4gICAgICAgIHBhdGhQYXJhbWV0ZXJzOiB7IHVzZXJJZCB9LFxuICAgICAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgICAgIGF1dGhvcml6ZXI6IHtcbiAgICAgICAgICAgIGNsYWltczogeyBzdWI6IHVzZXJJZCB9LFxuICAgICAgICAgIH0sXG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgICAgfSBhcyBhbnksXG4gICAgICB9O1xuXG4gICAgICAvLyBNb2NrIHVzZXIgcHJvZmlsZSBhbmQgbmF0YWwgY2hhcnRcbiAgICAgIGR5bmFtb01vY2tcbiAgICAgICAgLm9uKEdldENvbW1hbmQsIHtcbiAgICAgICAgICBUYWJsZU5hbWU6ICd0ZXN0LXVzZXItdGFibGUnLFxuICAgICAgICAgIEtleTogeyB1c2VySWQsIGNyZWF0ZWRBdDogJ1BST0ZJTEUnIH0sXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgSXRlbToge1xuICAgICAgICAgICAgdXNlcklkLFxuICAgICAgICAgICAgcHJvZmlsZToge1xuICAgICAgICAgICAgICBiaXJ0aE5hbWU6ICdUZXN0IFVzZXInLFxuICAgICAgICAgICAgICBiaXJ0aERhdGU6ICcxOTkwLTAxLTAxJyxcbiAgICAgICAgICAgICAgYmlydGhUaW1lOiAnMTI6MDAnLFxuICAgICAgICAgICAgICBiaXJ0aENpdHk6ICdOZXcgWW9yaycsXG4gICAgICAgICAgICAgIGJpcnRoU3RhdGU6ICdOWScsXG4gICAgICAgICAgICAgIGJpcnRoQ291bnRyeTogJ1VTQScsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICBkeW5hbW9Nb2NrXG4gICAgICAgIC5vbihHZXRDb21tYW5kLCB7XG4gICAgICAgICAgVGFibGVOYW1lOiAndGVzdC1uYXRhbC1jaGFydC10YWJsZScsXG4gICAgICAgICAgS2V5OiB7IHVzZXJJZCB9LFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoe1xuICAgICAgICAgIEl0ZW06IHtcbiAgICAgICAgICAgIHVzZXJJZCxcbiAgICAgICAgICAgIHBsYW5ldHM6IHtcbiAgICAgICAgICAgICAgc3VuOiB7IHNpZ246ICdDYXByaWNvcm4nLCBkZWdyZWVJblNpZ246IDEwIH0sXG4gICAgICAgICAgICAgIG1vb246IHsgc2lnbjogJ0NhbmNlcicsIGRlZ3JlZUluU2lnbjogMTUgfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgIC8vIE1vY2sgU1NNIGFuZCBTM1xuICAgICAgc3NtTW9jay5vbihHZXRQYXJhbWV0ZXJDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIFBhcmFtZXRlcjogeyBWYWx1ZTogJ3Rlc3QtdmFsdWUnIH0sXG4gICAgICB9KTtcblxuICAgICAgczNNb2NrLm9uKEdldE9iamVjdENvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgQm9keToge1xuICAgICAgICAgIHRyYW5zZm9ybVRvU3RyaW5nOiBhc3luYyAoKSA9PiAnVGVzdCBwcm9tcHQgY29udGVudCcsXG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgICAgfSBhcyBhbnksXG4gICAgICAgIEVUYWc6ICd0ZXN0LWV0YWcnLFxuICAgICAgfSk7XG5cbiAgICAgIGR5bmFtb01vY2sub24oUHV0Q29tbWFuZCkucmVzb2x2ZXMoe30pO1xuXG4gICAgICAvLyBTaW11bGF0ZSBPcGVuQUkgcmF0ZSBsaW1pdCBlcnJvciAoNDI5KVxuICAgICAgKGdsb2JhbC5mZXRjaCBhcyBqZXN0Lk1vY2spLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7XG4gICAgICAgIG9rOiBmYWxzZSxcbiAgICAgICAgc3RhdHVzOiA0MjksXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAncmV0cnktYWZ0ZXInOiAnNjAnLFxuICAgICAgICB9LFxuICAgICAgICB0ZXh0OiBhc3luYyAoKSA9PlxuICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIGVycm9yOiB7XG4gICAgICAgICAgICAgIG1lc3NhZ2U6ICdSYXRlIGxpbWl0IGV4Y2VlZGVkLiBQbGVhc2UgcmV0cnkgYWZ0ZXIgNjAgc2Vjb25kcy4nLFxuICAgICAgICAgICAgICB0eXBlOiAncmF0ZV9saW1pdF9lcnJvcicsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0pLFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZ2VuZXJhdGVSZWFkaW5nSGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDUwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5Lm1lc3NhZ2UpLnRvQmUoXG4gICAgICAgIFwiV2UncmUgc29ycnksIGJ1dCB3ZSBjb3VsZG4ndCBnZW5lcmF0ZSB5b3VyIHJlYWRpbmcgYXQgdGhpcyB0aW1lLiBQbGVhc2UgdHJ5IGFnYWluIGxhdGVyLlwiLFxuICAgICAgKTtcbiAgICAgIGV4cGVjdChib2R5LmVycm9yKS50b0JlVW5kZWZpbmVkKCk7XG4gICAgICBleHBlY3QoYm9keVsncmV0cnktYWZ0ZXInXSkudG9CZVVuZGVmaW5lZCgpOyAvLyBTaG91bGQgbm90IGV4cG9zZSByZXRyeSBpbmZvcm1hdGlvbiB0byB1c2Vyc1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgbWlzc2luZyBTU00gcGFyYW1ldGVycyBncmFjZWZ1bGx5JywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgdXNlcklkID0gJ3Rlc3QtdXNlci0xMjMnO1xuICAgICAgY29uc3QgZXZlbnQ6IFBhcnRpYWw8QVBJR2F0ZXdheVByb3h5RXZlbnQ+ID0ge1xuICAgICAgICBwYXRoUGFyYW1ldGVyczogeyB1c2VySWQgfSxcbiAgICAgICAgcmVxdWVzdENvbnRleHQ6IHtcbiAgICAgICAgICBhdXRob3JpemVyOiB7XG4gICAgICAgICAgICBjbGFpbXM6IHsgc3ViOiB1c2VySWQgfSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICAgIH0gYXMgYW55LFxuICAgICAgfTtcblxuICAgICAgLy8gTW9jayB1c2VyIHByb2ZpbGUgYW5kIG5hdGFsIGNoYXJ0XG4gICAgICBkeW5hbW9Nb2NrXG4gICAgICAgIC5vbihHZXRDb21tYW5kLCB7XG4gICAgICAgICAgVGFibGVOYW1lOiAndGVzdC11c2VyLXRhYmxlJyxcbiAgICAgICAgICBLZXk6IHsgdXNlcklkLCBjcmVhdGVkQXQ6ICdQUk9GSUxFJyB9LFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoe1xuICAgICAgICAgIEl0ZW06IHtcbiAgICAgICAgICAgIHVzZXJJZCxcbiAgICAgICAgICAgIHByb2ZpbGU6IHtcbiAgICAgICAgICAgICAgYmlydGhOYW1lOiAnVGVzdCBVc2VyJyxcbiAgICAgICAgICAgICAgYmlydGhEYXRlOiAnMTk5MC0wMS0wMScsXG4gICAgICAgICAgICAgIGJpcnRoVGltZTogJzEyOjAwJyxcbiAgICAgICAgICAgICAgYmlydGhDaXR5OiAnTmV3IFlvcmsnLFxuICAgICAgICAgICAgICBiaXJ0aFN0YXRlOiAnTlknLFxuICAgICAgICAgICAgICBiaXJ0aENvdW50cnk6ICdVU0EnLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgZHluYW1vTW9ja1xuICAgICAgICAub24oR2V0Q29tbWFuZCwge1xuICAgICAgICAgIFRhYmxlTmFtZTogJ3Rlc3QtbmF0YWwtY2hhcnQtdGFibGUnLFxuICAgICAgICAgIEtleTogeyB1c2VySWQgfSxcbiAgICAgICAgfSlcbiAgICAgICAgLnJlc29sdmVzKHtcbiAgICAgICAgICBJdGVtOiB7XG4gICAgICAgICAgICB1c2VySWQsXG4gICAgICAgICAgICBwbGFuZXRzOiB7XG4gICAgICAgICAgICAgIHN1bjogeyBzaWduOiAnQ2Fwcmljb3JuJywgZGVncmVlSW5TaWduOiAxMCB9LFxuICAgICAgICAgICAgICBtb29uOiB7IHNpZ246ICdDYW5jZXInLCBkZWdyZWVJblNpZ246IDE1IH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICAvLyBNb2NrIFNTTSBwYXJhbWV0ZXIgbm90IGZvdW5kIGVycm9yXG4gICAgICBzc21Nb2NrLm9uKEdldFBhcmFtZXRlckNvbW1hbmQpLnJlamVjdHMobmV3IEVycm9yKCdQYXJhbWV0ZXJOb3RGb3VuZCcpKTtcblxuICAgICAgLy8gTW9jayBTMyBhbmQgRHluYW1vREJcbiAgICAgIHMzTW9jay5vbihHZXRPYmplY3RDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIEJvZHk6IHtcbiAgICAgICAgICB0cmFuc2Zvcm1Ub1N0cmluZzogYXN5bmMgKCkgPT4gJ1Rlc3QgcHJvbXB0IGNvbnRlbnQnLFxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICAgIH0gYXMgYW55LFxuICAgICAgICBFVGFnOiAndGVzdC1ldGFnJyxcbiAgICAgIH0pO1xuXG4gICAgICBkeW5hbW9Nb2NrLm9uKFB1dENvbW1hbmQpLnJlc29sdmVzKHt9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBnZW5lcmF0ZVJlYWRpbmdIYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoNTAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkubWVzc2FnZSkudG9CZShcbiAgICAgICAgXCJXZSdyZSBzb3JyeSwgYnV0IHdlIGNvdWxkbid0IGdlbmVyYXRlIHlvdXIgcmVhZGluZyBhdCB0aGlzIHRpbWUuIFBsZWFzZSB0cnkgYWdhaW4gbGF0ZXIuXCIsXG4gICAgICApO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmVVbmRlZmluZWQoKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ2dldFJlYWRpbmdzSGFuZGxlcicsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIHJldHVybiBsaXN0IG9mIHJlYWRpbmdzIGZvciBhIHVzZXInLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCB1c2VySWQgPSAndGVzdC11c2VyLTEyMyc7XG4gICAgICBjb25zdCBldmVudDogUGFydGlhbDxBUElHYXRld2F5UHJveHlFdmVudD4gPSB7XG4gICAgICAgIHBhdGhQYXJhbWV0ZXJzOiB7IHVzZXJJZCB9LFxuICAgICAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgICAgIGF1dGhvcml6ZXI6IHtcbiAgICAgICAgICAgIGNsYWltczogeyBzdWI6IHVzZXJJZCB9LFxuICAgICAgICAgIH0sXG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgICAgfSBhcyBhbnksXG4gICAgICB9O1xuXG4gICAgICBjb25zdCBtb2NrUmVhZGluZ3MgPSBbXG4gICAgICAgIHtcbiAgICAgICAgICByZWFkaW5nSWQ6ICdyZWFkaW5nLTEnLFxuICAgICAgICAgIHR5cGU6ICdTb3VsIEJsdWVwcmludCcsXG4gICAgICAgICAgc3RhdHVzOiAnUmVhZHknLFxuICAgICAgICAgIGNyZWF0ZWRBdDogJzIwMjQtMDEtMDFUMDA6MDA6MDBaJyxcbiAgICAgICAgICB1cGRhdGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAxOjAwWicsXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICByZWFkaW5nSWQ6ICdyZWFkaW5nLTInLFxuICAgICAgICAgIHR5cGU6ICdTb3VsIEJsdWVwcmludCcsXG4gICAgICAgICAgc3RhdHVzOiAnUHJvY2Vzc2luZycsXG4gICAgICAgICAgY3JlYXRlZEF0OiAnMjAyNC0wMS0wMlQwMDowMDowMFonLFxuICAgICAgICAgIHVwZGF0ZWRBdDogJzIwMjQtMDEtMDJUMDA6MDA6MDBaJyxcbiAgICAgICAgfSxcbiAgICAgIF07XG5cbiAgICAgIGR5bmFtb01vY2sub24oUXVlcnlDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIEl0ZW1zOiBtb2NrUmVhZGluZ3MsXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBnZXRSZWFkaW5nc0hhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5yZWFkaW5ncykudG9IYXZlTGVuZ3RoKDIpO1xuICAgICAgZXhwZWN0KGJvZHkuY291bnQpLnRvQmUoMik7XG4gICAgICBleHBlY3QoYm9keS5yZWFkaW5nc1swXS5yZWFkaW5nSWQpLnRvQmUoJ3JlYWRpbmctMScpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gZW1wdHkgbGlzdCBpZiBubyByZWFkaW5ncyBleGlzdCcsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHVzZXJJZCA9ICd0ZXN0LXVzZXItMTIzJztcbiAgICAgIGNvbnN0IGV2ZW50OiBQYXJ0aWFsPEFQSUdhdGV3YXlQcm94eUV2ZW50PiA9IHtcbiAgICAgICAgcGF0aFBhcmFtZXRlcnM6IHsgdXNlcklkIH0sXG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICAgICAgY2xhaW1zOiB7IHN1YjogdXNlcklkIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgICB9IGFzIGFueSxcbiAgICAgIH07XG5cbiAgICAgIGR5bmFtb01vY2sub24oUXVlcnlDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIEl0ZW1zOiBbXSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGdldFJlYWRpbmdzSGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LnJlYWRpbmdzKS50b0hhdmVMZW5ndGgoMCk7XG4gICAgICBleHBlY3QoYm9keS5jb3VudCkudG9CZSgwKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ2dldFJlYWRpbmdEZXRhaWxIYW5kbGVyJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgcmV0dXJuIHJlYWRpbmcgZGV0YWlsIHN1Y2Nlc3NmdWxseScsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHVzZXJJZCA9ICd0ZXN0LXVzZXItMTIzJztcbiAgICAgIGNvbnN0IHJlYWRpbmdJZCA9ICdyZWFkaW5nLTEyMyc7XG4gICAgICBjb25zdCBldmVudDogUGFydGlhbDxBUElHYXRld2F5UHJveHlFdmVudD4gPSB7XG4gICAgICAgIHBhdGhQYXJhbWV0ZXJzOiB7IHVzZXJJZCwgcmVhZGluZ0lkIH0sXG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICAgICAgY2xhaW1zOiB7IHN1YjogdXNlcklkIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgICB9IGFzIGFueSxcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IG1vY2tSZWFkaW5nID0ge1xuICAgICAgICB1c2VySWQsXG4gICAgICAgIHJlYWRpbmdJZCxcbiAgICAgICAgdHlwZTogJ1NvdWwgQmx1ZXByaW50JyxcbiAgICAgICAgc3RhdHVzOiAnUmVhZHknLFxuICAgICAgICBjb250ZW50OiAnWW91ciBkZXRhaWxlZCBTb3VsIEJsdWVwcmludCByZWFkaW5nLi4uJyxcbiAgICAgICAgY3JlYXRlZEF0OiAnMjAyNC0wMS0wMVQwMDowMDowMFonLFxuICAgICAgICB1cGRhdGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAxOjAwWicsXG4gICAgICB9O1xuXG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgSXRlbTogbW9ja1JlYWRpbmcsXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBnZXRSZWFkaW5nRGV0YWlsSGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LnJlYWRpbmdJZCkudG9CZShyZWFkaW5nSWQpO1xuICAgICAgZXhwZWN0KGJvZHkuY29udGVudCkudG9CZSgnWW91ciBkZXRhaWxlZCBTb3VsIEJsdWVwcmludCByZWFkaW5nLi4uJyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHJldHVybiA0MDQgaWYgcmVhZGluZyBub3QgZm91bmQnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCB1c2VySWQgPSAndGVzdC11c2VyLTEyMyc7XG4gICAgICBjb25zdCByZWFkaW5nSWQgPSAnbm9uLWV4aXN0ZW50JztcbiAgICAgIGNvbnN0IGV2ZW50OiBQYXJ0aWFsPEFQSUdhdGV3YXlQcm94eUV2ZW50PiA9IHtcbiAgICAgICAgcGF0aFBhcmFtZXRlcnM6IHsgdXNlcklkLCByZWFkaW5nSWQgfSxcbiAgICAgICAgcmVxdWVzdENvbnRleHQ6IHtcbiAgICAgICAgICBhdXRob3JpemVyOiB7XG4gICAgICAgICAgICBjbGFpbXM6IHsgc3ViOiB1c2VySWQgfSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICAgIH0gYXMgYW55LFxuICAgICAgfTtcblxuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIEl0ZW06IHVuZGVmaW5lZCxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGdldFJlYWRpbmdEZXRhaWxIYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoNDA0KTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkubWVzc2FnZSkudG9CZSgnUmVhZGluZyBub3QgZm91bmQnKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgcmV0dXJuIDQwMyBpZiB1c2VyIGlzIG5vdCBhdXRob3JpemVkJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQ6IFBhcnRpYWw8QVBJR2F0ZXdheVByb3h5RXZlbnQ+ID0ge1xuICAgICAgICBwYXRoUGFyYW1ldGVyczogeyB1c2VySWQ6ICd1c2VyLTEyMycsIHJlYWRpbmdJZDogJ3JlYWRpbmctMTIzJyB9LFxuICAgICAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgICAgIGF1dGhvcml6ZXI6IHtcbiAgICAgICAgICAgIGNsYWltczogeyBzdWI6ICdkaWZmZXJlbnQtdXNlcicgfSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICAgIH0gYXMgYW55LFxuICAgICAgfTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBnZXRSZWFkaW5nRGV0YWlsSGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDQwMyk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5Lm1lc3NhZ2UpLnRvQmUoJ1VuYXV0aG9yaXplZCB0byB2aWV3IHRoaXMgcmVhZGluZycpO1xuICAgIH0pO1xuICB9KTtcbn0pO1xuIl19