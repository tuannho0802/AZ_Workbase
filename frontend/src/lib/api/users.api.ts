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

  // Thông tin cá nhân đầy đủ của user đang đăng nhập (All roles)
  getMe: async (): Promise<UserDetail> => {
    const response = await axiosInstance.get('/users/me');
    return response.data;
  },

  // Thông tin chi tiết 1 user theo id (Chỉ Admin)
  getUserDetail: async (id: number): Promise<UserDetail> => {
    const response = await axiosInstance.get(`/users/${id}`);
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

  // ── Duyệt đăng ký tài khoản mới (Admin/Assistant) ──────────────────────
  getPendingApprovals: async (): Promise<PendingUser[]> => {
    const response = await axiosInstance.get('/users/pending-approvals');
    return response.data;
  },

  approveUser: async (id: number, data: { role?: string; departmentId?: number }) => {
    const response = await axiosInstance.patch(`/users/${id}/approve`, data);
    return response.data;
  },

  rejectUser: async (id: number, data: { reason?: string }) => {
    const response = await axiosInstance.patch(`/users/${id}/reject`, data);
    return response.data;
  },

  // ⚠️ getUserProfile/updateUserProfile (Fanpage/Group thủ công) ĐÃ BỊ XOÁ -
  // dùng linkGroupManagersApi.listManagedByMe() (link-groups.api.ts) thay
  // thế, tự động lấy từ dữ liệu Quản lý chính/phụ đã gán cho LinkGroup.

  // ── Profile tự phục vụ (PATCH /users/me/*) - CHÍNH MÌNH sửa hồ sơ của
  // mình. Gate bằng permission `profile.edit_info`/`profile.edit_email`/
  // `profile.change_password` (mặc định: 2 cái đầu mở cho cả 4 role,
  // edit_email mặc định chỉ Admin) - xem PERMISSIONS.md mục 1.7. ─────────
  updateOwnProfile: async (data: { name?: string; phone?: string }): Promise<UserDetail> => {
    const response = await axiosInstance.patch('/users/me/profile', data);
    return response.data;
  },

  updateOwnEmail: async (data: { email: string; currentPassword: string }): Promise<UserDetail> => {
    const response = await axiosInstance.patch('/users/me/email', data);
    return response.data;
  },

  changeOwnPassword: async (data: {
    currentPassword: string;
    newPassword: string;
    confirmNewPassword: string;
  }): Promise<{ success: boolean; message: string }> => {
    const response = await axiosInstance.patch('/users/me/password', data);
    return response.data;
  },

  // Xác nhận avatar mới SAU KHI đã PUT thẳng lên B2 (key lấy từ
  // POST /uploads/avatar/presign - xem uploadsApi.presignAvatar()). Response
  // trả về avatarUrl đã ký sẵn (Presigned GET, TTL 1h) - dùng thẳng, không
  // cần ký lại ở FE.
  updateOwnAvatar: async (key: string): Promise<UserDetail> => {
    const response = await axiosInstance.patch('/users/me/avatar', { key });
    return response.data;
  },

  // ── Xoá tài khoản (mềm -> cứng) - `users.delete`, mặc định chỉ Admin ───
  softDeleteUser: async (id: number) => {
    const response = await axiosInstance.patch(`/users/${id}/soft-delete`);
    return response.data;
  },

  getTrash: async (): Promise<TrashedUser[]> => {
    const response = await axiosInstance.get('/users/trash');
    return response.data;
  },

  restoreUser: async (id: number) => {
    const response = await axiosInstance.patch(`/users/trash/${id}/restore`);
    return response.data;
  },

  hardDeleteUser: async (id: number) => {
    const response = await axiosInstance.delete(`/users/trash/${id}/hard-delete`);
    return response.data;
  },
};

export interface UserDetail {
  id: number;
  employeeCode: string;
  email: string;
  name: string;
  phone: string | null;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  annualLeaveBalance: number;
  annualLeaveTotal: number;
  compensatoryLeaveBalance: number;
  leaveYear: number;
  createdAt: string;
  department?: { id: number; name: string } | null;
  // Presigned GET URL (TTL 1h, ký sẵn ở BE) - null nếu chưa từng upload avatar.
  avatarUrl?: string | null;
  // Key thô ổn định song song avatarUrl - dùng làm cache key cho
  // useCachedImage(), không đổi giữa các lần ký lại avatarUrl.
  avatarKey?: string | null;
}

// Tài khoản đã xoá mềm (đang ở "thùng rác" - GET /users/trash)
export interface TrashedUser {
  id: number;
  employeeCode: string;
  email: string;
  name: string;
  role: string;
  department?: { id: number; name: string } | null;
  deletedAt: string;
  deletedBy?: { id: number; name: string } | null;
}

// Tài khoản tự đăng ký đang chờ duyệt (role LUÔN là 'employee' - hardcode ở
// BE, xem UsersService.createPendingRegistration()).
export interface PendingUser {
  id: number;
  employeeCode: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  createdAt: string;
  department?: { id: number; name: string } | null;
}