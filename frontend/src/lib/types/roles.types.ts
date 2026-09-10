export type PermissionScope = 'own' | 'department' | 'all';

/**
 * 'none' - KHÔNG phải 1 phạm vi thật, là dấu hiệu "TỪ CHỐI TƯỜNG MINH" CHỈ
 * hợp lệ khi lưu Override theo phòng ban (không dùng cho ma trận Toàn cục -
 * BE từ chối nếu gửi lên). Dùng để 1 phòng ban tắt hẳn 1 permission mà Toàn
 * cục đang bật, KHÔNG cần đụng tới Toàn cục (xem role-permission.entity.ts
 * ở backend, mục `PermissionScope.NONE`, để hiểu tại sao cần sentinel riêng
 * thay vì chỉ "không gửi permission đó lên").
 */
export type OverrideScope = PermissionScope | 'none';

export interface Permission {
  key: string;
  resource: string;
  action: string;
  supportsScope: boolean;
  description: string | null;
}

export interface RolePermissionEntry {
  permissionKey: string;
  // OverrideScope (bao gồm 'none') thay vì chỉ PermissionScope - entry này
  // dùng chung cho cả ma trận Toàn cục (không bao giờ có 'none', BE chặn)
  // lẫn Override phòng ban (có thể có 'none' - xem OverrideScope).
  scope: OverrideScope | null;
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
 * 1 phòng ban ĐANG có override riêng cho 1 role - `permissions` ở đây là
 * phần CHÊNH LỆCH so với ma trận Toàn cục của role (không phải toàn bộ
 * quyền thật sự phòng ban đó có). 2 loại chênh lệch có thể có:
 *  - scope thật (own/department/all) -> phòng ban CÓ thêm/đổi quyền này so
 *    với Toàn cục.
 *  - scope='none' -> phòng ban KHÔNG có quyền này dù Toàn cục đang bật (từ
 *    chối tường minh - xem `OverrideScope`).
 * Muốn biết phòng ban THẬT SỰ có quyền gì (hiệu lực cuối), phải hợp nhất
 * mảng này với `role.permissions` (Toàn cục) - xem
 * `mergeGlobalWithOverride()` ở `DepartmentOverridesPanel.tsx`. Khớp
 * response GET /roles/:id/department-overrides
 * (roles.service.ts#getDepartmentOverrides).
 */
export interface DepartmentOverride {
  departmentId: number;
  departmentName: string;
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