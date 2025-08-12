import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { v4 as uuidv4 } from 'uuid';

const dynamoClient = new DynamoDBClient({});
const dynamoDoc = DynamoDBDocumentClient.from(dynamoClient);
const ssmClient = new SSMClient({});

interface OpenAIConfig {
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  userPromptTemplate: string;
}

async function getOpenAIConfig(): Promise<OpenAIConfig> {
  const parameterNames = [
    process.env.OPENAI_API_KEY_PARAMETER_NAME,
    process.env.OPENAI_MODEL_PARAMETER_NAME,
    process.env.OPENAI_TEMPERATURE_PARAMETER_NAME,
    process.env.OPENAI_MAX_TOKENS_PARAMETER_NAME,
    process.env.OPENAI_SYSTEM_PROMPT_PARAMETER_NAME,
    process.env.OPENAI_USER_PROMPT_TEMPLATE_PARAMETER_NAME,
  ];

  // Validate all parameter names are present
  const missingParams = parameterNames
    .map((name, index) => {
      const labels = [
        'OPENAI_API_KEY_PARAMETER_NAME',
        'OPENAI_MODEL_PARAMETER_NAME',
        'OPENAI_TEMPERATURE_PARAMETER_NAME',
        'OPENAI_MAX_TOKENS_PARAMETER_NAME',
        'OPENAI_SYSTEM_PROMPT_PARAMETER_NAME',
        'OPENAI_USER_PROMPT_TEMPLATE_PARAMETER_NAME',
      ];
      return name ? null : labels[index];
    })
    .filter(Boolean);

  if (missingParams.length > 0) {
    throw new Error(`Missing environment variables: ${missingParams.join(', ')}`);
  }

  // Fetch all parameters in parallel
  const parameterPromises = parameterNames.map((name) =>
    ssmClient.send(
      new GetParameterCommand({
        Name: name!,
        WithDecryption: true,
      }),
    ),
  );

  const responses = await Promise.all(parameterPromises);

  // Extract values
  const values = responses.map((response, index) => {
    if (!response.Parameter?.Value) {
      throw new Error(`Parameter ${parameterNames[index]} not found in SSM`);
    }
    return response.Parameter.Value;
  });

  return {
    apiKey: values[0],
    model: values[1],
    temperature: parseFloat(values[2]),
    maxTokens: parseInt(values[3], 10),
    systemPrompt: values[4],
    userPromptTemplate: values[5],
  };
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
      console.error('Error generating reading:', error);

      // Update reading status to Failed
      await dynamoDoc.send(
        new PutCommand({
          TableName: process.env.READINGS_TABLE_NAME!,
          Item: {
            ...readingRecord,
            status: 'Failed',
            error: error instanceof Error ? error.message : 'Unknown error',
            updatedAt: new Date().toISOString(),
          },
        }),
      );

      throw error;
    }
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        message: 'Failed to generate reading',
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
