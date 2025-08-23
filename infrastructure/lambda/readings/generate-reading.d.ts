import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
interface InternalInvocationEvent {
    source: 'webhook';
    userId: string;
    internalSecret: string;
    metadata?: Record<string, string | number | boolean>;
    requestContext?: {
        authorizer?: {
            claims?: {
                sub?: string;
            };
        };
    };
}
export declare const handler: (event: APIGatewayProxyEvent | InternalInvocationEvent) => Promise<APIGatewayProxyResult>;
export {};
