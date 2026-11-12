import {
    buildPageOutcomes,
    closeRate,
    customersPerPost,
    planLinkChange,
    planMergeRemap,
    primaryColumnValue,
    sumPrimaryCustomers,
    UtmAgg,
    UtmLinkRow,
} from './fanpage-utm.helper';

const L = (fanpageId: number, utmId: number, isPrimary: boolean): UtmLinkRow => ({ fanpageId, utmId, isPrimary });

describe('primaryColumnValue', () => {
    it('= utmId khi là Page chính, null khi tham gia (bất biến thay cho CHECK)', () => {
        expect(primaryColumnValue(9, true)).toBe(9);
        expect(primaryColumnValue(9, false)).toBeNull();
    });
});

describe('planLinkChange (R1, R10)', () => {
    it('R1: Page đầu tiên gắn UTM tự thành Page chính', () => {
        expect(planLinkChange(1, [10], [])).toEqual({ add: [{ utmId: 10, primary: true }], remove: [], blocked: [] });
    });

    it('UTM đã có Page chính ở Page khác -> Page mới chỉ "tham gia"', () => {
        const plan = planLinkChange(2, [10], [L(1, 10, true)]);
        expect(plan.add).toEqual([{ utmId: 10, primary: false }]);
    });

    it('giữ nguyên UTM đã gắn (không thêm/xoá)', () => {
        const plan = planLinkChange(1, [10], [L(1, 10, true), L(2, 10, false)]);
        expect(plan).toEqual({ add: [], remove: [], blocked: [] });
    });

    it('R10: gỡ Page chính khi còn Page khác -> bị chặn, kèm các Page còn lại', () => {
        const plan = planLinkChange(1, [], [L(1, 10, true), L(2, 10, false), L(3, 10, false)]);
        expect(plan.remove).toEqual([]);
        expect(plan.blocked).toEqual([{ utmId: 10, otherPageIds: [2, 3] }]);
    });

    it('R10: gỡ Page chính là Page DUY NHẤT -> cho gỡ (UTM về "Chưa quy về Page")', () => {
        const plan = planLinkChange(1, [], [L(1, 10, true)]);
        expect(plan).toEqual({ add: [], remove: [10], blocked: [] });
    });

    it('gỡ Page không phải chính -> bình thường', () => {
        const plan = planLinkChange(2, [], [L(1, 10, true), L(2, 10, false)]);
        expect(plan).toEqual({ add: [], remove: [10], blocked: [] });
    });

    it('thay tập: vừa thêm vừa gỡ trong 1 lần', () => {
        const plan = planLinkChange(1, [11], [L(1, 10, false), L(2, 10, true)]);
        expect(plan.add).toEqual([{ utmId: 11, primary: true }]);
        expect(plan.remove).toEqual([10]);
    });
});

describe('planMergeRemap (X12)', () => {
    it('khử trùng: Page đã gắn cả 2 UTM chỉ giữ dòng của UTM đích', () => {
        const plan = planMergeRemap([L(1, 5, false)], [L(1, 6, true)]);
        expect(plan).toEqual({ deleteSourcePageIds: [1], moveSourcePageIds: [], promoteExistingTargetPageId: null, promoteMovedPageId: null });
    });

    it('giữ Page chính của UTM đích; Page chính của nguồn thành "tham gia" (chuyển sang không là chính)', () => {
        const plan = planMergeRemap([L(1, 5, true)], [L(2, 6, true)]);
        expect(plan.moveSourcePageIds).toEqual([1]);
        expect(plan.promoteMovedPageId).toBeNull();
        expect(plan.promoteExistingTargetPageId).toBeNull();
    });

    it('UTM đích CHƯA có Page chính -> mang Page chính của nguồn sang (Page chưa gắn đích)', () => {
        const plan = planMergeRemap([L(1, 5, true), L(2, 5, false)], []);
        expect(plan.moveSourcePageIds).toEqual([1, 2]);
        expect(plan.promoteMovedPageId).toBe(1);
    });

    it('UTM đích chưa có Page chính, Page chính của nguồn đã gắn đích (tham gia) -> nâng dòng đích đó lên chính', () => {
        const plan = planMergeRemap([L(1, 5, true)], [L(1, 6, false)]);
        expect(plan.deleteSourcePageIds).toEqual([1]);
        expect(plan.promoteExistingTargetPageId).toBe(1);
    });

    it('nguồn không có liên kết -> không làm gì', () => {
        expect(planMergeRemap([], [L(1, 6, true)])).toEqual({ deleteSourcePageIds: [], moveSourcePageIds: [], promoteExistingTargetPageId: null, promoteMovedPageId: null });
    });
});

