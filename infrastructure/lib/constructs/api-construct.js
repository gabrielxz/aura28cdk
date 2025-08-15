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
    adminGetReadingDetailsFunction;
    adminUpdateReadingStatusFunction;
    adminDeleteReadingFunction;
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
        // Build the layer without Docker
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
                            '  cp -r /asset-input/layer/nodejs /asset-output/;',
                            'else',
                            '  echo "Error: Pre-built layer directory not found at /asset-input/layer/nodejs";',
                            '  exit 1;',
                            'fi',
                        ].join(' '),
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
                                    // eslint-disable-next-line no-console
                                    console.error('Pre-built layer directory not found at:', srcNodejsDir);
                                    // eslint-disable-next-line no-console
                                    console.error('Please run: cd infrastructure/layers/swetest && npm install');
                                    return false;
                                }
                                // Validate that swisseph and ephemeris files exist
                                const swissephDir = path.join(srcNodejsDir, 'node_modules/swisseph');
                                const epheDir = path.join(swissephDir, 'ephe');
                                if (!fs.existsSync(swissephDir)) {
                                    // eslint-disable-next-line no-console
                                    console.error('swisseph module not found in pre-built layer');
                                    return false;
                                }
                                if (!fs.existsSync(epheDir)) {
                                    // eslint-disable-next-line no-console
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
                                        // eslint-disable-next-line no-console
                                        console.error(`Essential ephemeris file missing: ${file}`);
                                        return false;
                                    }
                                }
                                // Copy the entire pre-built layer to output
                                // eslint-disable-next-line no-console
                                console.log('Copying pre-built Swiss Ephemeris layer...');
                                child_process.execSync(`cp -r "${srcNodejsDir}" "${outputDir}/"`, {
                                    stdio: 'inherit',
                                });
                                // Log success and layer size
                                const layerSize = child_process
                                    .execSync(`du -sh "${outputDir}/nodejs"`, { encoding: 'utf8' })
                                    .trim();
                                // eslint-disable-next-line no-console
                                console.log(`Successfully bundled Swiss Ephemeris layer: ${layerSize}`);
                                return true;
                            }
                            catch (error) {
                                // eslint-disable-next-line no-console
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
        // Create additional admin Lambda functions
        this.adminGetReadingDetailsFunction = new lambdaNodeJs.NodejsFunction(this, 'AdminGetReadingDetailsFunction', {
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
        });
        this.adminUpdateReadingStatusFunction = new lambdaNodeJs.NodejsFunction(this, 'AdminUpdateReadingStatusFunction', {
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
        });
        this.adminDeleteReadingFunction = new lambdaNodeJs.NodejsFunction(this, 'AdminDeleteReadingFunction', {
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
        });
        // Grant DynamoDB permissions for admin functions
        props.readingsTable.grantReadData(this.adminGetAllReadingsFunction);
        props.userTable.grantReadData(this.adminGetAllReadingsFunction);
        props.readingsTable.grantReadData(this.adminGetReadingDetailsFunction);
        props.userTable.grantReadData(this.adminGetReadingDetailsFunction);
        props.readingsTable.grantReadWriteData(this.adminUpdateReadingStatusFunction);
        props.readingsTable.grantReadWriteData(this.adminDeleteReadingFunction);
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
        // /api/admin/readings/{userId}/{readingId} resource
        const adminUserIdResource = adminReadingsResource.addResource('{userId}');
        const adminReadingIdResource = adminUserIdResource.addResource('{readingId}');
        // GET /api/admin/readings/{userId}/{readingId} - Get reading details (admin only)
        adminReadingIdResource.addMethod('GET', new apigateway.LambdaIntegration(this.adminGetReadingDetailsFunction), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        // DELETE /api/admin/readings/{userId}/{readingId} - Delete reading (admin only)
        adminReadingIdResource.addMethod('DELETE', new apigateway.LambdaIntegration(this.adminDeleteReadingFunction), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        // /api/admin/readings/{userId}/{readingId}/status resource
        const adminReadingStatusResource = adminReadingIdResource.addResource('status');
        // PATCH /api/admin/readings/{userId}/{readingId}/status - Update reading status (admin only)
        adminReadingStatusResource.addMethod('PATCH', new apigateway.LambdaIntegration(this.adminUpdateReadingStatusFunction), {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBpLWNvbnN0cnVjdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImFwaS1jb25zdHJ1Y3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSwyQ0FBdUM7QUFDdkMsaURBQW1DO0FBQ25DLHVFQUF5RDtBQUN6RCwrREFBaUQ7QUFDakQsNEVBQThEO0FBRzlELHlEQUEyQztBQUMzQyx5REFBMkM7QUFDM0MsdURBQXlDO0FBQ3pDLHdFQUEwRDtBQUMxRCwyQ0FBNkI7QUFZN0IsTUFBYSxZQUFhLFNBQVEsc0JBQVM7SUFDekIsR0FBRyxDQUFxQjtJQUN4QixzQkFBc0IsQ0FBa0I7SUFDeEMseUJBQXlCLENBQWtCO0lBQzNDLDBCQUEwQixDQUFrQjtJQUM1QyxxQkFBcUIsQ0FBa0I7SUFDdkMsdUJBQXVCLENBQWtCO0lBQ3pDLG1CQUFtQixDQUFrQjtJQUNyQyx3QkFBd0IsQ0FBa0I7SUFDMUMsMkJBQTJCLENBQWtCO0lBQzdDLHdCQUF3QixDQUFrQjtJQUMxQyw4QkFBOEIsQ0FBa0I7SUFDaEQsZ0NBQWdDLENBQWtCO0lBQ2xELDBCQUEwQixDQUFrQjtJQUU1RCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXdCO1FBQ2hFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsMkNBQTJDO1FBQzNDLE1BQU0sWUFBWSxHQUFHLElBQUksRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsY0FBYyxFQUFFO1lBQ3ZELFVBQVUsRUFBRSxVQUFVLEtBQUssQ0FBQyxXQUFXLFNBQVM7WUFDaEQsU0FBUyxFQUFFLElBQUk7WUFDZixpQkFBaUIsRUFBRSxFQUFFLENBQUMsaUJBQWlCLENBQUMsU0FBUztZQUNqRCxVQUFVLEVBQUUsRUFBRSxDQUFDLGdCQUFnQixDQUFDLFVBQVU7WUFDMUMsYUFBYSxFQUNYLEtBQUssQ0FBQyxXQUFXLEtBQUssTUFBTSxDQUFDLENBQUMsQ0FBQyxH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LENBQUMsQ0FBQztRQUM5RCxrQkFBa0IsQ0FBQyxTQUFTLENBQzFCLEtBQUssRUFDTCxJQUFJLFVBQVUsQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsd0JBQXdCLENBQUMsRUFDL0Q7WUFDRSxVQUFVO1lBQ1YsaUJBQWlCLEVBQUUsVUFBVSxDQUFDLGlCQUFpQixDQUFDLE9BQU87U0FDeEQsQ0FDRixDQUFDO1FBRUYsaUJBQWlCO1FBQ2pCLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsUUFBUSxFQUFFO1lBQ2hDLEtBQUssRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUc7WUFDbkIsV0FBVyxFQUFFLGlCQUFpQjtTQUMvQixDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGFBQWEsRUFBRTtZQUNyQyxLQUFLLEVBQUUsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsNEJBQTRCO1lBQ2xELFdBQVcsRUFBRSwyQkFBMkI7U0FDekMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBbHFCRCxvQ0FrcUJDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgYXBpZ2F0ZXdheSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtYXBpZ2F0ZXdheSc7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XG5pbXBvcnQgKiBhcyBsYW1iZGFOb2RlSnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYS1ub2RlanMnO1xuaW1wb3J0ICogYXMgZHluYW1vZGIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWR5bmFtb2RiJztcbmltcG9ydCAqIGFzIGNvZ25pdG8gZnJvbSAnYXdzLWNkay1saWIvYXdzLWNvZ25pdG8nO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0ICogYXMgc3NtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zc20nO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcbmltcG9ydCAqIGFzIHMzZGVwbG95IGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMy1kZXBsb3ltZW50JztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQXBpQ29uc3RydWN0UHJvcHMge1xuICBlbnZpcm9ubWVudDogJ2RldicgfCAncHJvZCc7XG4gIHVzZXJUYWJsZTogZHluYW1vZGIuVGFibGU7XG4gIG5hdGFsQ2hhcnRUYWJsZTogZHluYW1vZGIuVGFibGU7XG4gIHJlYWRpbmdzVGFibGU6IGR5bmFtb2RiLlRhYmxlO1xuICB1c2VyUG9vbDogY29nbml0by5Vc2VyUG9vbDtcbiAgcGxhY2VJbmRleE5hbWU6IHN0cmluZztcbiAgYWxsb3dlZE9yaWdpbnM6IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgY2xhc3MgQXBpQ29uc3RydWN0IGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgcHVibGljIHJlYWRvbmx5IGFwaTogYXBpZ2F0ZXdheS5SZXN0QXBpO1xuICBwdWJsaWMgcmVhZG9ubHkgZ2V0VXNlclByb2ZpbGVGdW5jdGlvbjogbGFtYmRhLkZ1bmN0aW9uO1xuICBwdWJsaWMgcmVhZG9ubHkgdXBkYXRlVXNlclByb2ZpbGVGdW5jdGlvbjogbGFtYmRhLkZ1bmN0aW9uO1xuICBwdWJsaWMgcmVhZG9ubHkgZ2VuZXJhdGVOYXRhbENoYXJ0RnVuY3Rpb246IGxhbWJkYS5GdW5jdGlvbjtcbiAgcHVibGljIHJlYWRvbmx5IGdldE5hdGFsQ2hhcnRGdW5jdGlvbjogbGFtYmRhLkZ1bmN0aW9uO1xuICBwdWJsaWMgcmVhZG9ubHkgZ2VuZXJhdGVSZWFkaW5nRnVuY3Rpb246IGxhbWJkYS5GdW5jdGlvbjtcbiAgcHVibGljIHJlYWRvbmx5IGdldFJlYWRpbmdzRnVuY3Rpb246IGxhbWJkYS5GdW5jdGlvbjtcbiAgcHVibGljIHJlYWRvbmx5IGdldFJlYWRpbmdEZXRhaWxGdW5jdGlvbjogbGFtYmRhLkZ1bmN0aW9uO1xuICBwdWJsaWMgcmVhZG9ubHkgYWRtaW5HZXRBbGxSZWFkaW5nc0Z1bmN0aW9uOiBsYW1iZGEuRnVuY3Rpb247XG4gIHB1YmxpYyByZWFkb25seSBhZG1pbkdldEFsbFVzZXJzRnVuY3Rpb246IGxhbWJkYS5GdW5jdGlvbjtcbiAgcHVibGljIHJlYWRvbmx5IGFkbWluR2V0UmVhZGluZ0RldGFpbHNGdW5jdGlvbjogbGFtYmRhLkZ1bmN0aW9uO1xuICBwdWJsaWMgcmVhZG9ubHkgYWRtaW5VcGRhdGVSZWFkaW5nU3RhdHVzRnVuY3Rpb246IGxhbWJkYS5GdW5jdGlvbjtcbiAgcHVibGljIHJlYWRvbmx5IGFkbWluRGVsZXRlUmVhZGluZ0Z1bmN0aW9uOiBsYW1iZGEuRnVuY3Rpb247XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IEFwaUNvbnN0cnVjdFByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIC8vIENyZWF0ZSBTMyBidWNrZXQgZm9yIGNvbmZpZ3VyYXRpb24gZmlsZXNcbiAgICBjb25zdCBjb25maWdCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsICdDb25maWdCdWNrZXQnLCB7XG4gICAgICBidWNrZXROYW1lOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LWNvbmZpZ2AsXG4gICAgICB2ZXJzaW9uZWQ6IHRydWUsXG4gICAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxuICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VELFxuICAgICAgcmVtb3ZhbFBvbGljeTpcbiAgICAgICAgcHJvcHMuZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTiA6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICBhdXRvRGVsZXRlT2JqZWN0czogcHJvcHMuZW52aXJvbm1lbnQgIT09ICdwcm9kJyxcbiAgICAgIGxpZmVjeWNsZVJ1bGVzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogJ2RlbGV0ZS1vbGQtdmVyc2lvbnMnLFxuICAgICAgICAgIG5vbmN1cnJlbnRWZXJzaW9uRXhwaXJhdGlvbjogY2RrLkR1cmF0aW9uLmRheXMoMzApLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIERlcGxveSBwcm9tcHQgZmlsZXMgdG8gUzNcbiAgICBuZXcgczNkZXBsb3kuQnVja2V0RGVwbG95bWVudCh0aGlzLCAnRGVwbG95UHJvbXB0cycsIHtcbiAgICAgIHNvdXJjZXM6IFtcbiAgICAgICAgczNkZXBsb3kuU291cmNlLmFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9hc3NldHMvcHJvbXB0cycsIHByb3BzLmVudmlyb25tZW50KSksXG4gICAgICBdLFxuICAgICAgZGVzdGluYXRpb25CdWNrZXQ6IGNvbmZpZ0J1Y2tldCxcbiAgICAgIGRlc3RpbmF0aW9uS2V5UHJlZml4OiBgcHJvbXB0cy8ke3Byb3BzLmVudmlyb25tZW50fWAsXG4gICAgICBwcnVuZTogZmFsc2UsXG4gICAgICByZXRhaW5PbkRlbGV0ZTogcHJvcHMuZW52aXJvbm1lbnQgPT09ICdwcm9kJyxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBTU00gUGFyYW1ldGVycyBmb3IgT3BlbkFJIENvbmZpZ3VyYXRpb25cbiAgICBjb25zdCBvcGVuQWlBcGlLZXlQYXJhbWV0ZXIgPSBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcih0aGlzLCAnT3BlbkFpQXBpS2V5UGFyYW1ldGVyJywge1xuICAgICAgcGFyYW1ldGVyTmFtZTogYC9hdXJhMjgvJHtwcm9wcy5lbnZpcm9ubWVudH0vb3BlbmFpLWFwaS1rZXlgLFxuICAgICAgZGVzY3JpcHRpb246IGBPcGVuQUkgQVBJIGtleSBmb3IgJHtwcm9wcy5lbnZpcm9ubWVudH0gZW52aXJvbm1lbnRgLFxuICAgICAgc3RyaW5nVmFsdWU6ICdQTEFDRUhPTERFUl9UT19CRV9SRVBMQUNFRF9NQU5VQUxMWScsXG4gICAgICB0aWVyOiBzc20uUGFyYW1ldGVyVGllci5TVEFOREFSRCxcbiAgICB9KTtcblxuICAgIC8vIFNpbXBsaWZpZWQgU1NNIHBhcmFtZXRlcnMgcG9pbnRpbmcgdG8gUzMga2V5c1xuICAgIGNvbnN0IHJlYWRpbmdNb2RlbFBhcmFtZXRlciA9IG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsICdSZWFkaW5nTW9kZWxQYXJhbWV0ZXInLCB7XG4gICAgICBwYXJhbWV0ZXJOYW1lOiBgL2F1cmEyOC8ke3Byb3BzLmVudmlyb25tZW50fS9yZWFkaW5nL21vZGVsYCxcbiAgICAgIGRlc2NyaXB0aW9uOiBgT3BlbkFJIG1vZGVsIGZvciByZWFkaW5ncyBpbiAke3Byb3BzLmVudmlyb25tZW50fSBlbnZpcm9ubWVudGAsXG4gICAgICBzdHJpbmdWYWx1ZTogJ2dwdC00LXR1cmJvLXByZXZpZXcnLFxuICAgICAgdGllcjogc3NtLlBhcmFtZXRlclRpZXIuU1RBTkRBUkQsXG4gICAgfSk7XG5cbiAgICBjb25zdCByZWFkaW5nVGVtcGVyYXR1cmVQYXJhbWV0ZXIgPSBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcihcbiAgICAgIHRoaXMsXG4gICAgICAnUmVhZGluZ1RlbXBlcmF0dXJlUGFyYW1ldGVyJyxcbiAgICAgIHtcbiAgICAgICAgcGFyYW1ldGVyTmFtZTogYC9hdXJhMjgvJHtwcm9wcy5lbnZpcm9ubWVudH0vcmVhZGluZy90ZW1wZXJhdHVyZWAsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBgVGVtcGVyYXR1cmUgZm9yIHJlYWRpbmdzIGluICR7cHJvcHMuZW52aXJvbm1lbnR9IGVudmlyb25tZW50YCxcbiAgICAgICAgc3RyaW5nVmFsdWU6ICcwLjcnLFxuICAgICAgICB0aWVyOiBzc20uUGFyYW1ldGVyVGllci5TVEFOREFSRCxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIGNvbnN0IHJlYWRpbmdNYXhUb2tlbnNQYXJhbWV0ZXIgPSBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcih0aGlzLCAnUmVhZGluZ01heFRva2Vuc1BhcmFtZXRlcicsIHtcbiAgICAgIHBhcmFtZXRlck5hbWU6IGAvYXVyYTI4LyR7cHJvcHMuZW52aXJvbm1lbnR9L3JlYWRpbmcvbWF4X3Rva2Vuc2AsXG4gICAgICBkZXNjcmlwdGlvbjogYE1heCB0b2tlbnMgZm9yIHJlYWRpbmdzIGluICR7cHJvcHMuZW52aXJvbm1lbnR9IGVudmlyb25tZW50YCxcbiAgICAgIHN0cmluZ1ZhbHVlOiAnMjAwMCcsXG4gICAgICB0aWVyOiBzc20uUGFyYW1ldGVyVGllci5TVEFOREFSRCxcbiAgICB9KTtcblxuICAgIGNvbnN0IHN5c3RlbVByb21wdFMzS2V5UGFyYW1ldGVyID0gbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgJ1N5c3RlbVByb21wdFMzS2V5UGFyYW1ldGVyJywge1xuICAgICAgcGFyYW1ldGVyTmFtZTogYC9hdXJhMjgvJHtwcm9wcy5lbnZpcm9ubWVudH0vcmVhZGluZy9zeXN0ZW1fcHJvbXB0X3Mza2V5YCxcbiAgICAgIGRlc2NyaXB0aW9uOiBgUzMga2V5IGZvciBzeXN0ZW0gcHJvbXB0IGluICR7cHJvcHMuZW52aXJvbm1lbnR9IGVudmlyb25tZW50YCxcbiAgICAgIHN0cmluZ1ZhbHVlOiBgcHJvbXB0cy8ke3Byb3BzLmVudmlyb25tZW50fS9zb3VsX2JsdWVwcmludC9zeXN0ZW0udHh0YCxcbiAgICAgIHRpZXI6IHNzbS5QYXJhbWV0ZXJUaWVyLlNUQU5EQVJELFxuICAgIH0pO1xuXG4gICAgY29uc3QgdXNlclByb21wdFMzS2V5UGFyYW1ldGVyID0gbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgJ1VzZXJQcm9tcHRTM0tleVBhcmFtZXRlcicsIHtcbiAgICAgIHBhcmFtZXRlck5hbWU6IGAvYXVyYTI4LyR7cHJvcHMuZW52aXJvbm1lbnR9L3JlYWRpbmcvdXNlcl9wcm9tcHRfczNrZXlgLFxuICAgICAgZGVzY3JpcHRpb246IGBTMyBrZXkgZm9yIHVzZXIgcHJvbXB0IHRlbXBsYXRlIGluICR7cHJvcHMuZW52aXJvbm1lbnR9IGVudmlyb25tZW50YCxcbiAgICAgIHN0cmluZ1ZhbHVlOiBgcHJvbXB0cy8ke3Byb3BzLmVudmlyb25tZW50fS9zb3VsX2JsdWVwcmludC91c2VyX3RlbXBsYXRlLm1kYCxcbiAgICAgIHRpZXI6IHNzbS5QYXJhbWV0ZXJUaWVyLlNUQU5EQVJELFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIFN3aXNzIEVwaGVtZXJpcyBMYW1iZGEgTGF5ZXJcbiAgICAvLyBCdWlsZCB0aGUgbGF5ZXIgd2l0aG91dCBEb2NrZXJcbiAgICBjb25zdCBzd2lzc0VwaGVtZXJpc0xheWVyID0gbmV3IGxhbWJkYS5MYXllclZlcnNpb24odGhpcywgJ1N3aXNzRXBoZW1lcmlzTGF5ZXInLCB7XG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2xheWVycy9zd2V0ZXN0JyksIHtcbiAgICAgICAgYnVuZGxpbmc6IHtcbiAgICAgICAgICBpbWFnZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1guYnVuZGxpbmdJbWFnZSxcbiAgICAgICAgICB1c2VyOiAncm9vdCcsXG4gICAgICAgICAgY29tbWFuZDogW1xuICAgICAgICAgICAgJ2Jhc2gnLFxuICAgICAgICAgICAgJy1jJyxcbiAgICAgICAgICAgIFtcbiAgICAgICAgICAgICAgLy8gQ29weSBwcmUtYnVpbHQgbGF5ZXIgZGlyZWN0b3J5IGlmIGl0IGV4aXN0c1xuICAgICAgICAgICAgICAnaWYgWyAtZCAvYXNzZXQtaW5wdXQvbGF5ZXIvbm9kZWpzIF07IHRoZW4nLFxuICAgICAgICAgICAgICAnICBjcCAtciAvYXNzZXQtaW5wdXQvbGF5ZXIvbm9kZWpzIC9hc3NldC1vdXRwdXQvOycsXG4gICAgICAgICAgICAgICdlbHNlJyxcbiAgICAgICAgICAgICAgJyAgZWNobyBcIkVycm9yOiBQcmUtYnVpbHQgbGF5ZXIgZGlyZWN0b3J5IG5vdCBmb3VuZCBhdCAvYXNzZXQtaW5wdXQvbGF5ZXIvbm9kZWpzXCI7JyxcbiAgICAgICAgICAgICAgJyAgZXhpdCAxOycsXG4gICAgICAgICAgICAgICdmaScsXG4gICAgICAgICAgICBdLmpvaW4oJyAnKSxcbiAgICAgICAgICBdLFxuICAgICAgICAgIGxvY2FsOiB7XG4gICAgICAgICAgICAvLyBCdW5kbGUgbG9jYWxseSBieSBjb3B5aW5nIHRoZSBwcmUtYnVpbHQgbGF5ZXIgZGlyZWN0b3J5XG4gICAgICAgICAgICB0cnlCdW5kbGUob3V0cHV0RGlyOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICAgICAgICAgICAgY29uc3QgY2hpbGRfcHJvY2VzcyA9IHJlcXVpcmUoJ2NoaWxkX3Byb2Nlc3MnKTtcbiAgICAgICAgICAgICAgY29uc3QgZnMgPSByZXF1aXJlKCdmcycpO1xuICAgICAgICAgICAgICBjb25zdCBwYXRoID0gcmVxdWlyZSgncGF0aCcpO1xuXG4gICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgc3JjTGF5ZXJEaXIgPSBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vbGF5ZXJzL3N3ZXRlc3QvbGF5ZXInKTtcbiAgICAgICAgICAgICAgICBjb25zdCBzcmNOb2RlanNEaXIgPSBwYXRoLmpvaW4oc3JjTGF5ZXJEaXIsICdub2RlanMnKTtcblxuICAgICAgICAgICAgICAgIC8vIENoZWNrIGlmIHByZS1idWlsdCBsYXllciBleGlzdHNcbiAgICAgICAgICAgICAgICBpZiAoIWZzLmV4aXN0c1N5bmMoc3JjTm9kZWpzRGlyKSkge1xuICAgICAgICAgICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNvbnNvbGVcbiAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ1ByZS1idWlsdCBsYXllciBkaXJlY3Rvcnkgbm90IGZvdW5kIGF0OicsIHNyY05vZGVqc0Rpcik7XG4gICAgICAgICAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY29uc29sZVxuICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcignUGxlYXNlIHJ1bjogY2QgaW5mcmFzdHJ1Y3R1cmUvbGF5ZXJzL3N3ZXRlc3QgJiYgbnBtIGluc3RhbGwnKTtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBWYWxpZGF0ZSB0aGF0IHN3aXNzZXBoIGFuZCBlcGhlbWVyaXMgZmlsZXMgZXhpc3RcbiAgICAgICAgICAgICAgICBjb25zdCBzd2lzc2VwaERpciA9IHBhdGguam9pbihzcmNOb2RlanNEaXIsICdub2RlX21vZHVsZXMvc3dpc3NlcGgnKTtcbiAgICAgICAgICAgICAgICBjb25zdCBlcGhlRGlyID0gcGF0aC5qb2luKHN3aXNzZXBoRGlyLCAnZXBoZScpO1xuXG4gICAgICAgICAgICAgICAgaWYgKCFmcy5leGlzdHNTeW5jKHN3aXNzZXBoRGlyKSkge1xuICAgICAgICAgICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNvbnNvbGVcbiAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ3N3aXNzZXBoIG1vZHVsZSBub3QgZm91bmQgaW4gcHJlLWJ1aWx0IGxheWVyJyk7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKCFmcy5leGlzdHNTeW5jKGVwaGVEaXIpKSB7XG4gICAgICAgICAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY29uc29sZVxuICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcignZXBoZW1lcmlzIGRhdGEgZGlyZWN0b3J5IG5vdCBmb3VuZCBpbiBwcmUtYnVpbHQgbGF5ZXInKTtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBDaGVjayBmb3IgZXNzZW50aWFsIGVwaGVtZXJpcyBmaWxlc1xuICAgICAgICAgICAgICAgIGNvbnN0IGVzc2VudGlhbEZpbGVzID0gW1xuICAgICAgICAgICAgICAgICAgJ3NlbW9fMTguc2UxJyxcbiAgICAgICAgICAgICAgICAgICdzZXBsXzE4LnNlMScsXG4gICAgICAgICAgICAgICAgICAnc2Vhc18xOC5zZTEnLFxuICAgICAgICAgICAgICAgICAgJ3NlbGVhcHNlYy50eHQnLFxuICAgICAgICAgICAgICAgICAgJ3Nlb3JiZWwudHh0JyxcbiAgICAgICAgICAgICAgICBdO1xuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgZmlsZSBvZiBlc3NlbnRpYWxGaWxlcykge1xuICAgICAgICAgICAgICAgICAgaWYgKCFmcy5leGlzdHNTeW5jKHBhdGguam9pbihlcGhlRGlyLCBmaWxlKSkpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNvbnNvbGVcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRXNzZW50aWFsIGVwaGVtZXJpcyBmaWxlIG1pc3Npbmc6ICR7ZmlsZX1gKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIENvcHkgdGhlIGVudGlyZSBwcmUtYnVpbHQgbGF5ZXIgdG8gb3V0cHV0XG4gICAgICAgICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNvbnNvbGVcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnQ29weWluZyBwcmUtYnVpbHQgU3dpc3MgRXBoZW1lcmlzIGxheWVyLi4uJyk7XG4gICAgICAgICAgICAgICAgY2hpbGRfcHJvY2Vzcy5leGVjU3luYyhgY3AgLXIgXCIke3NyY05vZGVqc0Rpcn1cIiBcIiR7b3V0cHV0RGlyfS9cImAsIHtcbiAgICAgICAgICAgICAgICAgIHN0ZGlvOiAnaW5oZXJpdCcsXG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAvLyBMb2cgc3VjY2VzcyBhbmQgbGF5ZXIgc2l6ZVxuICAgICAgICAgICAgICAgIGNvbnN0IGxheWVyU2l6ZSA9IGNoaWxkX3Byb2Nlc3NcbiAgICAgICAgICAgICAgICAgIC5leGVjU3luYyhgZHUgLXNoIFwiJHtvdXRwdXREaXJ9L25vZGVqc1wiYCwgeyBlbmNvZGluZzogJ3V0ZjgnIH0pXG4gICAgICAgICAgICAgICAgICAudHJpbSgpO1xuICAgICAgICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jb25zb2xlXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYFN1Y2Nlc3NmdWxseSBidW5kbGVkIFN3aXNzIEVwaGVtZXJpcyBsYXllcjogJHtsYXllclNpemV9YCk7XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY29uc29sZVxuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBidW5kbGUgU3dpc3MgRXBoZW1lcmlzIGxheWVyOicsIGVycm9yKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgICAgY29tcGF0aWJsZVJ1bnRpbWVzOiBbbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1hdLFxuICAgICAgZGVzY3JpcHRpb246ICdTd2lzcyBFcGhlbWVyaXMgbGlicmFyeSB2MiB3aXRoIGhvdXNlIGNhbGN1bGF0aW9ucyBhbmQgZXBoZW1lcmlzIGRhdGEnLFxuICAgICAgbGF5ZXJWZXJzaW9uTmFtZTogYGF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS1zd2lzc2VwaC12MmAsXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgTGFtYmRhIGZ1bmN0aW9uc1xuICAgIHRoaXMuZ2V0VXNlclByb2ZpbGVGdW5jdGlvbiA9IG5ldyBsYW1iZGFOb2RlSnMuTm9kZWpzRnVuY3Rpb24odGhpcywgJ0dldFVzZXJQcm9maWxlRnVuY3Rpb24nLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6IGBhdXJhMjgtJHtwcm9wcy5lbnZpcm9ubWVudH0tZ2V0LXVzZXItcHJvZmlsZWAsXG4gICAgICBlbnRyeTogcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2xhbWJkYS91c2VyLXByb2ZpbGUvZ2V0LXVzZXItcHJvZmlsZS50cycpLFxuICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBUQUJMRV9OQU1FOiBwcm9wcy51c2VyVGFibGUudGFibGVOYW1lLFxuICAgICAgfSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgIG1lbW9yeVNpemU6IDI1NixcbiAgICAgIGJ1bmRsaW5nOiB7XG4gICAgICAgIGV4dGVybmFsTW9kdWxlczogWydAYXdzLXNkay8qJ10sXG4gICAgICAgIGZvcmNlRG9ja2VyQnVuZGxpbmc6IGZhbHNlLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBnZW5lcmF0ZU5hdGFsQ2hhcnRGdW5jdGlvbiBmaXJzdCwgYmVmb3JlIHVwZGF0ZVVzZXJQcm9maWxlRnVuY3Rpb24gdGhhdCByZWZlcmVuY2VzIGl0XG4gICAgdGhpcy5nZW5lcmF0ZU5hdGFsQ2hhcnRGdW5jdGlvbiA9IG5ldyBsYW1iZGFOb2RlSnMuTm9kZWpzRnVuY3Rpb24oXG4gICAgICB0aGlzLFxuICAgICAgJ0dlbmVyYXRlTmF0YWxDaGFydEZ1bmN0aW9uJyxcbiAgICAgIHtcbiAgICAgICAgZnVuY3Rpb25OYW1lOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LWdlbmVyYXRlLW5hdGFsLWNoYXJ0YCxcbiAgICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9sYW1iZGEvbmF0YWwtY2hhcnQvZ2VuZXJhdGUtbmF0YWwtY2hhcnQudHMnKSxcbiAgICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxuICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcbiAgICAgICAgbGF5ZXJzOiBbc3dpc3NFcGhlbWVyaXNMYXllcl0sXG4gICAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgICAgTkFUQUxfQ0hBUlRfVEFCTEVfTkFNRTogcHJvcHMubmF0YWxDaGFydFRhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgICBFUEhFTUVSSVNfUEFUSDogJy9vcHQvbm9kZWpzL25vZGVfbW9kdWxlcy9zd2lzc2VwaC9lcGhlJyxcbiAgICAgICAgICBTRV9FUEhFX1BBVEg6ICcvb3B0L25vZGVqcy9ub2RlX21vZHVsZXMvc3dpc3NlcGgvZXBoZScsXG4gICAgICAgIH0sXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDEwKSwgLy8gMTAgc2Vjb25kcyBmb3IgaG91c2UgY2FsY3VsYXRpb25zXG4gICAgICAgIG1lbW9yeVNpemU6IDUxMiwgLy8gSW5jcmVhc2VkIG1lbW9yeSBmb3IgZXBoZW1lcmlzIGNhbGN1bGF0aW9uc1xuICAgICAgICBidW5kbGluZzoge1xuICAgICAgICAgIGV4dGVybmFsTW9kdWxlczogWydAYXdzLXNkay8qJywgJ3N3aXNzZXBoJ10sIC8vIEV4Y2x1ZGUgc3dpc3NlcGggc2luY2UgaXQncyBpbiB0aGUgbGF5ZXJcbiAgICAgICAgICBmb3JjZURvY2tlckJ1bmRsaW5nOiBmYWxzZSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIHRoaXMudXBkYXRlVXNlclByb2ZpbGVGdW5jdGlvbiA9IG5ldyBsYW1iZGFOb2RlSnMuTm9kZWpzRnVuY3Rpb24oXG4gICAgICB0aGlzLFxuICAgICAgJ1VwZGF0ZVVzZXJQcm9maWxlRnVuY3Rpb24nLFxuICAgICAge1xuICAgICAgICBmdW5jdGlvbk5hbWU6IGBhdXJhMjgtJHtwcm9wcy5lbnZpcm9ubWVudH0tdXBkYXRlLXVzZXItcHJvZmlsZWAsXG4gICAgICAgIGVudHJ5OiBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vbGFtYmRhL3VzZXItcHJvZmlsZS91cGRhdGUtdXNlci1wcm9maWxlLnRzJyksXG4gICAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcbiAgICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgICAgVEFCTEVfTkFNRTogcHJvcHMudXNlclRhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgICBQTEFDRV9JTkRFWF9OQU1FOiBwcm9wcy5wbGFjZUluZGV4TmFtZSxcbiAgICAgICAgICBHRU5FUkFURV9OQVRBTF9DSEFSVF9GVU5DVElPTl9OQU1FOiB0aGlzLmdlbmVyYXRlTmF0YWxDaGFydEZ1bmN0aW9uLmZ1bmN0aW9uTmFtZSxcbiAgICAgICAgfSxcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgICBtZW1vcnlTaXplOiAyNTYsXG4gICAgICAgIGJ1bmRsaW5nOiB7XG4gICAgICAgICAgZXh0ZXJuYWxNb2R1bGVzOiBbJ0Bhd3Mtc2RrLyonXSxcbiAgICAgICAgICBmb3JjZURvY2tlckJ1bmRsaW5nOiBmYWxzZSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIEdyYW50IER5bmFtb0RCIHBlcm1pc3Npb25zXG4gICAgcHJvcHMudXNlclRhYmxlLmdyYW50UmVhZERhdGEodGhpcy5nZXRVc2VyUHJvZmlsZUZ1bmN0aW9uKTtcbiAgICBwcm9wcy51c2VyVGFibGUuZ3JhbnRXcml0ZURhdGEodGhpcy51cGRhdGVVc2VyUHJvZmlsZUZ1bmN0aW9uKTtcbiAgICBwcm9wcy5uYXRhbENoYXJ0VGFibGUuZ3JhbnRXcml0ZURhdGEodGhpcy5nZW5lcmF0ZU5hdGFsQ2hhcnRGdW5jdGlvbik7XG5cbiAgICB0aGlzLmdldE5hdGFsQ2hhcnRGdW5jdGlvbiA9IG5ldyBsYW1iZGFOb2RlSnMuTm9kZWpzRnVuY3Rpb24odGhpcywgJ0dldE5hdGFsQ2hhcnRGdW5jdGlvbicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogYGF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS1nZXQtbmF0YWwtY2hhcnRgLFxuICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9sYW1iZGEvbmF0YWwtY2hhcnQvZ2V0LW5hdGFsLWNoYXJ0LnRzJyksXG4gICAgICBoYW5kbGVyOiAnaGFuZGxlcicsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIE5BVEFMX0NIQVJUX1RBQkxFX05BTUU6IHByb3BzLm5hdGFsQ2hhcnRUYWJsZS50YWJsZU5hbWUsXG4gICAgICB9LFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgbWVtb3J5U2l6ZTogMjU2LFxuICAgICAgYnVuZGxpbmc6IHtcbiAgICAgICAgZXh0ZXJuYWxNb2R1bGVzOiBbJ0Bhd3Mtc2RrLyonXSxcbiAgICAgICAgZm9yY2VEb2NrZXJCdW5kbGluZzogZmFsc2UsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgcHJvcHMubmF0YWxDaGFydFRhYmxlLmdyYW50UmVhZERhdGEodGhpcy5nZXROYXRhbENoYXJ0RnVuY3Rpb24pO1xuXG4gICAgLy8gR3JhbnQgaW52b2NhdGlvbiBwZXJtaXNzaW9uXG4gICAgdGhpcy5nZW5lcmF0ZU5hdGFsQ2hhcnRGdW5jdGlvbi5ncmFudEludm9rZSh0aGlzLnVwZGF0ZVVzZXJQcm9maWxlRnVuY3Rpb24pO1xuXG4gICAgLy8gQ3JlYXRlIExhbWJkYSBmdW5jdGlvbnMgZm9yIHJlYWRpbmdzXG4gICAgdGhpcy5nZW5lcmF0ZVJlYWRpbmdGdW5jdGlvbiA9IG5ldyBsYW1iZGFOb2RlSnMuTm9kZWpzRnVuY3Rpb24oXG4gICAgICB0aGlzLFxuICAgICAgJ0dlbmVyYXRlUmVhZGluZ0Z1bmN0aW9uJyxcbiAgICAgIHtcbiAgICAgICAgZnVuY3Rpb25OYW1lOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LWdlbmVyYXRlLXJlYWRpbmdgLFxuICAgICAgICBlbnRyeTogcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2xhbWJkYS9yZWFkaW5ncy9nZW5lcmF0ZS1yZWFkaW5nLnRzJyksXG4gICAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcbiAgICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgICAgUkVBRElOR1NfVEFCTEVfTkFNRTogcHJvcHMucmVhZGluZ3NUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgICAgTkFUQUxfQ0hBUlRfVEFCTEVfTkFNRTogcHJvcHMubmF0YWxDaGFydFRhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgICBVU0VSX1RBQkxFX05BTUU6IHByb3BzLnVzZXJUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgICAgQ09ORklHX0JVQ0tFVF9OQU1FOiBjb25maWdCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgICAgICBPUEVOQUlfQVBJX0tFWV9QQVJBTUVURVJfTkFNRTogb3BlbkFpQXBpS2V5UGFyYW1ldGVyLnBhcmFtZXRlck5hbWUsXG4gICAgICAgICAgUkVBRElOR19NT0RFTF9QQVJBTUVURVJfTkFNRTogcmVhZGluZ01vZGVsUGFyYW1ldGVyLnBhcmFtZXRlck5hbWUsXG4gICAgICAgICAgUkVBRElOR19URU1QRVJBVFVSRV9QQVJBTUVURVJfTkFNRTogcmVhZGluZ1RlbXBlcmF0dXJlUGFyYW1ldGVyLnBhcmFtZXRlck5hbWUsXG4gICAgICAgICAgUkVBRElOR19NQVhfVE9LRU5TX1BBUkFNRVRFUl9OQU1FOiByZWFkaW5nTWF4VG9rZW5zUGFyYW1ldGVyLnBhcmFtZXRlck5hbWUsXG4gICAgICAgICAgU1lTVEVNX1BST01QVF9TM0tFWV9QQVJBTUVURVJfTkFNRTogc3lzdGVtUHJvbXB0UzNLZXlQYXJhbWV0ZXIucGFyYW1ldGVyTmFtZSxcbiAgICAgICAgICBVU0VSX1BST01QVF9TM0tFWV9QQVJBTUVURVJfTkFNRTogdXNlclByb21wdFMzS2V5UGFyYW1ldGVyLnBhcmFtZXRlck5hbWUsXG4gICAgICAgIH0sXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDEyMCksIC8vIEV4dGVuZGVkIHRpbWVvdXQgZm9yIE9wZW5BSSBBUEkgY2FsbHNcbiAgICAgICAgbWVtb3J5U2l6ZTogNTEyLFxuICAgICAgICBidW5kbGluZzoge1xuICAgICAgICAgIGV4dGVybmFsTW9kdWxlczogWydAYXdzLXNkay8qJ10sXG4gICAgICAgICAgZm9yY2VEb2NrZXJCdW5kbGluZzogZmFsc2UsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICB0aGlzLmdldFJlYWRpbmdzRnVuY3Rpb24gPSBuZXcgbGFtYmRhTm9kZUpzLk5vZGVqc0Z1bmN0aW9uKHRoaXMsICdHZXRSZWFkaW5nc0Z1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LWdldC1yZWFkaW5nc2AsXG4gICAgICBlbnRyeTogcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2xhbWJkYS9yZWFkaW5ncy9nZXQtcmVhZGluZ3MudHMnKSxcbiAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgUkVBRElOR1NfVEFCTEVfTkFNRTogcHJvcHMucmVhZGluZ3NUYWJsZS50YWJsZU5hbWUsXG4gICAgICB9LFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgbWVtb3J5U2l6ZTogMjU2LFxuICAgICAgYnVuZGxpbmc6IHtcbiAgICAgICAgZXh0ZXJuYWxNb2R1bGVzOiBbJ0Bhd3Mtc2RrLyonXSxcbiAgICAgICAgZm9yY2VEb2NrZXJCdW5kbGluZzogZmFsc2UsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgdGhpcy5nZXRSZWFkaW5nRGV0YWlsRnVuY3Rpb24gPSBuZXcgbGFtYmRhTm9kZUpzLk5vZGVqc0Z1bmN0aW9uKFxuICAgICAgdGhpcyxcbiAgICAgICdHZXRSZWFkaW5nRGV0YWlsRnVuY3Rpb24nLFxuICAgICAge1xuICAgICAgICBmdW5jdGlvbk5hbWU6IGBhdXJhMjgtJHtwcm9wcy5lbnZpcm9ubWVudH0tZ2V0LXJlYWRpbmctZGV0YWlsYCxcbiAgICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9sYW1iZGEvcmVhZGluZ3MvZ2V0LXJlYWRpbmctZGV0YWlsLnRzJyksXG4gICAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcbiAgICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgICAgUkVBRElOR1NfVEFCTEVfTkFNRTogcHJvcHMucmVhZGluZ3NUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIH0sXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgICAgbWVtb3J5U2l6ZTogMjU2LFxuICAgICAgICBidW5kbGluZzoge1xuICAgICAgICAgIGV4dGVybmFsTW9kdWxlczogWydAYXdzLXNkay8qJ10sXG4gICAgICAgICAgZm9yY2VEb2NrZXJCdW5kbGluZzogZmFsc2UsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBHcmFudCBEeW5hbW9EQiBwZXJtaXNzaW9ucyBmb3IgcmVhZGluZ3NcbiAgICBwcm9wcy5yZWFkaW5nc1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YSh0aGlzLmdlbmVyYXRlUmVhZGluZ0Z1bmN0aW9uKTtcbiAgICBwcm9wcy5yZWFkaW5nc1RhYmxlLmdyYW50UmVhZERhdGEodGhpcy5nZXRSZWFkaW5nc0Z1bmN0aW9uKTtcbiAgICBwcm9wcy5yZWFkaW5nc1RhYmxlLmdyYW50UmVhZERhdGEodGhpcy5nZXRSZWFkaW5nRGV0YWlsRnVuY3Rpb24pO1xuICAgIHByb3BzLm5hdGFsQ2hhcnRUYWJsZS5ncmFudFJlYWREYXRhKHRoaXMuZ2VuZXJhdGVSZWFkaW5nRnVuY3Rpb24pO1xuICAgIHByb3BzLnVzZXJUYWJsZS5ncmFudFJlYWREYXRhKHRoaXMuZ2VuZXJhdGVSZWFkaW5nRnVuY3Rpb24pO1xuXG4gICAgLy8gR3JhbnQgcGVybWlzc2lvbnMgdG8gZ2VuZXJhdGUgcmVhZGluZyBmdW5jdGlvblxuICAgIC8vIFNTTSBwYXJhbWV0ZXIgcmVhZCBwZXJtaXNzaW9uc1xuICAgIG9wZW5BaUFwaUtleVBhcmFtZXRlci5ncmFudFJlYWQodGhpcy5nZW5lcmF0ZVJlYWRpbmdGdW5jdGlvbik7XG4gICAgcmVhZGluZ01vZGVsUGFyYW1ldGVyLmdyYW50UmVhZCh0aGlzLmdlbmVyYXRlUmVhZGluZ0Z1bmN0aW9uKTtcbiAgICByZWFkaW5nVGVtcGVyYXR1cmVQYXJhbWV0ZXIuZ3JhbnRSZWFkKHRoaXMuZ2VuZXJhdGVSZWFkaW5nRnVuY3Rpb24pO1xuICAgIHJlYWRpbmdNYXhUb2tlbnNQYXJhbWV0ZXIuZ3JhbnRSZWFkKHRoaXMuZ2VuZXJhdGVSZWFkaW5nRnVuY3Rpb24pO1xuICAgIHN5c3RlbVByb21wdFMzS2V5UGFyYW1ldGVyLmdyYW50UmVhZCh0aGlzLmdlbmVyYXRlUmVhZGluZ0Z1bmN0aW9uKTtcbiAgICB1c2VyUHJvbXB0UzNLZXlQYXJhbWV0ZXIuZ3JhbnRSZWFkKHRoaXMuZ2VuZXJhdGVSZWFkaW5nRnVuY3Rpb24pO1xuXG4gICAgLy8gUzMgYnVja2V0IHJlYWQgcGVybWlzc2lvbnMgZm9yIGNvbmZpZ3VyYXRpb24gZmlsZXNcbiAgICBjb25maWdCdWNrZXQuZ3JhbnRSZWFkKHRoaXMuZ2VuZXJhdGVSZWFkaW5nRnVuY3Rpb24pO1xuXG4gICAgLy8gQ3JlYXRlIEFkbWluIExhbWJkYSBmdW5jdGlvbnNcbiAgICB0aGlzLmFkbWluR2V0QWxsUmVhZGluZ3NGdW5jdGlvbiA9IG5ldyBsYW1iZGFOb2RlSnMuTm9kZWpzRnVuY3Rpb24oXG4gICAgICB0aGlzLFxuICAgICAgJ0FkbWluR2V0QWxsUmVhZGluZ3NGdW5jdGlvbicsXG4gICAgICB7XG4gICAgICAgIGZ1bmN0aW9uTmFtZTogYGF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS1hZG1pbi1nZXQtYWxsLXJlYWRpbmdzYCxcbiAgICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9sYW1iZGEvYWRtaW4vZ2V0LWFsbC1yZWFkaW5ncy50cycpLFxuICAgICAgICBoYW5kbGVyOiAnaGFuZGxlcicsXG4gICAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxuICAgICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICAgIFJFQURJTkdTX1RBQkxFX05BTUU6IHByb3BzLnJlYWRpbmdzVGFibGUudGFibGVOYW1lLFxuICAgICAgICAgIFVTRVJfVEFCTEVfTkFNRTogcHJvcHMudXNlclRhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgfSxcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgICBtZW1vcnlTaXplOiA1MTIsXG4gICAgICAgIGJ1bmRsaW5nOiB7XG4gICAgICAgICAgZXh0ZXJuYWxNb2R1bGVzOiBbJ0Bhd3Mtc2RrLyonXSxcbiAgICAgICAgICBmb3JjZURvY2tlckJ1bmRsaW5nOiBmYWxzZSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIHRoaXMuYWRtaW5HZXRBbGxVc2Vyc0Z1bmN0aW9uID0gbmV3IGxhbWJkYU5vZGVKcy5Ob2RlanNGdW5jdGlvbihcbiAgICAgIHRoaXMsXG4gICAgICAnQWRtaW5HZXRBbGxVc2Vyc0Z1bmN0aW9uJyxcbiAgICAgIHtcbiAgICAgICAgZnVuY3Rpb25OYW1lOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LWFkbWluLWdldC1hbGwtdXNlcnNgLFxuICAgICAgICBlbnRyeTogcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2xhbWJkYS9hZG1pbi9nZXQtYWxsLXVzZXJzLnRzJyksXG4gICAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcbiAgICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgICAgVVNFUl9QT09MX0lEOiBwcm9wcy51c2VyUG9vbC51c2VyUG9vbElkLFxuICAgICAgICB9LFxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICAgIG1lbW9yeVNpemU6IDI1NixcbiAgICAgICAgYnVuZGxpbmc6IHtcbiAgICAgICAgICBleHRlcm5hbE1vZHVsZXM6IFsnQGF3cy1zZGsvKiddLFxuICAgICAgICAgIGZvcmNlRG9ja2VyQnVuZGxpbmc6IGZhbHNlLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gQ3JlYXRlIGFkZGl0aW9uYWwgYWRtaW4gTGFtYmRhIGZ1bmN0aW9uc1xuICAgIHRoaXMuYWRtaW5HZXRSZWFkaW5nRGV0YWlsc0Z1bmN0aW9uID0gbmV3IGxhbWJkYU5vZGVKcy5Ob2RlanNGdW5jdGlvbihcbiAgICAgIHRoaXMsXG4gICAgICAnQWRtaW5HZXRSZWFkaW5nRGV0YWlsc0Z1bmN0aW9uJyxcbiAgICAgIHtcbiAgICAgICAgZnVuY3Rpb25OYW1lOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LWFkbWluLWdldC1yZWFkaW5nLWRldGFpbHNgLFxuICAgICAgICBlbnRyeTogcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2xhbWJkYS9hZG1pbi9nZXQtcmVhZGluZy1kZXRhaWxzLnRzJyksXG4gICAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcbiAgICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgICAgUkVBRElOR1NfVEFCTEVfTkFNRTogcHJvcHMucmVhZGluZ3NUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgICAgVVNFUl9UQUJMRV9OQU1FOiBwcm9wcy51c2VyVGFibGUudGFibGVOYW1lLFxuICAgICAgICB9LFxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICAgIG1lbW9yeVNpemU6IDI1NixcbiAgICAgICAgYnVuZGxpbmc6IHtcbiAgICAgICAgICBleHRlcm5hbE1vZHVsZXM6IFsnQGF3cy1zZGsvKiddLFxuICAgICAgICAgIGZvcmNlRG9ja2VyQnVuZGxpbmc6IGZhbHNlLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgdGhpcy5hZG1pblVwZGF0ZVJlYWRpbmdTdGF0dXNGdW5jdGlvbiA9IG5ldyBsYW1iZGFOb2RlSnMuTm9kZWpzRnVuY3Rpb24oXG4gICAgICB0aGlzLFxuICAgICAgJ0FkbWluVXBkYXRlUmVhZGluZ1N0YXR1c0Z1bmN0aW9uJyxcbiAgICAgIHtcbiAgICAgICAgZnVuY3Rpb25OYW1lOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LWFkbWluLXVwZGF0ZS1yZWFkaW5nLXN0YXR1c2AsXG4gICAgICAgIGVudHJ5OiBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vbGFtYmRhL2FkbWluL3VwZGF0ZS1yZWFkaW5nLXN0YXR1cy50cycpLFxuICAgICAgICBoYW5kbGVyOiAnaGFuZGxlcicsXG4gICAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxuICAgICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICAgIFJFQURJTkdTX1RBQkxFX05BTUU6IHByb3BzLnJlYWRpbmdzVGFibGUudGFibGVOYW1lLFxuICAgICAgICB9LFxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICAgIG1lbW9yeVNpemU6IDI1NixcbiAgICAgICAgYnVuZGxpbmc6IHtcbiAgICAgICAgICBleHRlcm5hbE1vZHVsZXM6IFsnQGF3cy1zZGsvKiddLFxuICAgICAgICAgIGZvcmNlRG9ja2VyQnVuZGxpbmc6IGZhbHNlLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgdGhpcy5hZG1pbkRlbGV0ZVJlYWRpbmdGdW5jdGlvbiA9IG5ldyBsYW1iZGFOb2RlSnMuTm9kZWpzRnVuY3Rpb24oXG4gICAgICB0aGlzLFxuICAgICAgJ0FkbWluRGVsZXRlUmVhZGluZ0Z1bmN0aW9uJyxcbiAgICAgIHtcbiAgICAgICAgZnVuY3Rpb25OYW1lOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LWFkbWluLWRlbGV0ZS1yZWFkaW5nYCxcbiAgICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9sYW1iZGEvYWRtaW4vZGVsZXRlLXJlYWRpbmcudHMnKSxcbiAgICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxuICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcbiAgICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICBSRUFESU5HU19UQUJMRV9OQU1FOiBwcm9wcy5yZWFkaW5nc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgfSxcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgICBtZW1vcnlTaXplOiAyNTYsXG4gICAgICAgIGJ1bmRsaW5nOiB7XG4gICAgICAgICAgZXh0ZXJuYWxNb2R1bGVzOiBbJ0Bhd3Mtc2RrLyonXSxcbiAgICAgICAgICBmb3JjZURvY2tlckJ1bmRsaW5nOiBmYWxzZSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIEdyYW50IER5bmFtb0RCIHBlcm1pc3Npb25zIGZvciBhZG1pbiBmdW5jdGlvbnNcbiAgICBwcm9wcy5yZWFkaW5nc1RhYmxlLmdyYW50UmVhZERhdGEodGhpcy5hZG1pbkdldEFsbFJlYWRpbmdzRnVuY3Rpb24pO1xuICAgIHByb3BzLnVzZXJUYWJsZS5ncmFudFJlYWREYXRhKHRoaXMuYWRtaW5HZXRBbGxSZWFkaW5nc0Z1bmN0aW9uKTtcbiAgICBwcm9wcy5yZWFkaW5nc1RhYmxlLmdyYW50UmVhZERhdGEodGhpcy5hZG1pbkdldFJlYWRpbmdEZXRhaWxzRnVuY3Rpb24pO1xuICAgIHByb3BzLnVzZXJUYWJsZS5ncmFudFJlYWREYXRhKHRoaXMuYWRtaW5HZXRSZWFkaW5nRGV0YWlsc0Z1bmN0aW9uKTtcbiAgICBwcm9wcy5yZWFkaW5nc1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YSh0aGlzLmFkbWluVXBkYXRlUmVhZGluZ1N0YXR1c0Z1bmN0aW9uKTtcbiAgICBwcm9wcy5yZWFkaW5nc1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YSh0aGlzLmFkbWluRGVsZXRlUmVhZGluZ0Z1bmN0aW9uKTtcblxuICAgIC8vIEdyYW50IENvZ25pdG8gcGVybWlzc2lvbnMgZm9yIGFkbWluIHVzZXIgbGlzdGluZ1xuICAgIHRoaXMuYWRtaW5HZXRBbGxVc2Vyc0Z1bmN0aW9uLmFkZFRvUm9sZVBvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgYWN0aW9uczogWydjb2duaXRvLWlkcDpMaXN0VXNlcnMnXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbcHJvcHMudXNlclBvb2wudXNlclBvb2xBcm5dLFxuICAgICAgfSksXG4gICAgKTtcblxuICAgIC8vIEdyYW50IExvY2F0aW9uIFNlcnZpY2UgcGVybWlzc2lvbnNcbiAgICB0aGlzLnVwZGF0ZVVzZXJQcm9maWxlRnVuY3Rpb24uYWRkVG9Sb2xlUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBhY3Rpb25zOiBbJ2dlbzpTZWFyY2hQbGFjZUluZGV4Rm9yVGV4dCddLFxuICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICBgYXJuOmF3czpnZW86JHtjZGsuU3RhY2sub2YodGhpcykucmVnaW9ufToke2Nkay5TdGFjay5vZih0aGlzKS5hY2NvdW50fTpwbGFjZS1pbmRleC8ke1xuICAgICAgICAgICAgcHJvcHMucGxhY2VJbmRleE5hbWVcbiAgICAgICAgICB9YCxcbiAgICAgICAgXSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICAvLyBDcmVhdGUgQVBJIEdhdGV3YXlcbiAgICB0aGlzLmFwaSA9IG5ldyBhcGlnYXRld2F5LlJlc3RBcGkodGhpcywgJ1VzZXJBcGknLCB7XG4gICAgICByZXN0QXBpTmFtZTogYGF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS11c2VyLWFwaWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ0FQSSBmb3IgdXNlciBwcm9maWxlIG1hbmFnZW1lbnQnLFxuICAgICAgZGVwbG95T3B0aW9uczoge1xuICAgICAgICBzdGFnZU5hbWU6IHByb3BzLmVudmlyb25tZW50LFxuICAgICAgICB0cmFjaW5nRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgZGF0YVRyYWNlRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgbG9nZ2luZ0xldmVsOiBhcGlnYXRld2F5Lk1ldGhvZExvZ2dpbmdMZXZlbC5JTkZPLFxuICAgICAgICBtZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBkZWZhdWx0Q29yc1ByZWZsaWdodE9wdGlvbnM6IHtcbiAgICAgICAgYWxsb3dPcmlnaW5zOiBwcm9wcy5hbGxvd2VkT3JpZ2lucyxcbiAgICAgICAgYWxsb3dNZXRob2RzOiBbJ0dFVCcsICdQVVQnLCAnUE9TVCcsICdQQVRDSCcsICdERUxFVEUnLCAnT1BUSU9OUyddLFxuICAgICAgICBhbGxvd0hlYWRlcnM6IFtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJyxcbiAgICAgICAgICAnWC1BbXotRGF0ZScsXG4gICAgICAgICAgJ0F1dGhvcml6YXRpb24nLFxuICAgICAgICAgICdYLUFwaS1LZXknLFxuICAgICAgICAgICdYLUFtei1TZWN1cml0eS1Ub2tlbicsXG4gICAgICAgIF0sXG4gICAgICAgIGFsbG93Q3JlZGVudGlhbHM6IHRydWUsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIENvZ25pdG8gYXV0aG9yaXplclxuICAgIGNvbnN0IGF1dGhvcml6ZXIgPSBuZXcgYXBpZ2F0ZXdheS5Db2duaXRvVXNlclBvb2xzQXV0aG9yaXplcih0aGlzLCAnVXNlclBvb2xBdXRob3JpemVyJywge1xuICAgICAgY29nbml0b1VzZXJQb29sczogW3Byb3BzLnVzZXJQb29sXSxcbiAgICAgIGF1dGhvcml6ZXJOYW1lOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LWF1dGhvcml6ZXJgLFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIC9hcGkvdXNlcnMve3VzZXJJZH0vcHJvZmlsZSByZXNvdXJjZVxuICAgIGNvbnN0IGFwaVJlc291cmNlID0gdGhpcy5hcGkucm9vdC5hZGRSZXNvdXJjZSgnYXBpJyk7XG4gICAgY29uc3QgdXNlcnNSZXNvdXJjZSA9IGFwaVJlc291cmNlLmFkZFJlc291cmNlKCd1c2VycycpO1xuICAgIGNvbnN0IHVzZXJJZFJlc291cmNlID0gdXNlcnNSZXNvdXJjZS5hZGRSZXNvdXJjZSgne3VzZXJJZH0nKTtcbiAgICBjb25zdCBwcm9maWxlUmVzb3VyY2UgPSB1c2VySWRSZXNvdXJjZS5hZGRSZXNvdXJjZSgncHJvZmlsZScpO1xuXG4gICAgLy8gQWRkIEdFVCBtZXRob2RcbiAgICBwcm9maWxlUmVzb3VyY2UuYWRkTWV0aG9kKFxuICAgICAgJ0dFVCcsXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbih0aGlzLmdldFVzZXJQcm9maWxlRnVuY3Rpb24pLFxuICAgICAge1xuICAgICAgICBhdXRob3JpemVyLFxuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gQWRkIC9hcGkvdXNlcnMve3VzZXJJZH0vbmF0YWwtY2hhcnQgcmVzb3VyY2VcbiAgICBjb25zdCBuYXRhbENoYXJ0UmVzb3VyY2UgPSB1c2VySWRSZXNvdXJjZS5hZGRSZXNvdXJjZSgnbmF0YWwtY2hhcnQnKTtcbiAgICBuYXRhbENoYXJ0UmVzb3VyY2UuYWRkTWV0aG9kKFxuICAgICAgJ0dFVCcsXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbih0aGlzLmdldE5hdGFsQ2hhcnRGdW5jdGlvbiksXG4gICAgICB7XG4gICAgICAgIGF1dGhvcml6ZXIsXG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBBZGQgUFVUIG1ldGhvZFxuICAgIHByb2ZpbGVSZXNvdXJjZS5hZGRNZXRob2QoXG4gICAgICAnUFVUJyxcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHRoaXMudXBkYXRlVXNlclByb2ZpbGVGdW5jdGlvbiksXG4gICAgICB7XG4gICAgICAgIGF1dGhvcml6ZXIsXG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBBZGQgL2FwaS91c2Vycy97dXNlcklkfS9yZWFkaW5ncyByZXNvdXJjZVxuICAgIGNvbnN0IHJlYWRpbmdzUmVzb3VyY2UgPSB1c2VySWRSZXNvdXJjZS5hZGRSZXNvdXJjZSgncmVhZGluZ3MnKTtcblxuICAgIC8vIEdFVCAvYXBpL3VzZXJzL3t1c2VySWR9L3JlYWRpbmdzIC0gTGlzdCB1c2VyJ3MgcmVhZGluZ3NcbiAgICByZWFkaW5nc1Jlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24odGhpcy5nZXRSZWFkaW5nc0Z1bmN0aW9uKSwge1xuICAgICAgYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG5cbiAgICAvLyBQT1NUIC9hcGkvdXNlcnMve3VzZXJJZH0vcmVhZGluZ3MgLSBHZW5lcmF0ZSBhIG5ldyByZWFkaW5nXG4gICAgcmVhZGluZ3NSZXNvdXJjZS5hZGRNZXRob2QoXG4gICAgICAnUE9TVCcsXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbih0aGlzLmdlbmVyYXRlUmVhZGluZ0Z1bmN0aW9uKSxcbiAgICAgIHtcbiAgICAgICAgYXV0aG9yaXplcixcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIEFkZCAvYXBpL3VzZXJzL3t1c2VySWR9L3JlYWRpbmdzL3tyZWFkaW5nSWR9IHJlc291cmNlXG4gICAgY29uc3QgcmVhZGluZ0lkUmVzb3VyY2UgPSByZWFkaW5nc1Jlc291cmNlLmFkZFJlc291cmNlKCd7cmVhZGluZ0lkfScpO1xuXG4gICAgLy8gR0VUIC9hcGkvdXNlcnMve3VzZXJJZH0vcmVhZGluZ3Mve3JlYWRpbmdJZH0gLSBHZXQgcmVhZGluZyBkZXRhaWxcbiAgICByZWFkaW5nSWRSZXNvdXJjZS5hZGRNZXRob2QoXG4gICAgICAnR0VUJyxcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHRoaXMuZ2V0UmVhZGluZ0RldGFpbEZ1bmN0aW9uKSxcbiAgICAgIHtcbiAgICAgICAgYXV0aG9yaXplcixcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIENyZWF0ZSAvYXBpL2FkbWluIHJlc291cmNlc1xuICAgIGNvbnN0IGFkbWluUmVzb3VyY2UgPSBhcGlSZXNvdXJjZS5hZGRSZXNvdXJjZSgnYWRtaW4nKTtcblxuICAgIC8vIEdFVCAvYXBpL2FkbWluL3JlYWRpbmdzIC0gR2V0IGFsbCByZWFkaW5ncyAoYWRtaW4gb25seSlcbiAgICBjb25zdCBhZG1pblJlYWRpbmdzUmVzb3VyY2UgPSBhZG1pblJlc291cmNlLmFkZFJlc291cmNlKCdyZWFkaW5ncycpO1xuICAgIGFkbWluUmVhZGluZ3NSZXNvdXJjZS5hZGRNZXRob2QoXG4gICAgICAnR0VUJyxcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHRoaXMuYWRtaW5HZXRBbGxSZWFkaW5nc0Z1bmN0aW9uKSxcbiAgICAgIHtcbiAgICAgICAgYXV0aG9yaXplcixcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIC9hcGkvYWRtaW4vcmVhZGluZ3Mve3VzZXJJZH0ve3JlYWRpbmdJZH0gcmVzb3VyY2VcbiAgICBjb25zdCBhZG1pblVzZXJJZFJlc291cmNlID0gYWRtaW5SZWFkaW5nc1Jlc291cmNlLmFkZFJlc291cmNlKCd7dXNlcklkfScpO1xuICAgIGNvbnN0IGFkbWluUmVhZGluZ0lkUmVzb3VyY2UgPSBhZG1pblVzZXJJZFJlc291cmNlLmFkZFJlc291cmNlKCd7cmVhZGluZ0lkfScpO1xuXG4gICAgLy8gR0VUIC9hcGkvYWRtaW4vcmVhZGluZ3Mve3VzZXJJZH0ve3JlYWRpbmdJZH0gLSBHZXQgcmVhZGluZyBkZXRhaWxzIChhZG1pbiBvbmx5KVxuICAgIGFkbWluUmVhZGluZ0lkUmVzb3VyY2UuYWRkTWV0aG9kKFxuICAgICAgJ0dFVCcsXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbih0aGlzLmFkbWluR2V0UmVhZGluZ0RldGFpbHNGdW5jdGlvbiksXG4gICAgICB7XG4gICAgICAgIGF1dGhvcml6ZXIsXG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBERUxFVEUgL2FwaS9hZG1pbi9yZWFkaW5ncy97dXNlcklkfS97cmVhZGluZ0lkfSAtIERlbGV0ZSByZWFkaW5nIChhZG1pbiBvbmx5KVxuICAgIGFkbWluUmVhZGluZ0lkUmVzb3VyY2UuYWRkTWV0aG9kKFxuICAgICAgJ0RFTEVURScsXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbih0aGlzLmFkbWluRGVsZXRlUmVhZGluZ0Z1bmN0aW9uKSxcbiAgICAgIHtcbiAgICAgICAgYXV0aG9yaXplcixcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIC9hcGkvYWRtaW4vcmVhZGluZ3Mve3VzZXJJZH0ve3JlYWRpbmdJZH0vc3RhdHVzIHJlc291cmNlXG4gICAgY29uc3QgYWRtaW5SZWFkaW5nU3RhdHVzUmVzb3VyY2UgPSBhZG1pblJlYWRpbmdJZFJlc291cmNlLmFkZFJlc291cmNlKCdzdGF0dXMnKTtcblxuICAgIC8vIFBBVENIIC9hcGkvYWRtaW4vcmVhZGluZ3Mve3VzZXJJZH0ve3JlYWRpbmdJZH0vc3RhdHVzIC0gVXBkYXRlIHJlYWRpbmcgc3RhdHVzIChhZG1pbiBvbmx5KVxuICAgIGFkbWluUmVhZGluZ1N0YXR1c1Jlc291cmNlLmFkZE1ldGhvZChcbiAgICAgICdQQVRDSCcsXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbih0aGlzLmFkbWluVXBkYXRlUmVhZGluZ1N0YXR1c0Z1bmN0aW9uKSxcbiAgICAgIHtcbiAgICAgICAgYXV0aG9yaXplcixcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIEdFVCAvYXBpL2FkbWluL3VzZXJzIC0gR2V0IGFsbCB1c2VycyAoYWRtaW4gb25seSlcbiAgICBjb25zdCBhZG1pblVzZXJzUmVzb3VyY2UgPSBhZG1pblJlc291cmNlLmFkZFJlc291cmNlKCd1c2VycycpO1xuICAgIGFkbWluVXNlcnNSZXNvdXJjZS5hZGRNZXRob2QoXG4gICAgICAnR0VUJyxcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHRoaXMuYWRtaW5HZXRBbGxVc2Vyc0Z1bmN0aW9uKSxcbiAgICAgIHtcbiAgICAgICAgYXV0aG9yaXplcixcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIE91dHB1dCBBUEkgVVJMXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FwaVVybCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmFwaS51cmwsXG4gICAgICBkZXNjcmlwdGlvbjogJ0FQSSBHYXRld2F5IFVSTCcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQXBpRW5kcG9pbnQnLCB7XG4gICAgICB2YWx1ZTogYCR7dGhpcy5hcGkudXJsfWFwaS91c2Vycy97dXNlcklkfS9wcm9maWxlYCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnVXNlciBQcm9maWxlIEFQSSBFbmRwb2ludCcsXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==