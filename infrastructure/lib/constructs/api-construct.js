"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiConstruct = void 0;
const constructs_1 = require("constructs");
const cdk = __importStar(require("aws-cdk-lib"));
const apigateway = __importStar(require("aws-cdk-lib/aws-apigateway"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const lambdaNodeJs = __importStar(require("aws-cdk-lib/aws-lambda-nodejs"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const ssm = __importStar(require("aws-cdk-lib/aws-ssm"));
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
const s3deploy = __importStar(require("aws-cdk-lib/aws-s3-deployment"));
const path = __importStar(require("path"));
class ApiConstruct extends constructs_1.Construct {
    api;
    getUserProfileFunction;
    updateUserProfileFunction;
    generateNatalChartFunction;
    getNatalChartFunction;
    generateReadingFunction;
    getReadingsFunction;
    getReadingDetailFunction;
    constructor(scope, id, props) {
        super(scope, id);
        // Create S3 bucket for configuration files
        const configBucket = new s3.Bucket(this, 'ConfigBucket', {
            bucketName: `aura28-${props.environment}-config`,
            versioned: true,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            encryption: s3.BucketEncryption.S3_MANAGED,
            removalPolicy: props.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
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
        const readingTemperatureParameter = new ssm.StringParameter(this, 'ReadingTemperatureParameter', {
            parameterName: `/aura28/${props.environment}/reading/temperature`,
            description: `Temperature for readings in ${props.environment} environment`,
            stringValue: '0.7',
            tier: ssm.ParameterTier.STANDARD,
        });
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
        this.generateNatalChartFunction = new lambdaNodeJs.NodejsFunction(this, 'GenerateNatalChartFunction', {
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
        });
        this.updateUserProfileFunction = new lambdaNodeJs.NodejsFunction(this, 'UpdateUserProfileFunction', {
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
        });
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
        this.generateReadingFunction = new lambdaNodeJs.NodejsFunction(this, 'GenerateReadingFunction', {
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
        });
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
        this.getReadingDetailFunction = new lambdaNodeJs.NodejsFunction(this, 'GetReadingDetailFunction', {
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
        });
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
        // Grant Location Service permissions
        this.updateUserProfileFunction.addToRolePolicy(new iam.PolicyStatement({
            actions: ['geo:SearchPlaceIndexForText'],
            resources: [
                `arn:aws:geo:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:place-index/${props.placeIndexName}`,
            ],
        }));
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
        profileResource.addMethod('GET', new apigateway.LambdaIntegration(this.getUserProfileFunction), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        // Add /api/users/{userId}/natal-chart resource
        const natalChartResource = userIdResource.addResource('natal-chart');
        natalChartResource.addMethod('GET', new apigateway.LambdaIntegration(this.getNatalChartFunction), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        // Add PUT method
        profileResource.addMethod('PUT', new apigateway.LambdaIntegration(this.updateUserProfileFunction), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        // Add /api/users/{userId}/readings resource
        const readingsResource = userIdResource.addResource('readings');
        // GET /api/users/{userId}/readings - List user's readings
        readingsResource.addMethod('GET', new apigateway.LambdaIntegration(this.getReadingsFunction), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        // POST /api/users/{userId}/readings - Generate a new reading
        readingsResource.addMethod('POST', new apigateway.LambdaIntegration(this.generateReadingFunction), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        // Add /api/users/{userId}/readings/{readingId} resource
        const readingIdResource = readingsResource.addResource('{readingId}');
        // GET /api/users/{userId}/readings/{readingId} - Get reading detail
        readingIdResource.addMethod('GET', new apigateway.LambdaIntegration(this.getReadingDetailFunction), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
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
exports.ApiConstruct = ApiConstruct;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBpLWNvbnN0cnVjdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImFwaS1jb25zdHJ1Y3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSwyQ0FBdUM7QUFDdkMsaURBQW1DO0FBQ25DLHVFQUF5RDtBQUN6RCwrREFBaUQ7QUFDakQsNEVBQThEO0FBRzlELHlEQUEyQztBQUMzQyx5REFBMkM7QUFDM0MsdURBQXlDO0FBQ3pDLHdFQUEwRDtBQUMxRCwyQ0FBNkI7QUFZN0IsTUFBYSxZQUFhLFNBQVEsc0JBQVM7SUFDekIsR0FBRyxDQUFxQjtJQUN4QixzQkFBc0IsQ0FBa0I7SUFDeEMseUJBQXlCLENBQWtCO0lBQzNDLDBCQUEwQixDQUFrQjtJQUM1QyxxQkFBcUIsQ0FBa0I7SUFDdkMsdUJBQXVCLENBQWtCO0lBQ3pDLG1CQUFtQixDQUFrQjtJQUNyQyx3QkFBd0IsQ0FBa0I7SUFFMUQsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUF3QjtRQUNoRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLDJDQUEyQztRQUMzQyxNQUFNLFlBQVksR0FBRyxJQUFJLEVBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLGNBQWMsRUFBRTtZQUN2RCxVQUFVLEVBQUUsVUFBVSxLQUFLLENBQUMsV0FBVyxTQUFTO1lBQ2hELFNBQVMsRUFBRSxJQUFJO1lBQ2YsaUJBQWlCLEVBQUUsRUFBRSxDQUFDLGlCQUFpQixDQUFDLFNBQVM7WUFDakQsVUFBVSxFQUFFLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVO1lBQzFDLGFBQWEsRUFDWCxLQUFLLENBQUMsV0FBVyxLQUFLLE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsT0FBTztZQUNyRixpQkFBaUIsRUFBRSxLQUFLLENBQUMsV0FBVyxLQUFLLE1BQU07WUFDL0MsY0FBYyxFQUFFO2dCQUNkO29CQUNFLEVBQUUsRUFBRSxxQkFBcUI7b0JBQ3pCLDJCQUEyQixFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztpQkFDbkQ7YUFDRjtTQUNGLENBQUMsQ0FBQztRQUVILDRCQUE0QjtRQUM1QixJQUFJLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFO1lBQ25ELE9BQU8sRUFBRTtnQkFDUCxRQUFRLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxzQkFBc0IsRUFBRSxLQUFLLENBQUMsV0FBVyxDQUFDLENBQUM7YUFDdkY7WUFDRCxpQkFBaUIsRUFBRSxZQUFZO1lBQy9CLG9CQUFvQixFQUFFLFdBQVcsS0FBSyxDQUFDLFdBQVcsRUFBRTtZQUNwRCxLQUFLLEVBQUUsS0FBSztZQUNaLGNBQWMsRUFBRSxLQUFLLENBQUMsV0FBVyxLQUFLLE1BQU07U0FDN0MsQ0FBQyxDQUFDO1FBRUgsaURBQWlEO1FBQ2pELE1BQU0scUJBQXFCLEdBQUcsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDLElBQUksRUFBRSx1QkFBdUIsRUFBRTtZQUNuRixhQUFhLEVBQUUsV0FBVyxLQUFLLENBQUMsV0FBVyxpQkFBaUI7WUFDNUQsV0FBVyxFQUFFLHNCQUFzQixLQUFLLENBQUMsV0FBVyxjQUFjO1lBQ2xFLFdBQVcsRUFBRSxxQ0FBcUM7WUFDbEQsSUFBSSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsUUFBUTtTQUNqQyxDQUFDLENBQUM7UUFFSCxnREFBZ0Q7UUFDaEQsTUFBTSxxQkFBcUIsR0FBRyxJQUFJLEdBQUcsQ0FBQyxlQUFlLENBQUMsSUFBSSxFQUFFLHVCQUF1QixFQUFFO1lBQ25GLGFBQWEsRUFBRSxXQUFXLEtBQUssQ0FBQyxXQUFXLGdCQUFnQjtZQUMzRCxXQUFXLEVBQUUsZ0NBQWdDLEtBQUssQ0FBQyxXQUFXLGNBQWM7WUFDNUUsV0FBVyxFQUFFLHFCQUFxQjtZQUNsQyxJQUFJLEVBQUUsR0FBRyxDQUFDLGFBQWEsQ0FBQyxRQUFRO1NBQ2pDLENBQUMsQ0FBQztRQUVILE1BQU0sMkJBQTJCLEdBQUcsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUN6RCxJQUFJLEVBQ0osNkJBQTZCLEVBQzdCO1lBQ0UsYUFBYSxFQUFFLFdBQVcsS0FBSyxDQUFDLFdBQVcsc0JBQXNCO1lBQ2pFLFdBQVcsRUFBRSwrQkFBK0IsS0FBSyxDQUFDLFdBQVcsY0FBYztZQUMzRSxXQUFXLEVBQUUsS0FBSztZQUNsQixJQUFJLEVBQUUsR0FBRyxDQUFDLGFBQWEsQ0FBQyxRQUFRO1NBQ2pDLENBQ0YsQ0FBQztRQUVGLE1BQU0seUJBQXlCLEdBQUcsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDLElBQUksRUFBRSwyQkFBMkIsRUFBRTtZQUMzRixhQUFhLEVBQUUsV0FBVyxLQUFLLENBQUMsV0FBVyxxQkFBcUI7WUFDaEUsV0FBVyxFQUFFLDhCQUE4QixLQUFLLENBQUMsV0FBVyxjQUFjO1lBQzFFLFdBQVcsRUFBRSxNQUFNO1lBQ25CLElBQUksRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLFFBQVE7U0FDakMsQ0FBQyxDQUFDO1FBRUgsTUFBTSwwQkFBMEIsR0FBRyxJQUFJLEdBQUcsQ0FBQyxlQUFlLENBQUMsSUFBSSxFQUFFLDRCQUE0QixFQUFFO1lBQzdGLGFBQWEsRUFBRSxXQUFXLEtBQUssQ0FBQyxXQUFXLDhCQUE4QjtZQUN6RSxXQUFXLEVBQUUsK0JBQStCLEtBQUssQ0FBQyxXQUFXLGNBQWM7WUFDM0UsV0FBVyxFQUFFLFdBQVcsS0FBSyxDQUFDLFdBQVcsNEJBQTRCO1lBQ3JFLElBQUksRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLFFBQVE7U0FDakMsQ0FBQyxDQUFDO1FBRUgsTUFBTSx3QkFBd0IsR0FBRyxJQUFJLEdBQUcsQ0FBQyxlQUFlLENBQUMsSUFBSSxFQUFFLDBCQUEwQixFQUFFO1lBQ3pGLGFBQWEsRUFBRSxXQUFXLEtBQUssQ0FBQyxXQUFXLDRCQUE0QjtZQUN2RSxXQUFXLEVBQUUsc0NBQXNDLEtBQUssQ0FBQyxXQUFXLGNBQWM7WUFDbEYsV0FBVyxFQUFFLFdBQVcsS0FBSyxDQUFDLFdBQVcsa0NBQWtDO1lBQzNFLElBQUksRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLFFBQVE7U0FDakMsQ0FBQyxDQUFDO1FBRUgsc0NBQXNDO1FBQ3RDLE1BQU0sbUJBQW1CLEdBQUcsSUFBSSxNQUFNLENBQUMsWUFBWSxDQUFDLElBQUksRUFBRSxxQkFBcUIsRUFBRTtZQUMvRSxJQUFJLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsc0JBQXNCLENBQUMsRUFBRTtnQkFDeEUsUUFBUSxFQUFFO29CQUNSLEtBQUssRUFBRSxNQUFNLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxhQUFhO29CQUMvQyxJQUFJLEVBQUUsTUFBTTtvQkFDWixPQUFPLEVBQUU7d0JBQ1AsTUFBTTt3QkFDTixJQUFJO3dCQUNKOzRCQUNFLCtCQUErQjs0QkFDL0IseURBQXlEOzRCQUN6RCx5QkFBeUI7NEJBQ3pCLGFBQWE7eUJBQ2QsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDO3FCQUNmO2lCQUNGO2FBQ0YsQ0FBQztZQUNGLGtCQUFrQixFQUFFLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUM7WUFDaEQsV0FBVyxFQUFFLGdEQUFnRDtZQUM3RCxnQkFBZ0IsRUFBRSxVQUFVLEtBQUssQ0FBQyxXQUFXLFdBQVc7U0FDekQsQ0FBQyxDQUFDO1FBRUgsMEJBQTBCO1FBQzFCLElBQUksQ0FBQyxzQkFBc0IsR0FBRyxJQUFJLFlBQVksQ0FBQyxjQUFjLENBQUMsSUFBSSxFQUFFLHdCQUF3QixFQUFFO1lBQzVGLFlBQVksRUFBRSxVQUFVLEtBQUssQ0FBQyxXQUFXLG1CQUFtQjtZQUM1RCxLQUFLLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsK0NBQStDLENBQUM7WUFDNUUsT0FBTyxFQUFFLFNBQVM7WUFDbEIsT0FBTyxFQUFFLE1BQU0sQ0FBQyxPQUFPLENBQUMsV0FBVztZQUNuQyxXQUFXLEVBQUU7Z0JBQ1gsVUFBVSxFQUFFLEtBQUssQ0FBQyxTQUFTLENBQUMsU0FBUzthQUN0QztZQUNELE9BQU8sRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDakMsVUFBVSxFQUFFLEdBQUc7WUFDZixRQUFRLEVBQUU7Z0JBQ1IsZUFBZSxFQUFFLENBQUMsWUFBWSxDQUFDO2dCQUMvQixtQkFBbUIsRUFBRSxLQUFLO2FBQzNCO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsK0ZBQStGO1FBQy9GLElBQUksQ0FBQywwQkFBMEIsR0FBRyxJQUFJLFlBQVksQ0FBQyxjQUFjLENBQy9ELElBQUksRUFDSiw0QkFBNEIsRUFDNUI7WUFDRSxZQUFZLEVBQUUsVUFBVSxLQUFLLENBQUMsV0FBVyx1QkFBdUI7WUFDaEUsS0FBSyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLGtEQUFrRCxDQUFDO1lBQy9FLE9BQU8sRUFBRSxTQUFTO1lBQ2xCLE9BQU8sRUFBRSxNQUFNLENBQUMsT0FBTyxDQUFDLFdBQVc7WUFDbkMsTUFBTSxFQUFFLENBQUMsbUJBQW1CLENBQUM7WUFDN0IsV0FBVyxFQUFFO2dCQUNYLHNCQUFzQixFQUFFLEtBQUssQ0FBQyxlQUFlLENBQUMsU0FBUztnQkFDdkQsY0FBYyxFQUFFLHdDQUF3QzthQUN6RDtZQUNELE9BQU8sRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsRUFBRSxvQ0FBb0M7WUFDdkUsVUFBVSxFQUFFLEdBQUcsRUFBRSw4Q0FBOEM7WUFDL0QsUUFBUSxFQUFFO2dCQUNSLGVBQWUsRUFBRSxDQUFDLFlBQVksRUFBRSxVQUFVLENBQUMsRUFBRSwyQ0FBMkM7Z0JBQ3hGLG1CQUFtQixFQUFFLEtBQUs7YUFDM0I7U0FDRixDQUNGLENBQUM7UUFFRixJQUFJLENBQUMseUJBQXlCLEdBQUcsSUFBSSxZQUFZLENBQUMsY0FBYyxDQUM5RCxJQUFJLEVBQ0osMkJBQTJCLEVBQzNCO1lBQ0UsWUFBWSxFQUFFLFVBQVUsS0FBSyxDQUFDLFdBQVcsc0JBQXNCO1lBQy9ELEtBQUssRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxrREFBa0QsQ0FBQztZQUMvRSxPQUFPLEVBQUUsU0FBUztZQUNsQixPQUFPLEVBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxXQUFXO1lBQ25DLFdBQVcsRUFBRTtnQkFDWCxVQUFVLEVBQUUsS0FBSyxDQUFDLFNBQVMsQ0FBQyxTQUFTO2dCQUNyQyxnQkFBZ0IsRUFBRSxLQUFLLENBQUMsY0FBYztnQkFDdEMsa0NBQWtDLEVBQUUsSUFBSSxDQUFDLDBCQUEwQixDQUFDLFlBQVk7YUFDakY7WUFDRCxPQUFPLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ2pDLFVBQVUsRUFBRSxHQUFHO1lBQ2YsUUFBUSxFQUFFO2dCQUNSLGVBQWUsRUFBRSxDQUFDLFlBQVksQ0FBQztnQkFDL0IsbUJBQW1CLEVBQUUsS0FBSzthQUMzQjtTQUNGLENBQ0YsQ0FBQztRQUVGLDZCQUE2QjtRQUM3QixLQUFLLENBQUMsU0FBUyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsc0JBQXNCLENBQUMsQ0FBQztRQUMzRCxLQUFLLENBQUMsU0FBUyxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMseUJBQXlCLENBQUMsQ0FBQztRQUMvRCxLQUFLLENBQUMsZUFBZSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsMEJBQTBCLENBQUMsQ0FBQztRQUV0RSxJQUFJLENBQUMscUJBQXFCLEdBQUcsSUFBSSxZQUFZLENBQUMsY0FBYyxDQUFDLElBQUksRUFBRSx1QkFBdUIsRUFBRTtZQUMxRixZQUFZLEVBQUUsVUFBVSxLQUFLLENBQUMsV0FBVyxrQkFBa0I7WUFDM0QsS0FBSyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLDZDQUE2QyxDQUFDO1lBQzFFLE9BQU8sRUFBRSxTQUFTO1lBQ2xCLE9BQU8sRUFBRSxNQUFNLENBQUMsT0FBTyxDQUFDLFdBQVc7WUFDbkMsV0FBVyxFQUFFO2dCQUNYLHNCQUFzQixFQUFFLEtBQUssQ0FBQyxlQUFlLENBQUMsU0FBUzthQUN4RDtZQUNELE9BQU8sRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDakMsVUFBVSxFQUFFLEdBQUc7WUFDZixRQUFRLEVBQUU7Z0JBQ1IsZUFBZSxFQUFFLENBQUMsWUFBWSxDQUFDO2dCQUMvQixtQkFBbUIsRUFBRSxLQUFLO2FBQzNCO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsS0FBSyxDQUFDLGVBQWUsQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLENBQUM7UUFFaEUsOEJBQThCO1FBQzlCLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLHlCQUF5QixDQUFDLENBQUM7UUFFNUUsdUNBQXVDO1FBQ3ZDLElBQUksQ0FBQyx1QkFBdUIsR0FBRyxJQUFJLFlBQVksQ0FBQyxjQUFjLENBQzVELElBQUksRUFDSix5QkFBeUIsRUFDekI7WUFDRSxZQUFZLEVBQUUsVUFBVSxLQUFLLENBQUMsV0FBVyxtQkFBbUI7WUFDNUQsS0FBSyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLDJDQUEyQyxDQUFDO1lBQ3hFLE9BQU8sRUFBRSxTQUFTO1lBQ2xCLE9BQU8sRUFBRSxNQUFNLENBQUMsT0FBTyxDQUFDLFdBQVc7WUFDbkMsV0FBVyxFQUFFO2dCQUNYLG1CQUFtQixFQUFFLEtBQUssQ0FBQyxhQUFhLENBQUMsU0FBUztnQkFDbEQsc0JBQXNCLEVBQUUsS0FBSyxDQUFDLGVBQWUsQ0FBQyxTQUFTO2dCQUN2RCxlQUFlLEVBQUUsS0FBSyxDQUFDLFNBQVMsQ0FBQyxTQUFTO2dCQUMxQyxrQkFBa0IsRUFBRSxZQUFZLENBQUMsVUFBVTtnQkFDM0MsNkJBQTZCLEVBQUUscUJBQXFCLENBQUMsYUFBYTtnQkFDbEUsNEJBQTRCLEVBQUUscUJBQXFCLENBQUMsYUFBYTtnQkFDakUsa0NBQWtDLEVBQUUsMkJBQTJCLENBQUMsYUFBYTtnQkFDN0UsaUNBQWlDLEVBQUUseUJBQXlCLENBQUMsYUFBYTtnQkFDMUUsa0NBQWtDLEVBQUUsMEJBQTBCLENBQUMsYUFBYTtnQkFDNUUsZ0NBQWdDLEVBQUUsd0JBQXdCLENBQUMsYUFBYTthQUN6RTtZQUNELE9BQU8sRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsRUFBRSx3Q0FBd0M7WUFDNUUsVUFBVSxFQUFFLEdBQUc7WUFDZixRQUFRLEVBQUU7Z0JBQ1IsZUFBZSxFQUFFLENBQUMsWUFBWSxDQUFDO2dCQUMvQixtQkFBbUIsRUFBRSxLQUFLO2FBQzNCO1NBQ0YsQ0FDRixDQUFDO1FBRUYsSUFBSSxDQUFDLG1CQUFtQixHQUFHLElBQUksWUFBWSxDQUFDLGNBQWMsQ0FBQyxJQUFJLEVBQUUscUJBQXFCLEVBQUU7WUFDdEYsWUFBWSxFQUFFLFVBQVUsS0FBSyxDQUFDLFdBQVcsZUFBZTtZQUN4RCxLQUFLLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsdUNBQXVDLENBQUM7WUFDcEUsT0FBTyxFQUFFLFNBQVM7WUFDbEIsT0FBTyxFQUFFLE1BQU0sQ0FBQyxPQUFPLENBQUMsV0FBVztZQUNuQyxXQUFXLEVBQUU7Z0JBQ1gsbUJBQW1CLEVBQUUsS0FBSyxDQUFDLGFBQWEsQ0FBQyxTQUFTO2FBQ25EO1lBQ0QsT0FBTyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUNqQyxVQUFVLEVBQUUsR0FBRztZQUNmLFFBQVEsRUFBRTtnQkFDUixlQUFlLEVBQUUsQ0FBQyxZQUFZLENBQUM7Z0JBQy9CLG1CQUFtQixFQUFFLEtBQUs7YUFDM0I7U0FDRixDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsd0JBQXdCLEdBQUcsSUFBSSxZQUFZLENBQUMsY0FBYyxDQUM3RCxJQUFJLEVBQ0osMEJBQTBCLEVBQzFCO1lBQ0UsWUFBWSxFQUFFLFVBQVUsS0FBSyxDQUFDLFdBQVcscUJBQXFCO1lBQzlELEtBQUssRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSw2Q0FBNkMsQ0FBQztZQUMxRSxPQUFPLEVBQUUsU0FBUztZQUNsQixPQUFPLEVBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxXQUFXO1lBQ25DLFdBQVcsRUFBRTtnQkFDWCxtQkFBbUIsRUFBRSxLQUFLLENBQUMsYUFBYSxDQUFDLFNBQVM7YUFDbkQ7WUFDRCxPQUFPLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ2pDLFVBQVUsRUFBRSxHQUFHO1lBQ2YsUUFBUSxFQUFFO2dCQUNSLGVBQWUsRUFBRSxDQUFDLFlBQVksQ0FBQztnQkFDL0IsbUJBQW1CLEVBQUUsS0FBSzthQUMzQjtTQUNGLENBQ0YsQ0FBQztRQUVGLDBDQUEwQztRQUMxQyxLQUFLLENBQUMsYUFBYSxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1FBQ3JFLEtBQUssQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO1FBQzVELEtBQUssQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO1FBQ2pFLEtBQUssQ0FBQyxlQUFlLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1FBQ2xFLEtBQUssQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1FBRTVELGlEQUFpRDtRQUNqRCxpQ0FBaUM7UUFDakMscUJBQXFCLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1FBQzlELHFCQUFxQixDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsdUJBQXVCLENBQUMsQ0FBQztRQUM5RCwyQkFBMkIsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLHVCQUF1QixDQUFDLENBQUM7UUFDcEUseUJBQXlCLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1FBQ2xFLDBCQUEwQixDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsdUJBQXVCLENBQUMsQ0FBQztRQUNuRSx3QkFBd0IsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLHVCQUF1QixDQUFDLENBQUM7UUFFakUscURBQXFEO1FBQ3JELFlBQVksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLHVCQUF1QixDQUFDLENBQUM7UUFFckQscUNBQXFDO1FBQ3JDLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxlQUFlLENBQzVDLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQztZQUN0QixPQUFPLEVBQUUsQ0FBQyw2QkFBNkIsQ0FBQztZQUN4QyxTQUFTLEVBQUU7Z0JBQ1QsZUFBZSxHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLElBQUksR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsT0FBTyxnQkFDcEUsS0FBSyxDQUFDLGNBQ1IsRUFBRTthQUNIO1NBQ0YsQ0FBQyxDQUNILENBQUM7UUFFRixxQkFBcUI7UUFDckIsSUFBSSxDQUFDLEdBQUcsR0FBRyxJQUFJLFVBQVUsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLFNBQVMsRUFBRTtZQUNqRCxXQUFXLEVBQUUsVUFBVSxLQUFLLENBQUMsV0FBVyxXQUFXO1lBQ25ELFdBQVcsRUFBRSxpQ0FBaUM7WUFDOUMsYUFBYSxFQUFFO2dCQUNiLFNBQVMsRUFBRSxLQUFLLENBQUMsV0FBVztnQkFDNUIsY0FBYyxFQUFFLElBQUk7Z0JBQ3BCLGdCQUFnQixFQUFFLElBQUk7Z0JBQ3RCLFlBQVksRUFBRSxVQUFVLENBQUMsa0JBQWtCLENBQUMsSUFBSTtnQkFDaEQsY0FBYyxFQUFFLElBQUk7YUFDckI7WUFDRCwyQkFBMkIsRUFBRTtnQkFDM0IsWUFBWSxFQUFFLEtBQUssQ0FBQyxjQUFjO2dCQUNsQyxZQUFZLEVBQUUsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxTQUFTLENBQUM7Z0JBQy9DLFlBQVksRUFBRTtvQkFDWixjQUFjO29CQUNkLFlBQVk7b0JBQ1osZUFBZTtvQkFDZixXQUFXO29CQUNYLHNCQUFzQjtpQkFDdkI7Z0JBQ0QsZ0JBQWdCLEVBQUUsSUFBSTthQUN2QjtTQUNGLENBQUMsQ0FBQztRQUVILDRCQUE0QjtRQUM1QixNQUFNLFVBQVUsR0FBRyxJQUFJLFVBQVUsQ0FBQywwQkFBMEIsQ0FBQyxJQUFJLEVBQUUsb0JBQW9CLEVBQUU7WUFDdkYsZ0JBQWdCLEVBQUUsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDO1lBQ2xDLGNBQWMsRUFBRSxVQUFVLEtBQUssQ0FBQyxXQUFXLGFBQWE7U0FDekQsQ0FBQyxDQUFDO1FBRUgsOENBQThDO1FBQzlDLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNyRCxNQUFNLGFBQWEsR0FBRyxXQUFXLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3ZELE1BQU0sY0FBYyxHQUFHLGFBQWEsQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDN0QsTUFBTSxlQUFlLEdBQUcsY0FBYyxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUU5RCxpQkFBaUI7UUFDakIsZUFBZSxDQUFDLFNBQVMsQ0FDdkIsS0FBSyxFQUNMLElBQUksVUFBVSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxFQUM3RDtZQUNFLFVBQVU7WUFDVixpQkFBaUIsRUFBRSxVQUFVLENBQUMsaUJBQWlCLENBQUMsT0FBTztTQUN4RCxDQUNGLENBQUM7UUFFRiwrQ0FBK0M7UUFDL0MsTUFBTSxrQkFBa0IsR0FBRyxjQUFjLENBQUMsV0FBVyxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQ3JFLGtCQUFrQixDQUFDLFNBQVMsQ0FDMUIsS0FBSyxFQUNMLElBQUksVUFBVSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxFQUM1RDtZQUNFLFVBQVU7WUFDVixpQkFBaUIsRUFBRSxVQUFVLENBQUMsaUJBQWlCLENBQUMsT0FBTztTQUN4RCxDQUNGLENBQUM7UUFFRixpQkFBaUI7UUFDakIsZUFBZSxDQUFDLFNBQVMsQ0FDdkIsS0FBSyxFQUNMLElBQUksVUFBVSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxFQUNoRTtZQUNFLFVBQVU7WUFDVixpQkFBaUIsRUFBRSxVQUFVLENBQUMsaUJBQWlCLENBQUMsT0FBTztTQUN4RCxDQUNGLENBQUM7UUFFRiw0Q0FBNEM7UUFDNUMsTUFBTSxnQkFBZ0IsR0FBRyxjQUFjLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBRWhFLDBEQUEwRDtRQUMxRCxnQkFBZ0IsQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLElBQUksVUFBVSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxFQUFFO1lBQzVGLFVBQVU7WUFDVixpQkFBaUIsRUFBRSxVQUFVLENBQUMsaUJBQWlCLENBQUMsT0FBTztTQUN4RCxDQUFDLENBQUM7UUFFSCw2REFBNkQ7UUFDN0QsZ0JBQWdCLENBQUMsU0FBUyxDQUN4QixNQUFNLEVBQ04sSUFBSSxVQUFVLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLHVCQUF1QixDQUFDLEVBQzlEO1lBQ0UsVUFBVTtZQUNWLGlCQUFpQixFQUFFLFVBQVUsQ0FBQyxpQkFBaUIsQ0FBQyxPQUFPO1NBQ3hELENBQ0YsQ0FBQztRQUVGLHdEQUF3RDtRQUN4RCxNQUFNLGlCQUFpQixHQUFHLGdCQUFnQixDQUFDLFdBQVcsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUV0RSxvRUFBb0U7UUFDcEUsaUJBQWlCLENBQUMsU0FBUyxDQUN6QixLQUFLLEVBQ0wsSUFBSSxVQUFVLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLHdCQUF3QixDQUFDLEVBQy9EO1lBQ0UsVUFBVTtZQUNWLGlCQUFpQixFQUFFLFVBQVUsQ0FBQyxpQkFBaUIsQ0FBQyxPQUFPO1NBQ3hELENBQ0YsQ0FBQztRQUVGLGlCQUFpQjtRQUNqQixJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLFFBQVEsRUFBRTtZQUNoQyxLQUFLLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHO1lBQ25CLFdBQVcsRUFBRSxpQkFBaUI7U0FDL0IsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxhQUFhLEVBQUU7WUFDckMsS0FBSyxFQUFFLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLDRCQUE0QjtZQUNsRCxXQUFXLEVBQUUsMkJBQTJCO1NBQ3pDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQXhaRCxvQ0F3WkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBhcGlnYXRld2F5IGZyb20gJ2F3cy1jZGstbGliL2F3cy1hcGlnYXRld2F5JztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcbmltcG9ydCAqIGFzIGxhbWJkYU5vZGVKcyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhLW5vZGVqcyc7XG5pbXBvcnQgKiBhcyBkeW5hbW9kYiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZHluYW1vZGInO1xuaW1wb3J0ICogYXMgY29nbml0byBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29nbml0byc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBzc20gZnJvbSAnYXdzLWNkay1saWIvYXdzLXNzbSc7XG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xuaW1wb3J0ICogYXMgczNkZXBsb3kgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzLWRlcGxveW1lbnQnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcblxuZXhwb3J0IGludGVyZmFjZSBBcGlDb25zdHJ1Y3RQcm9wcyB7XG4gIGVudmlyb25tZW50OiAnZGV2JyB8ICdwcm9kJztcbiAgdXNlclRhYmxlOiBkeW5hbW9kYi5UYWJsZTtcbiAgbmF0YWxDaGFydFRhYmxlOiBkeW5hbW9kYi5UYWJsZTtcbiAgcmVhZGluZ3NUYWJsZTogZHluYW1vZGIuVGFibGU7XG4gIHVzZXJQb29sOiBjb2duaXRvLlVzZXJQb29sO1xuICBwbGFjZUluZGV4TmFtZTogc3RyaW5nO1xuICBhbGxvd2VkT3JpZ2luczogc3RyaW5nW107XG59XG5cbmV4cG9ydCBjbGFzcyBBcGlDb25zdHJ1Y3QgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICBwdWJsaWMgcmVhZG9ubHkgYXBpOiBhcGlnYXRld2F5LlJlc3RBcGk7XG4gIHB1YmxpYyByZWFkb25seSBnZXRVc2VyUHJvZmlsZUZ1bmN0aW9uOiBsYW1iZGEuRnVuY3Rpb247XG4gIHB1YmxpYyByZWFkb25seSB1cGRhdGVVc2VyUHJvZmlsZUZ1bmN0aW9uOiBsYW1iZGEuRnVuY3Rpb247XG4gIHB1YmxpYyByZWFkb25seSBnZW5lcmF0ZU5hdGFsQ2hhcnRGdW5jdGlvbjogbGFtYmRhLkZ1bmN0aW9uO1xuICBwdWJsaWMgcmVhZG9ubHkgZ2V0TmF0YWxDaGFydEZ1bmN0aW9uOiBsYW1iZGEuRnVuY3Rpb247XG4gIHB1YmxpYyByZWFkb25seSBnZW5lcmF0ZVJlYWRpbmdGdW5jdGlvbjogbGFtYmRhLkZ1bmN0aW9uO1xuICBwdWJsaWMgcmVhZG9ubHkgZ2V0UmVhZGluZ3NGdW5jdGlvbjogbGFtYmRhLkZ1bmN0aW9uO1xuICBwdWJsaWMgcmVhZG9ubHkgZ2V0UmVhZGluZ0RldGFpbEZ1bmN0aW9uOiBsYW1iZGEuRnVuY3Rpb247XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IEFwaUNvbnN0cnVjdFByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIC8vIENyZWF0ZSBTMyBidWNrZXQgZm9yIGNvbmZpZ3VyYXRpb24gZmlsZXNcbiAgICBjb25zdCBjb25maWdCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsICdDb25maWdCdWNrZXQnLCB7XG4gICAgICBidWNrZXROYW1lOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LWNvbmZpZ2AsXG4gICAgICB2ZXJzaW9uZWQ6IHRydWUsXG4gICAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxuICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VELFxuICAgICAgcmVtb3ZhbFBvbGljeTpcbiAgICAgICAgcHJvcHMuZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTiA6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICBhdXRvRGVsZXRlT2JqZWN0czogcHJvcHMuZW52aXJvbm1lbnQgIT09ICdwcm9kJyxcbiAgICAgIGxpZmVjeWNsZVJ1bGVzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogJ2RlbGV0ZS1vbGQtdmVyc2lvbnMnLFxuICAgICAgICAgIG5vbmN1cnJlbnRWZXJzaW9uRXhwaXJhdGlvbjogY2RrLkR1cmF0aW9uLmRheXMoMzApLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIERlcGxveSBwcm9tcHQgZmlsZXMgdG8gUzNcbiAgICBuZXcgczNkZXBsb3kuQnVja2V0RGVwbG95bWVudCh0aGlzLCAnRGVwbG95UHJvbXB0cycsIHtcbiAgICAgIHNvdXJjZXM6IFtcbiAgICAgICAgczNkZXBsb3kuU291cmNlLmFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9hc3NldHMvcHJvbXB0cycsIHByb3BzLmVudmlyb25tZW50KSksXG4gICAgICBdLFxuICAgICAgZGVzdGluYXRpb25CdWNrZXQ6IGNvbmZpZ0J1Y2tldCxcbiAgICAgIGRlc3RpbmF0aW9uS2V5UHJlZml4OiBgcHJvbXB0cy8ke3Byb3BzLmVudmlyb25tZW50fWAsXG4gICAgICBwcnVuZTogZmFsc2UsXG4gICAgICByZXRhaW5PbkRlbGV0ZTogcHJvcHMuZW52aXJvbm1lbnQgPT09ICdwcm9kJyxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBTU00gUGFyYW1ldGVycyBmb3IgT3BlbkFJIENvbmZpZ3VyYXRpb25cbiAgICBjb25zdCBvcGVuQWlBcGlLZXlQYXJhbWV0ZXIgPSBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcih0aGlzLCAnT3BlbkFpQXBpS2V5UGFyYW1ldGVyJywge1xuICAgICAgcGFyYW1ldGVyTmFtZTogYC9hdXJhMjgvJHtwcm9wcy5lbnZpcm9ubWVudH0vb3BlbmFpLWFwaS1rZXlgLFxuICAgICAgZGVzY3JpcHRpb246IGBPcGVuQUkgQVBJIGtleSBmb3IgJHtwcm9wcy5lbnZpcm9ubWVudH0gZW52aXJvbm1lbnRgLFxuICAgICAgc3RyaW5nVmFsdWU6ICdQTEFDRUhPTERFUl9UT19CRV9SRVBMQUNFRF9NQU5VQUxMWScsXG4gICAgICB0aWVyOiBzc20uUGFyYW1ldGVyVGllci5TVEFOREFSRCxcbiAgICB9KTtcblxuICAgIC8vIFNpbXBsaWZpZWQgU1NNIHBhcmFtZXRlcnMgcG9pbnRpbmcgdG8gUzMga2V5c1xuICAgIGNvbnN0IHJlYWRpbmdNb2RlbFBhcmFtZXRlciA9IG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsICdSZWFkaW5nTW9kZWxQYXJhbWV0ZXInLCB7XG4gICAgICBwYXJhbWV0ZXJOYW1lOiBgL2F1cmEyOC8ke3Byb3BzLmVudmlyb25tZW50fS9yZWFkaW5nL21vZGVsYCxcbiAgICAgIGRlc2NyaXB0aW9uOiBgT3BlbkFJIG1vZGVsIGZvciByZWFkaW5ncyBpbiAke3Byb3BzLmVudmlyb25tZW50fSBlbnZpcm9ubWVudGAsXG4gICAgICBzdHJpbmdWYWx1ZTogJ2dwdC00LXR1cmJvLXByZXZpZXcnLFxuICAgICAgdGllcjogc3NtLlBhcmFtZXRlclRpZXIuU1RBTkRBUkQsXG4gICAgfSk7XG5cbiAgICBjb25zdCByZWFkaW5nVGVtcGVyYXR1cmVQYXJhbWV0ZXIgPSBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcihcbiAgICAgIHRoaXMsXG4gICAgICAnUmVhZGluZ1RlbXBlcmF0dXJlUGFyYW1ldGVyJyxcbiAgICAgIHtcbiAgICAgICAgcGFyYW1ldGVyTmFtZTogYC9hdXJhMjgvJHtwcm9wcy5lbnZpcm9ubWVudH0vcmVhZGluZy90ZW1wZXJhdHVyZWAsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBgVGVtcGVyYXR1cmUgZm9yIHJlYWRpbmdzIGluICR7cHJvcHMuZW52aXJvbm1lbnR9IGVudmlyb25tZW50YCxcbiAgICAgICAgc3RyaW5nVmFsdWU6ICcwLjcnLFxuICAgICAgICB0aWVyOiBzc20uUGFyYW1ldGVyVGllci5TVEFOREFSRCxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIGNvbnN0IHJlYWRpbmdNYXhUb2tlbnNQYXJhbWV0ZXIgPSBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcih0aGlzLCAnUmVhZGluZ01heFRva2Vuc1BhcmFtZXRlcicsIHtcbiAgICAgIHBhcmFtZXRlck5hbWU6IGAvYXVyYTI4LyR7cHJvcHMuZW52aXJvbm1lbnR9L3JlYWRpbmcvbWF4X3Rva2Vuc2AsXG4gICAgICBkZXNjcmlwdGlvbjogYE1heCB0b2tlbnMgZm9yIHJlYWRpbmdzIGluICR7cHJvcHMuZW52aXJvbm1lbnR9IGVudmlyb25tZW50YCxcbiAgICAgIHN0cmluZ1ZhbHVlOiAnMjAwMCcsXG4gICAgICB0aWVyOiBzc20uUGFyYW1ldGVyVGllci5TVEFOREFSRCxcbiAgICB9KTtcblxuICAgIGNvbnN0IHN5c3RlbVByb21wdFMzS2V5UGFyYW1ldGVyID0gbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgJ1N5c3RlbVByb21wdFMzS2V5UGFyYW1ldGVyJywge1xuICAgICAgcGFyYW1ldGVyTmFtZTogYC9hdXJhMjgvJHtwcm9wcy5lbnZpcm9ubWVudH0vcmVhZGluZy9zeXN0ZW1fcHJvbXB0X3Mza2V5YCxcbiAgICAgIGRlc2NyaXB0aW9uOiBgUzMga2V5IGZvciBzeXN0ZW0gcHJvbXB0IGluICR7cHJvcHMuZW52aXJvbm1lbnR9IGVudmlyb25tZW50YCxcbiAgICAgIHN0cmluZ1ZhbHVlOiBgcHJvbXB0cy8ke3Byb3BzLmVudmlyb25tZW50fS9zb3VsX2JsdWVwcmludC9zeXN0ZW0udHh0YCxcbiAgICAgIHRpZXI6IHNzbS5QYXJhbWV0ZXJUaWVyLlNUQU5EQVJELFxuICAgIH0pO1xuXG4gICAgY29uc3QgdXNlclByb21wdFMzS2V5UGFyYW1ldGVyID0gbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgJ1VzZXJQcm9tcHRTM0tleVBhcmFtZXRlcicsIHtcbiAgICAgIHBhcmFtZXRlck5hbWU6IGAvYXVyYTI4LyR7cHJvcHMuZW52aXJvbm1lbnR9L3JlYWRpbmcvdXNlcl9wcm9tcHRfczNrZXlgLFxuICAgICAgZGVzY3JpcHRpb246IGBTMyBrZXkgZm9yIHVzZXIgcHJvbXB0IHRlbXBsYXRlIGluICR7cHJvcHMuZW52aXJvbm1lbnR9IGVudmlyb25tZW50YCxcbiAgICAgIHN0cmluZ1ZhbHVlOiBgcHJvbXB0cy8ke3Byb3BzLmVudmlyb25tZW50fS9zb3VsX2JsdWVwcmludC91c2VyX3RlbXBsYXRlLm1kYCxcbiAgICAgIHRpZXI6IHNzbS5QYXJhbWV0ZXJUaWVyLlNUQU5EQVJELFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIFN3aXNzIEVwaGVtZXJpcyBMYW1iZGEgTGF5ZXJcbiAgICBjb25zdCBzd2lzc0VwaGVtZXJpc0xheWVyID0gbmV3IGxhbWJkYS5MYXllclZlcnNpb24odGhpcywgJ1N3aXNzRXBoZW1lcmlzTGF5ZXInLCB7XG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2xheWVycy9zd2V0ZXN0JyksIHtcbiAgICAgICAgYnVuZGxpbmc6IHtcbiAgICAgICAgICBpbWFnZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1guYnVuZGxpbmdJbWFnZSxcbiAgICAgICAgICB1c2VyOiAncm9vdCcsXG4gICAgICAgICAgY29tbWFuZDogW1xuICAgICAgICAgICAgJ2Jhc2gnLFxuICAgICAgICAgICAgJy1jJyxcbiAgICAgICAgICAgIFtcbiAgICAgICAgICAgICAgJ21rZGlyIC1wIC9hc3NldC1vdXRwdXQvbm9kZWpzJyxcbiAgICAgICAgICAgICAgJ2NwIHBhY2thZ2UuanNvbiBwYWNrYWdlLWxvY2suanNvbiAvYXNzZXQtb3V0cHV0L25vZGVqcy8nLFxuICAgICAgICAgICAgICAnY2QgL2Fzc2V0LW91dHB1dC9ub2RlanMnLFxuICAgICAgICAgICAgICAnbnBtIGluc3RhbGwnLFxuICAgICAgICAgICAgXS5qb2luKCcgJiYgJyksXG4gICAgICAgICAgXSxcbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgICAgY29tcGF0aWJsZVJ1bnRpbWVzOiBbbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1hdLFxuICAgICAgZGVzY3JpcHRpb246ICdTd2lzcyBFcGhlbWVyaXMgbGlicmFyeSBmb3IgaG91c2UgY2FsY3VsYXRpb25zJyxcbiAgICAgIGxheWVyVmVyc2lvbk5hbWU6IGBhdXJhMjgtJHtwcm9wcy5lbnZpcm9ubWVudH0tc3dpc3NlcGhgLFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIExhbWJkYSBmdW5jdGlvbnNcbiAgICB0aGlzLmdldFVzZXJQcm9maWxlRnVuY3Rpb24gPSBuZXcgbGFtYmRhTm9kZUpzLk5vZGVqc0Z1bmN0aW9uKHRoaXMsICdHZXRVc2VyUHJvZmlsZUZ1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LWdldC11c2VyLXByb2ZpbGVgLFxuICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9sYW1iZGEvdXNlci1wcm9maWxlL2dldC11c2VyLXByb2ZpbGUudHMnKSxcbiAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgVEFCTEVfTkFNRTogcHJvcHMudXNlclRhYmxlLnRhYmxlTmFtZSxcbiAgICAgIH0sXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICBtZW1vcnlTaXplOiAyNTYsXG4gICAgICBidW5kbGluZzoge1xuICAgICAgICBleHRlcm5hbE1vZHVsZXM6IFsnQGF3cy1zZGsvKiddLFxuICAgICAgICBmb3JjZURvY2tlckJ1bmRsaW5nOiBmYWxzZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgZ2VuZXJhdGVOYXRhbENoYXJ0RnVuY3Rpb24gZmlyc3QsIGJlZm9yZSB1cGRhdGVVc2VyUHJvZmlsZUZ1bmN0aW9uIHRoYXQgcmVmZXJlbmNlcyBpdFxuICAgIHRoaXMuZ2VuZXJhdGVOYXRhbENoYXJ0RnVuY3Rpb24gPSBuZXcgbGFtYmRhTm9kZUpzLk5vZGVqc0Z1bmN0aW9uKFxuICAgICAgdGhpcyxcbiAgICAgICdHZW5lcmF0ZU5hdGFsQ2hhcnRGdW5jdGlvbicsXG4gICAgICB7XG4gICAgICAgIGZ1bmN0aW9uTmFtZTogYGF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS1nZW5lcmF0ZS1uYXRhbC1jaGFydGAsXG4gICAgICAgIGVudHJ5OiBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vbGFtYmRhL25hdGFsLWNoYXJ0L2dlbmVyYXRlLW5hdGFsLWNoYXJ0LnRzJyksXG4gICAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcbiAgICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICAgIGxheWVyczogW3N3aXNzRXBoZW1lcmlzTGF5ZXJdLFxuICAgICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICAgIE5BVEFMX0NIQVJUX1RBQkxFX05BTUU6IHByb3BzLm5hdGFsQ2hhcnRUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgICAgRVBIRU1FUklTX1BBVEg6ICcvb3B0L25vZGVqcy9ub2RlX21vZHVsZXMvc3dpc3NlcGgvZXBoZScsXG4gICAgICAgIH0sXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDEwKSwgLy8gMTAgc2Vjb25kcyBmb3IgaG91c2UgY2FsY3VsYXRpb25zXG4gICAgICAgIG1lbW9yeVNpemU6IDUxMiwgLy8gSW5jcmVhc2VkIG1lbW9yeSBmb3IgZXBoZW1lcmlzIGNhbGN1bGF0aW9uc1xuICAgICAgICBidW5kbGluZzoge1xuICAgICAgICAgIGV4dGVybmFsTW9kdWxlczogWydAYXdzLXNkay8qJywgJ3N3aXNzZXBoJ10sIC8vIEV4Y2x1ZGUgc3dpc3NlcGggc2luY2UgaXQncyBpbiB0aGUgbGF5ZXJcbiAgICAgICAgICBmb3JjZURvY2tlckJ1bmRsaW5nOiBmYWxzZSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIHRoaXMudXBkYXRlVXNlclByb2ZpbGVGdW5jdGlvbiA9IG5ldyBsYW1iZGFOb2RlSnMuTm9kZWpzRnVuY3Rpb24oXG4gICAgICB0aGlzLFxuICAgICAgJ1VwZGF0ZVVzZXJQcm9maWxlRnVuY3Rpb24nLFxuICAgICAge1xuICAgICAgICBmdW5jdGlvbk5hbWU6IGBhdXJhMjgtJHtwcm9wcy5lbnZpcm9ubWVudH0tdXBkYXRlLXVzZXItcHJvZmlsZWAsXG4gICAgICAgIGVudHJ5OiBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vbGFtYmRhL3VzZXItcHJvZmlsZS91cGRhdGUtdXNlci1wcm9maWxlLnRzJyksXG4gICAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcbiAgICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgICAgVEFCTEVfTkFNRTogcHJvcHMudXNlclRhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgICBQTEFDRV9JTkRFWF9OQU1FOiBwcm9wcy5wbGFjZUluZGV4TmFtZSxcbiAgICAgICAgICBHRU5FUkFURV9OQVRBTF9DSEFSVF9GVU5DVElPTl9OQU1FOiB0aGlzLmdlbmVyYXRlTmF0YWxDaGFydEZ1bmN0aW9uLmZ1bmN0aW9uTmFtZSxcbiAgICAgICAgfSxcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgICBtZW1vcnlTaXplOiAyNTYsXG4gICAgICAgIGJ1bmRsaW5nOiB7XG4gICAgICAgICAgZXh0ZXJuYWxNb2R1bGVzOiBbJ0Bhd3Mtc2RrLyonXSxcbiAgICAgICAgICBmb3JjZURvY2tlckJ1bmRsaW5nOiBmYWxzZSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIEdyYW50IER5bmFtb0RCIHBlcm1pc3Npb25zXG4gICAgcHJvcHMudXNlclRhYmxlLmdyYW50UmVhZERhdGEodGhpcy5nZXRVc2VyUHJvZmlsZUZ1bmN0aW9uKTtcbiAgICBwcm9wcy51c2VyVGFibGUuZ3JhbnRXcml0ZURhdGEodGhpcy51cGRhdGVVc2VyUHJvZmlsZUZ1bmN0aW9uKTtcbiAgICBwcm9wcy5uYXRhbENoYXJ0VGFibGUuZ3JhbnRXcml0ZURhdGEodGhpcy5nZW5lcmF0ZU5hdGFsQ2hhcnRGdW5jdGlvbik7XG5cbiAgICB0aGlzLmdldE5hdGFsQ2hhcnRGdW5jdGlvbiA9IG5ldyBsYW1iZGFOb2RlSnMuTm9kZWpzRnVuY3Rpb24odGhpcywgJ0dldE5hdGFsQ2hhcnRGdW5jdGlvbicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogYGF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS1nZXQtbmF0YWwtY2hhcnRgLFxuICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9sYW1iZGEvbmF0YWwtY2hhcnQvZ2V0LW5hdGFsLWNoYXJ0LnRzJyksXG4gICAgICBoYW5kbGVyOiAnaGFuZGxlcicsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIE5BVEFMX0NIQVJUX1RBQkxFX05BTUU6IHByb3BzLm5hdGFsQ2hhcnRUYWJsZS50YWJsZU5hbWUsXG4gICAgICB9LFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgbWVtb3J5U2l6ZTogMjU2LFxuICAgICAgYnVuZGxpbmc6IHtcbiAgICAgICAgZXh0ZXJuYWxNb2R1bGVzOiBbJ0Bhd3Mtc2RrLyonXSxcbiAgICAgICAgZm9yY2VEb2NrZXJCdW5kbGluZzogZmFsc2UsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgcHJvcHMubmF0YWxDaGFydFRhYmxlLmdyYW50UmVhZERhdGEodGhpcy5nZXROYXRhbENoYXJ0RnVuY3Rpb24pO1xuXG4gICAgLy8gR3JhbnQgaW52b2NhdGlvbiBwZXJtaXNzaW9uXG4gICAgdGhpcy5nZW5lcmF0ZU5hdGFsQ2hhcnRGdW5jdGlvbi5ncmFudEludm9rZSh0aGlzLnVwZGF0ZVVzZXJQcm9maWxlRnVuY3Rpb24pO1xuXG4gICAgLy8gQ3JlYXRlIExhbWJkYSBmdW5jdGlvbnMgZm9yIHJlYWRpbmdzXG4gICAgdGhpcy5nZW5lcmF0ZVJlYWRpbmdGdW5jdGlvbiA9IG5ldyBsYW1iZGFOb2RlSnMuTm9kZWpzRnVuY3Rpb24oXG4gICAgICB0aGlzLFxuICAgICAgJ0dlbmVyYXRlUmVhZGluZ0Z1bmN0aW9uJyxcbiAgICAgIHtcbiAgICAgICAgZnVuY3Rpb25OYW1lOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LWdlbmVyYXRlLXJlYWRpbmdgLFxuICAgICAgICBlbnRyeTogcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2xhbWJkYS9yZWFkaW5ncy9nZW5lcmF0ZS1yZWFkaW5nLnRzJyksXG4gICAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcbiAgICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgICAgUkVBRElOR1NfVEFCTEVfTkFNRTogcHJvcHMucmVhZGluZ3NUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgICAgTkFUQUxfQ0hBUlRfVEFCTEVfTkFNRTogcHJvcHMubmF0YWxDaGFydFRhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgICBVU0VSX1RBQkxFX05BTUU6IHByb3BzLnVzZXJUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgICAgQ09ORklHX0JVQ0tFVF9OQU1FOiBjb25maWdCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgICAgICBPUEVOQUlfQVBJX0tFWV9QQVJBTUVURVJfTkFNRTogb3BlbkFpQXBpS2V5UGFyYW1ldGVyLnBhcmFtZXRlck5hbWUsXG4gICAgICAgICAgUkVBRElOR19NT0RFTF9QQVJBTUVURVJfTkFNRTogcmVhZGluZ01vZGVsUGFyYW1ldGVyLnBhcmFtZXRlck5hbWUsXG4gICAgICAgICAgUkVBRElOR19URU1QRVJBVFVSRV9QQVJBTUVURVJfTkFNRTogcmVhZGluZ1RlbXBlcmF0dXJlUGFyYW1ldGVyLnBhcmFtZXRlck5hbWUsXG4gICAgICAgICAgUkVBRElOR19NQVhfVE9LRU5TX1BBUkFNRVRFUl9OQU1FOiByZWFkaW5nTWF4VG9rZW5zUGFyYW1ldGVyLnBhcmFtZXRlck5hbWUsXG4gICAgICAgICAgU1lTVEVNX1BST01QVF9TM0tFWV9QQVJBTUVURVJfTkFNRTogc3lzdGVtUHJvbXB0UzNLZXlQYXJhbWV0ZXIucGFyYW1ldGVyTmFtZSxcbiAgICAgICAgICBVU0VSX1BST01QVF9TM0tFWV9QQVJBTUVURVJfTkFNRTogdXNlclByb21wdFMzS2V5UGFyYW1ldGVyLnBhcmFtZXRlck5hbWUsXG4gICAgICAgIH0sXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDEyMCksIC8vIEV4dGVuZGVkIHRpbWVvdXQgZm9yIE9wZW5BSSBBUEkgY2FsbHNcbiAgICAgICAgbWVtb3J5U2l6ZTogNTEyLFxuICAgICAgICBidW5kbGluZzoge1xuICAgICAgICAgIGV4dGVybmFsTW9kdWxlczogWydAYXdzLXNkay8qJ10sXG4gICAgICAgICAgZm9yY2VEb2NrZXJCdW5kbGluZzogZmFsc2UsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICB0aGlzLmdldFJlYWRpbmdzRnVuY3Rpb24gPSBuZXcgbGFtYmRhTm9kZUpzLk5vZGVqc0Z1bmN0aW9uKHRoaXMsICdHZXRSZWFkaW5nc0Z1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LWdldC1yZWFkaW5nc2AsXG4gICAgICBlbnRyeTogcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2xhbWJkYS9yZWFkaW5ncy9nZXQtcmVhZGluZ3MudHMnKSxcbiAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgUkVBRElOR1NfVEFCTEVfTkFNRTogcHJvcHMucmVhZGluZ3NUYWJsZS50YWJsZU5hbWUsXG4gICAgICB9LFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgbWVtb3J5U2l6ZTogMjU2LFxuICAgICAgYnVuZGxpbmc6IHtcbiAgICAgICAgZXh0ZXJuYWxNb2R1bGVzOiBbJ0Bhd3Mtc2RrLyonXSxcbiAgICAgICAgZm9yY2VEb2NrZXJCdW5kbGluZzogZmFsc2UsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgdGhpcy5nZXRSZWFkaW5nRGV0YWlsRnVuY3Rpb24gPSBuZXcgbGFtYmRhTm9kZUpzLk5vZGVqc0Z1bmN0aW9uKFxuICAgICAgdGhpcyxcbiAgICAgICdHZXRSZWFkaW5nRGV0YWlsRnVuY3Rpb24nLFxuICAgICAge1xuICAgICAgICBmdW5jdGlvbk5hbWU6IGBhdXJhMjgtJHtwcm9wcy5lbnZpcm9ubWVudH0tZ2V0LXJlYWRpbmctZGV0YWlsYCxcbiAgICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9sYW1iZGEvcmVhZGluZ3MvZ2V0LXJlYWRpbmctZGV0YWlsLnRzJyksXG4gICAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcbiAgICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgICAgUkVBRElOR1NfVEFCTEVfTkFNRTogcHJvcHMucmVhZGluZ3NUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIH0sXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgICAgbWVtb3J5U2l6ZTogMjU2LFxuICAgICAgICBidW5kbGluZzoge1xuICAgICAgICAgIGV4dGVybmFsTW9kdWxlczogWydAYXdzLXNkay8qJ10sXG4gICAgICAgICAgZm9yY2VEb2NrZXJCdW5kbGluZzogZmFsc2UsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBHcmFudCBEeW5hbW9EQiBwZXJtaXNzaW9ucyBmb3IgcmVhZGluZ3NcbiAgICBwcm9wcy5yZWFkaW5nc1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YSh0aGlzLmdlbmVyYXRlUmVhZGluZ0Z1bmN0aW9uKTtcbiAgICBwcm9wcy5yZWFkaW5nc1RhYmxlLmdyYW50UmVhZERhdGEodGhpcy5nZXRSZWFkaW5nc0Z1bmN0aW9uKTtcbiAgICBwcm9wcy5yZWFkaW5nc1RhYmxlLmdyYW50UmVhZERhdGEodGhpcy5nZXRSZWFkaW5nRGV0YWlsRnVuY3Rpb24pO1xuICAgIHByb3BzLm5hdGFsQ2hhcnRUYWJsZS5ncmFudFJlYWREYXRhKHRoaXMuZ2VuZXJhdGVSZWFkaW5nRnVuY3Rpb24pO1xuICAgIHByb3BzLnVzZXJUYWJsZS5ncmFudFJlYWREYXRhKHRoaXMuZ2VuZXJhdGVSZWFkaW5nRnVuY3Rpb24pO1xuXG4gICAgLy8gR3JhbnQgcGVybWlzc2lvbnMgdG8gZ2VuZXJhdGUgcmVhZGluZyBmdW5jdGlvblxuICAgIC8vIFNTTSBwYXJhbWV0ZXIgcmVhZCBwZXJtaXNzaW9uc1xuICAgIG9wZW5BaUFwaUtleVBhcmFtZXRlci5ncmFudFJlYWQodGhpcy5nZW5lcmF0ZVJlYWRpbmdGdW5jdGlvbik7XG4gICAgcmVhZGluZ01vZGVsUGFyYW1ldGVyLmdyYW50UmVhZCh0aGlzLmdlbmVyYXRlUmVhZGluZ0Z1bmN0aW9uKTtcbiAgICByZWFkaW5nVGVtcGVyYXR1cmVQYXJhbWV0ZXIuZ3JhbnRSZWFkKHRoaXMuZ2VuZXJhdGVSZWFkaW5nRnVuY3Rpb24pO1xuICAgIHJlYWRpbmdNYXhUb2tlbnNQYXJhbWV0ZXIuZ3JhbnRSZWFkKHRoaXMuZ2VuZXJhdGVSZWFkaW5nRnVuY3Rpb24pO1xuICAgIHN5c3RlbVByb21wdFMzS2V5UGFyYW1ldGVyLmdyYW50UmVhZCh0aGlzLmdlbmVyYXRlUmVhZGluZ0Z1bmN0aW9uKTtcbiAgICB1c2VyUHJvbXB0UzNLZXlQYXJhbWV0ZXIuZ3JhbnRSZWFkKHRoaXMuZ2VuZXJhdGVSZWFkaW5nRnVuY3Rpb24pO1xuXG4gICAgLy8gUzMgYnVja2V0IHJlYWQgcGVybWlzc2lvbnMgZm9yIGNvbmZpZ3VyYXRpb24gZmlsZXNcbiAgICBjb25maWdCdWNrZXQuZ3JhbnRSZWFkKHRoaXMuZ2VuZXJhdGVSZWFkaW5nRnVuY3Rpb24pO1xuXG4gICAgLy8gR3JhbnQgTG9jYXRpb24gU2VydmljZSBwZXJtaXNzaW9uc1xuICAgIHRoaXMudXBkYXRlVXNlclByb2ZpbGVGdW5jdGlvbi5hZGRUb1JvbGVQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGFjdGlvbnM6IFsnZ2VvOlNlYXJjaFBsYWNlSW5kZXhGb3JUZXh0J10sXG4gICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgIGBhcm46YXdzOmdlbzoke2Nkay5TdGFjay5vZih0aGlzKS5yZWdpb259OiR7Y2RrLlN0YWNrLm9mKHRoaXMpLmFjY291bnR9OnBsYWNlLWluZGV4LyR7XG4gICAgICAgICAgICBwcm9wcy5wbGFjZUluZGV4TmFtZVxuICAgICAgICAgIH1gLFxuICAgICAgICBdLFxuICAgICAgfSksXG4gICAgKTtcblxuICAgIC8vIENyZWF0ZSBBUEkgR2F0ZXdheVxuICAgIHRoaXMuYXBpID0gbmV3IGFwaWdhdGV3YXkuUmVzdEFwaSh0aGlzLCAnVXNlckFwaScsIHtcbiAgICAgIHJlc3RBcGlOYW1lOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LXVzZXItYXBpYCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVBJIGZvciB1c2VyIHByb2ZpbGUgbWFuYWdlbWVudCcsXG4gICAgICBkZXBsb3lPcHRpb25zOiB7XG4gICAgICAgIHN0YWdlTmFtZTogcHJvcHMuZW52aXJvbm1lbnQsXG4gICAgICAgIHRyYWNpbmdFbmFibGVkOiB0cnVlLFxuICAgICAgICBkYXRhVHJhY2VFbmFibGVkOiB0cnVlLFxuICAgICAgICBsb2dnaW5nTGV2ZWw6IGFwaWdhdGV3YXkuTWV0aG9kTG9nZ2luZ0xldmVsLklORk8sXG4gICAgICAgIG1ldHJpY3NFbmFibGVkOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIGRlZmF1bHRDb3JzUHJlZmxpZ2h0T3B0aW9uczoge1xuICAgICAgICBhbGxvd09yaWdpbnM6IHByb3BzLmFsbG93ZWRPcmlnaW5zLFxuICAgICAgICBhbGxvd01ldGhvZHM6IFsnR0VUJywgJ1BVVCcsICdQT1NUJywgJ09QVElPTlMnXSxcbiAgICAgICAgYWxsb3dIZWFkZXJzOiBbXG4gICAgICAgICAgJ0NvbnRlbnQtVHlwZScsXG4gICAgICAgICAgJ1gtQW16LURhdGUnLFxuICAgICAgICAgICdBdXRob3JpemF0aW9uJyxcbiAgICAgICAgICAnWC1BcGktS2V5JyxcbiAgICAgICAgICAnWC1BbXotU2VjdXJpdHktVG9rZW4nLFxuICAgICAgICBdLFxuICAgICAgICBhbGxvd0NyZWRlbnRpYWxzOiB0cnVlLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBDb2duaXRvIGF1dGhvcml6ZXJcbiAgICBjb25zdCBhdXRob3JpemVyID0gbmV3IGFwaWdhdGV3YXkuQ29nbml0b1VzZXJQb29sc0F1dGhvcml6ZXIodGhpcywgJ1VzZXJQb29sQXV0aG9yaXplcicsIHtcbiAgICAgIGNvZ25pdG9Vc2VyUG9vbHM6IFtwcm9wcy51c2VyUG9vbF0sXG4gICAgICBhdXRob3JpemVyTmFtZTogYGF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS1hdXRob3JpemVyYCxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSAvYXBpL3VzZXJzL3t1c2VySWR9L3Byb2ZpbGUgcmVzb3VyY2VcbiAgICBjb25zdCBhcGlSZXNvdXJjZSA9IHRoaXMuYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ2FwaScpO1xuICAgIGNvbnN0IHVzZXJzUmVzb3VyY2UgPSBhcGlSZXNvdXJjZS5hZGRSZXNvdXJjZSgndXNlcnMnKTtcbiAgICBjb25zdCB1c2VySWRSZXNvdXJjZSA9IHVzZXJzUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3t1c2VySWR9Jyk7XG4gICAgY29uc3QgcHJvZmlsZVJlc291cmNlID0gdXNlcklkUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3Byb2ZpbGUnKTtcblxuICAgIC8vIEFkZCBHRVQgbWV0aG9kXG4gICAgcHJvZmlsZVJlc291cmNlLmFkZE1ldGhvZChcbiAgICAgICdHRVQnLFxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24odGhpcy5nZXRVc2VyUHJvZmlsZUZ1bmN0aW9uKSxcbiAgICAgIHtcbiAgICAgICAgYXV0aG9yaXplcixcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIEFkZCAvYXBpL3VzZXJzL3t1c2VySWR9L25hdGFsLWNoYXJ0IHJlc291cmNlXG4gICAgY29uc3QgbmF0YWxDaGFydFJlc291cmNlID0gdXNlcklkUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ25hdGFsLWNoYXJ0Jyk7XG4gICAgbmF0YWxDaGFydFJlc291cmNlLmFkZE1ldGhvZChcbiAgICAgICdHRVQnLFxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24odGhpcy5nZXROYXRhbENoYXJ0RnVuY3Rpb24pLFxuICAgICAge1xuICAgICAgICBhdXRob3JpemVyLFxuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gQWRkIFBVVCBtZXRob2RcbiAgICBwcm9maWxlUmVzb3VyY2UuYWRkTWV0aG9kKFxuICAgICAgJ1BVVCcsXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbih0aGlzLnVwZGF0ZVVzZXJQcm9maWxlRnVuY3Rpb24pLFxuICAgICAge1xuICAgICAgICBhdXRob3JpemVyLFxuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gQWRkIC9hcGkvdXNlcnMve3VzZXJJZH0vcmVhZGluZ3MgcmVzb3VyY2VcbiAgICBjb25zdCByZWFkaW5nc1Jlc291cmNlID0gdXNlcklkUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3JlYWRpbmdzJyk7XG5cbiAgICAvLyBHRVQgL2FwaS91c2Vycy97dXNlcklkfS9yZWFkaW5ncyAtIExpc3QgdXNlcidzIHJlYWRpbmdzXG4gICAgcmVhZGluZ3NSZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHRoaXMuZ2V0UmVhZGluZ3NGdW5jdGlvbiksIHtcbiAgICAgIGF1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuXG4gICAgLy8gUE9TVCAvYXBpL3VzZXJzL3t1c2VySWR9L3JlYWRpbmdzIC0gR2VuZXJhdGUgYSBuZXcgcmVhZGluZ1xuICAgIHJlYWRpbmdzUmVzb3VyY2UuYWRkTWV0aG9kKFxuICAgICAgJ1BPU1QnLFxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24odGhpcy5nZW5lcmF0ZVJlYWRpbmdGdW5jdGlvbiksXG4gICAgICB7XG4gICAgICAgIGF1dGhvcml6ZXIsXG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBBZGQgL2FwaS91c2Vycy97dXNlcklkfS9yZWFkaW5ncy97cmVhZGluZ0lkfSByZXNvdXJjZVxuICAgIGNvbnN0IHJlYWRpbmdJZFJlc291cmNlID0gcmVhZGluZ3NSZXNvdXJjZS5hZGRSZXNvdXJjZSgne3JlYWRpbmdJZH0nKTtcblxuICAgIC8vIEdFVCAvYXBpL3VzZXJzL3t1c2VySWR9L3JlYWRpbmdzL3tyZWFkaW5nSWR9IC0gR2V0IHJlYWRpbmcgZGV0YWlsXG4gICAgcmVhZGluZ0lkUmVzb3VyY2UuYWRkTWV0aG9kKFxuICAgICAgJ0dFVCcsXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbih0aGlzLmdldFJlYWRpbmdEZXRhaWxGdW5jdGlvbiksXG4gICAgICB7XG4gICAgICAgIGF1dGhvcml6ZXIsXG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBPdXRwdXQgQVBJIFVSTFxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBcGlVcmwnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5hcGkudXJsLFxuICAgICAgZGVzY3JpcHRpb246ICdBUEkgR2F0ZXdheSBVUkwnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FwaUVuZHBvaW50Jywge1xuICAgICAgdmFsdWU6IGAke3RoaXMuYXBpLnVybH1hcGkvdXNlcnMve3VzZXJJZH0vcHJvZmlsZWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ1VzZXIgUHJvZmlsZSBBUEkgRW5kcG9pbnQnLFxuICAgIH0pO1xuICB9XG59XG4iXX0=