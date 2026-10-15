import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, HttpException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ApprovalStatus } from '../../common/enums/approval-status.enum';
import { SecurityConfigService, SECURITY_CONFIG_DEFAULTS } from '../../common/security/security-config.service';
import { LoginIpBlockService } from '../../common/security/login-ip-block.service';
import { LoginIpWhitelistService } from '../../common/security/login-ip-whitelist.service';
import { LoginIpBlacklistService } from '../../common/security/login-ip-blacklist.service';
import { IpGeoService } from '../../common/security/ip-geo.service';
import { IpAccessLogService } from '../../common/security/ip-access-log.service';

const mockIpGeo = { record: jest.fn().mockResolvedValue(undefined), enrich: jest.fn(async (rows: any[]) => rows) };
const mockIpAccessLog = { record: jest.fn().mockResolvedValue(undefined) };

describe('AuthService - Đăng ký công khai + chặn đăng nhập chưa duyệt', () => {
  let service: AuthService;

  const mockUsersService = {
    findByEmailIncludingDeleted: jest.fn(),
    createPendingRegistration: jest.fn(),
    saveRefreshToken: jest.fn(),
    rotateRefreshToken: jest.fn(),
    findByIdWithRefreshToken: jest.fn(),
    updateLastLogin: jest.fn(),
    getLoginLockRemainingSeconds: jest.fn(),
    recordFailedLogin: jest.fn(),
    clearLoginFailures: jest.fn(),
    // login() giờ ký avatarUrl trước khi trả về (xem auth.service.ts) - mặc
    // định trả nguyên user vào (không avatarUrl -> signAvatarUrl trả về y
    // nguyên, khớp hành vi thật khi user.avatarUrl null).
    signAvatarUrl: jest.fn((u) => Promise.resolve(u)),
  };
  const mockJwtService = { sign: jest.fn().mockReturnValue('fake-jwt-token'), verify: jest.fn() };
  const mockConfigService = { get: jest.fn().mockReturnValue('fake-secret') };
  const mockAuditService = { logActionAsync: jest.fn(), logSecurityEventAsync: jest.fn() };
  const mockSecurityConfig = { get: jest.fn() };
  const mockIpBlocks = { getRemainingSeconds: jest.fn(), recordFailure: jest.fn() };
  const mockIpWhitelist = { isWhitelisted: jest.fn() };
  const mockIpBlacklist = { isBanned: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockUsersService.getLoginLockRemainingSeconds.mockResolvedValue(0);
    mockUsersService.recordFailedLogin.mockResolvedValue({ attempts: 1, lockedSeconds: 0 });
    mockUsersService.clearLoginFailures.mockResolvedValue(undefined);
    mockSecurityConfig.get.mockResolvedValue({ ...SECURITY_CONFIG_DEFAULTS });
    mockIpBlocks.getRemainingSeconds.mockResolvedValue(0);
    mockIpBlocks.recordFailure.mockResolvedValue({ attempts: 1, lockedSeconds: 0 });
    mockIpWhitelist.isWhitelisted.mockResolvedValue(false);
    mockIpBlacklist.isBanned.mockResolvedValue(false);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: AuditService, useValue: mockAuditService },
        { provide: SecurityConfigService, useValue: mockSecurityConfig },
        { provide: LoginIpBlockService, useValue: mockIpBlocks },
        { provide: LoginIpWhitelistService, useValue: mockIpWhitelist },
        { provide: LoginIpBlacklistService, useValue: mockIpBlacklist },
        { provide: IpGeoService, useValue: mockIpGeo },
        { provide: IpAccessLogService, useValue: mockIpAccessLog },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('nên khởi tạo thành công service', () => {
    expect(service).toBeDefined();
  });

  describe('JWT_REFRESH_SECRET bắt buộc (P3.4)', () => {
    it('ký refresh token: thiếu secret -> ném lỗi, KHÔNG rơi về secret mặc định', async () => {
      mockConfigService.get.mockReturnValueOnce(undefined);
      await expect((service as any).generateTokens(1, 'a@b.c', 'employee')).rejects.toThrow(/JWT_REFRESH_SECRET/);
      expect(mockJwtService.sign).toHaveBeenCalledTimes(1); // chỉ access token; refresh không được ký
    });

    it('verify refresh token: thiếu secret -> 401 (không verify bằng undefined)', async () => {
      mockConfigService.get.mockReturnValueOnce(undefined);
      await expect(service.refresh('x.y.z')).rejects.toThrow();
      expect(mockJwtService.verify).not.toHaveBeenCalled();
    });
  });

  describe('verifySwaggerAdmin - Basic auth cho Swagger (PLAN_HARDENING P4)', () => {
    let hash: string;
    beforeAll(async () => {
      hash = await bcrypt.hash('Correct@123', 4);
    });

    const adminUser = (over: Record<string, unknown> = {}) => ({
      id: 1,
      email: 'admin@example.com',
      password: hash,
      role: 'admin',
      isActive: 1,
      deletedAt: null,
      approvalStatus: ApprovalStatus.APPROVED,
      ...over,
    });

    it('admin hợp lệ + mật khẩu đúng -> true, KHÔNG lưu refresh token / audit', async () => {
      mockUsersService.findByEmailIncludingDeleted.mockResolvedValue(adminUser());
      await expect(service.verifySwaggerAdmin('admin@example.com', 'Correct@123')).resolves.toBe(true);
      expect(mockUsersService.saveRefreshToken).not.toHaveBeenCalled();
      expect(mockUsersService.updateLastLogin).not.toHaveBeenCalled();
      expect(mockAuditService.logActionAsync).not.toHaveBeenCalled();
    });

    it('sai mật khẩu -> false', async () => {
      mockUsersService.findByEmailIncludingDeleted.mockResolvedValue(adminUser());
      await expect(service.verifySwaggerAdmin('admin@example.com', 'wrong')).resolves.toBe(false);
    });

    it('email không tồn tại -> false', async () => {
      mockUsersService.findByEmailIncludingDeleted.mockResolvedValue(null);
      await expect(service.verifySwaggerAdmin('x@example.com', 'whatever')).resolves.toBe(false);
    });

    it.each([
      ['không phải admin (manager)', { role: 'manager' }],
      ['không phải admin (employee)', { role: 'employee' }],
      ['bị khoá (isActive = 0)', { isActive: 0 }],
      ['đã xoá mềm', { deletedAt: new Date() }],
      ['chờ duyệt', { approvalStatus: ApprovalStatus.PENDING }],
      ['bị từ chối', { approvalStatus: ApprovalStatus.REJECTED }],
    ])('mật khẩu đúng nhưng %s -> false', async (_label, over) => {
      mockUsersService.findByEmailIncludingDeleted.mockResolvedValue(adminUser(over));
      await expect(service.verifySwaggerAdmin('admin@example.com', 'Correct@123')).resolves.toBe(false);
    });
  });

  describe('register - Đăng ký công khai', () => {
    it('ném ConflictException nếu email đã tồn tại', async () => {
      mockUsersService.findByEmailIncludingDeleted.mockResolvedValue({ id: 1, email: 'a@example.com' });

      await expect(
        service.register({
          name: 'A',
          email: 'a@example.com',
          password: '123456',
        } as any),
      ).rejects.toThrow(ConflictException);

      // Không được gọi tạo user nếu email đã trùng
      expect(mockUsersService.createPendingRegistration).not.toHaveBeenCalled();
    });

    it('hash password trước khi lưu (KHÔNG lưu plaintext)', async () => {
      mockUsersService.findByEmailIncludingDeleted.mockResolvedValue(null);
      mockUsersService.createPendingRegistration.mockResolvedValue({
        id: 5,
        email: 'a@example.com',
        name: 'A',
      });

      await service.register({
        name: 'A',
        email: 'a@example.com',
        password: 'MatKhau123',
      } as any);

      const savedArg = mockUsersService.createPendingRegistration.mock.calls[0][0];
      expect(savedArg.password).not.toBe('MatKhau123');
      expect(await bcrypt.compare('MatKhau123', savedArg.password)).toBe(true);
    });

    it('KHÔNG trả về access_token/refresh_token - chỉ trả message chờ duyệt', async () => {
      mockUsersService.findByEmailIncludingDeleted.mockResolvedValue(null);
      mockUsersService.createPendingRegistration.mockResolvedValue({
        id: 5,
        email: 'a@example.com',
        name: 'A',
      });

      const result = await service.register({
        name: 'A',
        email: 'a@example.com',
        password: '123456',
      } as any);

      expect(result).not.toHaveProperty('access_token');
      expect(result).not.toHaveProperty('refresh_token');
      expect(result.userId).toBe(5);
      expect(result.message).toMatch(/chờ.*duyệt/i);
    });

    it('Honeypot có giá trị -> KHÔNG tạo tài khoản, vẫn trả response y hệt thành công (không lộ cho bot biết)', async () => {
      const result = await service.register({
        name: 'Bot Fake',
        email: 'bot@example.com',
        password: '123456',
        website: 'http://spam.example.com',
      } as any);

      expect(mockUsersService.findByEmailIncludingDeleted).not.toHaveBeenCalled();
      expect(mockUsersService.createPendingRegistration).not.toHaveBeenCalled();
      expect(result.message).toMatch(/chờ.*duyệt/i);
    });

    it('Honeypot chỉ chứa khoảng trắng KHÔNG bị coi là bot (trim về rỗng trước khi so sánh, tránh false-positive chặn nhầm người dùng thật nếu trình duyệt/extension tự điền khoảng trắng vào field ẩn)', async () => {
      mockUsersService.findByEmailIncludingDeleted.mockResolvedValue(null);
      mockUsersService.createPendingRegistration.mockResolvedValue({
        id: 6,
        email: 'real-user@example.com',
        name: 'Real User',
      });

      const result = await service.register({
        name: 'Real User',
        email: 'real-user@example.com',
        password: '123456',
        website: '   ',
      } as any);

      expect(mockUsersService.createPendingRegistration).toHaveBeenCalled();
      expect(result.userId).toBe(6);
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
      mockUsersService.findByEmailIncludingDeleted.mockResolvedValue(
        baseUser({ approvalStatus: ApprovalStatus.PENDING }),
      );

      await expect(
        service.login({ email: 'a@example.com', password: 'MatKhau123' }),
      ).rejects.toThrow(ForbiddenException);

      // Không được phát token cho tài khoản chưa duyệt
      expect(mockUsersService.saveRefreshToken).not.toHaveBeenCalled();
    });

    it('ném ForbiddenException nếu tài khoản đã bị REJECTED, kèm lý do trong message', async () => {
      mockUsersService.findByEmailIncludingDeleted.mockResolvedValue(
        baseUser({
          approvalStatus: ApprovalStatus.REJECTED,
          rejectionReason: 'Không xác định được danh tính',
        }),
      );

      await expect(
        service.login({ email: 'a@example.com', password: 'MatKhau123' }),
      ).rejects.toThrow('Không xác định được danh tính');
    });

    it('REJECTED có lý do -> "Tài khoản đã bị từ chối. Lý do: ..." (dù đã xoá mềm)', async () => {
      mockUsersService.findByEmailIncludingDeleted.mockResolvedValue(
        baseUser({ approvalStatus: ApprovalStatus.REJECTED, rejectionReason: 'Sai thông tin', deletedAt: new Date() }),
      );
      await expect(service.login({ email: 'a@example.com', password: 'x' })).rejects.toThrow(
        'Tài khoản đã bị từ chối. Lý do: Sai thông tin',
      );
      expect(mockUsersService.saveRefreshToken).not.toHaveBeenCalled();
    });

    it('REJECTED không có lý do -> chỉ "Tài khoản đã bị từ chối."', async () => {
      mockUsersService.findByEmailIncludingDeleted.mockResolvedValue(
        baseUser({ approvalStatus: ApprovalStatus.REJECTED, rejectionReason: null, deletedAt: new Date() }),
      );
      await expect(service.login({ email: 'a@example.com', password: 'x' })).rejects.toThrow(
        /^Tài khoản đã bị từ chối\.$/,
      );
    });

    it('đã xoá mềm (không phải rejected) -> "Tài khoản đã bị xoá."', async () => {
      mockUsersService.findByEmailIncludingDeleted.mockResolvedValue(baseUser({ deletedAt: new Date() }));
      await expect(service.login({ email: 'a@example.com', password: 'x' })).rejects.toThrow('Tài khoản đã bị xoá.');
      expect(mockUsersService.saveRefreshToken).not.toHaveBeenCalled();
    });

    it('cho đăng nhập bình thường nếu approvalStatus=APPROVED (hành vi cũ không đổi)', async () => {
      mockUsersService.findByEmailIncludingDeleted.mockResolvedValue(baseUser());
      mockUsersService.saveRefreshToken.mockResolvedValue(undefined);
      mockUsersService.updateLastLogin.mockResolvedValue(undefined);

      const result = await service.login({ email: 'a@example.com', password: 'MatKhau123' });

      expect(result.access_token).toBe('fake-jwt-token');
      expect(mockUsersService.saveRefreshToken).toHaveBeenCalled();
    });

    it('trả về avatarUrl đã ký (Presigned GET) trong response login nếu user có avatar', async () => {
      mockUsersService.findByEmailIncludingDeleted.mockResolvedValue(baseUser({ avatarUrl: 'avatars/1/abc.webp' }));
      mockUsersService.saveRefreshToken.mockResolvedValue(undefined);
      mockUsersService.updateLastLogin.mockResolvedValue(undefined);
      mockUsersService.signAvatarUrl.mockResolvedValue({
        avatarUrl: 'https://signed.example.com/avatars/1/abc.webp',
      });

      const result = await service.login({ email: 'a@example.com', password: 'MatKhau123' });

      expect(mockUsersService.signAvatarUrl).toHaveBeenCalled();
      expect(result.user.avatarUrl).toBe('https://signed.example.com/avatars/1/abc.webp');
    });

    it('trả về avatarUrl=null nếu user chưa từng upload avatar (KHÔNG lộ object key thô)', async () => {
      mockUsersService.findByEmailIncludingDeleted.mockResolvedValue(baseUser());
      mockUsersService.saveRefreshToken.mockResolvedValue(undefined);
      mockUsersService.updateLastLogin.mockResolvedValue(undefined);
      mockUsersService.signAvatarUrl.mockResolvedValue(baseUser());

      const result = await service.login({ email: 'a@example.com', password: 'MatKhau123' });

      expect(result.user.avatarUrl).toBeNull();
    });

    it('vẫn ném UnauthorizedException khi sai mật khẩu (không bị đổi hành vi bởi approvalStatus check)', async () => {
      mockUsersService.findByEmailIncludingDeleted.mockResolvedValue(baseUser());

      await expect(
        service.login({ email: 'a@example.com', password: 'sai-mat-khau' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('login - Khoá tạm thời sau khi sai mật khẩu quá 5 lần', () => {
    let hash: string;
    beforeAll(async () => {
      hash = await bcrypt.hash('Correct@123', 4);
    });
    const user = () => ({
      id: 9,
      email: 'a@example.com',
      name: 'A',
      role: 'employee',
      password: hash,
      isActive: 1,
      deletedAt: null,
      approvalStatus: ApprovalStatus.APPROVED,
    });

    it('đang bị khoá -> 429 LOGIN_LOCKED, KHÔNG so mật khẩu (kể cả đúng), KHÔNG cấp token', async () => {
      mockUsersService.findByEmailIncludingDeleted.mockResolvedValue(user());
      mockUsersService.getLoginLockRemainingSeconds.mockResolvedValue(240);

      const err = await service.login({ email: 'a@example.com', password: 'Correct@123' }).catch((e) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(429);
      expect(err.getResponse()).toMatchObject({ code: 'LOGIN_LOCKED', retryAfterSeconds: 240 });
      expect(mockUsersService.recordFailedLogin).not.toHaveBeenCalled();
      expect(mockUsersService.saveRefreshToken).not.toHaveBeenCalled();
    });

    it('sai lần 1-4 -> 401 WRONG_PASSWORD kèm số lần còn lại', async () => {
      mockUsersService.findByEmailIncludingDeleted.mockResolvedValue(user());
      mockUsersService.recordFailedLogin.mockResolvedValue({ attempts: 3, lockedSeconds: 0 });

      const err = await service.login({ email: 'a@example.com', password: 'sai' }).catch((e) => e);

      expect(err).toBeInstanceOf(UnauthorizedException);
      expect(err.getResponse()).toMatchObject({ code: 'WRONG_PASSWORD', remainingAttempts: 2 });
      expect(mockUsersService.recordFailedLogin).toHaveBeenCalledWith(9, 5, 5);
    });

    it('sai lần thứ 5 -> 429 ngay (khoá 5 phút)', async () => {
      mockUsersService.findByEmailIncludingDeleted.mockResolvedValue(user());
      mockUsersService.recordFailedLogin.mockResolvedValue({ attempts: 5, lockedSeconds: 300 });

      const err = await service.login({ email: 'a@example.com', password: 'sai' }).catch((e) => e);

      expect(err.getStatus()).toBe(429);
      expect(err.getResponse()).toMatchObject({ code: 'LOGIN_LOCKED', retryAfterSeconds: 300 });
    });

    it('đăng nhập đúng -> xoá bộ đếm sai', async () => {
      mockUsersService.findByEmailIncludingDeleted.mockResolvedValue(user());
      mockUsersService.saveRefreshToken.mockResolvedValue(undefined);
      mockUsersService.updateLastLogin.mockResolvedValue(undefined);

      await service.login({ email: 'a@example.com', password: 'Correct@123' });

      expect(mockUsersService.clearLoginFailures).toHaveBeenCalledWith(9);
    });

    it('tài khoản bị khoá/chờ duyệt (403) không bị tính vào bộ đếm sai mật khẩu', async () => {
      mockUsersService.findByEmailIncludingDeleted.mockResolvedValue({ ...user(), isActive: 0 });
      await expect(service.login({ email: 'a@example.com', password: 'sai' })).rejects.toThrow(ForbiddenException);
      expect(mockUsersService.recordFailedLogin).not.toHaveBeenCalled();
    });
  });

  describe('refresh - xoay token theo từng phiên (không bcrypt)', () => {
    const activeUser = { id: 7, email: 'a@x.com', role: 'employee', isActive: 1, hashedRefreshToken: '{"v":2,"s":[],"l":null}' };

    beforeEach(() => {
      mockJwtService.verify.mockReturnValue({ sub: 7 });
      mockUsersService.findByIdWithRefreshToken.mockResolvedValue(activeUser);
    });

    it('JWT refresh sai/hết hạn -> 401, không đụng DB', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });
      await expect(service.refresh('x')).rejects.toThrow(UnauthorizedException);
      expect(mockUsersService.findByIdWithRefreshToken).not.toHaveBeenCalled();
    });

    it('chưa có phiên nào (đã đăng xuất) -> 401', async () => {
      mockUsersService.findByIdWithRefreshToken.mockResolvedValue({ ...activeUser, hashedRefreshToken: null });
      await expect(service.refresh('x')).rejects.toThrow(UnauthorizedException);
      expect(mockUsersService.rotateRefreshToken).not.toHaveBeenCalled();
    });

    it('token thuộc 1 phiên -> trả cặp token mới, KHÔNG thu hồi', async () => {
      mockUsersService.rotateRefreshToken.mockResolvedValue(true);
      const res = await service.refresh('old-token');
      expect(res).toEqual({ access_token: 'fake-jwt-token', refresh_token: 'fake-jwt-token' });
      expect(mockUsersService.rotateRefreshToken).toHaveBeenCalledWith(7, 'old-token', 'fake-jwt-token', activeUser.hashedRefreshToken, expect.objectContaining({ sid: expect.any(String) }));
      expect(mockUsersService.saveRefreshToken).not.toHaveBeenCalled();
    });

    it('token KHÔNG thuộc phiên nào (tái sử dụng) -> thu hồi toàn bộ phiên + 401', async () => {
      mockUsersService.rotateRefreshToken.mockResolvedValue(false);
      await expect(service.refresh('stolen')).rejects.toThrow(UnauthorizedException);
      expect(mockUsersService.saveRefreshToken).toHaveBeenCalledWith(7, null);
    });

    it('refresh token mới có jti ngẫu nhiên (2 lần trong cùng giây không trùng nhau)', async () => {
      mockUsersService.rotateRefreshToken.mockResolvedValue(true);
      await service.refresh('old-token');
      const refreshSignCall = mockJwtService.sign.mock.calls.find((c) => c[1]?.secret);
      expect(refreshSignCall?.[0]).toEqual(expect.objectContaining({ jti: expect.any(String) }));
    });
  });

  describe('login - khoá IP + cấu hình động + sự kiện bảo mật (PLAN P3.1/P3.2/P4.1)', () => {
    let hash: string;
    beforeAll(async () => {
      hash = await bcrypt.hash('Correct@123', 4);
    });
    const user = () => ({
      id: 9, email: 'a@example.com', name: 'A', role: 'employee', password: hash, isActive: 1,
      deletedAt: null, approvalStatus: ApprovalStatus.APPROVED,
    });
    const login = (pw: string, email = 'a@example.com') =>
      service.login({ email, password: pw }, '1.2.3.4', 'UA/1').catch((e) => e);

    it('IP đang khoá -> 429 IP_LOCKED NGAY, không tra user, không ghi sự kiện (tránh phình audit)', async () => {
      mockIpBlocks.getRemainingSeconds.mockResolvedValue(200);
      const err = await login('x');
      expect(err.getResponse()).toMatchObject({ code: 'IP_LOCKED', retryAfterSeconds: 200 });
      expect(mockUsersService.findByEmailIncludingDeleted).not.toHaveBeenCalled();
      expect(mockIpBlocks.recordFailure).not.toHaveBeenCalled();
      expect(mockAuditService.logSecurityEventAsync).not.toHaveBeenCalled();
    });

    it('email KHÔNG tồn tại -> 401, tính vào IP, ghi LOGIN_UNKNOWN_EMAIL với userId=null', async () => {
      mockUsersService.findByEmailIncludingDeleted.mockResolvedValue(null);
      const err = await login('x', 'ghost@example.com');
      expect(err).toBeInstanceOf(UnauthorizedException);
      expect(mockIpBlocks.recordFailure).toHaveBeenCalledWith('1.2.3.4', 'ghost@example.com', { maxAttempts: 10, windowMinutes: 10, lockMinutes: 5 });
      expect(mockAuditService.logSecurityEventAsync).toHaveBeenCalledWith(
        expect.objectContaining({ userId: null, action: 'LOGIN_UNKNOWN_EMAIL', ip: '1.2.3.4', userAgent: 'UA/1', detail: { email: 'ghost@example.com' } }),
      );
    });

    it('email lạ làm IP chạm ngưỡng -> 429 IP_LOCKED + đúng 1 dòng LOGIN_IP_BLOCKED', async () => {
      mockUsersService.findByEmailIncludingDeleted.mockResolvedValue(null);
      mockIpBlocks.recordFailure.mockResolvedValue({ attempts: 10, lockedSeconds: 300 });
      const err = await login('x', 'ghost@example.com');
      expect(err.getResponse()).toMatchObject({ code: 'IP_LOCKED', retryAfterSeconds: 300 });
      const actions = mockAuditService.logSecurityEventAsync.mock.calls.map((c) => c[0].action);
      expect(actions.filter((a) => a === 'LOGIN_IP_BLOCKED')).toHaveLength(1);
    });

    it('sai mật khẩu -> ghi LOGIN_FAILED (có userId) và tính vào CẢ tài khoản lẫn IP', async () => {
      mockUsersService.findByEmailIncludingDeleted.mockResolvedValue(user());
      mockUsersService.recordFailedLogin.mockResolvedValue({ attempts: 2, lockedSeconds: 0 });
      const err = await login('sai');
      expect(err.getResponse()).toMatchObject({ code: 'WRONG_PASSWORD', remainingAttempts: 3 });
      expect(mockIpBlocks.recordFailure).toHaveBeenCalledTimes(1);
      expect(mockAuditService.logSecurityEventAsync).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 9, action: 'LOGIN_FAILED', detail: { email: 'a@example.com', attempts: 2 } }),
      );
    });

    it('KHÔNG đưa mật khẩu vào sự kiện bảo mật', async () => {
      mockUsersService.findByEmailIncludingDeleted.mockResolvedValue(user());
      mockUsersService.recordFailedLogin.mockResolvedValue({ attempts: 1, lockedSeconds: 0 });
      await login('MatKhauBiMat123');
      expect(JSON.stringify(mockAuditService.logSecurityEventAsync.mock.calls)).not.toContain('MatKhauBiMat123');
    });

    it('chạm ngưỡng tài khoản -> thêm dòng ACCOUNT_LOCKED + 429 LOGIN_LOCKED', async () => {
      mockUsersService.findByEmailIncludingDeleted.mockResolvedValue(user());
      mockUsersService.recordFailedLogin.mockResolvedValue({ attempts: 5, lockedSeconds: 300 });
      const err = await login('sai');
      expect(err.getResponse()).toMatchObject({ code: 'LOGIN_LOCKED' });
      const actions = mockAuditService.logSecurityEventAsync.mock.calls.map((c) => c[0].action);
      expect(actions).toEqual(expect.arrayContaining(['LOGIN_FAILED', 'ACCOUNT_LOCKED']));
    });

    it('cả IP và tài khoản cùng khoá -> báo cái khoá lâu hơn', async () => {
      mockUsersService.findByEmailIncludingDeleted.mockResolvedValue(user());
      mockUsersService.recordFailedLogin.mockResolvedValue({ attempts: 5, lockedSeconds: 300 });
      mockIpBlocks.recordFailure.mockResolvedValue({ attempts: 10, lockedSeconds: 600 });
      expect((await login('sai')).getResponse()).toMatchObject({ code: 'IP_LOCKED', retryAfterSeconds: 600 });
    });

    it('ngưỡng/thời gian khoá tài khoản lấy từ security_config (không còn hằng số 5/5)', async () => {
      mockSecurityConfig.get.mockResolvedValue({ ...SECURITY_CONFIG_DEFAULTS, accountMaxFailedAttempts: 8, accountLockMinutes: 15 });
      mockUsersService.findByEmailIncludingDeleted.mockResolvedValue(user());
      mockUsersService.recordFailedLogin.mockResolvedValue({ attempts: 3, lockedSeconds: 0 });
      const err = await login('sai');
      expect(mockUsersService.recordFailedLogin).toHaveBeenCalledWith(9, 8, 15);
      expect(err.getResponse()).toMatchObject({ remainingAttempts: 5 });
      expect(err.getResponse().message).toContain('15 phút');
    });

    it('đăng nhập đúng: ghi last_login_ip, KHÔNG reset bộ đếm IP, KHÔNG ghi LOGIN_FAILED', async () => {
      mockUsersService.findByEmailIncludingDeleted.mockResolvedValue(user());
      mockUsersService.saveRefreshToken.mockResolvedValue(undefined);
      mockUsersService.updateLastLogin.mockResolvedValue(undefined);
      await service.login({ email: 'a@example.com', password: 'Correct@123' }, '1.2.3.4', 'UA/1');
      expect(mockUsersService.updateLastLogin).toHaveBeenCalledWith(9, '1.2.3.4');
      expect(mockIpBlocks.recordFailure).not.toHaveBeenCalled();
      expect(mockAuditService.logSecurityEventAsync).not.toHaveBeenCalled();
    });

    describe('IP blacklist - khoá chủ động (P3.7)', () => {
      beforeEach(() => mockIpBlacklist.isBanned.mockResolvedValue(true));

      it('IP bị chặn -> 403 IP_BANNED NGAY dù mật khẩu đúng: không tra user, không bcrypt, không đếm IP, không audit', async () => {
        mockUsersService.findByEmailIncludingDeleted.mockResolvedValue(user());
        const err = await login('Correct@123');
        expect(err.getStatus()).toBe(403);
        expect(err.getResponse()).toMatchObject({ code: 'IP_BANNED' });
        expect(err.getResponse()).not.toHaveProperty('retryAfterSeconds');
        expect(mockUsersService.findByEmailIncludingDeleted).not.toHaveBeenCalled();
        expect(mockIpWhitelist.isWhitelisted).not.toHaveBeenCalled();
        expect(mockIpBlocks.getRemainingSeconds).not.toHaveBeenCalled();
        expect(mockIpBlocks.recordFailure).not.toHaveBeenCalled();
        expect(mockAuditService.logSecurityEventAsync).not.toHaveBeenCalled();
      });

      it('lượt bị chặn được ghi vào theo dõi IP với ip_status = blocked', async () => {
        await login('x');
        expect(mockIpAccessLog.record).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'ip_locked', ipStatus: 'blocked' }));
      });

      it('hết hạn/không còn bị chặn -> đăng nhập bình thường', async () => {
        mockIpBlacklist.isBanned.mockResolvedValue(false);
        mockUsersService.findByEmailIncludingDeleted.mockResolvedValue(user());
        mockUsersService.saveRefreshToken.mockResolvedValue(undefined);
        mockUsersService.updateLastLogin.mockResolvedValue(undefined);
        await expect(service.login({ email: 'a@example.com', password: 'Correct@123' }, '1.2.3.4', 'UA/1')).resolves.toBeDefined();
        expect(mockIpBlacklist.isBanned).toHaveBeenCalledWith('1.2.3.4');
      });

      it('refresh từ IP bị chặn -> 403 IP_BANNED trước khi verify token, ghi ip_locked/blocked', async () => {
        const err: any = await service.refresh('tok', '1.2.3.4', 'UA/1').catch((e) => e);
        expect(err.getResponse()).toMatchObject({ code: 'IP_BANNED' });
        expect(mockJwtService.verify).not.toHaveBeenCalled();
        expect(mockIpAccessLog.record).toHaveBeenCalledWith(expect.objectContaining({ endpoint: 'auth/refresh', outcome: 'ip_locked', ipStatus: 'blocked' }));
      });
    });

    describe('IP whitelist (P3.5)', () => {
      beforeEach(() => mockIpWhitelist.isWhitelisted.mockResolvedValue(true));

      it('IP whitelist dù bảng đang ghi khoá -> KHÔNG bị IP_LOCKED, không query khoá IP', async () => {
        mockIpBlocks.getRemainingSeconds.mockResolvedValue(500);
        mockUsersService.findByEmailIncludingDeleted.mockResolvedValue(user());
        mockUsersService.saveRefreshToken.mockResolvedValue(undefined);
        mockUsersService.updateLastLogin.mockResolvedValue(undefined);
        const res = await service.login({ email: 'a@example.com', password: 'Correct@123' }, '1.2.3.4', 'UA/1');
        expect(res).toBeDefined();
        expect(mockIpBlocks.getRemainingSeconds).not.toHaveBeenCalled();
        expect(mockIpWhitelist.isWhitelisted).toHaveBeenCalledWith('1.2.3.4');
      });

      it('email lạ từ IP whitelist -> 401, KHÔNG đếm IP, KHÔNG LOGIN_IP_BLOCKED, vẫn ghi LOGIN_UNKNOWN_EMAIL', async () => {
        mockUsersService.findByEmailIncludingDeleted.mockResolvedValue(null);
        const err = await login('x', 'ghost@example.com');
        expect(err).toBeInstanceOf(UnauthorizedException);
        expect(mockIpBlocks.recordFailure).not.toHaveBeenCalled();
        const actions = mockAuditService.logSecurityEventAsync.mock.calls.map((c) => c[0].action);
        expect(actions).toEqual(['LOGIN_UNKNOWN_EMAIL']);
      });

      it('sai mật khẩu từ IP whitelist -> VẪN đếm/khoá TÀI KHOẢN, không đếm IP', async () => {
        mockUsersService.findByEmailIncludingDeleted.mockResolvedValue(user());
        mockUsersService.recordFailedLogin.mockResolvedValue({ attempts: 5, lockedSeconds: 300 });
        const err = await login('sai');
        expect(err.getResponse()).toMatchObject({ code: 'LOGIN_LOCKED' });
        expect(mockUsersService.recordFailedLogin).toHaveBeenCalled();
        expect(mockIpBlocks.recordFailure).not.toHaveBeenCalled();
        const actions = mockAuditService.logSecurityEventAsync.mock.calls.map((c) => c[0].action);
        expect(actions).toEqual(expect.arrayContaining(['LOGIN_FAILED', 'ACCOUNT_LOCKED']));
        expect(actions).not.toContain('LOGIN_IP_BLOCKED');
      });

      it('tài khoản đang bị khoá vẫn bị chặn dù IP whitelist', async () => {
        mockUsersService.findByEmailIncludingDeleted.mockResolvedValue(user());
        mockUsersService.getLoginLockRemainingSeconds.mockResolvedValue(120);
        const err = await login('Correct@123');
        expect(err.getResponse()).toMatchObject({ code: 'LOGIN_LOCKED' });
      });
    });

    it('không có IP (null) -> vẫn đăng nhập/khoá tài khoản bình thường', async () => {
      mockUsersService.findByEmailIncludingDeleted.mockResolvedValue(user());
      mockUsersService.recordFailedLogin.mockResolvedValue({ attempts: 1, lockedSeconds: 0 });
      const err = await service.login({ email: 'a@example.com', password: 'sai' }).catch((e) => e);
      expect(err.getResponse()).toMatchObject({ code: 'WRONG_PASSWORD' });
    });
  });

  describe('theo dõi IP (P3.6)', () => {
    const user = () => ({
      id: 5, email: 'a@example.com', name: 'A', password: bcrypt.hashSync('MatKhau123', 10), role: 'employee',
      isActive: true, deletedAt: null, approvalStatus: ApprovalStatus.APPROVED,
    });
    const last = () => mockIpAccessLog.record.mock.calls.at(-1)![0];

    it('email lạ -> unknown_email + quốc gia từ header', async () => {
      mockUsersService.findByEmailIncludingDeleted.mockResolvedValue(null);
      await service.login({ email: 'la@example.com', password: 'x' }, '8.8.8.8', 'UA/1', 'US').catch(() => undefined);
      expect(mockIpGeo.record).toHaveBeenCalledWith('8.8.8.8', 'US');
      expect(last()).toMatchObject({ ip: '8.8.8.8', countryCode: 'US', endpoint: 'auth/login', outcome: 'unknown_email', ipStatus: 'normal' });
    });
    it('sai mật khẩu -> wrong_password; IP whitelist -> ip_status whitelisted', async () => {
      mockUsersService.findByEmailIncludingDeleted.mockResolvedValue(user());
      mockIpWhitelist.isWhitelisted.mockResolvedValue(true);
      await service.login({ email: 'a@example.com', password: 'sai' }, '8.8.8.8', 'UA/1', 'VN').catch(() => undefined);
      expect(last()).toMatchObject({ outcome: 'wrong_password', ipStatus: 'whitelisted' });
    });
    it('IP đang khoá -> ip_locked + blocked, không ghi audit_logs', async () => {
      mockIpBlocks.getRemainingSeconds.mockResolvedValue(200);
      await service.login({ email: 'a@example.com', password: 'x' }, '8.8.8.8', 'UA/1').catch(() => undefined);
      expect(last()).toMatchObject({ outcome: 'ip_locked', ipStatus: 'blocked' });
      expect(mockAuditService.logSecurityEventAsync).not.toHaveBeenCalled();
    });
    it('tài khoản chờ duyệt -> denied', async () => {
      mockUsersService.findByEmailIncludingDeleted.mockResolvedValue({ ...user(), approvalStatus: ApprovalStatus.PENDING });
      await service.login({ email: 'a@example.com', password: 'MatKhau123' }, '8.8.8.8', 'UA/1').catch(() => undefined);
      expect(last()).toMatchObject({ outcome: 'denied' });
    });
    it('lỗi ghi log KHÔNG làm hỏng đăng nhập (vẫn trả đúng lỗi nghiệp vụ)', async () => {
      mockIpAccessLog.record.mockRejectedValueOnce(new Error('db down'));
      mockUsersService.findByEmailIncludingDeleted.mockResolvedValue(null);
      const err = await service.login({ email: 'la@example.com', password: 'x' }, '8.8.8.8', 'UA/1').catch((e) => e);
      expect(err.message).toBe('Tài khoản không tồn tại');
    });
  });
});