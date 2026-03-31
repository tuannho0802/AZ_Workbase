import axiosInstance from './axios-instance';

export const usersApi = {
  getUsers: async (params?: {
    page?: number;
    limit?: number;
    role?: string;
    departmentId?: number;
    search?: string;
  }) => {
    const response = await axiosInstance.get('/users', { params });
    return response.data;
  },

  createUser: async (data: any) => {
    const response = await axiosInstance.post('/users', data);
    return response.data;
  },

  updateUser: async (id: number, data: any) => {
    const response = await axiosInstance.patch(`/users/${id}`, data);
    return response.data;
  },

  resetPassword: async (id: number, data: { newPassword: string }) => {
    const response = await axiosInstance.patch(`/users/${id}/reset-password`, data);
    return response.data;
  },
};
