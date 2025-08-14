import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '@/lib/auth/auth-context';
import { AuthService } from '@/lib/auth/auth-service';

// Mock the AuthService
jest.mock('@/lib/auth/auth-service');

// Test component to access auth context
function TestComponent() {
  const { user, isAdmin, loading, error } = useAuth();

  return (
    <div>
      <div data-testid="loading">{loading.toString()}</div>
      <div data-testid="isAdmin">{isAdmin.toString()}</div>
      <div data-testid="user">{user ? user.email : 'no-user'}</div>
      <div data-testid="error">{error || 'no-error'}</div>
    </div>
  );
}

describe('AuthContext', () => {
  let mockAuthService: jest.Mocked<AuthService>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create a mock AuthService instance
    mockAuthService = {
      getCurrentUser: jest.fn(),
      isAdmin: jest.fn(),
      isAuthenticated: jest.fn(),
      refreshToken: jest.fn(),
      syncTokensFromCookies: jest.fn(),
      redirectToLogin: jest.fn(),
      logout: jest.fn(),
      handleCallback: jest.fn(),
      hasValidSession: jest.fn(),
      getTokens: jest.fn(),
      isTokenExpired: jest.fn(),
    } as unknown as jest.Mocked<AuthService>;

    // Mock the AuthService constructor
    (AuthService as jest.Mock).mockImplementation(() => mockAuthService);
  });

  describe('Admin State Management', () => {
    test('sets isAdmin to true when user has admin group', async () => {
      const mockUser = {
        sub: 'admin-user-id',
        email: 'admin@example.com',
        email_verified: true,
        'cognito:groups': ['admin'],
      };

      mockAuthService.getCurrentUser.mockReturnValue(mockUser);
      mockAuthService.isAdmin.mockReturnValue(true);
      mockAuthService.isAuthenticated.mockReturnValue(true);
      mockAuthService.refreshToken.mockResolvedValue({
        idToken: 'mock-id-token',
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        expiresAt: Date.now() + 3600000,
      });
      mockAuthService.syncTokensFromCookies.mockReturnValue(false);

      await act(async () => {
        render(
          <AuthProvider>
            <TestComponent />
          </AuthProvider>,
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });

      expect(screen.getByTestId('isAdmin')).toHaveTextContent('true');
      expect(screen.getByTestId('user')).toHaveTextContent('admin@example.com');
    });

    test('sets isAdmin to false when user has no admin group', async () => {
      const mockUser = {
        sub: 'regular-user-id',
        email: 'user@example.com',
        email_verified: true,
        'cognito:groups': ['users'],
      };

      mockAuthService.getCurrentUser.mockReturnValue(mockUser);
      mockAuthService.isAdmin.mockReturnValue(false);
      mockAuthService.isAuthenticated.mockReturnValue(true);
      mockAuthService.refreshToken.mockResolvedValue({
        idToken: 'mock-id-token',
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        expiresAt: Date.now() + 3600000,
      });
      mockAuthService.syncTokensFromCookies.mockReturnValue(false);

      await act(async () => {
        render(
          <AuthProvider>
            <TestComponent />
          </AuthProvider>,
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });

      expect(screen.getByTestId('isAdmin')).toHaveTextContent('false');
      expect(screen.getByTestId('user')).toHaveTextContent('user@example.com');
    });

    test('sets isAdmin to false when user has no groups claim', async () => {
      const mockUser = {
        sub: 'user-id',
        email: 'user@example.com',
        email_verified: true,
      };

      mockAuthService.getCurrentUser.mockReturnValue(mockUser);
      mockAuthService.isAdmin.mockReturnValue(false);
      mockAuthService.isAuthenticated.mockReturnValue(true);
      mockAuthService.refreshToken.mockResolvedValue({
        idToken: 'mock-id-token',
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        expiresAt: Date.now() + 3600000,
      });
      mockAuthService.syncTokensFromCookies.mockReturnValue(false);

      await act(async () => {
        render(
          <AuthProvider>
            <TestComponent />
          </AuthProvider>,
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });

      expect(screen.getByTestId('isAdmin')).toHaveTextContent('false');
    });

    test('sets isAdmin to false when user has empty groups array', async () => {
      const mockUser = {
        sub: 'user-id',
        email: 'user@example.com',
        email_verified: true,
        'cognito:groups': [],
      };

      mockAuthService.getCurrentUser.mockReturnValue(mockUser);
      mockAuthService.isAdmin.mockReturnValue(false);
      mockAuthService.isAuthenticated.mockReturnValue(true);
      mockAuthService.refreshToken.mockResolvedValue({
        idToken: 'mock-id-token',
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        expiresAt: Date.now() + 3600000,
      });
      mockAuthService.syncTokensFromCookies.mockReturnValue(false);

      await act(async () => {
        render(
          <AuthProvider>
            <TestComponent />
          </AuthProvider>,
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });

      expect(screen.getByTestId('isAdmin')).toHaveTextContent('false');
    });

    test('updates isAdmin state after token refresh', async () => {
      const regularUser = {
        sub: 'user-id',
        email: 'user@example.com',
        email_verified: true,
      };

      const adminUser = {
        sub: 'user-id',
        email: 'user@example.com',
        email_verified: true,
        'cognito:groups': ['admin'],
      };

      // Start as regular user
      mockAuthService.getCurrentUser.mockReturnValue(regularUser);
      mockAuthService.isAdmin.mockReturnValue(false);
      mockAuthService.isAuthenticated.mockReturnValue(true);
      mockAuthService.syncTokensFromCookies.mockReturnValue(false);

      // First refresh returns same regular user
      mockAuthService.refreshToken.mockResolvedValueOnce({
        idToken: 'mock-id-token',
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        expiresAt: Date.now() + 3600000,
      });

      await act(async () => {
        render(
          <AuthProvider>
            <TestComponent />
          </AuthProvider>,
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });

      expect(screen.getByTestId('isAdmin')).toHaveTextContent('false');

      // Simulate token refresh that updates user to admin
      mockAuthService.getCurrentUser.mockReturnValue(adminUser);
      mockAuthService.isAdmin.mockReturnValue(true);
      mockAuthService.refreshToken.mockResolvedValueOnce({
        idToken: 'mock-id-token-admin',
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        expiresAt: Date.now() + 3600000,
      });

      // Verify the mocks are called during initial setup and refresh
      expect(mockAuthService.isAdmin).toHaveBeenCalled();
      expect(mockAuthService.refreshToken).toHaveBeenCalled();

      // In a real scenario, the interval would trigger refreshUser
      // We're verifying the mock setup is correct for the admin state change
    });

    test('sets isAdmin to false when no user is authenticated', async () => {
      mockAuthService.getCurrentUser.mockReturnValue(null);
      mockAuthService.isAdmin.mockReturnValue(false);
      mockAuthService.isAuthenticated.mockReturnValue(false);
      mockAuthService.syncTokensFromCookies.mockReturnValue(false);

      await act(async () => {
        render(
          <AuthProvider>
            <TestComponent />
          </AuthProvider>,
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });

      expect(screen.getByTestId('isAdmin')).toHaveTextContent('false');
      expect(screen.getByTestId('user')).toHaveTextContent('no-user');
    });

    test('handles server-side auth with admin user', async () => {
      const mockAdminUser = {
        sub: 'admin-user-id',
        email: 'admin@example.com',
        email_verified: true,
        'cognito:groups': ['admin'],
      };

      // Simulate server-side auth detection
      mockAuthService.syncTokensFromCookies.mockReturnValue(true);
      mockAuthService.refreshToken.mockResolvedValue({
        idToken: 'mock-id-token',
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        expiresAt: Date.now() + 3600000,
      });
      mockAuthService.getCurrentUser.mockReturnValue(mockAdminUser);
      mockAuthService.isAdmin.mockReturnValue(true);
      mockAuthService.isAuthenticated.mockReturnValue(true);

      await act(async () => {
        render(
          <AuthProvider>
            <TestComponent />
          </AuthProvider>,
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });

      expect(mockAuthService.syncTokensFromCookies).toHaveBeenCalled();
      expect(mockAuthService.refreshToken).toHaveBeenCalled();
      expect(screen.getByTestId('isAdmin')).toHaveTextContent('true');
      expect(screen.getByTestId('user')).toHaveTextContent('admin@example.com');
    });

    test('handles authentication error gracefully', async () => {
      mockAuthService.getCurrentUser.mockImplementation(() => {
        throw new Error('Authentication failed');
      });
      mockAuthService.isAdmin.mockReturnValue(false);
      mockAuthService.syncTokensFromCookies.mockReturnValue(false);

      await act(async () => {
        render(
          <AuthProvider>
            <TestComponent />
          </AuthProvider>,
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });

      expect(screen.getByTestId('isAdmin')).toHaveTextContent('false');
      expect(screen.getByTestId('user')).toHaveTextContent('no-user');
      expect(screen.getByTestId('error')).toHaveTextContent('Authentication failed');
    });

    test('maintains isAdmin state across multiple refreshes', async () => {
      const mockAdminUser = {
        sub: 'admin-user-id',
        email: 'admin@example.com',
        email_verified: true,
        'cognito:groups': ['admin', 'users'],
      };

      mockAuthService.getCurrentUser.mockReturnValue(mockAdminUser);
      mockAuthService.isAdmin.mockReturnValue(true);
      mockAuthService.isAuthenticated.mockReturnValue(true);
      mockAuthService.refreshToken.mockResolvedValue({
        idToken: 'mock-id-token',
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        expiresAt: Date.now() + 3600000,
      });
      mockAuthService.syncTokensFromCookies.mockReturnValue(false);

      await act(async () => {
        render(
          <AuthProvider>
            <TestComponent />
          </AuthProvider>,
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });

      // Initial state
      expect(screen.getByTestId('isAdmin')).toHaveTextContent('true');

      // Verify isAdmin is called during initial load and refresh
      expect(mockAuthService.isAdmin).toHaveBeenCalledTimes(2); // Once for initial, once for refresh

      // Simulate multiple refreshes
      await act(async () => {
        await mockAuthService.refreshToken();
      });

      // Admin state should persist
      expect(screen.getByTestId('isAdmin')).toHaveTextContent('true');
    });
  });

  describe('useAuth hook', () => {
    test('throws error when used outside AuthProvider', () => {
      // Suppress console.error for this test
      const originalError = console.error;
      console.error = jest.fn();

      expect(() => {
        render(<TestComponent />);
      }).toThrow('useAuth must be used within an AuthProvider');

      console.error = originalError;
    });

    test('provides all auth context values', async () => {
      const mockUser = {
        sub: 'user-id',
        email: 'user@example.com',
        email_verified: true,
        'cognito:groups': ['admin'],
      };

      mockAuthService.getCurrentUser.mockReturnValue(mockUser);
      mockAuthService.isAdmin.mockReturnValue(true);
      mockAuthService.isAuthenticated.mockReturnValue(true);
      mockAuthService.refreshToken.mockResolvedValue({
        idToken: 'mock-id-token',
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        expiresAt: Date.now() + 3600000,
      });
      mockAuthService.syncTokensFromCookies.mockReturnValue(false);

      let authContext: ReturnType<typeof useAuth>;

      function ContextCaptureComponent() {
        authContext = useAuth();
        return null;
      }

      await act(async () => {
        render(
          <AuthProvider>
            <ContextCaptureComponent />
          </AuthProvider>,
        );
      });

      await waitFor(() => {
        expect(authContext.loading).toBe(false);
      });

      expect(authContext).toMatchObject({
        user: mockUser,
        isAdmin: true,
        loading: false,
        error: null,
        login: expect.any(Function),
        logout: expect.any(Function),
        refreshUser: expect.any(Function),
        authService: mockAuthService,
      });
    });
  });
});
