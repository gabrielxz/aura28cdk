"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const create_checkout_session_1 = require("../../../lambda/payments/create-checkout-session");
const aws_sdk_client_mock_1 = require("aws-sdk-client-mock");
const client_ssm_1 = require("@aws-sdk/client-ssm");
const stripe_1 = __importDefault(require("stripe"));
// Mock Stripe
jest.mock('stripe', () => {
    return jest.fn().mockImplementation(() => ({
        checkout: {
            sessions: {
                create: jest.fn(),
            },
        },
    }));
});
const ssmMock = (0, aws_sdk_client_mock_1.mockClient)(client_ssm_1.SSMClient);
describe('Create Checkout Session Lambda', () => {
    const mockStripeApiKey = 'sk_test_mock_key_123';
    const mockUserId = 'test-user-123';
    const mockEmail = 'test@example.com';
    beforeEach(() => {
        jest.clearAllMocks();
        ssmMock.reset();
        // Setup SSM mock
        ssmMock.on(client_ssm_1.GetParameterCommand).resolves({
            Parameter: {
                Value: mockStripeApiKey,
            },
        });
        // Setup environment variables
        process.env.STRIPE_API_KEY_PARAMETER_NAME = '/aura28/test/stripe/api-key';
        process.env.ALLOWED_PRICE_IDS = 'price_test123,price_test456';
    });
    const createMockEvent = (overrides = {}) => ({
        httpMethod: 'POST',
        path: '/api/users/test-user-123/checkout-session',
        pathParameters: {
            userId: mockUserId,
        },
        headers: {
            'Content-Type': 'application/json',
        },
        requestContext: {
            authorizer: {
                claims: {
                    sub: mockUserId,
                    email: mockEmail,
                },
            },
        },
        body: JSON.stringify({
            sessionType: 'subscription',
            priceId: 'price_test123',
            successUrl: 'https://example.com/success',
            cancelUrl: 'https://example.com/cancel',
        }),
        ...overrides,
    });
    describe('Successful session creation', () => {
        it('should create a subscription checkout session successfully', async () => {
            const mockSessionId = 'cs_test_session123';
            const mockSessionUrl = 'https://checkout.stripe.com/session123';
            // Mock Stripe session creation
            const stripeMock = new stripe_1.default(mockStripeApiKey);
            stripeMock.checkout.sessions.create.mockResolvedValue({
                id: mockSessionId,
                url: mockSessionUrl,
            });
            const event = createMockEvent();
            const result = await (0, create_checkout_session_1.handler)(event);
            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body).toEqual({
                sessionId: mockSessionId,
                url: mockSessionUrl,
            });
            // Verify Stripe was called with correct parameters
            expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({
                mode: 'subscription',
                payment_method_types: ['card'],
                line_items: [
                    {
                        price: 'price_test123',
                        quantity: 1,
                    },
                ],
                success_url: 'https://example.com/success',
                cancel_url: 'https://example.com/cancel',
                customer_email: mockEmail,
                client_reference_id: mockUserId,
                metadata: {
                    userId: mockUserId,
                    sessionType: 'subscription',
                },
            }));
        });
        it('should create a one-time payment session successfully', async () => {
            const mockSessionId = 'cs_test_session456';
            const mockSessionUrl = 'https://checkout.stripe.com/session456';
            // Mock Stripe session creation
            const stripeMock = new stripe_1.default(mockStripeApiKey);
            stripeMock.checkout.sessions.create.mockResolvedValue({
                id: mockSessionId,
                url: mockSessionUrl,
            });
            const event = createMockEvent({
                body: JSON.stringify({
                    sessionType: 'one-time',
                    successUrl: 'https://example.com/success',
                    cancelUrl: 'https://example.com/cancel',
                }),
            });
            const result = await (0, create_checkout_session_1.handler)(event);
            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body).toEqual({
                sessionId: mockSessionId,
                url: mockSessionUrl,
            });
            // Verify default price data was used for one-time payment
            expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({
                mode: 'payment',
                line_items: [
                    {
                        price_data: {
                            currency: 'usd',
                            product_data: {
                                name: 'Aura28 Reading',
                                description: 'One-time astrological reading',
                            },
                            unit_amount: 2900,
                        },
                        quantity: 1,
                    },
                ],
            }));
        });
    });
    describe('Authorization failures', () => {
        it('should return 401 when authorization is missing', async () => {
            const event = createMockEvent({
                requestContext: {},
            });
            const result = await (0, create_checkout_session_1.handler)(event);
            expect(result.statusCode).toBe(401);
            const body = JSON.parse(result.body);
            expect(body.error).toBe('Unauthorized');
        });
        it('should return 403 when user tries to create session for another user', async () => {
            const event = createMockEvent({
                pathParameters: {
                    userId: 'different-user-456',
                },
            });
            const result = await (0, create_checkout_session_1.handler)(event);
            expect(result.statusCode).toBe(403);
            const body = JSON.parse(result.body);
            expect(body.error).toBe('Forbidden');
        });
    });
    describe('Invalid request handling', () => {
        it('should return 400 for missing userId parameter', async () => {
            const event = createMockEvent({
                pathParameters: {},
            });
            const result = await (0, create_checkout_session_1.handler)(event);
            expect(result.statusCode).toBe(400);
            const body = JSON.parse(result.body);
            expect(body.error).toBe('Missing userId parameter');
        });
        it('should return 400 for missing request body', async () => {
            const event = createMockEvent({
                body: null,
            });
            const result = await (0, create_checkout_session_1.handler)(event);
            expect(result.statusCode).toBe(400);
            const body = JSON.parse(result.body);
            expect(body.error).toBe('Missing request body');
        });
        it('should return 400 for invalid JSON in request body', async () => {
            const event = createMockEvent({
                body: 'invalid json',
            });
            const result = await (0, create_checkout_session_1.handler)(event);
            expect(result.statusCode).toBe(400);
            const body = JSON.parse(result.body);
            expect(body.error).toBe('Invalid JSON in request body');
        });
        it('should return 400 for invalid sessionType', async () => {
            const event = createMockEvent({
                body: JSON.stringify({
                    sessionType: 'invalid',
                    successUrl: 'https://example.com/success',
                    cancelUrl: 'https://example.com/cancel',
                }),
            });
            const result = await (0, create_checkout_session_1.handler)(event);
            expect(result.statusCode).toBe(400);
            const body = JSON.parse(result.body);
            expect(body.error).toBe('Invalid or missing sessionType. Must be "subscription" or "one-time"');
        });
        it('should return 400 for missing URLs', async () => {
            const event = createMockEvent({
                body: JSON.stringify({
                    sessionType: 'subscription',
                    priceId: 'price_test123',
                }),
            });
            const result = await (0, create_checkout_session_1.handler)(event);
            expect(result.statusCode).toBe(400);
            const body = JSON.parse(result.body);
            expect(body.error).toBe('Missing successUrl or cancelUrl');
        });
        it('should return 400 for invalid URLs', async () => {
            const event = createMockEvent({
                body: JSON.stringify({
                    sessionType: 'subscription',
                    priceId: 'price_test123',
                    successUrl: 'not-a-url',
                    cancelUrl: '/relative/path',
                }),
            });
            const result = await (0, create_checkout_session_1.handler)(event);
            expect(result.statusCode).toBe(400);
            const body = JSON.parse(result.body);
            expect(body.error).toBe('Invalid successUrl or cancelUrl. Must be absolute URLs');
        });
        it('should return 400 for missing priceId in subscription', async () => {
            const event = createMockEvent({
                body: JSON.stringify({
                    sessionType: 'subscription',
                    successUrl: 'https://example.com/success',
                    cancelUrl: 'https://example.com/cancel',
                }),
            });
            const result = await (0, create_checkout_session_1.handler)(event);
            expect(result.statusCode).toBe(400);
            const body = JSON.parse(result.body);
            expect(body.error).toBe('priceId is required for subscription sessions');
        });
        it('should return 400 for disallowed price ID', async () => {
            const event = createMockEvent({
                body: JSON.stringify({
                    sessionType: 'subscription',
                    priceId: 'price_not_allowed',
                    successUrl: 'https://example.com/success',
                    cancelUrl: 'https://example.com/cancel',
                }),
            });
            const result = await (0, create_checkout_session_1.handler)(event);
            expect(result.statusCode).toBe(400);
            const body = JSON.parse(result.body);
            expect(body.error).toBe('Invalid price ID');
        });
    });
    describe('Stripe API error handling', () => {
        it('should handle Stripe API errors gracefully', async () => {
            const stripeMock = new stripe_1.default(mockStripeApiKey);
            const stripeError = {
                message: 'Invalid API key',
                statusCode: 401,
                type: 'StripeAuthenticationError',
            };
            stripeMock.checkout.sessions.create.mockRejectedValue(stripeError);
            const event = createMockEvent();
            const result = await (0, create_checkout_session_1.handler)(event);
            expect(result.statusCode).toBe(401);
            const body = JSON.parse(result.body);
            expect(body.error).toBe('Invalid API key');
        });
        it('should not expose sensitive Stripe errors', async () => {
            const stripeMock = new stripe_1.default(mockStripeApiKey);
            const stripeError = {
                message: 'Internal Stripe error with sensitive data',
                statusCode: 500,
                type: 'StripeAPIError',
            };
            stripeMock.checkout.sessions.create.mockRejectedValue(stripeError);
            const event = createMockEvent();
            const result = await (0, create_checkout_session_1.handler)(event);
            expect(result.statusCode).toBe(500);
            const body = JSON.parse(result.body);
            expect(body.error).toBe('Payment processing error');
        });
    });
    describe('SSM parameter errors', () => {
        it('should handle missing SSM parameter', async () => {
            ssmMock.on(client_ssm_1.GetParameterCommand).rejects(new Error('Parameter not found'));
            const event = createMockEvent();
            const result = await (0, create_checkout_session_1.handler)(event);
            expect(result.statusCode).toBe(500);
            const body = JSON.parse(result.body);
            expect(body.error).toBe('Internal server error');
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3JlYXRlLWNoZWNrb3V0LXNlc3Npb24udGVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImNyZWF0ZS1jaGVja291dC1zZXNzaW9uLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFDQSw4RkFBMkU7QUFDM0UsNkRBQWlEO0FBQ2pELG9EQUFxRTtBQUNyRSxvREFBNEI7QUFFNUIsY0FBYztBQUNkLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLEdBQUcsRUFBRTtJQUN2QixPQUFPLElBQUksQ0FBQyxFQUFFLEVBQUUsQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDO1FBQ3pDLFFBQVEsRUFBRTtZQUNSLFFBQVEsRUFBRTtnQkFDUixNQUFNLEVBQUUsSUFBSSxDQUFDLEVBQUUsRUFBRTthQUNsQjtTQUNGO0tBQ0YsQ0FBQyxDQUFDLENBQUM7QUFDTixDQUFDLENBQUMsQ0FBQztBQUVILE1BQU0sT0FBTyxHQUFHLElBQUEsZ0NBQVUsRUFBQyxzQkFBUyxDQUFDLENBQUM7QUFFdEMsUUFBUSxDQUFDLGdDQUFnQyxFQUFFLEdBQUcsRUFBRTtJQUM5QyxNQUFNLGdCQUFnQixHQUFHLHNCQUFzQixDQUFDO0lBQ2hELE1BQU0sVUFBVSxHQUFHLGVBQWUsQ0FBQztJQUNuQyxNQUFNLFNBQVMsR0FBRyxrQkFBa0IsQ0FBQztJQUVyQyxVQUFVLENBQUMsR0FBRyxFQUFFO1FBQ2QsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO1FBQ3JCLE9BQU8sQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUVoQixpQkFBaUI7UUFDakIsT0FBTyxDQUFDLEVBQUUsQ0FBQyxnQ0FBbUIsQ0FBQyxDQUFDLFFBQVEsQ0FBQztZQUN2QyxTQUFTLEVBQUU7Z0JBQ1QsS0FBSyxFQUFFLGdCQUFnQjthQUN4QjtTQUNGLENBQUMsQ0FBQztRQUVILDhCQUE4QjtRQUM5QixPQUFPLENBQUMsR0FBRyxDQUFDLDZCQUE2QixHQUFHLDZCQUE2QixDQUFD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O0lBQ0wsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEFQSUdhdGV3YXlQcm94eUV2ZW50LCBBUElHYXRld2F5UHJveHlSZXN1bHQgfSBmcm9tICdhd3MtbGFtYmRhJztcbmltcG9ydCB7IGhhbmRsZXIgfSBmcm9tICcuLi8uLi8uLi9sYW1iZGEvcGF5bWVudHMvY3JlYXRlLWNoZWNrb3V0LXNlc3Npb24nO1xuaW1wb3J0IHsgbW9ja0NsaWVudCB9IGZyb20gJ2F3cy1zZGstY2xpZW50LW1vY2snO1xuaW1wb3J0IHsgU1NNQ2xpZW50LCBHZXRQYXJhbWV0ZXJDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXNzbSc7XG5pbXBvcnQgU3RyaXBlIGZyb20gJ3N0cmlwZSc7XG5cbi8vIE1vY2sgU3RyaXBlXG5qZXN0Lm1vY2soJ3N0cmlwZScsICgpID0+IHtcbiAgcmV0dXJuIGplc3QuZm4oKS5tb2NrSW1wbGVtZW50YXRpb24oKCkgPT4gKHtcbiAgICBjaGVja291dDoge1xuICAgICAgc2Vzc2lvbnM6IHtcbiAgICAgICAgY3JlYXRlOiBqZXN0LmZuKCksXG4gICAgICB9LFxuICAgIH0sXG4gIH0pKTtcbn0pO1xuXG5jb25zdCBzc21Nb2NrID0gbW9ja0NsaWVudChTU01DbGllbnQpO1xuXG5kZXNjcmliZSgnQ3JlYXRlIENoZWNrb3V0IFNlc3Npb24gTGFtYmRhJywgKCkgPT4ge1xuICBjb25zdCBtb2NrU3RyaXBlQXBpS2V5ID0gJ3NrX3Rlc3RfbW9ja19rZXlfMTIzJztcbiAgY29uc3QgbW9ja1VzZXJJZCA9ICd0ZXN0LXVzZXItMTIzJztcbiAgY29uc3QgbW9ja0VtYWlsID0gJ3Rlc3RAZXhhbXBsZS5jb20nO1xuXG4gIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgIGplc3QuY2xlYXJBbGxNb2NrcygpO1xuICAgIHNzbU1vY2sucmVzZXQoKTtcblxuICAgIC8vIFNldHVwIFNTTSBtb2NrXG4gICAgc3NtTW9jay5vbihHZXRQYXJhbWV0ZXJDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICBQYXJhbWV0ZXI6IHtcbiAgICAgICAgVmFsdWU6IG1vY2tTdHJpcGVBcGlLZXksXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gU2V0dXAgZW52aXJvbm1lbnQgdmFyaWFibGVzXG4gICAgcHJvY2Vzcy5lbnYuU1RSSVBFX0FQSV9LRVlfUEFSQU1FVEVSX05BTUUgPSAnL2F1cmEyOC90ZXN0L3N0cmlwZS9hcGkta2V5JztcbiAgICBwcm9jZXNzLmVudi5BTExPV0VEX1BSSUNFX0lEUyA9ICdwcmljZV90ZXN0MTIzLHByaWNlX3Rlc3Q0NTYnO1xuICB9KTtcblxuICBjb25zdCBjcmVhdGVNb2NrRXZlbnQgPSAob3ZlcnJpZGVzOiBQYXJ0aWFsPEFQSUdhdGV3YXlQcm94eUV2ZW50PiA9IHt9KTogQVBJR2F0ZXdheVByb3h5RXZlbnQgPT5cbiAgICAoe1xuICAgICAgaHR0cE1ldGhvZDogJ1BPU1QnLFxuICAgICAgcGF0aDogJy9hcGkvdXNlcnMvdGVzdC11c2VyLTEyMy9jaGVja291dC1zZXNzaW9uJyxcbiAgICAgIHBhdGhQYXJhbWV0ZXJzOiB7XG4gICAgICAgIHVzZXJJZDogbW9ja1VzZXJJZCxcbiAgICAgIH0sXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICB9LFxuICAgICAgcmVxdWVzdENvbnRleHQ6IHtcbiAgICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICAgIGNsYWltczoge1xuICAgICAgICAgICAgc3ViOiBtb2NrVXNlcklkLFxuICAgICAgICAgICAgZW1haWw6IG1vY2tFbWFpbCxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSBhcyB1bmtub3duIGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50WydyZXF1ZXN0Q29udGV4dCddLFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICBzZXNzaW9uVHlwZTogJ3N1YnNjcmlwdGlvbicsXG4gICAgICAgIHByaWNlSWQ6ICdwcmljZV90ZXN0MTIzJyxcbiAgICAgICAgc3VjY2Vzc1VybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vc3VjY2VzcycsXG4gICAgICAgIGNhbmNlbFVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vY2FuY2VsJyxcbiAgICAgIH0pLFxuICAgICAgLi4ub3ZlcnJpZGVzLFxuICAgIH0pIGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50O1xuXG4gIGRlc2NyaWJlKCdTdWNjZXNzZnVsIHNlc3Npb24gY3JlYXRpb24nLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBjcmVhdGUgYSBzdWJzY3JpcHRpb24gY2hlY2tvdXQgc2Vzc2lvbiBzdWNjZXNzZnVsbHknLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBtb2NrU2Vzc2lvbklkID0gJ2NzX3Rlc3Rfc2Vzc2lvbjEyMyc7XG4gICAgICBjb25zdCBtb2NrU2Vzc2lvblVybCA9ICdodHRwczovL2NoZWNrb3V0LnN0cmlwZS5jb20vc2Vzc2lvbjEyMyc7XG5cbiAgICAgIC8vIE1vY2sgU3RyaXBlIHNlc3Npb24gY3JlYXRpb25cbiAgICAgIGNvbnN0IHN0cmlwZU1vY2sgPSBuZXcgKFN0cmlwZSBhcyBqZXN0Lk1vY2tlZENsYXNzPHR5cGVvZiBTdHJpcGU+KShcbiAgICAgICAgbW9ja1N0cmlwZUFwaUtleSxcbiAgICAgICkgYXMgdW5rbm93biBhcyB7XG4gICAgICAgIGNoZWNrb3V0OiB7XG4gICAgICAgICAgc2Vzc2lvbnM6IHtcbiAgICAgICAgICAgIGNyZWF0ZTogamVzdC5Nb2NrO1xuICAgICAgICAgIH07XG4gICAgICAgIH07XG4gICAgICB9O1xuICAgICAgc3RyaXBlTW9jay5jaGVja291dC5zZXNzaW9ucy5jcmVhdGUubW9ja1Jlc29sdmVkVmFsdWUoe1xuICAgICAgICBpZDogbW9ja1Nlc3Npb25JZCxcbiAgICAgICAgdXJsOiBtb2NrU2Vzc2lvblVybCxcbiAgICAgIH0gYXMgU3RyaXBlLkNoZWNrb3V0LlNlc3Npb24pO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCgpO1xuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keSkudG9FcXVhbCh7XG4gICAgICAgIHNlc3Npb25JZDogbW9ja1Nlc3Npb25JZCxcbiAgICAgICAgdXJsOiBtb2NrU2Vzc2lvblVybCxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBWZXJpZnkgU3RyaXBlIHdhcyBjYWxsZWQgd2l0aCBjb3JyZWN0IHBhcmFtZXRlcnNcbiAgICAgIGV4cGVjdChzdHJpcGVNb2NrLmNoZWNrb3V0LnNlc3Npb25zLmNyZWF0ZSkudG9IYXZlQmVlbkNhbGxlZFdpdGgoXG4gICAgICAgIGV4cGVjdC5vYmplY3RDb250YWluaW5nKHtcbiAgICAgICAgICBtb2RlOiAnc3Vic2NyaXB0aW9uJyxcbiAgICAgICAgICBwYXltZW50X21ldGhvZF90eXBlczogWydjYXJkJ10sXG4gICAgICAgICAgbGluZV9pdGVtczogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBwcmljZTogJ3ByaWNlX3Rlc3QxMjMnLFxuICAgICAgICAgICAgICBxdWFudGl0eTogMSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgXSxcbiAgICAgICAgICBzdWNjZXNzX3VybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vc3VjY2VzcycsXG4gICAgICAgICAgY2FuY2VsX3VybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vY2FuY2VsJyxcbiAgICAgICAgICBjdXN0b21lcl9lbWFpbDogbW9ja0VtYWlsLFxuICAgICAgICAgIGNsaWVudF9yZWZlcmVuY2VfaWQ6IG1vY2tVc2VySWQsXG4gICAgICAgICAgbWV0YWRhdGE6IHtcbiAgICAgICAgICAgIHVzZXJJZDogbW9ja1VzZXJJZCxcbiAgICAgICAgICAgIHNlc3Npb25UeXBlOiAnc3Vic2NyaXB0aW9uJyxcbiAgICAgICAgICB9LFxuICAgICAgICB9KSxcbiAgICAgICk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGNyZWF0ZSBhIG9uZS10aW1lIHBheW1lbnQgc2Vzc2lvbiBzdWNjZXNzZnVsbHknLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBtb2NrU2Vzc2lvbklkID0gJ2NzX3Rlc3Rfc2Vzc2lvbjQ1Nic7XG4gICAgICBjb25zdCBtb2NrU2Vzc2lvblVybCA9ICdodHRwczovL2NoZWNrb3V0LnN0cmlwZS5jb20vc2Vzc2lvbjQ1Nic7XG5cbiAgICAgIC8vIE1vY2sgU3RyaXBlIHNlc3Npb24gY3JlYXRpb25cbiAgICAgIGNvbnN0IHN0cmlwZU1vY2sgPSBuZXcgKFN0cmlwZSBhcyBqZXN0Lk1vY2tlZENsYXNzPHR5cGVvZiBTdHJpcGU+KShcbiAgICAgICAgbW9ja1N0cmlwZUFwaUtleSxcbiAgICAgICkgYXMgdW5rbm93biBhcyB7XG4gICAgICAgIGNoZWNrb3V0OiB7XG4gICAgICAgICAgc2Vzc2lvbnM6IHtcbiAgICAgICAgICAgIGNyZWF0ZTogamVzdC5Nb2NrO1xuICAgICAgICAgIH07XG4gICAgICAgIH07XG4gICAgICB9O1xuICAgICAgc3RyaXBlTW9jay5jaGVja291dC5zZXNzaW9ucy5jcmVhdGUubW9ja1Jlc29sdmVkVmFsdWUoe1xuICAgICAgICBpZDogbW9ja1Nlc3Npb25JZCxcbiAgICAgICAgdXJsOiBtb2NrU2Vzc2lvblVybCxcbiAgICAgIH0gYXMgU3RyaXBlLkNoZWNrb3V0LlNlc3Npb24pO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCh7XG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBzZXNzaW9uVHlwZTogJ29uZS10aW1lJyxcbiAgICAgICAgICBzdWNjZXNzVXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9zdWNjZXNzJyxcbiAgICAgICAgICBjYW5jZWxVcmw6ICdodHRwczovL2V4YW1wbGUuY29tL2NhbmNlbCcsXG4gICAgICAgIH0pLFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkpLnRvRXF1YWwoe1xuICAgICAgICBzZXNzaW9uSWQ6IG1vY2tTZXNzaW9uSWQsXG4gICAgICAgIHVybDogbW9ja1Nlc3Npb25VcmwsXG4gICAgICB9KTtcblxuICAgICAgLy8gVmVyaWZ5IGRlZmF1bHQgcHJpY2UgZGF0YSB3YXMgdXNlZCBmb3Igb25lLXRpbWUgcGF5bWVudFxuICAgICAgZXhwZWN0KHN0cmlwZU1vY2suY2hlY2tvdXQuc2Vzc2lvbnMuY3JlYXRlKS50b0hhdmVCZWVuQ2FsbGVkV2l0aChcbiAgICAgICAgZXhwZWN0Lm9iamVjdENvbnRhaW5pbmcoe1xuICAgICAgICAgIG1vZGU6ICdwYXltZW50JyxcbiAgICAgICAgICBsaW5lX2l0ZW1zOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIHByaWNlX2RhdGE6IHtcbiAgICAgICAgICAgICAgICBjdXJyZW5jeTogJ3VzZCcsXG4gICAgICAgICAgICAgICAgcHJvZHVjdF9kYXRhOiB7XG4gICAgICAgICAgICAgICAgICBuYW1lOiAnQXVyYTI4IFJlYWRpbmcnLFxuICAgICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdPbmUtdGltZSBhc3Ryb2xvZ2ljYWwgcmVhZGluZycsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB1bml0X2Ftb3VudDogMjkwMCxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgcXVhbnRpdHk6IDEsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIF0sXG4gICAgICAgIH0pLFxuICAgICAgKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0F1dGhvcml6YXRpb24gZmFpbHVyZXMnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gNDAxIHdoZW4gYXV0aG9yaXphdGlvbiBpcyBtaXNzaW5nJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoe1xuICAgICAgICByZXF1ZXN0Q29udGV4dDoge30gYXMgdW5rbm93biBhcyBBUElHYXRld2F5UHJveHlFdmVudFsncmVxdWVzdENvbnRleHQnXSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoNDAxKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LmVycm9yKS50b0JlKCdVbmF1dGhvcml6ZWQnKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgcmV0dXJuIDQwMyB3aGVuIHVzZXIgdHJpZXMgdG8gY3JlYXRlIHNlc3Npb24gZm9yIGFub3RoZXIgdXNlcicsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KHtcbiAgICAgICAgcGF0aFBhcmFtZXRlcnM6IHtcbiAgICAgICAgICB1c2VySWQ6ICdkaWZmZXJlbnQtdXNlci00NTYnLFxuICAgICAgICB9LFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSg0MDMpO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmUoJ0ZvcmJpZGRlbicpO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnSW52YWxpZCByZXF1ZXN0IGhhbmRsaW5nJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgcmV0dXJuIDQwMCBmb3IgbWlzc2luZyB1c2VySWQgcGFyYW1ldGVyJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoe1xuICAgICAgICBwYXRoUGFyYW1ldGVyczoge30sXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDQwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5lcnJvcikudG9CZSgnTWlzc2luZyB1c2VySWQgcGFyYW1ldGVyJyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHJldHVybiA0MDAgZm9yIG1pc3NpbmcgcmVxdWVzdCBib2R5JywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoe1xuICAgICAgICBib2R5OiBudWxsLFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSg0MDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmUoJ01pc3NpbmcgcmVxdWVzdCBib2R5Jyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHJldHVybiA0MDAgZm9yIGludmFsaWQgSlNPTiBpbiByZXF1ZXN0IGJvZHknLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCh7XG4gICAgICAgIGJvZHk6ICdpbnZhbGlkIGpzb24nLFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSg0MDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmUoJ0ludmFsaWQgSlNPTiBpbiByZXF1ZXN0IGJvZHknKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgcmV0dXJuIDQwMCBmb3IgaW52YWxpZCBzZXNzaW9uVHlwZScsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KHtcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIHNlc3Npb25UeXBlOiAnaW52YWxpZCcsXG4gICAgICAgICAgc3VjY2Vzc1VybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vc3VjY2VzcycsXG4gICAgICAgICAgY2FuY2VsVXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9jYW5jZWwnLFxuICAgICAgICB9KSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoNDAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LmVycm9yKS50b0JlKFxuICAgICAgICAnSW52YWxpZCBvciBtaXNzaW5nIHNlc3Npb25UeXBlLiBNdXN0IGJlIFwic3Vic2NyaXB0aW9uXCIgb3IgXCJvbmUtdGltZVwiJyxcbiAgICAgICk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHJldHVybiA0MDAgZm9yIG1pc3NpbmcgVVJMcycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KHtcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIHNlc3Npb25UeXBlOiAnc3Vic2NyaXB0aW9uJyxcbiAgICAgICAgICBwcmljZUlkOiAncHJpY2VfdGVzdDEyMycsXG4gICAgICAgIH0pLFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSg0MDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmUoJ01pc3Npbmcgc3VjY2Vzc1VybCBvciBjYW5jZWxVcmwnKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgcmV0dXJuIDQwMCBmb3IgaW52YWxpZCBVUkxzJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoe1xuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgc2Vzc2lvblR5cGU6ICdzdWJzY3JpcHRpb24nLFxuICAgICAgICAgIHByaWNlSWQ6ICdwcmljZV90ZXN0MTIzJyxcbiAgICAgICAgICBzdWNjZXNzVXJsOiAnbm90LWEtdXJsJyxcbiAgICAgICAgICBjYW5jZWxVcmw6ICcvcmVsYXRpdmUvcGF0aCcsXG4gICAgICAgIH0pLFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSg0MDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmUoJ0ludmFsaWQgc3VjY2Vzc1VybCBvciBjYW5jZWxVcmwuIE11c3QgYmUgYWJzb2x1dGUgVVJMcycpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gNDAwIGZvciBtaXNzaW5nIHByaWNlSWQgaW4gc3Vic2NyaXB0aW9uJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoe1xuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgc2Vzc2lvblR5cGU6ICdzdWJzY3JpcHRpb24nLFxuICAgICAgICAgIHN1Y2Nlc3NVcmw6ICdodHRwczovL2V4YW1wbGUuY29tL3N1Y2Nlc3MnLFxuICAgICAgICAgIGNhbmNlbFVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vY2FuY2VsJyxcbiAgICAgICAgfSksXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDQwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5lcnJvcikudG9CZSgncHJpY2VJZCBpcyByZXF1aXJlZCBmb3Igc3Vic2NyaXB0aW9uIHNlc3Npb25zJyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHJldHVybiA0MDAgZm9yIGRpc2FsbG93ZWQgcHJpY2UgSUQnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCh7XG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBzZXNzaW9uVHlwZTogJ3N1YnNjcmlwdGlvbicsXG4gICAgICAgICAgcHJpY2VJZDogJ3ByaWNlX25vdF9hbGxvd2VkJyxcbiAgICAgICAgICBzdWNjZXNzVXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9zdWNjZXNzJyxcbiAgICAgICAgICBjYW5jZWxVcmw6ICdodHRwczovL2V4YW1wbGUuY29tL2NhbmNlbCcsXG4gICAgICAgIH0pLFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSg0MDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmUoJ0ludmFsaWQgcHJpY2UgSUQnKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ1N0cmlwZSBBUEkgZXJyb3IgaGFuZGxpbmcnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgU3RyaXBlIEFQSSBlcnJvcnMgZ3JhY2VmdWxseScsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHN0cmlwZU1vY2sgPSBuZXcgKFN0cmlwZSBhcyBqZXN0Lk1vY2tlZENsYXNzPHR5cGVvZiBTdHJpcGU+KShcbiAgICAgICAgbW9ja1N0cmlwZUFwaUtleSxcbiAgICAgICkgYXMgdW5rbm93biBhcyB7XG4gICAgICAgIGNoZWNrb3V0OiB7XG4gICAgICAgICAgc2Vzc2lvbnM6IHtcbiAgICAgICAgICAgIGNyZWF0ZTogamVzdC5Nb2NrO1xuICAgICAgICAgIH07XG4gICAgICAgIH07XG4gICAgICB9O1xuICAgICAgY29uc3Qgc3RyaXBlRXJyb3IgPSB7XG4gICAgICAgIG1lc3NhZ2U6ICdJbnZhbGlkIEFQSSBrZXknLFxuICAgICAgICBzdGF0dXNDb2RlOiA0MDEsXG4gICAgICAgIHR5cGU6ICdTdHJpcGVBdXRoZW50aWNhdGlvbkVycm9yJyxcbiAgICAgIH0gYXMgU3RyaXBlLmVycm9ycy5TdHJpcGVFcnJvcjtcbiAgICAgIHN0cmlwZU1vY2suY2hlY2tvdXQuc2Vzc2lvbnMuY3JlYXRlLm1vY2tSZWplY3RlZFZhbHVlKHN0cmlwZUVycm9yKTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoKTtcbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSg0MDEpO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmUoJ0ludmFsaWQgQVBJIGtleScpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBub3QgZXhwb3NlIHNlbnNpdGl2ZSBTdHJpcGUgZXJyb3JzJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3Qgc3RyaXBlTW9jayA9IG5ldyAoU3RyaXBlIGFzIGplc3QuTW9ja2VkQ2xhc3M8dHlwZW9mIFN0cmlwZT4pKFxuICAgICAgICBtb2NrU3RyaXBlQXBpS2V5LFxuICAgICAgKSBhcyB1bmtub3duIGFzIHtcbiAgICAgICAgY2hlY2tvdXQ6IHtcbiAgICAgICAgICBzZXNzaW9uczoge1xuICAgICAgICAgICAgY3JlYXRlOiBqZXN0Lk1vY2s7XG4gICAgICAgICAgfTtcbiAgICAgICAgfTtcbiAgICAgIH07XG4gICAgICBjb25zdCBzdHJpcGVFcnJvciA9IHtcbiAgICAgICAgbWVzc2FnZTogJ0ludGVybmFsIFN0cmlwZSBlcnJvciB3aXRoIHNlbnNpdGl2ZSBkYXRhJyxcbiAgICAgICAgc3RhdHVzQ29kZTogNTAwLFxuICAgICAgICB0eXBlOiAnU3RyaXBlQVBJRXJyb3InLFxuICAgICAgfSBhcyBTdHJpcGUuZXJyb3JzLlN0cmlwZUVycm9yO1xuICAgICAgc3RyaXBlTW9jay5jaGVja291dC5zZXNzaW9ucy5jcmVhdGUubW9ja1JlamVjdGVkVmFsdWUoc3RyaXBlRXJyb3IpO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCgpO1xuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDUwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5lcnJvcikudG9CZSgnUGF5bWVudCBwcm9jZXNzaW5nIGVycm9yJyk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdTU00gcGFyYW1ldGVyIGVycm9ycycsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBtaXNzaW5nIFNTTSBwYXJhbWV0ZXInLCBhc3luYyAoKSA9PiB7XG4gICAgICBzc21Nb2NrLm9uKEdldFBhcmFtZXRlckNvbW1hbmQpLnJlamVjdHMobmV3IEVycm9yKCdQYXJhbWV0ZXIgbm90IGZvdW5kJykpO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCgpO1xuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDUwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5lcnJvcikudG9CZSgnSW50ZXJuYWwgc2VydmVyIGVycm9yJyk7XG4gICAgfSk7XG4gIH0pO1xufSk7XG4iXX0=