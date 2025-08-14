import { handler } from '../../lambda/admin/get-all-users';
import { APIGatewayProxyEvent } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { mockClient } from 'aws-sdk-client-mock';

// Mock the Cognito client
const cognitoMock = mockClient(CognitoIdentityProviderClient);

describe('get-all-users Lambda', () => {
  beforeEach(() => {
    cognitoMock.reset();
    process.env.USER_POOL_ID = 'test-user-pool-id';
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

      cognitoMock.on(ListUsersCommand).resolves({ Users: [] });

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

      cognitoMock.on(ListUsersCommand).resolves({ Users: [] });

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(200);
    });

    it('should handle admin group as array', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        requestContext: {
          authorizer: {
            claims: {
              'cognito:groups': ['user', 'admin', 'premium'],
            },
          },
        } as unknown as APIGatewayProxyEvent['requestContext'],
      };

      cognitoMock.on(ListUsersCommand).resolves({ Users: [] });

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Fetching users', () => {
    it('should fetch all users without filters', async () => {
      const event = createEvent(true);

      const mockUsers = [
        {
          Username: 'user-1',
          Attributes: [
            { Name: 'email', Value: 'user1@example.com' },
            { Name: 'given_name', Value: 'John' },
            { Name: 'family_name', Value: 'Doe' },
          ],
          UserCreateDate: new Date('2024-01-01T00:00:00Z'),
        },
        {
          Username: 'user-2',
          Attributes: [
            { Name: 'email', Value: 'user2@example.com' },
            { Name: 'given_name', Value: 'Jane' },
            { Name: 'family_name', Value: 'Smith' },
          ],
          UserCreateDate: new Date('2024-01-02T00:00:00Z'),
        },
      ];

      cognitoMock.on(ListUsersCommand).resolves({ Users: mockUsers });

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.users).toHaveLength(2);
      expect(body.users[0]).toEqual({
        userId: 'user-1',
        email: 'user1@example.com',
        name: 'John Doe',
        createdAt: '2024-01-01T00:00:00.000Z',
      });
      expect(body.users[1]).toEqual({
        userId: 'user-2',
        email: 'user2@example.com',
        name: 'Jane Smith',
        createdAt: '2024-01-02T00:00:00.000Z',
      });
      expect(body.count).toBe(2);
    });

    it('should apply search filter', async () => {
      const event = createEvent(true, { search: 'john' });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cognitoMock.on(ListUsersCommand).callsFake((input: any) => {
        expect(input.Filter).toBe('email ^= "john"');
        return Promise.resolve({ Users: [] });
      });

      const response = await handler(event as APIGatewayProxyEvent);
      expect(response.statusCode).toBe(200);
    });

    it('should handle pagination with nextToken', async () => {
      const event = createEvent(true, { nextToken: 'pagination-token' });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cognitoMock.on(ListUsersCommand).callsFake((input: any) => {
        expect(input.PaginationToken).toBe('pagination-token');
        return Promise.resolve({
          Users: [],
          PaginationToken: 'next-pagination-token',
        });
      });

      const response = await handler(event as APIGatewayProxyEvent);
      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.nextToken).toBe('next-pagination-token');
    });

    it('should set limit to 60 (Cognito max)', async () => {
      const event = createEvent(true);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cognitoMock.on(ListUsersCommand).callsFake((input: any) => {
        expect(input.Limit).toBe(60);
        return Promise.resolve({ Users: [] });
      });

      const response = await handler(event as APIGatewayProxyEvent);
      expect(response.statusCode).toBe(200);
    });

    it('should handle users with partial name attributes', async () => {
      const event = createEvent(true);

      const mockUsers = [
        {
          Username: 'user-1',
          Attributes: [
            { Name: 'email', Value: 'user1@example.com' },
            { Name: 'given_name', Value: 'John' },
            // No family name
          ],
          UserCreateDate: new Date('2024-01-01T00:00:00Z'),
        },
        {
          Username: 'user-2',
          Attributes: [
            { Name: 'email', Value: 'user2@example.com' },
            // No given name
            { Name: 'family_name', Value: 'Smith' },
          ],
          UserCreateDate: new Date('2024-01-02T00:00:00Z'),
        },
        {
          Username: 'user-3',
          Attributes: [
            { Name: 'email', Value: 'user3@example.com' },
            // No name attributes
          ],
          UserCreateDate: new Date('2024-01-03T00:00:00Z'),
        },
      ];

      cognitoMock.on(ListUsersCommand).resolves({ Users: mockUsers });

      const response = await handler(event as APIGatewayProxyEvent);

      const body = JSON.parse(response.body);
      expect(body.users[0].name).toBe('John');
      expect(body.users[1].name).toBe('Smith');
      expect(body.users[2].name).toBeUndefined();
    });

    it('should handle users without email', async () => {
      const event = createEvent(true);

      const mockUsers = [
        {
          Username: 'user-1',
          Attributes: [
            // No email attribute
            { Name: 'given_name', Value: 'John' },
          ],
          UserCreateDate: new Date('2024-01-01T00:00:00Z'),
        },
      ];

      cognitoMock.on(ListUsersCommand).resolves({ Users: mockUsers });

      const response = await handler(event as APIGatewayProxyEvent);

      const body = JSON.parse(response.body);
      expect(body.users[0].email).toBe('No email');
    });

    it('should handle users without create date', async () => {
      const event = createEvent(true);

      const mockUsers = [
        {
          Username: 'user-1',
          Attributes: [{ Name: 'email', Value: 'user1@example.com' }],
          // No UserCreateDate
        },
      ];

      cognitoMock.on(ListUsersCommand).resolves({ Users: mockUsers });

      const response = await handler(event as APIGatewayProxyEvent);

      const body = JSON.parse(response.body);
      expect(body.users[0].createdAt).toBe('');
    });
  });

  describe('Error handling', () => {
    it('should handle Cognito errors', async () => {
      const event = createEvent(true);

      cognitoMock.on(ListUsersCommand).rejects(new Error('Cognito error'));

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Internal server error');
    });

    it('should log errors to console', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const event = createEvent(true);

      const error = new Error('Test error');
      cognitoMock.on(ListUsersCommand).rejects(error);

      await handler(event as APIGatewayProxyEvent);

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error:', error);
      consoleErrorSpy.mockRestore();
    });

    it('should handle missing USER_POOL_ID environment variable', async () => {
      delete process.env.USER_POOL_ID;
      const event = createEvent(true);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cognitoMock.on(ListUsersCommand).callsFake((input: any) => {
        expect(input.UserPoolId).toBeUndefined();
        return Promise.resolve({ Users: [] });
      });

      const response = await handler(event as APIGatewayProxyEvent);
      // Should still work but with undefined pool ID
      expect(response.statusCode).toBe(200);
    });
  });

  describe('Response format', () => {
    it('should include CORS headers', async () => {
      const event = createEvent(true);

      cognitoMock.on(ListUsersCommand).resolves({ Users: [] });

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.headers).toEqual({
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
    });

    it('should return proper response structure', async () => {
      const event = createEvent(true);

      cognitoMock.on(ListUsersCommand).resolves({
        Users: [],
        PaginationToken: 'next-token',
      });

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('users');
      expect(body).toHaveProperty('count');
      expect(body).toHaveProperty('nextToken');
      expect(Array.isArray(body.users)).toBe(true);
      expect(typeof body.count).toBe('number');
      expect(body.nextToken).toBe('next-token');
    });

    it('should handle empty users list', async () => {
      const event = createEvent(true);

      cognitoMock.on(ListUsersCommand).resolves({ Users: undefined });

      const response = await handler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.users).toEqual([]);
      expect(body.count).toBe(0);
    });
  });

  describe('Search functionality', () => {
    it('should escape special characters in search term', async () => {
      const event = createEvent(true, { search: 'user@example.com' });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cognitoMock.on(ListUsersCommand).callsFake((input: any) => {
        expect(input.Filter).toBe('email ^= "user@example.com"');
        return Promise.resolve({ Users: [] });
      });

      const response = await handler(event as APIGatewayProxyEvent);
      expect(response.statusCode).toBe(200);
    });

    it('should handle empty search term', async () => {
      const event = createEvent(true, { search: '' });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cognitoMock.on(ListUsersCommand).callsFake((input: any) => {
        expect(input.Filter).toBeUndefined();
        return Promise.resolve({ Users: [] });
      });

      const response = await handler(event as APIGatewayProxyEvent);
      expect(response.statusCode).toBe(200);
    });

    it('should combine search with pagination', async () => {
      const event = createEvent(true, {
        search: 'test',
        nextToken: 'page-2',
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cognitoMock.on(ListUsersCommand).callsFake((input: any) => {
        expect(input.Filter).toBe('email ^= "test"');
        expect(input.PaginationToken).toBe('page-2');
        return Promise.resolve({ Users: [] });
      });

      const response = await handler(event as APIGatewayProxyEvent);
      expect(response.statusCode).toBe(200);
    });
  });

  describe('Logging', () => {
    it('should log incoming event', async () => {
      const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();
      const event = createEvent(true);

      cognitoMock.on(ListUsersCommand).resolves({ Users: [] });

      await handler(event as APIGatewayProxyEvent);

      expect(consoleInfoSpy).toHaveBeenCalledWith('Get all users event:', expect.any(String));

      consoleInfoSpy.mockRestore();
    });
  });

  describe('User transformation', () => {
    it('should handle all attribute combinations correctly', async () => {
      const event = createEvent(true);

      const mockUsers = [
        {
          Username: 'user-complete',
          Attributes: [
            { Name: 'email', Value: 'complete@example.com' },
            { Name: 'given_name', Value: 'Complete' },
            { Name: 'family_name', Value: 'User' },
            { Name: 'phone_number', Value: '+1234567890' }, // Extra attribute (ignored)
          ],
          UserCreateDate: new Date('2024-01-01T00:00:00Z'),
        },
        {
          Username: 'user-minimal',
          Attributes: [],
          UserCreateDate: new Date('2024-01-02T00:00:00Z'),
        },
      ];

      cognitoMock.on(ListUsersCommand).resolves({ Users: mockUsers });

      const response = await handler(event as APIGatewayProxyEvent);

      const body = JSON.parse(response.body);
      expect(body.users[0]).toEqual({
        userId: 'user-complete',
        email: 'complete@example.com',
        name: 'Complete User',
        createdAt: '2024-01-01T00:00:00.000Z',
      });
      expect(body.users[1]).toEqual({
        userId: 'user-minimal',
        email: 'No email',
        name: undefined,
        createdAt: '2024-01-02T00:00:00.000Z',
      });
    });
  });
});
