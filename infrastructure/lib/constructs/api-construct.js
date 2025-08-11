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
                EPHEMERIS_PATH: '/opt/nodejs/ephe',
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBpLWNvbnN0cnVjdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImFwaS1jb25zdHJ1Y3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSwyQ0FBdUM7QUFDdkMsaURBQW1DO0FBQ25DLHVFQUF5RDtBQUN6RCwrREFBaUQ7QUFDakQsNEVBQThEO0FBRzlELHlEQUEyQztBQUMzQywyQ0FBNkI7QUFXN0IsTUFBYSxZQUFhLFNBQVEsc0JBQVM7SUFDekIsR0FBRyxDQUFxQjtJQUN4QixzQkFBc0IsQ0FBa0I7SUFDeEMseUJBQXlCLENBQWtCO0lBQzNDLDBCQUEwQixDQUFrQjtJQUM1QyxxQkFBcUIsQ0FBa0I7SUFFdkQsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUF3QjtRQUNoRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLHNDQUFzQztRQUN0QyxNQUFNLG1CQUFtQixHQUFHLElBQUksTUFBTSxDQUFDLFlBQVksQ0FBQyxJQUFJLEVBQUUscUJBQXFCLEVBQUU7WUFDL0UsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLHNCQUFzQixDQUFDLEVBQUU7Z0JBQ3hFLFFBQVEsRUFBRTtvQkFDUixLQUFLLEVBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsYUFBYTtvQkFDL0MsSUFBSSxFQUFFLE1BQU07b0JBQ1osT0FBTyxFQUFFO3dCQUNQLE1BQU07d0JBQ04sSUFBSTt3QkFDSjs0QkFDRSwrQkFBK0I7NEJBQy9CLHlEQUF5RDs0QkFDekQseUJBQXlCOzRCQUN6QixhQUFhO3lCQUNkLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQztxQkFDZjtpQkFDRjthQUNGLENBQUM7WUFDRixrQkFBa0IsRUFBRSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDO1lBQ2hELFdB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LElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsYUFBYSxFQUFFO1lBQ3JDLEtBQUssRUFBRSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyw0QkFBNEI7WUFDbEQsV0FBVyxFQUFFLDJCQUEyQjtTQUN6QyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUFwTkQsb0NBb05DIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgYXBpZ2F0ZXdheSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtYXBpZ2F0ZXdheSc7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XG5pbXBvcnQgKiBhcyBsYW1iZGFOb2RlSnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYS1ub2RlanMnO1xuaW1wb3J0ICogYXMgZHluYW1vZGIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWR5bmFtb2RiJztcbmltcG9ydCAqIGFzIGNvZ25pdG8gZnJvbSAnYXdzLWNkay1saWIvYXdzLWNvZ25pdG8nO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcblxuZXhwb3J0IGludGVyZmFjZSBBcGlDb25zdHJ1Y3RQcm9wcyB7XG4gIGVudmlyb25tZW50OiAnZGV2JyB8ICdwcm9kJztcbiAgdXNlclRhYmxlOiBkeW5hbW9kYi5UYWJsZTtcbiAgbmF0YWxDaGFydFRhYmxlOiBkeW5hbW9kYi5UYWJsZTtcbiAgdXNlclBvb2w6IGNvZ25pdG8uVXNlclBvb2w7XG4gIHBsYWNlSW5kZXhOYW1lOiBzdHJpbmc7XG4gIGFsbG93ZWRPcmlnaW5zOiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGNsYXNzIEFwaUNvbnN0cnVjdCBleHRlbmRzIENvbnN0cnVjdCB7XG4gIHB1YmxpYyByZWFkb25seSBhcGk6IGFwaWdhdGV3YXkuUmVzdEFwaTtcbiAgcHVibGljIHJlYWRvbmx5IGdldFVzZXJQcm9maWxlRnVuY3Rpb246IGxhbWJkYS5GdW5jdGlvbjtcbiAgcHVibGljIHJlYWRvbmx5IHVwZGF0ZVVzZXJQcm9maWxlRnVuY3Rpb246IGxhbWJkYS5GdW5jdGlvbjtcbiAgcHVibGljIHJlYWRvbmx5IGdlbmVyYXRlTmF0YWxDaGFydEZ1bmN0aW9uOiBsYW1iZGEuRnVuY3Rpb247XG4gIHB1YmxpYyByZWFkb25seSBnZXROYXRhbENoYXJ0RnVuY3Rpb246IGxhbWJkYS5GdW5jdGlvbjtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogQXBpQ29uc3RydWN0UHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgLy8gQ3JlYXRlIFN3aXNzIEVwaGVtZXJpcyBMYW1iZGEgTGF5ZXJcbiAgICBjb25zdCBzd2lzc0VwaGVtZXJpc0xheWVyID0gbmV3IGxhbWJkYS5MYXllclZlcnNpb24odGhpcywgJ1N3aXNzRXBoZW1lcmlzTGF5ZXInLCB7XG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2xheWVycy9zd2V0ZXN0JyksIHtcbiAgICAgICAgYnVuZGxpbmc6IHtcbiAgICAgICAgICBpbWFnZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1guYnVuZGxpbmdJbWFnZSxcbiAgICAgICAgICB1c2VyOiAncm9vdCcsXG4gICAgICAgICAgY29tbWFuZDogW1xuICAgICAgICAgICAgJ2Jhc2gnLFxuICAgICAgICAgICAgJy1jJyxcbiAgICAgICAgICAgIFtcbiAgICAgICAgICAgICAgJ21rZGlyIC1wIC9hc3NldC1vdXRwdXQvbm9kZWpzJyxcbiAgICAgICAgICAgICAgJ2NwIHBhY2thZ2UuanNvbiBwYWNrYWdlLWxvY2suanNvbiAvYXNzZXQtb3V0cHV0L25vZGVqcy8nLFxuICAgICAgICAgICAgICAnY2QgL2Fzc2V0LW91dHB1dC9ub2RlanMnLFxuICAgICAgICAgICAgICAnbnBtIGluc3RhbGwnLFxuICAgICAgICAgICAgXS5qb2luKCcgJiYgJyksXG4gICAgICAgICAgXSxcbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgICAgY29tcGF0aWJsZVJ1bnRpbWVzOiBbbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1hdLFxuICAgICAgZGVzY3JpcHRpb246ICdTd2lzcyBFcGhlbWVyaXMgbGlicmFyeSBmb3IgaG91c2UgY2FsY3VsYXRpb25zJyxcbiAgICAgIGxheWVyVmVyc2lvbk5hbWU6IGBhdXJhMjgtJHtwcm9wcy5lbnZpcm9ubWVudH0tc3dpc3NlcGhgLFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIExhbWJkYSBmdW5jdGlvbnNcbiAgICB0aGlzLmdldFVzZXJQcm9maWxlRnVuY3Rpb24gPSBuZXcgbGFtYmRhTm9kZUpzLk5vZGVqc0Z1bmN0aW9uKHRoaXMsICdHZXRVc2VyUHJvZmlsZUZ1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LWdldC11c2VyLXByb2ZpbGVgLFxuICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9sYW1iZGEvdXNlci1wcm9maWxlL2dldC11c2VyLXByb2ZpbGUudHMnKSxcbiAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgVEFCTEVfTkFNRTogcHJvcHMudXNlclRhYmxlLnRhYmxlTmFtZSxcbiAgICAgIH0sXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICBtZW1vcnlTaXplOiAyNTYsXG4gICAgICBidW5kbGluZzoge1xuICAgICAgICBleHRlcm5hbE1vZHVsZXM6IFsnQGF3cy1zZGsvKiddLFxuICAgICAgICBmb3JjZURvY2tlckJ1bmRsaW5nOiBmYWxzZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgZ2VuZXJhdGVOYXRhbENoYXJ0RnVuY3Rpb24gZmlyc3QsIGJlZm9yZSB1cGRhdGVVc2VyUHJvZmlsZUZ1bmN0aW9uIHRoYXQgcmVmZXJlbmNlcyBpdFxuICAgIHRoaXMuZ2VuZXJhdGVOYXRhbENoYXJ0RnVuY3Rpb24gPSBuZXcgbGFtYmRhTm9kZUpzLk5vZGVqc0Z1bmN0aW9uKFxuICAgICAgdGhpcyxcbiAgICAgICdHZW5lcmF0ZU5hdGFsQ2hhcnRGdW5jdGlvbicsXG4gICAgICB7XG4gICAgICAgIGZ1bmN0aW9uTmFtZTogYGF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS1nZW5lcmF0ZS1uYXRhbC1jaGFydGAsXG4gICAgICAgIGVudHJ5OiBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vbGFtYmRhL25hdGFsLWNoYXJ0L2dlbmVyYXRlLW5hdGFsLWNoYXJ0LnRzJyksXG4gICAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcbiAgICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICAgIGxheWVyczogW3N3aXNzRXBoZW1lcmlzTGF5ZXJdLFxuICAgICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICAgIE5BVEFMX0NIQVJUX1RBQkxFX05BTUU6IHByb3BzLm5hdGFsQ2hhcnRUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgICAgRVBIRU1FUklTX1BBVEg6ICcvb3B0L25vZGVqcy9lcGhlJyxcbiAgICAgICAgfSxcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMTApLCAvLyAxMCBzZWNvbmRzIGZvciBob3VzZSBjYWxjdWxhdGlvbnNcbiAgICAgICAgbWVtb3J5U2l6ZTogNTEyLCAvLyBJbmNyZWFzZWQgbWVtb3J5IGZvciBlcGhlbWVyaXMgY2FsY3VsYXRpb25zXG4gICAgICAgIGJ1bmRsaW5nOiB7XG4gICAgICAgICAgZXh0ZXJuYWxNb2R1bGVzOiBbJ0Bhd3Mtc2RrLyonLCAnc3dpc3NlcGgnXSwgLy8gRXhjbHVkZSBzd2lzc2VwaCBzaW5jZSBpdCdzIGluIHRoZSBsYXllclxuICAgICAgICAgIGZvcmNlRG9ja2VyQnVuZGxpbmc6IGZhbHNlLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgdGhpcy51cGRhdGVVc2VyUHJvZmlsZUZ1bmN0aW9uID0gbmV3IGxhbWJkYU5vZGVKcy5Ob2RlanNGdW5jdGlvbihcbiAgICAgIHRoaXMsXG4gICAgICAnVXBkYXRlVXNlclByb2ZpbGVGdW5jdGlvbicsXG4gICAgICB7XG4gICAgICAgIGZ1bmN0aW9uTmFtZTogYGF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS11cGRhdGUtdXNlci1wcm9maWxlYCxcbiAgICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9sYW1iZGEvdXNlci1wcm9maWxlL3VwZGF0ZS11c2VyLXByb2ZpbGUudHMnKSxcbiAgICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxuICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcbiAgICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICBUQUJMRV9OQU1FOiBwcm9wcy51c2VyVGFibGUudGFibGVOYW1lLFxuICAgICAgICAgIFBMQUNFX0lOREVYX05BTUU6IHByb3BzLnBsYWNlSW5kZXhOYW1lLFxuICAgICAgICAgIEdFTkVSQVRFX05BVEFMX0NIQVJUX0ZVTkNUSU9OX05BTUU6IHRoaXMuZ2VuZXJhdGVOYXRhbENoYXJ0RnVuY3Rpb24uZnVuY3Rpb25OYW1lLFxuICAgICAgICB9LFxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICAgIG1lbW9yeVNpemU6IDI1NixcbiAgICAgICAgYnVuZGxpbmc6IHtcbiAgICAgICAgICBleHRlcm5hbE1vZHVsZXM6IFsnQGF3cy1zZGsvKiddLFxuICAgICAgICAgIGZvcmNlRG9ja2VyQnVuZGxpbmc6IGZhbHNlLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gR3JhbnQgRHluYW1vREIgcGVybWlzc2lvbnNcbiAgICBwcm9wcy51c2VyVGFibGUuZ3JhbnRSZWFkRGF0YSh0aGlzLmdldFVzZXJQcm9maWxlRnVuY3Rpb24pO1xuICAgIHByb3BzLnVzZXJUYWJsZS5ncmFudFdyaXRlRGF0YSh0aGlzLnVwZGF0ZVVzZXJQcm9maWxlRnVuY3Rpb24pO1xuICAgIHByb3BzLm5hdGFsQ2hhcnRUYWJsZS5ncmFudFdyaXRlRGF0YSh0aGlzLmdlbmVyYXRlTmF0YWxDaGFydEZ1bmN0aW9uKTtcblxuICAgIHRoaXMuZ2V0TmF0YWxDaGFydEZ1bmN0aW9uID0gbmV3IGxhbWJkYU5vZGVKcy5Ob2RlanNGdW5jdGlvbih0aGlzLCAnR2V0TmF0YWxDaGFydEZ1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LWdldC1uYXRhbC1jaGFydGAsXG4gICAgICBlbnRyeTogcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2xhbWJkYS9uYXRhbC1jaGFydC9nZXQtbmF0YWwtY2hhcnQudHMnKSxcbiAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgTkFUQUxfQ0hBUlRfVEFCTEVfTkFNRTogcHJvcHMubmF0YWxDaGFydFRhYmxlLnRhYmxlTmFtZSxcbiAgICAgIH0sXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICBtZW1vcnlTaXplOiAyNTYsXG4gICAgICBidW5kbGluZzoge1xuICAgICAgICBleHRlcm5hbE1vZHVsZXM6IFsnQGF3cy1zZGsvKiddLFxuICAgICAgICBmb3JjZURvY2tlckJ1bmRsaW5nOiBmYWxzZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBwcm9wcy5uYXRhbENoYXJ0VGFibGUuZ3JhbnRSZWFkRGF0YSh0aGlzLmdldE5hdGFsQ2hhcnRGdW5jdGlvbik7XG5cbiAgICAvLyBHcmFudCBpbnZvY2F0aW9uIHBlcm1pc3Npb25cbiAgICB0aGlzLmdlbmVyYXRlTmF0YWxDaGFydEZ1bmN0aW9uLmdyYW50SW52b2tlKHRoaXMudXBkYXRlVXNlclByb2ZpbGVGdW5jdGlvbik7XG5cbiAgICAvLyBHcmFudCBMb2NhdGlvbiBTZXJ2aWNlIHBlcm1pc3Npb25zXG4gICAgdGhpcy51cGRhdGVVc2VyUHJvZmlsZUZ1bmN0aW9uLmFkZFRvUm9sZVBvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgYWN0aW9uczogWydnZW86U2VhcmNoUGxhY2VJbmRleEZvclRleHQnXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgYGFybjphd3M6Z2VvOiR7Y2RrLlN0YWNrLm9mKHRoaXMpLnJlZ2lvbn06JHtjZGsuU3RhY2sub2YodGhpcykuYWNjb3VudH06cGxhY2UtaW5kZXgvJHtcbiAgICAgICAgICAgIHByb3BzLnBsYWNlSW5kZXhOYW1lXG4gICAgICAgICAgfWAsXG4gICAgICAgIF0sXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgLy8gQ3JlYXRlIEFQSSBHYXRld2F5XG4gICAgdGhpcy5hcGkgPSBuZXcgYXBpZ2F0ZXdheS5SZXN0QXBpKHRoaXMsICdVc2VyQXBpJywge1xuICAgICAgcmVzdEFwaU5hbWU6IGBhdXJhMjgtJHtwcm9wcy5lbnZpcm9ubWVudH0tdXNlci1hcGlgLFxuICAgICAgZGVzY3JpcHRpb246ICdBUEkgZm9yIHVzZXIgcHJvZmlsZSBtYW5hZ2VtZW50JyxcbiAgICAgIGRlcGxveU9wdGlvbnM6IHtcbiAgICAgICAgc3RhZ2VOYW1lOiBwcm9wcy5lbnZpcm9ubWVudCxcbiAgICAgICAgdHJhY2luZ0VuYWJsZWQ6IHRydWUsXG4gICAgICAgIGRhdGFUcmFjZUVuYWJsZWQ6IHRydWUsXG4gICAgICAgIGxvZ2dpbmdMZXZlbDogYXBpZ2F0ZXdheS5NZXRob2RMb2dnaW5nTGV2ZWwuSU5GTyxcbiAgICAgICAgbWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICB9LFxuICAgICAgZGVmYXVsdENvcnNQcmVmbGlnaHRPcHRpb25zOiB7XG4gICAgICAgIGFsbG93T3JpZ2luczogcHJvcHMuYWxsb3dlZE9yaWdpbnMsXG4gICAgICAgIGFsbG93TWV0aG9kczogWydHRVQnLCAnUFVUJywgJ09QVElPTlMnXSxcbiAgICAgICAgYWxsb3dIZWFkZXJzOiBbXG4gICAgICAgICAgJ0NvbnRlbnQtVHlwZScsXG4gICAgICAgICAgJ1gtQW16LURhdGUnLFxuICAgICAgICAgICdBdXRob3JpemF0aW9uJyxcbiAgICAgICAgICAnWC1BcGktS2V5JyxcbiAgICAgICAgICAnWC1BbXotU2VjdXJpdHktVG9rZW4nLFxuICAgICAgICBdLFxuICAgICAgICBhbGxvd0NyZWRlbnRpYWxzOiB0cnVlLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBDb2duaXRvIGF1dGhvcml6ZXJcbiAgICBjb25zdCBhdXRob3JpemVyID0gbmV3IGFwaWdhdGV3YXkuQ29nbml0b1VzZXJQb29sc0F1dGhvcml6ZXIodGhpcywgJ1VzZXJQb29sQXV0aG9yaXplcicsIHtcbiAgICAgIGNvZ25pdG9Vc2VyUG9vbHM6IFtwcm9wcy51c2VyUG9vbF0sXG4gICAgICBhdXRob3JpemVyTmFtZTogYGF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS1hdXRob3JpemVyYCxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSAvYXBpL3VzZXJzL3t1c2VySWR9L3Byb2ZpbGUgcmVzb3VyY2VcbiAgICBjb25zdCBhcGlSZXNvdXJjZSA9IHRoaXMuYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ2FwaScpO1xuICAgIGNvbnN0IHVzZXJzUmVzb3VyY2UgPSBhcGlSZXNvdXJjZS5hZGRSZXNvdXJjZSgndXNlcnMnKTtcbiAgICBjb25zdCB1c2VySWRSZXNvdXJjZSA9IHVzZXJzUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3t1c2VySWR9Jyk7XG4gICAgY29uc3QgcHJvZmlsZVJlc291cmNlID0gdXNlcklkUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3Byb2ZpbGUnKTtcblxuICAgIC8vIEFkZCBHRVQgbWV0aG9kXG4gICAgcHJvZmlsZVJlc291cmNlLmFkZE1ldGhvZChcbiAgICAgICdHRVQnLFxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24odGhpcy5nZXRVc2VyUHJvZmlsZUZ1bmN0aW9uKSxcbiAgICAgIHtcbiAgICAgICAgYXV0aG9yaXplcixcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIEFkZCAvYXBpL3VzZXJzL3t1c2VySWR9L25hdGFsLWNoYXJ0IHJlc291cmNlXG4gICAgY29uc3QgbmF0YWxDaGFydFJlc291cmNlID0gdXNlcklkUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ25hdGFsLWNoYXJ0Jyk7XG4gICAgbmF0YWxDaGFydFJlc291cmNlLmFkZE1ldGhvZChcbiAgICAgICdHRVQnLFxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24odGhpcy5nZXROYXRhbENoYXJ0RnVuY3Rpb24pLFxuICAgICAge1xuICAgICAgICBhdXRob3JpemVyLFxuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gQWRkIFBVVCBtZXRob2RcbiAgICBwcm9maWxlUmVzb3VyY2UuYWRkTWV0aG9kKFxuICAgICAgJ1BVVCcsXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbih0aGlzLnVwZGF0ZVVzZXJQcm9maWxlRnVuY3Rpb24pLFxuICAgICAge1xuICAgICAgICBhdXRob3JpemVyLFxuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gT3V0cHV0IEFQSSBVUkxcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQXBpVXJsJywge1xuICAgICAgdmFsdWU6IHRoaXMuYXBpLnVybCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVBJIEdhdGV3YXkgVVJMJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBcGlFbmRwb2ludCcsIHtcbiAgICAgIHZhbHVlOiBgJHt0aGlzLmFwaS51cmx9YXBpL3VzZXJzL3t1c2VySWR9L3Byb2ZpbGVgLFxuICAgICAgZGVzY3JpcHRpb246ICdVc2VyIFByb2ZpbGUgQVBJIEVuZHBvaW50JyxcbiAgICB9KTtcbiAgfVxufVxuIl19