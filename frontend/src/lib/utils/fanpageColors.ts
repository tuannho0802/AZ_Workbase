/**
 * Màu Tag cho NGƯỜI PHỤ TRÁCH Fanpage. User chưa có cột `color` nên chọn màu ỔN ĐỊNH theo `id`
 * (cùng 1 người luôn cùng 1 màu ở bảng, bộ lọc, form, drawer) từ bảng màu preset của Ant Design.
 * Không dùng 'green'/'default' vì 2 màu này đã dành cho Tag trạng thái "Đang/Ngừng theo dõi".
 */
const OWNER_TAG_COLORS = ['blue', 'purple', 'cyan', 'magenta', 'orange', 'geekblue', 'volcano', 'gold', 'lime'] as const;

export function ownerTagColor(userId: number): string {
    return OWNER_TAG_COLORS[Math.abs(Math.trunc(userId)) % OWNER_TAG_COLORS.length];
}

/** Đưa người phụ trách chính (`ownerId`) lên đầu, giữ nguyên thứ tự còn lại. */
export function sortOwnersPrimaryFirst<T extends { id: number }>(owners: T[] | undefined | null, primaryId: number | null | undefined): T[] {
    const list = owners ?? [];
    if (primaryId == null) return list;
    return [...list.filter((o) => o.id === primaryId), ...list.filter((o) => o.id !== primaryId)];
}
