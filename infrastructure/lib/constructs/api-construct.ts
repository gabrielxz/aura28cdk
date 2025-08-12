import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodeJs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as path from 'path';

export interface ApiConstructProps {
  environment: 'dev' | 'prod';
  userTable: dynamodb.Table;
  natalChartTable: dynamodb.Table;
  readingsTable: dynamodb.Table;
  userPool: cognito.UserPool;
  placeIndexName: string;
  allowedOrigins: string[];
}

export class ApiConstruct extends Construct {
  public readonly api: apigateway.RestApi;
  public readonly getUserProfileFunction: lambda.Function;
  public readonly updateUserProfileFunction: lambda.Function;
  public readonly generateNatalChartFunction: lambda.Function;
  public readonly getNatalChartFunction: lambda.Function;
  public readonly generateReadingFunction: lambda.Function;
  public readonly getReadingsFunction: lambda.Function;
  public readonly getReadingDetailFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: ApiConstructProps) {
    super(scope, id);

    // Create SSM Parameters for OpenAI Configuration
    const openAiApiKeyParameter = new ssm.StringParameter(this, 'OpenAiApiKeyParameter', {
      parameterName: `/aura28/${props.environment}/openai-api-key`,
      description: `OpenAI API key for ${props.environment} environment`,
      stringValue: 'PLACEHOLDER_TO_BE_REPLACED_MANUALLY',
      tier: ssm.ParameterTier.STANDARD,
    });

    const openAiModelParameter = new ssm.StringParameter(this, 'OpenAiModelParameter', {
      parameterName: `/aura28/${props.environment}/openai-model`,
      description: `OpenAI model for ${props.environment} environment`,
      stringValue: 'gpt-4-turbo-preview',
      tier: ssm.ParameterTier.STANDARD,
    });

    const openAiTemperatureParameter = new ssm.StringParameter(this, 'OpenAiTemperatureParameter', {
      parameterName: `/aura28/${props.environment}/openai-temperature`,
      description: `OpenAI temperature for ${props.environment} environment`,
      stringValue: '0.7',
      tier: ssm.ParameterTier.STANDARD,
    });

    const openAiMaxTokensParameter = new ssm.StringParameter(this, 'OpenAiMaxTokensParameter', {
      parameterName: `/aura28/${props.environment}/openai-max-tokens`,
      description: `OpenAI max tokens for ${props.environment} environment`,
      stringValue: '2000',
      tier: ssm.ParameterTier.STANDARD,
    });

    const openAiSystemPromptParameter = new ssm.StringParameter(
      this,
      'OpenAiSystemPromptParameter',
      {
        parameterName: `/aura28/${props.environment}/openai-system-prompt`,
        description: `OpenAI system prompt for ${props.environment} environment`,
        stringValue:
          'You are an expert astrologer providing Soul Blueprint readings based on natal charts. Always echo back the natal chart data you receive as part of your response to confirm you have the correct information.',
        tier: ssm.ParameterTier.STANDARD,
      },
    );

    const openAiUserPromptTemplateParameter = new ssm.StringParameter(
      this,
      'OpenAiUserPromptTemplateParameter',
      {
        parameterName: `/aura28/${props.environment}/openai-user-prompt-template`,
        description: `OpenAI user prompt template for ${props.environment} environment`,
        stringValue: `Generate a Soul Blueprint reading for the following individual:

Birth Information:
- Name: {{birthName}}
- Birth Date: {{birthDate}}
- Birth Time: {{birthTime}}
- Birth Location: {{birthCity}}, {{birthState}}, {{birthCountry}}

Natal Chart Data:
{{natalChartData}}

Please provide a comprehensive Soul Blueprint reading that includes:

1. First, echo back the natal chart information above to confirm you have received it correctly.

2. Sun Sign Analysis - Core identity and life purpose

3. Moon Sign Analysis - Emotional nature and inner self

4. Rising Sign Analysis - How you present to the world

5. Key Planetary Aspects - Major influences and challenges

6. Life Path Insights - Your soul's journey and lessons

7. Strengths and Gifts - Your natural talents

8. Growth Areas - Where to focus your development

Please make the reading personal, insightful, and actionable while maintaining a warm and encouraging tone.`,
        tier: ssm.ParameterTier.STANDARD,
      },
    );

    // Create Swiss Ephemeris Lambda Layer
    const swissEphemerisLayer = new lambda.LayerVersion(this, 'SwissEphemerisLayer', {
      code: lambda.Code.fromAsset(path.join(__dirname, '../../layers/swetest'), {
        bundling: {
          image: lambda.Runtime.NODEJS_18_X.bundlingImage,
          user: 'root',
          command: [
            'bash',
            '-c',
            [
              'mkdir -p /asset-output/nodejs',
              'cp package.json package-lock.json /asset-output/nodejs/',
              'cd /asset-output/nodejs',
              'npm install',
            ].join(' && '),
          ],
        },
      }),
      compatibleRuntimes: [lambda.Runtime.NODEJS_18_X],
      description: 'Swiss Ephemeris library for house calculations',
      layerVersionName: `aura28-${props.environment}-swisseph`,
    });

    // Create Lambda functions
    this.getUserProfileFunction = new lambdaNodeJs.NodejsFunction(this, 'GetUserProfileFunction', {
      functionName: `aura28-${props.environment}-get-user-profile`,
      entry: path.join(__dirname, '../../lambda/user-profile/get-user-profile.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_18_X,
      environment: {
        TABLE_NAME: props.userTable.tableName,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      bundling: {
        externalModules: ['@aws-sdk/*'],
        forceDockerBundling: false,
      },
    });

    // Create generateNatalChartFunction first, before updateUserProfileFunction that references it
    this.generateNatalChartFunction = new lambdaNodeJs.NodejsFunction(
      this,
      'GenerateNatalChartFunction',
      {
        functionName: `aura28-${props.environment}-generate-natal-chart`,
        entry: path.join(__dirname, '../../lambda/natal-chart/generate-natal-chart.ts'),
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_18_X,
        layers: [swissEphemerisLayer],
        environment: {
          NATAL_CHART_TABLE_NAME: props.natalChartTable.tableName,
          EPHEMERIS_PATH: '/opt/nodejs/node_modules/swisseph/ephe',
        },
        timeout: cdk.Duration.seconds(10), // 10 seconds for house calculations
        memorySize: 512, // Increased memory for ephemeris calculations
        bundling: {
          externalModules: ['@aws-sdk/*', 'swisseph'], // Exclude swisseph since it's in the layer
          forceDockerBundling: false,
        },
      },
    );

    this.updateUserProfileFunction = new lambdaNodeJs.NodejsFunction(
      this,
      'UpdateUserProfileFunction',
      {
        functionName: `aura28-${props.environment}-update-user-profile`,
        entry: path.join(__dirname, '../../lambda/user-profile/update-user-profile.ts'),
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_18_X,
        environment: {
          TABLE_NAME: props.userTable.tableName,
          PLACE_INDEX_NAME: props.placeIndexName,
          GENERATE_NATAL_CHART_FUNCTION_NAME: this.generateNatalChartFunction.functionName,
        },
        timeout: cdk.Duration.seconds(30),
        memorySize: 256,
        bundling: {
          externalModules: ['@aws-sdk/*'],
          forceDockerBundling: false,
        },
      },
    );

    // Grant DynamoDB permissions
    props.userTable.grantReadData(this.getUserProfileFunction);
    props.userTable.grantWriteData(this.updateUserProfileFunction);
    props.natalChartTable.grantWriteData(this.generateNatalChartFunction);

    this.getNatalChartFunction = new lambdaNodeJs.NodejsFunction(this, 'GetNatalChartFunction', {
      functionName: `aura28-${props.environment}-get-natal-chart`,
      entry: path.join(__dirname, '../../lambda/natal-chart/get-natal-chart.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_18_X,
      environment: {
        NATAL_CHART_TABLE_NAME: props.natalChartTable.tableName,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      bundling: {
        externalModules: ['@aws-sdk/*'],
        forceDockerBundling: false,
      },
    });

    props.natalChartTable.grantReadData(this.getNatalChartFunction);

    // Grant invocation permission
    this.generateNatalChartFunction.grantInvoke(this.updateUserProfileFunction);

    // Create Lambda functions for readings
    this.generateReadingFunction = new lambdaNodeJs.NodejsFunction(
      this,
      'GenerateReadingFunction',
      {
        functionName: `aura28-${props.environment}-generate-reading`,
        entry: path.join(__dirname, '../../lambda/readings/generate-reading.ts'),
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_18_X,
        environment: {
          READINGS_TABLE_NAME: props.readingsTable.tableName,
          NATAL_CHART_TABLE_NAME: props.natalChartTable.tableName,
          USER_TABLE_NAME: props.userTable.tableName,
          OPENAI_API_KEY_PARAMETER_NAME: openAiApiKeyParameter.parameterName,
          OPENAI_MODEL_PARAMETER_NAME: openAiModelParameter.parameterName,
          OPENAI_TEMPERATURE_PARAMETER_NAME: openAiTemperatureParameter.parameterName,
          OPENAI_MAX_TOKENS_PARAMETER_NAME: openAiMaxTokensParameter.parameterName,
          OPENAI_SYSTEM_PROMPT_PARAMETER_NAME: openAiSystemPromptParameter.parameterName,
          OPENAI_USER_PROMPT_TEMPLATE_PARAMETER_NAME:
            openAiUserPromptTemplateParameter.parameterName,
        },
        timeout: cdk.Duration.seconds(60), // Longer timeout for OpenAI API calls
        memorySize: 512,
        bundling: {
          externalModules: ['@aws-sdk/*'],
          forceDockerBundling: false,
        },
      },
    );

    this.getReadingsFunction = new lambdaNodeJs.NodejsFunction(this, 'GetReadingsFunction', {
      functionName: `aura28-${props.environment}-get-readings`,
      entry: path.join(__dirname, '../../lambda/readings/get-readings.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_18_X,
      environment: {
        READINGS_TABLE_NAME: props.readingsTable.tableName,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      bundling: {
        externalModules: ['@aws-sdk/*'],
        forceDockerBundling: false,
      },
    });

    this.getReadingDetailFunction = new lambdaNodeJs.NodejsFunction(
      this,
      'GetReadingDetailFunction',
      {
        functionName: `aura28-${props.environment}-get-reading-detail`,
        entry: path.join(__dirname, '../../lambda/readings/get-reading-detail.ts'),
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_18_X,
        environment: {
          READINGS_TABLE_NAME: props.readingsTable.tableName,
        },
        timeout: cdk.Duration.seconds(30),
        memorySize: 256,
        bundling: {
          externalModules: ['@aws-sdk/*'],
          forceDockerBundling: false,
        },
      },
    );

    // Grant DynamoDB permissions for readings
    props.readingsTable.grantReadWriteData(this.generateReadingFunction);
    props.readingsTable.grantReadData(this.getReadingsFunction);
    props.readingsTable.grantReadData(this.getReadingDetailFunction);
    props.natalChartTable.grantReadData(this.generateReadingFunction);
    props.userTable.grantReadData(this.generateReadingFunction);

    // Grant SSM parameter read permissions to generate reading function
    openAiApiKeyParameter.grantRead(this.generateReadingFunction);
    openAiModelParameter.grantRead(this.generateReadingFunction);
    openAiTemperatureParameter.grantRead(this.generateReadingFunction);
    openAiMaxTokensParameter.grantRead(this.generateReadingFunction);
    openAiSystemPromptParameter.grantRead(this.generateReadingFunction);
    openAiUserPromptTemplateParameter.grantRead(this.generateReadingFunction);

    // Grant Location Service permissions
    this.updateUserProfileFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['geo:SearchPlaceIndexForText'],
        resources: [
          `arn:aws:geo:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:place-index/${
            props.placeIndexName
          }`,
        ],
      }),
    );

    // Create API Gateway
    this.api = new apigateway.RestApi(this, 'UserApi', {
      restApiName: `aura28-${props.environment}-user-api`,
      description: 'API for user profile management',
      deployOptions: {
        stageName: props.environment,
        tracingEnabled: true,
        dataTraceEnabled: true,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        metricsEnabled: true,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: props.allowedOrigins,
        allowMethods: ['GET', 'PUT', 'POST', 'OPTIONS'],
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
        ],
        allowCredentials: true,
      },
    });

    // Create Cognito authorizer
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'UserPoolAuthorizer', {
      cognitoUserPools: [props.userPool],
      authorizerName: `aura28-${props.environment}-authorizer`,
    });

    // Create /api/users/{userId}/profile resource
    const apiResource = this.api.root.addResource('api');
    const usersResource = apiResource.addResource('users');
    const userIdResource = usersResource.addResource('{userId}');
    const profileResource = userIdResource.addResource('profile');

    // Add GET method
    profileResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(this.getUserProfileFunction),
      {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      },
    );

    // Add /api/users/{userId}/natal-chart resource
    const natalChartResource = userIdResource.addResource('natal-chart');
    natalChartResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(this.getNatalChartFunction),
      {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      },
    );

    // Add PUT method
    profileResource.addMethod(
      'PUT',
      new apigateway.LambdaIntegration(this.updateUserProfileFunction),
      {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      },
    );

    // Add /api/users/{userId}/readings resource
    const readingsResource = userIdResource.addResource('readings');

    // GET /api/users/{userId}/readings - List user's readings
    readingsResource.addMethod('GET', new apigateway.LambdaIntegration(this.getReadingsFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // POST /api/users/{userId}/readings - Generate a new reading
    readingsResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(this.generateReadingFunction),
      {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      },
    );

    // Add /api/users/{userId}/readings/{readingId} resource
    const readingIdResource = readingsResource.addResource('{readingId}');

    // GET /api/users/{userId}/readings/{readingId} - Get reading detail
    readingIdResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(this.getReadingDetailFunction),
      {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      },
    );

    // Output API URL
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.api.url,
      description: 'API Gateway URL',
    });

    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: `${this.api.url}api/users/{userId}/profile`,
      description: 'User Profile API Endpoint',
    });
  }
}
