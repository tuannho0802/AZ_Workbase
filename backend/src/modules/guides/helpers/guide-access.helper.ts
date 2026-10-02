/**
 * Quyền xem 1 guide - hàm THUẦN (không DB), mirror tinh thần `UtmAccessHelper`.
 *
 * Quy tắc (PLAN_HARDENING P7):
 *  - Người có `guides.manage` (Root Admin luôn có) xem được MỌI guide đã xuất bản để xem trước,
 *    bản nháp thì lấy qua nhóm `manage/*`.
 *  - Người khác: guide phải đã xuất bản VÀ (không gán role nào HOẶC role của người gọi nằm trong danh sách).
 *  - Guide không được xem -> service trả 404 (không lộ sự tồn tại).
 */
export interface GuideVisibilityInput {
  isPublished: boolean;
  /** Danh sách role được gán (rỗng = mọi role). */
  assignedRoleIds: number[];
}

export class GuideAccessHelper {
  static canView(guide: GuideVisibilityInput, callerRoleId: number | null, canManage: boolean): boolean {
    if (!guide.isPublished) return false;
    if (canManage) return true;
    if (guide.assignedRoleIds.length === 0) return true;
    return callerRoleId != null && guide.assignedRoleIds.includes(callerRoleId);
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
