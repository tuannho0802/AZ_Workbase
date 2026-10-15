import { ConflictException } from '@nestjs/common';
import { IP_BLACKLIST_MAX_ENTRIES, LoginIpBlacklistService } from './login-ip-blacklist.service';

describe('LoginIpBlacklistService (P3.7)', () => {
    let repo: { query: jest.Mock };
    let service: LoginIpBlacklistService;

    beforeEach(() => {
        repo = { query: jest.fn() };
        service = new LoginIpBlacklistService(repo as any);
    });

    describe('isBanned', () => {
        it('IP null -> false, không query', async () => {
            expect(await service.isBanned(null)).toBe(false);
            expect(repo.query).not.toHaveBeenCalled();
        });

        it('vĩnh viễn (remaining null) -> bị chặn; IP khác -> false', async () => {
            repo.query.mockResolvedValue([{ ip: '1.2.3.4', remaining: null }]);
            expect(await service.isBanned('1.2.3.4')).toBe(true);
            expect(await service.isBanned('1.2.3.5')).toBe(false);
        });

        it('có hạn còn hiệu lực -> bị chặn; hết hạn giữa 2 lần refresh cache -> cho qua', async () => {
            repo.query.mockResolvedValue([{ ip: '1.2.3.4', remaining: 100 }]);
            const now = Date.now();
            const spy = jest.spyOn(Date, 'now').mockReturnValue(now);
            expect(await service.isBanned('1.2.3.4')).toBe(true);
            spy.mockReturnValue(now + 101_000); // quá hạn nhưng cache (15s) đã... vẫn đọc hạn riêng từng IP
            expect((service as any).cache.expiresAt).toBeLessThan(now + 101_000);
            repo.query.mockResolvedValue([]); // lần đọc lại: DB đã không còn dòng hiệu lực
            expect(await service.isBanned('1.2.3.4')).toBe(false);
            spy.mockRestore();
        });

        it('cache: nhiều lần gọi chỉ query 1 lần; invalidate -> query lại', async () => {
            repo.query.mockResolvedValue([{ ip: '1.2.3.4', remaining: null }]);
            await service.isBanned('1.2.3.4');
            await service.isBanned('1.2.3.4');
            expect(repo.query).toHaveBeenCalledTimes(1);
            service.invalidate();
            await service.isBanned('1.2.3.4');
            expect(repo.query).toHaveBeenCalledTimes(2);
        });

        it('lỗi DB (chưa migrate) -> FAIL-OPEN (không IP nào bị chặn), không ném lỗi, có log', async () => {
            repo.query.mockRejectedValue(new Error("Table 'login_ip_blacklist' doesn't exist"));
            (service as any).logger = { error: jest.fn() };
            await expect(service.isBanned('1.2.3.4')).resolves.toBe(false);
            expect((service as any).logger.error).toHaveBeenCalled();
        });
    });

    describe('add', () => {
        it('IP sai định dạng -> ConflictException, không query', async () => {
            await expect(service.add('abc def', null, 24, 1)).rejects.toThrow(ConflictException);
            expect(repo.query).not.toHaveBeenCalled();
        });

        it('đủ trần -> ConflictException, không INSERT', async () => {
            repo.query.mockResolvedValueOnce([{ c: IP_BLACKLIST_MAX_ENTRIES }]);
            await expect(service.add('1.2.3.4', null, 24, 1)).rejects.toThrow(ConflictException);
            expect(repo.query).toHaveBeenCalledTimes(1);
        });

        it('có hạn: INSERT kèm số giờ, gỡ whitelist + khoá bị động, trả removedWhitelist', async () => {
            repo.query
                .mockResolvedValueOnce([{ c: 0 }])
                .mockResolvedValueOnce({ insertId: 5 })
                .mockResolvedValueOnce({ affectedRows: 1 }) // whitelist
                .mockResolvedValueOnce({ affectedRows: 0 }) // login_ip_blocks
                .mockResolvedValueOnce([{ id: 5 }]);
            const res = await service.add('1.2.3.4', '  dò mật khẩu ', 24, 7);
            expect(res).toEqual({ id: 5, ip: '1.2.3.4', durationHours: 24, removedWhitelist: true });
            expect(repo.query.mock.calls[1][0]).toContain('DATE_ADD(NOW(), INTERVAL ? HOUR)');
            expect(repo.query.mock.calls[1][1]).toEqual(['1.2.3.4', 'dò mật khẩu', 24, 7]);
            expect(repo.query.mock.calls[2][0]).toContain('DELETE FROM login_ip_whitelist');
            expect(repo.query.mock.calls[3][0]).toContain('DELETE FROM login_ip_blocks');
        });

        it('vĩnh viễn (null/undefined) -> expires_at NULL, durationHours null', async () => {
            repo.query.mockResolvedValue({ affectedRows: 0, insertId: 2 });
            repo.query.mockResolvedValueOnce([{ c: 0 }]);
            const res = await service.add('1.2.3.4', null, null, 7);
            expect(res.durationHours).toBeNull();
            expect(repo.query.mock.calls[1][0]).toContain('VALUES (?, ?, NULL, ?)');
            expect(repo.query.mock.calls[1][1]).toEqual(['1.2.3.4', null, 7]);
        });

        it('số giờ bị kẹp 1..8760; lý do dài bị cắt 255', async () => {
            repo.query.mockResolvedValue({ affectedRows: 0, insertId: 2 });
            repo.query.mockResolvedValueOnce([{ c: 0 }]);
            expect((await service.add('1.2.3.4', 'x'.repeat(400), 999999, 1)).durationHours).toBe(8760);
            expect(repo.query.mock.calls[1][1][1]).toHaveLength(255);
        });

        it('thêm xong thì cache được xoá (isBanned thấy IP mới ngay)', async () => {
            repo.query.mockResolvedValueOnce([]);
            expect(await service.isBanned('1.2.3.4')).toBe(false);
            repo.query
                .mockResolvedValueOnce([{ c: 0 }])
                .mockResolvedValueOnce({ insertId: 1 })
                .mockResolvedValueOnce({ affectedRows: 0 })
                .mockResolvedValueOnce({ affectedRows: 0 })
                .mockResolvedValueOnce([{ id: 1 }])
                .mockResolvedValueOnce([{ ip: '1.2.3.4', remaining: null }]);
            await service.add('1.2.3.4', null, null, 1);
            expect(await service.isBanned('1.2.3.4')).toBe(true);
        });
    });

    describe('remove', () => {
        it('IP sai định dạng hoặc không có dòng -> null, không DELETE', async () => {
            expect(await service.remove('abc def')).toBeNull();
            repo.query.mockResolvedValueOnce([]);
            expect(await service.remove('1.2.3.4')).toBeNull();
            expect(repo.query).toHaveBeenCalledTimes(1);
        });

        it('có dòng -> DELETE + trả {id, ip}', async () => {
            repo.query.mockResolvedValueOnce([{ id: 3, ip: '1.2.3.4' }]).mockResolvedValueOnce({ affectedRows: 1 });
            expect(await service.remove('1.2.3.4')).toEqual({ id: 3, ip: '1.2.3.4' });
            expect(repo.query.mock.calls[1][0]).toContain('DELETE FROM login_ip_blacklist');
        });
    });

    describe('list', () => {
        it('dọn dòng hết hạn quá 30 ngày, map snake_case -> camelCase; vĩnh viễn -> remainingSeconds null', async () => {
            repo.query.mockResolvedValueOnce({ affectedRows: 0 }).mockResolvedValueOnce([
                { id: '2', ip: '1.2.3.4', reason: null, created_by_name: 'Admin', remaining_seconds: null, created_ago_seconds: '30' },
                { id: '1', ip: '5.6.7.8', reason: 'x', created_by_name: null, remaining_seconds: '3600', created_ago_seconds: '-1' },
            ]);
            const rows = await service.list();
            expect(repo.query.mock.calls[0][0]).toContain('DELETE FROM login_ip_blacklist');
            expect(rows[0]).toEqual({ id: 2, ip: '1.2.3.4', reason: null, createdByName: 'Admin', remainingSeconds: null, createdAgoSeconds: 30 });
            expect(rows[1].remainingSeconds).toBe(3600);
            expect(rows[1].createdAgoSeconds).toBe(0);
        });
    });
});
