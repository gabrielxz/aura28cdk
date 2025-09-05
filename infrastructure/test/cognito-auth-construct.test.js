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
const cdk = __importStar(require("aws-cdk-lib"));
const assertions_1 = require("aws-cdk-lib/assertions");
const route53 = __importStar(require("aws-cdk-lib/aws-route53"));
const cognito_auth_construct_1 = require("../lib/constructs/cognito-auth-construct");
describe('CognitoAuthConstruct', () => {
    let app;
    let stack;
    let template;
    beforeEach(() => {
        app = new cdk.App();
        stack = new cdk.Stack(app, 'TestStack', {
            env: { account: '123456789012', region: 'us-east-1' },
        });
    });
    describe('Development Environment', () => {
        beforeEach(() => {
            new cognito_auth_construct_1.CognitoAuthConstruct(stack, 'TestAuth', {
                environment: 'dev',
                domainPrefix: 'aura28-dev',
                callbackUrls: [
                    'http://localhost:3000/auth/callback',
                    'https://dev.aura28.com/auth/callback',
                ],
                logoutUrls: ['http://localhost:3000', 'https://dev.aura28.com'],
            });
            template = assertions_1.Template.fromStack(stack);
        });
        test('creates a Cognito User Pool', () => {
            template.hasResourceProperties('AWS::Cognito::UserPool', {
                UserPoolName: 'aura28-dev-user-pool',
                Policies: {
                    PasswordPolicy: {
                        MinimumLength: 8,
                        RequireLowercase: true,
                        RequireUppercase: true,
                        RequireNumbers: true,
                        RequireSymbols: false,
                    },
                },
                Schema: assertions_1.Match.arrayWith([
                    assertions_1.Match.objectLike({
                        Name: 'email',
                        Required: true,
                        Mutable: true,
                    }),
                    assertions_1.Match.objectLike({
                        Name: 'birthdate',
                        Required: false,
                        Mutable: true,
                    }),
                ]),
            });
        });
        test('creates a Cognito User Pool Domain', () => {
            template.hasResourceProperties('AWS::Cognito::UserPoolDomain', {
                Domain: 'aura28-dev',
            });
        });
        test('creates a Cognito User Pool Client', () => {
            template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
                ClientName: 'aura28-dev-client',
                GenerateSecret: false,
                ExplicitAuthFlows: assertions_1.Match.arrayWith(['ALLOW_USER_PASSWORD_AUTH', 'ALLOW_USER_SRP_AUTH']),
                AllowedOAuthFlows: ['code'],
                AllowedOAuthScopes: ['email', 'openid', 'profile', 'aws.cognito.signin.user.admin'],
                CallbackURLs: [
                    'http://localhost:3000/auth/callback',
                    'https://dev.aura28.com/auth/callback',
                ],
                LogoutURLs: ['http://localhost:3000', 'https://dev.aura28.com'],
                SupportedIdentityProviders: ['COGNITO', 'Google'],
            });
        });
        test('creates admin group in user pool', () => {
            template.hasResourceProperties('AWS::Cognito::UserPoolGroup', {
                GroupName: 'admin',
                Description: 'Administrator users with elevated privileges',
                Precedence: 1,
            });
        });
        test('creates Google identity provider with proper configuration', () => {
            // Check that Google identity provider is created
            template.hasResourceProperties('AWS::Cognito::UserPoolIdentityProvider', {
                ProviderType: 'Google',
                AttributeMapping: {
                    email: 'email',
                    given_name: 'given_name',
                    family_name: 'family_name',
                },
            });
        });
        test('creates CloudFormation outputs', () => {
            // Outputs are created at the construct level with CDK hashes
            const outputs = template.findOutputs('*');
            const outputKeys = Object.keys(outputs);
            // Check that outputs with the correct prefix exist
            expect(outputKeys.some((key) => key.startsWith('TestAuthUserPoolId'))).toBe(true);
            expect(outputKeys.some((key) => key.startsWith('TestAuthUserPoolClientId'))).toBe(true);
            expect(outputKeys.some((key) => key.startsWith('TestAuthCognitoDomainPrefix'))).toBe(true);
            expect(outputKeys.some((key) => key.startsWith('TestAuthCognitoHostedUIURL'))).toBe(true);
            expect(outputKeys.some((key) => key.startsWith('TestAuthAdminGroupName'))).toBe(true);
            expect(outputKeys.some((key) => key.startsWith('TestAuthOAuthSecretsReminder'))).toBe(true);
        });
        test('does not create custom domain certificate for dev environment', () => {
            // Should not have any ACM certificates for dev environment
            const certificates = template.findResources('AWS::CertificateManager::Certificate');
            expect(Object.keys(certificates)).toHaveLength(0);
        });
        test('uses default Cognito domain for dev environment', () => {
            // Should use CognitoDomain property, not CustomDomain
            template.hasResourceProperties('AWS::Cognito::UserPoolDomain', {
                Domain: 'aura28-dev',
            });
            // Should not have CustomDomain property
            const domains = template.findResources('AWS::Cognito::UserPoolDomain');
            const domainKey = Object.keys(domains)[0];
            expect(domains[domainKey].Properties.CustomDomain).toBeUndefined();
        });
        test('outputs default Cognito hosted UI URL for dev environment', () => {
            const outputs = template.findOutputs('*');
            const hostedUIOutput = Object.keys(outputs).find((key) => key.startsWith('TestAuthCognitoHostedUIURL'));
            expect(outputs[hostedUIOutput].Value).toContain('aura28-dev.auth.us-east-1.amazoncognito.com');
        });
    });
    describe('Development Environment with Custom Domain (should be ignored)', () => {
        beforeEach(() => {
            const hostedZone = route53.HostedZone.fromHostedZoneAttributes(stack, 'TestZone', {
                hostedZoneId: 'Z123456789ABC',
                zoneName: 'aura28.com',
            });
            new cognito_auth_construct_1.CognitoAuthConstruct(stack, 'TestAuth', {
                environment: 'dev',
                domainPrefix: 'aura28-dev',
                callbackUrls: [
                    'http://localhost:3000/auth/callback',
                    'https://dev.aura28.com/auth/callback',
                ],
                logoutUrls: ['http://localhost:3000', 'https://dev.aura28.com'],
                customDomain: {
                    domainName: 'auth.aura28.com',
                    hostedZone: hostedZone,
                },
            });
            template = assertions_1.Template.fromStack(stack);
        });
        test('ignores custom domain configuration for dev environment', () => {
            // Should not create certificate even when custom domain is provided
            const certificates = template.findResources('AWS::CertificateManager::Certificate');
            expect(Object.keys(certificates)).toHaveLength(0);
        });
        test('still uses default Cognito domain despite custom domain config', () => {
            // Should use CognitoDomain property, not CustomDomain
            template.hasResourceProperties('AWS::Cognito::UserPoolDomain', {
                Domain: 'aura28-dev',
            });
            // Should not have CustomDomain property
            const domains = template.findResources('AWS::Cognito::UserPoolDomain');
            const domainKey = Object.keys(domains)[0];
            expect(domains[domainKey].Properties.CustomDomain).toBeUndefined();
        });
    });
    describe('Production Environment without Custom Domain', () => {
        beforeEach(() => {
            new cognito_auth_construct_1.CognitoAuthConstruct(stack, 'TestAuth', {
                environment: 'prod',
                domainPrefix: 'aura28-prod',
                callbackUrls: ['https://aura28.com/auth/callback'],
                logoutUrls: ['https://aura28.com'],
            });
            template = assertions_1.Template.fromStack(stack);
        });
        test('creates a User Pool with production settings', () => {
            template.hasResourceProperties('AWS::Cognito::UserPool', {
                UserPoolName: 'aura28-prod-user-pool',
            });
        });
        test('creates admin group in user pool', () => {
            template.hasResourceProperties('AWS::Cognito::UserPoolGroup', {
                GroupName: 'admin',
                Description: 'Administrator users with elevated privileges',
                Precedence: 1,
            });
        });
        test('sets RETAIN deletion policy for production', () => {
            const userPool = template.findResources('AWS::Cognito::UserPool');
            const userPoolKey = Object.keys(userPool)[0];
            expect(userPool[userPoolKey].DeletionPolicy).toBe('Retain');
        });
        test('uses default Cognito domain when custom domain not provided', () => {
            template.hasResourceProperties('AWS::Cognito::UserPoolDomain', {
                Domain: 'aura28-prod',
            });
        });
        test('does not create certificate when custom domain not provided', () => {
            const certificates = template.findResources('AWS::CertificateManager::Certificate');
            expect(Object.keys(certificates)).toHaveLength(0);
        });
    });
    describe('Production Environment with Custom Domain', () => {
        let authConstruct;
        beforeEach(() => {
            const hostedZone = route53.HostedZone.fromHostedZoneAttributes(stack, 'TestZone', {
                hostedZoneId: 'Z123456789ABC',
                zoneName: 'aura28.com',
            });
            authConstruct = new cognito_auth_construct_1.CognitoAuthConstruct(stack, 'TestAuth', {
                environment: 'prod',
                domainPrefix: 'aura28-prod',
                callbackUrls: ['https://aura28.com/auth/callback'],
                logoutUrls: ['https://aura28.com'],
                customDomain: {
                    domainName: 'auth.aura28.com',
                    hostedZone: hostedZone,
                },
            });
            template = assertions_1.Template.fromStack(stack);
        });
        test('creates ACM certificate for custom domain', () => {
            template.hasResourceProperties('AWS::CertificateManager::Certificate', {
                DomainName: 'auth.aura28.com',
                DomainValidationOptions: [
                    {
                        DomainName: 'auth.aura28.com',
                        HostedZoneId: 'Z123456789ABC',
                    },
                ],
                ValidationMethod: 'DNS',
            });
        });
        test('creates User Pool Domain with custom domain configuration', () => {
            const domains = template.findResources('AWS::Cognito::UserPoolDomain');
            const domainKey = Object.keys(domains)[0];
            // CDK represents custom domain as CustomDomainConfig in the CloudFormation template
            expect(domains[domainKey].Properties.Domain).toBe('auth.aura28.com');
            expect(domains[domainKey].Properties.CustomDomainConfig).toBeDefined();
            expect(domains[domainKey].Properties.CustomDomainConfig.CertificateArn).toBeDefined();
        });
        test('sets customDomainName and customDomainCertificate properties', () => {
            expect(authConstruct.customDomainName).toBe('auth.aura28.com');
            expect(authConstruct.customDomainCertificate).toBeDefined();
        });
        test('outputs custom domain URL in CloudFormation', () => {
            const outputs = template.findOutputs('*');
            const hostedUIOutput = Object.keys(outputs).find((key) => key.startsWith('TestAuthCognitoHostedUIURL'));
            expect(outputs[hostedUIOutput].Value).toBe('https://auth.aura28.com');
        });
        test('outputs custom domain name separately', () => {
            const outputs = template.findOutputs('*');
            const customDomainOutput = Object.keys(outputs).find((key) => key.startsWith('TestAuthCognitoCustomDomain'));
            expect(outputs[customDomainOutput].Value).toBe('auth.aura28.com');
        });
        test('creates User Pool with production settings', () => {
            template.hasResourceProperties('AWS::Cognito::UserPool', {
                UserPoolName: 'aura28-prod-user-pool',
            });
        });
        test('sets RETAIN deletion policy for production', () => {
            const userPool = template.findResources('AWS::Cognito::UserPool');
            const userPoolKey = Object.keys(userPool)[0];
            expect(userPool[userPoolKey].DeletionPolicy).toBe('Retain');
        });
    });
    describe('Edge Cases', () => {
        test('creates certificate even with undefined hosted zone (CDK will fail at synthesis)', () => {
            // When hostedZone is undefined, CDK still attempts to create the certificate
            // This will fail at synthesis time in real deployment, but in tests we can verify the behavior
            new cognito_auth_construct_1.CognitoAuthConstruct(stack, 'TestAuth', {
                environment: 'prod',
                domainPrefix: 'aura28-prod',
                callbackUrls: ['https://aura28.com/auth/callback'],
                logoutUrls: ['https://aura28.com'],
                customDomain: {
                    domainName: 'auth.aura28.com',
                    hostedZone: undefined,
                },
            });
            // The construct will still create custom domain resources
            // but synthesis will fail without a valid hostedZone
            const template = assertions_1.Template.fromStack(stack);
            // Should create certificate (even though it won't work without hostedZone)
            const certificates = template.findResources('AWS::CertificateManager::Certificate');
            expect(Object.keys(certificates)).toHaveLength(1);
            // Should create custom domain
            template.hasResourceProperties('AWS::Cognito::UserPoolDomain', {
                Domain: 'auth.aura28.com',
            });
        });
        test('handles empty domain name', () => {
            const hostedZone = route53.HostedZone.fromHostedZoneAttributes(stack, 'TestZone', {
                hostedZoneId: 'Z123456789ABC',
                zoneName: 'aura28.com',
            });
            new cognito_auth_construct_1.CognitoAuthConstruct(stack, 'TestAuth', {
                environment: 'prod',
                domainPrefix: 'aura28-prod',
                callbackUrls: ['https://aura28.com/auth/callback'],
                logoutUrls: ['https://aura28.com'],
                customDomain: {
                    domainName: '',
                    hostedZone: hostedZone,
                },
            });
            // Should fall back to default domain when domain name is empty
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties('AWS::Cognito::UserPoolDomain', {
                Domain: 'aura28-prod',
            });
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29nbml0by1hdXRoLWNvbnN0cnVjdC50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY29nbml0by1hdXRoLWNvbnN0cnVjdC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMsdURBQXlEO0FBQ3pELGlFQUFtRDtBQUNuRCxxRkFBZ0Y7QUFFaEYsUUFBUSxDQUFDLHNCQUFzQixFQUFFLEdBQUcsRUFBRTtJQUNwQyxJQUFJLEdBQVksQ0FBQztJQUNqQixJQUFJLEtBQWdCLENBQUM7SUFDckIsSUFBSSxRQUFrQixDQUFDO0lBRXZCLFVBQVUsQ0FBQyxHQUFHLEVBQUU7UUFDZCxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDcEIsS0FBSyxHQUFHLElBQUksR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsV0FBVyxFQUFFO1lBQ3RDLEdBQUcsRUFBRSxFQUFFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxFQUFFLFdBQVcsRUFBRTtTQUN0RCxDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztJQUVILFFBQVEsQ0FBQyx5QkFBeUIsRUFBRSxHQUFHLEVBQUU7UUFDdkMsVUFBVSxDQUFDLEdBQUcsRUFBRTtZQUNkLElBQUksNkNBQW9CLENBQUMsS0FBSyxFQUFFLFVBQVUsRUFBRTtnQkFDMUMsV0FBVyxFQUFFLEtBQUs7Z0JBQ2xCLFlBQVksRUFBRSxZQUFZO2dCQUMxQixZQUFZLEVBQUU7b0JBQ1oscUNBQXFDO29CQUNyQyxzQ0FBc0M7aUJBQ3ZDO2dCQUNELFVBQVUsRUFBRSxDQUFDLHVCQUF1QixFQUFFLHdCQUF3QixDQUFDO2FBQ2hFLENBQUMsQ0FBQztZQUNILFFBQVEsR0FBRyxxQkFBUSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN2QyxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyw2QkFBNkIs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QixFQUFFO2dCQUM3RCxNQUFNLEVBQUUsaUJBQWlCO2FBQzFCLENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLDJCQUEyQixFQUFFLEdBQUcsRUFBRTtZQUNyQyxNQUFNLFVBQVUsR0FBRyxPQUFPLENBQUMsVUFBVSxDQUFDLHdCQUF3QixDQUFDLEtBQUssRUFBRSxVQUFVLEVBQUU7Z0JBQ2hGLFlBQVksRUFBRSxlQUFlO2dCQUM3QixRQUFRLEVBQUUsWUFBWTthQUN2QixDQUFDLENBQUM7WUFFSCxJQUFJLDZDQUFvQixDQUFDLEtBQUssRUFBRSxVQUFVLEVBQUU7Z0JBQzFDLFdBQVcsRUFBRSxNQUFNO2dCQUNuQixZQUFZLEVBQUUsYUFBYTtnQkFDM0IsWUFBWSxFQUFFLENBQUMsa0NBQWtDLENBQUM7Z0JBQ2xELFVBQVUsRUFBRSxDQUFDLG9CQUFvQixDQUFDO2dCQUNsQyxZQUFZLEVBQUU7b0JBQ1osVUFBVSxFQUFFLEVBQUU7b0JBQ2QsVUFBVSxFQUFFLFVBQVU7aUJBQ3ZCO2FBQ0YsQ0FBQyxDQUFDO1lBRUgsK0RBQStEO1lBQy9ELE1BQU0sUUFBUSxHQUFHLHFCQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQzNDLFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyw4QkFBOEIsRUFBRTtnQkFDN0QsTUFBTSxFQUFFLGFBQWE7YUFDdEIsQ0FBQyxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztBQUNMLENBQUMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IFRlbXBsYXRlLCBNYXRjaCB9IGZyb20gJ2F3cy1jZGstbGliL2Fzc2VydGlvbnMnO1xuaW1wb3J0ICogYXMgcm91dGU1MyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtcm91dGU1Myc7XG5pbXBvcnQgeyBDb2duaXRvQXV0aENvbnN0cnVjdCB9IGZyb20gJy4uL2xpYi9jb25zdHJ1Y3RzL2NvZ25pdG8tYXV0aC1jb25zdHJ1Y3QnO1xuXG5kZXNjcmliZSgnQ29nbml0b0F1dGhDb25zdHJ1Y3QnLCAoKSA9PiB7XG4gIGxldCBhcHA6IGNkay5BcHA7XG4gIGxldCBzdGFjazogY2RrLlN0YWNrO1xuICBsZXQgdGVtcGxhdGU6IFRlbXBsYXRlO1xuXG4gIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgIGFwcCA9IG5ldyBjZGsuQXBwKCk7XG4gICAgc3RhY2sgPSBuZXcgY2RrLlN0YWNrKGFwcCwgJ1Rlc3RTdGFjaycsIHtcbiAgICAgIGVudjogeyBhY2NvdW50OiAnMTIzNDU2Nzg5MDEyJywgcmVnaW9uOiAndXMtZWFzdC0xJyB9LFxuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnRGV2ZWxvcG1lbnQgRW52aXJvbm1lbnQnLCAoKSA9PiB7XG4gICAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgICBuZXcgQ29nbml0b0F1dGhDb25zdHJ1Y3Qoc3RhY2ssICdUZXN0QXV0aCcsIHtcbiAgICAgICAgZW52aXJvbm1lbnQ6ICdkZXYnLFxuICAgICAgICBkb21haW5QcmVmaXg6ICdhdXJhMjgtZGV2JyxcbiAgICAgICAgY2FsbGJhY2tVcmxzOiBbXG4gICAgICAgICAgJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMC9hdXRoL2NhbGxiYWNrJyxcbiAgICAgICAgICAnaHR0cHM6Ly9kZXYuYXVyYTI4LmNvbS9hdXRoL2NhbGxiYWNrJyxcbiAgICAgICAgXSxcbiAgICAgICAgbG9nb3V0VXJsczogWydodHRwOi8vbG9jYWxob3N0OjMwMDAnLCAnaHR0cHM6Ly9kZXYuYXVyYTI4LmNvbSddLFxuICAgICAgfSk7XG4gICAgICB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjayk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdjcmVhdGVzIGEgQ29nbml0byBVc2VyIFBvb2wnLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6Q29nbml0bzo6VXNlclBvb2wnLCB7XG4gICAgICAgIFVzZXJQb29sTmFtZTogJ2F1cmEyOC1kZXYtdXNlci1wb29sJyxcbiAgICAgICAgUG9saWNpZXM6IHtcbiAgICAgICAgICBQYXNzd29yZFBvbGljeToge1xuICAgICAgICAgICAgTWluaW11bUxlbmd0aDogOCxcbiAgICAgICAgICAgIFJlcXVpcmVMb3dlcmNhc2U6IHRydWUsXG4gICAgICAgICAgICBSZXF1aXJlVXBwZXJjYXNlOiB0cnVlLFxuICAgICAgICAgICAgUmVxdWlyZU51bWJlcnM6IHRydWUsXG4gICAgICAgICAgICBSZXF1aXJlU3ltYm9sczogZmFsc2UsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgU2NoZW1hOiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgIE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgICAgTmFtZTogJ2VtYWlsJyxcbiAgICAgICAgICAgIFJlcXVpcmVkOiB0cnVlLFxuICAgICAgICAgICAgTXV0YWJsZTogdHJ1ZSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgIE5hbWU6ICdiaXJ0aGRhdGUnLFxuICAgICAgICAgICAgUmVxdWlyZWQ6IGZhbHNlLFxuICAgICAgICAgICAgTXV0YWJsZTogdHJ1ZSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgXSksXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ2NyZWF0ZXMgYSBDb2duaXRvIFVzZXIgUG9vbCBEb21haW4nLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6Q29nbml0bzo6VXNlclBvb2xEb21haW4nLCB7XG4gICAgICAgIERvbWFpbjogJ2F1cmEyOC1kZXYnLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdjcmVhdGVzIGEgQ29nbml0byBVc2VyIFBvb2wgQ2xpZW50JywgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkNvZ25pdG86OlVzZXJQb29sQ2xpZW50Jywge1xuICAgICAgICBDbGllbnROYW1lOiAnYXVyYTI4LWRldi1jbGllbnQnLFxuICAgICAgICBHZW5lcmF0ZVNlY3JldDogZmFsc2UsXG4gICAgICAgIEV4cGxpY2l0QXV0aEZsb3dzOiBNYXRjaC5hcnJheVdpdGgoWydBTExPV19VU0VSX1BBU1NXT1JEX0FVVEgnLCAnQUxMT1dfVVNFUl9TUlBfQVVUSCddKSxcbiAgICAgICAgQWxsb3dlZE9BdXRoRmxvd3M6IFsnY29kZSddLFxuICAgICAgICBBbGxvd2VkT0F1dGhTY29wZXM6IFsnZW1haWwnLCAnb3BlbmlkJywgJ3Byb2ZpbGUnLCAnYXdzLmNvZ25pdG8uc2lnbmluLnVzZXIuYWRtaW4nXSxcbiAgICAgICAgQ2FsbGJhY2tVUkxzOiBbXG4gICAgICAgICAgJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMC9hdXRoL2NhbGxiYWNrJyxcbiAgICAgICAgICAnaHR0cHM6Ly9kZXYuYXVyYTI4LmNvbS9hdXRoL2NhbGxiYWNrJyxcbiAgICAgICAgXSxcbiAgICAgICAgTG9nb3V0VVJMczogWydodHRwOi8vbG9jYWxob3N0OjMwMDAnLCAnaHR0cHM6Ly9kZXYuYXVyYTI4LmNvbSddLFxuICAgICAgICBTdXBwb3J0ZWRJZGVudGl0eVByb3ZpZGVyczogWydDT0dOSVRPJywgJ0dvb2dsZSddLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdjcmVhdGVzIGFkbWluIGdyb3VwIGluIHVzZXIgcG9vbCcsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpDb2duaXRvOjpVc2VyUG9vbEdyb3VwJywge1xuICAgICAgICBHcm91cE5hbWU6ICdhZG1pbicsXG4gICAgICAgIERlc2NyaXB0aW9uOiAnQWRtaW5pc3RyYXRvciB1c2VycyB3aXRoIGVsZXZhdGVkIHByaXZpbGVnZXMnLFxuICAgICAgICBQcmVjZWRlbmNlOiAxLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdjcmVhdGVzIEdvb2dsZSBpZGVudGl0eSBwcm92aWRlciB3aXRoIHByb3BlciBjb25maWd1cmF0aW9uJywgKCkgPT4ge1xuICAgICAgLy8gQ2hlY2sgdGhhdCBHb29nbGUgaWRlbnRpdHkgcHJvdmlkZXIgaXMgY3JlYXRlZFxuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkNvZ25pdG86OlVzZXJQb29sSWRlbnRpdHlQcm92aWRlcicsIHtcbiAgICAgICAgUHJvdmlkZXJUeXBlOiAnR29vZ2xlJyxcbiAgICAgICAgQXR0cmlidXRlTWFwcGluZzoge1xuICAgICAgICAgIGVtYWlsOiAnZW1haWwnLFxuICAgICAgICAgIGdpdmVuX25hbWU6ICdnaXZlbl9uYW1lJyxcbiAgICAgICAgICBmYW1pbHlfbmFtZTogJ2ZhbWlseV9uYW1lJyxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnY3JlYXRlcyBDbG91ZEZvcm1hdGlvbiBvdXRwdXRzJywgKCkgPT4ge1xuICAgICAgLy8gT3V0cHV0cyBhcmUgY3JlYXRlZCBhdCB0aGUgY29uc3RydWN0IGxldmVsIHdpdGggQ0RLIGhhc2hlc1xuICAgICAgY29uc3Qgb3V0cHV0cyA9IHRlbXBsYXRlLmZpbmRPdXRwdXRzKCcqJyk7XG4gICAgICBjb25zdCBvdXRwdXRLZXlzID0gT2JqZWN0LmtleXMob3V0cHV0cyk7XG5cbiAgICAgIC8vIENoZWNrIHRoYXQgb3V0cHV0cyB3aXRoIHRoZSBjb3JyZWN0IHByZWZpeCBleGlzdFxuICAgICAgZXhwZWN0KG91dHB1dEtleXMuc29tZSgoa2V5KSA9PiBrZXkuc3RhcnRzV2l0aCgnVGVzdEF1dGhVc2VyUG9vbElkJykpKS50b0JlKHRydWUpO1xuICAgICAgZXhwZWN0KG91dHB1dEtleXMuc29tZSgoa2V5KSA9PiBrZXkuc3RhcnRzV2l0aCgnVGVzdEF1dGhVc2VyUG9vbENsaWVudElkJykpKS50b0JlKHRydWUpO1xuICAgICAgZXhwZWN0KG91dHB1dEtleXMuc29tZSgoa2V5KSA9PiBrZXkuc3RhcnRzV2l0aCgnVGVzdEF1dGhDb2duaXRvRG9tYWluUHJlZml4JykpKS50b0JlKHRydWUpO1xuICAgICAgZXhwZWN0KG91dHB1dEtleXMuc29tZSgoa2V5KSA9PiBrZXkuc3RhcnRzV2l0aCgnVGVzdEF1dGhDb2duaXRvSG9zdGVkVUlVUkwnKSkpLnRvQmUodHJ1ZSk7XG4gICAgICBleHBlY3Qob3V0cHV0S2V5cy5zb21lKChrZXkpID0+IGtleS5zdGFydHNXaXRoKCdUZXN0QXV0aEFkbWluR3JvdXBOYW1lJykpKS50b0JlKHRydWUpO1xuICAgICAgZXhwZWN0KG91dHB1dEtleXMuc29tZSgoa2V5KSA9PiBrZXkuc3RhcnRzV2l0aCgnVGVzdEF1dGhPQXV0aFNlY3JldHNSZW1pbmRlcicpKSkudG9CZSh0cnVlKTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ2RvZXMgbm90IGNyZWF0ZSBjdXN0b20gZG9tYWluIGNlcnRpZmljYXRlIGZvciBkZXYgZW52aXJvbm1lbnQnLCAoKSA9PiB7XG4gICAgICAvLyBTaG91bGQgbm90IGhhdmUgYW55IEFDTSBjZXJ0aWZpY2F0ZXMgZm9yIGRldiBlbnZpcm9ubWVudFxuICAgICAgY29uc3QgY2VydGlmaWNhdGVzID0gdGVtcGxhdGUuZmluZFJlc291cmNlcygnQVdTOjpDZXJ0aWZpY2F0ZU1hbmFnZXI6OkNlcnRpZmljYXRlJyk7XG4gICAgICBleHBlY3QoT2JqZWN0LmtleXMoY2VydGlmaWNhdGVzKSkudG9IYXZlTGVuZ3RoKDApO1xuICAgIH0pO1xuXG4gICAgdGVzdCgndXNlcyBkZWZhdWx0IENvZ25pdG8gZG9tYWluIGZvciBkZXYgZW52aXJvbm1lbnQnLCAoKSA9PiB7XG4gICAgICAvLyBTaG91bGQgdXNlIENvZ25pdG9Eb21haW4gcHJvcGVydHksIG5vdCBDdXN0b21Eb21haW5cbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpDb2duaXRvOjpVc2VyUG9vbERvbWFpbicsIHtcbiAgICAgICAgRG9tYWluOiAnYXVyYTI4LWRldicsXG4gICAgICB9KTtcblxuICAgICAgLy8gU2hvdWxkIG5vdCBoYXZlIEN1c3RvbURvbWFpbiBwcm9wZXJ0eVxuICAgICAgY29uc3QgZG9tYWlucyA9IHRlbXBsYXRlLmZpbmRSZXNvdXJjZXMoJ0FXUzo6Q29nbml0bzo6VXNlclBvb2xEb21haW4nKTtcbiAgICAgIGNvbnN0IGRvbWFpbktleSA9IE9iamVjdC5rZXlzKGRvbWFpbnMpWzBdO1xuICAgICAgZXhwZWN0KGRvbWFpbnNbZG9tYWluS2V5XS5Qcm9wZXJ0aWVzLkN1c3RvbURvbWFpbikudG9CZVVuZGVmaW5lZCgpO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnb3V0cHV0cyBkZWZhdWx0IENvZ25pdG8gaG9zdGVkIFVJIFVSTCBmb3IgZGV2IGVudmlyb25tZW50JywgKCkgPT4ge1xuICAgICAgY29uc3Qgb3V0cHV0cyA9IHRlbXBsYXRlLmZpbmRPdXRwdXRzKCcqJyk7XG4gICAgICBjb25zdCBob3N0ZWRVSU91dHB1dCA9IE9iamVjdC5rZXlzKG91dHB1dHMpLmZpbmQoKGtleSkgPT5cbiAgICAgICAga2V5LnN0YXJ0c1dpdGgoJ1Rlc3RBdXRoQ29nbml0b0hvc3RlZFVJVVJMJyksXG4gICAgICApO1xuICAgICAgZXhwZWN0KG91dHB1dHNbaG9zdGVkVUlPdXRwdXQhXS5WYWx1ZSkudG9Db250YWluKFxuICAgICAgICAnYXVyYTI4LWRldi5hdXRoLnVzLWVhc3QtMS5hbWF6b25jb2duaXRvLmNvbScsXG4gICAgICApO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnRGV2ZWxvcG1lbnQgRW52aXJvbm1lbnQgd2l0aCBDdXN0b20gRG9tYWluIChzaG91bGQgYmUgaWdub3JlZCknLCAoKSA9PiB7XG4gICAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgICBjb25zdCBob3N0ZWRab25lID0gcm91dGU1My5Ib3N0ZWRab25lLmZyb21Ib3N0ZWRab25lQXR0cmlidXRlcyhzdGFjaywgJ1Rlc3Rab25lJywge1xuICAgICAgICBob3N0ZWRab25lSWQ6ICdaMTIzNDU2Nzg5QUJDJyxcbiAgICAgICAgem9uZU5hbWU6ICdhdXJhMjguY29tJyxcbiAgICAgIH0pO1xuXG4gICAgICBuZXcgQ29nbml0b0F1dGhDb25zdHJ1Y3Qoc3RhY2ssICdUZXN0QXV0aCcsIHtcbiAgICAgICAgZW52aXJvbm1lbnQ6ICdkZXYnLFxuICAgICAgICBkb21haW5QcmVmaXg6ICdhdXJhMjgtZGV2JyxcbiAgICAgICAgY2FsbGJhY2tVcmxzOiBbXG4gICAgICAgICAgJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMC9hdXRoL2NhbGxiYWNrJyxcbiAgICAgICAgICAnaHR0cHM6Ly9kZXYuYXVyYTI4LmNvbS9hdXRoL2NhbGxiYWNrJyxcbiAgICAgICAgXSxcbiAgICAgICAgbG9nb3V0VXJsczogWydodHRwOi8vbG9jYWxob3N0OjMwMDAnLCAnaHR0cHM6Ly9kZXYuYXVyYTI4LmNvbSddLFxuICAgICAgICBjdXN0b21Eb21haW46IHtcbiAgICAgICAgICBkb21haW5OYW1lOiAnYXV0aC5hdXJhMjguY29tJyxcbiAgICAgICAgICBob3N0ZWRab25lOiBob3N0ZWRab25lLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgICB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjayk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdpZ25vcmVzIGN1c3RvbSBkb21haW4gY29uZmlndXJhdGlvbiBmb3IgZGV2IGVudmlyb25tZW50JywgKCkgPT4ge1xuICAgICAgLy8gU2hvdWxkIG5vdCBjcmVhdGUgY2VydGlmaWNhdGUgZXZlbiB3aGVuIGN1c3RvbSBkb21haW4gaXMgcHJvdmlkZWRcbiAgICAgIGNvbnN0IGNlcnRpZmljYXRlcyA9IHRlbXBsYXRlLmZpbmRSZXNvdXJjZXMoJ0FXUzo6Q2VydGlmaWNhdGVNYW5hZ2VyOjpDZXJ0aWZpY2F0ZScpO1xuICAgICAgZXhwZWN0KE9iamVjdC5rZXlzKGNlcnRpZmljYXRlcykpLnRvSGF2ZUxlbmd0aCgwKTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ3N0aWxsIHVzZXMgZGVmYXVsdCBDb2duaXRvIGRvbWFpbiBkZXNwaXRlIGN1c3RvbSBkb21haW4gY29uZmlnJywgKCkgPT4ge1xuICAgICAgLy8gU2hvdWxkIHVzZSBDb2duaXRvRG9tYWluIHByb3BlcnR5LCBub3QgQ3VzdG9tRG9tYWluXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6Q29nbml0bzo6VXNlclBvb2xEb21haW4nLCB7XG4gICAgICAgIERvbWFpbjogJ2F1cmEyOC1kZXYnLFxuICAgICAgfSk7XG5cbiAgICAgIC8vIFNob3VsZCBub3QgaGF2ZSBDdXN0b21Eb21haW4gcHJvcGVydHlcbiAgICAgIGNvbnN0IGRvbWFpbnMgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKCdBV1M6OkNvZ25pdG86OlVzZXJQb29sRG9tYWluJyk7XG4gICAgICBjb25zdCBkb21haW5LZXkgPSBPYmplY3Qua2V5cyhkb21haW5zKVswXTtcbiAgICAgIGV4cGVjdChkb21haW5zW2RvbWFpbktleV0uUHJvcGVydGllcy5DdXN0b21Eb21haW4pLnRvQmVVbmRlZmluZWQoKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ1Byb2R1Y3Rpb24gRW52aXJvbm1lbnQgd2l0aG91dCBDdXN0b20gRG9tYWluJywgKCkgPT4ge1xuICAgIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgICAgbmV3IENvZ25pdG9BdXRoQ29uc3RydWN0KHN0YWNrLCAnVGVzdEF1dGgnLCB7XG4gICAgICAgIGVudmlyb25tZW50OiAncHJvZCcsXG4gICAgICAgIGRvbWFpblByZWZpeDogJ2F1cmEyOC1wcm9kJyxcbiAgICAgICAgY2FsbGJhY2tVcmxzOiBbJ2h0dHBzOi8vYXVyYTI4LmNvbS9hdXRoL2NhbGxiYWNrJ10sXG4gICAgICAgIGxvZ291dFVybHM6IFsnaHR0cHM6Ly9hdXJhMjguY29tJ10sXG4gICAgICB9KTtcbiAgICAgIHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ2NyZWF0ZXMgYSBVc2VyIFBvb2wgd2l0aCBwcm9kdWN0aW9uIHNldHRpbmdzJywgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkNvZ25pdG86OlVzZXJQb29sJywge1xuICAgICAgICBVc2VyUG9vbE5hbWU6ICdhdXJhMjgtcHJvZC11c2VyLXBvb2wnLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdjcmVhdGVzIGFkbWluIGdyb3VwIGluIHVzZXIgcG9vbCcsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpDb2duaXRvOjpVc2VyUG9vbEdyb3VwJywge1xuICAgICAgICBHcm91cE5hbWU6ICdhZG1pbicsXG4gICAgICAgIERlc2NyaXB0aW9uOiAnQWRtaW5pc3RyYXRvciB1c2VycyB3aXRoIGVsZXZhdGVkIHByaXZpbGVnZXMnLFxuICAgICAgICBQcmVjZWRlbmNlOiAxLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdzZXRzIFJFVEFJTiBkZWxldGlvbiBwb2xpY3kgZm9yIHByb2R1Y3Rpb24nLCAoKSA9PiB7XG4gICAgICBjb25zdCB1c2VyUG9vbCA9IHRlbXBsYXRlLmZpbmRSZXNvdXJjZXMoJ0FXUzo6Q29nbml0bzo6VXNlclBvb2wnKTtcbiAgICAgIGNvbnN0IHVzZXJQb29sS2V5ID0gT2JqZWN0LmtleXModXNlclBvb2wpWzBdO1xuICAgICAgZXhwZWN0KHVzZXJQb29sW3VzZXJQb29sS2V5XS5EZWxldGlvblBvbGljeSkudG9CZSgnUmV0YWluJyk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCd1c2VzIGRlZmF1bHQgQ29nbml0byBkb21haW4gd2hlbiBjdXN0b20gZG9tYWluIG5vdCBwcm92aWRlZCcsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpDb2duaXRvOjpVc2VyUG9vbERvbWFpbicsIHtcbiAgICAgICAgRG9tYWluOiAnYXVyYTI4LXByb2QnLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdkb2VzIG5vdCBjcmVhdGUgY2VydGlmaWNhdGUgd2hlbiBjdXN0b20gZG9tYWluIG5vdCBwcm92aWRlZCcsICgpID0+IHtcbiAgICAgIGNvbnN0IGNlcnRpZmljYXRlcyA9IHRlbXBsYXRlLmZpbmRSZXNvdXJjZXMoJ0FXUzo6Q2VydGlmaWNhdGVNYW5hZ2VyOjpDZXJ0aWZpY2F0ZScpO1xuICAgICAgZXhwZWN0KE9iamVjdC5rZXlzKGNlcnRpZmljYXRlcykpLnRvSGF2ZUxlbmd0aCgwKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ1Byb2R1Y3Rpb24gRW52aXJvbm1lbnQgd2l0aCBDdXN0b20gRG9tYWluJywgKCkgPT4ge1xuICAgIGxldCBhdXRoQ29uc3RydWN0OiBDb2duaXRvQXV0aENvbnN0cnVjdDtcblxuICAgIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgICAgY29uc3QgaG9zdGVkWm9uZSA9IHJvdXRlNTMuSG9zdGVkWm9uZS5mcm9tSG9zdGVkWm9uZUF0dHJpYnV0ZXMoc3RhY2ssICdUZXN0Wm9uZScsIHtcbiAgICAgICAgaG9zdGVkWm9uZUlkOiAnWjEyMzQ1Njc4OUFCQycsXG4gICAgICAgIHpvbmVOYW1lOiAnYXVyYTI4LmNvbScsXG4gICAgICB9KTtcblxuICAgICAgYXV0aENvbnN0cnVjdCA9IG5ldyBDb2duaXRvQXV0aENvbnN0cnVjdChzdGFjaywgJ1Rlc3RBdXRoJywge1xuICAgICAgICBlbnZpcm9ubWVudDogJ3Byb2QnLFxuICAgICAgICBkb21haW5QcmVmaXg6ICdhdXJhMjgtcHJvZCcsXG4gICAgICAgIGNhbGxiYWNrVXJsczogWydodHRwczovL2F1cmEyOC5jb20vYXV0aC9jYWxsYmFjayddLFxuICAgICAgICBsb2dvdXRVcmxzOiBbJ2h0dHBzOi8vYXVyYTI4LmNvbSddLFxuICAgICAgICBjdXN0b21Eb21haW46IHtcbiAgICAgICAgICBkb21haW5OYW1lOiAnYXV0aC5hdXJhMjguY29tJyxcbiAgICAgICAgICBob3N0ZWRab25lOiBob3N0ZWRab25lLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgICB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjayk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdjcmVhdGVzIEFDTSBjZXJ0aWZpY2F0ZSBmb3IgY3VzdG9tIGRvbWFpbicsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpDZXJ0aWZpY2F0ZU1hbmFnZXI6OkNlcnRpZmljYXRlJywge1xuICAgICAgICBEb21haW5OYW1lOiAnYXV0aC5hdXJhMjguY29tJyxcbiAgICAgICAgRG9tYWluVmFsaWRhdGlvbk9wdGlvbnM6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICBEb21haW5OYW1lOiAnYXV0aC5hdXJhMjguY29tJyxcbiAgICAgICAgICAgIEhvc3RlZFpvbmVJZDogJ1oxMjM0NTY3ODlBQkMnLFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICAgIFZhbGlkYXRpb25NZXRob2Q6ICdETlMnLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdjcmVhdGVzIFVzZXIgUG9vbCBEb21haW4gd2l0aCBjdXN0b20gZG9tYWluIGNvbmZpZ3VyYXRpb24nLCAoKSA9PiB7XG4gICAgICBjb25zdCBkb21haW5zID0gdGVtcGxhdGUuZmluZFJlc291cmNlcygnQVdTOjpDb2duaXRvOjpVc2VyUG9vbERvbWFpbicpO1xuICAgICAgY29uc3QgZG9tYWluS2V5ID0gT2JqZWN0LmtleXMoZG9tYWlucylbMF07XG5cbiAgICAgIC8vIENESyByZXByZXNlbnRzIGN1c3RvbSBkb21haW4gYXMgQ3VzdG9tRG9tYWluQ29uZmlnIGluIHRoZSBDbG91ZEZvcm1hdGlvbiB0ZW1wbGF0ZVxuICAgICAgZXhwZWN0KGRvbWFpbnNbZG9tYWluS2V5XS5Qcm9wZXJ0aWVzLkRvbWFpbikudG9CZSgnYXV0aC5hdXJhMjguY29tJyk7XG4gICAgICBleHBlY3QoZG9tYWluc1tkb21haW5LZXldLlByb3BlcnRpZXMuQ3VzdG9tRG9tYWluQ29uZmlnKS50b0JlRGVmaW5lZCgpO1xuICAgICAgZXhwZWN0KGRvbWFpbnNbZG9tYWluS2V5XS5Qcm9wZXJ0aWVzLkN1c3RvbURvbWFpbkNvbmZpZy5DZXJ0aWZpY2F0ZUFybikudG9CZURlZmluZWQoKTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ3NldHMgY3VzdG9tRG9tYWluTmFtZSBhbmQgY3VzdG9tRG9tYWluQ2VydGlmaWNhdGUgcHJvcGVydGllcycsICgpID0+IHtcbiAgICAgIGV4cGVjdChhdXRoQ29uc3RydWN0LmN1c3RvbURvbWFpbk5hbWUpLnRvQmUoJ2F1dGguYXVyYTI4LmNvbScpO1xuICAgICAgZXhwZWN0KGF1dGhDb25zdHJ1Y3QuY3VzdG9tRG9tYWluQ2VydGlmaWNhdGUpLnRvQmVEZWZpbmVkKCk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdvdXRwdXRzIGN1c3RvbSBkb21haW4gVVJMIGluIENsb3VkRm9ybWF0aW9uJywgKCkgPT4ge1xuICAgICAgY29uc3Qgb3V0cHV0cyA9IHRlbXBsYXRlLmZpbmRPdXRwdXRzKCcqJyk7XG4gICAgICBjb25zdCBob3N0ZWRVSU91dHB1dCA9IE9iamVjdC5rZXlzKG91dHB1dHMpLmZpbmQoKGtleSkgPT5cbiAgICAgICAga2V5LnN0YXJ0c1dpdGgoJ1Rlc3RBdXRoQ29nbml0b0hvc3RlZFVJVVJMJyksXG4gICAgICApO1xuICAgICAgZXhwZWN0KG91dHB1dHNbaG9zdGVkVUlPdXRwdXQhXS5WYWx1ZSkudG9CZSgnaHR0cHM6Ly9hdXRoLmF1cmEyOC5jb20nKTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ291dHB1dHMgY3VzdG9tIGRvbWFpbiBuYW1lIHNlcGFyYXRlbHknLCAoKSA9PiB7XG4gICAgICBjb25zdCBvdXRwdXRzID0gdGVtcGxhdGUuZmluZE91dHB1dHMoJyonKTtcbiAgICAgIGNvbnN0IGN1c3RvbURvbWFpbk91dHB1dCA9IE9iamVjdC5rZXlzKG91dHB1dHMpLmZpbmQoKGtleSkgPT5cbiAgICAgICAga2V5LnN0YXJ0c1dpdGgoJ1Rlc3RBdXRoQ29nbml0b0N1c3RvbURvbWFpbicpLFxuICAgICAgKTtcbiAgICAgIGV4cGVjdChvdXRwdXRzW2N1c3RvbURvbWFpbk91dHB1dCFdLlZhbHVlKS50b0JlKCdhdXRoLmF1cmEyOC5jb20nKTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ2NyZWF0ZXMgVXNlciBQb29sIHdpdGggcHJvZHVjdGlvbiBzZXR0aW5ncycsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpDb2duaXRvOjpVc2VyUG9vbCcsIHtcbiAgICAgICAgVXNlclBvb2xOYW1lOiAnYXVyYTI4LXByb2QtdXNlci1wb29sJyxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnc2V0cyBSRVRBSU4gZGVsZXRpb24gcG9saWN5IGZvciBwcm9kdWN0aW9uJywgKCkgPT4ge1xuICAgICAgY29uc3QgdXNlclBvb2wgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKCdBV1M6OkNvZ25pdG86OlVzZXJQb29sJyk7XG4gICAgICBjb25zdCB1c2VyUG9vbEtleSA9IE9iamVjdC5rZXlzKHVzZXJQb29sKVswXTtcbiAgICAgIGV4cGVjdCh1c2VyUG9vbFt1c2VyUG9vbEtleV0uRGVsZXRpb25Qb2xpY3kpLnRvQmUoJ1JldGFpbicpO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnRWRnZSBDYXNlcycsICgpID0+IHtcbiAgICB0ZXN0KCdjcmVhdGVzIGNlcnRpZmljYXRlIGV2ZW4gd2l0aCB1bmRlZmluZWQgaG9zdGVkIHpvbmUgKENESyB3aWxsIGZhaWwgYXQgc3ludGhlc2lzKScsICgpID0+IHtcbiAgICAgIC8vIFdoZW4gaG9zdGVkWm9uZSBpcyB1bmRlZmluZWQsIENESyBzdGlsbCBhdHRlbXB0cyB0byBjcmVhdGUgdGhlIGNlcnRpZmljYXRlXG4gICAgICAvLyBUaGlzIHdpbGwgZmFpbCBhdCBzeW50aGVzaXMgdGltZSBpbiByZWFsIGRlcGxveW1lbnQsIGJ1dCBpbiB0ZXN0cyB3ZSBjYW4gdmVyaWZ5IHRoZSBiZWhhdmlvclxuICAgICAgbmV3IENvZ25pdG9BdXRoQ29uc3RydWN0KHN0YWNrLCAnVGVzdEF1dGgnLCB7XG4gICAgICAgIGVudmlyb25tZW50OiAncHJvZCcsXG4gICAgICAgIGRvbWFpblByZWZpeDogJ2F1cmEyOC1wcm9kJyxcbiAgICAgICAgY2FsbGJhY2tVcmxzOiBbJ2h0dHBzOi8vYXVyYTI4LmNvbS9hdXRoL2NhbGxiYWNrJ10sXG4gICAgICAgIGxvZ291dFVybHM6IFsnaHR0cHM6Ly9hdXJhMjguY29tJ10sXG4gICAgICAgIGN1c3RvbURvbWFpbjoge1xuICAgICAgICAgIGRvbWFpbk5hbWU6ICdhdXRoLmF1cmEyOC5jb20nLFxuICAgICAgICAgIGhvc3RlZFpvbmU6IHVuZGVmaW5lZCBhcyB1bmtub3duIGFzIHJvdXRlNTMuSUhvc3RlZFpvbmUsXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgLy8gVGhlIGNvbnN0cnVjdCB3aWxsIHN0aWxsIGNyZWF0ZSBjdXN0b20gZG9tYWluIHJlc291cmNlc1xuICAgICAgLy8gYnV0IHN5bnRoZXNpcyB3aWxsIGZhaWwgd2l0aG91dCBhIHZhbGlkIGhvc3RlZFpvbmVcbiAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKTtcblxuICAgICAgLy8gU2hvdWxkIGNyZWF0ZSBjZXJ0aWZpY2F0ZSAoZXZlbiB0aG91Z2ggaXQgd29uJ3Qgd29yayB3aXRob3V0IGhvc3RlZFpvbmUpXG4gICAgICBjb25zdCBjZXJ0aWZpY2F0ZXMgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKCdBV1M6OkNlcnRpZmljYXRlTWFuYWdlcjo6Q2VydGlmaWNhdGUnKTtcbiAgICAgIGV4cGVjdChPYmplY3Qua2V5cyhjZXJ0aWZpY2F0ZXMpKS50b0hhdmVMZW5ndGgoMSk7XG5cbiAgICAgIC8vIFNob3VsZCBjcmVhdGUgY3VzdG9tIGRvbWFpblxuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkNvZ25pdG86OlVzZXJQb29sRG9tYWluJywge1xuICAgICAgICBEb21haW46ICdhdXRoLmF1cmEyOC5jb20nLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdoYW5kbGVzIGVtcHR5IGRvbWFpbiBuYW1lJywgKCkgPT4ge1xuICAgICAgY29uc3QgaG9zdGVkWm9uZSA9IHJvdXRlNTMuSG9zdGVkWm9uZS5mcm9tSG9zdGVkWm9uZUF0dHJpYnV0ZXMoc3RhY2ssICdUZXN0Wm9uZScsIHtcbiAgICAgICAgaG9zdGVkWm9uZUlkOiAnWjEyMzQ1Njc4OUFCQycsXG4gICAgICAgIHpvbmVOYW1lOiAnYXVyYTI4LmNvbScsXG4gICAgICB9KTtcblxuICAgICAgbmV3IENvZ25pdG9BdXRoQ29uc3RydWN0KHN0YWNrLCAnVGVzdEF1dGgnLCB7XG4gICAgICAgIGVudmlyb25tZW50OiAncHJvZCcsXG4gICAgICAgIGRvbWFpblByZWZpeDogJ2F1cmEyOC1wcm9kJyxcbiAgICAgICAgY2FsbGJhY2tVcmxzOiBbJ2h0dHBzOi8vYXVyYTI4LmNvbS9hdXRoL2NhbGxiYWNrJ10sXG4gICAgICAgIGxvZ291dFVybHM6IFsnaHR0cHM6Ly9hdXJhMjguY29tJ10sXG4gICAgICAgIGN1c3RvbURvbWFpbjoge1xuICAgICAgICAgIGRvbWFpbk5hbWU6ICcnLFxuICAgICAgICAgIGhvc3RlZFpvbmU6IGhvc3RlZFpvbmUsXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgLy8gU2hvdWxkIGZhbGwgYmFjayB0byBkZWZhdWx0IGRvbWFpbiB3aGVuIGRvbWFpbiBuYW1lIGlzIGVtcHR5XG4gICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjayk7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6Q29nbml0bzo6VXNlclBvb2xEb21haW4nLCB7XG4gICAgICAgIERvbWFpbjogJ2F1cmEyOC1wcm9kJyxcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9KTtcbn0pO1xuIl19