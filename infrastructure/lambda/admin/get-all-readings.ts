import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  GetCommand,
  ScanCommandInput,
} from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const READINGS_TABLE_NAME = process.env.READINGS_TABLE_NAME!;
const USER_TABLE_NAME = process.env.USER_TABLE_NAME!;

interface Reading {
  readingId: string;
  userId: string;
  type: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.info('Get all readings event:', JSON.stringify(event, null, 2));

  try {
    // Check if user is admin
    const userGroups = event.requestContext.authorizer?.claims?.['cognito:groups'];
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

    // Parse query parameters
    const queryParams = event.queryStringParameters || {};
    const startDate = queryParams.startDate;
    const endDate = queryParams.endDate;
    const status = queryParams.status;
    const type = queryParams.type;
    const userSearch = queryParams.userSearch;
    const limit = queryParams.limit ? parseInt(queryParams.limit, 10) : 25;
    const lastEvaluatedKey = queryParams.lastEvaluatedKey
      ? JSON.parse(Buffer.from(queryParams.lastEvaluatedKey, 'base64').toString())
      : undefined;

    // Build filter expression
    const filterExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, string | number> = {};

    if (startDate) {
      filterExpressions.push('createdAt >= :startDate');
      expressionAttributeValues[':startDate'] = startDate;
    }

    if (endDate) {
      filterExpressions.push('createdAt <= :endDate');
      expressionAttributeValues[':endDate'] = endDate + 'T23:59:59.999Z';
    }

    if (status) {
      filterExpressions.push('#status = :status');
      expressionAttributeNames['#status'] = 'status';
      expressionAttributeValues[':status'] = status;
    }

    if (type) {
      filterExpressions.push('#type = :type');
      expressionAttributeNames['#type'] = 'type';
      expressionAttributeValues[':type'] = type;
    }

    // Scan readings table
    const scanParams: ScanCommandInput = {
      TableName: READINGS_TABLE_NAME,
      Limit: limit,
      ExclusiveStartKey: lastEvaluatedKey,
    };

    if (filterExpressions.length > 0) {
      scanParams.FilterExpression = filterExpressions.join(' AND ');
      if (Object.keys(expressionAttributeNames).length > 0) {
        scanParams.ExpressionAttributeNames = expressionAttributeNames;
      }
      scanParams.ExpressionAttributeValues = expressionAttributeValues;
    }

    const scanResult = await docClient.send(new ScanCommand(scanParams));
    const readings = (scanResult.Items as Reading[]) || [];

    // If user search is provided, fetch user emails
    let filteredReadings = readings;
    if (userSearch) {
      // Fetch user profiles to match email
      const userPromises = [...new Set(readings.map((r) => r.userId))].map(async (userId) => {
        try {
          const userResult = await docClient.send(
            new GetCommand({
              TableName: USER_TABLE_NAME,
              Key: {
                userId: userId,
                createdAt: 'PROFILE',
              },
            }),
          );
          return userResult.Item;
        } catch (error) {
          console.warn(`Failed to fetch user ${userId}:`, error);
          return null;
        }
      });

      const users = await Promise.all(userPromises);
      const userMap = new Map(users.filter(Boolean).map((user) => [user!.userId, user!.email]));

      // Filter readings by user email
      filteredReadings = readings.filter((reading) => {
        const userEmail = userMap.get(reading.userId);
        return userEmail && userEmail.toLowerCase().includes(userSearch.toLowerCase());
      });

      // Add email to reading objects
      filteredReadings = filteredReadings.map((reading) => ({
        ...reading,
        userEmail: userMap.get(reading.userId),
      }));
    } else {
      // Still fetch emails for display
      const userIds = [...new Set(readings.map((r) => r.userId))];
      const userPromises = userIds.map(async (userId) => {
        try {
          const userResult = await docClient.send(
            new GetCommand({
              TableName: USER_TABLE_NAME,
              Key: {
                userId: userId,
                createdAt: 'PROFILE',
              },
            }),
          );
          return userResult.Item;
        } catch (error) {
          console.warn(`Failed to fetch user ${userId}:`, error);
          return null;
        }
      });

      const users = await Promise.all(userPromises);
      const userMap = new Map(users.filter(Boolean).map((user) => [user!.userId, user!.email]));

      filteredReadings = readings.map((reading) => ({
        ...reading,
        userEmail: userMap.get(reading.userId),
      }));
    }

    // Prepare response
    const response = {
      readings: filteredReadings,
      count: filteredReadings.length,
      lastEvaluatedKey: scanResult.LastEvaluatedKey
        ? Buffer.from(JSON.stringify(scanResult.LastEvaluatedKey)).toString('base64')
        : undefined,
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
    console.error('Error:', error);
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
