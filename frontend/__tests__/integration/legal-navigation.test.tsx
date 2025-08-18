import { render, screen, within } from '@testing-library/react';
import { Footer } from '@/components/footer';
import TermsOfServicePage from '@/app/terms-of-service/page';
import PrivacyPolicyPage from '@/app/privacy-policy/page';
import IssueResolutionPage from '@/app/issue-resolution/page';
import { termsOfService, privacyPolicy, issueResolutionPolicy } from '@/lib/legal/legal-content';

// Mock Next.js Link component
jest.mock('next/link', () => {
  return {
    __esModule: true,
    default: ({ children, href }: { children: React.ReactNode; href: string }) => (
      <a href={href} data-testid={`link-${href}`}>
        {children}
      </a>
    ),
  };
});

// Mock the LegalPageLayout to avoid complex component interactions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
jest.mock('@/components/legal/legal-page-layout', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  LegalPageLayout: ({ document, children }: { document: any; children: React.ReactNode }) => (
    <div data-testid="legal-page-layout">
      <h1>{document.title}</h1>
      <p>Last updated: {document.lastUpdated}</p>
      <p>Version {document.version}</p>
      <nav data-testid="toc">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {document.sections.map((section: any, index: number) => (
          <button key={section.id} data-section-id={section.id}>
            Section {index + 1}
          </button>
        ))}
      </nav>
      <div data-testid="legal-content">{children}</div>
    </div>
  ),
}));

