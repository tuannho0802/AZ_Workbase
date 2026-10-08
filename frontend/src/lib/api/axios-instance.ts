import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { showMessage } from '@/components/common/AntdAppProvider';
import { useAuthStore } from '../stores/auth.store';
import { bearerToken, refreshAccessTokenShared } from '../auth/shared-refresh';
import { ensureFreshAccessToken } from '../auth/proactive-refresh';
import { noteMutationForRefCache, pathOf, refVersionFor } from './ref-cache-version';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000, // 20s - đủ cho cold start
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Allow cookies to be sent
});

// Request interceptor - Add JWT token
axiosInstance.interceptors.request.use(
  // [AGENT] OLD CODE (giữ để rollback): interceptor đồng bộ, luôn gắn token hiện có (kể cả đã hết hạn -> 401 -> refresh -> gửi lại)
  //   (config: InternalAxiosRequestConfig) => {
  //     if (config.url?.includes('/auth/login') || config.url?.includes('/auth/register')) return config;
  //     const token = useAuthStore.getState().accessToken;
  //     if (token) config.headers.Authorization = `Bearer ${token}`;
  //     return config;
  //   },
  // NEW (PLAN_CPU_OPTIMIZATION_ROUND2 Mục 9A): token hết/sắp hết hạn -> refresh CHỦ ĐỘNG 1 lần (request song song chờ chung)
  // rồi mới gửi, thay vì gửi 8 request bị 401 rồi gửi lại. Lưới 401 ở interceptor response vẫn giữ nguyên.
  async (config: InternalAxiosRequestConfig & { _proactiveAuthFailed?: boolean }) => {
    // Skip token check for auth routes
    if (config.url?.includes('/auth/login') || config.url?.includes('/auth/register')) {
      return config;
    }

    // Không refresh chủ động cho chính các route /auth/* (tránh đệ quy / refresh vô ích khi logout).
    if (!config.url?.includes('/auth/')) {
      const result = await ensureFreshAccessToken(`${API_BASE_URL}/auth/refresh`);
      if (result === 'auth-failed') config._proactiveAuthFailed = true;
    }

    const token = useAuthStore.getState().accessToken;

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Danh mục cache HTTP 30 phút: gắn ?v= (đổi khi dữ liệu đổi) - xem ref-cache-version.ts. Không đụng request khác.
    if (!config.method || config.method.toLowerCase() === 'get') {
      const v = refVersionFor(pathOf(config.url), useAuthStore.getState().user?.id);
      if (v) config.params = { ...(config.params ?? {}), v };
    }

    return config;
  },
  (error) => Promise.reject(error),
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
  (response) => {
    // Sửa danh mục thành công -> đổi khoá cache ngay, để refetch sau invalidate không trúng bản cũ trong HTTP cache.
    noteMutationForRefCache(response.config?.method, pathOf(response.config?.url));
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
      _proactiveAuthFailed?: boolean;
    };

    // Handle 401 - Token expired
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Prevent loop for login endpoint
      if (originalRequest.url?.includes('/auth/login')) {
        return Promise.reject(error);
      }

      const refreshToken = useAuthStore.getState().refreshToken;
      
      // [AGENT] OLD CODE: if (!refreshToken) {
      // NEW (Mục 9A): refresh chủ động vừa bị BE từ chối -> KHÔNG refresh lần 2, đăng xuất ngay (tiết kiệm 1 invocation lỗi).
      if (!refreshToken || originalRequest._proactiveAuthFailed) {
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
        
        // [AGENT] OLD CODE (giữ để rollback): gọi thẳng axios.post(refreshUrl, { refreshToken }) + setTokens(...)
        // NEW: chỉ 1 tab gọi API, tab khác dùng lại token mới (xem lib/auth/shared-refresh.ts).
        const token = await refreshAccessTokenShared(
          refreshUrl,
          bearerToken(originalRequest.headers?.Authorization),
        );

        processQueue(null, token);
        isRefreshing = false;

        originalRequest.headers.Authorization = `Bearer ${token}`;
        return axiosInstance(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        isRefreshing = false;
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
    // 409 `CHECKLIST_GUARD` KHÔNG phải lỗi: là câu hỏi xác nhận, hộp thoại ở `useGuardedUpdatePeriodicTask` sẽ hỏi.
    const isConfirmPrompt = (error.response?.data as { code?: string } | undefined)?.code === 'CHECKLIST_GUARD';
    if (error.code !== 'ERR_NETWORK' && error.response?.status !== 401 && !isConfirmPrompt) {
      showMessage.error(errorMessage);
    }

    return Promise.reject(error);
  }
);

export default axiosInstance;
