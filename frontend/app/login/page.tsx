'use client';

import { useEffect } from 'react';
import { useAuth } from '@/lib/auth/use-auth';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const { login, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) {
      // Already logged in, redirect to dashboard
      router.push('/dashboard');
    } else {
      // Redirect to Cognito login
      login();
    }
  }, [user, login, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="mb-4 text-2xl font-bold">Redirecting to login...</h1>
        <p>Please wait while we redirect you to the login page.</p>
      </div>
    </div>
  );
}
