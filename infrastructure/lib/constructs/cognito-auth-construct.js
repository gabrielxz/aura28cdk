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
        // Create Admin Group
        this.userPool.addGroup('AdminGroup', {
            groupName: 'admin',
            description: 'Administrator users with elevated privileges',
            precedence: 1, // Highest priority
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
                .withCustomAttributes(),
            writeAttributes: new cognito.ClientAttributes()
                .withStandardAttributes({
                email: true,
                givenName: true,
                familyName: true,
                birthdate: true,
            })
                .withCustomAttributes(),
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
        new cdk.CfnOutput(this, 'AdminGroupName', {
            value: 'admin',
            description: 'Cognito Admin Group Name',
        });
        new cdk.CfnOutput(this, 'OAuthSecretsReminder', {
            value: `ACTION REQUIRED: When ready for social login, populate these secrets in AWS Secrets Manager: ${googleSecret.secretName}, ${facebookSecret.secretName}, ${appleSecret.secretName}`,
            description: 'OAuth Secrets Reminder',
        });
    }
}
exports.CognitoAuthConstruct = CognitoAuthConstruct;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29nbml0by1hdXRoLWNvbnN0cnVjdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImNvZ25pdG8tYXV0aC1jb25zdHJ1Y3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSwyQ0FBdUM7QUFDdkMsaURBQW1DO0FBQ25DLGlFQUFtRDtBQUNuRCwrRUFBaUU7QUFTakUsTUFBYSxvQkFBcUIsU0FBUSxzQkFBUztJQUNqQyxRQUFRLENBQW1CO0lBQzNCLGNBQWMsQ0FBeUI7SUFDdkMsY0FBYyxDQUF5QjtJQUV2RCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQWdDO1FBQ3hFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsbUJBQW1CO1FBQ25CLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxVQUFVLEVBQUU7WUFDckQsWUFBWSxFQUFFLFVBQVUsS0FBSyxDQUFDLFdBQVcsWUFBWTtZQUNyRCxpQkFBaUIsRUFBRSxJQUFJO1lBQ3ZCLGFBQWEsRUFBRTtnQkFDYixLQUFLLEVBQUUsSUFBSTtnQkFDWCxRQUFRLEVBQUUsS0FBSzthQUNoQjtZQUNELFVBQVUsRUFBRTtnQkFDVixLQUFLLEVBQUUsSUFBSTthQUNaO1lBQ0Qsa0JBQWtCLEVBQUU7Z0JBQ2xCLEtBQUssRUFBRTtvQkFDTCxRQUFRLEVBQUUsSUFBSTtvQkFDZCxPQUFPLEVBQUUsSUFBSTtpQkFDZDtnQkFDRCxTQUFTLEVBQUU7b0JBQ1QsUUFBUSxFQUFFLEtBQUs7b0JBQ2YsT0FBTyxFQUFFLElBQUk7aUJBQ2Q7Z0JBQ0QsVUFBVSxFQUFFO29CQUNWLFFBQVEsRUFBRSxLQUFLO29CQUNmLE9BQU8sRUFBRSxJQUFJO2lCQUNkO2dCQUNELFNBQVMsRUFBRTtvQkFDVCxRQUFRLEVBQUUsS0FBSztvQkFDZixPQUFPLEVBQUUsSUFBSTtpQkFDZDthQUNGO1lBQ0Qs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ZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgY29nbml0byBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29nbml0byc7XG5pbXBvcnQgKiBhcyBzZWNyZXRzbWFuYWdlciBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc2VjcmV0c21hbmFnZXInO1xuXG5leHBvcnQgaW50ZXJmYWNlIENvZ25pdG9BdXRoQ29uc3RydWN0UHJvcHMge1xuICBlbnZpcm9ubWVudDogJ2RldicgfCAncHJvZCc7XG4gIGRvbWFpblByZWZpeDogc3RyaW5nO1xuICBjYWxsYmFja1VybHM6IHN0cmluZ1tdO1xuICBsb2dvdXRVcmxzOiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGNsYXNzIENvZ25pdG9BdXRoQ29uc3RydWN0IGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgcHVibGljIHJlYWRvbmx5IHVzZXJQb29sOiBjb2duaXRvLlVzZXJQb29sO1xuICBwdWJsaWMgcmVhZG9ubHkgdXNlclBvb2xDbGllbnQ6IGNvZ25pdG8uVXNlclBvb2xDbGllbnQ7XG4gIHB1YmxpYyByZWFkb25seSB1c2VyUG9vbERvbWFpbjogY29nbml0by5Vc2VyUG9vbERvbWFpbjtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogQ29nbml0b0F1dGhDb25zdHJ1Y3RQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICAvLyBDcmVhdGUgVXNlciBQb29sXG4gICAgdGhpcy51c2VyUG9vbCA9IG5ldyBjb2duaXRvLlVzZXJQb29sKHRoaXMsICdVc2VyUG9vbCcsIHtcbiAgICAgIHVzZXJQb29sTmFtZTogYGF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS11c2VyLXBvb2xgLFxuICAgICAgc2VsZlNpZ25VcEVuYWJsZWQ6IHRydWUsXG4gICAgICBzaWduSW5BbGlhc2VzOiB7XG4gICAgICAgIGVtYWlsOiB0cnVlLFxuICAgICAgICB1c2VybmFtZTogZmFsc2UsXG4gICAgICB9LFxuICAgICAgYXV0b1ZlcmlmeToge1xuICAgICAgICBlbWFpbDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBzdGFuZGFyZEF0dHJpYnV0ZXM6IHtcbiAgICAgICAgZW1haWw6IHtcbiAgICAgICAgICByZXF1aXJlZDogdHJ1ZSxcbiAgICAgICAgICBtdXRhYmxlOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICBnaXZlbk5hbWU6IHtcbiAgICAgICAgICByZXF1aXJlZDogZmFsc2UsXG4gICAgICAgICAgbXV0YWJsZTogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgICAgZmFtaWx5TmFtZToge1xuICAgICAgICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICAgICAgICBtdXRhYmxlOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICBiaXJ0aGRhdGU6IHtcbiAgICAgICAgICByZXF1aXJlZDogZmFsc2UsXG4gICAgICAgICAgbXV0YWJsZTogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBwYXNzd29yZFBvbGljeToge1xuICAgICAgICBtaW5MZW5ndGg6IDgsXG4gICAgICAgIHJlcXVpcmVMb3dlcmNhc2U6IHRydWUsXG4gICAgICAgIHJlcXVpcmVVcHBlcmNhc2U6IHRydWUsXG4gICAgICAgIHJlcXVpcmVEaWdpdHM6IHRydWUsXG4gICAgICAgIHJlcXVpcmVTeW1ib2xzOiBmYWxzZSxcbiAgICAgIH0sXG4gICAgICBhY2NvdW50UmVjb3Zlcnk6IGNvZ25pdG8uQWNjb3VudFJlY292ZXJ5LkVNQUlMX09OTFksXG4gICAgICByZW1vdmFsUG9saWN5OlxuICAgICAgICBwcm9wcy5lbnZpcm9ubWVudCA9PT0gJ2RldicgPyBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZIDogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIEFkbWluIEdyb3VwXG4gICAgdGhpcy51c2VyUG9vbC5hZGRHcm91cCgnQWRtaW5Hcm91cCcsIHtcbiAgICAgIGdyb3VwTmFtZTogJ2FkbWluJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWRtaW5pc3RyYXRvciB1c2VycyB3aXRoIGVsZXZhdGVkIHByaXZpbGVnZXMnLFxuICAgICAgcHJlY2VkZW5jZTogMSwgLy8gSGlnaGVzdCBwcmlvcml0eVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIFVzZXIgUG9vbCBEb21haW5cbiAgICB0aGlzLnVzZXJQb29sRG9tYWluID0gbmV3IGNvZ25pdG8uVXNlclBvb2xEb21haW4odGhpcywgJ1VzZXJQb29sRG9tYWluJywge1xuICAgICAgdXNlclBvb2w6IHRoaXMudXNlclBvb2wsXG4gICAgICBjb2duaXRvRG9tYWluOiB7XG4gICAgICAgIGRvbWFpblByZWZpeDogcHJvcHMuZG9tYWluUHJlZml4LFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBVc2VyIFBvb2wgQ2xpZW50XG4gICAgdGhpcy51c2VyUG9vbENsaWVudCA9IG5ldyBjb2duaXRvLlVzZXJQb29sQ2xpZW50KHRoaXMsICdVc2VyUG9vbENsaWVudCcsIHtcbiAgICAgIHVzZXJQb29sOiB0aGlzLnVzZXJQb29sLFxuICAgICAgdXNlclBvb2xDbGllbnROYW1lOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LWNsaWVudGAsXG4gICAgICBnZW5lcmF0ZVNlY3JldDogZmFsc2UsXG4gICAgICBhdXRoRmxvd3M6IHtcbiAgICAgICAgdXNlclBhc3N3b3JkOiB0cnVlLFxuICAgICAgICB1c2VyU3JwOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIG9BdXRoOiB7XG4gICAgICAgIGZsb3dzOiB7XG4gICAgICAgICAgYXV0aG9yaXphdGlvbkNvZGVHcmFudDogdHJ1ZSxcbiAgICAgICAgICBpbXBsaWNpdENvZGVHcmFudDogZmFsc2UsXG4gICAgICAgIH0sXG4gICAgICAgIHNjb3BlczogW1xuICAgICAgICAgIGNvZ25pdG8uT0F1dGhTY29wZS5FTUFJTCxcbiAgICAgICAgICBjb2duaXRvLk9BdXRoU2NvcGUuT1BFTklELFxuICAgICAgICAgIGNvZ25pdG8uT0F1dGhTY29wZS5QUk9GSUxFLFxuICAgICAgICAgIGNvZ25pdG8uT0F1dGhTY29wZS5DT0dOSVRPX0FETUlOLFxuICAgICAgICBdLFxuICAgICAgICBjYWxsYmFja1VybHM6IHByb3BzLmNhbGxiYWNrVXJscyxcbiAgICAgICAgbG9nb3V0VXJsczogcHJvcHMubG9nb3V0VXJscyxcbiAgICAgIH0sXG4gICAgICBwcmV2ZW50VXNlckV4aXN0ZW5jZUVycm9yczogdHJ1ZSxcbiAgICAgIHN1cHBvcnRlZElkZW50aXR5UHJvdmlkZXJzOiBbY29nbml0by5Vc2VyUG9vbENsaWVudElkZW50aXR5UHJvdmlkZXIuQ09HTklUT10sXG4gICAgICByZWFkQXR0cmlidXRlczogbmV3IGNvZ25pdG8uQ2xpZW50QXR0cmlidXRlcygpXG4gICAgICAgIC53aXRoU3RhbmRhcmRBdHRyaWJ1dGVzKHtcbiAgICAgICAgICBlbWFpbDogdHJ1ZSxcbiAgICAgICAgICBlbWFpbFZlcmlmaWVkOiB0cnVlLFxuICAgICAgICAgIGdpdmVuTmFtZTogdHJ1ZSxcbiAgICAgICAgICBmYW1pbHlOYW1lOiB0cnVlLFxuICAgICAgICAgIGJpcnRoZGF0ZTogdHJ1ZSxcbiAgICAgICAgfSlcbiAgICAgICAgLndpdGhDdXN0b21BdHRyaWJ1dGVzKCksXG4gICAgICB3cml0ZUF0dHJpYnV0ZXM6IG5ldyBjb2duaXRvLkNsaWVudEF0dHJpYnV0ZXMoKVxuICAgICAgICAud2l0aFN0YW5kYXJkQXR0cmlidXRlcyh7XG4gICAgICAgICAgZW1haWw6IHRydWUsXG4gICAgICAgICAgZ2l2ZW5OYW1lOiB0cnVlLFxuICAgICAgICAgIGZhbWlseU5hbWU6IHRydWUsXG4gICAgICAgICAgYmlydGhkYXRlOiB0cnVlLFxuICAgICAgICB9KVxuICAgICAgICAud2l0aEN1c3RvbUF0dHJpYnV0ZXMoKSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBwbGFjZWhvbGRlciBzZWNyZXRzIGZvciBmdXR1cmUgT0F1dGggcHJvdmlkZXJzXG4gICAgY29uc3QgZ29vZ2xlU2VjcmV0ID0gbmV3IHNlY3JldHNtYW5hZ2VyLlNlY3JldCh0aGlzLCAnR29vZ2xlT0F1dGhTZWNyZXQnLCB7XG4gICAgICBzZWNyZXROYW1lOiBgYXVyYTI4L29hdXRoL2dvb2dsZS8ke3Byb3BzLmVudmlyb25tZW50fWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ0dvb2dsZSBPQXV0aCBjcmVkZW50aWFscyAodG8gYmUgcG9wdWxhdGVkIG1hbnVhbGx5KScsXG4gICAgICBzZWNyZXRPYmplY3RWYWx1ZToge1xuICAgICAgICBjbGllbnRfaWQ6IGNkay5TZWNyZXRWYWx1ZS51bnNhZmVQbGFpblRleHQoJ1BMQUNFSE9MREVSX0dPT0dMRV9DTElFTlRfSUQnKSxcbiAgICAgICAgY2xpZW50X3NlY3JldDogY2RrLlNlY3JldFZhbHVlLnVuc2FmZVBsYWluVGV4dCgnUExBQ0VIT0xERVJfR09PR0xFX0NMSUVOVF9TRUNSRVQnKSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBjb25zdCBmYWNlYm9va1NlY3JldCA9IG5ldyBzZWNyZXRzbWFuYWdlci5TZWNyZXQodGhpcywgJ0ZhY2Vib29rT0F1dGhTZWNyZXQnLCB7XG4gICAgICBzZWNyZXROYW1lOiBgYXVyYTI4L29hdXRoL2ZhY2Vib29rLyR7cHJvcHMuZW52aXJvbm1lbnR9YCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRmFjZWJvb2sgT0F1dGggY3JlZGVudGlhbHMgKHRvIGJlIHBvcHVsYXRlZCBtYW51YWxseSknLFxuICAgICAgc2VjcmV0T2JqZWN0VmFsdWU6IHtcbiAgICAgICAgYXBwX2lkOiBjZGsuU2VjcmV0VmFsdWUudW5zYWZlUGxhaW5UZXh0KCdQTEFDRUhPTERFUl9GQUNFQk9PS19BUFBfSUQnKSxcbiAgICAgICAgYXBwX3NlY3JldDogY2RrLlNlY3JldFZhbHVlLnVuc2FmZVBsYWluVGV4dCgnUExBQ0VIT0xERVJfRkFDRUJPT0tfQVBQX1NFQ1JFVCcpLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGNvbnN0IGFwcGxlU2VjcmV0ID0gbmV3IHNlY3JldHNtYW5hZ2VyLlNlY3JldCh0aGlzLCAnQXBwbGVPQXV0aFNlY3JldCcsIHtcbiAgICAgIHNlY3JldE5hbWU6IGBhdXJhMjgvb2F1dGgvYXBwbGUvJHtwcm9wcy5lbnZpcm9ubWVudH1gLFxuICAgICAgZGVzY3JpcHRpb246ICdBcHBsZSBPQXV0aCBjcmVkZW50aWFscyAodG8gYmUgcG9wdWxhdGVkIG1hbnVhbGx5KScsXG4gICAgICBzZWNyZXRPYmplY3RWYWx1ZToge1xuICAgICAgICBzZXJ2aWNlc19pZDogY2RrLlNlY3JldFZhbHVlLnVuc2FmZVBsYWluVGV4dCgnUExBQ0VIT0xERVJfQVBQTEVfU0VSVklDRVNfSUQnKSxcbiAgICAgICAgdGVhbV9pZDogY2RrLlNlY3JldFZhbHVlLnVuc2FmZVBsYWluVGV4dCgnUExBQ0VIT0xERVJfQVBQTEVfVEVBTV9JRCcpLFxuICAgICAgICBrZXlfaWQ6IGNkay5TZWNyZXRWYWx1ZS51bnNhZmVQbGFpblRleHQoJ1BMQUNFSE9MREVSX0FQUExFX0tFWV9JRCcpLFxuICAgICAgICBwcml2YXRlX2tleTogY2RrLlNlY3JldFZhbHVlLnVuc2FmZVBsYWluVGV4dCgnUExBQ0VIT0xERVJfQVBQTEVfUFJJVkFURV9LRVknKSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBPdXRwdXQgdmFsdWVzXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1VzZXJQb29sSWQnLCB7XG4gICAgICB2YWx1ZTogdGhpcy51c2VyUG9vbC51c2VyUG9vbElkLFxuICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIFVzZXIgUG9vbCBJRCcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVXNlclBvb2xDbGllbnRJZCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnVzZXJQb29sQ2xpZW50LnVzZXJQb29sQ2xpZW50SWQsXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gVXNlciBQb29sIENsaWVudCBJRCcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQ29nbml0b0RvbWFpblByZWZpeCcsIHtcbiAgICAgIHZhbHVlOiBwcm9wcy5kb21haW5QcmVmaXgsXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gRG9tYWluIFByZWZpeCcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQ29nbml0b0hvc3RlZFVJVVJMJywge1xuICAgICAgdmFsdWU6IGBodHRwczovLyR7cHJvcHMuZG9tYWluUHJlZml4fS5hdXRoLiR7Y2RrLlN0YWNrLm9mKHRoaXMpLnJlZ2lvbn0uYW1hem9uY29nbml0by5jb21gLFxuICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIEhvc3RlZCBVSSBCYXNlIFVSTCcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQWRtaW5Hcm91cE5hbWUnLCB7XG4gICAgICB2YWx1ZTogJ2FkbWluJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29nbml0byBBZG1pbiBHcm91cCBOYW1lJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdPQXV0aFNlY3JldHNSZW1pbmRlcicsIHtcbiAgICAgIHZhbHVlOiBgQUNUSU9OIFJFUVVJUkVEOiBXaGVuIHJlYWR5IGZvciBzb2NpYWwgbG9naW4sIHBvcHVsYXRlIHRoZXNlIHNlY3JldHMgaW4gQVdTIFNlY3JldHMgTWFuYWdlcjogJHtnb29nbGVTZWNyZXQuc2VjcmV0TmFtZX0sICR7ZmFjZWJvb2tTZWNyZXQuc2VjcmV0TmFtZX0sICR7YXBwbGVTZWNyZXQuc2VjcmV0TmFtZX1gLFxuICAgICAgZGVzY3JpcHRpb246ICdPQXV0aCBTZWNyZXRzIFJlbWluZGVyJyxcbiAgICB9KTtcbiAgfVxufVxuIl19