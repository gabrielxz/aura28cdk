/**
 * Sanitizes a string to be used as a filename by removing or replacing invalid characters
 * @param input - The string to sanitize
 * @param maxLength - Maximum length of the output string (default: 50)
 * @returns A sanitized string safe for use as a filename
 */
export function sanitizeFilename(input: string, maxLength: number = 50): string {
  if (!input || typeof input !== 'string') {
    return 'unnamed';
  }

  // Remove leading/trailing whitespace
  let sanitized = input.trim();

  // Replace spaces with hyphens
  sanitized = sanitized.replace(/\s+/g, '-');

  // Remove or replace invalid filename characters
  // Keep only alphanumeric, hyphens, underscores, and dots
  sanitized = sanitized.replace(/[^a-zA-Z0-9\-_.]/g, '');

  // Remove consecutive hyphens or underscores
  sanitized = sanitized.replace(/[-_]{2,}/g, '-');

  // Remove leading/trailing hyphens or underscores
  sanitized = sanitized.replace(/^[-_]+|[-_]+$/g, '');

  // Convert to lowercase for consistency
  sanitized = sanitized.toLowerCase();

  // Truncate to maxLength
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
    // Remove trailing hyphen or underscore if truncation caused it
    sanitized = sanitized.replace(/[-_]+$/, '');
  }

  // If string is empty after sanitization, use default
  if (!sanitized) {
    return 'unnamed';
  }

  return sanitized;
}

/**
 * Generates a filename for a reading PDF
 * @param birthName - The user's birth name
 * @param timestamp - Optional timestamp to use (defaults to current time)
 * @returns A formatted filename for the PDF
 */
export function generateReadingFilename(birthName: string, timestamp?: Date): string {
  const sanitizedName = sanitizeFilename(birthName);
  const date = timestamp || new Date();

  // Format date as YYYY-MM-DD-HHmmss
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  const dateString = `${year}-${month}-${day}-${hours}${minutes}${seconds}`;

  return `aura28-reading-${sanitizedName}-${dateString}.pdf`;
}
