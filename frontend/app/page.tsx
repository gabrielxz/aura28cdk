import StarsBackground from '@/components/StarsBackground';
import LandingHero from '@/components/LandingHero';
import FeatureCards from '@/components/FeatureCards';

export default function Home() {
  return (
    <main className="relative min-h-screen bg-aura-gradient text-white overflow-x-hidden">
      <StarsBackground />
      <LandingHero />
      <FeatureCards />
    </main>
  );
}
