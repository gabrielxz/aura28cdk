import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  ListUsersCommandInput,
} from '@aws-sdk/client-cognito-identity-provider';

const cognitoClient = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.USER_POOL_ID!;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.info('Get all users event:', JSON.stringify(event, null, 2));

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
    const searchTerm = queryParams.search;
    const nextToken = queryParams.nextToken;

    // Build list users parameters
    const listUsersParams: ListUsersCommandInput = {
      UserPoolId: USER_POOL_ID,
      Limit: 60, // Max allowed by Cognito
      PaginationToken: nextToken,
    };

    // Add filter if search term provided
    if (searchTerm) {
      // Search by email
      listUsersParams.Filter = `email ^= "${searchTerm}"`;
    }

    // List users from Cognito
    const listUsersResult = await cognitoClient.send(new ListUsersCommand(listUsersParams));

    // Transform user data
    const users = (listUsersResult.Users || []).map((user) => {
      const emailAttr = user.Attributes?.find((attr) => attr.Name === 'email');
      const givenNameAttr = user.Attributes?.find((attr) => attr.Name === 'given_name');
      const familyNameAttr = user.Attributes?.find((attr) => attr.Name === 'family_name');

      const name =
        givenNameAttr?.Value && familyNameAttr?.Value
          ? `${givenNameAttr.Value} ${familyNameAttr.Value}`
          : givenNameAttr?.Value || familyNameAttr?.Value || undefined;

      return {
        userId: user.Username!,
        email: emailAttr?.Value || 'No email',
        name,
        createdAt: user.UserCreateDate?.toISOString() || '',
      };
    });

    // Prepare response
    const response = {
      users,
      count: users.length,
      nextToken: listUsersResult.PaginationToken,
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
