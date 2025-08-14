"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const get_reading_details_1 = require("../../lambda/admin/get-reading-details");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const aws_sdk_client_mock_1 = require("aws-sdk-client-mock");
// Mock the DynamoDB client
const dynamoMock = (0, aws_sdk_client_mock_1.mockClient)(lib_dynamodb_1.DynamoDBDocumentClient);
describe('get-reading-details Lambda', () => {
    beforeEach(() => {
        dynamoMock.reset();
        process.env.READINGS_TABLE_NAME = 'test-readings-table';
        process.env.USER_TABLE_NAME = 'test-user-table';
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
            const response = await (0, get_reading_details_1.handler)(event);
            expect(response.statusCode).toBe(403);
            const body = JSON.parse(response.body);
            expect(body.error).toBe('Access denied. Admin privileges required.');
        });
        it('should allow access when user is admin', async () => {
            const event = createEvent(true, 'user-456', 'reading-123');
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({
                Item: {
                    readingId: 'reading-123',
                    userId: 'user-456',
                    type: 'Soul Blueprint',
                    status: 'Ready',
                    createdAt: '2024-01-01T00:00:00Z',
                    updatedAt: '2024-01-01T00:01:00Z',
                },
            });
            const response = await (0, get_reading_details_1.handler)(event);
            expect(response.statusCode).toBe(200);
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
                Item: {
                    readingId: 'reading-123',
                    userId: 'user-456',
                },
            });
            const response = await (0, get_reading_details_1.handler)(event);
            expect(response.statusCode).toBe(200);
        });
    });
    describe('Input validation', () => {
        it('should return 400 when reading ID is missing', async () => {
            const event = createEvent(true, undefined, undefined);
            const response = await (0, get_reading_details_1.handler)(event);
            expect(response.statusCode).toBe(400);
            const body = JSON.parse(response.body);
            expect(body.error).toBe('User ID and Reading ID are required');
        });
    });
    describe('Fetching reading details', () => {
        it('should fetch and return reading details successfully', async () => {
            const event = createEvent(true, 'user-456', 'reading-123');
            const mockReading = {
                readingId: 'reading-123',
                userId: 'user-456',
                type: 'Soul Blueprint',
                status: 'Ready',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:01:00Z',
                content: {
                    interpretation: 'Test interpretation',
                    insights: ['Insight 1', 'Insight 2'],
                    recommendations: ['Recommendation 1'],
                },
                metadata: {
                    model: 'gpt-4',
                    temperature: 0.7,
                    maxTokens: 2000,
                    processingTime: 5432,
                },
            };
            const mockUser = {
                userId: 'user-456',
                email: 'test@example.com',
            };
            dynamoMock
                .on(lib_dynamodb_1.GetCommand)
                .resolvesOnce({ Item: mockReading })
                .resolvesOnce({ Item: mockUser });
            const response = await (0, get_reading_details_1.handler)(event);
            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.body);
            expect(body.readingId).toBe('reading-123');
            expect(body.userEmail).toBe('test@example.com');
            expect(body.content).toEqual(mockReading.content);
            expect(body.metadata).toEqual(mockReading.metadata);
        });
        it('should return 404 when reading not found', async () => {
            const event = createEvent(true, 'user-456', 'reading-123');
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({ Item: undefined });
            const response = await (0, get_reading_details_1.handler)(event);
            expect(response.statusCode).toBe(404);
            const body = JSON.parse(response.body);
            expect(body.error).toBe('Reading not found');
        });
        it('should handle reading without userId', async () => {
            const event = createEvent(true, 'user-456', 'reading-123');
            const mockReading = {
                readingId: 'reading-123',
                type: 'Soul Blueprint',
                status: 'Ready',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:01:00Z',
            };
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({ Item: mockReading });
            const response = await (0, get_reading_details_1.handler)(event);
            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.body);
            expect(body.userEmail).toBeUndefined();
        });
        it('should handle user not found in user table', async () => {
            const event = createEvent(true, 'user-456', 'reading-123');
            const mockReading = {
                readingId: 'reading-123',
                userId: 'user-456',
                type: 'Soul Blueprint',
                status: 'Ready',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:01:00Z',
            };
            dynamoMock
                .on(lib_dynamodb_1.GetCommand)
                .resolvesOnce({ Item: mockReading })
                .resolvesOnce({ Item: undefined });
            const response = await (0, get_reading_details_1.handler)(event);
            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.body);
            expect(body.userEmail).toBeUndefined();
        });
        it('should warn but continue when user fetch fails', async () => {
            // In infrastructure tests, console.warn is allowed
            const event = createEvent(true, 'user-456', 'reading-123');
            const mockReading = {
                readingId: 'reading-123',
                userId: 'user-456',
                type: 'Soul Blueprint',
                status: 'Ready',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:01:00Z',
            };
            dynamoMock
                .on(lib_dynamodb_1.GetCommand)
                .resolvesOnce({ Item: mockReading })
                .rejectsOnce(new Error('User table error'));
            const response = await (0, get_reading_details_1.handler)(event);
            // Should still return 200 even if user fetch fails
            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.body);
            expect(body.readingId).toBe('reading-123');
            expect(body.userEmail).toBeUndefined();
        });
        it('should handle reading with error field', async () => {
            const event = createEvent(true, 'user-456', 'reading-123');
            const mockReading = {
                readingId: 'reading-123',
                userId: 'user-456',
                type: 'Soul Blueprint',
                status: 'Failed',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:01:00Z',
                error: 'Processing failed due to invalid input',
            };
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({ Item: mockReading });
            const response = await (0, get_reading_details_1.handler)(event);
            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.body);
            expect(body.error).toBe('Processing failed due to invalid input');
            expect(body.status).toBe('Failed');
        });
        it('should return null for missing optional fields', async () => {
            const event = createEvent(true, 'user-456', 'reading-123');
            const mockReading = {
                readingId: 'reading-123',
                userId: 'user-456',
                type: 'Soul Blueprint',
                status: 'Processing',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:01:00Z',
            };
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({ Item: mockReading });
            const response = await (0, get_reading_details_1.handler)(event);
            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.body);
            expect(body.content).toBeNull();
            expect(body.error).toBeNull();
            expect(body.metadata).toBeNull();
        });
    });
    describe('Error handling', () => {
        it('should handle DynamoDB errors', async () => {
            const event = createEvent(true, 'user-456', 'reading-123');
            dynamoMock.on(lib_dynamodb_1.GetCommand).rejects(new Error('DynamoDB error'));
            const response = await (0, get_reading_details_1.handler)(event);
            expect(response.statusCode).toBe(500);
            const body = JSON.parse(response.body);
            expect(body.error).toBe('Internal server error');
        });
        it('should return 500 and log errors', async () => {
            // In infrastructure tests, console.error is allowed
            const event = createEvent(true, 'user-456', 'reading-123');
            const error = new Error('Test error');
            dynamoMock.on(lib_dynamodb_1.GetCommand).rejects(error);
            const response = await (0, get_reading_details_1.handler)(event);
            expect(response.statusCode).toBe(500);
            const body = JSON.parse(response.body);
            expect(body.error).toBe('Internal server error');
        });
    });
    describe('Response format', () => {
        it('should include CORS headers', async () => {
            const event = createEvent(true, 'user-456', 'reading-123');
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({
                Item: {
                    readingId: 'reading-123',
                    userId: 'user-456',
                },
            });
            const response = await (0, get_reading_details_1.handler)(event);
            expect(response.headers).toEqual({
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            });
        });
        it('should return proper response structure', async () => {
            const event = createEvent(true, 'user-456', 'reading-123');
            const mockReading = {
                readingId: 'reading-123',
                userId: 'user-456',
                type: 'Natal Chart',
                status: 'Ready',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:01:00Z',
                content: {
                    interpretation: 'Test',
                },
            };
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({ Item: mockReading });
            const response = await (0, get_reading_details_1.handler)(event);
            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.body);
            expect(body).toHaveProperty('readingId');
            expect(body).toHaveProperty('userId');
            expect(body).toHaveProperty('type');
            expect(body).toHaveProperty('status');
            expect(body).toHaveProperty('createdAt');
            expect(body).toHaveProperty('updatedAt');
            expect(body).toHaveProperty('content');
            expect(body).toHaveProperty('error');
            expect(body).toHaveProperty('metadata');
        });
    });
    describe('Logging', () => {
        it('should log incoming event', async () => {
            // In infrastructure tests, console.info is allowed
            const event = createEvent(true, 'user-456', 'reading-123');
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({
                Item: { readingId: 'reading-123' },
            });
            const response = await (0, get_reading_details_1.handler)(event);
            // Just verify the handler executes successfully
            expect(response.statusCode).toBe(200);
        });
    });
    describe('Edge cases', () => {
        it('should handle missing requestContext', async () => {
            const event = {
                pathParameters: { userId: 'user-456', readingId: 'reading-123' },
                requestContext: undefined,
            };
            const response = await (0, get_reading_details_1.handler)(event);
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
            const response = await (0, get_reading_details_1.handler)(event);
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
            const response = await (0, get_reading_details_1.handler)(event);
            expect(response.statusCode).toBe(403);
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
            const response = await (0, get_reading_details_1.handler)(event);
            expect(response.statusCode).toBe(403);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2V0LXJlYWRpbmctZGV0YWlscy50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZ2V0LXJlYWRpbmctZGV0YWlscy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsZ0ZBQWlFO0FBRWpFLHdEQUEyRTtBQUMzRSw2REFBaUQ7QUFFakQsMkJBQTJCO0FBQzNCLE1BQU0sVUFBVSxHQUFHLElBQUEsZ0NBQVUsRUFBQyxxQ0FBc0IsQ0FBQyxDQUFDO0FBRXRELFFBQVEsQ0FBQyw0QkFBNEIsRUFBRSxHQUFHLEVBQUU7SUFDMUMsVUFBVSxDQUFDLEdBQUcsRUFBRTtRQUNkLFVBQVUsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNuQixPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFtQixHQUFHLHFCQUFxQixDQUFDO1FBQ3hELE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZSxHQUFHLGlCQUFpQixDQUFDO0lBQ2xELENBQUMsQ0FBQyxDQUFDO0lBRUgsTUFBTSxXQUFXLEdBQUcsQ0FBQyxPQUFnQixFQUFFLE1BQWUsRUFBRSxTQUFrQixFQUFpQyxFQUFFLENBQUMsQ0FBQztRQUM3RyxjQUFjLEVBQUUsTUFBTSxJQUFJLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUk7UUFDbEUsY0FBYyxFQUFFO1lBQ2QsVUFBVSxFQUFFO2dCQUNWLE1BQU0sRUFBRTtvQkFDTixnQkFBZ0IsRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUU7aUJBQzNDO2FBQ0Y7U0FDbUQ7S0FDdkQsQ0FBQyxDQUFDO0lBRUgsUUFBUSxDQUFDLGVBQWUsRUFBRSxHQUFHLEVBQUU7UUFDN0IsRUFBRSxDQUFDLDBDQUEwQyxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ3hELE1BQU0sS0FBSyxHQUFHLFdBQVcsQ0FBQyxLQUFLLEVBQUUsVUFBVSxFQUFFLGFB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O0lBQ0wsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGhhbmRsZXIgfSBmcm9tICcuLi8uLi9sYW1iZGEvYWRtaW4vZ2V0LXJlYWRpbmctZGV0YWlscyc7XG5pbXBvcnQgeyBBUElHYXRld2F5UHJveHlFdmVudCwgQVBJR2F0ZXdheUV2ZW50UmVxdWVzdENvbnRleHQgfSBmcm9tICdhd3MtbGFtYmRhJztcbmltcG9ydCB7IER5bmFtb0RCRG9jdW1lbnRDbGllbnQsIEdldENvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9saWItZHluYW1vZGInO1xuaW1wb3J0IHsgbW9ja0NsaWVudCB9IGZyb20gJ2F3cy1zZGstY2xpZW50LW1vY2snO1xuXG4vLyBNb2NrIHRoZSBEeW5hbW9EQiBjbGllbnRcbmNvbnN0IGR5bmFtb01vY2sgPSBtb2NrQ2xpZW50KER5bmFtb0RCRG9jdW1lbnRDbGllbnQpO1xuXG5kZXNjcmliZSgnZ2V0LXJlYWRpbmctZGV0YWlscyBMYW1iZGEnLCAoKSA9PiB7XG4gIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgIGR5bmFtb01vY2sucmVzZXQoKTtcbiAgICBwcm9jZXNzLmVudi5SRUFESU5HU19UQUJMRV9OQU1FID0gJ3Rlc3QtcmVhZGluZ3MtdGFibGUnO1xuICAgIHByb2Nlc3MuZW52LlVTRVJfVEFCTEVfTkFNRSA9ICd0ZXN0LXVzZXItdGFibGUnO1xuICB9KTtcblxuICBjb25zdCBjcmVhdGVFdmVudCA9IChpc0FkbWluOiBib29sZWFuLCB1c2VySWQ/OiBzdHJpbmcsIHJlYWRpbmdJZD86IHN0cmluZyk6IFBhcnRpYWw8QVBJR2F0ZXdheVByb3h5RXZlbnQ+ID0+ICh7XG4gICAgcGF0aFBhcmFtZXRlcnM6IHVzZXJJZCAmJiByZWFkaW5nSWQgPyB7IHVzZXJJZCwgcmVhZGluZ0lkIH0gOiBudWxsLFxuICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICBhdXRob3JpemVyOiB7XG4gICAgICAgIGNsYWltczoge1xuICAgICAgICAgICdjb2duaXRvOmdyb3Vwcyc6IGlzQWRtaW4gPyBbJ2FkbWluJ10gOiBbXSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSBhcyB1bmtub3duIGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50WydyZXF1ZXN0Q29udGV4dCddLFxuICB9KTtcblxuICBkZXNjcmliZSgnQXV0aG9yaXphdGlvbicsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIHJldHVybiA0MDMgd2hlbiB1c2VyIGlzIG5vdCBhZG1pbicsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQoZmFsc2UsICd1c2VyLTQ1NicsICdyZWFkaW5nLTEyMycpO1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoNDAzKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmUoJ0FjY2VzcyBkZW5pZWQuIEFkbWluIHByaXZpbGVnZXMgcmVxdWlyZWQuJyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGFsbG93IGFjY2VzcyB3aGVuIHVzZXIgaXMgYWRtaW4nLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUsICd1c2VyLTQ1NicsICdyZWFkaW5nLTEyMycpO1xuXG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgSXRlbToge1xuICAgICAgICAgIHJlYWRpbmdJZDogJ3JlYWRpbmctMTIzJyxcbiAgICAgICAgICB1c2VySWQ6ICd1c2VyLTQ1NicsXG4gICAgICAgICAgdHlwZTogJ1NvdWwgQmx1ZXByaW50JyxcbiAgICAgICAgICBzdGF0dXM6ICdSZWFkeScsXG4gICAgICAgICAgY3JlYXRlZEF0OiAnMjAyNC0wMS0wMVQwMDowMDowMFonLFxuICAgICAgICAgIHVwZGF0ZWRBdDogJzIwMjQtMDEtMDFUMDA6MDE6MDBaJyxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgYWRtaW4gZ3JvdXAgYXMgY29tbWEtc2VwYXJhdGVkIHN0cmluZycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50OiBQYXJ0aWFsPEFQSUdhdGV3YXlQcm94eUV2ZW50PiA9IHtcbiAgICAgICAgcGF0aFBhcmFtZXRlcnM6IHsgdXNlcklkOiAndXNlci00NTYnLCByZWFkaW5nSWQ6ICdyZWFkaW5nLTEyMycgfSxcbiAgICAgICAgcmVxdWVzdENvbnRleHQ6IHtcbiAgICAgICAgICBhdXRob3JpemVyOiB7XG4gICAgICAgICAgICBjbGFpbXM6IHtcbiAgICAgICAgICAgICAgJ2NvZ25pdG86Z3JvdXBzJzogJ3VzZXIsYWRtaW4scHJlbWl1bScsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0gYXMgdW5rbm93biBhcyBBUElHYXRld2F5UHJveHlFdmVudFsncmVxdWVzdENvbnRleHQnXSxcbiAgICAgIH07XG5cbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBJdGVtOiB7XG4gICAgICAgICAgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnLFxuICAgICAgICAgIHVzZXJJZDogJ3VzZXItNDU2JyxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnSW5wdXQgdmFsaWRhdGlvbicsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIHJldHVybiA0MDAgd2hlbiByZWFkaW5nIElEIGlzIG1pc3NpbmcnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDQwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LmVycm9yKS50b0JlKCdVc2VyIElEIGFuZCBSZWFkaW5nIElEIGFyZSByZXF1aXJlZCcpO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnRmV0Y2hpbmcgcmVhZGluZyBkZXRhaWxzJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgZmV0Y2ggYW5kIHJldHVybiByZWFkaW5nIGRldGFpbHMgc3VjY2Vzc2Z1bGx5JywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlLCAndXNlci00NTYnLCAncmVhZGluZy0xMjMnKTtcblxuICAgICAgY29uc3QgbW9ja1JlYWRpbmcgPSB7XG4gICAgICAgIHJlYWRpbmdJZDogJ3JlYWRpbmctMTIzJyxcbiAgICAgICAgdXNlcklkOiAndXNlci00NTYnLFxuICAgICAgICB0eXBlOiAnU291bCBCbHVlcHJpbnQnLFxuICAgICAgICBzdGF0dXM6ICdSZWFkeScsXG4gICAgICAgIGNyZWF0ZWRBdDogJzIwMjQtMDEtMDFUMDA6MDA6MDBaJyxcbiAgICAgICAgdXBkYXRlZEF0OiAnMjAyNC0wMS0wMVQwMDowMTowMFonLFxuICAgICAgICBjb250ZW50OiB7XG4gICAgICAgICAgaW50ZXJwcmV0YXRpb246ICdUZXN0IGludGVycHJldGF0aW9uJyxcbiAgICAgICAgICBpbnNpZ2h0czogWydJbnNpZ2h0IDEnLCAnSW5zaWdodCAyJ10sXG4gICAgICAgICAgcmVjb21tZW5kYXRpb25zOiBbJ1JlY29tbWVuZGF0aW9uIDEnXSxcbiAgICAgICAgfSxcbiAgICAgICAgbWV0YWRhdGE6IHtcbiAgICAgICAgICBtb2RlbDogJ2dwdC00JyxcbiAgICAgICAgICB0ZW1wZXJhdHVyZTogMC43LFxuICAgICAgICAgIG1heFRva2VuczogMjAwMCxcbiAgICAgICAgICBwcm9jZXNzaW5nVGltZTogNTQzMixcbiAgICAgICAgfSxcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IG1vY2tVc2VyID0ge1xuICAgICAgICB1c2VySWQ6ICd1c2VyLTQ1NicsXG4gICAgICAgIGVtYWlsOiAndGVzdEBleGFtcGxlLmNvbScsXG4gICAgICB9O1xuXG4gICAgICBkeW5hbW9Nb2NrXG4gICAgICAgIC5vbihHZXRDb21tYW5kKVxuICAgICAgICAucmVzb2x2ZXNPbmNlKHsgSXRlbTogbW9ja1JlYWRpbmcgfSlcbiAgICAgICAgLnJlc29sdmVzT25jZSh7IEl0ZW06IG1vY2tVc2VyIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5yZWFkaW5nSWQpLnRvQmUoJ3JlYWRpbmctMTIzJyk7XG4gICAgICBleHBlY3QoYm9keS51c2VyRW1haWwpLnRvQmUoJ3Rlc3RAZXhhbXBsZS5jb20nKTtcbiAgICAgIGV4cGVjdChib2R5LmNvbnRlbnQpLnRvRXF1YWwobW9ja1JlYWRpbmcuY29udGVudCk7XG4gICAgICBleHBlY3QoYm9keS5tZXRhZGF0YSkudG9FcXVhbChtb2NrUmVhZGluZy5tZXRhZGF0YSk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHJldHVybiA0MDQgd2hlbiByZWFkaW5nIG5vdCBmb3VuZCcsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSwgJ3VzZXItNDU2JywgJ3JlYWRpbmctMTIzJyk7XG5cbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVzb2x2ZXMoeyBJdGVtOiB1bmRlZmluZWQgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDQwNCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LmVycm9yKS50b0JlKCdSZWFkaW5nIG5vdCBmb3VuZCcpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgcmVhZGluZyB3aXRob3V0IHVzZXJJZCcsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSwgJ3VzZXItNDU2JywgJ3JlYWRpbmctMTIzJyk7XG5cbiAgICAgIGNvbnN0IG1vY2tSZWFkaW5nID0ge1xuICAgICAgICByZWFkaW5nSWQ6ICdyZWFkaW5nLTEyMycsXG4gICAgICAgIHR5cGU6ICdTb3VsIEJsdWVwcmludCcsXG4gICAgICAgIHN0YXR1czogJ1JlYWR5JyxcbiAgICAgICAgY3JlYXRlZEF0OiAnMjAyNC0wMS0wMVQwMDowMDowMFonLFxuICAgICAgICB1cGRhdGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAxOjAwWicsXG4gICAgICB9O1xuXG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHsgSXRlbTogbW9ja1JlYWRpbmcgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LnVzZXJFbWFpbCkudG9CZVVuZGVmaW5lZCgpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgdXNlciBub3QgZm91bmQgaW4gdXNlciB0YWJsZScsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSwgJ3VzZXItNDU2JywgJ3JlYWRpbmctMTIzJyk7XG5cbiAgICAgIGNvbnN0IG1vY2tSZWFkaW5nID0ge1xuICAgICAgICByZWFkaW5nSWQ6ICdyZWFkaW5nLTEyMycsXG4gICAgICAgIHVzZXJJZDogJ3VzZXItNDU2JyxcbiAgICAgICAgdHlwZTogJ1NvdWwgQmx1ZXByaW50JyxcbiAgICAgICAgc3RhdHVzOiAnUmVhZHknLFxuICAgICAgICBjcmVhdGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAwOjAwWicsXG4gICAgICAgIHVwZGF0ZWRBdDogJzIwMjQtMDEtMDFUMDA6MDE6MDBaJyxcbiAgICAgIH07XG5cbiAgICAgIGR5bmFtb01vY2tcbiAgICAgICAgLm9uKEdldENvbW1hbmQpXG4gICAgICAgIC5yZXNvbHZlc09uY2UoeyBJdGVtOiBtb2NrUmVhZGluZyB9KVxuICAgICAgICAucmVzb2x2ZXNPbmNlKHsgSXRlbTogdW5kZWZpbmVkIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS51c2VyRW1haWwpLnRvQmVVbmRlZmluZWQoKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgd2FybiBidXQgY29udGludWUgd2hlbiB1c2VyIGZldGNoIGZhaWxzJywgYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gSW4gaW5mcmFzdHJ1Y3R1cmUgdGVzdHMsIGNvbnNvbGUud2FybiBpcyBhbGxvd2VkXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUsICd1c2VyLTQ1NicsICdyZWFkaW5nLTEyMycpO1xuXG4gICAgICBjb25zdCBtb2NrUmVhZGluZyA9IHtcbiAgICAgICAgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnLFxuICAgICAgICB1c2VySWQ6ICd1c2VyLTQ1NicsXG4gICAgICAgIHR5cGU6ICdTb3VsIEJsdWVwcmludCcsXG4gICAgICAgIHN0YXR1czogJ1JlYWR5JyxcbiAgICAgICAgY3JlYXRlZEF0OiAnMjAyNC0wMS0wMVQwMDowMDowMFonLFxuICAgICAgICB1cGRhdGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAxOjAwWicsXG4gICAgICB9O1xuXG4gICAgICBkeW5hbW9Nb2NrXG4gICAgICAgIC5vbihHZXRDb21tYW5kKVxuICAgICAgICAucmVzb2x2ZXNPbmNlKHsgSXRlbTogbW9ja1JlYWRpbmcgfSlcbiAgICAgICAgLnJlamVjdHNPbmNlKG5ldyBFcnJvcignVXNlciB0YWJsZSBlcnJvcicpKTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgLy8gU2hvdWxkIHN0aWxsIHJldHVybiAyMDAgZXZlbiBpZiB1c2VyIGZldGNoIGZhaWxzXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5yZWFkaW5nSWQpLnRvQmUoJ3JlYWRpbmctMTIzJyk7XG4gICAgICBleHBlY3QoYm9keS51c2VyRW1haWwpLnRvQmVVbmRlZmluZWQoKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIHJlYWRpbmcgd2l0aCBlcnJvciBmaWVsZCcsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSwgJ3VzZXItNDU2JywgJ3JlYWRpbmctMTIzJyk7XG5cbiAgICAgIGNvbnN0IG1vY2tSZWFkaW5nID0ge1xuICAgICAgICByZWFkaW5nSWQ6ICdyZWFkaW5nLTEyMycsXG4gICAgICAgIHVzZXJJZDogJ3VzZXItNDU2JyxcbiAgICAgICAgdHlwZTogJ1NvdWwgQmx1ZXByaW50JyxcbiAgICAgICAgc3RhdHVzOiAnRmFpbGVkJyxcbiAgICAgICAgY3JlYXRlZEF0OiAnMjAyNC0wMS0wMVQwMDowMDowMFonLFxuICAgICAgICB1cGRhdGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAxOjAwWicsXG4gICAgICAgIGVycm9yOiAnUHJvY2Vzc2luZyBmYWlsZWQgZHVlIHRvIGludmFsaWQgaW5wdXQnLFxuICAgICAgfTtcblxuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7IEl0ZW06IG1vY2tSZWFkaW5nIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5lcnJvcikudG9CZSgnUHJvY2Vzc2luZyBmYWlsZWQgZHVlIHRvIGludmFsaWQgaW5wdXQnKTtcbiAgICAgIGV4cGVjdChib2R5LnN0YXR1cykudG9CZSgnRmFpbGVkJyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHJldHVybiBudWxsIGZvciBtaXNzaW5nIG9wdGlvbmFsIGZpZWxkcycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSwgJ3VzZXItNDU2JywgJ3JlYWRpbmctMTIzJyk7XG5cbiAgICAgIGNvbnN0IG1vY2tSZWFkaW5nID0ge1xuICAgICAgICByZWFkaW5nSWQ6ICdyZWFkaW5nLTEyMycsXG4gICAgICAgIHVzZXJJZDogJ3VzZXItNDU2JyxcbiAgICAgICAgdHlwZTogJ1NvdWwgQmx1ZXByaW50JyxcbiAgICAgICAgc3RhdHVzOiAnUHJvY2Vzc2luZycsXG4gICAgICAgIGNyZWF0ZWRBdDogJzIwMjQtMDEtMDFUMDA6MDA6MDBaJyxcbiAgICAgICAgdXBkYXRlZEF0OiAnMjAyNC0wMS0wMVQwMDowMTowMFonLFxuICAgICAgfTtcblxuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7IEl0ZW06IG1vY2tSZWFkaW5nIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5jb250ZW50KS50b0JlTnVsbCgpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmVOdWxsKCk7XG4gICAgICBleHBlY3QoYm9keS5tZXRhZGF0YSkudG9CZU51bGwoKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0Vycm9yIGhhbmRsaW5nJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgaGFuZGxlIER5bmFtb0RCIGVycm9ycycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSwgJ3VzZXItNDU2JywgJ3JlYWRpbmctMTIzJyk7XG5cbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVqZWN0cyhuZXcgRXJyb3IoJ0R5bmFtb0RCIGVycm9yJykpO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSg1MDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5lcnJvcikudG9CZSgnSW50ZXJuYWwgc2VydmVyIGVycm9yJyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHJldHVybiA1MDAgYW5kIGxvZyBlcnJvcnMnLCBhc3luYyAoKSA9PiB7XG4gICAgICAvLyBJbiBpbmZyYXN0cnVjdHVyZSB0ZXN0cywgY29uc29sZS5lcnJvciBpcyBhbGxvd2VkXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUsICd1c2VyLTQ1NicsICdyZWFkaW5nLTEyMycpO1xuXG4gICAgICBjb25zdCBlcnJvciA9IG5ldyBFcnJvcignVGVzdCBlcnJvcicpO1xuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZWplY3RzKGVycm9yKTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoNTAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmUoJ0ludGVybmFsIHNlcnZlciBlcnJvcicpO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnUmVzcG9uc2UgZm9ybWF0JywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgaW5jbHVkZSBDT1JTIGhlYWRlcnMnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUsICd1c2VyLTQ1NicsICdyZWFkaW5nLTEyMycpO1xuXG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgSXRlbToge1xuICAgICAgICAgIHJlYWRpbmdJZDogJ3JlYWRpbmctMTIzJyxcbiAgICAgICAgICB1c2VySWQ6ICd1c2VyLTQ1NicsXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLmhlYWRlcnMpLnRvRXF1YWwoe1xuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHJldHVybiBwcm9wZXIgcmVzcG9uc2Ugc3RydWN0dXJlJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlLCAndXNlci00NTYnLCAncmVhZGluZy0xMjMnKTtcblxuICAgICAgY29uc3QgbW9ja1JlYWRpbmcgPSB7XG4gICAgICAgIHJlYWRpbmdJZDogJ3JlYWRpbmctMTIzJyxcbiAgICAgICAgdXNlcklkOiAndXNlci00NTYnLFxuICAgICAgICB0eXBlOiAnTmF0YWwgQ2hhcnQnLFxuICAgICAgICBzdGF0dXM6ICdSZWFkeScsXG4gICAgICAgIGNyZWF0ZWRBdDogJzIwMjQtMDEtMDFUMDA6MDA6MDBaJyxcbiAgICAgICAgdXBkYXRlZEF0OiAnMjAyNC0wMS0wMVQwMDowMTowMFonLFxuICAgICAgICBjb250ZW50OiB7XG4gICAgICAgICAgaW50ZXJwcmV0YXRpb246ICdUZXN0JyxcbiAgICAgICAgfSxcbiAgICAgIH07XG5cbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVzb2x2ZXMoeyBJdGVtOiBtb2NrUmVhZGluZyB9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkpLnRvSGF2ZVByb3BlcnR5KCdyZWFkaW5nSWQnKTtcbiAgICAgIGV4cGVjdChib2R5KS50b0hhdmVQcm9wZXJ0eSgndXNlcklkJyk7XG4gICAgICBleHBlY3QoYm9keSkudG9IYXZlUHJvcGVydHkoJ3R5cGUnKTtcbiAgICAgIGV4cGVjdChib2R5KS50b0hhdmVQcm9wZXJ0eSgnc3RhdHVzJyk7XG4gICAgICBleHBlY3QoYm9keSkudG9IYXZlUHJvcGVydHkoJ2NyZWF0ZWRBdCcpO1xuICAgICAgZXhwZWN0KGJvZHkpLnRvSGF2ZVByb3BlcnR5KCd1cGRhdGVkQXQnKTtcbiAgICAgIGV4cGVjdChib2R5KS50b0hhdmVQcm9wZXJ0eSgnY29udGVudCcpO1xuICAgICAgZXhwZWN0KGJvZHkpLnRvSGF2ZVByb3BlcnR5KCdlcnJvcicpO1xuICAgICAgZXhwZWN0KGJvZHkpLnRvSGF2ZVByb3BlcnR5KCdtZXRhZGF0YScpO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnTG9nZ2luZycsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGxvZyBpbmNvbWluZyBldmVudCcsIGFzeW5jICgpID0+IHtcbiAgICAgIC8vIEluIGluZnJhc3RydWN0dXJlIHRlc3RzLCBjb25zb2xlLmluZm8gaXMgYWxsb3dlZFxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlLCAndXNlci00NTYnLCAncmVhZGluZy0xMjMnKTtcblxuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIEl0ZW06IHsgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnIH0sXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgLy8gSnVzdCB2ZXJpZnkgdGhlIGhhbmRsZXIgZXhlY3V0ZXMgc3VjY2Vzc2Z1bGx5XG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnRWRnZSBjYXNlcycsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBtaXNzaW5nIHJlcXVlc3RDb250ZXh0JywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQ6IFBhcnRpYWw8QVBJR2F0ZXdheVByb3h5RXZlbnQ+ID0ge1xuICAgICAgICBwYXRoUGFyYW1ldGVyczogeyB1c2VySWQ6ICd1c2VyLTQ1NicsIHJlYWRpbmdJZDogJ3JlYWRpbmctMTIzJyB9LFxuICAgICAgICByZXF1ZXN0Q29udGV4dDogdW5kZWZpbmVkIGFzIHVua25vd24gYXMgQVBJR2F0ZXdheUV2ZW50UmVxdWVzdENvbnRleHQsXG4gICAgICB9O1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSg0MDMpO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5lcnJvcikudG9CZSgnQWNjZXNzIGRlbmllZC4gQWRtaW4gcHJpdmlsZWdlcyByZXF1aXJlZC4nKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIG1pc3NpbmcgYXV0aG9yaXplciBjbGFpbXMnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudDogUGFydGlhbDxBUElHYXRld2F5UHJveHlFdmVudD4gPSB7XG4gICAgICAgIHBhdGhQYXJhbWV0ZXJzOiB7IHVzZXJJZDogJ3VzZXItNDU2JywgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnIH0sXG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjogdW5kZWZpbmVkLFxuICAgICAgICB9IGFzIHVua25vd24gYXMgQVBJR2F0ZXdheVByb3h5RXZlbnRbJ3JlcXVlc3RDb250ZXh0J10sXG4gICAgICB9O1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSg0MDMpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgZW1wdHkgY29nbml0bzpncm91cHMnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudDogUGFydGlhbDxBUElHYXRld2F5UHJveHlFdmVudD4gPSB7XG4gICAgICAgIHBhdGhQYXJhbWV0ZXJzOiB7IHVzZXJJZDogJ3VzZXItNDU2JywgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnIH0sXG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICAgICAgY2xhaW1zOiB7XG4gICAgICAgICAgICAgICdjb2duaXRvOmdyb3Vwcyc6ICcnLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9IGFzIHVua25vd24gYXMgQVBJR2F0ZXdheVByb3h5RXZlbnRbJ3JlcXVlc3RDb250ZXh0J10sXG4gICAgICB9O1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSg0MDMpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgY29nbml0bzpncm91cHMgYXMgYXJyYXkgd2l0aG91dCBhZG1pbicsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50OiBQYXJ0aWFsPEFQSUdhdGV3YXlQcm94eUV2ZW50PiA9IHtcbiAgICAgICAgcGF0aFBhcmFtZXRlcnM6IHsgdXNlcklkOiAndXNlci00NTYnLCByZWFkaW5nSWQ6ICdyZWFkaW5nLTEyMycgfSxcbiAgICAgICAgcmVxdWVzdENvbnRleHQ6IHtcbiAgICAgICAgICBhdXRob3JpemVyOiB7XG4gICAgICAgICAgICBjbGFpbXM6IHtcbiAgICAgICAgICAgICAgJ2NvZ25pdG86Z3JvdXBzJzogWyd1c2VyJywgJ3ByZW1pdW0nXSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSBhcyB1bmtub3duIGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50WydyZXF1ZXN0Q29udGV4dCddLFxuICAgICAgfTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoNDAzKTtcbiAgICB9KTtcbiAgfSk7XG59KTtcbiJdfQ==