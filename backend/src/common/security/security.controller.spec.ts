import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SecurityController } from './security.controller';
import { Role } from '../../common/enums/role.enum';
import { PermissionScope } from '../../database/entities/role-permission.entity';

describe('SecurityController (P3.3)', () => {
    let ipBlocks: { list: jest.Mock; unblock: jest.Mock };
    let whitelist: { list: jest.Mock; add: jest.Mock; remove: jest.Mock };
    let blacklist: { list: jest.Mock; add: jest.Mock; remove: jest.Mock };
    let config: { get: jest.Mock };
    let audit: { logActionAsync: jest.Mock; logSecurityEventAsync: jest.Mock };
    let activity: { listEvents: jest.Mock; summary: jest.Mock };
    let ipGeo: { enrich: jest.Mock; setManual: jest.Mock; clearManual: jest.Mock };
    let ipAccess: { list: jest.Mock; detail: jest.Mock };
    let ctl: SecurityController;
    const admin = { user: { id: 1, role: Role.ADMIN } };
    const dept = { user: { id: 2, role: 'manager' } };

    beforeEach(() => {
        ipBlocks = { list: jest.fn().mockResolvedValue([{ ip: '1.2.3.4' }]), unblock: jest.fn() };
        config = { get: jest.fn().mockResolvedValue({ ipMaxFailedAttempts: 10, ipWindowMinutes: 10, ipLockMinutes: 5, accountLockMinutes: 5 }) };
        audit = { logActionAsync: jest.fn(), logSecurityEventAsync: jest.fn() };
        activity = { listEvents: jest.fn().mockResolvedValue({ data: [] }), summary: jest.fn().mockResolvedValue({ lockedToday: 1 }) };
        whitelist = { list: jest.fn().mockResolvedValue([{ ip: '9.9.9.9' }]), add: jest.fn(), remove: jest.fn() };
        ipGeo = {
            enrich: jest.fn(async (rows: any[]) => rows.map((r) => ({ ...r, countryCode: 'VN', ipKind: 'public', geoSource: 'vercel' }))),
            setManual: jest.fn().mockResolvedValue({ ip: '1.2.3.4', before: null, after: 'VN' }),
            clearManual: jest.fn(),
        };
        ipAccess = { list: jest.fn().mockResolvedValue({ total: 1, page: 1, limit: 20, items: [{ ip: '1.2.3.4' }] }), detail: jest.fn() };
        blacklist = { list: jest.fn().mockResolvedValue([{ ip: '6.6.6.6' }]), add: jest.fn(), remove: jest.fn() };
        ctl = new SecurityController(ipBlocks as any, whitelist as any, blacklist as any, config as any, audit as any, activity as any, ipGeo as any, ipAccess as any);
    });

    it('list: admin xem được, kèm ngưỡng cấu hình', async () => {
        const res = await ctl.list(admin, PermissionScope.ALL);
        expect(res.items).toEqual([{ ip: '1.2.3.4', countryCode: 'VN', ipKind: 'public', geoSource: 'vercel' }]);
        expect(res.config).toEqual({ ipMaxFailedAttempts: 10, ipWindowMinutes: 10, ipLockMinutes: 5 });
    });

    it('list: role admin cố định luôn qua dù scope null (lối thoát hiểm)', async () => {
        await expect(ctl.list(admin, null)).resolves.toBeDefined();
    });

    it('list/unblock: scope department (Manager) bị chặn 403', async () => {
        await expect(ctl.list(dept, PermissionScope.DEPARTMENT)).rejects.toThrow(ForbiddenException);
        await expect(ctl.unblock('1.2.3.4', dept, PermissionScope.DEPARTMENT)).rejects.toThrow(ForbiddenException);
        expect(ipBlocks.unblock).not.toHaveBeenCalled();
    });

    it('list/unblock: role tuỳ chỉnh có scope all được phép', async () => {
        await expect(ctl.list({ user: { role: 'team_lead' } }, PermissionScope.ALL)).resolves.toBeDefined();
    });

    it('unblock: xoá + ghi audit UNBLOCK_LOGIN_IP', async () => {
        ipBlocks.unblock.mockResolvedValue({ id: 7, ip: '1.2.3.4', failedCount: 10, wasLocked: true });
        const res = await ctl.unblock('1.2.3.4', admin, PermissionScope.ALL);
        expect(res.success).toBe(true);
        expect(audit.logSecurityEventAsync).toHaveBeenCalledWith({
            userId: 1, action: 'UNBLOCK_LOGIN_IP', entityId: 7,
            detail: { ip: '1.2.3.4', failedCount: 10, wasLocked: true },
        });
    });

    it('unblock: IP không có bản ghi -> 404, không audit', async () => {
        ipBlocks.unblock.mockResolvedValue(null);
        await expect(ctl.unblock('1.2.3.4', admin, PermissionScope.ALL)).rejects.toThrow(NotFoundException);
        expect(audit.logSecurityEventAsync).not.toHaveBeenCalled();
    });

    it('unblock: IP sai định dạng -> 400, không đụng DB', async () => {
        await expect(ctl.unblock('abc def', admin, PermissionScope.ALL)).rejects.toThrow(BadRequestException);
        expect(ipBlocks.unblock).not.toHaveBeenCalled();
    });

    describe('P4.3 - events / summary / config', () => {
        it('events + summary chuyển thẳng sang SecurityActivityService', async () => {
            await ctl.events({ page: 2 } as any);
            expect(activity.listEvents).toHaveBeenCalledWith({ page: 2 });
            expect(await ctl.summary()).toEqual({ lockedToday: 1 });
        });

        it('actions: trả đủ SECURITY_AUDIT_ACTIONS', () => {
            const a = ctl.actions();
            expect(a).toEqual(expect.arrayContaining(['LOGIN_FAILED', 'LOGIN_UNKNOWN_EMAIL', 'UPDATE_SECURITY_CONFIG']));
        });

        it('getConfig: trả config + khoảng hợp lệ', async () => {
            config.get.mockResolvedValue({ ipMaxFailedAttempts: 10 });
            const res = await ctl.getConfig();
            expect(res.config).toEqual({ ipMaxFailedAttempts: 10 });
            expect(res.limits.ipMaxFailedAttempts).toEqual([3, 100]);
        });

        it('updateConfig: có thay đổi -> ghi UPDATE_SECURITY_CONFIG với giá trị cũ/mới của ĐÚNG field đổi', async () => {
            (config as any).update = jest.fn().mockResolvedValue({
                before: { ipMaxFailedAttempts: 10, ipLockMinutes: 5 },
                after: { ipMaxFailedAttempts: 20, ipLockMinutes: 5 },
                changed: ['ipMaxFailedAttempts'],
            });
            const res = await ctl.updateConfig({ ipMaxFailedAttempts: 20 } as any, { user: { id: 1 }, ip: '::ffff:9.9.9.9', headers: { 'user-agent': 'UA' } });
            expect(res.changed).toEqual(['ipMaxFailedAttempts']);
            expect(audit.logSecurityEventAsync).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: 1, action: 'UPDATE_SECURITY_CONFIG', ip: '9.9.9.9', userAgent: 'UA',
                    detail: { changed: ['ipMaxFailedAttempts'], before: { ipMaxFailedAttempts: 10 }, after: { ipMaxFailedAttempts: 20 } },
                }),
            );
        });

        it('updateConfig: không có gì đổi -> KHÔNG ghi audit', async () => {
            (config as any).update = jest.fn().mockResolvedValue({ before: {}, after: {}, changed: [] });
            await ctl.updateConfig({} as any, { user: { id: 1 } });
            expect(audit.logSecurityEventAsync).not.toHaveBeenCalled();
        });
    });

    describe('P3.5 - whitelist IP', () => {
        const adminReq = { user: { id: 1, role: Role.ADMIN }, ip: '10.0.0.5', headers: { 'user-agent': 'UA/1' } };

        it('list: trả items + myIp (đã chuẩn hoá); Manager scope department -> 403', async () => {
            const res = await ctl.listWhitelist(adminReq, PermissionScope.ALL);
            expect(res).toEqual({
                items: [{ ip: '9.9.9.9', countryCode: 'VN', ipKind: 'public', geoSource: 'vercel' }],
                myIp: '10.0.0.5',
                myIpCountryCode: 'VN',
                myIpKind: 'public',
            });
            await expect(ctl.listWhitelist(dept, PermissionScope.DEPARTMENT)).rejects.toThrow(ForbiddenException);
        });

        it('add: gọi service + audit IP_WHITELIST_ADDED (kèm clearedBlock)', async () => {
            whitelist.add.mockResolvedValue({ id: 4, ip: '1.2.3.4', clearedBlock: true });
            const res = await ctl.addWhitelist({ ip: '1.2.3.4', note: 'VP' }, adminReq, PermissionScope.ALL);
            expect(whitelist.add).toHaveBeenCalledWith('1.2.3.4', 'VP', 1);
            expect(res).toMatchObject({ success: true, ip: '1.2.3.4', clearedBlock: true });
            expect(audit.logSecurityEventAsync).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: 1, action: 'IP_WHITELIST_ADDED', entityId: 4,
                    detail: { whitelistedIp: '1.2.3.4', note: 'VP', clearedBlock: true },
                }),
            );
        });

        it('add: IP sai định dạng -> 400, không đụng service; scope department -> 403', async () => {
            await expect(ctl.addWhitelist({ ip: 'abc def' }, adminReq, PermissionScope.ALL)).rejects.toThrow(BadRequestException);
            await expect(ctl.addWhitelist({ ip: '1.2.3.4' }, dept, PermissionScope.DEPARTMENT)).rejects.toThrow(ForbiddenException);
            expect(whitelist.add).not.toHaveBeenCalled();
        });

        it('remove: xoá + audit IP_WHITELIST_REMOVED; không có -> 404 không audit', async () => {
            whitelist.remove.mockResolvedValueOnce({ id: 4, ip: '1.2.3.4' });
            await ctl.removeWhitelist('1.2.3.4', adminReq, PermissionScope.ALL);
            expect(audit.logSecurityEventAsync).toHaveBeenCalledWith(
                expect.objectContaining({ action: 'IP_WHITELIST_REMOVED', entityId: 4, detail: { whitelistedIp: '1.2.3.4' } }),
            );
            audit.logSecurityEventAsync.mockClear();
            whitelist.remove.mockResolvedValueOnce(null);
            await expect(ctl.removeWhitelist('1.2.3.4', adminReq, PermissionScope.ALL)).rejects.toThrow(NotFoundException);
            expect(audit.logSecurityEventAsync).not.toHaveBeenCalled();
        });

        it('actions: có 2 action whitelist mới', () => {
            expect(ctl.actions()).toEqual(expect.arrayContaining(['IP_WHITELIST_ADDED', 'IP_WHITELIST_REMOVED']));
        });
    });

    describe('P3.6 quốc gia IP + theo dõi IP', () => {
        const req = { user: { id: 1, role: Role.ADMIN }, ip: '10.0.0.1', headers: { 'user-agent': 'jest' } };

        it('setIpCountry: scope department -> 403, không ghi gì', async () => {
            await expect(ctl.setIpCountry('1.2.3.4', { countryCode: 'VN' }, { ...dept, ip: '1.1.1.1' } as any, PermissionScope.DEPARTMENT)).rejects.toThrow(ForbiddenException);
            expect(ipGeo.setManual).not.toHaveBeenCalled();
        });
        it('setIpCountry: ghi manual + audit IP_COUNTRY_SET', async () => {
            const res = await ctl.setIpCountry('1.2.3.4', { countryCode: 'vn' }, req as any, PermissionScope.ALL);
            expect(ipGeo.setManual).toHaveBeenCalledWith('1.2.3.4', 'vn', 1);
            expect(res).toEqual({ success: true, ip: '1.2.3.4', countryCode: 'VN' });
            expect(audit.logSecurityEventAsync).toHaveBeenCalledWith(expect.objectContaining({ action: 'IP_COUNTRY_SET', detail: { targetIp: '1.2.3.4', before: null, after: 'VN' } }));
        });
        it('setIpCountry: lỗi 400 từ service -> ném lên, không audit', async () => {
            ipGeo.setManual.mockRejectedValue(new BadRequestException('x'));
            await expect(ctl.setIpCountry('1.2.3.4', { countryCode: 'ZZ' }, req as any, PermissionScope.ALL)).rejects.toThrow(BadRequestException);
            expect(audit.logSecurityEventAsync).not.toHaveBeenCalled();
        });
        it('clearIpCountry: không có bản sửa tay -> 404; có -> audit IP_COUNTRY_CLEARED', async () => {
            ipGeo.clearManual.mockResolvedValueOnce(null);
            await expect(ctl.clearIpCountry('1.2.3.4', req as any, PermissionScope.ALL)).rejects.toThrow(NotFoundException);
            ipGeo.clearManual.mockResolvedValueOnce({ ip: '1.2.3.4', before: 'VN' });
            await ctl.clearIpCountry('1.2.3.4', req as any, PermissionScope.ALL);
            expect(audit.logSecurityEventAsync).toHaveBeenCalledWith(expect.objectContaining({ action: 'IP_COUNTRY_CLEARED' }));
        });
        it('listIpAccess: scope department bị chặn; admin xem được kèm countryCode', async () => {
            await expect(ctl.listIpAccess({}, dept as any, PermissionScope.DEPARTMENT)).rejects.toThrow(ForbiddenException);
            const res = await ctl.listIpAccess({ page: 1, limit: 20 }, admin as any, PermissionScope.ALL);
            expect(res.items[0]).toMatchObject({ ip: '1.2.3.4', countryCode: 'VN' });
        });
        it('ipAccessDetail: IP sai -> 400; chưa có log -> 404', async () => {
            await expect(ctl.ipAccessDetail('abc!', {}, admin as any, PermissionScope.ALL)).rejects.toThrow(BadRequestException);
            ipAccess.detail.mockResolvedValue(null);
            await expect(ctl.ipAccessDetail('1.2.3.4', {}, admin as any, PermissionScope.ALL)).rejects.toThrow(NotFoundException);
        });
    });
    describe('blacklist - khoá chủ động (P3.7)', () => {
        const adminReq = { user: { id: 1, role: Role.ADMIN }, ip: '9.9.9.1', headers: { 'user-agent': 'UA' } };

        it('list: kèm cờ quốc gia + myIp', async () => {
            const res = await ctl.listBlacklist(adminReq, PermissionScope.ALL);
            expect(res.items[0]).toMatchObject({ ip: '6.6.6.6', countryCode: 'VN' });
            expect(res.myIp).toBe('9.9.9.1');
        });

        it('scope department (Manager) -> 403 ở cả 3 endpoint, không đụng service', async () => {
            await expect(ctl.listBlacklist(dept, PermissionScope.DEPARTMENT)).rejects.toThrow(ForbiddenException);
            await expect(ctl.addBlacklist({ ip: '6.6.6.6' }, dept, PermissionScope.DEPARTMENT)).rejects.toThrow(ForbiddenException);
            await expect(ctl.removeBlacklist('6.6.6.6', dept, PermissionScope.DEPARTMENT)).rejects.toThrow(ForbiddenException);
            expect(blacklist.add).not.toHaveBeenCalled();
            expect(blacklist.remove).not.toHaveBeenCalled();
        });

        it('add: IP sai định dạng -> 400', async () => {
            await expect(ctl.addBlacklist({ ip: 'abc def' }, adminReq, PermissionScope.ALL)).rejects.toThrow(BadRequestException);
        });

        it('add: không tự chặn IP hiện tại của chính mình -> 409', async () => {
            await expect(ctl.addBlacklist({ ip: '9.9.9.1' }, adminReq, PermissionScope.ALL)).rejects.toThrow(/IP hiện tại/);
            expect(blacklist.add).not.toHaveBeenCalled();
        });

        it('add: không chặn IP nội bộ/loopback -> 409', async () => {
            for (const ip of ['::1', '127.0.0.1', '192.168.1.5', '10.0.0.8']) {
                await expect(ctl.addBlacklist({ ip }, adminReq, PermissionScope.ALL)).rejects.toThrow(ConflictException);
            }
            expect(blacklist.add).not.toHaveBeenCalled();
        });

        it('add OK: gọi service (null = vĩnh viễn) + audit IP_BLACKLIST_ADDED', async () => {
            blacklist.add.mockResolvedValue({ id: 4, ip: '6.6.6.6', durationHours: 24, removedWhitelist: true });
            const res = await ctl.addBlacklist({ ip: '6.6.6.6', reason: 'dò', durationHours: 24 }, adminReq, PermissionScope.ALL);
            expect(res).toMatchObject({ success: true, ip: '6.6.6.6', durationHours: 24, removedWhitelist: true });
            expect(blacklist.add).toHaveBeenCalledWith('6.6.6.6', 'dò', 24, 1);
            expect(audit.logSecurityEventAsync).toHaveBeenCalledWith(expect.objectContaining({
                userId: 1, action: 'IP_BLACKLIST_ADDED', entityId: 4,
                detail: { bannedIp: '6.6.6.6', reason: 'dò', durationHours: 24, removedWhitelist: true },
            }));
            await ctl.addBlacklist({ ip: '6.6.6.6' }, adminReq, PermissionScope.ALL);
            expect(blacklist.add).toHaveBeenLastCalledWith('6.6.6.6', null, null, 1);
        });

        it('remove: không có dòng -> 404; có -> audit IP_BLACKLIST_REMOVED', async () => {
            blacklist.remove.mockResolvedValueOnce(null);
            await expect(ctl.removeBlacklist('6.6.6.6', adminReq, PermissionScope.ALL)).rejects.toThrow(NotFoundException);
            blacklist.remove.mockResolvedValueOnce({ id: 4, ip: '6.6.6.6' });
            await ctl.removeBlacklist('6.6.6.6', adminReq, PermissionScope.ALL);
            expect(audit.logSecurityEventAsync).toHaveBeenCalledWith(expect.objectContaining({ action: 'IP_BLACKLIST_REMOVED', entityId: 4, detail: { bannedIp: '6.6.6.6' } }));
        });
    });
});
