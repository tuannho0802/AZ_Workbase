/**
 * Quyền xem 1 guide - hàm THUẦN (không DB), mirror tinh thần `UtmAccessHelper`.
 *
 * Quy tắc (PLAN_HARDENING P7):
 *  - Người có `guides.manage` (Root Admin luôn có) xem được MỌI guide đã xuất bản để xem trước,
 *    bản nháp thì lấy qua nhóm `manage/*`.
 *  - Người khác: guide phải đã xuất bản VÀ, với mỗi chiều (role / vị trí / phòng ban) đã gán, người gọi thuộc chiều đó
 *    (chiều để trống = không giới hạn; AND giữa các chiều).
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
}

/** Người xem: role/vị trí/phòng ban hiện tại (null = không có). */
export interface GuideViewer {
  roleId: number | null;
  positionId: number | null;
  departmentId: number | null;
}

/** Chiều không giới hạn (rỗng) -> true; ngược lại giá trị của người xem phải nằm trong danh sách. */
const matchesDimension = (assigned: number[] | undefined, value: number | null): boolean =>
  !assigned || assigned.length === 0 || (value != null && assigned.includes(value));

export class GuideAccessHelper {
  /**
   * AND giữa 3 chiều (role / vị trí / phòng ban): mỗi chiều ĐÃ được gán thì người xem phải thuộc chiều đó.
   * Ví dụ guide gán Role=Employee + Vị trí=Sales: chỉ Employee có vị trí Sales mới thấy.
   */
  static canView(guide: GuideVisibilityInput, viewer: GuideViewer, canManage: boolean): boolean {
    if (!guide.isPublished) return false;
    if (canManage) return true;
    return (
      matchesDimension(guide.assignedRoleIds, viewer.roleId) &&
      matchesDimension(guide.assignedPositionIds, viewer.positionId) &&
      matchesDimension(guide.assignedDepartmentIds, viewer.departmentId)
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
