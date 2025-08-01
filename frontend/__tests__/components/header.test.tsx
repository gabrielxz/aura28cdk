import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Header } from '@/components/header';
import { useAuth } from '@/lib/auth/use-auth';

// Mock the auth hook
jest.mock('@/lib/auth/use-auth');

// Mock next/link
jest.mock('next/link', () => {
  return {
    __esModule: true,
    default: ({ children, href }: { children: React.ReactNode; href: string }) => (
      <a href={href}>{children}</a>
    ),
  };
});

describe('Header', () => {
  const mockLogin = jest.fn();
  const mockLogout = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders logo link', () => {
    (useAuth as jest.Mock).mockReturnValue({
      user: null,
      loading: false,
      login: mockLogin,
      logout: mockLogout,
    });

    render(<Header />);
    const logo = screen.getByText('Aura28');
    expect(logo).toBeInTheDocument();
    expect(logo.closest('a')).toHaveAttribute('href', '/');
  });

  test('shows loading state', () => {
    (useAuth as jest.Mock).mockReturnValue({
      user: null,
      loading: true,
      login: mockLogin,
      logout: mockLogout,
    });

    render(<Header />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();
  });

  test('shows login button when not authenticated', () => {
    (useAuth as jest.Mock).mockReturnValue({
      user: null,
      loading: false,
      login: mockLogin,
      logout: mockLogout,
    });

    render(<Header />);
    const loginButton = screen.getByText('Login');
    expect(loginButton).toBeInTheDocument();

    fireEvent.click(loginButton);
    expect(mockLogin).toHaveBeenCalledTimes(1);
  });

  test('shows logout button and dashboard link when authenticated', () => {
    const mockUser = {
      sub: '123',
      email: 'test@example.com',
      email_verified: true,
    };

    (useAuth as jest.Mock).mockReturnValue({
      user: mockUser,
      loading: false,
      login: mockLogin,
      logout: mockLogout,
    });

    render(<Header />);

    // Check dashboard link
    const dashboardLink = screen.getByText('Dashboard');
    expect(dashboardLink).toBeInTheDocument();
    expect(dashboardLink.closest('a')).toHaveAttribute('href', '/dashboard');

    // Check logout button
    const logoutButton = screen.getByText('Logout');
    expect(logoutButton).toBeInTheDocument();

    fireEvent.click(logoutButton);
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
});
