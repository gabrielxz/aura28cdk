import { AuthService } from '@/lib/auth/auth-service';

export interface AdminReading {
  readingId: string;
  userId: string;
  userEmail?: string;
  type: string;
  status: 'Processing' | 'Ready' | 'Failed' | 'In Review';
  createdAt: string;
  updatedAt: string;
}

export interface AdminReadingDetails extends AdminReading {
  content?: {
    chartData?: Record<string, unknown>;
    interpretation?: string;
    insights?: string[];
    recommendations?: string[];
  };
  error?: string;
  metadata?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    processingTime?: number;
  };
}

export interface AdminReadingsResponse {
  readings: AdminReading[];
  count: number;
  lastEvaluatedKey?: string;
}

export interface AdminUser {
  userId: string;
  email: string;
  name?: string;
  createdAt: string;
}

export interface AdminUsersResponse {
  users: AdminUser[];
  count: number;
  nextToken?: string;
}

export interface ReadingsFilter {
  startDate?: string;
  endDate?: string;
  status?: string;
  type?: string;
  userSearch?: string;
  limit?: number;
  lastEvaluatedKey?: string;
}

export class AdminApi {
  private baseUrl: string;
  private authService: AuthService;

  constructor(authService: AuthService) {
    this.authService = authService;
    this.baseUrl = process.env.NEXT_PUBLIC_API_GATEWAY_URL || '';

    if (!this.baseUrl) {
      console.error('API Gateway URL not configured');
    }
  }

  private async getAuthHeaders(): Promise<HeadersInit> {
    const idToken = await this.authService.getIdToken();
    if (!idToken) {
      throw new Error('Not authenticated');
    }

    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    };
  }

  async getAllReadings(
    filters?: ReadingsFilter,
    signal?: AbortSignal,
  ): Promise<AdminReadingsResponse> {
    try {
      const headers = await this.getAuthHeaders();
      const queryParams = new URLSearchParams();

      if (filters) {
        if (filters.startDate) queryParams.append('startDate', filters.startDate);
        if (filters.endDate) queryParams.append('endDate', filters.endDate);
        if (filters.status) queryParams.append('status', filters.status);
        if (filters.type) queryParams.append('type', filters.type);
        if (filters.userSearch) queryParams.append('userSearch', filters.userSearch);
        if (filters.limit) queryParams.append('limit', filters.limit.toString());
        if (filters.lastEvaluatedKey)
          queryParams.append('lastEvaluatedKey', filters.lastEvaluatedKey);
      }

      const url = `${this.baseUrl}api/admin/readings${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal, // Add AbortSignal support
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('Access denied. Admin privileges required.');
        }
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch readings');
      }

      const data: AdminReadingsResponse = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching admin readings:', error);
      throw error;
    }
  }

  async getAllUsers(searchTerm?: string, nextToken?: string): Promise<AdminUsersResponse> {
    try {
      const headers = await this.getAuthHeaders();
      const queryParams = new URLSearchParams();

      if (searchTerm) queryParams.append('search', searchTerm);
      if (nextToken) queryParams.append('nextToken', nextToken);

      const url = `${this.baseUrl}api/admin/users${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const response = await fetch(url, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('Access denied. Admin privileges required.');
        }
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch users');
      }

      const data: AdminUsersResponse = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching admin users:', error);
      throw error;
    }
  }

  async getReadingDetails(readingId: string): Promise<AdminReadingDetails> {
    try {
      const headers = await this.getAuthHeaders();
      const url = `${this.baseUrl}api/admin/readings/${readingId}`;

      const response = await fetch(url, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('Access denied. Admin privileges required.');
        }
        if (response.status === 404) {
          throw new Error('Reading not found');
        }
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch reading details');
      }

      const data: AdminReadingDetails = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching reading details:', error);
      throw error;
    }
  }

  async updateReadingStatus(
    readingId: string,
    status: AdminReading['status'],
  ): Promise<AdminReading> {
    try {
      const headers = await this.getAuthHeaders();
      const url = `${this.baseUrl}api/admin/readings/${readingId}/status`;

      const response = await fetch(url, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('Access denied. Admin privileges required.');
        }
        if (response.status === 404) {
          throw new Error('Reading not found');
        }
        const error = await response.json();
        throw new Error(error.error || 'Failed to update reading status');
      }

      const data: AdminReading = await response.json();
      return data;
    } catch (error) {
      console.error('Error updating reading status:', error);
      throw error;
    }
  }

  async deleteReading(readingId: string): Promise<void> {
    try {
      const headers = await this.getAuthHeaders();
      const url = `${this.baseUrl}api/admin/readings/${readingId}`;

      const response = await fetch(url, {
        method: 'DELETE',
        headers,
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('Access denied. Admin privileges required.');
        }
        if (response.status === 404) {
          throw new Error('Reading not found');
        }
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete reading');
      }
    } catch (error) {
      console.error('Error deleting reading:', error);
      throw error;
    }
  }
}
