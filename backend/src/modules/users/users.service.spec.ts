import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from '../../database/entities/user.entity';
import { AuditService } from '../audit/audit.service';
import { DepartmentsService } from '../departments/departments.service';
import { Role } from '../../common/enums/role.enum';
import { ApprovalStatus } from '../../common/enums/approval-status.enum';

describe('UsersService - Approval workflow (đăng ký công khai chờ duyệt)', () => {
  let service: UsersService;

  const mockUsersRepo = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
  };
  const mockAuditService = {
    logAction: jest.fn(),
    logActionAsync: jest.fn(),
  };
  const mockDepartmentsService = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: mockUsersRepo },
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

      await service.findPendingApprovals();

      expect(mockUsersRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { approvalStatus: ApprovalStatus.PENDING },
          order: { createdAt: 'ASC' },
        }),
      );
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

      await expect(service.approveUser(999, 1)).rejects.toThrow(NotFoundException);
    });

    it('ném BadRequestException nếu user không ở trạng thái PENDING (vd đã approved/rejected từ trước)', async () => {
      mockUsersRepo.findOne.mockResolvedValue({
        ...pendingUser(),
        approvalStatus: ApprovalStatus.APPROVED,
      });

      await expect(service.approveUser(10, 1)).rejects.toThrow(BadRequestException);
    });

    it('chuyển approvalStatus sang APPROVED, ghi approvedById/approvedAt, KHÔNG đổi role nếu không truyền override', async () => {
      mockUsersRepo.findOne.mockResolvedValue(pendingUser());
      mockUsersRepo.save.mockImplementation((u: any) => Promise.resolve(u));

      const result = await service.approveUser(10, 5);

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

      await service.approveUser(10, 5, { role: Role.MANAGER, departmentId: 2 });

      expect(mockUsersRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ role: Role.MANAGER, departmentId: 2 }),
      );
    });

    it('KHÔNG trả về password trong kết quả (dùng omitPassword)', async () => {
      mockUsersRepo.findOne.mockResolvedValue(pendingUser());
      mockUsersRepo.save.mockImplementation((u: any) =>
        Promise.resolve({ ...u, password: 'hash-bi-lo' }),
      );

      const result = await service.approveUser(10, 5);

      expect((result as any).password).toBeUndefined();
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

      await expect(service.rejectUser(999, 1, 'lý do')).rejects.toThrow(NotFoundException);
    });

    it('ném BadRequestException nếu user không ở trạng thái PENDING', async () => {
      mockUsersRepo.findOne.mockResolvedValue({
        ...pendingUser(),
        approvalStatus: ApprovalStatus.REJECTED,
      });

      await expect(service.rejectUser(11, 1, 'lý do')).rejects.toThrow(BadRequestException);
    });

    it('chuyển approvalStatus sang REJECTED, lưu đúng lý do (trim khoảng trắng)', async () => {
      mockUsersRepo.findOne.mockResolvedValue(pendingUser());
      mockUsersRepo.save.mockImplementation((u: any) => Promise.resolve(u));

      const result = await service.rejectUser(11, 5, '  Không hợp lệ  ');

      expect(result.approvalStatus).toBe(ApprovalStatus.REJECTED);
      expect(mockUsersRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ rejectionReason: 'Không hợp lệ' }),
      );
    });

    it('lưu rejectionReason = null nếu không truyền lý do (hoặc chuỗi rỗng)', async () => {
      mockUsersRepo.findOne.mockResolvedValue(pendingUser());
      mockUsersRepo.save.mockImplementation((u: any) => Promise.resolve(u));

      await service.rejectUser(11, 5, '   ');

      expect(mockUsersRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ rejectionReason: null }),
      );
    });
  });
});
