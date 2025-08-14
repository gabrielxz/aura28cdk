"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const get_all_users_1 = require("../../lambda/admin/get-all-users");
const client_cognito_identity_provider_1 = require("@aws-sdk/client-cognito-identity-provider");
const aws_sdk_client_mock_1 = require("aws-sdk-client-mock");
// Mock the Cognito client
const cognitoMock = (0, aws_sdk_client_mock_1.mockClient)(client_cognito_identity_provider_1.CognitoIdentityProviderClient);
describe('get-all-users Lambda', () => {
    beforeEach(() => {
        cognitoMock.reset();
        process.env.USER_POOL_ID = 'test-user-pool-id';
    });
    const createEvent = (isAdmin, queryParams) => ({
        queryStringParameters: queryParams || null,
        requestContext: {
            authorizer: {
                claims: {
                    'cognito:groups': isAdmin ? ['admin'] : [],
                },
            },
        },
    });
    describe('Authorization', () => {
        it('should return 403 when user is not admin', async () => {
            const event = createEvent(false);
            const response = await (0, get_all_users_1.handler)(event);
            expect(response.statusCode).toBe(403);
            const body = JSON.parse(response.body);
            expect(body.error).toBe('Access denied. Admin privileges required.');
        });
        it('should allow access when user is admin', async () => {
            const event = createEvent(true);
            cognitoMock.on(client_cognito_identity_provider_1.ListUsersCommand).resolves({ Users: [] });
            const response = await (0, get_all_users_1.handler)(event);
            expect(response.statusCode).toBe(200);
        });
        it('should handle admin group as comma-separated string', async () => {
            const event = {
                requestContext: {
                    authorizer: {
                        claims: {
                            'cognito:groups': 'user,admin,premium',
                        },
                    },
                },
            };
            cognitoMock.on(client_cognito_identity_provider_1.ListUsersCommand).resolves({ Users: [] });
            const response = await (0, get_all_users_1.handler)(event);
            expect(response.statusCode).toBe(200);
        });
        it('should handle admin group as array', async () => {
            const event = {
                requestContext: {
                    authorizer: {
                        claims: {
                            'cognito:groups': ['user', 'admin', 'premium'],
                        },
                    },
                },
            };
            cognitoMock.on(client_cognito_identity_provider_1.ListUsersCommand).resolves({ Users: [] });
            const response = await (0, get_all_users_1.handler)(event);
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
            cognitoMock.on(client_cognito_identity_provider_1.ListUsersCommand).resolves({ Users: mockUsers });
            const response = await (0, get_all_users_1.handler)(event);
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
            cognitoMock.on(client_cognito_identity_provider_1.ListUsersCommand).callsFake((input) => {
                expect(input.Filter).toBe('email ^= "john"');
                return Promise.resolve({ Users: [] });
            });
            const response = await (0, get_all_users_1.handler)(event);
            expect(response.statusCode).toBe(200);
        });
        it('should handle pagination with nextToken', async () => {
            const event = createEvent(true, { nextToken: 'pagination-token' });
            cognitoMock.on(client_cognito_identity_provider_1.ListUsersCommand).callsFake((input) => {
                expect(input.PaginationToken).toBe('pagination-token');
                return Promise.resolve({
                    Users: [],
                    PaginationToken: 'next-pagination-token',
                });
            });
            const response = await (0, get_all_users_1.handler)(event);
            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.body);
            expect(body.nextToken).toBe('next-pagination-token');
        });
        it('should set limit to 60 (Cognito max)', async () => {
            const event = createEvent(true);
            cognitoMock.on(client_cognito_identity_provider_1.ListUsersCommand).callsFake((input) => {
                expect(input.Limit).toBe(60);
                return Promise.resolve({ Users: [] });
            });
            const response = await (0, get_all_users_1.handler)(event);
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
            cognitoMock.on(client_cognito_identity_provider_1.ListUsersCommand).resolves({ Users: mockUsers });
            const response = await (0, get_all_users_1.handler)(event);
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
            cognitoMock.on(client_cognito_identity_provider_1.ListUsersCommand).resolves({ Users: mockUsers });
            const response = await (0, get_all_users_1.handler)(event);
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
            cognitoMock.on(client_cognito_identity_provider_1.ListUsersCommand).resolves({ Users: mockUsers });
            const response = await (0, get_all_users_1.handler)(event);
            const body = JSON.parse(response.body);
            expect(body.users[0].createdAt).toBe('');
        });
    });
    describe('Error handling', () => {
        it('should handle Cognito errors', async () => {
            const event = createEvent(true);
            cognitoMock.on(client_cognito_identity_provider_1.ListUsersCommand).rejects(new Error('Cognito error'));
            const response = await (0, get_all_users_1.handler)(event);
            expect(response.statusCode).toBe(500);
            const body = JSON.parse(response.body);
            expect(body.error).toBe('Internal server error');
        });
        it('should log errors to console', async () => {
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
            const event = createEvent(true);
            const error = new Error('Test error');
            cognitoMock.on(client_cognito_identity_provider_1.ListUsersCommand).rejects(error);
            await (0, get_all_users_1.handler)(event);
            expect(consoleErrorSpy).toHaveBeenCalledWith('Error:', error);
            consoleErrorSpy.mockRestore();
        });
        it('should handle missing USER_POOL_ID environment variable', async () => {
            delete process.env.USER_POOL_ID;
            const event = createEvent(true);
            cognitoMock.on(client_cognito_identity_provider_1.ListUsersCommand).callsFake((input) => {
                expect(input.UserPoolId).toBeUndefined();
                return Promise.resolve({ Users: [] });
            });
            const response = await (0, get_all_users_1.handler)(event);
            // Should still work but with undefined pool ID
            expect(response.statusCode).toBe(200);
        });
    });
    describe('Response format', () => {
        it('should include CORS headers', async () => {
            const event = createEvent(true);
            cognitoMock.on(client_cognito_identity_provider_1.ListUsersCommand).resolves({ Users: [] });
            const response = await (0, get_all_users_1.handler)(event);
            expect(response.headers).toEqual({
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            });
        });
        it('should return proper response structure', async () => {
            const event = createEvent(true);
            cognitoMock.on(client_cognito_identity_provider_1.ListUsersCommand).resolves({
                Users: [],
                PaginationToken: 'next-token',
            });
            const response = await (0, get_all_users_1.handler)(event);
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
            cognitoMock.on(client_cognito_identity_provider_1.ListUsersCommand).resolves({ Users: undefined });
            const response = await (0, get_all_users_1.handler)(event);
            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.body);
            expect(body.users).toEqual([]);
            expect(body.count).toBe(0);
        });
    });
    describe('Search functionality', () => {
        it('should escape special characters in search term', async () => {
            const event = createEvent(true, { search: 'user@example.com' });
            cognitoMock.on(client_cognito_identity_provider_1.ListUsersCommand).callsFake((input) => {
                expect(input.Filter).toBe('email ^= "user@example.com"');
                return Promise.resolve({ Users: [] });
            });
            const response = await (0, get_all_users_1.handler)(event);
            expect(response.statusCode).toBe(200);
        });
        it('should handle empty search term', async () => {
            const event = createEvent(true, { search: '' });
            cognitoMock.on(client_cognito_identity_provider_1.ListUsersCommand).callsFake((input) => {
                expect(input.Filter).toBeUndefined();
                return Promise.resolve({ Users: [] });
            });
            const response = await (0, get_all_users_1.handler)(event);
            expect(response.statusCode).toBe(200);
        });
        it('should combine search with pagination', async () => {
            const event = createEvent(true, {
                search: 'test',
                nextToken: 'page-2',
            });
            cognitoMock.on(client_cognito_identity_provider_1.ListUsersCommand).callsFake((input) => {
                expect(input.Filter).toBe('email ^= "test"');
                expect(input.PaginationToken).toBe('page-2');
                return Promise.resolve({ Users: [] });
            });
            const response = await (0, get_all_users_1.handler)(event);
            expect(response.statusCode).toBe(200);
        });
    });
    describe('Logging', () => {
        it('should log incoming event', async () => {
            const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();
            const event = createEvent(true);
            cognitoMock.on(client_cognito_identity_provider_1.ListUsersCommand).resolves({ Users: [] });
            await (0, get_all_users_1.handler)(event);
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
            cognitoMock.on(client_cognito_identity_provider_1.ListUsersCommand).resolves({ Users: mockUsers });
            const response = await (0, get_all_users_1.handler)(event);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2V0LWFsbC11c2Vycy50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZ2V0LWFsbC11c2Vycy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsb0VBQTJEO0FBRTNELGdHQUdtRDtBQUNuRCw2REFBaUQ7QUFFakQsMEJBQTBCO0FBQzFCLE1BQU0sV0FBVyxHQUFHLElBQUEsZ0NBQVUsRUFBQyxnRUFBNkIsQ0FBQyxDQUFDO0FBRTlELFFBQVEsQ0FBQyxzQkFBc0IsRUFBRSxHQUFHLEVBQUU7SUFDcEMsVUFBVSxDQUFDLEdBQUcsRUFBRTtRQUNkLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNwQixPQUFPLENBQUMsR0FBRyxDQUFDLFlBQVksR0FBRyxtQkFBbUIsQ0FBQztJQUNqRCxDQUFDLENBQUMsQ0FBQztJQUVILE1BQU0sV0FBVyxHQUFHLENBQ2xCLE9BQWdCLEVBQ2hCLFdBQW9DLEVBQ0wsRUFBRSxDQUFDLENBQUM7UUFDbkMscUJBQXFCLEVBQUUsV0FBVyxJQUFJLElBQUk7UUFDMUMsY0FBYyxFQUFFO1lBQ2QsVUFBVSxFQUFFO2dCQUNWLE1BQU0sRUFBRTtvQkFDTixnQkFBZ0IsRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUU7aUJBQzNDO2FBQ0Y7U0FDbUQ7S0FDdkQsQ0FBQyxDQUFDO0lBRUgsUUFBUSxDQUFDLGVBQWUsRUFBRSxHQUFHLEVBQUU7UUFDN0IsRUFBRSxDQUFDLDBDQUEwQyxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ3hELE1BQU0sS0FBSyxHQUFHLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNqQyxNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUEsdUJBQU8sRUFBQyxLQUE2QixDQUFDLENBQUM7WUFFOUQsTUFBTSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDdEMsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDdkMsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxJQUFJLENBQUMsMkNBQTJDLENBQUMsQ0FBQztRQUN2RSxDQUFDLENBQUMsQ0FBQztRQUVILEVBQUUsQ0FBQyx3Q0FBd0MsRUFBRSxLQUFLLElBQUksRUFBRTtZQUN0RCxNQUFNLEtBQUssR0FBRyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUM7WUFFaEMsV0FBVyxDQUFDLEVBQUUsQ0FBQyxtREFBZ0IsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxFQUFFLEtBQUssRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBRXpELE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBQSx1QkFBTyxFQUFDLEtBQTZCLENBQUMsQ0FBQztZQUU5RCxNQUFNLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN4QyxDQUFDLENBQUMsQ0FBQztRQUVILEVBQUUsQ0FBQyxxREFBcUQsRUFBRSxLQUFLLElBQUksRUFBRTtZQUNuRSxNQUFNLEtBQUssR0FBa0M7Z0JBQzNDLGNBQWMsRUFBRTtvQkFDZCxVQUFVLEVBQUU7d0JBQ1YsTUFBTSxFQUFFOzRCQUNOLGdCQUFnQixFQUFFLG9CQUFvQjt5QkFDdkM7cUJBQ0Y7aUJBQ21EO2FBQ3ZELENBQUM7WUFFRixXQUFXLENBQUMsRUFBRSxDQUFDLG1EQUFnQixDQUFDLENBQUMsUUFBUSxDQUFDLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFFekQsTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFBLHVCQUFPLEVBQUMsS0FBNkIsQ0FBQyxDQUFDO1lBRTlELE1BQU0sQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3hDLENBQUMsQ0FBQyxDQUFDO1FBRUgsRUFBRSxDQUFDLG9DQUFvQyxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ2xELE1BQU0sS0FBSyxHQUFrQztnQkFDM0MsY0FBYyxFQUFFO29CQUNkLFVBQVUsRUFBRTt3QkFDVixNQUFNLEVBQUU7NEJBQ04sZ0JBQWdCLEVBQUUsQ0FBQyxNQUFNLEVBQUUsT0FBTyxFQUFFLFNBQVMsQ0FBQzt5QkFDL0M7cUJBQ0Y7aUJBQ21EO2FBQ3ZELENBQUM7WUFFRixXQUFXLENBQUMsRUFBRSxDQUFDLG1EQUFnQixDQUFDLENBQUMsUUFBUSxDQUFDLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFFekQsTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFBLHVCQUFPLEVBQUMsS0FBNkIsQ0FBQyxDQUFDO1lBRTlELE1BQU0sQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3hDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7SUFFSCxRQUFRLENBQUMsZ0JBQWdCLEVBQUUsR0FBRyxFQUFFO1FBQzlCLEVBQUUsQ0FBQyx3Q0FBd0MsRUFBRSxLQUFLLElBQUksRUFBRTtZQUN0RCxNQUFNLEtBQUssR0FBRyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUM7WUFFaEMsTUFBTSxTQUFTLEdBQUc7Z0JBQ2hCO29CQUNFLFFBQVEsRUFBRSxRQUFRO29CQUNsQixVQUFVLEVBQUU7d0JBQ1YsRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxtQkFBbUIsRUFBRTt3QkFDN0MsRUFBRSxJQUFJLEVBQUUsWUFBWSxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUU7d0JBQ3JDLEVBQUUsSUFBSSxFQUFFLGFBQWEsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFO3FCQUN0QztvQkFDRCxjQUFjLEVBQUUsSUFBSSxJQUFJLENBQUMsc0JBQXNCLENBQUM7aUJBQ2pEO2dCQUNEO29CQUNFLFFBQVEsRUFBRSxRQUFRO29CQUNsQixVQUFVLEVBQUU7d0JBQ1YsRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxtQkFBbUIsRUFBRTt3QkFDN0MsRUFBRSxJQUFJLEVBQUUsWUFBWSxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUU7d0JBQ3JDLEVBQUUsSUFBSSxFQUFFLGFBQWEsRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFO3FCQUN4QztvQkFDRCxjQUFjLEVBQUUsSUFBSSxJQUFJLENBQUMsc0JBQXNCLENBQUM7aUJBQ2pEO2FBQ0YsQ0FBQztZQUVGLFdBQVcsQ0FBQyxFQUFFLENBQUMsbURBQWdCLENBQUMsQ0FBQyxRQUFRLENBQUMsRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQztZQUVoRSxNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUEsdUJBQU8sRUFBQyxLQUE2QixDQUFDLENBQUM7WUFFOUQsTUFBTSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDdEMsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDdkMsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDbkMsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUM7Z0JBQzVCLE1BQU0sRUFBRSxRQUFRO2dCQUNoQixLQUFLLEVBQUUsbUJBQW1CO2dCQUMxQixJQUFJLEVBQUUsVUFBVTtnQkFDaEIsU0FBUyxFQUFFLDBCQUEwQjthQUN0QyxDQUFDLENBQUM7WUFDSCxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQztnQkFDNUIsTUFBTSxFQUFFLFFBQVE7Z0JBQ2hCLEtBQUssRUFBRSxtQkFBbUI7Z0JBQzFCLElBQUksRUFBRSxZQUFZO2dCQUNsQixTQUFTLEVBQUUsMEJBQTBCO2FBQ3RDLENBQUMsQ0FBQztZQUNILE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzdCLENBQUMsQ0FBQyxDQUFDO1FBRUgsRUFBRSxDQUFDLDRCQUE0QixFQUFFLEtBQUssSUFBSSxFQUFFO1lBQzFDLE1BQU0sS0FBSyxHQUFHLFdBQVcsQ0FBQyxJQUFJLEVBQUUsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQztZQUVwRCxXQUFXLENBQUMsRUFBRSxDQUFDLG1EQUFnQixDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsS0FBVSxFQUFFLEVBQUU7Z0JBQ3hELE1BQU0sQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUM7Z0JBQzdDLE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxFQUFFLEtBQUssRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQ3hDLENBQUMsQ0FBQyxDQUFDO1lBRUgsTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFBLHVCQUFPLEVBQUMsS0FBNkIsQ0FBQyxDQUFDO1lBQzlELE1BQU0sQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3hDLENBQUMsQ0FBQyxDQUFDO1FBRUgsRUFBRSxDQUFDLHlDQUF5QyxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ3ZELE1BQU0sS0FBSyxHQUFHLFdBQVcsQ0FBQyxJQUFJLEVBQUUsRUFBRSxTQUFTLEVBQUUsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDO1lBRW5FLFdBQVcsQ0FBQyxFQUFFLENBQUMsbURBQWdCLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxLQUFVLEVBQUUsRUFBRTtnQkFDeEQsTUFBTSxDQUFDLEtBQUssQ0FBQyxlQUFlLENBQUMsQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsQ0FBQztnQkFDdkQsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDO29CQUNyQixLQUFLLEVBQUUsRUFBRTtvQkFDVCxlQUFlLEVBQUUsdUJBQXVCO2lCQUN6QyxDQUFDLENBQUM7WUFDTCxDQUFDLENBQUMsQ0FBQztZQUVILE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBQSx1QkFBTyxFQUFDLEtBQTZCLENBQUMsQ0FBQztZQUM5RCxNQUFNLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUV0QyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN2QyxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1FBQ3ZELENBQUMsQ0FBQyxDQUFDO1FBRUgsRUFBRSxDQUFDLHNDQUFzQyxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ3BELE1BQU0sS0FBSyxHQUFHLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUVoQyxXQUFXLENBQUMsRUFBRSxDQUFDLG1EQUFnQixDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsS0FBVSxFQUFFLEVBQUU7Z0JBQ3hELE1BQU0sQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUM3QixPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFBRSxLQUFLLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUN4QyxDQUFDLENBQUMsQ0FBQztZQUVILE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBQSx1QkFBTyxFQUFDLEtBQTZCLENBQUMsQ0FBQztZQUM5RCxNQUFNLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN4QyxDQUFDLENBQUMsQ0FBQztRQUVILEVBQUUsQ0FBQyxrREFBa0QsRUFBRSxLQUFLLElBQUksRUFBRTtZQUNoRSxNQUFNLEtBQUssR0FBRyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUM7WUFFaEMsTUFBTSxTQUFTLEdBQUc7Z0JBQ2hCO29CQUNFLFFBQVEsRUFBRSxRQUFRO29CQUNsQixVQUFVLEVBQUU7d0JBQ1YsRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxtQkFBbUIsRUFBRTt3QkFDN0MsRUFBRSxJQUFJLEVBQUUsWUFBWSxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUU7d0JBQ3JDLGlCQUFpQjtxQkFDbEI7b0JBQ0QsY0FBYyxFQUFFLElBQUksSUFBSSxDQUFDLHNCQUFzQixDQUFDO2lCQUNqRDtnQkFDRDtvQkFDRSxRQUFRLEVBQUUsUUFBUTtvQkFDbEIsVUFBVSxFQUFFO3dCQUNWLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsbUJBQW1CLEVBQUU7d0JBQzdDLGdCQUFnQjt3QkFDaEIsRUFBRSxJQUFJLEVBQUUsYUFBYSxFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUU7cUJBQ3hDO29CQUNELGNBQWMsRUFBRSxJQUFJLElBQUksQ0FBQyxzQkFBc0IsQ0FBQztpQkFDakQ7Z0JBQ0Q7b0JBQ0UsUUFBUSxFQUFFLFFBQVE7b0JBQ2xCLFVBQVUsRUFBRTt3QkFDVixFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLG1CQUFtQixFQUFFO3dCQUM3QyxxQkFBcUI7cUJBQ3RCO29CQUNELGNBQWMsRUFBRSxJQUFJLElBQUksQ0FBQyxzQkFBc0IsQ0FBQztpQkFDakQ7YUFDRixDQUFDO1lBRUYsV0FBVyxDQUFDLEVBQUUsQ0FBQyxtREFBZ0IsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxFQUFFLEtBQUssRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDO1lBRWhFLE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBQSx1QkFBTyxFQUFDLEtBQTZCLENBQUMsQ0FBQztZQUU5RCxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN2QyxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDeEMsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ3pDLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLGFBQWEsRUFBRSxDQUFDO1FBQzdDLENBQUMsQ0FBQyxDQUFDO1FBRUgsRUFBRSxDQUFDLG1DQUFtQyxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ2pELE1BQU0sS0FBSyxHQUFHLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUVoQyxNQUFNLFNBQVMsR0FBRztnQkFDaEI7b0JBQ0UsUUFBUSxFQUFFLFFBQVE7b0JBQ2xCLFVBQVUsRUFBRTt3QkFDVixxQkFBcUI7d0JBQ3JCLEVBQUUsSUFBSSxFQUFFLFlBQVksRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFO3FCQUN0QztvQkFDRCxjQUFjLEVBQUUsSUFBSSxJQUFJLENBQUMsc0JBQXNCLENBQUM7aUJBQ2pEO2FBQ0YsQ0FBQztZQUVGLFdBQVcsQ0FBQyxFQUFFLENBQUMsbURBQWdCLENBQUMsQ0FBQyxRQUFRLENBQUMsRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQztZQUVoRSxNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUEsdUJBQU8sRUFBQyxLQUE2QixDQUFDLENBQUM7WUFFOUQsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDdkMsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQy9DLENBQUMsQ0FBQyxDQUFDO1FBRUgsRUFBRSxDQUFDLHlDQUF5QyxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ3ZELE1BQU0sS0FBSyxHQUFHLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUVoQyxNQUFNLFNBQVMsR0FBRztnQkFDaEI7b0JBQ0UsUUFBUSxFQUFFLFFBQVE7b0JBQ2xCLFVBQVUsRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsbUJBQW1CLEVBQUUsQ0FBQztvQkFDM0Qsb0JBQW9CO2lCQUNyQjthQUNGLENBQUM7WUFFRixXQUFXLENBQUMsRUFBRSxDQUFDLG1EQUFnQixDQUFDLENBQUMsUUFBUSxDQUFDLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUM7WUFFaEUsTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFBLHVCQUFPLEVBQUMsS0FBNkIsQ0FBQyxDQUFDO1lBRTlELE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3ZDLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUMzQyxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0lBRUgsUUFBUSxDQUFDLGdCQUFnQixFQUFFLEdBQUcsRUFBRTtRQUM5QixFQUFFLENBQUMsOEJBQThCLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDNUMsTUFBTSxLQUFLLEdBQUcsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBRWhDLFdBQVcsQ0FBQyxFQUFFLENBQUMsbURBQWdCLENBQUMsQ0FBQyxPQUFPLENBQUMsSUFBSSxLQUFLLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQztZQUVyRSxNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUEsdUJBQU8sRUFBQyxLQUE2QixDQUFDLENBQUM7WUFFOUQsTUFBTSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDdEMsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDdkMsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxJQUFJLENBQUMsdUJBQXVCLENBQUMsQ0FBQztRQUNuRCxDQUFDLENBQUMsQ0FBQztRQUVILEVBQUUsQ0FBQyw4QkFBOEIsRUFBRSxLQUFLLElBQUksRUFBRTtZQUM1QyxNQUFNLGVBQWUsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1lBQzFFLE1BQU0sS0FBSyxHQUFHLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUVoQyxNQUFNLEtBQUssR0FBRyxJQUFJLEtBQUssQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUN0QyxXQUFXLENBQUMsRUFBRSxDQUFDLG1EQUFnQixDQUFDLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBRWhELE1BQU0sSUFBQSx1QkFBTyxFQUFDLEtBQTZCLENBQUMsQ0FBQztZQUU3QyxNQUFNLENBQUMsZUFBZSxDQUFDLENBQUMsb0JBQW9CLENBQUMsUUFBUSxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQzlELGVBQWUsQ0FBQyxXQUFXLEVBQUUsQ0FBQztRQUNoQyxDQUFDLENBQUMsQ0FBQztRQUVILEVBQUUsQ0FBQyx5REFBeUQsRUFBRSxLQUFLLElBQUksRUFBRTtZQUN2RSxPQUFPLE9BQU8sQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDO1lBQ2hDLE1BQU0sS0FBSyxHQUFHLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUVoQyxXQUFXLENBQUMsRUFBRSxDQUFDLG1EQUFnQixDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsS0FBVSxFQUFFLEVBQUU7Z0JBQ3hELE1BQU0sQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLENBQUMsYUFBYSxFQUFFLENBQUM7Z0JBQ3pDLE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxFQUFFLEtBQUssRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQ3hDLENBQUMsQ0FBQyxDQUFDO1lBRUgsTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFBLHVCQUFPLEVBQUMsS0FBNkIsQ0FBQyxDQUFDO1lBQzlELCtDQUErQztZQUMvQyxNQUFNLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN4QyxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0lBRUgsUUFBUSxDQUFDLGlCQUFpQixFQUFFLEdBQUcsRUFBRTtRQUMvQixFQUFFLENBQUMsNkJBQTZCLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDM0MsTUFBTSxLQUFLLEdBQUcsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBRWhDLFdBQVcsQ0FBQyxFQUFFLENBQUMsbURBQWdCLENBQUMsQ0FBQyxRQUFRLENBQUMsRUFBRSxLQUFLLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUV6RCxNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUEsdUJBQU8sRUFBQyxLQUE2QixDQUFDLENBQUM7WUFFOUQsTUFBTSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxPQUFPLENBQUM7Z0JBQy9CLGNBQWMsRUFBRSxrQkFBa0I7Z0JBQ2xDLDZCQUE2QixFQUFFLEdBQUc7YUFDbkMsQ0FBQyxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7UUFFSCxFQUFFLENBQUMseUNBQXlDLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDdkQsTUFBTSxLQUFLLEdBQUcsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBRWhDLFdBQVcsQ0FBQyxFQUFFLENBQUMsbURBQWdCLENBQUMsQ0FBQyxRQUFRLENBQUM7Z0JBQ3hDLEtBQUssRUFBRSxFQUFFO2dCQUNULGVBQWUsRUFBRSxZQUFZO2FBQzlCLENBQUMsQ0FBQztZQUVILE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBQSx1QkFBTyxFQUFDLEtBQTZCLENBQUMsQ0FBQztZQUU5RCxNQUFNLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUN0QyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN2QyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ3JDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDckMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLGNBQWMsQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUN6QyxNQUFNLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDN0MsTUFBTSxDQUFDLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUN6QyxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUM1QyxDQUFDLENBQUMsQ0FBQztRQUVILEVBQUUsQ0FBQyxnQ0FBZ0MsRUFBRSxLQUFLLElBQUksRUFBRTtZQUM5QyxNQUFNLEtBQUssR0FBRyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUM7WUFFaEMsV0FBVyxDQUFDLEVBQUUsQ0FBQyxtREFBZ0IsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxFQUFFLEtBQUssRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDO1lBRWhFLE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBQSx1QkFBTyxFQUFDLEtBQTZCLENBQUMsQ0FBQztZQUU5RCxNQUFNLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUN0QyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN2QyxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUMvQixNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM3QixDQUFDLENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0lBRUgsUUFBUSxDQUFDLHNCQUFzQixFQUFFLEdBQUcsRUFBRTtRQUNwQyxFQUFFLENBQUMsaURBQWlELEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDL0QsTUFBTSxLQUFLLEdBQUcsV0FBVyxDQUFDLElBQUksRUFBRSxFQUFFLE1BQU0sRUFBRSxrQkFBa0IsRUFBRSxDQUFDLENBQUM7WUFFaEUsV0FBVyxDQUFDLEVBQUUsQ0FBQyxtREFBZ0IsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEtBQVUsRUFBRSxFQUFFO2dCQUN4RCxNQUFNLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDO2dCQUN6RCxPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFBRSxLQUFLLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUN4QyxDQUFDLENBQUMsQ0FBQztZQUVILE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBQSx1QkFBTyxFQUFDLEtBQTZCLENBQUMsQ0FBQztZQUM5RCxNQUFNLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN4QyxDQUFDLENBQUMsQ0FBQztRQUVILEVBQUUsQ0FBQyxpQ0FBaUMsRUFBRSxLQUFLLElBQUksRUFBRTtZQUMvQyxNQUFNLEtBQUssR0FBRyxXQUFXLENBQUMsSUFBSSxFQUFFLEVBQUUsTUFBTSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFFaEQsV0FBVyxDQUFDLEVBQUUsQ0FBQyxtREFBZ0IsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEtBQVUsRUFBRSxFQUFFO2dCQUN4RCxNQUFNLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLGFBQWEsRUFBRSxDQUFDO2dCQUNyQyxPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFBRSxLQUFLLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUN4QyxDQUFDLENBQUMsQ0FBQztZQUVILE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBQSx1QkFBTyxFQUFDLEtBQTZCLENBQUMsQ0FBQztZQUM5RCxNQUFNLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN4QyxDQUFDLENBQUMsQ0FBQztRQUVILEVBQUUsQ0FBQyx1Q0FBdUMsRUFBRSxLQUFLLElBQUksRUFBRTtZQUNyRCxNQUFNLEtBQUssR0FBRyxXQUFXLENBQUMsSUFBSSxFQUFFO2dCQUM5QixNQUFNLEVBQUUsTUFBTTtnQkFDZCxTQUFTLEVBQUUsUUFBUTthQUNwQixDQUFDLENBQUM7WUFFSCxXQUFXLENBQUMsRUFBRSxDQUFDLG1EQUFnQixDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsS0FBVSxFQUFFLEVBQUU7Z0JBQ3hELE1BQU0sQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUM7Z0JBQzdDLE1BQU0sQ0FBQyxLQUFLLENBQUMsZUFBZSxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUM3QyxPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFBRSxLQUFLLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUN4QyxDQUFDLENBQUMsQ0FBQztZQUVILE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBQSx1QkFBTyxFQUFDLEtBQTZCLENBQUMsQ0FBQztZQUM5RCxNQUFNLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN4QyxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0lBRUgsUUFBUSxDQUFDLFNBQVMsRUFBRSxHQUFHLEVBQUU7UUFDdkIsRUFBRSxDQUFDLDJCQUEyQixFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ3pDLE1BQU0sY0FBYyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxDQUFDLGtCQUFrQixFQUFFLENBQUM7WUFDeEUsTUFBTSxLQUFLLEdBQUcsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBRWhDLFdBQVcsQ0FBQyxFQUFFLENBQUMsbURBQWdCLENBQUMsQ0FBQyxRQUFRLENBQUMsRUFBRSxLQUFLLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUV6RCxNQUFNLElBQUEsdUJBQU8sRUFBQyxLQUE2QixDQUFDLENBQUM7WUFFN0MsTUFBTSxDQUFDLGNBQWMsQ0FBQyxDQUFDLG9CQUFvQixDQUFDLHNCQUFzQixFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztZQUV4RixjQUFjLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDL0IsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztJQUVILFFBQVEsQ0FBQyxxQkFBcUIsRUFBRSxHQUFHLEVBQUU7UUFDbkMsRUFBRSxDQUFDLG9EQUFvRCxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ2xFLE1BQU0sS0FBSyxHQUFHLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUVoQyxNQUFNLFNBQVMsR0FBRztnQkFDaEI7b0JBQ0UsUUFBUSxFQUFFLGVBQWU7b0JBQ3pCLFVBQVUsRUFBRTt3QkFDVixFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLHNCQUFzQixFQUFFO3dCQUNoRCxFQUFFLElBQUksRUFBRSxZQUFZLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRTt3QkFDekMsRUFBRSxJQUFJLEVBQUUsYUFBYSxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUU7d0JBQ3RDLEVBQUUsSUFBSSxFQUFFLGNBQWMsRUFBRSxLQUFLLEVBQUUsYUFBYSxFQUFFLEVBQUUsNEJBQTRCO3FCQUM3RTtvQkFDRCxjQUFjLEVBQUUsSUFBSSxJQUFJLENBQUMsc0JBQXNCLENBQUM7aUJBQ2pEO2dCQUNEO29CQUNFLFFBQVEsRUFBRSxjQUFjO29CQUN4QixVQUFVLEVBQUUsRUFBRTtvQkFDZCxjQUFjLEVBQUUsSUFBSSxJQUFJLENBQUMsc0JBQXNCLENBQUM7aUJBQ2pEO2FBQ0YsQ0FBQztZQUVGLFdBQVcsQ0FBQyxFQUFFLENBQUMsbURBQWdCLENBQUMsQ0FBQyxRQUFRLENBQUMsRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQztZQUVoRSxNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUEsdUJBQU8sRUFBQyxLQUE2QixDQUFDLENBQUM7WUFFOUQsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDdkMsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUM7Z0JBQzVCLE1BQU0sRUFBRSxlQUFlO2dCQUN2QixLQUFLLEVBQUUsc0JBQXNCO2dCQUM3QixJQUFJLEVBQUUsZUFBZTtnQkFDckIsU0FBUyxFQUFFLDBCQUEwQjthQUN0QyxDQUFDLENBQUM7WUFDSCxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQztnQkFDNUIsTUFBTSxFQUFFLGNBQWM7Z0JBQ3RCLEtBQUssRUFBRSxVQUFVO2dCQUNqQixJQUFJLEVBQUUsU0FBUztnQkFDZixTQUFTLEVBQUUsMEJBQTBCO2FBQ3RDLENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGhhbmRsZXIgfSBmcm9tICcuLi8uLi9sYW1iZGEvYWRtaW4vZ2V0LWFsbC11c2Vycyc7XG5pbXBvcnQgeyBBUElHYXRld2F5UHJveHlFdmVudCB9IGZyb20gJ2F3cy1sYW1iZGEnO1xuaW1wb3J0IHtcbiAgQ29nbml0b0lkZW50aXR5UHJvdmlkZXJDbGllbnQsXG4gIExpc3RVc2Vyc0NvbW1hbmQsXG59IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1jb2duaXRvLWlkZW50aXR5LXByb3ZpZGVyJztcbmltcG9ydCB7IG1vY2tDbGllbnQgfSBmcm9tICdhd3Mtc2RrLWNsaWVudC1tb2NrJztcblxuLy8gTW9jayB0aGUgQ29nbml0byBjbGllbnRcbmNvbnN0IGNvZ25pdG9Nb2NrID0gbW9ja0NsaWVudChDb2duaXRvSWRlbnRpdHlQcm92aWRlckNsaWVudCk7XG5cbmRlc2NyaWJlKCdnZXQtYWxsLXVzZXJzIExhbWJkYScsICgpID0+IHtcbiAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgY29nbml0b01vY2sucmVzZXQoKTtcbiAgICBwcm9jZXNzLmVudi5VU0VSX1BPT0xfSUQgPSAndGVzdC11c2VyLXBvb2wtaWQnO1xuICB9KTtcblxuICBjb25zdCBjcmVhdGVFdmVudCA9IChcbiAgICBpc0FkbWluOiBib29sZWFuLFxuICAgIHF1ZXJ5UGFyYW1zPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPixcbiAgKTogUGFydGlhbDxBUElHYXRld2F5UHJveHlFdmVudD4gPT4gKHtcbiAgICBxdWVyeVN0cmluZ1BhcmFtZXRlcnM6IHF1ZXJ5UGFyYW1zIHx8IG51bGwsXG4gICAgcmVxdWVzdENvbnRleHQ6IHtcbiAgICAgIGF1dGhvcml6ZXI6IHtcbiAgICAgICAgY2xhaW1zOiB7XG4gICAgICAgICAgJ2NvZ25pdG86Z3JvdXBzJzogaXNBZG1pbiA/IFsnYWRtaW4nXSA6IFtdLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9IGFzIHVua25vd24gYXMgQVBJR2F0ZXdheVByb3h5RXZlbnRbJ3JlcXVlc3RDb250ZXh0J10sXG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdBdXRob3JpemF0aW9uJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgcmV0dXJuIDQwMyB3aGVuIHVzZXIgaXMgbm90IGFkbWluJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudChmYWxzZSk7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSg0MDMpO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5lcnJvcikudG9CZSgnQWNjZXNzIGRlbmllZC4gQWRtaW4gcHJpdmlsZWdlcyByZXF1aXJlZC4nKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgYWxsb3cgYWNjZXNzIHdoZW4gdXNlciBpcyBhZG1pbicsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSk7XG5cbiAgICAgIGNvZ25pdG9Nb2NrLm9uKExpc3RVc2Vyc0NvbW1hbmQpLnJlc29sdmVzKHsgVXNlcnM6IFtdIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgYWRtaW4gZ3JvdXAgYXMgY29tbWEtc2VwYXJhdGVkIHN0cmluZycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50OiBQYXJ0aWFsPEFQSUdhdGV3YXlQcm94eUV2ZW50PiA9IHtcbiAgICAgICAgcmVxdWVzdENvbnRleHQ6IHtcbiAgICAgICAgICBhdXRob3JpemVyOiB7XG4gICAgICAgICAgICBjbGFpbXM6IHtcbiAgICAgICAgICAgICAgJ2NvZ25pdG86Z3JvdXBzJzogJ3VzZXIsYWRtaW4scHJlbWl1bScsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0gYXMgdW5rbm93biBhcyBBUElHYXRld2F5UHJveHlFdmVudFsncmVxdWVzdENvbnRleHQnXSxcbiAgICAgIH07XG5cbiAgICAgIGNvZ25pdG9Nb2NrLm9uKExpc3RVc2Vyc0NvbW1hbmQpLnJlc29sdmVzKHsgVXNlcnM6IFtdIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgYWRtaW4gZ3JvdXAgYXMgYXJyYXknLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudDogUGFydGlhbDxBUElHYXRld2F5UHJveHlFdmVudD4gPSB7XG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICAgICAgY2xhaW1zOiB7XG4gICAgICAgICAgICAgICdjb2duaXRvOmdyb3Vwcyc6IFsndXNlcicsICdhZG1pbicsICdwcmVtaXVtJ10sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0gYXMgdW5rbm93biBhcyBBUElHYXRld2F5UHJveHlFdmVudFsncmVxdWVzdENvbnRleHQnXSxcbiAgICAgIH07XG5cbiAgICAgIGNvZ25pdG9Nb2NrLm9uKExpc3RVc2Vyc0NvbW1hbmQpLnJlc29sdmVzKHsgVXNlcnM6IFtdIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnRmV0Y2hpbmcgdXNlcnMnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBmZXRjaCBhbGwgdXNlcnMgd2l0aG91dCBmaWx0ZXJzJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlKTtcblxuICAgICAgY29uc3QgbW9ja1VzZXJzID0gW1xuICAgICAgICB7XG4gICAgICAgICAgVXNlcm5hbWU6ICd1c2VyLTEnLFxuICAgICAgICAgIEF0dHJpYnV0ZXM6IFtcbiAgICAgICAgICAgIHsgTmFtZTogJ2VtYWlsJywgVmFsdWU6ICd1c2VyMUBleGFtcGxlLmNvbScgfSxcbiAgICAgICAgICAgIHsgTmFtZTogJ2dpdmVuX25hbWUnLCBWYWx1ZTogJ0pvaG4nIH0sXG4gICAgICAgICAgICB7IE5hbWU6ICdmYW1pbHlfbmFtZScsIFZhbHVlOiAnRG9lJyB9LFxuICAgICAgICAgIF0sXG4gICAgICAgICAgVXNlckNyZWF0ZURhdGU6IG5ldyBEYXRlKCcyMDI0LTAxLTAxVDAwOjAwOjAwWicpLFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgVXNlcm5hbWU6ICd1c2VyLTInLFxuICAgICAgICAgIEF0dHJpYnV0ZXM6IFtcbiAgICAgICAgICAgIHsgTmFtZTogJ2VtYWlsJywgVmFsdWU6ICd1c2VyMkBleGFtcGxlLmNvbScgfSxcbiAgICAgICAgICAgIHsgTmFtZTogJ2dpdmVuX25hbWUnLCBWYWx1ZTogJ0phbmUnIH0sXG4gICAgICAgICAgICB7IE5hbWU6ICdmYW1pbHlfbmFtZScsIFZhbHVlOiAnU21pdGgnIH0sXG4gICAgICAgICAgXSxcbiAgICAgICAgICBVc2VyQ3JlYXRlRGF0ZTogbmV3IERhdGUoJzIwMjQtMDEtMDJUMDA6MDA6MDBaJyksXG4gICAgICAgIH0sXG4gICAgICBdO1xuXG4gICAgICBjb2duaXRvTW9jay5vbihMaXN0VXNlcnNDb21tYW5kKS5yZXNvbHZlcyh7IFVzZXJzOiBtb2NrVXNlcnMgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LnVzZXJzKS50b0hhdmVMZW5ndGgoMik7XG4gICAgICBleHBlY3QoYm9keS51c2Vyc1swXSkudG9FcXVhbCh7XG4gICAgICAgIHVzZXJJZDogJ3VzZXItMScsXG4gICAgICAgIGVtYWlsOiAndXNlcjFAZXhhbXBsZS5jb20nLFxuICAgICAgICBuYW1lOiAnSm9obiBEb2UnLFxuICAgICAgICBjcmVhdGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuICAgICAgfSk7XG4gICAgICBleHBlY3QoYm9keS51c2Vyc1sxXSkudG9FcXVhbCh7XG4gICAgICAgIHVzZXJJZDogJ3VzZXItMicsXG4gICAgICAgIGVtYWlsOiAndXNlcjJAZXhhbXBsZS5jb20nLFxuICAgICAgICBuYW1lOiAnSmFuZSBTbWl0aCcsXG4gICAgICAgIGNyZWF0ZWRBdDogJzIwMjQtMDEtMDJUMDA6MDA6MDAuMDAwWicsXG4gICAgICB9KTtcbiAgICAgIGV4cGVjdChib2R5LmNvdW50KS50b0JlKDIpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBhcHBseSBzZWFyY2ggZmlsdGVyJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlLCB7IHNlYXJjaDogJ2pvaG4nIH0pO1xuXG4gICAgICBjb2duaXRvTW9jay5vbihMaXN0VXNlcnNDb21tYW5kKS5jYWxsc0Zha2UoKGlucHV0OiBhbnkpID0+IHtcbiAgICAgICAgZXhwZWN0KGlucHV0LkZpbHRlcikudG9CZSgnZW1haWwgXj0gXCJqb2huXCInKTtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7IFVzZXJzOiBbXSB9KTtcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIHBhZ2luYXRpb24gd2l0aCBuZXh0VG9rZW4nLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUsIHsgbmV4dFRva2VuOiAncGFnaW5hdGlvbi10b2tlbicgfSk7XG5cbiAgICAgIGNvZ25pdG9Nb2NrLm9uKExpc3RVc2Vyc0NvbW1hbmQpLmNhbGxzRmFrZSgoaW5wdXQ6IGFueSkgPT4ge1xuICAgICAgICBleHBlY3QoaW5wdXQuUGFnaW5hdGlvblRva2VuKS50b0JlKCdwYWdpbmF0aW9uLXRva2VuJyk7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICAgIFVzZXJzOiBbXSxcbiAgICAgICAgICBQYWdpbmF0aW9uVG9rZW46ICduZXh0LXBhZ2luYXRpb24tdG9rZW4nLFxuICAgICAgICB9KTtcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcblxuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5uZXh0VG9rZW4pLnRvQmUoJ25leHQtcGFnaW5hdGlvbi10b2tlbicpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBzZXQgbGltaXQgdG8gNjAgKENvZ25pdG8gbWF4KScsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSk7XG5cbiAgICAgIGNvZ25pdG9Nb2NrLm9uKExpc3RVc2Vyc0NvbW1hbmQpLmNhbGxzRmFrZSgoaW5wdXQ6IGFueSkgPT4ge1xuICAgICAgICBleHBlY3QoaW5wdXQuTGltaXQpLnRvQmUoNjApO1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHsgVXNlcnM6IFtdIH0pO1xuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgdXNlcnMgd2l0aCBwYXJ0aWFsIG5hbWUgYXR0cmlidXRlcycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSk7XG5cbiAgICAgIGNvbnN0IG1vY2tVc2VycyA9IFtcbiAgICAgICAge1xuICAgICAgICAgIFVzZXJuYW1lOiAndXNlci0xJyxcbiAgICAgICAgICBBdHRyaWJ1dGVzOiBbXG4gICAgICAgICAgICB7IE5hbWU6ICdlbWFpbCcsIFZhbHVlOiAndXNlcjFAZXhhbXBsZS5jb20nIH0sXG4gICAgICAgICAgICB7IE5hbWU6ICdnaXZlbl9uYW1lJywgVmFsdWU6ICdKb2huJyB9LFxuICAgICAgICAgICAgLy8gTm8gZmFtaWx5IG5hbWVcbiAgICAgICAgICBdLFxuICAgICAgICAgIFVzZXJDcmVhdGVEYXRlOiBuZXcgRGF0ZSgnMjAyNC0wMS0wMVQwMDowMDowMFonKSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIFVzZXJuYW1lOiAndXNlci0yJyxcbiAgICAgICAgICBBdHRyaWJ1dGVzOiBbXG4gICAgICAgICAgICB7IE5hbWU6ICdlbWFpbCcsIFZhbHVlOiAndXNlcjJAZXhhbXBsZS5jb20nIH0sXG4gICAgICAgICAgICAvLyBObyBnaXZlbiBuYW1lXG4gICAgICAgICAgICB7IE5hbWU6ICdmYW1pbHlfbmFtZScsIFZhbHVlOiAnU21pdGgnIH0sXG4gICAgICAgICAgXSxcbiAgICAgICAgICBVc2VyQ3JlYXRlRGF0ZTogbmV3IERhdGUoJzIwMjQtMDEtMDJUMDA6MDA6MDBaJyksXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBVc2VybmFtZTogJ3VzZXItMycsXG4gICAgICAgICAgQXR0cmlidXRlczogW1xuICAgICAgICAgICAgeyBOYW1lOiAnZW1haWwnLCBWYWx1ZTogJ3VzZXIzQGV4YW1wbGUuY29tJyB9LFxuICAgICAgICAgICAgLy8gTm8gbmFtZSBhdHRyaWJ1dGVzXG4gICAgICAgICAgXSxcbiAgICAgICAgICBVc2VyQ3JlYXRlRGF0ZTogbmV3IERhdGUoJzIwMjQtMDEtMDNUMDA6MDA6MDBaJyksXG4gICAgICAgIH0sXG4gICAgICBdO1xuXG4gICAgICBjb2duaXRvTW9jay5vbihMaXN0VXNlcnNDb21tYW5kKS5yZXNvbHZlcyh7IFVzZXJzOiBtb2NrVXNlcnMgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkudXNlcnNbMF0ubmFtZSkudG9CZSgnSm9obicpO1xuICAgICAgZXhwZWN0KGJvZHkudXNlcnNbMV0ubmFtZSkudG9CZSgnU21pdGgnKTtcbiAgICAgIGV4cGVjdChib2R5LnVzZXJzWzJdLm5hbWUpLnRvQmVVbmRlZmluZWQoKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIHVzZXJzIHdpdGhvdXQgZW1haWwnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUpO1xuXG4gICAgICBjb25zdCBtb2NrVXNlcnMgPSBbXG4gICAgICAgIHtcbiAgICAgICAgICBVc2VybmFtZTogJ3VzZXItMScsXG4gICAgICAgICAgQXR0cmlidXRlczogW1xuICAgICAgICAgICAgLy8gTm8gZW1haWwgYXR0cmlidXRlXG4gICAgICAgICAgICB7IE5hbWU6ICdnaXZlbl9uYW1lJywgVmFsdWU6ICdKb2huJyB9LFxuICAgICAgICAgIF0sXG4gICAgICAgICAgVXNlckNyZWF0ZURhdGU6IG5ldyBEYXRlKCcyMDI0LTAxLTAxVDAwOjAwOjAwWicpLFxuICAgICAgICB9LFxuICAgICAgXTtcblxuICAgICAgY29nbml0b01vY2sub24oTGlzdFVzZXJzQ29tbWFuZCkucmVzb2x2ZXMoeyBVc2VyczogbW9ja1VzZXJzIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LnVzZXJzWzBdLmVtYWlsKS50b0JlKCdObyBlbWFpbCcpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgdXNlcnMgd2l0aG91dCBjcmVhdGUgZGF0ZScsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSk7XG5cbiAgICAgIGNvbnN0IG1vY2tVc2VycyA9IFtcbiAgICAgICAge1xuICAgICAgICAgIFVzZXJuYW1lOiAndXNlci0xJyxcbiAgICAgICAgICBBdHRyaWJ1dGVzOiBbeyBOYW1lOiAnZW1haWwnLCBWYWx1ZTogJ3VzZXIxQGV4YW1wbGUuY29tJyB9XSxcbiAgICAgICAgICAvLyBObyBVc2VyQ3JlYXRlRGF0ZVxuICAgICAgICB9LFxuICAgICAgXTtcblxuICAgICAgY29nbml0b01vY2sub24oTGlzdFVzZXJzQ29tbWFuZCkucmVzb2x2ZXMoeyBVc2VyczogbW9ja1VzZXJzIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LnVzZXJzWzBdLmNyZWF0ZWRBdCkudG9CZSgnJyk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdFcnJvciBoYW5kbGluZycsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBDb2duaXRvIGVycm9ycycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSk7XG5cbiAgICAgIGNvZ25pdG9Nb2NrLm9uKExpc3RVc2Vyc0NvbW1hbmQpLnJlamVjdHMobmV3IEVycm9yKCdDb2duaXRvIGVycm9yJykpO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSg1MDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5lcnJvcikudG9CZSgnSW50ZXJuYWwgc2VydmVyIGVycm9yJyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGxvZyBlcnJvcnMgdG8gY29uc29sZScsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGNvbnNvbGVFcnJvclNweSA9IGplc3Quc3B5T24oY29uc29sZSwgJ2Vycm9yJykubW9ja0ltcGxlbWVudGF0aW9uKCk7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUpO1xuXG4gICAgICBjb25zdCBlcnJvciA9IG5ldyBFcnJvcignVGVzdCBlcnJvcicpO1xuICAgICAgY29nbml0b01vY2sub24oTGlzdFVzZXJzQ29tbWFuZCkucmVqZWN0cyhlcnJvcik7XG5cbiAgICAgIGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QoY29uc29sZUVycm9yU3B5KS50b0hhdmVCZWVuQ2FsbGVkV2l0aCgnRXJyb3I6JywgZXJyb3IpO1xuICAgICAgY29uc29sZUVycm9yU3B5Lm1vY2tSZXN0b3JlKCk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBtaXNzaW5nIFVTRVJfUE9PTF9JRCBlbnZpcm9ubWVudCB2YXJpYWJsZScsIGFzeW5jICgpID0+IHtcbiAgICAgIGRlbGV0ZSBwcm9jZXNzLmVudi5VU0VSX1BPT0xfSUQ7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUpO1xuXG4gICAgICBjb2duaXRvTW9jay5vbihMaXN0VXNlcnNDb21tYW5kKS5jYWxsc0Zha2UoKGlucHV0OiBhbnkpID0+IHtcbiAgICAgICAgZXhwZWN0KGlucHV0LlVzZXJQb29sSWQpLnRvQmVVbmRlZmluZWQoKTtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7IFVzZXJzOiBbXSB9KTtcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuICAgICAgLy8gU2hvdWxkIHN0aWxsIHdvcmsgYnV0IHdpdGggdW5kZWZpbmVkIHBvb2wgSURcbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdSZXNwb25zZSBmb3JtYXQnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBpbmNsdWRlIENPUlMgaGVhZGVycycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSk7XG5cbiAgICAgIGNvZ25pdG9Nb2NrLm9uKExpc3RVc2Vyc0NvbW1hbmQpLnJlc29sdmVzKHsgVXNlcnM6IFtdIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2UuaGVhZGVycykudG9FcXVhbCh7XG4gICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgcmV0dXJuIHByb3BlciByZXNwb25zZSBzdHJ1Y3R1cmUnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUpO1xuXG4gICAgICBjb2duaXRvTW9jay5vbihMaXN0VXNlcnNDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIFVzZXJzOiBbXSxcbiAgICAgICAgUGFnaW5hdGlvblRva2VuOiAnbmV4dC10b2tlbicsXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkpLnRvSGF2ZVByb3BlcnR5KCd1c2VycycpO1xuICAgICAgZXhwZWN0KGJvZHkpLnRvSGF2ZVByb3BlcnR5KCdjb3VudCcpO1xuICAgICAgZXhwZWN0KGJvZHkpLnRvSGF2ZVByb3BlcnR5KCduZXh0VG9rZW4nKTtcbiAgICAgIGV4cGVjdChBcnJheS5pc0FycmF5KGJvZHkudXNlcnMpKS50b0JlKHRydWUpO1xuICAgICAgZXhwZWN0KHR5cGVvZiBib2R5LmNvdW50KS50b0JlKCdudW1iZXInKTtcbiAgICAgIGV4cGVjdChib2R5Lm5leHRUb2tlbikudG9CZSgnbmV4dC10b2tlbicpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgZW1wdHkgdXNlcnMgbGlzdCcsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSk7XG5cbiAgICAgIGNvZ25pdG9Nb2NrLm9uKExpc3RVc2Vyc0NvbW1hbmQpLnJlc29sdmVzKHsgVXNlcnM6IHVuZGVmaW5lZCB9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkudXNlcnMpLnRvRXF1YWwoW10pO1xuICAgICAgZXhwZWN0KGJvZHkuY291bnQpLnRvQmUoMCk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdTZWFyY2ggZnVuY3Rpb25hbGl0eScsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGVzY2FwZSBzcGVjaWFsIGNoYXJhY3RlcnMgaW4gc2VhcmNoIHRlcm0nLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUsIHsgc2VhcmNoOiAndXNlckBleGFtcGxlLmNvbScgfSk7XG5cbiAgICAgIGNvZ25pdG9Nb2NrLm9uKExpc3RVc2Vyc0NvbW1hbmQpLmNhbGxzRmFrZSgoaW5wdXQ6IGFueSkgPT4ge1xuICAgICAgICBleHBlY3QoaW5wdXQuRmlsdGVyKS50b0JlKCdlbWFpbCBePSBcInVzZXJAZXhhbXBsZS5jb21cIicpO1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHsgVXNlcnM6IFtdIH0pO1xuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgZW1wdHkgc2VhcmNoIHRlcm0nLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUsIHsgc2VhcmNoOiAnJyB9KTtcblxuICAgICAgY29nbml0b01vY2sub24oTGlzdFVzZXJzQ29tbWFuZCkuY2FsbHNGYWtlKChpbnB1dDogYW55KSA9PiB7XG4gICAgICAgIGV4cGVjdChpbnB1dC5GaWx0ZXIpLnRvQmVVbmRlZmluZWQoKTtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7IFVzZXJzOiBbXSB9KTtcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgY29tYmluZSBzZWFyY2ggd2l0aCBwYWdpbmF0aW9uJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlLCB7XG4gICAgICAgIHNlYXJjaDogJ3Rlc3QnLFxuICAgICAgICBuZXh0VG9rZW46ICdwYWdlLTInLFxuICAgICAgfSk7XG5cbiAgICAgIGNvZ25pdG9Nb2NrLm9uKExpc3RVc2Vyc0NvbW1hbmQpLmNhbGxzRmFrZSgoaW5wdXQ6IGFueSkgPT4ge1xuICAgICAgICBleHBlY3QoaW5wdXQuRmlsdGVyKS50b0JlKCdlbWFpbCBePSBcInRlc3RcIicpO1xuICAgICAgICBleHBlY3QoaW5wdXQuUGFnaW5hdGlvblRva2VuKS50b0JlKCdwYWdlLTInKTtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7IFVzZXJzOiBbXSB9KTtcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0xvZ2dpbmcnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBsb2cgaW5jb21pbmcgZXZlbnQnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBjb25zb2xlSW5mb1NweSA9IGplc3Quc3B5T24oY29uc29sZSwgJ2luZm8nKS5tb2NrSW1wbGVtZW50YXRpb24oKTtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSk7XG5cbiAgICAgIGNvZ25pdG9Nb2NrLm9uKExpc3RVc2Vyc0NvbW1hbmQpLnJlc29sdmVzKHsgVXNlcnM6IFtdIH0pO1xuXG4gICAgICBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KGNvbnNvbGVJbmZvU3B5KS50b0hhdmVCZWVuQ2FsbGVkV2l0aCgnR2V0IGFsbCB1c2VycyBldmVudDonLCBleHBlY3QuYW55KFN0cmluZykpO1xuXG4gICAgICBjb25zb2xlSW5mb1NweS5tb2NrUmVzdG9yZSgpO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnVXNlciB0cmFuc2Zvcm1hdGlvbicsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBhbGwgYXR0cmlidXRlIGNvbWJpbmF0aW9ucyBjb3JyZWN0bHknLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUpO1xuXG4gICAgICBjb25zdCBtb2NrVXNlcnMgPSBbXG4gICAgICAgIHtcbiAgICAgICAgICBVc2VybmFtZTogJ3VzZXItY29tcGxldGUnLFxuICAgICAgICAgIEF0dHJpYnV0ZXM6IFtcbiAgICAgICAgICAgIHsgTmFtZTogJ2VtYWlsJywgVmFsdWU6ICdjb21wbGV0ZUBleGFtcGxlLmNvbScgfSxcbiAgICAgICAgICAgIHsgTmFtZTogJ2dpdmVuX25hbWUnLCBWYWx1ZTogJ0NvbXBsZXRlJyB9LFxuICAgICAgICAgICAgeyBOYW1lOiAnZmFtaWx5X25hbWUnLCBWYWx1ZTogJ1VzZXInIH0sXG4gICAgICAgICAgICB7IE5hbWU6ICdwaG9uZV9udW1iZXInLCBWYWx1ZTogJysxMjM0NTY3ODkwJyB9LCAvLyBFeHRyYSBhdHRyaWJ1dGUgKGlnbm9yZWQpXG4gICAgICAgICAgXSxcbiAgICAgICAgICBVc2VyQ3JlYXRlRGF0ZTogbmV3IERhdGUoJzIwMjQtMDEtMDFUMDA6MDA6MDBaJyksXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBVc2VybmFtZTogJ3VzZXItbWluaW1hbCcsXG4gICAgICAgICAgQXR0cmlidXRlczogW10sXG4gICAgICAgICAgVXNlckNyZWF0ZURhdGU6IG5ldyBEYXRlKCcyMDI0LTAxLTAyVDAwOjAwOjAwWicpLFxuICAgICAgICB9LFxuICAgICAgXTtcblxuICAgICAgY29nbml0b01vY2sub24oTGlzdFVzZXJzQ29tbWFuZCkucmVzb2x2ZXMoeyBVc2VyczogbW9ja1VzZXJzIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LnVzZXJzWzBdKS50b0VxdWFsKHtcbiAgICAgICAgdXNlcklkOiAndXNlci1jb21wbGV0ZScsXG4gICAgICAgIGVtYWlsOiAnY29tcGxldGVAZXhhbXBsZS5jb20nLFxuICAgICAgICBuYW1lOiAnQ29tcGxldGUgVXNlcicsXG4gICAgICAgIGNyZWF0ZWRBdDogJzIwMjQtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG4gICAgICB9KTtcbiAgICAgIGV4cGVjdChib2R5LnVzZXJzWzFdKS50b0VxdWFsKHtcbiAgICAgICAgdXNlcklkOiAndXNlci1taW5pbWFsJyxcbiAgICAgICAgZW1haWw6ICdObyBlbWFpbCcsXG4gICAgICAgIG5hbWU6IHVuZGVmaW5lZCxcbiAgICAgICAgY3JlYXRlZEF0OiAnMjAyNC0wMS0wMlQwMDowMDowMC4wMDBaJyxcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9KTtcbn0pO1xuIl19