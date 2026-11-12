import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { FanpageUtmsService, RESTRICTED_UTM_LABEL } from './fanpage-utms.service';

type Link = { fanpageId: number; utmId: number; primaryUtmId: number | null };
type Info = { id: number; name: string; color: string; isActive: boolean; restricted: boolean; canUse: boolean };

const U = (id: number, over: Partial<Info> = {}): Info => ({ id, name: `UTM ${id}`, color: '#111', isActive: true, restricted: false, canUse: true, ...over });
const user = { id: 7, role: 'employee', departmentId: 1, positionId: null };

function setup(links: Link[], infos: Info[], opts: { editScope?: string } = {}) {
    // `find` trả theo where.fanpageId / where.utmId (đủ cho service này).
    const linkRepo = {
        find: jest.fn(async ({ where }: { where: { fanpageId?: number | { _value: number[] }; utmId?: { _value: number[] } } }) => {
            const wf = where.fanpageId;
            const wu = where.utmId as { _value: number[] } | undefined;
            if (typeof wf === 'number') return links.filter((l) => l.fanpageId === wf);
            if (wf && '_value' in wf) return links.filter((l) => wf._value.includes(l.fanpageId));
            if (wu) return links.filter((l) => wu._value.includes(l.utmId));
            return [];
        }),
        query: jest.fn(async () =>
            links.map((l) => ({ fanpage_id: l.fanpageId, utm_id: l.utmId, primary_utm_id: l.primaryUtmId, name: `Page ${l.fanpageId}` })),
        ),
    };
    const pageRepo = { find: jest.fn(async () => [1, 2, 3].map((id) => ({ id, name: `Page ${id}` }))) };
    const access = {
        assertPageAccess: jest.fn(async (_u: unknown, _k: string, id: number) => ({ id, name: `Page ${id}` })),
        scopeOf: jest.fn().mockResolvedValue(opts.editScope ?? 'own'),
    };
    const utmsService = { usabilityFor: jest.fn(async () => new Map(infos.map((i) => [i.id, i]))) };
    const audit = { logActionAsync: jest.fn() };
    const manager = { delete: jest.fn(), insert: jest.fn(), update: jest.fn() };
    const dataSource = { transaction: jest.fn(async (cb: (m: unknown) => Promise<void>) => cb(manager)) };
    const svc = new FanpageUtmsService(linkRepo as never, pageRepo as never, access as never, utmsService as never, audit as never, dataSource as never);
    return { svc, linkRepo, access, utmsService, audit, manager, dataSource };
}

// `In()` của TypeORM trả FindOperator có `_value`; service dùng nó nên mock đọc `_value`.

