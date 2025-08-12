import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const dynamoDoc = DynamoDBDocumentClient.from(dynamoClient);

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Event:', JSON.stringify(event));

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
  };

  try {
    // Extract userId and readingId from path
    const userId = event.pathParameters?.userId;
    const readingId = event.pathParameters?.readingId;

    if (!userId || !readingId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'userId and readingId are required' }),
      };
    }

    // Verify authenticated user matches requested userId
    const requestContext = event.requestContext as { authorizer?: { claims?: { sub?: string } } };
    const authenticatedUserId = requestContext?.authorizer?.claims?.sub;
    if (authenticatedUserId !== userId) {
      return {
        statusCode: 403,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'Unauthorized to view this reading' }),
      };
    }

    // Get the specific reading
    const response = await dynamoDoc.send(
      new GetCommand({
        TableName: process.env.READINGS_TABLE_NAME!,
        Key: {
          userId,
          readingId,
        },
      }),
    );

    if (!response.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'Reading not found' }),
      };
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(response.Item),
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        message: 'Failed to retrieve reading',
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
