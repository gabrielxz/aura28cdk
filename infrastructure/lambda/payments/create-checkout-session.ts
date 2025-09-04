import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import Stripe from 'stripe';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const ssmClient = new SSMClient({});
let stripeClient: Stripe | null = null;

// Cache for allowed price IDs
let cachedAllowedPriceIds: string[] | null = null;
let cacheExpiry: number = 0;

// Export for testing purposes
export function clearCache() {
  cachedAllowedPriceIds = null;
  cacheExpiry = 0;
}

// Cache the Stripe client across Lambda invocations
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

// Get allowed price IDs from SSM with caching
async function getAllowedPriceIds(): Promise<string[]> {
  const now = Date.now();
  const ttl = parseInt(process.env.PRICE_ID_CACHE_TTL_SECONDS || '300') * 1000;

  // Return cached value if still valid
  if (cachedAllowedPriceIds && cacheExpiry > now) {
    return cachedAllowedPriceIds;
  }

  try {
    // Try to fetch from SSM first
    if (process.env.ALLOWED_PRICE_IDS_PARAMETER_NAME) {
      const priceIdsParam = await ssmClient.send(
        new GetParameterCommand({
          Name: process.env.ALLOWED_PRICE_IDS_PARAMETER_NAME,
          WithDecryption: false, // Not a secure string
        }),
      );

      if (priceIdsParam.Parameter?.Value) {
        cachedAllowedPriceIds = priceIdsParam.Parameter.Value.split(',')
          .map((id) => id.trim())
          .filter((id) => id.length > 0);
        cacheExpiry = now + ttl;
        console.info('Loaded allowed price IDs from SSM:', {
          count: cachedAllowedPriceIds.length,
          cacheExpiryTime: new Date(cacheExpiry).toISOString(),
        });
        return cachedAllowedPriceIds;
      }
    }
  } catch (error) {
    console.error('Error fetching allowed price IDs from SSM:', error);
    // Fall through to environment variable fallback
  }

  // Fallback to environment variable for backward compatibility
  const envPriceIds =
    process.env.ALLOWED_PRICE_IDS?.split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0) || [];

  if (envPriceIds.length > 0) {
    console.warn('Using price IDs from environment variable (deprecated)');
    cachedAllowedPriceIds = envPriceIds;
    cacheExpiry = now + ttl;
    return envPriceIds;
  }

  // Return empty array if no configuration found
  console.warn('No allowed price IDs configured');
  return [];
}

interface CreateCheckoutSessionRequest {
  sessionType: 'subscription' | 'one-time';
  priceId?: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  metadata?: Record<string, string>;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.info('Create checkout session request:', {
    path: event.path,
    pathParameters: event.pathParameters,
    headers: {
      ...event.headers,
      Authorization: event.headers.Authorization ? 'Bearer [REDACTED]' : undefined,
    },
  });

  try {
    // Extract userId from path parameters
    const userId = event.pathParameters?.userId;
    if (!userId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'Missing userId parameter' }),
      };
    }

    // Extract user sub from authorizer context
    const authorizerUserId = event.requestContext.authorizer?.claims?.sub;
    const userEmail = event.requestContext.authorizer?.claims?.email;

    if (!authorizerUserId) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'Unauthorized' }),
      };
    }

    // Verify user can only create sessions for their own account
    if (userId !== authorizerUserId) {
      console.warn('User attempted to create checkout session for another user:', {
        requestedUserId: userId,
        authorizerUserId,
      });
      return {
        statusCode: 403,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'Forbidden' }),
      };
    }

    // Parse request body
    if (!event.body) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'Missing request body' }),
      };
    }

    let requestBody: CreateCheckoutSessionRequest;
    try {
      requestBody = JSON.parse(event.body);
    } catch (_parseError) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'Invalid JSON in request body' }),
      };
    }

    // Validate required fields
    const { sessionType, priceId, successUrl, cancelUrl, customerEmail, metadata } = requestBody;

    if (!sessionType || !['subscription', 'one-time'].includes(sessionType)) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'Invalid or missing sessionType. Must be "subscription" or "one-time"',
        }),
      };
    }

    if (!successUrl || !cancelUrl) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'Missing successUrl or cancelUrl' }),
      };
    }

    // Validate URLs are absolute
    try {
      new URL(successUrl);
      new URL(cancelUrl);
    } catch (_urlError) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'Invalid successUrl or cancelUrl. Must be absolute URLs' }),
      };
    }

    // Get Stripe client
    const stripe = await getStripeClient();

    // Build line items based on session type
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

    if (sessionType === 'subscription') {
      // For subscriptions, we need a price ID
      if (!priceId) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ error: 'priceId is required for subscription sessions' }),
        };
      }

      // Validate that the price ID is in the allowed list (if configured)
      const allowedPriceIds = await getAllowedPriceIds();
      if (allowedPriceIds.length > 0 && !allowedPriceIds.includes(priceId)) {
        console.warn('Attempted to use disallowed price ID:', { priceId, userId });
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ error: 'Invalid price ID' }),
        };
      }

      lineItems.push({
        price: priceId,
        quantity: 1,
      });
    } else {
      // For one-time payments, we can either use a price ID or create a dynamic price
      if (priceId) {
        // Validate that the price ID is in the allowed list (if configured)
        const allowedPriceIds = await getAllowedPriceIds();
        if (allowedPriceIds.length > 0 && !allowedPriceIds.includes(priceId)) {
          console.warn('Attempted to use disallowed price ID:', { priceId, userId });
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({ error: 'Invalid price ID' }),
          };
        }

        lineItems.push({
          price: priceId,
          quantity: 1,
        });
      } else {
        // Default one-time payment configuration
        // This could be enhanced to accept amount/currency from the request
        lineItems.push({
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Aura28 Reading',
              description: 'One-time astrological reading',
            },
            unit_amount: 2900, // $29.00 in cents
          },
          quantity: 1,
        });
      }
    }

    // Create Stripe checkout session
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: sessionType === 'subscription' ? 'subscription' : 'payment',
      payment_method_types: ['card'],
      line_items: lineItems,
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: customerEmail || userEmail,
      client_reference_id: userId,
      metadata: {
        userId,
        sessionType,
        ...metadata,
      },
      // Additional options for better UX
      billing_address_collection: 'auto',
      allow_promotion_codes: true,
      // For subscriptions, allow customer to manage their subscription
      ...(sessionType === 'subscription' && {
        subscription_data: {
          metadata: {
            userId,
          },
        },
      }),
    };

    console.info('Creating Stripe checkout session with params:', {
      mode: sessionParams.mode,
      client_reference_id: sessionParams.client_reference_id,
      line_items_count: lineItems.length,
    });

    const session = await stripe.checkout.sessions.create(sessionParams);

    console.info('Successfully created checkout session:', {
      sessionId: session.id,
      userId,
      sessionType,
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        sessionId: session.id,
        url: session.url,
      }),
    };
  } catch (error) {
    console.error('Error creating checkout session:', error);

    // Handle Stripe-specific errors
    if (
      error &&
      typeof error === 'object' &&
      error !== null &&
      'type' in error &&
      'statusCode' in error
    ) {
      const stripeError = error as { type: string; statusCode?: number; message?: string };
      const statusCode = stripeError.statusCode || 500;
      const message = stripeError.message || 'Payment processing error';

      // Don't expose sensitive error details to the client
      if (statusCode >= 500) {
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ error: 'Payment processing error' }),
        };
      }

      return {
        statusCode: statusCode,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: message }),
      };
    }

    // Generic error response
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
