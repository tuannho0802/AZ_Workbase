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

  // Đăng ký công khai - KHÔNG trả token (tài khoản ở trạng thái chờ duyệt,
  // xem AuthService.register() ở BE). Response chỉ có message + userId.
  register: async (data: RegisterDto): Promise<RegisterResponse> => {
    const response = await axiosInstance.post('/auth/register', data);
    return response.data;
  },

  logout: async (): Promise<void> => {
    await axiosInstance.post('/auth/logout');
  },

  getProfile: async () => {
    const response = await axiosInstance.get('/auth/me');
    return response.data;
  },
};
