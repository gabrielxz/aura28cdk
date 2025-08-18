import { render, screen } from '@testing-library/react';
import TermsOfServicePage from '@/app/terms-of-service/page';
import { termsOfService } from '@/lib/legal/legal-content';

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

describe('TermsOfServicePage', () => {
  it('renders with correct document title', () => {
    render(<TermsOfServicePage />);
    expect(screen.getByText('Terms of Service')).toBeInTheDocument();
  });

  it('renders all sections from terms of service content', () => {
    render(<TermsOfServicePage />);

    termsOfService.sections.forEach((section) => {
      expect(screen.getByText(section.title)).toBeInTheDocument();
    });
  });

  it('renders section content paragraphs', () => {
    render(<TermsOfServicePage />);

    // Check first section's content
    const firstSection = termsOfService.sections[0];
    firstSection.content.forEach((paragraph) => {
      expect(screen.getByText(paragraph)).toBeInTheDocument();
    });
  });

  it('renders subsections when they exist', () => {
    render(<TermsOfServicePage />);

    termsOfService.sections.forEach((section) => {
      if (section.subsections) {
        section.subsections.forEach((subsection) => {
          expect(screen.getByText(subsection.title)).toBeInTheDocument();
        });
      }
    });
  });

  it('applies correct section IDs for anchor navigation', () => {
    const { container } = render(<TermsOfServicePage />);

    termsOfService.sections.forEach((section) => {
      const sectionElement = container.querySelector(`#${section.id}`);
      expect(sectionElement).toBeInTheDocument();
      expect(sectionElement).toHaveClass('scroll-mt-20');
    });
  });

  it('applies correct subsection IDs when they exist', () => {
    const { container } = render(<TermsOfServicePage />);

    termsOfService.sections.forEach((section) => {
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
    const { container } = render(<TermsOfServicePage />);

    // Check for section elements
    const sections = container.querySelectorAll('section');
    expect(sections.length).toBeGreaterThan(0);

    // Check for proper heading hierarchy
    const h2Elements = container.querySelectorAll('h2');
    expect(h2Elements.length).toBe(termsOfService.sections.length);

    // Check for h3 elements in sections with subsections
    const sectionsWithSubsections = termsOfService.sections.filter(
      (s) => s.subsections && s.subsections.length > 0,
    );
    if (sectionsWithSubsections.length > 0) {
      const h3Elements = container.querySelectorAll('h3');
      expect(h3Elements.length).toBeGreaterThan(0);
    }
  });

  it('applies responsive typography classes', () => {
    const { container } = render(<TermsOfServicePage />);

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
  });

  it('wraps content in proper spacing divs', () => {
    const { container } = render(<TermsOfServicePage />);

    // Check for main content wrapper
    const contentWrapper = container.querySelector('.space-y-8');
    expect(contentWrapper).toBeInTheDocument();

    // Check for section content spacing
    const sectionContentWrappers = container.querySelectorAll('.space-y-4');
    expect(sectionContentWrappers.length).toBeGreaterThan(0);
  });

  it('passes the correct document to LegalPageLayout', () => {
    render(<TermsOfServicePage />);

    // The mock will receive the document prop
    const layout = screen.getByTestId('legal-page-layout');
    expect(layout).toBeInTheDocument();
    expect(screen.getByText(termsOfService.title)).toBeInTheDocument();
  });
});
