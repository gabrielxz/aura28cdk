import {
  CognitoIdentityProviderClient,
  UpdateUserAttributesCommand,
  UpdateUserAttributesCommandInput,
} from '@aws-sdk/client-cognito-identity-provider';
import { jwtDecode } from 'jwt-decode';
import { getCognitoConfig, getCognitoUrls, CognitoConfig } from './cognito-config';

export interface User {
  sub: string;
  email: string;
  email_verified: boolean;
  given_name?: string;
  family_name?: string;
  'cognito:groups'?: string[];
}

export interface AuthTokens {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export class AuthService {
  private config: CognitoConfig;
  private cognitoClient: CognitoIdentityProviderClient;
  private tokenKey = 'aura28_auth_tokens';

  constructor(config?: CognitoConfig) {
    try {
      this.config = config || getCognitoConfig();
    } catch {
      // Use empty config during build time
      this.config = {
        userPoolId: '',
        clientId: '',
        domain: '',
        region: 'us-east-1',
        redirectUri: '',
      };
    }
    this.cognitoClient = new CognitoIdentityProviderClient({
      region: this.config.region,
    });
  }

  /**
   * Redirect to Cognito Hosted UI for login
   */
  redirectToLogin(): void {
    const urls = getCognitoUrls(this.config);
    window.location.href = urls.login;
  }

  /**
   * Redirect to Cognito Hosted UI for logout
   */
  async logout(): Promise<void> {
    this.clearTokens();
    const urls = getCognitoUrls(this.config);
    // Cognito logout URL will clear the session cookies
    window.location.href = urls.logout;
  }

  /**
   * Handle the OAuth callback and exchange code for tokens
   */
  async handleCallback(code: string): Promise<AuthTokens> {
    const urls = getCognitoUrls(this.config);

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.config.clientId,
      code,
      redirect_uri: this.config.redirectUri,
    });

    const response = await fetch(urls.token, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to exchange code for tokens: ${error}`);
    }

    const data = await response.json();

    const tokens: AuthTokens = {
      idToken: data.id_token,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };

    this.saveTokens(tokens);
    return tokens;
  }

  /**
   * Get the current user from the ID token
   */
  getCurrentUser(): User | null {
    const tokens = this.getTokens();
    if (!tokens || this.isTokenExpired(tokens)) {
      return null;
    }

    try {
      const decoded = jwtDecode<User>(tokens.idToken);
      return decoded;
    } catch {
      return null;
    }
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    const tokens = this.getTokens();
    return tokens !== null && !this.isTokenExpired(tokens);
  }

  /**
   * Check if the current user is an admin
   */
  isAdmin(): boolean {
    const user = this.getCurrentUser();
    if (!user || !user['cognito:groups']) {
      return false;
    }
    return user['cognito:groups'].includes('admin');
  }

  /**
   * Refresh the access token using the refresh token
   */
  async refreshToken(): Promise<AuthTokens | null> {
    const tokens = this.getTokens();
    if (!tokens) {
      return null;
    }

    const urls = getCognitoUrls(this.config);

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.config.clientId,
      refresh_token: tokens.refreshToken,
    });

    try {
      const response = await fetch(urls.token, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        this.clearTokens();
        return null;
      }

      const data = await response.json();

      const newTokens: AuthTokens = {
        ...tokens,
        idToken: data.id_token,
        accessToken: data.access_token,
        expiresAt: Date.now() + data.expires_in * 1000,
      };

      this.saveTokens(newTokens);
      return newTokens;
    } catch {
      this.clearTokens();
      return null;
    }
  }

  /**
   * Get tokens from storage
   */
  getTokens(): AuthTokens | null {
    if (typeof window === 'undefined') {
      return null;
    }

    const tokensString = localStorage.getItem(this.tokenKey);
    if (!tokensString) {
      return null;
    }

    try {
      return JSON.parse(tokensString);
    } catch {
      return null;
    }
  }

  /**
   * Save tokens to storage
   */
  private saveTokens(tokens: AuthTokens): void {
    if (typeof window === 'undefined') {
      return;
    }

    localStorage.setItem(this.tokenKey, JSON.stringify(tokens));
  }

  /**
   * Clear tokens from storage
   */
  private clearTokens(): void {
    if (typeof window === 'undefined') {
      return;
    }

    localStorage.removeItem(this.tokenKey);
  }

  /**
   * Check if token is expired
   */
  isTokenExpired(tokens: AuthTokens): boolean {
    return Date.now() >= tokens.expiresAt - 60000; // Consider expired 1 minute before actual expiry
  }

  /**
   * Get the current ID token
   */
  async getIdToken(): Promise<string | null> {
    const tokens = this.getTokens();
    if (!tokens || this.isTokenExpired(tokens)) {
      const refreshedTokens = await this.refreshToken();
      return refreshedTokens?.idToken || null;
    }
    return tokens.idToken;
  }

  /**
   * Check if user has completed onboarding
   * @deprecated Use UserApi.hasCompletedOnboarding instead
   */
  hasCompletedOnboarding(): boolean {
    // This method is deprecated - onboarding status is now checked via API
    return false;
  }

  /**
   * Update user attributes in Cognito
   */
  async updateUserAttributes(attributes: Record<string, string>): Promise<void> {
    const tokens = this.getTokens();
    if (!tokens) {
      throw new Error('No authentication tokens found');
    }

    const userAttributes = Object.entries(attributes).map(([name, value]) => ({
      Name: name,
      Value: value,
    }));

    const input: UpdateUserAttributesCommandInput = {
      AccessToken: tokens.accessToken,
      UserAttributes: userAttributes,
    };

    try {
      const command = new UpdateUserAttributesCommand(input);
      await this.cognitoClient.send(command);

      // Refresh the ID token to get updated attributes
      await this.refreshToken();
    } catch (error) {
      console.error('Failed to update user attributes:', error);
      throw new Error('Failed to update user profile');
    }
  }

  /**
   * Sync tokens from cookies to localStorage
   * This is called after server-side authentication to make tokens available client-side
   */
  syncTokensFromCookies(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }

    try {
      // Check for auth complete flag in cookies
      const cookies = document.cookie.split(';');
      const authCompleteCookie = cookies.find((cookie) =>
        cookie.trim().startsWith('aura28_auth_complete='),
      );

      if (!authCompleteCookie) {
        return false;
      }

      // Parse tokens from HTTP-only cookie (if accessible) or wait for refresh
      // Since HTTP-only cookies aren't accessible from JS, we'll need to refresh tokens
      // This will be handled by the auth context on mount
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if there's a valid session (either from localStorage or needs sync from server)
   */
  hasValidSession(): boolean {
    // First check localStorage
    const tokens = this.getTokens();
    if (tokens && !this.isTokenExpired(tokens)) {
      return true;
    }

    // Then check for server-side auth flag
    if (typeof window !== 'undefined') {
      const cookies = document.cookie.split(';');
      const authCompleteCookie = cookies.find((cookie) =>
        cookie.trim().startsWith('aura28_auth_complete='),
      );
      return !!authCompleteCookie;
    }

    return false;
  }
}
