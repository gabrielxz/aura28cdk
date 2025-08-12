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
const path = __importStar(require("path"));
class ApiConstruct extends constructs_1.Construct {
    api;
    getUserProfileFunction;
    updateUserProfileFunction;
    generateNatalChartFunction;
    getNatalChartFunction;
    constructor(scope, id, props) {
        super(scope, id);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBpLWNvbnN0cnVjdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImFwaS1jb25zdHJ1Y3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSwyQ0FBdUM7QUFDdkMsaURBQW1DO0FBQ25DLHVFQUF5RDtBQUN6RCwrREFBaUQ7QUFDakQsNEVBQThEO0FBRzlELHlEQUEyQztBQUMzQywyQ0FBNkI7QUFXN0IsTUFBYSxZQUFhLFNBQVEsc0JBQVM7SUFDekIsR0FBRyxDQUFxQjtJQUN4QixzQkFBc0IsQ0FBa0I7SUFDeEMseUJBQXlCLENBQWtCO0lBQzNDLDBCQUEwQixDQUFrQjtJQUM1QyxxQkFBcUIsQ0FBa0I7SUFFdkQsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUF3QjtRQUNoRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLHNDQUFzQztRQUN0QyxNQUFNLG1CQUFtQixHQUFHLElBQUksTUFBTSxDQUFDLFlBQVksQ0FBQyxJQUFJLEVBQUUscUJBQXFCLEVBQUU7WUFDL0UsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLHNCQUFzQixDQUFDLEVBQUU7Z0JBQ3hFLFFBQVEsRUFBRTtvQkFDUixLQUFLLEVBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsYUFBYTtvQkFDL0MsSUFBSSxFQUFFLE1BQU07b0JBQ1osT0FBTyxFQUFFO3dCQUNQLE1BQU07d0JBQ04sSUFBSTt3QkFDSjs0QkFDRSwrQkFBK0I7NEJBQy9CLHlEQUF5RDs0QkFDekQseUJBQXlCOzRCQUN6QixhQUFhO3lCQUNkLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQztxQkFDZjtpQkFDRjthQUNGLENBQUM7WUFDRixrQkFBa0IsRUFBRSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDO1lBQ2hELFdB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LElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsYUFBYSxFQUFFO1lBQ3JDLEtBQUssRUFBRSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyw0QkFBNEI7WUFDbEQsV0FBVyxFQUFFLDJCQUEyQjtTQUN6QyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUFwTkQsb0NBb05DIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgYXBpZ2F0ZXdheSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtYXBpZ2F0ZXdheSc7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XG5pbXBvcnQgKiBhcyBsYW1iZGFOb2RlSnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYS1ub2RlanMnO1xuaW1wb3J0ICogYXMgZHluYW1vZGIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWR5bmFtb2RiJztcbmltcG9ydCAqIGFzIGNvZ25pdG8gZnJvbSAnYXdzLWNkay1saWIvYXdzLWNvZ25pdG8nO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcblxuZXhwb3J0IGludGVyZmFjZSBBcGlDb25zdHJ1Y3RQcm9wcyB7XG4gIGVudmlyb25tZW50OiAnZGV2JyB8ICdwcm9kJztcbiAgdXNlclRhYmxlOiBkeW5hbW9kYi5UYWJsZTtcbiAgbmF0YWxDaGFydFRhYmxlOiBkeW5hbW9kYi5UYWJsZTtcbiAgdXNlclBvb2w6IGNvZ25pdG8uVXNlclBvb2w7XG4gIHBsYWNlSW5kZXhOYW1lOiBzdHJpbmc7XG4gIGFsbG93ZWRPcmlnaW5zOiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGNsYXNzIEFwaUNvbnN0cnVjdCBleHRlbmRzIENvbnN0cnVjdCB7XG4gIHB1YmxpYyByZWFkb25seSBhcGk6IGFwaWdhdGV3YXkuUmVzdEFwaTtcbiAgcHVibGljIHJlYWRvbmx5IGdldFVzZXJQcm9maWxlRnVuY3Rpb246IGxhbWJkYS5GdW5jdGlvbjtcbiAgcHVibGljIHJlYWRvbmx5IHVwZGF0ZVVzZXJQcm9maWxlRnVuY3Rpb246IGxhbWJkYS5GdW5jdGlvbjtcbiAgcHVibGljIHJlYWRvbmx5IGdlbmVyYXRlTmF0YWxDaGFydEZ1bmN0aW9uOiBsYW1iZGEuRnVuY3Rpb247XG4gIHB1YmxpYyByZWFkb25seSBnZXROYXRhbENoYXJ0RnVuY3Rpb246IGxhbWJkYS5GdW5jdGlvbjtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogQXBpQ29uc3RydWN0UHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgLy8gQ3JlYXRlIFN3aXNzIEVwaGVtZXJpcyBMYW1iZGEgTGF5ZXJcbiAgICBjb25zdCBzd2lzc0VwaGVtZXJpc0xheWVyID0gbmV3IGxhbWJkYS5MYXllclZlcnNpb24odGhpcywgJ1N3aXNzRXBoZW1lcmlzTGF5ZXInLCB7XG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2xheWVycy9zd2V0ZXN0JyksIHtcbiAgICAgICAgYnVuZGxpbmc6IHtcbiAgICAgICAgICBpbWFnZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1guYnVuZGxpbmdJbWFnZSxcbiAgICAgICAgICB1c2VyOiAncm9vdCcsXG4gICAgICAgICAgY29tbWFuZDogW1xuICAgICAgICAgICAgJ2Jhc2gnLFxuICAgICAgICAgICAgJy1jJyxcbiAgICAgICAgICAgIFtcbiAgICAgICAgICAgICAgJ21rZGlyIC1wIC9hc3NldC1vdXRwdXQvbm9kZWpzJyxcbiAgICAgICAgICAgICAgJ2NwIHBhY2thZ2UuanNvbiBwYWNrYWdlLWxvY2suanNvbiAvYXNzZXQtb3V0cHV0L25vZGVqcy8nLFxuICAgICAgICAgICAgICAnY2QgL2Fzc2V0LW91dHB1dC9ub2RlanMnLFxuICAgICAgICAgICAgICAnbnBtIGluc3RhbGwnLFxuICAgICAgICAgICAgXS5qb2luKCcgJiYgJyksXG4gICAgICAgICAgXSxcbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgICAgY29tcGF0aWJsZVJ1bnRpbWVzOiBbbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1hdLFxuICAgICAgZGVzY3JpcHRpb246ICdTd2lzcyBFcGhlbWVyaXMgbGlicmFyeSBmb3IgaG91c2UgY2FsY3VsYXRpb25zJyxcbiAgICAgIGxheWVyVmVyc2lvbk5hbWU6IGBhdXJhMjgtJHtwcm9wcy5lbnZpcm9ubWVudH0tc3dpc3NlcGhgLFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIExhbWJkYSBmdW5jdGlvbnNcbiAgICB0aGlzLmdldFVzZXJQcm9maWxlRnVuY3Rpb24gPSBuZXcgbGFtYmRhTm9kZUpzLk5vZGVqc0Z1bmN0aW9uKHRoaXMsICdHZXRVc2VyUHJvZmlsZUZ1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LWdldC11c2VyLXByb2ZpbGVgLFxuICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9sYW1iZGEvdXNlci1wcm9maWxlL2dldC11c2VyLXByb2ZpbGUudHMnKSxcbiAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgVEFCTEVfTkFNRTogcHJvcHMudXNlclRhYmxlLnRhYmxlTmFtZSxcbiAgICAgIH0sXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICBtZW1vcnlTaXplOiAyNTYsXG4gICAgICBidW5kbGluZzoge1xuICAgICAgICBleHRlcm5hbE1vZHVsZXM6IFsnQGF3cy1zZGsvKiddLFxuICAgICAgICBmb3JjZURvY2tlckJ1bmRsaW5nOiBmYWxzZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgZ2VuZXJhdGVOYXRhbENoYXJ0RnVuY3Rpb24gZmlyc3QsIGJlZm9yZSB1cGRhdGVVc2VyUHJvZmlsZUZ1bmN0aW9uIHRoYXQgcmVmZXJlbmNlcyBpdFxuICAgIHRoaXMuZ2VuZXJhdGVOYXRhbENoYXJ0RnVuY3Rpb24gPSBuZXcgbGFtYmRhTm9kZUpzLk5vZGVqc0Z1bmN0aW9uKFxuICAgICAgdGhpcyxcbiAgICAgICdHZW5lcmF0ZU5hdGFsQ2hhcnRGdW5jdGlvbicsXG4gICAgICB7XG4gICAgICAgIGZ1bmN0aW9uTmFtZTogYGF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS1nZW5lcmF0ZS1uYXRhbC1jaGFydGAsXG4gICAgICAgIGVudHJ5OiBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vbGFtYmRhL25hdGFsLWNoYXJ0L2dlbmVyYXRlLW5hdGFsLWNoYXJ0LnRzJyksXG4gICAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcbiAgICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICAgIGxheWVyczogW3N3aXNzRXBoZW1lcmlzTGF5ZXJdLFxuICAgICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICAgIE5BVEFMX0NIQVJUX1RBQkxFX05BTUU6IHByb3BzLm5hdGFsQ2hhcnRUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgICAgRVBIRU1FUklTX1BBVEg6ICcvb3B0L25vZGVqcy9ub2RlX21vZHVsZXMvc3dpc3NlcGgvZXBoZScsXG4gICAgICAgIH0sXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDEwKSwgLy8gMTAgc2Vjb25kcyBmb3IgaG91c2UgY2FsY3VsYXRpb25zXG4gICAgICAgIG1lbW9yeVNpemU6IDUxMiwgLy8gSW5jcmVhc2VkIG1lbW9yeSBmb3IgZXBoZW1lcmlzIGNhbGN1bGF0aW9uc1xuICAgICAgICBidW5kbGluZzoge1xuICAgICAgICAgIGV4dGVybmFsTW9kdWxlczogWydAYXdzLXNkay8qJywgJ3N3aXNzZXBoJ10sIC8vIEV4Y2x1ZGUgc3dpc3NlcGggc2luY2UgaXQncyBpbiB0aGUgbGF5ZXJcbiAgICAgICAgICBmb3JjZURvY2tlckJ1bmRsaW5nOiBmYWxzZSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIHRoaXMudXBkYXRlVXNlclByb2ZpbGVGdW5jdGlvbiA9IG5ldyBsYW1iZGFOb2RlSnMuTm9kZWpzRnVuY3Rpb24oXG4gICAgICB0aGlzLFxuICAgICAgJ1VwZGF0ZVVzZXJQcm9maWxlRnVuY3Rpb24nLFxuICAgICAge1xuICAgICAgICBmdW5jdGlvbk5hbWU6IGBhdXJhMjgtJHtwcm9wcy5lbnZpcm9ubWVudH0tdXBkYXRlLXVzZXItcHJvZmlsZWAsXG4gICAgICAgIGVudHJ5OiBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vbGFtYmRhL3VzZXItcHJvZmlsZS91cGRhdGUtdXNlci1wcm9maWxlLnRzJyksXG4gICAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcbiAgICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgICAgVEFCTEVfTkFNRTogcHJvcHMudXNlclRhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgICBQTEFDRV9JTkRFWF9OQU1FOiBwcm9wcy5wbGFjZUluZGV4TmFtZSxcbiAgICAgICAgICBHRU5FUkFURV9OQVRBTF9DSEFSVF9GVU5DVElPTl9OQU1FOiB0aGlzLmdlbmVyYXRlTmF0YWxDaGFydEZ1bmN0aW9uLmZ1bmN0aW9uTmFtZSxcbiAgICAgICAgfSxcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgICBtZW1vcnlTaXplOiAyNTYsXG4gICAgICAgIGJ1bmRsaW5nOiB7XG4gICAgICAgICAgZXh0ZXJuYWxNb2R1bGVzOiBbJ0Bhd3Mtc2RrLyonXSxcbiAgICAgICAgICBmb3JjZURvY2tlckJ1bmRsaW5nOiBmYWxzZSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIEdyYW50IER5bmFtb0RCIHBlcm1pc3Npb25zXG4gICAgcHJvcHMudXNlclRhYmxlLmdyYW50UmVhZERhdGEodGhpcy5nZXRVc2VyUHJvZmlsZUZ1bmN0aW9uKTtcbiAgICBwcm9wcy51c2VyVGFibGUuZ3JhbnRXcml0ZURhdGEodGhpcy51cGRhdGVVc2VyUHJvZmlsZUZ1bmN0aW9uKTtcbiAgICBwcm9wcy5uYXRhbENoYXJ0VGFibGUuZ3JhbnRXcml0ZURhdGEodGhpcy5nZW5lcmF0ZU5hdGFsQ2hhcnRGdW5jdGlvbik7XG5cbiAgICB0aGlzLmdldE5hdGFsQ2hhcnRGdW5jdGlvbiA9IG5ldyBsYW1iZGFOb2RlSnMuTm9kZWpzRnVuY3Rpb24odGhpcywgJ0dldE5hdGFsQ2hhcnRGdW5jdGlvbicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogYGF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS1nZXQtbmF0YWwtY2hhcnRgLFxuICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9sYW1iZGEvbmF0YWwtY2hhcnQvZ2V0LW5hdGFsLWNoYXJ0LnRzJyksXG4gICAgICBoYW5kbGVyOiAnaGFuZGxlcicsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIE5BVEFMX0NIQVJUX1RBQkxFX05BTUU6IHByb3BzLm5hdGFsQ2hhcnRUYWJsZS50YWJsZU5hbWUsXG4gICAgICB9LFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgbWVtb3J5U2l6ZTogMjU2LFxuICAgICAgYnVuZGxpbmc6IHtcbiAgICAgICAgZXh0ZXJuYWxNb2R1bGVzOiBbJ0Bhd3Mtc2RrLyonXSxcbiAgICAgICAgZm9yY2VEb2NrZXJCdW5kbGluZzogZmFsc2UsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgcHJvcHMubmF0YWxDaGFydFRhYmxlLmdyYW50UmVhZERhdGEodGhpcy5nZXROYXRhbENoYXJ0RnVuY3Rpb24pO1xuXG4gICAgLy8gR3JhbnQgaW52b2NhdGlvbiBwZXJtaXNzaW9uXG4gICAgdGhpcy5nZW5lcmF0ZU5hdGFsQ2hhcnRGdW5jdGlvbi5ncmFudEludm9rZSh0aGlzLnVwZGF0ZVVzZXJQcm9maWxlRnVuY3Rpb24pO1xuXG4gICAgLy8gR3JhbnQgTG9jYXRpb24gU2VydmljZSBwZXJtaXNzaW9uc1xuICAgIHRoaXMudXBkYXRlVXNlclByb2ZpbGVGdW5jdGlvbi5hZGRUb1JvbGVQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGFjdGlvbnM6IFsnZ2VvOlNlYXJjaFBsYWNlSW5kZXhGb3JUZXh0J10sXG4gICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgIGBhcm46YXdzOmdlbzoke2Nkay5TdGFjay5vZih0aGlzKS5yZWdpb259OiR7Y2RrLlN0YWNrLm9mKHRoaXMpLmFjY291bnR9OnBsYWNlLWluZGV4LyR7XG4gICAgICAgICAgICBwcm9wcy5wbGFjZUluZGV4TmFtZVxuICAgICAgICAgIH1gLFxuICAgICAgICBdLFxuICAgICAgfSksXG4gICAgKTtcblxuICAgIC8vIENyZWF0ZSBBUEkgR2F0ZXdheVxuICAgIHRoaXMuYXBpID0gbmV3IGFwaWdhdGV3YXkuUmVzdEFwaSh0aGlzLCAnVXNlckFwaScsIHtcbiAgICAgIHJlc3RBcGlOYW1lOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LXVzZXItYXBpYCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVBJIGZvciB1c2VyIHByb2ZpbGUgbWFuYWdlbWVudCcsXG4gICAgICBkZXBsb3lPcHRpb25zOiB7XG4gICAgICAgIHN0YWdlTmFtZTogcHJvcHMuZW52aXJvbm1lbnQsXG4gICAgICAgIHRyYWNpbmdFbmFibGVkOiB0cnVlLFxuICAgICAgICBkYXRhVHJhY2VFbmFibGVkOiB0cnVlLFxuICAgICAgICBsb2dnaW5nTGV2ZWw6IGFwaWdhdGV3YXkuTWV0aG9kTG9nZ2luZ0xldmVsLklORk8sXG4gICAgICAgIG1ldHJpY3NFbmFibGVkOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIGRlZmF1bHRDb3JzUHJlZmxpZ2h0T3B0aW9uczoge1xuICAgICAgICBhbGxvd09yaWdpbnM6IHByb3BzLmFsbG93ZWRPcmlnaW5zLFxuICAgICAgICBhbGxvd01ldGhvZHM6IFsnR0VUJywgJ1BVVCcsICdPUFRJT05TJ10sXG4gICAgICAgIGFsbG93SGVhZGVyczogW1xuICAgICAgICAgICdDb250ZW50LVR5cGUnLFxuICAgICAgICAgICdYLUFtei1EYXRlJyxcbiAgICAgICAgICAnQXV0aG9yaXphdGlvbicsXG4gICAgICAgICAgJ1gtQXBpLUtleScsXG4gICAgICAgICAgJ1gtQW16LVNlY3VyaXR5LVRva2VuJyxcbiAgICAgICAgXSxcbiAgICAgICAgYWxsb3dDcmVkZW50aWFsczogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgQ29nbml0byBhdXRob3JpemVyXG4gICAgY29uc3QgYXV0aG9yaXplciA9IG5ldyBhcGlnYXRld2F5LkNvZ25pdG9Vc2VyUG9vbHNBdXRob3JpemVyKHRoaXMsICdVc2VyUG9vbEF1dGhvcml6ZXInLCB7XG4gICAgICBjb2duaXRvVXNlclBvb2xzOiBbcHJvcHMudXNlclBvb2xdLFxuICAgICAgYXV0aG9yaXplck5hbWU6IGBhdXJhMjgtJHtwcm9wcy5lbnZpcm9ubWVudH0tYXV0aG9yaXplcmAsXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgL2FwaS91c2Vycy97dXNlcklkfS9wcm9maWxlIHJlc291cmNlXG4gICAgY29uc3QgYXBpUmVzb3VyY2UgPSB0aGlzLmFwaS5yb290LmFkZFJlc291cmNlKCdhcGknKTtcbiAgICBjb25zdCB1c2Vyc1Jlc291cmNlID0gYXBpUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3VzZXJzJyk7XG4gICAgY29uc3QgdXNlcklkUmVzb3VyY2UgPSB1c2Vyc1Jlc291cmNlLmFkZFJlc291cmNlKCd7dXNlcklkfScpO1xuICAgIGNvbnN0IHByb2ZpbGVSZXNvdXJjZSA9IHVzZXJJZFJlc291cmNlLmFkZFJlc291cmNlKCdwcm9maWxlJyk7XG5cbiAgICAvLyBBZGQgR0VUIG1ldGhvZFxuICAgIHByb2ZpbGVSZXNvdXJjZS5hZGRNZXRob2QoXG4gICAgICAnR0VUJyxcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHRoaXMuZ2V0VXNlclByb2ZpbGVGdW5jdGlvbiksXG4gICAgICB7XG4gICAgICAgIGF1dGhvcml6ZXIsXG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBBZGQgL2FwaS91c2Vycy97dXNlcklkfS9uYXRhbC1jaGFydCByZXNvdXJjZVxuICAgIGNvbnN0IG5hdGFsQ2hhcnRSZXNvdXJjZSA9IHVzZXJJZFJlc291cmNlLmFkZFJlc291cmNlKCduYXRhbC1jaGFydCcpO1xuICAgIG5hdGFsQ2hhcnRSZXNvdXJjZS5hZGRNZXRob2QoXG4gICAgICAnR0VUJyxcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHRoaXMuZ2V0TmF0YWxDaGFydEZ1bmN0aW9uKSxcbiAgICAgIHtcbiAgICAgICAgYXV0aG9yaXplcixcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIEFkZCBQVVQgbWV0aG9kXG4gICAgcHJvZmlsZVJlc291cmNlLmFkZE1ldGhvZChcbiAgICAgICdQVVQnLFxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24odGhpcy51cGRhdGVVc2VyUHJvZmlsZUZ1bmN0aW9uKSxcbiAgICAgIHtcbiAgICAgICAgYXV0aG9yaXplcixcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIE91dHB1dCBBUEkgVVJMXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FwaVVybCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmFwaS51cmwsXG4gICAgICBkZXNjcmlwdGlvbjogJ0FQSSBHYXRld2F5IFVSTCcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQXBpRW5kcG9pbnQnLCB7XG4gICAgICB2YWx1ZTogYCR7dGhpcy5hcGkudXJsfWFwaS91c2Vycy97dXNlcklkfS9wcm9maWxlYCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnVXNlciBQcm9maWxlIEFQSSBFbmRwb2ludCcsXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==