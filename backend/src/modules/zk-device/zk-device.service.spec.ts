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
  const mockDepartmentRepo = {
    find: jest.fn(),
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
      mockDepartmentRepo.find.mockResolvedValue([{ id: 5 }]);
      const res = await service.mapUser(2, 'd1', 1, 'custom_role', PermissionScope.DEPARTMENT);
      expect(res.zkDeviceUserId).toBe('d1');
    });

    it('custom role + khong co scope -> bypass check phong ban (giong hET ASSISTANT cu)', async () => {
      mockUserRepo.findOneByOrFail.mockResolvedValue({ id: 2, departmentId: 5 });
      const res = await service.mapUser(2, 'd1', 1, 'custom_role', null);
      expect(res.zkDeviceUserId).toBe('d1');
    });

    it('backward-compat: MANAGER + khong co scope -> quan ly duoc nhan vien cung phong', async () => {
      mockUserRepo.findOneByOrFail.mockResolvedValue({ id: 2, departmentId: 5 });
      mockDepartmentRepo.find.mockResolvedValue([{ id: 5 }]);
      const res = await service.mapUser(2, 'd1', 1, Role.MANAGER, null);
      expect(res.zkDeviceUserId).toBe('d1');
    });
  });

  describe('getAttendanceLogs', () => {
    it('custom role + PermissionScope.DEPARTMENT -> them query andWhere cho phong ban', async () => {
      const qb = buildQueryBuilderMock();
      mockAttendanceLogRepo.createQueryBuilder.mockReturnValue(qb);
      mockDepartmentRepo.find.mockResolvedValue([{ id: 5 }]);
      
      await service.getAttendanceLogs({}, 1, 'custom_role', PermissionScope.DEPARTMENT);
      expect(qb.andWhere).toHaveBeenCalledWith('matchedUser.departmentId IN (:...deptIds)', { deptIds: [5] });
    });

    it('backward-compat: MANAGER + khong co scope -> them query andWhere', async () => {
      const qb = buildQueryBuilderMock();
      mockAttendanceLogRepo.createQueryBuilder.mockReturnValue(qb);
      mockDepartmentRepo.find.mockResolvedValue([{ id: 5 }]);
      
      await service.getAttendanceLogs({}, 1, Role.MANAGER, null);
      expect(qb.andWhere).toHaveBeenCalledWith('matchedUser.departmentId IN (:...deptIds)', { deptIds: [5] });
    });
  });
});
