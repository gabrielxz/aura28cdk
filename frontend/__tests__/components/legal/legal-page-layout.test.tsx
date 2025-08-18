import { render, screen, fireEvent } from '@testing-library/react';
import { LegalPageLayout } from '@/components/legal/legal-page-layout';
import { LegalDocument } from '@/lib/legal/legal-content';

// Mock the TableOfContents component
jest.mock('@/components/legal/table-of-contents', () => ({
  TableOfContents: ({ sections }: { sections: { id: string; title: string }[] }) => (
    <div data-testid="table-of-contents">
      {sections.map((section) => (
        <div key={section.id}>{section.title}</div>
      ))}
    </div>
  ),
}));

// Mock window.print
const mockPrint = jest.fn();
beforeAll(() => {
  Object.defineProperty(window, 'print', {
    value: mockPrint,
    writable: true,
  });
});

afterEach(() => {
  mockPrint.mockClear();
});

const mockDocument: LegalDocument = {
  title: 'Test Legal Document',
  lastUpdated: '2025-08-18',
  version: '1.0.0',
  sections: [
    {
      id: 'section-1',
      title: 'Section 1',
      content: ['Content for section 1'],
    },
    {
      id: 'section-2',
      title: 'Section 2',
      content: ['Content for section 2'],
    },
  ],
};

