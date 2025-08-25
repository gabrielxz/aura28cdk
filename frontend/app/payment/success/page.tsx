'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth/use-auth';
import { Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { UserApi } from '@/lib/api/user-api';
import { AuthService } from '@/lib/auth/auth-service';
import { Badge } from '@/components/ui/badge';

function PaymentSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const [readingStatus, setReadingStatus] = useState<'checking' | 'generating' | 'ready' | 'error'>(
    'checking',
  );
  const [readingCount, setReadingCount] = useState<number>(0);
  const processingRef = useRef(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Check authentication
    if (!authLoading && !user) {
      // User is not authenticated, redirect to login
      router.replace('/login');
      return;
    }

    if (!user) {
      // Still loading auth
      return;
    }

    const handleSuccess = async () => {
      // Prevent duplicate processing
      if (processingRef.current) {
        return;
      }
      processingRef.current = true;

      // Extract session_id from URL parameters (for potential future use)
      // const sessionId = searchParams.get('session_id');

      // Show success message
      toast({
        title: 'Payment Successful',
        description: 'Thank you for your purchase! Your reading is being generated.',
      });

      // Clean up URL parameters to prevent re-processing on refresh
      window.history.replaceState({}, '', '/payment/success');

      // Check reading status
      try {
        const authService = new AuthService();
        const userApi = new UserApi(authService);

        // Poll for reading status - it might take a few seconds for the webhook to process
        let attempts = 0;
        const maxAttempts = 30; // Poll for up to 30 seconds

        const checkReadingStatus = async () => {
          if (attempts >= maxAttempts) {
            setReadingStatus('error');
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
            }
            return;
          }

          attempts++;

          try {
            const readings = await userApi.getReadings(user.sub);
            const currentCount = readings.readings?.length || 0;

            if (currentCount > readingCount) {
              // New reading detected
              setReadingCount(currentCount);
              setReadingStatus('ready');
              if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
              }

              toast({
                title: 'Reading Ready',
                description: 'Your Soul Blueprint reading is now available!',
              });

              // Automatically redirect to dashboard with refresh trigger after a short delay
              setTimeout(() => {
                router.push('/dashboard?tab=readings&refresh=true');
              }, 2000);
            } else if (attempts < 5) {
              // First 5 attempts, show as checking
              setReadingStatus('checking');
            } else {
              // After 5 attempts, show as generating
              setReadingStatus('generating');
            }
          } catch {
            // Silently continue polling even if there's an error
            // Error is expected during polling, no need to log
          }
        };

        // Initial check
        const initialReadings = await userApi.getReadings(user.sub);
        setReadingCount(initialReadings.readings?.length || 0);

        // Start polling
        checkReadingStatus();
        pollingIntervalRef.current = setInterval(checkReadingStatus, 1000);
      } catch {
        // Failed to check initial readings, set error status
        setReadingStatus('error');
      }
    };

    handleSuccess();

    // Cleanup on unmount
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [user, authLoading, searchParams, router, readingCount]);

  // Show loading while checking authentication
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin" />
          <p className="mt-2 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto flex min-h-screen items-center justify-center px-4 py-8">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
          </div>
          <CardTitle className="text-2xl font-bold">Payment Successful!</CardTitle>
          <CardDescription className="mt-2">
            Thank you for your purchase. Your transaction has been completed successfully.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Reading Status Section */}
          <div className="rounded-lg border bg-muted/50 p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="font-medium">Soul Blueprint Reading</p>
                <p className="text-sm text-muted-foreground">
                  {readingStatus === 'checking' && 'Checking reading status...'}
                  {readingStatus === 'generating' && 'Your reading is being generated...'}
                  {readingStatus === 'ready' && 'Your reading is ready!'}
                  {readingStatus === 'error' && 'There was an issue checking your reading status.'}
                </p>
              </div>
              <div>
                {readingStatus === 'checking' && (
                  <Badge variant="secondary" className="gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Checking
                  </Badge>
                )}
                {readingStatus === 'generating' && (
                  <Badge variant="default" className="gap-1">
                    <Sparkles className="h-3 w-3" />
                    Generating
                  </Badge>
                )}
                {readingStatus === 'ready' && (
                  <Badge variant="default" className="bg-green-600">
                    Ready
                  </Badge>
                )}
                {readingStatus === 'error' && <Badge variant="destructive">Error</Badge>}
              </div>
            </div>
          </div>

          {/* Information Section */}
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              {readingStatus === 'generating' && (
                <>
                  Your personalized Soul Blueprint reading is being generated. This typically takes
                  30-60 seconds. You&apos;ll be notified when it&apos;s ready.
                </>
              )}
              {readingStatus === 'ready' && (
                <>
                  Your Soul Blueprint reading has been generated and is now available in your
                  dashboard. Click the button below to view it.
                </>
              )}
              {readingStatus === 'error' && (
                <>
                  If your reading doesn&apos;t appear within a few minutes, please check your
                  dashboard or contact support for assistance.
                </>
              )}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-3 sm:flex-row">
            {readingStatus === 'ready' ? (
              <Button
                className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white shadow-lg hover:shadow-xl transition-all duration-200"
                onClick={() => router.push('/dashboard?tab=readings&refresh=true')}
                size="lg"
              >
                <Sparkles className="mr-2 h-5 w-5" />
                View Your Reading
              </Button>
            ) : (
              <Button
                className="flex-1"
                onClick={() => router.push('/dashboard?tab=readings')}
                variant={readingStatus === 'error' ? 'default' : 'outline'}
              >
                Go to Dashboard
              </Button>
            )}

            {readingStatus === 'generating' && (
              <Button variant="outline" className="flex-1" disabled>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </Button>
            )}
          </div>

          {/* Help Section */}
          {readingStatus === 'error' && (
            <div className="rounded-lg border-l-4 border-yellow-500 bg-yellow-50 p-4">
              <p className="text-sm">
                <strong>Need help?</strong> If you&apos;re experiencing issues, please check your
                dashboard or contact our support team with your payment confirmation.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin" />
            <p className="mt-2 text-muted-foreground">Loading...</p>
          </div>
        </div>
      }
    >
      <PaymentSuccessContent />
    </Suspense>
  );
}
