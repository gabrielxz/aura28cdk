import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { v4 as uuidv4 } from 'uuid';

const dynamoClient = new DynamoDBClient({});
const dynamoDoc = DynamoDBDocumentClient.from(dynamoClient);
const ssmClient = new SSMClient({});

let openAiApiKey: string | undefined;

async function getOpenAiApiKey(): Promise<string> {
  if (!openAiApiKey) {
    const parameterName = process.env.OPENAI_API_KEY_PARAMETER_NAME;
    if (!parameterName) {
      throw new Error('OPENAI_API_KEY_PARAMETER_NAME environment variable not set');
    }

    const response = await ssmClient.send(
      new GetParameterCommand({
        Name: parameterName,
        WithDecryption: true,
      }),
    );

    if (!response.Parameter?.Value) {
      throw new Error('OpenAI API key not found in SSM');
    }

    openAiApiKey = response.Parameter.Value;
  }

  return openAiApiKey;
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

async function callOpenAI(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content:
            'You are an expert astrologer providing Soul Blueprint readings based on natal charts. Always echo back the natal chart data you receive as part of your response to confirm you have the correct information.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data: { choices: Array<{ message: { content: string } }> } = await response.json();
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
      // Get OpenAI API key
      const apiKey = await getOpenAiApiKey();

      // Prepare prompt for OpenAI
      const prompt = `
Generate a Soul Blueprint reading for the following individual:

Birth Information:
- Name: ${userProfile.profile?.birthName || 'Unknown'}
- Birth Date: ${userProfile.profile?.birthDate || 'Unknown'}
- Birth Time: ${userProfile.profile?.birthTime || 'Unknown'}
- Birth Location: ${userProfile.profile?.birthCity}, ${userProfile.profile?.birthState}, ${userProfile.profile?.birthCountry}

Natal Chart Data:
${JSON.stringify(natalChart, null, 2)}

Please provide a comprehensive Soul Blueprint reading that includes:

1. First, echo back the natal chart information above to confirm you have received it correctly.

2. Sun Sign Analysis - Core identity and life purpose

3. Moon Sign Analysis - Emotional nature and inner self

4. Rising Sign Analysis - How you present to the world

5. Key Planetary Aspects - Major influences and challenges

6. Life Path Insights - Your soul's journey and lessons

7. Strengths and Gifts - Your natural talents

8. Growth Areas - Where to focus your development

Please make the reading personal, insightful, and actionable while maintaining a warm and encouraging tone.
`;

      // Call OpenAI API
      const content = await callOpenAI(prompt, apiKey);

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
