import { classifyOutcome, IpAccessLogService } from './ip-access-log.service';
import { NOT_AN_EMAIL_PLACEHOLDER } from './security-audit';

describe('classifyOutcome (P3.6)', () => {
    it('success_hits chỉ là đăng nhập thành công', () => {
        expect(classifyOutcome('success')).toEqual({ success: 1, failed: 0, blocked: 0 });
        expect(classifyOutcome('refresh_ok')).toEqual({ success: 0, failed: 0, blocked: 0 });
        expect(classifyOutcome('ip_locked')).toEqual({ success: 0, failed: 0, blocked: 1 });
        for (const o of ['wrong_password', 'unknown_email', 'account_locked', 'denied', 'refresh_failed'] as const)
            expect(classifyOutcome(o)).toEqual({ success: 0, failed: 1, blocked: 0 });
    });
});

describe('IpAccessLogService.record (P3.6)', () => {
    let repo: { query: jest.Mock };
    let svc: IpAccessLogService;
    const base = { ip: '8.8.8.8', countryCode: 'US', endpoint: 'auth/login' as const, outcome: 'success' as const, ipStatus: 'normal' as const };
    beforeEach(() => {
        repo = { query: jest.fn().mockResolvedValue([]) };
        svc = new IpAccessLogService(repo as any, { get: jest.fn().mockResolvedValue({ ipAccessDetailCapPerHour: 20 }) } as any);
    });
    it('upsert bộ đếm + insert chi tiết có cap', async () => {
        await svc.record(base);
        expect(repo.query).toHaveBeenCalledTimes(2);
        expect(repo.query.mock.calls[0][1]).toEqual(['8.8.8.8', 1, 0, 0, 'success', 'US', 20]);
        expect(repo.query.mock.calls[1][0]).toContain('detail_window_count <= ?');
    });
    it('IP khoá -> blocked_hits + ip_status blocked', async () => {
        await svc.record({ ...base, outcome: 'ip_locked', ipStatus: 'blocked' });
        expect(repo.query.mock.calls[0][1].slice(1, 4)).toEqual([0, 0, 1]);
        expect(repo.query.mock.calls[1][1][4]).toBe('blocked');
    });
    it('email không phải email -> placeholder; UA ≤ 255', async () => {
        await svc.record({ ...base, email: 'MatKhau123!', userAgent: 'x'.repeat(400) });
        const p = repo.query.mock.calls[1][1];
        expect(p[6]).toBe(NOT_AN_EMAIL_PLACEHOLDER);
        expect(p[7]).toHaveLength(255);
    });
    it('IP null -> không ghi; lỗi DB bị nuốt', async () => {
        await svc.record({ ...base, ip: null });
        expect(repo.query).not.toHaveBeenCalled();
        repo.query.mockRejectedValue(new Error('boom'));
        await expect(svc.record(base)).resolves.toBeUndefined();
    });
});
