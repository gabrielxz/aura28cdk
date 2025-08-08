'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { User } from 'lucide-react';
import { useAuth } from '@/lib/auth/use-auth';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UserApi, UserProfileResponse } from '@/lib/api/user-api';

export function Header() {
  const { user, loading, login, logout, authService } = useAuth();
  const router = useRouter();
  const [userApi] = useState(() => new UserApi(authService));
  const [profile, setProfile] = useState<UserProfileResponse | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      if (user && !loading) {
        try {
          const userProfile = await userApi.getUserProfile(user.sub);
          setProfile(userProfile);
        } catch (error) {
          console.log('Could not fetch profile:', error);
        }
      }
    };

    fetchProfile();
  }, [user, loading, userApi]);

  const handleLogout = async () => {
    await logout();
  };

  const displayName = profile?.profile?.birthName || user?.email || 'User';

  return (
    <header className="border-b bg-white dark:bg-gray-950">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="text-2xl font-bold">
          Aura28
        </Link>

        <nav className="flex items-center gap-4">
          {user && (
            <Link href="/dashboard" className="text-sm font-medium hover:underline">
              Dashboard
            </Link>
          )}

          {loading ? (
            <Button disabled variant="outline" size="sm">
              Loading...
            </Button>
          ) : user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback>
                      <User className="h-5 w-5" />
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{displayName}</p>
                    <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer"
                  onClick={() => router.push('/account-settings')}
                >
                  Account Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer text-red-600" onClick={handleLogout}>
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button onClick={() => login()} size="sm">
              Login
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
