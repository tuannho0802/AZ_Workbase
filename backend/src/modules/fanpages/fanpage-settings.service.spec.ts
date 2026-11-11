import { FanpageSettingsService } from './fanpage-settings.service';

describe('FanpageSettingsService.getSilentDays', () => {
    const mk = (impl: () => Promise<unknown>) => {
        const repo = { findOne: jest.fn(impl) };
        return { svc: new FanpageSettingsService(repo as never), repo };
    };
    it('đọc setting hợp lệ', async () => {
        const { svc } = mk(async () => ({ value: '7' }));
        expect(await svc.getSilentDays()).toBe(7);
    });
    it('thiếu / hỏng / ngoài khoảng -> mặc định 3', async () => {
        for (const v of [null, { value: 'abc' }, { value: '99' }]) {
            const { svc } = mk(async () => v);
            expect(await svc.getSilentDays()).toBe(3);
        }
    });
    it('lỗi DB -> mặc định 3, KHÔNG ném lỗi', async () => {
        const { svc } = mk(async () => { throw new Error('db down'); });
        expect(await svc.getSilentDays()).toBe(3);
    });
    it('cache: gọi lần 2 không đọc DB; invalidate thì đọc lại', async () => {
        const { svc, repo } = mk(async () => ({ value: '5' }));
        await svc.getSilentDays();
        await svc.getSilentDays();
        expect(repo.findOne).toHaveBeenCalledTimes(1);
        svc.invalidate();
        await svc.getSilentDays();
        expect(repo.findOne).toHaveBeenCalledTimes(2);
    });
});
