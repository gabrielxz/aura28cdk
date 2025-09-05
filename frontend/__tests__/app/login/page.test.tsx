import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import LoginPage from '@/app/login/page';
import { useAuth } from '@/lib/auth/use-auth';
import { useRouter } from 'next/navigation';
import { AuthService } from '@/lib/auth/auth-service';

// Mock the auth hook
jest.mock('@/lib/auth/use-auth');

// Mock next/navigation
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

// Mock AuthService
jest.mock('@/lib/auth/auth-service', () => ({
  AuthService: jest.fn().mockImplementation(() => ({
    redirectToLogin: jest.fn(),
  })),
}));

// Mock the GoogleSignInButton component
jest.mock('@/components/ui/google-signin-button', () => ({
  GoogleSignInButton: ({ className }: { className?: string }) => (
    <button className={className} aria-label="Sign in with Google">
      Continue with Google
    </button>
  ),
}));

// Mock StarsBackground component
jest.mock('@/components/StarsBackground', () => {
  return function StarsBackground() {
    return <div data-testid="stars-background" />;
  };
});

describe('LoginPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
    });
  });

  describe('when user is not authenticated', () => {
    beforeEach(() => {
      (useAuth as jest.Mock).mockReturnValue({
        user: null,
        loading: false,
      });
    });

    it('renders the login page with all elements', () => {
      render(<LoginPage />);

      // Check for main heading
      expect(screen.getByText('Welcome to Aura 28')).toBeInTheDocument();
      expect(screen.getByText('Sign in to access your soul blueprint')).toBeInTheDocument();

      // Check for sign-in buttons
      expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign in with email/i })).toBeInTheDocument();

      // Check for divider
      expect(screen.getByText('Or')).toBeInTheDocument();

      // Check for legal links
      expect(screen.getByText(/Terms of Service/i)).toBeInTheDocument();
      expect(screen.getByText(/Privacy Policy/i)).toBeInTheDocument();

      // Check for background
      expect(screen.getByTestId('stars-background')).toBeInTheDocument();
    });

    it('renders with correct styling classes', () => {
      const { container } = render(<LoginPage />);

      // Check backdrop blur styling
      const mainCard = container.querySelector('.backdrop-blur-md');
      expect(mainCard).toBeInTheDocument();
      expect(mainCard).toHaveClass('bg-white/10', 'border', 'border-white/20', 'rounded-2xl');

      // Check gradient background
      const background = container.querySelector('.bg-aura-gradient');
      expect(background).toBeInTheDocument();
    });

    it('handles email sign-in button click', () => {
      const mockRedirectToLogin = jest.fn();
      (AuthService as jest.Mock).mockImplementation(() => ({
        redirectToLogin: mockRedirectToLogin,
      }));

      render(<LoginPage />);

      const emailButton = screen.getByRole('button', { name: /sign in with email/i });
      fireEvent.click(emailButton);

      expect(AuthService).toHaveBeenCalledTimes(1);
      expect(mockRedirectToLogin).toHaveBeenCalledWith();
      expect(mockRedirectToLogin).toHaveBeenCalledTimes(1);
    });

    it('displays Continue with Email text on email button', () => {
      render(<LoginPage />);

      const emailButton = screen.getByRole('button', { name: /sign in with email/i });
      expect(emailButton).toHaveTextContent('Continue with Email');
    });

    it('renders email button with correct icon', () => {
      render(<LoginPage />);

      const emailButton = screen.getByRole('button', { name: /sign in with email/i });
      const svg = emailButton.querySelector('svg');
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveClass('w-5', 'h-5');
    });

    it('applies hover styles to email button', () => {
      render(<LoginPage />);

      const emailButton = screen.getByRole('button', { name: /sign in with email/i });
      expect(emailButton).toHaveClass('hover:bg-purple-600/30', 'hover:border-purple-500/50');
    });

    it('has correct focus styles on email button', () => {
      render(<LoginPage />);

      const emailButton = screen.getByRole('button', { name: /sign in with email/i });
      expect(emailButton).toHaveClass(
        'focus:outline-none',
        'focus:ring-2',
        'focus:ring-purple-500/50',
        'focus:ring-offset-2',
        'focus:ring-offset-gray-900',
      );
    });

    it('renders legal text with proper links', () => {
      render(<LoginPage />);

      const termsLink = screen.getByText('Terms of Service');
      const privacyLink = screen.getByText('Privacy Policy');

      expect(termsLink).toHaveAttribute('href', '#');
      expect(termsLink).toHaveClass('text-purple-400', 'hover:text-purple-300');

      expect(privacyLink).toHaveAttribute('href', '#');
      expect(privacyLink).toHaveClass('text-purple-400', 'hover:text-purple-300');
    });

    it('has proper layout structure', () => {
      const { container } = render(<LoginPage />);

      // Check for max width container
      const maxWidthContainer = container.querySelector('.max-w-md');
      expect(maxWidthContainer).toBeInTheDocument();

      // Check for centered content
      const centeredContent = container.querySelector(
        '.flex.min-h-screen.items-center.justify-center',
      );
      expect(centeredContent).toBeInTheDocument();
    });

    it('creates new AuthService instance when clicking email button', () => {
      render(<LoginPage />);

      const emailButton = screen.getByRole('button', { name: /sign in with email/i });
      fireEvent.click(emailButton);

      expect(AuthService).toHaveBeenCalledWith();
    });
  });

  describe('when user is authenticated', () => {
    beforeEach(() => {
      (useAuth as jest.Mock).mockReturnValue({
        user: {
          sub: 'test-user-id',
          email: 'test@example.com',
          email_verified: true,
        },
        loading: false,
      });
    });

    it('redirects to dashboard', async () => {
      render(<LoginPage />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/dashboard');
      });
    });

    it('shows redirecting message', () => {
      render(<LoginPage />);

      expect(screen.getByText('Redirecting...')).toBeInTheDocument();
      expect(
        screen.getByText('Please wait while we redirect you to the dashboard.'),
      ).toBeInTheDocument();
    });

    it('renders redirecting UI with proper styling', () => {
      const { container } = render(<LoginPage />);

      const redirectCard = container.querySelector('.backdrop-blur-md');
      expect(redirectCard).toBeInTheDocument();
      expect(redirectCard).toHaveClass('bg-white/10', 'border', 'border-white/20', 'rounded-2xl');

      const heading = screen.getByText('Redirecting...');
      expect(heading).toHaveClass('text-2xl', 'font-bold', 'text-[#ffb74d]');
    });

    it('does not show login buttons when authenticated', () => {
      render(<LoginPage />);

      expect(
        screen.queryByRole('button', { name: /sign in with google/i }),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /sign in with email/i })).not.toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    beforeEach(() => {
      (useAuth as jest.Mock).mockReturnValue({
        user: null,
        loading: false,
      });
    });

    it('has proper ARIA labels on buttons', () => {
      render(<LoginPage />);

      const googleButton = screen.getByRole('button', { name: /sign in with google/i });
      const emailButton = screen.getByRole('button', { name: /sign in with email/i });

      expect(googleButton).toHaveAttribute('aria-label', 'Sign in with Google');
      expect(emailButton).toHaveAttribute('aria-label', 'Sign in with email');
    });

    it('has proper heading hierarchy', () => {
      render(<LoginPage />);

      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toHaveTextContent('Welcome to Aura 28');
    });

    it('buttons are keyboard accessible', () => {
      render(<LoginPage />);

      const emailButton = screen.getByRole('button', { name: /sign in with email/i });
      emailButton.focus();
      expect(emailButton).toHaveFocus();

      // Simulate Enter key press
      fireEvent.keyDown(emailButton, { key: 'Enter', code: 'Enter' });
      expect(AuthService).toHaveBeenCalled();
    });
  });

  describe('responsive design', () => {
    beforeEach(() => {
      (useAuth as jest.Mock).mockReturnValue({
        user: null,
        loading: false,
      });
    });

    it('has responsive padding', () => {
      const { container } = render(<LoginPage />);

      const responsiveContainer = container.querySelector('.px-4');
      expect(responsiveContainer).toBeInTheDocument();
    });

    it('uses full width on mobile', () => {
      const { container } = render(<LoginPage />);

      const fullWidthContainer = container.querySelector('.w-full');
      expect(fullWidthContainer).toBeInTheDocument();
    });
  });

  describe('error scenarios', () => {
    beforeEach(() => {
      (useAuth as jest.Mock).mockReturnValue({
        user: null,
        loading: false,
      });
    });

    it('handles AuthService instantiation error gracefully', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      (AuthService as jest.Mock).mockImplementation(() => {
        throw new Error('Failed to create AuthService');
      });

      render(<LoginPage />);

      const emailButton = screen.getByRole('button', { name: /sign in with email/i });

      // Should throw when clicked since the component doesn't handle this error
      expect(() => fireEvent.click(emailButton)).toThrow('Failed to create AuthService');

      consoleErrorSpy.mockRestore();
    });

    it('handles redirectToLogin error gracefully', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const mockRedirectToLogin = jest.fn().mockImplementation(() => {
        throw new Error('Redirect failed');
      });

      (AuthService as jest.Mock).mockImplementation(() => ({
        redirectToLogin: mockRedirectToLogin,
      }));

      render(<LoginPage />);

      const emailButton = screen.getByRole('button', { name: /sign in with email/i });

      // Should throw when clicked since the component doesn't handle this error
      expect(() => fireEvent.click(emailButton)).toThrow('Redirect failed');

      consoleErrorSpy.mockRestore();
    });
  });

  describe('loading states', () => {
    it('does not redirect when user data is still loading', () => {
      (useAuth as jest.Mock).mockReturnValue({
        user: null,
        loading: true,
      });

      render(<LoginPage />);

      expect(mockPush).not.toHaveBeenCalled();

      // Should still show login page
      expect(screen.getByText('Welcome to Aura 28')).toBeInTheDocument();
    });
  });

  describe('integration with Google OAuth', () => {
    beforeEach(() => {
      (useAuth as jest.Mock).mockReturnValue({
        user: null,
        loading: false,
      });
    });

    it('renders GoogleSignInButton component', () => {
      render(<LoginPage />);

      const googleButton = screen.getByRole('button', { name: /sign in with google/i });
      expect(googleButton).toBeInTheDocument();
      expect(googleButton).toHaveTextContent('Continue with Google');
    });

    it('positions Google button above email button', () => {
      const { container } = render(<LoginPage />);

      const buttons = container.querySelectorAll('button');
      expect(buttons[0]).toHaveAttribute('aria-label', 'Sign in with Google');
      expect(buttons[1]).toHaveAttribute('aria-label', 'Sign in with email');
    });
  });
});
