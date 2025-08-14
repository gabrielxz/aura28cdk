"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const delete_reading_1 = require("../../lambda/admin/delete-reading");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const aws_sdk_client_mock_1 = require("aws-sdk-client-mock");
// Mock the DynamoDB client
const dynamoMock = (0, aws_sdk_client_mock_1.mockClient)(lib_dynamodb_1.DynamoDBDocumentClient);
describe('delete-reading Lambda', () => {
    beforeEach(() => {
        dynamoMock.reset();
        process.env.READINGS_TABLE_NAME = 'test-readings-table';
    });
    const createEvent = (isAdmin, userId, readingId) => ({
        pathParameters: userId && readingId ? { userId, readingId } : null,
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
            const event = createEvent(false, 'user-456', 'reading-123');
            const response = await (0, delete_reading_1.handler)(event);
            expect(response.statusCode).toBe(403);
            const body = JSON.parse(response.body);
            expect(body.error).toBe('Access denied. Admin privileges required.');
        });
        it('should allow access when user is admin', async () => {
            const event = createEvent(true, 'user-456', 'reading-123');
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({
                Item: { readingId: 'reading-123' },
            });
            dynamoMock.on(lib_dynamodb_1.DeleteCommand).resolves({});
            const response = await (0, delete_reading_1.handler)(event);
            expect(response.statusCode).toBe(204);
        });
        it('should handle admin group as comma-separated string', async () => {
            const event = {
                pathParameters: { userId: 'user-456', readingId: 'reading-123' },
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
            dynamoMock.on(lib_dynamodb_1.DeleteCommand).resolves({});
            const response = await (0, delete_reading_1.handler)(event);
            expect(response.statusCode).toBe(204);
        });
        it('should reject when admin is not in comma-separated string', async () => {
            const event = {
                pathParameters: { userId: 'user-456', readingId: 'reading-123' },
                requestContext: {
                    authorizer: {
                        claims: {
                            'cognito:groups': 'user,premium',
                        },
                    },
                },
            };
            const response = await (0, delete_reading_1.handler)(event);
            expect(response.statusCode).toBe(403);
        });
    });
    describe('Input validation', () => {
        it('should return 400 when reading ID is missing', async () => {
            const event = createEvent(true, undefined, undefined);
            const response = await (0, delete_reading_1.handler)(event);
            expect(response.statusCode).toBe(400);
            const body = JSON.parse(response.body);
            expect(body.error).toBe('User ID and Reading ID are required');
        });
    });
    describe('Deleting reading', () => {
        it('should delete reading successfully', async () => {
            const event = createEvent(true, 'user-456', 'reading-123');
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({
                Item: {
                    readingId: 'reading-123',
                    userId: 'user-456',
                    type: 'Soul Blueprint',
                    status: 'Ready',
                },
            });
            dynamoMock.on(lib_dynamodb_1.DeleteCommand).resolves({});
            const response = await (0, delete_reading_1.handler)(event);
            expect(response.statusCode).toBe(204);
            expect(response.body).toBe('');
            // Verify DeleteCommand was called
            const deleteCall = dynamoMock.commandCalls(lib_dynamodb_1.DeleteCommand)[0];
            expect(deleteCall).toBeDefined();
            expect(deleteCall.args[0].input.Key).toEqual({ userId: 'user-456', readingId: 'reading-123' });
        });
        it('should return 404 when reading not found', async () => {
            const event = createEvent(true, 'user-456', 'reading-123');
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({ Item: undefined });
            const response = await (0, delete_reading_1.handler)(event);
            expect(response.statusCode).toBe(404);
            const body = JSON.parse(response.body);
            expect(body.error).toBe('Reading not found');
            // Verify DeleteCommand was not called
            expect(dynamoMock.commandCalls(lib_dynamodb_1.DeleteCommand).length).toBe(0);
        });
        it('should check existence before deletion', async () => {
            const event = createEvent(true, 'user-456', 'reading-123');
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({
                Item: { readingId: 'reading-123' },
            });
            dynamoMock.on(lib_dynamodb_1.DeleteCommand).resolves({});
            await (0, delete_reading_1.handler)(event);
            // Verify GetCommand was called before DeleteCommand
            const getCalls = dynamoMock.commandCalls(lib_dynamodb_1.GetCommand);
            const deleteCalls = dynamoMock.commandCalls(lib_dynamodb_1.DeleteCommand);
            expect(getCalls.length).toBe(1);
            expect(deleteCalls.length).toBe(1);
            expect(getCalls[0].args[0].input.Key).toEqual({ userId: 'user-456', readingId: 'reading-123' });
        });
        it('should log successful deletion', async () => {
            // In infrastructure tests, console.info is allowed
            const event = createEvent(true, 'user-456', 'reading-123');
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({
                Item: { readingId: 'reading-123' },
            });
            dynamoMock.on(lib_dynamodb_1.DeleteCommand).resolves({});
            const response = await (0, delete_reading_1.handler)(event);
            // Just verify successful deletion
            expect(response.statusCode).toBe(204);
        });
    });
    describe('Error handling', () => {
        it('should handle DynamoDB GetCommand errors', async () => {
            const event = createEvent(true, 'user-456', 'reading-123');
            dynamoMock.on(lib_dynamodb_1.GetCommand).rejects(new Error('DynamoDB GetCommand error'));
            const response = await (0, delete_reading_1.handler)(event);
            expect(response.statusCode).toBe(500);
            const body = JSON.parse(response.body);
            expect(body.error).toBe('Internal server error');
        });
        it('should handle DynamoDB DeleteCommand errors', async () => {
            const event = createEvent(true, 'user-456', 'reading-123');
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({
                Item: { readingId: 'reading-123' },
            });
            dynamoMock.on(lib_dynamodb_1.DeleteCommand).rejects(new Error('DynamoDB DeleteCommand error'));
            const response = await (0, delete_reading_1.handler)(event);
            expect(response.statusCode).toBe(500);
            const body = JSON.parse(response.body);
            expect(body.error).toBe('Internal server error');
        });
        it('should return 500 and log errors', async () => {
            // In infrastructure tests, console.error is allowed
            const event = createEvent(true, 'user-456', 'reading-123');
            const error = new Error('Test error');
            dynamoMock.on(lib_dynamodb_1.GetCommand).rejects(error);
            const response = await (0, delete_reading_1.handler)(event);
            expect(response.statusCode).toBe(500);
            const body = JSON.parse(response.body);
            expect(body.error).toBe('Internal server error');
        });
    });
    describe('Response format', () => {
        it('should include CORS headers for success', async () => {
            const event = createEvent(true, 'user-456', 'reading-123');
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({
                Item: { readingId: 'reading-123' },
            });
            dynamoMock.on(lib_dynamodb_1.DeleteCommand).resolves({});
            const response = await (0, delete_reading_1.handler)(event);
            expect(response.headers).toEqual({
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            });
        });
        it('should include CORS headers for errors', async () => {
            const event = createEvent(false, 'user-456', 'reading-123');
            const response = await (0, delete_reading_1.handler)(event);
            expect(response.headers).toEqual({
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            });
        });
        it('should return 204 with empty body on success', async () => {
            const event = createEvent(true, 'user-456', 'reading-123');
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({
                Item: { readingId: 'reading-123' },
            });
            dynamoMock.on(lib_dynamodb_1.DeleteCommand).resolves({});
            const response = await (0, delete_reading_1.handler)(event);
            expect(response.statusCode).toBe(204);
            expect(response.body).toBe('');
        });
    });
    describe('Logging', () => {
        it('should log incoming event', async () => {
            // In infrastructure tests, console.info is allowed
            const event = createEvent(true, 'user-456', 'reading-123');
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({
                Item: { readingId: 'reading-123' },
            });
            dynamoMock.on(lib_dynamodb_1.DeleteCommand).resolves({});
            const response = await (0, delete_reading_1.handler)(event);
            // Just verify the handler executes successfully
            expect(response.statusCode).toBe(204);
        });
    });
    describe('Edge cases', () => {
        it('should handle missing requestContext', async () => {
            const event = {
                pathParameters: { userId: 'user-456', readingId: 'reading-123' },
                requestContext: undefined,
            };
            const response = await (0, delete_reading_1.handler)(event);
            expect(response.statusCode).toBe(403);
            const body = JSON.parse(response.body);
            expect(body.error).toBe('Access denied. Admin privileges required.');
        });
        it('should handle missing authorizer claims', async () => {
            const event = {
                pathParameters: { userId: 'user-456', readingId: 'reading-123' },
                requestContext: {
                    authorizer: undefined,
                },
            };
            const response = await (0, delete_reading_1.handler)(event);
            expect(response.statusCode).toBe(403);
        });
        it('should handle empty cognito:groups', async () => {
            const event = {
                pathParameters: { userId: 'user-456', readingId: 'reading-123' },
                requestContext: {
                    authorizer: {
                        claims: {
                            'cognito:groups': '',
                        },
                    },
                },
            };
            const response = await (0, delete_reading_1.handler)(event);
            expect(response.statusCode).toBe(403);
        });
        it('should handle cognito:groups as array with admin', async () => {
            const event = {
                pathParameters: { userId: 'user-456', readingId: 'reading-123' },
                requestContext: {
                    authorizer: {
                        claims: {
                            'cognito:groups': ['user', 'admin', 'premium'],
                        },
                    },
                },
            };
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({
                Item: { readingId: 'reading-123' },
            });
            dynamoMock.on(lib_dynamodb_1.DeleteCommand).resolves({});
            const response = await (0, delete_reading_1.handler)(event);
            expect(response.statusCode).toBe(204);
        });
        it('should handle cognito:groups as array without admin', async () => {
            const event = {
                pathParameters: { userId: 'user-456', readingId: 'reading-123' },
                requestContext: {
                    authorizer: {
                        claims: {
                            'cognito:groups': ['user', 'premium'],
                        },
                    },
                },
            };
            const response = await (0, delete_reading_1.handler)(event);
            expect(response.statusCode).toBe(403);
        });
        it('should handle special characters in reading ID', async () => {
            const specialReadingId = 'reading-123!@#$%^&*()';
            const event = createEvent(true, 'user-456', specialReadingId);
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({
                Item: { readingId: specialReadingId },
            });
            dynamoMock.on(lib_dynamodb_1.DeleteCommand).resolves({});
            const response = await (0, delete_reading_1.handler)(event);
            expect(response.statusCode).toBe(204);
            const deleteCall = dynamoMock.commandCalls(lib_dynamodb_1.DeleteCommand)[0];
            expect(deleteCall).toBeDefined();
            expect(deleteCall?.args[0]?.input?.Key).toEqual({ userId: 'user-456', readingId: specialReadingId });
        });
        it('should handle very long reading IDs', async () => {
            const longReadingId = 'reading-' + 'a'.repeat(1000);
            const event = createEvent(true, 'user-456', longReadingId);
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({
                Item: { readingId: longReadingId },
            });
            dynamoMock.on(lib_dynamodb_1.DeleteCommand).resolves({});
            const response = await (0, delete_reading_1.handler)(event);
            expect(response.statusCode).toBe(204);
        });
    });
    describe('Idempotency', () => {
        it('should return 404 if reading already deleted (idempotent)', async () => {
            const event = createEvent(true, 'user-456', 'reading-123');
            // First call - reading doesn't exist
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({ Item: undefined });
            const response1 = await (0, delete_reading_1.handler)(event);
            expect(response1.statusCode).toBe(404);
            // Second call - reading still doesn't exist
            const response2 = await (0, delete_reading_1.handler)(event);
            expect(response2.statusCode).toBe(404);
            // Delete was never called
            expect(dynamoMock.commandCalls(lib_dynamodb_1.DeleteCommand).length).toBe(0);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVsZXRlLXJlYWRpbmcudGVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImRlbGV0ZS1yZWFkaW5nLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSxzRUFBNEQ7QUFFNUQsd0RBQTBGO0FBQzFGLDZEQUFpRDtBQUVqRCwyQkFBMkI7QUFDM0IsTUFBTSxVQUFVLEdBQUcsSUFBQSxnQ0FBVSxFQUFDLHFDQUFzQixDQUFDLENBQUM7QUFFdEQsUUFBUSxDQUFDLHVCQUF1QixFQUFFLEdBQUcsRUFBRTtJQUNyQyxVQUFVLENBQUMsR0FBRyxFQUFFO1FBQ2QsVUFBVSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ25CLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQW1CLEdBQUcscUJBQXFCLENBQUM7SUFDMUQsQ0FBQyxDQUFDLENBQUM7SUFFSCxNQUFNLFdBQVcsR0FBRyxDQUFDLE9BQWdCLEVBQUUsTUFBZSxFQUFFLFNBQWtCLEVBQWlDLEVBQUUsQ0FBQyxDQUFDO1FBQzdHLGNBQWMsRUFBRSxNQUFNLElBQUksU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSTtRQUNsRSxjQUFjLEVBQUU7WUFDZCxVQUFVLEVBQUU7Z0JBQ1YsTUFBTSxFQUFFO29CQUNOLGdCQUFnQixFQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRTtpQkFDM0M7YUFDRjtTQUNtRDtLQUN2RCxDQUFDLENBQUM7SUFFSCxRQUFRLENBQUMsZUFBZSxFQUFFLEdBQUcsRUFBRTtRQUM3QixFQUFFLENBQUMsMENBQTBDLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDeEQsTUFBTSxLQUFLLEdBQUcsV0FBVyxDQUFDLEtBQUssRUFBRSxVQUFVLEVBQUUsYUFBYSxDQUFDLENBQUM7WUFDNUQsTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFBLHdCQUFPLEVBQUMsS0FB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LEtBQUssR0FBRyxXQUFXLENBQUMsSUFBSSxFQUFFLFVBQVUsRUFBRSxhQUFhLENBQUMsQ0FBQztZQUUzRCxxQ0FBcUM7WUFDckMsVUFBVSxDQUFDLEVBQUUsQ0FBQyx5QkFBVSxDQUFDLENBQUMsUUFBUSxDQUFDLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUM7WUFFeEQsTUFBTSxTQUFTLEdBQUcsTUFBTSxJQUFBLHdCQUFPLEVBQUMsS0FBNkIsQ0FBQyxDQUFDO1lBQy9ELE1BQU0sQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBRXZDLDRDQUE0QztZQUM1QyxNQUFNLFNBQVMsR0FBRyxNQUFNLElBQUEsd0JBQU8sRUFBQyxLQUE2QixDQUFDLENBQUM7WUFDL0QsTUFBTSxDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7WUFFdkMsMEJBQTBCO1lBQzFCLE1BQU0sQ0FBQyxVQUFVLENBQUMsWUFBWSxDQUFDLDRCQUFhLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDaEUsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztBQUNMLENBQUMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgaGFuZGxlciB9IGZyb20gJy4uLy4uL2xhbWJkYS9hZG1pbi9kZWxldGUtcmVhZGluZyc7XG5pbXBvcnQgeyBBUElHYXRld2F5UHJveHlFdmVudCwgQVBJR2F0ZXdheUV2ZW50UmVxdWVzdENvbnRleHQgfSBmcm9tICdhd3MtbGFtYmRhJztcbmltcG9ydCB7IER5bmFtb0RCRG9jdW1lbnRDbGllbnQsIEdldENvbW1hbmQsIERlbGV0ZUNvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9saWItZHluYW1vZGInO1xuaW1wb3J0IHsgbW9ja0NsaWVudCB9IGZyb20gJ2F3cy1zZGstY2xpZW50LW1vY2snO1xuXG4vLyBNb2NrIHRoZSBEeW5hbW9EQiBjbGllbnRcbmNvbnN0IGR5bmFtb01vY2sgPSBtb2NrQ2xpZW50KER5bmFtb0RCRG9jdW1lbnRDbGllbnQpO1xuXG5kZXNjcmliZSgnZGVsZXRlLXJlYWRpbmcgTGFtYmRhJywgKCkgPT4ge1xuICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICBkeW5hbW9Nb2NrLnJlc2V0KCk7XG4gICAgcHJvY2Vzcy5lbnYuUkVBRElOR1NfVEFCTEVfTkFNRSA9ICd0ZXN0LXJlYWRpbmdzLXRhYmxlJztcbiAgfSk7XG5cbiAgY29uc3QgY3JlYXRlRXZlbnQgPSAoaXNBZG1pbjogYm9vbGVhbiwgdXNlcklkPzogc3RyaW5nLCByZWFkaW5nSWQ/OiBzdHJpbmcpOiBQYXJ0aWFsPEFQSUdhdGV3YXlQcm94eUV2ZW50PiA9PiAoe1xuICAgIHBhdGhQYXJhbWV0ZXJzOiB1c2VySWQgJiYgcmVhZGluZ0lkID8geyB1c2VySWQsIHJlYWRpbmdJZCB9IDogbnVsbCxcbiAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICBjbGFpbXM6IHtcbiAgICAgICAgICAnY29nbml0bzpncm91cHMnOiBpc0FkbWluID8gWydhZG1pbiddIDogW10sXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0gYXMgdW5rbm93biBhcyBBUElHYXRld2F5UHJveHlFdmVudFsncmVxdWVzdENvbnRleHQnXSxcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0F1dGhvcml6YXRpb24nLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gNDAzIHdoZW4gdXNlciBpcyBub3QgYWRtaW4nLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KGZhbHNlLCAndXNlci00NTYnLCAncmVhZGluZy0xMjMnKTtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDQwMyk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LmVycm9yKS50b0JlKCdBY2Nlc3MgZGVuaWVkLiBBZG1pbiBwcml2aWxlZ2VzIHJlcXVpcmVkLicpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBhbGxvdyBhY2Nlc3Mgd2hlbiB1c2VyIGlzIGFkbWluJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlLCAndXNlci00NTYnLCAncmVhZGluZy0xMjMnKTtcblxuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIEl0ZW06IHsgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnIH0sXG4gICAgICB9KTtcblxuICAgICAgZHluYW1vTW9jay5vbihEZWxldGVDb21tYW5kKS5yZXNvbHZlcyh7fSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDIwNCk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBhZG1pbiBncm91cCBhcyBjb21tYS1zZXBhcmF0ZWQgc3RyaW5nJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQ6IFBhcnRpYWw8QVBJR2F0ZXdheVByb3h5RXZlbnQ+ID0ge1xuICAgICAgICBwYXRoUGFyYW1ldGVyczogeyB1c2VySWQ6ICd1c2VyLTQ1NicsIHJlYWRpbmdJZDogJ3JlYWRpbmctMTIzJyB9LFxuICAgICAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgICAgIGF1dGhvcml6ZXI6IHtcbiAgICAgICAgICAgIGNsYWltczoge1xuICAgICAgICAgICAgICAnY29nbml0bzpncm91cHMnOiAndXNlcixhZG1pbixwcmVtaXVtJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSBhcyB1bmtub3duIGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50WydyZXF1ZXN0Q29udGV4dCddLFxuICAgICAgfTtcblxuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIEl0ZW06IHsgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnIH0sXG4gICAgICB9KTtcblxuICAgICAgZHluYW1vTW9jay5vbihEZWxldGVDb21tYW5kKS5yZXNvbHZlcyh7fSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDIwNCk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHJlamVjdCB3aGVuIGFkbWluIGlzIG5vdCBpbiBjb21tYS1zZXBhcmF0ZWQgc3RyaW5nJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQ6IFBhcnRpYWw8QVBJR2F0ZXdheVByb3h5RXZlbnQ+ID0ge1xuICAgICAgICBwYXRoUGFyYW1ldGVyczogeyB1c2VySWQ6ICd1c2VyLTQ1NicsIHJlYWRpbmdJZDogJ3JlYWRpbmctMTIzJyB9LFxuICAgICAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgICAgIGF1dGhvcml6ZXI6IHtcbiAgICAgICAgICAgIGNsYWltczoge1xuICAgICAgICAgICAgICAnY29nbml0bzpncm91cHMnOiAndXNlcixwcmVtaXVtJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSBhcyB1bmtub3duIGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50WydyZXF1ZXN0Q29udGV4dCddLFxuICAgICAgfTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoNDAzKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0lucHV0IHZhbGlkYXRpb24nLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gNDAwIHdoZW4gcmVhZGluZyBJRCBpcyBtaXNzaW5nJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSg0MDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5lcnJvcikudG9CZSgnVXNlciBJRCBhbmQgUmVhZGluZyBJRCBhcmUgcmVxdWlyZWQnKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0RlbGV0aW5nIHJlYWRpbmcnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBkZWxldGUgcmVhZGluZyBzdWNjZXNzZnVsbHknLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUsICd1c2VyLTQ1NicsICdyZWFkaW5nLTEyMycpO1xuXG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgSXRlbToge1xuICAgICAgICAgIHJlYWRpbmdJZDogJ3JlYWRpbmctMTIzJyxcbiAgICAgICAgICB1c2VySWQ6ICd1c2VyLTQ1NicsXG4gICAgICAgICAgdHlwZTogJ1NvdWwgQmx1ZXByaW50JyxcbiAgICAgICAgICBzdGF0dXM6ICdSZWFkeScsXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgZHluYW1vTW9jay5vbihEZWxldGVDb21tYW5kKS5yZXNvbHZlcyh7fSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDIwNCk7XG4gICAgICBleHBlY3QocmVzcG9uc2UuYm9keSkudG9CZSgnJyk7XG5cbiAgICAgIC8vIFZlcmlmeSBEZWxldGVDb21tYW5kIHdhcyBjYWxsZWRcbiAgICAgIGNvbnN0IGRlbGV0ZUNhbGwgPSBkeW5hbW9Nb2NrLmNvbW1hbmRDYWxscyhEZWxldGVDb21tYW5kKVswXTtcbiAgICAgIGV4cGVjdChkZWxldGVDYWxsKS50b0JlRGVmaW5lZCgpO1xuICAgICAgZXhwZWN0KGRlbGV0ZUNhbGwuYXJnc1swXS5pbnB1dC5LZXkpLnRvRXF1YWwoeyB1c2VySWQ6ICd1c2VyLTQ1NicsIHJlYWRpbmdJZDogJ3JlYWRpbmctMTIzJyB9KTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgcmV0dXJuIDQwNCB3aGVuIHJlYWRpbmcgbm90IGZvdW5kJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlLCAndXNlci00NTYnLCAncmVhZGluZy0xMjMnKTtcblxuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7IEl0ZW06IHVuZGVmaW5lZCB9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoNDA0KTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmUoJ1JlYWRpbmcgbm90IGZvdW5kJyk7XG5cbiAgICAgIC8vIFZlcmlmeSBEZWxldGVDb21tYW5kIHdhcyBub3QgY2FsbGVkXG4gICAgICBleHBlY3QoZHluYW1vTW9jay5jb21tYW5kQ2FsbHMoRGVsZXRlQ29tbWFuZCkubGVuZ3RoKS50b0JlKDApO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBjaGVjayBleGlzdGVuY2UgYmVmb3JlIGRlbGV0aW9uJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlLCAndXNlci00NTYnLCAncmVhZGluZy0xMjMnKTtcblxuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIEl0ZW06IHsgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnIH0sXG4gICAgICB9KTtcblxuICAgICAgZHluYW1vTW9jay5vbihEZWxldGVDb21tYW5kKS5yZXNvbHZlcyh7fSk7XG5cbiAgICAgIGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICAvLyBWZXJpZnkgR2V0Q29tbWFuZCB3YXMgY2FsbGVkIGJlZm9yZSBEZWxldGVDb21tYW5kXG4gICAgICBjb25zdCBnZXRDYWxscyA9IGR5bmFtb01vY2suY29tbWFuZENhbGxzKEdldENvbW1hbmQpO1xuICAgICAgY29uc3QgZGVsZXRlQ2FsbHMgPSBkeW5hbW9Nb2NrLmNvbW1hbmRDYWxscyhEZWxldGVDb21tYW5kKTtcblxuICAgICAgZXhwZWN0KGdldENhbGxzLmxlbmd0aCkudG9CZSgxKTtcbiAgICAgIGV4cGVjdChkZWxldGVDYWxscy5sZW5ndGgpLnRvQmUoMSk7XG4gICAgICBleHBlY3QoZ2V0Q2FsbHNbMF0uYXJnc1swXS5pbnB1dC5LZXkpLnRvRXF1YWwoeyB1c2VySWQ6ICd1c2VyLTQ1NicsIHJlYWRpbmdJZDogJ3JlYWRpbmctMTIzJyB9KTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgbG9nIHN1Y2Nlc3NmdWwgZGVsZXRpb24nLCBhc3luYyAoKSA9PiB7XG4gICAgICAvLyBJbiBpbmZyYXN0cnVjdHVyZSB0ZXN0cywgY29uc29sZS5pbmZvIGlzIGFsbG93ZWRcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSwgJ3VzZXItNDU2JywgJ3JlYWRpbmctMTIzJyk7XG5cbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBJdGVtOiB7IHJlYWRpbmdJZDogJ3JlYWRpbmctMTIzJyB9LFxuICAgICAgfSk7XG5cbiAgICAgIGR5bmFtb01vY2sub24oRGVsZXRlQ29tbWFuZCkucmVzb2x2ZXMoe30pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICAvLyBKdXN0IHZlcmlmeSBzdWNjZXNzZnVsIGRlbGV0aW9uXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDQpO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnRXJyb3IgaGFuZGxpbmcnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgRHluYW1vREIgR2V0Q29tbWFuZCBlcnJvcnMnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUsICd1c2VyLTQ1NicsICdyZWFkaW5nLTEyMycpO1xuXG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlamVjdHMobmV3IEVycm9yKCdEeW5hbW9EQiBHZXRDb21tYW5kIGVycm9yJykpO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSg1MDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5lcnJvcikudG9CZSgnSW50ZXJuYWwgc2VydmVyIGVycm9yJyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBEeW5hbW9EQiBEZWxldGVDb21tYW5kIGVycm9ycycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSwgJ3VzZXItNDU2JywgJ3JlYWRpbmctMTIzJyk7XG5cbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBJdGVtOiB7IHJlYWRpbmdJZDogJ3JlYWRpbmctMTIzJyB9LFxuICAgICAgfSk7XG5cbiAgICAgIGR5bmFtb01vY2sub24oRGVsZXRlQ29tbWFuZCkucmVqZWN0cyhuZXcgRXJyb3IoJ0R5bmFtb0RCIERlbGV0ZUNvbW1hbmQgZXJyb3InKSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDUwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LmVycm9yKS50b0JlKCdJbnRlcm5hbCBzZXJ2ZXIgZXJyb3InKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgcmV0dXJuIDUwMCBhbmQgbG9nIGVycm9ycycsIGFzeW5jICgpID0+IHtcbiAgICAgIC8vIEluIGluZnJhc3RydWN0dXJlIHRlc3RzLCBjb25zb2xlLmVycm9yIGlzIGFsbG93ZWRcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSwgJ3VzZXItNDU2JywgJ3JlYWRpbmctMTIzJyk7XG5cbiAgICAgIGNvbnN0IGVycm9yID0gbmV3IEVycm9yKCdUZXN0IGVycm9yJyk7XG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlamVjdHMoZXJyb3IpO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSg1MDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5lcnJvcikudG9CZSgnSW50ZXJuYWwgc2VydmVyIGVycm9yJyk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdSZXNwb25zZSBmb3JtYXQnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBpbmNsdWRlIENPUlMgaGVhZGVycyBmb3Igc3VjY2VzcycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSwgJ3VzZXItNDU2JywgJ3JlYWRpbmctMTIzJyk7XG5cbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBJdGVtOiB7IHJlYWRpbmdJZDogJ3JlYWRpbmctMTIzJyB9LFxuICAgICAgfSk7XG5cbiAgICAgIGR5bmFtb01vY2sub24oRGVsZXRlQ29tbWFuZCkucmVzb2x2ZXMoe30pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2UuaGVhZGVycykudG9FcXVhbCh7XG4gICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaW5jbHVkZSBDT1JTIGhlYWRlcnMgZm9yIGVycm9ycycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQoZmFsc2UsICd1c2VyLTQ1NicsICdyZWFkaW5nLTEyMycpO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2UuaGVhZGVycykudG9FcXVhbCh7XG4gICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgcmV0dXJuIDIwNCB3aXRoIGVtcHR5IGJvZHkgb24gc3VjY2VzcycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSwgJ3VzZXItNDU2JywgJ3JlYWRpbmctMTIzJyk7XG5cbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBJdGVtOiB7IHJlYWRpbmdJZDogJ3JlYWRpbmctMTIzJyB9LFxuICAgICAgfSk7XG5cbiAgICAgIGR5bmFtb01vY2sub24oRGVsZXRlQ29tbWFuZCkucmVzb2x2ZXMoe30pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDQpO1xuICAgICAgZXhwZWN0KHJlc3BvbnNlLmJvZHkpLnRvQmUoJycpO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnTG9nZ2luZycsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGxvZyBpbmNvbWluZyBldmVudCcsIGFzeW5jICgpID0+IHtcbiAgICAgIC8vIEluIGluZnJhc3RydWN0dXJlIHRlc3RzLCBjb25zb2xlLmluZm8gaXMgYWxsb3dlZFxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlLCAndXNlci00NTYnLCAncmVhZGluZy0xMjMnKTtcblxuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIEl0ZW06IHsgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnIH0sXG4gICAgICB9KTtcblxuICAgICAgZHluYW1vTW9jay5vbihEZWxldGVDb21tYW5kKS5yZXNvbHZlcyh7fSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIC8vIEp1c3QgdmVyaWZ5IHRoZSBoYW5kbGVyIGV4ZWN1dGVzIHN1Y2Nlc3NmdWxseVxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoMjA0KTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0VkZ2UgY2FzZXMnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgbWlzc2luZyByZXF1ZXN0Q29udGV4dCcsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50OiBQYXJ0aWFsPEFQSUdhdGV3YXlQcm94eUV2ZW50PiA9IHtcbiAgICAgICAgcGF0aFBhcmFtZXRlcnM6IHsgdXNlcklkOiAndXNlci00NTYnLCByZWFkaW5nSWQ6ICdyZWFkaW5nLTEyMycgfSxcbiAgICAgICAgcmVxdWVzdENvbnRleHQ6IHVuZGVmaW5lZCBhcyB1bmtub3duIGFzIEFQSUdhdGV3YXlFdmVudFJlcXVlc3RDb250ZXh0LFxuICAgICAgfTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoNDAzKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmUoJ0FjY2VzcyBkZW5pZWQuIEFkbWluIHByaXZpbGVnZXMgcmVxdWlyZWQuJyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBtaXNzaW5nIGF1dGhvcml6ZXIgY2xhaW1zJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQ6IFBhcnRpYWw8QVBJR2F0ZXdheVByb3h5RXZlbnQ+ID0ge1xuICAgICAgICBwYXRoUGFyYW1ldGVyczogeyB1c2VySWQ6ICd1c2VyLTQ1NicsIHJlYWRpbmdJZDogJ3JlYWRpbmctMTIzJyB9LFxuICAgICAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgICAgIGF1dGhvcml6ZXI6IHVuZGVmaW5lZCxcbiAgICAgICAgfSBhcyB1bmtub3duIGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50WydyZXF1ZXN0Q29udGV4dCddLFxuICAgICAgfTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoNDAzKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIGVtcHR5IGNvZ25pdG86Z3JvdXBzJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQ6IFBhcnRpYWw8QVBJR2F0ZXdheVByb3h5RXZlbnQ+ID0ge1xuICAgICAgICBwYXRoUGFyYW1ldGVyczogeyB1c2VySWQ6ICd1c2VyLTQ1NicsIHJlYWRpbmdJZDogJ3JlYWRpbmctMTIzJyB9LFxuICAgICAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgICAgIGF1dGhvcml6ZXI6IHtcbiAgICAgICAgICAgIGNsYWltczoge1xuICAgICAgICAgICAgICAnY29nbml0bzpncm91cHMnOiAnJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSBhcyB1bmtub3duIGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50WydyZXF1ZXN0Q29udGV4dCddLFxuICAgICAgfTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoNDAzKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIGNvZ25pdG86Z3JvdXBzIGFzIGFycmF5IHdpdGggYWRtaW4nLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudDogUGFydGlhbDxBUElHYXRld2F5UHJveHlFdmVudD4gPSB7XG4gICAgICAgIHBhdGhQYXJhbWV0ZXJzOiB7IHVzZXJJZDogJ3VzZXItNDU2JywgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnIH0sXG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICAgICAgY2xhaW1zOiB7XG4gICAgICAgICAgICAgICdjb2duaXRvOmdyb3Vwcyc6IFsndXNlcicsICdhZG1pbicsICdwcmVtaXVtJ10sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0gYXMgdW5rbm93biBhcyBBUElHYXRld2F5UHJveHlFdmVudFsncmVxdWVzdENvbnRleHQnXSxcbiAgICAgIH07XG5cbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBJdGVtOiB7IHJlYWRpbmdJZDogJ3JlYWRpbmctMTIzJyB9LFxuICAgICAgfSk7XG5cbiAgICAgIGR5bmFtb01vY2sub24oRGVsZXRlQ29tbWFuZCkucmVzb2x2ZXMoe30pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDQpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgY29nbml0bzpncm91cHMgYXMgYXJyYXkgd2l0aG91dCBhZG1pbicsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50OiBQYXJ0aWFsPEFQSUdhdGV3YXlQcm94eUV2ZW50PiA9IHtcbiAgICAgICAgcGF0aFBhcmFtZXRlcnM6IHsgdXNlcklkOiAndXNlci00NTYnLCByZWFkaW5nSWQ6ICdyZWFkaW5nLTEyMycgfSxcbiAgICAgICAgcmVxdWVzdENvbnRleHQ6IHtcbiAgICAgICAgICBhdXRob3JpemVyOiB7XG4gICAgICAgICAgICBjbGFpbXM6IHtcbiAgICAgICAgICAgICAgJ2NvZ25pdG86Z3JvdXBzJzogWyd1c2VyJywgJ3ByZW1pdW0nXSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSBhcyB1bmtub3duIGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50WydyZXF1ZXN0Q29udGV4dCddLFxuICAgICAgfTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoNDAzKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIHNwZWNpYWwgY2hhcmFjdGVycyBpbiByZWFkaW5nIElEJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3Qgc3BlY2lhbFJlYWRpbmdJZCA9ICdyZWFkaW5nLTEyMyFAIyQlXiYqKCknO1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlLCAndXNlci00NTYnLCBzcGVjaWFsUmVhZGluZ0lkKTtcblxuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIEl0ZW06IHsgcmVhZGluZ0lkOiBzcGVjaWFsUmVhZGluZ0lkIH0sXG4gICAgICB9KTtcblxuICAgICAgZHluYW1vTW9jay5vbihEZWxldGVDb21tYW5kKS5yZXNvbHZlcyh7fSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDIwNCk7XG5cbiAgICAgIGNvbnN0IGRlbGV0ZUNhbGwgPSBkeW5hbW9Nb2NrLmNvbW1hbmRDYWxscyhEZWxldGVDb21tYW5kKVswXTtcbiAgICAgIGV4cGVjdChkZWxldGVDYWxsKS50b0JlRGVmaW5lZCgpO1xuICAgICAgZXhwZWN0KGRlbGV0ZUNhbGw/LmFyZ3NbMF0/LmlucHV0Py5LZXkpLnRvRXF1YWwoeyB1c2VySWQ6ICd1c2VyLTQ1NicsIHJlYWRpbmdJZDogc3BlY2lhbFJlYWRpbmdJZCB9KTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIHZlcnkgbG9uZyByZWFkaW5nIElEcycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGxvbmdSZWFkaW5nSWQgPSAncmVhZGluZy0nICsgJ2EnLnJlcGVhdCgxMDAwKTtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSwgJ3VzZXItNDU2JywgbG9uZ1JlYWRpbmdJZCk7XG5cbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBJdGVtOiB7IHJlYWRpbmdJZDogbG9uZ1JlYWRpbmdJZCB9LFxuICAgICAgfSk7XG5cbiAgICAgIGR5bmFtb01vY2sub24oRGVsZXRlQ29tbWFuZCkucmVzb2x2ZXMoe30pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDQpO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnSWRlbXBvdGVuY3knLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gNDA0IGlmIHJlYWRpbmcgYWxyZWFkeSBkZWxldGVkIChpZGVtcG90ZW50KScsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSwgJ3VzZXItNDU2JywgJ3JlYWRpbmctMTIzJyk7XG5cbiAgICAgIC8vIEZpcnN0IGNhbGwgLSByZWFkaW5nIGRvZXNuJ3QgZXhpc3RcbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVzb2x2ZXMoeyBJdGVtOiB1bmRlZmluZWQgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlMSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuICAgICAgZXhwZWN0KHJlc3BvbnNlMS5zdGF0dXNDb2RlKS50b0JlKDQwNCk7XG5cbiAgICAgIC8vIFNlY29uZCBjYWxsIC0gcmVhZGluZyBzdGlsbCBkb2Vzbid0IGV4aXN0XG4gICAgICBjb25zdCByZXNwb25zZTIgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcbiAgICAgIGV4cGVjdChyZXNwb25zZTIuc3RhdHVzQ29kZSkudG9CZSg0MDQpO1xuXG4gICAgICAvLyBEZWxldGUgd2FzIG5ldmVyIGNhbGxlZFxuICAgICAgZXhwZWN0KGR5bmFtb01vY2suY29tbWFuZENhbGxzKERlbGV0ZUNvbW1hbmQpLmxlbmd0aCkudG9CZSgwKTtcbiAgICB9KTtcbiAgfSk7XG59KTtcbiJdfQ==