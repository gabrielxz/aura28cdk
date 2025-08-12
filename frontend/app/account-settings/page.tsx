'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { TimePicker } from '@/components/ui/time-picker';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { UserApi, UserProfile } from '@/lib/api/user-api';
import { useToast } from '@/components/ui/use-toast';

interface FormData {
  birthName: string;
  birthDate: string;
  birthTime: string;
  birthCity: string;
  birthState: string;
  birthCountry: string;
  standardizedLocationName?: string;
}

export default function AccountSettingsPage() {
  const { user, loading, authService } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [userApi] = useState(() => new UserApi(authService));
  const [formData, setFormData] = useState<FormData>({
    birthName: '',
    birthDate: '',
    birthTime: '',
    birthCity: '',
    birthState: '',
    birthCountry: '',
  });
  const [originalFormData, setOriginalFormData] = useState<FormData>({
    birthName: '',
    birthDate: '',
    birthTime: '',
    birthCity: '',
    birthState: '',
    birthCountry: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [standardizedLocationName, setStandardizedLocationName] = useState<string | undefined>(
    undefined,
  );

  // Check if form has been modified
  const isFormModified = () => {
    return JSON.stringify(formData) !== JSON.stringify(originalFormData);
  };

  useEffect(() => {
    // Only redirect if we're done loading and there's definitely no user
    if (!loading && !user) {
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
          setProfileError(null);

          // Populate form with existing data
          const formDataFromProfile: FormData = {
            birthName: userProfile.profile.birthName || '',
            birthDate: userProfile.profile.birthDate || '',
            birthTime: userProfile.profile.birthTime || '',
            birthCity: userProfile.profile.birthCity || '',
            birthState: userProfile.profile.birthState || '',
            birthCountry: userProfile.profile.birthCountry || '',
          };
          setFormData(formDataFromProfile);
          setOriginalFormData(formDataFromProfile);
          setStandardizedLocationName(userProfile.profile.standardizedLocationName);
        } catch (error) {
          console.error('Failed to fetch profile:', error);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !isFormModified()) return;

    setIsSubmitting(true);
    try {
      const profileData: UserProfile = {
        email: user.email,
        birthName: formData.birthName,
        birthDate: formData.birthDate,
        birthTime: formData.birthTime,
        birthCity: formData.birthCity,
        birthState: formData.birthState,
        birthCountry: formData.birthCountry,
      };

      const response = await userApi.updateUserProfile(user.sub, profileData);

      // Update the original form data to match the saved data
      setOriginalFormData(formData);
      setStandardizedLocationName(response.profile.profile.standardizedLocationName);

      // Show success toast
      toast({
        title: 'Success',
        description: 'Your changes have been saved successfully.',
        variant: 'default',
      });
    } catch (error) {
      console.error('Failed to update profile:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save changes',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

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
    <div className="container mx-auto max-w-2xl p-8">
      <h1 className="mb-8 text-3xl font-bold">Account Settings</h1>

      {profileError && (
        <div className="mb-4 rounded-lg bg-red-50 p-4 text-red-600">
          <p>{profileError}</p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Profile Information</CardTitle>
          <CardDescription>Update your personal information</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label htmlFor="birthName">Full Name</Label>
              <Input
                id="birthName"
                type="text"
                value={formData.birthName}
                onChange={(e) => handleInputChange('birthName', e.target.value)}
                required
              />
            </div>

            <div>
              <Label htmlFor="birthDate">Date of Birth</Label>
              <DatePicker
                id="birthDate"
                value={formData.birthDate}
                onChange={(date) => handleInputChange('birthDate', date || '')}
                placeholder="Select your birth date"
              />
            </div>

            <div>
              <Label htmlFor="birthTime">Time of Birth</Label>
              <TimePicker
                id="birthTime"
                value={formData.birthTime}
                onChange={(time) => handleInputChange('birthTime', time)}
                placeholder="Select birth time"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label htmlFor="birthCity">City</Label>
                <Input
                  id="birthCity"
                  type="text"
                  value={formData.birthCity}
                  onChange={(e) => handleInputChange('birthCity', e.target.value)}
                  required
                />
              </div>

              <div>
                <Label htmlFor="birthState">State/Province</Label>
                <Input
                  id="birthState"
                  type="text"
                  value={formData.birthState}
                  onChange={(e) => handleInputChange('birthState', e.target.value)}
                  required
                />
              </div>

              <div>
                <Label htmlFor="birthCountry">Country</Label>
                <Input
                  id="birthCountry"
                  type="text"
                  value={formData.birthCountry}
                  onChange={(e) => handleInputChange('birthCountry', e.target.value)}
                  required
                />
              </div>
            </div>

            {standardizedLocationName && (
              <div>
                <Label htmlFor="verifiedLocation">Verified Location</Label>
                <Input
                  id="verifiedLocation"
                  type="text"
                  value={standardizedLocationName}
                  disabled
                  className="bg-gray-100"
                />
              </div>
            )}

            <Button
              type="submit"
              disabled={isSubmitting || !isFormModified() || !formData.birthTime}
              className="w-full"
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
