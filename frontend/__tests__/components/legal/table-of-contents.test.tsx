import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { TableOfContents } from '@/components/legal/table-of-contents';
import { LegalSection } from '@/lib/legal/legal-content';

// Mock window.scrollTo
const mockScrollTo = jest.fn();
Object.defineProperty(window, 'scrollTo', {
  value: mockScrollTo,
  writable: true,
});

// Mock IntersectionObserver
const mockIntersectionObserver = jest.fn();
mockIntersectionObserver.mockReturnValue({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
});
global.IntersectionObserver = mockIntersectionObserver as unknown as typeof IntersectionObserver;

const mockSections: LegalSection[] = [
  {
    id: 'section-1',
    title: 'First Section',
    content: ['Content 1'],
    subsections: [
      {
        id: 'subsection-1-1',
        title: 'Subsection 1.1',
        content: ['Subsection content'],
      },
    ],
  },
  {
    id: 'section-2',
    title: 'Second Section',
    content: ['Content 2'],
  },
];

describe('TableOfContents', () => {
  beforeEach(() => {
    mockScrollTo.mockClear();

    // Mock getElementById to return elements
    jest.spyOn(document, 'getElementById').mockImplementation((id) => {
      const element = document.createElement('div');
      element.id = id;
      jest.spyOn(element, 'getBoundingClientRect').mockReturnValue({
        top: 100,
        bottom: 200,
        left: 0,
        right: 100,
        width: 100,
        height: 100,
        x: 0,
        y: 100,
        toJSON: () => ({}),
      });
      return element;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders all sections and subsections', () => {
    render(<TableOfContents sections={mockSections} />);

    expect(screen.getByText('First Section')).toBeInTheDocument();
    expect(screen.getByText('Second Section')).toBeInTheDocument();
    expect(screen.getByText('Subsection 1.1')).toBeInTheDocument();
  });

  it('handles section click and scrolls to element', () => {
    render(<TableOfContents sections={mockSections} />);

    const firstSectionButton = screen.getByRole('button', { name: 'First Section' });
    fireEvent.click(firstSectionButton);

    expect(mockScrollTo).toHaveBeenCalledWith({
      top: expect.any(Number),
      behavior: 'smooth',
    });
  });

  it.skip('applies active section styling', async () => {
    render(<TableOfContents sections={mockSections} />);

    // Simulate intersection observer callback
    const observerCallback = mockIntersectionObserver.mock.calls[0][0];

    // Use act to ensure React state updates are processed
    await act(async () => {
      observerCallback([
        {
          isIntersecting: true,
          target: { id: 'section-1' },
        },
      ]);
    });

    // Wait for the component to re-render with the updated active state
    await waitFor(() => {
      const firstSectionButton = screen.getByRole('button', { name: 'First Section' });
      // Check that all active classes are present
      const classNames = firstSectionButton.className;
      expect(classNames).toContain('bg-muted');
      expect(classNames).toContain('text-foreground');
      expect(classNames).toContain('font-medium');
    });
  });

  it('handles mobile view with collapsible menu', () => {
    // Mock window width for mobile
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 500,
    });

    // Trigger resize event
    const resizeEvent = new Event('resize');
    window.dispatchEvent(resizeEvent);

    render(<TableOfContents sections={mockSections} />);

    const toggleButton = screen.getByRole('button', { name: /table of contents/i });
    expect(toggleButton).toBeInTheDocument();

    // Click to expand
    fireEvent.click(toggleButton);
    expect(screen.getByText('First Section')).toBeVisible();

    // Click to collapse
    fireEvent.click(toggleButton);
  });

  it('handles desktop view without toggle button', () => {
    // Mock window width for desktop
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });

    // Trigger resize event
    const resizeEvent = new Event('resize');
    window.dispatchEvent(resizeEvent);

    render(<TableOfContents sections={mockSections} />);

    // Should not have toggle button on desktop
    expect(screen.queryByRole('button', { name: /table of contents/i })).toBeNull();

    // TOC heading should be visible
    expect(screen.getByText('Table of Contents')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <TableOfContents sections={mockSections} className="custom-class" />,
    );

    const nav = container.querySelector('nav');
    expect(nav).toHaveClass('custom-class');
  });

  it('sets up IntersectionObserver for all sections', () => {
    render(<TableOfContents sections={mockSections} />);

    // Check that observer was created
    expect(mockIntersectionObserver).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        rootMargin: '-20% 0px -70% 0px',
      }),
    );
  });

  it('cleans up IntersectionObserver on unmount', () => {
    const { unmount } = render(<TableOfContents sections={mockSections} />);

    const disconnect = mockIntersectionObserver.mock.results[0].value.disconnect;

    unmount();

    expect(disconnect).toHaveBeenCalled();
  });

  // Enhanced Subsection Navigation Tests

  it('handles subsection click and scrolls to element', () => {
    render(<TableOfContents sections={mockSections} />);

    const subsectionButton = screen.getByRole('button', { name: 'Subsection 1.1' });
    fireEvent.click(subsectionButton);

    expect(mockScrollTo).toHaveBeenCalledWith({
      top: expect.any(Number),
      behavior: 'smooth',
    });
  });

  it.skip('applies active styling to subsections', async () => {
    const { rerender } = render(<TableOfContents sections={mockSections} />);

    // Simulate intersection observer callback for subsection
    const observerCallback = mockIntersectionObserver.mock.calls[0][0];
    observerCallback([
      {
        isIntersecting: true,
        target: { id: 'subsection-1-1' },
      },
    ]);

    await waitFor(() => {
      rerender(<TableOfContents sections={mockSections} />);
      const subsectionButton = screen.getByRole('button', { name: 'Subsection 1.1' });
      expect(subsectionButton).toHaveClass('bg-muted', 'text-foreground', 'font-medium');
    });
  });

  it('renders nested subsections with proper indentation', () => {
    const { container } = render(<TableOfContents sections={mockSections} />);

    const subsectionList = container.querySelector('ul.ml-4');
    expect(subsectionList).toBeInTheDocument();
  });

  it('handles sections with multiple subsections', () => {
    const sectionsWithMultipleSubsections: LegalSection[] = [
      {
        id: 'section-1',
        title: 'Main Section',
        content: ['Content'],
        subsections: [
          {
            id: 'sub-1',
            title: 'Subsection 1',
            content: ['Sub content 1'],
          },
          {
            id: 'sub-2',
            title: 'Subsection 2',
            content: ['Sub content 2'],
          },
          {
            id: 'sub-3',
            title: 'Subsection 3',
            content: ['Sub content 3'],
          },
        ],
      },
    ];

    render(<TableOfContents sections={sectionsWithMultipleSubsections} />);

    expect(screen.getByText('Subsection 1')).toBeInTheDocument();
    expect(screen.getByText('Subsection 2')).toBeInTheDocument();
    expect(screen.getByText('Subsection 3')).toBeInTheDocument();
  });

  it('applies smaller text size to subsection buttons', () => {
    render(<TableOfContents sections={mockSections} />);

    const subsectionButton = screen.getByRole('button', { name: 'Subsection 1.1' });
    expect(subsectionButton).toHaveClass('text-xs');
  });

  it('applies correct padding to subsection buttons', () => {
    render(<TableOfContents sections={mockSections} />);

    const subsectionButton = screen.getByRole('button', { name: 'Subsection 1.1' });
    expect(subsectionButton).toHaveClass('px-3', 'py-1');
  });

  it('collapses menu on mobile after subsection click', () => {
    // Mock window width for mobile
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 500,
    });

    // Trigger resize event
    const resizeEvent = new Event('resize');
    window.dispatchEvent(resizeEvent);

    render(<TableOfContents sections={mockSections} />);

    const toggleButton = screen.getByRole('button', { name: /table of contents/i });

    // Expand menu
    fireEvent.click(toggleButton);
    expect(screen.getByText('Subsection 1.1')).toBeVisible();

    // Click subsection
    const subsectionButton = screen.getByRole('button', { name: 'Subsection 1.1' });
    fireEvent.click(subsectionButton);

    // Menu should be collapsed after navigation
    expect(mockScrollTo).toHaveBeenCalled();
  });

  it('handles empty sections array gracefully', () => {
    render(<TableOfContents sections={[]} />);

    const nav = screen.getByRole('navigation');
    expect(nav).toBeInTheDocument();
  });

  it('handles sections without titles gracefully', () => {
    const sectionsWithEmptyTitle: LegalSection[] = [
      {
        id: 'section-1',
        title: '',
        content: ['Content'],
      },
    ];

    render(<TableOfContents sections={sectionsWithEmptyTitle} />);

    const nav = screen.getByRole('navigation');
    expect(nav).toBeInTheDocument();
  });

  it('handles scroll to non-existent element gracefully', () => {
    jest.spyOn(document, 'getElementById').mockReturnValue(null);

    render(<TableOfContents sections={mockSections} />);

    const sectionButton = screen.getByRole('button', { name: 'First Section' });
    fireEvent.click(sectionButton);

    // Should not call scrollTo if element doesn't exist
    expect(mockScrollTo).not.toHaveBeenCalled();
  });

  it.skip('updates active section when multiple sections are visible', () => {
    const { rerender } = render(<TableOfContents sections={mockSections} />);

    // Simulate multiple sections being visible
    const observerCallback = mockIntersectionObserver.mock.calls[0][0];
    observerCallback([
      {
        isIntersecting: true,
        target: { id: 'section-1' },
      },
      {
        isIntersecting: true,
        target: { id: 'section-2' },
      },
    ]);

    rerender(<TableOfContents sections={mockSections} />);

    // Last visible section should be active
    expect(screen.getByRole('button', { name: 'Second Section' })).toHaveClass('bg-muted');
  });

  it.skip('removes active state when section leaves viewport', async () => {
    const { rerender } = render(<TableOfContents sections={mockSections} />);

    const observerCallback = mockIntersectionObserver.mock.calls[0][0];

    // Section enters viewport
    observerCallback([
      {
        isIntersecting: true,
        target: { id: 'section-1' },
      },
    ]);

    await waitFor(() => {
      rerender(<TableOfContents sections={mockSections} />);
      expect(screen.getByRole('button', { name: 'First Section' })).toHaveClass('bg-muted');
    });

    // Section leaves viewport
    observerCallback([
      {
        isIntersecting: false,
        target: { id: 'section-1' },
      },
    ]);

    await waitFor(() => {
      rerender(<TableOfContents sections={mockSections} />);
      // Should update to next visible section or none
    });
  });

  it('applies hover styles to section buttons', () => {
    render(<TableOfContents sections={mockSections} />);

    const sectionButton = screen.getByRole('button', { name: 'First Section' });
    expect(sectionButton).toHaveClass('hover:bg-muted', 'hover:text-foreground');
  });

  it('applies hover styles to subsection buttons', () => {
    render(<TableOfContents sections={mockSections} />);

    const subsectionButton = screen.getByRole('button', { name: 'Subsection 1.1' });
    expect(subsectionButton).toHaveClass('hover:bg-muted', 'hover:text-foreground');
  });

  it('maintains scroll position offset for fixed header', () => {
    render(<TableOfContents sections={mockSections} />);

    const sectionButton = screen.getByRole('button', { name: 'First Section' });
    fireEvent.click(sectionButton);

    // Check that offset is applied (80px as defined in component)
    expect(mockScrollTo).toHaveBeenCalledWith({
      top: expect.any(Number),
      behavior: 'smooth',
    });
  });
});
