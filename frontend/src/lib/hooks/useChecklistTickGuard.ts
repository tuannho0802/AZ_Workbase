import { App } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { useUpdatePeriodicTask } from '@/lib/hooks/usePeriodicTasks';
import { usePeriodicTaskStatuses } from '@/lib/hooks/usePeriodicTaskStatuses';
import { getTickPrompt, type TickPrompt } from '@/lib/utils/checklistTickGuard';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';

export interface TickGuardTask {
    id: number;
    title: string;
    status?: { code: string } | null;
}

/**
 * useChecklistTickGuard - hỏi xác nhận khi tick checklist để User không quên đổi trạng thái Task:
 *  - Task đang To-do (not_started): "Bạn đang làm Task này?" Có => tick + chuyển in_progress; Không => KHÔNG tick.
 *  - Tick mục checklist CUỐI CÙNG: "Task này của bạn đã xong?" Có => tick + chuyển in_review; Không => KHÔNG tick.
 * Dùng chung cho `TaskChecklistInline` (Drawer) và `TaskChecklistModal`.
 *
 * `guardTick(task, remainingUndone, doTick)`: `doTick(onTicked)` do nơi gọi cung cấp - chạy mutation tick và
 * gọi `onTicked()` khi tick THÀNH CÔNG (lúc đó mới đổi status, tránh Task đổi status mà mục vẫn chưa tick).
 */
export function useChecklistTickGuard() {
    const { message, modal } = App.useApp();
    const queryClient = useQueryClient();
    const { statuses } = usePeriodicTaskStatuses();
    const updateTask = useUpdatePeriodicTask();

    const changeStatus = (task: TickGuardTask, prompt: TickPrompt) => {
        const target = statuses.find((s) => s.code === prompt.nextStatusCode);
        if (!target) {
            message.warning(`Không tìm thấy trạng thái "${prompt.nextStatusCode}" - vui lòng đổi trạng thái Task thủ công.`);
            return;
        }
        updateTask.mutate(
            { id: task.id, data: { statusId: target.id } },
            {
                onSuccess: () => {
                    message.success(`Đã chuyển "${task.title}" sang ${target.name}`);
                    queryClient.invalidateQueries({ queryKey: ['periodic-task-performance'] });
                },
                onError: (err) => message.error(getApiErrorMessage(err, 'Đã tick checklist nhưng đổi trạng thái Task thất bại')),
            },
        );
    };

    const guardTick = (
        task: TickGuardTask,
        params: { isTicking: boolean; remainingUndone: number },
        doTick: (onTicked?: () => void) => void,
    ) => {
        const prompt = getTickPrompt({ statusCode: task.status?.code, ...params });
        if (!prompt) {
            doTick();
            return;
        }
        const isFinish = prompt.kind === 'finish';
        modal.confirm({
            title: isFinish ? 'Task này của bạn đã xong?' : 'Bạn đang làm Task này?',
            content: isFinish
                ? `Bạn vừa hoàn thành checklist cuối cùng của Task "${task.title}". Chọn "Có, đã xong" để tick và chuyển Task sang Xem xét; chọn "Không" thì checklist cuối cùng sẽ KHÔNG được tick.`
                : `Task "${task.title}" đang ở trạng thái To-do. Chọn "Có, đang làm Task" để tick và tự chuyển Task sang Đang làm; chọn "Không, chưa làm Task" thì checklist sẽ KHÔNG được tick.`,
            okText: isFinish ? 'Có, đã xong' : `Có, đang làm Task`,
            cancelText: isFinish ? 'Không' : 'Không, chưa làm Task',
            onOk: () => doTick(() => changeStatus(task, prompt)),
        });
    };

    return { guardTick };
}
