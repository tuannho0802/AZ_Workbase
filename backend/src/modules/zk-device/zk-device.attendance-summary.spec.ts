import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { ZkDeviceService } from './zk-device.service';
import { User } from '../../database/entities/user.entity';
import { AttendanceLog } from '../../database/entities/attendance-log.entity';
import { ZkDeviceUserCache } from '../../database/entities/zk-device-user-cache.entity';
import { Department } from '../../database/entities/department.entity';
import { Role } from '../../common/enums/role.enum';
import { PermissionScope } from '../../database/entities/role-permission.entity';
import { AuditService } from '../audit/audit.service';

jest.mock('../../integrations/zk-device/sequential-attendance-reader.util', () => ({
  readAttendanceLogsSequential: jest.fn().mockResolvedValue([]),
}));

/**
 * Plan CPU 13A-1: getAttendanceSummary chỉ `select` đúng các cột mà vòng gom
 * đọc (thay cho leftJoinAndSelect hydrate toàn bộ User). Spec này chứng minh
 * KẾT QUẢ KHÔNG ĐỔI bằng cách chạy cùng 1 bộ log với:
 *   - "full"     : getMany trả đầy đủ mọi cột (mô phỏng hành vi cũ)
 *   - "selected" : getMany CHỈ trả các cột nằm trong .select([...]) thật sự
 *                  được service gọi (mô phỏng hành vi mới)
 * Nếu service đọc 1 field không được select -> kết quả 2 chế độ sẽ lệch.
 */
