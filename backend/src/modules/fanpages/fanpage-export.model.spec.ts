import { buildFanpageExportModel, buildOutcomesTable, ExportOutcomes, FANPAGE_EXPORT_ROW_CAP } from './fanpage-export.model';

const base = { pages: [], posts: [], snapshots: [], includeMetrics: true, outcomes: null, period: { from: null, to: null }, truncated: {} };
const page = (over = {}) => ({
    name: '=cmd|x', platform: 'Facebook', url: 'https://fb.com/a', owners: ['An', 'Bình'], health: null, isTracked: true, archived: false,
    cadenceState: 'ok' as const, weekCount: 2, target: 3, posts30d: 5, lastPostDate: '2026-11-10', postCount: 9, followers: 100, followersDate: '2026-11-09', ...over,
});
const outcomes = (hasRevenue: boolean): ExportOutcomes => ({
    from: '2026-10-14', to: '2026-11-12', hasRevenue,
    rows: [{ name: 'P1', archived: false, posts: 3, primaryCustomers: 4, primaryClosed: 2, primaryCloseRate: 50, ...(hasRevenue ? { primaryDeposit: 1000 } : {}), participatingCustomers: 1, participatingClosed: 0, customersPerPost: 1.3 }],
    total: { customers: 5, closed: 2, closeRate: 40, ...(hasRevenue ? { deposit: 1000 } : {}) }, unassigned: { customers: 2, closed: 1 },
});

describe('buildFanpageExportModel - cổng quyền theo sheet', () => {
    it('luôn có sheet Page + Bài đăng; Số liệu chỉ khi includeMetrics; Khách & Tiền nạp chỉ khi có outcomes', () => {
        expect(buildFanpageExportModel({ ...base, includeMetrics: false }).sheets.map((s) => s.name)).toEqual(['Page', 'Bài đăng']);
        expect(buildFanpageExportModel(base).sheets.map((s) => s.name)).toEqual(['Page', 'Bài đăng', 'Số liệu']);
        expect(buildFanpageExportModel({ ...base, outcomes: outcomes(false) }).sheets.map((s) => s.name)).toEqual(['Page', 'Bài đăng', 'Số liệu', 'Khách & Tiền nạp']);
    });
    it('chống formula injection ở ô chữ', () => {
        const m = buildFanpageExportModel({ ...base, pages: [page()] });
        expect(String(m.sheets[0].table.rows[0][0]).startsWith('=')).toBe(false);
    });
    it('isEmpty khi không có Page; nhãn nhịp đăng tiếng Việt', () => {
        expect(buildFanpageExportModel(base).isEmpty).toBe(true);
        expect(buildFanpageExportModel({ ...base, pages: [page({ cadenceState: 'at_risk' })] }).sheets[0].table.rows[0][7]).toBe('Nguy cơ trễ');
    });
    it('bị cắt ở trần dòng -> có ghi chú', () => {
        const m = buildFanpageExportModel({ ...base, truncated: { posts: true } });
        expect(m.sheets[1].table.truncated).toBe(true);
        expect(m.sheets[1].table.note).toContain(FANPAGE_EXPORT_ROW_CAP.toLocaleString('vi-VN'));
    });
});

describe('buildOutcomesTable - cột tiền chỉ khi qua cổng 4 lớp', () => {
    it('hasRevenue=false -> KHÔNG có cột Tiền nạp ở header, dòng, tổng', () => {
        const t = buildOutcomesTable(outcomes(false));
        expect(t.columns.some((c) => c.key === 'deposit')).toBe(false);
        for (const r of t.rows) expect(r).toHaveLength(t.columns.length);
        expect(t.totalsRow).toHaveLength(t.columns.length);
    });
    it('hasRevenue=true -> có cột Tiền nạp, dòng Tổng lấy số DISTINCT của service (không cộng dòng Page)', () => {
        const t = buildOutcomesTable(outcomes(true));
        const i = t.columns.findIndex((c) => c.key === 'deposit');
        expect(i).toBeGreaterThan(-1);
        expect(t.rows[0][i]).toBe(1000);
        expect(t.totalsRow?.[2]).toBe(5);
        for (const r of t.rows) expect(r).toHaveLength(t.columns.length);
    });
});
