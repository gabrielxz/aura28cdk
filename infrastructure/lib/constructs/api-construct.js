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
    adminGetAllReadingsFunction;
    adminGetAllUsersFunction;
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
                            // Copy pre-built layer directory if it exists
                            'if [ -d /asset-input/layer/nodejs ]; then',
                            '  cp -r /asset-input/layer/nodejs /asset-output/',
                            'else',
                            '  echo "Error: Pre-built layer directory not found at /asset-input/layer/nodejs"',
                            '  exit 1',
                            'fi',
                        ].join(' && '),
                    ],
                    local: {
                        // Bundle locally by copying the pre-built layer directory
                        tryBundle(outputDir) {
                            const child_process = require('child_process');
                            const fs = require('fs');
                            const path = require('path');
                            try {
                                const srcLayerDir = path.join(__dirname, '../../layers/swetest/layer');
                                const srcNodejsDir = path.join(srcLayerDir, 'nodejs');
                                // Check if pre-built layer exists
                                if (!fs.existsSync(srcNodejsDir)) {
                                    console.error('Pre-built layer directory not found at:', srcNodejsDir);
                                    console.error('Please run: cd infrastructure/layers/swetest && npm install');
                                    return false;
                                }
                                // Validate that swisseph and ephemeris files exist
                                const swissephDir = path.join(srcNodejsDir, 'node_modules/swisseph');
                                const epheDir = path.join(swissephDir, 'ephe');
                                if (!fs.existsSync(swissephDir)) {
                                    console.error('swisseph module not found in pre-built layer');
                                    return false;
                                }
                                if (!fs.existsSync(epheDir)) {
                                    console.error('ephemeris data directory not found in pre-built layer');
                                    return false;
                                }
                                // Check for essential ephemeris files
                                const essentialFiles = [
                                    'semo_18.se1',
                                    'sepl_18.se1',
                                    'seas_18.se1',
                                    'seleapsec.txt',
                                    'seorbel.txt',
                                ];
                                for (const file of essentialFiles) {
                                    if (!fs.existsSync(path.join(epheDir, file))) {
                                        console.error(`Essential ephemeris file missing: ${file}`);
                                        return false;
                                    }
                                }
                                // Copy the entire pre-built layer to output
                                console.log('Copying pre-built Swiss Ephemeris layer...');
                                child_process.execSync(`cp -r "${srcNodejsDir}" "${outputDir}/"`, {
                                    stdio: 'inherit',
                                });
                                // Log success and layer size
                                const layerSize = child_process
                                    .execSync(`du -sh "${outputDir}/nodejs"`, { encoding: 'utf8' })
                                    .trim();
                                console.log(`Successfully bundled Swiss Ephemeris layer: ${layerSize}`);
                                return true;
                            }
                            catch (error) {
                                console.error('Failed to bundle Swiss Ephemeris layer:', error);
                                return false;
                            }
                        },
                    },
                },
            }),
            compatibleRuntimes: [lambda.Runtime.NODEJS_18_X],
            description: 'Swiss Ephemeris library v2 with house calculations and ephemeris data',
            layerVersionName: `aura28-${props.environment}-swisseph-v2`,
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
                SE_EPHE_PATH: '/opt/nodejs/node_modules/swisseph/ephe',
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
        // Create Admin Lambda functions
        this.adminGetAllReadingsFunction = new lambdaNodeJs.NodejsFunction(this, 'AdminGetAllReadingsFunction', {
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
        });
        this.adminGetAllUsersFunction = new lambdaNodeJs.NodejsFunction(this, 'AdminGetAllUsersFunction', {
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
        });
        // Grant DynamoDB permissions for admin functions
        props.readingsTable.grantReadData(this.adminGetAllReadingsFunction);
        props.userTable.grantReadData(this.adminGetAllReadingsFunction);
        // Grant Cognito permissions for admin user listing
        this.adminGetAllUsersFunction.addToRolePolicy(new iam.PolicyStatement({
            actions: ['cognito-idp:ListUsers'],
            resources: [props.userPool.userPoolArn],
        }));
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
        // Create /api/admin resources
        const adminResource = apiResource.addResource('admin');
        // GET /api/admin/readings - Get all readings (admin only)
        const adminReadingsResource = adminResource.addResource('readings');
        adminReadingsResource.addMethod('GET', new apigateway.LambdaIntegration(this.adminGetAllReadingsFunction), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        // GET /api/admin/users - Get all users (admin only)
        const adminUsersResource = adminResource.addResource('users');
        adminUsersResource.addMethod('GET', new apigateway.LambdaIntegration(this.adminGetAllUsersFunction), {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBpLWNvbnN0cnVjdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImFwaS1jb25zdHJ1Y3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSwyQ0FBdUM7QUFDdkMsaURBQW1DO0FBQ25DLHVFQUF5RDtBQUN6RCwrREFBaUQ7QUFDakQsNEVBQThEO0FBRzlELHlEQUEyQztBQUMzQyx5REFBMkM7QUFDM0MsdURBQXlDO0FBQ3pDLHdFQUEwRDtBQUMxRCwyQ0FBNkI7QUFZN0IsTUFBYSxZQUFhLFNBQVEsc0JBQVM7SUFDekIsR0FBRyxDQUFxQjtJQUN4QixzQkFBc0IsQ0FBa0I7SUFDeEMseUJBQXlCLENBQWtCO0lBQzNDLDBCQUEwQixDQUFrQjtJQUM1QyxxQkFBcUIsQ0FBa0I7SUFDdkMsdUJBQXVCLENBQWtCO0lBQ3pDLG1CQUFtQixDQUFrQjtJQUNyQyx3QkFBd0IsQ0FBa0I7SUFDMUMsMkJBQTJCLENBQWtCO0lBQzdDLHdCQUF3QixDQUFrQjtJQUUxRCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXdCO1FBQ2hFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsMkNBQTJDO1FBQzNDLE1BQU0sWUFBWSxHQUFHLElBQUksRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsY0FBYyxFQUFFO1lBQ3ZELFVBQVUsRUFBRSxVQUFVLEtBQUssQ0FBQyxXQUFXLFNBQVM7WUFDaEQsU0FBUyxFQUFFLElBQUk7WUFDZixpQkFBaUIsRUFBRSxFQUFFLENBQUMsaUJBQWlCLENBQUMsU0FBUztZQUNqRCxVQUFVLEVBQUUsRUFBRSxDQUFDLGdCQUFnQixDQUFDLFVBQVU7WUFDMUMsYUFBYSxFQUNYLEtBQUssQ0FBQyxXQUFXLEtBQUssTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FB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RCxNQUFNLGtCQUFrQixHQUFHLGFBQWEsQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDOUQsa0JBQWtCLENBQUMsU0FBUyxDQUMxQixLQUFLLEVBQ0wsSUFBSSxVQUFVLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLHdCQUF3QixDQUFDLEVBQy9EO1lBQ0UsVUFBVTtZQUNWLGlCQUFpQixFQUFFLFVBQVUsQ0FBQyxpQkFBaUIsQ0FBQyxPQUFPO1NBQ3hELENBQ0YsQ0FBQztRQUVGLGlCQUFpQjtRQUNqQixJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLFFBQVEsRUFBRTtZQUNoQyxLQUFLLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHO1lBQ25CLFdBQVcsRUFBRSxpQkFBaUI7U0FDL0IsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxhQUFhLEVBQUU7WUFDckMsS0FBSyxFQUFFLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLDRCQUE0QjtZQUNsRCxXQUFXLEVBQUUsMkJBQTJCO1NBQ3pDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQS9pQkQsb0NBK2lCQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGFwaWdhdGV3YXkgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXknO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xuaW1wb3J0ICogYXMgbGFtYmRhTm9kZUpzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEtbm9kZWpzJztcbmltcG9ydCAqIGFzIGR5bmFtb2RiIGZyb20gJ2F3cy1jZGstbGliL2F3cy1keW5hbW9kYic7XG5pbXBvcnQgKiBhcyBjb2duaXRvIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jb2duaXRvJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIHNzbSBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc3NtJztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XG5pbXBvcnQgKiBhcyBzM2RlcGxveSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMtZGVwbG95bWVudCc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuXG5leHBvcnQgaW50ZXJmYWNlIEFwaUNvbnN0cnVjdFByb3BzIHtcbiAgZW52aXJvbm1lbnQ6ICdkZXYnIHwgJ3Byb2QnO1xuICB1c2VyVGFibGU6IGR5bmFtb2RiLlRhYmxlO1xuICBuYXRhbENoYXJ0VGFibGU6IGR5bmFtb2RiLlRhYmxlO1xuICByZWFkaW5nc1RhYmxlOiBkeW5hbW9kYi5UYWJsZTtcbiAgdXNlclBvb2w6IGNvZ25pdG8uVXNlclBvb2w7XG4gIHBsYWNlSW5kZXhOYW1lOiBzdHJpbmc7XG4gIGFsbG93ZWRPcmlnaW5zOiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGNsYXNzIEFwaUNvbnN0cnVjdCBleHRlbmRzIENvbnN0cnVjdCB7XG4gIHB1YmxpYyByZWFkb25seSBhcGk6IGFwaWdhdGV3YXkuUmVzdEFwaTtcbiAgcHVibGljIHJlYWRvbmx5IGdldFVzZXJQcm9maWxlRnVuY3Rpb246IGxhbWJkYS5GdW5jdGlvbjtcbiAgcHVibGljIHJlYWRvbmx5IHVwZGF0ZVVzZXJQcm9maWxlRnVuY3Rpb246IGxhbWJkYS5GdW5jdGlvbjtcbiAgcHVibGljIHJlYWRvbmx5IGdlbmVyYXRlTmF0YWxDaGFydEZ1bmN0aW9uOiBsYW1iZGEuRnVuY3Rpb247XG4gIHB1YmxpYyByZWFkb25seSBnZXROYXRhbENoYXJ0RnVuY3Rpb246IGxhbWJkYS5GdW5jdGlvbjtcbiAgcHVibGljIHJlYWRvbmx5IGdlbmVyYXRlUmVhZGluZ0Z1bmN0aW9uOiBsYW1iZGEuRnVuY3Rpb247XG4gIHB1YmxpYyByZWFkb25seSBnZXRSZWFkaW5nc0Z1bmN0aW9uOiBsYW1iZGEuRnVuY3Rpb247XG4gIHB1YmxpYyByZWFkb25seSBnZXRSZWFkaW5nRGV0YWlsRnVuY3Rpb246IGxhbWJkYS5GdW5jdGlvbjtcbiAgcHVibGljIHJlYWRvbmx5IGFkbWluR2V0QWxsUmVhZGluZ3NGdW5jdGlvbjogbGFtYmRhLkZ1bmN0aW9uO1xuICBwdWJsaWMgcmVhZG9ubHkgYWRtaW5HZXRBbGxVc2Vyc0Z1bmN0aW9uOiBsYW1iZGEuRnVuY3Rpb247XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IEFwaUNvbnN0cnVjdFByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIC8vIENyZWF0ZSBTMyBidWNrZXQgZm9yIGNvbmZpZ3VyYXRpb24gZmlsZXNcbiAgICBjb25zdCBjb25maWdCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsICdDb25maWdCdWNrZXQnLCB7XG4gICAgICBidWNrZXROYW1lOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LWNvbmZpZ2AsXG4gICAgICB2ZXJzaW9uZWQ6IHRydWUsXG4gICAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxuICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VELFxuICAgICAgcmVtb3ZhbFBvbGljeTpcbiAgICAgICAgcHJvcHMuZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTiA6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICBhdXRvRGVsZXRlT2JqZWN0czogcHJvcHMuZW52aXJvbm1lbnQgIT09ICdwcm9kJyxcbiAgICAgIGxpZmVjeWNsZVJ1bGVzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogJ2RlbGV0ZS1vbGQtdmVyc2lvbnMnLFxuICAgICAgICAgIG5vbmN1cnJlbnRWZXJzaW9uRXhwaXJhdGlvbjogY2RrLkR1cmF0aW9uLmRheXMoMzApLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIERlcGxveSBwcm9tcHQgZmlsZXMgdG8gUzNcbiAgICBuZXcgczNkZXBsb3kuQnVja2V0RGVwbG95bWVudCh0aGlzLCAnRGVwbG95UHJvbXB0cycsIHtcbiAgICAgIHNvdXJjZXM6IFtcbiAgICAgICAgczNkZXBsb3kuU291cmNlLmFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9hc3NldHMvcHJvbXB0cycsIHByb3BzLmVudmlyb25tZW50KSksXG4gICAgICBdLFxuICAgICAgZGVzdGluYXRpb25CdWNrZXQ6IGNvbmZpZ0J1Y2tldCxcbiAgICAgIGRlc3RpbmF0aW9uS2V5UHJlZml4OiBgcHJvbXB0cy8ke3Byb3BzLmVudmlyb25tZW50fWAsXG4gICAgICBwcnVuZTogZmFsc2UsXG4gICAgICByZXRhaW5PbkRlbGV0ZTogcHJvcHMuZW52aXJvbm1lbnQgPT09ICdwcm9kJyxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBTU00gUGFyYW1ldGVycyBmb3IgT3BlbkFJIENvbmZpZ3VyYXRpb25cbiAgICBjb25zdCBvcGVuQWlBcGlLZXlQYXJhbWV0ZXIgPSBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcih0aGlzLCAnT3BlbkFpQXBpS2V5UGFyYW1ldGVyJywge1xuICAgICAgcGFyYW1ldGVyTmFtZTogYC9hdXJhMjgvJHtwcm9wcy5lbnZpcm9ubWVudH0vb3BlbmFpLWFwaS1rZXlgLFxuICAgICAgZGVzY3JpcHRpb246IGBPcGVuQUkgQVBJIGtleSBmb3IgJHtwcm9wcy5lbnZpcm9ubWVudH0gZW52aXJvbm1lbnRgLFxuICAgICAgc3RyaW5nVmFsdWU6ICdQTEFDRUhPTERFUl9UT19CRV9SRVBMQUNFRF9NQU5VQUxMWScsXG4gICAgICB0aWVyOiBzc20uUGFyYW1ldGVyVGllci5TVEFOREFSRCxcbiAgICB9KTtcblxuICAgIC8vIFNpbXBsaWZpZWQgU1NNIHBhcmFtZXRlcnMgcG9pbnRpbmcgdG8gUzMga2V5c1xuICAgIGNvbnN0IHJlYWRpbmdNb2RlbFBhcmFtZXRlciA9IG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsICdSZWFkaW5nTW9kZWxQYXJhbWV0ZXInLCB7XG4gICAgICBwYXJhbWV0ZXJOYW1lOiBgL2F1cmEyOC8ke3Byb3BzLmVudmlyb25tZW50fS9yZWFkaW5nL21vZGVsYCxcbiAgICAgIGRlc2NyaXB0aW9uOiBgT3BlbkFJIG1vZGVsIGZvciByZWFkaW5ncyBpbiAke3Byb3BzLmVudmlyb25tZW50fSBlbnZpcm9ubWVudGAsXG4gICAgICBzdHJpbmdWYWx1ZTogJ2dwdC00LXR1cmJvLXByZXZpZXcnLFxuICAgICAgdGllcjogc3NtLlBhcmFtZXRlclRpZXIuU1RBTkRBUkQsXG4gICAgfSk7XG5cbiAgICBjb25zdCByZWFkaW5nVGVtcGVyYXR1cmVQYXJhbWV0ZXIgPSBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcihcbiAgICAgIHRoaXMsXG4gICAgICAnUmVhZGluZ1RlbXBlcmF0dXJlUGFyYW1ldGVyJyxcbiAgICAgIHtcbiAgICAgICAgcGFyYW1ldGVyTmFtZTogYC9hdXJhMjgvJHtwcm9wcy5lbnZpcm9ubWVudH0vcmVhZGluZy90ZW1wZXJhdHVyZWAsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBgVGVtcGVyYXR1cmUgZm9yIHJlYWRpbmdzIGluICR7cHJvcHMuZW52aXJvbm1lbnR9IGVudmlyb25tZW50YCxcbiAgICAgICAgc3RyaW5nVmFsdWU6ICcwLjcnLFxuICAgICAgICB0aWVyOiBzc20uUGFyYW1ldGVyVGllci5TVEFOREFSRCxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIGNvbnN0IHJlYWRpbmdNYXhUb2tlbnNQYXJhbWV0ZXIgPSBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcih0aGlzLCAnUmVhZGluZ01heFRva2Vuc1BhcmFtZXRlcicsIHtcbiAgICAgIHBhcmFtZXRlck5hbWU6IGAvYXVyYTI4LyR7cHJvcHMuZW52aXJvbm1lbnR9L3JlYWRpbmcvbWF4X3Rva2Vuc2AsXG4gICAgICBkZXNjcmlwdGlvbjogYE1heCB0b2tlbnMgZm9yIHJlYWRpbmdzIGluICR7cHJvcHMuZW52aXJvbm1lbnR9IGVudmlyb25tZW50YCxcbiAgICAgIHN0cmluZ1ZhbHVlOiAnMjAwMCcsXG4gICAgICB0aWVyOiBzc20uUGFyYW1ldGVyVGllci5TVEFOREFSRCxcbiAgICB9KTtcblxuICAgIGNvbnN0IHN5c3RlbVByb21wdFMzS2V5UGFyYW1ldGVyID0gbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgJ1N5c3RlbVByb21wdFMzS2V5UGFyYW1ldGVyJywge1xuICAgICAgcGFyYW1ldGVyTmFtZTogYC9hdXJhMjgvJHtwcm9wcy5lbnZpcm9ubWVudH0vcmVhZGluZy9zeXN0ZW1fcHJvbXB0X3Mza2V5YCxcbiAgICAgIGRlc2NyaXB0aW9uOiBgUzMga2V5IGZvciBzeXN0ZW0gcHJvbXB0IGluICR7cHJvcHMuZW52aXJvbm1lbnR9IGVudmlyb25tZW50YCxcbiAgICAgIHN0cmluZ1ZhbHVlOiBgcHJvbXB0cy8ke3Byb3BzLmVudmlyb25tZW50fS9zb3VsX2JsdWVwcmludC9zeXN0ZW0udHh0YCxcbiAgICAgIHRpZXI6IHNzbS5QYXJhbWV0ZXJUaWVyLlNUQU5EQVJELFxuICAgIH0pO1xuXG4gICAgY29uc3QgdXNlclByb21wdFMzS2V5UGFyYW1ldGVyID0gbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgJ1VzZXJQcm9tcHRTM0tleVBhcmFtZXRlcicsIHtcbiAgICAgIHBhcmFtZXRlck5hbWU6IGAvYXVyYTI4LyR7cHJvcHMuZW52aXJvbm1lbnR9L3JlYWRpbmcvdXNlcl9wcm9tcHRfczNrZXlgLFxuICAgICAgZGVzY3JpcHRpb246IGBTMyBrZXkgZm9yIHVzZXIgcHJvbXB0IHRlbXBsYXRlIGluICR7cHJvcHMuZW52aXJvbm1lbnR9IGVudmlyb25tZW50YCxcbiAgICAgIHN0cmluZ1ZhbHVlOiBgcHJvbXB0cy8ke3Byb3BzLmVudmlyb25tZW50fS9zb3VsX2JsdWVwcmludC91c2VyX3RlbXBsYXRlLm1kYCxcbiAgICAgIHRpZXI6IHNzbS5QYXJhbWV0ZXJUaWVyLlNUQU5EQVJELFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIFN3aXNzIEVwaGVtZXJpcyBMYW1iZGEgTGF5ZXJcbiAgICBjb25zdCBzd2lzc0VwaGVtZXJpc0xheWVyID0gbmV3IGxhbWJkYS5MYXllclZlcnNpb24odGhpcywgJ1N3aXNzRXBoZW1lcmlzTGF5ZXInLCB7XG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2xheWVycy9zd2V0ZXN0JyksIHtcbiAgICAgICAgYnVuZGxpbmc6IHtcbiAgICAgICAgICBpbWFnZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1guYnVuZGxpbmdJbWFnZSxcbiAgICAgICAgICB1c2VyOiAncm9vdCcsXG4gICAgICAgICAgY29tbWFuZDogW1xuICAgICAgICAgICAgJ2Jhc2gnLFxuICAgICAgICAgICAgJy1jJyxcbiAgICAgICAgICAgIFtcbiAgICAgICAgICAgICAgLy8gQ29weSBwcmUtYnVpbHQgbGF5ZXIgZGlyZWN0b3J5IGlmIGl0IGV4aXN0c1xuICAgICAgICAgICAgICAnaWYgWyAtZCAvYXNzZXQtaW5wdXQvbGF5ZXIvbm9kZWpzIF07IHRoZW4nLFxuICAgICAgICAgICAgICAnICBjcCAtciAvYXNzZXQtaW5wdXQvbGF5ZXIvbm9kZWpzIC9hc3NldC1vdXRwdXQvJyxcbiAgICAgICAgICAgICAgJ2Vsc2UnLFxuICAgICAgICAgICAgICAnICBlY2hvIFwiRXJyb3I6IFByZS1idWlsdCBsYXllciBkaXJlY3Rvcnkgbm90IGZvdW5kIGF0IC9hc3NldC1pbnB1dC9sYXllci9ub2RlanNcIicsXG4gICAgICAgICAgICAgICcgIGV4aXQgMScsXG4gICAgICAgICAgICAgICdmaScsXG4gICAgICAgICAgICBdLmpvaW4oJyAmJiAnKSxcbiAgICAgICAgICBdLFxuICAgICAgICAgIGxvY2FsOiB7XG4gICAgICAgICAgICAvLyBCdW5kbGUgbG9jYWxseSBieSBjb3B5aW5nIHRoZSBwcmUtYnVpbHQgbGF5ZXIgZGlyZWN0b3J5XG4gICAgICAgICAgICB0cnlCdW5kbGUob3V0cHV0RGlyOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICAgICAgICAgICAgY29uc3QgY2hpbGRfcHJvY2VzcyA9IHJlcXVpcmUoJ2NoaWxkX3Byb2Nlc3MnKTtcbiAgICAgICAgICAgICAgY29uc3QgZnMgPSByZXF1aXJlKCdmcycpO1xuICAgICAgICAgICAgICBjb25zdCBwYXRoID0gcmVxdWlyZSgncGF0aCcpO1xuXG4gICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgc3JjTGF5ZXJEaXIgPSBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vbGF5ZXJzL3N3ZXRlc3QvbGF5ZXInKTtcbiAgICAgICAgICAgICAgICBjb25zdCBzcmNOb2RlanNEaXIgPSBwYXRoLmpvaW4oc3JjTGF5ZXJEaXIsICdub2RlanMnKTtcblxuICAgICAgICAgICAgICAgIC8vIENoZWNrIGlmIHByZS1idWlsdCBsYXllciBleGlzdHNcbiAgICAgICAgICAgICAgICBpZiAoIWZzLmV4aXN0c1N5bmMoc3JjTm9kZWpzRGlyKSkge1xuICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcignUHJlLWJ1aWx0IGxheWVyIGRpcmVjdG9yeSBub3QgZm91bmQgYXQ6Jywgc3JjTm9kZWpzRGlyKTtcbiAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ1BsZWFzZSBydW46IGNkIGluZnJhc3RydWN0dXJlL2xheWVycy9zd2V0ZXN0ICYmIG5wbSBpbnN0YWxsJyk7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gVmFsaWRhdGUgdGhhdCBzd2lzc2VwaCBhbmQgZXBoZW1lcmlzIGZpbGVzIGV4aXN0XG4gICAgICAgICAgICAgICAgY29uc3Qgc3dpc3NlcGhEaXIgPSBwYXRoLmpvaW4oc3JjTm9kZWpzRGlyLCAnbm9kZV9tb2R1bGVzL3N3aXNzZXBoJyk7XG4gICAgICAgICAgICAgICAgY29uc3QgZXBoZURpciA9IHBhdGguam9pbihzd2lzc2VwaERpciwgJ2VwaGUnKTtcblxuICAgICAgICAgICAgICAgIGlmICghZnMuZXhpc3RzU3luYyhzd2lzc2VwaERpcikpIHtcbiAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ3N3aXNzZXBoIG1vZHVsZSBub3QgZm91bmQgaW4gcHJlLWJ1aWx0IGxheWVyJyk7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKCFmcy5leGlzdHNTeW5jKGVwaGVEaXIpKSB7XG4gICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKCdlcGhlbWVyaXMgZGF0YSBkaXJlY3Rvcnkgbm90IGZvdW5kIGluIHByZS1idWlsdCBsYXllcicpO1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIENoZWNrIGZvciBlc3NlbnRpYWwgZXBoZW1lcmlzIGZpbGVzXG4gICAgICAgICAgICAgICAgY29uc3QgZXNzZW50aWFsRmlsZXMgPSBbXG4gICAgICAgICAgICAgICAgICAnc2Vtb18xOC5zZTEnLFxuICAgICAgICAgICAgICAgICAgJ3NlcGxfMTguc2UxJyxcbiAgICAgICAgICAgICAgICAgICdzZWFzXzE4LnNlMScsXG4gICAgICAgICAgICAgICAgICAnc2VsZWFwc2VjLnR4dCcsXG4gICAgICAgICAgICAgICAgICAnc2VvcmJlbC50eHQnLFxuICAgICAgICAgICAgICAgIF07XG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBmaWxlIG9mIGVzc2VudGlhbEZpbGVzKSB7XG4gICAgICAgICAgICAgICAgICBpZiAoIWZzLmV4aXN0c1N5bmMocGF0aC5qb2luKGVwaGVEaXIsIGZpbGUpKSkge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBFc3NlbnRpYWwgZXBoZW1lcmlzIGZpbGUgbWlzc2luZzogJHtmaWxlfWApO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gQ29weSB0aGUgZW50aXJlIHByZS1idWlsdCBsYXllciB0byBvdXRwdXRcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnQ29weWluZyBwcmUtYnVpbHQgU3dpc3MgRXBoZW1lcmlzIGxheWVyLi4uJyk7XG4gICAgICAgICAgICAgICAgY2hpbGRfcHJvY2Vzcy5leGVjU3luYyhgY3AgLXIgXCIke3NyY05vZGVqc0Rpcn1cIiBcIiR7b3V0cHV0RGlyfS9cImAsIHtcbiAgICAgICAgICAgICAgICAgIHN0ZGlvOiAnaW5oZXJpdCcsXG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAvLyBMb2cgc3VjY2VzcyBhbmQgbGF5ZXIgc2l6ZVxuICAgICAgICAgICAgICAgIGNvbnN0IGxheWVyU2l6ZSA9IGNoaWxkX3Byb2Nlc3NcbiAgICAgICAgICAgICAgICAgIC5leGVjU3luYyhgZHUgLXNoIFwiJHtvdXRwdXREaXJ9L25vZGVqc1wiYCwgeyBlbmNvZGluZzogJ3V0ZjgnIH0pXG4gICAgICAgICAgICAgICAgICAudHJpbSgpO1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBTdWNjZXNzZnVsbHkgYnVuZGxlZCBTd2lzcyBFcGhlbWVyaXMgbGF5ZXI6ICR7bGF5ZXJTaXplfWApO1xuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGJ1bmRsZSBTd2lzcyBFcGhlbWVyaXMgbGF5ZXI6JywgZXJyb3IpO1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgICBjb21wYXRpYmxlUnVudGltZXM6IFtsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWF0sXG4gICAgICBkZXNjcmlwdGlvbjogJ1N3aXNzIEVwaGVtZXJpcyBsaWJyYXJ5IHYyIHdpdGggaG91c2UgY2FsY3VsYXRpb25zIGFuZCBlcGhlbWVyaXMgZGF0YScsXG4gICAgICBsYXllclZlcnNpb25OYW1lOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LXN3aXNzZXBoLXYyYCxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBMYW1iZGEgZnVuY3Rpb25zXG4gICAgdGhpcy5nZXRVc2VyUHJvZmlsZUZ1bmN0aW9uID0gbmV3IGxhbWJkYU5vZGVKcy5Ob2RlanNGdW5jdGlvbih0aGlzLCAnR2V0VXNlclByb2ZpbGVGdW5jdGlvbicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogYGF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS1nZXQtdXNlci1wcm9maWxlYCxcbiAgICAgIGVudHJ5OiBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vbGFtYmRhL3VzZXItcHJvZmlsZS9nZXQtdXNlci1wcm9maWxlLnRzJyksXG4gICAgICBoYW5kbGVyOiAnaGFuZGxlcicsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFRBQkxFX05BTUU6IHByb3BzLnVzZXJUYWJsZS50YWJsZU5hbWUsXG4gICAgICB9LFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgbWVtb3J5U2l6ZTogMjU2LFxuICAgICAgYnVuZGxpbmc6IHtcbiAgICAgICAgZXh0ZXJuYWxNb2R1bGVzOiBbJ0Bhd3Mtc2RrLyonXSxcbiAgICAgICAgZm9yY2VEb2NrZXJCdW5kbGluZzogZmFsc2UsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIGdlbmVyYXRlTmF0YWxDaGFydEZ1bmN0aW9uIGZpcnN0LCBiZWZvcmUgdXBkYXRlVXNlclByb2ZpbGVGdW5jdGlvbiB0aGF0IHJlZmVyZW5jZXMgaXRcbiAgICB0aGlzLmdlbmVyYXRlTmF0YWxDaGFydEZ1bmN0aW9uID0gbmV3IGxhbWJkYU5vZGVKcy5Ob2RlanNGdW5jdGlvbihcbiAgICAgIHRoaXMsXG4gICAgICAnR2VuZXJhdGVOYXRhbENoYXJ0RnVuY3Rpb24nLFxuICAgICAge1xuICAgICAgICBmdW5jdGlvbk5hbWU6IGBhdXJhMjgtJHtwcm9wcy5lbnZpcm9ubWVudH0tZ2VuZXJhdGUtbmF0YWwtY2hhcnRgLFxuICAgICAgICBlbnRyeTogcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2xhbWJkYS9uYXRhbC1jaGFydC9nZW5lcmF0ZS1uYXRhbC1jaGFydC50cycpLFxuICAgICAgICBoYW5kbGVyOiAnaGFuZGxlcicsXG4gICAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxuICAgICAgICBsYXllcnM6IFtzd2lzc0VwaGVtZXJpc0xheWVyXSxcbiAgICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICBOQVRBTF9DSEFSVF9UQUJMRV9OQU1FOiBwcm9wcy5uYXRhbENoYXJ0VGFibGUudGFibGVOYW1lLFxuICAgICAgICAgIEVQSEVNRVJJU19QQVRIOiAnL29wdC9ub2RlanMvbm9kZV9tb2R1bGVzL3N3aXNzZXBoL2VwaGUnLFxuICAgICAgICAgIFNFX0VQSEVfUEFUSDogJy9vcHQvbm9kZWpzL25vZGVfbW9kdWxlcy9zd2lzc2VwaC9lcGhlJyxcbiAgICAgICAgfSxcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMTApLCAvLyAxMCBzZWNvbmRzIGZvciBob3VzZSBjYWxjdWxhdGlvbnNcbiAgICAgICAgbWVtb3J5U2l6ZTogNTEyLCAvLyBJbmNyZWFzZWQgbWVtb3J5IGZvciBlcGhlbWVyaXMgY2FsY3VsYXRpb25zXG4gICAgICAgIGJ1bmRsaW5nOiB7XG4gICAgICAgICAgZXh0ZXJuYWxNb2R1bGVzOiBbJ0Bhd3Mtc2RrLyonLCAnc3dpc3NlcGgnXSwgLy8gRXhjbHVkZSBzd2lzc2VwaCBzaW5jZSBpdCdzIGluIHRoZSBsYXllclxuICAgICAgICAgIGZvcmNlRG9ja2VyQnVuZGxpbmc6IGZhbHNlLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgdGhpcy51cGRhdGVVc2VyUHJvZmlsZUZ1bmN0aW9uID0gbmV3IGxhbWJkYU5vZGVKcy5Ob2RlanNGdW5jdGlvbihcbiAgICAgIHRoaXMsXG4gICAgICAnVXBkYXRlVXNlclByb2ZpbGVGdW5jdGlvbicsXG4gICAgICB7XG4gICAgICAgIGZ1bmN0aW9uTmFtZTogYGF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS11cGRhdGUtdXNlci1wcm9maWxlYCxcbiAgICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9sYW1iZGEvdXNlci1wcm9maWxlL3VwZGF0ZS11c2VyLXByb2ZpbGUudHMnKSxcbiAgICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxuICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcbiAgICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICBUQUJMRV9OQU1FOiBwcm9wcy51c2VyVGFibGUudGFibGVOYW1lLFxuICAgICAgICAgIFBMQUNFX0lOREVYX05BTUU6IHByb3BzLnBsYWNlSW5kZXhOYW1lLFxuICAgICAgICAgIEdFTkVSQVRFX05BVEFMX0NIQVJUX0ZVTkNUSU9OX05BTUU6IHRoaXMuZ2VuZXJhdGVOYXRhbENoYXJ0RnVuY3Rpb24uZnVuY3Rpb25OYW1lLFxuICAgICAgICB9LFxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICAgIG1lbW9yeVNpemU6IDI1NixcbiAgICAgICAgYnVuZGxpbmc6IHtcbiAgICAgICAgICBleHRlcm5hbE1vZHVsZXM6IFsnQGF3cy1zZGsvKiddLFxuICAgICAgICAgIGZvcmNlRG9ja2VyQnVuZGxpbmc6IGZhbHNlLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gR3JhbnQgRHluYW1vREIgcGVybWlzc2lvbnNcbiAgICBwcm9wcy51c2VyVGFibGUuZ3JhbnRSZWFkRGF0YSh0aGlzLmdldFVzZXJQcm9maWxlRnVuY3Rpb24pO1xuICAgIHByb3BzLnVzZXJUYWJsZS5ncmFudFdyaXRlRGF0YSh0aGlzLnVwZGF0ZVVzZXJQcm9maWxlRnVuY3Rpb24pO1xuICAgIHByb3BzLm5hdGFsQ2hhcnRUYWJsZS5ncmFudFdyaXRlRGF0YSh0aGlzLmdlbmVyYXRlTmF0YWxDaGFydEZ1bmN0aW9uKTtcblxuICAgIHRoaXMuZ2V0TmF0YWxDaGFydEZ1bmN0aW9uID0gbmV3IGxhbWJkYU5vZGVKcy5Ob2RlanNGdW5jdGlvbih0aGlzLCAnR2V0TmF0YWxDaGFydEZ1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LWdldC1uYXRhbC1jaGFydGAsXG4gICAgICBlbnRyeTogcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2xhbWJkYS9uYXRhbC1jaGFydC9nZXQtbmF0YWwtY2hhcnQudHMnKSxcbiAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgTkFUQUxfQ0hBUlRfVEFCTEVfTkFNRTogcHJvcHMubmF0YWxDaGFydFRhYmxlLnRhYmxlTmFtZSxcbiAgICAgIH0sXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICBtZW1vcnlTaXplOiAyNTYsXG4gICAgICBidW5kbGluZzoge1xuICAgICAgICBleHRlcm5hbE1vZHVsZXM6IFsnQGF3cy1zZGsvKiddLFxuICAgICAgICBmb3JjZURvY2tlckJ1bmRsaW5nOiBmYWxzZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBwcm9wcy5uYXRhbENoYXJ0VGFibGUuZ3JhbnRSZWFkRGF0YSh0aGlzLmdldE5hdGFsQ2hhcnRGdW5jdGlvbik7XG5cbiAgICAvLyBHcmFudCBpbnZvY2F0aW9uIHBlcm1pc3Npb25cbiAgICB0aGlzLmdlbmVyYXRlTmF0YWxDaGFydEZ1bmN0aW9uLmdyYW50SW52b2tlKHRoaXMudXBkYXRlVXNlclByb2ZpbGVGdW5jdGlvbik7XG5cbiAgICAvLyBDcmVhdGUgTGFtYmRhIGZ1bmN0aW9ucyBmb3IgcmVhZGluZ3NcbiAgICB0aGlzLmdlbmVyYXRlUmVhZGluZ0Z1bmN0aW9uID0gbmV3IGxhbWJkYU5vZGVKcy5Ob2RlanNGdW5jdGlvbihcbiAgICAgIHRoaXMsXG4gICAgICAnR2VuZXJhdGVSZWFkaW5nRnVuY3Rpb24nLFxuICAgICAge1xuICAgICAgICBmdW5jdGlvbk5hbWU6IGBhdXJhMjgtJHtwcm9wcy5lbnZpcm9ubWVudH0tZ2VuZXJhdGUtcmVhZGluZ2AsXG4gICAgICAgIGVudHJ5OiBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vbGFtYmRhL3JlYWRpbmdzL2dlbmVyYXRlLXJlYWRpbmcudHMnKSxcbiAgICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxuICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcbiAgICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICBSRUFESU5HU19UQUJMRV9OQU1FOiBwcm9wcy5yZWFkaW5nc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgICBOQVRBTF9DSEFSVF9UQUJMRV9OQU1FOiBwcm9wcy5uYXRhbENoYXJ0VGFibGUudGFibGVOYW1lLFxuICAgICAgICAgIFVTRVJfVEFCTEVfTkFNRTogcHJvcHMudXNlclRhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgICBDT05GSUdfQlVDS0VUX05BTUU6IGNvbmZpZ0J1Y2tldC5idWNrZXROYW1lLFxuICAgICAgICAgIE9QRU5BSV9BUElfS0VZX1BBUkFNRVRFUl9OQU1FOiBvcGVuQWlBcGlLZXlQYXJhbWV0ZXIucGFyYW1ldGVyTmFtZSxcbiAgICAgICAgICBSRUFESU5HX01PREVMX1BBUkFNRVRFUl9OQU1FOiByZWFkaW5nTW9kZWxQYXJhbWV0ZXIucGFyYW1ldGVyTmFtZSxcbiAgICAgICAgICBSRUFESU5HX1RFTVBFUkFUVVJFX1BBUkFNRVRFUl9OQU1FOiByZWFkaW5nVGVtcGVyYXR1cmVQYXJhbWV0ZXIucGFyYW1ldGVyTmFtZSxcbiAgICAgICAgICBSRUFESU5HX01BWF9UT0tFTlNfUEFSQU1FVEVSX05BTUU6IHJlYWRpbmdNYXhUb2tlbnNQYXJhbWV0ZXIucGFyYW1ldGVyTmFtZSxcbiAgICAgICAgICBTWVNURU1fUFJPTVBUX1MzS0VZX1BBUkFNRVRFUl9OQU1FOiBzeXN0ZW1Qcm9tcHRTM0tleVBhcmFtZXRlci5wYXJhbWV0ZXJOYW1lLFxuICAgICAgICAgIFVTRVJfUFJPTVBUX1MzS0VZX1BBUkFNRVRFUl9OQU1FOiB1c2VyUHJvbXB0UzNLZXlQYXJhbWV0ZXIucGFyYW1ldGVyTmFtZSxcbiAgICAgICAgfSxcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMTIwKSwgLy8gRXh0ZW5kZWQgdGltZW91dCBmb3IgT3BlbkFJIEFQSSBjYWxsc1xuICAgICAgICBtZW1vcnlTaXplOiA1MTIsXG4gICAgICAgIGJ1bmRsaW5nOiB7XG4gICAgICAgICAgZXh0ZXJuYWxNb2R1bGVzOiBbJ0Bhd3Mtc2RrLyonXSxcbiAgICAgICAgICBmb3JjZURvY2tlckJ1bmRsaW5nOiBmYWxzZSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIHRoaXMuZ2V0UmVhZGluZ3NGdW5jdGlvbiA9IG5ldyBsYW1iZGFOb2RlSnMuTm9kZWpzRnVuY3Rpb24odGhpcywgJ0dldFJlYWRpbmdzRnVuY3Rpb24nLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6IGBhdXJhMjgtJHtwcm9wcy5lbnZpcm9ubWVudH0tZ2V0LXJlYWRpbmdzYCxcbiAgICAgIGVudHJ5OiBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vbGFtYmRhL3JlYWRpbmdzL2dldC1yZWFkaW5ncy50cycpLFxuICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBSRUFESU5HU19UQUJMRV9OQU1FOiBwcm9wcy5yZWFkaW5nc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgIH0sXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICBtZW1vcnlTaXplOiAyNTYsXG4gICAgICBidW5kbGluZzoge1xuICAgICAgICBleHRlcm5hbE1vZHVsZXM6IFsnQGF3cy1zZGsvKiddLFxuICAgICAgICBmb3JjZURvY2tlckJ1bmRsaW5nOiBmYWxzZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICB0aGlzLmdldFJlYWRpbmdEZXRhaWxGdW5jdGlvbiA9IG5ldyBsYW1iZGFOb2RlSnMuTm9kZWpzRnVuY3Rpb24oXG4gICAgICB0aGlzLFxuICAgICAgJ0dldFJlYWRpbmdEZXRhaWxGdW5jdGlvbicsXG4gICAgICB7XG4gICAgICAgIGZ1bmN0aW9uTmFtZTogYGF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS1nZXQtcmVhZGluZy1kZXRhaWxgLFxuICAgICAgICBlbnRyeTogcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2xhbWJkYS9yZWFkaW5ncy9nZXQtcmVhZGluZy1kZXRhaWwudHMnKSxcbiAgICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxuICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcbiAgICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICBSRUFESU5HU19UQUJMRV9OQU1FOiBwcm9wcy5yZWFkaW5nc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgfSxcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgICBtZW1vcnlTaXplOiAyNTYsXG4gICAgICAgIGJ1bmRsaW5nOiB7XG4gICAgICAgICAgZXh0ZXJuYWxNb2R1bGVzOiBbJ0Bhd3Mtc2RrLyonXSxcbiAgICAgICAgICBmb3JjZURvY2tlckJ1bmRsaW5nOiBmYWxzZSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIEdyYW50IER5bmFtb0RCIHBlcm1pc3Npb25zIGZvciByZWFkaW5nc1xuICAgIHByb3BzLnJlYWRpbmdzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHRoaXMuZ2VuZXJhdGVSZWFkaW5nRnVuY3Rpb24pO1xuICAgIHByb3BzLnJlYWRpbmdzVGFibGUuZ3JhbnRSZWFkRGF0YSh0aGlzLmdldFJlYWRpbmdzRnVuY3Rpb24pO1xuICAgIHByb3BzLnJlYWRpbmdzVGFibGUuZ3JhbnRSZWFkRGF0YSh0aGlzLmdldFJlYWRpbmdEZXRhaWxGdW5jdGlvbik7XG4gICAgcHJvcHMubmF0YWxDaGFydFRhYmxlLmdyYW50UmVhZERhdGEodGhpcy5nZW5lcmF0ZVJlYWRpbmdGdW5jdGlvbik7XG4gICAgcHJvcHMudXNlclRhYmxlLmdyYW50UmVhZERhdGEodGhpcy5nZW5lcmF0ZVJlYWRpbmdGdW5jdGlvbik7XG5cbiAgICAvLyBHcmFudCBwZXJtaXNzaW9ucyB0byBnZW5lcmF0ZSByZWFkaW5nIGZ1bmN0aW9uXG4gICAgLy8gU1NNIHBhcmFtZXRlciByZWFkIHBlcm1pc3Npb25zXG4gICAgb3BlbkFpQXBpS2V5UGFyYW1ldGVyLmdyYW50UmVhZCh0aGlzLmdlbmVyYXRlUmVhZGluZ0Z1bmN0aW9uKTtcbiAgICByZWFkaW5nTW9kZWxQYXJhbWV0ZXIuZ3JhbnRSZWFkKHRoaXMuZ2VuZXJhdGVSZWFkaW5nRnVuY3Rpb24pO1xuICAgIHJlYWRpbmdUZW1wZXJhdHVyZVBhcmFtZXRlci5ncmFudFJlYWQodGhpcy5nZW5lcmF0ZVJlYWRpbmdGdW5jdGlvbik7XG4gICAgcmVhZGluZ01heFRva2Vuc1BhcmFtZXRlci5ncmFudFJlYWQodGhpcy5nZW5lcmF0ZVJlYWRpbmdGdW5jdGlvbik7XG4gICAgc3lzdGVtUHJvbXB0UzNLZXlQYXJhbWV0ZXIuZ3JhbnRSZWFkKHRoaXMuZ2VuZXJhdGVSZWFkaW5nRnVuY3Rpb24pO1xuICAgIHVzZXJQcm9tcHRTM0tleVBhcmFtZXRlci5ncmFudFJlYWQodGhpcy5nZW5lcmF0ZVJlYWRpbmdGdW5jdGlvbik7XG5cbiAgICAvLyBTMyBidWNrZXQgcmVhZCBwZXJtaXNzaW9ucyBmb3IgY29uZmlndXJhdGlvbiBmaWxlc1xuICAgIGNvbmZpZ0J1Y2tldC5ncmFudFJlYWQodGhpcy5nZW5lcmF0ZVJlYWRpbmdGdW5jdGlvbik7XG5cbiAgICAvLyBDcmVhdGUgQWRtaW4gTGFtYmRhIGZ1bmN0aW9uc1xuICAgIHRoaXMuYWRtaW5HZXRBbGxSZWFkaW5nc0Z1bmN0aW9uID0gbmV3IGxhbWJkYU5vZGVKcy5Ob2RlanNGdW5jdGlvbihcbiAgICAgIHRoaXMsXG4gICAgICAnQWRtaW5HZXRBbGxSZWFkaW5nc0Z1bmN0aW9uJyxcbiAgICAgIHtcbiAgICAgICAgZnVuY3Rpb25OYW1lOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LWFkbWluLWdldC1hbGwtcmVhZGluZ3NgLFxuICAgICAgICBlbnRyeTogcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2xhbWJkYS9hZG1pbi9nZXQtYWxsLXJlYWRpbmdzLnRzJyksXG4gICAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcbiAgICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgICAgUkVBRElOR1NfVEFCTEVfTkFNRTogcHJvcHMucmVhZGluZ3NUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgICAgVVNFUl9UQUJMRV9OQU1FOiBwcm9wcy51c2VyVGFibGUudGFibGVOYW1lLFxuICAgICAgICB9LFxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICAgIG1lbW9yeVNpemU6IDUxMixcbiAgICAgICAgYnVuZGxpbmc6IHtcbiAgICAgICAgICBleHRlcm5hbE1vZHVsZXM6IFsnQGF3cy1zZGsvKiddLFxuICAgICAgICAgIGZvcmNlRG9ja2VyQnVuZGxpbmc6IGZhbHNlLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgdGhpcy5hZG1pbkdldEFsbFVzZXJzRnVuY3Rpb24gPSBuZXcgbGFtYmRhTm9kZUpzLk5vZGVqc0Z1bmN0aW9uKFxuICAgICAgdGhpcyxcbiAgICAgICdBZG1pbkdldEFsbFVzZXJzRnVuY3Rpb24nLFxuICAgICAge1xuICAgICAgICBmdW5jdGlvbk5hbWU6IGBhdXJhMjgtJHtwcm9wcy5lbnZpcm9ubWVudH0tYWRtaW4tZ2V0LWFsbC11c2Vyc2AsXG4gICAgICAgIGVudHJ5OiBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vbGFtYmRhL2FkbWluL2dldC1hbGwtdXNlcnMudHMnKSxcbiAgICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxuICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcbiAgICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICBVU0VSX1BPT0xfSUQ6IHByb3BzLnVzZXJQb29sLnVzZXJQb29sSWQsXG4gICAgICAgIH0sXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgICAgbWVtb3J5U2l6ZTogMjU2LFxuICAgICAgICBidW5kbGluZzoge1xuICAgICAgICAgIGV4dGVybmFsTW9kdWxlczogWydAYXdzLXNkay8qJ10sXG4gICAgICAgICAgZm9yY2VEb2NrZXJCdW5kbGluZzogZmFsc2UsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBHcmFudCBEeW5hbW9EQiBwZXJtaXNzaW9ucyBmb3IgYWRtaW4gZnVuY3Rpb25zXG4gICAgcHJvcHMucmVhZGluZ3NUYWJsZS5ncmFudFJlYWREYXRhKHRoaXMuYWRtaW5HZXRBbGxSZWFkaW5nc0Z1bmN0aW9uKTtcbiAgICBwcm9wcy51c2VyVGFibGUuZ3JhbnRSZWFkRGF0YSh0aGlzLmFkbWluR2V0QWxsUmVhZGluZ3NGdW5jdGlvbik7XG5cbiAgICAvLyBHcmFudCBDb2duaXRvIHBlcm1pc3Npb25zIGZvciBhZG1pbiB1c2VyIGxpc3RpbmdcbiAgICB0aGlzLmFkbWluR2V0QWxsVXNlcnNGdW5jdGlvbi5hZGRUb1JvbGVQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGFjdGlvbnM6IFsnY29nbml0by1pZHA6TGlzdFVzZXJzJ10sXG4gICAgICAgIHJlc291cmNlczogW3Byb3BzLnVzZXJQb29sLnVzZXJQb29sQXJuXSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICAvLyBHcmFudCBMb2NhdGlvbiBTZXJ2aWNlIHBlcm1pc3Npb25zXG4gICAgdGhpcy51cGRhdGVVc2VyUHJvZmlsZUZ1bmN0aW9uLmFkZFRvUm9sZVBvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgYWN0aW9uczogWydnZW86U2VhcmNoUGxhY2VJbmRleEZvclRleHQnXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgYGFybjphd3M6Z2VvOiR7Y2RrLlN0YWNrLm9mKHRoaXMpLnJlZ2lvbn06JHtjZGsuU3RhY2sub2YodGhpcykuYWNjb3VudH06cGxhY2UtaW5kZXgvJHtcbiAgICAgICAgICAgIHByb3BzLnBsYWNlSW5kZXhOYW1lXG4gICAgICAgICAgfWAsXG4gICAgICAgIF0sXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgLy8gQ3JlYXRlIEFQSSBHYXRld2F5XG4gICAgdGhpcy5hcGkgPSBuZXcgYXBpZ2F0ZXdheS5SZXN0QXBpKHRoaXMsICdVc2VyQXBpJywge1xuICAgICAgcmVzdEFwaU5hbWU6IGBhdXJhMjgtJHtwcm9wcy5lbnZpcm9ubWVudH0tdXNlci1hcGlgLFxuICAgICAgZGVzY3JpcHRpb246ICdBUEkgZm9yIHVzZXIgcHJvZmlsZSBtYW5hZ2VtZW50JyxcbiAgICAgIGRlcGxveU9wdGlvbnM6IHtcbiAgICAgICAgc3RhZ2VOYW1lOiBwcm9wcy5lbnZpcm9ubWVudCxcbiAgICAgICAgdHJhY2luZ0VuYWJsZWQ6IHRydWUsXG4gICAgICAgIGRhdGFUcmFjZUVuYWJsZWQ6IHRydWUsXG4gICAgICAgIGxvZ2dpbmdMZXZlbDogYXBpZ2F0ZXdheS5NZXRob2RMb2dnaW5nTGV2ZWwuSU5GTyxcbiAgICAgICAgbWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICB9LFxuICAgICAgZGVmYXVsdENvcnNQcmVmbGlnaHRPcHRpb25zOiB7XG4gICAgICAgIGFsbG93T3JpZ2luczogcHJvcHMuYWxsb3dlZE9yaWdpbnMsXG4gICAgICAgIGFsbG93TWV0aG9kczogWydHRVQnLCAnUFVUJywgJ1BPU1QnLCAnT1BUSU9OUyddLFxuICAgICAgICBhbGxvd0hlYWRlcnM6IFtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJyxcbiAgICAgICAgICAnWC1BbXotRGF0ZScsXG4gICAgICAgICAgJ0F1dGhvcml6YXRpb24nLFxuICAgICAgICAgICdYLUFwaS1LZXknLFxuICAgICAgICAgICdYLUFtei1TZWN1cml0eS1Ub2tlbicsXG4gICAgICAgIF0sXG4gICAgICAgIGFsbG93Q3JlZGVudGlhbHM6IHRydWUsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIENvZ25pdG8gYXV0aG9yaXplclxuICAgIGNvbnN0IGF1dGhvcml6ZXIgPSBuZXcgYXBpZ2F0ZXdheS5Db2duaXRvVXNlclBvb2xzQXV0aG9yaXplcih0aGlzLCAnVXNlclBvb2xBdXRob3JpemVyJywge1xuICAgICAgY29nbml0b1VzZXJQb29sczogW3Byb3BzLnVzZXJQb29sXSxcbiAgICAgIGF1dGhvcml6ZXJOYW1lOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LWF1dGhvcml6ZXJgLFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIC9hcGkvdXNlcnMve3VzZXJJZH0vcHJvZmlsZSByZXNvdXJjZVxuICAgIGNvbnN0IGFwaVJlc291cmNlID0gdGhpcy5hcGkucm9vdC5hZGRSZXNvdXJjZSgnYXBpJyk7XG4gICAgY29uc3QgdXNlcnNSZXNvdXJjZSA9IGFwaVJlc291cmNlLmFkZFJlc291cmNlKCd1c2VycycpO1xuICAgIGNvbnN0IHVzZXJJZFJlc291cmNlID0gdXNlcnNSZXNvdXJjZS5hZGRSZXNvdXJjZSgne3VzZXJJZH0nKTtcbiAgICBjb25zdCBwcm9maWxlUmVzb3VyY2UgPSB1c2VySWRSZXNvdXJjZS5hZGRSZXNvdXJjZSgncHJvZmlsZScpO1xuXG4gICAgLy8gQWRkIEdFVCBtZXRob2RcbiAgICBwcm9maWxlUmVzb3VyY2UuYWRkTWV0aG9kKFxuICAgICAgJ0dFVCcsXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbih0aGlzLmdldFVzZXJQcm9maWxlRnVuY3Rpb24pLFxuICAgICAge1xuICAgICAgICBhdXRob3JpemVyLFxuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gQWRkIC9hcGkvdXNlcnMve3VzZXJJZH0vbmF0YWwtY2hhcnQgcmVzb3VyY2VcbiAgICBjb25zdCBuYXRhbENoYXJ0UmVzb3VyY2UgPSB1c2VySWRSZXNvdXJjZS5hZGRSZXNvdXJjZSgnbmF0YWwtY2hhcnQnKTtcbiAgICBuYXRhbENoYXJ0UmVzb3VyY2UuYWRkTWV0aG9kKFxuICAgICAgJ0dFVCcsXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbih0aGlzLmdldE5hdGFsQ2hhcnRGdW5jdGlvbiksXG4gICAgICB7XG4gICAgICAgIGF1dGhvcml6ZXIsXG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBBZGQgUFVUIG1ldGhvZFxuICAgIHByb2ZpbGVSZXNvdXJjZS5hZGRNZXRob2QoXG4gICAgICAnUFVUJyxcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHRoaXMudXBkYXRlVXNlclByb2ZpbGVGdW5jdGlvbiksXG4gICAgICB7XG4gICAgICAgIGF1dGhvcml6ZXIsXG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBBZGQgL2FwaS91c2Vycy97dXNlcklkfS9yZWFkaW5ncyByZXNvdXJjZVxuICAgIGNvbnN0IHJlYWRpbmdzUmVzb3VyY2UgPSB1c2VySWRSZXNvdXJjZS5hZGRSZXNvdXJjZSgncmVhZGluZ3MnKTtcblxuICAgIC8vIEdFVCAvYXBpL3VzZXJzL3t1c2VySWR9L3JlYWRpbmdzIC0gTGlzdCB1c2VyJ3MgcmVhZGluZ3NcbiAgICByZWFkaW5nc1Jlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24odGhpcy5nZXRSZWFkaW5nc0Z1bmN0aW9uKSwge1xuICAgICAgYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG5cbiAgICAvLyBQT1NUIC9hcGkvdXNlcnMve3VzZXJJZH0vcmVhZGluZ3MgLSBHZW5lcmF0ZSBhIG5ldyByZWFkaW5nXG4gICAgcmVhZGluZ3NSZXNvdXJjZS5hZGRNZXRob2QoXG4gICAgICAnUE9TVCcsXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbih0aGlzLmdlbmVyYXRlUmVhZGluZ0Z1bmN0aW9uKSxcbiAgICAgIHtcbiAgICAgICAgYXV0aG9yaXplcixcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIEFkZCAvYXBpL3VzZXJzL3t1c2VySWR9L3JlYWRpbmdzL3tyZWFkaW5nSWR9IHJlc291cmNlXG4gICAgY29uc3QgcmVhZGluZ0lkUmVzb3VyY2UgPSByZWFkaW5nc1Jlc291cmNlLmFkZFJlc291cmNlKCd7cmVhZGluZ0lkfScpO1xuXG4gICAgLy8gR0VUIC9hcGkvdXNlcnMve3VzZXJJZH0vcmVhZGluZ3Mve3JlYWRpbmdJZH0gLSBHZXQgcmVhZGluZyBkZXRhaWxcbiAgICByZWFkaW5nSWRSZXNvdXJjZS5hZGRNZXRob2QoXG4gICAgICAnR0VUJyxcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHRoaXMuZ2V0UmVhZGluZ0RldGFpbEZ1bmN0aW9uKSxcbiAgICAgIHtcbiAgICAgICAgYXV0aG9yaXplcixcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIENyZWF0ZSAvYXBpL2FkbWluIHJlc291cmNlc1xuICAgIGNvbnN0IGFkbWluUmVzb3VyY2UgPSBhcGlSZXNvdXJjZS5hZGRSZXNvdXJjZSgnYWRtaW4nKTtcblxuICAgIC8vIEdFVCAvYXBpL2FkbWluL3JlYWRpbmdzIC0gR2V0IGFsbCByZWFkaW5ncyAoYWRtaW4gb25seSlcbiAgICBjb25zdCBhZG1pblJlYWRpbmdzUmVzb3VyY2UgPSBhZG1pblJlc291cmNlLmFkZFJlc291cmNlKCdyZWFkaW5ncycpO1xuICAgIGFkbWluUmVhZGluZ3NSZXNvdXJjZS5hZGRNZXRob2QoXG4gICAgICAnR0VUJyxcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHRoaXMuYWRtaW5HZXRBbGxSZWFkaW5nc0Z1bmN0aW9uKSxcbiAgICAgIHtcbiAgICAgICAgYXV0aG9yaXplcixcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIEdFVCAvYXBpL2FkbWluL3VzZXJzIC0gR2V0IGFsbCB1c2VycyAoYWRtaW4gb25seSlcbiAgICBjb25zdCBhZG1pblVzZXJzUmVzb3VyY2UgPSBhZG1pblJlc291cmNlLmFkZFJlc291cmNlKCd1c2VycycpO1xuICAgIGFkbWluVXNlcnNSZXNvdXJjZS5hZGRNZXRob2QoXG4gICAgICAnR0VUJyxcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHRoaXMuYWRtaW5HZXRBbGxVc2Vyc0Z1bmN0aW9uKSxcbiAgICAgIHtcbiAgICAgICAgYXV0aG9yaXplcixcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIE91dHB1dCBBUEkgVVJMXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FwaVVybCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmFwaS51cmwsXG4gICAgICBkZXNjcmlwdGlvbjogJ0FQSSBHYXRld2F5IFVSTCcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQXBpRW5kcG9pbnQnLCB7XG4gICAgICB2YWx1ZTogYCR7dGhpcy5hcGkudXJsfWFwaS91c2Vycy97dXNlcklkfS9wcm9maWxlYCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnVXNlciBQcm9maWxlIEFQSSBFbmRwb2ludCcsXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==