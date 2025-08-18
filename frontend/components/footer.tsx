import Link from 'next/link';

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
          {/* Company Info */}
          <div className="text-center md:text-left">
            <p className="text-sm text-muted-foreground">
              © {currentYear} Aura28. All rights reserved.
            </p>
          </div>

          {/* Legal Links */}
          <nav aria-label="Legal" className="flex flex-wrap justify-center gap-4 md:gap-6">
            <Link
              href="/terms-of-service"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Terms of Service
            </Link>
            <Link
              href="/privacy-policy"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Privacy Policy
            </Link>
            <Link
              href="/issue-resolution"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Issue Resolution
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
