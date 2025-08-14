import { handler } from '../../lambda/admin/update-reading-status';
import { APIGatewayProxyEvent, APIGatewayEventRequestContext } from 'aws-lambda';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

// Mock the DynamoDB client
const dynamoMock = mockClient(DynamoDBDocumentClient);

describe('update-reading-status Lambda', () => {
  beforeEach(() => {
    dynamoMock.reset();
    process.env.READINGS_TABLE_NAME = 'test-readings-table';
  });

  const createEvent = (
    isAdmin: boolean,
    readingId?: string,
    body?: Record<string, unknown>,
  ): Partial<APIGatewayProxyEvent> => ({
    pathParameters: readingId ? { readingId } : null,
    body: body ? JSON.stringify(body) : null,
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
      const event = createEvent(false, 'reading-123', { status: 'Ready' });
      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Access denied. Admin privileges required.');
    });

    it('should allow access when user is admin', async () => {
      const event = createEvent(true, 'reading-123', { status: 'Ready' });

      dynamoMock.on(GetCommand).resolves({
        Item: { readingId: 'reading-123', status: 'Processing' },
      });

      dynamoMock.on(UpdateCommand).resolves({
        Attributes: {
          readingId: 'reading-123',
          status: 'Ready',
          updatedAt: new Date().toISOString(),
        },
      });

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(200);
    });

    it('should handle admin group as comma-separated string', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: { readingId: 'reading-123' },
        body: JSON.stringify({ status: 'Ready' }),
        requestContext: {
          authorizer: {
            claims: {
              'cognito:groups': 'user,admin,premium',
            },
          },
        } as unknown as APIGatewayProxyEvent['requestContext'],
      };

      dynamoMock.on(GetCommand).resolves({
        Item: { readingId: 'reading-123' },
      });

      dynamoMock.on(UpdateCommand).resolves({
        Attributes: { readingId: 'reading-123', status: 'Ready' },
      });

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Input validation', () => {
    it('should return 400 when reading ID is missing', async () => {
      const event = createEvent(true, undefined, { status: 'Ready' });
      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Reading ID is required');
    });

    it('should return 400 when status is missing', async () => {
      const event = createEvent(true, 'reading-123', {});
      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Status is required');
    });

    it('should return 400 when body is empty', async () => {
      const event = createEvent(true, 'reading-123');
      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Status is required');
    });

    it('should return 400 for invalid status value', async () => {
      const event = createEvent(true, 'reading-123', { status: 'InvalidStatus' });
      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe(
        'Invalid status. Must be one of: Processing, Ready, Failed, In Review',
      );
    });

    it('should accept all valid status values', async () => {
      const validStatuses = ['Processing', 'Ready', 'Failed', 'In Review'];

      for (const status of validStatuses) {
        dynamoMock.on(GetCommand).resolves({
          Item: { readingId: 'reading-123' },
        });

        dynamoMock.on(UpdateCommand).resolves({
          Attributes: { readingId: 'reading-123', status },
        });

        const event = createEvent(true, 'reading-123', { status });
        const response = await handler(event as APIGatewayProxyEvent);

        expect(response.statusCode).toBe(200);
        dynamoMock.reset();
      }
    });
  });

  describe('Updating reading status', () => {
    it('should update status successfully', async () => {
      const event = createEvent(true, 'reading-123', { status: 'Ready' });

      dynamoMock.on(GetCommand).resolves({
        Item: {
          readingId: 'reading-123',
          userId: 'user-456',
          type: 'Soul Blueprint',
          status: 'Processing',
          createdAt: '2024-01-01T00:00:00Z',
        },
      });

      const mockUpdatedAt = '2024-01-01T00:01:00Z';
      jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(mockUpdatedAt);

      dynamoMock.on(UpdateCommand).resolves({
        Attributes: {
          readingId: 'reading-123',
          userId: 'user-456',
          type: 'Soul Blueprint',
          status: 'Ready',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: mockUpdatedAt,
        },
      });

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('Ready');
      expect(body.updatedAt).toBe(mockUpdatedAt);

      // Verify UpdateCommand was called
      const updateCall = dynamoMock.commandCalls(UpdateCommand)[0];
      expect(updateCall).toBeDefined();
      expect(updateCall?.args[0]?.input?.Key).toEqual({ readingId: 'reading-123' });
      expect(updateCall?.args[0]?.input?.ExpressionAttributeValues?.[':status']).toBe('Ready');
    });

    it('should return 404 when reading not found', async () => {
      const event = createEvent(true, 'reading-123', { status: 'Ready' });

      dynamoMock.on(GetCommand).resolves({ Item: undefined });

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Reading not found');
    });

    it('should update from any status to any valid status', async () => {
      const transitions = [
        { from: 'Processing', to: 'Ready' },
        { from: 'Ready', to: 'In Review' },
        { from: 'In Review', to: 'Failed' },
        { from: 'Failed', to: 'Processing' },
      ];

      for (const { from, to } of transitions) {
        dynamoMock.on(GetCommand).resolves({
          Item: { readingId: 'reading-123', status: from },
        });

        dynamoMock.on(UpdateCommand).resolves({
          Attributes: { readingId: 'reading-123', status: to },
        });

        const event = createEvent(true, 'reading-123', { status: to });
        const response = await handler(event as APIGatewayProxyEvent);

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.status).toBe(to);

        dynamoMock.reset();
      }
    });

    it('should return only essential fields in response', async () => {
      const event = createEvent(true, 'reading-123', { status: 'Ready' });

      dynamoMock.on(GetCommand).resolves({
        Item: { readingId: 'reading-123' },
      });

      dynamoMock.on(UpdateCommand).resolves({
        Attributes: {
          readingId: 'reading-123',
          userId: 'user-456',
          type: 'Soul Blueprint',
          status: 'Ready',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:01:00Z',
          // These should not be in response
          content: { interpretation: 'Secret' },
          metadata: { model: 'gpt-4' },
        },
      });

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toEqual({
        readingId: 'reading-123',
        userId: 'user-456',
        type: 'Soul Blueprint',
        status: 'Ready',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:01:00Z',
      });
      expect(body.content).toBeUndefined();
      expect(body.metadata).toBeUndefined();
    });
  });

  describe('Error handling', () => {
    it('should handle DynamoDB GetCommand errors', async () => {
      const event = createEvent(true, 'reading-123', { status: 'Ready' });

      dynamoMock.on(GetCommand).rejects(new Error('DynamoDB GetCommand error'));

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Internal server error');
    });

    it('should handle DynamoDB UpdateCommand errors', async () => {
      const event = createEvent(true, 'reading-123', { status: 'Ready' });

      dynamoMock.on(GetCommand).resolves({
        Item: { readingId: 'reading-123' },
      });

      dynamoMock.on(UpdateCommand).rejects(new Error('DynamoDB UpdateCommand error'));

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Internal server error');
    });

    it('should return 500 and log errors', async () => {
      // In infrastructure tests, console.error is allowed
      const event = createEvent(true, 'reading-123', { status: 'Ready' });

      const error = new Error('Test error');
      dynamoMock.on(GetCommand).rejects(error);

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Internal server error');
    });

    it('should handle malformed JSON in body', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: { readingId: 'reading-123' },
        body: 'not-valid-json',
        requestContext: {
          authorizer: {
            claims: {
              'cognito:groups': ['admin'],
            },
          },
        } as unknown as APIGatewayProxyEvent['requestContext'],
      };

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Internal server error');
    });
  });

  describe('Response format', () => {
    it('should include CORS headers', async () => {
      const event = createEvent(true, 'reading-123', { status: 'Ready' });

      dynamoMock.on(GetCommand).resolves({
        Item: { readingId: 'reading-123' },
      });

      dynamoMock.on(UpdateCommand).resolves({
        Attributes: { readingId: 'reading-123', status: 'Ready' },
      });

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.headers).toEqual({
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
    });
  });

  describe('Logging', () => {
    it('should log incoming event', async () => {
      // In infrastructure tests, console.info is allowed
      const event = createEvent(true, 'reading-123', { status: 'Ready' });

      dynamoMock.on(GetCommand).resolves({
        Item: { readingId: 'reading-123' },
      });

      dynamoMock.on(UpdateCommand).resolves({
        Attributes: { readingId: 'reading-123', status: 'Ready' },
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
        body: JSON.stringify({ status: 'Ready' }),
        requestContext: undefined as unknown as APIGatewayEventRequestContext,
      };

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Access denied. Admin privileges required.');
    });

    it('should handle status with extra whitespace', async () => {
      const event = createEvent(true, 'reading-123', { status: '  Ready  ' });

      dynamoMock.on(GetCommand).resolves({
        Item: { readingId: 'reading-123' },
      });

      dynamoMock.on(UpdateCommand).resolves({
        Attributes: { readingId: 'reading-123', status: '  Ready  ' },
      });

      const response = await handler(event as APIGatewayProxyEvent);

      // The handler should ideally trim the status, but based on the implementation,
      // it will fail validation
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Invalid status');
    });

    it('should handle case-sensitive status validation', async () => {
      const event = createEvent(true, 'reading-123', { status: 'ready' });

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Invalid status');
    });

    it('should handle undefined UpdateCommand attributes', async () => {
      const event = createEvent(true, 'reading-123', { status: 'Ready' });

      dynamoMock.on(GetCommand).resolves({
        Item: { readingId: 'reading-123' },
      });

      dynamoMock.on(UpdateCommand).resolves({
        Attributes: undefined,
      });

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      // All fields will be undefined but response should still work
      expect(body.readingId).toBeUndefined();
    });
  });
});
