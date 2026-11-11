import { ForbiddenException } from '@nestjs/common';
import { Brackets } from 'typeorm';
import { applyFanpageFilters, applyFanpageScope, requireViewScope } from './fanpage-scoped-query';
import { FanpageScopes } from './fanpage-access.service';

const scopes = (view: string | null, managed: number[] = []): FanpageScopes => ({ view, flagScopes: {} as never, managed });

/** QueryBuilder giả: ghi lại các lần andWhere để khẳng định đúng điều kiện + tham số. */
function fakeQb() {
    const calls: Array<{ cond: unknown; params?: Record<string, unknown> }> = [];
    return { calls, andWhere: jest.fn((cond: unknown, params?: Record<string, unknown>) => { calls.push({ cond, params }); }) };
}
const text = (c: { cond: unknown }) => (typeof c.cond === 'string' ? c.cond : '[Brackets]');

describe('requireViewScope', () => {
    it.each([['own'], ['department'], ['all']])('%s -> hợp lệ', (v) => expect(requireViewScope(scopes(v))).toBe(v));
    it.each([[null], ['none'], ['xyz']])('%p -> 403 (fail-closed)', (v) => {
        expect(() => requireViewScope(scopes(v as never))).toThrow(ForbiddenException);
    });
});

describe('applyFanpageScope', () => {
    it('all -> KHÔNG thêm điều kiện nào', () => {
        const qb = fakeQb();
        applyFanpageScope(qb as never, { id: 7 }, scopes('all'));
        expect(qb.andWhere).not.toHaveBeenCalled();
    });
    it('own -> lọc theo bảng nối fanpage_owners của chính mình', () => {
        const qb = fakeQb();
        applyFanpageScope(qb as never, { id: 7 }, scopes('own'));
        expect(qb.calls).toHaveLength(1);
        expect(text(qb.calls[0])).toContain('fanpage_owners');
        expect(qb.calls[0].params).toEqual({ uid: 7 });
    });
    it('department -> 1 điều kiện Brackets (mình phụ trách HOẶC người phòng ban mình quản lý)', () => {
        const qb = fakeQb();
        applyFanpageScope(qb as never, { id: 7 }, scopes('department', [3]));
        expect(qb.calls).toHaveLength(1);
        expect(qb.calls[0].cond).toBeInstanceOf(Brackets);
    });
    it('không có quyền xem -> 403, không thêm điều kiện', () => {
        const qb = fakeQb();
        expect(() => applyFanpageScope(qb as never, { id: 7 }, scopes(null))).toThrow(ForbiddenException);
        expect(qb.andWhere).not.toHaveBeenCalled();
    });
});

describe('applyFanpageFilters', () => {
    it('mặc định ẨN Page đã lưu trữ', () => {
        const qb = fakeQb();
        applyFanpageFilters(qb as never, {});
        expect(qb.calls.map(text)).toEqual(['f.archivedAt IS NULL']);
    });
    it('archived=all -> không lọc; archived=true -> chỉ đã lưu trữ', () => {
        const all = fakeQb();
        applyFanpageFilters(all as never, { archived: 'all' });
        expect(all.andWhere).not.toHaveBeenCalled();
        const only = fakeQb();
        applyFanpageFilters(only as never, { archived: 'true' });
        expect(only.calls.map(text)).toEqual(['f.archivedAt IS NOT NULL']);
    });
    it('isActive truyền 1/0 (BooleanTransformer không chạy trong QueryBuilder)', () => {
        const a = fakeQb();
        applyFanpageFilters(a as never, { isActive: 'true', archived: 'all' });
        expect(a.calls[0].params).toEqual({ act: 1 });
        const b = fakeQb();
        applyFanpageFilters(b as never, { isActive: 'false', archived: 'all' });
        expect(b.calls[0].params).toEqual({ act: 0 });
    });
    it('lọc nền tảng, tình trạng, người phụ trách', () => {
        const qb = fakeQb();
        applyFanpageFilters(qb as never, { platformId: 2, healthStatusId: 3, ownerId: 9, archived: 'all' });
        expect(qb.calls.map((c) => c.params)).toEqual([{ platformId: 2 }, { ownerId: 9 }, { healthStatusId: 3 }]);
    });
    it('search được escape ký tự LIKE', () => {
        const qb = fakeQb();
        applyFanpageFilters(qb as never, { search: ' 50%_off ', archived: 'all' });
        expect(qb.calls[0].params).toEqual({ s: '%50\\%\\_off%' });
    });
    it('orphan=true -> NOT EXISTS người phụ trách đang hoạt động', () => {
        const qb = fakeQb();
        applyFanpageFilters(qb as never, { orphan: 'true', archived: 'all' });
        expect(text(qb.calls[0])).toContain('NOT EXISTS');
        expect(text(qb.calls[0])).toContain('is_active = 1');
    });
});