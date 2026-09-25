import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Brackets } from 'typeorm';
import { LeaveRequestsService } from './leave-requests.service';
import {
  LeaveRequest,
  LeaveStatus,
  LeaveType,
} from '../../database/entities/leave-request.entity';
import { LeaveRequestAttachment } from '../../database/entities/leave-request-attachment.entity';
import { User } from '../../database/entities/user.entity';
import { Department } from '../../database/entities/department.entity';
import { DepartmentManager } from '../../database/entities/department-manager.entity';
import { Role } from '../../common/enums/role.enum';
import { PermissionScope } from '../../database/entities/role-permission.entity';
import { UploadsService } from '../uploads/uploads.service';
import { LeaveTypesService } from '../leave-types/leave-types.service';
import { AuditService } from '../audit/audit.service';

describe('LeaveRequestsService - Phan quyen duyet (PERMISSIONS.md muc 2.6)', () => {
  let service: LeaveRequestsService;

  const mockLeaveRepo = {
    findOne: jest.fn(),
    create: jest.fn((x: any) => x),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const mockUserRepo = {
    decrement: jest.fn(),
  };
  // ⚠️ MỚI: isEligibleApprover()/getManagedDepartmentIds() giờ lấy
  // DepartmentManagerRepository qua `departmentRepo.manager.getRepository
  // (DepartmentManager)` (bảng nhiều-nhiều department_managers, thay cho
  // `departmentRepo.findOne/find({where:{managerUserId}})` cũ) - xem
  // leave-requests.service.ts.
  const mockDepartmentManagerRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
  };
  const mockDepartmentRepo = {
    manager: {
      getRepository: jest.fn(() => mockDepartmentManagerRepo),
    },
  };
  const mockAttachmentRepo = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    remove: jest.fn(),
  };
  const mockUploadsService = {
    getLimits: jest.fn().mockResolvedValue({
      avatarMaxSizeKb: 1024,
      leaveAttachmentMaxSizeKb: 1536,
      leaveAttachmentMaxCount: 5,
    }),
    assertUploadedSizeWithinLimit: jest.fn().mockResolvedValue(undefined),
    signAttachmentGetUrl: jest
      .fn()
      .mockResolvedValue('https://signed.example/att'),
    deleteObject: jest.fn().mockResolvedValue(undefined),
    leaveAttachmentsBucket: 'az-imgs-leave-request-workbase',
  };
  // pendingRequest() dùng leaveType='annual' - mock luôn trả deductsAnnualBalance
  // true (khớp seed CreateLeaveTypes1781500000000), đúng hành vi cũ (ANNUAL
  // trừ annualLeaveBalance khi duyệt). Không test nào ở file này assert số
  // lần gọi decrement() cụ thể, chỉ cần getByCode() không throw.
  const mockLeaveTypesService = {
    getByCode: jest
      .fn()
      .mockResolvedValue({ code: 'annual', deductsAnnualBalance: true }),
    assertExists: jest.fn().mockResolvedValue({
      code: 'annual',
      deductsAnnualBalance: true,
      isPaid: true,
    }),
  };
  // ⚠️ MỚI: LeaveRequestsService giờ inject AuditService (ghi log tạo/duyệt/
  // từ chối/huỷ đơn) - mock rỗng, không có test nào ở file này assert lời
  // gọi audit cụ thể, chỉ cần constructor resolve được.
  const mockAuditService = {
    logActionAsync: jest.fn(),
    logAction: jest.fn(),
  };

  const buildQueryBuilderMock = (result: any[]) => {
    const qb: any = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      // ⚠️ MỚI: findAll()/findPending()/findHistory()/findTrash() giờ phân
      // trang THẬT ở DB qua `paginateList()` (item-mode: .skip().take()
      // .getManyAndCount()) thay vì trả nguyên mảng qua .getMany() như
      // trước - mock phải khớp đúng chain method mới, nếu không
      // `paginateList()` (item-mode, không truyền `weeksPerPage`) sẽ ném
      // TypeError ngay ở bước `.skip()`.
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      // Đếm attachmentCount ở findAll()/findPending()/findHistory() (xem
      // LeaveRequest.attachmentCount) - mock chain, không cần test giá trị
      // COUNT thật (đã có SQL thật chạy trong `nest build`/E2E ngoài phạm
      // vi unit test này).
      loadRelationCountAndMap: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(result),
      getManyAndCount: jest.fn().mockResolvedValue([result, result.length]),
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
        {
          provide: getRepositoryToken(Department),
          useValue: mockDepartmentRepo,
        },
        {
          provide: getRepositoryToken(LeaveRequestAttachment),
          useValue: mockAttachmentRepo,
        },
        { provide: UploadsService, useValue: mockUploadsService },
        { provide: LeaveTypesService, useValue: mockLeaveTypesService },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<LeaveRequestsService>(LeaveRequestsService);
  });

  it('nen khoi tao thanh cong service', () => {
    expect(service).toBeDefined();
  });

  const pendingRequest = (
    requesterRole: string,
    requesterDepartmentId: number | null,
    requesterLeaveApproverId: number | null = null,
  ) => ({
    id: 1,
    status: LeaveStatus.PENDING,
    leaveType: LeaveType.ANNUAL,
    totalDays: 1,
    requesterId: 100,
    requester: {
      id: 100,
      role: requesterRole,
      departmentId: requesterDepartmentId,
      leaveApproverId: requesterLeaveApproverId,
    },
  });

  // ⚠️ CẬP NHẬT (22/9): create() KHÔNG còn conflict/overlap check nữa (bypass
  // theo yêu cầu chủ dự án - xem comment "BYPASS" trong create()). Test cũ ở
  // đây từng khoá hành vi "vẫn conflict" cho vài case - nay đảo ngược lại
  // thành "không còn chặn nữa" để khoá đúng hành vi MỚI, tránh regression vô
  // tình bật lại chặn trong tương lai.
  describe('create() - KHONG con chan trung lich (bypass 22/9)', () => {
    const meetClientType = {
      code: 'meet_client',
      deductsAnnualBalance: false,
      name: 'Gặp khách',
    };

    beforeEach(() => {
      mockLeaveTypesService.assertExists.mockResolvedValue(meetClientType);
      mockAttachmentRepo.create.mockImplementation((x: any) => x);
      mockAttachmentRepo.save.mockResolvedValue([]);
      mockLeaveRepo.save.mockResolvedValue({
        id: 20,
        totalDays: 0.5,
        startDate: '2026-09-18',
        endDate: '2026-09-18',
      });
    });

    it('da co don Nua ngay (Sang) CUNG NGAY, tao them Nua ngay (Sang) TRUNG BUOI -> KHONG con bi chan', async () => {
      await expect(
        service.create(
          {
            leaveType: 'meet_client',
            startDate: '2026-09-18',
            endDate: '2026-09-18',
            duration: 'half_day_am',
            reason: 'gap khach ten: tuyen',
          },
          100,
        ),
      ).resolves.toBeDefined();

      // createQueryBuilder KHÔNG còn được gọi ở create() nữa (đã bỏ hẳn bước
      // query overlap, không chỉ bỏ bước chặn) - khoá luôn để bắt regression
      // nếu ai đó lỡ thêm lại logic đọc overlapping mà quên bỏ query.
      expect(mockLeaveRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(mockLeaveRepo.save).toHaveBeenCalled();
    });

    it('da co don FULL DAY cung ngay (kieu KHAC han), tao them Nua ngay (Chieu) -> KHONG con bi chan', async () => {
      await expect(
        service.create(
          {
            leaveType: 'meet_client',
            startDate: '2026-09-18',
            endDate: '2026-09-18',
            duration: 'half_day_pm',
            reason: 'gap khach ten: tuyen',
          },
          100,
        ),
      ).resolves.toBeDefined();
    });

    it('khong co don nao trung ngay -> tao binh thuong nhu truoc gio', async () => {
      await expect(
        service.create(
          {
            leaveType: 'meet_client',
            startDate: '2026-09-19',
            endDate: '2026-09-19',
            duration: 'half_day_pm',
            reason: 'gap khach ten: tuyen',
          },
          100,
        ),
      ).resolves.toBeDefined();
    });
  });

  describe('update() - sua don (User bao lo set sai ngay, PERMISSIONS.md muc 2.6)', () => {
    const annualType = { code: 'annual', deductsAnnualBalance: true };
    const unpaidType = { code: 'unpaid', deductsAnnualBalance: false };

    beforeEach(() => {
      mockLeaveTypesService.getByCode.mockResolvedValue(annualType);
      mockLeaveTypesService.assertExists.mockResolvedValue(unpaidType);
      (mockUserRepo as any).increment = jest.fn();
      (mockUserRepo as any).findOne = jest.fn();
    });

    it('khong tim thay don -> NotFoundException', async () => {
      mockLeaveRepo.findOne.mockResolvedValue(null);
      await expect(
        service.update(999, { startDate: '2026-09-01' }, 1, Role.ADMIN, 'all'),
      ).rejects.toThrow(NotFoundException);
    });

    it('don da CANCELLED -> khong cho sua (BadRequestException)', async () => {
      mockLeaveRepo.findOne.mockResolvedValue({
        id: 1,
        status: LeaveStatus.CANCELLED,
        requester: { departmentId: 1, leaveApproverId: null },
      });
      await expect(
        service.update(1, { startDate: '2026-09-01' }, 1, Role.ADMIN, 'all'),
      ).rejects.toThrow(BadRequestException);
    });

    it('editor khong du quyen (khong phai admin, scope khong khop) -> ForbiddenException', async () => {
      mockLeaveRepo.findOne.mockResolvedValue({
        id: 1,
        status: LeaveStatus.PENDING,
        requesterId: 100,
        leaveType: 'annual',
        totalDays: 1,
        duration: 'full_day',
        requester: { departmentId: 1, leaveApproverId: null },
      });
      mockDepartmentManagerRepo.find.mockResolvedValue([]);
      await expect(
        service.update(
          1,
          { startDate: '2026-09-01' },
          200,
          Role.MANAGER,
          PermissionScope.DEPARTMENT,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('admin sua ngay 1 don PENDING - khong dung den balance (chua tung approve)', async () => {
      const request = {
        id: 1,
        status: LeaveStatus.PENDING,
        requesterId: 100,
        leaveType: 'annual',
        startDate: '2026-09-01',
        endDate: '2026-09-01',
        duration: 'full_day',
        totalDays: 1,
        reason: 'ly do cu',
        requester: { departmentId: 1, leaveApproverId: null },
      };
      mockLeaveRepo.findOne.mockResolvedValue(request);
      mockLeaveRepo.save.mockImplementation((x: any) => x);

      const result = await service.update(
        1,
        { startDate: '2026-09-05', endDate: '2026-09-05' },
        1,
        Role.ADMIN,
        'all',
      );

      expect(result.startDate.getTime()).toBe(new Date('2026-09-05').getTime());
      expect(mockUserRepo.decrement).not.toHaveBeenCalled();
      expect((mockUserRepo as any).increment).not.toHaveBeenCalled();
    });

    it('admin sua ngay 1 don APPROVED (van cung loai phep tru phep nam) -> hoan cu, tru lai moi', async () => {
      const request = {
        id: 1,
        status: LeaveStatus.APPROVED,
        requesterId: 100,
        leaveType: 'annual',
        startDate: '2026-09-01',
        endDate: '2026-09-01',
        duration: 'full_day',
        totalDays: 1,
        reason: 'ly do cu',
        requester: { departmentId: 1, leaveApproverId: null },
      };
      mockLeaveRepo.findOne.mockResolvedValue(request);
      mockLeaveRepo.save.mockImplementation((x: any) => x);
      (mockUserRepo as any).findOne.mockResolvedValue({
        id: 100,
        annualLeaveBalance: 10,
      });

      // Doi sang 2 ngay (2026-09-05 -> 2026-09-06) -> totalDays moi = 2.
      const result = await service.update(
        1,
        { startDate: '2026-09-05', endDate: '2026-09-06' },
        1,
        Role.ADMIN,
        'all',
      );

      expect((mockUserRepo as any).increment).toHaveBeenCalledWith(
        { id: 100 },
        'annualLeaveBalance',
        1, // hoan lai totalDays CU
      );
      expect(mockUserRepo.decrement).toHaveBeenCalledWith(
        { id: 100 },
        'annualLeaveBalance',
        2, // tru lai totalDays MOI
      );
      expect(result.totalDays).toBe(2);
    });

    it('admin sua APPROVED khong du phep nam moi -> BadRequestException, hoan lai balance cu (khong de user thiet)', async () => {
      const request = {
        id: 1,
        status: LeaveStatus.APPROVED,
        requesterId: 100,
        leaveType: 'annual',
        startDate: '2026-09-01',
        endDate: '2026-09-01',
        duration: 'full_day',
        totalDays: 1,
        reason: 'ly do cu',
        requester: { departmentId: 1, leaveApproverId: null },
      };
      mockLeaveRepo.findOne.mockResolvedValue(request);
      (mockUserRepo as any).findOne.mockResolvedValue({
        id: 100,
        annualLeaveBalance: 0, // sau khi hoan 1 ngay cu van khong du 5 ngay moi
      });

      await expect(
        service.update(
          1,
          { startDate: '2026-09-05', endDate: '2026-09-09' }, // 5 ngay
          1,
          Role.ADMIN,
          'all',
        ),
      ).rejects.toThrow(BadRequestException);

      // Da hoan 1 ngay cu, roi phai tru lai dung 1 ngay do vi khong du -
      // khong duoc de user "du ra" 1 ngay phep chi vi sua don that bai.
      expect((mockUserRepo as any).increment).toHaveBeenCalledWith(
        { id: 100 },
        'annualLeaveBalance',
        1,
      );
      expect(mockUserRepo.decrement).toHaveBeenCalledWith(
        { id: 100 },
        'annualLeaveBalance',
        1,
      );
      expect(mockLeaveRepo.save).not.toHaveBeenCalled();
    });

    it('admin doi loai phep APPROVED tu annual (tru phep) sang unpaid (khong tru) -> chi hoan, khong tru lai', async () => {
      const request = {
        id: 1,
        status: LeaveStatus.APPROVED,
        requesterId: 100,
        leaveType: 'annual',
        startDate: '2026-09-01',
        endDate: '2026-09-01',
        duration: 'full_day',
        totalDays: 1,
        reason: 'ly do cu',
        requester: { departmentId: 1, leaveApproverId: null },
      };
      mockLeaveRepo.findOne.mockResolvedValue(request);
      mockLeaveRepo.save.mockImplementation((x: any) => x);

      const result = await service.update(
        1,
        { leaveType: 'unpaid' },
        1,
        Role.ADMIN,
        'all',
      );

      expect((mockUserRepo as any).increment).toHaveBeenCalledWith(
        { id: 100 },
        'annualLeaveBalance',
        1,
      );
      expect(mockUserRepo.decrement).not.toHaveBeenCalled();
      expect(result.leaveType).toBe('unpaid');
    });

    it('ngay bat dau sau ngay ket thuc -> BadRequestException', async () => {
      mockLeaveRepo.findOne.mockResolvedValue({
        id: 1,
        status: LeaveStatus.PENDING,
        requesterId: 100,
        leaveType: 'annual',
        startDate: '2026-09-01',
        endDate: '2026-09-01',
        duration: 'full_day',
        totalDays: 1,
        requester: { departmentId: 1, leaveApproverId: null },
      });
      await expect(
        service.update(
          1,
          { startDate: '2026-09-10', endDate: '2026-09-05' },
          1,
          Role.ADMIN,
          'all',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('approve() - dung bang role-cap da chot', () => {
    it('nem NotFoundException neu khong tim thay don', async () => {
      mockLeaveRepo.findOne.mockResolvedValue(null);
      await expect(service.approve(999, 1, Role.ADMIN, 'all')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('nem BadRequestException neu don khong o trang thai PENDING', async () => {
      mockLeaveRepo.findOne.mockResolvedValue({
        ...pendingRequest(Role.EMPLOYEE, 1),
        status: LeaveStatus.APPROVED,
      });
      await expect(service.approve(1, 1, Role.ADMIN, 'all')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('nguoi xin nghi la ADMIN: admin khac duyet duoc', async () => {
      mockLeaveRepo.findOne.mockResolvedValue(pendingRequest(Role.ADMIN, null));
      mockLeaveRepo.save.mockImplementation((r: any) => Promise.resolve(r));
      await expect(
        service.approve(1, 2, Role.ADMIN, 'all'),
      ).resolves.toBeDefined();
    });

    it('nguoi xin nghi la MANAGER: employee KHONG duoc duyet', async () => {
      mockLeaveRepo.findOne.mockResolvedValue(pendingRequest(Role.MANAGER, 1));
      await expect(service.approve(1, 9, Role.EMPLOYEE)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('nguoi xin nghi la EMPLOYEE: manager DUNG phong ban quan ly -> duyet duoc', async () => {
      mockLeaveRepo.findOne.mockResolvedValue(pendingRequest(Role.EMPLOYEE, 3));
      mockDepartmentManagerRepo.findOne.mockResolvedValue({
        departmentId: 3,
        userId: 7,
      });
      mockLeaveRepo.save.mockImplementation((r: any) => Promise.resolve(r));

      await expect(
        service.approve(1, 7, Role.MANAGER, 'department'),
      ).resolves.toBeDefined();
      expect(mockDepartmentManagerRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { departmentId: 3, userId: 7 } }),
      );
    });

    it('nguoi xin nghi la EMPLOYEE: manager KHAC phong ban quan ly -> ForbiddenException', async () => {
      mockLeaveRepo.findOne.mockResolvedValue(pendingRequest(Role.EMPLOYEE, 3));
      mockDepartmentManagerRepo.findOne.mockResolvedValue(null);

      await expect(
        service.approve(1, 7, Role.MANAGER, 'department'),
      ).rejects.toThrow(ForbiddenException);
      expect(mockLeaveRepo.save).not.toHaveBeenCalled();
    });

    it('nguoi xin nghi la EMPLOYEE chua co departmentId: manager KHONG duyet duoc', async () => {
      mockLeaveRepo.findOne.mockResolvedValue(
        pendingRequest(Role.EMPLOYEE, null),
      );
      await expect(
        service.approve(1, 7, Role.MANAGER, 'department'),
      ).rejects.toThrow(ForbiddenException);
      expect(mockDepartmentManagerRepo.findOne).not.toHaveBeenCalled();
    });

    it('nguoi xin nghi la EMPLOYEE: assistant duyet duoc bat ky phong ban nao', async () => {
      mockLeaveRepo.findOne.mockResolvedValue(pendingRequest(Role.EMPLOYEE, 3));
      mockLeaveRepo.save.mockImplementation((r: any) => Promise.resolve(r));

      await expect(
        service.approve(1, 9, Role.ASSISTANT, 'all'),
      ).resolves.toBeDefined();
      expect(mockDepartmentManagerRepo.findOne).not.toHaveBeenCalled();
    });
    it('custom role + PermissionScope.DEPARTMENT -> kiểm tra theo department (chuẩn mới)', async () => {
      mockLeaveRepo.findOne.mockResolvedValue(pendingRequest(Role.EMPLOYEE, 3));
      mockDepartmentManagerRepo.findOne.mockResolvedValue({
        departmentId: 3,
        userId: 7,
      });
      mockLeaveRepo.save.mockImplementation((r: any) => Promise.resolve(r));

      await expect(
        service.approve(1, 7, 'custom_approver', PermissionScope.DEPARTMENT),
      ).resolves.toBeDefined();
      expect(mockDepartmentManagerRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { departmentId: 3, userId: 7 } }),
      );
    });

    it('custom role + không có scope -> từ chối (không có fallback)', async () => {
      mockLeaveRepo.findOne.mockResolvedValue(pendingRequest(Role.EMPLOYEE, 3));

      await expect(
        service.approve(1, 7, 'custom_approver', null),
      ).rejects.toThrow(ForbiddenException);
      expect(mockDepartmentManagerRepo.findOne).not.toHaveBeenCalled();
    });

    // ── Ngoại lệ leave_approver_id (migration AddLeaveApproverOverrideToUsers) ──
    it('ngoai le leaveApproverId: requester KHAC phong ban Manager nhung duoc gan rieng -> duyet duoc, KHONG can query department', async () => {
      mockLeaveRepo.findOne.mockResolvedValue(
        pendingRequest(Role.ASSISTANT, 99, 7),
      );
      mockLeaveRepo.save.mockImplementation((r: any) => Promise.resolve(r));

      await expect(
        service.approve(1, 7, Role.MANAGER, 'department'),
      ).resolves.toBeDefined();
      // Uu tien check leaveApproverId TRUOC - khong can query department khi da khop
      expect(mockDepartmentManagerRepo.findOne).not.toHaveBeenCalled();
    });

    it('ngoai le leaveApproverId: gan cho Manager KHAC (khong phai nguoi dang duyet) -> van fallback ve rule phong ban, khong khop -> ForbiddenException', async () => {
      mockLeaveRepo.findOne.mockResolvedValue(
        pendingRequest(Role.ASSISTANT, 99, 999),
      );
      mockDepartmentManagerRepo.findOne.mockResolvedValue(null);

      await expect(
        service.approve(1, 7, Role.MANAGER, 'department'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('reject() - cung rule role-cap voi approve()', () => {
    it('nem BadRequestException neu khong co ly do', async () => {
      mockLeaveRepo.findOne.mockResolvedValue(pendingRequest(Role.EMPLOYEE, 3));
      mockDepartmentManagerRepo.findOne.mockResolvedValue({
        departmentId: 3,
        userId: 7,
      });

      await expect(
        service.reject(1, 7, '   ', Role.MANAGER, 'department'),
      ).rejects.toThrow(BadRequestException);
    });

    it('manager KHAC phong ban -> ForbiddenException du co ly do hop le', async () => {
      mockLeaveRepo.findOne.mockResolvedValue(pendingRequest(Role.EMPLOYEE, 3));
      mockDepartmentManagerRepo.findOne.mockResolvedValue(null);

      await expect(
        service.reject(1, 7, 'Khong du nhan su', Role.MANAGER, 'department'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findPending()/findHistory() - loc theo VIEWER_SEES_REQUESTER_ROLES + phong ban Manager', () => {
    it('EMPLOYEE goi findPending -> tra ve [] ngay, khong query DB', async () => {
      // ⚠️ MỚI: findPending() giờ trả về shape phân trang chuẩn
      // `{data, total, page, limit, totalPages}` (mirror mọi nhánh khác của
      // paginateList()), không còn trả mảng trần `[]` như trước.
      const result = await service.findPending(1, Role.EMPLOYEE);
      expect(result).toEqual({ data: [], total: 0, page: 1, limit: 20, totalPages: 1 });
      expect(mockLeaveRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('MANAGER goi findPending: ap them filter (phong ban dang quan ly HOAC ngoai le leaveApproverId)', async () => {
      const qb = buildQueryBuilderMock([]);
      mockLeaveRepo.createQueryBuilder.mockReturnValue(qb);
      mockDepartmentManagerRepo.find.mockResolvedValue([{ departmentId: 3 }]);

      await service.findPending(7, Role.MANAGER, 'department');

      // Khi CÓ phòng ban đang quản lý, filter gộp bằng Brackets (department
      // IN (...) OR leaveApproverId = viewerId) - không còn là 1 chuỗi
      // andWhere đơn thuần như trước, nên chỉ assert được đã áp thêm đúng 1
      // lớp filter (nội dung cụ thể bên trong Brackets được test riêng ở
      // các case approve()/reject() vì đó mới là nơi thực thi logic quyền).
      expect(qb.andWhere).toHaveBeenCalledTimes(1);
      expect(qb.andWhere.mock.calls[0][0]).toBeInstanceOf(Brackets);
    });

    it('MANAGER chua quan ly phong ban nao NHUNG co nguoi gan ngoai le -> van query theo leaveApproverId, khong tra ve [] som', async () => {
      const qb = buildQueryBuilderMock([]);
      mockLeaveRepo.createQueryBuilder.mockReturnValue(qb);
      mockDepartmentManagerRepo.find.mockResolvedValue([]);

      const result = await service.findPending(7, Role.MANAGER, 'department');

      expect(result).toEqual({ data: [], total: 0, page: 1, limit: 20, totalPages: 1 });
      expect(qb.andWhere).toHaveBeenCalledWith(
        'requester.leaveApproverId = :viewerId',
        { viewerId: 7 },
      );
      // ⚠️ MỚI: item-mode phân trang thật giờ dùng .getManyAndCount() (không
      // còn .getMany() trần) - xem paginateList().
      expect(qb.getManyAndCount).toHaveBeenCalled();
    });

    it('ADMIN goi findPending: thay moi role, khong filter phong ban', async () => {
      const qb = buildQueryBuilderMock([]);
      mockLeaveRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findPending(1, Role.ADMIN, 'all');

      expect(qb.andWhere).not.toHaveBeenCalledWith(
        expect.stringContaining('requester.role IN'),
      );
      expect(mockDepartmentManagerRepo.find).not.toHaveBeenCalled();
    });
  });

  describe('attachmentCount - dem so anh dinh kem trong list (khong can bam vao tung don)', () => {
    it('findAll() goi loadRelationCountAndMap dung field leave.attachments -> leave.attachmentCount', async () => {
      const qb = buildQueryBuilderMock([]);
      mockLeaveRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll(5);

      expect(qb.loadRelationCountAndMap).toHaveBeenCalledWith(
        'leave.attachmentCount',
        'leave.attachments',
      );
      expect(qb.where).toHaveBeenCalledWith(
        'leave.requesterId = :userId',
        { userId: 5 },
      );
    });

    it('findPending() goi loadRelationCountAndMap dung field', async () => {
      const qb = buildQueryBuilderMock([]);
      mockLeaveRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findPending(1, Role.ADMIN, 'all');

      expect(qb.loadRelationCountAndMap).toHaveBeenCalledWith(
        'leave.attachmentCount',
        'leave.attachments',
      );
    });

    it('findHistory() goi loadRelationCountAndMap dung field', async () => {
      const qb = buildQueryBuilderMock([]);
      mockLeaveRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findHistory(1, Role.ADMIN, 'all');

      expect(qb.loadRelationCountAndMap).toHaveBeenCalledWith(
        'leave.attachmentCount',
        'leave.attachments',
      );
    });
  });

  describe('cancel() - huy don TU DONG don anh dinh kem (theo yeu cau moi)', () => {
    it('nem NotFoundException neu khong tim thay don cua chinh requester', async () => {
      mockLeaveRepo.findOne.mockResolvedValue(null);
      await expect(service.cancel(1, 100)).rejects.toThrow(NotFoundException);
    });

    it('nem BadRequestException neu don khong o trang thai PENDING', async () => {
      mockLeaveRepo.findOne.mockResolvedValue({
        ...pendingRequest(Role.EMPLOYEE, 1),
        status: LeaveStatus.APPROVED,
      });
      await expect(service.cancel(1, 100)).rejects.toThrow(BadRequestException);
    });

    it('don KHONG co anh dinh kem: huy binh thuong, khong goi deleteObject/remove', async () => {
      mockLeaveRepo.findOne.mockResolvedValue({
        ...pendingRequest(Role.EMPLOYEE, 1),
        attachments: [],
      });
      mockLeaveRepo.save.mockImplementation((r: any) => Promise.resolve(r));

      const result = await service.cancel(1, 100);

      expect(result.status).toBe(LeaveStatus.CANCELLED);
      expect(mockUploadsService.deleteObject).not.toHaveBeenCalled();
      expect(mockAttachmentRepo.remove).not.toHaveBeenCalled();
    });

    it('don CO anh dinh kem: xoa het object tren B2 + xoa dong DB, khong chan huy don neu B2 loi', async () => {
      const attachments = [
        { id: 1, objectKey: 'leave-attachments/100/A_1_1-1-26.png' },
        { id: 2, objectKey: 'leave-attachments/100/A_2_1-1-26.png' },
      ];
      mockLeaveRepo.findOne.mockResolvedValue({
        ...pendingRequest(Role.EMPLOYEE, 1),
        attachments,
      });
      mockLeaveRepo.save.mockImplementation((r: any) => Promise.resolve(r));
      mockUploadsService.deleteObject
        .mockRejectedValueOnce(new Error('B2 down'))
        .mockResolvedValueOnce(undefined);

      const result = await service.cancel(1, 100);

      expect(result.status).toBe(LeaveStatus.CANCELLED);
      expect(mockUploadsService.deleteObject).toHaveBeenCalledTimes(2);
      expect(mockUploadsService.deleteObject).toHaveBeenCalledWith(
        'az-imgs-leave-request-workbase',
        'leave-attachments/100/A_1_1-1-26.png',
      );
      expect(mockAttachmentRepo.remove).toHaveBeenCalledWith(attachments);
    });
  });

  describe('discardOrphanAttachments() - xoa anh upload dang do (chua gan don nao)', () => {
    it('key KHONG dung namespace userId -> tu choi xoa (khong goi deleteObject)', async () => {
      mockAttachmentRepo.find.mockResolvedValue([]);

      const result = await service.discardOrphanAttachments(100, [
        'leave-attachments/999/hack.png',
      ]);

      expect(result).toEqual([
        {
          key: 'leave-attachments/999/hack.png',
          deleted: false,
          reason: 'not_owner',
        },
      ]);
      expect(mockUploadsService.deleteObject).not.toHaveBeenCalled();
    });

    it('key DA gan vao 1 don that trong DB -> tu choi xoa qua duong nay', async () => {
      const key = 'leave-attachments/100/A_1_1-1-26.png';
      mockAttachmentRepo.find.mockResolvedValue([{ id: 1, objectKey: key }]);

      const result = await service.discardOrphanAttachments(100, [key]);

      expect(result).toEqual([
        { key, deleted: false, reason: 'already_linked' },
      ]);
      expect(mockUploadsService.deleteObject).not.toHaveBeenCalled();
    });

    it('key dung namespace + CHUA gan don nao -> xoa that tren B2', async () => {
      const key = 'leave-attachments/100/A_1_1-1-26.png';
      mockAttachmentRepo.find.mockResolvedValue([]);
      mockUploadsService.deleteObject.mockResolvedValue(undefined);

      const result = await service.discardOrphanAttachments(100, [key]);

      expect(result).toEqual([{ key, deleted: true }]);
      expect(mockUploadsService.deleteObject).toHaveBeenCalledWith(
        'az-imgs-leave-request-workbase',
        key,
      );
    });

    it('B2 xoa loi -> tra ve deleted:false reason:error, khong throw', async () => {
      const key = 'leave-attachments/100/A_1_1-1-26.png';
      mockAttachmentRepo.find.mockResolvedValue([]);
      mockUploadsService.deleteObject.mockRejectedValue(new Error('B2 down'));

      const result = await service.discardOrphanAttachments(100, [key]);

      expect(result).toEqual([{ key, deleted: false, reason: 'error' }]);
    });
  });
});