import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { GoogleSignInButton } from '@/components/ui/google-signin-button';
import { AuthService } from '@/lib/auth/auth-service';

// Mock the AuthService
jest.mock('@/lib/auth/auth-service', () => ({
  AuthService: jest.fn().mockImplementation(() => ({
    redirectToLogin: jest.fn(),
  })),
}));

describe('GoogleSignInButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock window.location.href
    delete (window as unknown as { location: Location }).location;
    (window as unknown as { location: { href: string } }).location = { href: '' };
  });

  it('renders the Google sign-in button with correct text', () => {
    render(<GoogleSignInButton />);

    const button = screen.getByRole('button', { name: /sign in with google/i });
    expect(button).toBeInTheDocument();
    expect(screen.getByText('Continue with Google')).toBeInTheDocument();
  });

  it('contains the Google logo SVG', () => {
    const { container } = render(<GoogleSignInButton />);

    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('width', '20');
    expect(svg).toHaveAttribute('height', '20');
  });

  it('calls AuthService.redirectToLogin with Google parameter when clicked', () => {
    const mockRedirectToLogin = jest.fn();
    (AuthService as jest.Mock).mockImplementation(() => ({
      redirectToLogin: mockRedirectToLogin,
    }));

    render(<GoogleSignInButton />);

    const button = screen.getByRole('button', { name: /sign in with google/i });
    fireEvent.click(button);

    expect(AuthService).toHaveBeenCalledTimes(1);
    expect(mockRedirectToLogin).toHaveBeenCalledWith('Google');
  });

  it('applies custom className when provided', () => {
    const customClass = 'custom-test-class';
    render(<GoogleSignInButton className={customClass} />);

    const button = screen.getByRole('button', { name: /sign in with google/i });
    expect(button).toHaveClass(customClass);
  });

  it('has proper accessibility attributes', () => {
    render(<GoogleSignInButton />);

    const button = screen.getByRole('button', { name: /sign in with google/i });
    expect(button).toHaveAttribute('aria-label', 'Sign in with Google');
  });

  it('applies correct styling classes for dark theme', () => {
    render(<GoogleSignInButton />);

    const button = screen.getByRole('button', { name: /sign in with google/i });
    expect(button).toHaveClass('bg-white/10');
    expect(button).toHaveClass('border-white/20');
    expect(button).toHaveClass('text-white');
    expect(button).toHaveClass('hover:bg-white/20');
    expect(button).toHaveClass('hover:border-purple-500/50');
  });
});
