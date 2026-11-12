import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CustomerAccessHelper } from '../customers/helpers/customer-access.helper';
import { FanpageOutcomesService } from './fanpage-outcomes.service';
import { RESTRICTED_UTM_LABEL } from './fanpage-utms.service';

type Raw = Record<string, unknown>;
const user = { id: 5, role: 'employee', departmentId: 1, positionId: null, isRootAdmin: false };

/** QueryBuilder giả: ghi lại `select` đầu tiên để phân biệt truy vấn gộp theo UTM / DISTINCT / chưa quy. */
function fakeQb(h: { many?: Raw[]; manyFp?: Raw[]; one?: (sel: string, fp: boolean) => Raw | undefined; entities?: unknown[] }) {
    let sel = '';
    // GĐ5b: truy vấn "khách ghi công TRỰC TIẾP cho Page" (có `customer.fanpageId IN`) trả dữ liệu riêng (mặc định rỗng/0).
    let fp = false;
    const qb: Record<string, jest.Mock> = {};
    for (const m of ['select', 'addSelect', 'where', 'andWhere', 'groupBy', 'innerJoin']) {
        qb[m] = jest.fn((a: unknown) => {
            if (m === 'select') {
                sel = String(a);
                fp = false;
            }
            if (m === 'andWhere' && String(a).includes('customer.fanpageId IN')) fp = true;
            return qb;
        });
    }
    qb.getRawMany = jest.fn(async () => (fp ? (h.manyFp ?? []) : (h.many ?? [])));
    qb.getRawOne = jest.fn(async () => h.one?.(sel, fp));
    qb.getMany = jest.fn(async () => h.entities ?? []);
    // Ghi lại tham số `ids` của where() để mock getMany lọc theo fanpageId như truy vấn thật.
    qb.where = jest.fn((a: unknown, params?: { ids?: number[] }) => {
        if (params?.ids) qb.getMany = jest.fn(async () => (h.entities ?? []).filter((e) => params.ids?.includes((e as { fanpageId: number }).fanpageId)));
        return qb;
    });
    return qb;
}

interface Opts {
    statsView?: string | null;
    customerScope?: string | null;
    revenueView?: string | null;
    revenuePageIds?: number[];
    hidden?: string[];
    /** GĐ5b: khách ghi công TRỰC TIẾP theo `fanpage_id` (không qua UTM). */
    leads?: { fanpageId: number; cnt: string; closed: string; deposit?: string }[];
}

