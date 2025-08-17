import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReadingActions } from '@/components/admin/reading-actions';
import { AdminReading } from '@/lib/api/admin-api';

// Mock the toast hook
const mockToast = jest.fn();
jest.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

// Mock the UI components
jest.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown-menu">{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode; asChild?: boolean }) => (
    <div data-testid="dropdown-trigger">{children}</div>
  ),
  DropdownMenuContent: ({ children, align }: { children: React.ReactNode; align?: string }) => (
    <div data-testid="dropdown-content" data-align={align}>
      {children}
    </div>
  ),
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown-label">{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onClick,
    disabled,
    className,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
  }) => (
    <button data-testid="dropdown-item" onClick={onClick} disabled={disabled} className={className}>
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr data-testid="dropdown-separator" />,
  DropdownMenuSub: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown-sub">{children}</div>
  ),
  DropdownMenuSubTrigger: ({ children }: { children: React.ReactNode }) => (
    <button data-testid="dropdown-sub-trigger">{children}</button>
  ),
  DropdownMenuSubContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown-sub-content">{children}</div>
  ),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    variant,
    className,
    disabled,
    onClick,
  }: {
    children: React.ReactNode;
    variant?: string;
    className?: string;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button
      data-testid="button"
      data-variant={variant}
      className={className}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant }: { children: React.ReactNode; variant?: string }) => (
    <span data-testid="badge" data-variant={variant}>
      {children}
    </span>
  ),
}));

