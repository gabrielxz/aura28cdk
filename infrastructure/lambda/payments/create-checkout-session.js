"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const stripe_1 = __importDefault(require("stripe"));
const client_ssm_1 = require("@aws-sdk/client-ssm");
const ssmClient = new client_ssm_1.SSMClient({});
let stripeClient = null;
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
            const allowedPriceIds = process.env.ALLOWED_PRICE_IDS?.split(',') || [];
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3JlYXRlLWNoZWNrb3V0LXNlc3Npb24uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJjcmVhdGUtY2hlY2tvdXQtc2Vzc2lvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7QUFDQSxvREFBNEI7QUFDNUIsb0RBQXFFO0FBRXJFLE1BQU0sU0FBUyxHQUFHLElBQUksc0JBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUNwQyxJQUFJLFlBQVksR0FBa0IsSUFBSSxDQUFDO0FBRXZDLG9EQUFvRDtBQUNwRCxLQUFLLFVBQVUsZUFBZTtJQUM1QixJQUFJLFlBQVk7UUFBRSxPQUFPLFlBQVksQ0FBQztJQUV0QyxJQUFJLENBQUM7UUFDSCxNQUFNLFdBQVcsR0FBRyxNQUFNLFNBQVMsQ0FBQyxJQUFJLENBQ3RDLElBQUksZ0NBQW1CLENBQUM7WUFDdEIsSUFBSSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsNkJBQTZCO1lBQy9DLGNBQWMsRUFBRSxJQUFJO1NBQ3JCLENBQUMsQ0FDSCxDQUFDO1FBRUYsSUFBSSxDQUFDLFdBQVcsQ0FBQyxTQUFTLEVBQUUsS0FBSyxFQUFFLENBQUM7WUFDbEMsTUFBTSxJQUFJLEtBQUssQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFDO1FBQ3JELENBQUM7UUFFRCxZQUFZLEdBQUcsSUFBSSxnQkFBTSxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFO1lBQ3JELFVBQVUsRUFBRSxrQkFBa0I7WUFDOUIsVUFBVSxFQUFFLElBQUk7U0FDakIsQ0FBQyxDQUFDO1FBRUgsT0FBTyxZQUFZLENBQUM7SUFDdEIsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLGdDQUFnQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3ZELE1BQU0sSUFBSSxLQUFLLENBQUMsb0NBQW9DLENBQUMsQ0FBQztJQUN4RCxDQUFDO0FBQ0gsQ0FBQztBQVdNLE1BQU0sT0FBTyxHQUFHLEtBQUss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QUFHLEtBQWdFLENBQUM7WUFDckYsTUFBTSxVQUFVLEdBQUcsV0FBVyxDQUFDLFVBQVUsSUFBSSxHQUFHLENBQUM7WUFDakQsTUFBTSxPQUFPLEdBQUcsV0FBVyxDQUFDLE9BQU8sSUFBSSwwQkFBMEIsQ0FBQztZQUVsRSxxREFBcUQ7WUFDckQsSUFBSSxVQUFVLElBQUksR0FBRyxFQUFFLENBQUM7Z0JBQ3RCLE9BQU87b0JBQ0wsVUFBVSxFQUFFLEdBQUc7b0JBQ2YsT0FBTyxFQUFFO3dCQUNQLGNBQWMsRUFBRSxrQkFBa0I7d0JBQ2xDLDZCQUE2QixFQUFFLEdBQUc7cUJBQ25DO29CQUNELElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsS0FBSyxFQUFFLDBCQUEwQixFQUFFLENBQUM7aUJBQzVELENBQUM7WUFDSixDQUFDO1lBRUQsT0FBTztnQkFDTCxVQUFVLEVBQUUsVUFBVTtnQkFDdEIsT0FBTyxFQUFFO29CQUNQLGNBQWMsRUFBRSxrQkFBa0I7b0JBQ2xDLDZCQUE2QixFQUFFLEdBQUc7aUJBQ25DO2dCQUNELElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxDQUFDO2FBQ3pDLENBQUM7UUFDSixDQUFDO1FBRUQseUJBQXlCO1FBQ3pCLE9BQU87WUFDTCxVQUFVLEVBQUUsR0FBRztZQUNmLE9BQU8sRUFBRTtnQkFDUCxjQUFjLEVBQUUsa0JBQWtCO2dCQUNsQyw2QkFBNkIsRUFBRSxHQUFHO2FBQ25DO1lBQ0QsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxLQUFLLEVBQUUsdUJBQXVCLEVBQUUsQ0FBQztTQUN6RCxDQUFDO0lBQ0osQ0FBQztBQUNILENBQUMsQ0FBQztBQTNSVyxRQUFBLE9BQU8sV0EyUmxCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQVBJR2F0ZXdheVByb3h5RXZlbnQsIEFQSUdhdGV3YXlQcm94eVJlc3VsdCB9IGZyb20gJ2F3cy1sYW1iZGEnO1xuaW1wb3J0IFN0cmlwZSBmcm9tICdzdHJpcGUnO1xuaW1wb3J0IHsgU1NNQ2xpZW50LCBHZXRQYXJhbWV0ZXJDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXNzbSc7XG5cbmNvbnN0IHNzbUNsaWVudCA9IG5ldyBTU01DbGllbnQoe30pO1xubGV0IHN0cmlwZUNsaWVudDogU3RyaXBlIHwgbnVsbCA9IG51bGw7XG5cbi8vIENhY2hlIHRoZSBTdHJpcGUgY2xpZW50IGFjcm9zcyBMYW1iZGEgaW52b2NhdGlvbnNcbmFzeW5jIGZ1bmN0aW9uIGdldFN0cmlwZUNsaWVudCgpOiBQcm9taXNlPFN0cmlwZT4ge1xuICBpZiAoc3RyaXBlQ2xpZW50KSByZXR1cm4gc3RyaXBlQ2xpZW50O1xuXG4gIHRyeSB7XG4gICAgY29uc3QgYXBpS2V5UGFyYW0gPSBhd2FpdCBzc21DbGllbnQuc2VuZChcbiAgICAgIG5ldyBHZXRQYXJhbWV0ZXJDb21tYW5kKHtcbiAgICAgICAgTmFtZTogcHJvY2Vzcy5lbnYuU1RSSVBFX0FQSV9LRVlfUEFSQU1FVEVSX05BTUUsXG4gICAgICAgIFdpdGhEZWNyeXB0aW9uOiB0cnVlLFxuICAgICAgfSksXG4gICAgKTtcblxuICAgIGlmICghYXBpS2V5UGFyYW0uUGFyYW1ldGVyPy5WYWx1ZSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdTdHJpcGUgQVBJIGtleSBub3QgZm91bmQgaW4gU1NNJyk7XG4gICAgfVxuXG4gICAgc3RyaXBlQ2xpZW50ID0gbmV3IFN0cmlwZShhcGlLZXlQYXJhbS5QYXJhbWV0ZXIuVmFsdWUsIHtcbiAgICAgIGFwaVZlcnNpb246ICcyMDI1LTA3LTMwLmJhc2lsJyxcbiAgICAgIHR5cGVzY3JpcHQ6IHRydWUsXG4gICAgfSk7XG5cbiAgICByZXR1cm4gc3RyaXBlQ2xpZW50O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGZldGNoaW5nIFN0cmlwZSBBUEkga2V5OicsIGVycm9yKTtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZhaWxlZCB0byBpbml0aWFsaXplIFN0cmlwZSBjbGllbnQnKTtcbiAgfVxufVxuXG5pbnRlcmZhY2UgQ3JlYXRlQ2hlY2tvdXRTZXNzaW9uUmVxdWVzdCB7XG4gIHNlc3Npb25UeXBlOiAnc3Vic2NyaXB0aW9uJyB8ICdvbmUtdGltZSc7XG4gIHByaWNlSWQ/OiBzdHJpbmc7XG4gIHN1Y2Nlc3NVcmw6IHN0cmluZztcbiAgY2FuY2VsVXJsOiBzdHJpbmc7XG4gIGN1c3RvbWVyRW1haWw/OiBzdHJpbmc7XG4gIG1ldGFkYXRhPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcbn1cblxuZXhwb3J0IGNvbnN0IGhhbmRsZXIgPSBhc3luYyAoZXZlbnQ6IEFQSUdhdGV3YXlQcm94eUV2ZW50KTogUHJvbWlzZTxBUElHYXRld2F5UHJveHlSZXN1bHQ+ID0+IHtcbiAgY29uc29sZS5pbmZvKCdDcmVhdGUgY2hlY2tvdXQgc2Vzc2lvbiByZXF1ZXN0OicsIHtcbiAgICBwYXRoOiBldmVudC5wYXRoLFxuICAgIHBhdGhQYXJhbWV0ZXJzOiBldmVudC5wYXRoUGFyYW1ldGVycyxcbiAgICBoZWFkZXJzOiB7XG4gICAgICAuLi5ldmVudC5oZWFkZXJzLFxuICAgICAgQXV0aG9yaXphdGlvbjogZXZlbnQuaGVhZGVycy5BdXRob3JpemF0aW9uID8gJ0JlYXJlciBbUkVEQUNURURdJyA6IHVuZGVmaW5lZCxcbiAgICB9LFxuICB9KTtcblxuICB0cnkge1xuICAgIC8vIEV4dHJhY3QgdXNlcklkIGZyb20gcGF0aCBwYXJhbWV0ZXJzXG4gICAgY29uc3QgdXNlcklkID0gZXZlbnQucGF0aFBhcmFtZXRlcnM/LnVzZXJJZDtcbiAgICBpZiAoIXVzZXJJZCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxuICAgICAgICB9LFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnTWlzc2luZyB1c2VySWQgcGFyYW1ldGVyJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gRXh0cmFjdCB1c2VyIHN1YiBmcm9tIGF1dGhvcml6ZXIgY29udGV4dFxuICAgIGNvbnN0IGF1dGhvcml6ZXJVc2VySWQgPSBldmVudC5yZXF1ZXN0Q29udGV4dC5hdXRob3JpemVyPy5jbGFpbXM/LnN1YjtcbiAgICBjb25zdCB1c2VyRW1haWwgPSBldmVudC5yZXF1ZXN0Q29udGV4dC5hdXRob3JpemVyPy5jbGFpbXM/LmVtYWlsO1xuXG4gICAgaWYgKCFhdXRob3JpemVyVXNlcklkKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDEsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICAgIH0sXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdVbmF1dGhvcml6ZWQnIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBWZXJpZnkgdXNlciBjYW4gb25seSBjcmVhdGUgc2Vzc2lvbnMgZm9yIHRoZWlyIG93biBhY2NvdW50XG4gICAgaWYgKHVzZXJJZCAhPT0gYXV0aG9yaXplclVzZXJJZCkge1xuICAgICAgY29uc29sZS53YXJuKCdVc2VyIGF0dGVtcHRlZCB0byBjcmVhdGUgY2hlY2tvdXQgc2Vzc2lvbiBmb3IgYW5vdGhlciB1c2VyOicsIHtcbiAgICAgICAgcmVxdWVzdGVkVXNlcklkOiB1c2VySWQsXG4gICAgICAgIGF1dGhvcml6ZXJVc2VySWQsXG4gICAgICB9KTtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMyxcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgICAgfSxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ0ZvcmJpZGRlbicgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIFBhcnNlIHJlcXVlc3QgYm9keVxuICAgIGlmICghZXZlbnQuYm9keSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxuICAgICAgICB9LFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnTWlzc2luZyByZXF1ZXN0IGJvZHknIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBsZXQgcmVxdWVzdEJvZHk6IENyZWF0ZUNoZWNrb3V0U2Vzc2lvblJlcXVlc3Q7XG4gICAgdHJ5IHtcbiAgICAgIHJlcXVlc3RCb2R5ID0gSlNPTi5wYXJzZShldmVudC5ib2R5KTtcbiAgICB9IGNhdGNoIChfcGFyc2VFcnJvcikge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxuICAgICAgICB9LFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnSW52YWxpZCBKU09OIGluIHJlcXVlc3QgYm9keScgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIFZhbGlkYXRlIHJlcXVpcmVkIGZpZWxkc1xuICAgIGNvbnN0IHsgc2Vzc2lvblR5cGUsIHByaWNlSWQsIHN1Y2Nlc3NVcmwsIGNhbmNlbFVybCwgY3VzdG9tZXJFbWFpbCwgbWV0YWRhdGEgfSA9IHJlcXVlc3RCb2R5O1xuXG4gICAgaWYgKCFzZXNzaW9uVHlwZSB8fCAhWydzdWJzY3JpcHRpb24nLCAnb25lLXRpbWUnXS5pbmNsdWRlcyhzZXNzaW9uVHlwZSkpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgICAgfSxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIGVycm9yOiAnSW52YWxpZCBvciBtaXNzaW5nIHNlc3Npb25UeXBlLiBNdXN0IGJlIFwic3Vic2NyaXB0aW9uXCIgb3IgXCJvbmUtdGltZVwiJyxcbiAgICAgICAgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIGlmICghc3VjY2Vzc1VybCB8fCAhY2FuY2VsVXJsKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICAgIH0sXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdNaXNzaW5nIHN1Y2Nlc3NVcmwgb3IgY2FuY2VsVXJsJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gVmFsaWRhdGUgVVJMcyBhcmUgYWJzb2x1dGVcbiAgICB0cnkge1xuICAgICAgbmV3IFVSTChzdWNjZXNzVXJsKTtcbiAgICAgIG5ldyBVUkwoY2FuY2VsVXJsKTtcbiAgICB9IGNhdGNoIChfdXJsRXJyb3IpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgICAgfSxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ0ludmFsaWQgc3VjY2Vzc1VybCBvciBjYW5jZWxVcmwuIE11c3QgYmUgYWJzb2x1dGUgVVJMcycgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIEdldCBTdHJpcGUgY2xpZW50XG4gICAgY29uc3Qgc3RyaXBlID0gYXdhaXQgZ2V0U3RyaXBlQ2xpZW50KCk7XG5cbiAgICAvLyBCdWlsZCBsaW5lIGl0ZW1zIGJhc2VkIG9uIHNlc3Npb24gdHlwZVxuICAgIGNvbnN0IGxpbmVJdGVtczogU3RyaXBlLkNoZWNrb3V0LlNlc3Npb25DcmVhdGVQYXJhbXMuTGluZUl0ZW1bXSA9IFtdO1xuXG4gICAgaWYgKHNlc3Npb25UeXBlID09PSAnc3Vic2NyaXB0aW9uJykge1xuICAgICAgLy8gRm9yIHN1YnNjcmlwdGlvbnMsIHdlIG5lZWQgYSBwcmljZSBJRFxuICAgICAgaWYgKCFwcmljZUlkKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ3ByaWNlSWQgaXMgcmVxdWlyZWQgZm9yIHN1YnNjcmlwdGlvbiBzZXNzaW9ucycgfSksXG4gICAgICAgIH07XG4gICAgICB9XG5cbiAgICAgIC8vIFZhbGlkYXRlIHRoYXQgdGhlIHByaWNlIElEIGlzIGluIHRoZSBhbGxvd2VkIGxpc3QgKGlmIGNvbmZpZ3VyZWQpXG4gICAgICBjb25zdCBhbGxvd2VkUHJpY2VJZHMgPSBwcm9jZXNzLmVudi5BTExPV0VEX1BSSUNFX0lEUz8uc3BsaXQoJywnKSB8fCBbXTtcbiAgICAgIGlmIChhbGxvd2VkUHJpY2VJZHMubGVuZ3RoID4gMCAmJiAhYWxsb3dlZFByaWNlSWRzLmluY2x1ZGVzKHByaWNlSWQpKSB7XG4gICAgICAgIGNvbnNvbGUud2FybignQXR0ZW1wdGVkIHRvIHVzZSBkaXNhbGxvd2VkIHByaWNlIElEOicsIHsgcHJpY2VJZCwgdXNlcklkIH0pO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgICAgICB9LFxuICAgICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdJbnZhbGlkIHByaWNlIElEJyB9KSxcbiAgICAgICAgfTtcbiAgICAgIH1cblxuICAgICAgbGluZUl0ZW1zLnB1c2goe1xuICAgICAgICBwcmljZTogcHJpY2VJZCxcbiAgICAgICAgcXVhbnRpdHk6IDEsXG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gRm9yIG9uZS10aW1lIHBheW1lbnRzLCB3ZSBjYW4gZWl0aGVyIHVzZSBhIHByaWNlIElEIG9yIGNyZWF0ZSBhIGR5bmFtaWMgcHJpY2VcbiAgICAgIGlmIChwcmljZUlkKSB7XG4gICAgICAgIGxpbmVJdGVtcy5wdXNoKHtcbiAgICAgICAgICBwcmljZTogcHJpY2VJZCxcbiAgICAgICAgICBxdWFudGl0eTogMSxcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBEZWZhdWx0IG9uZS10aW1lIHBheW1lbnQgY29uZmlndXJhdGlvblxuICAgICAgICAvLyBUaGlzIGNvdWxkIGJlIGVuaGFuY2VkIHRvIGFjY2VwdCBhbW91bnQvY3VycmVuY3kgZnJvbSB0aGUgcmVxdWVzdFxuICAgICAgICBsaW5lSXRlbXMucHVzaCh7XG4gICAgICAgICAgcHJpY2VfZGF0YToge1xuICAgICAgICAgICAgY3VycmVuY3k6ICd1c2QnLFxuICAgICAgICAgICAgcHJvZHVjdF9kYXRhOiB7XG4gICAgICAgICAgICAgIG5hbWU6ICdBdXJhMjggUmVhZGluZycsXG4gICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnT25lLXRpbWUgYXN0cm9sb2dpY2FsIHJlYWRpbmcnLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHVuaXRfYW1vdW50OiAyOTAwLCAvLyAkMjkuMDAgaW4gY2VudHNcbiAgICAgICAgICB9LFxuICAgICAgICAgIHF1YW50aXR5OiAxLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBDcmVhdGUgU3RyaXBlIGNoZWNrb3V0IHNlc3Npb25cbiAgICBjb25zdCBzZXNzaW9uUGFyYW1zOiBTdHJpcGUuQ2hlY2tvdXQuU2Vzc2lvbkNyZWF0ZVBhcmFtcyA9IHtcbiAgICAgIG1vZGU6IHNlc3Npb25UeXBlID09PSAnc3Vic2NyaXB0aW9uJyA/ICdzdWJzY3JpcHRpb24nIDogJ3BheW1lbnQnLFxuICAgICAgcGF5bWVudF9tZXRob2RfdHlwZXM6IFsnY2FyZCddLFxuICAgICAgbGluZV9pdGVtczogbGluZUl0ZW1zLFxuICAgICAgc3VjY2Vzc191cmw6IHN1Y2Nlc3NVcmwsXG4gICAgICBjYW5jZWxfdXJsOiBjYW5jZWxVcmwsXG4gICAgICBjdXN0b21lcl9lbWFpbDogY3VzdG9tZXJFbWFpbCB8fCB1c2VyRW1haWwsXG4gICAgICBjbGllbnRfcmVmZXJlbmNlX2lkOiB1c2VySWQsXG4gICAgICBtZXRhZGF0YToge1xuICAgICAgICB1c2VySWQsXG4gICAgICAgIHNlc3Npb25UeXBlLFxuICAgICAgICAuLi5tZXRhZGF0YSxcbiAgICAgIH0sXG4gICAgICAvLyBBZGRpdGlvbmFsIG9wdGlvbnMgZm9yIGJldHRlciBVWFxuICAgICAgYmlsbGluZ19hZGRyZXNzX2NvbGxlY3Rpb246ICdhdXRvJyxcbiAgICAgIGFsbG93X3Byb21vdGlvbl9jb2RlczogdHJ1ZSxcbiAgICAgIC8vIEZvciBzdWJzY3JpcHRpb25zLCBhbGxvdyBjdXN0b21lciB0byBtYW5hZ2UgdGhlaXIgc3Vic2NyaXB0aW9uXG4gICAgICAuLi4oc2Vzc2lvblR5cGUgPT09ICdzdWJzY3JpcHRpb24nICYmIHtcbiAgICAgICAgc3Vic2NyaXB0aW9uX2RhdGE6IHtcbiAgICAgICAgICBtZXRhZGF0YToge1xuICAgICAgICAgICAgdXNlcklkLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9KSxcbiAgICB9O1xuXG4gICAgY29uc29sZS5pbmZvKCdDcmVhdGluZyBTdHJpcGUgY2hlY2tvdXQgc2Vzc2lvbiB3aXRoIHBhcmFtczonLCB7XG4gICAgICBtb2RlOiBzZXNzaW9uUGFyYW1zLm1vZGUsXG4gICAgICBjbGllbnRfcmVmZXJlbmNlX2lkOiBzZXNzaW9uUGFyYW1zLmNsaWVudF9yZWZlcmVuY2VfaWQsXG4gICAgICBsaW5lX2l0ZW1zX2NvdW50OiBsaW5lSXRlbXMubGVuZ3RoLFxuICAgIH0pO1xuXG4gICAgY29uc3Qgc2Vzc2lvbiA9IGF3YWl0IHN0cmlwZS5jaGVja291dC5zZXNzaW9ucy5jcmVhdGUoc2Vzc2lvblBhcmFtcyk7XG5cbiAgICBjb25zb2xlLmluZm8oJ1N1Y2Nlc3NmdWxseSBjcmVhdGVkIGNoZWNrb3V0IHNlc3Npb246Jywge1xuICAgICAgc2Vzc2lvbklkOiBzZXNzaW9uLmlkLFxuICAgICAgdXNlcklkLFxuICAgICAgc2Vzc2lvblR5cGUsXG4gICAgfSk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogMjAwLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxuICAgICAgfSxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgc2Vzc2lvbklkOiBzZXNzaW9uLmlkLFxuICAgICAgICB1cmw6IHNlc3Npb24udXJsLFxuICAgICAgfSksXG4gICAgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBjcmVhdGluZyBjaGVja291dCBzZXNzaW9uOicsIGVycm9yKTtcblxuICAgIC8vIEhhbmRsZSBTdHJpcGUtc3BlY2lmaWMgZXJyb3JzXG4gICAgaWYgKFxuICAgICAgZXJyb3IgJiZcbiAgICAgIHR5cGVvZiBlcnJvciA9PT0gJ29iamVjdCcgJiZcbiAgICAgIGVycm9yICE9PSBudWxsICYmXG4gICAgICAndHlwZScgaW4gZXJyb3IgJiZcbiAgICAgICdzdGF0dXNDb2RlJyBpbiBlcnJvclxuICAgICkge1xuICAgICAgY29uc3Qgc3RyaXBlRXJyb3IgPSBlcnJvciBhcyB7IHR5cGU6IHN0cmluZzsgc3RhdHVzQ29kZT86IG51bWJlcjsgbWVzc2FnZT86IHN0cmluZyB9O1xuICAgICAgY29uc3Qgc3RhdHVzQ29kZSA9IHN0cmlwZUVycm9yLnN0YXR1c0NvZGUgfHwgNTAwO1xuICAgICAgY29uc3QgbWVzc2FnZSA9IHN0cmlwZUVycm9yLm1lc3NhZ2UgfHwgJ1BheW1lbnQgcHJvY2Vzc2luZyBlcnJvcic7XG5cbiAgICAgIC8vIERvbid0IGV4cG9zZSBzZW5zaXRpdmUgZXJyb3IgZGV0YWlscyB0byB0aGUgY2xpZW50XG4gICAgICBpZiAoc3RhdHVzQ29kZSA+PSA1MDApIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBzdGF0dXNDb2RlOiA1MDAsXG4gICAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnUGF5bWVudCBwcm9jZXNzaW5nIGVycm9yJyB9KSxcbiAgICAgICAgfTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogc3RhdHVzQ29kZSxcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgICAgfSxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogbWVzc2FnZSB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gR2VuZXJpYyBlcnJvciByZXNwb25zZVxuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXNDb2RlOiA1MDAsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICB9LFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ0ludGVybmFsIHNlcnZlciBlcnJvcicgfSksXG4gICAgfTtcbiAgfVxufTtcbiJdfQ==