import { handler } from '../../lambda/readings/generate-reading';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { Readable } from 'stream';

// Mock the DynamoDB, SSM, and S3 clients
const dynamoMock = mockClient(DynamoDBDocumentClient);
const ssmMock = mockClient(SSMClient);
const s3Mock = mockClient(S3Client);

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
    (global.fetch as jest.Mock).mockReset();

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
      .on(GetCommand, {
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
      .on(GetCommand, {
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
      .on(GetParameterCommand, { Name: '/test/openai-key' })
      .resolves({ Parameter: { Value: 'test-api-key' } });
    ssmMock
      .on(GetParameterCommand, { Name: '/test/reading-model' })
      .resolves({ Parameter: { Value: 'gpt-4' } });
    ssmMock
      .on(GetParameterCommand, { Name: '/test/reading-temperature' })
      .resolves({ Parameter: { Value: '0.7' } });
    ssmMock
      .on(GetParameterCommand, { Name: '/test/reading-max-tokens' })
      .resolves({ Parameter: { Value: '1500' } });
    ssmMock
      .on(GetParameterCommand, { Name: '/test/system-prompt-key' })
      .resolves({ Parameter: { Value: 'prompts/test/system.txt' } });
    ssmMock
      .on(GetParameterCommand, { Name: '/test/user-prompt-key' })
      .resolves({ Parameter: { Value: 'prompts/test/user.txt' } });

    // Mock S3 prompts
    const systemPrompt = 'You are an expert astrologer.';
    const userPromptTemplate = 'Generate a reading for {{birthName}}.';

    s3Mock
      .on(GetObjectCommand, {
        Bucket: 'test-config-bucket',
        Key: 'prompts/test/system.txt',
      })
      .resolves({
        Body: Readable.from([systemPrompt]) as any,
        ETag: 'test-etag-1',
      });

    s3Mock
      .on(GetObjectCommand, {
        Bucket: 'test-config-bucket',
        Key: 'prompts/test/user.txt',
      })
      .resolves({
        Body: Readable.from([userPromptTemplate]) as any,
        ETag: 'test-etag-2',
      });

    // Mock OpenAI API response
    (global.fetch as jest.Mock).mockResolvedValue({
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
    dynamoMock.on(PutCommand).resolves({});
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
        source: 'webhook' as const,
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

      const result = await handler(internalEvent);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body).toHaveProperty('readingId');
      expect(body).toHaveProperty('message', 'Reading generated successfully');

      // Verify reading was saved with metadata
      expect(dynamoMock).toHaveReceivedCommandWith(PutCommand, {
        TableName: 'test-readings-table',
        Item: expect.objectContaining({
          userId: mockUserId,
          type: 'Soul Blueprint',
          status: 'Processing',
          metadata,
        }),
      });

      // Verify reading was updated with content
      expect(dynamoMock).toHaveReceivedCommandWith(PutCommand, {
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
        source: 'webhook' as const,
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

      const result = await handler(internalEvent);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body).toHaveProperty('readingId');

      // Verify reading was saved without metadata field
      const putCalls = dynamoMock.commandCalls(PutCommand);
      const firstPutCall = putCalls[0];
      expect(firstPutCall.args[0].input.Item).not.toHaveProperty('metadata');
    });

    it('should process internal invocation with empty metadata', async () => {
      const internalEvent = {
        source: 'webhook' as const,
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

      const result = await handler(internalEvent);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body).toHaveProperty('readingId');

      // Verify reading was saved without metadata field (empty object not included)
      const putCalls = dynamoMock.commandCalls(PutCommand);
      const firstPutCall = putCalls[0];
      expect(firstPutCall.args[0].input.Item).not.toHaveProperty('metadata');
    });

    it('should handle missing user profile for internal invocation', async () => {
      // Mock missing user profile
      dynamoMock
        .on(GetCommand, {
          TableName: 'test-user-table',
          Key: { userId: mockUserId, createdAt: 'PROFILE' },
        })
        .resolves({ Item: undefined });

      const internalEvent = {
        source: 'webhook' as const,
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

      const result = await handler(internalEvent);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('User profile not found');
    });

    it('should handle missing natal chart for internal invocation', async () => {
      // Mock missing natal chart
      dynamoMock
        .on(GetCommand, {
          TableName: 'test-natal-chart-table',
          Key: { userId: mockUserId },
        })
        .resolves({ Item: undefined });

      const internalEvent = {
        source: 'webhook' as const,
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

      const result = await handler(internalEvent);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('Natal chart not generated. Please complete your profile first.');
    });
  });

  describe('Type guard for internal invocation detection', () => {
    it('should correctly identify internal invocation events', async () => {
      const internalEvent = {
        source: 'webhook' as const,
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

      const result = await handler(internalEvent);

      expect(result.statusCode).toBe(200);
      // Should not go through API Gateway authorization checks
      expect(result.headers).toHaveProperty('Access-Control-Allow-Origin', '*');
    });

    it('should correctly identify API Gateway events', async () => {
      const apiGatewayEvent: Partial<APIGatewayProxyEvent> = {
        pathParameters: { userId: mockUserId },
        requestContext: {
          authorizer: {
            claims: { sub: mockUserId },
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
        body: JSON.stringify({ metadata: { source: 'web' } }),
      };

      const result = await handler(apiGatewayEvent as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body).toHaveProperty('readingId');

      // Verify metadata from request body was used
      expect(dynamoMock).toHaveReceivedCommandWith(PutCommand, {
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
      const result = await handler(invalidEvent as unknown as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('userId is required');
    });

    it('should reject internal events missing userId', async () => {
      const invalidEvent = {
        source: 'webhook' as const,
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
      const result = await handler(invalidEvent as unknown as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('userId is required');
    });

    it('should handle events with pathParameters as internal if source is webhook', async () => {
      const hybridEvent = {
        source: 'webhook' as const,
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
      const result = await handler(hybridEvent as unknown as APIGatewayProxyEvent);

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
        source: 'webhook' as const,
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

      const result = await handler(internalEvent);

      expect(result.statusCode).toBe(200);

      // Verify all metadata was preserved
      expect(dynamoMock).toHaveReceivedCommandWith(PutCommand, {
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

      const apiGatewayEvent: Partial<APIGatewayProxyEvent> = {
        pathParameters: { userId: mockUserId },
        requestContext: {
          authorizer: {
            claims: { sub: mockUserId },
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
        body: JSON.stringify({ metadata: apiMetadata }),
      };

      const result = await handler(apiGatewayEvent as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(200);

      // Verify API metadata was saved
      expect(dynamoMock).toHaveReceivedCommandWith(PutCommand, {
        TableName: 'test-readings-table',
        Item: expect.objectContaining({
          metadata: apiMetadata,
        }),
      });
    });

    it('should handle invalid JSON in API Gateway body gracefully', async () => {
      const apiGatewayEvent: Partial<APIGatewayProxyEvent> = {
        pathParameters: { userId: mockUserId },
        requestContext: {
          authorizer: {
            claims: { sub: mockUserId },
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
        body: 'invalid json {',
      };

      const result = await handler(apiGatewayEvent as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(200);

      // Should proceed without metadata
      const putCalls = dynamoMock.commandCalls(PutCommand);
      const firstPutCall = putCalls[0];
      expect(firstPutCall.args[0].input.Item).not.toHaveProperty('metadata');
    });

    it('should handle null body in API Gateway event', async () => {
      const apiGatewayEvent: Partial<APIGatewayProxyEvent> = {
        pathParameters: { userId: mockUserId },
        requestContext: {
          authorizer: {
            claims: { sub: mockUserId },
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
        body: null,
      };

      const result = await handler(apiGatewayEvent as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(200);

      // Should proceed without metadata
      const putCalls = dynamoMock.commandCalls(PutCommand);
      const firstPutCall = putCalls[0];
      expect(firstPutCall.args[0].input.Item).not.toHaveProperty('metadata');
    });
  });

  describe('Error handling in internal invocation', () => {
    it('should handle OpenAI API failure for internal invocation', async () => {
      // Mock OpenAI API failure
      (global.fetch as jest.Mock).mockRejectedValue(new Error('OpenAI API error'));

      const internalEvent = {
        source: 'webhook' as const,
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

      const result = await handler(internalEvent);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.message).toBe(
        "We're sorry, but we couldn't generate your reading at this time. Please try again later.",
      );

      // Verify reading was marked as failed
      expect(dynamoMock).toHaveReceivedCommandWith(PutCommand, {
        TableName: 'test-readings-table',
        Item: expect.objectContaining({
          status: 'Failed',
          error: expect.any(String),
        }),
      });
    });

    it('should handle DynamoDB errors for internal invocation', async () => {
      // Mock DynamoDB error on initial save
      dynamoMock.on(PutCommand).rejects(new Error('DynamoDB error'));

      const internalEvent = {
        source: 'webhook' as const,
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

      const result = await handler(internalEvent);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.message).toContain("couldn't generate your reading");
    });

    it('should handle S3 prompt fetch errors for internal invocation', async () => {
      // Mock S3 error
      s3Mock.on(GetObjectCommand).rejects(new Error('S3 access denied'));

      const internalEvent = {
        source: 'webhook' as const,
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

      const result = await handler(internalEvent);

      // Should fall back to default prompts and succeed
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body).toHaveProperty('readingId');
    });
  });

  describe('Authorization context handling', () => {
    it('should use provided requestContext for internal invocation', async () => {
      const internalEvent = {
        source: 'webhook' as const,
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

      const result = await handler(internalEvent);

      expect(result.statusCode).toBe(200);
      // The authorization context is used but not validated for internal invocations
    });

    it('should work without requestContext for internal invocation', async () => {
      const internalEvent = {
        source: 'webhook' as const,
        userId: mockUserId,
        internalSecret: 'test-internal-secret-123',
        metadata: { sessionId: 'cs_test_123' },
      };

      const result = await handler(internalEvent);

      // Should still succeed as internal invocations don't require auth context
      expect(result.statusCode).toBe(200);
    });
  });
});
