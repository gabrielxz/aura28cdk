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
            expect(consoleErrorSpy).toHaveBeenCalledWith('Error:', error);
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
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2V0LWFsbC1yZWFkaW5ncy50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZ2V0LWFsbC1yZWFkaW5ncy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsMEVBQThEO0FBRTlELHdEQUF3RjtBQUN4Riw2REFBaUQ7QUFFakQsMkJBQTJCO0FBQzNCLE1BQU0sVUFBVSxHQUFHLElBQUEsZ0NBQVUsRUFBQyxxQ0FBc0IsQ0FBQyxDQUFDO0FBRXRELFFBQVEsQ0FBQyx5QkFBeUIsRUFBRSxHQUFHLEVBQUU7SUFDdkMsVUFBVSxDQUFDLEdBQUcsRUFBRTtRQUNkLFVBQVUsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNuQixPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFtQixHQUFHLHFCQUFxQixDQUFDO1FBQ3hELE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZSxHQUFHLGlCQUFpQixDQUFDO0lBQ2xELENBQUMsQ0FBQyxDQUFDO0lBRUgsTUFBTSxXQUFXLEdBQUcsQ0FDbEIsT0FBZ0IsRUFDaEIsV0FBb0MsRUFDTCxFQUFFLENBQUMsQ0FBQztRQUNuQyxxQkFBcUIsRUFBRSxXQUFXLElBQUksSUFBSTtRQUMxQyxjQUFjLEVBQUU7WUFDZCxVQUFVLEVBQUU7Z0JBQ1YsTUFBTSxFQUFFO29CQUNOLGdCQUFnQixFQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRTtpQkFDM0M7YUFDRjtTQUNtRDtLQUN2RCxDQUFDLENBQUM7SUFFSCxRQUFRLENBQUMsZUFBZSxFQUFFLEdBQUcsRUFBRTtRQUM3QixFQUFFLENBQUMsMENBQTBDLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDeEQsTUFBTSxLQUFLLEdBQUcsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2pDLE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBQSwwQkFBTyxFQUFDLEtBQTZCLENBQUMsQ0FBQztZQUU5RCxNQUFNLENBQUMsUUFBUSxD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ZG1pbi9nZXQtYWxsLXJlYWRpbmdzJztcbmltcG9ydCB7IEFQSUdhdGV3YXlQcm94eUV2ZW50IH0gZnJvbSAnYXdzLWxhbWJkYSc7XG5pbXBvcnQgeyBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LCBTY2FuQ29tbWFuZCwgR2V0Q29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYic7XG5pbXBvcnQgeyBtb2NrQ2xpZW50IH0gZnJvbSAnYXdzLXNkay1jbGllbnQtbW9jayc7XG5cbi8vIE1vY2sgdGhlIER5bmFtb0RCIGNsaWVudFxuY29uc3QgZHluYW1vTW9jayA9IG1vY2tDbGllbnQoRHluYW1vREJEb2N1bWVudENsaWVudCk7XG5cbmRlc2NyaWJlKCdnZXQtYWxsLXJlYWRpbmdzIExhbWJkYScsICgpID0+IHtcbiAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgZHluYW1vTW9jay5yZXNldCgpO1xuICAgIHByb2Nlc3MuZW52LlJFQURJTkdTX1RBQkxFX05BTUUgPSAndGVzdC1yZWFkaW5ncy10YWJsZSc7XG4gICAgcHJvY2Vzcy5lbnYuVVNFUl9UQUJMRV9OQU1FID0gJ3Rlc3QtdXNlci10YWJsZSc7XG4gIH0pO1xuXG4gIGNvbnN0IGNyZWF0ZUV2ZW50ID0gKFxuICAgIGlzQWRtaW46IGJvb2xlYW4sXG4gICAgcXVlcnlQYXJhbXM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+LFxuICApOiBQYXJ0aWFsPEFQSUdhdGV3YXlQcm94eUV2ZW50PiA9PiAoe1xuICAgIHF1ZXJ5U3RyaW5nUGFyYW1ldGVyczogcXVlcnlQYXJhbXMgfHwgbnVsbCxcbiAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICBjbGFpbXM6IHtcbiAgICAgICAgICAnY29nbml0bzpncm91cHMnOiBpc0FkbWluID8gWydhZG1pbiddIDogW10sXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0gYXMgdW5rbm93biBhcyBBUElHYXRld2F5UHJveHlFdmVudFsncmVxdWVzdENvbnRleHQnXSxcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0F1dGhvcml6YXRpb24nLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gNDAzIHdoZW4gdXNlciBpcyBub3QgYWRtaW4nLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KGZhbHNlKTtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDQwMyk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LmVycm9yKS50b0JlKCdBY2Nlc3MgZGVuaWVkLiBBZG1pbiBwcml2aWxlZ2VzIHJlcXVpcmVkLicpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBhbGxvdyBhY2Nlc3Mgd2hlbiB1c2VyIGlzIGFkbWluJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlKTtcblxuICAgICAgZHluYW1vTW9jay5vbihTY2FuQ29tbWFuZCkucmVzb2x2ZXMoeyBJdGVtczogW10gfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBhZG1pbiBncm91cCBhcyBjb21tYS1zZXBhcmF0ZWQgc3RyaW5nJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQ6IFBhcnRpYWw8QVBJR2F0ZXdheVByb3h5RXZlbnQ+ID0ge1xuICAgICAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgICAgIGF1dGhvcml6ZXI6IHtcbiAgICAgICAgICAgIGNsYWltczoge1xuICAgICAgICAgICAgICAnY29nbml0bzpncm91cHMnOiAndXNlcixhZG1pbixwcmVtaXVtJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSBhcyB1bmtub3duIGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50WydyZXF1ZXN0Q29udGV4dCddLFxuICAgICAgfTtcblxuICAgICAgZHluYW1vTW9jay5vbihTY2FuQ29tbWFuZCkucmVzb2x2ZXMoeyBJdGVtczogW10gfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHJlamVjdCB3aGVuIGFkbWluIGlzIG5vdCBpbiBjb21tYS1zZXBhcmF0ZWQgc3RyaW5nJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQ6IFBhcnRpYWw8QVBJR2F0ZXdheVByb3h5RXZlbnQ+ID0ge1xuICAgICAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgICAgIGF1dGhvcml6ZXI6IHtcbiAgICAgICAgICAgIGNsYWltczoge1xuICAgICAgICAgICAgICAnY29nbml0bzpncm91cHMnOiAndXNlcixwcmVtaXVtJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSBhcyB1bmtub3duIGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50WydyZXF1ZXN0Q29udGV4dCddLFxuICAgICAgfTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoNDAzKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0ZldGNoaW5nIHJlYWRpbmdzJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgZmV0Y2ggYWxsIHJlYWRpbmdzIHdpdGhvdXQgZmlsdGVycycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSk7XG5cbiAgICAgIGNvbnN0IG1vY2tSZWFkaW5ncyA9IFtcbiAgICAgICAge1xuICAgICAgICAgIHJlYWRpbmdJZDogJ3JlYWRpbmctMScsXG4gICAgICAgICAgdXNlcklkOiAndXNlci0xJyxcbiAgICAgICAgICB0eXBlOiAnU291bCBCbHVlcHJpbnQnLFxuICAgICAgICAgIHN0YXR1czogJ1JlYWR5JyxcbiAgICAgICAgICBjcmVhdGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAwOjAwWicsXG4gICAgICAgICAgdXBkYXRlZEF0OiAnMjAyNC0wMS0wMVQwMDowMTowMFonLFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgcmVhZGluZ0lkOiAncmVhZGluZy0yJyxcbiAgICAgICAgICB1c2VySWQ6ICd1c2VyLTInLFxuICAgICAgICAgIHR5cGU6ICdOYXRhbCBDaGFydCcsXG4gICAgICAgICAgc3RhdHVzOiAnUHJvY2Vzc2luZycsXG4gICAgICAgICAgY3JlYXRlZEF0OiAnMjAyNC0wMS0wMlQwMDowMDowMFonLFxuICAgICAgICAgIHVwZGF0ZWRBdDogJzIwMjQtMDEtMDJUMDA6MDA6MDBaJyxcbiAgICAgICAgfSxcbiAgICAgIF07XG5cbiAgICAgIGNvbnN0IG1vY2tVc2VycyA9IFtcbiAgICAgICAgeyB1c2VySWQ6ICd1c2VyLTEnLCBlbWFpbDogJ3VzZXIxQGV4YW1wbGUuY29tJyB9LFxuICAgICAgICB7IHVzZXJJZDogJ3VzZXItMicsIGVtYWlsOiAndXNlcjJAZXhhbXBsZS5jb20nIH0sXG4gICAgICBdO1xuXG4gICAgICBkeW5hbW9Nb2NrLm9uKFNjYW5Db21tYW5kKS5yZXNvbHZlcyh7IEl0ZW1zOiBtb2NrUmVhZGluZ3MgfSk7XG4gICAgICBkeW5hbW9Nb2NrXG4gICAgICAgIC5vbihHZXRDb21tYW5kLCB7IEtleTogeyB1c2VySWQ6ICd1c2VyLTEnLCBjcmVhdGVkQXQ6ICdQUk9GSUxFJyB9IH0pXG4gICAgICAgIC5yZXNvbHZlcyh7IEl0ZW06IG1vY2tVc2Vyc1swXSB9KTtcbiAgICAgIGR5bmFtb01vY2tcbiAgICAgICAgLm9uKEdldENvbW1hbmQsIHsgS2V5OiB7IHVzZXJJZDogJ3VzZXItMicsIGNyZWF0ZWRBdDogJ1BST0ZJTEUnIH0gfSlcbiAgICAgICAgLnJlc29sdmVzKHsgSXRlbTogbW9ja1VzZXJzWzFdIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5yZWFkaW5ncykudG9IYXZlTGVuZ3RoKDIpO1xuICAgICAgZXhwZWN0KGJvZHkucmVhZGluZ3NbMF0udXNlckVtYWlsKS50b0JlKCd1c2VyMUBleGFtcGxlLmNvbScpO1xuICAgICAgZXhwZWN0KGJvZHkucmVhZGluZ3NbMV0udXNlckVtYWlsKS50b0JlKCd1c2VyMkBleGFtcGxlLmNvbScpO1xuICAgICAgZXhwZWN0KGJvZHkuY291bnQpLnRvQmUoMik7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGFwcGx5IGRhdGUgcmFuZ2UgZmlsdGVycycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSwge1xuICAgICAgICBzdGFydERhdGU6ICcyMDI0LTAxLTAxJyxcbiAgICAgICAgZW5kRGF0ZTogJzIwMjQtMDEtMzEnLFxuICAgICAgfSk7XG5cbiAgICAgIGR5bmFtb01vY2sub24oU2NhbkNvbW1hbmQpLmNhbGxzRmFrZSgoaW5wdXQ6IGFueSkgPT4ge1xuICAgICAgICBleHBlY3QoaW5wdXQuRmlsdGVyRXhwcmVzc2lvbikudG9Db250YWluKCdjcmVhdGVkQXQgPj0gOnN0YXJ0RGF0ZScpO1xuICAgICAgICBleHBlY3QoaW5wdXQuRmlsdGVyRXhwcmVzc2lvbikudG9Db250YWluKCdjcmVhdGVkQXQgPD0gOmVuZERhdGUnKTtcbiAgICAgICAgZXhwZWN0KGlucHV0LkV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXNbJzpzdGFydERhdGUnXSkudG9CZSgnMjAyNC0wMS0wMScpO1xuICAgICAgICBleHBlY3QoaW5wdXQuRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlc1snOmVuZERhdGUnXSkudG9CZSgnMjAyNC0wMS0zMVQyMzo1OTo1OS45OTlaJyk7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoeyBJdGVtczogW10gfSk7XG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGFwcGx5IHN0YXR1cyBmaWx0ZXInLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUsIHsgc3RhdHVzOiAnUmVhZHknIH0pO1xuXG4gICAgICBkeW5hbW9Nb2NrLm9uKFNjYW5Db21tYW5kKS5jYWxsc0Zha2UoKGlucHV0OiBhbnkpID0+IHtcbiAgICAgICAgZXhwZWN0KGlucHV0LkZpbHRlckV4cHJlc3Npb24pLnRvQ29udGFpbignI3N0YXR1cyA9IDpzdGF0dXMnKTtcbiAgICAgICAgZXhwZWN0KGlucHV0LkV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lc1snI3N0YXR1cyddKS50b0JlKCdzdGF0dXMnKTtcbiAgICAgICAgZXhwZWN0KGlucHV0LkV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXNbJzpzdGF0dXMnXSkudG9CZSgnUmVhZHknKTtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7IEl0ZW1zOiBbXSB9KTtcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgYXBwbHkgdHlwZSBmaWx0ZXInLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUsIHsgdHlwZTogJ1NvdWwgQmx1ZXByaW50JyB9KTtcblxuICAgICAgZHluYW1vTW9jay5vbihTY2FuQ29tbWFuZCkuY2FsbHNGYWtlKChpbnB1dDogYW55KSA9PiB7XG4gICAgICAgIGV4cGVjdChpbnB1dC5GaWx0ZXJFeHByZXNzaW9uKS50b0NvbnRhaW4oJyN0eXBlID0gOnR5cGUnKTtcbiAgICAgICAgZXhwZWN0KGlucHV0LkV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lc1snI3R5cGUnXSkudG9CZSgndHlwZScpO1xuICAgICAgICBleHBlY3QoaW5wdXQuRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlc1snOnR5cGUnXSkudG9CZSgnU291bCBCbHVlcHJpbnQnKTtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7IEl0ZW1zOiBbXSB9KTtcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIHBhZ2luYXRpb24gd2l0aCBsaW1pdCBhbmQgbGFzdEV2YWx1YXRlZEtleScsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGxhc3RLZXkgPSB7IHJlYWRpbmdJZDogJ3JlYWRpbmctMjUnLCB1c2VySWQ6ICd1c2VyLTI1JyB9O1xuICAgICAgY29uc3QgZW5jb2RlZEtleSA9IEJ1ZmZlci5mcm9tKEpTT04uc3RyaW5naWZ5KGxhc3RLZXkpKS50b1N0cmluZygnYmFzZTY0Jyk7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSwge1xuICAgICAgICBsaW1pdDogJzUwJyxcbiAgICAgICAgbGFzdEV2YWx1YXRlZEtleTogZW5jb2RlZEtleSxcbiAgICAgIH0pO1xuXG4gICAgICBkeW5hbW9Nb2NrLm9uKFNjYW5Db21tYW5kKS5jYWxsc0Zha2UoKGlucHV0OiBhbnkpID0+IHtcbiAgICAgICAgZXhwZWN0KGlucHV0LkxpbWl0KS50b0JlKDUwKTtcbiAgICAgICAgZXhwZWN0KGlucHV0LkV4Y2x1c2l2ZVN0YXJ0S2V5KS50b0VxdWFsKGxhc3RLZXkpO1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHsgSXRlbXM6IFtdLCBMYXN0RXZhbHVhdGVkS2V5OiB7IHJlYWRpbmdJZDogJ3JlYWRpbmctNzUnIH0gfSk7XG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG5cbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkubGFzdEV2YWx1YXRlZEtleSkudG9CZURlZmluZWQoKTtcbiAgICAgIGNvbnN0IGRlY29kZWRLZXkgPSBKU09OLnBhcnNlKEJ1ZmZlci5mcm9tKGJvZHkubGFzdEV2YWx1YXRlZEtleSwgJ2Jhc2U2NCcpLnRvU3RyaW5nKCkpO1xuICAgICAgZXhwZWN0KGRlY29kZWRLZXkpLnRvRXF1YWwoeyByZWFkaW5nSWQ6ICdyZWFkaW5nLTc1JyB9KTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgdXNlIGRlZmF1bHQgbGltaXQgb2YgMjUgd2hlbiBub3Qgc3BlY2lmaWVkJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlKTtcblxuICAgICAgZHluYW1vTW9jay5vbihTY2FuQ29tbWFuZCkuY2FsbHNGYWtlKChpbnB1dDogYW55KSA9PiB7XG4gICAgICAgIGV4cGVjdChpbnB1dC5MaW1pdCkudG9CZSgyNSk7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoeyBJdGVtczogW10gfSk7XG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdVc2VyIHNlYXJjaCcsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGZpbHRlciByZWFkaW5ncyBieSB1c2VyIGVtYWlsIHNlYXJjaCcsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSwgeyB1c2VyU2VhcmNoOiAndXNlcjEnIH0pO1xuXG4gICAgICBjb25zdCBtb2NrUmVhZGluZ3MgPSBbXG4gICAgICAgIHsgcmVhZGluZ0lkOiAncmVhZGluZy0xJywgdXNlcklkOiAndXNlci0xJyB9LFxuICAgICAgICB7IHJlYWRpbmdJZDogJ3JlYWRpbmctMicsIHVzZXJJZDogJ3VzZXItMicgfSxcbiAgICAgICAgeyByZWFkaW5nSWQ6ICdyZWFkaW5nLTMnLCB1c2VySWQ6ICd1c2VyLTMnIH0sXG4gICAgICBdO1xuXG4gICAgICBkeW5hbW9Nb2NrLm9uKFNjYW5Db21tYW5kKS5yZXNvbHZlcyh7IEl0ZW1zOiBtb2NrUmVhZGluZ3MgfSk7XG4gICAgICBkeW5hbW9Nb2NrXG4gICAgICAgIC5vbihHZXRDb21tYW5kLCB7IEtleTogeyB1c2VySWQ6ICd1c2VyLTEnLCBjcmVhdGVkQXQ6ICdQUk9GSUxFJyB9IH0pXG4gICAgICAgIC5yZXNvbHZlcyh7IEl0ZW06IHsgdXNlcklkOiAndXNlci0xJywgZW1haWw6ICd1c2VyMUBleGFtcGxlLmNvbScgfSB9KTtcbiAgICAgIGR5bmFtb01vY2tcbiAgICAgICAgLm9uKEdldENvbW1hbmQsIHsgS2V5OiB7IHVzZXJJZDogJ3VzZXItMicsIGNyZWF0ZWRBdDogJ1BST0ZJTEUnIH0gfSlcbiAgICAgICAgLnJlc29sdmVzKHsgSXRlbTogeyB1c2VySWQ6ICd1c2VyLTInLCBlbWFpbDogJ3Rlc3RAZXhhbXBsZS5jb20nIH0gfSk7XG4gICAgICBkeW5hbW9Nb2NrXG4gICAgICAgIC5vbihHZXRDb21tYW5kLCB7IEtleTogeyB1c2VySWQ6ICd1c2VyLTMnLCBjcmVhdGVkQXQ6ICdQUk9GSUxFJyB9IH0pXG4gICAgICAgIC5yZXNvbHZlcyh7IEl0ZW06IHsgdXNlcklkOiAndXNlci0zJywgZW1haWw6ICdhbm90aGVyQGV4YW1wbGUuY29tJyB9IH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5yZWFkaW5ncykudG9IYXZlTGVuZ3RoKDEpO1xuICAgICAgZXhwZWN0KGJvZHkucmVhZGluZ3NbMF0ucmVhZGluZ0lkKS50b0JlKCdyZWFkaW5nLTEnKTtcbiAgICAgIGV4cGVjdChib2R5LnJlYWRpbmdzWzBdLnVzZXJFbWFpbCkudG9CZSgndXNlcjFAZXhhbXBsZS5jb20nKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIGNhc2UtaW5zZW5zaXRpdmUgdXNlciBzZWFyY2gnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUsIHsgdXNlclNlYXJjaDogJ1VTRVIxJyB9KTtcblxuICAgICAgY29uc3QgbW9ja1JlYWRpbmdzID0gW3sgcmVhZGluZ0lkOiAncmVhZGluZy0xJywgdXNlcklkOiAndXNlci0xJyB9XTtcblxuICAgICAgZHluYW1vTW9jay5vbihTY2FuQ29tbWFuZCkucmVzb2x2ZXMoeyBJdGVtczogbW9ja1JlYWRpbmdzIH0pO1xuICAgICAgZHluYW1vTW9ja1xuICAgICAgICAub24oR2V0Q29tbWFuZClcbiAgICAgICAgLnJlc29sdmVzKHsgSXRlbTogeyB1c2VySWQ6ICd1c2VyLTEnLCBlbWFpbDogJ3VzZXIxQGV4YW1wbGUuY29tJyB9IH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LnJlYWRpbmdzKS50b0hhdmVMZW5ndGgoMSk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSB1c2VycyBub3QgZm91bmQgaW4gdXNlciB0YWJsZScsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSwgeyB1c2VyU2VhcmNoOiAndGVzdCcgfSk7XG5cbiAgICAgIGNvbnN0IG1vY2tSZWFkaW5ncyA9IFtcbiAgICAgICAgeyByZWFkaW5nSWQ6ICdyZWFkaW5nLTEnLCB1c2VySWQ6ICd1c2VyLTEnIH0sXG4gICAgICAgIHsgcmVhZGluZ0lkOiAncmVhZGluZy0yJywgdXNlcklkOiAndXNlci0yJyB9LFxuICAgICAgXTtcblxuICAgICAgZHluYW1vTW9jay5vbihTY2FuQ29tbWFuZCkucmVzb2x2ZXMoeyBJdGVtczogbW9ja1JlYWRpbmdzIH0pO1xuICAgICAgZHluYW1vTW9ja1xuICAgICAgICAub24oR2V0Q29tbWFuZCwgeyBLZXk6IHsgdXNlcklkOiAndXNlci0xJywgY3JlYXRlZEF0OiAnUFJPRklMRScgfSB9KVxuICAgICAgICAucmVzb2x2ZXMoeyBJdGVtOiB1bmRlZmluZWQgfSk7XG4gICAgICBkeW5hbW9Nb2NrXG4gICAgICAgIC5vbihHZXRDb21tYW5kLCB7IEtleTogeyB1c2VySWQ6ICd1c2VyLTInLCBjcmVhdGVkQXQ6ICdQUk9GSUxFJyB9IH0pXG4gICAgICAgIC5yZXNvbHZlcyh7IEl0ZW06IHsgdXNlcklkOiAndXNlci0yJywgZW1haWw6ICd0ZXN0QGV4YW1wbGUuY29tJyB9IH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LnJlYWRpbmdzKS50b0hhdmVMZW5ndGgoMSk7XG4gICAgICBleHBlY3QoYm9keS5yZWFkaW5nc1swXS5yZWFkaW5nSWQpLnRvQmUoJ3JlYWRpbmctMicpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBzdGlsbCBhZGQgZW1haWxzIHdoZW4gbm8gdXNlciBzZWFyY2ggaXMgcHJvdmlkZWQnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUpO1xuXG4gICAgICBjb25zdCBtb2NrUmVhZGluZ3MgPSBbXG4gICAgICAgIHsgcmVhZGluZ0lkOiAncmVhZGluZy0xJywgdXNlcklkOiAndXNlci0xJyB9LFxuICAgICAgICB7IHJlYWRpbmdJZDogJ3JlYWRpbmctMicsIHVzZXJJZDogJ3VzZXItMicgfSxcbiAgICAgIF07XG5cbiAgICAgIGR5bmFtb01vY2sub24oU2NhbkNvbW1hbmQpLnJlc29sdmVzKHsgSXRlbXM6IG1vY2tSZWFkaW5ncyB9KTtcbiAgICAgIGR5bmFtb01vY2tcbiAgICAgICAgLm9uKEdldENvbW1hbmQsIHsgS2V5OiB7IHVzZXJJZDogJ3VzZXItMScsIGNyZWF0ZWRBdDogJ1BST0ZJTEUnIH0gfSlcbiAgICAgICAgLnJlc29sdmVzKHsgSXRlbTogeyB1c2VySWQ6ICd1c2VyLTEnLCBlbWFpbDogJ3VzZXIxQGV4YW1wbGUuY29tJyB9IH0pO1xuICAgICAgZHluYW1vTW9ja1xuICAgICAgICAub24oR2V0Q29tbWFuZCwgeyBLZXk6IHsgdXNlcklkOiAndXNlci0yJywgY3JlYXRlZEF0OiAnUFJPRklMRScgfSB9KVxuICAgICAgICAucmVzb2x2ZXMoeyBJdGVtOiB7IHVzZXJJZDogJ3VzZXItMicsIGVtYWlsOiAndXNlcjJAZXhhbXBsZS5jb20nIH0gfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkucmVhZGluZ3MpLnRvSGF2ZUxlbmd0aCgyKTtcbiAgICAgIGV4cGVjdChib2R5LnJlYWRpbmdzWzBdLnVzZXJFbWFpbCkudG9CZSgndXNlcjFAZXhhbXBsZS5jb20nKTtcbiAgICAgIGV4cGVjdChib2R5LnJlYWRpbmdzWzFdLnVzZXJFbWFpbCkudG9CZSgndXNlcjJAZXhhbXBsZS5jb20nKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0Vycm9yIGhhbmRsaW5nJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgaGFuZGxlIER5bmFtb0RCIHNjYW4gZXJyb3JzJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlKTtcblxuICAgICAgZHluYW1vTW9jay5vbihTY2FuQ29tbWFuZCkucmVqZWN0cyhuZXcgRXJyb3IoJ0R5bmFtb0RCIGVycm9yJykpO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSg1MDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5lcnJvcikudG9CZSgnSW50ZXJuYWwgc2VydmVyIGVycm9yJyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGxvZyBlcnJvcnMgdG8gY29uc29sZScsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGNvbnNvbGVFcnJvclNweSA9IGplc3Quc3B5T24oY29uc29sZSwgJ2Vycm9yJykubW9ja0ltcGxlbWVudGF0aW9uKCk7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUpO1xuXG4gICAgICBjb25zdCBlcnJvciA9IG5ldyBFcnJvcignVGVzdCBlcnJvcicpO1xuICAgICAgZHluYW1vTW9jay5vbihTY2FuQ29tbWFuZCkucmVqZWN0cyhlcnJvcik7XG5cbiAgICAgIGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QoY29uc29sZUVycm9yU3B5KS50b0hhdmVCZWVuQ2FsbGVkV2l0aCgnRXJyb3I6JywgZXJyb3IpO1xuICAgICAgY29uc29sZUVycm9yU3B5Lm1vY2tSZXN0b3JlKCk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHdhcm4gd2hlbiB1c2VyIGZldGNoIGZhaWxzIGJ1dCBjb250aW51ZSBwcm9jZXNzaW5nJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgY29uc29sZVdhcm5TcHkgPSBqZXN0LnNweU9uKGNvbnNvbGUsICd3YXJuJykubW9ja0ltcGxlbWVudGF0aW9uKCk7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUpO1xuXG4gICAgICBjb25zdCBtb2NrUmVhZGluZ3MgPSBbeyByZWFkaW5nSWQ6ICdyZWFkaW5nLTEnLCB1c2VySWQ6ICd1c2VyLTEnIH1dO1xuXG4gICAgICBkeW5hbW9Nb2NrLm9uKFNjYW5Db21tYW5kKS5yZXNvbHZlcyh7IEl0ZW1zOiBtb2NrUmVhZGluZ3MgfSk7XG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlamVjdHMobmV3IEVycm9yKCdVc2VyIG5vdCBmb3VuZCcpKTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIGV4cGVjdChjb25zb2xlV2FyblNweSkudG9IYXZlQmVlbkNhbGxlZFdpdGgoXG4gICAgICAgICdGYWlsZWQgdG8gZmV0Y2ggdXNlciB1c2VyLTE6JyxcbiAgICAgICAgZXhwZWN0LmFueShFcnJvciksXG4gICAgICApO1xuXG4gICAgICBjb25zb2xlV2FyblNweS5tb2NrUmVzdG9yZSgpO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnUmVzcG9uc2UgZm9ybWF0JywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgaW5jbHVkZSBDT1JTIGhlYWRlcnMnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUpO1xuXG4gICAgICBkeW5hbW9Nb2NrLm9uKFNjYW5Db21tYW5kKS5yZXNvbHZlcyh7IEl0ZW1zOiBbXSB9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLmhlYWRlcnMpLnRvRXF1YWwoe1xuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHJldHVybiBwcm9wZXIgcmVzcG9uc2Ugc3RydWN0dXJlJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlKTtcblxuICAgICAgY29uc3QgbW9ja1JlYWRpbmdzID0gW3sgcmVhZGluZ0lkOiAncmVhZGluZy0xJywgdXNlcklkOiAndXNlci0xJyB9XTtcblxuICAgICAgZHluYW1vTW9jay5vbihTY2FuQ29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBJdGVtczogbW9ja1JlYWRpbmdzLFxuICAgICAgICBMYXN0RXZhbHVhdGVkS2V5OiB7IHJlYWRpbmdJZDogJ3JlYWRpbmctMScgfSxcbiAgICAgIH0pO1xuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIEl0ZW06IHsgdXNlcklkOiAndXNlci0xJywgZW1haWw6ICd1c2VyMUBleGFtcGxlLmNvbScgfSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keSkudG9IYXZlUHJvcGVydHkoJ3JlYWRpbmdzJyk7XG4gICAgICBleHBlY3QoYm9keSkudG9IYXZlUHJvcGVydHkoJ2NvdW50Jyk7XG4gICAgICBleHBlY3QoYm9keSkudG9IYXZlUHJvcGVydHkoJ2xhc3RFdmFsdWF0ZWRLZXknKTtcbiAgICAgIGV4cGVjdChBcnJheS5pc0FycmF5KGJvZHkucmVhZGluZ3MpKS50b0JlKHRydWUpO1xuICAgICAgZXhwZWN0KHR5cGVvZiBib2R5LmNvdW50KS50b0JlKCdudW1iZXInKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ011bHRpcGxlIGZpbHRlcnMnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBjb21iaW5lIG11bHRpcGxlIGZpbHRlcnMgd2l0aCBBTkQnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUsIHtcbiAgICAgICAgc3RhcnREYXRlOiAnMjAyNC0wMS0wMScsXG4gICAgICAgIGVuZERhdGU6ICcyMDI0LTAxLTMxJyxcbiAgICAgICAgc3RhdHVzOiAnUmVhZHknLFxuICAgICAgICB0eXBlOiAnU291bCBCbHVlcHJpbnQnLFxuICAgICAgfSk7XG5cbiAgICAgIGR5bmFtb01vY2sub24oU2NhbkNvbW1hbmQpLmNhbGxzRmFrZSgoaW5wdXQ6IGFueSkgPT4ge1xuICAgICAgICBleHBlY3QoaW5wdXQuRmlsdGVyRXhwcmVzc2lvbikudG9Db250YWluKCcgQU5EICcpO1xuICAgICAgICBleHBlY3QoaW5wdXQuRmlsdGVyRXhwcmVzc2lvbikudG9Db250YWluKCdjcmVhdGVkQXQgPj0gOnN0YXJ0RGF0ZScpO1xuICAgICAgICBleHBlY3QoaW5wdXQuRmlsdGVyRXhwcmVzc2lvbikudG9Db250YWluKCdjcmVhdGVkQXQgPD0gOmVuZERhdGUnKTtcbiAgICAgICAgZXhwZWN0KGlucHV0LkZpbHRlckV4cHJlc3Npb24pLnRvQ29udGFpbignI3N0YXR1cyA9IDpzdGF0dXMnKTtcbiAgICAgICAgZXhwZWN0KGlucHV0LkZpbHRlckV4cHJlc3Npb24pLnRvQ29udGFpbignI3R5cGUgPSA6dHlwZScpO1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHsgSXRlbXM6IFtdIH0pO1xuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnTG9nZ2luZycsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGxvZyBpbmNvbWluZyBldmVudCcsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGNvbnNvbGVJbmZvU3B5ID0gamVzdC5zcHlPbihjb25zb2xlLCAnaW5mbycpLm1vY2tJbXBsZW1lbnRhdGlvbigpO1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlKTtcblxuICAgICAgZHluYW1vTW9jay5vbihTY2FuQ29tbWFuZCkucmVzb2x2ZXMoeyBJdGVtczogW10gfSk7XG5cbiAgICAgIGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QoY29uc29sZUluZm9TcHkpLnRvSGF2ZUJlZW5DYWxsZWRXaXRoKCdHZXQgYWxsIHJlYWRpbmdzIGV2ZW50OicsIGV4cGVjdC5hbnkoU3RyaW5nKSk7XG5cbiAgICAgIGNvbnNvbGVJbmZvU3B5Lm1vY2tSZXN0b3JlKCk7XG4gICAgfSk7XG4gIH0pO1xufSk7XG4iXX0=