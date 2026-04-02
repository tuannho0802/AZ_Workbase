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

const cookieStorage = {
  getItem: (name: string) => {
    if (typeof window === 'undefined') return null;
    const value = Cookies.get(name);
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch (e) {
      return value;
    }
  },
  setItem: (name: string, value: string) => {
    if (typeof window === 'undefined') return;
    Cookies.set(name, encodeURIComponent(value), { 
      expires: 7, 
      path: '/',
      sameSite: 'Lax'
    });
  },
  removeItem: (name: string) => {
    if (typeof window === 'undefined') return;
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
        set({ user, isAuthenticated: true });
      },
      
      setTokens: (accessToken, refreshToken) => {
        set({ 
          accessToken, 
          refreshToken,
          isAuthenticated: true,
        });
      },

      logout: async () => {
        try {
          await axiosInstance.post('/auth/logout');
        } catch (e) {
          // Silent catch
        } finally {
          set({
            user: null,
            accessToken: null,
            refreshToken: null,
            isAuthenticated: false,
          });
        }
      },

      logoutLocal: () => {
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        });
      },

      setHydrated: (state) => {
        set({ isHydrated: state });
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => cookieStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    }
  )
);
