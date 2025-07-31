import { Button } from '@/components/ui/button';

export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="text-center space-y-8 p-8">
        <h1 className="text-6xl font-bold text-slate-900 dark:text-slate-100">Hello Carri</h1>
        <p className="text-xl text-slate-600 dark:text-slate-400 max-w-md mx-auto">
          Welcome to Aura28 - Built with Next.js, TypeScript, Tailwind CSS, and deployed with AWS
          CDK
        </p>
        <div className="flex gap-4 justify-center">
          <Button variant="default" size="lg">
            Get Started
          </Button>
          <Button variant="outline" size="lg">
            Learn More
          </Button>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-500 mt-8">
          Coming soon: User authentication, OpenAI integration, Stripe payments, and more!
        </p>
      </div>
    </div>
  );
}
