import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { useRouter } from 'next/navigation';
import ReadingsTab from '@/app/dashboard/readings-tab';
// Reading detail is now handled within the ReadingsTab component
import { UserApi } from '@/lib/api/user-api';

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

describe('ReadingsTab', () => {
  let mockUserApi: jest.Mocked<UserApi>;

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();

    // Create mock UserApi
    mockUserApi = {
      getNatalChart: jest.fn(),
      getReadings: jest.fn(),
      generateReading: jest.fn(),
      getReadingDetail: jest.fn(),
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

  it('should disable generate button when natal chart is not available', async () => {
    mockUserApi.getNatalChart.mockRejectedValue(new Error('Not found'));
    mockUserApi.getReadings.mockResolvedValue({
      readings: [],
      count: 0,
    });

    render(<ReadingsTab userApi={mockUserApi} userId="test-user" />);

    await waitFor(() => {
      const generateButton = screen.getByRole('button', { name: /Generate Reading/i });
      expect(generateButton).toBeDisabled();
    });

    expect(
      screen.getByText(/Please complete your profile and generate your natal chart/),
    ).toBeInTheDocument();
  });

  it('should handle generate reading', async () => {
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
    mockUserApi.generateReading.mockResolvedValue({
      message: 'Reading generated successfully',
      readingId: 'new-reading-id',
      status: 'Processing',
    });

    render(<ReadingsTab userApi={mockUserApi} userId="test-user" />);

    await waitFor(() => {
      const generateButton = screen.getByRole('button', { name: /Generate Reading/i });
      expect(generateButton).toBeEnabled();
    });

    const generateButton = screen.getByRole('button', { name: /Generate Reading/i });
    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(mockUserApi.generateReading).toHaveBeenCalledWith('test-user');
    });
  });

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
});

// Reading detail page tests removed as the detail view is now handled within ReadingsTab
