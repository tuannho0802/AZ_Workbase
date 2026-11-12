import 'reflect-metadata';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { FanpagesModule } from './fanpages.module';
import {
    FanpageMetricsController,
    FanpagePostsController,
    FanpageSnapshotsController,
    FanpageStatsController,
} from './fanpages.controller';
import { PERMISSION_KEY } from '../../common/decorators/require-permission.decorator';

const key = (C: { prototype: object }, n: string) => Reflect.getMetadata(PERMISSION_KEY, (C.prototype as Record<string, object>)[n]);

describe('GĐ4 - thứ tự đăng ký controller (X18)', () => {
    it('FanpageStatsController đứng TRƯỚC FanpagePostsController (fanpages/stats/posts vs fanpages/:fanpageId/posts)', () => {
        const list: unknown[] = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, FanpagesModule);
        expect(list.indexOf(FanpageStatsController)).toBeGreaterThan(-1);
        expect(list.indexOf(FanpageStatsController)).toBeLessThan(list.indexOf(FanpagePostsController));
    });
});

describe('GĐ4 - quyền khai báo đúng key đã seed', () => {
    it.each([[FanpageStatsController], [FanpageSnapshotsController], [FanpageMetricsController]])('%p: mọi route có @RequirePermission', (C) => {
        const proto = C.prototype as unknown as Record<string, object>;
        for (const n of Object.getOwnPropertyNames(proto).filter((x) => x !== 'constructor')) {
            expect(Reflect.getMetadata(PERMISSION_KEY, proto[n])).toEqual(expect.any(String));
        }
    });
    it('stats = fanpage_stats.view; nhập = fanpage_metrics.manage; xoá = fanpage_metrics.delete; xem = fanpages.view', () => {
        for (const n of ['growth', 'posts', 'topPosts']) expect(key(FanpageStatsController, n)).toBe('fanpage_stats.view');
        for (const n of ['upsert', 'setTarget']) expect(key(FanpageSnapshotsController, n)).toBe('fanpage_metrics.manage');
        expect(key(FanpageSnapshotsController, 'removeSnapshot')).toBe('fanpage_metrics.delete');
        for (const n of ['list', 'targets', 'heatmap']) expect(key(FanpageSnapshotsController, n)).toBe('fanpages.view');
        for (const n of ['grid', 'bulk']) expect(key(FanpageMetricsController, n)).toBe('fanpage_metrics.manage');
    });
});