'use client';

import * as React from 'react';
import { Clock } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

interface TimePickerProps {
  value?: string;
  onChange?: (time: string) => void;
  placeholder?: string;
  id?: string;
  required?: boolean;
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
  const [hours, setHours] = React.useState('12');
  const [minutes, setMinutes] = React.useState('00');
  const [period, setPeriod] = React.useState<'AM' | 'PM'>('AM');
  const [isOpen, setIsOpen] = React.useState(false);

  React.useEffect(() => {
    if (value) {
      const [h, m] = value.split(':');
      const hour = parseInt(h);
      const minute = parseInt(m);

      if (hour === 0) {
        setHours('12');
        setPeriod('AM');
      } else if (hour < 12) {
        setHours(hour.toString());
        setPeriod('AM');
      } else if (hour === 12) {
        setHours('12');
        setPeriod('PM');
      } else {
        setHours((hour - 12).toString());
        setPeriod('PM');
      }
      setMinutes(minute.toString().padStart(2, '0'));
    }
  }, [value]);

  const handleTimeChange = () => {
    let hour = parseInt(hours);
    if (period === 'AM' && hour === 12) {
      hour = 0;
    } else if (period === 'PM' && hour !== 12) {
      hour += 12;
    }
    const timeString = `${hour.toString().padStart(2, '0')}:${minutes.padStart(2, '0')}`;
    onChange?.(timeString);
    setIsOpen(false);
  };

  const formatDisplayTime = () => {
    if (!value) return null;
    return `${hours}:${minutes} ${period}`;
  };

  const generateHours = () => {
    const hours = [];
    for (let i = 1; i <= 12; i++) {
      hours.push(i.toString());
    }
    return hours;
  };

  const generateMinutes = () => {
    const minutes = [];
    for (let i = 0; i < 60; i += 5) {
      minutes.push(i.toString().padStart(2, '0'));
    }
    return minutes;
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant={'outline'}
          className={cn(
            'w-full justify-start text-left font-normal',
            !value && 'text-muted-foreground',
            className,
          )}
          disabled={disabled}
        >
          <Clock className="mr-2 h-4 w-4" />
          {formatDisplayTime() || <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-4" align="start">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Select Time</Label>
          </div>
          <div className="flex space-x-2">
            <div className="flex-1">
              <Label className="text-xs">Hour</Label>
              <Select value={hours} onValueChange={setHours}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {generateHours().map((h) => (
                    <SelectItem key={h} value={h}>
                      {h}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label className="text-xs">Minute</Label>
              <Select value={minutes} onValueChange={setMinutes}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {generateMinutes().map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label className="text-xs">Period</Label>
              <Select value={period} onValueChange={(value) => setPeriod(value as 'AM' | 'PM')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AM">AM</SelectItem>
                  <SelectItem value="PM">PM</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button className="w-full" onClick={handleTimeChange}>
            Set Time
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
