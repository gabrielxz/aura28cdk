import { sanitizeFilename, generateReadingFilename } from '@/lib/utils/filename-sanitizer';

describe('sanitizeFilename', () => {
  it('should remove special characters', () => {
    expect(sanitizeFilename('John@Doe#123')).toBe('johndoe123');
    expect(sanitizeFilename('Alice!@#$%^&*()')).toBe('alice');
    expect(sanitizeFilename('Test/\\<>:|?*"')).toBe('test');
  });

  it('should replace spaces with hyphens', () => {
    expect(sanitizeFilename('John Doe')).toBe('john-doe');
    expect(sanitizeFilename('Alice  Bob  Charlie')).toBe('alice-bob-charlie');
    expect(sanitizeFilename('  Trim Spaces  ')).toBe('trim-spaces');
  });

  it('should handle Unicode characters', () => {
    expect(sanitizeFilename('Jöhn Döe')).toBe('jhn-de');
    expect(sanitizeFilename('María García')).toBe('mara-garca');
    expect(sanitizeFilename('北京市')).toBe('unnamed'); // Non-ASCII characters removed
  });

  it('should enforce length limits', () => {
    const longName = 'a'.repeat(100);
    const result = sanitizeFilename(longName);
    expect(result.length).toBeLessThanOrEqual(50);
    expect(result).toBe('a'.repeat(50));
  });

  it('should handle edge cases', () => {
    expect(sanitizeFilename('')).toBe('unnamed');
    expect(sanitizeFilename('   ')).toBe('unnamed');
    expect(sanitizeFilename('!@#$%')).toBe('unnamed');
    expect(sanitizeFilename(null as unknown as string)).toBe('unnamed');
    expect(sanitizeFilename(undefined as unknown as string)).toBe('unnamed');
  });

  it('should remove consecutive hyphens', () => {
    expect(sanitizeFilename('John--Doe')).toBe('john-doe');
    expect(sanitizeFilename('Alice___Bob')).toBe('alice-bob');
    expect(sanitizeFilename('Test---Name')).toBe('test-name');
  });

  it('should remove leading and trailing hyphens', () => {
    expect(sanitizeFilename('-John-Doe-')).toBe('john-doe');
    expect(sanitizeFilename('___Alice___')).toBe('alice');
    expect(sanitizeFilename('--Test--')).toBe('test');
  });

  it('should preserve valid characters', () => {
    expect(sanitizeFilename('john_doe.test')).toBe('john_doe.test');
    expect(sanitizeFilename('file-name_123.pdf')).toBe('file-name_123.pdf');
    expect(sanitizeFilename('Test.Document')).toBe('test.document');
  });

  it('should handle custom max length', () => {
    expect(sanitizeFilename('verylongname', 5)).toBe('veryl');
    expect(sanitizeFilename('short', 10)).toBe('short');
    expect(sanitizeFilename('exactly-ten', 10)).toBe('exactly-te');
  });
});

