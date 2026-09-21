import type { PeriodicTask } from '@/lib/api/periodic-tasks.api';

export interface ChecklistProgress {
    done: number;
    total: number;
}

/** Màu nút Checklist theo tiến độ - trùng tên preset `color` của antd Button. */
export type ChecklistTone = 'red' | 'gold' | 'green';

/**
 * getChecklistProgress - số checklist đã hoàn thành / tổng của 1 Task, ĐỒNG BỘ
 * cách đếm với `TaskChecklistModal` (checklist item thật + Task con liên kết).
 *
 * Nguồn dữ liệu (ưu tiên từ trên xuống):
 *  1. `task.checklistProgress` - BE đính sẵn ở `GET /periodic-tasks` (danh sách).
 *  2. Tự tính từ `checklistItems` + `linkedChildrenChecklist` - chỉ có ở
 *     `GET /:id` (chi tiết), phòng khi task được lấy từ response chi tiết.
 * Trả `null` khi không có dữ liệu HOẶC chưa có mục nào (total = 0) - UI khi đó
 * giữ nguyên nút Checklist mặc định, không hiện nhãn/không tô màu.
 */
export function getChecklistProgress(
    task: Pick<PeriodicTask, 'checklistProgress' | 'checklistItems' | 'linkedChildrenChecklist'>,
): ChecklistProgress | null {
    let progress: ChecklistProgress | null = null;

    if (task.checklistProgress) {
        progress = task.checklistProgress;
    } else if (task.checklistItems || task.linkedChildrenChecklist) {
        const items = task.checklistItems ?? [];
        const children = task.linkedChildrenChecklist ?? [];
        progress = {
            done: items.filter((i) => i.isDone).length + children.filter((c) => c.isDone).length,
            total: items.length + children.length,
        };
    }

    if (!progress || progress.total <= 0) return null;
    return { done: Math.min(progress.done, progress.total), total: progress.total };
}

/**
 * Quy tắc màu: dưới 1 nửa -> đỏ; từ 1 nửa trở lên nhưng chưa xong -> vàng;
 * xong đủ -> xanh lá. (Đúng 50% tính là "không dưới 1 nửa" -> vàng.)
 */
export function getChecklistTone({ done, total }: ChecklistProgress): ChecklistTone {
    if (done >= total) return 'green';
    if (done * 2 >= total) return 'gold';
    return 'red';
}
