/**
 * Stripe Configuration
 * Centralized configuration for Stripe integration
 */

// Helper function to get the price ID with proper validation
function getStripePriceId(): string {
  const priceId = process.env.NEXT_PUBLIC_STRIPE_PRICE_ID;

  // Check for undefined, null, or empty string (after trimming)
  if (!priceId || priceId.trim() === '') {
    // In test environment, use a test price ID
    if (process.env.NODE_ENV === 'test') {
      return 'price_test_12345';
    }

    // In development or during build without CI/CD, use dev price ID as fallback
    // This allows local builds to work, but CI/CD will override with SSM value
    if (process.env.NODE_ENV === 'development' || !process.env.CI) {
      return 'price_1RxUOjErRRGs6tYsTV4RF1Qu';
    }

    throw new Error(
      'NEXT_PUBLIC_STRIPE_PRICE_ID environment variable is not defined. This should be set during the build process from SSM Parameter Store.',
    );
  }

  return priceId;
}

export const STRIPE_CONFIG = {
  // Price ID fetched from SSM Parameter Store during build time
  // Configured via CI/CD pipeline from /aura28/{env}/stripe/default-price-id
  readingPriceId: getStripePriceId(),

  // Display configuration for pricing
  displayPrice: '$147',
  paymentType: 'one-time payment',
  productDescription:
    "Unlock deep insights into your cosmic blueprint with a personalized astrological reading tailored to your unique birth chart. Discover your soul's purpose, karmic patterns, and spiritual potential through ancient wisdom that reveals what truly drives you and what's waiting on the other side.",

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