describe('ZkDeviceService.getAttendanceSummary (13A-1)', () => {
  let service: ZkDeviceService;

  const mockAttendanceLogRepo = { createQueryBuilder: jest.fn() };
  const mockCacheRepo = { find: jest.fn() };
  const mockDepartmentManagerRepo = { find: jest.fn() };
  const mockDepartmentRepo = {
    find: jest.fn(),
    manager: { getRepository: jest.fn(() => mockDepartmentManagerRepo) },
  };

  const t = (s: string) => new Date(`${s}`); // giờ VN naive (không hậu tố tz)

  const userAlice = {
    id: 1,
    name: 'Alice',
    departmentId: 5,
    email: 'alice@x.com',
    isActive: true,
    zkDeviceUserId: '1',
  };
  const userBob = {
    id: 2,
    name: 'Bob',
    departmentId: 6,
    email: 'bob@x.com',
    isActive: true,
    zkDeviceUserId: '2',
  };

  // Mỗi log mang đủ cột (giống leftJoinAndSelect cũ).
  const fullLogs = () => [
    // Alice 05/10: 08:30, 08:45 (quẹt trùng < 2h -> bị bỏ), 18:10
    { id: 1, deviceSerialNumber: 'SN', deviceUserId: '1', recordTime: t('2026-10-05T08:30:00'), matchedUserId: 1, matchedUser: userAlice, statusCode: '0', verifyMode: '1', source: 'device_push' },
    { id: 2, deviceSerialNumber: 'SN', deviceUserId: '1', recordTime: t('2026-10-05T08:45:00'), matchedUserId: 1, matchedUser: userAlice, statusCode: '0', verifyMode: '1', source: 'device_push' },
    { id: 3, deviceSerialNumber: 'SN', deviceUserId: '1', recordTime: t('2026-10-05T18:10:00'), matchedUserId: 1, matchedUser: userAlice, statusCode: '1', verifyMode: '1', source: 'device_push' },
    // Bob 05/10: chỉ 1 lượt, đi muộn -> missing_checkout
    { id: 4, deviceSerialNumber: 'SN', deviceUserId: '2', recordTime: t('2026-10-05T09:30:00'), matchedUserId: 2, matchedUser: userBob, statusCode: '0', verifyMode: '1', source: 'device_push' },
    // Mã máy 99 CHƯA map: 08:00 và 17:00
    { id: 5, deviceSerialNumber: 'SN', deviceUserId: '99', recordTime: t('2026-10-05T08:00:00'), matchedUserId: null, matchedUser: null, statusCode: '0', verifyMode: '1', source: 'device_push' },
    { id: 6, deviceSerialNumber: 'SN', deviceUserId: '99', recordTime: t('2026-10-05T17:00:00'), matchedUserId: null, matchedUser: null, statusCode: '1', verifyMode: '1', source: 'device_push' },
    // Alice 06/10: 08:55 và 17:30 (về sớm)
    { id: 7, deviceSerialNumber: 'SN', deviceUserId: '1', recordTime: t('2026-10-06T08:55:00'), matchedUserId: 1, matchedUser: userAlice, statusCode: '0', verifyMode: '1', source: 'device_push' },
    { id: 8, deviceSerialNumber: 'SN', deviceUserId: '1', recordTime: t('2026-10-06T17:30:00'), matchedUserId: 1, matchedUser: userAlice, statusCode: '1', verifyMode: '1', source: 'device_push' },
    // Alice tuần trước 28/09: 08:00 và 18:30
    { id: 9, deviceSerialNumber: 'SN', deviceUserId: '1', recordTime: t('2026-09-28T08:00:00'), matchedUserId: 1, matchedUser: userAlice, statusCode: '0', verifyMode: '1', source: 'device_push' },
    { id: 10, deviceSerialNumber: 'SN', deviceUserId: '1', recordTime: t('2026-09-28T18:30:00'), matchedUserId: 1, matchedUser: userAlice, statusCode: '1', verifyMode: '1', source: 'device_push' },
  ];

  /** Chỉ giữ lại các cột có trong danh sách select ('log.x' / 'matchedUser.y'). */
  const hydrateSelectedOnly = (logs: any[], selected: string[]) => {
    const logCols = selected.filter((s) => s.startsWith('log.')).map((s) => s.slice(4));
    const userCols = selected.filter((s) => s.startsWith('matchedUser.')).map((s) => s.slice(12));
    return logs.map((l) => {
      const out: any = {};
      for (const c of logCols) out[c] = l[c];
      if (l.matchedUser) {
        const u: any = {};
        for (const c of userCols) u[c] = l.matchedUser[c];
        out.matchedUser = u;
      } else {
        out.matchedUser = null;
      }
      return out;
    });
  };

  const buildQb = (mode: 'full' | 'selected', logs = fullLogs()) => {
    let selected: string[] | null = null;
    const qb: any = {
      leftJoin: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      select: jest.fn((cols: string[]) => {
        selected = cols;
        return qb;
      }),
      orderBy: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => {
        // Sắp xếp ASC theo recordTime giống ORDER BY của query thật.
        const sorted = [...logs].sort((a, b) => a.recordTime.getTime() - b.recordTime.getTime());
        if (mode === 'full' || !selected) return sorted;
        return hydrateSelectedOnly(sorted, selected);
      }),
    };
    return qb;
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCacheRepo.find.mockResolvedValue([
      { deviceUserId: '1', name: 'AliceDev' },
      { deviceUserId: '99', name: 'Khach99' },
    ]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ZkDeviceService,
        { provide: getRepositoryToken(User), useValue: {} },
        { provide: getRepositoryToken(AttendanceLog), useValue: mockAttendanceLogRepo },
        { provide: getRepositoryToken(ZkDeviceUserCache), useValue: mockCacheRepo },
        { provide: getRepositoryToken(Department), useValue: mockDepartmentRepo },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: AuditService, useValue: { logAction: jest.fn(), logActionAsync: jest.fn() } },
      ],
    }).compile();
    service = module.get(ZkDeviceService);
  });

  const run = async (mode: 'full' | 'selected', query: any = {}, role = Role.ADMIN, scope: string | null = PermissionScope.ALL) => {
    const qb = buildQb(mode);
    mockAttendanceLogRepo.createQueryBuilder.mockReturnValue(qb);
    const res = await service.getAttendanceSummary(query, 1, role, scope);
    return { res, qb };
  };

  it('kết quả GIỐNG HỆT giữa hydrate đầy đủ (cũ) và chỉ select cột cần (mới) - phân trang theo dòng', async () => {
    const before = await run('full', { page: 1, limit: 31 });
    const after = await run('selected', { page: 1, limit: 31 });
    expect(after.res).toEqual(before.res);
    expect(after.res.total).toBeGreaterThan(0);
  });

  it('kết quả GIỐNG HỆT giữa cũ/mới - chế độ weeksPerPage (mọi trang)', async () => {
    for (const page of [1, 2, 3]) {
      const before = await run('full', { page, weeksPerPage: 1 });
      const after = await run('selected', { page, weeksPerPage: 1 });
      expect(after.res).toEqual(before.res);
    }
  });

  it('gom đúng: nhóm đã map / chưa map / quẹt trùng trong DUPLICATE_TAP_GAP_MS', async () => {
    const { res } = await run('selected', { page: 1, limit: 100 });
    const alice5 = res.data.find((r: any) => r.userId === 1 && r.date === '2026-10-05')!;
    // 08:45 bị bỏ (cách 08:30 < 2h) -> còn 2 lượt (08:30, 18:10)
    expect(alice5.logCount).toBe(2);
    expect(alice5.userName).toBe('Alice'); // lấy từ matchedUser.name (cột đã select)
    expect(alice5.deviceUserName).toBe('AliceDev');
    expect(alice5.status).toBe('on_time');

    const bob5 = res.data.find((r: any) => r.userId === 2)!;
    expect(bob5.status).toBe('missing_checkout');
    expect(bob5.checkOut).toBeNull();

    const unmapped = res.data.find((r: any) => r.userId === null)!;
    expect(unmapped.isMapped).toBe(false);
    expect(unmapped.userName).toBe('Khach99');
    expect(unmapped.logCount).toBe(2);

    const alice6 = res.data.find((r: any) => r.userId === 1 && r.date === '2026-10-06')!;
    expect(alice6.status).toBe('early_leave');
  });

  it('phân trang page/limit đúng', async () => {
    const all = (await run('selected', { page: 1, limit: 100 })).res;
    const p2 = (await run('selected', { page: 2, limit: 2 })).res;
    expect(p2.total).toBe(all.total);
    expect(p2.totalPages).toBe(Math.ceil(all.total / 2));
    expect(p2.data).toEqual(all.data.slice(2, 4));
  });

  it('weeksPerPage: trang 1 chỉ có tuần mới nhất (05/10), trang 2 là tuần 28/09', async () => {
    const p1 = (await run('selected', { page: 1, weeksPerPage: 1 })).res as any;
    const p2 = (await run('selected', { page: 2, weeksPerPage: 1 })).res as any;
    expect(p1.totalWeeks).toBe(2);
    expect(p1.data.every((r: any) => r.date >= '2026-10-05')).toBe(true);
    expect(p2.data.map((r: any) => r.date)).toEqual(['2026-09-28']);
  });

  describe('hình dạng query (13A-1)', () => {
    it('dùng leftJoin + select, KHÔNG còn leftJoinAndSelect, và select đủ cột vòng gom đọc', async () => {
      const { qb } = await run('selected', { page: 1, limit: 31 });
      expect(qb.leftJoinAndSelect).not.toHaveBeenCalled();
      expect(qb.leftJoin).toHaveBeenCalledWith('log.matchedUser', 'matchedUser');
      const cols: string[] = qb.select.mock.calls[0][0];
      expect(cols).toEqual(
        expect.arrayContaining([
          'log.id',
          'log.deviceUserId',
          'log.recordTime',
          'log.matchedUserId',
          'matchedUser.id',
          'matchedUser.name',
        ]),
      );
      // Không hydrate vô ích các cột User khác
      expect(cols.some((c) => c === 'matchedUser.email')).toBe(false);
      expect(qb.orderBy).toHaveBeenCalledWith('log.recordTime', 'ASC');
    });

    it('truyền from/to vào điều kiện lọc như cũ', async () => {
      const { qb } = await run('selected', { from: '2026-10-01', to: '2026-10-31' });
      const sqls = qb.andWhere.mock.calls.map((c: any[]) => c[0]);
      expect(sqls).toContain('log.recordTime >= :from');
      expect(sqls).toContain('log.recordTime <= :to');
    });

    it('lọc theo userId như cũ', async () => {
      const { qb } = await run('selected', { userId: 1 });
      expect(qb.andWhere).toHaveBeenCalledWith('log.matchedUserId = :userId', { userId: 1 });
    });
  });

  describe('phạm vi phòng ban (matchedUser.departmentId chỉ nằm trong WHERE)', () => {
    it('scope DEPARTMENT vẫn lọc matchedUser.departmentId IN (...) dù không select cột đó', async () => {
      mockDepartmentManagerRepo.find.mockResolvedValue([{ departmentId: 5 }]);
      const { qb } = await run('selected', {}, 'custom_role' as any, PermissionScope.DEPARTMENT);
      expect(qb.andWhere).toHaveBeenCalledWith('log.matchedUserId IS NOT NULL');
      expect(qb.andWhere).toHaveBeenCalledWith('matchedUser.departmentId IN (:...deptIds)', { deptIds: [5] });
      const cols: string[] = qb.select.mock.calls[0][0];
      expect(cols).not.toContain('matchedUser.departmentId');
    });

    it('scope DEPARTMENT nhưng không quản lý phòng ban nào -> trả rỗng, không chạy query tải log', async () => {
      mockDepartmentManagerRepo.find.mockResolvedValue([]);
      const { res, qb } = await run('selected', { page: 1, limit: 31 }, 'custom_role' as any, PermissionScope.DEPARTMENT);
      expect(res).toEqual({ data: [], total: 0, page: 1, limit: 31, totalPages: 0 });
      expect(qb.getMany).not.toHaveBeenCalled();
    });
  });
});
