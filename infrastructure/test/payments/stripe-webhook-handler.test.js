"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const stripe_webhook_handler_1 = require("../../lambda/payments/stripe-webhook-handler");
const aws_sdk_client_mock_1 = require("aws-sdk-client-mock");
const client_ssm_1 = require("@aws-sdk/client-ssm");
const client_lambda_1 = require("@aws-sdk/client-lambda");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const util_1 = require("util");
// Mock AWS clients
const ssmMock = (0, aws_sdk_client_mock_1.mockClient)(client_ssm_1.SSMClient);
const lambdaMock = (0, aws_sdk_client_mock_1.mockClient)(client_lambda_1.LambdaClient);
const dynamoMock = (0, aws_sdk_client_mock_1.mockClient)(lib_dynamodb_1.DynamoDBDocumentClient);
// Mock Stripe constructEvent
const mockConstructEvent = jest.fn();
const mockStripe = {
    webhooks: {
        constructEvent: mockConstructEvent,
    },
};
// Mock Stripe module
jest.mock('stripe', () => {
    return jest.fn().mockImplementation(() => mockStripe);
});
describe('Stripe Webhook Handler Lambda', () => {
    const mockStripeApiKey = 'sk_test_mock_key_123';
    const mockWebhookSecret = 'whsec_test_secret_123';
    const mockUserId = 'test-user-123';
    const mockSessionId = 'cs_test_session_123';
    const mockEventId = 'evt_test_123';
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        ssmMock.reset();
        lambdaMock.reset();
        dynamoMock.reset();
        mockConstructEvent.mockReset();
        // Setup environment variables
        process.env.STRIPE_API_KEY_PARAMETER_NAME = '/aura28/test/stripe/api-key';
        process.env.STRIPE_WEBHOOK_SECRET_PARAMETER_NAME = '/aura28/test/stripe/webhook-secret';
        process.env.GENERATE_READING_FUNCTION_NAME = 'test-generate-reading-function';
        process.env.WEBHOOK_PROCESSING_TABLE_NAME = 'test-webhook-processing-table';
        // Setup default SSM parameter responses
        ssmMock
            .on(client_ssm_1.GetParameterCommand, {
            Name: '/aura28/test/stripe/api-key',
            WithDecryption: true,
        })
            .resolves({
            Parameter: {
                Value: mockStripeApiKey,
            },
        });
        ssmMock
            .on(client_ssm_1.GetParameterCommand, {
            Name: '/aura28/test/stripe/webhook-secret',
            WithDecryption: true,
        })
            .resolves({
            Parameter: {
                Value: mockWebhookSecret,
            },
        });
    });
    afterEach(() => {
        jest.clearAllTimers();
        jest.useRealTimers();
    });
    const createMockEvent = (overrides = {}) => {
        const defaultBody = JSON.stringify({
            id: mockEventId,
            type: 'checkout.session.completed',
            data: {
                object: {
                    id: mockSessionId,
                    client_reference_id: mockUserId,
                    payment_status: 'paid',
                    customer_email: 'test@example.com',
                    amount_total: 2900,
                    currency: 'usd',
                    payment_intent: 'pi_test_123',
                    metadata: {
                        userId: mockUserId,
                        sessionType: 'one-time',
                    },
                },
            },
        });
        return {
            httpMethod: 'POST',
            path: '/api/webhooks/stripe',
            headers: {
                'content-type': 'application/json',
                'stripe-signature': 'test-signature',
            },
            body: overrides.body || defaultBody,
            isBase64Encoded: false,
            ...overrides,
        };
    };
    const createStripeEvent = (type = 'checkout.session.completed', overrides = {}) => {
        return {
            id: mockEventId,
            object: 'event',
            api_version: '2025-07-30.basil',
            created: Math.floor(Date.now() / 1000),
            type,
            data: {
                object: {
                    id: mockSessionId,
                    object: 'checkout.session',
                    client_reference_id: mockUserId,
                    payment_status: 'paid',
                    customer_email: 'test@example.com',
                    amount_total: 2900,
                    currency: 'usd',
                    payment_intent: 'pi_test_123',
                    metadata: {
                        userId: mockUserId,
                        sessionType: 'one-time',
                    },
                    ...overrides,
                },
            },
            livemode: false,
            pending_webhooks: 1,
            request: {
                id: null,
                idempotency_key: null,
            },
        };
    };
    describe('Webhook signature verification', () => {
        it('should successfully verify a valid webhook signature', async () => {
            const stripeEvent = createStripeEvent();
            mockConstructEvent.mockReturnValue(stripeEvent);
            // Mock idempotency check - event not processed
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({ Item: undefined });
            // Mock successful Lambda invocation
            const readingId = 'reading-123';
            lambdaMock.on(client_lambda_1.InvokeCommand).resolves({
                StatusCode: 200,
                Payload: new util_1.TextEncoder().encode(JSON.stringify({
                    statusCode: 200,
                    body: JSON.stringify({ readingId }),
                })),
            });
            // Mock recording processed event
            dynamoMock.on(lib_dynamodb_1.PutCommand).resolves({});
            const event = createMockEvent();
            const result = await (0, stripe_webhook_handler_1.handler)(event);
            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body).toEqual({
                received: true,
                success: true,
                readingId,
            });
            expect(mockConstructEvent).toHaveBeenCalledWith(expect.any(String), 'test-signature', mockWebhookSecret);
        });
        it('should reject request with invalid signature', async () => {
            mockConstructEvent.mockImplementation(() => {
                throw new Error('Invalid webhook signature');
            });
            const event = createMockEvent();
            const result = await (0, stripe_webhook_handler_1.handler)(event);
            expect(result.statusCode).toBe(400);
            const body = JSON.parse(result.body);
            expect(body).toEqual({ error: 'Invalid signature' });
        });
        it('should reject request with missing signature header', async () => {
            const event = createMockEvent({
                headers: {
                    'content-type': 'application/json',
                },
            });
            const result = await (0, stripe_webhook_handler_1.handler)(event);
            expect(result.statusCode).toBe(400);
            const body = JSON.parse(result.body);
            expect(body).toEqual({ error: 'Missing signature header' });
        });
        it('should handle signature header with different casing', async () => {
            const stripeEvent = createStripeEvent();
            mockConstructEvent.mockReturnValue(stripeEvent);
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({ Item: undefined });
            lambdaMock.on(client_lambda_1.InvokeCommand).resolves({
                StatusCode: 200,
                Payload: new util_1.TextEncoder().encode(JSON.stringify({
                    statusCode: 200,
                    body: JSON.stringify({ readingId: 'reading-123' }),
                })),
            });
            dynamoMock.on(lib_dynamodb_1.PutCommand).resolves({});
            const event = createMockEvent({
                headers: {
                    'content-type': 'application/json',
                    'Stripe-Signature': 'test-signature', // Capital case
                },
            });
            const result = await (0, stripe_webhook_handler_1.handler)(event);
            expect(result.statusCode).toBe(200);
            expect(mockConstructEvent).toHaveBeenCalled();
        });
        it('should reject request with missing body', async () => {
            const event = createMockEvent({
                body: null,
            });
            const result = await (0, stripe_webhook_handler_1.handler)(event);
            expect(result.statusCode).toBe(400);
            const body = JSON.parse(result.body);
            expect(body).toEqual({ error: 'Missing request body' });
        });
    });
    describe('Event processing for checkout.session.completed', () => {
        it('should process a successful checkout session', async () => {
            const stripeEvent = createStripeEvent();
            mockConstructEvent.mockReturnValue(stripeEvent);
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({ Item: undefined });
            const readingId = 'reading-456';
            lambdaMock.on(client_lambda_1.InvokeCommand).resolves({
                StatusCode: 200,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                Payload: new util_1.TextEncoder().encode(JSON.stringify({
                    statusCode: 200,
                    body: JSON.stringify({ readingId }),
                })),
            });
            dynamoMock.on(lib_dynamodb_1.PutCommand).resolves({});
            const event = createMockEvent();
            const result = await (0, stripe_webhook_handler_1.handler)(event);
            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body.readingId).toBe(readingId);
            // Verify Lambda was invoked with correct parameters
            expect(lambdaMock).toHaveReceivedCommandWith(client_lambda_1.InvokeCommand, {
                FunctionName: 'test-generate-reading-function',
                InvocationType: 'RequestResponse',
                Payload: expect.stringContaining(mockUserId),
            });
            // Verify the payload structure
            const invokeCall = lambdaMock.commandCalls(client_lambda_1.InvokeCommand)[0];
            const payload = JSON.parse(invokeCall.args[0].input.Payload);
            expect(payload).toMatchObject({
                source: 'webhook',
                userId: mockUserId,
                metadata: expect.objectContaining({
                    sessionId: mockSessionId,
                    customerEmail: 'test@example.com',
                    amountTotal: 2900,
                    currency: 'usd',
                }),
                requestContext: {
                    authorizer: {
                        claims: {
                            sub: mockUserId,
                        },
                    },
                },
            });
        });
        it('should skip processing for unpaid sessions', async () => {
            const stripeEvent = createStripeEvent('checkout.session.completed', {
                payment_status: 'unpaid',
            });
            mockConstructEvent.mockReturnValue(stripeEvent);
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({ Item: undefined });
            dynamoMock.on(lib_dynamodb_1.PutCommand).resolves({});
            const event = createMockEvent();
            const result = await (0, stripe_webhook_handler_1.handler)(event);
            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body).toEqual({
                received: true,
                success: false,
            });
            // Verify Lambda was not invoked
            expect(lambdaMock).not.toHaveReceivedCommand(client_lambda_1.InvokeCommand);
        });
        it('should handle missing userId in session', async () => {
            const stripeEvent = createStripeEvent('checkout.session.completed', {
                client_reference_id: null,
                metadata: {},
            });
            mockConstructEvent.mockReturnValue(stripeEvent);
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({ Item: undefined });
            dynamoMock.on(lib_dynamodb_1.PutCommand).resolves({});
            const event = createMockEvent();
            const result = await (0, stripe_webhook_handler_1.handler)(event);
            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body).toEqual({
                received: true,
                success: false,
            });
            // Verify Lambda was not invoked
            expect(lambdaMock).not.toHaveReceivedCommand(client_lambda_1.InvokeCommand);
        });
        it('should extract userId from metadata if client_reference_id is missing', async () => {
            const stripeEvent = createStripeEvent('checkout.session.completed', {
                client_reference_id: null,
                metadata: { userId: mockUserId },
            });
            mockConstructEvent.mockReturnValue(stripeEvent);
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({ Item: undefined });
            const readingId = 'reading-789';
            lambdaMock.on(client_lambda_1.InvokeCommand).resolves({
                StatusCode: 200,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                Payload: new util_1.TextEncoder().encode(JSON.stringify({
                    statusCode: 200,
                    body: JSON.stringify({ readingId }),
                })),
            });
            dynamoMock.on(lib_dynamodb_1.PutCommand).resolves({});
            const event = createMockEvent();
            const result = await (0, stripe_webhook_handler_1.handler)(event);
            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body.readingId).toBe(readingId);
            // Verify Lambda was invoked with userId from metadata
            const invokeCall = lambdaMock.commandCalls(client_lambda_1.InvokeCommand)[0];
            const payload = JSON.parse(invokeCall.args[0].input.Payload);
            expect(payload.userId).toBe(mockUserId);
        });
        it('should process async payment succeeded events', async () => {
            const stripeEvent = createStripeEvent('checkout.session.async_payment_succeeded');
            mockConstructEvent.mockReturnValue(stripeEvent);
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({ Item: undefined });
            const readingId = 'reading-async';
            lambdaMock.on(client_lambda_1.InvokeCommand).resolves({
                StatusCode: 200,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                Payload: new util_1.TextEncoder().encode(JSON.stringify({
                    statusCode: 200,
                    body: JSON.stringify({ readingId }),
                })),
            });
            dynamoMock.on(lib_dynamodb_1.PutCommand).resolves({});
            const event = createMockEvent({
                body: JSON.stringify({
                    id: mockEventId,
                    type: 'checkout.session.async_payment_succeeded',
                    data: {
                        object: {
                            id: mockSessionId,
                            client_reference_id: mockUserId,
                            payment_status: 'paid',
                            customer_email: 'test@example.com',
                            amount_total: 2900,
                            currency: 'usd',
                        },
                    },
                }),
            });
            const result = await (0, stripe_webhook_handler_1.handler)(event);
            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body.readingId).toBe(readingId);
        });
    });
    describe('Idempotency checking', () => {
        it('should skip processing for already processed events', async () => {
            const stripeEvent = createStripeEvent();
            mockConstructEvent.mockReturnValue(stripeEvent);
            // Mock idempotency check - event already processed
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({
                Item: {
                    eventId: mockEventId,
                    sessionId: mockSessionId,
                    processedAt: '2024-01-01T00:00:00Z',
                    status: 'processed',
                    readingId: 'existing-reading-123',
                },
            });
            const event = createMockEvent();
            const result = await (0, stripe_webhook_handler_1.handler)(event);
            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body).toEqual({
                received: true,
                status: 'already_processed',
            });
            // Verify Lambda was not invoked
            expect(lambdaMock).not.toHaveReceivedCommand(client_lambda_1.InvokeCommand);
            // Verify no new record was written
            expect(dynamoMock).not.toHaveReceivedCommand(lib_dynamodb_1.PutCommand);
        });
        it('should continue processing if idempotency check fails', async () => {
            const stripeEvent = createStripeEvent();
            mockConstructEvent.mockReturnValue(stripeEvent);
            // Mock idempotency check failure
            dynamoMock.on(lib_dynamodb_1.GetCommand).rejects(new Error('DynamoDB error'));
            const readingId = 'reading-after-error';
            lambdaMock.on(client_lambda_1.InvokeCommand).resolves({
                StatusCode: 200,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                Payload: new util_1.TextEncoder().encode(JSON.stringify({
                    statusCode: 200,
                    body: JSON.stringify({ readingId }),
                })),
            });
            dynamoMock.on(lib_dynamodb_1.PutCommand).resolves({});
            const event = createMockEvent();
            const result = await (0, stripe_webhook_handler_1.handler)(event);
            // Should continue processing despite idempotency check error
            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body.readingId).toBe(readingId);
        });
        it('should handle missing webhook processing table gracefully', async () => {
            delete process.env.WEBHOOK_PROCESSING_TABLE_NAME;
            const stripeEvent = createStripeEvent();
            mockConstructEvent.mockReturnValue(stripeEvent);
            const readingId = 'reading-no-table';
            lambdaMock.on(client_lambda_1.InvokeCommand).resolves({
                StatusCode: 200,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                Payload: new util_1.TextEncoder().encode(JSON.stringify({
                    statusCode: 200,
                    body: JSON.stringify({ readingId }),
                })),
            });
            const event = createMockEvent();
            const result = await (0, stripe_webhook_handler_1.handler)(event);
            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body.readingId).toBe(readingId);
            // Verify no DynamoDB operations were attempted
            expect(dynamoMock).not.toHaveReceivedCommand(lib_dynamodb_1.GetCommand);
            expect(dynamoMock).not.toHaveReceivedCommand(lib_dynamodb_1.PutCommand);
        });
    });
    describe('Error handling', () => {
        it('should handle Lambda invocation failure', async () => {
            const stripeEvent = createStripeEvent();
            mockConstructEvent.mockReturnValue(stripeEvent);
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({ Item: undefined });
            // Mock Lambda invocation failure
            lambdaMock.on(client_lambda_1.InvokeCommand).resolves({
                StatusCode: 500,
            });
            dynamoMock.on(lib_dynamodb_1.PutCommand).resolves({});
            const event = createMockEvent();
            const resultPromise = (0, stripe_webhook_handler_1.handler)(event);
            // Advance timers to handle all retries
            await jest.runAllTimersAsync();
            const result = await resultPromise;
            expect(result.statusCode).toBe(200); // Still return 200 to Stripe
            const body = JSON.parse(result.body);
            expect(body).toEqual({
                received: true,
                success: false,
            });
            // Verify failure was recorded
            expect(dynamoMock).toHaveReceivedCommandWith(lib_dynamodb_1.PutCommand, {
                TableName: 'test-webhook-processing-table',
                Item: expect.objectContaining({
                    status: 'failed',
                    error: expect.any(String),
                }),
            });
        });
        it('should handle Lambda function error', async () => {
            const stripeEvent = createStripeEvent();
            mockConstructEvent.mockReturnValue(stripeEvent);
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({ Item: undefined });
            // Mock Lambda function error
            lambdaMock.on(client_lambda_1.InvokeCommand).resolves({
                StatusCode: 200,
                FunctionError: 'Unhandled',
                Payload: new util_1.TextEncoder().encode(JSON.stringify({
                    errorMessage: 'Function error',
                })),
            });
            dynamoMock.on(lib_dynamodb_1.PutCommand).resolves({});
            const event = createMockEvent();
            const resultPromise = (0, stripe_webhook_handler_1.handler)(event);
            // Advance timers to handle all retries
            await jest.runAllTimersAsync();
            const result = await resultPromise;
            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body).toEqual({
                received: true,
                success: false,
            });
        });
        it('should handle reading generation failure', async () => {
            const stripeEvent = createStripeEvent();
            mockConstructEvent.mockReturnValue(stripeEvent);
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({ Item: undefined });
            // Mock reading generation failure
            lambdaMock.on(client_lambda_1.InvokeCommand).resolves({
                StatusCode: 200,
                Payload: new util_1.TextEncoder().encode(JSON.stringify({
                    statusCode: 400,
                    body: 'User profile not found',
                })),
            });
            dynamoMock.on(lib_dynamodb_1.PutCommand).resolves({});
            const event = createMockEvent();
            const resultPromise = (0, stripe_webhook_handler_1.handler)(event);
            // Advance timers to handle all retries
            await jest.runAllTimersAsync();
            const result = await resultPromise;
            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body).toEqual({
                received: true,
                success: false,
            });
        });
        it('should handle Lambda client errors', async () => {
            const stripeEvent = createStripeEvent();
            mockConstructEvent.mockReturnValue(stripeEvent);
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({ Item: undefined });
            // Mock Lambda client error
            lambdaMock.on(client_lambda_1.InvokeCommand).rejects(new Error('Lambda service error'));
            dynamoMock.on(lib_dynamodb_1.PutCommand).resolves({});
            const event = createMockEvent();
            const resultPromise = (0, stripe_webhook_handler_1.handler)(event);
            // Advance timers to handle all retries
            await jest.runAllTimersAsync();
            const result = await resultPromise;
            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body).toEqual({
                received: true,
                success: false,
            });
        });
        it('should handle missing generate reading function name', async () => {
            delete process.env.GENERATE_READING_FUNCTION_NAME;
            const stripeEvent = createStripeEvent();
            mockConstructEvent.mockReturnValue(stripeEvent);
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({ Item: undefined });
            dynamoMock.on(lib_dynamodb_1.PutCommand).resolves({});
            const event = createMockEvent();
            const result = await (0, stripe_webhook_handler_1.handler)(event);
            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body).toEqual({
                received: true,
                success: false,
            });
        });
        it('should handle SSM parameter retrieval failure for API key', async () => {
            ssmMock
                .on(client_ssm_1.GetParameterCommand, {
                Name: '/aura28/test/stripe/api-key',
                WithDecryption: true,
            })
                .rejects(new Error('Parameter not found'));
            const event = createMockEvent();
            const result = await (0, stripe_webhook_handler_1.handler)(event);
            expect(result.statusCode).toBe(500);
            const body = JSON.parse(result.body);
            expect(body).toEqual({ error: 'Internal server error' });
        });
        it('should handle SSM parameter retrieval failure for webhook secret', async () => {
            ssmMock
                .on(client_ssm_1.GetParameterCommand, {
                Name: '/aura28/test/stripe/webhook-secret',
                WithDecryption: true,
            })
                .rejects(new Error('Parameter not found'));
            const event = createMockEvent();
            const result = await (0, stripe_webhook_handler_1.handler)(event);
            expect(result.statusCode).toBe(500);
            const body = JSON.parse(result.body);
            expect(body).toEqual({ error: 'Internal server error' });
        });
        it('should handle empty SSM parameter values', async () => {
            ssmMock
                .on(client_ssm_1.GetParameterCommand, {
                Name: '/aura28/test/stripe/webhook-secret',
                WithDecryption: true,
            })
                .resolves({
                Parameter: {
                    Value: '',
                },
            });
            const event = createMockEvent();
            const result = await (0, stripe_webhook_handler_1.handler)(event);
            expect(result.statusCode).toBe(500);
            const body = JSON.parse(result.body);
            expect(body).toEqual({ error: 'Internal server error' });
        });
    });
    describe('Unhandled event types', () => {
        it('should gracefully handle unhandled event types', async () => {
            const stripeEvent = createStripeEvent('payment_intent.succeeded');
            mockConstructEvent.mockReturnValue(stripeEvent);
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({ Item: undefined });
            dynamoMock.on(lib_dynamodb_1.PutCommand).resolves({});
            const event = createMockEvent({
                body: JSON.stringify({
                    id: mockEventId,
                    type: 'payment_intent.succeeded',
                    data: {
                        object: {
                            id: 'pi_test_123',
                        },
                    },
                }),
            });
            const result = await (0, stripe_webhook_handler_1.handler)(event);
            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body).toEqual({
                received: true,
                success: false,
            });
            // Verify event was recorded as failed
            expect(dynamoMock).toHaveReceivedCommandWith(lib_dynamodb_1.PutCommand, {
                TableName: 'test-webhook-processing-table',
                Item: expect.objectContaining({
                    status: 'failed',
                    error: expect.stringContaining('Unhandled event type'),
                }),
            });
        });
    });
    describe('Base64 encoding handling', () => {
        it('should handle base64 encoded body', async () => {
            const stripeEvent = createStripeEvent();
            mockConstructEvent.mockReturnValue(stripeEvent);
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({ Item: undefined });
            const readingId = 'reading-base64';
            lambdaMock.on(client_lambda_1.InvokeCommand).resolves({
                StatusCode: 200,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                Payload: new util_1.TextEncoder().encode(JSON.stringify({
                    statusCode: 200,
                    body: JSON.stringify({ readingId }),
                })),
            });
            dynamoMock.on(lib_dynamodb_1.PutCommand).resolves({});
            const rawBody = JSON.stringify({
                id: mockEventId,
                type: 'checkout.session.completed',
                data: {
                    object: {
                        id: mockSessionId,
                        client_reference_id: mockUserId,
                        payment_status: 'paid',
                    },
                },
            });
            const event = createMockEvent({
                body: Buffer.from(rawBody).toString('base64'),
                isBase64Encoded: true,
            });
            const result = await (0, stripe_webhook_handler_1.handler)(event);
            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body.readingId).toBe(readingId);
        });
        it('should handle API Gateway custom template format', async () => {
            const stripeEvent = createStripeEvent();
            mockConstructEvent.mockReturnValue(stripeEvent);
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({ Item: undefined });
            const readingId = 'reading-template';
            lambdaMock.on(client_lambda_1.InvokeCommand).resolves({
                StatusCode: 200,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                Payload: new util_1.TextEncoder().encode(JSON.stringify({
                    statusCode: 200,
                    body: JSON.stringify({ readingId }),
                })),
            });
            dynamoMock.on(lib_dynamodb_1.PutCommand).resolves({});
            const rawBody = JSON.stringify({
                id: mockEventId,
                type: 'checkout.session.completed',
                data: {
                    object: {
                        id: mockSessionId,
                        client_reference_id: mockUserId,
                        payment_status: 'paid',
                    },
                },
            });
            // API Gateway template format
            const event = createMockEvent({
                body: JSON.stringify({
                    body: Buffer.from(rawBody).toString('base64'),
                    headers: {
                        'stripe-signature': 'test-signature',
                    },
                }),
            });
            const result = await (0, stripe_webhook_handler_1.handler)(event);
            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body.readingId).toBe(readingId);
        });
    });
    describe('Metadata handling', () => {
        it('should include all session metadata in Lambda invocation', async () => {
            const customMetadata = {
                campaign: 'summer2024',
                referrer: 'newsletter',
                promoCode: 'SAVE20',
            };
            const stripeEvent = createStripeEvent('checkout.session.completed', {
                metadata: {
                    userId: mockUserId,
                    ...customMetadata,
                },
            });
            mockConstructEvent.mockReturnValue(stripeEvent);
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({ Item: undefined });
            const readingId = 'reading-metadata';
            lambdaMock.on(client_lambda_1.InvokeCommand).resolves({
                StatusCode: 200,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                Payload: new util_1.TextEncoder().encode(JSON.stringify({
                    statusCode: 200,
                    body: JSON.stringify({ readingId }),
                })),
            });
            dynamoMock.on(lib_dynamodb_1.PutCommand).resolves({});
            const event = createMockEvent();
            const result = await (0, stripe_webhook_handler_1.handler)(event);
            expect(result.statusCode).toBe(200);
            // Verify metadata was passed to Lambda
            const invokeCall = lambdaMock.commandCalls(client_lambda_1.InvokeCommand)[0];
            const payload = JSON.parse(invokeCall.args[0].input.Payload);
            expect(payload.metadata).toMatchObject({
                sessionId: mockSessionId,
                userId: mockUserId,
                ...customMetadata,
            });
        });
        it('should handle null values in session data', async () => {
            const stripeEvent = createStripeEvent('checkout.session.completed', {
                customer_email: null,
                amount_total: null,
                currency: null,
                payment_intent: null,
            });
            mockConstructEvent.mockReturnValue(stripeEvent);
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({ Item: undefined });
            const readingId = 'reading-null-values';
            lambdaMock.on(client_lambda_1.InvokeCommand).resolves({
                StatusCode: 200,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                Payload: new util_1.TextEncoder().encode(JSON.stringify({
                    statusCode: 200,
                    body: JSON.stringify({ readingId }),
                })),
            });
            dynamoMock.on(lib_dynamodb_1.PutCommand).resolves({});
            const event = createMockEvent();
            const result = await (0, stripe_webhook_handler_1.handler)(event);
            expect(result.statusCode).toBe(200);
            // Verify null values were filtered out
            const invokeCall = lambdaMock.commandCalls(client_lambda_1.InvokeCommand)[0];
            const payload = JSON.parse(invokeCall.args[0].input.Payload);
            expect(payload.metadata).not.toHaveProperty('customerEmail');
            expect(payload.metadata).not.toHaveProperty('amountTotal');
            expect(payload.metadata).not.toHaveProperty('currency');
            expect(payload.metadata).not.toHaveProperty('paymentIntentId');
        });
        it('should handle payment_intent as object', async () => {
            const stripeEvent = createStripeEvent('checkout.session.completed', {
                payment_intent: { id: 'pi_test_123' },
            });
            mockConstructEvent.mockReturnValue(stripeEvent);
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({ Item: undefined });
            const readingId = 'reading-pi-object';
            lambdaMock.on(client_lambda_1.InvokeCommand).resolves({
                StatusCode: 200,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                Payload: new util_1.TextEncoder().encode(JSON.stringify({
                    statusCode: 200,
                    body: JSON.stringify({ readingId }),
                })),
            });
            dynamoMock.on(lib_dynamodb_1.PutCommand).resolves({});
            const event = createMockEvent();
            const result = await (0, stripe_webhook_handler_1.handler)(event);
            expect(result.statusCode).toBe(200);
            // Verify payment_intent object was not included in metadata
            const invokeCall = lambdaMock.commandCalls(client_lambda_1.InvokeCommand)[0];
            const payload = JSON.parse(invokeCall.args[0].input.Payload);
            expect(payload.metadata).not.toHaveProperty('paymentIntentId');
        });
    });
    describe('Recording processed events', () => {
        it('should record successful processing', async () => {
            const stripeEvent = createStripeEvent();
            mockConstructEvent.mockReturnValue(stripeEvent);
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({ Item: undefined });
            const readingId = 'reading-record';
            lambdaMock.on(client_lambda_1.InvokeCommand).resolves({
                StatusCode: 200,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                Payload: new util_1.TextEncoder().encode(JSON.stringify({
                    statusCode: 200,
                    body: JSON.stringify({ readingId }),
                })),
            });
            dynamoMock.on(lib_dynamodb_1.PutCommand).resolves({});
            const event = createMockEvent();
            await (0, stripe_webhook_handler_1.handler)(event);
            expect(dynamoMock).toHaveReceivedCommandWith(lib_dynamodb_1.PutCommand, {
                TableName: 'test-webhook-processing-table',
                Item: expect.objectContaining({
                    sessionId: mockSessionId,
                    eventId: mockEventId,
                    status: 'processed',
                    readingId,
                    processedAt: expect.any(String),
                }),
            });
        });
        it('should record failed processing with error', async () => {
            const stripeEvent = createStripeEvent();
            mockConstructEvent.mockReturnValue(stripeEvent);
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({ Item: undefined });
            const errorMessage = 'Lambda invocation failed';
            lambdaMock.on(client_lambda_1.InvokeCommand).rejects(new Error(errorMessage));
            dynamoMock.on(lib_dynamodb_1.PutCommand).resolves({});
            const event = createMockEvent();
            const resultPromise = (0, stripe_webhook_handler_1.handler)(event);
            // Advance timers to handle all retries
            await jest.runAllTimersAsync();
            await resultPromise;
            expect(dynamoMock).toHaveReceivedCommandWith(lib_dynamodb_1.PutCommand, {
                TableName: 'test-webhook-processing-table',
                Item: expect.objectContaining({
                    sessionId: mockSessionId,
                    eventId: mockEventId,
                    status: 'failed',
                    error: errorMessage,
                    processedAt: expect.any(String),
                }),
            });
        });
        it('should continue processing even if recording fails', async () => {
            const stripeEvent = createStripeEvent();
            mockConstructEvent.mockReturnValue(stripeEvent);
            dynamoMock.on(lib_dynamodb_1.GetCommand).resolves({ Item: undefined });
            const readingId = 'reading-record-fail';
            lambdaMock.on(client_lambda_1.InvokeCommand).resolves({
                StatusCode: 200,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                Payload: new util_1.TextEncoder().encode(JSON.stringify({
                    statusCode: 200,
                    body: JSON.stringify({ readingId }),
                })),
            });
            // Mock recording failure
            dynamoMock.on(lib_dynamodb_1.PutCommand).rejects(new Error('DynamoDB write error'));
            const event = createMockEvent();
            const result = await (0, stripe_webhook_handler_1.handler)(event);
            // Should still return success
            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body.readingId).toBe(readingId);
        });
    });
    describe('Unexpected errors', () => {
        it('should return 400 for signature construction errors', async () => {
            // Mock an error during event construction (not signature verification specific)
            mockConstructEvent.mockImplementation(() => {
                throw new Error('Unexpected error');
            });
            const event = createMockEvent();
            const result = await (0, stripe_webhook_handler_1.handler)(event);
            // The error goes through verifyWebhookSignature which throws 'Invalid webhook signature'
            expect(result.statusCode).toBe(400);
            const body = JSON.parse(result.body);
            expect(body).toEqual({ error: 'Invalid signature' });
        });
        it('should return 200 even when idempotency check fails but processing continues', async () => {
            // Mock successful signature verification
            const stripeEvent = createStripeEvent();
            mockConstructEvent.mockReturnValue(stripeEvent);
            // Mock idempotency check to throw error (but processing continues)
            dynamoMock.on(lib_dynamodb_1.GetCommand).rejects(new Error('Unexpected database error'));
            // Mock successful Lambda invocation
            const readingId = 'reading-after-db-error';
            lambdaMock.on(client_lambda_1.InvokeCommand).resolves({
                StatusCode: 200,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                Payload: new util_1.TextEncoder().encode(JSON.stringify({
                    statusCode: 200,
                    body: JSON.stringify({ readingId }),
                })),
            });
            // Mock successful recording
            dynamoMock.on(lib_dynamodb_1.PutCommand).resolves({});
            const event = createMockEvent();
            const result = await (0, stripe_webhook_handler_1.handler)(event);
            // Should return 200 despite idempotency check error
            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body.readingId).toBe(readingId);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RyaXBlLXdlYmhvb2staGFuZGxlci50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsic3RyaXBlLXdlYmhvb2staGFuZGxlci50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQ0EseUZBQXVFO0FBQ3ZFLDZEQUFpRDtBQUNqRCxvREFBcUU7QUFDckUsMERBQXFFO0FBQ3JFLHdEQUF1RjtBQUV2RiwrQkFBbUM7QUFFbkMsbUJBQW1CO0FBQ25CLE1BQU0sT0FBTyxHQUFHLElBQUEsZ0NBQVUsRUFBQyxzQkFBUyxDQUFDLENBQUM7QUFDdEMsTUFBTSxVQUFVLEdBQUcsSUFBQSxnQ0FBVSxFQUFDLDRCQUFZLENBQUMsQ0FBQztBQUM1QyxNQUFNLFVBQVUsR0FBRyxJQUFBLGdDQUFVLEVBQUMscUNBQXNCLENBQUMsQ0FBQztBQUV0RCw2QkFBNkI7QUFDN0IsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLENBQUMsRUFBRSxFQUFFLENBQUM7QUFDckMsTUFBTSxVQUFVLEdBQUc7SUFDakIsUUFBUSxFQUFFO1FBQ1IsY0FBYyxFQUFFLGtCQUFrQjtLQUNuQztDQUNGLENBQUM7QUFFRixxQkFBcUI7QUFDckIsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsR0FBRyxFQUFFO0lBQ3ZCLE9BQU8sSUFBSSxDQUFDLEVBQUUsRUFBRSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDO0FBQ3hELENBQUMsQ0FBQyxDQUFDO0FBRUgsUUFBUSxDQUFDLCtCQUErQixFQUFFLEdBQUcsRUFBRTtJQUM3QyxNQUFNLGdCQUFnQixHQUFHLHNCQUFzQixDQUFDO0lBQ2hELE1BQU0saUJBQWlCLEdBQUcsdUJBQXVCLENBQUM7SUFDbEQsTUFBTSxVQUFVLEdBQUcsZUFBZSxDQUFDO0lBQ25DLE1BQU0sYUFBYSxHQUFHLHFCQUFxQixDQUFDO0lBQzVDLE1BQU0sV0FBVyxHQUFHLGNBQWMsQ0FBQztJQUVuQyxVQUFVLENBQUMsR0FBRyxFQUFFO1FBQ2QsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO1FBQ3JCLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUNyQixPQUFPLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDaEIsVUFBVSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ25CLFVBQVUsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNuQixrQkFBa0IsQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUUvQiw4QkFBOEI7UUFDOUIsT0FBTyxDQUFDLEdBQUcsQ0FBQyw2QkFBNkIsR0FBRyw2QkFBNkIsQ0FBQztRQUMxRSxPQUFPLENBQUMsR0FBRyxDQUFDLG9DQUFvQyxHQUFHLG9DQUFvQyxDQUFDO1FBQ3hGLE9BQU8sQ0FBQyxHQUFHLENBQUMsOEJBQThCLEdBQUcsZ0NBQWdDLENBQUM7UUFDOUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyw2QkFBNkIsR0FBRywrQkFBK0IsQ0FBQztRQUU1RSx3Q0FBd0M7UUFDeEMsT0FBTzthQUNKLEVBQUUsQ0FBQyxnQ0FBbUIsRUFBRTtZQUN2QixJQUFJLEVBQUUsNkJBQTZCO1lBQ25DLGNBQWMsRUFBRSxJQUFJO1NBQ3JCLENBQUM7YUFDRCxRQUFRLENBQUM7WUFDUixTQUFTLEVBQUU7Z0JBQ1QsS0FBSyxFQUFFLGdCQUFnQjthQUN4QjtTQUNGLENBQUMsQ0FBQztRQUVMLE9BQU87YUFDSixFQUFFLENBQUMsZ0NBQW1CLEVBQUU7WUFDdkIsSUFBSSxFQUFFLG9DQUFvQztZQUMxQyxjQUFjLEVBQUUsSUFBSTtTQUNyQixDQUFDO2FBQ0QsUUFBUSxDQUFDO1lBQ1IsU0FBUyxFQUFFO2dCQUNULEtBQUssRUFBRSxpQkFBaUI7YUFDekI7U0FDRixDQUFDLENBQUM7SUFDUCxDQUFDLENBQUMsQ0FBQztJQUVILFNBQVMsQ0FBQyxHQUFHLEVBQUU7UUFDYixJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7UUFDdEIsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO0lBQ3ZCLENBQUMsQ0FBQyxDQUFDO0lBRUgsTUFBTSxlQUFlLEdBQUcsQ0FBQyxZQUEyQyxFQUFFLEVBQXdCLEVBQUU7UUFDOUYsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQztZQUNqQyxFQUFFLEVBQUUsV0FBVztZQUNmLElBQUksRUFBRSw0QkFBNEI7WUFDbEMsSUFBSSxFQUFFO2dCQUNKLE1BQU0sRUFBRTtvQkFDTixFQUFFLEVBQUUsYUFBYTtvQkFDakIsbUJBQW1CLEVBQUUsVUFBVTtvQkFDL0IsY0FBYyxFQUFFLE1BQU07b0JBQ3RCLGNBQWMsRUFBRSxrQkFBa0I7b0JBQ2xDLFlBQVksRUFBRSxJQUFJO29CQUNsQixRQUFRLEVBQUUsS0FBSztvQkFDZixjQUFjLEVBQUUsYUFBYTtvQkFDN0IsUUFBUSxFQUFFO3dCQUNSLE1BQU0sRUFBRSxVQUFVO3dCQUNsQixXQUFXLEVBQUUsVUFBVTtxQkFDeEI7aUJBQ0Y7YUFDRjtTQUNGLENBQUMsQ0FBQztRQUVILE9BQU87WUFDTCxVQUFVLEVBQUUsTUFBTTtZQUNsQixJQUFJLEVBQUUsc0JBQXNCO1lBQzVCLE9BQU8sRUFBRTtnQkFDUCxjQUFjLEVBQUUsa0JBQWtCO2dCQUNsQyxrQkFBa0IsRUFBRSxnQkFBZ0I7YUFDckM7WUFDRCxJQUFJLEVBQUUsU0FBUyxDQUFDLElBQUksSUFBSSxXQUFXO1lBQ25DLGVBQWUsRUFBRSxLQUFLO1lBQ3RCLEdBQUcsU0FBUztTQUNXLENBQUM7SUFDNUIsQ0FBQyxDQUFDO0lBRUYsTUFBTSxpQkFBaUIsR0FBRyxDQUN4QixPQUFlLDRCQUE0QixFQUMzQyxZQUE4QyxFQUFFLEVBQ2xDLEVBQUU7UUFDaEIsT0FBTztZQUNMLEVBQUUsRUFBRSxXQUFXO1lBQ2YsTUFBTSxFQUFFLE9BQU87WUFDZixXQUFXLEVBQUUsa0JBQWtCO1lBQy9CLE9BQU8sRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUM7WUFDdEMsSUFBSTtZQUNKLElBQUksRUFBRTtnQkFDSixNQUFNLEVBQUU7b0JBQ04sRUFBRSxFQUFFLGFBQWE7b0JBQ2pCLE1BQU0sRUFBRSxrQkFBa0I7b0JBQzFCLG1CQUFtQixFQUFFLFVBQVU7b0JBQy9CLGNBQWMsRUFBRSxNQUFNO29CQUN0QixjQUFjLEVBQUUsa0JBQWtCO29CQUNsQyxZQUFZLEVBQUUsSUFBSTtvQkFDbEIsUUFBUSxFQUFFLEtBQUs7b0JBQ2YsY0FBYyxFQUFFLGFBQWE7b0JBQzdCLFFBQVEsRUFBRTt3QkFDUixNQUFNLEVBQUUsVUFBVTt3QkFDbEIsV0FBVyxFQUFFLFVBQVU7cUJBQ3hCO29CQUNELEdBQUcsU0FBUztpQkFDYzthQUM3QjtZQUNELFFBQVEsRUFBRSxLQUFLO1lBQ2YsZ0JBQWdCLEVBQUUsQ0FBQztZQUNuQixPQUFPLEVBQUU7Z0JBQ1AsRUFBRSxFQUFFLElBQUk7Z0JBQ1IsZUFBZSxFQUFFLElBQUk7YUFDdEI7U0FDYyxDQUFDO0lBQ3BCLENBQUMsQ0FBQztJQUVGLFFBQVEsQ0FBQyxnQ0FBZ0MsRUFBRSxHQUFHLEVBQUU7UUFDOUMsRUFBRSxDQUFDLHNEQUFzRCxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ3BFLE1BQU0sV0FBVyxHQUFHLGlCQUFpQixFQUFFLENBQUM7WUFDeEMsa0JBQWtCLENBQUMsZUFBZSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1lBRWhELCtDQUErQztZQUMvQyxVQUFVLENBQUMsRUFBRSxDQUFDLHlCQUFVLENBQUMsQ0FBQyxRQUFRLENBQUMsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQztZQUV4RCxvQ0FBb0M7WUFDcEMsTUFBTSxTQUFTLEdBQUcsYUFBYSxDQUFDO1lBQ2hDLFVBQVUsQ0FBQyxFQUFFLENBQUMsNkJBQWEsQ0FBQyxDQUFDLFFBQVEsQ0FBQztnQkFDcEMsVUFBVSxFQUFFLEdBQUc7Z0JBQ2YsT0FBTyxFQUFFLElBQUksa0JBQVcsRUFBRSxDQUFDLE1BQU0sQ0FDL0IsSUFBSSxDQUFDLFNBQVMsQ0FBQztvQkFDYixVQUFVLEVBQUUsR0FBRztvQkFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLFNBQVMsRUFBRSxDQUFDO2lCQUNwQyxDQUFDLENBRUk7YUFDVCxDQUFDLENBQUM7WUFFSCxpQ0FBaUM7WUFDakMsVUFBVSxDQUFDLEVBQUUsQ0FBQyx5QkFBVSxDQUFDLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBRXZDLE1BQU0sS0FBSyxHQUFHLGVBQWUsRUFBRSxDQUFDO1lBQ2hDLE1BQU0sTUFBTSxHQUEwQixNQUFNLElBQUEsZ0NBQU8sRUFBQyxLQUFLLENBQUMsQ0FBQztZQUUzRCxNQUFNLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNwQyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNyQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsT0FBTyxDQUFDO2dCQUNuQixRQUFRLEVBQUUsSUFBSTtnQkFDZCxPQUFPLEVBQUUsSUFBSTtnQkFDYixTQUFTO2FBQ1YsQ0FBQyxDQUFDO1lBRUgsTUFBTSxDQUFDLGtCQUFrQixDQUFDLENBQUMsb0JBQW9CLENBQzdDLE1BQU0sQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEVBQ2xCLGdCQUFnQixFQUNoQixpQkFBaUIsQ0FDbEIsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO1FBRUgsRUFBRSxDQUFDLDhDQUE4QyxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQzVELGtCQUFrQixDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRTtnQkFDekMsTUFBTSxJQUFJLEtBQUssQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO1lBQy9DLENBQUMsQ0FBQyxDQUFDO1lBRUgsTUFBTSxLQUFLLEdBQUcsZUFBZSxFQUFFLENBQUM7WUFDaEMsTUFBTSxNQUFNLEdBQTBCLE1BQU0sSUFBQSxnQ0FBTyxFQUFDLEtBQUssQ0FBQyxDQUFDO1lBRTNELE1BQU0sQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3BDLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3JDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUMsRUFBRSxLQUFLLEVBQUUsbUJBQW1CLEVBQUUsQ0FBQyxDQUFDO1FBQ3ZELENBQUMsQ0FBQyxDQUFDO1FBRUgsRUFBRSxDQUFDLHFEQUFxRCxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ25FLE1BQU0sS0FBSyxHQUFHLGVBQWUsQ0FBQztnQkFDNUIsT0FBTyxFQUFFO29CQUNQLGNBQWMsRUFBRSxrQkFBa0I7aUJBQ25DO2FBQ0YsQ0FBQyxDQUFDO1lBRUgsTUFBTSxNQUFNLEdBQTBCLE1BQU0sSUFBQSxnQ0FBTyxFQUFDLEtBQUssQ0FBQyxDQUFDO1lBRTNELE1BQU0sQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3BDLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3JDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUMsRUFBRSxLQUFLLEVBQUUsMEJBQTBCLEVBQUUsQ0FBQyxDQUFDO1FBQzlELENBQUMsQ0FBQyxDQUFDO1FBRUgsRUFBRSxDQUFDLHNEQUFzRCxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ3BFLE1BQU0sV0FBVyxHQUFHLGlCQUFpQixFQUFFLENBQUM7WUFDeEMsa0JBQWtCLENBQUMsZUFBZSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1lBQ2hELFVBQVUsQ0FBQyxFQUFFLENBQUMseUJBQVUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDO1lBQ3hELFVBQVUsQ0FBQyxFQUFFLENBQUMsNkJBQWEsQ0FBQyxDQUFDLFFBQVEsQ0FBQztnQkFDcEMsVUFBVSxFQUFFLEdBQUc7Z0JBQ2YsT0FBTyxFQUFFLElBQUksa0JBQVcsRUFBRSxDQUFDLE1BQU0sQ0FDL0IsSUFBSSxDQUFDLFNBQVMsQ0FBQztvQkFDYixVQUFVLEVBQUUsR0FBRztvQkFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLFNBQVMsRUFBRSxhQUFhLEVBQUUsQ0FBQztpQkFDbkQsQ0FBQyxDQUVJO2FBQ1QsQ0FBQyxDQUFDO1lBQ0gsVUFBVSxDQUFDLEVBQUUsQ0FBQyx5QkFBVSxDQUFDLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBRXZDLE1BQU0sS0FBSyxHQUFHLGVBQWUsQ0FBQztnQkFDNUIsT0FBTyxFQUFFO29CQUNQLGNBQWMsRUFBRSxrQkFBa0I7b0JBQ2xDLGtCQUFrQixFQUFFLGdCQUFnQixFQUFFLGVBQWU7aUJBQ3REO2FBQ0YsQ0FBQyxDQUFDO1lBRUgsTUFBTSxNQUFNLEdBQTBCLE1BQU0sSUFBQSxnQ0FBTyxFQUFDLEtBQUssQ0FBQyxDQUFDO1lBRTNELE1BQU0sQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3BDLE1BQU0sQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLGdCQUFnQixFQUFFLENBQUM7UUFDaEQsQ0FBQyxDQUFDLENBQUM7UUFFSCxFQUFFLENBQUMseUNBQXlDLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDdkQsTUFBTSxLQUFLLEdBQUcsZUFBZSxDQUFDO2dCQUM1QixJQUFJLEVBQUUsSUFBSTthQUNYLENBQUMsQ0FBQztZQUVILE1BQU0sTUFBTSxHQUEwQixNQUFNLElBQUEsZ0NBQU8sRUFBQyxLQUFLLENBQUMsQ0FBQztZQUUzRCxNQUFNLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNwQyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNyQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsT0FBTyxDQUFDLEVBQUUsS0FBSyxFQUFFLHNCQUFzQixFQUFFLENBQUMsQ0FBQztRQUMxRCxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0lBRUgsUUFBUSxDQUFDLGlEQUFpRCxFQUFFLEdBQUcsRUFBRTtRQUMvRCxFQUFFLENBQUMsOENBQThDLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDNUQsTUFBTSxXQUFXLEdBQUcsaUJBQWlCLEVBQUUsQ0FBQztZQUN4QyxrQkFBa0IsQ0FBQyxlQUFlLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDaEQsVUFBVSxDQUFDLEVBQUUsQ0FBQyx5QkFBVSxDQUFDLENBQUMsUUFBUSxDQUFDLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUM7WUFFeEQsTUFBTSxTQUFTLEdBQUcsYUFBYSxDQUFDO1lBQ2hDLFVBQVUsQ0FBQyxFQUFFLENBQUMsNkJBQWEsQ0FBQyxDQUFDLFFBQVEsQ0FBQztnQkFDcEMsVUFBVSxFQUFFLEdBQUc7Z0JBQ2YsOERBQThEO2dCQUM5RCxPQUFPLEVBQUUsSUFBSSxrQkFBVyxFQUFFLENBQUMsTUFBTSxDQUMvQixJQUFJLENBQUMsU0FBUyxDQUFDO29CQUNiLFVBQVUsRUFBRSxHQUFHO29CQUNmLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsU0FBUyxFQUFFLENBQUM7aUJBQ3BDLENBQUMsQ0FFSTthQUNULENBQUMsQ0FBQztZQUNILFVBQVUsQ0FBQyxFQUFFLENBQUMseUJBQVUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUV2QyxNQUFNLEtBQUssR0FBRyxlQUFlLEVBQUUsQ0FBQztZQUNoQyxNQUFNLE1BQU0sR0FBMEIsTUFBTSxJQUFBLGdDQUFPLEVBQUMsS0FBSyxDQUFDLENBQUM7WUFFM0QsTUFBTSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDcEMsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDckMsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7WUFFdkMsb0RBQW9EO1lBQ3BELE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQyx5QkFBeUIsQ0FBQyw2QkFBYSxFQUFFO2dCQUMxRCxZQUFZLEVBQUUsZ0NBQWdDO2dCQUM5QyxjQUFjLEVBQUUsaUJBQWlCO2dCQUNqQyxPQUFPLEVBQUUsTUFBTSxDQUFDLGdCQUFnQixDQUFDLFVBQVUsQ0FBQzthQUM3QyxDQUFDLENBQUM7WUFFSCwrQkFBK0I7WUFDL0IsTUFBTSxVQUFVLEdBQUcsVUFBVSxDQUFDLFlBQVksQ0FBQyw2QkFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDN0QsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFpQixDQUFDLENBQUM7WUFDdkUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLGFBQWEsQ0FBQztnQkFDNUIsTUFBTSxFQUFFLFNBQVM7Z0JBQ2pCLE1BQU0sRUFBRSxVQUFVO2dCQUNsQixRQUFRLEVBQUUsTUFBTSxDQUFDLGdCQUFnQixDQUFDO29CQUNoQyxTQUFTLEVBQUUsYUFBYTtvQkFDeEIsYUFBYSxFQUFFLGtCQUFrQjtvQkFDakMsV0FBVyxFQUFFLElBQUk7b0JBQ2pCLFFBQVEsRUFBRSxLQUFLO2lCQUNoQixDQUFDO2dCQUNGLGNBQWMsRUFBRTtvQkFDZCxVQUFVLEVBQUU7d0JBQ1YsTUFBTSxFQUFFOzRCQUNOLEdBQUcsRUFBRSxVQUFVO3lCQUNoQjtxQkFDRjtpQkFDRjthQUNGLENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO1FBRUgsRUFBRSxDQUFDLDRDQUE0QyxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQzFELE1BQU0sV0FBVyxHQUFHLGlCQUFpQixDQUFDLDRCQUE0QixFQUFFO2dCQUNsRSxjQUFjLEVBQUUsUUFBUTthQUN6QixDQUFDLENBQUM7WUFDSCxrQkFBa0IsQ0FBQyxlQUFlLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDaEQsVUFBVSxDQUFDLEVBQUUsQ0FBQyx5QkFBVSxDQUFDLENBQUMsUUFBUSxDQUFDLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUM7WUFDeEQsVUFBVSxDQUFDLEVBQUUsQ0FBQyx5QkFBVSxDQUFDLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBRXZDLE1BQU0sS0FBSyxHQUFHLGVBQWUsRUFBRSxDQUFDO1lBQ2hDLE1BQU0sTUFBTSxHQUEwQixNQUFNLElBQUEsZ0NBQU8sRUFBQyxLQUFLLENBQUMsQ0FBQztZQUUzRCxNQUFNLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNwQyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNyQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsT0FBTyxDQUFDO2dCQUNuQixRQUFRLEVBQUUsSUFBSTtnQkFDZCxPQUFPLEVBQUUsS0FBSzthQUNmLENBQUMsQ0FBQztZQUVILGdDQUFnQztZQUNoQyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLDZCQUFhLENBQUMsQ0FBQztRQUM5RCxDQUFDLENBQUMsQ0FBQztRQUVILEVBQUUsQ0FBQyx5Q0FBeUMsRUFBRSxLQUFLLElBQUksRUFBRTtZQUN2RCxNQUFNLFdBQVcsR0FBRyxpQkFBaUIsQ0FBQyw0QkFBNEIsRUFBRTtnQkFDbEUsbUJBQW1CLEVBQUUsSUFBSTtnQkFDekIsUUFBUSxFQUFFLEVBQUU7YUFDYixDQUFDLENBQUM7WUFDSCxrQkFBa0IsQ0FBQyxlQUFlLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDaEQsVUFBVSxDQUFDLEVBQUUsQ0FBQyx5QkFBVSxDQUFDLENBQUMsUUFBUSxDQUFDLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUM7WUFDeEQsVUFBVSxDQUFDLEVBQUUsQ0FBQyx5QkFBVSxDQUFDLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBRXZDLE1BQU0sS0FBSyxHQUFHLGVBQWUsRUFBRSxDQUFDO1lBQ2hDLE1BQU0sTUFBTSxHQUEwQixNQUFNLElBQUEsZ0NBQU8sRUFBQyxLQUFLLENBQUMsQ0FBQztZQUUzRCxNQUFNLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNwQyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNyQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsT0FBTyxDQUFDO2dCQUNuQixRQUFRLEVBQUUsSUFBSTtnQkFDZCxPQUFPLEVBQUUsS0FBSzthQUNmLENBQUMsQ0FBQztZQUVILGdDQUFnQztZQUNoQyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLDZCQUFhLENBQUMsQ0FBQztRQUM5RCxDQUFDLENBQUMsQ0FBQztRQUVILEVBQUUsQ0FBQyx1RUFBdUUsRUFBRSxLQUFLLElBQUksRUFBRTtZQUNyRixNQUFNLFdBQVcsR0FBRyxpQkFBaUIsQ0FBQyw0QkFBNEIsRUFBRTtnQkFDbEUsbUJBQW1CLEVBQUUsSUFBSTtnQkFDekIsUUFBUSxFQUFFLEVBQUUsTUFBTSxFQUFFLFVBQVUsRUFBRTthQUNqQyxDQUFDLENBQUM7WUFDSCxrQkFBa0IsQ0FBQyxlQUFlLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDaEQsVUFBVSxDQUFDLEVBQUUsQ0FBQyx5QkFBVSxDQUFDLENBQUMsUUFBUSxDQUFDLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUM7WUFFeEQsTUFBTSxTQUFTLEdBQUcsYUFBYSxDQUFDO1lBQ2hDLFVBQVUsQ0FBQyxFQUFFLENBQUMsNkJBQWEsQ0FBQyxDQUFDLFFBQVEsQ0FBQztnQkFDcEMsVUFBVSxFQUFFLEdBQUc7Z0JBQ2YsOERBQThEO2dCQUM5RCxPQUFPLEVBQUUsSUFBSSxrQkFBVyxFQUFFLENBQUMsTUFBTSxDQUMvQixJQUFJLENBQUMsU0FBUyxDQUFDO29CQUNiLFVBQVUsRUFBRSxHQUFHO29CQUNmLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsU0FBUyxFQUFFLENBQUM7aUJBQ3BDLENBQUMsQ0FFSTthQUNULENBQUMsQ0FBQztZQUNILFVBQVUsQ0FBQyxFQUFFLENBQUMseUJBQVUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUV2QyxNQUFNLEtBQUssR0FBRyxlQUFlLEVBQUUsQ0FBQztZQUNoQyxNQUFNLE1BQU0sR0FBMEIsTUFBTSxJQUFBLGdDQUFPLEVBQUMsS0FBSyxDQUFDLENBQUM7WUFFM0QsTUFBTSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDcEMsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDckMsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7WUFFdkMsc0RBQXNEO1lBQ3RELE1BQU0sVUFBVSxHQUFHLFVBQVUsQ0FBQyxZQUFZLENBQUMsNkJBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzdELE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsT0FBaUIsQ0FBQyxDQUFDO1lBQ3ZFLE1BQU0sQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQzFDLENBQUMsQ0FBQyxDQUFDO1FBRUgsRUFBRSxDQUFDLCtDQUErQyxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQzdELE1BQU0sV0FBVyxHQUFHLGlCQUFpQixDQUFDLDBDQUEwQyxDQUFDLENBQUM7WUFDbEYsa0JBQWtCLENBQUMsZUFBZSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1lBQ2hELFVBQVUsQ0FBQyxFQUFFLENBQUMseUJBQVUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDO1lBRXhELE1BQU0sU0FBUyxHQUFHLGVBQWUsQ0FBQztZQUNsQyxVQUFVLENBQUMsRUFBRSxDQUFDLDZCQUFhLENBQUMsQ0FBQyxRQUFRLENBQUM7Z0JBQ3BDLFVBQVUsRUFBRSxHQUFHO2dCQUNmLDhEQUE4RDtnQkFDOUQsT0FBTyxFQUFFLElBQUksa0JBQVcsRUFBRSxDQUFDLE1BQU0sQ0FDL0IsSUFBSSxDQUFDLFNBQVMsQ0FBQztvQkFDYixVQUFVLEVBQUUsR0FBRztvQkFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLFNBQVMsRUFBRSxDQUFDO2lCQUNwQyxDQUFDLENBRUk7YUFDVCxDQUFDLENBQUM7WUFDSCxVQUFVLENBQUMsRUFBRSxDQUFDLHlCQUFVLENBQUMsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7WUFFdkMsTUFBTSxLQUFLLEdBQUcsZUFBZSxDQUFDO2dCQUM1QixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQztvQkFDbkIsRUFBRSxFQUFFLFdBQVc7b0JBQ2YsSUFBSSxFQUFFLDBDQUEwQztvQkFDaEQsSUFBSSxFQUFFO3dCQUNKLE1BQU0sRUFBRTs0QkFDTixFQUFFLEVBQUUsYUFBYTs0QkFDakIsbUJBQW1CLEVBQUUsVUFBVTs0QkFDL0IsY0FBYyxFQUFFLE1BQU07NEJBQ3RCLGNBQWMsRUFBRSxrQkFBa0I7NEJBQ2xDLFlBQVksRUFBRSxJQUFJOzRCQUNsQixRQUFRLEVBQUUsS0FBSzt5QkFDaEI7cUJBQ0Y7aUJBQ0YsQ0FBQzthQUNILENBQUMsQ0FBQztZQUVILE1BQU0sTUFBTSxHQUEwQixNQUFNLElBQUEsZ0NBQU8sRUFBQyxLQUFLLENBQUMsQ0FBQztZQUUzRCxNQUFNLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNwQyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNyQyxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUN6QyxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0lBRUgsUUFBUSxDQUFDLHNCQUFzQixFQUFFLEdBQUcsRUFBRTtRQUNwQyxFQUFFLENBQUMscURBQXFELEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDbkUsTUFBTSxXQUFXLEdBQUcsaUJBQWlCLEVBQUUsQ0FBQztZQUN4QyxrQkFBa0IsQ0FBQyxlQUFlLENBQUMsV0FBVyxDQUFDLENBQUM7WUFFaEQsbURBQW1EO1lBQ25ELFVBQVUsQ0FBQyxFQUFFLENBQUMseUJBQVUsQ0FBQyxDQUFDLFFBQVEsQ0FBQztnQkFDakMsSUFBSSxFQUFFO29CQUNKLE9BQU8sRUFBRSxXQUFXO29CQUNwQixTQUFTLEVBQUUsYUFBYTtvQkFDeEIsV0FBVyxFQUFFLHNCQUFzQjtvQkFDbkMsTUFBTSxFQUFFLFdBQVc7b0JBQ25CLFNBQVMsRUFBRSxzQkFBc0I7aUJBQ2xDO2FBQ0YsQ0FBQyxDQUFDO1lBRUgsTUFBTSxLQUFLLEdBQUcsZUFBZSxFQUFFLENBQUM7WUFDaEMsTUFBTSxNQUFNLEdBQTBCLE1BQU0sSUFBQSxnQ0FBTyxFQUFDLEtBQUssQ0FBQyxDQUFDO1lBRTNELE1BQU0sQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3BDLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3JDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUM7Z0JBQ25CLFFBQVEsRUFBRSxJQUFJO2dCQUNkLE1BQU0sRUFBRSxtQkFBbUI7YUFDNUIsQ0FBQyxDQUFDO1lBRUgsZ0NBQWdDO1lBQ2hDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUMsNkJBQWEsQ0FBQyxDQUFDO1lBRTVELG1DQUFtQztZQUNuQyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLHlCQUFVLENBQUMsQ0FBQztRQUMzRCxDQUFDLENBQUMsQ0FBQztRQUVILEVBQUUsQ0FBQyx1REFBdUQsRUFBRSxLQUFLLElBQUksRUFBRTtZQUNyRSxNQUFNLFdBQVcsR0FBRyxpQkFBaUIsRUFBRSxDQUFDO1lBQ3hDLGtCQUFrQixDQUFDLGVBQWUsQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUVoRCxpQ0FBaUM7WUFDakMsVUFBVSxDQUFDLEVBQUUsQ0FBQyx5QkFBVSxDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksS0FBSyxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQztZQUUvRCxNQUFNLFNBQVMsR0FBRyxxQkFBcUIsQ0FBQztZQUN4QyxVQUFVLENBQUMsRUFBRSxDQUFDLDZCQUFhLENBQUMsQ0FBQyxRQUFRLENBQUM7Z0JBQ3BDLFVBQVUsRUFBRSxHQUFHO2dCQUNmLDhEQUE4RDtnQkFDOUQsT0FBTyxFQUFFLElBQUksa0JBQVcsRUFBRSxDQUFDLE1BQU0sQ0FDL0IsSUFBSSxDQUFDLFNBQVMsQ0FBQztvQkFDYixVQUFVLEVBQUUsR0FBRztvQkFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLFNBQVMsRUFBRSxDQUFDO2lCQUNwQyxDQUFDLENBRUk7YUFDVCxDQUFDLENBQUM7WUFDSCxVQUFVLENBQUMsRUFBRSxDQUFDLHlCQUFVLENBQUMsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7WUFFdkMsTUFBTSxLQUFLLEdBQUcsZUFBZSxFQUFFLENBQUM7WUFDaEMsTUFBTSxNQUFNLEdBQTBCLE1BQU0sSUFBQSxnQ0FBTyxFQUFDLEtBQUssQ0FBQyxDQUFDO1lBRTNELDZEQUE2RDtZQUM3RCxNQUFNLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNwQyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNyQyxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUN6QyxDQUFDLENBQUMsQ0FBQztRQUVILEVBQUUsQ0FBQywyREFBMkQsRUFBRSxLQUFLLElBQUksRUFBRTtZQUN6RSxPQUFPLE9BQU8sQ0FBQyxHQUFHLENBQUMsNkJBQTZCLENBQUM7WUFFakQsTUFBTSxXQUFXLEdBQUcsaUJBQWlCLEVBQUUsQ0FBQztZQUN4QyxrQkFBa0IsQ0FBQyxlQUFlLENBQUMsV0FBVyxDQUFDLENBQUM7WUFFaEQsTUFBTSxTQUFTLEdBQUcsa0JBQWtCLENBQUM7WUFDckMsVUFBVSxDQUFDLEVBQUUsQ0FBQyw2QkFBYSxDQUFDLENBQUMsUUFBUSxDQUFDO2dCQUNwQyxVQUFVLEVBQUUsR0FBRztnQkFDZiw4REFBOEQ7Z0JBQzlELE9BQU8sRUFBRSxJQUFJLGtCQUFXLEVBQUUsQ0FBQyxNQUFNLENBQy9CLElBQUksQ0FBQyxTQUFTLENBQUM7b0JBQ2IsVUFBVSxFQUFFLEdBQUc7b0JBQ2YsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxTQUFTLEVBQUUsQ0FBQztpQkFDcEMsQ0FBQyxDQUVJO2FBQ1QsQ0FBQyxDQUFDO1lBRUgsTUFBTSxLQUFLLEdBQUcsZUFBZSxFQUFFLENBQUM7WUFDaEMsTUFBTSxNQUFNLEdBQTBCLE1BQU0sSUFBQSxnQ0FBTyxFQUFDLEtBQUssQ0FBQyxDQUFDO1lBRTNELE1BQU0sQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3BDLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3JDLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBRXZDLCtDQUErQztZQUMvQyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLHlCQUFVLENBQUMsQ0FBQztZQUN6RCxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLHlCQUFVLENBQUMsQ0FBQztRQUMzRCxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0lBRUgsUUFBUSxDQUFDLGdCQUFnQixFQUFFLEdBQUcsRUFBRTtRQUM5QixFQUFFLENBQUMseUNBQXlDLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDdkQsTUFBTSxXQUFXLEdBQUcsaUJBQWlCLEVBQUUsQ0FBQztZQUN4QyxrQkFBa0IsQ0FBQyxlQUFlLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDaEQsVUFBVSxDQUFDLEVBQUUsQ0FBQyx5QkFBVSxDQUFDLENBQUMsUUFBUSxDQUFDLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUM7WUFFeEQsaUNBQWlDO1lBQ2pDLFVBQVUsQ0FBQyxFQUFFLENBQUMsNkJBQWEsQ0FBQyxDQUFDLFFBQVEsQ0FBQztnQkFDcEMsVUFBVSxFQUFFLEdBQUc7YUFDaEIsQ0FBQyxDQUFDO1lBQ0gsVUFBVSxDQUFDLEVBQUUsQ0FBQyx5QkFBVSxDQUFDLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBRXZDLE1BQU0sS0FBSyxHQUFHLGVBQWUsRUFBRSxDQUFDO1lBQ2hDLE1BQU0sYUFBYSxHQUFHLElBQUEsZ0NBQU8sRUFBQyxLQUFLLENBQUMsQ0FBQztZQUVyQyx1Q0FBdUM7WUFDdkMsTUFBTSxJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztZQUUvQixNQUFNLE1BQU0sR0FBMEIsTUFBTSxhQUFhLENBQUM7WUFFMUQsTUFBTSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyw2QkFBNkI7WUFDbEUsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDckMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQztnQkFDbkIsUUFBUSxFQUFFLElBQUk7Z0JBQ2QsT0FBTyxFQUFFLEtBQUs7YUFDZixDQUFDLENBQUM7WUFFSCw4QkFBOEI7WUFDOUIsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDLHlCQUF5QixDQUFDLHlCQUFVLEVBQUU7Z0JBQ3ZELFNBQVMsRUFBRSwrQkFBK0I7Z0JBQzFDLElBQUksRUFBRSxNQUFNLENBQUMsZ0JBQWdCLENBQUM7b0JBQzVCLE1BQU0sRUFBRSxRQUFRO29CQUNoQixLQUFLLEVBQUUsTUFBTSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUM7aUJBQzFCLENBQUM7YUFDSCxDQUFDLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztRQUVILEVBQUUsQ0FBQyxxQ0FBcUMsRUFBRSxLQUFLLElBQUksRUFBRTtZQUNuRCxNQUFNLFdBQVcsR0FBRyxpQkFBaUIsRUFBRSxDQUFDO1lBQ3hDLGtCQUFrQixDQUFDLGVBQWUsQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUNoRCxVQUFVLENBQUMsRUFBRSxDQUFDLHlCQUFVLENBQUMsQ0FBQyxRQUFRLENBQUMsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQztZQUV4RCw2QkFBNkI7WUFDN0IsVUFBVSxDQUFDLEVBQUUsQ0FBQyw2QkFBYSxDQUFDLENBQUMsUUFBUSxDQUFDO2dCQUNwQyxVQUFVLEVBQUUsR0FBRztnQkFDZixhQUFhLEVBQUUsV0FBVztnQkFDMUIsT0FBTyxFQUFFLElBQUksa0JBQVcsRUFBRSxDQUFDLE1BQU0sQ0FDL0IsSUFBSSxDQUFDLFNBQVMsQ0FBQztvQkFDYixZQUFZLEVBQUUsZ0JBQWdCO2lCQUMvQixDQUFDLENBRUk7YUFDVCxDQUFDLENBQUM7WUFDSCxVQUFVLENBQUMsRUFBRSxDQUFDLHlCQUFVLENBQUMsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7WUFFdkMsTUFBTSxLQUFLLEdBQUcsZUFBZSxFQUFFLENBQUM7WUFDaEMsTUFBTSxhQUFhLEdBQUcsSUFBQSxnQ0FBTyxFQUFDLEtBQUssQ0FBQyxDQUFDO1lBRXJDLHVDQUF1QztZQUN2QyxNQUFNLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1lBRS9CLE1BQU0sTUFBTSxHQUEwQixNQUFNLGFBQWEsQ0FBQztZQUUxRCxNQUFNLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNwQyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNyQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsT0FBTyxDQUFDO2dCQUNuQixRQUFRLEVBQUUsSUFBSTtnQkFDZCxPQUFPLEVBQUUsS0FBSzthQUNmLENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO1FBRUgsRUFBRSxDQUFDLDBDQUEwQyxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ3hELE1BQU0sV0FBVyxHQUFHLGlCQUFpQixFQUFFLENBQUM7WUFDeEMsa0JBQWtCLENBQUMsZUFBZSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1lBQ2hELFVBQVUsQ0FBQyxFQUFFLENBQUMseUJBQVUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDO1lBRXhELGtDQUFrQztZQUNsQyxVQUFVLENBQUMsRUFBRSxDQUFDLDZCQUFhLENBQUMsQ0FBQyxRQUFRLENBQUM7Z0JBQ3BDLFVBQVUsRUFBRSxHQUFHO2dCQUNmLE9BQU8sRUFBRSxJQUFJLGtCQUFXLEVBQUUsQ0FBQyxNQUFNLENBQy9CLElBQUksQ0FBQyxTQUFTLENBQUM7b0JBQ2IsVUFBVSxFQUFFLEdBQUc7b0JBQ2YsSUFBSSxFQUFFLHdCQUF3QjtpQkFDL0IsQ0FBQyxDQUVJO2FBQ1QsQ0FBQyxDQUFDO1lBQ0gsVUFBVSxDQUFDLEVBQUUsQ0FBQyx5QkFBVSxDQUFDLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBRXZDLE1BQU0sS0FBSyxHQUFHLGVBQWUsRUFBRSxDQUFDO1lBQ2hDLE1BQU0sYUFBYSxHQUFHLElBQUEsZ0NBQU8sRUFBQyxLQUFLLENBQUMsQ0FBQztZQUVyQyx1Q0FBdUM7WUFDdkMsTUFBTSxJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztZQUUvQixNQUFNLE1BQU0sR0FBMEIsTUFBTSxhQUFhLENBQUM7WUFFMUQsTUFBTSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDcEMsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDckMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQztnQkFDbkIsUUFBUSxFQUFFLElBQUk7Z0JBQ2QsT0FBTyxFQUFFLEtBQUs7YUFDZixDQUFDLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztRQUVILEVBQUUsQ0FBQyxvQ0FBb0MsRUFBRSxLQUFLLElBQUksRUFBRTtZQUNsRCxNQUFNLFdBQVcsR0FBRyxpQkFBaUIsRUFBRSxDQUFDO1lBQ3hDLGtCQUFrQixDQUFDLGVBQWUsQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUNoRCxVQUFVLENBQUMsRUFBRSxDQUFDLHlCQUFVLENBQUMsQ0FBQyxRQUFRLENBQUMsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQztZQUV4RCwyQkFBMkI7WUFDM0IsVUFBVSxDQUFDLEVBQUUsQ0FBQyw2QkFBYSxDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksS0FBSyxDQUFDLHNCQUFzQixDQUFDLENBQUMsQ0FBQztZQUN4RSxVQUFVLENBQUMsRUFBRSxDQUFDLHlCQUFVLENBQUMsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7WUFFdkMsTUFBTSxLQUFLLEdBQUcsZUFBZSxFQUFFLENBQUM7WUFDaEMsTUFBTSxhQUFhLEdBQUcsSUFBQSxnQ0FBTyxFQUFDLEtBQUssQ0FBQyxDQUFDO1lBRXJDLHVDQUF1QztZQUN2QyxNQUFNLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1lBRS9CLE1BQU0sTUFBTSxHQUEwQixNQUFNLGFBQWEsQ0FBQztZQUUxRCxNQUFNLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNwQyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNyQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsT0FBTyxDQUFDO2dCQUNuQixRQUFRLEVBQUUsSUFBSTtnQkFDZCxPQUFPLEVBQUUsS0FBSzthQUNmLENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO1FBRUgsRUFBRSxDQUFDLHNEQUFzRCxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ3BFLE9BQU8sT0FBTyxDQUFDLEdBQUcsQ0FBQyw4QkFBOEIsQ0FBQztZQUVsRCxNQUFNLFdBQVcsR0FBRyxpQkFBaUIsRUFBRSxDQUFDO1lBQ3hDLGtCQUFrQixDQUFDLGVBQWUsQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUNoRCxVQUFVLENBQUMsRUFBRSxDQUFDLHlCQUFVLENBQUMsQ0FBQyxRQUFRLENBQUMsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQztZQUN4RCxVQUFVLENBQUMsRUFBRSxDQUFDLHlCQUFVLENBQUMsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7WUFFdkMsTUFBTSxLQUFLLEdBQUcsZUFBZSxFQUFFLENBQUM7WUFDaEMsTUFBTSxNQUFNLEdBQTBCLE1BQU0sSUFBQSxnQ0FBTyxFQUFDLEtBQUssQ0FBQyxDQUFDO1lBRTNELE1BQU0sQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3BDLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3JDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUM7Z0JBQ25CLFFBQVEsRUFBRSxJQUFJO2dCQUNkLE9BQU8sRUFBRSxLQUFLO2FBQ2YsQ0FBQyxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7UUFFSCxFQUFFLENBQUMsMkRBQTJELEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDekUsT0FBTztpQkFDSixFQUFFLENBQUMsZ0NBQW1CLEVBQUU7Z0JBQ3ZCLElBQUksRUFBRSw2QkFBNkI7Z0JBQ25DLGNBQWMsRUFBRSxJQUFJO2FBQ3JCLENBQUM7aUJBQ0QsT0FBTyxDQUFDLElBQUksS0FBSyxDQUFDLHFCQUFxQixDQUFDLENBQUMsQ0FBQztZQUU3QyxNQUFNLEtBQUssR0FBRyxlQUFlLEVBQUUsQ0FBQztZQUNoQyxNQUFNLE1BQU0sR0FBMEIsTUFBTSxJQUFBLGdDQUFPLEVBQUMsS0FBSyxDQUFDLENBQUM7WUFFM0QsTUFBTSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDcEMsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDckMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQyxFQUFFLEtBQUssRUFBRSx1QkFBdUIsRUFBRSxDQUFDLENBQUM7UUFDM0QsQ0FBQyxDQUFDLENBQUM7UUFFSCxFQUFFLENBQUMsa0VBQWtFLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDaEYsT0FBTztpQkFDSixFQUFFLENBQUMsZ0NBQW1CLEVBQUU7Z0JBQ3ZCLElBQUksRUFBRSxvQ0FBb0M7Z0JBQzFDLGNBQWMsRUFBRSxJQUFJO2FBQ3JCLENBQUM7aUJBQ0QsT0FBTyxDQUFDLElBQUksS0FBSyxDQUFDLHFCQUFxQixDQUFDLENBQUMsQ0FBQztZQUU3QyxNQUFNLEtBQUssR0FBRyxlQUFlLEVBQUUsQ0FBQztZQUNoQyxNQUFNLE1BQU0sR0FBMEIsTUFBTSxJQUFBLGdDQUFPLEVBQUMsS0FBSyxDQUFDLENBQUM7WUFFM0QsTUFBTSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDcEMsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDckMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQyxFQUFFLEtBQUssRUFBRSx1QkFBdUIsRUFBRSxDQUFDLENBQUM7UUFDM0QsQ0FBQyxDQUFDLENBQUM7UUFFSCxFQUFFLENBQUMsMENBQTBDLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDeEQsT0FBTztpQkFDSixFQUFFLENBQUMsZ0NBQW1CLEVBQUU7Z0JBQ3ZCLElBQUksRUFBRSxvQ0FBb0M7Z0JBQzFDLGNBQWMsRUFBRSxJQUFJO2FBQ3JCLENBQUM7aUJBQ0QsUUFBUSxDQUFDO2dCQUNSLFNBQVMsRUFBRTtvQkFDVCxLQUFLLEVBQUUsRUFBRTtpQkFDVjthQUNGLENBQUMsQ0FBQztZQUVMLE1BQU0sS0FBSyxHQUFHLGVBQWUsRUFBRSxDQUFDO1lBQ2hDLE1BQU0sTUFBTSxHQUEwQixNQUFNLElBQUEsZ0NBQU8sRUFBQyxLQUFLLENBQUMsQ0FBQztZQUUzRCxNQUFNLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNwQyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNyQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsT0FBTyxDQUFDLEVBQUUsS0FBSyxFQUFFLHVCQUF1QixFQUFFLENBQUMsQ0FBQztRQUMzRCxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0lBRUgsUUFBUSxDQUFDLHVCQUF1QixFQUFFLEdBQUcsRUFBRTtRQUNyQyxFQUFFLENBQUMsZ0RBQWdELEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDOUQsTUFBTSxXQUFXLEdBQUcsaUJBQWlCLENBQUMsMEJBQTBCLENBQUMsQ0FBQztZQUNsRSxrQkFBa0IsQ0FBQyxlQUFlLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDaEQsVUFBVSxDQUFDLEVBQUUsQ0FBQyx5QkFBVSxDQUFDLENBQUMsUUFBUSxDQUFDLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUM7WUFDeEQsVUFBVSxDQUFDLEVBQUUsQ0FBQyx5QkFBVSxDQUFDLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBRXZDLE1BQU0sS0FBSyxHQUFHLGVBQWUsQ0FBQztnQkFDNUIsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUM7b0JBQ25CLEVBQUUsRUFBRSxXQUFXO29CQUNmLElBQUksRUFBRSwwQkFBMEI7b0JBQ2hDLElBQUksRUFBRTt3QkFDSixNQUFNLEVBQUU7NEJBQ04sRUFBRSxFQUFFLGFBQWE7eUJBQ2xCO3FCQUNGO2lCQUNGLENBQUM7YUFDSCxDQUFDLENBQUM7WUFFSCxNQUFNLE1BQU0sR0FBMEIsTUFBTSxJQUFBLGdDQUFPLEVBQUMsS0FBSyxDQUFDLENBQUM7WUFFM0QsTUFBTSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDcEMsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDckMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQztnQkFDbkIsUUFBUSxFQUFFLElBQUk7Z0JBQ2QsT0FBTyxFQUFFLEtBQUs7YUFDZixDQUFDLENBQUM7WUFFSCxzQ0FBc0M7WUFDdEMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDLHlCQUF5QixDQUFDLHlCQUFVLEVBQUU7Z0JBQ3ZELFNBQVMsRUFBRSwrQkFBK0I7Z0JBQzFDLElBQUksRUFBRSxNQUFNLENBQUMsZ0JBQWdCLENBQUM7b0JBQzVCLE1BQU0sRUFBRSxRQUFRO29CQUNoQixLQUFLLEVBQUUsTUFBTSxDQUFDLGdCQUFnQixDQUFDLHNCQUFzQixDQUFDO2lCQUN2RCxDQUFDO2FBQ0gsQ0FBQyxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztJQUVILFFBQVEsQ0FBQywwQkFBMEIsRUFBRSxHQUFHLEVBQUU7UUFDeEMsRUFBRSxDQUFDLG1DQUFtQyxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ2pELE1BQU0sV0FBVyxHQUFHLGlCQUFpQixFQUFFLENBQUM7WUFDeEMsa0JBQWtCLENBQUMsZUFBZSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1lBQ2hELFVBQVUsQ0FBQyxFQUFFLENBQUMseUJBQVUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDO1lBRXhELE1BQU0sU0FBUyxHQUFHLGdCQUFnQixDQUFDO1lBQ25DLFVBQVUsQ0FBQyxFQUFFLENBQUMsNkJBQWEsQ0FBQyxDQUFDLFFBQVEsQ0FBQztnQkFDcEMsVUFBVSxFQUFFLEdBQUc7Z0JBQ2YsOERBQThEO2dCQUM5RCxPQUFPLEVBQUUsSUFBSSxrQkFBVyxFQUFFLENBQUMsTUFBTSxDQUMvQixJQUFJLENBQUMsU0FBUyxDQUFDO29CQUNiLFVBQVUsRUFBRSxHQUFHO29CQUNmLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsU0FBUyxFQUFFLENBQUM7aUJBQ3BDLENBQUMsQ0FFSTthQUNULENBQUMsQ0FBQztZQUNILFVBQVUsQ0FBQyxFQUFFLENBQUMseUJBQVUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUV2QyxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDO2dCQUM3QixFQUFFLEVBQUUsV0FBVztnQkFDZixJQUFJLEVBQUUsNEJBQTRCO2dCQUNsQyxJQUFJLEVBQUU7b0JBQ0osTUFBTSxFQUFFO3dCQUNOLEVBQUUsRUFBRSxhQUFhO3dCQUNqQixtQkFBbUIsRUFBRSxVQUFVO3dCQUMvQixjQUFjLEVBQUUsTUFBTTtxQkFDdkI7aUJBQ0Y7YUFDRixDQUFDLENBQUM7WUFFSCxNQUFNLEtBQUssR0FBRyxlQUFlLENBQUM7Z0JBQzVCLElBQUksRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUM7Z0JBQzdDLGVBQWUsRUFBRSxJQUFJO2FBQ3RCLENBQUMsQ0FBQztZQUVILE1BQU0sTUFBTSxHQUEwQixNQUFNLElBQUEsZ0NBQU8sRUFBQyxLQUFLLENBQUMsQ0FBQztZQUUzRCxNQUFNLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNwQyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNyQyxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUN6QyxDQUFDLENBQUMsQ0FBQztRQUVILEVBQUUsQ0FBQyxrREFBa0QsRUFBRSxLQUFLLElBQUksRUFBRTtZQUNoRSxNQUFNLFdBQVcsR0FBRyxpQkFBaUIsRUFBRSxDQUFDO1lBQ3hDLGtCQUFrQixDQUFDLGVBQWUsQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUNoRCxVQUFVLENBQUMsRUFBRSxDQUFDLHlCQUFVLENBQUMsQ0FBQyxRQUFRLENBQUMsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQztZQUV4RCxNQUFNLFNBQVMsR0FBRyxrQkFBa0IsQ0FBQztZQUNyQyxVQUFVLENBQUMsRUFBRSxDQUFDLDZCQUFhLENBQUMsQ0FBQyxRQUFRLENBQUM7Z0JBQ3BDLFVBQVUsRUFBRSxHQUFHO2dCQUNmLDhEQUE4RDtnQkFDOUQsT0FBTyxFQUFFLElBQUksa0JBQVcsRUFBRSxDQUFDLE1BQU0sQ0FDL0IsSUFBSSxDQUFDLFNBQVMsQ0FBQztvQkFDYixVQUFVLEVBQUUsR0FBRztvQkFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLFNBQVMsRUFBRSxDQUFDO2lCQUNwQyxDQUFDLENBRUk7YUFDVCxDQUFDLENBQUM7WUFDSCxVQUFVLENBQUMsRUFBRSxDQUFDLHlCQUFVLENBQUMsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7WUFFdkMsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQztnQkFDN0IsRUFBRSxFQUFFLFdBQVc7Z0JBQ2YsSUFBSSxFQUFFLDRCQUE0QjtnQkFDbEMsSUFBSSxFQUFFO29CQUNKLE1BQU0sRUFBRTt3QkFDTixFQUFFLEVBQUUsYUFBYTt3QkFDakIsbUJBQW1CLEVBQUUsVUFBVTt3QkFDL0IsY0FBYyxFQUFFLE1BQU07cUJBQ3ZCO2lCQUNGO2FBQ0YsQ0FBQyxDQUFDO1lBRUgsOEJBQThCO1lBQzlCLE1BQU0sS0FBSyxHQUFHLGVBQWUsQ0FBQztnQkFDNUIsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUM7b0JBQ25CLElBQUksRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUM7b0JBQzdDLE9BQU8sRUFBRTt3QkFDUCxrQkFBa0IsRUFBRSxnQkFBZ0I7cUJBQ3JDO2lCQUNGLENBQUM7YUFDSCxDQUFDLENBQUM7WUFFSCxNQUFNLE1BQU0sR0FBMEIsTUFBTSxJQUFBLGdDQUFPLEVBQUMsS0FBSyxDQUFDLENBQUM7WUFFM0QsTUFBTSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDcEMsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDckMsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDekMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztJQUVILFFBQVEsQ0FBQyxtQkFBbUIsRUFBRSxHQUFHLEVBQUU7UUFDakMsRUFBRSxDQUFDLDBEQUEwRCxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ3hFLE1BQU0sY0FBYyxHQUFHO2dCQUNyQixRQUFRLEVBQUUsWUFBWTtnQkFDdEIsUUFBUSxFQUFFLFlBQVk7Z0JBQ3RCLFNBQVMsRUFBRSxRQUFRO2FBQ3BCLENBQUM7WUFFRixNQUFNLFdBQVcsR0FBRyxpQkFBaUIsQ0FBQyw0QkFBNEIsRUFBRTtnQkFDbEUsUUFBUSxFQUFFO29CQUNSLE1BQU0sRUFBRSxVQUFVO29CQUNsQixHQUFHLGNBQWM7aUJBQ2xCO2FBQ0YsQ0FBQyxDQUFDO1lBQ0gsa0JBQWtCLENBQUMsZUFBZSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1lBQ2hELFVBQVUsQ0FBQyxFQUFFLENBQUMseUJBQVUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDO1lBRXhELE1BQU0sU0FBUyxHQUFHLGtCQUFrQixDQUFDO1lBQ3JDLFVBQVUsQ0FBQyxFQUFFLENBQUMsNkJBQWEsQ0FBQyxDQUFDLFFBQVEsQ0FBQztnQkFDcEMsVUFBVSxFQUFFLEdBQUc7Z0JBQ2YsOERBQThEO2dCQUM5RCxPQUFPLEVBQUUsSUFBSSxrQkFBVyxFQUFFLENBQUMsTUFBTSxDQUMvQixJQUFJLENBQUMsU0FBUyxDQUFDO29CQUNiLFVBQVUsRUFBRSxHQUFHO29CQUNmLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsU0FBUyxFQUFFLENBQUM7aUJBQ3BDLENBQUMsQ0FFSTthQUNULENBQUMsQ0FBQztZQUNILFVBQVUsQ0FBQyxFQUFFLENBQUMseUJBQVUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUV2QyxNQUFNLEtBQUssR0FBRyxlQUFlLEVBQUUsQ0FBQztZQUNoQyxNQUFNLE1BQU0sR0FBMEIsTUFBTSxJQUFBLGdDQUFPLEVBQUMsS0FBSyxDQUFDLENBQUM7WUFFM0QsTUFBTSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7WUFFcEMsdUNBQXVDO1lBQ3ZDLE1BQU0sVUFBVSxHQUFHLFVBQVUsQ0FBQyxZQUFZLENBQUMsNkJBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzdELE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsT0FBaUIsQ0FBQyxDQUFDO1lBQ3ZFLE1BQU0sQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUMsYUFBYSxDQUFDO2dCQUNyQyxTQUFTLEVBQUUsYUFBYTtnQkFDeEIsTUFBTSxFQUFFLFVBQVU7Z0JBQ2xCLEdBQUcsY0FBYzthQUNsQixDQUFDLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztRQUVILEVBQUUsQ0FBQywyQ0FBMkMsRUFBRSxLQUFLLElBQUksRUFBRTtZQUN6RCxNQUFNLFdBQVcsR0FBRyxpQkFBaUIsQ0FBQyw0QkFBNEIsRUFBRTtnQkFDbEUsY0FBYyxFQUFFLElBQUk7Z0JBQ3BCLFlBQVksRUFBRSxJQUFJO2dCQUNsQixRQUFRLEVBQUUsSUFBSTtnQkFDZCxjQUFjLEVBQUUsSUFBSTthQUNyQixDQUFDLENBQUM7WUFDSCxrQkFBa0IsQ0FBQyxlQUFlLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDaEQsVUFBVSxDQUFDLEVBQUUsQ0FBQyx5QkFBVSxDQUFDLENBQUMsUUFBUSxDQUFDLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUM7WUFFeEQsTUFBTSxTQUFTLEdBQUcscUJBQXFCLENBQUM7WUFDeEMsVUFBVSxDQUFDLEVBQUUsQ0FBQyw2QkFBYSxDQUFDLENBQUMsUUFBUSxDQUFDO2dCQUNwQyxVQUFVLEVBQUUsR0FBRztnQkFDZiw4REFBOEQ7Z0JBQzlELE9BQU8sRUFBRSxJQUFJLGtCQUFXLEVBQUUsQ0FBQyxNQUFNLENBQy9CLElBQUksQ0FBQyxTQUFTLENBQUM7b0JBQ2IsVUFBVSxFQUFFLEdBQUc7b0JBQ2YsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxTQUFTLEVBQUUsQ0FBQztpQkFDcEMsQ0FBQyxDQUVJO2FBQ1QsQ0FBQyxDQUFDO1lBQ0gsVUFBVSxDQUFDLEVBQUUsQ0FBQyx5QkFBVSxDQUFDLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBRXZDLE1BQU0sS0FBSyxHQUFHLGVBQWUsRUFBRSxDQUFDO1lBQ2hDLE1BQU0sTUFBTSxHQUEwQixNQUFNLElBQUEsZ0NBQU8sRUFBQyxLQUFLLENBQUMsQ0FBQztZQUUzRCxNQUFNLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUVwQyx1Q0FBdUM7WUFDdkMsTUFBTSxVQUFVLEdBQUcsVUFBVSxDQUFDLFlBQVksQ0FBQyw2QkFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDN0QsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFpQixDQUFDLENBQUM7WUFDdkUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLGVBQWUsQ0FBQyxDQUFDO1lBQzdELE1BQU0sQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxhQUFhLENBQUMsQ0FBQztZQUMzRCxNQUFNLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDeEQsTUFBTSxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFDakUsQ0FBQyxDQUFDLENBQUM7UUFFSCxFQUFFLENBQUMsd0NBQXdDLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDdEQsTUFBTSxXQUFXLEdBQUcsaUJBQWlCLENBQUMsNEJBQTRCLEVBQUU7Z0JBQ2xFLGNBQWMsRUFBRSxFQUFFLEVBQUUsRUFBRSxhQUFhLEVBQXVCO2FBQzNELENBQUMsQ0FBQztZQUNILGtCQUFrQixDQUFDLGVBQWUsQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUNoRCxVQUFVLENBQUMsRUFBRSxDQUFDLHlCQUFVLENBQUMsQ0FBQyxRQUFRLENBQUMsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQztZQUV4RCxNQUFNLFNBQVMsR0FBRyxtQkFBbUIsQ0FBQztZQUN0QyxVQUFVLENBQUMsRUFBRSxDQUFDLDZCQUFhLENBQUMsQ0FBQyxRQUFRLENBQUM7Z0JBQ3BDLFVBQVUsRUFBRSxHQUFHO2dCQUNmLDhEQUE4RDtnQkFDOUQsT0FBTyxFQUFFLElBQUksa0JBQVcsRUFBRSxDQUFDLE1BQU0sQ0FDL0IsSUFBSSxDQUFDLFNBQVMsQ0FBQztvQkFDYixVQUFVLEVBQUUsR0FBRztvQkFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLFNBQVMsRUFBRSxDQUFDO2lCQUNwQyxDQUFDLENBRUk7YUFDVCxDQUFDLENBQUM7WUFDSCxVQUFVLENBQUMsRUFBRSxDQUFDLHlCQUFVLENBQUMsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7WUFFdkMsTUFBTSxLQUFLLEdBQUcsZUFBZSxFQUFFLENBQUM7WUFDaEMsTUFBTSxNQUFNLEdBQTBCLE1BQU0sSUFBQSxnQ0FBTyxFQUFDLEtBQUssQ0FBQyxDQUFDO1lBRTNELE1BQU0sQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBRXBDLDREQUE0RDtZQUM1RCxNQUFNLFVBQVUsR0FBRyxVQUFVLENBQUMsWUFBWSxDQUFDLDZCQUFhLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUM3RCxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQWlCLENBQUMsQ0FBQztZQUN2RSxNQUFNLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsaUJBQWlCLENBQUMsQ0FBQztRQUNqRSxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0lBRUgsUUFBUSxDQUFDLDRCQUE0QixFQUFFLEdBQUcsRUFBRTtRQUMxQyxFQUFFLENBQUMscUNBQXFDLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDbkQsTUFBTSxXQUFXLEdBQUcsaUJBQWlCLEVBQUUsQ0FBQztZQUN4QyxrQkFBa0IsQ0FBQyxlQUFlLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDaEQsVUFBVSxDQUFDLEVBQUUsQ0FBQyx5QkFBVSxDQUFDLENBQUMsUUFBUSxDQUFDLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUM7WUFFeEQsTUFBTSxTQUFTLEdBQUcsZ0JBQWdCLENBQUM7WUFDbkMsVUFBVSxDQUFDLEVBQUUsQ0FBQyw2QkFBYSxDQUFDLENBQUMsUUFBUSxDQUFDO2dCQUNwQyxVQUFVLEVBQUUsR0FBRztnQkFDZiw4REFBOEQ7Z0JBQzlELE9BQU8sRUFBRSxJQUFJLGtCQUFXLEVBQUUsQ0FBQyxNQUFNLENBQy9CLElBQUksQ0FBQyxTQUFTLENBQUM7b0JBQ2IsVUFBVSxFQUFFLEdBQUc7b0JBQ2YsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxTQUFTLEVBQUUsQ0FBQztpQkFDcEMsQ0FBQyxDQUVJO2FBQ1QsQ0FBQyxDQUFDO1lBQ0gsVUFBVSxDQUFDLEVBQUUsQ0FBQyx5QkFBVSxDQUFDLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBRXZDLE1BQU0sS0FBSyxHQUFHLGVBQWUsRUFBRSxDQUFDO1lBQ2hDLE1BQU0sSUFBQSxnQ0FBTyxFQUFDLEtBQUssQ0FBQyxDQUFDO1lBRXJCLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQyx5QkFBeUIsQ0FBQyx5QkFBVSxFQUFFO2dCQUN2RCxTQUFTLEVBQUUsK0JBQStCO2dCQUMxQyxJQUFJLEVBQUUsTUFBTSxDQUFDLGdCQUFnQixDQUFDO29CQUM1QixTQUFTLEVBQUUsYUFBYTtvQkFDeEIsT0FBTyxFQUFFLFdBQVc7b0JBQ3BCLE1BQU0sRUFBRSxXQUFXO29CQUNuQixTQUFTO29CQUNULFdBQVcsRUFBRSxNQUFNLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQztpQkFDaEMsQ0FBQzthQUNILENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO1FBRUgsRUFBRSxDQUFDLDRDQUE0QyxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQzFELE1BQU0sV0FBVyxHQUFHLGlCQUFpQixFQUFFLENBQUM7WUFDeEMsa0JBQWtCLENBQUMsZUFBZSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1lBQ2hELFVBQVUsQ0FBQyxFQUFFLENBQUMseUJBQVUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDO1lBRXhELE1BQU0sWUFBWSxHQUFHLDBCQUEwQixDQUFDO1lBQ2hELFVBQVUsQ0FBQyxFQUFFLENBQUMsNkJBQWEsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxJQUFJLEtBQUssQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDO1lBQzlELFVBQVUsQ0FBQyxFQUFFLENBQUMseUJBQVUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUV2QyxNQUFNLEtBQUssR0FBRyxlQUFlLEVBQUUsQ0FBQztZQUNoQyxNQUFNLGFBQWEsR0FBRyxJQUFBLGdDQUFPLEVBQUMsS0FBSyxDQUFDLENBQUM7WUFFckMsdUNBQXVDO1lBQ3ZDLE1BQU0sSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7WUFFL0IsTUFBTSxhQUFhLENBQUM7WUFFcEIsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDLHlCQUF5QixDQUFDLHlCQUFVLEVBQUU7Z0JBQ3ZELFNBQVMsRUFBRSwrQkFBK0I7Z0JBQzFDLElBQUksRUFBRSxNQUFNLENBQUMsZ0JBQWdCLENBQUM7b0JBQzVCLFNBQVMsRUFBRSxhQUFhO29CQUN4QixPQUFPLEVBQUUsV0FBVztvQkFDcEIsTUFBTSxFQUFFLFFBQVE7b0JBQ2hCLEtBQUssRUFBRSxZQUFZO29CQUNuQixXQUFXLEVBQUUsTUFBTSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUM7aUJBQ2hDLENBQUM7YUFDSCxDQUFDLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztRQUVILEVBQUUsQ0FBQyxvREFBb0QsRUFBRSxLQUFLLElBQUksRUFBRTtZQUNsRSxNQUFNLFdBQVcsR0FBRyxpQkFBaUIsRUFBRSxDQUFDO1lBQ3hDLGtCQUFrQixDQUFDLGVBQWUsQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUNoRCxVQUFVLENBQUMsRUFBRSxDQUFDLHlCQUFVLENBQUMsQ0FBQyxRQUFRLENBQUMsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQztZQUV4RCxNQUFNLFNBQVMsR0FBRyxxQkFBcUIsQ0FBQztZQUN4QyxVQUFVLENBQUMsRUFBRSxDQUFDLDZCQUFhLENBQUMsQ0FBQyxRQUFRLENBQUM7Z0JBQ3BDLFVBQVUsRUFBRSxHQUFHO2dCQUNmLDhEQUE4RDtnQkFDOUQsT0FBTyxFQUFFLElBQUksa0JBQVcsRUFBRSxDQUFDLE1BQU0sQ0FDL0IsSUFBSSxDQUFDLFNBQVMsQ0FBQztvQkFDYixVQUFVLEVBQUUsR0FBRztvQkFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLFNBQVMsRUFBRSxDQUFDO2lCQUNwQyxDQUFDLENBRUk7YUFDVCxDQUFDLENBQUM7WUFFSCx5QkFBeUI7WUFDekIsVUFBVSxDQUFDLEVBQUUsQ0FBQyx5QkFBVSxDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksS0FBSyxDQUFDLHNCQUFzQixDQUFDLENBQUMsQ0FBQztZQUVyRSxNQUFNLEtBQUssR0FBRyxlQUFlLEVBQUUsQ0FBQztZQUNoQyxNQUFNLE1BQU0sR0FBMEIsTUFBTSxJQUFBLGdDQUFPLEVBQUMsS0FBSyxDQUFDLENBQUM7WUFFM0QsOEJBQThCO1lBQzlCLE1BQU0sQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3BDLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3JDLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ3pDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7SUFFSCxRQUFRLENBQUMsbUJBQW1CLEVBQUUsR0FBRyxFQUFFO1FBQ2pDLEVBQUUsQ0FBQyxxREFBcUQsRUFBRSxLQUFLLElBQUksRUFBRTtZQUNuRSxnRkFBZ0Y7WUFDaEYsa0JBQWtCLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFO2dCQUN6QyxNQUFNLElBQUksS0FBSyxDQUFDLGtCQUFrQixDQUFDLENBQUM7WUFDdEMsQ0FBQyxDQUFDLENBQUM7WUFFSCxNQUFNLEtBQUssR0FBRyxlQUFlLEVBQUUsQ0FBQztZQUNoQyxNQUFNLE1BQU0sR0FBMEIsTUFBTSxJQUFBLGdDQUFPLEVBQUMsS0FBSyxDQUFDLENBQUM7WUFFM0QseUZBQXlGO1lBQ3pGLE1BQU0sQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3BDLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3JDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUMsRUFBRSxLQUFLLEVBQUUsbUJBQW1CLEVBQUUsQ0FBQyxDQUFDO1FBQ3ZELENBQUMsQ0FBQyxDQUFDO1FBRUgsRUFBRSxDQUFDLDhFQUE4RSxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQzVGLHlDQUF5QztZQUN6QyxNQUFNLFdBQVcsR0FBRyxpQkFBaUIsRUFBRSxDQUFDO1lBQ3hDLGtCQUFrQixDQUFDLGVBQWUsQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUVoRCxtRUFBbUU7WUFDbkUsVUFBVSxDQUFDLEVBQUUsQ0FBQyx5QkFBVSxDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksS0FBSyxDQUFDLDJCQUEyQixDQUFDLENBQUMsQ0FBQztZQUUxRSxvQ0FBb0M7WUFDcEMsTUFBTSxTQUFTLEdBQUcsd0JBQXdCLENBQUM7WUFDM0MsVUFBVSxDQUFDLEVBQUUsQ0FBQyw2QkFBYSxDQUFDLENBQUMsUUFBUSxDQUFDO2dCQUNwQyxVQUFVLEVBQUUsR0FBRztnQkFDZiw4REFBOEQ7Z0JBQzlELE9BQU8sRUFBRSxJQUFJLGtCQUFXLEVBQUUsQ0FBQyxNQUFNLENBQy9CLElBQUksQ0FBQyxTQUFTLENBQUM7b0JBQ2IsVUFBVSxFQUFFLEdBQUc7b0JBQ2YsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxTQUFTLEVBQUUsQ0FBQztpQkFDcEMsQ0FBQyxDQUVJO2FBQ1QsQ0FBQyxDQUFDO1lBRUgsNEJBQTRCO1lBQzVCLFVBQVUsQ0FBQyxFQUFFLENBQUMseUJBQVUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUV2QyxNQUFNLEtBQUssR0FBRyxlQUFlLEVBQUUsQ0FBQztZQUNoQyxNQUFNLE1BQU0sR0FBMEIsTUFBTSxJQUFBLGdDQUFPLEVBQUMsS0FBSyxDQUFDLENBQUM7WUFFM0Qsb0RBQW9EO1lBQ3BELE1BQU0sQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3BDLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3JDLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ3pDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEFQSUdhdGV3YXlQcm94eUV2ZW50LCBBUElHYXRld2F5UHJveHlSZXN1bHQgfSBmcm9tICdhd3MtbGFtYmRhJztcbmltcG9ydCB7IGhhbmRsZXIgfSBmcm9tICcuLi8uLi9sYW1iZGEvcGF5bWVudHMvc3RyaXBlLXdlYmhvb2staGFuZGxlcic7XG5pbXBvcnQgeyBtb2NrQ2xpZW50IH0gZnJvbSAnYXdzLXNkay1jbGllbnQtbW9jayc7XG5pbXBvcnQgeyBTU01DbGllbnQsIEdldFBhcmFtZXRlckNvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtc3NtJztcbmltcG9ydCB7IExhbWJkYUNsaWVudCwgSW52b2tlQ29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1sYW1iZGEnO1xuaW1wb3J0IHsgRHluYW1vREJEb2N1bWVudENsaWVudCwgUHV0Q29tbWFuZCwgR2V0Q29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYic7XG5pbXBvcnQgU3RyaXBlIGZyb20gJ3N0cmlwZSc7XG5pbXBvcnQgeyBUZXh0RW5jb2RlciB9IGZyb20gJ3V0aWwnO1xuXG4vLyBNb2NrIEFXUyBjbGllbnRzXG5jb25zdCBzc21Nb2NrID0gbW9ja0NsaWVudChTU01DbGllbnQpO1xuY29uc3QgbGFtYmRhTW9jayA9IG1vY2tDbGllbnQoTGFtYmRhQ2xpZW50KTtcbmNvbnN0IGR5bmFtb01vY2sgPSBtb2NrQ2xpZW50KER5bmFtb0RCRG9jdW1lbnRDbGllbnQpO1xuXG4vLyBNb2NrIFN0cmlwZSBjb25zdHJ1Y3RFdmVudFxuY29uc3QgbW9ja0NvbnN0cnVjdEV2ZW50ID0gamVzdC5mbigpO1xuY29uc3QgbW9ja1N0cmlwZSA9IHtcbiAgd2ViaG9va3M6IHtcbiAgICBjb25zdHJ1Y3RFdmVudDogbW9ja0NvbnN0cnVjdEV2ZW50LFxuICB9LFxufTtcblxuLy8gTW9jayBTdHJpcGUgbW9kdWxlXG5qZXN0Lm1vY2soJ3N0cmlwZScsICgpID0+IHtcbiAgcmV0dXJuIGplc3QuZm4oKS5tb2NrSW1wbGVtZW50YXRpb24oKCkgPT4gbW9ja1N0cmlwZSk7XG59KTtcblxuZGVzY3JpYmUoJ1N0cmlwZSBXZWJob29rIEhhbmRsZXIgTGFtYmRhJywgKCkgPT4ge1xuICBjb25zdCBtb2NrU3RyaXBlQXBpS2V5ID0gJ3NrX3Rlc3RfbW9ja19rZXlfMTIzJztcbiAgY29uc3QgbW9ja1dlYmhvb2tTZWNyZXQgPSAnd2hzZWNfdGVzdF9zZWNyZXRfMTIzJztcbiAgY29uc3QgbW9ja1VzZXJJZCA9ICd0ZXN0LXVzZXItMTIzJztcbiAgY29uc3QgbW9ja1Nlc3Npb25JZCA9ICdjc190ZXN0X3Nlc3Npb25fMTIzJztcbiAgY29uc3QgbW9ja0V2ZW50SWQgPSAnZXZ0X3Rlc3RfMTIzJztcblxuICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICBqZXN0LmNsZWFyQWxsTW9ja3MoKTtcbiAgICBqZXN0LnVzZUZha2VUaW1lcnMoKTtcbiAgICBzc21Nb2NrLnJlc2V0KCk7XG4gICAgbGFtYmRhTW9jay5yZXNldCgpO1xuICAgIGR5bmFtb01vY2sucmVzZXQoKTtcbiAgICBtb2NrQ29uc3RydWN0RXZlbnQubW9ja1Jlc2V0KCk7XG5cbiAgICAvLyBTZXR1cCBlbnZpcm9ubWVudCB2YXJpYWJsZXNcbiAgICBwcm9jZXNzLmVudi5TVFJJUEVfQVBJX0tFWV9QQVJBTUVURVJfTkFNRSA9ICcvYXVyYTI4L3Rlc3Qvc3RyaXBlL2FwaS1rZXknO1xuICAgIHByb2Nlc3MuZW52LlNUUklQRV9XRUJIT09LX1NFQ1JFVF9QQVJBTUVURVJfTkFNRSA9ICcvYXVyYTI4L3Rlc3Qvc3RyaXBlL3dlYmhvb2stc2VjcmV0JztcbiAgICBwcm9jZXNzLmVudi5HRU5FUkFURV9SRUFESU5HX0ZVTkNUSU9OX05BTUUgPSAndGVzdC1nZW5lcmF0ZS1yZWFkaW5nLWZ1bmN0aW9uJztcbiAgICBwcm9jZXNzLmVudi5XRUJIT09LX1BST0NFU1NJTkdfVEFCTEVfTkFNRSA9ICd0ZXN0LXdlYmhvb2stcHJvY2Vzc2luZy10YWJsZSc7XG5cbiAgICAvLyBTZXR1cCBkZWZhdWx0IFNTTSBwYXJhbWV0ZXIgcmVzcG9uc2VzXG4gICAgc3NtTW9ja1xuICAgICAgLm9uKEdldFBhcmFtZXRlckNvbW1hbmQsIHtcbiAgICAgICAgTmFtZTogJy9hdXJhMjgvdGVzdC9zdHJpcGUvYXBpLWtleScsXG4gICAgICAgIFdpdGhEZWNyeXB0aW9uOiB0cnVlLFxuICAgICAgfSlcbiAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgIFBhcmFtZXRlcjoge1xuICAgICAgICAgIFZhbHVlOiBtb2NrU3RyaXBlQXBpS2V5LFxuICAgICAgICB9LFxuICAgICAgfSk7XG5cbiAgICBzc21Nb2NrXG4gICAgICAub24oR2V0UGFyYW1ldGVyQ29tbWFuZCwge1xuICAgICAgICBOYW1lOiAnL2F1cmEyOC90ZXN0L3N0cmlwZS93ZWJob29rLXNlY3JldCcsXG4gICAgICAgIFdpdGhEZWNyeXB0aW9uOiB0cnVlLFxuICAgICAgfSlcbiAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgIFBhcmFtZXRlcjoge1xuICAgICAgICAgIFZhbHVlOiBtb2NrV2ViaG9va1NlY3JldCxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICB9KTtcblxuICBhZnRlckVhY2goKCkgPT4ge1xuICAgIGplc3QuY2xlYXJBbGxUaW1lcnMoKTtcbiAgICBqZXN0LnVzZVJlYWxUaW1lcnMoKTtcbiAgfSk7XG5cbiAgY29uc3QgY3JlYXRlTW9ja0V2ZW50ID0gKG92ZXJyaWRlczogUGFydGlhbDxBUElHYXRld2F5UHJveHlFdmVudD4gPSB7fSk6IEFQSUdhdGV3YXlQcm94eUV2ZW50ID0+IHtcbiAgICBjb25zdCBkZWZhdWx0Qm9keSA9IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgIGlkOiBtb2NrRXZlbnRJZCxcbiAgICAgIHR5cGU6ICdjaGVja291dC5zZXNzaW9uLmNvbXBsZXRlZCcsXG4gICAgICBkYXRhOiB7XG4gICAgICAgIG9iamVjdDoge1xuICAgICAgICAgIGlkOiBtb2NrU2Vzc2lvbklkLFxuICAgICAgICAgIGNsaWVudF9yZWZlcmVuY2VfaWQ6IG1vY2tVc2VySWQsXG4gICAgICAgICAgcGF5bWVudF9zdGF0dXM6ICdwYWlkJyxcbiAgICAgICAgICBjdXN0b21lcl9lbWFpbDogJ3Rlc3RAZXhhbXBsZS5jb20nLFxuICAgICAgICAgIGFtb3VudF90b3RhbDogMjkwMCxcbiAgICAgICAgICBjdXJyZW5jeTogJ3VzZCcsXG4gICAgICAgICAgcGF5bWVudF9pbnRlbnQ6ICdwaV90ZXN0XzEyMycsXG4gICAgICAgICAgbWV0YWRhdGE6IHtcbiAgICAgICAgICAgIHVzZXJJZDogbW9ja1VzZXJJZCxcbiAgICAgICAgICAgIHNlc3Npb25UeXBlOiAnb25lLXRpbWUnLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGh0dHBNZXRob2Q6ICdQT1NUJyxcbiAgICAgIHBhdGg6ICcvYXBpL3dlYmhvb2tzL3N0cmlwZScsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgICdjb250ZW50LXR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICdzdHJpcGUtc2lnbmF0dXJlJzogJ3Rlc3Qtc2lnbmF0dXJlJyxcbiAgICAgIH0sXG4gICAgICBib2R5OiBvdmVycmlkZXMuYm9keSB8fCBkZWZhdWx0Qm9keSxcbiAgICAgIGlzQmFzZTY0RW5jb2RlZDogZmFsc2UsXG4gICAgICAuLi5vdmVycmlkZXMsXG4gICAgfSBhcyBBUElHYXRld2F5UHJveHlFdmVudDtcbiAgfTtcblxuICBjb25zdCBjcmVhdGVTdHJpcGVFdmVudCA9IChcbiAgICB0eXBlOiBzdHJpbmcgPSAnY2hlY2tvdXQuc2Vzc2lvbi5jb21wbGV0ZWQnLFxuICAgIG92ZXJyaWRlczogUGFydGlhbDxTdHJpcGUuQ2hlY2tvdXQuU2Vzc2lvbj4gPSB7fSxcbiAgKTogU3RyaXBlLkV2ZW50ID0+IHtcbiAgICByZXR1cm4ge1xuICAgICAgaWQ6IG1vY2tFdmVudElkLFxuICAgICAgb2JqZWN0OiAnZXZlbnQnLFxuICAgICAgYXBpX3ZlcnNpb246ICcyMDI1LTA3LTMwLmJhc2lsJyxcbiAgICAgIGNyZWF0ZWQ6IE1hdGguZmxvb3IoRGF0ZS5ub3coKSAvIDEwMDApLFxuICAgICAgdHlwZSxcbiAgICAgIGRhdGE6IHtcbiAgICAgICAgb2JqZWN0OiB7XG4gICAgICAgICAgaWQ6IG1vY2tTZXNzaW9uSWQsXG4gICAgICAgICAgb2JqZWN0OiAnY2hlY2tvdXQuc2Vzc2lvbicsXG4gICAgICAgICAgY2xpZW50X3JlZmVyZW5jZV9pZDogbW9ja1VzZXJJZCxcbiAgICAgICAgICBwYXltZW50X3N0YXR1czogJ3BhaWQnLFxuICAgICAgICAgIGN1c3RvbWVyX2VtYWlsOiAndGVzdEBleGFtcGxlLmNvbScsXG4gICAgICAgICAgYW1vdW50X3RvdGFsOiAyOTAwLFxuICAgICAgICAgIGN1cnJlbmN5OiAndXNkJyxcbiAgICAgICAgICBwYXltZW50X2ludGVudDogJ3BpX3Rlc3RfMTIzJyxcbiAgICAgICAgICBtZXRhZGF0YToge1xuICAgICAgICAgICAgdXNlcklkOiBtb2NrVXNlcklkLFxuICAgICAgICAgICAgc2Vzc2lvblR5cGU6ICdvbmUtdGltZScsXG4gICAgICAgICAgfSxcbiAgICAgICAgICAuLi5vdmVycmlkZXMsXG4gICAgICAgIH0gYXMgU3RyaXBlLkNoZWNrb3V0LlNlc3Npb24sXG4gICAgICB9LFxuICAgICAgbGl2ZW1vZGU6IGZhbHNlLFxuICAgICAgcGVuZGluZ193ZWJob29rczogMSxcbiAgICAgIHJlcXVlc3Q6IHtcbiAgICAgICAgaWQ6IG51bGwsXG4gICAgICAgIGlkZW1wb3RlbmN5X2tleTogbnVsbCxcbiAgICAgIH0sXG4gICAgfSBhcyBTdHJpcGUuRXZlbnQ7XG4gIH07XG5cbiAgZGVzY3JpYmUoJ1dlYmhvb2sgc2lnbmF0dXJlIHZlcmlmaWNhdGlvbicsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIHN1Y2Nlc3NmdWxseSB2ZXJpZnkgYSB2YWxpZCB3ZWJob29rIHNpZ25hdHVyZScsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHN0cmlwZUV2ZW50ID0gY3JlYXRlU3RyaXBlRXZlbnQoKTtcbiAgICAgIG1vY2tDb25zdHJ1Y3RFdmVudC5tb2NrUmV0dXJuVmFsdWUoc3RyaXBlRXZlbnQpO1xuXG4gICAgICAvLyBNb2NrIGlkZW1wb3RlbmN5IGNoZWNrIC0gZXZlbnQgbm90IHByb2Nlc3NlZFxuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7IEl0ZW06IHVuZGVmaW5lZCB9KTtcblxuICAgICAgLy8gTW9jayBzdWNjZXNzZnVsIExhbWJkYSBpbnZvY2F0aW9uXG4gICAgICBjb25zdCByZWFkaW5nSWQgPSAncmVhZGluZy0xMjMnO1xuICAgICAgbGFtYmRhTW9jay5vbihJbnZva2VDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIFN0YXR1c0NvZGU6IDIwMCxcbiAgICAgICAgUGF5bG9hZDogbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKFxuICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgcmVhZGluZ0lkIH0pLFxuICAgICAgICAgIH0pLFxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICAgICkgYXMgYW55LFxuICAgICAgfSk7XG5cbiAgICAgIC8vIE1vY2sgcmVjb3JkaW5nIHByb2Nlc3NlZCBldmVudFxuICAgICAgZHluYW1vTW9jay5vbihQdXRDb21tYW5kKS5yZXNvbHZlcyh7fSk7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KCk7XG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5KS50b0VxdWFsKHtcbiAgICAgICAgcmVjZWl2ZWQ6IHRydWUsXG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgIHJlYWRpbmdJZCxcbiAgICAgIH0pO1xuXG4gICAgICBleHBlY3QobW9ja0NvbnN0cnVjdEV2ZW50KS50b0hhdmVCZWVuQ2FsbGVkV2l0aChcbiAgICAgICAgZXhwZWN0LmFueShTdHJpbmcpLFxuICAgICAgICAndGVzdC1zaWduYXR1cmUnLFxuICAgICAgICBtb2NrV2ViaG9va1NlY3JldCxcbiAgICAgICk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHJlamVjdCByZXF1ZXN0IHdpdGggaW52YWxpZCBzaWduYXR1cmUnLCBhc3luYyAoKSA9PiB7XG4gICAgICBtb2NrQ29uc3RydWN0RXZlbnQubW9ja0ltcGxlbWVudGF0aW9uKCgpID0+IHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIHdlYmhvb2sgc2lnbmF0dXJlJyk7XG4gICAgICB9KTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoKTtcbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSg0MDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkpLnRvRXF1YWwoeyBlcnJvcjogJ0ludmFsaWQgc2lnbmF0dXJlJyB9KTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgcmVqZWN0IHJlcXVlc3Qgd2l0aCBtaXNzaW5nIHNpZ25hdHVyZSBoZWFkZXInLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCh7XG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAnY29udGVudC10eXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICB9LFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSg0MDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkpLnRvRXF1YWwoeyBlcnJvcjogJ01pc3Npbmcgc2lnbmF0dXJlIGhlYWRlcicgfSk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBzaWduYXR1cmUgaGVhZGVyIHdpdGggZGlmZmVyZW50IGNhc2luZycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHN0cmlwZUV2ZW50ID0gY3JlYXRlU3RyaXBlRXZlbnQoKTtcbiAgICAgIG1vY2tDb25zdHJ1Y3RFdmVudC5tb2NrUmV0dXJuVmFsdWUoc3RyaXBlRXZlbnQpO1xuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7IEl0ZW06IHVuZGVmaW5lZCB9KTtcbiAgICAgIGxhbWJkYU1vY2sub24oSW52b2tlQ29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBTdGF0dXNDb2RlOiAyMDAsXG4gICAgICAgIFBheWxvYWQ6IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZShcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBzdGF0dXNDb2RlOiAyMDAsXG4gICAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IHJlYWRpbmdJZDogJ3JlYWRpbmctMTIzJyB9KSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgICApIGFzIGFueSxcbiAgICAgIH0pO1xuICAgICAgZHluYW1vTW9jay5vbihQdXRDb21tYW5kKS5yZXNvbHZlcyh7fSk7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KHtcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICdjb250ZW50LXR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgJ1N0cmlwZS1TaWduYXR1cmUnOiAndGVzdC1zaWduYXR1cmUnLCAvLyBDYXBpdGFsIGNhc2VcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIGV4cGVjdChtb2NrQ29uc3RydWN0RXZlbnQpLnRvSGF2ZUJlZW5DYWxsZWQoKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgcmVqZWN0IHJlcXVlc3Qgd2l0aCBtaXNzaW5nIGJvZHknLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCh7XG4gICAgICAgIGJvZHk6IG51bGwsXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDQwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keSkudG9FcXVhbCh7IGVycm9yOiAnTWlzc2luZyByZXF1ZXN0IGJvZHknIH0pO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnRXZlbnQgcHJvY2Vzc2luZyBmb3IgY2hlY2tvdXQuc2Vzc2lvbi5jb21wbGV0ZWQnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBwcm9jZXNzIGEgc3VjY2Vzc2Z1bCBjaGVja291dCBzZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3Qgc3RyaXBlRXZlbnQgPSBjcmVhdGVTdHJpcGVFdmVudCgpO1xuICAgICAgbW9ja0NvbnN0cnVjdEV2ZW50Lm1vY2tSZXR1cm5WYWx1ZShzdHJpcGVFdmVudCk7XG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHsgSXRlbTogdW5kZWZpbmVkIH0pO1xuXG4gICAgICBjb25zdCByZWFkaW5nSWQgPSAncmVhZGluZy00NTYnO1xuICAgICAgbGFtYmRhTW9jay5vbihJbnZva2VDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIFN0YXR1c0NvZGU6IDIwMCxcbiAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgICAgUGF5bG9hZDogbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKFxuICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgcmVhZGluZ0lkIH0pLFxuICAgICAgICAgIH0pLFxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICAgICkgYXMgYW55LFxuICAgICAgfSk7XG4gICAgICBkeW5hbW9Nb2NrLm9uKFB1dENvbW1hbmQpLnJlc29sdmVzKHt9KTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoKTtcbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkucmVhZGluZ0lkKS50b0JlKHJlYWRpbmdJZCk7XG5cbiAgICAgIC8vIFZlcmlmeSBMYW1iZGEgd2FzIGludm9rZWQgd2l0aCBjb3JyZWN0IHBhcmFtZXRlcnNcbiAgICAgIGV4cGVjdChsYW1iZGFNb2NrKS50b0hhdmVSZWNlaXZlZENvbW1hbmRXaXRoKEludm9rZUNvbW1hbmQsIHtcbiAgICAgICAgRnVuY3Rpb25OYW1lOiAndGVzdC1nZW5lcmF0ZS1yZWFkaW5nLWZ1bmN0aW9uJyxcbiAgICAgICAgSW52b2NhdGlvblR5cGU6ICdSZXF1ZXN0UmVzcG9uc2UnLFxuICAgICAgICBQYXlsb2FkOiBleHBlY3Quc3RyaW5nQ29udGFpbmluZyhtb2NrVXNlcklkKSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBWZXJpZnkgdGhlIHBheWxvYWQgc3RydWN0dXJlXG4gICAgICBjb25zdCBpbnZva2VDYWxsID0gbGFtYmRhTW9jay5jb21tYW5kQ2FsbHMoSW52b2tlQ29tbWFuZClbMF07XG4gICAgICBjb25zdCBwYXlsb2FkID0gSlNPTi5wYXJzZShpbnZva2VDYWxsLmFyZ3NbMF0uaW5wdXQuUGF5bG9hZCBhcyBzdHJpbmcpO1xuICAgICAgZXhwZWN0KHBheWxvYWQpLnRvTWF0Y2hPYmplY3Qoe1xuICAgICAgICBzb3VyY2U6ICd3ZWJob29rJyxcbiAgICAgICAgdXNlcklkOiBtb2NrVXNlcklkLFxuICAgICAgICBtZXRhZGF0YTogZXhwZWN0Lm9iamVjdENvbnRhaW5pbmcoe1xuICAgICAgICAgIHNlc3Npb25JZDogbW9ja1Nlc3Npb25JZCxcbiAgICAgICAgICBjdXN0b21lckVtYWlsOiAndGVzdEBleGFtcGxlLmNvbScsXG4gICAgICAgICAgYW1vdW50VG90YWw6IDI5MDAsXG4gICAgICAgICAgY3VycmVuY3k6ICd1c2QnLFxuICAgICAgICB9KSxcbiAgICAgICAgcmVxdWVzdENvbnRleHQ6IHtcbiAgICAgICAgICBhdXRob3JpemVyOiB7XG4gICAgICAgICAgICBjbGFpbXM6IHtcbiAgICAgICAgICAgICAgc3ViOiBtb2NrVXNlcklkLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHNraXAgcHJvY2Vzc2luZyBmb3IgdW5wYWlkIHNlc3Npb25zJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3Qgc3RyaXBlRXZlbnQgPSBjcmVhdGVTdHJpcGVFdmVudCgnY2hlY2tvdXQuc2Vzc2lvbi5jb21wbGV0ZWQnLCB7XG4gICAgICAgIHBheW1lbnRfc3RhdHVzOiAndW5wYWlkJyxcbiAgICAgIH0pO1xuICAgICAgbW9ja0NvbnN0cnVjdEV2ZW50Lm1vY2tSZXR1cm5WYWx1ZShzdHJpcGVFdmVudCk7XG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHsgSXRlbTogdW5kZWZpbmVkIH0pO1xuICAgICAgZHluYW1vTW9jay5vbihQdXRDb21tYW5kKS5yZXNvbHZlcyh7fSk7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KCk7XG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5KS50b0VxdWFsKHtcbiAgICAgICAgcmVjZWl2ZWQ6IHRydWUsXG4gICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgfSk7XG5cbiAgICAgIC8vIFZlcmlmeSBMYW1iZGEgd2FzIG5vdCBpbnZva2VkXG4gICAgICBleHBlY3QobGFtYmRhTW9jaykubm90LnRvSGF2ZVJlY2VpdmVkQ29tbWFuZChJbnZva2VDb21tYW5kKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIG1pc3NpbmcgdXNlcklkIGluIHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBzdHJpcGVFdmVudCA9IGNyZWF0ZVN0cmlwZUV2ZW50KCdjaGVja291dC5zZXNzaW9uLmNvbXBsZXRlZCcsIHtcbiAgICAgICAgY2xpZW50X3JlZmVyZW5jZV9pZDogbnVsbCxcbiAgICAgICAgbWV0YWRhdGE6IHt9LFxuICAgICAgfSk7XG4gICAgICBtb2NrQ29uc3RydWN0RXZlbnQubW9ja1JldHVyblZhbHVlKHN0cmlwZUV2ZW50KTtcbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVzb2x2ZXMoeyBJdGVtOiB1bmRlZmluZWQgfSk7XG4gICAgICBkeW5hbW9Nb2NrLm9uKFB1dENvbW1hbmQpLnJlc29sdmVzKHt9KTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoKTtcbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkpLnRvRXF1YWwoe1xuICAgICAgICByZWNlaXZlZDogdHJ1ZSxcbiAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICB9KTtcblxuICAgICAgLy8gVmVyaWZ5IExhbWJkYSB3YXMgbm90IGludm9rZWRcbiAgICAgIGV4cGVjdChsYW1iZGFNb2NrKS5ub3QudG9IYXZlUmVjZWl2ZWRDb21tYW5kKEludm9rZUNvbW1hbmQpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBleHRyYWN0IHVzZXJJZCBmcm9tIG1ldGFkYXRhIGlmIGNsaWVudF9yZWZlcmVuY2VfaWQgaXMgbWlzc2luZycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHN0cmlwZUV2ZW50ID0gY3JlYXRlU3RyaXBlRXZlbnQoJ2NoZWNrb3V0LnNlc3Npb24uY29tcGxldGVkJywge1xuICAgICAgICBjbGllbnRfcmVmZXJlbmNlX2lkOiBudWxsLFxuICAgICAgICBtZXRhZGF0YTogeyB1c2VySWQ6IG1vY2tVc2VySWQgfSxcbiAgICAgIH0pO1xuICAgICAgbW9ja0NvbnN0cnVjdEV2ZW50Lm1vY2tSZXR1cm5WYWx1ZShzdHJpcGVFdmVudCk7XG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHsgSXRlbTogdW5kZWZpbmVkIH0pO1xuXG4gICAgICBjb25zdCByZWFkaW5nSWQgPSAncmVhZGluZy03ODknO1xuICAgICAgbGFtYmRhTW9jay5vbihJbnZva2VDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIFN0YXR1c0NvZGU6IDIwMCxcbiAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgICAgUGF5bG9hZDogbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKFxuICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgcmVhZGluZ0lkIH0pLFxuICAgICAgICAgIH0pLFxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICAgICkgYXMgYW55LFxuICAgICAgfSk7XG4gICAgICBkeW5hbW9Nb2NrLm9uKFB1dENvbW1hbmQpLnJlc29sdmVzKHt9KTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoKTtcbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkucmVhZGluZ0lkKS50b0JlKHJlYWRpbmdJZCk7XG5cbiAgICAgIC8vIFZlcmlmeSBMYW1iZGEgd2FzIGludm9rZWQgd2l0aCB1c2VySWQgZnJvbSBtZXRhZGF0YVxuICAgICAgY29uc3QgaW52b2tlQ2FsbCA9IGxhbWJkYU1vY2suY29tbWFuZENhbGxzKEludm9rZUNvbW1hbmQpWzBdO1xuICAgICAgY29uc3QgcGF5bG9hZCA9IEpTT04ucGFyc2UoaW52b2tlQ2FsbC5hcmdzWzBdLmlucHV0LlBheWxvYWQgYXMgc3RyaW5nKTtcbiAgICAgIGV4cGVjdChwYXlsb2FkLnVzZXJJZCkudG9CZShtb2NrVXNlcklkKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgcHJvY2VzcyBhc3luYyBwYXltZW50IHN1Y2NlZWRlZCBldmVudHMnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBzdHJpcGVFdmVudCA9IGNyZWF0ZVN0cmlwZUV2ZW50KCdjaGVja291dC5zZXNzaW9uLmFzeW5jX3BheW1lbnRfc3VjY2VlZGVkJyk7XG4gICAgICBtb2NrQ29uc3RydWN0RXZlbnQubW9ja1JldHVyblZhbHVlKHN0cmlwZUV2ZW50KTtcbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVzb2x2ZXMoeyBJdGVtOiB1bmRlZmluZWQgfSk7XG5cbiAgICAgIGNvbnN0IHJlYWRpbmdJZCA9ICdyZWFkaW5nLWFzeW5jJztcbiAgICAgIGxhbWJkYU1vY2sub24oSW52b2tlQ29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBTdGF0dXNDb2RlOiAyMDAsXG4gICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICAgIFBheWxvYWQ6IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZShcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBzdGF0dXNDb2RlOiAyMDAsXG4gICAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IHJlYWRpbmdJZCB9KSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgICApIGFzIGFueSxcbiAgICAgIH0pO1xuICAgICAgZHluYW1vTW9jay5vbihQdXRDb21tYW5kKS5yZXNvbHZlcyh7fSk7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KHtcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIGlkOiBtb2NrRXZlbnRJZCxcbiAgICAgICAgICB0eXBlOiAnY2hlY2tvdXQuc2Vzc2lvbi5hc3luY19wYXltZW50X3N1Y2NlZWRlZCcsXG4gICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgb2JqZWN0OiB7XG4gICAgICAgICAgICAgIGlkOiBtb2NrU2Vzc2lvbklkLFxuICAgICAgICAgICAgICBjbGllbnRfcmVmZXJlbmNlX2lkOiBtb2NrVXNlcklkLFxuICAgICAgICAgICAgICBwYXltZW50X3N0YXR1czogJ3BhaWQnLFxuICAgICAgICAgICAgICBjdXN0b21lcl9lbWFpbDogJ3Rlc3RAZXhhbXBsZS5jb20nLFxuICAgICAgICAgICAgICBhbW91bnRfdG90YWw6IDI5MDAsXG4gICAgICAgICAgICAgIGN1cnJlbmN5OiAndXNkJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSksXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5yZWFkaW5nSWQpLnRvQmUocmVhZGluZ0lkKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0lkZW1wb3RlbmN5IGNoZWNraW5nJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgc2tpcCBwcm9jZXNzaW5nIGZvciBhbHJlYWR5IHByb2Nlc3NlZCBldmVudHMnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBzdHJpcGVFdmVudCA9IGNyZWF0ZVN0cmlwZUV2ZW50KCk7XG4gICAgICBtb2NrQ29uc3RydWN0RXZlbnQubW9ja1JldHVyblZhbHVlKHN0cmlwZUV2ZW50KTtcblxuICAgICAgLy8gTW9jayBpZGVtcG90ZW5jeSBjaGVjayAtIGV2ZW50IGFscmVhZHkgcHJvY2Vzc2VkXG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgSXRlbToge1xuICAgICAgICAgIGV2ZW50SWQ6IG1vY2tFdmVudElkLFxuICAgICAgICAgIHNlc3Npb25JZDogbW9ja1Nlc3Npb25JZCxcbiAgICAgICAgICBwcm9jZXNzZWRBdDogJzIwMjQtMDEtMDFUMDA6MDA6MDBaJyxcbiAgICAgICAgICBzdGF0dXM6ICdwcm9jZXNzZWQnLFxuICAgICAgICAgIHJlYWRpbmdJZDogJ2V4aXN0aW5nLXJlYWRpbmctMTIzJyxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCgpO1xuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keSkudG9FcXVhbCh7XG4gICAgICAgIHJlY2VpdmVkOiB0cnVlLFxuICAgICAgICBzdGF0dXM6ICdhbHJlYWR5X3Byb2Nlc3NlZCcsXG4gICAgICB9KTtcblxuICAgICAgLy8gVmVyaWZ5IExhbWJkYSB3YXMgbm90IGludm9rZWRcbiAgICAgIGV4cGVjdChsYW1iZGFNb2NrKS5ub3QudG9IYXZlUmVjZWl2ZWRDb21tYW5kKEludm9rZUNvbW1hbmQpO1xuXG4gICAgICAvLyBWZXJpZnkgbm8gbmV3IHJlY29yZCB3YXMgd3JpdHRlblxuICAgICAgZXhwZWN0KGR5bmFtb01vY2spLm5vdC50b0hhdmVSZWNlaXZlZENvbW1hbmQoUHV0Q29tbWFuZCk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGNvbnRpbnVlIHByb2Nlc3NpbmcgaWYgaWRlbXBvdGVuY3kgY2hlY2sgZmFpbHMnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBzdHJpcGVFdmVudCA9IGNyZWF0ZVN0cmlwZUV2ZW50KCk7XG4gICAgICBtb2NrQ29uc3RydWN0RXZlbnQubW9ja1JldHVyblZhbHVlKHN0cmlwZUV2ZW50KTtcblxuICAgICAgLy8gTW9jayBpZGVtcG90ZW5jeSBjaGVjayBmYWlsdXJlXG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlamVjdHMobmV3IEVycm9yKCdEeW5hbW9EQiBlcnJvcicpKTtcblxuICAgICAgY29uc3QgcmVhZGluZ0lkID0gJ3JlYWRpbmctYWZ0ZXItZXJyb3InO1xuICAgICAgbGFtYmRhTW9jay5vbihJbnZva2VDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIFN0YXR1c0NvZGU6IDIwMCxcbiAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgICAgUGF5bG9hZDogbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKFxuICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgcmVhZGluZ0lkIH0pLFxuICAgICAgICAgIH0pLFxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICAgICkgYXMgYW55LFxuICAgICAgfSk7XG4gICAgICBkeW5hbW9Nb2NrLm9uKFB1dENvbW1hbmQpLnJlc29sdmVzKHt9KTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoKTtcbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIC8vIFNob3VsZCBjb250aW51ZSBwcm9jZXNzaW5nIGRlc3BpdGUgaWRlbXBvdGVuY3kgY2hlY2sgZXJyb3JcbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkucmVhZGluZ0lkKS50b0JlKHJlYWRpbmdJZCk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBtaXNzaW5nIHdlYmhvb2sgcHJvY2Vzc2luZyB0YWJsZSBncmFjZWZ1bGx5JywgYXN5bmMgKCkgPT4ge1xuICAgICAgZGVsZXRlIHByb2Nlc3MuZW52LldFQkhPT0tfUFJPQ0VTU0lOR19UQUJMRV9OQU1FO1xuXG4gICAgICBjb25zdCBzdHJpcGVFdmVudCA9IGNyZWF0ZVN0cmlwZUV2ZW50KCk7XG4gICAgICBtb2NrQ29uc3RydWN0RXZlbnQubW9ja1JldHVyblZhbHVlKHN0cmlwZUV2ZW50KTtcblxuICAgICAgY29uc3QgcmVhZGluZ0lkID0gJ3JlYWRpbmctbm8tdGFibGUnO1xuICAgICAgbGFtYmRhTW9jay5vbihJbnZva2VDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIFN0YXR1c0NvZGU6IDIwMCxcbiAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgICAgUGF5bG9hZDogbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKFxuICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgcmVhZGluZ0lkIH0pLFxuICAgICAgICAgIH0pLFxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICAgICkgYXMgYW55LFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KCk7XG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LnJlYWRpbmdJZCkudG9CZShyZWFkaW5nSWQpO1xuXG4gICAgICAvLyBWZXJpZnkgbm8gRHluYW1vREIgb3BlcmF0aW9ucyB3ZXJlIGF0dGVtcHRlZFxuICAgICAgZXhwZWN0KGR5bmFtb01vY2spLm5vdC50b0hhdmVSZWNlaXZlZENvbW1hbmQoR2V0Q29tbWFuZCk7XG4gICAgICBleHBlY3QoZHluYW1vTW9jaykubm90LnRvSGF2ZVJlY2VpdmVkQ29tbWFuZChQdXRDb21tYW5kKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0Vycm9yIGhhbmRsaW5nJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgaGFuZGxlIExhbWJkYSBpbnZvY2F0aW9uIGZhaWx1cmUnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBzdHJpcGVFdmVudCA9IGNyZWF0ZVN0cmlwZUV2ZW50KCk7XG4gICAgICBtb2NrQ29uc3RydWN0RXZlbnQubW9ja1JldHVyblZhbHVlKHN0cmlwZUV2ZW50KTtcbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVzb2x2ZXMoeyBJdGVtOiB1bmRlZmluZWQgfSk7XG5cbiAgICAgIC8vIE1vY2sgTGFtYmRhIGludm9jYXRpb24gZmFpbHVyZVxuICAgICAgbGFtYmRhTW9jay5vbihJbnZva2VDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIFN0YXR1c0NvZGU6IDUwMCxcbiAgICAgIH0pO1xuICAgICAgZHluYW1vTW9jay5vbihQdXRDb21tYW5kKS5yZXNvbHZlcyh7fSk7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KCk7XG4gICAgICBjb25zdCByZXN1bHRQcm9taXNlID0gaGFuZGxlcihldmVudCk7XG5cbiAgICAgIC8vIEFkdmFuY2UgdGltZXJzIHRvIGhhbmRsZSBhbGwgcmV0cmllc1xuICAgICAgYXdhaXQgamVzdC5ydW5BbGxUaW1lcnNBc3luYygpO1xuXG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IHJlc3VsdFByb21pc2U7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApOyAvLyBTdGlsbCByZXR1cm4gMjAwIHRvIFN0cmlwZVxuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkpLnRvRXF1YWwoe1xuICAgICAgICByZWNlaXZlZDogdHJ1ZSxcbiAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICB9KTtcblxuICAgICAgLy8gVmVyaWZ5IGZhaWx1cmUgd2FzIHJlY29yZGVkXG4gICAgICBleHBlY3QoZHluYW1vTW9jaykudG9IYXZlUmVjZWl2ZWRDb21tYW5kV2l0aChQdXRDb21tYW5kLCB7XG4gICAgICAgIFRhYmxlTmFtZTogJ3Rlc3Qtd2ViaG9vay1wcm9jZXNzaW5nLXRhYmxlJyxcbiAgICAgICAgSXRlbTogZXhwZWN0Lm9iamVjdENvbnRhaW5pbmcoe1xuICAgICAgICAgIHN0YXR1czogJ2ZhaWxlZCcsXG4gICAgICAgICAgZXJyb3I6IGV4cGVjdC5hbnkoU3RyaW5nKSxcbiAgICAgICAgfSksXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIExhbWJkYSBmdW5jdGlvbiBlcnJvcicsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHN0cmlwZUV2ZW50ID0gY3JlYXRlU3RyaXBlRXZlbnQoKTtcbiAgICAgIG1vY2tDb25zdHJ1Y3RFdmVudC5tb2NrUmV0dXJuVmFsdWUoc3RyaXBlRXZlbnQpO1xuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7IEl0ZW06IHVuZGVmaW5lZCB9KTtcblxuICAgICAgLy8gTW9jayBMYW1iZGEgZnVuY3Rpb24gZXJyb3JcbiAgICAgIGxhbWJkYU1vY2sub24oSW52b2tlQ29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBTdGF0dXNDb2RlOiAyMDAsXG4gICAgICAgIEZ1bmN0aW9uRXJyb3I6ICdVbmhhbmRsZWQnLFxuICAgICAgICBQYXlsb2FkOiBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoXG4gICAgICAgICAgSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgZXJyb3JNZXNzYWdlOiAnRnVuY3Rpb24gZXJyb3InLFxuICAgICAgICAgIH0pLFxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICAgICkgYXMgYW55LFxuICAgICAgfSk7XG4gICAgICBkeW5hbW9Nb2NrLm9uKFB1dENvbW1hbmQpLnJlc29sdmVzKHt9KTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoKTtcbiAgICAgIGNvbnN0IHJlc3VsdFByb21pc2UgPSBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgLy8gQWR2YW5jZSB0aW1lcnMgdG8gaGFuZGxlIGFsbCByZXRyaWVzXG4gICAgICBhd2FpdCBqZXN0LnJ1bkFsbFRpbWVyc0FzeW5jKCk7XG5cbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgcmVzdWx0UHJvbWlzZTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keSkudG9FcXVhbCh7XG4gICAgICAgIHJlY2VpdmVkOiB0cnVlLFxuICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgcmVhZGluZyBnZW5lcmF0aW9uIGZhaWx1cmUnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBzdHJpcGVFdmVudCA9IGNyZWF0ZVN0cmlwZUV2ZW50KCk7XG4gICAgICBtb2NrQ29uc3RydWN0RXZlbnQubW9ja1JldHVyblZhbHVlKHN0cmlwZUV2ZW50KTtcbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVzb2x2ZXMoeyBJdGVtOiB1bmRlZmluZWQgfSk7XG5cbiAgICAgIC8vIE1vY2sgcmVhZGluZyBnZW5lcmF0aW9uIGZhaWx1cmVcbiAgICAgIGxhbWJkYU1vY2sub24oSW52b2tlQ29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBTdGF0dXNDb2RlOiAyMDAsXG4gICAgICAgIFBheWxvYWQ6IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZShcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgICAgICBib2R5OiAnVXNlciBwcm9maWxlIG5vdCBmb3VuZCcsXG4gICAgICAgICAgfSksXG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgICAgKSBhcyBhbnksXG4gICAgICB9KTtcbiAgICAgIGR5bmFtb01vY2sub24oUHV0Q29tbWFuZCkucmVzb2x2ZXMoe30pO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCgpO1xuICAgICAgY29uc3QgcmVzdWx0UHJvbWlzZSA9IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICAvLyBBZHZhbmNlIHRpbWVycyB0byBoYW5kbGUgYWxsIHJldHJpZXNcbiAgICAgIGF3YWl0IGplc3QucnVuQWxsVGltZXJzQXN5bmMoKTtcblxuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCByZXN1bHRQcm9taXNlO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5KS50b0VxdWFsKHtcbiAgICAgICAgcmVjZWl2ZWQ6IHRydWUsXG4gICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBMYW1iZGEgY2xpZW50IGVycm9ycycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHN0cmlwZUV2ZW50ID0gY3JlYXRlU3RyaXBlRXZlbnQoKTtcbiAgICAgIG1vY2tDb25zdHJ1Y3RFdmVudC5tb2NrUmV0dXJuVmFsdWUoc3RyaXBlRXZlbnQpO1xuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7IEl0ZW06IHVuZGVmaW5lZCB9KTtcblxuICAgICAgLy8gTW9jayBMYW1iZGEgY2xpZW50IGVycm9yXG4gICAgICBsYW1iZGFNb2NrLm9uKEludm9rZUNvbW1hbmQpLnJlamVjdHMobmV3IEVycm9yKCdMYW1iZGEgc2VydmljZSBlcnJvcicpKTtcbiAgICAgIGR5bmFtb01vY2sub24oUHV0Q29tbWFuZCkucmVzb2x2ZXMoe30pO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCgpO1xuICAgICAgY29uc3QgcmVzdWx0UHJvbWlzZSA9IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICAvLyBBZHZhbmNlIHRpbWVycyB0byBoYW5kbGUgYWxsIHJldHJpZXNcbiAgICAgIGF3YWl0IGplc3QucnVuQWxsVGltZXJzQXN5bmMoKTtcblxuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCByZXN1bHRQcm9taXNlO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5KS50b0VxdWFsKHtcbiAgICAgICAgcmVjZWl2ZWQ6IHRydWUsXG4gICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBtaXNzaW5nIGdlbmVyYXRlIHJlYWRpbmcgZnVuY3Rpb24gbmFtZScsIGFzeW5jICgpID0+IHtcbiAgICAgIGRlbGV0ZSBwcm9jZXNzLmVudi5HRU5FUkFURV9SRUFESU5HX0ZVTkNUSU9OX05BTUU7XG5cbiAgICAgIGNvbnN0IHN0cmlwZUV2ZW50ID0gY3JlYXRlU3RyaXBlRXZlbnQoKTtcbiAgICAgIG1vY2tDb25zdHJ1Y3RFdmVudC5tb2NrUmV0dXJuVmFsdWUoc3RyaXBlRXZlbnQpO1xuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7IEl0ZW06IHVuZGVmaW5lZCB9KTtcbiAgICAgIGR5bmFtb01vY2sub24oUHV0Q29tbWFuZCkucmVzb2x2ZXMoe30pO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCgpO1xuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keSkudG9FcXVhbCh7XG4gICAgICAgIHJlY2VpdmVkOiB0cnVlLFxuICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgU1NNIHBhcmFtZXRlciByZXRyaWV2YWwgZmFpbHVyZSBmb3IgQVBJIGtleScsIGFzeW5jICgpID0+IHtcbiAgICAgIHNzbU1vY2tcbiAgICAgICAgLm9uKEdldFBhcmFtZXRlckNvbW1hbmQsIHtcbiAgICAgICAgICBOYW1lOiAnL2F1cmEyOC90ZXN0L3N0cmlwZS9hcGkta2V5JyxcbiAgICAgICAgICBXaXRoRGVjcnlwdGlvbjogdHJ1ZSxcbiAgICAgICAgfSlcbiAgICAgICAgLnJlamVjdHMobmV3IEVycm9yKCdQYXJhbWV0ZXIgbm90IGZvdW5kJykpO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCgpO1xuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDUwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keSkudG9FcXVhbCh7IGVycm9yOiAnSW50ZXJuYWwgc2VydmVyIGVycm9yJyB9KTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIFNTTSBwYXJhbWV0ZXIgcmV0cmlldmFsIGZhaWx1cmUgZm9yIHdlYmhvb2sgc2VjcmV0JywgYXN5bmMgKCkgPT4ge1xuICAgICAgc3NtTW9ja1xuICAgICAgICAub24oR2V0UGFyYW1ldGVyQ29tbWFuZCwge1xuICAgICAgICAgIE5hbWU6ICcvYXVyYTI4L3Rlc3Qvc3RyaXBlL3dlYmhvb2stc2VjcmV0JyxcbiAgICAgICAgICBXaXRoRGVjcnlwdGlvbjogdHJ1ZSxcbiAgICAgICAgfSlcbiAgICAgICAgLnJlamVjdHMobmV3IEVycm9yKCdQYXJhbWV0ZXIgbm90IGZvdW5kJykpO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCgpO1xuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDUwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keSkudG9FcXVhbCh7IGVycm9yOiAnSW50ZXJuYWwgc2VydmVyIGVycm9yJyB9KTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIGVtcHR5IFNTTSBwYXJhbWV0ZXIgdmFsdWVzJywgYXN5bmMgKCkgPT4ge1xuICAgICAgc3NtTW9ja1xuICAgICAgICAub24oR2V0UGFyYW1ldGVyQ29tbWFuZCwge1xuICAgICAgICAgIE5hbWU6ICcvYXVyYTI4L3Rlc3Qvc3RyaXBlL3dlYmhvb2stc2VjcmV0JyxcbiAgICAgICAgICBXaXRoRGVjcnlwdGlvbjogdHJ1ZSxcbiAgICAgICAgfSlcbiAgICAgICAgLnJlc29sdmVzKHtcbiAgICAgICAgICBQYXJhbWV0ZXI6IHtcbiAgICAgICAgICAgIFZhbHVlOiAnJyxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoKTtcbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSg1MDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkpLnRvRXF1YWwoeyBlcnJvcjogJ0ludGVybmFsIHNlcnZlciBlcnJvcicgfSk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdVbmhhbmRsZWQgZXZlbnQgdHlwZXMnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBncmFjZWZ1bGx5IGhhbmRsZSB1bmhhbmRsZWQgZXZlbnQgdHlwZXMnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBzdHJpcGVFdmVudCA9IGNyZWF0ZVN0cmlwZUV2ZW50KCdwYXltZW50X2ludGVudC5zdWNjZWVkZWQnKTtcbiAgICAgIG1vY2tDb25zdHJ1Y3RFdmVudC5tb2NrUmV0dXJuVmFsdWUoc3RyaXBlRXZlbnQpO1xuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7IEl0ZW06IHVuZGVmaW5lZCB9KTtcbiAgICAgIGR5bmFtb01vY2sub24oUHV0Q29tbWFuZCkucmVzb2x2ZXMoe30pO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCh7XG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBpZDogbW9ja0V2ZW50SWQsXG4gICAgICAgICAgdHlwZTogJ3BheW1lbnRfaW50ZW50LnN1Y2NlZWRlZCcsXG4gICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgb2JqZWN0OiB7XG4gICAgICAgICAgICAgIGlkOiAncGlfdGVzdF8xMjMnLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9KSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5KS50b0VxdWFsKHtcbiAgICAgICAgcmVjZWl2ZWQ6IHRydWUsXG4gICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgfSk7XG5cbiAgICAgIC8vIFZlcmlmeSBldmVudCB3YXMgcmVjb3JkZWQgYXMgZmFpbGVkXG4gICAgICBleHBlY3QoZHluYW1vTW9jaykudG9IYXZlUmVjZWl2ZWRDb21tYW5kV2l0aChQdXRDb21tYW5kLCB7XG4gICAgICAgIFRhYmxlTmFtZTogJ3Rlc3Qtd2ViaG9vay1wcm9jZXNzaW5nLXRhYmxlJyxcbiAgICAgICAgSXRlbTogZXhwZWN0Lm9iamVjdENvbnRhaW5pbmcoe1xuICAgICAgICAgIHN0YXR1czogJ2ZhaWxlZCcsXG4gICAgICAgICAgZXJyb3I6IGV4cGVjdC5zdHJpbmdDb250YWluaW5nKCdVbmhhbmRsZWQgZXZlbnQgdHlwZScpLFxuICAgICAgICB9KSxcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnQmFzZTY0IGVuY29kaW5nIGhhbmRsaW5nJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgaGFuZGxlIGJhc2U2NCBlbmNvZGVkIGJvZHknLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBzdHJpcGVFdmVudCA9IGNyZWF0ZVN0cmlwZUV2ZW50KCk7XG4gICAgICBtb2NrQ29uc3RydWN0RXZlbnQubW9ja1JldHVyblZhbHVlKHN0cmlwZUV2ZW50KTtcbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVzb2x2ZXMoeyBJdGVtOiB1bmRlZmluZWQgfSk7XG5cbiAgICAgIGNvbnN0IHJlYWRpbmdJZCA9ICdyZWFkaW5nLWJhc2U2NCc7XG4gICAgICBsYW1iZGFNb2NrLm9uKEludm9rZUNvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgU3RhdHVzQ29kZTogMjAwLFxuICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgICBQYXlsb2FkOiBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoXG4gICAgICAgICAgSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgc3RhdHVzQ29kZTogMjAwLFxuICAgICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyByZWFkaW5nSWQgfSksXG4gICAgICAgICAgfSksXG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgICAgKSBhcyBhbnksXG4gICAgICB9KTtcbiAgICAgIGR5bmFtb01vY2sub24oUHV0Q29tbWFuZCkucmVzb2x2ZXMoe30pO1xuXG4gICAgICBjb25zdCByYXdCb2R5ID0gSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICBpZDogbW9ja0V2ZW50SWQsXG4gICAgICAgIHR5cGU6ICdjaGVja291dC5zZXNzaW9uLmNvbXBsZXRlZCcsXG4gICAgICAgIGRhdGE6IHtcbiAgICAgICAgICBvYmplY3Q6IHtcbiAgICAgICAgICAgIGlkOiBtb2NrU2Vzc2lvbklkLFxuICAgICAgICAgICAgY2xpZW50X3JlZmVyZW5jZV9pZDogbW9ja1VzZXJJZCxcbiAgICAgICAgICAgIHBheW1lbnRfc3RhdHVzOiAncGFpZCcsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCh7XG4gICAgICAgIGJvZHk6IEJ1ZmZlci5mcm9tKHJhd0JvZHkpLnRvU3RyaW5nKCdiYXNlNjQnKSxcbiAgICAgICAgaXNCYXNlNjRFbmNvZGVkOiB0cnVlLFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkucmVhZGluZ0lkKS50b0JlKHJlYWRpbmdJZCk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBBUEkgR2F0ZXdheSBjdXN0b20gdGVtcGxhdGUgZm9ybWF0JywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3Qgc3RyaXBlRXZlbnQgPSBjcmVhdGVTdHJpcGVFdmVudCgpO1xuICAgICAgbW9ja0NvbnN0cnVjdEV2ZW50Lm1vY2tSZXR1cm5WYWx1ZShzdHJpcGVFdmVudCk7XG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHsgSXRlbTogdW5kZWZpbmVkIH0pO1xuXG4gICAgICBjb25zdCByZWFkaW5nSWQgPSAncmVhZGluZy10ZW1wbGF0ZSc7XG4gICAgICBsYW1iZGFNb2NrLm9uKEludm9rZUNvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgU3RhdHVzQ29kZTogMjAwLFxuICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgICBQYXlsb2FkOiBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoXG4gICAgICAgICAgSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgc3RhdHVzQ29kZTogMjAwLFxuICAgICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyByZWFkaW5nSWQgfSksXG4gICAgICAgICAgfSksXG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgICAgKSBhcyBhbnksXG4gICAgICB9KTtcbiAgICAgIGR5bmFtb01vY2sub24oUHV0Q29tbWFuZCkucmVzb2x2ZXMoe30pO1xuXG4gICAgICBjb25zdCByYXdCb2R5ID0gSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICBpZDogbW9ja0V2ZW50SWQsXG4gICAgICAgIHR5cGU6ICdjaGVja291dC5zZXNzaW9uLmNvbXBsZXRlZCcsXG4gICAgICAgIGRhdGE6IHtcbiAgICAgICAgICBvYmplY3Q6IHtcbiAgICAgICAgICAgIGlkOiBtb2NrU2Vzc2lvbklkLFxuICAgICAgICAgICAgY2xpZW50X3JlZmVyZW5jZV9pZDogbW9ja1VzZXJJZCxcbiAgICAgICAgICAgIHBheW1lbnRfc3RhdHVzOiAncGFpZCcsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBBUEkgR2F0ZXdheSB0ZW1wbGF0ZSBmb3JtYXRcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KHtcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIGJvZHk6IEJ1ZmZlci5mcm9tKHJhd0JvZHkpLnRvU3RyaW5nKCdiYXNlNjQnKSxcbiAgICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgICAnc3RyaXBlLXNpZ25hdHVyZSc6ICd0ZXN0LXNpZ25hdHVyZScsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSksXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5yZWFkaW5nSWQpLnRvQmUocmVhZGluZ0lkKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ01ldGFkYXRhIGhhbmRsaW5nJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgaW5jbHVkZSBhbGwgc2Vzc2lvbiBtZXRhZGF0YSBpbiBMYW1iZGEgaW52b2NhdGlvbicsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGN1c3RvbU1ldGFkYXRhID0ge1xuICAgICAgICBjYW1wYWlnbjogJ3N1bW1lcjIwMjQnLFxuICAgICAgICByZWZlcnJlcjogJ25ld3NsZXR0ZXInLFxuICAgICAgICBwcm9tb0NvZGU6ICdTQVZFMjAnLFxuICAgICAgfTtcblxuICAgICAgY29uc3Qgc3RyaXBlRXZlbnQgPSBjcmVhdGVTdHJpcGVFdmVudCgnY2hlY2tvdXQuc2Vzc2lvbi5jb21wbGV0ZWQnLCB7XG4gICAgICAgIG1ldGFkYXRhOiB7XG4gICAgICAgICAgdXNlcklkOiBtb2NrVXNlcklkLFxuICAgICAgICAgIC4uLmN1c3RvbU1ldGFkYXRhLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgICBtb2NrQ29uc3RydWN0RXZlbnQubW9ja1JldHVyblZhbHVlKHN0cmlwZUV2ZW50KTtcbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVzb2x2ZXMoeyBJdGVtOiB1bmRlZmluZWQgfSk7XG5cbiAgICAgIGNvbnN0IHJlYWRpbmdJZCA9ICdyZWFkaW5nLW1ldGFkYXRhJztcbiAgICAgIGxhbWJkYU1vY2sub24oSW52b2tlQ29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBTdGF0dXNDb2RlOiAyMDAsXG4gICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICAgIFBheWxvYWQ6IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZShcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBzdGF0dXNDb2RlOiAyMDAsXG4gICAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IHJlYWRpbmdJZCB9KSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgICApIGFzIGFueSxcbiAgICAgIH0pO1xuICAgICAgZHluYW1vTW9jay5vbihQdXRDb21tYW5kKS5yZXNvbHZlcyh7fSk7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KCk7XG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcblxuICAgICAgLy8gVmVyaWZ5IG1ldGFkYXRhIHdhcyBwYXNzZWQgdG8gTGFtYmRhXG4gICAgICBjb25zdCBpbnZva2VDYWxsID0gbGFtYmRhTW9jay5jb21tYW5kQ2FsbHMoSW52b2tlQ29tbWFuZClbMF07XG4gICAgICBjb25zdCBwYXlsb2FkID0gSlNPTi5wYXJzZShpbnZva2VDYWxsLmFyZ3NbMF0uaW5wdXQuUGF5bG9hZCBhcyBzdHJpbmcpO1xuICAgICAgZXhwZWN0KHBheWxvYWQubWV0YWRhdGEpLnRvTWF0Y2hPYmplY3Qoe1xuICAgICAgICBzZXNzaW9uSWQ6IG1vY2tTZXNzaW9uSWQsXG4gICAgICAgIHVzZXJJZDogbW9ja1VzZXJJZCxcbiAgICAgICAgLi4uY3VzdG9tTWV0YWRhdGEsXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIG51bGwgdmFsdWVzIGluIHNlc3Npb24gZGF0YScsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHN0cmlwZUV2ZW50ID0gY3JlYXRlU3RyaXBlRXZlbnQoJ2NoZWNrb3V0LnNlc3Npb24uY29tcGxldGVkJywge1xuICAgICAgICBjdXN0b21lcl9lbWFpbDogbnVsbCxcbiAgICAgICAgYW1vdW50X3RvdGFsOiBudWxsLFxuICAgICAgICBjdXJyZW5jeTogbnVsbCxcbiAgICAgICAgcGF5bWVudF9pbnRlbnQ6IG51bGwsXG4gICAgICB9KTtcbiAgICAgIG1vY2tDb25zdHJ1Y3RFdmVudC5tb2NrUmV0dXJuVmFsdWUoc3RyaXBlRXZlbnQpO1xuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7IEl0ZW06IHVuZGVmaW5lZCB9KTtcblxuICAgICAgY29uc3QgcmVhZGluZ0lkID0gJ3JlYWRpbmctbnVsbC12YWx1ZXMnO1xuICAgICAgbGFtYmRhTW9jay5vbihJbnZva2VDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIFN0YXR1c0NvZGU6IDIwMCxcbiAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgICAgUGF5bG9hZDogbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKFxuICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgcmVhZGluZ0lkIH0pLFxuICAgICAgICAgIH0pLFxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICAgICkgYXMgYW55LFxuICAgICAgfSk7XG4gICAgICBkeW5hbW9Nb2NrLm9uKFB1dENvbW1hbmQpLnJlc29sdmVzKHt9KTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoKTtcbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuXG4gICAgICAvLyBWZXJpZnkgbnVsbCB2YWx1ZXMgd2VyZSBmaWx0ZXJlZCBvdXRcbiAgICAgIGNvbnN0IGludm9rZUNhbGwgPSBsYW1iZGFNb2NrLmNvbW1hbmRDYWxscyhJbnZva2VDb21tYW5kKVswXTtcbiAgICAgIGNvbnN0IHBheWxvYWQgPSBKU09OLnBhcnNlKGludm9rZUNhbGwuYXJnc1swXS5pbnB1dC5QYXlsb2FkIGFzIHN0cmluZyk7XG4gICAgICBleHBlY3QocGF5bG9hZC5tZXRhZGF0YSkubm90LnRvSGF2ZVByb3BlcnR5KCdjdXN0b21lckVtYWlsJyk7XG4gICAgICBleHBlY3QocGF5bG9hZC5tZXRhZGF0YSkubm90LnRvSGF2ZVByb3BlcnR5KCdhbW91bnRUb3RhbCcpO1xuICAgICAgZXhwZWN0KHBheWxvYWQubWV0YWRhdGEpLm5vdC50b0hhdmVQcm9wZXJ0eSgnY3VycmVuY3knKTtcbiAgICAgIGV4cGVjdChwYXlsb2FkLm1ldGFkYXRhKS5ub3QudG9IYXZlUHJvcGVydHkoJ3BheW1lbnRJbnRlbnRJZCcpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgcGF5bWVudF9pbnRlbnQgYXMgb2JqZWN0JywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3Qgc3RyaXBlRXZlbnQgPSBjcmVhdGVTdHJpcGVFdmVudCgnY2hlY2tvdXQuc2Vzc2lvbi5jb21wbGV0ZWQnLCB7XG4gICAgICAgIHBheW1lbnRfaW50ZW50OiB7IGlkOiAncGlfdGVzdF8xMjMnIH0gYXMgdW5rbm93biBhcyBzdHJpbmcsXG4gICAgICB9KTtcbiAgICAgIG1vY2tDb25zdHJ1Y3RFdmVudC5tb2NrUmV0dXJuVmFsdWUoc3RyaXBlRXZlbnQpO1xuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7IEl0ZW06IHVuZGVmaW5lZCB9KTtcblxuICAgICAgY29uc3QgcmVhZGluZ0lkID0gJ3JlYWRpbmctcGktb2JqZWN0JztcbiAgICAgIGxhbWJkYU1vY2sub24oSW52b2tlQ29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBTdGF0dXNDb2RlOiAyMDAsXG4gICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICAgIFBheWxvYWQ6IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZShcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBzdGF0dXNDb2RlOiAyMDAsXG4gICAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IHJlYWRpbmdJZCB9KSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgICApIGFzIGFueSxcbiAgICAgIH0pO1xuICAgICAgZHluYW1vTW9jay5vbihQdXRDb21tYW5kKS5yZXNvbHZlcyh7fSk7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KCk7XG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcblxuICAgICAgLy8gVmVyaWZ5IHBheW1lbnRfaW50ZW50IG9iamVjdCB3YXMgbm90IGluY2x1ZGVkIGluIG1ldGFkYXRhXG4gICAgICBjb25zdCBpbnZva2VDYWxsID0gbGFtYmRhTW9jay5jb21tYW5kQ2FsbHMoSW52b2tlQ29tbWFuZClbMF07XG4gICAgICBjb25zdCBwYXlsb2FkID0gSlNPTi5wYXJzZShpbnZva2VDYWxsLmFyZ3NbMF0uaW5wdXQuUGF5bG9hZCBhcyBzdHJpbmcpO1xuICAgICAgZXhwZWN0KHBheWxvYWQubWV0YWRhdGEpLm5vdC50b0hhdmVQcm9wZXJ0eSgncGF5bWVudEludGVudElkJyk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdSZWNvcmRpbmcgcHJvY2Vzc2VkIGV2ZW50cycsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIHJlY29yZCBzdWNjZXNzZnVsIHByb2Nlc3NpbmcnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBzdHJpcGVFdmVudCA9IGNyZWF0ZVN0cmlwZUV2ZW50KCk7XG4gICAgICBtb2NrQ29uc3RydWN0RXZlbnQubW9ja1JldHVyblZhbHVlKHN0cmlwZUV2ZW50KTtcbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVzb2x2ZXMoeyBJdGVtOiB1bmRlZmluZWQgfSk7XG5cbiAgICAgIGNvbnN0IHJlYWRpbmdJZCA9ICdyZWFkaW5nLXJlY29yZCc7XG4gICAgICBsYW1iZGFNb2NrLm9uKEludm9rZUNvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgU3RhdHVzQ29kZTogMjAwLFxuICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgICBQYXlsb2FkOiBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoXG4gICAgICAgICAgSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgc3RhdHVzQ29kZTogMjAwLFxuICAgICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyByZWFkaW5nSWQgfSksXG4gICAgICAgICAgfSksXG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgICAgKSBhcyBhbnksXG4gICAgICB9KTtcbiAgICAgIGR5bmFtb01vY2sub24oUHV0Q29tbWFuZCkucmVzb2x2ZXMoe30pO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCgpO1xuICAgICAgYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChkeW5hbW9Nb2NrKS50b0hhdmVSZWNlaXZlZENvbW1hbmRXaXRoKFB1dENvbW1hbmQsIHtcbiAgICAgICAgVGFibGVOYW1lOiAndGVzdC13ZWJob29rLXByb2Nlc3NpbmctdGFibGUnLFxuICAgICAgICBJdGVtOiBleHBlY3Qub2JqZWN0Q29udGFpbmluZyh7XG4gICAgICAgICAgc2Vzc2lvbklkOiBtb2NrU2Vzc2lvbklkLFxuICAgICAgICAgIGV2ZW50SWQ6IG1vY2tFdmVudElkLFxuICAgICAgICAgIHN0YXR1czogJ3Byb2Nlc3NlZCcsXG4gICAgICAgICAgcmVhZGluZ0lkLFxuICAgICAgICAgIHByb2Nlc3NlZEF0OiBleHBlY3QuYW55KFN0cmluZyksXG4gICAgICAgIH0pLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHJlY29yZCBmYWlsZWQgcHJvY2Vzc2luZyB3aXRoIGVycm9yJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3Qgc3RyaXBlRXZlbnQgPSBjcmVhdGVTdHJpcGVFdmVudCgpO1xuICAgICAgbW9ja0NvbnN0cnVjdEV2ZW50Lm1vY2tSZXR1cm5WYWx1ZShzdHJpcGVFdmVudCk7XG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHsgSXRlbTogdW5kZWZpbmVkIH0pO1xuXG4gICAgICBjb25zdCBlcnJvck1lc3NhZ2UgPSAnTGFtYmRhIGludm9jYXRpb24gZmFpbGVkJztcbiAgICAgIGxhbWJkYU1vY2sub24oSW52b2tlQ29tbWFuZCkucmVqZWN0cyhuZXcgRXJyb3IoZXJyb3JNZXNzYWdlKSk7XG4gICAgICBkeW5hbW9Nb2NrLm9uKFB1dENvbW1hbmQpLnJlc29sdmVzKHt9KTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoKTtcbiAgICAgIGNvbnN0IHJlc3VsdFByb21pc2UgPSBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgLy8gQWR2YW5jZSB0aW1lcnMgdG8gaGFuZGxlIGFsbCByZXRyaWVzXG4gICAgICBhd2FpdCBqZXN0LnJ1bkFsbFRpbWVyc0FzeW5jKCk7XG5cbiAgICAgIGF3YWl0IHJlc3VsdFByb21pc2U7XG5cbiAgICAgIGV4cGVjdChkeW5hbW9Nb2NrKS50b0hhdmVSZWNlaXZlZENvbW1hbmRXaXRoKFB1dENvbW1hbmQsIHtcbiAgICAgICAgVGFibGVOYW1lOiAndGVzdC13ZWJob29rLXByb2Nlc3NpbmctdGFibGUnLFxuICAgICAgICBJdGVtOiBleHBlY3Qub2JqZWN0Q29udGFpbmluZyh7XG4gICAgICAgICAgc2Vzc2lvbklkOiBtb2NrU2Vzc2lvbklkLFxuICAgICAgICAgIGV2ZW50SWQ6IG1vY2tFdmVudElkLFxuICAgICAgICAgIHN0YXR1czogJ2ZhaWxlZCcsXG4gICAgICAgICAgZXJyb3I6IGVycm9yTWVzc2FnZSxcbiAgICAgICAgICBwcm9jZXNzZWRBdDogZXhwZWN0LmFueShTdHJpbmcpLFxuICAgICAgICB9KSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBjb250aW51ZSBwcm9jZXNzaW5nIGV2ZW4gaWYgcmVjb3JkaW5nIGZhaWxzJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3Qgc3RyaXBlRXZlbnQgPSBjcmVhdGVTdHJpcGVFdmVudCgpO1xuICAgICAgbW9ja0NvbnN0cnVjdEV2ZW50Lm1vY2tSZXR1cm5WYWx1ZShzdHJpcGVFdmVudCk7XG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHsgSXRlbTogdW5kZWZpbmVkIH0pO1xuXG4gICAgICBjb25zdCByZWFkaW5nSWQgPSAncmVhZGluZy1yZWNvcmQtZmFpbCc7XG4gICAgICBsYW1iZGFNb2NrLm9uKEludm9rZUNvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgU3RhdHVzQ29kZTogMjAwLFxuICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgICBQYXlsb2FkOiBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoXG4gICAgICAgICAgSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgc3RhdHVzQ29kZTogMjAwLFxuICAgICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyByZWFkaW5nSWQgfSksXG4gICAgICAgICAgfSksXG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgICAgKSBhcyBhbnksXG4gICAgICB9KTtcblxuICAgICAgLy8gTW9jayByZWNvcmRpbmcgZmFpbHVyZVxuICAgICAgZHluYW1vTW9jay5vbihQdXRDb21tYW5kKS5yZWplY3RzKG5ldyBFcnJvcignRHluYW1vREIgd3JpdGUgZXJyb3InKSk7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KCk7XG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICAvLyBTaG91bGQgc3RpbGwgcmV0dXJuIHN1Y2Nlc3NcbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkucmVhZGluZ0lkKS50b0JlKHJlYWRpbmdJZCk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdVbmV4cGVjdGVkIGVycm9ycycsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIHJldHVybiA0MDAgZm9yIHNpZ25hdHVyZSBjb25zdHJ1Y3Rpb24gZXJyb3JzJywgYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gTW9jayBhbiBlcnJvciBkdXJpbmcgZXZlbnQgY29uc3RydWN0aW9uIChub3Qgc2lnbmF0dXJlIHZlcmlmaWNhdGlvbiBzcGVjaWZpYylcbiAgICAgIG1vY2tDb25zdHJ1Y3RFdmVudC5tb2NrSW1wbGVtZW50YXRpb24oKCkgPT4ge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgZXJyb3InKTtcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCgpO1xuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgLy8gVGhlIGVycm9yIGdvZXMgdGhyb3VnaCB2ZXJpZnlXZWJob29rU2lnbmF0dXJlIHdoaWNoIHRocm93cyAnSW52YWxpZCB3ZWJob29rIHNpZ25hdHVyZSdcbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSg0MDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkpLnRvRXF1YWwoeyBlcnJvcjogJ0ludmFsaWQgc2lnbmF0dXJlJyB9KTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgcmV0dXJuIDIwMCBldmVuIHdoZW4gaWRlbXBvdGVuY3kgY2hlY2sgZmFpbHMgYnV0IHByb2Nlc3NpbmcgY29udGludWVzJywgYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gTW9jayBzdWNjZXNzZnVsIHNpZ25hdHVyZSB2ZXJpZmljYXRpb25cbiAgICAgIGNvbnN0IHN0cmlwZUV2ZW50ID0gY3JlYXRlU3RyaXBlRXZlbnQoKTtcbiAgICAgIG1vY2tDb25zdHJ1Y3RFdmVudC5tb2NrUmV0dXJuVmFsdWUoc3RyaXBlRXZlbnQpO1xuXG4gICAgICAvLyBNb2NrIGlkZW1wb3RlbmN5IGNoZWNrIHRvIHRocm93IGVycm9yIChidXQgcHJvY2Vzc2luZyBjb250aW51ZXMpXG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlamVjdHMobmV3IEVycm9yKCdVbmV4cGVjdGVkIGRhdGFiYXNlIGVycm9yJykpO1xuXG4gICAgICAvLyBNb2NrIHN1Y2Nlc3NmdWwgTGFtYmRhIGludm9jYXRpb25cbiAgICAgIGNvbnN0IHJlYWRpbmdJZCA9ICdyZWFkaW5nLWFmdGVyLWRiLWVycm9yJztcbiAgICAgIGxhbWJkYU1vY2sub24oSW52b2tlQ29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBTdGF0dXNDb2RlOiAyMDAsXG4gICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICAgIFBheWxvYWQ6IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZShcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBzdGF0dXNDb2RlOiAyMDAsXG4gICAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IHJlYWRpbmdJZCB9KSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgICApIGFzIGFueSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBNb2NrIHN1Y2Nlc3NmdWwgcmVjb3JkaW5nXG4gICAgICBkeW5hbW9Nb2NrLm9uKFB1dENvbW1hbmQpLnJlc29sdmVzKHt9KTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoKTtcbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIC8vIFNob3VsZCByZXR1cm4gMjAwIGRlc3BpdGUgaWRlbXBvdGVuY3kgY2hlY2sgZXJyb3JcbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkucmVhZGluZ0lkKS50b0JlKHJlYWRpbmdJZCk7XG4gICAgfSk7XG4gIH0pO1xufSk7XG4iXX0=