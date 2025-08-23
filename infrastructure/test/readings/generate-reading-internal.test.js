"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const generate_reading_1 = require("../../lambda/readings/generate-reading");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const client_ssm_1 = require("@aws-sdk/client-ssm");
const client_s3_1 = require("@aws-sdk/client-s3");
const aws_sdk_client_mock_1 = require("aws-sdk-client-mock");
const stream_1 = require("stream");
// Mock the DynamoDB, SSM, and S3 clients
const dynamoMock = (0, aws_sdk_client_mock_1.mockClient)(lib_dynamodb_1.DynamoDBDocumentClient);
const ssmMock = (0, aws_sdk_client_mock_1.mockClient)(client_ssm_1.SSMClient);
const s3Mock = (0, aws_sdk_client_mock_1.mockClient)(client_s3_1.S3Client);
// Mock fetch for OpenAI API calls
global.fetch = jest.fn();
// Clear module cache to reset cached config between tests
jest.resetModules();
describe('Generate Reading Lambda - Internal Invocation', () => {
    const mockUserId = 'test-user-123';
    const mockReadingId = 'test-reading-123';
    beforeEach(() => {
        // Clear module cache to reset any cached configs
        jest.resetModules();
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
        process.env.INTERNAL_INVOCATION_SECRET = 'test-internal-secret-123';
        // Setup default mocks for successful reading generation
        setupSuccessfulMocks();
    });
    const setupSuccessfulMocks = () => {
        // Mock user profile
        dynamoMock
            .on(lib_dynamodb_1.GetCommand, {
            TableName: 'test-user-table',
            Key: { userId: mockUserId, createdAt: 'PROFILE' },
        })
            .resolves({
            Item: {
                userId: mockUserId,
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
            Key: { userId: mockUserId },
        })
            .resolves({
            Item: {
                userId: mockUserId,
                planets: {
                    sun: { sign: 'Capricorn', degreeInSign: 10 },
                    moon: { sign: 'Cancer', degreeInSign: 15 },
                },
            },
        });
        // Mock SSM parameters
        ssmMock
            .on(client_ssm_1.GetParameterCommand, { Name: '/test/openai-key' })
            .resolves({ Parameter: { Value: 'test-api-key' } });
        ssmMock
            .on(client_ssm_1.GetParameterCommand, { Name: '/test/reading-model' })
            .resolves({ Parameter: { Value: 'gpt-4' } });
        ssmMock
            .on(client_ssm_1.GetParameterCommand, { Name: '/test/reading-temperature' })
            .resolves({ Parameter: { Value: '0.7' } });
        ssmMock
            .on(client_ssm_1.GetParameterCommand, { Name: '/test/reading-max-tokens' })
            .resolves({ Parameter: { Value: '1500' } });
        ssmMock
            .on(client_ssm_1.GetParameterCommand, { Name: '/test/system-prompt-key' })
            .resolves({ Parameter: { Value: 'prompts/test/system.txt' } });
        ssmMock
            .on(client_ssm_1.GetParameterCommand, { Name: '/test/user-prompt-key' })
            .resolves({ Parameter: { Value: 'prompts/test/user.txt' } });
        // Mock S3 prompts
        const systemPrompt = 'You are an expert astrologer.';
        const userPromptTemplate = 'Generate a reading for {{birthName}}.';
        s3Mock
            .on(client_s3_1.GetObjectCommand, {
            Bucket: 'test-config-bucket',
            Key: 'prompts/test/system.txt',
        })
            .resolves({
            Body: stream_1.Readable.from([systemPrompt]),
            ETag: 'test-etag-1',
        });
        s3Mock
            .on(client_s3_1.GetObjectCommand, {
            Bucket: 'test-config-bucket',
            Key: 'prompts/test/user.txt',
        })
            .resolves({
            Body: stream_1.Readable.from([userPromptTemplate]),
            ETag: 'test-etag-2',
        });
        // Mock OpenAI API response
        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [
                    {
                        message: {
                            content: 'This is your soul blueprint reading...',
                        },
                    },
                ],
            }),
        });
        // Mock DynamoDB put for reading record
        dynamoMock.on(lib_dynamodb_1.PutCommand).resolves({});
    };
    describe('Internal invocation from webhook handler', () => {
        it('should successfully process internal invocation with webhook metadata', async () => {
            const metadata = {
                sessionId: 'cs_test_session_123',
                customerEmail: 'customer@example.com',
                amountTotal: 2900,
                currency: 'usd',
                paymentIntentId: 'pi_test_123',
                campaign: 'summer2024',
            };
            const internalEvent = {
                source: 'webhook',
                userId: mockUserId,
                internalSecret: 'test-internal-secret-123',
                metadata,
                requestContext: {
                    authorizer: {
                        claims: {
                            sub: mockUserId,
                        },
                    },
                },
            };
            const result = await (0, generate_reading_1.handler)(internalEvent);
            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body).toHaveProperty('readingId');
            expect(body).toHaveProperty('message', 'Reading generated successfully');
            // Verify reading was saved with metadata
            expect(dynamoMock).toHaveReceivedCommandWith(lib_dynamodb_1.PutCommand, {
                TableName: 'test-readings-table',
                Item: expect.objectContaining({
                    userId: mockUserId,
                    type: 'Soul Blueprint',
                    status: 'Processing',
                    metadata,
                }),
            });
            // Verify reading was updated with content
            expect(dynamoMock).toHaveReceivedCommandWith(lib_dynamodb_1.PutCommand, {
                TableName: 'test-readings-table',
                Item: expect.objectContaining({
                    userId: mockUserId,
                    status: 'Ready',
                    content: expect.any(String),
                    metadata,
                }),
            });
        });
        it('should process internal invocation without metadata', async () => {
            const internalEvent = {
                source: 'webhook',
                userId: mockUserId,
                internalSecret: 'test-internal-secret-123',
                requestContext: {
                    authorizer: {
                        claims: {
                            sub: mockUserId,
                        },
                    },
                },
            };
            const result = await (0, generate_reading_1.handler)(internalEvent);
            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body).toHaveProperty('readingId');
            // Verify reading was saved without metadata field
            const putCalls = dynamoMock.commandCalls(lib_dynamodb_1.PutCommand);
            const firstPutCall = putCalls[0];
            expect(firstPutCall.args[0].input.Item).not.toHaveProperty('metadata');
        });
        it('should process internal invocation with empty metadata', async () => {
            const internalEvent = {
                source: 'webhook',
                userId: mockUserId,
                internalSecret: 'test-internal-secret-123',
                metadata: {},
                requestContext: {
                    authorizer: {
                        claims: {
                            sub: mockUserId,
                        },
                    },
                },
            };
            const result = await (0, generate_reading_1.handler)(internalEvent);
            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body).toHaveProperty('readingId');
            // Verify reading was saved without metadata field (empty object not included)
            const putCalls = dynamoMock.commandCalls(lib_dynamodb_1.PutCommand);
            const firstPutCall = putCalls[0];
            expect(firstPutCall.args[0].input.Item).not.toHaveProperty('metadata');
        });
        it('should handle missing user profile for internal invocation', async () => {
            // Mock missing user profile
            dynamoMock
                .on(lib_dynamodb_1.GetCommand, {
                TableName: 'test-user-table',
                Key: { userId: mockUserId, createdAt: 'PROFILE' },
            })
                .resolves({ Item: undefined });
            const internalEvent = {
                source: 'webhook',
                userId: mockUserId,
                internalSecret: 'test-internal-secret-123',
                metadata: { sessionId: 'cs_test_123' },
                requestContext: {
                    authorizer: {
                        claims: {
                            sub: mockUserId,
                        },
                    },
                },
            };
            const result = await (0, generate_reading_1.handler)(internalEvent);
            expect(result.statusCode).toBe(404);
            const body = JSON.parse(result.body);
            expect(body.message).toBe('User profile not found');
        });
        it('should handle missing natal chart for internal invocation', async () => {
            // Mock missing natal chart
            dynamoMock
                .on(lib_dynamodb_1.GetCommand, {
                TableName: 'test-natal-chart-table',
                Key: { userId: mockUserId },
            })
                .resolves({ Item: undefined });
            const internalEvent = {
                source: 'webhook',
                userId: mockUserId,
                internalSecret: 'test-internal-secret-123',
                metadata: { sessionId: 'cs_test_123' },
                requestContext: {
                    authorizer: {
                        claims: {
                            sub: mockUserId,
                        },
                    },
                },
            };
            const result = await (0, generate_reading_1.handler)(internalEvent);
            expect(result.statusCode).toBe(400);
            const body = JSON.parse(result.body);
            expect(body.message).toBe('Natal chart not generated. Please complete your profile first.');
        });
    });
    describe('Type guard for internal invocation detection', () => {
        it('should correctly identify internal invocation events', async () => {
            const internalEvent = {
                source: 'webhook',
                userId: mockUserId,
                internalSecret: 'test-internal-secret-123',
                metadata: { test: 'data' },
                requestContext: {
                    authorizer: {
                        claims: {
                            sub: mockUserId,
                        },
                    },
                },
            };
            const result = await (0, generate_reading_1.handler)(internalEvent);
            expect(result.statusCode).toBe(200);
            // Should not go through API Gateway authorization checks
            expect(result.headers).toHaveProperty('Access-Control-Allow-Origin', '*');
        });
        it('should correctly identify API Gateway events', async () => {
            const apiGatewayEvent = {
                pathParameters: { userId: mockUserId },
                requestContext: {
                    authorizer: {
                        claims: { sub: mockUserId },
                    },
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                },
                body: JSON.stringify({ metadata: { source: 'web' } }),
            };
            const result = await (0, generate_reading_1.handler)(apiGatewayEvent);
            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body).toHaveProperty('readingId');
            // Verify metadata from request body was used
            expect(dynamoMock).toHaveReceivedCommandWith(lib_dynamodb_1.PutCommand, {
                TableName: 'test-readings-table',
                Item: expect.objectContaining({
                    metadata: { source: 'web' },
                }),
            });
        });
        it('should reject events with wrong source value', async () => {
            const invalidEvent = {
                source: 'invalid',
                userId: mockUserId,
                requestContext: {
                    authorizer: {
                        claims: {
                            sub: 'different-user',
                        },
                    },
                },
            };
            // This should be treated as API Gateway event and fail authorization
            const result = await (0, generate_reading_1.handler)(invalidEvent);
            expect(result.statusCode).toBe(400);
            const body = JSON.parse(result.body);
            expect(body.message).toBe('userId is required');
        });
        it('should reject internal events missing userId', async () => {
            const invalidEvent = {
                source: 'webhook',
                metadata: { test: 'data' },
                requestContext: {
                    authorizer: {
                        claims: {
                            sub: 'user-123',
                        },
                    },
                },
            };
            // Missing userId should fail type guard
            const result = await (0, generate_reading_1.handler)(invalidEvent);
            expect(result.statusCode).toBe(400);
            const body = JSON.parse(result.body);
            expect(body.message).toBe('userId is required');
        });
        it('should handle events with pathParameters as internal if source is webhook', async () => {
            const hybridEvent = {
                source: 'webhook',
                userId: mockUserId,
                internalSecret: 'test-internal-secret-123',
                pathParameters: { userId: 'should-be-ignored' }, // pathParameters presence fails type guard
                requestContext: {
                    authorizer: {
                        claims: {
                            sub: mockUserId,
                        },
                    },
                },
            };
            // pathParameters presence causes type guard to fail, treating as API Gateway event
            const result = await (0, generate_reading_1.handler)(hybridEvent);
            // Should fail authorization since path userId doesn't match claims
            expect(result.statusCode).toBe(403);
        });
    });
    describe('Metadata handling in reading generation', () => {
        it('should preserve all metadata types in reading record', async () => {
            const complexMetadata = {
                sessionId: 'cs_test_123',
                customerEmail: 'test@example.com',
                amountTotal: 2900,
                currency: 'usd',
                isSubscription: true,
                subscriptionItems: 3,
                promoCode: 'SAVE20',
                referrer: 'newsletter',
                customField: 'custom-value',
            };
            const internalEvent = {
                source: 'webhook',
                userId: mockUserId,
                internalSecret: 'test-internal-secret-123',
                metadata: complexMetadata,
                requestContext: {
                    authorizer: {
                        claims: {
                            sub: mockUserId,
                        },
                    },
                },
            };
            const result = await (0, generate_reading_1.handler)(internalEvent);
            expect(result.statusCode).toBe(200);
            // Verify all metadata was preserved
            expect(dynamoMock).toHaveReceivedCommandWith(lib_dynamodb_1.PutCommand, {
                TableName: 'test-readings-table',
                Item: expect.objectContaining({
                    metadata: complexMetadata,
                }),
            });
        });
        it('should handle metadata from API Gateway request body', async () => {
            const apiMetadata = {
                source: 'mobile-app',
                version: '1.2.3',
                deviceId: 'device-123',
            };
            const apiGatewayEvent = {
                pathParameters: { userId: mockUserId },
                requestContext: {
                    authorizer: {
                        claims: { sub: mockUserId },
                    },
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                },
                body: JSON.stringify({ metadata: apiMetadata }),
            };
            const result = await (0, generate_reading_1.handler)(apiGatewayEvent);
            expect(result.statusCode).toBe(200);
            // Verify API metadata was saved
            expect(dynamoMock).toHaveReceivedCommandWith(lib_dynamodb_1.PutCommand, {
                TableName: 'test-readings-table',
                Item: expect.objectContaining({
                    metadata: apiMetadata,
                }),
            });
        });
        it('should handle invalid JSON in API Gateway body gracefully', async () => {
            const apiGatewayEvent = {
                pathParameters: { userId: mockUserId },
                requestContext: {
                    authorizer: {
                        claims: { sub: mockUserId },
                    },
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                },
                body: 'invalid json {',
            };
            const result = await (0, generate_reading_1.handler)(apiGatewayEvent);
            expect(result.statusCode).toBe(200);
            // Should proceed without metadata
            const putCalls = dynamoMock.commandCalls(lib_dynamodb_1.PutCommand);
            const firstPutCall = putCalls[0];
            expect(firstPutCall.args[0].input.Item).not.toHaveProperty('metadata');
        });
        it('should handle null body in API Gateway event', async () => {
            const apiGatewayEvent = {
                pathParameters: { userId: mockUserId },
                requestContext: {
                    authorizer: {
                        claims: { sub: mockUserId },
                    },
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                },
                body: null,
            };
            const result = await (0, generate_reading_1.handler)(apiGatewayEvent);
            expect(result.statusCode).toBe(200);
            // Should proceed without metadata
            const putCalls = dynamoMock.commandCalls(lib_dynamodb_1.PutCommand);
            const firstPutCall = putCalls[0];
            expect(firstPutCall.args[0].input.Item).not.toHaveProperty('metadata');
        });
    });
    describe('Error handling in internal invocation', () => {
        it('should handle OpenAI API failure for internal invocation', async () => {
            // Mock OpenAI API failure
            global.fetch.mockRejectedValue(new Error('OpenAI API error'));
            const internalEvent = {
                source: 'webhook',
                userId: mockUserId,
                internalSecret: 'test-internal-secret-123',
                metadata: { sessionId: 'cs_test_123' },
                requestContext: {
                    authorizer: {
                        claims: {
                            sub: mockUserId,
                        },
                    },
                },
            };
            const result = await (0, generate_reading_1.handler)(internalEvent);
            expect(result.statusCode).toBe(500);
            const body = JSON.parse(result.body);
            expect(body.message).toBe("We're sorry, but we couldn't generate your reading at this time. Please try again later.");
            // Verify reading was marked as failed
            expect(dynamoMock).toHaveReceivedCommandWith(lib_dynamodb_1.PutCommand, {
                TableName: 'test-readings-table',
                Item: expect.objectContaining({
                    status: 'Failed',
                    error: expect.any(String),
                }),
            });
        });
        it('should handle DynamoDB errors for internal invocation', async () => {
            // Mock DynamoDB error on initial save
            dynamoMock.on(lib_dynamodb_1.PutCommand).rejects(new Error('DynamoDB error'));
            const internalEvent = {
                source: 'webhook',
                userId: mockUserId,
                internalSecret: 'test-internal-secret-123',
                metadata: { sessionId: 'cs_test_123' },
                requestContext: {
                    authorizer: {
                        claims: {
                            sub: mockUserId,
                        },
                    },
                },
            };
            const result = await (0, generate_reading_1.handler)(internalEvent);
            expect(result.statusCode).toBe(500);
            const body = JSON.parse(result.body);
            expect(body.message).toContain("couldn't generate your reading");
        });
        it('should handle S3 prompt fetch errors for internal invocation', async () => {
            // Mock S3 error
            s3Mock.on(client_s3_1.GetObjectCommand).rejects(new Error('S3 access denied'));
            const internalEvent = {
                source: 'webhook',
                userId: mockUserId,
                internalSecret: 'test-internal-secret-123',
                metadata: { sessionId: 'cs_test_123' },
                requestContext: {
                    authorizer: {
                        claims: {
                            sub: mockUserId,
                        },
                    },
                },
            };
            const result = await (0, generate_reading_1.handler)(internalEvent);
            // Should fall back to default prompts and succeed
            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body).toHaveProperty('readingId');
        });
    });
    describe('Authorization context handling', () => {
        it('should use provided requestContext for internal invocation', async () => {
            const internalEvent = {
                source: 'webhook',
                userId: mockUserId,
                internalSecret: 'test-internal-secret-123',
                metadata: { sessionId: 'cs_test_123' },
                requestContext: {
                    authorizer: {
                        claims: {
                            sub: mockUserId,
                            email: 'webhook@example.com',
                        },
                    },
                },
            };
            const result = await (0, generate_reading_1.handler)(internalEvent);
            expect(result.statusCode).toBe(200);
            // The authorization context is used but not validated for internal invocations
        });
        it('should work without requestContext for internal invocation', async () => {
            const internalEvent = {
                source: 'webhook',
                userId: mockUserId,
                internalSecret: 'test-internal-secret-123',
                metadata: { sessionId: 'cs_test_123' },
            };
            const result = await (0, generate_reading_1.handler)(internalEvent);
            // Should still succeed as internal invocations don't require auth context
            expect(result.statusCode).toBe(200);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGUtcmVhZGluZy1pbnRlcm5hbC50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZ2VuZXJhdGUtcmVhZGluZy1pbnRlcm5hbC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsNkVBQWlFO0FBRWpFLHdEQUF1RjtBQUN2RixvREFBcUU7QUFDckUsa0RBQWdFO0FBQ2hFLDZEQUFpRDtBQUNqRCxtQ0FBa0M7QUFFbEMseUNBQXlDO0FBQ3pDLE1BQU0sVUFBVSxHQUFHLElBQUEsZ0NBQVUsRUFBQyxxQ0FBc0IsQ0FBQyxDQUFDO0FBQ3RELE1BQU0sT0FBTyxHQUFHLElBQUEsZ0NBQVUsRUFBQyxzQkFBUyxDQUFDLENBQUM7QUFDdEMsTUFBTSxNQUFNLEdBQUcsSUFBQSxnQ0FBVSxFQUFDLG9CQUFRLENBQUMsQ0FBQztBQUVwQyxrQ0FBa0M7QUFDbEMsTUFBTSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsRUFBRSxFQUFFLENBQUM7QUFFekIsMERBQTBEO0FBQzFELElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztBQUVwQixRQUFRLENBQUMsK0NBQStDLEVBQUUsR0FBRyxFQUFFO0lBQzdELE1BQU0sVUFBVSxHQUFHLGVBQWUsQ0FBQztJQUNuQyxNQUFNLGFBQWEsR0FBRyxrQkFBa0IsQ0FBQztJQUV6QyxVQUFVLENBQUMsR0FBRyxFQUFFO1FBQ2QsaURBQWlEO1FBQ2pELElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUVwQixVQUFVLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDbkIsT0FBTyxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ2hCLE1BQU0sQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNkLE1BQU0sQ0FBQyxLQUFtQixDQUFDLFNBQVMsRUFBRSxDQUFDO1FBRXhDLHFDQUFxQztRQUNyQyxPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFtQixHQUFHLHFCQUFxQixDQUFDO1FBQ3hELE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFB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O3FCQUNGO2lCQUNGO2FBQ0YsQ0FBQztZQUVGLE1BQU0sTUFBTSxHQUFHLE1BQU0sSUFBQSwwQkFBTyxFQUFDLGFBQWEsQ0FBQyxDQUFDO1lBRTVDLE1BQU0sQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3BDLCtFQUErRTtRQUNqRixDQUFDLENBQUMsQ0FBQztRQUVILEVBQUUsQ0FBQyw0REFBNEQsRUFBRSxLQUFLLElBQUksRUFBRTtZQUMxRSxNQUFNLGFBQWEsR0FBRztnQkFDcEIsTUFBTSxFQUFFLFNBQWtCO2dCQUMxQixNQUFNLEVBQUUsVUFBVTtnQkFDbEIsY0FBYyxFQUFFLDBCQUEwQjtnQkFDMUMsUUFBUSxFQUFFLEVBQUUsU0FBUyxFQUFFLGFBQWEsRUFBRTthQUN2QyxDQUFDO1lBRUYsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFBLDBCQUFPLEVBQUMsYUFBYSxDQUFDLENBQUM7WUFFNUMsMEVBQTBFO1lBQzFFLE1BQU0sQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3RDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGhhbmRsZXIgfSBmcm9tICcuLi8uLi9sYW1iZGEvcmVhZGluZ3MvZ2VuZXJhdGUtcmVhZGluZyc7XG5pbXBvcnQgeyBBUElHYXRld2F5UHJveHlFdmVudCB9IGZyb20gJ2F3cy1sYW1iZGEnO1xuaW1wb3J0IHsgRHluYW1vREJEb2N1bWVudENsaWVudCwgR2V0Q29tbWFuZCwgUHV0Q29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYic7XG5pbXBvcnQgeyBTU01DbGllbnQsIEdldFBhcmFtZXRlckNvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtc3NtJztcbmltcG9ydCB7IFMzQ2xpZW50LCBHZXRPYmplY3RDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXMzJztcbmltcG9ydCB7IG1vY2tDbGllbnQgfSBmcm9tICdhd3Mtc2RrLWNsaWVudC1tb2NrJztcbmltcG9ydCB7IFJlYWRhYmxlIH0gZnJvbSAnc3RyZWFtJztcblxuLy8gTW9jayB0aGUgRHluYW1vREIsIFNTTSwgYW5kIFMzIGNsaWVudHNcbmNvbnN0IGR5bmFtb01vY2sgPSBtb2NrQ2xpZW50KER5bmFtb0RCRG9jdW1lbnRDbGllbnQpO1xuY29uc3Qgc3NtTW9jayA9IG1vY2tDbGllbnQoU1NNQ2xpZW50KTtcbmNvbnN0IHMzTW9jayA9IG1vY2tDbGllbnQoUzNDbGllbnQpO1xuXG4vLyBNb2NrIGZldGNoIGZvciBPcGVuQUkgQVBJIGNhbGxzXG5nbG9iYWwuZmV0Y2ggPSBqZXN0LmZuKCk7XG5cbi8vIENsZWFyIG1vZHVsZSBjYWNoZSB0byByZXNldCBjYWNoZWQgY29uZmlnIGJldHdlZW4gdGVzdHNcbmplc3QucmVzZXRNb2R1bGVzKCk7XG5cbmRlc2NyaWJlKCdHZW5lcmF0ZSBSZWFkaW5nIExhbWJkYSAtIEludGVybmFsIEludm9jYXRpb24nLCAoKSA9PiB7XG4gIGNvbnN0IG1vY2tVc2VySWQgPSAndGVzdC11c2VyLTEyMyc7XG4gIGNvbnN0IG1vY2tSZWFkaW5nSWQgPSAndGVzdC1yZWFkaW5nLTEyMyc7XG5cbiAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgLy8gQ2xlYXIgbW9kdWxlIGNhY2hlIHRvIHJlc2V0IGFueSBjYWNoZWQgY29uZmlnc1xuICAgIGplc3QucmVzZXRNb2R1bGVzKCk7XG5cbiAgICBkeW5hbW9Nb2NrLnJlc2V0KCk7XG4gICAgc3NtTW9jay5yZXNldCgpO1xuICAgIHMzTW9jay5yZXNldCgpO1xuICAgIChnbG9iYWwuZmV0Y2ggYXMgamVzdC5Nb2NrKS5tb2NrUmVzZXQoKTtcblxuICAgIC8vIFNldCByZXF1aXJlZCBlbnZpcm9ubWVudCB2YXJpYWJsZXNcbiAgICBwcm9jZXNzLmVudi5SRUFESU5HU19UQUJMRV9OQU1FID0gJ3Rlc3QtcmVhZGluZ3MtdGFibGUnO1xuICAgIHByb2Nlc3MuZW52LlVTRVJfVEFCTEVfTkFNRSA9ICd0ZXN0LXVzZXItdGFibGUnO1xuICAgIHByb2Nlc3MuZW52Lk5BVEFMX0NIQVJUX1RBQkxFX05BTUUgPSAndGVzdC1uYXRhbC1jaGFydC10YWJsZSc7XG4gICAgcHJvY2Vzcy5lbnYuQ09ORklHX0JVQ0tFVF9OQU1FID0gJ3Rlc3QtY29uZmlnLWJ1Y2tldCc7XG4gICAgcHJvY2Vzcy5lbnYuT1BFTkFJX0FQSV9LRVlfUEFSQU1FVEVSX05BTUUgPSAnL3Rlc3Qvb3BlbmFpLWtleSc7XG4gICAgcHJvY2Vzcy5lbnYuUkVBRElOR19NT0RFTF9QQVJBTUVURVJfTkFNRSA9ICcvdGVzdC9yZWFkaW5nLW1vZGVsJztcbiAgICBwcm9jZXNzLmVudi5SRUFESU5HX1RFTVBFUkFUVVJFX1BBUkFNRVRFUl9OQU1FID0gJy90ZXN0L3JlYWRpbmctdGVtcGVyYXR1cmUnO1xuICAgIHByb2Nlc3MuZW52LlJFQURJTkdfTUFYX1RPS0VOU19QQVJBTUVURVJfTkFNRSA9ICcvdGVzdC9yZWFkaW5nLW1heC10b2tlbnMnO1xuICAgIHByb2Nlc3MuZW52LlNZU1RFTV9QUk9NUFRfUzNLRVlfUEFSQU1FVEVSX05BTUUgPSAnL3Rlc3Qvc3lzdGVtLXByb21wdC1rZXknO1xuICAgIHByb2Nlc3MuZW52LlVTRVJfUFJPTVBUX1MzS0VZX1BBUkFNRVRFUl9OQU1FID0gJy90ZXN0L3VzZXItcHJvbXB0LWtleSc7XG4gICAgcHJvY2Vzcy5lbnYuSU5URVJOQUxfSU5WT0NBVElPTl9TRUNSRVQgPSAndGVzdC1pbnRlcm5hbC1zZWNyZXQtMTIzJztcblxuICAgIC8vIFNldHVwIGRlZmF1bHQgbW9ja3MgZm9yIHN1Y2Nlc3NmdWwgcmVhZGluZyBnZW5lcmF0aW9uXG4gICAgc2V0dXBTdWNjZXNzZnVsTW9ja3MoKTtcbiAgfSk7XG5cbiAgY29uc3Qgc2V0dXBTdWNjZXNzZnVsTW9ja3MgPSAoKSA9PiB7XG4gICAgLy8gTW9jayB1c2VyIHByb2ZpbGVcbiAgICBkeW5hbW9Nb2NrXG4gICAgICAub24oR2V0Q29tbWFuZCwge1xuICAgICAgICBUYWJsZU5hbWU6ICd0ZXN0LXVzZXItdGFibGUnLFxuICAgICAgICBLZXk6IHsgdXNlcklkOiBtb2NrVXNlcklkLCBjcmVhdGVkQXQ6ICdQUk9GSUxFJyB9LFxuICAgICAgfSlcbiAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgIEl0ZW06IHtcbiAgICAgICAgICB1c2VySWQ6IG1vY2tVc2VySWQsXG4gICAgICAgICAgcHJvZmlsZToge1xuICAgICAgICAgICAgYmlydGhOYW1lOiAnVGVzdCBVc2VyJyxcbiAgICAgICAgICAgIGJpcnRoRGF0ZTogJzE5OTAtMDEtMDEnLFxuICAgICAgICAgICAgYmlydGhUaW1lOiAnMTI6MDAnLFxuICAgICAgICAgICAgYmlydGhDaXR5OiAnTmV3IFlvcmsnLFxuICAgICAgICAgICAgYmlydGhTdGF0ZTogJ05ZJyxcbiAgICAgICAgICAgIGJpcnRoQ291bnRyeTogJ1VTQScsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgLy8gTW9jayBuYXRhbCBjaGFydFxuICAgIGR5bmFtb01vY2tcbiAgICAgIC5vbihHZXRDb21tYW5kLCB7XG4gICAgICAgIFRhYmxlTmFtZTogJ3Rlc3QtbmF0YWwtY2hhcnQtdGFibGUnLFxuICAgICAgICBLZXk6IHsgdXNlcklkOiBtb2NrVXNlcklkIH0sXG4gICAgICB9KVxuICAgICAgLnJlc29sdmVzKHtcbiAgICAgICAgSXRlbToge1xuICAgICAgICAgIHVzZXJJZDogbW9ja1VzZXJJZCxcbiAgICAgICAgICBwbGFuZXRzOiB7XG4gICAgICAgICAgICBzdW46IHsgc2lnbjogJ0NhcHJpY29ybicsIGRlZ3JlZUluU2lnbjogMTAgfSxcbiAgICAgICAgICAgIG1vb246IHsgc2lnbjogJ0NhbmNlcicsIGRlZ3JlZUluU2lnbjogMTUgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSk7XG5cbiAgICAvLyBNb2NrIFNTTSBwYXJhbWV0ZXJzXG4gICAgc3NtTW9ja1xuICAgICAgLm9uKEdldFBhcmFtZXRlckNvbW1hbmQsIHsgTmFtZTogJy90ZXN0L29wZW5haS1rZXknIH0pXG4gICAgICAucmVzb2x2ZXMoeyBQYXJhbWV0ZXI6IHsgVmFsdWU6ICd0ZXN0LWFwaS1rZXknIH0gfSk7XG4gICAgc3NtTW9ja1xuICAgICAgLm9uKEdldFBhcmFtZXRlckNvbW1hbmQsIHsgTmFtZTogJy90ZXN0L3JlYWRpbmctbW9kZWwnIH0pXG4gICAgICAucmVzb2x2ZXMoeyBQYXJhbWV0ZXI6IHsgVmFsdWU6ICdncHQtNCcgfSB9KTtcbiAgICBzc21Nb2NrXG4gICAgICAub24oR2V0UGFyYW1ldGVyQ29tbWFuZCwgeyBOYW1lOiAnL3Rlc3QvcmVhZGluZy10ZW1wZXJhdHVyZScgfSlcbiAgICAgIC5yZXNvbHZlcyh7IFBhcmFtZXRlcjogeyBWYWx1ZTogJzAuNycgfSB9KTtcbiAgICBzc21Nb2NrXG4gICAgICAub24oR2V0UGFyYW1ldGVyQ29tbWFuZCwgeyBOYW1lOiAnL3Rlc3QvcmVhZGluZy1tYXgtdG9rZW5zJyB9KVxuICAgICAgLnJlc29sdmVzKHsgUGFyYW1ldGVyOiB7IFZhbHVlOiAnMTUwMCcgfSB9KTtcbiAgICBzc21Nb2NrXG4gICAgICAub24oR2V0UGFyYW1ldGVyQ29tbWFuZCwgeyBOYW1lOiAnL3Rlc3Qvc3lzdGVtLXByb21wdC1rZXknIH0pXG4gICAgICAucmVzb2x2ZXMoeyBQYXJhbWV0ZXI6IHsgVmFsdWU6ICdwcm9tcHRzL3Rlc3Qvc3lzdGVtLnR4dCcgfSB9KTtcbiAgICBzc21Nb2NrXG4gICAgICAub24oR2V0UGFyYW1ldGVyQ29tbWFuZCwgeyBOYW1lOiAnL3Rlc3QvdXNlci1wcm9tcHQta2V5JyB9KVxuICAgICAgLnJlc29sdmVzKHsgUGFyYW1ldGVyOiB7IFZhbHVlOiAncHJvbXB0cy90ZXN0L3VzZXIudHh0JyB9IH0pO1xuXG4gICAgLy8gTW9jayBTMyBwcm9tcHRzXG4gICAgY29uc3Qgc3lzdGVtUHJvbXB0ID0gJ1lvdSBhcmUgYW4gZXhwZXJ0IGFzdHJvbG9nZXIuJztcbiAgICBjb25zdCB1c2VyUHJvbXB0VGVtcGxhdGUgPSAnR2VuZXJhdGUgYSByZWFkaW5nIGZvciB7e2JpcnRoTmFtZX19Lic7XG5cbiAgICBzM01vY2tcbiAgICAgIC5vbihHZXRPYmplY3RDb21tYW5kLCB7XG4gICAgICAgIEJ1Y2tldDogJ3Rlc3QtY29uZmlnLWJ1Y2tldCcsXG4gICAgICAgIEtleTogJ3Byb21wdHMvdGVzdC9zeXN0ZW0udHh0JyxcbiAgICAgIH0pXG4gICAgICAucmVzb2x2ZXMoe1xuICAgICAgICBCb2R5OiBSZWFkYWJsZS5mcm9tKFtzeXN0ZW1Qcm9tcHRdKSBhcyBhbnksXG4gICAgICAgIEVUYWc6ICd0ZXN0LWV0YWctMScsXG4gICAgICB9KTtcblxuICAgIHMzTW9ja1xuICAgICAgLm9uKEdldE9iamVjdENvbW1hbmQsIHtcbiAgICAgICAgQnVja2V0OiAndGVzdC1jb25maWctYnVja2V0JyxcbiAgICAgICAgS2V5OiAncHJvbXB0cy90ZXN0L3VzZXIudHh0JyxcbiAgICAgIH0pXG4gICAgICAucmVzb2x2ZXMoe1xuICAgICAgICBCb2R5OiBSZWFkYWJsZS5mcm9tKFt1c2VyUHJvbXB0VGVtcGxhdGVdKSBhcyBhbnksXG4gICAgICAgIEVUYWc6ICd0ZXN0LWV0YWctMicsXG4gICAgICB9KTtcblxuICAgIC8vIE1vY2sgT3BlbkFJIEFQSSByZXNwb25zZVxuICAgIChnbG9iYWwuZmV0Y2ggYXMgamVzdC5Nb2NrKS5tb2NrUmVzb2x2ZWRWYWx1ZSh7XG4gICAgICBvazogdHJ1ZSxcbiAgICAgIGpzb246IGFzeW5jICgpID0+ICh7XG4gICAgICAgIGNob2ljZXM6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICBtZXNzYWdlOiB7XG4gICAgICAgICAgICAgIGNvbnRlbnQ6ICdUaGlzIGlzIHlvdXIgc291bCBibHVlcHJpbnQgcmVhZGluZy4uLicsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICB9KSxcbiAgICB9KTtcblxuICAgIC8vIE1vY2sgRHluYW1vREIgcHV0IGZvciByZWFkaW5nIHJlY29yZFxuICAgIGR5bmFtb01vY2sub24oUHV0Q29tbWFuZCkucmVzb2x2ZXMoe30pO1xuICB9O1xuXG4gIGRlc2NyaWJlKCdJbnRlcm5hbCBpbnZvY2F0aW9uIGZyb20gd2ViaG9vayBoYW5kbGVyJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgc3VjY2Vzc2Z1bGx5IHByb2Nlc3MgaW50ZXJuYWwgaW52b2NhdGlvbiB3aXRoIHdlYmhvb2sgbWV0YWRhdGEnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBtZXRhZGF0YSA9IHtcbiAgICAgICAgc2Vzc2lvbklkOiAnY3NfdGVzdF9zZXNzaW9uXzEyMycsXG4gICAgICAgIGN1c3RvbWVyRW1haWw6ICdjdXN0b21lckBleGFtcGxlLmNvbScsXG4gICAgICAgIGFtb3VudFRvdGFsOiAyOTAwLFxuICAgICAgICBjdXJyZW5jeTogJ3VzZCcsXG4gICAgICAgIHBheW1lbnRJbnRlbnRJZDogJ3BpX3Rlc3RfMTIzJyxcbiAgICAgICAgY2FtcGFpZ246ICdzdW1tZXIyMDI0JyxcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IGludGVybmFsRXZlbnQgPSB7XG4gICAgICAgIHNvdXJjZTogJ3dlYmhvb2snIGFzIGNvbnN0LFxuICAgICAgICB1c2VySWQ6IG1vY2tVc2VySWQsXG4gICAgICAgIGludGVybmFsU2VjcmV0OiAndGVzdC1pbnRlcm5hbC1zZWNyZXQtMTIzJyxcbiAgICAgICAgbWV0YWRhdGEsXG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICAgICAgY2xhaW1zOiB7XG4gICAgICAgICAgICAgIHN1YjogbW9ja1VzZXJJZCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoaW50ZXJuYWxFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkpLnRvSGF2ZVByb3BlcnR5KCdyZWFkaW5nSWQnKTtcbiAgICAgIGV4cGVjdChib2R5KS50b0hhdmVQcm9wZXJ0eSgnbWVzc2FnZScsICdSZWFkaW5nIGdlbmVyYXRlZCBzdWNjZXNzZnVsbHknKTtcblxuICAgICAgLy8gVmVyaWZ5IHJlYWRpbmcgd2FzIHNhdmVkIHdpdGggbWV0YWRhdGFcbiAgICAgIGV4cGVjdChkeW5hbW9Nb2NrKS50b0hhdmVSZWNlaXZlZENvbW1hbmRXaXRoKFB1dENvbW1hbmQsIHtcbiAgICAgICAgVGFibGVOYW1lOiAndGVzdC1yZWFkaW5ncy10YWJsZScsXG4gICAgICAgIEl0ZW06IGV4cGVjdC5vYmplY3RDb250YWluaW5nKHtcbiAgICAgICAgICB1c2VySWQ6IG1vY2tVc2VySWQsXG4gICAgICAgICAgdHlwZTogJ1NvdWwgQmx1ZXByaW50JyxcbiAgICAgICAgICBzdGF0dXM6ICdQcm9jZXNzaW5nJyxcbiAgICAgICAgICBtZXRhZGF0YSxcbiAgICAgICAgfSksXG4gICAgICB9KTtcblxuICAgICAgLy8gVmVyaWZ5IHJlYWRpbmcgd2FzIHVwZGF0ZWQgd2l0aCBjb250ZW50XG4gICAgICBleHBlY3QoZHluYW1vTW9jaykudG9IYXZlUmVjZWl2ZWRDb21tYW5kV2l0aChQdXRDb21tYW5kLCB7XG4gICAgICAgIFRhYmxlTmFtZTogJ3Rlc3QtcmVhZGluZ3MtdGFibGUnLFxuICAgICAgICBJdGVtOiBleHBlY3Qub2JqZWN0Q29udGFpbmluZyh7XG4gICAgICAgICAgdXNlcklkOiBtb2NrVXNlcklkLFxuICAgICAgICAgIHN0YXR1czogJ1JlYWR5JyxcbiAgICAgICAgICBjb250ZW50OiBleHBlY3QuYW55KFN0cmluZyksXG4gICAgICAgICAgbWV0YWRhdGEsXG4gICAgICAgIH0pLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHByb2Nlc3MgaW50ZXJuYWwgaW52b2NhdGlvbiB3aXRob3V0IG1ldGFkYXRhJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgaW50ZXJuYWxFdmVudCA9IHtcbiAgICAgICAgc291cmNlOiAnd2ViaG9vaycgYXMgY29uc3QsXG4gICAgICAgIHVzZXJJZDogbW9ja1VzZXJJZCxcbiAgICAgICAgaW50ZXJuYWxTZWNyZXQ6ICd0ZXN0LWludGVybmFsLXNlY3JldC0xMjMnLFxuICAgICAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgICAgIGF1dGhvcml6ZXI6IHtcbiAgICAgICAgICAgIGNsYWltczoge1xuICAgICAgICAgICAgICBzdWI6IG1vY2tVc2VySWQsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9O1xuXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGludGVybmFsRXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5KS50b0hhdmVQcm9wZXJ0eSgncmVhZGluZ0lkJyk7XG5cbiAgICAgIC8vIFZlcmlmeSByZWFkaW5nIHdhcyBzYXZlZCB3aXRob3V0IG1ldGFkYXRhIGZpZWxkXG4gICAgICBjb25zdCBwdXRDYWxscyA9IGR5bmFtb01vY2suY29tbWFuZENhbGxzKFB1dENvbW1hbmQpO1xuICAgICAgY29uc3QgZmlyc3RQdXRDYWxsID0gcHV0Q2FsbHNbMF07XG4gICAgICBleHBlY3QoZmlyc3RQdXRDYWxsLmFyZ3NbMF0uaW5wdXQuSXRlbSkubm90LnRvSGF2ZVByb3BlcnR5KCdtZXRhZGF0YScpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBwcm9jZXNzIGludGVybmFsIGludm9jYXRpb24gd2l0aCBlbXB0eSBtZXRhZGF0YScsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGludGVybmFsRXZlbnQgPSB7XG4gICAgICAgIHNvdXJjZTogJ3dlYmhvb2snIGFzIGNvbnN0LFxuICAgICAgICB1c2VySWQ6IG1vY2tVc2VySWQsXG4gICAgICAgIGludGVybmFsU2VjcmV0OiAndGVzdC1pbnRlcm5hbC1zZWNyZXQtMTIzJyxcbiAgICAgICAgbWV0YWRhdGE6IHt9LFxuICAgICAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgICAgIGF1dGhvcml6ZXI6IHtcbiAgICAgICAgICAgIGNsYWltczoge1xuICAgICAgICAgICAgICBzdWI6IG1vY2tVc2VySWQsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9O1xuXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGludGVybmFsRXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5KS50b0hhdmVQcm9wZXJ0eSgncmVhZGluZ0lkJyk7XG5cbiAgICAgIC8vIFZlcmlmeSByZWFkaW5nIHdhcyBzYXZlZCB3aXRob3V0IG1ldGFkYXRhIGZpZWxkIChlbXB0eSBvYmplY3Qgbm90IGluY2x1ZGVkKVxuICAgICAgY29uc3QgcHV0Q2FsbHMgPSBkeW5hbW9Nb2NrLmNvbW1hbmRDYWxscyhQdXRDb21tYW5kKTtcbiAgICAgIGNvbnN0IGZpcnN0UHV0Q2FsbCA9IHB1dENhbGxzWzBdO1xuICAgICAgZXhwZWN0KGZpcnN0UHV0Q2FsbC5hcmdzWzBdLmlucHV0Lkl0ZW0pLm5vdC50b0hhdmVQcm9wZXJ0eSgnbWV0YWRhdGEnKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIG1pc3NpbmcgdXNlciBwcm9maWxlIGZvciBpbnRlcm5hbCBpbnZvY2F0aW9uJywgYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gTW9jayBtaXNzaW5nIHVzZXIgcHJvZmlsZVxuICAgICAgZHluYW1vTW9ja1xuICAgICAgICAub24oR2V0Q29tbWFuZCwge1xuICAgICAgICAgIFRhYmxlTmFtZTogJ3Rlc3QtdXNlci10YWJsZScsXG4gICAgICAgICAgS2V5OiB7IHVzZXJJZDogbW9ja1VzZXJJZCwgY3JlYXRlZEF0OiAnUFJPRklMRScgfSxcbiAgICAgICAgfSlcbiAgICAgICAgLnJlc29sdmVzKHsgSXRlbTogdW5kZWZpbmVkIH0pO1xuXG4gICAgICBjb25zdCBpbnRlcm5hbEV2ZW50ID0ge1xuICAgICAgICBzb3VyY2U6ICd3ZWJob29rJyBhcyBjb25zdCxcbiAgICAgICAgdXNlcklkOiBtb2NrVXNlcklkLFxuICAgICAgICBpbnRlcm5hbFNlY3JldDogJ3Rlc3QtaW50ZXJuYWwtc2VjcmV0LTEyMycsXG4gICAgICAgIG1ldGFkYXRhOiB7IHNlc3Npb25JZDogJ2NzX3Rlc3RfMTIzJyB9LFxuICAgICAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgICAgIGF1dGhvcml6ZXI6IHtcbiAgICAgICAgICAgIGNsYWltczoge1xuICAgICAgICAgICAgICBzdWI6IG1vY2tVc2VySWQsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9O1xuXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGludGVybmFsRXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoNDA0KTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5Lm1lc3NhZ2UpLnRvQmUoJ1VzZXIgcHJvZmlsZSBub3QgZm91bmQnKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIG1pc3NpbmcgbmF0YWwgY2hhcnQgZm9yIGludGVybmFsIGludm9jYXRpb24nLCBhc3luYyAoKSA9PiB7XG4gICAgICAvLyBNb2NrIG1pc3NpbmcgbmF0YWwgY2hhcnRcbiAgICAgIGR5bmFtb01vY2tcbiAgICAgICAgLm9uKEdldENvbW1hbmQsIHtcbiAgICAgICAgICBUYWJsZU5hbWU6ICd0ZXN0LW5hdGFsLWNoYXJ0LXRhYmxlJyxcbiAgICAgICAgICBLZXk6IHsgdXNlcklkOiBtb2NrVXNlcklkIH0sXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7IEl0ZW06IHVuZGVmaW5lZCB9KTtcblxuICAgICAgY29uc3QgaW50ZXJuYWxFdmVudCA9IHtcbiAgICAgICAgc291cmNlOiAnd2ViaG9vaycgYXMgY29uc3QsXG4gICAgICAgIHVzZXJJZDogbW9ja1VzZXJJZCxcbiAgICAgICAgaW50ZXJuYWxTZWNyZXQ6ICd0ZXN0LWludGVybmFsLXNlY3JldC0xMjMnLFxuICAgICAgICBtZXRhZGF0YTogeyBzZXNzaW9uSWQ6ICdjc190ZXN0XzEyMycgfSxcbiAgICAgICAgcmVxdWVzdENvbnRleHQ6IHtcbiAgICAgICAgICBhdXRob3JpemVyOiB7XG4gICAgICAgICAgICBjbGFpbXM6IHtcbiAgICAgICAgICAgICAgc3ViOiBtb2NrVXNlcklkLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfTtcblxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgaGFuZGxlcihpbnRlcm5hbEV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDQwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5tZXNzYWdlKS50b0JlKCdOYXRhbCBjaGFydCBub3QgZ2VuZXJhdGVkLiBQbGVhc2UgY29tcGxldGUgeW91ciBwcm9maWxlIGZpcnN0LicpO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnVHlwZSBndWFyZCBmb3IgaW50ZXJuYWwgaW52b2NhdGlvbiBkZXRlY3Rpb24nLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBjb3JyZWN0bHkgaWRlbnRpZnkgaW50ZXJuYWwgaW52b2NhdGlvbiBldmVudHMnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBpbnRlcm5hbEV2ZW50ID0ge1xuICAgICAgICBzb3VyY2U6ICd3ZWJob29rJyBhcyBjb25zdCxcbiAgICAgICAgdXNlcklkOiBtb2NrVXNlcklkLFxuICAgICAgICBpbnRlcm5hbFNlY3JldDogJ3Rlc3QtaW50ZXJuYWwtc2VjcmV0LTEyMycsXG4gICAgICAgIG1ldGFkYXRhOiB7IHRlc3Q6ICdkYXRhJyB9LFxuICAgICAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgICAgIGF1dGhvcml6ZXI6IHtcbiAgICAgICAgICAgIGNsYWltczoge1xuICAgICAgICAgICAgICBzdWI6IG1vY2tVc2VySWQsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9O1xuXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGludGVybmFsRXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIC8vIFNob3VsZCBub3QgZ28gdGhyb3VnaCBBUEkgR2F0ZXdheSBhdXRob3JpemF0aW9uIGNoZWNrc1xuICAgICAgZXhwZWN0KHJlc3VsdC5oZWFkZXJzKS50b0hhdmVQcm9wZXJ0eSgnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJywgJyonKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgY29ycmVjdGx5IGlkZW50aWZ5IEFQSSBHYXRld2F5IGV2ZW50cycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGFwaUdhdGV3YXlFdmVudDogUGFydGlhbDxBUElHYXRld2F5UHJveHlFdmVudD4gPSB7XG4gICAgICAgIHBhdGhQYXJhbWV0ZXJzOiB7IHVzZXJJZDogbW9ja1VzZXJJZCB9LFxuICAgICAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgICAgIGF1dGhvcml6ZXI6IHtcbiAgICAgICAgICAgIGNsYWltczogeyBzdWI6IG1vY2tVc2VySWQgfSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICAgIH0gYXMgYW55LFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IG1ldGFkYXRhOiB7IHNvdXJjZTogJ3dlYicgfSB9KSxcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoYXBpR2F0ZXdheUV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keSkudG9IYXZlUHJvcGVydHkoJ3JlYWRpbmdJZCcpO1xuXG4gICAgICAvLyBWZXJpZnkgbWV0YWRhdGEgZnJvbSByZXF1ZXN0IGJvZHkgd2FzIHVzZWRcbiAgICAgIGV4cGVjdChkeW5hbW9Nb2NrKS50b0hhdmVSZWNlaXZlZENvbW1hbmRXaXRoKFB1dENvbW1hbmQsIHtcbiAgICAgICAgVGFibGVOYW1lOiAndGVzdC1yZWFkaW5ncy10YWJsZScsXG4gICAgICAgIEl0ZW06IGV4cGVjdC5vYmplY3RDb250YWluaW5nKHtcbiAgICAgICAgICBtZXRhZGF0YTogeyBzb3VyY2U6ICd3ZWInIH0sXG4gICAgICAgIH0pLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHJlamVjdCBldmVudHMgd2l0aCB3cm9uZyBzb3VyY2UgdmFsdWUnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBpbnZhbGlkRXZlbnQgPSB7XG4gICAgICAgIHNvdXJjZTogJ2ludmFsaWQnLFxuICAgICAgICB1c2VySWQ6IG1vY2tVc2VySWQsXG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICAgICAgY2xhaW1zOiB7XG4gICAgICAgICAgICAgIHN1YjogJ2RpZmZlcmVudC11c2VyJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH07XG5cbiAgICAgIC8vIFRoaXMgc2hvdWxkIGJlIHRyZWF0ZWQgYXMgQVBJIEdhdGV3YXkgZXZlbnQgYW5kIGZhaWwgYXV0aG9yaXphdGlvblxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgaGFuZGxlcihpbnZhbGlkRXZlbnQgYXMgdW5rbm93biBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSg0MDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkubWVzc2FnZSkudG9CZSgndXNlcklkIGlzIHJlcXVpcmVkJyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHJlamVjdCBpbnRlcm5hbCBldmVudHMgbWlzc2luZyB1c2VySWQnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBpbnZhbGlkRXZlbnQgPSB7XG4gICAgICAgIHNvdXJjZTogJ3dlYmhvb2snIGFzIGNvbnN0LFxuICAgICAgICBtZXRhZGF0YTogeyB0ZXN0OiAnZGF0YScgfSxcbiAgICAgICAgcmVxdWVzdENvbnRleHQ6IHtcbiAgICAgICAgICBhdXRob3JpemVyOiB7XG4gICAgICAgICAgICBjbGFpbXM6IHtcbiAgICAgICAgICAgICAgc3ViOiAndXNlci0xMjMnLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfTtcblxuICAgICAgLy8gTWlzc2luZyB1c2VySWQgc2hvdWxkIGZhaWwgdHlwZSBndWFyZFxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgaGFuZGxlcihpbnZhbGlkRXZlbnQgYXMgdW5rbm93biBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSg0MDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkubWVzc2FnZSkudG9CZSgndXNlcklkIGlzIHJlcXVpcmVkJyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBldmVudHMgd2l0aCBwYXRoUGFyYW1ldGVycyBhcyBpbnRlcm5hbCBpZiBzb3VyY2UgaXMgd2ViaG9vaycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGh5YnJpZEV2ZW50ID0ge1xuICAgICAgICBzb3VyY2U6ICd3ZWJob29rJyBhcyBjb25zdCxcbiAgICAgICAgdXNlcklkOiBtb2NrVXNlcklkLFxuICAgICAgICBpbnRlcm5hbFNlY3JldDogJ3Rlc3QtaW50ZXJuYWwtc2VjcmV0LTEyMycsXG4gICAgICAgIHBhdGhQYXJhbWV0ZXJzOiB7IHVzZXJJZDogJ3Nob3VsZC1iZS1pZ25vcmVkJyB9LCAvLyBwYXRoUGFyYW1ldGVycyBwcmVzZW5jZSBmYWlscyB0eXBlIGd1YXJkXG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICAgICAgY2xhaW1zOiB7XG4gICAgICAgICAgICAgIHN1YjogbW9ja1VzZXJJZCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH07XG5cbiAgICAgIC8vIHBhdGhQYXJhbWV0ZXJzIHByZXNlbmNlIGNhdXNlcyB0eXBlIGd1YXJkIHRvIGZhaWwsIHRyZWF0aW5nIGFzIEFQSSBHYXRld2F5IGV2ZW50XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGh5YnJpZEV2ZW50IGFzIHVua25vd24gYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICAvLyBTaG91bGQgZmFpbCBhdXRob3JpemF0aW9uIHNpbmNlIHBhdGggdXNlcklkIGRvZXNuJ3QgbWF0Y2ggY2xhaW1zXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoNDAzKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ01ldGFkYXRhIGhhbmRsaW5nIGluIHJlYWRpbmcgZ2VuZXJhdGlvbicsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIHByZXNlcnZlIGFsbCBtZXRhZGF0YSB0eXBlcyBpbiByZWFkaW5nIHJlY29yZCcsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGNvbXBsZXhNZXRhZGF0YSA9IHtcbiAgICAgICAgc2Vzc2lvbklkOiAnY3NfdGVzdF8xMjMnLFxuICAgICAgICBjdXN0b21lckVtYWlsOiAndGVzdEBleGFtcGxlLmNvbScsXG4gICAgICAgIGFtb3VudFRvdGFsOiAyOTAwLFxuICAgICAgICBjdXJyZW5jeTogJ3VzZCcsXG4gICAgICAgIGlzU3Vic2NyaXB0aW9uOiB0cnVlLFxuICAgICAgICBzdWJzY3JpcHRpb25JdGVtczogMyxcbiAgICAgICAgcHJvbW9Db2RlOiAnU0FWRTIwJyxcbiAgICAgICAgcmVmZXJyZXI6ICduZXdzbGV0dGVyJyxcbiAgICAgICAgY3VzdG9tRmllbGQ6ICdjdXN0b20tdmFsdWUnLFxuICAgICAgfTtcblxuICAgICAgY29uc3QgaW50ZXJuYWxFdmVudCA9IHtcbiAgICAgICAgc291cmNlOiAnd2ViaG9vaycgYXMgY29uc3QsXG4gICAgICAgIHVzZXJJZDogbW9ja1VzZXJJZCxcbiAgICAgICAgaW50ZXJuYWxTZWNyZXQ6ICd0ZXN0LWludGVybmFsLXNlY3JldC0xMjMnLFxuICAgICAgICBtZXRhZGF0YTogY29tcGxleE1ldGFkYXRhLFxuICAgICAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgICAgIGF1dGhvcml6ZXI6IHtcbiAgICAgICAgICAgIGNsYWltczoge1xuICAgICAgICAgICAgICBzdWI6IG1vY2tVc2VySWQsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9O1xuXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGludGVybmFsRXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcblxuICAgICAgLy8gVmVyaWZ5IGFsbCBtZXRhZGF0YSB3YXMgcHJlc2VydmVkXG4gICAgICBleHBlY3QoZHluYW1vTW9jaykudG9IYXZlUmVjZWl2ZWRDb21tYW5kV2l0aChQdXRDb21tYW5kLCB7XG4gICAgICAgIFRhYmxlTmFtZTogJ3Rlc3QtcmVhZGluZ3MtdGFibGUnLFxuICAgICAgICBJdGVtOiBleHBlY3Qub2JqZWN0Q29udGFpbmluZyh7XG4gICAgICAgICAgbWV0YWRhdGE6IGNvbXBsZXhNZXRhZGF0YSxcbiAgICAgICAgfSksXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIG1ldGFkYXRhIGZyb20gQVBJIEdhdGV3YXkgcmVxdWVzdCBib2R5JywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgYXBpTWV0YWRhdGEgPSB7XG4gICAgICAgIHNvdXJjZTogJ21vYmlsZS1hcHAnLFxuICAgICAgICB2ZXJzaW9uOiAnMS4yLjMnLFxuICAgICAgICBkZXZpY2VJZDogJ2RldmljZS0xMjMnLFxuICAgICAgfTtcblxuICAgICAgY29uc3QgYXBpR2F0ZXdheUV2ZW50OiBQYXJ0aWFsPEFQSUdhdGV3YXlQcm94eUV2ZW50PiA9IHtcbiAgICAgICAgcGF0aFBhcmFtZXRlcnM6IHsgdXNlcklkOiBtb2NrVXNlcklkIH0sXG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICAgICAgY2xhaW1zOiB7IHN1YjogbW9ja1VzZXJJZCB9LFxuICAgICAgICAgIH0sXG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgICAgfSBhcyBhbnksXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgbWV0YWRhdGE6IGFwaU1ldGFkYXRhIH0pLFxuICAgICAgfTtcblxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgaGFuZGxlcihhcGlHYXRld2F5RXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcblxuICAgICAgLy8gVmVyaWZ5IEFQSSBtZXRhZGF0YSB3YXMgc2F2ZWRcbiAgICAgIGV4cGVjdChkeW5hbW9Nb2NrKS50b0hhdmVSZWNlaXZlZENvbW1hbmRXaXRoKFB1dENvbW1hbmQsIHtcbiAgICAgICAgVGFibGVOYW1lOiAndGVzdC1yZWFkaW5ncy10YWJsZScsXG4gICAgICAgIEl0ZW06IGV4cGVjdC5vYmplY3RDb250YWluaW5nKHtcbiAgICAgICAgICBtZXRhZGF0YTogYXBpTWV0YWRhdGEsXG4gICAgICAgIH0pLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBpbnZhbGlkIEpTT04gaW4gQVBJIEdhdGV3YXkgYm9keSBncmFjZWZ1bGx5JywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgYXBpR2F0ZXdheUV2ZW50OiBQYXJ0aWFsPEFQSUdhdGV3YXlQcm94eUV2ZW50PiA9IHtcbiAgICAgICAgcGF0aFBhcmFtZXRlcnM6IHsgdXNlcklkOiBtb2NrVXNlcklkIH0sXG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICAgICAgY2xhaW1zOiB7IHN1YjogbW9ja1VzZXJJZCB9LFxuICAgICAgICAgIH0sXG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgICAgfSBhcyBhbnksXG4gICAgICAgIGJvZHk6ICdpbnZhbGlkIGpzb24geycsXG4gICAgICB9O1xuXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGFwaUdhdGV3YXlFdmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuXG4gICAgICAvLyBTaG91bGQgcHJvY2VlZCB3aXRob3V0IG1ldGFkYXRhXG4gICAgICBjb25zdCBwdXRDYWxscyA9IGR5bmFtb01vY2suY29tbWFuZENhbGxzKFB1dENvbW1hbmQpO1xuICAgICAgY29uc3QgZmlyc3RQdXRDYWxsID0gcHV0Q2FsbHNbMF07XG4gICAgICBleHBlY3QoZmlyc3RQdXRDYWxsLmFyZ3NbMF0uaW5wdXQuSXRlbSkubm90LnRvSGF2ZVByb3BlcnR5KCdtZXRhZGF0YScpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgbnVsbCBib2R5IGluIEFQSSBHYXRld2F5IGV2ZW50JywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgYXBpR2F0ZXdheUV2ZW50OiBQYXJ0aWFsPEFQSUdhdGV3YXlQcm94eUV2ZW50PiA9IHtcbiAgICAgICAgcGF0aFBhcmFtZXRlcnM6IHsgdXNlcklkOiBtb2NrVXNlcklkIH0sXG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICAgICAgY2xhaW1zOiB7IHN1YjogbW9ja1VzZXJJZCB9LFxuICAgICAgICAgIH0sXG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgICAgfSBhcyBhbnksXG4gICAgICAgIGJvZHk6IG51bGwsXG4gICAgICB9O1xuXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGFwaUdhdGV3YXlFdmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuXG4gICAgICAvLyBTaG91bGQgcHJvY2VlZCB3aXRob3V0IG1ldGFkYXRhXG4gICAgICBjb25zdCBwdXRDYWxscyA9IGR5bmFtb01vY2suY29tbWFuZENhbGxzKFB1dENvbW1hbmQpO1xuICAgICAgY29uc3QgZmlyc3RQdXRDYWxsID0gcHV0Q2FsbHNbMF07XG4gICAgICBleHBlY3QoZmlyc3RQdXRDYWxsLmFyZ3NbMF0uaW5wdXQuSXRlbSkubm90LnRvSGF2ZVByb3BlcnR5KCdtZXRhZGF0YScpO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnRXJyb3IgaGFuZGxpbmcgaW4gaW50ZXJuYWwgaW52b2NhdGlvbicsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBPcGVuQUkgQVBJIGZhaWx1cmUgZm9yIGludGVybmFsIGludm9jYXRpb24nLCBhc3luYyAoKSA9PiB7XG4gICAgICAvLyBNb2NrIE9wZW5BSSBBUEkgZmFpbHVyZVxuICAgICAgKGdsb2JhbC5mZXRjaCBhcyBqZXN0Lk1vY2spLm1vY2tSZWplY3RlZFZhbHVlKG5ldyBFcnJvcignT3BlbkFJIEFQSSBlcnJvcicpKTtcblxuICAgICAgY29uc3QgaW50ZXJuYWxFdmVudCA9IHtcbiAgICAgICAgc291cmNlOiAnd2ViaG9vaycgYXMgY29uc3QsXG4gICAgICAgIHVzZXJJZDogbW9ja1VzZXJJZCxcbiAgICAgICAgaW50ZXJuYWxTZWNyZXQ6ICd0ZXN0LWludGVybmFsLXNlY3JldC0xMjMnLFxuICAgICAgICBtZXRhZGF0YTogeyBzZXNzaW9uSWQ6ICdjc190ZXN0XzEyMycgfSxcbiAgICAgICAgcmVxdWVzdENvbnRleHQ6IHtcbiAgICAgICAgICBhdXRob3JpemVyOiB7XG4gICAgICAgICAgICBjbGFpbXM6IHtcbiAgICAgICAgICAgICAgc3ViOiBtb2NrVXNlcklkLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfTtcblxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgaGFuZGxlcihpbnRlcm5hbEV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDUwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5tZXNzYWdlKS50b0JlKFxuICAgICAgICBcIldlJ3JlIHNvcnJ5LCBidXQgd2UgY291bGRuJ3QgZ2VuZXJhdGUgeW91ciByZWFkaW5nIGF0IHRoaXMgdGltZS4gUGxlYXNlIHRyeSBhZ2FpbiBsYXRlci5cIixcbiAgICAgICk7XG5cbiAgICAgIC8vIFZlcmlmeSByZWFkaW5nIHdhcyBtYXJrZWQgYXMgZmFpbGVkXG4gICAgICBleHBlY3QoZHluYW1vTW9jaykudG9IYXZlUmVjZWl2ZWRDb21tYW5kV2l0aChQdXRDb21tYW5kLCB7XG4gICAgICAgIFRhYmxlTmFtZTogJ3Rlc3QtcmVhZGluZ3MtdGFibGUnLFxuICAgICAgICBJdGVtOiBleHBlY3Qub2JqZWN0Q29udGFpbmluZyh7XG4gICAgICAgICAgc3RhdHVzOiAnRmFpbGVkJyxcbiAgICAgICAgICBlcnJvcjogZXhwZWN0LmFueShTdHJpbmcpLFxuICAgICAgICB9KSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgRHluYW1vREIgZXJyb3JzIGZvciBpbnRlcm5hbCBpbnZvY2F0aW9uJywgYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gTW9jayBEeW5hbW9EQiBlcnJvciBvbiBpbml0aWFsIHNhdmVcbiAgICAgIGR5bmFtb01vY2sub24oUHV0Q29tbWFuZCkucmVqZWN0cyhuZXcgRXJyb3IoJ0R5bmFtb0RCIGVycm9yJykpO1xuXG4gICAgICBjb25zdCBpbnRlcm5hbEV2ZW50ID0ge1xuICAgICAgICBzb3VyY2U6ICd3ZWJob29rJyBhcyBjb25zdCxcbiAgICAgICAgdXNlcklkOiBtb2NrVXNlcklkLFxuICAgICAgICBpbnRlcm5hbFNlY3JldDogJ3Rlc3QtaW50ZXJuYWwtc2VjcmV0LTEyMycsXG4gICAgICAgIG1ldGFkYXRhOiB7IHNlc3Npb25JZDogJ2NzX3Rlc3RfMTIzJyB9LFxuICAgICAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgICAgIGF1dGhvcml6ZXI6IHtcbiAgICAgICAgICAgIGNsYWltczoge1xuICAgICAgICAgICAgICBzdWI6IG1vY2tVc2VySWQsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9O1xuXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGludGVybmFsRXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoNTAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5Lm1lc3NhZ2UpLnRvQ29udGFpbihcImNvdWxkbid0IGdlbmVyYXRlIHlvdXIgcmVhZGluZ1wiKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIFMzIHByb21wdCBmZXRjaCBlcnJvcnMgZm9yIGludGVybmFsIGludm9jYXRpb24nLCBhc3luYyAoKSA9PiB7XG4gICAgICAvLyBNb2NrIFMzIGVycm9yXG4gICAgICBzM01vY2sub24oR2V0T2JqZWN0Q29tbWFuZCkucmVqZWN0cyhuZXcgRXJyb3IoJ1MzIGFjY2VzcyBkZW5pZWQnKSk7XG5cbiAgICAgIGNvbnN0IGludGVybmFsRXZlbnQgPSB7XG4gICAgICAgIHNvdXJjZTogJ3dlYmhvb2snIGFzIGNvbnN0LFxuICAgICAgICB1c2VySWQ6IG1vY2tVc2VySWQsXG4gICAgICAgIGludGVybmFsU2VjcmV0OiAndGVzdC1pbnRlcm5hbC1zZWNyZXQtMTIzJyxcbiAgICAgICAgbWV0YWRhdGE6IHsgc2Vzc2lvbklkOiAnY3NfdGVzdF8xMjMnIH0sXG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICAgICAgY2xhaW1zOiB7XG4gICAgICAgICAgICAgIHN1YjogbW9ja1VzZXJJZCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoaW50ZXJuYWxFdmVudCk7XG5cbiAgICAgIC8vIFNob3VsZCBmYWxsIGJhY2sgdG8gZGVmYXVsdCBwcm9tcHRzIGFuZCBzdWNjZWVkXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5KS50b0hhdmVQcm9wZXJ0eSgncmVhZGluZ0lkJyk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdBdXRob3JpemF0aW9uIGNvbnRleHQgaGFuZGxpbmcnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCB1c2UgcHJvdmlkZWQgcmVxdWVzdENvbnRleHQgZm9yIGludGVybmFsIGludm9jYXRpb24nLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBpbnRlcm5hbEV2ZW50ID0ge1xuICAgICAgICBzb3VyY2U6ICd3ZWJob29rJyBhcyBjb25zdCxcbiAgICAgICAgdXNlcklkOiBtb2NrVXNlcklkLFxuICAgICAgICBpbnRlcm5hbFNlY3JldDogJ3Rlc3QtaW50ZXJuYWwtc2VjcmV0LTEyMycsXG4gICAgICAgIG1ldGFkYXRhOiB7IHNlc3Npb25JZDogJ2NzX3Rlc3RfMTIzJyB9LFxuICAgICAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgICAgIGF1dGhvcml6ZXI6IHtcbiAgICAgICAgICAgIGNsYWltczoge1xuICAgICAgICAgICAgICBzdWI6IG1vY2tVc2VySWQsXG4gICAgICAgICAgICAgIGVtYWlsOiAnd2ViaG9va0BleGFtcGxlLmNvbScsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9O1xuXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGludGVybmFsRXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIC8vIFRoZSBhdXRob3JpemF0aW9uIGNvbnRleHQgaXMgdXNlZCBidXQgbm90IHZhbGlkYXRlZCBmb3IgaW50ZXJuYWwgaW52b2NhdGlvbnNcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgd29yayB3aXRob3V0IHJlcXVlc3RDb250ZXh0IGZvciBpbnRlcm5hbCBpbnZvY2F0aW9uJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgaW50ZXJuYWxFdmVudCA9IHtcbiAgICAgICAgc291cmNlOiAnd2ViaG9vaycgYXMgY29uc3QsXG4gICAgICAgIHVzZXJJZDogbW9ja1VzZXJJZCxcbiAgICAgICAgaW50ZXJuYWxTZWNyZXQ6ICd0ZXN0LWludGVybmFsLXNlY3JldC0xMjMnLFxuICAgICAgICBtZXRhZGF0YTogeyBzZXNzaW9uSWQ6ICdjc190ZXN0XzEyMycgfSxcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoaW50ZXJuYWxFdmVudCk7XG5cbiAgICAgIC8vIFNob3VsZCBzdGlsbCBzdWNjZWVkIGFzIGludGVybmFsIGludm9jYXRpb25zIGRvbid0IHJlcXVpcmUgYXV0aCBjb250ZXh0XG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICB9KTtcbiAgfSk7XG59KTtcbiJdfQ==