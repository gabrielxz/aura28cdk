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
        test('creates admin group in user pool', () => {
            template.hasResourceProperties('AWS::Cognito::UserPoolGroup', {
                GroupName: 'admin',
                Description: 'Administrator users with elevated privileges',
                Precedence: 1,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29nbml0by1hdXRoLWNvbnN0cnVjdC50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY29nbml0by1hdXRoLWNvbnN0cnVjdC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMsdURBQXlEO0FBQ3pELHFGQUFnRjtBQUVoRixRQUFRLENBQUMsc0JBQXNCLEVBQUUsR0FBRyxFQUFFO0lBQ3BDLElBQUksR0FBWSxDQUFDO0lBQ2pCLElBQUksS0FBZ0IsQ0FBQztJQUNyQixJQUFJLFFBQWtCLENBQUM7SUFFdkIsVUFBVSxDQUFDLEdBQUcsRUFBRTtRQUNkLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUNwQixLQUFLLEdBQUcsSUFBSSxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxXQUFXLEVBQUU7WUFDdEMsR0FBRyxFQUFFLEVBQUUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLEVBQUUsV0FBVyxFQUFFO1NBQ3RELENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0lBRUgsUUFBUSxDQUFDLHlCQUF5QixFQUFFLEdBQUcsRUFBRTtRQUN2QyxVQUFVLENBQUMsR0FBRyxFQUFFO1lBQ2QsSUFBSSw2Q0FBb0IsQ0FBQyxLQUFLLEVBQUUsVUFBVSxFQUFFO2dCQUMxQyxXQUFXLEVBQUUsS0FBSztnQkFDbEIsWUFBWSxFQUFFLFlBQVk7Z0JBQzFCLFlBQVksRUFBRTtvQkFDWixxQ0FBcUM7b0JBQ3JDLHNDQUFzQztpQkFDdkM7Z0JBQ0QsVUFBVSxFQUFFLENBQUMsdUJBQXVCLEVBQUUsd0JBQXdCLENBQUM7YUFDaEUsQ0FBQyxDQUFDO1lBQ0gsUUFBUSxHQUFHLHFCQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3ZDLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLDZCQUE2QixFQUFFLEdBQUcsRUFB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Iiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IFRlbXBsYXRlLCBNYXRjaCB9IGZyb20gJ2F3cy1jZGstbGliL2Fzc2VydGlvbnMnO1xuaW1wb3J0IHsgQ29nbml0b0F1dGhDb25zdHJ1Y3QgfSBmcm9tICcuLi9saWIvY29uc3RydWN0cy9jb2duaXRvLWF1dGgtY29uc3RydWN0JztcblxuZGVzY3JpYmUoJ0NvZ25pdG9BdXRoQ29uc3RydWN0JywgKCkgPT4ge1xuICBsZXQgYXBwOiBjZGsuQXBwO1xuICBsZXQgc3RhY2s6IGNkay5TdGFjaztcbiAgbGV0IHRlbXBsYXRlOiBUZW1wbGF0ZTtcblxuICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICBhcHAgPSBuZXcgY2RrLkFwcCgpO1xuICAgIHN0YWNrID0gbmV3IGNkay5TdGFjayhhcHAsICdUZXN0U3RhY2snLCB7XG4gICAgICBlbnY6IHsgYWNjb3VudDogJzEyMzQ1Njc4OTAxMicsIHJlZ2lvbjogJ3VzLWVhc3QtMScgfSxcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0RldmVsb3BtZW50IEVudmlyb25tZW50JywgKCkgPT4ge1xuICAgIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgICAgbmV3IENvZ25pdG9BdXRoQ29uc3RydWN0KHN0YWNrLCAnVGVzdEF1dGgnLCB7XG4gICAgICAgIGVudmlyb25tZW50OiAnZGV2JyxcbiAgICAgICAgZG9tYWluUHJlZml4OiAnYXVyYTI4LWRldicsXG4gICAgICAgIGNhbGxiYWNrVXJsczogW1xuICAgICAgICAgICdodHRwOi8vbG9jYWxob3N0OjMwMDAvYXV0aC9jYWxsYmFjaycsXG4gICAgICAgICAgJ2h0dHBzOi8vZGV2LmF1cmEyOC5jb20vYXV0aC9jYWxsYmFjaycsXG4gICAgICAgIF0sXG4gICAgICAgIGxvZ291dFVybHM6IFsnaHR0cDovL2xvY2FsaG9zdDozMDAwJywgJ2h0dHBzOi8vZGV2LmF1cmEyOC5jb20nXSxcbiAgICAgIH0pO1xuICAgICAgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnY3JlYXRlcyBhIENvZ25pdG8gVXNlciBQb29sJywgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkNvZ25pdG86OlVzZXJQb29sJywge1xuICAgICAgICBVc2VyUG9vbE5hbWU6ICdhdXJhMjgtZGV2LXVzZXItcG9vbCcsXG4gICAgICAgIFBvbGljaWVzOiB7XG4gICAgICAgICAgUGFzc3dvcmRQb2xpY3k6IHtcbiAgICAgICAgICAgIE1pbmltdW1MZW5ndGg6IDgsXG4gICAgICAgICAgICBSZXF1aXJlTG93ZXJjYXNlOiB0cnVlLFxuICAgICAgICAgICAgUmVxdWlyZVVwcGVyY2FzZTogdHJ1ZSxcbiAgICAgICAgICAgIFJlcXVpcmVOdW1iZXJzOiB0cnVlLFxuICAgICAgICAgICAgUmVxdWlyZVN5bWJvbHM6IGZhbHNlLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIFNjaGVtYTogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgIE5hbWU6ICdlbWFpbCcsXG4gICAgICAgICAgICBSZXF1aXJlZDogdHJ1ZSxcbiAgICAgICAgICAgIE11dGFibGU6IHRydWUsXG4gICAgICAgICAgfSksXG4gICAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICBOYW1lOiAnYmlydGhkYXRlJyxcbiAgICAgICAgICAgIFJlcXVpcmVkOiBmYWxzZSxcbiAgICAgICAgICAgIE11dGFibGU6IHRydWUsXG4gICAgICAgICAgfSksXG4gICAgICAgIF0pLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdjcmVhdGVzIGEgQ29nbml0byBVc2VyIFBvb2wgRG9tYWluJywgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkNvZ25pdG86OlVzZXJQb29sRG9tYWluJywge1xuICAgICAgICBEb21haW46ICdhdXJhMjgtZGV2JyxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnY3JlYXRlcyBhIENvZ25pdG8gVXNlciBQb29sIENsaWVudCcsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpDb2duaXRvOjpVc2VyUG9vbENsaWVudCcsIHtcbiAgICAgICAgQ2xpZW50TmFtZTogJ2F1cmEyOC1kZXYtY2xpZW50JyxcbiAgICAgICAgR2VuZXJhdGVTZWNyZXQ6IGZhbHNlLFxuICAgICAgICBFeHBsaWNpdEF1dGhGbG93czogTWF0Y2guYXJyYXlXaXRoKFsnQUxMT1dfVVNFUl9QQVNTV09SRF9BVVRIJywgJ0FMTE9XX1VTRVJfU1JQX0FVVEgnXSksXG4gICAgICAgIEFsbG93ZWRPQXV0aEZsb3dzOiBbJ2NvZGUnXSxcbiAgICAgICAgQWxsb3dlZE9BdXRoU2NvcGVzOiBbJ2VtYWlsJywgJ29wZW5pZCcsICdwcm9maWxlJywgJ2F3cy5jb2duaXRvLnNpZ25pbi51c2VyLmFkbWluJ10sXG4gICAgICAgIENhbGxiYWNrVVJMczogW1xuICAgICAgICAgICdodHRwOi8vbG9jYWxob3N0OjMwMDAvYXV0aC9jYWxsYmFjaycsXG4gICAgICAgICAgJ2h0dHBzOi8vZGV2LmF1cmEyOC5jb20vYXV0aC9jYWxsYmFjaycsXG4gICAgICAgIF0sXG4gICAgICAgIExvZ291dFVSTHM6IFsnaHR0cDovL2xvY2FsaG9zdDozMDAwJywgJ2h0dHBzOi8vZGV2LmF1cmEyOC5jb20nXSxcbiAgICAgICAgU3VwcG9ydGVkSWRlbnRpdHlQcm92aWRlcnM6IFsnQ09HTklUTyddLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdjcmVhdGVzIGFkbWluIGdyb3VwIGluIHVzZXIgcG9vbCcsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpDb2duaXRvOjpVc2VyUG9vbEdyb3VwJywge1xuICAgICAgICBHcm91cE5hbWU6ICdhZG1pbicsXG4gICAgICAgIERlc2NyaXB0aW9uOiAnQWRtaW5pc3RyYXRvciB1c2VycyB3aXRoIGVsZXZhdGVkIHByaXZpbGVnZXMnLFxuICAgICAgICBQcmVjZWRlbmNlOiAxLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdjcmVhdGVzIHBsYWNlaG9sZGVyIHNlY3JldHMgZm9yIE9BdXRoIHByb3ZpZGVycycsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpTZWNyZXRzTWFuYWdlcjo6U2VjcmV0Jywge1xuICAgICAgICBOYW1lOiAnYXVyYTI4L29hdXRoL2dvb2dsZS9kZXYnLFxuICAgICAgICBEZXNjcmlwdGlvbjogJ0dvb2dsZSBPQXV0aCBjcmVkZW50aWFscyAodG8gYmUgcG9wdWxhdGVkIG1hbnVhbGx5KScsXG4gICAgICB9KTtcblxuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OlNlY3JldHNNYW5hZ2VyOjpTZWNyZXQnLCB7XG4gICAgICAgIE5hbWU6ICdhdXJhMjgvb2F1dGgvZmFjZWJvb2svZGV2JyxcbiAgICAgICAgRGVzY3JpcHRpb246ICdGYWNlYm9vayBPQXV0aCBjcmVkZW50aWFscyAodG8gYmUgcG9wdWxhdGVkIG1hbnVhbGx5KScsXG4gICAgICB9KTtcblxuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OlNlY3JldHNNYW5hZ2VyOjpTZWNyZXQnLCB7XG4gICAgICAgIE5hbWU6ICdhdXJhMjgvb2F1dGgvYXBwbGUvZGV2JyxcbiAgICAgICAgRGVzY3JpcHRpb246ICdBcHBsZSBPQXV0aCBjcmVkZW50aWFscyAodG8gYmUgcG9wdWxhdGVkIG1hbnVhbGx5KScsXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ2NyZWF0ZXMgQ2xvdWRGb3JtYXRpb24gb3V0cHV0cycsICgpID0+IHtcbiAgICAgIC8vIE91dHB1dHMgYXJlIGNyZWF0ZWQgYXQgdGhlIGNvbnN0cnVjdCBsZXZlbCB3aXRoIENESyBoYXNoZXNcbiAgICAgIGNvbnN0IG91dHB1dHMgPSB0ZW1wbGF0ZS5maW5kT3V0cHV0cygnKicpO1xuICAgICAgY29uc3Qgb3V0cHV0S2V5cyA9IE9iamVjdC5rZXlzKG91dHB1dHMpO1xuXG4gICAgICAvLyBDaGVjayB0aGF0IG91dHB1dHMgd2l0aCB0aGUgY29ycmVjdCBwcmVmaXggZXhpc3RcbiAgICAgIGV4cGVjdChvdXRwdXRLZXlzLnNvbWUoKGtleSkgPT4ga2V5LnN0YXJ0c1dpdGgoJ1Rlc3RBdXRoVXNlclBvb2xJZCcpKSkudG9CZSh0cnVlKTtcbiAgICAgIGV4cGVjdChvdXRwdXRLZXlzLnNvbWUoKGtleSkgPT4ga2V5LnN0YXJ0c1dpdGgoJ1Rlc3RBdXRoVXNlclBvb2xDbGllbnRJZCcpKSkudG9CZSh0cnVlKTtcbiAgICAgIGV4cGVjdChvdXRwdXRLZXlzLnNvbWUoKGtleSkgPT4ga2V5LnN0YXJ0c1dpdGgoJ1Rlc3RBdXRoQ29nbml0b0RvbWFpblByZWZpeCcpKSkudG9CZSh0cnVlKTtcbiAgICAgIGV4cGVjdChvdXRwdXRLZXlzLnNvbWUoKGtleSkgPT4ga2V5LnN0YXJ0c1dpdGgoJ1Rlc3RBdXRoQ29nbml0b0hvc3RlZFVJVVJMJykpKS50b0JlKHRydWUpO1xuICAgICAgZXhwZWN0KG91dHB1dEtleXMuc29tZSgoa2V5KSA9PiBrZXkuc3RhcnRzV2l0aCgnVGVzdEF1dGhBZG1pbkdyb3VwTmFtZScpKSkudG9CZSh0cnVlKTtcbiAgICAgIGV4cGVjdChvdXRwdXRLZXlzLnNvbWUoKGtleSkgPT4ga2V5LnN0YXJ0c1dpdGgoJ1Rlc3RBdXRoT0F1dGhTZWNyZXRzUmVtaW5kZXInKSkpLnRvQmUodHJ1ZSk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdQcm9kdWN0aW9uIEVudmlyb25tZW50JywgKCkgPT4ge1xuICAgIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgICAgbmV3IENvZ25pdG9BdXRoQ29uc3RydWN0KHN0YWNrLCAnVGVzdEF1dGgnLCB7XG4gICAgICAgIGVudmlyb25tZW50OiAncHJvZCcsXG4gICAgICAgIGRvbWFpblByZWZpeDogJ2F1cmEyOC1wcm9kJyxcbiAgICAgICAgY2FsbGJhY2tVcmxzOiBbJ2h0dHBzOi8vYXVyYTI4LmNvbS9hdXRoL2NhbGxiYWNrJ10sXG4gICAgICAgIGxvZ291dFVybHM6IFsnaHR0cHM6Ly9hdXJhMjguY29tJ10sXG4gICAgICB9KTtcbiAgICAgIHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ2NyZWF0ZXMgYSBVc2VyIFBvb2wgd2l0aCBwcm9kdWN0aW9uIHNldHRpbmdzJywgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkNvZ25pdG86OlVzZXJQb29sJywge1xuICAgICAgICBVc2VyUG9vbE5hbWU6ICdhdXJhMjgtcHJvZC11c2VyLXBvb2wnLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdjcmVhdGVzIGFkbWluIGdyb3VwIGluIHVzZXIgcG9vbCcsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpDb2duaXRvOjpVc2VyUG9vbEdyb3VwJywge1xuICAgICAgICBHcm91cE5hbWU6ICdhZG1pbicsXG4gICAgICAgIERlc2NyaXB0aW9uOiAnQWRtaW5pc3RyYXRvciB1c2VycyB3aXRoIGVsZXZhdGVkIHByaXZpbGVnZXMnLFxuICAgICAgICBQcmVjZWRlbmNlOiAxLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdzZXRzIFJFVEFJTiBkZWxldGlvbiBwb2xpY3kgZm9yIHByb2R1Y3Rpb24nLCAoKSA9PiB7XG4gICAgICBjb25zdCB1c2VyUG9vbCA9IHRlbXBsYXRlLmZpbmRSZXNvdXJjZXMoJ0FXUzo6Q29nbml0bzo6VXNlclBvb2wnKTtcbiAgICAgIGNvbnN0IHVzZXJQb29sS2V5ID0gT2JqZWN0LmtleXModXNlclBvb2wpWzBdO1xuICAgICAgZXhwZWN0KHVzZXJQb29sW3VzZXJQb29sS2V5XS5EZWxldGlvblBvbGljeSkudG9CZSgnUmV0YWluJyk7XG4gICAgfSk7XG4gIH0pO1xufSk7XG4iXX0=