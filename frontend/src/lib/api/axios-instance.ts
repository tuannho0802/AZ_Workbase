import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { showMessage } from '@/components/common/AntdAppProvider';
import { useAuthStore } from '../stores/auth.store';

const API_BASE_URL = 'http://localhost:3001/api';
console.log('[Axios] Initializing with Base URL:', API_BASE_URL);

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Allow cookies to be sent
});

// Request interceptor - Add JWT token
// ✅ CRITICAL: Request interceptor với debug
axiosInstance.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // ✅ CRITICAL: Skip token check for auth routes
    if (config.url?.includes('/auth/login') || config.url?.includes('/auth/register')) {
      console.log('[AXIOS REQUEST] Auth route detected, skipping token check:', config.url);
      return config;
    }

    const authState = useAuthStore.getState();
    const token = authState.accessToken;
    
    console.log('[AXIOS REQUEST] URL:', config.url);
    console.log('[AXIOS REQUEST] Auth state:', {
      isAuthenticated: authState.isAuthenticated,
      hasToken: !!token,
      tokenPreview: token ? `${token.substring(0, 20)}...` : 'null',
    });

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      console.log('[AXIOS REQUEST] Authorization header SET');
    } else {
      console.warn('[AXIOS REQUEST] NO TOKEN - Request will fail!');
    }

    return config;
  },
  (error) => {
    console.error('[AXIOS REQUEST] Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor - Handle errors
let isRefreshing = false;
let failedQueue: any[] = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

axiosInstance.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // Handle 401 - Token expired
    if (error.response?.status === 401 && !originalRequest._retry) {
      console.log('[AXIOS] 401 Unauthorized');
      
      // ✅ CRITICAL: Prevent loop
      if (originalRequest.url?.includes('/auth/login')) {
        return Promise.reject(error);
      }

      const refreshToken = useAuthStore.getState().refreshToken;
      
      if (!refreshToken) {
        useAuthStore.getState().logoutLocal();
        if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return axiosInstance(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshUrl = `${API_BASE_URL}/auth/refresh`;
        console.log('[Axios] AUTH REFRESH CALL ->', refreshUrl);
        
        const response = await axios.post(
          refreshUrl,
          { refreshToken },
          { withCredentials: true }
        );

        const token = response.data.access_token || response.data.accessToken;
        const newRefToken = response.data.refresh_token || response.data.refreshToken;
        
        // ⭐ CRITICAL: Save BOTH tokens to store → Cookie gets updated automatically
        useAuthStore.getState().setTokens(token, newRefToken);
        
        processQueue(null, token);
        isRefreshing = false;

        originalRequest.headers.Authorization = `Bearer ${token}`;
        return axiosInstance(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        isRefreshing = false;
        
        console.error('[Axios] Refresh failed -> Logging out');
        useAuthStore.getState().logoutLocal();
        
        if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      }
    }

    // Handle other errors
    const errorMessage = (error.response?.data as any)?.message || 'Đã có lỗi xảy ra';
    // Mute network errors from popping up endlessly on page load
    if (error.code !== 'ERR_NETWORK' && error.response?.status !== 401) {
      showMessage.error(errorMessage);
    }

    return Promise.reject(error);
  }
);

export default axiosInstance;
