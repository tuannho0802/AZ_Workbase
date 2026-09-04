export type PermissionScope = 'own' | 'department' | 'all';

export interface Permission {
  key: string;
  resource: string;
  action: string;
  supportsScope: boolean;
  description: string | null;
}

export interface RolePermissionEntry {
  permissionKey: string;
  scope: PermissionScope | null;
}

export interface RoleWithPermissions {
  id: number;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: RolePermissionEntry[];
}

export interface CreateRolePayload {
  code: string;
  name: string;
  description?: string;
}

export interface UpdateRolePayload {
  name?: string;
  description?: string;
}

export interface UpdateRolePermissionsPayload {
  permissions: RolePermissionEntry[];
}

/**
 * Quyền của CHÍNH người dùng hiện tại - key = permission.key (vd
 * "customers.assign"), value = scope ('own'/'department'/'all') hoặc null
 * (quyền nhị phân không có scope). Permission KHÔNG có mặt trong object này
 * = role hiện tại KHÔNG có quyền đó (khớp đúng thiết kế BE: "không có dòng
 * = không có quyền" - xem role-permission.entity.ts).
 */
export type MyPermissionsMap = Record<string, PermissionScope | null>;
