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

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
}));

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
      authService: {
        getCurrentUser: jest.fn().mockReturnValue(null),
        getIdToken: jest.fn().mockResolvedValue(null),
        isAdmin: jest.fn().mockReturnValue(false),
      },
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
      authService: {
        getCurrentUser: jest.fn().mockReturnValue(null),
        getIdToken: jest.fn().mockResolvedValue(null),
        isAdmin: jest.fn().mockReturnValue(false),
      },
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
      authService: {
        getCurrentUser: jest.fn().mockReturnValue(null),
        getIdToken: jest.fn().mockResolvedValue(null),
        isAdmin: jest.fn().mockReturnValue(false),
      },
    });

    render(<Header />);
    const loginButton = screen.getByText('Login');
    expect(loginButton).toBeInTheDocument();

    fireEvent.click(loginButton);
    expect(mockLogin).toHaveBeenCalledTimes(1);
  });

  test('shows user dropdown and dashboard link when authenticated', () => {
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
      authService: {
        getCurrentUser: jest.fn().mockReturnValue(mockUser),
        getIdToken: jest.fn().mockResolvedValue('mock-token'),
        isAdmin: jest.fn().mockReturnValue(false),
      },
    });

    render(<Header />);

    // Check dashboard link
    const dashboardLink = screen.getByText('Dashboard');
    expect(dashboardLink).toBeInTheDocument();
    expect(dashboardLink.closest('a')).toHaveAttribute('href', '/dashboard');

    // Check user dropdown (avatar button)
    const avatarButton = screen.getByRole('button');
    expect(avatarButton).toBeInTheDocument();
  });
});
