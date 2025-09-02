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
import AuthenticatedLayout from '@/components/AuthenticatedLayout';
import { Progress } from '@/components/ui/progress';
import { UserApi } from '@/lib/api/user-api';

interface FormData {
  birthCity: string;
  birthState: string;
  birthCountry: string;
  birthDate: string;
  birthTime: string;
  birthName: string;
}

const INITIAL_FORM_DATA: FormData = {
  birthCity: '',
  birthState: '',
  birthCountry: '',
  birthDate: '',
  birthTime: '',
  birthName: '',
};

export default function OnboardingPage() {
  const { user, loading, refreshUser, authService } = useAuth();
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM_DATA);
  const [errors, setErrors] = useState<Partial<FormData>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userApi] = useState(() => new UserApi(authService));

  const totalSteps = 4;
  const progress = (currentStep / totalSteps) * 100;

  useEffect(() => {
    // Only redirect if we're done loading and there's definitely no user
    if (!loading && !user) {
      router.push('/login');
      return;
    }

    // Check if user has already completed onboarding via API
    const checkOnboarding = async () => {
      if (!loading && user) {
        try {
          const hasCompleted = await userApi.hasCompletedOnboarding(user.sub);
          if (hasCompleted) {
            router.push('/dashboard');
          }
        } catch {
          // If error checking, assume onboarding not completed
          console.info('Proceeding with onboarding');
        }
      }
    };

    checkOnboarding();
  }, [user, loading, router, userApi]);

  useEffect(() => {
    // Load saved progress from localStorage
    const savedData = localStorage.getItem('onboarding-progress');
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        setFormData(parsed.formData || INITIAL_FORM_DATA);
        setCurrentStep(parsed.currentStep || 1);
      } catch (error) {
        console.error('Failed to load saved progress:', error);
      }
    }
  }, []);

  const validateStep = (step: number): boolean => {
    const newErrors: Partial<FormData> = {};

    switch (step) {
      case 1:
        if (!formData.birthCity.trim()) newErrors.birthCity = 'City is required';
        if (!formData.birthState.trim()) newErrors.birthState = 'State/Province is required';
        if (!formData.birthCountry.trim()) newErrors.birthCountry = 'Country is required';
        break;
      case 2:
        if (!formData.birthDate) newErrors.birthDate = 'Date is required';
        break;
      case 3:
        if (!formData.birthTime.trim()) newErrors.birthTime = 'Birth time is required';
        break;
      case 4:
        if (!formData.birthName.trim()) newErrors.birthName = 'Full name is required';
        break;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      // Save progress with the new step
      localStorage.setItem(
        'onboarding-progress',
        JSON.stringify({ formData, currentStep: nextStep }),
      );
    }
  };

  const handlePrevious = () => {
    setCurrentStep(currentStep - 1);
  };

  const handleSubmit = async () => {
    if (!validateStep(currentStep)) return;

    setIsSubmitting(true);
    try {
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Birth date is already in ISO format from DatePicker
      const birthDate = formData.birthDate;

      // Prepare profile data for API
      const profileData = {
        email: user.email,
        birthName: formData.birthName,
        birthDate: birthDate,
        birthTime: formData.birthTime,
        birthCity: formData.birthCity,
        birthState: formData.birthState,
        birthCountry: formData.birthCountry,
      };

      // Save profile to DynamoDB via API
      await userApi.updateUserProfile(user.sub, profileData);

      // Clear saved progress
      localStorage.removeItem('onboarding-progress');

      // Refresh the user data to get updated attributes
      await refreshUser();

      // Small delay to ensure data is propagated
      setTimeout(() => {
        router.push('/dashboard');
      }, 500);
    } catch (error) {
      console.error('Failed to save profile:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to save profile';

      if (errorMessage.includes('Could not find a valid location')) {
        setErrors({
          birthCity:
            'We could not verify this location. Please check the city, state, and country.',
        });
        setCurrentStep(1); // Go back to the location step
      } else {
        setErrors({ birthName: `${errorMessage}. Please try again.` });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateFormData = (field: keyof FormData, value: string) => {
    setFormData({ ...formData, [field]: value });
    setErrors({ ...errors, [field]: undefined });
  };

  if (loading) {
    return (
      <AuthenticatedLayout>
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center">
            <h1 className="mb-4 text-2xl font-bold text-white">Loading...</h1>
          </div>
        </div>
      </AuthenticatedLayout>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <AuthenticatedLayout>
      <div className="container mx-auto max-w-2xl p-8">
        <Card className="w-full bg-white/10 backdrop-blur-md border border-white/20">
          <CardHeader>
            <CardTitle className="text-white">Complete Your Profile</CardTitle>
            <CardDescription className="text-white/70">
              We need some birth information to create your personalized horoscope readings.
            </CardDescription>
            <Progress
              value={progress}
              className="mt-4 bg-white/10 [&>div]:bg-gradient-to-r [&>div]:from-[#ff8a65] [&>div]:to-[#ffb74d]"
            />
          </CardHeader>
          <CardContent>
            {currentStep === 1 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-[#ffb74d]">Birth Location</h3>
                <div>
                  <Label htmlFor="birthCity" className="text-white/90">
                    City
                  </Label>
                  <Input
                    id="birthCity"
                    type="text"
                    value={formData.birthCity}
                    onChange={(e) => updateFormData('birthCity', e.target.value)}
                    placeholder="e.g., San Francisco"
                    className={`bg-white/10 border-white/20 text-white placeholder:text-white/50 ${errors.birthCity ? 'border-red-500' : ''}`}
                  />
                  {errors.birthCity && (
                    <p className="mt-1 text-sm text-red-400">{errors.birthCity}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="birthState" className="text-white/90">
                    State/Province
                  </Label>
                  <Input
                    id="birthState"
                    type="text"
                    value={formData.birthState}
                    onChange={(e) => updateFormData('birthState', e.target.value)}
                    placeholder="e.g., California"
                    className={`bg-white/10 border-white/20 text-white placeholder:text-white/50 ${errors.birthState ? 'border-red-500' : ''}`}
                  />
                  {errors.birthState && (
                    <p className="mt-1 text-sm text-red-400">{errors.birthState}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="birthCountry" className="text-white/90">
                    Country
                  </Label>
                  <Input
                    id="birthCountry"
                    type="text"
                    value={formData.birthCountry}
                    onChange={(e) => updateFormData('birthCountry', e.target.value)}
                    placeholder="e.g., United States"
                    className={`bg-white/10 border-white/20 text-white placeholder:text-white/50 ${errors.birthCountry ? 'border-red-500' : ''}`}
                  />
                  {errors.birthCountry && (
                    <p className="mt-1 text-sm text-red-400">{errors.birthCountry}</p>
                  )}
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-[#ffb74d]">Birth Date</h3>
                <div>
                  <Label htmlFor="birthDate" className="text-white/90">
                    Date of Birth
                  </Label>
                  <DatePicker
                    id="birthDate"
                    value={formData.birthDate}
                    onChange={(date) => updateFormData('birthDate', date || '')}
                    placeholder="Select your birth date"
                    className={errors.birthDate ? 'border-red-500' : ''}
                  />
                  {errors.birthDate && (
                    <p className="mt-1 text-sm text-red-400">{errors.birthDate}</p>
                  )}
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-[#ffb74d]">Birth Time</h3>
                <p className="text-sm text-white/70">
                  Your exact birth time is required for accurate astrological calculations.
                </p>
                <div>
                  <Label htmlFor="birthTime" className="text-white/90">
                    Time of Birth
                  </Label>
                  <TimePicker
                    id="birthTime"
                    value={formData.birthTime}
                    onChange={(time) => updateFormData('birthTime', time)}
                    placeholder="Select birth time"
                    className={errors.birthTime ? 'border-red-500' : ''}
                  />
                  {errors.birthTime && (
                    <p className="mt-1 text-sm text-red-400">{errors.birthTime}</p>
                  )}
                </div>
              </div>
            )}

            {currentStep === 4 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-[#ffb74d]">Full Birth Name</h3>
                <p className="text-sm text-white/70">
                  Please enter your full name as it appears on your birth certificate.
                </p>
                <div>
                  <Label htmlFor="birthName" className="text-white/90">
                    Full Name
                  </Label>
                  <Input
                    id="birthName"
                    type="text"
                    value={formData.birthName}
                    onChange={(e) => updateFormData('birthName', e.target.value)}
                    placeholder="e.g., John Michael Smith"
                    className={`bg-white/10 border-white/20 text-white placeholder:text-white/50 ${errors.birthName ? 'border-red-500' : ''}`}
                  />
                  {errors.birthName && (
                    <p className="mt-1 text-sm text-red-400">{errors.birthName}</p>
                  )}
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-between">
              {currentStep > 1 && (
                <Button
                  variant="outline"
                  onClick={handlePrevious}
                  className="border-white/20 text-white hover:bg-white/10"
                >
                  Previous
                </Button>
              )}
              <div className="ml-auto">
                {currentStep < totalSteps ? (
                  <Button
                    onClick={handleNext}
                    className="bg-gradient-to-r from-[#ff8a65] to-[#ffb74d] text-[#1a1b3a] hover:opacity-90"
                  >
                    Next
                  </Button>
                ) : (
                  <Button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="bg-gradient-to-r from-[#ff8a65] to-[#ffb74d] text-[#1a1b3a] hover:opacity-90 disabled:opacity-50"
                  >
                    {isSubmitting ? 'Saving...' : 'Complete Profile'}
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AuthenticatedLayout>
  );
}
