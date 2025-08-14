import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { ReadingDetailsSheet, ReadingDetails } from '@/components/admin/reading-details-sheet';
import { AdminApi } from '@/lib/api/admin-api';
import { format } from 'date-fns';

// Mock the AdminApi
jest.mock('@/lib/api/admin-api');

// Mock the UI components
jest.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="sheet">{children}</div> : null,
  SheetContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sheet-content">{children}</div>
  ),
  SheetHeader: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sheet-header">{children}</div>
  ),
  SheetTitle: ({ children }: { children: React.ReactNode }) => (
    <h2 data-testid="sheet-title">{children}</h2>
  ),
  SheetDescription: ({ children }: { children: React.ReactNode }) => (
    <p data-testid="sheet-description">{children}</p>
  ),
}));

jest.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="scroll-area">{children}</div>
  ),
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant }: { children: React.ReactNode; variant?: string }) => (
    <span data-testid="badge" data-variant={variant}>
      {children}
    </span>
  ),
}));

jest.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}));

jest.mock('@/components/ui/alert', () => ({
  Alert: ({
    children,
    variant,
  }: {
    children: React.ReactNode;
    variant?: 'destructive' | 'default';
  }) => (
    <div data-testid="alert" data-variant={variant}>
      {children}
    </div>
  ),
  AlertDescription: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="alert-description">{children}</div>
  ),
}));

