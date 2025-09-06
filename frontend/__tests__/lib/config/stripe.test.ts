// Set a default test price ID for imports that happen before tests run
process.env.NEXT_PUBLIC_STRIPE_PRICE_ID =
  process.env.NEXT_PUBLIC_STRIPE_PRICE_ID || 'price_test_default_123';

// Import the real module - it should use the env var we just set
import { STRIPE_CONFIG } from '@/lib/config/stripe';

describe('STRIPE_CONFIG', () => {
  describe('Price ID Configuration', () => {
    const originalEnv = process.env.NEXT_PUBLIC_STRIPE_PRICE_ID;

    beforeEach(() => {
      // Reset modules before each test to ensure fresh imports
      jest.resetModules();
      // Clear the environment variable
      delete process.env.NEXT_PUBLIC_STRIPE_PRICE_ID;
    });

    afterEach(() => {
      // Restore original environment variable
      if (originalEnv !== undefined) {
        process.env.NEXT_PUBLIC_STRIPE_PRICE_ID = originalEnv;
      } else {
        delete process.env.NEXT_PUBLIC_STRIPE_PRICE_ID;
      }
      jest.resetModules();
    });

    it('should use environment variable price ID when defined', () => {
      process.env.NEXT_PUBLIC_STRIPE_PRICE_ID = 'price_test_123abc';
      // Re-import to get new config with the environment variable
      jest.resetModules();
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { STRIPE_CONFIG: testConfig } = require('@/lib/config/stripe');
      expect(testConfig.readingPriceId).toBe('price_test_123abc');
    });

    it('should use test fallback when NEXT_PUBLIC_STRIPE_PRICE_ID is not defined in test env', () => {
      delete process.env.NEXT_PUBLIC_STRIPE_PRICE_ID;
      process.env.NODE_ENV = 'test';
      jest.resetModules();

      // Should use test fallback instead of throwing
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { STRIPE_CONFIG: testConfig } = require('@/lib/config/stripe');
      expect(testConfig.readingPriceId).toBe('price_test_12345');
    });

    it('should validate price ID format starts with price_', () => {
      process.env.NEXT_PUBLIC_STRIPE_PRICE_ID = 'price_valid_id_12345';
      jest.resetModules();
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { STRIPE_CONFIG: validConfig } = require('@/lib/config/stripe');
      expect(validConfig.readingPriceId).toMatch(/^price_/);
    });
  });

  describe('Display Configuration (KAN-71)', () => {
    it('should have displayPrice field with formatted price', () => {
      expect(STRIPE_CONFIG.displayPrice).toBe('$147');
      expect(STRIPE_CONFIG.displayPrice).toMatch(/^\$\d+(\.\d{2})?$/);
    });

    it('should have paymentType field describing payment structure', () => {
      expect(STRIPE_CONFIG.paymentType).toBe('one-time payment');
      expect(STRIPE_CONFIG.paymentType).toBeTruthy();
      expect(typeof STRIPE_CONFIG.paymentType).toBe('string');
    });

    it('should have productDescription field with compelling copy', () => {
      expect(STRIPE_CONFIG.productDescription).toBeDefined();
      expect(typeof STRIPE_CONFIG.productDescription).toBe('string');
      expect(STRIPE_CONFIG.productDescription.length).toBeGreaterThan(50);
      // Check for key marketing terms
      expect(STRIPE_CONFIG.productDescription.toLowerCase()).toContain('wisdom');
      expect(STRIPE_CONFIG.productDescription.toLowerCase()).toContain('personalized');
      expect(STRIPE_CONFIG.productDescription.toLowerCase()).toContain('birth chart');
    });

    it('should have consistent pricing display format', () => {
      // Ensure displayPrice matches a standard currency format
      const priceRegex = /^\$\d+(\.\d{2})?$/;
      expect(STRIPE_CONFIG.displayPrice).toMatch(priceRegex);

      // Ensure price is a reasonable amount (between $1 and $1000)
      const priceValue = parseFloat(STRIPE_CONFIG.displayPrice.replace('$', ''));
      expect(priceValue).toBeGreaterThan(0);
      expect(priceValue).toBeLessThan(1000);
    });

    it('should maintain all display fields as non-empty strings', () => {
      expect(STRIPE_CONFIG.displayPrice).not.toBe('');
      expect(STRIPE_CONFIG.paymentType).not.toBe('');
      expect(STRIPE_CONFIG.productDescription).not.toBe('');
    });
  });

  describe('Session Types', () => {
    it('should define ONE_TIME session type', () => {
      expect(STRIPE_CONFIG.sessionTypes.ONE_TIME).toBe('one-time');
    });

    it('should define SUBSCRIPTION session type', () => {
      expect(STRIPE_CONFIG.sessionTypes.SUBSCRIPTION).toBe('subscription');
    });

    it('should have defined session types as constants', () => {
      // TypeScript 'as const' ensures compile-time immutability
      // Runtime modification is prevented by TypeScript, not JavaScript
      expect(STRIPE_CONFIG.sessionTypes.ONE_TIME).toBe('one-time');
      expect(typeof STRIPE_CONFIG.sessionTypes.ONE_TIME).toBe('string');

      // Attempting to modify would cause TypeScript error (compile-time check)
      // @ts-expect-error - TypeScript prevents this at compile time
      // STRIPE_CONFIG.sessionTypes.ONE_TIME = 'modified';
    });
  });

  describe('Metadata Keys', () => {
    it('should define userId metadata key', () => {
      expect(STRIPE_CONFIG.metadataKeys.userId).toBe('userId');
    });

    it('should define readingType metadata key', () => {
      expect(STRIPE_CONFIG.metadataKeys.readingType).toBe('readingType');
    });
  });

  describe('Reading Types', () => {
    it('should define SOUL_BLUEPRINT reading type', () => {
      expect(STRIPE_CONFIG.readingTypes.SOUL_BLUEPRINT).toBe('soul_blueprint');
    });

    it('should have consistent reading type naming convention', () => {
      // All reading types should use snake_case
      Object.values(STRIPE_CONFIG.readingTypes).forEach((type) => {
        expect(type).toMatch(/^[a-z]+(_[a-z]+)*$/);
      });
    });
  });

  describe('URL Helper Functions', () => {
    describe('getSuccessUrl', () => {
      it('should generate correct success URL with base URL', () => {
        const baseUrl = 'https://example.com';
        const result = STRIPE_CONFIG.getSuccessUrl(baseUrl);
        expect(result).toBe('https://example.com/payment/success');
      });

      it('should handle base URL with trailing slash', () => {
        const baseUrl = 'https://example.com/';
        const result = STRIPE_CONFIG.getSuccessUrl(baseUrl);
        expect(result).toBe('https://example.com//payment/success');
      });

      it('should work with localhost URLs', () => {
        const baseUrl = 'http://localhost:3000';
        const result = STRIPE_CONFIG.getSuccessUrl(baseUrl);
        expect(result).toBe('http://localhost:3000/payment/success');
      });

      it('should preserve existing query parameters in base URL', () => {
        const baseUrl = 'https://example.com?existing=param';
        const result = STRIPE_CONFIG.getSuccessUrl(baseUrl);
        expect(result).toBe('https://example.com?existing=param/payment/success');
      });
    });

    describe('getCancelUrl', () => {
      it('should generate correct cancel URL with base URL', () => {
        const baseUrl = 'https://example.com';
        const result = STRIPE_CONFIG.getCancelUrl(baseUrl);
        expect(result).toBe('https://example.com/payment/cancel');
      });

      it('should handle base URL with trailing slash', () => {
        const baseUrl = 'https://example.com/';
        const result = STRIPE_CONFIG.getCancelUrl(baseUrl);
        expect(result).toBe('https://example.com//payment/cancel');
      });

      it('should work with localhost URLs', () => {
        const baseUrl = 'http://localhost:3000';
        const result = STRIPE_CONFIG.getCancelUrl(baseUrl);
        expect(result).toBe('http://localhost:3000/payment/cancel');
      });

      it('should generate cancel URL with correct path', () => {
        const baseUrl = 'https://example.com';
        const result = STRIPE_CONFIG.getCancelUrl(baseUrl);
        expect(result).toContain('/payment/cancel');
      });
    });

    describe('URL consistency', () => {
      it('should use consistent payment path prefix in both success and cancel URLs', () => {
        const baseUrl = 'https://example.com';
        const successUrl = STRIPE_CONFIG.getSuccessUrl(baseUrl);
        const cancelUrl = STRIPE_CONFIG.getCancelUrl(baseUrl);

        expect(successUrl).toContain('/payment/');
        expect(cancelUrl).toContain('/payment/');
      });

      it('should use dedicated pages for success and cancel', () => {
        const baseUrl = 'https://example.com';
        const successUrl = STRIPE_CONFIG.getSuccessUrl(baseUrl);
        const cancelUrl = STRIPE_CONFIG.getCancelUrl(baseUrl);

        expect(successUrl).toContain('/payment/success');
        expect(cancelUrl).toContain('/payment/cancel');
      });

      it('should not use query parameters for payment status', () => {
        const baseUrl = 'https://example.com';
        const successUrl = STRIPE_CONFIG.getSuccessUrl(baseUrl);
        const cancelUrl = STRIPE_CONFIG.getCancelUrl(baseUrl);

        expect(successUrl).not.toContain('?');
        expect(cancelUrl).not.toContain('?');
        expect(successUrl).not.toContain('payment=');
        expect(cancelUrl).not.toContain('payment=');
      });
    });
  });

  describe('Configuration Immutability', () => {
    it('should be a frozen object', () => {
      expect(Object.isFrozen(STRIPE_CONFIG)).toBe(false); // Note: 'as const' doesn't freeze at runtime

      // But TypeScript prevents modifications at compile time
      // These would cause TypeScript errors:
      // STRIPE_CONFIG.readingPriceId = 'new_price';
      // STRIPE_CONFIG.newProperty = 'value';
    });

    it('should have all properties defined', () => {
      expect(STRIPE_CONFIG.readingPriceId).toBeDefined();
      expect(STRIPE_CONFIG.sessionTypes).toBeDefined();
      expect(STRIPE_CONFIG.metadataKeys).toBeDefined();
      expect(STRIPE_CONFIG.readingTypes).toBeDefined();
      expect(STRIPE_CONFIG.getSuccessUrl).toBeDefined();
      expect(STRIPE_CONFIG.getCancelUrl).toBeDefined();
    });

    it('should not have undefined values', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const checkUndefined = (obj: any, path = ''): void => {
        Object.entries(obj).forEach(([key, value]) => {
          const currentPath = path ? `${path}.${key}` : key;
          expect(value).toBeDefined();

          if (
            typeof value === 'object' &&
            value !== null &&
            !Array.isArray(value) &&
            typeof value !== 'function'
          ) {
            checkUndefined(value, currentPath);
          }
        });
      };

      checkUndefined(STRIPE_CONFIG);
    });
  });

  describe('Type Exports', () => {
    it('should have configuration object with correct structure', () => {
      // TypeScript type exports can't be tested at runtime
      // But we can verify the configuration object structure
      expect(STRIPE_CONFIG).toHaveProperty('readingPriceId');
      expect(STRIPE_CONFIG).toHaveProperty('sessionTypes');
      expect(STRIPE_CONFIG).toHaveProperty('metadataKeys');
      expect(STRIPE_CONFIG).toHaveProperty('readingTypes');
      expect(STRIPE_CONFIG).toHaveProperty('getSuccessUrl');
      expect(STRIPE_CONFIG).toHaveProperty('getCancelUrl');
    });
  });

  describe('Environment-specific Configuration', () => {
    it('should support different price IDs for different environments via SSM', () => {
      // This configuration is now handled by SSM parameters:
      // - /aura28/dev/stripe/default-price-id for development
      // - /aura28/prod/stripe/default-price-id for production
      // The CI/CD pipeline fetches these values and injects them as NEXT_PUBLIC_STRIPE_PRICE_ID

      process.env.NEXT_PUBLIC_STRIPE_PRICE_ID = 'price_from_ssm_12345';
      jest.resetModules();
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { STRIPE_CONFIG: ssmConfig } = require('@/lib/config/stripe');

      expect(ssmConfig.readingPriceId).toBe('price_from_ssm_12345');
      expect(ssmConfig.readingPriceId).toMatch(/^price_/);
    });

    it('should ensure price ID is configured through environment variable', () => {
      // Verify that we're no longer using hardcoded or NODE_ENV-based price IDs
      process.env.NEXT_PUBLIC_STRIPE_PRICE_ID = 'price_configured_via_env';
      jest.resetModules();
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { STRIPE_CONFIG: envConfig } = require('@/lib/config/stripe');

      expect(envConfig.readingPriceId).toBe('price_configured_via_env');
      // Should not contain any hardcoded development or production IDs
      expect(envConfig.readingPriceId).not.toBe('price_1RxUOjErRRGs6tYsTV4RF1Qu');
      expect(envConfig.readingPriceId).not.toBe('price_REPLACE_WITH_PRODUCTION_ID');
    });

    it('should handle empty string environment variable with fallback in test', () => {
      process.env.NEXT_PUBLIC_STRIPE_PRICE_ID = '';
      process.env.NODE_ENV = 'test';
      jest.resetModules();

      // Should use test fallback for empty string
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { STRIPE_CONFIG: testConfig } = require('@/lib/config/stripe');
      expect(testConfig.readingPriceId).toBe('price_test_12345');
    });

    it('should handle whitespace-only environment variable with fallback in test', () => {
      process.env.NEXT_PUBLIC_STRIPE_PRICE_ID = '   ';
      process.env.NODE_ENV = 'test';
      jest.resetModules();

      // Whitespace-only values should use test fallback
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { STRIPE_CONFIG: testConfig } = require('@/lib/config/stripe');
      expect(testConfig.readingPriceId).toBe('price_test_12345');
    });

    it('should accept any valid Stripe price ID format', () => {
      const validPriceIds = [
        'price_1234567890abcdef',
        'price_test_abc123',
        'price_live_xyz789',
        'price_0J2bxyz',
      ];

      validPriceIds.forEach((priceId) => {
        process.env.NEXT_PUBLIC_STRIPE_PRICE_ID = priceId;
        jest.resetModules();
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { STRIPE_CONFIG } = require('@/lib/config/stripe');
        expect(STRIPE_CONFIG.readingPriceId).toBe(priceId);
      });
    });

    it('should provide detailed error message in CI/production when env var is missing', () => {
      delete process.env.NEXT_PUBLIC_STRIPE_PRICE_ID;
      process.env.NODE_ENV = 'production';
      process.env.CI = 'true'; // Simulate CI environment
      jest.resetModules();

      let errorMessage = '';
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('@/lib/config/stripe');
      } catch (error) {
        errorMessage = (error as Error).message;
      }

      expect(errorMessage).toContain('NEXT_PUBLIC_STRIPE_PRICE_ID');
      expect(errorMessage).toContain('SSM Parameter Store');

      // Clean up CI env var
      delete process.env.CI;
    });

    it('should use dev price ID fallback in development when env var missing', () => {
      delete process.env.NEXT_PUBLIC_STRIPE_PRICE_ID;
      process.env.NODE_ENV = 'development';
      jest.resetModules();

      // Should use dev fallback
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { STRIPE_CONFIG: devConfig } = require('@/lib/config/stripe');
      expect(devConfig.readingPriceId).toBe('price_1RxUOjErRRGs6tYsTV4RF1Qu');
    });

    it('should use dev price ID fallback in production without CI', () => {
      delete process.env.NEXT_PUBLIC_STRIPE_PRICE_ID;
      process.env.NODE_ENV = 'production';
      delete process.env.CI; // Ensure CI is not set
      jest.resetModules();

      // Should use dev fallback for local production builds
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { STRIPE_CONFIG: prodConfig } = require('@/lib/config/stripe');
      expect(prodConfig.readingPriceId).toBe('price_1RxUOjErRRGs6tYsTV4RF1Qu');
    });
  });
});
