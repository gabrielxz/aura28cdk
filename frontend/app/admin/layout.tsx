'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/use-auth';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, authService } = useAuth();
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    if (!loading) {
      if (!user) {
        // Not logged in, redirect to login
        router.push('/login');
      } else if (!authService.isAdmin()) {
        // Logged in but not admin, redirect to dashboard
        router.push('/dashboard');
      } else {
        // User is admin, show content
        setIsAuthorized(true);
      }
    }
  }, [user, loading, authService, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
          <p className="mt-4 text-muted-foreground">Verifying admin access...</p>
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    return null; // Will redirect, so don't show anything
  }

  return <>{children}</>;
}
