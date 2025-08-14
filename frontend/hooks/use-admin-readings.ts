import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AdminApi, AdminReading, ReadingsFilter } from '@/lib/api/admin-api';
import { AuthService } from '@/lib/auth/auth-service';

export type SortField = 'createdAt' | 'userEmail' | 'type' | 'status';
export type SortOrder = 'asc' | 'desc';

export interface UseAdminReadingsOptions {
  pageSize?: number;
  initialSortField?: SortField;
  initialSortOrder?: SortOrder;
}

export function useAdminReadings(authService: AuthService, options: UseAdminReadingsOptions = {}) {
  const { pageSize = 25, initialSortField = 'createdAt', initialSortOrder = 'desc' } = options;

  const [readings, setReadings] = useState<AdminReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [lastEvaluatedKey, setLastEvaluatedKey] = useState<string | undefined>();
  const [sortField, setSortField] = useState<SortField>(initialSortField);
  const [sortOrder, setSortOrder] = useState<SortOrder>(initialSortOrder);
  const [filters, setFilters] = useState<ReadingsFilter>({});
  const abortControllerRef = useRef<AbortController | null>(null);

  const adminApi = useMemo(() => new AdminApi(authService), [authService]);

  const fetchReadings = useCallback(async () => {
    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new AbortController for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      setLoading(true);
      setError(null);

      const response = await adminApi.getAllReadings(
        {
          ...filters,
          limit: pageSize,
          lastEvaluatedKey: currentPage > 1 ? lastEvaluatedKey : undefined,
        },
        abortController.signal,
      );

      setReadings(response.readings);
      setTotalCount(response.count);
      setLastEvaluatedKey(response.lastEvaluatedKey);
    } catch (err) {
      // Don't set error state if request was aborted
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to fetch readings');
      setReadings([]);
    } finally {
      setLoading(false);
    }
  }, [adminApi, filters, pageSize, currentPage, lastEvaluatedKey]);

  // Fetch data when dependencies change
  useEffect(() => {
    fetchReadings();
  }, [fetchReadings]);

  // Sort readings client-side
  const sortedReadings = useMemo(() => {
    const sorted = [...readings].sort((a, b) => {
      let aValue: string | number | undefined = a[sortField];
      let bValue: string | number | undefined = b[sortField];

      // Handle undefined values
      if (aValue === undefined) aValue = '';
      if (bValue === undefined) bValue = '';

      // Convert dates to timestamps for comparison
      if (sortField === 'createdAt' && typeof aValue === 'string' && typeof bValue === 'string') {
        aValue = new Date(aValue).getTime();
        bValue = new Date(bValue).getTime();
      }

      // Convert to lowercase for string comparison
      if (typeof aValue === 'string') aValue = aValue.toLowerCase();
      if (typeof bValue === 'string') bValue = bValue.toLowerCase();

      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [readings, sortField, sortOrder]);

  // Handle sort
  const handleSort = useCallback(
    (field: SortField) => {
      if (field === sortField) {
        setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortOrder('asc');
      }
    },
    [sortField],
  );

  // Handle filter changes
  const updateFilters = useCallback((newFilters: Partial<ReadingsFilter>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
    setCurrentPage(1); // Reset to first page when filters change
    setLastEvaluatedKey(undefined);
  }, []);

  // Handle pagination
  const goToPage = useCallback((page: number) => {
    if (page < 1) return;
    setCurrentPage(page);
  }, []);

  const totalPages = Math.ceil(totalCount / pageSize);

  return {
    readings: sortedReadings,
    loading,
    error,
    totalCount,
    currentPage,
    totalPages,
    sortField,
    sortOrder,
    filters,
    handleSort,
    updateFilters,
    goToPage,
    refresh: fetchReadings,
    setReadings,
    setTotalCount,
  };
}
