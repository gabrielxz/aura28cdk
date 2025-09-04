'use client';

import { ReactNode } from 'react';
import StarsBackground from './StarsBackground';

interface AuthenticatedLayoutProps {
  children: ReactNode;
  showStars?: boolean;
}

export default function AuthenticatedLayout({
  children,
  showStars = true,
}: AuthenticatedLayoutProps) {
  return (
    <div className="relative min-h-screen bg-aura-gradient text-white">
      {showStars && <StarsBackground />}
      <div className="relative z-20">{children}</div>
    </div>
  );
}
