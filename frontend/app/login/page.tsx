'use client';

import { useEffect } from 'react';
import { useAuth } from '@/lib/auth/use-auth';
import { useRouter } from 'next/navigation';
import StarsBackground from '@/components/StarsBackground';
import { GoogleSignInButton } from '@/components/ui/google-signin-button';
import { AuthService } from '@/lib/auth/auth-service';

export default function LoginPage() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) {
      // Already logged in, redirect to dashboard
      router.push('/dashboard');
    }
  }, [user, router]);

  const handleEmailSignIn = () => {
    const authService = new AuthService();
    authService.redirectToLogin();
  };

  if (user) {
    return (
      <div className="relative min-h-screen bg-aura-gradient text-white">
        <StarsBackground />
        <div className="relative z-20 flex min-h-screen items-center justify-center">
          <div className="text-center backdrop-blur-md bg-white/10 border border-white/20 rounded-2xl p-8">
            <h1 className="mb-4 text-2xl font-bold text-[#ffb74d]">Redirecting...</h1>
            <p className="text-white/80">Please wait while we redirect you to the dashboard.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-aura-gradient text-white">
      <StarsBackground />
      <div className="relative z-20 flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="backdrop-blur-md bg-white/10 border border-white/20 rounded-2xl p-8">
            {/* Header */}
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-[#ffb74d] mb-2">Welcome to Aura 28</h1>
              <p className="text-white/80">Sign in to access your soul blueprint</p>
            </div>

            {/* Sign-in Options */}
            <div className="space-y-4">
              {/* Google Sign-in */}
              <GoogleSignInButton />

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/20"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="bg-gray-900/50 px-4 text-white/60">Or</span>
                </div>
              </div>

              {/* Email/Password Sign-in */}
              <button
                onClick={handleEmailSignIn}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 
                  bg-purple-600/20 backdrop-blur-sm border border-purple-500/30 rounded-lg 
                  hover:bg-purple-600/30 hover:border-purple-500/50 
                  transition-all duration-200 text-white font-medium
                  focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:ring-offset-2 
                  focus:ring-offset-gray-900"
                aria-label="Sign in with email"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207"
                  />
                </svg>
                <span>Continue with Email</span>
              </button>
            </div>

            {/* Footer */}
            <div className="mt-8 text-center text-sm text-white/60">
              <p>
                By signing in, you agree to our{' '}
                <a href="#" className="text-purple-400 hover:text-purple-300 transition-colors">
                  Terms of Service
                </a>{' '}
                and{' '}
                <a href="#" className="text-purple-400 hover:text-purple-300 transition-colors">
                  Privacy Policy
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
