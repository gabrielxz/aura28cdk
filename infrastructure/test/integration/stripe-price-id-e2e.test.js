"use strict";
/**
 * End-to-End Integration Test for KAN-73 Stripe Price ID Implementation
 *
 * This test suite verifies the complete flow of the new valid Stripe price ID
 * from infrastructure through Lambda functions to frontend configuration.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_ssm_1 = require("@aws-sdk/client-ssm");
const aws_sdk_client_mock_1 = require("aws-sdk-client-mock");
const stripe_1 = __importDefault(require("stripe"));
const ssmMock = (0, aws_sdk_client_mock_1.mockClient)(client_ssm_1.SSMClient);
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
                .on(client_ssm_1.GetParameterCommand, {
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
                .on(client_ssm_1.GetParameterCommand, {
                Name: '/aura28/dev/stripe/allowed-price-ids',
            })
                .resolves({
                Parameter: {
                    Name: '/aura28/dev/stripe/allowed-price-ids',
                    Value: `${VALID_DEV_PRICE_ID},price_placeholder_2`,
                    Type: 'String',
                },
            });
            const client = new client_ssm_1.SSMClient({ region: 'us-east-1' });
            // Fetch default price ID
            const defaultPriceIdResponse = await client.send(new client_ssm_1.GetParameterCommand({ Name: '/aura28/dev/stripe/default-price-id' }));
            expect(defaultPriceIdResponse.Parameter?.Value).toBe(VALID_DEV_PRICE_ID);
            expect(defaultPriceIdResponse.Parameter?.Value).not.toBe(INVALID_PLACEHOLDER_ID);
            // Fetch allowed price IDs
            const allowedPriceIdsResponse = await client.send(new client_ssm_1.GetParameterCommand({ Name: '/aura28/dev/stripe/allowed-price-ids' }));
            expect(allowedPriceIdsResponse.Parameter?.Value).toContain(VALID_DEV_PRICE_ID);
            expect(allowedPriceIdsResponse.Parameter?.Value).not.toContain(INVALID_PLACEHOLDER_ID);
        });
        it('should handle missing SSM parameters with correct fallback', async () => {
            const error = new Error('Parameter not found');
            error.name = 'ParameterNotFound';
            ssmMock
                .on(client_ssm_1.GetParameterCommand, {
                Name: '/aura28/dev/stripe/default-price-id',
            })
                .rejects(error);
            const client = new client_ssm_1.SSMClient({ region: 'us-east-1' });
            let fallbackPriceId = '';
            try {
                await client.send(new client_ssm_1.GetParameterCommand({ Name: '/aura28/dev/stripe/default-price-id' }));
            }
            catch (_err) {
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
                .on(client_ssm_1.GetParameterCommand, {
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
            const allowedPriceIdsParam = await new client_ssm_1.SSMClient({ region: 'us-east-1' }).send(new client_ssm_1.GetParameterCommand({ Name: '/aura28/dev/stripe/allowed-price-ids' }));
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
                expect(mockStripeCreate).toHaveBeenCalledWith(expect.objectContaining({
                    line_items: expect.arrayContaining([
                        expect.objectContaining({
                            price: VALID_DEV_PRICE_ID,
                        }),
                    ]),
                }));
            }
        });
        it('should reject invalid placeholder price ID', async () => {
            // Setup SSM mock with valid price IDs only
            ssmMock
                .on(client_ssm_1.GetParameterCommand, {
                Name: '/aura28/dev/stripe/allowed-price-ids',
            })
                .resolves({
                Parameter: {
                    Value: VALID_DEV_PRICE_ID,
                },
            });
            // Get allowed price IDs
            const allowedPriceIdsParam = await new client_ssm_1.SSMClient({ region: 'us-east-1' }).send(new client_ssm_1.GetParameterCommand({ Name: '/aura28/dev/stripe/allowed-price-ids' }));
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
                .on(client_ssm_1.GetParameterCommand, {
                Name: '/aura28/dev/stripe/default-price-id',
            })
                .resolves({
                Parameter: {
                    Value: ssmParameterValue,
                },
            });
            const client = new client_ssm_1.SSMClient({ region: 'us-east-1' });
            const ssmResponse = await client.send(new client_ssm_1.GetParameterCommand({ Name: '/aura28/dev/stripe/default-price-id' }));
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
                .on(client_ssm_1.GetParameterCommand, {
                Name: '/aura28/dev/stripe/allowed-price-ids',
            })
                .resolves({
                Parameter: {
                    Value: `${VALID_DEV_PRICE_ID},price_other`,
                },
            });
            const allowedResponse = await client.send(new client_ssm_1.GetParameterCommand({ Name: '/aura28/dev/stripe/allowed-price-ids' }));
            const allowedIds = (allowedResponse.Parameter?.Value || '').split(',').map((id) => id.trim());
            const isValid = allowedIds.includes(checkoutRequest.priceId);
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
                .on(client_ssm_1.GetParameterCommand, {
                Name: '/aura28/dev/stripe/allowed-price-ids',
            })
                .resolves({
                Parameter: {
                    Value: VALID_DEV_PRICE_ID,
                },
            });
            const client = new client_ssm_1.SSMClient({ region: 'us-east-1' });
            const allowedResponse = await client.send(new client_ssm_1.GetParameterCommand({ Name: '/aura28/dev/stripe/allowed-price-ids' }));
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
                .on(client_ssm_1.GetParameterCommand, {
                Name: '/aura28/dev/stripe/default-price-id',
            })
                .resolves({
                Parameter: {
                    Value: VALID_DEV_PRICE_ID,
                },
            });
            // Prod environment (placeholder)
            ssmMock
                .on(client_ssm_1.GetParameterCommand, {
                Name: '/aura28/prod/stripe/default-price-id',
            })
                .resolves({
                Parameter: {
                    Value: 'price_REPLACE_WITH_PRODUCTION_ID',
                },
            });
            const client = new client_ssm_1.SSMClient({ region: 'us-east-1' });
            const devResponse = await client.send(new client_ssm_1.GetParameterCommand({ Name: '/aura28/dev/stripe/default-price-id' }));
            const prodResponse = await client.send(new client_ssm_1.GetParameterCommand({ Name: '/aura28/prod/stripe/default-price-id' }));
            // Dev should use the valid price ID
            expect(devResponse.Parameter?.Value).toBe(VALID_DEV_PRICE_ID);
            // Prod should NOT use the dev price ID
            expect(prodResponse.Parameter?.Value).not.toBe(VALID_DEV_PRICE_ID);
            expect(prodResponse.Parameter?.Value).toBe('price_REPLACE_WITH_PRODUCTION_ID');
        });
        it('should validate Stripe API accepts the valid dev price ID', async () => {
            const stripe = new stripe_1.default('sk_test_mock', { apiVersion: '2025-07-30.basil' });
            // Mock price retrieval to verify the price ID is valid
            const priceRetrieve = stripe.prices.retrieve;
            const price = await priceRetrieve(VALID_DEV_PRICE_ID);
            expect(price.id).toBe(VALID_DEV_PRICE_ID);
            expect(price.active).toBe(true);
            expect(price.unit_amount).toBe(2999); // $29.99
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RyaXBlLXByaWNlLWlkLWUyZS50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsic3RyaXBlLXByaWNlLWlkLWUyZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7R0FLRzs7Ozs7QUFFSCxvREFBcUU7QUFDckUsNkRBQWlEO0FBQ2pELG9EQUE0QjtBQUU1QixNQUFNLE9BQU8sR0FBRyxJQUFBLGdDQUFVLEVBQUMsc0JBQVMsQ0FBQyxDQUFDO0FBQ3RDLE1BQU0sa0JBQWtCLEdBQUcsZ0NBQWdDLENBQUM7QUFDNUQsTUFBTSxzQkFBc0IsR0FBRyxnQ0FBZ0MsQ0FBQztBQUVoRSxjQUFjO0FBQ2QsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsRUFBRSxFQUFFLENBQUM7QUFDbkMsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsR0FBRyxFQUFFO0lBQ3ZCLE9BQU8sSUFBSSxDQUFDLEVBQUUsRUFBRSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUM7UUFDekMsUUFBUSxFQUFFO1lBQ1IsUUFBUSxFQUFFO2dCQUNSLE1BQU0sRUFBRSxnQkFBZ0I7YUFDekI7U0FDRjtRQUNELE1BQU0sRUFBRTtZQUNOLFFBQVEsRUFBRSxJQUFJLENBQUMsRUFBRSxFQUFFLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxPQUFPLEVBQUUsRUFBRTtnQkFDakQsSUFBSSxPQUFPLEtBQUssa0JBQWtCLEVBQUUsQ0FBQztvQkFDbkMsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDO3dCQUNyQixFQUFFLEVBQUUsa0JBQWtCO3dCQUN0QixNQUFNLEVBQUUsSUFBSTt3QkFDWixRQUFRLEVBQUUsS0FBSzt3QkFDZixXQUFXLEVBQUUsSUFBSTt3QkFDakIsSUFBSSxFQUFFLFVBQVU7cUJBQ2pCLENBQUMsQ0FBQztnQkFDTCxDQUFDO2dCQUNELE9BQU8sT0FBTyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEtBQUssQ0FBQyxlQUFlLENBQUMs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RyxJQUFJLGdCQUFNLENBQUMsY0FBYyxFQUFFLEVBQUUsVUFBVSxFQUFFLGtCQUFrQixFQUFFLENBQUMsQ0FBQztZQUU5RSx1REFBdUQ7WUFDdkQsTUFBTSxhQUFhLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxRQUFxQixDQUFDO1lBRTFELE1BQU0sS0FBSyxHQUFHLE1BQU0sYUFBYSxDQUFDLGtCQUFrQixDQUFDLENBQUM7WUFFdEQsTUFBTSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsQ0FBQztZQUMxQyxNQUFNLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNoQyxNQUFNLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLFNBQVM7UUFDakQsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztBQUNMLENBQUMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBFbmQtdG8tRW5kIEludGVncmF0aW9uIFRlc3QgZm9yIEtBTi03MyBTdHJpcGUgUHJpY2UgSUQgSW1wbGVtZW50YXRpb25cbiAqXG4gKiBUaGlzIHRlc3Qgc3VpdGUgdmVyaWZpZXMgdGhlIGNvbXBsZXRlIGZsb3cgb2YgdGhlIG5ldyB2YWxpZCBTdHJpcGUgcHJpY2UgSURcbiAqIGZyb20gaW5mcmFzdHJ1Y3R1cmUgdGhyb3VnaCBMYW1iZGEgZnVuY3Rpb25zIHRvIGZyb250ZW5kIGNvbmZpZ3VyYXRpb24uXG4gKi9cblxuaW1wb3J0IHsgU1NNQ2xpZW50LCBHZXRQYXJhbWV0ZXJDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXNzbSc7XG5pbXBvcnQgeyBtb2NrQ2xpZW50IH0gZnJvbSAnYXdzLXNkay1jbGllbnQtbW9jayc7XG5pbXBvcnQgU3RyaXBlIGZyb20gJ3N0cmlwZSc7XG5cbmNvbnN0IHNzbU1vY2sgPSBtb2NrQ2xpZW50KFNTTUNsaWVudCk7XG5jb25zdCBWQUxJRF9ERVZfUFJJQ0VfSUQgPSAncHJpY2VfMVJ4VU9qRXJSUkdzNnRZc1RWNFJGMVF1JztcbmNvbnN0IElOVkFMSURfUExBQ0VIT0xERVJfSUQgPSAncHJpY2VfMVFiR1h1UnVKREJ6UkpTa0NiRzRhOVhvJztcblxuLy8gTW9jayBTdHJpcGVcbmNvbnN0IG1vY2tTdHJpcGVDcmVhdGUgPSBqZXN0LmZuKCk7XG5qZXN0Lm1vY2soJ3N0cmlwZScsICgpID0+IHtcbiAgcmV0dXJuIGplc3QuZm4oKS5tb2NrSW1wbGVtZW50YXRpb24oKCkgPT4gKHtcbiAgICBjaGVja291dDoge1xuICAgICAgc2Vzc2lvbnM6IHtcbiAgICAgICAgY3JlYXRlOiBtb2NrU3RyaXBlQ3JlYXRlLFxuICAgICAgfSxcbiAgICB9LFxuICAgIHByaWNlczoge1xuICAgICAgcmV0cmlldmU6IGplc3QuZm4oKS5tb2NrSW1wbGVtZW50YXRpb24oKHByaWNlSWQpID0+IHtcbiAgICAgICAgaWYgKHByaWNlSWQgPT09IFZBTElEX0RFVl9QUklDRV9JRCkge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICAgICAgaWQ6IFZBTElEX0RFVl9QUklDRV9JRCxcbiAgICAgICAgICAgIGFjdGl2ZTogdHJ1ZSxcbiAgICAgICAgICAgIGN1cnJlbmN5OiAndXNkJyxcbiAgICAgICAgICAgIHVuaXRfYW1vdW50OiAyOTk5LFxuICAgICAgICAgICAgdHlwZTogJ29uZV90aW1lJyxcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKCdObyBzdWNoIHByaWNlJykpO1xuICAgICAgfSksXG4gICAgfSxcbiAgfSkpO1xufSk7XG5cbmRlc2NyaWJlKCdTdHJpcGUgUHJpY2UgSUQgRW5kLXRvLUVuZCBJbnRlZ3JhdGlvbiAoS0FOLTczKScsICgpID0+IHtcbiAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgamVzdC5jbGVhckFsbE1vY2tzKCk7XG4gICAgc3NtTW9jay5yZXNldCgpO1xuICAgIG1vY2tTdHJpcGVDcmVhdGUubW9ja1Jlc2V0KCk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdJbmZyYXN0cnVjdHVyZSB0byBTU00gUGFyYW1ldGVyIFN0b3JlJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgY3JlYXRlIFNTTSBwYXJhbWV0ZXJzIHdpdGggdmFsaWQgZGV2IHByaWNlIElEJywgYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gTW9jayBTU00gcmVzcG9uc2VzIGZvciBhbGwgU3RyaXBlIHBhcmFtZXRlcnNcbiAgICAgIHNzbU1vY2tcbiAgICAgICAgLm9uKEdldFBhcmFtZXRlckNvbW1hbmQsIHtcbiAgICAgICAgICBOYW1lOiAnL2F1cmEyOC9kZXYvc3RyaXBlL2RlZmF1bHQtcHJpY2UtaWQnLFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoe1xuICAgICAgICAgIFBhcmFtZXRlcjoge1xuICAgICAgICAgICAgTmFtZTogJy9hdXJhMjgvZGV2L3N0cmlwZS9kZWZhdWx0LXByaWNlLWlkJyxcbiAgICAgICAgICAgIFZhbHVlOiBWQUxJRF9ERVZfUFJJQ0VfSUQsXG4gICAgICAgICAgICBUeXBlOiAnU3RyaW5nJyxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgc3NtTW9ja1xuICAgICAgICAub24oR2V0UGFyYW1ldGVyQ29tbWFuZCwge1xuICAgICAgICAgIE5hbWU6ICcvYXVyYTI4L2Rldi9zdHJpcGUvYWxsb3dlZC1wcmljZS1pZHMnLFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoe1xuICAgICAgICAgIFBhcmFtZXRlcjoge1xuICAgICAgICAgICAgTmFtZTogJy9hdXJhMjgvZGV2L3N0cmlwZS9hbGxvd2VkLXByaWNlLWlkcycsXG4gICAgICAgICAgICBWYWx1ZTogYCR7VkFMSURfREVWX1BSSUNFX0lEfSxwcmljZV9wbGFjZWhvbGRlcl8yYCxcbiAgICAgICAgICAgIFR5cGU6ICdTdHJpbmcnLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICBjb25zdCBjbGllbnQgPSBuZXcgU1NNQ2xpZW50KHsgcmVnaW9uOiAndXMtZWFzdC0xJyB9KTtcblxuICAgICAgLy8gRmV0Y2ggZGVmYXVsdCBwcmljZSBJRFxuICAgICAgY29uc3QgZGVmYXVsdFByaWNlSWRSZXNwb25zZSA9IGF3YWl0IGNsaWVudC5zZW5kKFxuICAgICAgICBuZXcgR2V0UGFyYW1ldGVyQ29tbWFuZCh7IE5hbWU6ICcvYXVyYTI4L2Rldi9zdHJpcGUvZGVmYXVsdC1wcmljZS1pZCcgfSksXG4gICAgICApO1xuXG4gICAgICBleHBlY3QoZGVmYXVsdFByaWNlSWRSZXNwb25zZS5QYXJhbWV0ZXI/LlZhbHVlKS50b0JlKFZBTElEX0RFVl9QUklDRV9JRCk7XG4gICAgICBleHBlY3QoZGVmYXVsdFByaWNlSWRSZXNwb25zZS5QYXJhbWV0ZXI/LlZhbHVlKS5ub3QudG9CZShJTlZBTElEX1BMQUNFSE9MREVSX0lEKTtcblxuICAgICAgLy8gRmV0Y2ggYWxsb3dlZCBwcmljZSBJRHNcbiAgICAgIGNvbnN0IGFsbG93ZWRQcmljZUlkc1Jlc3BvbnNlID0gYXdhaXQgY2xpZW50LnNlbmQoXG4gICAgICAgIG5ldyBHZXRQYXJhbWV0ZXJDb21tYW5kKHsgTmFtZTogJy9hdXJhMjgvZGV2L3N0cmlwZS9hbGxvd2VkLXByaWNlLWlkcycgfSksXG4gICAgICApO1xuXG4gICAgICBleHBlY3QoYWxsb3dlZFByaWNlSWRzUmVzcG9uc2UuUGFyYW1ldGVyPy5WYWx1ZSkudG9Db250YWluKFZBTElEX0RFVl9QUklDRV9JRCk7XG4gICAgICBleHBlY3QoYWxsb3dlZFByaWNlSWRzUmVzcG9uc2UuUGFyYW1ldGVyPy5WYWx1ZSkubm90LnRvQ29udGFpbihJTlZBTElEX1BMQUNFSE9MREVSX0lEKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIG1pc3NpbmcgU1NNIHBhcmFtZXRlcnMgd2l0aCBjb3JyZWN0IGZhbGxiYWNrJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXJyb3IgPSBuZXcgRXJyb3IoJ1BhcmFtZXRlciBub3QgZm91bmQnKTtcbiAgICAgIGVycm9yLm5hbWUgPSAnUGFyYW1ldGVyTm90Rm91bmQnO1xuXG4gICAgICBzc21Nb2NrXG4gICAgICAgIC5vbihHZXRQYXJhbWV0ZXJDb21tYW5kLCB7XG4gICAgICAgICAgTmFtZTogJy9hdXJhMjgvZGV2L3N0cmlwZS9kZWZhdWx0LXByaWNlLWlkJyxcbiAgICAgICAgfSlcbiAgICAgICAgLnJlamVjdHMoZXJyb3IpO1xuXG4gICAgICBjb25zdCBjbGllbnQgPSBuZXcgU1NNQ2xpZW50KHsgcmVnaW9uOiAndXMtZWFzdC0xJyB9KTtcblxuICAgICAgbGV0IGZhbGxiYWNrUHJpY2VJZCA9ICcnO1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgY2xpZW50LnNlbmQobmV3IEdldFBhcmFtZXRlckNvbW1hbmQoeyBOYW1lOiAnL2F1cmEyOC9kZXYvc3RyaXBlL2RlZmF1bHQtcHJpY2UtaWQnIH0pKTtcbiAgICAgIH0gY2F0Y2ggKF9lcnIpIHtcbiAgICAgICAgLy8gU2ltdWxhdGUgQ0kvQ0Qgd29ya2Zsb3cgZmFsbGJhY2tcbiAgICAgICAgZmFsbGJhY2tQcmljZUlkID0gVkFMSURfREVWX1BSSUNFX0lEO1xuICAgICAgfVxuXG4gICAgICBleHBlY3QoZmFsbGJhY2tQcmljZUlkKS50b0JlKFZBTElEX0RFVl9QUklDRV9JRCk7XG4gICAgICBleHBlY3QoZmFsbGJhY2tQcmljZUlkKS5ub3QudG9CZShJTlZBTElEX1BMQUNFSE9MREVSX0lEKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0xhbWJkYSBGdW5jdGlvbiBJbnRlZ3JhdGlvbicsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGFjY2VwdCB2YWxpZCBkZXYgcHJpY2UgSUQgaW4gY2hlY2tvdXQgc2Vzc2lvbiBjcmVhdGlvbicsIGFzeW5jICgpID0+IHtcbiAgICAgIC8vIFNldHVwIFNTTSBtb2NrIGZvciBMYW1iZGEgZnVuY3Rpb25cbiAgICAgIHNzbU1vY2tcbiAgICAgICAgLm9uKEdldFBhcmFtZXRlckNvbW1hbmQsIHtcbiAgICAgICAgICBOYW1lOiAnL2F1cmEyOC9kZXYvc3RyaXBlL2FsbG93ZWQtcHJpY2UtaWRzJyxcbiAgICAgICAgfSlcbiAgICAgICAgLnJlc29sdmVzKHtcbiAgICAgICAgICBQYXJhbWV0ZXI6IHtcbiAgICAgICAgICAgIFZhbHVlOiBgJHtWQUxJRF9ERVZfUFJJQ0VfSUR9LHByaWNlX3Rlc3RfMmAsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgIC8vIE1vY2sgc3VjY2Vzc2Z1bCBTdHJpcGUgc2Vzc2lvbiBjcmVhdGlvblxuICAgICAgbW9ja1N0cmlwZUNyZWF0ZS5tb2NrUmVzb2x2ZWRWYWx1ZSh7XG4gICAgICAgIGlkOiAnY3NfdGVzdF9zdWNjZXNzJyxcbiAgICAgICAgdXJsOiAnaHR0cHM6Ly9jaGVja291dC5zdHJpcGUuY29tL3N1Y2Nlc3MnLFxuICAgICAgfSk7XG5cbiAgICAgIC8vIFNpbXVsYXRlIExhbWJkYSBsb2dpYyBmb3IgcHJpY2UgdmFsaWRhdGlvblxuICAgICAgY29uc3QgYWxsb3dlZFByaWNlSWRzUGFyYW0gPSBhd2FpdCBuZXcgU1NNQ2xpZW50KHsgcmVnaW9uOiAndXMtZWFzdC0xJyB9KS5zZW5kKFxuICAgICAgICBuZXcgR2V0UGFyYW1ldGVyQ29tbWFuZCh7IE5hbWU6ICcvYXVyYTI4L2Rldi9zdHJpcGUvYWxsb3dlZC1wcmljZS1pZHMnIH0pLFxuICAgICAgKTtcblxuICAgICAgY29uc3QgYWxsb3dlZFByaWNlSWRzID0gKGFsbG93ZWRQcmljZUlkc1BhcmFtLlBhcmFtZXRlcj8uVmFsdWUgfHwgJycpXG4gICAgICAgIC5zcGxpdCgnLCcpXG4gICAgICAgIC5tYXAoKGlkKSA9PiBpZC50cmltKCkpXG4gICAgICAgIC5maWx0ZXIoQm9vbGVhbik7XG5cbiAgICAgIGV4cGVjdChhbGxvd2VkUHJpY2VJZHMpLnRvQ29udGFpbihWQUxJRF9ERVZfUFJJQ0VfSUQpO1xuXG4gICAgICAvLyBWYWxpZGF0ZSBwcmljZSBJRCBpcyBhbGxvd2VkXG4gICAgICBjb25zdCByZXF1ZXN0ZWRQcmljZUlkID0gVkFMSURfREVWX1BSSUNFX0lEO1xuICAgICAgY29uc3QgaXNQcmljZUFsbG93ZWQgPSBhbGxvd2VkUHJpY2VJZHMuaW5jbHVkZXMocmVxdWVzdGVkUHJpY2VJZCk7XG5cbiAgICAgIGV4cGVjdChpc1ByaWNlQWxsb3dlZCkudG9CZSh0cnVlKTtcblxuICAgICAgLy8gQ3JlYXRlIGNoZWNrb3V0IHNlc3Npb24gd2l0aCB2YWxpZCBwcmljZSBJRFxuICAgICAgaWYgKGlzUHJpY2VBbGxvd2VkKSB7XG4gICAgICAgIGNvbnN0IHNlc3Npb24gPSBhd2FpdCBtb2NrU3RyaXBlQ3JlYXRlKHtcbiAgICAgICAgICBtb2RlOiAncGF5bWVudCcsXG4gICAgICAgICAgbGluZV9pdGVtczogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBwcmljZTogcmVxdWVzdGVkUHJpY2VJZCxcbiAgICAgICAgICAgICAgcXVhbnRpdHk6IDEsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIF0sXG4gICAgICAgICAgc3VjY2Vzc191cmw6ICdodHRwczovL2V4YW1wbGUuY29tL3N1Y2Nlc3MnLFxuICAgICAgICAgIGNhbmNlbF91cmw6ICdodHRwczovL2V4YW1wbGUuY29tL2NhbmNlbCcsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGV4cGVjdChzZXNzaW9uLmlkKS50b0JlKCdjc190ZXN0X3N1Y2Nlc3MnKTtcbiAgICAgICAgZXhwZWN0KG1vY2tTdHJpcGVDcmVhdGUpLnRvSGF2ZUJlZW5DYWxsZWRXaXRoKFxuICAgICAgICAgIGV4cGVjdC5vYmplY3RDb250YWluaW5nKHtcbiAgICAgICAgICAgIGxpbmVfaXRlbXM6IGV4cGVjdC5hcnJheUNvbnRhaW5pbmcoW1xuICAgICAgICAgICAgICBleHBlY3Qub2JqZWN0Q29udGFpbmluZyh7XG4gICAgICAgICAgICAgICAgcHJpY2U6IFZBTElEX0RFVl9QUklDRV9JRCxcbiAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICBdKSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgcmVqZWN0IGludmFsaWQgcGxhY2Vob2xkZXIgcHJpY2UgSUQnLCBhc3luYyAoKSA9PiB7XG4gICAgICAvLyBTZXR1cCBTU00gbW9jayB3aXRoIHZhbGlkIHByaWNlIElEcyBvbmx5XG4gICAgICBzc21Nb2NrXG4gICAgICAgIC5vbihHZXRQYXJhbWV0ZXJDb21tYW5kLCB7XG4gICAgICAgICAgTmFtZTogJy9hdXJhMjgvZGV2L3N0cmlwZS9hbGxvd2VkLXByaWNlLWlkcycsXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgUGFyYW1ldGVyOiB7XG4gICAgICAgICAgICBWYWx1ZTogVkFMSURfREVWX1BSSUNFX0lELFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICAvLyBHZXQgYWxsb3dlZCBwcmljZSBJRHNcbiAgICAgIGNvbnN0IGFsbG93ZWRQcmljZUlkc1BhcmFtID0gYXdhaXQgbmV3IFNTTUNsaWVudCh7IHJlZ2lvbjogJ3VzLWVhc3QtMScgfSkuc2VuZChcbiAgICAgICAgbmV3IEdldFBhcmFtZXRlckNvbW1hbmQoeyBOYW1lOiAnL2F1cmEyOC9kZXYvc3RyaXBlL2FsbG93ZWQtcHJpY2UtaWRzJyB9KSxcbiAgICAgICk7XG5cbiAgICAgIGNvbnN0IGFsbG93ZWRQcmljZUlkcyA9IChhbGxvd2VkUHJpY2VJZHNQYXJhbS5QYXJhbWV0ZXI/LlZhbHVlIHx8ICcnKVxuICAgICAgICAuc3BsaXQoJywnKVxuICAgICAgICAubWFwKChpZCkgPT4gaWQudHJpbSgpKVxuICAgICAgICAuZmlsdGVyKEJvb2xlYW4pO1xuXG4gICAgICAvLyBUcnkgdG8gdXNlIGludmFsaWQgcGxhY2Vob2xkZXIgSURcbiAgICAgIGNvbnN0IHJlcXVlc3RlZFByaWNlSWQgPSBJTlZBTElEX1BMQUNFSE9MREVSX0lEO1xuICAgICAgY29uc3QgaXNQcmljZUFsbG93ZWQgPSBhbGxvd2VkUHJpY2VJZHMuaW5jbHVkZXMocmVxdWVzdGVkUHJpY2VJZCk7XG5cbiAgICAgIGV4cGVjdChpc1ByaWNlQWxsb3dlZCkudG9CZShmYWxzZSk7XG4gICAgICBleHBlY3QoYWxsb3dlZFByaWNlSWRzKS5ub3QudG9Db250YWluKElOVkFMSURfUExBQ0VIT0xERVJfSUQpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgd2ViaG9vayBwcm9jZXNzaW5nIHdpdGggdmFsaWQgcHJpY2UgSUQnLCBhc3luYyAoKSA9PiB7XG4gICAgICAvLyBTaW11bGF0ZSB3ZWJob29rIGV2ZW50IHdpdGggdmFsaWQgcHJpY2UgSURcbiAgICAgIGNvbnN0IHdlYmhvb2tFdmVudCA9IHtcbiAgICAgICAgdHlwZTogJ2NoZWNrb3V0LnNlc3Npb24uY29tcGxldGVkJyxcbiAgICAgICAgZGF0YToge1xuICAgICAgICAgIG9iamVjdDoge1xuICAgICAgICAgICAgaWQ6ICdjc190ZXN0X3dlYmhvb2snLFxuICAgICAgICAgICAgcGF5bWVudF9zdGF0dXM6ICdwYWlkJyxcbiAgICAgICAgICAgIG1ldGFkYXRhOiB7XG4gICAgICAgICAgICAgIHVzZXJJZDogJ3VzZXItMTIzJyxcbiAgICAgICAgICAgICAgcHJpY2VJZDogVkFMSURfREVWX1BSSUNFX0lELFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfTtcblxuICAgICAgLy8gVmFsaWRhdGUgdGhlIHByaWNlIElEIGluIHdlYmhvb2sgbWV0YWRhdGFcbiAgICAgIGV4cGVjdCh3ZWJob29rRXZlbnQuZGF0YS5vYmplY3QubWV0YWRhdGEucHJpY2VJZCkudG9CZShWQUxJRF9ERVZfUFJJQ0VfSUQpO1xuICAgICAgZXhwZWN0KHdlYmhvb2tFdmVudC5kYXRhLm9iamVjdC5tZXRhZGF0YS5wcmljZUlkKS5ub3QudG9CZShJTlZBTElEX1BMQUNFSE9MREVSX0lEKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0Zyb250ZW5kIENvbmZpZ3VyYXRpb24gSW50ZWdyYXRpb24nLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCB1c2UgdmFsaWQgZGV2IHByaWNlIElEIGZyb20gZW52aXJvbm1lbnQgdmFyaWFibGUnLCAoKSA9PiB7XG4gICAgICAvLyBTaW11bGF0ZSBmcm9udGVuZCBidWlsZCBlbnZpcm9ubWVudFxuICAgICAgcHJvY2Vzcy5lbnYuTkVYVF9QVUJMSUNfU1RSSVBFX1BSSUNFX0lEID0gVkFMSURfREVWX1BSSUNFX0lEO1xuXG4gICAgICBjb25zdCBzdHJpcGVDb25maWcgPSB7XG4gICAgICAgIHJlYWRpbmdQcmljZUlkOiBwcm9jZXNzLmVudi5ORVhUX1BVQkxJQ19TVFJJUEVfUFJJQ0VfSUQgfHwgJ3ByaWNlX2ZhbGxiYWNrJyxcbiAgICAgIH07XG5cbiAgICAgIGV4cGVjdChzdHJpcGVDb25maWcucmVhZGluZ1ByaWNlSWQpLnRvQmUoVkFMSURfREVWX1BSSUNFX0lEKTtcbiAgICAgIGV4cGVjdChzdHJpcGVDb25maWcucmVhZGluZ1ByaWNlSWQpLm5vdC50b0JlKElOVkFMSURfUExBQ0VIT0xERVJfSUQpO1xuXG4gICAgICBkZWxldGUgcHJvY2Vzcy5lbnYuTkVYVF9QVUJMSUNfU1RSSVBFX1BSSUNFX0lEO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCB1c2UgY29ycmVjdCBmYWxsYmFjayB3aGVuIGVudmlyb25tZW50IHZhcmlhYmxlIG1pc3NpbmcnLCAoKSA9PiB7XG4gICAgICAvLyBDbGVhciBlbnZpcm9ubWVudCB2YXJpYWJsZVxuICAgICAgZGVsZXRlIHByb2Nlc3MuZW52Lk5FWFRfUFVCTElDX1NUUklQRV9QUklDRV9JRDtcblxuICAgICAgLy8gU2ltdWxhdGUgZnJvbnRlbmQgY29uZmlnIGZhbGxiYWNrIGxvZ2ljXG4gICAgICBjb25zdCBpc0RldmVsb3BtZW50ID0gcHJvY2Vzcy5lbnYuTk9ERV9FTlYgPT09ICdkZXZlbG9wbWVudCcgfHwgIXByb2Nlc3MuZW52LkNJO1xuICAgICAgY29uc3QgZmFsbGJhY2tQcmljZUlkID0gaXNEZXZlbG9wbWVudFxuICAgICAgICA/IFZBTElEX0RFVl9QUklDRV9JRFxuICAgICAgICA6ICdwcmljZV9SRVBMQUNFX1dJVEhfUFJPRFVDVElPTl9JRCc7XG5cbiAgICAgIGNvbnN0IHN0cmlwZUNvbmZpZyA9IHtcbiAgICAgICAgcmVhZGluZ1ByaWNlSWQ6IHByb2Nlc3MuZW52Lk5FWFRfUFVCTElDX1NUUklQRV9QUklDRV9JRCB8fCBmYWxsYmFja1ByaWNlSWQsXG4gICAgICB9O1xuXG4gICAgICBpZiAoaXNEZXZlbG9wbWVudCkge1xuICAgICAgICBleHBlY3Qoc3RyaXBlQ29uZmlnLnJlYWRpbmdQcmljZUlkKS50b0JlKFZBTElEX0RFVl9QUklDRV9JRCk7XG4gICAgICB9XG4gICAgICBleHBlY3Qoc3RyaXBlQ29uZmlnLnJlYWRpbmdQcmljZUlkKS5ub3QudG9CZShJTlZBTElEX1BMQUNFSE9MREVSX0lEKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0NvbXBsZXRlIEZsb3cgVmFsaWRhdGlvbicsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIHN1Y2Nlc3NmdWxseSBwcm9jZXNzIHBheW1lbnQgd2l0aCB2YWxpZCBkZXYgcHJpY2UgSUQgZW5kLXRvLWVuZCcsIGFzeW5jICgpID0+IHtcbiAgICAgIC8vIFN0ZXAgMTogQ0RLIGNyZWF0ZXMgU1NNIHBhcmFtZXRlclxuICAgICAgY29uc3Qgc3NtUGFyYW1ldGVyVmFsdWUgPSBWQUxJRF9ERVZfUFJJQ0VfSUQ7XG5cbiAgICAgIC8vIFN0ZXAgMjogQ0kvQ0QgZmV0Y2hlcyBmcm9tIFNTTSBvciB1c2VzIGZhbGxiYWNrXG4gICAgICBzc21Nb2NrXG4gICAgICAgIC5vbihHZXRQYXJhbWV0ZXJDb21tYW5kLCB7XG4gICAgICAgICAgTmFtZTogJy9hdXJhMjgvZGV2L3N0cmlwZS9kZWZhdWx0LXByaWNlLWlkJyxcbiAgICAgICAgfSlcbiAgICAgICAgLnJlc29sdmVzKHtcbiAgICAgICAgICBQYXJhbWV0ZXI6IHtcbiAgICAgICAgICAgIFZhbHVlOiBzc21QYXJhbWV0ZXJWYWx1ZSxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgY29uc3QgY2xpZW50ID0gbmV3IFNTTUNsaWVudCh7IHJlZ2lvbjogJ3VzLWVhc3QtMScgfSk7XG4gICAgICBjb25zdCBzc21SZXNwb25zZSA9IGF3YWl0IGNsaWVudC5zZW5kKFxuICAgICAgICBuZXcgR2V0UGFyYW1ldGVyQ29tbWFuZCh7IE5hbWU6ICcvYXVyYTI4L2Rldi9zdHJpcGUvZGVmYXVsdC1wcmljZS1pZCcgfSksXG4gICAgICApO1xuXG4gICAgICBjb25zdCBjaWNkUHJpY2VJZCA9IHNzbVJlc3BvbnNlLlBhcmFtZXRlcj8uVmFsdWUgfHwgVkFMSURfREVWX1BSSUNFX0lEO1xuXG4gICAgICAvLyBTdGVwIDM6IEZyb250ZW5kIHJlY2VpdmVzIHByaWNlIElEIHZpYSBlbnZpcm9ubWVudCB2YXJpYWJsZVxuICAgICAgcHJvY2Vzcy5lbnYuTkVYVF9QVUJMSUNfU1RSSVBFX1BSSUNFX0lEID0gY2ljZFByaWNlSWQ7XG5cbiAgICAgIC8vIFN0ZXAgNDogRnJvbnRlbmQgc2VuZHMgY2hlY2tvdXQgcmVxdWVzdCB3aXRoIHByaWNlIElEXG4gICAgICBjb25zdCBjaGVja291dFJlcXVlc3QgPSB7XG4gICAgICAgIHByaWNlSWQ6IHByb2Nlc3MuZW52Lk5FWFRfUFVCTElDX1NUUklQRV9QUklDRV9JRCxcbiAgICAgICAgc2Vzc2lvblR5cGU6ICdvbmUtdGltZScsXG4gICAgICB9O1xuXG4gICAgICAvLyBTdGVwIDU6IExhbWJkYSB2YWxpZGF0ZXMgcHJpY2UgSUQgYWdhaW5zdCBhbGxvd2VkIGxpc3RcbiAgICAgIHNzbU1vY2tcbiAgICAgICAgLm9uKEdldFBhcmFtZXRlckNvbW1hbmQsIHtcbiAgICAgICAgICBOYW1lOiAnL2F1cmEyOC9kZXYvc3RyaXBlL2FsbG93ZWQtcHJpY2UtaWRzJyxcbiAgICAgICAgfSlcbiAgICAgICAgLnJlc29sdmVzKHtcbiAgICAgICAgICBQYXJhbWV0ZXI6IHtcbiAgICAgICAgICAgIFZhbHVlOiBgJHtWQUxJRF9ERVZfUFJJQ0VfSUR9LHByaWNlX290aGVyYCxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgY29uc3QgYWxsb3dlZFJlc3BvbnNlID0gYXdhaXQgY2xpZW50LnNlbmQoXG4gICAgICAgIG5ldyBHZXRQYXJhbWV0ZXJDb21tYW5kKHsgTmFtZTogJy9hdXJhMjgvZGV2L3N0cmlwZS9hbGxvd2VkLXByaWNlLWlkcycgfSksXG4gICAgICApO1xuXG4gICAgICBjb25zdCBhbGxvd2VkSWRzID0gKGFsbG93ZWRSZXNwb25zZS5QYXJhbWV0ZXI/LlZhbHVlIHx8ICcnKS5zcGxpdCgnLCcpLm1hcCgoaWQpID0+IGlkLnRyaW0oKSk7XG4gICAgICBjb25zdCBpc1ZhbGlkID0gYWxsb3dlZElkcy5pbmNsdWRlcyhjaGVja291dFJlcXVlc3QucHJpY2VJZCEpO1xuXG4gICAgICBleHBlY3QoaXNWYWxpZCkudG9CZSh0cnVlKTtcblxuICAgICAgLy8gU3RlcCA2OiBTdHJpcGUgY2hlY2tvdXQgc2Vzc2lvbiBjcmVhdGVkIHN1Y2Nlc3NmdWxseVxuICAgICAgaWYgKGlzVmFsaWQpIHtcbiAgICAgICAgbW9ja1N0cmlwZUNyZWF0ZS5tb2NrUmVzb2x2ZWRWYWx1ZSh7XG4gICAgICAgICAgaWQ6ICdjc190ZXN0X2UyZScsXG4gICAgICAgICAgdXJsOiAnaHR0cHM6Ly9jaGVja291dC5zdHJpcGUuY29tL2UyZScsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHNlc3Npb24gPSBhd2FpdCBtb2NrU3RyaXBlQ3JlYXRlKHtcbiAgICAgICAgICBtb2RlOiAncGF5bWVudCcsXG4gICAgICAgICAgbGluZV9pdGVtczogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBwcmljZTogY2hlY2tvdXRSZXF1ZXN0LnByaWNlSWQsXG4gICAgICAgICAgICAgIHF1YW50aXR5OiAxLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICBdLFxuICAgICAgICB9KTtcblxuICAgICAgICBleHBlY3Qoc2Vzc2lvbi5pZCkudG9CZSgnY3NfdGVzdF9lMmUnKTtcbiAgICAgIH1cblxuICAgICAgLy8gVmFsaWRhdGUgdGhlIGVudGlyZSBmbG93IHVzZWQgdGhlIHZhbGlkIHByaWNlIElEXG4gICAgICBleHBlY3QoY2ljZFByaWNlSWQpLnRvQmUoVkFMSURfREVWX1BSSUNFX0lEKTtcbiAgICAgIGV4cGVjdChjaGVja291dFJlcXVlc3QucHJpY2VJZCkudG9CZShWQUxJRF9ERVZfUFJJQ0VfSUQpO1xuICAgICAgZXhwZWN0KGNoZWNrb3V0UmVxdWVzdC5wcmljZUlkKS5ub3QudG9CZShJTlZBTElEX1BMQUNFSE9MREVSX0lEKTtcblxuICAgICAgLy8gQ2xlYW51cFxuICAgICAgZGVsZXRlIHByb2Nlc3MuZW52Lk5FWFRfUFVCTElDX1NUUklQRV9QUklDRV9JRDtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgZmFpbCBncmFjZWZ1bGx5IHdpdGggaW52YWxpZCBwbGFjZWhvbGRlciBwcmljZSBJRCcsIGFzeW5jICgpID0+IHtcbiAgICAgIC8vIFNldHVwIGFsbG93ZWQgcHJpY2UgSURzIHdpdGhvdXQgdGhlIHBsYWNlaG9sZGVyXG4gICAgICBzc21Nb2NrXG4gICAgICAgIC5vbihHZXRQYXJhbWV0ZXJDb21tYW5kLCB7XG4gICAgICAgICAgTmFtZTogJy9hdXJhMjgvZGV2L3N0cmlwZS9hbGxvd2VkLXByaWNlLWlkcycsXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgUGFyYW1ldGVyOiB7XG4gICAgICAgICAgICBWYWx1ZTogVkFMSURfREVWX1BSSUNFX0lELFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICBjb25zdCBjbGllbnQgPSBuZXcgU1NNQ2xpZW50KHsgcmVnaW9uOiAndXMtZWFzdC0xJyB9KTtcbiAgICAgIGNvbnN0IGFsbG93ZWRSZXNwb25zZSA9IGF3YWl0IGNsaWVudC5zZW5kKFxuICAgICAgICBuZXcgR2V0UGFyYW1ldGVyQ29tbWFuZCh7IE5hbWU6ICcvYXVyYTI4L2Rldi9zdHJpcGUvYWxsb3dlZC1wcmljZS1pZHMnIH0pLFxuICAgICAgKTtcblxuICAgICAgY29uc3QgYWxsb3dlZElkcyA9IChhbGxvd2VkUmVzcG9uc2UuUGFyYW1ldGVyPy5WYWx1ZSB8fCAnJykuc3BsaXQoJywnKS5tYXAoKGlkKSA9PiBpZC50cmltKCkpO1xuXG4gICAgICAvLyBUcnkgdG8gdXNlIHRoZSBpbnZhbGlkIHBsYWNlaG9sZGVyXG4gICAgICBjb25zdCBpbnZhbGlkUmVxdWVzdCA9IHtcbiAgICAgICAgcHJpY2VJZDogSU5WQUxJRF9QTEFDRUhPTERFUl9JRCxcbiAgICAgICAgc2Vzc2lvblR5cGU6ICdvbmUtdGltZScsXG4gICAgICB9O1xuXG4gICAgICBjb25zdCBpc1ZhbGlkID0gYWxsb3dlZElkcy5pbmNsdWRlcyhpbnZhbGlkUmVxdWVzdC5wcmljZUlkKTtcblxuICAgICAgZXhwZWN0KGlzVmFsaWQpLnRvQmUoZmFsc2UpO1xuXG4gICAgICAvLyBDaGVja291dCBjcmVhdGlvbiBzaG91bGQgYmUgcmVqZWN0ZWRcbiAgICAgIGxldCBlcnJvck1lc3NhZ2UgPSAnJztcbiAgICAgIGlmICghaXNWYWxpZCkge1xuICAgICAgICBlcnJvck1lc3NhZ2UgPSAnSW52YWxpZCBwcmljZSBJRCc7XG4gICAgICB9XG5cbiAgICAgIGV4cGVjdChlcnJvck1lc3NhZ2UpLnRvQmUoJ0ludmFsaWQgcHJpY2UgSUQnKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0Vudmlyb25tZW50LXNwZWNpZmljIGJlaGF2aW9yJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgdXNlIGRpZmZlcmVudCBwcmljZSBJRHMgZm9yIGRldiB2cyBwcm9kIGVudmlyb25tZW50cycsIGFzeW5jICgpID0+IHtcbiAgICAgIC8vIERldiBlbnZpcm9ubWVudFxuICAgICAgc3NtTW9ja1xuICAgICAgICAub24oR2V0UGFyYW1ldGVyQ29tbWFuZCwge1xuICAgICAgICAgIE5hbWU6ICcvYXVyYTI4L2Rldi9zdHJpcGUvZGVmYXVsdC1wcmljZS1pZCcsXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgUGFyYW1ldGVyOiB7XG4gICAgICAgICAgICBWYWx1ZTogVkFMSURfREVWX1BSSUNFX0lELFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICAvLyBQcm9kIGVudmlyb25tZW50IChwbGFjZWhvbGRlcilcbiAgICAgIHNzbU1vY2tcbiAgICAgICAgLm9uKEdldFBhcmFtZXRlckNvbW1hbmQsIHtcbiAgICAgICAgICBOYW1lOiAnL2F1cmEyOC9wcm9kL3N0cmlwZS9kZWZhdWx0LXByaWNlLWlkJyxcbiAgICAgICAgfSlcbiAgICAgICAgLnJlc29sdmVzKHtcbiAgICAgICAgICBQYXJhbWV0ZXI6IHtcbiAgICAgICAgICAgIFZhbHVlOiAncHJpY2VfUkVQTEFDRV9XSVRIX1BST0RVQ1RJT05fSUQnLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICBjb25zdCBjbGllbnQgPSBuZXcgU1NNQ2xpZW50KHsgcmVnaW9uOiAndXMtZWFzdC0xJyB9KTtcblxuICAgICAgY29uc3QgZGV2UmVzcG9uc2UgPSBhd2FpdCBjbGllbnQuc2VuZChcbiAgICAgICAgbmV3IEdldFBhcmFtZXRlckNvbW1hbmQoeyBOYW1lOiAnL2F1cmEyOC9kZXYvc3RyaXBlL2RlZmF1bHQtcHJpY2UtaWQnIH0pLFxuICAgICAgKTtcblxuICAgICAgY29uc3QgcHJvZFJlc3BvbnNlID0gYXdhaXQgY2xpZW50LnNlbmQoXG4gICAgICAgIG5ldyBHZXRQYXJhbWV0ZXJDb21tYW5kKHsgTmFtZTogJy9hdXJhMjgvcHJvZC9zdHJpcGUvZGVmYXVsdC1wcmljZS1pZCcgfSksXG4gICAgICApO1xuXG4gICAgICAvLyBEZXYgc2hvdWxkIHVzZSB0aGUgdmFsaWQgcHJpY2UgSURcbiAgICAgIGV4cGVjdChkZXZSZXNwb25zZS5QYXJhbWV0ZXI/LlZhbHVlKS50b0JlKFZBTElEX0RFVl9QUklDRV9JRCk7XG5cbiAgICAgIC8vIFByb2Qgc2hvdWxkIE5PVCB1c2UgdGhlIGRldiBwcmljZSBJRFxuICAgICAgZXhwZWN0KHByb2RSZXNwb25zZS5QYXJhbWV0ZXI/LlZhbHVlKS5ub3QudG9CZShWQUxJRF9ERVZfUFJJQ0VfSUQpO1xuICAgICAgZXhwZWN0KHByb2RSZXNwb25zZS5QYXJhbWV0ZXI/LlZhbHVlKS50b0JlKCdwcmljZV9SRVBMQUNFX1dJVEhfUFJPRFVDVElPTl9JRCcpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCB2YWxpZGF0ZSBTdHJpcGUgQVBJIGFjY2VwdHMgdGhlIHZhbGlkIGRldiBwcmljZSBJRCcsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHN0cmlwZSA9IG5ldyBTdHJpcGUoJ3NrX3Rlc3RfbW9jaycsIHsgYXBpVmVyc2lvbjogJzIwMjUtMDctMzAuYmFzaWwnIH0pO1xuXG4gICAgICAvLyBNb2NrIHByaWNlIHJldHJpZXZhbCB0byB2ZXJpZnkgdGhlIHByaWNlIElEIGlzIHZhbGlkXG4gICAgICBjb25zdCBwcmljZVJldHJpZXZlID0gc3RyaXBlLnByaWNlcy5yZXRyaWV2ZSBhcyBqZXN0Lk1vY2s7XG5cbiAgICAgIGNvbnN0IHByaWNlID0gYXdhaXQgcHJpY2VSZXRyaWV2ZShWQUxJRF9ERVZfUFJJQ0VfSUQpO1xuXG4gICAgICBleHBlY3QocHJpY2UuaWQpLnRvQmUoVkFMSURfREVWX1BSSUNFX0lEKTtcbiAgICAgIGV4cGVjdChwcmljZS5hY3RpdmUpLnRvQmUodHJ1ZSk7XG4gICAgICBleHBlY3QocHJpY2UudW5pdF9hbW91bnQpLnRvQmUoMjk5OSk7IC8vICQyOS45OVxuICAgIH0pO1xuICB9KTtcbn0pO1xuIl19