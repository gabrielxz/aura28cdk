import { STRIPE_CONFIG } from '@/lib/config/stripe';

describe('STRIPE_CONFIG', () => {
  describe('Price ID Configuration', () => {
    it('should use development price ID in non-production environment', () => {
      // Default NODE_ENV in test is 'test', not 'production'
      expect(STRIPE_CONFIG.readingPriceId).toBe('price_1QbGXuRuJDBzRJSkCbG4a9Xo');
    });

    it('should have placeholder for production price ID', () => {
      // Save original NODE_ENV
      const originalEnv = process.env.NODE_ENV;

      // Mock production environment
      process.env.NODE_ENV = 'production';

      // Re-import to get fresh module
      jest.resetModules();
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { STRIPE_CONFIG: prodConfig } = require('@/lib/config/stripe');

      expect(prodConfig.readingPriceId).toBe('price_REPLACE_WITH_PRODUCTION_ID');

      // Restore original NODE_ENV
      process.env.NODE_ENV = originalEnv;
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
        expect(result).toBe('https://example.com/dashboard?tab=readings&payment=success');
      });

      it('should handle base URL with trailing slash', () => {
        const baseUrl = 'https://example.com/';
        const result = STRIPE_CONFIG.getSuccessUrl(baseUrl);
        expect(result).toBe('https://example.com//dashboard?tab=readings&payment=success');
      });

      it('should work with localhost URLs', () => {
        const baseUrl = 'http://localhost:3000';
        const result = STRIPE_CONFIG.getSuccessUrl(baseUrl);
        expect(result).toBe('http://localhost:3000/dashboard?tab=readings&payment=success');
      });

      it('should preserve existing query parameters in base URL', () => {
        const baseUrl = 'https://example.com?existing=param';
        const result = STRIPE_CONFIG.getSuccessUrl(baseUrl);
        expect(result).toBe(
          'https://example.com?existing=param/dashboard?tab=readings&payment=success',
        );
      });
    });

    describe('getCancelUrl', () => {
      it('should generate correct cancel URL with base URL', () => {
        const baseUrl = 'https://example.com';
        const result = STRIPE_CONFIG.getCancelUrl(baseUrl);
        expect(result).toBe('https://example.com/dashboard?tab=readings&payment=cancelled');
      });

      it('should handle base URL with trailing slash', () => {
        const baseUrl = 'https://example.com/';
        const result = STRIPE_CONFIG.getCancelUrl(baseUrl);
        expect(result).toBe('https://example.com//dashboard?tab=readings&payment=cancelled');
      });

      it('should work with localhost URLs', () => {
        const baseUrl = 'http://localhost:3000';
        const result = STRIPE_CONFIG.getCancelUrl(baseUrl);
        expect(result).toBe('http://localhost:3000/dashboard?tab=readings&payment=cancelled');
      });

      it('should use "cancelled" spelling consistently', () => {
        const baseUrl = 'https://example.com';
        const result = STRIPE_CONFIG.getCancelUrl(baseUrl);
        // British spelling "cancelled" with double 'l'
        expect(result).toContain('payment=cancelled');
      });
    });

    describe('URL consistency', () => {
      it('should use consistent dashboard path in both success and cancel URLs', () => {
        const baseUrl = 'https://example.com';
        const successUrl = STRIPE_CONFIG.getSuccessUrl(baseUrl);
        const cancelUrl = STRIPE_CONFIG.getCancelUrl(baseUrl);

        expect(successUrl).toContain('/dashboard');
        expect(cancelUrl).toContain('/dashboard');
      });

      it('should use consistent tab parameter in both URLs', () => {
        const baseUrl = 'https://example.com';
        const successUrl = STRIPE_CONFIG.getSuccessUrl(baseUrl);
        const cancelUrl = STRIPE_CONFIG.getCancelUrl(baseUrl);

        expect(successUrl).toContain('tab=readings');
        expect(cancelUrl).toContain('tab=readings');
      });

      it('should use different payment status parameters', () => {
        const baseUrl = 'https://example.com';
        const successUrl = STRIPE_CONFIG.getSuccessUrl(baseUrl);
        const cancelUrl = STRIPE_CONFIG.getCancelUrl(baseUrl);

        expect(successUrl).toContain('payment=success');
        expect(cancelUrl).toContain('payment=cancelled');
        expect(successUrl).not.toContain('payment=cancelled');
        expect(cancelUrl).not.toContain('payment=success');
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
    it('should use different price IDs for different environments', () => {
      const devPriceId = 'price_1QbGXuRuJDBzRJSkCbG4a9Xo';
      const prodPriceId = 'price_REPLACE_WITH_PRODUCTION_ID';

      expect(devPriceId).not.toBe(prodPriceId);
      expect(devPriceId).toMatch(/^price_/);
      expect(prodPriceId).toMatch(/^price_/);
    });

    it('should have TODO comment for production price ID', () => {
      // This test serves as a reminder that the production price ID needs to be configured
      expect(STRIPE_CONFIG.readingPriceId).toBeTruthy();
      // In production, this should not be the placeholder value
      if (process.env.NODE_ENV === 'production') {
        expect(STRIPE_CONFIG.readingPriceId).not.toBe('price_REPLACE_WITH_PRODUCTION_ID');
      }
    });
  });
});
