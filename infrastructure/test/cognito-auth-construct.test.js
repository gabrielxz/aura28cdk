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
                SupportedIdentityProviders: ['COGNITO'],
            });
        });
        test('creates placeholder secrets for OAuth providers', () => {
            template.hasResourceProperties('AWS::SecretsManager::Secret', {
                Name: 'aura28/oauth/google/dev',
                Description: 'Google OAuth credentials (to be populated manually)',
            });
            template.hasResourceProperties('AWS::SecretsManager::Secret', {
                Name: 'aura28/oauth/facebook/dev',
                Description: 'Facebook OAuth credentials (to be populated manually)',
            });
            template.hasResourceProperties('AWS::SecretsManager::Secret', {
                Name: 'aura28/oauth/apple/dev',
                Description: 'Apple OAuth credentials (to be populated manually)',
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
        test('sets RETAIN deletion policy for production', () => {
            const userPool = template.findResources('AWS::Cognito::UserPool');
            const userPoolKey = Object.keys(userPool)[0];
            expect(userPool[userPoolKey].DeletionPolicy).toBe('Retain');
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29nbml0by1hdXRoLWNvbnN0cnVjdC50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY29nbml0by1hdXRoLWNvbnN0cnVjdC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMsdURBQXlEO0FBQ3pELHFGQUFnRjtBQUVoRixRQUFRLENBQUMsc0JBQXNCLEVBQUUsR0FBRyxFQUFFO0lBQ3BDLElBQUksR0FBWSxDQUFDO0lBQ2pCLElBQUksS0FBZ0IsQ0FBQztJQUNyQixJQUFJLFFBQWtCLENBQUM7SUFFdkIsVUFBVSxDQUFDLEdBQUcsRUFBRTtRQUNkLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUNwQixLQUFLLEdBQUcsSUFBSSxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxXQUFXLEVBQUU7WUFDdEMsR0FBRyxFQUFFLEVBQUUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLEVBQUUsV0FBVyxFQUFFO1NBQ3RELENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0lBRUgsUUFBUSxDQUFDLHlCQUF5QixFQUFFLEdBQUcsRUFBRTtRQUN2QyxVQUFVLENBQUMsR0FBRyxFQUFFO1lBQ2QsSUFBSSw2Q0FBb0IsQ0FBQyxLQUFLLEVBQUUsVUFBVSxFQUFFO2dCQUMxQyxXQUFXLEVBQUUsS0FBSztnQkFDbEIsWUFBWSxFQUFFLFlBQVk7Z0JBQzFCLFlBQVksRUFBRTtvQkFDWixxQ0FBcUM7b0JBQ3JDLHNDQUFzQztpQkFDdkM7Z0JBQ0QsVUFBVSxFQUFFLENBQUMsdUJBQXVCLEVBQUUsd0JBQXdCLENBQUM7YUFDaEUsQ0FBQyxDQUFDO1lBQ0gsUUFBUSxHQUFHLHFCQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3ZDLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLDZCQUE2QixFQUFFLEdBQUcsRUFB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WUFDeEQsUUFBUSxDQUFDLHFCQUFxQixDQUFDLHdCQUF3QixFQUFFO2dCQUN2RCxZQUFZLEVBQUUsdUJBQXVCO2FBQ3RDLENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLDRDQUE0QyxFQUFFLEdBQUcsRUFBRTtZQUN0RCxNQUFNLFFBQVEsR0FBRyxRQUFRLENBQUMsYUFBYSxDQUFDLHdCQUF3QixDQUFDLENBQUM7WUFDbEUsTUFBTSxXQUFXLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUM3QyxNQUFNLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUM5RCxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgVGVtcGxhdGUsIE1hdGNoIH0gZnJvbSAnYXdzLWNkay1saWIvYXNzZXJ0aW9ucyc7XG5pbXBvcnQgeyBDb2duaXRvQXV0aENvbnN0cnVjdCB9IGZyb20gJy4uL2xpYi9jb25zdHJ1Y3RzL2NvZ25pdG8tYXV0aC1jb25zdHJ1Y3QnO1xuXG5kZXNjcmliZSgnQ29nbml0b0F1dGhDb25zdHJ1Y3QnLCAoKSA9PiB7XG4gIGxldCBhcHA6IGNkay5BcHA7XG4gIGxldCBzdGFjazogY2RrLlN0YWNrO1xuICBsZXQgdGVtcGxhdGU6IFRlbXBsYXRlO1xuXG4gIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgIGFwcCA9IG5ldyBjZGsuQXBwKCk7XG4gICAgc3RhY2sgPSBuZXcgY2RrLlN0YWNrKGFwcCwgJ1Rlc3RTdGFjaycsIHtcbiAgICAgIGVudjogeyBhY2NvdW50OiAnMTIzNDU2Nzg5MDEyJywgcmVnaW9uOiAndXMtZWFzdC0xJyB9LFxuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnRGV2ZWxvcG1lbnQgRW52aXJvbm1lbnQnLCAoKSA9PiB7XG4gICAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgICBuZXcgQ29nbml0b0F1dGhDb25zdHJ1Y3Qoc3RhY2ssICdUZXN0QXV0aCcsIHtcbiAgICAgICAgZW52aXJvbm1lbnQ6ICdkZXYnLFxuICAgICAgICBkb21haW5QcmVmaXg6ICdhdXJhMjgtZGV2JyxcbiAgICAgICAgY2FsbGJhY2tVcmxzOiBbXG4gICAgICAgICAgJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMC9hdXRoL2NhbGxiYWNrJyxcbiAgICAgICAgICAnaHR0cHM6Ly9kZXYuYXVyYTI4LmNvbS9hdXRoL2NhbGxiYWNrJyxcbiAgICAgICAgXSxcbiAgICAgICAgbG9nb3V0VXJsczogWydodHRwOi8vbG9jYWxob3N0OjMwMDAnLCAnaHR0cHM6Ly9kZXYuYXVyYTI4LmNvbSddLFxuICAgICAgfSk7XG4gICAgICB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjayk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdjcmVhdGVzIGEgQ29nbml0byBVc2VyIFBvb2wnLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6Q29nbml0bzo6VXNlclBvb2wnLCB7XG4gICAgICAgIFVzZXJQb29sTmFtZTogJ2F1cmEyOC1kZXYtdXNlci1wb29sJyxcbiAgICAgICAgUG9saWNpZXM6IHtcbiAgICAgICAgICBQYXNzd29yZFBvbGljeToge1xuICAgICAgICAgICAgTWluaW11bUxlbmd0aDogOCxcbiAgICAgICAgICAgIFJlcXVpcmVMb3dlcmNhc2U6IHRydWUsXG4gICAgICAgICAgICBSZXF1aXJlVXBwZXJjYXNlOiB0cnVlLFxuICAgICAgICAgICAgUmVxdWlyZU51bWJlcnM6IHRydWUsXG4gICAgICAgICAgICBSZXF1aXJlU3ltYm9sczogZmFsc2UsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgU2NoZW1hOiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgIE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgICAgTmFtZTogJ2VtYWlsJyxcbiAgICAgICAgICAgIFJlcXVpcmVkOiB0cnVlLFxuICAgICAgICAgICAgTXV0YWJsZTogdHJ1ZSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgIE5hbWU6ICdiaXJ0aGRhdGUnLFxuICAgICAgICAgICAgUmVxdWlyZWQ6IGZhbHNlLFxuICAgICAgICAgICAgTXV0YWJsZTogdHJ1ZSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgXSksXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ2NyZWF0ZXMgYSBDb2duaXRvIFVzZXIgUG9vbCBEb21haW4nLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6Q29nbml0bzo6VXNlclBvb2xEb21haW4nLCB7XG4gICAgICAgIERvbWFpbjogJ2F1cmEyOC1kZXYnLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdjcmVhdGVzIGEgQ29nbml0byBVc2VyIFBvb2wgQ2xpZW50JywgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkNvZ25pdG86OlVzZXJQb29sQ2xpZW50Jywge1xuICAgICAgICBDbGllbnROYW1lOiAnYXVyYTI4LWRldi1jbGllbnQnLFxuICAgICAgICBHZW5lcmF0ZVNlY3JldDogZmFsc2UsXG4gICAgICAgIEV4cGxpY2l0QXV0aEZsb3dzOiBNYXRjaC5hcnJheVdpdGgoWydBTExPV19VU0VSX1BBU1NXT1JEX0FVVEgnLCAnQUxMT1dfVVNFUl9TUlBfQVVUSCddKSxcbiAgICAgICAgQWxsb3dlZE9BdXRoRmxvd3M6IFsnY29kZSddLFxuICAgICAgICBBbGxvd2VkT0F1dGhTY29wZXM6IFsnZW1haWwnLCAnb3BlbmlkJywgJ3Byb2ZpbGUnLCAnYXdzLmNvZ25pdG8uc2lnbmluLnVzZXIuYWRtaW4nXSxcbiAgICAgICAgQ2FsbGJhY2tVUkxzOiBbXG4gICAgICAgICAgJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMC9hdXRoL2NhbGxiYWNrJyxcbiAgICAgICAgICAnaHR0cHM6Ly9kZXYuYXVyYTI4LmNvbS9hdXRoL2NhbGxiYWNrJyxcbiAgICAgICAgXSxcbiAgICAgICAgTG9nb3V0VVJMczogWydodHRwOi8vbG9jYWxob3N0OjMwMDAnLCAnaHR0cHM6Ly9kZXYuYXVyYTI4LmNvbSddLFxuICAgICAgICBTdXBwb3J0ZWRJZGVudGl0eVByb3ZpZGVyczogWydDT0dOSVRPJ10sXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ2NyZWF0ZXMgcGxhY2Vob2xkZXIgc2VjcmV0cyBmb3IgT0F1dGggcHJvdmlkZXJzJywgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OlNlY3JldHNNYW5hZ2VyOjpTZWNyZXQnLCB7XG4gICAgICAgIE5hbWU6ICdhdXJhMjgvb2F1dGgvZ29vZ2xlL2RldicsXG4gICAgICAgIERlc2NyaXB0aW9uOiAnR29vZ2xlIE9BdXRoIGNyZWRlbnRpYWxzICh0byBiZSBwb3B1bGF0ZWQgbWFudWFsbHkpJyxcbiAgICAgIH0pO1xuXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6U2VjcmV0c01hbmFnZXI6OlNlY3JldCcsIHtcbiAgICAgICAgTmFtZTogJ2F1cmEyOC9vYXV0aC9mYWNlYm9vay9kZXYnLFxuICAgICAgICBEZXNjcmlwdGlvbjogJ0ZhY2Vib29rIE9BdXRoIGNyZWRlbnRpYWxzICh0byBiZSBwb3B1bGF0ZWQgbWFudWFsbHkpJyxcbiAgICAgIH0pO1xuXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6U2VjcmV0c01hbmFnZXI6OlNlY3JldCcsIHtcbiAgICAgICAgTmFtZTogJ2F1cmEyOC9vYXV0aC9hcHBsZS9kZXYnLFxuICAgICAgICBEZXNjcmlwdGlvbjogJ0FwcGxlIE9BdXRoIGNyZWRlbnRpYWxzICh0byBiZSBwb3B1bGF0ZWQgbWFudWFsbHkpJyxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnY3JlYXRlcyBDbG91ZEZvcm1hdGlvbiBvdXRwdXRzJywgKCkgPT4ge1xuICAgICAgLy8gT3V0cHV0cyBhcmUgY3JlYXRlZCBhdCB0aGUgY29uc3RydWN0IGxldmVsIHdpdGggQ0RLIGhhc2hlc1xuICAgICAgY29uc3Qgb3V0cHV0cyA9IHRlbXBsYXRlLmZpbmRPdXRwdXRzKCcqJyk7XG4gICAgICBjb25zdCBvdXRwdXRLZXlzID0gT2JqZWN0LmtleXMob3V0cHV0cyk7XG5cbiAgICAgIC8vIENoZWNrIHRoYXQgb3V0cHV0cyB3aXRoIHRoZSBjb3JyZWN0IHByZWZpeCBleGlzdFxuICAgICAgZXhwZWN0KG91dHB1dEtleXMuc29tZSgoa2V5KSA9PiBrZXkuc3RhcnRzV2l0aCgnVGVzdEF1dGhVc2VyUG9vbElkJykpKS50b0JlKHRydWUpO1xuICAgICAgZXhwZWN0KG91dHB1dEtleXMuc29tZSgoa2V5KSA9PiBrZXkuc3RhcnRzV2l0aCgnVGVzdEF1dGhVc2VyUG9vbENsaWVudElkJykpKS50b0JlKHRydWUpO1xuICAgICAgZXhwZWN0KG91dHB1dEtleXMuc29tZSgoa2V5KSA9PiBrZXkuc3RhcnRzV2l0aCgnVGVzdEF1dGhDb2duaXRvRG9tYWluUHJlZml4JykpKS50b0JlKHRydWUpO1xuICAgICAgZXhwZWN0KG91dHB1dEtleXMuc29tZSgoa2V5KSA9PiBrZXkuc3RhcnRzV2l0aCgnVGVzdEF1dGhDb2duaXRvSG9zdGVkVUlVUkwnKSkpLnRvQmUodHJ1ZSk7XG4gICAgICBleHBlY3Qob3V0cHV0S2V5cy5zb21lKChrZXkpID0+IGtleS5zdGFydHNXaXRoKCdUZXN0QXV0aE9BdXRoU2VjcmV0c1JlbWluZGVyJykpKS50b0JlKHRydWUpO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnUHJvZHVjdGlvbiBFbnZpcm9ubWVudCcsICgpID0+IHtcbiAgICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICAgIG5ldyBDb2duaXRvQXV0aENvbnN0cnVjdChzdGFjaywgJ1Rlc3RBdXRoJywge1xuICAgICAgICBlbnZpcm9ubWVudDogJ3Byb2QnLFxuICAgICAgICBkb21haW5QcmVmaXg6ICdhdXJhMjgtcHJvZCcsXG4gICAgICAgIGNhbGxiYWNrVXJsczogWydodHRwczovL2F1cmEyOC5jb20vYXV0aC9jYWxsYmFjayddLFxuICAgICAgICBsb2dvdXRVcmxzOiBbJ2h0dHBzOi8vYXVyYTI4LmNvbSddLFxuICAgICAgfSk7XG4gICAgICB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjayk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdjcmVhdGVzIGEgVXNlciBQb29sIHdpdGggcHJvZHVjdGlvbiBzZXR0aW5ncycsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpDb2duaXRvOjpVc2VyUG9vbCcsIHtcbiAgICAgICAgVXNlclBvb2xOYW1lOiAnYXVyYTI4LXByb2QtdXNlci1wb29sJyxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnc2V0cyBSRVRBSU4gZGVsZXRpb24gcG9saWN5IGZvciBwcm9kdWN0aW9uJywgKCkgPT4ge1xuICAgICAgY29uc3QgdXNlclBvb2wgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKCdBV1M6OkNvZ25pdG86OlVzZXJQb29sJyk7XG4gICAgICBjb25zdCB1c2VyUG9vbEtleSA9IE9iamVjdC5rZXlzKHVzZXJQb29sKVswXTtcbiAgICAgIGV4cGVjdCh1c2VyUG9vbFt1c2VyUG9vbEtleV0uRGVsZXRpb25Qb2xpY3kpLnRvQmUoJ1JldGFpbicpO1xuICAgIH0pO1xuICB9KTtcbn0pO1xuIl19