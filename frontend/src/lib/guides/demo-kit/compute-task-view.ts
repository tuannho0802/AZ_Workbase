import type { PeriodicTask } from '@/lib/api/periodic-tasks.api';
import type { DemoScope } from './personas';
import type { TaskPersona } from './task-personas';

/**
 * HÀM THUẦN mô phỏng "người này thấy gì" ở trang Công việc định kỳ. Nguồn đối chiếu (đọc code thật):
 *  - Dòng: `backend/.../helpers/periodic-task-access.helper.ts` `applyViewFilter` -
 *      all = tất cả; department = CHỈ phòng ban mình quản lý (KHÔNG cộng việc riêng - khác Khách hàng);
 *      own = mình tạo / Phụ trách chính / Phụ trách phụ.
 *  - Xoá: `PeriodicTaskAccessHelper.canDelete` + `cong-viec-dinh-ky/page.tsx` - cần `periodic_tasks.delete`;
 *      scope all/department -> mọi việc đã thấy; scope own -> chỉ việc mình tạo hoặc mình Phụ trách chính.
 *  - Sửa: nút hiện khi có `periodic_tasks.edit`; việc đang khoá mà thiếu `periodic_tasks.edit_locked` -> nút bị vô hiệu.
 *  - Khoá/Mở khoá + Đánh dấu quá hạn: `periodic_tasks.approve`.
 *  - Nút "Khách hàng": cần `customers.view` và việc có khách liên kết (`customerCount > 0`) - KHÔNG cần `link_customer`
 *      (quyền đó chỉ quyết định gắn/gỡ khách trong form Tạo/Sửa).
 *  - Liên kết / Checklist / Lịch sử: luôn hiện (chỉ cần vào được trang).
 */
export const TASK_ACTION = {
    link: 'Liên kết',
    checklist: 'Checklist',
    customers: 'Khách hàng',
    audit: 'Lịch sử',
    edit: 'Sửa',
    lock: 'Khoá',
    unlock: 'Mở khoá',
    overdue: 'Đánh dấu / Gỡ quá hạn',
    delete: 'Xoá',
} as const;

export interface TaskRowActions {
    taskId: number;
    /** Nút hiện ở hàng này, theo đúng thứ tự trên `TaskActionsBar`. */
    visible: string[];
    /** Nút hiện nhưng bị vô hiệu (chỉ có thể là Sửa khi việc đang khoá). */
    disabled: string[];
}

export interface TaskPageView {
    canViewPage: boolean;
    rows: PeriodicTask[];
    actions: TaskRowActions[];
    toolbar: string[];
    tabs: string[];
}

const has = (p: TaskPersona, key: string) => p.permissions.includes(key);
const scopeOf = (p: TaskPersona, key: string): DemoScope | undefined => p.scopes[key];

export function isOwnTask(t: PeriodicTask, userId: number): boolean {
    return (
        t.createdById === userId ||
        t.primaryAssigneeId === userId ||
        (t.secondaryAssignees ?? []).some((u) => u.id === userId)
    );
}

export function canSeeTask(t: PeriodicTask, p: TaskPersona): boolean {
    if (!has(p, 'periodic_tasks.view')) return false;
    const scope = scopeOf(p, 'periodic_tasks.view');
    if (scope === 'all') return true;
    if (scope === 'department') return t.departmentId != null && p.managedDepartmentIds.includes(t.departmentId);
    return isOwnTask(t, p.userId);
}

export function canDeleteTask(t: PeriodicTask, p: TaskPersona): boolean {
    if (!has(p, 'periodic_tasks.delete')) return false;
    const scope = scopeOf(p, 'periodic_tasks.delete');
    if (scope === 'all' || scope === 'department') return true;
    return t.createdById === p.userId || t.primaryAssigneeId === p.userId;
}

export function computeTaskRowActions(t: PeriodicTask, p: TaskPersona, overdueButtonShown: boolean): TaskRowActions {
    const visible: string[] = [TASK_ACTION.link, TASK_ACTION.checklist];
    if (has(p, 'customers.view') && (t.customerCount ?? 0) > 0) visible.push(TASK_ACTION.customers);
    visible.push(TASK_ACTION.audit);
    const disabled: string[] = [];
    if (has(p, 'periodic_tasks.edit')) {
        visible.push(TASK_ACTION.edit);
        if (t.isLocked && !has(p, 'periodic_tasks.edit_locked')) disabled.push(TASK_ACTION.edit);
    }
    if (has(p, 'periodic_tasks.approve')) {
        visible.push(t.isLocked ? TASK_ACTION.unlock : TASK_ACTION.lock);
        if (overdueButtonShown) visible.push(TASK_ACTION.overdue);
    }
    if (canDeleteTask(t, p)) visible.push(TASK_ACTION.delete);
    return { taskId: t.id, visible, disabled };
}

/**
 * `overdueShown(task)` do nơi gọi truyền vào (dùng đúng `canMarkOverdue/canUnmarkOverdue` thật với "hôm nay" cố định
 * của bộ mẫu) để file này giữ thuần và không phụ thuộc đồng hồ.
 */
export function computeTaskPageView(
    tasks: PeriodicTask[],
    p: TaskPersona,
    overdueShown: (t: PeriodicTask) => boolean = () => false,
): TaskPageView {
    const canViewPage = has(p, 'periodic_tasks.view');
    const rows = tasks.filter((t) => canSeeTask(t, p));
    const toolbar: string[] = [];
    if (canViewPage && has(p, 'periodic_tasks.create')) toolbar.push('Tạo Công việc mới');
    const tabs = canViewPage ? ['Bảng', 'Xem theo Ngày', 'Kanban', 'Lịch tháng'] : [];
    if (canViewPage && has(p, 'periodic_tasks.trash_manage')) tabs.push('Thùng rác');
    return {
        canViewPage,
        rows,
        actions: rows.map((t) => computeTaskRowActions(t, p, overdueShown(t))),
        toolbar,
        tabs,
    };
}
