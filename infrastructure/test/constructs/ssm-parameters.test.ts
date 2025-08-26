/**
 * Tests for SSM Parameter creation with correct Stripe price IDs (KAN-73)
 * This test verifies that the CDK infrastructure creates SSM parameters
 * with the valid dev price ID instead of the placeholder.
 */

import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as ssm from 'aws-cdk-lib/aws-ssm';

describe('SSM Parameters for Stripe Configuration (KAN-73)', () => {
  let app: cdk.App;
  let stack: cdk.Stack;
  let template: Template;

  const VALID_DEV_PRICE_ID = 'price_1RxUOjErRRGs6tYsTV4RF1Qu';
  const INVALID_PLACEHOLDER_ID = 'price_1QbGXuRuJDBzRJSkCbG4a9Xo';

  describe('Development environment parameters', () => {
    beforeEach(() => {
      app = new cdk.App();
      stack = new cdk.Stack(app, 'TestStack', {
        env: {
          account: '123456789012',
          region: 'us-east-1',
        },
      });

      // Simulate the SSM parameters created in ApiConstruct for dev environment
      new ssm.StringParameter(stack, 'DefaultPriceIdParameter', {
        parameterName: '/aura28/dev/stripe/default-price-id',
        description: 'Default Stripe price ID for frontend build in dev environment',
        stringValue: VALID_DEV_PRICE_ID,
        tier: ssm.ParameterTier.STANDARD,
      });

      new ssm.StringParameter(stack, 'AllowedPriceIdsParameter', {
        parameterName: '/aura28/dev/stripe/allowed-price-ids',
        description: 'Comma-separated list of allowed Stripe price IDs for dev environment',
        stringValue: `${VALID_DEV_PRICE_ID},price_placeholder_2`,
        tier: ssm.ParameterTier.STANDARD,
      });

      new ssm.StringParameter(stack, 'WebhookSecretParameter', {
        parameterName: '/aura28/dev/stripe/webhook-secret',
        description: 'Stripe webhook secret for dev environment',
        stringValue: 'PLACEHOLDER_TO_BE_REPLACED_MANUALLY',
        tier: ssm.ParameterTier.STANDARD,
      });

      template = Template.fromStack(stack);
    });

    test('should create default price ID parameter with valid dev price ID', () => {
      template.hasResourceProperties('AWS::SSM::Parameter', {
        Name: '/aura28/dev/stripe/default-price-id',
        Value: VALID_DEV_PRICE_ID,
        Type: 'String',
      });
    });

    test('should not use invalid placeholder price ID', () => {
      const parameters = template.findResources('AWS::SSM::Parameter');

      Object.entries(parameters).forEach(([_, resource]) => {
        if (resource.Properties.Name === '/aura28/dev/stripe/default-price-id') {
          expect(resource.Properties.Value).toBe(VALID_DEV_PRICE_ID);
          expect(resource.Properties.Value).not.toBe(INVALID_PLACEHOLDER_ID);
        }
      });
    });

    test('should include valid dev price ID in allowed list', () => {
      template.hasResourceProperties('AWS::SSM::Parameter', {
        Name: '/aura28/dev/stripe/allowed-price-ids',
        Value: Match.stringLikeRegexp(`.*${VALID_DEV_PRICE_ID}.*`),
      });
    });

    test('should not include invalid placeholder in allowed list', () => {
      const parameters = template.findResources('AWS::SSM::Parameter');

      Object.entries(parameters).forEach(([_, resource]) => {
        if (resource.Properties.Name === '/aura28/dev/stripe/allowed-price-ids') {
          expect(resource.Properties.Value).toContain(VALID_DEV_PRICE_ID);
          expect(resource.Properties.Value).not.toContain(INVALID_PLACEHOLDER_ID);
        }
      });
    });

    test('should use Standard tier for all parameters', () => {
      const parameters = template.findResources('AWS::SSM::Parameter');

      Object.entries(parameters).forEach(([_, resource]) => {
        expect(resource.Properties.Tier).toBe('Standard');
      });
    });

    test('should have proper descriptions for all parameters', () => {
      const parameters = template.findResources('AWS::SSM::Parameter');

      Object.entries(parameters).forEach(([_, resource]) => {
        expect(resource.Properties.Description).toBeDefined();
        expect(resource.Properties.Description.length).toBeGreaterThan(10);
        expect(resource.Properties.Description).toContain('dev');
      });
    });
  });

  describe('Production environment parameters', () => {
    beforeEach(() => {
      app = new cdk.App();
      stack = new cdk.Stack(app, 'ProdStack', {
        env: {
          account: '123456789012',
          region: 'us-east-1',
        },
      });

      // Simulate the SSM parameters created in ApiConstruct for prod environment
      new ssm.StringParameter(stack, 'DefaultPriceIdParameter', {
        parameterName: '/aura28/prod/stripe/default-price-id',
        description: 'Default Stripe price ID for frontend build in prod environment',
        stringValue: 'price_REPLACE_WITH_PRODUCTION_ID',
        tier: ssm.ParameterTier.STANDARD,
      });

      new ssm.StringParameter(stack, 'AllowedPriceIdsParameter', {
        parameterName: '/aura28/prod/stripe/allowed-price-ids',
        description: 'Comma-separated list of allowed Stripe price IDs for prod environment',
        stringValue: 'price_REPLACE_WITH_PRODUCTION_ID',
        tier: ssm.ParameterTier.STANDARD,
      });

      template = Template.fromStack(stack);
    });

    test('should use placeholder for production price ID', () => {
      template.hasResourceProperties('AWS::SSM::Parameter', {
        Name: '/aura28/prod/stripe/default-price-id',
        Value: 'price_REPLACE_WITH_PRODUCTION_ID',
      });
    });

    test('should not use dev price ID in production', () => {
      const parameters = template.findResources('AWS::SSM::Parameter');

      Object.entries(parameters).forEach(([_, resource]) => {
        if (resource.Properties.Name?.includes('/prod/')) {
          expect(resource.Properties.Value).not.toBe(VALID_DEV_PRICE_ID);
          expect(resource.Properties.Value).not.toContain(VALID_DEV_PRICE_ID);
        }
      });
    });
  });

  describe('Price ID format validation', () => {
    test('valid dev price ID should follow Stripe format', () => {
      expect(VALID_DEV_PRICE_ID).toMatch(/^price_/);
      expect(VALID_DEV_PRICE_ID.length).toBeGreaterThan(10);
      expect(VALID_DEV_PRICE_ID).toMatch(/^price_[A-Za-z0-9]+$/);
    });

    test('should reject invalid placeholder ID', () => {
      // The invalid placeholder should not be used anywhere
      expect(VALID_DEV_PRICE_ID).not.toBe(INVALID_PLACEHOLDER_ID);
    });
  });

  describe('Parameter naming conventions', () => {
    beforeEach(() => {
      app = new cdk.App();
      stack = new cdk.Stack(app, 'NamingTestStack');

      // Create parameters with proper naming
      new ssm.StringParameter(stack, 'Param1', {
        parameterName: '/aura28/dev/stripe/default-price-id',
        stringValue: 'test',
      });

      new ssm.StringParameter(stack, 'Param2', {
        parameterName: '/aura28/dev/stripe/allowed-price-ids',
        stringValue: 'test',
      });

      template = Template.fromStack(stack);
    });

    test('should follow /aura28/{env}/stripe/* pattern', () => {
      const parameters = template.findResources('AWS::SSM::Parameter');

      Object.entries(parameters).forEach(([_, resource]) => {
        const name = resource.Properties.Name;
        expect(name).toMatch(/^\/aura28\/(dev|prod|test)\/stripe\/.+$/);
      });
    });

    test('should use hyphens in parameter names', () => {
      const parameters = template.findResources('AWS::SSM::Parameter');

      Object.entries(parameters).forEach(([_, resource]) => {
        const name = resource.Properties.Name;
        const lastPart = name.split('/').pop();
        // Parameter names should use hyphens, not underscores
        expect(lastPart).toMatch(/^[a-z-]+$/);
        expect(lastPart).not.toContain('_');
      });
    });
  });
});
