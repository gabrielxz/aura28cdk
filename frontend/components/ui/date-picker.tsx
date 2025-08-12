'use client';

import * as React from 'react';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface DatePickerProps {
  value?: string;
  onChange?: (date: string | undefined) => void;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
}

// Helper function to create a local date from YYYY-MM-DD string
// This avoids timezone issues by using local date constructor
const toLocalDate = (yyyyMmDd: string | undefined): Date | undefined => {
  if (!yyyyMmDd) return undefined;
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  return new Date(y, m - 1, d); // month is 0-indexed
};

// Helper function to format Date to YYYY-MM-DD string
const toDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export function DatePicker({
  value,
  onChange,
  placeholder = 'Pick a date',
  id,
  disabled,
  className,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const date = toLocalDate(value);

  const handleSelect = (selectedDate: Date | undefined) => {
    if (selectedDate) {
      onChange?.(toDateString(selectedDate));
    } else {
      onChange?.(undefined);
    }
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant={'outline'}
          className={cn(
            'w-full justify-start text-left font-normal',
            !date && 'text-muted-foreground',
            className,
          )}
          disabled={disabled}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, 'PPP') : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={handleSelect}
          captionLayout="dropdown" // Enable month/year dropdowns
          fromYear={1900} // Start from year 1900
          toYear={new Date().getFullYear()} // Up to current year
          initialFocus
          disabled={(date) => date > new Date() || date < new Date('1900-01-01')}
        />
      </PopoverContent>
    </Popover>
  );
}
