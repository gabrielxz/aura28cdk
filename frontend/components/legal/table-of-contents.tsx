'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LegalSection } from '@/lib/legal/legal-content';

interface TableOfContentsProps {
  sections: LegalSection[];
  className?: string;
}

export function TableOfContents({ sections, className }: TableOfContentsProps) {
  const [activeSection, setActiveSection] = useState<string>('');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      setIsCollapsed(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      {
        rootMargin: '-20% 0px -70% 0px',
      },
    );

    sections.forEach((section) => {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [sections]);

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      const offset = 80; // Account for fixed header
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.scrollY - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth',
      });

      // Collapse on mobile after clicking
      if (isMobile) {
        setIsCollapsed(true);
      }
    }
  };

  return (
    <nav className={cn('', className)}>
      {isMobile && (
        <Button
          variant="outline"
          className="w-full mb-2 justify-between"
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          <span>Table of Contents</span>
          <ChevronDown
            className={cn('h-4 w-4 transition-transform', !isCollapsed && 'rotate-180')}
          />
        </Button>
      )}

      <div className={cn('space-y-1', isMobile && isCollapsed && 'hidden')}>
        {!isMobile && (
          <h3 className="font-semibold text-sm text-muted-foreground mb-3">Table of Contents</h3>
        )}
        <ul className="space-y-1">
          {sections.map((section) => (
            <li key={section.id}>
              <button
                onClick={() => scrollToSection(section.id)}
                className={cn(
                  'w-full text-left px-3 py-2 text-sm rounded-md transition-colors',
                  'hover:bg-muted hover:text-foreground',
                  activeSection === section.id
                    ? 'bg-muted text-foreground font-medium'
                    : 'text-muted-foreground',
                )}
              >
                {section.title}
              </button>
              {section.subsections && (
                <ul className="ml-4 mt-1 space-y-1">
                  {section.subsections.map((subsection) => (
                    <li key={subsection.id}>
                      <button
                        onClick={() => scrollToSection(subsection.id)}
                        className={cn(
                          'w-full text-left px-3 py-1 text-xs rounded-md transition-colors',
                          'hover:bg-muted hover:text-foreground',
                          activeSection === subsection.id
                            ? 'bg-muted text-foreground font-medium'
                            : 'text-muted-foreground',
                        )}
                      >
                        {subsection.title}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
