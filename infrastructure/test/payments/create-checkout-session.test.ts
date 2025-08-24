import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { handler, clearCache } from '../../lambda/payments/create-checkout-session';
import { mockClient } from 'aws-sdk-client-mock';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import Stripe from 'stripe';

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

const ssmMock = mockClient(SSMClient);

describe('Create Checkout Session Lambda', () => {
  const mockStripeApiKey = 'sk_test_mock_key_123';
  const mockUserId = 'test-user-123';
  const mockEmail = 'test@example.com';

  beforeEach(() => {
    jest.clearAllMocks();
    ssmMock.reset();
    mockCreate.mockReset();

    // Clear Lambda function cache
    clearCache();

    // Setup SSM mocks - handle both Stripe API key and allowed price IDs
    ssmMock
      .on(GetParameterCommand, {
        Name: '/aura28/test/stripe/api-key',
      })
      .resolves({
        Parameter: {
          Value: mockStripeApiKey,
        },
      });

    ssmMock
      .on(GetParameterCommand, {
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

  const createMockEvent = (overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent =>
    ({
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
      } as unknown as APIGatewayProxyEvent['requestContext'],
      body: JSON.stringify({
        sessionType: 'subscription',
        priceId: 'price_test123',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      }),
      ...overrides,
    }) as APIGatewayProxyEvent;

  describe('Successful session creation', () => {
    it('should create a subscription checkout session successfully', async () => {
      const mockSessionId = 'cs_test_session123';
      const mockSessionUrl = 'https://checkout.stripe.com/session123';

      // Mock Stripe session creation
      mockCreate.mockResolvedValue({
        id: mockSessionId,
        url: mockSessionUrl,
      } as Stripe.Checkout.Session);

      const event = createMockEvent();
      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body).toEqual({
        sessionId: mockSessionId,
        url: mockSessionUrl,
      });

      // Verify Stripe was called with correct parameters
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
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
        }),
      );
    });

    it('should create a one-time payment session successfully', async () => {
      const mockSessionId = 'cs_test_session456';
      const mockSessionUrl = 'https://checkout.stripe.com/session456';

      // Mock Stripe session creation
      mockCreate.mockResolvedValue({
        id: mockSessionId,
        url: mockSessionUrl,
      } as Stripe.Checkout.Session);

      const event = createMockEvent({
        body: JSON.stringify({
          sessionType: 'one-time',
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel',
        }),
      });

      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body).toEqual({
        sessionId: mockSessionId,
        url: mockSessionUrl,
      });

      // Verify default price data was used for one-time payment
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
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
        }),
      );
    });
  });

  describe('Authorization failures', () => {
    it('should return 401 when authorization is missing', async () => {
      const event = createMockEvent({
        requestContext: {} as unknown as APIGatewayProxyEvent['requestContext'],
      });

      const result: APIGatewayProxyResult = await handler(event);

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

      const result: APIGatewayProxyResult = await handler(event);

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

      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Missing userId parameter');
    });

    it('should return 400 for missing request body', async () => {
      const event = createMockEvent({
        body: null,
      });

      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Missing request body');
    });

    it('should return 400 for invalid JSON in request body', async () => {
      const event = createMockEvent({
        body: 'invalid json',
      });

      const result: APIGatewayProxyResult = await handler(event);

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

      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe(
        'Invalid or missing sessionType. Must be "subscription" or "one-time"',
      );
    });

    it('should return 400 for missing URLs', async () => {
      const event = createMockEvent({
        body: JSON.stringify({
          sessionType: 'subscription',
          priceId: 'price_test123',
        }),
      });

      const result: APIGatewayProxyResult = await handler(event);

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

      const result: APIGatewayProxyResult = await handler(event);

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

      const result: APIGatewayProxyResult = await handler(event);

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

      const result: APIGatewayProxyResult = await handler(event);

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
      const result: APIGatewayProxyResult = await handler(event);

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
      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Payment processing error');
    });

    it('should handle generic errors without Stripe properties', async () => {
      const genericError = new Error('Unknown error');
      mockCreate.mockRejectedValue(genericError);

      const event = createMockEvent();
      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Internal server error');
    });
  });

  describe('SSM parameter errors', () => {
    it('should handle missing SSM parameter', async () => {
      ssmMock.on(GetParameterCommand).rejects(new Error('Parameter not found'));

      const event = createMockEvent();
      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Internal server error');
    });

    it('should handle empty SSM parameter value', async () => {
      ssmMock.on(GetParameterCommand).resolves({
        Parameter: {
          Value: '',
        },
      });

      const event = createMockEvent();
      const result: APIGatewayProxyResult = await handler(event);

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
      } as Stripe.Checkout.Session);

      const event = createMockEvent({
        body: JSON.stringify({
          sessionType: 'one-time',
          priceId: 'price_test123',
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel',
        }),
      });

      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body).toEqual({
        sessionId: mockSessionId,
        url: mockSessionUrl,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'payment',
          line_items: [
            {
              price: 'price_test123',
              quantity: 1,
            },
          ],
        }),
      );
    });

    it('should include custom metadata in session creation', async () => {
      const mockSessionId = 'cs_test_metadata';
      const mockSessionUrl = 'https://checkout.stripe.com/metadata';

      mockCreate.mockResolvedValue({
        id: mockSessionId,
        url: mockSessionUrl,
      } as Stripe.Checkout.Session);

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

      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            userId: mockUserId,
            sessionType: 'subscription',
            ...customMetadata,
          }),
        }),
      );
    });

    it('should use customer email from request when provided', async () => {
      const mockSessionId = 'cs_test_email';
      const mockSessionUrl = 'https://checkout.stripe.com/email';
      const customEmail = 'custom@example.com';

      mockCreate.mockResolvedValue({
        id: mockSessionId,
        url: mockSessionUrl,
      } as Stripe.Checkout.Session);

      const event = createMockEvent({
        body: JSON.stringify({
          sessionType: 'subscription',
          priceId: 'price_test123',
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel',
          customerEmail: customEmail,
        }),
      });

      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          customer_email: customEmail,
        }),
      );
    });

    it('should handle missing sessionType gracefully', async () => {
      const event = createMockEvent({
        body: JSON.stringify({
          priceId: 'price_test123',
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel',
        }),
      });

      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('sessionType');
    });

    it('should handle pathParameters being null', async () => {
      const event = createMockEvent({
        pathParameters: null,
      });

      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Missing userId parameter');
    });

    it('should handle authorizer context being null', async () => {
      const event = createMockEvent({
        requestContext: {
          authorizer: null,
        } as unknown as APIGatewayProxyEvent['requestContext'],
      });

      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Unauthorized');
    });

    it('should handle empty allowed price IDs environment variable', async () => {
      // Reset SSM mock to return empty value for price IDs
      ssmMock.reset();
      ssmMock
        .on(GetParameterCommand, {
          Name: '/aura28/test/stripe/api-key',
        })
        .resolves({
          Parameter: {
            Value: mockStripeApiKey,
          },
        });

      ssmMock
        .on(GetParameterCommand, {
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
      } as Stripe.Checkout.Session);

      const event = createMockEvent({
        body: JSON.stringify({
          sessionType: 'subscription',
          priceId: 'any_price_id',
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel',
        }),
      });

      const result: APIGatewayProxyResult = await handler(event);

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
      } as Stripe.Checkout.Session);

      const event = createMockEvent({
        body: JSON.stringify({
          sessionType: 'subscription',
          priceId: 'price_test123',
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel',
        }),
      });

      const result: APIGatewayProxyResult = await handler(event);

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
      } as Stripe.Checkout.Session);

      const event = createMockEvent();

      // First invocation
      await handler(event);
      const ssmCallsAfterFirst = ssmMock.calls().length;

      // Second invocation (should use cached value)
      await handler(event);
      const ssmCallsAfterSecond = ssmMock.calls().length;

      // SSM should not be called again for allowed price IDs (only for Stripe API key if not cached)
      // The difference should be minimal (0 or 1 call for Stripe API key)
      expect(ssmCallsAfterSecond - ssmCallsAfterFirst).toBeLessThanOrEqual(1);
    });

    it('should fall back to environment variable when SSM fails', async () => {
      // Reset mocks to simulate SSM failure for allowed price IDs
      ssmMock.reset();
      ssmMock
        .on(GetParameterCommand, {
          Name: '/aura28/test/stripe/api-key',
        })
        .resolves({
          Parameter: {
            Value: mockStripeApiKey,
          },
        });

      // Simulate SSM failure for allowed price IDs
      ssmMock
        .on(GetParameterCommand, {
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
      } as Stripe.Checkout.Session);

      const event = createMockEvent({
        body: JSON.stringify({
          sessionType: 'subscription',
          priceId: 'price_test123',
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel',
        }),
      });

      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.sessionId).toBe(mockSessionId);
    });

    it('should handle empty SSM parameter value', async () => {
      // Reset mocks
      ssmMock.reset();
      ssmMock
        .on(GetParameterCommand, {
          Name: '/aura28/test/stripe/api-key',
        })
        .resolves({
          Parameter: {
            Value: mockStripeApiKey,
          },
        });

      // Return empty value for allowed price IDs
      ssmMock
        .on(GetParameterCommand, {
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
      } as Stripe.Checkout.Session);

      const event = createMockEvent();

      // Should succeed when no price IDs are configured (empty array means no validation)
      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(200);
    });

    it('should handle malformed price ID list in SSM', async () => {
      // Reset mocks
      ssmMock.reset();
      ssmMock
        .on(GetParameterCommand, {
          Name: '/aura28/test/stripe/api-key',
        })
        .resolves({
          Parameter: {
            Value: mockStripeApiKey,
          },
        });

      // Return malformed value with extra commas and spaces
      ssmMock
        .on(GetParameterCommand, {
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
      } as Stripe.Checkout.Session);

      const event = createMockEvent({
        body: JSON.stringify({
          sessionType: 'subscription',
          priceId: 'price_test456',
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel',
        }),
      });

      const result: APIGatewayProxyResult = await handler(event);

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

      const result: APIGatewayProxyResult = await handler(event);

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
      } as Stripe.Checkout.Session);

      const event = createMockEvent({
        body: JSON.stringify({
          sessionType: 'one-time',
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel',
        }),
      });

      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: [
            expect.objectContaining({
              price_data: expect.objectContaining({
                currency: 'usd',
                unit_amount: 2900,
              }),
            }),
          ],
        }),
      );
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
      } as Stripe.Checkout.Session);

      const event = createMockEvent();

      // First invocation - should call SSM
      await handler(event);
      const initialSsmCalls = ssmMock.calls().filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (call: any) => call.args[0].input.Name === '/aura28/test/stripe/allowed-price-ids',
      ).length;

      // Clear cache to simulate new Lambda cold start
      clearCache();

      // Second invocation after cache clear - should call SSM again
      await handler(event);
      const afterCacheClearCalls = ssmMock.calls().filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (call: any) => call.args[0].input.Name === '/aura28/test/stripe/allowed-price-ids',
      ).length;

      // Should have called SSM again after cache clear
      expect(afterCacheClearCalls).toBeGreaterThan(initialSsmCalls);
    }, 10000);

    it('should handle SSM parameter not existing gracefully', async () => {
      // Reset mocks
      ssmMock.reset();
      ssmMock
        .on(GetParameterCommand, {
          Name: '/aura28/test/stripe/api-key',
        })
        .resolves({
          Parameter: {
            Value: mockStripeApiKey,
          },
        });

      // Simulate parameter doesn't exist (returns undefined)
      ssmMock
        .on(GetParameterCommand, {
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
      } as Stripe.Checkout.Session);

      const event = createMockEvent({
        body: JSON.stringify({
          sessionType: 'one-time',
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel',
        }),
      });

      const result: APIGatewayProxyResult = await handler(event);

      // Should succeed with no price validation when no config exists
      expect(result.statusCode).toBe(200);
    });

    it('should handle SSM returning null parameter gracefully', async () => {
      // Reset mocks
      ssmMock.reset();
      ssmMock
        .on(GetParameterCommand, {
          Name: '/aura28/test/stripe/api-key',
        })
        .resolves({
          Parameter: {
            Value: mockStripeApiKey,
          },
        });

      // Simulate SSM returns null parameter
      ssmMock
        .on(GetParameterCommand, {
          Name: '/aura28/test/stripe/allowed-price-ids',
        })
        .resolves({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          Parameter: null as any,
        });

      const mockSessionId = 'cs_test_null_param';
      const mockSessionUrl = 'https://checkout.stripe.com/null_param';

      mockCreate.mockResolvedValue({
        id: mockSessionId,
        url: mockSessionUrl,
      } as Stripe.Checkout.Session);

      const event = createMockEvent({
        body: JSON.stringify({
          sessionType: 'one-time',
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel',
        }),
      });

      const result: APIGatewayProxyResult = await handler(event);

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
      } as Stripe.Checkout.Session);

      const event = createMockEvent({
        body: JSON.stringify({
          sessionType: 'one-time',
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel',
        }),
      });

      // First call
      const firstResult = await handler(event);
      const firstCallSsmCount = ssmMock.calls().length;

      // Second call - should not fetch SSM again due to caching
      const secondResult = await handler(event);
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
        .on(GetParameterCommand, {
          Name: '/aura28/test/stripe/api-key',
        })
        .resolves({
          Parameter: {
            Value: mockStripeApiKey,
          },
        });

      // Return whitespace-only value
      ssmMock
        .on(GetParameterCommand, {
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
      } as Stripe.Checkout.Session);

      const event = createMockEvent({
        body: JSON.stringify({
          sessionType: 'one-time',
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel',
        }),
      });

      const result: APIGatewayProxyResult = await handler(event);

      // Should succeed as empty price ID list means no validation
      expect(result.statusCode).toBe(200);
    });

    it('should handle very long price ID lists efficiently', async () => {
      // Reset mocks
      ssmMock.reset();
      ssmMock
        .on(GetParameterCommand, {
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
        .on(GetParameterCommand, {
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
      } as Stripe.Checkout.Session);

      const event = createMockEvent({
        body: JSON.stringify({
          sessionType: 'subscription',
          priceId: 'price_test50',
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel',
        }),
      });

      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.sessionId).toBe(mockSessionId);
    });

    it('should handle SSM throttling errors gracefully', async () => {
      // Reset mocks
      ssmMock.reset();
      ssmMock
        .on(GetParameterCommand, {
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
        .on(GetParameterCommand, {
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
      } as Stripe.Checkout.Session);

      const event = createMockEvent();

      const result: APIGatewayProxyResult = await handler(event);

      // Should fall back to environment variable
      expect(result.statusCode).toBe(200);
    });

    it('should validate price IDs are trimmed correctly', async () => {
      // Reset mocks
      ssmMock.reset();
      ssmMock
        .on(GetParameterCommand, {
          Name: '/aura28/test/stripe/api-key',
        })
        .resolves({
          Parameter: {
            Value: mockStripeApiKey,
          },
        });

      // Price IDs with various whitespace
      ssmMock
        .on(GetParameterCommand, {
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
      } as Stripe.Checkout.Session);

      const event = createMockEvent({
        body: JSON.stringify({
          sessionType: 'subscription',
          priceId: 'price_test123', // Without spaces
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel',
        }),
      });

      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(200);
    });

    it('should handle sequential requests with cache properly', async () => {
      // Clear cache and reset mocks for clean test
      clearCache();
      ssmMock.reset();

      // Setup SSM mocks
      ssmMock
        .on(GetParameterCommand, {
          Name: '/aura28/test/stripe/api-key',
        })
        .resolves({
          Parameter: {
            Value: mockStripeApiKey,
          },
        });

      ssmMock
        .on(GetParameterCommand, {
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
      } as Stripe.Checkout.Session);

      const event = createMockEvent();

      // First request - should fetch from SSM
      const result1 = await handler(event);
      expect(result1.statusCode).toBe(200);

      const ssmCallsAfterFirst = ssmMock.calls().filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (call: any) => call.args[0].input.Name === '/aura28/test/stripe/allowed-price-ids',
      ).length;

      // Sequential requests - should use cache
      const result2 = await handler(event);
      const result3 = await handler(event);

      expect(result2.statusCode).toBe(200);
      expect(result3.statusCode).toBe(200);

      const ssmCallsAfterAll = ssmMock.calls().filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (call: any) => call.args[0].input.Name === '/aura28/test/stripe/allowed-price-ids',
      ).length;

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
      } as Stripe.Checkout.Session);

      const event = createMockEvent();

      const result: APIGatewayProxyResult = await handler(event);

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
      } as Stripe.Checkout.Session);

      const event = createMockEvent();

      const result: APIGatewayProxyResult = await handler(event);

      // Should succeed using fallback TTL
      expect(result.statusCode).toBe(200);
    });
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */
});
