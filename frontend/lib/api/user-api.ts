import { AuthService } from '@/lib/auth/auth-service';

export interface UserProfile {
  email: string;
  birthName: string;
  birthDate: string;
  birthTime?: string;
  birthCity: string;
  birthState: string;
  birthCountry: string;
  birthLatitude?: number;
  birthLongitude?: number;
  ianaTimeZone?: string;
  standardizedLocationName?: string;
}

export interface UserProfileResponse {
  userId: string;
  createdAt: string;
  email: string;
  profile: UserProfile;
  onboardingCompleted: boolean;
  updatedAt: string;
  firstCreatedAt?: string;
}

export interface UpdateProfileResponse {
  message: string;
  profile: UserProfileResponse;
}

export interface HouseData {
  houseNumber: number;
  cuspDegree: number;
  cuspSign: string;
  cuspDegreeInSign: number;
  cuspMinutes: number;
}

export interface AngleData {
  degree: number;
  sign: string;
  degreeInSign: number;
  minutes: number;
}

export interface PlanetData {
  longitude: number;
  longitudeDms: string;
  distanceKm: number;
  name: string;
  sign: string;
  degreeInSign: number;
  minutes: number;
}

export interface NatalChart {
  userId: string;
  chartType: 'natal';
  createdAt: string;
  planets: {
    [key: string]: PlanetData;
  };
  houses?: {
    status: 'success' | 'failed';
    data?: HouseData[];
    error?: string;
  };
  ascendant?: AngleData;
  midheaven?: AngleData;
  planetHouses?: Record<string, number>;
  isTimeEstimated: boolean;
  birthInfo?: {
    birthDate: string;
    birthTime?: string;
    latitude: number;
    longitude: number;
    ianaTimeZone: string;
  };
  metadata?: {
    calculationTimestamp: string;
    ephemerisVersion: string;
    swetestVersion: string;
    houseSystem: string;
    zodiacType: string;
  };
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface ApiError {
  error: string;
  validationErrors?: ValidationError[];
}

export interface Reading {
  readingId: string;
  type: string;
  status: 'Processing' | 'Ready' | 'Failed' | 'In Review';
  createdAt: string;
  updatedAt: string;
}

export interface ReadingDetail extends Reading {
  content?: string;
  error?: string;
  userId: string;
}

export interface ReadingsListResponse {
  readings: Reading[];
  count: number;
}

export interface GenerateReadingResponse {
  message: string;
  readingId: string;
  status: string;
}

export interface CreateCheckoutSessionRequest {
  sessionType: 'subscription' | 'one-time';
  priceId?: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  metadata?: Record<string, string>;
}

export interface CreateCheckoutSessionResponse {
  sessionId: string;
  url: string;
}

export class UserApi {
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

  async getUserProfile(userId: string): Promise<UserProfileResponse> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${this.baseUrl}api/users/${userId}/profile`, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        const error: ApiError = await response.json();
        throw new Error(error.error || 'Failed to fetch profile');
      }

      const profile: UserProfileResponse = await response.json();
      return profile;
    } catch (error) {
      console.error('Error fetching user profile:', error);
      throw error;
    }
  }

  async getNatalChart(userId: string): Promise<NatalChart> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${this.baseUrl}api/users/${userId}/natal-chart`, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        // Handle 404 specifically
        if (response.status === 404) {
          throw new Error('Natal chart not found. It may still be generating.');
        }
        const error: ApiError = await response.json();
        throw new Error(error.error || 'Failed to fetch natal chart');
      }

      const chart: NatalChart = await response.json();
      return chart;
    } catch (error) {
      console.error('Error fetching natal chart:', error);
      throw error;
    }
  }

  async updateUserProfile(userId: string, profile: UserProfile): Promise<UpdateProfileResponse> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${this.baseUrl}api/users/${userId}/profile`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(profile),
      });

      const data = await response.json();

      if (!response.ok) {
        const error = data as ApiError;
        if (error.validationErrors) {
          // Create a user-friendly error message from validation errors
          const errorMessages = error.validationErrors
            .map((ve) => `${ve.field}: ${ve.message}`)
            .join(', ');
          throw new Error(`Validation failed: ${errorMessages}`);
        }
        throw new Error(error.error || 'Failed to update profile');
      }

      return data as UpdateProfileResponse;
    } catch (error) {
      console.error('Error updating user profile:', error);
      throw error;
    }
  }

  async hasCompletedOnboarding(userId: string): Promise<boolean> {
    try {
      const profile = await this.getUserProfile(userId);
      return profile.onboardingCompleted === true;
    } catch (error) {
      // If profile doesn't exist or there's an error, onboarding is not completed
      console.info('Profile not found or error checking onboarding status:', error);
      return false;
    }
  }

  async getReadings(userId: string): Promise<ReadingsListResponse> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${this.baseUrl}api/users/${userId}/readings`, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        const error: ApiError = await response.json();
        throw new Error(error.error || 'Failed to fetch readings');
      }

      const data: ReadingsListResponse = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching readings:', error);
      throw error;
    }
  }

  async getReadingDetail(userId: string, readingId: string): Promise<ReadingDetail> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${this.baseUrl}api/users/${userId}/readings/${readingId}`, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        const error: ApiError = await response.json();
        throw new Error(error.error || 'Failed to fetch reading detail');
      }

      const reading: ReadingDetail = await response.json();
      return reading;
    } catch (error) {
      console.error('Error fetching reading detail:', error);
      throw error;
    }
  }

  async generateReading(userId: string): Promise<GenerateReadingResponse> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${this.baseUrl}api/users/${userId}/readings`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: 'Soul Blueprint',
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || data.error || 'Failed to generate reading');
      }

      const data: GenerateReadingResponse = await response.json();
      return data;
    } catch (error) {
      console.error('Error generating reading:', error);
      throw error;
    }
  }

  async createCheckoutSession(
    userId: string,
    request: CreateCheckoutSessionRequest,
  ): Promise<CreateCheckoutSessionResponse> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${this.baseUrl}api/users/${userId}/checkout-session`, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const error: ApiError = await response.json();
        throw new Error(error.error || 'Failed to create checkout session');
      }

      const session: CreateCheckoutSessionResponse = await response.json();
      return session;
    } catch (error) {
      console.error('Error creating checkout session:', error);
      throw error;
    }
  }
}
