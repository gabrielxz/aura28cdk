import { handler as generateReadingHandler } from '../lambda/readings/generate-reading';
import { handler as getReadingsHandler } from '../lambda/readings/get-readings';
import { handler as getReadingDetailHandler } from '../lambda/readings/get-reading-detail';
import { APIGatewayProxyEvent } from 'aws-lambda';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';

// Mock the DynamoDB, SSM, and S3 clients
const dynamoMock = mockClient(DynamoDBDocumentClient);
const ssmMock = mockClient(SSMClient);
const s3Mock = mockClient(S3Client);

// Mock fetch for OpenAI API calls
global.fetch = jest.fn();

describe('Readings Lambda Functions', () => {
  beforeEach(() => {
    dynamoMock.reset();
    ssmMock.reset();
    s3Mock.reset();
    (global.fetch as jest.Mock).mockReset();

    // Set required environment variables
    process.env.READINGS_TABLE_NAME = 'test-readings-table';
    process.env.USER_TABLE_NAME = 'test-user-table';
    process.env.NATAL_CHART_TABLE_NAME = 'test-natal-chart-table';
    process.env.CONFIG_BUCKET_NAME = 'test-config-bucket';
    process.env.OPENAI_API_KEY_PARAMETER_NAME = '/test/openai-key';
    process.env.READING_MODEL_PARAMETER_NAME = '/test/reading-model';
    process.env.READING_TEMPERATURE_PARAMETER_NAME = '/test/reading-temperature';
    process.env.READING_MAX_TOKENS_PARAMETER_NAME = '/test/reading-max-tokens';
    process.env.SYSTEM_PROMPT_S3KEY_PARAMETER_NAME = '/test/system-prompt-key';
    process.env.USER_PROMPT_S3KEY_PARAMETER_NAME = '/test/user-prompt-key';
  });

  describe('generateReadingHandler', () => {
    it('should generate a reading successfully', async () => {
      const userId = 'test-user-123';
      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: { userId },
        requestContext: {
          authorizer: {
            claims: { sub: userId },
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      };

      // Mock user profile
      dynamoMock
        .on(GetCommand, {
          TableName: 'test-user-table',
          Key: { userId, createdAt: 'PROFILE' },
        })
        .resolves({
          Item: {
            userId,
            profile: {
              birthName: 'Test User',
              birthDate: '1990-01-01',
              birthTime: '12:00',
              birthCity: 'New York',
              birthState: 'NY',
              birthCountry: 'USA',
            },
          },
        });

      // Mock natal chart
      dynamoMock
        .on(GetCommand, {
          TableName: 'test-natal-chart-table',
          Key: { userId },
        })
        .resolves({
          Item: {
            userId,
            planets: {
              sun: { sign: 'Capricorn', degreeInSign: 10 },
              moon: { sign: 'Cancer', degreeInSign: 15 },
            },
          },
        });

      // Mock SSM parameters for OpenAI configuration
      ssmMock
        .on(GetParameterCommand, {
          Name: '/test/openai-key',
        })
        .resolves({
          Parameter: {
            Value: 'test-api-key',
          },
        });

      ssmMock
        .on(GetParameterCommand, {
          Name: '/test/reading-model',
        })
        .resolves({
          Parameter: {
            Value: 'gpt-4-turbo-preview',
          },
        });

      ssmMock
        .on(GetParameterCommand, {
          Name: '/test/reading-temperature',
        })
        .resolves({
          Parameter: {
            Value: '0.7',
          },
        });

      ssmMock
        .on(GetParameterCommand, {
          Name: '/test/reading-max-tokens',
        })
        .resolves({
          Parameter: {
            Value: '2000',
          },
        });

      ssmMock
        .on(GetParameterCommand, {
          Name: '/test/system-prompt-key',
        })
        .resolves({
          Parameter: {
            Value: 'prompts/test/soul_blueprint/system.txt',
          },
        });

      ssmMock
        .on(GetParameterCommand, {
          Name: '/test/user-prompt-key',
        })
        .resolves({
          Parameter: {
            Value: 'prompts/test/soul_blueprint/user_template.md',
          },
        });

      // Mock S3 responses for prompt files
      const createS3Response = (content: string) => ({
        Body: {
          transformToString: async () => content,
        } as { transformToString: () => Promise<string> },
        ETag: '"test-etag"',
      });

      s3Mock
        .on(GetObjectCommand, {
          Bucket: 'test-config-bucket',
          Key: 'prompts/test/soul_blueprint/system.txt',
        })
        .resolves(
          createS3Response('You are an expert astrologer providing Soul Blueprint readings.'),
        );

      s3Mock
        .on(GetObjectCommand, {
          Bucket: 'test-config-bucket',
          Key: 'prompts/test/soul_blueprint/user_template.md',
        })
        .resolves(
          createS3Response(
            'Generate a Soul Blueprint reading for {{birthName}} born on {{birthDate}}.',
          ),
        );

      // Mock OpenAI API response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: 'Your Soul Blueprint reading: You are a Capricorn Sun...',
              },
            },
          ],
        }),
      });

      // Mock DynamoDB put commands for storing the reading
      dynamoMock.on(PutCommand).resolves({});

      const response = await generateReadingHandler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Reading generated successfully');
      expect(body.readingId).toBeDefined();
      expect(body.status).toBe('Ready');
    });

    it('should return 403 if user is not authorized', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: { userId: 'user-123' },
        requestContext: {
          authorizer: {
            claims: { sub: 'different-user' },
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      };

      const response = await generateReadingHandler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Unauthorized to generate reading for this user');
    });

    it('should return 400 if natal chart is not found', async () => {
      const userId = 'test-user-123';
      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: { userId },
        requestContext: {
          authorizer: {
            claims: { sub: userId },
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      };

      // Mock user profile
      dynamoMock
        .on(GetCommand, {
          TableName: 'test-user-table',
          Key: { userId, createdAt: 'PROFILE' },
        })
        .resolves({
          Item: {
            userId,
            profile: {},
          },
        });

      // Mock no natal chart
      dynamoMock
        .on(GetCommand, {
          TableName: 'test-natal-chart-table',
          Key: { userId },
        })
        .resolves({ Item: undefined });

      const response = await generateReadingHandler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Natal chart not generated. Please complete your profile first.');
    });
  });

  describe('getReadingsHandler', () => {
    it('should return list of readings for a user', async () => {
      const userId = 'test-user-123';
      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: { userId },
        requestContext: {
          authorizer: {
            claims: { sub: userId },
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      };

      const mockReadings = [
        {
          readingId: 'reading-1',
          type: 'Soul Blueprint',
          status: 'Ready',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:01:00Z',
        },
        {
          readingId: 'reading-2',
          type: 'Soul Blueprint',
          status: 'Processing',
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
        },
      ];

      dynamoMock.on(QueryCommand).resolves({
        Items: mockReadings,
      });

      const response = await getReadingsHandler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.readings).toHaveLength(2);
      expect(body.count).toBe(2);
      expect(body.readings[0].readingId).toBe('reading-1');
    });

    it('should return empty list if no readings exist', async () => {
      const userId = 'test-user-123';
      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: { userId },
        requestContext: {
          authorizer: {
            claims: { sub: userId },
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      };

      dynamoMock.on(QueryCommand).resolves({
        Items: [],
      });

      const response = await getReadingsHandler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.readings).toHaveLength(0);
      expect(body.count).toBe(0);
    });
  });

  describe('getReadingDetailHandler', () => {
    it('should return reading detail successfully', async () => {
      const userId = 'test-user-123';
      const readingId = 'reading-123';
      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: { userId, readingId },
        requestContext: {
          authorizer: {
            claims: { sub: userId },
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      };

      const mockReading = {
        userId,
        readingId,
        type: 'Soul Blueprint',
        status: 'Ready',
        content: 'Your detailed Soul Blueprint reading...',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:01:00Z',
      };

      dynamoMock.on(GetCommand).resolves({
        Item: mockReading,
      });

      const response = await getReadingDetailHandler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.readingId).toBe(readingId);
      expect(body.content).toBe('Your detailed Soul Blueprint reading...');
    });

    it('should return 404 if reading not found', async () => {
      const userId = 'test-user-123';
      const readingId = 'non-existent';
      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: { userId, readingId },
        requestContext: {
          authorizer: {
            claims: { sub: userId },
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      };

      dynamoMock.on(GetCommand).resolves({
        Item: undefined,
      });

      const response = await getReadingDetailHandler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Reading not found');
    });

    it('should return 403 if user is not authorized', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: { userId: 'user-123', readingId: 'reading-123' },
        requestContext: {
          authorizer: {
            claims: { sub: 'different-user' },
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      };

      const response = await getReadingDetailHandler(event as APIGatewayProxyEvent);

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Unauthorized to view this reading');
    });
  });
});
