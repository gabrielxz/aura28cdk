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
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      if (user && !loading) {
        try {
          const userProfile = await userApi.getUserProfile(user.sub);
          setProfile(userProfile);
        } catch (error) {
          console.info('Could not fetch profile:', error);
        }
      }
    };

    fetchProfile();
  }, [user, loading, userApi]);

  // Check admin status when auth state changes
  useEffect(() => {
    if (!loading && user) {
      setIsAdmin(authService.isAdmin());
    } else {
      setIsAdmin(false);
    }
  }, [user, loading, authService]);

  const handleLogout = async () => {
    await logout();
  };

  const displayName = profile?.profile?.birthName || user?.email || 'User';

  return (
    <header className="border-b border-white/10 bg-white/5 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link
          href="/"
          className="text-2xl font-bold bg-gradient-to-r from-white to-[#ffb74d] bg-clip-text text-transparent"
        >
          Aura28
        </Link>

        <nav className="flex items-center gap-4">
          {user && (
            <Link
              href="/dashboard"
              className="text-sm font-medium text-white/90 hover:text-[#ffb74d] transition-colors"
            >
              Dashboard
            </Link>
          )}

          {loading ? (
            <Button disabled variant="outline" size="sm" className="text-white/70 border-white/20">
              Loading...
            </Button>
          ) : user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="relative h-10 w-10 rounded-full border border-white/20 hover:border-[#ffb74d]/50"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-white/10 text-white">
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
                {isAdmin && (
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onClick={() => router.push('/admin')}
                  >
                    Admin Dashboard
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer text-red-600" onClick={handleLogout}>
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              onClick={() => login()}
              size="sm"
              className="bg-gradient-to-r from-[#ff8a65] to-[#ffb74d] text-[#1a1b3a] hover:opacity-90 transition-opacity font-semibold"
            >
              Login
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
