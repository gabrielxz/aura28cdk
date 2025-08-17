import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';

const dynamoClient = new DynamoDBClient({});
const dynamoDoc = DynamoDBDocumentClient.from(dynamoClient);
const ssmClient = new SSMClient({});
const s3Client = new S3Client({});

// Helper function to create sanitized error response
const createErrorResponse = (
  error: unknown,
  corsHeaders: Record<string, string>,
  context: Record<string, unknown> = {},
): APIGatewayProxyResult => {
  // Log detailed error to CloudWatch
  console.error('Error generating reading:', {
    error: error instanceof Error ? error.message : 'Unknown error',
    stack: error instanceof Error ? error.stack : undefined,
    ...context,
    timestamp: new Date().toISOString(),
  });

  // Return generic error message to user
  return {
    statusCode: 500,
    headers: corsHeaders,
    body: JSON.stringify({
      message:
        "We're sorry, but we couldn't generate your reading at this time. Please try again later.",
    }),
  };
};

interface OpenAIConfig {
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  userPromptTemplate: string;
}

interface CachedConfig {
  config: OpenAIConfig;
  systemPromptETag?: string;
  userPromptETag?: string;
}

// Cache configuration on cold start
let cachedConfig: CachedConfig | null = null;

// Fallback prompts in case S3 fails
const FALLBACK_SYSTEM_PROMPT =
  'You are an expert astrologer providing Soul Blueprint readings based on natal charts.';
const FALLBACK_USER_TEMPLATE = `Generate a Soul Blueprint reading for:
Name: {{birthName}}
Birth: {{birthDate}} {{birthTime}}
Location: {{birthCity}}, {{birthState}}, {{birthCountry}}

Natal Chart:
{{natalChartData}}

Provide insights on sun sign, moon sign, rising sign, and life path.`;

async function fetchS3Content(
  bucket: string,
  key: string,
): Promise<{ content: string; etag?: string }> {
  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );

    const content = (await response.Body?.transformToString()) || '';
    console.log(`Fetched S3 object: ${key}, ETag: ${response.ETag}`);

    return { content, etag: response.ETag };
  } catch (error) {
    console.error(`Failed to fetch S3 object ${key}:`, error);
    throw error;
  }
}

async function getOpenAIConfig(): Promise<OpenAIConfig> {
  // Return cached config if available
  if (cachedConfig) {
    console.log('Using cached configuration');
    return cachedConfig.config;
  }

  console.log('Loading configuration from SSM and S3...');

  const parameterNames = [
    process.env.OPENAI_API_KEY_PARAMETER_NAME,
    process.env.READING_MODEL_PARAMETER_NAME,
    process.env.READING_TEMPERATURE_PARAMETER_NAME,
    process.env.READING_MAX_TOKENS_PARAMETER_NAME,
    process.env.SYSTEM_PROMPT_S3KEY_PARAMETER_NAME,
    process.env.USER_PROMPT_S3KEY_PARAMETER_NAME,
  ];

  const bucketName = process.env.CONFIG_BUCKET_NAME;

  if (!bucketName) {
    throw new Error('CONFIG_BUCKET_NAME environment variable not set');
  }

  // Validate all parameter names are present
  const missingParams = parameterNames
    .map((name, index) => {
      const labels = [
        'OPENAI_API_KEY_PARAMETER_NAME',
        'READING_MODEL_PARAMETER_NAME',
        'READING_TEMPERATURE_PARAMETER_NAME',
        'READING_MAX_TOKENS_PARAMETER_NAME',
        'SYSTEM_PROMPT_S3KEY_PARAMETER_NAME',
        'USER_PROMPT_S3KEY_PARAMETER_NAME',
      ];
      return name ? null : labels[index];
    })
    .filter(Boolean);

  if (missingParams.length > 0) {
    throw new Error(`Missing environment variables: ${missingParams.join(', ')}`);
  }

  // Fetch all SSM parameters in parallel
  const parameterPromises = parameterNames.map((name) =>
    ssmClient.send(
      new GetParameterCommand({
        Name: name!,
        WithDecryption: true,
      }),
    ),
  );

  const responses = await Promise.all(parameterPromises);

  // Extract SSM values
  const ssmValues = responses.map((response, index) => {
    if (!response.Parameter?.Value) {
      throw new Error(`Parameter ${parameterNames[index]} not found in SSM`);
    }
    return response.Parameter.Value;
  });

  // Log parameter names (not values) for debugging
  console.log('Loaded SSM parameters:', {
    model: process.env.READING_MODEL_PARAMETER_NAME,
    temperature: process.env.READING_TEMPERATURE_PARAMETER_NAME,
    maxTokens: process.env.READING_MAX_TOKENS_PARAMETER_NAME,
    systemPromptKey: ssmValues[4],
    userPromptKey: ssmValues[5],
  });

  // Fetch prompts from S3
  let systemPrompt = FALLBACK_SYSTEM_PROMPT;
  let userPromptTemplate = FALLBACK_USER_TEMPLATE;
  let systemETag: string | undefined;
  let userETag: string | undefined;

  try {
    const [systemResult, userResult] = await Promise.all([
      fetchS3Content(bucketName, ssmValues[4]),
      fetchS3Content(bucketName, ssmValues[5]),
    ]);

    systemPrompt = systemResult.content || FALLBACK_SYSTEM_PROMPT;
    userPromptTemplate = userResult.content || FALLBACK_USER_TEMPLATE;
    systemETag = systemResult.etag;
    userETag = userResult.etag;
  } catch (error) {
    console.error('Failed to fetch prompts from S3, using fallback prompts:', error);
  }

  const config: OpenAIConfig = {
    apiKey: ssmValues[0],
    model: ssmValues[1],
    temperature: parseFloat(ssmValues[2]),
    maxTokens: parseInt(ssmValues[3], 10),
    systemPrompt,
    userPromptTemplate,
  };

  // Cache the configuration
  cachedConfig = {
    config,
    systemPromptETag: systemETag,
    userPromptETag: userETag,
  };

  return config;
}

