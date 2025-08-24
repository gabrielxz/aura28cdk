import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
export declare function clearCache(): void;
export declare const handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
