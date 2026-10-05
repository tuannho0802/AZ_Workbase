/**
 * Guard đổi status <-> checklist (phía FE) - mirror `resolveStatusChecklistGuard` + `applyStatusChecklistGuard` ở BE
 * (`periodic-tasks.service.ts`). BE là nơi QUYẾT ĐỊNH và ÉP: PATCH đổi status mà cần xác nhận sẽ trả 409
 * `CHECKLIST_GUARD` (kèm số liệu), Task KHÔNG đổi. FE chỉ hỏi người dùng rồi gửi lại PATCH kèm `checklistSync`.
 *  - `complete`: đẩy Task sang trạng thái hoàn thành khi còn checklist chưa tick -> Có = tick hết (`tick_all`).
 *  - `reset`: đưa Task về To-do khi đã có checklist tick -> Có = bỏ tick hết (`untick_all`).
 */
export const CHECKLIST_GUARD_CODE = 'CHECKLIST_GUARD';

export type ChecklistSyncAction = 'tick_all' | 'untick_all';

export interface ChecklistGuardInfo {
    guard: 'complete' | 'reset';
    sync: ChecklistSyncAction;
    total: number;
    done: number;
    targetStatusName: string;
}

/** Nhận diện lỗi 409 Guard checklist từ axios error; không phải Guard -> null (để nơi gọi xử lý lỗi như thường). */
export function parseChecklistGuardError(err: unknown): ChecklistGuardInfo | null {
    if (typeof err !== 'object' || err === null || !('response' in err)) return null;
    const response = (err as { response?: { status?: number; data?: Record<string, unknown> } | null }).response;
    const data = response?.data;
    if (response?.status !== 409 || !data || data.code !== CHECKLIST_GUARD_CODE) return null;
    if ((data.guard !== 'complete' && data.guard !== 'reset') || (data.sync !== 'tick_all' && data.sync !== 'untick_all')) {
        return null;
    }
    return {
        guard: data.guard,
        sync: data.sync,
        total: Number(data.total ?? 0),
        done: Number(data.done ?? 0),
        targetStatusName: typeof data.targetStatusName === 'string' ? data.targetStatusName : '',
    };
}

/** Nội dung hộp thoại xác nhận cho từng loại Guard. */
export function getChecklistGuardPrompt(info: ChecklistGuardInfo, taskTitle: string) {
    const to = info.targetStatusName ? ` "${info.targetStatusName}"` : '';
    if (info.guard === 'complete') {
        const undone = Math.max(info.total - info.done, 0);
        return {
            title: 'Bạn đã hoàn thành Task?',
            content: `Task "${taskTitle}" còn ${undone}/${info.total} checklist chưa tick. Chọn "Có, đã hoàn thành" để tự tick hết checklist còn lại và chuyển Task sang${to}; chọn "Chưa hoàn thành" thì Task giữ nguyên trạng thái hiện tại.`,
            okText: 'Có, đã hoàn thành',
            cancelText: 'Chưa hoàn thành',
        };
    }
    return {
        title: 'Đưa Task về To-do?',
        content: `Task "${taskTitle}" đã có ${info.done}/${info.total} checklist được tick. Chọn "Có, bỏ tick hết" để bỏ tick toàn bộ checklist và chuyển Task về${to}; chọn "Không" thì Task giữ nguyên trạng thái hiện tại.`,
        okText: 'Có, bỏ tick hết',
        cancelText: 'Không',
    };
}
