import { generateReadingFilename } from '@/lib/utils/filename-sanitizer';

/**
 * Options for PDF generation
 */
export interface PDFGenerationOptions {
  birthName: string;
  readingType: string;
  content: string;
  createdAt: string;
  onProgress?: (progress: number) => void;
}

/**
 * Result of PDF generation
 */
export interface PDFGenerationResult {
  success: boolean;
  filename?: string;
  error?: string;
}

/**
 * Formats the reading content for PDF display
 * @param content - The raw reading content
 * @returns HTML-formatted content for PDF
 */
function formatContentForPDF(content: string): string {
  // Escape HTML special characters
  const escaped = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  // Convert line breaks to HTML breaks and wrap in paragraphs
  const paragraphs = escaped.split('\n\n').map((para) => {
    const formatted = para.replace(/\n/g, '<br/>');
    return `<p style="margin-bottom: 12px; line-height: 1.6;">${formatted}</p>`;
  });

  return paragraphs.join('');
}

/**
 * Generates a PDF from a reading
 * @param options - PDF generation options
 * @returns Promise with generation result
 */
export async function generateReadingPDF(
  options: PDFGenerationOptions,
): Promise<PDFGenerationResult> {
  try {
    // Dynamic import to reduce initial bundle size
    const jsPDF = (await import('jspdf')).default;

    // Report progress
    options.onProgress?.(10);

    // Create new PDF document
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    // Set document properties
    doc.setProperties({
      title: `Aura28 ${options.readingType} Reading`,
      author: 'Aura28',
      creator: 'Aura28 Platform',
    });

    options.onProgress?.(20);

    // Format the creation date
    const createdDate = new Date(options.createdAt);
    const formattedDate = createdDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    // Create HTML content
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 170mm;">
        <!-- Header -->
        <div style="border-bottom: 2px solid #4a5568; padding-bottom: 10px; margin-bottom: 20px;">
          <h1 style="color: #2d3748; font-size: 24px; margin: 0;">Aura28 Astrological Reading</h1>
          <h2 style="color: #4a5568; font-size: 18px; margin: 5px 0;">${options.readingType}</h2>
          <p style="color: #718096; font-size: 12px; margin: 5px 0;">
            For: ${options.birthName}<br/>
            Generated: ${formattedDate}
          </p>
        </div>
        
        <!-- Content -->
        <div style="color: #2d3748; font-size: 11px; line-height: 1.6;">
          ${formatContentForPDF(options.content)}
        </div>
        
        <!-- Footer -->
        <div style="margin-top: 30px; padding-top: 10px; border-top: 1px solid #e2e8f0;">
          <p style="color: #718096; font-size: 10px; text-align: center;">
            © ${new Date().getFullYear()} Aura28 - Personal Astrological Reading
          </p>
        </div>
      </div>
    `;

    options.onProgress?.(40);

    // Add HTML content to PDF
    await new Promise<void>((resolve) => {
      doc.html(htmlContent, {
        callback: function () {
          resolve();
        },
        x: 10,
        y: 10,
        width: 170, // A4 width minus margins
        windowWidth: 650,
        html2canvas: {
          scale: 0.5,
          useCORS: true,
        },
        autoPaging: 'text',
        margin: [10, 10, 10, 10],
      });
    });

    options.onProgress?.(80);

    // Generate filename
    const filename = generateReadingFilename(options.birthName);

    // Save the PDF
    doc.save(filename);

    options.onProgress?.(100);

    return {
      success: true,
      filename,
    };
  } catch (error) {
    console.error('Failed to generate PDF:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate PDF',
    };
  }
}

/**
 * Checks if the browser supports PDF generation
 * @returns True if PDF generation is supported
 */
export function isPDFGenerationSupported(): boolean {
  // Check for required browser APIs
  if (typeof window === 'undefined') {
    return false;
  }

  // Check for Blob support (required for file download)
  if (!window.Blob) {
    return false;
  }

  // Check for download capability
  const isDownloadSupported = 'download' in document.createElement('a');
  if (!isDownloadSupported) {
    return false;
  }

  return true;
}