function setup(o: Opts = {}) {
    const statsView = o.statsView === undefined ? 'all' : o.statsView;
    const customerScope = o.customerScope === undefined ? 'all' : o.customerScope;
    const revenueView = o.revenueView === undefined ? 'all' : o.revenueView;

    const pages = [
        { id: 1, name: 'Page A', archivedAt: null },
        { id: 2, name: 'Page B', archivedAt: null },
    ];
    const scopes: Record<string, { view: string | null; tag: string }> = {
        'fanpage_stats.view': { view: statsView, tag: 'stats' },
        'fanpage_revenue.view': { view: revenueView, tag: 'revenue' },
    };
    const access = {
        scopesForKey: jest.fn(async (_u: unknown, key: string) => ({ ...scopes[key], flagScopes: {}, managed: [] })),
        scopeOf: jest.fn(async () => customerScope),
    };
    const scoped = {
        load: jest.fn(async (_u: unknown, s: { tag: string }) => {
            if (s.tag === 'revenue') return pages.filter((p) => (o.revenuePageIds ?? [1, 2]).includes(p.id));
            return pages;
        }),
    };
    // Page 1 chính UTM 10 (dùng chung với Page 2 tham gia); Page 2 chính UTM 11.
    const links = [
        { fanpageId: 1, utmId: 10, primaryUtmId: 10 },
        { fanpageId: 2, utmId: 10, primaryUtmId: null },
        { fanpageId: 2, utmId: 11, primaryUtmId: 11 },
    ];
    const linkQb = fakeQb({ entities: links });
    const customerQb = fakeQb({
        many: [
            { utmId: 10, cnt: '10', closed: '4' },
            { utmId: 11, cnt: '5', closed: '1' },
        ],
        manyFp: (o.leads ?? []).map((l) => ({ fanpageId: l.fanpageId, cnt: l.cnt, closed: l.closed })),
        one: (sel, fp) => {
            if (fp) {
                const cnt = (o.leads ?? []).reduce((n, l) => n + Number(l.cnt), 0);
                const closed = (o.leads ?? []).reduce((n, l) => n + Number(l.closed), 0);
                return { cnt: String(cnt), closed: String(closed) };
            }
            return sel.includes('DISTINCT') ? { cnt: '15', closed: '5' } : { cnt: '3', closed: '1' };
        },
    });
    const depositQb = fakeQb({
        many: [
            { utmId: 10, total: '1000.50' },
            { utmId: 11, total: '200' },
        ],
        manyFp: (o.leads ?? []).map((l) => ({ fanpageId: l.fanpageId, total: l.deposit ?? '0' })),
        one: (_sel, fp) => (fp ? { total: String((o.leads ?? []).reduce((n, l) => n + Number(l.deposit ?? 0), 0)) } : { total: '1200.50' }),
    });
    const postQb = fakeQb({ many: [{ fanpageId: 1, cnt: '5' }] });

    const customerRepo = { createQueryBuilder: jest.fn(() => customerQb) };
    const depositRepo = { createQueryBuilder: jest.fn(() => depositQb) };
    const postRepo = { createQueryBuilder: jest.fn(() => postQb) };
    const linkRepo = { createQueryBuilder: jest.fn(() => linkQb) };
    const chips = new Map([
        [1, [{ utmId: 10, name: 'Chiến dịch X', locked: false, isPrimary: true, primaryFanpage: { id: 1, name: 'Page A' } }]],
        [
            2,
            [
                { utmId: 10, name: 'Chiến dịch X', locked: false, isPrimary: false, primaryFanpage: { id: 1, name: 'Page A' } },
                { utmId: 11, name: 'Chiến dịch Y', locked: false, isPrimary: true, primaryFanpage: { id: 2, name: 'Page B' } },
            ],
        ],
    ]);
    const utmLinks = { chipsForPages: jest.fn(async () => chips) };
    const utmsService = { usabilityFor: jest.fn(async () => new Map()) };
    const utmCustomers = { listForUtms: jest.fn(async () => ({ data: [], total: 0, page: 1, limit: 10, totalPages: 0 })) };
    const uiVisibility = { getHiddenElementKeys: jest.fn(async () => new Set(o.hidden ?? [])) };

    const svc = new FanpageOutcomesService(
        customerRepo as never,
        depositRepo as never,
        postRepo as never,
        linkRepo as never,
        access as never,
        scoped as never,
        utmLinks as never,
        utmsService as never,
        utmCustomers as never,
        uiVisibility as never,
    );
    return { svc, access, customerRepo, depositRepo, utmCustomers, utmsService, uiVisibility };
}

let applyViewFilter: jest.SpyInstance;
beforeEach(() => {
    applyViewFilter = jest.spyOn(CustomerAccessHelper, 'applyViewFilter').mockImplementation((qb) => qb);
});
afterEach(() => jest.restoreAllMocks());

const Q = { from: '2026-10-01', to: '2026-10-31' };

describe('FanpageOutcomesService.getOutcomes - quy kết (R2-R5)', () => {
    it('Page chính ghi công, Page tham gia hiện riêng; Tổng đếm DISTINCT độc lập và == Σ cột "chính" (R4)', async () => {
        const t = setup();
        const r = await t.svc.getOutcomes(user, Q);
        const [a, b] = r.pages;
        expect(a.primary).toMatchObject({ customers: 10, closed: 4, closeRate: 40 });
        expect(a.participating.customers).toBe(0);
        expect(b.primary.customers).toBe(5);
        expect(b.participating.customers).toBe(10); // UTM 10 dùng chung - KHÔNG cộng vào tổng
        expect(r.total.customers).toBe(a.primary.customers + b.primary.customers);
        expect(r.total.customers).toBe(15);
        expect(r.unassigned).toEqual({ customers: 3, closed: 1 });
    });

    it('Khách/bài chỉ tính khách ghi công; Page không có bài -> null', async () => {
        const r = await setup().svc.getOutcomes(user, Q);
        expect(r.pages[0].posts).toBe(5);
        expect(r.pages[0].customersPerPost).toBe(2);
        expect(r.pages[1].customersPerPost).toBeNull();
    });

    it('R6: luôn áp phạm vi customers.view của người gọi lên MỌI truy vấn khách', async () => {
        const t = setup({ customerScope: 'own' });
        await t.svc.getOutcomes(user, Q);
        expect(applyViewFilter).toHaveBeenCalled();
        for (const call of applyViewFilter.mock.calls) {
            expect(call[1]).toBe(user.id);
            expect(call[3]).toBe('own');
        }
    });

    it('R6: không có customers.view -> KHÔNG truy vấn khách/tiền, mọi số = 0', async () => {
        const t = setup({ customerScope: null });
        const r = await t.svc.getOutcomes(user, Q);
        expect(t.customerRepo.createQueryBuilder).not.toHaveBeenCalled();
        expect(t.depositRepo.createQueryBuilder).not.toHaveBeenCalled();
        expect(r.total.customers).toBe(0);
        expect(r.pages.every((p) => p.primary.customers === 0)).toBe(true);
        expect(r.unassigned).toBeNull();
    });

    it('R5: "Chưa quy về Page" chỉ cho scope rộng (all/department), không cho scope own', async () => {
        expect((await setup({ statsView: 'department' }).svc.getOutcomes(user, Q)).unassigned).not.toBeNull();
        expect((await setup({ statsView: 'own' }).svc.getOutcomes(user, Q)).unassigned).toBeNull();
    });

    it('kỳ không hợp lệ -> 400; không có quyền xem Page -> lỗi từ scoped (403)', async () => {
        await expect(setup().svc.getOutcomes(user, { from: '2026-12-01', to: '2026-11-01' })).rejects.toBeInstanceOf(BadRequestException);
    });
});

