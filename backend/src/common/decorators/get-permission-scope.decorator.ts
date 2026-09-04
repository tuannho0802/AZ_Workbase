import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Đọc `request.permissionScope` mà `PermissionGuard` đã gán sẵn NGAY SAU KHI
 * check `@RequirePermission()` pass (own/department/all/null - xem
 * `permission.guard.ts`) - dùng ở tầng SERVICE thay cho việc tự so sánh
 * `role === Role.ADMIN`/`Role.ASSISTANT` cứng như trước.
 *
 * ⚠️ TẠI SAO CẦN DECORATOR NÀY (bug thật đã phát hiện khi rà soát dynamic
 * RBAC): nhiều hàm service (`CustomersService.canModifyAssignment()`,
 * `LinkGroupAccessHelper`...) tự kiểm tra `callerRole === Role.ADMIN ||
 * callerRole === Role.ASSISTANT` để quyết định "có quyền không giới hạn hay
 * không" - cách này CHỈ đúng với 4 role hệ thống cố định, hoàn toàn "mù"
 * trước role TUỲ CHỈNH Admin tự tạo qua trang Phân quyền: dù Admin cấp
 * permission tương ứng với scope='all' cho 1 role mới (vd "team_lead"),
 * code vẫn luôn trả về "không có quyền" vì chỉ so khớp đúng 2 chuỗi cố
 * định. Trong khi đó, `PermissionGuard` ĐÃ tra cứu đúng scope thật từ
 * `role_permissions` cho MỌI role (kể cả role tuỳ chỉnh) và gắn sẵn vào
 * `request.permissionScope` - dùng lại giá trị này thay vì tự đoán qua tên
 * role là cách generalize đúng, không cần sửa gì thêm khi có role mới.
 *
 * ⚠️ CHỈ dùng được trên route ĐÃ có `@RequirePermission()` (PermissionGuard
 * phải chạy trước để gán field này) - route không có sẽ luôn nhận
 * `undefined`. Vẫn giữ lối thoát hiểm cứng `role === Role.ADMIN` riêng ở
 * nơi gọi (không chỉ dựa vào scope) - đồng bộ với nguyên tắc "admin không
 * bao giờ bị khoá bởi cấu hình role_permissions sai/thiếu" đã áp dụng cho
 * `PermissionGuard`/`RolesService.getMyPermissions()`.
 */
export const GetPermissionScope = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | null | undefined => {
    const request = ctx.switchToHttp().getRequest();
    return request.permissionScope;
  },
);
