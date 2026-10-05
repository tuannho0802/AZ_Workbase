import type { DemoCustomer } from './sample-customers';

/**
 * HÀM THUẦN mô phỏng quy tắc "khách nào tôi chia được" của trang Chia Data. Nguồn đối chiếu (đọc code thật):
 *  - `CustomersService.bulkAssign` (BE): scope của `customers.assign` (KHÔNG phải scope của `customers.view`):
 *      all  = mọi khách (Admin luôn như all);
 *      department = chỉ khách có `departmentId` thuộc phòng ban mình QUẢN LÝ (department_managers), KHÔNG cộng khách riêng;
 *      own  = khách CHƯA có Sales chính mà mình là người tạo, HOẶC khách mình đang là Sales chính.
 *  - `CustomersService.getUnassigned` (BE) = tab "Có thể chia": khách chưa có Sales chính (theo scope xem như trên)
 *      CỘNG khách mình đang là Sales chính.
 */
export type AssignScope = 'own' | 'department' | 'all';

export interface AssignCaller {
    userId: number;
    scope: AssignScope;
    /** Phòng ban người này QUẢN LÝ - chỉ có nghĩa với scope = department. */
    managedDepartmentIds: number[];
}

export function canAssignCustomer(c: DemoCustomer, caller: AssignCaller): boolean {
    if (caller.scope === 'all') return true;
    if (caller.scope === 'department') return caller.managedDepartmentIds.includes(c.departmentId);
    const isUnassignedCreator = c.salesUser === null && c.createdById === caller.userId;
    const isPrimarySales = c.salesUser?.id === caller.userId;
    return isUnassignedCreator || isPrimarySales;
}

/** Tab "Có thể chia" (getUnassigned): khách chưa có Sales chính, hoặc mình là Sales chính, thu hẹp theo scope. */
export function computeShareablePool(rows: DemoCustomer[], caller: AssignCaller): DemoCustomer[] {
    return rows.filter((c) => {
        if (c.salesUser?.id === caller.userId) return true;
        if (c.salesUser !== null) return false;
        if (caller.scope === 'all') return true;
        if (caller.scope === 'department') return caller.managedDepartmentIds.includes(c.departmentId);
        return c.createdById === caller.userId;
    });
}

/** Tab "Đã assign" (getAssigned): khách đã có Sales chính (lọc thêm theo phạm vi XEM `customers.view`, truyền vào qua `visible`). */
export function computeAssignedList(visible: DemoCustomer[]): DemoCustomer[] {
    return visible.filter((c) => c.salesUser !== null);
}

export interface AssignOutcome {
    primary: { id: number; name: string } | null;
    shared: { id: number; name: string }[];
}

/**
 * Kết quả sau khi chia `targets` (theo thứ tự chọn) cho 1 khách (bulkAssign + "Bước 5"):
 *  - khách chưa có Sales chính -> người ĐẦU TIÊN trong danh sách chọn thành Sales chính, những người còn lại là Sales phụ;
 *  - khách đã có Sales chính -> giữ nguyên Sales chính, mọi người mới là Sales phụ;
 *  - người đã có lượt gán active thì không tạo lượt mới (không nhân đôi).
 */
export function previewAssignOutcome(c: DemoCustomer, targets: { id: number; name: string }[]): AssignOutcome {
    const activeIds = new Set(c.activeAssignees.map((a) => a.id));
    const primary = c.salesUser ?? targets[0] ?? null;
    const shared = [...c.activeAssignees, ...targets.filter((t) => !activeIds.has(t.id))].filter((a) => a.id !== primary?.id);
    const seen = new Set<number>();
    return {
        primary,
        shared: shared.filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true))),
    };
}

/**
 * Thu hồi 1 lượt gán (reclaimAssignment): nếu người bị thu hồi đang là Sales chính, Sales chính chuyển cho người
 * được gán SỚM NHẤT còn lại; hết người thì khách về "chưa gán". `remaining` đã theo thứ tự gán cũ -> mới.
 */
export function previewReclaim(primaryId: number | null, reclaimedId: number, remaining: { id: number; name: string }[]): { id: number; name: string } | null | 'unchanged' {
    if (primaryId !== reclaimedId) return 'unchanged';
    return remaining[0] ?? null;
}
