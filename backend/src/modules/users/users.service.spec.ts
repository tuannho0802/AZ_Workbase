import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from '../../database/entities/user.entity';
import { Department } from '../../database/entities/department.entity';
import { RoleEntity } from '../../database/entities/role.entity';
import { AuditService } from '../audit/audit.service';
import { DepartmentsService } from '../departments/departments.service';
import { UploadsService } from '../uploads/uploads.service';
import { Role } from '../../common/enums/role.enum';
import { ApprovalStatus } from '../../common/enums/approval-status.enum';

describe('UsersService - Approval workflow (đăng ký công khai chờ duyệt)', () => {
  let service: UsersService;

  // QueryBuilder giả DÙNG CHUNG cho MỌI method của service gọi
  // usersRepository.createQueryBuilder(...) - generateNextEmployeeCode()
  // (.select().where().getRawOne()), updateOwnEmail()/changeOwnPassword()
  // (.addSelect().where().getOne()), listTrash()
  // (.withDeleted().leftJoinAndSelect().where().orderBy().getMany()),
  // saveRefreshToken() (.update().set().where().execute()). Mọi method chain
  // trả về chính nó (mockReturnThis), chỉ các "terminal" method
  // (getRawOne/getOne/getMany/execute) là async thật - test riêng tự gán lại
  // giá trị trả về khi cần khác mặc định.
  const mockQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    withDeleted: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue({ maxNum: null }),
    getOne: jest.fn().mockResolvedValue(null),
    getMany: jest.fn().mockResolvedValue([]),
    execute: jest.fn().mockResolvedValue(undefined),
  };

  const mockUsersRepo = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
  };
  const mockAuditService = {
    logAction: jest.fn(),
    logActionAsync: jest.fn(),
  };
  const mockDepartmentsService = {
    findOne: jest.fn(),
  };
  // FIX: UsersService giờ inject thêm DataSource (@InjectDataSource() -
  // dùng bởi hardDeleteUser() để chạy transaction) - trước đây spec này
  // thiếu mock nên TOÀN BỘ suite (29/29 test, kể cả các test không liên
  // quan gì tới xoá user) fail ngay từ bước
  // `Test.createTestingModule().compile()`: "Nest can't resolve
  // dependencies of the UsersService (... ?)... argument DataSource at
  // index [5] is available in the RootTestModule module". `transaction()`
  // giả chạy callback với 1 `manager` giả có `.query()` - đủ để test hành
  // vi gọi transaction đúng cách mà không cần DB thật.
  const mockTransactionManager = {
    query: jest.fn().mockResolvedValue(undefined),
  };
  const mockDataSource = {
    transaction: jest.fn(async (cb: any) => cb(mockTransactionManager)),
  };
  // FIX: UsersService giờ inject thêm DepartmentRepository (dùng bởi
  // UsersAccessHelper.getManagedDepartmentIds/canManageUser - PERMISSIONS.md
  // mục 2.2/2.8) - trước đây spec này thiếu mock nên toàn bộ suite fail khi
  // Nest không resolve được dependency thứ 2 của constructor.
  const mockDepartmentsRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
  };
  // FIX: UsersService giờ inject thêm RoleEntityRepository (dùng bởi
  // validateRoleExists() - PERMISSIONS.md "role must be one of the
  // following values" bug fix) - spec này thiếu mock nên TOÀN BỘ suite
  // (kể cả các test không liên quan gì tới role) fail ngay từ bước
  // `Test.createTestingModule().compile()`, trước khi chạy tới bất kỳ
  // `it()` nào - Nest không resolve được dependency thứ 3 của constructor.
  // Mặc định `exists` trả `true` (role hợp lệ) để các test cũ (không nhắm
  // vào hành vi validate role) không bị ảnh hưởng ngoài ý muốn; test riêng
  // cho hành vi validate role đặt `mockResolvedValueOnce(false)`.
  const mockRoleRepo = {
    exists: jest.fn().mockResolvedValue(true),
  };
  // FIX: UsersService giờ inject thêm UploadsService (dùng bởi
  // signAvatarUrl()/signAvatarUrls()/updateOwnAvatar() - tính năng avatar
  // qua Backblaze B2, xem PLAN_AVATAR_LEAVE_ATTACHMENT_BACKBLAZE_B2.md) -
  // spec này thiếu mock nên TOÀN BỘ suite (50/50 test, kể cả test không
  // liên quan gì tới avatar) fail ngay từ bước
  // `Test.createTestingModule().compile()`: "Nest can't resolve
  // dependencies of the UsersService (...) argument UploadsService at
  // index [5]". `avatarsBucket` là getter thật trong UploadsService (đọc
  // biến môi trường B2_BUCKET_AVATARS) nên mock bằng 1 string cố định,
  // không phải jest.fn().
  const mockUploadsService = {
    signAvatarGetUrl: jest.fn().mockResolvedValue('https://signed-get-url.example/avatar.webp'),
    getLimits: jest.fn().mockResolvedValue({
      avatarMaxSizeKb: 1024,
      leaveAttachmentMaxSizeKb: 1536,
      leaveAttachmentMaxCount: 5,
    }),
    assertUploadedSizeWithinLimit: jest.fn().mockResolvedValue(undefined),
    deleteAvatar: jest.fn().mockResolvedValue(undefined),
    avatarsBucket: 'az-imgs-avatars-workbase',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // jest.clearAllMocks() xoá luôn implementation .mockReturnThis()/
    // .mockResolvedValue() của queryBuilder giả - phải gán lại SAU khi clear.
    mockQueryBuilder.select.mockReturnThis();
    mockQueryBuilder.addSelect.mockReturnThis();
    mockQueryBuilder.where.mockReturnThis();
    mockQueryBuilder.andWhere.mockReturnThis();
    mockQueryBuilder.orderBy.mockReturnThis();
    mockQueryBuilder.leftJoinAndSelect.mockReturnThis();
    mockQueryBuilder.withDeleted.mockReturnThis();
    mockQueryBuilder.update.mockReturnThis();
    mockQueryBuilder.set.mockReturnThis();
    mockQueryBuilder.getRawOne.mockResolvedValue({ maxNum: null });
    mockQueryBuilder.getOne.mockResolvedValue(null);
    mockQueryBuilder.getMany.mockResolvedValue([]);
    mockQueryBuilder.execute.mockResolvedValue(undefined);
    mockRoleRepo.exists.mockResolvedValue(true);
    mockUploadsService.signAvatarGetUrl.mockResolvedValue('https://signed-get-url.example/avatar.webp');
    mockUploadsService.getLimits.mockResolvedValue({
      avatarMaxSizeKb: 1024,
      leaveAttachmentMaxSizeKb: 1536,
      leaveAttachmentMaxCount: 5,
    });
    mockUploadsService.assertUploadedSizeWithinLimit.mockResolvedValue(undefined);
    mockUploadsService.deleteAvatar.mockResolvedValue(undefined);
    mockTransactionManager.query.mockResolvedValue(undefined);
    mockDataSource.transaction.mockImplementation(async (cb: any) => cb(mockTransactionManager));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: mockUsersRepo },
        { provide: getRepositoryToken(Department), useValue: mockDepartmentsRepo },
        { provide: getRepositoryToken(RoleEntity), useValue: mockRoleRepo },
        { provide: AuditService, useValue: mockAuditService },
        { provide: DepartmentsService, useValue: mockDepartmentsService },
        { provide: UploadsService, useValue: mockUploadsService },
        { provide: getDataSourceToken(), useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('nên khởi tạo thành công service', () => {
    expect(service).toBeDefined();
  });

  describe('createPendingRegistration - Tạo user từ luồng tự đăng ký', () => {
    it('LUÔN tạo role=EMPLOYEE và approvalStatus=PENDING, bất kể data đầu vào', async () => {
      mockUsersRepo.create.mockImplementation((input: any) => input);
      mockUsersRepo.save.mockImplementation((entity: any) =>
        Promise.resolve({ id: 99, ...entity }),
      );

      const result = await service.createPendingRegistration({
        name: 'Nguyễn Văn A',
        email: 'a@example.com',
        password: 'da-hash-san',
      });

      // ⚠️ Đây là điểm quan trọng nhất của toàn bộ tính năng - hardcode cứng
      // role/approvalStatus, KHÔNG nhận từ tham số ngoài (tránh privilege
      // escalation qua endpoint đăng ký công khai).
      expect(mockUsersRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          role: Role.EMPLOYEE,
          approvalStatus: ApprovalStatus.PENDING,
          isActive: true,
        }),
      );
      expect(result).toEqual(expect.objectContaining({ id: 99, email: 'a@example.com' }));
    });

    it('lưu đúng phone/departmentId khi có truyền vào, null/undefined khi không', async () => {
      mockUsersRepo.create.mockImplementation((input: any) => input);
      mockUsersRepo.save.mockImplementation((entity: any) => Promise.resolve(entity));
      mockDepartmentsService.findOne.mockResolvedValue({ id: 3, name: 'Kinh doanh', isActive: true });

      await service.createPendingRegistration({
        name: 'B',
        email: 'b@example.com',
        password: 'hash',
        phone: '0912345678',
        departmentId: 3,
      });

      expect(mockUsersRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ phone: '0912345678', departmentId: 3 }),
      );
    });

    it('KHÔNG gọi kiểm tra department nếu không truyền departmentId (tránh gọi thừa)', async () => {
      mockUsersRepo.create.mockImplementation((input: any) => input);
      mockUsersRepo.save.mockImplementation((entity: any) => Promise.resolve(entity));

      await service.createPendingRegistration({
        name: 'C',
        email: 'c@example.com',
        password: 'hash',
      });

      expect(mockDepartmentsService.findOne).not.toHaveBeenCalled();
    });

    it('⚠️ KIỂM TRA TÍNH THỐNG NHẤT DỮ LIỆU: ném lỗi nếu departmentId không tồn tại (endpoint công khai, ai cũng gửi được ID bịa)', async () => {
      mockDepartmentsService.findOne.mockRejectedValue(
        new NotFoundException('Không tìm thấy phòng ban với ID 999'),
      );

      await expect(
        service.createPendingRegistration({
          name: 'D',
          email: 'd@example.com',
          password: 'hash',
          departmentId: 999,
        }),
      ).rejects.toThrow(NotFoundException);

      // Không được lưu user khi department không hợp lệ - phải fail SỚM,
      // trước khi chạm tới usersRepository.save().
      expect(mockUsersRepo.save).not.toHaveBeenCalled();
    });

    it('⚠️ ném BadRequestException nếu departmentId tồn tại nhưng đã bị vô hiệu hoá (isActive=false) - không cho "lách" qua phòng ban không hiện trong danh sách công khai', async () => {
      mockDepartmentsService.findOne.mockResolvedValue({
        id: 5,
        name: 'Phòng đã đóng',
        isActive: false,
      });

      await expect(
        service.createPendingRegistration({
          name: 'E',
          email: 'e@example.com',
          password: 'hash',
          departmentId: 5,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockUsersRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('findPendingApprovals - Danh sách chờ duyệt', () => {
    it('chỉ lọc theo approvalStatus=PENDING, sắp xếp cũ nhất trước (FIFO)', async () => {
      mockUsersRepo.find.mockResolvedValue([]);

      await service.findPendingApprovals(1, Role.ADMIN, 'all');

      expect(mockUsersRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { approvalStatus: ApprovalStatus.PENDING },
          order: { createdAt: 'ASC' },
        }),
      );
    });

    // ── PERMISSIONS.md mục 2.8: Manager chỉ thấy user đăng ký vào ĐÚNG
    // phòng ban mình quản lý - khoá lại hành vi này bằng spec, trước đây
    // code đã đúng nhưng hoàn toàn chưa có test nào che phủ nhánh Manager.
    it('MANAGER: chỉ lọc user đăng ký vào phòng ban mình quản lý (departmentId IN managedIds)', async () => {
      mockDepartmentsRepo.find.mockResolvedValue([{ id: 2 }, { id: 5 }]);
      mockUsersRepo.find.mockResolvedValue([]);

      await service.findPendingApprovals(7, Role.MANAGER, 'department');

      expect(mockDepartmentsRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { managerUserId: 7 } }),
      );
      expect(mockUsersRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { approvalStatus: ApprovalStatus.PENDING, departmentId: expect.anything() },
        }),
      );
    });

    it('MANAGER chưa quản lý phòng ban nào: trả về [] NGAY, không gọi usersRepository.find (tránh lộ toàn bộ danh sách)', async () => {
      mockDepartmentsRepo.find.mockResolvedValue([]);

      const result = await service.findPendingApprovals(7, Role.MANAGER, 'department');

      expect(result).toEqual([]);
      expect(mockUsersRepo.find).not.toHaveBeenCalled();
    });
  });

  describe('approveUser - Duyệt tài khoản', () => {
    const pendingUser = () => ({
      id: 10,
      email: 'a@example.com',
      role: Role.EMPLOYEE,
      approvalStatus: ApprovalStatus.PENDING,
      departmentId: null,
      rejectionReason: null,
    });

    it('ném NotFoundException nếu không tìm thấy user', async () => {
      mockUsersRepo.findOne.mockResolvedValue(null);

      await expect(service.approveUser(999, 1, Role.ADMIN, 'all')).rejects.toThrow(NotFoundException);
    });

    it('ném BadRequestException nếu user không ở trạng thái PENDING (vd đã approved/rejected từ trước)', async () => {
      mockUsersRepo.findOne.mockResolvedValue({
        ...pendingUser(),
        approvalStatus: ApprovalStatus.APPROVED,
      });

      await expect(service.approveUser(10, 1, Role.ADMIN, 'all')).rejects.toThrow(BadRequestException);
    });

    it('chuyển approvalStatus sang APPROVED, ghi approvedById/approvedAt, KHÔNG đổi role nếu không truyền override', async () => {
      mockUsersRepo.findOne.mockResolvedValue(pendingUser());
      mockUsersRepo.save.mockImplementation((u: any) => Promise.resolve(u));

      const result = await service.approveUser(10, 5, Role.ADMIN, 'all');

      expect(result.approvalStatus).toBe(ApprovalStatus.APPROVED);
      expect(mockUsersRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          approvalStatus: ApprovalStatus.APPROVED,
          approvedById: 5,
          role: Role.EMPLOYEE, // giữ nguyên, không override
        }),
      );
      expect(mockUsersRepo.save.mock.calls[0][0].approvedAt).toBeInstanceOf(Date);
    });

    it('đổi role/departmentId theo overrides khi duyệt kèm chỉ định', async () => {
      mockUsersRepo.findOne.mockResolvedValue(pendingUser());
      mockUsersRepo.save.mockImplementation((u: any) => Promise.resolve(u));

      await service.approveUser(10, 5, Role.ADMIN, 'all', { role: Role.MANAGER, departmentId: 2 });

      expect(mockUsersRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ role: Role.MANAGER, departmentId: 2 }),
      );
    });

    it('KHÔNG trả về password trong kết quả (dùng omitPassword)', async () => {
      mockUsersRepo.findOne.mockResolvedValue(pendingUser());
      mockUsersRepo.save.mockImplementation((u: any) =>
        Promise.resolve({ ...u, password: 'hash-bi-lo' }),
      );

      const result = await service.approveUser(10, 5, Role.ADMIN, 'all');

      expect((result as any).password).toBeUndefined();
    });

    // ── PERMISSIONS.md mục 2.8: Manager chỉ duyệt được tài khoản đăng ký
    // ĐÚNG phòng ban mình quản lý - trước đây code đã đúng nhưng chưa có
    // spec nào khoá lại hành vi này (kể cả 3 case: đúng phòng ban / sai
    // phòng ban / đổi departmentId sang phòng ban không quản lý).
    it('MANAGER duyệt user đăng ký ĐÚNG phòng ban mình quản lý -> thành công', async () => {
      mockUsersRepo.findOne.mockResolvedValue({ ...pendingUser(), departmentId: 2 });
      mockDepartmentsRepo.find.mockResolvedValue([{ id: 2 }]);
      mockUsersRepo.save.mockImplementation((u: any) => Promise.resolve(u));

      const result = await service.approveUser(10, 7, Role.MANAGER, 'department');

      expect(result.approvalStatus).toBe(ApprovalStatus.APPROVED);
    });

    it('MANAGER duyệt user đăng ký SAI phòng ban (không quản lý) -> ForbiddenException, KHÔNG được save', async () => {
      mockUsersRepo.findOne.mockResolvedValue({ ...pendingUser(), departmentId: 99 });
      mockDepartmentsRepo.find.mockResolvedValue([{ id: 2 }]); // chỉ quản lý phòng 2, không phải 99

      await expect(service.approveUser(10, 7, Role.MANAGER, 'department')).rejects.toThrow(ForbiddenException);
      expect(mockUsersRepo.save).not.toHaveBeenCalled();
    });

    it('MANAGER duyệt đúng phòng ban NHƯNG override sang phòng ban không quản lý -> ForbiddenException', async () => {
      mockUsersRepo.findOne.mockResolvedValue({ ...pendingUser(), departmentId: 2 });
      mockDepartmentsRepo.find.mockResolvedValue([{ id: 2 }]); // chỉ quản lý phòng 2

      await expect(
        service.approveUser(10, 7, Role.MANAGER, 'department', { departmentId: 99 }),
      ).rejects.toThrow(ForbiddenException);
      expect(mockUsersRepo.save).not.toHaveBeenCalled();
    });

    it('MANAGER duyệt user CHƯA có departmentId (đăng ký không chọn phòng ban) -> ForbiddenException (không có gì để đối chiếu quyền quản lý)', async () => {
      mockUsersRepo.findOne.mockResolvedValue({ ...pendingUser(), departmentId: null });
      mockDepartmentsRepo.find.mockResolvedValue([{ id: 2 }]);

      await expect(service.approveUser(10, 7, Role.MANAGER, 'department')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('rejectUser - Từ chối tài khoản', () => {
    const pendingUser = () => ({
      id: 11,
      approvalStatus: ApprovalStatus.PENDING,
      rejectionReason: null,
    });

    it('ném NotFoundException nếu không tìm thấy user', async () => {
      mockUsersRepo.findOne.mockResolvedValue(null);

      await expect(service.rejectUser(999, 1, Role.ADMIN, 'all', 'lý do')).rejects.toThrow(NotFoundException);
    });

    it('ném BadRequestException nếu user không ở trạng thái PENDING', async () => {
      mockUsersRepo.findOne.mockResolvedValue({
        ...pendingUser(),
        approvalStatus: ApprovalStatus.REJECTED,
      });

      await expect(service.rejectUser(11, 1, Role.ADMIN, 'all', 'lý do')).rejects.toThrow(BadRequestException);
    });

    it('chuyển approvalStatus sang REJECTED, lưu đúng lý do (trim khoảng trắng)', async () => {
      mockUsersRepo.findOne.mockResolvedValue(pendingUser());
      mockUsersRepo.save.mockImplementation((u: any) => Promise.resolve(u));

      const result = await service.rejectUser(11, 5, Role.ADMIN, 'all', '  Không hợp lệ  ');

      expect(result.approvalStatus).toBe(ApprovalStatus.REJECTED);
      expect(mockUsersRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ rejectionReason: 'Không hợp lệ' }),
      );
    });

    it('lưu rejectionReason = null nếu không truyền lý do (hoặc chuỗi rỗng)', async () => {
      mockUsersRepo.findOne.mockResolvedValue(pendingUser());
      mockUsersRepo.save.mockImplementation((u: any) => Promise.resolve(u));

      await service.rejectUser(11, 5, Role.ADMIN, 'all', '   ');

      expect(mockUsersRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ rejectionReason: null }),
      );
    });

    // ── PERMISSIONS.md mục 2.8: cùng rule với approveUser - Manager chỉ từ
    // chối được tài khoản đăng ký đúng phòng ban mình quản lý.
    it('MANAGER từ chối user đăng ký ĐÚNG phòng ban mình quản lý -> thành công', async () => {
      mockUsersRepo.findOne.mockResolvedValue({ ...pendingUser(), departmentId: 2 });
      mockDepartmentsRepo.find.mockResolvedValue([{ id: 2 }]);
      mockUsersRepo.save.mockImplementation((u: any) => Promise.resolve(u));

      const result = await service.rejectUser(11, 7, Role.MANAGER, 'department', 'Không đủ hồ sơ');

      expect(result.approvalStatus).toBe(ApprovalStatus.REJECTED);
    });

    it('MANAGER từ chối user đăng ký SAI phòng ban (không quản lý) -> ForbiddenException, KHÔNG được save', async () => {
      mockUsersRepo.findOne.mockResolvedValue({ ...pendingUser(), departmentId: 99 });
      mockDepartmentsRepo.find.mockResolvedValue([{ id: 2 }]);

      await expect(service.rejectUser(11, 7, Role.MANAGER, 'department', 'lý do')).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockUsersRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('Mã nhân viên (employeeCode) - tự sinh AZ+N tăng dần', () => {
    it('createPendingRegistration: tự sinh "AZ001" khi CHƯA có mã nào khớp định dạng AZ<số>', async () => {
      mockQueryBuilder.getRawOne.mockResolvedValue({ maxNum: null });
      mockUsersRepo.create.mockImplementation((input: any) => input);
      mockUsersRepo.save.mockImplementation((entity: any) => Promise.resolve({ id: 1, ...entity }));

      await service.createPendingRegistration({
        name: 'A',
        email: 'a@example.com',
        password: 'hash',
      });

      expect(mockUsersRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ employeeCode: 'AZ001' }),
      );
    });

    it('createPendingRegistration: mã lớn nhất hiện có là AZ005 -> sinh tiếp "AZ006"', async () => {
      mockQueryBuilder.getRawOne.mockResolvedValue({ maxNum: '5' });
      mockUsersRepo.create.mockImplementation((input: any) => input);
      mockUsersRepo.save.mockImplementation((entity: any) => Promise.resolve({ id: 1, ...entity }));

      await service.createPendingRegistration({
        name: 'A',
        email: 'a@example.com',
        password: 'hash',
      });

      expect(mockUsersRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ employeeCode: 'AZ006' }),
      );
    });

    it('create (admin thêm nhân viên): tự sinh mã nếu không nhập employeeCode', async () => {
      mockUsersRepo.findOne.mockResolvedValue(null); // không trùng email
      mockQueryBuilder.getRawOne.mockResolvedValue({ maxNum: '10' });
      mockUsersRepo.create.mockImplementation((input: any) => input);
      mockUsersRepo.save.mockImplementation((entity: any) => Promise.resolve({ id: 2, ...entity }));

      await service.create(
        { email: 'x@example.com', name: 'X', password: 'Password@123', role: Role.EMPLOYEE } as any,
        1,
        Role.ADMIN,
      );

      expect(mockUsersRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ employeeCode: 'AZ011' }),
      );
    });

    it('create: admin nhập tay employeeCode đã tồn tại -> ConflictException, KHÔNG gọi save', async () => {
      // Lần findOne đầu = check trùng email (null = chưa trùng), lần 2 = check trùng mã (có -> trùng).
      mockUsersRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 5, employeeCode: 'AZ005' });

      await expect(
        service.create(
          {
            email: 'y@example.com',
            name: 'Y',
            password: 'Password@123',
            role: Role.EMPLOYEE,
            employeeCode: 'AZ005',
          } as any,
          1,
          Role.ADMIN,
        ),
      ).rejects.toThrow(ConflictException);
      expect(mockUsersRepo.save).not.toHaveBeenCalled();
    });

    it('create: admin nhập tay employeeCode chưa tồn tại -> dùng đúng mã đó, KHÔNG tự sinh', async () => {
      mockUsersRepo.findOne
        .mockResolvedValueOnce(null) // check trùng email
        .mockResolvedValueOnce(null); // check trùng mã -> chưa có ai dùng
      mockUsersRepo.create.mockImplementation((input: any) => input);
      mockUsersRepo.save.mockImplementation((entity: any) => Promise.resolve({ id: 3, ...entity }));

      await service.create(
        {
          email: 'z@example.com',
          name: 'Z',
          password: 'Password@123',
          role: Role.EMPLOYEE,
          employeeCode: 'AZ099',
        } as any,
        1,
        Role.ADMIN,
      );

      expect(mockUsersRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ employeeCode: 'AZ099' }),
      );
      // Không cần gọi tới generateNextEmployeeCode() (queryBuilder) khi đã có mã nhập tay hợp lệ.
      expect(mockUsersRepo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // PROFILE TỰ PHỤC VỤ (updateOwnProfile/updateOwnEmail/changeOwnPassword) +
  // XOÁ TÀI KHOẢN MỀM -> CỨNG (softDeleteUser/listTrash/restoreUser/
  // hardDeleteUser) - coverage mới cho các method thêm ở commit
  // "Feat: Setup for Delete user and profile can editable" /
  // "Feat: Update for user service and controller, add more dto".
  // ==========================================================================
  describe('updateOwnProfile - Tự sửa tên/SĐT của chính mình', () => {
    it('ném NotFoundException nếu không tìm thấy user', async () => {
      mockUsersRepo.findOne.mockResolvedValue(null);

      await expect(service.updateOwnProfile(1, { name: 'A' })).rejects.toThrow(NotFoundException);
      expect(mockUsersRepo.save).not.toHaveBeenCalled();
    });

    it('chỉ cập nhật field có truyền vào (name/phone), bỏ qua field undefined, ghi audit log', async () => {
      const existing = { id: 1, name: 'Cũ', phone: '0900000000', email: 'a@x.com' };
      mockUsersRepo.findOne.mockResolvedValue(existing);
      mockUsersRepo.save.mockImplementation((u: any) => Promise.resolve(u));

      const result = await service.updateOwnProfile(1, { name: 'Mới' });

      expect(mockUsersRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Mới', phone: '0900000000' }),
      );
      expect(result.name).toBe('Mới');
      expect(mockAuditService.logActionAsync).toHaveBeenCalledWith(
        1,
        'UPDATE_OWN_PROFILE',
        'user',
        1,
        expect.any(Object),
        expect.any(Object),
      );
    });
  });

  describe('updateOwnEmail - Tự đổi Email (cần nhập lại mật khẩu hiện tại)', () => {
    it('ném NotFoundException nếu không tìm thấy user', async () => {
      mockQueryBuilder.getOne.mockResolvedValue(null);

      await expect(
        service.updateOwnEmail(1, { email: 'new@x.com', currentPassword: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('ném UnauthorizedException nếu mật khẩu hiện tại sai', async () => {
      const hashed = await bcrypt.hash('MatKhauDung', 10);
      mockQueryBuilder.getOne.mockResolvedValue({ id: 1, email: 'old@x.com', password: hashed });

      await expect(
        service.updateOwnEmail(1, { email: 'new@x.com', currentPassword: 'SAI' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockUsersRepo.save).not.toHaveBeenCalled();
    });

    it('ném ConflictException nếu email mới đã bị người khác dùng', async () => {
      const hashed = await bcrypt.hash('MatKhauDung', 10);
      mockQueryBuilder.getOne.mockResolvedValue({ id: 1, email: 'old@x.com', password: hashed });
      mockUsersRepo.findOne.mockResolvedValue({ id: 2, email: 'new@x.com' });

      await expect(
        service.updateOwnEmail(1, { email: 'new@x.com', currentPassword: 'MatKhauDung' }),
      ).rejects.toThrow(ConflictException);
      expect(mockUsersRepo.save).not.toHaveBeenCalled();
    });

    it('KHÔNG check trùng nếu email mới trùng chính email cũ (không đổi gì)', async () => {
      const hashed = await bcrypt.hash('MatKhauDung', 10);
      mockQueryBuilder.getOne.mockResolvedValue({ id: 1, email: 'old@x.com', password: hashed });
      mockUsersRepo.save.mockImplementation((u: any) => Promise.resolve(u));

      await service.updateOwnEmail(1, { email: 'old@x.com', currentPassword: 'MatKhauDung' });

      expect(mockUsersRepo.findOne).not.toHaveBeenCalled();
      expect(mockUsersRepo.save).toHaveBeenCalled();
    });

    it('đổi Email thành công khi mật khẩu đúng và email chưa ai dùng, ghi audit log', async () => {
      const hashed = await bcrypt.hash('MatKhauDung', 10);
      mockQueryBuilder.getOne.mockResolvedValue({ id: 1, email: 'old@x.com', password: hashed });
      mockUsersRepo.findOne.mockResolvedValue(null); // chưa ai dùng email mới
      mockUsersRepo.save.mockImplementation((u: any) => Promise.resolve(u));

      const result = await service.updateOwnEmail(1, { email: 'new@x.com', currentPassword: 'MatKhauDung' });

      expect(result.email).toBe('new@x.com');
      expect(mockAuditService.logActionAsync).toHaveBeenCalledWith(
        1,
        'UPDATE_OWN_EMAIL',
        'user',
        1,
        { email: 'old@x.com' },
        { email: 'new@x.com' },
      );
    });
  });

  describe('changeOwnPassword - Tự đổi mật khẩu (cần mật khẩu hiện tại + nhập lại khớp)', () => {
    it('ném BadRequestException nếu newPassword/confirmNewPassword không khớp', async () => {
      await expect(
        service.changeOwnPassword(1, {
          currentPassword: 'x',
          newPassword: 'MoiA@123',
          confirmNewPassword: 'MoiB@123',
        }),
      ).rejects.toThrow(BadRequestException);
      // Fail ngay ở bước validate, không được đụng tới DB.
      expect(mockUsersRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('ném NotFoundException nếu không tìm thấy user', async () => {
      mockQueryBuilder.getOne.mockResolvedValue(null);

      await expect(
        service.changeOwnPassword(1, {
          currentPassword: 'x',
          newPassword: 'MoiA@123',
          confirmNewPassword: 'MoiA@123',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('ném UnauthorizedException nếu mật khẩu hiện tại sai', async () => {
      const hashed = await bcrypt.hash('MatKhauDung', 10);
      mockQueryBuilder.getOne.mockResolvedValue({ id: 1, password: hashed });

      await expect(
        service.changeOwnPassword(1, {
          currentPassword: 'SAI',
          newPassword: 'MoiA@123',
          confirmNewPassword: 'MoiA@123',
        }),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockUsersRepo.update).not.toHaveBeenCalled();
    });

    it('đổi mật khẩu thành công: hash mật khẩu mới, thu hồi refresh token, ghi audit log', async () => {
      const hashed = await bcrypt.hash('MatKhauDung', 10);
      mockQueryBuilder.getOne.mockResolvedValue({ id: 1, password: hashed });
      mockUsersRepo.update.mockResolvedValue(undefined);

      const result = await service.changeOwnPassword(1, {
        currentPassword: 'MatKhauDung',
        newPassword: 'MoiA@123',
        confirmNewPassword: 'MoiA@123',
      });

      expect(result.success).toBe(true);
      expect(mockUsersRepo.update).toHaveBeenCalledWith(1, { password: expect.any(String) });
      // saveRefreshToken(userId, null) đi qua createQueryBuilder().update().set().where().execute()
      expect(mockQueryBuilder.execute).toHaveBeenCalled();
      expect(mockAuditService.logActionAsync).toHaveBeenCalledWith(
        1,
        'CHANGE_OWN_PASSWORD',
        'user',
        1,
        null,
        expect.any(Object),
      );
    });
  });

  describe('softDeleteUser - Xoá mềm (chuyển vào thùng rác)', () => {
    it('ném ForbiddenException nếu tự xoá chính mình, KHÔNG đụng tới DB', async () => {
      await expect(service.softDeleteUser(5, 5)).rejects.toThrow(ForbiddenException);
      expect(mockUsersRepo.findOne).not.toHaveBeenCalled();
    });

    it('ném NotFoundException nếu không tìm thấy user', async () => {
      mockUsersRepo.findOne.mockResolvedValue(null);

      await expect(service.softDeleteUser(2, 1)).rejects.toThrow(NotFoundException);
    });

    it('xoá mềm thành công: set deletedAt/deletedById, thu hồi refresh token, ghi audit log', async () => {
      mockUsersRepo.findOne.mockResolvedValue({ id: 2, name: 'B' });
      mockUsersRepo.update.mockResolvedValue(undefined);

      const result = await service.softDeleteUser(2, 1);

      expect(result.success).toBe(true);
      expect(mockUsersRepo.update).toHaveBeenCalledWith(
        2,
        expect.objectContaining({ deletedAt: expect.any(Date), deletedById: 1 }),
      );
      expect(mockAuditService.logActionAsync).toHaveBeenCalledWith(
        1,
        'SOFT_DELETE_USER',
        'user',
        2,
        null,
        expect.any(Object),
      );
    });
  });

  describe('listTrash - Danh sách tài khoản đã xoá mềm', () => {
    it('build đúng query: withDeleted + where deletedAt IS NOT NULL + order theo deletedAt DESC', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([{ id: 2, deletedAt: new Date() }]);

      const result = await service.listTrash();

      expect(mockQueryBuilder.withDeleted).toHaveBeenCalled();
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('user.deletedAt IS NOT NULL');
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('user.deletedAt', 'DESC');
      expect(result).toHaveLength(1);
    });
  });

  describe('restoreUser - Khôi phục tài khoản khỏi thùng rác', () => {
    it('ném NotFoundException nếu không tìm thấy hoặc chưa từng bị xoá mềm (deletedAt null)', async () => {
      mockUsersRepo.findOne.mockResolvedValue({ id: 2, deletedAt: null });

      await expect(service.restoreUser(2, 1)).rejects.toThrow(NotFoundException);
      expect(mockUsersRepo.update).not.toHaveBeenCalled();
    });

    it('khôi phục thành công: clear deletedAt/deletedById, ghi audit log', async () => {
      mockUsersRepo.findOne.mockResolvedValue({ id: 2, deletedAt: new Date() });
      mockUsersRepo.update.mockResolvedValue(undefined);

      const result = await service.restoreUser(2, 1);

      expect(result.success).toBe(true);
      expect(mockUsersRepo.update).toHaveBeenCalledWith(2, { deletedAt: null, deletedById: null });
      expect(mockAuditService.logActionAsync).toHaveBeenCalledWith(
        1,
        'RESTORE_USER',
        'user',
        2,
        null,
        expect.any(Object),
      );
    });
  });

  describe('hardDeleteUser - Xoá vĩnh viễn (auto fallback gán data cho người xoá)', () => {
    it('ném ForbiddenException nếu tự xoá chính mình, KHÔNG đụng tới DB', async () => {
      await expect(service.hardDeleteUser(5, 5)).rejects.toThrow(ForbiddenException);
      expect(mockUsersRepo.findOne).not.toHaveBeenCalled();
    });

    it('ném NotFoundException nếu không tìm thấy user', async () => {
      mockUsersRepo.findOne.mockResolvedValue(null);

      await expect(service.hardDeleteUser(2, 1)).rejects.toThrow(NotFoundException);
    });

    it('ném BadRequestException nếu user CHƯA xoá mềm (deletedAt null) - bắt buộc xoá mềm trước', async () => {
      mockUsersRepo.findOne.mockResolvedValue({ id: 2, deletedAt: null });

      await expect(service.hardDeleteUser(2, 1)).rejects.toThrow(BadRequestException);
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it('xoá cứng thành công: chạy trong transaction, fallback assign cho callerId, xoá dòng user, ghi audit log', async () => {
      mockUsersRepo.findOne.mockResolvedValue({ id: 2, name: 'B', deletedAt: new Date() });

      const result = await service.hardDeleteUser(2, 1);

      expect(result.success).toBe(true);
      expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
      // Auto fallback: dữ liệu "assign" hiện hành gán lại cho callerId (1), không phải targetId (2).
      expect(mockTransactionManager.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE customers SET sales_user_id'),
        [1, 2],
      );
      // Lịch sử giao-nhận data (customer_assignments) bị xoá hẳn.
      expect(mockTransactionManager.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM customer_assignments'),
        [2, 2, 2, 2],
      );
      // Dòng user bị xoá hẳn ở bước cuối.
      expect(mockTransactionManager.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM users WHERE id = ?'),
        [2],
      );
      expect(mockAuditService.logActionAsync).toHaveBeenCalledWith(
        1,
        'HARD_DELETE_USER',
        'user',
        2,
        expect.any(Object),
        null,
      );
    });
  });
});