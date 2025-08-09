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
        this.generateNatalChartFunction = new lambdaNodeJs.NodejsFunction(this, 'GenerateNatalChartFunction', {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBpLWNvbnN0cnVjdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImFwaS1jb25zdHJ1Y3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSwyQ0FBdUM7QUFDdkMsaURBQW1DO0FBQ25DLHVFQUF5RDtBQUN6RCwrREFBaUQ7QUFDakQsNEVBQThEO0FBRzlELHlEQUEyQztBQUMzQywyQ0FBNkI7QUFXN0IsTUFBYSxZQUFhLFNBQVEsc0JBQVM7SUFDekIsR0FBRyxDQUFxQjtJQUN4QixzQkFBc0IsQ0FBa0I7SUFDeEMseUJBQXlCLENBQWtCO0lBQzNDLDBCQUEwQixDQUFrQjtJQUM1QyxxQkFBcUIsQ0FBa0I7SUFFdkQsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUF3QjtRQUNoRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLDBCQUEwQjtRQUMxQixJQUFJLENBQUMsc0JBQXNCLEdBQUcsSUFBSSxZQUFZLENBQUMsY0FBYyxDQUFDLElBQUksRUFBRSx3QkFBd0IsRUFBRTtZQUM1RixZQUFZLEVBQUUsVUFBVSxLQUFLLENBQUMsV0FBVyxtQkFBbUI7WUFDNUQsS0FBSyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLCtDQUErQyxDQUFDO1lBQzVFLE9BQU8sRUFBRSxTQUFTO1lBQ2xCLE9BQU8sRUFBRSxNQUFNLENBQUMsT0FBTyxDQUFDLFdBQVc7WUFDbkMsV0FBVyxFQUFFO2dCQUNYLFVBQVUsRUFBRSxLQUFLLENBQUMsU0FBUyxDQUFDLFNBQVM7YUFDdEM7WUFDRCxPQUFPLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ2pDLFVBQVUsRUFBRSxHQUFHO1lBQ2YsUUFBUSxFQUFFO2dCQUNSLGVBQWUsRUFBRSxDQUFDLFlBQVksQ0FBQztnQkFDL0IsbUJBQW1CLEVBQUUsS0FBSzthQUMzQjtTQUNGLENBQUMs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QyxJQUFJLENBQUMseUJBQXlCLENBQUMsRUFDaEU7WUFDRSxVQUFVO1lBQ1YsaUJBQWlCLEVBQUUsVUFBVSxDQUFDLGlCQUFpQixDQUFDLE9BQU87U0FDeEQsQ0FDRixDQUFDO1FBRUYsaUJBQWlCO1FBQ2pCLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsUUFBUSxFQUFFO1lBQ2hDLEtBQUssRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUc7WUFDbkIsV0FBVyxFQUFFLGlCQUFpQjtTQUMvQixDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGFBQWEsRUFBRTtZQUNyQyxLQUFLLEVBQUUsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsNEJBQTRCO1lBQ2xELFdBQVcsRUFBRSwyQkFBMkI7U0FDekMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBMUxELG9DQTBMQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGFwaWdhdGV3YXkgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXknO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xuaW1wb3J0ICogYXMgbGFtYmRhTm9kZUpzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEtbm9kZWpzJztcbmltcG9ydCAqIGFzIGR5bmFtb2RiIGZyb20gJ2F3cy1jZGstbGliL2F3cy1keW5hbW9kYic7XG5pbXBvcnQgKiBhcyBjb2duaXRvIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jb2duaXRvJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQXBpQ29uc3RydWN0UHJvcHMge1xuICBlbnZpcm9ubWVudDogJ2RldicgfCAncHJvZCc7XG4gIHVzZXJUYWJsZTogZHluYW1vZGIuVGFibGU7XG4gIG5hdGFsQ2hhcnRUYWJsZTogZHluYW1vZGIuVGFibGU7XG4gIHVzZXJQb29sOiBjb2duaXRvLlVzZXJQb29sO1xuICBwbGFjZUluZGV4TmFtZTogc3RyaW5nO1xuICBhbGxvd2VkT3JpZ2luczogc3RyaW5nW107XG59XG5cbmV4cG9ydCBjbGFzcyBBcGlDb25zdHJ1Y3QgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICBwdWJsaWMgcmVhZG9ubHkgYXBpOiBhcGlnYXRld2F5LlJlc3RBcGk7XG4gIHB1YmxpYyByZWFkb25seSBnZXRVc2VyUHJvZmlsZUZ1bmN0aW9uOiBsYW1iZGEuRnVuY3Rpb247XG4gIHB1YmxpYyByZWFkb25seSB1cGRhdGVVc2VyUHJvZmlsZUZ1bmN0aW9uOiBsYW1iZGEuRnVuY3Rpb247XG4gIHB1YmxpYyByZWFkb25seSBnZW5lcmF0ZU5hdGFsQ2hhcnRGdW5jdGlvbjogbGFtYmRhLkZ1bmN0aW9uO1xuICBwdWJsaWMgcmVhZG9ubHkgZ2V0TmF0YWxDaGFydEZ1bmN0aW9uOiBsYW1iZGEuRnVuY3Rpb247XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IEFwaUNvbnN0cnVjdFByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIC8vIENyZWF0ZSBMYW1iZGEgZnVuY3Rpb25zXG4gICAgdGhpcy5nZXRVc2VyUHJvZmlsZUZ1bmN0aW9uID0gbmV3IGxhbWJkYU5vZGVKcy5Ob2RlanNGdW5jdGlvbih0aGlzLCAnR2V0VXNlclByb2ZpbGVGdW5jdGlvbicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogYGF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS1nZXQtdXNlci1wcm9maWxlYCxcbiAgICAgIGVudHJ5OiBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vbGFtYmRhL3VzZXItcHJvZmlsZS9nZXQtdXNlci1wcm9maWxlLnRzJyksXG4gICAgICBoYW5kbGVyOiAnaGFuZGxlcicsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFRBQkxFX05BTUU6IHByb3BzLnVzZXJUYWJsZS50YWJsZU5hbWUsXG4gICAgICB9LFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgbWVtb3J5U2l6ZTogMjU2LFxuICAgICAgYnVuZGxpbmc6IHtcbiAgICAgICAgZXh0ZXJuYWxNb2R1bGVzOiBbJ0Bhd3Mtc2RrLyonXSxcbiAgICAgICAgZm9yY2VEb2NrZXJCdW5kbGluZzogZmFsc2UsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgdGhpcy51cGRhdGVVc2VyUHJvZmlsZUZ1bmN0aW9uID0gbmV3IGxhbWJkYU5vZGVKcy5Ob2RlanNGdW5jdGlvbihcbiAgICAgIHRoaXMsXG4gICAgICAnVXBkYXRlVXNlclByb2ZpbGVGdW5jdGlvbicsXG4gICAgICB7XG4gICAgICAgIGZ1bmN0aW9uTmFtZTogYGF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS11cGRhdGUtdXNlci1wcm9maWxlYCxcbiAgICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9sYW1iZGEvdXNlci1wcm9maWxlL3VwZGF0ZS11c2VyLXByb2ZpbGUudHMnKSxcbiAgICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxuICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcbiAgICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICBUQUJMRV9OQU1FOiBwcm9wcy51c2VyVGFibGUudGFibGVOYW1lLFxuICAgICAgICAgIFBMQUNFX0lOREVYX05BTUU6IHByb3BzLnBsYWNlSW5kZXhOYW1lLFxuICAgICAgICAgIEdFTkVSQVRFX05BVEFMX0NIQVJUX0ZVTkNUSU9OX05BTUU6IHRoaXMuZ2VuZXJhdGVOYXRhbENoYXJ0RnVuY3Rpb24uZnVuY3Rpb25OYW1lLFxuICAgICAgICB9LFxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICAgIG1lbW9yeVNpemU6IDI1NixcbiAgICAgICAgYnVuZGxpbmc6IHtcbiAgICAgICAgICBleHRlcm5hbE1vZHVsZXM6IFsnQGF3cy1zZGsvKiddLFxuICAgICAgICAgIGZvcmNlRG9ja2VyQnVuZGxpbmc6IGZhbHNlLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgdGhpcy5nZW5lcmF0ZU5hdGFsQ2hhcnRGdW5jdGlvbiA9IG5ldyBsYW1iZGFOb2RlSnMuTm9kZWpzRnVuY3Rpb24oXG4gICAgICB0aGlzLFxuICAgICAgJ0dlbmVyYXRlTmF0YWxDaGFydEZ1bmN0aW9uJyxcbiAgICAgIHtcbiAgICAgICAgZnVuY3Rpb25OYW1lOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LWdlbmVyYXRlLW5hdGFsLWNoYXJ0YCxcbiAgICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9sYW1iZGEvbmF0YWwtY2hhcnQvZ2VuZXJhdGUtbmF0YWwtY2hhcnQudHMnKSxcbiAgICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxuICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcbiAgICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICBOQVRBTF9DSEFSVF9UQUJMRV9OQU1FOiBwcm9wcy5uYXRhbENoYXJ0VGFibGUudGFibGVOYW1lLFxuICAgICAgICB9LFxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICAgIG1lbW9yeVNpemU6IDUxMiwgLy8gSW5jcmVhc2VkIG1lbW9yeSBmb3IgZXBoZW1lcmlzIGNhbGN1bGF0aW9uc1xuICAgICAgICBidW5kbGluZzoge1xuICAgICAgICAgIGV4dGVybmFsTW9kdWxlczogWydAYXdzLXNkay8qJ10sXG4gICAgICAgICAgZm9yY2VEb2NrZXJCdW5kbGluZzogZmFsc2UsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBHcmFudCBEeW5hbW9EQiBwZXJtaXNzaW9uc1xuICAgIHByb3BzLnVzZXJUYWJsZS5ncmFudFJlYWREYXRhKHRoaXMuZ2V0VXNlclByb2ZpbGVGdW5jdGlvbik7XG4gICAgcHJvcHMudXNlclRhYmxlLmdyYW50V3JpdGVEYXRhKHRoaXMudXBkYXRlVXNlclByb2ZpbGVGdW5jdGlvbik7XG4gICAgcHJvcHMubmF0YWxDaGFydFRhYmxlLmdyYW50V3JpdGVEYXRhKHRoaXMuZ2VuZXJhdGVOYXRhbENoYXJ0RnVuY3Rpb24pO1xuXG4gICAgdGhpcy5nZXROYXRhbENoYXJ0RnVuY3Rpb24gPSBuZXcgbGFtYmRhTm9kZUpzLk5vZGVqc0Z1bmN0aW9uKHRoaXMsICdHZXROYXRhbENoYXJ0RnVuY3Rpb24nLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6IGBhdXJhMjgtJHtwcm9wcy5lbnZpcm9ubWVudH0tZ2V0LW5hdGFsLWNoYXJ0YCxcbiAgICAgIGVudHJ5OiBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vbGFtYmRhL25hdGFsLWNoYXJ0L2dldC1uYXRhbC1jaGFydC50cycpLFxuICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBOQVRBTF9DSEFSVF9UQUJMRV9OQU1FOiBwcm9wcy5uYXRhbENoYXJ0VGFibGUudGFibGVOYW1lLFxuICAgICAgfSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgIG1lbW9yeVNpemU6IDI1NixcbiAgICAgIGJ1bmRsaW5nOiB7XG4gICAgICAgIGV4dGVybmFsTW9kdWxlczogWydAYXdzLXNkay8qJ10sXG4gICAgICAgIGZvcmNlRG9ja2VyQnVuZGxpbmc6IGZhbHNlLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIHByb3BzLm5hdGFsQ2hhcnRUYWJsZS5ncmFudFJlYWREYXRhKHRoaXMuZ2V0TmF0YWxDaGFydEZ1bmN0aW9uKTtcblxuICAgIC8vIEdyYW50IGludm9jYXRpb24gcGVybWlzc2lvblxuICAgIHRoaXMuZ2VuZXJhdGVOYXRhbENoYXJ0RnVuY3Rpb24uZ3JhbnRJbnZva2UodGhpcy51cGRhdGVVc2VyUHJvZmlsZUZ1bmN0aW9uKTtcblxuICAgIC8vIEdyYW50IExvY2F0aW9uIFNlcnZpY2UgcGVybWlzc2lvbnNcbiAgICB0aGlzLnVwZGF0ZVVzZXJQcm9maWxlRnVuY3Rpb24uYWRkVG9Sb2xlUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBhY3Rpb25zOiBbJ2dlbzpTZWFyY2hQbGFjZUluZGV4Rm9yVGV4dCddLFxuICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICBgYXJuOmF3czpnZW86JHtjZGsuU3RhY2sub2YodGhpcykucmVnaW9ufToke2Nkay5TdGFjay5vZih0aGlzKS5hY2NvdW50fTpwbGFjZS1pbmRleC8ke1xuICAgICAgICAgICAgcHJvcHMucGxhY2VJbmRleE5hbWVcbiAgICAgICAgICB9YCxcbiAgICAgICAgXSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICAvLyBDcmVhdGUgQVBJIEdhdGV3YXlcbiAgICB0aGlzLmFwaSA9IG5ldyBhcGlnYXRld2F5LlJlc3RBcGkodGhpcywgJ1VzZXJBcGknLCB7XG4gICAgICByZXN0QXBpTmFtZTogYGF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS11c2VyLWFwaWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ0FQSSBmb3IgdXNlciBwcm9maWxlIG1hbmFnZW1lbnQnLFxuICAgICAgZGVwbG95T3B0aW9uczoge1xuICAgICAgICBzdGFnZU5hbWU6IHByb3BzLmVudmlyb25tZW50LFxuICAgICAgICB0cmFjaW5nRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgZGF0YVRyYWNlRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgbG9nZ2luZ0xldmVsOiBhcGlnYXRld2F5Lk1ldGhvZExvZ2dpbmdMZXZlbC5JTkZPLFxuICAgICAgICBtZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBkZWZhdWx0Q29yc1ByZWZsaWdodE9wdGlvbnM6IHtcbiAgICAgICAgYWxsb3dPcmlnaW5zOiBwcm9wcy5hbGxvd2VkT3JpZ2lucyxcbiAgICAgICAgYWxsb3dNZXRob2RzOiBbJ0dFVCcsICdQVVQnLCAnT1BUSU9OUyddLFxuICAgICAgICBhbGxvd0hlYWRlcnM6IFtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJyxcbiAgICAgICAgICAnWC1BbXotRGF0ZScsXG4gICAgICAgICAgJ0F1dGhvcml6YXRpb24nLFxuICAgICAgICAgICdYLUFwaS1LZXknLFxuICAgICAgICAgICdYLUFtei1TZWN1cml0eS1Ub2tlbicsXG4gICAgICAgIF0sXG4gICAgICAgIGFsbG93Q3JlZGVudGlhbHM6IHRydWUsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIENvZ25pdG8gYXV0aG9yaXplclxuICAgIGNvbnN0IGF1dGhvcml6ZXIgPSBuZXcgYXBpZ2F0ZXdheS5Db2duaXRvVXNlclBvb2xzQXV0aG9yaXplcih0aGlzLCAnVXNlclBvb2xBdXRob3JpemVyJywge1xuICAgICAgY29nbml0b1VzZXJQb29sczogW3Byb3BzLnVzZXJQb29sXSxcbiAgICAgIGF1dGhvcml6ZXJOYW1lOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LWF1dGhvcml6ZXJgLFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIC9hcGkvdXNlcnMve3VzZXJJZH0vcHJvZmlsZSByZXNvdXJjZVxuICAgIGNvbnN0IGFwaVJlc291cmNlID0gdGhpcy5hcGkucm9vdC5hZGRSZXNvdXJjZSgnYXBpJyk7XG4gICAgY29uc3QgdXNlcnNSZXNvdXJjZSA9IGFwaVJlc291cmNlLmFkZFJlc291cmNlKCd1c2VycycpO1xuICAgIGNvbnN0IHVzZXJJZFJlc291cmNlID0gdXNlcnNSZXNvdXJjZS5hZGRSZXNvdXJjZSgne3VzZXJJZH0nKTtcbiAgICBjb25zdCBwcm9maWxlUmVzb3VyY2UgPSB1c2VySWRSZXNvdXJjZS5hZGRSZXNvdXJjZSgncHJvZmlsZScpO1xuXG4gICAgLy8gQWRkIEdFVCBtZXRob2RcbiAgICBwcm9maWxlUmVzb3VyY2UuYWRkTWV0aG9kKFxuICAgICAgJ0dFVCcsXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbih0aGlzLmdldFVzZXJQcm9maWxlRnVuY3Rpb24pLFxuICAgICAge1xuICAgICAgICBhdXRob3JpemVyLFxuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gQWRkIC9hcGkvdXNlcnMve3VzZXJJZH0vbmF0YWwtY2hhcnQgcmVzb3VyY2VcbiAgICBjb25zdCBuYXRhbENoYXJ0UmVzb3VyY2UgPSB1c2VySWRSZXNvdXJjZS5hZGRSZXNvdXJjZSgnbmF0YWwtY2hhcnQnKTtcbiAgICBuYXRhbENoYXJ0UmVzb3VyY2UuYWRkTWV0aG9kKFxuICAgICAgJ0dFVCcsXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbih0aGlzLmdldE5hdGFsQ2hhcnRGdW5jdGlvbiksXG4gICAgICB7XG4gICAgICAgIGF1dGhvcml6ZXIsXG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBBZGQgUFVUIG1ldGhvZFxuICAgIHByb2ZpbGVSZXNvdXJjZS5hZGRNZXRob2QoXG4gICAgICAnUFVUJyxcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHRoaXMudXBkYXRlVXNlclByb2ZpbGVGdW5jdGlvbiksXG4gICAgICB7XG4gICAgICAgIGF1dGhvcml6ZXIsXG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyBPdXRwdXQgQVBJIFVSTFxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBcGlVcmwnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5hcGkudXJsLFxuICAgICAgZGVzY3JpcHRpb246ICdBUEkgR2F0ZXdheSBVUkwnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FwaUVuZHBvaW50Jywge1xuICAgICAgdmFsdWU6IGAke3RoaXMuYXBpLnVybH1hcGkvdXNlcnMve3VzZXJJZH0vcHJvZmlsZWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ1VzZXIgUHJvZmlsZSBBUEkgRW5kcG9pbnQnLFxuICAgIH0pO1xuICB9XG59XG4iXX0=