import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodeJs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';

export interface ApiConstructProps {
  environment: 'dev' | 'prod';
  userTable: dynamodb.Table;
  natalChartTable: dynamodb.Table;
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

  constructor(scope: Construct, id: string, props: ApiConstructProps) {
    super(scope, id);

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

    this.generateNatalChartFunction = new lambdaNodeJs.NodejsFunction(
      this,
      'GenerateNatalChartFunction',
      {
        functionName: `aura28-${props.environment}-generate-natal-chart`,
        entry: path.join(__dirname, '../../lambda/natal-chart/generate-natal-chart.ts'),
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_18_X,
        environment: {
          NATAL_CHART_TABLE_NAME: props.natalChartTable.tableName,
        },
        timeout: cdk.Duration.seconds(30),
        memorySize: 512, // Increased memory for ephemeris calculations
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
        allowMethods: ['GET', 'PUT', 'OPTIONS'],
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
