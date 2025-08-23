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
    createCheckoutSessionFunction;
    stripeWebhookHandlerFunction;
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
        // Create SSM Parameters for Stripe Configuration
        const stripeApiKeyParameter = new ssm.StringParameter(this, 'StripeApiKeyParameter', {
            parameterName: `/aura28/${props.environment}/stripe/api-key`,
            description: `Stripe API key for ${props.environment} environment`,
            stringValue: 'PLACEHOLDER_TO_BE_REPLACED_MANUALLY',
            tier: ssm.ParameterTier.STANDARD,
        });
        // Webhook secret parameter for webhook signature verification
        const stripeWebhookSecretParameter = new ssm.StringParameter(this, 'StripeWebhookSecretParameter', {
            parameterName: `/aura28/${props.environment}/stripe/webhook-secret`,
            description: `Stripe webhook secret for ${props.environment} environment`,
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
        // Use pre-built Swiss Ephemeris Lambda Layer
        // The layer is built via CodeBuild on Amazon Linux 2023 for binary compatibility
        // Use prop if provided (new deployments), otherwise fall back to SSM (existing deployments)
        const swissEphemerisLayerArn = props.swissEphemerisLayerArn ||
            ssm.StringParameter.valueForStringParameter(this, `/aura28/${props.environment}/layers/swetest-arn`);
        const swissEphemerisLayer = lambda.LayerVersion.fromLayerVersionArn(this, 'SwissEphemerisLayer', swissEphemerisLayerArn);
        // Create Lambda functions
        this.getUserProfileFunction = new lambdaNodeJs.NodejsFunction(this, 'GetUserProfileFunction', {
            functionName: `aura28-${props.environment}-get-user-profile`,
            entry: path.join(__dirname, '../../lambda/user-profile/get-user-profile.ts'),
            handler: 'handler',
            runtime: lambda.Runtime.NODEJS_20_X,
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
            runtime: lambda.Runtime.NODEJS_20_X,
            layers: [swissEphemerisLayer],
            environment: {
                NATAL_CHART_TABLE_NAME: props.natalChartTable.tableName,
                EPHEMERIS_PATH: '/opt/nodejs/node_modules/swisseph/ephe',
                SE_EPHE_PATH: '/opt/nodejs/node_modules/swisseph/ephe',
                NODE_ENV: 'production', // Ensure production mode
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
            runtime: lambda.Runtime.NODEJS_20_X,
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
            runtime: lambda.Runtime.NODEJS_20_X,
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
        // Generate a unique internal invocation secret for this environment (defined early for both functions)
        const internalInvocationSecret = `webhook-internal-${props.environment}-${cdk.Stack.of(this).stackId}`;
        // Create Lambda functions for readings
        this.generateReadingFunction = new lambdaNodeJs.NodejsFunction(this, 'GenerateReadingFunction', {
            functionName: `aura28-${props.environment}-generate-reading`,
            entry: path.join(__dirname, '../../lambda/readings/generate-reading.ts'),
            handler: 'handler',
            runtime: lambda.Runtime.NODEJS_20_X,
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
                INTERNAL_INVOCATION_SECRET: internalInvocationSecret,
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
            runtime: lambda.Runtime.NODEJS_20_X,
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
            runtime: lambda.Runtime.NODEJS_20_X,
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
            runtime: lambda.Runtime.NODEJS_20_X,
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
            runtime: lambda.Runtime.NODEJS_20_X,
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
            runtime: lambda.Runtime.NODEJS_20_X,
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
            runtime: lambda.Runtime.NODEJS_20_X,
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
            runtime: lambda.Runtime.NODEJS_20_X,
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
        // Create Stripe Checkout Session Lambda function
        this.createCheckoutSessionFunction = new lambdaNodeJs.NodejsFunction(this, 'CreateCheckoutSessionFunction', {
            functionName: `aura28-${props.environment}-create-checkout-session`,
            entry: path.join(__dirname, '../../lambda/payments/create-checkout-session.ts'),
            handler: 'handler',
            runtime: lambda.Runtime.NODEJS_20_X,
            environment: {
                STRIPE_API_KEY_PARAMETER_NAME: stripeApiKeyParameter.parameterName,
                ALLOWED_PRICE_IDS: '', // To be configured with actual Stripe price IDs
            },
            timeout: cdk.Duration.seconds(30),
            memorySize: 256,
            bundling: {
                externalModules: ['@aws-sdk/*'],
                forceDockerBundling: false,
            },
        });
        // Grant SSM parameter read permission for Stripe API key
        stripeApiKeyParameter.grantRead(this.createCheckoutSessionFunction);
        // Create Stripe Webhook Handler Lambda function
        this.stripeWebhookHandlerFunction = new lambdaNodeJs.NodejsFunction(this, 'StripeWebhookHandlerFunction', {
            functionName: `aura28-${props.environment}-stripe-webhook-handler`,
            entry: path.join(__dirname, '../../lambda/payments/stripe-webhook-handler.ts'),
            handler: 'handler',
            runtime: lambda.Runtime.NODEJS_20_X,
            environment: {
                STRIPE_API_KEY_PARAMETER_NAME: stripeApiKeyParameter.parameterName,
                STRIPE_WEBHOOK_SECRET_PARAMETER_NAME: stripeWebhookSecretParameter.parameterName,
                GENERATE_READING_FUNCTION_NAME: this.generateReadingFunction.functionName,
                WEBHOOK_PROCESSING_TABLE_NAME: props.readingsTable.tableName, // Reuse readings table for now
                INTERNAL_INVOCATION_SECRET: internalInvocationSecret,
            },
            timeout: cdk.Duration.seconds(30), // Reduced timeout for webhook processing
            memorySize: 256,
            bundling: {
                externalModules: ['@aws-sdk/*'],
                forceDockerBundling: false,
            },
        });
        // Grant permissions to webhook handler
        stripeApiKeyParameter.grantRead(this.stripeWebhookHandlerFunction);
        stripeWebhookSecretParameter.grantRead(this.stripeWebhookHandlerFunction);
        this.generateReadingFunction.grantInvoke(this.stripeWebhookHandlerFunction);
        props.readingsTable.grantReadWriteData(this.stripeWebhookHandlerFunction); // For idempotency tracking
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
        // Add /api/users/{userId}/checkout-session resource
        const checkoutSessionResource = userIdResource.addResource('checkout-session');
        checkoutSessionResource.addMethod('POST', new apigateway.LambdaIntegration(this.createCheckoutSessionFunction), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        // Add /api/webhooks/stripe resource (public, no authentication)
        const webhooksResource = apiResource.addResource('webhooks');
        const stripeWebhookResource = webhooksResource.addResource('stripe');
        // Configure webhook endpoint to handle raw body for signature verification
        const webhookIntegration = new apigateway.LambdaIntegration(this.stripeWebhookHandlerFunction, {
            // Pass the raw body to Lambda for signature verification
            passthroughBehavior: apigateway.PassthroughBehavior.WHEN_NO_MATCH,
            requestTemplates: {
                'application/json': '{"body": "$util.base64Encode($input.body)", "headers": $input.params().header}',
            },
        });
        const webhookMethod = stripeWebhookResource.addMethod('POST', webhookIntegration, {
            // No authorization - Stripe will call this endpoint directly
            authorizationType: apigateway.AuthorizationType.NONE,
            requestModels: {
                'application/json': apigateway.Model.EMPTY_MODEL,
            },
        });
        // Add rate limiting to prevent abuse
        const webhookThrottleSettings = {
            rateLimit: 100, // 100 requests per second
            burstLimit: 200, // Allow bursts up to 200 requests
        };
        // Create usage plan for webhook rate limiting
        new apigateway.UsagePlan(this, 'WebhookUsagePlan', {
            name: `aura28-${props.environment}-webhook-usage-plan`,
            description: 'Usage plan for Stripe webhook endpoint',
            throttle: webhookThrottleSettings,
            apiStages: [
                {
                    api: this.api,
                    stage: this.api.deploymentStage,
                    throttle: [
                        {
                            method: webhookMethod,
                            throttle: webhookThrottleSettings,
                        },
                    ],
                },
            ],
        });
        // Add /api/users/{userId}/readings resource
        const readingsResource = userIdResource.addResource('readings');
        // GET /api/users/{userId}/readings - List user's readings
        readingsResource.addMethod('GET', new apigateway.LambdaIntegration(this.getReadingsFunction), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        // POST endpoint for reading generation has been removed
        // Readings are now only generated through Stripe webhook after successful payment
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBpLWNvbnN0cnVjdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImFwaS1jb25zdHJ1Y3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSwyQ0FBdUM7QUFDdkMsaURBQW1DO0FBQ25DLHVFQUF5RDtBQUN6RCwrREFBaUQ7QUFDakQsNEVBQThEO0FBRzlELHlEQUEyQztBQUMzQyx5REFBMkM7QUFDM0MsdURBQXlDO0FBQ3pDLHdFQUEwRDtBQUMxRCwyQ0FBNkI7QUFhN0IsTUFBYSxZQUFhLFNBQVEsc0JBQVM7SUFDekIsR0FBRyxDQUFxQjtJQUN4QixzQkFBc0IsQ0FBa0I7SUFDeEMseUJBQXlCLENBQWtCO0lBQzNDLDBCQUEwQixDQUFrQjtJQUM1QyxxQkFBcUIsQ0FBa0I7SUFDdkMsdUJBQXVCLENBQWtCO0lBQ3pDLG1CQUFtQixDQUFrQjtJQUNyQyx3QkFBd0IsQ0FBa0I7SUFDMUMsMkJBQTJCLENBQWtCO0lBQzdDLHdCQUF3QixDQUFrQjtJQUMxQyw4QkFBOEIsQ0FBa0I7SUFDaEQsZ0NBQWdDLENBQWtCO0lBQ2xELDBCQUEwQixDQUFrQjtJQUM1Qyw2QkFBNkIsQ0FBa0I7SUFDL0MsNEJBQTRCLENBQWtCO0lBRTlELFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBd0I7UUFDaEUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQiwyQ0FBMkM7UUFDM0MsTUFBTSxZQUFZLEdBQUcsSUFBSSxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxjQUFjLEVBQUU7WUFDdkQsVUFBVSxFQUFFLFVBQVUsS0FBSyxDQUFDLFdBQVcsU0FBUztZQUNoRCxTQUFTLEVBQUUsSUFBSTtZQUNmLGlCQUFpQixFQUFFLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTO1lBQ2pELFVBQVUsRUFBRSxFQUFFLENBQUMsZ0JBQWdCLENBQUMsVUFBVTtZQUMxQyxhQUFhLEVBQ1gsS0FB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QUFpQixDQUFDLElBQUksQ0FBQyxnQ0FBZ0MsQ0FBQyxFQUN2RTtZQUNFLFVBQVU7WUFDVixpQkFBaUIsRUFBRSxVQUFVLENBQUMsaUJBQWlCLENBQUMsT0FBTztTQUN4RCxDQUNGLENBQUM7UUFFRixvREFBb0Q7UUFDcEQsTUFBTSxrQkFBa0IsR0FBRyxhQUFhLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQzlELGtCQUFrQixDQUFDLFNBQVMsQ0FDMUIsS0FBSyxFQUNMLElBQUksVUFBVSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxFQUMvRDtZQUNFLFVBQVU7WUFDVixpQkFBaUIsRUFBRSxVQUFVLENBQUMsaUJBQWlCLENBQUMsT0FBTztTQUN4RCxDQUNGLENBQUM7UUFFRixpQkFBaUI7UUFDakIsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxRQUFRLEVBQUU7WUFDaEMsS0FBSyxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRztZQUNuQixXQUFXLEVBQUUsaUJBQWlCO1NBQy9CLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsYUFBYSxFQUFFO1lBQ3JDLEtBQUssRUFBRSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyw0QkFBNEI7WUFDbEQsV0FBVyxFQUFFLDJCQUEyQjtTQUN6QyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUFudEJELG9DQW10QkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBhcGlnYXRld2F5IGZyb20gJ2F3cy1jZGstbGliL2F3cy1hcGlnYXRld2F5JztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcbmltcG9ydCAqIGFzIGxhbWJkYU5vZGVKcyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhLW5vZGVqcyc7XG5pbXBvcnQgKiBhcyBkeW5hbW9kYiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZHluYW1vZGInO1xuaW1wb3J0ICogYXMgY29nbml0byBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29nbml0byc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBzc20gZnJvbSAnYXdzLWNkay1saWIvYXdzLXNzbSc7XG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xuaW1wb3J0ICogYXMgczNkZXBsb3kgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzLWRlcGxveW1lbnQnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcblxuZXhwb3J0IGludGVyZmFjZSBBcGlDb25zdHJ1Y3RQcm9wcyB7XG4gIGVudmlyb25tZW50OiAnZGV2JyB8ICdwcm9kJztcbiAgdXNlclRhYmxlOiBkeW5hbW9kYi5UYWJsZTtcbiAgbmF0YWxDaGFydFRhYmxlOiBkeW5hbW9kYi5UYWJsZTtcbiAgcmVhZGluZ3NUYWJsZTogZHluYW1vZGIuVGFibGU7XG4gIHVzZXJQb29sOiBjb2duaXRvLlVzZXJQb29sO1xuICBwbGFjZUluZGV4TmFtZTogc3RyaW5nO1xuICBhbGxvd2VkT3JpZ2luczogc3RyaW5nW107XG4gIHN3aXNzRXBoZW1lcmlzTGF5ZXJBcm4/OiBzdHJpbmc7IC8vIE9wdGlvbmFsIHRvIHN1cHBvcnQgZ3JhZHVhbCBtaWdyYXRpb25cbn1cblxuZXhwb3J0IGNsYXNzIEFwaUNvbnN0cnVjdCBleHRlbmRzIENvbnN0cnVjdCB7XG4gIHB1YmxpYyByZWFkb25seSBhcGk6IGFwaWdhdGV3YXkuUmVzdEFwaTtcbiAgcHVibGljIHJlYWRvbmx5IGdldFVzZXJQcm9maWxlRnVuY3Rpb246IGxhbWJkYS5GdW5jdGlvbjtcbiAgcHVibGljIHJlYWRvbmx5IHVwZGF0ZVVzZXJQcm9maWxlRnVuY3Rpb246IGxhbWJkYS5GdW5jdGlvbjtcbiAgcHVibGljIHJlYWRvbmx5IGdlbmVyYXRlTmF0YWxDaGFydEZ1bmN0aW9uOiBsYW1iZGEuRnVuY3Rpb247XG4gIHB1YmxpYyByZWFkb25seSBnZXROYXRhbENoYXJ0RnVuY3Rpb246IGxhbWJkYS5GdW5jdGlvbjtcbiAgcHVibGljIHJlYWRvbmx5IGdlbmVyYXRlUmVhZGluZ0Z1bmN0aW9uOiBsYW1iZGEuRnVuY3Rpb247XG4gIHB1YmxpYyByZWFkb25seSBnZXRSZWFkaW5nc0Z1bmN0aW9uOiBsYW1iZGEuRnVuY3Rpb247XG4gIHB1YmxpYyByZWFkb25seSBnZXRSZWFkaW5nRGV0YWlsRnVuY3Rpb246IGxhbWJkYS5GdW5jdGlvbjtcbiAgcHVibGljIHJlYWRvbmx5IGFkbWluR2V0QWxsUmVhZGluZ3NGdW5jdGlvbjogbGFtYmRhLkZ1bmN0aW9uO1xuICBwdWJsaWMgcmVhZG9ubHkgYWRtaW5HZXRBbGxVc2Vyc0Z1bmN0aW9uOiBsYW1iZGEuRnVuY3Rpb247XG4gIHB1YmxpYyByZWFkb25seSBhZG1pbkdldFJlYWRpbmdEZXRhaWxzRnVuY3Rpb246IGxhbWJkYS5GdW5jdGlvbjtcbiAgcHVibGljIHJlYWRvbmx5IGFkbWluVXBkYXRlUmVhZGluZ1N0YXR1c0Z1bmN0aW9uOiBsYW1iZGEuRnVuY3Rpb247XG4gIHB1YmxpYyByZWFkb25seSBhZG1pbkRlbGV0ZVJlYWRpbmdGdW5jdGlvbjogbGFtYmRhLkZ1bmN0aW9uO1xuICBwdWJsaWMgcmVhZG9ubHkgY3JlYXRlQ2hlY2tvdXRTZXNzaW9uRnVuY3Rpb246IGxhbWJkYS5GdW5jdGlvbjtcbiAgcHVibGljIHJlYWRvbmx5IHN0cmlwZVdlYmhvb2tIYW5kbGVyRnVuY3Rpb246IGxhbWJkYS5GdW5jdGlvbjtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogQXBpQ29uc3RydWN0UHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgLy8gQ3JlYXRlIFMzIGJ1Y2tldCBmb3IgY29uZmlndXJhdGlvbiBmaWxlc1xuICAgIGNvbnN0IGNvbmZpZ0J1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ0NvbmZpZ0J1Y2tldCcsIHtcbiAgICAgIGJ1Y2tldE5hbWU6IGBhdXJhMjgtJHtwcm9wcy5lbnZpcm9ubWVudH0tY29uZmlnYCxcbiAgICAgIHZlcnNpb25lZDogdHJ1ZSxcbiAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBzMy5CbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTEwsXG4gICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRUQsXG4gICAgICByZW1vdmFsUG9saWN5OlxuICAgICAgICBwcm9wcy5lbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOIDogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIGF1dG9EZWxldGVPYmplY3RzOiBwcm9wcy5lbnZpcm9ubWVudCAhPT0gJ3Byb2QnLFxuICAgICAgbGlmZWN5Y2xlUnVsZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGlkOiAnZGVsZXRlLW9sZC12ZXJzaW9ucycsXG4gICAgICAgICAgbm9uY3VycmVudFZlcnNpb25FeHBpcmF0aW9uOiBjZGsuRHVyYXRpb24uZGF5cygzMCksXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gRGVwbG95IHByb21wdCBmaWxlcyB0byBTM1xuICAgIG5ldyBzM2RlcGxveS5CdWNrZXREZXBsb3ltZW50KHRoaXMsICdEZXBsb3lQcm9tcHRzJywge1xuICAgICAgc291cmNlczogW1xuICAgICAgICBzM2RlcGxveS5Tb3VyY2UuYXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2Fzc2V0cy9wcm9tcHRzJywgcHJvcHMuZW52aXJvbm1lbnQpKSxcbiAgICAgIF0sXG4gICAgICBkZXN0aW5hdGlvbkJ1Y2tldDogY29uZmlnQnVja2V0LFxuICAgICAgZGVzdGluYXRpb25LZXlQcmVmaXg6IGBwcm9tcHRzLyR7cHJvcHMuZW52aXJvbm1lbnR9YCxcbiAgICAgIHBydW5lOiBmYWxzZSxcbiAgICAgIHJldGFpbk9uRGVsZXRlOiBwcm9wcy5lbnZpcm9ubWVudCA9PT0gJ3Byb2QnLFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIFNTTSBQYXJhbWV0ZXJzIGZvciBPcGVuQUkgQ29uZmlndXJhdGlvblxuICAgIGNvbnN0IG9wZW5BaUFwaUtleVBhcmFtZXRlciA9IG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsICdPcGVuQWlBcGlLZXlQYXJhbWV0ZXInLCB7XG4gICAgICBwYXJhbWV0ZXJOYW1lOiBgL2F1cmEyOC8ke3Byb3BzLmVudmlyb25tZW50fS9vcGVuYWktYXBpLWtleWAsXG4gICAgICBkZXNjcmlwdGlvbjogYE9wZW5BSSBBUEkga2V5IGZvciAke3Byb3BzLmVudmlyb25tZW50fSBlbnZpcm9ubWVudGAsXG4gICAgICBzdHJpbmdWYWx1ZTogJ1BMQUNFSE9MREVSX1RPX0JFX1JFUExBQ0VEX01BTlVBTExZJyxcbiAgICAgIHRpZXI6IHNzbS5QYXJhbWV0ZXJUaWVyLlNUQU5EQVJELFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIFNTTSBQYXJhbWV0ZXJzIGZvciBTdHJpcGUgQ29uZmlndXJhdGlvblxuICAgIGNvbnN0IHN0cmlwZUFwaUtleVBhcmFtZXRlciA9IG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsICdTdHJpcGVBcGlLZXlQYXJhbWV0ZXInLCB7XG4gICAgICBwYXJhbWV0ZXJOYW1lOiBgL2F1cmEyOC8ke3Byb3BzLmVudmlyb25tZW50fS9zdHJpcGUvYXBpLWtleWAsXG4gICAgICBkZXNjcmlwdGlvbjogYFN0cmlwZSBBUEkga2V5IGZvciAke3Byb3BzLmVudmlyb25tZW50fSBlbnZpcm9ubWVudGAsXG4gICAgICBzdHJpbmdWYWx1ZTogJ1BMQUNFSE9MREVSX1RPX0JFX1JFUExBQ0VEX01BTlVBTExZJyxcbiAgICAgIHRpZXI6IHNzbS5QYXJhbWV0ZXJUaWVyLlNUQU5EQVJELFxuICAgIH0pO1xuXG4gICAgLy8gV2ViaG9vayBzZWNyZXQgcGFyYW1ldGVyIGZvciB3ZWJob29rIHNpZ25hdHVyZSB2ZXJpZmljYXRpb25cbiAgICBjb25zdCBzdHJpcGVXZWJob29rU2VjcmV0UGFyYW1ldGVyID0gbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIoXG4gICAgICB0aGlzLFxuICAgICAgJ1N0cmlwZVdlYmhvb2tTZWNyZXRQYXJhbWV0ZXInLFxuICAgICAge1xuICAgICAgICBwYXJhbWV0ZXJOYW1lOiBgL2F1cmEyOC8ke3Byb3BzLmVudmlyb25tZW50fS9zdHJpcGUvd2ViaG9vay1zZWNyZXRgLFxuICAgICAgICBkZXNjcmlwdGlvbjogYFN0cmlwZSB3ZWJob29rIHNlY3JldCBmb3IgJHtwcm9wcy5lbnZpcm9ubWVudH0gZW52aXJvbm1lbnRgLFxuICAgICAgICBzdHJpbmdWYWx1ZTogJ1BMQUNFSE9MREVSX1RPX0JFX1JFUExBQ0VEX01BTlVBTExZJyxcbiAgICAgICAgdGllcjogc3NtLlBhcmFtZXRlclRpZXIuU1RBTkRBUkQsXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBTaW1wbGlmaWVkIFNTTSBwYXJhbWV0ZXJzIHBvaW50aW5nIHRvIFMzIGtleXNcbiAgICBjb25zdCByZWFkaW5nTW9kZWxQYXJhbWV0ZXIgPSBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcih0aGlzLCAnUmVhZGluZ01vZGVsUGFyYW1ldGVyJywge1xuICAgICAgcGFyYW1ldGVyTmFtZTogYC9hdXJhMjgvJHtwcm9wcy5lbnZpcm9ubWVudH0vcmVhZGluZy9tb2RlbGAsXG4gICAgICBkZXNjcmlwdGlvbjogYE9wZW5BSSBtb2RlbCBmb3IgcmVhZGluZ3MgaW4gJHtwcm9wcy5lbnZpcm9ubWVudH0gZW52aXJvbm1lbnRgLFxuICAgICAgc3RyaW5nVmFsdWU6ICdncHQtNC10dXJiby1wcmV2aWV3JyxcbiAgICAgIHRpZXI6IHNzbS5QYXJhbWV0ZXJUaWVyLlNUQU5EQVJELFxuICAgIH0pO1xuXG4gICAgY29uc3QgcmVhZGluZ1RlbXBlcmF0dXJlUGFyYW1ldGVyID0gbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIoXG4gICAgICB0aGlzLFxuICAgICAgJ1JlYWRpbmdUZW1wZXJhdHVyZVBhcmFtZXRlcicsXG4gICAgICB7XG4gICAgICAgIHBhcmFtZXRlck5hbWU6IGAvYXVyYTI4LyR7cHJvcHMuZW52aXJvbm1lbnR9L3JlYWRpbmcvdGVtcGVyYXR1cmVgLFxuICAgICAgICBkZXNjcmlwdGlvbjogYFRlbXBlcmF0dXJlIGZvciByZWFkaW5ncyBpbiAke3Byb3BzLmVudmlyb25tZW50fSBlbnZpcm9ubWVudGAsXG4gICAgICAgIHN0cmluZ1ZhbHVlOiAnMC43JyxcbiAgICAgICAgdGllcjogc3NtLlBhcmFtZXRlclRpZXIuU1RBTkRBUkQsXG4gICAgICB9LFxuICAgICk7XG5cbiAgICBjb25zdCByZWFkaW5nTWF4VG9rZW5zUGFyYW1ldGVyID0gbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgJ1JlYWRpbmdNYXhUb2tlbnNQYXJhbWV0ZXInLCB7XG4gICAgICBwYXJhbWV0ZXJOYW1lOiBgL2F1cmEyOC8ke3Byb3BzLmVudmlyb25tZW50fS9yZWFkaW5nL21heF90b2tlbnNgLFxuICAgICAgZGVzY3JpcHRpb246IGBNYXggdG9rZW5zIGZvciByZWFkaW5ncyBpbiAke3Byb3BzLmVudmlyb25tZW50fSBlbnZpcm9ubWVudGAsXG4gICAgICBzdHJpbmdWYWx1ZTogJzIwMDAnLFxuICAgICAgdGllcjogc3NtLlBhcmFtZXRlclRpZXIuU1RBTkRBUkQsXG4gICAgfSk7XG5cbiAgICBjb25zdCBzeXN0ZW1Qcm9tcHRTM0tleVBhcmFtZXRlciA9IG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsICdTeXN0ZW1Qcm9tcHRTM0tleVBhcmFtZXRlcicsIHtcbiAgICAgIHBhcmFtZXRlck5hbWU6IGAvYXVyYTI4LyR7cHJvcHMuZW52aXJvbm1lbnR9L3JlYWRpbmcvc3lzdGVtX3Byb21wdF9zM2tleWAsXG4gICAgICBkZXNjcmlwdGlvbjogYFMzIGtleSBmb3Igc3lzdGVtIHByb21wdCBpbiAke3Byb3BzLmVudmlyb25tZW50fSBlbnZpcm9ubWVudGAsXG4gICAgICBzdHJpbmdWYWx1ZTogYHByb21wdHMvJHtwcm9wcy5lbnZpcm9ubWVudH0vc291bF9ibHVlcHJpbnQvc3lzdGVtLnR4dGAsXG4gICAgICB0aWVyOiBzc20uUGFyYW1ldGVyVGllci5TVEFOREFSRCxcbiAgICB9KTtcblxuICAgIGNvbnN0IHVzZXJQcm9tcHRTM0tleVBhcmFtZXRlciA9IG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsICdVc2VyUHJvbXB0UzNLZXlQYXJhbWV0ZXInLCB7XG4gICAgICBwYXJhbWV0ZXJOYW1lOiBgL2F1cmEyOC8ke3Byb3BzLmVudmlyb25tZW50fS9yZWFkaW5nL3VzZXJfcHJvbXB0X3Mza2V5YCxcbiAgICAgIGRlc2NyaXB0aW9uOiBgUzMga2V5IGZvciB1c2VyIHByb21wdCB0ZW1wbGF0ZSBpbiAke3Byb3BzLmVudmlyb25tZW50fSBlbnZpcm9ubWVudGAsXG4gICAgICBzdHJpbmdWYWx1ZTogYHByb21wdHMvJHtwcm9wcy5lbnZpcm9ubWVudH0vc291bF9ibHVlcHJpbnQvdXNlcl90ZW1wbGF0ZS5tZGAsXG4gICAgICB0aWVyOiBzc20uUGFyYW1ldGVyVGllci5TVEFOREFSRCxcbiAgICB9KTtcblxuICAgIC8vIFVzZSBwcmUtYnVpbHQgU3dpc3MgRXBoZW1lcmlzIExhbWJkYSBMYXllclxuICAgIC8vIFRoZSBsYXllciBpcyBidWlsdCB2aWEgQ29kZUJ1aWxkIG9uIEFtYXpvbiBMaW51eCAyMDIzIGZvciBiaW5hcnkgY29tcGF0aWJpbGl0eVxuICAgIC8vIFVzZSBwcm9wIGlmIHByb3ZpZGVkIChuZXcgZGVwbG95bWVudHMpLCBvdGhlcndpc2UgZmFsbCBiYWNrIHRvIFNTTSAoZXhpc3RpbmcgZGVwbG95bWVudHMpXG4gICAgY29uc3Qgc3dpc3NFcGhlbWVyaXNMYXllckFybiA9XG4gICAgICBwcm9wcy5zd2lzc0VwaGVtZXJpc0xheWVyQXJuIHx8XG4gICAgICBzc20uU3RyaW5nUGFyYW1ldGVyLnZhbHVlRm9yU3RyaW5nUGFyYW1ldGVyKFxuICAgICAgICB0aGlzLFxuICAgICAgICBgL2F1cmEyOC8ke3Byb3BzLmVudmlyb25tZW50fS9sYXllcnMvc3dldGVzdC1hcm5gLFxuICAgICAgKTtcblxuICAgIGNvbnN0IHN3aXNzRXBoZW1lcmlzTGF5ZXIgPSBsYW1iZGEuTGF5ZXJWZXJzaW9uLmZyb21MYXllclZlcnNpb25Bcm4oXG4gICAgICB0aGlzLFxuICAgICAgJ1N3aXNzRXBoZW1lcmlzTGF5ZXInLFxuICAgICAgc3dpc3NFcGhlbWVyaXNMYXllckFybixcbiAgICApO1xuXG4gICAgLy8gQ3JlYXRlIExhbWJkYSBmdW5jdGlvbnNcbiAgICB0aGlzLmdldFVzZXJQcm9maWxlRnVuY3Rpb24gPSBuZXcgbGFtYmRhTm9kZUpzLk5vZGVqc0Z1bmN0aW9uKHRoaXMsICdHZXRVc2VyUHJvZmlsZUZ1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LWdldC11c2VyLXByb2ZpbGVgLFxuICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9sYW1iZGEvdXNlci1wcm9maWxlL2dldC11c2VyLXByb2ZpbGUudHMnKSxcbiAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgVEFCTEVfTkFNRTogcHJvcHMudXNlclRhYmxlLnRhYmxlTmFtZSxcbiAgICAgIH0sXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICBtZW1vcnlTaXplOiAyNTYsXG4gICAgICBidW5kbGluZzoge1xuICAgICAgICBleHRlcm5hbE1vZHVsZXM6IFsnQGF3cy1zZGsvKiddLFxuICAgICAgICBmb3JjZURvY2tlckJ1bmRsaW5nOiBmYWxzZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgZ2VuZXJhdGVOYXRhbENoYXJ0RnVuY3Rpb24gZmlyc3QsIGJlZm9yZSB1cGRhdGVVc2VyUHJvZmlsZUZ1bmN0aW9uIHRoYXQgcmVmZXJlbmNlcyBpdFxuICAgIHRoaXMuZ2VuZXJhdGVOYXRhbENoYXJ0RnVuY3Rpb24gPSBuZXcgbGFtYmRhTm9kZUpzLk5vZGVqc0Z1bmN0aW9uKFxuICAgICAgdGhpcyxcbiAgICAgICdHZW5lcmF0ZU5hdGFsQ2hhcnRGdW5jdGlvbicsXG4gICAgICB7XG4gICAgICAgIGZ1bmN0aW9uTmFtZTogYGF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS1nZW5lcmF0ZS1uYXRhbC1jaGFydGAsXG4gICAgICAgIGVudHJ5OiBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vbGFtYmRhL25hdGFsLWNoYXJ0L2dlbmVyYXRlLW5hdGFsLWNoYXJ0LnRzJyksXG4gICAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcbiAgICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXG4gICAgICAgIGxheWVyczogW3N3aXNzRXBoZW1lcmlzTGF5ZXJdLFxuICAgICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICAgIE5BVEFMX0NIQVJUX1RBQkxFX05BTUU6IHByb3BzLm5hdGFsQ2hhcnRUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgICAgRVBIRU1FUklTX1BBVEg6ICcvb3B0L25vZGVqcy9ub2RlX21vZHVsZXMvc3dpc3NlcGgvZXBoZScsXG4gICAgICAgICAgU0VfRVBIRV9QQVRIOiAnL29wdC9ub2RlanMvbm9kZV9tb2R1bGVzL3N3aXNzZXBoL2VwaGUnLFxuICAgICAgICAgIE5PREVfRU5WOiAncHJvZHVjdGlvbicsIC8vIEVuc3VyZSBwcm9kdWN0aW9uIG1vZGVcbiAgICAgICAgfSxcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMTApLCAvLyAxMCBzZWNvbmRzIGZvciBob3VzZSBjYWxjdWxhdGlvbnNcbiAgICAgICAgbWVtb3J5U2l6ZTogNTEyLCAvLyBJbmNyZWFzZWQgbWVtb3J5IGZvciBlcGhlbWVyaXMgY2FsY3VsYXRpb25zXG4gICAgICAgIGJ1bmRsaW5nOiB7XG4gICAgICAgICAgZXh0ZXJuYWxNb2R1bGVzOiBbJ0Bhd3Mtc2RrLyonLCAnc3dpc3NlcGgnXSwgLy8gRXhjbHVkZSBzd2lzc2VwaCBzaW5jZSBpdCdzIGluIHRoZSBsYXllclxuICAgICAgICAgIGZvcmNlRG9ja2VyQnVuZGxpbmc6IGZhbHNlLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgdGhpcy51cGRhdGVVc2VyUHJvZmlsZUZ1bmN0aW9uID0gbmV3IGxhbWJkYU5vZGVKcy5Ob2RlanNGdW5jdGlvbihcbiAgICAgIHRoaXMsXG4gICAgICAnVXBkYXRlVXNlclByb2ZpbGVGdW5jdGlvbicsXG4gICAgICB7XG4gICAgICAgIGZ1bmN0aW9uTmFtZTogYGF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS11cGRhdGUtdXNlci1wcm9maWxlYCxcbiAgICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9sYW1iZGEvdXNlci1wcm9maWxlL3VwZGF0ZS11c2VyLXByb2ZpbGUudHMnKSxcbiAgICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxuICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCxcbiAgICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICBUQUJMRV9OQU1FOiBwcm9wcy51c2VyVGFibGUudGFibGVOYW1lLFxuICAgICAgICAgIFBMQUNFX0lOREVYX05BTUU6IHByb3BzLnBsYWNlSW5kZXhOYW1lLFxuICAgICAgICAgIEdFTkVSQVRFX05BVEFMX0NIQVJUX0ZVTkNUSU9OX05BTUU6IHRoaXMuZ2VuZXJhdGVOYXRhbENoYXJ0RnVuY3Rpb24uZnVuY3Rpb25OYW1lLFxuICAgICAgICB9LFxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICAgIG1lbW9yeVNpemU6IDI1NixcbiAgICAgICAgYnVuZGxpbmc6IHtcbiAgICAgICAgICBleHRlcm5hbE1vZHVsZXM6IFsnQGF3cy1zZGsvKiddLFxuICAgICAgICAgIGZvcmNlRG9ja2VyQnVuZGxpbmc6IGZhbHNlLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gR3JhbnQgRHluYW1vREIgcGVybWlzc2lvbnNcbiAgICBwcm9wcy51c2VyVGFibGUuZ3JhbnRSZWFkRGF0YSh0aGlzLmdldFVzZXJQcm9maWxlRnVuY3Rpb24pO1xuICAgIHByb3BzLnVzZXJUYWJsZS5ncmFudFdyaXRlRGF0YSh0aGlzLnVwZGF0ZVVzZXJQcm9maWxlRnVuY3Rpb24pO1xuICAgIHByb3BzLm5hdGFsQ2hhcnRUYWJsZS5ncmFudFdyaXRlRGF0YSh0aGlzLmdlbmVyYXRlTmF0YWxDaGFydEZ1bmN0aW9uKTtcblxuICAgIHRoaXMuZ2V0TmF0YWxDaGFydEZ1bmN0aW9uID0gbmV3IGxhbWJkYU5vZGVKcy5Ob2RlanNGdW5jdGlvbih0aGlzLCAnR2V0TmF0YWxDaGFydEZ1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LWdldC1uYXRhbC1jaGFydGAsXG4gICAgICBlbnRyeTogcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2xhbWJkYS9uYXRhbC1jaGFydC9nZXQtbmF0YWwtY2hhcnQudHMnKSxcbiAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgTkFUQUxfQ0hBUlRfVEFCTEVfTkFNRTogcHJvcHMubmF0YWxDaGFydFRhYmxlLnRhYmxlTmFtZSxcbiAgICAgIH0sXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICBtZW1vcnlTaXplOiAyNTYsXG4gICAgICBidW5kbGluZzoge1xuICAgICAgICBleHRlcm5hbE1vZHVsZXM6IFsnQGF3cy1zZGsvKiddLFxuICAgICAgICBmb3JjZURvY2tlckJ1bmRsaW5nOiBmYWxzZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBwcm9wcy5uYXRhbENoYXJ0VGFibGUuZ3JhbnRSZWFkRGF0YSh0aGlzLmdldE5hdGFsQ2hhcnRGdW5jdGlvbik7XG5cbiAgICAvLyBHcmFudCBpbnZvY2F0aW9uIHBlcm1pc3Npb25cbiAgICB0aGlzLmdlbmVyYXRlTmF0YWxDaGFydEZ1bmN0aW9uLmdyYW50SW52b2tlKHRoaXMudXBkYXRlVXNlclByb2ZpbGVGdW5jdGlvbik7XG5cbiAgICAvLyBHZW5lcmF0ZSBhIHVuaXF1ZSBpbnRlcm5hbCBpbnZvY2F0aW9uIHNlY3JldCBmb3IgdGhpcyBlbnZpcm9ubWVudCAoZGVmaW5lZCBlYXJseSBmb3IgYm90aCBmdW5jdGlvbnMpXG4gICAgY29uc3QgaW50ZXJuYWxJbnZvY2F0aW9uU2VjcmV0ID0gYHdlYmhvb2staW50ZXJuYWwtJHtwcm9wcy5lbnZpcm9ubWVudH0tJHtjZGsuU3RhY2sub2YodGhpcykuc3RhY2tJZH1gO1xuXG4gICAgLy8gQ3JlYXRlIExhbWJkYSBmdW5jdGlvbnMgZm9yIHJlYWRpbmdzXG4gICAgdGhpcy5nZW5lcmF0ZVJlYWRpbmdGdW5jdGlvbiA9IG5ldyBsYW1iZGFOb2RlSnMuTm9kZWpzRnVuY3Rpb24oXG4gICAgICB0aGlzLFxuICAgICAgJ0dlbmVyYXRlUmVhZGluZ0Z1bmN0aW9uJyxcbiAgICAgIHtcbiAgICAgICAgZnVuY3Rpb25OYW1lOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LWdlbmVyYXRlLXJlYWRpbmdgLFxuICAgICAgICBlbnRyeTogcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2xhbWJkYS9yZWFkaW5ncy9nZW5lcmF0ZS1yZWFkaW5nLnRzJyksXG4gICAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcbiAgICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXG4gICAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgICAgUkVBRElOR1NfVEFCTEVfTkFNRTogcHJvcHMucmVhZGluZ3NUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgICAgTkFUQUxfQ0hBUlRfVEFCTEVfTkFNRTogcHJvcHMubmF0YWxDaGFydFRhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgICBVU0VSX1RBQkxFX05BTUU6IHByb3BzLnVzZXJUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgICAgQ09ORklHX0JVQ0tFVF9OQU1FOiBjb25maWdCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgICAgICBPUEVOQUlfQVBJX0tFWV9QQVJBTUVURVJfTkFNRTogb3BlbkFpQXBpS2V5UGFyYW1ldGVyLnBhcmFtZXRlck5hbWUsXG4gICAgICAgICAgUkVBRElOR19NT0RFTF9QQVJBTUVURVJfTkFNRTogcmVhZGluZ01vZGVsUGFyYW1ldGVyLnBhcmFtZXRlck5hbWUsXG4gICAgICAgICAgUkVBRElOR19URU1QRVJBVFVSRV9QQVJBTUVURVJfTkFNRTogcmVhZGluZ1RlbXBlcmF0dXJlUGFyYW1ldGVyLnBhcmFtZXRlck5hbWUsXG4gICAgICAgICAgUkVBRElOR19NQVhfVE9LRU5TX1BBUkFNRVRFUl9OQU1FOiByZWFkaW5nTWF4VG9rZW5zUGFyYW1ldGVyLnBhcmFtZXRlck5hbWUsXG4gICAgICAgICAgU1lTVEVNX1BST01QVF9TM0tFWV9QQVJBTUVURVJfTkFNRTogc3lzdGVtUHJvbXB0UzNLZXlQYXJhbWV0ZXIucGFyYW1ldGVyTmFtZSxcbiAgICAgICAgICBVU0VSX1BST01QVF9TM0tFWV9QQVJBTUVURVJfTkFNRTogdXNlclByb21wdFMzS2V5UGFyYW1ldGVyLnBhcmFtZXRlck5hbWUsXG4gICAgICAgICAgSU5URVJOQUxfSU5WT0NBVElPTl9TRUNSRVQ6IGludGVybmFsSW52b2NhdGlvblNlY3JldCxcbiAgICAgICAgfSxcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMTIwKSwgLy8gRXh0ZW5kZWQgdGltZW91dCBmb3IgT3BlbkFJIEFQSSBjYWxsc1xuICAgICAgICBtZW1vcnlTaXplOiA1MTIsXG4gICAgICAgIGJ1bmRsaW5nOiB7XG4gICAgICAgICAgZXh0ZXJuYWxNb2R1bGVzOiBbJ0Bhd3Mtc2RrLyonXSxcbiAgICAgICAgICBmb3JjZURvY2tlckJ1bmRsaW5nOiBmYWxzZSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIHRoaXMuZ2V0UmVhZGluZ3NGdW5jdGlvbiA9IG5ldyBsYW1iZGFOb2RlSnMuTm9kZWpzRnVuY3Rpb24odGhpcywgJ0dldFJlYWRpbmdzRnVuY3Rpb24nLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6IGBhdXJhMjgtJHtwcm9wcy5lbnZpcm9ubWVudH0tZ2V0LXJlYWRpbmdzYCxcbiAgICAgIGVudHJ5OiBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vbGFtYmRhL3JlYWRpbmdzL2dldC1yZWFkaW5ncy50cycpLFxuICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBSRUFESU5HU19UQUJMRV9OQU1FOiBwcm9wcy5yZWFkaW5nc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgIH0sXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICBtZW1vcnlTaXplOiAyNTYsXG4gICAgICBidW5kbGluZzoge1xuICAgICAgICBleHRlcm5hbE1vZHVsZXM6IFsnQGF3cy1zZGsvKiddLFxuICAgICAgICBmb3JjZURvY2tlckJ1bmRsaW5nOiBmYWxzZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICB0aGlzLmdldFJlYWRpbmdEZXRhaWxGdW5jdGlvbiA9IG5ldyBsYW1iZGFOb2RlSnMuTm9kZWpzRnVuY3Rpb24oXG4gICAgICB0aGlzLFxuICAgICAgJ0dldFJlYWRpbmdEZXRhaWxGdW5jdGlvbicsXG4gICAgICB7XG4gICAgICAgIGZ1bmN0aW9uTmFtZTogYGF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS1nZXQtcmVhZGluZy1kZXRhaWxgLFxuICAgICAgICBlbnRyeTogcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2xhbWJkYS9yZWFkaW5ncy9nZXQtcmVhZGluZy1kZXRhaWwudHMnKSxcbiAgICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxuICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCxcbiAgICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICBSRUFESU5HU19UQUJMRV9OQU1FOiBwcm9wcy5yZWFkaW5nc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgfSxcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgICBtZW1vcnlTaXplOiAyNTYsXG4gICAgICAgIGJ1bmRsaW5nOiB7XG4gICAgICAgICAgZXh0ZXJuYWxNb2R1bGVzOiBbJ0Bhd3Mtc2RrLyonXSxcbiAgICAgICAgICBmb3JjZURvY2tlckJ1bmRsaW5nOiBmYWxzZSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIEdyYW50IER5bmFtb0RCIHBlcm1pc3Npb25zIGZvciByZWFkaW5nc1xuICAgIHByb3BzLnJlYWRpbmdzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHRoaXMuZ2VuZXJhdGVSZWFkaW5nRnVuY3Rpb24pO1xuICAgIHByb3BzLnJlYWRpbmdzVGFibGUuZ3JhbnRSZWFkRGF0YSh0aGlzLmdldFJlYWRpbmdzRnVuY3Rpb24pO1xuICAgIHByb3BzLnJlYWRpbmdzVGFibGUuZ3JhbnRSZWFkRGF0YSh0aGlzLmdldFJlYWRpbmdEZXRhaWxGdW5jdGlvbik7XG4gICAgcHJvcHMubmF0YWxDaGFydFRhYmxlLmdyYW50UmVhZERhdGEodGhpcy5nZW5lcmF0ZVJlYWRpbmdGdW5jdGlvbik7XG4gICAgcHJvcHMudXNlclRhYmxlLmdyYW50UmVhZERhdGEodGhpcy5nZW5lcmF0ZVJlYWRpbmdGdW5jdGlvbik7XG5cbiAgICAvLyBHcmFudCBwZXJtaXNzaW9ucyB0byBnZW5lcmF0ZSByZWFkaW5nIGZ1bmN0aW9uXG4gICAgLy8gU1NNIHBhcmFtZXRlciByZWFkIHBlcm1pc3Npb25zXG4gICAgb3BlbkFpQXBpS2V5UGFyYW1ldGVyLmdyYW50UmVhZCh0aGlzLmdlbmVyYXRlUmVhZGluZ0Z1bmN0aW9uKTtcbiAgICByZWFkaW5nTW9kZWxQYXJhbWV0ZXIuZ3JhbnRSZWFkKHRoaXMuZ2VuZXJhdGVSZWFkaW5nRnVuY3Rpb24pO1xuICAgIHJlYWRpbmdUZW1wZXJhdHVyZVBhcmFtZXRlci5ncmFudFJlYWQodGhpcy5nZW5lcmF0ZVJlYWRpbmdGdW5jdGlvbik7XG4gICAgcmVhZGluZ01heFRva2Vuc1BhcmFtZXRlci5ncmFudFJlYWQodGhpcy5nZW5lcmF0ZVJlYWRpbmdGdW5jdGlvbik7XG4gICAgc3lzdGVtUHJvbXB0UzNLZXlQYXJhbWV0ZXIuZ3JhbnRSZWFkKHRoaXMuZ2VuZXJhdGVSZWFkaW5nRnVuY3Rpb24pO1xuICAgIHVzZXJQcm9tcHRTM0tleVBhcmFtZXRlci5ncmFudFJlYWQodGhpcy5nZW5lcmF0ZVJlYWRpbmdGdW5jdGlvbik7XG5cbiAgICAvLyBTMyBidWNrZXQgcmVhZCBwZXJtaXNzaW9ucyBmb3IgY29uZmlndXJhdGlvbiBmaWxlc1xuICAgIGNvbmZpZ0J1Y2tldC5ncmFudFJlYWQodGhpcy5nZW5lcmF0ZVJlYWRpbmdGdW5jdGlvbik7XG5cbiAgICAvLyBDcmVhdGUgQWRtaW4gTGFtYmRhIGZ1bmN0aW9uc1xuICAgIHRoaXMuYWRtaW5HZXRBbGxSZWFkaW5nc0Z1bmN0aW9uID0gbmV3IGxhbWJkYU5vZGVKcy5Ob2RlanNGdW5jdGlvbihcbiAgICAgIHRoaXMsXG4gICAgICAnQWRtaW5HZXRBbGxSZWFkaW5nc0Z1bmN0aW9uJyxcbiAgICAgIHtcbiAgICAgICAgZnVuY3Rpb25OYW1lOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LWFkbWluLWdldC1hbGwtcmVhZGluZ3NgLFxuICAgICAgICBlbnRyeTogcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2xhbWJkYS9hZG1pbi9nZXQtYWxsLXJlYWRpbmdzLnRzJyksXG4gICAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcbiAgICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXG4gICAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgICAgUkVBRElOR1NfVEFCTEVfTkFNRTogcHJvcHMucmVhZGluZ3NUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgICAgVVNFUl9UQUJMRV9OQU1FOiBwcm9wcy51c2VyVGFibGUudGFibGVOYW1lLFxuICAgICAgICB9LFxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICAgIG1lbW9yeVNpemU6IDUxMixcbiAgICAgICAgYnVuZGxpbmc6IHtcbiAgICAgICAgICBleHRlcm5hbE1vZHVsZXM6IFsnQGF3cy1zZGsvKiddLFxuICAgICAgICAgIGZvcmNlRG9ja2VyQnVuZGxpbmc6IGZhbHNlLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgdGhpcy5hZG1pbkdldEFsbFVzZXJzRnVuY3Rpb24gPSBuZXcgbGFtYmRhTm9kZUpzLk5vZGVqc0Z1bmN0aW9uKFxuICAgICAgdGhpcyxcbiAgICAgICdBZG1pbkdldEFsbFVzZXJzRnVuY3Rpb24nLFxuICAgICAge1xuICAgICAgICBmdW5jdGlvbk5hbWU6IGBhdXJhMjgtJHtwcm9wcy5lbnZpcm9ubWVudH0tYWRtaW4tZ2V0LWFsbC11c2Vyc2AsXG4gICAgICAgIGVudHJ5OiBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vbGFtYmRhL2FkbWluL2dldC1hbGwtdXNlcnMudHMnKSxcbiAgICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxuICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCxcbiAgICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICBVU0VSX1BPT0xfSUQ6IHByb3BzLnVzZXJQb29sLnVzZXJQb29sSWQsXG4gICAgICAgIH0sXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgICAgbWVtb3J5U2l6ZTogMjU2LFxuICAgICAgICBidW5kbGluZzoge1xuICAgICAgICAgIGV4dGVybmFsTW9kdWxlczogWydAYXdzLXNkay8qJ10sXG4gICAgICAgICAgZm9yY2VEb2NrZXJCdW5kbGluZzogZmFsc2UsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBDcmVhdGUgYWRkaXRpb25hbCBhZG1pbiBMYW1iZGEgZnVuY3Rpb25zXG4gICAgdGhpcy5hZG1pbkdldFJlYWRpbmdEZXRhaWxzRnVuY3Rpb24gPSBuZXcgbGFtYmRhTm9kZUpzLk5vZGVqc0Z1bmN0aW9uKFxuICAgICAgdGhpcyxcbiAgICAgICdBZG1pbkdldFJlYWRpbmdEZXRhaWxzRnVuY3Rpb24nLFxuICAgICAge1xuICAgICAgICBmdW5jdGlvbk5hbWU6IGBhdXJhMjgtJHtwcm9wcy5lbnZpcm9ubWVudH0tYWRtaW4tZ2V0LXJlYWRpbmctZGV0YWlsc2AsXG4gICAgICAgIGVudHJ5OiBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vbGFtYmRhL2FkbWluL2dldC1yZWFkaW5nLWRldGFpbHMudHMnKSxcbiAgICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxuICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCxcbiAgICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICBSRUFESU5HU19UQUJMRV9OQU1FOiBwcm9wcy5yZWFkaW5nc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgICBVU0VSX1RBQkxFX05BTUU6IHByb3BzLnVzZXJUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIH0sXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgICAgbWVtb3J5U2l6ZTogMjU2LFxuICAgICAgICBidW5kbGluZzoge1xuICAgICAgICAgIGV4dGVybmFsTW9kdWxlczogWydAYXdzLXNkay8qJ10sXG4gICAgICAgICAgZm9yY2VEb2NrZXJCdW5kbGluZzogZmFsc2UsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICB0aGlzLmFkbWluVXBkYXRlUmVhZGluZ1N0YXR1c0Z1bmN0aW9uID0gbmV3IGxhbWJkYU5vZGVKcy5Ob2RlanNGdW5jdGlvbihcbiAgICAgIHRoaXMsXG4gICAgICAnQWRtaW5VcGRhdGVSZWFkaW5nU3RhdHVzRnVuY3Rpb24nLFxuICAgICAge1xuICAgICAgICBmdW5jdGlvbk5hbWU6IGBhdXJhMjgtJHtwcm9wcy5lbnZpcm9ubWVudH0tYWRtaW4tdXBkYXRlLXJlYWRpbmctc3RhdHVzYCxcbiAgICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9sYW1iZGEvYWRtaW4vdXBkYXRlLXJlYWRpbmctc3RhdHVzLnRzJyksXG4gICAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcbiAgICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXG4gICAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgICAgUkVBRElOR1NfVEFCTEVfTkFNRTogcHJvcHMucmVhZGluZ3NUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIH0sXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgICAgbWVtb3J5U2l6ZTogMjU2LFxuICAgICAgICBidW5kbGluZzoge1xuICAgICAgICAgIGV4dGVybmFsTW9kdWxlczogWydAYXdzLXNkay8qJ10sXG4gICAgICAgICAgZm9yY2VEb2NrZXJCdW5kbGluZzogZmFsc2UsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICB0aGlzLmFkbWluRGVsZXRlUmVhZGluZ0Z1bmN0aW9uID0gbmV3IGxhbWJkYU5vZGVKcy5Ob2RlanNGdW5jdGlvbihcbiAgICAgIHRoaXMsXG4gICAgICAnQWRtaW5EZWxldGVSZWFkaW5nRnVuY3Rpb24nLFxuICAgICAge1xuICAgICAgICBmdW5jdGlvbk5hbWU6IGBhdXJhMjgtJHtwcm9wcy5lbnZpcm9ubWVudH0tYWRtaW4tZGVsZXRlLXJlYWRpbmdgLFxuICAgICAgICBlbnRyeTogcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2xhbWJkYS9hZG1pbi9kZWxldGUtcmVhZGluZy50cycpLFxuICAgICAgICBoYW5kbGVyOiAnaGFuZGxlcicsXG4gICAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxuICAgICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICAgIFJFQURJTkdTX1RBQkxFX05BTUU6IHByb3BzLnJlYWRpbmdzVGFibGUudGFibGVOYW1lLFxuICAgICAgICB9LFxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICAgIG1lbW9yeVNpemU6IDI1NixcbiAgICAgICAgYnVuZGxpbmc6IHtcbiAgICAgICAgICBleHRlcm5hbE1vZHVsZXM6IFsnQGF3cy1zZGsvKiddLFxuICAgICAgICAgIGZvcmNlRG9ja2VyQnVuZGxpbmc6IGZhbHNlLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gR3JhbnQgRHluYW1vREIgcGVybWlzc2lvbnMgZm9yIGFkbWluIGZ1bmN0aW9uc1xuICAgIHByb3BzLnJlYWRpbmdzVGFibGUuZ3JhbnRSZWFkRGF0YSh0aGlzLmFkbWluR2V0QWxsUmVhZGluZ3NGdW5jdGlvbik7XG4gICAgcHJvcHMudXNlclRhYmxlLmdyYW50UmVhZERhdGEodGhpcy5hZG1pbkdldEFsbFJlYWRpbmdzRnVuY3Rpb24pO1xuICAgIHByb3BzLnJlYWRpbmdzVGFibGUuZ3JhbnRSZWFkRGF0YSh0aGlzLmFkbWluR2V0UmVhZGluZ0RldGFpbHNGdW5jdGlvbik7XG4gICAgcHJvcHMudXNlclRhYmxlLmdyYW50UmVhZERhdGEodGhpcy5hZG1pbkdldFJlYWRpbmdEZXRhaWxzRnVuY3Rpb24pO1xuICAgIHByb3BzLnJlYWRpbmdzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHRoaXMuYWRtaW5VcGRhdGVSZWFkaW5nU3RhdHVzRnVuY3Rpb24pO1xuICAgIHByb3BzLnJlYWRpbmdzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHRoaXMuYWRtaW5EZWxldGVSZWFkaW5nRnVuY3Rpb24pO1xuXG4gICAgLy8gQ3JlYXRlIFN0cmlwZSBDaGVja291dCBTZXNzaW9uIExhbWJkYSBmdW5jdGlvblxuICAgIHRoaXMuY3JlYXRlQ2hlY2tvdXRTZXNzaW9uRnVuY3Rpb24gPSBuZXcgbGFtYmRhTm9kZUpzLk5vZGVqc0Z1bmN0aW9uKFxuICAgICAgdGhpcyxcbiAgICAgICdDcmVhdGVDaGVja291dFNlc3Npb25GdW5jdGlvbicsXG4gICAgICB7XG4gICAgICAgIGZ1bmN0aW9uTmFtZTogYGF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS1jcmVhdGUtY2hlY2tvdXQtc2Vzc2lvbmAsXG4gICAgICAgIGVudHJ5OiBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vbGFtYmRhL3BheW1lbnRzL2NyZWF0ZS1jaGVja291dC1zZXNzaW9uLnRzJyksXG4gICAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcbiAgICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXG4gICAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgICAgU1RSSVBFX0FQSV9LRVlfUEFSQU1FVEVSX05BTUU6IHN0cmlwZUFwaUtleVBhcmFtZXRlci5wYXJhbWV0ZXJOYW1lLFxuICAgICAgICAgIEFMTE9XRURfUFJJQ0VfSURTOiAnJywgLy8gVG8gYmUgY29uZmlndXJlZCB3aXRoIGFjdHVhbCBTdHJpcGUgcHJpY2UgSURzXG4gICAgICAgIH0sXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgICAgbWVtb3J5U2l6ZTogMjU2LFxuICAgICAgICBidW5kbGluZzoge1xuICAgICAgICAgIGV4dGVybmFsTW9kdWxlczogWydAYXdzLXNkay8qJ10sXG4gICAgICAgICAgZm9yY2VEb2NrZXJCdW5kbGluZzogZmFsc2UsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBHcmFudCBTU00gcGFyYW1ldGVyIHJlYWQgcGVybWlzc2lvbiBmb3IgU3RyaXBlIEFQSSBrZXlcbiAgICBzdHJpcGVBcGlLZXlQYXJhbWV0ZXIuZ3JhbnRSZWFkKHRoaXMuY3JlYXRlQ2hlY2tvdXRTZXNzaW9uRnVuY3Rpb24pO1xuXG4gICAgLy8gQ3JlYXRlIFN0cmlwZSBXZWJob29rIEhhbmRsZXIgTGFtYmRhIGZ1bmN0aW9uXG4gICAgdGhpcy5zdHJpcGVXZWJob29rSGFuZGxlckZ1bmN0aW9uID0gbmV3IGxhbWJkYU5vZGVKcy5Ob2RlanNGdW5jdGlvbihcbiAgICAgIHRoaXMsXG4gICAgICAnU3RyaXBlV2ViaG9va0hhbmRsZXJGdW5jdGlvbicsXG4gICAgICB7XG4gICAgICAgIGZ1bmN0aW9uTmFtZTogYGF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS1zdHJpcGUtd2ViaG9vay1oYW5kbGVyYCxcbiAgICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9sYW1iZGEvcGF5bWVudHMvc3RyaXBlLXdlYmhvb2staGFuZGxlci50cycpLFxuICAgICAgICBoYW5kbGVyOiAnaGFuZGxlcicsXG4gICAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxuICAgICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICAgIFNUUklQRV9BUElfS0VZX1BBUkFNRVRFUl9OQU1FOiBzdHJpcGVBcGlLZXlQYXJhbWV0ZXIucGFyYW1ldGVyTmFtZSxcbiAgICAgICAgICBTVFJJUEVfV0VCSE9PS19TRUNSRVRfUEFSQU1FVEVSX05BTUU6IHN0cmlwZVdlYmhvb2tTZWNyZXRQYXJhbWV0ZXIucGFyYW1ldGVyTmFtZSxcbiAgICAgICAgICBHRU5FUkFURV9SRUFESU5HX0ZVTkNUSU9OX05BTUU6IHRoaXMuZ2VuZXJhdGVSZWFkaW5nRnVuY3Rpb24uZnVuY3Rpb25OYW1lLFxuICAgICAgICAgIFdFQkhPT0tfUFJPQ0VTU0lOR19UQUJMRV9OQU1FOiBwcm9wcy5yZWFkaW5nc1RhYmxlLnRhYmxlTmFtZSwgLy8gUmV1c2UgcmVhZGluZ3MgdGFibGUgZm9yIG5vd1xuICAgICAgICAgIElOVEVSTkFMX0lOVk9DQVRJT05fU0VDUkVUOiBpbnRlcm5hbEludm9jYXRpb25TZWNyZXQsXG4gICAgICAgIH0sXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSwgLy8gUmVkdWNlZCB0aW1lb3V0IGZvciB3ZWJob29rIHByb2Nlc3NpbmdcbiAgICAgICAgbWVtb3J5U2l6ZTogMjU2LFxuICAgICAgICBidW5kbGluZzoge1xuICAgICAgICAgIGV4dGVybmFsTW9kdWxlczogWydAYXdzLXNkay8qJ10sXG4gICAgICAgICAgZm9yY2VEb2NrZXJCdW5kbGluZzogZmFsc2UsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBHcmFudCBwZXJtaXNzaW9ucyB0byB3ZWJob29rIGhhbmRsZXJcbiAgICBzdHJpcGVBcGlLZXlQYXJhbWV0ZXIuZ3JhbnRSZWFkKHRoaXMuc3RyaXBlV2ViaG9va0hhbmRsZXJGdW5jdGlvbik7XG4gICAgc3RyaXBlV2ViaG9va1NlY3JldFBhcmFtZXRlci5ncmFudFJlYWQodGhpcy5zdHJpcGVXZWJob29rSGFuZGxlckZ1bmN0aW9uKTtcbiAgICB0aGlzLmdlbmVyYXRlUmVhZGluZ0Z1bmN0aW9uLmdyYW50SW52b2tlKHRoaXMuc3RyaXBlV2ViaG9va0hhbmRsZXJGdW5jdGlvbik7XG4gICAgcHJvcHMucmVhZGluZ3NUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEodGhpcy5zdHJpcGVXZWJob29rSGFuZGxlckZ1bmN0aW9uKTsgLy8gRm9yIGlkZW1wb3RlbmN5IHRyYWNraW5nXG5cbiAgICAvLyBHcmFudCBDb2duaXRvIHBlcm1pc3Npb25zIGZvciBhZG1pbiB1c2VyIGxpc3RpbmdcbiAgICB0aGlzLmFkbWluR2V0QWxsVXNlcnNGdW5jdGlvbi5hZGRUb1JvbGVQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGFjdGlvbnM6IFsnY29nbml0by1pZHA6TGlzdFVzZXJzJ10sXG4gICAgICAgIHJlc291cmNlczogW3Byb3BzLnVzZXJQb29sLnVzZXJQb29sQXJuXSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICAvLyBHcmFudCBMb2NhdGlvbiBTZXJ2aWNlIHBlcm1pc3Npb25zXG4gICAgdGhpcy51cGRhdGVVc2VyUHJvZmlsZUZ1bmN0aW9uLmFkZFRvUm9sZVBvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgYWN0aW9uczogWydnZW86U2VhcmNoUGxhY2VJbmRleEZvclRleHQnXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgYGFybjphd3M6Z2VvOiR7Y2RrLlN0YWNrLm9mKHRoaXMpLnJlZ2lvbn06JHtjZGsuU3RhY2sub2YodGhpcykuYWNjb3VudH06cGxhY2UtaW5kZXgvJHtcbiAgICAgICAgICAgIHByb3BzLnBsYWNlSW5kZXhOYW1lXG4gICAgICAgICAgfWAsXG4gICAgICAgIF0sXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgLy8gQ3JlYXRlIEFQSSBHYXRld2F5XG4gICAgdGhpcy5hcGkgPSBuZXcgYXBpZ2F0ZXdheS5SZXN0QXBpKHRoaXMsICdVc2VyQXBpJywge1xuICAgICAgcmVzdEFwaU5hbWU6IGBhdXJhMjgtJHtwcm9wcy5lbnZpcm9ubWVudH0tdXNlci1hcGlgLFxuICAgICAgZGVzY3JpcHRpb246ICdBUEkgZm9yIHVzZXIgcHJvZmlsZSBtYW5hZ2VtZW50JyxcbiAgICAgIGRlcGxveU9wdGlvbnM6IHtcbiAgICAgICAgc3RhZ2VOYW1lOiBwcm9wcy5lbnZpcm9ubWVudCxcbiAgICAgICAgdHJhY2luZ0VuYWJsZWQ6IHRydWUsXG4gICAgICAgIGRhdGFUcmFjZUVuYWJsZWQ6IHRydWUsXG4gICAgICAgIGxvZ2dpbmdMZXZlbDogYXBpZ2F0ZXdheS5NZXRob2RMb2dnaW5nTGV2ZWwuSU5GTyxcbiAgICAgICAgbWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICB9LFxuICAgICAgZGVmYXVsdENvcnNQcmVmbGlnaHRPcHRpb25zOiB7XG4gICAgICAgIGFsbG93T3JpZ2luczogcHJvcHMuYWxsb3dlZE9yaWdpbnMsXG4gICAgICAgIGFsbG93TWV0aG9kczogWydHRVQnLCAnUFVUJywgJ1BPU1QnLCAnUEFUQ0gnLCAnREVMRVRFJywgJ09QVElPTlMnXSxcbiAgICAgICAgYWxsb3dIZWFkZXJzOiBbXG4gICAgICAgICAgJ0NvbnRlbnQtVHlwZScsXG4gICAgICAgICAgJ1gtQW16LURhdGUnLFxuICAgICAgICAgICdBdXRob3JpemF0aW9uJyxcbiAgICAgICAgICAnWC1BcGktS2V5JyxcbiAgICAgICAgICAnWC1BbXotU2VjdXJpdHktVG9rZW4nLFxuICAgICAgICBdLFxuICAgICAgICBhbGxvd0NyZWRlbnRpYWxzOiB0cnVlLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBDb2duaXRvIGF1dGhvcml6ZXJcbiAgICBjb25zdCBhdXRob3JpemVyID0gbmV3IGFwaWdhdGV3YXkuQ29nbml0b1VzZXJQb29sc0F1dGhvcml6ZXIodGhpcywgJ1VzZXJQb29sQXV0aG9yaXplcicsIHtcbiAgICAgIGNvZ25pdG9Vc2VyUG9vbHM6IFtwcm9wcy51c2VyUG9vbF0sXG4gICAgICBhdXRob3JpemVyTmFtZTogYGF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS1hdXRob3JpemVyYCxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSAvYXBpL3VzZXJzL3t1c2VySWR9L3Byb2ZpbGUgcmVzb3VyY2VcbiAgICBjb25zdCBhcGlSZXNvdXJjZSA9IHRoaXMuYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ2FwaScpO1xuICAgIGNvbnN0IHVzZXJzUmVzb3VyY2UgPSBhcGlSZXNvdXJjZS5hZGRSZXNvdXJjZSgndXNlcnMnKTtcbiAgICBjb25zdCB1c2VySWRSZXNvdXJjZSA9IHVzZXJzUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3t1c2VySWR9Jyk7XG4gICAgY29uc3QgcHJvZmlsZVJlc291cmNlID0gdXNlcklkUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3Byb2ZpbGUnKTtcblxuICAgIC8vIEFkZCBHRVQgbWV0aG9kXG4gICAgcHJvZmlsZVJlc291cmNlLmFkZE1ldGhvZChcbiAgICAgICdHRVQnLFxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24odGhpcy5nZXRVc2VyUHJvZmlsZUZ1bmN0aW9uKSxcbiAgICAgIHtcbiAgICAgICAgYXV0aG9yaXplcixcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIEFkZCAvYXBpL3VzZXJzL3t1c2VySWR9L25hdGFsLWNoYXJ0IHJlc291cmNlXG4gICAgY29uc3QgbmF0YWxDaGFydFJlc291cmNlID0gdXNlcklkUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ25hdGFsLWNoYXJ0Jyk7XG4gICAgbmF0YWxDaGFydFJlc291cmNlLmFkZE1ldGhvZChcbiAgICAgICdHRVQnLFxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24odGhpcy5nZXROYXRhbENoYXJ0RnVuY3Rpb24pLFxuICAgICAge1xuICAgICAgICBhdXRob3JpemVyLFxuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gQWRkIFBVVCBtZXRob2RcbiAgICBwcm9maWxlUmVzb3VyY2UuYWRkTWV0aG9kKFxuICAgICAgJ1BVVCcsXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbih0aGlzLnVwZGF0ZVVzZXJQcm9maWxlRnVuY3Rpb24pLFxuICAgICAge1xuICAgICAgICBhdXRob3JpemVyLFxuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gQWRkIC9hcGkvdXNlcnMve3VzZXJJZH0vY2hlY2tvdXQtc2Vzc2lvbiByZXNvdXJjZVxuICAgIGNvbnN0IGNoZWNrb3V0U2Vzc2lvblJlc291cmNlID0gdXNlcklkUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ2NoZWNrb3V0LXNlc3Npb24nKTtcbiAgICBjaGVja291dFNlc3Npb25SZXNvdXJjZS5hZGRNZXRob2QoXG4gICAgICAnUE9TVCcsXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbih0aGlzLmNyZWF0ZUNoZWNrb3V0U2Vzc2lvbkZ1bmN0aW9uKSxcbiAgICAgIHtcbiAgICAgICAgYXV0aG9yaXplcixcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIEFkZCAvYXBpL3dlYmhvb2tzL3N0cmlwZSByZXNvdXJjZSAocHVibGljLCBubyBhdXRoZW50aWNhdGlvbilcbiAgICBjb25zdCB3ZWJob29rc1Jlc291cmNlID0gYXBpUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3dlYmhvb2tzJyk7XG4gICAgY29uc3Qgc3RyaXBlV2ViaG9va1Jlc291cmNlID0gd2ViaG9va3NSZXNvdXJjZS5hZGRSZXNvdXJjZSgnc3RyaXBlJyk7XG5cbiAgICAvLyBDb25maWd1cmUgd2ViaG9vayBlbmRwb2ludCB0byBoYW5kbGUgcmF3IGJvZHkgZm9yIHNpZ25hdHVyZSB2ZXJpZmljYXRpb25cbiAgICBjb25zdCB3ZWJob29rSW50ZWdyYXRpb24gPSBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbih0aGlzLnN0cmlwZVdlYmhvb2tIYW5kbGVyRnVuY3Rpb24sIHtcbiAgICAgIC8vIFBhc3MgdGhlIHJhdyBib2R5IHRvIExhbWJkYSBmb3Igc2lnbmF0dXJlIHZlcmlmaWNhdGlvblxuICAgICAgcGFzc3Rocm91Z2hCZWhhdmlvcjogYXBpZ2F0ZXdheS5QYXNzdGhyb3VnaEJlaGF2aW9yLldIRU5fTk9fTUFUQ0gsXG4gICAgICByZXF1ZXN0VGVtcGxhdGVzOiB7XG4gICAgICAgICdhcHBsaWNhdGlvbi9qc29uJzpcbiAgICAgICAgICAne1wiYm9keVwiOiBcIiR1dGlsLmJhc2U2NEVuY29kZSgkaW5wdXQuYm9keSlcIiwgXCJoZWFkZXJzXCI6ICRpbnB1dC5wYXJhbXMoKS5oZWFkZXJ9JyxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBjb25zdCB3ZWJob29rTWV0aG9kID0gc3RyaXBlV2ViaG9va1Jlc291cmNlLmFkZE1ldGhvZCgnUE9TVCcsIHdlYmhvb2tJbnRlZ3JhdGlvbiwge1xuICAgICAgLy8gTm8gYXV0aG9yaXphdGlvbiAtIFN0cmlwZSB3aWxsIGNhbGwgdGhpcyBlbmRwb2ludCBkaXJlY3RseVxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuTk9ORSxcbiAgICAgIHJlcXVlc3RNb2RlbHM6IHtcbiAgICAgICAgJ2FwcGxpY2F0aW9uL2pzb24nOiBhcGlnYXRld2F5Lk1vZGVsLkVNUFRZX01PREVMLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIEFkZCByYXRlIGxpbWl0aW5nIHRvIHByZXZlbnQgYWJ1c2VcbiAgICBjb25zdCB3ZWJob29rVGhyb3R0bGVTZXR0aW5nczogYXBpZ2F0ZXdheS5UaHJvdHRsZVNldHRpbmdzID0ge1xuICAgICAgcmF0ZUxpbWl0OiAxMDAsIC8vIDEwMCByZXF1ZXN0cyBwZXIgc2Vjb25kXG4gICAgICBidXJzdExpbWl0OiAyMDAsIC8vIEFsbG93IGJ1cnN0cyB1cCB0byAyMDAgcmVxdWVzdHNcbiAgICB9O1xuXG4gICAgLy8gQ3JlYXRlIHVzYWdlIHBsYW4gZm9yIHdlYmhvb2sgcmF0ZSBsaW1pdGluZ1xuICAgIG5ldyBhcGlnYXRld2F5LlVzYWdlUGxhbih0aGlzLCAnV2ViaG9va1VzYWdlUGxhbicsIHtcbiAgICAgIG5hbWU6IGBhdXJhMjgtJHtwcm9wcy5lbnZpcm9ubWVudH0td2ViaG9vay11c2FnZS1wbGFuYCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnVXNhZ2UgcGxhbiBmb3IgU3RyaXBlIHdlYmhvb2sgZW5kcG9pbnQnLFxuICAgICAgdGhyb3R0bGU6IHdlYmhvb2tUaHJvdHRsZVNldHRpbmdzLFxuICAgICAgYXBpU3RhZ2VzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBhcGk6IHRoaXMuYXBpLFxuICAgICAgICAgIHN0YWdlOiB0aGlzLmFwaS5kZXBsb3ltZW50U3RhZ2UsXG4gICAgICAgICAgdGhyb3R0bGU6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgbWV0aG9kOiB3ZWJob29rTWV0aG9kLFxuICAgICAgICAgICAgICB0aHJvdHRsZTogd2ViaG9va1Rocm90dGxlU2V0dGluZ3MsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIF0sXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gQWRkIC9hcGkvdXNlcnMve3VzZXJJZH0vcmVhZGluZ3MgcmVzb3VyY2VcbiAgICBjb25zdCByZWFkaW5nc1Jlc291cmNlID0gdXNlcklkUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3JlYWRpbmdzJyk7XG5cbiAgICAvLyBHRVQgL2FwaS91c2Vycy97dXNlcklkfS9yZWFkaW5ncyAtIExpc3QgdXNlcidzIHJlYWRpbmdzXG4gICAgcmVhZGluZ3NSZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHRoaXMuZ2V0UmVhZGluZ3NGdW5jdGlvbiksIHtcbiAgICAgIGF1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuXG4gICAgLy8gUE9TVCBlbmRwb2ludCBmb3IgcmVhZGluZyBnZW5lcmF0aW9uIGhhcyBiZWVuIHJlbW92ZWRcbiAgICAvLyBSZWFkaW5ncyBhcmUgbm93IG9ubHkgZ2VuZXJhdGVkIHRocm91Z2ggU3RyaXBlIHdlYmhvb2sgYWZ0ZXIgc3VjY2Vzc2Z1bCBwYXltZW50XG5cbiAgICAvLyBBZGQgL2FwaS91c2Vycy97dXNlcklkfS9yZWFkaW5ncy97cmVhZGluZ0lkfSByZXNvdXJjZVxuICAgIGNvbnN0IHJlYWRpbmdJZFJlc291cmNlID0gcmVhZGluZ3NSZXNvdXJjZS5hZGRSZXNvdXJjZSgne3JlYWRpbmdJZH0nKTtcblxuICAgIC8vIEdFVCAvYXBpL3VzZXJzL3t1c2VySWR9L3JlYWRpbmdzL3tyZWFkaW5nSWR9IC0gR2V0IHJlYWRpbmcgZGV0YWlsXG4gICAgcmVhZGluZ0lkUmVzb3VyY2UuYWRkTWV0aG9kKFxuICAgICAgJ0dFVCcsXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbih0aGlzLmdldFJlYWRpbmdEZXRhaWxGdW5jdGlvbiksXG4gICAgICB7XG4gICAgICAgIGF1dGhvcml6ZXIsXG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBDcmVhdGUgL2FwaS9hZG1pbiByZXNvdXJjZXNcbiAgICBjb25zdCBhZG1pblJlc291cmNlID0gYXBpUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ2FkbWluJyk7XG5cbiAgICAvLyBHRVQgL2FwaS9hZG1pbi9yZWFkaW5ncyAtIEdldCBhbGwgcmVhZGluZ3MgKGFkbWluIG9ubHkpXG4gICAgY29uc3QgYWRtaW5SZWFkaW5nc1Jlc291cmNlID0gYWRtaW5SZXNvdXJjZS5hZGRSZXNvdXJjZSgncmVhZGluZ3MnKTtcbiAgICBhZG1pblJlYWRpbmdzUmVzb3VyY2UuYWRkTWV0aG9kKFxuICAgICAgJ0dFVCcsXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbih0aGlzLmFkbWluR2V0QWxsUmVhZGluZ3NGdW5jdGlvbiksXG4gICAgICB7XG4gICAgICAgIGF1dGhvcml6ZXIsXG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyAvYXBpL2FkbWluL3JlYWRpbmdzL3t1c2VySWR9L3tyZWFkaW5nSWR9IHJlc291cmNlXG4gICAgY29uc3QgYWRtaW5Vc2VySWRSZXNvdXJjZSA9IGFkbWluUmVhZGluZ3NSZXNvdXJjZS5hZGRSZXNvdXJjZSgne3VzZXJJZH0nKTtcbiAgICBjb25zdCBhZG1pblJlYWRpbmdJZFJlc291cmNlID0gYWRtaW5Vc2VySWRSZXNvdXJjZS5hZGRSZXNvdXJjZSgne3JlYWRpbmdJZH0nKTtcblxuICAgIC8vIEdFVCAvYXBpL2FkbWluL3JlYWRpbmdzL3t1c2VySWR9L3tyZWFkaW5nSWR9IC0gR2V0IHJlYWRpbmcgZGV0YWlscyAoYWRtaW4gb25seSlcbiAgICBhZG1pblJlYWRpbmdJZFJlc291cmNlLmFkZE1ldGhvZChcbiAgICAgICdHRVQnLFxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24odGhpcy5hZG1pbkdldFJlYWRpbmdEZXRhaWxzRnVuY3Rpb24pLFxuICAgICAge1xuICAgICAgICBhdXRob3JpemVyLFxuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gREVMRVRFIC9hcGkvYWRtaW4vcmVhZGluZ3Mve3VzZXJJZH0ve3JlYWRpbmdJZH0gLSBEZWxldGUgcmVhZGluZyAoYWRtaW4gb25seSlcbiAgICBhZG1pblJlYWRpbmdJZFJlc291cmNlLmFkZE1ldGhvZChcbiAgICAgICdERUxFVEUnLFxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24odGhpcy5hZG1pbkRlbGV0ZVJlYWRpbmdGdW5jdGlvbiksXG4gICAgICB7XG4gICAgICAgIGF1dGhvcml6ZXIsXG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyAvYXBpL2FkbWluL3JlYWRpbmdzL3t1c2VySWR9L3tyZWFkaW5nSWR9L3N0YXR1cyByZXNvdXJjZVxuICAgIGNvbnN0IGFkbWluUmVhZGluZ1N0YXR1c1Jlc291cmNlID0gYWRtaW5SZWFkaW5nSWRSZXNvdXJjZS5hZGRSZXNvdXJjZSgnc3RhdHVzJyk7XG5cbiAgICAvLyBQQVRDSCAvYXBpL2FkbWluL3JlYWRpbmdzL3t1c2VySWR9L3tyZWFkaW5nSWR9L3N0YXR1cyAtIFVwZGF0ZSByZWFkaW5nIHN0YXR1cyAoYWRtaW4gb25seSlcbiAgICBhZG1pblJlYWRpbmdTdGF0dXNSZXNvdXJjZS5hZGRNZXRob2QoXG4gICAgICAnUEFUQ0gnLFxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24odGhpcy5hZG1pblVwZGF0ZVJlYWRpbmdTdGF0dXNGdW5jdGlvbiksXG4gICAgICB7XG4gICAgICAgIGF1dGhvcml6ZXIsXG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBHRVQgL2FwaS9hZG1pbi91c2VycyAtIEdldCBhbGwgdXNlcnMgKGFkbWluIG9ubHkpXG4gICAgY29uc3QgYWRtaW5Vc2Vyc1Jlc291cmNlID0gYWRtaW5SZXNvdXJjZS5hZGRSZXNvdXJjZSgndXNlcnMnKTtcbiAgICBhZG1pblVzZXJzUmVzb3VyY2UuYWRkTWV0aG9kKFxuICAgICAgJ0dFVCcsXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbih0aGlzLmFkbWluR2V0QWxsVXNlcnNGdW5jdGlvbiksXG4gICAgICB7XG4gICAgICAgIGF1dGhvcml6ZXIsXG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBPdXRwdXQgQVBJIFVSTFxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBcGlVcmwnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5hcGkudXJsLFxuICAgICAgZGVzY3JpcHRpb246ICdBUEkgR2F0ZXdheSBVUkwnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FwaUVuZHBvaW50Jywge1xuICAgICAgdmFsdWU6IGAke3RoaXMuYXBpLnVybH1hcGkvdXNlcnMve3VzZXJJZH0vcHJvZmlsZWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ1VzZXIgUHJvZmlsZSBBUEkgRW5kcG9pbnQnLFxuICAgIH0pO1xuICB9XG59XG4iXX0=