import { classifyOutcome, IpAccessLogService, vnDayBoundUtc } from './ip-access-log.service';
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

describe('IpAccessLogService.list / detail (P3.6 + 3.6.2: có request API)', () => {
    let repo: { query: jest.Mock };
    let svc: IpAccessLogService;
    beforeEach(() => {
        repo = { query: jest.fn() };
        svc = new IpAccessLogService(repo as any, { get: jest.fn().mockResolvedValue({ ipAccessDetailCapPerHour: 20 }) } as any);
    });

    const statsRow = (over: Record<string, unknown> = {}) => ({
        total_hits: 120, success_hits: 2, failed_hits: 3, blocked_hits: 0, suppressed_hits: 4, api_hits: 115,
        first_ago: 3600, last_ago: 5, blocked: 0, whitelisted: 0, banned: 0, ...over,
    });

    it('list: SELECT có api_hits và trả apiHits (số), mặc định 0 khi DB trả null', async () => {
        repo.query
            .mockResolvedValueOnce([{ total: 2 }])
            .mockResolvedValueOnce([
                { ip: '8.8.8.8', totalHits: 120, successHits: 2, failedHits: 3, blockedHits: 0, suppressedHits: 4, apiHits: '115', lastOutcome: 'api', lastCountryCode: 'US', firstSeenAgoSeconds: 10, lastSeenAgoSeconds: 1, blocked: 0, whitelisted: 0, banned: 0 },
                { ip: '1.1.1.1', totalHits: 1, successHits: 0, failedHits: 1, blockedHits: 0, suppressedHits: 0, apiHits: null, lastOutcome: 'wrong_password', lastCountryCode: null, firstSeenAgoSeconds: 10, lastSeenAgoSeconds: 1, blocked: 0, whitelisted: 0, banned: 0 },
            ]);
        const res = await svc.list({ page: 1, limit: 20 });
        expect(String(repo.query.mock.calls[1][0])).toContain('s.api_hits AS apiHits');
        expect(res.items[0].apiHits).toBe(115);
        expect(res.items[0].lastOutcome).toBe('api');
        expect(res.items[1].apiHits).toBe(0);
    });

    it('detail: trả apiHits ở summary; mỗi dòng log có endpointGroup / hitCount / lastStatus (dòng login: nhóm null, hitCount 1)', async () => {
        repo.query
            .mockResolvedValueOnce([statsRow()])
            .mockResolvedValueOnce([{ total: 2 }])
            .mockResolvedValueOnce([
                { id: '9', endpoint: 'GET /customers/:id', endpointGroup: 'customers', hitCount: '42', lastStatus: '200', outcome: 'api', ipStatus: 'normal', userId: 7, userName: 'Sales A', email: null, userAgent: 'ua', agoSeconds: 30 },
                { id: '8', endpoint: 'auth/login', endpointGroup: null, hitCount: null, lastStatus: null, outcome: 'wrong_password', ipStatus: 'normal', userId: null, userName: null, email: 'a@b.c', userAgent: null, agoSeconds: 90 },
            ]);
        const res = await svc.detail('8.8.8.8', { page: 1, limit: 20 });
        expect(res!.summary.apiHits).toBe(115);
        expect(String(repo.query.mock.calls[2][0])).toContain('l.endpoint_group AS endpointGroup');
        expect(String(repo.query.mock.calls[2][0])).toContain('l.hit_count AS hitCount');
        expect(res!.logs[0]).toMatchObject({ id: '9', endpointGroup: 'customers', hitCount: 42, lastStatus: 200, outcome: 'api' });
        expect(res!.logs[1]).toMatchObject({ endpointGroup: null, hitCount: 1, lastStatus: null, outcome: 'wrong_password' });
    });

    it('detail: lọc outcome=api đi vào câu WHERE bằng tham số (không ghép chuỗi)', async () => {
        repo.query.mockResolvedValueOnce([statsRow()]).mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([]);
        await svc.detail('8.8.8.8', { page: 2, limit: 10, outcome: 'api' });
        const countCall = repo.query.mock.calls[1];
        expect(String(countCall[0])).toContain('l.outcome = ?');
        expect(String(countCall[0])).not.toContain("'api'");
        expect(countCall[1]).toEqual(['8.8.8.8', 'api']);
        expect(repo.query.mock.calls[2][1].slice(-2)).toEqual([10, 10]); // limit, offset (trang 2)
    });

    it('detail: IP chưa từng thấy -> null; IP không hợp lệ -> null (không query)', async () => {
        repo.query.mockResolvedValueOnce([]);
        expect(await svc.detail('9.9.9.9', { page: 1, limit: 20 })).toBeNull();
        repo.query.mockClear();
        expect(await svc.detail('không-phải-ip', { page: 1, limit: 20 })).toBeNull();
        expect(repo.query).not.toHaveBeenCalled();
    });

    it('detail: summary DB cũ chưa có api_hits (undefined) -> 0', async () => {
        const row: Record<string, unknown> = statsRow();
        delete row.api_hits;
        repo.query.mockResolvedValueOnce([row]).mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([]);
        expect((await svc.detail('8.8.8.8', { page: 1, limit: 20 }))!.summary.apiHits).toBe(0);
    });

    describe('lọc theo khoảng thời gian (ngày VN)', () => {
        it('vnDayBoundUtc: ngày VN -> mốc UTC (lùi 7h), biên cuối là 00:00 ngày kế tiếp', () => {
            expect(vnDayBoundUtc('2026-10-12', false)).toBe('2026-10-11 17:00:00');
            expect(vnDayBoundUtc('2026-10-18', true)).toBe('2026-10-18 17:00:00');
        });

        it('list có from/to: chỉ quét ip_access_logs trong khoảng (tham số hoá), không đọc toàn bảng stats làm nguồn đếm', async () => {
            repo.query
                .mockResolvedValueOnce([{ total: 1 }])
                .mockResolvedValueOnce([
                    { ip: '8.8.8.8', totalHits: '12', successHits: '1', failedHits: '2', blockedHits: '0', apiHits: '9', lastOutcome: 'api', lastCountryCode: 'US', firstSeenAgoSeconds: 100, lastSeenAgoSeconds: 5, blocked: 0, whitelisted: 0, banned: 0 },
                ]);
            const res = await svc.list({ page: 2, limit: 10, from: '2026-10-12', to: '2026-10-18', search: '8.8' });
            const [countSql, countParams] = repo.query.mock.calls[0];
            const [listSql, listParams] = repo.query.mock.calls[1];
            expect(String(countSql)).toContain('l.created_at >= ? AND l.created_at < ?');
            expect(String(listSql)).toContain('FROM ip_access_logs l WHERE');
            expect(countParams).toEqual(['2026-10-11 17:00:00', '2026-10-18 17:00:00', '%8.8%']);
            expect(listParams).toEqual(['2026-10-11 17:00:00', '2026-10-18 17:00:00', '%8.8%', 10, 10]);
            expect(res.total).toBe(1);
            expect(res.items[0]).toMatchObject({ ip: '8.8.8.8', totalHits: 12, successHits: 1, failedHits: 2, apiHits: 9, suppressedHits: 0, lastOutcome: 'api', currentStatus: 'normal' });
        });

        it('list có from/to + status=banned: điều kiện trạng thái nằm ở truy vấn ngoài', async () => {
            repo.query.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([]);
            await svc.list({ page: 1, limit: 20, status: 'banned', from: '2026-10-12', to: '2026-10-12' });
            expect(String(repo.query.mock.calls[0][0])).toContain('bl.id IS NOT NULL');
        });

        it('list không from/to: giữ hành vi cũ (đọc ip_access_stats)', async () => {
            repo.query.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([]);
            await svc.list({ page: 1, limit: 20 });
            expect(String(repo.query.mock.calls[1][0])).toContain('FROM ip_access_stats s');
        });

        it('detail: from/to quy ngày VN sang UTC, biên cuối nửa mở', async () => {
            repo.query
                .mockResolvedValueOnce([statsRow()])
                .mockResolvedValueOnce([{ total: 0 }])
                .mockResolvedValueOnce([]);
            await svc.detail('8.8.8.8', { page: 1, limit: 20, from: '2026-10-12', to: '2026-10-18' });
            const params = repo.query.mock.calls[1][1];
            expect(params).toEqual(['8.8.8.8', '2026-10-11 17:00:00', '2026-10-18 17:00:00']);
            expect(String(repo.query.mock.calls[1][0])).toContain('l.created_at < ?');
        });
    });
});
