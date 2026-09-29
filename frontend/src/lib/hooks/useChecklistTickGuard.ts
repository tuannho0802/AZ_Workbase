import { App } from 'antd';
import { getTickPrompt, isCompletedStatus, type NextStatusCode } from '@/lib/utils/checklistTickGuard';

export interface TickGuardTask {
    id: number;
    title: string;
    status?: { code: string; isDoneState?: boolean } | null;
}

/**
 * useChecklistTickGuard - hỏi xác nhận khi tick/thêm checklist để User không quên đổi trạng thái Task.
 * BE là nơi ÉP đổi status (trong CHÍNH request tick/thêm) - FE chỉ hỏi và truyền ý định, KHÔNG gọi PATCH thứ 2:
 *  - Tick trên Task To-do: "Bạn đang làm Task này?" Có => tick (BE ép in_progress); Không => KHÔNG tick.
 *  - Tick mục CUỐI: "Task này đã xong?" Có => tick + `nextStatusCode=in_review`; Không => KHÔNG tick.
 *  - Thêm checklist vào Task ĐÃ HOÀN THÀNH: "Đã hoàn thành chưa?" "Chưa hoàn thành, cần làm tiếp" => thêm + `reopen`
 *    (BE đổi in_progress + kéo period_end tới hôm nay nếu kỳ đã qua); "Vẫn đã hoàn thành" => chỉ thêm.
 * Dùng chung cho `TaskChecklistInline` (Drawer) và `TaskChecklistModal`.
 */
export function useChecklistTickGuard() {
    const { modal } = App.useApp();

    const guardTick = (
        task: TickGuardTask,
        params: { isTicking: boolean; remainingUndone: number },
        doTick: (nextStatusCode?: NextStatusCode) => void,
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
            okText: isFinish ? 'Có, đã xong' : 'Có, đang làm Task',
            cancelText: isFinish ? 'Không' : 'Không, chưa làm Task',
            onOk: () => doTick(prompt.nextStatusCode),
        });
    };

    /** Thêm checklist mới: Task đã hoàn thành thì hỏi lại; Task khác -> thêm luôn. `doAdd(reopen)` do nơi gọi cung cấp. */
    const guardAdd = (task: TickGuardTask, doAdd: (reopen?: boolean) => void) => {
        if (!isCompletedStatus(task.status)) {
            doAdd();
            return;
        }
        const ref = modal.confirm({
            title: 'Task này đã hoàn thành chưa?',
            content: `Task "${task.title}" đang ở trạng thái đã hoàn thành. Bạn vừa thêm checklist mới - Task đã hoàn thành thật sự chưa?`,
            okText: 'Chưa hoàn thành, cần làm tiếp',
            cancelText: 'Vẫn đã hoàn thành',
            onOk: () => doAdd(true),
            onCancel: () => doAdd(),
        });
        return ref;
    };

    return { guardTick, guardAdd };
}
