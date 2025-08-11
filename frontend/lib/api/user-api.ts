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

export interface NatalChart {
  userId: string;
  chartType: 'natal';
  createdAt: string;
  planets: {
    [key: string]: {
      longitude: number;
      longitudeDms: string;
      distanceKm: number;
      name: string;
    };
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
    algoVersion: string;
    ephemerisVersion: string;
    swetestVersion: string;
    inputHash: string;
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
}
