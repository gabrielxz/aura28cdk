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
const acm = __importStar(require("aws-cdk-lib/aws-certificatemanager"));
class CognitoAuthConstruct extends constructs_1.Construct {
    userPool;
    userPoolClient;
    userPoolDomain;
    customDomainCertificate;
    customDomainName;
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
        // Create certificate for custom domain if needed (only for production)
        if (props.customDomain && props.environment === 'prod') {
            // Certificate must be in us-east-1 for Cognito custom domains
            this.customDomainCertificate = new acm.Certificate(this, 'CustomDomainCertificate', {
                domainName: props.customDomain.domainName,
                validation: acm.CertificateValidation.fromDns(props.customDomain.hostedZone),
            });
            this.customDomainName = props.customDomain.domainName;
        }
        // Create User Pool Domain
        if (this.customDomainCertificate && this.customDomainName) {
            // Production with custom domain
            this.userPoolDomain = new cognito.UserPoolDomain(this, 'UserPoolDomain', {
                userPool: this.userPool,
                customDomain: {
                    domainName: this.customDomainName,
                    certificate: this.customDomainCertificate,
                },
            });
        }
        else {
            // Dev environment or production without custom domain (fallback)
            this.userPoolDomain = new cognito.UserPoolDomain(this, 'UserPoolDomain', {
                userPool: this.userPool,
                cognitoDomain: {
                    domainPrefix: props.domainPrefix,
                },
            });
        }
        // Reference the existing Google OAuth secret from Secrets Manager
        // This secret should be manually created with real Google OAuth credentials
        const googleSecret = secretsmanager.Secret.fromSecretNameV2(this, 'GoogleOAuthSecret', `aura28/oauth/google/${props.environment}`);
        // Create Google identity provider using credentials from Secrets Manager
        const googleProvider = new cognito.UserPoolIdentityProviderGoogle(this, 'GoogleProvider', {
            clientId: googleSecret.secretValueFromJson('client_id').unsafeUnwrap(),
            clientSecretValue: googleSecret.secretValueFromJson('client_secret'),
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
        // Note: Facebook OAuth can be added later by creating a secret in Secrets Manager
        // with the name: aura28/oauth/facebook/${environment}
        // containing: { "app_id": "...", "app_secret": "..." }
        // Note: Apple OAuth can be added later by creating a secret in Secrets Manager
        // with the name: aura28/oauth/apple/${environment}
        // containing: { "services_id": "...", "team_id": "...", "key_id": "...", "private_key": "..." }
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
        // Output the appropriate hosted UI URL based on whether custom domain is used
        const hostedUIUrl = this.customDomainName
            ? `https://${this.customDomainName}`
            : `https://${props.domainPrefix}.auth.${cdk.Stack.of(this).region}.amazoncognito.com`;
        new cdk.CfnOutput(this, 'CognitoHostedUIURL', {
            value: hostedUIUrl,
            description: 'Cognito Hosted UI Base URL',
        });
        // Output custom domain if configured
        if (this.customDomainName) {
            new cdk.CfnOutput(this, 'CognitoCustomDomain', {
                value: this.customDomainName,
                description: 'Cognito Custom Domain',
            });
        }
        new cdk.CfnOutput(this, 'AdminGroupName', {
            value: 'admin',
            description: 'Cognito Admin Group Name',
        });
        new cdk.CfnOutput(this, 'OAuthSecretsReminder', {
            value: `Google OAuth is configured. To add more providers, create secrets in AWS Secrets Manager: aura28/oauth/facebook/${props.environment}, aura28/oauth/apple/${props.environment}`,
            description: 'OAuth Configuration Status',
        });
    }
}
exports.CognitoAuthConstruct = CognitoAuthConstruct;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29nbml0by1hdXRoLWNvbnN0cnVjdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImNvZ25pdG8tYXV0aC1jb25zdHJ1Y3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSwyQ0FBdUM7QUFDdkMsaURBQW1DO0FBQ25DLGlFQUFtRDtBQUNuRCwrRUFBaUU7QUFDakUsd0VBQTBEO0FBYzFELE1BQWEsb0JBQXFCLFNBQVEsc0JBQVM7SUFDakMsUUFBUSxDQUFtQjtJQUMzQixjQUFjLENBQXlCO0lBQ3ZDLGNBQWMsQ0FBeUI7SUFDdkMsdUJBQXVCLENBQW1CO0lBQzFDLGdCQUFnQixDQUFVO0lBRTFDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBZ0M7UUFDeEUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQixtQkFBbUI7UUFDbkIsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLE9BQU8sQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLFVBQVUsRUFBRTtZQUNyRCxZQUFZLEVBQUUsVUFBVSxLQUFLLENBQUMsV0FBVyxZQUFZO1lBQ3JELGlCQUFpQixFQUFFLElBQUk7WUFDdkIsYUFBYSxFQUFFO2dCQUNiLEtBQUssRUFBRSxJQUFJO2dCQUNYLFFBQVEsRUFBRSxLQUFLO2FBQ2hCO1lBQ0QsVUFBVSxFQUFFO2dCQUNWLEtBQUssRUFBRSxJQUFJO2FBQ1o7WUFDRCxrQkFBa0IsRUFBRTtnQkFDbEIsS0FBSyxFQUFFO29CQUNMLFFBQVEsRUFBRSxJQUFJO29CQUNkLE9BQU8sRUFBRSxJQUFJO2lCQUNkO2dCQUNELFNBQVMsRUFBRTtvQkFDVCxRQUFRLEVBQUUsS0FBSztvQkFDZixPQUFPLEVBQUUsSUFBSTtpQkFDZDtnQkFDRCxVQUFVLEVBQUU7b0JBQ1YsUUFBUSxFQUFFLEtBQUs7b0JBQ2YsT0FBTyxFQUFFLElBQUk7aUJBQ2Q7Z0JBQ0QsU0FBUyxFQUFFO29CQUNULFFB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QzlFLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxnQkFBZ0I7WUFDdkMsQ0FBQyxDQUFDLFdBQVcsSUFBSSxDQUFDLGdCQUFnQixFQUFFO1lBQ3BDLENBQUMsQ0FBQyxXQUFXLEtBQUssQ0FBQyxZQUFZLFNBQVMsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxvQkFBb0IsQ0FBQztRQUV4RixJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLG9CQUFvQixFQUFFO1lBQzVDLEtBQUssRUFBRSxXQUFXO1lBQ2xCLFdBQVcsRUFBRSw0QkFBNEI7U0FDMUMsQ0FBQyxDQUFDO1FBRUgscUNBQXFDO1FBQ3JDLElBQUksSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7WUFDMUIsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxxQkFBcUIsRUFBRTtnQkFDN0MsS0FBSyxFQUFFLElBQUksQ0FBQyxnQkFBZ0I7Z0JBQzVCLFdBQVcsRUFBRSx1QkFBdUI7YUFDckMsQ0FBQyxDQUFDO1FBQ0wsQ0FBQztRQUVELElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsZ0JBQWdCLEVBQUU7WUFDeEMsS0FBSyxFQUFFLE9BQU87WUFDZCxXQUFXLEVBQUUsMEJBQTBCO1NBQ3hDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsc0JBQXNCLEVBQUU7WUFDOUMsS0FBSyxFQUFFLG1IQUFtSCxLQUFLLENBQUMsV0FBVyx3QkFBd0IsS0FBSyxDQUFDLFdBQVcsRUFBRTtZQUN0TCxXQUFXLEVBQUUsNEJBQTRCO1NBQzFDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQW5ORCxvREFtTkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBjb2duaXRvIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jb2duaXRvJztcbmltcG9ydCAqIGFzIHNlY3JldHNtYW5hZ2VyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zZWNyZXRzbWFuYWdlcic7XG5pbXBvcnQgKiBhcyBhY20gZnJvbSAnYXdzLWNkay1saWIvYXdzLWNlcnRpZmljYXRlbWFuYWdlcic7XG5pbXBvcnQgKiBhcyByb3V0ZTUzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1yb3V0ZTUzJztcblxuZXhwb3J0IGludGVyZmFjZSBDb2duaXRvQXV0aENvbnN0cnVjdFByb3BzIHtcbiAgZW52aXJvbm1lbnQ6ICdkZXYnIHwgJ3Byb2QnO1xuICBkb21haW5QcmVmaXg6IHN0cmluZztcbiAgY2FsbGJhY2tVcmxzOiBzdHJpbmdbXTtcbiAgbG9nb3V0VXJsczogc3RyaW5nW107XG4gIGN1c3RvbURvbWFpbj86IHtcbiAgICBkb21haW5OYW1lOiBzdHJpbmc7IC8vIGUuZy4sIGF1dGguYXVyYTI4LmNvbVxuICAgIGhvc3RlZFpvbmU6IHJvdXRlNTMuSUhvc3RlZFpvbmU7XG4gIH07XG59XG5cbmV4cG9ydCBjbGFzcyBDb2duaXRvQXV0aENvbnN0cnVjdCBleHRlbmRzIENvbnN0cnVjdCB7XG4gIHB1YmxpYyByZWFkb25seSB1c2VyUG9vbDogY29nbml0by5Vc2VyUG9vbDtcbiAgcHVibGljIHJlYWRvbmx5IHVzZXJQb29sQ2xpZW50OiBjb2duaXRvLlVzZXJQb29sQ2xpZW50O1xuICBwdWJsaWMgcmVhZG9ubHkgdXNlclBvb2xEb21haW46IGNvZ25pdG8uVXNlclBvb2xEb21haW47XG4gIHB1YmxpYyByZWFkb25seSBjdXN0b21Eb21haW5DZXJ0aWZpY2F0ZT86IGFjbS5DZXJ0aWZpY2F0ZTtcbiAgcHVibGljIHJlYWRvbmx5IGN1c3RvbURvbWFpbk5hbWU/OiBzdHJpbmc7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IENvZ25pdG9BdXRoQ29uc3RydWN0UHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgLy8gQ3JlYXRlIFVzZXIgUG9vbFxuICAgIHRoaXMudXNlclBvb2wgPSBuZXcgY29nbml0by5Vc2VyUG9vbCh0aGlzLCAnVXNlclBvb2wnLCB7XG4gICAgICB1c2VyUG9vbE5hbWU6IGBhdXJhMjgtJHtwcm9wcy5lbnZpcm9ubWVudH0tdXNlci1wb29sYCxcbiAgICAgIHNlbGZTaWduVXBFbmFibGVkOiB0cnVlLFxuICAgICAgc2lnbkluQWxpYXNlczoge1xuICAgICAgICBlbWFpbDogdHJ1ZSxcbiAgICAgICAgdXNlcm5hbWU6IGZhbHNlLFxuICAgICAgfSxcbiAgICAgIGF1dG9WZXJpZnk6IHtcbiAgICAgICAgZW1haWw6IHRydWUsXG4gICAgICB9LFxuICAgICAgc3RhbmRhcmRBdHRyaWJ1dGVzOiB7XG4gICAgICAgIGVtYWlsOiB7XG4gICAgICAgICAgcmVxdWlyZWQ6IHRydWUsXG4gICAgICAgICAgbXV0YWJsZTogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgICAgZ2l2ZW5OYW1lOiB7XG4gICAgICAgICAgcmVxdWlyZWQ6IGZhbHNlLFxuICAgICAgICAgIG11dGFibGU6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIGZhbWlseU5hbWU6IHtcbiAgICAgICAgICByZXF1aXJlZDogZmFsc2UsXG4gICAgICAgICAgbXV0YWJsZTogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgICAgYmlydGhkYXRlOiB7XG4gICAgICAgICAgcmVxdWlyZWQ6IGZhbHNlLFxuICAgICAgICAgIG11dGFibGU6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgcGFzc3dvcmRQb2xpY3k6IHtcbiAgICAgICAgbWluTGVuZ3RoOiA4LFxuICAgICAgICByZXF1aXJlTG93ZXJjYXNlOiB0cnVlLFxuICAgICAgICByZXF1aXJlVXBwZXJjYXNlOiB0cnVlLFxuICAgICAgICByZXF1aXJlRGlnaXRzOiB0cnVlLFxuICAgICAgICByZXF1aXJlU3ltYm9sczogZmFsc2UsXG4gICAgICB9LFxuICAgICAgYWNjb3VudFJlY292ZXJ5OiBjb2duaXRvLkFjY291bnRSZWNvdmVyeS5FTUFJTF9PTkxZLFxuICAgICAgcmVtb3ZhbFBvbGljeTpcbiAgICAgICAgcHJvcHMuZW52aXJvbm1lbnQgPT09ICdkZXYnID8gY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSA6IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTixcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBBZG1pbiBHcm91cFxuICAgIHRoaXMudXNlclBvb2wuYWRkR3JvdXAoJ0FkbWluR3JvdXAnLCB7XG4gICAgICBncm91cE5hbWU6ICdhZG1pbicsXG4gICAgICBkZXNjcmlwdGlvbjogJ0FkbWluaXN0cmF0b3IgdXNlcnMgd2l0aCBlbGV2YXRlZCBwcml2aWxlZ2VzJyxcbiAgICAgIHByZWNlZGVuY2U6IDEsIC8vIEhpZ2hlc3QgcHJpb3JpdHlcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBjZXJ0aWZpY2F0ZSBmb3IgY3VzdG9tIGRvbWFpbiBpZiBuZWVkZWQgKG9ubHkgZm9yIHByb2R1Y3Rpb24pXG4gICAgaWYgKHByb3BzLmN1c3RvbURvbWFpbiAmJiBwcm9wcy5lbnZpcm9ubWVudCA9PT0gJ3Byb2QnKSB7XG4gICAgICAvLyBDZXJ0aWZpY2F0ZSBtdXN0IGJlIGluIHVzLWVhc3QtMSBmb3IgQ29nbml0byBjdXN0b20gZG9tYWluc1xuICAgICAgdGhpcy5jdXN0b21Eb21haW5DZXJ0aWZpY2F0ZSA9IG5ldyBhY20uQ2VydGlmaWNhdGUodGhpcywgJ0N1c3RvbURvbWFpbkNlcnRpZmljYXRlJywge1xuICAgICAgICBkb21haW5OYW1lOiBwcm9wcy5jdXN0b21Eb21haW4uZG9tYWluTmFtZSxcbiAgICAgICAgdmFsaWRhdGlvbjogYWNtLkNlcnRpZmljYXRlVmFsaWRhdGlvbi5mcm9tRG5zKHByb3BzLmN1c3RvbURvbWFpbi5ob3N0ZWRab25lKSxcbiAgICAgIH0pO1xuICAgICAgdGhpcy5jdXN0b21Eb21haW5OYW1lID0gcHJvcHMuY3VzdG9tRG9tYWluLmRvbWFpbk5hbWU7XG4gICAgfVxuXG4gICAgLy8gQ3JlYXRlIFVzZXIgUG9vbCBEb21haW5cbiAgICBpZiAodGhpcy5jdXN0b21Eb21haW5DZXJ0aWZpY2F0ZSAmJiB0aGlzLmN1c3RvbURvbWFpbk5hbWUpIHtcbiAgICAgIC8vIFByb2R1Y3Rpb24gd2l0aCBjdXN0b20gZG9tYWluXG4gICAgICB0aGlzLnVzZXJQb29sRG9tYWluID0gbmV3IGNvZ25pdG8uVXNlclBvb2xEb21haW4odGhpcywgJ1VzZXJQb29sRG9tYWluJywge1xuICAgICAgICB1c2VyUG9vbDogdGhpcy51c2VyUG9vbCxcbiAgICAgICAgY3VzdG9tRG9tYWluOiB7XG4gICAgICAgICAgZG9tYWluTmFtZTogdGhpcy5jdXN0b21Eb21haW5OYW1lLFxuICAgICAgICAgIGNlcnRpZmljYXRlOiB0aGlzLmN1c3RvbURvbWFpbkNlcnRpZmljYXRlLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIERldiBlbnZpcm9ubWVudCBvciBwcm9kdWN0aW9uIHdpdGhvdXQgY3VzdG9tIGRvbWFpbiAoZmFsbGJhY2spXG4gICAgICB0aGlzLnVzZXJQb29sRG9tYWluID0gbmV3IGNvZ25pdG8uVXNlclBvb2xEb21haW4odGhpcywgJ1VzZXJQb29sRG9tYWluJywge1xuICAgICAgICB1c2VyUG9vbDogdGhpcy51c2VyUG9vbCxcbiAgICAgICAgY29nbml0b0RvbWFpbjoge1xuICAgICAgICAgIGRvbWFpblByZWZpeDogcHJvcHMuZG9tYWluUHJlZml4LFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gUmVmZXJlbmNlIHRoZSBleGlzdGluZyBHb29nbGUgT0F1dGggc2VjcmV0IGZyb20gU2VjcmV0cyBNYW5hZ2VyXG4gICAgLy8gVGhpcyBzZWNyZXQgc2hvdWxkIGJlIG1hbnVhbGx5IGNyZWF0ZWQgd2l0aCByZWFsIEdvb2dsZSBPQXV0aCBjcmVkZW50aWFsc1xuICAgIGNvbnN0IGdvb2dsZVNlY3JldCA9IHNlY3JldHNtYW5hZ2VyLlNlY3JldC5mcm9tU2VjcmV0TmFtZVYyKFxuICAgICAgdGhpcyxcbiAgICAgICdHb29nbGVPQXV0aFNlY3JldCcsXG4gICAgICBgYXVyYTI4L29hdXRoL2dvb2dsZS8ke3Byb3BzLmVudmlyb25tZW50fWAsXG4gICAgKTtcblxuICAgIC8vIENyZWF0ZSBHb29nbGUgaWRlbnRpdHkgcHJvdmlkZXIgdXNpbmcgY3JlZGVudGlhbHMgZnJvbSBTZWNyZXRzIE1hbmFnZXJcbiAgICBjb25zdCBnb29nbGVQcm92aWRlciA9IG5ldyBjb2duaXRvLlVzZXJQb29sSWRlbnRpdHlQcm92aWRlckdvb2dsZSh0aGlzLCAnR29vZ2xlUHJvdmlkZXInLCB7XG4gICAgICBjbGllbnRJZDogZ29vZ2xlU2VjcmV0LnNlY3JldFZhbHVlRnJvbUpzb24oJ2NsaWVudF9pZCcpLnVuc2FmZVVud3JhcCgpLFxuICAgICAgY2xpZW50U2VjcmV0VmFsdWU6IGdvb2dsZVNlY3JldC5zZWNyZXRWYWx1ZUZyb21Kc29uKCdjbGllbnRfc2VjcmV0JyksXG4gICAgICB1c2VyUG9vbDogdGhpcy51c2VyUG9vbCxcbiAgICAgIGF0dHJpYnV0ZU1hcHBpbmc6IHtcbiAgICAgICAgZW1haWw6IGNvZ25pdG8uUHJvdmlkZXJBdHRyaWJ1dGUuR09PR0xFX0VNQUlMLFxuICAgICAgICBnaXZlbk5hbWU6IGNvZ25pdG8uUHJvdmlkZXJBdHRyaWJ1dGUuR09PR0xFX0dJVkVOX05BTUUsXG4gICAgICAgIGZhbWlseU5hbWU6IGNvZ25pdG8uUHJvdmlkZXJBdHRyaWJ1dGUuR09PR0xFX0ZBTUlMWV9OQU1FLFxuICAgICAgfSxcbiAgICAgIHNjb3BlczogWydwcm9maWxlJywgJ2VtYWlsJywgJ29wZW5pZCddLFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIFVzZXIgUG9vbCBDbGllbnRcbiAgICB0aGlzLnVzZXJQb29sQ2xpZW50ID0gbmV3IGNvZ25pdG8uVXNlclBvb2xDbGllbnQodGhpcywgJ1VzZXJQb29sQ2xpZW50Jywge1xuICAgICAgdXNlclBvb2w6IHRoaXMudXNlclBvb2wsXG4gICAgICB1c2VyUG9vbENsaWVudE5hbWU6IGBhdXJhMjgtJHtwcm9wcy5lbnZpcm9ubWVudH0tY2xpZW50YCxcbiAgICAgIGdlbmVyYXRlU2VjcmV0OiBmYWxzZSxcbiAgICAgIGF1dGhGbG93czoge1xuICAgICAgICB1c2VyUGFzc3dvcmQ6IHRydWUsXG4gICAgICAgIHVzZXJTcnA6IHRydWUsXG4gICAgICB9LFxuICAgICAgb0F1dGg6IHtcbiAgICAgICAgZmxvd3M6IHtcbiAgICAgICAgICBhdXRob3JpemF0aW9uQ29kZUdyYW50OiB0cnVlLFxuICAgICAgICAgIGltcGxpY2l0Q29kZUdyYW50OiBmYWxzZSxcbiAgICAgICAgfSxcbiAgICAgICAgc2NvcGVzOiBbXG4gICAgICAgICAgY29nbml0by5PQXV0aFNjb3BlLkVNQUlMLFxuICAgICAgICAgIGNvZ25pdG8uT0F1dGhTY29wZS5PUEVOSUQsXG4gICAgICAgICAgY29nbml0by5PQXV0aFNjb3BlLlBST0ZJTEUsXG4gICAgICAgICAgY29nbml0by5PQXV0aFNjb3BlLkNPR05JVE9fQURNSU4sXG4gICAgICAgIF0sXG4gICAgICAgIGNhbGxiYWNrVXJsczogcHJvcHMuY2FsbGJhY2tVcmxzLFxuICAgICAgICBsb2dvdXRVcmxzOiBwcm9wcy5sb2dvdXRVcmxzLFxuICAgICAgfSxcbiAgICAgIHByZXZlbnRVc2VyRXhpc3RlbmNlRXJyb3JzOiB0cnVlLFxuICAgICAgc3VwcG9ydGVkSWRlbnRpdHlQcm92aWRlcnM6IFtcbiAgICAgICAgY29nbml0by5Vc2VyUG9vbENsaWVudElkZW50aXR5UHJvdmlkZXIuQ09HTklUTyxcbiAgICAgICAgY29nbml0by5Vc2VyUG9vbENsaWVudElkZW50aXR5UHJvdmlkZXIuR09PR0xFLFxuICAgICAgXSxcbiAgICAgIHJlYWRBdHRyaWJ1dGVzOiBuZXcgY29nbml0by5DbGllbnRBdHRyaWJ1dGVzKClcbiAgICAgICAgLndpdGhTdGFuZGFyZEF0dHJpYnV0ZXMoe1xuICAgICAgICAgIGVtYWlsOiB0cnVlLFxuICAgICAgICAgIGVtYWlsVmVyaWZpZWQ6IHRydWUsXG4gICAgICAgICAgZ2l2ZW5OYW1lOiB0cnVlLFxuICAgICAgICAgIGZhbWlseU5hbWU6IHRydWUsXG4gICAgICAgICAgYmlydGhkYXRlOiB0cnVlLFxuICAgICAgICB9KVxuICAgICAgICAud2l0aEN1c3RvbUF0dHJpYnV0ZXMoKSxcbiAgICAgIHdyaXRlQXR0cmlidXRlczogbmV3IGNvZ25pdG8uQ2xpZW50QXR0cmlidXRlcygpXG4gICAgICAgIC53aXRoU3RhbmRhcmRBdHRyaWJ1dGVzKHtcbiAgICAgICAgICBlbWFpbDogdHJ1ZSxcbiAgICAgICAgICBnaXZlbk5hbWU6IHRydWUsXG4gICAgICAgICAgZmFtaWx5TmFtZTogdHJ1ZSxcbiAgICAgICAgICBiaXJ0aGRhdGU6IHRydWUsXG4gICAgICAgIH0pXG4gICAgICAgIC53aXRoQ3VzdG9tQXR0cmlidXRlcygpLFxuICAgIH0pO1xuXG4gICAgLy8gRW5zdXJlIHByb3BlciBkZXBlbmRlbmN5IC0gY2xpZW50IGRlcGVuZHMgb24gcHJvdmlkZXJcbiAgICB0aGlzLnVzZXJQb29sQ2xpZW50Lm5vZGUuYWRkRGVwZW5kZW5jeShnb29nbGVQcm92aWRlcik7XG5cbiAgICAvLyBOb3RlOiBGYWNlYm9vayBPQXV0aCBjYW4gYmUgYWRkZWQgbGF0ZXIgYnkgY3JlYXRpbmcgYSBzZWNyZXQgaW4gU2VjcmV0cyBNYW5hZ2VyXG4gICAgLy8gd2l0aCB0aGUgbmFtZTogYXVyYTI4L29hdXRoL2ZhY2Vib29rLyR7ZW52aXJvbm1lbnR9XG4gICAgLy8gY29udGFpbmluZzogeyBcImFwcF9pZFwiOiBcIi4uLlwiLCBcImFwcF9zZWNyZXRcIjogXCIuLi5cIiB9XG5cbiAgICAvLyBOb3RlOiBBcHBsZSBPQXV0aCBjYW4gYmUgYWRkZWQgbGF0ZXIgYnkgY3JlYXRpbmcgYSBzZWNyZXQgaW4gU2VjcmV0cyBNYW5hZ2VyXG4gICAgLy8gd2l0aCB0aGUgbmFtZTogYXVyYTI4L29hdXRoL2FwcGxlLyR7ZW52aXJvbm1lbnR9XG4gICAgLy8gY29udGFpbmluZzogeyBcInNlcnZpY2VzX2lkXCI6IFwiLi4uXCIsIFwidGVhbV9pZFwiOiBcIi4uLlwiLCBcImtleV9pZFwiOiBcIi4uLlwiLCBcInByaXZhdGVfa2V5XCI6IFwiLi4uXCIgfVxuXG4gICAgLy8gT3V0cHV0IHZhbHVlc1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdVc2VyUG9vbElkJywge1xuICAgICAgdmFsdWU6IHRoaXMudXNlclBvb2wudXNlclBvb2xJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29nbml0byBVc2VyIFBvb2wgSUQnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1VzZXJQb29sQ2xpZW50SWQnLCB7XG4gICAgICB2YWx1ZTogdGhpcy51c2VyUG9vbENsaWVudC51c2VyUG9vbENsaWVudElkLFxuICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIFVzZXIgUG9vbCBDbGllbnQgSUQnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0NvZ25pdG9Eb21haW5QcmVmaXgnLCB7XG4gICAgICB2YWx1ZTogcHJvcHMuZG9tYWluUHJlZml4LFxuICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIERvbWFpbiBQcmVmaXgnLFxuICAgIH0pO1xuXG4gICAgLy8gT3V0cHV0IHRoZSBhcHByb3ByaWF0ZSBob3N0ZWQgVUkgVVJMIGJhc2VkIG9uIHdoZXRoZXIgY3VzdG9tIGRvbWFpbiBpcyB1c2VkXG4gICAgY29uc3QgaG9zdGVkVUlVcmwgPSB0aGlzLmN1c3RvbURvbWFpbk5hbWVcbiAgICAgID8gYGh0dHBzOi8vJHt0aGlzLmN1c3RvbURvbWFpbk5hbWV9YFxuICAgICAgOiBgaHR0cHM6Ly8ke3Byb3BzLmRvbWFpblByZWZpeH0uYXV0aC4ke2Nkay5TdGFjay5vZih0aGlzKS5yZWdpb259LmFtYXpvbmNvZ25pdG8uY29tYDtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdDb2duaXRvSG9zdGVkVUlVUkwnLCB7XG4gICAgICB2YWx1ZTogaG9zdGVkVUlVcmwsXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gSG9zdGVkIFVJIEJhc2UgVVJMJyxcbiAgICB9KTtcblxuICAgIC8vIE91dHB1dCBjdXN0b20gZG9tYWluIGlmIGNvbmZpZ3VyZWRcbiAgICBpZiAodGhpcy5jdXN0b21Eb21haW5OYW1lKSB7XG4gICAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQ29nbml0b0N1c3RvbURvbWFpbicsIHtcbiAgICAgICAgdmFsdWU6IHRoaXMuY3VzdG9tRG9tYWluTmFtZSxcbiAgICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIEN1c3RvbSBEb21haW4nLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FkbWluR3JvdXBOYW1lJywge1xuICAgICAgdmFsdWU6ICdhZG1pbicsXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gQWRtaW4gR3JvdXAgTmFtZScsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnT0F1dGhTZWNyZXRzUmVtaW5kZXInLCB7XG4gICAgICB2YWx1ZTogYEdvb2dsZSBPQXV0aCBpcyBjb25maWd1cmVkLiBUbyBhZGQgbW9yZSBwcm92aWRlcnMsIGNyZWF0ZSBzZWNyZXRzIGluIEFXUyBTZWNyZXRzIE1hbmFnZXI6IGF1cmEyOC9vYXV0aC9mYWNlYm9vay8ke3Byb3BzLmVudmlyb25tZW50fSwgYXVyYTI4L29hdXRoL2FwcGxlLyR7cHJvcHMuZW52aXJvbm1lbnR9YCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnT0F1dGggQ29uZmlndXJhdGlvbiBTdGF0dXMnLFxuICAgIH0pO1xuICB9XG59XG4iXX0=