'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/use-auth';
import { Button } from '@/components/ui/button';

export default function DashboardPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="mb-4 text-2xl font-bold">Loading...</h1>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="container mx-auto max-w-4xl p-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <Button onClick={() => logout()} variant="outline">
          Logout
        </Button>
      </div>

      <div className="rounded-lg bg-gray-50 p-6 dark:bg-gray-900">
        <h2 className="mb-4 text-xl font-semibold">Welcome, {user.email}!</h2>

        <div className="space-y-2">
          <p>
            <strong>User ID:</strong> {user.sub}
          </p>
          <p>
            <strong>Email:</strong> {user.email}
          </p>
          <p>
            <strong>Email Verified:</strong> {user.email_verified ? 'Yes' : 'No'}
          </p>
          {user.given_name && (
            <p>
              <strong>First Name:</strong> {user.given_name}
            </p>
          )}
          {user.family_name && (
            <p>
              <strong>Last Name:</strong> {user.family_name}
            </p>
          )}
        </div>

        <div className="mt-6">
          <h3 className="mb-2 text-lg font-semibold">Birth Information</h3>
          {user['custom:birthTime'] || user['custom:birthPlace'] ? (
            <div className="space-y-2">
              {user['custom:birthTime'] && (
                <p>
                  <strong>Birth Time:</strong> {user['custom:birthTime']}
                </p>
              )}
              {user['custom:birthPlace'] && (
                <p>
                  <strong>Birth Place:</strong> {user['custom:birthPlace']}
                </p>
              )}
              {user['custom:birthLatitude'] && (
                <p>
                  <strong>Birth Latitude:</strong> {user['custom:birthLatitude']}
                </p>
              )}
              {user['custom:birthLongitude'] && (
                <p>
                  <strong>Birth Longitude:</strong> {user['custom:birthLongitude']}
                </p>
              )}
            </div>
          ) : (
            <p className="text-gray-600">No birth information provided yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
