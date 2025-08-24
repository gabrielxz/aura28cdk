'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth/use-auth';
import { UserApi, UserProfileResponse } from '@/lib/api/user-api';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import NatalChartTab from './natal-chart-tab';
import ReadingsTab from './readings-tab';
import { useToast } from '@/components/ui/use-toast';

export default function DashboardClient() {
  const { user, isAdmin, loading, authService } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [userApi] = useState(() => new UserApi(authService));
  const [profile, setProfile] = useState<UserProfileResponse | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('profile');

  // Handle payment success/cancel URL parameters
  useEffect(() => {
    // Only process payment parameters if user is authenticated
    if (loading || !user) {
      return;
    }

    const tab = searchParams.get('tab');
    const payment = searchParams.get('payment');

    // Set the active tab if specified in URL
    if (tab === 'readings') {
      setActiveTab('readings');
    }

    // Show payment status messages
    if (payment === 'success') {
      toast({
        title: 'Payment Successful',
        description: 'Your payment was successful! Your reading will be generated shortly.',
      });
      // Clean up URL parameters
      router.replace('/dashboard?tab=readings');
    } else if (payment === 'cancelled') {
      toast({
        title: 'Payment Cancelled',
        description: 'Your payment was cancelled. You can try again whenever you are ready.',
      });
      // Clean up URL parameters
      router.replace('/dashboard?tab=readings');
    }
  }, [searchParams, router, toast, user, loading]);

  useEffect(() => {
    // Only redirect if we're done loading and there's definitely no user
    if (!loading && !user) {
      // Small delay to prevent race conditions with auth context
      const timer = setTimeout(() => {
        router.push('/login');
      }, 100);
      return () => clearTimeout(timer);
    }

    // Fetch user profile from API
    const fetchProfile = async () => {
      if (!loading && user) {
        try {
          setProfileLoading(true);
          const userProfile = await userApi.getUserProfile(user.sub);
          setProfile(userProfile);
          setProfileError(null);
        } catch (error) {
          setProfileError('Failed to load profile');
          // If profile not found, redirect to onboarding
          if (error instanceof Error && error.message.includes('Profile not found')) {
            router.push('/onboarding');
          }
        } finally {
          setProfileLoading(false);
        }
      }
    };

    fetchProfile();
  }, [user, loading, router, userApi]);

  if (loading || profileLoading) {
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
      <h1 className="mb-4 text-3xl font-bold">Dashboard</h1>
      <h2 className="mb-8 text-xl text-gray-600 dark:text-gray-400">
        Welcome back, {isAdmin ? 'Admin ' : ''}
        {profile?.profile.birthName || user.email}!
      </h2>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="natal-chart">Natal Chart</TabsTrigger>
          <TabsTrigger value="readings">Readings</TabsTrigger>
        </TabsList>
        <TabsContent value="profile">
          <div className="mt-6 rounded-lg bg-gray-50 p-6 dark:bg-gray-900">
            <h3 className="mb-4 text-xl font-semibold">User Profile</h3>
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
            </div>

            {profileError && (
              <div className="mt-4 rounded-lg bg-red-50 p-4 text-red-600">
                <p>{profileError}</p>
              </div>
            )}

            {profile && (
              <div className="mt-6">
                <h3 className="mb-2 text-lg font-semibold">Birth Information</h3>
                <div className="space-y-2">
                  <p>
                    <strong>Birth Name:</strong> {profile.profile.birthName}
                  </p>
                  <p>
                    <strong>Birth Date:</strong>{' '}
                    {new Date(profile.profile.birthDate).toLocaleDateString('en-US', {
                      timeZone: 'UTC',
                    })}
                  </p>
                  {profile.profile.birthTime && (
                    <p>
                      <strong>Birth Time:</strong> {profile.profile.birthTime}
                    </p>
                  )}
                  <p>
                    <strong>Birth Location:</strong> {profile.profile.standardizedLocationName}
                  </p>
                  <p className="mt-2 text-sm text-gray-500">
                    <strong>Profile Updated:</strong> {new Date(profile.updatedAt).toLocaleString()}
                  </p>
                </div>
              </div>
            )}
          </div>
        </TabsContent>
        <TabsContent value="natal-chart">
          <NatalChartTab userApi={userApi} userId={user.sub} />
        </TabsContent>
        <TabsContent value="readings">
          <ReadingsTab userApi={userApi} userId={user.sub} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
