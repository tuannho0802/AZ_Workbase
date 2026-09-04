import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from '../../database/entities/user.entity';
import { Department } from '../../database/entities/department.entity';
import { AuditService } from '../audit/audit.service';
import { DepartmentsService } from '../departments/departments.service';
import { Role } from '../../common/enums/role.enum';
import { ApprovalStatus } from '../../common/enums/approval-status.enum';

describe('UsersService - Approval workflow (đăng ký công khai chờ duyệt)', () => {
  let service: UsersService;

  // QueryBuilder giả cho generateNextEmployeeCode() - mọi method chain trả
  // về chính nó, chỉ .getRawOne() là async thật. Mặc định trả về maxNum=null
  // (chưa có mã nào khớp định dạng AZ<số>) -> mã tiếp theo luôn là "AZ001".
  const mockEmployeeCodeQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue({ maxNum: null }),
  };

  const mockUsersRepo = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(() => mockEmployeeCodeQueryBuilder),
  };
  const mockAuditService = {
    logAction: jest.fn(),
    logActionAsync: jest.fn(),
  };
  const mockDepartmentsService = {
    findOne: jest.fn(),
  };
  // FIX: UsersService giờ inject thêm DepartmentRepository (dùng bởi
  // UsersAccessHelper.getManagedDepartmentIds/canManageUser - PERMISSIONS.md
  // mục 2.2/2.8) - trước đây spec này thiếu mock nên toàn bộ suite fail khi
  // Nest không resolve được dependency thứ 2 của constructor.
  const mockDepartmentsRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // jest.clearAllMocks() xoá luôn implementation .mockReturnThis()/
    // .mockResolvedValue() của queryBuilder giả - phải gán lại SAU khi clear.
    mockEmployeeCodeQueryBuilder.select.mockReturnThis();
    mockEmployeeCodeQueryBuilder.where.mockReturnThis();
    mockEmployeeCodeQueryBuilder.getRawOne.mockResolvedValue({ maxNum: null });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: mockUsersRepo },
        { provide: getRepositoryToken(Department), useValue: mockDepartmentsRepo },
        { provide: AuditService, useValue: mockAuditService },
        { provide: DepartmentsService, useValue: mockDepartmentsService },
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

      await service.findPendingApprovals(1, Role.ADMIN);

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

      await service.findPendingApprovals(7, Role.MANAGER);

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

      const result = await service.findPendingApprovals(7, Role.MANAGER);

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

      await expect(service.approveUser(999, 1, Role.ADMIN)).rejects.toThrow(NotFoundException);
    });

    it('ném BadRequestException nếu user không ở trạng thái PENDING (vd đã approved/rejected từ trước)', async () => {
      mockUsersRepo.findOne.mockResolvedValue({
        ...pendingUser(),
        approvalStatus: ApprovalStatus.APPROVED,
      });

      await expect(service.approveUser(10, 1, Role.ADMIN)).rejects.toThrow(BadRequestException);
    });

    it('chuyển approvalStatus sang APPROVED, ghi approvedById/approvedAt, KHÔNG đổi role nếu không truyền override', async () => {
      mockUsersRepo.findOne.mockResolvedValue(pendingUser());
      mockUsersRepo.save.mockImplementation((u: any) => Promise.resolve(u));

      const result = await service.approveUser(10, 5, Role.ADMIN);

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

      await service.approveUser(10, 5, Role.ADMIN, { role: Role.MANAGER, departmentId: 2 });

      expect(mockUsersRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ role: Role.MANAGER, departmentId: 2 }),
      );
    });

    it('KHÔNG trả về password trong kết quả (dùng omitPassword)', async () => {
      mockUsersRepo.findOne.mockResolvedValue(pendingUser());
      mockUsersRepo.save.mockImplementation((u: any) =>
        Promise.resolve({ ...u, password: 'hash-bi-lo' }),
      );

      const result = await service.approveUser(10, 5, Role.ADMIN);

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

      const result = await service.approveUser(10, 7, Role.MANAGER);

      expect(result.approvalStatus).toBe(ApprovalStatus.APPROVED);
    });

    it('MANAGER duyệt user đăng ký SAI phòng ban (không quản lý) -> ForbiddenException, KHÔNG được save', async () => {
      mockUsersRepo.findOne.mockResolvedValue({ ...pendingUser(), departmentId: 99 });
      mockDepartmentsRepo.find.mockResolvedValue([{ id: 2 }]); // chỉ quản lý phòng 2, không phải 99

      await expect(service.approveUser(10, 7, Role.MANAGER)).rejects.toThrow(ForbiddenException);
      expect(mockUsersRepo.save).not.toHaveBeenCalled();
    });

    it('MANAGER duyệt đúng phòng ban NHƯNG override sang phòng ban không quản lý -> ForbiddenException', async () => {
      mockUsersRepo.findOne.mockResolvedValue({ ...pendingUser(), departmentId: 2 });
      mockDepartmentsRepo.find.mockResolvedValue([{ id: 2 }]); // chỉ quản lý phòng 2

      await expect(
        service.approveUser(10, 7, Role.MANAGER, { departmentId: 99 }),
      ).rejects.toThrow(ForbiddenException);
      expect(mockUsersRepo.save).not.toHaveBeenCalled();
    });

    it('MANAGER duyệt user CHƯA có departmentId (đăng ký không chọn phòng ban) -> ForbiddenException (không có gì để đối chiếu quyền quản lý)', async () => {
      mockUsersRepo.findOne.mockResolvedValue({ ...pendingUser(), departmentId: null });
      mockDepartmentsRepo.find.mockResolvedValue([{ id: 2 }]);

      await expect(service.approveUser(10, 7, Role.MANAGER)).rejects.toThrow(ForbiddenException);
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

      await expect(service.rejectUser(999, 1, Role.ADMIN, 'lý do')).rejects.toThrow(NotFoundException);
    });

    it('ném BadRequestException nếu user không ở trạng thái PENDING', async () => {
      mockUsersRepo.findOne.mockResolvedValue({
        ...pendingUser(),
        approvalStatus: ApprovalStatus.REJECTED,
      });

      await expect(service.rejectUser(11, 1, Role.ADMIN, 'lý do')).rejects.toThrow(BadRequestException);
    });

    it('chuyển approvalStatus sang REJECTED, lưu đúng lý do (trim khoảng trắng)', async () => {
      mockUsersRepo.findOne.mockResolvedValue(pendingUser());
      mockUsersRepo.save.mockImplementation((u: any) => Promise.resolve(u));

      const result = await service.rejectUser(11, 5, Role.ADMIN, '  Không hợp lệ  ');

      expect(result.approvalStatus).toBe(ApprovalStatus.REJECTED);
      expect(mockUsersRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ rejectionReason: 'Không hợp lệ' }),
      );
    });

    it('lưu rejectionReason = null nếu không truyền lý do (hoặc chuỗi rỗng)', async () => {
      mockUsersRepo.findOne.mockResolvedValue(pendingUser());
      mockUsersRepo.save.mockImplementation((u: any) => Promise.resolve(u));

      await service.rejectUser(11, 5, Role.ADMIN, '   ');

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

      const result = await service.rejectUser(11, 7, Role.MANAGER, 'Không đủ hồ sơ');

      expect(result.approvalStatus).toBe(ApprovalStatus.REJECTED);
    });

    it('MANAGER từ chối user đăng ký SAI phòng ban (không quản lý) -> ForbiddenException, KHÔNG được save', async () => {
      mockUsersRepo.findOne.mockResolvedValue({ ...pendingUser(), departmentId: 99 });
      mockDepartmentsRepo.find.mockResolvedValue([{ id: 2 }]);

      await expect(service.rejectUser(11, 7, Role.MANAGER, 'lý do')).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockUsersRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('Mã nhân viên (employeeCode) - tự sinh AZ+N tăng dần', () => {
    it('createPendingRegistration: tự sinh "AZ001" khi CHƯA có mã nào khớp định dạng AZ<số>', async () => {
      mockEmployeeCodeQueryBuilder.getRawOne.mockResolvedValue({ maxNum: null });
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
      mockEmployeeCodeQueryBuilder.getRawOne.mockResolvedValue({ maxNum: '5' });
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
      mockEmployeeCodeQueryBuilder.getRawOne.mockResolvedValue({ maxNum: '10' });
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
});