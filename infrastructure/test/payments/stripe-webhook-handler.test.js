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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RyaXBlLXdlYmhvb2staGFuZGxlci50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsic3RyaXBlLXdlYmhvb2staGFuZGxlci50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQ0EseUZBQXVFO0FBQ3ZFLDZEQUFpRDtBQUNqRCxvREFBcUU7QUFDckUsMERBQXFFO0FBQ3JFLHdEQUF1RjtBQUV2RiwrQkFBbUM7QUFFbkMsbUJBQW1CO0FBQ25CLE1BQU0sT0FBTyxHQUFHLElBQUEsZ0NBQVUsRUFBQyxzQkFBUyxDQUFDLENBQUM7QUFDdEMsTUFBTSxVQUFVLEdBQUcsSUFBQSxnQ0FBVSxFQUFDLDRCQUFZLENBQUMsQ0FBQztBQUM1QyxNQUFNLFVBQVUsR0FBRyxJQUFBLGdDQUFVLEVBQUMscUNBQXNCLENBQUMsQ0FBQztBQUV0RCw2QkFBNkI7QUFDN0IsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLENBQUMsRUFBRSxFQUFFLENBQUM7QUFDckMsTUFBTSxVQUFVLEdBQUc7SUFDakIsUUFBUSxFQUFFO1FBQ1IsY0FBYyxFQUFFLGtCQUFrQjtLQUNuQztDQUNGLENBQUM7QUFFRixxQkFBcUI7QUFDckIsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsR0FBRyxFQUFFO0lBQ3ZCLE9BQU8sSUFBSSxDQUFDLEVBQUUsRUFBRSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDO0FBQ3hELENBQUMsQ0FBQyxDQUFDO0FBRUgsUUFBUSxDQUFDLCtCQUErQixFQUFFLEdBQUcsRUFBRTtJQUM3QyxNQUFNLGdCQUFnQixHQUFHLHNCQUFzQixDQUFDO0lBQ2hELE1BQU0saUJBQWlCLEdBQUcsdUJBQXVCLENBQUM7SUFDbEQsTUFBTSxVQUFVLEdBQUcsZUFBZSxDQUFDO0lBQ25DLE1BQU0sYUFBYSxHQUFHLHFCQUFxQixDQUFDO0lBQzVDLE1BQU0sV0FBVyxHQUFHLGNBQWMsQ0FBQztJQUVuQyxVQUFVLENBQUMs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d0JBQXdCLENBQUM7WUFDM0MsVUFBVSxDQUFDLEVBQUUsQ0FBQyw2QkFBYSxDQUFDLENBQUMsUUFBUSxDQUFDO2dCQUNwQyxVQUFVLEVBQUUsR0FBRztnQkFDZixPQUFPLEVBQUUsSUFBSSxrQkFBVyxFQUFFLENBQUMsTUFBTSxDQUMvQixJQUFJLENBQUMsU0FBUyxDQUFDO29CQUNiLFVBQVUsRUFBRSxHQUFHO29CQUNmLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsU0FBUyxFQUFFLENBQUM7aUJBQ3BDLENBQUMsQ0FDSTthQUNULENBQUMsQ0FBQztZQUVILDRCQUE0QjtZQUM1QixVQUFVLENBQUMsRUFBRSxDQUFDLHlCQUFVLENBQUMsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7WUFFdkMsTUFBTSxLQUFLLEdBQUcsZUFBZSxFQUFFLENBQUM7WUFDaEMsTUFBTSxNQUFNLEdBQTBCLE1BQU0sSUFBQSxnQ0FBTyxFQUFDLEtBQUssQ0FBQyxDQUFDO1lBRTNELG9EQUFvRDtZQUNwRCxNQUFNLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNwQyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNyQyxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUN6QyxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBUElHYXRld2F5UHJveHlFdmVudCwgQVBJR2F0ZXdheVByb3h5UmVzdWx0IH0gZnJvbSAnYXdzLWxhbWJkYSc7XG5pbXBvcnQgeyBoYW5kbGVyIH0gZnJvbSAnLi4vLi4vbGFtYmRhL3BheW1lbnRzL3N0cmlwZS13ZWJob29rLWhhbmRsZXInO1xuaW1wb3J0IHsgbW9ja0NsaWVudCB9IGZyb20gJ2F3cy1zZGstY2xpZW50LW1vY2snO1xuaW1wb3J0IHsgU1NNQ2xpZW50LCBHZXRQYXJhbWV0ZXJDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXNzbSc7XG5pbXBvcnQgeyBMYW1iZGFDbGllbnQsIEludm9rZUNvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtbGFtYmRhJztcbmltcG9ydCB7IER5bmFtb0RCRG9jdW1lbnRDbGllbnQsIFB1dENvbW1hbmQsIEdldENvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9saWItZHluYW1vZGInO1xuaW1wb3J0IFN0cmlwZSBmcm9tICdzdHJpcGUnO1xuaW1wb3J0IHsgVGV4dEVuY29kZXIgfSBmcm9tICd1dGlsJztcblxuLy8gTW9jayBBV1MgY2xpZW50c1xuY29uc3Qgc3NtTW9jayA9IG1vY2tDbGllbnQoU1NNQ2xpZW50KTtcbmNvbnN0IGxhbWJkYU1vY2sgPSBtb2NrQ2xpZW50KExhbWJkYUNsaWVudCk7XG5jb25zdCBkeW5hbW9Nb2NrID0gbW9ja0NsaWVudChEeW5hbW9EQkRvY3VtZW50Q2xpZW50KTtcblxuLy8gTW9jayBTdHJpcGUgY29uc3RydWN0RXZlbnRcbmNvbnN0IG1vY2tDb25zdHJ1Y3RFdmVudCA9IGplc3QuZm4oKTtcbmNvbnN0IG1vY2tTdHJpcGUgPSB7XG4gIHdlYmhvb2tzOiB7XG4gICAgY29uc3RydWN0RXZlbnQ6IG1vY2tDb25zdHJ1Y3RFdmVudCxcbiAgfSxcbn07XG5cbi8vIE1vY2sgU3RyaXBlIG1vZHVsZVxuamVzdC5tb2NrKCdzdHJpcGUnLCAoKSA9PiB7XG4gIHJldHVybiBqZXN0LmZuKCkubW9ja0ltcGxlbWVudGF0aW9uKCgpID0+IG1vY2tTdHJpcGUpO1xufSk7XG5cbmRlc2NyaWJlKCdTdHJpcGUgV2ViaG9vayBIYW5kbGVyIExhbWJkYScsICgpID0+IHtcbiAgY29uc3QgbW9ja1N0cmlwZUFwaUtleSA9ICdza190ZXN0X21vY2tfa2V5XzEyMyc7XG4gIGNvbnN0IG1vY2tXZWJob29rU2VjcmV0ID0gJ3doc2VjX3Rlc3Rfc2VjcmV0XzEyMyc7XG4gIGNvbnN0IG1vY2tVc2VySWQgPSAndGVzdC11c2VyLTEyMyc7XG4gIGNvbnN0IG1vY2tTZXNzaW9uSWQgPSAnY3NfdGVzdF9zZXNzaW9uXzEyMyc7XG4gIGNvbnN0IG1vY2tFdmVudElkID0gJ2V2dF90ZXN0XzEyMyc7XG5cbiAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgamVzdC5jbGVhckFsbE1vY2tzKCk7XG4gICAgamVzdC51c2VGYWtlVGltZXJzKCk7XG4gICAgc3NtTW9jay5yZXNldCgpO1xuICAgIGxhbWJkYU1vY2sucmVzZXQoKTtcbiAgICBkeW5hbW9Nb2NrLnJlc2V0KCk7XG4gICAgbW9ja0NvbnN0cnVjdEV2ZW50Lm1vY2tSZXNldCgpO1xuXG4gICAgLy8gU2V0dXAgZW52aXJvbm1lbnQgdmFyaWFibGVzXG4gICAgcHJvY2Vzcy5lbnYuU1RSSVBFX0FQSV9LRVlfUEFSQU1FVEVSX05BTUUgPSAnL2F1cmEyOC90ZXN0L3N0cmlwZS9hcGkta2V5JztcbiAgICBwcm9jZXNzLmVudi5TVFJJUEVfV0VCSE9PS19TRUNSRVRfUEFSQU1FVEVSX05BTUUgPSAnL2F1cmEyOC90ZXN0L3N0cmlwZS93ZWJob29rLXNlY3JldCc7XG4gICAgcHJvY2Vzcy5lbnYuR0VORVJBVEVfUkVBRElOR19GVU5DVElPTl9OQU1FID0gJ3Rlc3QtZ2VuZXJhdGUtcmVhZGluZy1mdW5jdGlvbic7XG4gICAgcHJvY2Vzcy5lbnYuV0VCSE9PS19QUk9DRVNTSU5HX1RBQkxFX05BTUUgPSAndGVzdC13ZWJob29rLXByb2Nlc3NpbmctdGFibGUnO1xuXG4gICAgLy8gU2V0dXAgZGVmYXVsdCBTU00gcGFyYW1ldGVyIHJlc3BvbnNlc1xuICAgIHNzbU1vY2tcbiAgICAgIC5vbihHZXRQYXJhbWV0ZXJDb21tYW5kLCB7XG4gICAgICAgIE5hbWU6ICcvYXVyYTI4L3Rlc3Qvc3RyaXBlL2FwaS1rZXknLFxuICAgICAgICBXaXRoRGVjcnlwdGlvbjogdHJ1ZSxcbiAgICAgIH0pXG4gICAgICAucmVzb2x2ZXMoe1xuICAgICAgICBQYXJhbWV0ZXI6IHtcbiAgICAgICAgICBWYWx1ZTogbW9ja1N0cmlwZUFwaUtleSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgc3NtTW9ja1xuICAgICAgLm9uKEdldFBhcmFtZXRlckNvbW1hbmQsIHtcbiAgICAgICAgTmFtZTogJy9hdXJhMjgvdGVzdC9zdHJpcGUvd2ViaG9vay1zZWNyZXQnLFxuICAgICAgICBXaXRoRGVjcnlwdGlvbjogdHJ1ZSxcbiAgICAgIH0pXG4gICAgICAucmVzb2x2ZXMoe1xuICAgICAgICBQYXJhbWV0ZXI6IHtcbiAgICAgICAgICBWYWx1ZTogbW9ja1dlYmhvb2tTZWNyZXQsXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgfSk7XG5cbiAgYWZ0ZXJFYWNoKCgpID0+IHtcbiAgICBqZXN0LmNsZWFyQWxsVGltZXJzKCk7XG4gICAgamVzdC51c2VSZWFsVGltZXJzKCk7XG4gIH0pO1xuXG4gIGNvbnN0IGNyZWF0ZU1vY2tFdmVudCA9IChvdmVycmlkZXM6IFBhcnRpYWw8QVBJR2F0ZXdheVByb3h5RXZlbnQ+ID0ge30pOiBBUElHYXRld2F5UHJveHlFdmVudCA9PiB7XG4gICAgY29uc3QgZGVmYXVsdEJvZHkgPSBKU09OLnN0cmluZ2lmeSh7XG4gICAgICBpZDogbW9ja0V2ZW50SWQsXG4gICAgICB0eXBlOiAnY2hlY2tvdXQuc2Vzc2lvbi5jb21wbGV0ZWQnLFxuICAgICAgZGF0YToge1xuICAgICAgICBvYmplY3Q6IHtcbiAgICAgICAgICBpZDogbW9ja1Nlc3Npb25JZCxcbiAgICAgICAgICBjbGllbnRfcmVmZXJlbmNlX2lkOiBtb2NrVXNlcklkLFxuICAgICAgICAgIHBheW1lbnRfc3RhdHVzOiAncGFpZCcsXG4gICAgICAgICAgY3VzdG9tZXJfZW1haWw6ICd0ZXN0QGV4YW1wbGUuY29tJyxcbiAgICAgICAgICBhbW91bnRfdG90YWw6IDI5MDAsXG4gICAgICAgICAgY3VycmVuY3k6ICd1c2QnLFxuICAgICAgICAgIHBheW1lbnRfaW50ZW50OiAncGlfdGVzdF8xMjMnLFxuICAgICAgICAgIG1ldGFkYXRhOiB7XG4gICAgICAgICAgICB1c2VySWQ6IG1vY2tVc2VySWQsXG4gICAgICAgICAgICBzZXNzaW9uVHlwZTogJ29uZS10aW1lJyxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIHJldHVybiB7XG4gICAgICBodHRwTWV0aG9kOiAnUE9TVCcsXG4gICAgICBwYXRoOiAnL2FwaS93ZWJob29rcy9zdHJpcGUnLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICAnY29udGVudC10eXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAnc3RyaXBlLXNpZ25hdHVyZSc6ICd0ZXN0LXNpZ25hdHVyZScsXG4gICAgICB9LFxuICAgICAgYm9keTogb3ZlcnJpZGVzLmJvZHkgfHwgZGVmYXVsdEJvZHksXG4gICAgICBpc0Jhc2U2NEVuY29kZWQ6IGZhbHNlLFxuICAgICAgLi4ub3ZlcnJpZGVzLFxuICAgIH0gYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQ7XG4gIH07XG5cbiAgY29uc3QgY3JlYXRlU3RyaXBlRXZlbnQgPSAoXG4gICAgdHlwZTogc3RyaW5nID0gJ2NoZWNrb3V0LnNlc3Npb24uY29tcGxldGVkJyxcbiAgICBvdmVycmlkZXM6IFBhcnRpYWw8U3RyaXBlLkNoZWNrb3V0LlNlc3Npb24+ID0ge30sXG4gICk6IFN0cmlwZS5FdmVudCA9PiB7XG4gICAgcmV0dXJuIHtcbiAgICAgIGlkOiBtb2NrRXZlbnRJZCxcbiAgICAgIG9iamVjdDogJ2V2ZW50JyxcbiAgICAgIGFwaV92ZXJzaW9uOiAnMjAyNS0wNy0zMC5iYXNpbCcsXG4gICAgICBjcmVhdGVkOiBNYXRoLmZsb29yKERhdGUubm93KCkgLyAxMDAwKSxcbiAgICAgIHR5cGUsXG4gICAgICBkYXRhOiB7XG4gICAgICAgIG9iamVjdDoge1xuICAgICAgICAgIGlkOiBtb2NrU2Vzc2lvbklkLFxuICAgICAgICAgIG9iamVjdDogJ2NoZWNrb3V0LnNlc3Npb24nLFxuICAgICAgICAgIGNsaWVudF9yZWZlcmVuY2VfaWQ6IG1vY2tVc2VySWQsXG4gICAgICAgICAgcGF5bWVudF9zdGF0dXM6ICdwYWlkJyxcbiAgICAgICAgICBjdXN0b21lcl9lbWFpbDogJ3Rlc3RAZXhhbXBsZS5jb20nLFxuICAgICAgICAgIGFtb3VudF90b3RhbDogMjkwMCxcbiAgICAgICAgICBjdXJyZW5jeTogJ3VzZCcsXG4gICAgICAgICAgcGF5bWVudF9pbnRlbnQ6ICdwaV90ZXN0XzEyMycsXG4gICAgICAgICAgbWV0YWRhdGE6IHtcbiAgICAgICAgICAgIHVzZXJJZDogbW9ja1VzZXJJZCxcbiAgICAgICAgICAgIHNlc3Npb25UeXBlOiAnb25lLXRpbWUnLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgLi4ub3ZlcnJpZGVzLFxuICAgICAgICB9IGFzIFN0cmlwZS5DaGVja291dC5TZXNzaW9uLFxuICAgICAgfSxcbiAgICAgIGxpdmVtb2RlOiBmYWxzZSxcbiAgICAgIHBlbmRpbmdfd2ViaG9va3M6IDEsXG4gICAgICByZXF1ZXN0OiB7XG4gICAgICAgIGlkOiBudWxsLFxuICAgICAgICBpZGVtcG90ZW5jeV9rZXk6IG51bGwsXG4gICAgICB9LFxuICAgIH0gYXMgU3RyaXBlLkV2ZW50O1xuICB9O1xuXG4gIGRlc2NyaWJlKCdXZWJob29rIHNpZ25hdHVyZSB2ZXJpZmljYXRpb24nLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBzdWNjZXNzZnVsbHkgdmVyaWZ5IGEgdmFsaWQgd2ViaG9vayBzaWduYXR1cmUnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBzdHJpcGVFdmVudCA9IGNyZWF0ZVN0cmlwZUV2ZW50KCk7XG4gICAgICBtb2NrQ29uc3RydWN0RXZlbnQubW9ja1JldHVyblZhbHVlKHN0cmlwZUV2ZW50KTtcblxuICAgICAgLy8gTW9jayBpZGVtcG90ZW5jeSBjaGVjayAtIGV2ZW50IG5vdCBwcm9jZXNzZWRcbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVzb2x2ZXMoeyBJdGVtOiB1bmRlZmluZWQgfSk7XG5cbiAgICAgIC8vIE1vY2sgc3VjY2Vzc2Z1bCBMYW1iZGEgaW52b2NhdGlvblxuICAgICAgY29uc3QgcmVhZGluZ0lkID0gJ3JlYWRpbmctMTIzJztcbiAgICAgIGxhbWJkYU1vY2sub24oSW52b2tlQ29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBTdGF0dXNDb2RlOiAyMDAsXG4gICAgICAgIFBheWxvYWQ6IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZShcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBzdGF0dXNDb2RlOiAyMDAsXG4gICAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IHJlYWRpbmdJZCB9KSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgKSBhcyBhbnksXG4gICAgICB9KTtcblxuICAgICAgLy8gTW9jayByZWNvcmRpbmcgcHJvY2Vzc2VkIGV2ZW50XG4gICAgICBkeW5hbW9Nb2NrLm9uKFB1dENvbW1hbmQpLnJlc29sdmVzKHt9KTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoKTtcbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkpLnRvRXF1YWwoe1xuICAgICAgICByZWNlaXZlZDogdHJ1ZSxcbiAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgcmVhZGluZ0lkLFxuICAgICAgfSk7XG5cbiAgICAgIGV4cGVjdChtb2NrQ29uc3RydWN0RXZlbnQpLnRvSGF2ZUJlZW5DYWxsZWRXaXRoKFxuICAgICAgICBleHBlY3QuYW55KFN0cmluZyksXG4gICAgICAgICd0ZXN0LXNpZ25hdHVyZScsXG4gICAgICAgIG1vY2tXZWJob29rU2VjcmV0LFxuICAgICAgKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgcmVqZWN0IHJlcXVlc3Qgd2l0aCBpbnZhbGlkIHNpZ25hdHVyZScsIGFzeW5jICgpID0+IHtcbiAgICAgIG1vY2tDb25zdHJ1Y3RFdmVudC5tb2NrSW1wbGVtZW50YXRpb24oKCkgPT4ge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgd2ViaG9vayBzaWduYXR1cmUnKTtcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCgpO1xuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDQwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keSkudG9FcXVhbCh7IGVycm9yOiAnSW52YWxpZCBzaWduYXR1cmUnIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCByZWplY3QgcmVxdWVzdCB3aXRoIG1pc3Npbmcgc2lnbmF0dXJlIGhlYWRlcicsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KHtcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICdjb250ZW50LXR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDQwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keSkudG9FcXVhbCh7IGVycm9yOiAnTWlzc2luZyBzaWduYXR1cmUgaGVhZGVyJyB9KTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIHNpZ25hdHVyZSBoZWFkZXIgd2l0aCBkaWZmZXJlbnQgY2FzaW5nJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3Qgc3RyaXBlRXZlbnQgPSBjcmVhdGVTdHJpcGVFdmVudCgpO1xuICAgICAgbW9ja0NvbnN0cnVjdEV2ZW50Lm1vY2tSZXR1cm5WYWx1ZShzdHJpcGVFdmVudCk7XG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHsgSXRlbTogdW5kZWZpbmVkIH0pO1xuICAgICAgbGFtYmRhTW9jay5vbihJbnZva2VDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIFN0YXR1c0NvZGU6IDIwMCxcbiAgICAgICAgUGF5bG9hZDogbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKFxuICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgcmVhZGluZ0lkOiAncmVhZGluZy0xMjMnIH0pLFxuICAgICAgICAgIH0pLFxuICAgICAgICApIGFzIGFueSxcbiAgICAgIH0pO1xuICAgICAgZHluYW1vTW9jay5vbihQdXRDb21tYW5kKS5yZXNvbHZlcyh7fSk7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KHtcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICdjb250ZW50LXR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgJ1N0cmlwZS1TaWduYXR1cmUnOiAndGVzdC1zaWduYXR1cmUnLCAvLyBDYXBpdGFsIGNhc2VcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIGV4cGVjdChtb2NrQ29uc3RydWN0RXZlbnQpLnRvSGF2ZUJlZW5DYWxsZWQoKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgcmVqZWN0IHJlcXVlc3Qgd2l0aCBtaXNzaW5nIGJvZHknLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCh7XG4gICAgICAgIGJvZHk6IG51bGwsXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDQwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keSkudG9FcXVhbCh7IGVycm9yOiAnTWlzc2luZyByZXF1ZXN0IGJvZHknIH0pO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnRXZlbnQgcHJvY2Vzc2luZyBmb3IgY2hlY2tvdXQuc2Vzc2lvbi5jb21wbGV0ZWQnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBwcm9jZXNzIGEgc3VjY2Vzc2Z1bCBjaGVja291dCBzZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3Qgc3RyaXBlRXZlbnQgPSBjcmVhdGVTdHJpcGVFdmVudCgpO1xuICAgICAgbW9ja0NvbnN0cnVjdEV2ZW50Lm1vY2tSZXR1cm5WYWx1ZShzdHJpcGVFdmVudCk7XG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHsgSXRlbTogdW5kZWZpbmVkIH0pO1xuXG4gICAgICBjb25zdCByZWFkaW5nSWQgPSAncmVhZGluZy00NTYnO1xuICAgICAgbGFtYmRhTW9jay5vbihJbnZva2VDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIFN0YXR1c0NvZGU6IDIwMCxcbiAgICAgICAgUGF5bG9hZDogbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKFxuICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgcmVhZGluZ0lkIH0pLFxuICAgICAgICAgIH0pLFxuICAgICAgICApIGFzIGFueSxcbiAgICAgIH0pO1xuICAgICAgZHluYW1vTW9jay5vbihQdXRDb21tYW5kKS5yZXNvbHZlcyh7fSk7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KCk7XG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LnJlYWRpbmdJZCkudG9CZShyZWFkaW5nSWQpO1xuXG4gICAgICAvLyBWZXJpZnkgTGFtYmRhIHdhcyBpbnZva2VkIHdpdGggY29ycmVjdCBwYXJhbWV0ZXJzXG4gICAgICBleHBlY3QobGFtYmRhTW9jaykudG9IYXZlUmVjZWl2ZWRDb21tYW5kV2l0aChJbnZva2VDb21tYW5kLCB7XG4gICAgICAgIEZ1bmN0aW9uTmFtZTogJ3Rlc3QtZ2VuZXJhdGUtcmVhZGluZy1mdW5jdGlvbicsXG4gICAgICAgIEludm9jYXRpb25UeXBlOiAnUmVxdWVzdFJlc3BvbnNlJyxcbiAgICAgICAgUGF5bG9hZDogZXhwZWN0LnN0cmluZ0NvbnRhaW5pbmcobW9ja1VzZXJJZCksXG4gICAgICB9KTtcblxuICAgICAgLy8gVmVyaWZ5IHRoZSBwYXlsb2FkIHN0cnVjdHVyZVxuICAgICAgY29uc3QgaW52b2tlQ2FsbCA9IGxhbWJkYU1vY2suY29tbWFuZENhbGxzKEludm9rZUNvbW1hbmQpWzBdO1xuICAgICAgY29uc3QgcGF5bG9hZCA9IEpTT04ucGFyc2UoaW52b2tlQ2FsbC5hcmdzWzBdLmlucHV0LlBheWxvYWQgYXMgc3RyaW5nKTtcbiAgICAgIGV4cGVjdChwYXlsb2FkKS50b01hdGNoT2JqZWN0KHtcbiAgICAgICAgc291cmNlOiAnd2ViaG9vaycsXG4gICAgICAgIHVzZXJJZDogbW9ja1VzZXJJZCxcbiAgICAgICAgbWV0YWRhdGE6IGV4cGVjdC5vYmplY3RDb250YWluaW5nKHtcbiAgICAgICAgICBzZXNzaW9uSWQ6IG1vY2tTZXNzaW9uSWQsXG4gICAgICAgICAgY3VzdG9tZXJFbWFpbDogJ3Rlc3RAZXhhbXBsZS5jb20nLFxuICAgICAgICAgIGFtb3VudFRvdGFsOiAyOTAwLFxuICAgICAgICAgIGN1cnJlbmN5OiAndXNkJyxcbiAgICAgICAgfSksXG4gICAgICAgIHJlcXVlc3RDb250ZXh0OiB7XG4gICAgICAgICAgYXV0aG9yaXplcjoge1xuICAgICAgICAgICAgY2xhaW1zOiB7XG4gICAgICAgICAgICAgIHN1YjogbW9ja1VzZXJJZCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBza2lwIHByb2Nlc3NpbmcgZm9yIHVucGFpZCBzZXNzaW9ucycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHN0cmlwZUV2ZW50ID0gY3JlYXRlU3RyaXBlRXZlbnQoJ2NoZWNrb3V0LnNlc3Npb24uY29tcGxldGVkJywge1xuICAgICAgICBwYXltZW50X3N0YXR1czogJ3VucGFpZCcsXG4gICAgICB9KTtcbiAgICAgIG1vY2tDb25zdHJ1Y3RFdmVudC5tb2NrUmV0dXJuVmFsdWUoc3RyaXBlRXZlbnQpO1xuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7IEl0ZW06IHVuZGVmaW5lZCB9KTtcbiAgICAgIGR5bmFtb01vY2sub24oUHV0Q29tbWFuZCkucmVzb2x2ZXMoe30pO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCgpO1xuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keSkudG9FcXVhbCh7XG4gICAgICAgIHJlY2VpdmVkOiB0cnVlLFxuICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBWZXJpZnkgTGFtYmRhIHdhcyBub3QgaW52b2tlZFxuICAgICAgZXhwZWN0KGxhbWJkYU1vY2spLm5vdC50b0hhdmVSZWNlaXZlZENvbW1hbmQoSW52b2tlQ29tbWFuZCk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBtaXNzaW5nIHVzZXJJZCBpbiBzZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3Qgc3RyaXBlRXZlbnQgPSBjcmVhdGVTdHJpcGVFdmVudCgnY2hlY2tvdXQuc2Vzc2lvbi5jb21wbGV0ZWQnLCB7XG4gICAgICAgIGNsaWVudF9yZWZlcmVuY2VfaWQ6IG51bGwsXG4gICAgICAgIG1ldGFkYXRhOiB7fSxcbiAgICAgIH0pO1xuICAgICAgbW9ja0NvbnN0cnVjdEV2ZW50Lm1vY2tSZXR1cm5WYWx1ZShzdHJpcGVFdmVudCk7XG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHsgSXRlbTogdW5kZWZpbmVkIH0pO1xuICAgICAgZHluYW1vTW9jay5vbihQdXRDb21tYW5kKS5yZXNvbHZlcyh7fSk7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KCk7XG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5KS50b0VxdWFsKHtcbiAgICAgICAgcmVjZWl2ZWQ6IHRydWUsXG4gICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgfSk7XG5cbiAgICAgIC8vIFZlcmlmeSBMYW1iZGEgd2FzIG5vdCBpbnZva2VkXG4gICAgICBleHBlY3QobGFtYmRhTW9jaykubm90LnRvSGF2ZVJlY2VpdmVkQ29tbWFuZChJbnZva2VDb21tYW5kKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgZXh0cmFjdCB1c2VySWQgZnJvbSBtZXRhZGF0YSBpZiBjbGllbnRfcmVmZXJlbmNlX2lkIGlzIG1pc3NpbmcnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBzdHJpcGVFdmVudCA9IGNyZWF0ZVN0cmlwZUV2ZW50KCdjaGVja291dC5zZXNzaW9uLmNvbXBsZXRlZCcsIHtcbiAgICAgICAgY2xpZW50X3JlZmVyZW5jZV9pZDogbnVsbCxcbiAgICAgICAgbWV0YWRhdGE6IHsgdXNlcklkOiBtb2NrVXNlcklkIH0sXG4gICAgICB9KTtcbiAgICAgIG1vY2tDb25zdHJ1Y3RFdmVudC5tb2NrUmV0dXJuVmFsdWUoc3RyaXBlRXZlbnQpO1xuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7IEl0ZW06IHVuZGVmaW5lZCB9KTtcblxuICAgICAgY29uc3QgcmVhZGluZ0lkID0gJ3JlYWRpbmctNzg5JztcbiAgICAgIGxhbWJkYU1vY2sub24oSW52b2tlQ29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBTdGF0dXNDb2RlOiAyMDAsXG4gICAgICAgIFBheWxvYWQ6IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZShcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBzdGF0dXNDb2RlOiAyMDAsXG4gICAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IHJlYWRpbmdJZCB9KSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgKSBhcyBhbnksXG4gICAgICB9KTtcbiAgICAgIGR5bmFtb01vY2sub24oUHV0Q29tbWFuZCkucmVzb2x2ZXMoe30pO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCgpO1xuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5yZWFkaW5nSWQpLnRvQmUocmVhZGluZ0lkKTtcblxuICAgICAgLy8gVmVyaWZ5IExhbWJkYSB3YXMgaW52b2tlZCB3aXRoIHVzZXJJZCBmcm9tIG1ldGFkYXRhXG4gICAgICBjb25zdCBpbnZva2VDYWxsID0gbGFtYmRhTW9jay5jb21tYW5kQ2FsbHMoSW52b2tlQ29tbWFuZClbMF07XG4gICAgICBjb25zdCBwYXlsb2FkID0gSlNPTi5wYXJzZShpbnZva2VDYWxsLmFyZ3NbMF0uaW5wdXQuUGF5bG9hZCBhcyBzdHJpbmcpO1xuICAgICAgZXhwZWN0KHBheWxvYWQudXNlcklkKS50b0JlKG1vY2tVc2VySWQpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBwcm9jZXNzIGFzeW5jIHBheW1lbnQgc3VjY2VlZGVkIGV2ZW50cycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHN0cmlwZUV2ZW50ID0gY3JlYXRlU3RyaXBlRXZlbnQoJ2NoZWNrb3V0LnNlc3Npb24uYXN5bmNfcGF5bWVudF9zdWNjZWVkZWQnKTtcbiAgICAgIG1vY2tDb25zdHJ1Y3RFdmVudC5tb2NrUmV0dXJuVmFsdWUoc3RyaXBlRXZlbnQpO1xuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7IEl0ZW06IHVuZGVmaW5lZCB9KTtcblxuICAgICAgY29uc3QgcmVhZGluZ0lkID0gJ3JlYWRpbmctYXN5bmMnO1xuICAgICAgbGFtYmRhTW9jay5vbihJbnZva2VDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIFN0YXR1c0NvZGU6IDIwMCxcbiAgICAgICAgUGF5bG9hZDogbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKFxuICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgcmVhZGluZ0lkIH0pLFxuICAgICAgICAgIH0pLFxuICAgICAgICApIGFzIGFueSxcbiAgICAgIH0pO1xuICAgICAgZHluYW1vTW9jay5vbihQdXRDb21tYW5kKS5yZXNvbHZlcyh7fSk7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KHtcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIGlkOiBtb2NrRXZlbnRJZCxcbiAgICAgICAgICB0eXBlOiAnY2hlY2tvdXQuc2Vzc2lvbi5hc3luY19wYXltZW50X3N1Y2NlZWRlZCcsXG4gICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgb2JqZWN0OiB7XG4gICAgICAgICAgICAgIGlkOiBtb2NrU2Vzc2lvbklkLFxuICAgICAgICAgICAgICBjbGllbnRfcmVmZXJlbmNlX2lkOiBtb2NrVXNlcklkLFxuICAgICAgICAgICAgICBwYXltZW50X3N0YXR1czogJ3BhaWQnLFxuICAgICAgICAgICAgICBjdXN0b21lcl9lbWFpbDogJ3Rlc3RAZXhhbXBsZS5jb20nLFxuICAgICAgICAgICAgICBhbW91bnRfdG90YWw6IDI5MDAsXG4gICAgICAgICAgICAgIGN1cnJlbmN5OiAndXNkJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSksXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5yZWFkaW5nSWQpLnRvQmUocmVhZGluZ0lkKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0lkZW1wb3RlbmN5IGNoZWNraW5nJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgc2tpcCBwcm9jZXNzaW5nIGZvciBhbHJlYWR5IHByb2Nlc3NlZCBldmVudHMnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBzdHJpcGVFdmVudCA9IGNyZWF0ZVN0cmlwZUV2ZW50KCk7XG4gICAgICBtb2NrQ29uc3RydWN0RXZlbnQubW9ja1JldHVyblZhbHVlKHN0cmlwZUV2ZW50KTtcblxuICAgICAgLy8gTW9jayBpZGVtcG90ZW5jeSBjaGVjayAtIGV2ZW50IGFscmVhZHkgcHJvY2Vzc2VkXG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgSXRlbToge1xuICAgICAgICAgIGV2ZW50SWQ6IG1vY2tFdmVudElkLFxuICAgICAgICAgIHNlc3Npb25JZDogbW9ja1Nlc3Npb25JZCxcbiAgICAgICAgICBwcm9jZXNzZWRBdDogJzIwMjQtMDEtMDFUMDA6MDA6MDBaJyxcbiAgICAgICAgICBzdGF0dXM6ICdwcm9jZXNzZWQnLFxuICAgICAgICAgIHJlYWRpbmdJZDogJ2V4aXN0aW5nLXJlYWRpbmctMTIzJyxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCgpO1xuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keSkudG9FcXVhbCh7XG4gICAgICAgIHJlY2VpdmVkOiB0cnVlLFxuICAgICAgICBzdGF0dXM6ICdhbHJlYWR5X3Byb2Nlc3NlZCcsXG4gICAgICB9KTtcblxuICAgICAgLy8gVmVyaWZ5IExhbWJkYSB3YXMgbm90IGludm9rZWRcbiAgICAgIGV4cGVjdChsYW1iZGFNb2NrKS5ub3QudG9IYXZlUmVjZWl2ZWRDb21tYW5kKEludm9rZUNvbW1hbmQpO1xuXG4gICAgICAvLyBWZXJpZnkgbm8gbmV3IHJlY29yZCB3YXMgd3JpdHRlblxuICAgICAgZXhwZWN0KGR5bmFtb01vY2spLm5vdC50b0hhdmVSZWNlaXZlZENvbW1hbmQoUHV0Q29tbWFuZCk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGNvbnRpbnVlIHByb2Nlc3NpbmcgaWYgaWRlbXBvdGVuY3kgY2hlY2sgZmFpbHMnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBzdHJpcGVFdmVudCA9IGNyZWF0ZVN0cmlwZUV2ZW50KCk7XG4gICAgICBtb2NrQ29uc3RydWN0RXZlbnQubW9ja1JldHVyblZhbHVlKHN0cmlwZUV2ZW50KTtcblxuICAgICAgLy8gTW9jayBpZGVtcG90ZW5jeSBjaGVjayBmYWlsdXJlXG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlamVjdHMobmV3IEVycm9yKCdEeW5hbW9EQiBlcnJvcicpKTtcblxuICAgICAgY29uc3QgcmVhZGluZ0lkID0gJ3JlYWRpbmctYWZ0ZXItZXJyb3InO1xuICAgICAgbGFtYmRhTW9jay5vbihJbnZva2VDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIFN0YXR1c0NvZGU6IDIwMCxcbiAgICAgICAgUGF5bG9hZDogbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKFxuICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgcmVhZGluZ0lkIH0pLFxuICAgICAgICAgIH0pLFxuICAgICAgICApIGFzIGFueSxcbiAgICAgIH0pO1xuICAgICAgZHluYW1vTW9jay5vbihQdXRDb21tYW5kKS5yZXNvbHZlcyh7fSk7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KCk7XG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICAvLyBTaG91bGQgY29udGludWUgcHJvY2Vzc2luZyBkZXNwaXRlIGlkZW1wb3RlbmN5IGNoZWNrIGVycm9yXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5LnJlYWRpbmdJZCkudG9CZShyZWFkaW5nSWQpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgbWlzc2luZyB3ZWJob29rIHByb2Nlc3NpbmcgdGFibGUgZ3JhY2VmdWxseScsIGFzeW5jICgpID0+IHtcbiAgICAgIGRlbGV0ZSBwcm9jZXNzLmVudi5XRUJIT09LX1BST0NFU1NJTkdfVEFCTEVfTkFNRTtcblxuICAgICAgY29uc3Qgc3RyaXBlRXZlbnQgPSBjcmVhdGVTdHJpcGVFdmVudCgpO1xuICAgICAgbW9ja0NvbnN0cnVjdEV2ZW50Lm1vY2tSZXR1cm5WYWx1ZShzdHJpcGVFdmVudCk7XG5cbiAgICAgIGNvbnN0IHJlYWRpbmdJZCA9ICdyZWFkaW5nLW5vLXRhYmxlJztcbiAgICAgIGxhbWJkYU1vY2sub24oSW52b2tlQ29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBTdGF0dXNDb2RlOiAyMDAsXG4gICAgICAgIFBheWxvYWQ6IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZShcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBzdGF0dXNDb2RlOiAyMDAsXG4gICAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IHJlYWRpbmdJZCB9KSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgKSBhcyBhbnksXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoKTtcbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkucmVhZGluZ0lkKS50b0JlKHJlYWRpbmdJZCk7XG5cbiAgICAgIC8vIFZlcmlmeSBubyBEeW5hbW9EQiBvcGVyYXRpb25zIHdlcmUgYXR0ZW1wdGVkXG4gICAgICBleHBlY3QoZHluYW1vTW9jaykubm90LnRvSGF2ZVJlY2VpdmVkQ29tbWFuZChHZXRDb21tYW5kKTtcbiAgICAgIGV4cGVjdChkeW5hbW9Nb2NrKS5ub3QudG9IYXZlUmVjZWl2ZWRDb21tYW5kKFB1dENvbW1hbmQpO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnRXJyb3IgaGFuZGxpbmcnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgTGFtYmRhIGludm9jYXRpb24gZmFpbHVyZScsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHN0cmlwZUV2ZW50ID0gY3JlYXRlU3RyaXBlRXZlbnQoKTtcbiAgICAgIG1vY2tDb25zdHJ1Y3RFdmVudC5tb2NrUmV0dXJuVmFsdWUoc3RyaXBlRXZlbnQpO1xuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7IEl0ZW06IHVuZGVmaW5lZCB9KTtcblxuICAgICAgLy8gTW9jayBMYW1iZGEgaW52b2NhdGlvbiBmYWlsdXJlXG4gICAgICBsYW1iZGFNb2NrLm9uKEludm9rZUNvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgU3RhdHVzQ29kZTogNTAwLFxuICAgICAgfSk7XG4gICAgICBkeW5hbW9Nb2NrLm9uKFB1dENvbW1hbmQpLnJlc29sdmVzKHt9KTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoKTtcbiAgICAgIGNvbnN0IHJlc3VsdFByb21pc2UgPSBoYW5kbGVyKGV2ZW50KTtcbiAgICAgIFxuICAgICAgLy8gQWR2YW5jZSB0aW1lcnMgdG8gaGFuZGxlIGFsbCByZXRyaWVzXG4gICAgICBhd2FpdCBqZXN0LnJ1bkFsbFRpbWVyc0FzeW5jKCk7XG4gICAgICBcbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgcmVzdWx0UHJvbWlzZTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDIwMCk7IC8vIFN0aWxsIHJldHVybiAyMDAgdG8gU3RyaXBlXG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keSkudG9FcXVhbCh7XG4gICAgICAgIHJlY2VpdmVkOiB0cnVlLFxuICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBWZXJpZnkgZmFpbHVyZSB3YXMgcmVjb3JkZWRcbiAgICAgIGV4cGVjdChkeW5hbW9Nb2NrKS50b0hhdmVSZWNlaXZlZENvbW1hbmRXaXRoKFB1dENvbW1hbmQsIHtcbiAgICAgICAgVGFibGVOYW1lOiAndGVzdC13ZWJob29rLXByb2Nlc3NpbmctdGFibGUnLFxuICAgICAgICBJdGVtOiBleHBlY3Qub2JqZWN0Q29udGFpbmluZyh7XG4gICAgICAgICAgc3RhdHVzOiAnZmFpbGVkJyxcbiAgICAgICAgICBlcnJvcjogZXhwZWN0LmFueShTdHJpbmcpLFxuICAgICAgICB9KSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgTGFtYmRhIGZ1bmN0aW9uIGVycm9yJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3Qgc3RyaXBlRXZlbnQgPSBjcmVhdGVTdHJpcGVFdmVudCgpO1xuICAgICAgbW9ja0NvbnN0cnVjdEV2ZW50Lm1vY2tSZXR1cm5WYWx1ZShzdHJpcGVFdmVudCk7XG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHsgSXRlbTogdW5kZWZpbmVkIH0pO1xuXG4gICAgICAvLyBNb2NrIExhbWJkYSBmdW5jdGlvbiBlcnJvclxuICAgICAgbGFtYmRhTW9jay5vbihJbnZva2VDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIFN0YXR1c0NvZGU6IDIwMCxcbiAgICAgICAgRnVuY3Rpb25FcnJvcjogJ1VuaGFuZGxlZCcsXG4gICAgICAgIFBheWxvYWQ6IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZShcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBlcnJvck1lc3NhZ2U6ICdGdW5jdGlvbiBlcnJvcicsXG4gICAgICAgICAgfSksXG4gICAgICAgICkgYXMgYW55LFxuICAgICAgfSk7XG4gICAgICBkeW5hbW9Nb2NrLm9uKFB1dENvbW1hbmQpLnJlc29sdmVzKHt9KTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoKTtcbiAgICAgIGNvbnN0IHJlc3VsdFByb21pc2UgPSBoYW5kbGVyKGV2ZW50KTtcbiAgICAgIFxuICAgICAgLy8gQWR2YW5jZSB0aW1lcnMgdG8gaGFuZGxlIGFsbCByZXRyaWVzXG4gICAgICBhd2FpdCBqZXN0LnJ1bkFsbFRpbWVyc0FzeW5jKCk7XG4gICAgICBcbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgcmVzdWx0UHJvbWlzZTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keSkudG9FcXVhbCh7XG4gICAgICAgIHJlY2VpdmVkOiB0cnVlLFxuICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgcmVhZGluZyBnZW5lcmF0aW9uIGZhaWx1cmUnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBzdHJpcGVFdmVudCA9IGNyZWF0ZVN0cmlwZUV2ZW50KCk7XG4gICAgICBtb2NrQ29uc3RydWN0RXZlbnQubW9ja1JldHVyblZhbHVlKHN0cmlwZUV2ZW50KTtcbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVzb2x2ZXMoeyBJdGVtOiB1bmRlZmluZWQgfSk7XG5cbiAgICAgIC8vIE1vY2sgcmVhZGluZyBnZW5lcmF0aW9uIGZhaWx1cmVcbiAgICAgIGxhbWJkYU1vY2sub24oSW52b2tlQ29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBTdGF0dXNDb2RlOiAyMDAsXG4gICAgICAgIFBheWxvYWQ6IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZShcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgICAgICBib2R5OiAnVXNlciBwcm9maWxlIG5vdCBmb3VuZCcsXG4gICAgICAgICAgfSksXG4gICAgICAgICkgYXMgYW55LFxuICAgICAgfSk7XG4gICAgICBkeW5hbW9Nb2NrLm9uKFB1dENvbW1hbmQpLnJlc29sdmVzKHt9KTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoKTtcbiAgICAgIGNvbnN0IHJlc3VsdFByb21pc2UgPSBoYW5kbGVyKGV2ZW50KTtcbiAgICAgIFxuICAgICAgLy8gQWR2YW5jZSB0aW1lcnMgdG8gaGFuZGxlIGFsbCByZXRyaWVzXG4gICAgICBhd2FpdCBqZXN0LnJ1bkFsbFRpbWVyc0FzeW5jKCk7XG4gICAgICBcbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgcmVzdWx0UHJvbWlzZTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keSkudG9FcXVhbCh7XG4gICAgICAgIHJlY2VpdmVkOiB0cnVlLFxuICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgTGFtYmRhIGNsaWVudCBlcnJvcnMnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBzdHJpcGVFdmVudCA9IGNyZWF0ZVN0cmlwZUV2ZW50KCk7XG4gICAgICBtb2NrQ29uc3RydWN0RXZlbnQubW9ja1JldHVyblZhbHVlKHN0cmlwZUV2ZW50KTtcbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVzb2x2ZXMoeyBJdGVtOiB1bmRlZmluZWQgfSk7XG5cbiAgICAgIC8vIE1vY2sgTGFtYmRhIGNsaWVudCBlcnJvclxuICAgICAgbGFtYmRhTW9jay5vbihJbnZva2VDb21tYW5kKS5yZWplY3RzKG5ldyBFcnJvcignTGFtYmRhIHNlcnZpY2UgZXJyb3InKSk7XG4gICAgICBkeW5hbW9Nb2NrLm9uKFB1dENvbW1hbmQpLnJlc29sdmVzKHt9KTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoKTtcbiAgICAgIGNvbnN0IHJlc3VsdFByb21pc2UgPSBoYW5kbGVyKGV2ZW50KTtcbiAgICAgIFxuICAgICAgLy8gQWR2YW5jZSB0aW1lcnMgdG8gaGFuZGxlIGFsbCByZXRyaWVzXG4gICAgICBhd2FpdCBqZXN0LnJ1bkFsbFRpbWVyc0FzeW5jKCk7XG4gICAgICBcbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgcmVzdWx0UHJvbWlzZTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keSkudG9FcXVhbCh7XG4gICAgICAgIHJlY2VpdmVkOiB0cnVlLFxuICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgbWlzc2luZyBnZW5lcmF0ZSByZWFkaW5nIGZ1bmN0aW9uIG5hbWUnLCBhc3luYyAoKSA9PiB7XG4gICAgICBkZWxldGUgcHJvY2Vzcy5lbnYuR0VORVJBVEVfUkVBRElOR19GVU5DVElPTl9OQU1FO1xuXG4gICAgICBjb25zdCBzdHJpcGVFdmVudCA9IGNyZWF0ZVN0cmlwZUV2ZW50KCk7XG4gICAgICBtb2NrQ29uc3RydWN0RXZlbnQubW9ja1JldHVyblZhbHVlKHN0cmlwZUV2ZW50KTtcbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVzb2x2ZXMoeyBJdGVtOiB1bmRlZmluZWQgfSk7XG4gICAgICBkeW5hbW9Nb2NrLm9uKFB1dENvbW1hbmQpLnJlc29sdmVzKHt9KTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoKTtcbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkpLnRvRXF1YWwoe1xuICAgICAgICByZWNlaXZlZDogdHJ1ZSxcbiAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIFNTTSBwYXJhbWV0ZXIgcmV0cmlldmFsIGZhaWx1cmUgZm9yIEFQSSBrZXknLCBhc3luYyAoKSA9PiB7XG4gICAgICBzc21Nb2NrXG4gICAgICAgIC5vbihHZXRQYXJhbWV0ZXJDb21tYW5kLCB7XG4gICAgICAgICAgTmFtZTogJy9hdXJhMjgvdGVzdC9zdHJpcGUvYXBpLWtleScsXG4gICAgICAgICAgV2l0aERlY3J5cHRpb246IHRydWUsXG4gICAgICAgIH0pXG4gICAgICAgIC5yZWplY3RzKG5ldyBFcnJvcignUGFyYW1ldGVyIG5vdCBmb3VuZCcpKTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoKTtcbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSg1MDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkpLnRvRXF1YWwoeyBlcnJvcjogJ0ludGVybmFsIHNlcnZlciBlcnJvcicgfSk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBTU00gcGFyYW1ldGVyIHJldHJpZXZhbCBmYWlsdXJlIGZvciB3ZWJob29rIHNlY3JldCcsIGFzeW5jICgpID0+IHtcbiAgICAgIHNzbU1vY2tcbiAgICAgICAgLm9uKEdldFBhcmFtZXRlckNvbW1hbmQsIHtcbiAgICAgICAgICBOYW1lOiAnL2F1cmEyOC90ZXN0L3N0cmlwZS93ZWJob29rLXNlY3JldCcsXG4gICAgICAgICAgV2l0aERlY3J5cHRpb246IHRydWUsXG4gICAgICAgIH0pXG4gICAgICAgIC5yZWplY3RzKG5ldyBFcnJvcignUGFyYW1ldGVyIG5vdCBmb3VuZCcpKTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoKTtcbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSg1MDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkpLnRvRXF1YWwoeyBlcnJvcjogJ0ludGVybmFsIHNlcnZlciBlcnJvcicgfSk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBlbXB0eSBTU00gcGFyYW1ldGVyIHZhbHVlcycsIGFzeW5jICgpID0+IHtcbiAgICAgIHNzbU1vY2tcbiAgICAgICAgLm9uKEdldFBhcmFtZXRlckNvbW1hbmQsIHtcbiAgICAgICAgICBOYW1lOiAnL2F1cmEyOC90ZXN0L3N0cmlwZS93ZWJob29rLXNlY3JldCcsXG4gICAgICAgICAgV2l0aERlY3J5cHRpb246IHRydWUsXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgUGFyYW1ldGVyOiB7XG4gICAgICAgICAgICBWYWx1ZTogJycsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KCk7XG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoNTAwKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KTtcbiAgICAgIGV4cGVjdChib2R5KS50b0VxdWFsKHsgZXJyb3I6ICdJbnRlcm5hbCBzZXJ2ZXIgZXJyb3InIH0pO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnVW5oYW5kbGVkIGV2ZW50IHR5cGVzJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgZ3JhY2VmdWxseSBoYW5kbGUgdW5oYW5kbGVkIGV2ZW50IHR5cGVzJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3Qgc3RyaXBlRXZlbnQgPSBjcmVhdGVTdHJpcGVFdmVudCgncGF5bWVudF9pbnRlbnQuc3VjY2VlZGVkJyk7XG4gICAgICBtb2NrQ29uc3RydWN0RXZlbnQubW9ja1JldHVyblZhbHVlKHN0cmlwZUV2ZW50KTtcbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVzb2x2ZXMoeyBJdGVtOiB1bmRlZmluZWQgfSk7XG4gICAgICBkeW5hbW9Nb2NrLm9uKFB1dENvbW1hbmQpLnJlc29sdmVzKHt9KTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoe1xuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgaWQ6IG1vY2tFdmVudElkLFxuICAgICAgICAgIHR5cGU6ICdwYXltZW50X2ludGVudC5zdWNjZWVkZWQnLFxuICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgIG9iamVjdDoge1xuICAgICAgICAgICAgICBpZDogJ3BpX3Rlc3RfMTIzJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSksXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keSkudG9FcXVhbCh7XG4gICAgICAgIHJlY2VpdmVkOiB0cnVlLFxuICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBWZXJpZnkgZXZlbnQgd2FzIHJlY29yZGVkIGFzIGZhaWxlZFxuICAgICAgZXhwZWN0KGR5bmFtb01vY2spLnRvSGF2ZVJlY2VpdmVkQ29tbWFuZFdpdGgoUHV0Q29tbWFuZCwge1xuICAgICAgICBUYWJsZU5hbWU6ICd0ZXN0LXdlYmhvb2stcHJvY2Vzc2luZy10YWJsZScsXG4gICAgICAgIEl0ZW06IGV4cGVjdC5vYmplY3RDb250YWluaW5nKHtcbiAgICAgICAgICBzdGF0dXM6ICdmYWlsZWQnLFxuICAgICAgICAgIGVycm9yOiBleHBlY3Quc3RyaW5nQ29udGFpbmluZygnVW5oYW5kbGVkIGV2ZW50IHR5cGUnKSxcbiAgICAgICAgfSksXG4gICAgICB9KTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0Jhc2U2NCBlbmNvZGluZyBoYW5kbGluZycsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBiYXNlNjQgZW5jb2RlZCBib2R5JywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3Qgc3RyaXBlRXZlbnQgPSBjcmVhdGVTdHJpcGVFdmVudCgpO1xuICAgICAgbW9ja0NvbnN0cnVjdEV2ZW50Lm1vY2tSZXR1cm5WYWx1ZShzdHJpcGVFdmVudCk7XG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHsgSXRlbTogdW5kZWZpbmVkIH0pO1xuXG4gICAgICBjb25zdCByZWFkaW5nSWQgPSAncmVhZGluZy1iYXNlNjQnO1xuICAgICAgbGFtYmRhTW9jay5vbihJbnZva2VDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIFN0YXR1c0NvZGU6IDIwMCxcbiAgICAgICAgUGF5bG9hZDogbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKFxuICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgcmVhZGluZ0lkIH0pLFxuICAgICAgICAgIH0pLFxuICAgICAgICApIGFzIGFueSxcbiAgICAgIH0pO1xuICAgICAgZHluYW1vTW9jay5vbihQdXRDb21tYW5kKS5yZXNvbHZlcyh7fSk7XG5cbiAgICAgIGNvbnN0IHJhd0JvZHkgPSBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgIGlkOiBtb2NrRXZlbnRJZCxcbiAgICAgICAgdHlwZTogJ2NoZWNrb3V0LnNlc3Npb24uY29tcGxldGVkJyxcbiAgICAgICAgZGF0YToge1xuICAgICAgICAgIG9iamVjdDoge1xuICAgICAgICAgICAgaWQ6IG1vY2tTZXNzaW9uSWQsXG4gICAgICAgICAgICBjbGllbnRfcmVmZXJlbmNlX2lkOiBtb2NrVXNlcklkLFxuICAgICAgICAgICAgcGF5bWVudF9zdGF0dXM6ICdwYWlkJyxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KHtcbiAgICAgICAgYm9keTogQnVmZmVyLmZyb20ocmF3Qm9keSkudG9TdHJpbmcoJ2Jhc2U2NCcpLFxuICAgICAgICBpc0Jhc2U2NEVuY29kZWQ6IHRydWUsXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5yZWFkaW5nSWQpLnRvQmUocmVhZGluZ0lkKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIEFQSSBHYXRld2F5IGN1c3RvbSB0ZW1wbGF0ZSBmb3JtYXQnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBzdHJpcGVFdmVudCA9IGNyZWF0ZVN0cmlwZUV2ZW50KCk7XG4gICAgICBtb2NrQ29uc3RydWN0RXZlbnQubW9ja1JldHVyblZhbHVlKHN0cmlwZUV2ZW50KTtcbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVzb2x2ZXMoeyBJdGVtOiB1bmRlZmluZWQgfSk7XG5cbiAgICAgIGNvbnN0IHJlYWRpbmdJZCA9ICdyZWFkaW5nLXRlbXBsYXRlJztcbiAgICAgIGxhbWJkYU1vY2sub24oSW52b2tlQ29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBTdGF0dXNDb2RlOiAyMDAsXG4gICAgICAgIFBheWxvYWQ6IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZShcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBzdGF0dXNDb2RlOiAyMDAsXG4gICAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IHJlYWRpbmdJZCB9KSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgKSBhcyBhbnksXG4gICAgICB9KTtcbiAgICAgIGR5bmFtb01vY2sub24oUHV0Q29tbWFuZCkucmVzb2x2ZXMoe30pO1xuXG4gICAgICBjb25zdCByYXdCb2R5ID0gSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICBpZDogbW9ja0V2ZW50SWQsXG4gICAgICAgIHR5cGU6ICdjaGVja291dC5zZXNzaW9uLmNvbXBsZXRlZCcsXG4gICAgICAgIGRhdGE6IHtcbiAgICAgICAgICBvYmplY3Q6IHtcbiAgICAgICAgICAgIGlkOiBtb2NrU2Vzc2lvbklkLFxuICAgICAgICAgICAgY2xpZW50X3JlZmVyZW5jZV9pZDogbW9ja1VzZXJJZCxcbiAgICAgICAgICAgIHBheW1lbnRfc3RhdHVzOiAncGFpZCcsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBBUEkgR2F0ZXdheSB0ZW1wbGF0ZSBmb3JtYXRcbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KHtcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIGJvZHk6IEJ1ZmZlci5mcm9tKHJhd0JvZHkpLnRvU3RyaW5nKCdiYXNlNjQnKSxcbiAgICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgICAnc3RyaXBlLXNpZ25hdHVyZSc6ICd0ZXN0LXNpZ25hdHVyZScsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSksXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5yZWFkaW5nSWQpLnRvQmUocmVhZGluZ0lkKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ01ldGFkYXRhIGhhbmRsaW5nJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgaW5jbHVkZSBhbGwgc2Vzc2lvbiBtZXRhZGF0YSBpbiBMYW1iZGEgaW52b2NhdGlvbicsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGN1c3RvbU1ldGFkYXRhID0ge1xuICAgICAgICBjYW1wYWlnbjogJ3N1bW1lcjIwMjQnLFxuICAgICAgICByZWZlcnJlcjogJ25ld3NsZXR0ZXInLFxuICAgICAgICBwcm9tb0NvZGU6ICdTQVZFMjAnLFxuICAgICAgfTtcblxuICAgICAgY29uc3Qgc3RyaXBlRXZlbnQgPSBjcmVhdGVTdHJpcGVFdmVudCgnY2hlY2tvdXQuc2Vzc2lvbi5jb21wbGV0ZWQnLCB7XG4gICAgICAgIG1ldGFkYXRhOiB7XG4gICAgICAgICAgdXNlcklkOiBtb2NrVXNlcklkLFxuICAgICAgICAgIC4uLmN1c3RvbU1ldGFkYXRhLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgICBtb2NrQ29uc3RydWN0RXZlbnQubW9ja1JldHVyblZhbHVlKHN0cmlwZUV2ZW50KTtcbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVzb2x2ZXMoeyBJdGVtOiB1bmRlZmluZWQgfSk7XG5cbiAgICAgIGNvbnN0IHJlYWRpbmdJZCA9ICdyZWFkaW5nLW1ldGFkYXRhJztcbiAgICAgIGxhbWJkYU1vY2sub24oSW52b2tlQ29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBTdGF0dXNDb2RlOiAyMDAsXG4gICAgICAgIFBheWxvYWQ6IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZShcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBzdGF0dXNDb2RlOiAyMDAsXG4gICAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IHJlYWRpbmdJZCB9KSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgKSBhcyBhbnksXG4gICAgICB9KTtcbiAgICAgIGR5bmFtb01vY2sub24oUHV0Q29tbWFuZCkucmVzb2x2ZXMoe30pO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCgpO1xuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG5cbiAgICAgIC8vIFZlcmlmeSBtZXRhZGF0YSB3YXMgcGFzc2VkIHRvIExhbWJkYVxuICAgICAgY29uc3QgaW52b2tlQ2FsbCA9IGxhbWJkYU1vY2suY29tbWFuZENhbGxzKEludm9rZUNvbW1hbmQpWzBdO1xuICAgICAgY29uc3QgcGF5bG9hZCA9IEpTT04ucGFyc2UoaW52b2tlQ2FsbC5hcmdzWzBdLmlucHV0LlBheWxvYWQgYXMgc3RyaW5nKTtcbiAgICAgIGV4cGVjdChwYXlsb2FkLm1ldGFkYXRhKS50b01hdGNoT2JqZWN0KHtcbiAgICAgICAgc2Vzc2lvbklkOiBtb2NrU2Vzc2lvbklkLFxuICAgICAgICB1c2VySWQ6IG1vY2tVc2VySWQsXG4gICAgICAgIC4uLmN1c3RvbU1ldGFkYXRhLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBudWxsIHZhbHVlcyBpbiBzZXNzaW9uIGRhdGEnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBzdHJpcGVFdmVudCA9IGNyZWF0ZVN0cmlwZUV2ZW50KCdjaGVja291dC5zZXNzaW9uLmNvbXBsZXRlZCcsIHtcbiAgICAgICAgY3VzdG9tZXJfZW1haWw6IG51bGwsXG4gICAgICAgIGFtb3VudF90b3RhbDogbnVsbCxcbiAgICAgICAgY3VycmVuY3k6IG51bGwsXG4gICAgICAgIHBheW1lbnRfaW50ZW50OiBudWxsLFxuICAgICAgfSk7XG4gICAgICBtb2NrQ29uc3RydWN0RXZlbnQubW9ja1JldHVyblZhbHVlKHN0cmlwZUV2ZW50KTtcbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVzb2x2ZXMoeyBJdGVtOiB1bmRlZmluZWQgfSk7XG5cbiAgICAgIGNvbnN0IHJlYWRpbmdJZCA9ICdyZWFkaW5nLW51bGwtdmFsdWVzJztcbiAgICAgIGxhbWJkYU1vY2sub24oSW52b2tlQ29tbWFuZCkucmVzb2x2ZXMoe1xuICAgICAgICBTdGF0dXNDb2RlOiAyMDAsXG4gICAgICAgIFBheWxvYWQ6IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZShcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBzdGF0dXNDb2RlOiAyMDAsXG4gICAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IHJlYWRpbmdJZCB9KSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgKSBhcyBhbnksXG4gICAgICB9KTtcbiAgICAgIGR5bmFtb01vY2sub24oUHV0Q29tbWFuZCkucmVzb2x2ZXMoe30pO1xuXG4gICAgICBjb25zdCBldmVudCA9IGNyZWF0ZU1vY2tFdmVudCgpO1xuICAgICAgY29uc3QgcmVzdWx0OiBBUElHYXRld2F5UHJveHlSZXN1bHQgPSBhd2FpdCBoYW5kbGVyKGV2ZW50KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG5cbiAgICAgIC8vIFZlcmlmeSBudWxsIHZhbHVlcyB3ZXJlIGZpbHRlcmVkIG91dFxuICAgICAgY29uc3QgaW52b2tlQ2FsbCA9IGxhbWJkYU1vY2suY29tbWFuZENhbGxzKEludm9rZUNvbW1hbmQpWzBdO1xuICAgICAgY29uc3QgcGF5bG9hZCA9IEpTT04ucGFyc2UoaW52b2tlQ2FsbC5hcmdzWzBdLmlucHV0LlBheWxvYWQgYXMgc3RyaW5nKTtcbiAgICAgIGV4cGVjdChwYXlsb2FkLm1ldGFkYXRhKS5ub3QudG9IYXZlUHJvcGVydHkoJ2N1c3RvbWVyRW1haWwnKTtcbiAgICAgIGV4cGVjdChwYXlsb2FkLm1ldGFkYXRhKS5ub3QudG9IYXZlUHJvcGVydHkoJ2Ftb3VudFRvdGFsJyk7XG4gICAgICBleHBlY3QocGF5bG9hZC5tZXRhZGF0YSkubm90LnRvSGF2ZVByb3BlcnR5KCdjdXJyZW5jeScpO1xuICAgICAgZXhwZWN0KHBheWxvYWQubWV0YWRhdGEpLm5vdC50b0hhdmVQcm9wZXJ0eSgncGF5bWVudEludGVudElkJyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBwYXltZW50X2ludGVudCBhcyBvYmplY3QnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBzdHJpcGVFdmVudCA9IGNyZWF0ZVN0cmlwZUV2ZW50KCdjaGVja291dC5zZXNzaW9uLmNvbXBsZXRlZCcsIHtcbiAgICAgICAgcGF5bWVudF9pbnRlbnQ6IHsgaWQ6ICdwaV90ZXN0XzEyMycgfSBhcyB1bmtub3duIGFzIHN0cmluZyxcbiAgICAgIH0pO1xuICAgICAgbW9ja0NvbnN0cnVjdEV2ZW50Lm1vY2tSZXR1cm5WYWx1ZShzdHJpcGVFdmVudCk7XG4gICAgICBkeW5hbW9Nb2NrLm9uKEdldENvbW1hbmQpLnJlc29sdmVzKHsgSXRlbTogdW5kZWZpbmVkIH0pO1xuXG4gICAgICBjb25zdCByZWFkaW5nSWQgPSAncmVhZGluZy1waS1vYmplY3QnO1xuICAgICAgbGFtYmRhTW9jay5vbihJbnZva2VDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIFN0YXR1c0NvZGU6IDIwMCxcbiAgICAgICAgUGF5bG9hZDogbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKFxuICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgcmVhZGluZ0lkIH0pLFxuICAgICAgICAgIH0pLFxuICAgICAgICApIGFzIGFueSxcbiAgICAgIH0pO1xuICAgICAgZHluYW1vTW9jay5vbihQdXRDb21tYW5kKS5yZXNvbHZlcyh7fSk7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KCk7XG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnN0YXR1c0NvZGUpLnRvQmUoMjAwKTtcblxuICAgICAgLy8gVmVyaWZ5IHBheW1lbnRfaW50ZW50IG9iamVjdCB3YXMgbm90IGluY2x1ZGVkIGluIG1ldGFkYXRhXG4gICAgICBjb25zdCBpbnZva2VDYWxsID0gbGFtYmRhTW9jay5jb21tYW5kQ2FsbHMoSW52b2tlQ29tbWFuZClbMF07XG4gICAgICBjb25zdCBwYXlsb2FkID0gSlNPTi5wYXJzZShpbnZva2VDYWxsLmFyZ3NbMF0uaW5wdXQuUGF5bG9hZCBhcyBzdHJpbmcpO1xuICAgICAgZXhwZWN0KHBheWxvYWQubWV0YWRhdGEpLm5vdC50b0hhdmVQcm9wZXJ0eSgncGF5bWVudEludGVudElkJyk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdSZWNvcmRpbmcgcHJvY2Vzc2VkIGV2ZW50cycsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIHJlY29yZCBzdWNjZXNzZnVsIHByb2Nlc3NpbmcnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBzdHJpcGVFdmVudCA9IGNyZWF0ZVN0cmlwZUV2ZW50KCk7XG4gICAgICBtb2NrQ29uc3RydWN0RXZlbnQubW9ja1JldHVyblZhbHVlKHN0cmlwZUV2ZW50KTtcbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVzb2x2ZXMoeyBJdGVtOiB1bmRlZmluZWQgfSk7XG5cbiAgICAgIGNvbnN0IHJlYWRpbmdJZCA9ICdyZWFkaW5nLXJlY29yZCc7XG4gICAgICBsYW1iZGFNb2NrLm9uKEludm9rZUNvbW1hbmQpLnJlc29sdmVzKHtcbiAgICAgICAgU3RhdHVzQ29kZTogMjAwLFxuICAgICAgICBQYXlsb2FkOiBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoXG4gICAgICAgICAgSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgc3RhdHVzQ29kZTogMjAwLFxuICAgICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyByZWFkaW5nSWQgfSksXG4gICAgICAgICAgfSksXG4gICAgICAgICkgYXMgYW55LFxuICAgICAgfSk7XG4gICAgICBkeW5hbW9Nb2NrLm9uKFB1dENvbW1hbmQpLnJlc29sdmVzKHt9KTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoKTtcbiAgICAgIGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICBleHBlY3QoZHluYW1vTW9jaykudG9IYXZlUmVjZWl2ZWRDb21tYW5kV2l0aChQdXRDb21tYW5kLCB7XG4gICAgICAgIFRhYmxlTmFtZTogJ3Rlc3Qtd2ViaG9vay1wcm9jZXNzaW5nLXRhYmxlJyxcbiAgICAgICAgSXRlbTogZXhwZWN0Lm9iamVjdENvbnRhaW5pbmcoe1xuICAgICAgICAgIHNlc3Npb25JZDogbW9ja1Nlc3Npb25JZCxcbiAgICAgICAgICBldmVudElkOiBtb2NrRXZlbnRJZCxcbiAgICAgICAgICBzdGF0dXM6ICdwcm9jZXNzZWQnLFxuICAgICAgICAgIHJlYWRpbmdJZCxcbiAgICAgICAgICBwcm9jZXNzZWRBdDogZXhwZWN0LmFueShTdHJpbmcpLFxuICAgICAgICB9KSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCByZWNvcmQgZmFpbGVkIHByb2Nlc3Npbmcgd2l0aCBlcnJvcicsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHN0cmlwZUV2ZW50ID0gY3JlYXRlU3RyaXBlRXZlbnQoKTtcbiAgICAgIG1vY2tDb25zdHJ1Y3RFdmVudC5tb2NrUmV0dXJuVmFsdWUoc3RyaXBlRXZlbnQpO1xuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7IEl0ZW06IHVuZGVmaW5lZCB9KTtcblxuICAgICAgY29uc3QgZXJyb3JNZXNzYWdlID0gJ0xhbWJkYSBpbnZvY2F0aW9uIGZhaWxlZCc7XG4gICAgICBsYW1iZGFNb2NrLm9uKEludm9rZUNvbW1hbmQpLnJlamVjdHMobmV3IEVycm9yKGVycm9yTWVzc2FnZSkpO1xuICAgICAgZHluYW1vTW9jay5vbihQdXRDb21tYW5kKS5yZXNvbHZlcyh7fSk7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KCk7XG4gICAgICBjb25zdCByZXN1bHRQcm9taXNlID0gaGFuZGxlcihldmVudCk7XG4gICAgICBcbiAgICAgIC8vIEFkdmFuY2UgdGltZXJzIHRvIGhhbmRsZSBhbGwgcmV0cmllc1xuICAgICAgYXdhaXQgamVzdC5ydW5BbGxUaW1lcnNBc3luYygpO1xuICAgICAgXG4gICAgICBhd2FpdCByZXN1bHRQcm9taXNlO1xuXG4gICAgICBleHBlY3QoZHluYW1vTW9jaykudG9IYXZlUmVjZWl2ZWRDb21tYW5kV2l0aChQdXRDb21tYW5kLCB7XG4gICAgICAgIFRhYmxlTmFtZTogJ3Rlc3Qtd2ViaG9vay1wcm9jZXNzaW5nLXRhYmxlJyxcbiAgICAgICAgSXRlbTogZXhwZWN0Lm9iamVjdENvbnRhaW5pbmcoe1xuICAgICAgICAgIHNlc3Npb25JZDogbW9ja1Nlc3Npb25JZCxcbiAgICAgICAgICBldmVudElkOiBtb2NrRXZlbnRJZCxcbiAgICAgICAgICBzdGF0dXM6ICdmYWlsZWQnLFxuICAgICAgICAgIGVycm9yOiBlcnJvck1lc3NhZ2UsXG4gICAgICAgICAgcHJvY2Vzc2VkQXQ6IGV4cGVjdC5hbnkoU3RyaW5nKSxcbiAgICAgICAgfSksXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgY29udGludWUgcHJvY2Vzc2luZyBldmVuIGlmIHJlY29yZGluZyBmYWlscycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHN0cmlwZUV2ZW50ID0gY3JlYXRlU3RyaXBlRXZlbnQoKTtcbiAgICAgIG1vY2tDb25zdHJ1Y3RFdmVudC5tb2NrUmV0dXJuVmFsdWUoc3RyaXBlRXZlbnQpO1xuICAgICAgZHluYW1vTW9jay5vbihHZXRDb21tYW5kKS5yZXNvbHZlcyh7IEl0ZW06IHVuZGVmaW5lZCB9KTtcblxuICAgICAgY29uc3QgcmVhZGluZ0lkID0gJ3JlYWRpbmctcmVjb3JkLWZhaWwnO1xuICAgICAgbGFtYmRhTW9jay5vbihJbnZva2VDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIFN0YXR1c0NvZGU6IDIwMCxcbiAgICAgICAgUGF5bG9hZDogbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKFxuICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgcmVhZGluZ0lkIH0pLFxuICAgICAgICAgIH0pLFxuICAgICAgICApIGFzIGFueSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBNb2NrIHJlY29yZGluZyBmYWlsdXJlXG4gICAgICBkeW5hbW9Nb2NrLm9uKFB1dENvbW1hbmQpLnJlamVjdHMobmV3IEVycm9yKCdEeW5hbW9EQiB3cml0ZSBlcnJvcicpKTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoKTtcbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIC8vIFNob3VsZCBzdGlsbCByZXR1cm4gc3VjY2Vzc1xuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDIwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keS5yZWFkaW5nSWQpLnRvQmUocmVhZGluZ0lkKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ1VuZXhwZWN0ZWQgZXJyb3JzJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgcmV0dXJuIDQwMCBmb3Igc2lnbmF0dXJlIGNvbnN0cnVjdGlvbiBlcnJvcnMnLCBhc3luYyAoKSA9PiB7XG4gICAgICAvLyBNb2NrIGFuIGVycm9yIGR1cmluZyBldmVudCBjb25zdHJ1Y3Rpb24gKG5vdCBzaWduYXR1cmUgdmVyaWZpY2F0aW9uIHNwZWNpZmljKVxuICAgICAgbW9ja0NvbnN0cnVjdEV2ZW50Lm1vY2tJbXBsZW1lbnRhdGlvbigoKSA9PiB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignVW5leHBlY3RlZCBlcnJvcicpO1xuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IGV2ZW50ID0gY3JlYXRlTW9ja0V2ZW50KCk7XG4gICAgICBjb25zdCByZXN1bHQ6IEFQSUdhdGV3YXlQcm94eVJlc3VsdCA9IGF3YWl0IGhhbmRsZXIoZXZlbnQpO1xuXG4gICAgICAvLyBUaGUgZXJyb3IgZ29lcyB0aHJvdWdoIHZlcmlmeVdlYmhvb2tTaWduYXR1cmUgd2hpY2ggdGhyb3dzICdJbnZhbGlkIHdlYmhvb2sgc2lnbmF0dXJlJ1xuICAgICAgZXhwZWN0KHJlc3VsdC5zdGF0dXNDb2RlKS50b0JlKDQwMCk7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShyZXN1bHQuYm9keSk7XG4gICAgICBleHBlY3QoYm9keSkudG9FcXVhbCh7IGVycm9yOiAnSW52YWxpZCBzaWduYXR1cmUnIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gMjAwIGV2ZW4gd2hlbiBpZGVtcG90ZW5jeSBjaGVjayBmYWlscyBidXQgcHJvY2Vzc2luZyBjb250aW51ZXMnLCBhc3luYyAoKSA9PiB7XG4gICAgICAvLyBNb2NrIHN1Y2Nlc3NmdWwgc2lnbmF0dXJlIHZlcmlmaWNhdGlvblxuICAgICAgY29uc3Qgc3RyaXBlRXZlbnQgPSBjcmVhdGVTdHJpcGVFdmVudCgpO1xuICAgICAgbW9ja0NvbnN0cnVjdEV2ZW50Lm1vY2tSZXR1cm5WYWx1ZShzdHJpcGVFdmVudCk7XG5cbiAgICAgIC8vIE1vY2sgaWRlbXBvdGVuY3kgY2hlY2sgdG8gdGhyb3cgZXJyb3IgKGJ1dCBwcm9jZXNzaW5nIGNvbnRpbnVlcylcbiAgICAgIGR5bmFtb01vY2sub24oR2V0Q29tbWFuZCkucmVqZWN0cyhuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgZGF0YWJhc2UgZXJyb3InKSk7XG5cbiAgICAgIC8vIE1vY2sgc3VjY2Vzc2Z1bCBMYW1iZGEgaW52b2NhdGlvblxuICAgICAgY29uc3QgcmVhZGluZ0lkID0gJ3JlYWRpbmctYWZ0ZXItZGItZXJyb3InO1xuICAgICAgbGFtYmRhTW9jay5vbihJbnZva2VDb21tYW5kKS5yZXNvbHZlcyh7XG4gICAgICAgIFN0YXR1c0NvZGU6IDIwMCxcbiAgICAgICAgUGF5bG9hZDogbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKFxuICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgcmVhZGluZ0lkIH0pLFxuICAgICAgICAgIH0pLFxuICAgICAgICApIGFzIGFueSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBNb2NrIHN1Y2Nlc3NmdWwgcmVjb3JkaW5nXG4gICAgICBkeW5hbW9Nb2NrLm9uKFB1dENvbW1hbmQpLnJlc29sdmVzKHt9KTtcblxuICAgICAgY29uc3QgZXZlbnQgPSBjcmVhdGVNb2NrRXZlbnQoKTtcbiAgICAgIGNvbnN0IHJlc3VsdDogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0gYXdhaXQgaGFuZGxlcihldmVudCk7XG5cbiAgICAgIC8vIFNob3VsZCByZXR1cm4gMjAwIGRlc3BpdGUgaWRlbXBvdGVuY3kgY2hlY2sgZXJyb3JcbiAgICAgIGV4cGVjdChyZXN1bHQuc3RhdHVzQ29kZSkudG9CZSgyMDApO1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpO1xuICAgICAgZXhwZWN0KGJvZHkucmVhZGluZ0lkKS50b0JlKHJlYWRpbmdJZCk7XG4gICAgfSk7XG4gIH0pO1xufSk7XG4iXX0=