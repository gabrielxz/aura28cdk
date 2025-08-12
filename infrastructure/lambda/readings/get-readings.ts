import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

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
    // Extract userId from path
    const userId = event.pathParameters?.userId;
    if (!userId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'userId is required' }),
      };
    }

    // Verify authenticated user matches requested userId
    const requestContext = event.requestContext as { authorizer?: { claims?: { sub?: string } } };
    const authenticatedUserId = requestContext?.authorizer?.claims?.sub;
    if (authenticatedUserId !== userId) {
      return {
        statusCode: 403,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'Unauthorized to view readings for this user' }),
      };
    }

    // Query all readings for this user
    const response = await dynamoDoc.send(
      new QueryCommand({
        TableName: process.env.READINGS_TABLE_NAME!,
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId,
        },
        ScanIndexForward: false, // Return in descending order (newest first)
      }),
    );

    // Transform readings to exclude content for list view
    const readings =
      response.Items?.map((item) => ({
        readingId: item.readingId,
        type: item.type,
        status: item.status,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })) || [];

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        readings,
        count: readings.length,
      }),
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        message: 'Failed to retrieve readings',
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
