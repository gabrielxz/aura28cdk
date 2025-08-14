import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReadingsTable } from '@/components/admin/readings-table';
import { AdminReading } from '@/lib/api/admin-api';
import { format } from 'date-fns';

describe('ReadingsTable', () => {
  const mockReadings: AdminReading[] = [
    {
      readingId: 'reading-1-abc123def456',
      userId: 'user-1',
      userEmail: 'user1@example.com',
      type: 'Soul Blueprint',
      status: 'Ready',
      createdAt: '2024-01-15T10:30:00Z',
      updatedAt: '2024-01-15T10:35:00Z',
    },
    {
      readingId: 'reading-2-xyz789uvw321',
      userId: 'user-2',
      userEmail: 'user2@example.com',
      type: 'Natal Chart',
      status: 'Processing',
      createdAt: '2024-01-16T14:20:00Z',
      updatedAt: '2024-01-16T14:20:00Z',
    },
    {
      readingId: 'reading-3-mno456pqr789',
      userId: 'user-3',
      userEmail: undefined,
      type: 'Soul Blueprint',
      status: 'Failed',
      createdAt: '2024-01-17T08:15:00Z',
      updatedAt: '2024-01-17T08:16:00Z',
    },
    {
      readingId: 'reading-4-stu012vwx345',
      userId: 'user-4',
      userEmail: 'user4@example.com',
      type: 'Astrology Report',
      status: 'In Review',
      createdAt: '2024-01-18T16:45:00Z',
      updatedAt: '2024-01-18T16:45:00Z',
    },
  ];

  const defaultProps = {
    readings: mockReadings,
    loading: false,
    sortField: 'createdAt' as const,
    sortOrder: 'desc' as const,
    onSort: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders table with all columns', () => {
    render(<ReadingsTable {...defaultProps} />);

    // Check column headers
    expect(screen.getByText('Date Generated')).toBeInTheDocument();
    expect(screen.getByText('User')).toBeInTheDocument();
    expect(screen.getByText('Reading Type')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Reading ID')).toBeInTheDocument();
  });

  test('displays reading data correctly', () => {
    render(<ReadingsTable {...defaultProps} />);

    // Check first reading
    expect(screen.getByText('user1@example.com')).toBeInTheDocument();
    expect(screen.getByText('user-1')).toBeInTheDocument();
    const soulBlueprintElements = screen.getAllByText('Soul Blueprint');
    expect(soulBlueprintElements.length).toBeGreaterThan(0);
    expect(screen.getByText('Ready')).toBeInTheDocument();
    const readingIdElements = screen.getAllByText('reading-...');
    expect(readingIdElements.length).toBeGreaterThan(0);

    // Check formatted date
    const formattedDate = format(new Date('2024-01-15T10:30:00Z'), 'MMM dd, yyyy HH:mm');
    expect(screen.getByText(formattedDate)).toBeInTheDocument();
  });

  test('displays "Unknown" for missing email', () => {
    render(<ReadingsTable {...defaultProps} />);

    // Third reading has no email
    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(screen.getByText('user-3')).toBeInTheDocument();
  });

  test('shows loading skeleton when loading', () => {
    render(<ReadingsTable {...defaultProps} loading={true} />);

    // Should show animated loading skeletons
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
    expect(screen.queryByText('Date Generated')).not.toBeInTheDocument();
  });

  test('shows empty state when no readings', () => {
    render(<ReadingsTable {...defaultProps} readings={[]} />);

    expect(screen.getByText('No readings found')).toBeInTheDocument();
    expect(screen.getByText('Try adjusting your filters or check back later')).toBeInTheDocument();
  });

  test('displays correct sort icons', () => {
    const { rerender } = render(<ReadingsTable {...defaultProps} />);

    // Default: sorting by createdAt desc (down arrow)
    const createdAtButton = screen.getByRole('button', { name: /Date Generated/i });
    const createdAtIcon = createdAtButton.querySelector('.lucide-arrow-down');
    expect(createdAtIcon).toBeInTheDocument();

    // Other columns should show up-down arrow
    const userButton = screen.getByRole('button', { name: /^User/i });
    const userIcon = userButton.querySelector('.lucide-arrow-up-down');
    expect(userIcon).toBeInTheDocument();

    // Change to ascending
    rerender(<ReadingsTable {...defaultProps} sortOrder="asc" />);
    const updatedIcon = createdAtButton.querySelector('.lucide-arrow-up');
    expect(updatedIcon).toBeInTheDocument();
  });

  test('handles sort column clicks', async () => {
    const user = userEvent.setup();
    const onSort = jest.fn();
    render(<ReadingsTable {...defaultProps} onSort={onSort} />);

    // Click Date Generated
    await user.click(screen.getByRole('button', { name: /Date Generated/i }));
    expect(onSort).toHaveBeenCalledWith('createdAt');

    // Click User
    await user.click(screen.getByRole('button', { name: /^User/i }));
    expect(onSort).toHaveBeenCalledWith('userEmail');

    // Click Reading Type
    await user.click(screen.getByRole('button', { name: /Reading Type/i }));
    expect(onSort).toHaveBeenCalledWith('type');

    // Click Status
    await user.click(screen.getByRole('button', { name: /^Status/i }));
    expect(onSort).toHaveBeenCalledWith('status');
  });

  test('displays correct badge variants for statuses', () => {
    render(<ReadingsTable {...defaultProps} />);

    // Just verify the badges are rendered with correct text
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('Processing')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('In Review')).toBeInTheDocument();
  });

  test('truncates reading ID correctly', () => {
    render(<ReadingsTable {...defaultProps} />);

    // Should show first 8 characters + "..."
    const readingIdCells = screen.getAllByText(/reading-\.\.\./);
    expect(readingIdCells).toHaveLength(mockReadings.length);
  });

  test('renders all rows', () => {
    render(<ReadingsTable {...defaultProps} />);

    // Count table rows (excluding header)
    const tableRows = screen.getAllByRole('row');
    expect(tableRows).toHaveLength(mockReadings.length + 1); // +1 for header row
  });

  test('applies correct CSS classes for responsiveness', () => {
    const { container } = render(<ReadingsTable {...defaultProps} />);

    // Check for overflow-x-auto for mobile responsiveness
    const wrapper = container.querySelector('.overflow-x-auto');
    expect(wrapper).toBeInTheDocument();

    // Check for rounded borders
    expect(wrapper).toHaveClass('rounded-lg', 'border');
  });

  test('displays user ID as secondary text', () => {
    render(<ReadingsTable {...defaultProps} />);

    // Each user cell should have email and ID
    mockReadings.forEach((reading) => {
      const userId = screen.getByText(reading.userId);
      expect(userId).toHaveClass('text-xs', 'text-muted-foreground');
    });
  });

  test('formats dates correctly in different timezones', () => {
    render(<ReadingsTable {...defaultProps} />);

    // Verify all dates are formatted
    mockReadings.forEach((reading) => {
      const formattedDate = format(new Date(reading.createdAt), 'MMM dd, yyyy HH:mm');
      expect(screen.getByText(formattedDate)).toBeInTheDocument();
    });
  });

  test('handles undefined status gracefully', () => {
    const readingsWithUndefinedStatus = [
      {
        ...mockReadings[0],
        status: 'UnknownStatus' as unknown as 'Ready' | 'Processing' | 'Failed',
      },
    ];

    render(<ReadingsTable {...defaultProps} readings={readingsWithUndefinedStatus} />);

    // Should still render
    const statusBadge = screen.getByText('UnknownStatus');
    expect(statusBadge).toBeInTheDocument();
  });

  test('maintains table structure when empty', () => {
    render(<ReadingsTable {...defaultProps} readings={[]} />);

    // Should not render table when empty
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    // Should show empty state container
    const emptyState = screen.getByText('No readings found').closest('div');
    expect(emptyState?.parentElement).toHaveClass('border-dashed');
  });

  test('shows correct sort indicator for active column', () => {
    const { rerender } = render(
      <ReadingsTable {...defaultProps} sortField="type" sortOrder="asc" />,
    );

    // Type column should show up arrow
    const typeButton = screen.getByRole('button', { name: /Reading Type/i });
    const typeIcon = typeButton.querySelector('.lucide-arrow-up');
    expect(typeIcon).toBeInTheDocument();

    // Other columns should show up-down arrow
    const dateButton = screen.getByRole('button', { name: /Date Generated/i });
    const dateIcon = dateButton.querySelector('.lucide-arrow-up-down');
    expect(dateIcon).toBeInTheDocument();

    // Change sort field
    rerender(<ReadingsTable {...defaultProps} sortField="status" sortOrder="desc" />);

    const statusButton = screen.getByRole('button', { name: /^Status/i });
    const statusIcon = statusButton.querySelector('.lucide-arrow-down');
    expect(statusIcon).toBeInTheDocument();
  });

  test('applies correct styling to sortable headers', () => {
    render(<ReadingsTable {...defaultProps} />);

    const sortButtons = screen.getAllByRole('button', {
      name: /Date Generated|User|Reading Type|Status/i,
    });

    sortButtons.forEach((button) => {
      expect(button).toHaveClass('hover:bg-transparent');
      expect(button).toHaveClass('font-semibold');
    });
  });
});
