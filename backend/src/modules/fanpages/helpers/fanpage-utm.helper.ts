/**
 * Luật Page ↔ UTM (PLAN_FANPAGE_ANALYTICS 3.7) - HÀM THUẦN, không phụ thuộc DB, để test kỹ.
 * Khái niệm: mỗi UTM có TỐI ĐA 1 Page CHÍNH (ghi công, R1) và các Page "tham gia" (R3).
 */

export interface UtmLinkRow {
    fanpageId: number;
    utmId: number;
    isPrimary: boolean;
}

/** `primary_utm_id` trong DB: = utmId nếu là Page chính, null nếu tham gia (bất biến được giữ ở service vì không có CHECK). */
export const primaryColumnValue = (utmId: number, isPrimary: boolean): number | null => (isPrimary ? utmId : null);

export interface LinkChangePlan {
    /** UTM cần gắn mới vào Page; `primary` = true khi UTM chưa có Page chính nào (R1: Page đầu tiên tự thành chính). */
    add: Array<{ utmId: number; primary: boolean }>;
    /** UTM cần gỡ khỏi Page (đã loại các ca bị chặn). */
    remove: number[];
    /** R10: gỡ Page chính khi UTM còn Page khác -> 409, kèm các Page còn lại để người dùng chọn Page chính mới. */
    blocked: Array<{ utmId: number; otherPageIds: number[] }>;
}

/**
 * Lập kế hoạch thay TOÀN BỘ tập UTM của 1 Page (PUT replace-all).
 * `allLinks` = mọi dòng liên kết của các UTM liên quan (mọi Page), để biết UTM đã có Page chính / Page khác chưa.
 */
export function planLinkChange(pageId: number, desiredUtmIds: number[], allLinks: UtmLinkRow[]): LinkChangePlan {
    const desired = new Set(desiredUtmIds);
    const mine = allLinks.filter((l) => l.fanpageId === pageId);
    const mineIds = new Set(mine.map((l) => l.utmId));

    const add: LinkChangePlan['add'] = [];
    for (const utmId of desired) {
        if (mineIds.has(utmId)) continue;
        const hasPrimary = allLinks.some((l) => l.utmId === utmId && l.isPrimary);
        add.push({ utmId, primary: !hasPrimary });
    }

    const remove: number[] = [];
    const blocked: LinkChangePlan['blocked'] = [];
    for (const link of mine) {
        if (desired.has(link.utmId)) continue;
        const others = allLinks.filter((l) => l.utmId === link.utmId && l.fanpageId !== pageId).map((l) => l.fanpageId);
        if (link.isPrimary && others.length > 0) blocked.push({ utmId: link.utmId, otherPageIds: others });
        else remove.push(link.utmId);
    }
    return { add, remove, blocked };
}

export interface MergeRemapPlan {
    /** Dòng của UTM nguồn bị xoá vì Page đó đã gắn UTM đích (khử trùng). */
    deleteSourcePageIds: number[];
    /** Dòng của UTM nguồn được chuyển sang UTM đích (Page chưa gắn UTM đích). */
    moveSourcePageIds: number[];
    /** Page có sẵn dòng UTM đích được nâng lên Page chính (khi UTM đích chưa có chính mà nguồn có). */
    promoteExistingTargetPageId: number | null;
    /** Page vừa được chuyển sang UTM đích được đặt làm Page chính (khi UTM đích chưa có chính mà nguồn có). */
    promoteMovedPageId: number | null;
}

/**
 * X12 - gộp UTM: khử trùng, GIỮ Page chính của UTM đích; Page chính của UTM nguồn thành "tham gia".
 * Ngoại lệ hợp lý: UTM đích CHƯA có Page chính mà nguồn có -> Page chính của nguồn được mang sang (khách chuyển sang
 * UTM đích không bị rơi về "Chưa quy về Page").
 */
export function planMergeRemap(source: UtmLinkRow[], target: UtmLinkRow[]): MergeRemapPlan {
    const targetPages = new Set(target.map((l) => l.fanpageId));
    const targetHasPrimary = target.some((l) => l.isPrimary);
    const sourcePrimary = source.find((l) => l.isPrimary) ?? null;

    const plan: MergeRemapPlan = { deleteSourcePageIds: [], moveSourcePageIds: [], promoteExistingTargetPageId: null, promoteMovedPageId: null };
    for (const row of source) {
        if (targetPages.has(row.fanpageId)) plan.deleteSourcePageIds.push(row.fanpageId);
        else plan.moveSourcePageIds.push(row.fanpageId);
    }
    if (!targetHasPrimary && sourcePrimary) {
        if (targetPages.has(sourcePrimary.fanpageId)) plan.promoteExistingTargetPageId = sourcePrimary.fanpageId;
        else plan.promoteMovedPageId = sourcePrimary.fanpageId;
    }
    return plan;
}

