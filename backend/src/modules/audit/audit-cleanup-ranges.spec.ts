import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { PeriodicTaskAuditService } from '../periodic-tasks/periodic-task-audit.service';
import { PeriodicTasksController } from '../periodic-tasks/periodic-tasks.controller';
import { PERMISSION_KEY } from '../../common/decorators/require-permission.decorator';
import { RETENTION_PROTECTED_AUDIT_ACTIONS } from '../retention/retention.constants';

// Ngày xa trong quá khứ => không bị cắt về "hôm qua" dù test chạy vào ngày nào.
const DTO = { ranges: [{ from: '2020-01-01', to: '2020-01-31' }] };

function makeAudit(queryImpl: jest.Mock) {
  const repo = { query: queryImpl };
  const svc = new AuditService(repo as never, {} as never);
  const logAction = jest.spyOn(svc, 'logAction').mockResolvedValue(undefined);
  return { svc, logAction };
}

describe('AuditService.cleanupByRanges', () => {
  it('dryRun: không DELETE và không ghi audit', async () => {
    const query = jest.fn().mockResolvedValue([{ c: '5' }]);
    const { svc, logAction } = makeAudit(query);
    const res = await svc.cleanupByRanges(DTO, 1, true);
    expect(res.dryRun).toBe(true);
    expect(res.total).toBe(5);
    expect(res).toHaveProperty('securityEvents');
    expect(query.mock.calls.some(([sql]) => /DELETE/.test(sql as string))).toBe(false);
    expect(logAction).not.toHaveBeenCalled();
  });

  it('chạy thật: ghi ĐÚNG 1 dòng audit, SAU khi xoá', async () => {
    const order: string[] = [];
    const query = jest.fn().mockImplementation(async (sql: string) => {
      order.push('sql');
      return /DELETE/.test(sql) ? { affectedRows: 4 } : [{ c: 0 }];
    });
    const { svc, logAction } = makeAudit(query);
    logAction.mockImplementation(async () => {
      order.push('audit');
    });
    const res = await svc.cleanupByRanges(DTO, 9, false);
    expect(res.total).toBe(4);
    expect(logAction).toHaveBeenCalledTimes(1);
    expect(logAction.mock.calls[0][1]).toBe('ADMIN_CLEANUP_AUDIT_LOGS_RANGES');
    expect(logAction.mock.calls[0][0]).toBe(9);
    expect(order[order.length - 1]).toBe('audit');
  });

  it('mặc định KHÔNG xoá UNLOCK_LOGIN; includeSecurityEvents=true thì xoá', async () => {
    const query = jest.fn().mockResolvedValue({ affectedRows: 0 });
    const a = makeAudit(query);
    await a.svc.cleanupByRanges(DTO, 1, false);
    const del1 = query.mock.calls.find(([sql]) => /DELETE/.test(sql as string))!;
    expect(del1[0]).toContain('NOT IN');
    expect(del1[1]).toEqual(expect.arrayContaining(RETENTION_PROTECTED_AUDIT_ACTIONS));

    query.mockClear();
    await a.svc.cleanupByRanges({ ...DTO, includeSecurityEvents: true }, 1, false);
    const del2 = query.mock.calls.find(([sql]) => /DELETE/.test(sql as string))!;
    expect(del2[0]).not.toContain('NOT IN');
  });

  it('khoảng nằm trọn trong hôm nay/tương lai: không xoá, không ghi audit, báo dropped', async () => {
    const query = jest.fn();
    const { svc, logAction } = makeAudit(query);
    const res = await svc.cleanupByRanges({ ranges: [{ from: '2999-01-01', to: '2999-01-02' }] }, 1, false);
    expect(res.dropped).toHaveLength(1);
    expect(res.total).toBe(0);
    expect(query).not.toHaveBeenCalled();
    expect(logAction).not.toHaveBeenCalled();
  });
});

describe('PeriodicTaskAuditService.cleanupByRanges', () => {
  function make(query: jest.Mock) {
    const auditService = { logAction: jest.fn().mockResolvedValue(undefined) };
    const svc = new PeriodicTaskAuditService({ query } as never, auditService as never);
    return { svc, auditService };
  }
  it('dryRun không xoá, không ghi audit', async () => {
    const query = jest.fn().mockResolvedValue([{ c: '2' }]);
    const { svc, auditService } = make(query);
    const res = await svc.cleanupByRanges(DTO, 1, true);
    expect(res.total).toBe(2);
    expect(auditService.logAction).not.toHaveBeenCalled();
  });
  it('chạy thật ghi đúng 1 audit action ADMIN_CLEANUP_TASK_AUDIT_LOGS_RANGES', async () => {
    const query = jest.fn().mockResolvedValue({ affectedRows: 3 });
    const { svc, auditService } = make(query);
    await svc.cleanupByRanges(DTO, 1, false);
    expect(auditService.logAction).toHaveBeenCalledTimes(1);
    expect(auditService.logAction.mock.calls[0][1]).toBe('ADMIN_CLEANUP_TASK_AUDIT_LOGS_RANGES');
  });
});

describe('Controller - khoá guard/permission + thứ tự route', () => {
  const perm = (C: { prototype: object }, m: string) =>
    Reflect.getMetadata(PERMISSION_KEY, (C.prototype as Record<string, () => void>)[m]);

  it('audit: cleanup-ranges cùng permission với cleanup cũ (audit.manage)', () => {
    expect(perm(AuditController, 'cleanupRanges')).toBe('audit.manage');
    expect(perm(AuditController, 'cleanupRanges')).toBe(perm(AuditController, 'cleanup'));
    const guards = Reflect.getMetadata(GUARDS_METADATA, AuditController) as Array<{ name: string }>;
    expect(guards.map((g) => g.name)).toEqual(['JwtAuthGuard', 'PermissionGuard']);
  });

  it('task audit: cleanup-ranges cùng permission với cleanup cũ (periodic_tasks.delete)', () => {
    expect(perm(PeriodicTasksController, 'cleanupAuditLogsRanges')).toBe('periodic_tasks.delete');
    expect(perm(PeriodicTasksController, 'cleanupAuditLogsRanges')).toBe(perm(PeriodicTasksController, 'cleanupAuditLogs'));
  });

  it('task audit: chặn người không có phạm vi "Toàn bộ" (403) trước khi đụng service', () => {
    const svc = { cleanupByRanges: jest.fn() };
    const c = new (PeriodicTasksController as unknown as new (...a: unknown[]) => PeriodicTasksController)(
      {}, {}, {}, {}, {}, svc, {},
    );
    expect(() => c.cleanupAuditLogsRanges(DTO as never, undefined, { id: 2, role: 'manager' }, 'department')).toThrow();
    expect(svc.cleanupByRanges).not.toHaveBeenCalled();
    c.cleanupAuditLogsRanges(DTO as never, 'true', { id: 2, role: 'manager' }, 'all');
    expect(svc.cleanupByRanges).toHaveBeenCalledWith(DTO, 2, true);
  });

  it('route cleanup-ranges khai TRƯỚC route :id', () => {
    const order = (C: { prototype: object }) => Object.getOwnPropertyNames(C.prototype);
    const a = order(AuditController);
    expect(a.indexOf('cleanupRanges')).toBeLessThan(a.indexOf('getLogDetail'));
    const t = order(PeriodicTasksController);
    expect(t.indexOf('cleanupAuditLogsRanges')).toBeLessThan(t.indexOf('findOne'));
  });
});
