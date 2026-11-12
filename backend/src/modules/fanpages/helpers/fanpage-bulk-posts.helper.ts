import { postUrlKey } from './fanpage-url.helper';

/**
 * Lập kế hoạch dán nhiều link bài (B4) - HÀM THUẦN, không chạm DB: quyết định link nào tạo được, link nào bỏ qua và vì sao.
 * Khoá so trùng = `postUrlKey` (cùng chuẩn với kiểm tra trùng 1 bài ở FanpagePostsService - bỏ #fragment, tham số theo dõi,
 * www/m., http/https, `/` cuối). Thứ tự dòng được giữ nguyên; dòng đầu tiên thắng khi trùng nhau trong lô.
 */

export const POST_URL_MAX_LENGTH = 500;

export type BulkSkipReason = 'invalid_url' | 'too_long' | 'duplicate_in_batch' | 'duplicate_existing';

export interface BulkExistingPost {
    id: number;
    url: string;
    postedDate: string | null;
}

export interface BulkPlanValid {
    /** Link đã trim (service tự chuẩn hoá để lưu bằng `normalizeFanpageUrl`). */
    url: string;
    key: string;
}

export interface BulkPlanSkipped {
    url: string;
    reason: BulkSkipReason;
    /** Chỉ có khi `duplicate_existing`. */
    existingPostId?: number;
    existingPostedDate?: string | null;
}

export interface BulkPlan {
    valid: BulkPlanValid[];
    skipped: BulkPlanSkipped[];
}

/** http/https + có host dạng `ten.mien` (khớp `IsUrl({ require_protocol, require_tld })` của DTO đơn lẻ). */
export function isAcceptablePostUrl(raw: string): boolean {
    let u: URL;
    try {
        u = new URL(raw);
    } catch {
        return false;
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const host = u.hostname;
    return host.includes('.') && !host.startsWith('.') && !host.endsWith('.');
}

export function planBulkPosts(urls: ReadonlyArray<string>, existing: ReadonlyArray<BulkExistingPost>): BulkPlan {
    // Dữ liệu cũ có thể đã trùng sẵn -> giữ bài CŨ NHẤT (id nhỏ nhất) làm đại diện cho khoá đó.
    const existingByKey = new Map<string, BulkExistingPost>();
    for (const e of [...existing].sort((a, b) => a.id - b.id)) {
        const k = postUrlKey(e.url);
        if (!existingByKey.has(k)) existingByKey.set(k, e);
    }

    const valid: BulkPlanValid[] = [];
    const skipped: BulkPlanSkipped[] = [];
    const seen = new Set<string>();

    for (const rawLine of urls) {
        const url = (rawLine ?? '').trim();
        if (!url || !isAcceptablePostUrl(url)) {
            skipped.push({ url, reason: 'invalid_url' });
            continue;
        }
        if (url.length > POST_URL_MAX_LENGTH) {
            skipped.push({ url, reason: 'too_long' });
            continue;
        }
        const key = postUrlKey(url);
        const dup = existingByKey.get(key);
        if (dup) {
            skipped.push({ url, reason: 'duplicate_existing', existingPostId: dup.id, existingPostedDate: dup.postedDate ?? null });
            continue;
        }
        if (seen.has(key)) {
            skipped.push({ url, reason: 'duplicate_in_batch' });
            continue;
        }
        seen.add(key);
        valid.push({ url, key });
    }
    return { valid, skipped };
}