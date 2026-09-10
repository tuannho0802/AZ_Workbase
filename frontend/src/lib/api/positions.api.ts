import axiosInstance from './axios-instance';

export interface Position {
  id: number;
  code: string;
  name: string;
  departmentId: number | null;
  // Trả kèm từ GET /positions (relations: ['department']) - CHỈ mang tính
  // TỔ CHỨC/GỢI Ý hiển thị, KHÔNG ràng buộc user thuộc đúng phòng ban đó mới
  // chọn được Position này (xem position.entity.ts ở BE).
  department?: { id: number; name: string } | null;
  description: string | null;
  isSystem: boolean;
}

export interface CreatePositionPayload {
  code: string;
  name: string;
  departmentId?: number | null;
  description?: string | null;
}

export interface UpdatePositionPayload {
  name?: string;
  departmentId?: number | null;
  description?: string | null;
}

export const positionsApi = {
  getAll: async (): Promise<Position[]> => {
    const response = await axiosInstance.get<Position[]>('/positions');
    return response.data;
  },

  // Danh sách công khai (KHÔNG cần token) - chỉ id/name, dùng cho form đăng
  // ký tài khoản mới (trang /register, chưa đăng nhập) - khớp
  // PositionsService.findAllPublic() ở BE.
  getPublic: async (): Promise<Pick<Position, 'id' | 'name'>[]> => {
    const response = await axiosInstance.get('/positions/public');
    return response.data;
  },

  getById: async (id: number): Promise<Position> => {
    const response = await axiosInstance.get<Position>(`/positions/${id}`);
    return response.data;
  },

  create: async (data: CreatePositionPayload): Promise<Position> => {
    const response = await axiosInstance.post<Position>('/positions', data);
    return response.data;
  },

  update: async (id: number, data: UpdatePositionPayload): Promise<Position> => {
    const response = await axiosInstance.patch<Position>(`/positions/${id}`, data);
    return response.data;
  },

  // Khớp PositionsService.remove() - BE tự chặn (400) nếu đang có nhân viên
  // gán vị trí này hoặc isSystem=true, không cần FE tự kiểm tra trước.
  remove: async (id: number): Promise<{ deleted: true }> => {
    const response = await axiosInstance.delete(`/positions/${id}`);
    return response.data;
  },
};
