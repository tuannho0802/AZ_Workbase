import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import Cookies from 'js-cookie';
import { User } from '../types/auth.types';
import axiosInstance from '../api/axios-instance';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isHydrated: boolean;
  
  setUser: (user: User) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  logout: () => Promise<void>;
  logoutLocal: () => void;
  setHydrated: (state: boolean) => void;
}

// ✅ CRITICAL: Custom cookie storage
const cookieStorage = {
  getItem: (name: string) => {
    if (typeof window === 'undefined') return null;
    const value = Cookies.get(name);
    console.log(`[AuthStore] Reading cookie: ${name}, exists: ${!!value}`);
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch (e) {
      console.error(`[AuthStore] Error decoding cookie ${name}:`, e);
      return value;
    }
  },
  setItem: (name: string, value: string) => {
    if (typeof window === 'undefined') return;
    console.log(`[AuthStore] Writing cookie: ${name}`);
    Cookies.set(name, encodeURIComponent(value), { 
      expires: 7, 
      path: '/',
      sameSite: 'Lax'
    });
  },
  removeItem: (name: string) => {
    if (typeof window === 'undefined') return;
    console.log(`[AuthStore] Removing cookie: ${name}`);
    Cookies.remove(name, { path: '/' });
  },
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isHydrated: false,

      setUser: (user) => {
        console.log('[AUTH STORE] Set user:', user.email);
        set({ user, isAuthenticated: true });
      },
      
      setTokens: (accessToken, refreshToken) => {
        console.log('[AUTH STORE] setTokens called');
        console.log('[AUTH STORE] Access token length:', accessToken?.length || 0);
        console.log('[AUTH STORE] Refresh token length:', refreshToken?.length || 0);
        
        set({ 
          accessToken, 
          refreshToken,
          isAuthenticated: true, // ← CRITICAL: Phải set luôn
        });
        
        console.log('[AUTH STORE] Tokens saved to store');
      },

      logout: async () => {
        console.log('[AUTH STORE] Calling logout API to revoke token in DB...');
        try {
          // Revoke refresh token in backend DB
          await axiosInstance.post('/auth/logout');
        } catch (e) {
          // Even if API call fails, clear local state
          console.warn('[AUTH STORE] Logout API failed (token may already be invalid):', e);
        } finally {
          set({
            user: null,
            accessToken: null,
            refreshToken: null,
            isAuthenticated: false,
          });
          console.log('[AUTH STORE] Local session cleared.');
        }
      },

      logoutLocal: () => {
        // Used by axios interceptor for silent forced logout (no API call)
        console.log('[AUTH STORE] Force logout (local only)');
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
      storage: createJSONStorage(() => cookieStorage), // ✅ COOKIE
      onRehydrateStorage: () => (state) => {
        console.log('[AuthStore] onRehydrateStorage called');
        state?.setHydrated(true);
      },
    }
  )
);
