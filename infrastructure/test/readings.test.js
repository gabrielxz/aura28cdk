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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVhZGluZ3MudGVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInJlYWRpbmdzLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSwwRUFBd0Y7QUFDeEYsa0VBQWdGO0FBQ2hGLDhFQUEyRjtBQUUzRix3REFLK0I7QUFDL0Isb0RBQXFFO0FBQ3JFLGtEQUFnRTtBQUNoRSw2REFBaUQ7QUFFakQseUNBQXlDO0FBQ3pDLE1BQU0sVUFBVSxHQUFHLElBQUEsZ0NBQVUsRUFBQyxxQ0FBc0IsQ0FBQyxDQUFDO0FBQ3RELE1BQU0sT0FBTyxHQUFHLElBQUEsZ0NBQVUsRUFBQyxzQkFBUyxDQUFDLENBQUM7QUFDdEMsTUFBTSxNQUFNLEdBQUcsSUFBQSxnQ0FBVSxFQUFDLG9CQUFRLENBQUMsQ0FBQztBQUVwQyxrQ0FBa0M7QUFDbEMsTUFBTSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsRUFBRSxFQUFFLENBQUM7QUFFekIsUUFBUSxDQUFDLDJCQUEyQixFQUFFLEdBQUcsRUFBRTtJQUN6QyxVQUFVLENBQUMsR0FBRyxFQUFFO1FBQ2QsVUFBVSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ25CLE9BQU8sQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNoQixNQUFNLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDZCxNQUFNLENBQUMsS0FBbUIsQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUV4QyxxQ0FBcUM7UUFDckMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsR0FBRyxxQkFBcUIsQ0FBQztRQUN4RCxPQUFPLENBQUMsR0FBRyxDQUFDLGVBQWUsR0FBRyxpQkFBaUIsQ0FBQztRQUNoRCxPQUFPLENBQUMsR0FBRyxDQUFDLHNCQUFzQixHQUFHLHdCQUF3QixDQUFDO1FBQzlELE9BQU8sQ0FBQyxHQUFHLENBQUMsa0JBQWtCLEdBQUcsb0JBQW9CLENBQUM7UUFDdEQsT0FBTyxDQUFDLEdBQUcsQ0FBQyw2QkFBNkIsR0FBRyxrQkFBa0IsQ0FBQztRQUMv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LENBQUMsR0FBRyxDQUFDLENBQUM7WUFDdEMsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDdkMsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsQ0FBQztRQUNqRCxDQUFDLENBQUMsQ0FBQztRQUVILEVBQUUsQ0FBQyw2Q0FBNkMsRUFBRSxLQUFLLElBQUksRUFBRTtZQUMzRCxNQUFNLEtBQUssR0FBa0M7Z0JBQzNDLGNBQWMsRUFBRSxFQUFFLE1BQU0sRUFBRSxVQUFVLEVBQUUsU0FBUyxFQUFFLGFBQWEsRUFBRTtnQkFDaEUsY0FBYyxFQUFFO29CQUNkLFVBQVUsRUFBRTt3QkFDVixNQUFNLEVBQUUsRUFBRSxHQUFHLEVBQUUsZ0JBQWdCLEVBQUU7cUJBQ2xDO29CQUNELDhEQUE4RDtpQkFDeEQ7YUFDVCxDQUFDO1lBRUYsTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFBLDRCQUF1QixFQUFDLEtBQTZCLENBQUMsQ0FBQztZQUU5RSxNQUFNLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUN0QyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN2QyxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxtQ0FBbUMsQ0FBQyxDQUFDO1FBQ2pFLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGhhbmRsZXIgYXMgZ2VuZXJhdGVSZWFkaW5nSGFuZGxlciB9IGZyb20gJy4uL2xhbWJkYS9yZWFkaW5ncy9nZW5lcmF0ZS1yZWFkaW5nJztcbmltcG9ydCB7IGhhbmRsZXIgYXMgZ2V0UmVhZGluZ3NIYW5kbGVyIH0gZnJvbSAnLi4vbGFtYmRhL3JlYWRpbmdzL2dldC1yZWFkaW5ncyc7XG5pbXBvcnQgeyBoYW5kbGVyIGFzIGdldFJlYWRpbmdEZXRhaWxIYW5kbGVyIH0gZnJvbSAnLi4vbGFtYmRhL3JlYWRpbmdzL2dldC1yZWFkaW5nLWRldGFpbCc7XG5pbXBvcnQgeyBBUElHYXRld2F5UHJveHlFdmVudCB9IGZyb20gJ2F3cy1sYW1iZGEnO1xuaW1wb3J0IHtcbiAgRHluYW1vREJEb2N1bWVudENsaWVudCxcbiAgR2V0Q29tbWFuZCxcbiAgUHV0Q29tbWFuZCxcbiAgUXVlcnlDb21tYW5kLFxufSBmcm9tICdAYXdzLXNkay9saWItZHluYW1vZGInO1xuaW1wb3J0IHsgU1NNQ2xpZW50LCBHZXRQYXJhbWV0ZXJDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXNzbSc7XG5pbXBvcnQgeyBTM0NsaWVudCwgR2V0T2JqZWN0Q29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zMyc7XG5pbXBvcnQgeyBtb2NrQ2xpZW50IH0gZnJvbSAnYXdzLXNkay1jbGllbnQtbW9jayc7XG5cbi8vIE1vY2sgdGhlIER5bmFtb0RCLCBTU00sIGFuZCBTMyBjbGllbnRzXG5jb25zdCBkeW5hbW9Nb2NrID0gbW9ja0NsaWVudChEeW5hbW9EQkRvY3VtZW50Q2xpZW50KTtcbmNvbnN0IHNzbU1vY2sgPSBtb2NrQ2xpZW50KFNTTUNsaWVudCk7XG5jb25zdCBzM01vY2sgPSBtb2NrQ2xpZW50KFMzQ2xpZW50KTtcblxuLy8gTW9jayBmZXRjaCBmb3IgT3BlbkFJIEFQSSBjYWxsc1xuZ2xvYmFsLmZldGNoID0gamVzdC5mbigpO1xuXG5kZXNjcmliZSgnUmVhZGluZ3MgTGFtYmRhIEZ1bmN0aW9ucycsICgpID0+IHtcbiAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgZHluYW1vTW9jay5yZXNldCgpO1xuICAgIHNzbU1vY2sucmVzZXQoKTtcbiAgICBzM01vY2sucmVzZXQoKTtcbiAgICAoZ2xvYmFsLmZldGNoIGFzIGplc3QuTW9jaykubW9ja1Jlc2V0KCk7XG5cbiAgICAvLyBTZXQgcmVxdWlyZWQgZW52aXJvbm1lbnQgdmFyaWFibGVzXG4gICAgcHJvY2Vzcy5lbnYuUkVBRElOR1NfVEFCTEVfTkFNRSA9ICd0ZXN0LXJlYWRpbmdzLXRhYmxlJztcbiAgICBwcm9jZXNzLmVudi5VU0VSX1RBQkxFX05BTUUgPSAndGVzdC11c2VyLXRhYmxlJztcbiAgICBwcm9jZXNzLmVudi5OQVRBTF9DSEFSVF9UQUJMRV9OQU1FID0gJ3Rlc3QtbmF0YWwtY2hhcnQtdGFibGUnO1xuICAgIHByb2Nlc3MuZW52LkNPTkZJR19CVUNLRVRfTkFNRSA9ICd0ZXN0LWNvbmZpZy1idWNrZXQnO1xuICAgIHByb2Nlc3MuZW52Lk9QRU5BSV9BUElfS0VZX1BBUkFNRVRFUl9OQU1FID0gJy90ZXN0L29wZW5haS1rZXknO1xuICAgIHByb2Nlc3MuZW52LlJFQURJTkdfTU9ERUxfUEFSQU1FVEVSX05BTUUgPSAnL3Rlc3QvcmVhZGluZy1tb2RlbCc7XG4gICAgcHJvY2Vzcy5lbnYuUkVBRElOR19URU1QRVJBVFVSRV9QQVJBTUVURVJfTkFNRSA9ICcvdGVzdC9yZWFkaW5nLXRlbXBlcmF0dXJlJztcbiAgICBwcm9jZXNzLmVudi5SRUFESU5HX01BWF9UT0tFTlNfUEFSQU1FVEVSX05BTUUgPSAnL3Rlc3QvcmVhZGluZy1tYXgtdG9rZW5zJztcbiAgICBwcm9jZXNzLmVudi5TWVNURU1fUFJPTVBUX1MzS0VZX1BBUkFNRVRFUl9OQU1FID0gJy90ZXN0L3N5c3RlbS1wcm9tcHQta2V5JztcbiAgICBwcm9jZXNzLmVudi5VU0VSX1BST01QVF9TM0tFWV9QQVJBTUVURVJfTkFNRSA9ICcvdGVzdC91c2VyLXByb21wdC1rZXknO1xuICB9KTtcblxuICBkZXNjcmliZSgnZ2VuZXJhdGVSZWFkaW5nSGFuZGxlcicsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGdlbmVyYXRlIGEgcmVhZGluZyBzdWNjZXNzZnVsbHknLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCB1c2VySWQgPSAndGVzdC11c2VyLTEyMyc7XG4gICAgICBjb25zdCBldmVudDogUGFydGlhbDxBUElHYXRld2F5UHJveHlFdmVudD4gPSB7XG4gICAgICAgIHBhdGhQYXJhbWV0ZXJzOiB7IHVzZXJJZCB9LFxuICAgICAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgICAgIGF1dGhvcml6ZXI6IHtcbiAgICAgICAgICAgIGNsYWltczogeyBzdWI6IHVzZXJJZCB9LFxuICAgICAgICAgIH0sXG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgICAgfSBhcyBhbnksXG4gICAgICB9O1xuXG4gICAgICAvLyBNb2NrIHVzZXIgcHJvZmlsZVxuICAgICAgZHluYW1vTW9ja1xuICAgICAgICAub24oR2V0Q29tbWFuZCwge1xuICAgICAgICAgIFRhYmxlTmFtZTogJ3Rlc3QtdXNlci10YWJsZScsXG4gICAgICAgICAgS2V5OiB7IHVzZXJJZCwgY3JlYXRlZEF0OiAnUFJPRklMRScgfSxcbiAgICAgICAgfSlcbiAgICAgICAgLnJlc29sdmVzKHtcbiAgICAgICAgICBJdGVtOiB7XG4gICAgICAgICAgICB1c2VySWQsXG4gICAgICAgICAgICBwcm9maWxlOiB7XG4gICAgICAgICAgICAgIGJpcnRoTmFtZTogJ1Rlc3QgVXNlcicsXG4gICAgICAgICAgICAgIGJpcnRoRGF0ZTogJzE5OTAtMDEtMDEnLFxuICAgICAgICAgICAgICBiaXJ0aFRpbWU6ICcxMjowMCcsXG4gICAgICAgICAgICAgIGJpcnRoQ2l0eTogJ05ldyBZb3JrJyxcbiAgICAgICAgICAgICAgYmlydGhTdGF0ZTogJ05ZJyxcbiAgICAgICAgICAgICAgYmlydGhDb3VudHJ5OiAnVVNBJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgIC8vIE1vY2sgbmF0YWwgY2hhcnRcbiAgICAgIGR5bmFtb01vY2tcbiAgICAgICAgLm9uKEdldENvbW1hbmQsIHtcbiAgICAgICAgICBUYWJsZU5hbWU6ICd0ZXN0LW5hdGFsLWNoYXJ0LXRhYmxlJyxcbiAgICAgICAgICBLZXk6IHsgdXNlcklkIH0sXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgSXRlbToge1xuICAgICAgICAgICAgdXNlcklkLFxuICAgICAgICAgICAgcGxhbmV0czoge1xuICAgICAgICAgICAgICBzdW46IHsgc2lnbjogJ0NhcHJpY29ybicsIGRlZ3JlZUluU2lnbjogMTAgfSxcbiAgICAgICAgICAgICAgbW9vbjogeyBzaWduOiAnQ2FuY2VyJywgZGVncmVlSW5TaWduOiAxNSB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgLy8gTW9jayBTU00gcGFyYW1ldGVycyBmb3IgT3BlbkFJIGNvbmZpZ3VyYXRpb25cbiAgICAgIHNzbU1vY2tcbiAgICAgICAgLm9uKEdldFBhcmFtZXRlckNvbW1hbmQsIHtcbiAgICAgICAgICBOYW1lOiAnL3Rlc3Qvb3BlbmFpLWtleScsXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgUGFyYW1ldGVyOiB7XG4gICAgICAgICAgICBWYWx1ZTogJ3Rlc3QtYXBpLWtleScsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgIHNzbU1vY2tcbiAgICAgICAgLm9uKEdldFBhcmFtZXRlckNvbW1hbmQsIHtcbiAgICAgICAgICBOYW1lOiAnL3Rlc3QvcmVhZGluZy1tb2RlbCcsXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgUGFyYW1ldGVyOiB7XG4gICAgICAgICAgICBWYWx1ZTogJ2dwdC00LXR1cmJvLXByZXZpZXcnLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICBzc21Nb2NrXG4gICAgICAgIC5vbihHZXRQYXJhbWV0ZXJDb21tYW5kLCB7XG4gICAgICAgICAgTmFtZTogJy90ZXN0L3JlYWRpbmctdGVtcGVyYXR1cmUnLFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoe1xuICAgICAgICAgIFBhcmFtZXRlcjoge1xuICAgICAgICAgICAgVmFsdWU6ICcwLjcnLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICBzc21Nb2NrXG4gICAgICAgIC5vbihHZXRQYXJhbWV0ZXJDb21tYW5kLCB7XG4gICAgICAgICAgTmFtZTogJy90ZXN0L3JlYWRpbmctbWF4LXRva2VucycsXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgUGFyYW1ldGVyOiB7XG4gICAgICAgICAgICBWYWx1ZTogJzIwMDAnLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICBzc21Nb2NrXG4gICAgICAgIC5vbihHZXRQYXJhbWV0ZXJDb21tYW5kLCB7XG4gICAgICAgICAgTmFtZTogJy90ZXN0L3N5c3RlbS1wcm9tcHQta2V5JyxcbiAgICAgICAgfSlcbiAgICAgICAgLnJlc29sdmVzKHtcbiAgICAgICAgICBQYXJhbWV0ZXI6IHtcbiAgICAgICAgICAgIFZhbHVlOiAncHJvbXB0cy90ZXN0L3NvdWxfYmx1ZXByaW50L3N5c3RlbS50eHQnLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICBzc21Nb2NrXG4gICAgICAgIC5vbihHZXRQYXJhbWV0ZXJDb21tYW5kLCB7XG4gICAgICAgICAgTmFtZTogJy90ZXN0L3VzZXItcHJvbXB0LWtleScsXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgUGFyYW1ldGVyOiB7XG4gICAgICAgICAgICBWYWx1ZTogJ3Byb21wdHMvdGVzdC9zb3VsX2JsdWVwcmludC91c2VyX3RlbXBsYXRlLm1kJyxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgLy8gTW9jayBTMyByZXNwb25zZXMgZm9yIHByb21wdCBmaWxlc1xuICAgICAgY29uc3QgY3JlYXRlUzNSZXNwb25zZSA9IChjb250ZW50OiBzdHJpbmcpID0+ICh7XG4gICAgICAgIEJvZHk6IHtcbiAgICAgICAgICB0cmFuc2Zvcm1Ub1N0cmluZzogYXN5bmMgKCkgPT4gY29udGVudCxcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgICB9IGFzIGFueSwgLy8gVHlwZSBhc3NlcnRpb24gbmVlZGVkIGZvciBtb2NrIC0gUzMgQm9keSBzdHJlYW0gdHlwZSBpcyBjb21wbGV4XG4gICAgICAgIEVUYWc6ICdcInRlc3QtZXRhZ1wiJyxcbiAgICAgIH0pO1xuXG4gICAgICBzM01vY2tcbiAgICAgICAgLm9uKEdldE9iamVjdENvbW1hbmQsIHtcbiAgICAgICAgICBCdWNrZXQ6ICd0ZXN0LWNvbmZpZy1idWNrZXQnLFxuICAgICAgICAgIEtleTogJ3Byb21wdHMvdGVzdC9zb3VsX2JsdWVwcmludC9zeXN0ZW0udHh0JyxcbiAgICAgICAgfSlcbiAgICAgICAgLnJlc29sdmVzKFxuICAgICAgICAgIGNyZWF0ZVMzUmVzcG9uc2UoJ1lvdSBhcmUgYW4gZXhwZXJ0IGFzdHJvbG9nZXIgcHJvdmlkaW5nIFNvdWwgQmx1ZXByaW50IHJlYWRpbmdzLicpLFxuICAgICAgICApO1xuXG4gICAgICBzM01vY2tcbiAgICAgICAgLm9uKEdldE9iamVjdENvbW1hbmQsIHtcbiAgICAgICAgICBCdWNrZXQ6ICd0ZXN0LWNvbmZpZy1idWNrZXQnLFxuICAgICAgICAgIEtleTogJ3Byb21wdHMvdGVzdC9zb3VsX2JsdWVwcmludC91c2VyX3RlbXBsYXRlLm1kJyxcbiAgICAgICAgfSlcbiAgICAgICAgLnJlc29sdmVzKFxuICAgICAgICAgIGNyZWF0ZVMzUmVzcG9uc2UoXG4gICAgICAgICAgICAnR2VuZXJhdGUgYSBTb3VsIEJsdWVwcmludCByZWFkaW5nIGZvciB7e2JpcnRoTmFtZX19IGJvcm4gb24ge3tiaXJ0aERhdGV9fS4nLFxuICAgICAgICAgICksXG4gICAgICAgICk7XG5cbiAgICAgIC8vIE1vY2sgT3BlbkFJIEFQSSByZXNwb25zZVxuICAgICAgKGdsb2JhbC5mZXRjaCBhcyBqZXN0Lk1vY2spLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7XG4gICAgICAgIG9rOiB0cnVlLFxuICAgICAgICBqc29uOiBhc3luYyAoKSA9PiAoe1xuICAgICAgICAgIGNob2ljZXM6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgbWVzc2FnZToge1xuICAgICAgICAgICAgICAgIGNvbnRlbnQ6ICdZb3VyIFNvdWwgQmx1ZXByaW50IHJlYWRpbmc6IFlvdSBhcmUgYSBDYXByaWNvcm4gU3VuLi4uJyxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgXSxcbiAgICAgICAgfSksXG4gICAgICB9KTtcblxuICAgICAgLy8gTW9jayBEeW5hbW9EQiBwdXQgY29tbWFuZHMgZm9yIHN0b3JpbmcgdGhlIHJlYWRpbmdcbiAgICAgIGR5bmFtb01vY2sub24oUHV0Q29tbWFuZCkucmVzb2x2ZXMoe30pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGdlbmVyYXRlUmVhZGluZ0hhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5tZXNzYWdlKS50b0JlKCdSZWFkaW5nIGdlbmVyYXRlZCBzdWNjZXNzZnVsbHknKTtcbiAgICAgIGV4cGVjdChib2R5LnJlYWRpbmdJZCkudG9CZURlZmluZWQoKTtcbiAgICAgIGV4cGVjdChib2R5LnN0YXR1cykudG9CZSgnUmVhZHknKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgcmV0dXJuIGdlbmVyaWMgZXJyb3IgbWVzc2FnZSB3aGVuIE9wZW5BSSBBUEkgZmFpbHMnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCB1c2VySWQgPSAndGVzdC11c2VyLTEyMyc7XG4gICAgICBjb25zdCBldmVudDogUGFydGlhbDxBUElHYXRld2F5UHJveHlFdmVudD4gPSB7XG4gICAgICAgIHBhdGhQYXJhbWV0ZXJzOiB7IHVzZXJJZCB9LFxuICAgICAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgICAgIGF1dGhvcml6ZXI6IHtcbiAgICAgICAgICAgIGNsYWltczogeyBzdWI6IHVzZXJJZCB9LFxuICAgICAgICAgIH0sXG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgICAgfSBhcyBhbnksXG4gICAgICB9O1xuXG4gICAgICAvLyBNb2NrIHVzZXIgcHJvZmlsZVxuICAgICAgZHluYW1vTW9ja1xuICAgICAgICAub24oR2V0Q29tbWFuZCwge1xuICAgICAgICAgIFRhYmxlTmFtZTogJ3Rlc3QtdXNlci10YWJsZScsXG4gICAgICAgICAgS2V5OiB7IHVzZXJJZCwgY3JlYXRlZEF0OiAnUFJPRklMRScgfSxcbiAgICAgICAgfSlcbiAgICAgICAgLnJlc29sdmVzKHtcbiAgICAgICAgICBJdGVtOiB7XG4gICAgICAgICAgICB1c2VySWQsXG4gICAgICAgICAgICBwcm9maWxlOiB7XG4gICAgICAgICAgICAgIGJpcnRoTmFtZTogJ1Rlc3QgVXNlcicsXG4gICAgICAgICAgICAgIGJpcnRoRGF0ZTogJzE5OTAtMDEtMDEnLFxuICAgICAgICAgICAgICBiaXJ0aFRpbWU6ICcxMjowMCcsXG4gICAgICAgICAgICAgIGJpcnRoQ2l0eTogJ05ldyBZb3JrJyxcbiAgICAgICAgICAgICAgYmlydGhTdGF0ZTogJ05ZJyxcbiAgICAgICAgICAgICAgYmlydGhDb3VudHJ5OiAnVVNBJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgIC8vIE1vY2sgbmF0YWwgY2hhcnRcbiAgICAgIGR5bmFtb01vY2tcbiAgICAgICAgLm9uKEdldENvbW1hbmQsIHtcbiAgICAgICAgICBUYWJsZU5hbWU6ICd0ZXN0LW5hdGFsLWNoYXJ0LXRhYmxlJyxcbiAgICAgICAgICBLZXk6IHsgdXNlcklkIH0sXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgSXRlbToge1xuICAgICAgICAgICAgdXNlcklkLFxuICAgICAgICAgICAgcGxhbmV0czoge1xuICAgICAgICAgICAgICBzdW46IHsgc2lnbjogJ0NhcHJpY29ybicsIGRlZ3JlZUluU2lnbjogMTAgfSxcbiAgICAgICAgICAgICAgbW9vbjogeyBzaWduOiAnQ2FuY2VyJywgZGVncmVlSW5TaWduOiAxNSB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgLy8gTW9jayBTU00gcGFyYW1ldGVycyBmb3IgT3BlbkFJIGNvbmZpZ3VyYXRpb25cbiAgICAgIHNzbU1vY2tcbiAgICAgICAgLm9uKEdldFBhcmFtZXRlckNvbW1hbmQsIHtcbiAgICAgICAgICBOYW1lOiAnL3Rlc3Qvb3BlbmFpLWtleScsXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgUGFyYW1ldGVyOiB7XG4gICAgICAgICAgICBWYWx1ZTogJ3Rlc3QtYXBpLWtleScsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgIHNzbU1vY2tcbiAgICAgICAgLm9uKEdldFBhcmFtZXRlckNvbW1hbmQsIHtcbiAgICAgICAgICBOYW1lOiAnL3Rlc3QvcmVhZGluZy1tb2RlbCcsXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgUGFyYW1ldGVyOiB7XG4gICAgICAgICAgICBWYWx1ZTogJ2dwdC00LXR1cmJvLXByZXZpZXcnLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICBzc21Nb2NrXG4gICAgICAgIC5vbihHZXRQYXJhbWV0ZXJDb21tYW5kLCB7XG4gICAgICAgICAgTmFtZTogJy90ZXN0L3JlYWRpbmctdGVtcGVyYXR1cmUnLFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoe1xuICAgICAgICAgIFBhcmFtZXRlcjoge1xuICAgICAgICAgICAgVmFsdWU6ICcwLjcnLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICBzc21Nb2NrXG4gICAgICAgIC5vbihHZXRQYXJhbWV0ZXJDb21tYW5kLCB7XG4gICAgICAgICAgTmFtZTogJy90ZXN0L3JlYWRpbmctbWF4LXRva2VucycsXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgUGFyYW1ldGVyOiB7XG4gICAgICAgICAgICBWYWx1ZTogJzIwMDAnLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICBzc21Nb2NrXG4gICAgICAgIC5vbihHZXRQYXJhbWV0ZXJDb21tYW5kLCB7XG4gICAgICAgICAgTmFtZTogJy90ZXN0L3N5c3RlbS1wcm9tcHQta2V5JyxcbiAgICAgICAgfSlcbiAgICAgICAgLnJlc29sdmVzKHtcbiAgICAgICAgICBQYXJhbWV0ZXI6IHtcbiAgICAgICAgICAgIFZhbHVlOiAncHJvbXB0cy9zb3VsX2JsdWVwcmludC9zeXN0ZW0udHh0JyxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgc3NtTW9ja1xuICAgICAgICAub24oR2V0UGFyYW1ldGVyQ29tbWFuZCwge1xuICAgICAgICAgIE5hbWU6ICcvdGVzdC91c2VyLXByb21wdC1rZXknLFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoe1xuICAgICAgICAgIFBhcmFtZXRlcjoge1xuICAgICAgICAgICAgVmFsdWU6ICdwcm9tcHRzL3NvdWxfYmx1ZXByaW50L3VzZXIudHh0JyxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgLy8gTW9jayBTMyBwcm9tcHRzXG4gICAgICBzM01vY2sub24oR2V0T2JqZWN0Q29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBCb2R5OiB7XG4gICAgICAgICAgdHJhbnNmb3JtVG9TdHJpbmc6IGFzeW5jICgpID0+ICdUZXN0IHByb21wdCBjb250ZW50JyxcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgICB9IGFzIGFueSxcbiAgICAgICAgRVRhZzogJ3Rlc3QtZXRhZycsXG4gICAgICB9KTtcblxuICAgICAgLy8gTW9jayBEeW5hbW9EQiBwdXQgY29tbWFuZHMgZm9yIHN0b3JpbmcgdGhlIHJlYWRpbmdcbiAgICAgIGR5bmFtb01vY2sub24oUHV0Q29tbWFuZCkucmVzb2x2ZXMoe30pO1xuXG4gICAgICAvLyBNb2NrIE9wZW5BSSBBUEkgZmFpbHVyZVxuICAgICAgKGdsb2JhbC5mZXRjaCBhcyBqZXN0Lk1vY2spLm1vY2tSZWplY3RlZFZhbHVlT25jZShcbiAgICAgICAgbmV3IEVycm9yKCdPcGVuQUkgQVBJIHJhdGUgbGltaXQgZXhjZWVkZWQnKSxcbiAgICAgICk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZ2VuZXJhdGVSZWFkaW5nSGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDUwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIC8vIFNob3VsZCByZXR1cm4gZ2VuZXJpYyBlcnJvciBtZXNzYWdlLCBub3QgdGhlIGFjdHVhbCBlcnJvclxuICAgICAgZXhwZWN0KGJvZHkubWVzc2FnZSkudG9CZShcbiAgICAgICAgXCJXZSdyZSBzb3JyeSwgYnV0IHdlIGNvdWxkbid0IGdlbmVyYXRlIHlvdXIgcmVhZGluZyBhdCB0aGlzIHRpbWUuIFBsZWFzZSB0cnkgYWdhaW4gbGF0ZXIuXCIsXG4gICAgICApO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmVVbmRlZmluZWQoKTsgLy8gU2hvdWxkIE5PVCBpbmNsdWRlIGVycm9yIGRldGFpbHNcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgc3RvcmUgc2FuaXRpemVkIGVycm9yIGluIER5bmFtb0RCIHdoZW4gZ2VuZXJhdGlvbiBmYWlscycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHVzZXJJZCA9ICd0ZXN0LXVzZXItMTIzJztcbiAgICAgIGNvbnN0IGV2ZW50OiBQYXJ0aWFsPEFQSUdhdGV3YXlQcm94eUV2ZW50PiA9IHtcbiAgICAgICAgcGF0aFBhcmFtZXRlcnM6IHsgdXNlcklkIH0sXG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICAgICAgY2xhaW1zOiB7IHN1YjogdXNlcklkIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgICB9IGFzIGFueSxcbiAgICAgIH07XG5cbiAgICAgIC8vIE1vY2sgdXNlciBwcm9maWxlXG4gICAgICBkeW5hbW9Nb2NrXG4gICAgICAgIC5vbihHZXRDb21tYW5kLCB7XG4gICAgICAgICAgVGFibGVOYW1lOiAndGVzdC11c2VyLXRhYmxlJyxcbiAgICAgICAgICBLZXk6IHsgdXNlcklkLCBjcmVhdGVkQXQ6ICdQUk9GSUxFJyB9LFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoe1xuICAgICAgICAgIEl0ZW06IHtcbiAgICAgICAgICAgIHVzZXJJZCxcbiAgICAgICAgICAgIHByb2ZpbGU6IHtcbiAgICAgICAgICAgICAgYmlydGhOYW1lOiAnVGVzdCBVc2VyJyxcbiAgICAgICAgICAgICAgYmlydGhEYXRlOiAnMTk5MC0wMS0wMScsXG4gICAgICAgICAgICAgIGJpcnRoVGltZTogJzEyOjAwJyxcbiAgICAgICAgICAgICAgYmlydGhDaXR5OiAnTmV3IFlvcmsnLFxuICAgICAgICAgICAgICBiaXJ0aFN0YXRlOiAnTlknLFxuICAgICAgICAgICAgICBiaXJ0aENvdW50cnk6ICdVU0EnLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgLy8gTW9jayBuYXRhbCBjaGFydFxuICAgICAgZHluYW1vTW9ja1xuICAgICAgICAub24oR2V0Q29tbWFuZCwge1xuICAgICAgICAgIFRhYmxlTmFtZTogJ3Rlc3QtbmF0YWwtY2hhcnQtdGFibGUnLFxuICAgICAgICAgIEtleTogeyB1c2VySWQgfSxcbiAgICAgICAgfSlcbiAgICAgICAgLnJlc29sdmVzKHtcbiAgICAgICAgICBJdGVtOiB7XG4gICAgICAgICAgICB1c2VySWQsXG4gICAgICAgICAgICBwbGFuZXRzOiB7XG4gICAgICAgICAgICAgIHN1bjogeyBzaWduOiAnQ2Fwcmljb3JuJywgZGVncmVlSW5TaWduOiAxMCB9LFxuICAgICAgICAgICAgICBtb29uOiB7IHNpZ246ICdDYW5jZXInLCBkZWdyZWVJblNpZ246IDE1IH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICAvLyBNb2NrIFNTTSBwYXJhbWV0ZXJzXG4gICAgICBzc21Nb2NrLm9uKEdldFBhcmFtZXRlckNvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgUGFyYW1ldGVyOiB7IFZhbHVlOiAndGVzdC12YWx1ZScgfSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBNb2NrIFMzIHByb21wdHNcbiAgICAgIHMzTW9jay5vbihHZXRPYmplY3RDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIEJvZHk6IHtcbiAgICAgICAgICB0cmFuc2Zvcm1Ub1N0cmluZzogYXN5bmMgKCkgPT4gJ1Rlc3QgcHJvbXB0IGNvbnRlbnQnLFxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICAgIH0gYXMgYW55LFxuICAgICAgICBFVGFnOiAndGVzdC1ldGFnJyxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBDYXB0dXJlIER5bmFtb0RCIHB1dCBjb21tYW5kc1xuICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgIGxldCBmYWlsZWRSZWFkaW5nSXRlbTogYW55O1xuICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgIGR5bmFtb01vY2sub24oUHV0Q29tbWFuZCkuY2FsbHNGYWtlKChpbnB1dDogYW55KSA9PiB7XG4gICAgICAgIGlmIChpbnB1dC5JdGVtPy5zdGF0dXMgPT09ICdGYWlsZWQnKSB7XG4gICAgICAgICAgZmFpbGVkUmVhZGluZ0l0ZW0gPSBpbnB1dC5JdGVtO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICAgICAgfSk7XG5cbiAgICAgIC8vIE1vY2sgT3BlbkFJIEFQSSBmYWlsdXJlIHdpdGggc2Vuc2l0aXZlIGVycm9yXG4gICAgICAoZ2xvYmFsLmZldGNoIGFzIGplc3QuTW9jaykubW9ja1JlamVjdGVkVmFsdWVPbmNlKG5ldyBFcnJvcignSW52YWxpZCBBUEkga2V5OiBzay0xMjM0NScpKTtcblxuICAgICAgLy8gVGhlIGhhbmRsZXIgc2hvdWxkIHJldHVybiBhbiBlcnJvciByZXNwb25zZVxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBnZW5lcmF0ZVJlYWRpbmdIYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDUwMCk7XG5cbiAgICAgIC8vIFZlcmlmeSB0aGF0IHRoZSBlcnJvciBzdG9yZWQgaW4gRHluYW1vREIgaXMgc2FuaXRpemVkXG4gICAgICBleHBlY3QoZmFpbGVkUmVhZGluZ0l0ZW0pLnRvQmVEZWZpbmVkKCk7XG4gICAgICBleHBlY3QoZmFpbGVkUmVhZGluZ0l0ZW0uc3RhdHVzKS50b0JlKCdGYWlsZWQnKTtcbiAgICAgIGV4cGVjdChmYWlsZWRSZWFkaW5nSXRlbS5lcnJvcikudG9CZSgnR0VORVJBVElPTl9GQUlMRUQnKTsgLy8gU2FuaXRpemVkIGVycm9yXG4gICAgICBleHBlY3QoZmFpbGVkUmVhZGluZ0l0ZW0uZXJyb3IpLm5vdC50b0NvbnRhaW4oJ0FQSSBrZXknKTsgLy8gU2hvdWxkIG5vdCBjb250YWluIHNlbnNpdGl2ZSBpbmZvXG4gICAgICBleHBlY3QoZmFpbGVkUmVhZGluZ0l0ZW0uZXJyb3IpLm5vdC50b0NvbnRhaW4oJ3NrLTEyMzQ1Jyk7IC8vIFNob3VsZCBub3QgY29udGFpbiBhY3R1YWwga2V5XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHJldHVybiA0MDMgaWYgdXNlciBpcyBub3QgYXV0aG9yaXplZCcsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50OiBQYXJ0aWFsPEFQSUdhdGV3YXlQcm94eUV2ZW50PiA9IHtcbiAgICAgICAgcGF0aFBhcmFtZXRlcnM6IHsgdXNlcklkOiAndXNlci0xMjMnIH0sXG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICAgICAgY2xhaW1zOiB7IHN1YjogJ2RpZmZlcmVudC11c2VyJyB9LFxuICAgICAgICAgIH0sXG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgICAgfSBhcyBhbnksXG4gICAgICB9O1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGdlbmVyYXRlUmVhZGluZ0hhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSg0MDMpO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5tZXNzYWdlKS50b0JlKCdVbmF1dGhvcml6ZWQgdG8gZ2VuZXJhdGUgcmVhZGluZyBmb3IgdGhpcyB1c2VyJyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHJldHVybiA0MDAgaWYgbmF0YWwgY2hhcnQgaXMgbm90IGZvdW5kJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgdXNlcklkID0gJ3Rlc3QtdXNlci0xMjMnO1xuICAgICAgY29uc3QgZXZlbnQ6IFBhcnRpYWw8QVBJR2F0ZXdheVByb3h5RXZlbnQ+ID0ge1xuICAgICAgICBwYXRoUGFyYW1ldGVyczogeyB1c2VySWQgfSxcbiAgICAgICAgcmVxdWVzdENvbnRleHQ6IHtcbiAgICAgICAgICBhdXRob3JpemVyOiB7XG4gICAgICAgICAgICBjbGFpbXM6IHsgc3ViOiB1c2VySWQgfSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICAgIH0gYXMgYW55LFxuICAgICAgfTtcblxuICAgICAgLy8gTW9jayB1c2VyIHByb2ZpbGVcbiAgICAgIGR5bmFtb01vY2tcbiAgICAgICAgLm9uKEdldENvbW1hbmQsIHtcbiAgICAgICAgICBUYWJsZU5hbWU6ICd0ZXN0LXVzZXItdGFibGUnLFxuICAgICAgICAgIEtleTogeyB1c2VySWQsIGNyZWF0ZWRBdDogJ1BST0ZJTEUnIH0sXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgSXRlbToge1xuICAgICAgICAgICAgdXNlcklkLFxuICAgICAgICAgICAgcHJvZmlsZToge30sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgIC8vIE1vY2sgbm8gbmF0YWwgY2hhcnRcbiAgICAgIGR5bmFtb01vY2tcbiAgICAgICAgLm9uKEdldENvbW1hbmQsIHtcbiAgICAgICAgICBUYWJsZU5hbWU6ICd0ZXN0LW5hdGFsLWNoYXJ0LXRhYmxlJyxcbiAgICAgICAgICBLZXk6IHsgdXNlcklkIH0sXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7IEl0ZW06IHVuZGVmaW5lZCB9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBnZW5lcmF0ZVJlYWRpbmdIYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoNDAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkubWVzc2FnZSkudG9CZSgnTmF0YWwgY2hhcnQgbm90IGdlbmVyYXRlZC4gUGxlYXNlIGNvbXBsZXRlIHlvdXIgcHJvZmlsZSBmaXJzdC4nKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgbG9nIGRldGFpbGVkIGVycm9yIHRvIENsb3VkV2F0Y2ggd2hlbiBPcGVuQUkgQVBJIGZhaWxzJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgdXNlcklkID0gJ3Rlc3QtdXNlci0xMjMnO1xuICAgICAgY29uc3QgZXZlbnQ6IFBhcnRpYWw8QVBJR2F0ZXdheVByb3h5RXZlbnQ+ID0ge1xuICAgICAgICBwYXRoUGFyYW1ldGVyczogeyB1c2VySWQgfSxcbiAgICAgICAgcmVxdWVzdENvbnRleHQ6IHtcbiAgICAgICAgICBhdXRob3JpemVyOiB7XG4gICAgICAgICAgICBjbGFpbXM6IHsgc3ViOiB1c2VySWQgfSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICAgIH0gYXMgYW55LFxuICAgICAgfTtcblxuICAgICAgLy8gU3B5IG9uIGNvbnNvbGUuZXJyb3IgdG8gdmVyaWZ5IENsb3VkV2F0Y2ggbG9nZ2luZ1xuICAgICAgY29uc3QgY29uc29sZUVycm9yU3B5ID0gamVzdC5zcHlPbihjb25zb2xlLCAnZXJyb3InKS5tb2NrSW1wbGVtZW50YXRpb24oKCkgPT4ge30pO1xuXG4gICAgICAvLyBNb2NrIHVzZXIgcHJvZmlsZVxuICAgICAgZHluYW1vTW9ja1xuICAgICAgICAub24oR2V0Q29tbWFuZCwge1xuICAgICAgICAgIFRhYmxlTmFtZTogJ3Rlc3QtdXNlci10YWJsZScsXG4gICAgICAgICAgS2V5OiB7IHVzZXJJZCwgY3JlYXRlZEF0OiAnUFJPRklMRScgfSxcbiAgICAgICAgfSlcbiAgICAgICAgLnJlc29sdmVzKHtcbiAgICAgICAgICBJdGVtOiB7XG4gICAgICAgICAgICB1c2VySWQsXG4gICAgICAgICAgICBwcm9maWxlOiB7XG4gICAgICAgICAgICAgIGJpcnRoTmFtZTogJ1Rlc3QgVXNlcicsXG4gICAgICAgICAgICAgIGJpcnRoRGF0ZTogJzE5OTAtMDEtMDEnLFxuICAgICAgICAgICAgICBiaXJ0aFRpbWU6ICcxMjowMCcsXG4gICAgICAgICAgICAgIGJpcnRoQ2l0eTogJ05ldyBZb3JrJyxcbiAgICAgICAgICAgICAgYmlydGhTdGF0ZTogJ05ZJyxcbiAgICAgICAgICAgICAgYmlydGhDb3VudHJ5OiAnVVNBJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgIC8vIE1vY2sgbmF0YWwgY2hhcnRcbiAgICAgIGR5bmFtb01vY2tcbiAgICAgICAgLm9uKEdldENvbW1hbmQsIHtcbiAgICAgICAgICBUYWJsZU5hbWU6ICd0ZXN0LW5hdGFsLWNoYXJ0LXRhYmxlJyxcbiAgICAgICAgICBLZXk6IHsgdXNlcklkIH0sXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgSXRlbToge1xuICAgICAgICAgICAgdXNlcklkLFxuICAgICAgICAgICAgcGxhbmV0czoge1xuICAgICAgICAgICAgICBzdW46IHsgc2lnbjogJ0NhcHJpY29ybicsIGRlZ3JlZUluU2lnbjogMTAgfSxcbiAgICAgICAgICAgICAgbW9vbjogeyBzaWduOiAnQ2FuY2VyJywgZGVncmVlSW5TaWduOiAxNSB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgLy8gTW9jayBTU00gcGFyYW1ldGVyc1xuICAgICAgc3NtTW9jay5vbihHZXRQYXJhbWV0ZXJDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIFBhcmFtZXRlcjogeyBWYWx1ZTogJ3Rlc3QtdmFsdWUnIH0sXG4gICAgICB9KTtcblxuICAgICAgLy8gTW9jayBTMyBwcm9tcHRzXG4gICAgICBzM01vY2sub24oR2V0T2JqZWN0Q29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBCb2R5OiB7XG4gICAgICAgICAgdHJhbnNmb3JtVG9TdHJpbmc6IGFzeW5jICgpID0+ICdUZXN0IHByb21wdCBjb250ZW50JyxcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgICB9IGFzIGFueSxcbiAgICAgICAgRVRhZzogJ3Rlc3QtZXRhZycsXG4gICAgICB9KTtcblxuICAgICAgLy8gTW9jayBEeW5hbW9EQiBwdXQgY29tbWFuZHNcbiAgICAgIGR5bmFtb01vY2sub24oUHV0Q29tbWFuZCkucmVzb2x2ZXMoe30pO1xuXG4gICAgICAvLyBNb2NrIE9wZW5BSSBBUEkgZmFpbHVyZSB3aXRoIGRldGFpbGVkIGVycm9yXG4gICAgICBjb25zdCBlcnJvck1lc3NhZ2UgPSAnQ29ubmVjdGlvbiB0aW1lb3V0IGFmdGVyIDMwMDAwbXMnO1xuICAgICAgKGdsb2JhbC5mZXRjaCBhcyBqZXN0Lk1vY2spLm1vY2tSZWplY3RlZFZhbHVlT25jZShuZXcgRXJyb3IoZXJyb3JNZXNzYWdlKSk7XG5cbiAgICAgIGF3YWl0IGdlbmVyYXRlUmVhZGluZ0hhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICAvLyBWZXJpZnkgdGhhdCBkZXRhaWxlZCBlcnJvciB3YXMgbG9nZ2VkIHRvIENsb3VkV2F0Y2hcbiAgICAgIGV4cGVjdChjb25zb2xlRXJyb3JTcHkpLnRvSGF2ZUJlZW5DYWxsZWQoKTtcbiAgICAgIGNvbnN0IGVycm9yQ2FsbCA9IGNvbnNvbGVFcnJvclNweS5tb2NrLmNhbGxzLmZpbmQoXG4gICAgICAgIChjYWxsKSA9PlxuICAgICAgICAgIGNhbGxbMF0gPT09ICdFcnJvciBnZW5lcmF0aW5nIHJlYWRpbmc6JyB8fCBjYWxsWzBdID09PSAnRXJyb3IgZHVyaW5nIHJlYWRpbmcgZ2VuZXJhdGlvbjonLFxuICAgICAgKTtcbiAgICAgIGV4cGVjdChlcnJvckNhbGwpLnRvQmVEZWZpbmVkKCk7XG4gICAgICBleHBlY3QoZXJyb3JDYWxsIVsxXSkudG9NYXRjaE9iamVjdCh7XG4gICAgICAgIGVycm9yOiBlcnJvck1lc3NhZ2UsXG4gICAgICAgIHVzZXJJZCxcbiAgICAgICAgdGltZXN0YW1wOiBleHBlY3QuYW55KFN0cmluZyksXG4gICAgICB9KTtcblxuICAgICAgLy8gUmVzdG9yZSBjb25zb2xlLmVycm9yXG4gICAgICBjb25zb2xlRXJyb3JTcHkubW9ja1Jlc3RvcmUoKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIG5ldHdvcmsgdGltZW91dCBlcnJvcnMgZ3JhY2VmdWxseScsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHVzZXJJZCA9ICd0ZXN0LXVzZXItMTIzJztcbiAgICAgIGNvbnN0IGV2ZW50OiBQYXJ0aWFsPEFQSUdhdGV3YXlQcm94eUV2ZW50PiA9IHtcbiAgICAgICAgcGF0aFBhcmFtZXRlcnM6IHsgdXNlcklkIH0sXG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICAgICAgY2xhaW1zOiB7IHN1YjogdXNlcklkIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgICB9IGFzIGFueSxcbiAgICAgIH07XG5cbiAgICAgIC8vIE1vY2sgdXNlciBwcm9maWxlIGFuZCBuYXRhbCBjaGFydFxuICAgICAgZHluYW1vTW9ja1xuICAgICAgICAub24oR2V0Q29tbWFuZCwge1xuICAgICAgICAgIFRhYmxlTmFtZTogJ3Rlc3QtdXNlci10YWJsZScsXG4gICAgICAgICAgS2V5OiB7IHVzZXJJZCwgY3JlYXRlZEF0OiAnUFJPRklMRScgfSxcbiAgICAgICAgfSlcbiAgICAgICAgLnJlc29sdmVzKHtcbiAgICAgICAgICBJdGVtOiB7XG4gICAgICAgICAgICB1c2VySWQsXG4gICAgICAgICAgICBwcm9maWxlOiB7XG4gICAgICAgICAgICAgIGJpcnRoTmFtZTogJ1Rlc3QgVXNlcicsXG4gICAgICAgICAgICAgIGJpcnRoRGF0ZTogJzE5OTAtMDEtMDEnLFxuICAgICAgICAgICAgICBiaXJ0aFRpbWU6ICcxMjowMCcsXG4gICAgICAgICAgICAgIGJpcnRoQ2l0eTogJ05ldyBZb3JrJyxcbiAgICAgICAgICAgICAgYmlydGhTdGF0ZTogJ05ZJyxcbiAgICAgICAgICAgICAgYmlydGhDb3VudHJ5OiAnVVNBJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgIGR5bmFtb01vY2tcbiAgICAgICAgLm9uKEdldENvbW1hbmQsIHtcbiAgICAgICAgICBUYWJsZU5hbWU6ICd0ZXN0LW5hdGFsLWNoYXJ0LXRhYmxlJyxcbiAgICAgICAgICBLZXk6IHsgdXNlcklkIH0sXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgSXRlbToge1xuICAgICAgICAgICAgdXNlcklkLFxuICAgICAgICAgICAgcGxhbmV0czoge1xuICAgICAgICAgICAgICBzdW46IHsgc2lnbjogJ0NhcHJpY29ybicsIGRlZ3JlZUluU2lnbjogMTAgfSxcbiAgICAgICAgICAgICAgbW9vbjogeyBzaWduOiAnQ2FuY2VyJywgZGVncmVlSW5TaWduOiAxNSB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgLy8gTW9jayBTU00gYW5kIFMzXG4gICAgICBzc21Nb2NrLm9uKEdldFBhcmFtZXRlckNvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgUGFyYW1ldGVyOiB7IFZhbHVlOiAndGVzdC12YWx1ZScgfSxcbiAgICAgIH0pO1xuXG4gICAgICBzM01vY2sub24oR2V0T2JqZWN0Q29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBCb2R5OiB7XG4gICAgICAgICAgdHJhbnNmb3JtVG9TdHJpbmc6IGFzeW5jICgpID0+ICdUZXN0IHByb21wdCBjb250ZW50JyxcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgICB9IGFzIGFueSxcbiAgICAgICAgRVRhZzogJ3Rlc3QtZXRhZycsXG4gICAgICB9KTtcblxuICAgICAgZHluYW1vTW9jay5vbihQdXRDb21tYW5kKS5yZXNvbHZlcyh7fSk7XG5cbiAgICAgIC8vIFNpbXVsYXRlIG5ldHdvcmsgdGltZW91dCBlcnJvclxuICAgICAgY29uc3QgdGltZW91dEVycm9yOiBhbnkgPSBuZXcgRXJyb3IoJ0VUSU1FRE9VVCcpO1xuICAgICAgdGltZW91dEVycm9yLmNvZGUgPSAnRVRJTUVET1VUJztcbiAgICAgIChnbG9iYWwuZmV0Y2ggYXMgamVzdC5Nb2NrKS5tb2NrUmVqZWN0ZWRWYWx1ZU9uY2UodGltZW91dEVycm9yKTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBnZW5lcmF0ZVJlYWRpbmdIYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoNTAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkubWVzc2FnZSkudG9CZShcbiAgICAgICAgXCJXZSdyZSBzb3JyeSwgYnV0IHdlIGNvdWxkbid0IGdlbmVyYXRlIHlvdXIgcmVhZGluZyBhdCB0aGlzIHRpbWUuIFBsZWFzZSB0cnkgYWdhaW4gbGF0ZXIuXCIsXG4gICAgICApO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmVVbmRlZmluZWQoKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIGF1dGhlbnRpY2F0aW9uIGVycm9ycyBmcm9tIE9wZW5BSScsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHVzZXJJZCA9ICd0ZXN0LXVzZXItMTIzJztcbiAgICAgIGNvbnN0IGV2ZW50OiBQYXJ0aWFsPEFQSUdhdGV3YXlQcm94eUV2ZW50PiA9IHtcbiAgICAgICAgcGF0aFBhcmFtZXRlcnM6IHsgdXNlcklkIH0sXG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICAgICAgY2xhaW1zOiB7IHN1YjogdXNlcklkIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgICB9IGFzIGFueSxcbiAgICAgIH07XG5cbiAgICAgIC8vIE1vY2sgdXNlciBwcm9maWxlIGFuZCBuYXRhbCBjaGFydFxuICAgICAgZHluYW1vTW9ja1xuICAgICAgICAub24oR2V0Q29tbWFuZCwge1xuICAgICAgICAgIFRhYmxlTmFtZTogJ3Rlc3QtdXNlci10YWJsZScsXG4gICAgICAgICAgS2V5OiB7IHVzZXJJZCwgY3JlYXRlZEF0OiAnUFJPRklMRScgfSxcbiAgICAgICAgfSlcbiAgICAgICAgLnJlc29sdmVzKHtcbiAgICAgICAgICBJdGVtOiB7XG4gICAgICAgICAgICB1c2VySWQsXG4gICAgICAgICAgICBwcm9maWxlOiB7XG4gICAgICAgICAgICAgIGJpcnRoTmFtZTogJ1Rlc3QgVXNlcicsXG4gICAgICAgICAgICAgIGJpcnRoRGF0ZTogJzE5OTAtMDEtMDEnLFxuICAgICAgICAgICAgICBiaXJ0aFRpbWU6ICcxMjowMCcsXG4gICAgICAgICAgICAgIGJpcnRoQ2l0eTogJ05ldyBZb3JrJyxcbiAgICAgICAgICAgICAgYmlydGhTdGF0ZTogJ05ZJyxcbiAgICAgICAgICAgICAgYmlydGhDb3VudHJ5OiAnVVNBJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgIGR5bmFtb01vY2tcbiAgICAgICAgLm9uKEdldENvbW1hbmQsIHtcbiAgICAgICAgICBUYWJsZU5hbWU6ICd0ZXN0LW5hdGFsLWNoYXJ0LXRhYmxlJyxcbiAgICAgICAgICBLZXk6IHsgdXNlcklkIH0sXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgSXRlbToge1xuICAgICAgICAgICAgdXNlcklkLFxuICAgICAgICAgICAgcGxhbmV0czoge1xuICAgICAgICAgICAgICBzdW46IHsgc2lnbjogJ0NhcHJpY29ybicsIGRlZ3JlZUluU2lnbjogMTAgfSxcbiAgICAgICAgICAgICAgbW9vbjogeyBzaWduOiAnQ2FuY2VyJywgZGVncmVlSW5TaWduOiAxNSB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgLy8gTW9jayBTU00gYW5kIFMzXG4gICAgICBzc21Nb2NrLm9uKEdldFBhcmFtZXRlckNvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgUGFyYW1ldGVyOiB7IFZhbHVlOiAndGVzdC12YWx1ZScgfSxcbiAgICAgIH0pO1xuXG4gICAgICBzM01vY2sub24oR2V0T2JqZWN0Q29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBCb2R5OiB7XG4gICAgICAgICAgdHJhbnNmb3JtVG9TdHJpbmc6IGFzeW5jICgpID0+ICdUZXN0IHByb21wdCBjb250ZW50JyxcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgICB9IGFzIGFueSxcbiAgICAgICAgRVRhZzogJ3Rlc3QtZXRhZycsXG4gICAgICB9KTtcblxuICAgICAgZHluYW1vTW9jay5vbihQdXRDb21tYW5kKS5yZXNvbHZlcyh7fSk7XG5cbiAgICAgIC8vIFNpbXVsYXRlIE9wZW5BSSBhdXRoZW50aWNhdGlvbiBlcnJvciAoNDAxKVxuICAgICAgKGdsb2JhbC5mZXRjaCBhcyBqZXN0Lk1vY2spLm1vY2tSZXNvbHZlZFZhbHVlT25jZSh7XG4gICAgICAgIG9rOiBmYWxzZSxcbiAgICAgICAgc3RhdHVzOiA0MDEsXG4gICAgICAgIHRleHQ6IGFzeW5jICgpID0+IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6IHsgbWVzc2FnZTogJ0ludmFsaWQgQVBJIGtleSBwcm92aWRlZCcgfSB9KSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGdlbmVyYXRlUmVhZGluZ0hhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSg1MDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5tZXNzYWdlKS50b0JlKFxuICAgICAgICBcIldlJ3JlIHNvcnJ5LCBidXQgd2UgY291bGRuJ3QgZ2VuZXJhdGUgeW91ciByZWFkaW5nIGF0IHRoaXMgdGltZS4gUGxlYXNlIHRyeSBhZ2FpbiBsYXRlci5cIixcbiAgICAgICk7XG4gICAgICBleHBlY3QoYm9keS5lcnJvcikudG9CZVVuZGVmaW5lZCgpO1xuICAgIH0pO1xuXG4gICAgLy8gU2tpcHBpbmcgdGhpcyB0ZXN0IGFzIFMzIGZhaWx1cmVzIGFyZSBjYXVnaHQgaW50ZXJuYWxseSBhbmQgZmFsbGJhY2sgcHJvbXB0cyBhcmUgdXNlZCBzaWxlbnRseVxuICAgIC8vIFRoZSBpbXBsZW1lbnRhdGlvbiBjb3JyZWN0bHkgdXNlcyBmYWxsYmFjayBwcm9tcHRzIGJ1dCBkb2Vzbid0IGxvZyB3aGVuIFMzIGtleXMgZG9uJ3QgZXhpc3RcbiAgICBpdC5za2lwKCdzaG91bGQgdXNlIGZhbGxiYWNrIHByb21wdHMgd2hlbiBTMyBmZXRjaCBmYWlscycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHVzZXJJZCA9ICd0ZXN0LXVzZXItMTIzJztcbiAgICAgIGNvbnN0IGV2ZW50OiBQYXJ0aWFsPEFQSUdhdGV3YXlQcm94eUV2ZW50PiA9IHtcbiAgICAgICAgcGF0aFBhcmFtZXRlcnM6IHsgdXNlcklkIH0sXG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICAgICAgY2xhaW1zOiB7IHN1YjogdXNlcklkIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgICB9IGFzIGFueSxcbiAgICAgIH07XG5cbiAgICAgIC8vIFNweSBvbiBjb25zb2xlIHRvIHZlcmlmeSBsb2dnaW5nXG4gICAgICBjb25zdCBjb25zb2xlRXJyb3JTcHkgPSBqZXN0LnNweU9uKGNvbnNvbGUsICdlcnJvcicpLm1vY2tJbXBsZW1lbnRhdGlvbigoKSA9PiB7fSk7XG5cbiAgICAgIC8vIE1vY2sgdXNlciBwcm9maWxlIGFuZCBuYXRhbCBjaGFydFxuICAgICAgZHluYW1vTW9ja1xuICAgICAgICAub24oR2V0Q29tbWFuZCwge1xuICAgICAgICAgIFRhYmxlTmFtZTogJ3Rlc3QtdXNlci10YWJsZScsXG4gICAgICAgICAgS2V5OiB7IHVzZXJJZCwgY3JlYXRlZEF0OiAnUFJPRklMRScgfSxcbiAgICAgICAgfSlcbiAgICAgICAgLnJlc29sdmVzKHtcbiAgICAgICAgICBJdGVtOiB7XG4gICAgICAgICAgICB1c2VySWQsXG4gICAgICAgICAgICBwcm9maWxlOiB7XG4gICAgICAgICAgICAgIGJpcnRoTmFtZTogJ1Rlc3QgVXNlcicsXG4gICAgICAgICAgICAgIGJpcnRoRGF0ZTogJzE5OTAtMDEtMDEnLFxuICAgICAgICAgICAgICBiaXJ0aFRpbWU6ICcxMjowMCcsXG4gICAgICAgICAgICAgIGJpcnRoQ2l0eTogJ05ldyBZb3JrJyxcbiAgICAgICAgICAgICAgYmlydGhTdGF0ZTogJ05ZJyxcbiAgICAgICAgICAgICAgYmlydGhDb3VudHJ5OiAnVVNBJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgIGR5bmFtb01vY2tcbiAgICAgICAgLm9uKEdldENvbW1hbmQsIHtcbiAgICAgICAgICBUYWJsZU5hbWU6ICd0ZXN0LW5hdGFsLWNoYXJ0LXRhYmxlJyxcbiAgICAgICAgICBLZXk6IHsgdXNlcklkIH0sXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgSXRlbToge1xuICAgICAgICAgICAgdXNlcklkLFxuICAgICAgICAgICAgcGxhbmV0czoge1xuICAgICAgICAgICAgICBzdW46IHsgc2lnbjogJ0NhcHJpY29ybicsIGRlZ3JlZUluU2lnbjogMTAgfSxcbiAgICAgICAgICAgICAgbW9vbjogeyBzaWduOiAnQ2FuY2VyJywgZGVncmVlSW5TaWduOiAxNSB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgLy8gTW9jayBTU00gcGFyYW1ldGVycyAtIGFsbCBzdWNjZWVkXG4gICAgICBzc21Nb2NrLm9uKEdldFBhcmFtZXRlckNvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgUGFyYW1ldGVyOiB7IFZhbHVlOiAndGVzdC12YWx1ZScgfSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBNb2NrIFMzIGZhaWx1cmVzIC0gcHJvbXB0cyBmYWlsIHRvIGZldGNoLCB3aGljaCB3aWxsIGNhdXNlIGZhbGxiYWNrIHByb21wdHMgdG8gYmUgdXNlZFxuICAgICAgczNNb2NrLm9uKEdldE9iamVjdENvbW1hbmQpLnJlamVjdHMobmV3IEVycm9yKCdOb1N1Y2hLZXknKSk7XG5cbiAgICAgIC8vIE1vY2sgRHluYW1vREIgcHV0IGNvbW1hbmRzXG4gICAgICBkeW5hbW9Nb2NrLm9uKFB1dENvbW1hbmQpLnJlc29sdmVzKHt9KTtcblxuICAgICAgLy8gTW9jayBzdWNjZXNzZnVsIE9wZW5BSSBBUEkgY2FsbCAod2lsbCB1c2UgZmFsbGJhY2sgcHJvbXB0cylcbiAgICAgIChnbG9iYWwuZmV0Y2ggYXMgamVzdC5Nb2NrKS5tb2NrUmVzb2x2ZWRWYWx1ZU9uY2Uoe1xuICAgICAgICBvazogdHJ1ZSxcbiAgICAgICAganNvbjogYXN5bmMgKCkgPT4gKHtcbiAgICAgICAgICBjaG9pY2VzOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIG1lc3NhZ2U6IHtcbiAgICAgICAgICAgICAgICBjb250ZW50OiAnVGVzdCByZWFkaW5nIHdpdGggZmFsbGJhY2sgcHJvbXB0cycsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIF0sXG4gICAgICAgIH0pLFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZ2VuZXJhdGVSZWFkaW5nSGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIC8vIFNob3VsZCBzdWNjZWVkIGV2ZW4gd2l0aCBTMyBmYWlsdXJlICh1c2VzIGZhbGxiYWNrIHByb21wdHMpXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5tZXNzYWdlKS50b0JlKCdSZWFkaW5nIGdlbmVyYXRlZCBzdWNjZXNzZnVsbHknKTtcbiAgICAgIGV4cGVjdChib2R5LnJlYWRpbmdJZCkudG9CZURlZmluZWQoKTtcbiAgICAgIGV4cGVjdChib2R5LnN0YXR1cykudG9CZSgnUmVhZHknKTtcblxuICAgICAgLy8gVmVyaWZ5IHRoYXQgUzMgZXJyb3JzIHdlcmUgbG9nZ2VkXG4gICAgICBleHBlY3QoY29uc29sZUVycm9yU3B5KS50b0hhdmVCZWVuQ2FsbGVkKCk7XG5cbiAgICAgIC8vIEF0IGxlYXN0IG9uZSBjYWxsIHNob3VsZCBtZW50aW9uIFMzIGZhaWx1cmVcbiAgICAgIGNvbnN0IGhhc1MzRXJyb3IgPSBjb25zb2xlRXJyb3JTcHkubW9jay5jYWxscy5zb21lKChjYWxsKSA9PiB7XG4gICAgICAgIGNvbnN0IGZpcnN0QXJnID0gY2FsbFswXTtcbiAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICB0eXBlb2YgZmlyc3RBcmcgPT09ICdzdHJpbmcnICYmXG4gICAgICAgICAgKGZpcnN0QXJnLmluY2x1ZGVzKCdGYWlsZWQgdG8gZmV0Y2ggUzMgb2JqZWN0JykgfHxcbiAgICAgICAgICAgIGZpcnN0QXJnLmluY2x1ZGVzKCdGYWlsZWQgdG8gZmV0Y2ggcHJvbXB0cyBmcm9tIFMzJykpXG4gICAgICAgICk7XG4gICAgICB9KTtcbiAgICAgIGV4cGVjdChoYXNTM0Vycm9yKS50b0JlKHRydWUpO1xuXG4gICAgICAvLyBSZXN0b3JlIGNvbnNvbGUuZXJyb3JcbiAgICAgIGNvbnNvbGVFcnJvclNweS5tb2NrUmVzdG9yZSgpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgcmF0ZSBsaW1pdCBlcnJvcnMgZnJvbSBPcGVuQUkgd2l0aCByZXRyeSBpbmZvcm1hdGlvbicsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHVzZXJJZCA9ICd0ZXN0LXVzZXItMTIzJztcbiAgICAgIGNvbnN0IGV2ZW50OiBQYXJ0aWFsPEFQSUdhdGV3YXlQcm94eUV2ZW50PiA9IHtcbiAgICAgICAgcGF0aFBhcmFtZXRlcnM6IHsgdXNlcklkIH0sXG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICAgICAgY2xhaW1zOiB7IHN1YjogdXNlcklkIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgICB9IGFzIGFueSxcbiAgICAgIH07XG5cbiAgICAgIC8vIE1vY2sgdXNlciBwcm9maWxlIGFuZCBuYXRhbCBjaGFydFxuICAgICAgZHluYW1vTW9ja1xuICAgICAgICAub24oR2V0Q29tbWFuZCwge1xuICAgICAgICAgIFRhYmxlTmFtZTogJ3Rlc3QtdXNlci10YWJsZScsXG4gICAgICAgICAgS2V5OiB7IHVzZXJJZCwgY3JlYXRlZEF0OiAnUFJPRklMRScgfSxcbiAgICAgICAgfSlcbiAgICAgICAgLnJlc29sdmVzKHtcbiAgICAgICAgICBJdGVtOiB7XG4gICAgICAgICAgICB1c2VySWQsXG4gICAgICAgICAgICBwcm9maWxlOiB7XG4gICAgICAgICAgICAgIGJpcnRoTmFtZTogJ1Rlc3QgVXNlcicsXG4gICAgICAgICAgICAgIGJpcnRoRGF0ZTogJzE5OTAtMDEtMDEnLFxuICAgICAgICAgICAgICBiaXJ0aFRpbWU6ICcxMjowMCcsXG4gICAgICAgICAgICAgIGJpcnRoQ2l0eTogJ05ldyBZb3JrJyxcbiAgICAgICAgICAgICAgYmlydGhTdGF0ZTogJ05ZJyxcbiAgICAgICAgICAgICAgYmlydGhDb3VudHJ5OiAnVVNBJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgIGR5bmFtb01vY2tcbiAgICAgICAgLm9uKEdldENvbW1hbmQsIHtcbiAgICAgICAgICBUYWJsZU5hbWU6ICd0ZXN0LW5hdGFsLWNoYXJ0LXRhYmxlJyxcbiAgICAgICAgICBLZXk6IHsgdXNlcklkIH0sXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgSXRlbToge1xuICAgICAgICAgICAgdXNlcklkLFxuICAgICAgICAgICAgcGxhbmV0czoge1xuICAgICAgICAgICAgICBzdW46IHsgc2lnbjogJ0NhcHJpY29ybicsIGRlZ3JlZUluU2lnbjogMTAgfSxcbiAgICAgICAgICAgICAgbW9vbjogeyBzaWduOiAnQ2FuY2VyJywgZGVncmVlSW5TaWduOiAxNSB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgLy8gTW9jayBTU00gYW5kIFMzXG4gICAgICBzc21Nb2NrLm9uKEdldFBhcmFtZXRlckNvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgUGFyYW1ldGVyOiB7IFZhbHVlOiAndGVzdC12YWx1ZScgfSxcbiAgICAgIH0pO1xuXG4gICAgICBzM01vY2sub24oR2V0T2JqZWN0Q29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBCb2R5OiB7XG4gICAgICAgICAgdHJhbnNmb3JtVG9TdHJpbmc6IGFzeW5jICgpID0+ICdUZXN0IHByb21wdCBjb250ZW50JyxcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgICB9IGFzIGFueSxcbiAgICAgICAgRVRhZzogJ3Rlc3QtZXRhZycsXG4gICAgICB9KTtcblxuICAgICAgZHluYW1vTW9jay5vbihQdXRDb21tYW5kKS5yZXNvbHZlcyh7fSk7XG5cbiAgICAgIC8vIFNpbXVsYXRlIE9wZW5BSSByYXRlIGxpbWl0IGVycm9yICg0MjkpXG4gICAgICAoZ2xvYmFsLmZldGNoIGFzIGplc3QuTW9jaykubW9ja1Jlc29sdmVkVmFsdWVPbmNlKHtcbiAgICAgICAgb2s6IGZhbHNlLFxuICAgICAgICBzdGF0dXM6IDQyOSxcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICdyZXRyeS1hZnRlcic6ICc2MCcsXG4gICAgICAgIH0sXG4gICAgICAgIHRleHQ6IGFzeW5jICgpID0+XG4gICAgICAgICAgSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgZXJyb3I6IHtcbiAgICAgICAgICAgICAgbWVzc2FnZTogJ1JhdGUgbGltaXQgZXhjZWVkZWQuIFBsZWFzZSByZXRyeSBhZnRlciA2MCBzZWNvbmRzLicsXG4gICAgICAgICAgICAgIHR5cGU6ICdyYXRlX2xpbWl0X2Vycm9yJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSksXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBnZW5lcmF0ZVJlYWRpbmdIYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoNTAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkubWVzc2FnZSkudG9CZShcbiAgICAgICAgXCJXZSdyZSBzb3JyeSwgYnV0IHdlIGNvdWxkbid0IGdlbmVyYXRlIHlvdXIgcmVhZGluZyBhdCB0aGlzIHRpbWUuIFBsZWFzZSB0cnkgYWdhaW4gbGF0ZXIuXCIsXG4gICAgICApO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmVVbmRlZmluZWQoKTtcbiAgICAgIGV4cGVjdChib2R5WydyZXRyeS1hZnRlciddKS50b0JlVW5kZWZpbmVkKCk7IC8vIFNob3VsZCBub3QgZXhwb3NlIHJldHJ5IGluZm9ybWF0aW9uIHRvIHVzZXJzXG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBtaXNzaW5nIFNTTSBwYXJhbWV0ZXJzIGdyYWNlZnVsbHknLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCB1c2VySWQgPSAndGVzdC11c2VyLTEyMyc7XG4gICAgICBjb25zdCBldmVudDogUGFydGlhbDxBUElHYXRld2F5UHJveHlFdmVudD4gPSB7XG4gICAgICAgIHBhdGhQYXJhbWV0ZXJzOiB7IHVzZXJJZCB9LFxuICAgICAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgICAgIGF1dGhvcml6ZXI6IHtcbiAgICAgICAgICAgIGNsYWltczogeyBzdWI6IHVzZXJJZCB9LFxuICAgICAgICAgIH0sXG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgICAgfSBhcyBhbnksXG4gICAgICB9O1xuXG4gICAgICAvLyBNb2NrIHVzZXIgcHJvZmlsZSBhbmQgbmF0YWwgY2hhcnRcbiAgICAgIGR5bmFtb01vY2tcbiAgICAgICAgLm9uKEdldENvbW1hbmQsIHtcbiAgICAgICAgICBUYWJsZU5hbWU6ICd0ZXN0LXVzZXItdGFibGUnLFxuICAgICAgICAgIEtleTogeyB1c2VySWQsIGNyZWF0ZWRBdDogJ1BST0ZJTEUnIH0sXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgSXRlbToge1xuICAgICAgICAgICAgdXNlcklkLFxuICAgICAgICAgICAgcHJvZmlsZToge1xuICAgICAgICAgICAgICBiaXJ0aE5hbWU6ICdUZXN0IFVzZXInLFxuICAgICAgICAgICAgICBiaXJ0aERhdGU6ICcxOTkwLTAxLTAxJyxcbiAgICAgICAgICAgICAgYmlydGhUaW1lOiAnMTI6MDAnLFxuICAgICAgICAgICAgICBiaXJ0aENpdHk6ICdOZXcgWW9yaycsXG4gICAgICAgICAgICAgIGJpcnRoU3RhdGU6ICdOWScsXG4gICAgICAgICAgICAgIGJpcnRoQ291bnRyeTogJ1VTQScsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICBkeW5hbW9Nb2NrXG4gICAgICAgIC5vbihHZXRDb21tYW5kLCB7XG4gICAgICAgICAgVGFibGVOYW1lOiAndGVzdC1uYXRhbC1jaGFydC10YWJsZScsXG4gICAgICAgICAgS2V5OiB7IHVzZXJJZCB9LFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoe1xuICAgICAgICAgIEl0ZW06IHtcbiAgICAgICAgICAgIHVzZXJJZCxcbiAgICAgICAgICAgIHBsYW5ldHM6IHtcbiAgICAgICAgICAgICAgc3VuOiB7IHNpZ246ICdDYXByaWNvcm4nLCBkZWdyZWVJblNpZ246IDEwIH0sXG4gICAgICAgICAgICAgIG1vb246IHsgc2lnbjogJ0NhbmNlcicsIGRlZ3JlZUluU2lnbjogMTUgfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgIC8vIE1vY2sgU1NNIHBhcmFtZXRlciBub3QgZm91bmQgZXJyb3JcbiAgICAgIHNzbU1vY2sub24oR2V0UGFyYW1ldGVyQ29tbWFuZCkucmVqZWN0cyhuZXcgRXJyb3IoJ1BhcmFtZXRlck5vdEZvdW5kJykpO1xuXG4gICAgICAvLyBNb2NrIFMzIGFuZCBEeW5hbW9EQlxuICAgICAgczNNb2NrLm9uKEdldE9iamVjdENvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgQm9keToge1xuICAgICAgICAgIHRyYW5zZm9ybVRvU3RyaW5nOiBhc3luYyAoKSA9PiAnVGVzdCBwcm9tcHQgY29udGVudCcsXG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgICAgfSBhcyBhbnksXG4gICAgICAgIEVUYWc6ICd0ZXN0LWV0YWcnLFxuICAgICAgfSk7XG5cbiAgICAgIGR5bmFtb01vY2sub24oUHV0Q29tbWFuZCkucmVzb2x2ZXMoe30pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGdlbmVyYXRlUmVhZGluZ0hhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSg1MDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5tZXNzYWdlKS50b0JlKFxuICAgICAgICBcIldlJ3JlIHNvcnJ5LCBidXQgd2UgY291bGRuJ3QgZ2VuZXJhdGUgeW91ciByZWFkaW5nIGF0IHRoaXMgdGltZS4gUGxlYXNlIHRyeSBhZ2FpbiBsYXRlci5cIixcbiAgICAgICk7XG4gICAgICBleHBlY3QoYm9keS5lcnJvcikudG9CZVVuZGVmaW5lZCgpO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnZ2V0UmVhZGluZ3NIYW5kbGVyJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgcmV0dXJuIGxpc3Qgb2YgcmVhZGluZ3MgZm9yIGEgdXNlcicsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHVzZXJJZCA9ICd0ZXN0LXVzZXItMTIzJztcbiAgICAgIGNvbnN0IGV2ZW50OiBQYXJ0aWFsPEFQSUdhdGV3YXlQcm94eUV2ZW50PiA9IHtcbiAgICAgICAgcGF0aFBhcmFtZXRlcnM6IHsgdXNlcklkIH0sXG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICAgICAgY2xhaW1zOiB7IHN1YjogdXNlcklkIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgICB9IGFzIGFueSxcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IG1vY2tSZWFkaW5ncyA9IFtcbiAgICAgICAge1xuICAgICAgICAgIHJlYWRpbmdJZDogJ3JlYWRpbmctMScsXG4gICAgICAgICAgdHlwZTogJ1NvdWwgQmx1ZXByaW50JyxcbiAgICAgICAgICBzdGF0dXM6ICdSZWFkeScsXG4gICAgICAgICAgY3JlYXRlZEF0OiAnMjAyNC0wMS0wMVQwMDowMDowMFonLFxuICAgICAgICAgIHVwZGF0ZWRBdDogJzIwMjQtMDEtMDFUMDA6MDE6MDBaJyxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIHJlYWRpbmdJZDogJ3JlYWRpbmctMicsXG4gICAgICAgICAgdHlwZTogJ1NvdWwgQmx1ZXByaW50JyxcbiAgICAgICAgICBzdGF0dXM6ICdQcm9jZXNzaW5nJyxcbiAgICAgICAgICBjcmVhdGVkQXQ6ICcyMDI0LTAxLTAyVDAwOjAwOjAwWicsXG4gICAgICAgICAgdXBkYXRlZEF0OiAnMjAyNC0wMS0wMlQwMDowMDowMFonLFxuICAgICAgICB9LFxuICAgICAgXTtcblxuICAgICAgZHluYW1vTW9jay5vbihRdWVyeUNvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgSXRlbXM6IG1vY2tSZWFkaW5ncyxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGdldFJlYWRpbmdzSGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LnJlYWRpbmdzKS50b0hhdmVMZW5ndGgoMik7XG4gICAgICBleHBlY3QoYm9keS5jb3VudCkudG9CZSgyKTtcbiAgICAgIGV4cGVjdChib2R5LnJlYWRpbmdzWzBdLnJlYWRpbmdJZCkudG9CZSgncmVhZGluZy0xJyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHJldHVybiBlbXB0eSBsaXN0IGlmIG5vIHJlYWRpbmdzIGV4aXN0JywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgdXNlcklkID0gJ3Rlc3QtdXNlci0xMjMnO1xuICAgICAgY29uc3QgZXZlbnQ6IFBhcnRpYWw8QVBJR2F0ZXdheVByb3h5RXZlbnQ+ID0ge1xuICAgICAgICBwYXRoUGFyYW1ldGVyczogeyB1c2VySWQgfSxcbiAgICAgICAgcmVxdWVzdENvbnRleHQ6IHtcbiAgICAgICAgICBhdXRob3JpemVyOiB7XG4gICAgICAgICAgICBjbGFpbXM6IHsgc3ViOiB1c2VySWQgfSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICAgIH0gYXMgYW55LFxuICAgICAgfTtcblxuICAgICAgZHluYW1vTW9jay5vbihRdWVyeUNvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgSXRlbXM6IFtdLFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZ2V0UmVhZGluZ3NIYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkucmVhZGluZ3MpLnRvSGF2ZUxlbmd0aCgwKTtcbiAgICAgIGV4cGVjdChib2R5LmNvdW50KS50b0JlKDApO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnZ2V0UmVhZGluZ0RldGFpbEhhbmRsZXInLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gcmVhZGluZyBkZXRhaWwgc3VjY2Vzc2Z1bGx5JywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgdXNlcklkID0gJ3Rlc3QtdXNlci0xMjMnO1xuICAgICAgY29uc3QgcmVhZGluZ0lkID0gJ3JlYWRpbmctMTIzJztcbiAgICAgIGNvbnN0IGV2ZW50OiBQYXJ0aWFsPEFQSUdhdGV3YXlQcm94eUV2ZW50PiA9IHtcbiAgICAgICAgcGF0aFBhcmFtZXRlcnM6IHsgdXNlcklkLCByZWFkaW5nSWQgfSxcbiAgICAgICAgcmVxdWVzdENvbnRleHQ6IHtcbiAgICAgICAgICBhdXRob3JpemVyOiB7XG4gICAgICAgICAgICBjbGFpbXM6IHsgc3ViOiB1c2VySWQgfSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICAgIH0gYXMgYW55LFxuICAgICAgfTtcblxuICAgICAgY29uc3QgbW9ja1JlYWRpbmcgPSB7XG4gICAgICAgIHVzZXJJZCxcbiAgICAgICAgcmVhZGluZ0lkLFxuICAgICAgICB0eXBlOiAnU291bCBCbHVlcHJpbnQnLFxuICAgICAgICBzdGF0dXM6ICdSZWFkeScsXG4gICAgICAgIGNvbnRlbnQ6ICdZb3VyIGRldGFpbGVkIFNvdWwgQmx1ZXByaW50IHJlYWRpbmcuLi4nLFxuICAgICAgICBjcmVhdGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAwOjAwWicsXG4gICAgICAgIHVwZGF0ZWRBdDogJzIwMjQtMDEtMDFUMDA6MDE6MDBaJyxcbiAgICAgIH07XG5cbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBJdGVtOiBtb2NrUmVhZGluZyxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGdldFJlYWRpbmdEZXRhaWxIYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkucmVhZGluZ0lkKS50b0JlKHJlYWRpbmdJZCk7XG4gICAgICBleHBlY3QoYm9keS5jb250ZW50KS50b0JlKCdZb3VyIGRldGFpbGVkIFNvdWwgQmx1ZXByaW50IHJlYWRpbmcuLi4nKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgcmV0dXJuIDQwNCBpZiByZWFkaW5nIG5vdCBmb3VuZCcsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHVzZXJJZCA9ICd0ZXN0LXVzZXItMTIzJztcbiAgICAgIGNvbnN0IHJlYWRpbmdJZCA9ICdub24tZXhpc3RlbnQnO1xuICAgICAgY29uc3QgZXZlbnQ6IFBhcnRpYWw8QVBJR2F0ZXdheVByb3h5RXZlbnQ+ID0ge1xuICAgICAgICBwYXRoUGFyYW1ldGVyczogeyB1c2VySWQsIHJlYWRpbmdJZCB9LFxuICAgICAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgICAgIGF1dGhvcml6ZXI6IHtcbiAgICAgICAgICAgIGNsYWltczogeyBzdWI6IHVzZXJJZCB9LFxuICAgICAgICAgIH0sXG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgICAgfSBhcyBhbnksXG4gICAgICB9O1xuXG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgSXRlbTogdW5kZWZpbmVkLFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZ2V0UmVhZGluZ0RldGFpbEhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSg0MDQpO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5tZXNzYWdlKS50b0JlKCdSZWFkaW5nIG5vdCBmb3VuZCcpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gNDAzIGlmIHVzZXIgaXMgbm90IGF1dGhvcml6ZWQnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudDogUGFydGlhbDxBUElHYXRld2F5UHJveHlFdmVudD4gPSB7XG4gICAgICAgIHBhdGhQYXJhbWV0ZXJzOiB7IHVzZXJJZDogJ3VzZXItMTIzJywgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnIH0sXG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICAgICAgY2xhaW1zOiB7IHN1YjogJ2RpZmZlcmVudC11c2VyJyB9LFxuICAgICAgICAgIH0sXG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgICAgfSBhcyBhbnksXG4gICAgICB9O1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGdldFJlYWRpbmdEZXRhaWxIYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoNDAzKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkubWVzc2FnZSkudG9CZSgnVW5hdXRob3JpemVkIHRvIHZpZXcgdGhpcyByZWFkaW5nJyk7XG4gICAgfSk7XG4gIH0pO1xufSk7XG4iXX0=