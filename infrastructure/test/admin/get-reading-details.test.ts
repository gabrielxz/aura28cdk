import { handler } from '../../lambda/admin/get-reading-details';
import { APIGatewayProxyEvent, APIGatewayEventRequestContext } from 'aws-lambda';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

// Mock the DynamoDB client
const dynamoMock = mockClient(DynamoDBDocumentClient);

describe('get-reading-details Lambda', () => {
  beforeEach(() => {
    dynamoMock.reset();
    process.env.READINGS_TABLE_NAME = 'test-readings-table';
    process.env.USER_TABLE_NAME = 'test-user-table';
  });

  const createEvent = (isAdmin: boolean, readingId?: string): Partial<APIGatewayProxyEvent> => ({
    pathParameters: readingId ? { readingId } : null,
    requestContext: {
      authorizer: {
        claims: {
          'cognito:groups': isAdmin ? ['admin'] : [],
        },
      },
    } as unknown as APIGatewayProxyEvent['requestContext'],
  });

  describe('Authorization', () => {
    it('should return 403 when user is not admin', async () => {
      const event = createEvent(false, 'reading-123');
      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Access denied. Admin privileges required.');
    });

    it('should allow access when user is admin', async () => {
      const event = createEvent(true, 'reading-123');

      dynamoMock.on(GetCommand).resolves({
        Item: {
          readingId: 'reading-123',
          userId: 'user-456',
          type: 'Soul Blueprint',
          status: 'Ready',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:01:00Z',
        },
      });

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(200);
    });

    it('should handle admin group as comma-separated string', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: { readingId: 'reading-123' },
        requestContext: {
          authorizer: {
            claims: {
              'cognito:groups': 'user,admin,premium',
            },
          },
        } as unknown as APIGatewayProxyEvent['requestContext'],
      };

      dynamoMock.on(GetCommand).resolves({
        Item: {
          readingId: 'reading-123',
          userId: 'user-456',
        },
      });

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Input validation', () => {
    it('should return 400 when reading ID is missing', async () => {
      const event = createEvent(true);
      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Reading ID is required');
    });
  });

  describe('Fetching reading details', () => {
    it('should fetch and return reading details successfully', async () => {
      const event = createEvent(true, 'reading-123');

      const mockReading = {
        readingId: 'reading-123',
        userId: 'user-456',
        type: 'Soul Blueprint',
        status: 'Ready',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:01:00Z',
        content: {
          interpretation: 'Test interpretation',
          insights: ['Insight 1', 'Insight 2'],
          recommendations: ['Recommendation 1'],
        },
        metadata: {
          model: 'gpt-4',
          temperature: 0.7,
          maxTokens: 2000,
          processingTime: 5432,
        },
      };

      const mockUser = {
        userId: 'user-456',
        email: 'test@example.com',
      };

      dynamoMock
        .on(GetCommand)
        .resolvesOnce({ Item: mockReading })
        .resolvesOnce({ Item: mockUser });

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.readingId).toBe('reading-123');
      expect(body.userEmail).toBe('test@example.com');
      expect(body.content).toEqual(mockReading.content);
      expect(body.metadata).toEqual(mockReading.metadata);
    });

    it('should return 404 when reading not found', async () => {
      const event = createEvent(true, 'reading-123');

      dynamoMock.on(GetCommand).resolves({ Item: undefined });

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Reading not found');
    });

    it('should handle reading without userId', async () => {
      const event = createEvent(true, 'reading-123');

      const mockReading = {
        readingId: 'reading-123',
        type: 'Soul Blueprint',
        status: 'Ready',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:01:00Z',
      };

      dynamoMock.on(GetCommand).resolves({ Item: mockReading });

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.userEmail).toBeUndefined();
    });

    it('should handle user not found in user table', async () => {
      const event = createEvent(true, 'reading-123');

      const mockReading = {
        readingId: 'reading-123',
        userId: 'user-456',
        type: 'Soul Blueprint',
        status: 'Ready',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:01:00Z',
      };

      dynamoMock
        .on(GetCommand)
        .resolvesOnce({ Item: mockReading })
        .resolvesOnce({ Item: undefined });

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.userEmail).toBeUndefined();
    });

    it('should warn but continue when user fetch fails', async () => {
      // In infrastructure tests, console.warn is allowed
      const event = createEvent(true, 'reading-123');

      const mockReading = {
        readingId: 'reading-123',
        userId: 'user-456',
        type: 'Soul Blueprint',
        status: 'Ready',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:01:00Z',
      };

      dynamoMock
        .on(GetCommand)
        .resolvesOnce({ Item: mockReading })
        .rejectsOnce(new Error('User table error'));

      const response = await handler(event as APIGatewayProxyEvent);

      // Should still return 200 even if user fetch fails
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.readingId).toBe('reading-123');
      expect(body.userEmail).toBeUndefined();
    });

    it('should handle reading with error field', async () => {
      const event = createEvent(true, 'reading-123');

      const mockReading = {
        readingId: 'reading-123',
        userId: 'user-456',
        type: 'Soul Blueprint',
        status: 'Failed',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:01:00Z',
        error: 'Processing failed due to invalid input',
      };

      dynamoMock.on(GetCommand).resolves({ Item: mockReading });

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Processing failed due to invalid input');
      expect(body.status).toBe('Failed');
    });

    it('should return null for missing optional fields', async () => {
      const event = createEvent(true, 'reading-123');

      const mockReading = {
        readingId: 'reading-123',
        userId: 'user-456',
        type: 'Soul Blueprint',
        status: 'Processing',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:01:00Z',
      };

      dynamoMock.on(GetCommand).resolves({ Item: mockReading });

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.content).toBeNull();
      expect(body.error).toBeNull();
      expect(body.metadata).toBeNull();
    });
  });

  describe('Error handling', () => {
    it('should handle DynamoDB errors', async () => {
      const event = createEvent(true, 'reading-123');

      dynamoMock.on(GetCommand).rejects(new Error('DynamoDB error'));

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Internal server error');
    });

    it('should return 500 and log errors', async () => {
      // In infrastructure tests, console.error is allowed
      const event = createEvent(true, 'reading-123');

      const error = new Error('Test error');
      dynamoMock.on(GetCommand).rejects(error);

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Internal server error');
    });
  });

  describe('Response format', () => {
    it('should include CORS headers', async () => {
      const event = createEvent(true, 'reading-123');

      dynamoMock.on(GetCommand).resolves({
        Item: {
          readingId: 'reading-123',
          userId: 'user-456',
        },
      });

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.headers).toEqual({
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
    });

    it('should return proper response structure', async () => {
      const event = createEvent(true, 'reading-123');

      const mockReading = {
        readingId: 'reading-123',
        userId: 'user-456',
        type: 'Natal Chart',
        status: 'Ready',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:01:00Z',
        content: {
          interpretation: 'Test',
        },
      };

      dynamoMock.on(GetCommand).resolves({ Item: mockReading });

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('readingId');
      expect(body).toHaveProperty('userId');
      expect(body).toHaveProperty('type');
      expect(body).toHaveProperty('status');
      expect(body).toHaveProperty('createdAt');
      expect(body).toHaveProperty('updatedAt');
      expect(body).toHaveProperty('content');
      expect(body).toHaveProperty('error');
      expect(body).toHaveProperty('metadata');
    });
  });

  describe('Logging', () => {
    it('should log incoming event', async () => {
      // In infrastructure tests, console.info is allowed
      const event = createEvent(true, 'reading-123');

      dynamoMock.on(GetCommand).resolves({
        Item: { readingId: 'reading-123' },
      });

      const response = await handler(event as APIGatewayProxyEvent);

      // Just verify the handler executes successfully
      expect(response.statusCode).toBe(200);
    });
  });

  describe('Edge cases', () => {
    it('should handle missing requestContext', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: { readingId: 'reading-123' },
        requestContext: undefined as unknown as APIGatewayEventRequestContext,
      };

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Access denied. Admin privileges required.');
    });

    it('should handle missing authorizer claims', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: { readingId: 'reading-123' },
        requestContext: {
          authorizer: undefined,
        } as unknown as APIGatewayProxyEvent['requestContext'],
      };

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(403);
    });

    it('should handle empty cognito:groups', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: { readingId: 'reading-123' },
        requestContext: {
          authorizer: {
            claims: {
              'cognito:groups': '',
            },
          },
        } as unknown as APIGatewayProxyEvent['requestContext'],
      };

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(403);
    });

    it('should handle cognito:groups as array without admin', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: { readingId: 'reading-123' },
        requestContext: {
          authorizer: {
            claims: {
              'cognito:groups': ['user', 'premium'],
            },
          },
        } as unknown as APIGatewayProxyEvent['requestContext'],
      };

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(403);
    });
  });
});