describe('Legal Pages Navigation Integration', () => {
  describe('Footer Navigation', () => {
    it('provides links to all legal pages', () => {
      render(<Footer />);

      const termsLink = screen.getByRole('link', { name: /terms of service/i });
      const privacyLink = screen.getByRole('link', { name: /privacy policy/i });
      const issueLink = screen.getByRole('link', { name: /issue resolution/i });

      expect(termsLink).toHaveAttribute('href', '/terms-of-service');
      expect(privacyLink).toHaveAttribute('href', '/privacy-policy');
      expect(issueLink).toHaveAttribute('href', '/issue-resolution');
    });

    it('footer links have correct data-testid for navigation testing', () => {
      render(<Footer />);

      expect(screen.getByTestId('link-/terms-of-service')).toBeInTheDocument();
      expect(screen.getByTestId('link-/privacy-policy')).toBeInTheDocument();
      expect(screen.getByTestId('link-/issue-resolution')).toBeInTheDocument();
    });

    it('footer is accessible via keyboard navigation', () => {
      render(<Footer />);

      const links = screen.getAllByRole('link');
      const legalLinks = links.filter(
        (link) =>
          link.textContent === 'Terms of Service' ||
          link.textContent === 'Privacy Policy' ||
          link.textContent === 'Issue Resolution',
      );

      legalLinks.forEach((link) => {
        // Check that links are focusable
        link.focus();
        expect(link).toHaveFocus();
        link.blur();
      });
    });
  });

  describe('Terms of Service Page Navigation', () => {
    it('renders with complete table of contents', () => {
      render(<TermsOfServicePage />);

      const toc = screen.getByTestId('toc');
      const tocButtons = within(toc).getAllByRole('button');

      expect(tocButtons).toHaveLength(termsOfService.sections.length);
    });

    it('displays all required legal sections', () => {
      render(<TermsOfServicePage />);

      // Check for critical sections
      expect(screen.getByText('1. Acceptance of Terms')).toBeInTheDocument();
      expect(screen.getByText('2. Service Description')).toBeInTheDocument();
      expect(screen.getByText('5. Payment Terms')).toBeInTheDocument();
      expect(screen.getByText('6. Refund Policy')).toBeInTheDocument();
    });

    it('shows metadata in the header', () => {
      render(<TermsOfServicePage />);

      expect(screen.getByText('Terms of Service')).toBeInTheDocument();
      expect(screen.getByText(/Last updated:/)).toBeInTheDocument();
      expect(screen.getByText(/Version/)).toBeInTheDocument();
    });

    it('has sections with proper IDs for deep linking', () => {
      const { container } = render(<TermsOfServicePage />);

      termsOfService.sections.forEach((section) => {
        const sectionElement = container.querySelector(`#${section.id}`);
        expect(sectionElement).toBeInTheDocument();
      });
    });
  });

  describe('Privacy Policy Page Navigation', () => {
    it('renders with complete table of contents', () => {
      render(<PrivacyPolicyPage />);

      const toc = screen.getByTestId('toc');
      const tocButtons = within(toc).getAllByRole('button');

      expect(tocButtons).toHaveLength(privacyPolicy.sections.length);
    });

    it('displays GDPR and CCPA compliance sections', () => {
      render(<PrivacyPolicyPage />);

      // Check for data protection compliance
      const content = screen.getByTestId('legal-content').textContent || '';
      const hasGDPR = content.includes('GDPR') || content.includes('General Data Protection');
      const hasCCPA = content.includes('CCPA') || content.includes('California Consumer');

      expect(hasGDPR || hasCCPA).toBeTruthy();
    });

    it('shows metadata in the header', () => {
      render(<PrivacyPolicyPage />);

      expect(screen.getByText('Privacy Policy')).toBeInTheDocument();
      expect(screen.getByText(/Last updated:/)).toBeInTheDocument();
      expect(screen.getByText(/Version/)).toBeInTheDocument();
    });

    it('includes data collection and usage information', () => {
      render(<PrivacyPolicyPage />);

      const hasDataCollection = privacyPolicy.sections.some(
        (section) =>
          section.title.includes('Information Collection') ||
          section.title.includes('Information We Collect'),
      );
      const hasDataUsage = privacyPolicy.sections.some(
        (section) =>
          section.title.includes('Information Use') || section.title.includes('How We Use'),
      );

      expect(hasDataCollection).toBeTruthy();
      expect(hasDataUsage).toBeTruthy();
    });
  });

  describe('Issue Resolution Page Navigation', () => {
    it('renders with complete table of contents', () => {
      render(<IssueResolutionPage />);

      const toc = screen.getByTestId('toc');
      const tocButtons = within(toc).getAllByRole('button');

      expect(tocButtons).toHaveLength(issueResolutionPolicy.sections.length);
    });

    it('displays escalation and response time information', () => {
      render(<IssueResolutionPage />);

      // Check for escalation process
      const hasEscalation = issueResolutionPolicy.sections.some((section) =>
        section.title.includes('Escalation'),
      );
      const hasResponseTimes = issueResolutionPolicy.sections.some((section) =>
        section.title.includes('Response'),
      );

      expect(hasEscalation).toBeTruthy();
      expect(hasResponseTimes).toBeTruthy();
    });

    it('shows metadata in the header', () => {
      render(<IssueResolutionPage />);

      expect(screen.getByText('Issue Resolution Policy')).toBeInTheDocument();
      expect(screen.getByText(/Last updated:/)).toBeInTheDocument();
      expect(screen.getByText(/Version/)).toBeInTheDocument();
    });

    it('includes multiple issue categories', () => {
      render(<IssueResolutionPage />);

      const content = screen.getByTestId('legal-content').textContent || '';
      const issueTypes = ['technical', 'billing', 'account', 'reading'];
      const coveredTypes = issueTypes.filter((type) => content.toLowerCase().includes(type));

      expect(coveredTypes.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Cross-Page Consistency', () => {
    it('all legal pages have consistent layout structure', () => {
      const pages = [
        { component: <TermsOfServicePage />, name: 'Terms of Service' },
        { component: <PrivacyPolicyPage />, name: 'Privacy Policy' },
        { component: <IssueResolutionPage />, name: 'Issue Resolution Policy' },
      ];

      pages.forEach(({ component, name }) => {
        const { container } = render(component);

        expect(screen.getByTestId('legal-page-layout')).toBeInTheDocument();
        expect(screen.getByTestId('toc')).toBeInTheDocument();
        expect(screen.getByTestId('legal-content')).toBeInTheDocument();
        expect(screen.getByText(name)).toBeInTheDocument();

        // Clean up for next iteration
        container.remove();
      });
    });

    it('all legal pages display version and update date', () => {
      const pages = [
        <TermsOfServicePage key="terms" />,
        <PrivacyPolicyPage key="privacy" />,
        <IssueResolutionPage key="issue" />,
      ];

      pages.forEach((page) => {
        const { container } = render(page);

        expect(screen.getByText(/Last updated:/)).toBeInTheDocument();
        expect(screen.getByText(/Version/)).toBeInTheDocument();

        // Clean up for next iteration
        container.remove();
      });
    });

    it('all legal pages have the same version number', () => {
      expect(termsOfService.version).toBe(privacyPolicy.version);
      expect(privacyPolicy.version).toBe(issueResolutionPolicy.version);
    });

    it('all legal pages have recent update dates', () => {
      const documents = [termsOfService, privacyPolicy, issueResolutionPolicy];

      documents.forEach((doc) => {
        const updateDate = new Date(doc.lastUpdated);
        const currentDate = new Date();
        const daysDifference =
          (currentDate.getTime() - updateDate.getTime()) / (1000 * 60 * 60 * 24);

        // Check that documents were updated within the last year
        expect(daysDifference).toBeLessThan(365);
      });
    });
  });

  describe('Accessibility Features', () => {
    it('all sections have unique IDs for deep linking', () => {
      const allSectionIds = [
        ...termsOfService.sections.map((s) => s.id),
        ...privacyPolicy.sections.map((s) => s.id),
        ...issueResolutionPolicy.sections.map((s) => s.id),
      ];

      const uniqueIds = new Set(allSectionIds);
      expect(uniqueIds.size).toBe(allSectionIds.length);
    });

    it('footer navigation has proper ARIA attributes', () => {
      render(<Footer />);

      const nav = screen.getByRole('navigation', { name: /legal/i });
      expect(nav).toBeInTheDocument();
      expect(nav).toHaveAttribute('aria-label', 'Legal');
    });

    it('legal page headings follow proper hierarchy', () => {
      const { container } = render(<TermsOfServicePage />);

      // h1 for page title (in mock)
      const h1Elements = container.querySelectorAll('h1');
      expect(h1Elements.length).toBe(1);

      // h2 for main sections
      const h2Elements = container.querySelectorAll('h2');
      expect(h2Elements.length).toBe(termsOfService.sections.length);

      // h3 for subsections if they exist
      const hasSubsections = termsOfService.sections.some((s) => s.subsections);
      if (hasSubsections) {
        const h3Elements = container.querySelectorAll('h3');
        expect(h3Elements.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Mobile Responsiveness', () => {
    it('footer stacks links vertically on mobile', () => {
      render(<Footer />);

      const container = screen.getByText(/© \d{4} Aura28/i).parentElement?.parentElement;
      expect(container).toHaveClass('flex-col', 'md:flex-row');
    });

    it('legal links have appropriate spacing on mobile', () => {
      render(<Footer />);

      const nav = screen.getByRole('navigation', { name: /legal/i });
      expect(nav).toHaveClass('gap-4', 'md:gap-6');
    });

    it('all legal pages render with responsive typography', () => {
      const { container } = render(<TermsOfServicePage />);

      const paragraphs = container.querySelectorAll('p');
      paragraphs.forEach((p) => {
        if (
          p.textContent &&
          !p.textContent.includes('Last updated') &&
          !p.textContent.includes('Version')
        ) {
          expect(p).toHaveClass('text-base');
        }
      });
    });
  });
});
