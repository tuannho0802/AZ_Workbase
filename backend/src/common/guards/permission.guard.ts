import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { PermissionsService } from '../../modules/permissions/permissions.service';
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
 * ⚠️ LỐI THOÁT HIỂM BẮT BUỘC (yêu cầu tường minh từ chủ dự án): role
 * `admin` (enum `Role.ADMIN` cố định trong code, KHÔNG phải role tuỳ biến
 * nào khác dù có tên hiển thị "Admin") LUÔN được coi là có MỌI permission
 * với scope='all', BẤT KỂ bảng `role_permissions` trong DB đang lưu gì.
 * Đây là bypass Ở TẦNG GUARD (trước khi chạm DB), không phải chỉ dựa vào cơ
 * chế "guardian permission" (`roles.manage`, xem `roles.service.ts`) - cơ
 * chế guardian đó CHỈ bảo vệ đúng 1 permission (`roles.manage`) khỏi bị gỡ
 * khỏi TẤT CẢ role, không bảo vệ role `admin` khỏi bị lỡ tay xoá/thiếu các
 * permission KHÁC (vd `customers.view`) - nếu chỉ dựa vào guardian, admin
 * vẫn có thể tự khoá nhầm quyền truy cập hầu hết endpoint khác của chính
 * mình. Việc thêm bypass cứng ở đây mới thực sự đảm bảo "dù admin lỡ tắt
 * permission của chính mình vẫn luôn vào được", đúng yêu cầu.
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
    // truy vấn DB - admin không bao giờ bị chặn bởi cấu hình role_permissions,
    // kể cả khi bảng đó trống/sai/thiếu dòng cho role admin.
    if (user.role === Role.ADMIN) {
      request.permissionScope = 'all';
      return true;
    }

    const { allowed, scope } = await this.permissionsService.hasPermission(user.role, requiredKey);

    if (!allowed) {
      throw new ForbiddenException('Bạn không có quyền thực hiện hành động này');
    }

    request.permissionScope = scope;
    return true;
  }
}