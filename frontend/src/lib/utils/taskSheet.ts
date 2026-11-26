import type { PeriodicTask } from '@/lib/api/periodic-tasks.api';

/** Bảng màu cố định cho ô TÊN (chữ trắng đọc được). Màu theo id người -> cùng 1 người luôn cùng màu ở mọi ngày. */
export const SHEET_NAME_COLORS = ['#7a3b0c', '#0b7a4b', '#c4161c', '#0b4fa5', '#0b5a63', '#6b3fa0', '#8a6d00', '#a02c68'] as const;

export const sheetNameColor = (userId: number): string => SHEET_NAME_COLORS[Math.abs(userId) % SHEET_NAME_COLORS.length];

export interface SheetGroup {
    assigneeId: number;
    assigneeName: string;
    tasks: PeriodicTask[];
}

/** Gom Task theo Người phụ trách chính; nhóm sắp theo tên (vi), thứ tự Task trong nhóm GIỮ NGUYÊN thứ tự đầu vào. */
export function groupTasksByAssignee(tasks: PeriodicTask[]): SheetGroup[] {
    const map = new Map<number, SheetGroup>();
    for (const t of tasks) {
        const g = map.get(t.primaryAssigneeId);
        if (g) g.tasks.push(t);
        else map.set(t.primaryAssigneeId, { assigneeId: t.primaryAssigneeId, assigneeName: t.primaryAssignee?.name ?? `#${t.primaryAssigneeId}`, tasks: [t] });
    }
    return Array.from(map.values()).sort((a, b) => a.assigneeName.localeCompare(b.assigneeName, 'vi'));
}

/** Nhãn ngắn cho link: tên file nếu có đuôi (vd THAN_CU_BIT.mp4), ngược lại tên miền. */
export function linkLabel(url: string): string {
    try {
        const u = new URL(url);
        const last = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() ?? '');
        return /\.[A-Za-z0-9]{2,5}$/.test(last) ? last : u.hostname.replace(/^www\./, '');
    } catch {
        return url;
    }
}

/** Chỉ cho href http/https (chặn javascript:/data:...); trả null nếu rỗng hoặc không hợp lệ -> không hiện link. */
export function safeHttpUrl(url: string | null | undefined): string | null {
    const v = url?.trim();
    if (!v) return null;
    try {
        const u = new URL(v);
        return u.protocol === 'http:' || u.protocol === 'https:' ? v : null;
    } catch {
        return null;
    }
}
