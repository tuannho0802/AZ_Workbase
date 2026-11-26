import { RolePermissionEntry } from '@/lib/types/roles.types';

/**
 * Hợp nhất ma trận Toàn cục với override (nếu có) của 1 phòng ban/vị trí, ra đúng
 * trạng thái HIỆU LỰC để hiển thị lúc mở Editor - FIX bug thật: trước đây
 * Editor override luôn khởi tạo từ mảng override THÔ (`selectedOverride?.
 * permissions ?? []`), nên phòng ban CHƯA override gì thấy TOÀN BỘ checkbox
 * trống trơn dù Toàn cục đang bật đầy đủ - muốn override 1 quyền, Admin
 * buộc phải tự tay tick lại HẾT các quyền Toàn cục khác trong tab Override
 * (hoặc tệ hơn, phải tắt ở Toàn cục trước). Hàm này đảm bảo Editor LUÔN mở
 * ra ở đúng trạng thái "phòng ban này thật sự có quyền gì" (Toàn cục đã áp
 * dụng override, nếu có) - sync 1 chiều Toàn cục -> Override ngay lúc mở,
 * đúng yêu cầu nghiệp vụ.
 *
 * (Chuyển từ DepartmentOverridesPanel.tsx sang file riêng để modal "Chép từ..."
 * dùng chung mà không tạo vòng import; DepartmentOverridesPanel vẫn re-export.)
 */
export function mergeGlobalWithOverride(
  globalPermissions: RolePermissionEntry[],
  overridePermissions: RolePermissionEntry[],
): RolePermissionEntry[] {
  const map = new Map<string, RolePermissionEntry['scope']>(
    globalPermissions.map((p) => [p.permissionKey, p.scope]),
  );
  for (const o of overridePermissions) {
    if (o.scope === 'none') {
      // Từ chối tường minh - phòng ban KHÔNG có quyền này dù Toàn cục bật.
      map.delete(o.permissionKey);
    } else {
      map.set(o.permissionKey, o.scope);
    }
  }
  return Array.from(map.entries()).map(([permissionKey, scope]) => ({ permissionKey, scope }));
}

/**
 * Bản nháp "Chép từ..." - CHỈ nằm trong state FE, chưa gọi API nào. Chỉ thành
 * dữ liệu thật khi người dùng bấm "Lưu thay đổi" ở Editor (lúc đó Editor tự tính
 * diff so với Toàn cục của role đích, như mọi lần sửa tay).
 */
export interface OverrideCopyDraft {
  /** Vị trí/Phòng ban đích mà bản nháp áp vào - đổi đích thì bản nháp bị bỏ. */
  entityId: number;
  /** Quyền HIỆU LỰC của nguồn (Toàn cục của role nguồn + override nguồn). */
  permissions: RolePermissionEntry[];
  /** Nhãn hiển thị, vd "Director (Nhân viên)". */
  sourceLabel: string;
  /** Tăng mỗi lần áp - dùng làm phần của React key để Editor khởi tạo lại state. */
  version: number;
}

/** Quyền hiệu lực của nguồn = Toàn cục role nguồn đã áp override nguồn (nếu có). */
export function buildCopyDraftPermissions(
  sourceGlobal: RolePermissionEntry[],
  sourceOverride: RolePermissionEntry[] | undefined,
): RolePermissionEntry[] {
  return mergeGlobalWithOverride(sourceGlobal, sourceOverride ?? []);
}
