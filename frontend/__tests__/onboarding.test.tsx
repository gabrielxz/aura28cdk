import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/use-auth';
import OnboardingPage from '@/app/onboarding/page';
import { AuthService } from '@/lib/auth/auth-service';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

// Mock auth hooks and services
jest.mock('@/lib/auth/use-auth');
jest.mock('@/lib/auth/auth-service');

describe('OnboardingPage', () => {
  const mockPush = jest.fn();
  const mockUser = {
    sub: '123',
    email: 'test@example.com',
    email_verified: true,
  };
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({ push: mockPush });
    localStorage.clear();
    // Mock console.error to suppress expected error logs
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore console.error
    consoleErrorSpy.mockRestore();
  });

  it('redirects to login if user is not authenticated', () => {
    (useAuth as jest.Mock).mockReturnValue({
      user: null,
      loading: false,
      refreshUser: jest.fn(),
    });

    render(<OnboardingPage />);

    expect(mockPush).toHaveBeenCalledWith('/login');
  });

  it('redirects to dashboard if user has already completed onboarding', () => {
    const mockAuthService = {
      hasCompletedOnboarding: jest.fn().mockReturnValue(true),
    };
    (AuthService as jest.Mock).mockImplementation(() => mockAuthService);

    (useAuth as jest.Mock).mockReturnValue({
      user: { ...mockUser, 'custom:birthCity': 'San Francisco' },
      loading: false,
      refreshUser: jest.fn(),
    });

    render(<OnboardingPage />);

    expect(mockPush).toHaveBeenCalledWith('/dashboard');
  });

  it('shows loading state while auth is loading', () => {
    (useAuth as jest.Mock).mockReturnValue({
      user: null,
      loading: true,
      refreshUser: jest.fn(),
    });

    render(<OnboardingPage />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('displays the onboarding form for new users', () => {
    const mockAuthService = {
      hasCompletedOnboarding: jest.fn().mockReturnValue(false),
    };
    (AuthService as jest.Mock).mockImplementation(() => mockAuthService);

    (useAuth as jest.Mock).mockReturnValue({
      user: mockUser,
      loading: false,
      refreshUser: jest.fn(),
    });

    render(<OnboardingPage />);

    expect(screen.getByText('Complete Your Profile')).toBeInTheDocument();
    expect(screen.getByLabelText('City')).toBeInTheDocument();
  });

  it('validates required fields on step 1', async () => {
    const mockAuthService = {
      hasCompletedOnboarding: jest.fn().mockReturnValue(false),
    };
    (AuthService as jest.Mock).mockImplementation(() => mockAuthService);

    (useAuth as jest.Mock).mockReturnValue({
      user: mockUser,
      loading: false,
      refreshUser: jest.fn(),
    });

    render(<OnboardingPage />);

    const nextButton = screen.getByText('Next');
    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(screen.getByText('City is required')).toBeInTheDocument();
      expect(screen.getByText('State/Province is required')).toBeInTheDocument();
      expect(screen.getByText('Country is required')).toBeInTheDocument();
    });
  });

  it('saves progress to localStorage', async () => {
    const mockAuthService = {
      hasCompletedOnboarding: jest.fn().mockReturnValue(false),
    };
    (AuthService as jest.Mock).mockImplementation(() => mockAuthService);

    (useAuth as jest.Mock).mockReturnValue({
      user: mockUser,
      loading: false,
      refreshUser: jest.fn(),
    });

    render(<OnboardingPage />);

    // Verify we start at step 1
    expect(screen.getByText('Birth Location')).toBeInTheDocument();

    // Fill in step 1
    fireEvent.change(screen.getByLabelText('City'), {
      target: { value: 'San Francisco' },
    });
    fireEvent.change(screen.getByLabelText('State/Province'), {
      target: { value: 'California' },
    });
    fireEvent.change(screen.getByLabelText('Country'), {
      target: { value: 'United States' },
    });

    const nextButton = screen.getByText('Next');
    fireEvent.click(nextButton);

    // Wait for navigation to step 2
    await waitFor(() => {
      expect(screen.getByText('Birth Date')).toBeInTheDocument();
    });

    // Now check localStorage
    const savedData = localStorage.getItem('onboarding-progress');
    expect(savedData).toBeTruthy();
    const parsed = JSON.parse(savedData!);
    expect(parsed.formData.birthCity).toBe('San Francisco');
    expect(parsed.currentStep).toBe(2);
  });

  it('navigates through all steps', async () => {
    const mockRefreshUser = jest.fn().mockResolvedValue(undefined);
    const mockAuthService = {
      hasCompletedOnboarding: jest.fn().mockReturnValue(false),
      updateUserAttributes: jest.fn().mockResolvedValue(undefined),
    };
    (AuthService as jest.Mock).mockImplementation(() => mockAuthService);

    (useAuth as jest.Mock).mockReturnValue({
      user: mockUser,
      loading: false,
      refreshUser: mockRefreshUser,
    });

    render(<OnboardingPage />);

    // Step 1: Location
    fireEvent.change(screen.getByLabelText('City'), {
      target: { value: 'San Francisco' },
    });
    fireEvent.change(screen.getByLabelText('State/Province'), {
      target: { value: 'California' },
    });
    fireEvent.change(screen.getByLabelText('Country'), {
      target: { value: 'United States' },
    });
    fireEvent.click(screen.getByText('Next'));

    // Step 2: Birth Date
    await waitFor(() => {
      expect(screen.getByText('Birth Date')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText('Month'), {
      target: { value: '7' },
    });
    fireEvent.change(screen.getByLabelText('Day'), {
      target: { value: '15' },
    });
    fireEvent.change(screen.getByLabelText('Year'), {
      target: { value: '1990' },
    });
    fireEvent.click(screen.getByText('Next'));

    // Step 3: Birth Time (optional)
    await waitFor(() => {
      expect(screen.getByText('Birth Time')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Next'));

    // Step 4: Full Name
    await waitFor(() => {
      expect(screen.getByText('Full Birth Name')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText('Full Name'), {
      target: { value: 'John Michael Smith' },
    });

    // Submit
    const completeButton = screen.getByText('Complete Profile');
    fireEvent.click(completeButton);

    await waitFor(() => {
      expect(mockAuthService.updateUserAttributes).toHaveBeenCalledWith({
        'custom:birthCity': 'San Francisco',
        'custom:birthState': 'California',
        'custom:birthCountry': 'United States',
        'custom:birthDate': '1990-07-15',
        'custom:birthName': 'John Michael Smith',
      });
      expect(mockRefreshUser).toHaveBeenCalled();
    });

    // Wait for the redirect to happen after the timeout
    await waitFor(
      () => {
        expect(mockPush).toHaveBeenCalledWith('/dashboard');
      },
      { timeout: 1000 },
    );
  });

  it('handles update errors gracefully', async () => {
    const mockRefreshUser = jest.fn();
    const mockAuthService = {
      hasCompletedOnboarding: jest.fn().mockReturnValue(false),
      updateUserAttributes: jest.fn().mockRejectedValue(new Error('Update failed')),
    };
    (AuthService as jest.Mock).mockImplementation(() => mockAuthService);

    (useAuth as jest.Mock).mockReturnValue({
      user: mockUser,
      loading: false,
      refreshUser: mockRefreshUser,
    });

    render(<OnboardingPage />);

    // Navigate to last step
    // Step 1
    fireEvent.change(screen.getByLabelText('City'), {
      target: { value: 'San Francisco' },
    });
    fireEvent.change(screen.getByLabelText('State/Province'), {
      target: { value: 'California' },
    });
    fireEvent.change(screen.getByLabelText('Country'), {
      target: { value: 'United States' },
    });
    fireEvent.click(screen.getByText('Next'));

    // Step 2
    await waitFor(() => screen.getByLabelText('Month'));
    fireEvent.change(screen.getByLabelText('Month'), {
      target: { value: '7' },
    });
    fireEvent.change(screen.getByLabelText('Day'), {
      target: { value: '15' },
    });
    fireEvent.change(screen.getByLabelText('Year'), {
      target: { value: '1990' },
    });
    fireEvent.click(screen.getByText('Next'));

    // Step 3
    await waitFor(() => screen.getByText('Next'));
    fireEvent.click(screen.getByText('Next'));

    // Step 4
    await waitFor(() => screen.getByLabelText('Full Name'));
    fireEvent.change(screen.getByLabelText('Full Name'), {
      target: { value: 'John Smith' },
    });

    const completeButton = screen.getByText('Complete Profile');
    fireEvent.click(completeButton);

    await waitFor(() => {
      expect(screen.getByText('Update failed. Please try again.')).toBeInTheDocument();
    });
  });
});
