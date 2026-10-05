/**
 * Quyền xem 1 guide - hàm THUẦN (không DB), mirror tinh thần `UtmAccessHelper`.
 *
 * Quy tắc (PLAN_HARDENING P7):
 *  - Người có `guides.manage` (Root Admin luôn có) xem được MỌI guide đã xuất bản để xem trước,
 *    bản nháp thì lấy qua nhóm `manage/*`.
 *  - Người khác: guide phải đã xuất bản VÀ, với mỗi chiều (role / vị trí / phòng ban) đã gán, người gọi thuộc chiều đó
 *    (chiều để trống = không giới hạn; AND giữa các chiều).
 *  - Thêm 1 chiều nữa: nếu guide có `requiredPermissions` thì người xem phải đang có TẤT CẢ permission đó (AND).
 *  - LOẠI TRỪ (P6): với mỗi chiều, nếu người xem thuộc danh sách loại trừ thì KHÔNG xem được - loại trừ THẮNG "được xem".
 *    Người xem không có giá trị ở chiều đó (vd chưa có vị trí) thì không bị loại trừ theo chiều đó. `guides.manage` vẫn xem được.
 *  - Guide không được xem -> service trả 404 (không lộ sự tồn tại).
 */
export interface GuideVisibilityInput {
  isPublished: boolean;
  /** Danh sách role được gán (rỗng = mọi role). */
  assignedRoleIds: number[];
  /** Danh sách vị trí được gán (rỗng/bỏ trống = mọi vị trí). */
  assignedPositionIds?: number[];
  /** Danh sách phòng ban được gán (rỗng/bỏ trống = mọi phòng ban). */
  assignedDepartmentIds?: number[];
  /** LOẠI TRỪ: người xem thuộc BẤT KỲ danh sách nào dưới đây thì không xem được (rỗng/bỏ trống = không loại trừ ai). */
  excludedRoleIds?: number[];
  excludedPositionIds?: number[];
  excludedDepartmentIds?: number[];
  /** Các permission key yêu cầu - phải có TẤT CẢ (rỗng/bỏ trống = không yêu cầu). */
  requiredPermissions?: string[];
}

/** Người xem: role/vị trí/phòng ban hiện tại (null = không có). */
export interface GuideViewer {
  roleId: number | null;
  positionId: number | null;
  departmentId: number | null;
  /**
   * Tập permission key người xem ĐANG CÓ (chỉ cần chứa các key mà guide yêu cầu - service tính sẵn, Root Admin = có hết).
   * Bỏ trống = không có quyền nào.
   */
  grantedPermissionKeys?: ReadonlySet<string>;
}

/** Chiều không giới hạn (rỗng) -> true; ngược lại giá trị của người xem phải nằm trong danh sách. */
const matchesDimension = (assigned: number[] | undefined, value: number | null): boolean =>
  !assigned || assigned.length === 0 || (value != null && assigned.includes(value));

/** Người xem có giá trị ở chiều này VÀ giá trị đó nằm trong danh sách loại trừ. Thiếu giá trị (null) -> không bị loại trừ. */
const isExcludedBy = (excluded: number[] | undefined, value: number | null): boolean =>
  !!excluded && value != null && excluded.includes(value);

export class GuideAccessHelper {
  /**
   * AND giữa 3 chiều (role / vị trí / phòng ban): mỗi chiều ĐÃ được gán thì người xem phải thuộc chiều đó.
   * Ví dụ guide gán Role=Employee + Vị trí=Sales: chỉ Employee có vị trí Sales mới thấy.
   */
  static canView(guide: GuideVisibilityInput, viewer: GuideViewer, canManage: boolean): boolean {
    if (!guide.isPublished) return false;
    if (canManage) return true;
    if (
      isExcludedBy(guide.excludedRoleIds, viewer.roleId) ||
      isExcludedBy(guide.excludedPositionIds, viewer.positionId) ||
      isExcludedBy(guide.excludedDepartmentIds, viewer.departmentId)
    ) {
      return false;
    }
    return (
      matchesDimension(guide.assignedRoleIds, viewer.roleId) &&
      matchesDimension(guide.assignedPositionIds, viewer.positionId) &&
      matchesDimension(guide.assignedDepartmentIds, viewer.departmentId) &&
      (guide.requiredPermissions ?? []).every((key) => viewer.grantedPermissionKeys?.has(key) ?? false)
    );
  }

  /** Chỉ người có `guides.manage` mới thấy/sửa bản nháp và danh sách quản trị. */
  static canManageGuides(canManage: boolean): boolean {
    return canManage;
  }

  /** Slug tự sinh từ tiêu đề: bỏ dấu, chữ thường, gạch ngang, cắt theo độ dài tối đa. */
  static slugify(input: string, maxLength = 100): string {
    const base = input
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'd')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, maxLength)
      .replace(/-+$/g, '');
    return base || 'huong-dan';
  }
}
