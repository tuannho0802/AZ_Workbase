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
 * LIỀN NHAU cùng 1 chuỗi (`chain.color` giống nhau) thành 1 khối và vẽ theo
 * kiểu **cây phân cấp (tree view)** - phản hồi chủ dự án cùng ngày (bản đầu
 * dùng 1 đường thẳng liên tục xuyên tâm mỗi Task trông giống "dây nối"/git
 * graph hơn là quan hệ cha-con, gây khó hiểu khi chuỗi có nhiều thành viên):
 * - Task ĐẦU TIÊN trong khối (gốc, `chain.index === 0` sau khi đã sắp topo)
 *   không có nhánh nối vào - chỉ có 1 chấm đánh dấu, giống gốc cây.
 * - MỌI Task sau đó vẽ 1 đoạn dọc đi xuống từ Task phía trên rồi BẺ GÓC 90°
 *   rẽ ngang vào đúng nội dung Task đó (giống dấu `├─`/`└─` của file-tree),
 *   thay vì đâm thẳng qua tâm như bản cũ.
 * - Trục dọc CHỈ tiếp tục đi xuống nếu còn Task kế tiếp trong khối (Task
 *   cuối khối không có đoạn dọc phía dưới - giống `└─`, trục "kết thúc" tại
 *   đó thay vì `├─` "còn tiếp").
 *
 * Vẽ theo TỪNG Task (không phải 1 đường kẻ absolute-full-height cho cả khối
 * như bản cũ) để đúng ngữ nghĩa "mỗi đoạn rẽ ứng với đúng 1 quan hệ cha-con",
 * nhưng vẫn cần đường nối LIỀN MẠCH qua các Task cao thấp khác nhau (Card có
 * nội dung/footer khác nhau) - dùng `display: 'flow-root'` cho khung bọc mỗi
 * Task để NGĂN margin-collapsing của `marginBottom` trong `TaskMiniCard`
 * (nếu không, mép dưới `top/bottom` sẽ tính hụt 8px so với mép trên Task kế
 * tiếp, đường nối bị đứt đoạn ở đúng chỗ khoảng cách giữa 2 Card) - kỹ thuật
 * này tương đương `overflow: hidden` để "chứa" margin nhưng KHÔNG cắt (clip)
 * mất phần chấm/nhánh nằm bên TRÁI khung (trong vùng thụt `INDENT`).
 *
 * CHỈ áp dụng được cho bố cục khối dọc thuần (Agenda mỗi ngày, Kanban mỗi
 * cột) - Table dùng `<tr>` riêng biệt nên áp dụng kiểu khác (xem `columns` ở
 * `page.tsx`, cùng nguyên lý cây nhưng phải "bleed" theo padding cố định vì
 * không kiểm soát được margin của `<td>`), Calendar dùng `TaskChainBadge`
 * (Tooltip liệt kê) vì lưới ngày không phải khối dọc liên tục.
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

    // Khoảng cách GIỮA 2 khối ("task lớn"/chuỗi) liền kề - phản hồi chủ dự án
    // 2026-09-15: các khối trước đây dính sát nhau (marginBottom = 0) trông
    // như 1 danh sách liền mạch dù thuộc 2 chuỗi/2 Task độc lập khác nhau,
    // khó phân biệt bằng mắt. Áp dụng ĐỀU cho cả khối có đường nối lẫn Task
    // đơn lẻ (không thuộc chuỗi nào) để khoảng cách nhất quán xuyên suốt danh
    // sách, không riêng khối có chuỗi.
    const RUN_GAP = 10;
    // Thụt dòng nội dung Task khỏi trục dọc/nhánh rẽ.
    const INDENT = 28;
    // Toạ độ trục dọc (tính từ mép trái khung `INDENT`, ÂM vì trục nằm TRONG
    // phần thụt lề, còn nội dung Task bắt đầu tại x = 0 của mỗi khung con).
    const TRUNK_X = -18;
    // Độ cao điểm bẻ góc (tính từ mép TRÊN của mỗi khung Task) - nơi đường
    // dọc dừng lại và nhánh ngang bắt đầu rẽ vào nội dung.
    const BEND_Y = 16;

    return (
        <>
            {runs.map((run, runIndex) => {
                const isLast = runIndex === runs.length - 1;
                if (!run.color || run.items.length < 2) {
                    return (
                        <div key={runIndex} style={{ marginBottom: isLast ? 0 : RUN_GAP }}>
                            {run.items.map((task) => (
                                <div key={task.id}>{renderTask(task)}</div>
                            ))}
                        </div>
                    );
                }
                return (
                    <div key={runIndex} style={{ paddingLeft: INDENT, marginBottom: isLast ? 0 : RUN_GAP }}>
                        {run.items.map((task, itemIndex) => {
                            const isRoot = itemIndex === 0;
                            const isLeaf = itemIndex === run.items.length - 1;
                            return (
                                <div key={task.id} style={{ position: 'relative', display: 'flow-root' }}>
                                    {/* Đoạn dọc ĐI VÀO Task này từ Task cha phía trên - KHÔNG
                                        vẽ cho gốc (`isRoot`) vì gốc không có cha trong khối. */}
                                    {!isRoot && (
                                        <div
                                            aria-hidden
                                            style={{
                                                position: 'absolute',
                                                left: TRUNK_X,
                                                top: 0,
                                                height: BEND_Y,
                                                width: 2,
                                                backgroundColor: run.color as string,
                                                borderRadius: 1,
                                            }}
                                        />
                                    )}
                                    {/* Nhánh ngang bẻ góc 90° rẽ vào nội dung Task - cũng CHỈ
                                        vẽ cho Task không phải gốc, cùng điều kiện ở trên. */}
                                    {!isRoot && (
                                        <div
                                            aria-hidden
                                            style={{
                                                position: 'absolute',
                                                left: TRUNK_X,
                                                top: BEND_Y - 1,
                                                width: -TRUNK_X,
                                                height: 2,
                                                backgroundColor: run.color as string,
                                                borderRadius: 1,
                                            }}
                                        />
                                    )}
                                    {/* Đoạn dọc ĐI TIẾP xuống Task con kế tiếp - dùng cả
                                        `top`+`bottom` (không set `height`) để tự co giãn theo
                                        chiều cao THẬT của khung (đã "flow-root" nên tính cả
                                        `marginBottom` của Card), nhờ vậy nối liền mạch dù các
                                        Task cao thấp khác nhau mà không cần đo bằng JS. KHÔNG vẽ
                                        cho Task cuối khối (`isLeaf`) - trục "kết thúc" ở đó. */}
                                    {!isLeaf && (
                                        <div
                                            aria-hidden
                                            style={{
                                                position: 'absolute',
                                                left: TRUNK_X,
                                                top: BEND_Y,
                                                bottom: 0,
                                                width: 2,
                                                backgroundColor: run.color as string,
                                                borderRadius: 1,
                                            }}
                                        />
                                    )}
                                    {/* Chấm đánh dấu node - vẽ cho MỌI Task kể cả gốc. */}
                                    <span
                                        aria-hidden
                                        style={{
                                            position: 'absolute',
                                            left: TRUNK_X - 4,
                                            top: BEND_Y - 5,
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
                            );
                        })}
                    </div>
                );
            })}
        </>
    );
}