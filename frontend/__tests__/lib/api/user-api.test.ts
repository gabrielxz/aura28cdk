import { UserApi, CreateCheckoutSessionRequest } from '@/lib/api/user-api';
import { AuthService } from '@/lib/auth/auth-service';

// Mock fetch
global.fetch = jest.fn();

describe('UserApi', () => {
  let userApi: UserApi;
  let mockAuthService: jest.Mocked<AuthService>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock AuthService
    mockAuthService = {
      getIdToken: jest.fn(),
      getUserSub: jest.fn(),
      isAuthenticated: jest.fn(),
      signOut: jest.fn(),
    } as unknown as jest.Mocked<AuthService>;

    // Set environment variable
    process.env.NEXT_PUBLIC_API_GATEWAY_URL = 'https://api.example.com/';

    userApi = new UserApi(mockAuthService);
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_API_GATEWAY_URL;
  });

  describe('constructor', () => {
    it('initializes with auth service and base URL', () => {
      expect(userApi).toBeDefined();
    });

    it('logs error when API Gateway URL is not configured', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      delete process.env.NEXT_PUBLIC_API_GATEWAY_URL;

      new UserApi(mockAuthService);

      expect(consoleErrorSpy).toHaveBeenCalledWith('API Gateway URL not configured');
      consoleErrorSpy.mockRestore();
    });
  });

  describe('createCheckoutSession', () => {
    const mockUserId = 'test-user-123';
    const mockToken = 'test-id-token';

    const validRequest: CreateCheckoutSessionRequest = {
      sessionType: 'subscription',
      priceId: 'price_test123',
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
    };

    describe('successful requests', () => {
      it('creates checkout session successfully with subscription', async () => {
        const mockResponse = {
          sessionId: 'cs_test_session123',
          url: 'https://checkout.stripe.com/session123',
        };

        mockAuthService.getIdToken.mockResolvedValue(mockToken);
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          json: async () => mockResponse,
        });

        const result = await userApi.createCheckoutSession(mockUserId, validRequest);

        expect(mockAuthService.getIdToken).toHaveBeenCalled();
        expect(global.fetch).toHaveBeenCalledWith(
          'https://api.example.com/api/users/test-user-123/checkout-session',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${mockToken}`,
            },
            body: JSON.stringify(validRequest),
          },
        );
        expect(result).toEqual(mockResponse);
      });

      it('creates checkout session successfully with one-time payment', async () => {
        const oneTimeRequest: CreateCheckoutSessionRequest = {
          sessionType: 'one-time',
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel',
        };

        const mockResponse = {
          sessionId: 'cs_test_session456',
          url: 'https://checkout.stripe.com/session456',
        };

        mockAuthService.getIdToken.mockResolvedValue(mockToken);
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          json: async () => mockResponse,
        });

        const result = await userApi.createCheckoutSession(mockUserId, oneTimeRequest);

        expect(global.fetch).toHaveBeenCalledWith(
          'https://api.example.com/api/users/test-user-123/checkout-session',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${mockToken}`,
            },
            body: JSON.stringify(oneTimeRequest),
          },
        );
        expect(result).toEqual(mockResponse);
      });

      it('includes optional parameters when provided', async () => {
        const requestWithOptionals: CreateCheckoutSessionRequest = {
          ...validRequest,
          customerEmail: 'customer@example.com',
          metadata: {
            campaign: 'summer2024',
            referrer: 'newsletter',
          },
        };

        const mockResponse = {
          sessionId: 'cs_test_session789',
          url: 'https://checkout.stripe.com/session789',
        };

        mockAuthService.getIdToken.mockResolvedValue(mockToken);
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          json: async () => mockResponse,
        });

        const result = await userApi.createCheckoutSession(mockUserId, requestWithOptionals);

        expect(global.fetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            body: JSON.stringify(requestWithOptionals),
          }),
        );
        expect(result).toEqual(mockResponse);
      });
    });

    describe('authentication errors', () => {
      it('throws error when not authenticated', async () => {
        mockAuthService.getIdToken.mockResolvedValue(null);

        await expect(userApi.createCheckoutSession(mockUserId, validRequest)).rejects.toThrow(
          'Not authenticated',
        );

        expect(global.fetch).not.toHaveBeenCalled();
      });

      it('throws error when getIdToken throws', async () => {
        mockAuthService.getIdToken.mockRejectedValue(new Error('Token expired'));

        await expect(userApi.createCheckoutSession(mockUserId, validRequest)).rejects.toThrow(
          'Token expired',
        );

        expect(global.fetch).not.toHaveBeenCalled();
      });
    });

    describe('HTTP error responses', () => {
      it('handles 400 Bad Request', async () => {
        mockAuthService.getIdToken.mockResolvedValue(mockToken);
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: false,
          status: 400,
          json: async () => ({ error: 'Invalid request parameters' }),
        });

        await expect(userApi.createCheckoutSession(mockUserId, validRequest)).rejects.toThrow(
          'Invalid request parameters',
        );
      });

      it('handles 401 Unauthorized', async () => {
        mockAuthService.getIdToken.mockResolvedValue(mockToken);
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: false,
          status: 401,
          json: async () => ({ error: 'Unauthorized' }),
        });

        await expect(userApi.createCheckoutSession(mockUserId, validRequest)).rejects.toThrow(
          'Unauthorized',
        );
      });

      it('handles 403 Forbidden', async () => {
        mockAuthService.getIdToken.mockResolvedValue(mockToken);
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: false,
          status: 403,
          json: async () => ({ error: 'Forbidden' }),
        });

        await expect(userApi.createCheckoutSession(mockUserId, validRequest)).rejects.toThrow(
          'Forbidden',
        );
      });

      it('handles 500 Internal Server Error', async () => {
        mockAuthService.getIdToken.mockResolvedValue(mockToken);
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: false,
          status: 500,
          json: async () => ({ error: 'Internal server error' }),
        });

        await expect(userApi.createCheckoutSession(mockUserId, validRequest)).rejects.toThrow(
          'Internal server error',
        );
      });

      it('provides default error message when no error field in response', async () => {
        mockAuthService.getIdToken.mockResolvedValue(mockToken);
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: false,
          status: 500,
          json: async () => ({}),
        });

        await expect(userApi.createCheckoutSession(mockUserId, validRequest)).rejects.toThrow(
          'Failed to create checkout session',
        );
      });
    });

    describe('network and parsing errors', () => {
      it('logs and re-throws network errors', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
        const networkError = new Error('Network failure');

        mockAuthService.getIdToken.mockResolvedValue(mockToken);
        (global.fetch as jest.Mock).mockRejectedValue(networkError);

        await expect(userApi.createCheckoutSession(mockUserId, validRequest)).rejects.toThrow(
          'Network failure',
        );

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Error creating checkout session:',
          networkError,
        );

        consoleErrorSpy.mockRestore();
      });

      it('handles malformed JSON response', async () => {
        mockAuthService.getIdToken.mockResolvedValue(mockToken);
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          json: async () => {
            throw new Error('Invalid JSON');
          },
        });

        await expect(userApi.createCheckoutSession(mockUserId, validRequest)).rejects.toThrow(
          'Invalid JSON',
        );
      });

      it('handles fetch timeout', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
        const timeoutError = new Error('Request timeout');

        mockAuthService.getIdToken.mockResolvedValue(mockToken);
        (global.fetch as jest.Mock).mockRejectedValue(timeoutError);

        await expect(userApi.createCheckoutSession(mockUserId, validRequest)).rejects.toThrow(
          'Request timeout',
        );

        expect(consoleErrorSpy).toHaveBeenCalled();
        consoleErrorSpy.mockRestore();
      });
    });

    describe('edge cases', () => {
      it('handles empty base URL', async () => {
        delete process.env.NEXT_PUBLIC_API_GATEWAY_URL;
        const api = new UserApi(mockAuthService);

        mockAuthService.getIdToken.mockResolvedValue(mockToken);
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          json: async () => ({ sessionId: 'test', url: 'test' }),
        });

        await api.createCheckoutSession(mockUserId, validRequest);

        // Should still attempt to fetch with empty base URL
        expect(global.fetch).toHaveBeenCalledWith(
          'api/users/test-user-123/checkout-session',
          expect.any(Object),
        );
      });

      it('handles special characters in userId', async () => {
        const specialUserId = 'user@example.com';
        mockAuthService.getIdToken.mockResolvedValue(mockToken);
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          json: async () => ({ sessionId: 'test', url: 'test' }),
        });

        await userApi.createCheckoutSession(specialUserId, validRequest);

        expect(global.fetch).toHaveBeenCalledWith(
          'https://api.example.com/api/users/user@example.com/checkout-session',
          expect.any(Object),
        );
      });

      it('handles very large metadata objects', async () => {
        const largeMetadata: Record<string, string> = {};
        for (let i = 0; i < 100; i++) {
          largeMetadata[`key${i}`] = `value${i}`;
        }

        const requestWithLargeMetadata: CreateCheckoutSessionRequest = {
          ...validRequest,
          metadata: largeMetadata,
        };

        mockAuthService.getIdToken.mockResolvedValue(mockToken);
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          json: async () => ({ sessionId: 'test', url: 'test' }),
        });

        await userApi.createCheckoutSession(mockUserId, requestWithLargeMetadata);

        const callBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
        expect(callBody.metadata).toEqual(largeMetadata);
      });
    });
  });

  describe('other UserApi methods', () => {
    // Basic smoke tests for other methods to ensure they still work
    it('getUserProfile method exists and works', async () => {
      const mockProfile = {
        userId: 'test-user',
        email: 'test@example.com',
        profile: {
          birthName: 'Test User',
          birthDate: '1990-01-01',
          birthCity: 'Test City',
          birthState: 'TS',
          birthCountry: 'Test Country',
        },
        onboardingCompleted: true,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockAuthService.getIdToken.mockResolvedValue('test-token');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockProfile,
      });

      const result = await userApi.getUserProfile('test-user');
      expect(result).toEqual(mockProfile);
    });

    it('updateUserProfile method exists and works', async () => {
      const mockUpdate = {
        message: 'Profile updated',
        profile: {} as UserProfile,
      };

      mockAuthService.getIdToken.mockResolvedValue('test-token');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockUpdate,
      });

      const profile = {
        email: 'test@example.com',
        birthName: 'Test',
        birthDate: '1990-01-01',
        birthCity: 'City',
        birthState: 'State',
        birthCountry: 'Country',
      };

      const result = await userApi.updateUserProfile('test-user', profile);
      expect(result).toEqual(mockUpdate);
    });
  });
});
