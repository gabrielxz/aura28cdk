import { handler } from '../../lambda/admin/get-all-readings';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { DynamoDBDocumentClient, ScanCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

// Mock the DynamoDB client
const dynamoMock = mockClient(DynamoDBDocumentClient);

describe('get-all-readings Lambda', () => {
  beforeEach(() => {
    dynamoMock.reset();
    process.env.READINGS_TABLE_NAME = 'test-readings-table';
    process.env.USER_TABLE_NAME = 'test-user-table';
  });

  const createEvent = (
    isAdmin: boolean,
    queryParams?: Record<string, string>,
  ): Partial<APIGatewayProxyEvent> => ({
    queryStringParameters: queryParams || null,
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
      const event = createEvent(false);
      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Access denied. Admin privileges required.');
    });

    it('should allow access when user is admin', async () => {
      const event = createEvent(true);

      dynamoMock.on(ScanCommand).resolves({ Items: [] });

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(200);
    });

    it('should handle admin group as comma-separated string', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        requestContext: {
          authorizer: {
            claims: {
              'cognito:groups': 'user,admin,premium',
            },
          },
        } as unknown as APIGatewayProxyEvent['requestContext'],
      };

      dynamoMock.on(ScanCommand).resolves({ Items: [] });

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(200);
    });

    it('should reject when admin is not in comma-separated string', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
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

  describe('Fetching readings', () => {
    it('should fetch all readings without filters', async () => {
      const event = createEvent(true);

      const mockReadings = [
        {
          readingId: 'reading-1',
          userId: 'user-1',
          type: 'Soul Blueprint',
          status: 'Ready',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:01:00Z',
        },
        {
          readingId: 'reading-2',
          userId: 'user-2',
          type: 'Natal Chart',
          status: 'Processing',
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
        },
      ];

      const mockUsers = [
        { userId: 'user-1', email: 'user1@example.com' },
        { userId: 'user-2', email: 'user2@example.com' },
      ];

      dynamoMock.on(ScanCommand).resolves({ Items: mockReadings });
      dynamoMock
        .on(GetCommand, { Key: { userId: 'user-1', createdAt: 'PROFILE' } })
        .resolves({ Item: mockUsers[0] });
      dynamoMock
        .on(GetCommand, { Key: { userId: 'user-2', createdAt: 'PROFILE' } })
        .resolves({ Item: mockUsers[1] });

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.readings).toHaveLength(2);
      expect(body.readings[0].userEmail).toBe('user1@example.com');
      expect(body.readings[1].userEmail).toBe('user2@example.com');
      expect(body.count).toBe(2);
    });

    it('should apply date range filters', async () => {
      const event = createEvent(true, {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dynamoMock.on(ScanCommand).callsFake((input: any) => {
        expect(input.FilterExpression).toContain('createdAt >= :startDate');
        expect(input.FilterExpression).toContain('createdAt <= :endDate');
        expect(input.ExpressionAttributeValues[':startDate']).toBe('2024-01-01');
        expect(input.ExpressionAttributeValues[':endDate']).toBe('2024-01-31T23:59:59.999Z');
        return Promise.resolve({ Items: [] });
      });

      const response = await handler(event as APIGatewayProxyEvent);
      expect(response.statusCode).toBe(200);
    });

    it('should apply status filter', async () => {
      const event = createEvent(true, { status: 'Ready' });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dynamoMock.on(ScanCommand).callsFake((input: any) => {
        expect(input.FilterExpression).toContain('#status = :status');
        expect(input.ExpressionAttributeNames['#status']).toBe('status');
        expect(input.ExpressionAttributeValues[':status']).toBe('Ready');
        return Promise.resolve({ Items: [] });
      });

      const response = await handler(event as APIGatewayProxyEvent);
      expect(response.statusCode).toBe(200);
    });

    it('should apply type filter', async () => {
      const event = createEvent(true, { type: 'Soul Blueprint' });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dynamoMock.on(ScanCommand).callsFake((input: any) => {
        expect(input.FilterExpression).toContain('#type = :type');
        expect(input.ExpressionAttributeNames['#type']).toBe('type');
        expect(input.ExpressionAttributeValues[':type']).toBe('Soul Blueprint');
        return Promise.resolve({ Items: [] });
      });

      const response = await handler(event as APIGatewayProxyEvent);
      expect(response.statusCode).toBe(200);
    });

    it('should handle pagination with limit and lastEvaluatedKey', async () => {
      const lastKey = { readingId: 'reading-25', userId: 'user-25' };
      const encodedKey = Buffer.from(JSON.stringify(lastKey)).toString('base64');

      const event = createEvent(true, {
        limit: '50',
        lastEvaluatedKey: encodedKey,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dynamoMock.on(ScanCommand).callsFake((input: any) => {
        expect(input.Limit).toBe(50);
        expect(input.ExclusiveStartKey).toEqual(lastKey);
        return Promise.resolve({ Items: [], LastEvaluatedKey: { readingId: 'reading-75' } });
      });

      const response = await handler(event as APIGatewayProxyEvent);
      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.lastEvaluatedKey).toBeDefined();
      const decodedKey = JSON.parse(Buffer.from(body.lastEvaluatedKey, 'base64').toString());
      expect(decodedKey).toEqual({ readingId: 'reading-75' });
    });

    it('should use default limit of 25 when not specified', async () => {
      const event = createEvent(true);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dynamoMock.on(ScanCommand).callsFake((input: any) => {
        expect(input.Limit).toBe(25);
        return Promise.resolve({ Items: [] });
      });

      const response = await handler(event as APIGatewayProxyEvent);
      expect(response.statusCode).toBe(200);
    });
  });

  describe('User search', () => {
    it('should filter readings by user email search', async () => {
      const event = createEvent(true, { userSearch: 'user1' });

      const mockReadings = [
        { readingId: 'reading-1', userId: 'user-1' },
        { readingId: 'reading-2', userId: 'user-2' },
        { readingId: 'reading-3', userId: 'user-3' },
      ];

      dynamoMock.on(ScanCommand).resolves({ Items: mockReadings });
      dynamoMock
        .on(GetCommand, { Key: { userId: 'user-1', createdAt: 'PROFILE' } })
        .resolves({ Item: { userId: 'user-1', email: 'user1@example.com' } });
      dynamoMock
        .on(GetCommand, { Key: { userId: 'user-2', createdAt: 'PROFILE' } })
        .resolves({ Item: { userId: 'user-2', email: 'test@example.com' } });
      dynamoMock
        .on(GetCommand, { Key: { userId: 'user-3', createdAt: 'PROFILE' } })
        .resolves({ Item: { userId: 'user-3', email: 'another@example.com' } });

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.readings).toHaveLength(1);
      expect(body.readings[0].readingId).toBe('reading-1');
      expect(body.readings[0].userEmail).toBe('user1@example.com');
    });

    it('should handle case-insensitive user search', async () => {
      const event = createEvent(true, { userSearch: 'USER1' });

      const mockReadings = [{ readingId: 'reading-1', userId: 'user-1' }];

      dynamoMock.on(ScanCommand).resolves({ Items: mockReadings });
      dynamoMock
        .on(GetCommand)
        .resolves({ Item: { userId: 'user-1', email: 'user1@example.com' } });

      const response = await handler(event as APIGatewayProxyEvent);

      const body = JSON.parse(response.body);
      expect(body.readings).toHaveLength(1);
    });

    it('should handle users not found in user table', async () => {
      const event = createEvent(true, { userSearch: 'test' });

      const mockReadings = [
        { readingId: 'reading-1', userId: 'user-1' },
        { readingId: 'reading-2', userId: 'user-2' },
      ];

      dynamoMock.on(ScanCommand).resolves({ Items: mockReadings });
      dynamoMock
        .on(GetCommand, { Key: { userId: 'user-1', createdAt: 'PROFILE' } })
        .resolves({ Item: undefined });
      dynamoMock
        .on(GetCommand, { Key: { userId: 'user-2', createdAt: 'PROFILE' } })
        .resolves({ Item: { userId: 'user-2', email: 'test@example.com' } });

      const response = await handler(event as APIGatewayProxyEvent);

      const body = JSON.parse(response.body);
      expect(body.readings).toHaveLength(1);
      expect(body.readings[0].readingId).toBe('reading-2');
    });

    it('should still add emails when no user search is provided', async () => {
      const event = createEvent(true);

      const mockReadings = [
        { readingId: 'reading-1', userId: 'user-1' },
        { readingId: 'reading-2', userId: 'user-2' },
      ];

      dynamoMock.on(ScanCommand).resolves({ Items: mockReadings });
      dynamoMock
        .on(GetCommand, { Key: { userId: 'user-1', createdAt: 'PROFILE' } })
        .resolves({ Item: { userId: 'user-1', email: 'user1@example.com' } });
      dynamoMock
        .on(GetCommand, { Key: { userId: 'user-2', createdAt: 'PROFILE' } })
        .resolves({ Item: { userId: 'user-2', email: 'user2@example.com' } });

      const response = await handler(event as APIGatewayProxyEvent);

      const body = JSON.parse(response.body);
      expect(body.readings).toHaveLength(2);
      expect(body.readings[0].userEmail).toBe('user1@example.com');
      expect(body.readings[1].userEmail).toBe('user2@example.com');
    });
  });

  describe('Error handling', () => {
    it('should handle DynamoDB scan errors', async () => {
      const event = createEvent(true);

      dynamoMock.on(ScanCommand).rejects(new Error('DynamoDB error'));

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Internal server error');
    });

    it('should log errors to console', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const event = createEvent(true);

      const error = new Error('Test error');
      dynamoMock.on(ScanCommand).rejects(error);

      await handler(event as APIGatewayProxyEvent);

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error:', error);
      consoleErrorSpy.mockRestore();
    });

    it('should warn when user fetch fails but continue processing', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const event = createEvent(true);

      const mockReadings = [{ readingId: 'reading-1', userId: 'user-1' }];

      dynamoMock.on(ScanCommand).resolves({ Items: mockReadings });
      dynamoMock.on(GetCommand).rejects(new Error('User not found'));

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(200);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Failed to fetch user user-1:',
        expect.any(Error),
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('Response format', () => {
    it('should include CORS headers', async () => {
      const event = createEvent(true);

      dynamoMock.on(ScanCommand).resolves({ Items: [] });

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.headers).toEqual({
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
    });

    it('should return proper response structure', async () => {
      const event = createEvent(true);

      const mockReadings = [{ readingId: 'reading-1', userId: 'user-1' }];

      dynamoMock.on(ScanCommand).resolves({
        Items: mockReadings,
        LastEvaluatedKey: { readingId: 'reading-1' },
      });
      dynamoMock.on(GetCommand).resolves({
        Item: { userId: 'user-1', email: 'user1@example.com' },
      });

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('readings');
      expect(body).toHaveProperty('count');
      expect(body).toHaveProperty('lastEvaluatedKey');
      expect(Array.isArray(body.readings)).toBe(true);
      expect(typeof body.count).toBe('number');
    });
  });

  describe('Multiple filters', () => {
    it('should combine multiple filters with AND', async () => {
      const event = createEvent(true, {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        status: 'Ready',
        type: 'Soul Blueprint',
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dynamoMock.on(ScanCommand).callsFake((input: any) => {
        expect(input.FilterExpression).toContain(' AND ');
        expect(input.FilterExpression).toContain('createdAt >= :startDate');
        expect(input.FilterExpression).toContain('createdAt <= :endDate');
        expect(input.FilterExpression).toContain('#status = :status');
        expect(input.FilterExpression).toContain('#type = :type');
        return Promise.resolve({ Items: [] });
      });

      const response = await handler(event as APIGatewayProxyEvent);
      expect(response.statusCode).toBe(200);
    });
  });

  describe('Logging', () => {
    it('should log incoming event', async () => {
      const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();
      const event = createEvent(true);

      dynamoMock.on(ScanCommand).resolves({ Items: [] });

      await handler(event as APIGatewayProxyEvent);

      expect(consoleInfoSpy).toHaveBeenCalledWith('Get all readings event:', expect.any(String));

      consoleInfoSpy.mockRestore();
    });
  });
});
