import { Metadata } from 'next';
import { LegalPageLayout } from '@/components/legal/legal-page-layout';
import { termsOfService } from '@/lib/legal/legal-content';

export const metadata: Metadata = {
  title: 'Terms of Service - Aura28',
  description:
    'Terms of Service for Aura28 astrology reading service. Learn about your rights, responsibilities, and our service agreements.',
  openGraph: {
    title: 'Terms of Service - Aura28',
    description: 'Terms of Service for Aura28 astrology reading service',
    type: 'website',
  },
};

export default function TermsOfServicePage() {
  return (
    <LegalPageLayout document={termsOfService}>
      <div className="space-y-8">
        {termsOfService.sections.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-20">
            <h2 className="text-2xl font-semibold mb-4">{section.title}</h2>
            <div className="space-y-4">
              {section.content.map((paragraph, index) => (
                <p key={index} className="text-base leading-relaxed text-muted-foreground">
                  {paragraph}
                </p>
              ))}
            </div>
            {section.subsections && (
              <div className="mt-6 space-y-6">
                {section.subsections.map((subsection) => (
                  <div key={subsection.id} id={subsection.id} className="scroll-mt-20">
                    <h3 className="text-lg font-medium mb-3">{subsection.title}</h3>
                    <div className="space-y-3">
                      {subsection.content.map((paragraph, index) => (
                        <p key={index} className="text-base leading-relaxed text-muted-foreground">
                          {paragraph}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </LegalPageLayout>
  );
}