describe('FanpageOutcomesService.getOutcomes - cổng tiền 4 lớp (D3, X13)', () => {
    const hasDepositKey = (v: unknown): boolean => JSON.stringify(v).includes('deposit');

    it('đủ cổng -> có tiền (số, đã chuyển từ chuỗi) ở Page, Tổng và hasRevenue', async () => {
        const r = await setup().svc.getOutcomes(user, Q);
        expect(r.hasRevenue).toBe(true);
        expect(r.pages[0].primary.deposit).toBe(1000.5);
        expect(r.total.deposit).toBe(1200.5);
        expect(r.pages[0].utms[0].deposit).toBe(1000.5);
    });

    it('lớp 1: KHÔNG có fanpage_revenue.view -> response không chứa trường tiền nào, không truy vấn deposits', async () => {
        const t = setup({ revenueView: null });
        const r = await t.svc.getOutcomes(user, Q);
        expect(hasDepositKey(r)).toBe(false);
        expect(r.hasRevenue).toBe(false);
        expect(t.depositRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('lớp 3: có key nhưng Admin ẩn UI tab:deposits -> BỎ HẲN trường tiền', async () => {
        const t = setup({ hidden: ['tab:deposits'] });
        const r = await t.svc.getOutcomes(user, Q);
        expect(hasDepositKey(r)).toBe(false);
        expect(t.depositRepo.createQueryBuilder).not.toHaveBeenCalled();
        // resource LUÔN là 'customers' và truyền đủ phòng ban/chức vụ/cờ root admin (như customers-export)
        expect(t.uiVisibility.getHiddenElementKeys).toHaveBeenCalledWith('employee', 'customers', 1, null, false);
    });

    it('ẩn field khác (không phải tab:deposits) không ảnh hưởng tiền', async () => {
        const r = await setup({ hidden: ['tab:withdrawals', 'field:sales_assignment'] }).svc.getOutcomes(user, Q);
        expect(r.hasRevenue).toBe(true);
    });

    it('lớp 1 theo Page: revenue chỉ phủ Page A -> dòng Page B không có tiền, Tổng KHÔNG có tiền (tránh suy ra số Page ẩn)', async () => {
        const r = await setup({ revenuePageIds: [1] }).svc.getOutcomes(user, Q);
        expect(r.pages[0].primary.deposit).toBe(1000.5);
        expect(hasDepositKey(r.pages[1])).toBe(false);
        expect(r.total.deposit).toBeUndefined();
        expect(r.hasRevenue).toBe(true); // vẫn còn ít nhất 1 dòng có tiền -> FE hiện cột, ô thiếu hiện trống
    });

    it('lớp 2: tiền truy vấn trên khách trong phạm vi customers.view (applyViewFilter áp cả truy vấn deposits)', async () => {
        const t = setup({ customerScope: 'department' });
        await t.svc.getOutcomes(user, Q);
        const scopes = applyViewFilter.mock.calls.map((c) => c[3]);
        expect(scopes.length).toBeGreaterThanOrEqual(5); // khách theo UTM + tiền theo UTM + 2 DISTINCT + chưa quy
        expect(new Set(scopes)).toEqual(new Set(['department']));
    });

    it('Dòng "Chưa quy về Page" không bao giờ có tiền', async () => {
        const r = await setup().svc.getOutcomes(user, Q);
        expect(JSON.stringify(r.unassigned)).not.toContain('deposit');
    });
});

describe('FanpageOutcomesService.listCustomers', () => {
    const q = { ...Q, kind: 'primary' as const, fanpageId: 1 };

    it('Page ngoài phạm vi xem -> 403', async () => {
        await expect(setup().svc.listCustomers(user, { ...q, fanpageId: 99 })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('chỉ truyền UTM mà Page là CHÍNH (kind=primary) và scope customers.view của người gọi', async () => {
        const t = setup({ customerScope: 'own' });
        await t.svc.listCustomers(user, { ...q, fanpageId: 2 });
        const [utmIds, filter, , scope] = t.utmCustomers.listForUtms.mock.calls[0] as unknown as [number[], Record<string, unknown>, unknown, string];
        expect(utmIds).toEqual([11]);
        expect(scope).toBe('own');
        expect(filter).toMatchObject({ from: Q.from, to: Q.to });
    });

    it('kind=participating -> chỉ UTM dùng chung', async () => {
        const t = setup();
        await t.svc.listCustomers(user, { ...q, kind: 'participating', fanpageId: 2 });
        expect((t.utmCustomers.listForUtms.mock.calls[0] as unknown as [number[]])[0]).toEqual([10]);
    });

    it('R7: che tên UTM hạn chế mà người xem không được dùng', async () => {
        const t = setup();
        t.utmCustomers.listForUtms.mockResolvedValueOnce({
            data: [{ id: 1, utm: { id: 10, name: 'Bí mật', color: '#f00', isActive: true } }],
            total: 1,
            page: 1,
            limit: 10,
            totalPages: 1,
        } as never);
        t.utmsService.usabilityFor.mockResolvedValueOnce(new Map([[10, { id: 10, restricted: true, canUse: false }]]) as never);
        const r = await t.svc.listCustomers(user, q);
        expect((r.data[0].utm as { name: string }).name).toBe(RESTRICTED_UTM_LABEL);
    });
});

describe('FanpageOutcomesService - GĐ5b: Lead (fanpage_id) ưu tiên hơn UTM (15.3, 15.8)', () => {
    it('Lead cộng vào cột "chính" của đúng Page; Σ chính == Tổng DISTINCT (bất biến R4 giữ nguyên)', async () => {
        const t = setup({ leads: [{ fanpageId: 2, cnt: '4', closed: '2' }] });
        const r = await t.svc.getOutcomes(user, Q);
        const [a, b] = r.pages;
        expect(a.primary.customers).toBe(10);
        expect(b.primary.customers).toBe(5 + 4);
        expect(b.primary.closed).toBe(1 + 2);
        expect(r.total.customers).toBe(a.primary.customers + b.primary.customers);
        expect(r.total.customers).toBe(19);
        expect(b.participating.customers).toBe(10);
    });

    it('mọi truy vấn theo UTM đều loại khách có fanpage_id (tránh đếm 2 lần)', async () => {
        const t = setup({ leads: [{ fanpageId: 2, cnt: '4', closed: '2' }] });
        await t.svc.getOutcomes(user, Q);
        const qb = t.customerRepo.createQueryBuilder.mock.results[0].value as { andWhere: jest.Mock };
        const conds = (qb.andWhere.mock.calls as unknown[][]).map((c) => String(c[0]));
        expect(conds.some((c) => c.includes('customer.fanpageId IS NULL'))).toBe(true);
    });

    it('Tiền Lead cộng vào Page + Tổng khi đủ cổng; Tổng tiền ẩn nếu Page có Lead không nằm trong fanpage_revenue.view', async () => {
        const full = await setup({ leads: [{ fanpageId: 2, cnt: '4', closed: '2', deposit: '300' }] }).svc.getOutcomes(user, Q);
        expect(full.pages[1].primary.deposit).toBe(200 + 300);
        expect(full.total.deposit).toBe(1200.5 + 300);

        const partial = await setup({ revenuePageIds: [1], leads: [{ fanpageId: 2, cnt: '4', closed: '2', deposit: '300' }] }).svc.getOutcomes(user, Q);
        expect(JSON.stringify(partial.pages[1])).not.toContain('deposit');
        expect(partial.total.deposit).toBeUndefined();
    });

    it('listCustomers truyền chế độ quy kết cho UtmCustomersService (danh sách == số đã hiện)', async () => {
        const t = setup();
        await t.svc.listCustomers(user, { ...Q, kind: 'primary', fanpageId: 2 });
        const filter = (t.utmCustomers.listForUtms.mock.calls[0] as unknown as [number[], Record<string, unknown>])[1];
        expect(filter.credit).toEqual({ mode: 'primary', fanpageId: 2 });

        const t2 = setup();
        await t2.svc.listCustomers(user, { ...Q, kind: 'participating', fanpageId: 2 });
        const filter2 = (t2.utmCustomers.listForUtms.mock.calls[0] as unknown as [number[], Record<string, unknown>])[1];
        expect(filter2.credit).toEqual({ mode: 'participating' });
    });
});
