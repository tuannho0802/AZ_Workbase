import axiosInstance from './axios-instance';

export interface Department {
  id: number;
  name: string;
  description?: string;
  isActive: boolean;
}

export const departmentsApi = {
  getAll: async (): Promise<Department[]> => {
    const response = await axiosInstance.get<Department[]>('/departments');
    return response.data;
  },

  // Danh sách công khai (KHÔNG cần token) - chỉ id/name, dùng cho form đăng
  // ký tài khoản mới (trang /register, chưa đăng nhập).
  getPublic: async (): Promise<Pick<Department, 'id' | 'name'>[]> => {
    const response = await axiosInstance.get('/departments/public');
    return response.data;
  },

  getById: async (id: number): Promise<Department> => {
    const response = await axiosInstance.get<Department>(`/departments/${id}`);
    return response.data;
  },

  create: async (data: Partial<Department>): Promise<Department> => {
    const response = await axiosInstance.post<Department>('/departments', data);
    return response.data;
  },

  update: async (id: number, data: Partial<Department>): Promise<Department> => {
    const response = await axiosInstance.patch<Department>(`/departments/${id}`, data);
    return response.data;
  }
};
