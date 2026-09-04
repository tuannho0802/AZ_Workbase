import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { PermissionsService } from '../../modules/permissions/permissions.service';

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

    const { allowed, scope } = await this.permissionsService.hasPermission(user.role, requiredKey);

    if (!allowed) {
      throw new ForbiddenException('Bạn không có quyền thực hiện hành động này');
    }

    request.permissionScope = scope;
    return true;
  }
}
