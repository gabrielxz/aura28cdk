import { render, screen, waitFor } from '@testing-library/react';
import AuthCallbackPage from '@/app/auth/callback/page';
import { AuthService } from '@/lib/auth/auth-service';
import { useAuth } from '@/lib/auth/use-auth';
import { useRouter, useSearchParams } from 'next/navigation';

// Mock dependencies
jest.mock('@/lib/auth/auth-service');
jest.mock('@/lib/auth/use-auth');
jest.mock('next/navigation');

// Mock window.history
const mockReplaceState = jest.fn();
Object.defineProperty(window, 'history', {
  value: {
    replaceState: mockReplaceState,
  },
  writable: true,
});

// Mock sessionStorage
const sessionStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'sessionStorage', {
  value: sessionStorageMock,
  writable: true,
});

describe('AuthCallbackPage', () => {
  const mockRouter = {
    push: jest.fn(),
    replace: jest.fn(),
  };

  const mockRefreshUser = jest.fn();

  let mockSearchParams: Map<string, string>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset sessionStorage mock
    sessionStorageMock.getItem.mockReturnValue('[]');

    // Setup navigation mocks
    (useRouter as jest.Mock).mockReturnValue(mockRouter);

    // Setup auth hook mock
    (useAuth as jest.Mock).mockReturnValue({
      refreshUser: mockRefreshUser,
    });

    // Setup search params mock
    mockSearchParams = new Map();
    (useSearchParams as jest.Mock).mockReturnValue({
      get: (key: string) => mockSearchParams.get(key) || null,
    });
  });

  describe('Successful authentication flow', () => {
    it('should exchange authorization code for tokens and redirect to dashboard', async () => {
      // Setup
      mockSearchParams.set('code', 'valid-auth-code');

      const mockAuthService = {
        hasValidSession: jest.fn().mockReturnValue(false),
        isAuthenticated: jest.fn().mockReturnValue(false),
        handleCallback: jest.fn().mockResolvedValue({
          idToken: 'test-id-token',
          accessToken: 'test-access-token',
          refreshToken: 'test-refresh-token',
          expiresAt: Date.now() + 3600000,
        }),
      };

      (AuthService as jest.Mock).mockImplementation(() => mockAuthService);

      // Render component
      render(<AuthCallbackPage />);

      // Verify loading state is shown
      expect(screen.getByText('Authenticating...')).toBeInTheDocument();
      expect(screen.getByText('Please wait while we complete your sign in.')).toBeInTheDocument();

      // Wait for authentication to complete
      await waitFor(() => {
        expect(mockAuthService.handleCallback).toHaveBeenCalledWith('valid-auth-code');
      });

      await waitFor(() => {
        expect(mockRefreshUser).toHaveBeenCalled();
      });

      // Verify sessionStorage was updated with processed code
      await waitFor(() => {
        expect(sessionStorageMock.setItem).toHaveBeenCalledWith(
          'processed_auth_codes',
          JSON.stringify(['valid-auth-code']),
        );
      });

      // Verify URL was cleaned
      expect(mockReplaceState).toHaveBeenCalledWith({}, '', '/auth/callback');

      // Verify redirect to dashboard
      expect(mockRouter.replace).toHaveBeenCalledWith('/dashboard');
    });

    it('should redirect to dashboard if already authenticated', async () => {
      // Setup
      mockSearchParams.set('code', 'valid-auth-code');

      const mockAuthService = {
        hasValidSession: jest.fn().mockReturnValue(true),
        isAuthenticated: jest.fn().mockReturnValue(true),
        handleCallback: jest.fn(),
      };

      (AuthService as jest.Mock).mockImplementation(() => mockAuthService);

      // Render component
      render(<AuthCallbackPage />);

      // Wait for redirect
      await waitFor(() => {
        expect(mockRouter.replace).toHaveBeenCalledWith('/dashboard');
      });

      // Verify handleCallback was not called
      expect(mockAuthService.handleCallback).not.toHaveBeenCalled();
    });
  });

  describe('Duplicate code prevention', () => {
    it('should not process already processed authorization codes', async () => {
      // Setup - code already in sessionStorage
      sessionStorageMock.getItem.mockReturnValue(JSON.stringify(['already-used-code']));
      mockSearchParams.set('code', 'already-used-code');

      const mockAuthService = {
        hasValidSession: jest.fn().mockReturnValue(false),
        isAuthenticated: jest.fn().mockReturnValue(false),
        handleCallback: jest.fn(),
      };

      (AuthService as jest.Mock).mockImplementation(() => mockAuthService);

      // Render component
      render(<AuthCallbackPage />);

      // Wait for redirect
      await waitFor(() => {
        expect(mockRouter.replace).toHaveBeenCalledWith('/dashboard');
      });

      // Verify handleCallback was not called
      expect(mockAuthService.handleCallback).not.toHaveBeenCalled();
    });

    it('should prevent duplicate processing using refs', async () => {
      // Setup
      mockSearchParams.set('code', 'valid-auth-code');

      let callCount = 0;
      const mockAuthService = {
        hasValidSession: jest.fn().mockReturnValue(false),
        isAuthenticated: jest.fn().mockReturnValue(false),
        handleCallback: jest.fn().mockImplementation(() => {
          callCount++;
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                idToken: 'test-id-token',
                accessToken: 'test-access-token',
                refreshToken: 'test-refresh-token',
                expiresAt: Date.now() + 3600000,
              });
            }, 100);
          });
        }),
      };

      (AuthService as jest.Mock).mockImplementation(() => mockAuthService);

      // Render component
      const { rerender } = render(<AuthCallbackPage />);

      // Trigger multiple renders
      rerender(<AuthCallbackPage />);
      rerender(<AuthCallbackPage />);

      // Wait for processing
      await waitFor(
        () => {
          expect(mockRouter.replace).toHaveBeenCalled();
        },
        { timeout: 3000 },
      );

      // Verify handleCallback was called only once
      expect(callCount).toBe(1);
    });

    it('should clean up old processed codes keeping only last 5', async () => {
      // Setup - already have 5 codes in storage
      const existingCodes = ['code1', 'code2', 'code3', 'code4', 'code5'];
      sessionStorageMock.getItem.mockReturnValue(JSON.stringify(existingCodes));
      mockSearchParams.set('code', 'new-code');

      const mockAuthService = {
        hasValidSession: jest.fn().mockReturnValue(false),
        isAuthenticated: jest.fn().mockReturnValue(false),
        handleCallback: jest.fn().mockResolvedValue({
          idToken: 'test-id-token',
          accessToken: 'test-access-token',
          refreshToken: 'test-refresh-token',
          expiresAt: Date.now() + 3600000,
        }),
      };

      (AuthService as jest.Mock).mockImplementation(() => mockAuthService);

      // Render component
      render(<AuthCallbackPage />);

      // Wait for processing
      await waitFor(() => {
        expect(mockAuthService.handleCallback).toHaveBeenCalledWith('new-code');
      });

      // Verify old codes were cleaned up
      await waitFor(() => {
        // First call adds the new code
        expect(sessionStorageMock.setItem).toHaveBeenCalledWith(
          'processed_auth_codes',
          JSON.stringify(['code1', 'code2', 'code3', 'code4', 'code5', 'new-code']),
        );
        // Second call removes the oldest
        expect(sessionStorageMock.setItem).toHaveBeenCalledWith(
          'processed_auth_codes',
          JSON.stringify(['code2', 'code3', 'code4', 'code5', 'new-code']),
        );
      });
    });
  });

  describe('Error handling', () => {
    it('should handle authentication errors and display error message', async () => {
      // Setup
      mockSearchParams.set('error', 'access_denied');

      const mockAuthService = {
        hasValidSession: jest.fn().mockReturnValue(false),
        isAuthenticated: jest.fn().mockReturnValue(false),
        handleCallback: jest.fn(),
      };

      (AuthService as jest.Mock).mockImplementation(() => mockAuthService);

      // Render component
      render(<AuthCallbackPage />);

      // Verify error message is displayed
      await waitFor(() => {
        expect(screen.getByText('Authentication Error')).toBeInTheDocument();
        expect(screen.getByText('Authentication failed: access_denied')).toBeInTheDocument();
        expect(screen.getByText('Redirecting to home page...')).toBeInTheDocument();
      });

      // Verify URL was cleaned
      expect(mockReplaceState).toHaveBeenCalledWith({}, '', '/auth/callback');

      // Wait for redirect (after 3 second timeout)
      await waitFor(
        () => {
          expect(mockRouter.replace).toHaveBeenCalledWith('/');
        },
        { timeout: 4000 },
      );
    });

    it('should handle invalid_grant error by redirecting authenticated users to dashboard', async () => {
      // Setup - simulating a case where user is already authenticated
      // but tries to use an expired/used code
      mockSearchParams.set('code', 'expired-code');

      // Mock to simulate already authenticated state
      const mockAuthService = {
        hasValidSession: jest.fn().mockReturnValue(true), // Already has valid session
        isAuthenticated: jest.fn().mockReturnValue(true),
        handleCallback: jest.fn(),
      };

      (AuthService as jest.Mock).mockImplementation(() => mockAuthService);

      // Render component
      render(<AuthCallbackPage />);

      // Should immediately redirect to dashboard without trying to exchange code
      await waitFor(() => {
        expect(mockRouter.replace).toHaveBeenCalledWith('/dashboard');
      });

      // Verify handleCallback was never called since user was already authenticated
      expect(mockAuthService.handleCallback).not.toHaveBeenCalled();
    });

    it('should show specific message for invalid_grant when not authenticated', async () => {
      // Setup
      mockSearchParams.set('code', 'expired-code');

      const mockAuthService = {
        hasValidSession: jest.fn().mockReturnValue(false),
        isAuthenticated: jest.fn().mockReturnValue(false),
        handleCallback: jest.fn().mockRejectedValue(new Error('invalid_grant')),
      };

      (AuthService as jest.Mock).mockImplementation(() => mockAuthService);

      // Render component
      render(<AuthCallbackPage />);

      // Wait for error handling
      await waitFor(() => {
        expect(mockAuthService.handleCallback).toHaveBeenCalledWith('expired-code');
      });

      // Verify specific error message for invalid_grant
      await waitFor(() => {
        expect(screen.getByText('Authentication Error')).toBeInTheDocument();
        expect(
          screen.getByText(
            'Authentication code expired or already used. Please try logging in again.',
          ),
        ).toBeInTheDocument();
      });

      // Verify URL was cleaned
      expect(mockReplaceState).toHaveBeenCalledWith({}, '', '/auth/callback');

      // Wait for redirect
      await waitFor(
        () => {
          expect(mockRouter.replace).toHaveBeenCalledWith('/');
        },
        { timeout: 4000 },
      );
    });

    it('should handle generic errors', async () => {
      // Setup
      mockSearchParams.set('code', 'bad-code');

      const mockAuthService = {
        hasValidSession: jest.fn().mockReturnValue(false),
        isAuthenticated: jest.fn().mockReturnValue(false),
        handleCallback: jest.fn().mockRejectedValue(new Error('Network error')),
      };

      (AuthService as jest.Mock).mockImplementation(() => mockAuthService);

      // Render component
      render(<AuthCallbackPage />);

      // Wait for error handling
      await waitFor(() => {
        expect(mockAuthService.handleCallback).toHaveBeenCalledWith('bad-code');
      });

      // Verify generic error message
      await waitFor(() => {
        expect(screen.getByText('Authentication Error')).toBeInTheDocument();
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });
  });

  describe('Browser navigation scenarios', () => {
    it('should redirect to home when no code is present and not authenticated', async () => {
      // Setup - no code in URL (user navigated back)
      const mockAuthService = {
        hasValidSession: jest.fn().mockReturnValue(false),
        isAuthenticated: jest.fn().mockReturnValue(false),
        handleCallback: jest.fn(),
      };

      (AuthService as jest.Mock).mockImplementation(() => mockAuthService);

      // Render component
      render(<AuthCallbackPage />);

      // Wait for redirect
      await waitFor(() => {
        expect(mockRouter.replace).toHaveBeenCalledWith('/');
      });

      // Verify handleCallback was not called
      expect(mockAuthService.handleCallback).not.toHaveBeenCalled();
    });

    it('should redirect to dashboard when no code is present but authenticated', async () => {
      // Setup - no code in URL but user is authenticated
      const mockAuthService = {
        hasValidSession: jest.fn().mockReturnValue(false),
        isAuthenticated: jest.fn().mockReturnValue(true),
        handleCallback: jest.fn(),
      };

      (AuthService as jest.Mock).mockImplementation(() => mockAuthService);

      // Render component
      render(<AuthCallbackPage />);

      // Wait for redirect
      await waitFor(() => {
        expect(mockRouter.replace).toHaveBeenCalledWith('/dashboard');
      });

      // Verify handleCallback was not called
      expect(mockAuthService.handleCallback).not.toHaveBeenCalled();
    });

    it('should use router.replace instead of router.push to prevent back button issues', async () => {
      // Setup
      mockSearchParams.set('code', 'valid-auth-code');

      const mockAuthService = {
        hasValidSession: jest.fn().mockReturnValue(false),
        isAuthenticated: jest.fn().mockReturnValue(false),
        handleCallback: jest.fn().mockResolvedValue({
          idToken: 'test-id-token',
          accessToken: 'test-access-token',
          refreshToken: 'test-refresh-token',
          expiresAt: Date.now() + 3600000,
        }),
      };

      (AuthService as jest.Mock).mockImplementation(() => mockAuthService);

      // Render component
      render(<AuthCallbackPage />);

      // Wait for authentication and redirect
      await waitFor(() => {
        expect(mockRouter.replace).toHaveBeenCalledWith('/dashboard');
      });

      // Verify push was never called
      expect(mockRouter.push).not.toHaveBeenCalled();
    });
  });

  describe('URL cleanup', () => {
    it('should clean URL immediately after successful authentication', async () => {
      // Setup
      mockSearchParams.set('code', 'valid-auth-code');

      const mockAuthService = {
        hasValidSession: jest.fn().mockReturnValue(false),
        isAuthenticated: jest.fn().mockReturnValue(false),
        handleCallback: jest.fn().mockResolvedValue({
          idToken: 'test-id-token',
          accessToken: 'test-access-token',
          refreshToken: 'test-refresh-token',
          expiresAt: Date.now() + 3600000,
        }),
      };

      (AuthService as jest.Mock).mockImplementation(() => mockAuthService);

      // Render component
      render(<AuthCallbackPage />);

      // Wait for processing
      await waitFor(() => {
        expect(mockAuthService.handleCallback).toHaveBeenCalled();
      });

      // Verify URL was cleaned before redirect
      await waitFor(() => {
        expect(mockReplaceState).toHaveBeenCalledWith({}, '', '/auth/callback');
      });
    });

    it('should clean URL when an error occurs', async () => {
      // Setup
      mockSearchParams.set('code', 'bad-code');

      const mockAuthService = {
        hasValidSession: jest.fn().mockReturnValue(false),
        isAuthenticated: jest.fn().mockReturnValue(false),
        handleCallback: jest.fn().mockRejectedValue(new Error('Auth failed')),
      };

      (AuthService as jest.Mock).mockImplementation(() => mockAuthService);

      // Render component
      render(<AuthCallbackPage />);

      // Wait for error handling
      await waitFor(() => {
        expect(mockAuthService.handleCallback).toHaveBeenCalled();
      });

      // Verify URL was cleaned
      await waitFor(() => {
        expect(mockReplaceState).toHaveBeenCalledWith({}, '', '/auth/callback');
      });
    });

    it('should clean URL when error parameter is present', async () => {
      // Setup
      mockSearchParams.set('error', 'access_denied');

      const mockAuthService = {
        hasValidSession: jest.fn().mockReturnValue(false),
        isAuthenticated: jest.fn().mockReturnValue(false),
        handleCallback: jest.fn(),
      };

      (AuthService as jest.Mock).mockImplementation(() => mockAuthService);

      // Render component
      render(<AuthCallbackPage />);

      // Wait for error handling
      await waitFor(() => {
        expect(screen.getByText('Authentication Error')).toBeInTheDocument();
      });

      // Verify URL was cleaned
      expect(mockReplaceState).toHaveBeenCalledWith({}, '', '/auth/callback');
    });
  });

  describe('Loading states', () => {
    it('should show loading spinner during authentication', () => {
      // Setup
      mockSearchParams.set('code', 'valid-auth-code');

      const mockAuthService = {
        hasValidSession: jest.fn().mockReturnValue(false),
        isAuthenticated: jest.fn().mockReturnValue(false),
        handleCallback: jest.fn().mockImplementation(() => new Promise(() => {})), // Never resolves
      };

      (AuthService as jest.Mock).mockImplementation(() => mockAuthService);

      // Render component
      render(<AuthCallbackPage />);

      // Verify loading state
      expect(screen.getByText('Authenticating...')).toBeInTheDocument();
      expect(screen.getByText('Please wait while we complete your sign in.')).toBeInTheDocument();

      // Check for spinner (by checking for element with animate-spin class)
      const spinner = document.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });

    it('should show suspense fallback initially', () => {
      // Mock useSearchParams to throw a promise (simulating suspense)
      (useSearchParams as jest.Mock).mockImplementation(() => {
        throw new Promise(() => {});
      });

      // Render component
      render(<AuthCallbackPage />);

      // Should show suspense fallback
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });
  });

  describe('Google OAuth specific scenarios', () => {
    it('should handle Google OAuth callback with authorization code', async () => {
      // Setup - Google OAuth returns with code and state parameters
      mockSearchParams.set('code', 'google-auth-code-123');
      mockSearchParams.set('state', 'google-state-123');

      const mockAuthService = {
        hasValidSession: jest.fn().mockReturnValue(false),
        isAuthenticated: jest.fn().mockReturnValue(false),
        handleCallback: jest.fn().mockResolvedValue({
          idToken: 'google-id-token',
          accessToken: 'google-access-token',
          refreshToken: 'google-refresh-token',
          expiresAt: Date.now() + 3600000,
        }),
      };

      (AuthService as jest.Mock).mockImplementation(() => mockAuthService);

      // Render component
      render(<AuthCallbackPage />);

      // Wait for authentication to complete
      await waitFor(() => {
        expect(mockAuthService.handleCallback).toHaveBeenCalledWith('google-auth-code-123');
      });

      await waitFor(() => {
        expect(mockRefreshUser).toHaveBeenCalled();
      });

      // Verify redirect to dashboard
      expect(mockRouter.replace).toHaveBeenCalledWith('/dashboard');
    });

    it('should handle Google OAuth error responses', async () => {
      // Setup - Google OAuth returns with error
      mockSearchParams.set('error', 'access_denied');
      mockSearchParams.set('error_description', 'User+denied+access+to+Google+account');

      const mockAuthService = {
        hasValidSession: jest.fn().mockReturnValue(false),
        isAuthenticated: jest.fn().mockReturnValue(false),
        handleCallback: jest.fn(),
      };

      (AuthService as jest.Mock).mockImplementation(() => mockAuthService);

      // Render component
      render(<AuthCallbackPage />);

      // Verify error message is displayed
      await waitFor(() => {
        expect(screen.getByText('Authentication Error')).toBeInTheDocument();
        expect(screen.getByText('Authentication failed: access_denied')).toBeInTheDocument();
      });

      // Wait for redirect to home
      await waitFor(
        () => {
          expect(mockRouter.replace).toHaveBeenCalledWith('/');
        },
        { timeout: 4000 },
      );
    });

    it('should handle Google user with federated identity in token', async () => {
      // Setup - simulating Google federated user
      mockSearchParams.set('code', 'google-federated-code');

      const mockGoogleTokens = {
        idToken: 'google-jwt-token',
        accessToken: 'google-access-token',
        refreshToken: 'google-refresh-token',
        expiresAt: Date.now() + 3600000,
        // Google federated users might have additional claims
        identityProvider: 'Google',
        federatedIdentity: true,
      };

      const mockAuthService = {
        hasValidSession: jest.fn().mockReturnValue(false),
        isAuthenticated: jest.fn().mockReturnValue(false),
        handleCallback: jest.fn().mockResolvedValue(mockGoogleTokens),
      };

      (AuthService as jest.Mock).mockImplementation(() => mockAuthService);

      // Render component
      render(<AuthCallbackPage />);

      // Wait for authentication to complete
      await waitFor(() => {
        expect(mockAuthService.handleCallback).toHaveBeenCalledWith('google-federated-code');
      });

      // Verify user context was refreshed
      await waitFor(() => {
        expect(mockRefreshUser).toHaveBeenCalled();
      });

      // Verify redirect to dashboard regardless of identity provider
      expect(mockRouter.replace).toHaveBeenCalledWith('/dashboard');
    });

    it('should handle Google account linking scenario', async () => {
      // Setup - user with existing Cognito account signs in with Google
      mockSearchParams.set('code', 'google-linking-code');

      const mockAuthService = {
        hasValidSession: jest.fn().mockReturnValue(false),
        isAuthenticated: jest.fn().mockReturnValue(false),
        handleCallback: jest.fn().mockResolvedValue({
          idToken: 'linked-id-token',
          accessToken: 'linked-access-token',
          refreshToken: 'linked-refresh-token',
          expiresAt: Date.now() + 3600000,
          // Cognito might include account linking information
          linkedAccount: true,
          linkedProvider: 'Google',
        }),
      };

      (AuthService as jest.Mock).mockImplementation(() => mockAuthService);

      // Render component
      render(<AuthCallbackPage />);

      // Wait for authentication to complete
      await waitFor(() => {
        expect(mockAuthService.handleCallback).toHaveBeenCalledWith('google-linking-code');
      });

      // Verify successful authentication flow
      await waitFor(() => {
        expect(mockRefreshUser).toHaveBeenCalled();
      });

      // Verify redirect to dashboard
      expect(mockRouter.replace).toHaveBeenCalledWith('/dashboard');
    });

    it('should handle Google OAuth with missing email verification', async () => {
      // Setup - Google user without verified email (edge case)
      mockSearchParams.set('code', 'google-unverified-email-code');

      const mockAuthService = {
        hasValidSession: jest.fn().mockReturnValue(false),
        isAuthenticated: jest.fn().mockReturnValue(false),
        handleCallback: jest.fn().mockResolvedValue({
          idToken: 'unverified-id-token',
          accessToken: 'unverified-access-token',
          refreshToken: 'unverified-refresh-token',
          expiresAt: Date.now() + 3600000,
          emailVerified: false, // Unverified email
        }),
      };

      (AuthService as jest.Mock).mockImplementation(() => mockAuthService);

      // Render component
      render(<AuthCallbackPage />);

      // Wait for authentication to complete
      await waitFor(() => {
        expect(mockAuthService.handleCallback).toHaveBeenCalledWith('google-unverified-email-code');
      });

      // Should still refresh user and redirect (Cognito handles verification)
      await waitFor(() => {
        expect(mockRefreshUser).toHaveBeenCalled();
      });

      expect(mockRouter.replace).toHaveBeenCalledWith('/dashboard');
    });

    it('should handle rapid Google OAuth redirects', async () => {
      // Setup - simulating rapid redirects/multiple OAuth attempts
      const codes = ['google-code-1', 'google-code-2', 'google-code-3'];
      let currentCodeIndex = 0;

      // Mock changing search params
      (useSearchParams as jest.Mock).mockImplementation(() => ({
        get: (key: string) => {
          if (key === 'code') {
            return codes[currentCodeIndex];
          }
          return null;
        },
      }));

      const mockAuthService = {
        hasValidSession: jest.fn().mockReturnValue(false),
        isAuthenticated: jest.fn().mockReturnValue(false),
        handleCallback: jest.fn().mockImplementation((code: string) => {
          // Only resolve for the first code
          if (code === codes[0]) {
            return Promise.resolve({
              idToken: 'test-id-token',
              accessToken: 'test-access-token',
              refreshToken: 'test-refresh-token',
              expiresAt: Date.now() + 3600000,
            });
          }
          return new Promise(() => {}); // Never resolves for other codes
        }),
      };

      (AuthService as jest.Mock).mockImplementation(() => mockAuthService);

      // Render component with first code
      const { rerender } = render(<AuthCallbackPage />);

      // Simulate rapid re-renders with different codes
      currentCodeIndex = 1;
      rerender(<AuthCallbackPage />);

      currentCodeIndex = 2;
      rerender(<AuthCallbackPage />);

      // Wait for first authentication to complete
      await waitFor(() => {
        expect(mockAuthService.handleCallback).toHaveBeenCalledWith(codes[0]);
      });

      // Should only process the first code due to refs
      expect(mockAuthService.handleCallback).toHaveBeenCalledTimes(1);
    });

    it('should handle Google OAuth timeout scenarios', async () => {
      // Setup - simulating timeout during Google OAuth
      mockSearchParams.set('code', 'google-timeout-code');

      const mockAuthService = {
        hasValidSession: jest.fn().mockReturnValue(false),
        isAuthenticated: jest.fn().mockReturnValue(false),
        handleCallback: jest.fn().mockRejectedValue(new Error('Request timeout')),
      };

      (AuthService as jest.Mock).mockImplementation(() => mockAuthService);

      // Render component
      render(<AuthCallbackPage />);

      // Wait for error handling
      await waitFor(() => {
        expect(mockAuthService.handleCallback).toHaveBeenCalledWith('google-timeout-code');
      });

      // Verify error message
      await waitFor(() => {
        expect(screen.getByText('Authentication Error')).toBeInTheDocument();
        expect(screen.getByText('Request timeout')).toBeInTheDocument();
      });

      // Verify redirect to home after timeout
      await waitFor(
        () => {
          expect(mockRouter.replace).toHaveBeenCalledWith('/');
        },
        { timeout: 4000 },
      );
    });

    it('should preserve Google OAuth state during refresh', async () => {
      // Setup - Google OAuth with state parameter for CSRF protection
      mockSearchParams.set('code', 'google-stateful-code');
      mockSearchParams.set('state', 'csrf-token-123');

      const mockAuthService = {
        hasValidSession: jest.fn().mockReturnValue(false),
        isAuthenticated: jest.fn().mockReturnValue(false),
        handleCallback: jest.fn().mockResolvedValue({
          idToken: 'stateful-id-token',
          accessToken: 'stateful-access-token',
          refreshToken: 'stateful-refresh-token',
          expiresAt: Date.now() + 3600000,
        }),
      };

      (AuthService as jest.Mock).mockImplementation(() => mockAuthService);

      // Render component
      render(<AuthCallbackPage />);

      // The component should process the code regardless of state
      // (Cognito handles state validation internally)
      await waitFor(() => {
        expect(mockAuthService.handleCallback).toHaveBeenCalledWith('google-stateful-code');
      });

      // Verify successful authentication
      await waitFor(() => {
        expect(mockRefreshUser).toHaveBeenCalled();
      });

      expect(mockRouter.replace).toHaveBeenCalledWith('/dashboard');
    });
  });
});
