import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { handler } from '../../lambda/payments/stripe-webhook-handler';
import { mockClient } from 'aws-sdk-client-mock';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import Stripe from 'stripe';
import { TextEncoder } from 'util';

// Mock AWS clients
const ssmMock = mockClient(SSMClient);
const lambdaMock = mockClient(LambdaClient);
const dynamoMock = mockClient(DynamoDBDocumentClient);

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
      .on(GetParameterCommand, {
        Name: '/aura28/test/stripe/api-key',
        WithDecryption: true,
      })
      .resolves({
        Parameter: {
          Value: mockStripeApiKey,
        },
      });

    ssmMock
      .on(GetParameterCommand, {
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

  const createMockEvent = (overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent => {
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
    } as APIGatewayProxyEvent;
  };

  const createStripeEvent = (
    type: string = 'checkout.session.completed',
    overrides: Partial<Stripe.Checkout.Session> = {},
  ): Stripe.Event => {
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
        } as Stripe.Checkout.Session,
      },
      livemode: false,
      pending_webhooks: 1,
      request: {
        id: null,
        idempotency_key: null,
      },
    } as Stripe.Event;
  };

  describe('Webhook signature verification', () => {
    it('should successfully verify a valid webhook signature', async () => {
      const stripeEvent = createStripeEvent();
      mockConstructEvent.mockReturnValue(stripeEvent);

      // Mock idempotency check - event not processed
      dynamoMock.on(GetCommand).resolves({ Item: undefined });

      // Mock successful Lambda invocation
      const readingId = 'reading-123';
      lambdaMock.on(InvokeCommand).resolves({
        StatusCode: 200,
        Payload: new TextEncoder().encode(
          JSON.stringify({
            statusCode: 200,
            body: JSON.stringify({ readingId }),
          }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ) as any,
      });

      // Mock recording processed event
      dynamoMock.on(PutCommand).resolves({});

      const event = createMockEvent();
      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body).toEqual({
        received: true,
        success: true,
        readingId,
      });

      expect(mockConstructEvent).toHaveBeenCalledWith(
        expect.any(String),
        'test-signature',
        mockWebhookSecret,
      );
    });

    it('should reject request with invalid signature', async () => {
      mockConstructEvent.mockImplementation(() => {
        throw new Error('Invalid webhook signature');
      });

      const event = createMockEvent();
      const result: APIGatewayProxyResult = await handler(event);

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

      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body).toEqual({ error: 'Missing signature header' });
    });

    it('should handle signature header with different casing', async () => {
      const stripeEvent = createStripeEvent();
      mockConstructEvent.mockReturnValue(stripeEvent);
      dynamoMock.on(GetCommand).resolves({ Item: undefined });
      lambdaMock.on(InvokeCommand).resolves({
        StatusCode: 200,
        Payload: new TextEncoder().encode(
          JSON.stringify({
            statusCode: 200,
            body: JSON.stringify({ readingId: 'reading-123' }),
          }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ) as any,
      });
      dynamoMock.on(PutCommand).resolves({});

      const event = createMockEvent({
        headers: {
          'content-type': 'application/json',
          'Stripe-Signature': 'test-signature', // Capital case
        },
      });

      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(mockConstructEvent).toHaveBeenCalled();
    });

    it('should reject request with missing body', async () => {
      const event = createMockEvent({
        body: null,
      });

      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body).toEqual({ error: 'Missing request body' });
    });
  });

  describe('Event processing for checkout.session.completed', () => {
    it('should process a successful checkout session', async () => {
      const stripeEvent = createStripeEvent();
      mockConstructEvent.mockReturnValue(stripeEvent);
      dynamoMock.on(GetCommand).resolves({ Item: undefined });

      const readingId = 'reading-456';
      lambdaMock.on(InvokeCommand).resolves({
        StatusCode: 200,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Payload: new TextEncoder().encode(
          JSON.stringify({
            statusCode: 200,
            body: JSON.stringify({ readingId }),
          }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ) as any,
      });
      dynamoMock.on(PutCommand).resolves({});

      const event = createMockEvent();
      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.readingId).toBe(readingId);

      // Verify Lambda was invoked with correct parameters
      expect(lambdaMock).toHaveReceivedCommandWith(InvokeCommand, {
        FunctionName: 'test-generate-reading-function',
        InvocationType: 'RequestResponse',
        Payload: expect.stringContaining(mockUserId),
      });

      // Verify the payload structure
      const invokeCall = lambdaMock.commandCalls(InvokeCommand)[0];
      const payload = JSON.parse(invokeCall.args[0].input.Payload as string);
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
      dynamoMock.on(GetCommand).resolves({ Item: undefined });
      dynamoMock.on(PutCommand).resolves({});

      const event = createMockEvent();
      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body).toEqual({
        received: true,
        success: false,
      });

      // Verify Lambda was not invoked
      expect(lambdaMock).not.toHaveReceivedCommand(InvokeCommand);
    });

    it('should handle missing userId in session', async () => {
      const stripeEvent = createStripeEvent('checkout.session.completed', {
        client_reference_id: null,
        metadata: {},
      });
      mockConstructEvent.mockReturnValue(stripeEvent);
      dynamoMock.on(GetCommand).resolves({ Item: undefined });
      dynamoMock.on(PutCommand).resolves({});

      const event = createMockEvent();
      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body).toEqual({
        received: true,
        success: false,
      });

      // Verify Lambda was not invoked
      expect(lambdaMock).not.toHaveReceivedCommand(InvokeCommand);
    });

    it('should extract userId from metadata if client_reference_id is missing', async () => {
      const stripeEvent = createStripeEvent('checkout.session.completed', {
        client_reference_id: null,
        metadata: { userId: mockUserId },
      });
      mockConstructEvent.mockReturnValue(stripeEvent);
      dynamoMock.on(GetCommand).resolves({ Item: undefined });

      const readingId = 'reading-789';
      lambdaMock.on(InvokeCommand).resolves({
        StatusCode: 200,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Payload: new TextEncoder().encode(
          JSON.stringify({
            statusCode: 200,
            body: JSON.stringify({ readingId }),
          }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ) as any,
      });
      dynamoMock.on(PutCommand).resolves({});

      const event = createMockEvent();
      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.readingId).toBe(readingId);

      // Verify Lambda was invoked with userId from metadata
      const invokeCall = lambdaMock.commandCalls(InvokeCommand)[0];
      const payload = JSON.parse(invokeCall.args[0].input.Payload as string);
      expect(payload.userId).toBe(mockUserId);
    });

    it('should process async payment succeeded events', async () => {
      const stripeEvent = createStripeEvent('checkout.session.async_payment_succeeded');
      mockConstructEvent.mockReturnValue(stripeEvent);
      dynamoMock.on(GetCommand).resolves({ Item: undefined });

      const readingId = 'reading-async';
      lambdaMock.on(InvokeCommand).resolves({
        StatusCode: 200,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Payload: new TextEncoder().encode(
          JSON.stringify({
            statusCode: 200,
            body: JSON.stringify({ readingId }),
          }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ) as any,
      });
      dynamoMock.on(PutCommand).resolves({});

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

      const result: APIGatewayProxyResult = await handler(event);

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
      dynamoMock.on(GetCommand).resolves({
        Item: {
          eventId: mockEventId,
          sessionId: mockSessionId,
          processedAt: '2024-01-01T00:00:00Z',
          status: 'processed',
          readingId: 'existing-reading-123',
        },
      });

      const event = createMockEvent();
      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body).toEqual({
        received: true,
        status: 'already_processed',
      });

      // Verify Lambda was not invoked
      expect(lambdaMock).not.toHaveReceivedCommand(InvokeCommand);

      // Verify no new record was written
      expect(dynamoMock).not.toHaveReceivedCommand(PutCommand);
    });

    it('should continue processing if idempotency check fails', async () => {
      const stripeEvent = createStripeEvent();
      mockConstructEvent.mockReturnValue(stripeEvent);

      // Mock idempotency check failure
      dynamoMock.on(GetCommand).rejects(new Error('DynamoDB error'));

      const readingId = 'reading-after-error';
      lambdaMock.on(InvokeCommand).resolves({
        StatusCode: 200,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Payload: new TextEncoder().encode(
          JSON.stringify({
            statusCode: 200,
            body: JSON.stringify({ readingId }),
          }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ) as any,
      });
      dynamoMock.on(PutCommand).resolves({});

      const event = createMockEvent();
      const result: APIGatewayProxyResult = await handler(event);

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
      lambdaMock.on(InvokeCommand).resolves({
        StatusCode: 200,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Payload: new TextEncoder().encode(
          JSON.stringify({
            statusCode: 200,
            body: JSON.stringify({ readingId }),
          }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ) as any,
      });

      const event = createMockEvent();
      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.readingId).toBe(readingId);

      // Verify no DynamoDB operations were attempted
      expect(dynamoMock).not.toHaveReceivedCommand(GetCommand);
      expect(dynamoMock).not.toHaveReceivedCommand(PutCommand);
    });
  });

  describe('Error handling', () => {
    it('should handle Lambda invocation failure', async () => {
      const stripeEvent = createStripeEvent();
      mockConstructEvent.mockReturnValue(stripeEvent);
      dynamoMock.on(GetCommand).resolves({ Item: undefined });

      // Mock Lambda invocation failure
      lambdaMock.on(InvokeCommand).resolves({
        StatusCode: 500,
      });
      dynamoMock.on(PutCommand).resolves({});

      const event = createMockEvent();
      const resultPromise = handler(event);

      // Advance timers to handle all retries
      await jest.runAllTimersAsync();

      const result: APIGatewayProxyResult = await resultPromise;

      expect(result.statusCode).toBe(200); // Still return 200 to Stripe
      const body = JSON.parse(result.body);
      expect(body).toEqual({
        received: true,
        success: false,
      });

      // Verify failure was recorded
      expect(dynamoMock).toHaveReceivedCommandWith(PutCommand, {
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
      dynamoMock.on(GetCommand).resolves({ Item: undefined });

      // Mock Lambda function error
      lambdaMock.on(InvokeCommand).resolves({
        StatusCode: 200,
        FunctionError: 'Unhandled',
        Payload: new TextEncoder().encode(
          JSON.stringify({
            errorMessage: 'Function error',
          }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ) as any,
      });
      dynamoMock.on(PutCommand).resolves({});

      const event = createMockEvent();
      const resultPromise = handler(event);

      // Advance timers to handle all retries
      await jest.runAllTimersAsync();

      const result: APIGatewayProxyResult = await resultPromise;

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
      dynamoMock.on(GetCommand).resolves({ Item: undefined });

      // Mock reading generation failure
      lambdaMock.on(InvokeCommand).resolves({
        StatusCode: 200,
        Payload: new TextEncoder().encode(
          JSON.stringify({
            statusCode: 400,
            body: 'User profile not found',
          }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ) as any,
      });
      dynamoMock.on(PutCommand).resolves({});

      const event = createMockEvent();
      const resultPromise = handler(event);

      // Advance timers to handle all retries
      await jest.runAllTimersAsync();

      const result: APIGatewayProxyResult = await resultPromise;

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
      dynamoMock.on(GetCommand).resolves({ Item: undefined });

      // Mock Lambda client error
      lambdaMock.on(InvokeCommand).rejects(new Error('Lambda service error'));
      dynamoMock.on(PutCommand).resolves({});

      const event = createMockEvent();
      const resultPromise = handler(event);

      // Advance timers to handle all retries
      await jest.runAllTimersAsync();

      const result: APIGatewayProxyResult = await resultPromise;

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
      dynamoMock.on(GetCommand).resolves({ Item: undefined });
      dynamoMock.on(PutCommand).resolves({});

      const event = createMockEvent();
      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body).toEqual({
        received: true,
        success: false,
      });
    });

    it('should handle SSM parameter retrieval failure for API key', async () => {
      ssmMock
        .on(GetParameterCommand, {
          Name: '/aura28/test/stripe/api-key',
          WithDecryption: true,
        })
        .rejects(new Error('Parameter not found'));

      const event = createMockEvent();
      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body).toEqual({ error: 'Internal server error' });
    });

    it('should handle SSM parameter retrieval failure for webhook secret', async () => {
      ssmMock
        .on(GetParameterCommand, {
          Name: '/aura28/test/stripe/webhook-secret',
          WithDecryption: true,
        })
        .rejects(new Error('Parameter not found'));

      const event = createMockEvent();
      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body).toEqual({ error: 'Internal server error' });
    });

    it('should handle empty SSM parameter values', async () => {
      ssmMock
        .on(GetParameterCommand, {
          Name: '/aura28/test/stripe/webhook-secret',
          WithDecryption: true,
        })
        .resolves({
          Parameter: {
            Value: '',
          },
        });

      const event = createMockEvent();
      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body).toEqual({ error: 'Internal server error' });
    });
  });

  describe('Unhandled event types', () => {
    it('should gracefully handle unhandled event types', async () => {
      const stripeEvent = createStripeEvent('payment_intent.succeeded');
      mockConstructEvent.mockReturnValue(stripeEvent);
      dynamoMock.on(GetCommand).resolves({ Item: undefined });
      dynamoMock.on(PutCommand).resolves({});

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

      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body).toEqual({
        received: true,
        success: false,
      });

      // Verify event was recorded as failed
      expect(dynamoMock).toHaveReceivedCommandWith(PutCommand, {
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
      dynamoMock.on(GetCommand).resolves({ Item: undefined });

      const readingId = 'reading-base64';
      lambdaMock.on(InvokeCommand).resolves({
        StatusCode: 200,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Payload: new TextEncoder().encode(
          JSON.stringify({
            statusCode: 200,
            body: JSON.stringify({ readingId }),
          }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ) as any,
      });
      dynamoMock.on(PutCommand).resolves({});

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

      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.readingId).toBe(readingId);
    });

    it('should handle API Gateway custom template format', async () => {
      const stripeEvent = createStripeEvent();
      mockConstructEvent.mockReturnValue(stripeEvent);
      dynamoMock.on(GetCommand).resolves({ Item: undefined });

      const readingId = 'reading-template';
      lambdaMock.on(InvokeCommand).resolves({
        StatusCode: 200,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Payload: new TextEncoder().encode(
          JSON.stringify({
            statusCode: 200,
            body: JSON.stringify({ readingId }),
          }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ) as any,
      });
      dynamoMock.on(PutCommand).resolves({});

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

      const result: APIGatewayProxyResult = await handler(event);

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
      dynamoMock.on(GetCommand).resolves({ Item: undefined });

      const readingId = 'reading-metadata';
      lambdaMock.on(InvokeCommand).resolves({
        StatusCode: 200,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Payload: new TextEncoder().encode(
          JSON.stringify({
            statusCode: 200,
            body: JSON.stringify({ readingId }),
          }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ) as any,
      });
      dynamoMock.on(PutCommand).resolves({});

      const event = createMockEvent();
      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(200);

      // Verify metadata was passed to Lambda
      const invokeCall = lambdaMock.commandCalls(InvokeCommand)[0];
      const payload = JSON.parse(invokeCall.args[0].input.Payload as string);
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
      dynamoMock.on(GetCommand).resolves({ Item: undefined });

      const readingId = 'reading-null-values';
      lambdaMock.on(InvokeCommand).resolves({
        StatusCode: 200,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Payload: new TextEncoder().encode(
          JSON.stringify({
            statusCode: 200,
            body: JSON.stringify({ readingId }),
          }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ) as any,
      });
      dynamoMock.on(PutCommand).resolves({});

      const event = createMockEvent();
      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(200);

      // Verify null values were filtered out
      const invokeCall = lambdaMock.commandCalls(InvokeCommand)[0];
      const payload = JSON.parse(invokeCall.args[0].input.Payload as string);
      expect(payload.metadata).not.toHaveProperty('customerEmail');
      expect(payload.metadata).not.toHaveProperty('amountTotal');
      expect(payload.metadata).not.toHaveProperty('currency');
      expect(payload.metadata).not.toHaveProperty('paymentIntentId');
    });

    it('should handle payment_intent as object', async () => {
      const stripeEvent = createStripeEvent('checkout.session.completed', {
        payment_intent: { id: 'pi_test_123' } as unknown as string,
      });
      mockConstructEvent.mockReturnValue(stripeEvent);
      dynamoMock.on(GetCommand).resolves({ Item: undefined });

      const readingId = 'reading-pi-object';
      lambdaMock.on(InvokeCommand).resolves({
        StatusCode: 200,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Payload: new TextEncoder().encode(
          JSON.stringify({
            statusCode: 200,
            body: JSON.stringify({ readingId }),
          }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ) as any,
      });
      dynamoMock.on(PutCommand).resolves({});

      const event = createMockEvent();
      const result: APIGatewayProxyResult = await handler(event);

      expect(result.statusCode).toBe(200);

      // Verify payment_intent object was not included in metadata
      const invokeCall = lambdaMock.commandCalls(InvokeCommand)[0];
      const payload = JSON.parse(invokeCall.args[0].input.Payload as string);
      expect(payload.metadata).not.toHaveProperty('paymentIntentId');
    });
  });

  describe('Recording processed events', () => {
    it('should record successful processing', async () => {
      const stripeEvent = createStripeEvent();
      mockConstructEvent.mockReturnValue(stripeEvent);
      dynamoMock.on(GetCommand).resolves({ Item: undefined });

      const readingId = 'reading-record';
      lambdaMock.on(InvokeCommand).resolves({
        StatusCode: 200,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Payload: new TextEncoder().encode(
          JSON.stringify({
            statusCode: 200,
            body: JSON.stringify({ readingId }),
          }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ) as any,
      });
      dynamoMock.on(PutCommand).resolves({});

      const event = createMockEvent();
      await handler(event);

      expect(dynamoMock).toHaveReceivedCommandWith(PutCommand, {
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
      dynamoMock.on(GetCommand).resolves({ Item: undefined });

      const errorMessage = 'Lambda invocation failed';
      lambdaMock.on(InvokeCommand).rejects(new Error(errorMessage));
      dynamoMock.on(PutCommand).resolves({});

      const event = createMockEvent();
      const resultPromise = handler(event);

      // Advance timers to handle all retries
      await jest.runAllTimersAsync();

      await resultPromise;

      expect(dynamoMock).toHaveReceivedCommandWith(PutCommand, {
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
      dynamoMock.on(GetCommand).resolves({ Item: undefined });

      const readingId = 'reading-record-fail';
      lambdaMock.on(InvokeCommand).resolves({
        StatusCode: 200,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Payload: new TextEncoder().encode(
          JSON.stringify({
            statusCode: 200,
            body: JSON.stringify({ readingId }),
          }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ) as any,
      });

      // Mock recording failure
      dynamoMock.on(PutCommand).rejects(new Error('DynamoDB write error'));

      const event = createMockEvent();
      const result: APIGatewayProxyResult = await handler(event);

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
      const result: APIGatewayProxyResult = await handler(event);

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
      dynamoMock.on(GetCommand).rejects(new Error('Unexpected database error'));

      // Mock successful Lambda invocation
      const readingId = 'reading-after-db-error';
      lambdaMock.on(InvokeCommand).resolves({
        StatusCode: 200,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Payload: new TextEncoder().encode(
          JSON.stringify({
            statusCode: 200,
            body: JSON.stringify({ readingId }),
          }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ) as any,
      });

      // Mock successful recording
      dynamoMock.on(PutCommand).resolves({});

      const event = createMockEvent();
      const result: APIGatewayProxyResult = await handler(event);

      // Should return 200 despite idempotency check error
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.readingId).toBe(readingId);
    });
  });
});
