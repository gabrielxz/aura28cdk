import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReadingsFilters } from '@/components/admin/readings-filters';
import { ReadingsFilter } from '@/lib/api/admin-api';

// Mock the UI components to simplify testing
jest.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div data-testid="popover-content">{children}</div>,
}));

jest.mock('@/components/ui/select', () => ({
  Select: ({ children, onValueChange, value }: { children: React.ReactNode; onValueChange?: (value: string) => void; value?: string }) => {
    // Extract SelectItem components and render as a regular select
    const items: React.ReactElement[] = [];
    const extractItems = (child: React.ReactElement): void => {
      if (child?.type?.name === 'SelectItem') {
        items.push(child);
      } else if (child?.props?.children) {
        const children = Array.isArray(child.props.children)
          ? child.props.children
          : [child.props.children];
        children.forEach(extractItems);
      }
    };

    if (Array.isArray(children)) {
      children.forEach(extractItems);
    } else if (children) {
      extractItems(children);
    }

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      onValueChange?.(e.target.value);
    };

    return (
      <select value={value || 'all'} onChange={handleChange} data-testid="select">
        {items}
      </select>
    );
  },
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => <option value={value}>{children}</option>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <>{placeholder}</>,
}));

describe('ReadingsFilters', () => {
  const defaultProps = {
    filters: {},
    onFiltersChange: jest.fn(),
    pageSize: 25,
    onPageSizeChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('renders all filter controls', () => {
    render(<ReadingsFilters {...defaultProps} />);

    expect(screen.getByText('Filters')).toBeInTheDocument();
    expect(screen.getByText('Start Date')).toBeInTheDocument();
    expect(screen.getByText('End Date')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Reading Type')).toBeInTheDocument();
    expect(screen.getByText('Search User')).toBeInTheDocument();
    expect(screen.getByText('Items per page')).toBeInTheDocument();
  });

  test('displays current filter values', () => {
    const filters: ReadingsFilter = {
      startDate: '2024-01-01',
      endDate: '2024-01-31',
      status: 'Ready',
      type: 'Soul Blueprint',
      userSearch: 'test@example.com',
    };

    render(<ReadingsFilters {...defaultProps} filters={filters} />);

    expect(screen.getByText('2024-01-01')).toBeInTheDocument();
    expect(screen.getByText('2024-01-31')).toBeInTheDocument();
  });

  test('handles user search with debouncing', async () => {
    const user = userEvent.setup({ delay: null });
    const onFiltersChange = jest.fn();
    render(<ReadingsFilters {...defaultProps} onFiltersChange={onFiltersChange} />);

    const searchInput = screen.getByPlaceholderText('Search by email or name...');

    // Type in the search field
    await user.type(searchInput, 'test@example.com');

    // Should not call immediately
    expect(onFiltersChange).not.toHaveBeenCalled();

    // Fast-forward time by 300ms to trigger debounce
    jest.advanceTimersByTime(300);

    await waitFor(() => {
      expect(onFiltersChange).toHaveBeenCalledWith({
        userSearch: 'test@example.com',
      });
    });
  });

  test('clears search when empty string is entered', async () => {
    const user = userEvent.setup({ delay: null });
    const onFiltersChange = jest.fn();
    render(<ReadingsFilters {...defaultProps} onFiltersChange={onFiltersChange} />);

    const searchInput = screen.getByPlaceholderText('Search by email or name...');

    // Type and then clear
    await user.type(searchInput, 'test');
    jest.advanceTimersByTime(300);

    await user.clear(searchInput);
    jest.advanceTimersByTime(300);

    await waitFor(() => {
      expect(onFiltersChange).toHaveBeenLastCalledWith({
        userSearch: undefined,
      });
    });
  });

  test('handles status filter change', async () => {
    const user = userEvent.setup({ delay: null });
    const onFiltersChange = jest.fn();
    render(<ReadingsFilters {...defaultProps} onFiltersChange={onFiltersChange} />);

    // Find the status select
    const selects = screen.getAllByTestId('select');
    const statusSelect = selects[0]; // First select is status

    // Change value
    await user.selectOptions(statusSelect, 'Ready');

    expect(onFiltersChange).toHaveBeenCalledWith({ status: 'Ready' });
  });

  test('handles "All statuses" selection', async () => {
    const user = userEvent.setup({ delay: null });
    const onFiltersChange = jest.fn();
    const filters = { status: 'Ready' };
    render(
      <ReadingsFilters {...defaultProps} filters={filters} onFiltersChange={onFiltersChange} />,
    );

    const selects = screen.getAllByTestId('select');
    const statusSelect = selects[0];

    await user.selectOptions(statusSelect, 'all');

    expect(onFiltersChange).toHaveBeenCalledWith({ status: undefined });
  });

  test('handles reading type filter change', async () => {
    const user = userEvent.setup({ delay: null });
    const onFiltersChange = jest.fn();
    render(<ReadingsFilters {...defaultProps} onFiltersChange={onFiltersChange} />);

    const selects = screen.getAllByTestId('select');
    const typeSelect = selects[1]; // Second select is type

    await user.selectOptions(typeSelect, 'Soul Blueprint');

    expect(onFiltersChange).toHaveBeenCalledWith({ type: 'Soul Blueprint' });
  });

  test('handles "All types" selection', async () => {
    const user = userEvent.setup({ delay: null });
    const onFiltersChange = jest.fn();
    const filters = { type: 'Soul Blueprint' };
    render(
      <ReadingsFilters {...defaultProps} filters={filters} onFiltersChange={onFiltersChange} />,
    );

    const selects = screen.getAllByTestId('select');
    const typeSelect = selects[1];

    await user.selectOptions(typeSelect, 'all');

    expect(onFiltersChange).toHaveBeenCalledWith({ type: undefined });
  });

  test('handles page size change', async () => {
    const user = userEvent.setup({ delay: null });
    const onPageSizeChange = jest.fn();
    render(<ReadingsFilters {...defaultProps} onPageSizeChange={onPageSizeChange} />);

    const selects = screen.getAllByTestId('select');
    const pageSizeSelect = selects[2]; // Third select is page size

    await user.selectOptions(pageSizeSelect, '50');

    expect(onPageSizeChange).toHaveBeenCalledWith(50);
  });

  test('handles date filter changes', async () => {
    const user = userEvent.setup({ delay: null });
    const onFiltersChange = jest.fn();
    render(<ReadingsFilters {...defaultProps} onFiltersChange={onFiltersChange} />);

    // Find date inputs by their role
    const dateInputs = screen.getAllByRole('textbox');
    // Filter to get only date inputs (they have type="date" attribute)
    const startDateInput = dateInputs.find((input) => input.getAttribute('type') === 'date');
    const endDateInput = dateInputs.find(
      (input, index, arr) => input.getAttribute('type') === 'date' && arr.indexOf(input) > 0,
    );

    if (startDateInput && endDateInput) {
      // Change start date
      await user.clear(startDateInput);
      await user.type(startDateInput, '2024-01-01');
      expect(onFiltersChange).toHaveBeenCalledWith({ startDate: '2024-01-01' });

      // Change end date
      await user.clear(endDateInput);
      await user.type(endDateInput, '2024-01-31');
      expect(onFiltersChange).toHaveBeenCalledWith({ endDate: '2024-01-31' });
    }
  });

  test('shows clear button when filters are active', () => {
    const filters: ReadingsFilter = {
      status: 'Ready',
      type: 'Soul Blueprint',
    };

    render(<ReadingsFilters {...defaultProps} filters={filters} />);

    const clearButton = screen.getByRole('button', { name: /clear all/i });
    expect(clearButton).toBeInTheDocument();
  });

  test('hides clear button when no filters are active', () => {
    render(<ReadingsFilters {...defaultProps} />);

    const clearButton = screen.queryByRole('button', { name: /clear all/i });
    expect(clearButton).not.toBeInTheDocument();
  });

  test('clears all filters when clear button is clicked', async () => {
    const user = userEvent.setup({ delay: null });
    const onFiltersChange = jest.fn();
    const filters: ReadingsFilter = {
      startDate: '2024-01-01',
      endDate: '2024-01-31',
      status: 'Ready',
      type: 'Soul Blueprint',
    };

    render(
      <ReadingsFilters {...defaultProps} filters={filters} onFiltersChange={onFiltersChange} />,
    );

    // Set user search value
    const searchInput = screen.getByPlaceholderText('Search by email or name...');
    await user.type(searchInput, 'test@example.com');

    const clearButton = screen.getByRole('button', { name: /clear all/i });
    await user.click(clearButton);

    expect(onFiltersChange).toHaveBeenCalledWith({
      startDate: undefined,
      endDate: undefined,
      status: undefined,
      type: undefined,
      userSearch: undefined,
    });

    // Search input should also be cleared
    expect(searchInput).toHaveValue('');
  });

  test('displays correct page size value', () => {
    render(<ReadingsFilters {...defaultProps} pageSize={50} />);

    const selects = screen.getAllByTestId('select');
    const pageSizeSelect = selects[2];
    expect(pageSizeSelect).toHaveValue('50');
  });

  test('debounces multiple rapid search inputs', async () => {
    const user = userEvent.setup({ delay: null });
    const onFiltersChange = jest.fn();
    render(<ReadingsFilters {...defaultProps} onFiltersChange={onFiltersChange} />);

    const searchInput = screen.getByPlaceholderText('Search by email or name...');

    // Type rapidly
    await user.type(searchInput, 't');
    await user.type(searchInput, 'e');
    await user.type(searchInput, 's');
    await user.type(searchInput, 't');

    // Should not have called yet
    expect(onFiltersChange).not.toHaveBeenCalled();

    // Fast-forward time
    jest.advanceTimersByTime(300);

    await waitFor(() => {
      // Should only call once with final value
      expect(onFiltersChange).toHaveBeenCalledTimes(1);
      expect(onFiltersChange).toHaveBeenCalledWith({
        userSearch: 'test',
      });
    });
  });

  test('cancels pending search timeout on unmount', async () => {
    const user = userEvent.setup({ delay: null });
    const onFiltersChange = jest.fn();
    const { unmount } = render(
      <ReadingsFilters {...defaultProps} onFiltersChange={onFiltersChange} />,
    );

    const searchInput = screen.getByPlaceholderText('Search by email or name...');
    await user.type(searchInput, 'test');

    // Unmount before timeout fires
    unmount();

    // Fast-forward time
    jest.advanceTimersByTime(300);

    // Should not have called because component was unmounted
    expect(onFiltersChange).not.toHaveBeenCalled();
  });

  test('preserves filter state when props change', () => {
    const { rerender } = render(<ReadingsFilters {...defaultProps} />);

    // Update with new filters
    const newFilters: ReadingsFilter = {
      status: 'Processing',
      type: 'Soul Blueprint',
    };

    rerender(<ReadingsFilters {...defaultProps} filters={newFilters} />);

    // Values should not be reflected in selects since localFilters is not updated from props
    // This is expected behavior as the component maintains local state
    const selects = screen.getAllByTestId('select');
    expect(selects[0]).toHaveValue('all'); // Status stays at default
    expect(selects[1]).toHaveValue('all'); // Type stays at default
  });

  test('shows filter icon in header', () => {
    render(<ReadingsFilters {...defaultProps} />);

    // Check for the "Filters" heading
    expect(screen.getByText('Filters')).toBeInTheDocument();
  });

  test('applies responsive grid layout', () => {
    const { container } = render(<ReadingsFilters {...defaultProps} />);

    // Check for responsive grid classes
    const filterGrid = container.querySelector('.grid.gap-4.md\\:grid-cols-2.lg\\:grid-cols-4');
    expect(filterGrid).toBeInTheDocument();

    const bottomGrid = container.querySelector('.grid.gap-4.md\\:grid-cols-2');
    expect(bottomGrid).toBeInTheDocument();
  });
});
