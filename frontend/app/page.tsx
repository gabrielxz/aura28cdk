'use client';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/use-auth';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';

function HomeContent() {
  const { user, login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    // Check for auth errors from the callback
    const error = searchParams.get('auth_error');
    const errorDescription = searchParams.get('error_description');

    if (error) {
      setAuthError(errorDescription || 'Authentication failed. Please try again.');

      // Clear the error from the URL after displaying it
      const url = new URL(window.location.href);
      url.searchParams.delete('auth_error');
      url.searchParams.delete('error_description');
      window.history.replaceState({}, '', url.pathname);

      // Clear the error after 10 seconds
      setTimeout(() => setAuthError(null), 10000);
    }
  }, [searchParams]);

  const handleGetStarted = () => {
    if (user) {
      router.push('/dashboard');
    } else {
      login();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="text-center space-y-8 p-8">
        {authError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg max-w-md mx-auto">
            <p className="text-sm">{authError}</p>
          </div>
        )}
        <h1 className="text-6xl font-bold text-slate-900 dark:text-slate-100">Hello Carri</h1>
        <p className="text-xl text-slate-600 dark:text-slate-400 max-w-md mx-auto">
          Welcome to Aura28 - Built with Next.js, TypeScript, Tailwind CSS, and deployed with AWS
          CDK
        </p>
        <div className="flex gap-4 justify-center">
          <Button variant="default" size="lg" onClick={handleGetStarted}>
            Get Started
          </Button>
          <Button variant="outline" size="lg">
            Learn More
          </Button>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-500 mt-8">
          Features: User authentication with AWS Cognito, coming soon: OpenAI integration, Stripe
          payments, and more!
        </p>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
          <div className="text-center">
            <h1 className="text-2xl font-bold">Loading...</h1>
          </div>
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
