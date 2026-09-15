'use client';

import { PeriodicTask } from '@/lib/api/periodic-tasks.api';
import { TaskChainInfo } from '@/lib/utils/taskLinkChains';

export interface TaskChainGroupedListProps {
    /** Danh sách Task ĐÃ sắp qua `sortTasksByChain()` - thành viên cùng 1
     * chuỗi phải LIỀN NHAU thì hàm gom "run" bên dưới mới ra kết quả đúng. */
    tasks: PeriodicTask[];
    chains: Map<number, TaskChainInfo>;
    renderTask: (task: PeriodicTask) => React.ReactNode;
}

/**
 * TaskChainGroupedList - Phase 8 (PLAN mục Phase 8, yêu cầu chủ dự án
 * 2026-09-15 "hiển thị UI nối/xếp hàng khi Task đã liên kết"). Gom các Task
 * LIỀN NHAU cùng 1 chuỗi (`chain.color` giống nhau) thành 1 khối, vẽ 1 đoạn
 * đường kẻ dọc LIÊN TỤC (không phải từng đoạn rời rạc) xuyên suốt khối kèm 1
 * chấm tròn cho mỗi Task trong khối - mirror trực quan `antd Timeline` (git
 * graph) nhưng tự dựng bằng CSS thuần vì `Timeline` không hợp bố cục Card
 * hiện có (mỗi Task đã là 1 `TaskMiniCard` đầy đủ, không phải 1 dòng text).
 *
 * CHỈ áp dụng được cho bố cục khối dọc thuần (Agenda mỗi ngày, Kanban mỗi
 * cột) - Table dùng `<tr>` riêng biệt nên áp dụng kiểu khác (viền trái màu,
 * xem `columns` ở `page.tsx`), Calendar dùng `TaskChainBadge` (Tooltip liệt
 * kê) vì lưới ngày không phải khối dọc liên tục.
 */
export function TaskChainGroupedList({ tasks, chains, renderTask }: TaskChainGroupedListProps) {
    const runs: Array<{ color: string | null; items: PeriodicTask[] }> = [];
    for (const task of tasks) {
        const chain = chains.get(task.id);
        const last = runs[runs.length - 1];
        if (chain && last && last.color === chain.color) {
            last.items.push(task);
        } else {
            runs.push({ color: chain?.color ?? null, items: [task] });
        }
    }

    return (
        <>
            {runs.map((run, runIndex) => {
                if (!run.color || run.items.length < 2) {
                    return (
                        <div key={runIndex}>
                            {run.items.map((task) => (
                                <div key={task.id}>{renderTask(task)}</div>
                            ))}
                        </div>
                    );
                }
                return (
                    <div key={runIndex} style={{ position: 'relative', paddingLeft: 16 }}>
                        {/* Đường kẻ dọc LIÊN TỤC xuyên suốt cả khối - vẽ 1 LẦN cho cả
                            `run`, không lặp theo từng Task, mới ra cảm giác "nối liền". */}
                        <div
                            aria-hidden
                            style={{
                                position: 'absolute',
                                left: 5,
                                top: 18,
                                bottom: 26,
                                width: 2,
                                backgroundColor: run.color,
                                borderRadius: 1,
                            }}
                        />
                        {run.items.map((task) => (
                            <div key={task.id} style={{ position: 'relative' }}>
                                <span
                                    aria-hidden
                                    style={{
                                        position: 'absolute',
                                        left: -16 + 1,
                                        top: 16,
                                        width: 10,
                                        height: 10,
                                        borderRadius: '50%',
                                        backgroundColor: run.color as string,
                                        border: '2px solid var(--ant-color-bg-container, #fff)',
                                        boxSizing: 'content-box',
                                    }}
                                />
                                {renderTask(task)}
                            </div>
                        ))}
                    </div>
                );
            })}
        </>
    );
}
