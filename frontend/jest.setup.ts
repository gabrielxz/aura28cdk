import '@testing-library/jest-dom';

// Mock fetch globally for tests
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
    headers: new Headers(),
  } as Response),
);

// Suppress expected console errors in tests
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: Parameters<typeof console.error>) => {
    // Suppress expected API Gateway URL warning in tests
    if (typeof args[0] === 'string' && args[0].includes('API Gateway URL not configured')) {
      return;
    }
    // Suppress expected fetch errors in tests
    if (typeof args[0] === 'string' && args[0].includes('Error fetching user profile')) {
      return;
    }
    // Suppress expected auth callback errors in tests
    if (typeof args[0] === 'string' && args[0].includes('Auth callback error:')) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});

// Suppress expected console.info messages
const originalInfo = console.info;
beforeAll(() => {
  console.info = (...args: Parameters<typeof console.info>) => {
    // Suppress expected profile fetch info in tests
    if (typeof args[0] === 'string' && args[0].includes('Could not fetch profile')) {
      return;
    }
    originalInfo.call(console, ...args);
  };
});

afterAll(() => {
  console.info = originalInfo;
});
