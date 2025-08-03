'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth/use-auth';
import { UserApi } from './user-api';

interface UserApiContextType {
  userApi: UserApi | null;
}

const UserApiContext = createContext<UserApiContextType>({
  userApi: null,
});

export function UserApiProvider({ children }: { children: React.ReactNode }) {
  const { authService } = useAuth();
  const [userApi, setUserApi] = useState<UserApi | null>(null);

  useEffect(() => {
    if (authService) {
      setUserApi(new UserApi(authService));
    }
  }, [authService]);

  return <UserApiContext.Provider value={{ userApi }}>{children}</UserApiContext.Provider>;
}

export function useUserApi() {
  const context = useContext(UserApiContext);
  if (!context) {
    throw new Error('useUserApi must be used within a UserApiProvider');
  }
  return context.userApi;
}
