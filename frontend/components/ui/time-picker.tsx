'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

interface TimePickerProps {
  value?: string;
  onChange?: (time: string) => void;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
}

export function TimePicker({
  value,
  onChange,
  placeholder = 'Select time',
  id,
  disabled,
  className,
}: TimePickerProps) {
  // Ensure value is in HH:mm format
  const formattedValue = value || '';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange?.(e.target.value);
  };

  return (
    <Input
      id={id}
      type="time"
      step={60} // 1 minute steps
      value={formattedValue}
      onChange={handleChange}
      placeholder={placeholder}
      disabled={disabled}
      className={cn('w-full', className)}
    />
  );
}
