import {
  termsOfService,
  privacyPolicy,
  issueResolutionPolicy,
  LegalDocument,
} from '@/lib/legal/legal-content';

describe('Legal Content Data Structure', () => {
  describe('Document Structure Validation', () => {
    const documents: { name: string; doc: LegalDocument }[] = [
      { name: 'Terms of Service', doc: termsOfService },
      { name: 'Privacy Policy', doc: privacyPolicy },
      { name: 'Issue Resolution Policy', doc: issueResolutionPolicy },
    ];

    documents.forEach(({ name, doc }) => {
      describe(name, () => {
        it('has required document properties', () => {
          expect(doc.title).toBeDefined();
          expect(doc.title).not.toBe('');
          expect(doc.lastUpdated).toBeDefined();
          expect(doc.version).toBeDefined();
          expect(doc.sections).toBeDefined();
          expect(Array.isArray(doc.sections)).toBeTruthy();
        });

        it('has valid date format for lastUpdated', () => {
          // Check ISO date format YYYY-MM-DD
          const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
          expect(doc.lastUpdated).toMatch(dateRegex);

          // Verify it's a valid date
          const date = new Date(doc.lastUpdated);
          expect(date.toString()).not.toBe('Invalid Date');
        });

        it('has valid version format', () => {
          // Check semantic versioning format
          const versionRegex = /^\d+\.\d+\.\d+$/;
          expect(doc.version).toMatch(versionRegex);
        });

        it('has at least one section', () => {
          expect(doc.sections.length).toBeGreaterThan(0);
        });

        it('all sections have required properties', () => {
          doc.sections.forEach((section) => {
            expect(section.id).toBeDefined();
            expect(section.id).not.toBe('');
            expect(section.title).toBeDefined();
            expect(section.title).not.toBe('');
            expect(section.content).toBeDefined();
            expect(Array.isArray(section.content)).toBeTruthy();
          });
        });

        it('all sections have unique IDs', () => {
          const ids = doc.sections.map((s) => s.id);
          const uniqueIds = new Set(ids);
          expect(uniqueIds.size).toBe(ids.length);
        });

        it('all sections have content', () => {
          doc.sections.forEach((section) => {
            expect(section.content.length).toBeGreaterThan(0);
            section.content.forEach((paragraph) => {
              expect(paragraph).not.toBe('');
            });
          });
        });

        it('subsections have valid structure when present', () => {
          doc.sections.forEach((section) => {
            if (section.subsections) {
              expect(Array.isArray(section.subsections)).toBeTruthy();
              section.subsections.forEach((subsection) => {
                expect(subsection.id).toBeDefined();
                expect(subsection.id).not.toBe('');
                expect(subsection.title).toBeDefined();
                expect(subsection.title).not.toBe('');
                expect(subsection.content).toBeDefined();
                expect(Array.isArray(subsection.content)).toBeTruthy();
                expect(subsection.content.length).toBeGreaterThan(0);
              });
            }
          });
        });

        it('all subsection IDs are unique within their parent section', () => {
          doc.sections.forEach((section) => {
            if (section.subsections) {
              const subsectionIds = section.subsections.map((s) => s.id);
              const uniqueSubsectionIds = new Set(subsectionIds);
              expect(uniqueSubsectionIds.size).toBe(subsectionIds.length);
            }
          });
        });

        it('section IDs follow consistent naming convention', () => {
          doc.sections.forEach((section) => {
            // IDs should be lowercase with hyphens
            expect(section.id).toMatch(/^[a-z0-9-]+$/);
          });
        });
      });
    });
  });

  describe('Terms of Service Content', () => {
    it('contains essential legal sections', () => {
      const essentialSections = [
        'acceptance',
        'service-description',
        'payment-terms',
        'refund-policy',
        'intellectual-property',
        'disclaimer',
        'limitation-liability',
      ];

      const sectionIds = termsOfService.sections.map((s) => s.id);
      essentialSections.forEach((essential) => {
        expect(sectionIds).toContain(essential);
      });
    });

    it('includes service pricing information', () => {
      const hasPricing = termsOfService.sections.some((section) =>
        section.content.some((c) => c.includes('$147')),
      );
      expect(hasPricing).toBeTruthy();
    });

    it('includes age requirement', () => {
      const hasAgeRequirement = termsOfService.sections.some((section) =>
        section.content.some((c) => c.includes('18 years')),
      );
      expect(hasAgeRequirement).toBeTruthy();
    });

    it('has at least 10 sections for comprehensive coverage', () => {
      expect(termsOfService.sections.length).toBeGreaterThanOrEqual(10);
    });
  });

  describe('Privacy Policy Content', () => {
    it('contains essential privacy sections', () => {
      const essentialSections = [
        'information-collection',
        'use-of-information',
        'data-sharing',
        'cookies',
        'third-party',
        'your-rights',
        'contact-us',
      ];

      const sectionIds = privacyPolicy.sections.map((s) => s.id);
      essentialSections.forEach((essential) => {
        expect(sectionIds).toContain(essential);
      });
    });

    it('includes GDPR and CCPA compliance mentions', () => {
      const hasGDPR = privacyPolicy.sections.some((section) =>
        section.content.some((c) => c.includes('GDPR') || c.includes('General Data Protection')),
      );
      const hasCCPA = privacyPolicy.sections.some((section) =>
        section.content.some((c) => c.includes('CCPA') || c.includes('California Consumer')),
      );
      expect(hasGDPR || hasCCPA).toBeTruthy();
    });

    it('includes data retention information', () => {
      const hasRetention = privacyPolicy.sections.some(
        (section) =>
          section.title.includes('Retention') ||
          section.content.some((c) => c.toLowerCase().includes('retention')),
      );
      expect(hasRetention).toBeTruthy();
    });

    it('has at least 12 sections for comprehensive coverage', () => {
      expect(privacyPolicy.sections.length).toBeGreaterThanOrEqual(12);
    });
  });

  describe('Issue Resolution Policy Content', () => {
    it('contains essential resolution sections', () => {
      const essentialSections = [
        'overview',
        'covered-issues',
        'resolution-process',
        'response-times',
        'escalation',
        'contact-info',
      ];

      const sectionIds = issueResolutionPolicy.sections.map((s) => s.id);
      essentialSections.forEach((essential) => {
        expect(sectionIds).toContain(essential);
      });
    });

    it('includes response time commitments', () => {
      const hasResponseTimes = issueResolutionPolicy.sections.some(
        (section) =>
          section.id === 'response-times' ||
          section.content.some((c) => c.includes('business days') || c.includes('hours')),
      );
      expect(hasResponseTimes).toBeTruthy();
    });

    it('covers multiple issue types', () => {
      const issueTypes = ['technical', 'billing', 'account', 'reading'];
      const coversMultipleTypes = issueTypes.filter((type) =>
        issueResolutionPolicy.sections.some((section) =>
          section.content.some((c) => c.toLowerCase().includes(type)),
        ),
      );
      expect(coversMultipleTypes.length).toBeGreaterThanOrEqual(3);
    });

    it('has at least 10 sections for comprehensive coverage', () => {
      expect(issueResolutionPolicy.sections.length).toBeGreaterThanOrEqual(10);
    });
  });

  describe('Cross-Document Consistency', () => {
    it('all documents have consistent date format', () => {
      const dates = [
        termsOfService.lastUpdated,
        privacyPolicy.lastUpdated,
        issueResolutionPolicy.lastUpdated,
      ];

      dates.forEach((date) => {
        expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });
    });

    it('all documents have same version number for initial release', () => {
      expect(termsOfService.version).toBe('1.0.0');
      expect(privacyPolicy.version).toBe('1.0.0');
      expect(issueResolutionPolicy.version).toBe('1.0.0');
    });

    it('all documents have professional formatting', () => {
      const documents = [termsOfService, privacyPolicy, issueResolutionPolicy];

      documents.forEach((doc) => {
        doc.sections.forEach((section) => {
          // Check titles are properly formatted (start with number or capital)
          expect(section.title).toMatch(/^(\d+\.|[A-Z])/);

          // Check content doesn't have trailing/leading whitespace
          section.content.forEach((paragraph) => {
            expect(paragraph).toBe(paragraph.trim());
          });
        });
      });
    });
  });

  describe('Content Quality Checks', () => {
    it('no Lorem Ipsum or placeholder text', () => {
      const documents = [termsOfService, privacyPolicy, issueResolutionPolicy];

      documents.forEach((doc) => {
        doc.sections.forEach((section) => {
          section.content.forEach((paragraph) => {
            expect(paragraph.toLowerCase()).not.toContain('lorem ipsum');
            expect(paragraph.toLowerCase()).not.toContain('placeholder');
            expect(paragraph.toLowerCase()).not.toContain('todo');
            expect(paragraph.toLowerCase()).not.toContain('tbd');
          });
        });
      });
    });

    it('includes company name in documents', () => {
      const documents = [termsOfService, privacyPolicy, issueResolutionPolicy];

      documents.forEach((doc) => {
        const hasCompanyName = doc.sections.some((section) =>
          section.content.some((c) => c.includes('Aura28')),
        );
        expect(hasCompanyName).toBeTruthy();
      });
    });

    it('sections have meaningful content length', () => {
      const documents = [termsOfService, privacyPolicy, issueResolutionPolicy];

      documents.forEach((doc) => {
        doc.sections.forEach((section) => {
          // Each section should have substantial content
          const totalContent = section.content.join(' ');
          expect(totalContent.length).toBeGreaterThan(50);
        });
      });
    });
  });
});
