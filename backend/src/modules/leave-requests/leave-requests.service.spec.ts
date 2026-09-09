import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { LeaveRequestsService } from './leave-requests.service';
import { LeaveRequest, LeaveStatus, LeaveType } from '../../database/entities/leave-request.entity';
import { LeaveRequestAttachment } from '../../database/entities/leave-request-attachment.entity';
import { User } from '../../database/entities/user.entity';
import { Department } from '../../database/entities/department.entity';
import { Role } from '../../common/enums/role.enum';
import { PermissionScope } from '../../database/entities/role-permission.entity';
import { UploadsService } from '../uploads/uploads.service';

describe('LeaveRequestsService - Phan quyen duyet (PERMISSIONS.md muc 2.6)', () => {
  let service: LeaveRequestsService;

  const mockLeaveRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const mockUserRepo = {
    decrement: jest.fn(),
  };
  const mockDepartmentRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
  };
  const mockAttachmentRepo = {
    create: jest.fn(),
    save: jest.fn(),
  };
  const mockUploadsService = {
    getLimits: jest.fn().mockResolvedValue({
      avatarMaxSizeKb: 1024,
      leaveAttachmentMaxSizeKb: 1536,
      leaveAttachmentMaxCount: 5,
    }),
    assertUploadedSizeWithinLimit: jest.fn().mockResolvedValue(undefined),
    signAttachmentGetUrl: jest.fn().mockResolvedValue('https://signed.example/att'),
    leaveAttachmentsBucket: 'az-imgs-leave-request-workbase',
  };

  const buildQueryBuilderMock = (result: any[]) => {
    const qb: any = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(result),
    };
    return qb;
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeaveRequestsService,
        { provide: getRepositoryToken(LeaveRequest), useValue: mockLeaveRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(Department), useValue: mockDepartmentRepo },
        { provide: getRepositoryToken(LeaveRequestAttachment), useValue: mockAttachmentRepo },
        { provide: UploadsService, useValue: mockUploadsService },
      ],
    }).compile();

    service = module.get<LeaveRequestsService>(LeaveRequestsService);
  });

  it('nen khoi tao thanh cong service', () => {
    expect(service).toBeDefined();
  });

  const pendingRequest = (requesterRole: string, requesterDepartmentId: number | null) => ({
    id: 1,
    status: LeaveStatus.PENDING,
    leaveType: LeaveType.ANNUAL,
    totalDays: 1,
    requesterId: 100,
    requester: { id: 100, role: requesterRole, departmentId: requesterDepartmentId },
  });

  describe('approve() - dung bang role-cap da chot', () => {
    it('nem NotFoundException neu khong tim thay don', async () => {
      mockLeaveRepo.findOne.mockResolvedValue(null);
      await expect(service.approve(999, 1, Role.ADMIN, 'all')).rejects.toThrow(NotFoundException);
    });

    it('nem BadRequestException neu don khong o trang thai PENDING', async () => {
      mockLeaveRepo.findOne.mockResolvedValue({
        ...pendingRequest(Role.EMPLOYEE, 1),
        status: LeaveStatus.APPROVED,
      });
      await expect(service.approve(1, 1, Role.ADMIN, 'all')).rejects.toThrow(BadRequestException);
    });

    it('nguoi xin nghi la ADMIN: admin khac duyet duoc', async () => {
      mockLeaveRepo.findOne.mockResolvedValue(pendingRequest(Role.ADMIN, null));
      mockLeaveRepo.save.mockImplementation((r: any) => Promise.resolve(r));
      await expect(service.approve(1, 2, Role.ADMIN, 'all')).resolves.toBeDefined();
    });

    

    

    

    

    it('nguoi xin nghi la MANAGER: employee KHONG duoc duyet', async () => {
      mockLeaveRepo.findOne.mockResolvedValue(pendingRequest(Role.MANAGER, 1));
      await expect(service.approve(1, 9, Role.EMPLOYEE)).rejects.toThrow(ForbiddenException);
    });

    it('nguoi xin nghi la EMPLOYEE: manager DUNG phong ban quan ly -> duyet duoc', async () => {
      mockLeaveRepo.findOne.mockResolvedValue(pendingRequest(Role.EMPLOYEE, 3));
      mockDepartmentRepo.findOne.mockResolvedValue({ id: 3, managerUserId: 7 });
      mockLeaveRepo.save.mockImplementation((r: any) => Promise.resolve(r));

      await expect(service.approve(1, 7, Role.MANAGER, 'department')).resolves.toBeDefined();
      expect(mockDepartmentRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 3, managerUserId: 7 } }),
      );
    });

    it('nguoi xin nghi la EMPLOYEE: manager KHAC phong ban quan ly -> ForbiddenException', async () => {
      mockLeaveRepo.findOne.mockResolvedValue(pendingRequest(Role.EMPLOYEE, 3));
      mockDepartmentRepo.findOne.mockResolvedValue(null);

      await expect(service.approve(1, 7, Role.MANAGER, 'department')).rejects.toThrow(ForbiddenException);
      expect(mockLeaveRepo.save).not.toHaveBeenCalled();
    });

    it('nguoi xin nghi la EMPLOYEE chua co departmentId: manager KHONG duyet duoc', async () => {
      mockLeaveRepo.findOne.mockResolvedValue(pendingRequest(Role.EMPLOYEE, null));
      await expect(service.approve(1, 7, Role.MANAGER, 'department')).rejects.toThrow(ForbiddenException);
      expect(mockDepartmentRepo.findOne).not.toHaveBeenCalled();
    });

    it('nguoi xin nghi la EMPLOYEE: assistant duyet duoc bat ky phong ban nao', async () => {
      mockLeaveRepo.findOne.mockResolvedValue(pendingRequest(Role.EMPLOYEE, 3));
      mockLeaveRepo.save.mockImplementation((r: any) => Promise.resolve(r));

      await expect(service.approve(1, 9, Role.ASSISTANT, 'all')).resolves.toBeDefined();
      expect(mockDepartmentRepo.findOne).not.toHaveBeenCalled();
    });
    it('custom role + PermissionScope.DEPARTMENT -> kiểm tra theo department (chuẩn mới)', async () => {
      mockLeaveRepo.findOne.mockResolvedValue(pendingRequest(Role.EMPLOYEE, 3));
      mockDepartmentRepo.findOne.mockResolvedValue({ id: 3, managerUserId: 7 });
      mockLeaveRepo.save.mockImplementation((r: any) => Promise.resolve(r));

      await expect(service.approve(1, 7, 'custom_approver', PermissionScope.DEPARTMENT)).resolves.toBeDefined();
      expect(mockDepartmentRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 3, managerUserId: 7 } }),
      );
    });

    it('custom role + không có scope -> từ chối (không có fallback)', async () => {
      mockLeaveRepo.findOne.mockResolvedValue(pendingRequest(Role.EMPLOYEE, 3));

      await expect(service.approve(1, 7, 'custom_approver', null)).rejects.toThrow(ForbiddenException);
      expect(mockDepartmentRepo.findOne).not.toHaveBeenCalled();
    });
  });

  describe('reject() - cung rule role-cap voi approve()', () => {
    it('nem BadRequestException neu khong co ly do', async () => {
      mockLeaveRepo.findOne.mockResolvedValue(pendingRequest(Role.EMPLOYEE, 3));
      mockDepartmentRepo.findOne.mockResolvedValue({ id: 3, managerUserId: 7 });

      await expect(service.reject(1, 7, '   ', Role.MANAGER, 'department')).rejects.toThrow(BadRequestException);
    });

    it('manager KHAC phong ban -> ForbiddenException du co ly do hop le', async () => {
      mockLeaveRepo.findOne.mockResolvedValue(pendingRequest(Role.EMPLOYEE, 3));
      mockDepartmentRepo.findOne.mockResolvedValue(null);

      await expect(
        service.reject(1, 7, 'Khong du nhan su', Role.MANAGER, 'department'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findPending()/findHistory() - loc theo VIEWER_SEES_REQUESTER_ROLES + phong ban Manager', () => {
    it('EMPLOYEE goi findPending -> tra ve [] ngay, khong query DB', async () => {
      const result = await service.findPending(1, Role.EMPLOYEE);
      expect(result).toEqual([]);
      expect(mockLeaveRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('MANAGER goi findPending: ap them filter departmentId IN managedIds', async () => {
      const qb = buildQueryBuilderMock([]);
      mockLeaveRepo.createQueryBuilder.mockReturnValue(qb);
      mockDepartmentRepo.find.mockResolvedValue([{ id: 3 }]);

      await service.findPending(7, Role.MANAGER, 'department');

      expect(qb.andWhere).toHaveBeenCalledWith(
        'requester.departmentId IN (:...deptIds)',
        { deptIds: [3] },
      );
    });

    it('MANAGER chua quan ly phong ban nao -> tra ve [] ngay, khong goi getMany()', async () => {
      const qb = buildQueryBuilderMock([]);
      mockLeaveRepo.createQueryBuilder.mockReturnValue(qb);
      mockDepartmentRepo.find.mockResolvedValue([]);

      const result = await service.findPending(7, Role.MANAGER, 'department');

      expect(result).toEqual([]);
      expect(qb.getMany).not.toHaveBeenCalled();
    });

    it('ADMIN goi findPending: thay moi role, khong filter phong ban', async () => {
      const qb = buildQueryBuilderMock([]);
      mockLeaveRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findPending(1, Role.ADMIN, 'all');

      expect(qb.andWhere).not.toHaveBeenCalledWith(expect.stringContaining('requester.role IN'));
      expect(mockDepartmentRepo.find).not.toHaveBeenCalled();
    });
  });
});