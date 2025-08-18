'use client';

import { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Printer, Calendar } from 'lucide-react';
import { TableOfContents } from './table-of-contents';
import { LegalDocument } from '@/lib/legal/legal-content';

interface LegalPageLayoutProps {
  document: LegalDocument;
  children: ReactNode;
}

export function LegalPageLayout({ document, children }: LegalPageLayoutProps) {
  const handlePrint = () => {
    if (typeof window !== 'undefined' && window.print) {
      window.print();
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="mb-8 text-center lg:text-left">
        <h1 className="text-3xl font-bold tracking-tight mb-4">{document.title}</h1>
        <div className="flex flex-col sm:flex-row items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            <span>Last updated: {document.lastUpdated}</span>
          </div>
          <span className="hidden sm:inline">•</span>
          <span>Version {document.version}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="ml-auto print:hidden"
          >
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
        </div>
      </div>

      {/* Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Table of Contents - Sticky on desktop */}
        <aside className="lg:col-span-1 print:hidden">
          <div className="lg:sticky lg:top-20">
            <Card className="p-4">
              <TableOfContents sections={document.sections} />
            </Card>
          </div>
        </aside>

        {/* Main Content */}
        <main className="lg:col-span-3">
          <Card className="p-6 lg:p-8">
            <ScrollArea className="h-full">
              <article className="prose prose-gray dark:prose-invert max-w-none">
                {children}
              </article>
            </ScrollArea>
          </Card>
        </main>
      </div>
    </div>
  );
}
