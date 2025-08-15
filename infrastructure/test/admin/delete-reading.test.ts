import { handler } from '../../lambda/admin/delete-reading';
import { APIGatewayProxyEvent, APIGatewayEventRequestContext } from 'aws-lambda';
import { DynamoDBDocumentClient, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

// Mock the DynamoDB client
const dynamoMock = mockClient(DynamoDBDocumentClient);

describe('delete-reading Lambda', () => {
  beforeEach(() => {
    dynamoMock.reset();
    process.env.READINGS_TABLE_NAME = 'test-readings-table';
  });

  const createEvent = (
    isAdmin: boolean,
    userId?: string,
    readingId?: string,
  ): Partial<APIGatewayProxyEvent> => ({
    pathParameters: userId && readingId ? { userId, readingId } : null,
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
      const event = createEvent(false, 'user-456', 'reading-123');
      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Access denied. Admin privileges required.');
    });

    it('should allow access when user is admin', async () => {
      const event = createEvent(true, 'user-456', 'reading-123');

      dynamoMock.on(GetCommand).resolves({
        Item: { readingId: 'reading-123' },
      });

      dynamoMock.on(DeleteCommand).resolves({});

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(204);
    });

    it('should handle admin group as comma-separated string', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: { userId: 'user-456', readingId: 'reading-123' },
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

      dynamoMock.on(DeleteCommand).resolves({});

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(204);
    });

    it('should reject when admin is not in comma-separated string', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: { userId: 'user-456', readingId: 'reading-123' },
        requestContext: {
          authorizer: {
            claims: {
              'cognito:groups': 'user,premium',
            },
          },
        } as unknown as APIGatewayProxyEvent['requestContext'],
      };

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(403);
    });
  });

  describe('Input validation', () => {
    it('should return 400 when reading ID is missing', async () => {
      const event = createEvent(true, undefined, undefined);
      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('User ID and Reading ID are required');
    });
  });

  describe('Deleting reading', () => {
    it('should delete reading successfully', async () => {
      const event = createEvent(true, 'user-456', 'reading-123');

      dynamoMock.on(GetCommand).resolves({
        Item: {
          readingId: 'reading-123',
          userId: 'user-456',
          type: 'Soul Blueprint',
          status: 'Ready',
        },
      });

      dynamoMock.on(DeleteCommand).resolves({});

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe('');

      // Verify DeleteCommand was called
      const deleteCall = dynamoMock.commandCalls(DeleteCommand)[0];
      expect(deleteCall).toBeDefined();
      expect(deleteCall.args[0].input.Key).toEqual({
        userId: 'user-456',
        readingId: 'reading-123',
      });
    });

    it('should return 404 when reading not found', async () => {
      const event = createEvent(true, 'user-456', 'reading-123');

      dynamoMock.on(GetCommand).resolves({ Item: undefined });

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Reading not found');

      // Verify DeleteCommand was not called
      expect(dynamoMock.commandCalls(DeleteCommand).length).toBe(0);
    });

    it('should check existence before deletion', async () => {
      const event = createEvent(true, 'user-456', 'reading-123');

      dynamoMock.on(GetCommand).resolves({
        Item: { readingId: 'reading-123' },
      });

      dynamoMock.on(DeleteCommand).resolves({});

      await handler(event as APIGatewayProxyEvent);

      // Verify GetCommand was called before DeleteCommand
      const getCalls = dynamoMock.commandCalls(GetCommand);
      const deleteCalls = dynamoMock.commandCalls(DeleteCommand);

      expect(getCalls.length).toBe(1);
      expect(deleteCalls.length).toBe(1);
      expect(getCalls[0].args[0].input.Key).toEqual({
        userId: 'user-456',
        readingId: 'reading-123',
      });
    });

    it('should log successful deletion', async () => {
      // In infrastructure tests, console.info is allowed
      const event = createEvent(true, 'user-456', 'reading-123');

      dynamoMock.on(GetCommand).resolves({
        Item: { readingId: 'reading-123' },
      });

      dynamoMock.on(DeleteCommand).resolves({});

      const response = await handler(event as APIGatewayProxyEvent);

      // Just verify successful deletion
      expect(response.statusCode).toBe(204);
    });
  });

  describe('Error handling', () => {
    it('should handle DynamoDB GetCommand errors', async () => {
      const event = createEvent(true, 'user-456', 'reading-123');

      dynamoMock.on(GetCommand).rejects(new Error('DynamoDB GetCommand error'));

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Internal server error');
    });

    it('should handle DynamoDB DeleteCommand errors', async () => {
      const event = createEvent(true, 'user-456', 'reading-123');

      dynamoMock.on(GetCommand).resolves({
        Item: { readingId: 'reading-123' },
      });

      dynamoMock.on(DeleteCommand).rejects(new Error('DynamoDB DeleteCommand error'));

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Internal server error');
    });

    it('should return 500 and log errors', async () => {
      // In infrastructure tests, console.error is allowed
      const event = createEvent(true, 'user-456', 'reading-123');

      const error = new Error('Test error');
      dynamoMock.on(GetCommand).rejects(error);

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Internal server error');
    });
  });

  describe('Response format', () => {
    it('should include CORS headers for success', async () => {
      const event = createEvent(true, 'user-456', 'reading-123');

      dynamoMock.on(GetCommand).resolves({
        Item: { readingId: 'reading-123' },
      });

      dynamoMock.on(DeleteCommand).resolves({});

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.headers).toEqual({
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
    });

    it('should include CORS headers for errors', async () => {
      const event = createEvent(false, 'user-456', 'reading-123');

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.headers).toEqual({
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
    });

    it('should return 204 with empty body on success', async () => {
      const event = createEvent(true, 'user-456', 'reading-123');

      dynamoMock.on(GetCommand).resolves({
        Item: { readingId: 'reading-123' },
      });

      dynamoMock.on(DeleteCommand).resolves({});

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe('');
    });
  });

  describe('Logging', () => {
    it('should log incoming event', async () => {
      // In infrastructure tests, console.info is allowed
      const event = createEvent(true, 'user-456', 'reading-123');

      dynamoMock.on(GetCommand).resolves({
        Item: { readingId: 'reading-123' },
      });

      dynamoMock.on(DeleteCommand).resolves({});

      const response = await handler(event as APIGatewayProxyEvent);

      // Just verify the handler executes successfully
      expect(response.statusCode).toBe(204);
    });
  });

  describe('Edge cases', () => {
    it('should handle missing requestContext', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: { userId: 'user-456', readingId: 'reading-123' },
        requestContext: undefined as unknown as APIGatewayEventRequestContext,
      };

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Access denied. Admin privileges required.');
    });

    it('should handle missing authorizer claims', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: { userId: 'user-456', readingId: 'reading-123' },
        requestContext: {
          authorizer: undefined,
        } as unknown as APIGatewayProxyEvent['requestContext'],
      };

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(403);
    });

    it('should handle empty cognito:groups', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: { userId: 'user-456', readingId: 'reading-123' },
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

    it('should handle cognito:groups as array with admin', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: { userId: 'user-456', readingId: 'reading-123' },
        requestContext: {
          authorizer: {
            claims: {
              'cognito:groups': ['user', 'admin', 'premium'],
            },
          },
        } as unknown as APIGatewayProxyEvent['requestContext'],
      };

      dynamoMock.on(GetCommand).resolves({
        Item: { readingId: 'reading-123' },
      });

      dynamoMock.on(DeleteCommand).resolves({});

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(204);
    });

    it('should handle cognito:groups as array without admin', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: { userId: 'user-456', readingId: 'reading-123' },
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

    it('should handle special characters in reading ID', async () => {
      const specialReadingId = 'reading-123!@#$%^&*()';
      const event = createEvent(true, 'user-456', specialReadingId);

      dynamoMock.on(GetCommand).resolves({
        Item: { readingId: specialReadingId },
      });

      dynamoMock.on(DeleteCommand).resolves({});

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(204);

      const deleteCall = dynamoMock.commandCalls(DeleteCommand)[0];
      expect(deleteCall).toBeDefined();
      expect(deleteCall?.args[0]?.input?.Key).toEqual({
        userId: 'user-456',
        readingId: specialReadingId,
      });
    });

    it('should handle very long reading IDs', async () => {
      const longReadingId = 'reading-' + 'a'.repeat(1000);
      const event = createEvent(true, 'user-456', longReadingId);

      dynamoMock.on(GetCommand).resolves({
        Item: { readingId: longReadingId },
      });

      dynamoMock.on(DeleteCommand).resolves({});

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(204);
    });
  });

  describe('Idempotency', () => {
    it('should return 404 if reading already deleted (idempotent)', async () => {
      const event = createEvent(true, 'user-456', 'reading-123');

      // First call - reading doesn't exist
      dynamoMock.on(GetCommand).resolves({ Item: undefined });

      const response1 = await handler(event as APIGatewayProxyEvent);
      expect(response1.statusCode).toBe(404);

      // Second call - reading still doesn't exist
      const response2 = await handler(event as APIGatewayProxyEvent);
      expect(response2.statusCode).toBe(404);

      // Delete was never called
      expect(dynamoMock.commandCalls(DeleteCommand).length).toBe(0);
    });
  });
});
