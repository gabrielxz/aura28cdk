'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { AuthService } from '@/lib/auth/auth-service';

interface FormData {
  birthCity: string;
  birthState: string;
  birthCountry: string;
  birthMonth: string;
  birthDay: string;
  birthYear: string;
  birthTime: string;
  birthName: string;
}

const INITIAL_FORM_DATA: FormData = {
  birthCity: '',
  birthState: '',
  birthCountry: '',
  birthMonth: '',
  birthDay: '',
  birthYear: '',
  birthTime: '',
  birthName: '',
};

export default function OnboardingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM_DATA);
  const [errors, setErrors] = useState<Partial<FormData>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authService] = useState(() => new AuthService());

  const totalSteps = 4;
  const progress = (currentStep / totalSteps) * 100;

  useEffect(() => {
    // Only redirect if we're done loading and there's definitely no user
    if (!loading && !user) {
      router.push('/login');
      return;
    }

    // If user has already completed onboarding, redirect to dashboard
    if (!loading && user && authService.hasCompletedOnboarding(user)) {
      router.push('/dashboard');
    }
  }, [user, loading, router, authService]);

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
        if (!formData.birthMonth) newErrors.birthMonth = 'Month is required';
        if (!formData.birthDay) newErrors.birthDay = 'Day is required';
        if (!formData.birthYear) newErrors.birthYear = 'Year is required';

        // Validate date
        const month = parseInt(formData.birthMonth);
        const day = parseInt(formData.birthDay);
        const year = parseInt(formData.birthYear);

        if (month < 1 || month > 12) newErrors.birthMonth = 'Invalid month';
        if (day < 1 || day > 31) newErrors.birthDay = 'Invalid day';
        if (year < 1900 || year > new Date().getFullYear()) newErrors.birthYear = 'Invalid year';
        break;
      case 3:
        // Birth time is optional, no validation needed
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
      // Format birth date as ISO string
      const birthDate = `${formData.birthYear}-${formData.birthMonth.padStart(2, '0')}-${formData.birthDay.padStart(2, '0')}`;

      // Prepare attributes for Cognito
      const attributes: Record<string, string> = {
        'custom:birthCity': formData.birthCity,
        'custom:birthState': formData.birthState,
        'custom:birthCountry': formData.birthCountry,
        'custom:birthDate': birthDate,
        'custom:birthName': formData.birthName,
      };

      // Only add birth time if provided
      if (formData.birthTime) {
        attributes['custom:birthTime'] = formData.birthTime;
      }

      // Update user attributes in Cognito
      await authService.updateUserAttributes(attributes);

      // Clear saved progress
      localStorage.removeItem('onboarding-progress');

      // Redirect to dashboard
      router.push('/dashboard');
    } catch (error) {
      console.error('Failed to save profile:', error);
      setErrors({ birthName: 'Failed to save profile. Please try again.' });
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
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Complete Your Profile</CardTitle>
          <CardDescription>
            We need some birth information to create your personalized horoscope readings.
          </CardDescription>
          <Progress value={progress} className="mt-4" />
        </CardHeader>
        <CardContent>
          {currentStep === 1 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Birth Location</h3>
              <div>
                <Label htmlFor="birthCity">City</Label>
                <Input
                  id="birthCity"
                  type="text"
                  value={formData.birthCity}
                  onChange={(e) => updateFormData('birthCity', e.target.value)}
                  placeholder="e.g., San Francisco"
                  className={errors.birthCity ? 'border-red-500' : ''}
                />
                {errors.birthCity && (
                  <p className="mt-1 text-sm text-red-500">{errors.birthCity}</p>
                )}
              </div>
              <div>
                <Label htmlFor="birthState">State/Province</Label>
                <Input
                  id="birthState"
                  type="text"
                  value={formData.birthState}
                  onChange={(e) => updateFormData('birthState', e.target.value)}
                  placeholder="e.g., California"
                  className={errors.birthState ? 'border-red-500' : ''}
                />
                {errors.birthState && (
                  <p className="mt-1 text-sm text-red-500">{errors.birthState}</p>
                )}
              </div>
              <div>
                <Label htmlFor="birthCountry">Country</Label>
                <Input
                  id="birthCountry"
                  type="text"
                  value={formData.birthCountry}
                  onChange={(e) => updateFormData('birthCountry', e.target.value)}
                  placeholder="e.g., United States"
                  className={errors.birthCountry ? 'border-red-500' : ''}
                />
                {errors.birthCountry && (
                  <p className="mt-1 text-sm text-red-500">{errors.birthCountry}</p>
                )}
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Birth Date</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="birthMonth">Month</Label>
                  <Input
                    id="birthMonth"
                    type="number"
                    min="1"
                    max="12"
                    value={formData.birthMonth}
                    onChange={(e) => updateFormData('birthMonth', e.target.value)}
                    placeholder="MM"
                    className={errors.birthMonth ? 'border-red-500' : ''}
                  />
                  {errors.birthMonth && (
                    <p className="mt-1 text-sm text-red-500">{errors.birthMonth}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="birthDay">Day</Label>
                  <Input
                    id="birthDay"
                    type="number"
                    min="1"
                    max="31"
                    value={formData.birthDay}
                    onChange={(e) => updateFormData('birthDay', e.target.value)}
                    placeholder="DD"
                    className={errors.birthDay ? 'border-red-500' : ''}
                  />
                  {errors.birthDay && (
                    <p className="mt-1 text-sm text-red-500">{errors.birthDay}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="birthYear">Year</Label>
                  <Input
                    id="birthYear"
                    type="number"
                    min="1900"
                    max={new Date().getFullYear()}
                    value={formData.birthYear}
                    onChange={(e) => updateFormData('birthYear', e.target.value)}
                    placeholder="YYYY"
                    className={errors.birthYear ? 'border-red-500' : ''}
                  />
                  {errors.birthYear && (
                    <p className="mt-1 text-sm text-red-500">{errors.birthYear}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Birth Time</h3>
              <p className="text-sm text-gray-600">
                Your birth time helps us create more accurate readings. If you don&apos;t know your
                exact birth time, you can leave this blank.
              </p>
              <div>
                <Label htmlFor="birthTime">Time of Birth (optional)</Label>
                <Input
                  id="birthTime"
                  type="time"
                  value={formData.birthTime}
                  onChange={(e) => updateFormData('birthTime', e.target.value)}
                  placeholder="HH:MM"
                />
              </div>
            </div>
          )}

          {currentStep === 4 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Full Birth Name</h3>
              <p className="text-sm text-gray-600">
                Please enter your full name as it appears on your birth certificate.
              </p>
              <div>
                <Label htmlFor="birthName">Full Name</Label>
                <Input
                  id="birthName"
                  type="text"
                  value={formData.birthName}
                  onChange={(e) => updateFormData('birthName', e.target.value)}
                  placeholder="e.g., John Michael Smith"
                  className={errors.birthName ? 'border-red-500' : ''}
                />
                {errors.birthName && (
                  <p className="mt-1 text-sm text-red-500">{errors.birthName}</p>
                )}
              </div>
            </div>
          )}

          <div className="mt-6 flex justify-between">
            {currentStep > 1 && (
              <Button variant="outline" onClick={handlePrevious}>
                Previous
              </Button>
            )}
            <div className="ml-auto">
              {currentStep < totalSteps ? (
                <Button onClick={handleNext}>Next</Button>
              ) : (
                <Button onClick={handleSubmit} disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : 'Complete Profile'}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
