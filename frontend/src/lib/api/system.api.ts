import axiosInstance from './axios-instance';

export interface SystemResetResponse {
  /** Epoch mới sau khi Reset - mọi client thấy số này trong poll thì làm mới toàn bộ cache. */
  epoch: number;
  resetAt: string;
}

export const systemApi = {
  /** Chỉ Root Admin (BE chặn bằng RootAdminGuard). Cooldown 30 giây - quá sớm trả 429. */
  reset: async (): Promise<SystemResetResponse> => {
    const response = await axiosInstance.post<SystemResetResponse>('/system/reset');
    return response.data;
  },
};
