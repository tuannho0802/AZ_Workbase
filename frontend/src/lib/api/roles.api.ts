import axiosInstance from './axios-instance';
import {
  MyPermissionsMap,
  Permission,
  RoleWithPermissions,
  CreateRolePayload,
  UpdateRolePayload,
  UpdateRolePermissionsPayload,
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
};
