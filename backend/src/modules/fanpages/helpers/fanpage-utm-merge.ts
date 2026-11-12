import type { EntityManager } from 'typeorm';
import { planMergeRemap, UtmLinkRow } from './fanpage-utm.helper';

export interface FanpageUtmMergeResult {
    deleted: number;
    moved: number;
    promoted: boolean;
}

const placeholders = (n: number): string => Array.from({ length: n }, () => '?').join(',');

/**
 * X12 - remap `fanpage_utms` trong transaction GỘP UTM (gọi từ `UtmsService.merge`, TRƯỚC khi xoá UTM nguồn).
 * Là hàm thường (không DI) để `UtmsModule` không phải import `FanpagesModule` (tránh vòng phụ thuộc).
 * Quy tắc ở `planMergeRemap`: khử trùng, giữ Page chính của UTM đích, Page chính của nguồn thành "tham gia".
 */
export async function remapFanpageUtmsOnMerge(manager: EntityManager, sourceId: number, targetId: number): Promise<FanpageUtmMergeResult> {
    const raw: Array<{ fanpage_id: number; utm_id: number; primary_utm_id: number | null }> = await manager.query(
        'SELECT fanpage_id, utm_id, primary_utm_id FROM fanpage_utms WHERE utm_id IN (?, ?)',
        [sourceId, targetId],
    );
    const rows: UtmLinkRow[] = (Array.isArray(raw) ? raw : []).map((r) => ({ fanpageId: Number(r.fanpage_id), utmId: Number(r.utm_id), isPrimary: r.primary_utm_id != null }));
    const plan = planMergeRemap(
        rows.filter((r) => r.utmId === sourceId),
        rows.filter((r) => r.utmId === targetId),
    );

    if (plan.deleteSourcePageIds.length) {
        await manager.query(`DELETE FROM fanpage_utms WHERE utm_id = ? AND fanpage_id IN (${placeholders(plan.deleteSourcePageIds.length)})`, [
            sourceId,
            ...plan.deleteSourcePageIds,
        ]);
    }
    if (plan.moveSourcePageIds.length) {
        // primary_utm_id = NULL cùng câu UPDATE: nhả khoá UNIQUE(primary_utm_id) của dòng chính cũ trước khi nâng dòng khác.
        await manager.query(
            `UPDATE fanpage_utms SET utm_id = ?, primary_utm_id = NULL WHERE utm_id = ? AND fanpage_id IN (${placeholders(plan.moveSourcePageIds.length)})`,
            [targetId, sourceId, ...plan.moveSourcePageIds],
        );
    }
    const promoteId = plan.promoteExistingTargetPageId ?? plan.promoteMovedPageId;
    if (promoteId != null) {
        await manager.query('UPDATE fanpage_utms SET primary_utm_id = ? WHERE utm_id = ? AND fanpage_id = ?', [targetId, targetId, promoteId]);
    }
    return { deleted: plan.deleteSourcePageIds.length, moved: plan.moveSourcePageIds.length, promoted: promoteId != null };
}