import { logger, redact, redactObject } from '../../lambda/utils/logger';

describe('Logger utility', () => {
  describe('redact function', () => {
    it('should redact email addresses', () => {
      const input = 'User email is john.doe@example.com';
      const output = redact(input);
      expect(output).toBe('User email is john.doe@[REDACTED]');
    });

    it('should redact JWT tokens', () => {
      const input =
        'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const output = redact(input);
      expect(output).toBe('Authorization: Bearer [REDACTED]');
    });

    it('should redact AWS access keys', () => {
      const input = 'AWS Key: AKIAIOSFODNN7EXAMPLE';
      const output = redact(input);
      expect(output).toBe('AWS Key: [REDACTED_AWS_KEY]');
    });

    it('should redact generic tokens', () => {
      const input = 'token=abcdefghijklmnopqrstuvwxyz123456';
      const output = redact(input);
      expect(output).toBe('token=[REDACTED]');
    });

    it('should handle multiple redactions in one string', () => {
      const input = 'User test@example.com has token=verylongtokenvalue123456789';
      const output = redact(input);
      expect(output).toBe('User test@[REDACTED] has token=[REDACTED]');
    });
  });

  describe('redactObject function', () => {
    it('should redact sensitive keys in objects', () => {
      const input = {
        userId: 'user-123',
        email: 'john@example.com',
        token: 'secret-token-value',
        data: 'regular data',
      };
      const output = redactObject(input);
      expect(output).toEqual({
        userId: 'user-123',
        email: '[REDACTED]',
        token: '[REDACTED]',
        data: 'regular data',
      });
    });

    it('should handle nested objects', () => {
      const input = {
        user: {
          id: '123',
          email: 'test@example.com',
          profile: {
            name: 'John',
            password: 'super-secret',
          },
        },
      };
      const output = redactObject(input);
      expect(output).toEqual({
        user: {
          id: '123',
          email: '[REDACTED]',
          profile: {
            name: 'John',
            password: '[REDACTED]',
          },
        },
      });
    });

    it('should handle arrays', () => {
      const input = [
        { email: 'user1@example.com', id: 1 },
        { email: 'user2@example.com', id: 2 },
      ];
      const output = redactObject(input);
      expect(output).toEqual([
        { email: '[REDACTED]', id: 1 },
        { email: '[REDACTED]', id: 2 },
      ]);
    });

    it('should handle null and undefined', () => {
      expect(redactObject(null)).toBeNull();
      expect(redactObject(undefined)).toBeUndefined();
    });

    it('should redact authorization headers', () => {
      const input = {
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
        },
      };
      const output = redactObject(input);
      expect(output).toEqual({
        headers: {
          'Content-Type': 'application/json',
          Authorization: '[REDACTED]',
        },
      });
    });
  });

  describe('logger methods', () => {
    let consoleInfoSpy: jest.SpyInstance;
    let consoleWarnSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();
      consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    });

    afterEach(() => {
      consoleInfoSpy.mockRestore();
      consoleWarnSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('should redact email in info log', () => {
      logger.info('User logged in: test@example.com');
      expect(consoleInfoSpy).toHaveBeenCalledWith('User logged in: test@[REDACTED]', '');
    });

    it('should redact sensitive data in info log', () => {
      logger.info('User data', { email: 'test@example.com', name: 'John' });
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        'User data',
        expect.stringContaining('"email": "[REDACTED]"'),
      );
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        'User data',
        expect.stringContaining('"name": "John"'),
      );
    });

    it('should redact in warn logs', () => {
      logger.warn('Invalid token: Bearer abc123def456ghi789jkl012mno345pqr678');
      expect(consoleWarnSpy).toHaveBeenCalledWith('Invalid token: Bearer [REDACTED]', '');
    });

    it('should redact Error messages', () => {
      const error = new Error('Failed to authenticate user@example.com');
      logger.error('Authentication failed', error);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Authentication failed',
        expect.stringContaining('"message": "Failed to authenticate user@[REDACTED]"'),
      );
    });

    it('should handle errors without stack trace', () => {
      const error = { message: 'User test@example.com not found', code: 404 };
      logger.error('Error occurred', error);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error occurred',
        expect.stringContaining('"message": "User test@[REDACTED] not found"'),
      );
    });
  });
});
