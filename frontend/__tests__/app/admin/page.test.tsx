import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminDashboard from '@/app/admin/page';
import { useAuth } from '@/lib/auth/use-auth';
import { useAdminReadings } from '@/hooks/use-admin-readings';

// Mock dependencies
jest.mock('@/lib/auth/use-auth');
jest.mock('@/hooks/use-admin-readings');
jest.mock('@/components/admin/readings-table', () => ({
  ReadingsTable: jest.fn(({ readings, loading }) => (
    <div data-testid="readings-table">
      {loading ? (
        <div>Loading table...</div>
      ) : (
        <div>
          {readings.map((r: { readingId: string }) => (
            <div key={r.readingId}>{r.readingId}</div>
          ))}
        </div>
      )}
    </div>
  )),
}));
jest.mock('@/components/admin/readings-filters', () => ({
  ReadingsFilters: jest.fn(({ onFiltersChange, onPageSizeChange }) => (
    <div data-testid="readings-filters">
      <button onClick={() => onFiltersChange({ status: 'Ready' })}>Filter by Ready</button>
      <button onClick={() => onPageSizeChange(50)}>Set page size 50</button>
    </div>
  )),
}));

describe('AdminDashboard', () => {
  const mockAuthService = {
    isAdmin: jest.fn(() => true),
    getIdToken: jest.fn(() => Promise.resolve('test-token')),
  };

  const mockReadingsData = {
    readings: [
      {
        readingId: 'reading-1',
        userId: 'user-1',
        userEmail: 'user1@example.com',
        type: 'Soul Blueprint',
        status: 'Ready',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:01:00Z',
      },
      {
        readingId: 'reading-2',
        userId: 'user-2',
        userEmail: 'user2@example.com',
        type: 'Soul Blueprint',
        status: 'Processing',
        createdAt: '2024-01-02T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
      },
    ],
    loading: false,
    error: null,
    totalCount: 2,
    currentPage: 1,
    totalPages: 1,
    sortField: 'createdAt',
    sortOrder: 'desc' as const,
    filters: {},
    handleSort: jest.fn(),
    updateFilters: jest.fn(),
    goToPage: jest.fn(),
    refresh: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({
      authService: mockAuthService,
    });
    (useAdminReadings as jest.Mock).mockReturnValue(mockReadingsData);
  });

  test('renders admin dashboard with title and description', () => {
    render(<AdminDashboard />);

    expect(screen.getByText('Admin Dashboard')).toBeInTheDocument();
    expect(
      screen.getByText('Manage and monitor all user readings across the platform'),
    ).toBeInTheDocument();
  });

  test('displays readings table with data', () => {
    render(<AdminDashboard />);

    const table = screen.getByTestId('readings-table');
    expect(table).toBeInTheDocument();
    expect(within(table).getByText('reading-1')).toBeInTheDocument();
    expect(within(table).getByText('reading-2')).toBeInTheDocument();
  });

  test('shows loading state when data is loading', () => {
    (useAdminReadings as jest.Mock).mockReturnValue({
      ...mockReadingsData,
      loading: true,
    });

    render(<AdminDashboard />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(
      within(screen.getByTestId('readings-table')).getByText('Loading table...'),
    ).toBeInTheDocument();
  });

  test('displays error message when error occurs', () => {
    const errorMessage = 'Failed to fetch readings';
    (useAdminReadings as jest.Mock).mockReturnValue({
      ...mockReadingsData,
      error: errorMessage,
    });

    render(<AdminDashboard />);

    expect(screen.getByText(errorMessage)).toBeInTheDocument();
  });

  test('shows correct stats bar information', () => {
    (useAdminReadings as jest.Mock).mockReturnValue({
      ...mockReadingsData,
      totalCount: 50,
      currentPage: 2,
      totalPages: 2,
    });

    render(<AdminDashboard />);

    // Page size is 25 by default, so page 2 shows items 26-50
    expect(screen.getByText(/Showing 26 to 50 of 50 readings/)).toBeInTheDocument();
  });

  test('handles refresh button click', async () => {
    const user = userEvent.setup();
    render(<AdminDashboard />);

    const refreshButton = screen.getByRole('button', { name: /refresh/i });
    await user.click(refreshButton);

    expect(mockReadingsData.refresh).toHaveBeenCalledTimes(1);
  });

  test('handles filter changes', async () => {
    const user = userEvent.setup();
    render(<AdminDashboard />);

    const filterButton = screen.getByText('Filter by Ready');
    await user.click(filterButton);

    expect(mockReadingsData.updateFilters).toHaveBeenCalledWith({ status: 'Ready' });
  });

  test('handles page size change', async () => {
    const user = userEvent.setup();
    render(<AdminDashboard />);

    const pageSizeButton = screen.getByText('Set page size 50');
    await user.click(pageSizeButton);

    await waitFor(() => {
      expect(mockReadingsData.goToPage).toHaveBeenCalledWith(1);
    });
  });

  test('shows pagination controls when there are multiple pages', () => {
    (useAdminReadings as jest.Mock).mockReturnValue({
      ...mockReadingsData,
      totalPages: 3,
      currentPage: 2,
    });

    render(<AdminDashboard />);

    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /previous/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
  });

  test('disables previous button on first page', () => {
    (useAdminReadings as jest.Mock).mockReturnValue({
      ...mockReadingsData,
      totalPages: 3,
      currentPage: 1,
    });

    render(<AdminDashboard />);

    const previousButton = screen.getByRole('button', { name: /previous/i });
    expect(previousButton).toBeDisabled();
  });

  test('disables next button on last page', () => {
    (useAdminReadings as jest.Mock).mockReturnValue({
      ...mockReadingsData,
      totalPages: 3,
      currentPage: 3,
    });

    render(<AdminDashboard />);

    const nextButton = screen.getByRole('button', { name: /next/i });
    expect(nextButton).toBeDisabled();
  });

  test('handles pagination navigation', async () => {
    const user = userEvent.setup();
    (useAdminReadings as jest.Mock).mockReturnValue({
      ...mockReadingsData,
      totalPages: 3,
      currentPage: 2,
    });

    render(<AdminDashboard />);

    const previousButton = screen.getByRole('button', { name: /previous/i });
    const nextButton = screen.getByRole('button', { name: /next/i });

    await user.click(previousButton);
    expect(mockReadingsData.goToPage).toHaveBeenCalledWith(1);

    await user.click(nextButton);
    expect(mockReadingsData.goToPage).toHaveBeenCalledWith(3);
  });

  test('hides pagination when there is only one page', () => {
    (useAdminReadings as jest.Mock).mockReturnValue({
      ...mockReadingsData,
      totalPages: 1,
      currentPage: 1,
    });

    render(<AdminDashboard />);

    expect(screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /previous/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /next/i })).not.toBeInTheDocument();
  });

  test('disables buttons when loading', () => {
    (useAdminReadings as jest.Mock).mockReturnValue({
      ...mockReadingsData,
      loading: true,
      totalPages: 3,
      currentPage: 2,
    });

    render(<AdminDashboard />);

    const refreshButton = screen.getByRole('button', { name: /refresh/i });
    const previousButton = screen.getByRole('button', { name: /previous/i });
    const nextButton = screen.getByRole('button', { name: /next/i });

    expect(refreshButton).toBeDisabled();
    expect(previousButton).toBeDisabled();
    expect(nextButton).toBeDisabled();
  });

  test('shows empty state when no readings exist', () => {
    (useAdminReadings as jest.Mock).mockReturnValue({
      ...mockReadingsData,
      readings: [],
      totalCount: 0,
    });

    render(<AdminDashboard />);

    expect(screen.getByText(/Showing 0 to 0 of 0 readings/)).toBeInTheDocument();
  });
});
