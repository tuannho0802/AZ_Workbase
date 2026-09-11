import axiosInstance from './axios-instance';

export interface Department {
  id: number;
  name: string;
  description?: string;
  isActive: boolean;
  // Mã màu hex hiển thị Tag phòng ban ngoài FE (vd '#1890ff') - luôn có giá
  // trị (BE cột NOT NULL DEFAULT '#1890ff', xem migration
  // AddColorToRbacGroupingTables1781300000000). Admin tự đổi qua UI.
  color: string;
  // ⚠️ DEPRECATED - cột cũ 1-1, BE không còn đọc/ghi field này (xem
  // department.entity.ts). Giữ lại type để tương thích ngược nếu response
  // cũ nào đó còn trả về, KHÔNG dùng cho code mới - dùng `managers` bên
  // dưới thay thế (nhiều-nhiều, bảng department_managers).
  managerUserId?: number | null;
  // Danh sách ĐẦY ĐỦ Manager/Assistant/Admin đang quản lý phòng ban này
  // (nhiều-nhiều, bảng department_managers) - trả kèm từ GET /departments.
  // Nguồn xác định phạm vi "Manager theo phòng ban" cho MỌI module liên
  // quan (Khách hàng, Chấm công, Nghỉ phép...). Mảng rỗng = chưa gán ai.
  managers?: { id: number; name: string; role: string }[];
  // Preview rút gọn (chỉ id/name) nhân viên ĐANG active thuộc phòng ban này
  // - trả kèm từ GET /departments (KHÔNG có ở GET /departments/:id hay
  // response create/update). Dùng để hiển thị "Tên A +N" ở bảng danh sách,
  // không dùng để hiển thị chi tiết (Drawer tự gọi GET /users?departmentId=
  // để lấy đủ email/role/... khi cần).
  employees?: { id: number; name: string }[];
}

// Payload cập nhật phòng ban - tách riêng khỏi `Department` vì
// `managerUserIds` (mảng, ghi) khác hẳn `managers` (mảng object, chỉ đọc)
// trả về từ GET. Xem update-department.dto.ts ở BE.
export interface UpdateDepartmentPayload
  extends Partial<Omit<Department, 'id' | 'managerUserId' | 'managers' | 'employees'>> {
  // Danh sách ĐẦY ĐỦ id user thay thế toàn bộ Manager hiện tại của phòng
  // ban này (không phải thêm/bớt từng phần). [] = gỡ hết. undefined =
  // không đụng vào danh sách Manager đang có.
  managerUserIds?: number[];
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

  update: async (id: number, data: UpdateDepartmentPayload): Promise<Department> => {
    const response = await axiosInstance.patch<Department>(`/departments/${id}`, data);
    return response.data;
  },

  remove: async (id: number, data?: { moveUsersToDepartmentId?: number }): Promise<{ message: string; movedUsersCount: number; affectedCustomersCount: number }> => {
    const response = await axiosInstance.delete(`/departments/${id}`, { data });
    return response.data;
  },
};