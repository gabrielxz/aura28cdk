import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.TABLE_NAME!;

interface ProfileData {
  email: string;
  birthName: string;
  birthDate: string;
  birthTime?: string;
  birthCity: string;
  birthState: string;
  birthCountry: string;
  birthLatitude?: number;
  birthLongitude?: number;
}

interface ValidationError {
  field: string;
  message: string;
}

const validateBirthData = (data: any): ValidationError[] => {
  const errors: ValidationError[] = [];

  // Email validation
  if (!data.email || typeof data.email !== 'string') {
    errors.push({ field: 'email', message: 'Email is required' });
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.push({ field: 'email', message: 'Invalid email format' });
  }

  // Birth name validation
  if (!data.birthName || typeof data.birthName !== 'string') {
    errors.push({ field: 'birthName', message: 'Birth name is required' });
  } else if (data.birthName.trim().length === 0 || data.birthName.length > 256) {
    errors.push({ field: 'birthName', message: 'Birth name must be 1-256 characters' });
  } else if (!/^[a-zA-Z\s\-']+$/.test(data.birthName)) {
    errors.push({ field: 'birthName', message: 'Birth name contains invalid characters' });
  }

  // Birth date validation
  if (!data.birthDate || typeof data.birthDate !== 'string') {
    errors.push({ field: 'birthDate', message: 'Birth date is required' });
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(data.birthDate)) {
    errors.push({ field: 'birthDate', message: 'Birth date must be in YYYY-MM-DD format' });
  } else {
    const date = new Date(data.birthDate);
    const now = new Date();
    const minDate = new Date('1900-01-01');

    if (isNaN(date.getTime())) {
      errors.push({ field: 'birthDate', message: 'Invalid birth date' });
    } else if (date > now) {
      errors.push({ field: 'birthDate', message: 'Birth date cannot be in the future' });
    } else if (date < minDate) {
      errors.push({ field: 'birthDate', message: 'Birth date cannot be before 1900' });
    }
  }

  // Birth time validation (optional)
  if (data.birthTime && typeof data.birthTime === 'string') {
    if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(data.birthTime)) {
      errors.push({ field: 'birthTime', message: 'Birth time must be in HH:MM format (24-hour)' });
    }
  }

  // Location validation
  const locationRegex = /^[a-zA-Z\s\-',\.]+$/;

  if (!data.birthCity || typeof data.birthCity !== 'string') {
    errors.push({ field: 'birthCity', message: 'Birth city is required' });
  } else if (data.birthCity.trim().length === 0 || data.birthCity.length > 100) {
    errors.push({ field: 'birthCity', message: 'Birth city must be 1-100 characters' });
  } else if (!locationRegex.test(data.birthCity)) {
    errors.push({ field: 'birthCity', message: 'Birth city contains invalid characters' });
  }

  if (!data.birthState || typeof data.birthState !== 'string') {
    errors.push({ field: 'birthState', message: 'Birth state/province is required' });
  } else if (data.birthState.trim().length === 0 || data.birthState.length > 100) {
    errors.push({ field: 'birthState', message: 'Birth state must be 1-100 characters' });
  } else if (!locationRegex.test(data.birthState)) {
    errors.push({ field: 'birthState', message: 'Birth state contains invalid characters' });
  }

  if (!data.birthCountry || typeof data.birthCountry !== 'string') {
    errors.push({ field: 'birthCountry', message: 'Birth country is required' });
  } else if (data.birthCountry.trim().length === 0 || data.birthCountry.length > 100) {
    errors.push({ field: 'birthCountry', message: 'Birth country must be 1-100 characters' });
  } else if (!locationRegex.test(data.birthCountry)) {
    errors.push({ field: 'birthCountry', message: 'Birth country contains invalid characters' });
  }

  // Future lat/long validation (when provided)
  if (data.birthLatitude !== undefined) {
    const lat = parseFloat(data.birthLatitude);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      errors.push({ field: 'birthLatitude', message: 'Invalid latitude' });
    }
  }

  if (data.birthLongitude !== undefined) {
    const lng = parseFloat(data.birthLongitude);
    if (isNaN(lng) || lng < -180 || lng > 180) {
      errors.push({ field: 'birthLongitude', message: 'Invalid longitude' });
    }
  }

  return errors;
};

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  // eslint-disable-next-line no-console
  console.log('Event:', JSON.stringify(event, null, 2));

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

    // Verify user can only update their own profile
    if (userId !== authorizerUserId) {
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
    let profileData: ProfileData;
    try {
      profileData = JSON.parse(event.body || '{}');
    } catch {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'Invalid JSON body' }),
      };
    }

    // Validate profile data
    const validationErrors = validateBirthData(profileData);
    if (validationErrors.length > 0) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'Validation failed',
          validationErrors,
        }),
      };
    }

    // Prepare item for DynamoDB
    const now = new Date().toISOString();

    // Build profile object without undefined values
    const profile: any = {
      birthName: profileData.birthName.trim(),
      birthDate: profileData.birthDate,
      birthCity: profileData.birthCity.trim(),
      birthState: profileData.birthState.trim(),
      birthCountry: profileData.birthCountry.trim(),
    };

    // Only add optional fields if they have values
    if (profileData.birthTime) {
      profile.birthTime = profileData.birthTime.trim();
    }

    if (profileData.birthLatitude !== undefined) {
      profile.birthLatitude = profileData.birthLatitude;
    }

    if (profileData.birthLongitude !== undefined) {
      profile.birthLongitude = profileData.birthLongitude;
    }

    const item = {
      userId,
      createdAt: 'PROFILE', // Fixed sort key for profile data
      email: profileData.email,
      profile,
      onboardingCompleted: true,
      updatedAt: now,
      firstCreatedAt: now, // Will be overwritten if profile already exists
    };

    // Save to DynamoDB
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
        ConditionExpression: 'attribute_not_exists(userId) OR attribute_exists(userId)',
      }),
    );

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        message: 'Profile updated successfully',
        profile: item,
      }),
    };
  } catch (error) {
    // eslint-disable-next-line no-console
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