describe('ReadingDetailsSheet', () => {
  let mockAdminApi: jest.Mocked<AdminApi>;
  const mockOnOpenChange = jest.fn();

  const mockReadingDetails: ReadingDetails = {
    readingId: 'reading-123-abc-def',
    userId: 'user-456',
    userEmail: 'test@example.com',
    type: 'Soul Blueprint',
    status: 'Ready',
    createdAt: '2024-01-15T10:30:00Z',
    updatedAt: '2024-01-15T10:35:00Z',
    content: {
      interpretation: 'This is the interpretation of the reading.',
      insights: ['First insight', 'Second insight', 'Third insight'],
      recommendations: ['Recommendation 1', 'Recommendation 2'],
      chartData: { some: 'data' },
    },
    metadata: {
      model: 'gpt-4',
      temperature: 0.7,
      maxTokens: 2000,
      processingTime: 5432,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockAdminApi = {
      getReadingDetails: jest.fn(),
    } as unknown as jest.Mocked<AdminApi>;
  });

  test('renders closed sheet when open is false', () => {
    render(
      <ReadingDetailsSheet
        userId="user-123"
        readingId="reading-123"
        open={false}
        onOpenChange={mockOnOpenChange}
        adminApi={mockAdminApi}
      />,
    );

    expect(screen.queryByTestId('sheet')).not.toBeInTheDocument();
  });

  test('renders open sheet with title and description', () => {
    render(
      <ReadingDetailsSheet
        userId="user-123"
        readingId="reading-123"
        open={true}
        onOpenChange={mockOnOpenChange}
        adminApi={mockAdminApi}
      />,
    );

    expect(screen.getByTestId('sheet')).toBeInTheDocument();
    expect(screen.getByText('Reading Details')).toBeInTheDocument();
    expect(screen.getByText('View complete information about this reading')).toBeInTheDocument();
  });

  test('fetches reading details when opened with readingId', async () => {
    mockAdminApi.getReadingDetails.mockResolvedValue(mockReadingDetails);

    render(
      <ReadingDetailsSheet
        userId="user-123"
        readingId="reading-123"
        open={true}
        onOpenChange={mockOnOpenChange}
        adminApi={mockAdminApi}
      />,
    );

    await waitFor(() => {
      expect(mockAdminApi.getReadingDetails).toHaveBeenCalledWith('user-123', 'reading-123');
    });
  });

  test('displays loading skeletons while fetching', () => {
    mockAdminApi.getReadingDetails.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(mockReadingDetails), 1000)),
    );

    render(
      <ReadingDetailsSheet
        userId="user-123"
        readingId="reading-123"
        open={true}
        onOpenChange={mockOnOpenChange}
        adminApi={mockAdminApi}
      />,
    );

    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons).toHaveLength(3);
  });

  test('displays error alert when fetch fails', async () => {
    mockAdminApi.getReadingDetails.mockRejectedValue(new Error('Failed to fetch'));

    render(
      <ReadingDetailsSheet
        userId="user-123"
        readingId="reading-123"
        open={true}
        onOpenChange={mockOnOpenChange}
        adminApi={mockAdminApi}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('alert')).toHaveAttribute('data-variant', 'destructive');
      expect(screen.getByText('Failed to fetch')).toBeInTheDocument();
    });
  });

  test('displays all reading details when loaded successfully', async () => {
    mockAdminApi.getReadingDetails.mockResolvedValue(mockReadingDetails);

    render(
      <ReadingDetailsSheet
        userId="user-123"
        readingId="reading-123"
        open={true}
        onOpenChange={mockOnOpenChange}
        adminApi={mockAdminApi}
      />,
    );

    await waitFor(() => {
      // Basic Information
      expect(screen.getByText('Basic Information')).toBeInTheDocument();
      expect(screen.getByText('reading-123-abc-def')).toBeInTheDocument();
      expect(screen.getByText('Ready')).toBeInTheDocument();
      expect(screen.getByText('Soul Blueprint')).toBeInTheDocument();
      expect(
        screen.getByText(format(new Date('2024-01-15T10:30:00Z'), 'MMM dd, yyyy HH:mm')),
      ).toBeInTheDocument();

      // User Information
      expect(screen.getByText('User Information')).toBeInTheDocument();
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
      expect(screen.getByText('user-456')).toBeInTheDocument();

      // Content
      expect(screen.getByText('Reading Content')).toBeInTheDocument();
      expect(screen.getByText('This is the interpretation of the reading.')).toBeInTheDocument();
      expect(screen.getByText('First insight')).toBeInTheDocument();
      expect(screen.getByText('Second insight')).toBeInTheDocument();
      expect(screen.getByText('Third insight')).toBeInTheDocument();
      expect(screen.getByText('Recommendation 1')).toBeInTheDocument();
      expect(screen.getByText('Recommendation 2')).toBeInTheDocument();

      // Metadata
      expect(screen.getByText('Processing Metadata')).toBeInTheDocument();
      expect(screen.getByText('gpt-4')).toBeInTheDocument();
      expect(screen.getByText('0.7')).toBeInTheDocument();
      expect(screen.getByText('2000')).toBeInTheDocument();
      expect(screen.getByText('5.43s')).toBeInTheDocument();
    });
  });

  test('displays error information when reading has error', async () => {
    const readingWithError = {
      ...mockReadingDetails,
      status: 'Failed' as const,
      error: 'Processing failed due to invalid input',
      content: undefined,
    };

    mockAdminApi.getReadingDetails.mockResolvedValue(readingWithError);

    render(
      <ReadingDetailsSheet
        userId="user-123"
        readingId="reading-123"
        open={true}
        onOpenChange={mockOnOpenChange}
        adminApi={mockAdminApi}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('alert')).toHaveAttribute('data-variant', 'destructive');
      expect(screen.getByText('Processing failed due to invalid input')).toBeInTheDocument();
    });
  });

  test('handles missing user email gracefully', async () => {
    const readingWithoutEmail = {
      ...mockReadingDetails,
      userEmail: undefined,
    };

    mockAdminApi.getReadingDetails.mockResolvedValue(readingWithoutEmail);

    render(
      <ReadingDetailsSheet
        userId="user-123"
        readingId="reading-123"
        open={true}
        onOpenChange={mockOnOpenChange}
        adminApi={mockAdminApi}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Not available')).toBeInTheDocument();
    });
  });

  test('displays correct badge variant for different statuses', async () => {
    const testStatuses = [
      { status: 'Ready' as const, variant: 'default' },
      { status: 'Processing' as const, variant: 'secondary' },
      { status: 'Failed' as const, variant: 'destructive' },
      { status: 'In Review' as const, variant: 'outline' },
    ];

    for (const { status, variant } of testStatuses) {
      const reading = { ...mockReadingDetails, status };
      mockAdminApi.getReadingDetails.mockResolvedValue(reading);

      const { rerender } = render(
        <ReadingDetailsSheet
          userId="user-123"
          readingId="reading-123"
          open={true}
          onOpenChange={mockOnOpenChange}
          adminApi={mockAdminApi}
        />,
      );

      await waitFor(() => {
        const badge = screen.getByText(status);
        expect(badge.closest('[data-testid="badge"]')).toHaveAttribute('data-variant', variant);
      });

      rerender(
        <ReadingDetailsSheet
          userId="user-124"
          readingId="reading-124"
          open={true}
          onOpenChange={mockOnOpenChange}
          adminApi={mockAdminApi}
        />,
      );
    }
  });

  test('does not fetch when readingId is null', () => {
    render(
      <ReadingDetailsSheet
        userId={null}
        readingId={null}
        open={true}
        onOpenChange={mockOnOpenChange}
        adminApi={mockAdminApi}
      />,
    );

    expect(mockAdminApi.getReadingDetails).not.toHaveBeenCalled();
  });

  test('refetches data when readingId changes', async () => {
    mockAdminApi.getReadingDetails.mockResolvedValue(mockReadingDetails);

    const { rerender } = render(
      <ReadingDetailsSheet
        userId="user-123"
        readingId="reading-123"
        open={true}
        onOpenChange={mockOnOpenChange}
        adminApi={mockAdminApi}
      />,
    );

    await waitFor(() => {
      expect(mockAdminApi.getReadingDetails).toHaveBeenCalledWith('user-123', 'reading-123');
    });

    const newReading = { ...mockReadingDetails, readingId: 'reading-456' };
    mockAdminApi.getReadingDetails.mockResolvedValue(newReading);

    rerender(
      <ReadingDetailsSheet
        userId="user-456"
        readingId="reading-456"
        open={true}
        onOpenChange={mockOnOpenChange}
        adminApi={mockAdminApi}
      />,
    );

    await waitFor(() => {
      expect(mockAdminApi.getReadingDetails).toHaveBeenCalledWith('user-456', 'reading-456');
    });
  });

  test('handles partial content data gracefully', async () => {
    const partialContentReading = {
      ...mockReadingDetails,
      content: {
        interpretation: 'Only interpretation available',
      },
    };

    mockAdminApi.getReadingDetails.mockResolvedValue(partialContentReading);

    render(
      <ReadingDetailsSheet
        userId="user-123"
        readingId="reading-123"
        open={true}
        onOpenChange={mockOnOpenChange}
        adminApi={mockAdminApi}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Only interpretation available')).toBeInTheDocument();
      expect(screen.queryByText('Key Insights')).not.toBeInTheDocument();
      expect(screen.queryByText('Recommendations')).not.toBeInTheDocument();
    });
  });

  test('handles empty insights and recommendations arrays', async () => {
    const emptyArraysReading = {
      ...mockReadingDetails,
      content: {
        interpretation: 'Interpretation text',
        insights: [],
        recommendations: [],
      },
    };

    mockAdminApi.getReadingDetails.mockResolvedValue(emptyArraysReading);

    render(
      <ReadingDetailsSheet
        userId="user-123"
        readingId="reading-123"
        open={true}
        onOpenChange={mockOnOpenChange}
        adminApi={mockAdminApi}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Interpretation text')).toBeInTheDocument();
      expect(screen.queryByText('Key Insights')).not.toBeInTheDocument();
      expect(screen.queryByText('Recommendations')).not.toBeInTheDocument();
    });
  });

  test('formats timestamps correctly', async () => {
    mockAdminApi.getReadingDetails.mockResolvedValue(mockReadingDetails);

    render(
      <ReadingDetailsSheet
        userId="user-123"
        readingId="reading-123"
        open={true}
        onOpenChange={mockOnOpenChange}
        adminApi={mockAdminApi}
      />,
    );

    await waitFor(() => {
      // Check for formatted dates
      const createdDate = format(new Date('2024-01-15T10:30:00Z'), 'PPpp');
      const updatedDate = format(new Date('2024-01-15T10:35:00Z'), 'PPpp');

      expect(screen.getByText(createdDate)).toBeInTheDocument();
      expect(screen.getByText(updatedDate)).toBeInTheDocument();
    });
  });

  test('handles missing metadata gracefully', async () => {
    const noMetadataReading = {
      ...mockReadingDetails,
      metadata: undefined,
    };

    mockAdminApi.getReadingDetails.mockResolvedValue(noMetadataReading);

    render(
      <ReadingDetailsSheet
        userId="user-123"
        readingId="reading-123"
        open={true}
        onOpenChange={mockOnOpenChange}
        adminApi={mockAdminApi}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByText('Processing Metadata')).not.toBeInTheDocument();
    });
  });

  test('logs error to console when fetch fails', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    const error = new Error('Network error');
    mockAdminApi.getReadingDetails.mockRejectedValue(error);

    render(
      <ReadingDetailsSheet
        userId="user-123"
        readingId="reading-123"
        open={true}
        onOpenChange={mockOnOpenChange}
        adminApi={mockAdminApi}
      />,
    );

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error fetching reading details:', error);
    });

    consoleErrorSpy.mockRestore();
  });
});
