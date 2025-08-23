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
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RyaXBlLXdlYmhvb2staGFuZGxlci50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsic3RyaXBlLXdlYmhvb2staGFuZGxlci50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQ0EseUZBQXVFO0FBQ3ZFLDZEQUFpRDtBQUNqRCxvREFBcUU7QUFDckUsMERBQXFFO0FBQ3JFLHdEQUF1RjtBQUV2RiwrQkFBbUM7QUFFbkMsbUJBQW1CO0FBQ25CLE1BQU0sT0FBTyxHQUFHLElBQUEsZ0NBQVUsRUFBQyxzQkFBUyxDQUFDLENBQUM7QUFDdEMsTUFBTSxVQUFVLEdBQUcsSUFBQSxnQ0FBVSxFQUFDLDRCQUFZLENBQUMsQ0FBQztBQUM1QyxNQUFNLFVBQVUsR0FBRyxJQUFBLGdDQUFVLEVBQUMscUNBQXNCLENBQUMsQ0FBQztBQUV0RCw2QkFBNkI7QUFDN0IsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLENBQUMsRUFBRSxFQUFFLENBQUM7QUFDckMsTUFBTSxVQUFVLEdBQUc7SUFDakIsUUFBUSxFQUFFO1FBQ1IsY0FBYyxFQUFFLGtCQUFrQjtLQUNuQztDQUNGLENBQUM7QUFFRixxQkFBcUI7QUFDckIsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsR0FBRyxFQUFFO0lBQ3ZCLE9BQU8sSUFBSSxDQUFDLEVBQUUsRUFBRSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDO0FBQ3hELENBQUMsQ0FBQyxDQUFDO0FBRUgsUUFBUSxDQUFDLCtCQUErQixFQUFFLEdBQUcsRUFBRTtJQUM3QyxNQUFNLGdCQUFnQixHQUFHLHNCQUFzQixDQUFDO0lBQ2hELE1BQU0saUJBQWlCLEdBQUcsdUJBQXVCLENBQUM7SUFDbEQsTUFBTSxVQUFVLEdBQUcsZUFBZSxDQUFDO0lBQ25DLE1BQU0sYUFBYSxHQUFHLHFCQUFxQixDQUFDO0lBQzVDLE1BQU0sV0FBVyxHQUFHLGNBQWMsQ0FBQztJQUVuQyxVQUFVLENBQUMs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QUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQVBJR2F0ZXdheVByb3h5RXZlbnQsIEFQSUdhdGV3YXlQcm94eVJlc3VsdCB9IGZyb20gJ2F3cy1sYW1iZGEnO1xuaW1wb3J0IHsgaGFuZGxlciB9IGZyb20gJy4uLy4uL2xhbWJkYS9wYXltZW50cy9zdHJpcGUtd2ViaG9vay1oYW5kbGVyJztcbmltcG9ydCB7IG1vY2tDbGllbnQgfSBmcm9tICdhd3Mtc2RrLWNsaWVudC1tb2NrJztcbmltcG9ydCB7IFNTTUNsaWVudCwgR2V0UGFyYW1ldGVyQ29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zc20nO1xuaW1wb3J0IHsgTGFtYmRhQ2xpZW50LCBJbnZva2VDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LWxhbWJkYSc7XG5pbXBvcnQgeyBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LCBQdXRDb21tYW5kLCBHZXRDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvbGliLWR5bmFtb2RiJztcbmltcG9ydCBTdHJpcGUgZnJvbSAnc3RyaXBlJztcbmltcG9ydCB7IFRleHRFbmNvZGVyIH0gZnJvbSAndXRpbCc7XG5cbi8vIE1vY2sgQVdTIGNsaWVudHNcbmNvbnN0IHNzbU1vY2sgPSBtb2NrQ2xpZW50KFNTTUNsaWVudCk7XG5jb25zdCBsYW1iZGFNb2NrID0gbW9ja0NsaWVudChMYW1iZGFDbGllbnQpO1xuY29uc3QgZHluYW1vTW9jayA9IG1vY2tDbGllbnQoRHluYW1vREJEb2N1bWVudENsaWVudCk7XG5cbi8vIE1vY2sgU3RyaXBlIGNvbnN0cnVjdEV2ZW50XG5jb25zdCBtb2NrQ29uc3RydWN0RXZlbnQgPSBqZXN0LmZuKCk7XG5jb25zdCBtb2NrU3RyaXBlID0ge1xuICB3ZWJob29rczoge1xuICAgIGNvbnN0cnVjdEV2ZW50OiBtb2NrQ29uc3RydWN0RXZlbnQsXG4gIH0sXG59O1xuXG4vLyBNb2NrIFN0cmlwZSBtb2R1bGVcbmplc3QubW9jaygnc3RyaXBlJywgKCkgPT4ge1xuICByZXR1cm4gamVzdC5mbigpLm1vY2tJbXBsZW1lbnRhdGlvbigoKSA9PiBtb2NrU3RyaXBlKTtcbn0pO1xuXG5kZXNjcmliZSgnU3RyaXBlIFdlYmhvb2sgSGFuZGxlciBMYW1iZGEnLCAoKSA9PiB7XG4gIGNvbnN0IG1vY2tTdHJpcGVBcGlLZXkgPSAnc2tfdGVzdF9tb2NrX2tleV8xMjMnO1xuICBjb25zdCBtb2NrV2ViaG9va1NlY3JldCA9ICd3aHNlY190ZXN0X3NlY3JldF8xMjMnO1xuICBjb25zdCBtb2NrVXNlcklkID0gJ3Rlc3QtdXNlci0xMjMnO1xuICBjb25zdCBtb2NrU2Vzc2lvbklkID0gJ2NzX3Rlc3Rfc2Vzc2lvbl8xMjMnO1xuICBjb25zdCBtb2NrRXZlbnRJZCA9ICdldnRfdGVzdF8xMjMnO1xuXG4gIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgIGplc3QuY2xlYXJBbGxNb2NrcygpO1xuICAgIGplc3QudXNlRmFrZVRpbWVycygpO1xuICAgIHNzbU1vY2sucmVzZXQoKTtcbiAgICBsYW1iZGFNb2NrLnJlc2V0KCk7XG4gICAgZHluYW1vTW9jay5yZXNldCgpO1xuICAgIG1vY2tDb25zdHJ1Y3RFdmVudC5tb2NrUmVzZXQoKTtcblxuICAgIC8vIFNldHVwIGVudmlyb25tZW50IHZhcmlhYmxlc1xuICAgIHByb2Nlc3MuZW52LlNUUklQRV9BUElfS0VZX1BBUkFNRVRFUl9OQU1FID0gJy9hdXJhMjgvdGVzdC9zdHJpcGUvYXBpLWtleSc7XG4gICAgcHJvY2Vzcy5lbnYuU1RSSVBFX1dFQkhPT0tfU0VDUkVUX1BBUkFNRVRFUl9OQU1FID0gJy9hdXJhMjgvdGVzdC9zdHJpcGUvd2ViaG9vay1zZWNyZXQnO1xuICAgIHByb2Nlc3MuZW52LkdFTkVSQVRFX1JFQURJTkdfRlVOQ1RJT05fTkFNRSA9ICd0ZXN0LWdlbmVyYXRlLXJlYWRpbmctZnVuY3Rpb24nO1xuICAgIHByb2Nlc3MuZW52LldFQkhPT0tfUFJPQ0VTU0lOR19UQUJMRV9OQU1FID0gJ3Rlc3Qtd2ViaG9vay1wcm9jZXNzaW5nLXRhYmxlJztcblxuICAgIC8vIFNldHVwIGRlZmF1bHQgU1NNIHBhcmFtZXRlciByZXNwb25zZXNcbiAgICBzc21Nb2NrXG4gICAgICAub24oR2V0UGFyYW1ldGVyQ29tbWFuZCwge1xuICAgICAgICBOYW1lOiAnL2F1cmEyOC90ZXN0L3N0cmlwZS9hcGkta2V5JyxcbiAgICAgICAgV2l0aERlY3J5cHRpb246IHRydWUsXG4gICAgICB9KVxuICAgICAgLnJlc29sdmVzKHtcbiAgICAgICAgUGFyYW1ldGVyOiB7XG4gICAgICAgICAgVmFsdWU6IG1vY2tTdHJpcGVBcGlLZXksXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgIHNzbU1vY2tcbiAgICAgIC5vbihHZXRQYXJhbWV0ZXJDb21tYW5kLCB7XG4gICAgICAgIE5hbWU6ICcvYXVyYTI4L3Rlc3Qvc3RyaXBlL3dlYmhvb2stc2VjcmV0JyxcbiAgICAgICAgV2l0aERlY3J5cHRpb246IHRydWUsXG4gICAgICB9KVxuICAgICAgLnJlc29sdmVzKHtcbiAgICAgICAgUGFyYW1ldGVyOiB7XG4gICAgICAgICAgVmFsdWU6IG1vY2tXZWJob29rU2VjcmV0LFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gIH0pO1xuXG4gIGFmdGVyRWFjaCgoKSA9PiB7XG4gICAgamVzdC5jbGVhckFsbFRpbWVycygpO1xuICAgIGplc3QudXNlUmVhbFRpbWVycygpO1xuICB9KTtcblxuICBjb25zdCBjcmVhdGVNb2NrRXZlbnQgPSAob3ZlcnJpZGVzOiBQYXJ0aWFsPEFQSUdhdGV3YXlQcm94eUV2ZW50PiA9IHt9KTogQVBJR2F0ZXdheVByb3h5RXZlbnQgPT4ge1xuICAgIGNvbnN0IGRlZmF1bHRCb2R5ID0gSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgaWQ6IG1vY2tFdmVudElkLFxuICAgICAgdHlwZTogJ2NoZWNrb3V0LnNlc3Npb24uY29tcGxldGVkJyxcbiAgICAgIGRhdGE6IHtcbiAgICAgICAgb2JqZWN0OiB7XG4gICAgICAgICAgaWQ6IG1vY2tTZXNzaW9uSWQsXG4gICAgICAgICAgY2xpZW50X3JlZmVyZW5jZV9pZDogbW9ja1VzZXJJZCxcbiAgICAgICAgICBwYXltZW50X3N0YXR1czogJ3BhaWQnLFxuICAgICAgICAgIGN1c3RvbWVyX2VtYWlsOiAndGVzdEBleGFtcGxlLmNvbScsXG4gICAgICAgICAgYW1vdW50X3RvdGFsOiAyOTAwLFxuICAgICAgICAgIGN1cnJlbmN5OiAndXNkJyxcbiAgICAgICAgICBwYXltZW50X2ludGVudDogJ3BpX3Rlc3RfMTIzJyxcbiAgICAgICAgICBtZXRhZGF0YToge1xuICAgICAgICAgICAgdXNlcklkOiBtb2NrVXNlcklkLFxuICAgICAgICAgICAgc2Vzc2lvblR5cGU6ICdvbmUtdGltZScsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgaHR0cE1ldGhvZDogJ1BPU1QnLFxuICAgICAgcGF0aDogJy9hcGkvd2ViaG9va3Mvc3RyaXBlJyxcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgJ2NvbnRlbnQtdHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgJ3N0cmlwZS1zaWduYXR1cmUnOiAndGVzdC1zaWduYXR1cmUnLFxuICAgICAgfSxcbiAgICAgIGJvZHk6IG92ZXJyaWRlcy5ib2R5IHx8IGRlZmF1bHRCb2R5LFxuICAgICAgaXNCYXNlNjRFbmNvZGVkOiBmYWxzZSxcbiAgICAgIC4uLm92ZXJyaWRlcyxcbiAgICB9IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50O1xuICB9O1xuXG4gIGNvbnN0IGNyZWF0ZVN0cmlwZUV2ZW50ID0gKFxuICAgIHR5cGU6IHN0cmluZyA9ICdjaGVja291dC5zZXNzaW9uLmNvbXBsZXRlZCcsXG4gICAgb3ZlcnJpZGVzOiBQYXJ0aWFsPFN0cmlwZS5DaGVja291dC5TZXNzaW9uPiA9IHt9LFxuICApOiBTdHJpcGUuRXZlbnQgPT4ge1xuICAgIHJldHVybiB7XG4gICAgICBpZDogbW9ja0V2ZW50SWQsXG4gICAgICBvYmplY3Q6ICdldmVudCcsXG4gICAgICBhcGlfdmVyc2lvbjogJzIwMjUtMDctMzAuYmFzaWwnLFxuICAgICAgY3JlYXRlZDogTWF0aC5mbG9vcihEYXRlLm5vdygpIC8gMTAwMCksXG4gICAgICB0eXBlLFxuICAgICAgZGF0YToge1xuICAgICAgICBvYmplY3Q6IHtcbiAgICAgICAgICBpZDogbW9ja1Nlc3Npb25JZCxcbiAgICAgICAgICBvYmplY3Q6ICdjaGVja291dC5zZXNzaW9uJyxcbiAgICAgICAgICBjbGllbnRfcmVmZXJlbmNlX2lkOiBtb2NrVXNlcklkLFxuICAgICAgICAgIHBheW1lbnRfc3RhdHVzOiAncGFpZCcsXG4gICAgICAgICAgY3VzdG9tZXJfZW1haWw6ICd0ZXN0QGV4YW1wbGUuY29tJyxcbiAgICAgICAgICBhbW91bnRfdG90YWw6IDI5MDAsXG4gICAgICAgICAgY3VycmVuY3k6ICd1c2QnLFxuICAgICAgICAgIHBheW1lbnRfaW50ZW50OiAncGlfdGVzdF8xMjMnLFxuICAgICAgICAgIG1ldGFkYXRhOiB7XG4gICAgICAgICAgICB1c2VySWQ6IG1vY2tVc2VySWQsXG4gICAgICAgICAgICBzZXNzaW9uVHlwZTogJ29uZS10aW1lJyxcbiAgICAgICAgICB9LFxuICAgICAgICAgIC4uLm92ZXJyaWRlcyxcbiAgICAgICAgfSBhcyBTdHJpcGUuQ2hlY2tvdXQuU2Vzc2lvbixcbiAgICAgIH0sXG4gICAgICBsaXZlbW9kZTogZmFsc2UsXG4gICAgICBwZW5kaW5nX3dlYmhvb2tzOiAxLFxuICAgICAgcmVxdWVzdDoge1xuICAgICAgICBpZDogbnVsbCxcbiAgICAgICAgaWRlbXBvdGVuY3lfa2V5OiBudWxsLFxuICAgICAgfSxcbiAgICB9IGFzIFN0cmlwZS5FdmVudDtcbiAgfTtcblxuICBkZXNjcmliZSgnV2ViaG9vayBzaWduYXR1cmUgdmVyaWZpY2F0aW9uJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgc3VjY2Vzc2Z1bGx5IHZlcmlmeSBhIHZhbGlkIHdlYmhvb2sgc2lnbmF0dXJlJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3Qgc3RyaXBlRXZlbnQgPSBjcmVhdGVTdHJpcGVFdmVudCgpO1xuICAgICAgbW9ja0NvbnN0cnVjdEV2ZW50Lm1vY2tSZXR1cm5WYWx1ZShzdHJpcGVFdmVudCk7XG5cbiAgICAgIC8vIE1vY2sgaWRlbXBvdGVuY3kgY2hlY2sgLSBldmVudCBub3QgcHJvY2Vzc2VkXG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHsgSXRlbTogdW5kZWZpbmVkIH0pO1xuXG4gICAgICAvLyBNb2NrIHN1Y2Nlc3NmdWwgTGFtYmRhIGludm9jYXRpb25cbiAgICAgIGNvbnN0IHJlYWRpbmdJZCA9ICdyZWFkaW5nLTEyMyc7XG4gICAgICBsYW1iZGFNb2NrLm9uKEludm9rZUNvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgU3RhdHVzQ29kZTogMjAwLFxuICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgICBQYXlsb2FkOiBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoXG4gICAgICAgICAgSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgc3RhdHVzQ29kZTogMjAwLFxuICAgICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyByZWFkaW5nSWQgfSksXG4gICAgICAgICAgfSksXG4gICAgICAgICkgYXMgYW55LFxuICAgICAgfSk7XG5cbiAgICAgIC8vIE1vY2sgcmVjb3JkaW5nIHByb2Nlc3NlZCBldmVudFxuICAgICAgZHluYW1vTW9jay5vbihQdXRDb21tYW5kKS5yZXNvbHZlcyh7fSk7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KCk7XG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5KS50b0VxdWFsKHtcbiAgICAgICAgcmVjZWl2ZWQ6IHRydWUsXG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgIHJlYWRpbmdJZCxcbiAgICAgIH0pO1xuXG4gICAgICBleHBlY3QobW9ja0NvbnN0cnVjdEV2ZW50KS50b0hhdmVCZWVuQ2FsbGVkV2l0aChcbiAgICAgICAgZXhwZWN0LmFueShTdHJpbmcpLFxuICAgICAgICAndGVzdC1zaWduYXR1cmUnLFxuICAgICAgICBtb2NrV2ViaG9va1NlY3JldCxcbiAgICAgICk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHJlamVjdCByZXF1ZXN0IHdpdGggaW52YWxpZCBzaWduYXR1cmUnLCBhc3luYyAoKSA9PiB7XG4gICAgICBtb2NrQ29uc3RydWN0RXZlbnQubW9ja0ltcGxlbWVudGF0aW9uKCgpID0+IHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIHdlYmhvb2sgc2lnbmF0dXJlJyk7XG4gICAgICB9KTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoKTtcbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSg0MDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkpLnRvRXF1YWwoeyBlcnJvcjogJ0ludmFsaWQgc2lnbmF0dXJlJyB9KTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgcmVqZWN0IHJlcXVlc3Qgd2l0aCBtaXNzaW5nIHNpZ25hdHVyZSBoZWFkZXInLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCh7XG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAnY29udGVudC10eXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICB9LFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSg0MDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkpLnRvRXF1YWwoeyBlcnJvcjogJ01pc3Npbmcgc2lnbmF0dXJlIGhlYWRlcicgfSk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBzaWduYXR1cmUgaGVhZGVyIHdpdGggZGlmZmVyZW50IGNhc2luZycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHN0cmlwZUV2ZW50ID0gY3JlYXRlU3RyaXBlRXZlbnQoKTtcbiAgICAgIG1vY2tDb25zdHJ1Y3RFdmVudC5tb2NrUmV0dXJuVmFsdWUoc3RyaXBlRXZlbnQpO1xuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7IEl0ZW06IHVuZGVmaW5lZCB9KTtcbiAgICAgIGxhbWJkYU1vY2sub24oSW52b2tlQ29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBTdGF0dXNDb2RlOiAyMDAsXG4gICAgICAgIFBheWxvYWQ6IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZShcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBzdGF0dXNDb2RlOiAyMDAsXG4gICAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IHJlYWRpbmdJZDogJ3JlYWRpbmctMTIzJyB9KSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgICAgKSBhcyBhbnksXG4gICAgICB9KTtcbiAgICAgIGR5bmFtb01vY2sub24oUHV0Q29tbWFuZCkucmVzb2x2ZXMoe30pO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCh7XG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAnY29udGVudC10eXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAgICdTdHJpcGUtU2lnbmF0dXJlJzogJ3Rlc3Qtc2lnbmF0dXJlJywgLy8gQ2FwaXRhbCBjYXNlXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBleHBlY3QobW9ja0NvbnN0cnVjdEV2ZW50KS50b0hhdmVCZWVuQ2FsbGVkKCk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHJlamVjdCByZXF1ZXN0IHdpdGggbWlzc2luZyBib2R5JywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoe1xuICAgICAgICBib2R5OiBudWxsLFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSg0MDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkpLnRvRXF1YWwoeyBlcnJvcjogJ01pc3NpbmcgcmVxdWVzdCBib2R5JyB9KTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0V2ZW50IHByb2Nlc3NpbmcgZm9yIGNoZWNrb3V0LnNlc3Npb24uY29tcGxldGVkJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgcHJvY2VzcyBhIHN1Y2Nlc3NmdWwgY2hlY2tvdXQgc2Vzc2lvbicsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHN0cmlwZUV2ZW50ID0gY3JlYXRlU3RyaXBlRXZlbnQoKTtcbiAgICAgIG1vY2tDb25zdHJ1Y3RFdmVudC5tb2NrUmV0dXJuVmFsdWUoc3RyaXBlRXZlbnQpO1xuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7IEl0ZW06IHVuZGVmaW5lZCB9KTtcblxuICAgICAgY29uc3QgcmVhZGluZ0lkID0gJ3JlYWRpbmctNDU2JztcbiAgICAgIGxhbWJkYU1vY2sub24oSW52b2tlQ29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBTdGF0dXNDb2RlOiAyMDAsXG4gICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICAgIFBheWxvYWQ6IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZShcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBzdGF0dXNDb2RlOiAyMDAsXG4gICAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IHJlYWRpbmdJZCB9KSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgKSBhcyBhbnksXG4gICAgICB9KTtcbiAgICAgIGR5bmFtb01vY2sub24oUHV0Q29tbWFuZCkucmVzb2x2ZXMoe30pO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCgpO1xuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5yZWFkaW5nSWQpLnRvQmUocmVhZGluZ0lkKTtcblxuICAgICAgLy8gVmVyaWZ5IExhbWJkYSB3YXMgaW52b2tlZCB3aXRoIGNvcnJlY3QgcGFyYW1ldGVyc1xuICAgICAgZXhwZWN0KGxhbWJkYU1vY2spLnRvSGF2ZVJlY2VpdmVkQ29tbWFuZFdpdGgoSW52b2tlQ29tbWFuZCwge1xuICAgICAgICBGdW5jdGlvbk5hbWU6ICd0ZXN0LWdlbmVyYXRlLXJlYWRpbmctZnVuY3Rpb24nLFxuICAgICAgICBJbnZvY2F0aW9uVHlwZTogJ1JlcXVlc3RSZXNwb25zZScsXG4gICAgICAgIFBheWxvYWQ6IGV4cGVjdC5zdHJpbmdDb250YWluaW5nKG1vY2tVc2VySWQpLFxuICAgICAgfSk7XG5cbiAgICAgIC8vIFZlcmlmeSB0aGUgcGF5bG9hZCBzdHJ1Y3R1cmVcbiAgICAgIGNvbnN0IGludm9rZUNhbGwgPSBsYW1iZGFNb2NrLmNvbW1hbmRDYWxscyhJbnZva2VDb21tYW5kKVswXTtcbiAgICAgIGNvbnN0IHBheWxvYWQgPSBKU09OLnBhcnNlKGludm9rZUNhbGwuYXJnc1swXS5pbnB1dC5QYXlsb2FkIGFzIHN0cmluZyk7XG4gICAgICBleHBlY3QocGF5bG9hZCkudG9NYXRjaE9iamVjdCh7XG4gICAgICAgIHNvdXJjZTogJ3dlYmhvb2snLFxuICAgICAgICB1c2VySWQ6IG1vY2tVc2VySWQsXG4gICAgICAgIG1ldGFkYXRhOiBleHBlY3Qub2JqZWN0Q29udGFpbmluZyh7XG4gICAgICAgICAgc2Vzc2lvbklkOiBtb2NrU2Vzc2lvbklkLFxuICAgICAgICAgIGN1c3RvbWVyRW1haWw6ICd0ZXN0QGV4YW1wbGUuY29tJyxcbiAgICAgICAgICBhbW91bnRUb3RhbDogMjkwMCxcbiAgICAgICAgICBjdXJyZW5jeTogJ3VzZCcsXG4gICAgICAgIH0pLFxuICAgICAgICByZXF1ZXN0Q29udGV4dDoge1xuICAgICAgICAgIGF1dGhvcml6ZXI6IHtcbiAgICAgICAgICAgIGNsYWltczoge1xuICAgICAgICAgICAgICBzdWI6IG1vY2tVc2VySWQsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgc2tpcCBwcm9jZXNzaW5nIGZvciB1bnBhaWQgc2Vzc2lvbnMnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBzdHJpcGVFdmVudCA9IGNyZWF0ZVN0cmlwZUV2ZW50KCdjaGVja291dC5zZXNzaW9uLmNvbXBsZXRlZCcsIHtcbiAgICAgICAgcGF5bWVudF9zdGF0dXM6ICd1bnBhaWQnLFxuICAgICAgfSk7XG4gICAgICBtb2NrQ29uc3RydWN0RXZlbnQubW9ja1JldHVyblZhbHVlKHN0cmlwZUV2ZW50KTtcbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVzb2x2ZXMoeyBJdGVtOiB1bmRlZmluZWQgfSk7XG4gICAgICBkeW5hbW9Nb2NrLm9uKFB1dENvbW1hbmQpLnJlc29sdmVzKHt9KTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoKTtcbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkpLnRvRXF1YWwoe1xuICAgICAgICByZWNlaXZlZDogdHJ1ZSxcbiAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICB9KTtcblxuICAgICAgLy8gVmVyaWZ5IExhbWJkYSB3YXMgbm90IGludm9rZWRcbiAgICAgIGV4cGVjdChsYW1iZGFNb2NrKS5ub3QudG9IYXZlUmVjZWl2ZWRDb21tYW5kKEludm9rZUNvbW1hbmQpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgbWlzc2luZyB1c2VySWQgaW4gc2Vzc2lvbicsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHN0cmlwZUV2ZW50ID0gY3JlYXRlU3RyaXBlRXZlbnQoJ2NoZWNrb3V0LnNlc3Npb24uY29tcGxldGVkJywge1xuICAgICAgICBjbGllbnRfcmVmZXJlbmNlX2lkOiBudWxsLFxuICAgICAgICBtZXRhZGF0YToge30sXG4gICAgICB9KTtcbiAgICAgIG1vY2tDb25zdHJ1Y3RFdmVudC5tb2NrUmV0dXJuVmFsdWUoc3RyaXBlRXZlbnQpO1xuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7IEl0ZW06IHVuZGVmaW5lZCB9KTtcbiAgICAgIGR5bmFtb01vY2sub24oUHV0Q29tbWFuZCkucmVzb2x2ZXMoe30pO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCgpO1xuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keSkudG9FcXVhbCh7XG4gICAgICAgIHJlY2VpdmVkOiB0cnVlLFxuICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBWZXJpZnkgTGFtYmRhIHdhcyBub3QgaW52b2tlZFxuICAgICAgZXhwZWN0KGxhbWJkYU1vY2spLm5vdC50b0hhdmVSZWNlaXZlZENvbW1hbmQoSW52b2tlQ29tbWFuZCk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGV4dHJhY3QgdXNlcklkIGZyb20gbWV0YWRhdGEgaWYgY2xpZW50X3JlZmVyZW5jZV9pZCBpcyBtaXNzaW5nJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3Qgc3RyaXBlRXZlbnQgPSBjcmVhdGVTdHJpcGVFdmVudCgnY2hlY2tvdXQuc2Vzc2lvbi5jb21wbGV0ZWQnLCB7XG4gICAgICAgIGNsaWVudF9yZWZlcmVuY2VfaWQ6IG51bGwsXG4gICAgICAgIG1ldGFkYXRhOiB7IHVzZXJJZDogbW9ja1VzZXJJZCB9LFxuICAgICAgfSk7XG4gICAgICBtb2NrQ29uc3RydWN0RXZlbnQubW9ja1JldHVyblZhbHVlKHN0cmlwZUV2ZW50KTtcbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVzb2x2ZXMoeyBJdGVtOiB1bmRlZmluZWQgfSk7XG5cbiAgICAgIGNvbnN0IHJlYWRpbmdJZCA9ICdyZWFkaW5nLTc4OSc7XG4gICAgICBsYW1iZGFNb2NrLm9uKEludm9rZUNvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgU3RhdHVzQ29kZTogMjAwLFxuICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgICBQYXlsb2FkOiBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoXG4gICAgICAgICAgSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgc3RhdHVzQ29kZTogMjAwLFxuICAgICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyByZWFkaW5nSWQgfSksXG4gICAgICAgICAgfSksXG4gICAgICAgICkgYXMgYW55LFxuICAgICAgfSk7XG4gICAgICBkeW5hbW9Nb2NrLm9uKFB1dENvbW1hbmQpLnJlc29sdmVzKHt9KTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoKTtcbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkucmVhZGluZ0lkKS50b0JlKHJlYWRpbmdJZCk7XG5cbiAgICAgIC8vIFZlcmlmeSBMYW1iZGEgd2FzIGludm9rZWQgd2l0aCB1c2VySWQgZnJvbSBtZXRhZGF0YVxuICAgICAgY29uc3QgaW52b2tlQ2FsbCA9IGxhbWJkYU1vY2suY29tbWFuZENhbGxzKEludm9rZUNvbW1hbmQpWzBdO1xuICAgICAgY29uc3QgcGF5bG9hZCA9IEpTT04ucGFyc2UoaW52b2tlQ2FsbC5hcmdzWzBdLmlucHV0LlBheWxvYWQgYXMgc3RyaW5nKTtcbiAgICAgIGV4cGVjdChwYXlsb2FkLnVzZXJJZCkudG9CZShtb2NrVXNlcklkKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgcHJvY2VzcyBhc3luYyBwYXltZW50IHN1Y2NlZWRlZCBldmVudHMnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBzdHJpcGVFdmVudCA9IGNyZWF0ZVN0cmlwZUV2ZW50KCdjaGVja291dC5zZXNzaW9uLmFzeW5jX3BheW1lbnRfc3VjY2VlZGVkJyk7XG4gICAgICBtb2NrQ29uc3RydWN0RXZlbnQubW9ja1JldHVyblZhbHVlKHN0cmlwZUV2ZW50KTtcbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVzb2x2ZXMoeyBJdGVtOiB1bmRlZmluZWQgfSk7XG5cbiAgICAgIGNvbnN0IHJlYWRpbmdJZCA9ICdyZWFkaW5nLWFzeW5jJztcbiAgICAgIGxhbWJkYU1vY2sub24oSW52b2tlQ29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBTdGF0dXNDb2RlOiAyMDAsXG4gICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICAgIFBheWxvYWQ6IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZShcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBzdGF0dXNDb2RlOiAyMDAsXG4gICAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IHJlYWRpbmdJZCB9KSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgKSBhcyBhbnksXG4gICAgICB9KTtcbiAgICAgIGR5bmFtb01vY2sub24oUHV0Q29tbWFuZCkucmVzb2x2ZXMoe30pO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCh7XG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBpZDogbW9ja0V2ZW50SWQsXG4gICAgICAgICAgdHlwZTogJ2NoZWNrb3V0LnNlc3Npb24uYXN5bmNfcGF5bWVudF9zdWNjZWVkZWQnLFxuICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgIG9iamVjdDoge1xuICAgICAgICAgICAgICBpZDogbW9ja1Nlc3Npb25JZCxcbiAgICAgICAgICAgICAgY2xpZW50X3JlZmVyZW5jZV9pZDogbW9ja1VzZXJJZCxcbiAgICAgICAgICAgICAgcGF5bWVudF9zdGF0dXM6ICdwYWlkJyxcbiAgICAgICAgICAgICAgY3VzdG9tZXJfZW1haWw6ICd0ZXN0QGV4YW1wbGUuY29tJyxcbiAgICAgICAgICAgICAgYW1vdW50X3RvdGFsOiAyOTAwLFxuICAgICAgICAgICAgICBjdXJyZW5jeTogJ3VzZCcsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pLFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkucmVhZGluZ0lkKS50b0JlKHJlYWRpbmdJZCk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdJZGVtcG90ZW5jeSBjaGVja2luZycsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIHNraXAgcHJvY2Vzc2luZyBmb3IgYWxyZWFkeSBwcm9jZXNzZWQgZXZlbnRzJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3Qgc3RyaXBlRXZlbnQgPSBjcmVhdGVTdHJpcGVFdmVudCgpO1xuICAgICAgbW9ja0NvbnN0cnVjdEV2ZW50Lm1vY2tSZXR1cm5WYWx1ZShzdHJpcGVFdmVudCk7XG5cbiAgICAgIC8vIE1vY2sgaWRlbXBvdGVuY3kgY2hlY2sgLSBldmVudCBhbHJlYWR5IHByb2Nlc3NlZFxuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIEl0ZW06IHtcbiAgICAgICAgICBldmVudElkOiBtb2NrRXZlbnRJZCxcbiAgICAgICAgICBzZXNzaW9uSWQ6IG1vY2tTZXNzaW9uSWQsXG4gICAgICAgICAgcHJvY2Vzc2VkQXQ6ICcyMDI0LTAxLTAxVDAwOjAwOjAwWicsXG4gICAgICAgICAgc3RhdHVzOiAncHJvY2Vzc2VkJyxcbiAgICAgICAgICByZWFkaW5nSWQ6ICdleGlzdGluZy1yZWFkaW5nLTEyMycsXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoKTtcbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkpLnRvRXF1YWwoe1xuICAgICAgICByZWNlaXZlZDogdHJ1ZSxcbiAgICAgICAgc3RhdHVzOiAnYWxyZWFkeV9wcm9jZXNzZWQnLFxuICAgICAgfSk7XG5cbiAgICAgIC8vIFZlcmlmeSBMYW1iZGEgd2FzIG5vdCBpbnZva2VkXG4gICAgICBleHBlY3QobGFtYmRhTW9jaykubm90LnRvSGF2ZVJlY2VpdmVkQ29tbWFuZChJbnZva2VDb21tYW5kKTtcblxuICAgICAgLy8gVmVyaWZ5IG5vIG5ldyByZWNvcmQgd2FzIHdyaXR0ZW5cbiAgICAgIGV4cGVjdChkeW5hbW9Nb2NrKS5ub3QudG9IYXZlUmVjZWl2ZWRDb21tYW5kKFB1dENvbW1hbmQpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBjb250aW51ZSBwcm9jZXNzaW5nIGlmIGlkZW1wb3RlbmN5IGNoZWNrIGZhaWxzJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3Qgc3RyaXBlRXZlbnQgPSBjcmVhdGVTdHJpcGVFdmVudCgpO1xuICAgICAgbW9ja0NvbnN0cnVjdEV2ZW50Lm1vY2tSZXR1cm5WYWx1ZShzdHJpcGVFdmVudCk7XG5cbiAgICAgIC8vIE1vY2sgaWRlbXBvdGVuY3kgY2hlY2sgZmFpbHVyZVxuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZWplY3RzKG5ldyBFcnJvcignRHluYW1vREIgZXJyb3InKSk7XG5cbiAgICAgIGNvbnN0IHJlYWRpbmdJZCA9ICdyZWFkaW5nLWFmdGVyLWVycm9yJztcbiAgICAgIGxhbWJkYU1vY2sub24oSW52b2tlQ29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBTdGF0dXNDb2RlOiAyMDAsXG4gICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICAgIFBheWxvYWQ6IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZShcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBzdGF0dXNDb2RlOiAyMDAsXG4gICAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IHJlYWRpbmdJZCB9KSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgKSBhcyBhbnksXG4gICAgICB9KTtcbiAgICAgIGR5bmFtb01vY2sub24oUHV0Q29tbWFuZCkucmVzb2x2ZXMoe30pO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCgpO1xuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgLy8gU2hvdWxkIGNvbnRpbnVlIHByb2Nlc3NpbmcgZGVzcGl0ZSBpZGVtcG90ZW5jeSBjaGVjayBlcnJvclxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5yZWFkaW5nSWQpLnRvQmUocmVhZGluZ0lkKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIG1pc3Npbmcgd2ViaG9vayBwcm9jZXNzaW5nIHRhYmxlIGdyYWNlZnVsbHknLCBhc3luYyAoKSA9PiB7XG4gICAgICBkZWxldGUgcHJvY2Vzcy5lbnYuV0VCSE9PS19QUk9DRVNTSU5HX1RBQkxFX05BTUU7XG5cbiAgICAgIGNvbnN0IHN0cmlwZUV2ZW50ID0gY3JlYXRlU3RyaXBlRXZlbnQoKTtcbiAgICAgIG1vY2tDb25zdHJ1Y3RFdmVudC5tb2NrUmV0dXJuVmFsdWUoc3RyaXBlRXZlbnQpO1xuXG4gICAgICBjb25zdCByZWFkaW5nSWQgPSAncmVhZGluZy1uby10YWJsZSc7XG4gICAgICBsYW1iZGFNb2NrLm9uKEludm9rZUNvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgU3RhdHVzQ29kZTogMjAwLFxuICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgICBQYXlsb2FkOiBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoXG4gICAgICAgICAgSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgc3RhdHVzQ29kZTogMjAwLFxuICAgICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyByZWFkaW5nSWQgfSksXG4gICAgICAgICAgfSksXG4gICAgICAgICkgYXMgYW55LFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KCk7XG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LnJlYWRpbmdJZCkudG9CZShyZWFkaW5nSWQpO1xuXG4gICAgICAvLyBWZXJpZnkgbm8gRHluYW1vREIgb3BlcmF0aW9ucyB3ZXJlIGF0dGVtcHRlZFxuICAgICAgZXhwZWN0KGR5bmFtb01vY2spLm5vdC50b0hhdmVSZWNlaXZlZENvbW1hbmQoR2V0Q29tbWFuZCk7XG4gICAgICBleHBlY3QoZHluYW1vTW9jaykubm90LnRvSGF2ZVJlY2VpdmVkQ29tbWFuZChQdXRDb21tYW5kKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0Vycm9yIGhhbmRsaW5nJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgaGFuZGxlIExhbWJkYSBpbnZvY2F0aW9uIGZhaWx1cmUnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBzdHJpcGVFdmVudCA9IGNyZWF0ZVN0cmlwZUV2ZW50KCk7XG4gICAgICBtb2NrQ29uc3RydWN0RXZlbnQubW9ja1JldHVyblZhbHVlKHN0cmlwZUV2ZW50KTtcbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVzb2x2ZXMoeyBJdGVtOiB1bmRlZmluZWQgfSk7XG5cbiAgICAgIC8vIE1vY2sgTGFtYmRhIGludm9jYXRpb24gZmFpbHVyZVxuICAgICAgbGFtYmRhTW9jay5vbihJbnZva2VDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIFN0YXR1c0NvZGU6IDUwMCxcbiAgICAgIH0pO1xuICAgICAgZHluYW1vTW9jay5vbihQdXRDb21tYW5kKS5yZXNvbHZlcyh7fSk7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KCk7XG4gICAgICBjb25zdCByZXN1bHRQcm9taXNlID0gaGFuZGxlcihldmVudCk7XG5cbiAgICAgIC8vIEFkdmFuY2UgdGltZXJzIHRvIGhhbmRsZSBhbGwgcmV0cmllc1xuICAgICAgYXdhaXQgamVzdC5ydW5BbGxUaW1lcnNBc3luYygpO1xuXG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IHJlc3VsdFByb21pc2U7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApOyAvLyBTdGlsbCByZXR1cm4gMjAwIHRvIFN0cmlwZVxuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkpLnRvRXF1YWwoe1xuICAgICAgICByZWNlaXZlZDogdHJ1ZSxcbiAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICB9KTtcblxuICAgICAgLy8gVmVyaWZ5IGZhaWx1cmUgd2FzIHJlY29yZGVkXG4gICAgICBleHBlY3QoZHluYW1vTW9jaykudG9IYXZlUmVjZWl2ZWRDb21tYW5kV2l0aChQdXRDb21tYW5kLCB7XG4gICAgICAgIFRhYmxlTmFtZTogJ3Rlc3Qtd2ViaG9vay1wcm9jZXNzaW5nLXRhYmxlJyxcbiAgICAgICAgSXRlbTogZXhwZWN0Lm9iamVjdENvbnRhaW5pbmcoe1xuICAgICAgICAgIHN0YXR1czogJ2ZhaWxlZCcsXG4gICAgICAgICAgZXJyb3I6IGV4cGVjdC5hbnkoU3RyaW5nKSxcbiAgICAgICAgfSksXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIExhbWJkYSBmdW5jdGlvbiBlcnJvcicsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHN0cmlwZUV2ZW50ID0gY3JlYXRlU3RyaXBlRXZlbnQoKTtcbiAgICAgIG1vY2tDb25zdHJ1Y3RFdmVudC5tb2NrUmV0dXJuVmFsdWUoc3RyaXBlRXZlbnQpO1xuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7IEl0ZW06IHVuZGVmaW5lZCB9KTtcblxuICAgICAgLy8gTW9jayBMYW1iZGEgZnVuY3Rpb24gZXJyb3JcbiAgICAgIGxhbWJkYU1vY2sub24oSW52b2tlQ29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBTdGF0dXNDb2RlOiAyMDAsXG4gICAgICAgIEZ1bmN0aW9uRXJyb3I6ICdVbmhhbmRsZWQnLFxuICAgICAgICBQYXlsb2FkOiBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoXG4gICAgICAgICAgSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgZXJyb3JNZXNzYWdlOiAnRnVuY3Rpb24gZXJyb3InLFxuICAgICAgICAgIH0pLFxuICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgICApIGFzIGFueSxcbiAgICAgIH0pO1xuICAgICAgZHluYW1vTW9jay5vbihQdXRDb21tYW5kKS5yZXNvbHZlcyh7fSk7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KCk7XG4gICAgICBjb25zdCByZXN1bHRQcm9taXNlID0gaGFuZGxlcihldmVudCk7XG5cbiAgICAgIC8vIEFkdmFuY2UgdGltZXJzIHRvIGhhbmRsZSBhbGwgcmV0cmllc1xuICAgICAgYXdhaXQgamVzdC5ydW5BbGxUaW1lcnNBc3luYygpO1xuXG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IHJlc3VsdFByb21pc2U7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkpLnRvRXF1YWwoe1xuICAgICAgICByZWNlaXZlZDogdHJ1ZSxcbiAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIHJlYWRpbmcgZ2VuZXJhdGlvbiBmYWlsdXJlJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3Qgc3RyaXBlRXZlbnQgPSBjcmVhdGVTdHJpcGVFdmVudCgpO1xuICAgICAgbW9ja0NvbnN0cnVjdEV2ZW50Lm1vY2tSZXR1cm5WYWx1ZShzdHJpcGVFdmVudCk7XG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHsgSXRlbTogdW5kZWZpbmVkIH0pO1xuXG4gICAgICAvLyBNb2NrIHJlYWRpbmcgZ2VuZXJhdGlvbiBmYWlsdXJlXG4gICAgICBsYW1iZGFNb2NrLm9uKEludm9rZUNvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgU3RhdHVzQ29kZTogMjAwLFxuICAgICAgICBQYXlsb2FkOiBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoXG4gICAgICAgICAgSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICAgICAgYm9keTogJ1VzZXIgcHJvZmlsZSBub3QgZm91bmQnLFxuICAgICAgICAgIH0pLFxuICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgICApIGFzIGFueSxcbiAgICAgIH0pO1xuICAgICAgZHluYW1vTW9jay5vbihQdXRDb21tYW5kKS5yZXNvbHZlcyh7fSk7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KCk7XG4gICAgICBjb25zdCByZXN1bHRQcm9taXNlID0gaGFuZGxlcihldmVudCk7XG5cbiAgICAgIC8vIEFkdmFuY2UgdGltZXJzIHRvIGhhbmRsZSBhbGwgcmV0cmllc1xuICAgICAgYXdhaXQgamVzdC5ydW5BbGxUaW1lcnNBc3luYygpO1xuXG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IHJlc3VsdFByb21pc2U7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkpLnRvRXF1YWwoe1xuICAgICAgICByZWNlaXZlZDogdHJ1ZSxcbiAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIExhbWJkYSBjbGllbnQgZXJyb3JzJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3Qgc3RyaXBlRXZlbnQgPSBjcmVhdGVTdHJpcGVFdmVudCgpO1xuICAgICAgbW9ja0NvbnN0cnVjdEV2ZW50Lm1vY2tSZXR1cm5WYWx1ZShzdHJpcGVFdmVudCk7XG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHsgSXRlbTogdW5kZWZpbmVkIH0pO1xuXG4gICAgICAvLyBNb2NrIExhbWJkYSBjbGllbnQgZXJyb3JcbiAgICAgIGxhbWJkYU1vY2sub24oSW52b2tlQ29tbWFuZCkucmVqZWN0cyhuZXcgRXJyb3IoJ0xhbWJkYSBzZXJ2aWNlIGVycm9yJykpO1xuICAgICAgZHluYW1vTW9jay5vbihQdXRDb21tYW5kKS5yZXNvbHZlcyh7fSk7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KCk7XG4gICAgICBjb25zdCByZXN1bHRQcm9taXNlID0gaGFuZGxlcihldmVudCk7XG5cbiAgICAgIC8vIEFkdmFuY2UgdGltZXJzIHRvIGhhbmRsZSBhbGwgcmV0cmllc1xuICAgICAgYXdhaXQgamVzdC5ydW5BbGxUaW1lcnNBc3luYygpO1xuXG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IHJlc3VsdFByb21pc2U7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkpLnRvRXF1YWwoe1xuICAgICAgICByZWNlaXZlZDogdHJ1ZSxcbiAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIG1pc3NpbmcgZ2VuZXJhdGUgcmVhZGluZyBmdW5jdGlvbiBuYW1lJywgYXN5bmMgKCkgPT4ge1xuICAgICAgZGVsZXRlIHByb2Nlc3MuZW52LkdFTkVSQVRFX1JFQURJTkdfRlVOQ1RJT05fTkFNRTtcblxuICAgICAgY29uc3Qgc3RyaXBlRXZlbnQgPSBjcmVhdGVTdHJpcGVFdmVudCgpO1xuICAgICAgbW9ja0NvbnN0cnVjdEV2ZW50Lm1vY2tSZXR1cm5WYWx1ZShzdHJpcGVFdmVudCk7XG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHsgSXRlbTogdW5kZWZpbmVkIH0pO1xuICAgICAgZHluYW1vTW9jay5vbihQdXRDb21tYW5kKS5yZXNvbHZlcyh7fSk7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KCk7XG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5KS50b0VxdWFsKHtcbiAgICAgICAgcmVjZWl2ZWQ6IHRydWUsXG4gICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBTU00gcGFyYW1ldGVyIHJldHJpZXZhbCBmYWlsdXJlIGZvciBBUEkga2V5JywgYXN5bmMgKCkgPT4ge1xuICAgICAgc3NtTW9ja1xuICAgICAgICAub24oR2V0UGFyYW1ldGVyQ29tbWFuZCwge1xuICAgICAgICAgIE5hbWU6ICcvYXVyYTI4L3Rlc3Qvc3RyaXBlL2FwaS1rZXknLFxuICAgICAgICAgIFdpdGhEZWNyeXB0aW9uOiB0cnVlLFxuICAgICAgICB9KVxuICAgICAgICAucmVqZWN0cyhuZXcgRXJyb3IoJ1BhcmFtZXRlciBub3QgZm91bmQnKSk7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KCk7XG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoNTAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5KS50b0VxdWFsKHsgZXJyb3I6ICdJbnRlcm5hbCBzZXJ2ZXIgZXJyb3InIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgU1NNIHBhcmFtZXRlciByZXRyaWV2YWwgZmFpbHVyZSBmb3Igd2ViaG9vayBzZWNyZXQnLCBhc3luYyAoKSA9PiB7XG4gICAgICBzc21Nb2NrXG4gICAgICAgIC5vbihHZXRQYXJhbWV0ZXJDb21tYW5kLCB7XG4gICAgICAgICAgTmFtZTogJy9hdXJhMjgvdGVzdC9zdHJpcGUvd2ViaG9vay1zZWNyZXQnLFxuICAgICAgICAgIFdpdGhEZWNyeXB0aW9uOiB0cnVlLFxuICAgICAgICB9KVxuICAgICAgICAucmVqZWN0cyhuZXcgRXJyb3IoJ1BhcmFtZXRlciBub3QgZm91bmQnKSk7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KCk7XG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoNTAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5KS50b0VxdWFsKHsgZXJyb3I6ICdJbnRlcm5hbCBzZXJ2ZXIgZXJyb3InIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgZW1wdHkgU1NNIHBhcmFtZXRlciB2YWx1ZXMnLCBhc3luYyAoKSA9PiB7XG4gICAgICBzc21Nb2NrXG4gICAgICAgIC5vbihHZXRQYXJhbWV0ZXJDb21tYW5kLCB7XG4gICAgICAgICAgTmFtZTogJy9hdXJhMjgvdGVzdC9zdHJpcGUvd2ViaG9vay1zZWNyZXQnLFxuICAgICAgICAgIFdpdGhEZWNyeXB0aW9uOiB0cnVlLFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoe1xuICAgICAgICAgIFBhcmFtZXRlcjoge1xuICAgICAgICAgICAgVmFsdWU6ICcnLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCgpO1xuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDUwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keSkudG9FcXVhbCh7IGVycm9yOiAnSW50ZXJuYWwgc2VydmVyIGVycm9yJyB9KTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ1VuaGFuZGxlZCBldmVudCB0eXBlcycsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGdyYWNlZnVsbHkgaGFuZGxlIHVuaGFuZGxlZCBldmVudCB0eXBlcycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHN0cmlwZUV2ZW50ID0gY3JlYXRlU3RyaXBlRXZlbnQoJ3BheW1lbnRfaW50ZW50LnN1Y2NlZWRlZCcpO1xuICAgICAgbW9ja0NvbnN0cnVjdEV2ZW50Lm1vY2tSZXR1cm5WYWx1ZShzdHJpcGVFdmVudCk7XG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHsgSXRlbTogdW5kZWZpbmVkIH0pO1xuICAgICAgZHluYW1vTW9jay5vbihQdXRDb21tYW5kKS5yZXNvbHZlcyh7fSk7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KHtcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIGlkOiBtb2NrRXZlbnRJZCxcbiAgICAgICAgICB0eXBlOiAncGF5bWVudF9pbnRlbnQuc3VjY2VlZGVkJyxcbiAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICBvYmplY3Q6IHtcbiAgICAgICAgICAgICAgaWQ6ICdwaV90ZXN0XzEyMycsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pLFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkpLnRvRXF1YWwoe1xuICAgICAgICByZWNlaXZlZDogdHJ1ZSxcbiAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICB9KTtcblxuICAgICAgLy8gVmVyaWZ5IGV2ZW50IHdhcyByZWNvcmRlZCBhcyBmYWlsZWRcbiAgICAgIGV4cGVjdChkeW5hbW9Nb2NrKS50b0hhdmVSZWNlaXZlZENvbW1hbmRXaXRoKFB1dENvbW1hbmQsIHtcbiAgICAgICAgVGFibGVOYW1lOiAndGVzdC13ZWJob29rLXByb2Nlc3NpbmctdGFibGUnLFxuICAgICAgICBJdGVtOiBleHBlY3Qub2JqZWN0Q29udGFpbmluZyh7XG4gICAgICAgICAgc3RhdHVzOiAnZmFpbGVkJyxcbiAgICAgICAgICBlcnJvcjogZXhwZWN0LnN0cmluZ0NvbnRhaW5pbmcoJ1VuaGFuZGxlZCBldmVudCB0eXBlJyksXG4gICAgICAgIH0pLFxuICAgICAgfSk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdCYXNlNjQgZW5jb2RpbmcgaGFuZGxpbmcnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgYmFzZTY0IGVuY29kZWQgYm9keScsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHN0cmlwZUV2ZW50ID0gY3JlYXRlU3RyaXBlRXZlbnQoKTtcbiAgICAgIG1vY2tDb25zdHJ1Y3RFdmVudC5tb2NrUmV0dXJuVmFsdWUoc3RyaXBlRXZlbnQpO1xuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7IEl0ZW06IHVuZGVmaW5lZCB9KTtcblxuICAgICAgY29uc3QgcmVhZGluZ0lkID0gJ3JlYWRpbmctYmFzZTY0JztcbiAgICAgIGxhbWJkYU1vY2sub24oSW52b2tlQ29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBTdGF0dXNDb2RlOiAyMDAsXG4gICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICAgIFBheWxvYWQ6IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZShcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBzdGF0dXNDb2RlOiAyMDAsXG4gICAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IHJlYWRpbmdJZCB9KSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgKSBhcyBhbnksXG4gICAgICB9KTtcbiAgICAgIGR5bmFtb01vY2sub24oUHV0Q29tbWFuZCkucmVzb2x2ZXMoe30pO1xuXG4gICAgICBjb25zdCByYXdCb2R5ID0gSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICBpZDogbW9ja0V2ZW50SWQsXG4gICAgICAgIHR5cGU6ICdjaGVja291dC5zZXNzaW9uLmNvbXBsZXRlZCcsXG4gICAgICAgIGRhdGE6IHtcbiAgICAgICAgICBvYmplY3Q6IHtcbiAgICAgICAgICAgIGlkOiBtb2NrU2Vzc2lvbklkLFxuICAgICAgICAgICAgY2xpZW50X3JlZmVyZW5jZV9pZDogbW9ja1VzZXJJZCxcbiAgICAgICAgICAgIHBheW1lbnRfc3RhdHVzOiAncGFpZCcsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCh7XG4gICAgICAgIGJvZHk6IEJ1ZmZlci5mcm9tKHJhd0JvZHkpLnRvU3RyaW5nKCdiYXNlNjQnKSxcbiAgICAgICAgaXNCYXNlNjRFbmNvZGVkOiB0cnVlLFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkucmVhZGluZ0lkKS50b0JlKHJlYWRpbmdJZCk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBBUEkgR2F0ZXdheSBjdXN0b20gdGVtcGxhdGUgZm9ybWF0JywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3Qgc3RyaXBlRXZlbnQgPSBjcmVhdGVTdHJpcGVFdmVudCgpO1xuICAgICAgbW9ja0NvbnN0cnVjdEV2ZW50Lm1vY2tSZXR1cm5WYWx1ZShzdHJpcGVFdmVudCk7XG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHsgSXRlbTogdW5kZWZpbmVkIH0pO1xuXG4gICAgICBjb25zdCByZWFkaW5nSWQgPSAncmVhZGluZy10ZW1wbGF0ZSc7XG4gICAgICBsYW1iZGFNb2NrLm9uKEludm9rZUNvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgU3RhdHVzQ29kZTogMjAwLFxuICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgICBQYXlsb2FkOiBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoXG4gICAgICAgICAgSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgc3RhdHVzQ29kZTogMjAwLFxuICAgICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyByZWFkaW5nSWQgfSksXG4gICAgICAgICAgfSksXG4gICAgICAgICkgYXMgYW55LFxuICAgICAgfSk7XG4gICAgICBkeW5hbW9Nb2NrLm9uKFB1dENvbW1hbmQpLnJlc29sdmVzKHt9KTtcblxuICAgICAgY29uc3QgcmF3Qm9keSA9IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgaWQ6IG1vY2tFdmVudElkLFxuICAgICAgICB0eXBlOiAnY2hlY2tvdXQuc2Vzc2lvbi5jb21wbGV0ZWQnLFxuICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgb2JqZWN0OiB7XG4gICAgICAgICAgICBpZDogbW9ja1Nlc3Npb25JZCxcbiAgICAgICAgICAgIGNsaWVudF9yZWZlcmVuY2VfaWQ6IG1vY2tVc2VySWQsXG4gICAgICAgICAgICBwYXltZW50X3N0YXR1czogJ3BhaWQnLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgLy8gQVBJIEdhdGV3YXkgdGVtcGxhdGUgZm9ybWF0XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCh7XG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBib2R5OiBCdWZmZXIuZnJvbShyYXdCb2R5KS50b1N0cmluZygnYmFzZTY0JyksXG4gICAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICAgJ3N0cmlwZS1zaWduYXR1cmUnOiAndGVzdC1zaWduYXR1cmUnLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pLFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkucmVhZGluZ0lkKS50b0JlKHJlYWRpbmdJZCk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdNZXRhZGF0YSBoYW5kbGluZycsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGluY2x1ZGUgYWxsIHNlc3Npb24gbWV0YWRhdGEgaW4gTGFtYmRhIGludm9jYXRpb24nLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBjdXN0b21NZXRhZGF0YSA9IHtcbiAgICAgICAgY2FtcGFpZ246ICdzdW1tZXIyMDI0JyxcbiAgICAgICAgcmVmZXJyZXI6ICduZXdzbGV0dGVyJyxcbiAgICAgICAgcHJvbW9Db2RlOiAnU0FWRTIwJyxcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IHN0cmlwZUV2ZW50ID0gY3JlYXRlU3RyaXBlRXZlbnQoJ2NoZWNrb3V0LnNlc3Npb24uY29tcGxldGVkJywge1xuICAgICAgICBtZXRhZGF0YToge1xuICAgICAgICAgIHVzZXJJZDogbW9ja1VzZXJJZCxcbiAgICAgICAgICAuLi5jdXN0b21NZXRhZGF0YSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgICAgbW9ja0NvbnN0cnVjdEV2ZW50Lm1vY2tSZXR1cm5WYWx1ZShzdHJpcGVFdmVudCk7XG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHsgSXRlbTogdW5kZWZpbmVkIH0pO1xuXG4gICAgICBjb25zdCByZWFkaW5nSWQgPSAncmVhZGluZy1tZXRhZGF0YSc7XG4gICAgICBsYW1iZGFNb2NrLm9uKEludm9rZUNvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgU3RhdHVzQ29kZTogMjAwLFxuICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgICBQYXlsb2FkOiBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoXG4gICAgICAgICAgSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgc3RhdHVzQ29kZTogMjAwLFxuICAgICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyByZWFkaW5nSWQgfSksXG4gICAgICAgICAgfSksXG4gICAgICAgICkgYXMgYW55LFxuICAgICAgfSk7XG4gICAgICBkeW5hbW9Nb2NrLm9uKFB1dENvbW1hbmQpLnJlc29sdmVzKHt9KTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoKTtcbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuXG4gICAgICAvLyBWZXJpZnkgbWV0YWRhdGEgd2FzIHBhc3NlZCB0byBMYW1iZGFcbiAgICAgIGNvbnN0IGludm9rZUNhbGwgPSBsYW1iZGFNb2NrLmNvbW1hbmRDYWxscyhJbnZva2VDb21tYW5kKVswXTtcbiAgICAgIGNvbnN0IHBheWxvYWQgPSBKU09OLnBhcnNlKGludm9rZUNhbGwuYXJnc1swXS5pbnB1dC5QYXlsb2FkIGFzIHN0cmluZyk7XG4gICAgICBleHBlY3QocGF5bG9hZC5tZXRhZGF0YSkudG9NYXRjaE9iamVjdCh7XG4gICAgICAgIHNlc3Npb25JZDogbW9ja1Nlc3Npb25JZCxcbiAgICAgICAgdXNlcklkOiBtb2NrVXNlcklkLFxuICAgICAgICAuLi5jdXN0b21NZXRhZGF0YSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgbnVsbCB2YWx1ZXMgaW4gc2Vzc2lvbiBkYXRhJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3Qgc3RyaXBlRXZlbnQgPSBjcmVhdGVTdHJpcGVFdmVudCgnY2hlY2tvdXQuc2Vzc2lvbi5jb21wbGV0ZWQnLCB7XG4gICAgICAgIGN1c3RvbWVyX2VtYWlsOiBudWxsLFxuICAgICAgICBhbW91bnRfdG90YWw6IG51bGwsXG4gICAgICAgIGN1cnJlbmN5OiBudWxsLFxuICAgICAgICBwYXltZW50X2ludGVudDogbnVsbCxcbiAgICAgIH0pO1xuICAgICAgbW9ja0NvbnN0cnVjdEV2ZW50Lm1vY2tSZXR1cm5WYWx1ZShzdHJpcGVFdmVudCk7XG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHsgSXRlbTogdW5kZWZpbmVkIH0pO1xuXG4gICAgICBjb25zdCByZWFkaW5nSWQgPSAncmVhZGluZy1udWxsLXZhbHVlcyc7XG4gICAgICBsYW1iZGFNb2NrLm9uKEludm9rZUNvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgU3RhdHVzQ29kZTogMjAwLFxuICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgICAgICBQYXlsb2FkOiBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoXG4gICAgICAgICAgSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgc3RhdHVzQ29kZTogMjAwLFxuICAgICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyByZWFkaW5nSWQgfSksXG4gICAgICAgICAgfSksXG4gICAgICAgICkgYXMgYW55LFxuICAgICAgfSk7XG4gICAgICBkeW5hbW9Nb2NrLm9uKFB1dENvbW1hbmQpLnJlc29sdmVzKHt9KTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoKTtcbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuXG4gICAgICAvLyBWZXJpZnkgbnVsbCB2YWx1ZXMgd2VyZSBmaWx0ZXJlZCBvdXRcbiAgICAgIGNvbnN0IGludm9rZUNhbGwgPSBsYW1iZGFNb2NrLmNvbW1hbmRDYWxscyhJbnZva2VDb21tYW5kKVswXTtcbiAgICAgIGNvbnN0IHBheWxvYWQgPSBKU09OLnBhcnNlKGludm9rZUNhbGwuYXJnc1swXS5pbnB1dC5QYXlsb2FkIGFzIHN0cmluZyk7XG4gICAgICBleHBlY3QocGF5bG9hZC5tZXRhZGF0YSkubm90LnRvSGF2ZVByb3BlcnR5KCdjdXN0b21lckVtYWlsJyk7XG4gICAgICBleHBlY3QocGF5bG9hZC5tZXRhZGF0YSkubm90LnRvSGF2ZVByb3BlcnR5KCdhbW91bnRUb3RhbCcpO1xuICAgICAgZXhwZWN0KHBheWxvYWQubWV0YWRhdGEpLm5vdC50b0hhdmVQcm9wZXJ0eSgnY3VycmVuY3knKTtcbiAgICAgIGV4cGVjdChwYXlsb2FkLm1ldGFkYXRhKS5ub3QudG9IYXZlUHJvcGVydHkoJ3BheW1lbnRJbnRlbnRJZCcpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgcGF5bWVudF9pbnRlbnQgYXMgb2JqZWN0JywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3Qgc3RyaXBlRXZlbnQgPSBjcmVhdGVTdHJpcGVFdmVudCgnY2hlY2tvdXQuc2Vzc2lvbi5jb21wbGV0ZWQnLCB7XG4gICAgICAgIHBheW1lbnRfaW50ZW50OiB7IGlkOiAncGlfdGVzdF8xMjMnIH0gYXMgdW5rbm93biBhcyBzdHJpbmcsXG4gICAgICB9KTtcbiAgICAgIG1vY2tDb25zdHJ1Y3RFdmVudC5tb2NrUmV0dXJuVmFsdWUoc3RyaXBlRXZlbnQpO1xuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7IEl0ZW06IHVuZGVmaW5lZCB9KTtcblxuICAgICAgY29uc3QgcmVhZGluZ0lkID0gJ3JlYWRpbmctcGktb2JqZWN0JztcbiAgICAgIGxhbWJkYU1vY2sub24oSW52b2tlQ29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBTdGF0dXNDb2RlOiAyMDAsXG4gICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICAgIFBheWxvYWQ6IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZShcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBzdGF0dXNDb2RlOiAyMDAsXG4gICAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IHJlYWRpbmdJZCB9KSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgKSBhcyBhbnksXG4gICAgICB9KTtcbiAgICAgIGR5bmFtb01vY2sub24oUHV0Q29tbWFuZCkucmVzb2x2ZXMoe30pO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCgpO1xuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG5cbiAgICAgIC8vIFZlcmlmeSBwYXltZW50X2ludGVudCBvYmplY3Qgd2FzIG5vdCBpbmNsdWRlZCBpbiBtZXRhZGF0YVxuICAgICAgY29uc3QgaW52b2tlQ2FsbCA9IGxhbWJkYU1vY2suY29tbWFuZENhbGxzKEludm9rZUNvbW1hbmQpWzBdO1xuICAgICAgY29uc3QgcGF5bG9hZCA9IEpTT04ucGFyc2UoaW52b2tlQ2FsbC5hcmdzWzBdLmlucHV0LlBheWxvYWQgYXMgc3RyaW5nKTtcbiAgICAgIGV4cGVjdChwYXlsb2FkLm1ldGFkYXRhKS5ub3QudG9IYXZlUHJvcGVydHkoJ3BheW1lbnRJbnRlbnRJZCcpO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnUmVjb3JkaW5nIHByb2Nlc3NlZCBldmVudHMnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCByZWNvcmQgc3VjY2Vzc2Z1bCBwcm9jZXNzaW5nJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3Qgc3RyaXBlRXZlbnQgPSBjcmVhdGVTdHJpcGVFdmVudCgpO1xuICAgICAgbW9ja0NvbnN0cnVjdEV2ZW50Lm1vY2tSZXR1cm5WYWx1ZShzdHJpcGVFdmVudCk7XG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHsgSXRlbTogdW5kZWZpbmVkIH0pO1xuXG4gICAgICBjb25zdCByZWFkaW5nSWQgPSAncmVhZGluZy1yZWNvcmQnO1xuICAgICAgbGFtYmRhTW9jay5vbihJbnZva2VDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIFN0YXR1c0NvZGU6IDIwMCxcbiAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgICAgUGF5bG9hZDogbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKFxuICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgcmVhZGluZ0lkIH0pLFxuICAgICAgICAgIH0pLFxuICAgICAgICApIGFzIGFueSxcbiAgICAgIH0pO1xuICAgICAgZHluYW1vTW9jay5vbihQdXRDb21tYW5kKS5yZXNvbHZlcyh7fSk7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KCk7XG4gICAgICBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KGR5bmFtb01vY2spLnRvSGF2ZVJlY2VpdmVkQ29tbWFuZFdpdGgoUHV0Q29tbWFuZCwge1xuICAgICAgICBUYWJsZU5hbWU6ICd0ZXN0LXdlYmhvb2stcHJvY2Vzc2luZy10YWJsZScsXG4gICAgICAgIEl0ZW06IGV4cGVjdC5vYmplY3RDb250YWluaW5nKHtcbiAgICAgICAgICBzZXNzaW9uSWQ6IG1vY2tTZXNzaW9uSWQsXG4gICAgICAgICAgZXZlbnRJZDogbW9ja0V2ZW50SWQsXG4gICAgICAgICAgc3RhdHVzOiAncHJvY2Vzc2VkJyxcbiAgICAgICAgICByZWFkaW5nSWQsXG4gICAgICAgICAgcHJvY2Vzc2VkQXQ6IGV4cGVjdC5hbnkoU3RyaW5nKSxcbiAgICAgICAgfSksXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgcmVjb3JkIGZhaWxlZCBwcm9jZXNzaW5nIHdpdGggZXJyb3InLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBzdHJpcGVFdmVudCA9IGNyZWF0ZVN0cmlwZUV2ZW50KCk7XG4gICAgICBtb2NrQ29uc3RydWN0RXZlbnQubW9ja1JldHVyblZhbHVlKHN0cmlwZUV2ZW50KTtcbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVzb2x2ZXMoeyBJdGVtOiB1bmRlZmluZWQgfSk7XG5cbiAgICAgIGNvbnN0IGVycm9yTWVzc2FnZSA9ICdMYW1iZGEgaW52b2NhdGlvbiBmYWlsZWQnO1xuICAgICAgbGFtYmRhTW9jay5vbihJbnZva2VDb21tYW5kKS5yZWplY3RzKG5ldyBFcnJvcihlcnJvck1lc3NhZ2UpKTtcbiAgICAgIGR5bmFtb01vY2sub24oUHV0Q29tbWFuZCkucmVzb2x2ZXMoe30pO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCgpO1xuICAgICAgY29uc3QgcmVzdWx0UHJvbWlzZSA9IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICAvLyBBZHZhbmNlIHRpbWVycyB0byBoYW5kbGUgYWxsIHJldHJpZXNcbiAgICAgIGF3YWl0IGplc3QucnVuQWxsVGltZXJzQXN5bmMoKTtcblxuICAgICAgYXdhaXQgcmVzdWx0UHJvbWlzZTtcblxuICAgICAgZXhwZWN0KGR5bmFtb01vY2spLnRvSGF2ZVJlY2VpdmVkQ29tbWFuZFdpdGgoUHV0Q29tbWFuZCwge1xuICAgICAgICBUYWJsZU5hbWU6ICd0ZXN0LXdlYmhvb2stcHJvY2Vzc2luZy10YWJsZScsXG4gICAgICAgIEl0ZW06IGV4cGVjdC5vYmplY3RDb250YWluaW5nKHtcbiAgICAgICAgICBzZXNzaW9uSWQ6IG1vY2tTZXNzaW9uSWQsXG4gICAgICAgICAgZXZlbnRJZDogbW9ja0V2ZW50SWQsXG4gICAgICAgICAgc3RhdHVzOiAnZmFpbGVkJyxcbiAgICAgICAgICBlcnJvcjogZXJyb3JNZXNzYWdlLFxuICAgICAgICAgIHByb2Nlc3NlZEF0OiBleHBlY3QuYW55KFN0cmluZyksXG4gICAgICAgIH0pLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGNvbnRpbnVlIHByb2Nlc3NpbmcgZXZlbiBpZiByZWNvcmRpbmcgZmFpbHMnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBzdHJpcGVFdmVudCA9IGNyZWF0ZVN0cmlwZUV2ZW50KCk7XG4gICAgICBtb2NrQ29uc3RydWN0RXZlbnQubW9ja1JldHVyblZhbHVlKHN0cmlwZUV2ZW50KTtcbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVzb2x2ZXMoeyBJdGVtOiB1bmRlZmluZWQgfSk7XG5cbiAgICAgIGNvbnN0IHJlYWRpbmdJZCA9ICdyZWFkaW5nLXJlY29yZC1mYWlsJztcbiAgICAgIGxhbWJkYU1vY2sub24oSW52b2tlQ29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBTdGF0dXNDb2RlOiAyMDAsXG4gICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICAgIFBheWxvYWQ6IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZShcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBzdGF0dXNDb2RlOiAyMDAsXG4gICAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IHJlYWRpbmdJZCB9KSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgKSBhcyBhbnksXG4gICAgICB9KTtcblxuICAgICAgLy8gTW9jayByZWNvcmRpbmcgZmFpbHVyZVxuICAgICAgZHluYW1vTW9jay5vbihQdXRDb21tYW5kKS5yZWplY3RzKG5ldyBFcnJvcignRHluYW1vREIgd3JpdGUgZXJyb3InKSk7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KCk7XG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICAvLyBTaG91bGQgc3RpbGwgcmV0dXJuIHN1Y2Nlc3NcbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkucmVhZGluZ0lkKS50b0JlKHJlYWRpbmdJZCk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdVbmV4cGVjdGVkIGVycm9ycycsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIHJldHVybiA0MDAgZm9yIHNpZ25hdHVyZSBjb25zdHJ1Y3Rpb24gZXJyb3JzJywgYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gTW9jayBhbiBlcnJvciBkdXJpbmcgZXZlbnQgY29uc3RydWN0aW9uIChub3Qgc2lnbmF0dXJlIHZlcmlmaWNhdGlvbiBzcGVjaWZpYylcbiAgICAgIG1vY2tDb25zdHJ1Y3RFdmVudC5tb2NrSW1wbGVtZW50YXRpb24oKCkgPT4ge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgZXJyb3InKTtcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCgpO1xuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgLy8gVGhlIGVycm9yIGdvZXMgdGhyb3VnaCB2ZXJpZnlXZWJob29rU2lnbmF0dXJlIHdoaWNoIHRocm93cyAnSW52YWxpZCB3ZWJob29rIHNpZ25hdHVyZSdcbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSg0MDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkpLnRvRXF1YWwoeyBlcnJvcjogJ0ludmFsaWQgc2lnbmF0dXJlJyB9KTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgcmV0dXJuIDIwMCBldmVuIHdoZW4gaWRlbXBvdGVuY3kgY2hlY2sgZmFpbHMgYnV0IHByb2Nlc3NpbmcgY29udGludWVzJywgYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gTW9jayBzdWNjZXNzZnVsIHNpZ25hdHVyZSB2ZXJpZmljYXRpb25cbiAgICAgIGNvbnN0IHN0cmlwZUV2ZW50ID0gY3JlYXRlU3RyaXBlRXZlbnQoKTtcbiAgICAgIG1vY2tDb25zdHJ1Y3RFdmVudC5tb2NrUmV0dXJuVmFsdWUoc3RyaXBlRXZlbnQpO1xuXG4gICAgICAvLyBNb2NrIGlkZW1wb3RlbmN5IGNoZWNrIHRvIHRocm93IGVycm9yIChidXQgcHJvY2Vzc2luZyBjb250aW51ZXMpXG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlamVjdHMobmV3IEVycm9yKCdVbmV4cGVjdGVkIGRhdGFiYXNlIGVycm9yJykpO1xuXG4gICAgICAvLyBNb2NrIHN1Y2Nlc3NmdWwgTGFtYmRhIGludm9jYXRpb25cbiAgICAgIGNvbnN0IHJlYWRpbmdJZCA9ICdyZWFkaW5nLWFmdGVyLWRiLWVycm9yJztcbiAgICAgIGxhbWJkYU1vY2sub24oSW52b2tlQ29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBTdGF0dXNDb2RlOiAyMDAsXG4gICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICAgIFBheWxvYWQ6IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZShcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBzdGF0dXNDb2RlOiAyMDAsXG4gICAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IHJlYWRpbmdJZCB9KSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgKSBhcyBhbnksXG4gICAgICB9KTtcblxuICAgICAgLy8gTW9jayBzdWNjZXNzZnVsIHJlY29yZGluZ1xuICAgICAgZHluYW1vTW9jay5vbihQdXRDb21tYW5kKS5yZXNvbHZlcyh7fSk7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KCk7XG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICAvLyBTaG91bGQgcmV0dXJuIDIwMCBkZXNwaXRlIGlkZW1wb3RlbmN5IGNoZWNrIGVycm9yXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LnJlYWRpbmdJZCkudG9CZShyZWFkaW5nSWQpO1xuICAgIH0pO1xuICB9KTtcbn0pO1xuIl19