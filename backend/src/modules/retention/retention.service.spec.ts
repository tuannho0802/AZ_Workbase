import { ForbiddenException } from '@nestjs/common';
import { RetentionService } from './retention.service';
import { RETENTION_BATCH_SIZE } from './retention.constants';

type Row = Record<string, unknown>;

function makeService(opts: {
  settings?: Row[];
  latestRun?: Row | null;
  deleteResults?: number[];
  countResult?: number;
  securityDays?: number;
  bulkOpsDeleted?: number;
}) {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const deletes = [...(opts.deleteResults ?? [0])];
  const dataSource = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      if (sql.includes('FROM cron_runs')) return opts.latestRun ? [opts.latestRun] : [];
      if (sql.startsWith('INSERT INTO cron_runs')) return { insertId: 7 };
      if (sql.startsWith('UPDATE cron_runs')) return { affectedRows: 1 };
      if (sql.includes('SELECT COUNT(*)')) return [{ c: opts.countResult ?? 0 }];
      if (sql.startsWith('DELETE FROM bulk_operations')) return { affectedRows: opts.bulkOpsDeleted ?? 0 };
      if (sql.startsWith('DELETE FROM')) return { affectedRows: deletes.shift() ?? 0 };
      return [];
    }),
  };
  const settingRepo = {
    find: jest.fn(async () => opts.settings ?? []),
    save: jest.fn(async (rows: unknown) => rows),
  };
  const auditService = { logAction: jest.fn(async () => undefined) };
  const securityConfig = { get: jest.fn(async () => ({ securityEventRetentionDays: opts.securityDays ?? 180 })) };
  const service = new RetentionService(
    dataSource as never,
    settingRepo as never,
    auditService as never,
    securityConfig as never,
  );
  return { service, dataSource, settingRepo, auditService, queries, securityConfig };
}

const ENABLE_AUDIT: Row[] = [
  { key: 'audit_cleanup_enabled', value: 'true' },
  { key: 'audit_retention_days', value: '90' },
];

