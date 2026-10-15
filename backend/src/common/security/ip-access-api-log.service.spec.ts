import {
    API_BUCKET_CACHE_MAX,
    API_GEO_RECORD_TTL_MS,
    API_IP_STATUS_TTL_MS,
    ApiHitInput,
    IpAccessApiLogService,
} from './ip-access-api-log.service';

/** Mốc thời gian cố định, đầu 1 phút (để cộng/trừ phút cho dễ). */
const T0 = Date.UTC(2026, 9, 15, 6, 0, 0);

describe('IpAccessApiLogService (P3.6 mục 3.6.2 — log request API gom thùng 1 phút)', () => {
    let repo: { query: jest.Mock };
    let cfg: { get: jest.Mock };
    let geo: { record: jest.Mock };
    let whitelist: { isWhitelisted: jest.Mock };
    let blacklist: { isBanned: jest.Mock };
    let blocks: { getRemainingSeconds: jest.Mock };
    let svc: IpAccessApiLogService;

    const base: ApiHitInput = {
        ip: '8.8.8.8',
        countryCode: 'US',
        userId: 7,
        endpointGroup: 'customers',
        endpoint: 'GET /customers/:id',
        status: 200,
        userAgent: 'Mozilla/5.0',
    };

    const make = () =>
        new IpAccessApiLogService(repo as any, cfg as any, geo as any, whitelist as any, blacklist as any, blocks as any);

    /** Chỉ các câu ghi DB của service (bỏ qua query khác nếu có). */
    const sqlOf = (i: number) => String(repo.query.mock.calls[i][0]);
    const paramsOf = (i: number) => repo.query.mock.calls[i][1] as unknown[];

    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(T0);
        repo = { query: jest.fn().mockResolvedValue([]) };
        cfg = { get: jest.fn().mockResolvedValue({ ipAccessDetailCapPerHour: 20, ipAccessLogApiEnabled: 1 }) };
        geo = { record: jest.fn().mockResolvedValue(undefined) };
        whitelist = { isWhitelisted: jest.fn().mockResolvedValue(false) };
        blacklist = { isBanned: jest.fn().mockResolvedValue(false) };
        blocks = { getRemainingSeconds: jest.fn().mockResolvedValue(0) };
        svc = make();
    });
    afterEach(() => jest.useRealTimers());

    describe('gom thùng', () => {
        it('lần đầu của thùng: 2 câu SQL (bộ đếm + dòng chi tiết); các request cùng thùng KHÔNG chạm DB', async () => {
            await svc.record(base);
            expect(repo.query).toHaveBeenCalledTimes(2);
            expect(sqlOf(0)).toContain('INSERT INTO ip_access_stats');
            expect(sqlOf(1)).toContain('INSERT INTO ip_access_logs');

            for (let i = 0; i < 50; i++) await svc.record(base);
            expect(repo.query).toHaveBeenCalledTimes(2); // vẫn chỉ 2 câu
            expect(cfg.get).toHaveBeenCalledTimes(1);
        });

        it('request song song cùng thùng (trước khi await xong) cũng chỉ ghi 1 lần', async () => {
            await Promise.all(Array.from({ length: 20 }, () => svc.record(base)));
            expect(repo.query).toHaveBeenCalledTimes(2);
        });

        it('khác user / khác nhóm endpoint / khác IP = thùng khác = mỗi thùng ghi riêng', async () => {
            await svc.record(base);
            await svc.record({ ...base, userId: 8 });
            await svc.record({ ...base, endpointGroup: 'users' });
            await svc.record({ ...base, ip: '1.1.1.1' });
            expect(repo.query).toHaveBeenCalledTimes(8);
            expect(svc.bucketCount).toBe(4);
        });

        it('sang phút mới: ghi lại (1 thùng mới)', async () => {
            await svc.record(base);
            jest.setSystemTime(T0 + 60_000);
            await svc.record(base);
            expect(repo.query).toHaveBeenCalledTimes(4);
        });

        it('cùng phút nhưng chưa tới giây 60: vẫn cùng thùng', async () => {
            await svc.record(base);
            jest.setSystemTime(T0 + 59_999);
            await svc.record(base);
            expect(repo.query).toHaveBeenCalledTimes(2);
        });
    });

    describe('ghi dồn số request còn treo khi sang thùng mới', () => {
        it('cộng số treo vào bộ đếm (total_hits/api_hits) và UPDATE dòng của thùng trước', async () => {
            for (let i = 0; i < 5; i++) await svc.record({ ...base, status: i === 4 ? 404 : 200 }); // 1 ghi + 4 treo
            repo.query.mockClear();

            jest.setSystemTime(T0 + 60_000);
            await svc.record(base);

            expect(repo.query).toHaveBeenCalledTimes(3);
            // bộ đếm: 1 (request này) + 4 (treo) cho cả total_hits và api_hits
            expect(paramsOf(0).slice(0, 3)).toEqual(['8.8.8.8', 5, 5]);
            // UPDATE dòng thùng trước: +4, last_status = trạng thái của request treo cuối (404), lùi đúng 1 phút
            expect(sqlOf(2)).toContain('UPDATE ip_access_logs SET hit_count = hit_count + ?');
            expect(paramsOf(2)).toEqual([4, 404, '8.8.8.8', 7, 'customers', 1]);
        });

        it('lùi đúng số phút đã trôi qua (thùng trước cách 3 phút)', async () => {
            await svc.record(base);
            await svc.record(base); // 1 treo
            repo.query.mockClear();
            jest.setSystemTime(T0 + 3 * 60_000 + 5_000);
            await svc.record(base);
            expect(paramsOf(2)[5]).toBe(3);
        });

        it('không có request treo -> KHÔNG có câu UPDATE', async () => {
            await svc.record(base);
            repo.query.mockClear();
            jest.setSystemTime(T0 + 60_000);
            await svc.record(base);
            expect(repo.query).toHaveBeenCalledTimes(2);
            expect(paramsOf(0).slice(0, 3)).toEqual(['8.8.8.8', 1, 1]);
        });

        it('số treo chỉ ghi dồn MỘT lần (thùng mới bắt đầu lại từ 0)', async () => {
            await svc.record(base);
            await svc.record(base); // 1 treo
            jest.setSystemTime(T0 + 60_000);
            await svc.record(base); // ghi dồn 1
            repo.query.mockClear();
            jest.setSystemTime(T0 + 120_000);
            await svc.record(base); // thùng thứ 3: không còn gì treo
            expect(repo.query).toHaveBeenCalledTimes(2);
        });
    });

    describe('công tắc dừng khẩn cấp ip_access_log_api_enabled', () => {
        it('= 0: không ghi gì vào DB', async () => {
            cfg.get.mockResolvedValue({ ipAccessDetailCapPerHour: 20, ipAccessLogApiEnabled: 0 });
            await svc.record(base);
            expect(repo.query).not.toHaveBeenCalled();
            expect(geo.record).not.toHaveBeenCalled();
            expect(blacklist.isBanned).not.toHaveBeenCalled();
        });

        it('= 0: các request cùng thùng cũng không đọc lại cấu hình (rẻ nhất có thể)', async () => {
            cfg.get.mockResolvedValue({ ipAccessDetailCapPerHour: 20, ipAccessLogApiEnabled: 0 });
            for (let i = 0; i < 10; i++) await svc.record(base);
            expect(cfg.get).toHaveBeenCalledTimes(1);
        });

        it('bật lại sang thùng sau -> ghi lại bình thường', async () => {
            cfg.get.mockResolvedValue({ ipAccessDetailCapPerHour: 20, ipAccessLogApiEnabled: 0 });
            await svc.record(base);
            cfg.get.mockResolvedValue({ ipAccessDetailCapPerHour: 20, ipAccessLogApiEnabled: 1 });
            jest.setSystemTime(T0 + 60_000);
            await svc.record(base);
            expect(repo.query).toHaveBeenCalledTimes(2);
        });
    });

    describe('đầu vào không hợp lệ -> bỏ qua, không ném lỗi', () => {
        it.each([
            ['IP null', { ip: null }],
            ['IP rác', { ip: 'không-phải-ip' }],
            ['userId không phải số nguyên', { userId: 1.5 }],
            ['userId NaN', { userId: Number.NaN }],
            ['nhóm endpoint rỗng', { endpointGroup: '' }],
        ])('%s', async (_name, over) => {
            await expect(svc.record({ ...base, ...(over as Partial<ApiHitInput>) })).resolves.toBeUndefined();
            expect(repo.query).not.toHaveBeenCalled();
        });

        it('IP dạng IPv4-mapped được chuẩn hoá về IPv4 (cùng thùng với IPv4 thường)', async () => {
            await svc.record({ ...base, ip: '::ffff:8.8.8.8' });
            await svc.record({ ...base, ip: '8.8.8.8' });
            expect(repo.query).toHaveBeenCalledTimes(2);
            expect(paramsOf(0)[0]).toBe('8.8.8.8');
        });
    });

    describe('tham số SQL', () => {
        it('truyền cap/giờ vào cả câu bộ đếm lẫn câu dòng chi tiết; cap có cửa sổ riêng của API (api_window_*)', async () => {
            cfg.get.mockResolvedValue({ ipAccessDetailCapPerHour: 3, ipAccessLogApiEnabled: 1 });
            await svc.record(base);
            expect(sqlOf(0)).toContain('api_window_count');
            expect(sqlOf(0)).not.toContain('detail_window_count'); // KHÔNG dùng chung cửa sổ của login/refresh
            expect(paramsOf(0)).toEqual(['8.8.8.8', 1, 1, 'US', 3]);
            expect(sqlOf(1)).toContain('api_window_count <= ?');
            expect(paramsOf(1).slice(-2)).toEqual(['8.8.8.8', 3]);
        });

        it('dòng chi tiết: outcome=api, nhóm + route mẫu + user + trạng thái; có ON DUPLICATE KEY cộng hit_count', async () => {
            await svc.record(base);
            const sql = sqlOf(1);
            expect(sql).toContain(`'api'`);
            expect(sql).toContain('ON DUPLICATE KEY UPDATE hit_count = hit_count + 1');
            expect(paramsOf(1)).toEqual(['8.8.8.8', 'US', 'GET /customers/:id', 'customers', 'normal', 7, 'Mozilla/5.0', 200, '8.8.8.8', 20]);
        });

        it('cắt độ dài: endpoint ≤ 80, nhóm ≤ 60, user-agent ≤ 255', async () => {
            await svc.record({ ...base, endpoint: 'GET /' + 'x'.repeat(200), endpointGroup: 'g'.repeat(100), userAgent: 'u'.repeat(400) });
            const p = paramsOf(1);
            expect((p[2] as string).length).toBe(80);
            expect((p[3] as string).length).toBe(60);
            expect((p[6] as string).length).toBe(255);
        });

        it('thiếu user-agent / quốc gia / mã trạng thái -> NULL (không "undefined")', async () => {
            await svc.record({ ...base, userAgent: null, countryCode: null, status: null });
            expect(paramsOf(0)[3]).toBeNull();
            const p = paramsOf(1);
            expect(p[1]).toBeNull();
            expect(p[6]).toBeNull();
            expect(p[7]).toBeNull();
        });

        it('bộ đếm cập nhật theo đồng hồ DB (NOW()), không dùng giờ của server ứng dụng', async () => {
            await svc.record(base);
            expect(sqlOf(0)).toContain('NOW()');
            expect(sqlOf(1)).toContain(`DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:00')`);
        });
    });

    describe('trạng thái IP tại thời điểm ghi (ip_status)', () => {
        it('bình thường -> normal', async () => {
            await svc.record(base);
            expect(paramsOf(1)[4]).toBe('normal');
        });
        it('whitelist -> whitelisted', async () => {
            whitelist.isWhitelisted.mockResolvedValue(true);
            await svc.record(base);
            expect(paramsOf(1)[4]).toBe('whitelisted');
        });
        it('bị Admin chặn chủ động (blacklist) -> blocked, kể cả khi đang nằm trong whitelist', async () => {
            blacklist.isBanned.mockResolvedValue(true);
            whitelist.isWhitelisted.mockResolvedValue(true);
            await svc.record(base);
            expect(paramsOf(1)[4]).toBe('blocked');
        });
        it('đang bị khoá do sai mật khẩu nhiều lần -> blocked', async () => {
            blocks.getRemainingSeconds.mockResolvedValue(120);
            await svc.record(base);
            expect(paramsOf(1)[4]).toBe('blocked');
        });
        it('whitelist thắng khoá bị động (khớp luồng đăng nhập)', async () => {
            blocks.getRemainingSeconds.mockResolvedValue(120);
            whitelist.isWhitelisted.mockResolvedValue(true);
            await svc.record(base);
            expect(paramsOf(1)[4]).toBe('whitelisted');
        });
        it('cache trạng thái IP 60 giây: không tra lại mỗi thùng; hết hạn thì tra lại', async () => {
            await svc.record(base);
            await svc.record({ ...base, endpointGroup: 'users' });
            await svc.record({ ...base, endpointGroup: 'leave-requests' });
            expect(blacklist.isBanned).toHaveBeenCalledTimes(1);

            jest.setSystemTime(T0 + API_IP_STATUS_TTL_MS + 1_000);
            await svc.record({ ...base, endpointGroup: 'guides' });
            expect(blacklist.isBanned).toHaveBeenCalledTimes(2);
        });
    });

    describe('cờ quốc gia (ip_geo_cache)', () => {
        it('ghi cờ 1 lần/IP trong 10 phút dù nhiều thùng; sau 10 phút ghi lại', async () => {
            await svc.record(base);
            await svc.record({ ...base, endpointGroup: 'users' });
            expect(geo.record).toHaveBeenCalledTimes(1);
            expect(geo.record).toHaveBeenCalledWith('8.8.8.8', 'US');

            jest.setSystemTime(T0 + API_GEO_RECORD_TTL_MS + 1_000);
            await svc.record({ ...base, endpointGroup: 'guides' });
            expect(geo.record).toHaveBeenCalledTimes(2);
        });
        it('IP khác nhau ghi riêng', async () => {
            await svc.record(base);
            await svc.record({ ...base, ip: '1.1.1.1', countryCode: 'VN' });
            expect(geo.record).toHaveBeenCalledTimes(2);
        });
    });

    describe('lỗi ghi log KHÔNG BAO GIỜ làm hỏng request', () => {
        it('lỗi DB ở câu bộ đếm -> nuốt, resolve undefined, không ném', async () => {
            repo.query.mockRejectedValue(new Error('boom'));
            await expect(svc.record(base)).resolves.toBeUndefined();
        });
        it('lỗi đọc cấu hình / tra whitelist -> nuốt', async () => {
            cfg.get.mockRejectedValue(new Error('cfg down'));
            await expect(svc.record(base)).resolves.toBeUndefined();
            blacklist.isBanned.mockRejectedValue(new Error('x'));
            cfg.get.mockResolvedValue({ ipAccessDetailCapPerHour: 20, ipAccessLogApiEnabled: 1 });
            await expect(svc.record({ ...base, endpointGroup: 'users' })).resolves.toBeUndefined();
        });
        it('lỗi ghi cờ quốc gia -> nuốt', async () => {
            geo.record.mockRejectedValue(new Error('geo'));
            await expect(svc.record(base)).resolves.toBeUndefined();
        });
        it('sau 1 lỗi DB, request cùng thùng KHÔNG thử ghi lại dồn dập (tránh bão query khi DB đang chết)', async () => {
            repo.query.mockRejectedValue(new Error('boom'));
            await svc.record(base);
            const calls = repo.query.mock.calls.length;
            for (let i = 0; i < 20; i++) await svc.record(base);
            expect(repo.query.mock.calls.length).toBe(calls);
        });
    });

    describe('giới hạn bộ nhớ của 1 instance', () => {
        it(`số khoá thùng không vượt ${API_BUCKET_CACHE_MAX} dù có rất nhiều (user × nhóm) khác nhau`, async () => {
            for (let i = 0; i < API_BUCKET_CACHE_MAX + 300; i++) {
                await svc.record({ ...base, userId: i + 1 });
            }
            expect(svc.bucketCount).toBeLessThanOrEqual(API_BUCKET_CACHE_MAX);
            expect(svc.bucketCount).toBeGreaterThan(0);
        });

        it('khi đầy: dọn trước các thùng đã cũ (≥ 2 phút), giữ thùng hiện tại', async () => {
            for (let i = 0; i < API_BUCKET_CACHE_MAX; i++) await svc.record({ ...base, userId: i + 1 });
            expect(svc.bucketCount).toBe(API_BUCKET_CACHE_MAX);

            jest.setSystemTime(T0 + 3 * 60_000);
            await svc.record({ ...base, userId: 999_999 });
            expect(svc.bucketCount).toBe(1); // 5000 thùng cũ bị dọn, còn đúng thùng mới
        });
    });
});
