import { AdminApi } from '@/lib/api/admin-api';
import { AuthService } from '@/lib/auth/auth-service';

// Mock fetch
global.fetch = jest.fn();

describe('AdminApi', () => {
  let adminApi: AdminApi;
  let mockAuthService: jest.Mocked<AuthService>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock AuthService
    mockAuthService = {
      getIdToken: jest.fn(),
    } as unknown as jest.Mocked<AuthService>;

    // Set environment variable
    process.env.NEXT_PUBLIC_API_GATEWAY_URL = 'https://api.example.com/';

    adminApi = new AdminApi(mockAuthService);
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_API_GATEWAY_URL;
  });

  describe('constructor', () => {
    test('initializes with auth service and base URL', () => {
      expect(adminApi).toBeDefined();
    });

    test('logs error when API Gateway URL is not configured', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      delete process.env.NEXT_PUBLIC_API_GATEWAY_URL;

      new AdminApi(mockAuthService);

      expect(consoleErrorSpy).toHaveBeenCalledWith('API Gateway URL not configured');
      consoleErrorSpy.mockRestore();
    });
  });

  describe('getAllReadings', () => {
    test('fetches readings successfully without filters', async () => {
      const mockToken = 'test-id-token';
      const mockResponse = {
        readings: [
          {
            readingId: 'reading-1',
            userId: 'user-1',
            userEmail: 'user1@example.com',
            type: 'Soul Blueprint',
            status: 'Ready',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:01:00Z',
          },
        ],
        count: 1,
      };

      mockAuthService.getIdToken.mockResolvedValue(mockToken);
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await adminApi.getAllReadings();

      expect(mockAuthService.getIdToken).toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalledWith('https://api.example.com/api/admin/readings', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${mockToken}`,
        },
      });
      expect(result).toEqual(mockResponse);
    });

    test('fetches readings with all filters', async () => {
      const mockToken = 'test-id-token';
      const filters = {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        status: 'Ready',
        type: 'Soul Blueprint',
        userSearch: 'user@example.com',
        limit: 50,
        lastEvaluatedKey: 'nextPageKey',
      };

      mockAuthService.getIdToken.mockResolvedValue(mockToken);
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ readings: [], count: 0 }),
      });

      await adminApi.getAllReadings(filters);

      const expectedUrl = new URL('https://api.example.com/api/admin/readings');
      expectedUrl.searchParams.append('startDate', filters.startDate);
      expectedUrl.searchParams.append('endDate', filters.endDate);
      expectedUrl.searchParams.append('status', filters.status);
      expectedUrl.searchParams.append('type', filters.type);
      expectedUrl.searchParams.append('userSearch', filters.userSearch);
      expectedUrl.searchParams.append('limit', filters.limit.toString());
      expectedUrl.searchParams.append('lastEvaluatedKey', filters.lastEvaluatedKey);

      expect(global.fetch).toHaveBeenCalledWith(
        expectedUrl.toString(),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockToken}`,
          }),
        }),
      );
    });

    test('throws error when not authenticated', async () => {
      mockAuthService.getIdToken.mockResolvedValue(null);

      await expect(adminApi.getAllReadings()).rejects.toThrow('Not authenticated');
    });

    test('throws error with 403 response', async () => {
      mockAuthService.getIdToken.mockResolvedValue('test-token');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ error: 'Forbidden' }),
      });

      await expect(adminApi.getAllReadings()).rejects.toThrow(
        'Access denied. Admin privileges required.',
      );
    });

    test('throws error with other error responses', async () => {
      mockAuthService.getIdToken.mockResolvedValue('test-token');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal server error' }),
      });

      await expect(adminApi.getAllReadings()).rejects.toThrow('Internal server error');
    });

    test('throws generic error when no error message in response', async () => {
      mockAuthService.getIdToken.mockResolvedValue('test-token');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      });

      await expect(adminApi.getAllReadings()).rejects.toThrow('Failed to fetch readings');
    });

    test('logs and re-throws network errors', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const networkError = new Error('Network error');

      mockAuthService.getIdToken.mockResolvedValue('test-token');
      (global.fetch as jest.Mock).mockRejectedValue(networkError);

      await expect(adminApi.getAllReadings()).rejects.toThrow('Network error');
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error fetching admin readings:', networkError);

      consoleErrorSpy.mockRestore();
    });

    test('handles partial filters correctly', async () => {
      mockAuthService.getIdToken.mockResolvedValue('test-token');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ readings: [], count: 0 }),
      });

      // Test with only some filters
      await adminApi.getAllReadings({
        status: 'Processing',
        limit: 25,
      });

      const callUrl = (global.fetch as jest.Mock).mock.calls[0][0];
      expect(callUrl).toContain('status=Processing');
      expect(callUrl).toContain('limit=25');
      expect(callUrl).not.toContain('startDate');
      expect(callUrl).not.toContain('endDate');
    });
  });

  describe('getAllUsers', () => {
    test('fetches users successfully without parameters', async () => {
      const mockToken = 'test-id-token';
      const mockResponse = {
        users: [
          {
            userId: 'user-1',
            email: 'user1@example.com',
            name: 'User One',
            createdAt: '2024-01-01T00:00:00Z',
          },
        ],
        count: 1,
      };

      mockAuthService.getIdToken.mockResolvedValue(mockToken);
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await adminApi.getAllUsers();

      expect(global.fetch).toHaveBeenCalledWith('https://api.example.com/api/admin/users', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${mockToken}`,
        },
      });
      expect(result).toEqual(mockResponse);
    });

    test('fetches users with search term and pagination token', async () => {
      const mockToken = 'test-id-token';
      const searchTerm = 'john';
      const nextToken = 'pagination-token';

      mockAuthService.getIdToken.mockResolvedValue(mockToken);
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ users: [], count: 0 }),
      });

      await adminApi.getAllUsers(searchTerm, nextToken);

      const expectedUrl = new URL('https://api.example.com/api/admin/users');
      expectedUrl.searchParams.append('search', searchTerm);
      expectedUrl.searchParams.append('nextToken', nextToken);

      expect(global.fetch).toHaveBeenCalledWith(
        expectedUrl.toString(),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockToken}`,
          }),
        }),
      );
    });

    test('throws error when not authenticated', async () => {
      mockAuthService.getIdToken.mockResolvedValue(null);

      await expect(adminApi.getAllUsers()).rejects.toThrow('Not authenticated');
    });

    test('throws error with 403 response', async () => {
      mockAuthService.getIdToken.mockResolvedValue('test-token');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ error: 'Forbidden' }),
      });

      await expect(adminApi.getAllUsers()).rejects.toThrow(
        'Access denied. Admin privileges required.',
      );
    });

    test('throws error with other error responses', async () => {
      mockAuthService.getIdToken.mockResolvedValue('test-token');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Database error' }),
      });

      await expect(adminApi.getAllUsers()).rejects.toThrow('Database error');
    });

    test('throws generic error when no error message in response', async () => {
      mockAuthService.getIdToken.mockResolvedValue('test-token');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      });

      await expect(adminApi.getAllUsers()).rejects.toThrow('Failed to fetch users');
    });

    test('logs and re-throws network errors', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const networkError = new Error('Connection timeout');

      mockAuthService.getIdToken.mockResolvedValue('test-token');
      (global.fetch as jest.Mock).mockRejectedValue(networkError);

      await expect(adminApi.getAllUsers()).rejects.toThrow('Connection timeout');
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error fetching admin users:', networkError);

      consoleErrorSpy.mockRestore();
    });

    test('handles only search term without pagination', async () => {
      mockAuthService.getIdToken.mockResolvedValue('test-token');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ users: [], count: 0 }),
      });

      await adminApi.getAllUsers('test@example.com');

      const callUrl = (global.fetch as jest.Mock).mock.calls[0][0];
      expect(callUrl).toContain('search=test%40example.com');
      expect(callUrl).not.toContain('nextToken');
    });

    test('handles only pagination token without search', async () => {
      mockAuthService.getIdToken.mockResolvedValue('test-token');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ users: [], count: 0 }),
      });

      await adminApi.getAllUsers(undefined, 'next-page');

      const callUrl = (global.fetch as jest.Mock).mock.calls[0][0];
      expect(callUrl).toContain('nextToken=next-page');
      expect(callUrl).not.toContain('search');
    });
  });

  describe('getAuthHeaders', () => {
    test('returns headers with valid token', async () => {
      const mockToken = 'test-id-token';
      mockAuthService.getIdToken.mockResolvedValue(mockToken);

      // We need to test the private method indirectly through a public method
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ readings: [], count: 0 }),
      });

      await adminApi.getAllReadings();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${mockToken}`,
          },
        }),
      );
    });
  });

  describe('edge cases', () => {
    test('handles empty base URL gracefully', async () => {
      delete process.env.NEXT_PUBLIC_API_GATEWAY_URL;
      const api = new AdminApi(mockAuthService);

      mockAuthService.getIdToken.mockResolvedValue('test-token');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ readings: [], count: 0 }),
      });

      await api.getAllReadings();

      // Should still attempt to fetch with empty base URL
      expect(global.fetch).toHaveBeenCalledWith('api/admin/readings', expect.any(Object));
    });

    test('handles malformed JSON response', async () => {
      mockAuthService.getIdToken.mockResolvedValue('test-token');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      await expect(adminApi.getAllReadings()).rejects.toThrow('Invalid JSON');
    });

    test('handles undefined filter values correctly', async () => {
      mockAuthService.getIdToken.mockResolvedValue('test-token');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ readings: [], count: 0 }),
      });

      await adminApi.getAllReadings({
        startDate: undefined,
        endDate: undefined,
        status: undefined,
        type: undefined,
        userSearch: undefined,
        limit: undefined,
        lastEvaluatedKey: undefined,
      });

      const callUrl = (global.fetch as jest.Mock).mock.calls[0][0];
      // Should not include any query parameters for undefined values
      expect(callUrl).toBe('https://api.example.com/api/admin/readings');
    });
  });
});
