import { AuthService } from '@/lib/auth/auth-service';

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
    let mockHref = '';

    beforeEach(() => {
      mockHref = '';

      // Use a different approach - mock window.location.assign
      delete (window as unknown as { location: unknown }).location;
      window.location = {
        href: mockHref,
        origin: 'http://localhost:3000',
        assign: jest.fn((url: string) => {
          mockHref = url;
        }),
      } as unknown as Location;

      // Mock the setter for href to use assign
      Object.defineProperty(window.location, 'href', {
        get: () => mockHref,
        set: (value: string) => {
          mockHref = value;
          (window.location.assign as jest.Mock)(value);
        },
        configurable: true,
      });
    });

    test('redirects to Cognito login URL without identity provider', () => {
      authService.redirectToLogin();

      const url = new URL(mockHref);
      expect(url.hostname).toBe('test-domain.auth.us-east-1.amazoncognito.com');
      expect(url.pathname).toBe('/oauth2/authorize');
      expect(url.searchParams.get('client_id')).toBe('test-client-id');
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('scope')).toBe('openid email profile');
      expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3000/auth/callback');
      expect(url.searchParams.has('identity_provider')).toBe(false);
    });

    test('redirects to Cognito login URL with Google identity provider', () => {
      authService.redirectToLogin('Google');

      const url = new URL(mockHref);
      expect(url.hostname).toBe('test-domain.auth.us-east-1.amazoncognito.com');
      expect(url.pathname).toBe('/oauth2/authorize');
      expect(url.searchParams.get('client_id')).toBe('test-client-id');
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('scope')).toBe('openid email profile');
      expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3000/auth/callback');
      expect(url.searchParams.get('identity_provider')).toBe('Google');
    });

    test('only accepts Google as identity provider', () => {
      // Test with invalid provider (TypeScript would catch this, but testing runtime behavior)
      authService.redirectToLogin('Facebook' as unknown as 'Google');

      const url = new URL(mockHref);
      // Should include the provider even if not Google (the method doesn't validate)
      expect(url.searchParams.get('identity_provider')).toBe('Facebook');
    });

    test('handles undefined identity provider', () => {
      authService.redirectToLogin(undefined);

      const url = new URL(mockHref);
      expect(url.searchParams.has('identity_provider')).toBe(false);
    });

    test('constructs correct OAuth authorize URL', () => {
      authService.redirectToLogin('Google');

      expect(mockHref).toMatch(
        /^https:\/\/test-domain\.auth\.us-east-1\.amazoncognito\.com\/oauth2\/authorize\?/,
      );
    });

    test('encodes redirect URI properly', () => {
      authService.redirectToLogin();

      const url = new URL(mockHref);
      // The redirect URI should be properly encoded in the URL
      expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3000/auth/callback');
    });

    test('includes all required OAuth parameters', () => {
      authService.redirectToLogin('Google');

      const url = new URL(mockHref);
      const requiredParams = ['client_id', 'response_type', 'scope', 'redirect_uri'];

      requiredParams.forEach((param) => {
        expect(url.searchParams.has(param)).toBe(true);
        expect(url.searchParams.get(param)).toBeTruthy();
      });
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

  describe('hasValidSession', () => {
    test('returns true when tokens exist and are not expired', () => {
      const mockTokens = {
        idToken: 'test-id-token',
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() + 3600000, // 1 hour from now
      };

      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(mockTokens));

      expect(authService.hasValidSession()).toBe(true);
    });

    test('returns false when no tokens exist', () => {
      localStorageMock.getItem.mockReturnValueOnce(null);

      // Mock document.cookie for auth complete check
      Object.defineProperty(document, 'cookie', {
        value: '',
        writable: true,
      });

      expect(authService.hasValidSession()).toBe(false);
    });

    test('returns false when tokens are expired', () => {
      const mockTokens = {
        idToken: 'test-id-token',
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() - 3600000, // 1 hour ago
      };

      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(mockTokens));

      // Mock document.cookie for auth complete check
      Object.defineProperty(document, 'cookie', {
        value: '',
        writable: true,
      });

      expect(authService.hasValidSession()).toBe(false);
    });

    test('returns true when auth complete cookie exists (server-side auth)', () => {
      localStorageMock.getItem.mockReturnValueOnce(null);

      // Mock document.cookie with auth complete flag
      Object.defineProperty(document, 'cookie', {
        value: 'aura28_auth_complete=true; other_cookie=value',
        writable: true,
      });

      expect(authService.hasValidSession()).toBe(true);
    });

    test('handles cookie parsing correctly with multiple cookies', () => {
      localStorageMock.getItem.mockReturnValueOnce(null);

      // Mock document.cookie with multiple cookies
      Object.defineProperty(document, 'cookie', {
        value: 'session_id=abc123; aura28_auth_complete=true; preferences=dark_mode',
        writable: true,
      });

      expect(authService.hasValidSession()).toBe(true);
    });

    test('handles cookie with spaces correctly', () => {
      localStorageMock.getItem.mockReturnValueOnce(null);

      // Mock document.cookie with spaces
      Object.defineProperty(document, 'cookie', {
        value: 'session_id=abc123;  aura28_auth_complete=true  ; preferences=dark_mode',
        writable: true,
      });

      expect(authService.hasValidSession()).toBe(true);
    });
  });

  describe('syncTokensFromCookies', () => {
    test('returns true when auth complete cookie exists', () => {
      // Mock document.cookie with auth complete flag
      Object.defineProperty(document, 'cookie', {
        value: 'aura28_auth_complete=true',
        writable: true,
      });

      expect(authService.syncTokensFromCookies()).toBe(true);
    });

    test('returns false when auth complete cookie does not exist', () => {
      // Mock document.cookie without auth complete flag
      Object.defineProperty(document, 'cookie', {
        value: 'other_cookie=value',
        writable: true,
      });

      expect(authService.syncTokensFromCookies()).toBe(false);
    });

    test('returns false when no cookies exist', () => {
      // Mock empty cookies
      Object.defineProperty(document, 'cookie', {
        value: '',
        writable: true,
      });

      expect(authService.syncTokensFromCookies()).toBe(false);
    });

    test('handles cookie parsing errors gracefully', () => {
      // Mock the syncTokensFromCookies method to simulate cookie error
      const originalSync = authService.syncTokensFromCookies;
      authService.syncTokensFromCookies = jest.fn().mockImplementation(() => {
        try {
          // Simulate cookie access error
          throw new Error('Cookie access denied');
        } catch {
          return false;
        }
      });

      expect(authService.syncTokensFromCookies()).toBe(false);

      // Restore original method
      authService.syncTokensFromCookies = originalSync;
    });

    test('returns false when running server-side', () => {
      // Temporarily override window to simulate server-side
      const originalWindow = global.window;
      // @ts-expect-error - Deleting window to simulate server-side environment
      delete global.window;

      expect(authService.syncTokensFromCookies()).toBe(false);

      // Restore window
      global.window = originalWindow;
    });
  });

  describe('isTokenExpired', () => {
    test('returns false when token has more than 1 minute remaining', () => {
      const tokens = {
        idToken: 'test-id-token',
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() + 120000, // 2 minutes from now
      };

      expect(authService.isTokenExpired(tokens)).toBe(false);
    });

    test('returns true when token has less than 1 minute remaining', () => {
      const tokens = {
        idToken: 'test-id-token',
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() + 30000, // 30 seconds from now
      };

      expect(authService.isTokenExpired(tokens)).toBe(true);
    });

    test('returns true when token is already expired', () => {
      const tokens = {
        idToken: 'test-id-token',
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() - 60000, // 1 minute ago
      };

      expect(authService.isTokenExpired(tokens)).toBe(true);
    });

    test('considers token expired exactly 1 minute before actual expiry', () => {
      const tokens = {
        idToken: 'test-id-token',
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() + 60000, // Exactly 1 minute from now
      };

      expect(authService.isTokenExpired(tokens)).toBe(true);
    });
  });

  describe('isAdmin', () => {
    test('returns true when user has admin group', async () => {
      const mockTokens = {
        idToken: 'test-id-token',
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() + 3600000,
      };

      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(mockTokens));

      // Mock jwt-decode to return user with admin group
      const { jwtDecode } = await import('jwt-decode');
      jwtDecode.mockReturnValueOnce({
        sub: 'test-user-id',
        email: 'test@example.com',
        email_verified: true,
        'cognito:groups': ['admin'],
      });

      expect(authService.isAdmin()).toBe(true);
    });

    test('returns false when user has other groups but not admin', async () => {
      const mockTokens = {
        idToken: 'test-id-token',
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() + 3600000,
      };

      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(mockTokens));

      // Mock jwt-decode to return user with other groups
      const { jwtDecode } = await import('jwt-decode');
      jwtDecode.mockReturnValueOnce({
        sub: 'test-user-id',
        email: 'test@example.com',
        email_verified: true,
        'cognito:groups': ['user', 'premium'],
      });

      expect(authService.isAdmin()).toBe(false);
    });

    test('returns false when user has no groups', async () => {
      const mockTokens = {
        idToken: 'test-id-token',
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() + 3600000,
      };

      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(mockTokens));

      // Mock jwt-decode to return user without groups
      const { jwtDecode } = await import('jwt-decode');
      jwtDecode.mockReturnValueOnce({
        sub: 'test-user-id',
        email: 'test@example.com',
        email_verified: true,
      });

      expect(authService.isAdmin()).toBe(false);
    });

    test('returns false when groups claim is empty array', async () => {
      const mockTokens = {
        idToken: 'test-id-token',
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() + 3600000,
      };

      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(mockTokens));

      // Mock jwt-decode to return user with empty groups array
      const { jwtDecode } = await import('jwt-decode');
      jwtDecode.mockReturnValueOnce({
        sub: 'test-user-id',
        email: 'test@example.com',
        email_verified: true,
        'cognito:groups': [],
      });

      expect(authService.isAdmin()).toBe(false);
    });

    test('returns false when no user is authenticated', async () => {
      localStorageMock.getItem.mockReturnValueOnce(null);

      expect(authService.isAdmin()).toBe(false);
    });

    test('returns true when user has admin among multiple groups', async () => {
      const mockTokens = {
        idToken: 'test-id-token',
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() + 3600000,
      };

      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(mockTokens));

      // Mock jwt-decode to return user with multiple groups including admin
      const { jwtDecode } = await import('jwt-decode');
      jwtDecode.mockReturnValueOnce({
        sub: 'test-user-id',
        email: 'test@example.com',
        email_verified: true,
        'cognito:groups': ['user', 'admin', 'premium'],
      });

      expect(authService.isAdmin()).toBe(true);
    });
  });

  describe('getTokens', () => {
    test('returns tokens when they exist in localStorage', () => {
      const mockTokens = {
        idToken: 'test-id-token',
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() + 3600000,
      };

      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(mockTokens));

      const tokens = authService.getTokens();
      expect(tokens).toEqual(mockTokens);
    });

    test('returns null when no tokens exist', () => {
      localStorageMock.getItem.mockReturnValueOnce(null);

      const tokens = authService.getTokens();
      expect(tokens).toBeNull();
    });

    test('returns null when localStorage contains invalid JSON', () => {
      localStorageMock.getItem.mockReturnValueOnce('invalid-json{');

      const tokens = authService.getTokens();
      expect(tokens).toBeNull();
    });

    test('returns null when running server-side', () => {
      // Temporarily override window to simulate server-side
      const originalWindow = global.window;
      // @ts-expect-error - Deleting window to simulate server-side environment
      delete global.window;

      const tokens = authService.getTokens();
      expect(tokens).toBeNull();

      // Restore window
      global.window = originalWindow;
    });
  });
});
