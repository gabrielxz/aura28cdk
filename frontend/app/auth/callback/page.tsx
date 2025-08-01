'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthService } from '@/lib/auth/auth-service';

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const error = searchParams.get('error');

      if (error) {
        setError(`Authentication failed: ${error}`);
        setTimeout(() => router.push('/'), 3000);
        return;
      }

      if (!code) {
        setError('No authorization code received');
        setTimeout(() => router.push('/'), 3000);
        return;
      }

      try {
        const authService = new AuthService();
        await authService.handleCallback(code);
        // Redirect to dashboard after successful auth
        router.push('/dashboard');
      } catch (err) {
        console.error('Auth callback error:', err);
        setError(err instanceof Error ? err.message : 'Authentication failed');
        setTimeout(() => router.push('/'), 3000);
      }
    };

    handleCallback();
  }, [searchParams, router]);

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
            <p>Please wait while we complete your sign in.</p>
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
