import {
  classifyTable,
  HEALTH_CRON_OVERDUE_GRACE_DAYS,
  HEALTH_OTHER_WARN_ROWS,
  HEALTH_TABLES_CACHE_TTL_MS,
  HEALTH_WATCHED_WARN_BYTES,
  HEALTH_WATCHED_WARN_ROWS,
  SystemHealthService,
} from './system-health.service';
import { addRefreshSession } from '../../common/utils/refresh-session-store.util';
import { clearCacheProbesForTest, registerCacheProbe } from '../../common/utils/cache-probe-registry';

const nowS = () => Math.floor(Date.now() / 1000);

type Row = Record<string, unknown>;

function make(opts: {
  query?: (sql: string) => Promise<Row[]>;
  intervalDays?: number;
  schedule?: { lastRun: null | { status: string; affected: number; message: string | null; ageSeconds: number }; nextDueInSeconds: number; dueNow: boolean };
  retentionThrows?: boolean;
} = {}) {
  const query = jest.fn(
    opts.query ??
      (async (sql: string) => {
        if (/VERSION\(\)/.test(sql)) return [{ v: '8.0.36' }];
        if (/information_schema/.test(sql))
          return [
            { name: 'customers', table_rows: 1000, data_length: 1000, index_length: 500 },
            { name: 'audit_logs', table_rows: HEALTH_WATCHED_WARN_ROWS, data_length: 10, index_length: 10 },
          ];
        if (/hashed_refresh_token/.test(sql)) return [];
        if (/login_ip_blocks/.test(sql)) return [{ n: '2' }];
        if (/login_ip_blacklist/.test(sql)) return [{ n: 1 }];
        return [];
      }),
  );
  const retention = {
    getSettings: opts.retentionThrows ? jest.fn().mockRejectedValue(new Error('boom')) : jest.fn().mockResolvedValue({ intervalDays: opts.intervalDays ?? 30 }),
    getSchedule: jest.fn().mockResolvedValue(opts.schedule ?? { lastRun: { status: 'success', affected: 5, message: null, ageSeconds: 3600 }, nextDueInSeconds: 1000, dueNow: false }),
  };
  const svc = new SystemHealthService({ query } as never, retention as never);
  return { svc, query, retention };
}

describe('classifyTable', () => {
  it('bảng log theo dõi dùng ngưỡng thấp hơn bảng thường', () => {
    expect(classifyTable('audit_logs', HEALTH_WATCHED_WARN_ROWS, 0).warn).toBe(true);
    expect(classifyTable('audit_logs', HEALTH_WATCHED_WARN_ROWS - 1, HEALTH_WATCHED_WARN_BYTES - 1).warn).toBe(false);
    expect(classifyTable('audit_logs', 1, HEALTH_WATCHED_WARN_BYTES).warn).toBe(true);
    // cùng số dòng nhưng bảng thường -> chưa cảnh báo
    expect(classifyTable('customers', HEALTH_WATCHED_WARN_ROWS, 0).warn).toBe(false);
    expect(classifyTable('customers', HEALTH_OTHER_WARN_ROWS, 0).warn).toBe(true);
  });

  it('không trả số âm', () => {
    expect(classifyTable('x', -5, -10)).toMatchObject({ rowsEstimate: 0, sizeBytes: 0 });
  });
});

