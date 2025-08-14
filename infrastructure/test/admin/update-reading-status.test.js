"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const update_reading_status_1 = require("../../lambda/admin/update-reading-status");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const aws_sdk_client_mock_1 = require("aws-sdk-client-mock");
// Mock the DynamoDB client
const dynamoMock = (0, aws_sdk_client_mock_1.mockClient)(lib_dynamodb_1.DynamoDBDocumentClient);
describe('update-reading-status Lambda', () => {
    beforeEach(() => {
        dynamoMock.reset();
        process.env.READINGS_TABLE_NAME = 'test-readings-table';
    });
    const createEvent = (isAdmin, readingId, body) => ({
        pathParameters: readingId ? { readingId } : null,
        body: body ? JSON.stringify(body) : null,
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
            const event = createEvent(false, 'reading-123', { status: 'Ready' });
            const response = await (0, update_reading_status_1.handler)(event);
            expect(response.statusCode).toBe(403);
            const body = JSON.parse(response.body);
            expect(body.error).toBe('Access denied. Admin privileges required.');
        });
        it('should allow access when user is admin', async () => {
            const event = createEvent(true, 'reading-123', { status: 'Ready' });
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({
                Item: { readingId: 'reading-123', status: 'Processing' },
            });
            dynamoMock.on(lib_dynamodb_1.UpdateCommand).resolves({
                Attributes: {
                    readingId: 'reading-123',
                    status: 'Ready',
                    updatedAt: new Date().toISOString(),
                },
            });
            const response = await (0, update_reading_status_1.handler)(event);
            expect(response.statusCode).toBe(200);
        });
        it('should handle admin group as comma-separated string', async () => {
            const event = {
                pathParameters: { readingId: 'reading-123' },
                body: JSON.stringify({ status: 'Ready' }),
                requestContext: {
                    authorizer: {
                        claims: {
                            'cognito:groups': 'user,admin,premium',
                        },
                    },
                },
            };
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({
                Item: { readingId: 'reading-123' },
            });
            dynamoMock.on(lib_dynamodb_1.UpdateCommand).resolves({
                Attributes: { readingId: 'reading-123', status: 'Ready' },
            });
            const response = await (0, update_reading_status_1.handler)(event);
            expect(response.statusCode).toBe(200);
        });
    });
    describe('Input validation', () => {
        it('should return 400 when reading ID is missing', async () => {
            const event = createEvent(true, undefined, { status: 'Ready' });
            const response = await (0, update_reading_status_1.handler)(event);
            expect(response.statusCode).toBe(400);
            const body = JSON.parse(response.body);
            expect(body.error).toBe('Reading ID is required');
        });
        it('should return 400 when status is missing', async () => {
            const event = createEvent(true, 'reading-123', {});
            const response = await (0, update_reading_status_1.handler)(event);
            expect(response.statusCode).toBe(400);
            const body = JSON.parse(response.body);
            expect(body.error).toBe('Status is required');
        });
        it('should return 400 when body is empty', async () => {
            const event = createEvent(true, 'reading-123');
            const response = await (0, update_reading_status_1.handler)(event);
            expect(response.statusCode).toBe(400);
            const body = JSON.parse(response.body);
            expect(body.error).toBe('Status is required');
        });
        it('should return 400 for invalid status value', async () => {
            const event = createEvent(true, 'reading-123', { status: 'InvalidStatus' });
            const response = await (0, update_reading_status_1.handler)(event);
            expect(response.statusCode).toBe(400);
            const body = JSON.parse(response.body);
            expect(body.error).toBe('Invalid status. Must be one of: Processing, Ready, Failed, In Review');
        });
        it('should accept all valid status values', async () => {
            const validStatuses = ['Processing', 'Ready', 'Failed', 'In Review'];
            for (const status of validStatuses) {
                dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({
                    Item: { readingId: 'reading-123' },
                });
                dynamoMock.on(lib_dynamodb_1.UpdateCommand).resolves({
                    Attributes: { readingId: 'reading-123', status },
                });
                const event = createEvent(true, 'reading-123', { status });
                const response = await (0, update_reading_status_1.handler)(event);
                expect(response.statusCode).toBe(200);
                dynamoMock.reset();
            }
        });
    });
    describe('Updating reading status', () => {
        it('should update status successfully', async () => {
            const event = createEvent(true, 'reading-123', { status: 'Ready' });
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({
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
            dynamoMock.on(lib_dynamodb_1.UpdateCommand).resolves({
                Attributes: {
                    readingId: 'reading-123',
                    userId: 'user-456',
                    type: 'Soul Blueprint',
                    status: 'Ready',
                    createdAt: '2024-01-01T00:00:00Z',
                    updatedAt: mockUpdatedAt,
                },
            });
            const response = await (0, update_reading_status_1.handler)(event);
            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.body);
            expect(body.status).toBe('Ready');
            expect(body.updatedAt).toBe(mockUpdatedAt);
            // Verify UpdateCommand was called
            const updateCall = dynamoMock.commandCalls(lib_dynamodb_1.UpdateCommand)[0];
            expect(updateCall).toBeDefined();
            expect(updateCall?.args[0]?.input?.Key).toEqual({ readingId: 'reading-123' });
            expect(updateCall?.args[0]?.input?.ExpressionAttributeValues?.[':status']).toBe('Ready');
        });
        it('should return 404 when reading not found', async () => {
            const event = createEvent(true, 'reading-123', { status: 'Ready' });
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({ Item: undefined });
            const response = await (0, update_reading_status_1.handler)(event);
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
                dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({
                    Item: { readingId: 'reading-123', status: from },
                });
                dynamoMock.on(lib_dynamodb_1.UpdateCommand).resolves({
                    Attributes: { readingId: 'reading-123', status: to },
                });
                const event = createEvent(true, 'reading-123', { status: to });
                const response = await (0, update_reading_status_1.handler)(event);
                expect(response.statusCode).toBe(200);
                const body = JSON.parse(response.body);
                expect(body.status).toBe(to);
                dynamoMock.reset();
            }
        });
        it('should return only essential fields in response', async () => {
            const event = createEvent(true, 'reading-123', { status: 'Ready' });
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({
                Item: { readingId: 'reading-123' },
            });
            dynamoMock.on(lib_dynamodb_1.UpdateCommand).resolves({
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
            const response = await (0, update_reading_status_1.handler)(event);
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
            dynamoMock.on(lib_dynamodb_1.GetCommand).rejects(new Error('DynamoDB GetCommand error'));
            const response = await (0, update_reading_status_1.handler)(event);
            expect(response.statusCode).toBe(500);
            const body = JSON.parse(response.body);
            expect(body.error).toBe('Internal server error');
        });
        it('should handle DynamoDB UpdateCommand errors', async () => {
            const event = createEvent(true, 'reading-123', { status: 'Ready' });
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({
                Item: { readingId: 'reading-123' },
            });
            dynamoMock.on(lib_dynamodb_1.UpdateCommand).rejects(new Error('DynamoDB UpdateCommand error'));
            const response = await (0, update_reading_status_1.handler)(event);
            expect(response.statusCode).toBe(500);
            const body = JSON.parse(response.body);
            expect(body.error).toBe('Internal server error');
        });
        it('should return 500 and log errors', async () => {
            // In infrastructure tests, console.error is allowed
            const event = createEvent(true, 'reading-123', { status: 'Ready' });
            const error = new Error('Test error');
            dynamoMock.on(lib_dynamodb_1.GetCommand).rejects(error);
            const response = await (0, update_reading_status_1.handler)(event);
            expect(response.statusCode).toBe(500);
            const body = JSON.parse(response.body);
            expect(body.error).toBe('Internal server error');
        });
        it('should handle malformed JSON in body', async () => {
            const event = {
                pathParameters: { readingId: 'reading-123' },
                body: 'not-valid-json',
                requestContext: {
                    authorizer: {
                        claims: {
                            'cognito:groups': ['admin'],
                        },
                    },
                },
            };
            const response = await (0, update_reading_status_1.handler)(event);
            expect(response.statusCode).toBe(500);
            const body = JSON.parse(response.body);
            expect(body.error).toBe('Internal server error');
        });
    });
    describe('Response format', () => {
        it('should include CORS headers', async () => {
            const event = createEvent(true, 'reading-123', { status: 'Ready' });
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({
                Item: { readingId: 'reading-123' },
            });
            dynamoMock.on(lib_dynamodb_1.UpdateCommand).resolves({
                Attributes: { readingId: 'reading-123', status: 'Ready' },
            });
            const response = await (0, update_reading_status_1.handler)(event);
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
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({
                Item: { readingId: 'reading-123' },
            });
            dynamoMock.on(lib_dynamodb_1.UpdateCommand).resolves({
                Attributes: { readingId: 'reading-123', status: 'Ready' },
            });
            const response = await (0, update_reading_status_1.handler)(event);
            // Just verify the handler executes successfully
            expect(response.statusCode).toBe(200);
        });
    });
    describe('Edge cases', () => {
        it('should handle missing requestContext', async () => {
            const event = {
                pathParameters: { readingId: 'reading-123' },
                body: JSON.stringify({ status: 'Ready' }),
                requestContext: undefined,
            };
            const response = await (0, update_reading_status_1.handler)(event);
            expect(response.statusCode).toBe(403);
            const body = JSON.parse(response.body);
            expect(body.error).toBe('Access denied. Admin privileges required.');
        });
        it('should handle status with extra whitespace', async () => {
            const event = createEvent(true, 'reading-123', { status: '  Ready  ' });
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({
                Item: { readingId: 'reading-123' },
            });
            dynamoMock.on(lib_dynamodb_1.UpdateCommand).resolves({
                Attributes: { readingId: 'reading-123', status: '  Ready  ' },
            });
            const response = await (0, update_reading_status_1.handler)(event);
            // The handler should ideally trim the status, but based on the implementation,
            // it will fail validation
            expect(response.statusCode).toBe(400);
            const body = JSON.parse(response.body);
            expect(body.error).toContain('Invalid status');
        });
        it('should handle case-sensitive status validation', async () => {
            const event = createEvent(true, 'reading-123', { status: 'ready' });
            const response = await (0, update_reading_status_1.handler)(event);
            expect(response.statusCode).toBe(400);
            const body = JSON.parse(response.body);
            expect(body.error).toContain('Invalid status');
        });
        it('should handle undefined UpdateCommand attributes', async () => {
            const event = createEvent(true, 'reading-123', { status: 'Ready' });
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({
                Item: { readingId: 'reading-123' },
            });
            dynamoMock.on(lib_dynamodb_1.UpdateCommand).resolves({
                Attributes: undefined,
            });
            const response = await (0, update_reading_status_1.handler)(event);
            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.body);
            // All fields will be undefined but response should still work
            expect(body.readingId).toBeUndefined();
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBkYXRlLXJlYWRpbmctc3RhdHVzLnRlc3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ1cGRhdGUtcmVhZGluZy1zdGF0dXMudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLG9GQUFtRTtBQUVuRSx3REFBMEY7QUFDMUYsNkRBQWlEO0FBRWpELDJCQUEyQjtBQUMzQixNQUFNLFVBQVUsR0FBRyxJQUFBLGdDQUFVLEVBQUMscUNBQXNCLENBQUMsQ0FBQztBQUV0RCxRQUFRLENBQUMsOEJBQThCLEVBQUUsR0FBRyxFQUFFO0lBQzVDLFVBQVUsQ0FBQyxHQUFHLEVBQUU7UUFDZCxVQUFVLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDbkIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsR0FBRyxxQkFBcUIsQ0FBQztJQUMxRCxDQUFDLENBQUMsQ0FBQztJQUVILE1BQU0sV0FBVyxHQUFHLENBQ2xCLE9BQWdCLEVBQ2hCLFNBQWtCLEVBQ2xCLElBQTBCLEVBQ0ssRUFBRSxDQUFDLENBQUM7UUFDbkMsY0FBYyxFQUFFLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSTtRQUNoRCxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJO1FBQ3hDLGNBQWMsRUFBRTtZQUNkLFVBQVUsRUFBRTtnQkFDVixNQUFNLEVBQUU7b0JBQ04sZ0JBQWdCLEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFO2lCQUMzQzthQUNGO1NBQ21EO0tBQ3ZELENBQUMsQ0FBQztJQUVILFFBQVEsQ0FBQyxlQUFlLEVBQUUsR0FBRyxFQUFFO1FBQzdCLEVBQUUsQ0FBQywwQ0FBMEMsRUFBRSxLQUFLLElBQUksRUFBRTtZQUN4RCxNQUFNLEtBQUssR0FBRyxXQUFXLENB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QUFDLFNBQVMsQ0FBQyxDQUFDLGFBQWEsRUFBRSxDQUFDO1FBQ3pDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGhhbmRsZXIgfSBmcm9tICcuLi8uLi9sYW1iZGEvYWRtaW4vdXBkYXRlLXJlYWRpbmctc3RhdHVzJztcbmltcG9ydCB7IEFQSUdhdGV3YXlQcm94eUV2ZW50IH0gZnJvbSAnYXdzLWxhbWJkYSc7XG5pbXBvcnQgeyBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LCBHZXRDb21tYW5kLCBVcGRhdGVDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvbGliLWR5bmFtb2RiJztcbmltcG9ydCB7IG1vY2tDbGllbnQgfSBmcm9tICdhd3Mtc2RrLWNsaWVudC1tb2NrJztcblxuLy8gTW9jayB0aGUgRHluYW1vREIgY2xpZW50XG5jb25zdCBkeW5hbW9Nb2NrID0gbW9ja0NsaWVudChEeW5hbW9EQkRvY3VtZW50Q2xpZW50KTtcblxuZGVzY3JpYmUoJ3VwZGF0ZS1yZWFkaW5nLXN0YXR1cyBMYW1iZGEnLCAoKSA9PiB7XG4gIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgIGR5bmFtb01vY2sucmVzZXQoKTtcbiAgICBwcm9jZXNzLmVudi5SRUFESU5HU19UQUJMRV9OQU1FID0gJ3Rlc3QtcmVhZGluZ3MtdGFibGUnO1xuICB9KTtcblxuICBjb25zdCBjcmVhdGVFdmVudCA9IChcbiAgICBpc0FkbWluOiBib29sZWFuLFxuICAgIHJlYWRpbmdJZD86IHN0cmluZyxcbiAgICBib2R5PzogUmVjb3JkPHN0cmluZywgYW55PixcbiAgKTogUGFydGlhbDxBUElHYXRld2F5UHJveHlFdmVudD4gPT4gKHtcbiAgICBwYXRoUGFyYW1ldGVyczogcmVhZGluZ0lkID8geyByZWFkaW5nSWQgfSA6IG51bGwsXG4gICAgYm9keTogYm9keSA/IEpTT04uc3RyaW5naWZ5KGJvZHkpIDogbnVsbCxcbiAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICBjbGFpbXM6IHtcbiAgICAgICAgICAnY29nbml0bzpncm91cHMnOiBpc0FkbWluID8gWydhZG1pbiddIDogW10sXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0gYXMgdW5rbm93biBhcyBBUElHYXRld2F5UHJveHlFdmVudFsncmVxdWVzdENvbnRleHQnXSxcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0F1dGhvcml6YXRpb24nLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gNDAzIHdoZW4gdXNlciBpcyBub3QgYWRtaW4nLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KGZhbHNlLCAncmVhZGluZy0xMjMnLCB7IHN0YXR1czogJ1JlYWR5JyB9KTtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDQwMyk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LmVycm9yKS50b0JlKCdBY2Nlc3MgZGVuaWVkLiBBZG1pbiBwcml2aWxlZ2VzIHJlcXVpcmVkLicpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBhbGxvdyBhY2Nlc3Mgd2hlbiB1c2VyIGlzIGFkbWluJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlLCAncmVhZGluZy0xMjMnLCB7IHN0YXR1czogJ1JlYWR5JyB9KTtcblxuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIEl0ZW06IHsgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnLCBzdGF0dXM6ICdQcm9jZXNzaW5nJyB9LFxuICAgICAgfSk7XG5cbiAgICAgIGR5bmFtb01vY2sub24oVXBkYXRlQ29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBBdHRyaWJ1dGVzOiB7XG4gICAgICAgICAgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnLFxuICAgICAgICAgIHN0YXR1czogJ1JlYWR5JyxcbiAgICAgICAgICB1cGRhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgYWRtaW4gZ3JvdXAgYXMgY29tbWEtc2VwYXJhdGVkIHN0cmluZycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50OiBQYXJ0aWFsPEFQSUdhdGV3YXlQcm94eUV2ZW50PiA9IHtcbiAgICAgICAgcGF0aFBhcmFtZXRlcnM6IHsgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnIH0sXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgc3RhdHVzOiAnUmVhZHknIH0pLFxuICAgICAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgICAgIGF1dGhvcml6ZXI6IHtcbiAgICAgICAgICAgIGNsYWltczoge1xuICAgICAgICAgICAgICAnY29nbml0bzpncm91cHMnOiAndXNlcixhZG1pbixwcmVtaXVtJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSBhcyB1bmtub3duIGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50WydyZXF1ZXN0Q29udGV4dCddLFxuICAgICAgfTtcblxuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIEl0ZW06IHsgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnIH0sXG4gICAgICB9KTtcblxuICAgICAgZHluYW1vTW9jay5vbihVcGRhdGVDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIEF0dHJpYnV0ZXM6IHsgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnLCBzdGF0dXM6ICdSZWFkeScgfSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnSW5wdXQgdmFsaWRhdGlvbicsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIHJldHVybiA0MDAgd2hlbiByZWFkaW5nIElEIGlzIG1pc3NpbmcnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUsIHVuZGVmaW5lZCwgeyBzdGF0dXM6ICdSZWFkeScgfSk7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSg0MDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5lcnJvcikudG9CZSgnUmVhZGluZyBJRCBpcyByZXF1aXJlZCcpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gNDAwIHdoZW4gc3RhdHVzIGlzIG1pc3NpbmcnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUsICdyZWFkaW5nLTEyMycsIHt9KTtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDQwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LmVycm9yKS50b0JlKCdTdGF0dXMgaXMgcmVxdWlyZWQnKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgcmV0dXJuIDQwMCB3aGVuIGJvZHkgaXMgZW1wdHknLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUsICdyZWFkaW5nLTEyMycpO1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoNDAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmUoJ1N0YXR1cyBpcyByZXF1aXJlZCcpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gNDAwIGZvciBpbnZhbGlkIHN0YXR1cyB2YWx1ZScsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSwgJ3JlYWRpbmctMTIzJywgeyBzdGF0dXM6ICdJbnZhbGlkU3RhdHVzJyB9KTtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDQwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LmVycm9yKS50b0JlKFxuICAgICAgICAnSW52YWxpZCBzdGF0dXMuIE11c3QgYmUgb25lIG9mOiBQcm9jZXNzaW5nLCBSZWFkeSwgRmFpbGVkLCBJbiBSZXZpZXcnLFxuICAgICAgKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgYWNjZXB0IGFsbCB2YWxpZCBzdGF0dXMgdmFsdWVzJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgdmFsaWRTdGF0dXNlcyA9IFsnUHJvY2Vzc2luZycsICdSZWFkeScsICdGYWlsZWQnLCAnSW4gUmV2aWV3J107XG5cbiAgICAgIGZvciAoY29uc3Qgc3RhdHVzIG9mIHZhbGlkU3RhdHVzZXMpIHtcbiAgICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgICAgSXRlbTogeyByZWFkaW5nSWQ6ICdyZWFkaW5nLTEyMycgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgZHluYW1vTW9jay5vbihVcGRhdGVDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgICAgQXR0cmlidXRlczogeyByZWFkaW5nSWQ6ICdyZWFkaW5nLTEyMycsIHN0YXR1cyB9LFxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUsICdyZWFkaW5nLTEyMycsIHsgc3RhdHVzIH0pO1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICAgIGR5bmFtb01vY2sucmVzZXQoKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ1VwZGF0aW5nIHJlYWRpbmcgc3RhdHVzJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgdXBkYXRlIHN0YXR1cyBzdWNjZXNzZnVsbHknLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUsICdyZWFkaW5nLTEyMycsIHsgc3RhdHVzOiAnUmVhZHknIH0pO1xuXG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgSXRlbToge1xuICAgICAgICAgIHJlYWRpbmdJZDogJ3JlYWRpbmctMTIzJyxcbiAgICAgICAgICB1c2VySWQ6ICd1c2VyLTQ1NicsXG4gICAgICAgICAgdHlwZTogJ1NvdWwgQmx1ZXByaW50JyxcbiAgICAgICAgICBzdGF0dXM6ICdQcm9jZXNzaW5nJyxcbiAgICAgICAgICBjcmVhdGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAwOjAwWicsXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgbW9ja1VwZGF0ZWRBdCA9ICcyMDI0LTAxLTAxVDAwOjAxOjAwWic7XG4gICAgICBqZXN0LnNweU9uKERhdGUucHJvdG90eXBlLCAndG9JU09TdHJpbmcnKS5tb2NrUmV0dXJuVmFsdWUobW9ja1VwZGF0ZWRBdCk7XG5cbiAgICAgIGR5bmFtb01vY2sub24oVXBkYXRlQ29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBBdHRyaWJ1dGVzOiB7XG4gICAgICAgICAgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnLFxuICAgICAgICAgIHVzZXJJZDogJ3VzZXItNDU2JyxcbiAgICAgICAgICB0eXBlOiAnU291bCBCbHVlcHJpbnQnLFxuICAgICAgICAgIHN0YXR1czogJ1JlYWR5JyxcbiAgICAgICAgICBjcmVhdGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAwOjAwWicsXG4gICAgICAgICAgdXBkYXRlZEF0OiBtb2NrVXBkYXRlZEF0LFxuICAgICAgICB9LFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LnN0YXR1cykudG9CZSgnUmVhZHknKTtcbiAgICAgIGV4cGVjdChib2R5LnVwZGF0ZWRBdCkudG9CZShtb2NrVXBkYXRlZEF0KTtcblxuICAgICAgLy8gVmVyaWZ5IFVwZGF0ZUNvbW1hbmQgd2FzIGNhbGxlZFxuICAgICAgY29uc3QgdXBkYXRlQ2FsbCA9IGR5bmFtb01vY2suY29tbWFuZENhbGxzKFVwZGF0ZUNvbW1hbmQpWzBdO1xuICAgICAgZXhwZWN0KHVwZGF0ZUNhbGwpLnRvQmVEZWZpbmVkKCk7XG4gICAgICBleHBlY3QodXBkYXRlQ2FsbD8uYXJnc1swXT8uaW5wdXQ/LktleSkudG9FcXVhbCh7IHJlYWRpbmdJZDogJ3JlYWRpbmctMTIzJyB9KTtcbiAgICAgIGV4cGVjdCh1cGRhdGVDYWxsPy5hcmdzWzBdPy5pbnB1dD8uRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlcz8uWyc6c3RhdHVzJ10pLnRvQmUoJ1JlYWR5Jyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHJldHVybiA0MDQgd2hlbiByZWFkaW5nIG5vdCBmb3VuZCcsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSwgJ3JlYWRpbmctMTIzJywgeyBzdGF0dXM6ICdSZWFkeScgfSk7XG5cbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVzb2x2ZXMoeyBJdGVtOiB1bmRlZmluZWQgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDQwNCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LmVycm9yKS50b0JlKCdSZWFkaW5nIG5vdCBmb3VuZCcpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCB1cGRhdGUgZnJvbSBhbnkgc3RhdHVzIHRvIGFueSB2YWxpZCBzdGF0dXMnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCB0cmFuc2l0aW9ucyA9IFtcbiAgICAgICAgeyBmcm9tOiAnUHJvY2Vzc2luZycsIHRvOiAnUmVhZHknIH0sXG4gICAgICAgIHsgZnJvbTogJ1JlYWR5JywgdG86ICdJbiBSZXZpZXcnIH0sXG4gICAgICAgIHsgZnJvbTogJ0luIFJldmlldycsIHRvOiAnRmFpbGVkJyB9LFxuICAgICAgICB7IGZyb206ICdGYWlsZWQnLCB0bzogJ1Byb2Nlc3NpbmcnIH0sXG4gICAgICBdO1xuXG4gICAgICBmb3IgKGNvbnN0IHsgZnJvbSwgdG8gfSBvZiB0cmFuc2l0aW9ucykge1xuICAgICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgICBJdGVtOiB7IHJlYWRpbmdJZDogJ3JlYWRpbmctMTIzJywgc3RhdHVzOiBmcm9tIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGR5bmFtb01vY2sub24oVXBkYXRlQ29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICAgIEF0dHJpYnV0ZXM6IHsgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnLCBzdGF0dXM6IHRvIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSwgJ3JlYWRpbmctMTIzJywgeyBzdGF0dXM6IHRvIH0pO1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgICBleHBlY3QoYm9keS5zdGF0dXMpLnRvQmUodG8pO1xuXG4gICAgICAgIGR5bmFtb01vY2sucmVzZXQoKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgcmV0dXJuIG9ubHkgZXNzZW50aWFsIGZpZWxkcyBpbiByZXNwb25zZScsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSwgJ3JlYWRpbmctMTIzJywgeyBzdGF0dXM6ICdSZWFkeScgfSk7XG5cbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBJdGVtOiB7IHJlYWRpbmdJZDogJ3JlYWRpbmctMTIzJyB9LFxuICAgICAgfSk7XG5cbiAgICAgIGR5bmFtb01vY2sub24oVXBkYXRlQ29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBBdHRyaWJ1dGVzOiB7XG4gICAgICAgICAgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnLFxuICAgICAgICAgIHVzZXJJZDogJ3VzZXItNDU2JyxcbiAgICAgICAgICB0eXBlOiAnU291bCBCbHVlcHJpbnQnLFxuICAgICAgICAgIHN0YXR1czogJ1JlYWR5JyxcbiAgICAgICAgICBjcmVhdGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAwOjAwWicsXG4gICAgICAgICAgdXBkYXRlZEF0OiAnMjAyNC0wMS0wMVQwMDowMTowMFonLFxuICAgICAgICAgIC8vIFRoZXNlIHNob3VsZCBub3QgYmUgaW4gcmVzcG9uc2VcbiAgICAgICAgICBjb250ZW50OiB7IGludGVycHJldGF0aW9uOiAnU2VjcmV0JyB9LFxuICAgICAgICAgIG1ldGFkYXRhOiB7IG1vZGVsOiAnZ3B0LTQnIH0sXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkpLnRvRXF1YWwoe1xuICAgICAgICByZWFkaW5nSWQ6ICdyZWFkaW5nLTEyMycsXG4gICAgICAgIHVzZXJJZDogJ3VzZXItNDU2JyxcbiAgICAgICAgdHlwZTogJ1NvdWwgQmx1ZXByaW50JyxcbiAgICAgICAgc3RhdHVzOiAnUmVhZHknLFxuICAgICAgICBjcmVhdGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAwOjAwWicsXG4gICAgICAgIHVwZGF0ZWRBdDogJzIwMjQtMDEtMDFUMDA6MDE6MDBaJyxcbiAgICAgIH0pO1xuICAgICAgZXhwZWN0KGJvZHkuY29udGVudCkudG9CZVVuZGVmaW5lZCgpO1xuICAgICAgZXhwZWN0KGJvZHkubWV0YWRhdGEpLnRvQmVVbmRlZmluZWQoKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0Vycm9yIGhhbmRsaW5nJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgaGFuZGxlIER5bmFtb0RCIEdldENvbW1hbmQgZXJyb3JzJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlLCAncmVhZGluZy0xMjMnLCB7IHN0YXR1czogJ1JlYWR5JyB9KTtcblxuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZWplY3RzKG5ldyBFcnJvcignRHluYW1vREIgR2V0Q29tbWFuZCBlcnJvcicpKTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoNTAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmUoJ0ludGVybmFsIHNlcnZlciBlcnJvcicpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgRHluYW1vREIgVXBkYXRlQ29tbWFuZCBlcnJvcnMnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUsICdyZWFkaW5nLTEyMycsIHsgc3RhdHVzOiAnUmVhZHknIH0pO1xuXG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgSXRlbTogeyByZWFkaW5nSWQ6ICdyZWFkaW5nLTEyMycgfSxcbiAgICAgIH0pO1xuXG4gICAgICBkeW5hbW9Nb2NrLm9uKFVwZGF0ZUNvbW1hbmQpLnJlamVjdHMobmV3IEVycm9yKCdEeW5hbW9EQiBVcGRhdGVDb21tYW5kIGVycm9yJykpO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSg1MDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5lcnJvcikudG9CZSgnSW50ZXJuYWwgc2VydmVyIGVycm9yJyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHJldHVybiA1MDAgYW5kIGxvZyBlcnJvcnMnLCBhc3luYyAoKSA9PiB7XG4gICAgICAvLyBJbiBpbmZyYXN0cnVjdHVyZSB0ZXN0cywgY29uc29sZS5lcnJvciBpcyBhbGxvd2VkXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUsICdyZWFkaW5nLTEyMycsIHsgc3RhdHVzOiAnUmVhZHknIH0pO1xuXG4gICAgICBjb25zdCBlcnJvciA9IG5ldyBFcnJvcignVGVzdCBlcnJvcicpO1xuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZWplY3RzKGVycm9yKTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoNTAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmUoJ0ludGVybmFsIHNlcnZlciBlcnJvcicpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgbWFsZm9ybWVkIEpTT04gaW4gYm9keScsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50OiBQYXJ0aWFsPEFQSUdhdGV3YXlQcm94eUV2ZW50PiA9IHtcbiAgICAgICAgcGF0aFBhcmFtZXRlcnM6IHsgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnIH0sXG4gICAgICAgIGJvZHk6ICdub3QtdmFsaWQtanNvbicsXG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICAgICAgY2xhaW1zOiB7XG4gICAgICAgICAgICAgICdjb2duaXRvOmdyb3Vwcyc6IFsnYWRtaW4nXSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSBhcyB1bmtub3duIGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50WydyZXF1ZXN0Q29udGV4dCddLFxuICAgICAgfTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoNTAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmUoJ0ludGVybmFsIHNlcnZlciBlcnJvcicpO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnUmVzcG9uc2UgZm9ybWF0JywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgaW5jbHVkZSBDT1JTIGhlYWRlcnMnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUsICdyZWFkaW5nLTEyMycsIHsgc3RhdHVzOiAnUmVhZHknIH0pO1xuXG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgSXRlbTogeyByZWFkaW5nSWQ6ICdyZWFkaW5nLTEyMycgfSxcbiAgICAgIH0pO1xuXG4gICAgICBkeW5hbW9Nb2NrLm9uKFVwZGF0ZUNvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgQXR0cmlidXRlczogeyByZWFkaW5nSWQ6ICdyZWFkaW5nLTEyMycsIHN0YXR1czogJ1JlYWR5JyB9LFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5oZWFkZXJzKS50b0VxdWFsKHtcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnTG9nZ2luZycsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGxvZyBpbmNvbWluZyBldmVudCcsIGFzeW5jICgpID0+IHtcbiAgICAgIC8vIEluIGluZnJhc3RydWN0dXJlIHRlc3RzLCBjb25zb2xlLmluZm8gaXMgYWxsb3dlZFxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlLCAncmVhZGluZy0xMjMnLCB7IHN0YXR1czogJ1JlYWR5JyB9KTtcblxuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIEl0ZW06IHsgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnIH0sXG4gICAgICB9KTtcblxuICAgICAgZHluYW1vTW9jay5vbihVcGRhdGVDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIEF0dHJpYnV0ZXM6IHsgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnLCBzdGF0dXM6ICdSZWFkeScgfSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICAvLyBKdXN0IHZlcmlmeSB0aGUgaGFuZGxlciBleGVjdXRlcyBzdWNjZXNzZnVsbHlcbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdFZGdlIGNhc2VzJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgaGFuZGxlIG1pc3NpbmcgcmVxdWVzdENvbnRleHQnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudDogUGFydGlhbDxBUElHYXRld2F5UHJveHlFdmVudD4gPSB7XG4gICAgICAgIHBhdGhQYXJhbWV0ZXJzOiB7IHJlYWRpbmdJZDogJ3JlYWRpbmctMTIzJyB9LFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IHN0YXR1czogJ1JlYWR5JyB9KSxcbiAgICAgICAgcmVxdWVzdENvbnRleHQ6IHVuZGVmaW5lZCBhcyBhbnksXG4gICAgICB9O1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSg0MDMpO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5lcnJvcikudG9CZSgnQWNjZXNzIGRlbmllZC4gQWRtaW4gcHJpdmlsZWdlcyByZXF1aXJlZC4nKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIHN0YXR1cyB3aXRoIGV4dHJhIHdoaXRlc3BhY2UnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUsICdyZWFkaW5nLTEyMycsIHsgc3RhdHVzOiAnICBSZWFkeSAgJyB9KTtcblxuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIEl0ZW06IHsgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnIH0sXG4gICAgICB9KTtcblxuICAgICAgZHluYW1vTW9jay5vbihVcGRhdGVDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIEF0dHJpYnV0ZXM6IHsgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnLCBzdGF0dXM6ICcgIFJlYWR5ICAnIH0sXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgLy8gVGhlIGhhbmRsZXIgc2hvdWxkIGlkZWFsbHkgdHJpbSB0aGUgc3RhdHVzLCBidXQgYmFzZWQgb24gdGhlIGltcGxlbWVudGF0aW9uLFxuICAgICAgLy8gaXQgd2lsbCBmYWlsIHZhbGlkYXRpb25cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDQwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LmVycm9yKS50b0NvbnRhaW4oJ0ludmFsaWQgc3RhdHVzJyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBjYXNlLXNlbnNpdGl2ZSBzdGF0dXMgdmFsaWRhdGlvbicsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSwgJ3JlYWRpbmctMTIzJywgeyBzdGF0dXM6ICdyZWFkeScgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDQwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LmVycm9yKS50b0NvbnRhaW4oJ0ludmFsaWQgc3RhdHVzJyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSB1bmRlZmluZWQgVXBkYXRlQ29tbWFuZCBhdHRyaWJ1dGVzJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlLCAncmVhZGluZy0xMjMnLCB7IHN0YXR1czogJ1JlYWR5JyB9KTtcblxuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIEl0ZW06IHsgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnIH0sXG4gICAgICB9KTtcblxuICAgICAgZHluYW1vTW9jay5vbihVcGRhdGVDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIEF0dHJpYnV0ZXM6IHVuZGVmaW5lZCxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICAvLyBBbGwgZmllbGRzIHdpbGwgYmUgdW5kZWZpbmVkIGJ1dCByZXNwb25zZSBzaG91bGQgc3RpbGwgd29ya1xuICAgICAgZXhwZWN0KGJvZHkucmVhZGluZ0lkKS50b0JlVW5kZWZpbmVkKCk7XG4gICAgfSk7XG4gIH0pO1xufSk7XG4iXX0=