describe('ReadingActions', () => {
  const mockOnViewDetails = jest.fn();
  const mockOnDelete = jest.fn();
  const mockOnStatusUpdate = jest.fn();

  const mockReading: AdminReading = {
    readingId: 'reading-123',
    userId: 'user-456',
    userEmail: 'test@example.com',
    type: 'Soul Blueprint',
    status: 'Ready',
    createdAt: '2024-01-15T10:30:00Z',
    updatedAt: '2024-01-15T10:35:00Z',
  };

  const defaultProps = {
    reading: mockReading,
    onViewDetails: mockOnViewDetails,
    onDelete: mockOnDelete,
    onStatusUpdate: mockOnStatusUpdate,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders dropdown menu trigger button', () => {
    render(<ReadingActions {...defaultProps} />);

    const trigger = screen.getByTestId('button');
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute('data-variant', 'ghost');
  });

  test('renders all menu items', () => {
    render(<ReadingActions {...defaultProps} />);

    expect(screen.getByText('Actions')).toBeInTheDocument();
    expect(screen.getByText('View Details')).toBeInTheDocument();
    expect(screen.getByText('Change Status')).toBeInTheDocument();
    expect(screen.getByText('Delete Reading')).toBeInTheDocument();
  });

  test('calls onViewDetails when View Details is clicked', async () => {
    const user = userEvent.setup();
    render(<ReadingActions {...defaultProps} />);

    const viewDetailsButton = screen.getByText('View Details').closest('button');
    await user.click(viewDetailsButton!);

    expect(mockOnViewDetails).toHaveBeenCalledWith('user-456', 'reading-123');
  });

  test('calls onDelete when Delete Reading is clicked', async () => {
    const user = userEvent.setup();
    render(<ReadingActions {...defaultProps} />);

    const deleteButton = screen.getByText('Delete Reading').closest('button');
    await user.click(deleteButton!);

    expect(mockOnDelete).toHaveBeenCalledWith('user-456', 'reading-123', 'test@example.com');
  });

  test('displays current status badge', () => {
    render(<ReadingActions {...defaultProps} />);

    const badge = screen.getByTestId('badge');
    expect(badge).toHaveTextContent('Ready');
    expect(badge).toHaveAttribute('data-variant', 'default');
  });

  test('renders all status options in submenu', () => {
    render(<ReadingActions {...defaultProps} />);

    const statuses = ['Processing', 'Ready', 'Failed', 'In Review'];
    statuses.forEach((status) => {
      const elements = screen.getAllByText(status);
      expect(elements.length).toBeGreaterThan(0);
    });
  });

  test('marks current status as disabled with indicator', () => {
    render(<ReadingActions {...defaultProps} />);

    const readyItems = screen.getAllByText('Ready');
    // Find the one that's in the submenu (not the badge)
    const submenuItem = readyItems.find((item) => item.closest('[data-testid="dropdown-item"]'));

    expect(submenuItem?.closest('button')).toBeDisabled();
    expect(screen.getByText('(current)')).toBeInTheDocument();
  });

  test('calls onStatusUpdate when status is changed', async () => {
    const user = userEvent.setup();
    mockOnStatusUpdate.mockResolvedValue(undefined);

    render(<ReadingActions {...defaultProps} />);

    const processingButton = screen
      .getAllByText('Processing')
      .find((el) => el.closest('[data-testid="dropdown-item"]'))
      ?.closest('button');

    await user.click(processingButton!);

    expect(mockOnStatusUpdate).toHaveBeenCalledWith('user-456', 'reading-123', 'Processing');
  });

  test('shows success toast when status update succeeds', async () => {
    const user = userEvent.setup();
    mockOnStatusUpdate.mockResolvedValue(undefined);

    render(<ReadingActions {...defaultProps} />);

    const failedButton = screen
      .getAllByText('Failed')
      .find((el) => el.closest('[data-testid="dropdown-item"]'))
      ?.closest('button');

    await user.click(failedButton!);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Status updated',
        description: 'Reading status changed to Failed',
      });
    });
  });

  test('shows error toast when status update fails', async () => {
    const user = userEvent.setup();
    const error = new Error('Update failed');
    mockOnStatusUpdate.mockRejectedValue(error);

    render(<ReadingActions {...defaultProps} />);

    const inReviewButton = screen
      .getAllByText('In Review')
      .find((el) => el.closest('[data-testid="dropdown-item"]'))
      ?.closest('button');

    await user.click(inReviewButton!);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Error',
        description: 'Update failed',
        variant: 'destructive',
      });
    });
  });

  test('shows generic error message for non-Error objects', async () => {
    const user = userEvent.setup();
    mockOnStatusUpdate.mockRejectedValue('Something went wrong');

    render(<ReadingActions {...defaultProps} />);

    const processingButton = screen
      .getAllByText('Processing')
      .find((el) => el.closest('[data-testid="dropdown-item"]'))
      ?.closest('button');

    await user.click(processingButton!);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Error',
        description: 'Failed to update status',
        variant: 'destructive',
      });
    });
  });

  test('disables trigger button during status update', async () => {
    const user = userEvent.setup();
    mockOnStatusUpdate.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 1000)),
    );

    render(<ReadingActions {...defaultProps} />);

    const triggerButton = screen.getByTestId('button');
    expect(triggerButton).not.toBeDisabled();

    const processingButton = screen
      .getAllByText('Processing')
      .find((el) => el.closest('[data-testid="dropdown-item"]'))
      ?.closest('button');

    await user.click(processingButton!);

    expect(triggerButton).toBeDisabled();
  });

  test('re-enables trigger button after status update completes', async () => {
    const user = userEvent.setup();
    mockOnStatusUpdate.mockResolvedValue(undefined);

    render(<ReadingActions {...defaultProps} />);

    const triggerButton = screen.getByTestId('button');
    const processingButton = screen
      .getAllByText('Processing')
      .find((el) => el.closest('[data-testid="dropdown-item"]'))
      ?.closest('button');

    await user.click(processingButton!);

    await waitFor(() => {
      expect(triggerButton).not.toBeDisabled();
    });
  });

  test('does not call onStatusUpdate when clicking current status', async () => {
    const user = userEvent.setup();
    render(<ReadingActions {...defaultProps} />);

    const readyButton = screen
      .getAllByText('Ready')
      .find((el) => el.closest('[data-testid="dropdown-item"]'))
      ?.closest('button');

    // The button should be disabled, but let's try to click anyway
    await user.click(readyButton!);

    expect(mockOnStatusUpdate).not.toHaveBeenCalled();
  });

  test('applies correct badge variants for different statuses', () => {
    const testCases = [
      { status: 'Ready' as const, variant: 'default' },
      { status: 'Processing' as const, variant: 'secondary' },
      { status: 'Failed' as const, variant: 'destructive' },
      { status: 'In Review' as const, variant: 'outline' },
    ];

    testCases.forEach(({ status, variant }) => {
      const { rerender } = render(
        <ReadingActions {...defaultProps} reading={{ ...mockReading, status }} />,
      );

      const badge = screen.getByTestId('badge');
      expect(badge).toHaveAttribute('data-variant', variant);

      rerender(<div />); // Clear for next iteration
    });
  });

  test('renders icons for certain statuses', () => {
    // Test Ready status (CheckCircle icon)
    const { rerender } = render(
      <ReadingActions {...defaultProps} reading={{ ...mockReading, status: 'Ready' }} />,
    );

    // Look for CheckCircle icon representation in submenu items
    let statusItems = screen.getAllByText('Ready');
    expect(statusItems.length).toBeGreaterThan(0);

    // Test Failed status (XCircle icon)
    rerender(<ReadingActions {...defaultProps} reading={{ ...mockReading, status: 'Failed' }} />);

    statusItems = screen.getAllByText('Failed');
    expect(statusItems.length).toBeGreaterThan(0);
  });

  test('applies destructive class to delete menu item', () => {
    render(<ReadingActions {...defaultProps} />);

    const deleteButton = screen.getByText('Delete Reading').closest('button');
    expect(deleteButton?.className).toContain('destructive');
  });

  test('handles undefined userEmail in onDelete call', async () => {
    const user = userEvent.setup();
    const readingWithoutEmail = { ...mockReading, userEmail: undefined };

    render(<ReadingActions {...defaultProps} reading={readingWithoutEmail} />);

    const deleteButton = screen.getByText('Delete Reading').closest('button');
    await user.click(deleteButton!);

    expect(mockOnDelete).toHaveBeenCalledWith('user-456', 'reading-123', undefined);
  });

  test('aligns dropdown content to end', () => {
    render(<ReadingActions {...defaultProps} />);

    const content = screen.getByTestId('dropdown-content');
    expect(content).toHaveAttribute('data-align', 'end');
  });

  test('renders screen reader text for trigger button', () => {
    render(<ReadingActions {...defaultProps} />);

    expect(screen.getByText('Open menu')).toBeInTheDocument();
  });

  test('handles rapid status changes', async () => {
    const user = userEvent.setup();
    mockOnStatusUpdate.mockResolvedValue(undefined);

    render(<ReadingActions {...defaultProps} />);

    // Try to change status multiple times quickly
    const processingButton = screen
      .getAllByText('Processing')
      .find((el) => el.closest('[data-testid="dropdown-item"]'))
      ?.closest('button');

    await user.click(processingButton!);
    await user.click(processingButton!);
    await user.click(processingButton!);

    // Should still only be called once per click
    expect(mockOnStatusUpdate).toHaveBeenCalledTimes(3);
  });
});
