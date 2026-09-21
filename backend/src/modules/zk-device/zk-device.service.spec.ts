import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { ZkDeviceService } from './zk-device.service';
import { User } from '../../database/entities/user.entity';
import { AttendanceLog } from '../../database/entities/attendance-log.entity';
import { ZkDeviceUserCache } from '../../database/entities/zk-device-user-cache.entity';
import { Department } from '../../database/entities/department.entity';
import { DepartmentManager } from '../../database/entities/department-manager.entity';
import { Role } from '../../common/enums/role.enum';
import { PermissionScope } from '../../database/entities/role-permission.entity';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';

// syncNow(): thay bước ĐỌC LOG từ máy thật bằng mock - chỉ để kiểm tra audit.
jest.mock('../../integrations/zk-device/sequential-attendance-reader.util', () => ({
  readAttendanceLogsSequential: jest.fn().mockResolvedValue([]),
}));

describe('ZkDeviceService', () => {
  let service: ZkDeviceService;

  const mockUserRepo = {
    findOneByOrFail: jest.fn(),
    findOneBy: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn((u) => Promise.resolve(u)),
  };
  const mockAuditService = {
    logAction: jest.fn(),
    logActionAsync: jest.fn(),
  };
  const mockAttendanceLogRepo = {
    createQueryBuilder: jest.fn(),
  };
  const mockZkDeviceUserCacheRepo = {};
  // ⚠️ MỚI: getManagedDepartmentIds() giờ lấy DepartmentManagerRepository
  // qua `departmentRepo.manager.getRepository(DepartmentManager)` (bảng
  // nhiều-nhiều `department_managers`, thay cho `departmentRepo.find({where:
  // {managerUserId}})` cũ) - xem zk-device.service.ts.
  const mockDepartmentManagerRepo = {
    find: jest.fn(),
  };
  const mockDepartmentRepo = {
    find: jest.fn(),
    manager: {
      getRepository: jest.fn(() => mockDepartmentManagerRepo),
    },
  };

  const buildQueryBuilderMock = () => {
    const qb: any = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    return qb;
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ZkDeviceService,
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(AttendanceLog), useValue: mockAttendanceLogRepo },
        { provide: getRepositoryToken(ZkDeviceUserCache), useValue: mockZkDeviceUserCacheRepo },
        { provide: getRepositoryToken(Department), useValue: mockDepartmentRepo },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<ZkDeviceService>(ZkDeviceService);
    jest.spyOn(service as any, 'rematchUnmatchedLogs').mockResolvedValue(0);
  });

  describe('mapUser', () => {
    it('custom role + PermissionScope.DEPARTMENT -> quan ly duoc nhan vien cung phong', async () => {
      mockUserRepo.findOneByOrFail.mockResolvedValue({ id: 2, departmentId: 5 });
      mockDepartmentManagerRepo.find.mockResolvedValue([{ departmentId: 5 }]);
      const res = await service.mapUser(2, 'd1', 1, 'custom_role', PermissionScope.DEPARTMENT);
      expect(res.zkDeviceUserId).toBe('d1');
    });

    it('custom role + khong co scope -> bypass check phong ban (giong het ASSISTANT cu)', async () => {
      mockUserRepo.findOneByOrFail.mockResolvedValue({ id: 2, departmentId: 5 });
      const res = await service.mapUser(2, 'd1', 1, 'custom_role', null);
      expect(res.zkDeviceUserId).toBe('d1');
    });

    it('MANAGER + khong co scope -> KHONG con fallback cung theo role, bypass check phong ban giong moi role khac (hoan toan theo scope tu role_permissions)', async () => {
    // ⚠️ Đổi ý nghĩa so với bản cũ ("backward-compat" trước đây giả định
    // Role.MANAGER luôn bị chặn theo phòng ban dù thiếu scope) - code
    // hiện tại hoàn toàn theo `scope`, không còn đọc Role.MANAGER đặc
    // biệt - xem zk-device.service.ts mapUser().
      mockUserRepo.findOneByOrFail.mockResolvedValue({ id: 2, departmentId: 5 });
      const res = await service.mapUser(2, 'd1', 1, Role.MANAGER, null);
      expect(res.zkDeviceUserId).toBe('d1');
      expect(mockDepartmentManagerRepo.find).not.toHaveBeenCalled();
    });

    it('scope=department -> ForbiddenException nếu nhân viên KHÔNG thuộc phòng ban mình quản lý', async () => {
      mockUserRepo.findOneByOrFail.mockResolvedValue({ id: 2, departmentId: 99 });
      mockDepartmentManagerRepo.find.mockResolvedValue([{ departmentId: 5 }]);

      await expect(
        service.mapUser(2, 'd1', 1, Role.MANAGER, PermissionScope.DEPARTMENT),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getAttendanceLogs', () => {
    it('custom role + PermissionScope.DEPARTMENT -> them query andWhere cho phong ban', async () => {
      const qb = buildQueryBuilderMock();
      mockAttendanceLogRepo.createQueryBuilder.mockReturnValue(qb);
      mockDepartmentManagerRepo.find.mockResolvedValue([{ departmentId: 5 }]);

      await service.getAttendanceLogs({}, 1, 'custom_role', PermissionScope.DEPARTMENT);
      expect(qb.andWhere).toHaveBeenCalledWith('matchedUser.departmentId IN (:...deptIds)', { deptIds: [5] });
    });

    it('MANAGER + khong co scope -> KHONG con them query andWhere theo phong ban (hoan toan theo scope)', async () => {
    // ⚠️ Đổi ý nghĩa so với bản cũ - xem giải thích ở describe('mapUser') phía trên.
      const qb = buildQueryBuilderMock();
      mockAttendanceLogRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getAttendanceLogs({}, 1, Role.MANAGER, null);
      expect(qb.andWhere).not.toHaveBeenCalledWith(
        expect.stringContaining('matchedUser.departmentId IN'),
        expect.anything(),
      );
      expect(mockDepartmentManagerRepo.find).not.toHaveBeenCalled();
    });

    // ⚠️ MỚI - test cho field `deviceUserId` (thêm ở QueryAttendanceLogDto,
    // trước đây khai báo nhưng chưa wire vào query - đã fix ở
    // getAttendanceLogs()). Đảm bảo filter đúng cột `log.deviceUserId`,
    // KHÔNG lẫn với `userId` (lọc theo `log.matchedUserId`).
    it('truyen deviceUserId -> andWhere theo log.deviceUserId (KHONG phai matchedUserId)', async () => {
      const qb = buildQueryBuilderMock();
      mockAttendanceLogRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getAttendanceLogs({ deviceUserId: 'd123' } as any, 1, Role.ADMIN, PermissionScope.ALL);

      expect(qb.andWhere).toHaveBeenCalledWith('log.deviceUserId = :deviceUserId', { deviceUserId: 'd123' });
      expect(qb.andWhere).not.toHaveBeenCalledWith(
        expect.stringContaining('matchedUserId = :userId'),
        expect.anything(),
      );
    });

    it('khong truyen deviceUserId -> KHONG goi andWhere theo log.deviceUserId', async () => {
      const qb = buildQueryBuilderMock();
      mockAttendanceLogRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getAttendanceLogs({}, 1, Role.ADMIN, PermissionScope.ALL);

      expect(qb.andWhere).not.toHaveBeenCalledWith(
        expect.stringContaining('log.deviceUserId ='),
        expect.anything(),
      );
    });

    // ⚠️ MỚI - đảm bảo JOIN department/position của matchedUser LUÔN được
    // gọi (để FE tab "Logs chấm công" có đủ dữ liệu hiển thị Tag Phòng
    // ban/Vị trí ở cột "Nhân viên") - regression test cho fix JOIN thêm.
    it('luon JOIN matchedUser.department va matchedUser.position', async () => {
      const qb = buildQueryBuilderMock();
      mockAttendanceLogRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getAttendanceLogs({}, 1, Role.ADMIN, PermissionScope.ALL);

      expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('matchedUser.department', 'matchedUserDepartment');
      expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('matchedUser.position', 'matchedUserPosition');
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // AUDIT LOG - map/unmap/rematch/cleanup/sync (webhook ADMS + cron tự động
  // KHÔNG audit vì không phải hành động của người dùng).
  // ══════════════════════════════════════════════════════════════════════
  describe('audit log', () => {
    it('mapUser -> MAP_ZK_DEVICE_USER: old = mã máy CŨ (chụp trước khi ghi đè), new = mã mới + số log khớp lại', async () => {
      mockUserRepo.findOneByOrFail.mockResolvedValue({
        id: 2, name: 'Nguyễn Văn A', email: 'a@az.vn', departmentId: 5, zkDeviceUserId: '11',
      });
      (service as any).rematchUnmatchedLogs.mockResolvedValue(4);

      await service.mapUser(2, '22', 1, Role.ADMIN);

      expect(mockAuditService.logActionAsync).toHaveBeenCalledWith(
        1, 'MAP_ZK_DEVICE_USER', 'user', 2,
        { userId: 2, name: 'Nguyễn Văn A', email: 'a@az.vn', zkDeviceUserId: '11' },
        { userId: 2, name: 'Nguyễn Văn A', email: 'a@az.vn', zkDeviceUserId: '22', rematchedLogs: 4 },
      );
    });

    it('mapUser bị chặn quyền phòng ban (Forbidden) -> KHÔNG ghi log', async () => {
      mockUserRepo.findOneByOrFail.mockResolvedValue({ id: 2, departmentId: 9 });
      mockDepartmentManagerRepo.find.mockResolvedValue([{ departmentId: 5 }]);

      await expect(service.mapUser(2, '22', 1, 'custom_role', PermissionScope.DEPARTMENT)).rejects.toThrow(ForbiddenException);
      expect(mockAuditService.logActionAsync).not.toHaveBeenCalled();
    });

    it('unmapUser -> UNMAP_ZK_DEVICE_USER lưu mã máy bị gỡ (chụp TRƯỚC khi set null)', async () => {
      mockUserRepo.findOneBy.mockResolvedValue({
        id: 3, name: 'Trần B', email: 'b@az.vn', departmentId: 5, zkDeviceUserId: '33',
      });

      await service.unmapUser(3, 1, Role.ADMIN);

      expect(mockAuditService.logActionAsync).toHaveBeenCalledWith(
        1, 'UNMAP_ZK_DEVICE_USER', 'user', 3,
        { userId: 3, name: 'Trần B', email: 'b@az.vn', zkDeviceUserId: '33' },
        { userId: 3, name: 'Trần B', email: 'b@az.vn', zkDeviceUserId: null },
      );
    });

    it('rematchUnmatchedLogs(callerId) -> REMATCH_ATTENDANCE_LOGS; gọi nội bộ (không callerId) -> KHÔNG ghi log', async () => {
      (service as any).rematchUnmatchedLogs.mockRestore();
      jest.spyOn(service as any, 'rematchUnmatchedLogsCore').mockResolvedValue(7);

      await service.rematchUnmatchedLogs(1);
      expect(mockAuditService.logActionAsync).toHaveBeenCalledWith(
        1, 'REMATCH_ATTENDANCE_LOGS', 'attendance_log', 0, null, { updated: 7 },
      );

      mockAuditService.logActionAsync.mockClear();
      await service.rematchUnmatchedLogs();
      expect(mockAuditService.logActionAsync).not.toHaveBeenCalled();
    });

    it('cleanupOldLogs -> CLEANUP_ATTENDANCE_LOGS: chụp thống kê dòng SẮP XOÁ trước khi DELETE, new = số dòng đã xoá', async () => {
      const previewQb: any = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          total: '1200', earliest: '2025-01-02 07:58:00', latest: '2025-12-30 17:30:00', matchedUsers: '18', unmatched: '35',
        }),
      };
      const deleteQb: any = {
        delete: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1200 }),
      };
      mockAttendanceLogRepo.createQueryBuilder.mockReturnValueOnce(previewQb).mockReturnValueOnce(deleteQb);

      const result = await service.cleanupOldLogs('2026-01-01', 1);

      expect(result).toEqual({ deleted: 1200, olderThan: '2026-01-01' });
      // thống kê phải được đọc TRƯỚC khi DELETE chạy
      expect(previewQb.getRawOne.mock.invocationCallOrder[0]).toBeLessThan(deleteQb.execute.mock.invocationCallOrder[0]);
      expect(mockAuditService.logActionAsync).toHaveBeenCalledWith(
        1, 'CLEANUP_ATTENDANCE_LOGS', 'attendance_log', 0,
        {
          olderThan: '2026-01-01',
          totalRows: 1200,
          earliestRecordTime: '2025-01-02 07:58:00',
          latestRecordTime: '2025-12-30 17:30:00',
          distinctMatchedUsers: 18,
          unmatchedRows: 35,
        },
        { deleted: 1200 },
      );
    });

    it('cleanupOldLogs không truyền callerId -> giữ hành vi cũ: KHÔNG query thống kê, KHÔNG ghi log', async () => {
      const deleteQb: any = {
        delete: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 5 }),
      };
      mockAttendanceLogRepo.createQueryBuilder.mockReturnValueOnce(deleteQb);

      await service.cleanupOldLogs('2026-01-01');

      expect(mockAttendanceLogRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
      expect(mockAuditService.logActionAsync).not.toHaveBeenCalled();
    });

    it('syncNow(range, callerId) -> SYNC_ATTENDANCE_LOGS kèm tóm tắt; syncNow không callerId (cron) -> KHÔNG ghi log', async () => {
      const fakeZk = {
        createSocket: jest.fn().mockResolvedValue(undefined),
        getInfo: jest.fn().mockResolvedValue({ logCounts: 0 }),
        getUsers: jest.fn().mockResolvedValue({ data: [] }),
        disconnect: jest.fn().mockResolvedValue(undefined),
        zklibTcp: {},
      };
      jest.spyOn(service as any, 'createClient').mockReturnValue(fakeZk);
      jest.spyOn(service as any, 'upsertDeviceUserCache').mockResolvedValue(undefined);

      await service.syncNow(undefined, 1);

      expect(mockAuditService.logActionAsync).toHaveBeenCalledWith(
        1, 'SYNC_ATTENDANCE_LOGS', 'attendance_log', 0, null,
        expect.objectContaining({
          totalFetchedFromDevice: 0, insertedNew: 0, matchedToUser: 0, unmatchedDeviceUserCount: 0, partialFetch: false,
        }),
      );

      mockAuditService.logActionAsync.mockClear();
      await service.syncNow();
      expect(mockAuditService.logActionAsync).not.toHaveBeenCalled();
    });
  });
});
