'use client';

import { useEffect } from 'react';
import { useAuth } from '@/lib/auth/use-auth';
import StarsBackground from '@/components/StarsBackground';

export default function LogoutPage() {
  const { logout } = useAuth();

  useEffect(() => {
    logout();
  }, [logout]);

  return (
    <div className="relative min-h-screen bg-aura-gradient text-white">
      <StarsBackground />
      <div className="relative z-20 flex min-h-screen items-center justify-center">
        <div className="text-center backdrop-blur-md bg-white/10 border border-white/20 rounded-2xl p-8">
          <h1 className="mb-4 text-2xl font-bold text-[#ffb74d]">Logging out...</h1>
          <p className="text-white/80">Please wait while we log you out.</p>
        </div>
      </div>
    </div>
  );
}
