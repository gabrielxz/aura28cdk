import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import Stripe from 'stripe';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

const ssmClient = new SSMClient({});
const lambdaClient = new LambdaClient({});
const dynamoClient = new DynamoDBClient({});
const dynamoDoc = DynamoDBDocumentClient.from(dynamoClient);
const cloudWatchClient = new CloudWatchClient({});

let stripeClient: Stripe | null = null;
let webhookSecret: string | null = null;

// Cache the Stripe client and webhook secret across Lambda invocations
async function getStripeClient(): Promise<Stripe> {
  if (stripeClient) return stripeClient;

  try {
    const apiKeyParam = await ssmClient.send(
      new GetParameterCommand({
        Name: process.env.STRIPE_API_KEY_PARAMETER_NAME,
        WithDecryption: true,
      }),
    );

    if (!apiKeyParam.Parameter?.Value) {
      throw new Error('Stripe API key not found in SSM');
    }

    stripeClient = new Stripe(apiKeyParam.Parameter.Value, {
      apiVersion: '2025-07-30.basil',
      typescript: true,
    });

    return stripeClient;
  } catch (error) {
    console.error('Error fetching Stripe API key:', error);
    throw new Error('Failed to initialize Stripe client');
  }
}

async function getWebhookSecret(): Promise<string> {
  if (webhookSecret) return webhookSecret;

  try {
    const secretParam = await ssmClient.send(
      new GetParameterCommand({
        Name: process.env.STRIPE_WEBHOOK_SECRET_PARAMETER_NAME,
        WithDecryption: true,
      }),
    );

    if (!secretParam.Parameter?.Value) {
      throw new Error('Stripe webhook secret not found in SSM');
    }

    webhookSecret = secretParam.Parameter.Value;
    return webhookSecret;
  } catch (error) {
    console.error('Error fetching webhook secret:', error);
    throw new Error('Failed to retrieve webhook secret');
  }
}

interface ProcessingResult {
  success: boolean;
  readingId?: string;
  error?: string;
}

interface WebhookProcessingRecord {
  sessionId: string;
  eventId: string;
  processedAt: string;
  readingId?: string;
  status: 'processed' | 'failed' | 'skipped';
  error?: string;
}