describe('FanpageUtmsService.setUtms', () => {
    it('R1: UTM chưa có Page chính -> Page này thành chính (primary_utm_id = utm_id) + audit LINK', async () => {
        const t = setup([], [U(10)]);
        await t.svc.setUtms(1, [10], user);
        expect(t.manager.insert).toHaveBeenCalledWith(expect.anything(), { fanpageId: 1, utmId: 10, primaryUtmId: 10, createdById: 7 });
        expect(t.audit.logActionAsync).toHaveBeenCalledWith(7, 'LINK_FANPAGE_UTM', 'fanpage', 1, null, expect.objectContaining({ utms: [{ utmId: 10, name: 'UTM 10', primary: true }] }));
    });

    it('UTM đã có Page chính ở Page khác -> chỉ tham gia (primary_utm_id = null)', async () => {
        const t = setup([{ fanpageId: 2, utmId: 10, primaryUtmId: 10 }], [U(10)]);
        await t.svc.setUtms(1, [10], user);
        expect(t.manager.insert).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ utmId: 10, primaryUtmId: null }));
    });

    it('X10: UTM hạn chế người gọi KHÔNG được dùng -> 403, không ghi', async () => {
        const t = setup([], [U(10, { restricted: true, canUse: false })]);
        await expect(t.svc.setUtms(1, [10], user)).rejects.toBeInstanceOf(ForbiddenException);
        expect(t.dataSource.transaction).not.toHaveBeenCalled();
    });

    it('UTM không tồn tại -> 400', async () => {
        const t = setup([], []);
        await expect(t.svc.setUtms(1, [99], user)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('R10: gỡ Page chính khi UTM còn Page khác -> 409 kèm danh sách Page, KHÔNG ghi gì', async () => {
        const t = setup(
            [
                { fanpageId: 1, utmId: 10, primaryUtmId: 10 },
                { fanpageId: 2, utmId: 10, primaryUtmId: null },
            ],
            [U(10)],
        );
        const err = await t.svc.setUtms(1, [], user).catch((e) => e);
        expect(err).toBeInstanceOf(ConflictException);
        expect((err as ConflictException).getResponse()).toMatchObject({ blocked: [{ utmId: 10, utmName: 'UTM 10', otherPages: [{ id: 2, name: 'Page 2' }] }] });
        expect(t.dataSource.transaction).not.toHaveBeenCalled();
        expect(t.audit.logActionAsync).not.toHaveBeenCalled();
    });

    it('R10: 409 che tên UTM hạn chế khi người gọi không được dùng', async () => {
        const t = setup(
            [
                { fanpageId: 1, utmId: 10, primaryUtmId: 10 },
                { fanpageId: 2, utmId: 10, primaryUtmId: null },
            ],
            [U(10, { restricted: true, canUse: false })],
            { editScope: 'all' }, // scope rộng nên qua được bước chip khoá, vẫn bị chặn bởi R10
        );
        const err = (await t.svc.setUtms(1, [], user).catch((e) => e)) as ConflictException;
        expect(JSON.stringify(err.getResponse())).toContain(RESTRICTED_UTM_LABEL);
        expect(JSON.stringify(err.getResponse())).not.toContain('UTM 10');
    });

    it('gỡ Page không phải chính -> xoá dòng + audit UNLINK', async () => {
        const t = setup(
            [
                { fanpageId: 1, utmId: 10, primaryUtmId: null },
                { fanpageId: 2, utmId: 10, primaryUtmId: 10 },
            ],
            [U(10)],
        );
        await t.svc.setUtms(1, [], user);
        expect(t.manager.delete).toHaveBeenCalled();
        expect(t.audit.logActionAsync).toHaveBeenCalledWith(7, 'UNLINK_FANPAGE_UTM', 'fanpage', 1, expect.anything(), null);
    });

    it('X10: chip KHOÁ (UTM hạn chế, không được dùng) -> scope hẹp không gỡ được (403), scope all/department thì được', async () => {
        const link = [{ fanpageId: 1, utmId: 10, primaryUtmId: null }, { fanpageId: 2, utmId: 10, primaryUtmId: 10 }];
        const info = [U(10, { restricted: true, canUse: false })];
        const narrow = setup(link, info, { editScope: 'own' });
        await expect(narrow.svc.setUtms(1, [], user)).rejects.toBeInstanceOf(ForbiddenException);
        expect(narrow.manager.delete).not.toHaveBeenCalled();

        const broad = setup(link, info, { editScope: 'department' });
        await broad.svc.setUtms(1, [], user);
        expect(broad.manager.delete).toHaveBeenCalled();
    });

    it('không đổi gì -> không ghi, không audit', async () => {
        const t = setup([{ fanpageId: 1, utmId: 10, primaryUtmId: 10 }], [U(10)]);
        await t.svc.setUtms(1, [10], user);
        expect(t.dataSource.transaction).not.toHaveBeenCalled();
        expect(t.audit.logActionAsync).not.toHaveBeenCalled();
    });

    it('đua ghi: ER_DUP_ENTRY (2 người cùng thành Page chính) -> 409 thân thiện', async () => {
        const t = setup([], [U(10)]);
        t.dataSource.transaction.mockRejectedValueOnce({ code: 'ER_DUP_ENTRY' });
        await expect(t.svc.setUtms(1, [10], user)).rejects.toBeInstanceOf(ConflictException);
    });

    it('bắt buộc fanpages.edit trên Page (assertPageAccess)', async () => {
        const t = setup([], [U(10)]);
        t.access.assertPageAccess.mockRejectedValueOnce(new ForbiddenException('x'));
        await expect(t.svc.setUtms(1, [10], user)).rejects.toBeInstanceOf(ForbiddenException);
        expect(t.access.assertPageAccess).toHaveBeenCalledWith(user, 'fanpages.edit', 1, expect.any(String));
    });
});

describe('FanpageUtmsService.setPrimary (R9)', () => {
    const links: Link[] = [
        { fanpageId: 1, utmId: 10, primaryUtmId: 10 },
        { fanpageId: 2, utmId: 10, primaryUtmId: null },
    ];

    it('cần quyền sửa trên CẢ Page mới lẫn Page chính hiện tại', async () => {
        const t = setup(links, [U(10)]);
        await t.svc.setPrimary(2, 10, user);
        const ids = t.access.assertPageAccess.mock.calls.map((c) => c[2]);
        expect(ids).toEqual(expect.arrayContaining([1, 2]));
    });

    it('thiếu quyền trên Page chính hiện tại -> 403, không ghi', async () => {
        const t = setup(links, [U(10)]);
        t.access.assertPageAccess.mockImplementation(async (_u: unknown, _k: string, id: number) => {
            if (id === 1) throw new ForbiddenException('no');
            return { id, name: `Page ${id}` };
        });
        await expect(t.svc.setPrimary(2, 10, user)).rejects.toBeInstanceOf(ForbiddenException);
        expect(t.dataSource.transaction).not.toHaveBeenCalled();
    });

    it('nhả khoá Page chính cũ TRƯỚC khi nâng Page mới (UNIQUE primary_utm_id) + audit', async () => {
        const t = setup(links, [U(10)]);
        await t.svc.setPrimary(2, 10, user);
        expect(t.manager.update.mock.calls[0][2]).toEqual({ primaryUtmId: null });
        expect(t.manager.update.mock.calls[0][1]).toEqual({ fanpageId: 1, utmId: 10 });
        expect(t.manager.update.mock.calls[1][2]).toEqual({ primaryUtmId: 10 });
        expect(t.audit.logActionAsync).toHaveBeenCalledWith(7, 'SET_PRIMARY_FANPAGE_UTM', 'fanpage', 2, expect.objectContaining({ primaryFanpageId: 1 }), expect.objectContaining({ primaryFanpageId: 2 }));
    });

    it('đã là Page chính -> không ghi, không audit (idempotent)', async () => {
        const t = setup(links, [U(10)]);
        await t.svc.setPrimary(1, 10, user);
        expect(t.dataSource.transaction).not.toHaveBeenCalled();
        expect(t.audit.logActionAsync).not.toHaveBeenCalled();
    });

    it('UTM chưa gắn Page -> 404', async () => {
        const t = setup(links, [U(10)]);
        await expect(t.svc.setPrimary(3, 10, user)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('UTM hạn chế không được dùng + scope hẹp -> 403', async () => {
        const t = setup(links, [U(10, { restricted: true, canUse: false })], { editScope: 'own' });
        await expect(t.svc.setPrimary(2, 10, user)).rejects.toBeInstanceOf(ForbiddenException);
    });
});

describe('FanpageUtmsService.chipsForPages', () => {
    it('R7: che tên + màu UTM hạn chế khi người xem không được dùng, đánh dấu locked', async () => {
        const t = setup([{ fanpageId: 1, utmId: 10, primaryUtmId: 10 }], [U(10, { restricted: true, canUse: false })]);
        const chips = (await t.svc.chipsForPages([1], user)).get(1) ?? [];
        expect(chips[0]).toMatchObject({ name: RESTRICTED_UTM_LABEL, color: null, locked: true, isPrimary: true });
    });

    it('chip nêu Page chính + các Page dùng chung; Page không có UTM -> mảng rỗng', async () => {
        const t = setup(
            [
                { fanpageId: 1, utmId: 10, primaryUtmId: null },
                { fanpageId: 2, utmId: 10, primaryUtmId: 10 },
            ],
            [U(10)],
        );
        const out = await t.svc.chipsForPages([1, 3], user);
        expect(out.get(1)?.[0]).toMatchObject({ isPrimary: false, primaryFanpage: { id: 2, name: 'Page 2' }, sharedWith: [{ id: 2, name: 'Page 2' }] });
        expect(out.get(3)).toEqual([]);
    });
});