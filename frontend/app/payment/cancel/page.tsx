'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth/use-auth';
import { Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import AuthenticatedLayout from '@/components/AuthenticatedLayout';
import { XCircle, ArrowLeft, RefreshCw, HelpCircle } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { UserApi } from '@/lib/api/user-api';
import { AuthService } from '@/lib/auth/auth-service';
import { STRIPE_CONFIG } from '@/lib/config/stripe';

function PaymentCancelContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const [isRetrying, setIsRetrying] = useState(false);
  const processingRef = useRef(false);

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

    const handleCancel = async () => {
      // Prevent duplicate processing
      if (processingRef.current) {
        return;
      }
      processingRef.current = true;

      // Show cancellation message
      toast({
        title: 'Payment Cancelled',
        description: 'Your payment was cancelled. You can try again whenever you are ready.',
      });

      // Clean up URL parameters to prevent re-processing on refresh
      window.history.replaceState({}, '', '/payment/cancel');
    };

    handleCancel();
  }, [user, authLoading, searchParams, router]);

  const handleRetryPayment = async () => {
    if (!user) return;

    setIsRetrying(true);

    try {
      const authService = new AuthService();
      const userApi = new UserApi(authService);

      // Check if user has completed onboarding
      const hasCompletedOnboarding = await userApi.hasCompletedOnboarding(user.sub);

      if (!hasCompletedOnboarding) {
        toast({
          title: 'Profile Required',
          description: 'Please complete your profile before purchasing a reading.',
        });
        router.push('/dashboard?tab=profile');
        return;
      }

      // Create a new checkout session
      const baseUrl = window.location.origin;
      const session = await userApi.createCheckoutSession(user.sub, {
        sessionType: STRIPE_CONFIG.sessionTypes.ONE_TIME,
        priceId: STRIPE_CONFIG.readingPriceId,
        successUrl: STRIPE_CONFIG.getSuccessUrl(baseUrl),
        cancelUrl: STRIPE_CONFIG.getCancelUrl(baseUrl),
        metadata: {
          userId: user.sub,
          readingType: STRIPE_CONFIG.readingTypes.SOUL_BLUEPRINT,
        },
      });

      // Redirect to Stripe Checkout
      if (session.url) {
        window.location.href = session.url;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch {
      // Failed to create checkout session, show error to user
      toast({
        title: 'Error',
        description: 'Failed to create checkout session. Please try again.',
        variant: 'destructive',
      });
      setIsRetrying(false);
    }
  };

  // Show loading while checking authentication
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent motion-reduce:animate-[spin_1.5s_linear_infinite]" />
          <p className="mt-2 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <AuthenticatedLayout>
      <div className="container mx-auto flex min-h-screen items-center justify-center px-4 py-8">
        <Card className="w-full max-w-2xl bg-white/10 backdrop-blur-md border border-white/20">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-yellow-500/20 border border-yellow-500/30">
              <XCircle className="h-10 w-10 text-yellow-400" />
            </div>
            <CardTitle className="text-2xl font-bold text-white">Payment Cancelled</CardTitle>
            <CardDescription className="mt-2 text-white/70">
              Your payment was cancelled. No charges have been made to your account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Information Section */}
            <div className="rounded-lg border border-white/20 bg-white/10 backdrop-blur-sm p-4">
              <p className="text-sm text-white/80">
                You can return to your dashboard or try purchasing again when you&apos;re ready.
                Your Soul Blueprint reading will be generated immediately after successful payment.
              </p>
            </div>

            {/* Benefits Reminder */}
            <div className="space-y-3">
              <h3 className="font-medium text-[#ffb74d]">
                What you&apos;ll get with your Soul Blueprint:
              </h3>
              <ul className="space-y-2 text-sm text-white/70">
                <li className="flex items-start gap-2">
                  <span className="text-[#ffb74d]">•</span>
                  <span>Personalized astrological analysis based on your birth details</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#ffb74d]">•</span>
                  <span>Detailed insights into your personality and life path</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#ffb74d]">•</span>
                  <span>Guidance for personal growth and self-discovery</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#ffb74d]">•</span>
                  <span>Lifetime access to your reading</span>
                </li>
              </ul>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button className="flex-1" onClick={handleRetryPayment} disabled={isRetrying}>
                {isRetrying ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Creating checkout...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Try Again
                  </>
                )}
              </Button>

              <Button
                variant="outline"
                className="flex-1"
                onClick={() => router.push('/dashboard')}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Return to Dashboard
              </Button>
            </div>

            {/* Help Section */}
            <div className="rounded-lg border-l-4 border-blue-500 bg-blue-50 p-4">
              <div className="flex items-start gap-2">
                <HelpCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">Need assistance?</p>
                  <p className="text-sm text-muted-foreground">
                    If you experienced any issues during checkout or have questions about the Soul
                    Blueprint reading, please don&apos;t hesitate to contact our support team.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AuthenticatedLayout>
  );
}

export default function PaymentCancelPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent motion-reduce:animate-[spin_1.5s_linear_infinite]" />
            <p className="mt-2 text-muted-foreground">Loading...</p>
          </div>
        </div>
      }
    >
      <PaymentCancelContent />
    </Suspense>
  );
}
