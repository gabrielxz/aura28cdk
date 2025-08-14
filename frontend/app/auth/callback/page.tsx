'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthService } from '@/lib/auth/auth-service';
import { useAuth } from '@/lib/auth/use-auth';
import { Suspense } from 'react';

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const { refreshUser } = useAuth();
  const processingRef = useRef(false);
  const processedRef = useRef(false);

  useEffect(() => {
    const handleCallback = async () => {
      // Prevent duplicate processing
      if (processingRef.current || processedRef.current) {
        return;
      }

      processingRef.current = true;

      const code = searchParams.get('code');
      const error = searchParams.get('error');

      // Check if we're already authenticated
      const authService = new AuthService();
      if (authService.hasValidSession()) {
        // Already authenticated, immediately redirect to dashboard
        // Use replace to prevent back button issues
        router.replace('/dashboard');
        return;
      }

      if (error) {
        setError(`Authentication failed: ${error}`);
        // Clean up URL to prevent re-processing on refresh
        window.history.replaceState({}, '', '/auth/callback');
        setTimeout(() => router.replace('/'), 3000);
        processedRef.current = true;
        return;
      }

      if (!code) {
        // No code means user navigated back or directly accessed the page
        // Redirect based on authentication status
        if (authService.isAuthenticated()) {
          router.replace('/dashboard');
        } else {
          router.replace('/');
        }
        processedRef.current = true;
        return;
      }

      // Check if this code has already been processed (stored in sessionStorage)
      const processedCodes = JSON.parse(sessionStorage.getItem('processed_auth_codes') || '[]');
      if (processedCodes.includes(code)) {
        // Code already processed, redirect to dashboard
        router.replace('/dashboard');
        processedRef.current = true;
        return;
      }

      try {
        // Exchange code for tokens
        await authService.handleCallback(code);

        // Mark code as processed
        processedCodes.push(code);
        sessionStorage.setItem('processed_auth_codes', JSON.stringify(processedCodes));

        // Clean up old codes (keep only last 5)
        if (processedCodes.length > 5) {
          processedCodes.shift();
          sessionStorage.setItem('processed_auth_codes', JSON.stringify(processedCodes));
        }

        // Refresh the auth context to pick up the new tokens
        await refreshUser();

        // Clean up URL immediately to remove code from history
        window.history.replaceState({}, '', '/auth/callback');

        // Redirect to dashboard using replace to prevent back button issues
        router.replace('/dashboard');
        processedRef.current = true;
      } catch (err) {
        console.error('Auth callback error:', err);

        // Check for specific error types
        let errorMessage = 'Authentication failed';
        if (err instanceof Error) {
          if (err.message.includes('invalid_grant')) {
            // Code was already used, check if we're authenticated
            if (authService.isAuthenticated()) {
              router.replace('/dashboard');
              processedRef.current = true;
              return;
            }
            errorMessage =
              'Authentication code expired or already used. Please try logging in again.';
          } else {
            errorMessage = err.message;
          }
        }

        setError(errorMessage);
        // Clean up URL to prevent re-processing
        window.history.replaceState({}, '', '/auth/callback');
        setTimeout(() => router.replace('/'), 3000);
        processedRef.current = true;
      } finally {
        processingRef.current = false;
      }
    };

    handleCallback();
  }, [searchParams, router, refreshUser]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        {error ? (
          <>
            <h1 className="mb-4 text-2xl font-bold text-red-600">Authentication Error</h1>
            <p className="mb-4">{error}</p>
            <p className="text-sm text-gray-600">Redirecting to home page...</p>
          </>
        ) : (
          <>
            <h1 className="mb-4 text-2xl font-bold">Authenticating...</h1>
            <p className="mb-2">Please wait while we complete your sign in.</p>
            <div className="mt-4">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent motion-reduce:animate-[spin_1.5s_linear_infinite]" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center">
            <h1 className="mb-4 text-2xl font-bold">Loading...</h1>
          </div>
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