// ───────────── Tổng hợp quy kết khách / tiền (3.7 R1-R5) ─────────────

export interface UtmAgg {
    customers: number;
    closed: number;
    /** Tổng nạp theo `deposit_date` trong kỳ (cohort khác khách - R8). */
    deposit: number;
}

export interface OutcomeBucket {
    customers: number;
    closed: number;
    /** % chốt (0-100, 1 chữ số thập phân); null khi chưa có khách. */
    closeRate: number | null;
    deposit: number;
    utmCount: number;
}

export interface PageOutcome {
    fanpageId: number;
    primary: OutcomeBucket;
    participating: OutcomeBucket;
}

export const closeRate = (closed: number, customers: number): number | null =>
    customers > 0 ? Math.round((closed / customers) * 1000) / 10 : null;

const emptyBucket = (): OutcomeBucket => ({ customers: 0, closed: 0, closeRate: null, deposit: 0, utmCount: 0 });

const addAgg = (b: OutcomeBucket, agg: UtmAgg | undefined): void => {
    b.utmCount += 1;
    if (!agg) return;
    b.customers += agg.customers;
    b.closed += agg.closed;
    b.deposit += agg.deposit;
};

/**
 * R2/R3: số "chính" của Page chỉ từ UTM mà Page đó là CHÍNH; UTM gắn nhưng không chính -> "tham gia" (không cộng vào tổng).
 * `links` chỉ cần các dòng của Page trong `pageIds`.
 */
export function buildPageOutcomes(
    pageIds: number[],
    links: UtmLinkRow[],
    byUtm: Map<number, UtmAgg>,
    /** GĐ5b (15.3): khách ghi công TRỰC TIẾP theo `fanpage_id` - cộng vào cột "chính" của đúng Page, không phụ thuộc UTM. */
    byFanpage: Map<number, UtmAgg> = new Map(),
): PageOutcome[] {
    const map = new Map<number, PageOutcome>(pageIds.map((id) => [id, { fanpageId: id, primary: emptyBucket(), participating: emptyBucket() }]));
    for (const l of links) {
        const row = map.get(l.fanpageId);
        if (!row) continue;
        addAgg(l.isPrimary ? row.primary : row.participating, byUtm.get(l.utmId));
    }
    for (const [fanpageId, agg] of byFanpage) {
        const row = map.get(fanpageId);
        if (!row) continue;
        row.primary.customers += agg.customers;
        row.primary.closed += agg.closed;
        row.primary.deposit += agg.deposit;
    }
    for (const row of map.values()) {
        row.primary.closeRate = closeRate(row.primary.closed, row.primary.customers);
        row.participating.closeRate = closeRate(row.participating.closed, row.participating.customers);
    }
    return pageIds.map((id) => map.get(id) as PageOutcome);
}

/** Bất biến kiểm thử (R4): Σ khách "chính" của mọi Page trong tập == Tổng đếm DISTINCT độc lập. */
export const sumPrimaryCustomers = (rows: PageOutcome[]): number => rows.reduce((s, r) => s + r.primary.customers, 0);

/** Khách/bài = khách ghi công / số bài trong kỳ; null khi Page không có bài (tránh chia 0). R3: Page tham gia không tính. */
export const customersPerPost = (primaryCustomers: number, posts: number): number | null =>
    posts > 0 ? Math.round((primaryCustomers / posts) * 10) / 10 : null;

// ───────────── GĐ5b: thứ tự ghi công (15.3) ─────────────

/** utmId -> Page CHÍNH của UTM đó (mỗi UTM tối đa 1 Page chính). */
export function primaryPageByUtm(links: UtmLinkRow[]): Map<number, number> {
    const m = new Map<number, number>();
    for (const l of links) if (l.isPrimary) m.set(l.utmId, l.fanpageId);
    return m;
}

/**
 * Hàm đối chiếu THUẦN cho truy vấn SQL: khách ghi công cho đúng 1 Page.
 * Thứ tự: `fanpage_id` (Lead nhập từ Page) > Page chính của UTM > null ("Chưa quy về Page").
 */
export function resolveCreditedPage(
    customer: { fanpageId: number | null; utmId: number | null },
    primaryByUtm: Map<number, number>,
): number | null {
    if (customer.fanpageId != null) return customer.fanpageId;
    if (customer.utmId != null) return primaryByUtm.get(customer.utmId) ?? null;
    return null;
}