describe('generateReadingFilename', () => {
  it('should generate filename with correct format', () => {
    const testDate = new Date('2025-01-14T14:30:52.000Z');
    const result = generateReadingFilename('John Doe', testDate);

    // Note: The exact time string will depend on the timezone
    expect(result).toMatch(/^aura28-reading-john-doe-\d{4}-\d{2}-\d{2}-\d{6}\.pdf$/);
  });

  it('should use current date when no timestamp provided', () => {
    const result = generateReadingFilename('Alice Smith');
    expect(result).toMatch(/^aura28-reading-alice-smith-\d{4}-\d{2}-\d{2}-\d{6}\.pdf$/);
  });

  it('should sanitize birth name', () => {
    const testDate = new Date('2025-01-14T14:30:52.000Z');
    const result = generateReadingFilename('John@Doe!', testDate);
    expect(result).toMatch(/^aura28-reading-johndoe-\d{4}-\d{2}-\d{2}-\d{6}\.pdf$/);
  });

  it('should handle empty or invalid names', () => {
    const testDate = new Date('2025-01-14T14:30:52.000Z');
    const result = generateReadingFilename('', testDate);
    expect(result).toMatch(/^aura28-reading-unnamed-\d{4}-\d{2}-\d{2}-\d{6}\.pdf$/);
  });

  it('should pad date components correctly', () => {
    const testDate = new Date('2025-01-05T09:05:03.000Z');
    const result = generateReadingFilename('Test User', testDate);

    // Check that month, day, hours, minutes, seconds are padded
    expect(result).toContain('-01-'); // Month
    expect(result).toContain('-05-'); // Day
    // Time will vary by timezone, but format should be 6 digits
    expect(result).toMatch(/\d{6}\.pdf$/);
  });

  it('should handle names with only special characters', () => {
    const testDate = new Date('2025-01-14T14:30:52.000Z');
    const result = generateReadingFilename('@#$%^&*()', testDate);
    expect(result).toMatch(/^aura28-reading-unnamed-\d{4}-\d{2}-\d{2}-\d{6}\.pdf$/);
  });

  it('should handle names with mixed alphanumeric and special characters', () => {
    const testDate = new Date('2025-01-14T14:30:52.000Z');
    const result = generateReadingFilename('John123!@#Doe456', testDate);
    expect(result).toMatch(/^aura28-reading-john123doe456-\d{4}-\d{2}-\d{2}-\d{6}\.pdf$/);
  });

  it('should handle names with emojis', () => {
    const testDate = new Date('2025-01-14T14:30:52.000Z');
    const result = generateReadingFilename('John 😊 Doe', testDate);
    expect(result).toMatch(/^aura28-reading-john-doe-\d{4}-\d{2}-\d{2}-\d{6}\.pdf$/);
  });

  it('should handle very long names that get truncated', () => {
    const testDate = new Date('2025-01-14T14:30:52.000Z');
    const longName = 'VeryLongNameThatExceedsTheMaximumLengthAllowedForFilenames'.repeat(3);
    const result = generateReadingFilename(longName, testDate);

    // Check the filename format
    expect(result).toMatch(/^aura28-reading-.+-\d{4}-\d{2}-\d{2}-\d{6}\.pdf$/);

    // The sanitized name should be 50 characters or less
    // Note: The full filename includes prefix and date, but the name part is truncated
    const expectedName = longName.toLowerCase().substring(0, 50);
    expect(result).toContain(expectedName);
  });

  it('should handle names with path separators', () => {
    const testDate = new Date('2025-01-14T14:30:52.000Z');
    const result = generateReadingFilename('John/Doe\\Smith', testDate);
    expect(result).toMatch(/^aura28-reading-johndoesmith-\d{4}-\d{2}-\d{2}-\d{6}\.pdf$/);
  });

  it('should handle names with dots and extensions', () => {
    const testDate = new Date('2025-01-14T14:30:52.000Z');
    const result = generateReadingFilename('john.doe.txt', testDate);
    expect(result).toMatch(/^aura28-reading-john.doe.txt-\d{4}-\d{2}-\d{2}-\d{6}\.pdf$/);
  });

  it('should handle names with tabs and newlines', () => {
    const testDate = new Date('2025-01-14T14:30:52.000Z');
    const result = generateReadingFilename('John\tDoe\nSmith', testDate);
    expect(result).toMatch(/^aura28-reading-john-doe-smith-\d{4}-\d{2}-\d{2}-\d{6}\.pdf$/);
  });

  it('should handle names with multiple consecutive spaces', () => {
    const testDate = new Date('2025-01-14T14:30:52.000Z');
    const result = generateReadingFilename('John     Doe', testDate);
    expect(result).toMatch(/^aura28-reading-john-doe-\d{4}-\d{2}-\d{2}-\d{6}\.pdf$/);
  });

  it('should handle null and undefined gracefully', () => {
    const testDate = new Date('2025-01-14T14:30:52.000Z');
    const resultNull = generateReadingFilename(null as unknown as string, testDate);
    const resultUndefined = generateReadingFilename(undefined as unknown as string, testDate);

    expect(resultNull).toMatch(/^aura28-reading-unnamed-\d{4}-\d{2}-\d{2}-\d{6}\.pdf$/);
    expect(resultUndefined).toMatch(/^aura28-reading-unnamed-\d{4}-\d{2}-\d{2}-\d{6}\.pdf$/);
  });

  it('should handle numbers as input', () => {
    const testDate = new Date('2025-01-14T14:30:52.000Z');
    const result = generateReadingFilename(12345 as unknown as string, testDate);
    expect(result).toMatch(/^aura28-reading-unnamed-\d{4}-\d{2}-\d{2}-\d{6}\.pdf$/);
  });

  it('should handle objects as input', () => {
    const testDate = new Date('2025-01-14T14:30:52.000Z');
    const result = generateReadingFilename(
      { toString: () => 'ObjectName' } as unknown as string,
      testDate,
    );
    expect(result).toMatch(/^aura28-reading-unnamed-\d{4}-\d{2}-\d{2}-\d{6}\.pdf$/);
  });

  it('should generate unique filenames for same name at different times', () => {
    const date1 = new Date('2025-01-14T14:30:52.000Z');
    const date2 = new Date('2025-01-14T14:30:53.000Z'); // 1 second later

    const result1 = generateReadingFilename('John Doe', date1);
    const result2 = generateReadingFilename('John Doe', date2);

    expect(result1).not.toBe(result2);
    expect(result1).toMatch(/^aura28-reading-john-doe-\d{4}-\d{2}-\d{2}-\d{6}\.pdf$/);
    expect(result2).toMatch(/^aura28-reading-john-doe-\d{4}-\d{2}-\d{2}-\d{6}\.pdf$/);
  });
});
