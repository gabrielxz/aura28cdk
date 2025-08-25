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
            const initialSsmCalls = ssmMock.calls().filter(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (call) => call.args[0].input.Name === '/aura28/test/stripe/allowed-price-ids').length;
            // Clear cache to simulate new Lambda cold start
            (0, create_checkout_session_1.clearCache)();
            // Second invocation after cache clear - should call SSM again
            await (0, create_checkout_session_1.handler)(event);
            const afterCacheClearCalls = ssmMock.calls().filter(
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
            const ssmCallsAfterFirst = ssmMock.calls().filter(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (call) => call.args[0].input.Name === '/aura28/test/stripe/allowed-price-ids').length;
            // Sequential requests - should use cache
            const result2 = await (0, create_checkout_session_1.handler)(event);
            const result3 = await (0, create_checkout_session_1.handler)(event);
            expect(result2.statusCode).toBe(200);
            expect(result3.statusCode).toBe(200);
            const ssmCallsAfterAll = ssmMock.calls().filter(
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3JlYXRlLWNoZWNrb3V0LXNlc3Npb24udGVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImNyZWF0ZS1jaGVja291dC1zZXNzaW9uLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFDQSwyRkFBb0Y7QUFDcEYsNkRBQWlEO0FBQ2pELG9EQUFxRTtBQUdyRSw4QkFBOEI7QUFDOUIsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLEVBQUUsRUFBRSxDQUFDO0FBQzdCLE1BQU0sVUFBVSxHQUFHO0lBQ2pCLFFBQVEsRUFBRTtRQUNSLFFBQVEsRUFBRTtZQUNSLE1BQU0sRUFBRSxVQUFVO1NBQ25CO0tBQ0Y7Q0FDRixDQUFDO0FBRUYsY0FBYztBQUNkLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLEdBQUcsRUFBRTtJQUN2QixPQUFPLElBQUksQ0FBQyxFQUFFLEVBQUUsQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxVQUFVLENBQUMsQ0FBQztBQUN4RCxDQUFDLENBQUMsQ0FBQztBQUVILE1BQU0sT0FBTyxHQUFHLElBQUEsZ0NBQVUsRUFBQyxzQkFBUyxDQUFDLENBQUM7QUFFdEMsUUFBUSxDQUFDLGdDQUFnQyxFQUFFLEdBQUcsRUFBRTtJQUM5QyxNQUFNLGdCQUFnQixHQUFHLHNCQUFzQixDQUFDO0lBQ2hELE1BQU0sVUFBVSxHQUFHLGVBQWUsQ0FBQztJQUNuQyxNQUFNLFNBQVMsR0FBRyxrQkFBa0IsQ0FBQztJQUVyQyxVQUFVLENBQUMsR0FBRyxFQUFFO1FBQ2QsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO1FBQ3JCLE9BQU8sQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNoQixVQUFVLENBQUMsU0FBUyxFQUFFLENBQUM7UUFFdkIsOEJBQThCO1FBQzlCLElBQUEsb0NBQVUsR0FBRSxDQUFDO1FBRWIscUVBQXFFO1FBQ3JFLE9BQU87YUFDSixFQUFFLENBQUMsZ0NBQW1CLEVBQUU7WUFDdkIsSUFBSSxFQUFFLDZC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QUUsY0FBYzthQUNPLENBQUMsQ0FBQztZQUU5QixNQUFNLEtBQUssR0FBRyxlQUFlLEVBQUUsQ0FBQztZQUVoQyxNQUFNLE1BQU0sR0FBMEIsTUFBTSxJQUFBLGlDQUFPLEVBQUMsS0FBSyxDQUFDLENBQUM7WUFFM0Qsb0NBQW9DO1lBQ3BDLE1BQU0sQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3RDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7SUFDSCxzREFBc0Q7QUFDeEQsQ0FBQyxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBUElHYXRld2F5UHJveHlFdmVudCwgQVBJR2F0ZXdheVByb3h5UmVzdWx0IH0gZnJvbSAnYXdzLWxhbWJkYSc7XG5pbXBvcnQgeyBoYW5kbGVyLCBjbGVhckNhY2hlIH0gZnJvbSAnLi4vLi4vbGFtYmRhL3BheW1lbnRzL2NyZWF0ZS1jaGVja291dC1zZXNzaW9uJztcbmltcG9ydCB7IG1vY2tDbGllbnQgfSBmcm9tICdhd3Mtc2RrLWNsaWVudC1tb2NrJztcbmltcG9ydCB7IFNTTUNsaWVudCwgR2V0UGFyYW1ldGVyQ29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zc20nO1xuaW1wb3J0IFN0cmlwZSBmcm9tICdzdHJpcGUnO1xuXG4vLyBDcmVhdGUgbW9jayBTdHJpcGUgaW5zdGFuY2VcbmNvbnN0IG1vY2tDcmVhdGUgPSBqZXN0LmZuKCk7XG5jb25zdCBtb2NrU3RyaXBlID0ge1xuICBjaGVja291dDoge1xuICAgIHNlc3Npb25zOiB7XG4gICAgICBjcmVhdGU6IG1vY2tDcmVhdGUsXG4gICAgfSxcbiAgfSxcbn07XG5cbi8vIE1vY2sgU3RyaXBlXG5qZXN0Lm1vY2soJ3N0cmlwZScsICgpID0+IHtcbiAgcmV0dXJuIGplc3QuZm4oKS5tb2NrSW1wbGVtZW50YXRpb24oKCkgPT4gbW9ja1N0cmlwZSk7XG59KTtcblxuY29uc3Qgc3NtTW9jayA9IG1vY2tDbGllbnQoU1NNQ2xpZW50KTtcblxuZGVzY3JpYmUoJ0NyZWF0ZSBDaGVja291dCBTZXNzaW9uIExhbWJkYScsICgpID0+IHtcbiAgY29uc3QgbW9ja1N0cmlwZUFwaUtleSA9ICdza190ZXN0X21vY2tfa2V5XzEyMyc7XG4gIGNvbnN0IG1vY2tVc2VySWQgPSAndGVzdC11c2VyLTEyMyc7XG4gIGNvbnN0IG1vY2tFbWFpbCA9ICd0ZXN0QGV4YW1wbGUuY29tJztcblxuICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICBqZXN0LmNsZWFyQWxsTW9ja3MoKTtcbiAgICBzc21Nb2NrLnJlc2V0KCk7XG4gICAgbW9ja0NyZWF0ZS5tb2NrUmVzZXQoKTtcblxuICAgIC8vIENsZWFyIExhbWJkYSBmdW5jdGlvbiBjYWNoZVxuICAgIGNsZWFyQ2FjaGUoKTtcblxuICAgIC8vIFNldHVwIFNTTSBtb2NrcyAtIGhhbmRsZSBib3RoIFN0cmlwZSBBUEkga2V5IGFuZCBhbGxvd2VkIHByaWNlIElEc1xuICAgIHNzbU1vY2tcbiAgICAgIC5vbihHZXRQYXJhbWV0ZXJDb21tYW5kLCB7XG4gICAgICAgIE5hbWU6ICcvYXVyYTI4L3Rlc3Qvc3RyaXBlL2FwaS1rZXknLFxuICAgICAgfSlcbiAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgIFBhcmFtZXRlcjoge1xuICAgICAgICAgIFZhbHVlOiBtb2NrU3RyaXBlQXBpS2V5LFxuICAgICAgICB9LFxuICAgICAgfSk7XG5cbiAgICBzc21Nb2NrXG4gICAgICAub24oR2V0UGFyYW1ldGVyQ29tbWFuZCwge1xuICAgICAgICBOYW1lOiAnL2F1cmEyOC90ZXN0L3N0cmlwZS9hbGxvd2VkLXByaWNlLWlkcycsXG4gICAgICB9KVxuICAgICAgLnJlc29sdmVzKHtcbiAgICAgICAgUGFyYW1ldGVyOiB7XG4gICAgICAgICAgVmFsdWU6ICdwcmljZV90ZXN0MTIzLHByaWNlX3Rlc3Q0NTYnLFxuICAgICAgICB9LFxuICAgICAgfSk7XG5cbiAgICAvLyBTZXR1cCBlbnZpcm9ubWVudCB2YXJpYWJsZXNcbiAgICBwcm9jZXNzLmVudi5TVFJJUEVfQVBJX0tFWV9QQVJBTUVURVJfTkFNRSA9ICcvYXVyYTI4L3Rlc3Qvc3RyaXBlL2FwaS1rZXknO1xuICAgIHByb2Nlc3MuZW52LkFMTE9XRURfUFJJQ0VfSURTX1BBUkFNRVRFUl9OQU1FID0gJy9hdXJhMjgvdGVzdC9zdHJpcGUvYWxsb3dlZC1wcmljZS1pZHMnO1xuICAgIHByb2Nlc3MuZW52LkFMTE9XRURfUFJJQ0VfSURTID0gJyc7IC8vIEVtcHR5IHRvIHRlc3QgU1NNIGZldGNoaW5nXG4gICAgcHJvY2Vzcy5lbnYuUFJJQ0VfSURfQ0FDSEVfVFRMX1NFQ09ORFMgPSAnMzAwJztcbiAgfSk7XG5cbiAgY29uc3QgY3JlYXRlTW9ja0V2ZW50ID0gKG92ZXJyaWRlczogUGFydGlhbDxBUElHYXRld2F5UHJveHlFdmVudD4gPSB7fSk6IEFQSUdhdGV3YXlQcm94eUV2ZW50ID0+XG4gICAgKHtcbiAgICAgIGh0dHBNZXRob2Q6ICdQT1NUJyxcbiAgICAgIHBhdGg6ICcvYXBpL3VzZXJzL3Rlc3QtdXNlci0xMjMvY2hlY2tvdXQtc2Vzc2lvbicsXG4gICAgICBwYXRoUGFyYW1ldGVyczoge1xuICAgICAgICB1c2VySWQ6IG1vY2tVc2VySWQsXG4gICAgICB9LFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgfSxcbiAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgIGF1dGhvcml6ZXI6IHtcbiAgICAgICAgICBjbGFpbXM6IHtcbiAgICAgICAgICAgIHN1YjogbW9ja1VzZXJJZCxcbiAgICAgICAgICAgIGVtYWlsOiBtb2NrRW1haWwsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0gYXMgdW5rbm93biBhcyBBUElHYXRld2F5UHJveHlFdmVudFsncmVxdWVzdENvbnRleHQnXSxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgc2Vzc2lvblR5cGU6ICdzdWJzY3JpcHRpb24nLFxuICAgICAgICBwcmljZUlkOiAncHJpY2VfdGVzdDEyMycsXG4gICAgICAgIHN1Y2Nlc3NVcmw6ICdodHRwczovL2V4YW1wbGUuY29tL3N1Y2Nlc3MnLFxuICAgICAgICBjYW5jZWxVcmw6ICdodHRwczovL2V4YW1wbGUuY29tL2NhbmNlbCcsXG4gICAgICB9KSxcbiAgICAgIC4uLm92ZXJyaWRlcyxcbiAgICB9KSBhcyBBUElHYXRld2F5UHJveHlFdmVudDtcblxuICBkZXNjcmliZSgnU3VjY2Vzc2Z1bCBzZXNzaW9uIGNyZWF0aW9uJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgY3JlYXRlIGEgc3Vic2NyaXB0aW9uIGNoZWNrb3V0IHNlc3Npb24gc3VjY2Vzc2Z1bGx5JywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgbW9ja1Nlc3Npb25JZCA9ICdjc190ZXN0X3Nlc3Npb24xMjMnO1xuICAgICAgY29uc3QgbW9ja1Nlc3Npb25VcmwgPSAnaHR0cHM6Ly9jaGVja291dC5zdHJpcGUuY29tL3Nlc3Npb24xMjMnO1xuXG4gICAgICAvLyBNb2NrIFN0cmlwZSBzZXNzaW9uIGNyZWF0aW9uXG4gICAgICBtb2NrQ3JlYXRlLm1vY2tSZXNvbHZlZFZhbHVlKHtcbiAgICAgICAgaWQ6IG1vY2tTZXNzaW9uSWQsXG4gICAgICAgIHVybDogbW9ja1Nlc3Npb25VcmwsXG4gICAgICB9IGFzIFN0cmlwZS5DaGVja291dC5TZXNzaW9uKTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoKTtcbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkpLnRvRXF1YWwoe1xuICAgICAgICBzZXNzaW9uSWQ6IG1vY2tTZXNzaW9uSWQsXG4gICAgICAgIHVybDogbW9ja1Nlc3Npb25VcmwsXG4gICAgICB9KTtcblxuICAgICAgLy8gVmVyaWZ5IFN0cmlwZSB3YXMgY2FsbGVkIHdpdGggY29ycmVjdCBwYXJhbWV0ZXJzXG4gICAgICBleHBlY3QobW9ja0NyZWF0ZSkudG9IYXZlQmVlbkNhbGxlZFdpdGgoXG4gICAgICAgIGV4cGVjdC5vYmplY3RDb250YWluaW5nKHtcbiAgICAgICAgICBtb2RlOiAnc3Vic2NyaXB0aW9uJyxcbiAgICAgICAgICBwYXltZW50X21ldGhvZF90eXBlczogWydjYXJkJ10sXG4gICAgICAgICAgbGluZV9pdGVtczogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBwcmljZTogJ3ByaWNlX3Rlc3QxMjMnLFxuICAgICAgICAgICAgICBxdWFudGl0eTogMSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgXSxcbiAgICAgICAgICBzdWNjZXNzX3VybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vc3VjY2VzcycsXG4gICAgICAgICAgY2FuY2VsX3VybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vY2FuY2VsJyxcbiAgICAgICAgICBjdXN0b21lcl9lbWFpbDogbW9ja0VtYWlsLFxuICAgICAgICAgIGNsaWVudF9yZWZlcmVuY2VfaWQ6IG1vY2tVc2VySWQsXG4gICAgICAgICAgbWV0YWRhdGE6IHtcbiAgICAgICAgICAgIHVzZXJJZDogbW9ja1VzZXJJZCxcbiAgICAgICAgICAgIHNlc3Npb25UeXBlOiAnc3Vic2NyaXB0aW9uJyxcbiAgICAgICAgICB9LFxuICAgICAgICB9KSxcbiAgICAgICk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGNyZWF0ZSBhIG9uZS10aW1lIHBheW1lbnQgc2Vzc2lvbiBzdWNjZXNzZnVsbHknLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBtb2NrU2Vzc2lvbklkID0gJ2NzX3Rlc3Rfc2Vzc2lvbjQ1Nic7XG4gICAgICBjb25zdCBtb2NrU2Vzc2lvblVybCA9ICdodHRwczovL2NoZWNrb3V0LnN0cmlwZS5jb20vc2Vzc2lvbjQ1Nic7XG5cbiAgICAgIC8vIE1vY2sgU3RyaXBlIHNlc3Npb24gY3JlYXRpb25cbiAgICAgIG1vY2tDcmVhdGUubW9ja1Jlc29sdmVkVmFsdWUoe1xuICAgICAgICBpZDogbW9ja1Nlc3Npb25JZCxcbiAgICAgICAgdXJsOiBtb2NrU2Vzc2lvblVybCxcbiAgICAgIH0gYXMgU3RyaXBlLkNoZWNrb3V0LlNlc3Npb24pO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCh7XG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBzZXNzaW9uVHlwZTogJ29uZS10aW1lJyxcbiAgICAgICAgICBzdWNjZXNzVXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9zdWNjZXNzJyxcbiAgICAgICAgICBjYW5jZWxVcmw6ICdodHRwczovL2V4YW1wbGUuY29tL2NhbmNlbCcsXG4gICAgICAgIH0pLFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkpLnRvRXF1YWwoe1xuICAgICAgICBzZXNzaW9uSWQ6IG1vY2tTZXNzaW9uSWQsXG4gICAgICAgIHVybDogbW9ja1Nlc3Npb25VcmwsXG4gICAgICB9KTtcblxuICAgICAgLy8gVmVyaWZ5IGRlZmF1bHQgcHJpY2UgZGF0YSB3YXMgdXNlZCBmb3Igb25lLXRpbWUgcGF5bWVudFxuICAgICAgZXhwZWN0KG1vY2tDcmVhdGUpLnRvSGF2ZUJlZW5DYWxsZWRXaXRoKFxuICAgICAgICBleHBlY3Qub2JqZWN0Q29udGFpbmluZyh7XG4gICAgICAgICAgbW9kZTogJ3BheW1lbnQnLFxuICAgICAgICAgIGxpbmVfaXRlbXM6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgcHJpY2VfZGF0YToge1xuICAgICAgICAgICAgICAgIGN1cnJlbmN5OiAndXNkJyxcbiAgICAgICAgICAgICAgICBwcm9kdWN0X2RhdGE6IHtcbiAgICAgICAgICAgICAgICAgIG5hbWU6ICdBdXJhMjggUmVhZGluZycsXG4gICAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ09uZS10aW1lIGFzdHJvbG9naWNhbCByZWFkaW5nJyxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHVuaXRfYW1vdW50OiAyOTAwLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICBxdWFudGl0eTogMSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgXSxcbiAgICAgICAgfSksXG4gICAgICApO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnQXV0aG9yaXphdGlvbiBmYWlsdXJlcycsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIHJldHVybiA0MDEgd2hlbiBhdXRob3JpemF0aW9uIGlzIG1pc3NpbmcnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCh7XG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7fSBhcyB1bmtub3duIGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50WydyZXF1ZXN0Q29udGV4dCddLFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSg0MDEpO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmUoJ1VuYXV0aG9yaXplZCcpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gNDAzIHdoZW4gdXNlciB0cmllcyB0byBjcmVhdGUgc2Vzc2lvbiBmb3IgYW5vdGhlciB1c2VyJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoe1xuICAgICAgICBwYXRoUGFyYW1ldGVyczoge1xuICAgICAgICAgIHVzZXJJZDogJ2RpZmZlcmVudC11c2VyLTQ1NicsXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDQwMyk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5lcnJvcikudG9CZSgnRm9yYmlkZGVuJyk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdJbnZhbGlkIHJlcXVlc3QgaGFuZGxpbmcnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gNDAwIGZvciBtaXNzaW5nIHVzZXJJZCBwYXJhbWV0ZXInLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCh7XG4gICAgICAgIHBhdGhQYXJhbWV0ZXJzOiB7fSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoNDAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LmVycm9yKS50b0JlKCdNaXNzaW5nIHVzZXJJZCBwYXJhbWV0ZXInKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgcmV0dXJuIDQwMCBmb3IgbWlzc2luZyByZXF1ZXN0IGJvZHknLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCh7XG4gICAgICAgIGJvZHk6IG51bGwsXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDQwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5lcnJvcikudG9CZSgnTWlzc2luZyByZXF1ZXN0IGJvZHknKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgcmV0dXJuIDQwMCBmb3IgaW52YWxpZCBKU09OIGluIHJlcXVlc3QgYm9keScsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KHtcbiAgICAgICAgYm9keTogJ2ludmFsaWQganNvbicsXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDQwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5lcnJvcikudG9CZSgnSW52YWxpZCBKU09OIGluIHJlcXVlc3QgYm9keScpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gNDAwIGZvciBpbnZhbGlkIHNlc3Npb25UeXBlJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoe1xuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgc2Vzc2lvblR5cGU6ICdpbnZhbGlkJyxcbiAgICAgICAgICBzdWNjZXNzVXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9zdWNjZXNzJyxcbiAgICAgICAgICBjYW5jZWxVcmw6ICdodHRwczovL2V4YW1wbGUuY29tL2NhbmNlbCcsXG4gICAgICAgIH0pLFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSg0MDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmUoXG4gICAgICAgICdJbnZhbGlkIG9yIG1pc3Npbmcgc2Vzc2lvblR5cGUuIE11c3QgYmUgXCJzdWJzY3JpcHRpb25cIiBvciBcIm9uZS10aW1lXCInLFxuICAgICAgKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgcmV0dXJuIDQwMCBmb3IgbWlzc2luZyBVUkxzJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoe1xuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgc2Vzc2lvblR5cGU6ICdzdWJzY3JpcHRpb24nLFxuICAgICAgICAgIHByaWNlSWQ6ICdwcmljZV90ZXN0MTIzJyxcbiAgICAgICAgfSksXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDQwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5lcnJvcikudG9CZSgnTWlzc2luZyBzdWNjZXNzVXJsIG9yIGNhbmNlbFVybCcpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gNDAwIGZvciBpbnZhbGlkIFVSTHMnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCh7XG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBzZXNzaW9uVHlwZTogJ3N1YnNjcmlwdGlvbicsXG4gICAgICAgICAgcHJpY2VJZDogJ3ByaWNlX3Rlc3QxMjMnLFxuICAgICAgICAgIHN1Y2Nlc3NVcmw6ICdub3QtYS11cmwnLFxuICAgICAgICAgIGNhbmNlbFVybDogJy9yZWxhdGl2ZS9wYXRoJyxcbiAgICAgICAgfSksXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDQwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5lcnJvcikudG9CZSgnSW52YWxpZCBzdWNjZXNzVXJsIG9yIGNhbmNlbFVybC4gTXVzdCBiZSBhYnNvbHV0ZSBVUkxzJyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHJldHVybiA0MDAgZm9yIG1pc3NpbmcgcHJpY2VJZCBpbiBzdWJzY3JpcHRpb24nLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCh7XG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBzZXNzaW9uVHlwZTogJ3N1YnNjcmlwdGlvbicsXG4gICAgICAgICAgc3VjY2Vzc1VybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vc3VjY2VzcycsXG4gICAgICAgICAgY2FuY2VsVXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9jYW5jZWwnLFxuICAgICAgICB9KSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoNDAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LmVycm9yKS50b0JlKCdwcmljZUlkIGlzIHJlcXVpcmVkIGZvciBzdWJzY3JpcHRpb24gc2Vzc2lvbnMnKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgcmV0dXJuIDQwMCBmb3IgZGlzYWxsb3dlZCBwcmljZSBJRCcsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KHtcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIHNlc3Npb25UeXBlOiAnc3Vic2NyaXB0aW9uJyxcbiAgICAgICAgICBwcmljZUlkOiAncHJpY2Vfbm90X2FsbG93ZWQnLFxuICAgICAgICAgIHN1Y2Nlc3NVcmw6ICdodHRwczovL2V4YW1wbGUuY29tL3N1Y2Nlc3MnLFxuICAgICAgICAgIGNhbmNlbFVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vY2FuY2VsJyxcbiAgICAgICAgfSksXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDQwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5lcnJvcikudG9CZSgnSW52YWxpZCBwcmljZSBJRCcpO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnU3RyaXBlIEFQSSBlcnJvciBoYW5kbGluZycsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBTdHJpcGUgQVBJIGVycm9ycyBncmFjZWZ1bGx5JywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3Qgc3RyaXBlRXJyb3IgPSB7XG4gICAgICAgIG1lc3NhZ2U6ICdJbnZhbGlkIEFQSSBrZXknLFxuICAgICAgICBzdGF0dXNDb2RlOiA0MDEsXG4gICAgICAgIHR5cGU6ICdTdHJpcGVBdXRoZW50aWNhdGlvbkVycm9yJyxcbiAgICAgIH07XG4gICAgICBtb2NrQ3JlYXRlLm1vY2tSZWplY3RlZFZhbHVlKHN0cmlwZUVycm9yKTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoKTtcbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSg0MDEpO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmUoJ0ludmFsaWQgQVBJIGtleScpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBub3QgZXhwb3NlIHNlbnNpdGl2ZSBTdHJpcGUgZXJyb3JzJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3Qgc3RyaXBlRXJyb3IgPSB7XG4gICAgICAgIG1lc3NhZ2U6ICdJbnRlcm5hbCBTdHJpcGUgZXJyb3Igd2l0aCBzZW5zaXRpdmUgZGF0YScsXG4gICAgICAgIHN0YXR1c0NvZGU6IDUwMCxcbiAgICAgICAgdHlwZTogJ1N0cmlwZUFQSUVycm9yJyxcbiAgICAgIH07XG4gICAgICBtb2NrQ3JlYXRlLm1vY2tSZWplY3RlZFZhbHVlKHN0cmlwZUVycm9yKTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoKTtcbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSg1MDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmUoJ1BheW1lbnQgcHJvY2Vzc2luZyBlcnJvcicpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgZ2VuZXJpYyBlcnJvcnMgd2l0aG91dCBTdHJpcGUgcHJvcGVydGllcycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGdlbmVyaWNFcnJvciA9IG5ldyBFcnJvcignVW5rbm93biBlcnJvcicpO1xuICAgICAgbW9ja0NyZWF0ZS5tb2NrUmVqZWN0ZWRWYWx1ZShnZW5lcmljRXJyb3IpO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCgpO1xuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDUwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5lcnJvcikudG9CZSgnSW50ZXJuYWwgc2VydmVyIGVycm9yJyk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdTU00gcGFyYW1ldGVyIGVycm9ycycsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBtaXNzaW5nIFNTTSBwYXJhbWV0ZXInLCBhc3luYyAoKSA9PiB7XG4gICAgICBzc21Nb2NrLm9uKEdldFBhcmFtZXRlckNvbW1hbmQpLnJlamVjdHMobmV3IEVycm9yKCdQYXJhbWV0ZXIgbm90IGZvdW5kJykpO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCgpO1xuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDUwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5lcnJvcikudG9CZSgnSW50ZXJuYWwgc2VydmVyIGVycm9yJyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBlbXB0eSBTU00gcGFyYW1ldGVyIHZhbHVlJywgYXN5bmMgKCkgPT4ge1xuICAgICAgc3NtTW9jay5vbihHZXRQYXJhbWV0ZXJDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIFBhcmFtZXRlcjoge1xuICAgICAgICAgIFZhbHVlOiAnJyxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCgpO1xuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDUwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5lcnJvcikudG9CZSgnSW50ZXJuYWwgc2VydmVyIGVycm9yJyk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdBZGRpdGlvbmFsIGVkZ2UgY2FzZXMnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgb25lLXRpbWUgcGF5bWVudCB3aXRoIHNwZWNpZmljIHByaWNlSWQnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBtb2NrU2Vzc2lvbklkID0gJ2NzX3Rlc3Rfc2Vzc2lvbjc4OSc7XG4gICAgICBjb25zdCBtb2NrU2Vzc2lvblVybCA9ICdodHRwczovL2NoZWNrb3V0LnN0cmlwZS5jb20vc2Vzc2lvbjc4OSc7XG5cbiAgICAgIG1vY2tDcmVhdGUubW9ja1Jlc29sdmVkVmFsdWUoe1xuICAgICAgICBpZDogbW9ja1Nlc3Npb25JZCxcbiAgICAgICAgdXJsOiBtb2NrU2Vzc2lvblVybCxcbiAgICAgIH0gYXMgU3RyaXBlLkNoZWNrb3V0LlNlc3Npb24pO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCh7XG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBzZXNzaW9uVHlwZTogJ29uZS10aW1lJyxcbiAgICAgICAgICBwcmljZUlkOiAncHJpY2VfdGVzdDEyMycsXG4gICAgICAgICAgc3VjY2Vzc1VybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vc3VjY2VzcycsXG4gICAgICAgICAgY2FuY2VsVXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9jYW5jZWwnLFxuICAgICAgICB9KSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5KS50b0VxdWFsKHtcbiAgICAgICAgc2Vzc2lvbklkOiBtb2NrU2Vzc2lvbklkLFxuICAgICAgICB1cmw6IG1vY2tTZXNzaW9uVXJsLFxuICAgICAgfSk7XG5cbiAgICAgIGV4cGVjdChtb2NrQ3JlYXRlKS50b0hhdmVCZWVuQ2FsbGVkV2l0aChcbiAgICAgICAgZXhwZWN0Lm9iamVjdENvbnRhaW5pbmcoe1xuICAgICAgICAgIG1vZGU6ICdwYXltZW50JyxcbiAgICAgICAgICBsaW5lX2l0ZW1zOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIHByaWNlOiAncHJpY2VfdGVzdDEyMycsXG4gICAgICAgICAgICAgIHF1YW50aXR5OiAxLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICBdLFxuICAgICAgICB9KSxcbiAgICAgICk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGluY2x1ZGUgY3VzdG9tIG1ldGFkYXRhIGluIHNlc3Npb24gY3JlYXRpb24nLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBtb2NrU2Vzc2lvbklkID0gJ2NzX3Rlc3RfbWV0YWRhdGEnO1xuICAgICAgY29uc3QgbW9ja1Nlc3Npb25VcmwgPSAnaHR0cHM6Ly9jaGVja291dC5zdHJpcGUuY29tL21ldGFkYXRhJztcblxuICAgICAgbW9ja0NyZWF0ZS5tb2NrUmVzb2x2ZWRWYWx1ZSh7XG4gICAgICAgIGlkOiBtb2NrU2Vzc2lvbklkLFxuICAgICAgICB1cmw6IG1vY2tTZXNzaW9uVXJsLFxuICAgICAgfSBhcyBTdHJpcGUuQ2hlY2tvdXQuU2Vzc2lvbik7XG5cbiAgICAgIGNvbnN0IGN1c3RvbU1ldGFkYXRhID0ge1xuICAgICAgICBjYW1wYWlnbjogJ3N1bW1lcjIwMjQnLFxuICAgICAgICByZWZlcnJlcjogJ25ld3NsZXR0ZXInLFxuICAgICAgfTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoe1xuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgc2Vzc2lvblR5cGU6ICdzdWJzY3JpcHRpb24nLFxuICAgICAgICAgIHByaWNlSWQ6ICdwcmljZV90ZXN0MTIzJyxcbiAgICAgICAgICBzdWNjZXNzVXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9zdWNjZXNzJyxcbiAgICAgICAgICBjYW5jZWxVcmw6ICdodHRwczovL2V4YW1wbGUuY29tL2NhbmNlbCcsXG4gICAgICAgICAgbWV0YWRhdGE6IGN1c3RvbU1ldGFkYXRhLFxuICAgICAgICB9KSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIGV4cGVjdChtb2NrQ3JlYXRlKS50b0hhdmVCZWVuQ2FsbGVkV2l0aChcbiAgICAgICAgZXhwZWN0Lm9iamVjdENvbnRhaW5pbmcoe1xuICAgICAgICAgIG1ldGFkYXRhOiBleHBlY3Qub2JqZWN0Q29udGFpbmluZyh7XG4gICAgICAgICAgICB1c2VySWQ6IG1vY2tVc2VySWQsXG4gICAgICAgICAgICBzZXNzaW9uVHlwZTogJ3N1YnNjcmlwdGlvbicsXG4gICAgICAgICAgICAuLi5jdXN0b21NZXRhZGF0YSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgfSksXG4gICAgICApO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCB1c2UgY3VzdG9tZXIgZW1haWwgZnJvbSByZXF1ZXN0IHdoZW4gcHJvdmlkZWQnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBtb2NrU2Vzc2lvbklkID0gJ2NzX3Rlc3RfZW1haWwnO1xuICAgICAgY29uc3QgbW9ja1Nlc3Npb25VcmwgPSAnaHR0cHM6Ly9jaGVja291dC5zdHJpcGUuY29tL2VtYWlsJztcbiAgICAgIGNvbnN0IGN1c3RvbUVtYWlsID0gJ2N1c3RvbUBleGFtcGxlLmNvbSc7XG5cbiAgICAgIG1vY2tDcmVhdGUubW9ja1Jlc29sdmVkVmFsdWUoe1xuICAgICAgICBpZDogbW9ja1Nlc3Npb25JZCxcbiAgICAgICAgdXJsOiBtb2NrU2Vzc2lvblVybCxcbiAgICAgIH0gYXMgU3RyaXBlLkNoZWNrb3V0LlNlc3Npb24pO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCh7XG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBzZXNzaW9uVHlwZTogJ3N1YnNjcmlwdGlvbicsXG4gICAgICAgICAgcHJpY2VJZDogJ3ByaWNlX3Rlc3QxMjMnLFxuICAgICAgICAgIHN1Y2Nlc3NVcmw6ICdodHRwczovL2V4YW1wbGUuY29tL3N1Y2Nlc3MnLFxuICAgICAgICAgIGNhbmNlbFVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vY2FuY2VsJyxcbiAgICAgICAgICBjdXN0b21lckVtYWlsOiBjdXN0b21FbWFpbCxcbiAgICAgICAgfSksXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBleHBlY3QobW9ja0NyZWF0ZSkudG9IYXZlQmVlbkNhbGxlZFdpdGgoXG4gICAgICAgIGV4cGVjdC5vYmplY3RDb250YWluaW5nKHtcbiAgICAgICAgICBjdXN0b21lcl9lbWFpbDogY3VzdG9tRW1haWwsXG4gICAgICAgIH0pLFxuICAgICAgKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIG1pc3Npbmcgc2Vzc2lvblR5cGUgZ3JhY2VmdWxseScsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KHtcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIHByaWNlSWQ6ICdwcmljZV90ZXN0MTIzJyxcbiAgICAgICAgICBzdWNjZXNzVXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9zdWNjZXNzJyxcbiAgICAgICAgICBjYW5jZWxVcmw6ICdodHRwczovL2V4YW1wbGUuY29tL2NhbmNlbCcsXG4gICAgICAgIH0pLFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSg0MDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQ29udGFpbignc2Vzc2lvblR5cGUnKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIHBhdGhQYXJhbWV0ZXJzIGJlaW5nIG51bGwnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCh7XG4gICAgICAgIHBhdGhQYXJhbWV0ZXJzOiBudWxsLFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSg0MDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmUoJ01pc3NpbmcgdXNlcklkIHBhcmFtZXRlcicpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgYXV0aG9yaXplciBjb250ZXh0IGJlaW5nIG51bGwnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCh7XG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjogbnVsbCxcbiAgICAgICAgfSBhcyB1bmtub3duIGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50WydyZXF1ZXN0Q29udGV4dCddLFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSg0MDEpO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmUoJ1VuYXV0aG9yaXplZCcpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgZW1wdHkgYWxsb3dlZCBwcmljZSBJRHMgZW52aXJvbm1lbnQgdmFyaWFibGUnLCBhc3luYyAoKSA9PiB7XG4gICAgICAvLyBSZXNldCBTU00gbW9jayB0byByZXR1cm4gZW1wdHkgdmFsdWUgZm9yIHByaWNlIElEc1xuICAgICAgc3NtTW9jay5yZXNldCgpO1xuICAgICAgc3NtTW9ja1xuICAgICAgICAub24oR2V0UGFyYW1ldGVyQ29tbWFuZCwge1xuICAgICAgICAgIE5hbWU6ICcvYXVyYTI4L3Rlc3Qvc3RyaXBlL2FwaS1rZXknLFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoe1xuICAgICAgICAgIFBhcmFtZXRlcjoge1xuICAgICAgICAgICAgVmFsdWU6IG1vY2tTdHJpcGVBcGlLZXksXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgIHNzbU1vY2tcbiAgICAgICAgLm9uKEdldFBhcmFtZXRlckNvbW1hbmQsIHtcbiAgICAgICAgICBOYW1lOiAnL2F1cmEyOC90ZXN0L3N0cmlwZS9hbGxvd2VkLXByaWNlLWlkcycsXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgUGFyYW1ldGVyOiB7XG4gICAgICAgICAgICBWYWx1ZTogJycsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgIGRlbGV0ZSBwcm9jZXNzLmVudi5BTExPV0VEX1BSSUNFX0lEUztcblxuICAgICAgY29uc3QgbW9ja1Nlc3Npb25JZCA9ICdjc190ZXN0X25vX2FsbG93bGlzdCc7XG4gICAgICBjb25zdCBtb2NrU2Vzc2lvblVybCA9ICdodHRwczovL2NoZWNrb3V0LnN0cmlwZS5jb20vbm9fYWxsb3dsaXN0JztcblxuICAgICAgbW9ja0NyZWF0ZS5tb2NrUmVzb2x2ZWRWYWx1ZSh7XG4gICAgICAgIGlkOiBtb2NrU2Vzc2lvbklkLFxuICAgICAgICB1cmw6IG1vY2tTZXNzaW9uVXJsLFxuICAgICAgfSBhcyBTdHJpcGUuQ2hlY2tvdXQuU2Vzc2lvbik7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KHtcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIHNlc3Npb25UeXBlOiAnc3Vic2NyaXB0aW9uJyxcbiAgICAgICAgICBwcmljZUlkOiAnYW55X3ByaWNlX2lkJyxcbiAgICAgICAgICBzdWNjZXNzVXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9zdWNjZXNzJyxcbiAgICAgICAgICBjYW5jZWxVcmw6ICdodHRwczovL2V4YW1wbGUuY29tL2NhbmNlbCcsXG4gICAgICAgIH0pLFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIC8vIFNob3VsZCBzdWNjZWVkIHNpbmNlIG5vIGFsbG93bGlzdCBpcyBjb25maWd1cmVkXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LnNlc3Npb25JZCkudG9CZShtb2NrU2Vzc2lvbklkKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ1NTTS1iYXNlZCBhbGxvd2VkIHByaWNlIElEcycsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGZldGNoIGFsbG93ZWQgcHJpY2UgSURzIGZyb20gU1NNIHN1Y2Nlc3NmdWxseScsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IG1vY2tTZXNzaW9uSWQgPSAnY3NfdGVzdF9zc20nO1xuICAgICAgY29uc3QgbW9ja1Nlc3Npb25VcmwgPSAnaHR0cHM6Ly9jaGVja291dC5zdHJpcGUuY29tL3NzbSc7XG5cbiAgICAgIG1vY2tDcmVhdGUubW9ja1Jlc29sdmVkVmFsdWUoe1xuICAgICAgICBpZDogbW9ja1Nlc3Npb25JZCxcbiAgICAgICAgdXJsOiBtb2NrU2Vzc2lvblVybCxcbiAgICAgIH0gYXMgU3RyaXBlLkNoZWNrb3V0LlNlc3Npb24pO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCh7XG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBzZXNzaW9uVHlwZTogJ3N1YnNjcmlwdGlvbicsXG4gICAgICAgICAgcHJpY2VJZDogJ3ByaWNlX3Rlc3QxMjMnLFxuICAgICAgICAgIHN1Y2Nlc3NVcmw6ICdodHRwczovL2V4YW1wbGUuY29tL3N1Y2Nlc3MnLFxuICAgICAgICAgIGNhbmNlbFVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vY2FuY2VsJyxcbiAgICAgICAgfSksXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICAvLyBWZXJpZnkgU1NNIHdhcyBjYWxsZWQgKGl0J3MgY2FsbGVkIGZvciBib3RoIEFQSSBrZXkgYW5kIHByaWNlIElEcylcbiAgICAgIGNvbnN0IHNzbUNhbGxzID0gc3NtTW9jay5jYWxscygpO1xuICAgICAgZXhwZWN0KHNzbUNhbGxzLmxlbmd0aCkudG9CZUdyZWF0ZXJUaGFuT3JFcXVhbCgxKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgY2FjaGUgYWxsb3dlZCBwcmljZSBJRHMgYWNyb3NzIG11bHRpcGxlIGludm9jYXRpb25zJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgbW9ja1Nlc3Npb25JZCA9ICdjc190ZXN0X2NhY2hlJztcbiAgICAgIGNvbnN0IG1vY2tTZXNzaW9uVXJsID0gJ2h0dHBzOi8vY2hlY2tvdXQuc3RyaXBlLmNvbS9jYWNoZSc7XG5cbiAgICAgIG1vY2tDcmVhdGUubW9ja1Jlc29sdmVkVmFsdWUoe1xuICAgICAgICBpZDogbW9ja1Nlc3Npb25JZCxcbiAgICAgICAgdXJsOiBtb2NrU2Vzc2lvblVybCxcbiAgICAgIH0gYXMgU3RyaXBlLkNoZWNrb3V0LlNlc3Npb24pO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCgpO1xuXG4gICAgICAvLyBGaXJzdCBpbnZvY2F0aW9uXG4gICAgICBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcbiAgICAgIGNvbnN0IHNzbUNhbGxzQWZ0ZXJGaXJzdCA9IHNzbU1vY2suY2FsbHMoKS5sZW5ndGg7XG5cbiAgICAgIC8vIFNlY29uZCBpbnZvY2F0aW9uIChzaG91bGQgdXNlIGNhY2hlZCB2YWx1ZSlcbiAgICAgIGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuICAgICAgY29uc3Qgc3NtQ2FsbHNBZnRlclNlY29uZCA9IHNzbU1vY2suY2FsbHMoKS5sZW5ndGg7XG5cbiAgICAgIC8vIFNTTSBzaG91bGQgbm90IGJlIGNhbGxlZCBhZ2FpbiBmb3IgYWxsb3dlZCBwcmljZSBJRHMgKG9ubHkgZm9yIFN0cmlwZSBBUEkga2V5IGlmIG5vdCBjYWNoZWQpXG4gICAgICAvLyBUaGUgZGlmZmVyZW5jZSBzaG91bGQgYmUgbWluaW1hbCAoMCBvciAxIGNhbGwgZm9yIFN0cmlwZSBBUEkga2V5KVxuICAgICAgZXhwZWN0KHNzbUNhbGxzQWZ0ZXJTZWNvbmQgLSBzc21DYWxsc0FmdGVyRmlyc3QpLnRvQmVMZXNzVGhhbk9yRXF1YWwoMSk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGZhbGwgYmFjayB0byBlbnZpcm9ubWVudCB2YXJpYWJsZSB3aGVuIFNTTSBmYWlscycsIGFzeW5jICgpID0+IHtcbiAgICAgIC8vIFJlc2V0IG1vY2tzIHRvIHNpbXVsYXRlIFNTTSBmYWlsdXJlIGZvciBhbGxvd2VkIHByaWNlIElEc1xuICAgICAgc3NtTW9jay5yZXNldCgpO1xuICAgICAgc3NtTW9ja1xuICAgICAgICAub24oR2V0UGFyYW1ldGVyQ29tbWFuZCwge1xuICAgICAgICAgIE5hbWU6ICcvYXVyYTI4L3Rlc3Qvc3RyaXBlL2FwaS1rZXknLFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoe1xuICAgICAgICAgIFBhcmFtZXRlcjoge1xuICAgICAgICAgICAgVmFsdWU6IG1vY2tTdHJpcGVBcGlLZXksXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgIC8vIFNpbXVsYXRlIFNTTSBmYWlsdXJlIGZvciBhbGxvd2VkIHByaWNlIElEc1xuICAgICAgc3NtTW9ja1xuICAgICAgICAub24oR2V0UGFyYW1ldGVyQ29tbWFuZCwge1xuICAgICAgICAgIE5hbWU6ICcvYXVyYTI4L3Rlc3Qvc3RyaXBlL2FsbG93ZWQtcHJpY2UtaWRzJyxcbiAgICAgICAgfSlcbiAgICAgICAgLnJlamVjdHMobmV3IEVycm9yKCdQYXJhbWV0ZXIgbm90IGZvdW5kJykpO1xuXG4gICAgICAvLyBTZXQgZmFsbGJhY2sgZW52aXJvbm1lbnQgdmFyaWFibGUgLSB1c2luZyB0ZXN0MTIzIHdoaWNoIGlzIGFscmVhZHkgaW4gdGhlIG1vY2sgc2V0dXBcbiAgICAgIHByb2Nlc3MuZW52LkFMTE9XRURfUFJJQ0VfSURTID0gJ3ByaWNlX3Rlc3QxMjMscHJpY2VfdGVzdDQ1Nic7XG5cbiAgICAgIGNvbnN0IG1vY2tTZXNzaW9uSWQgPSAnY3NfdGVzdF9mYWxsYmFjayc7XG4gICAgICBjb25zdCBtb2NrU2Vzc2lvblVybCA9ICdodHRwczovL2NoZWNrb3V0LnN0cmlwZS5jb20vZmFsbGJhY2snO1xuXG4gICAgICBtb2NrQ3JlYXRlLm1vY2tSZXNvbHZlZFZhbHVlKHtcbiAgICAgICAgaWQ6IG1vY2tTZXNzaW9uSWQsXG4gICAgICAgIHVybDogbW9ja1Nlc3Npb25VcmwsXG4gICAgICB9IGFzIFN0cmlwZS5DaGVja291dC5TZXNzaW9uKTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoe1xuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgc2Vzc2lvblR5cGU6ICdzdWJzY3JpcHRpb24nLFxuICAgICAgICAgIHByaWNlSWQ6ICdwcmljZV90ZXN0MTIzJyxcbiAgICAgICAgICBzdWNjZXNzVXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9zdWNjZXNzJyxcbiAgICAgICAgICBjYW5jZWxVcmw6ICdodHRwczovL2V4YW1wbGUuY29tL2NhbmNlbCcsXG4gICAgICAgIH0pLFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuc2Vzc2lvbklkKS50b0JlKG1vY2tTZXNzaW9uSWQpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgZW1wdHkgU1NNIHBhcmFtZXRlciB2YWx1ZScsIGFzeW5jICgpID0+IHtcbiAgICAgIC8vIFJlc2V0IG1vY2tzXG4gICAgICBzc21Nb2NrLnJlc2V0KCk7XG4gICAgICBzc21Nb2NrXG4gICAgICAgIC5vbihHZXRQYXJhbWV0ZXJDb21tYW5kLCB7XG4gICAgICAgICAgTmFtZTogJy9hdXJhMjgvdGVzdC9zdHJpcGUvYXBpLWtleScsXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgUGFyYW1ldGVyOiB7XG4gICAgICAgICAgICBWYWx1ZTogbW9ja1N0cmlwZUFwaUtleSxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgLy8gUmV0dXJuIGVtcHR5IHZhbHVlIGZvciBhbGxvd2VkIHByaWNlIElEc1xuICAgICAgc3NtTW9ja1xuICAgICAgICAub24oR2V0UGFyYW1ldGVyQ29tbWFuZCwge1xuICAgICAgICAgIE5hbWU6ICcvYXVyYTI4L3Rlc3Qvc3RyaXBlL2FsbG93ZWQtcHJpY2UtaWRzJyxcbiAgICAgICAgfSlcbiAgICAgICAgLnJlc29sdmVzKHtcbiAgICAgICAgICBQYXJhbWV0ZXI6IHtcbiAgICAgICAgICAgIFZhbHVlOiAnJyxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgY29uc3QgbW9ja1Nlc3Npb25JZCA9ICdjc190ZXN0X2VtcHR5JztcbiAgICAgIGNvbnN0IG1vY2tTZXNzaW9uVXJsID0gJ2h0dHBzOi8vY2hlY2tvdXQuc3RyaXBlLmNvbS9lbXB0eSc7XG5cbiAgICAgIG1vY2tDcmVhdGUubW9ja1Jlc29sdmVkVmFsdWUoe1xuICAgICAgICBpZDogbW9ja1Nlc3Npb25JZCxcbiAgICAgICAgdXJsOiBtb2NrU2Vzc2lvblVybCxcbiAgICAgIH0gYXMgU3RyaXBlLkNoZWNrb3V0LlNlc3Npb24pO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCgpO1xuXG4gICAgICAvLyBTaG91bGQgc3VjY2VlZCB3aGVuIG5vIHByaWNlIElEcyBhcmUgY29uZmlndXJlZCAoZW1wdHkgYXJyYXkgbWVhbnMgbm8gdmFsaWRhdGlvbilcbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgbWFsZm9ybWVkIHByaWNlIElEIGxpc3QgaW4gU1NNJywgYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gUmVzZXQgbW9ja3NcbiAgICAgIHNzbU1vY2sucmVzZXQoKTtcbiAgICAgIHNzbU1vY2tcbiAgICAgICAgLm9uKEdldFBhcmFtZXRlckNvbW1hbmQsIHtcbiAgICAgICAgICBOYW1lOiAnL2F1cmEyOC90ZXN0L3N0cmlwZS9hcGkta2V5JyxcbiAgICAgICAgfSlcbiAgICAgICAgLnJlc29sdmVzKHtcbiAgICAgICAgICBQYXJhbWV0ZXI6IHtcbiAgICAgICAgICAgIFZhbHVlOiBtb2NrU3RyaXBlQXBpS2V5LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICAvLyBSZXR1cm4gbWFsZm9ybWVkIHZhbHVlIHdpdGggZXh0cmEgY29tbWFzIGFuZCBzcGFjZXNcbiAgICAgIHNzbU1vY2tcbiAgICAgICAgLm9uKEdldFBhcmFtZXRlckNvbW1hbmQsIHtcbiAgICAgICAgICBOYW1lOiAnL2F1cmEyOC90ZXN0L3N0cmlwZS9hbGxvd2VkLXByaWNlLWlkcycsXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgUGFyYW1ldGVyOiB7XG4gICAgICAgICAgICBWYWx1ZTogJ3ByaWNlX3Rlc3QxMjMsICAscHJpY2VfdGVzdDQ1NiwsLCcsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IG1vY2tTZXNzaW9uSWQgPSAnY3NfdGVzdF9tYWxmb3JtZWQnO1xuICAgICAgY29uc3QgbW9ja1Nlc3Npb25VcmwgPSAnaHR0cHM6Ly9jaGVja291dC5zdHJpcGUuY29tL21hbGZvcm1lZCc7XG5cbiAgICAgIG1vY2tDcmVhdGUubW9ja1Jlc29sdmVkVmFsdWUoe1xuICAgICAgICBpZDogbW9ja1Nlc3Npb25JZCxcbiAgICAgICAgdXJsOiBtb2NrU2Vzc2lvblVybCxcbiAgICAgIH0gYXMgU3RyaXBlLkNoZWNrb3V0LlNlc3Npb24pO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCh7XG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBzZXNzaW9uVHlwZTogJ3N1YnNjcmlwdGlvbicsXG4gICAgICAgICAgcHJpY2VJZDogJ3ByaWNlX3Rlc3Q0NTYnLFxuICAgICAgICAgIHN1Y2Nlc3NVcmw6ICdodHRwczovL2V4YW1wbGUuY29tL3N1Y2Nlc3MnLFxuICAgICAgICAgIGNhbmNlbFVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vY2FuY2VsJyxcbiAgICAgICAgfSksXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5zZXNzaW9uSWQpLnRvQmUobW9ja1Nlc3Npb25JZCk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHJlamVjdCBkaXNhbGxvd2VkIHByaWNlIElEIGZvciBvbmUtdGltZSBwYXltZW50JywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoe1xuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgc2Vzc2lvblR5cGU6ICdvbmUtdGltZScsXG4gICAgICAgICAgcHJpY2VJZDogJ3ByaWNlX25vdF9hbGxvd2VkJyxcbiAgICAgICAgICBzdWNjZXNzVXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9zdWNjZXNzJyxcbiAgICAgICAgICBjYW5jZWxVcmw6ICdodHRwczovL2V4YW1wbGUuY29tL2NhbmNlbCcsXG4gICAgICAgIH0pLFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSg0MDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkuZXJyb3IpLnRvQmUoJ0ludmFsaWQgcHJpY2UgSUQnKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgYWxsb3cgb25lLXRpbWUgcGF5bWVudCB3aXRob3V0IHByaWNlIElEIHdoZW4gZHluYW1pYyBwcmljaW5nIGlzIHVzZWQnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBtb2NrU2Vzc2lvbklkID0gJ2NzX3Rlc3RfZHluYW1pYyc7XG4gICAgICBjb25zdCBtb2NrU2Vzc2lvblVybCA9ICdodHRwczovL2NoZWNrb3V0LnN0cmlwZS5jb20vZHluYW1pYyc7XG5cbiAgICAgIG1vY2tDcmVhdGUubW9ja1Jlc29sdmVkVmFsdWUoe1xuICAgICAgICBpZDogbW9ja1Nlc3Npb25JZCxcbiAgICAgICAgdXJsOiBtb2NrU2Vzc2lvblVybCxcbiAgICAgIH0gYXMgU3RyaXBlLkNoZWNrb3V0LlNlc3Npb24pO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCh7XG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBzZXNzaW9uVHlwZTogJ29uZS10aW1lJyxcbiAgICAgICAgICBzdWNjZXNzVXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9zdWNjZXNzJyxcbiAgICAgICAgICBjYW5jZWxVcmw6ICdodHRwczovL2V4YW1wbGUuY29tL2NhbmNlbCcsXG4gICAgICAgIH0pLFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgZXhwZWN0KG1vY2tDcmVhdGUpLnRvSGF2ZUJlZW5DYWxsZWRXaXRoKFxuICAgICAgICBleHBlY3Qub2JqZWN0Q29udGFpbmluZyh7XG4gICAgICAgICAgbGluZV9pdGVtczogW1xuICAgICAgICAgICAgZXhwZWN0Lm9iamVjdENvbnRhaW5pbmcoe1xuICAgICAgICAgICAgICBwcmljZV9kYXRhOiBleHBlY3Qub2JqZWN0Q29udGFpbmluZyh7XG4gICAgICAgICAgICAgICAgY3VycmVuY3k6ICd1c2QnLFxuICAgICAgICAgICAgICAgIHVuaXRfYW1vdW50OiAyOTAwLFxuICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIF0sXG4gICAgICAgIH0pLFxuICAgICAgKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgLyogZXNsaW50LWRpc2FibGUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueSAqL1xuICBkZXNjcmliZSgnU1NNIGNhY2hpbmcgbWVjaGFuaXNtJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgcmVzcGVjdCBjYWNoZSBUVEwgZnJvbSBlbnZpcm9ubWVudCB2YXJpYWJsZScsIGFzeW5jICgpID0+IHtcbiAgICAgIC8vIFNldCBjdXN0b20gVFRMXG4gICAgICBwcm9jZXNzLmVudi5QUklDRV9JRF9DQUNIRV9UVExfU0VDT05EUyA9ICcxJzsgLy8gMSBzZWNvbmQgZm9yIGZhc3RlciB0ZXN0XG5cbiAgICAgIGNvbnN0IG1vY2tTZXNzaW9uSWQgPSAnY3NfdGVzdF90dGwnO1xuICAgICAgY29uc3QgbW9ja1Nlc3Npb25VcmwgPSAnaHR0cHM6Ly9jaGVja291dC5zdHJpcGUuY29tL3R0bCc7XG5cbiAgICAgIG1vY2tDcmVhdGUubW9ja1Jlc29sdmVkVmFsdWUoe1xuICAgICAgICBpZDogbW9ja1Nlc3Npb25JZCxcbiAgICAgICAgdXJsOiBtb2NrU2Vzc2lvblVybCxcbiAgICAgIH0gYXMgU3RyaXBlLkNoZWNrb3V0LlNlc3Npb24pO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCgpO1xuXG4gICAgICAvLyBGaXJzdCBpbnZvY2F0aW9uIC0gc2hvdWxkIGNhbGwgU1NNXG4gICAgICBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcbiAgICAgIGNvbnN0IGluaXRpYWxTc21DYWxscyA9IHNzbU1vY2suY2FsbHMoKS5maWx0ZXIoXG4gICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICAgIChjYWxsOiBhbnkpID0+IGNhbGwuYXJnc1swXS5pbnB1dC5OYW1lID09PSAnL2F1cmEyOC90ZXN0L3N0cmlwZS9hbGxvd2VkLXByaWNlLWlkcycsXG4gICAgICApLmxlbmd0aDtcblxuICAgICAgLy8gQ2xlYXIgY2FjaGUgdG8gc2ltdWxhdGUgbmV3IExhbWJkYSBjb2xkIHN0YXJ0XG4gICAgICBjbGVhckNhY2hlKCk7XG5cbiAgICAgIC8vIFNlY29uZCBpbnZvY2F0aW9uIGFmdGVyIGNhY2hlIGNsZWFyIC0gc2hvdWxkIGNhbGwgU1NNIGFnYWluXG4gICAgICBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcbiAgICAgIGNvbnN0IGFmdGVyQ2FjaGVDbGVhckNhbGxzID0gc3NtTW9jay5jYWxscygpLmZpbHRlcihcbiAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgICAgKGNhbGw6IGFueSkgPT4gY2FsbC5hcmdzWzBdLmlucHV0Lk5hbWUgPT09ICcvYXVyYTI4L3Rlc3Qvc3RyaXBlL2FsbG93ZWQtcHJpY2UtaWRzJyxcbiAgICAgICkubGVuZ3RoO1xuXG4gICAgICAvLyBTaG91bGQgaGF2ZSBjYWxsZWQgU1NNIGFnYWluIGFmdGVyIGNhY2hlIGNsZWFyXG4gICAgICBleHBlY3QoYWZ0ZXJDYWNoZUNsZWFyQ2FsbHMpLnRvQmVHcmVhdGVyVGhhbihpbml0aWFsU3NtQ2FsbHMpO1xuICAgIH0sIDEwMDAwKTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIFNTTSBwYXJhbWV0ZXIgbm90IGV4aXN0aW5nIGdyYWNlZnVsbHknLCBhc3luYyAoKSA9PiB7XG4gICAgICAvLyBSZXNldCBtb2Nrc1xuICAgICAgc3NtTW9jay5yZXNldCgpO1xuICAgICAgc3NtTW9ja1xuICAgICAgICAub24oR2V0UGFyYW1ldGVyQ29tbWFuZCwge1xuICAgICAgICAgIE5hbWU6ICcvYXVyYTI4L3Rlc3Qvc3RyaXBlL2FwaS1rZXknLFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoe1xuICAgICAgICAgIFBhcmFtZXRlcjoge1xuICAgICAgICAgICAgVmFsdWU6IG1vY2tTdHJpcGVBcGlLZXksXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgIC8vIFNpbXVsYXRlIHBhcmFtZXRlciBkb2Vzbid0IGV4aXN0IChyZXR1cm5zIHVuZGVmaW5lZClcbiAgICAgIHNzbU1vY2tcbiAgICAgICAgLm9uKEdldFBhcmFtZXRlckNvbW1hbmQsIHtcbiAgICAgICAgICBOYW1lOiAnL2F1cmEyOC90ZXN0L3N0cmlwZS9hbGxvd2VkLXByaWNlLWlkcycsXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgUGFyYW1ldGVyOiB1bmRlZmluZWQsXG4gICAgICAgIH0pO1xuXG4gICAgICAvLyBBbHNvIGNsZWFyIGVudmlyb25tZW50IHZhcmlhYmxlXG4gICAgICBkZWxldGUgcHJvY2Vzcy5lbnYuQUxMT1dFRF9QUklDRV9JRFM7XG5cbiAgICAgIGNvbnN0IG1vY2tTZXNzaW9uSWQgPSAnY3NfdGVzdF9ub19wYXJhbSc7XG4gICAgICBjb25zdCBtb2NrU2Vzc2lvblVybCA9ICdodHRwczovL2NoZWNrb3V0LnN0cmlwZS5jb20vbm9fcGFyYW0nO1xuXG4gICAgICBtb2NrQ3JlYXRlLm1vY2tSZXNvbHZlZFZhbHVlKHtcbiAgICAgICAgaWQ6IG1vY2tTZXNzaW9uSWQsXG4gICAgICAgIHVybDogbW9ja1Nlc3Npb25VcmwsXG4gICAgICB9IGFzIFN0cmlwZS5DaGVja291dC5TZXNzaW9uKTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoe1xuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgc2Vzc2lvblR5cGU6ICdvbmUtdGltZScsXG4gICAgICAgICAgc3VjY2Vzc1VybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vc3VjY2VzcycsXG4gICAgICAgICAgY2FuY2VsVXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9jYW5jZWwnLFxuICAgICAgICB9KSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICAvLyBTaG91bGQgc3VjY2VlZCB3aXRoIG5vIHByaWNlIHZhbGlkYXRpb24gd2hlbiBubyBjb25maWcgZXhpc3RzXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIFNTTSByZXR1cm5pbmcgbnVsbCBwYXJhbWV0ZXIgZ3JhY2VmdWxseScsIGFzeW5jICgpID0+IHtcbiAgICAgIC8vIFJlc2V0IG1vY2tzXG4gICAgICBzc21Nb2NrLnJlc2V0KCk7XG4gICAgICBzc21Nb2NrXG4gICAgICAgIC5vbihHZXRQYXJhbWV0ZXJDb21tYW5kLCB7XG4gICAgICAgICAgTmFtZTogJy9hdXJhMjgvdGVzdC9zdHJpcGUvYXBpLWtleScsXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgUGFyYW1ldGVyOiB7XG4gICAgICAgICAgICBWYWx1ZTogbW9ja1N0cmlwZUFwaUtleSxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgLy8gU2ltdWxhdGUgU1NNIHJldHVybnMgbnVsbCBwYXJhbWV0ZXJcbiAgICAgIHNzbU1vY2tcbiAgICAgICAgLm9uKEdldFBhcmFtZXRlckNvbW1hbmQsIHtcbiAgICAgICAgICBOYW1lOiAnL2F1cmEyOC90ZXN0L3N0cmlwZS9hbGxvd2VkLXByaWNlLWlkcycsXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgICAgICBQYXJhbWV0ZXI6IG51bGwgYXMgYW55LFxuICAgICAgICB9KTtcblxuICAgICAgY29uc3QgbW9ja1Nlc3Npb25JZCA9ICdjc190ZXN0X251bGxfcGFyYW0nO1xuICAgICAgY29uc3QgbW9ja1Nlc3Npb25VcmwgPSAnaHR0cHM6Ly9jaGVja291dC5zdHJpcGUuY29tL251bGxfcGFyYW0nO1xuXG4gICAgICBtb2NrQ3JlYXRlLm1vY2tSZXNvbHZlZFZhbHVlKHtcbiAgICAgICAgaWQ6IG1vY2tTZXNzaW9uSWQsXG4gICAgICAgIHVybDogbW9ja1Nlc3Npb25VcmwsXG4gICAgICB9IGFzIFN0cmlwZS5DaGVja291dC5TZXNzaW9uKTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoe1xuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgc2Vzc2lvblR5cGU6ICdvbmUtdGltZScsXG4gICAgICAgICAgc3VjY2Vzc1VybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vc3VjY2VzcycsXG4gICAgICAgICAgY2FuY2VsVXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9jYW5jZWwnLFxuICAgICAgICB9KSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICAvLyBTaG91bGQgc3VjY2VlZCB3aXRoIGRlZmF1bHQgcHJpY2UgZGF0YVxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGNhY2hlIGVtcHR5IGFycmF5cyB3aGVuIG5vIHByaWNlIElEcyBjb25maWd1cmVkJywgYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gQ2xlYXIgZW52aXJvbm1lbnQgdmFyaWFibGVzXG4gICAgICBkZWxldGUgcHJvY2Vzcy5lbnYuQUxMT1dFRF9QUklDRV9JRFM7XG4gICAgICBkZWxldGUgcHJvY2Vzcy5lbnYuQUxMT1dFRF9QUklDRV9JRFNfUEFSQU1FVEVSX05BTUU7XG5cbiAgICAgIGNvbnN0IG1vY2tTZXNzaW9uSWQgPSAnY3NfdGVzdF9jYWNoZV9lbXB0eSc7XG4gICAgICBjb25zdCBtb2NrU2Vzc2lvblVybCA9ICdodHRwczovL2NoZWNrb3V0LnN0cmlwZS5jb20vY2FjaGVfZW1wdHknO1xuXG4gICAgICBtb2NrQ3JlYXRlLm1vY2tSZXNvbHZlZFZhbHVlKHtcbiAgICAgICAgaWQ6IG1vY2tTZXNzaW9uSWQsXG4gICAgICAgIHVybDogbW9ja1Nlc3Npb25VcmwsXG4gICAgICB9IGFzIFN0cmlwZS5DaGVja291dC5TZXNzaW9uKTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoe1xuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgc2Vzc2lvblR5cGU6ICdvbmUtdGltZScsXG4gICAgICAgICAgc3VjY2Vzc1VybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vc3VjY2VzcycsXG4gICAgICAgICAgY2FuY2VsVXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9jYW5jZWwnLFxuICAgICAgICB9KSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBGaXJzdCBjYWxsXG4gICAgICBjb25zdCBmaXJzdFJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuICAgICAgY29uc3QgZmlyc3RDYWxsU3NtQ291bnQgPSBzc21Nb2NrLmNhbGxzKCkubGVuZ3RoO1xuXG4gICAgICAvLyBTZWNvbmQgY2FsbCAtIHNob3VsZCBub3QgZmV0Y2ggU1NNIGFnYWluIGR1ZSB0byBjYWNoaW5nXG4gICAgICBjb25zdCBzZWNvbmRSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcbiAgICAgIGNvbnN0IHNlY29uZENhbGxTc21Db3VudCA9IHNzbU1vY2suY2FsbHMoKS5sZW5ndGg7XG5cbiAgICAgIC8vIFNob3VsZCBub3QgaGF2ZSBtYWRlIGFkZGl0aW9uYWwgU1NNIGNhbGxzXG4gICAgICBleHBlY3Qoc2Vjb25kQ2FsbFNzbUNvdW50IC0gZmlyc3RDYWxsU3NtQ291bnQpLnRvQmVMZXNzVGhhbk9yRXF1YWwoMSk7XG4gICAgICBleHBlY3QoZmlyc3RSZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgZXhwZWN0KHNlY29uZFJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSB3aGl0ZXNwYWNlLW9ubHkgcHJpY2UgSURzIGluIFNTTScsIGFzeW5jICgpID0+IHtcbiAgICAgIC8vIFJlc2V0IG1vY2tzXG4gICAgICBzc21Nb2NrLnJlc2V0KCk7XG4gICAgICBzc21Nb2NrXG4gICAgICAgIC5vbihHZXRQYXJhbWV0ZXJDb21tYW5kLCB7XG4gICAgICAgICAgTmFtZTogJy9hdXJhMjgvdGVzdC9zdHJpcGUvYXBpLWtleScsXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgUGFyYW1ldGVyOiB7XG4gICAgICAgICAgICBWYWx1ZTogbW9ja1N0cmlwZUFwaUtleSxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgLy8gUmV0dXJuIHdoaXRlc3BhY2Utb25seSB2YWx1ZVxuICAgICAgc3NtTW9ja1xuICAgICAgICAub24oR2V0UGFyYW1ldGVyQ29tbWFuZCwge1xuICAgICAgICAgIE5hbWU6ICcvYXVyYTI4L3Rlc3Qvc3RyaXBlL2FsbG93ZWQtcHJpY2UtaWRzJyxcbiAgICAgICAgfSlcbiAgICAgICAgLnJlc29sdmVzKHtcbiAgICAgICAgICBQYXJhbWV0ZXI6IHtcbiAgICAgICAgICAgIFZhbHVlOiAnICAgLCAgLCAgICcsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IG1vY2tTZXNzaW9uSWQgPSAnY3NfdGVzdF93aGl0ZXNwYWNlJztcbiAgICAgIGNvbnN0IG1vY2tTZXNzaW9uVXJsID0gJ2h0dHBzOi8vY2hlY2tvdXQuc3RyaXBlLmNvbS93aGl0ZXNwYWNlJztcblxuICAgICAgbW9ja0NyZWF0ZS5tb2NrUmVzb2x2ZWRWYWx1ZSh7XG4gICAgICAgIGlkOiBtb2NrU2Vzc2lvbklkLFxuICAgICAgICB1cmw6IG1vY2tTZXNzaW9uVXJsLFxuICAgICAgfSBhcyBTdHJpcGUuQ2hlY2tvdXQuU2Vzc2lvbik7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KHtcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIHNlc3Npb25UeXBlOiAnb25lLXRpbWUnLFxuICAgICAgICAgIHN1Y2Nlc3NVcmw6ICdodHRwczovL2V4YW1wbGUuY29tL3N1Y2Nlc3MnLFxuICAgICAgICAgIGNhbmNlbFVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vY2FuY2VsJyxcbiAgICAgICAgfSksXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgLy8gU2hvdWxkIHN1Y2NlZWQgYXMgZW1wdHkgcHJpY2UgSUQgbGlzdCBtZWFucyBubyB2YWxpZGF0aW9uXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIHZlcnkgbG9uZyBwcmljZSBJRCBsaXN0cyBlZmZpY2llbnRseScsIGFzeW5jICgpID0+IHtcbiAgICAgIC8vIFJlc2V0IG1vY2tzXG4gICAgICBzc21Nb2NrLnJlc2V0KCk7XG4gICAgICBzc21Nb2NrXG4gICAgICAgIC5vbihHZXRQYXJhbWV0ZXJDb21tYW5kLCB7XG4gICAgICAgICAgTmFtZTogJy9hdXJhMjgvdGVzdC9zdHJpcGUvYXBpLWtleScsXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgUGFyYW1ldGVyOiB7XG4gICAgICAgICAgICBWYWx1ZTogbW9ja1N0cmlwZUFwaUtleSxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgLy8gQ3JlYXRlIGEgbG9uZyBsaXN0IG9mIHByaWNlIElEc1xuICAgICAgY29uc3QgbG9uZ1ByaWNlSWRMaXN0ID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogMTAwIH0sIChfLCBpKSA9PiBgcHJpY2VfdGVzdCR7aX1gKS5qb2luKCcsJyk7XG5cbiAgICAgIHNzbU1vY2tcbiAgICAgICAgLm9uKEdldFBhcmFtZXRlckNvbW1hbmQsIHtcbiAgICAgICAgICBOYW1lOiAnL2F1cmEyOC90ZXN0L3N0cmlwZS9hbGxvd2VkLXByaWNlLWlkcycsXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgUGFyYW1ldGVyOiB7XG4gICAgICAgICAgICBWYWx1ZTogbG9uZ1ByaWNlSWRMaXN0LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICBjb25zdCBtb2NrU2Vzc2lvbklkID0gJ2NzX3Rlc3RfbG9uZ19saXN0JztcbiAgICAgIGNvbnN0IG1vY2tTZXNzaW9uVXJsID0gJ2h0dHBzOi8vY2hlY2tvdXQuc3RyaXBlLmNvbS9sb25nX2xpc3QnO1xuXG4gICAgICBtb2NrQ3JlYXRlLm1vY2tSZXNvbHZlZFZhbHVlKHtcbiAgICAgICAgaWQ6IG1vY2tTZXNzaW9uSWQsXG4gICAgICAgIHVybDogbW9ja1Nlc3Npb25VcmwsXG4gICAgICB9IGFzIFN0cmlwZS5DaGVja291dC5TZXNzaW9uKTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoe1xuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgc2Vzc2lvblR5cGU6ICdzdWJzY3JpcHRpb24nLFxuICAgICAgICAgIHByaWNlSWQ6ICdwcmljZV90ZXN0NTAnLFxuICAgICAgICAgIHN1Y2Nlc3NVcmw6ICdodHRwczovL2V4YW1wbGUuY29tL3N1Y2Nlc3MnLFxuICAgICAgICAgIGNhbmNlbFVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vY2FuY2VsJyxcbiAgICAgICAgfSksXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5zZXNzaW9uSWQpLnRvQmUobW9ja1Nlc3Npb25JZCk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBTU00gdGhyb3R0bGluZyBlcnJvcnMgZ3JhY2VmdWxseScsIGFzeW5jICgpID0+IHtcbiAgICAgIC8vIFJlc2V0IG1vY2tzXG4gICAgICBzc21Nb2NrLnJlc2V0KCk7XG4gICAgICBzc21Nb2NrXG4gICAgICAgIC5vbihHZXRQYXJhbWV0ZXJDb21tYW5kLCB7XG4gICAgICAgICAgTmFtZTogJy9hdXJhMjgvdGVzdC9zdHJpcGUvYXBpLWtleScsXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgUGFyYW1ldGVyOiB7XG4gICAgICAgICAgICBWYWx1ZTogbW9ja1N0cmlwZUFwaUtleSxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgLy8gU2ltdWxhdGUgdGhyb3R0bGluZyBlcnJvclxuICAgICAgY29uc3QgdGhyb3R0bGluZ0Vycm9yID0gbmV3IEVycm9yKCdSYXRlIGV4Y2VlZGVkJyk7XG4gICAgICB0aHJvdHRsaW5nRXJyb3IubmFtZSA9ICdUaHJvdHRsaW5nRXhjZXB0aW9uJztcblxuICAgICAgc3NtTW9ja1xuICAgICAgICAub24oR2V0UGFyYW1ldGVyQ29tbWFuZCwge1xuICAgICAgICAgIE5hbWU6ICcvYXVyYTI4L3Rlc3Qvc3RyaXBlL2FsbG93ZWQtcHJpY2UtaWRzJyxcbiAgICAgICAgfSlcbiAgICAgICAgLnJlamVjdHModGhyb3R0bGluZ0Vycm9yKTtcblxuICAgICAgLy8gU2V0IGZhbGxiYWNrXG4gICAgICBwcm9jZXNzLmVudi5BTExPV0VEX1BSSUNFX0lEUyA9ICdwcmljZV90ZXN0MTIzJztcblxuICAgICAgY29uc3QgbW9ja1Nlc3Npb25JZCA9ICdjc190ZXN0X3Rocm90dGxlJztcbiAgICAgIGNvbnN0IG1vY2tTZXNzaW9uVXJsID0gJ2h0dHBzOi8vY2hlY2tvdXQuc3RyaXBlLmNvbS90aHJvdHRsZSc7XG5cbiAgICAgIG1vY2tDcmVhdGUubW9ja1Jlc29sdmVkVmFsdWUoe1xuICAgICAgICBpZDogbW9ja1Nlc3Npb25JZCxcbiAgICAgICAgdXJsOiBtb2NrU2Vzc2lvblVybCxcbiAgICAgIH0gYXMgU3RyaXBlLkNoZWNrb3V0LlNlc3Npb24pO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCgpO1xuXG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICAvLyBTaG91bGQgZmFsbCBiYWNrIHRvIGVudmlyb25tZW50IHZhcmlhYmxlXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgdmFsaWRhdGUgcHJpY2UgSURzIGFyZSB0cmltbWVkIGNvcnJlY3RseScsIGFzeW5jICgpID0+IHtcbiAgICAgIC8vIFJlc2V0IG1vY2tzXG4gICAgICBzc21Nb2NrLnJlc2V0KCk7XG4gICAgICBzc21Nb2NrXG4gICAgICAgIC5vbihHZXRQYXJhbWV0ZXJDb21tYW5kLCB7XG4gICAgICAgICAgTmFtZTogJy9hdXJhMjgvdGVzdC9zdHJpcGUvYXBpLWtleScsXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgUGFyYW1ldGVyOiB7XG4gICAgICAgICAgICBWYWx1ZTogbW9ja1N0cmlwZUFwaUtleSxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgLy8gUHJpY2UgSURzIHdpdGggdmFyaW91cyB3aGl0ZXNwYWNlXG4gICAgICBzc21Nb2NrXG4gICAgICAgIC5vbihHZXRQYXJhbWV0ZXJDb21tYW5kLCB7XG4gICAgICAgICAgTmFtZTogJy9hdXJhMjgvdGVzdC9zdHJpcGUvYWxsb3dlZC1wcmljZS1pZHMnLFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoe1xuICAgICAgICAgIFBhcmFtZXRlcjoge1xuICAgICAgICAgICAgVmFsdWU6ICcgcHJpY2VfdGVzdDEyMyAsIHByaWNlX3Rlc3Q0NTYgJyxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgY29uc3QgbW9ja1Nlc3Npb25JZCA9ICdjc190ZXN0X3RyaW0nO1xuICAgICAgY29uc3QgbW9ja1Nlc3Npb25VcmwgPSAnaHR0cHM6Ly9jaGVja291dC5zdHJpcGUuY29tL3RyaW0nO1xuXG4gICAgICBtb2NrQ3JlYXRlLm1vY2tSZXNvbHZlZFZhbHVlKHtcbiAgICAgICAgaWQ6IG1vY2tTZXNzaW9uSWQsXG4gICAgICAgIHVybDogbW9ja1Nlc3Npb25VcmwsXG4gICAgICB9IGFzIFN0cmlwZS5DaGVja291dC5TZXNzaW9uKTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoe1xuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgc2Vzc2lvblR5cGU6ICdzdWJzY3JpcHRpb24nLFxuICAgICAgICAgIHByaWNlSWQ6ICdwcmljZV90ZXN0MTIzJywgLy8gV2l0aG91dCBzcGFjZXNcbiAgICAgICAgICBzdWNjZXNzVXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9zdWNjZXNzJyxcbiAgICAgICAgICBjYW5jZWxVcmw6ICdodHRwczovL2V4YW1wbGUuY29tL2NhbmNlbCcsXG4gICAgICAgIH0pLFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgc2VxdWVudGlhbCByZXF1ZXN0cyB3aXRoIGNhY2hlIHByb3Blcmx5JywgYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gQ2xlYXIgY2FjaGUgYW5kIHJlc2V0IG1vY2tzIGZvciBjbGVhbiB0ZXN0XG4gICAgICBjbGVhckNhY2hlKCk7XG4gICAgICBzc21Nb2NrLnJlc2V0KCk7XG5cbiAgICAgIC8vIFNldHVwIFNTTSBtb2Nrc1xuICAgICAgc3NtTW9ja1xuICAgICAgICAub24oR2V0UGFyYW1ldGVyQ29tbWFuZCwge1xuICAgICAgICAgIE5hbWU6ICcvYXVyYTI4L3Rlc3Qvc3RyaXBlL2FwaS1rZXknLFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoe1xuICAgICAgICAgIFBhcmFtZXRlcjoge1xuICAgICAgICAgICAgVmFsdWU6IG1vY2tTdHJpcGVBcGlLZXksXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgIHNzbU1vY2tcbiAgICAgICAgLm9uKEdldFBhcmFtZXRlckNvbW1hbmQsIHtcbiAgICAgICAgICBOYW1lOiAnL2F1cmEyOC90ZXN0L3N0cmlwZS9hbGxvd2VkLXByaWNlLWlkcycsXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgUGFyYW1ldGVyOiB7XG4gICAgICAgICAgICBWYWx1ZTogJ3ByaWNlX3Rlc3QxMjMscHJpY2VfdGVzdDQ1NicsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IG1vY2tTZXNzaW9uSWQgPSAnY3NfdGVzdF9zZXF1ZW50aWFsJztcbiAgICAgIGNvbnN0IG1vY2tTZXNzaW9uVXJsID0gJ2h0dHBzOi8vY2hlY2tvdXQuc3RyaXBlLmNvbS9zZXF1ZW50aWFsJztcblxuICAgICAgbW9ja0NyZWF0ZS5tb2NrUmVzb2x2ZWRWYWx1ZSh7XG4gICAgICAgIGlkOiBtb2NrU2Vzc2lvbklkLFxuICAgICAgICB1cmw6IG1vY2tTZXNzaW9uVXJsLFxuICAgICAgfSBhcyBTdHJpcGUuQ2hlY2tvdXQuU2Vzc2lvbik7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KCk7XG5cbiAgICAgIC8vIEZpcnN0IHJlcXVlc3QgLSBzaG91bGQgZmV0Y2ggZnJvbSBTU01cbiAgICAgIGNvbnN0IHJlc3VsdDEgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcbiAgICAgIGV4cGVjdChyZXN1bHQxLnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcblxuICAgICAgY29uc3Qgc3NtQ2FsbHNBZnRlckZpcnN0ID0gc3NtTW9jay5jYWxscygpLmZpbHRlcihcbiAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgICAgKGNhbGw6IGFueSkgPT4gY2FsbC5hcmdzWzBdLmlucHV0Lk5hbWUgPT09ICcvYXVyYTI4L3Rlc3Qvc3RyaXBlL2FsbG93ZWQtcHJpY2UtaWRzJyxcbiAgICAgICkubGVuZ3RoO1xuXG4gICAgICAvLyBTZXF1ZW50aWFsIHJlcXVlc3RzIC0gc2hvdWxkIHVzZSBjYWNoZVxuICAgICAgY29uc3QgcmVzdWx0MiA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuICAgICAgY29uc3QgcmVzdWx0MyA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0Mi5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBleHBlY3QocmVzdWx0My5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG5cbiAgICAgIGNvbnN0IHNzbUNhbGxzQWZ0ZXJBbGwgPSBzc21Nb2NrLmNhbGxzKCkuZmlsdGVyKFxuICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgICAoY2FsbDogYW55KSA9PiBjYWxsLmFyZ3NbMF0uaW5wdXQuTmFtZSA9PT0gJy9hdXJhMjgvdGVzdC9zdHJpcGUvYWxsb3dlZC1wcmljZS1pZHMnLFxuICAgICAgKS5sZW5ndGg7XG5cbiAgICAgIC8vIFNob3VsZCBvbmx5IGhhdmUgY2FsbGVkIFNTTSBvbmNlIGZvciBwcmljZSBJRHMgKGNhY2hlIGlzIHdvcmtpbmcpXG4gICAgICBleHBlY3Qoc3NtQ2FsbHNBZnRlckFsbCkudG9CZShzc21DYWxsc0FmdGVyRmlyc3QpO1xuICAgICAgZXhwZWN0KHNzbUNhbGxzQWZ0ZXJGaXJzdCkudG9CZSgxKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgdXNlIGRlZmF1bHQgVFRMIHdoZW4gZW52aXJvbm1lbnQgdmFyaWFibGUgaXMgbm90IHNldCcsIGFzeW5jICgpID0+IHtcbiAgICAgIC8vIFJlbW92ZSBUVEwgZW52aXJvbm1lbnQgdmFyaWFibGVcbiAgICAgIGRlbGV0ZSBwcm9jZXNzLmVudi5QUklDRV9JRF9DQUNIRV9UVExfU0VDT05EUztcblxuICAgICAgY29uc3QgbW9ja1Nlc3Npb25JZCA9ICdjc190ZXN0X2RlZmF1bHRfdHRsJztcbiAgICAgIGNvbnN0IG1vY2tTZXNzaW9uVXJsID0gJ2h0dHBzOi8vY2hlY2tvdXQuc3RyaXBlLmNvbS9kZWZhdWx0X3R0bCc7XG5cbiAgICAgIG1vY2tDcmVhdGUubW9ja1Jlc29sdmVkVmFsdWUoe1xuICAgICAgICBpZDogbW9ja1Nlc3Npb25JZCxcbiAgICAgICAgdXJsOiBtb2NrU2Vzc2lvblVybCxcbiAgICAgIH0gYXMgU3RyaXBlLkNoZWNrb3V0LlNlc3Npb24pO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCgpO1xuXG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICAvLyBTaG91bGQgc3VjY2VlZCB3aXRoIGRlZmF1bHQgVFRMICgzMDAgc2Vjb25kcylcbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgaW52YWxpZCBUVEwgdmFsdWVzIGdyYWNlZnVsbHknLCBhc3luYyAoKSA9PiB7XG4gICAgICAvLyBTZXQgaW52YWxpZCBUVExcbiAgICAgIHByb2Nlc3MuZW52LlBSSUNFX0lEX0NBQ0hFX1RUTF9TRUNPTkRTID0gJ2ludmFsaWQnO1xuXG4gICAgICBjb25zdCBtb2NrU2Vzc2lvbklkID0gJ2NzX3Rlc3RfaW52YWxpZF90dGwnO1xuICAgICAgY29uc3QgbW9ja1Nlc3Npb25VcmwgPSAnaHR0cHM6Ly9jaGVja291dC5zdHJpcGUuY29tL2ludmFsaWRfdHRsJztcblxuICAgICAgbW9ja0NyZWF0ZS5tb2NrUmVzb2x2ZWRWYWx1ZSh7XG4gICAgICAgIGlkOiBtb2NrU2Vzc2lvbklkLFxuICAgICAgICB1cmw6IG1vY2tTZXNzaW9uVXJsLFxuICAgICAgfSBhcyBTdHJpcGUuQ2hlY2tvdXQuU2Vzc2lvbik7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KCk7XG5cbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIC8vIFNob3VsZCBzdWNjZWVkIHVzaW5nIGZhbGxiYWNrIFRUTFxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgfSk7XG4gIH0pO1xuICAvKiBlc2xpbnQtZW5hYmxlIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnkgKi9cbn0pO1xuIl19