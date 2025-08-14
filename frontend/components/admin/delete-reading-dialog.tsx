'use client';

import { useState } from 'react';
import { Trash2, AlertTriangle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';

interface DeleteReadingDialogProps {
  readingId: string;
  userEmail?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (readingId: string) => Promise<void>;
}

export function DeleteReadingDialog({
  readingId,
  userEmail,
  open,
  onOpenChange,
  onConfirm,
}: DeleteReadingDialogProps) {
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onConfirm(readingId);
      toast({
        title: 'Reading deleted',
        description: 'The reading has been permanently deleted.',
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete reading',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <AlertDialogTitle>Delete Reading</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="space-y-2">
            <p>Are you sure you want to delete this reading?</p>
            <div className="rounded-lg bg-muted p-3 space-y-1">
              <p className="text-sm">
                <span className="font-medium">Reading ID:</span>{' '}
                <span className="font-mono text-xs">{readingId.slice(0, 8)}...</span>
              </p>
              {userEmail && (
                <p className="text-sm">
                  <span className="font-medium">User:</span> {userEmail}
                </p>
              )}
            </div>
            <p className="text-destructive font-medium">This action cannot be undone.</p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting ? (
              <>
                <Trash2 className="mr-2 h-4 w-4 animate-pulse" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Reading
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
