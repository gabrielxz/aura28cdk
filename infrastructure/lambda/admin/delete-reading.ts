import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { logger } from '../utils/logger';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const READINGS_TABLE_NAME = process.env.READINGS_TABLE_NAME!;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  logger.info('Delete reading event:', event);

  try {
    // Check if user is admin
    const userGroups = event.requestContext?.authorizer?.claims?.['cognito:groups'];
    const isAdmin =
      userGroups &&
      (typeof userGroups === 'string'
        ? userGroups.split(',').includes('admin')
        : Array.isArray(userGroups) && userGroups.includes('admin'));

    if (!isAdmin) {
      return {
        statusCode: 403,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'Access denied. Admin privileges required.' }),
      };
    }

    // Get user ID and reading ID from path parameters
    const userId = event.pathParameters?.userId;
    const readingId = event.pathParameters?.readingId;
    if (!userId || !readingId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'User ID and Reading ID are required' }),
      };
    }

    // Check if reading exists
    const getResult = await docClient.send(
      new GetCommand({
        TableName: READINGS_TABLE_NAME,
        Key: {
          userId: userId,
          readingId: readingId,
        },
      }),
    );

    if (!getResult.Item) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'Reading not found' }),
      };
    }

    // Delete the reading
    await docClient.send(
      new DeleteCommand({
        TableName: READINGS_TABLE_NAME,
        Key: {
          userId: userId,
          readingId: readingId,
        },
      }),
    );

    logger.info(`Successfully deleted reading ${readingId} for user ${userId}`);

    return {
      statusCode: 204,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: '',
    };
  } catch (error) {
    logger.error('Error in delete-reading handler:', error);
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
