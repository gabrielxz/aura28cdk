/**
 * Simple logger utility with redaction for sensitive data
 */

// Patterns for sensitive data to redact
const REDACTION_PATTERNS = [
  // Email addresses
  { pattern: /([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, replacement: '$1@[REDACTED]' },
  // JWT tokens (Bearer tokens)
  {
    pattern: /Bearer\s+[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/g,
    replacement: 'Bearer [REDACTED]',
  },
  // AWS Access Keys
  { pattern: /AKIA[0-9A-Z]{16}/g, replacement: '[REDACTED_AWS_KEY]' },
  // Generic tokens (at least 20 chars)
  {
    pattern:
      /\b(token|jwt|auth|key|secret|password)["']?\s*[:=]\s*["']?([A-Za-z0-9-_]{20,})["']?/gi,
    replacement: '$1=[REDACTED]',
  },
];

/**
 * Redact sensitive information from a string
 */
function redact(str: string): string {
  let redacted = str;
  for (const { pattern, replacement } of REDACTION_PATTERNS) {
    redacted = redacted.replace(pattern, replacement);
  }
  return redacted;
}

/**
 * Redact sensitive information from an object
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function redactObject(obj: any): any {
  if (typeof obj === 'string') {
    return redact(obj);
  }

  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(redactObject);
  }

  if (typeof obj === 'object') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const redactedObj: any = {};
    for (const key in obj) {
      // Redact values for sensitive keys
      if (/email|token|jwt|auth|key|secret|password|authorization/i.test(key)) {
        redactedObj[key] = '[REDACTED]';
      } else {
        redactedObj[key] = redactObject(obj[key]);
      }
    }
    return redactedObj;
  }

  return obj;
}

/**
 * Safe logging functions with automatic redaction
 */
export const logger = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  info: (message: string, data?: any) => {
    const redactedMessage = redact(message);
    const redactedData = data ? redactObject(data) : undefined;
    console.info(redactedMessage, redactedData ? JSON.stringify(redactedData, null, 2) : '');
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  warn: (message: string, data?: any) => {
    const redactedMessage = redact(message);
    const redactedData = data ? redactObject(data) : undefined;
    console.warn(redactedMessage, redactedData ? JSON.stringify(redactedData, null, 2) : '');
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: (message: string, error?: any) => {
    const redactedMessage = redact(message);
    if (error instanceof Error) {
      const redactedError = {
        message: redact(error.message),
        stack: error.stack ? redact(error.stack) : undefined,
      };
      console.error(redactedMessage, JSON.stringify(redactedError, null, 2));
    } else if (error) {
      const redactedError = redactObject(error);
      console.error(redactedMessage, JSON.stringify(redactedError, null, 2));
    } else {
      console.error(redactedMessage);
    }
  },
};

// Export the redact function for testing
export { redact, redactObject };
