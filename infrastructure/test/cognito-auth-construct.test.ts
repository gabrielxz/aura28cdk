import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as route53 from 'aws-cdk-lib/aws-route53';
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
      const hostedUIOutput = Object.keys(outputs).find((key) =>
        key.startsWith('TestAuthCognitoHostedUIURL'),
      );
      expect(outputs[hostedUIOutput!].Value).toContain(
        'aura28-dev.auth.us-east-1.amazoncognito.com',
      );
    });
  });

  describe('Development Environment with Custom Domain (should be ignored)', () => {
    beforeEach(() => {
      const hostedZone = route53.HostedZone.fromHostedZoneAttributes(stack, 'TestZone', {
        hostedZoneId: 'Z123456789ABC',
        zoneName: 'aura28.com',
      });

      new CognitoAuthConstruct(stack, 'TestAuth', {
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
      template = Template.fromStack(stack);
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
    let authConstruct: CognitoAuthConstruct;

    beforeEach(() => {
      const hostedZone = route53.HostedZone.fromHostedZoneAttributes(stack, 'TestZone', {
        hostedZoneId: 'Z123456789ABC',
        zoneName: 'aura28.com',
      });

      authConstruct = new CognitoAuthConstruct(stack, 'TestAuth', {
        environment: 'prod',
        domainPrefix: 'aura28-prod',
        callbackUrls: ['https://aura28.com/auth/callback'],
        logoutUrls: ['https://aura28.com'],
        customDomain: {
          domainName: 'auth.aura28.com',
          hostedZone: hostedZone,
        },
      });
      template = Template.fromStack(stack);
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
      const hostedUIOutput = Object.keys(outputs).find((key) =>
        key.startsWith('TestAuthCognitoHostedUIURL'),
      );
      expect(outputs[hostedUIOutput!].Value).toBe('https://auth.aura28.com');
    });

    test('outputs custom domain name separately', () => {
      const outputs = template.findOutputs('*');
      const customDomainOutput = Object.keys(outputs).find((key) =>
        key.startsWith('TestAuthCognitoCustomDomain'),
      );
      expect(outputs[customDomainOutput!].Value).toBe('auth.aura28.com');
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
      new CognitoAuthConstruct(stack, 'TestAuth', {
        environment: 'prod',
        domainPrefix: 'aura28-prod',
        callbackUrls: ['https://aura28.com/auth/callback'],
        logoutUrls: ['https://aura28.com'],
        customDomain: {
          domainName: 'auth.aura28.com',
          hostedZone: undefined as unknown as route53.IHostedZone,
        },
      });

      // The construct will still create custom domain resources
      // but synthesis will fail without a valid hostedZone
      const template = Template.fromStack(stack);

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

      new CognitoAuthConstruct(stack, 'TestAuth', {
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
      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Cognito::UserPoolDomain', {
        Domain: 'aura28-prod',
      });
    });
  });
});
