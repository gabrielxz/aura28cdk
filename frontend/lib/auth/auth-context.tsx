'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { AuthService, User } from './auth-service';

interface AuthContextType {
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
  error: string | null;
  login: () => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  authService: AuthService;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authService] = useState(() => new AuthService());

  const refreshUser = useCallback(async () => {
    try {
      setError(null);
      const currentUser = authService.getCurrentUser();
      setUser(currentUser);
      setIsAdmin(authService.isAdmin());

      // If token is about to expire, try to refresh
      if (currentUser && authService.isAuthenticated()) {
        // Set up refresh timer
        const tokens = await authService.refreshToken();
        if (tokens) {
          const refreshedUser = authService.getCurrentUser();
          setUser(refreshedUser);
          setIsAdmin(authService.isAdmin());
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication error');
      setUser(null);
      setIsAdmin(false);
    }
  }, [authService]);

  useEffect(() => {
    // Check for auth on mount
    const initAuth = async () => {
      try {
        // Check if we have server-side authentication that needs to be synced
        const hasServerAuth = authService.syncTokensFromCookies();

        if (hasServerAuth) {
          // Server-side auth detected, try to refresh tokens to get them in localStorage
          // This handles the case where tokens are in HTTP-only cookies
          const tokens = await authService.refreshToken();
          if (tokens) {
            const refreshedUser = authService.getCurrentUser();
            setUser(refreshedUser);
            setIsAdmin(authService.isAdmin());
          }
        } else {
          // Normal flow - check for existing tokens in localStorage
          await refreshUser();
        }
      } finally {
        setLoading(false);
      }
    };

    initAuth();

    // Set up periodic token refresh
    const interval = setInterval(
      () => {
        if (authService.isAuthenticated()) {
          refreshUser();
        }
      },
      5 * 60 * 1000,
    ); // Refresh every 5 minutes

    return () => clearInterval(interval);
  }, [refreshUser, authService]);

  const login = useCallback(() => {
    authService.redirectToLogin();
  }, [authService]);

  const logout = useCallback(async () => {
    await authService.logout();
  }, [authService]);

  const value: AuthContextType = {
    user,
    isAdmin,
    loading,
    error,
    login,
    logout,
    refreshUser,
    authService,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
