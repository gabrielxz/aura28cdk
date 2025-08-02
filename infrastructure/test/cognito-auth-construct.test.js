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
                    assertions_1.Match.objectLike({
                        Name: 'birthTime',
                        AttributeDataType: 'String',
                        Mutable: true,
                    }),
                    assertions_1.Match.objectLike({
                        Name: 'birthPlace',
                        AttributeDataType: 'String',
                        Mutable: true,
                    }),
                    assertions_1.Match.objectLike({
                        Name: 'birthLatitude',
                        AttributeDataType: 'String',
                        Mutable: true,
                    }),
                    assertions_1.Match.objectLike({
                        Name: 'birthLongitude',
                        AttributeDataType: 'String',
                        Mutable: true,
                    }),
                    assertions_1.Match.objectLike({
                        Name: 'birthCity',
                        AttributeDataType: 'String',
                        Mutable: true,
                    }),
                    assertions_1.Match.objectLike({
                        Name: 'birthState',
                        AttributeDataType: 'String',
                        Mutable: true,
                    }),
                    assertions_1.Match.objectLike({
                        Name: 'birthCountry',
                        AttributeDataType: 'String',
                        Mutable: true,
                    }),
                    assertions_1.Match.objectLike({
                        Name: 'birthDate',
                        AttributeDataType: 'String',
                        Mutable: true,
                    }),
                    assertions_1.Match.objectLike({
                        Name: 'birthName',
                        AttributeDataType: 'String',
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
                AllowedOAuthScopes: ['email', 'openid', 'profile'],
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29nbml0by1hdXRoLWNvbnN0cnVjdC50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY29nbml0by1hdXRoLWNvbnN0cnVjdC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMsdURBQXlEO0FBQ3pELHFGQUFnRjtBQUVoRixRQUFRLENBQUMsc0JBQXNCLEVBQUUsR0FBRyxFQUFFO0lBQ3BDLElBQUksR0FBWSxDQUFDO0lBQ2pCLElBQUksS0FBZ0IsQ0FBQztJQUNyQixJQUFJLFFBQWtCLENBQUM7SUFFdkIsVUFBVSxDQUFDLEdBQUcsRUFBRTtRQUNkLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUNwQixLQUFLLEdBQUcsSUFBSSxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxXQUFXLEVBQUU7WUFDdEMsR0FBRyxFQUFFLEVBQUUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLEVBQUUsV0FBVyxFQUFFO1NBQ3RELENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0lBRUgsUUFBUSxDQUFDLHlCQUF5QixFQUFFLEdBQUcsRUFBRTtRQUN2QyxVQUFVLENBQUMsR0FBRyxFQUFFO1lBQ2QsSUFBSSw2Q0FBb0IsQ0FBQyxLQUFLLEVBQUUsVUFBVSxFQUFFO2dCQUMxQyxXQUFXLEVBQUUsS0FBSztnQkFDbEIsWUFBWSxFQUFFLFlBQVk7Z0JBQzFCLFlBQVksRUFBRTtvQkFDWixxQ0FBcUM7b0JBQ3JDLHNDQUFzQztpQkFDdkM7Z0JBQ0QsVUFBVSxFQUFFLENBQUMsdUJBQXVCLEVBQUUsd0JBQXdCLENBQUM7YUFDaEUsQ0FBQyxDQUFDO1lBQ0gsUUFBUSxHQUFHLHFCQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3ZDLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLDZCQUE2QixFQUFFLEdBQUcsRUFB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RUgsSUFBSSxDQUFDLDhDQUE4QyxFQUFFLEdBQUcsRUFBRTtZQUN4RCxRQUFRLENBQUMscUJBQXFCLENBQUMsd0JBQXdCLEVBQUU7Z0JBQ3ZELFlBQVksRUFBRSx1QkFBdUI7YUFDdEMsQ0FBQyxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsNENBQTRDLEVBQUUsR0FBRyxFQUFFO1lBQ3RELE1BQU0sUUFBUSxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsd0JBQXdCLENBQUMsQ0FBQztZQUNsRSxNQUFNLFdBQVcsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzdDLE1BQU0sQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLENBQUMsY0FBYyxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzlELENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBUZW1wbGF0ZSwgTWF0Y2ggfSBmcm9tICdhd3MtY2RrLWxpYi9hc3NlcnRpb25zJztcbmltcG9ydCB7IENvZ25pdG9BdXRoQ29uc3RydWN0IH0gZnJvbSAnLi4vbGliL2NvbnN0cnVjdHMvY29nbml0by1hdXRoLWNvbnN0cnVjdCc7XG5cbmRlc2NyaWJlKCdDb2duaXRvQXV0aENvbnN0cnVjdCcsICgpID0+IHtcbiAgbGV0IGFwcDogY2RrLkFwcDtcbiAgbGV0IHN0YWNrOiBjZGsuU3RhY2s7XG4gIGxldCB0ZW1wbGF0ZTogVGVtcGxhdGU7XG5cbiAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgYXBwID0gbmV3IGNkay5BcHAoKTtcbiAgICBzdGFjayA9IG5ldyBjZGsuU3RhY2soYXBwLCAnVGVzdFN0YWNrJywge1xuICAgICAgZW52OiB7IGFjY291bnQ6ICcxMjM0NTY3ODkwMTInLCByZWdpb246ICd1cy1lYXN0LTEnIH0sXG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdEZXZlbG9wbWVudCBFbnZpcm9ubWVudCcsICgpID0+IHtcbiAgICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICAgIG5ldyBDb2duaXRvQXV0aENvbnN0cnVjdChzdGFjaywgJ1Rlc3RBdXRoJywge1xuICAgICAgICBlbnZpcm9ubWVudDogJ2RldicsXG4gICAgICAgIGRvbWFpblByZWZpeDogJ2F1cmEyOC1kZXYnLFxuICAgICAgICBjYWxsYmFja1VybHM6IFtcbiAgICAgICAgICAnaHR0cDovL2xvY2FsaG9zdDozMDAwL2F1dGgvY2FsbGJhY2snLFxuICAgICAgICAgICdodHRwczovL2Rldi5hdXJhMjguY29tL2F1dGgvY2FsbGJhY2snLFxuICAgICAgICBdLFxuICAgICAgICBsb2dvdXRVcmxzOiBbJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMCcsICdodHRwczovL2Rldi5hdXJhMjguY29tJ10sXG4gICAgICB9KTtcbiAgICAgIHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ2NyZWF0ZXMgYSBDb2duaXRvIFVzZXIgUG9vbCcsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpDb2duaXRvOjpVc2VyUG9vbCcsIHtcbiAgICAgICAgVXNlclBvb2xOYW1lOiAnYXVyYTI4LWRldi11c2VyLXBvb2wnLFxuICAgICAgICBQb2xpY2llczoge1xuICAgICAgICAgIFBhc3N3b3JkUG9saWN5OiB7XG4gICAgICAgICAgICBNaW5pbXVtTGVuZ3RoOiA4LFxuICAgICAgICAgICAgUmVxdWlyZUxvd2VyY2FzZTogdHJ1ZSxcbiAgICAgICAgICAgIFJlcXVpcmVVcHBlcmNhc2U6IHRydWUsXG4gICAgICAgICAgICBSZXF1aXJlTnVtYmVyczogdHJ1ZSxcbiAgICAgICAgICAgIFJlcXVpcmVTeW1ib2xzOiBmYWxzZSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICBTY2hlbWE6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICBOYW1lOiAnZW1haWwnLFxuICAgICAgICAgICAgUmVxdWlyZWQ6IHRydWUsXG4gICAgICAgICAgICBNdXRhYmxlOiB0cnVlLFxuICAgICAgICAgIH0pLFxuICAgICAgICAgIE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgICAgTmFtZTogJ2JpcnRoZGF0ZScsXG4gICAgICAgICAgICBSZXF1aXJlZDogZmFsc2UsXG4gICAgICAgICAgICBNdXRhYmxlOiB0cnVlLFxuICAgICAgICAgIH0pLFxuICAgICAgICAgIE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgICAgTmFtZTogJ2JpcnRoVGltZScsXG4gICAgICAgICAgICBBdHRyaWJ1dGVEYXRhVHlwZTogJ1N0cmluZycsXG4gICAgICAgICAgICBNdXRhYmxlOiB0cnVlLFxuICAgICAgICAgIH0pLFxuICAgICAgICAgIE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgICAgTmFtZTogJ2JpcnRoUGxhY2UnLFxuICAgICAgICAgICAgQXR0cmlidXRlRGF0YVR5cGU6ICdTdHJpbmcnLFxuICAgICAgICAgICAgTXV0YWJsZTogdHJ1ZSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgIE5hbWU6ICdiaXJ0aExhdGl0dWRlJyxcbiAgICAgICAgICAgIEF0dHJpYnV0ZURhdGFUeXBlOiAnU3RyaW5nJyxcbiAgICAgICAgICAgIE11dGFibGU6IHRydWUsXG4gICAgICAgICAgfSksXG4gICAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICBOYW1lOiAnYmlydGhMb25naXR1ZGUnLFxuICAgICAgICAgICAgQXR0cmlidXRlRGF0YVR5cGU6ICdTdHJpbmcnLFxuICAgICAgICAgICAgTXV0YWJsZTogdHJ1ZSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgIE5hbWU6ICdiaXJ0aENpdHknLFxuICAgICAgICAgICAgQXR0cmlidXRlRGF0YVR5cGU6ICdTdHJpbmcnLFxuICAgICAgICAgICAgTXV0YWJsZTogdHJ1ZSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgIE5hbWU6ICdiaXJ0aFN0YXRlJyxcbiAgICAgICAgICAgIEF0dHJpYnV0ZURhdGFUeXBlOiAnU3RyaW5nJyxcbiAgICAgICAgICAgIE11dGFibGU6IHRydWUsXG4gICAgICAgICAgfSksXG4gICAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICBOYW1lOiAnYmlydGhDb3VudHJ5JyxcbiAgICAgICAgICAgIEF0dHJpYnV0ZURhdGFUeXBlOiAnU3RyaW5nJyxcbiAgICAgICAgICAgIE11dGFibGU6IHRydWUsXG4gICAgICAgICAgfSksXG4gICAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICBOYW1lOiAnYmlydGhEYXRlJyxcbiAgICAgICAgICAgIEF0dHJpYnV0ZURhdGFUeXBlOiAnU3RyaW5nJyxcbiAgICAgICAgICAgIE11dGFibGU6IHRydWUsXG4gICAgICAgICAgfSksXG4gICAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICBOYW1lOiAnYmlydGhOYW1lJyxcbiAgICAgICAgICAgIEF0dHJpYnV0ZURhdGFUeXBlOiAnU3RyaW5nJyxcbiAgICAgICAgICAgIE11dGFibGU6IHRydWUsXG4gICAgICAgICAgfSksXG4gICAgICAgIF0pLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdjcmVhdGVzIGEgQ29nbml0byBVc2VyIFBvb2wgRG9tYWluJywgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkNvZ25pdG86OlVzZXJQb29sRG9tYWluJywge1xuICAgICAgICBEb21haW46ICdhdXJhMjgtZGV2JyxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnY3JlYXRlcyBhIENvZ25pdG8gVXNlciBQb29sIENsaWVudCcsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpDb2duaXRvOjpVc2VyUG9vbENsaWVudCcsIHtcbiAgICAgICAgQ2xpZW50TmFtZTogJ2F1cmEyOC1kZXYtY2xpZW50JyxcbiAgICAgICAgR2VuZXJhdGVTZWNyZXQ6IGZhbHNlLFxuICAgICAgICBFeHBsaWNpdEF1dGhGbG93czogTWF0Y2guYXJyYXlXaXRoKFsnQUxMT1dfVVNFUl9QQVNTV09SRF9BVVRIJywgJ0FMTE9XX1VTRVJfU1JQX0FVVEgnXSksXG4gICAgICAgIEFsbG93ZWRPQXV0aEZsb3dzOiBbJ2NvZGUnXSxcbiAgICAgICAgQWxsb3dlZE9BdXRoU2NvcGVzOiBbJ2VtYWlsJywgJ29wZW5pZCcsICdwcm9maWxlJ10sXG4gICAgICAgIENhbGxiYWNrVVJMczogW1xuICAgICAgICAgICdodHRwOi8vbG9jYWxob3N0OjMwMDAvYXV0aC9jYWxsYmFjaycsXG4gICAgICAgICAgJ2h0dHBzOi8vZGV2LmF1cmEyOC5jb20vYXV0aC9jYWxsYmFjaycsXG4gICAgICAgIF0sXG4gICAgICAgIExvZ291dFVSTHM6IFsnaHR0cDovL2xvY2FsaG9zdDozMDAwJywgJ2h0dHBzOi8vZGV2LmF1cmEyOC5jb20nXSxcbiAgICAgICAgU3VwcG9ydGVkSWRlbnRpdHlQcm92aWRlcnM6IFsnQ09HTklUTyddLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdjcmVhdGVzIHBsYWNlaG9sZGVyIHNlY3JldHMgZm9yIE9BdXRoIHByb3ZpZGVycycsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpTZWNyZXRzTWFuYWdlcjo6U2VjcmV0Jywge1xuICAgICAgICBOYW1lOiAnYXVyYTI4L29hdXRoL2dvb2dsZS9kZXYnLFxuICAgICAgICBEZXNjcmlwdGlvbjogJ0dvb2dsZSBPQXV0aCBjcmVkZW50aWFscyAodG8gYmUgcG9wdWxhdGVkIG1hbnVhbGx5KScsXG4gICAgICB9KTtcblxuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OlNlY3JldHNNYW5hZ2VyOjpTZWNyZXQnLCB7XG4gICAgICAgIE5hbWU6ICdhdXJhMjgvb2F1dGgvZmFjZWJvb2svZGV2JyxcbiAgICAgICAgRGVzY3JpcHRpb246ICdGYWNlYm9vayBPQXV0aCBjcmVkZW50aWFscyAodG8gYmUgcG9wdWxhdGVkIG1hbnVhbGx5KScsXG4gICAgICB9KTtcblxuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OlNlY3JldHNNYW5hZ2VyOjpTZWNyZXQnLCB7XG4gICAgICAgIE5hbWU6ICdhdXJhMjgvb2F1dGgvYXBwbGUvZGV2JyxcbiAgICAgICAgRGVzY3JpcHRpb246ICdBcHBsZSBPQXV0aCBjcmVkZW50aWFscyAodG8gYmUgcG9wdWxhdGVkIG1hbnVhbGx5KScsXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ2NyZWF0ZXMgQ2xvdWRGb3JtYXRpb24gb3V0cHV0cycsICgpID0+IHtcbiAgICAgIC8vIE91dHB1dHMgYXJlIGNyZWF0ZWQgYXQgdGhlIGNvbnN0cnVjdCBsZXZlbCB3aXRoIENESyBoYXNoZXNcbiAgICAgIGNvbnN0IG91dHB1dHMgPSB0ZW1wbGF0ZS5maW5kT3V0cHV0cygnKicpO1xuICAgICAgY29uc3Qgb3V0cHV0S2V5cyA9IE9iamVjdC5rZXlzKG91dHB1dHMpO1xuXG4gICAgICAvLyBDaGVjayB0aGF0IG91dHB1dHMgd2l0aCB0aGUgY29ycmVjdCBwcmVmaXggZXhpc3RcbiAgICAgIGV4cGVjdChvdXRwdXRLZXlzLnNvbWUoKGtleSkgPT4ga2V5LnN0YXJ0c1dpdGgoJ1Rlc3RBdXRoVXNlclBvb2xJZCcpKSkudG9CZSh0cnVlKTtcbiAgICAgIGV4cGVjdChvdXRwdXRLZXlzLnNvbWUoKGtleSkgPT4ga2V5LnN0YXJ0c1dpdGgoJ1Rlc3RBdXRoVXNlclBvb2xDbGllbnRJZCcpKSkudG9CZSh0cnVlKTtcbiAgICAgIGV4cGVjdChvdXRwdXRLZXlzLnNvbWUoKGtleSkgPT4ga2V5LnN0YXJ0c1dpdGgoJ1Rlc3RBdXRoQ29nbml0b0RvbWFpblByZWZpeCcpKSkudG9CZSh0cnVlKTtcbiAgICAgIGV4cGVjdChvdXRwdXRLZXlzLnNvbWUoKGtleSkgPT4ga2V5LnN0YXJ0c1dpdGgoJ1Rlc3RBdXRoQ29nbml0b0hvc3RlZFVJVVJMJykpKS50b0JlKHRydWUpO1xuICAgICAgZXhwZWN0KG91dHB1dEtleXMuc29tZSgoa2V5KSA9PiBrZXkuc3RhcnRzV2l0aCgnVGVzdEF1dGhPQXV0aFNlY3JldHNSZW1pbmRlcicpKSkudG9CZSh0cnVlKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ1Byb2R1Y3Rpb24gRW52aXJvbm1lbnQnLCAoKSA9PiB7XG4gICAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgICBuZXcgQ29nbml0b0F1dGhDb25zdHJ1Y3Qoc3RhY2ssICdUZXN0QXV0aCcsIHtcbiAgICAgICAgZW52aXJvbm1lbnQ6ICdwcm9kJyxcbiAgICAgICAgZG9tYWluUHJlZml4OiAnYXVyYTI4LXByb2QnLFxuICAgICAgICBjYWxsYmFja1VybHM6IFsnaHR0cHM6Ly9hdXJhMjguY29tL2F1dGgvY2FsbGJhY2snXSxcbiAgICAgICAgbG9nb3V0VXJsczogWydodHRwczovL2F1cmEyOC5jb20nXSxcbiAgICAgIH0pO1xuICAgICAgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnY3JlYXRlcyBhIFVzZXIgUG9vbCB3aXRoIHByb2R1Y3Rpb24gc2V0dGluZ3MnLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6Q29nbml0bzo6VXNlclBvb2wnLCB7XG4gICAgICAgIFVzZXJQb29sTmFtZTogJ2F1cmEyOC1wcm9kLXVzZXItcG9vbCcsXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ3NldHMgUkVUQUlOIGRlbGV0aW9uIHBvbGljeSBmb3IgcHJvZHVjdGlvbicsICgpID0+IHtcbiAgICAgIGNvbnN0IHVzZXJQb29sID0gdGVtcGxhdGUuZmluZFJlc291cmNlcygnQVdTOjpDb2duaXRvOjpVc2VyUG9vbCcpO1xuICAgICAgY29uc3QgdXNlclBvb2xLZXkgPSBPYmplY3Qua2V5cyh1c2VyUG9vbClbMF07XG4gICAgICBleHBlY3QodXNlclBvb2xbdXNlclBvb2xLZXldLkRlbGV0aW9uUG9saWN5KS50b0JlKCdSZXRhaW4nKTtcbiAgICB9KTtcbiAgfSk7XG59KTtcbiJdfQ==