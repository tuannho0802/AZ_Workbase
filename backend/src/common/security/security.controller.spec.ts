import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SecurityController } from './security.controller';
import { Role } from '../../common/enums/role.enum';
import { PermissionScope } from '../../database/entities/role-permission.entity';

describe('SecurityController (P3.3)', () => {
    let ipBlocks: { list: jest.Mock; unblock: jest.Mock };
    let config: { get: jest.Mock };
    let audit: { logActionAsync: jest.Mock };
    let ctl: SecurityController;
    const admin = { user: { id: 1, role: Role.ADMIN } };
    const dept = { user: { id: 2, role: 'manager' } };

    beforeEach(() => {
        ipBlocks = { list: jest.fn().mockResolvedValue([{ ip: '1.2.3.4' }]), unblock: jest.fn() };
        config = { get: jest.fn().mockResolvedValue({ ipMaxFailedAttempts: 10, ipWindowMinutes: 10, ipLockMinutes: 5, accountLockMinutes: 5 }) };
        audit = { logActionAsync: jest.fn() };
        ctl = new SecurityController(ipBlocks as any, config as any, audit as any);
    });

    it('list: admin xem được, kèm ngưỡng cấu hình', async () => {
        const res = await ctl.list(admin, PermissionScope.ALL);
        expect(res.items).toEqual([{ ip: '1.2.3.4' }]);
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
        await expect(ctl.list({ user: { id: 3, role: 'team_lead' } }, PermissionScope.ALL)).resolves.toBeDefined();
    });

    it('unblock: xoá + ghi audit UNBLOCK_LOGIN_IP', async () => {
        ipBlocks.unblock.mockResolvedValue({ id: 7, ip: '1.2.3.4', failedCount: 10, wasLocked: true });
        const res = await ctl.unblock('1.2.3.4', admin, PermissionScope.ALL);
        expect(res.success).toBe(true);
        expect(audit.logActionAsync).toHaveBeenCalledWith(1, 'UNBLOCK_LOGIN_IP', 'security', 7, null, {
            ip: '1.2.3.4', failedCount: 10, wasLocked: true,
        });
    });

    it('unblock: IP không có bản ghi -> 404, không audit', async () => {
        ipBlocks.unblock.mockResolvedValue(null);
        await expect(ctl.unblock('1.2.3.4', admin, PermissionScope.ALL)).rejects.toThrow(NotFoundException);
        expect(audit.logActionAsync).not.toHaveBeenCalled();
    });

    it('unblock: IP sai định dạng -> 400, không đụng DB', async () => {
        await expect(ctl.unblock('abc def', admin, PermissionScope.ALL)).rejects.toThrow(BadRequestException);
        expect(ipBlocks.unblock).not.toHaveBeenCalled();
    });
});