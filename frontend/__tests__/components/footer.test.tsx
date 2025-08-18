import { render, screen, within } from '@testing-library/react';
import { Footer } from '@/components/footer';

describe('Footer', () => {
  it('renders footer with all legal links', () => {
    render(<Footer />);

    // Check for copyright text
    const currentYear = new Date().getFullYear();
    expect(screen.getByText(new RegExp(`© ${currentYear} Aura28`, 'i'))).toBeInTheDocument();

    // Check for legal links
    expect(screen.getByRole('link', { name: /terms of service/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /privacy policy/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /issue resolution/i })).toBeInTheDocument();
  });

  it('has correct href attributes for legal links', () => {
    render(<Footer />);

    const termsLink = screen.getByRole('link', { name: /terms of service/i });
    const privacyLink = screen.getByRole('link', { name: /privacy policy/i });
    const issueLink = screen.getByRole('link', { name: /issue resolution/i });

    expect(termsLink).toHaveAttribute('href', '/terms-of-service');
    expect(privacyLink).toHaveAttribute('href', '/privacy-policy');
    expect(issueLink).toHaveAttribute('href', '/issue-resolution');
  });

  it('has semantic footer element', () => {
    const { container } = render(<Footer />);
    const footerElement = container.querySelector('footer');

    expect(footerElement).toBeInTheDocument();
    expect(footerElement).toHaveClass('mt-auto', 'border-t', 'bg-background');
  });

  it('has accessible navigation for legal links', () => {
    render(<Footer />);

    const nav = screen.getByRole('navigation', { name: /legal/i });
    expect(nav).toBeInTheDocument();
  });

  it('applies responsive classes correctly', () => {
    render(<Footer />);

    // Check for responsive flex classes
    const container = screen.getByText(/© \d{4} Aura28/i).parentElement?.parentElement;
    expect(container).toHaveClass('flex', 'flex-col', 'md:flex-row');
  });

  // Edge Cases and Additional Tests

  it('maintains correct link order', () => {
    render(<Footer />);

    const nav = screen.getByRole('navigation', { name: /legal/i });
    const links = within(nav).getAllByRole('link');

    expect(links).toHaveLength(3);
    expect(links[0]).toHaveTextContent('Terms of Service');
    expect(links[1]).toHaveTextContent('Privacy Policy');
    expect(links[2]).toHaveTextContent('Issue Resolution');
  });

  it('applies hover styles to links', () => {
    render(<Footer />);

    const links = screen.getAllByRole('link');
    links.forEach((link) => {
      if (
        link.textContent &&
        ['Terms of Service', 'Privacy Policy', 'Issue Resolution'].includes(link.textContent)
      ) {
        expect(link).toHaveClass('transition-colors', 'hover:text-foreground');
      }
    });
  });

  it('applies muted foreground color to links by default', () => {
    render(<Footer />);

    const links = screen.getAllByRole('link');
    links.forEach((link) => {
      if (
        link.textContent &&
        ['Terms of Service', 'Privacy Policy', 'Issue Resolution'].includes(link.textContent)
      ) {
        expect(link).toHaveClass('text-muted-foreground');
      }
    });
  });

  it('renders copyright text with correct styling', () => {
    render(<Footer />);

    const copyrightText = screen.getByText(/© \d{4} Aura28/i);
    expect(copyrightText).toHaveClass('text-sm', 'text-muted-foreground');
  });

  it('uses container for proper width constraints', () => {
    const { container } = render(<Footer />);

    const containerDiv = container.querySelector('.container');
    expect(containerDiv).toBeInTheDocument();
    expect(containerDiv).toHaveClass('mx-auto', 'px-4', 'py-8');
  });

  it('applies correct gap between links', () => {
    render(<Footer />);

    const nav = screen.getByRole('navigation', { name: /legal/i });
    expect(nav).toHaveClass('gap-4', 'md:gap-6');
  });

  it('centers content on mobile and aligns left on desktop', () => {
    const { container } = render(<Footer />);

    const companyInfo = container.querySelector('.text-center.md\\:text-left');
    expect(companyInfo).toBeInTheDocument();
  });

  it('ensures footer stays at bottom with mt-auto', () => {
    const { container } = render(<Footer />);
    const footerElement = container.querySelector('footer');

    expect(footerElement).toHaveClass('mt-auto');
  });

  it('applies proper link size for touch targets', () => {
    render(<Footer />);

    const links = screen.getAllByRole('link');
    links.forEach((link) => {
      if (
        link.textContent &&
        ['Terms of Service', 'Privacy Policy', 'Issue Resolution'].includes(link.textContent)
      ) {
        expect(link).toHaveClass('text-sm');
      }
    });
  });

  it('wraps links on small screens with flex-wrap', () => {
    render(<Footer />);

    const nav = screen.getByRole('navigation', { name: /legal/i });
    expect(nav).toHaveClass('flex-wrap');
  });

  it('justifies content properly between company info and links', () => {
    render(<Footer />);

    const container = screen.getByText(/© \d{4} Aura28/i).parentElement?.parentElement;
    expect(container).toHaveClass('justify-between');
  });

  it('aligns items center vertically', () => {
    render(<Footer />);

    const container = screen.getByText(/© \d{4} Aura28/i).parentElement?.parentElement;
    expect(container).toHaveClass('items-center');
  });
});
