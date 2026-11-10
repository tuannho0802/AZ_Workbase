/**
 * Quyền trên 1 Fanpage cụ thể - hàm THUẦN (không phụ thuộc DB), mirror `UtmAccessHelper`.
 * Scope so với DANH SÁCH NGƯỜI PHỤ TRÁCH (`owners`, nhiều người) của Page:
 *   all        : mọi Page
 *   own        : Page mình là 1 trong những người phụ trách
 *   department : Page mình phụ trách + Page có BẤT KỲ người phụ trách nào thuộc phòng ban mình được gán quản lý
 * Scope null/'none'/không hợp lệ -> fail-closed (false). Page chưa có người phụ trách chỉ scope 'all' mới chạm được.
 */
export interface FanpageAccessContext {
    userId: number;
    /** ID của TẤT CẢ người phụ trách (rỗng nếu Page chưa có chủ). */
    ownerIds: number[];
    /** Phòng ban của các người phụ trách (bỏ qua người không thuộc phòng ban nào). */
    ownerDepartmentIds: number[];
    /** Các phòng ban người gọi được gán quản lý (bảng department_managers). */
    managedDepartmentIds: number[];
}

export class FanpageAccessHelper {
    static allows(scope: string | null | undefined, ctx: FanpageAccessContext): boolean {
        if (scope === 'all') return true;
        if (scope !== 'own' && scope !== 'department') return false;
        if (ctx.ownerIds.includes(ctx.userId)) return true;
        return scope === 'department' && ctx.ownerDepartmentIds.some((d) => ctx.managedDepartmentIds.includes(d));
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