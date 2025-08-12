import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import OnboardingPage from '@/app/onboarding/page';
import { useAuth } from '@/lib/auth/use-auth';
import { useRouter } from 'next/navigation';
import { UserApi } from '@/lib/api/user-api';

// Mock dependencies
jest.mock('@/lib/auth/use-auth');
jest.mock('next/navigation');
jest.mock('@/lib/api/user-api');

const mockPush = jest.fn();
const mockUser = {
  sub: 'test-user-id',
  email: 'test@example.com',
  custom: {},
};

describe('OnboardingPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
    });
  });

  it('redirects to login when no user', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      user: null,
      loading: false,
      refreshUser: jest.fn(),
      authService: null,
    });

    render(<OnboardingPage />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/login');
    });
  });

  it('redirects to dashboard if already onboarded', async () => {
    const mockAuthService = {
      getIdToken: jest.fn().mockResolvedValue('mock-token'),
    };

    // Mock UserApi
    const mockHasCompletedOnboarding = jest.fn().mockResolvedValue(true);
    (UserApi as jest.Mock).mockImplementation(() => ({
      hasCompletedOnboarding: mockHasCompletedOnboarding,
    }));

    (useAuth as jest.Mock).mockReturnValue({
      user: mockUser,
      loading: false,
      refreshUser: jest.fn(),
      authService: mockAuthService,
    });

    render(<OnboardingPage />);

    await waitFor(() => {
      expect(mockHasCompletedOnboarding).toHaveBeenCalledWith(mockUser.sub);
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('loads saved progress from localStorage', async () => {
    const savedData = {
      formData: {
        birthCity: 'San Francisco',
        birthState: 'California',
        birthCountry: 'United States',
        birthDate: '',
        birthTime: '',
        birthName: '',
      },
      currentStep: 2,
    };
    localStorage.setItem('onboarding-progress', JSON.stringify(savedData));

    const mockAuthService = {
      getIdToken: jest.fn().mockResolvedValue('mock-token'),
    };

    // Mock UserApi
    const mockHasCompletedOnboarding = jest.fn().mockResolvedValue(false);
    (UserApi as jest.Mock).mockImplementation(() => ({
      hasCompletedOnboarding: mockHasCompletedOnboarding,
    }));

    (useAuth as jest.Mock).mockReturnValue({
      user: mockUser,
      loading: false,
      refreshUser: jest.fn(),
      authService: mockAuthService,
    });

    render(<OnboardingPage />);

    await waitFor(() => {
      expect(screen.getByText('Birth Date')).toBeInTheDocument();
    });
  });

  it('handles successful profile submission', async () => {
    const mockRefreshUser = jest.fn().mockResolvedValue(undefined);
    const mockAuthService = {
      getIdToken: jest.fn().mockResolvedValue('mock-token'),
    };

    // Mock UserApi
    const mockHasCompletedOnboarding = jest.fn().mockResolvedValue(false);
    const mockUpdateUserProfile = jest.fn().mockResolvedValue({
      message: 'Profile updated successfully',
    });

    (UserApi as jest.Mock).mockImplementation(() => ({
      hasCompletedOnboarding: mockHasCompletedOnboarding,
      updateUserProfile: mockUpdateUserProfile,
    }));

    (useAuth as jest.Mock).mockReturnValue({
      user: mockUser,
      loading: false,
      refreshUser: mockRefreshUser,
      authService: mockAuthService,
    });

    render(<OnboardingPage />);

    await waitFor(() => {
      expect(screen.getByLabelText('City')).toBeInTheDocument();
    });

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

    // Step 2: Birth Date with DatePicker
    await waitFor(() => {
      expect(screen.getByText('Birth Date')).toBeInTheDocument();
    });

    // The DatePicker shows as a button with placeholder text
    expect(screen.getByText('Select your birth date')).toBeInTheDocument();

    // Since the DatePicker is a complex component, we'll simulate having selected a date
    // by setting the form data directly through localStorage and re-rendering
    const savedProgress = {
      formData: {
        birthCity: 'San Francisco',
        birthState: 'California',
        birthCountry: 'United States',
        birthDate: '1990-07-15',
        birthTime: '',
        birthName: '',
      },
      currentStep: 3,
    };
    localStorage.setItem('onboarding-progress', JSON.stringify(savedProgress));

    // Move forward by re-rendering with the saved progress
    const { unmount } = render(<OnboardingPage />);
    unmount();
    render(<OnboardingPage />);

    // Step 3: Birth Time (required)
    await waitFor(() => {
      expect(screen.getByText('Birth Time')).toBeInTheDocument();
    });

    // The TimePicker is now a native input field
    expect(screen.getByPlaceholderText('Select birth time')).toBeInTheDocument();

    // Simulate time selection through localStorage
    savedProgress.formData.birthTime = '14:30';
    savedProgress.currentStep = 4;
    localStorage.setItem('onboarding-progress', JSON.stringify(savedProgress));

    // Re-render to move to step 4
    const { unmount: unmount2 } = render(<OnboardingPage />);
    unmount2();
    render(<OnboardingPage />);

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
      expect(mockUpdateUserProfile).toHaveBeenCalledWith(mockUser.sub, {
        email: 'test@example.com',
        birthName: 'John Michael Smith',
        birthDate: '1990-07-15',
        birthTime: '14:30',
        birthCity: 'San Francisco',
        birthState: 'California',
        birthCountry: 'United States',
      });
    });

    await waitFor(
      () => {
        expect(mockRefreshUser).toHaveBeenCalled();
      },
      { timeout: 3000 },
    );
  });

  it('validates birth time is required on step 3', async () => {
    const mockAuthService = {
      getIdToken: jest.fn().mockResolvedValue('mock-token'),
    };

    // Mock UserApi
    const mockHasCompletedOnboarding = jest.fn().mockResolvedValue(false);
    (UserApi as jest.Mock).mockImplementation(() => ({
      hasCompletedOnboarding: mockHasCompletedOnboarding,
    }));

    (useAuth as jest.Mock).mockReturnValue({
      user: mockUser,
      loading: false,
      refreshUser: jest.fn(),
      authService: mockAuthService,
    });

    // Start at step 3 with location and date already filled
    const savedProgress = {
      formData: {
        birthCity: 'San Francisco',
        birthState: 'California',
        birthCountry: 'United States',
        birthDate: '1990-07-15',
        birthTime: '',
        birthName: '',
      },
      currentStep: 3,
    };
    localStorage.setItem('onboarding-progress', JSON.stringify(savedProgress));

    render(<OnboardingPage />);

    // Step 3 - Try to proceed without entering birth time
    await waitFor(() => {
      expect(screen.getByText('Birth Time')).toBeInTheDocument();
    });

    const nextButton = screen.getByText('Next');
    fireEvent.click(nextButton);

    // Should show validation error
    await waitFor(() => {
      expect(screen.getByText('Birth time is required')).toBeInTheDocument();
    });
  });

  it('validates required fields on step 1', async () => {
    const mockAuthService = {
      getIdToken: jest.fn().mockResolvedValue('mock-token'),
    };

    // Mock UserApi
    const mockHasCompletedOnboarding = jest.fn().mockResolvedValue(false);
    (UserApi as jest.Mock).mockImplementation(() => ({
      hasCompletedOnboarding: mockHasCompletedOnboarding,
    }));

    (useAuth as jest.Mock).mockReturnValue({
      user: mockUser,
      loading: false,
      refreshUser: jest.fn(),
      authService: mockAuthService,
    });

    render(<OnboardingPage />);

    await waitFor(() => {
      expect(screen.getByLabelText('City')).toBeInTheDocument();
    });

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
      getIdToken: jest.fn().mockResolvedValue('mock-token'),
    };

    // Mock UserApi
    const mockHasCompletedOnboarding = jest.fn().mockResolvedValue(false);
    (UserApi as jest.Mock).mockImplementation(() => ({
      hasCompletedOnboarding: mockHasCompletedOnboarding,
    }));

    (useAuth as jest.Mock).mockReturnValue({
      user: mockUser,
      loading: false,
      refreshUser: jest.fn(),
      authService: mockAuthService,
    });

    render(<OnboardingPage />);

    await waitFor(() => {
      expect(screen.getByText('Birth Location')).toBeInTheDocument();
    });

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

  it.skip('navigates through all steps', async () => {
    const mockRefreshUser = jest.fn().mockResolvedValue(undefined);
    const mockAuthService = {
      getIdToken: jest.fn().mockResolvedValue('mock-token'),
    };

    // Mock UserApi
    const mockHasCompletedOnboarding = jest.fn().mockResolvedValue(false);
    const mockUpdateUserProfile = jest.fn().mockResolvedValue({
      message: 'Profile updated successfully',
    });

    (UserApi as jest.Mock).mockImplementation(() => ({
      hasCompletedOnboarding: mockHasCompletedOnboarding,
      updateUserProfile: mockUpdateUserProfile,
    }));

    (useAuth as jest.Mock).mockReturnValue({
      user: mockUser,
      loading: false,
      refreshUser: mockRefreshUser,
      authService: mockAuthService,
    });

    render(<OnboardingPage />);

    await waitFor(() => {
      expect(screen.getByLabelText('City')).toBeInTheDocument();
    });

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

    // Step 2: Birth Date with DatePicker
    await waitFor(() => {
      expect(screen.getByText('Birth Date')).toBeInTheDocument();
    });

    // DatePicker shows as a button, we need to mock the date selection
    // For simplicity in tests, we'll directly set the form data
    const formDataWithDate = {
      birthCity: 'San Francisco',
      birthState: 'California',
      birthCountry: 'United States',
      birthDate: '1990-07-15',
      birthTime: '',
      birthName: '',
    };

    // Simulate the DatePicker setting a date by updating localStorage
    localStorage.setItem(
      'onboarding-progress',
      JSON.stringify({
        formData: formDataWithDate,
        currentStep: 2,
      }),
    );

    // Click Next to proceed to step 3
    fireEvent.click(screen.getByText('Next'));

    // Step 3: Birth Time (required)
    await waitFor(() => {
      expect(screen.getByText('Birth Time')).toBeInTheDocument();
    });
    // Now birth time is required, add a time value
    // TimePicker is also a button component, simulate selection via localStorage
    formDataWithDate.birthTime = '14:30';
    localStorage.setItem(
      'onboarding-progress',
      JSON.stringify({
        formData: formDataWithDate,
        currentStep: 3,
      }),
    );
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
      expect(mockUpdateUserProfile).toHaveBeenCalledWith(mockUser.sub, {
        email: 'test@example.com',
        birthName: 'John Michael Smith',
        birthDate: '1990-07-15',
        birthTime: '14:30',
        birthCity: 'San Francisco',
        birthState: 'California',
        birthCountry: 'United States',
      });
    });

    await waitFor(
      () => {
        expect(mockPush).toHaveBeenCalledWith('/dashboard');
      },
      { timeout: 3000 },
    );
  });

  it.skip('handles update errors gracefully', async () => {
    const mockRefreshUser = jest.fn();
    const mockAuthService = {
      getIdToken: jest.fn().mockResolvedValue('mock-token'),
    };

    // Mock UserApi
    const mockHasCompletedOnboarding = jest.fn().mockResolvedValue(false);
    const mockUpdateUserProfile = jest.fn().mockRejectedValue(new Error('Update failed'));

    (UserApi as jest.Mock).mockImplementation(() => ({
      hasCompletedOnboarding: mockHasCompletedOnboarding,
      updateUserProfile: mockUpdateUserProfile,
    }));

    (useAuth as jest.Mock).mockReturnValue({
      user: mockUser,
      loading: false,
      refreshUser: mockRefreshUser,
      authService: mockAuthService,
    });

    render(<OnboardingPage />);

    await waitFor(() => {
      expect(screen.getByLabelText('City')).toBeInTheDocument();
    });

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

    // Step 2 - Date selection with DatePicker
    await waitFor(() => screen.getByText('Birth Date'));

    // Click Next without selecting a date should show error
    fireEvent.click(screen.getByText('Next'));

    await waitFor(() => {
      expect(screen.getByText('Date is required')).toBeInTheDocument();
    });

    // Mock the date selection by setting localStorage and re-rendering
    const formDataWithDate = {
      birthCity: 'San Francisco',
      birthState: 'California',
      birthCountry: 'United States',
      birthDate: '1990-07-15',
      birthTime: '10:15',
      birthName: '',
    };

    // Jump directly to step 3 with date filled
    localStorage.setItem(
      'onboarding-progress',
      JSON.stringify({
        formData: formDataWithDate,
        currentStep: 3,
      }),
    );

    // Re-render the component to pick up localStorage
    const { unmount: unmount3 } = render(<OnboardingPage />);
    unmount3();
    render(<OnboardingPage />);

    // Step 3 - Birth time
    await waitFor(() => screen.getByText('Birth Time'));

    // Click Next to go to step 4
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
