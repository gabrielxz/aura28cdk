import { render, screen } from '@testing-library/react';
import IssueResolutionPage from '@/app/issue-resolution/page';
import { issueResolutionPolicy } from '@/lib/legal/legal-content';

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

describe('IssueResolutionPage', () => {
  it('renders with correct document title', () => {
    render(<IssueResolutionPage />);
    expect(screen.getByText('Issue Resolution Policy')).toBeInTheDocument();
  });

  it('renders all sections from issue resolution content', () => {
    render(<IssueResolutionPage />);

    issueResolutionPolicy.sections.forEach((section) => {
      expect(screen.getByText(section.title)).toBeInTheDocument();
    });
  });

  it('renders section content paragraphs', () => {
    render(<IssueResolutionPage />);

    // Check first section's content
    const firstSection = issueResolutionPolicy.sections[0];
    firstSection.content.forEach((paragraph) => {
      expect(screen.getByText(paragraph)).toBeInTheDocument();
    });
  });

  it('includes escalation process information', () => {
    render(<IssueResolutionPage />);

    const hasEscalation = issueResolutionPolicy.sections.some(
      (section) =>
        section.title.includes('Escalation') ||
        section.content.some((c) => c.toLowerCase().includes('escalat')),
    );
    expect(hasEscalation).toBeTruthy();
  });

  it('includes response time commitments', () => {
    render(<IssueResolutionPage />);

    const hasResponseTimes = issueResolutionPolicy.sections.some(
      (section) =>
        section.title.includes('Response') ||
        section.title.includes('Time') ||
        section.content.some(
          (c) => c.includes('business days') || c.includes('hours') || c.includes('response time'),
        ),
    );
    expect(hasResponseTimes).toBeTruthy();
  });

  it('covers multiple issue categories', () => {
    render(<IssueResolutionPage />);

    // Check for various issue types
    const issueTypes = ['technical', 'billing', 'account', 'reading', 'refund'];
    const hasMultipleCategories = issueTypes.some((type) =>
      issueResolutionPolicy.sections.some(
        (section) =>
          section.title.toLowerCase().includes(type) ||
          section.content.some((c) => c.toLowerCase().includes(type)),
      ),
    );
    expect(hasMultipleCategories).toBeTruthy();
  });

  it('applies correct section IDs for anchor navigation', () => {
    const { container } = render(<IssueResolutionPage />);

    issueResolutionPolicy.sections.forEach((section) => {
      const sectionElement = container.querySelector(`#${section.id}`);
      expect(sectionElement).toBeInTheDocument();
      expect(sectionElement).toHaveClass('scroll-mt-20');
    });
  });

  it('renders subsections when they exist', () => {
    render(<IssueResolutionPage />);

    issueResolutionPolicy.sections.forEach((section) => {
      if (section.subsections) {
        section.subsections.forEach((subsection) => {
          expect(screen.getByText(subsection.title)).toBeInTheDocument();
        });
      }
    });
  });

  it('applies correct subsection IDs when they exist', () => {
    const { container } = render(<IssueResolutionPage />);

    issueResolutionPolicy.sections.forEach((section) => {
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
    const { container } = render(<IssueResolutionPage />);

    // Check for section elements
    const sections = container.querySelectorAll('section');
    expect(sections.length).toBeGreaterThan(0);

    // Check for proper heading hierarchy
    const h2Elements = container.querySelectorAll('h2');
    expect(h2Elements.length).toBe(issueResolutionPolicy.sections.length);

    // Check for h3 elements in sections with subsections
    const sectionsWithSubsections = issueResolutionPolicy.sections.filter(
      (s) => s.subsections && s.subsections.length > 0,
    );
    if (sectionsWithSubsections.length > 0) {
      const h3Elements = container.querySelectorAll('h3');
      expect(h3Elements.length).toBeGreaterThan(0);
    }
  });

  it('applies responsive typography classes', () => {
    const { container } = render(<IssueResolutionPage />);

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
    const { container } = render(<IssueResolutionPage />);

    // Check for main content wrapper
    const contentWrapper = container.querySelector('.space-y-8');
    expect(contentWrapper).toBeInTheDocument();

    // Check for section content spacing
    const sectionContentWrappers = container.querySelectorAll('.space-y-4');
    expect(sectionContentWrappers.length).toBeGreaterThan(0);

    // Check for subsection spacing
    const subsectionWrappers = container.querySelectorAll('.space-y-6');
    const hasSubsections = issueResolutionPolicy.sections.some((s) => s.subsections);
    if (hasSubsections) {
      expect(subsectionWrappers.length).toBeGreaterThan(0);
    }
  });

  it('applies muted foreground color to content', () => {
    const { container } = render(<IssueResolutionPage />);

    const paragraphs = container.querySelectorAll('p');
    paragraphs.forEach((p) => {
      expect(p).toHaveClass('text-muted-foreground');
    });
  });

  it('passes the correct document to LegalPageLayout', () => {
    render(<IssueResolutionPage />);

    // The mock will receive the document prop
    const layout = screen.getByTestId('legal-page-layout');
    expect(layout).toBeInTheDocument();
    expect(screen.getByText(issueResolutionPolicy.title)).toBeInTheDocument();
  });

  it('includes contact methods for issue submission', () => {
    render(<IssueResolutionPage />);

    const hasContactMethods = issueResolutionPolicy.sections.some(
      (section) =>
        section.title.includes('Contact') ||
        section.title.includes('Submit') ||
        section.content.some((c) => c.includes('email') || c.includes('support')),
    );
    expect(hasContactMethods).toBeTruthy();
  });

  it('includes dispute resolution procedures', () => {
    render(<IssueResolutionPage />);

    const hasDisputeResolution = issueResolutionPolicy.sections.some(
      (section) =>
        section.title.includes('Dispute') ||
        section.title.includes('Resolution') ||
        section.content.some((c) => c.toLowerCase().includes('dispute')),
    );
    expect(hasDisputeResolution).toBeTruthy();
  });
});
