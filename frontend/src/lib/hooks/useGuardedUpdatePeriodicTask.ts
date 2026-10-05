import { App } from 'antd';
import { useUpdatePeriodicTask } from './usePeriodicTasks';
import type { UpdatePeriodicTaskPayload } from '../api/periodic-tasks.api';
import { getChecklistGuardPrompt, parseChecklistGuardError } from '../utils/statusChecklistGuard';

interface GuardedVariables {
    id: number;
    data: UpdatePeriodicTaskPayload;
    /** Tiêu đề Task - chỉ để hiện trong hộp thoại xác nhận. */
    title?: string;
}

interface GuardedOptions {
    onSuccess?: () => void;
    onError?: (err: unknown) => void;
    /** Người dùng chọn KHÔNG ở hộp thoại Guard -> Task giữ nguyên trạng thái (vd Kanban dùng để trả thẻ về cột cũ). */
    onCancel?: () => void;
}

/**
 * useGuardedUpdatePeriodicTask - bọc `useUpdatePeriodicTask` cho MỌI nơi đổi status (Kanban kéo-thả, dropdown ở
 * `UserTasksPanel`, form Sửa): BE trả 409 `CHECKLIST_GUARD` khi đổi status cần xác nhận checklist
 * (xem `lib/utils/statusChecklistGuard.ts`) -> hỏi người dùng:
 *  - Có   => gửi lại PATCH kèm `checklistSync` (BE tick/bỏ tick hàng loạt rồi đổi status).
 *  - Không => KHÔNG đổi gì, gọi `onCancel`.
 * Lỗi khác đi thẳng `onError` như `useMutation` thường. API `mutate(vars, opts)` giữ gần như y hệt để thay thế 1-1.
 */
export function useGuardedUpdatePeriodicTask() {
    const { modal } = App.useApp();
    const mutation = useUpdatePeriodicTask();

    const mutate = (vars: GuardedVariables, opts: GuardedOptions = {}) => {
        const run = (data: UpdatePeriodicTaskPayload) =>
            mutation.mutate(
                { id: vars.id, data },
                {
                    onSuccess: () => opts.onSuccess?.(),
                    onError: (err) => {
                        const guard = parseChecklistGuardError(err);
                        if (!guard) {
                            opts.onError?.(err);
                            return;
                        }
                        const prompt = getChecklistGuardPrompt(guard, vars.title ?? `#${vars.id}`);
                        modal.confirm({
                            title: prompt.title,
                            content: prompt.content,
                            okText: prompt.okText,
                            cancelText: prompt.cancelText,
                            onOk: () => run({ ...data, checklistSync: guard.sync }),
                            onCancel: () => opts.onCancel?.(),
                        });
                    },
                },
            );
        run(vars.data);
    };

    return { ...mutation, mutate };
}
