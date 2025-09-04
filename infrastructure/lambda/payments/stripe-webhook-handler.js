"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const stripe_1 = __importDefault(require("stripe"));
const client_ssm_1 = require("@aws-sdk/client-ssm");
const client_lambda_1 = require("@aws-sdk/client-lambda");
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const client_cloudwatch_1 = require("@aws-sdk/client-cloudwatch");
const ssmClient = new client_ssm_1.SSMClient({});
const lambdaClient = new client_lambda_1.LambdaClient({});
const dynamoClient = new client_dynamodb_1.DynamoDBClient({});
const dynamoDoc = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
const cloudWatchClient = new client_cloudwatch_1.CloudWatchClient({});
let stripeClient = null;
let webhookSecret = null;
// Cache the Stripe client and webhook secret across Lambda invocations
async function getStripeClient() {
    if (stripeClient)
        return stripeClient;
    try {
        const apiKeyParam = await ssmClient.send(new client_ssm_1.GetParameterCommand({
            Name: process.env.STRIPE_API_KEY_PARAMETER_NAME,
            WithDecryption: true,
        }));
        if (!apiKeyParam.Parameter?.Value) {
            throw new Error('Stripe API key not found in SSM');
        }
        stripeClient = new stripe_1.default(apiKeyParam.Parameter.Value, {
            apiVersion: '2025-07-30.basil',
            typescript: true,
        });
        return stripeClient;
    }
    catch (error) {
        console.error('Error fetching Stripe API key:', error);
        throw new Error('Failed to initialize Stripe client');
    }
}
async function getWebhookSecret() {
    if (webhookSecret)
        return webhookSecret;
    try {
        const secretParam = await ssmClient.send(new client_ssm_1.GetParameterCommand({
            Name: process.env.STRIPE_WEBHOOK_SECRET_PARAMETER_NAME,
            WithDecryption: true,
        }));
        if (!secretParam.Parameter?.Value) {
            throw new Error('Stripe webhook secret not found in SSM');
        }
        webhookSecret = secretParam.Parameter.Value;
        return webhookSecret;
    }
    catch (error) {
        console.error('Error fetching webhook secret:', error);
        throw new Error('Failed to retrieve webhook secret');
    }
}
// Check if we've already processed this event (idempotency)
async function checkIdempotency(eventId) {
    if (!process.env.WEBHOOK_PROCESSING_TABLE_NAME) {
        console.warn('WEBHOOK_PROCESSING_TABLE_NAME not configured, skipping idempotency check');
        return false;
    }
    try {
        const result = await dynamoDoc.send(new lib_dynamodb_1.GetCommand({
            TableName: process.env.WEBHOOK_PROCESSING_TABLE_NAME,
            Key: {
                eventId,
            },
        }));
        if (result.Item) {
            console.info('Event already processed:', {
                eventId,
                processedAt: result.Item.processedAt,
                status: result.Item.status,
            });
            return true;
        }
        return false;
    }
    catch (error) {
        console.error('Error checking idempotency:', error);
        // In case of error, proceed with processing to avoid blocking
        return false;
    }
}
// Record that we've processed this event
async function recordProcessedEvent(eventId, sessionId, status, readingId, error) {
    if (!process.env.WEBHOOK_PROCESSING_TABLE_NAME) {
        console.warn('WEBHOOK_PROCESSING_TABLE_NAME not configured, skipping recording');
        return;
    }
    try {
        const record = {
            sessionId,
            eventId,
            processedAt: new Date().toISOString(),
            status,
            ...(readingId && { readingId }),
            ...(error && { error }),
        };
        await dynamoDoc.send(new lib_dynamodb_1.PutCommand({
            TableName: process.env.WEBHOOK_PROCESSING_TABLE_NAME,
            Item: record,
        }));
        console.info('Recorded processed event:', {
            eventId,
            sessionId,
            status,
            readingId,
        });
    }
    catch (error) {
        console.error('Error recording processed event:', error);
        // Don't throw - this is not critical for webhook processing
    }
}
// Helper function for exponential backoff
async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
// Helper function to emit CloudWatch metrics
async function emitMetric(metricName, value, unit = 'Count', dimensions) {
    try {
        const environment = process.env.AWS_LAMBDA_FUNCTION_NAME?.includes('-prod-') ? 'prod' : 'dev';
        await cloudWatchClient.send(new client_cloudwatch_1.PutMetricDataCommand({
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
        }));
    }
    catch (error) {
        console.error('Failed to emit CloudWatch metric:', error);
        // Don't throw - metrics are best-effort
    }
}
// Invoke the reading generation Lambda with retry logic
async function invokeReadingGeneration(userId, metadata) {
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
    let lastError;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await lambdaClient.send(new client_lambda_1.InvokeCommand({
                FunctionName: process.env.GENERATE_READING_FUNCTION_NAME,
                InvocationType: 'RequestResponse',
                Payload: JSON.stringify(payload),
            }));
            if (response.StatusCode !== 200) {
                throw new Error(`Lambda invocation failed with status: ${response.StatusCode}`);
            }
            if (response.FunctionError) {
                const errorPayload = response.Payload
                    ? JSON.parse(new TextDecoder().decode(response.Payload))
                    : {};
                throw new Error(`Lambda function error: ${response.FunctionError} - ${JSON.stringify(errorPayload)}`);
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
        }
        catch (error) {
            lastError = error;
            console.error(`Reading generation attempt ${attempt + 1} failed:`, error);
            if (attempt < MAX_RETRIES) {
                // Calculate exponential backoff with jitter
                const delay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 1000, MAX_DELAY_MS);
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
async function processCheckoutSession(session) {
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
        const metadata = {
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
    }
    catch (error) {
        console.error('Error processing checkout session:', error);
        await emitMetric('ReadingGenerationFailure', 1);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
// Verify webhook signature
async function verifyWebhookSignature(payload, signature, secret) {
    const stripe = await getStripeClient();
    try {
        const event = stripe.webhooks.constructEvent(payload, signature, secret);
        return event;
    }
    catch (error) {
        console.error('Webhook signature verification failed:', error);
        throw new Error('Invalid webhook signature');
    }
}
const handler = async (event) => {
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
        let rawBody;
        let signature;
        // Check if this is coming from API Gateway with custom template
        if (event.headers && typeof event.body === 'string') {
            // Try to parse as JSON first (from API Gateway template)
            try {
                const parsed = JSON.parse(event.body);
                if (parsed.body && parsed.headers) {
                    // This is from our API Gateway template
                    rawBody = Buffer.from(parsed.body, 'base64').toString('utf-8');
                    signature = parsed.headers['stripe-signature'] || parsed.headers['Stripe-Signature'];
                }
                else {
                    // Direct body
                    rawBody = event.body;
                    signature = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];
                }
            }
            catch {
                // Not JSON, treat as raw body
                rawBody = event.isBase64Encoded
                    ? Buffer.from(event.body, 'base64').toString('utf-8')
                    : event.body;
                signature = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];
            }
        }
        else {
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
        let result = { success: false, error: 'Unhandled event type' };
        const processingStartTime = Date.now();
        switch (stripeEvent.type) {
            case 'checkout.session.completed':
                const session = stripeEvent.data.object;
                console.info('Processing checkout.session.completed:', {
                    sessionId: session.id,
                    payment_status: session.payment_status,
                    userId: session.client_reference_id || session.metadata?.userId,
                });
                result = await processCheckoutSession(session);
                break;
            case 'checkout.session.async_payment_succeeded':
                // Handle delayed payments (e.g., bank transfers)
                const asyncSession = stripeEvent.data.object;
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
            ? stripeEvent.data.object.id
            : 'unknown';
        await recordProcessedEvent(stripeEvent.id, sessionId, result.success ? 'processed' : 'failed', result.readingId, result.error).catch((error) => {
            console.error('Failed to record processed event:', error);
            emitMetric('IdempotencyRecordFailure', 1).catch(() => { });
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
    }
    catch (error) {
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
exports.handler = handler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RyaXBlLXdlYmhvb2staGFuZGxlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInN0cmlwZS13ZWJob29rLWhhbmRsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQ0Esb0RBQTRCO0FBQzVCLG9EQUFxRTtBQUNyRSwwREFBcUU7QUFDckUsOERBQTBEO0FBQzFELHdEQUF1RjtBQUN2RixrRUFBb0Y7QUFFcEYsTUFBTSxTQUFTLEdBQUcsSUFBSSxzQkFBUyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBQ3BDLE1BQU0sWUFBWSxHQUFHLElBQUksNEJBQVksQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUMxQyxNQUFNLFlBQVksR0FBRyxJQUFJLGdDQUFjLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDNUMsTUFBTSxTQUFTLEdBQUcscUNBQXNCLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO0FBQzVELE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxvQ0FBZ0IsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUVsRCxJQUFJLFlBQVksR0FBa0IsSUFBSSxDQUFDO0FBQ3ZDLElBQUksYUFBYSxHQUFrQixJQUFJLENBQUM7QUFFeEMsdUVBQXVFO0FBQ3ZFLEtBQUssVUFBVSxlQUFlO0lBQzVCLElBQUksWUFBWTtRQUFFLE9BQU8sWUFBWSxDQUFDO0lBRXRDLElBQUksQ0FBQztRQUNILE1BQU0sV0FBVyxHQUFHLE1BQU0sU0FBUyxDQUFDLElBQUksQ0FDdEMsSUFBSSxnQ0FBbUIsQ0FBQztZQUN0QixJQUFJLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyw2QkFBNkI7WUFDL0MsY0FBYyxFQUFFLElBQUk7U0FDckIsQ0FBQyxDQUNILENBQUM7UUFFRixJQUFJLENBQUMsV0FBVyxDQUFDLFNBQVMsRUFBRSxLQUFLLEVBQUUsQ0FBQztZQUNsQyxNQUFNLElBQUksS0FBSyxDQUFDLGlDQUFpQyxDQUFDLENBQUM7UUFDckQsQ0FBQztRQUVELFlBQVksR0FBRyxJQUFJ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QywyQkFBMkIsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUVsRCwrQ0FBK0M7UUFDL0MsSUFBSSxLQUFLLFlBQVksS0FBSyxJQUFJLEtBQUssQ0FBQyxPQUFPLEtBQUssMkJBQTJCLEVBQUUsQ0FBQztZQUM1RSxNQUFNLFVBQVUsQ0FBQyx5QkFBeUIsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUMvQyxPQUFPO2dCQUNMLFVBQVUsRUFBRSxHQUFHO2dCQUNmLE9BQU8sRUFBRTtvQkFDUCxjQUFjLEVBQUUsa0JBQWtCO2lCQUNuQztnQkFDRCxJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssRUFBRSxtQkFBbUIsRUFBRSxDQUFDO2FBQ3JELENBQUM7UUFDSixDQUFDO1FBRUQsTUFBTSxVQUFVLENBQUMsY0FBYyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRXBDLG9EQUFvRDtRQUNwRCxPQUFPO1lBQ0wsVUFBVSxFQUFFLEdBQUc7WUFDZixPQUFPLEVBQUU7Z0JBQ1AsY0FBYyxFQUFFLGtCQUFrQjthQUNuQztZQUNELElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsS0FBSyxFQUFFLHVCQUF1QixFQUFFLENBQUM7U0FDekQsQ0FBQztJQUNKLENBQUM7QUFDSCxDQUFDLENBQUM7QUF0TFcsUUFBQSxPQUFPLFdBc0xsQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEFQSUdhdGV3YXlQcm94eUV2ZW50LCBBUElHYXRld2F5UHJveHlSZXN1bHQgfSBmcm9tICdhd3MtbGFtYmRhJztcbmltcG9ydCBTdHJpcGUgZnJvbSAnc3RyaXBlJztcbmltcG9ydCB7IFNTTUNsaWVudCwgR2V0UGFyYW1ldGVyQ29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zc20nO1xuaW1wb3J0IHsgTGFtYmRhQ2xpZW50LCBJbnZva2VDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LWxhbWJkYSc7XG5pbXBvcnQgeyBEeW5hbW9EQkNsaWVudCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1keW5hbW9kYic7XG5pbXBvcnQgeyBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LCBQdXRDb21tYW5kLCBHZXRDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvbGliLWR5bmFtb2RiJztcbmltcG9ydCB7IENsb3VkV2F0Y2hDbGllbnQsIFB1dE1ldHJpY0RhdGFDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LWNsb3Vkd2F0Y2gnO1xuXG5jb25zdCBzc21DbGllbnQgPSBuZXcgU1NNQ2xpZW50KHt9KTtcbmNvbnN0IGxhbWJkYUNsaWVudCA9IG5ldyBMYW1iZGFDbGllbnQoe30pO1xuY29uc3QgZHluYW1vQ2xpZW50ID0gbmV3IER5bmFtb0RCQ2xpZW50KHt9KTtcbmNvbnN0IGR5bmFtb0RvYyA9IER5bmFtb0RCRG9jdW1lbnRDbGllbnQuZnJvbShkeW5hbW9DbGllbnQpO1xuY29uc3QgY2xvdWRXYXRjaENsaWVudCA9IG5ldyBDbG91ZFdhdGNoQ2xpZW50KHt9KTtcblxubGV0IHN0cmlwZUNsaWVudDogU3RyaXBlIHwgbnVsbCA9IG51bGw7XG5sZXQgd2ViaG9va1NlY3JldDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cbi8vIENhY2hlIHRoZSBTdHJpcGUgY2xpZW50IGFuZCB3ZWJob29rIHNlY3JldCBhY3Jvc3MgTGFtYmRhIGludm9jYXRpb25zXG5hc3luYyBmdW5jdGlvbiBnZXRTdHJpcGVDbGllbnQoKTogUHJvbWlzZTxTdHJpcGU+IHtcbiAgaWYgKHN0cmlwZUNsaWVudCkgcmV0dXJuIHN0cmlwZUNsaWVudDtcblxuICB0cnkge1xuICAgIGNvbnN0IGFwaUtleVBhcmFtID0gYXdhaXQgc3NtQ2xpZW50LnNlbmQoXG4gICAgICBuZXcgR2V0UGFyYW1ldGVyQ29tbWFuZCh7XG4gICAgICAgIE5hbWU6IHByb2Nlc3MuZW52LlNUUklQRV9BUElfS0VZX1BBUkFNRVRFUl9OQU1FLFxuICAgICAgICBXaXRoRGVjcnlwdGlvbjogdHJ1ZSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICBpZiAoIWFwaUtleVBhcmFtLlBhcmFtZXRlcj8uVmFsdWUpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignU3RyaXBlIEFQSSBrZXkgbm90IGZvdW5kIGluIFNTTScpO1xuICAgIH1cblxuICAgIHN0cmlwZUNsaWVudCA9IG5ldyBTdHJpcGUoYXBpS2V5UGFyYW0uUGFyYW1ldGVyLlZhbHVlLCB7XG4gICAgICBhcGlWZXJzaW9uOiAnMjAyNS0wNy0zMC5iYXNpbCcsXG4gICAgICB0eXBlc2NyaXB0OiB0cnVlLFxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHN0cmlwZUNsaWVudDtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBmZXRjaGluZyBTdHJpcGUgQVBJIGtleTonLCBlcnJvcik7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdGYWlsZWQgdG8gaW5pdGlhbGl6ZSBTdHJpcGUgY2xpZW50Jyk7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0V2ViaG9va1NlY3JldCgpOiBQcm9taXNlPHN0cmluZz4ge1xuICBpZiAod2ViaG9va1NlY3JldCkgcmV0dXJuIHdlYmhvb2tTZWNyZXQ7XG5cbiAgdHJ5IHtcbiAgICBjb25zdCBzZWNyZXRQYXJhbSA9IGF3YWl0IHNzbUNsaWVudC5zZW5kKFxuICAgICAgbmV3IEdldFBhcmFtZXRlckNvbW1hbmQoe1xuICAgICAgICBOYW1lOiBwcm9jZXNzLmVudi5TVFJJUEVfV0VCSE9PS19TRUNSRVRfUEFSQU1FVEVSX05BTUUsXG4gICAgICAgIFdpdGhEZWNyeXB0aW9uOiB0cnVlLFxuICAgICAgfSksXG4gICAgKTtcblxuICAgIGlmICghc2VjcmV0UGFyYW0uUGFyYW1ldGVyPy5WYWx1ZSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdTdHJpcGUgd2ViaG9vayBzZWNyZXQgbm90IGZvdW5kIGluIFNTTScpO1xuICAgIH1cblxuICAgIHdlYmhvb2tTZWNyZXQgPSBzZWNyZXRQYXJhbS5QYXJhbWV0ZXIuVmFsdWU7XG4gICAgcmV0dXJuIHdlYmhvb2tTZWNyZXQ7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgZmV0Y2hpbmcgd2ViaG9vayBzZWNyZXQ6JywgZXJyb3IpO1xuICAgIHRocm93IG5ldyBFcnJvcignRmFpbGVkIHRvIHJldHJpZXZlIHdlYmhvb2sgc2VjcmV0Jyk7XG4gIH1cbn1cblxuaW50ZXJmYWNlIFByb2Nlc3NpbmdSZXN1bHQge1xuICBzdWNjZXNzOiBib29sZWFuO1xuICByZWFkaW5nSWQ/OiBzdHJpbmc7XG4gIGVycm9yPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgV2ViaG9va1Byb2Nlc3NpbmdSZWNvcmQge1xuICBzZXNzaW9uSWQ6IHN0cmluZztcbiAgZXZlbnRJZDogc3RyaW5nO1xuICBwcm9jZXNzZWRBdDogc3RyaW5nO1xuICByZWFkaW5nSWQ/OiBzdHJpbmc7XG4gIHN0YXR1czogJ3Byb2Nlc3NlZCcgfCAnZmFpbGVkJyB8ICdza2lwcGVkJztcbiAgZXJyb3I/OiBzdHJpbmc7XG59XG5cbi8vIENoZWNrIGlmIHdlJ3ZlIGFscmVhZHkgcHJvY2Vzc2VkIHRoaXMgZXZlbnQgKGlkZW1wb3RlbmN5KVxuYXN5bmMgZnVuY3Rpb24gY2hlY2tJZGVtcG90ZW5jeShldmVudElkOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgaWYgKCFwcm9jZXNzLmVudi5XRUJIT09LX1BST0NFU1NJTkdfVEFCTEVfTkFNRSkge1xuICAgIGNvbnNvbGUud2FybignV0VCSE9PS19QUk9DRVNTSU5HX1RBQkxFX05BTUUgbm90IGNvbmZpZ3VyZWQsIHNraXBwaW5nIGlkZW1wb3RlbmN5IGNoZWNrJyk7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgdHJ5IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBkeW5hbW9Eb2Muc2VuZChcbiAgICAgIG5ldyBHZXRDb21tYW5kKHtcbiAgICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5XRUJIT09LX1BST0NFU1NJTkdfVEFCTEVfTkFNRSxcbiAgICAgICAgS2V5OiB7XG4gICAgICAgICAgZXZlbnRJZCxcbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICBpZiAocmVzdWx0Lkl0ZW0pIHtcbiAgICAgIGNvbnNvbGUuaW5mbygnRXZlbnQgYWxyZWFkeSBwcm9jZXNzZWQ6Jywge1xuICAgICAgICBldmVudElkLFxuICAgICAgICBwcm9jZXNzZWRBdDogcmVzdWx0Lkl0ZW0ucHJvY2Vzc2VkQXQsXG4gICAgICAgIHN0YXR1czogcmVzdWx0Lkl0ZW0uc3RhdHVzLFxuICAgICAgfSk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICByZXR1cm4gZmFsc2U7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgY2hlY2tpbmcgaWRlbXBvdGVuY3k6JywgZXJyb3IpO1xuICAgIC8vIEluIGNhc2Ugb2YgZXJyb3IsIHByb2NlZWQgd2l0aCBwcm9jZXNzaW5nIHRvIGF2b2lkIGJsb2NraW5nXG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG59XG5cbi8vIFJlY29yZCB0aGF0IHdlJ3ZlIHByb2Nlc3NlZCB0aGlzIGV2ZW50XG5hc3luYyBmdW5jdGlvbiByZWNvcmRQcm9jZXNzZWRFdmVudChcbiAgZXZlbnRJZDogc3RyaW5nLFxuICBzZXNzaW9uSWQ6IHN0cmluZyxcbiAgc3RhdHVzOiAncHJvY2Vzc2VkJyB8ICdmYWlsZWQnIHwgJ3NraXBwZWQnLFxuICByZWFkaW5nSWQ/OiBzdHJpbmcsXG4gIGVycm9yPzogc3RyaW5nLFxuKTogUHJvbWlzZTx2b2lkPiB7XG4gIGlmICghcHJvY2Vzcy5lbnYuV0VCSE9PS19QUk9DRVNTSU5HX1RBQkxFX05BTUUpIHtcbiAgICBjb25zb2xlLndhcm4oJ1dFQkhPT0tfUFJPQ0VTU0lOR19UQUJMRV9OQU1FIG5vdCBjb25maWd1cmVkLCBza2lwcGluZyByZWNvcmRpbmcnKTtcbiAgICByZXR1cm47XG4gIH1cblxuICB0cnkge1xuICAgIGNvbnN0IHJlY29yZDogV2ViaG9va1Byb2Nlc3NpbmdSZWNvcmQgPSB7XG4gICAgICBzZXNzaW9uSWQsXG4gICAgICBldmVudElkLFxuICAgICAgcHJvY2Vzc2VkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgIHN0YXR1cyxcbiAgICAgIC4uLihyZWFkaW5nSWQgJiYgeyByZWFkaW5nSWQgfSksXG4gICAgICAuLi4oZXJyb3IgJiYgeyBlcnJvciB9KSxcbiAgICB9O1xuXG4gICAgYXdhaXQgZHluYW1vRG9jLnNlbmQoXG4gICAgICBuZXcgUHV0Q29tbWFuZCh7XG4gICAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuV0VCSE9PS19QUk9DRVNTSU5HX1RBQkxFX05BTUUsXG4gICAgICAgIEl0ZW06IHJlY29yZCxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICBjb25zb2xlLmluZm8oJ1JlY29yZGVkIHByb2Nlc3NlZCBldmVudDonLCB7XG4gICAgICBldmVudElkLFxuICAgICAgc2Vzc2lvbklkLFxuICAgICAgc3RhdHVzLFxuICAgICAgcmVhZGluZ0lkLFxuICAgIH0pO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHJlY29yZGluZyBwcm9jZXNzZWQgZXZlbnQ6JywgZXJyb3IpO1xuICAgIC8vIERvbid0IHRocm93IC0gdGhpcyBpcyBub3QgY3JpdGljYWwgZm9yIHdlYmhvb2sgcHJvY2Vzc2luZ1xuICB9XG59XG5cbi8vIEhlbHBlciBmdW5jdGlvbiBmb3IgZXhwb25lbnRpYWwgYmFja29mZlxuYXN5bmMgZnVuY3Rpb24gc2xlZXAobXM6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgbXMpKTtcbn1cblxuLy8gSGVscGVyIGZ1bmN0aW9uIHRvIGVtaXQgQ2xvdWRXYXRjaCBtZXRyaWNzXG5hc3luYyBmdW5jdGlvbiBlbWl0TWV0cmljKFxuICBtZXRyaWNOYW1lOiBzdHJpbmcsXG4gIHZhbHVlOiBudW1iZXIsXG4gIHVuaXQ6ICdDb3VudCcgfCAnU2Vjb25kcycgPSAnQ291bnQnLFxuICBkaW1lbnNpb25zPzogeyBOYW1lOiBzdHJpbmc7IFZhbHVlOiBzdHJpbmcgfVtdLFxuKTogUHJvbWlzZTx2b2lkPiB7XG4gIHRyeSB7XG4gICAgY29uc3QgZW52aXJvbm1lbnQgPSBwcm9jZXNzLmVudi5BV1NfTEFNQkRBX0ZVTkNUSU9OX05BTUU/LmluY2x1ZGVzKCctcHJvZC0nKSA/ICdwcm9kJyA6ICdkZXYnO1xuICAgIGF3YWl0IGNsb3VkV2F0Y2hDbGllbnQuc2VuZChcbiAgICAgIG5ldyBQdXRNZXRyaWNEYXRhQ29tbWFuZCh7XG4gICAgICAgIE5hbWVzcGFjZTogJ0F1cmEyOC9XZWJob29rcycsXG4gICAgICAgIE1ldHJpY0RhdGE6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICBNZXRyaWNOYW1lOiBtZXRyaWNOYW1lLFxuICAgICAgICAgICAgVmFsdWU6IHZhbHVlLFxuICAgICAgICAgICAgVW5pdDogdW5pdCxcbiAgICAgICAgICAgIFRpbWVzdGFtcDogbmV3IERhdGUoKSxcbiAgICAgICAgICAgIERpbWVuc2lvbnM6IFt7IE5hbWU6ICdFbnZpcm9ubWVudCcsIFZhbHVlOiBlbnZpcm9ubWVudCB9LCAuLi4oZGltZW5zaW9ucyB8fCBbXSldLFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICB9KSxcbiAgICApO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBlbWl0IENsb3VkV2F0Y2ggbWV0cmljOicsIGVycm9yKTtcbiAgICAvLyBEb24ndCB0aHJvdyAtIG1ldHJpY3MgYXJlIGJlc3QtZWZmb3J0XG4gIH1cbn1cblxuLy8gSW52b2tlIHRoZSByZWFkaW5nIGdlbmVyYXRpb24gTGFtYmRhIHdpdGggcmV0cnkgbG9naWNcbmFzeW5jIGZ1bmN0aW9uIGludm9rZVJlYWRpbmdHZW5lcmF0aW9uKFxuICB1c2VySWQ6IHN0cmluZyxcbiAgbWV0YWRhdGE6IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IG51bWJlciB8IGJvb2xlYW4+LFxuKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgaWYgKCFwcm9jZXNzLmVudi5HRU5FUkFURV9SRUFESU5HX0ZVTkNUSU9OX05BTUUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0dFTkVSQVRFX1JFQURJTkdfRlVOQ1RJT05fTkFNRSBlbnZpcm9ubWVudCB2YXJpYWJsZSBub3Qgc2V0Jyk7XG4gIH1cblxuICBjb25zdCBwYXlsb2FkID0ge1xuICAgIHNvdXJjZTogJ3dlYmhvb2snLFxuICAgIHVzZXJJZCxcbiAgICBpbnRlcm5hbFNlY3JldDogcHJvY2Vzcy5lbnYuSU5URVJOQUxfSU5WT0NBVElPTl9TRUNSRVQsXG4gICAgbWV0YWRhdGEsXG4gICAgcmVxdWVzdENvbnRleHQ6IHtcbiAgICAgIGF1dGhvcml6ZXI6IHtcbiAgICAgICAgY2xhaW1zOiB7XG4gICAgICAgICAgc3ViOiB1c2VySWQsIC8vIFBhc3MgdGhlIHVzZXJJZCBhcyB0aGUgYXV0aGVudGljYXRlZCB1c2VyXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0sXG4gIH07XG5cbiAgY29uc29sZS5pbmZvKCdJbnZva2luZyByZWFkaW5nIGdlbmVyYXRpb24gTGFtYmRhOicsIHtcbiAgICBmdW5jdGlvbk5hbWU6IHByb2Nlc3MuZW52LkdFTkVSQVRFX1JFQURJTkdfRlVOQ1RJT05fTkFNRSxcbiAgICB1c2VySWQsXG4gICAgbWV0YWRhdGEsXG4gIH0pO1xuXG4gIC8vIFJldHJ5IGNvbmZpZ3VyYXRpb25cbiAgY29uc3QgTUFYX1JFVFJJRVMgPSAzO1xuICBjb25zdCBCQVNFX0RFTEFZX01TID0gMTAwMDsgLy8gU3RhcnQgd2l0aCAxIHNlY29uZFxuICBjb25zdCBNQVhfREVMQVlfTVMgPSAxMDAwMDsgLy8gQ2FwIGF0IDEwIHNlY29uZHNcblxuICBsZXQgbGFzdEVycm9yOiBFcnJvciB8IHVuZGVmaW5lZDtcblxuICBmb3IgKGxldCBhdHRlbXB0ID0gMDsgYXR0ZW1wdCA8PSBNQVhfUkVUUklFUzsgYXR0ZW1wdCsrKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgbGFtYmRhQ2xpZW50LnNlbmQoXG4gICAgICAgIG5ldyBJbnZva2VDb21tYW5kKHtcbiAgICAgICAgICBGdW5jdGlvbk5hbWU6IHByb2Nlc3MuZW52LkdFTkVSQVRFX1JFQURJTkdfRlVOQ1RJT05fTkFNRSxcbiAgICAgICAgICBJbnZvY2F0aW9uVHlwZTogJ1JlcXVlc3RSZXNwb25zZScsXG4gICAgICAgICAgUGF5bG9hZDogSlNPTi5zdHJpbmdpZnkocGF5bG9hZCksXG4gICAgICAgIH0pLFxuICAgICAgKTtcblxuICAgICAgaWYgKHJlc3BvbnNlLlN0YXR1c0NvZGUgIT09IDIwMCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYExhbWJkYSBpbnZvY2F0aW9uIGZhaWxlZCB3aXRoIHN0YXR1czogJHtyZXNwb25zZS5TdGF0dXNDb2RlfWApO1xuICAgICAgfVxuXG4gICAgICBpZiAocmVzcG9uc2UuRnVuY3Rpb25FcnJvcikge1xuICAgICAgICBjb25zdCBlcnJvclBheWxvYWQgPSByZXNwb25zZS5QYXlsb2FkXG4gICAgICAgICAgPyBKU09OLnBhcnNlKG5ldyBUZXh0RGVjb2RlcigpLmRlY29kZShyZXNwb25zZS5QYXlsb2FkKSlcbiAgICAgICAgICA6IHt9O1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgYExhbWJkYSBmdW5jdGlvbiBlcnJvcjogJHtyZXNwb25zZS5GdW5jdGlvbkVycm9yfSAtICR7SlNPTi5zdHJpbmdpZnkoZXJyb3JQYXlsb2FkKX1gLFxuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICBjb25zdCByZXN1bHQgPSByZXNwb25zZS5QYXlsb2FkID8gSlNPTi5wYXJzZShuZXcgVGV4dERlY29kZXIoKS5kZWNvZGUocmVzcG9uc2UuUGF5bG9hZCkpIDoge307XG5cbiAgICAgIGlmIChyZXN1bHQuc3RhdHVzQ29kZSAhPT0gMjAwKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgUmVhZGluZyBnZW5lcmF0aW9uIGZhaWxlZDogJHtyZXN1bHQuYm9keSB8fCAnVW5rbm93biBlcnJvcid9YCk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGJvZHkgPSB0eXBlb2YgcmVzdWx0LmJvZHkgPT09ICdzdHJpbmcnID8gSlNPTi5wYXJzZShyZXN1bHQuYm9keSkgOiByZXN1bHQuYm9keTtcbiAgICAgIGNvbnNvbGUuaW5mbygnUmVhZGluZyBnZW5lcmF0aW9uIHN1Y2Nlc3NmdWw6Jywge1xuICAgICAgICB1c2VySWQsXG4gICAgICAgIHJlYWRpbmdJZDogYm9keS5yZWFkaW5nSWQsXG4gICAgICAgIGF0dGVtcHQ6IGF0dGVtcHQgKyAxLFxuICAgICAgfSk7XG5cbiAgICAgIHJldHVybiBib2R5LnJlYWRpbmdJZDtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbGFzdEVycm9yID0gZXJyb3IgYXMgRXJyb3I7XG4gICAgICBjb25zb2xlLmVycm9yKGBSZWFkaW5nIGdlbmVyYXRpb24gYXR0ZW1wdCAke2F0dGVtcHQgKyAxfSBmYWlsZWQ6YCwgZXJyb3IpO1xuXG4gICAgICBpZiAoYXR0ZW1wdCA8IE1BWF9SRVRSSUVTKSB7XG4gICAgICAgIC8vIENhbGN1bGF0ZSBleHBvbmVudGlhbCBiYWNrb2ZmIHdpdGggaml0dGVyXG4gICAgICAgIGNvbnN0IGRlbGF5ID0gTWF0aC5taW4oXG4gICAgICAgICAgQkFTRV9ERUxBWV9NUyAqIE1hdGgucG93KDIsIGF0dGVtcHQpICsgTWF0aC5yYW5kb20oKSAqIDEwMDAsXG4gICAgICAgICAgTUFYX0RFTEFZX01TLFxuICAgICAgICApO1xuICAgICAgICBjb25zb2xlLmluZm8oYFJldHJ5aW5nIGluICR7ZGVsYXl9bXMuLi5gKTtcbiAgICAgICAgYXdhaXQgc2xlZXAoZGVsYXkpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIEFsbCByZXRyaWVzIGZhaWxlZFxuICBjb25zb2xlLmVycm9yKCdBbGwgcmVhZGluZyBnZW5lcmF0aW9uIGF0dGVtcHRzIGZhaWxlZDonLCBsYXN0RXJyb3IpO1xuICB0aHJvdyBsYXN0RXJyb3IgfHwgbmV3IEVycm9yKCdGYWlsZWQgdG8gZ2VuZXJhdGUgcmVhZGluZyBhZnRlciBtdWx0aXBsZSBhdHRlbXB0cycpO1xufVxuXG4vLyBQcm9jZXNzIGEgY2hlY2tvdXQuc2Vzc2lvbi5jb21wbGV0ZWQgZXZlbnRcbmFzeW5jIGZ1bmN0aW9uIHByb2Nlc3NDaGVja291dFNlc3Npb24oc2Vzc2lvbjogU3RyaXBlLkNoZWNrb3V0LlNlc3Npb24pOiBQcm9taXNlPFByb2Nlc3NpbmdSZXN1bHQ+IHtcbiAgdHJ5IHtcbiAgICAvLyBFeHRyYWN0IHVzZXJJZCBmcm9tIGNsaWVudF9yZWZlcmVuY2VfaWQgb3IgbWV0YWRhdGFcbiAgICBjb25zdCB1c2VySWQgPSBzZXNzaW9uLmNsaWVudF9yZWZlcmVuY2VfaWQgfHwgc2Vzc2lvbi5tZXRhZGF0YT8udXNlcklkO1xuXG4gICAgaWYgKCF1c2VySWQpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ05vIHVzZXJJZCBmb3VuZCBpbiBzZXNzaW9uOicsIHtcbiAgICAgICAgc2Vzc2lvbklkOiBzZXNzaW9uLmlkLFxuICAgICAgICBjbGllbnRfcmVmZXJlbmNlX2lkOiBzZXNzaW9uLmNsaWVudF9yZWZlcmVuY2VfaWQsXG4gICAgICAgIG1ldGFkYXRhOiBzZXNzaW9uLm1ldGFkYXRhLFxuICAgICAgfSk7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgZXJyb3I6ICdObyB1c2VySWQgZm91bmQgaW4gY2hlY2tvdXQgc2Vzc2lvbicsXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIENoZWNrIHBheW1lbnQgc3RhdHVzXG4gICAgaWYgKHNlc3Npb24ucGF5bWVudF9zdGF0dXMgIT09ICdwYWlkJykge1xuICAgICAgY29uc29sZS5pbmZvKCdTZXNzaW9uIG5vdCBwYWlkLCBza2lwcGluZyByZWFkaW5nIGdlbmVyYXRpb246Jywge1xuICAgICAgICBzZXNzaW9uSWQ6IHNlc3Npb24uaWQsXG4gICAgICAgIHBheW1lbnRfc3RhdHVzOiBzZXNzaW9uLnBheW1lbnRfc3RhdHVzLFxuICAgICAgICB1c2VySWQsXG4gICAgICB9KTtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICBlcnJvcjogYFBheW1lbnQgc3RhdHVzIGlzICR7c2Vzc2lvbi5wYXltZW50X3N0YXR1c30sIG5vdCBwYWlkYCxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gRXh0cmFjdCBtZXRhZGF0YSBmb3IgdGhlIHJlYWRpbmcsIGZpbHRlcmluZyBvdXQgbnVsbCB2YWx1ZXNcbiAgICBjb25zdCBtZXRhZGF0YTogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgbnVtYmVyIHwgYm9vbGVhbj4gPSB7XG4gICAgICBzZXNzaW9uSWQ6IHNlc3Npb24uaWQsXG4gICAgICAuLi4oc2Vzc2lvbi5jdXN0b21lcl9lbWFpbCAmJiB7IGN1c3RvbWVyRW1haWw6IHNlc3Npb24uY3VzdG9tZXJfZW1haWwgfSksXG4gICAgICAuLi4oc2Vzc2lvbi5hbW91bnRfdG90YWwgIT09IG51bGwgJiYgeyBhbW91bnRUb3RhbDogc2Vzc2lvbi5hbW91bnRfdG90YWwgfSksXG4gICAgICAuLi4oc2Vzc2lvbi5jdXJyZW5jeSAmJiB7IGN1cnJlbmN5OiBzZXNzaW9uLmN1cnJlbmN5IH0pLFxuICAgICAgLi4uKHR5cGVvZiBzZXNzaW9uLnBheW1lbnRfaW50ZW50ID09PSAnc3RyaW5nJyAmJiB7XG4gICAgICAgIHBheW1lbnRJbnRlbnRJZDogc2Vzc2lvbi5wYXltZW50X2ludGVudCxcbiAgICAgIH0pLFxuICAgICAgLi4uKHNlc3Npb24ubWV0YWRhdGEgfHwge30pLFxuICAgIH07XG5cbiAgICAvLyBJbnZva2UgcmVhZGluZyBnZW5lcmF0aW9uXG4gICAgY29uc3Qgc3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcbiAgICBjb25zdCByZWFkaW5nSWQgPSBhd2FpdCBpbnZva2VSZWFkaW5nR2VuZXJhdGlvbih1c2VySWQsIG1ldGFkYXRhKTtcbiAgICBjb25zdCBnZW5lcmF0aW9uVGltZSA9IChEYXRlLm5vdygpIC0gc3RhcnRUaW1lKSAvIDEwMDA7XG5cbiAgICAvLyBFbWl0IHN1Y2Nlc3MgbWV0cmljc1xuICAgIGF3YWl0IGVtaXRNZXRyaWMoJ1JlYWRpbmdHZW5lcmF0aW9uU3VjY2VzcycsIDEpO1xuICAgIGF3YWl0IGVtaXRNZXRyaWMoJ1JlYWRpbmdHZW5lcmF0aW9uVGltZScsIGdlbmVyYXRpb25UaW1lLCAnU2Vjb25kcycpO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICByZWFkaW5nSWQsXG4gICAgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBwcm9jZXNzaW5nIGNoZWNrb3V0IHNlc3Npb246JywgZXJyb3IpO1xuICAgIGF3YWl0IGVtaXRNZXRyaWMoJ1JlYWRpbmdHZW5lcmF0aW9uRmFpbHVyZScsIDEpO1xuICAgIHJldHVybiB7XG4gICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgIGVycm9yOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJyxcbiAgICB9O1xuICB9XG59XG5cbi8vIFZlcmlmeSB3ZWJob29rIHNpZ25hdHVyZVxuYXN5bmMgZnVuY3Rpb24gdmVyaWZ5V2ViaG9va1NpZ25hdHVyZShcbiAgcGF5bG9hZDogc3RyaW5nLFxuICBzaWduYXR1cmU6IHN0cmluZyxcbiAgc2VjcmV0OiBzdHJpbmcsXG4pOiBQcm9taXNlPFN0cmlwZS5FdmVudD4ge1xuICBjb25zdCBzdHJpcGUgPSBhd2FpdCBnZXRTdHJpcGVDbGllbnQoKTtcblxuICB0cnkge1xuICAgIGNvbnN0IGV2ZW50ID0gc3RyaXBlLndlYmhvb2tzLmNvbnN0cnVjdEV2ZW50KHBheWxvYWQsIHNpZ25hdHVyZSwgc2VjcmV0KTtcbiAgICByZXR1cm4gZXZlbnQ7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignV2ViaG9vayBzaWduYXR1cmUgdmVyaWZpY2F0aW9uIGZhaWxlZDonLCBlcnJvcik7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIHdlYmhvb2sgc2lnbmF0dXJlJyk7XG4gIH1cbn1cblxuZXhwb3J0IGNvbnN0IGhhbmRsZXIgPSBhc3luYyAoZXZlbnQ6IEFQSUdhdGV3YXlQcm94eUV2ZW50KTogUHJvbWlzZTxBUElHYXRld2F5UHJveHlSZXN1bHQ+ID0+IHtcbiAgY29uc29sZS5pbmZvKCdXZWJob29rIHJlY2VpdmVkOicsIHtcbiAgICBwYXRoOiBldmVudC5wYXRoLFxuICAgIGhlYWRlcnM6IHtcbiAgICAgICdzdHJpcGUtc2lnbmF0dXJlJzogZXZlbnQuaGVhZGVycz8uWydzdHJpcGUtc2lnbmF0dXJlJ10gPyAnW1BSRVNFTlRdJyA6ICdbTUlTU0lOR10nLFxuICAgICAgJ2NvbnRlbnQtdHlwZSc6IGV2ZW50LmhlYWRlcnM/LlsnY29udGVudC10eXBlJ10sXG4gICAgfSxcbiAgICBib2R5TGVuZ3RoOiBldmVudC5ib2R5Py5sZW5ndGgsXG4gICAgaXNCYXNlNjRFbmNvZGVkOiBldmVudC5pc0Jhc2U2NEVuY29kZWQsXG4gIH0pO1xuXG4gIHRyeSB7XG4gICAgLy8gSGFuZGxlIGJvdGggZGlyZWN0IGludm9jYXRpb24gYW5kIEFQSSBHYXRld2F5IGludm9jYXRpb25cbiAgICBsZXQgcmF3Qm9keTogc3RyaW5nO1xuICAgIGxldCBzaWduYXR1cmU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuICAgIC8vIENoZWNrIGlmIHRoaXMgaXMgY29taW5nIGZyb20gQVBJIEdhdGV3YXkgd2l0aCBjdXN0b20gdGVtcGxhdGVcbiAgICBpZiAoZXZlbnQuaGVhZGVycyAmJiB0eXBlb2YgZXZlbnQuYm9keSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIC8vIFRyeSB0byBwYXJzZSBhcyBKU09OIGZpcnN0IChmcm9tIEFQSSBHYXRld2F5IHRlbXBsYXRlKVxuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShldmVudC5ib2R5KTtcbiAgICAgICAgaWYgKHBhcnNlZC5ib2R5ICYmIHBhcnNlZC5oZWFkZXJzKSB7XG4gICAgICAgICAgLy8gVGhpcyBpcyBmcm9tIG91ciBBUEkgR2F0ZXdheSB0ZW1wbGF0ZVxuICAgICAgICAgIHJhd0JvZHkgPSBCdWZmZXIuZnJvbShwYXJzZWQuYm9keSwgJ2Jhc2U2NCcpLnRvU3RyaW5nKCd1dGYtOCcpO1xuICAgICAgICAgIHNpZ25hdHVyZSA9IHBhcnNlZC5oZWFkZXJzWydzdHJpcGUtc2lnbmF0dXJlJ10gfHwgcGFyc2VkLmhlYWRlcnNbJ1N0cmlwZS1TaWduYXR1cmUnXTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBEaXJlY3QgYm9keVxuICAgICAgICAgIHJhd0JvZHkgPSBldmVudC5ib2R5O1xuICAgICAgICAgIHNpZ25hdHVyZSA9IGV2ZW50LmhlYWRlcnNbJ3N0cmlwZS1zaWduYXR1cmUnXSB8fCBldmVudC5oZWFkZXJzWydTdHJpcGUtU2lnbmF0dXJlJ107XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICAvLyBOb3QgSlNPTiwgdHJlYXQgYXMgcmF3IGJvZHlcbiAgICAgICAgcmF3Qm9keSA9IGV2ZW50LmlzQmFzZTY0RW5jb2RlZFxuICAgICAgICAgID8gQnVmZmVyLmZyb20oZXZlbnQuYm9keSwgJ2Jhc2U2NCcpLnRvU3RyaW5nKCd1dGYtOCcpXG4gICAgICAgICAgOiBldmVudC5ib2R5O1xuICAgICAgICBzaWduYXR1cmUgPSBldmVudC5oZWFkZXJzWydzdHJpcGUtc2lnbmF0dXJlJ10gfHwgZXZlbnQuaGVhZGVyc1snU3RyaXBlLVNpZ25hdHVyZSddO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBGYWxsYmFjayBmb3IgZGlyZWN0IGludm9jYXRpb25cbiAgICAgIHJhd0JvZHkgPSBldmVudC5ib2R5IHx8ICcnO1xuICAgICAgc2lnbmF0dXJlID0gZXZlbnQuaGVhZGVycz8uWydzdHJpcGUtc2lnbmF0dXJlJ10gfHwgZXZlbnQuaGVhZGVycz8uWydTdHJpcGUtU2lnbmF0dXJlJ107XG4gICAgfVxuXG4gICAgaWYgKCFzaWduYXR1cmUpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ01pc3NpbmcgU3RyaXBlIHNpZ25hdHVyZSBoZWFkZXInKTtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgIH0sXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdNaXNzaW5nIHNpZ25hdHVyZSBoZWFkZXInIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBpZiAoIXJhd0JvZHkpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ01pc3NpbmcgcmVxdWVzdCBib2R5Jyk7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICB9LFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnTWlzc2luZyByZXF1ZXN0IGJvZHknIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBHZXQgd2ViaG9vayBzZWNyZXRcbiAgICBjb25zdCBzZWNyZXQgPSBhd2FpdCBnZXRXZWJob29rU2VjcmV0KCk7XG5cbiAgICAvLyBWZXJpZnkgc2lnbmF0dXJlIGFuZCBjb25zdHJ1Y3QgZXZlbnRcbiAgICBjb25zdCBzdHJpcGVFdmVudCA9IGF3YWl0IHZlcmlmeVdlYmhvb2tTaWduYXR1cmUocmF3Qm9keSwgc2lnbmF0dXJlLCBzZWNyZXQpO1xuXG4gICAgY29uc29sZS5pbmZvKCdXZWJob29rIGV2ZW50IHZlcmlmaWVkOicsIHtcbiAgICAgIGlkOiBzdHJpcGVFdmVudC5pZCxcbiAgICAgIHR5cGU6IHN0cmlwZUV2ZW50LnR5cGUsXG4gICAgICBjcmVhdGVkOiBzdHJpcGVFdmVudC5jcmVhdGVkLFxuICAgIH0pO1xuXG4gICAgLy8gQ2hlY2sgaWRlbXBvdGVuY3lcbiAgICBjb25zdCBhbHJlYWR5UHJvY2Vzc2VkID0gYXdhaXQgY2hlY2tJZGVtcG90ZW5jeShzdHJpcGVFdmVudC5pZCk7XG4gICAgaWYgKGFscmVhZHlQcm9jZXNzZWQpIHtcbiAgICAgIGF3YWl0IGVtaXRNZXRyaWMoJ1dlYmhvb2tEdXBsaWNhdGUnLCAxKTtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgIH0sXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgcmVjZWl2ZWQ6IHRydWUsIHN0YXR1czogJ2FscmVhZHlfcHJvY2Vzc2VkJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gSGFuZGxlIGRpZmZlcmVudCBldmVudCB0eXBlc1xuICAgIGxldCByZXN1bHQ6IFByb2Nlc3NpbmdSZXN1bHQgPSB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ1VuaGFuZGxlZCBldmVudCB0eXBlJyB9O1xuICAgIGNvbnN0IHByb2Nlc3NpbmdTdGFydFRpbWUgPSBEYXRlLm5vdygpO1xuXG4gICAgc3dpdGNoIChzdHJpcGVFdmVudC50eXBlKSB7XG4gICAgICBjYXNlICdjaGVja291dC5zZXNzaW9uLmNvbXBsZXRlZCc6XG4gICAgICAgIGNvbnN0IHNlc3Npb24gPSBzdHJpcGVFdmVudC5kYXRhLm9iamVjdCBhcyBTdHJpcGUuQ2hlY2tvdXQuU2Vzc2lvbjtcbiAgICAgICAgY29uc29sZS5pbmZvKCdQcm9jZXNzaW5nIGNoZWNrb3V0LnNlc3Npb24uY29tcGxldGVkOicsIHtcbiAgICAgICAgICBzZXNzaW9uSWQ6IHNlc3Npb24uaWQsXG4gICAgICAgICAgcGF5bWVudF9zdGF0dXM6IHNlc3Npb24ucGF5bWVudF9zdGF0dXMsXG4gICAgICAgICAgdXNlcklkOiBzZXNzaW9uLmNsaWVudF9yZWZlcmVuY2VfaWQgfHwgc2Vzc2lvbi5tZXRhZGF0YT8udXNlcklkLFxuICAgICAgICB9KTtcbiAgICAgICAgcmVzdWx0ID0gYXdhaXQgcHJvY2Vzc0NoZWNrb3V0U2Vzc2lvbihzZXNzaW9uKTtcbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGNhc2UgJ2NoZWNrb3V0LnNlc3Npb24uYXN5bmNfcGF5bWVudF9zdWNjZWVkZWQnOlxuICAgICAgICAvLyBIYW5kbGUgZGVsYXllZCBwYXltZW50cyAoZS5nLiwgYmFuayB0cmFuc2ZlcnMpXG4gICAgICAgIGNvbnN0IGFzeW5jU2Vzc2lvbiA9IHN0cmlwZUV2ZW50LmRhdGEub2JqZWN0IGFzIFN0cmlwZS5DaGVja291dC5TZXNzaW9uO1xuICAgICAgICBjb25zb2xlLmluZm8oJ1Byb2Nlc3NpbmcgY2hlY2tvdXQuc2Vzc2lvbi5hc3luY19wYXltZW50X3N1Y2NlZWRlZDonLCB7XG4gICAgICAgICAgc2Vzc2lvbklkOiBhc3luY1Nlc3Npb24uaWQsXG4gICAgICAgICAgdXNlcklkOiBhc3luY1Nlc3Npb24uY2xpZW50X3JlZmVyZW5jZV9pZCB8fCBhc3luY1Nlc3Npb24ubWV0YWRhdGE/LnVzZXJJZCxcbiAgICAgICAgfSk7XG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHByb2Nlc3NDaGVja291dFNlc3Npb24oYXN5bmNTZXNzaW9uKTtcbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIGNvbnNvbGUuaW5mbygnVW5oYW5kbGVkIGV2ZW50IHR5cGU6Jywgc3RyaXBlRXZlbnQudHlwZSk7XG4gICAgICAgIHJlc3VsdCA9IHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgVW5oYW5kbGVkIGV2ZW50IHR5cGU6ICR7c3RyaXBlRXZlbnQudHlwZX1gIH07XG4gICAgfVxuXG4gICAgLy8gUmVjb3JkIHRoZSBwcm9jZXNzZWQgZXZlbnRcbiAgICBjb25zdCBzZXNzaW9uSWQgPSBzdHJpcGVFdmVudC50eXBlLnN0YXJ0c1dpdGgoJ2NoZWNrb3V0LnNlc3Npb24uJylcbiAgICAgID8gKHN0cmlwZUV2ZW50LmRhdGEub2JqZWN0IGFzIFN0cmlwZS5DaGVja291dC5TZXNzaW9uKS5pZFxuICAgICAgOiAndW5rbm93bic7XG5cbiAgICBhd2FpdCByZWNvcmRQcm9jZXNzZWRFdmVudChcbiAgICAgIHN0cmlwZUV2ZW50LmlkLFxuICAgICAgc2Vzc2lvbklkLFxuICAgICAgcmVzdWx0LnN1Y2Nlc3MgPyAncHJvY2Vzc2VkJyA6ICdmYWlsZWQnLFxuICAgICAgcmVzdWx0LnJlYWRpbmdJZCxcbiAgICAgIHJlc3VsdC5lcnJvcixcbiAgICApLmNhdGNoKChlcnJvcikgPT4ge1xuICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIHJlY29yZCBwcm9jZXNzZWQgZXZlbnQ6JywgZXJyb3IpO1xuICAgICAgZW1pdE1ldHJpYygnSWRlbXBvdGVuY3lSZWNvcmRGYWlsdXJlJywgMSkuY2F0Y2goKCkgPT4ge30pO1xuICAgIH0pO1xuXG4gICAgLy8gRW1pdCBwcm9jZXNzaW5nIG1ldHJpY3NcbiAgICBjb25zdCBwcm9jZXNzaW5nVGltZSA9IChEYXRlLm5vdygpIC0gcHJvY2Vzc2luZ1N0YXJ0VGltZSkgLyAxMDAwO1xuICAgIGF3YWl0IGVtaXRNZXRyaWMoJ1dlYmhvb2tQcm9jZXNzZWQnLCAxLCAnQ291bnQnLCBbXG4gICAgICB7IE5hbWU6ICdFdmVudFR5cGUnLCBWYWx1ZTogc3RyaXBlRXZlbnQudHlwZSB9LFxuICAgICAgeyBOYW1lOiAnU3VjY2VzcycsIFZhbHVlOiByZXN1bHQuc3VjY2VzcyA/ICd0cnVlJyA6ICdmYWxzZScgfSxcbiAgICBdKTtcbiAgICBhd2FpdCBlbWl0TWV0cmljKCdXZWJob29rUHJvY2Vzc2luZ1RpbWUnLCBwcm9jZXNzaW5nVGltZSwgJ1NlY29uZHMnKTtcblxuICAgIC8vIFJldHVybiBzdWNjZXNzIHJlc3BvbnNlIHRvIFN0cmlwZVxuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXNDb2RlOiAyMDAsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICB9LFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICByZWNlaXZlZDogdHJ1ZSxcbiAgICAgICAgc3VjY2VzczogcmVzdWx0LnN1Y2Nlc3MsXG4gICAgICAgIC4uLihyZXN1bHQucmVhZGluZ0lkICYmIHsgcmVhZGluZ0lkOiByZXN1bHQucmVhZGluZ0lkIH0pLFxuICAgICAgfSksXG4gICAgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdXZWJob29rIHByb2Nlc3NpbmcgZXJyb3I6JywgZXJyb3IpO1xuXG4gICAgLy8gQ2hlY2sgaWYgaXQncyBhIHNpZ25hdHVyZSB2ZXJpZmljYXRpb24gZXJyb3JcbiAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBFcnJvciAmJiBlcnJvci5tZXNzYWdlID09PSAnSW52YWxpZCB3ZWJob29rIHNpZ25hdHVyZScpIHtcbiAgICAgIGF3YWl0IGVtaXRNZXRyaWMoJ1dlYmhvb2tJbnZhbGlkU2lnbmF0dXJlJywgMSk7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICB9LFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnSW52YWxpZCBzaWduYXR1cmUnIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBhd2FpdCBlbWl0TWV0cmljKCdXZWJob29rRXJyb3InLCAxKTtcblxuICAgIC8vIEZvciBvdGhlciBlcnJvcnMsIHJldHVybiA1MDAgc28gU3RyaXBlIHdpbGwgcmV0cnlcbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogNTAwLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgfSxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdJbnRlcm5hbCBzZXJ2ZXIgZXJyb3InIH0pLFxuICAgIH07XG4gIH1cbn07XG4iXX0=