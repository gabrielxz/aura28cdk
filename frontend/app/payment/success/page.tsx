'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/use-auth';
import { Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import AuthenticatedLayout from '@/components/AuthenticatedLayout';
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
      <AuthenticatedLayout>
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#ffb74d]" />
            <p className="mt-2 text-white/70">Loading...</p>
          </div>
        </div>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <div className="container mx-auto flex min-h-screen items-center justify-center px-4 py-8">
        <Card className="w-full max-w-2xl bg-white/10 backdrop-blur-md border border-white/20">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20 border border-green-500/30">
              <CheckCircle2 className="h-10 w-10 text-green-400" />
            </div>
            <CardTitle className="text-2xl font-bold text-white">Payment Successful!</CardTitle>
            <CardDescription className="mt-2 text-white/70">
              Thank you for your purchase. Your transaction has been completed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Information Section */}
            <div className="rounded-lg border border-white/20 bg-white/10 backdrop-blur-sm p-4">
              <p className="text-sm text-white/80">
                Your Soul Blueprint reading is being prepared. You&apos;ll receive an email
                notification when it&apos;s ready.
              </p>
            </div>

            {/* Action Button */}
            <Button
              className="w-full bg-gradient-to-r from-[#ff8a65] to-[#ffb74d] text-[#1a1b3a] hover:opacity-90"
              onClick={() => router.push('/dashboard?tab=readings')}
              size="lg"
            >
              Return to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    </AuthenticatedLayout>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense
      fallback={
        <AuthenticatedLayout>
          <div className="flex min-h-screen items-center justify-center">
            <div className="text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#ffb74d]" />
              <p className="mt-2 text-white/70">Loading...</p>
            </div>
          </div>
        </AuthenticatedLayout>
      }
    >
      <PaymentSuccessContent />
    </Suspense>
  );
}
