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

  getUsersList: async (params?: { role?: string; departmentId?: number }) => {
    const response = await axiosInstance.get('/users/all', { params });
    return response.data;
  },

  getAllForSelect: async () => {
    const response = await axiosInstance.get('/users/all');
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

  // Profile (Fanpage/Group links user quản lý)
  // - GET: Admin xem được của bất kỳ ai, role khác chỉ xem được của chính mình (BE tự check)
  // - PUT: Chỉ Admin được sửa (Only Admin CRUD)
  getUserProfile: async (id: number): Promise<{ id: number; profile: ManagedLink[] }> => {
    const response = await axiosInstance.get(`/users/${id}/profile`);
    return response.data;
  },

  updateUserProfile: async (id: number, profile: ManagedLink[]): Promise<{ id: number; profile: ManagedLink[] }> => {
    const response = await axiosInstance.put(`/users/${id}/profile`, { profile });
    return response.data;
  },
};

export interface ManagedLink {
  type: 'fanpage' | 'group';
  name: string;
  url: string;
}