describe('SystemHealthService.getHealth', () => {
  beforeEach(() => clearCacheProbesForTest());

  it('gom đủ các phần, bảng cảnh báo lên đầu và tính tổng dung lượng', async () => {
    const { svc } = make();
    const h = await svc.getHealth();
    expect(h.database).toMatchObject({ error: false, ok: true, serverVersion: '8.0.36' });
    if (h.tables.error) throw new Error('tables lỗi');
    expect(h.tables.items.map((i) => i.name)).toEqual(['audit_logs', 'customers']);
    expect(h.tables.warnCount).toBe(1);
    expect(h.tables.totalBytes).toBe(1520);
    expect(h.tables.items[0]).toMatchObject({ watched: true, warn: true });
    expect(h.security).toMatchObject({ error: false, activeIpLocks: 2, activeIpBans: 1 });
    expect(Number.isNaN(Date.parse(h.generatedAt))).toBe(false);
  });

  it('cache bảng 5 phút: lần 2 không truy vấn lại information_schema', async () => {
    const { svc, query } = make();
    await svc.getHealth();
    const h2 = await svc.getHealth();
    const calls = query.mock.calls.filter((c) => /information_schema/.test(String(c[0]))).length;
    expect(calls).toBe(1);
    if (h2.tables.error) throw new Error('tables lỗi');
    expect(h2.tables.fromCache).toBe(true);
  });

  it('fresh=true vẫn dùng cache nếu cache mới hơn 30 giây (chống bấm dồn)', async () => {
    const { svc, query } = make();
    await svc.getHealth();
    await svc.getHealth({ fresh: true });
    expect(query.mock.calls.filter((c) => /information_schema/.test(String(c[0]))).length).toBe(1);
  });

  it('fresh=true truy vấn lại khi cache đã cũ hơn 30 giây; không fresh thì chờ hết 5 phút', async () => {
    const spy = jest.spyOn(Date, 'now');
    const t0 = 1_700_000_000_000;
    spy.mockReturnValue(t0);
    const { svc, query } = make();
    await svc.getHealth();
    spy.mockReturnValue(t0 + 60_000);
    await svc.getHealth(); // chưa tới 5 phút, không fresh -> cache
    expect(query.mock.calls.filter((c) => /information_schema/.test(String(c[0]))).length).toBe(1);
    await svc.getHealth({ fresh: true }); // đã > 30 giây -> truy vấn lại
    expect(query.mock.calls.filter((c) => /information_schema/.test(String(c[0]))).length).toBe(2);
    spy.mockReturnValue(t0 + 60_000 + HEALTH_TABLES_CACHE_TTL_MS + 1);
    await svc.getHealth(); // hết 5 phút -> truy vấn lại
    expect(query.mock.calls.filter((c) => /information_schema/.test(String(c[0]))).length).toBe(3);
    spy.mockRestore();
  });

  it('1 phần lỗi chỉ làm phần đó { error: true }, các phần khác vẫn trả', async () => {
    const { svc } = make({
      query: async (sql: string) => {
        if (/information_schema/.test(sql)) throw new Error('chậm/timeout');
        if (/VERSION\(\)/.test(sql)) return [{ v: '8' }];
        return [{ n: 0 }];
      },
    });
    const h = await svc.getHealth();
    expect(h.tables).toEqual({ error: true });
    expect(h.database).toMatchObject({ error: false });
    expect(h.cron).toMatchObject({ error: false });
  });

  it('lỗi chi tiết (message) KHÔNG lọt ra response', async () => {
    const { svc } = make({ retentionThrows: true });
    const h = await svc.getHealth();
    expect(h.cron).toEqual({ error: true });
    expect(JSON.stringify(h)).not.toContain('boom');
  });

  describe('cron', () => {
    const last = (status: string, ageSeconds: number) => ({ status, affected: 1, message: null, ageSeconds });

    it('chạy bình thường trong chu kỳ -> không cảnh báo', async () => {
      const { svc } = make({ intervalDays: 14, schedule: { lastRun: last('success', 86400), nextDueInSeconds: 100, dueNow: false } });
      const h = await svc.getHealth();
      expect(h.cron).toMatchObject({ error: false, intervalDays: 14, warn: false, warnReason: null });
    });

    it('chưa từng chạy -> NEVER_RAN', async () => {
      const { svc } = make({ schedule: { lastRun: null, nextDueInSeconds: 0, dueNow: true } });
      expect((await svc.getHealth()).cron).toMatchObject({ warn: true, warnReason: 'NEVER_RAN' });
    });

    it('quá hạn (chu kỳ + 2 ngày) -> OVERDUE; đúng mốc chưa cảnh báo', async () => {
      const edge = (14 + HEALTH_CRON_OVERDUE_GRACE_DAYS) * 86400;
      const a = make({ intervalDays: 14, schedule: { lastRun: last('success', edge), nextDueInSeconds: 0, dueNow: true } });
      expect((await a.svc.getHealth()).cron).toMatchObject({ warn: false });
      const b = make({ intervalDays: 14, schedule: { lastRun: last('success', edge + 1), nextDueInSeconds: 0, dueNow: true } });
      expect((await b.svc.getHealth()).cron).toMatchObject({ warn: true, warnReason: 'OVERDUE' });
    });

    it('lần gần nhất partial/failed -> LAST_RUN_INCOMPLETE', async () => {
      for (const st of ['partial', 'failed']) {
        const { svc } = make({ schedule: { lastRun: last(st, 10), nextDueInSeconds: 0, dueNow: true } });
        expect((await svc.getHealth()).cron).toMatchObject({ warn: true, warnReason: 'LAST_RUN_INCOMPLETE' });
      }
    });

    it('đang chạy (running) không bị coi là quá hạn dù tuổi lớn', async () => {
      const { svc } = make({ intervalDays: 7, schedule: { lastRun: last('running', 99 * 86400), nextDueInSeconds: 0, dueNow: true } });
      expect((await svc.getHealth()).cron).toMatchObject({ warn: false });
    });
  });

  describe('sessions', () => {
    it('đếm ở ứng dụng: bỏ qua chuỗi bcrypt cũ / JSON hỏng / NULL', async () => {
      const two = addRefreshSession(addRefreshSession(null, 'tok-a', nowS()), 'tok-b', nowS());
      const one = addRefreshSession(null, 'tok-c', nowS());
      const { svc } = make({
        query: async (sql: string) => {
          if (/hashed_refresh_token/.test(sql)) return [{ raw: two }, { raw: one }, { raw: '$2b$10$abcdefghijklmnopqrstuv' }, { raw: '{hỏng' }, { raw: null }];
          if (/VERSION/.test(sql)) return [{ v: '8' }];
          return [{ n: 0 }];
        },
      });
      const h = await svc.getHealth();
      expect(h.sessions).toMatchObject({ error: false, totalSessions: 3, usersWithSessions: 2 });
    });

    it('SQL không dùng JSON_LENGTH', async () => {
      const { svc, query } = make();
      await svc.getHealth();
      expect(query.mock.calls.some((c) => /JSON_LENGTH/i.test(String(c[0])))).toBe(false);
    });
  });

  describe('caches', () => {
    it('liệt kê cache đã đăng ký kèm số mục, ghi rõ phạm vi instance hiện tại', async () => {
      registerCacheProbe({ key: 'b_cache', label: 'B', ttlSeconds: 15, size: () => 3 });
      registerCacheProbe({ key: 'a_cache', label: 'A', ttlSeconds: 10, size: () => 0 });
      registerCacheProbe({ key: 'bad', label: 'Lỗi', ttlSeconds: 1, size: () => { throw new Error('x'); } });
      const { svc } = make();
      const h = await svc.getHealth();
      if (h.caches.error) throw new Error('caches lỗi');
      expect(h.caches.scope).toBe('current_instance');
      expect(h.caches.items.map((i) => i.key)).toEqual(['a_cache', 'b_cache', 'bad']);
      expect(h.caches.items.find((i) => i.key === 'b_cache')).toMatchObject({ entries: 3, ttlSeconds: 15 });
      // probe lỗi không làm hỏng cả danh sách
      expect(h.caches.items.find((i) => i.key === 'bad')?.entries).toBeNull();
    });
  });

  it('phần app không lộ biến môi trường nhạy cảm (chỉ phiên bản/commit/region/node)', async () => {
    const { svc } = make();
    const h = await svc.getHealth();
    if (h.app.error) throw new Error('app lỗi');
    expect(Object.keys(h.app).sort()).toEqual(['commit', 'error', 'nodeEnv', 'nodeVersion', 'region', 'uptimeSeconds', 'version']);
  });
});
