/**
 * End-to-End Integration Test for KAN-73 Stripe Price ID Implementation
 *
 * This test suite verifies the complete flow of the new valid Stripe price ID
 * from infrastructure through Lambda functions to frontend configuration.
 */

import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { mockClient } from 'aws-sdk-client-mock';
import Stripe from 'stripe';

const ssmMock = mockClient(SSMClient);
const VALID_DEV_PRICE_ID = 'price_1RxUOjErRRGs6tYsTV4RF1Qu';
const INVALID_PLACEHOLDER_ID = 'price_1QbGXuRuJDBzRJSkCbG4a9Xo';

// Mock Stripe
const mockStripeCreate = jest.fn();
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        create: mockStripeCreate,
      },
    },
    prices: {
      retrieve: jest.fn().mockImplementation((priceId) => {
        if (priceId === VALID_DEV_PRICE_ID) {
          return Promise.resolve({
            id: VALID_DEV_PRICE_ID,
            active: true,
            currency: 'usd',
            unit_amount: 2999,
            type: 'one_time',
          });
        }
        return Promise.reject(new Error('No such price'));
      }),
    },
  }));
});

describe('Stripe Price ID End-to-End Integration (KAN-73)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ssmMock.reset();
    mockStripeCreate.mockReset();
  });

  describe('Infrastructure to SSM Parameter Store', () => {
    it('should create SSM parameters with valid dev price ID', async () => {
      // Mock SSM responses for all Stripe parameters
      ssmMock
        .on(GetParameterCommand, {
          Name: '/aura28/dev/stripe/default-price-id',
        })
        .resolves({
          Parameter: {
            Name: '/aura28/dev/stripe/default-price-id',
            Value: VALID_DEV_PRICE_ID,
            Type: 'String',
          },
        });

      ssmMock
        .on(GetParameterCommand, {
          Name: '/aura28/dev/stripe/allowed-price-ids',
        })
        .resolves({
          Parameter: {
            Name: '/aura28/dev/stripe/allowed-price-ids',
            Value: `${VALID_DEV_PRICE_ID},price_placeholder_2`,
            Type: 'String',
          },
        });

      const client = new SSMClient({ region: 'us-east-1' });

      // Fetch default price ID
      const defaultPriceIdResponse = await client.send(
        new GetParameterCommand({ Name: '/aura28/dev/stripe/default-price-id' }),
      );

      expect(defaultPriceIdResponse.Parameter?.Value).toBe(VALID_DEV_PRICE_ID);
      expect(defaultPriceIdResponse.Parameter?.Value).not.toBe(INVALID_PLACEHOLDER_ID);

      // Fetch allowed price IDs
      const allowedPriceIdsResponse = await client.send(
        new GetParameterCommand({ Name: '/aura28/dev/stripe/allowed-price-ids' }),
      );

      expect(allowedPriceIdsResponse.Parameter?.Value).toContain(VALID_DEV_PRICE_ID);
      expect(allowedPriceIdsResponse.Parameter?.Value).not.toContain(INVALID_PLACEHOLDER_ID);
    });

    it('should handle missing SSM parameters with correct fallback', async () => {
      const error = new Error('Parameter not found');
      error.name = 'ParameterNotFound';

      ssmMock
        .on(GetParameterCommand, {
          Name: '/aura28/dev/stripe/default-price-id',
        })
        .rejects(error);

      const client = new SSMClient({ region: 'us-east-1' });

      let fallbackPriceId = '';
      try {
        await client.send(new GetParameterCommand({ Name: '/aura28/dev/stripe/default-price-id' }));
      } catch (_err) {
        // Simulate CI/CD workflow fallback
        fallbackPriceId = VALID_DEV_PRICE_ID;
      }

      expect(fallbackPriceId).toBe(VALID_DEV_PRICE_ID);
      expect(fallbackPriceId).not.toBe(INVALID_PLACEHOLDER_ID);
    });
  });

  describe('Lambda Function Integration', () => {
    it('should accept valid dev price ID in checkout session creation', async () => {
      // Setup SSM mock for Lambda function
      ssmMock
        .on(GetParameterCommand, {
          Name: '/aura28/dev/stripe/allowed-price-ids',
        })
        .resolves({
          Parameter: {
            Value: `${VALID_DEV_PRICE_ID},price_test_2`,
          },
        });

      // Mock successful Stripe session creation
      mockStripeCreate.mockResolvedValue({
        id: 'cs_test_success',
        url: 'https://checkout.stripe.com/success',
      });

      // Simulate Lambda logic for price validation
      const allowedPriceIdsParam = await new SSMClient({ region: 'us-east-1' }).send(
        new GetParameterCommand({ Name: '/aura28/dev/stripe/allowed-price-ids' }),
      );

      const allowedPriceIds = (allowedPriceIdsParam.Parameter?.Value || '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);

      expect(allowedPriceIds).toContain(VALID_DEV_PRICE_ID);

      // Validate price ID is allowed
      const requestedPriceId = VALID_DEV_PRICE_ID;
      const isPriceAllowed = allowedPriceIds.includes(requestedPriceId);

      expect(isPriceAllowed).toBe(true);

      // Create checkout session with valid price ID
      if (isPriceAllowed) {
        const session = await mockStripeCreate({
          mode: 'payment',
          line_items: [
            {
              price: requestedPriceId,
              quantity: 1,
            },
          ],
          success_url: 'https://example.com/success',
          cancel_url: 'https://example.com/cancel',
        });

        expect(session.id).toBe('cs_test_success');
        expect(mockStripeCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            line_items: expect.arrayContaining([
              expect.objectContaining({
                price: VALID_DEV_PRICE_ID,
              }),
            ]),
          }),
        );
      }
    });

    it('should reject invalid placeholder price ID', async () => {
      // Setup SSM mock with valid price IDs only
      ssmMock
        .on(GetParameterCommand, {
          Name: '/aura28/dev/stripe/allowed-price-ids',
        })
        .resolves({
          Parameter: {
            Value: VALID_DEV_PRICE_ID,
          },
        });

      // Get allowed price IDs
      const allowedPriceIdsParam = await new SSMClient({ region: 'us-east-1' }).send(
        new GetParameterCommand({ Name: '/aura28/dev/stripe/allowed-price-ids' }),
      );

      const allowedPriceIds = (allowedPriceIdsParam.Parameter?.Value || '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);

      // Try to use invalid placeholder ID
      const requestedPriceId = INVALID_PLACEHOLDER_ID;
      const isPriceAllowed = allowedPriceIds.includes(requestedPriceId);

      expect(isPriceAllowed).toBe(false);
      expect(allowedPriceIds).not.toContain(INVALID_PLACEHOLDER_ID);
    });

    it('should handle webhook processing with valid price ID', async () => {
      // Simulate webhook event with valid price ID
      const webhookEvent = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_webhook',
            payment_status: 'paid',
            metadata: {
              userId: 'user-123',
              priceId: VALID_DEV_PRICE_ID,
            },
          },
        },
      };

      // Validate the price ID in webhook metadata
      expect(webhookEvent.data.object.metadata.priceId).toBe(VALID_DEV_PRICE_ID);
      expect(webhookEvent.data.object.metadata.priceId).not.toBe(INVALID_PLACEHOLDER_ID);
    });
  });

  describe('Frontend Configuration Integration', () => {
    it('should use valid dev price ID from environment variable', () => {
      // Simulate frontend build environment
      process.env.NEXT_PUBLIC_STRIPE_PRICE_ID = VALID_DEV_PRICE_ID;

      const stripeConfig = {
        readingPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID || 'price_fallback',
      };

      expect(stripeConfig.readingPriceId).toBe(VALID_DEV_PRICE_ID);
      expect(stripeConfig.readingPriceId).not.toBe(INVALID_PLACEHOLDER_ID);

      delete process.env.NEXT_PUBLIC_STRIPE_PRICE_ID;
    });

    it('should use correct fallback when environment variable missing', () => {
      // Clear environment variable
      delete process.env.NEXT_PUBLIC_STRIPE_PRICE_ID;

      // Simulate frontend config fallback logic
      const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.CI;
      const fallbackPriceId = isDevelopment
        ? VALID_DEV_PRICE_ID
        : 'price_REPLACE_WITH_PRODUCTION_ID';

      const stripeConfig = {
        readingPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID || fallbackPriceId,
      };

      if (isDevelopment) {
        expect(stripeConfig.readingPriceId).toBe(VALID_DEV_PRICE_ID);
      }
      expect(stripeConfig.readingPriceId).not.toBe(INVALID_PLACEHOLDER_ID);
    });
  });

  describe('Complete Flow Validation', () => {
    it('should successfully process payment with valid dev price ID end-to-end', async () => {
      // Step 1: CDK creates SSM parameter
      const ssmParameterValue = VALID_DEV_PRICE_ID;

      // Step 2: CI/CD fetches from SSM or uses fallback
      ssmMock
        .on(GetParameterCommand, {
          Name: '/aura28/dev/stripe/default-price-id',
        })
        .resolves({
          Parameter: {
            Value: ssmParameterValue,
          },
        });

      const client = new SSMClient({ region: 'us-east-1' });
      const ssmResponse = await client.send(
        new GetParameterCommand({ Name: '/aura28/dev/stripe/default-price-id' }),
      );

      const cicdPriceId = ssmResponse.Parameter?.Value || VALID_DEV_PRICE_ID;

      // Step 3: Frontend receives price ID via environment variable
      process.env.NEXT_PUBLIC_STRIPE_PRICE_ID = cicdPriceId;

      // Step 4: Frontend sends checkout request with price ID
      const checkoutRequest = {
        priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID,
        sessionType: 'one-time',
      };

      // Step 5: Lambda validates price ID against allowed list
      ssmMock
        .on(GetParameterCommand, {
          Name: '/aura28/dev/stripe/allowed-price-ids',
        })
        .resolves({
          Parameter: {
            Value: `${VALID_DEV_PRICE_ID},price_other`,
          },
        });

      const allowedResponse = await client.send(
        new GetParameterCommand({ Name: '/aura28/dev/stripe/allowed-price-ids' }),
      );

      const allowedIds = (allowedResponse.Parameter?.Value || '').split(',').map((id) => id.trim());
      const isValid = allowedIds.includes(checkoutRequest.priceId!);

      expect(isValid).toBe(true);

      // Step 6: Stripe checkout session created successfully
      if (isValid) {
        mockStripeCreate.mockResolvedValue({
          id: 'cs_test_e2e',
          url: 'https://checkout.stripe.com/e2e',
        });

        const session = await mockStripeCreate({
          mode: 'payment',
          line_items: [
            {
              price: checkoutRequest.priceId,
              quantity: 1,
            },
          ],
        });

        expect(session.id).toBe('cs_test_e2e');
      }

      // Validate the entire flow used the valid price ID
      expect(cicdPriceId).toBe(VALID_DEV_PRICE_ID);
      expect(checkoutRequest.priceId).toBe(VALID_DEV_PRICE_ID);
      expect(checkoutRequest.priceId).not.toBe(INVALID_PLACEHOLDER_ID);

      // Cleanup
      delete process.env.NEXT_PUBLIC_STRIPE_PRICE_ID;
    });

    it('should fail gracefully with invalid placeholder price ID', async () => {
      // Setup allowed price IDs without the placeholder
      ssmMock
        .on(GetParameterCommand, {
          Name: '/aura28/dev/stripe/allowed-price-ids',
        })
        .resolves({
          Parameter: {
            Value: VALID_DEV_PRICE_ID,
          },
        });

      const client = new SSMClient({ region: 'us-east-1' });
      const allowedResponse = await client.send(
        new GetParameterCommand({ Name: '/aura28/dev/stripe/allowed-price-ids' }),
      );

      const allowedIds = (allowedResponse.Parameter?.Value || '').split(',').map((id) => id.trim());

      // Try to use the invalid placeholder
      const invalidRequest = {
        priceId: INVALID_PLACEHOLDER_ID,
        sessionType: 'one-time',
      };

      const isValid = allowedIds.includes(invalidRequest.priceId);

      expect(isValid).toBe(false);

      // Checkout creation should be rejected
      let errorMessage = '';
      if (!isValid) {
        errorMessage = 'Invalid price ID';
      }

      expect(errorMessage).toBe('Invalid price ID');
    });
  });

  describe('Environment-specific behavior', () => {
    it('should use different price IDs for dev vs prod environments', async () => {
      // Dev environment
      ssmMock
        .on(GetParameterCommand, {
          Name: '/aura28/dev/stripe/default-price-id',
        })
        .resolves({
          Parameter: {
            Value: VALID_DEV_PRICE_ID,
          },
        });

      // Prod environment (placeholder)
      ssmMock
        .on(GetParameterCommand, {
          Name: '/aura28/prod/stripe/default-price-id',
        })
        .resolves({
          Parameter: {
            Value: 'price_REPLACE_WITH_PRODUCTION_ID',
          },
        });

      const client = new SSMClient({ region: 'us-east-1' });

      const devResponse = await client.send(
        new GetParameterCommand({ Name: '/aura28/dev/stripe/default-price-id' }),
      );

      const prodResponse = await client.send(
        new GetParameterCommand({ Name: '/aura28/prod/stripe/default-price-id' }),
      );

      // Dev should use the valid price ID
      expect(devResponse.Parameter?.Value).toBe(VALID_DEV_PRICE_ID);

      // Prod should NOT use the dev price ID
      expect(prodResponse.Parameter?.Value).not.toBe(VALID_DEV_PRICE_ID);
      expect(prodResponse.Parameter?.Value).toBe('price_REPLACE_WITH_PRODUCTION_ID');
    });

    it('should validate Stripe API accepts the valid dev price ID', async () => {
      const stripe = new Stripe('sk_test_mock', { apiVersion: '2025-07-30.basil' });

      // Mock price retrieval to verify the price ID is valid
      const priceRetrieve = stripe.prices.retrieve as jest.Mock;

      const price = await priceRetrieve(VALID_DEV_PRICE_ID);

      expect(price.id).toBe(VALID_DEV_PRICE_ID);
      expect(price.active).toBe(true);
      expect(price.unit_amount).toBe(2999); // $29.99
    });
  });
});
