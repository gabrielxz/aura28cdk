'use client';

import { useEffect } from 'react';
import { useAuth } from '@/lib/auth/use-auth';
import { useRouter } from 'next/navigation';
import StarsBackground from '@/components/StarsBackground';

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
    <div className="relative min-h-screen bg-aura-gradient text-white">
      <StarsBackground />
      <div className="relative z-20 flex min-h-screen items-center justify-center">
        <div className="text-center backdrop-blur-md bg-white/10 border border-white/20 rounded-2xl p-8">
          <h1 className="mb-4 text-2xl font-bold text-[#ffb74d]">Redirecting to login...</h1>
          <p className="text-white/80">Please wait while we redirect you to the login page.</p>
        </div>
      </div>
    </div>
  );
}
