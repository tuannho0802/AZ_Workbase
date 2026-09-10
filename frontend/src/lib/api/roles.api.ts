import axiosInstance from './axios-instance';
import {
  MyPermissionsMap,
  Permission,
  RoleWithPermissions,
  CreateRolePayload,
  UpdateRolePayload,
  UpdateRolePermissionsPayload,
  DepartmentOverride,
  PositionOverride,
} from '../types/roles.types';

export const rolesApi = {
  /** Quyền của CHÍNH mình - không cần quyền gì đặc biệt, ai đã đăng nhập cũng gọi được. */
  getMyPermissions: async (): Promise<MyPermissionsMap> => {
    const response = await axiosInstance.get<MyPermissionsMap>('/roles/my-permissions');
    return response.data;
  },

  getAllRoles: async (): Promise<RoleWithPermissions[]> => {
    const response = await axiosInstance.get<RoleWithPermissions[]>('/roles');
    return response.data;
  },

  getAllPermissions: async (): Promise<Permission[]> => {
    const response = await axiosInstance.get<Permission[]>('/permissions');
    return response.data;
  },

  createRole: async (payload: CreateRolePayload): Promise<RoleWithPermissions> => {
    const response = await axiosInstance.post<RoleWithPermissions>('/roles', payload);
    return response.data;
  },

  updateRole: async (id: number, payload: UpdateRolePayload): Promise<RoleWithPermissions> => {
    const response = await axiosInstance.patch<RoleWithPermissions>(`/roles/${id}`, payload);
    return response.data;
  },

  deleteRole: async (id: number): Promise<void> => {
    await axiosInstance.delete(`/roles/${id}`);
  },

  updateRolePermissions: async (
    id: number,
    payload: UpdateRolePermissionsPayload,
  ): Promise<RoleWithPermissions> => {
    const response = await axiosInstance.patch<RoleWithPermissions>(
      `/roles/${id}/permissions`,
      payload,
    );
    return response.data;
  },

  /** Khớp GET /roles/:id/department-overrides - danh sách phòng ban ĐANG có override riêng cho role này. */
  getDepartmentOverrides: async (roleId: number): Promise<DepartmentOverride[]> => {
    const response = await axiosInstance.get<DepartmentOverride[]>(
      `/roles/${roleId}/department-overrides`,
    );
    return response.data;
  },

  /** Khớp PUT /roles/:id/department-overrides/:departmentId - ghi đè (tạo mới nếu chưa có) toàn bộ override của 1 phòng ban. */
  updateDepartmentOverride: async (
    roleId: number,
    departmentId: number,
    payload: UpdateRolePermissionsPayload,
  ): Promise<{ success: true; count: number }> => {
    const response = await axiosInstance.put(
      `/roles/${roleId}/department-overrides/${departmentId}`,
      payload,
    );
    return response.data;
  },

  /** Khớp DELETE /roles/:id/department-overrides/:departmentId - gỡ hẳn override, phòng ban quay lại dùng đúng ma trận Toàn cục. */
  deleteDepartmentOverride: async (
    roleId: number,
    departmentId: number,
  ): Promise<{ success: true }> => {
    const response = await axiosInstance.delete(
      `/roles/${roleId}/department-overrides/${departmentId}`,
    );
    return response.data;
  },

  // ── Position Override (mirror Y HỆT Department Override ở trên) ──────────

  /** Khớp GET /roles/:id/position-overrides - danh sách Vị trí ĐANG có override riêng cho role này. */
  getPositionOverrides: async (roleId: number): Promise<PositionOverride[]> => {
    const response = await axiosInstance.get<PositionOverride[]>(
      `/roles/${roleId}/position-overrides`,
    );
    return response.data;
  },

  /** Khớp PUT /roles/:id/position-overrides/:positionId - ghi đè (tạo mới nếu chưa có) toàn bộ override của 1 Vị trí. */
  updatePositionOverride: async (
    roleId: number,
    positionId: number,
    payload: UpdateRolePermissionsPayload,
  ): Promise<{ success: true; count: number }> => {
    const response = await axiosInstance.put(
      `/roles/${roleId}/position-overrides/${positionId}`,
      payload,
    );
    return response.data;
  },

  /** Khớp DELETE /roles/:id/position-overrides/:positionId - gỡ hẳn override, Vị trí quay lại dùng đúng ma trận Toàn cục. */
  deletePositionOverride: async (
    roleId: number,
    positionId: number,
  ): Promise<{ success: true }> => {
    const response = await axiosInstance.delete(
      `/roles/${roleId}/position-overrides/${positionId}`,
    );
    return response.data;
  },
};