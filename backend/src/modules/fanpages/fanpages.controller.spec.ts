import 'reflect-metadata';
import { FanpagesController, FanpageHealthStatusesController, FanpagePostTypesController, FanpagePostsController, FanpageStatsController } from './fanpages.controller';
import { PERMISSION_KEY } from '../../common/decorators/require-permission.decorator';

describe('FanpagesController - thứ tự route (X18)', () => {
    const proto = FanpagesController.prototype as unknown as Record<string, unknown>;
    const order = Object.getOwnPropertyNames(proto).filter((n) => n !== 'constructor');
    const path = (n: string) => Reflect.getMetadata('path', proto[n] as object) as string;
    const method = (n: string) => Reflect.getMetadata('method', proto[n] as object) as number;

    it('mọi route GET tĩnh khai TRƯỚC GET :id (tránh ParseIntPipe bắt chữ "overview")', () => {
        const getIdx = order.findIndex((n) => method(n) === 0 && path(n) === ':id');
        expect(getIdx).toBeGreaterThan(-1);
        for (const staticPath of ['overview', 'today', 'owner-options', 'export']) {
            const i = order.findIndex((n) => method(n) === 0 && path(n) === staticPath);
            expect(i).toBeGreaterThan(-1);
            expect(i).toBeLessThan(getIdx);
        }
    });
    it('archive/unarchive khai trước PATCH :id', () => {
        const patchIdx = order.findIndex((n) => path(n) === ':id' && method(n) === 4);
        for (const p of [':id/archive', ':id/unarchive']) {
            expect(order.findIndex((n) => path(n) === p)).toBeLessThan(patchIdx);
        }
    });
});

describe('Quyền khai báo trên route (mọi route phải có @RequirePermission)', () => {
    it.each([[FanpagesController], [FanpageHealthStatusesController]])('%p', (C) => {
        const proto = C.prototype as unknown as Record<string, object>;
        for (const name of Object.getOwnPropertyNames(proto).filter((n) => n !== 'constructor')) {
            expect(Reflect.getMetadata(PERMISSION_KEY, proto[name])).toEqual(expect.any(String));
        }
    });
    it('key mới đúng như migration seed', () => {
        const key = (C: { prototype: object }, n: string) => Reflect.getMetadata(PERMISSION_KEY, (C.prototype as Record<string, object>)[n]);
        expect(key(FanpagesController, 'overview')).toBe('fanpages.view');
        expect(key(FanpagesController, 'today')).toBe('fanpages.view');
        expect(key(FanpagesController, 'history')).toBe('fanpages.view');
        expect(key(FanpagesController, 'archive')).toBe('fanpages.edit');
        expect(key(FanpagesController, 'unarchive')).toBe('fanpages.edit');
        for (const n of ['create', 'update', 'lock', 'unlock']) expect(key(FanpageHealthStatusesController, n)).toBe('fanpage_statuses.manage');
        expect(key(FanpageHealthStatusesController, 'findAll')).toBe('fanpages.view');
    });
});

describe('GĐ6 - quyền khai báo (B4, B5, A4, E5a)', () => {
    const k = (C: { prototype: unknown }, n: string) => Reflect.getMetadata('permission', (C.prototype as Record<string, object>)[n]);
    it('export = fanpages.export; rankings = fanpage_rankings.view; bulk = fanpage_posts.manage', () => {
        expect(k(FanpagesController, 'exportExcel')).toBe('fanpages.export');
        expect(k(FanpageStatsController, 'rankingsReport')).toBe('fanpage_rankings.view');
        expect(k(FanpagePostsController, 'bulkCreate')).toBe('fanpage_posts.manage');
    });
    it('Loại bài: xem = fanpages.view; sửa/khoá = fanpage_post_types.manage; KHÔNG có route xoá', () => {
        expect(k(FanpagePostTypesController, 'findAll')).toBe('fanpages.view');
        for (const n of ['create', 'update', 'lock', 'unlock']) expect(k(FanpagePostTypesController, n)).toBe('fanpage_post_types.manage');
        expect((FanpagePostTypesController.prototype as unknown as Record<string, unknown>).remove).toBeUndefined();
    });
});
