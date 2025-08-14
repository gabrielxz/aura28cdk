import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { logger } from '../utils/logger';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const READINGS_TABLE_NAME = process.env.READINGS_TABLE_NAME!;
const USER_TABLE_NAME = process.env.USER_TABLE_NAME!;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  logger.info('Get reading details event:', event);

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

    // Get reading ID from path parameters
    const readingId = event.pathParameters?.readingId;
    if (!readingId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'Reading ID is required' }),
      };
    }

    // Fetch reading from DynamoDB
    const readingResult = await docClient.send(
      new GetCommand({
        TableName: READINGS_TABLE_NAME,
        Key: {
          readingId: readingId,
        },
      }),
    );

    if (!readingResult.Item) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'Reading not found' }),
      };
    }

    const reading = readingResult.Item;

    // Fetch user email if userId exists
    if (reading.userId) {
      try {
        const userResult = await docClient.send(
          new GetCommand({
            TableName: USER_TABLE_NAME,
            Key: {
              userId: reading.userId,
              createdAt: 'PROFILE',
            },
          }),
        );

        if (userResult.Item) {
          reading.userEmail = userResult.Item.email;
          // Include user profile birth information if available
          if (userResult.Item.profile) {
            reading.userProfile = {
              birthName: userResult.Item.profile.birthName,
              birthDate: userResult.Item.profile.birthDate,
              birthTime: userResult.Item.profile.birthTime,
              birthCity: userResult.Item.profile.birthCity,
              birthState: userResult.Item.profile.birthState,
              birthCountry: userResult.Item.profile.birthCountry,
            };
          }
        }
      } catch (error) {
        logger.warn(`Failed to fetch user ${reading.userId}:`, error);
      }
    }

    // Format the response with full details
    const response = {
      readingId: reading.readingId,
      userId: reading.userId,
      userEmail: reading.userEmail,
      userProfile: reading.userProfile || null,
      type: reading.type,
      status: reading.status,
      createdAt: reading.createdAt,
      updatedAt: reading.updatedAt,
      content: reading.content || null,
      error: reading.error || null,
      metadata: reading.metadata || null,
    };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(response),
    };
  } catch (error) {
    logger.error('Error in get-reading-details handler:', error);
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
