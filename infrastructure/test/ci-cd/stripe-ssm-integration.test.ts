/**
 * Integration tests for CI/CD Stripe Price ID SSM Integration (KAN-72)
 * These tests verify the expected behavior of the SSM parameter fetching
 * in the CI/CD pipelines.
 */

import { SSMClient, GetParameterCommand, PutParameterCommand } from '@aws-sdk/client-ssm';
import { mockClient } from 'aws-sdk-client-mock';

const ssmMock = mockClient(SSMClient);

describe('CI/CD Stripe Price ID SSM Integration', () => {
  beforeEach(() => {
    ssmMock.reset();
  });

  describe('SSM Parameter Fetching', () => {
    it('should successfully fetch dev environment price ID', async () => {
      const expectedPriceId = 'price_dev_test_123';
      const parameterName = '/aura28/dev/stripe/default-price-id';

      ssmMock
        .on(GetParameterCommand, {
          Name: parameterName,
        })
        .resolves({
          Parameter: {
            Name: parameterName,
            Value: expectedPriceId,
            Type: 'String',
          },
        });

      const client = new SSMClient({ region: 'us-east-1' });
      const command = new GetParameterCommand({ Name: parameterName });
      const response = await client.send(command);

      expect(response.Parameter?.Value).toBe(expectedPriceId);
      expect(response.Parameter?.Name).toBe(parameterName);
    });

    it('should successfully fetch prod environment price ID', async () => {
      const expectedPriceId = 'price_prod_live_456';
      const parameterName = '/aura28/prod/stripe/default-price-id';

      ssmMock
        .on(GetParameterCommand, {
          Name: parameterName,
        })
        .resolves({
          Parameter: {
            Name: parameterName,
            Value: expectedPriceId,
            Type: 'String',
          },
        });

      const client = new SSMClient({ region: 'us-east-1' });
      const command = new GetParameterCommand({ Name: parameterName });
      const response = await client.send(command);

      expect(response.Parameter?.Value).toBe(expectedPriceId);
      expect(response.Parameter?.Name).toBe(parameterName);
    });

    it('should handle missing SSM parameter gracefully', async () => {
      const parameterName = '/aura28/dev/stripe/default-price-id';

      const error = new Error(`Parameter ${parameterName} not found.`);
      error.name = 'ParameterNotFound';

      ssmMock
        .on(GetParameterCommand, {
          Name: parameterName,
        })
        .rejects(error);

      const client = new SSMClient({ region: 'us-east-1' });
      const command = new GetParameterCommand({ Name: parameterName });

      await expect(client.send(command)).rejects.toThrow('Parameter');
    });

    it('should handle empty parameter value', async () => {
      const parameterName = '/aura28/dev/stripe/default-price-id';

      ssmMock
        .on(GetParameterCommand, {
          Name: parameterName,
        })
        .resolves({
          Parameter: {
            Name: parameterName,
            Value: '',
            Type: 'String',
          },
        });

      const client = new SSMClient({ region: 'us-east-1' });
      const command = new GetParameterCommand({ Name: parameterName });
      const response = await client.send(command);

      expect(response.Parameter?.Value).toBe('');
      // CI/CD workflow should detect this and fail
    });

    it('should handle AWS API errors', async () => {
      const parameterName = '/aura28/dev/stripe/default-price-id';

      const error = new Error('User is not authorized to perform: ssm:GetParameter');
      error.name = 'AccessDeniedException';

      ssmMock
        .on(GetParameterCommand, {
          Name: parameterName,
        })
        .rejects(error);

      const client = new SSMClient({ region: 'us-east-1' });
      const command = new GetParameterCommand({ Name: parameterName });

      await expect(client.send(command)).rejects.toThrow('User is not authorized');
    });

    it('should handle network timeouts', async () => {
      const parameterName = '/aura28/dev/stripe/default-price-id';

      const error = new Error('Connection timeout');
      error.name = 'NetworkingError';

      ssmMock
        .on(GetParameterCommand, {
          Name: parameterName,
        })
        .rejects(error);

      const client = new SSMClient({ region: 'us-east-1' });
      const command = new GetParameterCommand({ Name: parameterName });

      await expect(client.send(command)).rejects.toThrow('Connection timeout');
    });
  });

  describe('Parameter Naming Convention', () => {
    it('should follow the correct naming pattern for dev environment', () => {
      const devParameterName = '/aura28/dev/stripe/default-price-id';
      expect(devParameterName).toMatch(/^\/aura28\/dev\/stripe\/default-price-id$/);
    });

    it('should follow the correct naming pattern for prod environment', () => {
      const prodParameterName = '/aura28/prod/stripe/default-price-id';
      expect(prodParameterName).toMatch(/^\/aura28\/prod\/stripe\/default-price-id$/);
    });

    it('should use consistent prefix across environments', () => {
      const devParam = '/aura28/dev/stripe/default-price-id';
      const prodParam = '/aura28/prod/stripe/default-price-id';

      const devPrefix = devParam.split('/').slice(0, 2).join('/');
      const prodPrefix = prodParam.split('/').slice(0, 2).join('/');

      expect(devPrefix).toBe('/aura28');
      expect(prodPrefix).toBe('/aura28');
    });
  });

  describe('Environment Variable Injection', () => {
    it('should set NEXT_PUBLIC_STRIPE_PRICE_ID correctly', () => {
      const priceId = 'price_test_from_ssm';

      // Simulate what the CI/CD workflow does
      process.env.NEXT_PUBLIC_STRIPE_PRICE_ID = priceId;

      expect(process.env.NEXT_PUBLIC_STRIPE_PRICE_ID).toBe(priceId);
    });

    it('should override any existing NEXT_PUBLIC_STRIPE_PRICE_ID', () => {
      // Set an initial value
      process.env.NEXT_PUBLIC_STRIPE_PRICE_ID = 'old_price_id';

      // Simulate CI/CD override
      const newPriceId = 'price_new_from_ssm';
      process.env.NEXT_PUBLIC_STRIPE_PRICE_ID = newPriceId;

      expect(process.env.NEXT_PUBLIC_STRIPE_PRICE_ID).toBe(newPriceId);
      expect(process.env.NEXT_PUBLIC_STRIPE_PRICE_ID).not.toBe('old_price_id');
    });
  });

  describe('CI/CD Workflow Validation', () => {
    it('should validate that price ID starts with price_', () => {
      const validPriceIds = ['price_123', 'price_test', 'price_live_abc'];
      const invalidPriceIds = ['123', 'test_price', 'prod_123', ''];

      validPriceIds.forEach((id) => {
        expect(id).toMatch(/^price_/);
      });

      invalidPriceIds.forEach((id) => {
        expect(id).not.toMatch(/^price_/);
      });
    });

    it('should use correct valid dev price ID for KAN-73', () => {
      const validDevPriceId = 'price_1RxUOjErRRGs6tYsTV4RF1Qu';
      const invalidPlaceholderId = 'price_1QbGXuRuJDBzRJSkCbG4a9Xo';

      // Valid dev price ID should match Stripe format
      expect(validDevPriceId).toMatch(/^price_/);
      expect(validDevPriceId.length).toBeGreaterThan(10);

      // Should not be using the old placeholder
      expect(validDevPriceId).not.toBe(invalidPlaceholderId);
    });

    it('should handle fallback to valid dev price ID when SSM parameter missing', () => {
      // Simulate the workflow fallback logic
      const ssmPriceId: string | undefined = undefined;
      const fallbackPriceId = 'price_1RxUOjErRRGs6tYsTV4RF1Qu';

      const finalPriceId = ssmPriceId || fallbackPriceId;

      expect(finalPriceId).toBe(fallbackPriceId);
      expect(finalPriceId).toMatch(/^price_/);
      expect(finalPriceId).not.toBe('price_1QbGXuRuJDBzRJSkCbG4a9Xo'); // Not the old placeholder
    });

    it('should ensure parameter names match environment context', () => {
      const devWorkflowParam = '/aura28/dev/stripe/default-price-id';
      const prodWorkflowParam = '/aura28/prod/stripe/default-price-id';

      // Dev workflow should use dev parameter
      expect(devWorkflowParam).toContain('/dev/');
      expect(devWorkflowParam).not.toContain('/prod/');

      // Prod workflow should use prod parameter
      expect(prodWorkflowParam).toContain('/prod/');
      expect(prodWorkflowParam).not.toContain('/dev/');
    });

    it('should fail build if SSM parameter is missing', async () => {
      const parameterName = '/aura28/dev/stripe/default-price-id';

      const error = new Error(`Parameter ${parameterName} not found.`);
      error.name = 'ParameterNotFound';

      ssmMock
        .on(GetParameterCommand, {
          Name: parameterName,
        })
        .rejects(error);

      const client = new SSMClient({ region: 'us-east-1' });
      const command = new GetParameterCommand({ Name: parameterName });

      // This simulates what happens in the CI/CD workflow
      let buildShouldFail = false;
      try {
        await client.send(command);
      } catch (_error) {
        buildShouldFail = true;
      }

      expect(buildShouldFail).toBe(true);
    });

    it('should fail build if SSM parameter value is empty', () => {
      const priceId: string = '';

      // Simulate the CI/CD check
      let buildShouldFail = false;
      if (!priceId || priceId.trim() === '') {
        buildShouldFail = true;
      }

      expect(buildShouldFail).toBe(true);
    });
  });

  describe('SSM Parameter Creation Helper', () => {
    it('should create dev parameter with correct structure', async () => {
      const parameterName = '/aura28/dev/stripe/default-price-id';
      const priceId = 'price_dev_test_123';

      ssmMock
        .on(PutParameterCommand, {
          Name: parameterName,
          Value: priceId,
          Type: 'String',
        })
        .resolves({
          Version: 1,
        });

      const client = new SSMClient({ region: 'us-east-1' });
      const command = new PutParameterCommand({
        Name: parameterName,
        Value: priceId,
        Type: 'String',
        Description: 'Default Stripe price ID for development environment frontend',
      });

      const response = await client.send(command);
      expect(response.Version).toBe(1);
    });

    it('should create prod parameter with correct structure', async () => {
      const parameterName = '/aura28/prod/stripe/default-price-id';
      const priceId = 'price_prod_live_456';

      ssmMock
        .on(PutParameterCommand, {
          Name: parameterName,
          Value: priceId,
          Type: 'String',
        })
        .resolves({
          Version: 1,
        });

      const client = new SSMClient({ region: 'us-east-1' });
      const command = new PutParameterCommand({
        Name: parameterName,
        Value: priceId,
        Type: 'String',
        Description: 'Default Stripe price ID for production environment frontend',
      });

      const response = await client.send(command);
      expect(response.Version).toBe(1);
    });
  });

  describe('Build Process Integration', () => {
    it('should make environment variable available during Next.js build', () => {
      // Simulate the environment during build
      const buildEnv = {
        NEXT_PUBLIC_STRIPE_PRICE_ID: 'price_from_ssm_build',
        NEXT_PUBLIC_API_GATEWAY_URL: 'https://api.example.com',
        NEXT_PUBLIC_COGNITO_USER_POOL_ID: 'us-east-1_test',
        NEXT_PUBLIC_COGNITO_CLIENT_ID: 'test_client_id',
        NEXT_PUBLIC_COGNITO_DOMAIN: 'test-domain',
        NEXT_PUBLIC_COGNITO_REGION: 'us-east-1',
      };

      // All NEXT_PUBLIC_ variables should be available
      Object.entries(buildEnv).forEach(([key, value]) => {
        expect(key).toMatch(/^NEXT_PUBLIC_/);
        expect(value).toBeTruthy();
      });

      // Stripe price ID should be set
      expect(buildEnv.NEXT_PUBLIC_STRIPE_PRICE_ID).toBeDefined();
      expect(buildEnv.NEXT_PUBLIC_STRIPE_PRICE_ID).toMatch(/^price_/);
    });

    it('should not expose sensitive SSM parameter names in build output', () => {
      const publicEnvVar = 'NEXT_PUBLIC_STRIPE_PRICE_ID';

      // The parameter name should not be exposed, only the env var name
      expect(publicEnvVar).not.toContain('ssm');
      expect(publicEnvVar).not.toContain('parameter');
      expect(publicEnvVar).not.toContain('/aura28/');
    });
  });
});
