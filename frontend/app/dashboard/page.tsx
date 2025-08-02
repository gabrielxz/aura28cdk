'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/use-auth';
import { AuthService } from '@/lib/auth/auth-service';

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [authService] = useState(() => new AuthService());

  useEffect(() => {
    // Only redirect if we're done loading and there's definitely no user
    if (!loading && !user) {
      // Small delay to prevent race conditions with auth context
      const timer = setTimeout(() => {
        router.push('/login');
      }, 100);
      return () => clearTimeout(timer);
    }

    // Check if user has completed onboarding
    if (!loading && user && !authService.hasCompletedOnboarding(user)) {
      router.push('/onboarding');
    }
  }, [user, loading, router, authService]);

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
      <h1 className="mb-8 text-3xl font-bold">Dashboard</h1>

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
          <div className="space-y-2">
            {user['custom:birthName'] && (
              <p>
                <strong>Birth Name:</strong> {user['custom:birthName']}
              </p>
            )}
            {user['custom:birthDate'] && (
              <p>
                <strong>Birth Date:</strong>{' '}
                {new Date(user['custom:birthDate']).toLocaleDateString()}
              </p>
            )}
            {user['custom:birthTime'] && (
              <p>
                <strong>Birth Time:</strong> {user['custom:birthTime']}
              </p>
            )}
            {user['custom:birthCity'] &&
              user['custom:birthState'] &&
              user['custom:birthCountry'] && (
                <p>
                  <strong>Birth Location:</strong> {user['custom:birthCity']},{' '}
                  {user['custom:birthState']}, {user['custom:birthCountry']}
                </p>
              )}
            {user['custom:birthPlace'] && (
              <p>
                <strong>Birth Place (Legacy):</strong> {user['custom:birthPlace']}
              </p>
            )}
            {user['custom:birthLatitude'] && user['custom:birthLongitude'] && (
              <p>
                <strong>Coordinates:</strong> {user['custom:birthLatitude']},{' '}
                {user['custom:birthLongitude']}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
