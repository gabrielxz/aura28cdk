'use client';

import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { Calendar, User, FileText, Clock, AlertCircle } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AdminApi } from '@/lib/api/admin-api';

export interface ReadingDetails {
  readingId: string;
  userId: string;
  userEmail?: string;
  userProfile?: {
    birthName?: string;
    birthDate?: string;
    birthTime?: string;
    birthCity?: string;
    birthState?: string;
    birthCountry?: string;
  };
  type: string;
  status: 'Processing' | 'Ready' | 'Failed' | 'In Review';
  createdAt: string;
  updatedAt: string;
  content?:
    | string
    | {
        chartData?: Record<string, unknown>;
        interpretation?: string;
        insights?: string[];
        recommendations?: string[];
      };
  error?: string;
  metadata?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    processingTime?: number;
  };
}

interface ReadingDetailsSheetProps {
  userId: string | null;
  readingId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  adminApi: AdminApi;
}

export function ReadingDetailsSheet({
  userId,
  readingId,
  open,
  onOpenChange,
  adminApi,
}: ReadingDetailsSheetProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<ReadingDetails | null>(null);

  const fetchReadingDetails = useCallback(async () => {
    if (!userId || !readingId) return;

    setLoading(true);
    setError(null);

    try {
      const data = await adminApi.getReadingDetails(userId, readingId);
      setDetails(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch reading details');
      console.error('Error fetching reading details:', err);
    } finally {
      setLoading(false);
    }
  }, [userId, readingId, adminApi]);

  useEffect(() => {
    if (open && userId && readingId) {
      fetchReadingDetails();
    }
  }, [open, userId, readingId, fetchReadingDetails]);

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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Reading Details</SheetTitle>
          <SheetDescription>View complete information about this reading</SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-120px)] mt-6 pr-4">
          {loading && (
            <div className="space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-60 w-full" />
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {details && !loading && (
            <div className="space-y-6">
              {/* Basic Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Basic Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Reading ID</p>
                    <p className="font-mono text-sm">{details.readingId}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Status</p>
                    <Badge variant={getStatusBadgeVariant(details.status)}>{details.status}</Badge>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Type</p>
                    <p className="font-medium">{details.type}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Created</p>
                    <p className="text-sm">
                      {format(new Date(details.createdAt), 'MMM dd, yyyy HH:mm')}
                    </p>
                  </div>
                </div>
              </div>

              {/* User Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">User Information</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Email:</span>
                    <span className="text-sm font-medium">
                      {details.userEmail || 'Not available'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">User ID:</span>
                    <span className="font-mono text-xs">{details.userId}</span>
                  </div>
                  {details.userProfile && (
                    <>
                      {details.userProfile.birthName && (
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">Birth Name:</span>
                          <span className="text-sm font-medium">
                            {details.userProfile.birthName}
                          </span>
                        </div>
                      )}
                      {details.userProfile.birthDate && (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">Birth Date:</span>
                          <span className="text-sm font-medium">
                            {format(new Date(details.userProfile.birthDate), 'PPP')}
                            {details.userProfile.birthTime &&
                              ` at ${details.userProfile.birthTime}`}
                          </span>
                        </div>
                      )}
                      {(details.userProfile.birthCity ||
                        details.userProfile.birthState ||
                        details.userProfile.birthCountry) && (
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">Birth Location:</span>
                          <span className="text-sm font-medium">
                            {[
                              details.userProfile.birthCity,
                              details.userProfile.birthState,
                              details.userProfile.birthCountry,
                            ]
                              .filter(Boolean)
                              .join(', ')}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Content Section */}
              {details.content && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Reading Content</h3>

                  {/* Handle both string and object content formats */}
                  {typeof details.content === 'string' ? (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-muted-foreground">Interpretation</h4>
                      <div className="rounded-lg bg-muted p-4 max-h-96 overflow-y-auto">
                        <p className="text-sm whitespace-pre-wrap">{details.content}</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      {details.content.interpretation && (
                        <div className="space-y-2">
                          <h4 className="text-sm font-medium text-muted-foreground">
                            Interpretation
                          </h4>
                          <div className="rounded-lg bg-muted p-4 max-h-96 overflow-y-auto">
                            <p className="text-sm whitespace-pre-wrap">
                              {details.content.interpretation}
                            </p>
                          </div>
                        </div>
                      )}

                      {details.content.insights && details.content.insights.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-sm font-medium text-muted-foreground">
                            Key Insights
                          </h4>
                          <ul className="space-y-2">
                            {details.content.insights.map((insight, index) => (
                              <li key={index} className="flex items-start gap-2">
                                <span className="text-sm text-muted-foreground">•</span>
                                <span className="text-sm">{insight}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {details.content.recommendations &&
                        details.content.recommendations.length > 0 && (
                          <div className="space-y-2">
                            <h4 className="text-sm font-medium text-muted-foreground">
                              Recommendations
                            </h4>
                            <ul className="space-y-2">
                              {details.content.recommendations.map((rec, index) => (
                                <li key={index} className="flex items-start gap-2">
                                  <span className="text-sm text-muted-foreground">•</span>
                                  <span className="text-sm">{rec}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                    </>
                  )}
                </div>
              )}

              {/* Error Information */}
              {details.error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Error:</strong> {details.error}
                  </AlertDescription>
                </Alert>
              )}

              {/* Metadata */}
              {details.metadata && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Processing Metadata</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {details.metadata.model && (
                      <div>
                        <span className="text-muted-foreground">Model:</span>{' '}
                        <span className="font-medium">{details.metadata.model}</span>
                      </div>
                    )}
                    {details.metadata.temperature !== undefined && (
                      <div>
                        <span className="text-muted-foreground">Temperature:</span>{' '}
                        <span className="font-medium">{details.metadata.temperature}</span>
                      </div>
                    )}
                    {details.metadata.maxTokens && (
                      <div>
                        <span className="text-muted-foreground">Max Tokens:</span>{' '}
                        <span className="font-medium">{details.metadata.maxTokens}</span>
                      </div>
                    )}
                    {details.metadata.processingTime && (
                      <div>
                        <span className="text-muted-foreground">Processing Time:</span>{' '}
                        <span className="font-medium">
                          {(details.metadata.processingTime / 1000).toFixed(2)}s
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Timestamps */}
              <div className="space-y-2 border-t pt-4">
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Created:</span>
                  <span>{format(new Date(details.createdAt), 'PPpp')}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Last Updated:</span>
                  <span>{format(new Date(details.updatedAt), 'PPpp')}</span>
                </div>
              </div>
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
