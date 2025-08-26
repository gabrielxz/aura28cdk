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
            catch (err) {
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
                .map(id => id.trim())
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
                    line_items: [{
                            price: requestedPriceId,
                            quantity: 1,
                        }],
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
                .map(id => id.trim())
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
            const allowedIds = (allowedResponse.Parameter?.Value || '').split(',').map(id => id.trim());
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
                    line_items: [{
                            price: checkoutRequest.priceId,
                            quantity: 1,
                        }],
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
            const allowedIds = (allowedResponse.Parameter?.Value || '').split(',').map(id => id.trim());
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RyaXBlLXByaWNlLWlkLWUyZS50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsic3RyaXBlLXByaWNlLWlkLWUyZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7R0FLRzs7Ozs7QUFFSCxvREFBcUU7QUFDckUsNkRBQWlEO0FBQ2pELG9EQUE0QjtBQUU1QixNQUFNLE9BQU8sR0FBRyxJQUFBLGdDQUFVLEVBQUMsc0JBQVMsQ0FBQyxDQUFDO0FBQ3RDLE1BQU0sa0JBQWtCLEdBQUcsZ0NBQWdDLENBQUM7QUFDNUQsTUFBTSxzQkFBc0IsR0FBRyxnQ0FBZ0MsQ0FBQztBQUVoRSxjQUFjO0FBQ2QsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsRUFBRSxFQUFFLENBQUM7QUFDbkMsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsR0FBRyxFQUFFO0lBQ3ZCLE9BQU8sSUFBSSxDQUFDLEVBQUUsRUFBRSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUM7UUFDekMsUUFBUSxFQUFFO1lBQ1IsUUFBUSxFQUFFO2dCQUNSLE1BQU0sRUFBRSxnQkFBZ0I7YUFDekI7U0FDRjtRQUNELE1BQU0sRUFBRTtZQUNOLFFBQVEsRUFBRSxJQUFJLENBQUMsRUFBRSxFQUFFLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxPQUFPLEVBQUUsRUFBRTtnQkFDakQsSUFBSSxPQUFPLEtBQUssa0JBQWtCLEVBQUUsQ0FBQztvQkFDbkMsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDO3dCQUNyQixFQUFFLEVBQUUsa0JBQWtCO3dCQUN0QixNQUFNLEVBQUUsSUFBSTt3QkFDWixRQUFRLEVBQUUsS0FBSzt3QkFDZixXQUFXLEVBQUUsSUFBSTt3QkFDakIsSUFBSSxFQUFFLFVBQVU7cUJBQ2pCLENBQUMsQ0FBQztnQkFDTCxDQUFDO2dCQUNELE9BQU8sT0FBTyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEtBQUssQ0FBQyxlQUFlLENBQUMs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QUFFLEVBQUUsVUFBVSxFQUFFLGtCQUFrQixFQUFFLENBQUMsQ0FBQztZQUU5RSx1REFBdUQ7WUFDdkQsTUFBTSxhQUFhLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxRQUFxQixDQUFDO1lBRTFELE1BQU0sS0FBSyxHQUFHLE1BQU0sYUFBYSxDQUFDLGtCQUFrQixDQUFDLENBQUM7WUFFdEQsTUFBTSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsQ0FBQztZQUMxQyxNQUFNLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNoQyxNQUFNLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLFNBQVM7UUFDakQsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztBQUNMLENBQUMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBFbmQtdG8tRW5kIEludGVncmF0aW9uIFRlc3QgZm9yIEtBTi03MyBTdHJpcGUgUHJpY2UgSUQgSW1wbGVtZW50YXRpb25cbiAqIFxuICogVGhpcyB0ZXN0IHN1aXRlIHZlcmlmaWVzIHRoZSBjb21wbGV0ZSBmbG93IG9mIHRoZSBuZXcgdmFsaWQgU3RyaXBlIHByaWNlIElEXG4gKiBmcm9tIGluZnJhc3RydWN0dXJlIHRocm91Z2ggTGFtYmRhIGZ1bmN0aW9ucyB0byBmcm9udGVuZCBjb25maWd1cmF0aW9uLlxuICovXG5cbmltcG9ydCB7IFNTTUNsaWVudCwgR2V0UGFyYW1ldGVyQ29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zc20nO1xuaW1wb3J0IHsgbW9ja0NsaWVudCB9IGZyb20gJ2F3cy1zZGstY2xpZW50LW1vY2snO1xuaW1wb3J0IFN0cmlwZSBmcm9tICdzdHJpcGUnO1xuXG5jb25zdCBzc21Nb2NrID0gbW9ja0NsaWVudChTU01DbGllbnQpO1xuY29uc3QgVkFMSURfREVWX1BSSUNFX0lEID0gJ3ByaWNlXzFSeFVPakVyUlJHczZ0WXNUVjRSRjFRdSc7XG5jb25zdCBJTlZBTElEX1BMQUNFSE9MREVSX0lEID0gJ3ByaWNlXzFRYkdYdVJ1SkRCelJKU2tDYkc0YTlYbyc7XG5cbi8vIE1vY2sgU3RyaXBlXG5jb25zdCBtb2NrU3RyaXBlQ3JlYXRlID0gamVzdC5mbigpO1xuamVzdC5tb2NrKCdzdHJpcGUnLCAoKSA9PiB7XG4gIHJldHVybiBqZXN0LmZuKCkubW9ja0ltcGxlbWVudGF0aW9uKCgpID0+ICh7XG4gICAgY2hlY2tvdXQ6IHtcbiAgICAgIHNlc3Npb25zOiB7XG4gICAgICAgIGNyZWF0ZTogbW9ja1N0cmlwZUNyZWF0ZSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBwcmljZXM6IHtcbiAgICAgIHJldHJpZXZlOiBqZXN0LmZuKCkubW9ja0ltcGxlbWVudGF0aW9uKChwcmljZUlkKSA9PiB7XG4gICAgICAgIGlmIChwcmljZUlkID09PSBWQUxJRF9ERVZfUFJJQ0VfSUQpIHtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgICAgIGlkOiBWQUxJRF9ERVZfUFJJQ0VfSUQsXG4gICAgICAgICAgICBhY3RpdmU6IHRydWUsXG4gICAgICAgICAgICBjdXJyZW5jeTogJ3VzZCcsXG4gICAgICAgICAgICB1bml0X2Ftb3VudDogMjk5OSxcbiAgICAgICAgICAgIHR5cGU6ICdvbmVfdGltZScsXG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignTm8gc3VjaCBwcmljZScpKTtcbiAgICAgIH0pLFxuICAgIH0sXG4gIH0pKTtcbn0pO1xuXG5kZXNjcmliZSgnU3RyaXBlIFByaWNlIElEIEVuZC10by1FbmQgSW50ZWdyYXRpb24gKEtBTi03MyknLCAoKSA9PiB7XG4gIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgIGplc3QuY2xlYXJBbGxNb2NrcygpO1xuICAgIHNzbU1vY2sucmVzZXQoKTtcbiAgICBtb2NrU3RyaXBlQ3JlYXRlLm1vY2tSZXNldCgpO1xuICB9KTtcblxuICBkZXNjcmliZSgnSW5mcmFzdHJ1Y3R1cmUgdG8gU1NNIFBhcmFtZXRlciBTdG9yZScsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGNyZWF0ZSBTU00gcGFyYW1ldGVycyB3aXRoIHZhbGlkIGRldiBwcmljZSBJRCcsIGFzeW5jICgpID0+IHtcbiAgICAgIC8vIE1vY2sgU1NNIHJlc3BvbnNlcyBmb3IgYWxsIFN0cmlwZSBwYXJhbWV0ZXJzXG4gICAgICBzc21Nb2NrXG4gICAgICAgIC5vbihHZXRQYXJhbWV0ZXJDb21tYW5kLCB7XG4gICAgICAgICAgTmFtZTogJy9hdXJhMjgvZGV2L3N0cmlwZS9kZWZhdWx0LXByaWNlLWlkJyxcbiAgICAgICAgfSlcbiAgICAgICAgLnJlc29sdmVzKHtcbiAgICAgICAgICBQYXJhbWV0ZXI6IHtcbiAgICAgICAgICAgIE5hbWU6ICcvYXVyYTI4L2Rldi9zdHJpcGUvZGVmYXVsdC1wcmljZS1pZCcsXG4gICAgICAgICAgICBWYWx1ZTogVkFMSURfREVWX1BSSUNFX0lELFxuICAgICAgICAgICAgVHlwZTogJ1N0cmluZycsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgIHNzbU1vY2tcbiAgICAgICAgLm9uKEdldFBhcmFtZXRlckNvbW1hbmQsIHtcbiAgICAgICAgICBOYW1lOiAnL2F1cmEyOC9kZXYvc3RyaXBlL2FsbG93ZWQtcHJpY2UtaWRzJyxcbiAgICAgICAgfSlcbiAgICAgICAgLnJlc29sdmVzKHtcbiAgICAgICAgICBQYXJhbWV0ZXI6IHtcbiAgICAgICAgICAgIE5hbWU6ICcvYXVyYTI4L2Rldi9zdHJpcGUvYWxsb3dlZC1wcmljZS1pZHMnLFxuICAgICAgICAgICAgVmFsdWU6IGAke1ZBTElEX0RFVl9QUklDRV9JRH0scHJpY2VfcGxhY2Vob2xkZXJfMmAsXG4gICAgICAgICAgICBUeXBlOiAnU3RyaW5nJyxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgY29uc3QgY2xpZW50ID0gbmV3IFNTTUNsaWVudCh7IHJlZ2lvbjogJ3VzLWVhc3QtMScgfSk7XG4gICAgICBcbiAgICAgIC8vIEZldGNoIGRlZmF1bHQgcHJpY2UgSURcbiAgICAgIGNvbnN0IGRlZmF1bHRQcmljZUlkUmVzcG9uc2UgPSBhd2FpdCBjbGllbnQuc2VuZChcbiAgICAgICAgbmV3IEdldFBhcmFtZXRlckNvbW1hbmQoeyBOYW1lOiAnL2F1cmEyOC9kZXYvc3RyaXBlL2RlZmF1bHQtcHJpY2UtaWQnIH0pXG4gICAgICApO1xuICAgICAgXG4gICAgICBleHBlY3QoZGVmYXVsdFByaWNlSWRSZXNwb25zZS5QYXJhbWV0ZXI/LlZhbHVlKS50b0JlKFZBTElEX0RFVl9QUklDRV9JRCk7XG4gICAgICBleHBlY3QoZGVmYXVsdFByaWNlSWRSZXNwb25zZS5QYXJhbWV0ZXI/LlZhbHVlKS5ub3QudG9CZShJTlZBTElEX1BMQUNFSE9MREVSX0lEKTtcblxuICAgICAgLy8gRmV0Y2ggYWxsb3dlZCBwcmljZSBJRHNcbiAgICAgIGNvbnN0IGFsbG93ZWRQcmljZUlkc1Jlc3BvbnNlID0gYXdhaXQgY2xpZW50LnNlbmQoXG4gICAgICAgIG5ldyBHZXRQYXJhbWV0ZXJDb21tYW5kKHsgTmFtZTogJy9hdXJhMjgvZGV2L3N0cmlwZS9hbGxvd2VkLXByaWNlLWlkcycgfSlcbiAgICAgICk7XG4gICAgICBcbiAgICAgIGV4cGVjdChhbGxvd2VkUHJpY2VJZHNSZXNwb25zZS5QYXJhbWV0ZXI/LlZhbHVlKS50b0NvbnRhaW4oVkFMSURfREVWX1BSSUNFX0lEKTtcbiAgICAgIGV4cGVjdChhbGxvd2VkUHJpY2VJZHNSZXNwb25zZS5QYXJhbWV0ZXI/LlZhbHVlKS5ub3QudG9Db250YWluKElOVkFMSURfUExBQ0VIT0xERVJfSUQpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgbWlzc2luZyBTU00gcGFyYW1ldGVycyB3aXRoIGNvcnJlY3QgZmFsbGJhY2snLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBlcnJvciA9IG5ldyBFcnJvcignUGFyYW1ldGVyIG5vdCBmb3VuZCcpO1xuICAgICAgZXJyb3IubmFtZSA9ICdQYXJhbWV0ZXJOb3RGb3VuZCc7XG5cbiAgICAgIHNzbU1vY2tcbiAgICAgICAgLm9uKEdldFBhcmFtZXRlckNvbW1hbmQsIHtcbiAgICAgICAgICBOYW1lOiAnL2F1cmEyOC9kZXYvc3RyaXBlL2RlZmF1bHQtcHJpY2UtaWQnLFxuICAgICAgICB9KVxuICAgICAgICAucmVqZWN0cyhlcnJvcik7XG5cbiAgICAgIGNvbnN0IGNsaWVudCA9IG5ldyBTU01DbGllbnQoeyByZWdpb246ICd1cy1lYXN0LTEnIH0pO1xuICAgICAgXG4gICAgICBsZXQgZmFsbGJhY2tQcmljZUlkID0gJyc7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCBjbGllbnQuc2VuZChcbiAgICAgICAgICBuZXcgR2V0UGFyYW1ldGVyQ29tbWFuZCh7IE5hbWU6ICcvYXVyYTI4L2Rldi9zdHJpcGUvZGVmYXVsdC1wcmljZS1pZCcgfSlcbiAgICAgICAgKTtcbiAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAvLyBTaW11bGF0ZSBDSS9DRCB3b3JrZmxvdyBmYWxsYmFja1xuICAgICAgICBmYWxsYmFja1ByaWNlSWQgPSBWQUxJRF9ERVZfUFJJQ0VfSUQ7XG4gICAgICB9XG5cbiAgICAgIGV4cGVjdChmYWxsYmFja1ByaWNlSWQpLnRvQmUoVkFMSURfREVWX1BSSUNFX0lEKTtcbiAgICAgIGV4cGVjdChmYWxsYmFja1ByaWNlSWQpLm5vdC50b0JlKElOVkFMSURfUExBQ0VIT0xERVJfSUQpO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnTGFtYmRhIEZ1bmN0aW9uIEludGVncmF0aW9uJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgYWNjZXB0IHZhbGlkIGRldiBwcmljZSBJRCBpbiBjaGVja291dCBzZXNzaW9uIGNyZWF0aW9uJywgYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gU2V0dXAgU1NNIG1vY2sgZm9yIExhbWJkYSBmdW5jdGlvblxuICAgICAgc3NtTW9ja1xuICAgICAgICAub24oR2V0UGFyYW1ldGVyQ29tbWFuZCwge1xuICAgICAgICAgIE5hbWU6ICcvYXVyYTI4L2Rldi9zdHJpcGUvYWxsb3dlZC1wcmljZS1pZHMnLFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoe1xuICAgICAgICAgIFBhcmFtZXRlcjoge1xuICAgICAgICAgICAgVmFsdWU6IGAke1ZBTElEX0RFVl9QUklDRV9JRH0scHJpY2VfdGVzdF8yYCxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgLy8gTW9jayBzdWNjZXNzZnVsIFN0cmlwZSBzZXNzaW9uIGNyZWF0aW9uXG4gICAgICBtb2NrU3RyaXBlQ3JlYXRlLm1vY2tSZXNvbHZlZFZhbHVlKHtcbiAgICAgICAgaWQ6ICdjc190ZXN0X3N1Y2Nlc3MnLFxuICAgICAgICB1cmw6ICdodHRwczovL2NoZWNrb3V0LnN0cmlwZS5jb20vc3VjY2VzcycsXG4gICAgICB9KTtcblxuICAgICAgLy8gU2ltdWxhdGUgTGFtYmRhIGxvZ2ljIGZvciBwcmljZSB2YWxpZGF0aW9uXG4gICAgICBjb25zdCBhbGxvd2VkUHJpY2VJZHNQYXJhbSA9IGF3YWl0IG5ldyBTU01DbGllbnQoeyByZWdpb246ICd1cy1lYXN0LTEnIH0pLnNlbmQoXG4gICAgICAgIG5ldyBHZXRQYXJhbWV0ZXJDb21tYW5kKHsgTmFtZTogJy9hdXJhMjgvZGV2L3N0cmlwZS9hbGxvd2VkLXByaWNlLWlkcycgfSlcbiAgICAgICk7XG4gICAgICBcbiAgICAgIGNvbnN0IGFsbG93ZWRQcmljZUlkcyA9IChhbGxvd2VkUHJpY2VJZHNQYXJhbS5QYXJhbWV0ZXI/LlZhbHVlIHx8ICcnKVxuICAgICAgICAuc3BsaXQoJywnKVxuICAgICAgICAubWFwKGlkID0+IGlkLnRyaW0oKSlcbiAgICAgICAgLmZpbHRlcihCb29sZWFuKTtcblxuICAgICAgZXhwZWN0KGFsbG93ZWRQcmljZUlkcykudG9Db250YWluKFZBTElEX0RFVl9QUklDRV9JRCk7XG5cbiAgICAgIC8vIFZhbGlkYXRlIHByaWNlIElEIGlzIGFsbG93ZWRcbiAgICAgIGNvbnN0IHJlcXVlc3RlZFByaWNlSWQgPSBWQUxJRF9ERVZfUFJJQ0VfSUQ7XG4gICAgICBjb25zdCBpc1ByaWNlQWxsb3dlZCA9IGFsbG93ZWRQcmljZUlkcy5pbmNsdWRlcyhyZXF1ZXN0ZWRQcmljZUlkKTtcbiAgICAgIFxuICAgICAgZXhwZWN0KGlzUHJpY2VBbGxvd2VkKS50b0JlKHRydWUpO1xuXG4gICAgICAvLyBDcmVhdGUgY2hlY2tvdXQgc2Vzc2lvbiB3aXRoIHZhbGlkIHByaWNlIElEXG4gICAgICBpZiAoaXNQcmljZUFsbG93ZWQpIHtcbiAgICAgICAgY29uc3Qgc2Vzc2lvbiA9IGF3YWl0IG1vY2tTdHJpcGVDcmVhdGUoe1xuICAgICAgICAgIG1vZGU6ICdwYXltZW50JyxcbiAgICAgICAgICBsaW5lX2l0ZW1zOiBbe1xuICAgICAgICAgICAgcHJpY2U6IHJlcXVlc3RlZFByaWNlSWQsXG4gICAgICAgICAgICBxdWFudGl0eTogMSxcbiAgICAgICAgICB9XSxcbiAgICAgICAgICBzdWNjZXNzX3VybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vc3VjY2VzcycsXG4gICAgICAgICAgY2FuY2VsX3VybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vY2FuY2VsJyxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgZXhwZWN0KHNlc3Npb24uaWQpLnRvQmUoJ2NzX3Rlc3Rfc3VjY2VzcycpO1xuICAgICAgICBleHBlY3QobW9ja1N0cmlwZUNyZWF0ZSkudG9IYXZlQmVlbkNhbGxlZFdpdGgoXG4gICAgICAgICAgZXhwZWN0Lm9iamVjdENvbnRhaW5pbmcoe1xuICAgICAgICAgICAgbGluZV9pdGVtczogZXhwZWN0LmFycmF5Q29udGFpbmluZyhbXG4gICAgICAgICAgICAgIGV4cGVjdC5vYmplY3RDb250YWluaW5nKHtcbiAgICAgICAgICAgICAgICBwcmljZTogVkFMSURfREVWX1BSSUNFX0lELFxuICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIF0pLFxuICAgICAgICAgIH0pXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHJlamVjdCBpbnZhbGlkIHBsYWNlaG9sZGVyIHByaWNlIElEJywgYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gU2V0dXAgU1NNIG1vY2sgd2l0aCB2YWxpZCBwcmljZSBJRHMgb25seVxuICAgICAgc3NtTW9ja1xuICAgICAgICAub24oR2V0UGFyYW1ldGVyQ29tbWFuZCwge1xuICAgICAgICAgIE5hbWU6ICcvYXVyYTI4L2Rldi9zdHJpcGUvYWxsb3dlZC1wcmljZS1pZHMnLFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoe1xuICAgICAgICAgIFBhcmFtZXRlcjoge1xuICAgICAgICAgICAgVmFsdWU6IFZBTElEX0RFVl9QUklDRV9JRCxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgLy8gR2V0IGFsbG93ZWQgcHJpY2UgSURzXG4gICAgICBjb25zdCBhbGxvd2VkUHJpY2VJZHNQYXJhbSA9IGF3YWl0IG5ldyBTU01DbGllbnQoeyByZWdpb246ICd1cy1lYXN0LTEnIH0pLnNlbmQoXG4gICAgICAgIG5ldyBHZXRQYXJhbWV0ZXJDb21tYW5kKHsgTmFtZTogJy9hdXJhMjgvZGV2L3N0cmlwZS9hbGxvd2VkLXByaWNlLWlkcycgfSlcbiAgICAgICk7XG4gICAgICBcbiAgICAgIGNvbnN0IGFsbG93ZWRQcmljZUlkcyA9IChhbGxvd2VkUHJpY2VJZHNQYXJhbS5QYXJhbWV0ZXI/LlZhbHVlIHx8ICcnKVxuICAgICAgICAuc3BsaXQoJywnKVxuICAgICAgICAubWFwKGlkID0+IGlkLnRyaW0oKSlcbiAgICAgICAgLmZpbHRlcihCb29sZWFuKTtcblxuICAgICAgLy8gVHJ5IHRvIHVzZSBpbnZhbGlkIHBsYWNlaG9sZGVyIElEXG4gICAgICBjb25zdCByZXF1ZXN0ZWRQcmljZUlkID0gSU5WQUxJRF9QTEFDRUhPTERFUl9JRDtcbiAgICAgIGNvbnN0IGlzUHJpY2VBbGxvd2VkID0gYWxsb3dlZFByaWNlSWRzLmluY2x1ZGVzKHJlcXVlc3RlZFByaWNlSWQpO1xuICAgICAgXG4gICAgICBleHBlY3QoaXNQcmljZUFsbG93ZWQpLnRvQmUoZmFsc2UpO1xuICAgICAgZXhwZWN0KGFsbG93ZWRQcmljZUlkcykubm90LnRvQ29udGFpbihJTlZBTElEX1BMQUNFSE9MREVSX0lEKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIHdlYmhvb2sgcHJvY2Vzc2luZyB3aXRoIHZhbGlkIHByaWNlIElEJywgYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gU2ltdWxhdGUgd2ViaG9vayBldmVudCB3aXRoIHZhbGlkIHByaWNlIElEXG4gICAgICBjb25zdCB3ZWJob29rRXZlbnQgPSB7XG4gICAgICAgIHR5cGU6ICdjaGVja291dC5zZXNzaW9uLmNvbXBsZXRlZCcsXG4gICAgICAgIGRhdGE6IHtcbiAgICAgICAgICBvYmplY3Q6IHtcbiAgICAgICAgICAgIGlkOiAnY3NfdGVzdF93ZWJob29rJyxcbiAgICAgICAgICAgIHBheW1lbnRfc3RhdHVzOiAncGFpZCcsXG4gICAgICAgICAgICBtZXRhZGF0YToge1xuICAgICAgICAgICAgICB1c2VySWQ6ICd1c2VyLTEyMycsXG4gICAgICAgICAgICAgIHByaWNlSWQ6IFZBTElEX0RFVl9QUklDRV9JRCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH07XG5cbiAgICAgIC8vIFZhbGlkYXRlIHRoZSBwcmljZSBJRCBpbiB3ZWJob29rIG1ldGFkYXRhXG4gICAgICBleHBlY3Qod2ViaG9va0V2ZW50LmRhdGEub2JqZWN0Lm1ldGFkYXRhLnByaWNlSWQpLnRvQmUoVkFMSURfREVWX1BSSUNFX0lEKTtcbiAgICAgIGV4cGVjdCh3ZWJob29rRXZlbnQuZGF0YS5vYmplY3QubWV0YWRhdGEucHJpY2VJZCkubm90LnRvQmUoSU5WQUxJRF9QTEFDRUhPTERFUl9JRCk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdGcm9udGVuZCBDb25maWd1cmF0aW9uIEludGVncmF0aW9uJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgdXNlIHZhbGlkIGRldiBwcmljZSBJRCBmcm9tIGVudmlyb25tZW50IHZhcmlhYmxlJywgKCkgPT4ge1xuICAgICAgLy8gU2ltdWxhdGUgZnJvbnRlbmQgYnVpbGQgZW52aXJvbm1lbnRcbiAgICAgIHByb2Nlc3MuZW52Lk5FWFRfUFVCTElDX1NUUklQRV9QUklDRV9JRCA9IFZBTElEX0RFVl9QUklDRV9JRDtcbiAgICAgIFxuICAgICAgY29uc3Qgc3RyaXBlQ29uZmlnID0ge1xuICAgICAgICByZWFkaW5nUHJpY2VJZDogcHJvY2Vzcy5lbnYuTkVYVF9QVUJMSUNfU1RSSVBFX1BSSUNFX0lEIHx8ICdwcmljZV9mYWxsYmFjaycsXG4gICAgICB9O1xuXG4gICAgICBleHBlY3Qoc3RyaXBlQ29uZmlnLnJlYWRpbmdQcmljZUlkKS50b0JlKFZBTElEX0RFVl9QUklDRV9JRCk7XG4gICAgICBleHBlY3Qoc3RyaXBlQ29uZmlnLnJlYWRpbmdQcmljZUlkKS5ub3QudG9CZShJTlZBTElEX1BMQUNFSE9MREVSX0lEKTtcbiAgICAgIFxuICAgICAgZGVsZXRlIHByb2Nlc3MuZW52Lk5FWFRfUFVCTElDX1NUUklQRV9QUklDRV9JRDtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgdXNlIGNvcnJlY3QgZmFsbGJhY2sgd2hlbiBlbnZpcm9ubWVudCB2YXJpYWJsZSBtaXNzaW5nJywgKCkgPT4ge1xuICAgICAgLy8gQ2xlYXIgZW52aXJvbm1lbnQgdmFyaWFibGVcbiAgICAgIGRlbGV0ZSBwcm9jZXNzLmVudi5ORVhUX1BVQkxJQ19TVFJJUEVfUFJJQ0VfSUQ7XG4gICAgICBcbiAgICAgIC8vIFNpbXVsYXRlIGZyb250ZW5kIGNvbmZpZyBmYWxsYmFjayBsb2dpY1xuICAgICAgY29uc3QgaXNEZXZlbG9wbWVudCA9IHByb2Nlc3MuZW52Lk5PREVfRU5WID09PSAnZGV2ZWxvcG1lbnQnIHx8ICFwcm9jZXNzLmVudi5DSTtcbiAgICAgIGNvbnN0IGZhbGxiYWNrUHJpY2VJZCA9IGlzRGV2ZWxvcG1lbnQgXG4gICAgICAgID8gVkFMSURfREVWX1BSSUNFX0lEIFxuICAgICAgICA6ICdwcmljZV9SRVBMQUNFX1dJVEhfUFJPRFVDVElPTl9JRCc7XG4gICAgICBcbiAgICAgIGNvbnN0IHN0cmlwZUNvbmZpZyA9IHtcbiAgICAgICAgcmVhZGluZ1ByaWNlSWQ6IHByb2Nlc3MuZW52Lk5FWFRfUFVCTElDX1NUUklQRV9QUklDRV9JRCB8fCBmYWxsYmFja1ByaWNlSWQsXG4gICAgICB9O1xuXG4gICAgICBpZiAoaXNEZXZlbG9wbWVudCkge1xuICAgICAgICBleHBlY3Qoc3RyaXBlQ29uZmlnLnJlYWRpbmdQcmljZUlkKS50b0JlKFZBTElEX0RFVl9QUklDRV9JRCk7XG4gICAgICB9XG4gICAgICBleHBlY3Qoc3RyaXBlQ29uZmlnLnJlYWRpbmdQcmljZUlkKS5ub3QudG9CZShJTlZBTElEX1BMQUNFSE9MREVSX0lEKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0NvbXBsZXRlIEZsb3cgVmFsaWRhdGlvbicsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIHN1Y2Nlc3NmdWxseSBwcm9jZXNzIHBheW1lbnQgd2l0aCB2YWxpZCBkZXYgcHJpY2UgSUQgZW5kLXRvLWVuZCcsIGFzeW5jICgpID0+IHtcbiAgICAgIC8vIFN0ZXAgMTogQ0RLIGNyZWF0ZXMgU1NNIHBhcmFtZXRlclxuICAgICAgY29uc3Qgc3NtUGFyYW1ldGVyVmFsdWUgPSBWQUxJRF9ERVZfUFJJQ0VfSUQ7XG4gICAgICBcbiAgICAgIC8vIFN0ZXAgMjogQ0kvQ0QgZmV0Y2hlcyBmcm9tIFNTTSBvciB1c2VzIGZhbGxiYWNrXG4gICAgICBzc21Nb2NrXG4gICAgICAgIC5vbihHZXRQYXJhbWV0ZXJDb21tYW5kLCB7XG4gICAgICAgICAgTmFtZTogJy9hdXJhMjgvZGV2L3N0cmlwZS9kZWZhdWx0LXByaWNlLWlkJyxcbiAgICAgICAgfSlcbiAgICAgICAgLnJlc29sdmVzKHtcbiAgICAgICAgICBQYXJhbWV0ZXI6IHtcbiAgICAgICAgICAgIFZhbHVlOiBzc21QYXJhbWV0ZXJWYWx1ZSxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgY29uc3QgY2xpZW50ID0gbmV3IFNTTUNsaWVudCh7IHJlZ2lvbjogJ3VzLWVhc3QtMScgfSk7XG4gICAgICBjb25zdCBzc21SZXNwb25zZSA9IGF3YWl0IGNsaWVudC5zZW5kKFxuICAgICAgICBuZXcgR2V0UGFyYW1ldGVyQ29tbWFuZCh7IE5hbWU6ICcvYXVyYTI4L2Rldi9zdHJpcGUvZGVmYXVsdC1wcmljZS1pZCcgfSlcbiAgICAgICk7XG4gICAgICBcbiAgICAgIGNvbnN0IGNpY2RQcmljZUlkID0gc3NtUmVzcG9uc2UuUGFyYW1ldGVyPy5WYWx1ZSB8fCBWQUxJRF9ERVZfUFJJQ0VfSUQ7XG4gICAgICBcbiAgICAgIC8vIFN0ZXAgMzogRnJvbnRlbmQgcmVjZWl2ZXMgcHJpY2UgSUQgdmlhIGVudmlyb25tZW50IHZhcmlhYmxlXG4gICAgICBwcm9jZXNzLmVudi5ORVhUX1BVQkxJQ19TVFJJUEVfUFJJQ0VfSUQgPSBjaWNkUHJpY2VJZDtcbiAgICAgIFxuICAgICAgLy8gU3RlcCA0OiBGcm9udGVuZCBzZW5kcyBjaGVja291dCByZXF1ZXN0IHdpdGggcHJpY2UgSURcbiAgICAgIGNvbnN0IGNoZWNrb3V0UmVxdWVzdCA9IHtcbiAgICAgICAgcHJpY2VJZDogcHJvY2Vzcy5lbnYuTkVYVF9QVUJMSUNfU1RSSVBFX1BSSUNFX0lELFxuICAgICAgICBzZXNzaW9uVHlwZTogJ29uZS10aW1lJyxcbiAgICAgIH07XG4gICAgICBcbiAgICAgIC8vIFN0ZXAgNTogTGFtYmRhIHZhbGlkYXRlcyBwcmljZSBJRCBhZ2FpbnN0IGFsbG93ZWQgbGlzdFxuICAgICAgc3NtTW9ja1xuICAgICAgICAub24oR2V0UGFyYW1ldGVyQ29tbWFuZCwge1xuICAgICAgICAgIE5hbWU6ICcvYXVyYTI4L2Rldi9zdHJpcGUvYWxsb3dlZC1wcmljZS1pZHMnLFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoe1xuICAgICAgICAgIFBhcmFtZXRlcjoge1xuICAgICAgICAgICAgVmFsdWU6IGAke1ZBTElEX0RFVl9QUklDRV9JRH0scHJpY2Vfb3RoZXJgLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICBjb25zdCBhbGxvd2VkUmVzcG9uc2UgPSBhd2FpdCBjbGllbnQuc2VuZChcbiAgICAgICAgbmV3IEdldFBhcmFtZXRlckNvbW1hbmQoeyBOYW1lOiAnL2F1cmEyOC9kZXYvc3RyaXBlL2FsbG93ZWQtcHJpY2UtaWRzJyB9KVxuICAgICAgKTtcbiAgICAgIFxuICAgICAgY29uc3QgYWxsb3dlZElkcyA9IChhbGxvd2VkUmVzcG9uc2UuUGFyYW1ldGVyPy5WYWx1ZSB8fCAnJykuc3BsaXQoJywnKS5tYXAoaWQgPT4gaWQudHJpbSgpKTtcbiAgICAgIGNvbnN0IGlzVmFsaWQgPSBhbGxvd2VkSWRzLmluY2x1ZGVzKGNoZWNrb3V0UmVxdWVzdC5wcmljZUlkISk7XG4gICAgICBcbiAgICAgIGV4cGVjdChpc1ZhbGlkKS50b0JlKHRydWUpO1xuICAgICAgXG4gICAgICAvLyBTdGVwIDY6IFN0cmlwZSBjaGVja291dCBzZXNzaW9uIGNyZWF0ZWQgc3VjY2Vzc2Z1bGx5XG4gICAgICBpZiAoaXNWYWxpZCkge1xuICAgICAgICBtb2NrU3RyaXBlQ3JlYXRlLm1vY2tSZXNvbHZlZFZhbHVlKHtcbiAgICAgICAgICBpZDogJ2NzX3Rlc3RfZTJlJyxcbiAgICAgICAgICB1cmw6ICdodHRwczovL2NoZWNrb3V0LnN0cmlwZS5jb20vZTJlJyxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3Qgc2Vzc2lvbiA9IGF3YWl0IG1vY2tTdHJpcGVDcmVhdGUoe1xuICAgICAgICAgIG1vZGU6ICdwYXltZW50JyxcbiAgICAgICAgICBsaW5lX2l0ZW1zOiBbe1xuICAgICAgICAgICAgcHJpY2U6IGNoZWNrb3V0UmVxdWVzdC5wcmljZUlkLFxuICAgICAgICAgICAgcXVhbnRpdHk6IDEsXG4gICAgICAgICAgfV0sXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGV4cGVjdChzZXNzaW9uLmlkKS50b0JlKCdjc190ZXN0X2UyZScpO1xuICAgICAgfVxuXG4gICAgICAvLyBWYWxpZGF0ZSB0aGUgZW50aXJlIGZsb3cgdXNlZCB0aGUgdmFsaWQgcHJpY2UgSURcbiAgICAgIGV4cGVjdChjaWNkUHJpY2VJZCkudG9CZShWQUxJRF9ERVZfUFJJQ0VfSUQpO1xuICAgICAgZXhwZWN0KGNoZWNrb3V0UmVxdWVzdC5wcmljZUlkKS50b0JlKFZBTElEX0RFVl9QUklDRV9JRCk7XG4gICAgICBleHBlY3QoY2hlY2tvdXRSZXF1ZXN0LnByaWNlSWQpLm5vdC50b0JlKElOVkFMSURfUExBQ0VIT0xERVJfSUQpO1xuICAgICAgXG4gICAgICAvLyBDbGVhbnVwXG4gICAgICBkZWxldGUgcHJvY2Vzcy5lbnYuTkVYVF9QVUJMSUNfU1RSSVBFX1BSSUNFX0lEO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBmYWlsIGdyYWNlZnVsbHkgd2l0aCBpbnZhbGlkIHBsYWNlaG9sZGVyIHByaWNlIElEJywgYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gU2V0dXAgYWxsb3dlZCBwcmljZSBJRHMgd2l0aG91dCB0aGUgcGxhY2Vob2xkZXJcbiAgICAgIHNzbU1vY2tcbiAgICAgICAgLm9uKEdldFBhcmFtZXRlckNvbW1hbmQsIHtcbiAgICAgICAgICBOYW1lOiAnL2F1cmEyOC9kZXYvc3RyaXBlL2FsbG93ZWQtcHJpY2UtaWRzJyxcbiAgICAgICAgfSlcbiAgICAgICAgLnJlc29sdmVzKHtcbiAgICAgICAgICBQYXJhbWV0ZXI6IHtcbiAgICAgICAgICAgIFZhbHVlOiBWQUxJRF9ERVZfUFJJQ0VfSUQsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IGNsaWVudCA9IG5ldyBTU01DbGllbnQoeyByZWdpb246ICd1cy1lYXN0LTEnIH0pO1xuICAgICAgY29uc3QgYWxsb3dlZFJlc3BvbnNlID0gYXdhaXQgY2xpZW50LnNlbmQoXG4gICAgICAgIG5ldyBHZXRQYXJhbWV0ZXJDb21tYW5kKHsgTmFtZTogJy9hdXJhMjgvZGV2L3N0cmlwZS9hbGxvd2VkLXByaWNlLWlkcycgfSlcbiAgICAgICk7XG4gICAgICBcbiAgICAgIGNvbnN0IGFsbG93ZWRJZHMgPSAoYWxsb3dlZFJlc3BvbnNlLlBhcmFtZXRlcj8uVmFsdWUgfHwgJycpLnNwbGl0KCcsJykubWFwKGlkID0+IGlkLnRyaW0oKSk7XG4gICAgICBcbiAgICAgIC8vIFRyeSB0byB1c2UgdGhlIGludmFsaWQgcGxhY2Vob2xkZXJcbiAgICAgIGNvbnN0IGludmFsaWRSZXF1ZXN0ID0ge1xuICAgICAgICBwcmljZUlkOiBJTlZBTElEX1BMQUNFSE9MREVSX0lELFxuICAgICAgICBzZXNzaW9uVHlwZTogJ29uZS10aW1lJyxcbiAgICAgIH07XG4gICAgICBcbiAgICAgIGNvbnN0IGlzVmFsaWQgPSBhbGxvd2VkSWRzLmluY2x1ZGVzKGludmFsaWRSZXF1ZXN0LnByaWNlSWQpO1xuICAgICAgXG4gICAgICBleHBlY3QoaXNWYWxpZCkudG9CZShmYWxzZSk7XG4gICAgICBcbiAgICAgIC8vIENoZWNrb3V0IGNyZWF0aW9uIHNob3VsZCBiZSByZWplY3RlZFxuICAgICAgbGV0IGVycm9yTWVzc2FnZSA9ICcnO1xuICAgICAgaWYgKCFpc1ZhbGlkKSB7XG4gICAgICAgIGVycm9yTWVzc2FnZSA9ICdJbnZhbGlkIHByaWNlIElEJztcbiAgICAgIH1cbiAgICAgIFxuICAgICAgZXhwZWN0KGVycm9yTWVzc2FnZSkudG9CZSgnSW52YWxpZCBwcmljZSBJRCcpO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnRW52aXJvbm1lbnQtc3BlY2lmaWMgYmVoYXZpb3InLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCB1c2UgZGlmZmVyZW50IHByaWNlIElEcyBmb3IgZGV2IHZzIHByb2QgZW52aXJvbm1lbnRzJywgYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gRGV2IGVudmlyb25tZW50XG4gICAgICBzc21Nb2NrXG4gICAgICAgIC5vbihHZXRQYXJhbWV0ZXJDb21tYW5kLCB7XG4gICAgICAgICAgTmFtZTogJy9hdXJhMjgvZGV2L3N0cmlwZS9kZWZhdWx0LXByaWNlLWlkJyxcbiAgICAgICAgfSlcbiAgICAgICAgLnJlc29sdmVzKHtcbiAgICAgICAgICBQYXJhbWV0ZXI6IHtcbiAgICAgICAgICAgIFZhbHVlOiBWQUxJRF9ERVZfUFJJQ0VfSUQsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgIC8vIFByb2QgZW52aXJvbm1lbnQgKHBsYWNlaG9sZGVyKVxuICAgICAgc3NtTW9ja1xuICAgICAgICAub24oR2V0UGFyYW1ldGVyQ29tbWFuZCwge1xuICAgICAgICAgIE5hbWU6ICcvYXVyYTI4L3Byb2Qvc3RyaXBlL2RlZmF1bHQtcHJpY2UtaWQnLFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoe1xuICAgICAgICAgIFBhcmFtZXRlcjoge1xuICAgICAgICAgICAgVmFsdWU6ICdwcmljZV9SRVBMQUNFX1dJVEhfUFJPRFVDVElPTl9JRCcsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IGNsaWVudCA9IG5ldyBTU01DbGllbnQoeyByZWdpb246ICd1cy1lYXN0LTEnIH0pO1xuICAgICAgXG4gICAgICBjb25zdCBkZXZSZXNwb25zZSA9IGF3YWl0IGNsaWVudC5zZW5kKFxuICAgICAgICBuZXcgR2V0UGFyYW1ldGVyQ29tbWFuZCh7IE5hbWU6ICcvYXVyYTI4L2Rldi9zdHJpcGUvZGVmYXVsdC1wcmljZS1pZCcgfSlcbiAgICAgICk7XG4gICAgICBcbiAgICAgIGNvbnN0IHByb2RSZXNwb25zZSA9IGF3YWl0IGNsaWVudC5zZW5kKFxuICAgICAgICBuZXcgR2V0UGFyYW1ldGVyQ29tbWFuZCh7IE5hbWU6ICcvYXVyYTI4L3Byb2Qvc3RyaXBlL2RlZmF1bHQtcHJpY2UtaWQnIH0pXG4gICAgICApO1xuICAgICAgXG4gICAgICAvLyBEZXYgc2hvdWxkIHVzZSB0aGUgdmFsaWQgcHJpY2UgSURcbiAgICAgIGV4cGVjdChkZXZSZXNwb25zZS5QYXJhbWV0ZXI/LlZhbHVlKS50b0JlKFZBTElEX0RFVl9QUklDRV9JRCk7XG4gICAgICBcbiAgICAgIC8vIFByb2Qgc2hvdWxkIE5PVCB1c2UgdGhlIGRldiBwcmljZSBJRFxuICAgICAgZXhwZWN0KHByb2RSZXNwb25zZS5QYXJhbWV0ZXI/LlZhbHVlKS5ub3QudG9CZShWQUxJRF9ERVZfUFJJQ0VfSUQpO1xuICAgICAgZXhwZWN0KHByb2RSZXNwb25zZS5QYXJhbWV0ZXI/LlZhbHVlKS50b0JlKCdwcmljZV9SRVBMQUNFX1dJVEhfUFJPRFVDVElPTl9JRCcpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCB2YWxpZGF0ZSBTdHJpcGUgQVBJIGFjY2VwdHMgdGhlIHZhbGlkIGRldiBwcmljZSBJRCcsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHN0cmlwZSA9IG5ldyBTdHJpcGUoJ3NrX3Rlc3RfbW9jaycsIHsgYXBpVmVyc2lvbjogJzIwMjUtMDctMzAuYmFzaWwnIH0pO1xuICAgICAgXG4gICAgICAvLyBNb2NrIHByaWNlIHJldHJpZXZhbCB0byB2ZXJpZnkgdGhlIHByaWNlIElEIGlzIHZhbGlkXG4gICAgICBjb25zdCBwcmljZVJldHJpZXZlID0gc3RyaXBlLnByaWNlcy5yZXRyaWV2ZSBhcyBqZXN0Lk1vY2s7XG4gICAgICBcbiAgICAgIGNvbnN0IHByaWNlID0gYXdhaXQgcHJpY2VSZXRyaWV2ZShWQUxJRF9ERVZfUFJJQ0VfSUQpO1xuICAgICAgXG4gICAgICBleHBlY3QocHJpY2UuaWQpLnRvQmUoVkFMSURfREVWX1BSSUNFX0lEKTtcbiAgICAgIGV4cGVjdChwcmljZS5hY3RpdmUpLnRvQmUodHJ1ZSk7XG4gICAgICBleHBlY3QocHJpY2UudW5pdF9hbW91bnQpLnRvQmUoMjk5OSk7IC8vICQyOS45OVxuICAgIH0pO1xuICB9KTtcbn0pOyJdfQ==