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
exports.CognitoAuthConstruct = void 0;
const constructs_1 = require("constructs");
const cdk = __importStar(require("aws-cdk-lib"));
const cognito = __importStar(require("aws-cdk-lib/aws-cognito"));
const secretsmanager = __importStar(require("aws-cdk-lib/aws-secretsmanager"));
class CognitoAuthConstruct extends constructs_1.Construct {
    userPool;
    userPoolClient;
    userPoolDomain;
    constructor(scope, id, props) {
        super(scope, id);
        // Create User Pool
        this.userPool = new cognito.UserPool(this, 'UserPool', {
            userPoolName: `aura28-${props.environment}-user-pool`,
            selfSignUpEnabled: true,
            signInAliases: {
                email: true,
                username: false,
            },
            autoVerify: {
                email: true,
            },
            standardAttributes: {
                email: {
                    required: true,
                    mutable: true,
                },
                givenName: {
                    required: false,
                    mutable: true,
                },
                familyName: {
                    required: false,
                    mutable: true,
                },
                birthdate: {
                    required: false,
                    mutable: true,
                },
            },
            customAttributes: {
                birthTime: new cognito.StringAttribute({
                    minLen: 1,
                    maxLen: 10,
                    mutable: true,
                }),
                birthPlace: new cognito.StringAttribute({
                    minLen: 1,
                    maxLen: 256,
                    mutable: true,
                }),
                birthLatitude: new cognito.StringAttribute({
                    minLen: 1,
                    maxLen: 20,
                    mutable: true,
                }),
                birthLongitude: new cognito.StringAttribute({
                    minLen: 1,
                    maxLen: 20,
                    mutable: true,
                }),
                birthCity: new cognito.StringAttribute({
                    minLen: 1,
                    maxLen: 100,
                    mutable: true,
                }),
                birthState: new cognito.StringAttribute({
                    minLen: 1,
                    maxLen: 100,
                    mutable: true,
                }),
                birthCountry: new cognito.StringAttribute({
                    minLen: 1,
                    maxLen: 100,
                    mutable: true,
                }),
                birthDate: new cognito.StringAttribute({
                    minLen: 10,
                    maxLen: 10,
                    mutable: true,
                }),
                birthName: new cognito.StringAttribute({
                    minLen: 1,
                    maxLen: 256,
                    mutable: true,
                }),
            },
            passwordPolicy: {
                minLength: 8,
                requireLowercase: true,
                requireUppercase: true,
                requireDigits: true,
                requireSymbols: false,
            },
            accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
            removalPolicy: props.environment === 'dev' ? cdk.RemovalPolicy.DESTROY : cdk.RemovalPolicy.RETAIN,
        });
        // Create User Pool Domain
        this.userPoolDomain = new cognito.UserPoolDomain(this, 'UserPoolDomain', {
            userPool: this.userPool,
            cognitoDomain: {
                domainPrefix: props.domainPrefix,
            },
        });
        // Create User Pool Client
        this.userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
            userPool: this.userPool,
            userPoolClientName: `aura28-${props.environment}-client`,
            generateSecret: false,
            authFlows: {
                userPassword: true,
                userSrp: true,
            },
            oAuth: {
                flows: {
                    authorizationCodeGrant: true,
                    implicitCodeGrant: false,
                },
                scopes: [
                    cognito.OAuthScope.EMAIL,
                    cognito.OAuthScope.OPENID,
                    cognito.OAuthScope.PROFILE,
                    cognito.OAuthScope.COGNITO_ADMIN,
                ],
                callbackUrls: props.callbackUrls,
                logoutUrls: props.logoutUrls,
            },
            preventUserExistenceErrors: true,
            supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO],
            readAttributes: new cognito.ClientAttributes()
                .withStandardAttributes({
                email: true,
                emailVerified: true,
                givenName: true,
                familyName: true,
                birthdate: true,
            })
                .withCustomAttributes('birthTime', 'birthPlace', 'birthLatitude', 'birthLongitude', 'birthCity', 'birthState', 'birthCountry', 'birthDate', 'birthName'),
            writeAttributes: new cognito.ClientAttributes()
                .withStandardAttributes({
                email: true,
                givenName: true,
                familyName: true,
                birthdate: true,
            })
                .withCustomAttributes('birthTime', 'birthPlace', 'birthLatitude', 'birthLongitude', 'birthCity', 'birthState', 'birthCountry', 'birthDate', 'birthName'),
        });
        // Create placeholder secrets for future OAuth providers
        const googleSecret = new secretsmanager.Secret(this, 'GoogleOAuthSecret', {
            secretName: `aura28/oauth/google/${props.environment}`,
            description: 'Google OAuth credentials (to be populated manually)',
            secretObjectValue: {
                client_id: cdk.SecretValue.unsafePlainText('PLACEHOLDER_GOOGLE_CLIENT_ID'),
                client_secret: cdk.SecretValue.unsafePlainText('PLACEHOLDER_GOOGLE_CLIENT_SECRET'),
            },
        });
        const facebookSecret = new secretsmanager.Secret(this, 'FacebookOAuthSecret', {
            secretName: `aura28/oauth/facebook/${props.environment}`,
            description: 'Facebook OAuth credentials (to be populated manually)',
            secretObjectValue: {
                app_id: cdk.SecretValue.unsafePlainText('PLACEHOLDER_FACEBOOK_APP_ID'),
                app_secret: cdk.SecretValue.unsafePlainText('PLACEHOLDER_FACEBOOK_APP_SECRET'),
            },
        });
        const appleSecret = new secretsmanager.Secret(this, 'AppleOAuthSecret', {
            secretName: `aura28/oauth/apple/${props.environment}`,
            description: 'Apple OAuth credentials (to be populated manually)',
            secretObjectValue: {
                services_id: cdk.SecretValue.unsafePlainText('PLACEHOLDER_APPLE_SERVICES_ID'),
                team_id: cdk.SecretValue.unsafePlainText('PLACEHOLDER_APPLE_TEAM_ID'),
                key_id: cdk.SecretValue.unsafePlainText('PLACEHOLDER_APPLE_KEY_ID'),
                private_key: cdk.SecretValue.unsafePlainText('PLACEHOLDER_APPLE_PRIVATE_KEY'),
            },
        });
        // Output values
        new cdk.CfnOutput(this, 'UserPoolId', {
            value: this.userPool.userPoolId,
            description: 'Cognito User Pool ID',
        });
        new cdk.CfnOutput(this, 'UserPoolClientId', {
            value: this.userPoolClient.userPoolClientId,
            description: 'Cognito User Pool Client ID',
        });
        new cdk.CfnOutput(this, 'CognitoDomainPrefix', {
            value: props.domainPrefix,
            description: 'Cognito Domain Prefix',
        });
        new cdk.CfnOutput(this, 'CognitoHostedUIURL', {
            value: `https://${props.domainPrefix}.auth.${cdk.Stack.of(this).region}.amazoncognito.com`,
            description: 'Cognito Hosted UI Base URL',
        });
        new cdk.CfnOutput(this, 'OAuthSecretsReminder', {
            value: `ACTION REQUIRED: When ready for social login, populate these secrets in AWS Secrets Manager: ${googleSecret.secretName}, ${facebookSecret.secretName}, ${appleSecret.secretName}`,
            description: 'OAuth Secrets Reminder',
        });
    }
}
exports.CognitoAuthConstruct = CognitoAuthConstruct;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29nbml0by1hdXRoLWNvbnN0cnVjdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImNvZ25pdG8tYXV0aC1jb25zdHJ1Y3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSwyQ0FBdUM7QUFDdkMsaURBQW1DO0FBQ25DLGlFQUFtRDtBQUNuRCwrRUFBaUU7QUFTakUsTUFBYSxvQkFBcUIsU0FBUSxzQkFBUztJQUNqQyxRQUFRLENBQW1CO0lBQzNCLGNBQWMsQ0FBeUI7SUFDdkMsY0FBYyxDQUF5QjtJQUV2RCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQWdDO1FBQ3hFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsbUJBQW1CO1FBQ25CLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxVQUFVLEVBQUU7WUFDckQsWUFBWSxFQUFFLFVBQVUsS0FBSyxDQUFDLFdBQVcsWUFBWTtZQUNyRCxpQkFBaUIsRUFBRSxJQUFJO1lBQ3ZCLGFBQWEsRUFBRTtnQkFDYixLQUFLLEVBQUUsSUFBSTtnQkFDWCxRQUFRLEVBQUUsS0FBSzthQUNoQjtZQUNELFVBQVUsRUFBRTtnQkFDVixLQUFLLEVBQUUsSUFBSTthQUNaO1lBQ0Qsa0JBQWtCLEVBQUU7Z0JBQ2xCLEtBQUssRUFBRTtvQkFDTCxRQUFRLEVBQUUsSUFBSTtvQkFDZCxPQUFPLEVBQUUsSUFBSTtpQkFDZDtnQkFDRCxTQUFTLEVBQUU7b0JBQ1QsUUFBUSxFQUFFLEtBQUs7b0JBQ2YsT0FBTyxFQUFFLElBQUk7aUJBQ2Q7Z0JBQ0QsVUFBVSxFQUFFO29CQUNWLFFBQVEsRUFBRSxLQUFLO29CQUNmLE9BQU8sRUFBRSxJQUFJO2lCQUNkO2dCQUNELFNBQVMsRUFBRTtvQkFDVCxRQUFRLEVBQUUsS0FBSztvQkFDZixPQUFPLEVBQUUsSUFBSTtpQkFDZDthQUNGO1lBQ0Qs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QkFBd0I7U0FDdEMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBaE9ELG9EQWdPQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGNvZ25pdG8gZnJvbSAnYXdzLWNkay1saWIvYXdzLWNvZ25pdG8nO1xuaW1wb3J0ICogYXMgc2VjcmV0c21hbmFnZXIgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNlY3JldHNtYW5hZ2VyJztcblxuZXhwb3J0IGludGVyZmFjZSBDb2duaXRvQXV0aENvbnN0cnVjdFByb3BzIHtcbiAgZW52aXJvbm1lbnQ6ICdkZXYnIHwgJ3Byb2QnO1xuICBkb21haW5QcmVmaXg6IHN0cmluZztcbiAgY2FsbGJhY2tVcmxzOiBzdHJpbmdbXTtcbiAgbG9nb3V0VXJsczogc3RyaW5nW107XG59XG5cbmV4cG9ydCBjbGFzcyBDb2duaXRvQXV0aENvbnN0cnVjdCBleHRlbmRzIENvbnN0cnVjdCB7XG4gIHB1YmxpYyByZWFkb25seSB1c2VyUG9vbDogY29nbml0by5Vc2VyUG9vbDtcbiAgcHVibGljIHJlYWRvbmx5IHVzZXJQb29sQ2xpZW50OiBjb2duaXRvLlVzZXJQb29sQ2xpZW50O1xuICBwdWJsaWMgcmVhZG9ubHkgdXNlclBvb2xEb21haW46IGNvZ25pdG8uVXNlclBvb2xEb21haW47XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IENvZ25pdG9BdXRoQ29uc3RydWN0UHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgLy8gQ3JlYXRlIFVzZXIgUG9vbFxuICAgIHRoaXMudXNlclBvb2wgPSBuZXcgY29nbml0by5Vc2VyUG9vbCh0aGlzLCAnVXNlclBvb2wnLCB7XG4gICAgICB1c2VyUG9vbE5hbWU6IGBhdXJhMjgtJHtwcm9wcy5lbnZpcm9ubWVudH0tdXNlci1wb29sYCxcbiAgICAgIHNlbGZTaWduVXBFbmFibGVkOiB0cnVlLFxuICAgICAgc2lnbkluQWxpYXNlczoge1xuICAgICAgICBlbWFpbDogdHJ1ZSxcbiAgICAgICAgdXNlcm5hbWU6IGZhbHNlLFxuICAgICAgfSxcbiAgICAgIGF1dG9WZXJpZnk6IHtcbiAgICAgICAgZW1haWw6IHRydWUsXG4gICAgICB9LFxuICAgICAgc3RhbmRhcmRBdHRyaWJ1dGVzOiB7XG4gICAgICAgIGVtYWlsOiB7XG4gICAgICAgICAgcmVxdWlyZWQ6IHRydWUsXG4gICAgICAgICAgbXV0YWJsZTogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgICAgZ2l2ZW5OYW1lOiB7XG4gICAgICAgICAgcmVxdWlyZWQ6IGZhbHNlLFxuICAgICAgICAgIG11dGFibGU6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIGZhbWlseU5hbWU6IHtcbiAgICAgICAgICByZXF1aXJlZDogZmFsc2UsXG4gICAgICAgICAgbXV0YWJsZTogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgICAgYmlydGhkYXRlOiB7XG4gICAgICAgICAgcmVxdWlyZWQ6IGZhbHNlLFxuICAgICAgICAgIG11dGFibGU6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgY3VzdG9tQXR0cmlidXRlczoge1xuICAgICAgICBiaXJ0aFRpbWU6IG5ldyBjb2duaXRvLlN0cmluZ0F0dHJpYnV0ZSh7XG4gICAgICAgICAgbWluTGVuOiAxLFxuICAgICAgICAgIG1heExlbjogMTAsXG4gICAgICAgICAgbXV0YWJsZTogdHJ1ZSxcbiAgICAgICAgfSksXG4gICAgICAgIGJpcnRoUGxhY2U6IG5ldyBjb2duaXRvLlN0cmluZ0F0dHJpYnV0ZSh7XG4gICAgICAgICAgbWluTGVuOiAxLFxuICAgICAgICAgIG1heExlbjogMjU2LFxuICAgICAgICAgIG11dGFibGU6IHRydWUsXG4gICAgICAgIH0pLFxuICAgICAgICBiaXJ0aExhdGl0dWRlOiBuZXcgY29nbml0by5TdHJpbmdBdHRyaWJ1dGUoe1xuICAgICAgICAgIG1pbkxlbjogMSxcbiAgICAgICAgICBtYXhMZW46IDIwLFxuICAgICAgICAgIG11dGFibGU6IHRydWUsXG4gICAgICAgIH0pLFxuICAgICAgICBiaXJ0aExvbmdpdHVkZTogbmV3IGNvZ25pdG8uU3RyaW5nQXR0cmlidXRlKHtcbiAgICAgICAgICBtaW5MZW46IDEsXG4gICAgICAgICAgbWF4TGVuOiAyMCxcbiAgICAgICAgICBtdXRhYmxlOiB0cnVlLFxuICAgICAgICB9KSxcbiAgICAgICAgYmlydGhDaXR5OiBuZXcgY29nbml0by5TdHJpbmdBdHRyaWJ1dGUoe1xuICAgICAgICAgIG1pbkxlbjogMSxcbiAgICAgICAgICBtYXhMZW46IDEwMCxcbiAgICAgICAgICBtdXRhYmxlOiB0cnVlLFxuICAgICAgICB9KSxcbiAgICAgICAgYmlydGhTdGF0ZTogbmV3IGNvZ25pdG8uU3RyaW5nQXR0cmlidXRlKHtcbiAgICAgICAgICBtaW5MZW46IDEsXG4gICAgICAgICAgbWF4TGVuOiAxMDAsXG4gICAgICAgICAgbXV0YWJsZTogdHJ1ZSxcbiAgICAgICAgfSksXG4gICAgICAgIGJpcnRoQ291bnRyeTogbmV3IGNvZ25pdG8uU3RyaW5nQXR0cmlidXRlKHtcbiAgICAgICAgICBtaW5MZW46IDEsXG4gICAgICAgICAgbWF4TGVuOiAxMDAsXG4gICAgICAgICAgbXV0YWJsZTogdHJ1ZSxcbiAgICAgICAgfSksXG4gICAgICAgIGJpcnRoRGF0ZTogbmV3IGNvZ25pdG8uU3RyaW5nQXR0cmlidXRlKHtcbiAgICAgICAgICBtaW5MZW46IDEwLFxuICAgICAgICAgIG1heExlbjogMTAsXG4gICAgICAgICAgbXV0YWJsZTogdHJ1ZSxcbiAgICAgICAgfSksXG4gICAgICAgIGJpcnRoTmFtZTogbmV3IGNvZ25pdG8uU3RyaW5nQXR0cmlidXRlKHtcbiAgICAgICAgICBtaW5MZW46IDEsXG4gICAgICAgICAgbWF4TGVuOiAyNTYsXG4gICAgICAgICAgbXV0YWJsZTogdHJ1ZSxcbiAgICAgICAgfSksXG4gICAgICB9LFxuICAgICAgcGFzc3dvcmRQb2xpY3k6IHtcbiAgICAgICAgbWluTGVuZ3RoOiA4LFxuICAgICAgICByZXF1aXJlTG93ZXJjYXNlOiB0cnVlLFxuICAgICAgICByZXF1aXJlVXBwZXJjYXNlOiB0cnVlLFxuICAgICAgICByZXF1aXJlRGlnaXRzOiB0cnVlLFxuICAgICAgICByZXF1aXJlU3ltYm9sczogZmFsc2UsXG4gICAgICB9LFxuICAgICAgYWNjb3VudFJlY292ZXJ5OiBjb2duaXRvLkFjY291bnRSZWNvdmVyeS5FTUFJTF9PTkxZLFxuICAgICAgcmVtb3ZhbFBvbGljeTpcbiAgICAgICAgcHJvcHMuZW52aXJvbm1lbnQgPT09ICdkZXYnID8gY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSA6IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTixcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBVc2VyIFBvb2wgRG9tYWluXG4gICAgdGhpcy51c2VyUG9vbERvbWFpbiA9IG5ldyBjb2duaXRvLlVzZXJQb29sRG9tYWluKHRoaXMsICdVc2VyUG9vbERvbWFpbicsIHtcbiAgICAgIHVzZXJQb29sOiB0aGlzLnVzZXJQb29sLFxuICAgICAgY29nbml0b0RvbWFpbjoge1xuICAgICAgICBkb21haW5QcmVmaXg6IHByb3BzLmRvbWFpblByZWZpeCxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgVXNlciBQb29sIENsaWVudFxuICAgIHRoaXMudXNlclBvb2xDbGllbnQgPSBuZXcgY29nbml0by5Vc2VyUG9vbENsaWVudCh0aGlzLCAnVXNlclBvb2xDbGllbnQnLCB7XG4gICAgICB1c2VyUG9vbDogdGhpcy51c2VyUG9vbCxcbiAgICAgIHVzZXJQb29sQ2xpZW50TmFtZTogYGF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS1jbGllbnRgLFxuICAgICAgZ2VuZXJhdGVTZWNyZXQ6IGZhbHNlLFxuICAgICAgYXV0aEZsb3dzOiB7XG4gICAgICAgIHVzZXJQYXNzd29yZDogdHJ1ZSxcbiAgICAgICAgdXNlclNycDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBvQXV0aDoge1xuICAgICAgICBmbG93czoge1xuICAgICAgICAgIGF1dGhvcml6YXRpb25Db2RlR3JhbnQ6IHRydWUsXG4gICAgICAgICAgaW1wbGljaXRDb2RlR3JhbnQ6IGZhbHNlLFxuICAgICAgICB9LFxuICAgICAgICBzY29wZXM6IFtcbiAgICAgICAgICBjb2duaXRvLk9BdXRoU2NvcGUuRU1BSUwsXG4gICAgICAgICAgY29nbml0by5PQXV0aFNjb3BlLk9QRU5JRCxcbiAgICAgICAgICBjb2duaXRvLk9BdXRoU2NvcGUuUFJPRklMRSxcbiAgICAgICAgICBjb2duaXRvLk9BdXRoU2NvcGUuQ09HTklUT19BRE1JTixcbiAgICAgICAgXSxcbiAgICAgICAgY2FsbGJhY2tVcmxzOiBwcm9wcy5jYWxsYmFja1VybHMsXG4gICAgICAgIGxvZ291dFVybHM6IHByb3BzLmxvZ291dFVybHMsXG4gICAgICB9LFxuICAgICAgcHJldmVudFVzZXJFeGlzdGVuY2VFcnJvcnM6IHRydWUsXG4gICAgICBzdXBwb3J0ZWRJZGVudGl0eVByb3ZpZGVyczogW2NvZ25pdG8uVXNlclBvb2xDbGllbnRJZGVudGl0eVByb3ZpZGVyLkNPR05JVE9dLFxuICAgICAgcmVhZEF0dHJpYnV0ZXM6IG5ldyBjb2duaXRvLkNsaWVudEF0dHJpYnV0ZXMoKVxuICAgICAgICAud2l0aFN0YW5kYXJkQXR0cmlidXRlcyh7XG4gICAgICAgICAgZW1haWw6IHRydWUsXG4gICAgICAgICAgZW1haWxWZXJpZmllZDogdHJ1ZSxcbiAgICAgICAgICBnaXZlbk5hbWU6IHRydWUsXG4gICAgICAgICAgZmFtaWx5TmFtZTogdHJ1ZSxcbiAgICAgICAgICBiaXJ0aGRhdGU6IHRydWUsXG4gICAgICAgIH0pXG4gICAgICAgIC53aXRoQ3VzdG9tQXR0cmlidXRlcyhcbiAgICAgICAgICAnYmlydGhUaW1lJyxcbiAgICAgICAgICAnYmlydGhQbGFjZScsXG4gICAgICAgICAgJ2JpcnRoTGF0aXR1ZGUnLFxuICAgICAgICAgICdiaXJ0aExvbmdpdHVkZScsXG4gICAgICAgICAgJ2JpcnRoQ2l0eScsXG4gICAgICAgICAgJ2JpcnRoU3RhdGUnLFxuICAgICAgICAgICdiaXJ0aENvdW50cnknLFxuICAgICAgICAgICdiaXJ0aERhdGUnLFxuICAgICAgICAgICdiaXJ0aE5hbWUnLFxuICAgICAgICApLFxuICAgICAgd3JpdGVBdHRyaWJ1dGVzOiBuZXcgY29nbml0by5DbGllbnRBdHRyaWJ1dGVzKClcbiAgICAgICAgLndpdGhTdGFuZGFyZEF0dHJpYnV0ZXMoe1xuICAgICAgICAgIGVtYWlsOiB0cnVlLFxuICAgICAgICAgIGdpdmVuTmFtZTogdHJ1ZSxcbiAgICAgICAgICBmYW1pbHlOYW1lOiB0cnVlLFxuICAgICAgICAgIGJpcnRoZGF0ZTogdHJ1ZSxcbiAgICAgICAgfSlcbiAgICAgICAgLndpdGhDdXN0b21BdHRyaWJ1dGVzKFxuICAgICAgICAgICdiaXJ0aFRpbWUnLFxuICAgICAgICAgICdiaXJ0aFBsYWNlJyxcbiAgICAgICAgICAnYmlydGhMYXRpdHVkZScsXG4gICAgICAgICAgJ2JpcnRoTG9uZ2l0dWRlJyxcbiAgICAgICAgICAnYmlydGhDaXR5JyxcbiAgICAgICAgICAnYmlydGhTdGF0ZScsXG4gICAgICAgICAgJ2JpcnRoQ291bnRyeScsXG4gICAgICAgICAgJ2JpcnRoRGF0ZScsXG4gICAgICAgICAgJ2JpcnRoTmFtZScsXG4gICAgICAgICksXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgcGxhY2Vob2xkZXIgc2VjcmV0cyBmb3IgZnV0dXJlIE9BdXRoIHByb3ZpZGVyc1xuICAgIGNvbnN0IGdvb2dsZVNlY3JldCA9IG5ldyBzZWNyZXRzbWFuYWdlci5TZWNyZXQodGhpcywgJ0dvb2dsZU9BdXRoU2VjcmV0Jywge1xuICAgICAgc2VjcmV0TmFtZTogYGF1cmEyOC9vYXV0aC9nb29nbGUvJHtwcm9wcy5lbnZpcm9ubWVudH1gLFxuICAgICAgZGVzY3JpcHRpb246ICdHb29nbGUgT0F1dGggY3JlZGVudGlhbHMgKHRvIGJlIHBvcHVsYXRlZCBtYW51YWxseSknLFxuICAgICAgc2VjcmV0T2JqZWN0VmFsdWU6IHtcbiAgICAgICAgY2xpZW50X2lkOiBjZGsuU2VjcmV0VmFsdWUudW5zYWZlUGxhaW5UZXh0KCdQTEFDRUhPTERFUl9HT09HTEVfQ0xJRU5UX0lEJyksXG4gICAgICAgIGNsaWVudF9zZWNyZXQ6IGNkay5TZWNyZXRWYWx1ZS51bnNhZmVQbGFpblRleHQoJ1BMQUNFSE9MREVSX0dPT0dMRV9DTElFTlRfU0VDUkVUJyksXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgY29uc3QgZmFjZWJvb2tTZWNyZXQgPSBuZXcgc2VjcmV0c21hbmFnZXIuU2VjcmV0KHRoaXMsICdGYWNlYm9va09BdXRoU2VjcmV0Jywge1xuICAgICAgc2VjcmV0TmFtZTogYGF1cmEyOC9vYXV0aC9mYWNlYm9vay8ke3Byb3BzLmVudmlyb25tZW50fWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ0ZhY2Vib29rIE9BdXRoIGNyZWRlbnRpYWxzICh0byBiZSBwb3B1bGF0ZWQgbWFudWFsbHkpJyxcbiAgICAgIHNlY3JldE9iamVjdFZhbHVlOiB7XG4gICAgICAgIGFwcF9pZDogY2RrLlNlY3JldFZhbHVlLnVuc2FmZVBsYWluVGV4dCgnUExBQ0VIT0xERVJfRkFDRUJPT0tfQVBQX0lEJyksXG4gICAgICAgIGFwcF9zZWNyZXQ6IGNkay5TZWNyZXRWYWx1ZS51bnNhZmVQbGFpblRleHQoJ1BMQUNFSE9MREVSX0ZBQ0VCT09LX0FQUF9TRUNSRVQnKSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBjb25zdCBhcHBsZVNlY3JldCA9IG5ldyBzZWNyZXRzbWFuYWdlci5TZWNyZXQodGhpcywgJ0FwcGxlT0F1dGhTZWNyZXQnLCB7XG4gICAgICBzZWNyZXROYW1lOiBgYXVyYTI4L29hdXRoL2FwcGxlLyR7cHJvcHMuZW52aXJvbm1lbnR9YCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQXBwbGUgT0F1dGggY3JlZGVudGlhbHMgKHRvIGJlIHBvcHVsYXRlZCBtYW51YWxseSknLFxuICAgICAgc2VjcmV0T2JqZWN0VmFsdWU6IHtcbiAgICAgICAgc2VydmljZXNfaWQ6IGNkay5TZWNyZXRWYWx1ZS51bnNhZmVQbGFpblRleHQoJ1BMQUNFSE9MREVSX0FQUExFX1NFUlZJQ0VTX0lEJyksXG4gICAgICAgIHRlYW1faWQ6IGNkay5TZWNyZXRWYWx1ZS51bnNhZmVQbGFpblRleHQoJ1BMQUNFSE9MREVSX0FQUExFX1RFQU1fSUQnKSxcbiAgICAgICAga2V5X2lkOiBjZGsuU2VjcmV0VmFsdWUudW5zYWZlUGxhaW5UZXh0KCdQTEFDRUhPTERFUl9BUFBMRV9LRVlfSUQnKSxcbiAgICAgICAgcHJpdmF0ZV9rZXk6IGNkay5TZWNyZXRWYWx1ZS51bnNhZmVQbGFpblRleHQoJ1BMQUNFSE9MREVSX0FQUExFX1BSSVZBVEVfS0VZJyksXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gT3V0cHV0IHZhbHVlc1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdVc2VyUG9vbElkJywge1xuICAgICAgdmFsdWU6IHRoaXMudXNlclBvb2wudXNlclBvb2xJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29nbml0byBVc2VyIFBvb2wgSUQnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1VzZXJQb29sQ2xpZW50SWQnLCB7XG4gICAgICB2YWx1ZTogdGhpcy51c2VyUG9vbENsaWVudC51c2VyUG9vbENsaWVudElkLFxuICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIFVzZXIgUG9vbCBDbGllbnQgSUQnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0NvZ25pdG9Eb21haW5QcmVmaXgnLCB7XG4gICAgICB2YWx1ZTogcHJvcHMuZG9tYWluUHJlZml4LFxuICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIERvbWFpbiBQcmVmaXgnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0NvZ25pdG9Ib3N0ZWRVSVVSTCcsIHtcbiAgICAgIHZhbHVlOiBgaHR0cHM6Ly8ke3Byb3BzLmRvbWFpblByZWZpeH0uYXV0aC4ke2Nkay5TdGFjay5vZih0aGlzKS5yZWdpb259LmFtYXpvbmNvZ25pdG8uY29tYCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29nbml0byBIb3N0ZWQgVUkgQmFzZSBVUkwnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ09BdXRoU2VjcmV0c1JlbWluZGVyJywge1xuICAgICAgdmFsdWU6IGBBQ1RJT04gUkVRVUlSRUQ6IFdoZW4gcmVhZHkgZm9yIHNvY2lhbCBsb2dpbiwgcG9wdWxhdGUgdGhlc2Ugc2VjcmV0cyBpbiBBV1MgU2VjcmV0cyBNYW5hZ2VyOiAke2dvb2dsZVNlY3JldC5zZWNyZXROYW1lfSwgJHtmYWNlYm9va1NlY3JldC5zZWNyZXROYW1lfSwgJHthcHBsZVNlY3JldC5zZWNyZXROYW1lfWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ09BdXRoIFNlY3JldHMgUmVtaW5kZXInLFxuICAgIH0pO1xuICB9XG59XG4iXX0=