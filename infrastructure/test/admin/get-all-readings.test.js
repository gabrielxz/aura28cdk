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
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2V0LWFsbC1yZWFkaW5ncy50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZ2V0LWFsbC1yZWFkaW5ncy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsMEVBQThEO0FBRTlELHdEQUF3RjtBQUN4Riw2REFBaUQ7QUFFakQsMkJBQTJCO0FBQzNCLE1BQU0sVUFBVSxHQUFHLElBQUEsZ0NBQVUsRUFBQyxxQ0FBc0IsQ0FBQyxDQUFDO0FBRXRELFFBQVEsQ0FBQyx5QkFBeUIsRUFBRSxHQUFHLEVBQUU7SUFDdkMsVUFBVSxDQUFDLEdBQUcsRUFBRTtRQUNkLFVBQVUsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNuQixPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFtQixHQUFHLHFCQUFxQixDQUFDO1FBQ3hELE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZSxHQUFHLGlCQUFpQixDQUFDO0lBQ2xELENBQUMsQ0FBQyxDQUFDO0lBRUgsTUFBTSxXQUFXLEdBQUcsQ0FDbEIsT0FBZ0IsRUFDaEIsV0FBb0MsRUFDTCxFQUFFLENBQUMsQ0FBQztRQUNuQyxxQkFBcUIsRUFBRSxXQUFXLElBQUksSUFBSTtRQUMxQyxjQUFjLEVBQUU7WUFDZCxVQUFVLEVBQUU7Z0JBQ1YsTUFBTSxFQUFFO29CQUNOLGdCQUFnQixFQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRTtpQkFDM0M7YUFDRjtTQUNtRDtLQUN2RCxDQUFDLENBQUM7SUFFSCxRQUFRLENBQUMsZUFBZSxFQUFFLEdBQUcsRUFBRTtRQUM3QixFQUFFLENBQUMsMENBQTBDLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDeEQsTUFBTSxLQUFLLEdBQUcsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2pDLE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBQSwwQkFBTyxFQUFDLEtBQTZCLENBQUMsQ0FBQztZQUU5RCxNQUFNLENBQUMsUUFBUSxD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QUNMLENBQUMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgaGFuZGxlciB9IGZyb20gJy4uLy4uL2xhbWJkYS9hZG1pbi9nZXQtYWxsLXJlYWRpbmdzJztcbmltcG9ydCB7IEFQSUdhdGV3YXlQcm94eUV2ZW50IH0gZnJvbSAnYXdzLWxhbWJkYSc7XG5pbXBvcnQgeyBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LCBTY2FuQ29tbWFuZCwgR2V0Q29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYic7XG5pbXBvcnQgeyBtb2NrQ2xpZW50IH0gZnJvbSAnYXdzLXNkay1jbGllbnQtbW9jayc7XG5cbi8vIE1vY2sgdGhlIER5bmFtb0RCIGNsaWVudFxuY29uc3QgZHluYW1vTW9jayA9IG1vY2tDbGllbnQoRHluYW1vREJEb2N1bWVudENsaWVudCk7XG5cbmRlc2NyaWJlKCdnZXQtYWxsLXJlYWRpbmdzIExhbWJkYScsICgpID0+IHtcbiAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgZHluYW1vTW9jay5yZXNldCgpO1xuICAgIHByb2Nlc3MuZW52LlJFQURJTkdTX1RBQkxFX05BTUUgPSAndGVzdC1yZWFkaW5ncy10YWJsZSc7XG4gICAgcHJvY2Vzcy5lbnYuVVNFUl9UQUJMRV9OQU1FID0gJ3Rlc3QtdXNlci10YWJsZSc7XG4gIH0pO1xuXG4gIGNvbnN0IGNyZWF0ZUV2ZW50ID0gKFxuICAgIGlzQWRtaW46IGJvb2xlYW4sXG4gICAgcXVlcnlQYXJhbXM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+LFxuICApOiBQYXJ0aWFsPEFQSUdhdGV3YXlQcm94eUV2ZW50PiA9PiAoe1xuICAgIHF1ZXJ5U3RyaW5nUGFyYW1ldGVyczogcXVlcnlQYXJhbXMgfHwgbnVsbCxcbiAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICBjbGFpbXM6IHtcbiAgICAgICAgICAnY29nbml0bzpncm91cHMnOiBpc0FkbWluID8gWydhZG1pbiddIDogW10sXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0gYXMgdW5rbm93biBhcyBBUElHYXRld2F5UHJveHlFdmVudFsncmVxdWVzdENvbnRleHQnXSxcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0F1dGhvcml6YXRpb24nLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gNDAzIHdoZW4gdXNlciBpcyBub3QgYWRtaW4nLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KGZhbHNlKTtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDQwMyk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LmVycm9yKS50b0JlKCdBY2Nlc3MgZGVuaWVkLiBBZG1pbiBwcml2aWxlZ2VzIHJlcXVpcmVkLicpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBhbGxvdyBhY2Nlc3Mgd2hlbiB1c2VyIGlzIGFkbWluJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlKTtcblxuICAgICAgZHluYW1vTW9jay5vbihTY2FuQ29tbWFuZCkucmVzb2x2ZXMoeyBJdGVtczogW10gfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBhZG1pbiBncm91cCBhcyBjb21tYS1zZXBhcmF0ZWQgc3RyaW5nJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQ6IFBhcnRpYWw8QVBJR2F0ZXdheVByb3h5RXZlbnQ+ID0ge1xuICAgICAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgICAgIGF1dGhvcml6ZXI6IHtcbiAgICAgICAgICAgIGNsYWltczoge1xuICAgICAgICAgICAgICAnY29nbml0bzpncm91cHMnOiAndXNlcixhZG1pbixwcmVtaXVtJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSBhcyB1bmtub3duIGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50WydyZXF1ZXN0Q29udGV4dCddLFxuICAgICAgfTtcblxuICAgICAgZHluYW1vTW9jay5vbihTY2FuQ29tbWFuZCkucmVzb2x2ZXMoeyBJdGVtczogW10gfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHJlamVjdCB3aGVuIGFkbWluIGlzIG5vdCBpbiBjb21tYS1zZXBhcmF0ZWQgc3RyaW5nJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQ6IFBhcnRpYWw8QVBJR2F0ZXdheVByb3h5RXZlbnQ+ID0ge1xuICAgICAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgICAgIGF1dGhvcml6ZXI6IHtcbiAgICAgICAgICAgIGNsYWltczoge1xuICAgICAgICAgICAgICAnY29nbml0bzpncm91cHMnOiAndXNlcixwcmVtaXVtJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSBhcyB1bmtub3duIGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50WydyZXF1ZXN0Q29udGV4dCddLFxuICAgICAgfTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoNDAzKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0ZldGNoaW5nIHJlYWRpbmdzJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgZmV0Y2ggYWxsIHJlYWRpbmdzIHdpdGhvdXQgZmlsdGVycycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSk7XG5cbiAgICAgIGNvbnN0IG1vY2tSZWFkaW5ncyA9IFtcbiAgICAgICAge1xuICAgICAgICAgIHJlYWRpbmdJZDogJ3JlYWRpbmctMScsXG4gICAgICAgICAgdXNlcklkOiAndXNlci0xJyxcbiAgICAgICAgICB0eXBlOiAnU291bCBCbHVlcHJpbnQnLFxuICAgICAgICAgIHN0YXR1czogJ1JlYWR5JyxcbiAgICAgICAgICBjcmVhdGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAwOjAwWicsXG4gICAgICAgICAgdXBkYXRlZEF0OiAnMjAyNC0wMS0wMVQwMDowMTowMFonLFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgcmVhZGluZ0lkOiAncmVhZGluZy0yJyxcbiAgICAgICAgICB1c2VySWQ6ICd1c2VyLTInLFxuICAgICAgICAgIHR5cGU6ICdOYXRhbCBDaGFydCcsXG4gICAgICAgICAgc3RhdHVzOiAnUHJvY2Vzc2luZycsXG4gICAgICAgICAgY3JlYXRlZEF0OiAnMjAyNC0wMS0wMlQwMDowMDowMFonLFxuICAgICAgICAgIHVwZGF0ZWRBdDogJzIwMjQtMDEtMDJUMDA6MDA6MDBaJyxcbiAgICAgICAgfSxcbiAgICAgIF07XG5cbiAgICAgIGNvbnN0IG1vY2tVc2VycyA9IFtcbiAgICAgICAgeyB1c2VySWQ6ICd1c2VyLTEnLCBlbWFpbDogJ3VzZXIxQGV4YW1wbGUuY29tJyB9LFxuICAgICAgICB7IHVzZXJJZDogJ3VzZXItMicsIGVtYWlsOiAndXNlcjJAZXhhbXBsZS5jb20nIH0sXG4gICAgICBdO1xuXG4gICAgICBkeW5hbW9Nb2NrLm9uKFNjYW5Db21tYW5kKS5yZXNvbHZlcyh7IEl0ZW1zOiBtb2NrUmVhZGluZ3MgfSk7XG4gICAgICBkeW5hbW9Nb2NrXG4gICAgICAgIC5vbihHZXRDb21tYW5kLCB7IEtleTogeyB1c2VySWQ6ICd1c2VyLTEnLCBjcmVhdGVkQXQ6ICdQUk9GSUxFJyB9IH0pXG4gICAgICAgIC5yZXNvbHZlcyh7IEl0ZW06IG1vY2tVc2Vyc1swXSB9KTtcbiAgICAgIGR5bmFtb01vY2tcbiAgICAgICAgLm9uKEdldENvbW1hbmQsIHsgS2V5OiB7IHVzZXJJZDogJ3VzZXItMicsIGNyZWF0ZWRBdDogJ1BST0ZJTEUnIH0gfSlcbiAgICAgICAgLnJlc29sdmVzKHsgSXRlbTogbW9ja1VzZXJzWzFdIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5yZWFkaW5ncykudG9IYXZlTGVuZ3RoKDIpO1xuICAgICAgZXhwZWN0KGJvZHkucmVhZGluZ3NbMF0udXNlckVtYWlsKS50b0JlKCd1c2VyMUBleGFtcGxlLmNvbScpO1xuICAgICAgZXhwZWN0KGJvZHkucmVhZGluZ3NbMV0udXNlckVtYWlsKS50b0JlKCd1c2VyMkBleGFtcGxlLmNvbScpO1xuICAgICAgZXhwZWN0KGJvZHkuY291bnQpLnRvQmUoMik7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGFwcGx5IGRhdGUgcmFuZ2UgZmlsdGVycycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSwge1xuICAgICAgICBzdGFydERhdGU6ICcyMDI0LTAxLTAxJyxcbiAgICAgICAgZW5kRGF0ZTogJzIwMjQtMDEtMzEnLFxuICAgICAgfSk7XG5cbiAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICBkeW5hbW9Nb2NrLm9uKFNjYW5Db21tYW5kKS5jYWxsc0Zha2UoKGlucHV0OiBhbnkpID0+IHtcbiAgICAgICAgZXhwZWN0KGlucHV0LkZpbHRlckV4cHJlc3Npb24pLnRvQ29udGFpbignY3JlYXRlZEF0ID49IDpzdGFydERhdGUnKTtcbiAgICAgICAgZXhwZWN0KGlucHV0LkZpbHRlckV4cHJlc3Npb24pLnRvQ29udGFpbignY3JlYXRlZEF0IDw9IDplbmREYXRlJyk7XG4gICAgICAgIGV4cGVjdChpbnB1dC5FeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzWyc6c3RhcnREYXRlJ10pLnRvQmUoJzIwMjQtMDEtMDEnKTtcbiAgICAgICAgZXhwZWN0KGlucHV0LkV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXNbJzplbmREYXRlJ10pLnRvQmUoJzIwMjQtMDEtMzFUMjM6NTk6NTkuOTk5WicpO1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHsgSXRlbXM6IFtdIH0pO1xuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBhcHBseSBzdGF0dXMgZmlsdGVyJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlLCB7IHN0YXR1czogJ1JlYWR5JyB9KTtcblxuICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgIGR5bmFtb01vY2sub24oU2NhbkNvbW1hbmQpLmNhbGxzRmFrZSgoaW5wdXQ6IGFueSkgPT4ge1xuICAgICAgICBleHBlY3QoaW5wdXQuRmlsdGVyRXhwcmVzc2lvbikudG9Db250YWluKCcjc3RhdHVzID0gOnN0YXR1cycpO1xuICAgICAgICBleHBlY3QoaW5wdXQuRXhwcmVzc2lvbkF0dHJpYnV0ZU5hbWVzWycjc3RhdHVzJ10pLnRvQmUoJ3N0YXR1cycpO1xuICAgICAgICBleHBlY3QoaW5wdXQuRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlc1snOnN0YXR1cyddKS50b0JlKCdSZWFkeScpO1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHsgSXRlbXM6IFtdIH0pO1xuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBhcHBseSB0eXBlIGZpbHRlcicsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSwgeyB0eXBlOiAnU291bCBCbHVlcHJpbnQnIH0pO1xuXG4gICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgZHluYW1vTW9jay5vbihTY2FuQ29tbWFuZCkuY2FsbHNGYWtlKChpbnB1dDogYW55KSA9PiB7XG4gICAgICAgIGV4cGVjdChpbnB1dC5GaWx0ZXJFeHByZXNzaW9uKS50b0NvbnRhaW4oJyN0eXBlID0gOnR5cGUnKTtcbiAgICAgICAgZXhwZWN0KGlucHV0LkV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lc1snI3R5cGUnXSkudG9CZSgndHlwZScpO1xuICAgICAgICBleHBlY3QoaW5wdXQuRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlc1snOnR5cGUnXSkudG9CZSgnU291bCBCbHVlcHJpbnQnKTtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7IEl0ZW1zOiBbXSB9KTtcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIHBhZ2luYXRpb24gd2l0aCBsaW1pdCBhbmQgbGFzdEV2YWx1YXRlZEtleScsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGxhc3RLZXkgPSB7IHJlYWRpbmdJZDogJ3JlYWRpbmctMjUnLCB1c2VySWQ6ICd1c2VyLTI1JyB9O1xuICAgICAgY29uc3QgZW5jb2RlZEtleSA9IEJ1ZmZlci5mcm9tKEpTT04uc3RyaW5naWZ5KGxhc3RLZXkpKS50b1N0cmluZygnYmFzZTY0Jyk7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSwge1xuICAgICAgICBsaW1pdDogJzUwJyxcbiAgICAgICAgbGFzdEV2YWx1YXRlZEtleTogZW5jb2RlZEtleSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgZHluYW1vTW9jay5vbihTY2FuQ29tbWFuZCkuY2FsbHNGYWtlKChpbnB1dDogYW55KSA9PiB7XG4gICAgICAgIGV4cGVjdChpbnB1dC5MaW1pdCkudG9CZSg1MCk7XG4gICAgICAgIGV4cGVjdChpbnB1dC5FeGNsdXNpdmVTdGFydEtleSkudG9FcXVhbChsYXN0S2V5KTtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7IEl0ZW1zOiBbXSwgTGFzdEV2YWx1YXRlZEtleTogeyByZWFkaW5nSWQ6ICdyZWFkaW5nLTc1JyB9IH0pO1xuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuXG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5Lmxhc3RFdmFsdWF0ZWRLZXkpLnRvQmVEZWZpbmVkKCk7XG4gICAgICBjb25zdCBkZWNvZGVkS2V5ID0gSlNPTi5wYXJzZShCdWZmZXIuZnJvbShib2R5Lmxhc3RFdmFsdWF0ZWRLZXksICdiYXNlNjQnKS50b1N0cmluZygpKTtcbiAgICAgIGV4cGVjdChkZWNvZGVkS2V5KS50b0VxdWFsKHsgcmVhZGluZ0lkOiAncmVhZGluZy03NScgfSk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHVzZSBkZWZhdWx0IGxpbWl0IG9mIDI1IHdoZW4gbm90IHNwZWNpZmllZCcsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSk7XG5cbiAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICBkeW5hbW9Nb2NrLm9uKFNjYW5Db21tYW5kKS5jYWxsc0Zha2UoKGlucHV0OiBhbnkpID0+IHtcbiAgICAgICAgZXhwZWN0KGlucHV0LkxpbWl0KS50b0JlKDI1KTtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7IEl0ZW1zOiBbXSB9KTtcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ1VzZXIgc2VhcmNoJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgZmlsdGVyIHJlYWRpbmdzIGJ5IHVzZXIgZW1haWwgc2VhcmNoJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlLCB7IHVzZXJTZWFyY2g6ICd1c2VyMScgfSk7XG5cbiAgICAgIGNvbnN0IG1vY2tSZWFkaW5ncyA9IFtcbiAgICAgICAgeyByZWFkaW5nSWQ6ICdyZWFkaW5nLTEnLCB1c2VySWQ6ICd1c2VyLTEnIH0sXG4gICAgICAgIHsgcmVhZGluZ0lkOiAncmVhZGluZy0yJywgdXNlcklkOiAndXNlci0yJyB9LFxuICAgICAgICB7IHJlYWRpbmdJZDogJ3JlYWRpbmctMycsIHVzZXJJZDogJ3VzZXItMycgfSxcbiAgICAgIF07XG5cbiAgICAgIGR5bmFtb01vY2sub24oU2NhbkNvbW1hbmQpLnJlc29sdmVzKHsgSXRlbXM6IG1vY2tSZWFkaW5ncyB9KTtcbiAgICAgIGR5bmFtb01vY2tcbiAgICAgICAgLm9uKEdldENvbW1hbmQsIHsgS2V5OiB7IHVzZXJJZDogJ3VzZXItMScsIGNyZWF0ZWRBdDogJ1BST0ZJTEUnIH0gfSlcbiAgICAgICAgLnJlc29sdmVzKHsgSXRlbTogeyB1c2VySWQ6ICd1c2VyLTEnLCBlbWFpbDogJ3VzZXIxQGV4YW1wbGUuY29tJyB9IH0pO1xuICAgICAgZHluYW1vTW9ja1xuICAgICAgICAub24oR2V0Q29tbWFuZCwgeyBLZXk6IHsgdXNlcklkOiAndXNlci0yJywgY3JlYXRlZEF0OiAnUFJPRklMRScgfSB9KVxuICAgICAgICAucmVzb2x2ZXMoeyBJdGVtOiB7IHVzZXJJZDogJ3VzZXItMicsIGVtYWlsOiAndGVzdEBleGFtcGxlLmNvbScgfSB9KTtcbiAgICAgIGR5bmFtb01vY2tcbiAgICAgICAgLm9uKEdldENvbW1hbmQsIHsgS2V5OiB7IHVzZXJJZDogJ3VzZXItMycsIGNyZWF0ZWRBdDogJ1BST0ZJTEUnIH0gfSlcbiAgICAgICAgLnJlc29sdmVzKHsgSXRlbTogeyB1c2VySWQ6ICd1c2VyLTMnLCBlbWFpbDogJ2Fub3RoZXJAZXhhbXBsZS5jb20nIH0gfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LnJlYWRpbmdzKS50b0hhdmVMZW5ndGgoMSk7XG4gICAgICBleHBlY3QoYm9keS5yZWFkaW5nc1swXS5yZWFkaW5nSWQpLnRvQmUoJ3JlYWRpbmctMScpO1xuICAgICAgZXhwZWN0KGJvZHkucmVhZGluZ3NbMF0udXNlckVtYWlsKS50b0JlKCd1c2VyMUBleGFtcGxlLmNvbScpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgY2FzZS1pbnNlbnNpdGl2ZSB1c2VyIHNlYXJjaCcsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSwgeyB1c2VyU2VhcmNoOiAnVVNFUjEnIH0pO1xuXG4gICAgICBjb25zdCBtb2NrUmVhZGluZ3MgPSBbeyByZWFkaW5nSWQ6ICdyZWFkaW5nLTEnLCB1c2VySWQ6ICd1c2VyLTEnIH1dO1xuXG4gICAgICBkeW5hbW9Nb2NrLm9uKFNjYW5Db21tYW5kKS5yZXNvbHZlcyh7IEl0ZW1zOiBtb2NrUmVhZGluZ3MgfSk7XG4gICAgICBkeW5hbW9Nb2NrXG4gICAgICAgIC5vbihHZXRDb21tYW5kKVxuICAgICAgICAucmVzb2x2ZXMoeyBJdGVtOiB7IHVzZXJJZDogJ3VzZXItMScsIGVtYWlsOiAndXNlcjFAZXhhbXBsZS5jb20nIH0gfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkucmVhZGluZ3MpLnRvSGF2ZUxlbmd0aCgxKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIHVzZXJzIG5vdCBmb3VuZCBpbiB1c2VyIHRhYmxlJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlLCB7IHVzZXJTZWFyY2g6ICd0ZXN0JyB9KTtcblxuICAgICAgY29uc3QgbW9ja1JlYWRpbmdzID0gW1xuICAgICAgICB7IHJlYWRpbmdJZDogJ3JlYWRpbmctMScsIHVzZXJJZDogJ3VzZXItMScgfSxcbiAgICAgICAgeyByZWFkaW5nSWQ6ICdyZWFkaW5nLTInLCB1c2VySWQ6ICd1c2VyLTInIH0sXG4gICAgICBdO1xuXG4gICAgICBkeW5hbW9Nb2NrLm9uKFNjYW5Db21tYW5kKS5yZXNvbHZlcyh7IEl0ZW1zOiBtb2NrUmVhZGluZ3MgfSk7XG4gICAgICBkeW5hbW9Nb2NrXG4gICAgICAgIC5vbihHZXRDb21tYW5kLCB7IEtleTogeyB1c2VySWQ6ICd1c2VyLTEnLCBjcmVhdGVkQXQ6ICdQUk9GSUxFJyB9IH0pXG4gICAgICAgIC5yZXNvbHZlcyh7IEl0ZW06IHVuZGVmaW5lZCB9KTtcbiAgICAgIGR5bmFtb01vY2tcbiAgICAgICAgLm9uKEdldENvbW1hbmQsIHsgS2V5OiB7IHVzZXJJZDogJ3VzZXItMicsIGNyZWF0ZWRBdDogJ1BST0ZJTEUnIH0gfSlcbiAgICAgICAgLnJlc29sdmVzKHsgSXRlbTogeyB1c2VySWQ6ICd1c2VyLTInLCBlbWFpbDogJ3Rlc3RAZXhhbXBsZS5jb20nIH0gfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkucmVhZGluZ3MpLnRvSGF2ZUxlbmd0aCgxKTtcbiAgICAgIGV4cGVjdChib2R5LnJlYWRpbmdzWzBdLnJlYWRpbmdJZCkudG9CZSgncmVhZGluZy0yJyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHN0aWxsIGFkZCBlbWFpbHMgd2hlbiBubyB1c2VyIHNlYXJjaCBpcyBwcm92aWRlZCcsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSk7XG5cbiAgICAgIGNvbnN0IG1vY2tSZWFkaW5ncyA9IFtcbiAgICAgICAgeyByZWFkaW5nSWQ6ICdyZWFkaW5nLTEnLCB1c2VySWQ6ICd1c2VyLTEnIH0sXG4gICAgICAgIHsgcmVhZGluZ0lkOiAncmVhZGluZy0yJywgdXNlcklkOiAndXNlci0yJyB9LFxuICAgICAgXTtcblxuICAgICAgZHluYW1vTW9jay5vbihTY2FuQ29tbWFuZCkucmVzb2x2ZXMoeyBJdGVtczogbW9ja1JlYWRpbmdzIH0pO1xuICAgICAgZHluYW1vTW9ja1xuICAgICAgICAub24oR2V0Q29tbWFuZCwgeyBLZXk6IHsgdXNlcklkOiAndXNlci0xJywgY3JlYXRlZEF0OiAnUFJPRklMRScgfSB9KVxuICAgICAgICAucmVzb2x2ZXMoeyBJdGVtOiB7IHVzZXJJZDogJ3VzZXItMScsIGVtYWlsOiAndXNlcjFAZXhhbXBsZS5jb20nIH0gfSk7XG4gICAgICBkeW5hbW9Nb2NrXG4gICAgICAgIC5vbihHZXRDb21tYW5kLCB7IEtleTogeyB1c2VySWQ6ICd1c2VyLTInLCBjcmVhdGVkQXQ6ICdQUk9GSUxFJyB9IH0pXG4gICAgICAgIC5yZXNvbHZlcyh7IEl0ZW06IHsgdXNlcklkOiAndXNlci0yJywgZW1haWw6ICd1c2VyMkBleGFtcGxlLmNvbScgfSB9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5yZWFkaW5ncykudG9IYXZlTGVuZ3RoKDIpO1xuICAgICAgZXhwZWN0KGJvZHkucmVhZGluZ3NbMF0udXNlckVtYWlsKS50b0JlKCd1c2VyMUBleGFtcGxlLmNvbScpO1xuICAgICAgZXhwZWN0KGJvZHkucmVhZGluZ3NbMV0udXNlckVtYWlsKS50b0JlKCd1c2VyMkBleGFtcGxlLmNvbScpO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnRXJyb3IgaGFuZGxpbmcnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgRHluYW1vREIgc2NhbiBlcnJvcnMnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUpO1xuXG4gICAgICBkeW5hbW9Nb2NrLm9uKFNjYW5Db21tYW5kKS5yZWplY3RzKG5ldyBFcnJvcignRHluYW1vREIgZXJyb3InKSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDUwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LmVycm9yKS50b0JlKCdJbnRlcm5hbCBzZXJ2ZXIgZXJyb3InKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgbG9nIGVycm9ycyB0byBjb25zb2xlJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgY29uc29sZUVycm9yU3B5ID0gamVzdC5zcHlPbihjb25zb2xlLCAnZXJyb3InKS5tb2NrSW1wbGVtZW50YXRpb24oKTtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSk7XG5cbiAgICAgIGNvbnN0IGVycm9yID0gbmV3IEVycm9yKCdUZXN0IGVycm9yJyk7XG4gICAgICBkeW5hbW9Nb2NrLm9uKFNjYW5Db21tYW5kKS5yZWplY3RzKGVycm9yKTtcblxuICAgICAgYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChjb25zb2xlRXJyb3JTcHkpLnRvSGF2ZUJlZW5DYWxsZWRXaXRoKCdFcnJvcjonLCBlcnJvcik7XG4gICAgICBjb25zb2xlRXJyb3JTcHkubW9ja1Jlc3RvcmUoKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgd2FybiB3aGVuIHVzZXIgZmV0Y2ggZmFpbHMgYnV0IGNvbnRpbnVlIHByb2Nlc3NpbmcnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBjb25zb2xlV2FyblNweSA9IGplc3Quc3B5T24oY29uc29sZSwgJ3dhcm4nKS5tb2NrSW1wbGVtZW50YXRpb24oKTtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSk7XG5cbiAgICAgIGNvbnN0IG1vY2tSZWFkaW5ncyA9IFt7IHJlYWRpbmdJZDogJ3JlYWRpbmctMScsIHVzZXJJZDogJ3VzZXItMScgfV07XG5cbiAgICAgIGR5bmFtb01vY2sub24oU2NhbkNvbW1hbmQpLnJlc29sdmVzKHsgSXRlbXM6IG1vY2tSZWFkaW5ncyB9KTtcbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVqZWN0cyhuZXcgRXJyb3IoJ1VzZXIgbm90IGZvdW5kJykpO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgZXhwZWN0KGNvbnNvbGVXYXJuU3B5KS50b0hhdmVCZWVuQ2FsbGVkV2l0aChcbiAgICAgICAgJ0ZhaWxlZCB0byBmZXRjaCB1c2VyIHVzZXItMTonLFxuICAgICAgICBleHBlY3QuYW55KEVycm9yKSxcbiAgICAgICk7XG5cbiAgICAgIGNvbnNvbGVXYXJuU3B5Lm1vY2tSZXN0b3JlKCk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdSZXNwb25zZSBmb3JtYXQnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBpbmNsdWRlIENPUlMgaGVhZGVycycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSk7XG5cbiAgICAgIGR5bmFtb01vY2sub24oU2NhbkNvbW1hbmQpLnJlc29sdmVzKHsgSXRlbXM6IFtdIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2UuaGVhZGVycykudG9FcXVhbCh7XG4gICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgcmV0dXJuIHByb3BlciByZXNwb25zZSBzdHJ1Y3R1cmUnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUpO1xuXG4gICAgICBjb25zdCBtb2NrUmVhZGluZ3MgPSBbeyByZWFkaW5nSWQ6ICdyZWFkaW5nLTEnLCB1c2VySWQ6ICd1c2VyLTEnIH1dO1xuXG4gICAgICBkeW5hbW9Nb2NrLm9uKFNjYW5Db21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIEl0ZW1zOiBtb2NrUmVhZGluZ3MsXG4gICAgICAgIExhc3RFdmFsdWF0ZWRLZXk6IHsgcmVhZGluZ0lkOiAncmVhZGluZy0xJyB9LFxuICAgICAgfSk7XG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgSXRlbTogeyB1c2VySWQ6ICd1c2VyLTEnLCBlbWFpbDogJ3VzZXIxQGV4YW1wbGUuY29tJyB9LFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5KS50b0hhdmVQcm9wZXJ0eSgncmVhZGluZ3MnKTtcbiAgICAgIGV4cGVjdChib2R5KS50b0hhdmVQcm9wZXJ0eSgnY291bnQnKTtcbiAgICAgIGV4cGVjdChib2R5KS50b0hhdmVQcm9wZXJ0eSgnbGFzdEV2YWx1YXRlZEtleScpO1xuICAgICAgZXhwZWN0KEFycmF5LmlzQXJyYXkoYm9keS5yZWFkaW5ncykpLnRvQmUodHJ1ZSk7XG4gICAgICBleHBlY3QodHlwZW9mIGJvZHkuY291bnQpLnRvQmUoJ251bWJlcicpO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnTXVsdGlwbGUgZmlsdGVycycsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGNvbWJpbmUgbXVsdGlwbGUgZmlsdGVycyB3aXRoIEFORCcsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSwge1xuICAgICAgICBzdGFydERhdGU6ICcyMDI0LTAxLTAxJyxcbiAgICAgICAgZW5kRGF0ZTogJzIwMjQtMDEtMzEnLFxuICAgICAgICBzdGF0dXM6ICdSZWFkeScsXG4gICAgICAgIHR5cGU6ICdTb3VsIEJsdWVwcmludCcsXG4gICAgICB9KTtcblxuICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgIGR5bmFtb01vY2sub24oU2NhbkNvbW1hbmQpLmNhbGxzRmFrZSgoaW5wdXQ6IGFueSkgPT4ge1xuICAgICAgICBleHBlY3QoaW5wdXQuRmlsdGVyRXhwcmVzc2lvbikudG9Db250YWluKCcgQU5EICcpO1xuICAgICAgICBleHBlY3QoaW5wdXQuRmlsdGVyRXhwcmVzc2lvbikudG9Db250YWluKCdjcmVhdGVkQXQgPj0gOnN0YXJ0RGF0ZScpO1xuICAgICAgICBleHBlY3QoaW5wdXQuRmlsdGVyRXhwcmVzc2lvbikudG9Db250YWluKCdjcmVhdGVkQXQgPD0gOmVuZERhdGUnKTtcbiAgICAgICAgZXhwZWN0KGlucHV0LkZpbHRlckV4cHJlc3Npb24pLnRvQ29udGFpbignI3N0YXR1cyA9IDpzdGF0dXMnKTtcbiAgICAgICAgZXhwZWN0KGlucHV0LkZpbHRlckV4cHJlc3Npb24pLnRvQ29udGFpbignI3R5cGUgPSA6dHlwZScpO1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHsgSXRlbXM6IFtdIH0pO1xuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnTG9nZ2luZycsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGxvZyBpbmNvbWluZyBldmVudCcsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGNvbnNvbGVJbmZvU3B5ID0gamVzdC5zcHlPbihjb25zb2xlLCAnaW5mbycpLm1vY2tJbXBsZW1lbnRhdGlvbigpO1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlKTtcblxuICAgICAgZHluYW1vTW9jay5vbihTY2FuQ29tbWFuZCkucmVzb2x2ZXMoeyBJdGVtczogW10gfSk7XG5cbiAgICAgIGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QoY29uc29sZUluZm9TcHkpLnRvSGF2ZUJlZW5DYWxsZWRXaXRoKCdHZXQgYWxsIHJlYWRpbmdzIGV2ZW50OicsIGV4cGVjdC5hbnkoU3RyaW5nKSk7XG5cbiAgICAgIGNvbnNvbGVJbmZvU3B5Lm1vY2tSZXN0b3JlKCk7XG4gICAgfSk7XG4gIH0pO1xufSk7XG4iXX0=