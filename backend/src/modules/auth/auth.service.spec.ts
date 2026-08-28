import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ApprovalStatus } from '../../common/enums/approval-status.enum';

describe('AuthService - Đăng ký công khai + chặn đăng nhập chưa duyệt', () => {
  let service: AuthService;

  const mockUsersService = {
    findByEmail: jest.fn(),
    createPendingRegistration: jest.fn(),
    saveRefreshToken: jest.fn(),
    updateLastLogin: jest.fn(),
  };
  const mockJwtService = { sign: jest.fn().mockReturnValue('fake-jwt-token') };
  const mockConfigService = { get: jest.fn().mockReturnValue('fake-secret') };
  const mockAuditService = { logActionAsync: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('nên khởi tạo thành công service', () => {
    expect(service).toBeDefined();
  });

  describe('register - Đăng ký công khai', () => {
    it('ném ConflictException nếu email đã tồn tại', async () => {
      mockUsersService.findByEmail.mockResolvedValue({ id: 1, email: 'a@example.com' });

      await expect(
        service.register({ name: 'A', email: 'a@example.com', password: '123456' }),
      ).rejects.toThrow(ConflictException);

      // Không được gọi tạo user nếu email đã trùng
      expect(mockUsersService.createPendingRegistration).not.toHaveBeenCalled();
    });

    it('hash password trước khi lưu (KHÔNG lưu plaintext)', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.createPendingRegistration.mockResolvedValue({
        id: 5,
        email: 'a@example.com',
        name: 'A',
      });

      await service.register({ name: 'A', email: 'a@example.com', password: 'MatKhau123' });

      const savedArg = mockUsersService.createPendingRegistration.mock.calls[0][0];
      expect(savedArg.password).not.toBe('MatKhau123');
      expect(await bcrypt.compare('MatKhau123', savedArg.password)).toBe(true);
    });

    it('KHÔNG trả về access_token/refresh_token - chỉ trả message chờ duyệt', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.createPendingRegistration.mockResolvedValue({
        id: 5,
        email: 'a@example.com',
        name: 'A',
      });

      const result = await service.register({
        name: 'A',
        email: 'a@example.com',
        password: '123456',
      });

      expect(result).not.toHaveProperty('access_token');
      expect(result).not.toHaveProperty('refresh_token');
      expect(result.userId).toBe(5);
      expect(result.message).toMatch(/chờ.*duyệt/i);
    });
  });

  describe('login - Chặn tài khoản chưa duyệt/bị từ chối', () => {
    const baseUser = (overrides: Partial<any> = {}) => ({
      id: 1,
      email: 'a@example.com',
      password: bcrypt.hashSync('MatKhau123', 10),
      role: 'employee',
      isActive: true,
      approvalStatus: ApprovalStatus.APPROVED,
      rejectionReason: null,
      ...overrides,
    });

    it('ném ForbiddenException nếu tài khoản đang PENDING (chờ duyệt) - kể cả khi mật khẩu đúng', async () => {
      mockUsersService.findByEmail.mockResolvedValue(
        baseUser({ approvalStatus: ApprovalStatus.PENDING }),
      );

      await expect(
        service.login({ email: 'a@example.com', password: 'MatKhau123' }),
      ).rejects.toThrow(ForbiddenException);

      // Không được phát token cho tài khoản chưa duyệt
      expect(mockUsersService.saveRefreshToken).not.toHaveBeenCalled();
    });

    it('ném ForbiddenException nếu tài khoản đã bị REJECTED, kèm lý do trong message', async () => {
      mockUsersService.findByEmail.mockResolvedValue(
        baseUser({
          approvalStatus: ApprovalStatus.REJECTED,
          rejectionReason: 'Không xác định được danh tính',
        }),
      );

      await expect(
        service.login({ email: 'a@example.com', password: 'MatKhau123' }),
      ).rejects.toThrow('Không xác định được danh tính');
    });

    it('cho đăng nhập bình thường nếu approvalStatus=APPROVED (hành vi cũ không đổi)', async () => {
      mockUsersService.findByEmail.mockResolvedValue(baseUser());
      mockUsersService.saveRefreshToken.mockResolvedValue(undefined);
      mockUsersService.updateLastLogin.mockResolvedValue(undefined);

      const result = await service.login({ email: 'a@example.com', password: 'MatKhau123' });

      expect(result.access_token).toBe('fake-jwt-token');
      expect(mockUsersService.saveRefreshToken).toHaveBeenCalled();
    });

    it('vẫn ném UnauthorizedException khi sai mật khẩu (không bị đổi hành vi bởi approvalStatus check)', async () => {
      mockUsersService.findByEmail.mockResolvedValue(baseUser());

      await expect(
        service.login({ email: 'a@example.com', password: 'sai-mat-khau' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
