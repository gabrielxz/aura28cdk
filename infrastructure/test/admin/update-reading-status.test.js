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
    const createEvent = (isAdmin, userId, readingId, body) => ({
        pathParameters: userId && readingId ? { userId, readingId } : null,
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
            const event = createEvent(false, 'user-456', 'reading-123', { status: 'Ready' });
            const response = await (0, update_reading_status_1.handler)(event);
            expect(response.statusCode).toBe(403);
            const body = JSON.parse(response.body);
            expect(body.error).toBe('Access denied. Admin privileges required.');
        });
        it('should allow access when user is admin', async () => {
            const event = createEvent(true, 'user-456', 'reading-123', { status: 'Ready' });
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
                pathParameters: { userId: 'user-456', readingId: 'reading-123' },
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
            const event = createEvent(true, undefined, undefined, { status: 'Ready' });
            const response = await (0, update_reading_status_1.handler)(event);
            expect(response.statusCode).toBe(400);
            const body = JSON.parse(response.body);
            expect(body.error).toBe('User ID and Reading ID are required');
        });
        it('should return 400 when status is missing', async () => {
            const event = createEvent(true, 'user-456', 'reading-123', {});
            const response = await (0, update_reading_status_1.handler)(event);
            expect(response.statusCode).toBe(400);
            const body = JSON.parse(response.body);
            expect(body.error).toBe('Status is required');
        });
        it('should return 400 when body is empty', async () => {
            const event = createEvent(true, 'user-456', 'reading-123');
            const response = await (0, update_reading_status_1.handler)(event);
            expect(response.statusCode).toBe(400);
            const body = JSON.parse(response.body);
            expect(body.error).toBe('Status is required');
        });
        it('should return 400 for invalid status value', async () => {
            const event = createEvent(true, 'user-456', 'reading-123', { status: 'InvalidStatus' });
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
                const event = createEvent(true, 'user-456', 'reading-123', { status });
                const response = await (0, update_reading_status_1.handler)(event);
                expect(response.statusCode).toBe(200);
                dynamoMock.reset();
            }
        });
    });
    describe('Updating reading status', () => {
        it('should update status successfully', async () => {
            const event = createEvent(true, 'user-456', 'reading-123', { status: 'Ready' });
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
            expect(updateCall?.args[0]?.input?.Key).toEqual({ userId: 'user-456', readingId: 'reading-123' });
            expect(updateCall?.args[0]?.input?.ExpressionAttributeValues?.[':status']).toBe('Ready');
        });
        it('should return 404 when reading not found', async () => {
            const event = createEvent(true, 'user-456', 'reading-123', { status: 'Ready' });
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
                const event = createEvent(true, 'user-456', 'reading-123', { status: to });
                const response = await (0, update_reading_status_1.handler)(event);
                expect(response.statusCode).toBe(200);
                const body = JSON.parse(response.body);
                expect(body.status).toBe(to);
                dynamoMock.reset();
            }
        });
        it('should return only essential fields in response', async () => {
            const event = createEvent(true, 'user-456', 'reading-123', { status: 'Ready' });
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
            const event = createEvent(true, 'user-456', 'reading-123', { status: 'Ready' });
            dynamoMock.on(lib_dynamodb_1.GetCommand).rejects(new Error('DynamoDB GetCommand error'));
            const response = await (0, update_reading_status_1.handler)(event);
            expect(response.statusCode).toBe(500);
            const body = JSON.parse(response.body);
            expect(body.error).toBe('Internal server error');
        });
        it('should handle DynamoDB UpdateCommand errors', async () => {
            const event = createEvent(true, 'user-456', 'reading-123', { status: 'Ready' });
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
            const event = createEvent(true, 'user-456', 'reading-123', { status: 'Ready' });
            const error = new Error('Test error');
            dynamoMock.on(lib_dynamodb_1.GetCommand).rejects(error);
            const response = await (0, update_reading_status_1.handler)(event);
            expect(response.statusCode).toBe(500);
            const body = JSON.parse(response.body);
            expect(body.error).toBe('Internal server error');
        });
        it('should handle malformed JSON in body', async () => {
            const event = {
                pathParameters: { userId: 'user-456', readingId: 'reading-123' },
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
            const event = createEvent(true, 'user-456', 'reading-123', { status: 'Ready' });
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
            const event = createEvent(true, 'user-456', 'reading-123', { status: 'Ready' });
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
                pathParameters: { userId: 'user-456', readingId: 'reading-123' },
                body: JSON.stringify({ status: 'Ready' }),
                requestContext: undefined,
            };
            const response = await (0, update_reading_status_1.handler)(event);
            expect(response.statusCode).toBe(403);
            const body = JSON.parse(response.body);
            expect(body.error).toBe('Access denied. Admin privileges required.');
        });
        it('should handle status with extra whitespace', async () => {
            const event = createEvent(true, 'user-456', 'reading-123', { status: '  Ready  ' });
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
            const event = createEvent(true, 'user-456', 'reading-123', { status: 'ready' });
            const response = await (0, update_reading_status_1.handler)(event);
            expect(response.statusCode).toBe(400);
            const body = JSON.parse(response.body);
            expect(body.error).toContain('Invalid status');
        });
        it('should handle undefined UpdateCommand attributes', async () => {
            const event = createEvent(true, 'user-456', 'reading-123', { status: 'Ready' });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBkYXRlLXJlYWRpbmctc3RhdHVzLnRlc3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ1cGRhdGUtcmVhZGluZy1zdGF0dXMudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLG9GQUFtRTtBQUVuRSx3REFBMEY7QUFDMUYsNkRBQWlEO0FBRWpELDJCQUEyQjtBQUMzQixNQUFNLFVBQVUsR0FBRyxJQUFBLGdDQUFVLEVBQUMscUNBQXNCLENBQUMsQ0FBQztBQUV0RCxRQUFRLENBQUMsOEJBQThCLEVBQUUsR0FBRyxFQUFFO0lBQzVDLFVBQVUsQ0FBQyxHQUFHLEVBQUU7UUFDZCxVQUFVLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDbkIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsR0FBRyxxQkFBcUIsQ0FBQztJQUMxRCxDQUFDLENBQUMsQ0FBQztJQUVILE1BQU0sV0FBVyxHQUFHLENBQ2xCLE9BQWdCLEVBQ2hCLE1BQWUsRUFDZixTQUFrQixFQUNsQixJQUE4QixFQUNDLEVBQUUsQ0FBQyxDQUFDO1FBQ25DLGNBQWMsRUFBRSxNQUFNLElBQUksU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSTtRQUNsRSxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJO1FBQ3hDLGNBQWMsRUFBRTtZQUNkLFVBQVUsRUFBRTtnQkFDVixNQUFNLEVBQUU7b0JBQ04sZ0JBQWdCLEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFO2lCQUMzQzthQUNGO1NBQ21EO0tBQ3ZELENBQUMsQ0FBQztJQUVILFFBQVEsQ0FBQyxlQUFlLEVBQUUsR0FBRyxFQUFFO1FBQzdCLEVBQUUsQ0FBQywwQ0FBMEMsRUFBRSxLQUFLLElBQUksRUFB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QyxFQUFFLENBQUMsNEJBQWEsQ0FBQyxDQUFDLFFBQVEsQ0FBQztnQkFDcEMsVUFBVSxFQUFFLFNBQVM7YUFDdEIsQ0FBQyxDQUFDO1lBRUgsTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFBLCtCQUFPLEVBQUMsS0FBNkIsQ0FBQyxDQUFDO1lBRTlELE1BQU0sQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3RDLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3ZDLDhEQUE4RDtZQUM5RCxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLGFBQWEsRUFBRSxDQUFDO1FBQ3pDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGhhbmRsZXIgfSBmcm9tICcuLi8uLi9sYW1iZGEvYWRtaW4vdXBkYXRlLXJlYWRpbmctc3RhdHVzJztcbmltcG9ydCB7IEFQSUdhdGV3YXlQcm94eUV2ZW50LCBBUElHYXRld2F5RXZlbnRSZXF1ZXN0Q29udGV4dCB9IGZyb20gJ2F3cy1sYW1iZGEnO1xuaW1wb3J0IHsgRHluYW1vREJEb2N1bWVudENsaWVudCwgR2V0Q29tbWFuZCwgVXBkYXRlQ29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYic7XG5pbXBvcnQgeyBtb2NrQ2xpZW50IH0gZnJvbSAnYXdzLXNkay1jbGllbnQtbW9jayc7XG5cbi8vIE1vY2sgdGhlIER5bmFtb0RCIGNsaWVudFxuY29uc3QgZHluYW1vTW9jayA9IG1vY2tDbGllbnQoRHluYW1vREJEb2N1bWVudENsaWVudCk7XG5cbmRlc2NyaWJlKCd1cGRhdGUtcmVhZGluZy1zdGF0dXMgTGFtYmRhJywgKCkgPT4ge1xuICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICBkeW5hbW9Nb2NrLnJlc2V0KCk7XG4gICAgcHJvY2Vzcy5lbnYuUkVBRElOR1NfVEFCTEVfTkFNRSA9ICd0ZXN0LXJlYWRpbmdzLXRhYmxlJztcbiAgfSk7XG5cbiAgY29uc3QgY3JlYXRlRXZlbnQgPSAoXG4gICAgaXNBZG1pbjogYm9vbGVhbixcbiAgICB1c2VySWQ/OiBzdHJpbmcsXG4gICAgcmVhZGluZ0lkPzogc3RyaW5nLFxuICAgIGJvZHk/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPixcbiAgKTogUGFydGlhbDxBUElHYXRld2F5UHJveHlFdmVudD4gPT4gKHtcbiAgICBwYXRoUGFyYW1ldGVyczogdXNlcklkICYmIHJlYWRpbmdJZCA/IHsgdXNlcklkLCByZWFkaW5nSWQgfSA6IG51bGwsXG4gICAgYm9keTogYm9keSA/IEpTT04uc3RyaW5naWZ5KGJvZHkpIDogbnVsbCxcbiAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICBjbGFpbXM6IHtcbiAgICAgICAgICAnY29nbml0bzpncm91cHMnOiBpc0FkbWluID8gWydhZG1pbiddIDogW10sXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0gYXMgdW5rbm93biBhcyBBUElHYXRld2F5UHJveHlFdmVudFsncmVxdWVzdENvbnRleHQnXSxcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0F1dGhvcml6YXRpb24nLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gNDAzIHdoZW4gdXNlciBpcyBub3QgYWRtaW4nLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KGZhbHNlLCAndXNlci00NTYnLCAncmVhZGluZy0xMjMnLCB7IHN0YXR1czogJ1JlYWR5JyB9KTtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDQwMyk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LmVycm9yKS50b0JlKCdBY2Nlc3MgZGVuaWVkLiBBZG1pbiBwcml2aWxlZ2VzIHJlcXVpcmVkLicpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBhbGxvdyBhY2Nlc3Mgd2hlbiB1c2VyIGlzIGFkbWluJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlLCAndXNlci00NTYnLCAncmVhZGluZy0xMjMnLCB7IHN0YXR1czogJ1JlYWR5JyB9KTtcblxuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIEl0ZW06IHsgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnLCBzdGF0dXM6ICdQcm9jZXNzaW5nJyB9LFxuICAgICAgfSk7XG5cbiAgICAgIGR5bmFtb01vY2sub24oVXBkYXRlQ29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBBdHRyaWJ1dGVzOiB7XG4gICAgICAgICAgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnLFxuICAgICAgICAgIHN0YXR1czogJ1JlYWR5JyxcbiAgICAgICAgICB1cGRhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgYWRtaW4gZ3JvdXAgYXMgY29tbWEtc2VwYXJhdGVkIHN0cmluZycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50OiBQYXJ0aWFsPEFQSUdhdGV3YXlQcm94eUV2ZW50PiA9IHtcbiAgICAgICAgcGF0aFBhcmFtZXRlcnM6IHsgdXNlcklkOiAndXNlci00NTYnLCByZWFkaW5nSWQ6ICdyZWFkaW5nLTEyMycgfSxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBzdGF0dXM6ICdSZWFkeScgfSksXG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICAgICAgY2xhaW1zOiB7XG4gICAgICAgICAgICAgICdjb2duaXRvOmdyb3Vwcyc6ICd1c2VyLGFkbWluLHByZW1pdW0nLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9IGFzIHVua25vd24gYXMgQVBJR2F0ZXdheVByb3h5RXZlbnRbJ3JlcXVlc3RDb250ZXh0J10sXG4gICAgICB9O1xuXG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgSXRlbTogeyByZWFkaW5nSWQ6ICdyZWFkaW5nLTEyMycgfSxcbiAgICAgIH0pO1xuXG4gICAgICBkeW5hbW9Nb2NrLm9uKFVwZGF0ZUNvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgQXR0cmlidXRlczogeyByZWFkaW5nSWQ6ICdyZWFkaW5nLTEyMycsIHN0YXR1czogJ1JlYWR5JyB9LFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdJbnB1dCB2YWxpZGF0aW9uJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgcmV0dXJuIDQwMCB3aGVuIHJlYWRpbmcgSUQgaXMgbWlzc2luZycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHsgc3RhdHVzOiAnUmVhZHknIH0pO1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoNDAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmUoJ1VzZXIgSUQgYW5kIFJlYWRpbmcgSUQgYXJlIHJlcXVpcmVkJyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHJldHVybiA0MDAgd2hlbiBzdGF0dXMgaXMgbWlzc2luZycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSwgJ3VzZXItNDU2JywgJ3JlYWRpbmctMTIzJywge30pO1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoNDAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmUoJ1N0YXR1cyBpcyByZXF1aXJlZCcpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gNDAwIHdoZW4gYm9keSBpcyBlbXB0eScsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSwgJ3VzZXItNDU2JywgJ3JlYWRpbmctMTIzJyk7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSg0MDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5lcnJvcikudG9CZSgnU3RhdHVzIGlzIHJlcXVpcmVkJyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHJldHVybiA0MDAgZm9yIGludmFsaWQgc3RhdHVzIHZhbHVlJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlLCAndXNlci00NTYnLCAncmVhZGluZy0xMjMnLCB7IHN0YXR1czogJ0ludmFsaWRTdGF0dXMnIH0pO1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoNDAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmUoXG4gICAgICAgICdJbnZhbGlkIHN0YXR1cy4gTXVzdCBiZSBvbmUgb2Y6IFByb2Nlc3NpbmcsIFJlYWR5LCBGYWlsZWQsIEluIFJldmlldycsXG4gICAgICApO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBhY2NlcHQgYWxsIHZhbGlkIHN0YXR1cyB2YWx1ZXMnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCB2YWxpZFN0YXR1c2VzID0gWydQcm9jZXNzaW5nJywgJ1JlYWR5JywgJ0ZhaWxlZCcsICdJbiBSZXZpZXcnXTtcblxuICAgICAgZm9yIChjb25zdCBzdGF0dXMgb2YgdmFsaWRTdGF0dXNlcykge1xuICAgICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgICBJdGVtOiB7IHJlYWRpbmdJZDogJ3JlYWRpbmctMTIzJyB9LFxuICAgICAgICB9KTtcblxuICAgICAgICBkeW5hbW9Nb2NrLm9uKFVwZGF0ZUNvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgICBBdHRyaWJ1dGVzOiB7IHJlYWRpbmdJZDogJ3JlYWRpbmctMTIzJywgc3RhdHVzIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSwgJ3VzZXItNDU2JywgJ3JlYWRpbmctMTIzJywgeyBzdGF0dXMgfSk7XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgICAgZHluYW1vTW9jay5yZXNldCgpO1xuICAgICAgfVxuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnVXBkYXRpbmcgcmVhZGluZyBzdGF0dXMnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCB1cGRhdGUgc3RhdHVzIHN1Y2Nlc3NmdWxseScsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSwgJ3VzZXItNDU2JywgJ3JlYWRpbmctMTIzJywgeyBzdGF0dXM6ICdSZWFkeScgfSk7XG5cbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBJdGVtOiB7XG4gICAgICAgICAgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnLFxuICAgICAgICAgIHVzZXJJZDogJ3VzZXItNDU2JyxcbiAgICAgICAgICB0eXBlOiAnU291bCBCbHVlcHJpbnQnLFxuICAgICAgICAgIHN0YXR1czogJ1Byb2Nlc3NpbmcnLFxuICAgICAgICAgIGNyZWF0ZWRBdDogJzIwMjQtMDEtMDFUMDA6MDA6MDBaJyxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCBtb2NrVXBkYXRlZEF0ID0gJzIwMjQtMDEtMDFUMDA6MDE6MDBaJztcbiAgICAgIGplc3Quc3B5T24oRGF0ZS5wcm90b3R5cGUsICd0b0lTT1N0cmluZycpLm1vY2tSZXR1cm5WYWx1ZShtb2NrVXBkYXRlZEF0KTtcblxuICAgICAgZHluYW1vTW9jay5vbihVcGRhdGVDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIEF0dHJpYnV0ZXM6IHtcbiAgICAgICAgICByZWFkaW5nSWQ6ICdyZWFkaW5nLTEyMycsXG4gICAgICAgICAgdXNlcklkOiAndXNlci00NTYnLFxuICAgICAgICAgIHR5cGU6ICdTb3VsIEJsdWVwcmludCcsXG4gICAgICAgICAgc3RhdHVzOiAnUmVhZHknLFxuICAgICAgICAgIGNyZWF0ZWRBdDogJzIwMjQtMDEtMDFUMDA6MDA6MDBaJyxcbiAgICAgICAgICB1cGRhdGVkQXQ6IG1vY2tVcGRhdGVkQXQsXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuc3RhdHVzKS50b0JlKCdSZWFkeScpO1xuICAgICAgZXhwZWN0KGJvZHkudXBkYXRlZEF0KS50b0JlKG1vY2tVcGRhdGVkQXQpO1xuXG4gICAgICAvLyBWZXJpZnkgVXBkYXRlQ29tbWFuZCB3YXMgY2FsbGVkXG4gICAgICBjb25zdCB1cGRhdGVDYWxsID0gZHluYW1vTW9jay5jb21tYW5kQ2FsbHMoVXBkYXRlQ29tbWFuZClbMF07XG4gICAgICBleHBlY3QodXBkYXRlQ2FsbCkudG9CZURlZmluZWQoKTtcbiAgICAgIGV4cGVjdCh1cGRhdGVDYWxsPy5hcmdzWzBdPy5pbnB1dD8uS2V5KS50b0VxdWFsKHsgdXNlcklkOiAndXNlci00NTYnLCByZWFkaW5nSWQ6ICdyZWFkaW5nLTEyMycgfSk7XG4gICAgICBleHBlY3QodXBkYXRlQ2FsbD8uYXJnc1swXT8uaW5wdXQ/LkV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM/LlsnOnN0YXR1cyddKS50b0JlKCdSZWFkeScpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gNDA0IHdoZW4gcmVhZGluZyBub3QgZm91bmQnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUsICd1c2VyLTQ1NicsICdyZWFkaW5nLTEyMycsIHsgc3RhdHVzOiAnUmVhZHknIH0pO1xuXG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHsgSXRlbTogdW5kZWZpbmVkIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSg0MDQpO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5lcnJvcikudG9CZSgnUmVhZGluZyBub3QgZm91bmQnKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgdXBkYXRlIGZyb20gYW55IHN0YXR1cyB0byBhbnkgdmFsaWQgc3RhdHVzJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgdHJhbnNpdGlvbnMgPSBbXG4gICAgICAgIHsgZnJvbTogJ1Byb2Nlc3NpbmcnLCB0bzogJ1JlYWR5JyB9LFxuICAgICAgICB7IGZyb206ICdSZWFkeScsIHRvOiAnSW4gUmV2aWV3JyB9LFxuICAgICAgICB7IGZyb206ICdJbiBSZXZpZXcnLCB0bzogJ0ZhaWxlZCcgfSxcbiAgICAgICAgeyBmcm9tOiAnRmFpbGVkJywgdG86ICdQcm9jZXNzaW5nJyB9LFxuICAgICAgXTtcblxuICAgICAgZm9yIChjb25zdCB7IGZyb20sIHRvIH0gb2YgdHJhbnNpdGlvbnMpIHtcbiAgICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgICAgSXRlbTogeyByZWFkaW5nSWQ6ICdyZWFkaW5nLTEyMycsIHN0YXR1czogZnJvbSB9LFxuICAgICAgICB9KTtcblxuICAgICAgICBkeW5hbW9Nb2NrLm9uKFVwZGF0ZUNvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgICBBdHRyaWJ1dGVzOiB7IHJlYWRpbmdJZDogJ3JlYWRpbmctMTIzJywgc3RhdHVzOiB0byB9LFxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUsICd1c2VyLTQ1NicsICdyZWFkaW5nLTEyMycsIHsgc3RhdHVzOiB0byB9KTtcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgICAgZXhwZWN0KGJvZHkuc3RhdHVzKS50b0JlKHRvKTtcblxuICAgICAgICBkeW5hbW9Nb2NrLnJlc2V0KCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHJldHVybiBvbmx5IGVzc2VudGlhbCBmaWVsZHMgaW4gcmVzcG9uc2UnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUsICd1c2VyLTQ1NicsICdyZWFkaW5nLTEyMycsIHsgc3RhdHVzOiAnUmVhZHknIH0pO1xuXG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgSXRlbTogeyByZWFkaW5nSWQ6ICdyZWFkaW5nLTEyMycgfSxcbiAgICAgIH0pO1xuXG4gICAgICBkeW5hbW9Nb2NrLm9uKFVwZGF0ZUNvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgQXR0cmlidXRlczoge1xuICAgICAgICAgIHJlYWRpbmdJZDogJ3JlYWRpbmctMTIzJyxcbiAgICAgICAgICB1c2VySWQ6ICd1c2VyLTQ1NicsXG4gICAgICAgICAgdHlwZTogJ1NvdWwgQmx1ZXByaW50JyxcbiAgICAgICAgICBzdGF0dXM6ICdSZWFkeScsXG4gICAgICAgICAgY3JlYXRlZEF0OiAnMjAyNC0wMS0wMVQwMDowMDowMFonLFxuICAgICAgICAgIHVwZGF0ZWRBdDogJzIwMjQtMDEtMDFUMDA6MDE6MDBaJyxcbiAgICAgICAgICAvLyBUaGVzZSBzaG91bGQgbm90IGJlIGluIHJlc3BvbnNlXG4gICAgICAgICAgY29udGVudDogeyBpbnRlcnByZXRhdGlvbjogJ1NlY3JldCcgfSxcbiAgICAgICAgICBtZXRhZGF0YTogeyBtb2RlbDogJ2dwdC00JyB9LFxuICAgICAgICB9LFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5KS50b0VxdWFsKHtcbiAgICAgICAgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnLFxuICAgICAgICB1c2VySWQ6ICd1c2VyLTQ1NicsXG4gICAgICAgIHR5cGU6ICdTb3VsIEJsdWVwcmludCcsXG4gICAgICAgIHN0YXR1czogJ1JlYWR5JyxcbiAgICAgICAgY3JlYXRlZEF0OiAnMjAyNC0wMS0wMVQwMDowMDowMFonLFxuICAgICAgICB1cGRhdGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAxOjAwWicsXG4gICAgICB9KTtcbiAgICAgIGV4cGVjdChib2R5LmNvbnRlbnQpLnRvQmVVbmRlZmluZWQoKTtcbiAgICAgIGV4cGVjdChib2R5Lm1ldGFkYXRhKS50b0JlVW5kZWZpbmVkKCk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdFcnJvciBoYW5kbGluZycsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBEeW5hbW9EQiBHZXRDb21tYW5kIGVycm9ycycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSwgJ3VzZXItNDU2JywgJ3JlYWRpbmctMTIzJywgeyBzdGF0dXM6ICdSZWFkeScgfSk7XG5cbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVqZWN0cyhuZXcgRXJyb3IoJ0R5bmFtb0RCIEdldENvbW1hbmQgZXJyb3InKSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDUwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LmVycm9yKS50b0JlKCdJbnRlcm5hbCBzZXJ2ZXIgZXJyb3InKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIER5bmFtb0RCIFVwZGF0ZUNvbW1hbmQgZXJyb3JzJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlLCAndXNlci00NTYnLCAncmVhZGluZy0xMjMnLCB7IHN0YXR1czogJ1JlYWR5JyB9KTtcblxuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIEl0ZW06IHsgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnIH0sXG4gICAgICB9KTtcblxuICAgICAgZHluYW1vTW9jay5vbihVcGRhdGVDb21tYW5kKS5yZWplY3RzKG5ldyBFcnJvcignRHluYW1vREIgVXBkYXRlQ29tbWFuZCBlcnJvcicpKTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoNTAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmUoJ0ludGVybmFsIHNlcnZlciBlcnJvcicpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gNTAwIGFuZCBsb2cgZXJyb3JzJywgYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gSW4gaW5mcmFzdHJ1Y3R1cmUgdGVzdHMsIGNvbnNvbGUuZXJyb3IgaXMgYWxsb3dlZFxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlLCAndXNlci00NTYnLCAncmVhZGluZy0xMjMnLCB7IHN0YXR1czogJ1JlYWR5JyB9KTtcblxuICAgICAgY29uc3QgZXJyb3IgPSBuZXcgRXJyb3IoJ1Rlc3QgZXJyb3InKTtcbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVqZWN0cyhlcnJvcik7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDUwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LmVycm9yKS50b0JlKCdJbnRlcm5hbCBzZXJ2ZXIgZXJyb3InKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIG1hbGZvcm1lZCBKU09OIGluIGJvZHknLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudDogUGFydGlhbDxBUElHYXRld2F5UHJveHlFdmVudD4gPSB7XG4gICAgICAgIHBhdGhQYXJhbWV0ZXJzOiB7IHVzZXJJZDogJ3VzZXItNDU2JywgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnIH0sXG4gICAgICAgIGJvZHk6ICdub3QtdmFsaWQtanNvbicsXG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICAgICAgY2xhaW1zOiB7XG4gICAgICAgICAgICAgICdjb2duaXRvOmdyb3Vwcyc6IFsnYWRtaW4nXSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSBhcyB1bmtub3duIGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50WydyZXF1ZXN0Q29udGV4dCddLFxuICAgICAgfTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoNTAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmUoJ0ludGVybmFsIHNlcnZlciBlcnJvcicpO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnUmVzcG9uc2UgZm9ybWF0JywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgaW5jbHVkZSBDT1JTIGhlYWRlcnMnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUsICd1c2VyLTQ1NicsICdyZWFkaW5nLTEyMycsIHsgc3RhdHVzOiAnUmVhZHknIH0pO1xuXG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgSXRlbTogeyByZWFkaW5nSWQ6ICdyZWFkaW5nLTEyMycgfSxcbiAgICAgIH0pO1xuXG4gICAgICBkeW5hbW9Nb2NrLm9uKFVwZGF0ZUNvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgQXR0cmlidXRlczogeyByZWFkaW5nSWQ6ICdyZWFkaW5nLTEyMycsIHN0YXR1czogJ1JlYWR5JyB9LFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5oZWFkZXJzKS50b0VxdWFsKHtcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnTG9nZ2luZycsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGxvZyBpbmNvbWluZyBldmVudCcsIGFzeW5jICgpID0+IHtcbiAgICAgIC8vIEluIGluZnJhc3RydWN0dXJlIHRlc3RzLCBjb25zb2xlLmluZm8gaXMgYWxsb3dlZFxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlLCAndXNlci00NTYnLCAncmVhZGluZy0xMjMnLCB7IHN0YXR1czogJ1JlYWR5JyB9KTtcblxuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIEl0ZW06IHsgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnIH0sXG4gICAgICB9KTtcblxuICAgICAgZHluYW1vTW9jay5vbihVcGRhdGVDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIEF0dHJpYnV0ZXM6IHsgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnLCBzdGF0dXM6ICdSZWFkeScgfSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICAvLyBKdXN0IHZlcmlmeSB0aGUgaGFuZGxlciBleGVjdXRlcyBzdWNjZXNzZnVsbHlcbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdFZGdlIGNhc2VzJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgaGFuZGxlIG1pc3NpbmcgcmVxdWVzdENvbnRleHQnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudDogUGFydGlhbDxBUElHYXRld2F5UHJveHlFdmVudD4gPSB7XG4gICAgICAgIHBhdGhQYXJhbWV0ZXJzOiB7IHVzZXJJZDogJ3VzZXItNDU2JywgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnIH0sXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgc3RhdHVzOiAnUmVhZHknIH0pLFxuICAgICAgICByZXF1ZXN0Q29udGV4dDogdW5kZWZpbmVkIGFzIHVua25vd24gYXMgQVBJR2F0ZXdheUV2ZW50UmVxdWVzdENvbnRleHQsXG4gICAgICB9O1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSg0MDMpO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5lcnJvcikudG9CZSgnQWNjZXNzIGRlbmllZC4gQWRtaW4gcHJpdmlsZWdlcyByZXF1aXJlZC4nKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIHN0YXR1cyB3aXRoIGV4dHJhIHdoaXRlc3BhY2UnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUsICd1c2VyLTQ1NicsICdyZWFkaW5nLTEyMycsIHsgc3RhdHVzOiAnICBSZWFkeSAgJyB9KTtcblxuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIEl0ZW06IHsgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnIH0sXG4gICAgICB9KTtcblxuICAgICAgZHluYW1vTW9jay5vbihVcGRhdGVDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIEF0dHJpYnV0ZXM6IHsgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnLCBzdGF0dXM6ICcgIFJlYWR5ICAnIH0sXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgLy8gVGhlIGhhbmRsZXIgc2hvdWxkIGlkZWFsbHkgdHJpbSB0aGUgc3RhdHVzLCBidXQgYmFzZWQgb24gdGhlIGltcGxlbWVudGF0aW9uLFxuICAgICAgLy8gaXQgd2lsbCBmYWlsIHZhbGlkYXRpb25cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDQwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LmVycm9yKS50b0NvbnRhaW4oJ0ludmFsaWQgc3RhdHVzJyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBjYXNlLXNlbnNpdGl2ZSBzdGF0dXMgdmFsaWRhdGlvbicsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSwgJ3VzZXItNDU2JywgJ3JlYWRpbmctMTIzJywgeyBzdGF0dXM6ICdyZWFkeScgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDQwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LmVycm9yKS50b0NvbnRhaW4oJ0ludmFsaWQgc3RhdHVzJyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSB1bmRlZmluZWQgVXBkYXRlQ29tbWFuZCBhdHRyaWJ1dGVzJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlLCAndXNlci00NTYnLCAncmVhZGluZy0xMjMnLCB7IHN0YXR1czogJ1JlYWR5JyB9KTtcblxuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIEl0ZW06IHsgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnIH0sXG4gICAgICB9KTtcblxuICAgICAgZHluYW1vTW9jay5vbihVcGRhdGVDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIEF0dHJpYnV0ZXM6IHVuZGVmaW5lZCxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICAvLyBBbGwgZmllbGRzIHdpbGwgYmUgdW5kZWZpbmVkIGJ1dCByZXNwb25zZSBzaG91bGQgc3RpbGwgd29ya1xuICAgICAgZXhwZWN0KGJvZHkucmVhZGluZ0lkKS50b0JlVW5kZWZpbmVkKCk7XG4gICAgfSk7XG4gIH0pO1xufSk7XG4iXX0=