import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { CognitoAuthConstruct } from '../lib/constructs/cognito-auth-construct';

describe('CognitoAuthConstruct', () => {
  let app: cdk.App;
  let stack: cdk.Stack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'TestStack', {
      env: { account: '123456789012', region: 'us-east-1' },
    });
  });

  describe('Development Environment', () => {
    beforeEach(() => {
      new CognitoAuthConstruct(stack, 'TestAuth', {
        environment: 'dev',
        domainPrefix: 'aura28-dev',
        callbackUrls: [
          'http://localhost:3000/auth/callback',
          'https://dev.aura28.com/auth/callback',
        ],
        logoutUrls: ['http://localhost:3000', 'https://dev.aura28.com'],
      });
      template = Template.fromStack(stack);
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
        Schema: Match.arrayWith([
          Match.objectLike({
            Name: 'email',
            Required: true,
            Mutable: true,
          }),
          Match.objectLike({
            Name: 'birthdate',
            Required: false,
            Mutable: true,
          }),
          Match.objectLike({
            Name: 'birthTime',
            AttributeDataType: 'String',
            Mutable: true,
          }),
          Match.objectLike({
            Name: 'birthPlace',
            AttributeDataType: 'String',
            Mutable: true,
          }),
          Match.objectLike({
            Name: 'birthLatitude',
            AttributeDataType: 'Number',
            Mutable: true,
          }),
          Match.objectLike({
            Name: 'birthLongitude',
            AttributeDataType: 'Number',
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
        ExplicitAuthFlows: Match.arrayWith(['ALLOW_USER_PASSWORD_AUTH', 'ALLOW_USER_SRP_AUTH']),
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
      new CognitoAuthConstruct(stack, 'TestAuth', {
        environment: 'prod',
        domainPrefix: 'aura28-prod',
        callbackUrls: ['https://aura28.com/auth/callback'],
        logoutUrls: ['https://aura28.com'],
      });
      template = Template.fromStack(stack);
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
