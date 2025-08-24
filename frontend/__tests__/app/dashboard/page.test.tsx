import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { useRouter, useSearchParams } from 'next/navigation';
import DashboardPage from '@/app/dashboard/page';
import { useAuth } from '@/lib/auth/use-auth';
import { UserApi } from '@/lib/api/user-api';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}));

// Mock auth hook
jest.mock('@/lib/auth/use-auth');

// Mock UserApi
jest.mock('@/lib/api/user-api');

// Mock the tab components to simplify testing
jest.mock('@/app/dashboard/natal-chart-tab', () => {
  return function NatalChartTab() {
    return <div>Natal Chart Tab</div>;
  };
});

jest.mock('@/app/dashboard/readings-tab', () => {
  return function ReadingsTab() {
    return <div>Readings Tab</div>;
  };
});

// Mock the toast hook
jest.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({
    toast: jest.fn(),
  }),
}));

describe('Dashboard Page - Admin Welcome Message', () => {
  const mockPush = jest.fn();
  const mockReplace = jest.fn();
  const mockUserApi = {
    getUserProfile: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
      replace: mockReplace,
    });
    (useSearchParams as jest.Mock).mockReturnValue({
      get: jest.fn().mockReturnValue(null),
    });
    (UserApi as jest.Mock).mockImplementation(() => mockUserApi);
  });

  test('displays "Welcome back, Admin [Name]!" for admin users with profile', async () => {
    const mockAdminUser = {
      sub: 'admin-user-id',
      email: 'admin@example.com',
      email_verified: true,
      'cognito:groups': ['admin'],
    };

    const mockProfile = {
      userId: 'admin-user-id',
      createdAt: 'PROFILE',
      email: 'admin@example.com',
      profile: {
        birthName: 'Admin User',
        birthDate: '1990-01-01',
        birthTime: '12:00',
        birthCity: 'New York',
        birthState: 'NY',
        birthCountry: 'USA',
        standardizedLocationName: 'New York, NY, USA',
      },
      updatedAt: '2024-01-01T00:00:00Z',
    };

    (useAuth as jest.Mock).mockReturnValue({
      user: mockAdminUser,
      isAdmin: true,
      loading: false,
      authService: {
        getCurrentUser: jest.fn().mockReturnValue(mockAdminUser),
        getIdToken: jest.fn().mockResolvedValue('mock-token'),
      },
    });

    mockUserApi.getUserProfile.mockResolvedValue(mockProfile);

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Welcome back, Admin Admin User!')).toBeInTheDocument();
    });
  });

  test('displays "Welcome back, Admin [Email]!" for admin users without profile name', async () => {
    const mockAdminUser = {
      sub: 'admin-user-id',
      email: 'admin@example.com',
      email_verified: true,
      'cognito:groups': ['admin'],
    };

    (useAuth as jest.Mock).mockReturnValue({
      user: mockAdminUser,
      isAdmin: true,
      loading: false,
      authService: {
        getCurrentUser: jest.fn().mockReturnValue(mockAdminUser),
        getIdToken: jest.fn().mockResolvedValue('mock-token'),
      },
    });

    // Simulate profile loading error or not found
    mockUserApi.getUserProfile.mockRejectedValue(new Error('Profile not found'));

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Welcome back, Admin admin@example.com!')).toBeInTheDocument();
    });
  });

  test('displays "Welcome back, [Name]!" for non-admin users', async () => {
    const mockRegularUser = {
      sub: 'user-id',
      email: 'user@example.com',
      email_verified: true,
    };

    const mockProfile = {
      userId: 'user-id',
      createdAt: 'PROFILE',
      email: 'user@example.com',
      profile: {
        birthName: 'Regular User',
        birthDate: '1990-01-01',
        birthTime: '12:00',
        birthCity: 'Los Angeles',
        birthState: 'CA',
        birthCountry: 'USA',
        standardizedLocationName: 'Los Angeles, CA, USA',
      },
      updatedAt: '2024-01-01T00:00:00Z',
    };

    (useAuth as jest.Mock).mockReturnValue({
      user: mockRegularUser,
      isAdmin: false,
      loading: false,
      authService: {
        getCurrentUser: jest.fn().mockReturnValue(mockRegularUser),
        getIdToken: jest.fn().mockResolvedValue('mock-token'),
      },
    });

    mockUserApi.getUserProfile.mockResolvedValue(mockProfile);

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Welcome back, Regular User!')).toBeInTheDocument();
    });

    // Ensure "Admin" is NOT in the welcome message
    expect(screen.queryByText(/Welcome back, Admin/)).not.toBeInTheDocument();
  });

  test('displays "Welcome back, [Email]!" for non-admin users without profile', async () => {
    const mockRegularUser = {
      sub: 'user-id',
      email: 'user@example.com',
      email_verified: true,
    };

    (useAuth as jest.Mock).mockReturnValue({
      user: mockRegularUser,
      isAdmin: false,
      loading: false,
      authService: {
        getCurrentUser: jest.fn().mockReturnValue(mockRegularUser),
        getIdToken: jest.fn().mockResolvedValue('mock-token'),
      },
    });

    mockUserApi.getUserProfile.mockRejectedValue(new Error('Profile not found'));

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Welcome back, user@example.com!')).toBeInTheDocument();
    });

    // Ensure "Admin" is NOT in the welcome message
    expect(screen.queryByText(/Welcome back, Admin/)).not.toBeInTheDocument();
  });

  test('displays correct welcome message for admin with multiple groups', async () => {
    const mockAdminUser = {
      sub: 'admin-user-id',
      email: 'admin@example.com',
      email_verified: true,
      'cognito:groups': ['users', 'admin', 'premium'],
    };

    const mockProfile = {
      userId: 'admin-user-id',
      createdAt: 'PROFILE',
      email: 'admin@example.com',
      profile: {
        birthName: 'Multi Group Admin',
        birthDate: '1990-01-01',
        birthTime: '12:00',
        birthCity: 'Chicago',
        birthState: 'IL',
        birthCountry: 'USA',
        standardizedLocationName: 'Chicago, IL, USA',
      },
      updatedAt: '2024-01-01T00:00:00Z',
    };

    (useAuth as jest.Mock).mockReturnValue({
      user: mockAdminUser,
      isAdmin: true,
      loading: false,
      authService: {
        getCurrentUser: jest.fn().mockReturnValue(mockAdminUser),
        getIdToken: jest.fn().mockResolvedValue('mock-token'),
      },
    });

    mockUserApi.getUserProfile.mockResolvedValue(mockProfile);

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Welcome back, Admin Multi Group Admin!')).toBeInTheDocument();
    });
  });

  test('handles user with empty groups array correctly', async () => {
    const mockUser = {
      sub: 'user-id',
      email: 'user@example.com',
      email_verified: true,
      'cognito:groups': [],
    };

    const mockProfile = {
      userId: 'user-id',
      createdAt: 'PROFILE',
      email: 'user@example.com',
      profile: {
        birthName: 'No Groups User',
        birthDate: '1990-01-01',
        birthTime: '12:00',
        birthCity: 'Miami',
        birthState: 'FL',
        birthCountry: 'USA',
        standardizedLocationName: 'Miami, FL, USA',
      },
      updatedAt: '2024-01-01T00:00:00Z',
    };

    (useAuth as jest.Mock).mockReturnValue({
      user: mockUser,
      isAdmin: false,
      loading: false,
      authService: {
        getCurrentUser: jest.fn().mockReturnValue(mockUser),
        getIdToken: jest.fn().mockResolvedValue('mock-token'),
      },
    });

    mockUserApi.getUserProfile.mockResolvedValue(mockProfile);

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Welcome back, No Groups User!')).toBeInTheDocument();
    });

    // Ensure "Admin" is NOT in the welcome message
    expect(screen.queryByText(/Welcome back, Admin/)).not.toBeInTheDocument();
  });

  test('shows loading state while checking admin status', () => {
    (useAuth as jest.Mock).mockReturnValue({
      user: null,
      isAdmin: false,
      loading: true,
      authService: {
        getCurrentUser: jest.fn().mockReturnValue(null),
        getIdToken: jest.fn().mockResolvedValue(null),
      },
    });

    render(<DashboardPage />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  test('redirects to login when not authenticated', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      user: null,
      isAdmin: false,
      loading: false,
      authService: {
        getCurrentUser: jest.fn().mockReturnValue(null),
        getIdToken: jest.fn().mockResolvedValue(null),
      },
    });

    render(<DashboardPage />);

    await waitFor(
      () => {
        expect(mockPush).toHaveBeenCalledWith('/login');
      },
      { timeout: 200 },
    );
  });

  test('redirects to onboarding when profile not found', async () => {
    const mockUser = {
      sub: 'user-id',
      email: 'user@example.com',
      email_verified: true,
    };

    (useAuth as jest.Mock).mockReturnValue({
      user: mockUser,
      isAdmin: false,
      loading: false,
      authService: {
        getCurrentUser: jest.fn().mockReturnValue(mockUser),
        getIdToken: jest.fn().mockResolvedValue('mock-token'),
      },
    });

    mockUserApi.getUserProfile.mockRejectedValue(new Error('Profile not found'));

    render(<DashboardPage />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/onboarding');
    });
  });

  test('maintains admin status across profile loading states', async () => {
    const mockAdminUser = {
      sub: 'admin-user-id',
      email: 'admin@example.com',
      email_verified: true,
      'cognito:groups': ['admin'],
    };

    const mockProfile = {
      userId: 'admin-user-id',
      createdAt: 'PROFILE',
      email: 'admin@example.com',
      profile: {
        birthName: 'Admin Person',
        birthDate: '1990-01-01',
        birthTime: '12:00',
        birthCity: 'Boston',
        birthState: 'MA',
        birthCountry: 'USA',
        standardizedLocationName: 'Boston, MA, USA',
      },
      updatedAt: '2024-01-01T00:00:00Z',
    };

    // Start with loading state
    const { rerender } = render(<DashboardPage />);

    (useAuth as jest.Mock).mockReturnValue({
      user: mockAdminUser,
      isAdmin: true,
      loading: false,
      authService: {
        getCurrentUser: jest.fn().mockReturnValue(mockAdminUser),
        getIdToken: jest.fn().mockResolvedValue('mock-token'),
      },
    });

    // Simulate slow profile loading
    mockUserApi.getUserProfile.mockImplementation(() => {
      return new Promise((resolve) => {
        setTimeout(() => resolve(mockProfile), 100);
      });
    });

    rerender(<DashboardPage />);

    // Should show loading while profile loads
    expect(screen.getByText('Loading...')).toBeInTheDocument();

    // Wait for profile to load
    await waitFor(() => {
      expect(screen.getByText('Welcome back, Admin Admin Person!')).toBeInTheDocument();
    });
  });

  test('handles profile API errors gracefully for admin users', async () => {
    const mockAdminUser = {
      sub: 'admin-user-id',
      email: 'admin@example.com',
      email_verified: true,
      'cognito:groups': ['admin'],
    };

    (useAuth as jest.Mock).mockReturnValue({
      user: mockAdminUser,
      isAdmin: true,
      loading: false,
      authService: {
        getCurrentUser: jest.fn().mockReturnValue(mockAdminUser),
        getIdToken: jest.fn().mockResolvedValue('mock-token'),
      },
    });

    // Simulate API error that's not "Profile not found"
    mockUserApi.getUserProfile.mockRejectedValue(new Error('Network error'));

    // Suppress console.error for this test
    const originalError = console.error;
    console.error = jest.fn();

    render(<DashboardPage />);

    await waitFor(() => {
      // Should still show admin welcome with email fallback
      expect(screen.getByText('Welcome back, Admin admin@example.com!')).toBeInTheDocument();
      // Should display error message
      expect(screen.getByText('Failed to load profile')).toBeInTheDocument();
    });

    console.error = originalError;
  });
});
