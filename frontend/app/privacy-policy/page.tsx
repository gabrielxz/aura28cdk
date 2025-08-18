import { Metadata } from 'next';
import { LegalPageLayout } from '@/components/legal/legal-page-layout';
import { privacyPolicy } from '@/lib/legal/legal-content';

export const metadata: Metadata = {
  title: 'Privacy Policy - Aura28',
  description:
    'Privacy Policy for Aura28. Learn how we collect, use, and protect your personal information and astrological data.',
  openGraph: {
    title: 'Privacy Policy - Aura28',
    description: 'Learn how Aura28 protects your personal information and astrological data',
    type: 'website',
  },
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPageLayout document={privacyPolicy}>
      <div className="space-y-8">
        {privacyPolicy.sections.map((section) => (
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
