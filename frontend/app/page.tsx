'use client';

function HomeContent() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="text-center space-y-6 p-8">
        <h1 className="text-6xl font-bold text-slate-900 dark:text-slate-100">Aura28</h1>
        <p className="text-xl text-slate-600 dark:text-slate-400 max-w-md mx-auto">
          Your personalized astrology readings are on the way.
        </p>
        <p className="text-lg text-slate-600 dark:text-slate-400">
          We&apos;re preparing to launch soon.
        </p>
        <p className="text-base text-slate-500 dark:text-slate-500 mt-8">
          Contact: support@aura28.com
        </p>
      </div>
    </div>
  );
}

export default function Home() {
  return <HomeContent />;
}
