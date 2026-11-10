/**
 * Quyền trên 1 Fanpage cụ thể - hàm THUẦN (không phụ thuộc DB), mirror `UtmAccessHelper`.
 * Scope so với NGƯỜI PHỤ TRÁCH (`owner`) của Page:
 *   all        : mọi Page
 *   own        : Page mình phụ trách
 *   department : Page mình phụ trách + Page có người phụ trách thuộc phòng ban mình được gán quản lý
 * Scope null/'none'/không hợp lệ -> fail-closed (false). Page chưa có người phụ trách chỉ scope 'all' mới chạm được.
 */
export interface FanpageAccessContext {
    userId: number;
    ownerId: number | null;
    /** Phòng ban của người phụ trách (null nếu không có chủ / chủ không thuộc phòng ban nào). */
    ownerDepartmentId: number | null;
    /** Các phòng ban người gọi được gán quản lý (bảng department_managers). */
    managedDepartmentIds: number[];
}

export class FanpageAccessHelper {
    static allows(scope: string | null | undefined, ctx: FanpageAccessContext): boolean {
        if (scope === 'all') return true;
        if (scope !== 'own' && scope !== 'department') return false;
        if (ctx.ownerId != null && ctx.ownerId === ctx.userId) return true;
        return (
            scope === 'department' &&
            ctx.ownerDepartmentId != null &&
            ctx.managedDepartmentIds.includes(ctx.ownerDepartmentId)
        );
    }

    /** Có thể GIAO Page cho người khác không: chỉ scope rộng (all/department) của `fanpages.edit`. */
    static canAssignOwner(editScope: string | null | undefined): boolean {
        return editScope === 'all' || editScope === 'department';
    }

    /** Người nhận Page có nằm trong phạm vi giao của scope không (department: phải thuộc phòng ban mình quản lý). */
    static canAssignTo(
        editScope: string | null | undefined,
        targetDepartmentId: number | null,
        managedDepartmentIds: number[],
    ): boolean {
        if (editScope === 'all') return true;
        if (editScope !== 'department') return false;
        return targetDepartmentId != null && managedDepartmentIds.includes(targetDepartmentId);
    }
}