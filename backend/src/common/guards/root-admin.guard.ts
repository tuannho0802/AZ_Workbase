import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Role } from '../enums/role.enum';

/**
 * Chỉ cho qua user VỪA `role = 'admin'` VỪA `isRootAdmin = true` - đúng điều kiện lối thoát hiểm của `PermissionGuard`.
 * HARDCODE có chủ đích (KHÔNG tra bảng `role_permissions`): Root Admin không thể bị lỡ tay khoá khỏi chức năng này,
 * và Admin thường / role tuỳ chỉnh không thể tự cấp cho mình qua trang Phân quyền.
 * Phải đặt SAU `JwtAuthGuard` (cần `request.user`, lấy LIVE từ DB mỗi request - đổi role/root có hiệu lực ngay).
 */
@Injectable()
export class RootAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest().user;
    if (user?.role === Role.ADMIN && user?.isRootAdmin === true) return true;
    throw new ForbiddenException('Chỉ Root Admin mới được thực hiện thao tác này');
  }
}
