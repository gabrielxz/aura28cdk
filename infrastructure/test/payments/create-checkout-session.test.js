"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const create_checkout_session_1 = require("../../lambda/payments/create-checkout-session");
const aws_sdk_client_mock_1 = require("aws-sdk-client-mock");
const client_ssm_1 = require("@aws-sdk/client-ssm");
// Create mock Stripe instance
const mockCreate = jest.fn();
const mockStripe = {
    checkout: {
        sessions: {
            create: mockCreate,
        },
    },
};
// Mock Stripe
jest.mock('stripe', () => {
    return jest.fn().mockImplementation(() => mockStripe);
});
const ssmMock = (0, aws_sdk_client_mock_1.mockClient)(client_ssm_1.SSMClient);
describe('Create Checkout Session Lambda', () => {
    const mockStripeApiKey = 'sk_test_mock_key_123';
    const mockUserId = 'test-user-123';
    const mockEmail = 'test@example.com';
    beforeEach(() => {
        jest.clearAllMocks();
        ssmMock.reset();
        mockCreate.mockReset();
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
            mockCreate.mockResolvedValue({
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
            expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
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
            mockCreate.mockResolvedValue({
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
            expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
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
            const stripeError = {
                message: 'Invalid API key',
                statusCode: 401,
                type: 'StripeAuthenticationError',
            };
            mockCreate.mockRejectedValue(stripeError);
            const event = createMockEvent();
            const result = await (0, create_checkout_session_1.handler)(event);
            expect(result.statusCode).toBe(401);
            const body = JSON.parse(result.body);
            expect(body.error).toBe('Invalid API key');
        });
        it('should not expose sensitive Stripe errors', async () => {
            const stripeError = {
                message: 'Internal Stripe error with sensitive data',
                statusCode: 500,
                type: 'StripeAPIError',
            };
            mockCreate.mockRejectedValue(stripeError);
            const event = createMockEvent();
            const result = await (0, create_checkout_session_1.handler)(event);
            expect(result.statusCode).toBe(500);
            const body = JSON.parse(result.body);
            expect(body.error).toBe('Payment processing error');
        });
        it('should handle generic errors without Stripe properties', async () => {
            const genericError = new Error('Unknown error');
            mockCreate.mockRejectedValue(genericError);
            const event = createMockEvent();
            const result = await (0, create_checkout_session_1.handler)(event);
            expect(result.statusCode).toBe(500);
            const body = JSON.parse(result.body);
            expect(body.error).toBe('Internal server error');
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
        it('should handle empty SSM parameter value', async () => {
            ssmMock.on(client_ssm_1.GetParameterCommand).resolves({
                Parameter: {
                    Value: '',
                },
            });
            const event = createMockEvent();
            const result = await (0, create_checkout_session_1.handler)(event);
            expect(result.statusCode).toBe(500);
            const body = JSON.parse(result.body);
            expect(body.error).toBe('Internal server error');
        });
    });
    describe('Additional edge cases', () => {
        it('should handle one-time payment with specific priceId', async () => {
            const mockSessionId = 'cs_test_session789';
            const mockSessionUrl = 'https://checkout.stripe.com/session789';
            mockCreate.mockResolvedValue({
                id: mockSessionId,
                url: mockSessionUrl,
            });
            const event = createMockEvent({
                body: JSON.stringify({
                    sessionType: 'one-time',
                    priceId: 'price_test123',
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
            expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
                mode: 'payment',
                line_items: [
                    {
                        price: 'price_test123',
                        quantity: 1,
                    },
                ],
            }));
        });
        it('should include custom metadata in session creation', async () => {
            const mockSessionId = 'cs_test_metadata';
            const mockSessionUrl = 'https://checkout.stripe.com/metadata';
            mockCreate.mockResolvedValue({
                id: mockSessionId,
                url: mockSessionUrl,
            });
            const customMetadata = {
                campaign: 'summer2024',
                referrer: 'newsletter',
            };
            const event = createMockEvent({
                body: JSON.stringify({
                    sessionType: 'subscription',
                    priceId: 'price_test123',
                    successUrl: 'https://example.com/success',
                    cancelUrl: 'https://example.com/cancel',
                    metadata: customMetadata,
                }),
            });
            const result = await (0, create_checkout_session_1.handler)(event);
            expect(result.statusCode).toBe(200);
            expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
                metadata: expect.objectContaining({
                    userId: mockUserId,
                    sessionType: 'subscription',
                    ...customMetadata,
                }),
            }));
        });
        it('should use customer email from request when provided', async () => {
            const mockSessionId = 'cs_test_email';
            const mockSessionUrl = 'https://checkout.stripe.com/email';
            const customEmail = 'custom@example.com';
            mockCreate.mockResolvedValue({
                id: mockSessionId,
                url: mockSessionUrl,
            });
            const event = createMockEvent({
                body: JSON.stringify({
                    sessionType: 'subscription',
                    priceId: 'price_test123',
                    successUrl: 'https://example.com/success',
                    cancelUrl: 'https://example.com/cancel',
                    customerEmail: customEmail,
                }),
            });
            const result = await (0, create_checkout_session_1.handler)(event);
            expect(result.statusCode).toBe(200);
            expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
                customer_email: customEmail,
            }));
        });
        it('should handle missing sessionType gracefully', async () => {
            const event = createMockEvent({
                body: JSON.stringify({
                    priceId: 'price_test123',
                    successUrl: 'https://example.com/success',
                    cancelUrl: 'https://example.com/cancel',
                }),
            });
            const result = await (0, create_checkout_session_1.handler)(event);
            expect(result.statusCode).toBe(400);
            const body = JSON.parse(result.body);
            expect(body.error).toContain('sessionType');
        });
        it('should handle pathParameters being null', async () => {
            const event = createMockEvent({
                pathParameters: null,
            });
            const result = await (0, create_checkout_session_1.handler)(event);
            expect(result.statusCode).toBe(400);
            const body = JSON.parse(result.body);
            expect(body.error).toBe('Missing userId parameter');
        });
        it('should handle authorizer context being null', async () => {
            const event = createMockEvent({
                requestContext: {
                    authorizer: null,
                },
            });
            const result = await (0, create_checkout_session_1.handler)(event);
            expect(result.statusCode).toBe(401);
            const body = JSON.parse(result.body);
            expect(body.error).toBe('Unauthorized');
        });
        it('should handle empty allowed price IDs environment variable', async () => {
            delete process.env.ALLOWED_PRICE_IDS;
            const mockSessionId = 'cs_test_no_allowlist';
            const mockSessionUrl = 'https://checkout.stripe.com/no_allowlist';
            mockCreate.mockResolvedValue({
                id: mockSessionId,
                url: mockSessionUrl,
            });
            const event = createMockEvent({
                body: JSON.stringify({
                    sessionType: 'subscription',
                    priceId: 'any_price_id',
                    successUrl: 'https://example.com/success',
                    cancelUrl: 'https://example.com/cancel',
                }),
            });
            const result = await (0, create_checkout_session_1.handler)(event);
            // Should succeed since no allowlist is configured
            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body.sessionId).toBe(mockSessionId);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3JlYXRlLWNoZWNrb3V0LXNlc3Npb24udGVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImNyZWF0ZS1jaGVja291dC1zZXNzaW9uLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFDQSwyRkFBd0U7QUFDeEUsNkRBQWlEO0FBQ2pELG9EQUFxRTtBQUdyRSw4QkFBOEI7QUFDOUIsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLEVBQUUsRUFBRSxDQUFDO0FBQzdCLE1BQU0sVUFBVSxHQUFHO0lBQ2pCLFFBQVEsRUFBRTtRQUNSLFFBQVEsRUFBRTtZQUNSLE1BQU0sRUFBRSxVQUFVO1NBQ25CO0tBQ0Y7Q0FDRixDQUFDO0FBRUYsY0FBYztBQUNkLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLEdBQUcsRUFBRTtJQUN2QixPQUFPLElBQUksQ0FBQyxFQUFFLEVBQUUsQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxVQUFVLENBQUMsQ0FBQztBQUN4RCxDQUFDLENBQUMsQ0FBQztBQUVILE1BQU0sT0FBTyxHQUFHLElBQUEsZ0NBQVUsRUFBQyxzQkFBUyxDQUFDLENBQUM7QUFFdEMsUUFBUSxDQUFDLGdDQUFnQyxFQUFFLEdBQUcsRUFBRTtJQUM5QyxNQUFNLGdCQUFnQixHQUFHLHNCQUFzQixDQUFDO0lBQ2hELE1BQU0sVUFBVSxHQUFHLGVBQWUsQ0FBQztJQUNuQyxNQUFNLFNBQVMsR0FBRyxrQkFBa0IsQ0FBQztJQUVyQyxVQUFVLENBQUMsR0FBRyxFQUFFO1FBQ2QsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO1FBQ3JCLE9BQU8sQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNoQixVQUFVLENBQUMsU0FBUyxFQUFFLENBQUM7UUFFdkIsaUJBQWlCO1FBQ2pCLE9BQU8sQ0FBQyxFQUFFLENBQUMsZ0NBQW1CLENBQUMsQ0FBQyxRQUFRLENBQUM7WUFDdkMsU0FBUyxFQUFFO2dCQUNULEtBQUssRUFBRSxnQkFBZ0I7YUFD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QzNCLEVBQUUsRUFBRSxhQUFhO2dCQUNqQixHQUFHLEVBQUUsY0FBYzthQUNPLENBQUMsQ0FBQztZQUU5QixNQUFNLEtBQUssR0FBRyxlQUFlLENBQUM7Z0JBQzVCLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDO29CQUNuQixXQUFXLEVBQUUsY0FBYztvQkFDM0IsT0FBTyxFQUFFLGNBQWM7b0JBQ3ZCLFVBQVUsRUFBRSw2QkFBNkI7b0JBQ3pDLFNBQVMsRUFBRSw0QkFBNEI7aUJBQ3hDLENBQUM7YUFDSCxDQUFDLENBQUM7WUFFSCxNQUFNLE1BQU0sR0FBMEIsTUFBTSxJQUFBLGlDQUFPLEVBQUMsS0FBSyxDQUFDLENBQUM7WUFFM0Qsa0RBQWtEO1lBQ2xELE1BQU0sQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3BDLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3JDLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQzdDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEFQSUdhdGV3YXlQcm94eUV2ZW50LCBBUElHYXRld2F5UHJveHlSZXN1bHQgfSBmcm9tICdhd3MtbGFtYmRhJztcbmltcG9ydCB7IGhhbmRsZXIgfSBmcm9tICcuLi8uLi9sYW1iZGEvcGF5bWVudHMvY3JlYXRlLWNoZWNrb3V0LXNlc3Npb24nO1xuaW1wb3J0IHsgbW9ja0NsaWVudCB9IGZyb20gJ2F3cy1zZGstY2xpZW50LW1vY2snO1xuaW1wb3J0IHsgU1NNQ2xpZW50LCBHZXRQYXJhbWV0ZXJDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXNzbSc7XG5pbXBvcnQgU3RyaXBlIGZyb20gJ3N0cmlwZSc7XG5cbi8vIENyZWF0ZSBtb2NrIFN0cmlwZSBpbnN0YW5jZVxuY29uc3QgbW9ja0NyZWF0ZSA9IGplc3QuZm4oKTtcbmNvbnN0IG1vY2tTdHJpcGUgPSB7XG4gIGNoZWNrb3V0OiB7XG4gICAgc2Vzc2lvbnM6IHtcbiAgICAgIGNyZWF0ZTogbW9ja0NyZWF0ZSxcbiAgICB9LFxuICB9LFxufTtcblxuLy8gTW9jayBTdHJpcGVcbmplc3QubW9jaygnc3RyaXBlJywgKCkgPT4ge1xuICByZXR1cm4gamVzdC5mbigpLm1vY2tJbXBsZW1lbnRhdGlvbigoKSA9PiBtb2NrU3RyaXBlKTtcbn0pO1xuXG5jb25zdCBzc21Nb2NrID0gbW9ja0NsaWVudChTU01DbGllbnQpO1xuXG5kZXNjcmliZSgnQ3JlYXRlIENoZWNrb3V0IFNlc3Npb24gTGFtYmRhJywgKCkgPT4ge1xuICBjb25zdCBtb2NrU3RyaXBlQXBpS2V5ID0gJ3NrX3Rlc3RfbW9ja19rZXlfMTIzJztcbiAgY29uc3QgbW9ja1VzZXJJZCA9ICd0ZXN0LXVzZXItMTIzJztcbiAgY29uc3QgbW9ja0VtYWlsID0gJ3Rlc3RAZXhhbXBsZS5jb20nO1xuXG4gIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgIGplc3QuY2xlYXJBbGxNb2NrcygpO1xuICAgIHNzbU1vY2sucmVzZXQoKTtcbiAgICBtb2NrQ3JlYXRlLm1vY2tSZXNldCgpO1xuXG4gICAgLy8gU2V0dXAgU1NNIG1vY2tcbiAgICBzc21Nb2NrLm9uKEdldFBhcmFtZXRlckNvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgIFBhcmFtZXRlcjoge1xuICAgICAgICBWYWx1ZTogbW9ja1N0cmlwZUFwaUtleSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBTZXR1cCBlbnZpcm9ubWVudCB2YXJpYWJsZXNcbiAgICBwcm9jZXNzLmVudi5TVFJJUEVfQVBJX0tFWV9QQVJBTUVURVJfTkFNRSA9ICcvYXVyYTI4L3Rlc3Qvc3RyaXBlL2FwaS1rZXknO1xuICAgIHByb2Nlc3MuZW52LkFMTE9XRURfUFJJQ0VfSURTID0gJ3ByaWNlX3Rlc3QxMjMscHJpY2VfdGVzdDQ1Nic7XG4gIH0pO1xuXG4gIGNvbnN0IGNyZWF0ZU1vY2tFdmVudCA9IChvdmVycmlkZXM6IFBhcnRpYWw8QVBJR2F0ZXdheVByb3h5RXZlbnQ+ID0ge30pOiBBUElHYXRld2F5UHJveHlFdmVudCA9PlxuICAgICh7XG4gICAgICBodHRwTWV0aG9kOiAnUE9TVCcsXG4gICAgICBwYXRoOiAnL2FwaS91c2Vycy90ZXN0LXVzZXItMTIzL2NoZWNrb3V0LXNlc3Npb24nLFxuICAgICAgcGF0aFBhcmFtZXRlcnM6IHtcbiAgICAgICAgdXNlcklkOiBtb2NrVXNlcklkLFxuICAgICAgfSxcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgIH0sXG4gICAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgICBhdXRob3JpemVyOiB7XG4gICAgICAgICAgY2xhaW1zOiB7XG4gICAgICAgICAgICBzdWI6IG1vY2tVc2VySWQsXG4gICAgICAgICAgICBlbWFpbDogbW9ja0VtYWlsLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9IGFzIHVua25vd24gYXMgQVBJR2F0ZXdheVByb3h5RXZlbnRbJ3JlcXVlc3RDb250ZXh0J10sXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgIHNlc3Npb25UeXBlOiAnc3Vic2NyaXB0aW9uJyxcbiAgICAgICAgcHJpY2VJZDogJ3ByaWNlX3Rlc3QxMjMnLFxuICAgICAgICBzdWNjZXNzVXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9zdWNjZXNzJyxcbiAgICAgICAgY2FuY2VsVXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9jYW5jZWwnLFxuICAgICAgfSksXG4gICAgICAuLi5vdmVycmlkZXMsXG4gICAgfSkgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQ7XG5cbiAgZGVzY3JpYmUoJ1N1Y2Nlc3NmdWwgc2Vzc2lvbiBjcmVhdGlvbicsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGNyZWF0ZSBhIHN1YnNjcmlwdGlvbiBjaGVja291dCBzZXNzaW9uIHN1Y2Nlc3NmdWxseScsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IG1vY2tTZXNzaW9uSWQgPSAnY3NfdGVzdF9zZXNzaW9uMTIzJztcbiAgICAgIGNvbnN0IG1vY2tTZXNzaW9uVXJsID0gJ2h0dHBzOi8vY2hlY2tvdXQuc3RyaXBlLmNvbS9zZXNzaW9uMTIzJztcblxuICAgICAgLy8gTW9jayBTdHJpcGUgc2Vzc2lvbiBjcmVhdGlvblxuICAgICAgbW9ja0NyZWF0ZS5tb2NrUmVzb2x2ZWRWYWx1ZSh7XG4gICAgICAgIGlkOiBtb2NrU2Vzc2lvbklkLFxuICAgICAgICB1cmw6IG1vY2tTZXNzaW9uVXJsLFxuICAgICAgfSBhcyBTdHJpcGUuQ2hlY2tvdXQuU2Vzc2lvbik7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KCk7XG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5KS50b0VxdWFsKHtcbiAgICAgICAgc2Vzc2lvbklkOiBtb2NrU2Vzc2lvbklkLFxuICAgICAgICB1cmw6IG1vY2tTZXNzaW9uVXJsLFxuICAgICAgfSk7XG5cbiAgICAgIC8vIFZlcmlmeSBTdHJpcGUgd2FzIGNhbGxlZCB3aXRoIGNvcnJlY3QgcGFyYW1ldGVyc1xuICAgICAgZXhwZWN0KG1vY2tDcmVhdGUpLnRvSGF2ZUJlZW5DYWxsZWRXaXRoKFxuICAgICAgICBleHBlY3Qub2JqZWN0Q29udGFpbmluZyh7XG4gICAgICAgICAgbW9kZTogJ3N1YnNjcmlwdGlvbicsXG4gICAgICAgICAgcGF5bWVudF9tZXRob2RfdHlwZXM6IFsnY2FyZCddLFxuICAgICAgICAgIGxpbmVfaXRlbXM6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgcHJpY2U6ICdwcmljZV90ZXN0MTIzJyxcbiAgICAgICAgICAgICAgcXVhbnRpdHk6IDEsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIF0sXG4gICAgICAgICAgc3VjY2Vzc191cmw6ICdodHRwczovL2V4YW1wbGUuY29tL3N1Y2Nlc3MnLFxuICAgICAgICAgIGNhbmNlbF91cmw6ICdodHRwczovL2V4YW1wbGUuY29tL2NhbmNlbCcsXG4gICAgICAgICAgY3VzdG9tZXJfZW1haWw6IG1vY2tFbWFpbCxcbiAgICAgICAgICBjbGllbnRfcmVmZXJlbmNlX2lkOiBtb2NrVXNlcklkLFxuICAgICAgICAgIG1ldGFkYXRhOiB7XG4gICAgICAgICAgICB1c2VySWQ6IG1vY2tVc2VySWQsXG4gICAgICAgICAgICBzZXNzaW9uVHlwZTogJ3N1YnNjcmlwdGlvbicsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSksXG4gICAgICApO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBjcmVhdGUgYSBvbmUtdGltZSBwYXltZW50IHNlc3Npb24gc3VjY2Vzc2Z1bGx5JywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgbW9ja1Nlc3Npb25JZCA9ICdjc190ZXN0X3Nlc3Npb240NTYnO1xuICAgICAgY29uc3QgbW9ja1Nlc3Npb25VcmwgPSAnaHR0cHM6Ly9jaGVja291dC5zdHJpcGUuY29tL3Nlc3Npb240NTYnO1xuXG4gICAgICAvLyBNb2NrIFN0cmlwZSBzZXNzaW9uIGNyZWF0aW9uXG4gICAgICBtb2NrQ3JlYXRlLm1vY2tSZXNvbHZlZFZhbHVlKHtcbiAgICAgICAgaWQ6IG1vY2tTZXNzaW9uSWQsXG4gICAgICAgIHVybDogbW9ja1Nlc3Npb25VcmwsXG4gICAgICB9IGFzIFN0cmlwZS5DaGVja291dC5TZXNzaW9uKTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoe1xuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgc2Vzc2lvblR5cGU6ICdvbmUtdGltZScsXG4gICAgICAgICAgc3VjY2Vzc1VybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vc3VjY2VzcycsXG4gICAgICAgICAgY2FuY2VsVXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9jYW5jZWwnLFxuICAgICAgICB9KSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5KS50b0VxdWFsKHtcbiAgICAgICAgc2Vzc2lvbklkOiBtb2NrU2Vzc2lvbklkLFxuICAgICAgICB1cmw6IG1vY2tTZXNzaW9uVXJsLFxuICAgICAgfSk7XG5cbiAgICAgIC8vIFZlcmlmeSBkZWZhdWx0IHByaWNlIGRhdGEgd2FzIHVzZWQgZm9yIG9uZS10aW1lIHBheW1lbnRcbiAgICAgIGV4cGVjdChtb2NrQ3JlYXRlKS50b0hhdmVCZWVuQ2FsbGVkV2l0aChcbiAgICAgICAgZXhwZWN0Lm9iamVjdENvbnRhaW5pbmcoe1xuICAgICAgICAgIG1vZGU6ICdwYXltZW50JyxcbiAgICAgICAgICBsaW5lX2l0ZW1zOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIHByaWNlX2RhdGE6IHtcbiAgICAgICAgICAgICAgICBjdXJyZW5jeTogJ3VzZCcsXG4gICAgICAgICAgICAgICAgcHJvZHVjdF9kYXRhOiB7XG4gICAgICAgICAgICAgICAgICBuYW1lOiAnQXVyYTI4IFJlYWRpbmcnLFxuICAgICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdPbmUtdGltZSBhc3Ryb2xvZ2ljYWwgcmVhZGluZycsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB1bml0X2Ftb3VudDogMjkwMCxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgcXVhbnRpdHk6IDEsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIF0sXG4gICAgICAgIH0pLFxuICAgICAgKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0F1dGhvcml6YXRpb24gZmFpbHVyZXMnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gNDAxIHdoZW4gYXV0aG9yaXphdGlvbiBpcyBtaXNzaW5nJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoe1xuICAgICAgICByZXF1ZXN0Q29udGV4dDoge30gYXMgdW5rbm93biBhcyBBUElHYXRld2F5UHJveHlFdmVudFsncmVxdWVzdENvbnRleHQnXSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoNDAxKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LmVycm9yKS50b0JlKCdVbmF1dGhvcml6ZWQnKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgcmV0dXJuIDQwMyB3aGVuIHVzZXIgdHJpZXMgdG8gY3JlYXRlIHNlc3Npb24gZm9yIGFub3RoZXIgdXNlcicsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KHtcbiAgICAgICAgcGF0aFBhcmFtZXRlcnM6IHtcbiAgICAgICAgICB1c2VySWQ6ICdkaWZmZXJlbnQtdXNlci00NTYnLFxuICAgICAgICB9LFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSg0MDMpO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmUoJ0ZvcmJpZGRlbicpO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnSW52YWxpZCByZXF1ZXN0IGhhbmRsaW5nJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgcmV0dXJuIDQwMCBmb3IgbWlzc2luZyB1c2VySWQgcGFyYW1ldGVyJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoe1xuICAgICAgICBwYXRoUGFyYW1ldGVyczoge30sXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDQwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5lcnJvcikudG9CZSgnTWlzc2luZyB1c2VySWQgcGFyYW1ldGVyJyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHJldHVybiA0MDAgZm9yIG1pc3NpbmcgcmVxdWVzdCBib2R5JywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoe1xuICAgICAgICBib2R5OiBudWxsLFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSg0MDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmUoJ01pc3NpbmcgcmVxdWVzdCBib2R5Jyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHJldHVybiA0MDAgZm9yIGludmFsaWQgSlNPTiBpbiByZXF1ZXN0IGJvZHknLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCh7XG4gICAgICAgIGJvZHk6ICdpbnZhbGlkIGpzb24nLFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSg0MDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmUoJ0ludmFsaWQgSlNPTiBpbiByZXF1ZXN0IGJvZHknKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgcmV0dXJuIDQwMCBmb3IgaW52YWxpZCBzZXNzaW9uVHlwZScsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KHtcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIHNlc3Npb25UeXBlOiAnaW52YWxpZCcsXG4gICAgICAgICAgc3VjY2Vzc1VybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vc3VjY2VzcycsXG4gICAgICAgICAgY2FuY2VsVXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9jYW5jZWwnLFxuICAgICAgICB9KSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoNDAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LmVycm9yKS50b0JlKFxuICAgICAgICAnSW52YWxpZCBvciBtaXNzaW5nIHNlc3Npb25UeXBlLiBNdXN0IGJlIFwic3Vic2NyaXB0aW9uXCIgb3IgXCJvbmUtdGltZVwiJyxcbiAgICAgICk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHJldHVybiA0MDAgZm9yIG1pc3NpbmcgVVJMcycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KHtcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIHNlc3Npb25UeXBlOiAnc3Vic2NyaXB0aW9uJyxcbiAgICAgICAgICBwcmljZUlkOiAncHJpY2VfdGVzdDEyMycsXG4gICAgICAgIH0pLFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSg0MDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmUoJ01pc3Npbmcgc3VjY2Vzc1VybCBvciBjYW5jZWxVcmwnKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgcmV0dXJuIDQwMCBmb3IgaW52YWxpZCBVUkxzJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoe1xuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgc2Vzc2lvblR5cGU6ICdzdWJzY3JpcHRpb24nLFxuICAgICAgICAgIHByaWNlSWQ6ICdwcmljZV90ZXN0MTIzJyxcbiAgICAgICAgICBzdWNjZXNzVXJsOiAnbm90LWEtdXJsJyxcbiAgICAgICAgICBjYW5jZWxVcmw6ICcvcmVsYXRpdmUvcGF0aCcsXG4gICAgICAgIH0pLFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSg0MDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmUoJ0ludmFsaWQgc3VjY2Vzc1VybCBvciBjYW5jZWxVcmwuIE11c3QgYmUgYWJzb2x1dGUgVVJMcycpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gNDAwIGZvciBtaXNzaW5nIHByaWNlSWQgaW4gc3Vic2NyaXB0aW9uJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoe1xuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgc2Vzc2lvblR5cGU6ICdzdWJzY3JpcHRpb24nLFxuICAgICAgICAgIHN1Y2Nlc3NVcmw6ICdodHRwczovL2V4YW1wbGUuY29tL3N1Y2Nlc3MnLFxuICAgICAgICAgIGNhbmNlbFVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vY2FuY2VsJyxcbiAgICAgICAgfSksXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDQwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5lcnJvcikudG9CZSgncHJpY2VJZCBpcyByZXF1aXJlZCBmb3Igc3Vic2NyaXB0aW9uIHNlc3Npb25zJyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHJldHVybiA0MDAgZm9yIGRpc2FsbG93ZWQgcHJpY2UgSUQnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCh7XG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBzZXNzaW9uVHlwZTogJ3N1YnNjcmlwdGlvbicsXG4gICAgICAgICAgcHJpY2VJZDogJ3ByaWNlX25vdF9hbGxvd2VkJyxcbiAgICAgICAgICBzdWNjZXNzVXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9zdWNjZXNzJyxcbiAgICAgICAgICBjYW5jZWxVcmw6ICdodHRwczovL2V4YW1wbGUuY29tL2NhbmNlbCcsXG4gICAgICAgIH0pLFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSg0MDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmUoJ0ludmFsaWQgcHJpY2UgSUQnKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ1N0cmlwZSBBUEkgZXJyb3IgaGFuZGxpbmcnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgU3RyaXBlIEFQSSBlcnJvcnMgZ3JhY2VmdWxseScsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHN0cmlwZUVycm9yID0ge1xuICAgICAgICBtZXNzYWdlOiAnSW52YWxpZCBBUEkga2V5JyxcbiAgICAgICAgc3RhdHVzQ29kZTogNDAxLFxuICAgICAgICB0eXBlOiAnU3RyaXBlQXV0aGVudGljYXRpb25FcnJvcicsXG4gICAgICB9O1xuICAgICAgbW9ja0NyZWF0ZS5tb2NrUmVqZWN0ZWRWYWx1ZShzdHJpcGVFcnJvcik7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KCk7XG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoNDAxKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LmVycm9yKS50b0JlKCdJbnZhbGlkIEFQSSBrZXknKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgbm90IGV4cG9zZSBzZW5zaXRpdmUgU3RyaXBlIGVycm9ycycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHN0cmlwZUVycm9yID0ge1xuICAgICAgICBtZXNzYWdlOiAnSW50ZXJuYWwgU3RyaXBlIGVycm9yIHdpdGggc2Vuc2l0aXZlIGRhdGEnLFxuICAgICAgICBzdGF0dXNDb2RlOiA1MDAsXG4gICAgICAgIHR5cGU6ICdTdHJpcGVBUElFcnJvcicsXG4gICAgICB9O1xuICAgICAgbW9ja0NyZWF0ZS5tb2NrUmVqZWN0ZWRWYWx1ZShzdHJpcGVFcnJvcik7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KCk7XG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoNTAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LmVycm9yKS50b0JlKCdQYXltZW50IHByb2Nlc3NpbmcgZXJyb3InKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIGdlbmVyaWMgZXJyb3JzIHdpdGhvdXQgU3RyaXBlIHByb3BlcnRpZXMnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBnZW5lcmljRXJyb3IgPSBuZXcgRXJyb3IoJ1Vua25vd24gZXJyb3InKTtcbiAgICAgIG1vY2tDcmVhdGUubW9ja1JlamVjdGVkVmFsdWUoZ2VuZXJpY0Vycm9yKTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoKTtcbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSg1MDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmUoJ0ludGVybmFsIHNlcnZlciBlcnJvcicpO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnU1NNIHBhcmFtZXRlciBlcnJvcnMnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgbWlzc2luZyBTU00gcGFyYW1ldGVyJywgYXN5bmMgKCkgPT4ge1xuICAgICAgc3NtTW9jay5vbihHZXRQYXJhbWV0ZXJDb21tYW5kKS5yZWplY3RzKG5ldyBFcnJvcignUGFyYW1ldGVyIG5vdCBmb3VuZCcpKTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoKTtcbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSg1MDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmUoJ0ludGVybmFsIHNlcnZlciBlcnJvcicpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgZW1wdHkgU1NNIHBhcmFtZXRlciB2YWx1ZScsIGFzeW5jICgpID0+IHtcbiAgICAgIHNzbU1vY2sub24oR2V0UGFyYW1ldGVyQ29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBQYXJhbWV0ZXI6IHtcbiAgICAgICAgICBWYWx1ZTogJycsXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoKTtcbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSg1MDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmUoJ0ludGVybmFsIHNlcnZlciBlcnJvcicpO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnQWRkaXRpb25hbCBlZGdlIGNhc2VzJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgaGFuZGxlIG9uZS10aW1lIHBheW1lbnQgd2l0aCBzcGVjaWZpYyBwcmljZUlkJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgbW9ja1Nlc3Npb25JZCA9ICdjc190ZXN0X3Nlc3Npb243ODknO1xuICAgICAgY29uc3QgbW9ja1Nlc3Npb25VcmwgPSAnaHR0cHM6Ly9jaGVja291dC5zdHJpcGUuY29tL3Nlc3Npb243ODknO1xuXG4gICAgICBtb2NrQ3JlYXRlLm1vY2tSZXNvbHZlZFZhbHVlKHtcbiAgICAgICAgaWQ6IG1vY2tTZXNzaW9uSWQsXG4gICAgICAgIHVybDogbW9ja1Nlc3Npb25VcmwsXG4gICAgICB9IGFzIFN0cmlwZS5DaGVja291dC5TZXNzaW9uKTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoe1xuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgc2Vzc2lvblR5cGU6ICdvbmUtdGltZScsXG4gICAgICAgICAgcHJpY2VJZDogJ3ByaWNlX3Rlc3QxMjMnLFxuICAgICAgICAgIHN1Y2Nlc3NVcmw6ICdodHRwczovL2V4YW1wbGUuY29tL3N1Y2Nlc3MnLFxuICAgICAgICAgIGNhbmNlbFVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vY2FuY2VsJyxcbiAgICAgICAgfSksXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keSkudG9FcXVhbCh7XG4gICAgICAgIHNlc3Npb25JZDogbW9ja1Nlc3Npb25JZCxcbiAgICAgICAgdXJsOiBtb2NrU2Vzc2lvblVybCxcbiAgICAgIH0pO1xuXG4gICAgICBleHBlY3QobW9ja0NyZWF0ZSkudG9IYXZlQmVlbkNhbGxlZFdpdGgoXG4gICAgICAgIGV4cGVjdC5vYmplY3RDb250YWluaW5nKHtcbiAgICAgICAgICBtb2RlOiAncGF5bWVudCcsXG4gICAgICAgICAgbGluZV9pdGVtczogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBwcmljZTogJ3ByaWNlX3Rlc3QxMjMnLFxuICAgICAgICAgICAgICBxdWFudGl0eTogMSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgXSxcbiAgICAgICAgfSksXG4gICAgICApO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBpbmNsdWRlIGN1c3RvbSBtZXRhZGF0YSBpbiBzZXNzaW9uIGNyZWF0aW9uJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgbW9ja1Nlc3Npb25JZCA9ICdjc190ZXN0X21ldGFkYXRhJztcbiAgICAgIGNvbnN0IG1vY2tTZXNzaW9uVXJsID0gJ2h0dHBzOi8vY2hlY2tvdXQuc3RyaXBlLmNvbS9tZXRhZGF0YSc7XG5cbiAgICAgIG1vY2tDcmVhdGUubW9ja1Jlc29sdmVkVmFsdWUoe1xuICAgICAgICBpZDogbW9ja1Nlc3Npb25JZCxcbiAgICAgICAgdXJsOiBtb2NrU2Vzc2lvblVybCxcbiAgICAgIH0gYXMgU3RyaXBlLkNoZWNrb3V0LlNlc3Npb24pO1xuXG4gICAgICBjb25zdCBjdXN0b21NZXRhZGF0YSA9IHtcbiAgICAgICAgY2FtcGFpZ246ICdzdW1tZXIyMDI0JyxcbiAgICAgICAgcmVmZXJyZXI6ICduZXdzbGV0dGVyJyxcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KHtcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIHNlc3Npb25UeXBlOiAnc3Vic2NyaXB0aW9uJyxcbiAgICAgICAgICBwcmljZUlkOiAncHJpY2VfdGVzdDEyMycsXG4gICAgICAgICAgc3VjY2Vzc1VybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vc3VjY2VzcycsXG4gICAgICAgICAgY2FuY2VsVXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9jYW5jZWwnLFxuICAgICAgICAgIG1ldGFkYXRhOiBjdXN0b21NZXRhZGF0YSxcbiAgICAgICAgfSksXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBleHBlY3QobW9ja0NyZWF0ZSkudG9IYXZlQmVlbkNhbGxlZFdpdGgoXG4gICAgICAgIGV4cGVjdC5vYmplY3RDb250YWluaW5nKHtcbiAgICAgICAgICBtZXRhZGF0YTogZXhwZWN0Lm9iamVjdENvbnRhaW5pbmcoe1xuICAgICAgICAgICAgdXNlcklkOiBtb2NrVXNlcklkLFxuICAgICAgICAgICAgc2Vzc2lvblR5cGU6ICdzdWJzY3JpcHRpb24nLFxuICAgICAgICAgICAgLi4uY3VzdG9tTWV0YWRhdGEsXG4gICAgICAgICAgfSksXG4gICAgICAgIH0pLFxuICAgICAgKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgdXNlIGN1c3RvbWVyIGVtYWlsIGZyb20gcmVxdWVzdCB3aGVuIHByb3ZpZGVkJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgbW9ja1Nlc3Npb25JZCA9ICdjc190ZXN0X2VtYWlsJztcbiAgICAgIGNvbnN0IG1vY2tTZXNzaW9uVXJsID0gJ2h0dHBzOi8vY2hlY2tvdXQuc3RyaXBlLmNvbS9lbWFpbCc7XG4gICAgICBjb25zdCBjdXN0b21FbWFpbCA9ICdjdXN0b21AZXhhbXBsZS5jb20nO1xuXG4gICAgICBtb2NrQ3JlYXRlLm1vY2tSZXNvbHZlZFZhbHVlKHtcbiAgICAgICAgaWQ6IG1vY2tTZXNzaW9uSWQsXG4gICAgICAgIHVybDogbW9ja1Nlc3Npb25VcmwsXG4gICAgICB9IGFzIFN0cmlwZS5DaGVja291dC5TZXNzaW9uKTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoe1xuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgc2Vzc2lvblR5cGU6ICdzdWJzY3JpcHRpb24nLFxuICAgICAgICAgIHByaWNlSWQ6ICdwcmljZV90ZXN0MTIzJyxcbiAgICAgICAgICBzdWNjZXNzVXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9zdWNjZXNzJyxcbiAgICAgICAgICBjYW5jZWxVcmw6ICdodHRwczovL2V4YW1wbGUuY29tL2NhbmNlbCcsXG4gICAgICAgICAgY3VzdG9tZXJFbWFpbDogY3VzdG9tRW1haWwsXG4gICAgICAgIH0pLFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgZXhwZWN0KG1vY2tDcmVhdGUpLnRvSGF2ZUJlZW5DYWxsZWRXaXRoKFxuICAgICAgICBleHBlY3Qub2JqZWN0Q29udGFpbmluZyh7XG4gICAgICAgICAgY3VzdG9tZXJfZW1haWw6IGN1c3RvbUVtYWlsLFxuICAgICAgICB9KSxcbiAgICAgICk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBtaXNzaW5nIHNlc3Npb25UeXBlIGdyYWNlZnVsbHknLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCh7XG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBwcmljZUlkOiAncHJpY2VfdGVzdDEyMycsXG4gICAgICAgICAgc3VjY2Vzc1VybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vc3VjY2VzcycsXG4gICAgICAgICAgY2FuY2VsVXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9jYW5jZWwnLFxuICAgICAgICB9KSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoNDAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LmVycm9yKS50b0NvbnRhaW4oJ3Nlc3Npb25UeXBlJyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBwYXRoUGFyYW1ldGVycyBiZWluZyBudWxsJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoe1xuICAgICAgICBwYXRoUGFyYW1ldGVyczogbnVsbCxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoNDAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LmVycm9yKS50b0JlKCdNaXNzaW5nIHVzZXJJZCBwYXJhbWV0ZXInKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIGF1dGhvcml6ZXIgY29udGV4dCBiZWluZyBudWxsJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoe1xuICAgICAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgICAgIGF1dGhvcml6ZXI6IG51bGwsXG4gICAgICAgIH0gYXMgdW5rbm93biBhcyBBUElHYXRld2F5UHJveHlFdmVudFsncmVxdWVzdENvbnRleHQnXSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoNDAxKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LmVycm9yKS50b0JlKCdVbmF1dGhvcml6ZWQnKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIGVtcHR5IGFsbG93ZWQgcHJpY2UgSURzIGVudmlyb25tZW50IHZhcmlhYmxlJywgYXN5bmMgKCkgPT4ge1xuICAgICAgZGVsZXRlIHByb2Nlc3MuZW52LkFMTE9XRURfUFJJQ0VfSURTO1xuXG4gICAgICBjb25zdCBtb2NrU2Vzc2lvbklkID0gJ2NzX3Rlc3Rfbm9fYWxsb3dsaXN0JztcbiAgICAgIGNvbnN0IG1vY2tTZXNzaW9uVXJsID0gJ2h0dHBzOi8vY2hlY2tvdXQuc3RyaXBlLmNvbS9ub19hbGxvd2xpc3QnO1xuXG4gICAgICBtb2NrQ3JlYXRlLm1vY2tSZXNvbHZlZFZhbHVlKHtcbiAgICAgICAgaWQ6IG1vY2tTZXNzaW9uSWQsXG4gICAgICAgIHVybDogbW9ja1Nlc3Npb25VcmwsXG4gICAgICB9IGFzIFN0cmlwZS5DaGVja291dC5TZXNzaW9uKTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoe1xuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgc2Vzc2lvblR5cGU6ICdzdWJzY3JpcHRpb24nLFxuICAgICAgICAgIHByaWNlSWQ6ICdhbnlfcHJpY2VfaWQnLFxuICAgICAgICAgIHN1Y2Nlc3NVcmw6ICdodHRwczovL2V4YW1wbGUuY29tL3N1Y2Nlc3MnLFxuICAgICAgICAgIGNhbmNlbFVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vY2FuY2VsJyxcbiAgICAgICAgfSksXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgLy8gU2hvdWxkIHN1Y2NlZWQgc2luY2Ugbm8gYWxsb3dsaXN0IGlzIGNvbmZpZ3VyZWRcbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuc2Vzc2lvbklkKS50b0JlKG1vY2tTZXNzaW9uSWQpO1xuICAgIH0pO1xuICB9KTtcbn0pO1xuIl19