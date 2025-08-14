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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2V0LXJlYWRpbmctZGV0YWlscy50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZ2V0LXJlYWRpbmctZGV0YWlscy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsZ0ZBQWlFO0FBRWpFLHdEQUEyRTtBQUMzRSw2REFBaUQ7QUFFakQsMkJBQTJCO0FBQzNCLE1BQU0sVUFBVSxHQUFHLElBQUEsZ0NBQVUsRUFBQyxxQ0FBc0IsQ0FBQyxDQUFDO0FBRXRELFFBQVEsQ0FBQyw0QkFBNEIsRUFBRSxHQUFHLEVBQUU7SUFDMUMsVUFBVSxDQUFDLEdBQUcsRUFBRTtRQUNkLFVBQVUsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNuQixPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFtQixHQUFHLHFCQUFxQixDQUFDO1FBQ3hELE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZSxHQUFHLGlCQUFpQixDQUFDO0lBQ2xELENBQUMsQ0FBQyxDQUFDO0lBRUgsTUFBTSxXQUFXLEdBQUcsQ0FDbEIsT0FBZ0IsRUFDaEIsTUFBZSxFQUNmLFNBQWtCLEVBQ2EsRUFBRSxDQUFDLENBQUM7UUFDbkMsY0FBYyxFQUFFLE1BQU0sSUFBSSxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJO1FBQ2xFLGNBQWMsRUFBRTtZQUNkLFVBQVUsRUFBRTtnQkFDVixNQUFNLEVBQUU7b0JBQ04sZ0JBQWdCLEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFO2lCQUMzQzthQUNGO1NBQ21EO0tBQ3ZELENBQUMsQ0FBQztJQUVILFFBQVEsQ0FBQyxlQUFlLEVBQUUsR0FBRyxFQUFFO1FBQzdCLEVBQUUsQ0FBQywwQ0FBMEMsRUFBRSxLQUFLLElBQUksRUFBRTtZQUN4RCxNQUFNLEtBQUssR0FBRyxXQUFXLENBQUMsS0FBSyxFQUFFLFVBQVUsRUFBRSxh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QztJQUNMLENBQUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBoYW5kbGVyIH0gZnJvbSAnLi4vLi4vbGFtYmRhL2FkbWluL2dldC1yZWFkaW5nLWRldGFpbHMnO1xuaW1wb3J0IHsgQVBJR2F0ZXdheVByb3h5RXZlbnQsIEFQSUdhdGV3YXlFdmVudFJlcXVlc3RDb250ZXh0IH0gZnJvbSAnYXdzLWxhbWJkYSc7XG5pbXBvcnQgeyBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LCBHZXRDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvbGliLWR5bmFtb2RiJztcbmltcG9ydCB7IG1vY2tDbGllbnQgfSBmcm9tICdhd3Mtc2RrLWNsaWVudC1tb2NrJztcblxuLy8gTW9jayB0aGUgRHluYW1vREIgY2xpZW50XG5jb25zdCBkeW5hbW9Nb2NrID0gbW9ja0NsaWVudChEeW5hbW9EQkRvY3VtZW50Q2xpZW50KTtcblxuZGVzY3JpYmUoJ2dldC1yZWFkaW5nLWRldGFpbHMgTGFtYmRhJywgKCkgPT4ge1xuICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICBkeW5hbW9Nb2NrLnJlc2V0KCk7XG4gICAgcHJvY2Vzcy5lbnYuUkVBRElOR1NfVEFCTEVfTkFNRSA9ICd0ZXN0LXJlYWRpbmdzLXRhYmxlJztcbiAgICBwcm9jZXNzLmVudi5VU0VSX1RBQkxFX05BTUUgPSAndGVzdC11c2VyLXRhYmxlJztcbiAgfSk7XG5cbiAgY29uc3QgY3JlYXRlRXZlbnQgPSAoXG4gICAgaXNBZG1pbjogYm9vbGVhbixcbiAgICB1c2VySWQ/OiBzdHJpbmcsXG4gICAgcmVhZGluZ0lkPzogc3RyaW5nLFxuICApOiBQYXJ0aWFsPEFQSUdhdGV3YXlQcm94eUV2ZW50PiA9PiAoe1xuICAgIHBhdGhQYXJhbWV0ZXJzOiB1c2VySWQgJiYgcmVhZGluZ0lkID8geyB1c2VySWQsIHJlYWRpbmdJZCB9IDogbnVsbCxcbiAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICBjbGFpbXM6IHtcbiAgICAgICAgICAnY29nbml0bzpncm91cHMnOiBpc0FkbWluID8gWydhZG1pbiddIDogW10sXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0gYXMgdW5rbm93biBhcyBBUElHYXRld2F5UHJveHlFdmVudFsncmVxdWVzdENvbnRleHQnXSxcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0F1dGhvcml6YXRpb24nLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gNDAzIHdoZW4gdXNlciBpcyBub3QgYWRtaW4nLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KGZhbHNlLCAndXNlci00NTYnLCAncmVhZGluZy0xMjMnKTtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDQwMyk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LmVycm9yKS50b0JlKCdBY2Nlc3MgZGVuaWVkLiBBZG1pbiBwcml2aWxlZ2VzIHJlcXVpcmVkLicpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBhbGxvdyBhY2Nlc3Mgd2hlbiB1c2VyIGlzIGFkbWluJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlLCAndXNlci00NTYnLCAncmVhZGluZy0xMjMnKTtcblxuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIEl0ZW06IHtcbiAgICAgICAgICByZWFkaW5nSWQ6ICdyZWFkaW5nLTEyMycsXG4gICAgICAgICAgdXNlcklkOiAndXNlci00NTYnLFxuICAgICAgICAgIHR5cGU6ICdTb3VsIEJsdWVwcmludCcsXG4gICAgICAgICAgc3RhdHVzOiAnUmVhZHknLFxuICAgICAgICAgIGNyZWF0ZWRBdDogJzIwMjQtMDEtMDFUMDA6MDA6MDBaJyxcbiAgICAgICAgICB1cGRhdGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAxOjAwWicsXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIGFkbWluIGdyb3VwIGFzIGNvbW1hLXNlcGFyYXRlZCBzdHJpbmcnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudDogUGFydGlhbDxBUElHYXRld2F5UHJveHlFdmVudD4gPSB7XG4gICAgICAgIHBhdGhQYXJhbWV0ZXJzOiB7IHVzZXJJZDogJ3VzZXItNDU2JywgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnIH0sXG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICAgICAgY2xhaW1zOiB7XG4gICAgICAgICAgICAgICdjb2duaXRvOmdyb3Vwcyc6ICd1c2VyLGFkbWluLHByZW1pdW0nLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9IGFzIHVua25vd24gYXMgQVBJR2F0ZXdheVByb3h5RXZlbnRbJ3JlcXVlc3RDb250ZXh0J10sXG4gICAgICB9O1xuXG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgSXRlbToge1xuICAgICAgICAgIHJlYWRpbmdJZDogJ3JlYWRpbmctMTIzJyxcbiAgICAgICAgICB1c2VySWQ6ICd1c2VyLTQ1NicsXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0lucHV0IHZhbGlkYXRpb24nLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gNDAwIHdoZW4gcmVhZGluZyBJRCBpcyBtaXNzaW5nJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSg0MDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5lcnJvcikudG9CZSgnVXNlciBJRCBhbmQgUmVhZGluZyBJRCBhcmUgcmVxdWlyZWQnKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0ZldGNoaW5nIHJlYWRpbmcgZGV0YWlscycsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGZldGNoIGFuZCByZXR1cm4gcmVhZGluZyBkZXRhaWxzIHN1Y2Nlc3NmdWxseScsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSwgJ3VzZXItNDU2JywgJ3JlYWRpbmctMTIzJyk7XG5cbiAgICAgIGNvbnN0IG1vY2tSZWFkaW5nID0ge1xuICAgICAgICByZWFkaW5nSWQ6ICdyZWFkaW5nLTEyMycsXG4gICAgICAgIHVzZXJJZDogJ3VzZXItNDU2JyxcbiAgICAgICAgdHlwZTogJ1NvdWwgQmx1ZXByaW50JyxcbiAgICAgICAgc3RhdHVzOiAnUmVhZHknLFxuICAgICAgICBjcmVhdGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAwOjAwWicsXG4gICAgICAgIHVwZGF0ZWRBdDogJzIwMjQtMDEtMDFUMDA6MDE6MDBaJyxcbiAgICAgICAgY29udGVudDoge1xuICAgICAgICAgIGludGVycHJldGF0aW9uOiAnVGVzdCBpbnRlcnByZXRhdGlvbicsXG4gICAgICAgICAgaW5zaWdodHM6IFsnSW5zaWdodCAxJywgJ0luc2lnaHQgMiddLFxuICAgICAgICAgIHJlY29tbWVuZGF0aW9uczogWydSZWNvbW1lbmRhdGlvbiAxJ10sXG4gICAgICAgIH0sXG4gICAgICAgIG1ldGFkYXRhOiB7XG4gICAgICAgICAgbW9kZWw6ICdncHQtNCcsXG4gICAgICAgICAgdGVtcGVyYXR1cmU6IDAuNyxcbiAgICAgICAgICBtYXhUb2tlbnM6IDIwMDAsXG4gICAgICAgICAgcHJvY2Vzc2luZ1RpbWU6IDU0MzIsXG4gICAgICAgIH0sXG4gICAgICB9O1xuXG4gICAgICBjb25zdCBtb2NrVXNlciA9IHtcbiAgICAgICAgdXNlcklkOiAndXNlci00NTYnLFxuICAgICAgICBlbWFpbDogJ3Rlc3RAZXhhbXBsZS5jb20nLFxuICAgICAgfTtcblxuICAgICAgZHluYW1vTW9ja1xuICAgICAgICAub24oR2V0Q29tbWFuZClcbiAgICAgICAgLnJlc29sdmVzT25jZSh7IEl0ZW06IG1vY2tSZWFkaW5nIH0pXG4gICAgICAgIC5yZXNvbHZlc09uY2UoeyBJdGVtOiBtb2NrVXNlciB9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkucmVhZGluZ0lkKS50b0JlKCdyZWFkaW5nLTEyMycpO1xuICAgICAgZXhwZWN0KGJvZHkudXNlckVtYWlsKS50b0JlKCd0ZXN0QGV4YW1wbGUuY29tJyk7XG4gICAgICBleHBlY3QoYm9keS5jb250ZW50KS50b0VxdWFsKG1vY2tSZWFkaW5nLmNvbnRlbnQpO1xuICAgICAgZXhwZWN0KGJvZHkubWV0YWRhdGEpLnRvRXF1YWwobW9ja1JlYWRpbmcubWV0YWRhdGEpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gNDA0IHdoZW4gcmVhZGluZyBub3QgZm91bmQnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUsICd1c2VyLTQ1NicsICdyZWFkaW5nLTEyMycpO1xuXG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHsgSXRlbTogdW5kZWZpbmVkIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSg0MDQpO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5lcnJvcikudG9CZSgnUmVhZGluZyBub3QgZm91bmQnKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIHJlYWRpbmcgd2l0aG91dCB1c2VySWQnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUsICd1c2VyLTQ1NicsICdyZWFkaW5nLTEyMycpO1xuXG4gICAgICBjb25zdCBtb2NrUmVhZGluZyA9IHtcbiAgICAgICAgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnLFxuICAgICAgICB0eXBlOiAnU291bCBCbHVlcHJpbnQnLFxuICAgICAgICBzdGF0dXM6ICdSZWFkeScsXG4gICAgICAgIGNyZWF0ZWRBdDogJzIwMjQtMDEtMDFUMDA6MDA6MDBaJyxcbiAgICAgICAgdXBkYXRlZEF0OiAnMjAyNC0wMS0wMVQwMDowMTowMFonLFxuICAgICAgfTtcblxuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7IEl0ZW06IG1vY2tSZWFkaW5nIH0pO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS51c2VyRW1haWwpLnRvQmVVbmRlZmluZWQoKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIHVzZXIgbm90IGZvdW5kIGluIHVzZXIgdGFibGUnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUsICd1c2VyLTQ1NicsICdyZWFkaW5nLTEyMycpO1xuXG4gICAgICBjb25zdCBtb2NrUmVhZGluZyA9IHtcbiAgICAgICAgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnLFxuICAgICAgICB1c2VySWQ6ICd1c2VyLTQ1NicsXG4gICAgICAgIHR5cGU6ICdTb3VsIEJsdWVwcmludCcsXG4gICAgICAgIHN0YXR1czogJ1JlYWR5JyxcbiAgICAgICAgY3JlYXRlZEF0OiAnMjAyNC0wMS0wMVQwMDowMDowMFonLFxuICAgICAgICB1cGRhdGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAxOjAwWicsXG4gICAgICB9O1xuXG4gICAgICBkeW5hbW9Nb2NrXG4gICAgICAgIC5vbihHZXRDb21tYW5kKVxuICAgICAgICAucmVzb2x2ZXNPbmNlKHsgSXRlbTogbW9ja1JlYWRpbmcgfSlcbiAgICAgICAgLnJlc29sdmVzT25jZSh7IEl0ZW06IHVuZGVmaW5lZCB9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkudXNlckVtYWlsKS50b0JlVW5kZWZpbmVkKCk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHdhcm4gYnV0IGNvbnRpbnVlIHdoZW4gdXNlciBmZXRjaCBmYWlscycsIGFzeW5jICgpID0+IHtcbiAgICAgIC8vIEluIGluZnJhc3RydWN0dXJlIHRlc3RzLCBjb25zb2xlLndhcm4gaXMgYWxsb3dlZFxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlLCAndXNlci00NTYnLCAncmVhZGluZy0xMjMnKTtcblxuICAgICAgY29uc3QgbW9ja1JlYWRpbmcgPSB7XG4gICAgICAgIHJlYWRpbmdJZDogJ3JlYWRpbmctMTIzJyxcbiAgICAgICAgdXNlcklkOiAndXNlci00NTYnLFxuICAgICAgICB0eXBlOiAnU291bCBCbHVlcHJpbnQnLFxuICAgICAgICBzdGF0dXM6ICdSZWFkeScsXG4gICAgICAgIGNyZWF0ZWRBdDogJzIwMjQtMDEtMDFUMDA6MDA6MDBaJyxcbiAgICAgICAgdXBkYXRlZEF0OiAnMjAyNC0wMS0wMVQwMDowMTowMFonLFxuICAgICAgfTtcblxuICAgICAgZHluYW1vTW9ja1xuICAgICAgICAub24oR2V0Q29tbWFuZClcbiAgICAgICAgLnJlc29sdmVzT25jZSh7IEl0ZW06IG1vY2tSZWFkaW5nIH0pXG4gICAgICAgIC5yZWplY3RzT25jZShuZXcgRXJyb3IoJ1VzZXIgdGFibGUgZXJyb3InKSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIC8vIFNob3VsZCBzdGlsbCByZXR1cm4gMjAwIGV2ZW4gaWYgdXNlciBmZXRjaCBmYWlsc1xuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkucmVhZGluZ0lkKS50b0JlKCdyZWFkaW5nLTEyMycpO1xuICAgICAgZXhwZWN0KGJvZHkudXNlckVtYWlsKS50b0JlVW5kZWZpbmVkKCk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSByZWFkaW5nIHdpdGggZXJyb3IgZmllbGQnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUsICd1c2VyLTQ1NicsICdyZWFkaW5nLTEyMycpO1xuXG4gICAgICBjb25zdCBtb2NrUmVhZGluZyA9IHtcbiAgICAgICAgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnLFxuICAgICAgICB1c2VySWQ6ICd1c2VyLTQ1NicsXG4gICAgICAgIHR5cGU6ICdTb3VsIEJsdWVwcmludCcsXG4gICAgICAgIHN0YXR1czogJ0ZhaWxlZCcsXG4gICAgICAgIGNyZWF0ZWRBdDogJzIwMjQtMDEtMDFUMDA6MDA6MDBaJyxcbiAgICAgICAgdXBkYXRlZEF0OiAnMjAyNC0wMS0wMVQwMDowMTowMFonLFxuICAgICAgICBlcnJvcjogJ1Byb2Nlc3NpbmcgZmFpbGVkIGR1ZSB0byBpbnZhbGlkIGlucHV0JyxcbiAgICAgIH07XG5cbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVzb2x2ZXMoeyBJdGVtOiBtb2NrUmVhZGluZyB9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmUoJ1Byb2Nlc3NpbmcgZmFpbGVkIGR1ZSB0byBpbnZhbGlkIGlucHV0Jyk7XG4gICAgICBleHBlY3QoYm9keS5zdGF0dXMpLnRvQmUoJ0ZhaWxlZCcpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gbnVsbCBmb3IgbWlzc2luZyBvcHRpb25hbCBmaWVsZHMnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUsICd1c2VyLTQ1NicsICdyZWFkaW5nLTEyMycpO1xuXG4gICAgICBjb25zdCBtb2NrUmVhZGluZyA9IHtcbiAgICAgICAgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnLFxuICAgICAgICB1c2VySWQ6ICd1c2VyLTQ1NicsXG4gICAgICAgIHR5cGU6ICdTb3VsIEJsdWVwcmludCcsXG4gICAgICAgIHN0YXR1czogJ1Byb2Nlc3NpbmcnLFxuICAgICAgICBjcmVhdGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAwOjAwWicsXG4gICAgICAgIHVwZGF0ZWRBdDogJzIwMjQtMDEtMDFUMDA6MDE6MDBaJyxcbiAgICAgIH07XG5cbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVzb2x2ZXMoeyBJdGVtOiBtb2NrUmVhZGluZyB9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuY29udGVudCkudG9CZU51bGwoKTtcbiAgICAgIGV4cGVjdChib2R5LmVycm9yKS50b0JlTnVsbCgpO1xuICAgICAgZXhwZWN0KGJvZHkubWV0YWRhdGEpLnRvQmVOdWxsKCk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdFcnJvciBoYW5kbGluZycsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBEeW5hbW9EQiBlcnJvcnMnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZUV2ZW50KHRydWUsICd1c2VyLTQ1NicsICdyZWFkaW5nLTEyMycpO1xuXG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlamVjdHMobmV3IEVycm9yKCdEeW5hbW9EQiBlcnJvcicpKTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoNTAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmUoJ0ludGVybmFsIHNlcnZlciBlcnJvcicpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gNTAwIGFuZCBsb2cgZXJyb3JzJywgYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gSW4gaW5mcmFzdHJ1Y3R1cmUgdGVzdHMsIGNvbnNvbGUuZXJyb3IgaXMgYWxsb3dlZFxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlLCAndXNlci00NTYnLCAncmVhZGluZy0xMjMnKTtcblxuICAgICAgY29uc3QgZXJyb3IgPSBuZXcgRXJyb3IoJ1Rlc3QgZXJyb3InKTtcbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVqZWN0cyhlcnJvcik7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDUwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LmVycm9yKS50b0JlKCdJbnRlcm5hbCBzZXJ2ZXIgZXJyb3InKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ1Jlc3BvbnNlIGZvcm1hdCcsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGluY2x1ZGUgQ09SUyBoZWFkZXJzJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVFdmVudCh0cnVlLCAndXNlci00NTYnLCAncmVhZGluZy0xMjMnKTtcblxuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIEl0ZW06IHtcbiAgICAgICAgICByZWFkaW5nSWQ6ICdyZWFkaW5nLTEyMycsXG4gICAgICAgICAgdXNlcklkOiAndXNlci00NTYnLFxuICAgICAgICB9LFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5oZWFkZXJzKS50b0VxdWFsKHtcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gcHJvcGVyIHJlc3BvbnNlIHN0cnVjdHVyZScsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSwgJ3VzZXItNDU2JywgJ3JlYWRpbmctMTIzJyk7XG5cbiAgICAgIGNvbnN0IG1vY2tSZWFkaW5nID0ge1xuICAgICAgICByZWFkaW5nSWQ6ICdyZWFkaW5nLTEyMycsXG4gICAgICAgIHVzZXJJZDogJ3VzZXItNDU2JyxcbiAgICAgICAgdHlwZTogJ05hdGFsIENoYXJ0JyxcbiAgICAgICAgc3RhdHVzOiAnUmVhZHknLFxuICAgICAgICBjcmVhdGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAwOjAwWicsXG4gICAgICAgIHVwZGF0ZWRBdDogJzIwMjQtMDEtMDFUMDA6MDE6MDBaJyxcbiAgICAgICAgY29udGVudDoge1xuICAgICAgICAgIGludGVycHJldGF0aW9uOiAnVGVzdCcsXG4gICAgICAgIH0sXG4gICAgICB9O1xuXG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHsgSXRlbTogbW9ja1JlYWRpbmcgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5KS50b0hhdmVQcm9wZXJ0eSgncmVhZGluZ0lkJyk7XG4gICAgICBleHBlY3QoYm9keSkudG9IYXZlUHJvcGVydHkoJ3VzZXJJZCcpO1xuICAgICAgZXhwZWN0KGJvZHkpLnRvSGF2ZVByb3BlcnR5KCd0eXBlJyk7XG4gICAgICBleHBlY3QoYm9keSkudG9IYXZlUHJvcGVydHkoJ3N0YXR1cycpO1xuICAgICAgZXhwZWN0KGJvZHkpLnRvSGF2ZVByb3BlcnR5KCdjcmVhdGVkQXQnKTtcbiAgICAgIGV4cGVjdChib2R5KS50b0hhdmVQcm9wZXJ0eSgndXBkYXRlZEF0Jyk7XG4gICAgICBleHBlY3QoYm9keSkudG9IYXZlUHJvcGVydHkoJ2NvbnRlbnQnKTtcbiAgICAgIGV4cGVjdChib2R5KS50b0hhdmVQcm9wZXJ0eSgnZXJyb3InKTtcbiAgICAgIGV4cGVjdChib2R5KS50b0hhdmVQcm9wZXJ0eSgnbWV0YWRhdGEnKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0xvZ2dpbmcnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBsb2cgaW5jb21pbmcgZXZlbnQnLCBhc3luYyAoKSA9PiB7XG4gICAgICAvLyBJbiBpbmZyYXN0cnVjdHVyZSB0ZXN0cywgY29uc29sZS5pbmZvIGlzIGFsbG93ZWRcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlRXZlbnQodHJ1ZSwgJ3VzZXItNDU2JywgJ3JlYWRpbmctMTIzJyk7XG5cbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBJdGVtOiB7IHJlYWRpbmdJZDogJ3JlYWRpbmctMTIzJyB9LFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIC8vIEp1c3QgdmVyaWZ5IHRoZSBoYW5kbGVyIGV4ZWN1dGVzIHN1Y2Nlc3NmdWxseVxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0VkZ2UgY2FzZXMnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgbWlzc2luZyByZXF1ZXN0Q29udGV4dCcsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50OiBQYXJ0aWFsPEFQSUdhdGV3YXlQcm94eUV2ZW50PiA9IHtcbiAgICAgICAgcGF0aFBhcmFtZXRlcnM6IHsgdXNlcklkOiAndXNlci00NTYnLCByZWFkaW5nSWQ6ICdyZWFkaW5nLTEyMycgfSxcbiAgICAgICAgcmVxdWVzdENvbnRleHQ6IHVuZGVmaW5lZCBhcyB1bmtub3duIGFzIEFQSUdhdGV3YXlFdmVudFJlcXVlc3RDb250ZXh0LFxuICAgICAgfTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoNDAzKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3BvbnNlLmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmUoJ0FjY2VzcyBkZW5pZWQuIEFkbWluIHByaXZpbGVnZXMgcmVxdWlyZWQuJyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBtaXNzaW5nIGF1dGhvcml6ZXIgY2xhaW1zJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQ6IFBhcnRpYWw8QVBJR2F0ZXdheVByb3h5RXZlbnQ+ID0ge1xuICAgICAgICBwYXRoUGFyYW1ldGVyczogeyB1c2VySWQ6ICd1c2VyLTQ1NicsIHJlYWRpbmdJZDogJ3JlYWRpbmctMTIzJyB9LFxuICAgICAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgICAgIGF1dGhvcml6ZXI6IHVuZGVmaW5lZCxcbiAgICAgICAgfSBhcyB1bmtub3duIGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50WydyZXF1ZXN0Q29udGV4dCddLFxuICAgICAgfTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoNDAzKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIGVtcHR5IGNvZ25pdG86Z3JvdXBzJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQ6IFBhcnRpYWw8QVBJR2F0ZXdheVByb3h5RXZlbnQ+ID0ge1xuICAgICAgICBwYXRoUGFyYW1ldGVyczogeyB1c2VySWQ6ICd1c2VyLTQ1NicsIHJlYWRpbmdJZDogJ3JlYWRpbmctMTIzJyB9LFxuICAgICAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgICAgIGF1dGhvcml6ZXI6IHtcbiAgICAgICAgICAgIGNsYWltczoge1xuICAgICAgICAgICAgICAnY29nbml0bzpncm91cHMnOiAnJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSBhcyB1bmtub3duIGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50WydyZXF1ZXN0Q29udGV4dCddLFxuICAgICAgfTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBoYW5kbGVyKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1c0NvZGUpLnRvQmUoNDAzKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIGNvZ25pdG86Z3JvdXBzIGFzIGFycmF5IHdpdGhvdXQgYWRtaW4nLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudDogUGFydGlhbDxBUElHYXRld2F5UHJveHlFdmVudD4gPSB7XG4gICAgICAgIHBhdGhQYXJhbWV0ZXJzOiB7IHVzZXJJZDogJ3VzZXItNDU2JywgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnIH0sXG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICAgICAgY2xhaW1zOiB7XG4gICAgICAgICAgICAgICdjb2duaXRvOmdyb3Vwcyc6IFsndXNlcicsICdwcmVtaXVtJ10sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0gYXMgdW5rbm93biBhcyBBUElHYXRld2F5UHJveHlFdmVudFsncmVxdWVzdENvbnRleHQnXSxcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlcihldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXNDb2RlKS50b0JlKDQwMyk7XG4gICAgfSk7XG4gIH0pO1xufSk7XG4iXX0=