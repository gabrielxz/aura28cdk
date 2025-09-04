'use client';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';

export default function LandingHero() {
  const router = useRouter();

  return (
    <section className="relative z-20 flex flex-col items-center justify-center min-h-screen text-center px-6 pt-24">
      <div className="mb-12 relative">
        <div className="w-48 h-48 animate-float mx-auto">
          <Image
            src="/starCircleLogo.png"
            alt="Aura28 Logo"
            width={192}
            height={192}
            priority
            className="rounded-full shadow-2xl object-contain"
          />
        </div>
      </div>
      <h1 className="text-5xl md:text-6xl font-light bg-gradient-to-r from-white to-[#ffb74d] bg-clip-text text-transparent mb-6">
        Your Personal Blueprint Revealed
      </h1>
      <p className="text-lg md:text-xl opacity-90 max-w-xl font-light mb-8">
        A reflection of yourself like you&apos;ve never seen before
      </p>
      <p className="text-base max-w-2xl opacity-80 leading-relaxed mb-10">
        This isn&apos;t some generic feel-good spiel or vague horoscope. This is a clear, honest
        reflection of your unique strengths, challenges, and the unseen patterns that quietly guide
        your life — often without you realizing it.
      </p>
      <Button
        onClick={() => router.push('/login')}
        className="bg-gradient-to-r from-[#ff8a65] to-[#ffb74d] text-[#1a1b3a] px-8 py-3 rounded-full font-semibold text-lg shadow-xl hover:translate-y-[-2px] transition-transform"
      >
        Discover Your Blueprint
      </Button>
    </section>
  );
}
