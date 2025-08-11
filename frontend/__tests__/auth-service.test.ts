import { AuthService, User } from '@/lib/auth/auth-service';
import {
  CognitoIdentityProviderClient,
  UpdateUserAttributesCommand,
} from '@aws-sdk/client-cognito-identity-provider';

// Mock AWS SDK
jest.mock('@aws-sdk/client-cognito-identity-provider');

// Mock jwt-decode
jest.mock('jwt-decode', () => ({
  jwtDecode: jest.fn(),
}));

// Mock cognito-config
jest.mock('@/lib/auth/cognito-config', () => ({
  getCognitoConfig: jest.fn(() => ({
    userPoolId: 'test-pool-id',
    clientId: 'test-client-id',
    domain: 'test-domain',
    region: 'us-east-1',
    redirectUri: 'http://localhost:3000/auth/callback',
  })),
  getCognitoUrls: jest.fn(() => ({
    login: 'https://test.auth.us-east-1.amazoncognito.com/login',
    logout: 'https://test.auth.us-east-1.amazoncognito.com/logout',
    token: 'https://test.auth.us-east-1.amazoncognito.com/oauth2/token',
  })),
}));

describe('AuthService', () => {
  let authService: AuthService;
  let mockSend: jest.Mock;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSend = jest.fn();
    (CognitoIdentityProviderClient as jest.Mock).mockImplementation(() => ({
      send: mockSend,
    }));
    authService = new AuthService();

    // Clear localStorage
    Storage.prototype.getItem = jest.fn();
    Storage.prototype.setItem = jest.fn();
    Storage.prototype.removeItem = jest.fn();

    // Mock console.error to suppress expected error logs
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore console.error
    consoleErrorSpy.mockRestore();
  });

  describe('hasCompletedOnboarding', () => {
    it('returns false if user is null', () => {
      expect(authService.hasCompletedOnboarding(null)).toBe(false);
    });

    it('returns false for any user', () => {
      const incompleteUser: User = {
        sub: '123',
        email: 'test@example.com',
        email_verified: true,
      };

      // Method is deprecated and always returns false
      expect(authService.hasCompletedOnboarding(incompleteUser)).toBe(false);
    });

    it('returns false since the method is deprecated', () => {
      const completeUser: User = {
        sub: '123',
        email: 'test@example.com',
        email_verified: true,
      };

      // Method is deprecated and always returns false
      expect(authService.hasCompletedOnboarding(completeUser)).toBe(false);
    });

    it('always returns false regardless of input', () => {
      const userWithoutBirthTime: User = {
        sub: '123',
        email: 'test@example.com',
        email_verified: true,
      };

      // Method is deprecated and always returns false
      expect(authService.hasCompletedOnboarding(userWithoutBirthTime)).toBe(false);
    });
  });

  describe('updateUserAttributes', () => {
    const mockTokens = {
      idToken: 'mock-id-token',
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
      expiresAt: Date.now() + 3600000,
    };

    beforeEach(() => {
      (Storage.prototype.getItem as jest.Mock).mockReturnValue(JSON.stringify(mockTokens));
    });

    it('throws error if no tokens are found', async () => {
      (Storage.prototype.getItem as jest.Mock).mockReturnValue(null);

      await expect(
        authService.updateUserAttributes({ 'custom:birthCity': 'New York' }),
      ).rejects.toThrow('No authentication tokens found');
    });

    it('successfully updates user attributes', async () => {
      mockSend.mockResolvedValueOnce({});
      // Mock refreshToken to simulate successful refresh
      jest
        .spyOn(
          authService as unknown as { refreshToken: () => Promise<typeof mockTokens> },
          'refreshToken',
        )
        .mockResolvedValueOnce(mockTokens);

      const attributes = {
        'custom:birthCity': 'San Francisco',
        'custom:birthState': 'California',
        'custom:birthCountry': 'United States',
      };

      await authService.updateUserAttributes(attributes);

      expect(mockSend).toHaveBeenCalledWith(expect.any(UpdateUserAttributesCommand));

      // Verify the command was created with correct input
      const commandCall = mockSend.mock.calls[0][0];
      expect(commandCall).toBeInstanceOf(UpdateUserAttributesCommand);
      expect(commandCall.constructor.name).toBe('UpdateUserAttributesCommand');
    });

    it('handles update errors gracefully', async () => {
      mockSend.mockRejectedValueOnce(new Error('Cognito error'));

      await expect(
        authService.updateUserAttributes({ 'custom:birthCity': 'New York' }),
      ).rejects.toThrow('Failed to update user profile');
    });

    it('refreshes token after successful update', async () => {
      mockSend.mockResolvedValueOnce({});
      const refreshTokenSpy = jest
        .spyOn(
          authService as unknown as { refreshToken: () => Promise<typeof mockTokens> },
          'refreshToken',
        )
        .mockResolvedValueOnce(mockTokens);

      await authService.updateUserAttributes({ 'custom:birthName': 'John Doe' });

      expect(refreshTokenSpy).toHaveBeenCalled();
    });
  });
});