describe('buildPageOutcomes (R2-R4)', () => {
    const agg = (customers: number, closed: number, deposit = 0): UtmAgg => ({ customers, closed, deposit });

    // UTM 10 dùng chung 3 Page (chính = Page 1); UTM 11 chỉ Page 2 (chính); UTM 12 chính Page 3, tham gia Page 1.
    const links = [L(1, 10, true), L(2, 10, false), L(3, 10, false), L(2, 11, true), L(3, 12, true), L(1, 12, false)];
    const byUtm = new Map<number, UtmAgg>([
        [10, agg(10, 4, 1000)],
        [11, agg(5, 1, 200)],
        [12, agg(7, 2, 300)],
    ]);

    it('R2: số "chính" chỉ tính UTM mà Page là chính; R3: UTM còn lại vào "tham gia"', () => {
        const [p1, p2, p3] = buildPageOutcomes([1, 2, 3], links, byUtm);
        expect(p1.primary).toMatchObject({ customers: 10, closed: 4, deposit: 1000, utmCount: 1, closeRate: 40 });
        expect(p1.participating).toMatchObject({ customers: 7, deposit: 300, utmCount: 1 });
        expect(p2.primary.customers).toBe(5);
        expect(p2.participating.customers).toBe(10);
        expect(p3.primary.customers).toBe(7);
        expect(p3.participating.customers).toBe(10);
    });

    it('BẤT BIẾN R4: Σ khách "chính" của mọi Page == tổng khách thật của các UTM (không cộng phần tham gia)', () => {
        const rows = buildPageOutcomes([1, 2, 3], links, byUtm);
        const trueDistinct = 10 + 5 + 7; // mỗi khách có đúng 1 UTM
        expect(sumPrimaryCustomers(rows)).toBe(trueDistinct);
    });

    it('BẤT BIẾN R4: vẫn đúng khi chỉ một phần Page nằm trong phạm vi xem (UTM chính ở Page ngoài phạm vi không bị cộng)', () => {
        const visibleLinks = links.filter((l) => l.fanpageId === 1 || l.fanpageId === 2); // Page 3 ngoài phạm vi
        const rows = buildPageOutcomes([1, 2], visibleLinks, byUtm);
        // UTM 12 chính ở Page 3 (ngoài phạm vi) -> chỉ hiện ở Page 1 như "tham gia", KHÔNG vào cột chính.
        expect(sumPrimaryCustomers(rows)).toBe(10 + 5);
        expect(rows[0].participating.customers).toBe(7);
    });

    it('Page không có UTM -> toàn 0 và closeRate null (không chia 0)', () => {
        const [p] = buildPageOutcomes([9], [], byUtm);
        expect(p.primary).toEqual({ customers: 0, closed: 0, closeRate: null, deposit: 0, utmCount: 0 });
    });

    it('UTM gắn nhưng không có khách trong kỳ vẫn tính utmCount', () => {
        const [p] = buildPageOutcomes([1], [L(1, 99, true)], new Map());
        expect(p.primary.utmCount).toBe(1);
        expect(p.primary.customers).toBe(0);
    });
});

describe('closeRate / customersPerPost', () => {
    it('% chốt làm tròn 1 chữ số, null khi chưa có khách', () => {
        expect(closeRate(1, 3)).toBe(33.3);
        expect(closeRate(0, 0)).toBeNull();
    });
    it('Khách/bài null khi không có bài', () => {
        expect(customersPerPost(18, 10)).toBe(1.8);
        expect(customersPerPost(5, 0)).toBeNull();
    });
});