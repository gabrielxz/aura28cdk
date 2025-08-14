import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeleteReadingDialog } from '@/components/admin/delete-reading-dialog';

// Mock the toast hook
const mockToast = jest.fn();
jest.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

// Mock the UI components
jest.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="alert-dialog">{children}</div> : null,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="alert-dialog-content">{children}</div>
  ),
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="alert-dialog-header">{children}</div>
  ),
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2 data-testid="alert-dialog-title">{children}</h2>
  ),
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="alert-dialog-description">{children}</div>
  ),
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="alert-dialog-footer">{children}</div>
  ),
  AlertDialogCancel: ({
    children,
    disabled,
    onClick,
  }: {
    children: React.ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button data-testid="cancel-button" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
  AlertDialogAction: ({
    children,
    disabled,
    onClick,
    className,
  }: {
    children: React.ReactNode;
    disabled?: boolean;
    onClick?: () => void;
    className?: string;
  }) => (
    <button data-testid="delete-button" disabled={disabled} onClick={onClick} className={className}>
      {children}
    </button>
  ),
}));

describe('DeleteReadingDialog', () => {
  const mockOnOpenChange = jest.fn();
  const mockOnConfirm = jest.fn();

  const defaultProps = {
    readingId: 'reading-123-abc-def-ghi',
    userEmail: 'test@example.com',
    open: true,
    onOpenChange: mockOnOpenChange,
    onConfirm: mockOnConfirm,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders closed dialog when open is false', () => {
    render(<DeleteReadingDialog {...defaultProps} open={false} />);

    expect(screen.queryByTestId('alert-dialog')).not.toBeInTheDocument();
  });

  test('renders open dialog with title and warning', () => {
    render(<DeleteReadingDialog {...defaultProps} />);

    expect(screen.getByTestId('alert-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('alert-dialog-title')).toHaveTextContent('Delete Reading');
    expect(screen.getByText('Are you sure you want to delete this reading?')).toBeInTheDocument();
    expect(screen.getByText('This action cannot be undone.')).toBeInTheDocument();
  });

  test('displays truncated reading ID', () => {
    render(<DeleteReadingDialog {...defaultProps} />);

    expect(screen.getByText('Reading ID:')).toBeInTheDocument();
    expect(screen.getByText('reading-...')).toBeInTheDocument();
  });

  test('displays user email when provided', () => {
    render(<DeleteReadingDialog {...defaultProps} />);

    expect(screen.getByText('User:')).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
  });

  test('does not display user section when email is not provided', () => {
    render(<DeleteReadingDialog {...defaultProps} userEmail={undefined} />);

    expect(screen.queryByText('User:')).not.toBeInTheDocument();
  });

  test('calls onConfirm when delete button is clicked', async () => {
    const user = userEvent.setup();
    mockOnConfirm.mockResolvedValue(undefined);

    render(<DeleteReadingDialog {...defaultProps} />);

    const deleteButton = screen.getByTestId('delete-button');
    await user.click(deleteButton);

    expect(mockOnConfirm).toHaveBeenCalledWith('reading-123-abc-def-ghi');
  });

  test('shows success toast when deletion succeeds', async () => {
    const user = userEvent.setup();
    mockOnConfirm.mockResolvedValue(undefined);

    render(<DeleteReadingDialog {...defaultProps} />);

    const deleteButton = screen.getByTestId('delete-button');
    await user.click(deleteButton);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Reading deleted',
        description: 'The reading has been permanently deleted.',
      });
    });
  });

  test('closes dialog after successful deletion', async () => {
    const user = userEvent.setup();
    mockOnConfirm.mockResolvedValue(undefined);

    render(<DeleteReadingDialog {...defaultProps} />);

    const deleteButton = screen.getByTestId('delete-button');
    await user.click(deleteButton);

    await waitFor(() => {
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });
  });

  test('shows error toast when deletion fails', async () => {
    const user = userEvent.setup();
    const error = new Error('Network error');
    mockOnConfirm.mockRejectedValue(error);

    render(<DeleteReadingDialog {...defaultProps} />);

    const deleteButton = screen.getByTestId('delete-button');
    await user.click(deleteButton);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Error',
        description: 'Network error',
        variant: 'destructive',
      });
    });
  });

  test('shows generic error message for non-Error objects', async () => {
    const user = userEvent.setup();
    mockOnConfirm.mockRejectedValue('Something went wrong');

    render(<DeleteReadingDialog {...defaultProps} />);

    const deleteButton = screen.getByTestId('delete-button');
    await user.click(deleteButton);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Error',
        description: 'Failed to delete reading',
        variant: 'destructive',
      });
    });
  });

  test('disables buttons during deletion', async () => {
    const user = userEvent.setup();
    mockOnConfirm.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 1000)));

    render(<DeleteReadingDialog {...defaultProps} />);

    const deleteButton = screen.getByTestId('delete-button');
    const cancelButton = screen.getByTestId('cancel-button');

    expect(deleteButton).not.toBeDisabled();
    expect(cancelButton).not.toBeDisabled();

    await user.click(deleteButton);

    expect(deleteButton).toBeDisabled();
    expect(cancelButton).toBeDisabled();
  });

  test('shows deleting state in button', async () => {
    const user = userEvent.setup();
    mockOnConfirm.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 1000)));

    render(<DeleteReadingDialog {...defaultProps} />);

    const deleteButton = screen.getByTestId('delete-button');

    expect(deleteButton).toHaveTextContent('Delete Reading');
    expect(screen.queryByText('Deleting...')).not.toBeInTheDocument();

    await user.click(deleteButton);

    expect(deleteButton).not.toHaveTextContent('Delete Reading');
    expect(screen.getByText('Deleting...')).toBeInTheDocument();
  });

  test('re-enables buttons after error', async () => {
    const user = userEvent.setup();
    mockOnConfirm.mockRejectedValue(new Error('Failed'));

    render(<DeleteReadingDialog {...defaultProps} />);

    const deleteButton = screen.getByTestId('delete-button');
    const cancelButton = screen.getByTestId('cancel-button');

    await user.click(deleteButton);

    await waitFor(() => {
      expect(deleteButton).not.toBeDisabled();
      expect(cancelButton).not.toBeDisabled();
    });
  });

  test('does not close dialog on error', async () => {
    const user = userEvent.setup();
    mockOnConfirm.mockRejectedValue(new Error('Failed'));

    render(<DeleteReadingDialog {...defaultProps} />);

    const deleteButton = screen.getByTestId('delete-button');
    await user.click(deleteButton);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalled();
    });

    expect(mockOnOpenChange).not.toHaveBeenCalledWith(false);
  });

  test('renders destructive styling on delete button', () => {
    render(<DeleteReadingDialog {...defaultProps} />);

    const deleteButton = screen.getByTestId('delete-button');
    expect(deleteButton.className).toContain('destructive');
  });

  test('displays warning icon', () => {
    render(<DeleteReadingDialog {...defaultProps} />);

    // Check for the AlertTriangle icon by looking for its container
    const header = screen.getByTestId('alert-dialog-header');
    expect(header.textContent).toContain('Delete Reading');
  });

  test('renders information in muted background box', () => {
    render(<DeleteReadingDialog {...defaultProps} />);

    const description = screen.getByTestId('alert-dialog-description');
    const infoBox = description.querySelector('.bg-muted');
    expect(infoBox).toBeTruthy();
  });

  test('handles very long reading IDs', () => {
    const longId = 'reading-' + 'a'.repeat(100);
    render(<DeleteReadingDialog {...defaultProps} readingId={longId} />);

    // Should still show truncated version
    expect(screen.getByText('reading-...')).toBeInTheDocument();
  });

  test('handles very long email addresses', () => {
    const longEmail = 'very.long.email.address@example-domain-with-long-name.com';
    render(<DeleteReadingDialog {...defaultProps} userEmail={longEmail} />);

    expect(screen.getByText(longEmail)).toBeInTheDocument();
  });
});
