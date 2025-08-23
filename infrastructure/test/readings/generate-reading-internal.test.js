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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            Body: stream_1.Readable.from([systemPrompt]),
            ETag: 'test-etag-1',
        });
        s3Mock
            .on(client_s3_1.GetObjectCommand, {
            Bucket: 'test-config-bucket',
            Key: 'prompts/test/user.txt',
        })
            .resolves({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                requestContext: {
                    authorizer: {
                        claims: { sub: mockUserId },
                    },
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
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                requestContext: {
                    authorizer: {
                        claims: { sub: mockUserId },
                    },
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
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                requestContext: {
                    authorizer: {
                        claims: { sub: mockUserId },
                    },
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
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                requestContext: {
                    authorizer: {
                        claims: { sub: mockUserId },
                    },
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGUtcmVhZGluZy1pbnRlcm5hbC50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZ2VuZXJhdGUtcmVhZGluZy1pbnRlcm5hbC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsNkVBQWlFO0FBRWpFLHdEQUF1RjtBQUN2RixvREFBcUU7QUFDckUsa0RBQWdFO0FBQ2hFLDZEQUFpRDtBQUNqRCxtQ0FBa0M7QUFFbEMseUNBQXlDO0FBQ3pDLE1BQU0sVUFBVSxHQUFHLElBQUEsZ0NBQVUsRUFBQyxxQ0FBc0IsQ0FBQyxDQUFDO0FBQ3RELE1BQU0sT0FBTyxHQUFHLElBQUEsZ0NBQVUsRUFBQyxzQkFBUyxDQUFDLENBQUM7QUFDdEMsTUFBTSxNQUFNLEdBQUcsSUFBQSxnQ0FBVSxFQUFDLG9CQUFRLENBQUMsQ0FBQztBQUVwQyxrQ0FBa0M7QUFDbEMsTUFBTSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsRUFBRSxFQUFFLENBQUM7QUFFekIsMERBQTBEO0FBQzFELElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztBQUVwQixRQUFRLENBQUMsK0NBQStDLEVBQUUsR0FBRyxFQUFFO0lBQzdELE1BQU0sVUFBVSxHQUFHLGVBQWUsQ0FBQztJQUVuQyxVQUFVLENBQUMsR0FBRyxFQUFFO1FBQ2QsaURBQWlEO1FBQ2pELElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUVwQixVQUFVLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDbkIsT0FBTyxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ2hCLE1BQU0sQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNkLE1BQU0sQ0FBQyxLQUFtQixDQUFDLFNBQVMsRUFBRSxDQUFDO1FBRXhDLHFDQUFxQztRQUNyQyxPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFtQixHQUFHLHFCQUFxQixDQUFDO1FBQ3hELE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZSxHQUFHLGlCQUFpQixDQUFDO1FBQ2hELE9BQU8sQ0FBQyxHQUFHLENBQUMsc0JBQXNCLEdBQUcsd0JBQXdCLENBQUM7UUFDOUQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsR0FBRyxvQkFBb0IsQ0FBQztRQUN0RCxPQUFPLENBQUMsR0FBRyxDQUFDLDZCQUE2QixHQUFHLGtCQUFrQixDQUFDO1FBQy9ELE9BQU8sQ0FBQyxHQUFHLENBQUMsNEJBQTRCLEdBQUcscUJBQXFCLENBQUM7UUFDakUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQ0FBa0MsR0FBRywyQkFBMkIsQ0FBQztRQUM3RSxPQUFPLENBQUMsR0FBRyxDQUFDLGlDQUFpQyxHQUFHLDBCQUEwQixDQUFDO1FBQzNFLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0NBQWtDLEdBQUcseUJBQXlCLENBQUM7UUFDM0UsT0FBTyxDQUFDLEdBQUcsQ0FBQyxnQ0FBZ0MsR0FBRyx1QkFBdUIsQ0FBQztRQUN2RSxPQUFPLENBQUMsR0FBRyxDQUFDLDBCQUEwQixHQUFHLDBCQUEwQixDQUFDO1FBRXBFLHdEQUF3RDtRQUN4RCxvQkFBb0IsRUFBRSxDQUFDO0lBQ3pCLENBQUMsQ0FBQyxDQUFDO0lBRUgsTUFBTSxvQkFBb0IsR0FBRyxHQUFHLEVBQUU7UUFDaEMsb0JBQW9CO1FBQ3BCLFVBQVU7YUFDUCxFQUFFLENBQUMseUJBQVUsRUFBRTtZQUNkLFNBQVMsRUFBRSxpQkFBaUI7WUFDNUIsR0FBRyxFQUFFLEVBQUUsTUFBTSxFQUFFLFVBQVUsRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFO1NBQ2xELENBQUM7YUFDRCxRQUFRLENBQUM7WUFDUixJQUFJLEVBQUU7Z0JBQ0osTUFBTSxFQUFFLFVBQVU7Z0JBQ2xCLE9BQU8sRUFBRTtvQkFDUCxTQUFTLEVBQUUsV0FBVztvQkFDdEIsU0FBUyxFQUFFLFlBQVk7b0JBQ3ZCLFNBQVMsRUFBRSxPQUFPO29CQUNsQixTQUFTLEVBQUUsVUFBVTtvQkFDckIsVUFBVSxFQUFFLElBQUk7b0JBQ2hCLFlBQVksRUFBRSxLQUFLO2lCQUNwQjthQUNGO1NBQ0YsQ0FBQyxDQUFDO1FBRUwsbUJBQW1CO1FBQ25CLFVBQVU7YUFDUCxFQUFFLENBQUMseUJBQVUsRUFBRTtZQUNkLFNBQVMsRUFBRSx3QkFBd0I7WUFDbkMsR0FBRyxFQUFFLEVBQUUsTUFBTSxFQUFFLFVBQVUsRUFBRTtTQUM1QixDQUFDO2FBQ0QsUUFBUSxDQUFDO1lBQ1IsSUFBSSxFQUFFO2dCQUNKLE1BQU0sRUFBRSxVQUFVO2dCQUNsQixPQUFPLEVBQUU7b0JBQ1AsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLFdBQVcsRUFBRSxZQUFZLEVBQUUsRUFBRSxFQUFFO29CQUM1QyxJQUFJLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLFlBQVksRUFBRSxFQUFFLEVBQUU7aUJBQzNDO2FBQ0Y7U0FDRixDQUFDLENBQUM7UUFFTCxzQkFBc0I7UUFDdEIsT0FBTzthQUNKLEVBQUUsQ0FBQyxnQ0FBbUIsRUFBRSxFQUFFLElBQUksRUFBRSxrQkFBa0IsRUFBRSxDQUFDO2FBQ3JELFFBQVEsQ0FBQyxFQUFFLFNBQVMsRUFBRSxFQUFFLEtBQUssRUFBRSxjQUFjLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDdEQsT0FBTzthQUNKLEVBQUUsQ0FBQyxnQ0FBbUIsRUFBRSxFQUFFLElBQUksRUFBRSxxQkFBcUIsRUFBRSxDQUFDO2FBQ3hELFFBQVEsQ0FBQyxFQUFFLFNBQVMsRUFBRSxFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDL0MsT0FBTzthQUNKLEVBQUUsQ0FBQyxnQ0FBbUIsRUFBRSxFQUFFLElBQUksRUFBRSwyQkFBMkIsRUFBRSxDQUFDO2FBQzlELFFBQVEsQ0FBQyxFQUFFLFNBQVMsRUFBRSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDN0MsT0FBTzthQUNKLEVBQUUsQ0FBQyxnQ0FBbUIsRUFBRSxFQUFFLElBQUksRUFBRSwwQkFBMEIsRUFBRSxDQUFDO2FBQzdELFFBQVEsQ0FBQyxFQUFFLFNBQVMsRUFBRSxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDOUMsT0FBTzthQUNKLEVBQUUsQ0FBQyxnQ0FBbUIsRUFBRSxFQUFFLElBQUksRUFBRSx5QkFBeUIsRUFBRSxDQUFDO2FBQzVELFFBQVEsQ0FBQyxFQUFFLFNBQVMsRUFBRSxFQUFFLEtBQUssRUFBRSx5QkFBeUIsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNqRSxPQUFPO2FBQ0osRUFBRSxDQUFDLGdDQUFtQixFQUFFLEVBQUUsSUFBSSxFQUFFLHVCQUF1QixFQUFFLENBQUM7YUFDMUQsUUFBUSxDQUFDLEVBQUUsU0FBUyxFQUFFLEVBQUUsS0FBSyxFQUFFLHVCQUF1QixFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRS9ELGtCQUFrQjtRQUNsQixNQUFNLFlBQVksR0FBRywrQkFBK0IsQ0FBQztRQUNyRCxNQUFNLGtCQUFrQixHQUFHLHVDQUF1QyxDQUFDO1FBRW5FLE1BQU07YUFDSCxFQUFFLENBQUMsNEJBQWdCLEVBQUU7WUFDcEIsTUFBTSxFQUFFLG9CQUFvQjtZQUM1QixHQUFHLEVBQUUseUJBQXlCO1NBQy9CLENBQUM7YUFDRCxRQUFRLENBQUM7WUFDUiw4REFBOEQ7WUFDOUQsSUFBSSxFQUFFLGlCQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsWUFBWSxDQUFDLENBQVE7WUFDMUMsSUFBSSxFQUFFLGFBQWE7U0FDcEIsQ0FBQyxDQUFDO1FBRUwsTUFBTTthQUNILEVBQUUsQ0FBQyw0QkFBZ0IsRUFBRTtZQUNwQixNQUFNLEVBQUUsb0JBQW9CO1lBQzVCLEdBQUcsRUFBRSx1QkFBdUI7U0FDN0IsQ0FBQzthQUNELFFBQVEsQ0FBQztZQUNSLDhEQUE4RDtZQUM5RCxJQUFJLEVBQUUsaUJBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFRO1lBQ2hELElBQUksRUFBRSxhQUFhO1NBQ3BCLENBQUMsQ0FBQztRQUVMLDJCQUEyQjtRQUMxQixNQUFNLENBQUMsS0FBbUIsQ0FBQyxpQkFBaUIsQ0FBQztZQUM1QyxFQUFFLEVBQUUsSUFBSTtZQUNSLElBQUksRUFBRSxLQUFLLElBQUksRUFBRSxDQUFDLENBQUM7Z0JBQ2pCLE9BQU8sRUFBRTtvQkFDUDt3QkFDRSxPQUFPLEVBQUU7NEJBQ1AsT0FBTyxFQUFFLHdDQUF3Qzt5QkFDbEQ7cUJBQ0Y7aUJBQ0Y7YUFDRixDQUFDO1NBQ0gsQ0FBQyxDQUFDO1FBRUgsdUNBQXVDO1FBQ3ZDLFVBQVUsQ0FBQyxFQUFFLENBQUMseUJBQVUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUN6QyxDQUFDLENBQUM7SUFFRixRQUFRLENBQUMsMENBQTBDLEVBQUUsR0FBRyxFQUFFO1FBQ3hELEVBQUUsQ0FBQyx1RUFBdUUsRUFBRSxLQUFLLElBQUksRUFBRTtZQUNyRixNQUFNLFFBQVEsR0FBRztnQkFDZixTQUFTLEVBQUUscUJBQXFCO2dCQUNoQyxhQUFhLEVBQUUsc0JBQXNCO2dCQUNyQyxXQUFXLEVBQUUsSUFBSTtnQkFDakIsUUFBUSxFQUFFLEtBQUs7Z0JBQ2YsZUFBZSxFQUFFLGFBQWE7Z0JBQzlCLFFBQVEsRUFBRSxZQUFZO2FBQ3ZCLENBQUM7WUFFRixNQUFNLGFBQWEsR0FBRztnQkFDcEIsTUFBTSxFQUFFLFNBQWtCO2dCQUMxQixNQUFNLEVBQUUsVUFBVTtnQkFDbEIsY0FBYyxFQUFFLDBCQUEwQjtnQkFDMUMsUUFBUTtnQkFDUixjQUFjLEVBQUU7b0JBQ2QsVUFBVSxFQUFFO3dCQUNWLE1BQU0sRUFBRTs0QkFDTixHQUFHLEVBQUUsVUFBVTt5QkFDaEI7cUJBQ0Y7aUJBQ0Y7YUFDRixDQUFDO1lBRUYsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFBLDBCQUFPLEVBQUMsYUFBYSxDQUFDLENBQUM7WUFFNUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDcEMsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDckMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLGNBQWMsQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUN6QyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsY0FBYyxDQUFDLFNBQVMsRUFBRSxnQ0FBZ0MsQ0FBQyxDQUFDO1lBRXpFLHlDQUF5QztZQUN6QyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUMseUJBQXlCLENBQUMseUJBQVUsRUFBRTtnQkFDdkQsU0FBUyxFQUFFLHFCQUFxQjtnQkFDaEMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQztvQkFDNUIsTUFBTSxFQUFFLFVBQVU7b0JBQ2xCLElBQUksRUFBRSxnQkFBZ0I7b0JBQ3RCLE1BQU0sRUFBRSxZQUFZO29CQUNwQixRQUFRO2lCQUNULENBQUM7YUFDSCxDQUFDLENBQUM7WUFFSCwwQ0FBMEM7WUFDMUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDLHlCQUF5QixDQUFDLHlCQUFVLEVBQUU7Z0JBQ3ZELFNBQVMsRUFBRSxxQkFBcUI7Z0JBQ2hDLElBQUksRUFBRSxNQUFNLENBQUMsZ0JBQWdCLENBQUM7b0JBQzVCLE1BQU0sRUFBRSxVQUFVO29CQUNsQixNQUFNLEVBQUUsT0FBTztvQkFDZixPQUFPLEVBQUUsTUFBTSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUM7b0JBQzNCLFFBQVE7aUJBQ1QsQ0FBQzthQUNILENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO1FBRUgsRUFBRSxDQUFDLHFEQUFxRCxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ25FLE1BQU0sYUFBYSxHQUFHO2dCQUNwQixNQUFNLEVBQUUsU0FBa0I7Z0JBQzFCLE1BQU0sRUFBRSxVQUFVO2dCQUNsQixjQUFjLEVBQUUsMEJBQTBCO2dCQUMxQyxjQUFjLEVBQUU7b0JBQ2QsVUFBVSxFQUFFO3dCQUNWLE1BQU0sRUFBRTs0QkFDTixHQUFHLEVBQUUsVUFBVTt5QkFDaEI7cUJBQ0Y7aUJBQ0Y7YUFDRixDQUFDO1lBRUYsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFBLDBCQUFPLEVBQUMsYUFBYSxDQUFDLENBQUM7WUFFNUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDcEMsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDckMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLGNBQWMsQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUV6QyxrREFBa0Q7WUFDbEQsTUFBTSxRQUFRLEdBQUcsVUFBVSxDQUFDLFlBQVksQ0FBQyx5QkFBVSxDQUFDLENBQUM7WUFDckQsTUFBTSxZQUFZLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2pDLE1BQU0sQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3pFLENBQUMsQ0FBQyxDQUFDO1FBRUgsRUFBRSxDQUFDLHdEQUF3RCxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ3RFLE1BQU0sYUFBYSxHQUFHO2dCQUNwQixNQUFNLEVBQUUsU0FBa0I7Z0JBQzFCLE1BQU0sRUFBRSxVQUFVO2dCQUNsQixjQUFjLEVBQUUsMEJBQTBCO2dCQUMxQyxRQUFRLEVBQUUsRUFBRTtnQkFDWixjQUFjLEVBQUU7b0JBQ2QsVUFBVSxFQUFFO3dCQUNWLE1BQU0sRUFBRTs0QkFDTixHQUFHLEVBQUUsVUFBVTt5QkFDaEI7cUJBQ0Y7aUJBQ0Y7YUFDRixDQUFDO1lBRUYsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFBLDBCQUFPLEVBQUMsYUFBYSxDQUFDLENBQUM7WUFFNUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDcEMsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDckMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLGNBQWMsQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUV6Qyw4RUFBOEU7WUFDOUUsTUFBTSxRQUFRLEdBQUcsVUFBVSxDQUFDLFlBQVksQ0FBQyx5QkFBVSxDQUFDLENBQUM7WUFDckQsTUFBTSxZQUFZLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2pDLE1BQU0sQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3pFLENBQUMsQ0FBQyxDQUFDO1FBRUgsRUFBRSxDQUFDLDREQUE0RCxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQzFFLDRCQUE0QjtZQUM1QixVQUFVO2lCQUNQLEVBQUUsQ0FBQyx5QkFBVSxFQUFFO2dCQUNkLFNBQVMsRUFBRSxpQkFBaUI7Z0JBQzVCLEdBQUcsRUFBRSxFQUFFLE1BQU0sRUFBRSxVQUFVLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRTthQUNsRCxDQUFDO2lCQUNELFFBQVEsQ0FBQyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDO1lBRWpDLE1BQU0sYUFBYSxHQUFHO2dCQUNwQixNQUFNLEVBQUUsU0FBa0I7Z0JBQzFCLE1BQU0sRUFBRSxVQUFVO2dCQUNsQixjQUFjLEVBQUUsMEJBQTBCO2dCQUMxQyxRQUFRLEVBQUUsRUFBRSxTQUFTLEVBQUUsYUFBYSxFQUFFO2dCQUN0QyxjQUFjLEVBQUU7b0JBQ2QsVUFBVSxFQUFFO3dCQUNWLE1BQU0sRUFBRTs0QkFDTixHQUFHLEVBQUUsVUFBVTt5QkFDaEI7cUJBQ0Y7aUJBQ0Y7YUFDRixDQUFDO1lBRUYsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFBLDBCQUFPLEVBQUMsYUFBYSxDQUFDLENBQUM7WUFFNUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDcEMsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDckMsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsd0JBQXdCLENBQUMsQ0FBQztRQUN0RCxDQUFDLENBQUMsQ0FBQztRQUVILEVBQUUsQ0FBQywyREFBMkQsRUFBRSxLQUFLLElBQUksRUFBRTtZQUN6RSwyQkFBMkI7WUFDM0IsVUFBVTtpQkFDUCxFQUFFLENBQUMseUJBQVUsRUFBRTtnQkFDZCxTQUFTLEVBQUUsd0JBQXdCO2dCQUNuQyxHQUFHLEVBQUUsRUFBRSxNQUFNLEVBQUUsVUFBVSxFQUFFO2FBQzVCLENBQUM7aUJBQ0QsUUFBUSxDQUFDLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUM7WUFFakMsTUFBTSxhQUFhLEdBQUc7Z0JBQ3BCLE1BQU0sRUFBRSxTQUFrQjtnQkFDMUIsTUFBTSxFQUFFLFVBQVU7Z0JBQ2xCLGNBQWMsRUFBRSwwQkFBMEI7Z0JBQzFDLFFBQVEsRUFBRSxFQUFFLFNBQVMsRUFBRSxhQUFhLEVBQUU7Z0JBQ3RDLGNBQWMsRUFBRTtvQkFDZCxVQUFVLEVBQUU7d0JBQ1YsTUFBTSxFQUFFOzRCQUNOLEdBQUcsRUFBRSxVQUFVO3lCQUNoQjtxQkFDRjtpQkFDRjthQUNGLENBQUM7WUFFRixNQUFNLE1BQU0sR0FBRyxNQUFNLElBQUEsMEJBQU8sRUFBQyxhQUFhLENBQUMsQ0FBQztZQUU1QyxNQUFNLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNwQyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNyQyxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxnRUFBZ0UsQ0FBQyxDQUFDO1FBQzlGLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7SUFFSCxRQUFRLENBQUMsOENBQThDLEVBQUUsR0FBRyxFQUFFO1FBQzVELEVBQUUsQ0FBQyxzREFBc0QsRUFBRSxLQUFLLElBQUksRUFBRTtZQUNwRSxNQUFNLGFBQWEsR0FBRztnQkFDcEIsTUFBTSxFQUFFLFNBQWtCO2dCQUMxQixNQUFNLEVBQUUsVUFBVTtnQkFDbEIsY0FBYyxFQUFFLDBCQUEwQjtnQkFDMUMsUUFBUSxFQUFFLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRTtnQkFDMUIsY0FBYyxFQUFFO29CQUNkLFVBQVUsRUFBRTt3QkFDVixNQUFNLEVBQUU7NEJBQ04sR0FBRyxFQUFFLFVBQVU7eUJBQ2hCO3FCQUNGO2lCQUNGO2FBQ0YsQ0FBQztZQUVGLE1BQU0sTUFBTSxHQUFHLE1BQU0sSUFBQSwwQkFBTyxFQUFDLGFBQWEsQ0FBQyxDQUFDO1lBRTVDLE1BQU0sQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3BDLHlEQUF5RDtZQUN6RCxNQUFNLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLGNBQWMsQ0FBQyw2QkFBNkIsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUM1RSxDQUFDLENBQUMsQ0FBQztRQUVILEVBQUUsQ0FBQyw4Q0FBOEMsRUFBRSxLQUFLLElBQUksRUFBRTtZQUM1RCxNQUFNLGVBQWUsR0FBa0M7Z0JBQ3JELGNBQWMsRUFBRSxFQUFFLE1BQU0sRUFBRSxVQUFVLEVBQUU7Z0JBQ3RDLDhEQUE4RDtnQkFDOUQsY0FBYyxFQUFFO29CQUNkLFVBQVUsRUFBRTt3QkFDVixNQUFNLEVBQUUsRUFBRSxHQUFHLEVBQUUsVUFBVSxFQUFFO3FCQUM1QjtpQkFDSztnQkFDUixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLFFBQVEsRUFBRSxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDO2FBQ3RELENBQUM7WUFFRixNQUFNLE1BQU0sR0FBRyxNQUFNLElBQUEsMEJBQU8sRUFBQyxlQUF1QyxDQUFDLENBQUM7WUFFdEUsTUFBTSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDcEMsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDckMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLGNBQWMsQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUV6Qyw2Q0FBNkM7WUFDN0MsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDLHlCQUF5QixDQUFDLHlCQUFVLEVBQUU7Z0JBQ3ZELFNBQVMsRUFBRSxxQkFBcUI7Z0JBQ2hDLElBQUksRUFBRSxNQUFNLENBQUMsZ0JBQWdCLENBQUM7b0JBQzVCLFFBQVEsRUFBRSxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUU7aUJBQzVCLENBQUM7YUFDSCxDQUFDLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztRQUVILEVBQUUsQ0FBQyw4Q0FBOEMsRUFBRSxLQUFLLElBQUksRUFBRTtZQUM1RCxNQUFNLFlBQVksR0FBRztnQkFDbkIsTUFBTSxFQUFFLFNBQVM7Z0JBQ2pCLE1BQU0sRUFBRSxVQUFVO2dCQUNsQixjQUFjLEVBQUU7b0JBQ2QsVUFBVSxFQUFFO3dCQUNWLE1BQU0sRUFBRTs0QkFDTixHQUFHLEVBQUUsZ0JBQWdCO3lCQUN0QjtxQkFDRjtpQkFDRjthQUNGLENBQUM7WUFFRixxRUFBcUU7WUFDckUsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFBLDBCQUFPLEVBQUMsWUFBK0MsQ0FBQyxDQUFDO1lBRTlFLE1BQU0sQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3BDLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3JDLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLENBQUM7UUFDbEQsQ0FBQyxDQUFDLENBQUM7UUFFSCxFQUFFLENBQUMsOENBQThDLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDNUQsTUFBTSxZQUFZLEdBQUc7Z0JBQ25CLE1BQU0sRUFBRSxTQUFrQjtnQkFDMUIsUUFBUSxFQUFFLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRTtnQkFDMUIsY0FBYyxFQUFFO29CQUNkLFVBQVUsRUFBRTt3QkFDVixNQUFNLEVBQUU7NEJBQ04sR0FBRyxFQUFFLFVBQVU7eUJBQ2hCO3FCQUNGO2lCQUNGO2FBQ0YsQ0FBQztZQUVGLHdDQUF3QztZQUN4QyxNQUFNLE1BQU0sR0FBRyxNQUFNLElBQUEsMEJBQU8sRUFBQyxZQUErQyxDQUFDLENBQUM7WUFFOUUsTUFBTSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDcEMsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDckMsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsQ0FBQztRQUNsRCxDQUFDLENBQUMsQ0FBQztRQUVILEVBQUUsQ0FBQywyRUFBMkUsRUFBRSxLQUFLLElBQUksRUFBRTtZQUN6RixNQUFNLFdBQVcsR0FBRztnQkFDbEIsTUFBTSxFQUFFLFNBQWtCO2dCQUMxQixNQUFNLEVBQUUsVUFBVTtnQkFDbEIsY0FBYyxFQUFFLDBCQUEwQjtnQkFDMUMsY0FBYyxFQUFFLEVBQUUsTUFBTSxFQUFFLG1CQUFtQixFQUFFLEVBQUUsMkNBQTJDO2dCQUM1RixjQUFjLEVBQUU7b0JBQ2QsVUFBVSxFQUFFO3dCQUNWLE1BQU0sRUFBRTs0QkFDTixHQUFHLEVBQUUsVUFBVTt5QkFDaEI7cUJBQ0Y7aUJBQ0Y7YUFDRixDQUFDO1lBRUYsbUZBQW1GO1lBQ25GLE1BQU0sTUFBTSxHQUFHLE1BQU0sSUFBQSwwQkFBTyxFQUFDLFdBQThDLENBQUMsQ0FBQztZQUU3RSxtRUFBbUU7WUFDbkUsTUFBTSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDdEMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztJQUVILFFBQVEsQ0FBQyx5Q0FBeUMsRUFBRSxHQUFHLEVBQUU7UUFDdkQsRUFBRSxDQUFDLHNEQUFzRCxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ3BFLE1BQU0sZUFBZSxHQUFHO2dCQUN0QixTQUFTLEVBQUUsYUFBYTtnQkFDeEIsYUFBYSxFQUFFLGtCQUFrQjtnQkFDakMsV0FBVyxFQUFFLElBQUk7Z0JBQ2pCLFFBQVEsRUFBRSxLQUFLO2dCQUNmLGNBQWMsRUFBRSxJQUFJO2dCQUNwQixpQkFBaUIsRUFBRSxDQUFDO2dCQUNwQixTQUFTLEVBQUUsUUFBUTtnQkFDbkIsUUFBUSxFQUFFLFlBQVk7Z0JBQ3RCLFdBQVcsRUFBRSxjQUFjO2FBQzVCLENBQUM7WUFFRixNQUFNLGFBQWEsR0FBRztnQkFDcEIsTUFBTSxFQUFFLFNBQWtCO2dCQUMxQixNQUFNLEVBQUUsVUFBVTtnQkFDbEIsY0FBYyxFQUFFLDBCQUEwQjtnQkFDMUMsUUFBUSxFQUFFLGVBQWU7Z0JBQ3pCLGNBQWMsRUFBRTtvQkFDZCxVQUFVLEVBQUU7d0JBQ1YsTUFBTSxFQUFFOzRCQUNOLEdBQUcsRUFBRSxVQUFVO3lCQUNoQjtxQkFDRjtpQkFDRjthQUNGLENBQUM7WUFFRixNQUFNLE1BQU0sR0FBRyxNQUFNLElBQUEsMEJBQU8sRUFBQyxhQUFhLENBQUMsQ0FBQztZQUU1QyxNQUFNLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUVwQyxvQ0FBb0M7WUFDcEMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDLHlCQUF5QixDQUFDLHlCQUFVLEVBQUU7Z0JBQ3ZELFNBQVMsRUFBRSxxQkFBcUI7Z0JBQ2hDLElBQUksRUFBRSxNQUFNLENBQUMsZ0JBQWdCLENBQUM7b0JBQzVCLFFBQVEsRUFBRSxlQUFlO2lCQUMxQixDQUFDO2FBQ0gsQ0FBQyxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7UUFFSCxFQUFFLENBQUMsc0RBQXNELEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDcEUsTUFBTSxXQUFXLEdBQUc7Z0JBQ2xCLE1BQU0sRUFBRSxZQUFZO2dCQUNwQixPQUFPLEVBQUUsT0FBTztnQkFDaEIsUUFBUSxFQUFFLFlBQVk7YUFDdkIsQ0FBQztZQUVGLE1BQU0sZUFBZSxHQUFrQztnQkFDckQsY0FBYyxFQUFFLEVBQUUsTUFBTSxFQUFFLFVBQVUsRUFBRTtnQkFDdEMsOERBQThEO2dCQUM5RCxjQUFjLEVBQUU7b0JBQ2QsVUFBVSxFQUFFO3dCQUNWLE1BQU0sRUFBRSxFQUFFLEdBQUcsRUFBRSxVQUFVLEVBQUU7cUJBQzVCO2lCQUNLO2dCQUNSLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsUUFBUSxFQUFFLFdBQVcsRUFBRSxDQUFDO2FBQ2hELENBQUM7WUFFRixNQUFNLE1BQU0sR0FBRyxNQUFNLElBQUEsMEJBQU8sRUFBQyxlQUF1QyxDQUFDLENBQUM7WUFFdEUsTUFBTSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7WUFFcEMsZ0NBQWdDO1lBQ2hDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQyx5QkFBeUIsQ0FBQyx5QkFBVSxFQUFFO2dCQUN2RCxTQUFTLEVBQUUscUJBQXFCO2dCQUNoQyxJQUFJLEVBQUUsTUFBTSxDQUFDLGdCQUFnQixDQUFDO29CQUM1QixRQUFRLEVBQUUsV0FBVztpQkFDdEIsQ0FBQzthQUNILENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO1FBRUgsRUFBRSxDQUFDLDJEQUEyRCxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ3pFLE1BQU0sZUFBZSxHQUFrQztnQkFDckQsY0FBYyxFQUFFLEVBQUUsTUFBTSxFQUFFLFVBQVUsRUFBRTtnQkFDdEMsOERBQThEO2dCQUM5RCxjQUFjLEVBQUU7b0JBQ2QsVUFBVSxFQUFFO3dCQUNWLE1BQU0sRUFBRSxFQUFFLEdBQUcsRUFBRSxVQUFVLEVBQUU7cUJBQzVCO2lCQUNLO2dCQUNSLElBQUksRUFBRSxnQkFBZ0I7YUFDdkIsQ0FBQztZQUVGLE1BQU0sTUFBTSxHQUFHLE1BQU0sSUFBQSwwQkFBTyxFQUFDLGVBQXVDLENBQUMsQ0FBQztZQUV0RSxNQUFNLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUVwQyxrQ0FBa0M7WUFDbEMsTUFBTSxRQUFRLEdBQUcsVUFBVSxDQUFDLFlBQVksQ0FBQyx5QkFBVSxDQUFDLENBQUM7WUFDckQsTUFBTSxZQUFZLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2pDLE1BQU0sQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3pFLENBQUMsQ0FBQyxDQUFDO1FBRUgsRUFBRSxDQUFDLDhDQUE4QyxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQzVELE1BQU0sZUFBZSxHQUFrQztnQkFDckQsY0FBYyxFQUFFLEVBQUUsTUFBTSxFQUFFLFVBQVUsRUFBRTtnQkFDdEMsOERBQThEO2dCQUM5RCxjQUFjLEVBQUU7b0JBQ2QsVUFBVSxFQUFFO3dCQUNWLE1BQU0sRUFBRSxFQUFFLEdBQUcsRUFBRSxVQUFVLEVBQUU7cUJBQzVCO2lCQUNLO2dCQUNSLElBQUksRUFBRSxJQUFJO2FBQ1gsQ0FBQztZQUVGLE1BQU0sTUFBTSxHQUFHLE1BQU0sSUFBQSwwQkFBTyxFQUFDLGVBQXVDLENBQUMsQ0FBQztZQUV0RSxNQUFNLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUVwQyxrQ0FBa0M7WUFDbEMsTUFBTSxRQUFRLEdBQUcsVUFBVSxDQUFDLFlBQVksQ0FBQyx5QkFBVSxDQUFDLENBQUM7WUFDckQsTUFBTSxZQUFZLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2pDLE1BQU0sQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3pFLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7SUFFSCxRQUFRLENBQUMsdUNBQXVDLEVBQUUsR0FBRyxFQUFFO1FBQ3JELEVBQUUsQ0FBQywwREFBMEQsRUFBRSxLQUFLLElBQUksRUFBRTtZQUN4RSwwQkFBMEI7WUFDekIsTUFBTSxDQUFDLEtBQW1CLENBQUMsaUJBQWlCLENBQUMsSUFBSSxLQUFLLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDO1lBRTdFLE1BQU0sYUFBYSxHQUFHO2dCQUNwQixNQUFNLEVBQUUsU0FBa0I7Z0JBQzFCLE1BQU0sRUFBRSxVQUFVO2dCQUNsQixjQUFjLEVBQUUsMEJBQTBCO2dCQUMxQyxRQUFRLEVBQUUsRUFBRSxTQUFTLEVBQUUsYUFBYSxFQUFFO2dCQUN0QyxjQUFjLEVBQUU7b0JBQ2QsVUFBVSxFQUFFO3dCQUNWLE1BQU0sRUFBRTs0QkFDTixHQUFHLEVBQUUsVUFBVTt5QkFDaEI7cUJBQ0Y7aUJBQ0Y7YUFDRixDQUFDO1lBRUYsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFBLDBCQUFPLEVBQUMsYUFBYSxDQUFDLENBQUM7WUFFNUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDcEMsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDckMsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQ3ZCLDBGQUEwRixDQUMzRixDQUFDO1lBRUYsc0NBQXNDO1lBQ3RDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQyx5QkFBeUIsQ0FBQyx5QkFBVSxFQUFFO2dCQUN2RCxTQUFTLEVBQUUscUJBQXFCO2dCQUNoQyxJQUFJLEVBQUUsTUFBTSxDQUFDLGdCQUFnQixDQUFDO29CQUM1QixNQUFNLEVBQUUsUUFBUTtvQkFDaEIsS0FBSyxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDO2lCQUMxQixDQUFDO2FBQ0gsQ0FBQyxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7UUFFSCxFQUFFLENBQUMsdURBQXVELEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDckUsc0NBQXNDO1lBQ3RDLFVBQVUsQ0FBQyxFQUFFLENBQUMseUJBQVUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxJQUFJLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUM7WUFFL0QsTUFBTSxhQUFhLEdBQUc7Z0JBQ3BCLE1BQU0sRUFBRSxTQUFrQjtnQkFDMUIsTUFBTSxFQUFFLFVBQVU7Z0JBQ2xCLGNBQWMsRUFBRSwwQkFBMEI7Z0JBQzFDLFFBQVEsRUFBRSxFQUFFLFNBQVMsRUFBRSxhQUFhLEVBQUU7Z0JBQ3RDLGNBQWMsRUFBRTtvQkFDZCxVQUFVLEVBQUU7d0JBQ1YsTUFBTSxFQUFFOzRCQUNOLEdBQUcsRUFBRSxVQUFVO3lCQUNoQjtxQkFDRjtpQkFDRjthQUNGLENBQUM7WUFFRixNQUFNLE1BQU0sR0FBRyxNQUFNLElBQUEsMEJBQU8sRUFBQyxhQUFhLENBQUMsQ0FBQztZQUU1QyxNQUFNLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNwQyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNyQyxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLFNBQVMsQ0FBQyxnQ0FBZ0MsQ0FBQyxDQUFDO1FBQ25FLENBQUMsQ0FBQyxDQUFDO1FBRUgsRUFBRSxDQUFDLDhEQUE4RCxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQzVFLGdCQUFnQjtZQUNoQixNQUFNLENBQUMsRUFBRSxDQUFDLDRCQUFnQixDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksS0FBSyxDQUFDLGtCQUFrQixDQUFDLENBQUMsQ0FBQztZQUVuRSxNQUFNLGFBQWEsR0FBRztnQkFDcEIsTUFBTSxFQUFFLFNBQWtCO2dCQUMxQixNQUFNLEVBQUUsVUFBVTtnQkFDbEIsY0FBYyxFQUFFLDBCQUEwQjtnQkFDMUMsUUFBUSxFQUFFLEVBQUUsU0FBUyxFQUFFLGFBQWEsRUFBRTtnQkFDdEMsY0FBYyxFQUFFO29CQUNkLFVBQVUsRUFBRTt3QkFDVixNQUFNLEVBQUU7NEJBQ04sR0FBRyxFQUFFLFVBQVU7eUJBQ2hCO3FCQUNGO2lCQUNGO2FBQ0YsQ0FBQztZQUVGLE1BQU0sTUFBTSxHQUFHLE1BQU0sSUFBQSwwQkFBTyxFQUFDLGFBQWEsQ0FBQyxDQUFDO1lBRTVDLGtEQUFrRDtZQUNsRCxNQUFNLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNwQyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNyQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsY0FBYyxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQzNDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7SUFFSCxRQUFRLENBQUMsZ0NBQWdDLEVBQUUsR0FBRyxFQUFFO1FBQzlDLEVBQUUsQ0FBQyw0REFBNEQsRUFBRSxLQUFLLElBQUksRUFBRTtZQUMxRSxNQUFNLGFBQWEsR0FBRztnQkFDcEIsTUFBTSxFQUFFLFNBQWtCO2dCQUMxQixNQUFNLEVBQUUsVUFBVTtnQkFDbEIsY0FBYyxFQUFFLDBCQUEwQjtnQkFDMUMsUUFBUSxFQUFFLEVBQUUsU0FBUyxFQUFFLGFBQWEsRUFBRTtnQkFDdEMsY0FBYyxFQUFFO29CQUNkLFVBQVUsRUFBRTt3QkFDVixNQUFNLEVBQUU7NEJBQ04sR0FBRyxFQUFFLFVBQVU7NEJBQ2YsS0FBSyxFQUFFLHFCQUFxQjt5QkFDN0I7cUJBQ0Y7aUJBQ0Y7YUFDRixDQUFDO1lBRUYsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFBLDBCQUFPLEVBQUMsYUFBYSxDQUFDLENBQUM7WUFFNUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDcEMsK0VBQStFO1FBQ2pGLENBQUMsQ0FBQyxDQUFDO1FBRUgsRUFBRSxDQUFDLDREQUE0RCxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQzFFLE1BQU0sYUFBYSxHQUFHO2dCQUNwQixNQUFNLEVBQUUsU0FBa0I7Z0JBQzFCLE1BQU0sRUFBRSxVQUFVO2dCQUNsQixjQUFjLEVBQUUsMEJBQTBCO2dCQUMxQyxRQUFRLEVBQUUsRUFBRSxTQUFTLEVBQUUsYUFBYSxFQUFFO2FBQ3ZDLENBQUM7WUFFRixNQUFNLE1BQU0sR0FBRyxNQUFNLElBQUEsMEJBQU8sRUFBQyxhQUFhLENBQUMsQ0FBQztZQUU1QywwRUFBMEU7WUFDMUUsTUFBTSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDdEMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztBQUNMLENBQUMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgaGFuZGxlciB9IGZyb20gJy4uLy4uL2xhbWJkYS9yZWFkaW5ncy9nZW5lcmF0ZS1yZWFkaW5nJztcbmltcG9ydCB7IEFQSUdhdGV3YXlQcm94eUV2ZW50IH0gZnJvbSAnYXdzLWxhbWJkYSc7XG5pbXBvcnQgeyBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LCBHZXRDb21tYW5kLCBQdXRDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvbGliLWR5bmFtb2RiJztcbmltcG9ydCB7IFNTTUNsaWVudCwgR2V0UGFyYW1ldGVyQ29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zc20nO1xuaW1wb3J0IHsgUzNDbGllbnQsIEdldE9iamVjdENvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtczMnO1xuaW1wb3J0IHsgbW9ja0NsaWVudCB9IGZyb20gJ2F3cy1zZGstY2xpZW50LW1vY2snO1xuaW1wb3J0IHsgUmVhZGFibGUgfSBmcm9tICdzdHJlYW0nO1xuXG4vLyBNb2NrIHRoZSBEeW5hbW9EQiwgU1NNLCBhbmQgUzMgY2xpZW50c1xuY29uc3QgZHluYW1vTW9jayA9IG1vY2tDbGllbnQoRHluYW1vREJEb2N1bWVudENsaWVudCk7XG5jb25zdCBzc21Nb2NrID0gbW9ja0NsaWVudChTU01DbGllbnQpO1xuY29uc3QgczNNb2NrID0gbW9ja0NsaWVudChTM0NsaWVudCk7XG5cbi8vIE1vY2sgZmV0Y2ggZm9yIE9wZW5BSSBBUEkgY2FsbHNcbmdsb2JhbC5mZXRjaCA9IGplc3QuZm4oKTtcblxuLy8gQ2xlYXIgbW9kdWxlIGNhY2hlIHRvIHJlc2V0IGNhY2hlZCBjb25maWcgYmV0d2VlbiB0ZXN0c1xuamVzdC5yZXNldE1vZHVsZXMoKTtcblxuZGVzY3JpYmUoJ0dlbmVyYXRlIFJlYWRpbmcgTGFtYmRhIC0gSW50ZXJuYWwgSW52b2NhdGlvbicsICgpID0+IHtcbiAgY29uc3QgbW9ja1VzZXJJZCA9ICd0ZXN0LXVzZXItMTIzJztcblxuICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICAvLyBDbGVhciBtb2R1bGUgY2FjaGUgdG8gcmVzZXQgYW55IGNhY2hlZCBjb25maWdzXG4gICAgamVzdC5yZXNldE1vZHVsZXMoKTtcblxuICAgIGR5bmFtb01vY2sucmVzZXQoKTtcbiAgICBzc21Nb2NrLnJlc2V0KCk7XG4gICAgczNNb2NrLnJlc2V0KCk7XG4gICAgKGdsb2JhbC5mZXRjaCBhcyBqZXN0Lk1vY2spLm1vY2tSZXNldCgpO1xuXG4gICAgLy8gU2V0IHJlcXVpcmVkIGVudmlyb25tZW50IHZhcmlhYmxlc1xuICAgIHByb2Nlc3MuZW52LlJFQURJTkdTX1RBQkxFX05BTUUgPSAndGVzdC1yZWFkaW5ncy10YWJsZSc7XG4gICAgcHJvY2Vzcy5lbnYuVVNFUl9UQUJMRV9OQU1FID0gJ3Rlc3QtdXNlci10YWJsZSc7XG4gICAgcHJvY2Vzcy5lbnYuTkFUQUxfQ0hBUlRfVEFCTEVfTkFNRSA9ICd0ZXN0LW5hdGFsLWNoYXJ0LXRhYmxlJztcbiAgICBwcm9jZXNzLmVudi5DT05GSUdfQlVDS0VUX05BTUUgPSAndGVzdC1jb25maWctYnVja2V0JztcbiAgICBwcm9jZXNzLmVudi5PUEVOQUlfQVBJX0tFWV9QQVJBTUVURVJfTkFNRSA9ICcvdGVzdC9vcGVuYWkta2V5JztcbiAgICBwcm9jZXNzLmVudi5SRUFESU5HX01PREVMX1BBUkFNRVRFUl9OQU1FID0gJy90ZXN0L3JlYWRpbmctbW9kZWwnO1xuICAgIHByb2Nlc3MuZW52LlJFQURJTkdfVEVNUEVSQVRVUkVfUEFSQU1FVEVSX05BTUUgPSAnL3Rlc3QvcmVhZGluZy10ZW1wZXJhdHVyZSc7XG4gICAgcHJvY2Vzcy5lbnYuUkVBRElOR19NQVhfVE9LRU5TX1BBUkFNRVRFUl9OQU1FID0gJy90ZXN0L3JlYWRpbmctbWF4LXRva2Vucyc7XG4gICAgcHJvY2Vzcy5lbnYuU1lTVEVNX1BST01QVF9TM0tFWV9QQVJBTUVURVJfTkFNRSA9ICcvdGVzdC9zeXN0ZW0tcHJvbXB0LWtleSc7XG4gICAgcHJvY2Vzcy5lbnYuVVNFUl9QUk9NUFRfUzNLRVlfUEFSQU1FVEVSX05BTUUgPSAnL3Rlc3QvdXNlci1wcm9tcHQta2V5JztcbiAgICBwcm9jZXNzLmVudi5JTlRFUk5BTF9JTlZPQ0FUSU9OX1NFQ1JFVCA9ICd0ZXN0LWludGVybmFsLXNlY3JldC0xMjMnO1xuXG4gICAgLy8gU2V0dXAgZGVmYXVsdCBtb2NrcyBmb3Igc3VjY2Vzc2Z1bCByZWFkaW5nIGdlbmVyYXRpb25cbiAgICBzZXR1cFN1Y2Nlc3NmdWxNb2NrcygpO1xuICB9KTtcblxuICBjb25zdCBzZXR1cFN1Y2Nlc3NmdWxNb2NrcyA9ICgpID0+IHtcbiAgICAvLyBNb2NrIHVzZXIgcHJvZmlsZVxuICAgIGR5bmFtb01vY2tcbiAgICAgIC5vbihHZXRDb21tYW5kLCB7XG4gICAgICAgIFRhYmxlTmFtZTogJ3Rlc3QtdXNlci10YWJsZScsXG4gICAgICAgIEtleTogeyB1c2VySWQ6IG1vY2tVc2VySWQsIGNyZWF0ZWRBdDogJ1BST0ZJTEUnIH0sXG4gICAgICB9KVxuICAgICAgLnJlc29sdmVzKHtcbiAgICAgICAgSXRlbToge1xuICAgICAgICAgIHVzZXJJZDogbW9ja1VzZXJJZCxcbiAgICAgICAgICBwcm9maWxlOiB7XG4gICAgICAgICAgICBiaXJ0aE5hbWU6ICdUZXN0IFVzZXInLFxuICAgICAgICAgICAgYmlydGhEYXRlOiAnMTk5MC0wMS0wMScsXG4gICAgICAgICAgICBiaXJ0aFRpbWU6ICcxMjowMCcsXG4gICAgICAgICAgICBiaXJ0aENpdHk6ICdOZXcgWW9yaycsXG4gICAgICAgICAgICBiaXJ0aFN0YXRlOiAnTlknLFxuICAgICAgICAgICAgYmlydGhDb3VudHJ5OiAnVVNBJyxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSk7XG5cbiAgICAvLyBNb2NrIG5hdGFsIGNoYXJ0XG4gICAgZHluYW1vTW9ja1xuICAgICAgLm9uKEdldENvbW1hbmQsIHtcbiAgICAgICAgVGFibGVOYW1lOiAndGVzdC1uYXRhbC1jaGFydC10YWJsZScsXG4gICAgICAgIEtleTogeyB1c2VySWQ6IG1vY2tVc2VySWQgfSxcbiAgICAgIH0pXG4gICAgICAucmVzb2x2ZXMoe1xuICAgICAgICBJdGVtOiB7XG4gICAgICAgICAgdXNlcklkOiBtb2NrVXNlcklkLFxuICAgICAgICAgIHBsYW5ldHM6IHtcbiAgICAgICAgICAgIHN1bjogeyBzaWduOiAnQ2Fwcmljb3JuJywgZGVncmVlSW5TaWduOiAxMCB9LFxuICAgICAgICAgICAgbW9vbjogeyBzaWduOiAnQ2FuY2VyJywgZGVncmVlSW5TaWduOiAxNSB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgIC8vIE1vY2sgU1NNIHBhcmFtZXRlcnNcbiAgICBzc21Nb2NrXG4gICAgICAub24oR2V0UGFyYW1ldGVyQ29tbWFuZCwgeyBOYW1lOiAnL3Rlc3Qvb3BlbmFpLWtleScgfSlcbiAgICAgIC5yZXNvbHZlcyh7IFBhcmFtZXRlcjogeyBWYWx1ZTogJ3Rlc3QtYXBpLWtleScgfSB9KTtcbiAgICBzc21Nb2NrXG4gICAgICAub24oR2V0UGFyYW1ldGVyQ29tbWFuZCwgeyBOYW1lOiAnL3Rlc3QvcmVhZGluZy1tb2RlbCcgfSlcbiAgICAgIC5yZXNvbHZlcyh7IFBhcmFtZXRlcjogeyBWYWx1ZTogJ2dwdC00JyB9IH0pO1xuICAgIHNzbU1vY2tcbiAgICAgIC5vbihHZXRQYXJhbWV0ZXJDb21tYW5kLCB7IE5hbWU6ICcvdGVzdC9yZWFkaW5nLXRlbXBlcmF0dXJlJyB9KVxuICAgICAgLnJlc29sdmVzKHsgUGFyYW1ldGVyOiB7IFZhbHVlOiAnMC43JyB9IH0pO1xuICAgIHNzbU1vY2tcbiAgICAgIC5vbihHZXRQYXJhbWV0ZXJDb21tYW5kLCB7IE5hbWU6ICcvdGVzdC9yZWFkaW5nLW1heC10b2tlbnMnIH0pXG4gICAgICAucmVzb2x2ZXMoeyBQYXJhbWV0ZXI6IHsgVmFsdWU6ICcxNTAwJyB9IH0pO1xuICAgIHNzbU1vY2tcbiAgICAgIC5vbihHZXRQYXJhbWV0ZXJDb21tYW5kLCB7IE5hbWU6ICcvdGVzdC9zeXN0ZW0tcHJvbXB0LWtleScgfSlcbiAgICAgIC5yZXNvbHZlcyh7IFBhcmFtZXRlcjogeyBWYWx1ZTogJ3Byb21wdHMvdGVzdC9zeXN0ZW0udHh0JyB9IH0pO1xuICAgIHNzbU1vY2tcbiAgICAgIC5vbihHZXRQYXJhbWV0ZXJDb21tYW5kLCB7IE5hbWU6ICcvdGVzdC91c2VyLXByb21wdC1rZXknIH0pXG4gICAgICAucmVzb2x2ZXMoeyBQYXJhbWV0ZXI6IHsgVmFsdWU6ICdwcm9tcHRzL3Rlc3QvdXNlci50eHQnIH0gfSk7XG5cbiAgICAvLyBNb2NrIFMzIHByb21wdHNcbiAgICBjb25zdCBzeXN0ZW1Qcm9tcHQgPSAnWW91IGFyZSBhbiBleHBlcnQgYXN0cm9sb2dlci4nO1xuICAgIGNvbnN0IHVzZXJQcm9tcHRUZW1wbGF0ZSA9ICdHZW5lcmF0ZSBhIHJlYWRpbmcgZm9yIHt7YmlydGhOYW1lfX0uJztcblxuICAgIHMzTW9ja1xuICAgICAgLm9uKEdldE9iamVjdENvbW1hbmQsIHtcbiAgICAgICAgQnVja2V0OiAndGVzdC1jb25maWctYnVja2V0JyxcbiAgICAgICAgS2V5OiAncHJvbXB0cy90ZXN0L3N5c3RlbS50eHQnLFxuICAgICAgfSlcbiAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICAgIEJvZHk6IFJlYWRhYmxlLmZyb20oW3N5c3RlbVByb21wdF0pIGFzIGFueSxcbiAgICAgICAgRVRhZzogJ3Rlc3QtZXRhZy0xJyxcbiAgICAgIH0pO1xuXG4gICAgczNNb2NrXG4gICAgICAub24oR2V0T2JqZWN0Q29tbWFuZCwge1xuICAgICAgICBCdWNrZXQ6ICd0ZXN0LWNvbmZpZy1idWNrZXQnLFxuICAgICAgICBLZXk6ICdwcm9tcHRzL3Rlc3QvdXNlci50eHQnLFxuICAgICAgfSlcbiAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICAgIEJvZHk6IFJlYWRhYmxlLmZyb20oW3VzZXJQcm9tcHRUZW1wbGF0ZV0pIGFzIGFueSxcbiAgICAgICAgRVRhZzogJ3Rlc3QtZXRhZy0yJyxcbiAgICAgIH0pO1xuXG4gICAgLy8gTW9jayBPcGVuQUkgQVBJIHJlc3BvbnNlXG4gICAgKGdsb2JhbC5mZXRjaCBhcyBqZXN0Lk1vY2spLm1vY2tSZXNvbHZlZFZhbHVlKHtcbiAgICAgIG9rOiB0cnVlLFxuICAgICAganNvbjogYXN5bmMgKCkgPT4gKHtcbiAgICAgICAgY2hvaWNlczogW1xuICAgICAgICAgIHtcbiAgICAgICAgICAgIG1lc3NhZ2U6IHtcbiAgICAgICAgICAgICAgY29udGVudDogJ1RoaXMgaXMgeW91ciBzb3VsIGJsdWVwcmludCByZWFkaW5nLi4uJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgIH0pLFxuICAgIH0pO1xuXG4gICAgLy8gTW9jayBEeW5hbW9EQiBwdXQgZm9yIHJlYWRpbmcgcmVjb3JkXG4gICAgZHluYW1vTW9jay5vbihQdXRDb21tYW5kKS5yZXNvbHZlcyh7fSk7XG4gIH07XG5cbiAgZGVzY3JpYmUoJ0ludGVybmFsIGludm9jYXRpb24gZnJvbSB3ZWJob29rIGhhbmRsZXInLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBzdWNjZXNzZnVsbHkgcHJvY2VzcyBpbnRlcm5hbCBpbnZvY2F0aW9uIHdpdGggd2ViaG9vayBtZXRhZGF0YScsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IG1ldGFkYXRhID0ge1xuICAgICAgICBzZXNzaW9uSWQ6ICdjc190ZXN0X3Nlc3Npb25fMTIzJyxcbiAgICAgICAgY3VzdG9tZXJFbWFpbDogJ2N1c3RvbWVyQGV4YW1wbGUuY29tJyxcbiAgICAgICAgYW1vdW50VG90YWw6IDI5MDAsXG4gICAgICAgIGN1cnJlbmN5OiAndXNkJyxcbiAgICAgICAgcGF5bWVudEludGVudElkOiAncGlfdGVzdF8xMjMnLFxuICAgICAgICBjYW1wYWlnbjogJ3N1bW1lcjIwMjQnLFxuICAgICAgfTtcblxuICAgICAgY29uc3QgaW50ZXJuYWxFdmVudCA9IHtcbiAgICAgICAgc291cmNlOiAnd2ViaG9vaycgYXMgY29uc3QsXG4gICAgICAgIHVzZXJJZDogbW9ja1VzZXJJZCxcbiAgICAgICAgaW50ZXJuYWxTZWNyZXQ6ICd0ZXN0LWludGVybmFsLXNlY3JldC0xMjMnLFxuICAgICAgICBtZXRhZGF0YSxcbiAgICAgICAgcmVxdWVzdENvbnRleHQ6IHtcbiAgICAgICAgICBhdXRob3JpemVyOiB7XG4gICAgICAgICAgICBjbGFpbXM6IHtcbiAgICAgICAgICAgICAgc3ViOiBtb2NrVXNlcklkLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfTtcblxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgaGFuZGxlcihpbnRlcm5hbEV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keSkudG9IYXZlUHJvcGVydHkoJ3JlYWRpbmdJZCcpO1xuICAgICAgZXhwZWN0KGJvZHkpLnRvSGF2ZVByb3BlcnR5KCdtZXNzYWdlJywgJ1JlYWRpbmcgZ2VuZXJhdGVkIHN1Y2Nlc3NmdWxseScpO1xuXG4gICAgICAvLyBWZXJpZnkgcmVhZGluZyB3YXMgc2F2ZWQgd2l0aCBtZXRhZGF0YVxuICAgICAgZXhwZWN0KGR5bmFtb01vY2spLnRvSGF2ZVJlY2VpdmVkQ29tbWFuZFdpdGgoUHV0Q29tbWFuZCwge1xuICAgICAgICBUYWJsZU5hbWU6ICd0ZXN0LXJlYWRpbmdzLXRhYmxlJyxcbiAgICAgICAgSXRlbTogZXhwZWN0Lm9iamVjdENvbnRhaW5pbmcoe1xuICAgICAgICAgIHVzZXJJZDogbW9ja1VzZXJJZCxcbiAgICAgICAgICB0eXBlOiAnU291bCBCbHVlcHJpbnQnLFxuICAgICAgICAgIHN0YXR1czogJ1Byb2Nlc3NpbmcnLFxuICAgICAgICAgIG1ldGFkYXRhLFxuICAgICAgICB9KSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBWZXJpZnkgcmVhZGluZyB3YXMgdXBkYXRlZCB3aXRoIGNvbnRlbnRcbiAgICAgIGV4cGVjdChkeW5hbW9Nb2NrKS50b0hhdmVSZWNlaXZlZENvbW1hbmRXaXRoKFB1dENvbW1hbmQsIHtcbiAgICAgICAgVGFibGVOYW1lOiAndGVzdC1yZWFkaW5ncy10YWJsZScsXG4gICAgICAgIEl0ZW06IGV4cGVjdC5vYmplY3RDb250YWluaW5nKHtcbiAgICAgICAgICB1c2VySWQ6IG1vY2tVc2VySWQsXG4gICAgICAgICAgc3RhdHVzOiAnUmVhZHknLFxuICAgICAgICAgIGNvbnRlbnQ6IGV4cGVjdC5hbnkoU3RyaW5nKSxcbiAgICAgICAgICBtZXRhZGF0YSxcbiAgICAgICAgfSksXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgcHJvY2VzcyBpbnRlcm5hbCBpbnZvY2F0aW9uIHdpdGhvdXQgbWV0YWRhdGEnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBpbnRlcm5hbEV2ZW50ID0ge1xuICAgICAgICBzb3VyY2U6ICd3ZWJob29rJyBhcyBjb25zdCxcbiAgICAgICAgdXNlcklkOiBtb2NrVXNlcklkLFxuICAgICAgICBpbnRlcm5hbFNlY3JldDogJ3Rlc3QtaW50ZXJuYWwtc2VjcmV0LTEyMycsXG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICAgICAgY2xhaW1zOiB7XG4gICAgICAgICAgICAgIHN1YjogbW9ja1VzZXJJZCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoaW50ZXJuYWxFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkpLnRvSGF2ZVByb3BlcnR5KCdyZWFkaW5nSWQnKTtcblxuICAgICAgLy8gVmVyaWZ5IHJlYWRpbmcgd2FzIHNhdmVkIHdpdGhvdXQgbWV0YWRhdGEgZmllbGRcbiAgICAgIGNvbnN0IHB1dENhbGxzID0gZHluYW1vTW9jay5jb21tYW5kQ2FsbHMoUHV0Q29tbWFuZCk7XG4gICAgICBjb25zdCBmaXJzdFB1dENhbGwgPSBwdXRDYWxsc1swXTtcbiAgICAgIGV4cGVjdChmaXJzdFB1dENhbGwuYXJnc1swXS5pbnB1dC5JdGVtKS5ub3QudG9IYXZlUHJvcGVydHkoJ21ldGFkYXRhJyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHByb2Nlc3MgaW50ZXJuYWwgaW52b2NhdGlvbiB3aXRoIGVtcHR5IG1ldGFkYXRhJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgaW50ZXJuYWxFdmVudCA9IHtcbiAgICAgICAgc291cmNlOiAnd2ViaG9vaycgYXMgY29uc3QsXG4gICAgICAgIHVzZXJJZDogbW9ja1VzZXJJZCxcbiAgICAgICAgaW50ZXJuYWxTZWNyZXQ6ICd0ZXN0LWludGVybmFsLXNlY3JldC0xMjMnLFxuICAgICAgICBtZXRhZGF0YToge30sXG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICAgICAgY2xhaW1zOiB7XG4gICAgICAgICAgICAgIHN1YjogbW9ja1VzZXJJZCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoaW50ZXJuYWxFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkpLnRvSGF2ZVByb3BlcnR5KCdyZWFkaW5nSWQnKTtcblxuICAgICAgLy8gVmVyaWZ5IHJlYWRpbmcgd2FzIHNhdmVkIHdpdGhvdXQgbWV0YWRhdGEgZmllbGQgKGVtcHR5IG9iamVjdCBub3QgaW5jbHVkZWQpXG4gICAgICBjb25zdCBwdXRDYWxscyA9IGR5bmFtb01vY2suY29tbWFuZENhbGxzKFB1dENvbW1hbmQpO1xuICAgICAgY29uc3QgZmlyc3RQdXRDYWxsID0gcHV0Q2FsbHNbMF07XG4gICAgICBleHBlY3QoZmlyc3RQdXRDYWxsLmFyZ3NbMF0uaW5wdXQuSXRlbSkubm90LnRvSGF2ZVByb3BlcnR5KCdtZXRhZGF0YScpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgbWlzc2luZyB1c2VyIHByb2ZpbGUgZm9yIGludGVybmFsIGludm9jYXRpb24nLCBhc3luYyAoKSA9PiB7XG4gICAgICAvLyBNb2NrIG1pc3NpbmcgdXNlciBwcm9maWxlXG4gICAgICBkeW5hbW9Nb2NrXG4gICAgICAgIC5vbihHZXRDb21tYW5kLCB7XG4gICAgICAgICAgVGFibGVOYW1lOiAndGVzdC11c2VyLXRhYmxlJyxcbiAgICAgICAgICBLZXk6IHsgdXNlcklkOiBtb2NrVXNlcklkLCBjcmVhdGVkQXQ6ICdQUk9GSUxFJyB9LFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoeyBJdGVtOiB1bmRlZmluZWQgfSk7XG5cbiAgICAgIGNvbnN0IGludGVybmFsRXZlbnQgPSB7XG4gICAgICAgIHNvdXJjZTogJ3dlYmhvb2snIGFzIGNvbnN0LFxuICAgICAgICB1c2VySWQ6IG1vY2tVc2VySWQsXG4gICAgICAgIGludGVybmFsU2VjcmV0OiAndGVzdC1pbnRlcm5hbC1zZWNyZXQtMTIzJyxcbiAgICAgICAgbWV0YWRhdGE6IHsgc2Vzc2lvbklkOiAnY3NfdGVzdF8xMjMnIH0sXG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICAgICAgY2xhaW1zOiB7XG4gICAgICAgICAgICAgIHN1YjogbW9ja1VzZXJJZCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoaW50ZXJuYWxFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSg0MDQpO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkubWVzc2FnZSkudG9CZSgnVXNlciBwcm9maWxlIG5vdCBmb3VuZCcpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgbWlzc2luZyBuYXRhbCBjaGFydCBmb3IgaW50ZXJuYWwgaW52b2NhdGlvbicsIGFzeW5jICgpID0+IHtcbiAgICAgIC8vIE1vY2sgbWlzc2luZyBuYXRhbCBjaGFydFxuICAgICAgZHluYW1vTW9ja1xuICAgICAgICAub24oR2V0Q29tbWFuZCwge1xuICAgICAgICAgIFRhYmxlTmFtZTogJ3Rlc3QtbmF0YWwtY2hhcnQtdGFibGUnLFxuICAgICAgICAgIEtleTogeyB1c2VySWQ6IG1vY2tVc2VySWQgfSxcbiAgICAgICAgfSlcbiAgICAgICAgLnJlc29sdmVzKHsgSXRlbTogdW5kZWZpbmVkIH0pO1xuXG4gICAgICBjb25zdCBpbnRlcm5hbEV2ZW50ID0ge1xuICAgICAgICBzb3VyY2U6ICd3ZWJob29rJyBhcyBjb25zdCxcbiAgICAgICAgdXNlcklkOiBtb2NrVXNlcklkLFxuICAgICAgICBpbnRlcm5hbFNlY3JldDogJ3Rlc3QtaW50ZXJuYWwtc2VjcmV0LTEyMycsXG4gICAgICAgIG1ldGFkYXRhOiB7IHNlc3Npb25JZDogJ2NzX3Rlc3RfMTIzJyB9LFxuICAgICAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgICAgIGF1dGhvcml6ZXI6IHtcbiAgICAgICAgICAgIGNsYWltczoge1xuICAgICAgICAgICAgICBzdWI6IG1vY2tVc2VySWQsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9O1xuXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGludGVybmFsRXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoNDAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5Lm1lc3NhZ2UpLnRvQmUoJ05hdGFsIGNoYXJ0IG5vdCBnZW5lcmF0ZWQuIFBsZWFzZSBjb21wbGV0ZSB5b3VyIHByb2ZpbGUgZmlyc3QuJyk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdUeXBlIGd1YXJkIGZvciBpbnRlcm5hbCBpbnZvY2F0aW9uIGRldGVjdGlvbicsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGNvcnJlY3RseSBpZGVudGlmeSBpbnRlcm5hbCBpbnZvY2F0aW9uIGV2ZW50cycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGludGVybmFsRXZlbnQgPSB7XG4gICAgICAgIHNvdXJjZTogJ3dlYmhvb2snIGFzIGNvbnN0LFxuICAgICAgICB1c2VySWQ6IG1vY2tVc2VySWQsXG4gICAgICAgIGludGVybmFsU2VjcmV0OiAndGVzdC1pbnRlcm5hbC1zZWNyZXQtMTIzJyxcbiAgICAgICAgbWV0YWRhdGE6IHsgdGVzdDogJ2RhdGEnIH0sXG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICAgICAgY2xhaW1zOiB7XG4gICAgICAgICAgICAgIHN1YjogbW9ja1VzZXJJZCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoaW50ZXJuYWxFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgLy8gU2hvdWxkIG5vdCBnbyB0aHJvdWdoIEFQSSBHYXRld2F5IGF1dGhvcml6YXRpb24gY2hlY2tzXG4gICAgICBleHBlY3QocmVzdWx0LmhlYWRlcnMpLnRvSGF2ZVByb3BlcnR5KCdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nLCAnKicpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBjb3JyZWN0bHkgaWRlbnRpZnkgQVBJIEdhdGV3YXkgZXZlbnRzJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgYXBpR2F0ZXdheUV2ZW50OiBQYXJ0aWFsPEFQSUdhdGV3YXlQcm94eUV2ZW50PiA9IHtcbiAgICAgICAgcGF0aFBhcmFtZXRlcnM6IHsgdXNlcklkOiBtb2NrVXNlcklkIH0sXG4gICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICAgICAgY2xhaW1zOiB7IHN1YjogbW9ja1VzZXJJZCB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0gYXMgYW55LFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IG1ldGFkYXRhOiB7IHNvdXJjZTogJ3dlYicgfSB9KSxcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoYXBpR2F0ZXdheUV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keSkudG9IYXZlUHJvcGVydHkoJ3JlYWRpbmdJZCcpO1xuXG4gICAgICAvLyBWZXJpZnkgbWV0YWRhdGEgZnJvbSByZXF1ZXN0IGJvZHkgd2FzIHVzZWRcbiAgICAgIGV4cGVjdChkeW5hbW9Nb2NrKS50b0hhdmVSZWNlaXZlZENvbW1hbmRXaXRoKFB1dENvbW1hbmQsIHtcbiAgICAgICAgVGFibGVOYW1lOiAndGVzdC1yZWFkaW5ncy10YWJsZScsXG4gICAgICAgIEl0ZW06IGV4cGVjdC5vYmplY3RDb250YWluaW5nKHtcbiAgICAgICAgICBtZXRhZGF0YTogeyBzb3VyY2U6ICd3ZWInIH0sXG4gICAgICAgIH0pLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHJlamVjdCBldmVudHMgd2l0aCB3cm9uZyBzb3VyY2UgdmFsdWUnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBpbnZhbGlkRXZlbnQgPSB7XG4gICAgICAgIHNvdXJjZTogJ2ludmFsaWQnLFxuICAgICAgICB1c2VySWQ6IG1vY2tVc2VySWQsXG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICAgICAgY2xhaW1zOiB7XG4gICAgICAgICAgICAgIHN1YjogJ2RpZmZlcmVudC11c2VyJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH07XG5cbiAgICAgIC8vIFRoaXMgc2hvdWxkIGJlIHRyZWF0ZWQgYXMgQVBJIEdhdGV3YXkgZXZlbnQgYW5kIGZhaWwgYXV0aG9yaXphdGlvblxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgaGFuZGxlcihpbnZhbGlkRXZlbnQgYXMgdW5rbm93biBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSg0MDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkubWVzc2FnZSkudG9CZSgndXNlcklkIGlzIHJlcXVpcmVkJyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHJlamVjdCBpbnRlcm5hbCBldmVudHMgbWlzc2luZyB1c2VySWQnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBpbnZhbGlkRXZlbnQgPSB7XG4gICAgICAgIHNvdXJjZTogJ3dlYmhvb2snIGFzIGNvbnN0LFxuICAgICAgICBtZXRhZGF0YTogeyB0ZXN0OiAnZGF0YScgfSxcbiAgICAgICAgcmVxdWVzdENvbnRleHQ6IHtcbiAgICAgICAgICBhdXRob3JpemVyOiB7XG4gICAgICAgICAgICBjbGFpbXM6IHtcbiAgICAgICAgICAgICAgc3ViOiAndXNlci0xMjMnLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfTtcblxuICAgICAgLy8gTWlzc2luZyB1c2VySWQgc2hvdWxkIGZhaWwgdHlwZSBndWFyZFxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgaGFuZGxlcihpbnZhbGlkRXZlbnQgYXMgdW5rbm93biBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSg0MDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkubWVzc2FnZSkudG9CZSgndXNlcklkIGlzIHJlcXVpcmVkJyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBldmVudHMgd2l0aCBwYXRoUGFyYW1ldGVycyBhcyBpbnRlcm5hbCBpZiBzb3VyY2UgaXMgd2ViaG9vaycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGh5YnJpZEV2ZW50ID0ge1xuICAgICAgICBzb3VyY2U6ICd3ZWJob29rJyBhcyBjb25zdCxcbiAgICAgICAgdXNlcklkOiBtb2NrVXNlcklkLFxuICAgICAgICBpbnRlcm5hbFNlY3JldDogJ3Rlc3QtaW50ZXJuYWwtc2VjcmV0LTEyMycsXG4gICAgICAgIHBhdGhQYXJhbWV0ZXJzOiB7IHVzZXJJZDogJ3Nob3VsZC1iZS1pZ25vcmVkJyB9LCAvLyBwYXRoUGFyYW1ldGVycyBwcmVzZW5jZSBmYWlscyB0eXBlIGd1YXJkXG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICAgICAgY2xhaW1zOiB7XG4gICAgICAgICAgICAgIHN1YjogbW9ja1VzZXJJZCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH07XG5cbiAgICAgIC8vIHBhdGhQYXJhbWV0ZXJzIHByZXNlbmNlIGNhdXNlcyB0eXBlIGd1YXJkIHRvIGZhaWwsIHRyZWF0aW5nIGFzIEFQSSBHYXRld2F5IGV2ZW50XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGh5YnJpZEV2ZW50IGFzIHVua25vd24gYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICAvLyBTaG91bGQgZmFpbCBhdXRob3JpemF0aW9uIHNpbmNlIHBhdGggdXNlcklkIGRvZXNuJ3QgbWF0Y2ggY2xhaW1zXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoNDAzKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ01ldGFkYXRhIGhhbmRsaW5nIGluIHJlYWRpbmcgZ2VuZXJhdGlvbicsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIHByZXNlcnZlIGFsbCBtZXRhZGF0YSB0eXBlcyBpbiByZWFkaW5nIHJlY29yZCcsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGNvbXBsZXhNZXRhZGF0YSA9IHtcbiAgICAgICAgc2Vzc2lvbklkOiAnY3NfdGVzdF8xMjMnLFxuICAgICAgICBjdXN0b21lckVtYWlsOiAndGVzdEBleGFtcGxlLmNvbScsXG4gICAgICAgIGFtb3VudFRvdGFsOiAyOTAwLFxuICAgICAgICBjdXJyZW5jeTogJ3VzZCcsXG4gICAgICAgIGlzU3Vic2NyaXB0aW9uOiB0cnVlLFxuICAgICAgICBzdWJzY3JpcHRpb25JdGVtczogMyxcbiAgICAgICAgcHJvbW9Db2RlOiAnU0FWRTIwJyxcbiAgICAgICAgcmVmZXJyZXI6ICduZXdzbGV0dGVyJyxcbiAgICAgICAgY3VzdG9tRmllbGQ6ICdjdXN0b20tdmFsdWUnLFxuICAgICAgfTtcblxuICAgICAgY29uc3QgaW50ZXJuYWxFdmVudCA9IHtcbiAgICAgICAgc291cmNlOiAnd2ViaG9vaycgYXMgY29uc3QsXG4gICAgICAgIHVzZXJJZDogbW9ja1VzZXJJZCxcbiAgICAgICAgaW50ZXJuYWxTZWNyZXQ6ICd0ZXN0LWludGVybmFsLXNlY3JldC0xMjMnLFxuICAgICAgICBtZXRhZGF0YTogY29tcGxleE1ldGFkYXRhLFxuICAgICAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgICAgIGF1dGhvcml6ZXI6IHtcbiAgICAgICAgICAgIGNsYWltczoge1xuICAgICAgICAgICAgICBzdWI6IG1vY2tVc2VySWQsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9O1xuXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGludGVybmFsRXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcblxuICAgICAgLy8gVmVyaWZ5IGFsbCBtZXRhZGF0YSB3YXMgcHJlc2VydmVkXG4gICAgICBleHBlY3QoZHluYW1vTW9jaykudG9IYXZlUmVjZWl2ZWRDb21tYW5kV2l0aChQdXRDb21tYW5kLCB7XG4gICAgICAgIFRhYmxlTmFtZTogJ3Rlc3QtcmVhZGluZ3MtdGFibGUnLFxuICAgICAgICBJdGVtOiBleHBlY3Qub2JqZWN0Q29udGFpbmluZyh7XG4gICAgICAgICAgbWV0YWRhdGE6IGNvbXBsZXhNZXRhZGF0YSxcbiAgICAgICAgfSksXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIG1ldGFkYXRhIGZyb20gQVBJIEdhdGV3YXkgcmVxdWVzdCBib2R5JywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgYXBpTWV0YWRhdGEgPSB7XG4gICAgICAgIHNvdXJjZTogJ21vYmlsZS1hcHAnLFxuICAgICAgICB2ZXJzaW9uOiAnMS4yLjMnLFxuICAgICAgICBkZXZpY2VJZDogJ2RldmljZS0xMjMnLFxuICAgICAgfTtcblxuICAgICAgY29uc3QgYXBpR2F0ZXdheUV2ZW50OiBQYXJ0aWFsPEFQSUdhdGV3YXlQcm94eUV2ZW50PiA9IHtcbiAgICAgICAgcGF0aFBhcmFtZXRlcnM6IHsgdXNlcklkOiBtb2NrVXNlcklkIH0sXG4gICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICAgICAgY2xhaW1zOiB7IHN1YjogbW9ja1VzZXJJZCB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0gYXMgYW55LFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IG1ldGFkYXRhOiBhcGlNZXRhZGF0YSB9KSxcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoYXBpR2F0ZXdheUV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG5cbiAgICAgIC8vIFZlcmlmeSBBUEkgbWV0YWRhdGEgd2FzIHNhdmVkXG4gICAgICBleHBlY3QoZHluYW1vTW9jaykudG9IYXZlUmVjZWl2ZWRDb21tYW5kV2l0aChQdXRDb21tYW5kLCB7XG4gICAgICAgIFRhYmxlTmFtZTogJ3Rlc3QtcmVhZGluZ3MtdGFibGUnLFxuICAgICAgICBJdGVtOiBleHBlY3Qub2JqZWN0Q29udGFpbmluZyh7XG4gICAgICAgICAgbWV0YWRhdGE6IGFwaU1ldGFkYXRhLFxuICAgICAgICB9KSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgaW52YWxpZCBKU09OIGluIEFQSSBHYXRld2F5IGJvZHkgZ3JhY2VmdWxseScsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGFwaUdhdGV3YXlFdmVudDogUGFydGlhbDxBUElHYXRld2F5UHJveHlFdmVudD4gPSB7XG4gICAgICAgIHBhdGhQYXJhbWV0ZXJzOiB7IHVzZXJJZDogbW9ja1VzZXJJZCB9LFxuICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgICAgIGF1dGhvcml6ZXI6IHtcbiAgICAgICAgICAgIGNsYWltczogeyBzdWI6IG1vY2tVc2VySWQgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9IGFzIGFueSxcbiAgICAgICAgYm9keTogJ2ludmFsaWQganNvbiB7JyxcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoYXBpR2F0ZXdheUV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG5cbiAgICAgIC8vIFNob3VsZCBwcm9jZWVkIHdpdGhvdXQgbWV0YWRhdGFcbiAgICAgIGNvbnN0IHB1dENhbGxzID0gZHluYW1vTW9jay5jb21tYW5kQ2FsbHMoUHV0Q29tbWFuZCk7XG4gICAgICBjb25zdCBmaXJzdFB1dENhbGwgPSBwdXRDYWxsc1swXTtcbiAgICAgIGV4cGVjdChmaXJzdFB1dENhbGwuYXJnc1swXS5pbnB1dC5JdGVtKS5ub3QudG9IYXZlUHJvcGVydHkoJ21ldGFkYXRhJyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBudWxsIGJvZHkgaW4gQVBJIEdhdGV3YXkgZXZlbnQnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBhcGlHYXRld2F5RXZlbnQ6IFBhcnRpYWw8QVBJR2F0ZXdheVByb3h5RXZlbnQ+ID0ge1xuICAgICAgICBwYXRoUGFyYW1ldGVyczogeyB1c2VySWQ6IG1vY2tVc2VySWQgfSxcbiAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgICAgcmVxdWVzdENvbnRleHQ6IHtcbiAgICAgICAgICBhdXRob3JpemVyOiB7XG4gICAgICAgICAgICBjbGFpbXM6IHsgc3ViOiBtb2NrVXNlcklkIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSBhcyBhbnksXG4gICAgICAgIGJvZHk6IG51bGwsXG4gICAgICB9O1xuXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGFwaUdhdGV3YXlFdmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuXG4gICAgICAvLyBTaG91bGQgcHJvY2VlZCB3aXRob3V0IG1ldGFkYXRhXG4gICAgICBjb25zdCBwdXRDYWxscyA9IGR5bmFtb01vY2suY29tbWFuZENhbGxzKFB1dENvbW1hbmQpO1xuICAgICAgY29uc3QgZmlyc3RQdXRDYWxsID0gcHV0Q2FsbHNbMF07XG4gICAgICBleHBlY3QoZmlyc3RQdXRDYWxsLmFyZ3NbMF0uaW5wdXQuSXRlbSkubm90LnRvSGF2ZVByb3BlcnR5KCdtZXRhZGF0YScpO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnRXJyb3IgaGFuZGxpbmcgaW4gaW50ZXJuYWwgaW52b2NhdGlvbicsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBPcGVuQUkgQVBJIGZhaWx1cmUgZm9yIGludGVybmFsIGludm9jYXRpb24nLCBhc3luYyAoKSA9PiB7XG4gICAgICAvLyBNb2NrIE9wZW5BSSBBUEkgZmFpbHVyZVxuICAgICAgKGdsb2JhbC5mZXRjaCBhcyBqZXN0Lk1vY2spLm1vY2tSZWplY3RlZFZhbHVlKG5ldyBFcnJvcignT3BlbkFJIEFQSSBlcnJvcicpKTtcblxuICAgICAgY29uc3QgaW50ZXJuYWxFdmVudCA9IHtcbiAgICAgICAgc291cmNlOiAnd2ViaG9vaycgYXMgY29uc3QsXG4gICAgICAgIHVzZXJJZDogbW9ja1VzZXJJZCxcbiAgICAgICAgaW50ZXJuYWxTZWNyZXQ6ICd0ZXN0LWludGVybmFsLXNlY3JldC0xMjMnLFxuICAgICAgICBtZXRhZGF0YTogeyBzZXNzaW9uSWQ6ICdjc190ZXN0XzEyMycgfSxcbiAgICAgICAgcmVxdWVzdENvbnRleHQ6IHtcbiAgICAgICAgICBhdXRob3JpemVyOiB7XG4gICAgICAgICAgICBjbGFpbXM6IHtcbiAgICAgICAgICAgICAgc3ViOiBtb2NrVXNlcklkLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfTtcblxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgaGFuZGxlcihpbnRlcm5hbEV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDUwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5tZXNzYWdlKS50b0JlKFxuICAgICAgICBcIldlJ3JlIHNvcnJ5LCBidXQgd2UgY291bGRuJ3QgZ2VuZXJhdGUgeW91ciByZWFkaW5nIGF0IHRoaXMgdGltZS4gUGxlYXNlIHRyeSBhZ2FpbiBsYXRlci5cIixcbiAgICAgICk7XG5cbiAgICAgIC8vIFZlcmlmeSByZWFkaW5nIHdhcyBtYXJrZWQgYXMgZmFpbGVkXG4gICAgICBleHBlY3QoZHluYW1vTW9jaykudG9IYXZlUmVjZWl2ZWRDb21tYW5kV2l0aChQdXRDb21tYW5kLCB7XG4gICAgICAgIFRhYmxlTmFtZTogJ3Rlc3QtcmVhZGluZ3MtdGFibGUnLFxuICAgICAgICBJdGVtOiBleHBlY3Qub2JqZWN0Q29udGFpbmluZyh7XG4gICAgICAgICAgc3RhdHVzOiAnRmFpbGVkJyxcbiAgICAgICAgICBlcnJvcjogZXhwZWN0LmFueShTdHJpbmcpLFxuICAgICAgICB9KSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgRHluYW1vREIgZXJyb3JzIGZvciBpbnRlcm5hbCBpbnZvY2F0aW9uJywgYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gTW9jayBEeW5hbW9EQiBlcnJvciBvbiBpbml0aWFsIHNhdmVcbiAgICAgIGR5bmFtb01vY2sub24oUHV0Q29tbWFuZCkucmVqZWN0cyhuZXcgRXJyb3IoJ0R5bmFtb0RCIGVycm9yJykpO1xuXG4gICAgICBjb25zdCBpbnRlcm5hbEV2ZW50ID0ge1xuICAgICAgICBzb3VyY2U6ICd3ZWJob29rJyBhcyBjb25zdCxcbiAgICAgICAgdXNlcklkOiBtb2NrVXNlcklkLFxuICAgICAgICBpbnRlcm5hbFNlY3JldDogJ3Rlc3QtaW50ZXJuYWwtc2VjcmV0LTEyMycsXG4gICAgICAgIG1ldGFkYXRhOiB7IHNlc3Npb25JZDogJ2NzX3Rlc3RfMTIzJyB9LFxuICAgICAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgICAgIGF1dGhvcml6ZXI6IHtcbiAgICAgICAgICAgIGNsYWltczoge1xuICAgICAgICAgICAgICBzdWI6IG1vY2tVc2VySWQsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9O1xuXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGludGVybmFsRXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoNTAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5Lm1lc3NhZ2UpLnRvQ29udGFpbihcImNvdWxkbid0IGdlbmVyYXRlIHlvdXIgcmVhZGluZ1wiKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIFMzIHByb21wdCBmZXRjaCBlcnJvcnMgZm9yIGludGVybmFsIGludm9jYXRpb24nLCBhc3luYyAoKSA9PiB7XG4gICAgICAvLyBNb2NrIFMzIGVycm9yXG4gICAgICBzM01vY2sub24oR2V0T2JqZWN0Q29tbWFuZCkucmVqZWN0cyhuZXcgRXJyb3IoJ1MzIGFjY2VzcyBkZW5pZWQnKSk7XG5cbiAgICAgIGNvbnN0IGludGVybmFsRXZlbnQgPSB7XG4gICAgICAgIHNvdXJjZTogJ3dlYmhvb2snIGFzIGNvbnN0LFxuICAgICAgICB1c2VySWQ6IG1vY2tVc2VySWQsXG4gICAgICAgIGludGVybmFsU2VjcmV0OiAndGVzdC1pbnRlcm5hbC1zZWNyZXQtMTIzJyxcbiAgICAgICAgbWV0YWRhdGE6IHsgc2Vzc2lvbklkOiAnY3NfdGVzdF8xMjMnIH0sXG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICAgICAgY2xhaW1zOiB7XG4gICAgICAgICAgICAgIHN1YjogbW9ja1VzZXJJZCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoaW50ZXJuYWxFdmVudCk7XG5cbiAgICAgIC8vIFNob3VsZCBmYWxsIGJhY2sgdG8gZGVmYXVsdCBwcm9tcHRzIGFuZCBzdWNjZWVkXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5KS50b0hhdmVQcm9wZXJ0eSgncmVhZGluZ0lkJyk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdBdXRob3JpemF0aW9uIGNvbnRleHQgaGFuZGxpbmcnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCB1c2UgcHJvdmlkZWQgcmVxdWVzdENvbnRleHQgZm9yIGludGVybmFsIGludm9jYXRpb24nLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBpbnRlcm5hbEV2ZW50ID0ge1xuICAgICAgICBzb3VyY2U6ICd3ZWJob29rJyBhcyBjb25zdCxcbiAgICAgICAgdXNlcklkOiBtb2NrVXNlcklkLFxuICAgICAgICBpbnRlcm5hbFNlY3JldDogJ3Rlc3QtaW50ZXJuYWwtc2VjcmV0LTEyMycsXG4gICAgICAgIG1ldGFkYXRhOiB7IHNlc3Npb25JZDogJ2NzX3Rlc3RfMTIzJyB9LFxuICAgICAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgICAgIGF1dGhvcml6ZXI6IHtcbiAgICAgICAgICAgIGNsYWltczoge1xuICAgICAgICAgICAgICBzdWI6IG1vY2tVc2VySWQsXG4gICAgICAgICAgICAgIGVtYWlsOiAnd2ViaG9va0BleGFtcGxlLmNvbScsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9O1xuXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGludGVybmFsRXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIC8vIFRoZSBhdXRob3JpemF0aW9uIGNvbnRleHQgaXMgdXNlZCBidXQgbm90IHZhbGlkYXRlZCBmb3IgaW50ZXJuYWwgaW52b2NhdGlvbnNcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgd29yayB3aXRob3V0IHJlcXVlc3RDb250ZXh0IGZvciBpbnRlcm5hbCBpbnZvY2F0aW9uJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgaW50ZXJuYWxFdmVudCA9IHtcbiAgICAgICAgc291cmNlOiAnd2ViaG9vaycgYXMgY29uc3QsXG4gICAgICAgIHVzZXJJZDogbW9ja1VzZXJJZCxcbiAgICAgICAgaW50ZXJuYWxTZWNyZXQ6ICd0ZXN0LWludGVybmFsLXNlY3JldC0xMjMnLFxuICAgICAgICBtZXRhZGF0YTogeyBzZXNzaW9uSWQ6ICdjc190ZXN0XzEyMycgfSxcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoaW50ZXJuYWxFdmVudCk7XG5cbiAgICAgIC8vIFNob3VsZCBzdGlsbCBzdWNjZWVkIGFzIGludGVybmFsIGludm9jYXRpb25zIGRvbid0IHJlcXVpcmUgYXV0aCBjb250ZXh0XG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICB9KTtcbiAgfSk7XG59KTtcbiJdfQ==