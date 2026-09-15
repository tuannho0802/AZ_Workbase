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
 * kiểu **cây phân cấp thật (staircase tree view)** - đã qua 2 vòng phản hồi
 * chủ dự án cùng ngày:
 * 1. Bản đầu dùng 1 đường thẳng liên tục xuyên tâm mỗi Task, giống "dây
 *    nối"/git graph hơn là quan hệ cha-con.
 * 2. Bản 2 sửa thành bẻ góc 90° nhưng mọi Task thụt CÙNG 1 mức - vẫn "chưa
 *    đủ dài/rõ ràng" (nhánh ngang quá ngắn, nhìn không khác bản đầu là mấy).
 * Bản này: MỖI cấp trong chuỗi thụt sâu hơn cấp trước 1 khoảng `STEP` cố
 * định (staircase THẬT, giống cây thư mục VD `└─ A/ └─ B/ └─ C`) - trục dọc
 * của Task con nằm ĐÚNG bằng trục dọc của Task cha, nên nhánh ngang luôn dài
 * đủ để nối từ trục cha sang tới điểm bắt đầu nội dung Task con (khoảng
 * `STEP` px, không phụ thuộc số cấp).
 *
 * Toạ độ mọi phần tử nối được viết TUYỆT ĐỐI theo `itemIndex` (không lồng
 * `<div>` đệ quy để cộng dồn `paddingLeft` từng cấp) - vì `position:absolute`
 * bên trong 1 khung `position:relative` luôn tính theo MÉP khung đó (bỏ qua
 * `paddingLeft` của chính khung), nên mọi khung Task (dù ở cấp nào) đều có
 * chung 1 gốc toạ độ x=0 - chỉ cần đổi `paddingLeft` (đẩy NỘI DUNG vào trong)
 * và tính `left` của trục/nhánh theo công thức `index * STEP + TRUNK_OFFSET`
 * là ra đúng vị trí, không cần lồng khung.
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
    // Mức thụt THÊM cho MỖI cấp sâu hơn - phản hồi chủ dự án "đẩy cấp con
    // thụt vào trong luôn" (staircase thật) - cũng chính là chiều dài nhánh
    // ngang (luôn nối từ trục cha ở cấp `i-1` sang trục con ở cấp `i`, cách
    // nhau đúng `STEP`), tăng từ 24 lên 36 để nhánh RÕ RÀNG hơn hẳn.
    const STEP = 36;
    // Trục dọc của cấp 0 lệch khỏi mép trái bao nhiêu (giữ khoảng hở tối
    // thiểu cho chấm tròn không dính mép ngoài khối).
    const TRUNK_OFFSET = 9;
    // Khoảng cách từ trục dọc của 1 cấp tới nơi CHỮ của cấp đó bắt đầu.
    const TRUNK_TO_TEXT = 20;
    // Độ cao điểm bẻ góc (tính từ mép TRÊN của mỗi khung Task).
    const BEND_Y = 16;

    /** Trục dọc (toạ độ x) của cấp `index`. */
    const trunkX = (index: number) => index * STEP + TRUNK_OFFSET;

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
                    <div key={runIndex} style={{ marginBottom: isLast ? 0 : RUN_GAP }}>
                        {run.items.map((task, itemIndex) => {
                            const isRoot = itemIndex === 0;
                            const isLeaf = itemIndex === run.items.length - 1;
                            const ownTrunkX = trunkX(itemIndex);
                            const parentTrunkX = trunkX(itemIndex - 1);
                            return (
                                <div
                                    key={task.id}
                                    style={{
                                        position: 'relative',
                                        display: 'flow-root',
                                        // "flow-root" NGĂN margin-collapsing của `marginBottom`
                                        // trong `TaskMiniCard` tràn ra ngoài khung này - nếu
                                        // không, mép dưới `top/bottom` bên dưới sẽ tính hụt 8px
                                        // so với mép trên Task kế tiếp, đường nối bị đứt đoạn
                                        // đúng ngay khoảng cách giữa 2 Card.
                                        paddingLeft: ownTrunkX + TRUNK_TO_TEXT,
                                    }}
                                >
                                    {/* Đoạn dọc ĐI VÀO Task này từ trục của Task CHA (cấp
                                        nông hơn 1 bậc) - KHÔNG vẽ cho gốc (không có cha). */}
                                    {!isRoot && (
                                        <div
                                            aria-hidden
                                            style={{
                                                position: 'absolute',
                                                left: parentTrunkX,
                                                top: 0,
                                                height: BEND_Y,
                                                width: 2,
                                                backgroundColor: run.color as string,
                                                borderRadius: 1,
                                            }}
                                        />
                                    )}
                                    {/* Nhánh ngang bẻ góc 90° - nối từ trục CHA sang tới sát
                                        điểm bắt đầu nội dung Task này (dài đúng `STEP`, LUÔN đủ
                                        dài bất kể đang ở cấp nào vì khoảng cách 2 trục liền kề
                                        cố định). */}
                                    {!isRoot && (
                                        <div
                                            aria-hidden
                                            style={{
                                                position: 'absolute',
                                                left: parentTrunkX,
                                                top: BEND_Y - 1,
                                                width: ownTrunkX + TRUNK_TO_TEXT - 4 - parentTrunkX,
                                                height: 2,
                                                backgroundColor: run.color as string,
                                                borderRadius: 1,
                                            }}
                                        />
                                    )}
                                    {/* Đoạn dọc ĐI TIẾP xuống Task con kế tiếp, tại trục của
                                        CHÍNH Task này (Task con sẽ bẻ nhánh ngang TỪ đây) - dùng
                                        cả `top`+`bottom` (không set `height`) để tự co giãn theo
                                        chiều cao THẬT của khung (đã "flow-root") nên nối liền
                                        mạch dù các Task cao thấp khác nhau, không cần đo bằng
                                        JS. KHÔNG vẽ cho Task cuối khối (trục "kết thúc" ở đó). */}
                                    {!isLeaf && (
                                        <div
                                            aria-hidden
                                            style={{
                                                position: 'absolute',
                                                left: ownTrunkX,
                                                top: BEND_Y,
                                                bottom: 0,
                                                width: 2,
                                                backgroundColor: run.color as string,
                                                borderRadius: 1,
                                            }}
                                        />
                                    )}
                                    {/* Chấm đánh dấu node - vẽ cho MỌI Task kể cả gốc, tại
                                        đúng trục của cấp đó. */}
                                    <span
                                        aria-hidden
                                        style={{
                                            position: 'absolute',
                                            left: ownTrunkX - 4,
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