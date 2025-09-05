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
    });
    describe('Production Environment', () => {
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
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29nbml0by1hdXRoLWNvbnN0cnVjdC50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY29nbml0by1hdXRoLWNvbnN0cnVjdC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMsdURBQXlEO0FBQ3pELHFGQUFnRjtBQUVoRixRQUFRLENBQUMsc0JBQXNCLEVBQUUsR0FBRyxFQUFFO0lBQ3BDLElBQUksR0FBWSxDQUFDO0lBQ2pCLElBQUksS0FBZ0IsQ0FBQztJQUNyQixJQUFJLFFBQWtCLENBQUM7SUFFdkIsVUFBVSxDQUFDLEdBQUcsRUFBRTtRQUNkLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUNwQixLQUFLLEdBQUcsSUFBSSxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxXQUFXLEVBQUU7WUFDdEMsR0FBRyxFQUFFLEVBQUUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLEVBQUUsV0FBVyxFQUFFO1NBQ3RELENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0lBRUgsUUFBUSxDQUFDLHlCQUF5QixFQUFFLEdBQUcsRUFBRTtRQUN2QyxVQUFVLENBQUMsR0FBRyxFQUFFO1lBQ2QsSUFBSSw2Q0FBb0IsQ0FBQyxLQUFLLEVBQUUsVUFBVSxFQUFFO2dCQUMxQyxXQUFXLEVBQUUsS0FBSztnQkFDbEIsWUFBWSxFQUFFLFlBQVk7Z0JBQzFCLFlBQVksRUFBRTtvQkFDWixxQ0FBcUM7b0JBQ3JDLHNDQUFzQztpQkFDdkM7Z0JBQ0QsVUFBVSxFQUFFLENBQUMsdUJBQXVCLEVBQUUsd0JBQXdCLENBQUM7YUFDaEUsQ0FBQyxDQUFDO1lBQ0gsUUFBUSxHQUFHLHFCQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3ZDLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLDZCQUE2QixFQUFFLEdBQUcsRUFB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O2dCQUMzQixZQUFZLEVBQUUsQ0FBQyxrQ0FBa0MsQ0FBQztnQkFDbEQsVUFBVSxFQUFFLENBQUMsb0JBQW9CLENBQUM7YUFDbkMsQ0FBQyxDQUFDO1lBQ0gsUUFBUSxHQUFHLHFCQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3ZDLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLDhDQUE4QyxFQUFFLEdBQUcsRUFBRTtZQUN4RCxRQUFRLENBQUMscUJBQXFCLENBQUMsd0JBQXdCLEVBQUU7Z0JBQ3ZELFlBQVksRUFBRSx1QkFBdUI7YUFDdEMsQ0FBQyxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsa0NBQWtDLEVBQUUsR0FBRyxFQUFFO1lBQzVDLFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyw2QkFBNkIsRUFBRTtnQkFDNUQsU0FBUyxFQUFFLE9BQU87Z0JBQ2xCLFdBQVcsRUFBRSw4Q0FBOEM7Z0JBQzNELFVBQVUsRUFBRSxDQUFDO2FBQ2QsQ0FBQyxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsNENBQTRDLEVBQUUsR0FBRyxFQUFFO1lBQ3RELE1BQU0sUUFBUSxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsd0JBQXdCLENBQUMsQ0FBQztZQUNsRSxNQUFNLFdBQVcsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzdDLE1BQU0sQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLENBQUMsY0FBYyxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzlELENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBUZW1wbGF0ZSwgTWF0Y2ggfSBmcm9tICdhd3MtY2RrLWxpYi9hc3NlcnRpb25zJztcbmltcG9ydCB7IENvZ25pdG9BdXRoQ29uc3RydWN0IH0gZnJvbSAnLi4vbGliL2NvbnN0cnVjdHMvY29nbml0by1hdXRoLWNvbnN0cnVjdCc7XG5cbmRlc2NyaWJlKCdDb2duaXRvQXV0aENvbnN0cnVjdCcsICgpID0+IHtcbiAgbGV0IGFwcDogY2RrLkFwcDtcbiAgbGV0IHN0YWNrOiBjZGsuU3RhY2s7XG4gIGxldCB0ZW1wbGF0ZTogVGVtcGxhdGU7XG5cbiAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgYXBwID0gbmV3IGNkay5BcHAoKTtcbiAgICBzdGFjayA9IG5ldyBjZGsuU3RhY2soYXBwLCAnVGVzdFN0YWNrJywge1xuICAgICAgZW52OiB7IGFjY291bnQ6ICcxMjM0NTY3ODkwMTInLCByZWdpb246ICd1cy1lYXN0LTEnIH0sXG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdEZXZlbG9wbWVudCBFbnZpcm9ubWVudCcsICgpID0+IHtcbiAgICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICAgIG5ldyBDb2duaXRvQXV0aENvbnN0cnVjdChzdGFjaywgJ1Rlc3RBdXRoJywge1xuICAgICAgICBlbnZpcm9ubWVudDogJ2RldicsXG4gICAgICAgIGRvbWFpblByZWZpeDogJ2F1cmEyOC1kZXYnLFxuICAgICAgICBjYWxsYmFja1VybHM6IFtcbiAgICAgICAgICAnaHR0cDovL2xvY2FsaG9zdDozMDAwL2F1dGgvY2FsbGJhY2snLFxuICAgICAgICAgICdodHRwczovL2Rldi5hdXJhMjguY29tL2F1dGgvY2FsbGJhY2snLFxuICAgICAgICBdLFxuICAgICAgICBsb2dvdXRVcmxzOiBbJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMCcsICdodHRwczovL2Rldi5hdXJhMjguY29tJ10sXG4gICAgICB9KTtcbiAgICAgIHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ2NyZWF0ZXMgYSBDb2duaXRvIFVzZXIgUG9vbCcsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpDb2duaXRvOjpVc2VyUG9vbCcsIHtcbiAgICAgICAgVXNlclBvb2xOYW1lOiAnYXVyYTI4LWRldi11c2VyLXBvb2wnLFxuICAgICAgICBQb2xpY2llczoge1xuICAgICAgICAgIFBhc3N3b3JkUG9saWN5OiB7XG4gICAgICAgICAgICBNaW5pbXVtTGVuZ3RoOiA4LFxuICAgICAgICAgICAgUmVxdWlyZUxvd2VyY2FzZTogdHJ1ZSxcbiAgICAgICAgICAgIFJlcXVpcmVVcHBlcmNhc2U6IHRydWUsXG4gICAgICAgICAgICBSZXF1aXJlTnVtYmVyczogdHJ1ZSxcbiAgICAgICAgICAgIFJlcXVpcmVTeW1ib2xzOiBmYWxzZSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICBTY2hlbWE6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICBOYW1lOiAnZW1haWwnLFxuICAgICAgICAgICAgUmVxdWlyZWQ6IHRydWUsXG4gICAgICAgICAgICBNdXRhYmxlOiB0cnVlLFxuICAgICAgICAgIH0pLFxuICAgICAgICAgIE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgICAgTmFtZTogJ2JpcnRoZGF0ZScsXG4gICAgICAgICAgICBSZXF1aXJlZDogZmFsc2UsXG4gICAgICAgICAgICBNdXRhYmxlOiB0cnVlLFxuICAgICAgICAgIH0pLFxuICAgICAgICBdKSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnY3JlYXRlcyBhIENvZ25pdG8gVXNlciBQb29sIERvbWFpbicsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpDb2duaXRvOjpVc2VyUG9vbERvbWFpbicsIHtcbiAgICAgICAgRG9tYWluOiAnYXVyYTI4LWRldicsXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ2NyZWF0ZXMgYSBDb2duaXRvIFVzZXIgUG9vbCBDbGllbnQnLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6Q29nbml0bzo6VXNlclBvb2xDbGllbnQnLCB7XG4gICAgICAgIENsaWVudE5hbWU6ICdhdXJhMjgtZGV2LWNsaWVudCcsXG4gICAgICAgIEdlbmVyYXRlU2VjcmV0OiBmYWxzZSxcbiAgICAgICAgRXhwbGljaXRBdXRoRmxvd3M6IE1hdGNoLmFycmF5V2l0aChbJ0FMTE9XX1VTRVJfUEFTU1dPUkRfQVVUSCcsICdBTExPV19VU0VSX1NSUF9BVVRIJ10pLFxuICAgICAgICBBbGxvd2VkT0F1dGhGbG93czogWydjb2RlJ10sXG4gICAgICAgIEFsbG93ZWRPQXV0aFNjb3BlczogWydlbWFpbCcsICdvcGVuaWQnLCAncHJvZmlsZScsICdhd3MuY29nbml0by5zaWduaW4udXNlci5hZG1pbiddLFxuICAgICAgICBDYWxsYmFja1VSTHM6IFtcbiAgICAgICAgICAnaHR0cDovL2xvY2FsaG9zdDozMDAwL2F1dGgvY2FsbGJhY2snLFxuICAgICAgICAgICdodHRwczovL2Rldi5hdXJhMjguY29tL2F1dGgvY2FsbGJhY2snLFxuICAgICAgICBdLFxuICAgICAgICBMb2dvdXRVUkxzOiBbJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMCcsICdodHRwczovL2Rldi5hdXJhMjguY29tJ10sXG4gICAgICAgIFN1cHBvcnRlZElkZW50aXR5UHJvdmlkZXJzOiBbJ0NPR05JVE8nLCAnR29vZ2xlJ10sXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ2NyZWF0ZXMgYWRtaW4gZ3JvdXAgaW4gdXNlciBwb29sJywgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkNvZ25pdG86OlVzZXJQb29sR3JvdXAnLCB7XG4gICAgICAgIEdyb3VwTmFtZTogJ2FkbWluJyxcbiAgICAgICAgRGVzY3JpcHRpb246ICdBZG1pbmlzdHJhdG9yIHVzZXJzIHdpdGggZWxldmF0ZWQgcHJpdmlsZWdlcycsXG4gICAgICAgIFByZWNlZGVuY2U6IDEsXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ2NyZWF0ZXMgR29vZ2xlIGlkZW50aXR5IHByb3ZpZGVyIHdpdGggcHJvcGVyIGNvbmZpZ3VyYXRpb24nLCAoKSA9PiB7XG4gICAgICAvLyBDaGVjayB0aGF0IEdvb2dsZSBpZGVudGl0eSBwcm92aWRlciBpcyBjcmVhdGVkXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6Q29nbml0bzo6VXNlclBvb2xJZGVudGl0eVByb3ZpZGVyJywge1xuICAgICAgICBQcm92aWRlclR5cGU6ICdHb29nbGUnLFxuICAgICAgICBBdHRyaWJ1dGVNYXBwaW5nOiB7XG4gICAgICAgICAgZW1haWw6ICdlbWFpbCcsXG4gICAgICAgICAgZ2l2ZW5fbmFtZTogJ2dpdmVuX25hbWUnLFxuICAgICAgICAgIGZhbWlseV9uYW1lOiAnZmFtaWx5X25hbWUnLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdjcmVhdGVzIENsb3VkRm9ybWF0aW9uIG91dHB1dHMnLCAoKSA9PiB7XG4gICAgICAvLyBPdXRwdXRzIGFyZSBjcmVhdGVkIGF0IHRoZSBjb25zdHJ1Y3QgbGV2ZWwgd2l0aCBDREsgaGFzaGVzXG4gICAgICBjb25zdCBvdXRwdXRzID0gdGVtcGxhdGUuZmluZE91dHB1dHMoJyonKTtcbiAgICAgIGNvbnN0IG91dHB1dEtleXMgPSBPYmplY3Qua2V5cyhvdXRwdXRzKTtcblxuICAgICAgLy8gQ2hlY2sgdGhhdCBvdXRwdXRzIHdpdGggdGhlIGNvcnJlY3QgcHJlZml4IGV4aXN0XG4gICAgICBleHBlY3Qob3V0cHV0S2V5cy5zb21lKChrZXkpID0+IGtleS5zdGFydHNXaXRoKCdUZXN0QXV0aFVzZXJQb29sSWQnKSkpLnRvQmUodHJ1ZSk7XG4gICAgICBleHBlY3Qob3V0cHV0S2V5cy5zb21lKChrZXkpID0+IGtleS5zdGFydHNXaXRoKCdUZXN0QXV0aFVzZXJQb29sQ2xpZW50SWQnKSkpLnRvQmUodHJ1ZSk7XG4gICAgICBleHBlY3Qob3V0cHV0S2V5cy5zb21lKChrZXkpID0+IGtleS5zdGFydHNXaXRoKCdUZXN0QXV0aENvZ25pdG9Eb21haW5QcmVmaXgnKSkpLnRvQmUodHJ1ZSk7XG4gICAgICBleHBlY3Qob3V0cHV0S2V5cy5zb21lKChrZXkpID0+IGtleS5zdGFydHNXaXRoKCdUZXN0QXV0aENvZ25pdG9Ib3N0ZWRVSVVSTCcpKSkudG9CZSh0cnVlKTtcbiAgICAgIGV4cGVjdChvdXRwdXRLZXlzLnNvbWUoKGtleSkgPT4ga2V5LnN0YXJ0c1dpdGgoJ1Rlc3RBdXRoQWRtaW5Hcm91cE5hbWUnKSkpLnRvQmUodHJ1ZSk7XG4gICAgICBleHBlY3Qob3V0cHV0S2V5cy5zb21lKChrZXkpID0+IGtleS5zdGFydHNXaXRoKCdUZXN0QXV0aE9BdXRoU2VjcmV0c1JlbWluZGVyJykpKS50b0JlKHRydWUpO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnUHJvZHVjdGlvbiBFbnZpcm9ubWVudCcsICgpID0+IHtcbiAgICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICAgIG5ldyBDb2duaXRvQXV0aENvbnN0cnVjdChzdGFjaywgJ1Rlc3RBdXRoJywge1xuICAgICAgICBlbnZpcm9ubWVudDogJ3Byb2QnLFxuICAgICAgICBkb21haW5QcmVmaXg6ICdhdXJhMjgtcHJvZCcsXG4gICAgICAgIGNhbGxiYWNrVXJsczogWydodHRwczovL2F1cmEyOC5jb20vYXV0aC9jYWxsYmFjayddLFxuICAgICAgICBsb2dvdXRVcmxzOiBbJ2h0dHBzOi8vYXVyYTI4LmNvbSddLFxuICAgICAgfSk7XG4gICAgICB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjayk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdjcmVhdGVzIGEgVXNlciBQb29sIHdpdGggcHJvZHVjdGlvbiBzZXR0aW5ncycsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpDb2duaXRvOjpVc2VyUG9vbCcsIHtcbiAgICAgICAgVXNlclBvb2xOYW1lOiAnYXVyYTI4LXByb2QtdXNlci1wb29sJyxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnY3JlYXRlcyBhZG1pbiBncm91cCBpbiB1c2VyIHBvb2wnLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6Q29nbml0bzo6VXNlclBvb2xHcm91cCcsIHtcbiAgICAgICAgR3JvdXBOYW1lOiAnYWRtaW4nLFxuICAgICAgICBEZXNjcmlwdGlvbjogJ0FkbWluaXN0cmF0b3IgdXNlcnMgd2l0aCBlbGV2YXRlZCBwcml2aWxlZ2VzJyxcbiAgICAgICAgUHJlY2VkZW5jZTogMSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnc2V0cyBSRVRBSU4gZGVsZXRpb24gcG9saWN5IGZvciBwcm9kdWN0aW9uJywgKCkgPT4ge1xuICAgICAgY29uc3QgdXNlclBvb2wgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKCdBV1M6OkNvZ25pdG86OlVzZXJQb29sJyk7XG4gICAgICBjb25zdCB1c2VyUG9vbEtleSA9IE9iamVjdC5rZXlzKHVzZXJQb29sKVswXTtcbiAgICAgIGV4cGVjdCh1c2VyUG9vbFt1c2VyUG9vbEtleV0uRGVsZXRpb25Qb2xpY3kpLnRvQmUoJ1JldGFpbicpO1xuICAgIH0pO1xuICB9KTtcbn0pO1xuIl19