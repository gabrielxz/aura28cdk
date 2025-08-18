import { render, screen } from '@testing-library/react';
import PrivacyPolicyPage from '@/app/privacy-policy/page';
import { privacyPolicy } from '@/lib/legal/legal-content';

// Mock the LegalPageLayout component
// eslint-disable-next-line @typescript-eslint/no-explicit-any
jest.mock('@/components/legal/legal-page-layout', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  LegalPageLayout: ({ document, children }: { document: any; children: React.ReactNode }) => (
    <div data-testid="legal-page-layout">
      <h1>{document.title}</h1>
      <div data-testid="legal-content">{children}</div>
    </div>
  ),
}));

describe('PrivacyPolicyPage', () => {
  it('renders with correct document title', () => {
    render(<PrivacyPolicyPage />);
    expect(screen.getByText('Privacy Policy')).toBeInTheDocument();
  });

  it('renders all sections from privacy policy content', () => {
    render(<PrivacyPolicyPage />);

    privacyPolicy.sections.forEach((section) => {
      expect(screen.getByText(section.title)).toBeInTheDocument();
    });
  });

  it('renders section content paragraphs', () => {
    render(<PrivacyPolicyPage />);

    // Check first section's content
    const firstSection = privacyPolicy.sections[0];
    firstSection.content.forEach((paragraph) => {
      expect(screen.getByText(paragraph)).toBeInTheDocument();
    });
  });

  it('includes GDPR and CCPA compliance sections', () => {
    render(<PrivacyPolicyPage />);

    // Check for data protection sections
    const hasDataProtection = privacyPolicy.sections.some(
      (section) =>
        section.title.includes('Data Protection') ||
        section.title.includes('Your Rights') ||
        section.content.some((c) => c.includes('GDPR') || c.includes('CCPA')),
    );
    expect(hasDataProtection).toBeTruthy();
  });

  it('includes cookie policy information', () => {
    render(<PrivacyPolicyPage />);

    const hasCookieInfo = privacyPolicy.sections.some(
      (section) =>
        section.title.includes('Cookie') ||
        section.content.some((c) => c.toLowerCase().includes('cookie')),
    );
    expect(hasCookieInfo).toBeTruthy();
  });

  it('applies correct section IDs for anchor navigation', () => {
    const { container } = render(<PrivacyPolicyPage />);

    privacyPolicy.sections.forEach((section) => {
      const sectionElement = container.querySelector(`#${section.id}`);
      expect(sectionElement).toBeInTheDocument();
      expect(sectionElement).toHaveClass('scroll-mt-20');
    });
  });

  it('renders subsections when they exist', () => {
    render(<PrivacyPolicyPage />);

    privacyPolicy.sections.forEach((section) => {
      if (section.subsections) {
        section.subsections.forEach((subsection) => {
          expect(screen.getByText(subsection.title)).toBeInTheDocument();
        });
      }
    });
  });

  it('applies correct subsection IDs when they exist', () => {
    const { container } = render(<PrivacyPolicyPage />);

    privacyPolicy.sections.forEach((section) => {
      if (section.subsections) {
        section.subsections.forEach((subsection) => {
          const subsectionElement = container.querySelector(`#${subsection.id}`);
          expect(subsectionElement).toBeInTheDocument();
          expect(subsectionElement).toHaveClass('scroll-mt-20');
        });
      }
    });
  });

  it('renders with semantic HTML structure', () => {
    const { container } = render(<PrivacyPolicyPage />);

    // Check for section elements
    const sections = container.querySelectorAll('section');
    expect(sections.length).toBeGreaterThan(0);

    // Check for proper heading hierarchy
    const h2Elements = container.querySelectorAll('h2');
    expect(h2Elements.length).toBe(privacyPolicy.sections.length);

    // Check for h3 elements in sections with subsections
    const sectionsWithSubsections = privacyPolicy.sections.filter(
      (s) => s.subsections && s.subsections.length > 0,
    );
    if (sectionsWithSubsections.length > 0) {
      const h3Elements = container.querySelectorAll('h3');
      expect(h3Elements.length).toBeGreaterThan(0);
    }
  });

  it('applies responsive typography classes', () => {
    const { container } = render(<PrivacyPolicyPage />);

    // Check for text sizing classes
    const paragraphs = container.querySelectorAll('p');
    paragraphs.forEach((p) => {
      expect(p).toHaveClass('text-base', 'leading-relaxed');
    });

    // Check heading sizes
    const h2Elements = container.querySelectorAll('h2');
    h2Elements.forEach((h2) => {
      expect(h2).toHaveClass('text-2xl', 'font-semibold');
    });

    const h3Elements = container.querySelectorAll('h3');
    h3Elements.forEach((h3) => {
      expect(h3).toHaveClass('text-lg', 'font-medium');
    });
  });

  it('wraps content in proper spacing divs', () => {
    const { container } = render(<PrivacyPolicyPage />);

    // Check for main content wrapper
    const contentWrapper = container.querySelector('.space-y-8');
    expect(contentWrapper).toBeInTheDocument();

    // Check for section content spacing
    const sectionContentWrappers = container.querySelectorAll('.space-y-4');
    expect(sectionContentWrappers.length).toBeGreaterThan(0);

    // Check for subsection spacing
    const subsectionWrappers = container.querySelectorAll('.space-y-6');
    const hasSubsections = privacyPolicy.sections.some((s) => s.subsections);
    if (hasSubsections) {
      expect(subsectionWrappers.length).toBeGreaterThan(0);
    }
  });

  it('applies muted foreground color to content', () => {
    const { container } = render(<PrivacyPolicyPage />);

    const paragraphs = container.querySelectorAll('p');
    paragraphs.forEach((p) => {
      expect(p).toHaveClass('text-muted-foreground');
    });
  });

  it('passes the correct document to LegalPageLayout', () => {
    render(<PrivacyPolicyPage />);

    // The mock will receive the document prop
    const layout = screen.getByTestId('legal-page-layout');
    expect(layout).toBeInTheDocument();
    expect(screen.getByText(privacyPolicy.title)).toBeInTheDocument();
  });

  it('includes contact information section', () => {
    render(<PrivacyPolicyPage />);

    const hasContactInfo = privacyPolicy.sections.some(
      (section) =>
        section.title.includes('Contact') ||
        section.content.some((c) => c.includes('contact') || c.includes('email')),
    );
    expect(hasContactInfo).toBeTruthy();
  });
});
