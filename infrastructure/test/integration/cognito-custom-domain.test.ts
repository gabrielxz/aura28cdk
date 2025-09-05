import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { CognitoAuthConstruct } from '../../lib/constructs/cognito-auth-construct';

describe('Cognito Custom Domain Integration Tests', () => {
  let app: cdk.App;
  let stack: cdk.Stack;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'TestStack', {
      env: { account: '123456789012', region: 'us-east-1' },
    });
  });

  describe('Custom Domain with Production Environment', () => {
    test('correctly integrates custom domain with Cognito User Pool', () => {
      // Create a hosted zone for testing
      const hostedZone = route53.HostedZone.fromHostedZoneAttributes(stack, 'TestZone', {
        hostedZoneId: 'Z123456789ABC',
        zoneName: 'example.com',
      });

      // Create Cognito Auth construct with custom domain
      const authConstruct = new CognitoAuthConstruct(stack, 'AuthConstruct', {
        environment: 'prod',
        domainPrefix: 'example-prod',
        callbackUrls: ['https://example.com/auth/callback'],
        logoutUrls: ['https://example.com'],
        customDomain: {
          domainName: 'auth.example.com',
          hostedZone: hostedZone,
        },
      });

      const template = Template.fromStack(stack);

      // Verify ACM certificate is created
      template.hasResourceProperties('AWS::CertificateManager::Certificate', {
        DomainName: 'auth.example.com',
        ValidationMethod: 'DNS',
      });

      // Verify User Pool Domain is configured with custom domain
      const domains = template.findResources('AWS::Cognito::UserPoolDomain');
      const domainKey = Object.keys(domains)[0];
      expect(domains[domainKey].Properties.Domain).toBe('auth.example.com');
      expect(domains[domainKey].Properties.CustomDomainConfig).toBeDefined();

      // Verify that the construct exposes the custom domain properties
      expect(authConstruct.customDomainName).toBe('auth.example.com');
      expect(authConstruct.customDomainCertificate).toBeDefined();
    });

    test('configures custom domain with appropriate hosted zone', () => {
      const hostedZone = route53.HostedZone.fromHostedZoneAttributes(stack, 'TestZone', {
        hostedZoneId: 'Z987654321CBA',
        zoneName: 'myapp.io',
      });

      const authConstruct = new CognitoAuthConstruct(stack, 'AuthConstruct', {
        environment: 'prod',
        domainPrefix: 'myapp-prod',
        callbackUrls: ['https://myapp.io/auth/callback'],
        logoutUrls: ['https://myapp.io'],
        customDomain: {
          domainName: 'auth.myapp.io',
          hostedZone: hostedZone,
        },
      });

      const template = Template.fromStack(stack);

      // Verify custom domain is configured with User Pool Domain
      const domains = template.findResources('AWS::Cognito::UserPoolDomain');
      const domainKey = Object.keys(domains)[0];
      expect(domains[domainKey].Properties.Domain).toBe('auth.myapp.io');

      // Verify certificate is created for the custom domain
      template.hasResourceProperties('AWS::CertificateManager::Certificate', {
        DomainName: 'auth.myapp.io',
      });

      // Verify the construct exposes custom domain properties correctly
      expect(authConstruct.customDomainName).toBe('auth.myapp.io');
    });

    test('validates custom domain configuration with missing hosted zone', () => {
      // Test that the construct handles undefined hosted zone gracefully
      expect(() => {
        new CognitoAuthConstruct(stack, 'AuthConstruct', {
          environment: 'prod',
          domainPrefix: 'test-prod',
          callbackUrls: ['https://test.com/auth/callback'],
          logoutUrls: ['https://test.com'],
          customDomain: {
            domainName: 'auth.test.com',
            hostedZone: undefined as unknown as IHostedZone,
          },
        });
      }).not.toThrow(); // CDK should handle this at synthesis time
    });

    test('validates empty custom domain name falls back to default', () => {
      const hostedZone = route53.HostedZone.fromHostedZoneAttributes(stack, 'TestZone', {
        hostedZoneId: 'Z123456789ABC',
        zoneName: 'example.com',
      });

      new CognitoAuthConstruct(stack, 'AuthConstruct', {
        environment: 'prod',
        domainPrefix: 'example-prod',
        callbackUrls: ['https://example.com/auth/callback'],
        logoutUrls: ['https://example.com'],
        customDomain: {
          domainName: '',
          hostedZone: hostedZone,
        },
      });

      const template = Template.fromStack(stack);

      // Should fall back to default domain when custom domain name is empty
      template.hasResourceProperties('AWS::Cognito::UserPoolDomain', {
        Domain: 'example-prod',
      });
    });
  });

  describe('Custom Domain with Development Environment', () => {
    test('ignores custom domain configuration in development', () => {
      const hostedZone = route53.HostedZone.fromHostedZoneAttributes(stack, 'TestZone', {
        hostedZoneId: 'Z123456789ABC',
        zoneName: 'dev.example.com',
      });

      const authConstruct = new CognitoAuthConstruct(stack, 'AuthConstruct', {
        environment: 'dev',
        domainPrefix: 'example-dev',
        callbackUrls: [
          'http://localhost:3000/auth/callback',
          'https://dev.example.com/auth/callback',
        ],
        logoutUrls: ['http://localhost:3000', 'https://dev.example.com'],
        customDomain: {
          domainName: 'auth.dev.example.com',
          hostedZone: hostedZone,
        },
      });

      const template = Template.fromStack(stack);

      // Should not create ACM certificate in dev
      const certificates = template.findResources('AWS::CertificateManager::Certificate');
      expect(Object.keys(certificates)).toHaveLength(0);

      // Should use default Cognito domain
      template.hasResourceProperties('AWS::Cognito::UserPoolDomain', {
        Domain: 'example-dev',
      });

      // Custom domain properties should be undefined in dev
      expect(authConstruct.customDomainName).toBeUndefined();
      expect(authConstruct.customDomainCertificate).toBeUndefined();
    });
  });

  describe('CloudFormation Outputs for Custom Domain', () => {
    test('generates correct outputs for custom domain in production', () => {
      const hostedZone = route53.HostedZone.fromHostedZoneAttributes(stack, 'TestZone', {
        hostedZoneId: 'Z123456789ABC',
        zoneName: 'prod.example.com',
      });

      new CognitoAuthConstruct(stack, 'AuthConstruct', {
        environment: 'prod',
        domainPrefix: 'example-prod',
        callbackUrls: ['https://prod.example.com/auth/callback'],
        logoutUrls: ['https://prod.example.com'],
        customDomain: {
          domainName: 'auth.prod.example.com',
          hostedZone: hostedZone,
        },
      });

      const template = Template.fromStack(stack);
      const outputs = template.findOutputs('*');

      // Find the hosted UI URL output
      const hostedUIOutput = Object.keys(outputs).find((key) =>
        key.startsWith('AuthConstructCognitoHostedUIURL'),
      );
      expect(outputs[hostedUIOutput!].Value).toBe('https://auth.prod.example.com');

      // Find the custom domain output
      const customDomainOutput = Object.keys(outputs).find((key) =>
        key.startsWith('AuthConstructCognitoCustomDomain'),
      );
      expect(outputs[customDomainOutput!].Value).toBe('auth.prod.example.com');
    });

    test('generates correct outputs for default domain in development', () => {
      new CognitoAuthConstruct(stack, 'AuthConstruct', {
        environment: 'dev',
        domainPrefix: 'example-dev',
        callbackUrls: [
          'http://localhost:3000/auth/callback',
          'https://dev.example.com/auth/callback',
        ],
        logoutUrls: ['http://localhost:3000', 'https://dev.example.com'],
      });

      const template = Template.fromStack(stack);
      const outputs = template.findOutputs('*');

      // Find the hosted UI URL output
      const hostedUIOutput = Object.keys(outputs).find((key) =>
        key.startsWith('AuthConstructCognitoHostedUIURL'),
      );
      expect(outputs[hostedUIOutput!].Value).toContain(
        'example-dev.auth.us-east-1.amazoncognito.com',
      );
    });
  });
});
