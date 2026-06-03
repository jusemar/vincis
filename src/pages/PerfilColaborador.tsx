import { useEffect } from 'react';
import HeroSection from '@/sections/perfil-colaborador/HeroSection';
import AboutSection from '@/sections/perfil-colaborador/AboutSection';
import ServicesSection from '@/sections/perfil-colaborador/ServicesSection';
import CasesSection from '@/sections/perfil-colaborador/CasesSection';
import TimelineSection from '@/sections/perfil-colaborador/TimelineSection';
import FAQSection from '@/sections/perfil-colaborador/FAQSection';
import ReviewsSection from '@/sections/perfil-colaborador/ReviewsSection';
import ProfileCard from '@/components/perfil-colaborador/ProfileCard';
import Footer from '@/sections/Footer';

export function PerfilColaborador() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div
      className="min-h-screen font-[Inter,system-ui,-apple-system,sans-serif]"
      style={{
        paddingTop: 72,
        background: `
          radial-gradient(circle at 10% 0%, rgba(246,200,95,.20), transparent 28%),
          radial-gradient(circle at 90% 0%, rgba(109,93,252,.12), transparent 30%),
          #fbfaf7
        `,
        color: '#171412',
      }}
    >
      <HeroSection />

      <main
        className="mx-auto"
        style={{ maxWidth: 1180, width: 'calc(100% - 32px)', padding: '34px 0 76px' }}
      >
        <div
          className="grid grid-cols-1 lg:grid-cols-[minmax(0,720px)_360px] gap-[18px] items-start"
        >
          {/* Content sections first in DOM for desktop grid flow */}
          <div className="space-y-[22px]" style={{ maxWidth: 720, marginTop: 30 }}>
            <AboutSection />
            <ServicesSection />
            <CasesSection />
            <TimelineSection />
            <FAQSection />
            <ReviewsSection />
          </div>

          {/* Profile card - appears first on mobile via order-first */}
          <aside className="order-first lg:order-none max-w-[520px] lg:max-w-none mx-auto lg:mx-0">
            <ProfileCard />
          </aside>
        </div>
      </main>
      <Footer />
    </div>
  );
}
