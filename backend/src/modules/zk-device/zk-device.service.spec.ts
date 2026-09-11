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

describe('ZkDeviceService', () => {
  let service: ZkDeviceService;

  const mockUserRepo = {
    findOneByOrFail: jest.fn(),
    findOneBy: jest.fn(),
    save: jest.fn((u) => Promise.resolve(u)),
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
});