async function getUserProfile(userId: string) {
  const response = await dynamoDoc.send(
    new GetCommand({
      TableName: process.env.USER_TABLE_NAME!,
      Key: {
        userId,
        createdAt: 'PROFILE',
      },
    }),
  );
  return response.Item;
}

async function getNatalChart(userId: string) {
  const response = await dynamoDoc.send(
    new GetCommand({
      TableName: process.env.NATAL_CHART_TABLE_NAME!,
      Key: {
        userId,
      },
    }),
  );
  return response.Item;
}

async function callOpenAI(prompt: string, config: OpenAIConfig): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: 'system',
          content: config.systemPrompt,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: config.temperature,
      max_tokens: config.maxTokens,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
  return data.choices[0].message.content;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Event:', JSON.stringify(event));

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
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
        body: JSON.stringify({ message: 'Unauthorized to generate reading for this user' }),
      };
    }

    // Get user profile and natal chart
    const [userProfile, natalChart] = await Promise.all([
      getUserProfile(userId),
      getNatalChart(userId),
    ]);

    if (!userProfile) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'User profile not found' }),
      };
    }

    if (!natalChart) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          message: 'Natal chart not generated. Please complete your profile first.',
        }),
      };
    }

    // Generate reading ID and timestamp
    const readingId = uuidv4();
    const timestamp = new Date().toISOString();

    // Create the reading record with status 'Processing'
    const readingRecord = {
      userId,
      readingId,
      type: 'Soul Blueprint',
      status: 'Processing',
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    // Save initial reading record
    await dynamoDoc.send(
      new PutCommand({
        TableName: process.env.READINGS_TABLE_NAME!,
        Item: readingRecord,
      }),
    );

    try {
      // Get OpenAI configuration
      const openAIConfig = await getOpenAIConfig();

      // Build user prompt from template
      const userPrompt = openAIConfig.userPromptTemplate
        .replace('{{birthName}}', userProfile.profile?.birthName || 'Unknown')
        .replace('{{birthDate}}', userProfile.profile?.birthDate || 'Unknown')
        .replace('{{birthTime}}', userProfile.profile?.birthTime || 'Unknown')
        .replace('{{birthCity}}', userProfile.profile?.birthCity || 'Unknown')
        .replace('{{birthState}}', userProfile.profile?.birthState || 'Unknown')
        .replace('{{birthCountry}}', userProfile.profile?.birthCountry || 'Unknown')
        .replace('{{natalChartData}}', JSON.stringify(natalChart, null, 2));

      // Call OpenAI API
      const content = await callOpenAI(userPrompt, openAIConfig);

      // Update reading with content and status
      const updatedReading = {
        ...readingRecord,
        content,
        status: 'Ready',
        updatedAt: new Date().toISOString(),
      };

      await dynamoDoc.send(
        new PutCommand({
          TableName: process.env.READINGS_TABLE_NAME!,
          Item: updatedReading,
        }),
      );

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          message: 'Reading generated successfully',
          readingId,
          status: 'Ready',
        }),
      };
    } catch (error) {
      // Log detailed error for debugging
      console.error('Error during reading generation:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        userId,
        readingId,
        timestamp: new Date().toISOString(),
      });

      // Update reading status to Failed with sanitized error
      await dynamoDoc.send(
        new PutCommand({
          TableName: process.env.READINGS_TABLE_NAME!,
          Item: {
            ...readingRecord,
            status: 'Failed',
            error: 'GENERATION_FAILED', // Sanitized error indicator
            updatedAt: new Date().toISOString(),
          },
        }),
      );

      throw error;
    }
  } catch (error) {
    // Use helper function to create sanitized error response
    return createErrorResponse(error, corsHeaders, {
      userId: event.pathParameters?.userId,
      path: event.path,
      method: event.httpMethod,
    });
  }
};
