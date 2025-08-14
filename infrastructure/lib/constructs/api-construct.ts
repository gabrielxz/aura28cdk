import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodeJs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
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
  public readonly adminGetAllReadingsFunction: lambda.Function;
  public readonly adminGetAllUsersFunction: lambda.Function;
  public readonly adminGetReadingDetailsFunction: lambda.Function;
  public readonly adminUpdateReadingStatusFunction: lambda.Function;
  public readonly adminDeleteReadingFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: ApiConstructProps) {
    super(scope, id);

    // Create S3 bucket for configuration files
    const configBucket = new s3.Bucket(this, 'ConfigBucket', {
      bucketName: `aura28-${props.environment}-config`,
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy:
        props.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: props.environment !== 'prod',
      lifecycleRules: [
        {
          id: 'delete-old-versions',
          noncurrentVersionExpiration: cdk.Duration.days(30),
        },
      ],
    });

    // Deploy prompt files to S3
    new s3deploy.BucketDeployment(this, 'DeployPrompts', {
      sources: [
        s3deploy.Source.asset(path.join(__dirname, '../../assets/prompts', props.environment)),
      ],
      destinationBucket: configBucket,
      destinationKeyPrefix: `prompts/${props.environment}`,
      prune: false,
      retainOnDelete: props.environment === 'prod',
    });

    // Create SSM Parameters for OpenAI Configuration
    const openAiApiKeyParameter = new ssm.StringParameter(this, 'OpenAiApiKeyParameter', {
      parameterName: `/aura28/${props.environment}/openai-api-key`,
      description: `OpenAI API key for ${props.environment} environment`,
      stringValue: 'PLACEHOLDER_TO_BE_REPLACED_MANUALLY',
      tier: ssm.ParameterTier.STANDARD,
    });

    // Simplified SSM parameters pointing to S3 keys
    const readingModelParameter = new ssm.StringParameter(this, 'ReadingModelParameter', {
      parameterName: `/aura28/${props.environment}/reading/model`,
      description: `OpenAI model for readings in ${props.environment} environment`,
      stringValue: 'gpt-4-turbo-preview',
      tier: ssm.ParameterTier.STANDARD,
    });

    const readingTemperatureParameter = new ssm.StringParameter(
      this,
      'ReadingTemperatureParameter',
      {
        parameterName: `/aura28/${props.environment}/reading/temperature`,
        description: `Temperature for readings in ${props.environment} environment`,
        stringValue: '0.7',
        tier: ssm.ParameterTier.STANDARD,
      },
    );

    const readingMaxTokensParameter = new ssm.StringParameter(this, 'ReadingMaxTokensParameter', {
      parameterName: `/aura28/${props.environment}/reading/max_tokens`,
      description: `Max tokens for readings in ${props.environment} environment`,
      stringValue: '2000',
      tier: ssm.ParameterTier.STANDARD,
    });

    const systemPromptS3KeyParameter = new ssm.StringParameter(this, 'SystemPromptS3KeyParameter', {
      parameterName: `/aura28/${props.environment}/reading/system_prompt_s3key`,
      description: `S3 key for system prompt in ${props.environment} environment`,
      stringValue: `prompts/${props.environment}/soul_blueprint/system.txt`,
      tier: ssm.ParameterTier.STANDARD,
    });

    const userPromptS3KeyParameter = new ssm.StringParameter(this, 'UserPromptS3KeyParameter', {
      parameterName: `/aura28/${props.environment}/reading/user_prompt_s3key`,
      description: `S3 key for user prompt template in ${props.environment} environment`,
      stringValue: `prompts/${props.environment}/soul_blueprint/user_template.md`,
      tier: ssm.ParameterTier.STANDARD,
    });

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
          CONFIG_BUCKET_NAME: configBucket.bucketName,
          OPENAI_API_KEY_PARAMETER_NAME: openAiApiKeyParameter.parameterName,
          READING_MODEL_PARAMETER_NAME: readingModelParameter.parameterName,
          READING_TEMPERATURE_PARAMETER_NAME: readingTemperatureParameter.parameterName,
          READING_MAX_TOKENS_PARAMETER_NAME: readingMaxTokensParameter.parameterName,
          SYSTEM_PROMPT_S3KEY_PARAMETER_NAME: systemPromptS3KeyParameter.parameterName,
          USER_PROMPT_S3KEY_PARAMETER_NAME: userPromptS3KeyParameter.parameterName,
        },
        timeout: cdk.Duration.seconds(120), // Extended timeout for OpenAI API calls
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

    // Grant permissions to generate reading function
    // SSM parameter read permissions
    openAiApiKeyParameter.grantRead(this.generateReadingFunction);
    readingModelParameter.grantRead(this.generateReadingFunction);
    readingTemperatureParameter.grantRead(this.generateReadingFunction);
    readingMaxTokensParameter.grantRead(this.generateReadingFunction);
    systemPromptS3KeyParameter.grantRead(this.generateReadingFunction);
    userPromptS3KeyParameter.grantRead(this.generateReadingFunction);

    // S3 bucket read permissions for configuration files
    configBucket.grantRead(this.generateReadingFunction);

    // Create Admin Lambda functions
    this.adminGetAllReadingsFunction = new lambdaNodeJs.NodejsFunction(
      this,
      'AdminGetAllReadingsFunction',
      {
        functionName: `aura28-${props.environment}-admin-get-all-readings`,
        entry: path.join(__dirname, '../../lambda/admin/get-all-readings.ts'),
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_18_X,
        environment: {
          READINGS_TABLE_NAME: props.readingsTable.tableName,
          USER_TABLE_NAME: props.userTable.tableName,
        },
        timeout: cdk.Duration.seconds(30),
        memorySize: 512,
        bundling: {
          externalModules: ['@aws-sdk/*'],
          forceDockerBundling: false,
        },
      },
    );

    this.adminGetAllUsersFunction = new lambdaNodeJs.NodejsFunction(
      this,
      'AdminGetAllUsersFunction',
      {
        functionName: `aura28-${props.environment}-admin-get-all-users`,
        entry: path.join(__dirname, '../../lambda/admin/get-all-users.ts'),
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_18_X,
        environment: {
          USER_POOL_ID: props.userPool.userPoolId,
        },
        timeout: cdk.Duration.seconds(30),
        memorySize: 256,
        bundling: {
          externalModules: ['@aws-sdk/*'],
          forceDockerBundling: false,
        },
      },
    );

    // Create additional admin Lambda functions
    this.adminGetReadingDetailsFunction = new lambdaNodeJs.NodejsFunction(
      this,
      'AdminGetReadingDetailsFunction',
      {
        functionName: `aura28-${props.environment}-admin-get-reading-details`,
        entry: path.join(__dirname, '../../lambda/admin/get-reading-details.ts'),
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_18_X,
        environment: {
          READINGS_TABLE_NAME: props.readingsTable.tableName,
          USER_TABLE_NAME: props.userTable.tableName,
        },
        timeout: cdk.Duration.seconds(30),
        memorySize: 256,
        bundling: {
          externalModules: ['@aws-sdk/*'],
          forceDockerBundling: false,
        },
      },
    );

    this.adminUpdateReadingStatusFunction = new lambdaNodeJs.NodejsFunction(
      this,
      'AdminUpdateReadingStatusFunction',
      {
        functionName: `aura28-${props.environment}-admin-update-reading-status`,
        entry: path.join(__dirname, '../../lambda/admin/update-reading-status.ts'),
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

    this.adminDeleteReadingFunction = new lambdaNodeJs.NodejsFunction(
      this,
      'AdminDeleteReadingFunction',
      {
        functionName: `aura28-${props.environment}-admin-delete-reading`,
        entry: path.join(__dirname, '../../lambda/admin/delete-reading.ts'),
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

    // Grant DynamoDB permissions for admin functions
    props.readingsTable.grantReadData(this.adminGetAllReadingsFunction);
    props.userTable.grantReadData(this.adminGetAllReadingsFunction);
    props.readingsTable.grantReadData(this.adminGetReadingDetailsFunction);
    props.userTable.grantReadData(this.adminGetReadingDetailsFunction);
    props.readingsTable.grantReadWriteData(this.adminUpdateReadingStatusFunction);
    props.readingsTable.grantReadWriteData(this.adminDeleteReadingFunction);

    // Grant Cognito permissions for admin user listing
    this.adminGetAllUsersFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['cognito-idp:ListUsers'],
        resources: [props.userPool.userPoolArn],
      }),
    );

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
        allowMethods: ['GET', 'PUT', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
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

    // Create /api/admin resources
    const adminResource = apiResource.addResource('admin');

    // GET /api/admin/readings - Get all readings (admin only)
    const adminReadingsResource = adminResource.addResource('readings');
    adminReadingsResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(this.adminGetAllReadingsFunction),
      {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      },
    );

    // /api/admin/readings/{readingId} resource
    const adminReadingIdResource = adminReadingsResource.addResource('{readingId}');

    // GET /api/admin/readings/{readingId} - Get reading details (admin only)
    adminReadingIdResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(this.adminGetReadingDetailsFunction),
      {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      },
    );

    // DELETE /api/admin/readings/{readingId} - Delete reading (admin only)
    adminReadingIdResource.addMethod(
      'DELETE',
      new apigateway.LambdaIntegration(this.adminDeleteReadingFunction),
      {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      },
    );

    // /api/admin/readings/{readingId}/status resource
    const adminReadingStatusResource = adminReadingIdResource.addResource('status');

    // PATCH /api/admin/readings/{readingId}/status - Update reading status (admin only)
    adminReadingStatusResource.addMethod(
      'PATCH',
      new apigateway.LambdaIntegration(this.adminUpdateReadingStatusFunction),
      {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      },
    );

    // GET /api/admin/users - Get all users (admin only)
    const adminUsersResource = adminResource.addResource('users');
    adminUsersResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(this.adminGetAllUsersFunction),
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
