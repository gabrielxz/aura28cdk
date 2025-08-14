'use client';

import { useState, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { useAuth } from '@/lib/auth/use-auth';
import { useAdminReadings } from '@/hooks/use-admin-readings';
import { ReadingsTable } from '@/components/admin/readings-table';
import { ReadingsFilters } from '@/components/admin/readings-filters';
import { ReadingDetailsSheet } from '@/components/admin/reading-details-sheet';
import { DeleteReadingDialog } from '@/components/admin/delete-reading-dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AdminApi, AdminReading } from '@/lib/api/admin-api';

export default function AdminDashboard() {
  const { authService } = useAuth();
  const [pageSize, setPageSize] = useState(25);
  const [selectedReadingId, setSelectedReadingId] = useState<string | null>(null);
  const [detailsSheetOpen, setDetailsSheetOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [readingToDelete, setReadingToDelete] = useState<{ id: string; email?: string } | null>(
    null,
  );

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
    setReadings,
    setTotalCount,
  } = useAdminReadings(authService, { pageSize });

  const adminApi = useMemo(() => new AdminApi(authService), [authService]);

  const handleViewDetails = useCallback((readingId: string) => {
    setSelectedReadingId(readingId);
    setDetailsSheetOpen(true);
  }, []);

  const handleDeleteClick = useCallback((readingId: string, userEmail?: string) => {
    setReadingToDelete({ id: readingId, email: userEmail });
    setDeleteDialogOpen(true);
  }, []);

  const handleDeleteConfirm = useCallback(
    async (readingId: string) => {
      // Store original state for rollback
      const originalReadings = readings;
      const originalTotalCount = totalCount;

      // Optimistically remove the reading and update count
      setReadings(readings.filter((r) => r.readingId !== readingId));
      setTotalCount(totalCount - 1);

      try {
        await adminApi.deleteReading(readingId);
        // Refresh to get updated list and accurate count
        refresh();
      } catch (error) {
        // Rollback on error - restore both readings and count
        setReadings(originalReadings);
        setTotalCount(originalTotalCount);
        throw error;
      }
    },
    [readings, totalCount, adminApi, refresh, setReadings, setTotalCount],
  );

  const handleStatusUpdate = useCallback(
    async (readingId: string, newStatus: AdminReading['status']) => {
      // Store original state for rollback
      const originalReadings = readings;
      const readingToUpdate = readings.find((r) => r.readingId === readingId);

      if (!readingToUpdate) {
        console.error('Reading not found for status update');
        return;
      }

      // Optimistically update the status
      setReadings(
        readings.map((r) =>
          r.readingId === readingId
            ? { ...r, status: newStatus, updatedAt: new Date().toISOString() }
            : r,
        ),
      );

      try {
        await adminApi.updateReadingStatus(readingId, newStatus);
        // Optionally refresh to ensure consistency
        // refresh();
      } catch (error) {
        // Rollback on error - restore original state
        setReadings(originalReadings);
        console.error('Failed to update reading status:', error);
        throw error;
      }
    },
    [readings, adminApi, setReadings],
  );

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
          onViewDetails={handleViewDetails}
          onDelete={handleDeleteClick}
          onStatusUpdate={handleStatusUpdate}
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

      {/* Reading Details Sheet */}
      <ReadingDetailsSheet
        readingId={selectedReadingId}
        open={detailsSheetOpen}
        onOpenChange={setDetailsSheetOpen}
        adminApi={adminApi}
      />

      {/* Delete Confirmation Dialog */}
      {readingToDelete && (
        <DeleteReadingDialog
          readingId={readingToDelete.id}
          userEmail={readingToDelete.email}
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          onConfirm={handleDeleteConfirm}
        />
      )}
    </div>
  );
}
