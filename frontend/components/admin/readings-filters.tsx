'use client';

import { useState, useCallback, useEffect } from 'react';
import { Calendar, Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ReadingsFilter } from '@/lib/api/admin-api';

interface ReadingsFiltersProps {
  filters: ReadingsFilter;
  onFiltersChange: (filters: Partial<ReadingsFilter>) => void;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
}

export function ReadingsFilters({
  filters,
  onFiltersChange,
  pageSize,
  onPageSizeChange,
}: ReadingsFiltersProps) {
  const [localFilters, setLocalFilters] = useState<ReadingsFilter>(filters);
  const [userSearchValue, setUserSearchValue] = useState('');

  // Handle user search with debouncing
  useEffect(() => {
    const timeout = setTimeout(() => {
      onFiltersChange({ userSearch: userSearchValue || undefined });
    }, 300);

    return () => {
      clearTimeout(timeout);
    };
  }, [userSearchValue, onFiltersChange]);

  const handleDateChange = useCallback(
    (field: 'startDate' | 'endDate', value: string) => {
      const newFilters = { ...localFilters, [field]: value };
      setLocalFilters(newFilters);
      onFiltersChange({ [field]: value });
    },
    [localFilters, onFiltersChange],
  );

  const handleStatusChange = useCallback(
    (value: string) => {
      const newStatus = value === 'all' ? undefined : value;
      setLocalFilters((prev) => ({ ...prev, status: newStatus }));
      onFiltersChange({ status: newStatus });
    },
    [onFiltersChange],
  );

  const handleTypeChange = useCallback(
    (value: string) => {
      const newType = value === 'all' ? undefined : value;
      setLocalFilters((prev) => ({ ...prev, type: newType }));
      onFiltersChange({ type: newType });
    },
    [onFiltersChange],
  );

  const clearFilters = useCallback(() => {
    setLocalFilters({});
    setUserSearchValue('');
    onFiltersChange({
      startDate: undefined,
      endDate: undefined,
      status: undefined,
      type: undefined,
      userSearch: undefined,
    });
  }, [onFiltersChange]);

  const hasActiveFilters =
    localFilters.startDate ||
    localFilters.endDate ||
    localFilters.status ||
    localFilters.type ||
    userSearchValue;

  return (
    <div className="space-y-4 rounded-lg border border-white/20 bg-white/10 backdrop-blur-md p-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
          <Filter className="h-5 w-5" />
          Filters
        </h3>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-sm">
            <X className="mr-1 h-4 w-4" />
            Clear all
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Date Range */}
        <div className="space-y-2">
          <Label className="text-white/90">Start Date</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start">
                <Calendar className="mr-2 h-4 w-4" />
                {localFilters.startDate || 'Select date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2">
              <Input
                type="date"
                value={localFilters.startDate || ''}
                onChange={(e) => handleDateChange('startDate', e.target.value)}
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-2">
          <Label className="text-white/90">End Date</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start">
                <Calendar className="mr-2 h-4 w-4" />
                {localFilters.endDate || 'Select date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2">
              <Input
                type="date"
                value={localFilters.endDate || ''}
                onChange={(e) => handleDateChange('endDate', e.target.value)}
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Status Filter */}
        <div className="space-y-2">
          <Label className="text-white/90">Status</Label>
          <Select value={localFilters.status || 'all'} onValueChange={handleStatusChange}>
            <SelectTrigger>
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="Processing">Processing</SelectItem>
              <SelectItem value="Ready">Ready</SelectItem>
              <SelectItem value="Failed">Failed</SelectItem>
              <SelectItem value="In Review">In Review</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Type Filter */}
        <div className="space-y-2">
          <Label className="text-white/90">Reading Type</Label>
          <Select value={localFilters.type || 'all'} onValueChange={handleTypeChange}>
            <SelectTrigger>
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="Soul Blueprint">Soul Blueprint</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* User Search */}
        <div className="space-y-2">
          <Label className="text-white/90">Search User</Label>
          <Input
            type="text"
            placeholder="Search by email or name..."
            className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
            value={userSearchValue}
            onChange={(e) => setUserSearchValue(e.target.value)}
          />
        </div>

        {/* Page Size */}
        <div className="space-y-2">
          <Label className="text-white/90">Items per page</Label>
          <Select
            value={pageSize.toString()}
            onValueChange={(value) => onPageSizeChange(Number(value))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
