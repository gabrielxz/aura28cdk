'use client';

import { useEffect } from 'react';
import { useAuth } from '@/lib/auth/use-auth';

export default function LogoutPage() {
  const { logout } = useAuth();

  useEffect(() => {
    logout();
  }, [logout]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="mb-4 text-2xl font-bold">Logging out...</h1>
        <p>Please wait while we log you out.</p>
      </div>
    </div>
  );
}
