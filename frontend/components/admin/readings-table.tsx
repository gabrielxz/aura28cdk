'use client';

import { format } from 'date-fns';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AdminReading } from '@/lib/api/admin-api';
import { SortField, SortOrder } from '@/hooks/use-admin-readings';
import { ReadingActions } from './reading-actions';

interface ReadingsTableProps {
  readings: AdminReading[];
  loading: boolean;
  sortField: SortField;
  sortOrder: SortOrder;
  onSort: (field: SortField) => void;
  onViewDetails: (userId: string, readingId: string) => void;
  onDelete: (userId: string, readingId: string, userEmail?: string) => void;
  onStatusUpdate: (
    userId: string,
    readingId: string,
    newStatus: AdminReading['status'],
  ) => Promise<void>;
}

export function ReadingsTable({
  readings,
  loading,
  sortField,
  sortOrder,
  onSort,
  onViewDetails,
  onDelete,
  onStatusUpdate,
}: ReadingsTableProps) {
  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="ml-2 h-4 w-4" aria-hidden="true" />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp className="ml-2 h-4 w-4" aria-hidden="true" />
    ) : (
      <ArrowDown className="ml-2 h-4 w-4" aria-hidden="true" />
    );
  };

  const getAriaSortValue = (field: SortField): 'ascending' | 'descending' | 'none' => {
    if (sortField !== field) return 'none';
    return sortOrder === 'asc' ? 'ascending' : 'descending';
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'Ready':
        return 'default';
      case 'Processing':
        return 'secondary';
      case 'Failed':
        return 'destructive';
      case 'In Review':
        return 'outline';
      default:
        return 'default';
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-10 animate-pulse rounded bg-muted"></div>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded bg-muted"></div>
        ))}
      </div>
    );
  }

  if (readings.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed">
        <div className="text-center">
          <p className="text-lg font-semibold">No readings found</p>
          <p className="text-sm text-muted-foreground">
            Try adjusting your filters or check back later
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">
              <Button
                variant="ghost"
                onClick={() => onSort('createdAt')}
                className="h-auto p-0 font-semibold hover:bg-transparent"
                aria-sort={getAriaSortValue('createdAt')}
                aria-label={`Sort by Date Generated, currently ${getAriaSortValue('createdAt')}`}
              >
                Date Generated
                {getSortIcon('createdAt')}
              </Button>
            </TableHead>
            <TableHead scope="col">
              <Button
                variant="ghost"
                onClick={() => onSort('userEmail')}
                className="h-auto p-0 font-semibold hover:bg-transparent"
                aria-sort={getAriaSortValue('userEmail')}
                aria-label={`Sort by User, currently ${getAriaSortValue('userEmail')}`}
              >
                User
                {getSortIcon('userEmail')}
              </Button>
            </TableHead>
            <TableHead scope="col">
              <Button
                variant="ghost"
                onClick={() => onSort('type')}
                className="h-auto p-0 font-semibold hover:bg-transparent"
                aria-sort={getAriaSortValue('type')}
                aria-label={`Sort by Reading Type, currently ${getAriaSortValue('type')}`}
              >
                Reading Type
                {getSortIcon('type')}
              </Button>
            </TableHead>
            <TableHead scope="col">
              <Button
                variant="ghost"
                onClick={() => onSort('status')}
                className="h-auto p-0 font-semibold hover:bg-transparent"
                aria-sort={getAriaSortValue('status')}
                aria-label={`Sort by Status, currently ${getAriaSortValue('status')}`}
              >
                Status
                {getSortIcon('status')}
              </Button>
            </TableHead>
            <TableHead scope="col">Reading ID</TableHead>
            <TableHead scope="col" className="text-right">
              Actions
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {readings.map((reading) => (
            <TableRow
              key={reading.readingId}
              onClick={() => onViewDetails(reading.userId, reading.readingId)}
              className="cursor-pointer hover:bg-muted/50"
            >
              <TableCell>{format(new Date(reading.createdAt), 'MMM dd, yyyy HH:mm')}</TableCell>
              <TableCell>
                <div>
                  <p className="font-medium">{reading.userEmail || 'Unknown'}</p>
                  <p className="text-xs text-muted-foreground">{reading.userId}</p>
                </div>
              </TableCell>
              <TableCell>{reading.type}</TableCell>
              <TableCell>
                <Badge variant={getStatusBadgeVariant(reading.status)}>{reading.status}</Badge>
              </TableCell>
              <TableCell className="font-mono text-xs">
                {reading.readingId.slice(0, 8)}...
              </TableCell>
              <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                <ReadingActions
                  reading={reading}
                  onViewDetails={onViewDetails}
                  onDelete={onDelete}
                  onStatusUpdate={onStatusUpdate}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
