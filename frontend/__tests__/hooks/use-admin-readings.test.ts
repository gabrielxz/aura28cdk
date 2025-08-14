import { renderHook, act, waitFor } from '@testing-library/react';
import { useAdminReadings } from '@/hooks/use-admin-readings';
import { AuthService } from '@/lib/auth/auth-service';
import { AdminApi } from '@/lib/api/admin-api';

// Mock the AdminApi module
jest.mock('@/lib/api/admin-api');

describe('useAdminReadings', () => {
  let mockAuthService: AuthService;
  let mockGetAllReadings: jest.Mock;

  const mockReadingsResponse = {
    readings: [
      {
        readingId: 'reading-1',
        userId: 'user-1',
        userEmail: 'user1@example.com',
        type: 'Soul Blueprint',
        status: 'Ready' as const,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:01:00Z',
      },
      {
        readingId: 'reading-2',
        userId: 'user-2',
        userEmail: 'user2@example.com',
        type: 'Natal Chart',
        status: 'Processing' as const,
        createdAt: '2024-01-02T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
      },
      {
        readingId: 'reading-3',
        userId: 'user-3',
        userEmail: 'admin@example.com',
        type: 'Soul Blueprint',
        status: 'Failed' as const,
        createdAt: '2024-01-03T00:00:00Z',
        updatedAt: '2024-01-03T00:00:00Z',
      },
    ],
    count: 3,
    lastEvaluatedKey: undefined,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockAuthService = {
      getIdToken: jest.fn().mockResolvedValue('test-token'),
    } as unknown as AuthService;

    mockGetAllReadings = jest.fn().mockResolvedValue(mockReadingsResponse);
    (AdminApi as jest.Mock).mockImplementation(() => ({
      getAllReadings: mockGetAllReadings,
    }));
  });

  test('initializes with default values', async () => {
    const { result } = renderHook(() => useAdminReadings(mockAuthService));

    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.readings).toEqual([]);
    expect(result.current.currentPage).toBe(1);
    expect(result.current.sortField).toBe('createdAt');
    expect(result.current.sortOrder).toBe('desc');

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  test('fetches readings on mount', async () => {
    const { result } = renderHook(() => useAdminReadings(mockAuthService));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockGetAllReadings).toHaveBeenCalledWith({
      limit: 25,
      lastEvaluatedKey: undefined,
    });
    expect(result.current.readings).toHaveLength(3);
    expect(result.current.totalCount).toBe(3);
  });

  test('sorts readings by createdAt in descending order by default', async () => {
    const { result } = renderHook(() => useAdminReadings(mockAuthService));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Should be sorted by createdAt desc (newest first)
    expect(result.current.readings[0].readingId).toBe('reading-3');
    expect(result.current.readings[1].readingId).toBe('reading-2');
    expect(result.current.readings[2].readingId).toBe('reading-1');
  });

  test('handles sorting by different fields', async () => {
    const { result } = renderHook(() => useAdminReadings(mockAuthService));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Sort by userEmail ascending
    act(() => {
      result.current.handleSort('userEmail');
    });

    expect(result.current.sortField).toBe('userEmail');
    expect(result.current.sortOrder).toBe('asc');
    expect(result.current.readings[0].userEmail).toBe('admin@example.com');
    expect(result.current.readings[1].userEmail).toBe('user1@example.com');
    expect(result.current.readings[2].userEmail).toBe('user2@example.com');
  });

  test('toggles sort order when clicking same field', async () => {
    const { result } = renderHook(() => useAdminReadings(mockAuthService));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Initial state: createdAt desc
    expect(result.current.sortOrder).toBe('desc');

    // Click same field - should toggle to asc
    act(() => {
      result.current.handleSort('createdAt');
    });

    expect(result.current.sortField).toBe('createdAt');
    expect(result.current.sortOrder).toBe('asc');
    expect(result.current.readings[0].readingId).toBe('reading-1');
    expect(result.current.readings[2].readingId).toBe('reading-3');
  });

  test('handles filter updates', async () => {
    const { result } = renderHook(() => useAdminReadings(mockAuthService));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const newFilters = {
      startDate: '2024-01-01',
      endDate: '2024-01-31',
      status: 'Ready',
    };

    act(() => {
      result.current.updateFilters(newFilters);
    });

    await waitFor(() => {
      expect(mockGetAllReadings).toHaveBeenLastCalledWith({
        ...newFilters,
        limit: 25,
        lastEvaluatedKey: undefined,
      });
    });

    expect(result.current.filters).toEqual(newFilters);
    expect(result.current.currentPage).toBe(1); // Should reset to page 1
  });

  test('handles pagination', async () => {
    const paginatedResponse = {
      ...mockReadingsResponse,
      lastEvaluatedKey: 'next-page-key',
    };
    mockGetAllReadings.mockResolvedValue(paginatedResponse);

    const { result } = renderHook(() => useAdminReadings(mockAuthService, { pageSize: 2 }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.totalPages).toBe(2); // 3 items with pageSize 2

    // Go to page 2
    act(() => {
      result.current.goToPage(2);
    });

    await waitFor(() => {
      expect(mockGetAllReadings).toHaveBeenLastCalledWith({
        limit: 2,
        lastEvaluatedKey: 'next-page-key',
      });
    });

    expect(result.current.currentPage).toBe(2);
  });

  test('prevents going to invalid page numbers', async () => {
    const { result } = renderHook(() => useAdminReadings(mockAuthService));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const initialPage = result.current.currentPage;

    // Try to go to page 0
    act(() => {
      result.current.goToPage(0);
    });

    expect(result.current.currentPage).toBe(initialPage); // Should not change

    // Try to go to negative page
    act(() => {
      result.current.goToPage(-1);
    });

    expect(result.current.currentPage).toBe(initialPage); // Should not change
  });

  test('handles API errors gracefully', async () => {
    const errorMessage = 'Failed to fetch readings';
    mockGetAllReadings.mockRejectedValue(new Error(errorMessage));

    const { result } = renderHook(() => useAdminReadings(mockAuthService));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe(errorMessage);
    expect(result.current.readings).toEqual([]);
  });

  test('handles non-Error exceptions', async () => {
    mockGetAllReadings.mockRejectedValue('String error');

    const { result } = renderHook(() => useAdminReadings(mockAuthService));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Failed to fetch readings');
    expect(result.current.readings).toEqual([]);
  });

  test('refresh function refetches data', async () => {
    const { result } = renderHook(() => useAdminReadings(mockAuthService));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockGetAllReadings).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(mockGetAllReadings).toHaveBeenCalledTimes(2);
    });
  });

  test('accepts custom initial options', async () => {
    const { result } = renderHook(() =>
      useAdminReadings(mockAuthService, {
        pageSize: 50,
        initialSortField: 'type',
        initialSortOrder: 'asc',
      }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.sortField).toBe('type');
    expect(result.current.sortOrder).toBe('asc');
    expect(mockGetAllReadings).toHaveBeenCalledWith({
      limit: 50,
      lastEvaluatedKey: undefined,
    });
  });

  test('sorts by status correctly', async () => {
    const { result } = renderHook(() => useAdminReadings(mockAuthService));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.handleSort('status');
    });

    expect(result.current.sortField).toBe('status');
    expect(result.current.sortOrder).toBe('asc');

    // When sorted by status ascending: Failed, Processing, Ready
    expect(result.current.readings[0].status).toBe('Failed');
    expect(result.current.readings[1].status).toBe('Processing');
    expect(result.current.readings[2].status).toBe('Ready');
  });

  test('sorts by type correctly', async () => {
    const { result } = renderHook(() => useAdminReadings(mockAuthService));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.handleSort('type');
    });

    expect(result.current.sortField).toBe('type');
    expect(result.current.sortOrder).toBe('asc');

    // When sorted by type ascending: Natal Chart, Soul Blueprint, Soul Blueprint
    expect(result.current.readings[0].type).toBe('Natal Chart');
    expect(result.current.readings[1].type).toBe('Soul Blueprint');
    expect(result.current.readings[2].type).toBe('Soul Blueprint');
  });

  test('handles undefined values in sorting', async () => {
    const responseWithUndefined = {
      readings: [
        {
          readingId: 'reading-1',
          userId: 'user-1',
          userEmail: undefined,
          type: 'Soul Blueprint',
          status: 'Ready' as const,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:01:00Z',
        },
        {
          readingId: 'reading-2',
          userId: 'user-2',
          userEmail: 'user2@example.com',
          type: 'Natal Chart',
          status: 'Processing' as const,
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
        },
      ],
      count: 2,
    };

    mockGetAllReadings.mockResolvedValue(responseWithUndefined);

    const { result } = renderHook(() => useAdminReadings(mockAuthService));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.handleSort('userEmail');
    });

    // Undefined values should be treated as empty strings and sorted first
    expect(result.current.readings[0].userEmail).toBeUndefined();
    expect(result.current.readings[1].userEmail).toBe('user2@example.com');
  });

  test('calculates total pages correctly', async () => {
    const largeResponse = {
      readings: mockReadingsResponse.readings,
      count: 100,
    };
    mockGetAllReadings.mockResolvedValue(largeResponse);

    const { result } = renderHook(() => useAdminReadings(mockAuthService, { pageSize: 25 }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.totalCount).toBe(100);
    expect(result.current.totalPages).toBe(4); // 100 items / 25 per page
  });

  test('resets pagination when filters change', async () => {
    const { result } = renderHook(() => useAdminReadings(mockAuthService));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Go to page 2
    act(() => {
      result.current.goToPage(2);
    });

    expect(result.current.currentPage).toBe(2);

    // Update filters
    act(() => {
      result.current.updateFilters({ status: 'Ready' });
    });

    // Should reset to page 1
    expect(result.current.currentPage).toBe(1);
    expect(result.current.lastEvaluatedKey).toBeUndefined();
  });
});
