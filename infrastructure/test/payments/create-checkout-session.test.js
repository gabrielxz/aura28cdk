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
        // Clear Lambda function cache
        (0, create_checkout_session_1.clearCache)();
        // Setup SSM mocks - handle both Stripe API key and allowed price IDs
        ssmMock
            .on(client_ssm_1.GetParameterCommand, {
            Name: '/aura28/test/stripe/api-key',
        })
            .resolves({
            Parameter: {
                Value: mockStripeApiKey,
            },
        });
        ssmMock
            .on(client_ssm_1.GetParameterCommand, {
            Name: '/aura28/test/stripe/allowed-price-ids',
        })
            .resolves({
            Parameter: {
                Value: 'price_test123,price_test456',
            },
        });
        // Setup environment variables
        process.env.STRIPE_API_KEY_PARAMETER_NAME = '/aura28/test/stripe/api-key';
        process.env.ALLOWED_PRICE_IDS_PARAMETER_NAME = '/aura28/test/stripe/allowed-price-ids';
        process.env.ALLOWED_PRICE_IDS = ''; // Empty to test SSM fetching
        process.env.PRICE_ID_CACHE_TTL_SECONDS = '300';
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
            // Reset SSM mock to return empty value for price IDs
            ssmMock.reset();
            ssmMock
                .on(client_ssm_1.GetParameterCommand, {
                Name: '/aura28/test/stripe/api-key',
            })
                .resolves({
                Parameter: {
                    Value: mockStripeApiKey,
                },
            });
            ssmMock
                .on(client_ssm_1.GetParameterCommand, {
                Name: '/aura28/test/stripe/allowed-price-ids',
            })
                .resolves({
                Parameter: {
                    Value: '',
                },
            });
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
    describe('SSM-based allowed price IDs', () => {
        it('should fetch allowed price IDs from SSM successfully', async () => {
            const mockSessionId = 'cs_test_ssm';
            const mockSessionUrl = 'https://checkout.stripe.com/ssm';
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
                }),
            });
            const result = await (0, create_checkout_session_1.handler)(event);
            expect(result.statusCode).toBe(200);
            // Verify SSM was called (it's called for both API key and price IDs)
            const ssmCalls = ssmMock.calls();
            expect(ssmCalls.length).toBeGreaterThanOrEqual(1);
        });
        it('should cache allowed price IDs across multiple invocations', async () => {
            const mockSessionId = 'cs_test_cache';
            const mockSessionUrl = 'https://checkout.stripe.com/cache';
            mockCreate.mockResolvedValue({
                id: mockSessionId,
                url: mockSessionUrl,
            });
            const event = createMockEvent();
            // First invocation
            await (0, create_checkout_session_1.handler)(event);
            const ssmCallsAfterFirst = ssmMock.calls().length;
            // Second invocation (should use cached value)
            await (0, create_checkout_session_1.handler)(event);
            const ssmCallsAfterSecond = ssmMock.calls().length;
            // SSM should not be called again for allowed price IDs (only for Stripe API key if not cached)
            // The difference should be minimal (0 or 1 call for Stripe API key)
            expect(ssmCallsAfterSecond - ssmCallsAfterFirst).toBeLessThanOrEqual(1);
        });
        it('should fall back to environment variable when SSM fails', async () => {
            // Reset mocks to simulate SSM failure for allowed price IDs
            ssmMock.reset();
            ssmMock
                .on(client_ssm_1.GetParameterCommand, {
                Name: '/aura28/test/stripe/api-key',
            })
                .resolves({
                Parameter: {
                    Value: mockStripeApiKey,
                },
            });
            // Simulate SSM failure for allowed price IDs
            ssmMock
                .on(client_ssm_1.GetParameterCommand, {
                Name: '/aura28/test/stripe/allowed-price-ids',
            })
                .rejects(new Error('Parameter not found'));
            // Set fallback environment variable - using test123 which is already in the mock setup
            process.env.ALLOWED_PRICE_IDS = 'price_test123,price_test456';
            const mockSessionId = 'cs_test_fallback';
            const mockSessionUrl = 'https://checkout.stripe.com/fallback';
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
                }),
            });
            const result = await (0, create_checkout_session_1.handler)(event);
            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body.sessionId).toBe(mockSessionId);
        });
        it('should handle empty SSM parameter value', async () => {
            // Reset mocks
            ssmMock.reset();
            ssmMock
                .on(client_ssm_1.GetParameterCommand, {
                Name: '/aura28/test/stripe/api-key',
            })
                .resolves({
                Parameter: {
                    Value: mockStripeApiKey,
                },
            });
            // Return empty value for allowed price IDs
            ssmMock
                .on(client_ssm_1.GetParameterCommand, {
                Name: '/aura28/test/stripe/allowed-price-ids',
            })
                .resolves({
                Parameter: {
                    Value: '',
                },
            });
            const mockSessionId = 'cs_test_empty';
            const mockSessionUrl = 'https://checkout.stripe.com/empty';
            mockCreate.mockResolvedValue({
                id: mockSessionId,
                url: mockSessionUrl,
            });
            const event = createMockEvent();
            // Should succeed when no price IDs are configured (empty array means no validation)
            const result = await (0, create_checkout_session_1.handler)(event);
            expect(result.statusCode).toBe(200);
        });
        it('should handle malformed price ID list in SSM', async () => {
            // Reset mocks
            ssmMock.reset();
            ssmMock
                .on(client_ssm_1.GetParameterCommand, {
                Name: '/aura28/test/stripe/api-key',
            })
                .resolves({
                Parameter: {
                    Value: mockStripeApiKey,
                },
            });
            // Return malformed value with extra commas and spaces
            ssmMock
                .on(client_ssm_1.GetParameterCommand, {
                Name: '/aura28/test/stripe/allowed-price-ids',
            })
                .resolves({
                Parameter: {
                    Value: 'price_test123,  ,price_test456,,,',
                },
            });
            const mockSessionId = 'cs_test_malformed';
            const mockSessionUrl = 'https://checkout.stripe.com/malformed';
            mockCreate.mockResolvedValue({
                id: mockSessionId,
                url: mockSessionUrl,
            });
            const event = createMockEvent({
                body: JSON.stringify({
                    sessionType: 'subscription',
                    priceId: 'price_test456',
                    successUrl: 'https://example.com/success',
                    cancelUrl: 'https://example.com/cancel',
                }),
            });
            const result = await (0, create_checkout_session_1.handler)(event);
            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body.sessionId).toBe(mockSessionId);
        });
        it('should reject disallowed price ID for one-time payment', async () => {
            const event = createMockEvent({
                body: JSON.stringify({
                    sessionType: 'one-time',
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
        it('should allow one-time payment without price ID when dynamic pricing is used', async () => {
            const mockSessionId = 'cs_test_dynamic';
            const mockSessionUrl = 'https://checkout.stripe.com/dynamic';
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
            expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
                line_items: [
                    expect.objectContaining({
                        price_data: expect.objectContaining({
                            currency: 'usd',
                            unit_amount: 2900,
                        }),
                    }),
                ],
            }));
        });
    });
    /* eslint-disable @typescript-eslint/no-explicit-any */
    describe('SSM caching mechanism', () => {
        it('should respect cache TTL from environment variable', async () => {
            // Set custom TTL
            process.env.PRICE_ID_CACHE_TTL_SECONDS = '1'; // 1 second for faster test
            const mockSessionId = 'cs_test_ttl';
            const mockSessionUrl = 'https://checkout.stripe.com/ttl';
            mockCreate.mockResolvedValue({
                id: mockSessionId,
                url: mockSessionUrl,
            });
            const event = createMockEvent();
            // First invocation - should call SSM
            await (0, create_checkout_session_1.handler)(event);
            const initialSsmCalls = ssmMock
                .calls()
                .filter(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (call) => call.args[0].input.Name === '/aura28/test/stripe/allowed-price-ids').length;
            // Clear cache to simulate new Lambda cold start
            (0, create_checkout_session_1.clearCache)();
            // Second invocation after cache clear - should call SSM again
            await (0, create_checkout_session_1.handler)(event);
            const afterCacheClearCalls = ssmMock
                .calls()
                .filter(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (call) => call.args[0].input.Name === '/aura28/test/stripe/allowed-price-ids').length;
            // Should have called SSM again after cache clear
            expect(afterCacheClearCalls).toBeGreaterThan(initialSsmCalls);
        }, 10000);
        it('should handle SSM parameter not existing gracefully', async () => {
            // Reset mocks
            ssmMock.reset();
            ssmMock
                .on(client_ssm_1.GetParameterCommand, {
                Name: '/aura28/test/stripe/api-key',
            })
                .resolves({
                Parameter: {
                    Value: mockStripeApiKey,
                },
            });
            // Simulate parameter doesn't exist (returns undefined)
            ssmMock
                .on(client_ssm_1.GetParameterCommand, {
                Name: '/aura28/test/stripe/allowed-price-ids',
            })
                .resolves({
                Parameter: undefined,
            });
            // Also clear environment variable
            delete process.env.ALLOWED_PRICE_IDS;
            const mockSessionId = 'cs_test_no_param';
            const mockSessionUrl = 'https://checkout.stripe.com/no_param';
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
            // Should succeed with no price validation when no config exists
            expect(result.statusCode).toBe(200);
        });
        it('should handle SSM returning null parameter gracefully', async () => {
            // Reset mocks
            ssmMock.reset();
            ssmMock
                .on(client_ssm_1.GetParameterCommand, {
                Name: '/aura28/test/stripe/api-key',
            })
                .resolves({
                Parameter: {
                    Value: mockStripeApiKey,
                },
            });
            // Simulate SSM returns null parameter
            ssmMock
                .on(client_ssm_1.GetParameterCommand, {
                Name: '/aura28/test/stripe/allowed-price-ids',
            })
                .resolves({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                Parameter: null,
            });
            const mockSessionId = 'cs_test_null_param';
            const mockSessionUrl = 'https://checkout.stripe.com/null_param';
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
            // Should succeed with default price data
            expect(result.statusCode).toBe(200);
        });
        it('should cache empty arrays when no price IDs configured', async () => {
            // Clear environment variables
            delete process.env.ALLOWED_PRICE_IDS;
            delete process.env.ALLOWED_PRICE_IDS_PARAMETER_NAME;
            const mockSessionId = 'cs_test_cache_empty';
            const mockSessionUrl = 'https://checkout.stripe.com/cache_empty';
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
            // First call
            const firstResult = await (0, create_checkout_session_1.handler)(event);
            const firstCallSsmCount = ssmMock.calls().length;
            // Second call - should not fetch SSM again due to caching
            const secondResult = await (0, create_checkout_session_1.handler)(event);
            const secondCallSsmCount = ssmMock.calls().length;
            // Should not have made additional SSM calls
            expect(secondCallSsmCount - firstCallSsmCount).toBeLessThanOrEqual(1);
            expect(firstResult.statusCode).toBe(200);
            expect(secondResult.statusCode).toBe(200);
        });
        it('should handle whitespace-only price IDs in SSM', async () => {
            // Reset mocks
            ssmMock.reset();
            ssmMock
                .on(client_ssm_1.GetParameterCommand, {
                Name: '/aura28/test/stripe/api-key',
            })
                .resolves({
                Parameter: {
                    Value: mockStripeApiKey,
                },
            });
            // Return whitespace-only value
            ssmMock
                .on(client_ssm_1.GetParameterCommand, {
                Name: '/aura28/test/stripe/allowed-price-ids',
            })
                .resolves({
                Parameter: {
                    Value: '   ,  ,   ',
                },
            });
            const mockSessionId = 'cs_test_whitespace';
            const mockSessionUrl = 'https://checkout.stripe.com/whitespace';
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
            // Should succeed as empty price ID list means no validation
            expect(result.statusCode).toBe(200);
        });
        it('should handle very long price ID lists efficiently', async () => {
            // Reset mocks
            ssmMock.reset();
            ssmMock
                .on(client_ssm_1.GetParameterCommand, {
                Name: '/aura28/test/stripe/api-key',
            })
                .resolves({
                Parameter: {
                    Value: mockStripeApiKey,
                },
            });
            // Create a long list of price IDs
            const longPriceIdList = Array.from({ length: 100 }, (_, i) => `price_test${i}`).join(',');
            ssmMock
                .on(client_ssm_1.GetParameterCommand, {
                Name: '/aura28/test/stripe/allowed-price-ids',
            })
                .resolves({
                Parameter: {
                    Value: longPriceIdList,
                },
            });
            const mockSessionId = 'cs_test_long_list';
            const mockSessionUrl = 'https://checkout.stripe.com/long_list';
            mockCreate.mockResolvedValue({
                id: mockSessionId,
                url: mockSessionUrl,
            });
            const event = createMockEvent({
                body: JSON.stringify({
                    sessionType: 'subscription',
                    priceId: 'price_test50',
                    successUrl: 'https://example.com/success',
                    cancelUrl: 'https://example.com/cancel',
                }),
            });
            const result = await (0, create_checkout_session_1.handler)(event);
            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body.sessionId).toBe(mockSessionId);
        });
        it('should handle SSM throttling errors gracefully', async () => {
            // Reset mocks
            ssmMock.reset();
            ssmMock
                .on(client_ssm_1.GetParameterCommand, {
                Name: '/aura28/test/stripe/api-key',
            })
                .resolves({
                Parameter: {
                    Value: mockStripeApiKey,
                },
            });
            // Simulate throttling error
            const throttlingError = new Error('Rate exceeded');
            throttlingError.name = 'ThrottlingException';
            ssmMock
                .on(client_ssm_1.GetParameterCommand, {
                Name: '/aura28/test/stripe/allowed-price-ids',
            })
                .rejects(throttlingError);
            // Set fallback
            process.env.ALLOWED_PRICE_IDS = 'price_test123';
            const mockSessionId = 'cs_test_throttle';
            const mockSessionUrl = 'https://checkout.stripe.com/throttle';
            mockCreate.mockResolvedValue({
                id: mockSessionId,
                url: mockSessionUrl,
            });
            const event = createMockEvent();
            const result = await (0, create_checkout_session_1.handler)(event);
            // Should fall back to environment variable
            expect(result.statusCode).toBe(200);
        });
        it('should validate price IDs are trimmed correctly', async () => {
            // Reset mocks
            ssmMock.reset();
            ssmMock
                .on(client_ssm_1.GetParameterCommand, {
                Name: '/aura28/test/stripe/api-key',
            })
                .resolves({
                Parameter: {
                    Value: mockStripeApiKey,
                },
            });
            // Price IDs with various whitespace
            ssmMock
                .on(client_ssm_1.GetParameterCommand, {
                Name: '/aura28/test/stripe/allowed-price-ids',
            })
                .resolves({
                Parameter: {
                    Value: ' price_test123 , price_test456 ',
                },
            });
            const mockSessionId = 'cs_test_trim';
            const mockSessionUrl = 'https://checkout.stripe.com/trim';
            mockCreate.mockResolvedValue({
                id: mockSessionId,
                url: mockSessionUrl,
            });
            const event = createMockEvent({
                body: JSON.stringify({
                    sessionType: 'subscription',
                    priceId: 'price_test123', // Without spaces
                    successUrl: 'https://example.com/success',
                    cancelUrl: 'https://example.com/cancel',
                }),
            });
            const result = await (0, create_checkout_session_1.handler)(event);
            expect(result.statusCode).toBe(200);
        });
        it('should handle sequential requests with cache properly', async () => {
            // Clear cache and reset mocks for clean test
            (0, create_checkout_session_1.clearCache)();
            ssmMock.reset();
            // Setup SSM mocks
            ssmMock
                .on(client_ssm_1.GetParameterCommand, {
                Name: '/aura28/test/stripe/api-key',
            })
                .resolves({
                Parameter: {
                    Value: mockStripeApiKey,
                },
            });
            ssmMock
                .on(client_ssm_1.GetParameterCommand, {
                Name: '/aura28/test/stripe/allowed-price-ids',
            })
                .resolves({
                Parameter: {
                    Value: 'price_test123,price_test456',
                },
            });
            const mockSessionId = 'cs_test_sequential';
            const mockSessionUrl = 'https://checkout.stripe.com/sequential';
            mockCreate.mockResolvedValue({
                id: mockSessionId,
                url: mockSessionUrl,
            });
            const event = createMockEvent();
            // First request - should fetch from SSM
            const result1 = await (0, create_checkout_session_1.handler)(event);
            expect(result1.statusCode).toBe(200);
            const ssmCallsAfterFirst = ssmMock
                .calls()
                .filter(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (call) => call.args[0].input.Name === '/aura28/test/stripe/allowed-price-ids').length;
            // Sequential requests - should use cache
            const result2 = await (0, create_checkout_session_1.handler)(event);
            const result3 = await (0, create_checkout_session_1.handler)(event);
            expect(result2.statusCode).toBe(200);
            expect(result3.statusCode).toBe(200);
            const ssmCallsAfterAll = ssmMock
                .calls()
                .filter(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (call) => call.args[0].input.Name === '/aura28/test/stripe/allowed-price-ids').length;
            // Should only have called SSM once for price IDs (cache is working)
            expect(ssmCallsAfterAll).toBe(ssmCallsAfterFirst);
            expect(ssmCallsAfterFirst).toBe(1);
        });
        it('should use default TTL when environment variable is not set', async () => {
            // Remove TTL environment variable
            delete process.env.PRICE_ID_CACHE_TTL_SECONDS;
            const mockSessionId = 'cs_test_default_ttl';
            const mockSessionUrl = 'https://checkout.stripe.com/default_ttl';
            mockCreate.mockResolvedValue({
                id: mockSessionId,
                url: mockSessionUrl,
            });
            const event = createMockEvent();
            const result = await (0, create_checkout_session_1.handler)(event);
            // Should succeed with default TTL (300 seconds)
            expect(result.statusCode).toBe(200);
        });
        it('should handle invalid TTL values gracefully', async () => {
            // Set invalid TTL
            process.env.PRICE_ID_CACHE_TTL_SECONDS = 'invalid';
            const mockSessionId = 'cs_test_invalid_ttl';
            const mockSessionUrl = 'https://checkout.stripe.com/invalid_ttl';
            mockCreate.mockResolvedValue({
                id: mockSessionId,
                url: mockSessionUrl,
            });
            const event = createMockEvent();
            const result = await (0, create_checkout_session_1.handler)(event);
            // Should succeed using fallback TTL
            expect(result.statusCode).toBe(200);
        });
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3JlYXRlLWNoZWNrb3V0LXNlc3Npb24udGVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImNyZWF0ZS1jaGVja291dC1zZXNzaW9uLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFDQSwyRkFBb0Y7QUFDcEYsNkRBQWlEO0FBQ2pELG9EQUFxRTtBQUdyRSw4QkFBOEI7QUFDOUIsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLEVBQUUsRUFBRSxDQUFDO0FBQzdCLE1BQU0sVUFBVSxHQUFHO0lBQ2pCLFFBQVEsRUFBRTtRQUNSLFFBQVEsRUFBRTtZQUNSLE1BQU0sRUFBRSxVQUFVO1NBQ25CO0tBQ0Y7Q0FDRixDQUFDO0FBRUYsY0FBYztBQUNkLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLEdBQUcsRUFBRTtJQUN2QixPQUFPLElBQUksQ0FBQyxFQUFFLEVBQUUsQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxVQUFVLENBQUMsQ0FBQztBQUN4RCxDQUFDLENBQUMsQ0FBQztBQUVILE1BQU0sT0FBTyxHQUFHLElBQUEsZ0NBQVUsRUFBQyxzQkFBUyxDQUFDLENBQUM7QUFFdEMsUUFBUSxDQUFDLGdDQUFnQyxFQUFFLEdBQUcsRUFBRTtJQUM5QyxNQUFNLGdCQUFnQixHQUFHLHNCQUFzQixDQUFDO0lBQ2hELE1BQU0sVUFBVSxHQUFHLGVBQWUsQ0FBQztJQUNuQyxNQUFNLFNBQVMsR0FBRyxrQkFBa0IsQ0FBQztJQUVyQyxVQUFVLENBQUMsR0FBRyxFQUFFO1FBQ2QsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO1FBQ3JCLE9BQU8sQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNoQixVQUFVLENBQUMsU0FBUyxFQUFFLENBQUM7UUFFdkIsOEJBQThCO1FBQzlCLElBQUEsb0NBQVUsR0FBRSxDQUFDO1FBRWIscUVBQXFFO1FBQ3JFLE9BQU87YUFDSixFQUFFLENBQUMsZ0NBQW1CLEVBQUU7WUFDdkIsSUFBSSxFQUFFLDZC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LEdBQUcsRUFBRSxjQUFjO2FBQ08sQ0FBQyxDQUFDO1lBRTlCLE1BQU0sS0FBSyxHQUFHLGVBQWUsRUFBRSxDQUFDO1lBRWhDLE1BQU0sTUFBTSxHQUEwQixNQUFNLElBQUEsaUNBQU8sRUFBQyxLQUFLLENBQUMsQ0FBQztZQUUzRCxvQ0FBb0M7WUFDcEMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDdEMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztJQUNILHNEQUFzRDtBQUN4RCxDQUFDLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEFQSUdhdGV3YXlQcm94eUV2ZW50LCBBUElHYXRld2F5UHJveHlSZXN1bHQgfSBmcm9tICdhd3MtbGFtYmRhJztcbmltcG9ydCB7IGhhbmRsZXIsIGNsZWFyQ2FjaGUgfSBmcm9tICcuLi8uLi9sYW1iZGEvcGF5bWVudHMvY3JlYXRlLWNoZWNrb3V0LXNlc3Npb24nO1xuaW1wb3J0IHsgbW9ja0NsaWVudCB9IGZyb20gJ2F3cy1zZGstY2xpZW50LW1vY2snO1xuaW1wb3J0IHsgU1NNQ2xpZW50LCBHZXRQYXJhbWV0ZXJDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXNzbSc7XG5pbXBvcnQgU3RyaXBlIGZyb20gJ3N0cmlwZSc7XG5cbi8vIENyZWF0ZSBtb2NrIFN0cmlwZSBpbnN0YW5jZVxuY29uc3QgbW9ja0NyZWF0ZSA9IGplc3QuZm4oKTtcbmNvbnN0IG1vY2tTdHJpcGUgPSB7XG4gIGNoZWNrb3V0OiB7XG4gICAgc2Vzc2lvbnM6IHtcbiAgICAgIGNyZWF0ZTogbW9ja0NyZWF0ZSxcbiAgICB9LFxuICB9LFxufTtcblxuLy8gTW9jayBTdHJpcGVcbmplc3QubW9jaygnc3RyaXBlJywgKCkgPT4ge1xuICByZXR1cm4gamVzdC5mbigpLm1vY2tJbXBsZW1lbnRhdGlvbigoKSA9PiBtb2NrU3RyaXBlKTtcbn0pO1xuXG5jb25zdCBzc21Nb2NrID0gbW9ja0NsaWVudChTU01DbGllbnQpO1xuXG5kZXNjcmliZSgnQ3JlYXRlIENoZWNrb3V0IFNlc3Npb24gTGFtYmRhJywgKCkgPT4ge1xuICBjb25zdCBtb2NrU3RyaXBlQXBpS2V5ID0gJ3NrX3Rlc3RfbW9ja19rZXlfMTIzJztcbiAgY29uc3QgbW9ja1VzZXJJZCA9ICd0ZXN0LXVzZXItMTIzJztcbiAgY29uc3QgbW9ja0VtYWlsID0gJ3Rlc3RAZXhhbXBsZS5jb20nO1xuXG4gIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgIGplc3QuY2xlYXJBbGxNb2NrcygpO1xuICAgIHNzbU1vY2sucmVzZXQoKTtcbiAgICBtb2NrQ3JlYXRlLm1vY2tSZXNldCgpO1xuXG4gICAgLy8gQ2xlYXIgTGFtYmRhIGZ1bmN0aW9uIGNhY2hlXG4gICAgY2xlYXJDYWNoZSgpO1xuXG4gICAgLy8gU2V0dXAgU1NNIG1vY2tzIC0gaGFuZGxlIGJvdGggU3RyaXBlIEFQSSBrZXkgYW5kIGFsbG93ZWQgcHJpY2UgSURzXG4gICAgc3NtTW9ja1xuICAgICAgLm9uKEdldFBhcmFtZXRlckNvbW1hbmQsIHtcbiAgICAgICAgTmFtZTogJy9hdXJhMjgvdGVzdC9zdHJpcGUvYXBpLWtleScsXG4gICAgICB9KVxuICAgICAgLnJlc29sdmVzKHtcbiAgICAgICAgUGFyYW1ldGVyOiB7XG4gICAgICAgICAgVmFsdWU6IG1vY2tTdHJpcGVBcGlLZXksXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgIHNzbU1vY2tcbiAgICAgIC5vbihHZXRQYXJhbWV0ZXJDb21tYW5kLCB7XG4gICAgICAgIE5hbWU6ICcvYXVyYTI4L3Rlc3Qvc3RyaXBlL2FsbG93ZWQtcHJpY2UtaWRzJyxcbiAgICAgIH0pXG4gICAgICAucmVzb2x2ZXMoe1xuICAgICAgICBQYXJhbWV0ZXI6IHtcbiAgICAgICAgICBWYWx1ZTogJ3ByaWNlX3Rlc3QxMjMscHJpY2VfdGVzdDQ1NicsXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgIC8vIFNldHVwIGVudmlyb25tZW50IHZhcmlhYmxlc1xuICAgIHByb2Nlc3MuZW52LlNUUklQRV9BUElfS0VZX1BBUkFNRVRFUl9OQU1FID0gJy9hdXJhMjgvdGVzdC9zdHJpcGUvYXBpLWtleSc7XG4gICAgcHJvY2Vzcy5lbnYuQUxMT1dFRF9QUklDRV9JRFNfUEFSQU1FVEVSX05BTUUgPSAnL2F1cmEyOC90ZXN0L3N0cmlwZS9hbGxvd2VkLXByaWNlLWlkcyc7XG4gICAgcHJvY2Vzcy5lbnYuQUxMT1dFRF9QUklDRV9JRFMgPSAnJzsgLy8gRW1wdHkgdG8gdGVzdCBTU00gZmV0Y2hpbmdcbiAgICBwcm9jZXNzLmVudi5QUklDRV9JRF9DQUNIRV9UVExfU0VDT05EUyA9ICczMDAnO1xuICB9KTtcblxuICBjb25zdCBjcmVhdGVNb2NrRXZlbnQgPSAob3ZlcnJpZGVzOiBQYXJ0aWFsPEFQSUdhdGV3YXlQcm94eUV2ZW50PiA9IHt9KTogQVBJR2F0ZXdheVByb3h5RXZlbnQgPT5cbiAgICAoe1xuICAgICAgaHR0cE1ldGhvZDogJ1BPU1QnLFxuICAgICAgcGF0aDogJy9hcGkvdXNlcnMvdGVzdC11c2VyLTEyMy9jaGVja291dC1zZXNzaW9uJyxcbiAgICAgIHBhdGhQYXJhbWV0ZXJzOiB7XG4gICAgICAgIHVzZXJJZDogbW9ja1VzZXJJZCxcbiAgICAgIH0sXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICB9LFxuICAgICAgcmVxdWVzdENvbnRleHQ6IHtcbiAgICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICAgIGNsYWltczoge1xuICAgICAgICAgICAgc3ViOiBtb2NrVXNlcklkLFxuICAgICAgICAgICAgZW1haWw6IG1vY2tFbWFpbCxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSBhcyB1bmtub3duIGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50WydyZXF1ZXN0Q29udGV4dCddLFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICBzZXNzaW9uVHlwZTogJ3N1YnNjcmlwdGlvbicsXG4gICAgICAgIHByaWNlSWQ6ICdwcmljZV90ZXN0MTIzJyxcbiAgICAgICAgc3VjY2Vzc1VybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vc3VjY2VzcycsXG4gICAgICAgIGNhbmNlbFVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vY2FuY2VsJyxcbiAgICAgIH0pLFxuICAgICAgLi4ub3ZlcnJpZGVzLFxuICAgIH0pIGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50O1xuXG4gIGRlc2NyaWJlKCdTdWNjZXNzZnVsIHNlc3Npb24gY3JlYXRpb24nLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBjcmVhdGUgYSBzdWJzY3JpcHRpb24gY2hlY2tvdXQgc2Vzc2lvbiBzdWNjZXNzZnVsbHknLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBtb2NrU2Vzc2lvbklkID0gJ2NzX3Rlc3Rfc2Vzc2lvbjEyMyc7XG4gICAgICBjb25zdCBtb2NrU2Vzc2lvblVybCA9ICdodHRwczovL2NoZWNrb3V0LnN0cmlwZS5jb20vc2Vzc2lvbjEyMyc7XG5cbiAgICAgIC8vIE1vY2sgU3RyaXBlIHNlc3Npb24gY3JlYXRpb25cbiAgICAgIG1vY2tDcmVhdGUubW9ja1Jlc29sdmVkVmFsdWUoe1xuICAgICAgICBpZDogbW9ja1Nlc3Npb25JZCxcbiAgICAgICAgdXJsOiBtb2NrU2Vzc2lvblVybCxcbiAgICAgIH0gYXMgU3RyaXBlLkNoZWNrb3V0LlNlc3Npb24pO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCgpO1xuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keSkudG9FcXVhbCh7XG4gICAgICAgIHNlc3Npb25JZDogbW9ja1Nlc3Npb25JZCxcbiAgICAgICAgdXJsOiBtb2NrU2Vzc2lvblVybCxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBWZXJpZnkgU3RyaXBlIHdhcyBjYWxsZWQgd2l0aCBjb3JyZWN0IHBhcmFtZXRlcnNcbiAgICAgIGV4cGVjdChtb2NrQ3JlYXRlKS50b0hhdmVCZWVuQ2FsbGVkV2l0aChcbiAgICAgICAgZXhwZWN0Lm9iamVjdENvbnRhaW5pbmcoe1xuICAgICAgICAgIG1vZGU6ICdzdWJzY3JpcHRpb24nLFxuICAgICAgICAgIHBheW1lbnRfbWV0aG9kX3R5cGVzOiBbJ2NhcmQnXSxcbiAgICAgICAgICBsaW5lX2l0ZW1zOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIHByaWNlOiAncHJpY2VfdGVzdDEyMycsXG4gICAgICAgICAgICAgIHF1YW50aXR5OiAxLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICBdLFxuICAgICAgICAgIHN1Y2Nlc3NfdXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9zdWNjZXNzJyxcbiAgICAgICAgICBjYW5jZWxfdXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9jYW5jZWwnLFxuICAgICAgICAgIGN1c3RvbWVyX2VtYWlsOiBtb2NrRW1haWwsXG4gICAgICAgICAgY2xpZW50X3JlZmVyZW5jZV9pZDogbW9ja1VzZXJJZCxcbiAgICAgICAgICBtZXRhZGF0YToge1xuICAgICAgICAgICAgdXNlcklkOiBtb2NrVXNlcklkLFxuICAgICAgICAgICAgc2Vzc2lvblR5cGU6ICdzdWJzY3JpcHRpb24nLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pLFxuICAgICAgKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgY3JlYXRlIGEgb25lLXRpbWUgcGF5bWVudCBzZXNzaW9uIHN1Y2Nlc3NmdWxseScsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IG1vY2tTZXNzaW9uSWQgPSAnY3NfdGVzdF9zZXNzaW9uNDU2JztcbiAgICAgIGNvbnN0IG1vY2tTZXNzaW9uVXJsID0gJ2h0dHBzOi8vY2hlY2tvdXQuc3RyaXBlLmNvbS9zZXNzaW9uNDU2JztcblxuICAgICAgLy8gTW9jayBTdHJpcGUgc2Vzc2lvbiBjcmVhdGlvblxuICAgICAgbW9ja0NyZWF0ZS5tb2NrUmVzb2x2ZWRWYWx1ZSh7XG4gICAgICAgIGlkOiBtb2NrU2Vzc2lvbklkLFxuICAgICAgICB1cmw6IG1vY2tTZXNzaW9uVXJsLFxuICAgICAgfSBhcyBTdHJpcGUuQ2hlY2tvdXQuU2Vzc2lvbik7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KHtcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIHNlc3Npb25UeXBlOiAnb25lLXRpbWUnLFxuICAgICAgICAgIHN1Y2Nlc3NVcmw6ICdodHRwczovL2V4YW1wbGUuY29tL3N1Y2Nlc3MnLFxuICAgICAgICAgIGNhbmNlbFVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vY2FuY2VsJyxcbiAgICAgICAgfSksXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keSkudG9FcXVhbCh7XG4gICAgICAgIHNlc3Npb25JZDogbW9ja1Nlc3Npb25JZCxcbiAgICAgICAgdXJsOiBtb2NrU2Vzc2lvblVybCxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBWZXJpZnkgZGVmYXVsdCBwcmljZSBkYXRhIHdhcyB1c2VkIGZvciBvbmUtdGltZSBwYXltZW50XG4gICAgICBleHBlY3QobW9ja0NyZWF0ZSkudG9IYXZlQmVlbkNhbGxlZFdpdGgoXG4gICAgICAgIGV4cGVjdC5vYmplY3RDb250YWluaW5nKHtcbiAgICAgICAgICBtb2RlOiAncGF5bWVudCcsXG4gICAgICAgICAgbGluZV9pdGVtczogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBwcmljZV9kYXRhOiB7XG4gICAgICAgICAgICAgICAgY3VycmVuY3k6ICd1c2QnLFxuICAgICAgICAgICAgICAgIHByb2R1Y3RfZGF0YToge1xuICAgICAgICAgICAgICAgICAgbmFtZTogJ0F1cmEyOCBSZWFkaW5nJyxcbiAgICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnT25lLXRpbWUgYXN0cm9sb2dpY2FsIHJlYWRpbmcnLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgdW5pdF9hbW91bnQ6IDI5MDAsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIHF1YW50aXR5OiAxLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICBdLFxuICAgICAgICB9KSxcbiAgICAgICk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdBdXRob3JpemF0aW9uIGZhaWx1cmVzJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgcmV0dXJuIDQwMSB3aGVuIGF1dGhvcml6YXRpb24gaXMgbWlzc2luZycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KHtcbiAgICAgICAgcmVxdWVzdENvbnRleHQ6IHt9IGFzIHVua25vd24gYXMgQVBJR2F0ZXdheVByb3h5RXZlbnRbJ3JlcXVlc3RDb250ZXh0J10sXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDQwMSk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5lcnJvcikudG9CZSgnVW5hdXRob3JpemVkJyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHJldHVybiA0MDMgd2hlbiB1c2VyIHRyaWVzIHRvIGNyZWF0ZSBzZXNzaW9uIGZvciBhbm90aGVyIHVzZXInLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCh7XG4gICAgICAgIHBhdGhQYXJhbWV0ZXJzOiB7XG4gICAgICAgICAgdXNlcklkOiAnZGlmZmVyZW50LXVzZXItNDU2JyxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoNDAzKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LmVycm9yKS50b0JlKCdGb3JiaWRkZW4nKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0ludmFsaWQgcmVxdWVzdCBoYW5kbGluZycsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIHJldHVybiA0MDAgZm9yIG1pc3NpbmcgdXNlcklkIHBhcmFtZXRlcicsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KHtcbiAgICAgICAgcGF0aFBhcmFtZXRlcnM6IHt9LFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSg0MDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmUoJ01pc3NpbmcgdXNlcklkIHBhcmFtZXRlcicpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gNDAwIGZvciBtaXNzaW5nIHJlcXVlc3QgYm9keScsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KHtcbiAgICAgICAgYm9keTogbnVsbCxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoNDAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LmVycm9yKS50b0JlKCdNaXNzaW5nIHJlcXVlc3QgYm9keScpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gNDAwIGZvciBpbnZhbGlkIEpTT04gaW4gcmVxdWVzdCBib2R5JywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoe1xuICAgICAgICBib2R5OiAnaW52YWxpZCBqc29uJyxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoNDAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LmVycm9yKS50b0JlKCdJbnZhbGlkIEpTT04gaW4gcmVxdWVzdCBib2R5Jyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHJldHVybiA0MDAgZm9yIGludmFsaWQgc2Vzc2lvblR5cGUnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCh7XG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBzZXNzaW9uVHlwZTogJ2ludmFsaWQnLFxuICAgICAgICAgIHN1Y2Nlc3NVcmw6ICdodHRwczovL2V4YW1wbGUuY29tL3N1Y2Nlc3MnLFxuICAgICAgICAgIGNhbmNlbFVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vY2FuY2VsJyxcbiAgICAgICAgfSksXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDQwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5lcnJvcikudG9CZShcbiAgICAgICAgJ0ludmFsaWQgb3IgbWlzc2luZyBzZXNzaW9uVHlwZS4gTXVzdCBiZSBcInN1YnNjcmlwdGlvblwiIG9yIFwib25lLXRpbWVcIicsXG4gICAgICApO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gNDAwIGZvciBtaXNzaW5nIFVSTHMnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCh7XG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBzZXNzaW9uVHlwZTogJ3N1YnNjcmlwdGlvbicsXG4gICAgICAgICAgcHJpY2VJZDogJ3ByaWNlX3Rlc3QxMjMnLFxuICAgICAgICB9KSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoNDAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LmVycm9yKS50b0JlKCdNaXNzaW5nIHN1Y2Nlc3NVcmwgb3IgY2FuY2VsVXJsJyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHJldHVybiA0MDAgZm9yIGludmFsaWQgVVJMcycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KHtcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIHNlc3Npb25UeXBlOiAnc3Vic2NyaXB0aW9uJyxcbiAgICAgICAgICBwcmljZUlkOiAncHJpY2VfdGVzdDEyMycsXG4gICAgICAgICAgc3VjY2Vzc1VybDogJ25vdC1hLXVybCcsXG4gICAgICAgICAgY2FuY2VsVXJsOiAnL3JlbGF0aXZlL3BhdGgnLFxuICAgICAgICB9KSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoNDAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LmVycm9yKS50b0JlKCdJbnZhbGlkIHN1Y2Nlc3NVcmwgb3IgY2FuY2VsVXJsLiBNdXN0IGJlIGFic29sdXRlIFVSTHMnKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgcmV0dXJuIDQwMCBmb3IgbWlzc2luZyBwcmljZUlkIGluIHN1YnNjcmlwdGlvbicsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KHtcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIHNlc3Npb25UeXBlOiAnc3Vic2NyaXB0aW9uJyxcbiAgICAgICAgICBzdWNjZXNzVXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9zdWNjZXNzJyxcbiAgICAgICAgICBjYW5jZWxVcmw6ICdodHRwczovL2V4YW1wbGUuY29tL2NhbmNlbCcsXG4gICAgICAgIH0pLFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSg0MDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmUoJ3ByaWNlSWQgaXMgcmVxdWlyZWQgZm9yIHN1YnNjcmlwdGlvbiBzZXNzaW9ucycpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gNDAwIGZvciBkaXNhbGxvd2VkIHByaWNlIElEJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoe1xuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgc2Vzc2lvblR5cGU6ICdzdWJzY3JpcHRpb24nLFxuICAgICAgICAgIHByaWNlSWQ6ICdwcmljZV9ub3RfYWxsb3dlZCcsXG4gICAgICAgICAgc3VjY2Vzc1VybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vc3VjY2VzcycsXG4gICAgICAgICAgY2FuY2VsVXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9jYW5jZWwnLFxuICAgICAgICB9KSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoNDAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LmVycm9yKS50b0JlKCdJbnZhbGlkIHByaWNlIElEJyk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdTdHJpcGUgQVBJIGVycm9yIGhhbmRsaW5nJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgaGFuZGxlIFN0cmlwZSBBUEkgZXJyb3JzIGdyYWNlZnVsbHknLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBzdHJpcGVFcnJvciA9IHtcbiAgICAgICAgbWVzc2FnZTogJ0ludmFsaWQgQVBJIGtleScsXG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMSxcbiAgICAgICAgdHlwZTogJ1N0cmlwZUF1dGhlbnRpY2F0aW9uRXJyb3InLFxuICAgICAgfTtcbiAgICAgIG1vY2tDcmVhdGUubW9ja1JlamVjdGVkVmFsdWUoc3RyaXBlRXJyb3IpO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCgpO1xuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDQwMSk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5lcnJvcikudG9CZSgnSW52YWxpZCBBUEkga2V5Jyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIG5vdCBleHBvc2Ugc2Vuc2l0aXZlIFN0cmlwZSBlcnJvcnMnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBzdHJpcGVFcnJvciA9IHtcbiAgICAgICAgbWVzc2FnZTogJ0ludGVybmFsIFN0cmlwZSBlcnJvciB3aXRoIHNlbnNpdGl2ZSBkYXRhJyxcbiAgICAgICAgc3RhdHVzQ29kZTogNTAwLFxuICAgICAgICB0eXBlOiAnU3RyaXBlQVBJRXJyb3InLFxuICAgICAgfTtcbiAgICAgIG1vY2tDcmVhdGUubW9ja1JlamVjdGVkVmFsdWUoc3RyaXBlRXJyb3IpO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCgpO1xuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDUwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5lcnJvcikudG9CZSgnUGF5bWVudCBwcm9jZXNzaW5nIGVycm9yJyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBnZW5lcmljIGVycm9ycyB3aXRob3V0IFN0cmlwZSBwcm9wZXJ0aWVzJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZ2VuZXJpY0Vycm9yID0gbmV3IEVycm9yKCdVbmtub3duIGVycm9yJyk7XG4gICAgICBtb2NrQ3JlYXRlLm1vY2tSZWplY3RlZFZhbHVlKGdlbmVyaWNFcnJvcik7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KCk7XG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoNTAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LmVycm9yKS50b0JlKCdJbnRlcm5hbCBzZXJ2ZXIgZXJyb3InKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ1NTTSBwYXJhbWV0ZXIgZXJyb3JzJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgaGFuZGxlIG1pc3NpbmcgU1NNIHBhcmFtZXRlcicsIGFzeW5jICgpID0+IHtcbiAgICAgIHNzbU1vY2sub24oR2V0UGFyYW1ldGVyQ29tbWFuZCkucmVqZWN0cyhuZXcgRXJyb3IoJ1BhcmFtZXRlciBub3QgZm91bmQnKSk7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KCk7XG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoNTAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LmVycm9yKS50b0JlKCdJbnRlcm5hbCBzZXJ2ZXIgZXJyb3InKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIGVtcHR5IFNTTSBwYXJhbWV0ZXIgdmFsdWUnLCBhc3luYyAoKSA9PiB7XG4gICAgICBzc21Nb2NrLm9uKEdldFBhcmFtZXRlckNvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgUGFyYW1ldGVyOiB7XG4gICAgICAgICAgVmFsdWU6ICcnLFxuICAgICAgICB9LFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KCk7XG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoNTAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LmVycm9yKS50b0JlKCdJbnRlcm5hbCBzZXJ2ZXIgZXJyb3InKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0FkZGl0aW9uYWwgZWRnZSBjYXNlcycsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBvbmUtdGltZSBwYXltZW50IHdpdGggc3BlY2lmaWMgcHJpY2VJZCcsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IG1vY2tTZXNzaW9uSWQgPSAnY3NfdGVzdF9zZXNzaW9uNzg5JztcbiAgICAgIGNvbnN0IG1vY2tTZXNzaW9uVXJsID0gJ2h0dHBzOi8vY2hlY2tvdXQuc3RyaXBlLmNvbS9zZXNzaW9uNzg5JztcblxuICAgICAgbW9ja0NyZWF0ZS5tb2NrUmVzb2x2ZWRWYWx1ZSh7XG4gICAgICAgIGlkOiBtb2NrU2Vzc2lvbklkLFxuICAgICAgICB1cmw6IG1vY2tTZXNzaW9uVXJsLFxuICAgICAgfSBhcyBTdHJpcGUuQ2hlY2tvdXQuU2Vzc2lvbik7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KHtcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIHNlc3Npb25UeXBlOiAnb25lLXRpbWUnLFxuICAgICAgICAgIHByaWNlSWQ6ICdwcmljZV90ZXN0MTIzJyxcbiAgICAgICAgICBzdWNjZXNzVXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9zdWNjZXNzJyxcbiAgICAgICAgICBjYW5jZWxVcmw6ICdodHRwczovL2V4YW1wbGUuY29tL2NhbmNlbCcsXG4gICAgICAgIH0pLFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkpLnRvRXF1YWwoe1xuICAgICAgICBzZXNzaW9uSWQ6IG1vY2tTZXNzaW9uSWQsXG4gICAgICAgIHVybDogbW9ja1Nlc3Npb25VcmwsXG4gICAgICB9KTtcblxuICAgICAgZXhwZWN0KG1vY2tDcmVhdGUpLnRvSGF2ZUJlZW5DYWxsZWRXaXRoKFxuICAgICAgICBleHBlY3Qub2JqZWN0Q29udGFpbmluZyh7XG4gICAgICAgICAgbW9kZTogJ3BheW1lbnQnLFxuICAgICAgICAgIGxpbmVfaXRlbXM6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgcHJpY2U6ICdwcmljZV90ZXN0MTIzJyxcbiAgICAgICAgICAgICAgcXVhbnRpdHk6IDEsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIF0sXG4gICAgICAgIH0pLFxuICAgICAgKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaW5jbHVkZSBjdXN0b20gbWV0YWRhdGEgaW4gc2Vzc2lvbiBjcmVhdGlvbicsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IG1vY2tTZXNzaW9uSWQgPSAnY3NfdGVzdF9tZXRhZGF0YSc7XG4gICAgICBjb25zdCBtb2NrU2Vzc2lvblVybCA9ICdodHRwczovL2NoZWNrb3V0LnN0cmlwZS5jb20vbWV0YWRhdGEnO1xuXG4gICAgICBtb2NrQ3JlYXRlLm1vY2tSZXNvbHZlZFZhbHVlKHtcbiAgICAgICAgaWQ6IG1vY2tTZXNzaW9uSWQsXG4gICAgICAgIHVybDogbW9ja1Nlc3Npb25VcmwsXG4gICAgICB9IGFzIFN0cmlwZS5DaGVja291dC5TZXNzaW9uKTtcblxuICAgICAgY29uc3QgY3VzdG9tTWV0YWRhdGEgPSB7XG4gICAgICAgIGNhbXBhaWduOiAnc3VtbWVyMjAyNCcsXG4gICAgICAgIHJlZmVycmVyOiAnbmV3c2xldHRlcicsXG4gICAgICB9O1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCh7XG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBzZXNzaW9uVHlwZTogJ3N1YnNjcmlwdGlvbicsXG4gICAgICAgICAgcHJpY2VJZDogJ3ByaWNlX3Rlc3QxMjMnLFxuICAgICAgICAgIHN1Y2Nlc3NVcmw6ICdodHRwczovL2V4YW1wbGUuY29tL3N1Y2Nlc3MnLFxuICAgICAgICAgIGNhbmNlbFVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vY2FuY2VsJyxcbiAgICAgICAgICBtZXRhZGF0YTogY3VzdG9tTWV0YWRhdGEsXG4gICAgICAgIH0pLFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgZXhwZWN0KG1vY2tDcmVhdGUpLnRvSGF2ZUJlZW5DYWxsZWRXaXRoKFxuICAgICAgICBleHBlY3Qub2JqZWN0Q29udGFpbmluZyh7XG4gICAgICAgICAgbWV0YWRhdGE6IGV4cGVjdC5vYmplY3RDb250YWluaW5nKHtcbiAgICAgICAgICAgIHVzZXJJZDogbW9ja1VzZXJJZCxcbiAgICAgICAgICAgIHNlc3Npb25UeXBlOiAnc3Vic2NyaXB0aW9uJyxcbiAgICAgICAgICAgIC4uLmN1c3RvbU1ldGFkYXRhLFxuICAgICAgICAgIH0pLFxuICAgICAgICB9KSxcbiAgICAgICk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHVzZSBjdXN0b21lciBlbWFpbCBmcm9tIHJlcXVlc3Qgd2hlbiBwcm92aWRlZCcsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IG1vY2tTZXNzaW9uSWQgPSAnY3NfdGVzdF9lbWFpbCc7XG4gICAgICBjb25zdCBtb2NrU2Vzc2lvblVybCA9ICdodHRwczovL2NoZWNrb3V0LnN0cmlwZS5jb20vZW1haWwnO1xuICAgICAgY29uc3QgY3VzdG9tRW1haWwgPSAnY3VzdG9tQGV4YW1wbGUuY29tJztcblxuICAgICAgbW9ja0NyZWF0ZS5tb2NrUmVzb2x2ZWRWYWx1ZSh7XG4gICAgICAgIGlkOiBtb2NrU2Vzc2lvbklkLFxuICAgICAgICB1cmw6IG1vY2tTZXNzaW9uVXJsLFxuICAgICAgfSBhcyBTdHJpcGUuQ2hlY2tvdXQuU2Vzc2lvbik7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KHtcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIHNlc3Npb25UeXBlOiAnc3Vic2NyaXB0aW9uJyxcbiAgICAgICAgICBwcmljZUlkOiAncHJpY2VfdGVzdDEyMycsXG4gICAgICAgICAgc3VjY2Vzc1VybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vc3VjY2VzcycsXG4gICAgICAgICAgY2FuY2VsVXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9jYW5jZWwnLFxuICAgICAgICAgIGN1c3RvbWVyRW1haWw6IGN1c3RvbUVtYWlsLFxuICAgICAgICB9KSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIGV4cGVjdChtb2NrQ3JlYXRlKS50b0hhdmVCZWVuQ2FsbGVkV2l0aChcbiAgICAgICAgZXhwZWN0Lm9iamVjdENvbnRhaW5pbmcoe1xuICAgICAgICAgIGN1c3RvbWVyX2VtYWlsOiBjdXN0b21FbWFpbCxcbiAgICAgICAgfSksXG4gICAgICApO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgbWlzc2luZyBzZXNzaW9uVHlwZSBncmFjZWZ1bGx5JywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoe1xuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgcHJpY2VJZDogJ3ByaWNlX3Rlc3QxMjMnLFxuICAgICAgICAgIHN1Y2Nlc3NVcmw6ICdodHRwczovL2V4YW1wbGUuY29tL3N1Y2Nlc3MnLFxuICAgICAgICAgIGNhbmNlbFVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vY2FuY2VsJyxcbiAgICAgICAgfSksXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDQwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5lcnJvcikudG9Db250YWluKCdzZXNzaW9uVHlwZScpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgcGF0aFBhcmFtZXRlcnMgYmVpbmcgbnVsbCcsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KHtcbiAgICAgICAgcGF0aFBhcmFtZXRlcnM6IG51bGwsXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDQwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5lcnJvcikudG9CZSgnTWlzc2luZyB1c2VySWQgcGFyYW1ldGVyJyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBhdXRob3JpemVyIGNvbnRleHQgYmVpbmcgbnVsbCcsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KHtcbiAgICAgICAgcmVxdWVzdENvbnRleHQ6IHtcbiAgICAgICAgICBhdXRob3JpemVyOiBudWxsLFxuICAgICAgICB9IGFzIHVua25vd24gYXMgQVBJR2F0ZXdheVByb3h5RXZlbnRbJ3JlcXVlc3RDb250ZXh0J10sXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDQwMSk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5lcnJvcikudG9CZSgnVW5hdXRob3JpemVkJyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBlbXB0eSBhbGxvd2VkIHByaWNlIElEcyBlbnZpcm9ubWVudCB2YXJpYWJsZScsIGFzeW5jICgpID0+IHtcbiAgICAgIC8vIFJlc2V0IFNTTSBtb2NrIHRvIHJldHVybiBlbXB0eSB2YWx1ZSBmb3IgcHJpY2UgSURzXG4gICAgICBzc21Nb2NrLnJlc2V0KCk7XG4gICAgICBzc21Nb2NrXG4gICAgICAgIC5vbihHZXRQYXJhbWV0ZXJDb21tYW5kLCB7XG4gICAgICAgICAgTmFtZTogJy9hdXJhMjgvdGVzdC9zdHJpcGUvYXBpLWtleScsXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgUGFyYW1ldGVyOiB7XG4gICAgICAgICAgICBWYWx1ZTogbW9ja1N0cmlwZUFwaUtleSxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgc3NtTW9ja1xuICAgICAgICAub24oR2V0UGFyYW1ldGVyQ29tbWFuZCwge1xuICAgICAgICAgIE5hbWU6ICcvYXVyYTI4L3Rlc3Qvc3RyaXBlL2FsbG93ZWQtcHJpY2UtaWRzJyxcbiAgICAgICAgfSlcbiAgICAgICAgLnJlc29sdmVzKHtcbiAgICAgICAgICBQYXJhbWV0ZXI6IHtcbiAgICAgICAgICAgIFZhbHVlOiAnJyxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgZGVsZXRlIHByb2Nlc3MuZW52LkFMTE9XRURfUFJJQ0VfSURTO1xuXG4gICAgICBjb25zdCBtb2NrU2Vzc2lvbklkID0gJ2NzX3Rlc3Rfbm9fYWxsb3dsaXN0JztcbiAgICAgIGNvbnN0IG1vY2tTZXNzaW9uVXJsID0gJ2h0dHBzOi8vY2hlY2tvdXQuc3RyaXBlLmNvbS9ub19hbGxvd2xpc3QnO1xuXG4gICAgICBtb2NrQ3JlYXRlLm1vY2tSZXNvbHZlZFZhbHVlKHtcbiAgICAgICAgaWQ6IG1vY2tTZXNzaW9uSWQsXG4gICAgICAgIHVybDogbW9ja1Nlc3Npb25VcmwsXG4gICAgICB9IGFzIFN0cmlwZS5DaGVja291dC5TZXNzaW9uKTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoe1xuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgc2Vzc2lvblR5cGU6ICdzdWJzY3JpcHRpb24nLFxuICAgICAgICAgIHByaWNlSWQ6ICdhbnlfcHJpY2VfaWQnLFxuICAgICAgICAgIHN1Y2Nlc3NVcmw6ICdodHRwczovL2V4YW1wbGUuY29tL3N1Y2Nlc3MnLFxuICAgICAgICAgIGNhbmNlbFVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vY2FuY2VsJyxcbiAgICAgICAgfSksXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgLy8gU2hvdWxkIHN1Y2NlZWQgc2luY2Ugbm8gYWxsb3dsaXN0IGlzIGNvbmZpZ3VyZWRcbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuc2Vzc2lvbklkKS50b0JlKG1vY2tTZXNzaW9uSWQpO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnU1NNLWJhc2VkIGFsbG93ZWQgcHJpY2UgSURzJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgZmV0Y2ggYWxsb3dlZCBwcmljZSBJRHMgZnJvbSBTU00gc3VjY2Vzc2Z1bGx5JywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgbW9ja1Nlc3Npb25JZCA9ICdjc190ZXN0X3NzbSc7XG4gICAgICBjb25zdCBtb2NrU2Vzc2lvblVybCA9ICdodHRwczovL2NoZWNrb3V0LnN0cmlwZS5jb20vc3NtJztcblxuICAgICAgbW9ja0NyZWF0ZS5tb2NrUmVzb2x2ZWRWYWx1ZSh7XG4gICAgICAgIGlkOiBtb2NrU2Vzc2lvbklkLFxuICAgICAgICB1cmw6IG1vY2tTZXNzaW9uVXJsLFxuICAgICAgfSBhcyBTdHJpcGUuQ2hlY2tvdXQuU2Vzc2lvbik7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KHtcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIHNlc3Npb25UeXBlOiAnc3Vic2NyaXB0aW9uJyxcbiAgICAgICAgICBwcmljZUlkOiAncHJpY2VfdGVzdDEyMycsXG4gICAgICAgICAgc3VjY2Vzc1VybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vc3VjY2VzcycsXG4gICAgICAgICAgY2FuY2VsVXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9jYW5jZWwnLFxuICAgICAgICB9KSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIC8vIFZlcmlmeSBTU00gd2FzIGNhbGxlZCAoaXQncyBjYWxsZWQgZm9yIGJvdGggQVBJIGtleSBhbmQgcHJpY2UgSURzKVxuICAgICAgY29uc3Qgc3NtQ2FsbHMgPSBzc21Nb2NrLmNhbGxzKCk7XG4gICAgICBleHBlY3Qoc3NtQ2FsbHMubGVuZ3RoKS50b0JlR3JlYXRlclRoYW5PckVxdWFsKDEpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBjYWNoZSBhbGxvd2VkIHByaWNlIElEcyBhY3Jvc3MgbXVsdGlwbGUgaW52b2NhdGlvbnMnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBtb2NrU2Vzc2lvbklkID0gJ2NzX3Rlc3RfY2FjaGUnO1xuICAgICAgY29uc3QgbW9ja1Nlc3Npb25VcmwgPSAnaHR0cHM6Ly9jaGVja291dC5zdHJpcGUuY29tL2NhY2hlJztcblxuICAgICAgbW9ja0NyZWF0ZS5tb2NrUmVzb2x2ZWRWYWx1ZSh7XG4gICAgICAgIGlkOiBtb2NrU2Vzc2lvbklkLFxuICAgICAgICB1cmw6IG1vY2tTZXNzaW9uVXJsLFxuICAgICAgfSBhcyBTdHJpcGUuQ2hlY2tvdXQuU2Vzc2lvbik7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KCk7XG5cbiAgICAgIC8vIEZpcnN0IGludm9jYXRpb25cbiAgICAgIGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuICAgICAgY29uc3Qgc3NtQ2FsbHNBZnRlckZpcnN0ID0gc3NtTW9jay5jYWxscygpLmxlbmd0aDtcblxuICAgICAgLy8gU2Vjb25kIGludm9jYXRpb24gKHNob3VsZCB1c2UgY2FjaGVkIHZhbHVlKVxuICAgICAgYXdhaXQgaGFuZGxlcihldmVudCk7XG4gICAgICBjb25zdCBzc21DYWxsc0FmdGVyU2Vjb25kID0gc3NtTW9jay5jYWxscygpLmxlbmd0aDtcblxuICAgICAgLy8gU1NNIHNob3VsZCBub3QgYmUgY2FsbGVkIGFnYWluIGZvciBhbGxvd2VkIHByaWNlIElEcyAob25seSBmb3IgU3RyaXBlIEFQSSBrZXkgaWYgbm90IGNhY2hlZClcbiAgICAgIC8vIFRoZSBkaWZmZXJlbmNlIHNob3VsZCBiZSBtaW5pbWFsICgwIG9yIDEgY2FsbCBmb3IgU3RyaXBlIEFQSSBrZXkpXG4gICAgICBleHBlY3Qoc3NtQ2FsbHNBZnRlclNlY29uZCAtIHNzbUNhbGxzQWZ0ZXJGaXJzdCkudG9CZUxlc3NUaGFuT3JFcXVhbCgxKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgZmFsbCBiYWNrIHRvIGVudmlyb25tZW50IHZhcmlhYmxlIHdoZW4gU1NNIGZhaWxzJywgYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gUmVzZXQgbW9ja3MgdG8gc2ltdWxhdGUgU1NNIGZhaWx1cmUgZm9yIGFsbG93ZWQgcHJpY2UgSURzXG4gICAgICBzc21Nb2NrLnJlc2V0KCk7XG4gICAgICBzc21Nb2NrXG4gICAgICAgIC5vbihHZXRQYXJhbWV0ZXJDb21tYW5kLCB7XG4gICAgICAgICAgTmFtZTogJy9hdXJhMjgvdGVzdC9zdHJpcGUvYXBpLWtleScsXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgUGFyYW1ldGVyOiB7XG4gICAgICAgICAgICBWYWx1ZTogbW9ja1N0cmlwZUFwaUtleSxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgLy8gU2ltdWxhdGUgU1NNIGZhaWx1cmUgZm9yIGFsbG93ZWQgcHJpY2UgSURzXG4gICAgICBzc21Nb2NrXG4gICAgICAgIC5vbihHZXRQYXJhbWV0ZXJDb21tYW5kLCB7XG4gICAgICAgICAgTmFtZTogJy9hdXJhMjgvdGVzdC9zdHJpcGUvYWxsb3dlZC1wcmljZS1pZHMnLFxuICAgICAgICB9KVxuICAgICAgICAucmVqZWN0cyhuZXcgRXJyb3IoJ1BhcmFtZXRlciBub3QgZm91bmQnKSk7XG5cbiAgICAgIC8vIFNldCBmYWxsYmFjayBlbnZpcm9ubWVudCB2YXJpYWJsZSAtIHVzaW5nIHRlc3QxMjMgd2hpY2ggaXMgYWxyZWFkeSBpbiB0aGUgbW9jayBzZXR1cFxuICAgICAgcHJvY2Vzcy5lbnYuQUxMT1dFRF9QUklDRV9JRFMgPSAncHJpY2VfdGVzdDEyMyxwcmljZV90ZXN0NDU2JztcblxuICAgICAgY29uc3QgbW9ja1Nlc3Npb25JZCA9ICdjc190ZXN0X2ZhbGxiYWNrJztcbiAgICAgIGNvbnN0IG1vY2tTZXNzaW9uVXJsID0gJ2h0dHBzOi8vY2hlY2tvdXQuc3RyaXBlLmNvbS9mYWxsYmFjayc7XG5cbiAgICAgIG1vY2tDcmVhdGUubW9ja1Jlc29sdmVkVmFsdWUoe1xuICAgICAgICBpZDogbW9ja1Nlc3Npb25JZCxcbiAgICAgICAgdXJsOiBtb2NrU2Vzc2lvblVybCxcbiAgICAgIH0gYXMgU3RyaXBlLkNoZWNrb3V0LlNlc3Npb24pO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCh7XG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBzZXNzaW9uVHlwZTogJ3N1YnNjcmlwdGlvbicsXG4gICAgICAgICAgcHJpY2VJZDogJ3ByaWNlX3Rlc3QxMjMnLFxuICAgICAgICAgIHN1Y2Nlc3NVcmw6ICdodHRwczovL2V4YW1wbGUuY29tL3N1Y2Nlc3MnLFxuICAgICAgICAgIGNhbmNlbFVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vY2FuY2VsJyxcbiAgICAgICAgfSksXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5zZXNzaW9uSWQpLnRvQmUobW9ja1Nlc3Npb25JZCk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBlbXB0eSBTU00gcGFyYW1ldGVyIHZhbHVlJywgYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gUmVzZXQgbW9ja3NcbiAgICAgIHNzbU1vY2sucmVzZXQoKTtcbiAgICAgIHNzbU1vY2tcbiAgICAgICAgLm9uKEdldFBhcmFtZXRlckNvbW1hbmQsIHtcbiAgICAgICAgICBOYW1lOiAnL2F1cmEyOC90ZXN0L3N0cmlwZS9hcGkta2V5JyxcbiAgICAgICAgfSlcbiAgICAgICAgLnJlc29sdmVzKHtcbiAgICAgICAgICBQYXJhbWV0ZXI6IHtcbiAgICAgICAgICAgIFZhbHVlOiBtb2NrU3RyaXBlQXBpS2V5LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICAvLyBSZXR1cm4gZW1wdHkgdmFsdWUgZm9yIGFsbG93ZWQgcHJpY2UgSURzXG4gICAgICBzc21Nb2NrXG4gICAgICAgIC5vbihHZXRQYXJhbWV0ZXJDb21tYW5kLCB7XG4gICAgICAgICAgTmFtZTogJy9hdXJhMjgvdGVzdC9zdHJpcGUvYWxsb3dlZC1wcmljZS1pZHMnLFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoe1xuICAgICAgICAgIFBhcmFtZXRlcjoge1xuICAgICAgICAgICAgVmFsdWU6ICcnLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICBjb25zdCBtb2NrU2Vzc2lvbklkID0gJ2NzX3Rlc3RfZW1wdHknO1xuICAgICAgY29uc3QgbW9ja1Nlc3Npb25VcmwgPSAnaHR0cHM6Ly9jaGVja291dC5zdHJpcGUuY29tL2VtcHR5JztcblxuICAgICAgbW9ja0NyZWF0ZS5tb2NrUmVzb2x2ZWRWYWx1ZSh7XG4gICAgICAgIGlkOiBtb2NrU2Vzc2lvbklkLFxuICAgICAgICB1cmw6IG1vY2tTZXNzaW9uVXJsLFxuICAgICAgfSBhcyBTdHJpcGUuQ2hlY2tvdXQuU2Vzc2lvbik7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KCk7XG5cbiAgICAgIC8vIFNob3VsZCBzdWNjZWVkIHdoZW4gbm8gcHJpY2UgSURzIGFyZSBjb25maWd1cmVkIChlbXB0eSBhcnJheSBtZWFucyBubyB2YWxpZGF0aW9uKVxuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBtYWxmb3JtZWQgcHJpY2UgSUQgbGlzdCBpbiBTU00nLCBhc3luYyAoKSA9PiB7XG4gICAgICAvLyBSZXNldCBtb2Nrc1xuICAgICAgc3NtTW9jay5yZXNldCgpO1xuICAgICAgc3NtTW9ja1xuICAgICAgICAub24oR2V0UGFyYW1ldGVyQ29tbWFuZCwge1xuICAgICAgICAgIE5hbWU6ICcvYXVyYTI4L3Rlc3Qvc3RyaXBlL2FwaS1rZXknLFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoe1xuICAgICAgICAgIFBhcmFtZXRlcjoge1xuICAgICAgICAgICAgVmFsdWU6IG1vY2tTdHJpcGVBcGlLZXksXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgIC8vIFJldHVybiBtYWxmb3JtZWQgdmFsdWUgd2l0aCBleHRyYSBjb21tYXMgYW5kIHNwYWNlc1xuICAgICAgc3NtTW9ja1xuICAgICAgICAub24oR2V0UGFyYW1ldGVyQ29tbWFuZCwge1xuICAgICAgICAgIE5hbWU6ICcvYXVyYTI4L3Rlc3Qvc3RyaXBlL2FsbG93ZWQtcHJpY2UtaWRzJyxcbiAgICAgICAgfSlcbiAgICAgICAgLnJlc29sdmVzKHtcbiAgICAgICAgICBQYXJhbWV0ZXI6IHtcbiAgICAgICAgICAgIFZhbHVlOiAncHJpY2VfdGVzdDEyMywgICxwcmljZV90ZXN0NDU2LCwsJyxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgY29uc3QgbW9ja1Nlc3Npb25JZCA9ICdjc190ZXN0X21hbGZvcm1lZCc7XG4gICAgICBjb25zdCBtb2NrU2Vzc2lvblVybCA9ICdodHRwczovL2NoZWNrb3V0LnN0cmlwZS5jb20vbWFsZm9ybWVkJztcblxuICAgICAgbW9ja0NyZWF0ZS5tb2NrUmVzb2x2ZWRWYWx1ZSh7XG4gICAgICAgIGlkOiBtb2NrU2Vzc2lvbklkLFxuICAgICAgICB1cmw6IG1vY2tTZXNzaW9uVXJsLFxuICAgICAgfSBhcyBTdHJpcGUuQ2hlY2tvdXQuU2Vzc2lvbik7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KHtcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIHNlc3Npb25UeXBlOiAnc3Vic2NyaXB0aW9uJyxcbiAgICAgICAgICBwcmljZUlkOiAncHJpY2VfdGVzdDQ1NicsXG4gICAgICAgICAgc3VjY2Vzc1VybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vc3VjY2VzcycsXG4gICAgICAgICAgY2FuY2VsVXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9jYW5jZWwnLFxuICAgICAgICB9KSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LnNlc3Npb25JZCkudG9CZShtb2NrU2Vzc2lvbklkKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgcmVqZWN0IGRpc2FsbG93ZWQgcHJpY2UgSUQgZm9yIG9uZS10aW1lIHBheW1lbnQnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCh7XG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBzZXNzaW9uVHlwZTogJ29uZS10aW1lJyxcbiAgICAgICAgICBwcmljZUlkOiAncHJpY2Vfbm90X2FsbG93ZWQnLFxuICAgICAgICAgIHN1Y2Nlc3NVcmw6ICdodHRwczovL2V4YW1wbGUuY29tL3N1Y2Nlc3MnLFxuICAgICAgICAgIGNhbmNlbFVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vY2FuY2VsJyxcbiAgICAgICAgfSksXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDQwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5lcnJvcikudG9CZSgnSW52YWxpZCBwcmljZSBJRCcpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBhbGxvdyBvbmUtdGltZSBwYXltZW50IHdpdGhvdXQgcHJpY2UgSUQgd2hlbiBkeW5hbWljIHByaWNpbmcgaXMgdXNlZCcsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IG1vY2tTZXNzaW9uSWQgPSAnY3NfdGVzdF9keW5hbWljJztcbiAgICAgIGNvbnN0IG1vY2tTZXNzaW9uVXJsID0gJ2h0dHBzOi8vY2hlY2tvdXQuc3RyaXBlLmNvbS9keW5hbWljJztcblxuICAgICAgbW9ja0NyZWF0ZS5tb2NrUmVzb2x2ZWRWYWx1ZSh7XG4gICAgICAgIGlkOiBtb2NrU2Vzc2lvbklkLFxuICAgICAgICB1cmw6IG1vY2tTZXNzaW9uVXJsLFxuICAgICAgfSBhcyBTdHJpcGUuQ2hlY2tvdXQuU2Vzc2lvbik7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KHtcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIHNlc3Npb25UeXBlOiAnb25lLXRpbWUnLFxuICAgICAgICAgIHN1Y2Nlc3NVcmw6ICdodHRwczovL2V4YW1wbGUuY29tL3N1Y2Nlc3MnLFxuICAgICAgICAgIGNhbmNlbFVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vY2FuY2VsJyxcbiAgICAgICAgfSksXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBleHBlY3QobW9ja0NyZWF0ZSkudG9IYXZlQmVlbkNhbGxlZFdpdGgoXG4gICAgICAgIGV4cGVjdC5vYmplY3RDb250YWluaW5nKHtcbiAgICAgICAgICBsaW5lX2l0ZW1zOiBbXG4gICAgICAgICAgICBleHBlY3Qub2JqZWN0Q29udGFpbmluZyh7XG4gICAgICAgICAgICAgIHByaWNlX2RhdGE6IGV4cGVjdC5vYmplY3RDb250YWluaW5nKHtcbiAgICAgICAgICAgICAgICBjdXJyZW5jeTogJ3VzZCcsXG4gICAgICAgICAgICAgICAgdW5pdF9hbW91bnQ6IDI5MDAsXG4gICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgXSxcbiAgICAgICAgfSksXG4gICAgICApO1xuICAgIH0pO1xuICB9KTtcblxuICAvKiBlc2xpbnQtZGlzYWJsZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55ICovXG4gIGRlc2NyaWJlKCdTU00gY2FjaGluZyBtZWNoYW5pc20nLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCByZXNwZWN0IGNhY2hlIFRUTCBmcm9tIGVudmlyb25tZW50IHZhcmlhYmxlJywgYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gU2V0IGN1c3RvbSBUVExcbiAgICAgIHByb2Nlc3MuZW52LlBSSUNFX0lEX0NBQ0hFX1RUTF9TRUNPTkRTID0gJzEnOyAvLyAxIHNlY29uZCBmb3IgZmFzdGVyIHRlc3RcblxuICAgICAgY29uc3QgbW9ja1Nlc3Npb25JZCA9ICdjc190ZXN0X3R0bCc7XG4gICAgICBjb25zdCBtb2NrU2Vzc2lvblVybCA9ICdodHRwczovL2NoZWNrb3V0LnN0cmlwZS5jb20vdHRsJztcblxuICAgICAgbW9ja0NyZWF0ZS5tb2NrUmVzb2x2ZWRWYWx1ZSh7XG4gICAgICAgIGlkOiBtb2NrU2Vzc2lvbklkLFxuICAgICAgICB1cmw6IG1vY2tTZXNzaW9uVXJsLFxuICAgICAgfSBhcyBTdHJpcGUuQ2hlY2tvdXQuU2Vzc2lvbik7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KCk7XG5cbiAgICAgIC8vIEZpcnN0IGludm9jYXRpb24gLSBzaG91bGQgY2FsbCBTU01cbiAgICAgIGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuICAgICAgY29uc3QgaW5pdGlhbFNzbUNhbGxzID0gc3NtTW9ja1xuICAgICAgICAuY2FsbHMoKVxuICAgICAgICAuZmlsdGVyKFxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICAgICAgKGNhbGw6IGFueSkgPT4gY2FsbC5hcmdzWzBdLmlucHV0Lk5hbWUgPT09ICcvYXVyYTI4L3Rlc3Qvc3RyaXBlL2FsbG93ZWQtcHJpY2UtaWRzJyxcbiAgICAgICAgKS5sZW5ndGg7XG5cbiAgICAgIC8vIENsZWFyIGNhY2hlIHRvIHNpbXVsYXRlIG5ldyBMYW1iZGEgY29sZCBzdGFydFxuICAgICAgY2xlYXJDYWNoZSgpO1xuXG4gICAgICAvLyBTZWNvbmQgaW52b2NhdGlvbiBhZnRlciBjYWNoZSBjbGVhciAtIHNob3VsZCBjYWxsIFNTTSBhZ2FpblxuICAgICAgYXdhaXQgaGFuZGxlcihldmVudCk7XG4gICAgICBjb25zdCBhZnRlckNhY2hlQ2xlYXJDYWxscyA9IHNzbU1vY2tcbiAgICAgICAgLmNhbGxzKClcbiAgICAgICAgLmZpbHRlcihcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgICAgIChjYWxsOiBhbnkpID0+IGNhbGwuYXJnc1swXS5pbnB1dC5OYW1lID09PSAnL2F1cmEyOC90ZXN0L3N0cmlwZS9hbGxvd2VkLXByaWNlLWlkcycsXG4gICAgICAgICkubGVuZ3RoO1xuXG4gICAgICAvLyBTaG91bGQgaGF2ZSBjYWxsZWQgU1NNIGFnYWluIGFmdGVyIGNhY2hlIGNsZWFyXG4gICAgICBleHBlY3QoYWZ0ZXJDYWNoZUNsZWFyQ2FsbHMpLnRvQmVHcmVhdGVyVGhhbihpbml0aWFsU3NtQ2FsbHMpO1xuICAgIH0sIDEwMDAwKTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIFNTTSBwYXJhbWV0ZXIgbm90IGV4aXN0aW5nIGdyYWNlZnVsbHknLCBhc3luYyAoKSA9PiB7XG4gICAgICAvLyBSZXNldCBtb2Nrc1xuICAgICAgc3NtTW9jay5yZXNldCgpO1xuICAgICAgc3NtTW9ja1xuICAgICAgICAub24oR2V0UGFyYW1ldGVyQ29tbWFuZCwge1xuICAgICAgICAgIE5hbWU6ICcvYXVyYTI4L3Rlc3Qvc3RyaXBlL2FwaS1rZXknLFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoe1xuICAgICAgICAgIFBhcmFtZXRlcjoge1xuICAgICAgICAgICAgVmFsdWU6IG1vY2tTdHJpcGVBcGlLZXksXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgIC8vIFNpbXVsYXRlIHBhcmFtZXRlciBkb2Vzbid0IGV4aXN0IChyZXR1cm5zIHVuZGVmaW5lZClcbiAgICAgIHNzbU1vY2tcbiAgICAgICAgLm9uKEdldFBhcmFtZXRlckNvbW1hbmQsIHtcbiAgICAgICAgICBOYW1lOiAnL2F1cmEyOC90ZXN0L3N0cmlwZS9hbGxvd2VkLXByaWNlLWlkcycsXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgUGFyYW1ldGVyOiB1bmRlZmluZWQsXG4gICAgICAgIH0pO1xuXG4gICAgICAvLyBBbHNvIGNsZWFyIGVudmlyb25tZW50IHZhcmlhYmxlXG4gICAgICBkZWxldGUgcHJvY2Vzcy5lbnYuQUxMT1dFRF9QUklDRV9JRFM7XG5cbiAgICAgIGNvbnN0IG1vY2tTZXNzaW9uSWQgPSAnY3NfdGVzdF9ub19wYXJhbSc7XG4gICAgICBjb25zdCBtb2NrU2Vzc2lvblVybCA9ICdodHRwczovL2NoZWNrb3V0LnN0cmlwZS5jb20vbm9fcGFyYW0nO1xuXG4gICAgICBtb2NrQ3JlYXRlLm1vY2tSZXNvbHZlZFZhbHVlKHtcbiAgICAgICAgaWQ6IG1vY2tTZXNzaW9uSWQsXG4gICAgICAgIHVybDogbW9ja1Nlc3Npb25VcmwsXG4gICAgICB9IGFzIFN0cmlwZS5DaGVja291dC5TZXNzaW9uKTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoe1xuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgc2Vzc2lvblR5cGU6ICdvbmUtdGltZScsXG4gICAgICAgICAgc3VjY2Vzc1VybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vc3VjY2VzcycsXG4gICAgICAgICAgY2FuY2VsVXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9jYW5jZWwnLFxuICAgICAgICB9KSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICAvLyBTaG91bGQgc3VjY2VlZCB3aXRoIG5vIHByaWNlIHZhbGlkYXRpb24gd2hlbiBubyBjb25maWcgZXhpc3RzXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIFNTTSByZXR1cm5pbmcgbnVsbCBwYXJhbWV0ZXIgZ3JhY2VmdWxseScsIGFzeW5jICgpID0+IHtcbiAgICAgIC8vIFJlc2V0IG1vY2tzXG4gICAgICBzc21Nb2NrLnJlc2V0KCk7XG4gICAgICBzc21Nb2NrXG4gICAgICAgIC5vbihHZXRQYXJhbWV0ZXJDb21tYW5kLCB7XG4gICAgICAgICAgTmFtZTogJy9hdXJhMjgvdGVzdC9zdHJpcGUvYXBpLWtleScsXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgUGFyYW1ldGVyOiB7XG4gICAgICAgICAgICBWYWx1ZTogbW9ja1N0cmlwZUFwaUtleSxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgLy8gU2ltdWxhdGUgU1NNIHJldHVybnMgbnVsbCBwYXJhbWV0ZXJcbiAgICAgIHNzbU1vY2tcbiAgICAgICAgLm9uKEdldFBhcmFtZXRlckNvbW1hbmQsIHtcbiAgICAgICAgICBOYW1lOiAnL2F1cmEyOC90ZXN0L3N0cmlwZS9hbGxvd2VkLXByaWNlLWlkcycsXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgICAgICBQYXJhbWV0ZXI6IG51bGwgYXMgYW55LFxuICAgICAgICB9KTtcblxuICAgICAgY29uc3QgbW9ja1Nlc3Npb25JZCA9ICdjc190ZXN0X251bGxfcGFyYW0nO1xuICAgICAgY29uc3QgbW9ja1Nlc3Npb25VcmwgPSAnaHR0cHM6Ly9jaGVja291dC5zdHJpcGUuY29tL251bGxfcGFyYW0nO1xuXG4gICAgICBtb2NrQ3JlYXRlLm1vY2tSZXNvbHZlZFZhbHVlKHtcbiAgICAgICAgaWQ6IG1vY2tTZXNzaW9uSWQsXG4gICAgICAgIHVybDogbW9ja1Nlc3Npb25VcmwsXG4gICAgICB9IGFzIFN0cmlwZS5DaGVja291dC5TZXNzaW9uKTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoe1xuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgc2Vzc2lvblR5cGU6ICdvbmUtdGltZScsXG4gICAgICAgICAgc3VjY2Vzc1VybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vc3VjY2VzcycsXG4gICAgICAgICAgY2FuY2VsVXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9jYW5jZWwnLFxuICAgICAgICB9KSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICAvLyBTaG91bGQgc3VjY2VlZCB3aXRoIGRlZmF1bHQgcHJpY2UgZGF0YVxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGNhY2hlIGVtcHR5IGFycmF5cyB3aGVuIG5vIHByaWNlIElEcyBjb25maWd1cmVkJywgYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gQ2xlYXIgZW52aXJvbm1lbnQgdmFyaWFibGVzXG4gICAgICBkZWxldGUgcHJvY2Vzcy5lbnYuQUxMT1dFRF9QUklDRV9JRFM7XG4gICAgICBkZWxldGUgcHJvY2Vzcy5lbnYuQUxMT1dFRF9QUklDRV9JRFNfUEFSQU1FVEVSX05BTUU7XG5cbiAgICAgIGNvbnN0IG1vY2tTZXNzaW9uSWQgPSAnY3NfdGVzdF9jYWNoZV9lbXB0eSc7XG4gICAgICBjb25zdCBtb2NrU2Vzc2lvblVybCA9ICdodHRwczovL2NoZWNrb3V0LnN0cmlwZS5jb20vY2FjaGVfZW1wdHknO1xuXG4gICAgICBtb2NrQ3JlYXRlLm1vY2tSZXNvbHZlZFZhbHVlKHtcbiAgICAgICAgaWQ6IG1vY2tTZXNzaW9uSWQsXG4gICAgICAgIHVybDogbW9ja1Nlc3Npb25VcmwsXG4gICAgICB9IGFzIFN0cmlwZS5DaGVja291dC5TZXNzaW9uKTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoe1xuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgc2Vzc2lvblR5cGU6ICdvbmUtdGltZScsXG4gICAgICAgICAgc3VjY2Vzc1VybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vc3VjY2VzcycsXG4gICAgICAgICAgY2FuY2VsVXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9jYW5jZWwnLFxuICAgICAgICB9KSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBGaXJzdCBjYWxsXG4gICAgICBjb25zdCBmaXJzdFJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuICAgICAgY29uc3QgZmlyc3RDYWxsU3NtQ291bnQgPSBzc21Nb2NrLmNhbGxzKCkubGVuZ3RoO1xuXG4gICAgICAvLyBTZWNvbmQgY2FsbCAtIHNob3VsZCBub3QgZmV0Y2ggU1NNIGFnYWluIGR1ZSB0byBjYWNoaW5nXG4gICAgICBjb25zdCBzZWNvbmRSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcbiAgICAgIGNvbnN0IHNlY29uZENhbGxTc21Db3VudCA9IHNzbU1vY2suY2FsbHMoKS5sZW5ndGg7XG5cbiAgICAgIC8vIFNob3VsZCBub3QgaGF2ZSBtYWRlIGFkZGl0aW9uYWwgU1NNIGNhbGxzXG4gICAgICBleHBlY3Qoc2Vjb25kQ2FsbFNzbUNvdW50IC0gZmlyc3RDYWxsU3NtQ291bnQpLnRvQmVMZXNzVGhhbk9yRXF1YWwoMSk7XG4gICAgICBleHBlY3QoZmlyc3RSZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgZXhwZWN0KHNlY29uZFJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSB3aGl0ZXNwYWNlLW9ubHkgcHJpY2UgSURzIGluIFNTTScsIGFzeW5jICgpID0+IHtcbiAgICAgIC8vIFJlc2V0IG1vY2tzXG4gICAgICBzc21Nb2NrLnJlc2V0KCk7XG4gICAgICBzc21Nb2NrXG4gICAgICAgIC5vbihHZXRQYXJhbWV0ZXJDb21tYW5kLCB7XG4gICAgICAgICAgTmFtZTogJy9hdXJhMjgvdGVzdC9zdHJpcGUvYXBpLWtleScsXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgUGFyYW1ldGVyOiB7XG4gICAgICAgICAgICBWYWx1ZTogbW9ja1N0cmlwZUFwaUtleSxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgLy8gUmV0dXJuIHdoaXRlc3BhY2Utb25seSB2YWx1ZVxuICAgICAgc3NtTW9ja1xuICAgICAgICAub24oR2V0UGFyYW1ldGVyQ29tbWFuZCwge1xuICAgICAgICAgIE5hbWU6ICcvYXVyYTI4L3Rlc3Qvc3RyaXBlL2FsbG93ZWQtcHJpY2UtaWRzJyxcbiAgICAgICAgfSlcbiAgICAgICAgLnJlc29sdmVzKHtcbiAgICAgICAgICBQYXJhbWV0ZXI6IHtcbiAgICAgICAgICAgIFZhbHVlOiAnICAgLCAgLCAgICcsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IG1vY2tTZXNzaW9uSWQgPSAnY3NfdGVzdF93aGl0ZXNwYWNlJztcbiAgICAgIGNvbnN0IG1vY2tTZXNzaW9uVXJsID0gJ2h0dHBzOi8vY2hlY2tvdXQuc3RyaXBlLmNvbS93aGl0ZXNwYWNlJztcblxuICAgICAgbW9ja0NyZWF0ZS5tb2NrUmVzb2x2ZWRWYWx1ZSh7XG4gICAgICAgIGlkOiBtb2NrU2Vzc2lvbklkLFxuICAgICAgICB1cmw6IG1vY2tTZXNzaW9uVXJsLFxuICAgICAgfSBhcyBTdHJpcGUuQ2hlY2tvdXQuU2Vzc2lvbik7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KHtcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIHNlc3Npb25UeXBlOiAnb25lLXRpbWUnLFxuICAgICAgICAgIHN1Y2Nlc3NVcmw6ICdodHRwczovL2V4YW1wbGUuY29tL3N1Y2Nlc3MnLFxuICAgICAgICAgIGNhbmNlbFVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vY2FuY2VsJyxcbiAgICAgICAgfSksXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgLy8gU2hvdWxkIHN1Y2NlZWQgYXMgZW1wdHkgcHJpY2UgSUQgbGlzdCBtZWFucyBubyB2YWxpZGF0aW9uXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIHZlcnkgbG9uZyBwcmljZSBJRCBsaXN0cyBlZmZpY2llbnRseScsIGFzeW5jICgpID0+IHtcbiAgICAgIC8vIFJlc2V0IG1vY2tzXG4gICAgICBzc21Nb2NrLnJlc2V0KCk7XG4gICAgICBzc21Nb2NrXG4gICAgICAgIC5vbihHZXRQYXJhbWV0ZXJDb21tYW5kLCB7XG4gICAgICAgICAgTmFtZTogJy9hdXJhMjgvdGVzdC9zdHJpcGUvYXBpLWtleScsXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgUGFyYW1ldGVyOiB7XG4gICAgICAgICAgICBWYWx1ZTogbW9ja1N0cmlwZUFwaUtleSxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgLy8gQ3JlYXRlIGEgbG9uZyBsaXN0IG9mIHByaWNlIElEc1xuICAgICAgY29uc3QgbG9uZ1ByaWNlSWRMaXN0ID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogMTAwIH0sIChfLCBpKSA9PiBgcHJpY2VfdGVzdCR7aX1gKS5qb2luKCcsJyk7XG5cbiAgICAgIHNzbU1vY2tcbiAgICAgICAgLm9uKEdldFBhcmFtZXRlckNvbW1hbmQsIHtcbiAgICAgICAgICBOYW1lOiAnL2F1cmEyOC90ZXN0L3N0cmlwZS9hbGxvd2VkLXByaWNlLWlkcycsXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgUGFyYW1ldGVyOiB7XG4gICAgICAgICAgICBWYWx1ZTogbG9uZ1ByaWNlSWRMaXN0LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICBjb25zdCBtb2NrU2Vzc2lvbklkID0gJ2NzX3Rlc3RfbG9uZ19saXN0JztcbiAgICAgIGNvbnN0IG1vY2tTZXNzaW9uVXJsID0gJ2h0dHBzOi8vY2hlY2tvdXQuc3RyaXBlLmNvbS9sb25nX2xpc3QnO1xuXG4gICAgICBtb2NrQ3JlYXRlLm1vY2tSZXNvbHZlZFZhbHVlKHtcbiAgICAgICAgaWQ6IG1vY2tTZXNzaW9uSWQsXG4gICAgICAgIHVybDogbW9ja1Nlc3Npb25VcmwsXG4gICAgICB9IGFzIFN0cmlwZS5DaGVja291dC5TZXNzaW9uKTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoe1xuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgc2Vzc2lvblR5cGU6ICdzdWJzY3JpcHRpb24nLFxuICAgICAgICAgIHByaWNlSWQ6ICdwcmljZV90ZXN0NTAnLFxuICAgICAgICAgIHN1Y2Nlc3NVcmw6ICdodHRwczovL2V4YW1wbGUuY29tL3N1Y2Nlc3MnLFxuICAgICAgICAgIGNhbmNlbFVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vY2FuY2VsJyxcbiAgICAgICAgfSksXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5zZXNzaW9uSWQpLnRvQmUobW9ja1Nlc3Npb25JZCk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBTU00gdGhyb3R0bGluZyBlcnJvcnMgZ3JhY2VmdWxseScsIGFzeW5jICgpID0+IHtcbiAgICAgIC8vIFJlc2V0IG1vY2tzXG4gICAgICBzc21Nb2NrLnJlc2V0KCk7XG4gICAgICBzc21Nb2NrXG4gICAgICAgIC5vbihHZXRQYXJhbWV0ZXJDb21tYW5kLCB7XG4gICAgICAgICAgTmFtZTogJy9hdXJhMjgvdGVzdC9zdHJpcGUvYXBpLWtleScsXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgUGFyYW1ldGVyOiB7XG4gICAgICAgICAgICBWYWx1ZTogbW9ja1N0cmlwZUFwaUtleSxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgLy8gU2ltdWxhdGUgdGhyb3R0bGluZyBlcnJvclxuICAgICAgY29uc3QgdGhyb3R0bGluZ0Vycm9yID0gbmV3IEVycm9yKCdSYXRlIGV4Y2VlZGVkJyk7XG4gICAgICB0aHJvdHRsaW5nRXJyb3IubmFtZSA9ICdUaHJvdHRsaW5nRXhjZXB0aW9uJztcblxuICAgICAgc3NtTW9ja1xuICAgICAgICAub24oR2V0UGFyYW1ldGVyQ29tbWFuZCwge1xuICAgICAgICAgIE5hbWU6ICcvYXVyYTI4L3Rlc3Qvc3RyaXBlL2FsbG93ZWQtcHJpY2UtaWRzJyxcbiAgICAgICAgfSlcbiAgICAgICAgLnJlamVjdHModGhyb3R0bGluZ0Vycm9yKTtcblxuICAgICAgLy8gU2V0IGZhbGxiYWNrXG4gICAgICBwcm9jZXNzLmVudi5BTExPV0VEX1BSSUNFX0lEUyA9ICdwcmljZV90ZXN0MTIzJztcblxuICAgICAgY29uc3QgbW9ja1Nlc3Npb25JZCA9ICdjc190ZXN0X3Rocm90dGxlJztcbiAgICAgIGNvbnN0IG1vY2tTZXNzaW9uVXJsID0gJ2h0dHBzOi8vY2hlY2tvdXQuc3RyaXBlLmNvbS90aHJvdHRsZSc7XG5cbiAgICAgIG1vY2tDcmVhdGUubW9ja1Jlc29sdmVkVmFsdWUoe1xuICAgICAgICBpZDogbW9ja1Nlc3Npb25JZCxcbiAgICAgICAgdXJsOiBtb2NrU2Vzc2lvblVybCxcbiAgICAgIH0gYXMgU3RyaXBlLkNoZWNrb3V0LlNlc3Npb24pO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCgpO1xuXG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICAvLyBTaG91bGQgZmFsbCBiYWNrIHRvIGVudmlyb25tZW50IHZhcmlhYmxlXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgdmFsaWRhdGUgcHJpY2UgSURzIGFyZSB0cmltbWVkIGNvcnJlY3RseScsIGFzeW5jICgpID0+IHtcbiAgICAgIC8vIFJlc2V0IG1vY2tzXG4gICAgICBzc21Nb2NrLnJlc2V0KCk7XG4gICAgICBzc21Nb2NrXG4gICAgICAgIC5vbihHZXRQYXJhbWV0ZXJDb21tYW5kLCB7XG4gICAgICAgICAgTmFtZTogJy9hdXJhMjgvdGVzdC9zdHJpcGUvYXBpLWtleScsXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgUGFyYW1ldGVyOiB7XG4gICAgICAgICAgICBWYWx1ZTogbW9ja1N0cmlwZUFwaUtleSxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgLy8gUHJpY2UgSURzIHdpdGggdmFyaW91cyB3aGl0ZXNwYWNlXG4gICAgICBzc21Nb2NrXG4gICAgICAgIC5vbihHZXRQYXJhbWV0ZXJDb21tYW5kLCB7XG4gICAgICAgICAgTmFtZTogJy9hdXJhMjgvdGVzdC9zdHJpcGUvYWxsb3dlZC1wcmljZS1pZHMnLFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoe1xuICAgICAgICAgIFBhcmFtZXRlcjoge1xuICAgICAgICAgICAgVmFsdWU6ICcgcHJpY2VfdGVzdDEyMyAsIHByaWNlX3Rlc3Q0NTYgJyxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgY29uc3QgbW9ja1Nlc3Npb25JZCA9ICdjc190ZXN0X3RyaW0nO1xuICAgICAgY29uc3QgbW9ja1Nlc3Npb25VcmwgPSAnaHR0cHM6Ly9jaGVja291dC5zdHJpcGUuY29tL3RyaW0nO1xuXG4gICAgICBtb2NrQ3JlYXRlLm1vY2tSZXNvbHZlZFZhbHVlKHtcbiAgICAgICAgaWQ6IG1vY2tTZXNzaW9uSWQsXG4gICAgICAgIHVybDogbW9ja1Nlc3Npb25VcmwsXG4gICAgICB9IGFzIFN0cmlwZS5DaGVja291dC5TZXNzaW9uKTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoe1xuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgc2Vzc2lvblR5cGU6ICdzdWJzY3JpcHRpb24nLFxuICAgICAgICAgIHByaWNlSWQ6ICdwcmljZV90ZXN0MTIzJywgLy8gV2l0aG91dCBzcGFjZXNcbiAgICAgICAgICBzdWNjZXNzVXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9zdWNjZXNzJyxcbiAgICAgICAgICBjYW5jZWxVcmw6ICdodHRwczovL2V4YW1wbGUuY29tL2NhbmNlbCcsXG4gICAgICAgIH0pLFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgc2VxdWVudGlhbCByZXF1ZXN0cyB3aXRoIGNhY2hlIHByb3Blcmx5JywgYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gQ2xlYXIgY2FjaGUgYW5kIHJlc2V0IG1vY2tzIGZvciBjbGVhbiB0ZXN0XG4gICAgICBjbGVhckNhY2hlKCk7XG4gICAgICBzc21Nb2NrLnJlc2V0KCk7XG5cbiAgICAgIC8vIFNldHVwIFNTTSBtb2Nrc1xuICAgICAgc3NtTW9ja1xuICAgICAgICAub24oR2V0UGFyYW1ldGVyQ29tbWFuZCwge1xuICAgICAgICAgIE5hbWU6ICcvYXVyYTI4L3Rlc3Qvc3RyaXBlL2FwaS1rZXknLFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoe1xuICAgICAgICAgIFBhcmFtZXRlcjoge1xuICAgICAgICAgICAgVmFsdWU6IG1vY2tTdHJpcGVBcGlLZXksXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgIHNzbU1vY2tcbiAgICAgICAgLm9uKEdldFBhcmFtZXRlckNvbW1hbmQsIHtcbiAgICAgICAgICBOYW1lOiAnL2F1cmEyOC90ZXN0L3N0cmlwZS9hbGxvd2VkLXByaWNlLWlkcycsXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgUGFyYW1ldGVyOiB7XG4gICAgICAgICAgICBWYWx1ZTogJ3ByaWNlX3Rlc3QxMjMscHJpY2VfdGVzdDQ1NicsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IG1vY2tTZXNzaW9uSWQgPSAnY3NfdGVzdF9zZXF1ZW50aWFsJztcbiAgICAgIGNvbnN0IG1vY2tTZXNzaW9uVXJsID0gJ2h0dHBzOi8vY2hlY2tvdXQuc3RyaXBlLmNvbS9zZXF1ZW50aWFsJztcblxuICAgICAgbW9ja0NyZWF0ZS5tb2NrUmVzb2x2ZWRWYWx1ZSh7XG4gICAgICAgIGlkOiBtb2NrU2Vzc2lvbklkLFxuICAgICAgICB1cmw6IG1vY2tTZXNzaW9uVXJsLFxuICAgICAgfSBhcyBTdHJpcGUuQ2hlY2tvdXQuU2Vzc2lvbik7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KCk7XG5cbiAgICAgIC8vIEZpcnN0IHJlcXVlc3QgLSBzaG91bGQgZmV0Y2ggZnJvbSBTU01cbiAgICAgIGNvbnN0IHJlc3VsdDEgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcbiAgICAgIGV4cGVjdChyZXN1bHQxLnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcblxuICAgICAgY29uc3Qgc3NtQ2FsbHNBZnRlckZpcnN0ID0gc3NtTW9ja1xuICAgICAgICAuY2FsbHMoKVxuICAgICAgICAuZmlsdGVyKFxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICAgICAgKGNhbGw6IGFueSkgPT4gY2FsbC5hcmdzWzBdLmlucHV0Lk5hbWUgPT09ICcvYXVyYTI4L3Rlc3Qvc3RyaXBlL2FsbG93ZWQtcHJpY2UtaWRzJyxcbiAgICAgICAgKS5sZW5ndGg7XG5cbiAgICAgIC8vIFNlcXVlbnRpYWwgcmVxdWVzdHMgLSBzaG91bGQgdXNlIGNhY2hlXG4gICAgICBjb25zdCByZXN1bHQyID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG4gICAgICBjb25zdCByZXN1bHQzID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQyLnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIGV4cGVjdChyZXN1bHQzLnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcblxuICAgICAgY29uc3Qgc3NtQ2FsbHNBZnRlckFsbCA9IHNzbU1vY2tcbiAgICAgICAgLmNhbGxzKClcbiAgICAgICAgLmZpbHRlcihcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgICAgIChjYWxsOiBhbnkpID0+IGNhbGwuYXJnc1swXS5pbnB1dC5OYW1lID09PSAnL2F1cmEyOC90ZXN0L3N0cmlwZS9hbGxvd2VkLXByaWNlLWlkcycsXG4gICAgICAgICkubGVuZ3RoO1xuXG4gICAgICAvLyBTaG91bGQgb25seSBoYXZlIGNhbGxlZCBTU00gb25jZSBmb3IgcHJpY2UgSURzIChjYWNoZSBpcyB3b3JraW5nKVxuICAgICAgZXhwZWN0KHNzbUNhbGxzQWZ0ZXJBbGwpLnRvQmUoc3NtQ2FsbHNBZnRlckZpcnN0KTtcbiAgICAgIGV4cGVjdChzc21DYWxsc0FmdGVyRmlyc3QpLnRvQmUoMSk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHVzZSBkZWZhdWx0IFRUTCB3aGVuIGVudmlyb25tZW50IHZhcmlhYmxlIGlzIG5vdCBzZXQnLCBhc3luYyAoKSA9PiB7XG4gICAgICAvLyBSZW1vdmUgVFRMIGVudmlyb25tZW50IHZhcmlhYmxlXG4gICAgICBkZWxldGUgcHJvY2Vzcy5lbnYuUFJJQ0VfSURfQ0FDSEVfVFRMX1NFQ09ORFM7XG5cbiAgICAgIGNvbnN0IG1vY2tTZXNzaW9uSWQgPSAnY3NfdGVzdF9kZWZhdWx0X3R0bCc7XG4gICAgICBjb25zdCBtb2NrU2Vzc2lvblVybCA9ICdodHRwczovL2NoZWNrb3V0LnN0cmlwZS5jb20vZGVmYXVsdF90dGwnO1xuXG4gICAgICBtb2NrQ3JlYXRlLm1vY2tSZXNvbHZlZFZhbHVlKHtcbiAgICAgICAgaWQ6IG1vY2tTZXNzaW9uSWQsXG4gICAgICAgIHVybDogbW9ja1Nlc3Npb25VcmwsXG4gICAgICB9IGFzIFN0cmlwZS5DaGVja291dC5TZXNzaW9uKTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoKTtcblxuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgLy8gU2hvdWxkIHN1Y2NlZWQgd2l0aCBkZWZhdWx0IFRUTCAoMzAwIHNlY29uZHMpXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIGludmFsaWQgVFRMIHZhbHVlcyBncmFjZWZ1bGx5JywgYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gU2V0IGludmFsaWQgVFRMXG4gICAgICBwcm9jZXNzLmVudi5QUklDRV9JRF9DQUNIRV9UVExfU0VDT05EUyA9ICdpbnZhbGlkJztcblxuICAgICAgY29uc3QgbW9ja1Nlc3Npb25JZCA9ICdjc190ZXN0X2ludmFsaWRfdHRsJztcbiAgICAgIGNvbnN0IG1vY2tTZXNzaW9uVXJsID0gJ2h0dHBzOi8vY2hlY2tvdXQuc3RyaXBlLmNvbS9pbnZhbGlkX3R0bCc7XG5cbiAgICAgIG1vY2tDcmVhdGUubW9ja1Jlc29sdmVkVmFsdWUoe1xuICAgICAgICBpZDogbW9ja1Nlc3Npb25JZCxcbiAgICAgICAgdXJsOiBtb2NrU2Vzc2lvblVybCxcbiAgICAgIH0gYXMgU3RyaXBlLkNoZWNrb3V0LlNlc3Npb24pO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCgpO1xuXG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICAvLyBTaG91bGQgc3VjY2VlZCB1c2luZyBmYWxsYmFjayBUVExcbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgIH0pO1xuICB9KTtcbiAgLyogZXNsaW50LWVuYWJsZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55ICovXG59KTtcbiJdfQ==