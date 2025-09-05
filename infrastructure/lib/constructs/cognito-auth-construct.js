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
        // Create or reference Google OAuth secret
        // Always create a placeholder for now (will be replaced with actual credentials later)
        new secretsmanager.Secret(this, 'GoogleOAuthSecret', {
            secretName: `aura28/oauth/google/${props.environment}`,
            description: 'Google OAuth credentials (to be populated manually)',
            secretObjectValue: {
                client_id: cdk.SecretValue.unsafePlainText('PLACEHOLDER_GOOGLE_CLIENT_ID'),
                client_secret: cdk.SecretValue.unsafePlainText('PLACEHOLDER_GOOGLE_CLIENT_SECRET'),
            },
        });
        // Create Google identity provider
        const googleProvider = new cognito.UserPoolIdentityProviderGoogle(this, 'GoogleProvider', {
            clientId: 'PLACEHOLDER_GOOGLE_CLIENT_ID',
            clientSecretValue: cdk.SecretValue.unsafePlainText('PLACEHOLDER_GOOGLE_CLIENT_SECRET'),
            userPool: this.userPool,
            attributeMapping: {
                email: cognito.ProviderAttribute.GOOGLE_EMAIL,
                givenName: cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
                familyName: cognito.ProviderAttribute.GOOGLE_FAMILY_NAME,
            },
            scopes: ['profile', 'email', 'openid'],
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
            supportedIdentityProviders: [
                cognito.UserPoolClientIdentityProvider.COGNITO,
                cognito.UserPoolClientIdentityProvider.GOOGLE,
            ],
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
        // Ensure proper dependency - client depends on provider
        this.userPoolClient.node.addDependency(googleProvider);
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
            value: `ACTION REQUIRED: When ready for social login, populate these secrets in AWS Secrets Manager: aura28/oauth/google/${props.environment}, ${facebookSecret.secretName}, ${appleSecret.secretName}`,
            description: 'OAuth Secrets Reminder',
        });
    }
}
exports.CognitoAuthConstruct = CognitoAuthConstruct;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29nbml0by1hdXRoLWNvbnN0cnVjdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImNvZ25pdG8tYXV0aC1jb25zdHJ1Y3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSwyQ0FBdUM7QUFDdkMsaURBQW1DO0FBQ25DLGlFQUFtRDtBQUNuRCwrRUFBaUU7QUFTakUsTUFBYSxvQkFBcUIsU0FBUSxzQkFBUztJQUNqQyxRQUFRLENBQW1CO0lBQzNCLGNBQWMsQ0FBeUI7SUFDdkMsY0FBYyxDQUF5QjtJQUV2RCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQWdDO1FBQ3hFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsbUJBQW1CO1FBQ25CLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxVQUFVLEVBQUU7WUFDckQsWUFBWSxFQUFFLFVBQVUsS0FBSyxDQUFDLFdBQVcsWUFBWTtZQUNyRCxpQkFBaUIsRUFBRSxJQUFJO1lBQ3ZCLGFBQWEsRUFBRTtnQkFDYixLQUFLLEVBQUUsSUFBSTtnQkFDWCxRQUFRLEVBQUUsS0FBSzthQUNoQjtZQUNELFVBQVUsRUFBRTtnQkFDVixLQUFLLEVBQUUsSUFBSTthQUNaO1lBQ0Qsa0JBQWtCLEVBQUU7Z0JBQ2xCLEtBQUssRUFBRTtvQkFDTCxRQUFRLEVBQUUsSUFBSTtvQkFDZCxPQUFPLEVBQUUsSUFBSTtpQkFDZDtnQkFDRCxTQUFTLEVBQUU7b0JBQ1QsUUFBUSxFQUFFLEtBQUs7b0JBQ2YsT0FBTyxFQUFFLElBQUk7aUJBQ2Q7Z0JBQ0QsVUFBVSxFQUFFO29CQUNWLFFBQVEsRUFBRSxLQUFLO29CQUNmLE9BQU8sRUFBRSxJQUFJO2lCQUNkO2dCQUNELFNBQVMsRUFBRTtvQkFDVCxRQUFRLEVBQUUsS0FBSztvQkFDZixPQUFPLEVBQUUsSUFBSTtpQkFDZDthQUNGO1lBQ0Qs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RyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsb0JBQW9CLEVBQUU7WUFDNUMsS0FBSyxFQUFFLFdBQVcsS0FBSyxDQUFDLFlBQVksU0FBUyxHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLG9CQUFvQjtZQUMxRixXQUFXLEVBQUUsNEJBQTRCO1NBQzFDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsZ0JBQWdCLEVBQUU7WUFDeEMsS0FBSyxFQUFFLE9BQU87WUFDZCxXQUFXLEVBQUUsMEJBQTBCO1NBQ3hDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsc0JBQXNCLEVBQUU7WUFDOUMsS0FBSyxFQUFFLG9IQUFvSCxLQUFLLENBQUMsV0FBVyxLQUFLLGNBQWMsQ0FBQyxVQUFVLEtBQUssV0FBVyxDQUFDLFVBQVUsRUFBRTtZQUN2TSxXQUFXLEVBQUUsd0JBQXdCO1NBQ3RDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQTdMRCxvREE2TEMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBjb2duaXRvIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jb2duaXRvJztcbmltcG9ydCAqIGFzIHNlY3JldHNtYW5hZ2VyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zZWNyZXRzbWFuYWdlcic7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ29nbml0b0F1dGhDb25zdHJ1Y3RQcm9wcyB7XG4gIGVudmlyb25tZW50OiAnZGV2JyB8ICdwcm9kJztcbiAgZG9tYWluUHJlZml4OiBzdHJpbmc7XG4gIGNhbGxiYWNrVXJsczogc3RyaW5nW107XG4gIGxvZ291dFVybHM6IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgY2xhc3MgQ29nbml0b0F1dGhDb25zdHJ1Y3QgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICBwdWJsaWMgcmVhZG9ubHkgdXNlclBvb2w6IGNvZ25pdG8uVXNlclBvb2w7XG4gIHB1YmxpYyByZWFkb25seSB1c2VyUG9vbENsaWVudDogY29nbml0by5Vc2VyUG9vbENsaWVudDtcbiAgcHVibGljIHJlYWRvbmx5IHVzZXJQb29sRG9tYWluOiBjb2duaXRvLlVzZXJQb29sRG9tYWluO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBDb2duaXRvQXV0aENvbnN0cnVjdFByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIC8vIENyZWF0ZSBVc2VyIFBvb2xcbiAgICB0aGlzLnVzZXJQb29sID0gbmV3IGNvZ25pdG8uVXNlclBvb2wodGhpcywgJ1VzZXJQb29sJywge1xuICAgICAgdXNlclBvb2xOYW1lOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LXVzZXItcG9vbGAsXG4gICAgICBzZWxmU2lnblVwRW5hYmxlZDogdHJ1ZSxcbiAgICAgIHNpZ25JbkFsaWFzZXM6IHtcbiAgICAgICAgZW1haWw6IHRydWUsXG4gICAgICAgIHVzZXJuYW1lOiBmYWxzZSxcbiAgICAgIH0sXG4gICAgICBhdXRvVmVyaWZ5OiB7XG4gICAgICAgIGVtYWlsOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIHN0YW5kYXJkQXR0cmlidXRlczoge1xuICAgICAgICBlbWFpbDoge1xuICAgICAgICAgIHJlcXVpcmVkOiB0cnVlLFxuICAgICAgICAgIG11dGFibGU6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIGdpdmVuTmFtZToge1xuICAgICAgICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICAgICAgICBtdXRhYmxlOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICBmYW1pbHlOYW1lOiB7XG4gICAgICAgICAgcmVxdWlyZWQ6IGZhbHNlLFxuICAgICAgICAgIG11dGFibGU6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIGJpcnRoZGF0ZToge1xuICAgICAgICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICAgICAgICBtdXRhYmxlOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIHBhc3N3b3JkUG9saWN5OiB7XG4gICAgICAgIG1pbkxlbmd0aDogOCxcbiAgICAgICAgcmVxdWlyZUxvd2VyY2FzZTogdHJ1ZSxcbiAgICAgICAgcmVxdWlyZVVwcGVyY2FzZTogdHJ1ZSxcbiAgICAgICAgcmVxdWlyZURpZ2l0czogdHJ1ZSxcbiAgICAgICAgcmVxdWlyZVN5bWJvbHM6IGZhbHNlLFxuICAgICAgfSxcbiAgICAgIGFjY291bnRSZWNvdmVyeTogY29nbml0by5BY2NvdW50UmVjb3ZlcnkuRU1BSUxfT05MWSxcbiAgICAgIHJlbW92YWxQb2xpY3k6XG4gICAgICAgIHByb3BzLmVudmlyb25tZW50ID09PSAnZGV2JyA/IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1kgOiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgQWRtaW4gR3JvdXBcbiAgICB0aGlzLnVzZXJQb29sLmFkZEdyb3VwKCdBZG1pbkdyb3VwJywge1xuICAgICAgZ3JvdXBOYW1lOiAnYWRtaW4nLFxuICAgICAgZGVzY3JpcHRpb246ICdBZG1pbmlzdHJhdG9yIHVzZXJzIHdpdGggZWxldmF0ZWQgcHJpdmlsZWdlcycsXG4gICAgICBwcmVjZWRlbmNlOiAxLCAvLyBIaWdoZXN0IHByaW9yaXR5XG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgVXNlciBQb29sIERvbWFpblxuICAgIHRoaXMudXNlclBvb2xEb21haW4gPSBuZXcgY29nbml0by5Vc2VyUG9vbERvbWFpbih0aGlzLCAnVXNlclBvb2xEb21haW4nLCB7XG4gICAgICB1c2VyUG9vbDogdGhpcy51c2VyUG9vbCxcbiAgICAgIGNvZ25pdG9Eb21haW46IHtcbiAgICAgICAgZG9tYWluUHJlZml4OiBwcm9wcy5kb21haW5QcmVmaXgsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIG9yIHJlZmVyZW5jZSBHb29nbGUgT0F1dGggc2VjcmV0XG4gICAgLy8gQWx3YXlzIGNyZWF0ZSBhIHBsYWNlaG9sZGVyIGZvciBub3cgKHdpbGwgYmUgcmVwbGFjZWQgd2l0aCBhY3R1YWwgY3JlZGVudGlhbHMgbGF0ZXIpXG4gICAgbmV3IHNlY3JldHNtYW5hZ2VyLlNlY3JldCh0aGlzLCAnR29vZ2xlT0F1dGhTZWNyZXQnLCB7XG4gICAgICBzZWNyZXROYW1lOiBgYXVyYTI4L29hdXRoL2dvb2dsZS8ke3Byb3BzLmVudmlyb25tZW50fWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ0dvb2dsZSBPQXV0aCBjcmVkZW50aWFscyAodG8gYmUgcG9wdWxhdGVkIG1hbnVhbGx5KScsXG4gICAgICBzZWNyZXRPYmplY3RWYWx1ZToge1xuICAgICAgICBjbGllbnRfaWQ6IGNkay5TZWNyZXRWYWx1ZS51bnNhZmVQbGFpblRleHQoJ1BMQUNFSE9MREVSX0dPT0dMRV9DTElFTlRfSUQnKSxcbiAgICAgICAgY2xpZW50X3NlY3JldDogY2RrLlNlY3JldFZhbHVlLnVuc2FmZVBsYWluVGV4dCgnUExBQ0VIT0xERVJfR09PR0xFX0NMSUVOVF9TRUNSRVQnKSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgR29vZ2xlIGlkZW50aXR5IHByb3ZpZGVyXG4gICAgY29uc3QgZ29vZ2xlUHJvdmlkZXIgPSBuZXcgY29nbml0by5Vc2VyUG9vbElkZW50aXR5UHJvdmlkZXJHb29nbGUodGhpcywgJ0dvb2dsZVByb3ZpZGVyJywge1xuICAgICAgY2xpZW50SWQ6ICdQTEFDRUhPTERFUl9HT09HTEVfQ0xJRU5UX0lEJyxcbiAgICAgIGNsaWVudFNlY3JldFZhbHVlOiBjZGsuU2VjcmV0VmFsdWUudW5zYWZlUGxhaW5UZXh0KCdQTEFDRUhPTERFUl9HT09HTEVfQ0xJRU5UX1NFQ1JFVCcpLFxuICAgICAgdXNlclBvb2w6IHRoaXMudXNlclBvb2wsXG4gICAgICBhdHRyaWJ1dGVNYXBwaW5nOiB7XG4gICAgICAgIGVtYWlsOiBjb2duaXRvLlByb3ZpZGVyQXR0cmlidXRlLkdPT0dMRV9FTUFJTCxcbiAgICAgICAgZ2l2ZW5OYW1lOiBjb2duaXRvLlByb3ZpZGVyQXR0cmlidXRlLkdPT0dMRV9HSVZFTl9OQU1FLFxuICAgICAgICBmYW1pbHlOYW1lOiBjb2duaXRvLlByb3ZpZGVyQXR0cmlidXRlLkdPT0dMRV9GQU1JTFlfTkFNRSxcbiAgICAgIH0sXG4gICAgICBzY29wZXM6IFsncHJvZmlsZScsICdlbWFpbCcsICdvcGVuaWQnXSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBVc2VyIFBvb2wgQ2xpZW50XG4gICAgdGhpcy51c2VyUG9vbENsaWVudCA9IG5ldyBjb2duaXRvLlVzZXJQb29sQ2xpZW50KHRoaXMsICdVc2VyUG9vbENsaWVudCcsIHtcbiAgICAgIHVzZXJQb29sOiB0aGlzLnVzZXJQb29sLFxuICAgICAgdXNlclBvb2xDbGllbnROYW1lOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LWNsaWVudGAsXG4gICAgICBnZW5lcmF0ZVNlY3JldDogZmFsc2UsXG4gICAgICBhdXRoRmxvd3M6IHtcbiAgICAgICAgdXNlclBhc3N3b3JkOiB0cnVlLFxuICAgICAgICB1c2VyU3JwOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIG9BdXRoOiB7XG4gICAgICAgIGZsb3dzOiB7XG4gICAgICAgICAgYXV0aG9yaXphdGlvbkNvZGVHcmFudDogdHJ1ZSxcbiAgICAgICAgICBpbXBsaWNpdENvZGVHcmFudDogZmFsc2UsXG4gICAgICAgIH0sXG4gICAgICAgIHNjb3BlczogW1xuICAgICAgICAgIGNvZ25pdG8uT0F1dGhTY29wZS5FTUFJTCxcbiAgICAgICAgICBjb2duaXRvLk9BdXRoU2NvcGUuT1BFTklELFxuICAgICAgICAgIGNvZ25pdG8uT0F1dGhTY29wZS5QUk9GSUxFLFxuICAgICAgICAgIGNvZ25pdG8uT0F1dGhTY29wZS5DT0dOSVRPX0FETUlOLFxuICAgICAgICBdLFxuICAgICAgICBjYWxsYmFja1VybHM6IHByb3BzLmNhbGxiYWNrVXJscyxcbiAgICAgICAgbG9nb3V0VXJsczogcHJvcHMubG9nb3V0VXJscyxcbiAgICAgIH0sXG4gICAgICBwcmV2ZW50VXNlckV4aXN0ZW5jZUVycm9yczogdHJ1ZSxcbiAgICAgIHN1cHBvcnRlZElkZW50aXR5UHJvdmlkZXJzOiBbXG4gICAgICAgIGNvZ25pdG8uVXNlclBvb2xDbGllbnRJZGVudGl0eVByb3ZpZGVyLkNPR05JVE8sXG4gICAgICAgIGNvZ25pdG8uVXNlclBvb2xDbGllbnRJZGVudGl0eVByb3ZpZGVyLkdPT0dMRSxcbiAgICAgIF0sXG4gICAgICByZWFkQXR0cmlidXRlczogbmV3IGNvZ25pdG8uQ2xpZW50QXR0cmlidXRlcygpXG4gICAgICAgIC53aXRoU3RhbmRhcmRBdHRyaWJ1dGVzKHtcbiAgICAgICAgICBlbWFpbDogdHJ1ZSxcbiAgICAgICAgICBlbWFpbFZlcmlmaWVkOiB0cnVlLFxuICAgICAgICAgIGdpdmVuTmFtZTogdHJ1ZSxcbiAgICAgICAgICBmYW1pbHlOYW1lOiB0cnVlLFxuICAgICAgICAgIGJpcnRoZGF0ZTogdHJ1ZSxcbiAgICAgICAgfSlcbiAgICAgICAgLndpdGhDdXN0b21BdHRyaWJ1dGVzKCksXG4gICAgICB3cml0ZUF0dHJpYnV0ZXM6IG5ldyBjb2duaXRvLkNsaWVudEF0dHJpYnV0ZXMoKVxuICAgICAgICAud2l0aFN0YW5kYXJkQXR0cmlidXRlcyh7XG4gICAgICAgICAgZW1haWw6IHRydWUsXG4gICAgICAgICAgZ2l2ZW5OYW1lOiB0cnVlLFxuICAgICAgICAgIGZhbWlseU5hbWU6IHRydWUsXG4gICAgICAgICAgYmlydGhkYXRlOiB0cnVlLFxuICAgICAgICB9KVxuICAgICAgICAud2l0aEN1c3RvbUF0dHJpYnV0ZXMoKSxcbiAgICB9KTtcblxuICAgIC8vIEVuc3VyZSBwcm9wZXIgZGVwZW5kZW5jeSAtIGNsaWVudCBkZXBlbmRzIG9uIHByb3ZpZGVyXG4gICAgdGhpcy51c2VyUG9vbENsaWVudC5ub2RlLmFkZERlcGVuZGVuY3koZ29vZ2xlUHJvdmlkZXIpO1xuXG4gICAgY29uc3QgZmFjZWJvb2tTZWNyZXQgPSBuZXcgc2VjcmV0c21hbmFnZXIuU2VjcmV0KHRoaXMsICdGYWNlYm9va09BdXRoU2VjcmV0Jywge1xuICAgICAgc2VjcmV0TmFtZTogYGF1cmEyOC9vYXV0aC9mYWNlYm9vay8ke3Byb3BzLmVudmlyb25tZW50fWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ0ZhY2Vib29rIE9BdXRoIGNyZWRlbnRpYWxzICh0byBiZSBwb3B1bGF0ZWQgbWFudWFsbHkpJyxcbiAgICAgIHNlY3JldE9iamVjdFZhbHVlOiB7XG4gICAgICAgIGFwcF9pZDogY2RrLlNlY3JldFZhbHVlLnVuc2FmZVBsYWluVGV4dCgnUExBQ0VIT0xERVJfRkFDRUJPT0tfQVBQX0lEJyksXG4gICAgICAgIGFwcF9zZWNyZXQ6IGNkay5TZWNyZXRWYWx1ZS51bnNhZmVQbGFpblRleHQoJ1BMQUNFSE9MREVSX0ZBQ0VCT09LX0FQUF9TRUNSRVQnKSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBjb25zdCBhcHBsZVNlY3JldCA9IG5ldyBzZWNyZXRzbWFuYWdlci5TZWNyZXQodGhpcywgJ0FwcGxlT0F1dGhTZWNyZXQnLCB7XG4gICAgICBzZWNyZXROYW1lOiBgYXVyYTI4L29hdXRoL2FwcGxlLyR7cHJvcHMuZW52aXJvbm1lbnR9YCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQXBwbGUgT0F1dGggY3JlZGVudGlhbHMgKHRvIGJlIHBvcHVsYXRlZCBtYW51YWxseSknLFxuICAgICAgc2VjcmV0T2JqZWN0VmFsdWU6IHtcbiAgICAgICAgc2VydmljZXNfaWQ6IGNkay5TZWNyZXRWYWx1ZS51bnNhZmVQbGFpblRleHQoJ1BMQUNFSE9MREVSX0FQUExFX1NFUlZJQ0VTX0lEJyksXG4gICAgICAgIHRlYW1faWQ6IGNkay5TZWNyZXRWYWx1ZS51bnNhZmVQbGFpblRleHQoJ1BMQUNFSE9MREVSX0FQUExFX1RFQU1fSUQnKSxcbiAgICAgICAga2V5X2lkOiBjZGsuU2VjcmV0VmFsdWUudW5zYWZlUGxhaW5UZXh0KCdQTEFDRUhPTERFUl9BUFBMRV9LRVlfSUQnKSxcbiAgICAgICAgcHJpdmF0ZV9rZXk6IGNkay5TZWNyZXRWYWx1ZS51bnNhZmVQbGFpblRleHQoJ1BMQUNFSE9MREVSX0FQUExFX1BSSVZBVEVfS0VZJyksXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gT3V0cHV0IHZhbHVlc1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdVc2VyUG9vbElkJywge1xuICAgICAgdmFsdWU6IHRoaXMudXNlclBvb2wudXNlclBvb2xJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29nbml0byBVc2VyIFBvb2wgSUQnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1VzZXJQb29sQ2xpZW50SWQnLCB7XG4gICAgICB2YWx1ZTogdGhpcy51c2VyUG9vbENsaWVudC51c2VyUG9vbENsaWVudElkLFxuICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIFVzZXIgUG9vbCBDbGllbnQgSUQnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0NvZ25pdG9Eb21haW5QcmVmaXgnLCB7XG4gICAgICB2YWx1ZTogcHJvcHMuZG9tYWluUHJlZml4LFxuICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIERvbWFpbiBQcmVmaXgnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0NvZ25pdG9Ib3N0ZWRVSVVSTCcsIHtcbiAgICAgIHZhbHVlOiBgaHR0cHM6Ly8ke3Byb3BzLmRvbWFpblByZWZpeH0uYXV0aC4ke2Nkay5TdGFjay5vZih0aGlzKS5yZWdpb259LmFtYXpvbmNvZ25pdG8uY29tYCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29nbml0byBIb3N0ZWQgVUkgQmFzZSBVUkwnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FkbWluR3JvdXBOYW1lJywge1xuICAgICAgdmFsdWU6ICdhZG1pbicsXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gQWRtaW4gR3JvdXAgTmFtZScsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnT0F1dGhTZWNyZXRzUmVtaW5kZXInLCB7XG4gICAgICB2YWx1ZTogYEFDVElPTiBSRVFVSVJFRDogV2hlbiByZWFkeSBmb3Igc29jaWFsIGxvZ2luLCBwb3B1bGF0ZSB0aGVzZSBzZWNyZXRzIGluIEFXUyBTZWNyZXRzIE1hbmFnZXI6IGF1cmEyOC9vYXV0aC9nb29nbGUvJHtwcm9wcy5lbnZpcm9ubWVudH0sICR7ZmFjZWJvb2tTZWNyZXQuc2VjcmV0TmFtZX0sICR7YXBwbGVTZWNyZXQuc2VjcmV0TmFtZX1gLFxuICAgICAgZGVzY3JpcHRpb246ICdPQXV0aCBTZWNyZXRzIFJlbWluZGVyJyxcbiAgICB9KTtcbiAgfVxufVxuIl19