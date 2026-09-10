import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { PermissionsService } from '../../modules/permissions/permissions.service';
import { PermissionScope } from '../../database/entities/role-permission.entity';
import { Role } from '../enums/role.enum';

/**
 * Thay thế `RolesGuard` cũ - đọc key từ `@RequirePermission()`, tra
 * `PermissionsService` (dựa trên `role_permissions` trong DB, KHÔNG so
 * sánh chuỗi role cứng nữa) để quyết định cho qua hay chặn.
 *
 * Gắn thêm `request.permissionScope` (own/department/all/null) sau khi
 * check pass - tầng service phía sau đọc trực tiếp field này để lọc dữ
 * liệu (thay cho việc mỗi service tự so sánh `user.role === Role.MANAGER`
 * như trước), tránh phải tra bảng `role_permissions` LẦN THỨ HAI cho cùng
 * 1 request.
 *
 * ⚠️ LỐI THOÁT HIỂM BẮT BUỘC (yêu cầu tường minh từ chủ dự án) - ĐÃ ĐỔI từ
 * migration `AddIsRootAdminToUsers1781000000000`: KHÔNG còn bypass theo
 * riêng `role === 'admin'` nữa. User phải VỪA mang `role = Role.ADMIN`
 * VỪA có `isRootAdmin = true` (cột mới trên `users`, có thể có NHIỀU root
 * admin) mới được coi là có MỌI permission với scope='all', BẤT KỂ bảng
 * `role_permissions` trong DB đang lưu gì. User `role='admin'` nhưng
 * `isRootAdmin=false` đi qua ĐÚNG luồng `PermissionsService.hasPermission()`
 * như role khác - có thể bị Root Admin thu hồi quyền qua trang "Phân quyền"
 * như bình thường.
 *
 * Đây là bypass Ở TẦNG GUARD (trước khi chạm bảng `role_permissions`),
 * không phải chỉ dựa vào cơ chế "guardian permission" (`roles.manage`, xem
 * `roles.service.ts`) - cơ chế guardian đó CHỈ bảo vệ đúng 1 permission
 * (`roles.manage`) khỏi bị gỡ khỏi TẤT CẢ role, không bảo vệ role `admin`
 * khỏi bị lỡ tay xoá/thiếu các permission KHÁC (vd `customers.view`) - nếu
 * chỉ dựa vào guardian, admin thường vẫn có thể tự khoá nhầm quyền truy cập
 * hầu hết endpoint khác của chính mình (ĐÚNG Ý ĐỒ mới: chỉ Root Admin mới
 * KHÔNG THỂ bị khoá nhầm như vậy, Admin thường thì có thể).
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredKey = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Route không gắn @RequirePermission() - không thuộc phạm vi guard này
    // quản lý (vd route chỉ cần JwtAuthGuard, không cần thêm điều kiện gì).
    if (!requiredKey) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Truy cập bị từ chối');
    }

    // ⚠️ LỐI THOÁT HIỂM - xem giải thích đầy đủ ở JSDoc class. Đặt TRƯỚC mọi
    // truy vấn DB - CHỈ Root Admin (role=admin VÀ isRootAdmin=true) không
    // bao giờ bị chặn bởi cấu hình role_permissions, kể cả khi bảng đó
    // trống/sai/thiếu dòng cho role admin. Admin thường (isRootAdmin=false)
    // đi qua nhánh tra DB bên dưới như mọi role khác.
    if (user.role === Role.ADMIN && user.isRootAdmin) {
      request.permissionScope = PermissionScope.ALL;
      return true;
    }

    const { allowed, scope } = await this.permissionsService.hasPermission(
      user.role,
      requiredKey,
      user.departmentId,
      user.positionId,
    );

    if (!allowed) {
      throw new ForbiddenException('Bạn không có quyền thực hiện hành động này');
    }

    request.permissionScope = scope;
    return true;
  }
}