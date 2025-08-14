/**
 * Simple logger utility with redaction for sensitive data
 */
/**
 * Redact sensitive information from a string
 */
declare function redact(str: string): string;
/**
 * Redact sensitive information from an object
 */
declare function redactObject(obj: any): any;
/**
 * Safe logging functions with automatic redaction
 */
export declare const logger: {
  info: (message: string, data?: any) => void;
  warn: (message: string, data?: any) => void;
  error: (message: string, error?: any) => void;
};
export { redact, redactObject };
