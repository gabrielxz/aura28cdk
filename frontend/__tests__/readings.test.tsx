import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { useRouter } from 'next/navigation';
import ReadingsTab from '@/app/dashboard/readings-tab';
// Reading detail is now handled within the ReadingsTab component
import { UserApi } from '@/lib/api/user-api';
import { generateReadingPDF, isPDFGenerationSupported } from '@/lib/pdf/reading-pdf-generator';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useParams: jest.fn(),
}));

// Mock the auth hook
jest.mock('@/lib/auth/use-auth', () => ({
  useAuth: jest.fn(),
}));

// Mock date-fns
jest.mock('date-fns', () => ({
  formatDistanceToNow: jest.fn(() => '2 days'),
}));

// Mock the toast hook
const mockToast = jest.fn();
jest.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

// Mock PDF generator
jest.mock('@/lib/pdf/reading-pdf-generator', () => ({
  generateReadingPDF: jest.fn(),
  isPDFGenerationSupported: jest.fn(() => true),
}));

describe('ReadingsTab', () => {
  let mockUserApi: jest.Mocked<UserApi>;

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();

    // Clear mock toast calls
    mockToast.mockClear();

    // Create mock UserApi
    mockUserApi = {
      getNatalChart: jest.fn(),
      getReadings: jest.fn(),
      // generateReading: removed in KAN-66 - reading generation now happens through Stripe webhook
      getReadingDetail: jest.fn(),
      getUserProfile: jest.fn(),
    } as unknown as jest.Mocked<UserApi>;
  });

  it('should display readings list', async () => {
    const mockReadings = {
      readings: [
        {
          readingId: 'reading-1',
          type: 'Soul Blueprint',
          status: 'Ready' as const,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:01:00Z',
        },
        {
          readingId: 'reading-2',
          type: 'Soul Blueprint',
          status: 'Processing' as const,
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
        },
      ],
      count: 2,
    };

    mockUserApi.getNatalChart.mockResolvedValue({
      userId: 'test-user',
      chartType: 'natal',
      createdAt: '2024-01-01T00:00:00Z',
      planets: {},
      isTimeEstimated: false,
    });
    mockUserApi.getReadings.mockResolvedValue(mockReadings);

    render(<ReadingsTab userApi={mockUserApi} userId="test-user" />);

    await waitFor(() => {
      const blueprintElements = screen.getAllByText('Soul Blueprint');
      expect(blueprintElements).toHaveLength(2);
      expect(blueprintElements[0]).toBeInTheDocument();
    });

    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('Processing')).toBeInTheDocument();
    expect(screen.getAllByText(/Created 2 days ago/)).toHaveLength(2);
  });

  it('should show empty state when no readings exist', async () => {
    mockUserApi.getNatalChart.mockResolvedValue({
      userId: 'test-user',
      chartType: 'natal',
      createdAt: '2024-01-01T00:00:00Z',
      planets: {},
      isTimeEstimated: false,
    });
    mockUserApi.getReadings.mockResolvedValue({
      readings: [],
      count: 0,
    });

    render(<ReadingsTab userApi={mockUserApi} userId="test-user" />);

    await waitFor(() => {
      expect(screen.getByText('No Readings Yet')).toBeInTheDocument();
    });

    expect(screen.getByText(/Generate your first Soul Blueprint reading/)).toBeInTheDocument();
  });

  // NOTE: These tests are commented out as reading generation is now handled through Stripe payment flow
  // Direct reading generation button was removed in KAN-66

  // it('should disable generate button when natal chart is not available', async () => {
  //   // Test removed - reading generation now happens through payment flow
  // });

  // it('should handle generate reading', async () => {
  //   // Test removed - reading generation now happens through payment flow
  // });

  it('should load reading detail when clicking on a reading', async () => {
    const mockReadings = {
      readings: [
        {
          readingId: 'reading-1',
          type: 'Soul Blueprint',
          status: 'Ready' as const,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:01:00Z',
        },
      ],
      count: 1,
    };

    const mockReadingDetail = {
      readingId: 'reading-1',
      userId: 'test-user',
      type: 'Soul Blueprint',
      status: 'Ready' as const,
      content: 'Your Soul Blueprint reading content...',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:01:00Z',
    };

    mockUserApi.getNatalChart.mockResolvedValue({
      userId: 'test-user',
      chartType: 'natal',
      createdAt: '2024-01-01T00:00:00Z',
      planets: {},
      isTimeEstimated: false,
    });
    mockUserApi.getReadings.mockResolvedValue(mockReadings);
    mockUserApi.getReadingDetail.mockResolvedValue(mockReadingDetail);

    render(<ReadingsTab userApi={mockUserApi} userId="test-user" />);

    await waitFor(() => {
      expect(screen.getByText('Soul Blueprint')).toBeInTheDocument();
    });

    const readingCard = screen.getByText('Soul Blueprint').closest('div');
    if (readingCard) {
      fireEvent.click(readingCard);
    }

    await waitFor(() => {
      expect(mockUserApi.getReadingDetail).toHaveBeenCalledWith('test-user', 'reading-1');
    });

    await waitFor(() => {
      expect(screen.getByText('Your Soul Blueprint reading content...')).toBeInTheDocument();
    });
  });

  it('should show download button for ready readings', async () => {
    const mockReadings = {
      readings: [
        {
          readingId: 'reading-1',
          type: 'Soul Blueprint',
          status: 'Ready' as const,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:01:00Z',
        },
      ],
      count: 1,
    };

    const mockReadingDetail = {
      readingId: 'reading-1',
      userId: 'test-user',
      type: 'Soul Blueprint',
      status: 'Ready' as const,
      content: 'Your Soul Blueprint reading content...',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:01:00Z',
    };

    mockUserApi.getNatalChart.mockResolvedValue({
      userId: 'test-user',
      chartType: 'natal',
      createdAt: '2024-01-01T00:00:00Z',
      planets: {},
      isTimeEstimated: false,
    });
    mockUserApi.getReadings.mockResolvedValue(mockReadings);
    mockUserApi.getReadingDetail.mockResolvedValue(mockReadingDetail);

    render(<ReadingsTab userApi={mockUserApi} userId="test-user" />);

    // Click on the reading to view details
    await waitFor(() => {
      expect(screen.getByText('Soul Blueprint')).toBeInTheDocument();
    });

    const readingCard = screen.getByText('Soul Blueprint').closest('div');
    if (readingCard) {
      fireEvent.click(readingCard);
    }

    // Wait for detail view to load
    await waitFor(() => {
      expect(screen.getByText('Your Soul Blueprint reading content...')).toBeInTheDocument();
    });

    // Check for download button
    const downloadButton = screen.getByRole('button', { name: /Download reading as PDF/i });
    expect(downloadButton).toBeInTheDocument();
    expect(downloadButton).toBeEnabled();
  });

  it('should not show download button for processing readings', async () => {
    const mockReadings = {
      readings: [
        {
          readingId: 'reading-2',
          type: 'Soul Blueprint',
          status: 'Processing' as const,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ],
      count: 1,
    };

    const mockReadingDetail = {
      readingId: 'reading-2',
      userId: 'test-user',
      type: 'Soul Blueprint',
      status: 'Processing' as const,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    mockUserApi.getNatalChart.mockResolvedValue({
      userId: 'test-user',
      chartType: 'natal',
      createdAt: '2024-01-01T00:00:00Z',
      planets: {},
      isTimeEstimated: false,
    });
    mockUserApi.getReadings.mockResolvedValue(mockReadings);
    mockUserApi.getReadingDetail.mockResolvedValue(mockReadingDetail);

    render(<ReadingsTab userApi={mockUserApi} userId="test-user" />);

    // Click on the reading to view details
    await waitFor(() => {
      expect(screen.getByText('Soul Blueprint')).toBeInTheDocument();
    });

    const readingCard = screen.getByText('Soul Blueprint').closest('div');
    if (readingCard) {
      fireEvent.click(readingCard);
    }

    // Wait for detail view to load
    await waitFor(() => {
      expect(screen.getByText('Your reading is being generated...')).toBeInTheDocument();
    });

    // Check that download button is not present
    expect(
      screen.queryByRole('button', { name: /Download reading as PDF/i }),
    ).not.toBeInTheDocument();
  });

  it('should handle PDF download successfully', async () => {
    (generateReadingPDF as jest.Mock).mockResolvedValue({
      success: true,
      filename: 'test-reading.pdf',
    });

    const mockReadings = {
      readings: [
        {
          readingId: 'reading-1',
          type: 'Soul Blueprint',
          status: 'Ready' as const,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:01:00Z',
        },
      ],
      count: 1,
    };

    const mockReadingDetail = {
      readingId: 'reading-1',
      userId: 'test-user',
      type: 'Soul Blueprint',
      status: 'Ready' as const,
      content: 'Your Soul Blueprint reading content...',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:01:00Z',
    };

    const mockProfile = {
      userId: 'test-user',
      email: 'test@example.com',
      profile: {
        birthName: 'John Doe',
        birthDate: '1990-01-01',
        birthCity: 'New York',
        birthState: 'NY',
        birthCountry: 'USA',
      },
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    mockUserApi.getNatalChart.mockResolvedValue({
      userId: 'test-user',
      chartType: 'natal',
      createdAt: '2024-01-01T00:00:00Z',
      planets: {},
      isTimeEstimated: false,
    });
    mockUserApi.getReadings.mockResolvedValue(mockReadings);
    mockUserApi.getReadingDetail.mockResolvedValue(mockReadingDetail);
    mockUserApi.getUserProfile.mockResolvedValue(mockProfile);

    render(<ReadingsTab userApi={mockUserApi} userId="test-user" />);

    // Navigate to reading detail
    await waitFor(() => {
      expect(screen.getByText('Soul Blueprint')).toBeInTheDocument();
    });

    const readingCard = screen.getByText('Soul Blueprint').closest('div');
    if (readingCard) {
      fireEvent.click(readingCard);
    }

    await waitFor(() => {
      expect(screen.getByText('Your Soul Blueprint reading content...')).toBeInTheDocument();
    });

    // Click download button
    const downloadButton = screen.getByRole('button', { name: /Download reading as PDF/i });
    fireEvent.click(downloadButton);

    await waitFor(() => {
      expect(mockUserApi.getUserProfile).toHaveBeenCalledWith('test-user');
      expect(generateReadingPDF).toHaveBeenCalledWith({
        birthName: 'John Doe',
        readingType: 'Soul Blueprint',
        content: 'Your Soul Blueprint reading content...',
        createdAt: '2024-01-01T00:00:00Z',
        onProgress: expect.any(Function),
      });
    });
  });

  it('should show loading state during PDF download', async () => {
    // Create a promise that we can control
    let resolveGeneration: (value: { success: boolean; filename: string }) => void;
    const generationPromise = new Promise<{ success: boolean; filename: string }>((resolve) => {
      resolveGeneration = resolve;
    });
    (generateReadingPDF as jest.Mock).mockReturnValue(generationPromise);

    const mockReadings = {
      readings: [
        {
          readingId: 'reading-1',
          type: 'Soul Blueprint',
          status: 'Ready' as const,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:01:00Z',
        },
      ],
      count: 1,
    };

    const mockReadingDetail = {
      readingId: 'reading-1',
      userId: 'test-user',
      type: 'Soul Blueprint',
      status: 'Ready' as const,
      content: 'Your Soul Blueprint reading content...',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:01:00Z',
    };

    const mockProfile = {
      userId: 'test-user',
      email: 'test@example.com',
      profile: {
        birthName: 'John Doe',
        birthDate: '1990-01-01',
        birthCity: 'New York',
        birthState: 'NY',
        birthCountry: 'USA',
      },
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    mockUserApi.getNatalChart.mockResolvedValue({
      userId: 'test-user',
      chartType: 'natal',
      createdAt: '2024-01-01T00:00:00Z',
      planets: {},
      isTimeEstimated: false,
    });
    mockUserApi.getReadings.mockResolvedValue(mockReadings);
    mockUserApi.getReadingDetail.mockResolvedValue(mockReadingDetail);
    mockUserApi.getUserProfile.mockResolvedValue(mockProfile);

    render(<ReadingsTab userApi={mockUserApi} userId="test-user" />);

    // Navigate to reading detail
    await waitFor(() => {
      expect(screen.getByText('Soul Blueprint')).toBeInTheDocument();
    });

    const readingCard = screen.getByText('Soul Blueprint').closest('div');
    if (readingCard) {
      fireEvent.click(readingCard);
    }

    await waitFor(() => {
      expect(screen.getByText('Your Soul Blueprint reading content...')).toBeInTheDocument();
    });

    // Click download button
    const downloadButton = screen.getByRole('button', { name: /Download reading as PDF/i });
    fireEvent.click(downloadButton);

    // Check for loading state
    await waitFor(() => {
      expect(screen.getByText(/Downloading/i)).toBeInTheDocument();
    });

    // Resolve the generation
    resolveGeneration({
      success: true,
      filename: 'test-reading.pdf',
    });

    // Wait for loading state to clear
    await waitFor(() => {
      expect(screen.queryByText(/Downloading/i)).not.toBeInTheDocument();
    });
  });

  it('should handle PDF download failure', async () => {
    (generateReadingPDF as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Failed to generate PDF due to network error',
    });

    const mockReadings = {
      readings: [
        {
          readingId: 'reading-1',
          type: 'Soul Blueprint',
          status: 'Ready' as const,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:01:00Z',
        },
      ],
      count: 1,
    };

    const mockReadingDetail = {
      readingId: 'reading-1',
      userId: 'test-user',
      type: 'Soul Blueprint',
      status: 'Ready' as const,
      content: 'Your Soul Blueprint reading content...',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:01:00Z',
    };

    const mockProfile = {
      userId: 'test-user',
      email: 'test@example.com',
      profile: {
        birthName: 'John Doe',
        birthDate: '1990-01-01',
        birthCity: 'New York',
        birthState: 'NY',
        birthCountry: 'USA',
      },
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    mockUserApi.getNatalChart.mockResolvedValue({
      userId: 'test-user',
      chartType: 'natal',
      createdAt: '2024-01-01T00:00:00Z',
      planets: {},
      isTimeEstimated: false,
    });
    mockUserApi.getReadings.mockResolvedValue(mockReadings);
    mockUserApi.getReadingDetail.mockResolvedValue(mockReadingDetail);
    mockUserApi.getUserProfile.mockResolvedValue(mockProfile);

    render(<ReadingsTab userApi={mockUserApi} userId="test-user" />);

    // Navigate to reading detail
    await waitFor(() => {
      expect(screen.getByText('Soul Blueprint')).toBeInTheDocument();
    });

    const readingCard = screen.getByText('Soul Blueprint').closest('div');
    if (readingCard) {
      fireEvent.click(readingCard);
    }

    await waitFor(() => {
      expect(screen.getByText('Your Soul Blueprint reading content...')).toBeInTheDocument();
    });

    // Click download button
    const downloadButton = screen.getByRole('button', { name: /Download reading as PDF/i });
    fireEvent.click(downloadButton);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Download Failed',
        description: 'Failed to generate PDF due to network error',
        variant: 'destructive',
      });
    });
  });

  it('should handle missing user profile during PDF download', async () => {
    const mockReadings = {
      readings: [
        {
          readingId: 'reading-1',
          type: 'Soul Blueprint',
          status: 'Ready' as const,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:01:00Z',
        },
      ],
      count: 1,
    };

    const mockReadingDetail = {
      readingId: 'reading-1',
      userId: 'test-user',
      type: 'Soul Blueprint',
      status: 'Ready' as const,
      content: 'Your Soul Blueprint reading content...',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:01:00Z',
    };

    mockUserApi.getNatalChart.mockResolvedValue({
      userId: 'test-user',
      chartType: 'natal',
      createdAt: '2024-01-01T00:00:00Z',
      planets: {},
      isTimeEstimated: false,
    });
    mockUserApi.getReadings.mockResolvedValue(mockReadings);
    mockUserApi.getReadingDetail.mockResolvedValue(mockReadingDetail);
    mockUserApi.getUserProfile.mockResolvedValue(null);

    render(<ReadingsTab userApi={mockUserApi} userId="test-user" />);

    // Navigate to reading detail
    await waitFor(() => {
      expect(screen.getByText('Soul Blueprint')).toBeInTheDocument();
    });

    const readingCard = screen.getByText('Soul Blueprint').closest('div');
    if (readingCard) {
      fireEvent.click(readingCard);
    }

    await waitFor(() => {
      expect(screen.getByText('Your Soul Blueprint reading content...')).toBeInTheDocument();
    });

    // Click download button
    const downloadButton = screen.getByRole('button', { name: /Download reading as PDF/i });
    fireEvent.click(downloadButton);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Profile Incomplete',
        description: 'Please complete your profile before downloading readings.',
        variant: 'destructive',
      });
    });
  });

  it('should handle unsupported browser for PDF download', async () => {
    (isPDFGenerationSupported as jest.Mock).mockReturnValue(false);

    const mockReadings = {
      readings: [
        {
          readingId: 'reading-1',
          type: 'Soul Blueprint',
          status: 'Ready' as const,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:01:00Z',
        },
      ],
      count: 1,
    };

    const mockReadingDetail = {
      readingId: 'reading-1',
      userId: 'test-user',
      type: 'Soul Blueprint',
      status: 'Ready' as const,
      content: 'Your Soul Blueprint reading content...',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:01:00Z',
    };

    mockUserApi.getNatalChart.mockResolvedValue({
      userId: 'test-user',
      chartType: 'natal',
      createdAt: '2024-01-01T00:00:00Z',
      planets: {},
      isTimeEstimated: false,
    });
    mockUserApi.getReadings.mockResolvedValue(mockReadings);
    mockUserApi.getReadingDetail.mockResolvedValue(mockReadingDetail);

    render(<ReadingsTab userApi={mockUserApi} userId="test-user" />);

    // Navigate to reading detail
    await waitFor(() => {
      expect(screen.getByText('Soul Blueprint')).toBeInTheDocument();
    });

    const readingCard = screen.getByText('Soul Blueprint').closest('div');
    if (readingCard) {
      fireEvent.click(readingCard);
    }

    await waitFor(() => {
      expect(screen.getByText('Your Soul Blueprint reading content...')).toBeInTheDocument();
    });

    // Click download button
    const downloadButton = screen.getByRole('button', { name: /Download reading as PDF/i });
    fireEvent.click(downloadButton);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Not Supported',
        description: 'PDF download is not supported in your browser.',
        variant: 'destructive',
      });
    });

    // Reset mock
    isPDFGenerationSupported.mockReturnValue(true);
  });

  it('should show progress percentage during PDF download', async () => {
    let progressCallback: ((percentage: number) => void) | undefined;
    (generateReadingPDF as jest.Mock).mockImplementation(async (options) => {
      progressCallback = options.onProgress;
      // Simulate progress updates
      setTimeout(() => progressCallback?.(25), 10);
      setTimeout(() => progressCallback?.(50), 20);
      setTimeout(() => progressCallback?.(75), 30);
      setTimeout(() => progressCallback?.(100), 40);

      return new Promise((resolve) => {
        setTimeout(() => resolve({ success: true, filename: 'test.pdf' }), 50);
      });
    });

    const mockReadings = {
      readings: [
        {
          readingId: 'reading-1',
          type: 'Soul Blueprint',
          status: 'Ready' as const,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:01:00Z',
        },
      ],
      count: 1,
    };

    const mockReadingDetail = {
      readingId: 'reading-1',
      userId: 'test-user',
      type: 'Soul Blueprint',
      status: 'Ready' as const,
      content: 'Your Soul Blueprint reading content...',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:01:00Z',
    };

    const mockProfile = {
      userId: 'test-user',
      email: 'test@example.com',
      profile: {
        birthName: 'John Doe',
        birthDate: '1990-01-01',
        birthCity: 'New York',
        birthState: 'NY',
        birthCountry: 'USA',
      },
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    mockUserApi.getNatalChart.mockResolvedValue({
      userId: 'test-user',
      chartType: 'natal',
      createdAt: '2024-01-01T00:00:00Z',
      planets: {},
      isTimeEstimated: false,
    });
    mockUserApi.getReadings.mockResolvedValue(mockReadings);
    mockUserApi.getReadingDetail.mockResolvedValue(mockReadingDetail);
    mockUserApi.getUserProfile.mockResolvedValue(mockProfile);

    render(<ReadingsTab userApi={mockUserApi} userId="test-user" />);

    // Navigate to reading detail
    await waitFor(() => {
      expect(screen.getByText('Soul Blueprint')).toBeInTheDocument();
    });

    const readingCard = screen.getByText('Soul Blueprint').closest('div');
    if (readingCard) {
      fireEvent.click(readingCard);
    }

    await waitFor(() => {
      expect(screen.getByText('Your Soul Blueprint reading content...')).toBeInTheDocument();
    });

    // Click download button
    const downloadButton = screen.getByRole('button', { name: /Download reading as PDF/i });
    fireEvent.click(downloadButton);

    // Check for progress updates
    await waitFor(() => {
      const downloadingText = screen.getByText(/Downloading/i);
      expect(downloadingText).toBeInTheDocument();
    });
  });

  it('should not show download button for failed readings', async () => {
    const mockReadings = {
      readings: [
        {
          readingId: 'reading-3',
          type: 'Soul Blueprint',
          status: 'Failed' as const,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ],
      count: 1,
    };

    const mockReadingDetail = {
      readingId: 'reading-3',
      userId: 'test-user',
      type: 'Soul Blueprint',
      status: 'Failed' as const,
      error: 'Failed to generate reading',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    mockUserApi.getNatalChart.mockResolvedValue({
      userId: 'test-user',
      chartType: 'natal',
      createdAt: '2024-01-01T00:00:00Z',
      planets: {},
      isTimeEstimated: false,
    });
    mockUserApi.getReadings.mockResolvedValue(mockReadings);
    mockUserApi.getReadingDetail.mockResolvedValue(mockReadingDetail);

    render(<ReadingsTab userApi={mockUserApi} userId="test-user" />);

    // Click on the reading to view details
    await waitFor(() => {
      expect(screen.getByText('Soul Blueprint')).toBeInTheDocument();
    });

    const readingCard = screen.getByText('Soul Blueprint').closest('div');
    if (readingCard) {
      fireEvent.click(readingCard);
    }

    // Wait for detail view to load
    await waitFor(() => {
      expect(
        screen.getByText(/We're sorry, but we couldn't generate your reading/),
      ).toBeInTheDocument();
    });

    // Check that download button is not present
    expect(
      screen.queryByRole('button', { name: /Download reading as PDF/i }),
    ).not.toBeInTheDocument();
  });

  it('should not show download button for In Review readings', async () => {
    const mockReadings = {
      readings: [
        {
          readingId: 'reading-4',
          type: 'Soul Blueprint',
          status: 'In Review' as const,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ],
      count: 1,
    };

    const mockReadingDetail = {
      readingId: 'reading-4',
      userId: 'test-user',
      type: 'Soul Blueprint',
      status: 'In Review' as const,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    mockUserApi.getNatalChart.mockResolvedValue({
      userId: 'test-user',
      chartType: 'natal',
      createdAt: '2024-01-01T00:00:00Z',
      planets: {},
      isTimeEstimated: false,
    });
    mockUserApi.getReadings.mockResolvedValue(mockReadings);
    mockUserApi.getReadingDetail.mockResolvedValue(mockReadingDetail);

    render(<ReadingsTab userApi={mockUserApi} userId="test-user" />);

    // Click on the reading to view details
    await waitFor(() => {
      expect(screen.getByText('Soul Blueprint')).toBeInTheDocument();
    });

    const readingCard = screen.getByText('Soul Blueprint').closest('div');
    if (readingCard) {
      fireEvent.click(readingCard);
    }

    // Wait for detail view to load
    await waitFor(() => {
      expect(screen.getByText(/Your reading is currently being reviewed/)).toBeInTheDocument();
    });

    // Check that download button is not present
    expect(
      screen.queryByRole('button', { name: /Download reading as PDF/i }),
    ).not.toBeInTheDocument();
  });

  it('should handle getUserProfile API error during PDF download', async () => {
    const mockReadings = {
      readings: [
        {
          readingId: 'reading-1',
          type: 'Soul Blueprint',
          status: 'Ready' as const,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:01:00Z',
        },
      ],
      count: 1,
    };

    const mockReadingDetail = {
      readingId: 'reading-1',
      userId: 'test-user',
      type: 'Soul Blueprint',
      status: 'Ready' as const,
      content: 'Your Soul Blueprint reading content...',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:01:00Z',
    };

    mockUserApi.getNatalChart.mockResolvedValue({
      userId: 'test-user',
      chartType: 'natal',
      createdAt: '2024-01-01T00:00:00Z',
      planets: {},
      isTimeEstimated: false,
    });
    mockUserApi.getReadings.mockResolvedValue(mockReadings);
    mockUserApi.getReadingDetail.mockResolvedValue(mockReadingDetail);
    mockUserApi.getUserProfile.mockRejectedValue(new Error('Network error'));

    render(<ReadingsTab userApi={mockUserApi} userId="test-user" />);

    // Navigate to reading detail
    await waitFor(() => {
      expect(screen.getByText('Soul Blueprint')).toBeInTheDocument();
    });

    const readingCard = screen.getByText('Soul Blueprint').closest('div');
    if (readingCard) {
      fireEvent.click(readingCard);
    }

    await waitFor(() => {
      expect(screen.getByText('Your Soul Blueprint reading content...')).toBeInTheDocument();
    });

    // Click download button
    const downloadButton = screen.getByRole('button', { name: /Download reading as PDF/i });
    fireEvent.click(downloadButton);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Download Failed',
        description: 'Network error',
        variant: 'destructive',
      });
    });
  });
});

// Reading detail page tests removed as the detail view is now handled within ReadingsTab