// Check if we've already processed this event (idempotency)
async function checkIdempotency(eventId: string): Promise<boolean> {
  if (!process.env.WEBHOOK_PROCESSING_TABLE_NAME) {
    console.warn('WEBHOOK_PROCESSING_TABLE_NAME not configured, skipping idempotency check');
    return false;
  }

  try {
    const result = await dynamoDoc.send(
      new GetCommand({
        TableName: process.env.WEBHOOK_PROCESSING_TABLE_NAME,
        Key: {
          eventId,
        },
      }),
    );

    if (result.Item) {
      console.info('Event already processed:', {
        eventId,
        processedAt: result.Item.processedAt,
        status: result.Item.status,
      });
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error checking idempotency:', error);
    // In case of error, proceed with processing to avoid blocking
    return false;
  }
}

// Record that we've processed this event
async function recordProcessedEvent(
  eventId: string,
  sessionId: string,
  status: 'processed' | 'failed' | 'skipped',
  readingId?: string,
  error?: string,
): Promise<void> {
  if (!process.env.WEBHOOK_PROCESSING_TABLE_NAME) {
    console.warn('WEBHOOK_PROCESSING_TABLE_NAME not configured, skipping recording');
    return;
  }

  try {
    const record: WebhookProcessingRecord = {
      sessionId,
      eventId,
      processedAt: new Date().toISOString(),
      status,
      ...(readingId && { readingId }),
      ...(error && { error }),
    };

    await dynamoDoc.send(
      new PutCommand({
        TableName: process.env.WEBHOOK_PROCESSING_TABLE_NAME,
        Item: record,
      }),
    );

    console.info('Recorded processed event:', {
      eventId,
      sessionId,
      status,
      readingId,
    });
  } catch (error) {
    console.error('Error recording processed event:', error);
    // Don't throw - this is not critical for webhook processing
  }
}

// Helper function for exponential backoff
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Helper function to emit CloudWatch metrics
async function emitMetric(
  metricName: string,
  value: number,
  unit: 'Count' | 'Seconds' = 'Count',
  dimensions?: { Name: string; Value: string }[],
): Promise<void> {
  try {
    const environment = process.env.AWS_LAMBDA_FUNCTION_NAME?.includes('-prod-') ? 'prod' : 'dev';
    await cloudWatchClient.send(
      new PutMetricDataCommand({
        Namespace: 'Aura28/Webhooks',
        MetricData: [
          {
            MetricName: metricName,
            Value: value,
            Unit: unit,
            Timestamp: new Date(),
            Dimensions: [{ Name: 'Environment', Value: environment }, ...(dimensions || [])],
          },
        ],
      }),
    );
  } catch (error) {
    console.error('Failed to emit CloudWatch metric:', error);
    // Don't throw - metrics are best-effort
  }
}

// Invoke the reading generation Lambda with retry logic
async function invokeReadingGeneration(
  userId: string,
  metadata: Record<string, string | number | boolean>,
): Promise<string> {
  if (!process.env.GENERATE_READING_FUNCTION_NAME) {
    throw new Error('GENERATE_READING_FUNCTION_NAME environment variable not set');
  }

  const payload = {
    source: 'webhook',
    userId,
    internalSecret: process.env.INTERNAL_INVOCATION_SECRET,
    metadata,
    requestContext: {
      authorizer: {
        claims: {
          sub: userId, // Pass the userId as the authenticated user
        },
      },
    },
  };

  console.info('Invoking reading generation Lambda:', {
    functionName: process.env.GENERATE_READING_FUNCTION_NAME,
    userId,
    metadata,
  });

  // Retry configuration
  const MAX_RETRIES = 3;
  const BASE_DELAY_MS = 1000; // Start with 1 second
  const MAX_DELAY_MS = 10000; // Cap at 10 seconds

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await lambdaClient.send(
        new InvokeCommand({
          FunctionName: process.env.GENERATE_READING_FUNCTION_NAME,
          InvocationType: 'RequestResponse',
          Payload: JSON.stringify(payload),
        }),
      );

      if (response.StatusCode !== 200) {
        throw new Error(`Lambda invocation failed with status: ${response.StatusCode}`);
      }

      if (response.FunctionError) {
        const errorPayload = response.Payload
          ? JSON.parse(new TextDecoder().decode(response.Payload))
          : {};
        throw new Error(
          `Lambda function error: ${response.FunctionError} - ${JSON.stringify(errorPayload)}`,
        );
      }

      const result = response.Payload ? JSON.parse(new TextDecoder().decode(response.Payload)) : {};

      if (result.statusCode !== 200) {
        throw new Error(`Reading generation failed: ${result.body || 'Unknown error'}`);
      }

      const body = typeof result.body === 'string' ? JSON.parse(result.body) : result.body;
      console.info('Reading generation successful:', {
        userId,
        readingId: body.readingId,
        attempt: attempt + 1,
      });

      return body.readingId;
    } catch (error) {
      lastError = error as Error;
      console.error(`Reading generation attempt ${attempt + 1} failed:`, error);

      if (attempt < MAX_RETRIES) {
        // Calculate exponential backoff with jitter
        const delay = Math.min(
          BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 1000,
          MAX_DELAY_MS,
        );
        console.info(`Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }

  // All retries failed
  console.error('All reading generation attempts failed:', lastError);
  throw lastError || new Error('Failed to generate reading after multiple attempts');
}

// Process a checkout.session.completed event
async function processCheckoutSession(session: Stripe.Checkout.Session): Promise<ProcessingResult> {
  try {
    // Extract userId from client_reference_id or metadata
    const userId = session.client_reference_id || session.metadata?.userId;

    if (!userId) {
      console.error('No userId found in session:', {
        sessionId: session.id,
        client_reference_id: session.client_reference_id,
        metadata: session.metadata,
      });
      return {
        success: false,
        error: 'No userId found in checkout session',
      };
    }

    // Check payment status
    if (session.payment_status !== 'paid') {
      console.info('Session not paid, skipping reading generation:', {
        sessionId: session.id,
        payment_status: session.payment_status,
        userId,
      });
      return {
        success: false,
        error: `Payment status is ${session.payment_status}, not paid`,
      };
    }

    // Extract metadata for the reading, filtering out null values
    const metadata: Record<string, string | number | boolean> = {
      sessionId: session.id,
      ...(session.customer_email && { customerEmail: session.customer_email }),
      ...(session.amount_total !== null && { amountTotal: session.amount_total }),
      ...(session.currency && { currency: session.currency }),
      ...(typeof session.payment_intent === 'string' && {
        paymentIntentId: session.payment_intent,
      }),
      ...(session.metadata || {}),
    };

    // Invoke reading generation
    const startTime = Date.now();
    const readingId = await invokeReadingGeneration(userId, metadata);
    const generationTime = (Date.now() - startTime) / 1000;

    // Emit success metrics
    await emitMetric('ReadingGenerationSuccess', 1);
    await emitMetric('ReadingGenerationTime', generationTime, 'Seconds');

    return {
      success: true,
      readingId,
    };
  } catch (error) {
    console.error('Error processing checkout session:', error);
    await emitMetric('ReadingGenerationFailure', 1);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Verify webhook signature
async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): Promise<Stripe.Event> {
  const stripe = await getStripeClient();

  try {
    const event = stripe.webhooks.constructEvent(payload, signature, secret);
    return event;
  } catch (error) {
    console.error('Webhook signature verification failed:', error);
    throw new Error('Invalid webhook signature');
  }
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.info('Webhook received:', {
    path: event.path,
    headers: {
      'stripe-signature': event.headers?.['stripe-signature'] ? '[PRESENT]' : '[MISSING]',
      'content-type': event.headers?.['content-type'],
    },
    bodyLength: event.body?.length,
    isBase64Encoded: event.isBase64Encoded,
  });

  try {
    // Handle both direct invocation and API Gateway invocation
    let rawBody: string;
    let signature: string | undefined;

    // Check if this is coming from API Gateway with custom template
    if (event.headers && typeof event.body === 'string') {
      // Try to parse as JSON first (from API Gateway template)
      try {
        const parsed = JSON.parse(event.body);
        if (parsed.body && parsed.headers) {
          // This is from our API Gateway template
          rawBody = Buffer.from(parsed.body, 'base64').toString('utf-8');
          signature = parsed.headers['stripe-signature'] || parsed.headers['Stripe-Signature'];
        } else {
          // Direct body
          rawBody = event.body;
          signature = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];
        }
      } catch {
        // Not JSON, treat as raw body
        rawBody = event.isBase64Encoded
          ? Buffer.from(event.body, 'base64').toString('utf-8')
          : event.body;
        signature = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];
      }
    } else {
      // Fallback for direct invocation
      rawBody = event.body || '';
      signature = event.headers?.['stripe-signature'] || event.headers?.['Stripe-Signature'];
    }

    if (!signature) {
      console.error('Missing Stripe signature header');
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'Missing signature header' }),
      };
    }

    if (!rawBody) {
      console.error('Missing request body');
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'Missing request body' }),
      };
    }

    // Get webhook secret
    const secret = await getWebhookSecret();

    // Verify signature and construct event
    const stripeEvent = await verifyWebhookSignature(rawBody, signature, secret);

    console.info('Webhook event verified:', {
      id: stripeEvent.id,
      type: stripeEvent.type,
      created: stripeEvent.created,
    });

    // Check idempotency
    const alreadyProcessed = await checkIdempotency(stripeEvent.id);
    if (alreadyProcessed) {
      await emitMetric('WebhookDuplicate', 1);
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ received: true, status: 'already_processed' }),
      };
    }

    // Handle different event types
    let result: ProcessingResult = { success: false, error: 'Unhandled event type' };
    const processingStartTime = Date.now();

    switch (stripeEvent.type) {
      case 'checkout.session.completed':
        const session = stripeEvent.data.object as Stripe.Checkout.Session;
        console.info('Processing checkout.session.completed:', {
          sessionId: session.id,
          payment_status: session.payment_status,
          userId: session.client_reference_id || session.metadata?.userId,
        });
        result = await processCheckoutSession(session);
        break;

      case 'checkout.session.async_payment_succeeded':
        // Handle delayed payments (e.g., bank transfers)
        const asyncSession = stripeEvent.data.object as Stripe.Checkout.Session;
        console.info('Processing checkout.session.async_payment_succeeded:', {
          sessionId: asyncSession.id,
          userId: asyncSession.client_reference_id || asyncSession.metadata?.userId,
        });
        result = await processCheckoutSession(asyncSession);
        break;

      default:
        console.info('Unhandled event type:', stripeEvent.type);
        result = { success: false, error: `Unhandled event type: ${stripeEvent.type}` };
    }

    // Record the processed event
    const sessionId = stripeEvent.type.startsWith('checkout.session.')
      ? (stripeEvent.data.object as Stripe.Checkout.Session).id
      : 'unknown';

    await recordProcessedEvent(
      stripeEvent.id,
      sessionId,
      result.success ? 'processed' : 'failed',
      result.readingId,
      result.error,
    ).catch((error) => {
      console.error('Failed to record processed event:', error);
      emitMetric('IdempotencyRecordFailure', 1).catch(() => {});
    });

    // Emit processing metrics
    const processingTime = (Date.now() - processingStartTime) / 1000;
    await emitMetric('WebhookProcessed', 1, 'Count', [
      { Name: 'EventType', Value: stripeEvent.type },
      { Name: 'Success', Value: result.success ? 'true' : 'false' },
    ]);
    await emitMetric('WebhookProcessingTime', processingTime, 'Seconds');

    // Return success response to Stripe
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        received: true,
        success: result.success,
        ...(result.readingId && { readingId: result.readingId }),
      }),
    };
  } catch (error) {
    console.error('Webhook processing error:', error);

    // Check if it's a signature verification error
    if (error instanceof Error && error.message === 'Invalid webhook signature') {
      await emitMetric('WebhookInvalidSignature', 1);
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'Invalid signature' }),
      };
    }

    await emitMetric('WebhookError', 1);

    // For other errors, return 500 so Stripe will retry
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
