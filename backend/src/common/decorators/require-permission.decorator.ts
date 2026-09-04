import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'permission';

/**
 * Thay thế `@Roles(Role.ADMIN, ...)` cũ - khai báo route này cần permission
 * NÀO (key dạng "resource.action", vd "customers.assign") thay vì liệt kê
 * cứng danh sách role được phép. `PermissionGuard` sẽ tra bảng
 * `role_permissions` qua `PermissionsService` để quyết định user hiện tại
 * (theo `user.role`) có quyền này hay không.
 *
 * Chỉ nhận ĐÚNG 1 permission key mỗi route (khác `@Roles` cho phép liệt kê
 * nhiều role) - vì mỗi action trong code chỉ nên tương ứng 1 permission rõ
 * ràng; nếu 1 route thực sự cần "permission A HOẶC permission B", đó là dấu
 * hiệu nên tách permission cho rõ nghĩa hơn, không nên gộp logic OR ở đây.
 */
export const RequirePermission = (key: string) => SetMetadata(PERMISSION_KEY, key);
