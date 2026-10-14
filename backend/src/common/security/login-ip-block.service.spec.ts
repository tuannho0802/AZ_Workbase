import { LoginIpBlockService, sanitizeEmailForLog } from './login-ip-block.service';

describe('sanitizeEmailForLog', () => {
    it('chỉ giữ chuỗi đúng dạng email (chữ thường); mật khẩu gõ nhầm vào ô email -> null', () => {
        expect(sanitizeEmailForLog('  User@Example.COM ')).toBe('user@example.com');
        expect(sanitizeEmailForLog('MatKhau@123')).toBeNull(); // không có dấu chấm sau @
        expect(sanitizeEmailForLog('mat khau co cach@a.b')).toBeNull();
        expect(sanitizeEmailForLog('a'.repeat(250) + '@b.co')).toBeNull();
        expect(sanitizeEmailForLog(undefined)).toBeNull();
    });
});

describe('LoginIpBlockService (P3.2/P3.3)', () => {
    const cfg = { maxAttempts: 10, windowMinutes: 10, lockMinutes: 5 };
    let repo: { query: jest.Mock };
    let service: LoginIpBlockService;

    beforeEach(() => {
        repo = { query: jest.fn() };
        service = new LoginIpBlockService(repo as any);
    });

    describe('getRemainingSeconds', () => {
        it('IP null -> 0, không query', async () => {
            expect(await service.getRemainingSeconds(null)).toBe(0);
            expect(repo.query).not.toHaveBeenCalled();
        });
        it('trả số giây còn khoá theo đồng hồ DB', async () => {
            repo.query.mockResolvedValue([{ s: '187' }]);
            expect(await service.getRemainingSeconds('1.2.3.4')).toBe(187);
            expect(repo.query.mock.calls[0][0]).toContain('NOW()');
            expect(repo.query.mock.calls[0][1]).toEqual(['1.2.3.4']);
        });
        it('không có dòng -> 0; lỗi DB -> 0 (fail-open, đăng nhập không sập)', async () => {
            repo.query.mockResolvedValueOnce([]);
            expect(await service.getRemainingSeconds('1.2.3.4')).toBe(0);
            repo.query.mockRejectedValueOnce(new Error('no table'));
            expect(await service.getRemainingSeconds('1.2.3.4')).toBe(0);
        });
    });

    describe('recordFailure', () => {
        it('dùng ĐÚNG 1 câu INSERT ... ON DUPLICATE KEY UPDATE nguyên tử + 1 SELECT, tham số đúng thứ tự', async () => {
            repo.query.mockResolvedValueOnce(undefined).mockResolvedValueOnce([{ a: 3, s: 0 }]);
            const res = await service.recordFailure('1.2.3.4', 'User@Example.com', cfg);

            expect(res).toEqual({ attempts: 3, lockedSeconds: 0 });
            expect(repo.query).toHaveBeenCalledTimes(2);
            const [sql, params] = repo.query.mock.calls[0];
            expect(sql).toMatch(/INSERT INTO login_ip_blocks[\s\S]*ON DUPLICATE KEY UPDATE/);
            // ip, email, window (failed_count), window (window_started_at), max, lock, email
            expect(params).toEqual(['1.2.3.4', 'user@example.com', 10, 10, 10, 5, 'user@example.com']);
        });

        it('thứ tự gán cột: failed_count -> window_started_at -> blocked_until (blocked_until thấy failed_count MỚI)', async () => {
            repo.query.mockResolvedValue([{ a: 1, s: 0 }]);
            await service.recordFailure('1.2.3.4', 'a@b.co', cfg);
            const sql: string = repo.query.mock.calls[0][0];
            const iFail = sql.indexOf('failed_count = CASE');
            const iWin = sql.indexOf('window_started_at = CASE');
            const iBlock = sql.indexOf('blocked_until = CASE');
            expect(iFail).toBeGreaterThan(-1);
            expect(iWin).toBeGreaterThan(iFail);
            expect(iBlock).toBeGreaterThan(iWin);
        });

        it('chạm ngưỡng -> trả lockedSeconds > 0', async () => {
            repo.query.mockResolvedValueOnce(undefined).mockResolvedValueOnce([{ a: 10, s: '300' }]);
            expect(await service.recordFailure('1.2.3.4', 'a@b.co', cfg)).toEqual({ attempts: 10, lockedSeconds: 300 });
        });

        it('email không hợp lệ (nghi là mật khẩu) -> lưu NULL, không lưu chuỗi đó', async () => {
            repo.query.mockResolvedValue([{ a: 1, s: 0 }]);
            await service.recordFailure('1.2.3.4', 'MatKhauBiMat', cfg);
            const params = repo.query.mock.calls[0][1];
            expect(params[1]).toBeNull();
            expect(params[6]).toBeNull();
            expect(JSON.stringify(params)).not.toContain('MatKhauBiMat');
        });

        it('IP null -> không ghi gì', async () => {
            expect(await service.recordFailure(null, 'a@b.co', cfg)).toEqual({ attempts: 0, lockedSeconds: 0 });
            expect(repo.query).not.toHaveBeenCalled();
        });

        it('lỗi DB -> fail-open (attempts 0, không khoá), không ném', async () => {
            repo.query.mockRejectedValue(new Error('boom'));
            expect(await service.recordFailure('1.2.3.4', 'a@b.co', cfg)).toEqual({ attempts: 0, lockedSeconds: 0 });
        });
    });

    describe('list / unblock', () => {
        it('list: map cột snake_case -> camelCase, lockedSeconds không âm', async () => {
            repo.query.mockResolvedValue([
                { id: 1, ip: '1.2.3.4', failed_count: '10', last_email: 'a@b.co', window_started_at: 'w', updated_at: 'u', locked_seconds: '120' },
                { id: 2, ip: '5.6.7.8', failed_count: 3, last_email: null, window_started_at: 'w', updated_at: 'u', locked_seconds: -4 },
            ]);
            const rows = await service.list();
            expect(rows[0]).toMatchObject({ id: 1, ip: '1.2.3.4', failedCount: 10, lastEmail: 'a@b.co', lockedSeconds: 120 });
            expect(rows[1]).toMatchObject({ failedCount: 3, lastEmail: null, lockedSeconds: 0 });
        });

        it('unblock: xoá dòng + trả thông tin để ghi audit; IP không có -> null', async () => {
            repo.query.mockResolvedValueOnce([{ id: 7, ip: '1.2.3.4', failed_count: 10, locked: 1 }]).mockResolvedValueOnce(undefined);
            expect(await service.unblock('::ffff:1.2.3.4')).toEqual({ id: 7, ip: '1.2.3.4', failedCount: 10, wasLocked: true });
            expect(repo.query.mock.calls[1][0]).toContain('DELETE FROM login_ip_blocks');

            repo.query.mockReset();
            repo.query.mockResolvedValueOnce([]);
            expect(await service.unblock('9.9.9.9')).toBeNull();
            expect(repo.query).toHaveBeenCalledTimes(1);
        });

        it('unblock: IP rác -> null, không đụng DB', async () => {
            expect(await service.unblock("1.2.3.4'; DROP TABLE users;--")).toBeNull();
            expect(repo.query).not.toHaveBeenCalled();
        });
    });
});