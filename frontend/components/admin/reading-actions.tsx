'use client';

import { useState } from 'react';
import { MoreHorizontal, Eye, Trash2, CheckCircle, XCircle } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { AdminReading } from '@/lib/api/admin-api';

interface ReadingActionsProps {
  reading: AdminReading;
  onViewDetails: (userId: string, readingId: string) => void;
  onDelete: (userId: string, readingId: string, userEmail?: string) => void;
  onStatusUpdate: (
    userId: string,
    readingId: string,
    newStatus: AdminReading['status'],
  ) => Promise<void>;
}

const STATUSES: AdminReading['status'][] = ['Processing', 'Ready', 'Failed', 'In Review'];

export function ReadingActions({
  reading,
  onViewDetails,
  onDelete,
  onStatusUpdate,
}: ReadingActionsProps) {
  const [updating, setUpdating] = useState(false);
  const { toast } = useToast();

  const handleStatusUpdate = async (newStatus: AdminReading['status']) => {
    if (newStatus === reading.status) return;

    setUpdating(true);
    try {
      await onStatusUpdate(reading.userId, reading.readingId, newStatus);
      toast({
        title: 'Status updated',
        description: `Reading status changed to ${newStatus}`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update status',
        variant: 'destructive',
      });
    } finally {
      setUpdating(false);
    }
  };

  const getStatusIcon = (status: AdminReading['status']) => {
    switch (status) {
      case 'Ready':
        return <CheckCircle className="h-3 w-3" />;
      case 'Failed':
        return <XCircle className="h-3 w-3" />;
      default:
        return null;
    }
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 w-8 p-0" disabled={updating}>
          <span className="sr-only">Open menu</span>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => onViewDetails(reading.userId, reading.readingId)}>
          <Eye className="mr-2 h-4 w-4" />
          View Details
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Badge variant={getStatusBadgeVariant(reading.status)} className="mr-2 h-5 px-2">
              {reading.status}
            </Badge>
            Change Status
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {STATUSES.map((status) => (
              <DropdownMenuItem
                key={status}
                onClick={() => handleStatusUpdate(status)}
                disabled={status === reading.status}
                className={status === reading.status ? 'opacity-50' : ''}
              >
                <div className="flex items-center gap-2">
                  {getStatusIcon(status)}
                  <span>{status}</span>
                  {status === reading.status && (
                    <span className="ml-auto text-xs text-muted-foreground">(current)</span>
                  )}
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={() => onDelete(reading.userId, reading.readingId, reading.userEmail)}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete Reading
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
