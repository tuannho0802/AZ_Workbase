/**
 * Quyền trên 1 UTM cụ thể - hàm THUẦN (không phụ thuộc DB), mirror tinh thần
 * `LinkGroupAccessHelper` nhưng theo SCOPE của permission `utms.*`.
 *
 * Tầng service tra `PermissionsService` để biết scope hiệu lực của từng permission
 * (Root Admin luôn = 'all'), rồi gọi `relation()` để biết mối quan hệ của người gọi với UTM:
 *   - 'all'        : scope = all (Admin/Assistant...)
 *   - 'department' : scope = department và Quản lý chính của UTM thuộc phòng ban mình quản lý
 *   - 'primary'    : là Quản lý chính
 *   - 'secondary'  : là Quản lý phụ
 *   - null         : không liên quan / ngoài scope
 * UTM không có Quản lý chính (backfill từ dữ liệu cũ) chỉ scope 'all' mới thao tác được.
 * Quyền quản lý UTM KHÔNG mở rộng quyền xem khách hàng (PLAN 6.2).
 */
export type UtmRelation = 'all' | 'department' | 'primary' | 'secondary' | null;

export interface UtmRelationContext {
  userId: number;
  primaryManagerId: number | null;
  secondaryManagerUserIds: number[];
  /** Phòng ban của Quản lý chính (null nếu không có chính / chính không thuộc phòng ban nào). */
  primaryManagerDepartmentId: number | null;
  /** Các phòng ban người gọi được gán quản lý (bảng department_managers). */
  managedDepartmentIds: number[];
}

export class UtmAccessHelper {
  /** `scope` = scope hiệu lực của 1 permission utms.* (own/department/all), null/'none' = không có quyền. */
  static relation(scope: string | null | undefined, ctx: UtmRelationContext): UtmRelation {
    if (scope !== 'own' && scope !== 'department' && scope !== 'all') return null;
    if (scope === 'all') return 'all';
    if (ctx.primaryManagerId != null && ctx.primaryManagerId === ctx.userId) return 'primary';
    if (ctx.secondaryManagerUserIds.includes(ctx.userId)) return 'secondary';
    if (
      scope === 'department' &&
      ctx.primaryManagerDepartmentId != null &&
      ctx.managedDepartmentIds.includes(ctx.primaryManagerDepartmentId)
    ) {
      return 'department';
    }
    return null;
  }

  /** Đổi tên / visibility / chuyển chính / khoá-mở tên: chính hoặc scope rộng (phụ thì không). */
  static canEditIdentity(rel: UtmRelation): boolean {
    return rel === 'all' || rel === 'department' || rel === 'primary';
  }

  /** Sửa mô tả / màu / khoá-mở: chính, phụ hoặc scope rộng. */
  static canEditMeta(rel: UtmRelation): boolean {
    return rel !== null;
  }

  /** Thêm/gỡ Quản lý phụ, chuyển chính: chỉ chính hoặc scope rộng. */
  static canEditSecondaryManagers(rel: UtmRelation): boolean {
    return UtmAccessHelper.canEditIdentity(rel);
  }

  static canDelete(rel: UtmRelation): boolean {
    return UtmAccessHelper.canEditIdentity(rel);
  }

  /** Có được XEM chi tiết quản lý (danh sách chính/phụ) không. */
  static canViewManagers(isMember: boolean, viewRel: UtmRelation): boolean {
    return isMember || viewRel === 'all' || viewRel === 'department';
  }

  /** Có được CHỌN UTM này cho khách hàng không (dropdown). */
  static canUse(visibility: 'shared' | 'restricted', isMember: boolean, viewRel: UtmRelation): boolean {
    if (visibility === 'shared') return true;
    return isMember || viewRel === 'all' || viewRel === 'department';
  }
}
