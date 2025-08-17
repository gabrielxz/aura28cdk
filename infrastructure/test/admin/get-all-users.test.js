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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cognitoMock.on(client_cognito_identity_provider_1.ListUsersCommand).callsFake((input) => {
                expect(input.Filter).toBe('email ^= "john"');
                return Promise.resolve({ Users: [] });
            });
            const response = await (0, get_all_users_1.handler)(event);
            expect(response.statusCode).toBe(200);
        });
        it('should handle pagination with nextToken', async () => {
            const event = createEvent(true, { nextToken: 'pagination-token' });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cognitoMock.on(client_cognito_identity_provider_1.ListUsersCommand).callsFake((input) => {
                expect(input.Filter).toBe('email ^= "user@example.com"');
                return Promise.resolve({ Users: [] });
            });
            const response = await (0, get_all_users_1.handler)(event);
            expect(response.statusCode).toBe(200);
        });
        it('should handle empty search term', async () => {
            const event = createEvent(true, { search: '' });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2V0LWFsbC11c2Vycy50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZ2V0LWFsbC11c2Vycy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsb0VBQTJEO0FBRTNELGdHQUdtRDtBQUNuRCw2REFBaUQ7QUFFakQsMEJBQTBCO0FBQzFCLE1BQU0sV0FBVyxHQUFHLElBQUEsZ0NBQVUsRUFBQyxnRUFBNkIsQ0FBQyxDQUFDO0FBRTlELFFBQVEsQ0FBQyxzQkFBc0IsRUFBRSxHQUFHLEVBQUU7SUFDcEMsVUFBVSxDQUFDLEdBQUcsRUFBRTtRQUNkLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNwQixPQUFPLENBQUMsR0FBRyxDQUFDLFlBQVksR0FBRyxtQkFBbUIsQ0FBQztJQUNqRCxDQUFDLENBQUMsQ0FBQztJQUVILE1BQU0sV0FBVyxHQUFHLENBQ2xCLE9BQWdCLEVBQ2hCLFdBQW9DLEVBQ0wsRUFBRSxDQUFDLENBQUM7UUFDbkMscUJBQXFCLEVBQUUsV0FBVyxJQUFJLElBQUk7UUFDMUMsY0FBYyxFQUFFO1lBQ2QsVUFBVSxFQUFFO2dCQUNWLE1BQU0sRUFBRTtvQkFDTixnQkFBZ0IsRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUU7aUJBQzNDO2FBQ0Y7U0FDbUQ7S0FDdkQsQ0FBQyxDQUFDO0lBRUgsUUFBUSxDQUFDLGVBQWUsRUFBRSxHQUFHLEVBQUU7UUFDN0IsRUFBRSxDQUFDLDBDQUEwQyxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ3hELE1BQU0sS0FBSyxHQUFHLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNqQyxNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUEsdUJBQU8sRUFBQyxLQUE2QixDQUFDLENBQUM7WUFFOUQsTUFBTSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDdEMsTUFBTSxJ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S0FBSyxFQUFFLGFBQWEsRUFBRSxFQUFFLDRCQUE0QjtxQkFDN0U7b0JBQ0QsY0FBYyxFQUFFLElBQUksSUFBSSxDQUFDLHNCQUFzQixDQUFDO2lCQUNqRDtnQkFDRDtvQkFDRSxRQUFRLEVBQUUsY0FBYztvQkFDeEIsVUFBVSxFQUFFLEVBQUU7b0JBQ2QsY0FBYyxFQUFFLElBQUksSUFBSSxDQUFDLHNCQUFzQixDQUFDO2lCQUNqRDthQUNGLENBQUM7WUFFRixXQUFXLENBQUMsRUFBRSxDQUFDLG1EQUFnQixDQUFDLENBQUMsUUFBUSxDQUFDLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUM7WUFFaEUsTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFBLHVCQUFPLEVBQUMsS0FBNkIsQ0FBQyxDQUFDO1lBRTlELE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3ZDLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDO2dCQUM1QixNQUFNLEVBQUUsZUFBZTtnQkFDdkIsS0FBSyxFQUFFLHNCQUFzQjtnQkFDN0IsSUFBSSxFQUFFLGVBQWU7Z0JBQ3JCLFNBQVMsRUFBRSwwQkFBMEI7YUFDdEMsQ0FBQyxDQUFDO1lBQ0gsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUM7Z0JBQzVCLE1BQU0sRUFBRSxjQUFjO2dCQUN0QixLQUFLLEVBQUUsVUFBVTtnQkFDakIsSUFBSSxFQUFFLFNBQVM7Z0JBQ2YsU0FBUyxFQUFFLDBCQUEwQjthQUN0QyxDQUFDLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBoYW5kbGVyIH0gZnJvbSAnLi4vLi4vbGFtYmRhL2FkbWluL2dldC1hbGwtdXNlcnMnO1xuaW1wb3J0IHsgQVBJR2F0ZXdheVByb3h5RXZlbnQgfSBmcm9tICdhd3MtbGFtYmRhJztcbmltcG9ydCB7XG4gIENvZ25pdG9JZGVudGl0eVByb3ZpZGVyQ2xpZW50LFxuICBMaXN0VXNlcnNDb21tYW5kLFxufSBmcm9tICdAYXdzLXNkay9jbGllbnQtY29nbml0by1pZGVudGl0eS1wcm92aWRlcic7XG5pbXBvcnQgeyBtb2NrQ2xpZW50IH0gZnJvbSAnYXdzLXNkay1jbGllbnQtbW9jayc7XG5cbi8vIE1vY2sgdGhlIENvZ25pdG8gY2xpZW50XG5jb25zdCBjb2duaXRvTW9jayA9IG1vY2tDbGllbnQoQ29nbml0b0lkZW50aXR5UHJvdmlkZXJDbGllbnQpO1xuXG5kZXNjcmliZSgnZ2V0LWFsbC11c2VycyBMYW1iZGEnLCAoKSA9PiB7XG4gIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgIGNvZ25pdG9Nb2NrLnJlc2V0KCk7XG4gICAgcHJvY2Vzcy5lbnYuVVNFUl9QT09MX0lEID0gJ3Rlc3QtdXNlci1wb29sLWlkJztcbiAgfSk7XG5cbiAgY29uc3QgY3JlYXRlRXZlbnQgPSAoXG4gICAgaXNBZG1pbjogYm9vbGVhbixcbiAgICBxdWVyeVBhcmFtcz86IFJlY29yZDxzdHJpbmcsIHN0cmluZz4sXG4gICk6IFBhcnRpYWw8QVBJR2F0ZXdheVByb3h5RXZlbnQ+ID0+ICh7XG4gICAgcXVlcnlTdHJpbmdQYXJhbWV0ZXJzOiBxdWVyeVBhcmFtcyB8fCBudWxsLFxuICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICBhdXRob3JpemVyOiB7XG4gICAgICAgIGNsYWltczoge1xuICAgICAgICAgICdjb2duaXRvOmdyb3Vwcyc6IGlzQWRtaW4gPyBbJ2FkbWluJ10gOiBbXSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSBhcyB1bmtub3duIGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50WydyZXF1ZXN0Q29udGV4dCddLFxuICB9KTtcblxuICBkZXNjcmliZSgnQXV0aG9yaXphdGlvbicsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIHJldHVybiA0MDMgd2hlbiB1c2VyIGlzIG5vdCBhZG1pbicsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQoZmFsc2UpO1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoNDAzKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmUoJ0FjY2VzcyBkZW5pZWQuIEFkbWluIHByaXZpbGVnZXMgcmVxdWlyZWQuJyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGFsbG93IGFjY2VzcyB3aGVuIHVzZXIgaXMgYWRtaW4nLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUpO1xuXG4gICAgICBjb2duaXRvTW9jay5vbihMaXN0VXNlcnNDb21tYW5kKS5yZXNvbHZlcyh7IFVzZXJzOiBbXSB9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIGFkbWluIGdyb3VwIGFzIGNvbW1hLXNlcGFyYXRlZCBzdHJpbmcnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudDogUGFydGlhbDxBUElHYXRld2F5UHJveHlFdmVudD4gPSB7XG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICAgICAgY2xhaW1zOiB7XG4gICAgICAgICAgICAgICdjb2duaXRvOmdyb3Vwcyc6ICd1c2VyLGFkbWluLHByZW1pdW0nLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9IGFzIHVua25vd24gYXMgQVBJR2F0ZXdheVByb3h5RXZlbnRbJ3JlcXVlc3RDb250ZXh0J10sXG4gICAgICB9O1xuXG4gICAgICBjb2duaXRvTW9jay5vbihMaXN0VXNlcnNDb21tYW5kKS5yZXNvbHZlcyh7IFVzZXJzOiBbXSB9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIGFkbWluIGdyb3VwIGFzIGFycmF5JywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQ6IFBhcnRpYWw8QVBJR2F0ZXdheVByb3h5RXZlbnQ+ID0ge1xuICAgICAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgICAgIGF1dGhvcml6ZXI6IHtcbiAgICAgICAgICAgIGNsYWltczoge1xuICAgICAgICAgICAgICAnY29nbml0bzpncm91cHMnOiBbJ3VzZXInLCAnYWRtaW4nLCAncHJlbWl1bSddLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9IGFzIHVua25vd24gYXMgQVBJR2F0ZXdheVByb3h5RXZlbnRbJ3JlcXVlc3RDb250ZXh0J10sXG4gICAgICB9O1xuXG4gICAgICBjb2duaXRvTW9jay5vbihMaXN0VXNlcnNDb21tYW5kKS5yZXNvbHZlcyh7IFVzZXJzOiBbXSB9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0ZldGNoaW5nIHVzZXJzJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgZmV0Y2ggYWxsIHVzZXJzIHdpdGhvdXQgZmlsdGVycycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSk7XG5cbiAgICAgIGNvbnN0IG1vY2tVc2VycyA9IFtcbiAgICAgICAge1xuICAgICAgICAgIFVzZXJuYW1lOiAndXNlci0xJyxcbiAgICAgICAgICBBdHRyaWJ1dGVzOiBbXG4gICAgICAgICAgICB7IE5hbWU6ICdlbWFpbCcsIFZhbHVlOiAndXNlcjFAZXhhbXBsZS5jb20nIH0sXG4gICAgICAgICAgICB7IE5hbWU6ICdnaXZlbl9uYW1lJywgVmFsdWU6ICdKb2huJyB9LFxuICAgICAgICAgICAgeyBOYW1lOiAnZmFtaWx5X25hbWUnLCBWYWx1ZTogJ0RvZScgfSxcbiAgICAgICAgICBdLFxuICAgICAgICAgIFVzZXJDcmVhdGVEYXRlOiBuZXcgRGF0ZSgnMjAyNC0wMS0wMVQwMDowMDowMFonKSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIFVzZXJuYW1lOiAndXNlci0yJyxcbiAgICAgICAgICBBdHRyaWJ1dGVzOiBbXG4gICAgICAgICAgICB7IE5hbWU6ICdlbWFpbCcsIFZhbHVlOiAndXNlcjJAZXhhbXBsZS5jb20nIH0sXG4gICAgICAgICAgICB7IE5hbWU6ICdnaXZlbl9uYW1lJywgVmFsdWU6ICdKYW5lJyB9LFxuICAgICAgICAgICAgeyBOYW1lOiAnZmFtaWx5X25hbWUnLCBWYWx1ZTogJ1NtaXRoJyB9LFxuICAgICAgICAgIF0sXG4gICAgICAgICAgVXNlckNyZWF0ZURhdGU6IG5ldyBEYXRlKCcyMDI0LTAxLTAyVDAwOjAwOjAwWicpLFxuICAgICAgICB9LFxuICAgICAgXTtcblxuICAgICAgY29nbml0b01vY2sub24oTGlzdFVzZXJzQ29tbWFuZCkucmVzb2x2ZXMoeyBVc2VyczogbW9ja1VzZXJzIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS51c2VycykudG9IYXZlTGVuZ3RoKDIpO1xuICAgICAgZXhwZWN0KGJvZHkudXNlcnNbMF0pLnRvRXF1YWwoe1xuICAgICAgICB1c2VySWQ6ICd1c2VyLTEnLFxuICAgICAgICBlbWFpbDogJ3VzZXIxQGV4YW1wbGUuY29tJyxcbiAgICAgICAgbmFtZTogJ0pvaG4gRG9lJyxcbiAgICAgICAgY3JlYXRlZEF0OiAnMjAyNC0wMS0wMVQwMDowMDowMC4wMDBaJyxcbiAgICAgIH0pO1xuICAgICAgZXhwZWN0KGJvZHkudXNlcnNbMV0pLnRvRXF1YWwoe1xuICAgICAgICB1c2VySWQ6ICd1c2VyLTInLFxuICAgICAgICBlbWFpbDogJ3VzZXIyQGV4YW1wbGUuY29tJyxcbiAgICAgICAgbmFtZTogJ0phbmUgU21pdGgnLFxuICAgICAgICBjcmVhdGVkQXQ6ICcyMDI0LTAxLTAyVDAwOjAwOjAwLjAwMFonLFxuICAgICAgfSk7XG4gICAgICBleHBlY3QoYm9keS5jb3VudCkudG9CZSgyKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgYXBwbHkgc2VhcmNoIGZpbHRlcicsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSwgeyBzZWFyY2g6ICdqb2huJyB9KTtcblxuICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgIGNvZ25pdG9Nb2NrLm9uKExpc3RVc2Vyc0NvbW1hbmQpLmNhbGxzRmFrZSgoaW5wdXQ6IGFueSkgPT4ge1xuICAgICAgICBleHBlY3QoaW5wdXQuRmlsdGVyKS50b0JlKCdlbWFpbCBePSBcImpvaG5cIicpO1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHsgVXNlcnM6IFtdIH0pO1xuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgcGFnaW5hdGlvbiB3aXRoIG5leHRUb2tlbicsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSwgeyBuZXh0VG9rZW46ICdwYWdpbmF0aW9uLXRva2VuJyB9KTtcblxuICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgIGNvZ25pdG9Nb2NrLm9uKExpc3RVc2Vyc0NvbW1hbmQpLmNhbGxzRmFrZSgoaW5wdXQ6IGFueSkgPT4ge1xuICAgICAgICBleHBlY3QoaW5wdXQuUGFnaW5hdGlvblRva2VuKS50b0JlKCdwYWdpbmF0aW9uLXRva2VuJyk7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICAgIFVzZXJzOiBbXSxcbiAgICAgICAgICBQYWdpbmF0aW9uVG9rZW46ICduZXh0LXBhZ2luYXRpb24tdG9rZW4nLFxuICAgICAgICB9KTtcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcblxuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5uZXh0VG9rZW4pLnRvQmUoJ25leHQtcGFnaW5hdGlvbi10b2tlbicpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBzZXQgbGltaXQgdG8gNjAgKENvZ25pdG8gbWF4KScsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSk7XG5cbiAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICBjb2duaXRvTW9jay5vbihMaXN0VXNlcnNDb21tYW5kKS5jYWxsc0Zha2UoKGlucHV0OiBhbnkpID0+IHtcbiAgICAgICAgZXhwZWN0KGlucHV0LkxpbWl0KS50b0JlKDYwKTtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7IFVzZXJzOiBbXSB9KTtcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIHVzZXJzIHdpdGggcGFydGlhbCBuYW1lIGF0dHJpYnV0ZXMnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUpO1xuXG4gICAgICBjb25zdCBtb2NrVXNlcnMgPSBbXG4gICAgICAgIHtcbiAgICAgICAgICBVc2VybmFtZTogJ3VzZXItMScsXG4gICAgICAgICAgQXR0cmlidXRlczogW1xuICAgICAgICAgICAgeyBOYW1lOiAnZW1haWwnLCBWYWx1ZTogJ3VzZXIxQGV4YW1wbGUuY29tJyB9LFxuICAgICAgICAgICAgeyBOYW1lOiAnZ2l2ZW5fbmFtZScsIFZhbHVlOiAnSm9obicgfSxcbiAgICAgICAgICAgIC8vIE5vIGZhbWlseSBuYW1lXG4gICAgICAgICAgXSxcbiAgICAgICAgICBVc2VyQ3JlYXRlRGF0ZTogbmV3IERhdGUoJzIwMjQtMDEtMDFUMDA6MDA6MDBaJyksXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBVc2VybmFtZTogJ3VzZXItMicsXG4gICAgICAgICAgQXR0cmlidXRlczogW1xuICAgICAgICAgICAgeyBOYW1lOiAnZW1haWwnLCBWYWx1ZTogJ3VzZXIyQGV4YW1wbGUuY29tJyB9LFxuICAgICAgICAgICAgLy8gTm8gZ2l2ZW4gbmFtZVxuICAgICAgICAgICAgeyBOYW1lOiAnZmFtaWx5X25hbWUnLCBWYWx1ZTogJ1NtaXRoJyB9LFxuICAgICAgICAgIF0sXG4gICAgICAgICAgVXNlckNyZWF0ZURhdGU6IG5ldyBEYXRlKCcyMDI0LTAxLTAyVDAwOjAwOjAwWicpLFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgVXNlcm5hbWU6ICd1c2VyLTMnLFxuICAgICAgICAgIEF0dHJpYnV0ZXM6IFtcbiAgICAgICAgICAgIHsgTmFtZTogJ2VtYWlsJywgVmFsdWU6ICd1c2VyM0BleGFtcGxlLmNvbScgfSxcbiAgICAgICAgICAgIC8vIE5vIG5hbWUgYXR0cmlidXRlc1xuICAgICAgICAgIF0sXG4gICAgICAgICAgVXNlckNyZWF0ZURhdGU6IG5ldyBEYXRlKCcyMDI0LTAxLTAzVDAwOjAwOjAwWicpLFxuICAgICAgICB9LFxuICAgICAgXTtcblxuICAgICAgY29nbml0b01vY2sub24oTGlzdFVzZXJzQ29tbWFuZCkucmVzb2x2ZXMoeyBVc2VyczogbW9ja1VzZXJzIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LnVzZXJzWzBdLm5hbWUpLnRvQmUoJ0pvaG4nKTtcbiAgICAgIGV4cGVjdChib2R5LnVzZXJzWzFdLm5hbWUpLnRvQmUoJ1NtaXRoJyk7XG4gICAgICBleHBlY3QoYm9keS51c2Vyc1syXS5uYW1lKS50b0JlVW5kZWZpbmVkKCk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSB1c2VycyB3aXRob3V0IGVtYWlsJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlKTtcblxuICAgICAgY29uc3QgbW9ja1VzZXJzID0gW1xuICAgICAgICB7XG4gICAgICAgICAgVXNlcm5hbWU6ICd1c2VyLTEnLFxuICAgICAgICAgIEF0dHJpYnV0ZXM6IFtcbiAgICAgICAgICAgIC8vIE5vIGVtYWlsIGF0dHJpYnV0ZVxuICAgICAgICAgICAgeyBOYW1lOiAnZ2l2ZW5fbmFtZScsIFZhbHVlOiAnSm9obicgfSxcbiAgICAgICAgICBdLFxuICAgICAgICAgIFVzZXJDcmVhdGVEYXRlOiBuZXcgRGF0ZSgnMjAyNC0wMS0wMVQwMDowMDowMFonKSxcbiAgICAgICAgfSxcbiAgICAgIF07XG5cbiAgICAgIGNvZ25pdG9Nb2NrLm9uKExpc3RVc2Vyc0NvbW1hbmQpLnJlc29sdmVzKHsgVXNlcnM6IG1vY2tVc2VycyB9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS51c2Vyc1swXS5lbWFpbCkudG9CZSgnTm8gZW1haWwnKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIHVzZXJzIHdpdGhvdXQgY3JlYXRlIGRhdGUnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUpO1xuXG4gICAgICBjb25zdCBtb2NrVXNlcnMgPSBbXG4gICAgICAgIHtcbiAgICAgICAgICBVc2VybmFtZTogJ3VzZXItMScsXG4gICAgICAgICAgQXR0cmlidXRlczogW3sgTmFtZTogJ2VtYWlsJywgVmFsdWU6ICd1c2VyMUBleGFtcGxlLmNvbScgfV0sXG4gICAgICAgICAgLy8gTm8gVXNlckNyZWF0ZURhdGVcbiAgICAgICAgfSxcbiAgICAgIF07XG5cbiAgICAgIGNvZ25pdG9Nb2NrLm9uKExpc3RVc2Vyc0NvbW1hbmQpLnJlc29sdmVzKHsgVXNlcnM6IG1vY2tVc2VycyB9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS51c2Vyc1swXS5jcmVhdGVkQXQpLnRvQmUoJycpO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnRXJyb3IgaGFuZGxpbmcnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgQ29nbml0byBlcnJvcnMnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUpO1xuXG4gICAgICBjb2duaXRvTW9jay5vbihMaXN0VXNlcnNDb21tYW5kKS5yZWplY3RzKG5ldyBFcnJvcignQ29nbml0byBlcnJvcicpKTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoNTAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmUoJ0ludGVybmFsIHNlcnZlciBlcnJvcicpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBsb2cgZXJyb3JzIHRvIGNvbnNvbGUnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBjb25zb2xlRXJyb3JTcHkgPSBqZXN0LnNweU9uKGNvbnNvbGUsICdlcnJvcicpLm1vY2tJbXBsZW1lbnRhdGlvbigpO1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlKTtcblxuICAgICAgY29uc3QgZXJyb3IgPSBuZXcgRXJyb3IoJ1Rlc3QgZXJyb3InKTtcbiAgICAgIGNvZ25pdG9Nb2NrLm9uKExpc3RVc2Vyc0NvbW1hbmQpLnJlamVjdHMoZXJyb3IpO1xuXG4gICAgICBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KGNvbnNvbGVFcnJvclNweSkudG9IYXZlQmVlbkNhbGxlZFdpdGgoJ0Vycm9yOicsIGVycm9yKTtcbiAgICAgIGNvbnNvbGVFcnJvclNweS5tb2NrUmVzdG9yZSgpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgbWlzc2luZyBVU0VSX1BPT0xfSUQgZW52aXJvbm1lbnQgdmFyaWFibGUnLCBhc3luYyAoKSA9PiB7XG4gICAgICBkZWxldGUgcHJvY2Vzcy5lbnYuVVNFUl9QT09MX0lEO1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlKTtcblxuICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgIGNvZ25pdG9Nb2NrLm9uKExpc3RVc2Vyc0NvbW1hbmQpLmNhbGxzRmFrZSgoaW5wdXQ6IGFueSkgPT4ge1xuICAgICAgICBleHBlY3QoaW5wdXQuVXNlclBvb2xJZCkudG9CZVVuZGVmaW5lZCgpO1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHsgVXNlcnM6IFtdIH0pO1xuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG4gICAgICAvLyBTaG91bGQgc3RpbGwgd29yayBidXQgd2l0aCB1bmRlZmluZWQgcG9vbCBJRFxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ1Jlc3BvbnNlIGZvcm1hdCcsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGluY2x1ZGUgQ09SUyBoZWFkZXJzJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlKTtcblxuICAgICAgY29nbml0b01vY2sub24oTGlzdFVzZXJzQ29tbWFuZCkucmVzb2x2ZXMoeyBVc2VyczogW10gfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5oZWFkZXJzKS50b0VxdWFsKHtcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gcHJvcGVyIHJlc3BvbnNlIHN0cnVjdHVyZScsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSk7XG5cbiAgICAgIGNvZ25pdG9Nb2NrLm9uKExpc3RVc2Vyc0NvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgVXNlcnM6IFtdLFxuICAgICAgICBQYWdpbmF0aW9uVG9rZW46ICduZXh0LXRva2VuJyxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keSkudG9IYXZlUHJvcGVydHkoJ3VzZXJzJyk7XG4gICAgICBleHBlY3QoYm9keSkudG9IYXZlUHJvcGVydHkoJ2NvdW50Jyk7XG4gICAgICBleHBlY3QoYm9keSkudG9IYXZlUHJvcGVydHkoJ25leHRUb2tlbicpO1xuICAgICAgZXhwZWN0KEFycmF5LmlzQXJyYXkoYm9keS51c2VycykpLnRvQmUodHJ1ZSk7XG4gICAgICBleHBlY3QodHlwZW9mIGJvZHkuY291bnQpLnRvQmUoJ251bWJlcicpO1xuICAgICAgZXhwZWN0KGJvZHkubmV4dFRva2VuKS50b0JlKCduZXh0LXRva2VuJyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBlbXB0eSB1c2VycyBsaXN0JywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlKTtcblxuICAgICAgY29nbml0b01vY2sub24oTGlzdFVzZXJzQ29tbWFuZCkucmVzb2x2ZXMoeyBVc2VyczogdW5kZWZpbmVkIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS51c2VycykudG9FcXVhbChbXSk7XG4gICAgICBleHBlY3QoYm9keS5jb3VudCkudG9CZSgwKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ1NlYXJjaCBmdW5jdGlvbmFsaXR5JywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgZXNjYXBlIHNwZWNpYWwgY2hhcmFjdGVycyBpbiBzZWFyY2ggdGVybScsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSwgeyBzZWFyY2g6ICd1c2VyQGV4YW1wbGUuY29tJyB9KTtcblxuICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgIGNvZ25pdG9Nb2NrLm9uKExpc3RVc2Vyc0NvbW1hbmQpLmNhbGxzRmFrZSgoaW5wdXQ6IGFueSkgPT4ge1xuICAgICAgICBleHBlY3QoaW5wdXQuRmlsdGVyKS50b0JlKCdlbWFpbCBePSBcInVzZXJAZXhhbXBsZS5jb21cIicpO1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHsgVXNlcnM6IFtdIH0pO1xuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgZW1wdHkgc2VhcmNoIHRlcm0nLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUsIHsgc2VhcmNoOiAnJyB9KTtcblxuICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgIGNvZ25pdG9Nb2NrLm9uKExpc3RVc2Vyc0NvbW1hbmQpLmNhbGxzRmFrZSgoaW5wdXQ6IGFueSkgPT4ge1xuICAgICAgICBleHBlY3QoaW5wdXQuRmlsdGVyKS50b0JlVW5kZWZpbmVkKCk7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoeyBVc2VyczogW10gfSk7XG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGNvbWJpbmUgc2VhcmNoIHdpdGggcGFnaW5hdGlvbicsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSwge1xuICAgICAgICBzZWFyY2g6ICd0ZXN0JyxcbiAgICAgICAgbmV4dFRva2VuOiAncGFnZS0yJyxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgY29nbml0b01vY2sub24oTGlzdFVzZXJzQ29tbWFuZCkuY2FsbHNGYWtlKChpbnB1dDogYW55KSA9PiB7XG4gICAgICAgIGV4cGVjdChpbnB1dC5GaWx0ZXIpLnRvQmUoJ2VtYWlsIF49IFwidGVzdFwiJyk7XG4gICAgICAgIGV4cGVjdChpbnB1dC5QYWdpbmF0aW9uVG9rZW4pLnRvQmUoJ3BhZ2UtMicpO1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHsgVXNlcnM6IFtdIH0pO1xuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnTG9nZ2luZycsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGxvZyBpbmNvbWluZyBldmVudCcsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGNvbnNvbGVJbmZvU3B5ID0gamVzdC5zcHlPbihjb25zb2xlLCAnaW5mbycpLm1vY2tJbXBsZW1lbnRhdGlvbigpO1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlKTtcblxuICAgICAgY29nbml0b01vY2sub24oTGlzdFVzZXJzQ29tbWFuZCkucmVzb2x2ZXMoeyBVc2VyczogW10gfSk7XG5cbiAgICAgIGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QoY29uc29sZUluZm9TcHkpLnRvSGF2ZUJlZW5DYWxsZWRXaXRoKCdHZXQgYWxsIHVzZXJzIGV2ZW50OicsIGV4cGVjdC5hbnkoU3RyaW5nKSk7XG5cbiAgICAgIGNvbnNvbGVJbmZvU3B5Lm1vY2tSZXN0b3JlKCk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdVc2VyIHRyYW5zZm9ybWF0aW9uJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgaGFuZGxlIGFsbCBhdHRyaWJ1dGUgY29tYmluYXRpb25zIGNvcnJlY3RseScsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSk7XG5cbiAgICAgIGNvbnN0IG1vY2tVc2VycyA9IFtcbiAgICAgICAge1xuICAgICAgICAgIFVzZXJuYW1lOiAndXNlci1jb21wbGV0ZScsXG4gICAgICAgICAgQXR0cmlidXRlczogW1xuICAgICAgICAgICAgeyBOYW1lOiAnZW1haWwnLCBWYWx1ZTogJ2NvbXBsZXRlQGV4YW1wbGUuY29tJyB9LFxuICAgICAgICAgICAgeyBOYW1lOiAnZ2l2ZW5fbmFtZScsIFZhbHVlOiAnQ29tcGxldGUnIH0sXG4gICAgICAgICAgICB7IE5hbWU6ICdmYW1pbHlfbmFtZScsIFZhbHVlOiAnVXNlcicgfSxcbiAgICAgICAgICAgIHsgTmFtZTogJ3Bob25lX251bWJlcicsIFZhbHVlOiAnKzEyMzQ1Njc4OTAnIH0sIC8vIEV4dHJhIGF0dHJpYnV0ZSAoaWdub3JlZClcbiAgICAgICAgICBdLFxuICAgICAgICAgIFVzZXJDcmVhdGVEYXRlOiBuZXcgRGF0ZSgnMjAyNC0wMS0wMVQwMDowMDowMFonKSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIFVzZXJuYW1lOiAndXNlci1taW5pbWFsJyxcbiAgICAgICAgICBBdHRyaWJ1dGVzOiBbXSxcbiAgICAgICAgICBVc2VyQ3JlYXRlRGF0ZTogbmV3IERhdGUoJzIwMjQtMDEtMDJUMDA6MDA6MDBaJyksXG4gICAgICAgIH0sXG4gICAgICBdO1xuXG4gICAgICBjb2duaXRvTW9jay5vbihMaXN0VXNlcnNDb21tYW5kKS5yZXNvbHZlcyh7IFVzZXJzOiBtb2NrVXNlcnMgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkudXNlcnNbMF0pLnRvRXF1YWwoe1xuICAgICAgICB1c2VySWQ6ICd1c2VyLWNvbXBsZXRlJyxcbiAgICAgICAgZW1haWw6ICdjb21wbGV0ZUBleGFtcGxlLmNvbScsXG4gICAgICAgIG5hbWU6ICdDb21wbGV0ZSBVc2VyJyxcbiAgICAgICAgY3JlYXRlZEF0OiAnMjAyNC0wMS0wMVQwMDowMDowMC4wMDBaJyxcbiAgICAgIH0pO1xuICAgICAgZXhwZWN0KGJvZHkudXNlcnNbMV0pLnRvRXF1YWwoe1xuICAgICAgICB1c2VySWQ6ICd1c2VyLW1pbmltYWwnLFxuICAgICAgICBlbWFpbDogJ05vIGVtYWlsJyxcbiAgICAgICAgbmFtZTogdW5kZWZpbmVkLFxuICAgICAgICBjcmVhdGVkQXQ6ICcyMDI0LTAxLTAyVDAwOjAwOjAwLjAwMFonLFxuICAgICAgfSk7XG4gICAgfSk7XG4gIH0pO1xufSk7XG4iXX0=