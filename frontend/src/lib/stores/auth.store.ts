import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import Cookies from 'js-cookie';
import { User } from '../types/auth.types';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isHydrated: boolean; // Hydration Shield
  
  setUser: (user: User) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  logout: () => void;
  setHydrated: (state: boolean) => void;
}

// Custom Cookie Storage for Zustand Persist
const cookieStorage = {
  getItem: (name: string) => {
    const value = Cookies.get(name);
    console.log(`[AuthStore] Reading cookie: ${name}, exists: ${!!value}`);
    if (!value) return null;
    try {
      // js-cookie might already partially decode, let's be safe
      return decodeURIComponent(value);
    } catch (e) {
      console.error(`[AuthStore] Error decoding cookie ${name}:`, e);
      return value;
    }
  },
  setItem: (name: string, value: string) => {
    console.log(`[AuthStore] Writing cookie: ${name}`);
    Cookies.set(name, encodeURIComponent(value), { 
      expires: 7, 
      path: '/',
      sameSite: 'Lax'
    });
  },
  removeItem: (name: string) => {
    console.log(`[AuthStore] Removing cookie: ${name}`);
    Cookies.remove(name, { path: '/' });
  },
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isHydrated: false,

      setUser: (user) => {
        console.log('[AuthStore] Setting user:', user.email);
        set({ user, isAuthenticated: true });
      },
      
      setTokens: (accessToken, refreshToken) => {
        console.log('[AuthStore] Updating tokens');
        set({ accessToken, refreshToken });
      },

      logout: () => {
        console.log('[AuthStore] Logout triggered');
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        });
      },

      setHydrated: (state) => {
        console.log(`[AuthStore] Hydration state -> ${state}`);
        set({ isHydrated: state });
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => cookieStorage),
      onRehydrateStorage: () => (state) => {
        console.log('[AuthStore] onRehydrateStorage called');
        state?.setHydrated(true);
      },
    }
  )
);
