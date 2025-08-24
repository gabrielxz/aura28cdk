/**
 * Stripe Configuration
 * Centralized configuration for Stripe integration
 */

export const STRIPE_CONFIG = {
  // Price IDs for different environments
  // These should be configured in Stripe Dashboard and match your product pricing
  readingPriceId:
    process.env.NODE_ENV === 'production'
      ? 'price_REPLACE_WITH_PRODUCTION_ID' // TODO: Replace with actual production price ID from Stripe Dashboard
      : 'price_1QbGXuRuJDBzRJSkCbG4a9Xo', // Development/test price ID

  // Session types
  sessionTypes: {
    ONE_TIME: 'one-time' as const,
    SUBSCRIPTION: 'subscription' as const,
  },

  // Metadata keys for tracking
  metadataKeys: {
    userId: 'userId',
    readingType: 'readingType',
  },

  // Reading types
  readingTypes: {
    SOUL_BLUEPRINT: 'soul_blueprint',
  },

  // Helper function to generate success URL
  getSuccessUrl: (baseUrl: string): string => {
    return `${baseUrl}/payment/success`;
  },

  // Helper function to generate cancel URL
  getCancelUrl: (baseUrl: string): string => {
    return `${baseUrl}/payment/cancel`;
  },
} as const;

export type SessionType =
  (typeof STRIPE_CONFIG.sessionTypes)[keyof typeof STRIPE_CONFIG.sessionTypes];
export type ReadingType =
  (typeof STRIPE_CONFIG.readingTypes)[keyof typeof STRIPE_CONFIG.readingTypes];
