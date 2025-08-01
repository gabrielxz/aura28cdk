'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth/use-auth';
import { Button } from '@/components/ui/button';

export function Header() {
  const { user, loading, login, logout } = useAuth();

  return (
    <header className="border-b bg-white dark:bg-gray-950">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="text-2xl font-bold">
          Aura28
        </Link>

        <nav className="flex items-center gap-4">
          {user && (
            <Link href="/dashboard" className="text-sm font-medium hover:underline">
              Dashboard
            </Link>
          )}

          {loading ? (
            <Button disabled variant="outline" size="sm">
              Loading...
            </Button>
          ) : user ? (
            <Button onClick={() => logout()} variant="outline" size="sm">
              Logout
            </Button>
          ) : (
            <Button onClick={() => login()} size="sm">
              Login
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
