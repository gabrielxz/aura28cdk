import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { handler } from '../../lambda/payments/create-checkout-session';
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

    // Setup SSM mock
    ssmMock.on(GetParameterCommand).resolves({
      Parameter: {
        Value: mockStripeApiKey,
      },
    });

    // Setup environment variables
    process.env.STRIPE_API_KEY_PARAMETER_NAME = '/aura28/test/stripe/api-key';
    process.env.ALLOWED_PRICE_IDS = 'price_test123,price_test456';
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
});
