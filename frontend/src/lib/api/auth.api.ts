import axiosInstance from './axios-instance';
import { LoginDto, RegisterDto, RegisterResponse, AuthResponse } from '../types/auth.types';

export const authApi = {
  login: async (credentials: LoginDto): Promise<AuthResponse> => {
    const response = await axiosInstance.post('/auth/login', credentials);
    return {
      accessToken: response.data.accessToken || response.data.access_token,
      refreshToken: response.data.refreshToken || response.data.refresh_token,
      user: response.data.user
    };
  },

  // Đăng ký công khai - gọi route nội bộ `/api/auth/register` (Next.js Route
  // Handler trên CHÍNH domain Frontend, KHÔNG phải backend NestJS trực
  // tiếp) - route đó tự forward sang backend sau khi qua Vercel BotID. Vì
  // vậy KHÔNG dùng `axiosInstance` ở đây (baseURL của nó trỏ thẳng ra
  // backend NestJS, `NEXT_PUBLIC_API_URL`, sẽ bỏ qua lớp BotID) - dùng
  // `fetch` với URL tương đối để chắc chắn gọi đúng route cùng domain, nơi
  // `<BotIdClient>` (root layout) đã gắn challenge vào request.
  register: async (data: RegisterDto): Promise<RegisterResponse> => {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      // Ném lỗi theo đúng hình dạng mà `getApiErrorMessage()` (dùng khắp
      // Frontend cho lỗi axios) đã hỗ trợ đọc `error.response.data.message`
      // - giữ nguyên hành vi hiển thị lỗi ở `register/page.tsx` dù không
      // còn dùng axios cho riêng request này.
      const error = new Error(body?.message || 'Đăng ký thất bại') as Error & {
        response?: { data?: unknown; status?: number };
      };
      error.response = { data: body, status: response.status };
      throw error;
    }

    return body;
  },

  logout: async (): Promise<void> => {
    await axiosInstance.post('/auth/logout');
  },

  getProfile: async () => {
    const response = await axiosInstance.get('/auth/me');
    return response.data;
  },
};