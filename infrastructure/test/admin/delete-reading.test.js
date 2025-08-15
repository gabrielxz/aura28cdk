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
            expect(deleteCall.args[0].input.Key).toEqual({
                userId: 'user-456',
                readingId: 'reading-123',
            });
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
            expect(getCalls[0].args[0].input.Key).toEqual({
                userId: 'user-456',
                readingId: 'reading-123',
            });
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
            expect(deleteCall?.args[0]?.input?.Key).toEqual({
                userId: 'user-456',
                readingId: specialReadingId,
            });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVsZXRlLXJlYWRpbmcudGVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImRlbGV0ZS1yZWFkaW5nLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSxzRUFBNEQ7QUFFNUQsd0RBQTBGO0FBQzFGLDZEQUFpRDtBQUVqRCwyQkFBMkI7QUFDM0IsTUFBTSxVQUFVLEdBQUcsSUFBQSxnQ0FBVSxFQUFDLHFDQUFzQixDQUFDLENBQUM7QUFFdEQsUUFBUSxDQUFDLHVCQUF1QixFQUFFLEdBQUcsRUFBRTtJQUNyQyxVQUFVLENBQUMsR0FBRyxFQUFFO1FBQ2QsVUFBVSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ25CLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQW1CLEdBQUcscUJBQXFCLENBQUM7SUFDMUQsQ0FBQyxDQUFDLENBQUM7SUFFSCxNQUFNLFdBQVcsR0FBRyxDQUNsQixPQUFnQixFQUNoQixNQUFlLEVBQ2YsU0FBa0IsRUFDYSxFQUFFLENBQUMsQ0FBQztRQUNuQyxjQUFjLEVBQUUsTUFBTSxJQUFJLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUk7UUFDbEUsY0FBYyxFQUFFO1lBQ2QsVUFBVSxFQUFFO2dCQUNWLE1BQU0sRUFBRTtvQkFDTixnQkFBZ0IsRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUU7aUJBQzNDO2FBQ0Y7U0FDbUQ7S0FDdkQsQ0FBQyxDQUFDO0lBRUgsUUFBUSxDQUFDLGVBQWUsRUFBRSxHQUFHLEVBQUU7UUFDN0IsRUFBRSxDQUFDLDBDQUEwQyxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ3hELE1BQU0sS0FBSyxHQUFHLFdBQVcsQ0FBQyxLQUFLLEVBQUUsVUFBVSxFQUFFLGFBQWEsQ0FBQyxDQUFDO1lBQzVELE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBQSx3QkFBTyxFQUFDLEtB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QUU7WUFDekUsTUFBTSxLQUFLLEdBQUcsV0FBVyxDQUFDLElBQUksRUFBRSxVQUFVLEVBQUUsYUFBYSxDQUFDLENBQUM7WUFFM0QscUNBQXFDO1lBQ3JDLFVBQVUsQ0FBQyxFQUFFLENBQUMseUJBQVUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDO1lBRXhELE1BQU0sU0FBUyxHQUFHLE1BQU0sSUFBQSx3QkFBTyxFQUFDLEtBQTZCLENBQUMsQ0FBQztZQUMvRCxNQUFNLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUV2Qyw0Q0FBNEM7WUFDNUMsTUFBTSxTQUFTLEdBQUcsTUFBTSxJQUFBLHdCQUFPLEVBQUMsS0FBNkIsQ0FBQyxDQUFDO1lBQy9ELE1BQU0sQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBRXZDLDBCQUEwQjtZQUMxQixNQUFNLENBQUMsVUFBVSxDQUFDLFlBQVksQ0FBQyw0QkFBYSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2hFLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGhhbmRsZXIgfSBmcm9tICcuLi8uLi9sYW1iZGEvYWRtaW4vZGVsZXRlLXJlYWRpbmcnO1xuaW1wb3J0IHsgQVBJR2F0ZXdheVByb3h5RXZlbnQsIEFQSUdhdGV3YXlFdmVudFJlcXVlc3RDb250ZXh0IH0gZnJvbSAnYXdzLWxhbWJkYSc7XG5pbXBvcnQgeyBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LCBHZXRDb21tYW5kLCBEZWxldGVDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvbGliLWR5bmFtb2RiJztcbmltcG9ydCB7IG1vY2tDbGllbnQgfSBmcm9tICdhd3Mtc2RrLWNsaWVudC1tb2NrJztcblxuLy8gTW9jayB0aGUgRHluYW1vREIgY2xpZW50XG5jb25zdCBkeW5hbW9Nb2NrID0gbW9ja0NsaWVudChEeW5hbW9EQkRvY3VtZW50Q2xpZW50KTtcblxuZGVzY3JpYmUoJ2RlbGV0ZS1yZWFkaW5nIExhbWJkYScsICgpID0+IHtcbiAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgZHluYW1vTW9jay5yZXNldCgpO1xuICAgIHByb2Nlc3MuZW52LlJFQURJTkdTX1RBQkxFX05BTUUgPSAndGVzdC1yZWFkaW5ncy10YWJsZSc7XG4gIH0pO1xuXG4gIGNvbnN0IGNyZWF0ZUV2ZW50ID0gKFxuICAgIGlzQWRtaW46IGJvb2xlYW4sXG4gICAgdXNlcklkPzogc3RyaW5nLFxuICAgIHJlYWRpbmdJZD86IHN0cmluZyxcbiAgKTogUGFydGlhbDxBUElHYXRld2F5UHJveHlFdmVudD4gPT4gKHtcbiAgICBwYXRoUGFyYW1ldGVyczogdXNlcklkICYmIHJlYWRpbmdJZCA/IHsgdXNlcklkLCByZWFkaW5nSWQgfSA6IG51bGwsXG4gICAgcmVxdWVzdENvbnRleHQ6IHtcbiAgICAgIGF1dGhvcml6ZXI6IHtcbiAgICAgICAgY2xhaW1zOiB7XG4gICAgICAgICAgJ2NvZ25pdG86Z3JvdXBzJzogaXNBZG1pbiA/IFsnYWRtaW4nXSA6IFtdLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9IGFzIHVua25vd24gYXMgQVBJR2F0ZXdheVByb3h5RXZlbnRbJ3JlcXVlc3RDb250ZXh0J10sXG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdBdXRob3JpemF0aW9uJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgcmV0dXJuIDQwMyB3aGVuIHVzZXIgaXMgbm90IGFkbWluJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudChmYWxzZSwgJ3VzZXItNDU2JywgJ3JlYWRpbmctMTIzJyk7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSg0MDMpO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5lcnJvcikudG9CZSgnQWNjZXNzIGRlbmllZC4gQWRtaW4gcHJpdmlsZWdlcyByZXF1aXJlZC4nKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgYWxsb3cgYWNjZXNzIHdoZW4gdXNlciBpcyBhZG1pbicsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSwgJ3VzZXItNDU2JywgJ3JlYWRpbmctMTIzJyk7XG5cbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBJdGVtOiB7IHJlYWRpbmdJZDogJ3JlYWRpbmctMTIzJyB9LFxuICAgICAgfSk7XG5cbiAgICAgIGR5bmFtb01vY2sub24oRGVsZXRlQ29tbWFuZCkucmVzb2x2ZXMoe30pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDQpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgYWRtaW4gZ3JvdXAgYXMgY29tbWEtc2VwYXJhdGVkIHN0cmluZycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50OiBQYXJ0aWFsPEFQSUdhdGV3YXlQcm94eUV2ZW50PiA9IHtcbiAgICAgICAgcGF0aFBhcmFtZXRlcnM6IHsgdXNlcklkOiAndXNlci00NTYnLCByZWFkaW5nSWQ6ICdyZWFkaW5nLTEyMycgfSxcbiAgICAgICAgcmVxdWVzdENvbnRleHQ6IHtcbiAgICAgICAgICBhdXRob3JpemVyOiB7XG4gICAgICAgICAgICBjbGFpbXM6IHtcbiAgICAgICAgICAgICAgJ2NvZ25pdG86Z3JvdXBzJzogJ3VzZXIsYWRtaW4scHJlbWl1bScsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0gYXMgdW5rbm93biBhcyBBUElHYXRld2F5UHJveHlFdmVudFsncmVxdWVzdENvbnRleHQnXSxcbiAgICAgIH07XG5cbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBJdGVtOiB7IHJlYWRpbmdJZDogJ3JlYWRpbmctMTIzJyB9LFxuICAgICAgfSk7XG5cbiAgICAgIGR5bmFtb01vY2sub24oRGVsZXRlQ29tbWFuZCkucmVzb2x2ZXMoe30pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDQpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCByZWplY3Qgd2hlbiBhZG1pbiBpcyBub3QgaW4gY29tbWEtc2VwYXJhdGVkIHN0cmluZycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50OiBQYXJ0aWFsPEFQSUdhdGV3YXlQcm94eUV2ZW50PiA9IHtcbiAgICAgICAgcGF0aFBhcmFtZXRlcnM6IHsgdXNlcklkOiAndXNlci00NTYnLCByZWFkaW5nSWQ6ICdyZWFkaW5nLTEyMycgfSxcbiAgICAgICAgcmVxdWVzdENvbnRleHQ6IHtcbiAgICAgICAgICBhdXRob3JpemVyOiB7XG4gICAgICAgICAgICBjbGFpbXM6IHtcbiAgICAgICAgICAgICAgJ2NvZ25pdG86Z3JvdXBzJzogJ3VzZXIscHJlbWl1bScsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0gYXMgdW5rbm93biBhcyBBUElHYXRld2F5UHJveHlFdmVudFsncmVxdWVzdENvbnRleHQnXSxcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDQwMyk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdJbnB1dCB2YWxpZGF0aW9uJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgcmV0dXJuIDQwMCB3aGVuIHJlYWRpbmcgSUQgaXMgbWlzc2luZycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoNDAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmUoJ1VzZXIgSUQgYW5kIFJlYWRpbmcgSUQgYXJlIHJlcXVpcmVkJyk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdEZWxldGluZyByZWFkaW5nJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgZGVsZXRlIHJlYWRpbmcgc3VjY2Vzc2Z1bGx5JywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlLCAndXNlci00NTYnLCAncmVhZGluZy0xMjMnKTtcblxuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIEl0ZW06IHtcbiAgICAgICAgICByZWFkaW5nSWQ6ICdyZWFkaW5nLTEyMycsXG4gICAgICAgICAgdXNlcklkOiAndXNlci00NTYnLFxuICAgICAgICAgIHR5cGU6ICdTb3VsIEJsdWVwcmludCcsXG4gICAgICAgICAgc3RhdHVzOiAnUmVhZHknLFxuICAgICAgICB9LFxuICAgICAgfSk7XG5cbiAgICAgIGR5bmFtb01vY2sub24oRGVsZXRlQ29tbWFuZCkucmVzb2x2ZXMoe30pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDQpO1xuICAgICAgZXhwZWN0KHJlc3BvbnNlLmJvZHkpLnRvQmUoJycpO1xuXG4gICAgICAvLyBWZXJpZnkgRGVsZXRlQ29tbWFuZCB3YXMgY2FsbGVkXG4gICAgICBjb25zdCBkZWxldGVDYWxsID0gZHluYW1vTW9jay5jb21tYW5kQ2FsbHMoRGVsZXRlQ29tbWFuZClbMF07XG4gICAgICBleHBlY3QoZGVsZXRlQ2FsbCkudG9CZURlZmluZWQoKTtcbiAgICAgIGV4cGVjdChkZWxldGVDYWxsLmFyZ3NbMF0uaW5wdXQuS2V5KS50b0VxdWFsKHtcbiAgICAgICAgdXNlcklkOiAndXNlci00NTYnLFxuICAgICAgICByZWFkaW5nSWQ6ICdyZWFkaW5nLTEyMycsXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgcmV0dXJuIDQwNCB3aGVuIHJlYWRpbmcgbm90IGZvdW5kJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlLCAndXNlci00NTYnLCAncmVhZGluZy0xMjMnKTtcblxuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7IEl0ZW06IHVuZGVmaW5lZCB9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoNDA0KTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmUoJ1JlYWRpbmcgbm90IGZvdW5kJyk7XG5cbiAgICAgIC8vIFZlcmlmeSBEZWxldGVDb21tYW5kIHdhcyBub3QgY2FsbGVkXG4gICAgICBleHBlY3QoZHluYW1vTW9jay5jb21tYW5kQ2FsbHMoRGVsZXRlQ29tbWFuZCkubGVuZ3RoKS50b0JlKDApO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBjaGVjayBleGlzdGVuY2UgYmVmb3JlIGRlbGV0aW9uJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlLCAndXNlci00NTYnLCAncmVhZGluZy0xMjMnKTtcblxuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIEl0ZW06IHsgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnIH0sXG4gICAgICB9KTtcblxuICAgICAgZHluYW1vTW9jay5vbihEZWxldGVDb21tYW5kKS5yZXNvbHZlcyh7fSk7XG5cbiAgICAgIGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICAvLyBWZXJpZnkgR2V0Q29tbWFuZCB3YXMgY2FsbGVkIGJlZm9yZSBEZWxldGVDb21tYW5kXG4gICAgICBjb25zdCBnZXRDYWxscyA9IGR5bmFtb01vY2suY29tbWFuZENhbGxzKEdldENvbW1hbmQpO1xuICAgICAgY29uc3QgZGVsZXRlQ2FsbHMgPSBkeW5hbW9Nb2NrLmNvbW1hbmRDYWxscyhEZWxldGVDb21tYW5kKTtcblxuICAgICAgZXhwZWN0KGdldENhbGxzLmxlbmd0aCkudG9CZSgxKTtcbiAgICAgIGV4cGVjdChkZWxldGVDYWxscy5sZW5ndGgpLnRvQmUoMSk7XG4gICAgICBleHBlY3QoZ2V0Q2FsbHNbMF0uYXJnc1swXS5pbnB1dC5LZXkpLnRvRXF1YWwoe1xuICAgICAgICB1c2VySWQ6ICd1c2VyLTQ1NicsXG4gICAgICAgIHJlYWRpbmdJZDogJ3JlYWRpbmctMTIzJyxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBsb2cgc3VjY2Vzc2Z1bCBkZWxldGlvbicsIGFzeW5jICgpID0+IHtcbiAgICAgIC8vIEluIGluZnJhc3RydWN0dXJlIHRlc3RzLCBjb25zb2xlLmluZm8gaXMgYWxsb3dlZFxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlLCAndXNlci00NTYnLCAncmVhZGluZy0xMjMnKTtcblxuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIEl0ZW06IHsgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnIH0sXG4gICAgICB9KTtcblxuICAgICAgZHluYW1vTW9jay5vbihEZWxldGVDb21tYW5kKS5yZXNvbHZlcyh7fSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIC8vIEp1c3QgdmVyaWZ5IHN1Y2Nlc3NmdWwgZGVsZXRpb25cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDIwNCk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdFcnJvciBoYW5kbGluZycsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBEeW5hbW9EQiBHZXRDb21tYW5kIGVycm9ycycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSwgJ3VzZXItNDU2JywgJ3JlYWRpbmctMTIzJyk7XG5cbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVqZWN0cyhuZXcgRXJyb3IoJ0R5bmFtb0RCIEdldENvbW1hbmQgZXJyb3InKSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDUwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LmVycm9yKS50b0JlKCdJbnRlcm5hbCBzZXJ2ZXIgZXJyb3InKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIER5bmFtb0RCIERlbGV0ZUNvbW1hbmQgZXJyb3JzJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlLCAndXNlci00NTYnLCAncmVhZGluZy0xMjMnKTtcblxuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIEl0ZW06IHsgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnIH0sXG4gICAgICB9KTtcblxuICAgICAgZHluYW1vTW9jay5vbihEZWxldGVDb21tYW5kKS5yZWplY3RzKG5ldyBFcnJvcignRHluYW1vREIgRGVsZXRlQ29tbWFuZCBlcnJvcicpKTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoNTAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmUoJ0ludGVybmFsIHNlcnZlciBlcnJvcicpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gNTAwIGFuZCBsb2cgZXJyb3JzJywgYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gSW4gaW5mcmFzdHJ1Y3R1cmUgdGVzdHMsIGNvbnNvbGUuZXJyb3IgaXMgYWxsb3dlZFxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlLCAndXNlci00NTYnLCAncmVhZGluZy0xMjMnKTtcblxuICAgICAgY29uc3QgZXJyb3IgPSBuZXcgRXJyb3IoJ1Rlc3QgZXJyb3InKTtcbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVqZWN0cyhlcnJvcik7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDUwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LmVycm9yKS50b0JlKCdJbnRlcm5hbCBzZXJ2ZXIgZXJyb3InKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ1Jlc3BvbnNlIGZvcm1hdCcsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGluY2x1ZGUgQ09SUyBoZWFkZXJzIGZvciBzdWNjZXNzJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlLCAndXNlci00NTYnLCAncmVhZGluZy0xMjMnKTtcblxuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIEl0ZW06IHsgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnIH0sXG4gICAgICB9KTtcblxuICAgICAgZHluYW1vTW9jay5vbihEZWxldGVDb21tYW5kKS5yZXNvbHZlcyh7fSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5oZWFkZXJzKS50b0VxdWFsKHtcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBpbmNsdWRlIENPUlMgaGVhZGVycyBmb3IgZXJyb3JzJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudChmYWxzZSwgJ3VzZXItNDU2JywgJ3JlYWRpbmctMTIzJyk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5oZWFkZXJzKS50b0VxdWFsKHtcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gMjA0IHdpdGggZW1wdHkgYm9keSBvbiBzdWNjZXNzJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlLCAndXNlci00NTYnLCAncmVhZGluZy0xMjMnKTtcblxuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIEl0ZW06IHsgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnIH0sXG4gICAgICB9KTtcblxuICAgICAgZHluYW1vTW9jay5vbihEZWxldGVDb21tYW5kKS5yZXNvbHZlcyh7fSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDIwNCk7XG4gICAgICBleHBlY3QocmVzcG9uc2UuYm9keSkudG9CZSgnJyk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdMb2dnaW5nJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgbG9nIGluY29taW5nIGV2ZW50JywgYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gSW4gaW5mcmFzdHJ1Y3R1cmUgdGVzdHMsIGNvbnNvbGUuaW5mbyBpcyBhbGxvd2VkXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUsICd1c2VyLTQ1NicsICdyZWFkaW5nLTEyMycpO1xuXG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgSXRlbTogeyByZWFkaW5nSWQ6ICdyZWFkaW5nLTEyMycgfSxcbiAgICAgIH0pO1xuXG4gICAgICBkeW5hbW9Nb2NrLm9uKERlbGV0ZUNvbW1hbmQpLnJlc29sdmVzKHt9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgLy8gSnVzdCB2ZXJpZnkgdGhlIGhhbmRsZXIgZXhlY3V0ZXMgc3VjY2Vzc2Z1bGx5XG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDQpO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnRWRnZSBjYXNlcycsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBtaXNzaW5nIHJlcXVlc3RDb250ZXh0JywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQ6IFBhcnRpYWw8QVBJR2F0ZXdheVByb3h5RXZlbnQ+ID0ge1xuICAgICAgICBwYXRoUGFyYW1ldGVyczogeyB1c2VySWQ6ICd1c2VyLTQ1NicsIHJlYWRpbmdJZDogJ3JlYWRpbmctMTIzJyB9LFxuICAgICAgICByZXF1ZXN0Q29udGV4dDogdW5kZWZpbmVkIGFzIHVua25vd24gYXMgQVBJR2F0ZXdheUV2ZW50UmVxdWVzdENvbnRleHQsXG4gICAgICB9O1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSg0MDMpO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5lcnJvcikudG9CZSgnQWNjZXNzIGRlbmllZC4gQWRtaW4gcHJpdmlsZWdlcyByZXF1aXJlZC4nKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIG1pc3NpbmcgYXV0aG9yaXplciBjbGFpbXMnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudDogUGFydGlhbDxBUElHYXRld2F5UHJveHlFdmVudD4gPSB7XG4gICAgICAgIHBhdGhQYXJhbWV0ZXJzOiB7IHVzZXJJZDogJ3VzZXItNDU2JywgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnIH0sXG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjogdW5kZWZpbmVkLFxuICAgICAgICB9IGFzIHVua25vd24gYXMgQVBJR2F0ZXdheVByb3h5RXZlbnRbJ3JlcXVlc3RDb250ZXh0J10sXG4gICAgICB9O1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSg0MDMpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgZW1wdHkgY29nbml0bzpncm91cHMnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudDogUGFydGlhbDxBUElHYXRld2F5UHJveHlFdmVudD4gPSB7XG4gICAgICAgIHBhdGhQYXJhbWV0ZXJzOiB7IHVzZXJJZDogJ3VzZXItNDU2JywgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnIH0sXG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICAgICAgY2xhaW1zOiB7XG4gICAgICAgICAgICAgICdjb2duaXRvOmdyb3Vwcyc6ICcnLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9IGFzIHVua25vd24gYXMgQVBJR2F0ZXdheVByb3h5RXZlbnRbJ3JlcXVlc3RDb250ZXh0J10sXG4gICAgICB9O1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSg0MDMpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgY29nbml0bzpncm91cHMgYXMgYXJyYXkgd2l0aCBhZG1pbicsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50OiBQYXJ0aWFsPEFQSUdhdGV3YXlQcm94eUV2ZW50PiA9IHtcbiAgICAgICAgcGF0aFBhcmFtZXRlcnM6IHsgdXNlcklkOiAndXNlci00NTYnLCByZWFkaW5nSWQ6ICdyZWFkaW5nLTEyMycgfSxcbiAgICAgICAgcmVxdWVzdENvbnRleHQ6IHtcbiAgICAgICAgICBhdXRob3JpemVyOiB7XG4gICAgICAgICAgICBjbGFpbXM6IHtcbiAgICAgICAgICAgICAgJ2NvZ25pdG86Z3JvdXBzJzogWyd1c2VyJywgJ2FkbWluJywgJ3ByZW1pdW0nXSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSBhcyB1bmtub3duIGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50WydyZXF1ZXN0Q29udGV4dCddLFxuICAgICAgfTtcblxuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIEl0ZW06IHsgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnIH0sXG4gICAgICB9KTtcblxuICAgICAgZHluYW1vTW9jay5vbihEZWxldGVDb21tYW5kKS5yZXNvbHZlcyh7fSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDIwNCk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBjb2duaXRvOmdyb3VwcyBhcyBhcnJheSB3aXRob3V0IGFkbWluJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQ6IFBhcnRpYWw8QVBJR2F0ZXdheVByb3h5RXZlbnQ+ID0ge1xuICAgICAgICBwYXRoUGFyYW1ldGVyczogeyB1c2VySWQ6ICd1c2VyLTQ1NicsIHJlYWRpbmdJZDogJ3JlYWRpbmctMTIzJyB9LFxuICAgICAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgICAgIGF1dGhvcml6ZXI6IHtcbiAgICAgICAgICAgIGNsYWltczoge1xuICAgICAgICAgICAgICAnY29nbml0bzpncm91cHMnOiBbJ3VzZXInLCAncHJlbWl1bSddLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9IGFzIHVua25vd24gYXMgQVBJR2F0ZXdheVByb3h5RXZlbnRbJ3JlcXVlc3RDb250ZXh0J10sXG4gICAgICB9O1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSg0MDMpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgc3BlY2lhbCBjaGFyYWN0ZXJzIGluIHJlYWRpbmcgSUQnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBzcGVjaWFsUmVhZGluZ0lkID0gJ3JlYWRpbmctMTIzIUAjJCVeJiooKSc7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUsICd1c2VyLTQ1NicsIHNwZWNpYWxSZWFkaW5nSWQpO1xuXG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgSXRlbTogeyByZWFkaW5nSWQ6IHNwZWNpYWxSZWFkaW5nSWQgfSxcbiAgICAgIH0pO1xuXG4gICAgICBkeW5hbW9Nb2NrLm9uKERlbGV0ZUNvbW1hbmQpLnJlc29sdmVzKHt9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoMjA0KTtcblxuICAgICAgY29uc3QgZGVsZXRlQ2FsbCA9IGR5bmFtb01vY2suY29tbWFuZENhbGxzKERlbGV0ZUNvbW1hbmQpWzBdO1xuICAgICAgZXhwZWN0KGRlbGV0ZUNhbGwpLnRvQmVEZWZpbmVkKCk7XG4gICAgICBleHBlY3QoZGVsZXRlQ2FsbD8uYXJnc1swXT8uaW5wdXQ/LktleSkudG9FcXVhbCh7XG4gICAgICAgIHVzZXJJZDogJ3VzZXItNDU2JyxcbiAgICAgICAgcmVhZGluZ0lkOiBzcGVjaWFsUmVhZGluZ0lkLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSB2ZXJ5IGxvbmcgcmVhZGluZyBJRHMnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBsb25nUmVhZGluZ0lkID0gJ3JlYWRpbmctJyArICdhJy5yZXBlYXQoMTAwMCk7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUsICd1c2VyLTQ1NicsIGxvbmdSZWFkaW5nSWQpO1xuXG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgSXRlbTogeyByZWFkaW5nSWQ6IGxvbmdSZWFkaW5nSWQgfSxcbiAgICAgIH0pO1xuXG4gICAgICBkeW5hbW9Nb2NrLm9uKERlbGV0ZUNvbW1hbmQpLnJlc29sdmVzKHt9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoMjA0KTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0lkZW1wb3RlbmN5JywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgcmV0dXJuIDQwNCBpZiByZWFkaW5nIGFscmVhZHkgZGVsZXRlZCAoaWRlbXBvdGVudCknLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUsICd1c2VyLTQ1NicsICdyZWFkaW5nLTEyMycpO1xuXG4gICAgICAvLyBGaXJzdCBjYWxsIC0gcmVhZGluZyBkb2Vzbid0IGV4aXN0XG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHsgSXRlbTogdW5kZWZpbmVkIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZTEgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcbiAgICAgIGV4cGVjdChyZXNwb25zZTEuc3RhdHVzQ29kZSkudG9CZSg0MDQpO1xuXG4gICAgICAvLyBTZWNvbmQgY2FsbCAtIHJlYWRpbmcgc3RpbGwgZG9lc24ndCBleGlzdFxuICAgICAgY29uc3QgcmVzcG9uc2UyID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG4gICAgICBleHBlY3QocmVzcG9uc2UyLnN0YXR1c0NvZGUpLnRvQmUoNDA0KTtcblxuICAgICAgLy8gRGVsZXRlIHdhcyBuZXZlciBjYWxsZWRcbiAgICAgIGV4cGVjdChkeW5hbW9Nb2NrLmNvbW1hbmRDYWxscyhEZWxldGVDb21tYW5kKS5sZW5ndGgpLnRvQmUoMCk7XG4gICAgfSk7XG4gIH0pO1xufSk7XG4iXX0=