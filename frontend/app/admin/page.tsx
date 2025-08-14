'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { useAuth } from '@/lib/auth/use-auth';
import { useAdminReadings } from '@/hooks/use-admin-readings';
import { ReadingsTable } from '@/components/admin/readings-table';
import { ReadingsFilters } from '@/components/admin/readings-filters';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function AdminDashboard() {
  const { authService } = useAuth();
  const [pageSize, setPageSize] = useState(25);

  const {
    readings,
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
    refresh,
  } = useAdminReadings(authService, { pageSize });

  return (
    <div className="container mx-auto py-8 px-4">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground">
          Manage and monitor all user readings across the platform
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Filters */}
      <div className="mb-6">
        <ReadingsFilters
          filters={filters}
          onFiltersChange={updateFilters}
          pageSize={pageSize}
          onPageSizeChange={(size) => {
            setPageSize(size);
            goToPage(1);
          }}
        />
      </div>

      {/* Stats Bar */}
      <div className="mb-6 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {loading ? (
            'Loading...'
          ) : (
            <>
              Showing {Math.min((currentPage - 1) * pageSize + 1, totalCount)} to{' '}
              {Math.min(currentPage * pageSize, totalCount)} of {totalCount} readings
            </>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Table */}
      <div className="mb-6">
        <ReadingsTable
          readings={readings}
          loading={loading}
          sortField={sortField}
          sortOrder={sortOrder}
          onSort={handleSort}
        />
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1 || loading}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages || loading}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
