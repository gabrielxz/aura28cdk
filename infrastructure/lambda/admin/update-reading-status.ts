import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { logger } from '../utils/logger';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const READINGS_TABLE_NAME = process.env.READINGS_TABLE_NAME!;

const VALID_STATUSES = ['Processing', 'Ready', 'Failed', 'In Review'];

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  logger.info('Update reading status event:', event);

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

    // Parse request body
    const body = JSON.parse(event.body || '{}');
    const { status } = body;

    if (!status) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'Status is required' }),
      };
    }

    if (!VALID_STATUSES.includes(status)) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
        }),
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

    // Update the reading status
    const updateResult = await docClient.send(
      new UpdateCommand({
        TableName: READINGS_TABLE_NAME,
        Key: {
          userId: userId,
          readingId: readingId,
        },
        UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':status': status,
          ':updatedAt': new Date().toISOString(),
        },
        ReturnValues: 'ALL_NEW',
      }),
    );

    const updatedReading = updateResult.Attributes;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        readingId: updatedReading?.readingId,
        userId: updatedReading?.userId,
        type: updatedReading?.type,
        status: updatedReading?.status,
        createdAt: updatedReading?.createdAt,
        updatedAt: updatedReading?.updatedAt,
      }),
    };
  } catch (error) {
    logger.error('Error in update-reading-status handler:', error);
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