describe('LegalPageLayout', () => {
  beforeEach(() => {
    mockPrint.mockClear();
  });

  it('renders document title and metadata', () => {
    render(
      <LegalPageLayout document={mockDocument}>
        <div>Test content</div>
      </LegalPageLayout>,
    );

    expect(screen.getByText('Test Legal Document')).toBeInTheDocument();
    expect(screen.getByText(/Last updated: 2025-08-18/)).toBeInTheDocument();
    expect(screen.getByText(/Version 1.0.0/)).toBeInTheDocument();
  });

  it('renders table of contents', () => {
    render(
      <LegalPageLayout document={mockDocument}>
        <div>Test content</div>
      </LegalPageLayout>,
    );

    expect(screen.getByTestId('table-of-contents')).toBeInTheDocument();
    expect(screen.getByText('Section 1')).toBeInTheDocument();
    expect(screen.getByText('Section 2')).toBeInTheDocument();
  });

  it('renders children content', () => {
    render(
      <LegalPageLayout document={mockDocument}>
        <div data-testid="child-content">This is the legal content</div>
      </LegalPageLayout>,
    );

    expect(screen.getByTestId('child-content')).toBeInTheDocument();
    expect(screen.getByText('This is the legal content')).toBeInTheDocument();
  });

  it('handles print button click', () => {
    render(
      <LegalPageLayout document={mockDocument}>
        <div>Test content</div>
      </LegalPageLayout>,
    );

    const printButton = screen.getByRole('button', { name: /print/i });
    expect(printButton).toBeInTheDocument();

    fireEvent.click(printButton);
    expect(mockPrint).toHaveBeenCalledTimes(1);
  });

  it('has print-hidden class on print button', () => {
    render(
      <LegalPageLayout document={mockDocument}>
        <div>Test content</div>
      </LegalPageLayout>,
    );

    const printButton = screen.getByRole('button', { name: /print/i });
    expect(printButton).toHaveClass('print:hidden');
  });

  it('applies responsive grid layout', () => {
    const { container } = render(
      <LegalPageLayout document={mockDocument}>
        <div>Test content</div>
      </LegalPageLayout>,
    );

    const gridContainer = container.querySelector('.grid');
    expect(gridContainer).toHaveClass('grid-cols-1', 'lg:grid-cols-4');
  });

  it('renders last updated date with calendar icon', () => {
    render(
      <LegalPageLayout document={mockDocument}>
        <div>Test content</div>
      </LegalPageLayout>,
    );

    // Check for the calendar icon (Lucide icons render as SVG)
    const calendarIcon = document.querySelector('svg');
    expect(calendarIcon).toBeInTheDocument();
  });

  // Edge Cases and Error Scenarios

  it('handles empty sections array gracefully', () => {
    const emptyDocument: LegalDocument = {
      ...mockDocument,
      sections: [],
    };

    render(
      <LegalPageLayout document={emptyDocument}>
        <div>Test content</div>
      </LegalPageLayout>,
    );

    expect(screen.getByText('Test Legal Document')).toBeInTheDocument();
    expect(screen.getByTestId('table-of-contents')).toBeInTheDocument();
  });

  it('handles missing subsections gracefully', () => {
    const documentWithoutSubsections: LegalDocument = {
      ...mockDocument,
      sections: [
        {
          id: 'section-1',
          title: 'Section 1',
          content: ['Content for section 1'],
        },
      ],
    };

    render(
      <LegalPageLayout document={documentWithoutSubsections}>
        <div>Test content</div>
      </LegalPageLayout>,
    );

    expect(screen.getByTestId('table-of-contents')).toBeInTheDocument();
    expect(screen.getByText('Section 1')).toBeInTheDocument();
  });

  it('handles long document titles gracefully', () => {
    const longTitleDocument: LegalDocument = {
      ...mockDocument,
      title:
        'This is an extremely long legal document title that should still render properly without breaking the layout or causing any overflow issues in the header section',
    };

    render(
      <LegalPageLayout document={longTitleDocument}>
        <div>Test content</div>
      </LegalPageLayout>,
    );

    expect(screen.getByText(longTitleDocument.title)).toBeInTheDocument();
  });

  it('handles special characters in dates', () => {
    const specialDateDocument: LegalDocument = {
      ...mockDocument,
      lastUpdated: '2025/08/18', // Different date format
    };

    render(
      <LegalPageLayout document={specialDateDocument}>
        <div>Test content</div>
      </LegalPageLayout>,
    );

    expect(screen.getByText(/Last updated: 2025\/08\/18/)).toBeInTheDocument();
  });

  it('handles print button when window.print is not available', () => {
    const originalPrint = window.print;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).print = undefined;

    render(
      <LegalPageLayout document={mockDocument}>
        <div>Test content</div>
      </LegalPageLayout>,
    );

    const printButton = screen.getByRole('button', { name: /print/i });

    // Should not throw error when clicking
    expect(() => fireEvent.click(printButton)).not.toThrow();

    // Restore window.print
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).print = originalPrint;
  });

  it('renders multiple children correctly', () => {
    render(
      <LegalPageLayout document={mockDocument}>
        <div data-testid="child-1">First child</div>
        <div data-testid="child-2">Second child</div>
        <div data-testid="child-3">Third child</div>
      </LegalPageLayout>,
    );

    expect(screen.getByTestId('child-1')).toBeInTheDocument();
    expect(screen.getByTestId('child-2')).toBeInTheDocument();
    expect(screen.getByTestId('child-3')).toBeInTheDocument();
  });

  it('applies sticky positioning to TOC container on desktop', () => {
    const { container } = render(
      <LegalPageLayout document={mockDocument}>
        <div>Test content</div>
      </LegalPageLayout>,
    );

    const stickyContainer = container.querySelector('.lg\\:sticky');
    expect(stickyContainer).toBeInTheDocument();
    expect(stickyContainer).toHaveClass('lg:top-20');
  });

  it('renders ScrollArea component for content', () => {
    const { container } = render(
      <LegalPageLayout document={mockDocument}>
        <div>Test content</div>
      </LegalPageLayout>,
    );

    // ScrollArea adds specific data attributes or classes
    const scrollArea = container.querySelector('[data-radix-scroll-area-viewport]');
    expect(scrollArea).toBeInTheDocument();
  });

  it('applies prose classes for typography', () => {
    const { container } = render(
      <LegalPageLayout document={mockDocument}>
        <div>Test content</div>
      </LegalPageLayout>,
    );

    const article = container.querySelector('article');
    expect(article).toHaveClass('prose', 'prose-gray', 'dark:prose-invert', 'max-w-none');
  });

  it('handles undefined version gracefully', () => {
    const documentWithoutVersion: LegalDocument = {
      title: 'Test Document',
      lastUpdated: '2025-08-18',
      version: '',
      sections: mockDocument.sections,
    };

    render(
      <LegalPageLayout document={documentWithoutVersion}>
        <div>Test content</div>
      </LegalPageLayout>,
    );

    expect(screen.getByText(/Version\s*$/)).toBeInTheDocument();
  });

  it('applies max width constraint to container', () => {
    const { container } = render(
      <LegalPageLayout document={mockDocument}>
        <div>Test content</div>
      </LegalPageLayout>,
    );

    const mainContainer = container.querySelector('.max-w-7xl');
    expect(mainContainer).toBeInTheDocument();
  });

  it('renders print button with correct icon', () => {
    render(
      <LegalPageLayout document={mockDocument}>
        <div>Test content</div>
      </LegalPageLayout>,
    );

    const printButton = screen.getByRole('button', { name: /print/i });

    // Check for Printer icon (should have specific classes)
    const svgIcon = printButton.querySelector('svg');
    expect(svgIcon).toBeInTheDocument();
    expect(svgIcon).toHaveClass('h-4', 'w-4');
  });

  it('applies correct spacing between header elements', () => {
    render(
      <LegalPageLayout document={mockDocument}>
        <div>Test content</div>
      </LegalPageLayout>,
    );

    const headerInfo = screen.getByText(/Last updated:/i).parentElement;
    expect(headerInfo).toHaveClass('gap-2');
  });

  it('renders separator bullet on non-mobile', () => {
    render(
      <LegalPageLayout document={mockDocument}>
        <div>Test content</div>
      </LegalPageLayout>,
    );

    const bullet = screen.getByText('•');
    expect(bullet).toHaveClass('hidden', 'sm:inline');
  });

  it('positions print button with ml-auto', () => {
    render(
      <LegalPageLayout document={mockDocument}>
        <div>Test content</div>
      </LegalPageLayout>,
    );

    const printButton = screen.getByRole('button', { name: /print/i });
    expect(printButton).toHaveClass('ml-auto');
  });
});
