import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { useRouter, useSearchParams } from 'next/navigation';
import DashboardClient from '@/app/dashboard/dashboard-client';
import { useAuth } from '@/lib/auth/use-auth';
import { UserApi } from '@/lib/api/user-api';
import { useToast } from '@/components/ui/use-toast';

// Mock dependencies
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}));

jest.mock('@/lib/auth/use-auth');

jest.mock('@/lib/api/user-api');

jest.mock('@/components/ui/use-toast');

// Mock tab components
jest.mock('@/app/dashboard/natal-chart-tab', () => {
  return function NatalChartTab() {
    return <div>Natal Chart Tab</div>;
  };
});

jest.mock('@/app/dashboard/readings-tab', () => {
  return function ReadingsTab({ onNeedRefresh }: { onNeedRefresh?: () => void }) {
    // Trigger refresh callback if provided
    React.useEffect(() => {
      if (onNeedRefresh) {
        // Simulate that the component has checked and will trigger refresh
        onNeedRefresh();
      }
    }, [onNeedRefresh]);
    return <div>Readings Tab</div>;
  };
});

describe('DashboardClient - Payment Status Handling', () => {
  const mockPush = jest.fn();
  const mockReplace = jest.fn();
  const mockToast = jest.fn();
  const mockUserApi = {
    getUserProfile: jest.fn(),
  };

  const mockUser = {
    sub: 'user-123',
    email: 'user@example.com',
    email_verified: true,
  };

  const mockProfile = {
    userId: 'user-123',
    createdAt: 'PROFILE',
    email: 'user@example.com',
    profile: {
      birthName: 'Test User',
      birthDate: '1990-01-01',
      birthTime: '12:00',
      birthCity: 'New York',
      birthState: 'NY',
      birthCountry: 'USA',
      standardizedLocationName: 'New York, NY, USA',
    },
    updatedAt: '2024-01-01T00:00:00Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
      replace: mockReplace,
    });

    (useToast as jest.Mock).mockReturnValue({
      toast: mockToast,
    });

    (UserApi as jest.Mock).mockImplementation(() => mockUserApi);

    // Default auth state
    (useAuth as jest.Mock).mockReturnValue({
      user: mockUser,
      isAdmin: false,
      loading: false,
      authService: {
        getCurrentUser: jest.fn().mockReturnValue(mockUser),
        getIdToken: jest.fn().mockResolvedValue('mock-token'),
      },
    });

    // Default profile response
    mockUserApi.getUserProfile.mockResolvedValue(mockProfile);
  });

  describe('Payment Success Handling', () => {
    it('should show success toast when payment=success parameter is present', async () => {
      const mockSearchParams = new URLSearchParams();
      mockSearchParams.set('tab', 'readings');
      mockSearchParams.set('payment', 'success');

      (useSearchParams as jest.Mock).mockReturnValue({
        get: (key: string) => mockSearchParams.get(key),
      });

      render(<DashboardClient />);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Payment Successful',
          description: 'Your payment was successful! Your reading will be generated shortly.',
        });
      });
    });

    it('should redirect to clean URL after showing success message', async () => {
      const mockSearchParams = new URLSearchParams();
      mockSearchParams.set('tab', 'readings');
      mockSearchParams.set('payment', 'success');

      (useSearchParams as jest.Mock).mockReturnValue({
        get: (key: string) => mockSearchParams.get(key),
      });

      render(<DashboardClient />);

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/dashboard?tab=readings');
      });
    });

    it('should switch to readings tab when payment=success', async () => {
      const mockSearchParams = new URLSearchParams();
      mockSearchParams.set('tab', 'readings');
      mockSearchParams.set('payment', 'success');

      (useSearchParams as jest.Mock).mockReturnValue({
        get: (key: string) => mockSearchParams.get(key),
      });

      render(<DashboardClient />);

      await waitFor(() => {
        expect(screen.getByText('Readings Tab')).toBeInTheDocument();
      });
    });
  });

  describe('Payment Cancellation Handling', () => {
    it('should show info toast when payment=cancelled parameter is present', async () => {
      const mockSearchParams = new URLSearchParams();
      mockSearchParams.set('tab', 'readings');
      mockSearchParams.set('payment', 'cancelled');

      (useSearchParams as jest.Mock).mockReturnValue({
        get: (key: string) => mockSearchParams.get(key),
      });

      render(<DashboardClient />);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Payment Cancelled',
          description: 'Your payment was cancelled. You can try again whenever you are ready.',
        });
      });
    });

    it('should redirect to clean URL after showing cancellation message', async () => {
      const mockSearchParams = new URLSearchParams();
      mockSearchParams.set('tab', 'readings');
      mockSearchParams.set('payment', 'cancelled');

      (useSearchParams as jest.Mock).mockReturnValue({
        get: (key: string) => mockSearchParams.get(key),
      });

      render(<DashboardClient />);

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/dashboard?tab=readings');
      });
    });

    it('should switch to readings tab when payment=cancelled', async () => {
      const mockSearchParams = new URLSearchParams();
      mockSearchParams.set('tab', 'readings');
      mockSearchParams.set('payment', 'cancelled');

      (useSearchParams as jest.Mock).mockReturnValue({
        get: (key: string) => mockSearchParams.get(key),
      });

      render(<DashboardClient />);

      await waitFor(() => {
        expect(screen.getByText('Readings Tab')).toBeInTheDocument();
      });
    });
  });

  describe('Tab Navigation', () => {
    it('should switch to readings tab when tab=readings parameter is present', async () => {
      const mockSearchParams = new URLSearchParams();
      mockSearchParams.set('tab', 'readings');

      (useSearchParams as jest.Mock).mockReturnValue({
        get: (key: string) => mockSearchParams.get(key),
      });

      render(<DashboardClient />);

      await waitFor(() => {
        expect(screen.getByText('Readings Tab')).toBeInTheDocument();
      });
    });

    it('should default to profile tab when no tab parameter is present', async () => {
      (useSearchParams as jest.Mock).mockReturnValue({
        get: jest.fn().mockReturnValue(null),
      });

      render(<DashboardClient />);

      await waitFor(() => {
        // Check for profile content
        expect(screen.getByText('User Profile')).toBeInTheDocument();
        expect(screen.getByText('Birth Information')).toBeInTheDocument();
      });
    });

    it('should handle invalid payment parameter values gracefully', async () => {
      const mockSearchParams = new URLSearchParams();
      mockSearchParams.set('tab', 'readings');
      mockSearchParams.set('payment', 'invalid-value');

      (useSearchParams as jest.Mock).mockReturnValue({
        get: (key: string) => mockSearchParams.get(key),
      });

      render(<DashboardClient />);

      await waitFor(() => {
        // Should not show any toast for invalid payment value
        expect(mockToast).not.toHaveBeenCalled();
        // Should still switch to readings tab
        expect(screen.getByText('Readings Tab')).toBeInTheDocument();
      });
    });
  });

  describe('URL Parameter Cleanup', () => {
    it('should preserve tab parameter when cleaning payment parameter', async () => {
      const mockSearchParams = new URLSearchParams();
      mockSearchParams.set('tab', 'readings');
      mockSearchParams.set('payment', 'success');

      (useSearchParams as jest.Mock).mockReturnValue({
        get: (key: string) => mockSearchParams.get(key),
      });

      render(<DashboardClient />);

      await waitFor(() => {
        // Should keep tab=readings but remove payment parameter
        expect(mockReplace).toHaveBeenCalledWith('/dashboard?tab=readings');
        expect(mockReplace).not.toHaveBeenCalledWith('/dashboard');
      });
    });

    it('should not clean URL when no payment parameter is present', async () => {
      const mockSearchParams = new URLSearchParams();
      mockSearchParams.set('tab', 'readings');

      (useSearchParams as jest.Mock).mockReturnValue({
        get: (key: string) => mockSearchParams.get(key),
      });

      render(<DashboardClient />);

      await waitFor(() => {
        expect(screen.getByText('Readings Tab')).toBeInTheDocument();
      });

      // Should not call replace when there's no payment parameter to clean
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle both tab and payment parameters simultaneously', async () => {
      const mockSearchParams = new URLSearchParams();
      mockSearchParams.set('tab', 'natal-chart'); // Different tab
      mockSearchParams.set('payment', 'success');

      (useSearchParams as jest.Mock).mockReturnValue({
        get: (key: string) => {
          if (key === 'tab') return 'readings'; // Force readings tab for payment
          if (key === 'payment') return 'success';
          return null;
        },
      });

      render(<DashboardClient />);

      await waitFor(() => {
        // Should switch to readings tab despite natal-chart in URL
        expect(screen.getByText('Readings Tab')).toBeInTheDocument();
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Payment Successful',
          description: 'Your payment was successful! Your reading will be generated shortly.',
        });
      });
    });

    it('should handle missing user profile with payment parameters', async () => {
      mockUserApi.getUserProfile.mockRejectedValue(new Error('Profile not found'));

      const mockSearchParams = new URLSearchParams();
      mockSearchParams.set('tab', 'readings');
      mockSearchParams.set('payment', 'success');

      (useSearchParams as jest.Mock).mockReturnValue({
        get: (key: string) => mockSearchParams.get(key),
      });

      render(<DashboardClient />);

      await waitFor(() => {
        // Should redirect to onboarding
        expect(mockPush).toHaveBeenCalledWith('/onboarding');
      });
    });

    it('should handle payment parameters when user is not authenticated', async () => {
      (useAuth as jest.Mock).mockReturnValue({
        user: null,
        isAdmin: false,
        loading: false,
        authService: {
          getCurrentUser: jest.fn().mockReturnValue(null),
          getIdToken: jest.fn().mockResolvedValue(null),
        },
      });

      const mockSearchParams = new URLSearchParams();
      mockSearchParams.set('tab', 'readings');
      mockSearchParams.set('payment', 'success');

      (useSearchParams as jest.Mock).mockReturnValue({
        get: (key: string) => mockSearchParams.get(key),
      });

      render(<DashboardClient />);

      await waitFor(
        () => {
          // Should redirect to login
          expect(mockPush).toHaveBeenCalledWith('/login');
        },
        { timeout: 200 },
      );

      // Should not show payment toast when not authenticated
      expect(mockToast).not.toHaveBeenCalled();
    });
  });

  describe('Loading States', () => {
    it('should handle loading state while processing payment parameters', async () => {
      (useAuth as jest.Mock).mockReturnValue({
        user: mockUser,
        isAdmin: false,
        loading: true, // Still loading
        authService: {
          getCurrentUser: jest.fn().mockReturnValue(mockUser),
          getIdToken: jest.fn().mockResolvedValue('mock-token'),
        },
      });

      const mockSearchParams = new URLSearchParams();
      mockSearchParams.set('payment', 'success');

      (useSearchParams as jest.Mock).mockReturnValue({
        get: (key: string) => mockSearchParams.get(key),
      });

      render(<DashboardClient />);

      // Should show loading state
      expect(screen.getByText('Loading...')).toBeInTheDocument();

      // Should not process payment parameters while loading
      expect(mockToast).not.toHaveBeenCalled();
    });
  });

  describe('Refresh Mechanism (KAN-71)', () => {
    it('should trigger readings refresh when refresh=true parameter is present', async () => {
      const mockSearchParams = new URLSearchParams();
      mockSearchParams.set('tab', 'readings');
      mockSearchParams.set('refresh', 'true');

      (useSearchParams as jest.Mock).mockReturnValue({
        get: (key: string) => mockSearchParams.get(key),
      });

      render(<DashboardClient />);

      await waitFor(() => {
        // Should switch to readings tab
        expect(screen.getByText('Readings Tab')).toBeInTheDocument();
      });

      // Should clean up URL after processing
      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/dashboard?tab=readings');
      });
    });

    it('should set refresh trigger state when refresh parameter is true', async () => {
      const mockSearchParams = new URLSearchParams();
      mockSearchParams.set('tab', 'readings');
      mockSearchParams.set('refresh', 'true');

      (useSearchParams as jest.Mock).mockReturnValue({
        get: (key: string) => mockSearchParams.get(key),
      });

      render(<DashboardClient />);

      await waitFor(() => {
        // Should be on readings tab
        expect(screen.getByText('Readings Tab')).toBeInTheDocument();
        // URL should be cleaned
        expect(mockReplace).toHaveBeenCalledWith('/dashboard?tab=readings');
      });
    });

    it('should not trigger refresh when refresh parameter is false or missing', async () => {
      const mockSearchParams = new URLSearchParams();
      mockSearchParams.set('tab', 'readings');
      // No refresh parameter

      (useSearchParams as jest.Mock).mockReturnValue({
        get: (key: string) => mockSearchParams.get(key),
      });

      render(<DashboardClient />);

      await waitFor(() => {
        expect(screen.getByText('Readings Tab')).toBeInTheDocument();
      });

      // Should not call replace since there's no refresh parameter
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('should handle both payment=success and automatic refresh', async () => {
      // First render with payment success
      const mockSearchParams1 = new URLSearchParams();
      mockSearchParams1.set('tab', 'readings');
      mockSearchParams1.set('payment', 'success');

      (useSearchParams as jest.Mock).mockReturnValue({
        get: (key: string) => mockSearchParams1.get(key),
      });

      const { rerender } = render(<DashboardClient />);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Payment Successful',
          description: 'Your payment was successful! Your reading will be generated shortly.',
        });
      });

      // Clear mocks for next check
      mockReplace.mockClear();
      mockToast.mockClear();

      // Now simulate refresh trigger from payment success page
      const mockSearchParams2 = new URLSearchParams();
      mockSearchParams2.set('tab', 'readings');
      mockSearchParams2.set('refresh', 'true');

      (useSearchParams as jest.Mock).mockReturnValue({
        get: (key: string) => mockSearchParams2.get(key),
      });

      rerender(<DashboardClient />);

      await waitFor(() => {
        // Should clean URL but not show another toast
        expect(mockReplace).toHaveBeenCalledWith('/dashboard?tab=readings');
        expect(mockToast).not.toHaveBeenCalled();
      });
    });

    it('should preserve tab parameter when cleaning refresh parameter', async () => {
      const mockSearchParams = new URLSearchParams();
      mockSearchParams.set('tab', 'readings');
      mockSearchParams.set('refresh', 'true');

      (useSearchParams as jest.Mock).mockReturnValue({
        get: (key: string) => mockSearchParams.get(key),
      });

      render(<DashboardClient />);

      await waitFor(() => {
        // Should keep tab=readings but remove refresh parameter
        expect(mockReplace).toHaveBeenCalledWith('/dashboard?tab=readings');
        expect(mockReplace).not.toHaveBeenCalledWith('/dashboard');
      });
    });
  });

  describe('Toast Notification Behavior', () => {
    it('should only show one toast for payment success', async () => {
      const mockSearchParams = new URLSearchParams();
      mockSearchParams.set('tab', 'readings');
      mockSearchParams.set('payment', 'success');

      (useSearchParams as jest.Mock).mockReturnValue({
        get: (key: string) => mockSearchParams.get(key),
      });

      const { rerender } = render(<DashboardClient />);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledTimes(1);
      });

      // Re-render should not trigger another toast
      rerender(<DashboardClient />);

      expect(mockToast).toHaveBeenCalledTimes(1);
    });

    it('should show correct toast variant for cancellation', async () => {
      const mockSearchParams = new URLSearchParams();
      mockSearchParams.set('payment', 'cancelled');

      (useSearchParams as jest.Mock).mockReturnValue({
        get: (key: string) => mockSearchParams.get(key),
      });

      render(<DashboardClient />);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Payment Cancelled',
          }),
        );
      });
    });
  });
});