describe('RetentionService', () => {
  describe('getSettings', () => {
    it('mặc định: mọi đối tượng TẮT, chu kỳ 30 ngày, attendance sàn 365', async () => {
      const { service } = makeService({});
      const s = await service.getSettings();
      expect(s.intervalDays).toBe(30);
      expect(s.auditLogs).toEqual({ enabled: false, retentionDays: 90 });
      expect(s.notifications.unreadRetentionDays).toBe(180);
      expect(s.attendanceLogs).toEqual({ enabled: false, retentionDays: 365 });
    });

    it('giá trị ngoài khoảng trong DB bị kẹp về mặc định (attendance 30 ngày -> 365)', async () => {
      const { service } = makeService({
        settings: [
          { key: 'attendance_retention_days', value: '30' },
          { key: 'retention_cron_interval_days', value: '0' },
          { key: 'audit_retention_days', value: 'abc' },
        ],
      });
      const s = await service.getSettings();
      expect(s.attendanceLogs.retentionDays).toBe(365);
      expect(s.intervalDays).toBe(30);
      expect(s.auditLogs.retentionDays).toBe(90);
    });
  });

  describe('runIfDue', () => {
    it('chưa đủ chu kỳ -> NOT_DUE, không INSERT/DELETE', async () => {
      const { service, queries } = makeService({
        settings: ENABLE_AUDIT,
        latestRun: { id: 1, status: 'success', affected: 5, message: null, age: 86400 },
      });
      const r = await service.runIfDue();
      expect(r).toMatchObject({ skipped: true, reason: 'NOT_DUE', nextDueInSeconds: 29 * 86400 });
      expect(queries.some((q) => q.sql.startsWith('DELETE') || q.sql.startsWith('INSERT'))).toBe(false);
    });

    it('đủ chu kỳ -> chạy, xoá đúng cutoff và ghi cron_runs success', async () => {
      const { service, queries } = makeService({
        settings: [...ENABLE_AUDIT, { key: 'retention_cron_interval_days', value: '14' }],
        latestRun: { id: 1, status: 'success', affected: 0, message: null, age: 14 * 86400 },
        deleteResults: [12],
      });
      const r = await service.runIfDue();
      expect(r).toMatchObject({ status: 'success', affected: 12 });
      const del = queries.find((q) => q.sql.startsWith('DELETE FROM `audit_logs`'))!;
      expect(del.params[0]).toBe(90);
      expect(del.sql).toContain('NOW() - INTERVAL ? DAY');
      expect(del.sql).toContain('action NOT IN');
      expect(del.params).toContain('UNLOCK_LOGIN');
      const upd = queries.find((q) => q.sql.startsWith('UPDATE cron_runs'))!;
      expect(upd.params[0]).toBe('success');
    });

    it('chưa từng chạy -> đến hạn ngay', async () => {
      const { service } = makeService({ settings: ENABLE_AUDIT, latestRun: null });
      expect((await service.runIfDue()).status).toBe('success');
    });

    it('lần trước partial -> làm tiếp ngay dù chưa hết chu kỳ', async () => {
      const { service } = makeService({
        settings: ENABLE_AUDIT,
        latestRun: { id: 1, status: 'partial', affected: 5000, message: null, age: 60 },
      });
      expect((await service.runIfDue()).skipped).toBeUndefined();
    });

    it('đang chạy (running, chưa quá 10 phút) -> ALREADY_RUNNING', async () => {
      const { service } = makeService({
        settings: ENABLE_AUDIT,
        latestRun: { id: 1, status: 'running', affected: 0, message: null, age: 30 },
      });
      expect(await service.runIfDue()).toMatchObject({ skipped: true, reason: 'ALREADY_RUNNING' });
    });

    it('enabled=false -> bỏ qua đối tượng, không DELETE', async () => {
      const { service, queries } = makeService({ settings: [], latestRun: null });
      const r = await service.runIfDue();
      expect(r.results!.every((x) => x.skipped === 'DISABLED')).toBe(true);
      expect(queries.some((q) => q.sql.startsWith('DELETE') && !q.sql.includes('bulk_operations'))).toBe(false);
    });

    it('P7: luôn dọn bulk_operations quá hạn (không công tắc), cộng vào affected, không hiện ở results', async () => {
      const { service, queries } = makeService({ settings: [], latestRun: null, bulkOpsDeleted: 3 });
      const r = await service.runIfDue();
      expect(queries.some((q) => q.sql.includes('DELETE FROM bulk_operations WHERE expires_at < NOW()'))).toBe(true);
      expect(r.affected).toBe(3);
      expect(r.results!.some((x) => (x.target as string) === 'bulk_operations')).toBe(false);
    });

    it('P7: chạy tay 1 đối tượng hoặc dryRun -> KHÔNG đụng bulk_operations', async () => {
      const { service, queries } = makeService({ settings: ENABLE_AUDIT, latestRun: null });
      await service.run({ target: 'audit_logs' });
      await service.run({ dryRun: true });
      expect(queries.some((q) => q.sql.includes('bulk_operations'))).toBe(false);
    });
  });

  describe('run', () => {
    it('lô đầy mà hết ngân sách thời gian -> partial', async () => {
      const { service } = makeService({ settings: ENABLE_AUDIT, deleteResults: [RETENTION_BATCH_SIZE, RETENTION_BATCH_SIZE] });
      const now = jest.spyOn(Date, 'now');
      now.mockReturnValueOnce(0).mockReturnValue(10_000); // startedAt=0 rồi vượt ngân sách 8s
      const r = await service.run({ target: 'audit_logs' });
      now.mockRestore();
      expect(r.status).toBe('partial');
      expect(r.affected).toBe(RETENTION_BATCH_SIZE);
    });

    it('dryRun chỉ COUNT: không INSERT cron_runs, không DELETE', async () => {
      const { service, queries } = makeService({ settings: ENABLE_AUDIT, countResult: 42 });
      const r = await service.run({ dryRun: true });
      expect(r.results!.find((x) => x.target === 'audit_logs')!.count).toBe(42);
      expect(queries.some((q) => /^(DELETE|INSERT|UPDATE)/.test(q.sql))).toBe(false);
    });

    it('chạy tay 1 đối tượng ghi target riêng (không đổi mốc chu kỳ "all")', async () => {
      const { service, queries } = makeService({ settings: ENABLE_AUDIT });
      await service.run({ target: 'audit_logs' });
      const ins = queries.find((q) => q.sql.startsWith('INSERT INTO cron_runs'))!;
      expect(ins.params).toEqual(['retention', 'audit_logs']);
    });

    it('lỗi 1 đối tượng -> status failed (ngày sau chạy lại), không ném ra ngoài', async () => {
      const { service, dataSource } = makeService({ settings: ENABLE_AUDIT });
      const original = dataSource.query.getMockImplementation()!;
      dataSource.query.mockImplementation(async (sql: string, params?: unknown[]) => {
        if (sql.startsWith('DELETE FROM')) throw new Error('boom');
        return original(sql, params);
      });
      const r = await service.run({ target: 'audit_logs' });
      expect(r.status).toBe('failed');
      expect(r.results![0].error).toBe('boom');
    });
  });

  describe('updateSettings', () => {
    it('non-admin không được đổi cấu hình chấm công', async () => {
      const { service } = makeService({});
      await expect(
        service.updateSettings({ attendanceLogs: { enabled: true, retentionDays: 400 } }, { id: 2, role: 'manager' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('lưu đúng key vào settings và ghi audit', async () => {
      const { service, settingRepo, auditService } = makeService({});
      await service.updateSettings(
        { intervalDays: 14, notifications: { enabled: true, retentionDays: 60, unreadRetentionDays: 180 } },
        { id: 1, role: 'admin' },
      );
      const saved = settingRepo.save.mock.calls[0][0] as Array<{ key: string; value: string }>;
      expect(saved).toEqual(
        expect.arrayContaining([
          { key: 'retention_cron_interval_days', value: '14' },
          { key: 'notification_cleanup_enabled', value: 'true' },
          { key: 'notification_retention_days', value: '60' },
          { key: 'notification_unread_retention_days', value: '180' },
        ]),
      );
      expect(auditService.logAction).toHaveBeenCalledWith(1, 'UPDATE_RETENTION_SETTINGS', 'setting', 0, null, expect.anything());
    });
  });

  describe('security_events (PLAN P4.2)', () => {
    it('mặc định TẮT; số ngày giữ lấy từ security_config (không từ settings)', async () => {
      const { service } = makeService({ securityDays: 365 });
      const s = await service.getSettings();
      expect(s.securityEvents).toEqual({ enabled: false, retentionDays: 365 });
    });

    it('bật qua setting riêng `security_event_cleanup_enabled`', async () => {
      const { service } = makeService({ settings: [{ key: 'security_event_cleanup_enabled', value: 'true' }] });
      expect((await service.getSettings()).securityEvents.enabled).toBe(true);
    });

    it('chạy thật: chỉ xoá action bảo mật cũ hơn hạn riêng', async () => {
      const { service, queries } = makeService({
        settings: [{ key: 'security_event_cleanup_enabled', value: 'true' }],
        securityDays: 200,
        deleteResults: [3],
      });
      await service.run({ target: 'security_events' });
      const del = queries.find((q) => q.sql.startsWith('DELETE FROM'))!;
      expect(del.sql).toContain('audit_logs');
      expect(del.sql).toContain('action IN (');
      expect(del.params[0]).toBe(200);
      expect(del.params).toContain('LOGIN_FAILED');
    });

    it('job audit_logs chung KHÔNG xoá action bảo mật (NOT IN toàn bộ SECURITY_AUDIT_ACTIONS)', async () => {
      const { service, queries } = makeService({ settings: ENABLE_AUDIT, deleteResults: [0] });
      await service.run({ target: 'audit_logs' });
      const del = queries.find((q) => q.sql.startsWith('DELETE FROM'))!;
      expect(del.sql).toContain('action NOT IN (');
      expect(del.params).toEqual(expect.arrayContaining(['LOGIN_FAILED', 'LOGIN_UNKNOWN_EMAIL', 'ACCOUNT_LOCKED', 'UNLOCK_LOGIN']));
    });

    it('updateSettings chỉ lưu cờ bật/tắt, không ghi số ngày vào settings', async () => {
      const { service, settingRepo } = makeService({});
      await service.updateSettings({ securityEvents: { enabled: true } }, { id: 1, role: 'admin' });
      expect(settingRepo.save).toHaveBeenCalledWith([{ key: 'security_event_cleanup_enabled', value: 'true' }]);
    });
  });
});
