'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/use-auth';
import { Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

function PaymentSuccessContent() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

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

    // Clean up URL parameters to prevent re-processing on refresh
    window.history.replaceState({}, '', '/payment/success');

    // Show success message
    toast({
      title: 'Payment Successful',
      description: 'Thank you for your purchase!',
    });
  }, [user, authLoading, router]);

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
            Thank you for your purchase. Your transaction has been completed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Information Section */}
          <div className="rounded-lg border bg-muted/50 p-4">
            <p className="text-sm">
              Your Soul Blueprint reading is being prepared. You&apos;ll receive an email
              notification when it&apos;s ready.
            </p>
          </div>

          {/* Action Button */}
          <Button
            className="w-full"
            onClick={() => router.push('/dashboard?tab=readings')}
            size="lg"
          >
            Return to Dashboard
          </Button>
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
