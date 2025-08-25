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
        // Create SSM Parameter for allowed Stripe price IDs
        const allowedPriceIdsParameter = new ssm.StringParameter(this, 'AllowedPriceIdsParameter', {
            parameterName: `/aura28/${props.environment}/stripe/allowed-price-ids`,
            description: `Comma-separated list of allowed Stripe price IDs for ${props.environment} environment`,
            stringValue: 'price_placeholder_1,price_placeholder_2', // Initial placeholder values
            tier: ssm.ParameterTier.STANDARD,
        });
        // Create SSM Parameter for default Stripe price ID (used by frontend build)
        new ssm.StringParameter(this, 'DefaultPriceIdParameter', {
            parameterName: `/aura28/${props.environment}/stripe/default-price-id`,
            description: `Default Stripe price ID for frontend build in ${props.environment} environment`,
            stringValue: props.environment === 'dev'
                ? 'price_1QbGXuRuJDBzRJSkCbG4a9Xo' // Existing dev price ID
                : 'price_REPLACE_WITH_PRODUCTION_ID', // Placeholder for production
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
                ALLOWED_PRICE_IDS_PARAMETER_NAME: allowedPriceIdsParameter.parameterName,
                // Keep for backward compatibility during transition
                ALLOWED_PRICE_IDS: '', // Will be deprecated
                PRICE_ID_CACHE_TTL_SECONDS: '300', // 5 minutes cache
            },
            timeout: cdk.Duration.seconds(30),
            memorySize: 256,
            bundling: {
                externalModules: ['@aws-sdk/*'],
                forceDockerBundling: false,
            },
        });
        // Grant SSM parameter read permissions
        stripeApiKeyParameter.grantRead(this.createCheckoutSessionFunction);
        allowedPriceIdsParameter.grantRead(this.createCheckoutSessionFunction);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBpLWNvbnN0cnVjdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImFwaS1jb25zdHJ1Y3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSwyQ0FBdUM7QUFDdkMsaURBQW1DO0FBQ25DLHVFQUF5RDtBQUN6RCwrREFBaUQ7QUFDakQsNEVBQThEO0FBRzlELHlEQUEyQztBQUMzQyx5REFBMkM7QUFDM0MsdURBQXlDO0FBQ3pDLHdFQUEwRDtBQUMxRCwyQ0FBNkI7QUFhN0IsTUFBYSxZQUFhLFNBQVEsc0JBQVM7SUFDekIsR0FBRyxDQUFxQjtJQUN4QixzQkFBc0IsQ0FBa0I7SUFDeEMseUJBQXlCLENBQWtCO0lBQzNDLDBCQUEwQixDQUFrQjtJQUM1QyxxQkFBcUIsQ0FBa0I7SUFDdkMsdUJBQXVCLENBQWtCO0lBQ3pDLG1CQUFtQixDQUFrQjtJQUNyQyx3QkFBd0IsQ0FBa0I7SUFDMUMsMkJBQTJCLENBQWtCO0lBQzdDLHdCQUF3QixDQUFrQjtJQUMxQyw4QkFBOEIsQ0FBa0I7SUFDaEQsZ0NBQWdDLENBQWtCO0lBQ2xELDBCQUEwQixDQUFrQjtJQUM1Qyw2QkFBNkIsQ0FBa0I7SUFDL0MsNEJBQTRCLENBQWtCO0lBRTlELFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBd0I7UUFDaEUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQiwyQ0FBMkM7UUFDM0MsTUFBTSxZQUFZLEdBQUcsSUFBSSxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxjQUFjLEVBQUU7WUFDdkQsVUFBVSxFQUFFLFVBQVUsS0FBSyxDQUFDLFdBQVcsU0FBUztZQUNoRCxTQUFTLEVBQUUsSUFBSTtZQUNmLGlCQUFpQixFQUFFLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTO1lBQ2pELFVBQVUsRUFBRSxFQUFFLENBQUMsZ0JBQWdCLENBQUMsVUFBVTtZQUMxQyxhQUFhLEVBQ1gsS0FBSyxDQUFDLFdBQVcsS0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLE9BQU87WUFDckYsaUJBQWlCLEVBQUUsS0FBSyxDQUFDLFdBQVcsS0FBSyxNQUFNO1lBQy9DLGNBQWMsRUFBRTtnQkFDZDtvQkFDRSxFQUFFLEVBQUUscUJBQXFCO29CQUN6QiwyQkFBMkIsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7aUJBQ25EO2FBQ0Y7U0FDRixDQUFDLENBQUM7UUFFSCw0QkFBNEI7UUFDNUIsSUFBSSxRQUFRLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxFQUFFLGVBQWUsRUFBRTtZQUNuRCxPQUFPLEVBQUU7Z0JBQ1AsUUFBUSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsc0JBQXNCLEVBQUUsS0FBSyxDQUFDLFdBQVcsQ0FBQyxDQUFDO2FBQ3ZGO1lBQ0QsaUJBQWlCLEVBQUUsWUFBWTtZQUMvQixvQkFBb0IsRUFBRSxXQUFXLEtBQUssQ0FBQyxXQUFXLEVBQUU7WUFDcEQsS0FBSyxFQUFFLEtBQUs7WUFDWixjQUFjLEVBQUUsS0FBSyxDQUFDLFdBQVcsS0FBSyxNQUFNO1NBQzdDLENBQUMsQ0FBQztRQUVILGlEQUFpRDtRQUNqRCxNQUFNLHFCQUFxQixHQUFHLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQyxJQUFJLEVBQUUsdUJBQXVCLEVBQUU7WUFDbkYsYUFBYSxFQUFFLFdBQVcsS0FBSyxDQUFDLFdBQVcsaUJBQWlCO1lBQzVELFdBQVcsRUFBRSxzQkFBc0IsS0FBSyxDQUFDLFdBQVcsY0FBYztZQUNsRSxXQUFXLEVBQUUscUNBQXFDO1lBQ2xELElBQUksRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLFFBQVE7U0FDakMsQ0FBQyxDQUFDO1FBRUgsaURBQWlEO1FBQ2pELE1BQU0scUJBQXFCLEdBQUcsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDLElBQUksRUFBRSx1QkFBdUIsRUFBRTtZQUNuRixhQUFhLEVBQUUsV0FBVyxLQUFLLENBQUMsV0FBVyxpQkFBaUI7WUFDNUQsV0FBVyxFQUFFLHNCQUFzQixLQUFLLENBQUMsV0FBVyxjQUFjO1lBQ2xFLFdBQVcsRUFBRSxxQ0FBcUM7WUFDbEQsSUFBSSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsUUFBUTtTQUNqQyxDQUFDLENBQUM7UUFFSCw4REFBOEQ7UUFDOUQsTUFBTSw0QkFBNEIsR0FBRyxJQUFJLEdBQUcsQ0FBQyxlQUFlLENBQzFELElBQUksRUFDSiw4QkFBOEIsRUFDOUI7WUFDRSxhQUFhLEVBQUUsV0FBVyxLQUFLLENBQUMsV0FBVyx3QkFBd0I7WUFDbkUsV0FBVyxFQUFFLDZCQUE2QixLQUFLLENBQUMsV0FBVyxjQUFjO1lBQ3pFLFdBQVcsRUFBRSxxQ0FBcUM7WUFDbEQsSUFBSSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsUUFBUTtTQUNqQyxDQUNGLENBQUM7UUFFRixvREFBb0Q7UUFDcEQsTUFBTSx3QkFBd0IsR0FBRyxJQUFJLEdBQUcsQ0FBQyxlQUFlLENBQUMsSUFBSSxFQUFFLDBCQUEwQixFQUFFO1lBQ3pGLGFBQWEsRUFBRSxXQUFXLEtBQUssQ0FBQyxXQUFXLDJCQUEyQjtZQUN0RSxXQUFXLEVBQUUsd0RBQXdELEtBQUssQ0FBQyxXQUFXLGNBQWM7WUFDcEcsV0FBVyxFQUFFLHlDQUF5QyxFQUFFLDZCQUE2QjtZQUNyRixJQUFJLEVBQUUsR0FBRyxDQUFDLGFBQWEsQ0FBQyxRQUFRO1NBQ2pDLENBQUMsQ0FBQztRQUVILDRFQUE0RTtRQUM1RSxJQUFJLEdBQUcsQ0FBQyxlQUFlLENBQUMsSUFBSSxFQUFFLHlCQUF5QixFQUFFO1lBQ3ZELGFBQWEsRUFBRSxXQUFXLEtBQUssQ0FBQyxXQUFXLDBCQUEwQjtZQUNyRSxXQUFXLEVBQUUsaURBQWlELEtBQUssQ0FBQyxXQUFXLGNBQWM7WUFDN0YsV0FBVyxFQUNULEtBQUssQ0FBQyxXQUFXLEtBQUssS0FBSztnQkFDekIsQ0FBQyxDQUFDLGdDQUFnQyxDQUFDLHdCQUF3QjtnQkFDM0QsQ0FBQyxDQUFDLGtDQUFrQyxFQUFFLDZCQUE2QjtZQUN2RSxJQUFJLEVBQUUsR0FBRyxDQUFDLGFBQWEsQ0FBQyxRQUFRO1NBQ2pDLENBQUMsQ0FBQztRQUVILGdEQUFnRDtRQUNoRCxNQUFNLHFCQUFxQixHQUFHLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQyxJQUFJLEVBQUUsdUJBQXVCLEVBQUU7WUFDbkYsYUFBYSxFQUFFLFdBQVcsS0FBSyxDQUFDLFdBQVcsZ0JBQWdCO1lBQzNELFdBQVcsRUFBRSxnQ0FBZ0MsS0FBSyxDQUFDLFdBQVcsY0FBYztZQUM1RSxXQUFXLEVBQUUscUJBQXFCO1lBQ2xDLElBQUksRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLFFBQVE7U0FDakMsQ0FBQyxDQUFDO1FBRUgsTUFBTSwyQkFBMkIsR0FBRyxJQUFJLEdBQUcsQ0FBQyxlQUFlLENBQ3pELElBQUksRUFDSiw2QkFBNkIsRUFDN0I7WUFDRSxhQUFhLEVBQUUsV0FBVyxLQUFLLENBQUMsV0FBVyxzQkFBc0I7WUFDakUsV0FBVyxFQUFFLCtCQUErQixLQUFLLENBQUMsV0FBVyxjQUFjO1lBQzNFLFdBQVcsRUFBRSxLQUFLO1lBQ2xCLElBQUksRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLFFBQVE7U0FDakMsQ0FDRixDQUFDO1FBRUYsTUFBTSx5QkFBeUIsR0FBRyxJQUFJLEdBQUcsQ0FBQyxlQUFlLENBQUMsSUFBSSxFQUFFLDJCQUEyQixFQUFFO1lBQzNGLGFBQWEsRUFBRSxXQUFXLEtBQUssQ0FBQyxXQUFXLHFCQUFxQjtZQUNoRSxXQUFXLEVBQUUsOEJBQThCLEtBQUssQ0FBQyxXQUFXLGNBQWM7WUFDMUUsV0FBVyxFQUFFLE1BQU07WUFDbkIsSUFBSSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsUUFBUTtTQUNqQyxDQUFDLENBQUM7UUFFSCxNQUFNLDBCQUEwQixHQUFHLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQyxJQUFJLEVBQUUsNEJBQTRCLEVBQUU7WUFDN0YsYUFBYSxFQUFFLFdBQVcsS0FBSyxDQUFDLFdBQVcsOEJBQThCO1lBQ3pFLFdBQVcsRUFBRSwrQkFBK0IsS0FBSyxDQUFDLFdBQVcsY0FBYztZQUMzRSxXQUFXLEVBQUUsV0FBVyxLQUFLLENBQUMsV0FBVyw0QkFBNEI7WUFDckUsSUFBSSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsUUFBUTtTQUNqQyxDQUFDLENBQUM7UUFFSCxNQUFNLHdCQUF3QixHQUFHLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQyxJQUFJLEVBQUUsMEJBQTBCLEVBQUU7WUFDekYsYUFBYSxFQUFFLFdBQVcsS0FBSyxDQUFDLFdBQVcsNEJBQTRCO1lBQ3ZFLFdBQVcsRUFBRSxzQ0FBc0MsS0FBSyxDQUFDLFdBQVcsY0FBYztZQUNsRixXQUFXLEVBQUUsV0FBVyxLQUFLLENBQUMsV0FBVyxrQ0FBa0M7WUFDM0UsSUFBSSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsUUFBUTtTQUNqQyxDQUFDLENBQUM7UUFFSCw2Q0FBNkM7UUFDN0MsaUZBQWlGO1FBQ2pGLDRGQUE0RjtRQUM1RixNQUFNLHNCQUFzQixHQUMxQixLQUFLLENBQUMsc0JBQXNCO1lBQzVCLEdBQUcsQ0FBQyxlQUFlLENBQUMsdUJBQXVCLENBQ3pDLElBQUksRUFDSixXQUFXLEtBQUssQ0FBQyxXQUFXLHFCQUFxQixDQUNsRCxDQUFDO1FBRUosTUFBTSxtQkFBbUIsR0FBRyxNQUFNLENBQUMsWUFBWSxDQUFDLG1CQUFtQixDQUNqRSxJQUFJLEVBQ0oscUJBQXFCLEVBQ3JCLHNCQUFzQixDQUN2QixDQUFDO1FBRUYsMEJBQTBCO1FBQzFCLElBQUksQ0FBQyxzQkFBc0IsR0FBRyxJQUFJLFlBQVksQ0FBQyxjQUFjLENBQUMsSUFBSSxFQUFFLHdCQUF3QixFQUFFO1lBQzVGLFlBQVksRUFBRSxVQUFVLEtBQUssQ0FBQyxXQUFXLG1CQUFtQjtZQUM1RCxLQUFLLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsK0NBQStDLENBQUM7WUFDNUUsT0FBTyxFQUFFLFNBQVM7WUFDbEIsT0FBTyxFQUFFLE1BQU0sQ0FBQyxPQUFPLENBQUMsV0FBVztZQUNuQyxXQUFXLEVBQUU7Z0JBQ1gsVUFBVSxFQUFFLEtBQUssQ0FBQyxTQUFTLENBQUMsU0FBUzthQUN0QztZQUNELE9BQU8sRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDakMsVUFBVSxFQUFFLEdBQUc7WUFDZixRQUFRLEVBQUU7Z0JBQ1IsZUFBZSxFQUFFLENBQUMsWUFBWSxDQUFDO2dCQUMvQixtQkFBbUIsRUFBRSxLQUFLO2FBQzNCO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsK0ZBQStGO1FBQy9GLElBQUksQ0FBQywwQkFBMEIsR0FBRyxJQUFJLFlBQVksQ0FBQyxjQUFjLENBQy9ELElBQUksRUFDSiw0QkFBNEIsRUFDNUI7WUFDRSxZQUFZLEVBQUUsVUFBVSxLQUFLLENBQUMsV0FBVyx1QkFBdUI7WUFDaEUsS0FBSyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLGtEQUFrRCxDQUFDO1lBQy9FLE9BQU8sRUFBRSxTQUFTO1lBQ2xCLE9BQU8sRUFBRSxNQUFNLENBQUMsT0FBTyxDQUFDLFdBQVc7WUFDbkMsTUFBTSxFQUFFLENBQUMsbUJBQW1CLENBQUM7WUFDN0IsV0FBVyxFQUFFO2dCQUNYLHNCQUFzQixFQUFFLEtBQUssQ0FBQyxlQUFlLENBQUMsU0FBUztnQkFDdkQsY0FBYyxFQUFFLHdDQUF3QztnQkFDeEQsWUFBWSxFQUFFLHdDQUF3QztnQkFDdEQsUUFBUSxFQUFFLFlBQVksRUFBRSx5QkFBeUI7YUFDbEQ7WUFDRCxPQUFPLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLEVBQUUsb0NBQW9DO1lBQ3ZFLFVBQVUsRUFBRSxHQUFHLEVBQUUsOENBQThDO1lBQy9ELFFBQVEsRUFBRTtnQkFDUixlQUFlLEVBQUUsQ0FBQyxZQUFZLEVBQUUsVUFBVSxDQUFDLEVBQUUsMkNBQTJDO2dCQUN4RixtQkFBbUIsRUFBRSxLQUFLO2FBQzNCO1NBQ0YsQ0FDRixDQUFDO1FBRUYsSUFBSSxDQUFDLHlCQUF5QixHQUFHLElBQUksWUFBWSxDQUFDLGNBQWMsQ0FDOUQsSUFBSSxFQUNKLDJCQUEyQixFQUMzQjtZQUNFLFlBQVksRUFBRSxVQUFVLEtBQUssQ0FBQyxXQUFXLHNCQUFzQjtZQUMvRCxLQUFLLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsa0RBQWtELENBQUM7WUFDL0UsT0FBTyxFQUFFLFNBQVM7WUFDbEIsT0FBTyxFQUFFLE1BQU0sQ0FBQyxPQUFPLENBQUMsV0FBVztZQUNuQyxXQUFXLEVBQUU7Z0JBQ1gsVUFBVSxFQUFFLEtBQUssQ0FBQyxTQUFTLENBQUMsU0FBUztnQkFDckMsZ0JBQWdCLEVBQUUsS0FBSyxDQUFDLGNBQWM7Z0JBQ3RDLGtDQUFrQyxFQUFFLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxZQUFZO2FBQ2pGO1lBQ0QsT0FBTyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUNqQyxVQUFVLEVBQUUsR0FBRztZQUNmLFFBQVEsRUFBRTtnQkFDUixlQUFlLEVBQUUsQ0FBQyxZQUFZLENBQUM7Z0JBQy9CLG1CQUFtQixFQUFFLEtBQUs7YUFDM0I7U0FDRixDQUNGLENBQUM7UUFFRiw2QkFBNkI7UUFDN0IsS0FBSyxDQUFDLFNBQVMsQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLHNCQUFzQixDQUFDLENBQUM7UUFDM0QsS0FBSyxDQUFDLFNBQVMsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLHlCQUF5QixDQUFDLENBQUM7UUFDL0QsS0FBSyxDQUFDLGVBQWUsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLDBCQUEwQixDQUFDLENBQUM7UUFFdEUsSUFBSSxDQUFDLHFCQUFxQixHQUFHLElBQUksWUFBWSxDQUFDLGNBQWMsQ0FBQyxJQUFJLEVBQUUsdUJBQXVCLEVBQUU7WUFDMUYsWUFBWSxFQUFFLFVBQVUsS0FBSyxDQUFDLFdBQVcsa0JBQWtCO1lBQzNELEtBQUssRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSw2Q0FBNkMsQ0FBQztZQUMxRSxPQUFPLEVBQUUsU0FBUztZQUNsQixPQUFPLEVBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxXQUFXO1lBQ25DLFdBQVcsRUFBRTtnQkFDWCxzQkFBc0IsRUFBRSxLQUFLLENBQUMsZUFBZSxDQUFDLFNBQVM7YUFDeEQ7WUFDRCxPQUFPLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ2pDLFVBQVUsRUFBRSxHQUFHO1lBQ2YsUUFBUSxFQUFFO2dCQUNSLGVBQWUsRUFBRSxDQUFDLFlBQVksQ0FBQztnQkFDL0IsbUJBQW1CLEVBQUUsS0FBSzthQUMzQjtTQUNGLENBQUMsQ0FBQztRQUVILEtBQUssQ0FBQyxlQUFlLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO1FBRWhFLDhCQUE4QjtRQUM5QixJQUFJLENBQUMsMEJBQTBCLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO1FBRTVFLHVHQUF1RztRQUN2RyxNQUFNLHdCQUF3QixHQUFHLG9CQUFvQixLQUFLLENBQUMsV0FBVyxJQUFJLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBRXZHLHVDQUF1QztRQUN2QyxJQUFJLENBQUMsdUJBQXVCLEdBQUcsSUFBSSxZQUFZLENBQUMsY0FBYyxDQUM1RCxJQUFJLEVBQ0oseUJBQXlCLEVBQ3pCO1lBQ0UsWUFBWSxFQUFFLFVBQVUsS0FBSyxDQUFDLFdBQVcsbUJBQW1CO1lBQzVELEtBQUssRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSwyQ0FBMkMsQ0FBQztZQUN4RSxPQUFPLEVBQUUsU0FBUztZQUNsQixPQUFPLEVBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxXQUFXO1lBQ25DLFdBQVcsRUFBRTtnQkFDWCxtQkFBbUIsRUFBRSxLQUFLLENBQUMsYUFBYSxDQUFDLFNBQVM7Z0JBQ2xELHNCQUFzQixFQUFFLEtBQUssQ0FBQyxlQUFlLENBQUMsU0FBUztnQkFDdkQsZUFBZSxFQUFFLEtBQUssQ0FBQyxTQUFTLENBQUMsU0FBUztnQkFDMUMsa0JBQWtCLEVBQUUsWUFBWSxDQUFDLFVBQVU7Z0JBQzNDLDZCQUE2QixFQUFFLHFCQUFxQixDQUFDLGFBQWE7Z0JBQ2xFLDRCQUE0QixFQUFFLHFCQUFxQixDQUFDLGFBQWE7Z0JBQ2pFLGtDQUFrQyxFQUFFLDJCQUEyQixDQUFDLGFBQWE7Z0JBQzdFLGlDQUFpQyxFQUFFLHlCQUF5QixDQUFDLGFBQWE7Z0JBQzFFLGtDQUFrQyxFQUFFLDBCQUEwQixDQUFDLGFBQWE7Z0JBQzVFLGdDQUFnQyxFQUFFLHdCQUF3QixDQUFDLGFBQWE7Z0JBQ3hFLDBCQUEwQixFQUFFLHdCQUF3QjthQUNyRDtZQUNELE9BQU8sRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsRUFBRSx3Q0FBd0M7WUFDNUUsVUFBVSxFQUFFLEdBQUc7WUFDZixRQUFRLEVBQUU7Z0JBQ1IsZUFBZSxFQUFFLENBQUMsWUFBWSxDQUFDO2dCQUMvQixtQkFBbUIsRUFBRSxLQUFLO2FBQzNCO1NBQ0YsQ0FDRixDQUFDO1FBRUYsSUFBSSxDQUFDLG1CQUFtQixHQUFHLElBQUksWUFBWSxDQUFDLGNBQWMsQ0FBQyxJQUFJLEVBQUUscUJBQXFCLEVBQUU7WUFDdEYsWUFBWSxFQUFFLFVBQVUsS0FBSyxDQUFDLFdBQVcsZUFBZTtZQUN4RCxLQUFLLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsdUNBQXVDLENBQUM7WUFDcEUsT0FBTyxFQUFFLFNBQVM7WUFDbEIsT0FBTyxFQUFFLE1BQU0sQ0FBQyxPQUFPLENBQUMsV0FBVztZQUNuQyxXQUFXLEVBQUU7Z0JBQ1gsbUJBQW1CLEVBQUUsS0FBSyxDQUFDLGFBQWEsQ0FBQyxTQUFTO2FBQ25EO1lBQ0QsT0FBTyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUNqQyxVQUFVLEVBQUUsR0FBRztZQUNmLFFBQVEsRUFBRTtnQkFDUixlQUFlLEVBQUUsQ0FBQyxZQUFZLENBQUM7Z0JBQy9CLG1CQUFtQixFQUFFLEtBQUs7YUFDM0I7U0FDRixDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsd0JBQXdCLEdBQUcsSUFBSSxZQUFZLENBQUMsY0FBYyxDQUM3RCxJQUFJLEVBQ0osMEJBQTBCLEVBQzFCO1lBQ0UsWUFBWSxFQUFFLFVBQVUsS0FBSyxDQUFDLFdBQVcscUJBQXFCO1lBQzlELEtBQUssRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSw2Q0FBNkMsQ0FBQztZQUMxRSxPQUFPLEVBQUUsU0FBUztZQUNsQixPQUFPLEVBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxXQUFXO1lBQ25DLFdBQVcsRUFBRTtnQkFDWCxtQkFBbUIsRUFBRSxLQUFLLENBQUMsYUFBYSxDQUFDLFNBQVM7YUFDbkQ7WUFDRCxPQUFPLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ2pDLFVBQVUsRUFBRSxHQUFHO1lBQ2YsUUFBUSxFQUFFO2dCQUNSLGVBQWUsRUFBRSxDQUFDLFlBQVksQ0FBQztnQkFDL0IsbUJBQW1CLEVBQUUsS0FBSzthQUMzQjtTQUNGLENBQ0YsQ0FBQztRQUVGLDBDQUEwQztRQUMxQyxLQUFLLENBQUMsYUFBYSxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1FBQ3JFLEtBQUssQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO1FBQzVELEtBQUssQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO1FBQ2pFLEtBQUssQ0FBQyxlQUFlLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1FBQ2xFLEtBQUssQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1FBRTVELGlEQUFpRDtRQUNqRCxpQ0FBaUM7UUFDakMscUJBQXFCLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1FBQzlELHFCQUFxQixDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsdUJBQXVCLENBQUMsQ0FBQztRQUM5RCwyQkFBMkIsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLHVCQUF1QixDQUFDLENBQUM7UUFDcEUseUJBQXlCLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1FBQ2xFLDBCQUEwQixDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsdUJBQXVCLENBQUMsQ0FBQztRQUNuRSx3QkFBd0IsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLHVCQUF1QixDQUFDLENBQUM7UUFFakUscURBQXFEO1FBQ3JELFlBQVksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLHVCQUF1QixDQUFDLENBQUM7UUFFckQsZ0NBQWdDO1FBQ2hDLElBQUksQ0FBQywyQkFBMkIsR0FBRyxJQUFJLFlBQVksQ0FBQyxjQUFjLENBQ2hFLElBQUksRUFDSiw2QkFBNkIsRUFDN0I7WUFDRSxZQUFZLEVBQUUsVUFBVSxLQUFLLENBQUMsV0FBVyx5QkFBeUI7WUFDbEUsS0FBSyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLHdDQUF3QyxDQUFDO1lBQ3JFLE9BQU8sRUFBRSxTQUFTO1lBQ2xCLE9BQU8sRUFBRSxNQUFNLENBQUMsT0FBTyxDQUFDLFdBQVc7WUFDbkMsV0FBVyxFQUFFO2dCQUNYLG1CQUFtQixFQUFFLEtBQUssQ0FBQyxhQUFhLENBQUMsU0FBUztnQkFDbEQsZUFBZSxFQUFFLEtBQUssQ0FBQyxTQUFTLENBQUMsU0FBUzthQUMzQztZQUNELE9BQU8sRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDakMsVUFBVSxFQUFFLEdBQUc7WUFDZixRQUFRLEVBQUU7Z0JBQ1IsZUFBZSxFQUFFLENBQUMsWUFBWSxDQUFDO2dCQUMvQixtQkFBbUIsRUFBRSxLQUFLO2FBQzNCO1NBQ0YsQ0FDRixDQUFDO1FBRUYsSUFBSSxDQUFDLHdCQUF3QixHQUFHLElBQUksWUFBWSxDQUFDLGNBQWMsQ0FDN0QsSUFBSSxFQUNKLDBCQUEwQixFQUMxQjtZQUNFLFlBQVksRUFBRSxVQUFVLEtBQUssQ0FBQyxXQUFXLHNCQUFzQjtZQUMvRCxLQUFLLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUscUNBQXFDLENBQUM7WUFDbEUsT0FBTyxFQUFFLFNBQVM7WUFDbEIsT0FBTyxFQUFFLE1BQU0sQ0FBQyxPQUFPLENBQUMsV0FBVztZQUNuQyxXQUFXLEVBQUU7Z0JBQ1gsWUFBWSxFQUFFLEtBQUssQ0FBQyxRQUFRLENBQUMsVUFBVTthQUN4QztZQUNELE9BQU8sRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDakMsVUFBVSxFQUFFLEdBQUc7WUFDZixRQUFRLEVBQUU7Z0JBQ1IsZUFBZSxFQUFFLENBQUMsWUFBWSxDQUFDO2dCQUMvQixtQkFBbUIsRUFBRSxLQUFLO2FBQzNCO1NBQ0YsQ0FDRixDQUFDO1FBRUYsMkNBQTJDO1FBQzNDLElBQUksQ0FBQyw4QkFBOEIsR0FBRyxJQUFJLFlBQVksQ0FBQyxjQUFjLENBQ25FLElBQUksRUFDSixnQ0FBZ0MsRUFDaEM7WUFDRSxZQUFZLEVBQUUsVUFBVSxLQUFLLENBQUMsV0FBVyw0QkFBNEI7WUFDckUsS0FBSyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLDJDQUEyQyxDQUFDO1lBQ3hFLE9BQU8sRUFBRSxTQUFTO1lBQ2xCLE9BQU8sRUFBRSxNQUFNLENBQUMsT0FBTyxDQUFDLFdBQVc7WUFDbkMsV0FBVyxFQUFFO2dCQUNYLG1CQUFtQixFQUFFLEtBQUssQ0FBQyxhQUFhLENBQUMsU0FBUztnQkFDbEQsZUFBZSxFQUFFLEtBQUssQ0FBQyxTQUFTLENBQUMsU0FBUzthQUMzQztZQUNELE9BQU8sRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDakMsVUFBVSxFQUFFLEdBQUc7WUFDZixRQUFRLEVBQUU7Z0JBQ1IsZUFBZSxFQUFFLENBQUMsWUFBWSxDQUFDO2dCQUMvQixtQkFBbUIsRUFBRSxLQUFLO2FBQzNCO1NBQ0YsQ0FDRixDQUFDO1FBRUYsSUFBSSxDQUFDLGdDQUFnQyxHQUFHLElBQUksWUFBWSxDQUFDLGNBQWMsQ0FDckUsSUFBSSxFQUNKLGtDQUFrQyxFQUNsQztZQUNFLFlBQVksRUFBRSxVQUFVLEtBQUssQ0FBQyxXQUFXLDhCQUE4QjtZQUN2RSxLQUFLLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsNkNBQTZDLENBQUM7WUFDMUUsT0FBTyxFQUFFLFNBQVM7WUFDbEIsT0FBTyxFQUFFLE1BQU0sQ0FBQyxPQUFPLENBQUMsV0FBVztZQUNuQyxXQUFXLEVBQUU7Z0JBQ1gsbUJBQW1CLEVBQUUsS0FBSyxDQUFDLGFBQWEsQ0FBQyxTQUFTO2FBQ25EO1lBQ0QsT0FBTyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUNqQyxVQUFVLEVBQUUsR0FBRztZQUNmLFFBQVEsRUFBRTtnQkFDUixlQUFlLEVBQUUsQ0FBQyxZQUFZLENBQUM7Z0JBQy9CLG1CQUFtQixFQUFFLEtBQUs7YUFDM0I7U0FDRixDQUNGLENBQUM7UUFFRixJQUFJLENBQUMsMEJBQTBCLEdBQUcsSUFBSSxZQUFZLENBQUMsY0FBYyxDQUMvRCxJQUFJLEVBQ0osNEJBQTRCLEVBQzVCO1lBQ0UsWUFBWSxFQUFFLFVBQVUsS0FBSyxDQUFDLFdBQVcsdUJBQXVCO1lBQ2hFLEtBQUssRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxzQ0FBc0MsQ0FBQztZQUNuRSxPQUFPLEVBQUUsU0FBUztZQUNsQixPQUFPLEVBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxXQUFXO1lBQ25DLFdBQVcsRUFBRTtnQkFDWCxtQkFBbUIsRUFBRSxLQUFLLENBQUMsYUFBYSxDQUFDLFNBQVM7YUFDbkQ7WUFDRCxPQUFPLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ2pDLFVBQVUsRUFBRSxHQUFHO1lBQ2YsUUFBUSxFQUFFO2dCQUNSLGVBQWUsRUFBRSxDQUFDLFlBQVksQ0FBQztnQkFDL0IsbUJBQW1CLEVBQUUsS0FBSzthQUMzQjtTQUNGLENBQ0YsQ0FBQztRQUVGLGlEQUFpRDtRQUNqRCxLQUFLLENBQUMsYUFBYSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsMkJBQTJCLENBQUMsQ0FBQztRQUNwRSxLQUFLLENBQUMsU0FBUyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsMkJBQTJCLENBQUMsQ0FBQztRQUNoRSxLQUFLLENBQUMsYUFBYSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsOEJBQThCLENBQUMsQ0FBQztRQUN2RSxLQUFLLENBQUMsU0FBUyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsOEJBQThCLENBQUMsQ0FBQztRQUNuRSxLQUFLLENBQUMsYUFBYSxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxnQ0FBZ0MsQ0FBQyxDQUFDO1FBQzlFLEtBQUssQ0FBQyxhQUFhLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLDBCQUEwQixDQUFDLENBQUM7UUFFeEUsaURBQWlEO1FBQ2pELElBQUksQ0FBQyw2QkFBNkIsR0FBRyxJQUFJLFlBQVksQ0FBQyxjQUFjLENBQ2xFLElBQUksRUFDSiwrQkFBK0IsRUFDL0I7WUFDRSxZQUFZLEVBQUUsVUFBVSxLQUFLLENBQUMsV0FBVywwQkFBMEI7WUFDbkUsS0FBSyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLGtEQUFrRCxDQUFDO1lBQy9FLE9BQU8sRUFBRSxTQUFTO1lBQ2xCLE9BQU8sRUFBRSxNQUFNLENBQUMsT0FBTyxDQUFDLFdBQVc7WUFDbkMsV0FBVyxFQUFFO2dCQUNYLDZCQUE2QixFQUFFLHFCQUFxQixDQUFDLGFBQWE7Z0JBQ2xFLGdDQUFnQyxFQUFFLHdCQUF3QixDQUFDLGFBQWE7Z0JBQ3hFLG9EQUFvRDtnQkFDcEQsaUJBQWlCLEVBQUUsRUFBRSxFQUFFLHFCQUFxQjtnQkFDNUMsMEJBQTBCLEVBQUUsS0FBSyxFQUFFLGtCQUFrQjthQUN0RDtZQUNELE9BQU8sRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDakMsVUFBVSxFQUFFLEdBQUc7WUFDZixRQUFRLEVBQUU7Z0JBQ1IsZUFBZSxFQUFFLENBQUMsWUFBWSxDQUFDO2dCQUMvQixtQkFBbUIsRUFBRSxLQUFLO2FBQzNCO1NBQ0YsQ0FDRixDQUFDO1FBRUYsdUNBQXVDO1FBQ3ZDLHFCQUFxQixDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsNkJBQTZCLENBQUMsQ0FBQztRQUNwRSx3QkFBd0IsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLDZCQUE2QixDQUFDLENBQUM7UUFFdkUsZ0RBQWdEO1FBQ2hELElBQUksQ0FBQyw0QkFBNEIsR0FBRyxJQUFJLFlBQVksQ0FBQyxjQUFjLENBQ2pFLElBQUksRUFDSiw4QkFBOEIsRUFDOUI7WUFDRSxZQUFZLEVBQUUsVUFBVSxLQUFLLENBQUMsV0FBVyx5QkFBeUI7WUFDbEUsS0FBSyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLGlEQUFpRCxDQUFDO1lBQzlFLE9BQU8sRUFBRSxTQUFTO1lBQ2xCLE9BQU8sRUFBRSxNQUFNLENBQUMsT0FBTyxDQUFDLFdBQVc7WUFDbkMsV0FBVyxFQUFFO2dCQUNYLDZCQUE2QixFQUFFLHFCQUFxQixDQUFDLGFBQWE7Z0JBQ2xFLG9DQUFvQyxFQUFFLDRCQUE0QixDQUFDLGFBQWE7Z0JBQ2hGLDhCQUE4QixFQUFFLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxZQUFZO2dCQUN6RSw2QkFBNkIsRUFBRSxLQUFLLENBQUMsYUFBYSxDQUFDLFNBQVMsRUFBRSwrQkFBK0I7Z0JBQzdGLDBCQUEwQixFQUFFLHdCQUF3QjthQUNyRDtZQUNELE9BQU8sRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsRUFBRSx5Q0FBeUM7WUFDNUUsVUFBVSxFQUFFLEdBQUc7WUFDZixRQUFRLEVBQUU7Z0JBQ1IsZUFBZSxFQUFFLENBQUMsWUFBWSxDQUFDO2dCQUMvQixtQkFBbUIsRUFBRSxLQUFLO2FBQzNCO1NBQ0YsQ0FDRixDQUFDO1FBRUYsdUNBQXVDO1FBQ3ZDLHFCQUFxQixDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsNEJBQTRCLENBQUMsQ0FBQztRQUNuRSw0QkFBNEIsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLDRCQUE0QixDQUFDLENBQUM7UUFDMUUsSUFBSSxDQUFDLHVCQUF1QixDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsNEJBQTRCLENBQUMsQ0FBQztRQUM1RSxLQUFLLENBQUMsYUFBYSxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyw0QkFBNEIsQ0FBQyxDQUFDLENBQUMsMkJBQTJCO1FBRXRHLG1EQUFtRDtRQUNuRCxJQUFJLENBQUMsd0JBQXdCLENBQUMsZUFBZSxDQUMzQyxJQUFJLEdBQUcsQ0FBQyxlQUFlLENBQUM7WUFDdEIsT0FBTyxFQUFFLENBQUMsdUJBQXVCLENBQUM7WUFDbEMsU0FBUyxFQUFFLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUM7U0FDeEMsQ0FBQyxDQUNILENBQUM7UUFFRixxQ0FBcUM7UUFDckMsSUFBSSxDQUFDLHlCQUF5QixDQUFDLGVBQWUsQ0FDNUMsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDO1lBQ3RCLE9BQU8sRUFBRSxDQUFDLDZCQUE2QixDQUFDO1lBQ3hDLFNBQVMsRUFBRTtnQkFDVCxlQUFlLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sSUFBSSxHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxPQUFPLGdCQUNwRSxLQUFLLENBQUMsY0FDUixFQUFFO2FBQ0g7U0FDRixDQUFDLENBQ0gsQ0FBQztRQUVGLHFCQUFxQjtRQUNyQixJQUFJLENBQUMsR0FBRyxHQUFHLElBQUksVUFBVSxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsU0FBUyxFQUFFO1lBQ2pELFdBQVcsRUFBRSxVQUFVLEtBQUssQ0FBQyxXQUFXLFdBQVc7WUFDbkQsV0FBVyxFQUFFLGlDQUFpQztZQUM5QyxhQUFhLEVBQUU7Z0JBQ2IsU0FBUyxFQUFFLEtBQUssQ0FBQyxXQUFXO2dCQUM1QixjQUFjLEVBQUUsSUFBSTtnQkFDcEIsZ0JBQWdCLEVBQUUsSUFBSTtnQkFDdEIsWUFBWSxFQUFFLFVBQVUsQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJO2dCQUNoRCxjQUFjLEVBQUUsSUFBSTthQUNyQjtZQUNELDJCQUEyQixFQUFFO2dCQUMzQixZQUFZLEVBQUUsS0FBSyxDQUFDLGNBQWM7Z0JBQ2xDLFlBQVksRUFBRSxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxDQUFDO2dCQUNsRSxZQUFZLEVBQUU7b0JBQ1osY0FBYztvQkFDZCxZQUFZO29CQUNaLGVBQWU7b0JBQ2YsV0FBVztvQkFDWCxzQkFBc0I7aUJBQ3ZCO2dCQUNELGdCQUFnQixFQUFFLElBQUk7YUFDdkI7U0FDRixDQUFDLENBQUM7UUFFSCw0QkFBNEI7UUFDNUIsTUFBTSxVQUFVLEdBQUcsSUFBSSxVQUFVLENBQUMsMEJBQTBCLENBQUMsSUFBSSxFQUFFLG9CQUFvQixFQUFFO1lBQ3ZGLGdCQUFnQixFQUFFLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQztZQUNsQyxjQUFjLEVBQUUsVUFBVSxLQUFLLENBQUMsV0FBVyxhQUFhO1NBQ3pELENBQUMsQ0FBQztRQUVILDhDQUE4QztRQUM5QyxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDckQsTUFBTSxhQUFhLEdBQUcsV0FBVyxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUN2RCxNQUFNLGNBQWMsR0FBRyxhQUFhLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQzdELE1BQU0sZUFBZSxHQUFHLGNBQWMsQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLENBQUM7UUFFOUQsaUJBQWlCO1FBQ2pCLGVBQWUsQ0FBQyxTQUFTLENBQ3ZCLEtBQUssRUFDTCxJQUFJLFVBQVUsQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsc0JBQXNCLENBQUMsRUFDN0Q7WUFDRSxVQUFVO1lBQ1YsaUJBQWlCLEVBQUUsVUFBVSxDQUFDLGlCQUFpQixDQUFDLE9BQU87U0FDeEQsQ0FDRixDQUFDO1FBRUYsK0NBQStDO1FBQy9DLE1BQU0sa0JBQWtCLEdBQUcsY0FBYyxDQUFDLFdBQVcsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUNyRSxrQkFBa0IsQ0FBQyxTQUFTLENBQzFCLEtBQUssRUFDTCxJQUFJLFVBQVUsQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMscUJBQXFCLENBQUMsRUFDNUQ7WUFDRSxVQUFVO1lBQ1YsaUJBQWlCLEVBQUUsVUFBVSxDQUFDLGlCQUFpQixDQUFDLE9BQU87U0FDeEQsQ0FDRixDQUFDO1FBRUYsaUJBQWlCO1FBQ2pCLGVBQWUsQ0FBQyxTQUFTLENBQ3ZCLEtBQUssRUFDTCxJQUFJLFVBQVUsQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMseUJBQXlCLENBQUMsRUFDaEU7WUFDRSxVQUFVO1lBQ1YsaUJBQWlCLEVBQUUsVUFBVSxDQUFDLGlCQUFpQixDQUFDLE9BQU87U0FDeEQsQ0FDRixDQUFDO1FBRUYsb0RBQW9EO1FBQ3BELE1BQU0sdUJBQXVCLEdBQUcsY0FBYyxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBQy9FLHVCQUF1QixDQUFDLFNBQVMsQ0FDL0IsTUFBTSxFQUNOLElBQUksVUFBVSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyw2QkFBNkIsQ0FBQyxFQUNwRTtZQUNFLFVBQVU7WUFDVixpQkFBaUIsRUFBRSxVQUFVLENBQUMsaUJBQWlCLENBQUMsT0FBTztTQUN4RCxDQUNGLENBQUM7UUFFRixnRUFBZ0U7UUFDaEUsTUFBTSxnQkFBZ0IsR0FBRyxXQUFXLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQzdELE1BQU0scUJBQXFCLEdBQUcsZ0JBQWdCLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBRXJFLDJFQUEyRTtRQUMzRSxNQUFNLGtCQUFrQixHQUFHLElBQUksVUFBVSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyw0QkFBNEIsRUFBRTtZQUM3Rix5REFBeUQ7WUFDekQsbUJBQW1CLEVBQUUsVUFBVSxDQUFDLG1CQUFtQixDQUFDLGFBQWE7WUFDakUsZ0JBQWdCLEVBQUU7Z0JBQ2hCLGtCQUFrQixFQUNoQixnRkFBZ0Y7YUFDbkY7U0FDRixDQUFDLENBQUM7UUFFSCxNQUFNLGFBQWEsR0FBRyxxQkFBcUIsQ0FBQyxTQUFTLENBQUMsTUFBTSxFQUFFLGtCQUFrQixFQUFFO1lBQ2hGLDZEQUE2RDtZQUM3RCxpQkFBaUIsRUFBRSxVQUFVLENBQUMsaUJBQWlCLENBQUMsSUFBSTtZQUNwRCxhQUFhLEVBQUU7Z0JBQ2Isa0JBQWtCLEVBQUUsVUFBVSxDQUFDLEtBQUssQ0FBQyxXQUFXO2FBQ2pEO1NBQ0YsQ0FBQyxDQUFDO1FBRUgscUNBQXFDO1FBQ3JDLE1BQU0sdUJBQXVCLEdBQWdDO1lBQzNELFNBQVMsRUFBRSxHQUFHLEVBQUUsMEJBQTBCO1lBQzFDLFVBQVUsRUFBRSxHQUFHLEVBQUUsa0NBQWtDO1NBQ3BELENBQUM7UUFFRiw4Q0FBOEM7UUFDOUMsSUFBSSxVQUFVLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxrQkFBa0IsRUFBRTtZQUNqRCxJQUFJLEVBQUUsVUFBVSxLQUFLLENBQUMsV0FBVyxxQkFBcUI7WUFDdEQsV0FBVyxFQUFFLHdDQUF3QztZQUNyRCxRQUFRLEVBQUUsdUJBQXVCO1lBQ2pDLFNBQVMsRUFBRTtnQkFDVDtvQkFDRSxHQUFHLEVBQUUsSUFBSSxDQUFDLEdBQUc7b0JBQ2IsS0FBSyxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsZUFBZTtvQkFDL0IsUUFBUSxFQUFFO3dCQUNSOzRCQUNFLE1BQU0sRUFBRSxhQUFhOzRCQUNyQixRQUFRLEVBQUUsdUJBQXVCO3lCQUNsQztxQkFDRjtpQkFDRjthQUNGO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsNENBQTRDO1FBQzVDLE1BQU0sZ0JBQWdCLEdBQUcsY0FBYyxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUVoRSwwREFBMEQ7UUFDMUQsZ0JBQWdCLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxJQUFJLFVBQVUsQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsRUFBRTtZQUM1RixVQUFVO1lBQ1YsaUJBQWlCLEVBQUUsVUFBVSxDQUFDLGlCQUFpQixDQUFDLE9BQU87U0FDeEQsQ0FBQyxDQUFDO1FBRUgsd0RBQXdEO1FBQ3hELGtGQUFrRjtRQUVsRix3REFBd0Q7UUFDeEQsTUFBTSxpQkFBaUIsR0FBRyxnQkFBZ0IsQ0FBQyxXQUFXLENBQUMsYUFBYSxDQUFDLENBQUM7UUFFdEUsb0VBQW9FO1FBQ3BFLGlCQUFpQixDQUFDLFNBQVMsQ0FDekIsS0FBSyxFQUNMLElBQUksVUFBVSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxFQUMvRDtZQUNFLFVBQVU7WUFDVixpQkFBaUIsRUFBRSxVQUFVLENBQUMsaUJBQWlCLENBQUMsT0FBTztTQUN4RCxDQUNGLENBQUM7UUFFRiw4QkFBOEI7UUFDOUIsTUFBTSxhQUFhLEdBQUcsV0FBVyxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUV2RCwwREFBMEQ7UUFDMUQsTUFBTSxxQkFBcUIsR0FBRyxhQUFhLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3BFLHFCQUFxQixDQUFDLFNBQVMsQ0FDN0IsS0FBSyxFQUNMLElBQUksVUFBVSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQywyQkFBMkIsQ0FBQyxFQUNsRTtZQUNFLFVBQVU7WUFDVixpQkFBaUIsRUFBRSxVQUFVLENBQUMsaUJBQWlCLENBQUMsT0FBTztTQUN4RCxDQUNGLENBQUM7UUFFRixvREFBb0Q7UUFDcEQsTUFBTSxtQkFBbUIsR0FBRyxxQkFBcUIsQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDMUUsTUFBTSxzQkFBc0IsR0FBRyxtQkFBbUIsQ0FBQyxXQUFXLENBQUMsYUFBYSxDQUFDLENBQUM7UUFFOUUsa0ZBQWtGO1FBQ2xGLHNCQUFzQixDQUFDLFNBQVMsQ0FDOUIsS0FBSyxFQUNMLElBQUksVUFBVSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyw4QkFBOEIsQ0FBQyxFQUNyRTtZQUNFLFVBQVU7WUFDVixpQkFBaUIsRUFBRSxVQUFVLENBQUMsaUJBQWlCLENBQUMsT0FBTztTQUN4RCxDQUNGLENBQUM7UUFFRixnRkFBZ0Y7UUFDaEYsc0JBQXNCLENBQUMsU0FBUyxDQUM5QixRQUFRLEVBQ1IsSUFBSSxVQUFVLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLDBCQUEwQixDQUFDLEVBQ2pFO1lBQ0UsVUFBVTtZQUNWLGlCQUFpQixFQUFFLFVBQVUsQ0FBQyxpQkFBaUIsQ0FBQyxPQUFPO1NBQ3hELENBQ0YsQ0FBQztRQUVGLDJEQUEyRDtRQUMzRCxNQUFNLDBCQUEwQixHQUFHLHNCQUFzQixDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUVoRiw2RkFBNkY7UUFDN0YsMEJBQTBCLENBQUMsU0FBUyxDQUNsQyxPQUFPLEVBQ1AsSUFBSSxVQUFVLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLGdDQUFnQyxDQUFDLEVBQ3ZFO1lBQ0UsVUFBVTtZQUNWLGlCQUFpQixFQUFFLFVBQVUsQ0FBQyxpQkFBaUIsQ0FBQyxPQUFPO1NBQ3hELENBQ0YsQ0FBQztRQUVGLG9EQUFvRDtRQUNwRCxNQUFNLGtCQUFrQixHQUFHLGFBQWEsQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDOUQsa0JBQWtCLENBQUMsU0FBUyxDQUMxQixLQUFLLEVBQ0wsSUFBSSxVQUFVLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLHdCQUF3QixDQUFDLEVBQy9EO1lBQ0UsVUFBVTtZQUNWLGlCQUFpQixFQUFFLFVBQVUsQ0FBQyxpQkFBaUIsQ0FBQyxPQUFPO1NBQ3hELENBQ0YsQ0FBQztRQUVGLGlCQUFpQjtRQUNqQixJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLFFBQVEsRUFBRTtZQUNoQyxLQUFLLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHO1lBQ25CLFdBQVcsRUFBRSxpQkFBaUI7U0FDL0IsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxhQUFhLEVBQUU7WUFDckMsS0FBSyxFQUFFLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLDRCQUE0QjtZQUNsRCxXQUFXLEVBQUUsMkJBQTJCO1NBQ3pDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQTF1QkQsb0NBMHVCQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGFwaWdhdGV3YXkgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXknO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xuaW1wb3J0ICogYXMgbGFtYmRhTm9kZUpzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEtbm9kZWpzJztcbmltcG9ydCAqIGFzIGR5bmFtb2RiIGZyb20gJ2F3cy1jZGstbGliL2F3cy1keW5hbW9kYic7XG5pbXBvcnQgKiBhcyBjb2duaXRvIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jb2duaXRvJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIHNzbSBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc3NtJztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XG5pbXBvcnQgKiBhcyBzM2RlcGxveSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMtZGVwbG95bWVudCc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuXG5leHBvcnQgaW50ZXJmYWNlIEFwaUNvbnN0cnVjdFByb3BzIHtcbiAgZW52aXJvbm1lbnQ6ICdkZXYnIHwgJ3Byb2QnO1xuICB1c2VyVGFibGU6IGR5bmFtb2RiLlRhYmxlO1xuICBuYXRhbENoYXJ0VGFibGU6IGR5bmFtb2RiLlRhYmxlO1xuICByZWFkaW5nc1RhYmxlOiBkeW5hbW9kYi5UYWJsZTtcbiAgdXNlclBvb2w6IGNvZ25pdG8uVXNlclBvb2w7XG4gIHBsYWNlSW5kZXhOYW1lOiBzdHJpbmc7XG4gIGFsbG93ZWRPcmlnaW5zOiBzdHJpbmdbXTtcbiAgc3dpc3NFcGhlbWVyaXNMYXllckFybj86IHN0cmluZzsgLy8gT3B0aW9uYWwgdG8gc3VwcG9ydCBncmFkdWFsIG1pZ3JhdGlvblxufVxuXG5leHBvcnQgY2xhc3MgQXBpQ29uc3RydWN0IGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgcHVibGljIHJlYWRvbmx5IGFwaTogYXBpZ2F0ZXdheS5SZXN0QXBpO1xuICBwdWJsaWMgcmVhZG9ubHkgZ2V0VXNlclByb2ZpbGVGdW5jdGlvbjogbGFtYmRhLkZ1bmN0aW9uO1xuICBwdWJsaWMgcmVhZG9ubHkgdXBkYXRlVXNlclByb2ZpbGVGdW5jdGlvbjogbGFtYmRhLkZ1bmN0aW9uO1xuICBwdWJsaWMgcmVhZG9ubHkgZ2VuZXJhdGVOYXRhbENoYXJ0RnVuY3Rpb246IGxhbWJkYS5GdW5jdGlvbjtcbiAgcHVibGljIHJlYWRvbmx5IGdldE5hdGFsQ2hhcnRGdW5jdGlvbjogbGFtYmRhLkZ1bmN0aW9uO1xuICBwdWJsaWMgcmVhZG9ubHkgZ2VuZXJhdGVSZWFkaW5nRnVuY3Rpb246IGxhbWJkYS5GdW5jdGlvbjtcbiAgcHVibGljIHJlYWRvbmx5IGdldFJlYWRpbmdzRnVuY3Rpb246IGxhbWJkYS5GdW5jdGlvbjtcbiAgcHVibGljIHJlYWRvbmx5IGdldFJlYWRpbmdEZXRhaWxGdW5jdGlvbjogbGFtYmRhLkZ1bmN0aW9uO1xuICBwdWJsaWMgcmVhZG9ubHkgYWRtaW5HZXRBbGxSZWFkaW5nc0Z1bmN0aW9uOiBsYW1iZGEuRnVuY3Rpb247XG4gIHB1YmxpYyByZWFkb25seSBhZG1pbkdldEFsbFVzZXJzRnVuY3Rpb246IGxhbWJkYS5GdW5jdGlvbjtcbiAgcHVibGljIHJlYWRvbmx5IGFkbWluR2V0UmVhZGluZ0RldGFpbHNGdW5jdGlvbjogbGFtYmRhLkZ1bmN0aW9uO1xuICBwdWJsaWMgcmVhZG9ubHkgYWRtaW5VcGRhdGVSZWFkaW5nU3RhdHVzRnVuY3Rpb246IGxhbWJkYS5GdW5jdGlvbjtcbiAgcHVibGljIHJlYWRvbmx5IGFkbWluRGVsZXRlUmVhZGluZ0Z1bmN0aW9uOiBsYW1iZGEuRnVuY3Rpb247XG4gIHB1YmxpYyByZWFkb25seSBjcmVhdGVDaGVja291dFNlc3Npb25GdW5jdGlvbjogbGFtYmRhLkZ1bmN0aW9uO1xuICBwdWJsaWMgcmVhZG9ubHkgc3RyaXBlV2ViaG9va0hhbmRsZXJGdW5jdGlvbjogbGFtYmRhLkZ1bmN0aW9uO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBBcGlDb25zdHJ1Y3RQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICAvLyBDcmVhdGUgUzMgYnVja2V0IGZvciBjb25maWd1cmF0aW9uIGZpbGVzXG4gICAgY29uc3QgY29uZmlnQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCAnQ29uZmlnQnVja2V0Jywge1xuICAgICAgYnVja2V0TmFtZTogYGF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS1jb25maWdgLFxuICAgICAgdmVyc2lvbmVkOiB0cnVlLFxuICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcbiAgICAgIGVuY3J5cHRpb246IHMzLkJ1Y2tldEVuY3J5cHRpb24uUzNfTUFOQUdFRCxcbiAgICAgIHJlbW92YWxQb2xpY3k6XG4gICAgICAgIHByb3BzLmVudmlyb25tZW50ID09PSAncHJvZCcgPyBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4gOiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgYXV0b0RlbGV0ZU9iamVjdHM6IHByb3BzLmVudmlyb25tZW50ICE9PSAncHJvZCcsXG4gICAgICBsaWZlY3ljbGVSdWxlczogW1xuICAgICAgICB7XG4gICAgICAgICAgaWQ6ICdkZWxldGUtb2xkLXZlcnNpb25zJyxcbiAgICAgICAgICBub25jdXJyZW50VmVyc2lvbkV4cGlyYXRpb246IGNkay5EdXJhdGlvbi5kYXlzKDMwKSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBEZXBsb3kgcHJvbXB0IGZpbGVzIHRvIFMzXG4gICAgbmV3IHMzZGVwbG95LkJ1Y2tldERlcGxveW1lbnQodGhpcywgJ0RlcGxveVByb21wdHMnLCB7XG4gICAgICBzb3VyY2VzOiBbXG4gICAgICAgIHMzZGVwbG95LlNvdXJjZS5hc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vYXNzZXRzL3Byb21wdHMnLCBwcm9wcy5lbnZpcm9ubWVudCkpLFxuICAgICAgXSxcbiAgICAgIGRlc3RpbmF0aW9uQnVja2V0OiBjb25maWdCdWNrZXQsXG4gICAgICBkZXN0aW5hdGlvbktleVByZWZpeDogYHByb21wdHMvJHtwcm9wcy5lbnZpcm9ubWVudH1gLFxuICAgICAgcHJ1bmU6IGZhbHNlLFxuICAgICAgcmV0YWluT25EZWxldGU6IHByb3BzLmVudmlyb25tZW50ID09PSAncHJvZCcsXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgU1NNIFBhcmFtZXRlcnMgZm9yIE9wZW5BSSBDb25maWd1cmF0aW9uXG4gICAgY29uc3Qgb3BlbkFpQXBpS2V5UGFyYW1ldGVyID0gbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgJ09wZW5BaUFwaUtleVBhcmFtZXRlcicsIHtcbiAgICAgIHBhcmFtZXRlck5hbWU6IGAvYXVyYTI4LyR7cHJvcHMuZW52aXJvbm1lbnR9L29wZW5haS1hcGkta2V5YCxcbiAgICAgIGRlc2NyaXB0aW9uOiBgT3BlbkFJIEFQSSBrZXkgZm9yICR7cHJvcHMuZW52aXJvbm1lbnR9IGVudmlyb25tZW50YCxcbiAgICAgIHN0cmluZ1ZhbHVlOiAnUExBQ0VIT0xERVJfVE9fQkVfUkVQTEFDRURfTUFOVUFMTFknLFxuICAgICAgdGllcjogc3NtLlBhcmFtZXRlclRpZXIuU1RBTkRBUkQsXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgU1NNIFBhcmFtZXRlcnMgZm9yIFN0cmlwZSBDb25maWd1cmF0aW9uXG4gICAgY29uc3Qgc3RyaXBlQXBpS2V5UGFyYW1ldGVyID0gbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgJ1N0cmlwZUFwaUtleVBhcmFtZXRlcicsIHtcbiAgICAgIHBhcmFtZXRlck5hbWU6IGAvYXVyYTI4LyR7cHJvcHMuZW52aXJvbm1lbnR9L3N0cmlwZS9hcGkta2V5YCxcbiAgICAgIGRlc2NyaXB0aW9uOiBgU3RyaXBlIEFQSSBrZXkgZm9yICR7cHJvcHMuZW52aXJvbm1lbnR9IGVudmlyb25tZW50YCxcbiAgICAgIHN0cmluZ1ZhbHVlOiAnUExBQ0VIT0xERVJfVE9fQkVfUkVQTEFDRURfTUFOVUFMTFknLFxuICAgICAgdGllcjogc3NtLlBhcmFtZXRlclRpZXIuU1RBTkRBUkQsXG4gICAgfSk7XG5cbiAgICAvLyBXZWJob29rIHNlY3JldCBwYXJhbWV0ZXIgZm9yIHdlYmhvb2sgc2lnbmF0dXJlIHZlcmlmaWNhdGlvblxuICAgIGNvbnN0IHN0cmlwZVdlYmhvb2tTZWNyZXRQYXJhbWV0ZXIgPSBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcihcbiAgICAgIHRoaXMsXG4gICAgICAnU3RyaXBlV2ViaG9va1NlY3JldFBhcmFtZXRlcicsXG4gICAgICB7XG4gICAgICAgIHBhcmFtZXRlck5hbWU6IGAvYXVyYTI4LyR7cHJvcHMuZW52aXJvbm1lbnR9L3N0cmlwZS93ZWJob29rLXNlY3JldGAsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBgU3RyaXBlIHdlYmhvb2sgc2VjcmV0IGZvciAke3Byb3BzLmVudmlyb25tZW50fSBlbnZpcm9ubWVudGAsXG4gICAgICAgIHN0cmluZ1ZhbHVlOiAnUExBQ0VIT0xERVJfVE9fQkVfUkVQTEFDRURfTUFOVUFMTFknLFxuICAgICAgICB0aWVyOiBzc20uUGFyYW1ldGVyVGllci5TVEFOREFSRCxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIENyZWF0ZSBTU00gUGFyYW1ldGVyIGZvciBhbGxvd2VkIFN0cmlwZSBwcmljZSBJRHNcbiAgICBjb25zdCBhbGxvd2VkUHJpY2VJZHNQYXJhbWV0ZXIgPSBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcih0aGlzLCAnQWxsb3dlZFByaWNlSWRzUGFyYW1ldGVyJywge1xuICAgICAgcGFyYW1ldGVyTmFtZTogYC9hdXJhMjgvJHtwcm9wcy5lbnZpcm9ubWVudH0vc3RyaXBlL2FsbG93ZWQtcHJpY2UtaWRzYCxcbiAgICAgIGRlc2NyaXB0aW9uOiBgQ29tbWEtc2VwYXJhdGVkIGxpc3Qgb2YgYWxsb3dlZCBTdHJpcGUgcHJpY2UgSURzIGZvciAke3Byb3BzLmVudmlyb25tZW50fSBlbnZpcm9ubWVudGAsXG4gICAgICBzdHJpbmdWYWx1ZTogJ3ByaWNlX3BsYWNlaG9sZGVyXzEscHJpY2VfcGxhY2Vob2xkZXJfMicsIC8vIEluaXRpYWwgcGxhY2Vob2xkZXIgdmFsdWVzXG4gICAgICB0aWVyOiBzc20uUGFyYW1ldGVyVGllci5TVEFOREFSRCxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBTU00gUGFyYW1ldGVyIGZvciBkZWZhdWx0IFN0cmlwZSBwcmljZSBJRCAodXNlZCBieSBmcm9udGVuZCBidWlsZClcbiAgICBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcih0aGlzLCAnRGVmYXVsdFByaWNlSWRQYXJhbWV0ZXInLCB7XG4gICAgICBwYXJhbWV0ZXJOYW1lOiBgL2F1cmEyOC8ke3Byb3BzLmVudmlyb25tZW50fS9zdHJpcGUvZGVmYXVsdC1wcmljZS1pZGAsXG4gICAgICBkZXNjcmlwdGlvbjogYERlZmF1bHQgU3RyaXBlIHByaWNlIElEIGZvciBmcm9udGVuZCBidWlsZCBpbiAke3Byb3BzLmVudmlyb25tZW50fSBlbnZpcm9ubWVudGAsXG4gICAgICBzdHJpbmdWYWx1ZTpcbiAgICAgICAgcHJvcHMuZW52aXJvbm1lbnQgPT09ICdkZXYnXG4gICAgICAgICAgPyAncHJpY2VfMVFiR1h1UnVKREJ6UkpTa0NiRzRhOVhvJyAvLyBFeGlzdGluZyBkZXYgcHJpY2UgSURcbiAgICAgICAgICA6ICdwcmljZV9SRVBMQUNFX1dJVEhfUFJPRFVDVElPTl9JRCcsIC8vIFBsYWNlaG9sZGVyIGZvciBwcm9kdWN0aW9uXG4gICAgICB0aWVyOiBzc20uUGFyYW1ldGVyVGllci5TVEFOREFSRCxcbiAgICB9KTtcblxuICAgIC8vIFNpbXBsaWZpZWQgU1NNIHBhcmFtZXRlcnMgcG9pbnRpbmcgdG8gUzMga2V5c1xuICAgIGNvbnN0IHJlYWRpbmdNb2RlbFBhcmFtZXRlciA9IG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsICdSZWFkaW5nTW9kZWxQYXJhbWV0ZXInLCB7XG4gICAgICBwYXJhbWV0ZXJOYW1lOiBgL2F1cmEyOC8ke3Byb3BzLmVudmlyb25tZW50fS9yZWFkaW5nL21vZGVsYCxcbiAgICAgIGRlc2NyaXB0aW9uOiBgT3BlbkFJIG1vZGVsIGZvciByZWFkaW5ncyBpbiAke3Byb3BzLmVudmlyb25tZW50fSBlbnZpcm9ubWVudGAsXG4gICAgICBzdHJpbmdWYWx1ZTogJ2dwdC00LXR1cmJvLXByZXZpZXcnLFxuICAgICAgdGllcjogc3NtLlBhcmFtZXRlclRpZXIuU1RBTkRBUkQsXG4gICAgfSk7XG5cbiAgICBjb25zdCByZWFkaW5nVGVtcGVyYXR1cmVQYXJhbWV0ZXIgPSBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcihcbiAgICAgIHRoaXMsXG4gICAgICAnUmVhZGluZ1RlbXBlcmF0dXJlUGFyYW1ldGVyJyxcbiAgICAgIHtcbiAgICAgICAgcGFyYW1ldGVyTmFtZTogYC9hdXJhMjgvJHtwcm9wcy5lbnZpcm9ubWVudH0vcmVhZGluZy90ZW1wZXJhdHVyZWAsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBgVGVtcGVyYXR1cmUgZm9yIHJlYWRpbmdzIGluICR7cHJvcHMuZW52aXJvbm1lbnR9IGVudmlyb25tZW50YCxcbiAgICAgICAgc3RyaW5nVmFsdWU6ICcwLjcnLFxuICAgICAgICB0aWVyOiBzc20uUGFyYW1ldGVyVGllci5TVEFOREFSRCxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIGNvbnN0IHJlYWRpbmdNYXhUb2tlbnNQYXJhbWV0ZXIgPSBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcih0aGlzLCAnUmVhZGluZ01heFRva2Vuc1BhcmFtZXRlcicsIHtcbiAgICAgIHBhcmFtZXRlck5hbWU6IGAvYXVyYTI4LyR7cHJvcHMuZW52aXJvbm1lbnR9L3JlYWRpbmcvbWF4X3Rva2Vuc2AsXG4gICAgICBkZXNjcmlwdGlvbjogYE1heCB0b2tlbnMgZm9yIHJlYWRpbmdzIGluICR7cHJvcHMuZW52aXJvbm1lbnR9IGVudmlyb25tZW50YCxcbiAgICAgIHN0cmluZ1ZhbHVlOiAnMjAwMCcsXG4gICAgICB0aWVyOiBzc20uUGFyYW1ldGVyVGllci5TVEFOREFSRCxcbiAgICB9KTtcblxuICAgIGNvbnN0IHN5c3RlbVByb21wdFMzS2V5UGFyYW1ldGVyID0gbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgJ1N5c3RlbVByb21wdFMzS2V5UGFyYW1ldGVyJywge1xuICAgICAgcGFyYW1ldGVyTmFtZTogYC9hdXJhMjgvJHtwcm9wcy5lbnZpcm9ubWVudH0vcmVhZGluZy9zeXN0ZW1fcHJvbXB0X3Mza2V5YCxcbiAgICAgIGRlc2NyaXB0aW9uOiBgUzMga2V5IGZvciBzeXN0ZW0gcHJvbXB0IGluICR7cHJvcHMuZW52aXJvbm1lbnR9IGVudmlyb25tZW50YCxcbiAgICAgIHN0cmluZ1ZhbHVlOiBgcHJvbXB0cy8ke3Byb3BzLmVudmlyb25tZW50fS9zb3VsX2JsdWVwcmludC9zeXN0ZW0udHh0YCxcbiAgICAgIHRpZXI6IHNzbS5QYXJhbWV0ZXJUaWVyLlNUQU5EQVJELFxuICAgIH0pO1xuXG4gICAgY29uc3QgdXNlclByb21wdFMzS2V5UGFyYW1ldGVyID0gbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgJ1VzZXJQcm9tcHRTM0tleVBhcmFtZXRlcicsIHtcbiAgICAgIHBhcmFtZXRlck5hbWU6IGAvYXVyYTI4LyR7cHJvcHMuZW52aXJvbm1lbnR9L3JlYWRpbmcvdXNlcl9wcm9tcHRfczNrZXlgLFxuICAgICAgZGVzY3JpcHRpb246IGBTMyBrZXkgZm9yIHVzZXIgcHJvbXB0IHRlbXBsYXRlIGluICR7cHJvcHMuZW52aXJvbm1lbnR9IGVudmlyb25tZW50YCxcbiAgICAgIHN0cmluZ1ZhbHVlOiBgcHJvbXB0cy8ke3Byb3BzLmVudmlyb25tZW50fS9zb3VsX2JsdWVwcmludC91c2VyX3RlbXBsYXRlLm1kYCxcbiAgICAgIHRpZXI6IHNzbS5QYXJhbWV0ZXJUaWVyLlNUQU5EQVJELFxuICAgIH0pO1xuXG4gICAgLy8gVXNlIHByZS1idWlsdCBTd2lzcyBFcGhlbWVyaXMgTGFtYmRhIExheWVyXG4gICAgLy8gVGhlIGxheWVyIGlzIGJ1aWx0IHZpYSBDb2RlQnVpbGQgb24gQW1hem9uIExpbnV4IDIwMjMgZm9yIGJpbmFyeSBjb21wYXRpYmlsaXR5XG4gICAgLy8gVXNlIHByb3AgaWYgcHJvdmlkZWQgKG5ldyBkZXBsb3ltZW50cyksIG90aGVyd2lzZSBmYWxsIGJhY2sgdG8gU1NNIChleGlzdGluZyBkZXBsb3ltZW50cylcbiAgICBjb25zdCBzd2lzc0VwaGVtZXJpc0xheWVyQXJuID1cbiAgICAgIHByb3BzLnN3aXNzRXBoZW1lcmlzTGF5ZXJBcm4gfHxcbiAgICAgIHNzbS5TdHJpbmdQYXJhbWV0ZXIudmFsdWVGb3JTdHJpbmdQYXJhbWV0ZXIoXG4gICAgICAgIHRoaXMsXG4gICAgICAgIGAvYXVyYTI4LyR7cHJvcHMuZW52aXJvbm1lbnR9L2xheWVycy9zd2V0ZXN0LWFybmAsXG4gICAgICApO1xuXG4gICAgY29uc3Qgc3dpc3NFcGhlbWVyaXNMYXllciA9IGxhbWJkYS5MYXllclZlcnNpb24uZnJvbUxheWVyVmVyc2lvbkFybihcbiAgICAgIHRoaXMsXG4gICAgICAnU3dpc3NFcGhlbWVyaXNMYXllcicsXG4gICAgICBzd2lzc0VwaGVtZXJpc0xheWVyQXJuLFxuICAgICk7XG5cbiAgICAvLyBDcmVhdGUgTGFtYmRhIGZ1bmN0aW9uc1xuICAgIHRoaXMuZ2V0VXNlclByb2ZpbGVGdW5jdGlvbiA9IG5ldyBsYW1iZGFOb2RlSnMuTm9kZWpzRnVuY3Rpb24odGhpcywgJ0dldFVzZXJQcm9maWxlRnVuY3Rpb24nLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6IGBhdXJhMjgtJHtwcm9wcy5lbnZpcm9ubWVudH0tZ2V0LXVzZXItcHJvZmlsZWAsXG4gICAgICBlbnRyeTogcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2xhbWJkYS91c2VyLXByb2ZpbGUvZ2V0LXVzZXItcHJvZmlsZS50cycpLFxuICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBUQUJMRV9OQU1FOiBwcm9wcy51c2VyVGFibGUudGFibGVOYW1lLFxuICAgICAgfSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgIG1lbW9yeVNpemU6IDI1NixcbiAgICAgIGJ1bmRsaW5nOiB7XG4gICAgICAgIGV4dGVybmFsTW9kdWxlczogWydAYXdzLXNkay8qJ10sXG4gICAgICAgIGZvcmNlRG9ja2VyQnVuZGxpbmc6IGZhbHNlLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBnZW5lcmF0ZU5hdGFsQ2hhcnRGdW5jdGlvbiBmaXJzdCwgYmVmb3JlIHVwZGF0ZVVzZXJQcm9maWxlRnVuY3Rpb24gdGhhdCByZWZlcmVuY2VzIGl0XG4gICAgdGhpcy5nZW5lcmF0ZU5hdGFsQ2hhcnRGdW5jdGlvbiA9IG5ldyBsYW1iZGFOb2RlSnMuTm9kZWpzRnVuY3Rpb24oXG4gICAgICB0aGlzLFxuICAgICAgJ0dlbmVyYXRlTmF0YWxDaGFydEZ1bmN0aW9uJyxcbiAgICAgIHtcbiAgICAgICAgZnVuY3Rpb25OYW1lOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LWdlbmVyYXRlLW5hdGFsLWNoYXJ0YCxcbiAgICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9sYW1iZGEvbmF0YWwtY2hhcnQvZ2VuZXJhdGUtbmF0YWwtY2hhcnQudHMnKSxcbiAgICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxuICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCxcbiAgICAgICAgbGF5ZXJzOiBbc3dpc3NFcGhlbWVyaXNMYXllcl0sXG4gICAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgICAgTkFUQUxfQ0hBUlRfVEFCTEVfTkFNRTogcHJvcHMubmF0YWxDaGFydFRhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgICBFUEhFTUVSSVNfUEFUSDogJy9vcHQvbm9kZWpzL25vZGVfbW9kdWxlcy9zd2lzc2VwaC9lcGhlJyxcbiAgICAgICAgICBTRV9FUEhFX1BBVEg6ICcvb3B0L25vZGVqcy9ub2RlX21vZHVsZXMvc3dpc3NlcGgvZXBoZScsXG4gICAgICAgICAgTk9ERV9FTlY6ICdwcm9kdWN0aW9uJywgLy8gRW5zdXJlIHByb2R1Y3Rpb24gbW9kZVxuICAgICAgICB9LFxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygxMCksIC8vIDEwIHNlY29uZHMgZm9yIGhvdXNlIGNhbGN1bGF0aW9uc1xuICAgICAgICBtZW1vcnlTaXplOiA1MTIsIC8vIEluY3JlYXNlZCBtZW1vcnkgZm9yIGVwaGVtZXJpcyBjYWxjdWxhdGlvbnNcbiAgICAgICAgYnVuZGxpbmc6IHtcbiAgICAgICAgICBleHRlcm5hbE1vZHVsZXM6IFsnQGF3cy1zZGsvKicsICdzd2lzc2VwaCddLCAvLyBFeGNsdWRlIHN3aXNzZXBoIHNpbmNlIGl0J3MgaW4gdGhlIGxheWVyXG4gICAgICAgICAgZm9yY2VEb2NrZXJCdW5kbGluZzogZmFsc2UsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICB0aGlzLnVwZGF0ZVVzZXJQcm9maWxlRnVuY3Rpb24gPSBuZXcgbGFtYmRhTm9kZUpzLk5vZGVqc0Z1bmN0aW9uKFxuICAgICAgdGhpcyxcbiAgICAgICdVcGRhdGVVc2VyUHJvZmlsZUZ1bmN0aW9uJyxcbiAgICAgIHtcbiAgICAgICAgZnVuY3Rpb25OYW1lOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LXVwZGF0ZS11c2VyLXByb2ZpbGVgLFxuICAgICAgICBlbnRyeTogcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2xhbWJkYS91c2VyLXByb2ZpbGUvdXBkYXRlLXVzZXItcHJvZmlsZS50cycpLFxuICAgICAgICBoYW5kbGVyOiAnaGFuZGxlcicsXG4gICAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxuICAgICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICAgIFRBQkxFX05BTUU6IHByb3BzLnVzZXJUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgICAgUExBQ0VfSU5ERVhfTkFNRTogcHJvcHMucGxhY2VJbmRleE5hbWUsXG4gICAgICAgICAgR0VORVJBVEVfTkFUQUxfQ0hBUlRfRlVOQ1RJT05fTkFNRTogdGhpcy5nZW5lcmF0ZU5hdGFsQ2hhcnRGdW5jdGlvbi5mdW5jdGlvbk5hbWUsXG4gICAgICAgIH0sXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgICAgbWVtb3J5U2l6ZTogMjU2LFxuICAgICAgICBidW5kbGluZzoge1xuICAgICAgICAgIGV4dGVybmFsTW9kdWxlczogWydAYXdzLXNkay8qJ10sXG4gICAgICAgICAgZm9yY2VEb2NrZXJCdW5kbGluZzogZmFsc2UsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBHcmFudCBEeW5hbW9EQiBwZXJtaXNzaW9uc1xuICAgIHByb3BzLnVzZXJUYWJsZS5ncmFudFJlYWREYXRhKHRoaXMuZ2V0VXNlclByb2ZpbGVGdW5jdGlvbik7XG4gICAgcHJvcHMudXNlclRhYmxlLmdyYW50V3JpdGVEYXRhKHRoaXMudXBkYXRlVXNlclByb2ZpbGVGdW5jdGlvbik7XG4gICAgcHJvcHMubmF0YWxDaGFydFRhYmxlLmdyYW50V3JpdGVEYXRhKHRoaXMuZ2VuZXJhdGVOYXRhbENoYXJ0RnVuY3Rpb24pO1xuXG4gICAgdGhpcy5nZXROYXRhbENoYXJ0RnVuY3Rpb24gPSBuZXcgbGFtYmRhTm9kZUpzLk5vZGVqc0Z1bmN0aW9uKHRoaXMsICdHZXROYXRhbENoYXJ0RnVuY3Rpb24nLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6IGBhdXJhMjgtJHtwcm9wcy5lbnZpcm9ubWVudH0tZ2V0LW5hdGFsLWNoYXJ0YCxcbiAgICAgIGVudHJ5OiBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vbGFtYmRhL25hdGFsLWNoYXJ0L2dldC1uYXRhbC1jaGFydC50cycpLFxuICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBOQVRBTF9DSEFSVF9UQUJMRV9OQU1FOiBwcm9wcy5uYXRhbENoYXJ0VGFibGUudGFibGVOYW1lLFxuICAgICAgfSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgIG1lbW9yeVNpemU6IDI1NixcbiAgICAgIGJ1bmRsaW5nOiB7XG4gICAgICAgIGV4dGVybmFsTW9kdWxlczogWydAYXdzLXNkay8qJ10sXG4gICAgICAgIGZvcmNlRG9ja2VyQnVuZGxpbmc6IGZhbHNlLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIHByb3BzLm5hdGFsQ2hhcnRUYWJsZS5ncmFudFJlYWREYXRhKHRoaXMuZ2V0TmF0YWxDaGFydEZ1bmN0aW9uKTtcblxuICAgIC8vIEdyYW50IGludm9jYXRpb24gcGVybWlzc2lvblxuICAgIHRoaXMuZ2VuZXJhdGVOYXRhbENoYXJ0RnVuY3Rpb24uZ3JhbnRJbnZva2UodGhpcy51cGRhdGVVc2VyUHJvZmlsZUZ1bmN0aW9uKTtcblxuICAgIC8vIEdlbmVyYXRlIGEgdW5pcXVlIGludGVybmFsIGludm9jYXRpb24gc2VjcmV0IGZvciB0aGlzIGVudmlyb25tZW50IChkZWZpbmVkIGVhcmx5IGZvciBib3RoIGZ1bmN0aW9ucylcbiAgICBjb25zdCBpbnRlcm5hbEludm9jYXRpb25TZWNyZXQgPSBgd2ViaG9vay1pbnRlcm5hbC0ke3Byb3BzLmVudmlyb25tZW50fS0ke2Nkay5TdGFjay5vZih0aGlzKS5zdGFja0lkfWA7XG5cbiAgICAvLyBDcmVhdGUgTGFtYmRhIGZ1bmN0aW9ucyBmb3IgcmVhZGluZ3NcbiAgICB0aGlzLmdlbmVyYXRlUmVhZGluZ0Z1bmN0aW9uID0gbmV3IGxhbWJkYU5vZGVKcy5Ob2RlanNGdW5jdGlvbihcbiAgICAgIHRoaXMsXG4gICAgICAnR2VuZXJhdGVSZWFkaW5nRnVuY3Rpb24nLFxuICAgICAge1xuICAgICAgICBmdW5jdGlvbk5hbWU6IGBhdXJhMjgtJHtwcm9wcy5lbnZpcm9ubWVudH0tZ2VuZXJhdGUtcmVhZGluZ2AsXG4gICAgICAgIGVudHJ5OiBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vbGFtYmRhL3JlYWRpbmdzL2dlbmVyYXRlLXJlYWRpbmcudHMnKSxcbiAgICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxuICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCxcbiAgICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICBSRUFESU5HU19UQUJMRV9OQU1FOiBwcm9wcy5yZWFkaW5nc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgICBOQVRBTF9DSEFSVF9UQUJMRV9OQU1FOiBwcm9wcy5uYXRhbENoYXJ0VGFibGUudGFibGVOYW1lLFxuICAgICAgICAgIFVTRVJfVEFCTEVfTkFNRTogcHJvcHMudXNlclRhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgICBDT05GSUdfQlVDS0VUX05BTUU6IGNvbmZpZ0J1Y2tldC5idWNrZXROYW1lLFxuICAgICAgICAgIE9QRU5BSV9BUElfS0VZX1BBUkFNRVRFUl9OQU1FOiBvcGVuQWlBcGlLZXlQYXJhbWV0ZXIucGFyYW1ldGVyTmFtZSxcbiAgICAgICAgICBSRUFESU5HX01PREVMX1BBUkFNRVRFUl9OQU1FOiByZWFkaW5nTW9kZWxQYXJhbWV0ZXIucGFyYW1ldGVyTmFtZSxcbiAgICAgICAgICBSRUFESU5HX1RFTVBFUkFUVVJFX1BBUkFNRVRFUl9OQU1FOiByZWFkaW5nVGVtcGVyYXR1cmVQYXJhbWV0ZXIucGFyYW1ldGVyTmFtZSxcbiAgICAgICAgICBSRUFESU5HX01BWF9UT0tFTlNfUEFSQU1FVEVSX05BTUU6IHJlYWRpbmdNYXhUb2tlbnNQYXJhbWV0ZXIucGFyYW1ldGVyTmFtZSxcbiAgICAgICAgICBTWVNURU1fUFJPTVBUX1MzS0VZX1BBUkFNRVRFUl9OQU1FOiBzeXN0ZW1Qcm9tcHRTM0tleVBhcmFtZXRlci5wYXJhbWV0ZXJOYW1lLFxuICAgICAgICAgIFVTRVJfUFJPTVBUX1MzS0VZX1BBUkFNRVRFUl9OQU1FOiB1c2VyUHJvbXB0UzNLZXlQYXJhbWV0ZXIucGFyYW1ldGVyTmFtZSxcbiAgICAgICAgICBJTlRFUk5BTF9JTlZPQ0FUSU9OX1NFQ1JFVDogaW50ZXJuYWxJbnZvY2F0aW9uU2VjcmV0LFxuICAgICAgICB9LFxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygxMjApLCAvLyBFeHRlbmRlZCB0aW1lb3V0IGZvciBPcGVuQUkgQVBJIGNhbGxzXG4gICAgICAgIG1lbW9yeVNpemU6IDUxMixcbiAgICAgICAgYnVuZGxpbmc6IHtcbiAgICAgICAgICBleHRlcm5hbE1vZHVsZXM6IFsnQGF3cy1zZGsvKiddLFxuICAgICAgICAgIGZvcmNlRG9ja2VyQnVuZGxpbmc6IGZhbHNlLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgdGhpcy5nZXRSZWFkaW5nc0Z1bmN0aW9uID0gbmV3IGxhbWJkYU5vZGVKcy5Ob2RlanNGdW5jdGlvbih0aGlzLCAnR2V0UmVhZGluZ3NGdW5jdGlvbicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogYGF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS1nZXQtcmVhZGluZ3NgLFxuICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9sYW1iZGEvcmVhZGluZ3MvZ2V0LXJlYWRpbmdzLnRzJyksXG4gICAgICBoYW5kbGVyOiAnaGFuZGxlcicsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFJFQURJTkdTX1RBQkxFX05BTUU6IHByb3BzLnJlYWRpbmdzVGFibGUudGFibGVOYW1lLFxuICAgICAgfSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgIG1lbW9yeVNpemU6IDI1NixcbiAgICAgIGJ1bmRsaW5nOiB7XG4gICAgICAgIGV4dGVybmFsTW9kdWxlczogWydAYXdzLXNkay8qJ10sXG4gICAgICAgIGZvcmNlRG9ja2VyQnVuZGxpbmc6IGZhbHNlLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIHRoaXMuZ2V0UmVhZGluZ0RldGFpbEZ1bmN0aW9uID0gbmV3IGxhbWJkYU5vZGVKcy5Ob2RlanNGdW5jdGlvbihcbiAgICAgIHRoaXMsXG4gICAgICAnR2V0UmVhZGluZ0RldGFpbEZ1bmN0aW9uJyxcbiAgICAgIHtcbiAgICAgICAgZnVuY3Rpb25OYW1lOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LWdldC1yZWFkaW5nLWRldGFpbGAsXG4gICAgICAgIGVudHJ5OiBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vbGFtYmRhL3JlYWRpbmdzL2dldC1yZWFkaW5nLWRldGFpbC50cycpLFxuICAgICAgICBoYW5kbGVyOiAnaGFuZGxlcicsXG4gICAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxuICAgICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICAgIFJFQURJTkdTX1RBQkxFX05BTUU6IHByb3BzLnJlYWRpbmdzVGFibGUudGFibGVOYW1lLFxuICAgICAgICB9LFxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICAgIG1lbW9yeVNpemU6IDI1NixcbiAgICAgICAgYnVuZGxpbmc6IHtcbiAgICAgICAgICBleHRlcm5hbE1vZHVsZXM6IFsnQGF3cy1zZGsvKiddLFxuICAgICAgICAgIGZvcmNlRG9ja2VyQnVuZGxpbmc6IGZhbHNlLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gR3JhbnQgRHluYW1vREIgcGVybWlzc2lvbnMgZm9yIHJlYWRpbmdzXG4gICAgcHJvcHMucmVhZGluZ3NUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEodGhpcy5nZW5lcmF0ZVJlYWRpbmdGdW5jdGlvbik7XG4gICAgcHJvcHMucmVhZGluZ3NUYWJsZS5ncmFudFJlYWREYXRhKHRoaXMuZ2V0UmVhZGluZ3NGdW5jdGlvbik7XG4gICAgcHJvcHMucmVhZGluZ3NUYWJsZS5ncmFudFJlYWREYXRhKHRoaXMuZ2V0UmVhZGluZ0RldGFpbEZ1bmN0aW9uKTtcbiAgICBwcm9wcy5uYXRhbENoYXJ0VGFibGUuZ3JhbnRSZWFkRGF0YSh0aGlzLmdlbmVyYXRlUmVhZGluZ0Z1bmN0aW9uKTtcbiAgICBwcm9wcy51c2VyVGFibGUuZ3JhbnRSZWFkRGF0YSh0aGlzLmdlbmVyYXRlUmVhZGluZ0Z1bmN0aW9uKTtcblxuICAgIC8vIEdyYW50IHBlcm1pc3Npb25zIHRvIGdlbmVyYXRlIHJlYWRpbmcgZnVuY3Rpb25cbiAgICAvLyBTU00gcGFyYW1ldGVyIHJlYWQgcGVybWlzc2lvbnNcbiAgICBvcGVuQWlBcGlLZXlQYXJhbWV0ZXIuZ3JhbnRSZWFkKHRoaXMuZ2VuZXJhdGVSZWFkaW5nRnVuY3Rpb24pO1xuICAgIHJlYWRpbmdNb2RlbFBhcmFtZXRlci5ncmFudFJlYWQodGhpcy5nZW5lcmF0ZVJlYWRpbmdGdW5jdGlvbik7XG4gICAgcmVhZGluZ1RlbXBlcmF0dXJlUGFyYW1ldGVyLmdyYW50UmVhZCh0aGlzLmdlbmVyYXRlUmVhZGluZ0Z1bmN0aW9uKTtcbiAgICByZWFkaW5nTWF4VG9rZW5zUGFyYW1ldGVyLmdyYW50UmVhZCh0aGlzLmdlbmVyYXRlUmVhZGluZ0Z1bmN0aW9uKTtcbiAgICBzeXN0ZW1Qcm9tcHRTM0tleVBhcmFtZXRlci5ncmFudFJlYWQodGhpcy5nZW5lcmF0ZVJlYWRpbmdGdW5jdGlvbik7XG4gICAgdXNlclByb21wdFMzS2V5UGFyYW1ldGVyLmdyYW50UmVhZCh0aGlzLmdlbmVyYXRlUmVhZGluZ0Z1bmN0aW9uKTtcblxuICAgIC8vIFMzIGJ1Y2tldCByZWFkIHBlcm1pc3Npb25zIGZvciBjb25maWd1cmF0aW9uIGZpbGVzXG4gICAgY29uZmlnQnVja2V0LmdyYW50UmVhZCh0aGlzLmdlbmVyYXRlUmVhZGluZ0Z1bmN0aW9uKTtcblxuICAgIC8vIENyZWF0ZSBBZG1pbiBMYW1iZGEgZnVuY3Rpb25zXG4gICAgdGhpcy5hZG1pbkdldEFsbFJlYWRpbmdzRnVuY3Rpb24gPSBuZXcgbGFtYmRhTm9kZUpzLk5vZGVqc0Z1bmN0aW9uKFxuICAgICAgdGhpcyxcbiAgICAgICdBZG1pbkdldEFsbFJlYWRpbmdzRnVuY3Rpb24nLFxuICAgICAge1xuICAgICAgICBmdW5jdGlvbk5hbWU6IGBhdXJhMjgtJHtwcm9wcy5lbnZpcm9ubWVudH0tYWRtaW4tZ2V0LWFsbC1yZWFkaW5nc2AsXG4gICAgICAgIGVudHJ5OiBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vbGFtYmRhL2FkbWluL2dldC1hbGwtcmVhZGluZ3MudHMnKSxcbiAgICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxuICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCxcbiAgICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICBSRUFESU5HU19UQUJMRV9OQU1FOiBwcm9wcy5yZWFkaW5nc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgICBVU0VSX1RBQkxFX05BTUU6IHByb3BzLnVzZXJUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIH0sXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgICAgbWVtb3J5U2l6ZTogNTEyLFxuICAgICAgICBidW5kbGluZzoge1xuICAgICAgICAgIGV4dGVybmFsTW9kdWxlczogWydAYXdzLXNkay8qJ10sXG4gICAgICAgICAgZm9yY2VEb2NrZXJCdW5kbGluZzogZmFsc2UsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICB0aGlzLmFkbWluR2V0QWxsVXNlcnNGdW5jdGlvbiA9IG5ldyBsYW1iZGFOb2RlSnMuTm9kZWpzRnVuY3Rpb24oXG4gICAgICB0aGlzLFxuICAgICAgJ0FkbWluR2V0QWxsVXNlcnNGdW5jdGlvbicsXG4gICAgICB7XG4gICAgICAgIGZ1bmN0aW9uTmFtZTogYGF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS1hZG1pbi1nZXQtYWxsLXVzZXJzYCxcbiAgICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9sYW1iZGEvYWRtaW4vZ2V0LWFsbC11c2Vycy50cycpLFxuICAgICAgICBoYW5kbGVyOiAnaGFuZGxlcicsXG4gICAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxuICAgICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICAgIFVTRVJfUE9PTF9JRDogcHJvcHMudXNlclBvb2wudXNlclBvb2xJZCxcbiAgICAgICAgfSxcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgICBtZW1vcnlTaXplOiAyNTYsXG4gICAgICAgIGJ1bmRsaW5nOiB7XG4gICAgICAgICAgZXh0ZXJuYWxNb2R1bGVzOiBbJ0Bhd3Mtc2RrLyonXSxcbiAgICAgICAgICBmb3JjZURvY2tlckJ1bmRsaW5nOiBmYWxzZSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIENyZWF0ZSBhZGRpdGlvbmFsIGFkbWluIExhbWJkYSBmdW5jdGlvbnNcbiAgICB0aGlzLmFkbWluR2V0UmVhZGluZ0RldGFpbHNGdW5jdGlvbiA9IG5ldyBsYW1iZGFOb2RlSnMuTm9kZWpzRnVuY3Rpb24oXG4gICAgICB0aGlzLFxuICAgICAgJ0FkbWluR2V0UmVhZGluZ0RldGFpbHNGdW5jdGlvbicsXG4gICAgICB7XG4gICAgICAgIGZ1bmN0aW9uTmFtZTogYGF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS1hZG1pbi1nZXQtcmVhZGluZy1kZXRhaWxzYCxcbiAgICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9sYW1iZGEvYWRtaW4vZ2V0LXJlYWRpbmctZGV0YWlscy50cycpLFxuICAgICAgICBoYW5kbGVyOiAnaGFuZGxlcicsXG4gICAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxuICAgICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICAgIFJFQURJTkdTX1RBQkxFX05BTUU6IHByb3BzLnJlYWRpbmdzVGFibGUudGFibGVOYW1lLFxuICAgICAgICAgIFVTRVJfVEFCTEVfTkFNRTogcHJvcHMudXNlclRhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgfSxcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgICBtZW1vcnlTaXplOiAyNTYsXG4gICAgICAgIGJ1bmRsaW5nOiB7XG4gICAgICAgICAgZXh0ZXJuYWxNb2R1bGVzOiBbJ0Bhd3Mtc2RrLyonXSxcbiAgICAgICAgICBmb3JjZURvY2tlckJ1bmRsaW5nOiBmYWxzZSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIHRoaXMuYWRtaW5VcGRhdGVSZWFkaW5nU3RhdHVzRnVuY3Rpb24gPSBuZXcgbGFtYmRhTm9kZUpzLk5vZGVqc0Z1bmN0aW9uKFxuICAgICAgdGhpcyxcbiAgICAgICdBZG1pblVwZGF0ZVJlYWRpbmdTdGF0dXNGdW5jdGlvbicsXG4gICAgICB7XG4gICAgICAgIGZ1bmN0aW9uTmFtZTogYGF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS1hZG1pbi11cGRhdGUtcmVhZGluZy1zdGF0dXNgLFxuICAgICAgICBlbnRyeTogcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2xhbWJkYS9hZG1pbi91cGRhdGUtcmVhZGluZy1zdGF0dXMudHMnKSxcbiAgICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxuICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCxcbiAgICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICBSRUFESU5HU19UQUJMRV9OQU1FOiBwcm9wcy5yZWFkaW5nc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgfSxcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgICBtZW1vcnlTaXplOiAyNTYsXG4gICAgICAgIGJ1bmRsaW5nOiB7XG4gICAgICAgICAgZXh0ZXJuYWxNb2R1bGVzOiBbJ0Bhd3Mtc2RrLyonXSxcbiAgICAgICAgICBmb3JjZURvY2tlckJ1bmRsaW5nOiBmYWxzZSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIHRoaXMuYWRtaW5EZWxldGVSZWFkaW5nRnVuY3Rpb24gPSBuZXcgbGFtYmRhTm9kZUpzLk5vZGVqc0Z1bmN0aW9uKFxuICAgICAgdGhpcyxcbiAgICAgICdBZG1pbkRlbGV0ZVJlYWRpbmdGdW5jdGlvbicsXG4gICAgICB7XG4gICAgICAgIGZ1bmN0aW9uTmFtZTogYGF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS1hZG1pbi1kZWxldGUtcmVhZGluZ2AsXG4gICAgICAgIGVudHJ5OiBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vbGFtYmRhL2FkbWluL2RlbGV0ZS1yZWFkaW5nLnRzJyksXG4gICAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcbiAgICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXG4gICAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgICAgUkVBRElOR1NfVEFCTEVfTkFNRTogcHJvcHMucmVhZGluZ3NUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIH0sXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgICAgbWVtb3J5U2l6ZTogMjU2LFxuICAgICAgICBidW5kbGluZzoge1xuICAgICAgICAgIGV4dGVybmFsTW9kdWxlczogWydAYXdzLXNkay8qJ10sXG4gICAgICAgICAgZm9yY2VEb2NrZXJCdW5kbGluZzogZmFsc2UsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBHcmFudCBEeW5hbW9EQiBwZXJtaXNzaW9ucyBmb3IgYWRtaW4gZnVuY3Rpb25zXG4gICAgcHJvcHMucmVhZGluZ3NUYWJsZS5ncmFudFJlYWREYXRhKHRoaXMuYWRtaW5HZXRBbGxSZWFkaW5nc0Z1bmN0aW9uKTtcbiAgICBwcm9wcy51c2VyVGFibGUuZ3JhbnRSZWFkRGF0YSh0aGlzLmFkbWluR2V0QWxsUmVhZGluZ3NGdW5jdGlvbik7XG4gICAgcHJvcHMucmVhZGluZ3NUYWJsZS5ncmFudFJlYWREYXRhKHRoaXMuYWRtaW5HZXRSZWFkaW5nRGV0YWlsc0Z1bmN0aW9uKTtcbiAgICBwcm9wcy51c2VyVGFibGUuZ3JhbnRSZWFkRGF0YSh0aGlzLmFkbWluR2V0UmVhZGluZ0RldGFpbHNGdW5jdGlvbik7XG4gICAgcHJvcHMucmVhZGluZ3NUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEodGhpcy5hZG1pblVwZGF0ZVJlYWRpbmdTdGF0dXNGdW5jdGlvbik7XG4gICAgcHJvcHMucmVhZGluZ3NUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEodGhpcy5hZG1pbkRlbGV0ZVJlYWRpbmdGdW5jdGlvbik7XG5cbiAgICAvLyBDcmVhdGUgU3RyaXBlIENoZWNrb3V0IFNlc3Npb24gTGFtYmRhIGZ1bmN0aW9uXG4gICAgdGhpcy5jcmVhdGVDaGVja291dFNlc3Npb25GdW5jdGlvbiA9IG5ldyBsYW1iZGFOb2RlSnMuTm9kZWpzRnVuY3Rpb24oXG4gICAgICB0aGlzLFxuICAgICAgJ0NyZWF0ZUNoZWNrb3V0U2Vzc2lvbkZ1bmN0aW9uJyxcbiAgICAgIHtcbiAgICAgICAgZnVuY3Rpb25OYW1lOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LWNyZWF0ZS1jaGVja291dC1zZXNzaW9uYCxcbiAgICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9sYW1iZGEvcGF5bWVudHMvY3JlYXRlLWNoZWNrb3V0LXNlc3Npb24udHMnKSxcbiAgICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxuICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCxcbiAgICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICBTVFJJUEVfQVBJX0tFWV9QQVJBTUVURVJfTkFNRTogc3RyaXBlQXBpS2V5UGFyYW1ldGVyLnBhcmFtZXRlck5hbWUsXG4gICAgICAgICAgQUxMT1dFRF9QUklDRV9JRFNfUEFSQU1FVEVSX05BTUU6IGFsbG93ZWRQcmljZUlkc1BhcmFtZXRlci5wYXJhbWV0ZXJOYW1lLFxuICAgICAgICAgIC8vIEtlZXAgZm9yIGJhY2t3YXJkIGNvbXBhdGliaWxpdHkgZHVyaW5nIHRyYW5zaXRpb25cbiAgICAgICAgICBBTExPV0VEX1BSSUNFX0lEUzogJycsIC8vIFdpbGwgYmUgZGVwcmVjYXRlZFxuICAgICAgICAgIFBSSUNFX0lEX0NBQ0hFX1RUTF9TRUNPTkRTOiAnMzAwJywgLy8gNSBtaW51dGVzIGNhY2hlXG4gICAgICAgIH0sXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgICAgbWVtb3J5U2l6ZTogMjU2LFxuICAgICAgICBidW5kbGluZzoge1xuICAgICAgICAgIGV4dGVybmFsTW9kdWxlczogWydAYXdzLXNkay8qJ10sXG4gICAgICAgICAgZm9yY2VEb2NrZXJCdW5kbGluZzogZmFsc2UsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBHcmFudCBTU00gcGFyYW1ldGVyIHJlYWQgcGVybWlzc2lvbnNcbiAgICBzdHJpcGVBcGlLZXlQYXJhbWV0ZXIuZ3JhbnRSZWFkKHRoaXMuY3JlYXRlQ2hlY2tvdXRTZXNzaW9uRnVuY3Rpb24pO1xuICAgIGFsbG93ZWRQcmljZUlkc1BhcmFtZXRlci5ncmFudFJlYWQodGhpcy5jcmVhdGVDaGVja291dFNlc3Npb25GdW5jdGlvbik7XG5cbiAgICAvLyBDcmVhdGUgU3RyaXBlIFdlYmhvb2sgSGFuZGxlciBMYW1iZGEgZnVuY3Rpb25cbiAgICB0aGlzLnN0cmlwZVdlYmhvb2tIYW5kbGVyRnVuY3Rpb24gPSBuZXcgbGFtYmRhTm9kZUpzLk5vZGVqc0Z1bmN0aW9uKFxuICAgICAgdGhpcyxcbiAgICAgICdTdHJpcGVXZWJob29rSGFuZGxlckZ1bmN0aW9uJyxcbiAgICAgIHtcbiAgICAgICAgZnVuY3Rpb25OYW1lOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LXN0cmlwZS13ZWJob29rLWhhbmRsZXJgLFxuICAgICAgICBlbnRyeTogcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2xhbWJkYS9wYXltZW50cy9zdHJpcGUtd2ViaG9vay1oYW5kbGVyLnRzJyksXG4gICAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcbiAgICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXG4gICAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgICAgU1RSSVBFX0FQSV9LRVlfUEFSQU1FVEVSX05BTUU6IHN0cmlwZUFwaUtleVBhcmFtZXRlci5wYXJhbWV0ZXJOYW1lLFxuICAgICAgICAgIFNUUklQRV9XRUJIT09LX1NFQ1JFVF9QQVJBTUVURVJfTkFNRTogc3RyaXBlV2ViaG9va1NlY3JldFBhcmFtZXRlci5wYXJhbWV0ZXJOYW1lLFxuICAgICAgICAgIEdFTkVSQVRFX1JFQURJTkdfRlVOQ1RJT05fTkFNRTogdGhpcy5nZW5lcmF0ZVJlYWRpbmdGdW5jdGlvbi5mdW5jdGlvbk5hbWUsXG4gICAgICAgICAgV0VCSE9PS19QUk9DRVNTSU5HX1RBQkxFX05BTUU6IHByb3BzLnJlYWRpbmdzVGFibGUudGFibGVOYW1lLCAvLyBSZXVzZSByZWFkaW5ncyB0YWJsZSBmb3Igbm93XG4gICAgICAgICAgSU5URVJOQUxfSU5WT0NBVElPTl9TRUNSRVQ6IGludGVybmFsSW52b2NhdGlvblNlY3JldCxcbiAgICAgICAgfSxcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLCAvLyBSZWR1Y2VkIHRpbWVvdXQgZm9yIHdlYmhvb2sgcHJvY2Vzc2luZ1xuICAgICAgICBtZW1vcnlTaXplOiAyNTYsXG4gICAgICAgIGJ1bmRsaW5nOiB7XG4gICAgICAgICAgZXh0ZXJuYWxNb2R1bGVzOiBbJ0Bhd3Mtc2RrLyonXSxcbiAgICAgICAgICBmb3JjZURvY2tlckJ1bmRsaW5nOiBmYWxzZSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIEdyYW50IHBlcm1pc3Npb25zIHRvIHdlYmhvb2sgaGFuZGxlclxuICAgIHN0cmlwZUFwaUtleVBhcmFtZXRlci5ncmFudFJlYWQodGhpcy5zdHJpcGVXZWJob29rSGFuZGxlckZ1bmN0aW9uKTtcbiAgICBzdHJpcGVXZWJob29rU2VjcmV0UGFyYW1ldGVyLmdyYW50UmVhZCh0aGlzLnN0cmlwZVdlYmhvb2tIYW5kbGVyRnVuY3Rpb24pO1xuICAgIHRoaXMuZ2VuZXJhdGVSZWFkaW5nRnVuY3Rpb24uZ3JhbnRJbnZva2UodGhpcy5zdHJpcGVXZWJob29rSGFuZGxlckZ1bmN0aW9uKTtcbiAgICBwcm9wcy5yZWFkaW5nc1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YSh0aGlzLnN0cmlwZVdlYmhvb2tIYW5kbGVyRnVuY3Rpb24pOyAvLyBGb3IgaWRlbXBvdGVuY3kgdHJhY2tpbmdcblxuICAgIC8vIEdyYW50IENvZ25pdG8gcGVybWlzc2lvbnMgZm9yIGFkbWluIHVzZXIgbGlzdGluZ1xuICAgIHRoaXMuYWRtaW5HZXRBbGxVc2Vyc0Z1bmN0aW9uLmFkZFRvUm9sZVBvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgYWN0aW9uczogWydjb2duaXRvLWlkcDpMaXN0VXNlcnMnXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbcHJvcHMudXNlclBvb2wudXNlclBvb2xBcm5dLFxuICAgICAgfSksXG4gICAgKTtcblxuICAgIC8vIEdyYW50IExvY2F0aW9uIFNlcnZpY2UgcGVybWlzc2lvbnNcbiAgICB0aGlzLnVwZGF0ZVVzZXJQcm9maWxlRnVuY3Rpb24uYWRkVG9Sb2xlUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBhY3Rpb25zOiBbJ2dlbzpTZWFyY2hQbGFjZUluZGV4Rm9yVGV4dCddLFxuICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICBgYXJuOmF3czpnZW86JHtjZGsuU3RhY2sub2YodGhpcykucmVnaW9ufToke2Nkay5TdGFjay5vZih0aGlzKS5hY2NvdW50fTpwbGFjZS1pbmRleC8ke1xuICAgICAgICAgICAgcHJvcHMucGxhY2VJbmRleE5hbWVcbiAgICAgICAgICB9YCxcbiAgICAgICAgXSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICAvLyBDcmVhdGUgQVBJIEdhdGV3YXlcbiAgICB0aGlzLmFwaSA9IG5ldyBhcGlnYXRld2F5LlJlc3RBcGkodGhpcywgJ1VzZXJBcGknLCB7XG4gICAgICByZXN0QXBpTmFtZTogYGF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS11c2VyLWFwaWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ0FQSSBmb3IgdXNlciBwcm9maWxlIG1hbmFnZW1lbnQnLFxuICAgICAgZGVwbG95T3B0aW9uczoge1xuICAgICAgICBzdGFnZU5hbWU6IHByb3BzLmVudmlyb25tZW50LFxuICAgICAgICB0cmFjaW5nRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgZGF0YVRyYWNlRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgbG9nZ2luZ0xldmVsOiBhcGlnYXRld2F5Lk1ldGhvZExvZ2dpbmdMZXZlbC5JTkZPLFxuICAgICAgICBtZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBkZWZhdWx0Q29yc1ByZWZsaWdodE9wdGlvbnM6IHtcbiAgICAgICAgYWxsb3dPcmlnaW5zOiBwcm9wcy5hbGxvd2VkT3JpZ2lucyxcbiAgICAgICAgYWxsb3dNZXRob2RzOiBbJ0dFVCcsICdQVVQnLCAnUE9TVCcsICdQQVRDSCcsICdERUxFVEUnLCAnT1BUSU9OUyddLFxuICAgICAgICBhbGxvd0hlYWRlcnM6IFtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJyxcbiAgICAgICAgICAnWC1BbXotRGF0ZScsXG4gICAgICAgICAgJ0F1dGhvcml6YXRpb24nLFxuICAgICAgICAgICdYLUFwaS1LZXknLFxuICAgICAgICAgICdYLUFtei1TZWN1cml0eS1Ub2tlbicsXG4gICAgICAgIF0sXG4gICAgICAgIGFsbG93Q3JlZGVudGlhbHM6IHRydWUsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIENvZ25pdG8gYXV0aG9yaXplclxuICAgIGNvbnN0IGF1dGhvcml6ZXIgPSBuZXcgYXBpZ2F0ZXdheS5Db2duaXRvVXNlclBvb2xzQXV0aG9yaXplcih0aGlzLCAnVXNlclBvb2xBdXRob3JpemVyJywge1xuICAgICAgY29nbml0b1VzZXJQb29sczogW3Byb3BzLnVzZXJQb29sXSxcbiAgICAgIGF1dGhvcml6ZXJOYW1lOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LWF1dGhvcml6ZXJgLFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIC9hcGkvdXNlcnMve3VzZXJJZH0vcHJvZmlsZSByZXNvdXJjZVxuICAgIGNvbnN0IGFwaVJlc291cmNlID0gdGhpcy5hcGkucm9vdC5hZGRSZXNvdXJjZSgnYXBpJyk7XG4gICAgY29uc3QgdXNlcnNSZXNvdXJjZSA9IGFwaVJlc291cmNlLmFkZFJlc291cmNlKCd1c2VycycpO1xuICAgIGNvbnN0IHVzZXJJZFJlc291cmNlID0gdXNlcnNSZXNvdXJjZS5hZGRSZXNvdXJjZSgne3VzZXJJZH0nKTtcbiAgICBjb25zdCBwcm9maWxlUmVzb3VyY2UgPSB1c2VySWRSZXNvdXJjZS5hZGRSZXNvdXJjZSgncHJvZmlsZScpO1xuXG4gICAgLy8gQWRkIEdFVCBtZXRob2RcbiAgICBwcm9maWxlUmVzb3VyY2UuYWRkTWV0aG9kKFxuICAgICAgJ0dFVCcsXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbih0aGlzLmdldFVzZXJQcm9maWxlRnVuY3Rpb24pLFxuICAgICAge1xuICAgICAgICBhdXRob3JpemVyLFxuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gQWRkIC9hcGkvdXNlcnMve3VzZXJJZH0vbmF0YWwtY2hhcnQgcmVzb3VyY2VcbiAgICBjb25zdCBuYXRhbENoYXJ0UmVzb3VyY2UgPSB1c2VySWRSZXNvdXJjZS5hZGRSZXNvdXJjZSgnbmF0YWwtY2hhcnQnKTtcbiAgICBuYXRhbENoYXJ0UmVzb3VyY2UuYWRkTWV0aG9kKFxuICAgICAgJ0dFVCcsXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbih0aGlzLmdldE5hdGFsQ2hhcnRGdW5jdGlvbiksXG4gICAgICB7XG4gICAgICAgIGF1dGhvcml6ZXIsXG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBBZGQgUFVUIG1ldGhvZFxuICAgIHByb2ZpbGVSZXNvdXJjZS5hZGRNZXRob2QoXG4gICAgICAnUFVUJyxcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHRoaXMudXBkYXRlVXNlclByb2ZpbGVGdW5jdGlvbiksXG4gICAgICB7XG4gICAgICAgIGF1dGhvcml6ZXIsXG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBBZGQgL2FwaS91c2Vycy97dXNlcklkfS9jaGVja291dC1zZXNzaW9uIHJlc291cmNlXG4gICAgY29uc3QgY2hlY2tvdXRTZXNzaW9uUmVzb3VyY2UgPSB1c2VySWRSZXNvdXJjZS5hZGRSZXNvdXJjZSgnY2hlY2tvdXQtc2Vzc2lvbicpO1xuICAgIGNoZWNrb3V0U2Vzc2lvblJlc291cmNlLmFkZE1ldGhvZChcbiAgICAgICdQT1NUJyxcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHRoaXMuY3JlYXRlQ2hlY2tvdXRTZXNzaW9uRnVuY3Rpb24pLFxuICAgICAge1xuICAgICAgICBhdXRob3JpemVyLFxuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gQWRkIC9hcGkvd2ViaG9va3Mvc3RyaXBlIHJlc291cmNlIChwdWJsaWMsIG5vIGF1dGhlbnRpY2F0aW9uKVxuICAgIGNvbnN0IHdlYmhvb2tzUmVzb3VyY2UgPSBhcGlSZXNvdXJjZS5hZGRSZXNvdXJjZSgnd2ViaG9va3MnKTtcbiAgICBjb25zdCBzdHJpcGVXZWJob29rUmVzb3VyY2UgPSB3ZWJob29rc1Jlc291cmNlLmFkZFJlc291cmNlKCdzdHJpcGUnKTtcblxuICAgIC8vIENvbmZpZ3VyZSB3ZWJob29rIGVuZHBvaW50IHRvIGhhbmRsZSByYXcgYm9keSBmb3Igc2lnbmF0dXJlIHZlcmlmaWNhdGlvblxuICAgIGNvbnN0IHdlYmhvb2tJbnRlZ3JhdGlvbiA9IG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHRoaXMuc3RyaXBlV2ViaG9va0hhbmRsZXJGdW5jdGlvbiwge1xuICAgICAgLy8gUGFzcyB0aGUgcmF3IGJvZHkgdG8gTGFtYmRhIGZvciBzaWduYXR1cmUgdmVyaWZpY2F0aW9uXG4gICAgICBwYXNzdGhyb3VnaEJlaGF2aW9yOiBhcGlnYXRld2F5LlBhc3N0aHJvdWdoQmVoYXZpb3IuV0hFTl9OT19NQVRDSCxcbiAgICAgIHJlcXVlc3RUZW1wbGF0ZXM6IHtcbiAgICAgICAgJ2FwcGxpY2F0aW9uL2pzb24nOlxuICAgICAgICAgICd7XCJib2R5XCI6IFwiJHV0aWwuYmFzZTY0RW5jb2RlKCRpbnB1dC5ib2R5KVwiLCBcImhlYWRlcnNcIjogJGlucHV0LnBhcmFtcygpLmhlYWRlcn0nLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGNvbnN0IHdlYmhvb2tNZXRob2QgPSBzdHJpcGVXZWJob29rUmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgd2ViaG9va0ludGVncmF0aW9uLCB7XG4gICAgICAvLyBObyBhdXRob3JpemF0aW9uIC0gU3RyaXBlIHdpbGwgY2FsbCB0aGlzIGVuZHBvaW50IGRpcmVjdGx5XG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5OT05FLFxuICAgICAgcmVxdWVzdE1vZGVsczoge1xuICAgICAgICAnYXBwbGljYXRpb24vanNvbic6IGFwaWdhdGV3YXkuTW9kZWwuRU1QVFlfTU9ERUwsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQWRkIHJhdGUgbGltaXRpbmcgdG8gcHJldmVudCBhYnVzZVxuICAgIGNvbnN0IHdlYmhvb2tUaHJvdHRsZVNldHRpbmdzOiBhcGlnYXRld2F5LlRocm90dGxlU2V0dGluZ3MgPSB7XG4gICAgICByYXRlTGltaXQ6IDEwMCwgLy8gMTAwIHJlcXVlc3RzIHBlciBzZWNvbmRcbiAgICAgIGJ1cnN0TGltaXQ6IDIwMCwgLy8gQWxsb3cgYnVyc3RzIHVwIHRvIDIwMCByZXF1ZXN0c1xuICAgIH07XG5cbiAgICAvLyBDcmVhdGUgdXNhZ2UgcGxhbiBmb3Igd2ViaG9vayByYXRlIGxpbWl0aW5nXG4gICAgbmV3IGFwaWdhdGV3YXkuVXNhZ2VQbGFuKHRoaXMsICdXZWJob29rVXNhZ2VQbGFuJywge1xuICAgICAgbmFtZTogYGF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS13ZWJob29rLXVzYWdlLXBsYW5gLFxuICAgICAgZGVzY3JpcHRpb246ICdVc2FnZSBwbGFuIGZvciBTdHJpcGUgd2ViaG9vayBlbmRwb2ludCcsXG4gICAgICB0aHJvdHRsZTogd2ViaG9va1Rocm90dGxlU2V0dGluZ3MsXG4gICAgICBhcGlTdGFnZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGFwaTogdGhpcy5hcGksXG4gICAgICAgICAgc3RhZ2U6IHRoaXMuYXBpLmRlcGxveW1lbnRTdGFnZSxcbiAgICAgICAgICB0aHJvdHRsZTogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBtZXRob2Q6IHdlYmhvb2tNZXRob2QsXG4gICAgICAgICAgICAgIHRocm90dGxlOiB3ZWJob29rVGhyb3R0bGVTZXR0aW5ncyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgXSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgL2FwaS91c2Vycy97dXNlcklkfS9yZWFkaW5ncyByZXNvdXJjZVxuICAgIGNvbnN0IHJlYWRpbmdzUmVzb3VyY2UgPSB1c2VySWRSZXNvdXJjZS5hZGRSZXNvdXJjZSgncmVhZGluZ3MnKTtcblxuICAgIC8vIEdFVCAvYXBpL3VzZXJzL3t1c2VySWR9L3JlYWRpbmdzIC0gTGlzdCB1c2VyJ3MgcmVhZGluZ3NcbiAgICByZWFkaW5nc1Jlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24odGhpcy5nZXRSZWFkaW5nc0Z1bmN0aW9uKSwge1xuICAgICAgYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG5cbiAgICAvLyBQT1NUIGVuZHBvaW50IGZvciByZWFkaW5nIGdlbmVyYXRpb24gaGFzIGJlZW4gcmVtb3ZlZFxuICAgIC8vIFJlYWRpbmdzIGFyZSBub3cgb25seSBnZW5lcmF0ZWQgdGhyb3VnaCBTdHJpcGUgd2ViaG9vayBhZnRlciBzdWNjZXNzZnVsIHBheW1lbnRcblxuICAgIC8vIEFkZCAvYXBpL3VzZXJzL3t1c2VySWR9L3JlYWRpbmdzL3tyZWFkaW5nSWR9IHJlc291cmNlXG4gICAgY29uc3QgcmVhZGluZ0lkUmVzb3VyY2UgPSByZWFkaW5nc1Jlc291cmNlLmFkZFJlc291cmNlKCd7cmVhZGluZ0lkfScpO1xuXG4gICAgLy8gR0VUIC9hcGkvdXNlcnMve3VzZXJJZH0vcmVhZGluZ3Mve3JlYWRpbmdJZH0gLSBHZXQgcmVhZGluZyBkZXRhaWxcbiAgICByZWFkaW5nSWRSZXNvdXJjZS5hZGRNZXRob2QoXG4gICAgICAnR0VUJyxcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHRoaXMuZ2V0UmVhZGluZ0RldGFpbEZ1bmN0aW9uKSxcbiAgICAgIHtcbiAgICAgICAgYXV0aG9yaXplcixcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIENyZWF0ZSAvYXBpL2FkbWluIHJlc291cmNlc1xuICAgIGNvbnN0IGFkbWluUmVzb3VyY2UgPSBhcGlSZXNvdXJjZS5hZGRSZXNvdXJjZSgnYWRtaW4nKTtcblxuICAgIC8vIEdFVCAvYXBpL2FkbWluL3JlYWRpbmdzIC0gR2V0IGFsbCByZWFkaW5ncyAoYWRtaW4gb25seSlcbiAgICBjb25zdCBhZG1pblJlYWRpbmdzUmVzb3VyY2UgPSBhZG1pblJlc291cmNlLmFkZFJlc291cmNlKCdyZWFkaW5ncycpO1xuICAgIGFkbWluUmVhZGluZ3NSZXNvdXJjZS5hZGRNZXRob2QoXG4gICAgICAnR0VUJyxcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHRoaXMuYWRtaW5HZXRBbGxSZWFkaW5nc0Z1bmN0aW9uKSxcbiAgICAgIHtcbiAgICAgICAgYXV0aG9yaXplcixcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIC9hcGkvYWRtaW4vcmVhZGluZ3Mve3VzZXJJZH0ve3JlYWRpbmdJZH0gcmVzb3VyY2VcbiAgICBjb25zdCBhZG1pblVzZXJJZFJlc291cmNlID0gYWRtaW5SZWFkaW5nc1Jlc291cmNlLmFkZFJlc291cmNlKCd7dXNlcklkfScpO1xuICAgIGNvbnN0IGFkbWluUmVhZGluZ0lkUmVzb3VyY2UgPSBhZG1pblVzZXJJZFJlc291cmNlLmFkZFJlc291cmNlKCd7cmVhZGluZ0lkfScpO1xuXG4gICAgLy8gR0VUIC9hcGkvYWRtaW4vcmVhZGluZ3Mve3VzZXJJZH0ve3JlYWRpbmdJZH0gLSBHZXQgcmVhZGluZyBkZXRhaWxzIChhZG1pbiBvbmx5KVxuICAgIGFkbWluUmVhZGluZ0lkUmVzb3VyY2UuYWRkTWV0aG9kKFxuICAgICAgJ0dFVCcsXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbih0aGlzLmFkbWluR2V0UmVhZGluZ0RldGFpbHNGdW5jdGlvbiksXG4gICAgICB7XG4gICAgICAgIGF1dGhvcml6ZXIsXG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBERUxFVEUgL2FwaS9hZG1pbi9yZWFkaW5ncy97dXNlcklkfS97cmVhZGluZ0lkfSAtIERlbGV0ZSByZWFkaW5nIChhZG1pbiBvbmx5KVxuICAgIGFkbWluUmVhZGluZ0lkUmVzb3VyY2UuYWRkTWV0aG9kKFxuICAgICAgJ0RFTEVURScsXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbih0aGlzLmFkbWluRGVsZXRlUmVhZGluZ0Z1bmN0aW9uKSxcbiAgICAgIHtcbiAgICAgICAgYXV0aG9yaXplcixcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIC9hcGkvYWRtaW4vcmVhZGluZ3Mve3VzZXJJZH0ve3JlYWRpbmdJZH0vc3RhdHVzIHJlc291cmNlXG4gICAgY29uc3QgYWRtaW5SZWFkaW5nU3RhdHVzUmVzb3VyY2UgPSBhZG1pblJlYWRpbmdJZFJlc291cmNlLmFkZFJlc291cmNlKCdzdGF0dXMnKTtcblxuICAgIC8vIFBBVENIIC9hcGkvYWRtaW4vcmVhZGluZ3Mve3VzZXJJZH0ve3JlYWRpbmdJZH0vc3RhdHVzIC0gVXBkYXRlIHJlYWRpbmcgc3RhdHVzIChhZG1pbiBvbmx5KVxuICAgIGFkbWluUmVhZGluZ1N0YXR1c1Jlc291cmNlLmFkZE1ldGhvZChcbiAgICAgICdQQVRDSCcsXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbih0aGlzLmFkbWluVXBkYXRlUmVhZGluZ1N0YXR1c0Z1bmN0aW9uKSxcbiAgICAgIHtcbiAgICAgICAgYXV0aG9yaXplcixcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIEdFVCAvYXBpL2FkbWluL3VzZXJzIC0gR2V0IGFsbCB1c2VycyAoYWRtaW4gb25seSlcbiAgICBjb25zdCBhZG1pblVzZXJzUmVzb3VyY2UgPSBhZG1pblJlc291cmNlLmFkZFJlc291cmNlKCd1c2VycycpO1xuICAgIGFkbWluVXNlcnNSZXNvdXJjZS5hZGRNZXRob2QoXG4gICAgICAnR0VUJyxcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHRoaXMuYWRtaW5HZXRBbGxVc2Vyc0Z1bmN0aW9uKSxcbiAgICAgIHtcbiAgICAgICAgYXV0aG9yaXplcixcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIE91dHB1dCBBUEkgVVJMXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FwaVVybCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmFwaS51cmwsXG4gICAgICBkZXNjcmlwdGlvbjogJ0FQSSBHYXRld2F5IFVSTCcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQXBpRW5kcG9pbnQnLCB7XG4gICAgICB2YWx1ZTogYCR7dGhpcy5hcGkudXJsfWFwaS91c2Vycy97dXNlcklkfS9wcm9maWxlYCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnVXNlciBQcm9maWxlIEFQSSBFbmRwb2ludCcsXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==