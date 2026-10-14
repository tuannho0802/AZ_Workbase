import { ConflictException } from '@nestjs/common';
import { IP_WHITELIST_MAX_ENTRIES, LoginIpWhitelistService } from './login-ip-whitelist.service';

describe('LoginIpWhitelistService (P3.5)', () => {
    let repo: { query: jest.Mock };
    let service: LoginIpWhitelistService;

    beforeEach(() => {
        repo = { query: jest.fn() };
        service = new LoginIpWhitelistService(repo as any);
    });

    describe('isWhitelisted', () => {
        it('IP null -> false, không query', async () => {
            expect(await service.isWhitelisted(null)).toBe(false);
            expect(repo.query).not.toHaveBeenCalled();
        });

        it('khớp đúng IP trong bảng; IP khác -> false', async () => {
            repo.query.mockResolvedValue([{ ip: '1.2.3.4' }, { ip: '2001:db8::1' }]);
            expect(await service.isWhitelisted('1.2.3.4')).toBe(true);
            expect(await service.isWhitelisted('2001:db8::1')).toBe(true);
            expect(await service.isWhitelisted('1.2.3.5')).toBe(false);
        });

        it('cache: nhiều lần gọi chỉ query 1 lần; invalidate -> query lại', async () => {
            repo.query.mockResolvedValue([{ ip: '1.2.3.4' }]);
            await service.isWhitelisted('1.2.3.4');
            await service.isWhitelisted('1.2.3.4');
            expect(repo.query).toHaveBeenCalledTimes(1);
            service.invalidate();
            await service.isWhitelisted('1.2.3.4');
            expect(repo.query).toHaveBeenCalledTimes(2);
        });

        it('gọi song song chỉ query 1 lần (inflight)', async () => {
            repo.query.mockResolvedValue([{ ip: '1.2.3.4' }]);
            await Promise.all([service.isWhitelisted('1.2.3.4'), service.isWhitelisted('1.2.3.4'), service.isWhitelisted('5.5.5.5')]);
            expect(repo.query).toHaveBeenCalledTimes(1);
        });

        it('lỗi DB (chưa migrate) -> false (fail-closed, không vô tình bỏ chặn), không ném lỗi', async () => {
            repo.query.mockRejectedValue(new Error("Table 'login_ip_whitelist' doesn't exist"));
            (service as any).logger = { error: jest.fn() };
            await expect(service.isWhitelisted('1.2.3.4')).resolves.toBe(false);
            expect((service as any).logger.error).toHaveBeenCalled();
        });
    });

    describe('add', () => {
        it('IP sai định dạng -> ConflictException, không query', async () => {
            await expect(service.add('abc def', null, 1)).rejects.toThrow(ConflictException);
            expect(repo.query).not.toHaveBeenCalled();
        });

        it('đủ trần -> ConflictException, không INSERT', async () => {
            repo.query.mockResolvedValueOnce([{ c: IP_WHITELIST_MAX_ENTRIES }]);
            await expect(service.add('1.2.3.4', null, 1)).rejects.toThrow(ConflictException);
            expect(repo.query).toHaveBeenCalledTimes(1);
        });

        it('thêm OK: INSERT + xoá dòng login_ip_blocks của IP đó + trả clearedBlock', async () => {
            repo.query
                .mockResolvedValueOnce([{ c: 0 }])
                .mockResolvedValueOnce({ insertId: 11 })
                .mockResolvedValueOnce({ affectedRows: 1 });
            const res = await service.add('1.2.3.4', '  VP  ', 7);
            expect(res).toEqual({ id: 11, ip: '1.2.3.4', clearedBlock: true });
            expect(repo.query.mock.calls[1][1]).toEqual(['1.2.3.4', 'VP', 7]);
            expect(repo.query.mock.calls[2][0]).toContain('DELETE FROM login_ip_blocks');
        });

        it('ghi chú rỗng -> null; ghi chú dài bị cắt 255', async () => {
            repo.query.mockResolvedValue({ insertId: 1, affectedRows: 0 });
            repo.query.mockResolvedValueOnce([{ c: 0 }]);
            await service.add('1.2.3.4', '   ', 1);
            expect(repo.query.mock.calls[1][1][1]).toBeNull();
            repo.query.mockClear();
            repo.query.mockResolvedValue({ insertId: 1, affectedRows: 0 });
            repo.query.mockResolvedValueOnce([{ c: 0 }]);
            await service.add('1.2.3.4', 'x'.repeat(400), 1);
            expect(repo.query.mock.calls[1][1][1]).toHaveLength(255);
        });

        it('trùng IP (ER_DUP_ENTRY) -> ConflictException', async () => {
            repo.query.mockResolvedValueOnce([{ c: 1 }]).mockRejectedValueOnce({ code: 'ER_DUP_ENTRY' });
            await expect(service.add('1.2.3.4', null, 1)).rejects.toThrow(/đã có trong whitelist/);
        });

        it('lỗi khác của INSERT được ném lại nguyên vẹn', async () => {
            const boom = new Error('boom');
            repo.query.mockResolvedValueOnce([{ c: 1 }]).mockRejectedValueOnce(boom);
            await expect(service.add('1.2.3.4', null, 1)).rejects.toBe(boom);
        });

        it('thêm xong thì cache được xoá (isWhitelisted thấy IP mới ngay)', async () => {
            repo.query.mockResolvedValueOnce([]); // lần đầu: rỗng
            expect(await service.isWhitelisted('1.2.3.4')).toBe(false);
            repo.query
                .mockResolvedValueOnce([{ c: 0 }])
                .mockResolvedValueOnce({ insertId: 1 })
                .mockResolvedValueOnce({ affectedRows: 0 })
                .mockResolvedValueOnce([{ ip: '1.2.3.4' }]);
            await service.add('1.2.3.4', null, 1);
            expect(await service.isWhitelisted('1.2.3.4')).toBe(true);
        });
    });

    describe('remove', () => {
        it('IP sai định dạng hoặc không có dòng -> null, không DELETE', async () => {
            expect(await service.remove('abc def')).toBeNull();
            repo.query.mockResolvedValueOnce([]);
            expect(await service.remove('1.2.3.4')).toBeNull();
            expect(repo.query).toHaveBeenCalledTimes(1);
        });

        it('có dòng -> DELETE + xoá cache + trả {id, ip}', async () => {
            repo.query.mockResolvedValueOnce([{ id: 3, ip: '1.2.3.4' }]).mockResolvedValueOnce({ affectedRows: 1 });
            expect(await service.remove('1.2.3.4')).toEqual({ id: 3, ip: '1.2.3.4' });
            expect(repo.query.mock.calls[1][0]).toContain('DELETE FROM login_ip_whitelist');
        });
    });

    describe('list', () => {
        it('map snake_case -> camelCase, ép số', async () => {
            repo.query.mockResolvedValue([{ id: '2', ip: '1.2.3.4', note: null, created_by_name: 'Admin', created_ago_seconds: '90' }]);
            expect(await service.list()).toEqual([{ id: 2, ip: '1.2.3.4', note: null, createdByName: 'Admin', createdAgoSeconds: 90 }]);
        });
    });
});
