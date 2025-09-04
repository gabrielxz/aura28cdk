"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
exports.clearCache = clearCache;
const stripe_1 = __importDefault(require("stripe"));
const client_ssm_1 = require("@aws-sdk/client-ssm");
const ssmClient = new client_ssm_1.SSMClient({});
let stripeClient = null;
// Cache for allowed price IDs
let cachedAllowedPriceIds = null;
let cacheExpiry = 0;
// Export for testing purposes
function clearCache() {
    cachedAllowedPriceIds = null;
    cacheExpiry = 0;
}
// Cache the Stripe client across Lambda invocations
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
// Get allowed price IDs from SSM with caching
async function getAllowedPriceIds() {
    const now = Date.now();
    const ttl = parseInt(process.env.PRICE_ID_CACHE_TTL_SECONDS || '300') * 1000;
    // Return cached value if still valid
    if (cachedAllowedPriceIds && cacheExpiry > now) {
        return cachedAllowedPriceIds;
    }
    try {
        // Try to fetch from SSM first
        if (process.env.ALLOWED_PRICE_IDS_PARAMETER_NAME) {
            const priceIdsParam = await ssmClient.send(new client_ssm_1.GetParameterCommand({
                Name: process.env.ALLOWED_PRICE_IDS_PARAMETER_NAME,
                WithDecryption: false, // Not a secure string
            }));
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
    }
    catch (error) {
        console.error('Error fetching allowed price IDs from SSM:', error);
        // Fall through to environment variable fallback
    }
    // Fallback to environment variable for backward compatibility
    const envPriceIds = process.env.ALLOWED_PRICE_IDS?.split(',')
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
const handler = async (event) => {
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
        let requestBody;
        try {
            requestBody = JSON.parse(event.body);
        }
        catch (_parseError) {
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
        }
        catch (_urlError) {
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
        const lineItems = [];
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
        }
        else {
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
            }
            else {
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
        const sessionParams = {
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
    }
    catch (error) {
        console.error('Error creating checkout session:', error);
        // Handle Stripe-specific errors
        if (error &&
            typeof error === 'object' &&
            error !== null &&
            'type' in error &&
            'statusCode' in error) {
            const stripeError = error;
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
exports.handler = handler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3JlYXRlLWNoZWNrb3V0LXNlc3Npb24uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJjcmVhdGUtY2hlY2tvdXQtc2Vzc2lvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7QUFZQSxnQ0FHQztBQWRELG9EQUE0QjtBQUM1QixvREFBcUU7QUFFckUsTUFBTSxTQUFTLEdBQUcsSUFBSSxzQkFBUyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBQ3BDLElBQUksWUFBWSxHQUFrQixJQUFJLENBQUM7QUFFdkMsOEJBQThCO0FBQzlCLElBQUkscUJBQXFCLEdBQW9CLElBQUksQ0FBQztBQUNsRCxJQUFJLFdBQVcsR0FBVyxDQUFDLENBQUM7QUFFNUIsOEJBQThCO0FBQzlCLFNBQWdCLFVBQVU7SUFDeEIscUJBQXFCLEdBQUcsSUFBSSxDQUFDO0lBQzdCLFdBQVcsR0FBRyxDQUFDLENBQUM7QUFDbEIsQ0FBQztBQUVELG9EQUFvRDtBQUNwRCxLQUFLLFVBQVUsZUFBZTtJQUM1QixJQUFJLFlBQVk7UUFBRSxPQUFPLFlBQVksQ0FBQztJQUV0QyxJQUFJLENBQUM7UUFDSCxNQUFNLFdBQVcsR0FBRyxNQUFNLFNBQVMsQ0FBQyxJQUFJLENBQ3RDLElBQUksZ0NBQW1CLENBQUM7WUFDdEIsSUFBSSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsNkJBQTZCO1lBQy9DLGNBQWMsRUFBRSxJQUFJO1NBQ3JCLENBQUMsQ0FDSCxDQUFDO1FBRUYsSUFBSSxDQUFDLFdBQVcsQ0FBQyxTQUFTLEVBQUUsS0FBSyxFQUFFLENBQUM7WUFDbEMsTUFBTSxJQUFJLEtBQUssQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFDO1FBQ3JELENBQUM7UUFFRCxZQUFZLEdBQUcsSUFBSSxnQkFBTSxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFO1lBQ3JELFVBQVUsRUFBRSxrQkFBa0I7WUFDOUIsVUFBVSxFQUFFLElBQUk7U0FDakIsQ0FBQyxDQUFDO1FBRUgsT0FBTyxZQUFZ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SixDQUFDO1FBRUQseUJBQXlCO1FBQ3pCLE9BQU87WUFDTCxVQUFVLEVBQUUsR0FBRztZQUNmLE9BQU8sRUFBRTtnQkFDUCxjQUFjLEVBQUUsa0JBQWtCO2dCQUNsQyw2QkFBNkIsRUFBRSxHQUFHO2FBQ25DO1lBQ0QsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxLQUFLLEVBQUUsdUJBQXVCLEVBQUUsQ0FBQztTQUN6RCxDQUFDO0lBQ0osQ0FBQztBQUNILENBQUMsQ0FBQztBQXpTVyxRQUFBLE9BQU8sV0F5U2xCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQVBJR2F0ZXdheVByb3h5RXZlbnQsIEFQSUdhdGV3YXlQcm94eVJlc3VsdCB9IGZyb20gJ2F3cy1sYW1iZGEnO1xuaW1wb3J0IFN0cmlwZSBmcm9tICdzdHJpcGUnO1xuaW1wb3J0IHsgU1NNQ2xpZW50LCBHZXRQYXJhbWV0ZXJDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXNzbSc7XG5cbmNvbnN0IHNzbUNsaWVudCA9IG5ldyBTU01DbGllbnQoe30pO1xubGV0IHN0cmlwZUNsaWVudDogU3RyaXBlIHwgbnVsbCA9IG51bGw7XG5cbi8vIENhY2hlIGZvciBhbGxvd2VkIHByaWNlIElEc1xubGV0IGNhY2hlZEFsbG93ZWRQcmljZUlkczogc3RyaW5nW10gfCBudWxsID0gbnVsbDtcbmxldCBjYWNoZUV4cGlyeTogbnVtYmVyID0gMDtcblxuLy8gRXhwb3J0IGZvciB0ZXN0aW5nIHB1cnBvc2VzXG5leHBvcnQgZnVuY3Rpb24gY2xlYXJDYWNoZSgpIHtcbiAgY2FjaGVkQWxsb3dlZFByaWNlSWRzID0gbnVsbDtcbiAgY2FjaGVFeHBpcnkgPSAwO1xufVxuXG4vLyBDYWNoZSB0aGUgU3RyaXBlIGNsaWVudCBhY3Jvc3MgTGFtYmRhIGludm9jYXRpb25zXG5hc3luYyBmdW5jdGlvbiBnZXRTdHJpcGVDbGllbnQoKTogUHJvbWlzZTxTdHJpcGU+IHtcbiAgaWYgKHN0cmlwZUNsaWVudCkgcmV0dXJuIHN0cmlwZUNsaWVudDtcblxuICB0cnkge1xuICAgIGNvbnN0IGFwaUtleVBhcmFtID0gYXdhaXQgc3NtQ2xpZW50LnNlbmQoXG4gICAgICBuZXcgR2V0UGFyYW1ldGVyQ29tbWFuZCh7XG4gICAgICAgIE5hbWU6IHByb2Nlc3MuZW52LlNUUklQRV9BUElfS0VZX1BBUkFNRVRFUl9OQU1FLFxuICAgICAgICBXaXRoRGVjcnlwdGlvbjogdHJ1ZSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICBpZiAoIWFwaUtleVBhcmFtLlBhcmFtZXRlcj8uVmFsdWUpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignU3RyaXBlIEFQSSBrZXkgbm90IGZvdW5kIGluIFNTTScpO1xuICAgIH1cblxuICAgIHN0cmlwZUNsaWVudCA9IG5ldyBTdHJpcGUoYXBpS2V5UGFyYW0uUGFyYW1ldGVyLlZhbHVlLCB7XG4gICAgICBhcGlWZXJzaW9uOiAnMjAyNS0wNy0zMC5iYXNpbCcsXG4gICAgICB0eXBlc2NyaXB0OiB0cnVlLFxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHN0cmlwZUNsaWVudDtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBmZXRjaGluZyBTdHJpcGUgQVBJIGtleTonLCBlcnJvcik7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdGYWlsZWQgdG8gaW5pdGlhbGl6ZSBTdHJpcGUgY2xpZW50Jyk7XG4gIH1cbn1cblxuLy8gR2V0IGFsbG93ZWQgcHJpY2UgSURzIGZyb20gU1NNIHdpdGggY2FjaGluZ1xuYXN5bmMgZnVuY3Rpb24gZ2V0QWxsb3dlZFByaWNlSWRzKCk6IFByb21pc2U8c3RyaW5nW10+IHtcbiAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcbiAgY29uc3QgdHRsID0gcGFyc2VJbnQocHJvY2Vzcy5lbnYuUFJJQ0VfSURfQ0FDSEVfVFRMX1NFQ09ORFMgfHwgJzMwMCcpICogMTAwMDtcblxuICAvLyBSZXR1cm4gY2FjaGVkIHZhbHVlIGlmIHN0aWxsIHZhbGlkXG4gIGlmIChjYWNoZWRBbGxvd2VkUHJpY2VJZHMgJiYgY2FjaGVFeHBpcnkgPiBub3cpIHtcbiAgICByZXR1cm4gY2FjaGVkQWxsb3dlZFByaWNlSWRzO1xuICB9XG5cbiAgdHJ5IHtcbiAgICAvLyBUcnkgdG8gZmV0Y2ggZnJvbSBTU00gZmlyc3RcbiAgICBpZiAocHJvY2Vzcy5lbnYuQUxMT1dFRF9QUklDRV9JRFNfUEFSQU1FVEVSX05BTUUpIHtcbiAgICAgIGNvbnN0IHByaWNlSWRzUGFyYW0gPSBhd2FpdCBzc21DbGllbnQuc2VuZChcbiAgICAgICAgbmV3IEdldFBhcmFtZXRlckNvbW1hbmQoe1xuICAgICAgICAgIE5hbWU6IHByb2Nlc3MuZW52LkFMTE9XRURfUFJJQ0VfSURTX1BBUkFNRVRFUl9OQU1FLFxuICAgICAgICAgIFdpdGhEZWNyeXB0aW9uOiBmYWxzZSwgLy8gTm90IGEgc2VjdXJlIHN0cmluZ1xuICAgICAgICB9KSxcbiAgICAgICk7XG5cbiAgICAgIGlmIChwcmljZUlkc1BhcmFtLlBhcmFtZXRlcj8uVmFsdWUpIHtcbiAgICAgICAgY2FjaGVkQWxsb3dlZFByaWNlSWRzID0gcHJpY2VJZHNQYXJhbS5QYXJhbWV0ZXIuVmFsdWUuc3BsaXQoJywnKVxuICAgICAgICAgIC5tYXAoKGlkKSA9PiBpZC50cmltKCkpXG4gICAgICAgICAgLmZpbHRlcigoaWQpID0+IGlkLmxlbmd0aCA+IDApO1xuICAgICAgICBjYWNoZUV4cGlyeSA9IG5vdyArIHR0bDtcbiAgICAgICAgY29uc29sZS5pbmZvKCdMb2FkZWQgYWxsb3dlZCBwcmljZSBJRHMgZnJvbSBTU006Jywge1xuICAgICAgICAgIGNvdW50OiBjYWNoZWRBbGxvd2VkUHJpY2VJZHMubGVuZ3RoLFxuICAgICAgICAgIGNhY2hlRXhwaXJ5VGltZTogbmV3IERhdGUoY2FjaGVFeHBpcnkpLnRvSVNPU3RyaW5nKCksXG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gY2FjaGVkQWxsb3dlZFByaWNlSWRzO1xuICAgICAgfVxuICAgIH1cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBmZXRjaGluZyBhbGxvd2VkIHByaWNlIElEcyBmcm9tIFNTTTonLCBlcnJvcik7XG4gICAgLy8gRmFsbCB0aHJvdWdoIHRvIGVudmlyb25tZW50IHZhcmlhYmxlIGZhbGxiYWNrXG4gIH1cblxuICAvLyBGYWxsYmFjayB0byBlbnZpcm9ubWVudCB2YXJpYWJsZSBmb3IgYmFja3dhcmQgY29tcGF0aWJpbGl0eVxuICBjb25zdCBlbnZQcmljZUlkcyA9XG4gICAgcHJvY2Vzcy5lbnYuQUxMT1dFRF9QUklDRV9JRFM/LnNwbGl0KCcsJylcbiAgICAgIC5tYXAoKGlkKSA9PiBpZC50cmltKCkpXG4gICAgICAuZmlsdGVyKChpZCkgPT4gaWQubGVuZ3RoID4gMCkgfHwgW107XG5cbiAgaWYgKGVudlByaWNlSWRzLmxlbmd0aCA+IDApIHtcbiAgICBjb25zb2xlLndhcm4oJ1VzaW5nIHByaWNlIElEcyBmcm9tIGVudmlyb25tZW50IHZhcmlhYmxlIChkZXByZWNhdGVkKScpO1xuICAgIGNhY2hlZEFsbG93ZWRQcmljZUlkcyA9IGVudlByaWNlSWRzO1xuICAgIGNhY2hlRXhwaXJ5ID0gbm93ICsgdHRsO1xuICAgIHJldHVybiBlbnZQcmljZUlkcztcbiAgfVxuXG4gIC8vIFJldHVybiBlbXB0eSBhcnJheSBpZiBubyBjb25maWd1cmF0aW9uIGZvdW5kXG4gIGNvbnNvbGUud2FybignTm8gYWxsb3dlZCBwcmljZSBJRHMgY29uZmlndXJlZCcpO1xuICByZXR1cm4gW107XG59XG5cbmludGVyZmFjZSBDcmVhdGVDaGVja291dFNlc3Npb25SZXF1ZXN0IHtcbiAgc2Vzc2lvblR5cGU6ICdzdWJzY3JpcHRpb24nIHwgJ29uZS10aW1lJztcbiAgcHJpY2VJZD86IHN0cmluZztcbiAgc3VjY2Vzc1VybDogc3RyaW5nO1xuICBjYW5jZWxVcmw6IHN0cmluZztcbiAgY3VzdG9tZXJFbWFpbD86IHN0cmluZztcbiAgbWV0YWRhdGE/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xufVxuXG5leHBvcnQgY29uc3QgaGFuZGxlciA9IGFzeW5jIChldmVudDogQVBJR2F0ZXdheVByb3h5RXZlbnQpOiBQcm9taXNlPEFQSUdhdGV3YXlQcm94eVJlc3VsdD4gPT4ge1xuICBjb25zb2xlLmluZm8oJ0NyZWF0ZSBjaGVja291dCBzZXNzaW9uIHJlcXVlc3Q6Jywge1xuICAgIHBhdGg6IGV2ZW50LnBhdGgsXG4gICAgcGF0aFBhcmFtZXRlcnM6IGV2ZW50LnBhdGhQYXJhbWV0ZXJzLFxuICAgIGhlYWRlcnM6IHtcbiAgICAgIC4uLmV2ZW50LmhlYWRlcnMsXG4gICAgICBBdXRob3JpemF0aW9uOiBldmVudC5oZWFkZXJzLkF1dGhvcml6YXRpb24gPyAnQmVhcmVyIFtSRURBQ1RFRF0nIDogdW5kZWZpbmVkLFxuICAgIH0sXG4gIH0pO1xuXG4gIHRyeSB7XG4gICAgLy8gRXh0cmFjdCB1c2VySWQgZnJvbSBwYXRoIHBhcmFtZXRlcnNcbiAgICBjb25zdCB1c2VySWQgPSBldmVudC5wYXRoUGFyYW1ldGVycz8udXNlcklkO1xuICAgIGlmICghdXNlcklkKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICAgIH0sXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdNaXNzaW5nIHVzZXJJZCBwYXJhbWV0ZXInIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBFeHRyYWN0IHVzZXIgc3ViIGZyb20gYXV0aG9yaXplciBjb250ZXh0XG4gICAgY29uc3QgYXV0aG9yaXplclVzZXJJZCA9IGV2ZW50LnJlcXVlc3RDb250ZXh0LmF1dGhvcml6ZXI/LmNsYWltcz8uc3ViO1xuICAgIGNvbnN0IHVzZXJFbWFpbCA9IGV2ZW50LnJlcXVlc3RDb250ZXh0LmF1dGhvcml6ZXI/LmNsYWltcz8uZW1haWw7XG5cbiAgICBpZiAoIWF1dGhvcml6ZXJVc2VySWQpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMSxcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgICAgfSxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ1VuYXV0aG9yaXplZCcgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIFZlcmlmeSB1c2VyIGNhbiBvbmx5IGNyZWF0ZSBzZXNzaW9ucyBmb3IgdGhlaXIgb3duIGFjY291bnRcbiAgICBpZiAodXNlcklkICE9PSBhdXRob3JpemVyVXNlcklkKSB7XG4gICAgICBjb25zb2xlLndhcm4oJ1VzZXIgYXR0ZW1wdGVkIHRvIGNyZWF0ZSBjaGVja291dCBzZXNzaW9uIGZvciBhbm90aGVyIHVzZXI6Jywge1xuICAgICAgICByZXF1ZXN0ZWRVc2VySWQ6IHVzZXJJZCxcbiAgICAgICAgYXV0aG9yaXplclVzZXJJZCxcbiAgICAgIH0pO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAzLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxuICAgICAgICB9LFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnRm9yYmlkZGVuJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gUGFyc2UgcmVxdWVzdCBib2R5XG4gICAgaWYgKCFldmVudC5ib2R5KSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICAgIH0sXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdNaXNzaW5nIHJlcXVlc3QgYm9keScgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIGxldCByZXF1ZXN0Qm9keTogQ3JlYXRlQ2hlY2tvdXRTZXNzaW9uUmVxdWVzdDtcbiAgICB0cnkge1xuICAgICAgcmVxdWVzdEJvZHkgPSBKU09OLnBhcnNlKGV2ZW50LmJvZHkpO1xuICAgIH0gY2F0Y2ggKF9wYXJzZUVycm9yKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICAgIH0sXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdJbnZhbGlkIEpTT04gaW4gcmVxdWVzdCBib2R5JyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gVmFsaWRhdGUgcmVxdWlyZWQgZmllbGRzXG4gICAgY29uc3QgeyBzZXNzaW9uVHlwZSwgcHJpY2VJZCwgc3VjY2Vzc1VybCwgY2FuY2VsVXJsLCBjdXN0b21lckVtYWlsLCBtZXRhZGF0YSB9ID0gcmVxdWVzdEJvZHk7XG5cbiAgICBpZiAoIXNlc3Npb25UeXBlIHx8ICFbJ3N1YnNjcmlwdGlvbicsICdvbmUtdGltZSddLmluY2x1ZGVzKHNlc3Npb25UeXBlKSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxuICAgICAgICB9LFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgZXJyb3I6ICdJbnZhbGlkIG9yIG1pc3Npbmcgc2Vzc2lvblR5cGUuIE11c3QgYmUgXCJzdWJzY3JpcHRpb25cIiBvciBcIm9uZS10aW1lXCInLFxuICAgICAgICB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgaWYgKCFzdWNjZXNzVXJsIHx8ICFjYW5jZWxVcmwpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgICAgfSxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ01pc3Npbmcgc3VjY2Vzc1VybCBvciBjYW5jZWxVcmwnIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBWYWxpZGF0ZSBVUkxzIGFyZSBhYnNvbHV0ZVxuICAgIHRyeSB7XG4gICAgICBuZXcgVVJMKHN1Y2Nlc3NVcmwpO1xuICAgICAgbmV3IFVSTChjYW5jZWxVcmwpO1xuICAgIH0gY2F0Y2ggKF91cmxFcnJvcikge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxuICAgICAgICB9LFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnSW52YWxpZCBzdWNjZXNzVXJsIG9yIGNhbmNlbFVybC4gTXVzdCBiZSBhYnNvbHV0ZSBVUkxzJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gR2V0IFN0cmlwZSBjbGllbnRcbiAgICBjb25zdCBzdHJpcGUgPSBhd2FpdCBnZXRTdHJpcGVDbGllbnQoKTtcblxuICAgIC8vIEJ1aWxkIGxpbmUgaXRlbXMgYmFzZWQgb24gc2Vzc2lvbiB0eXBlXG4gICAgY29uc3QgbGluZUl0ZW1zOiBTdHJpcGUuQ2hlY2tvdXQuU2Vzc2lvbkNyZWF0ZVBhcmFtcy5MaW5lSXRlbVtdID0gW107XG5cbiAgICBpZiAoc2Vzc2lvblR5cGUgPT09ICdzdWJzY3JpcHRpb24nKSB7XG4gICAgICAvLyBGb3Igc3Vic2NyaXB0aW9ucywgd2UgbmVlZCBhIHByaWNlIElEXG4gICAgICBpZiAoIXByaWNlSWQpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAncHJpY2VJZCBpcyByZXF1aXJlZCBmb3Igc3Vic2NyaXB0aW9uIHNlc3Npb25zJyB9KSxcbiAgICAgICAgfTtcbiAgICAgIH1cblxuICAgICAgLy8gVmFsaWRhdGUgdGhhdCB0aGUgcHJpY2UgSUQgaXMgaW4gdGhlIGFsbG93ZWQgbGlzdCAoaWYgY29uZmlndXJlZClcbiAgICAgIGNvbnN0IGFsbG93ZWRQcmljZUlkcyA9IGF3YWl0IGdldEFsbG93ZWRQcmljZUlkcygpO1xuICAgICAgaWYgKGFsbG93ZWRQcmljZUlkcy5sZW5ndGggPiAwICYmICFhbGxvd2VkUHJpY2VJZHMuaW5jbHVkZXMocHJpY2VJZCkpIHtcbiAgICAgICAgY29uc29sZS53YXJuKCdBdHRlbXB0ZWQgdG8gdXNlIGRpc2FsbG93ZWQgcHJpY2UgSUQ6JywgeyBwcmljZUlkLCB1c2VySWQgfSk7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ0ludmFsaWQgcHJpY2UgSUQnIH0pLFxuICAgICAgICB9O1xuICAgICAgfVxuXG4gICAgICBsaW5lSXRlbXMucHVzaCh7XG4gICAgICAgIHByaWNlOiBwcmljZUlkLFxuICAgICAgICBxdWFudGl0eTogMSxcbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBGb3Igb25lLXRpbWUgcGF5bWVudHMsIHdlIGNhbiBlaXRoZXIgdXNlIGEgcHJpY2UgSUQgb3IgY3JlYXRlIGEgZHluYW1pYyBwcmljZVxuICAgICAgaWYgKHByaWNlSWQpIHtcbiAgICAgICAgLy8gVmFsaWRhdGUgdGhhdCB0aGUgcHJpY2UgSUQgaXMgaW4gdGhlIGFsbG93ZWQgbGlzdCAoaWYgY29uZmlndXJlZClcbiAgICAgICAgY29uc3QgYWxsb3dlZFByaWNlSWRzID0gYXdhaXQgZ2V0QWxsb3dlZFByaWNlSWRzKCk7XG4gICAgICAgIGlmIChhbGxvd2VkUHJpY2VJZHMubGVuZ3RoID4gMCAmJiAhYWxsb3dlZFByaWNlSWRzLmluY2x1ZGVzKHByaWNlSWQpKSB7XG4gICAgICAgICAgY29uc29sZS53YXJuKCdBdHRlbXB0ZWQgdG8gdXNlIGRpc2FsbG93ZWQgcHJpY2UgSUQ6JywgeyBwcmljZUlkLCB1c2VySWQgfSk7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnSW52YWxpZCBwcmljZSBJRCcgfSksXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIGxpbmVJdGVtcy5wdXNoKHtcbiAgICAgICAgICBwcmljZTogcHJpY2VJZCxcbiAgICAgICAgICBxdWFudGl0eTogMSxcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBEZWZhdWx0IG9uZS10aW1lIHBheW1lbnQgY29uZmlndXJhdGlvblxuICAgICAgICAvLyBUaGlzIGNvdWxkIGJlIGVuaGFuY2VkIHRvIGFjY2VwdCBhbW91bnQvY3VycmVuY3kgZnJvbSB0aGUgcmVxdWVzdFxuICAgICAgICBsaW5lSXRlbXMucHVzaCh7XG4gICAgICAgICAgcHJpY2VfZGF0YToge1xuICAgICAgICAgICAgY3VycmVuY3k6ICd1c2QnLFxuICAgICAgICAgICAgcHJvZHVjdF9kYXRhOiB7XG4gICAgICAgICAgICAgIG5hbWU6ICdBdXJhMjggUmVhZGluZycsXG4gICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnT25lLXRpbWUgYXN0cm9sb2dpY2FsIHJlYWRpbmcnLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHVuaXRfYW1vdW50OiAyOTAwLCAvLyAkMjkuMDAgaW4gY2VudHNcbiAgICAgICAgICB9LFxuICAgICAgICAgIHF1YW50aXR5OiAxLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBDcmVhdGUgU3RyaXBlIGNoZWNrb3V0IHNlc3Npb25cbiAgICBjb25zdCBzZXNzaW9uUGFyYW1zOiBTdHJpcGUuQ2hlY2tvdXQuU2Vzc2lvbkNyZWF0ZVBhcmFtcyA9IHtcbiAgICAgIG1vZGU6IHNlc3Npb25UeXBlID09PSAnc3Vic2NyaXB0aW9uJyA/ICdzdWJzY3JpcHRpb24nIDogJ3BheW1lbnQnLFxuICAgICAgcGF5bWVudF9tZXRob2RfdHlwZXM6IFsnY2FyZCddLFxuICAgICAgbGluZV9pdGVtczogbGluZUl0ZW1zLFxuICAgICAgc3VjY2Vzc191cmw6IHN1Y2Nlc3NVcmwsXG4gICAgICBjYW5jZWxfdXJsOiBjYW5jZWxVcmwsXG4gICAgICBjdXN0b21lcl9lbWFpbDogY3VzdG9tZXJFbWFpbCB8fCB1c2VyRW1haWwsXG4gICAgICBjbGllbnRfcmVmZXJlbmNlX2lkOiB1c2VySWQsXG4gICAgICBtZXRhZGF0YToge1xuICAgICAgICB1c2VySWQsXG4gICAgICAgIHNlc3Npb25UeXBlLFxuICAgICAgICAuLi5tZXRhZGF0YSxcbiAgICAgIH0sXG4gICAgICAvLyBBZGRpdGlvbmFsIG9wdGlvbnMgZm9yIGJldHRlciBVWFxuICAgICAgYmlsbGluZ19hZGRyZXNzX2NvbGxlY3Rpb246ICdhdXRvJyxcbiAgICAgIGFsbG93X3Byb21vdGlvbl9jb2RlczogdHJ1ZSxcbiAgICAgIC8vIEZvciBzdWJzY3JpcHRpb25zLCBhbGxvdyBjdXN0b21lciB0byBtYW5hZ2UgdGhlaXIgc3Vic2NyaXB0aW9uXG4gICAgICAuLi4oc2Vzc2lvblR5cGUgPT09ICdzdWJzY3JpcHRpb24nICYmIHtcbiAgICAgICAgc3Vic2NyaXB0aW9uX2RhdGE6IHtcbiAgICAgICAgICBtZXRhZGF0YToge1xuICAgICAgICAgICAgdXNlcklkLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9KSxcbiAgICB9O1xuXG4gICAgY29uc29sZS5pbmZvKCdDcmVhdGluZyBTdHJpcGUgY2hlY2tvdXQgc2Vzc2lvbiB3aXRoIHBhcmFtczonLCB7XG4gICAgICBtb2RlOiBzZXNzaW9uUGFyYW1zLm1vZGUsXG4gICAgICBjbGllbnRfcmVmZXJlbmNlX2lkOiBzZXNzaW9uUGFyYW1zLmNsaWVudF9yZWZlcmVuY2VfaWQsXG4gICAgICBsaW5lX2l0ZW1zX2NvdW50OiBsaW5lSXRlbXMubGVuZ3RoLFxuICAgIH0pO1xuXG4gICAgY29uc3Qgc2Vzc2lvbiA9IGF3YWl0IHN0cmlwZS5jaGVja291dC5zZXNzaW9ucy5jcmVhdGUoc2Vzc2lvblBhcmFtcyk7XG5cbiAgICBjb25zb2xlLmluZm8oJ1N1Y2Nlc3NmdWxseSBjcmVhdGVkIGNoZWNrb3V0IHNlc3Npb246Jywge1xuICAgICAgc2Vzc2lvbklkOiBzZXNzaW9uLmlkLFxuICAgICAgdXNlcklkLFxuICAgICAgc2Vzc2lvblR5cGUsXG4gICAgfSk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogMjAwLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxuICAgICAgfSxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgc2Vzc2lvbklkOiBzZXNzaW9uLmlkLFxuICAgICAgICB1cmw6IHNlc3Npb24udXJsLFxuICAgICAgfSksXG4gICAgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBjcmVhdGluZyBjaGVja291dCBzZXNzaW9uOicsIGVycm9yKTtcblxuICAgIC8vIEhhbmRsZSBTdHJpcGUtc3BlY2lmaWMgZXJyb3JzXG4gICAgaWYgKFxuICAgICAgZXJyb3IgJiZcbiAgICAgIHR5cGVvZiBlcnJvciA9PT0gJ29iamVjdCcgJiZcbiAgICAgIGVycm9yICE9PSBudWxsICYmXG4gICAgICAndHlwZScgaW4gZXJyb3IgJiZcbiAgICAgICdzdGF0dXNDb2RlJyBpbiBlcnJvclxuICAgICkge1xuICAgICAgY29uc3Qgc3RyaXBlRXJyb3IgPSBlcnJvciBhcyB7IHR5cGU6IHN0cmluZzsgc3RhdHVzQ29kZT86IG51bWJlcjsgbWVzc2FnZT86IHN0cmluZyB9O1xuICAgICAgY29uc3Qgc3RhdHVzQ29kZSA9IHN0cmlwZUVycm9yLnN0YXR1c0NvZGUgfHwgNTAwO1xuICAgICAgY29uc3QgbWVzc2FnZSA9IHN0cmlwZUVycm9yLm1lc3NhZ2UgfHwgJ1BheW1lbnQgcHJvY2Vzc2luZyBlcnJvcic7XG5cbiAgICAgIC8vIERvbid0IGV4cG9zZSBzZW5zaXRpdmUgZXJyb3IgZGV0YWlscyB0byB0aGUgY2xpZW50XG4gICAgICBpZiAoc3RhdHVzQ29kZSA+PSA1MDApIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBzdGF0dXNDb2RlOiA1MDAsXG4gICAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnUGF5bWVudCBwcm9jZXNzaW5nIGVycm9yJyB9KSxcbiAgICAgICAgfTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogc3RhdHVzQ29kZSxcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgICAgfSxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogbWVzc2FnZSB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gR2VuZXJpYyBlcnJvciByZXNwb25zZVxuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXNDb2RlOiA1MDAsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICB9LFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ0ludGVybmFsIHNlcnZlciBlcnJvcicgfSksXG4gICAgfTtcbiAgfVxufTtcbiJdfQ==