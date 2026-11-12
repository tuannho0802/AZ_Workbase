import { remapFanpageUtmsOnMerge } from './fanpage-utm-merge';

/** Manager giả: trả `rows` cho câu SELECT, ghi lại mọi câu ghi theo thứ tự. */
function fakeManager(rows: Array<{ fanpage_id: number; utm_id: number; primary_utm_id: number | null }>) {
    const writes: Array<{ sql: string; params: unknown[] }> = [];
    const query = jest.fn(async (sql: string, params: unknown[] = []) => {
        if (/^SELECT/i.test(sql)) return rows;
        writes.push({ sql, params });
        return { affectedRows: 1 };
    });
    return { manager: { query } as never, writes };
}

describe('remapFanpageUtmsOnMerge (X12)', () => {
    it('khử trùng + chuyển dòng chưa trùng, GIỮ Page chính của UTM đích', async () => {
        const { manager, writes } = fakeManager([
            { fanpage_id: 1, utm_id: 5, primary_utm_id: 5 }, // nguồn, chính Page 1
            { fanpage_id: 2, utm_id: 5, primary_utm_id: null }, // nguồn, Page 2 (đã gắn đích)
            { fanpage_id: 2, utm_id: 6, primary_utm_id: 6 }, // đích, chính Page 2
        ]);
        const res = await remapFanpageUtmsOnMerge(manager, 5, 6);
        expect(res).toEqual({ deleted: 1, moved: 1, promoted: false });
        expect(writes[0].sql).toMatch(/^DELETE FROM fanpage_utms/);
        expect(writes[0].params).toEqual([5, 2]);
        expect(writes[1].sql).toMatch(/SET utm_id = \?, primary_utm_id = NULL/);
        expect(writes[1].params).toEqual([6, 5, 1]);
        expect(writes).toHaveLength(2); // không nâng ai lên chính
    });

    it('UTM đích chưa có Page chính -> nâng Page chính của nguồn SAU khi chuyển dòng (nhả khoá UNIQUE trước)', async () => {
        const { manager, writes } = fakeManager([{ fanpage_id: 1, utm_id: 5, primary_utm_id: 5 }]);
        const res = await remapFanpageUtmsOnMerge(manager, 5, 6);
        expect(res).toEqual({ deleted: 0, moved: 1, promoted: true });
        expect(writes.map((w) => (/primary_utm_id = NULL/.test(w.sql) ? 'move' : 'promote'))).toEqual(['move', 'promote']);
        expect(writes[1].params).toEqual([6, 6, 1]);
    });

    it('không có liên kết nào -> không ghi gì', async () => {
        const { manager, writes } = fakeManager([]);
        expect(await remapFanpageUtmsOnMerge(manager, 5, 6)).toEqual({ deleted: 0, moved: 0, promoted: false });
        expect(writes).toHaveLength(0);
    });
});