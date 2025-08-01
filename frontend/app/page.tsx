'use client';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/use-auth';
import { useRouter } from 'next/navigation';

export default function Home() {
  const { user, login } = useAuth();
  const router = useRouter();

  const handleGetStarted = () => {
    if (user) {
      router.push('/dashboard');
    } else {
      login();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="text-center space-y-8 p-8">
        <h1 className="text-6xl font-bold text-slate-900 dark:text-slate-100">Hello Carri</h1>
        <p className="text-xl text-slate-600 dark:text-slate-400 max-w-md mx-auto">
          Welcome to Aura28 - Built with Next.js, TypeScript, Tailwind CSS, and deployed with AWS
          CDK
        </p>
        <div className="flex gap-4 justify-center">
          <Button variant="default" size="lg" onClick={handleGetStarted}>
            Get Started
          </Button>
          <Button variant="outline" size="lg">
            Learn More
          </Button>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-500 mt-8">
          Features: User authentication with AWS Cognito, coming soon: OpenAI integration, Stripe
          payments, and more!
        </p>
      </div>
    </div>
  );
}
