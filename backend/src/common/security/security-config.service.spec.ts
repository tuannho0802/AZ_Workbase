import { SecurityConfigService, SECURITY_CONFIG_DEFAULTS, SECURITY_CONFIG_CACHE_TTL_MS, clampSecurityValue } from './security-config.service';

describe('SecurityConfigService (P3.1)', () => {
    const row = (over: Record<string, unknown> = {}) => ({ id: 1, ...SECURITY_CONFIG_DEFAULTS, ...over });
    let repo: { findOne: jest.Mock };
    let service: SecurityConfigService;

    beforeEach(() => {
        jest.useFakeTimers();
        repo = { findOne: jest.fn().mockResolvedValue(row()) };
        service = new SecurityConfigService(repo as any);
    });
    afterEach(() => jest.useRealTimers());

    it('mặc định khớp plan: 5/5 tài khoản, 10 lần/10 phút/khoá 5 phút theo IP, giữ sự kiện 180 ngày', async () => {
        expect(await service.get()).toEqual({
            accountMaxFailedAttempts: 5, accountLockMinutes: 5, ipMaxFailedAttempts: 10,
            ipWindowMinutes: 10, ipLockMinutes: 5, securityEventRetentionDays: 180,
        });
    });

    it('đọc giá trị tuỳ chỉnh trong khoảng hợp lệ', async () => {
        repo.findOne.mockResolvedValue(row({ ipMaxFailedAttempts: 20, ipLockMinutes: 30 }));
        const cfg = await service.get();
        expect(cfg.ipMaxFailedAttempts).toBe(20);
        expect(cfg.ipLockMinutes).toBe(30);
    });

    it('cache ~30 giây: không query lại trong hạn, query lại sau hạn -> sửa DB có hiệu lực ≤ 30s', async () => {
        await service.get();
        await service.get();
        expect(repo.findOne).toHaveBeenCalledTimes(1);

        repo.findOne.mockResolvedValue(row({ ipMaxFailedAttempts: 50 }));
        jest.advanceTimersByTime(SECURITY_CONFIG_CACHE_TTL_MS - 1);
        expect((await service.get()).ipMaxFailedAttempts).toBe(10); // vẫn cache cũ

        jest.advanceTimersByTime(2);
        expect((await service.get()).ipMaxFailedAttempts).toBe(50); // đã hết hạn -> đọc lại
        expect(repo.findOne).toHaveBeenCalledTimes(2);
    });

    it('nhiều lời gọi song song chỉ tạo 1 query', async () => {
        await Promise.all([service.get(), service.get(), service.get()]);
        expect(repo.findOne).toHaveBeenCalledTimes(1);
    });

    it('giá trị ngoài khoảng (0, âm, quá lớn, NaN, chuỗi rác) bị kẹp về mặc định - KHÔNG tắt bảo vệ', async () => {
        repo.findOne.mockResolvedValue(
            row({ accountMaxFailedAttempts: 0, ipMaxFailedAttempts: 1, ipWindowMinutes: -5, ipLockMinutes: 99999, accountLockMinutes: 'abc', securityEventRetentionDays: 1 }),
        );
        const cfg = await service.get();
        expect(cfg).toEqual({ ...SECURITY_CONFIG_DEFAULTS });
    });

    it('chỉ kẹp giá trị sai, giữ nguyên giá trị đúng cùng dòng', async () => {
        repo.findOne.mockResolvedValue(row({ accountMaxFailedAttempts: 0, ipMaxFailedAttempts: 25 }));
        const cfg = await service.get();
        expect(cfg.accountMaxFailedAttempts).toBe(5);
        expect(cfg.ipMaxFailedAttempts).toBe(25);
    });

    it('thiếu dòng id=1 hoặc lỗi DB (chưa migrate) -> mặc định, KHÔNG ném lỗi', async () => {
        repo.findOne.mockResolvedValue(null);
        expect(await service.get()).toEqual({ ...SECURITY_CONFIG_DEFAULTS });

        service.invalidate();
        repo.findOne.mockRejectedValue(new Error("Table 'security_config' doesn't exist"));
        expect(await service.get()).toEqual({ ...SECURITY_CONFIG_DEFAULTS });
    });

    it('clampSecurityValue: chấp nhận chuỗi số (MySQL trả BIGINT dạng chuỗi), từ chối số thập phân', () => {
        expect(clampSecurityValue('ipMaxFailedAttempts', '15')).toEqual({ value: 15, clamped: false });
        expect(clampSecurityValue('ipMaxFailedAttempts', 12.5).clamped).toBe(true);
        expect(clampSecurityValue('securityEventRetentionDays', 30).clamped).toBe(false);
        expect(clampSecurityValue('securityEventRetentionDays', 29).clamped).toBe(true);
    });
});