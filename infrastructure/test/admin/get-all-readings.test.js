"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const get_all_readings_1 = require("../../lambda/admin/get-all-readings");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const aws_sdk_client_mock_1 = require("aws-sdk-client-mock");
// Mock the DynamoDB client
const dynamoMock = (0, aws_sdk_client_mock_1.mockClient)(lib_dynamodb_1.DynamoDBDocumentClient);
describe('get-all-readings Lambda', () => {
    beforeEach(() => {
        dynamoMock.reset();
        process.env.READINGS_TABLE_NAME = 'test-readings-table';
        process.env.USER_TABLE_NAME = 'test-user-table';
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
            const response = await (0, get_all_readings_1.handler)(event);
            expect(response.statusCode).toBe(403);
            const body = JSON.parse(response.body);
            expect(body.error).toBe('Access denied. Admin privileges required.');
        });
        it('should allow access when user is admin', async () => {
            const event = createEvent(true);
            dynamoMock.on(lib_dynamodb_1.ScanCommand).resolves({ Items: [] });
            const response = await (0, get_all_readings_1.handler)(event);
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
            dynamoMock.on(lib_dynamodb_1.ScanCommand).resolves({ Items: [] });
            const response = await (0, get_all_readings_1.handler)(event);
            expect(response.statusCode).toBe(200);
        });
        it('should reject when admin is not in comma-separated string', async () => {
            const event = {
                requestContext: {
                    authorizer: {
                        claims: {
                            'cognito:groups': 'user,premium',
                        },
                    },
                },
            };
            const response = await (0, get_all_readings_1.handler)(event);
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
            dynamoMock.on(lib_dynamodb_1.ScanCommand).resolves({ Items: mockReadings });
            dynamoMock
                .on(lib_dynamodb_1.GetCommand, { Key: { userId: 'user-1', createdAt: 'PROFILE' } })
                .resolves({ Item: mockUsers[0] });
            dynamoMock
                .on(lib_dynamodb_1.GetCommand, { Key: { userId: 'user-2', createdAt: 'PROFILE' } })
                .resolves({ Item: mockUsers[1] });
            const response = await (0, get_all_readings_1.handler)(event);
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
            dynamoMock.on(lib_dynamodb_1.ScanCommand).callsFake((input) => {
                expect(input.FilterExpression).toContain('createdAt >= :startDate');
                expect(input.FilterExpression).toContain('createdAt <= :endDate');
                expect(input.ExpressionAttributeValues[':startDate']).toBe('2024-01-01');
                expect(input.ExpressionAttributeValues[':endDate']).toBe('2024-01-31T23:59:59.999Z');
                return Promise.resolve({ Items: [] });
            });
            const response = await (0, get_all_readings_1.handler)(event);
            expect(response.statusCode).toBe(200);
        });
        it('should apply status filter', async () => {
            const event = createEvent(true, { status: 'Ready' });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            dynamoMock.on(lib_dynamodb_1.ScanCommand).callsFake((input) => {
                expect(input.FilterExpression).toContain('#status = :status');
                expect(input.ExpressionAttributeNames['#status']).toBe('status');
                expect(input.ExpressionAttributeValues[':status']).toBe('Ready');
                return Promise.resolve({ Items: [] });
            });
            const response = await (0, get_all_readings_1.handler)(event);
            expect(response.statusCode).toBe(200);
        });
        it('should apply type filter', async () => {
            const event = createEvent(true, { type: 'Soul Blueprint' });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            dynamoMock.on(lib_dynamodb_1.ScanCommand).callsFake((input) => {
                expect(input.FilterExpression).toContain('#type = :type');
                expect(input.ExpressionAttributeNames['#type']).toBe('type');
                expect(input.ExpressionAttributeValues[':type']).toBe('Soul Blueprint');
                return Promise.resolve({ Items: [] });
            });
            const response = await (0, get_all_readings_1.handler)(event);
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
            dynamoMock.on(lib_dynamodb_1.ScanCommand).callsFake((input) => {
                expect(input.Limit).toBe(50);
                expect(input.ExclusiveStartKey).toEqual(lastKey);
                return Promise.resolve({ Items: [], LastEvaluatedKey: { readingId: 'reading-75' } });
            });
            const response = await (0, get_all_readings_1.handler)(event);
            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.body);
            expect(body.lastEvaluatedKey).toBeDefined();
            const decodedKey = JSON.parse(Buffer.from(body.lastEvaluatedKey, 'base64').toString());
            expect(decodedKey).toEqual({ readingId: 'reading-75' });
        });
        it('should use default limit of 25 when not specified', async () => {
            const event = createEvent(true);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            dynamoMock.on(lib_dynamodb_1.ScanCommand).callsFake((input) => {
                expect(input.Limit).toBe(25);
                return Promise.resolve({ Items: [] });
            });
            const response = await (0, get_all_readings_1.handler)(event);
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
            dynamoMock.on(lib_dynamodb_1.ScanCommand).resolves({ Items: mockReadings });
            dynamoMock
                .on(lib_dynamodb_1.GetCommand, { Key: { userId: 'user-1', createdAt: 'PROFILE' } })
                .resolves({ Item: { userId: 'user-1', email: 'user1@example.com' } });
            dynamoMock
                .on(lib_dynamodb_1.GetCommand, { Key: { userId: 'user-2', createdAt: 'PROFILE' } })
                .resolves({ Item: { userId: 'user-2', email: 'test@example.com' } });
            dynamoMock
                .on(lib_dynamodb_1.GetCommand, { Key: { userId: 'user-3', createdAt: 'PROFILE' } })
                .resolves({ Item: { userId: 'user-3', email: 'another@example.com' } });
            const response = await (0, get_all_readings_1.handler)(event);
            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.body);
            expect(body.readings).toHaveLength(1);
            expect(body.readings[0].readingId).toBe('reading-1');
            expect(body.readings[0].userEmail).toBe('user1@example.com');
        });
        it('should handle case-insensitive user search', async () => {
            const event = createEvent(true, { userSearch: 'USER1' });
            const mockReadings = [{ readingId: 'reading-1', userId: 'user-1' }];
            dynamoMock.on(lib_dynamodb_1.ScanCommand).resolves({ Items: mockReadings });
            dynamoMock
                .on(lib_dynamodb_1.GetCommand)
                .resolves({ Item: { userId: 'user-1', email: 'user1@example.com' } });
            const response = await (0, get_all_readings_1.handler)(event);
            const body = JSON.parse(response.body);
            expect(body.readings).toHaveLength(1);
        });
        it('should handle users not found in user table', async () => {
            const event = createEvent(true, { userSearch: 'test' });
            const mockReadings = [
                { readingId: 'reading-1', userId: 'user-1' },
                { readingId: 'reading-2', userId: 'user-2' },
            ];
            dynamoMock.on(lib_dynamodb_1.ScanCommand).resolves({ Items: mockReadings });
            dynamoMock
                .on(lib_dynamodb_1.GetCommand, { Key: { userId: 'user-1', createdAt: 'PROFILE' } })
                .resolves({ Item: undefined });
            dynamoMock
                .on(lib_dynamodb_1.GetCommand, { Key: { userId: 'user-2', createdAt: 'PROFILE' } })
                .resolves({ Item: { userId: 'user-2', email: 'test@example.com' } });
            const response = await (0, get_all_readings_1.handler)(event);
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
            dynamoMock.on(lib_dynamodb_1.ScanCommand).resolves({ Items: mockReadings });
            dynamoMock
                .on(lib_dynamodb_1.GetCommand, { Key: { userId: 'user-1', createdAt: 'PROFILE' } })
                .resolves({ Item: { userId: 'user-1', email: 'user1@example.com' } });
            dynamoMock
                .on(lib_dynamodb_1.GetCommand, { Key: { userId: 'user-2', createdAt: 'PROFILE' } })
                .resolves({ Item: { userId: 'user-2', email: 'user2@example.com' } });
            const response = await (0, get_all_readings_1.handler)(event);
            const body = JSON.parse(response.body);
            expect(body.readings).toHaveLength(2);
            expect(body.readings[0].userEmail).toBe('user1@example.com');
            expect(body.readings[1].userEmail).toBe('user2@example.com');
        });
    });
    describe('Error handling', () => {
        it('should handle DynamoDB scan errors', async () => {
            const event = createEvent(true);
            dynamoMock.on(lib_dynamodb_1.ScanCommand).rejects(new Error('DynamoDB error'));
            const response = await (0, get_all_readings_1.handler)(event);
            expect(response.statusCode).toBe(500);
            const body = JSON.parse(response.body);
            expect(body.error).toBe('Internal server error');
        });
        it('should log errors to console', async () => {
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
            const event = createEvent(true);
            const error = new Error('Test error');
            dynamoMock.on(lib_dynamodb_1.ScanCommand).rejects(error);
            await (0, get_all_readings_1.handler)(event);
            expect(consoleErrorSpy).toHaveBeenCalledWith('Error in get-all-readings handler:', expect.stringContaining('Test error'));
            consoleErrorSpy.mockRestore();
        });
        it('should warn when user fetch fails but continue processing', async () => {
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
            const event = createEvent(true);
            const mockReadings = [{ readingId: 'reading-1', userId: 'user-1' }];
            dynamoMock.on(lib_dynamodb_1.ScanCommand).resolves({ Items: mockReadings });
            dynamoMock.on(lib_dynamodb_1.GetCommand).rejects(new Error('User not found'));
            const response = await (0, get_all_readings_1.handler)(event);
            expect(response.statusCode).toBe(200);
            expect(consoleWarnSpy).toHaveBeenCalledWith('Failed to fetch user user-1:', expect.any(Error));
            consoleWarnSpy.mockRestore();
        });
    });
    describe('Response format', () => {
        it('should include CORS headers', async () => {
            const event = createEvent(true);
            dynamoMock.on(lib_dynamodb_1.ScanCommand).resolves({ Items: [] });
            const response = await (0, get_all_readings_1.handler)(event);
            expect(response.headers).toEqual({
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            });
        });
        it('should return proper response structure', async () => {
            const event = createEvent(true);
            const mockReadings = [{ readingId: 'reading-1', userId: 'user-1' }];
            dynamoMock.on(lib_dynamodb_1.ScanCommand).resolves({
                Items: mockReadings,
                LastEvaluatedKey: { readingId: 'reading-1' },
            });
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({
                Item: { userId: 'user-1', email: 'user1@example.com' },
            });
            const response = await (0, get_all_readings_1.handler)(event);
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
            dynamoMock.on(lib_dynamodb_1.ScanCommand).callsFake((input) => {
                expect(input.FilterExpression).toContain(' AND ');
                expect(input.FilterExpression).toContain('createdAt >= :startDate');
                expect(input.FilterExpression).toContain('createdAt <= :endDate');
                expect(input.FilterExpression).toContain('#status = :status');
                expect(input.FilterExpression).toContain('#type = :type');
                return Promise.resolve({ Items: [] });
            });
            const response = await (0, get_all_readings_1.handler)(event);
            expect(response.statusCode).toBe(200);
        });
    });
    describe('Logging', () => {
        it('should log incoming event', async () => {
            const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();
            const event = createEvent(true);
            dynamoMock.on(lib_dynamodb_1.ScanCommand).resolves({ Items: [] });
            await (0, get_all_readings_1.handler)(event);
            expect(consoleInfoSpy).toHaveBeenCalledWith('Get all readings event:', expect.any(String));
            consoleInfoSpy.mockRestore();
        });
    });
    describe('Input validation guardrails', () => {
        it('should cap limit at 100', async () => {
            const event = createEvent(true, { limit: '200' });
            dynamoMock.on(lib_dynamodb_1.ScanCommand).resolves({ Items: [], Count: 0 });
            const response = await (0, get_all_readings_1.handler)(event);
            expect(response.statusCode).toBe(200);
            expect(dynamoMock.commandCalls(lib_dynamodb_1.ScanCommand)[0].args[0].input.Limit).toBe(100);
        });
        it('should default to 25 when limit is invalid', async () => {
            const event = createEvent(true, { limit: 'invalid' });
            dynamoMock.on(lib_dynamodb_1.ScanCommand).resolves({ Items: [], Count: 0 });
            const response = await (0, get_all_readings_1.handler)(event);
            expect(response.statusCode).toBe(200);
            expect(dynamoMock.commandCalls(lib_dynamodb_1.ScanCommand)[0].args[0].input.Limit).toBe(25);
        });
        it('should default to 25 when limit is negative', async () => {
            const event = createEvent(true, { limit: '-10' });
            dynamoMock.on(lib_dynamodb_1.ScanCommand).resolves({ Items: [], Count: 0 });
            const response = await (0, get_all_readings_1.handler)(event);
            expect(response.statusCode).toBe(200);
            expect(dynamoMock.commandCalls(lib_dynamodb_1.ScanCommand)[0].args[0].input.Limit).toBe(25);
        });
        it('should truncate userSearch to 100 characters', async () => {
            const longSearch = 'a'.repeat(150);
            const event = createEvent(true, { userSearch: longSearch });
            dynamoMock.on(lib_dynamodb_1.ScanCommand).resolves({ Items: [] });
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({ Item: undefined });
            const response = await (0, get_all_readings_1.handler)(event);
            // The search should be truncated to 100 chars
            // We can't directly test the truncation in the filter, but we can verify it doesn't crash
            expect(response.statusCode).toBe(200);
        });
        it('should return 400 when date range exceeds 90 days', async () => {
            const event = createEvent(true, {
                startDate: '2024-01-01',
                endDate: '2024-06-01', // More than 90 days
            });
            const response = await (0, get_all_readings_1.handler)(event);
            expect(response.statusCode).toBe(400);
            const body = JSON.parse(response.body);
            expect(body.error).toBe('Date range cannot exceed 90 days');
        });
        it('should allow date range of exactly 90 days', async () => {
            const event = createEvent(true, {
                startDate: '2024-01-01',
                endDate: '2024-03-31', // Exactly 90 days
            });
            dynamoMock.on(lib_dynamodb_1.ScanCommand).resolves({ Items: [] });
            const response = await (0, get_all_readings_1.handler)(event);
            expect(response.statusCode).toBe(200);
        });
        it('should allow date range less than 90 days', async () => {
            const event = createEvent(true, {
                startDate: '2024-01-01',
                endDate: '2024-02-01', // 31 days
            });
            dynamoMock.on(lib_dynamodb_1.ScanCommand).resolves({ Items: [] });
            const response = await (0, get_all_readings_1.handler)(event);
            expect(response.statusCode).toBe(200);
        });
        it('should not validate date range when only one date is provided', async () => {
            const event = createEvent(true, {
                startDate: '2024-01-01',
                // No endDate
            });
            dynamoMock.on(lib_dynamodb_1.ScanCommand).resolves({ Items: [] });
            const response = await (0, get_all_readings_1.handler)(event);
            expect(response.statusCode).toBe(200);
        });
    });
    describe('JWT verification edge cases', () => {
        it('should return 403 when cognito:groups claim is missing', async () => {
            const event = {
                ...createEvent(false),
                requestContext: {
                    authorizer: {
                        claims: {
                            sub: 'user-123',
                            email: 'test@example.com',
                            // No cognito:groups claim
                        },
                    },
                },
            };
            const response = await (0, get_all_readings_1.handler)(event);
            expect(response.statusCode).toBe(403);
            const body = JSON.parse(response.body);
            expect(body.error).toBe('Access denied. Admin privileges required.');
        });
        it('should return 403 when cognito:groups exists but does not contain admin', async () => {
            const event = {
                ...createEvent(false),
                requestContext: {
                    authorizer: {
                        claims: {
                            sub: 'user-123',
                            email: 'test@example.com',
                            'cognito:groups': 'user,developer',
                        },
                    },
                },
            };
            const response = await (0, get_all_readings_1.handler)(event);
            expect(response.statusCode).toBe(403);
            const body = JSON.parse(response.body);
            expect(body.error).toBe('Access denied. Admin privileges required.');
        });
        it('should handle cognito:groups as an array without admin', async () => {
            const event = {
                ...createEvent(false),
                requestContext: {
                    authorizer: {
                        claims: {
                            sub: 'user-123',
                            email: 'test@example.com',
                            'cognito:groups': ['user', 'developer'],
                        },
                    },
                },
            };
            const response = await (0, get_all_readings_1.handler)(event);
            expect(response.statusCode).toBe(403);
            const body = JSON.parse(response.body);
            expect(body.error).toBe('Access denied. Admin privileges required.');
        });
        it('should return 403 when authorizer claims are completely missing', async () => {
            const event = {
                ...createEvent(false),
                requestContext: {
                    authorizer: undefined,
                },
            };
            const response = await (0, get_all_readings_1.handler)(event);
            expect(response.statusCode).toBe(403);
            const body = JSON.parse(response.body);
            expect(body.error).toBe('Access denied. Admin privileges required.');
        });
        it('should return 403 when requestContext is missing', async () => {
            const event = {
                ...createEvent(false),
                requestContext: undefined,
            };
            const response = await (0, get_all_readings_1.handler)(event);
            expect(response.statusCode).toBe(403);
            const body = JSON.parse(response.body);
            expect(body.error).toBe('Access denied. Admin privileges required.');
        });
        it('should accept admin group in comma-separated string format', async () => {
            const event = {
                ...createEvent(false),
                requestContext: {
                    authorizer: {
                        claims: {
                            sub: 'user-123',
                            email: 'admin@example.com',
                            'cognito:groups': 'user,admin,developer',
                        },
                    },
                },
            };
            dynamoMock.on(lib_dynamodb_1.ScanCommand).resolves({ Items: [] });
            const response = await (0, get_all_readings_1.handler)(event);
            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.body);
            expect(body.readings).toEqual([]);
        });
        it('should accept admin group in array format', async () => {
            const event = {
                ...createEvent(false),
                requestContext: {
                    authorizer: {
                        claims: {
                            sub: 'user-123',
                            email: 'admin@example.com',
                            'cognito:groups': ['user', 'admin', 'developer'],
                        },
                    },
                },
            };
            dynamoMock.on(lib_dynamodb_1.ScanCommand).resolves({ Items: [] });
            const response = await (0, get_all_readings_1.handler)(event);
            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.body);
            expect(body.readings).toEqual([]);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2V0LWFsbC1yZWFkaW5ncy50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZ2V0LWFsbC1yZWFkaW5ncy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsMEVBQThEO0FBRTlELHdEQUF3RjtBQUN4Riw2REFBaUQ7QUFFakQsMkJBQTJCO0FBQzNCLE1BQU0sVUFBVSxHQUFHLElBQUEsZ0NBQVUsRUFBQyxxQ0FBc0IsQ0FBQyxDQUFDO0FBRXRELFFBQVEsQ0FBQyx5QkFBeUIsRUFBRSxHQUFHLEVBQUU7SUFDdkMsVUFBVSxDQUFDLEdBQUcsRUFBRTtRQUNkLFVBQVUsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNuQixPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFtQixHQUFHLHFCQUFxQixDQUFDO1FBQ3hELE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZSxHQUFHLGlCQUFpQixDQUFDO0lBQ2xELENBQUMsQ0FBQyxDQUFDO0lBRUgsTUFBTSxXQUFXLEdBQUcsQ0FDbEIsT0FBZ0IsRUFDaEIsV0FBb0MsRUFDTCxFQUFFLENBQUMsQ0FBQztRQUNuQyxxQkFBcUIsRUFBRSxXQUFXLElBQUksSUFBSTtRQUMxQyxjQUFjLEVBQUU7WUFDZCxVQUFVLEVBQUU7Z0JBQ1YsTUFBTSxFQUFFO29CQUNOLGdCQUFnQixFQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRTtpQkFDM0M7YUFDRjtTQUNtRDtLQUN2RCxDQUFDLENBQUM7SUFFSCxRQUFRLENBQUMsZUFBZSxFQUFFLEdBQUcsRUFBRTtRQUM3QixFQUFFLENBQUMsMENBQTBDLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDeEQsTUFBTSxLQUFLLEdBQUcsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2pDLE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBQSwwQkFBTyxFQUFDLEtBQXdDLENBQUMsQ0FBQztZQUV6RSxNQUFNLENBQUMsUUFBUSxD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Q0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDdEMsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDdkMsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDcEMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztBQUNMLENBQUMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgaGFuZGxlciB9IGZyb20gJy4uLy4uL2xhbWJkYS9hZG1pbi9nZXQtYWxsLXJlYWRpbmdzJztcbmltcG9ydCB7IEFQSUdhdGV3YXlQcm94eUV2ZW50IH0gZnJvbSAnYXdzLWxhbWJkYSc7XG5pbXBvcnQgeyBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LCBTY2FuQ29tbWFuZCwgR2V0Q29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYic7XG5pbXBvcnQgeyBtb2NrQ2xpZW50IH0gZnJvbSAnYXdzLXNkay1jbGllbnQtbW9jayc7XG5cbi8vIE1vY2sgdGhlIER5bmFtb0RCIGNsaWVudFxuY29uc3QgZHluYW1vTW9jayA9IG1vY2tDbGllbnQoRHluYW1vREJEb2N1bWVudENsaWVudCk7XG5cbmRlc2NyaWJlKCdnZXQtYWxsLXJlYWRpbmdzIExhbWJkYScsICgpID0+IHtcbiAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgZHluYW1vTW9jay5yZXNldCgpO1xuICAgIHByb2Nlc3MuZW52LlJFQURJTkdTX1RBQkxFX05BTUUgPSAndGVzdC1yZWFkaW5ncy10YWJsZSc7XG4gICAgcHJvY2Vzcy5lbnYuVVNFUl9UQUJMRV9OQU1FID0gJ3Rlc3QtdXNlci10YWJsZSc7XG4gIH0pO1xuXG4gIGNvbnN0IGNyZWF0ZUV2ZW50ID0gKFxuICAgIGlzQWRtaW46IGJvb2xlYW4sXG4gICAgcXVlcnlQYXJhbXM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+LFxuICApOiBQYXJ0aWFsPEFQSUdhdGV3YXlQcm94eUV2ZW50PiA9PiAoe1xuICAgIHF1ZXJ5U3RyaW5nUGFyYW1ldGVyczogcXVlcnlQYXJhbXMgfHwgbnVsbCxcbiAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICBjbGFpbXM6IHtcbiAgICAgICAgICAnY29nbml0bzpncm91cHMnOiBpc0FkbWluID8gWydhZG1pbiddIDogW10sXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0gYXMgdW5rbm93biBhcyBBUElHYXRld2F5UHJveHlFdmVudFsncmVxdWVzdENvbnRleHQnXSxcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0F1dGhvcml6YXRpb24nLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gNDAzIHdoZW4gdXNlciBpcyBub3QgYWRtaW4nLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KGZhbHNlKTtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyB1bmtub3duIGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoNDAzKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmUoJ0FjY2VzcyBkZW5pZWQuIEFkbWluIHByaXZpbGVnZXMgcmVxdWlyZWQuJyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGFsbG93IGFjY2VzcyB3aGVuIHVzZXIgaXMgYWRtaW4nLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUpO1xuXG4gICAgICBkeW5hbW9Nb2NrLm9uKFNjYW5Db21tYW5kKS5yZXNvbHZlcyh7IEl0ZW1zOiBbXSB9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIHVua25vd24gYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgYWRtaW4gZ3JvdXAgYXMgY29tbWEtc2VwYXJhdGVkIHN0cmluZycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50OiBQYXJ0aWFsPEFQSUdhdGV3YXlQcm94eUV2ZW50PiA9IHtcbiAgICAgICAgcmVxdWVzdENvbnRleHQ6IHtcbiAgICAgICAgICBhdXRob3JpemVyOiB7XG4gICAgICAgICAgICBjbGFpbXM6IHtcbiAgICAgICAgICAgICAgJ2NvZ25pdG86Z3JvdXBzJzogJ3VzZXIsYWRtaW4scHJlbWl1bScsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0gYXMgdW5rbm93biBhcyBBUElHYXRld2F5UHJveHlFdmVudFsncmVxdWVzdENvbnRleHQnXSxcbiAgICAgIH07XG5cbiAgICAgIGR5bmFtb01vY2sub24oU2NhbkNvbW1hbmQpLnJlc29sdmVzKHsgSXRlbXM6IFtdIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgdW5rbm93biBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHJlamVjdCB3aGVuIGFkbWluIGlzIG5vdCBpbiBjb21tYS1zZXBhcmF0ZWQgc3RyaW5nJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQ6IFBhcnRpYWw8QVBJR2F0ZXdheVByb3h5RXZlbnQ+ID0ge1xuICAgICAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgICAgIGF1dGhvcml6ZXI6IHtcbiAgICAgICAgICAgIGNsYWltczoge1xuICAgICAgICAgICAgICAnY29nbml0bzpncm91cHMnOiAndXNlcixwcmVtaXVtJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSBhcyB1bmtub3duIGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50WydyZXF1ZXN0Q29udGV4dCddLFxuICAgICAgfTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIHVua25vd24gYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSg0MDMpO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnRmV0Y2hpbmcgcmVhZGluZ3MnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBmZXRjaCBhbGwgcmVhZGluZ3Mgd2l0aG91dCBmaWx0ZXJzJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlKTtcblxuICAgICAgY29uc3QgbW9ja1JlYWRpbmdzID0gW1xuICAgICAgICB7XG4gICAgICAgICAgcmVhZGluZ0lkOiAncmVhZGluZy0xJyxcbiAgICAgICAgICB1c2VySWQ6ICd1c2VyLTEnLFxuICAgICAgICAgIHR5cGU6ICdTb3VsIEJsdWVwcmludCcsXG4gICAgICAgICAgc3RhdHVzOiAnUmVhZHknLFxuICAgICAgICAgIGNyZWF0ZWRBdDogJzIwMjQtMDEtMDFUMDA6MDA6MDBaJyxcbiAgICAgICAgICB1cGRhdGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAxOjAwWicsXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICByZWFkaW5nSWQ6ICdyZWFkaW5nLTInLFxuICAgICAgICAgIHVzZXJJZDogJ3VzZXItMicsXG4gICAgICAgICAgdHlwZTogJ05hdGFsIENoYXJ0JyxcbiAgICAgICAgICBzdGF0dXM6ICdQcm9jZXNzaW5nJyxcbiAgICAgICAgICBjcmVhdGVkQXQ6ICcyMDI0LTAxLTAyVDAwOjAwOjAwWicsXG4gICAgICAgICAgdXBkYXRlZEF0OiAnMjAyNC0wMS0wMlQwMDowMDowMFonLFxuICAgICAgICB9LFxuICAgICAgXTtcblxuICAgICAgY29uc3QgbW9ja1VzZXJzID0gW1xuICAgICAgICB7IHVzZXJJZDogJ3VzZXItMScsIGVtYWlsOiAndXNlcjFAZXhhbXBsZS5jb20nIH0sXG4gICAgICAgIHsgdXNlcklkOiAndXNlci0yJywgZW1haWw6ICd1c2VyMkBleGFtcGxlLmNvbScgfSxcbiAgICAgIF07XG5cbiAgICAgIGR5bmFtb01vY2sub24oU2NhbkNvbW1hbmQpLnJlc29sdmVzKHsgSXRlbXM6IG1vY2tSZWFkaW5ncyB9KTtcbiAgICAgIGR5bmFtb01vY2tcbiAgICAgICAgLm9uKEdldENvbW1hbmQsIHsgS2V5OiB7IHVzZXJJZDogJ3VzZXItMScsIGNyZWF0ZWRBdDogJ1BST0ZJTEUnIH0gfSlcbiAgICAgICAgLnJlc29sdmVzKHsgSXRlbTogbW9ja1VzZXJzWzBdIH0pO1xuICAgICAgZHluYW1vTW9ja1xuICAgICAgICAub24oR2V0Q29tbWFuZCwgeyBLZXk6IHsgdXNlcklkOiAndXNlci0yJywgY3JlYXRlZEF0OiAnUFJPRklMRScgfSB9KVxuICAgICAgICAucmVzb2x2ZXMoeyBJdGVtOiBtb2NrVXNlcnNbMV0gfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyB1bmtub3duIGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkucmVhZGluZ3MpLnRvSGF2ZUxlbmd0aCgyKTtcbiAgICAgIGV4cGVjdChib2R5LnJlYWRpbmdzWzBdLnVzZXJFbWFpbCkudG9CZSgndXNlcjFAZXhhbXBsZS5jb20nKTtcbiAgICAgIGV4cGVjdChib2R5LnJlYWRpbmdzWzFdLnVzZXJFbWFpbCkudG9CZSgndXNlcjJAZXhhbXBsZS5jb20nKTtcbiAgICAgIGV4cGVjdChib2R5LmNvdW50KS50b0JlKDIpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBhcHBseSBkYXRlIHJhbmdlIGZpbHRlcnMnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUsIHtcbiAgICAgICAgc3RhcnREYXRlOiAnMjAyNC0wMS0wMScsXG4gICAgICAgIGVuZERhdGU6ICcyMDI0LTAxLTMxJyxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgZHluYW1vTW9jay5vbihTY2FuQ29tbWFuZCkuY2FsbHNGYWtlKChpbnB1dDogYW55KSA9PiB7XG4gICAgICAgIGV4cGVjdChpbnB1dC5GaWx0ZXJFeHByZXNzaW9uKS50b0NvbnRhaW4oJ2NyZWF0ZWRBdCA+PSA6c3RhcnREYXRlJyk7XG4gICAgICAgIGV4cGVjdChpbnB1dC5GaWx0ZXJFeHByZXNzaW9uKS50b0NvbnRhaW4oJ2NyZWF0ZWRBdCA8PSA6ZW5kRGF0ZScpO1xuICAgICAgICBleHBlY3QoaW5wdXQuRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlc1snOnN0YXJ0RGF0ZSddKS50b0JlKCcyMDI0LTAxLTAxJyk7XG4gICAgICAgIGV4cGVjdChpbnB1dC5FeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzWyc6ZW5kRGF0ZSddKS50b0JlKCcyMDI0LTAxLTMxVDIzOjU5OjU5Ljk5OVonKTtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7IEl0ZW1zOiBbXSB9KTtcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgdW5rbm93biBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBhcHBseSBzdGF0dXMgZmlsdGVyJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlLCB7IHN0YXR1czogJ1JlYWR5JyB9KTtcblxuICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgIGR5bmFtb01vY2sub24oU2NhbkNvbW1hbmQpLmNhbGxzRmFrZSgoaW5wdXQ6IGFueSkgPT4ge1xuICAgICAgICBleHBlY3QoaW5wdXQuRmlsdGVyRXhwcmVzc2lvbikudG9Db250YWluKCcjc3RhdHVzID0gOnN0YXR1cycpO1xuICAgICAgICBleHBlY3QoaW5wdXQuRXhwcmVzc2lvbkF0dHJpYnV0ZU5hbWVzWycjc3RhdHVzJ10pLnRvQmUoJ3N0YXR1cycpO1xuICAgICAgICBleHBlY3QoaW5wdXQuRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlc1snOnN0YXR1cyddKS50b0JlKCdSZWFkeScpO1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHsgSXRlbXM6IFtdIH0pO1xuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyB1bmtub3duIGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGFwcGx5IHR5cGUgZmlsdGVyJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlLCB7IHR5cGU6ICdTb3VsIEJsdWVwcmludCcgfSk7XG5cbiAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICBkeW5hbW9Nb2NrLm9uKFNjYW5Db21tYW5kKS5jYWxsc0Zha2UoKGlucHV0OiBhbnkpID0+IHtcbiAgICAgICAgZXhwZWN0KGlucHV0LkZpbHRlckV4cHJlc3Npb24pLnRvQ29udGFpbignI3R5cGUgPSA6dHlwZScpO1xuICAgICAgICBleHBlY3QoaW5wdXQuRXhwcmVzc2lvbkF0dHJpYnV0ZU5hbWVzWycjdHlwZSddKS50b0JlKCd0eXBlJyk7XG4gICAgICAgIGV4cGVjdChpbnB1dC5FeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzWyc6dHlwZSddKS50b0JlKCdTb3VsIEJsdWVwcmludCcpO1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHsgSXRlbXM6IFtdIH0pO1xuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyB1bmtub3duIGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBwYWdpbmF0aW9uIHdpdGggbGltaXQgYW5kIGxhc3RFdmFsdWF0ZWRLZXknLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBsYXN0S2V5ID0geyByZWFkaW5nSWQ6ICdyZWFkaW5nLTI1JywgdXNlcklkOiAndXNlci0yNScgfTtcbiAgICAgIGNvbnN0IGVuY29kZWRLZXkgPSBCdWZmZXIuZnJvbShKU09OLnN0cmluZ2lmeShsYXN0S2V5KSkudG9TdHJpbmcoJ2Jhc2U2NCcpO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUsIHtcbiAgICAgICAgbGltaXQ6ICc1MCcsXG4gICAgICAgIGxhc3RFdmFsdWF0ZWRLZXk6IGVuY29kZWRLZXksXG4gICAgICB9KTtcblxuICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgIGR5bmFtb01vY2sub24oU2NhbkNvbW1hbmQpLmNhbGxzRmFrZSgoaW5wdXQ6IGFueSkgPT4ge1xuICAgICAgICBleHBlY3QoaW5wdXQuTGltaXQpLnRvQmUoNTApO1xuICAgICAgICBleHBlY3QoaW5wdXQuRXhjbHVzaXZlU3RhcnRLZXkpLnRvRXF1YWwobGFzdEtleSk7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoeyBJdGVtczogW10sIExhc3RFdmFsdWF0ZWRLZXk6IHsgcmVhZGluZ0lkOiAncmVhZGluZy03NScgfSB9KTtcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgdW5rbm93biBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuXG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5Lmxhc3RFdmFsdWF0ZWRLZXkpLnRvQmVEZWZpbmVkKCk7XG4gICAgICBjb25zdCBkZWNvZGVkS2V5ID0gSlNPTi5wYXJzZShCdWZmZXIuZnJvbShib2R5Lmxhc3RFdmFsdWF0ZWRLZXksICdiYXNlNjQnKS50b1N0cmluZygpKTtcbiAgICAgIGV4cGVjdChkZWNvZGVkS2V5KS50b0VxdWFsKHsgcmVhZGluZ0lkOiAncmVhZGluZy03NScgfSk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHVzZSBkZWZhdWx0IGxpbWl0IG9mIDI1IHdoZW4gbm90IHNwZWNpZmllZCcsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSk7XG5cbiAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICBkeW5hbW9Nb2NrLm9uKFNjYW5Db21tYW5kKS5jYWxsc0Zha2UoKGlucHV0OiBhbnkpID0+IHtcbiAgICAgICAgZXhwZWN0KGlucHV0LkxpbWl0KS50b0JlKDI1KTtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7IEl0ZW1zOiBbXSB9KTtcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgdW5rbm93biBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnVXNlciBzZWFyY2gnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBmaWx0ZXIgcmVhZGluZ3MgYnkgdXNlciBlbWFpbCBzZWFyY2gnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUsIHsgdXNlclNlYXJjaDogJ3VzZXIxJyB9KTtcblxuICAgICAgY29uc3QgbW9ja1JlYWRpbmdzID0gW1xuICAgICAgICB7IHJlYWRpbmdJZDogJ3JlYWRpbmctMScsIHVzZXJJZDogJ3VzZXItMScgfSxcbiAgICAgICAgeyByZWFkaW5nSWQ6ICdyZWFkaW5nLTInLCB1c2VySWQ6ICd1c2VyLTInIH0sXG4gICAgICAgIHsgcmVhZGluZ0lkOiAncmVhZGluZy0zJywgdXNlcklkOiAndXNlci0zJyB9LFxuICAgICAgXTtcblxuICAgICAgZHluYW1vTW9jay5vbihTY2FuQ29tbWFuZCkucmVzb2x2ZXMoeyBJdGVtczogbW9ja1JlYWRpbmdzIH0pO1xuICAgICAgZHluYW1vTW9ja1xuICAgICAgICAub24oR2V0Q29tbWFuZCwgeyBLZXk6IHsgdXNlcklkOiAndXNlci0xJywgY3JlYXRlZEF0OiAnUFJPRklMRScgfSB9KVxuICAgICAgICAucmVzb2x2ZXMoeyBJdGVtOiB7IHVzZXJJZDogJ3VzZXItMScsIGVtYWlsOiAndXNlcjFAZXhhbXBsZS5jb20nIH0gfSk7XG4gICAgICBkeW5hbW9Nb2NrXG4gICAgICAgIC5vbihHZXRDb21tYW5kLCB7IEtleTogeyB1c2VySWQ6ICd1c2VyLTInLCBjcmVhdGVkQXQ6ICdQUk9GSUxFJyB9IH0pXG4gICAgICAgIC5yZXNvbHZlcyh7IEl0ZW06IHsgdXNlcklkOiAndXNlci0yJywgZW1haWw6ICd0ZXN0QGV4YW1wbGUuY29tJyB9IH0pO1xuICAgICAgZHluYW1vTW9ja1xuICAgICAgICAub24oR2V0Q29tbWFuZCwgeyBLZXk6IHsgdXNlcklkOiAndXNlci0zJywgY3JlYXRlZEF0OiAnUFJPRklMRScgfSB9KVxuICAgICAgICAucmVzb2x2ZXMoeyBJdGVtOiB7IHVzZXJJZDogJ3VzZXItMycsIGVtYWlsOiAnYW5vdGhlckBleGFtcGxlLmNvbScgfSB9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIHVua25vd24gYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5yZWFkaW5ncykudG9IYXZlTGVuZ3RoKDEpO1xuICAgICAgZXhwZWN0KGJvZHkucmVhZGluZ3NbMF0ucmVhZGluZ0lkKS50b0JlKCdyZWFkaW5nLTEnKTtcbiAgICAgIGV4cGVjdChib2R5LnJlYWRpbmdzWzBdLnVzZXJFbWFpbCkudG9CZSgndXNlcjFAZXhhbXBsZS5jb20nKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIGNhc2UtaW5zZW5zaXRpdmUgdXNlciBzZWFyY2gnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUsIHsgdXNlclNlYXJjaDogJ1VTRVIxJyB9KTtcblxuICAgICAgY29uc3QgbW9ja1JlYWRpbmdzID0gW3sgcmVhZGluZ0lkOiAncmVhZGluZy0xJywgdXNlcklkOiAndXNlci0xJyB9XTtcblxuICAgICAgZHluYW1vTW9jay5vbihTY2FuQ29tbWFuZCkucmVzb2x2ZXMoeyBJdGVtczogbW9ja1JlYWRpbmdzIH0pO1xuICAgICAgZHluYW1vTW9ja1xuICAgICAgICAub24oR2V0Q29tbWFuZClcbiAgICAgICAgLnJlc29sdmVzKHsgSXRlbTogeyB1c2VySWQ6ICd1c2VyLTEnLCBlbWFpbDogJ3VzZXIxQGV4YW1wbGUuY29tJyB9IH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgdW5rbm93biBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkucmVhZGluZ3MpLnRvSGF2ZUxlbmd0aCgxKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIHVzZXJzIG5vdCBmb3VuZCBpbiB1c2VyIHRhYmxlJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlLCB7IHVzZXJTZWFyY2g6ICd0ZXN0JyB9KTtcblxuICAgICAgY29uc3QgbW9ja1JlYWRpbmdzID0gW1xuICAgICAgICB7IHJlYWRpbmdJZDogJ3JlYWRpbmctMScsIHVzZXJJZDogJ3VzZXItMScgfSxcbiAgICAgICAgeyByZWFkaW5nSWQ6ICdyZWFkaW5nLTInLCB1c2VySWQ6ICd1c2VyLTInIH0sXG4gICAgICBdO1xuXG4gICAgICBkeW5hbW9Nb2NrLm9uKFNjYW5Db21tYW5kKS5yZXNvbHZlcyh7IEl0ZW1zOiBtb2NrUmVhZGluZ3MgfSk7XG4gICAgICBkeW5hbW9Nb2NrXG4gICAgICAgIC5vbihHZXRDb21tYW5kLCB7IEtleTogeyB1c2VySWQ6ICd1c2VyLTEnLCBjcmVhdGVkQXQ6ICdQUk9GSUxFJyB9IH0pXG4gICAgICAgIC5yZXNvbHZlcyh7IEl0ZW06IHVuZGVmaW5lZCB9KTtcbiAgICAgIGR5bmFtb01vY2tcbiAgICAgICAgLm9uKEdldENvbW1hbmQsIHsgS2V5OiB7IHVzZXJJZDogJ3VzZXItMicsIGNyZWF0ZWRBdDogJ1BST0ZJTEUnIH0gfSlcbiAgICAgICAgLnJlc29sdmVzKHsgSXRlbTogeyB1c2VySWQ6ICd1c2VyLTInLCBlbWFpbDogJ3Rlc3RAZXhhbXBsZS5jb20nIH0gfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyB1bmtub3duIGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5yZWFkaW5ncykudG9IYXZlTGVuZ3RoKDEpO1xuICAgICAgZXhwZWN0KGJvZHkucmVhZGluZ3NbMF0ucmVhZGluZ0lkKS50b0JlKCdyZWFkaW5nLTInKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgc3RpbGwgYWRkIGVtYWlscyB3aGVuIG5vIHVzZXIgc2VhcmNoIGlzIHByb3ZpZGVkJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlKTtcblxuICAgICAgY29uc3QgbW9ja1JlYWRpbmdzID0gW1xuICAgICAgICB7IHJlYWRpbmdJZDogJ3JlYWRpbmctMScsIHVzZXJJZDogJ3VzZXItMScgfSxcbiAgICAgICAgeyByZWFkaW5nSWQ6ICdyZWFkaW5nLTInLCB1c2VySWQ6ICd1c2VyLTInIH0sXG4gICAgICBdO1xuXG4gICAgICBkeW5hbW9Nb2NrLm9uKFNjYW5Db21tYW5kKS5yZXNvbHZlcyh7IEl0ZW1zOiBtb2NrUmVhZGluZ3MgfSk7XG4gICAgICBkeW5hbW9Nb2NrXG4gICAgICAgIC5vbihHZXRDb21tYW5kLCB7IEtleTogeyB1c2VySWQ6ICd1c2VyLTEnLCBjcmVhdGVkQXQ6ICdQUk9GSUxFJyB9IH0pXG4gICAgICAgIC5yZXNvbHZlcyh7IEl0ZW06IHsgdXNlcklkOiAndXNlci0xJywgZW1haWw6ICd1c2VyMUBleGFtcGxlLmNvbScgfSB9KTtcbiAgICAgIGR5bmFtb01vY2tcbiAgICAgICAgLm9uKEdldENvbW1hbmQsIHsgS2V5OiB7IHVzZXJJZDogJ3VzZXItMicsIGNyZWF0ZWRBdDogJ1BST0ZJTEUnIH0gfSlcbiAgICAgICAgLnJlc29sdmVzKHsgSXRlbTogeyB1c2VySWQ6ICd1c2VyLTInLCBlbWFpbDogJ3VzZXIyQGV4YW1wbGUuY29tJyB9IH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgdW5rbm93biBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkucmVhZGluZ3MpLnRvSGF2ZUxlbmd0aCgyKTtcbiAgICAgIGV4cGVjdChib2R5LnJlYWRpbmdzWzBdLnVzZXJFbWFpbCkudG9CZSgndXNlcjFAZXhhbXBsZS5jb20nKTtcbiAgICAgIGV4cGVjdChib2R5LnJlYWRpbmdzWzFdLnVzZXJFbWFpbCkudG9CZSgndXNlcjJAZXhhbXBsZS5jb20nKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0Vycm9yIGhhbmRsaW5nJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgaGFuZGxlIER5bmFtb0RCIHNjYW4gZXJyb3JzJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlKTtcblxuICAgICAgZHluYW1vTW9jay5vbihTY2FuQ29tbWFuZCkucmVqZWN0cyhuZXcgRXJyb3IoJ0R5bmFtb0RCIGVycm9yJykpO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgdW5rbm93biBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDUwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LmVycm9yKS50b0JlKCdJbnRlcm5hbCBzZXJ2ZXIgZXJyb3InKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgbG9nIGVycm9ycyB0byBjb25zb2xlJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgY29uc29sZUVycm9yU3B5ID0gamVzdC5zcHlPbihjb25zb2xlLCAnZXJyb3InKS5tb2NrSW1wbGVtZW50YXRpb24oKTtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSk7XG5cbiAgICAgIGNvbnN0IGVycm9yID0gbmV3IEVycm9yKCdUZXN0IGVycm9yJyk7XG4gICAgICBkeW5hbW9Nb2NrLm9uKFNjYW5Db21tYW5kKS5yZWplY3RzKGVycm9yKTtcblxuICAgICAgYXdhaXQgaGFuZGxlcihldmVudCBhcyB1bmtub3duIGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KGNvbnNvbGVFcnJvclNweSkudG9IYXZlQmVlbkNhbGxlZFdpdGgoXG4gICAgICAgICdFcnJvciBpbiBnZXQtYWxsLXJlYWRpbmdzIGhhbmRsZXI6JyxcbiAgICAgICAgZXhwZWN0LnN0cmluZ0NvbnRhaW5pbmcoJ1Rlc3QgZXJyb3InKSxcbiAgICAgICk7XG4gICAgICBjb25zb2xlRXJyb3JTcHkubW9ja1Jlc3RvcmUoKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgd2FybiB3aGVuIHVzZXIgZmV0Y2ggZmFpbHMgYnV0IGNvbnRpbnVlIHByb2Nlc3NpbmcnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBjb25zb2xlV2FyblNweSA9IGplc3Quc3B5T24oY29uc29sZSwgJ3dhcm4nKS5tb2NrSW1wbGVtZW50YXRpb24oKTtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSk7XG5cbiAgICAgIGNvbnN0IG1vY2tSZWFkaW5ncyA9IFt7IHJlYWRpbmdJZDogJ3JlYWRpbmctMScsIHVzZXJJZDogJ3VzZXItMScgfV07XG5cbiAgICAgIGR5bmFtb01vY2sub24oU2NhbkNvbW1hbmQpLnJlc29sdmVzKHsgSXRlbXM6IG1vY2tSZWFkaW5ncyB9KTtcbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVqZWN0cyhuZXcgRXJyb3IoJ1VzZXIgbm90IGZvdW5kJykpO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgdW5rbm93biBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBleHBlY3QoY29uc29sZVdhcm5TcHkpLnRvSGF2ZUJlZW5DYWxsZWRXaXRoKFxuICAgICAgICAnRmFpbGVkIHRvIGZldGNoIHVzZXIgdXNlci0xOicsXG4gICAgICAgIGV4cGVjdC5hbnkoRXJyb3IpLFxuICAgICAgKTtcblxuICAgICAgY29uc29sZVdhcm5TcHkubW9ja1Jlc3RvcmUoKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ1Jlc3BvbnNlIGZvcm1hdCcsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGluY2x1ZGUgQ09SUyBoZWFkZXJzJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlKTtcblxuICAgICAgZHluYW1vTW9jay5vbihTY2FuQ29tbWFuZCkucmVzb2x2ZXMoeyBJdGVtczogW10gfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyB1bmtub3duIGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLmhlYWRlcnMpLnRvRXF1YWwoe1xuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHJldHVybiBwcm9wZXIgcmVzcG9uc2Ugc3RydWN0dXJlJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlKTtcblxuICAgICAgY29uc3QgbW9ja1JlYWRpbmdzID0gW3sgcmVhZGluZ0lkOiAncmVhZGluZy0xJywgdXNlcklkOiAndXNlci0xJyB9XTtcblxuICAgICAgZHluYW1vTW9jay5vbihTY2FuQ29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBJdGVtczogbW9ja1JlYWRpbmdzLFxuICAgICAgICBMYXN0RXZhbHVhdGVkS2V5OiB7IHJlYWRpbmdJZDogJ3JlYWRpbmctMScgfSxcbiAgICAgIH0pO1xuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIEl0ZW06IHsgdXNlcklkOiAndXNlci0xJywgZW1haWw6ICd1c2VyMUBleGFtcGxlLmNvbScgfSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgdW5rbm93biBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5KS50b0hhdmVQcm9wZXJ0eSgncmVhZGluZ3MnKTtcbiAgICAgIGV4cGVjdChib2R5KS50b0hhdmVQcm9wZXJ0eSgnY291bnQnKTtcbiAgICAgIGV4cGVjdChib2R5KS50b0hhdmVQcm9wZXJ0eSgnbGFzdEV2YWx1YXRlZEtleScpO1xuICAgICAgZXhwZWN0KEFycmF5LmlzQXJyYXkoYm9keS5yZWFkaW5ncykpLnRvQmUodHJ1ZSk7XG4gICAgICBleHBlY3QodHlwZW9mIGJvZHkuY291bnQpLnRvQmUoJ251bWJlcicpO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnTXVsdGlwbGUgZmlsdGVycycsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGNvbWJpbmUgbXVsdGlwbGUgZmlsdGVycyB3aXRoIEFORCcsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSwge1xuICAgICAgICBzdGFydERhdGU6ICcyMDI0LTAxLTAxJyxcbiAgICAgICAgZW5kRGF0ZTogJzIwMjQtMDEtMzEnLFxuICAgICAgICBzdGF0dXM6ICdSZWFkeScsXG4gICAgICAgIHR5cGU6ICdTb3VsIEJsdWVwcmludCcsXG4gICAgICB9KTtcblxuICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgIGR5bmFtb01vY2sub24oU2NhbkNvbW1hbmQpLmNhbGxzRmFrZSgoaW5wdXQ6IGFueSkgPT4ge1xuICAgICAgICBleHBlY3QoaW5wdXQuRmlsdGVyRXhwcmVzc2lvbikudG9Db250YWluKCcgQU5EICcpO1xuICAgICAgICBleHBlY3QoaW5wdXQuRmlsdGVyRXhwcmVzc2lvbikudG9Db250YWluKCdjcmVhdGVkQXQgPj0gOnN0YXJ0RGF0ZScpO1xuICAgICAgICBleHBlY3QoaW5wdXQuRmlsdGVyRXhwcmVzc2lvbikudG9Db250YWluKCdjcmVhdGVkQXQgPD0gOmVuZERhdGUnKTtcbiAgICAgICAgZXhwZWN0KGlucHV0LkZpbHRlckV4cHJlc3Npb24pLnRvQ29udGFpbignI3N0YXR1cyA9IDpzdGF0dXMnKTtcbiAgICAgICAgZXhwZWN0KGlucHV0LkZpbHRlckV4cHJlc3Npb24pLnRvQ29udGFpbignI3R5cGUgPSA6dHlwZScpO1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHsgSXRlbXM6IFtdIH0pO1xuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyB1bmtub3duIGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdMb2dnaW5nJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgbG9nIGluY29taW5nIGV2ZW50JywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgY29uc29sZUluZm9TcHkgPSBqZXN0LnNweU9uKGNvbnNvbGUsICdpbmZvJykubW9ja0ltcGxlbWVudGF0aW9uKCk7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUpO1xuXG4gICAgICBkeW5hbW9Nb2NrLm9uKFNjYW5Db21tYW5kKS5yZXNvbHZlcyh7IEl0ZW1zOiBbXSB9KTtcblxuICAgICAgYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChjb25zb2xlSW5mb1NweSkudG9IYXZlQmVlbkNhbGxlZFdpdGgoJ0dldCBhbGwgcmVhZGluZ3MgZXZlbnQ6JywgZXhwZWN0LmFueShTdHJpbmcpKTtcblxuICAgICAgY29uc29sZUluZm9TcHkubW9ja1Jlc3RvcmUoKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0lucHV0IHZhbGlkYXRpb24gZ3VhcmRyYWlscycsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGNhcCBsaW1pdCBhdCAxMDAnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUsIHsgbGltaXQ6ICcyMDAnIH0pO1xuXG4gICAgICBkeW5hbW9Nb2NrLm9uKFNjYW5Db21tYW5kKS5yZXNvbHZlcyh7IEl0ZW1zOiBbXSwgQ291bnQ6IDAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyB1bmtub3duIGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIGV4cGVjdChkeW5hbW9Nb2NrLmNvbW1hbmRDYWxscyhTY2FuQ29tbWFuZClbMF0uYXJnc1swXS5pbnB1dC5MaW1pdCkudG9CZSgxMDApO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBkZWZhdWx0IHRvIDI1IHdoZW4gbGltaXQgaXMgaW52YWxpZCcsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSwgeyBsaW1pdDogJ2ludmFsaWQnIH0pO1xuXG4gICAgICBkeW5hbW9Nb2NrLm9uKFNjYW5Db21tYW5kKS5yZXNvbHZlcyh7IEl0ZW1zOiBbXSwgQ291bnQ6IDAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyB1bmtub3duIGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIGV4cGVjdChkeW5hbW9Nb2NrLmNvbW1hbmRDYWxscyhTY2FuQ29tbWFuZClbMF0uYXJnc1swXS5pbnB1dC5MaW1pdCkudG9CZSgyNSk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGRlZmF1bHQgdG8gMjUgd2hlbiBsaW1pdCBpcyBuZWdhdGl2ZScsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSwgeyBsaW1pdDogJy0xMCcgfSk7XG5cbiAgICAgIGR5bmFtb01vY2sub24oU2NhbkNvbW1hbmQpLnJlc29sdmVzKHsgSXRlbXM6IFtdLCBDb3VudDogMCB9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIHVua25vd24gYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgZXhwZWN0KGR5bmFtb01vY2suY29tbWFuZENhbGxzKFNjYW5Db21tYW5kKVswXS5hcmdzWzBdLmlucHV0LkxpbWl0KS50b0JlKDI1KTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgdHJ1bmNhdGUgdXNlclNlYXJjaCB0byAxMDAgY2hhcmFjdGVycycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGxvbmdTZWFyY2ggPSAnYScucmVwZWF0KDE1MCk7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUsIHsgdXNlclNlYXJjaDogbG9uZ1NlYXJjaCB9KTtcblxuICAgICAgZHluYW1vTW9jay5vbihTY2FuQ29tbWFuZCkucmVzb2x2ZXMoeyBJdGVtczogW10gfSk7XG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHsgSXRlbTogdW5kZWZpbmVkIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgdW5rbm93biBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIC8vIFRoZSBzZWFyY2ggc2hvdWxkIGJlIHRydW5jYXRlZCB0byAxMDAgY2hhcnNcbiAgICAgIC8vIFdlIGNhbid0IGRpcmVjdGx5IHRlc3QgdGhlIHRydW5jYXRpb24gaW4gdGhlIGZpbHRlciwgYnV0IHdlIGNhbiB2ZXJpZnkgaXQgZG9lc24ndCBjcmFzaFxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgcmV0dXJuIDQwMCB3aGVuIGRhdGUgcmFuZ2UgZXhjZWVkcyA5MCBkYXlzJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlLCB7XG4gICAgICAgIHN0YXJ0RGF0ZTogJzIwMjQtMDEtMDEnLFxuICAgICAgICBlbmREYXRlOiAnMjAyNC0wNi0wMScsIC8vIE1vcmUgdGhhbiA5MCBkYXlzXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIHVua25vd24gYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSg0MDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5lcnJvcikudG9CZSgnRGF0ZSByYW5nZSBjYW5ub3QgZXhjZWVkIDkwIGRheXMnKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgYWxsb3cgZGF0ZSByYW5nZSBvZiBleGFjdGx5IDkwIGRheXMnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUsIHtcbiAgICAgICAgc3RhcnREYXRlOiAnMjAyNC0wMS0wMScsXG4gICAgICAgIGVuZERhdGU6ICcyMDI0LTAzLTMxJywgLy8gRXhhY3RseSA5MCBkYXlzXG4gICAgICB9KTtcblxuICAgICAgZHluYW1vTW9jay5vbihTY2FuQ29tbWFuZCkucmVzb2x2ZXMoeyBJdGVtczogW10gfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyB1bmtub3duIGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgYWxsb3cgZGF0ZSByYW5nZSBsZXNzIHRoYW4gOTAgZGF5cycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSwge1xuICAgICAgICBzdGFydERhdGU6ICcyMDI0LTAxLTAxJyxcbiAgICAgICAgZW5kRGF0ZTogJzIwMjQtMDItMDEnLCAvLyAzMSBkYXlzXG4gICAgICB9KTtcblxuICAgICAgZHluYW1vTW9jay5vbihTY2FuQ29tbWFuZCkucmVzb2x2ZXMoeyBJdGVtczogW10gfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyB1bmtub3duIGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgbm90IHZhbGlkYXRlIGRhdGUgcmFuZ2Ugd2hlbiBvbmx5IG9uZSBkYXRlIGlzIHByb3ZpZGVkJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlLCB7XG4gICAgICAgIHN0YXJ0RGF0ZTogJzIwMjQtMDEtMDEnLFxuICAgICAgICAvLyBObyBlbmREYXRlXG4gICAgICB9KTtcblxuICAgICAgZHluYW1vTW9jay5vbihTY2FuQ29tbWFuZCkucmVzb2x2ZXMoeyBJdGVtczogW10gfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyB1bmtub3duIGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0pXVCB2ZXJpZmljYXRpb24gZWRnZSBjYXNlcycsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIHJldHVybiA0MDMgd2hlbiBjb2duaXRvOmdyb3VwcyBjbGFpbSBpcyBtaXNzaW5nJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSB7XG4gICAgICAgIC4uLmNyZWF0ZUV2ZW50KGZhbHNlKSxcbiAgICAgICAgcmVxdWVzdENvbnRleHQ6IHtcbiAgICAgICAgICBhdXRob3JpemVyOiB7XG4gICAgICAgICAgICBjbGFpbXM6IHtcbiAgICAgICAgICAgICAgc3ViOiAndXNlci0xMjMnLFxuICAgICAgICAgICAgICBlbWFpbDogJ3Rlc3RAZXhhbXBsZS5jb20nLFxuICAgICAgICAgICAgICAvLyBObyBjb2duaXRvOmdyb3VwcyBjbGFpbVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIHVua25vd24gYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSg0MDMpO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5lcnJvcikudG9CZSgnQWNjZXNzIGRlbmllZC4gQWRtaW4gcHJpdmlsZWdlcyByZXF1aXJlZC4nKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgcmV0dXJuIDQwMyB3aGVuIGNvZ25pdG86Z3JvdXBzIGV4aXN0cyBidXQgZG9lcyBub3QgY29udGFpbiBhZG1pbicsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0ge1xuICAgICAgICAuLi5jcmVhdGVFdmVudChmYWxzZSksXG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICAgICAgY2xhaW1zOiB7XG4gICAgICAgICAgICAgIHN1YjogJ3VzZXItMTIzJyxcbiAgICAgICAgICAgICAgZW1haWw6ICd0ZXN0QGV4YW1wbGUuY29tJyxcbiAgICAgICAgICAgICAgJ2NvZ25pdG86Z3JvdXBzJzogJ3VzZXIsZGV2ZWxvcGVyJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyB1bmtub3duIGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoNDAzKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmUoJ0FjY2VzcyBkZW5pZWQuIEFkbWluIHByaXZpbGVnZXMgcmVxdWlyZWQuJyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBjb2duaXRvOmdyb3VwcyBhcyBhbiBhcnJheSB3aXRob3V0IGFkbWluJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSB7XG4gICAgICAgIC4uLmNyZWF0ZUV2ZW50KGZhbHNlKSxcbiAgICAgICAgcmVxdWVzdENvbnRleHQ6IHtcbiAgICAgICAgICBhdXRob3JpemVyOiB7XG4gICAgICAgICAgICBjbGFpbXM6IHtcbiAgICAgICAgICAgICAgc3ViOiAndXNlci0xMjMnLFxuICAgICAgICAgICAgICBlbWFpbDogJ3Rlc3RAZXhhbXBsZS5jb20nLFxuICAgICAgICAgICAgICAnY29nbml0bzpncm91cHMnOiBbJ3VzZXInLCAnZGV2ZWxvcGVyJ10sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9O1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgdW5rbm93biBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDQwMyk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LmVycm9yKS50b0JlKCdBY2Nlc3MgZGVuaWVkLiBBZG1pbiBwcml2aWxlZ2VzIHJlcXVpcmVkLicpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gNDAzIHdoZW4gYXV0aG9yaXplciBjbGFpbXMgYXJlIGNvbXBsZXRlbHkgbWlzc2luZycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0ge1xuICAgICAgICAuLi5jcmVhdGVFdmVudChmYWxzZSksXG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjogdW5kZWZpbmVkLFxuICAgICAgICB9LFxuICAgICAgfTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIHVua25vd24gYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSg0MDMpO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5lcnJvcikudG9CZSgnQWNjZXNzIGRlbmllZC4gQWRtaW4gcHJpdmlsZWdlcyByZXF1aXJlZC4nKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgcmV0dXJuIDQwMyB3aGVuIHJlcXVlc3RDb250ZXh0IGlzIG1pc3NpbmcnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IHtcbiAgICAgICAgLi4uY3JlYXRlRXZlbnQoZmFsc2UpLFxuICAgICAgICByZXF1ZXN0Q29udGV4dDogdW5kZWZpbmVkLFxuICAgICAgfTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIHVua25vd24gYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSg0MDMpO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5lcnJvcikudG9CZSgnQWNjZXNzIGRlbmllZC4gQWRtaW4gcHJpdmlsZWdlcyByZXF1aXJlZC4nKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgYWNjZXB0IGFkbWluIGdyb3VwIGluIGNvbW1hLXNlcGFyYXRlZCBzdHJpbmcgZm9ybWF0JywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSB7XG4gICAgICAgIC4uLmNyZWF0ZUV2ZW50KGZhbHNlKSxcbiAgICAgICAgcmVxdWVzdENvbnRleHQ6IHtcbiAgICAgICAgICBhdXRob3JpemVyOiB7XG4gICAgICAgICAgICBjbGFpbXM6IHtcbiAgICAgICAgICAgICAgc3ViOiAndXNlci0xMjMnLFxuICAgICAgICAgICAgICBlbWFpbDogJ2FkbWluQGV4YW1wbGUuY29tJyxcbiAgICAgICAgICAgICAgJ2NvZ25pdG86Z3JvdXBzJzogJ3VzZXIsYWRtaW4sZGV2ZWxvcGVyJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH07XG5cbiAgICAgIGR5bmFtb01vY2sub24oU2NhbkNvbW1hbmQpLnJlc29sdmVzKHsgSXRlbXM6IFtdIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgdW5rbm93biBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LnJlYWRpbmdzKS50b0VxdWFsKFtdKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgYWNjZXB0IGFkbWluIGdyb3VwIGluIGFycmF5IGZvcm1hdCcsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0ge1xuICAgICAgICAuLi5jcmVhdGVFdmVudChmYWxzZSksXG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICAgICAgY2xhaW1zOiB7XG4gICAgICAgICAgICAgIHN1YjogJ3VzZXItMTIzJyxcbiAgICAgICAgICAgICAgZW1haWw6ICdhZG1pbkBleGFtcGxlLmNvbScsXG4gICAgICAgICAgICAgICdjb2duaXRvOmdyb3Vwcyc6IFsndXNlcicsICdhZG1pbicsICdkZXZlbG9wZXInXSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH07XG5cbiAgICAgIGR5bmFtb01vY2sub24oU2NhbkNvbW1hbmQpLnJlc29sdmVzKHsgSXRlbXM6IFtdIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgdW5rbm93biBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LnJlYWRpbmdzKS50b0VxdWFsKFtdKTtcbiAgICB9KTtcbiAgfSk7XG59KTtcbiJdfQ==