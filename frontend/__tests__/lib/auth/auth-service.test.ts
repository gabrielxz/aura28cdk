import { AuthService } from '@/lib/auth/auth-service';
import { getCognitoConfig } from '@/lib/auth/cognito-config';

// Mock jwt-decode
jest.mock('jwt-decode', () => ({
  jwtDecode: jest.fn(() => ({
    sub: 'test-user-id',
    email: 'test@example.com',
    email_verified: true,
  })),
}));

// Mock fetch
global.fetch = jest.fn();

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock Cognito config
jest.mock('@/lib/auth/cognito-config', () => ({
  getCognitoConfig: jest.fn(() => ({
    userPoolId: 'us-east-1_test',
    clientId: 'test-client-id',
    domain: 'test-domain',
    region: 'us-east-1',
    redirectUri: 'http://localhost:3000/auth/callback',
  })),
  getCognitoUrls: jest.fn(() => ({
    login: 'https://test-domain.auth.us-east-1.amazoncognito.com/login',
    logout: 'https://test-domain.auth.us-east-1.amazoncognito.com/logout',
    token: 'https://test-domain.auth.us-east-1.amazoncognito.com/oauth2/token',
  })),
}));

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    authService = new AuthService();
  });

  describe('redirectToLogin', () => {
    test.skip('redirects to Cognito login URL', () => {
      authService.redirectToLogin();
      expect(window.location.href).toBe(
        'https://test-domain.auth.us-east-1.amazoncognito.com/login',
      );
    });
  });

  describe('logout', () => {
    test.skip('clears tokens and redirects to logout URL', async () => {
      await authService.logout();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('aura28_auth_tokens');
      expect(window.location.href).toBe(
        'https://test-domain.auth.us-east-1.amazoncognito.com/logout',
      );
    });
  });

  describe('handleCallback', () => {
    test('exchanges code for tokens successfully', async () => {
      const mockTokenResponse = {
        id_token: 'test-id-token',
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expires_in: 3600,
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockTokenResponse,
      });

      const tokens = await authService.handleCallback('test-code');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://test-domain.auth.us-east-1.amazoncognito.com/oauth2/token',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }),
      );

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'aura28_auth_tokens',
        expect.any(String),
      );

      expect(tokens).toMatchObject({
        idToken: 'test-id-token',
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
      });
    });

    test('throws error when token exchange fails', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        text: async () => 'Invalid authorization code',
      });

      await expect(authService.handleCallback('invalid-code')).rejects.toThrow(
        'Failed to exchange code for tokens: Invalid authorization code',
      );
    });
  });

  describe('getCurrentUser', () => {
    test('returns user when tokens are valid', () => {
      const mockTokens = {
        idToken: 'test-id-token',
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() + 3600000, // 1 hour from now
      };

      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(mockTokens));

      const user = authService.getCurrentUser();

      expect(user).toEqual({
        sub: 'test-user-id',
        email: 'test@example.com',
        email_verified: true,
      });
    });

    test('returns null when no tokens exist', () => {
      localStorageMock.getItem.mockReturnValueOnce(null);
      const user = authService.getCurrentUser();
      expect(user).toBeNull();
    });

    test('returns null when tokens are expired', () => {
      const mockTokens = {
        idToken: 'test-id-token',
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() - 3600000, // 1 hour ago
      };

      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(mockTokens));

      const user = authService.getCurrentUser();
      expect(user).toBeNull();
    });
  });

  describe('isAuthenticated', () => {
    test('returns true when tokens are valid', () => {
      const mockTokens = {
        idToken: 'test-id-token',
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() + 3600000,
      };

      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(mockTokens));

      expect(authService.isAuthenticated()).toBe(true);
    });

    test('returns false when no tokens exist', () => {
      localStorageMock.getItem.mockReturnValueOnce(null);
      expect(authService.isAuthenticated()).toBe(false);
    });

    test('returns false when tokens are expired', () => {
      const mockTokens = {
        idToken: 'test-id-token',
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() - 3600000,
      };

      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(mockTokens));

      expect(authService.isAuthenticated()).toBe(false);
    });
  });

  describe('refreshToken', () => {
    test('refreshes tokens successfully', async () => {
      const mockTokens = {
        idToken: 'old-id-token',
        accessToken: 'old-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() - 3600000,
      };

      const mockRefreshResponse = {
        id_token: 'new-id-token',
        access_token: 'new-access-token',
        expires_in: 3600,
      };

      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(mockTokens));

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockRefreshResponse,
      });

      const newTokens = await authService.refreshToken();

      expect(global.fetch).toHaveBeenCalledWith(
        'https://test-domain.auth.us-east-1.amazoncognito.com/oauth2/token',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }),
      );

      expect(newTokens).toMatchObject({
        idToken: 'new-id-token',
        accessToken: 'new-access-token',
        refreshToken: 'test-refresh-token',
      });

      expect(localStorageMock.setItem).toHaveBeenCalled();
    });

    test('clears tokens when refresh fails', async () => {
      const mockTokens = {
        idToken: 'old-id-token',
        accessToken: 'old-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() - 3600000,
      };

      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(mockTokens));

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
      });

      const result = await authService.refreshToken();

      expect(result).toBeNull();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('aura28_auth_tokens');
    });
  });
});
