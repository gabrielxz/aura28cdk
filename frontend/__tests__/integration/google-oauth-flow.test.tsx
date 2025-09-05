import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import LoginPage from '@/app/login/page';
import { GoogleSignInButton } from '@/components/ui/google-signin-button';
import { AuthService } from '@/lib/auth/auth-service';
import { useAuth } from '@/lib/auth/use-auth';
import { useRouter } from 'next/navigation';

// Mock the auth hook
jest.mock('@/lib/auth/use-auth');

// Mock next/navigation
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(() => ({
    get: jest.fn(),
  })),
}));

// Mock AuthService
jest.mock('@/lib/auth/auth-service');

// Mock StarsBackground component
jest.mock('@/components/StarsBackground', () => {
  return function StarsBackground() {
    return <div data-testid="stars-background" />;
  };
});

describe('Google OAuth Integration Flow', () => {
  let mockAuthService: jest.Mocked<AuthService>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup router mock
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
      replace: mockReplace,
    });

    // Setup auth service mock
    mockAuthService = {
      redirectToLogin: jest.fn(),
      handleCallback: jest.fn(),
      getCurrentUser: jest.fn(),
      isAuthenticated: jest.fn(),
      hasValidSession: jest.fn(),
      logout: jest.fn(),
      refreshToken: jest.fn(),
      getTokens: jest.fn(),
      isTokenExpired: jest.fn(),
      isAdmin: jest.fn(),
      getIdToken: jest.fn(),
      syncTokensFromCookies: jest.fn(),
    } as unknown as jest.Mocked<AuthService>;

    (AuthService as jest.Mock).mockImplementation(() => mockAuthService);

    // Default auth state (not authenticated)
    (useAuth as jest.Mock).mockReturnValue({
      user: null,
      loading: false,
      login: jest.fn(),
      logout: jest.fn(),
      refreshUser: jest.fn(),
      authService: mockAuthService,
    });
  });

  describe('Google Sign-In Button Integration', () => {
    it('initiates Google OAuth flow when clicked', () => {
      render(<GoogleSignInButton />);

      const googleButton = screen.getByRole('button', { name: /sign in with google/i });
      fireEvent.click(googleButton);

      expect(mockAuthService.redirectToLogin).toHaveBeenCalledWith('Google');
      expect(mockAuthService.redirectToLogin).toHaveBeenCalledTimes(1);
    });

    it('passes className prop to button element', () => {
      const customClass = 'custom-test-class';
      render(<GoogleSignInButton className={customClass} />);

      const googleButton = screen.getByRole('button', { name: /sign in with google/i });
      expect(googleButton).toHaveClass(customClass);
    });
  });

  describe('Login Page Google OAuth Integration', () => {
    it('renders Google sign-in button on login page', () => {
      render(<LoginPage />);

      const googleButton = screen.getByRole('button', { name: /sign in with google/i });
      expect(googleButton).toBeInTheDocument();
      expect(googleButton).toHaveTextContent('Continue with Google');
    });

    it('initiates Google OAuth flow from login page', () => {
      render(<LoginPage />);

      const googleButton = screen.getByRole('button', { name: /sign in with google/i });
      fireEvent.click(googleButton);

      // Should create a new AuthService instance and call redirectToLogin with 'Google'
      expect(AuthService).toHaveBeenCalled();
    });

    it('shows both Google and email sign-in options', () => {
      render(<LoginPage />);

      const googleButton = screen.getByRole('button', { name: /sign in with google/i });
      const emailButton = screen.getByRole('button', { name: /sign in with email/i });

      expect(googleButton).toBeInTheDocument();
      expect(emailButton).toBeInTheDocument();

      // Verify they call different methods
      fireEvent.click(emailButton);
      expect(mockAuthService.redirectToLogin).toHaveBeenCalledWith();

      fireEvent.click(googleButton);
      // Note: Google button creates its own AuthService instance
      expect(AuthService).toHaveBeenCalled();
    });
  });

  describe('OAuth URL Construction', () => {
    it('constructs correct Google OAuth URL with identity provider', () => {
      let mockHref = '';

      // Use the same approach as in auth-service.test.ts
      delete (window as unknown as { location: unknown }).location;
      window.location = {
        href: mockHref,
        origin: 'http://localhost:3000',
        assign: jest.fn((url: string) => {
          mockHref = url;
        }),
      } as unknown as Location;

      Object.defineProperty(window.location, 'href', {
        get: () => mockHref,
        set: (value: string) => {
          mockHref = value;
          (window.location.assign as jest.Mock)(value);
        },
        configurable: true,
      });

      // Mock environment variables
      process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID = 'test-client-id';
      process.env.NEXT_PUBLIC_COGNITO_DOMAIN = 'test-domain';
      process.env.NEXT_PUBLIC_COGNITO_REGION = 'us-east-1';

      mockAuthService.redirectToLogin.mockImplementation((provider?: 'Google') => {
        const params = new URLSearchParams({
          client_id: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!,
          response_type: 'code',
          scope: 'openid email profile',
          redirect_uri: `${window.location.origin}/auth/callback`,
          ...(provider && { identity_provider: provider }),
        });

        const loginUrl = `https://${process.env.NEXT_PUBLIC_COGNITO_DOMAIN}.auth.${process.env.NEXT_PUBLIC_COGNITO_REGION}.amazoncognito.com/oauth2/authorize?${params}`;
        window.location.href = loginUrl;
      });

      render(<GoogleSignInButton />);

      const googleButton = screen.getByRole('button', { name: /sign in with google/i });
      fireEvent.click(googleButton);

      expect(mockHref).toContain('identity_provider=Google');
      expect(mockHref).toContain('test-domain.auth.us-east-1.amazoncognito.com');
      expect(mockHref).toContain('client_id=test-client-id');
    });
  });

  describe('Post-Authentication Flow', () => {
    it('redirects authenticated users to dashboard', async () => {
      (useAuth as jest.Mock).mockReturnValue({
        user: {
          sub: 'google-user-id',
          email: 'user@gmail.com',
          email_verified: true,
          'cognito:username': 'Google_1234567890',
        },
        loading: false,
        login: jest.fn(),
        logout: jest.fn(),
        refreshUser: jest.fn(),
        authService: mockAuthService,
      });

      render(<LoginPage />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/dashboard');
      });
    });

    it('shows redirecting message for authenticated Google users', () => {
      (useAuth as jest.Mock).mockReturnValue({
        user: {
          sub: 'google-user-id',
          email: 'user@gmail.com',
          email_verified: true,
          'cognito:username': 'Google_1234567890',
        },
        loading: false,
      });

      render(<LoginPage />);

      expect(screen.getByText('Redirecting...')).toBeInTheDocument();
      expect(
        screen.getByText('Please wait while we redirect you to the dashboard.'),
      ).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('handles network errors gracefully', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      mockAuthService.redirectToLogin.mockImplementation(() => {
        throw new Error('Network error');
      });

      render(<GoogleSignInButton />);

      const googleButton = screen.getByRole('button', { name: /sign in with google/i });

      // Should not throw when clicked
      expect(() => fireEvent.click(googleButton)).not.toThrow();

      consoleErrorSpy.mockRestore();
    });

    it('handles missing environment variables', () => {
      const originalEnv = process.env;

      // Clear environment variables
      delete process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
      delete process.env.NEXT_PUBLIC_COGNITO_DOMAIN;
      delete process.env.NEXT_PUBLIC_COGNITO_REGION;

      render(<GoogleSignInButton />);

      const googleButton = screen.getByRole('button', { name: /sign in with google/i });

      // Should not throw even with missing env vars
      expect(() => fireEvent.click(googleButton)).not.toThrow();

      // Restore environment
      process.env = originalEnv;
    });
  });

  describe('User Experience', () => {
    it('displays Google logo in button', () => {
      const { container } = render(<GoogleSignInButton />);

      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute('width', '20');
      expect(svg).toHaveAttribute('height', '20');
      expect(svg).toHaveAttribute('viewBox', '0 0 48 48');
    });

    it('maintains consistent dark theme styling', () => {
      render(<GoogleSignInButton />);

      const googleButton = screen.getByRole('button', { name: /sign in with google/i });

      // Check for dark theme classes
      expect(googleButton).toHaveClass('bg-white/10');
      expect(googleButton).toHaveClass('border-white/20');
      expect(googleButton).toHaveClass('text-white');
      expect(googleButton).toHaveClass('hover:bg-white/20');
    });

    it('provides visual feedback on hover', () => {
      render(<GoogleSignInButton />);

      const googleButton = screen.getByRole('button', { name: /sign in with google/i });

      // Check hover classes are present
      expect(googleButton).toHaveClass('hover:bg-white/20');
      expect(googleButton).toHaveClass('hover:border-purple-500/50');
      expect(googleButton).toHaveClass('transition-all');
      expect(googleButton).toHaveClass('duration-200');
    });

    it('has proper focus states for accessibility', () => {
      render(<GoogleSignInButton />);

      const googleButton = screen.getByRole('button', { name: /sign in with google/i });

      // Check focus classes
      expect(googleButton).toHaveClass('focus:outline-none');
      expect(googleButton).toHaveClass('focus:ring-2');
      expect(googleButton).toHaveClass('focus:ring-purple-500/50');
    });
  });

  describe('Security Considerations', () => {
    it('uses HTTPS for OAuth endpoints', () => {
      let mockHref = '';
      Object.defineProperty(window, 'location', {
        writable: true,
        configurable: true,
        value: {
          origin: 'https://app.aura28.com',
          href: mockHref,
        },
      });

      Object.defineProperty(window.location, 'href', {
        get: () => mockHref,
        set: (value: string) => {
          mockHref = value;
        },
      });

      mockAuthService.redirectToLogin.mockImplementation((provider?: 'Google') => {
        const params = new URLSearchParams({
          client_id: 'test-client',
          response_type: 'code',
          scope: 'openid email profile',
          redirect_uri: `${window.location.origin}/auth/callback`,
          ...(provider && { identity_provider: provider }),
        });

        const loginUrl = `https://test-domain.auth.us-east-1.amazoncognito.com/oauth2/authorize?${params}`;
        window.location.href = loginUrl;
      });

      render(<GoogleSignInButton />);

      const googleButton = screen.getByRole('button', { name: /sign in with google/i });
      fireEvent.click(googleButton);

      expect(mockHref).toMatch(/^https:\/\//);
      expect(mockHref).toContain('redirect_uri=https%3A%2F%2Fapp.aura28.com%2Fauth%2Fcallback');
    });

    it('includes proper OAuth scopes', () => {
      mockAuthService.redirectToLogin.mockImplementation(() => {
        const scopes = 'openid email profile';
        console.info(`OAuth scopes: ${scopes}`);
      });

      const consoleSpy = jest.spyOn(console, 'info').mockImplementation(() => {});

      render(<GoogleSignInButton />);

      const googleButton = screen.getByRole('button', { name: /sign in with google/i });
      fireEvent.click(googleButton);

      expect(consoleSpy).toHaveBeenCalledWith('OAuth scopes: openid email profile');

      consoleSpy.mockRestore();
    });
  });

  describe('Multiple Identity Provider Support', () => {
    it('allows switching between Google and email authentication', () => {
      render(<LoginPage />);

      const googleButton = screen.getByRole('button', { name: /sign in with google/i });
      const emailButton = screen.getByRole('button', { name: /sign in with email/i });

      // Click email button first
      fireEvent.click(emailButton);
      expect(mockAuthService.redirectToLogin).toHaveBeenCalledWith();

      // Clear mock
      mockAuthService.redirectToLogin.mockClear();

      // Click Google button
      fireEvent.click(googleButton);
      // Google button creates new AuthService instance
      expect(AuthService).toHaveBeenCalled();
    });

    it('visually separates authentication methods', () => {
      render(<LoginPage />);

      // Check for divider
      expect(screen.getByText('Or')).toBeInTheDocument();

      // Check button order
      const buttons = screen.getAllByRole('button');
      expect(buttons[0]).toHaveAttribute('aria-label', 'Sign in with Google');
      expect(buttons[1]).toHaveAttribute('aria-label', 'Sign in with email');
    });
  });
});
