"use strict";
/**
 * Simple logger utility with redaction for sensitive data
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
exports.redact = redact;
exports.redactObject = redactObject;
// Patterns for sensitive data to redact
const REDACTION_PATTERNS = [
    // Email addresses
    { pattern: /([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, replacement: '$1@[REDACTED]' },
    // JWT tokens (Bearer tokens with dots)
    {
        pattern: /Bearer\s+[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/g,
        replacement: 'Bearer [REDACTED]',
    },
    // Simple Bearer tokens (without dots)
    {
        pattern: /Bearer\s+[A-Za-z0-9-_]{20,}/g,
        replacement: 'Bearer [REDACTED]',
    },
    // AWS Access Keys
    { pattern: /AKIA[0-9A-Z]{16}/g, replacement: '[REDACTED_AWS_KEY]' },
    // Generic tokens (at least 20 chars)
    {
        pattern: /\b(token|jwt|auth|key|secret|password)["']?\s*[:=]\s*["']?([A-Za-z0-9-_]{20,})["']?/gi,
        replacement: '$1=[REDACTED]',
    },
];
/**
 * Redact sensitive information from a string
 */
function redact(str) {
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
function redactObject(obj) {
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
        const redactedObj = {};
        for (const key in obj) {
            // Redact values for sensitive keys
            if (/email|token|jwt|auth|key|secret|password|authorization/i.test(key)) {
                redactedObj[key] = '[REDACTED]';
            }
            else {
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
exports.logger = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    info: (message, data) => {
        const redactedMessage = redact(message);
        const redactedData = data ? redactObject(data) : undefined;
        console.info(redactedMessage, redactedData ? JSON.stringify(redactedData, null, 2) : '');
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    warn: (message, data) => {
        const redactedMessage = redact(message);
        const redactedData = data ? redactObject(data) : undefined;
        console.warn(redactedMessage, redactedData ? JSON.stringify(redactedData, null, 2) : '');
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    error: (message, error) => {
        const redactedMessage = redact(message);
        if (error instanceof Error) {
            const redactedError = {
                message: redact(error.message),
                stack: error.stack ? redact(error.stack) : undefined,
            };
            console.error(redactedMessage, JSON.stringify(redactedError, null, 2));
        }
        else if (error) {
            const redactedError = redactObject(error);
            console.error(redactedMessage, JSON.stringify(redactedError, null, 2));
        }
        else {
            console.error(redactedMessage);
        }
    },
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9nZ2VyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsibG9nZ2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7R0FFRzs7O0FBNEdNLHdCQUFNO0FBQUUsb0NBQVk7QUExRzdCLHdDQUF3QztBQUN4QyxNQUFNLGtCQUFrQixHQUFHO0lBQ3pCLGtCQUFrQjtJQUNsQixFQUFFLE9BQU8sRUFBRSxxREFBcUQsRUFBRSxXQUFXLEVBQUUsZUFBZSxFQUFFO0lBQ2hHLHVDQUF1QztJQUN2QztRQUNFLE9BQU8sRUFBRSwwREFBMEQ7UUFDbkUsV0FBVyxFQUFFLG1CQUFtQjtLQUNqQztJQUNELHNDQUFzQztJQUN0QztRQUNFLE9BQU8sRUFBRSw4QkFBOEI7UUFDdkMsV0FBVyxFQUFFLG1CQUFtQjtLQUNqQztJQUNELGtCQUFrQjtJQUNsQixFQUFFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxXQUFXLEVBQUUsb0JBQW9CLEVBQUU7SUFDbkUscUNBQXFDO0lBQ3JDO1FBQ0UsT0FBTyxFQUNMLHVGQUF1RjtRQUN6RixXQUFXLEVBQUUsZUFBZTtLQUM3QjtDQUNGLENBQUM7QUFFRjs7R0FFRztBQUNILFNBQVMsTUFBTSxDQUFDLEdBQVc7SUFDekIsSUFBSSxRQUFRLEdBQUcsR0FBRyxDQUFDO0lBQ25CLEtBQUssTUFBTSxFQUFFLE9BQU8sRUFBRSxXQUFXLEVBQUUsSUFBSSxrQkFBa0IsRUFBRSxDQUFDO1FBQzFELFFBQVEsR0FBRyxRQUFRLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxXQUFXLENBQUMsQ0FBQztJQUNwRCxDQUFDO0lBQ0QsT0FBTyxRQUFRLENBQUM7QUFDbEIsQ0FBQztBQUVEOztHQUVHO0FBQ0gsOERBQThEO0FBQzlELFNBQVMsWUFBWSxDQUFDLEdBQVE7SUFDNUIsSUFBSSxPQUFPLEdBQUcsS0FBSyxRQUFRLEVBQUUsQ0FBQztRQUM1QixPQUFPLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUNyQixDQUFDO0lBRUQsSUFBSSxH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Q0FBQyxLQUFLLENBQUMsZUFBZSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsYUFBYSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3pFLENBQUM7YUFBTSxDQUFDO1lBQ04sT0FBTyxDQUFDLEtBQUssQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUNqQyxDQUFDO0lBQ0gsQ0FBQztDQUNGLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIFNpbXBsZSBsb2dnZXIgdXRpbGl0eSB3aXRoIHJlZGFjdGlvbiBmb3Igc2Vuc2l0aXZlIGRhdGFcbiAqL1xuXG4vLyBQYXR0ZXJucyBmb3Igc2Vuc2l0aXZlIGRhdGEgdG8gcmVkYWN0XG5jb25zdCBSRURBQ1RJT05fUEFUVEVSTlMgPSBbXG4gIC8vIEVtYWlsIGFkZHJlc3Nlc1xuICB7IHBhdHRlcm46IC8oW2EtekEtWjAtOS5fJSstXSspQChbYS16QS1aMC05Li1dK1xcLlthLXpBLVpdezIsfSkvZywgcmVwbGFjZW1lbnQ6ICckMUBbUkVEQUNURURdJyB9LFxuICAvLyBKV1QgdG9rZW5zIChCZWFyZXIgdG9rZW5zIHdpdGggZG90cylcbiAge1xuICAgIHBhdHRlcm46IC9CZWFyZXJcXHMrW0EtWmEtejAtOS1fXStcXC5bQS1aYS16MC05LV9dK1xcLltBLVphLXowLTktX10rL2csXG4gICAgcmVwbGFjZW1lbnQ6ICdCZWFyZXIgW1JFREFDVEVEXScsXG4gIH0sXG4gIC8vIFNpbXBsZSBCZWFyZXIgdG9rZW5zICh3aXRob3V0IGRvdHMpXG4gIHtcbiAgICBwYXR0ZXJuOiAvQmVhcmVyXFxzK1tBLVphLXowLTktX117MjAsfS9nLFxuICAgIHJlcGxhY2VtZW50OiAnQmVhcmVyIFtSRURBQ1RFRF0nLFxuICB9LFxuICAvLyBBV1MgQWNjZXNzIEtleXNcbiAgeyBwYXR0ZXJuOiAvQUtJQVswLTlBLVpdezE2fS9nLCByZXBsYWNlbWVudDogJ1tSRURBQ1RFRF9BV1NfS0VZXScgfSxcbiAgLy8gR2VuZXJpYyB0b2tlbnMgKGF0IGxlYXN0IDIwIGNoYXJzKVxuICB7XG4gICAgcGF0dGVybjpcbiAgICAgIC9cXGIodG9rZW58and0fGF1dGh8a2V5fHNlY3JldHxwYXNzd29yZClbXCInXT9cXHMqWzo9XVxccypbXCInXT8oW0EtWmEtejAtOS1fXXsyMCx9KVtcIiddPy9naSxcbiAgICByZXBsYWNlbWVudDogJyQxPVtSRURBQ1RFRF0nLFxuICB9LFxuXTtcblxuLyoqXG4gKiBSZWRhY3Qgc2Vuc2l0aXZlIGluZm9ybWF0aW9uIGZyb20gYSBzdHJpbmdcbiAqL1xuZnVuY3Rpb24gcmVkYWN0KHN0cjogc3RyaW5nKTogc3RyaW5nIHtcbiAgbGV0IHJlZGFjdGVkID0gc3RyO1xuICBmb3IgKGNvbnN0IHsgcGF0dGVybiwgcmVwbGFjZW1lbnQgfSBvZiBSRURBQ1RJT05fUEFUVEVSTlMpIHtcbiAgICByZWRhY3RlZCA9IHJlZGFjdGVkLnJlcGxhY2UocGF0dGVybiwgcmVwbGFjZW1lbnQpO1xuICB9XG4gIHJldHVybiByZWRhY3RlZDtcbn1cblxuLyoqXG4gKiBSZWRhY3Qgc2Vuc2l0aXZlIGluZm9ybWF0aW9uIGZyb20gYW4gb2JqZWN0XG4gKi9cbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5mdW5jdGlvbiByZWRhY3RPYmplY3Qob2JqOiBhbnkpOiBhbnkge1xuICBpZiAodHlwZW9mIG9iaiA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gcmVkYWN0KG9iaik7XG4gIH1cblxuICBpZiAob2JqID09PSBudWxsIHx8IG9iaiA9PT0gdW5kZWZpbmVkKSB7XG4gICAgcmV0dXJuIG9iajtcbiAgfVxuXG4gIGlmIChBcnJheS5pc0FycmF5KG9iaikpIHtcbiAgICByZXR1cm4gb2JqLm1hcChyZWRhY3RPYmplY3QpO1xuICB9XG5cbiAgaWYgKHR5cGVvZiBvYmogPT09ICdvYmplY3QnKSB7XG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICBjb25zdCByZWRhY3RlZE9iajogYW55ID0ge307XG4gICAgZm9yIChjb25zdCBrZXkgaW4gb2JqKSB7XG4gICAgICAvLyBSZWRhY3QgdmFsdWVzIGZvciBzZW5zaXRpdmUga2V5c1xuICAgICAgaWYgKC9lbWFpbHx0b2tlbnxqd3R8YXV0aHxrZXl8c2VjcmV0fHBhc3N3b3JkfGF1dGhvcml6YXRpb24vaS50ZXN0KGtleSkpIHtcbiAgICAgICAgcmVkYWN0ZWRPYmpba2V5XSA9ICdbUkVEQUNURURdJztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlZGFjdGVkT2JqW2tleV0gPSByZWRhY3RPYmplY3Qob2JqW2tleV0pO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVkYWN0ZWRPYmo7XG4gIH1cblxuICByZXR1cm4gb2JqO1xufVxuXG4vKipcbiAqIFNhZmUgbG9nZ2luZyBmdW5jdGlvbnMgd2l0aCBhdXRvbWF0aWMgcmVkYWN0aW9uXG4gKi9cbmV4cG9ydCBjb25zdCBsb2dnZXIgPSB7XG4gIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gIGluZm86IChtZXNzYWdlOiBzdHJpbmcsIGRhdGE/OiBhbnkpID0+IHtcbiAgICBjb25zdCByZWRhY3RlZE1lc3NhZ2UgPSByZWRhY3QobWVzc2FnZSk7XG4gICAgY29uc3QgcmVkYWN0ZWREYXRhID0gZGF0YSA/IHJlZGFjdE9iamVjdChkYXRhKSA6IHVuZGVmaW5lZDtcbiAgICBjb25zb2xlLmluZm8ocmVkYWN0ZWRNZXNzYWdlLCByZWRhY3RlZERhdGEgPyBKU09OLnN0cmluZ2lmeShyZWRhY3RlZERhdGEsIG51bGwsIDIpIDogJycpO1xuICB9LFxuXG4gIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gIHdhcm46IChtZXNzYWdlOiBzdHJpbmcsIGRhdGE/OiBhbnkpID0+IHtcbiAgICBjb25zdCByZWRhY3RlZE1lc3NhZ2UgPSByZWRhY3QobWVzc2FnZSk7XG4gICAgY29uc3QgcmVkYWN0ZWREYXRhID0gZGF0YSA/IHJlZGFjdE9iamVjdChkYXRhKSA6IHVuZGVmaW5lZDtcbiAgICBjb25zb2xlLndhcm4ocmVkYWN0ZWRNZXNzYWdlLCByZWRhY3RlZERhdGEgPyBKU09OLnN0cmluZ2lmeShyZWRhY3RlZERhdGEsIG51bGwsIDIpIDogJycpO1xuICB9LFxuXG4gIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gIGVycm9yOiAobWVzc2FnZTogc3RyaW5nLCBlcnJvcj86IGFueSkgPT4ge1xuICAgIGNvbnN0IHJlZGFjdGVkTWVzc2FnZSA9IHJlZGFjdChtZXNzYWdlKTtcbiAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBFcnJvcikge1xuICAgICAgY29uc3QgcmVkYWN0ZWRFcnJvciA9IHtcbiAgICAgICAgbWVzc2FnZTogcmVkYWN0KGVycm9yLm1lc3NhZ2UpLFxuICAgICAgICBzdGFjazogZXJyb3Iuc3RhY2sgPyByZWRhY3QoZXJyb3Iuc3RhY2spIDogdW5kZWZpbmVkLFxuICAgICAgfTtcbiAgICAgIGNvbnNvbGUuZXJyb3IocmVkYWN0ZWRNZXNzYWdlLCBKU09OLnN0cmluZ2lmeShyZWRhY3RlZEVycm9yLCBudWxsLCAyKSk7XG4gICAgfSBlbHNlIGlmIChlcnJvcikge1xuICAgICAgY29uc3QgcmVkYWN0ZWRFcnJvciA9IHJlZGFjdE9iamVjdChlcnJvcik7XG4gICAgICBjb25zb2xlLmVycm9yKHJlZGFjdGVkTWVzc2FnZSwgSlNPTi5zdHJpbmdpZnkocmVkYWN0ZWRFcnJvciwgbnVsbCwgMikpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmVycm9yKHJlZGFjdGVkTWVzc2FnZSk7XG4gICAgfVxuICB9LFxufTtcblxuLy8gRXhwb3J0IHRoZSByZWRhY3QgZnVuY3Rpb24gZm9yIHRlc3RpbmdcbmV4cG9ydCB7IHJlZGFjdCwgcmVkYWN0T2JqZWN0IH07XG4iXX0=