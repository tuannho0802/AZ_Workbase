import { Injectable, Logger } from '@nestjs/common';

import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, In, DataSource } from 'typeorm';
import { User } from '../../database/entities/user.entity';
import { Department } from '../../database/entities/department.entity';
import { RoleEntity } from '../../database/entities/role.entity';
import { Role } from '../../common/enums/role.enum';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateOwnProfileDto } from './dto/update-own-profile.dto';
import { UpdateOwnEmailDto } from './dto/update-own-email.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ConflictException, NotFoundException, ForbiddenException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuditService } from '../audit/audit.service';
import { ApprovalStatus } from '../../common/enums/approval-status.enum';
import { DepartmentsService } from '../departments/departments.service';
import { PositionsService } from '../positions/positions.service';
import { UsersAccessHelper } from './helpers/users-access.helper';
import { UploadsService } from '../uploads/uploads.service';

/** Loại bỏ field password khỏi object trước khi trả ra API hoặc ghi vào audit log */
function omitPassword<T extends { password?: unknown }>(obj: T): Omit<T, 'password'> {
  const clone: any = { ...obj };
  delete clone.password;
  return clone;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(

    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Department)
    private departmentsRepository: Repository<Department>,
    @InjectRepository(RoleEntity)
    private roleRepository: Repository<RoleEntity>,
    private readonly auditService: AuditService,
    private readonly departmentsService: DepartmentsService,
    private readonly positionsService: PositionsService,
    private readonly uploadsService: UploadsService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // --- Avatar (Backblaze B2, bucket Private) ------------------------------
  // Xem PLAN_AVATAR_LEAVE_ATTACHMENT_BACKBLAZE_B2.md mục 5.4a: avatarUrl
  // trong DB là OBJECT KEY, KHÔNG PHẢI URL - PHẢI ký lại thành Presigned GET
  // URL (TTL 1h) trước khi trả ra khỏi service cho bất kỳ controller nào.
  // Gọi `signAvatarUrl`/`signAvatarUrls` ở TẤT CẢ nơi trả User(s) ra ngoài -
  // thiếu 1 chỗ là avatar hiện ra key thô, không load được ảnh.

  // ⚠️ Giữ thêm `avatarKey` (= key thô, chính giá trị avatarUrl cột DB TRƯỚC
  // khi ký) song song với avatarUrl đã ký - FE dùng key này làm cache key ổn
  // định cho Cache Storage API (useCachedImage), vì avatarUrl đổi mỗi lần
  // ký lại (query string HMAC khác nhau) nên không dùng làm cache key được.
  async signAvatarUrl<T extends { avatarUrl?: string | null }>(
    user: T | null,
  ): Promise<(T & { avatarKey?: string | null }) | null> {
    if (!user || !user.avatarUrl) return user as (T & { avatarKey?: string | null }) | null;
    const rawKey = user.avatarUrl;
    const signedUrl = await this.uploadsService.signAvatarGetUrl(rawKey);
    return { ...user, avatarUrl: signedUrl, avatarKey: rawKey };
  }

  async signAvatarUrls<T extends { avatarUrl?: string | null }>(
    users: T[],
  ): Promise<(T & { avatarKey?: string | null })[]> {
    return Promise.all(users.map((u) => this.signAvatarUrl(u))) as Promise<(T & { avatarKey?: string | null })[]>;
  }

  /**
   * Xác nhận avatar mới sau khi FE đã PUT thẳng lên B2 (xem
   * UploadsController.presignAvatar). Validate dung lượng thật qua
   * `assertUploadedSizeWithinLimit` (giới hạn đọc động từ settings), xoá
   * avatar cũ trên B2 (best-effort, không chặn luồng chính nếu lỗi).
   *
   * ⚠️ FIX BUG THẬT: từ khi object key avatar đổi sang tên deterministic
   * "{TenNhanVien}_{PhongBan}_{Role}.{ext}" (xem uploads.service.ts -
   * buildReadableFileName), 2 lần upload liên tiếp của CÙNG 1 người (chưa
   * đổi tên/phòng/role) ra ĐÚNG 1 key - PUT sau ghi đè PUT trước lên B2.
   * Nếu vẫn gọi deleteAvatar(oldKey) như cũ, sẽ tự xoá NHẦM ảnh VỪA upload
   * xong (vì oldKey === newKey), để lại avatar vỡ. Chỉ xoá khi 2 key thật
   * sự khác nhau.
   */
  async updateOwnAvatar(userId: number, newKey: string): Promise<User> {
    const limits = await this.uploadsService.getLimits();
    await this.uploadsService.assertUploadedSizeWithinLimit(
      this.uploadsService.avatarsBucket,
      newKey,
      limits.avatarMaxSizeKb,
    );

    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Không tìm thấy nhân viên');
    }
    const oldKey = user.avatarUrl;

    await this.usersRepository.update(userId, { avatarUrl: newKey });

    if (oldKey && oldKey !== newKey) {
      this.uploadsService.deleteAvatar(oldKey);
    }

    const updated = await this.usersRepository.findOne({ where: { id: userId } });
    return (await this.signAvatarUrl(updated)) as User;
  }

  /**
   * ⚠️ FIX BUG THẬT (400 "role must be one of the following values" khi gán
   * role tuỳ chỉnh qua trang Nhân viên): DTO giờ chỉ validate ĐỊNH DẠNG mã
   * role (xem update-user.dto.ts), KHÔNG còn hardcode enum 4 role hệ thống
   * nữa - phải tự kiểm tra ở đây role đó có THẬT SỰ tồn tại trong bảng
   * `roles` không (kể cả role tuỳ chỉnh Admin tạo qua trang "Phân quyền").
   * Nếu không check, `usersRepository.save()` sẽ rơi xuống lỗi FK thô từ
   * MySQL (`FK_users_role`) - vẫn CHẶN ĐÚNG nhưng thông báo lỗi khó hiểu,
   * không phải message rõ ràng cho người dùng.
   */
  private async validateRoleExists(code: string): Promise<void> {
    const exists = await this.roleRepository.exists({ where: { code } });
    if (!exists) {
      throw new BadRequestException(`Vai trò "${code}" không tồn tại - có thể đã bị xoá, vui lòng chọn lại`);
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    // password có select: false trong entity -> phải addSelect thủ công vì cần so khớp lúc login
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.email = :email', { email })
      .getOne();
  }

  // ⚠️ MỚI - thêm tham số `relations` (mặc định RỖNG - giữ nguyên hành vi
  // cũ cho hot-path `JwtStrategy.validate()` chạy trên MỌI request đã đăng
  // nhập, không cần JOIN gì thêm vì chỉ đọc field scalar departmentId/
  // positionId/isRootAdmin trực tiếp trên entity, không cần object quan hệ
  // đầy đủ). FIX BUG THẬT: `GET /users/me` (getProfile()) gọi hàm này mà
  // KHÔNG truyền relations -> `department`/`position` luôn `undefined` trên
  // response -> trang Profile (xem chính mình, `isSelf=true` ở
  // `profile/page.tsx`) LUÔN hiển thị "Chưa có phòng ban" dù user thực sự
  // có phòng ban/vị trí trong DB (trong khi xem NGƯỜI KHÁC qua GET
  // /users/:id vẫn đúng vì `findOne()` có JOIN sẵn) - lỗi phát hiện khi rà
  // soát để thêm hiển thị Vị trí ở FE.
  async findById(id: number, relations: string[] = []): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id }, relations });
  }

  async findOne(id: number, currentUserId: number, currentUserRole: string, scope?: string | null): Promise<User | null> {
    // ⚠️ MỚI - thêm 'position' cùng 'department' (rà soát BE Position
    // 2026-09-10): trước đây FE (trang Chi tiết nhân viên/Profile xem người
    // khác, dùng GET /users/:id) không có cách nào hiển thị Vị trí dù
    // `positionId` đã lưu đúng trong DB - quan hệ chỉ được khai ở entity,
    // KHÔNG được join ở đây nên `user.position` luôn undefined trên response.
    const user = await this.usersRepository.findOne({ where: { id }, relations: ['department', 'position'] });
    if (!user) {
      throw new NotFoundException('Không tìm thấy nhân viên');
    }
    // ⚠️ FIX PERMISSIONS.md mục 2.2: trước đây CHỈ Admin/chính mình xem
    // được (Assistant/Manager bị chặn dù đã đúng @Roles ở controller) -
    // giờ dùng chung UsersAccessHelper: Assistant xem mọi người ngang
    // Admin; Manager xem được user trong phòng ban mình quản lý + chính
    // mình; Employee chỉ xem chính mình.
    const allowed = await UsersAccessHelper.canManageUser(
      this.departmentsRepository,
      user.id,
      user.departmentId,
      currentUserId,
      currentUserRole,
      scope,
    );
    if (!allowed) {
      throw new ForbiddenException('Bạn không có quyền xem thông tin nhân viên này');
    }
    return user;
  }

  async updateLastLogin(id: number): Promise<void> {
    await this.usersRepository.update(id, { lastLoginAt: new Date() });
  }

  async saveRefreshToken(userId: number, token: string | null): Promise<void> {
    const hashedRefreshToken = token ? await bcrypt.hash(token, 10) : null;
    // Use query builder to update the field that has select: false
    await this.usersRepository
      .createQueryBuilder()
      .update(User)
      .set({ hashedRefreshToken })
      .where('id = :id', { id: userId })
      .execute();
  }

  async findByIdWithRefreshToken(id: number): Promise<User | null> {
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.hashedRefreshToken')
      .where('user.id = :id', { id })
      .getOne();
  }

  async findEmployees(callerId: number, callerRole: string, targetRole?: string, isFullList = false): Promise<User[]> {
    const whereCondition: any = { isActive: true };
    if (targetRole) {
      whereCondition.role = targetRole;
    }

    return this.usersRepository.find({
      where: whereCondition,
      relations: ['department'],
      order: { name: 'ASC' }
    });
  }

  async findAll(userId: number, userRole: string, scope?: string | null, options: { role?: string; departmentId?: number; isActive?: boolean; search?: string; page?: number; limit?: number } = {}) {
    const { role, departmentId, isActive, search, page = 1, limit = 20 } = options;

    const queryBuilder = this.usersRepository.createQueryBuilder('user')
      .leftJoinAndSelect('user.department', 'department')
      // ⚠️ MỚI - cùng lý do ở findOne() phía trên: danh sách Nhân viên
      // (GET /users, bảng chính ở trang /users) cần join 'position' để FE
      // hiển thị cột Vị trí, tránh phải gọi thêm request riêng cho từng dòng.
      .leftJoinAndSelect('user.position', 'position')
      .where('1=1');

    // ⚠️ FIX PERMISSIONS.md mục 2.2: trước đây có comment "Visibility logic:
    // All roles can see all users (Department agnostic)" - KHÔNG áp filter
    // gì cả, mọi role đã đăng nhập (kể cả Employee) thấy được toàn bộ danh
    // sách phân trang đầy đủ thông tin. Giờ dùng UsersAccessHelper: Admin/
    // Assistant thấy tất cả; Manager chỉ phòng ban mình quản lý (+ chính
    // mình); Employee chỉ chính mình.
    UsersAccessHelper.applyViewFilter(queryBuilder, userId, userRole, scope);

    if (role) {
      queryBuilder.andWhere('user.role = :role', { role });
    }
    if (departmentId) {
      queryBuilder.andWhere('user.departmentId = :departmentId', { departmentId });
    }
    if (isActive !== undefined) {
      queryBuilder.andWhere('user.isActive = :isActive', { isActive });
    }
    if (search) {
      queryBuilder.andWhere('(user.name LIKE :search OR user.email LIKE :search)', { search: `%${search}%` });
    }

    const [data, total] = await queryBuilder
      .skip((page - 1) * limit)
      .take(limit)
      .orderBy('user.id', 'DESC')
      .getManyAndCount();

    return {
      data,
      total,
      page,
      limit
    };
  }

  /**
   * Sinh mã nhân viên tiếp theo dạng AZ+số tăng dần (AZ001, AZ002...) - dựa
   * trên mã LỚN NHẤT hiện có KHỚP ĐÚNG định dạng AZ<số> (không dùng COUNT số
   * dòng, vì admin có thể đặt tay mã tuỳ ý/không liên tục, hoặc user đã bị
   * xoá tạo khoảng trống - COUNT dễ sinh trùng mã đã tồn tại).
   */
  private async generateNextEmployeeCode(): Promise<string> {
    const result = await this.usersRepository
      .createQueryBuilder('user')
      .select(
        'MAX(CAST(SUBSTRING(user.employee_code, 3) AS UNSIGNED))',
        'maxNum',
      )
      .where("user.employee_code REGEXP '^AZ[0-9]+$'")
      .getRawOne();

    const nextNum = (Number(result?.maxNum) || 0) + 1;
    return `AZ${String(nextNum).padStart(3, '0')}`;
  }

  async create(
    createDto: CreateUserDto,
    creatorId: number,
    creatorRole: string,
    scope?: string | null,
    // ⚠️ MỚI (isRootAdmin) - optional để không phá lời gọi cũ (test/nơi
    // khác chưa truyền) - thiếu thì coi như KHÔNG phải Root Admin (an toàn
    // hơn: chặn nhầm còn hơn cấp nhầm quyền Root Admin).
    creatorIsRootAdmin?: boolean,
  ): Promise<User> {
    // 1. Check email exists
    const existing = await this.usersRepository.findOne({
      where: { email: createDto.email },
    });

    if (existing) {
      throw new ConflictException('Email đã tồn tại');
    }

    // FIX BUG THẬT: role phải THẬT SỰ tồn tại trong bảng `roles` - xem
    // validateRoleExists() để biết vì sao (DTO không còn hardcode enum nữa).
    await this.validateRoleExists(createDto.role);

    // ⚠️ MỚI (isRootAdmin) - xem JSDoc đầy đủ ở User.isRootAdmin/migration
    // AddIsRootAdminToUsers1781000000000. CHỈ Root Admin hiện tại
    // (role=admin && isRootAdmin=true) mới được tạo thẳng 1 user khác đã là
    // Root Admin ngay từ đầu - Admin thường/role khác cố tình gửi field này
    // đều bị chặn (không âm thầm bỏ qua - báo lỗi rõ để không tưởng nhầm đã
    // thành công). Root Admin chỉ có thể gắn cho role='admin' - gắn cho role
    // khác vô nghĩa vì bypass ở PermissionGuard/RolesService/... đều check
    // `role === Role.ADMIN` TRƯỚC KHI check isRootAdmin.
    if (createDto.isRootAdmin) {
      if (creatorRole !== Role.ADMIN || !creatorIsRootAdmin) {
        throw new ForbiddenException('Chỉ Root Admin mới có quyền cấp Root Admin cho tài khoản khác');
      }
      if (createDto.role !== Role.ADMIN) {
        throw new BadRequestException('Root Admin chỉ áp dụng cho role Admin');
      }
    }

    // ⚠️ Scope-based: thay check Role.MANAGER bằng scope='department'.
    // scope='department' -> Manager tuỳ chỉnh: chỉ tạo user trong phòng ban mình quản lý.
    if (creatorRole !== Role.ADMIN && scope === 'department') {
      if (createDto.departmentId == null) {
        throw new ForbiddenException(
          'Bạn phải chọn phòng ban khi tạo nhân viên mới (chỉ tạo được trong phòng ban mình quản lý)',
        );
      }
      const managedIds = await UsersAccessHelper.getManagedDepartmentIds(
        this.departmentsRepository,
        creatorId,
      );
      if (!managedIds.includes(createDto.departmentId)) {
        throw new ForbiddenException(
          'Bạn chỉ được tạo nhân viên trong phòng ban mình đang quản lý',
        );
      }
    }

    // 2. Hash password
    const bcrypt = require('bcrypt');
    const hashedPassword = await bcrypt.hash(createDto.password, 10);

    // 2b. Mã nhân viên: dùng mã admin nhập tay nếu có (check trùng trước để
    // báo lỗi rõ ràng, thay vì để rơi xuống lỗi UNIQUE thô ở tầng DB); nếu
    // không nhập thì tự sinh AZ+N tăng dần.
    let employeeCode = createDto.employeeCode?.trim();
    if (employeeCode) {
      const existingCode = await this.usersRepository.findOne({
        where: { employeeCode },
      });
      if (existingCode) {
        throw new ConflictException(`Mã nhân viên "${employeeCode}" đã tồn tại`);
      }
    }

    // 3. Create entity - retry sinh mã tự động vài lần nếu đụng race
    // condition hiếm gặp (2 người tạo nhân viên gần như đồng thời, cả 2 cùng
    // tính ra "mã tiếp theo" giống nhau trước khi 1 trong 2 kịp lưu xong).
    // Chỉ retry khi TỰ SINH mã (employeeCode rỗng lúc vào) - mã admin nhập
    // tay trùng đã bị chặn rõ ràng ở bước 2b, không retry silently đổi mã
    // họ chọn.
    const isAutoGenerated = !employeeCode;
    const MAX_RETRY = 3;
    let savedUser: User | undefined;
    let lastError: any;

    for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
      if (isAutoGenerated) {
        employeeCode = await this.generateNextEmployeeCode();
      }

      const user = this.usersRepository.create({
        ...createDto,
        employeeCode,
        password: hashedPassword,
      });

      try {
        savedUser = await this.usersRepository.save(user);
        break;
      } catch (error: any) {
        lastError = error;
        if (error.code === 'ER_DUP_ENTRY' && isAutoGenerated) {
          continue; // thử sinh mã kế tiếp rồi lưu lại
        }
        throw error;
      }
    }

    if (!savedUser) {
      throw lastError;
    }

    // 4. Không bao giờ echo password hash ra ngoài, kể cả trong audit log
    const safeUser = omitPassword(savedUser as any);

    if (creatorId) {
      this.auditService.logActionAsync(
        creatorId,
        'CREATE_USER',
        'user',
        (savedUser as any).id,
        null,
        safeUser,
      );
    }

    this.logger.log(`[Users] New user created: ${savedUser.id}`);

    return safeUser as User;
  }

  async update(
    id: number,
    updateDto: UpdateUserDto,
    callerId: number,
    callerRole: string,
    scope?: string | null,
    // ⚠️ MỚI (isRootAdmin) - xem JSDoc trong create(). Thiếu -> coi như
    // KHÔNG phải Root Admin.
    callerIsRootAdmin?: boolean,
  ): Promise<User> {
    // 1. Tìm user
    const user = await this.usersRepository.findOne({ 
      where: { id } 
    });

    if (!user) {
      throw new NotFoundException('Không tìm thấy nhân viên');
    }

    // ⚠️ MỚI (isRootAdmin) - xem JSDoc đầy đủ ở create(). CHỈ Root Admin
    // hiện tại mới được ĐỔI field này (bật hoặc tắt) cho BẤT KỲ user nào
    // (kể cả chính mình - tự tắt Root Admin của mình vẫn phải là Root Admin
    // mới làm được, tránh 1 Admin thường mạo nhận). `updateDto.isRootAdmin`
    // chỉ coi là "có gửi lên" khi khác `undefined` - tránh chặn nhầm các
    // request update khác hoàn toàn không đụng tới field này.
    if (updateDto.isRootAdmin !== undefined && updateDto.isRootAdmin !== user.isRootAdmin) {
      if (callerRole !== Role.ADMIN || !callerIsRootAdmin) {
        throw new ForbiddenException('Chỉ Root Admin mới có quyền thay đổi trạng thái Root Admin của tài khoản khác');
      }
      // ⚠️ MỚI - KHÔNG được tự đổi trạng thái Root Admin của CHÍNH MÌNH qua
      // đường này (kể cả Root Admin đang thao tác) - tránh tình huống tự bật
      // Root Admin cho vô số tài khoản khác rồi tự gỡ mình mà không ai xác
      // nhận lại được, hoặc tự gỡ Root Admin của chính mình trong lúc thao
      // tác nhầm. Muốn đổi trạng thái Root Admin của bản thân, phải nhờ 1
      // Root Admin KHÁC thực hiện việc này giúp.
      if (id === callerId) {
        throw new ForbiddenException('Không thể tự thay đổi trạng thái Root Admin của chính mình - phải nhờ 1 Root Admin khác thực hiện');
      }
      // ⚠️ MỚI - hành động nhạy cảm (thêm/gỡ "lối thoát hiểm" tuyệt đối cho
      // 1 tài khoản) -> bắt buộc Root Admin đang thao tác nhập lại ĐÚNG mật
      // khẩu CỦA CHÍNH HỌ (không phải mật khẩu target) để xác nhận, cùng
      // tinh thần `changeOwnPassword()`/`updateOwnEmail()` ở trên.
      if (!updateDto.currentPassword) {
        throw new BadRequestException('Phải nhập lại mật khẩu hiện tại để xác nhận thay đổi trạng thái Root Admin');
      }
      const caller = await this.usersRepository
        .createQueryBuilder('user')
        .addSelect('user.password')
        .where('user.id = :callerId', { callerId })
        .getOne();
      if (!caller || !caller.password) {
        throw new UnauthorizedException('Không xác thực được tài khoản đang thao tác');
      }
      const isCallerPasswordMatching = await bcrypt.compare(updateDto.currentPassword, caller.password);
      if (!isCallerPasswordMatching) {
        throw new UnauthorizedException('Mật khẩu hiện tại không đúng');
      }
      const targetRoleAfterUpdate = updateDto.role ?? user.role;
      if (updateDto.isRootAdmin && targetRoleAfterUpdate !== Role.ADMIN) {
        throw new BadRequestException('Root Admin chỉ áp dụng cho role Admin');
      }
      // Tắt Root Admin của MỘT trong số các Root Admin hiện có -> phải đảm
      // bảo còn ÍT NHẤT 1 Root Admin khác sau khi lưu, tránh khoá cứng toàn
      // bộ hệ thống (không còn ai còn lối thoát hiểm để tự cấp lại quyền) -
      // đúng tinh thần JSDoc migration AddIsRootAdminToUsers1781000000000.
      if (updateDto.isRootAdmin === false && user.isRootAdmin === true) {
        const remainingRootAdmins = await this.usersRepository.count({
          where: { isRootAdmin: true } as any,
        });
        if (remainingRootAdmins <= 1) {
          throw new ForbiddenException(
            'Không thể gỡ Root Admin cuối cùng của hệ thống - phải chỉ định ít nhất 1 Root Admin khác trước',
          );
        }
      }
    }

    // Đổi role của 1 Root Admin SANG role khác 'admin' (không đụng field
    // isRootAdmin trực tiếp) - coi như tước Root Admin luôn, vì isRootAdmin
    // chỉ có ý nghĩa khi role='admin' (mọi bypass đều check `role ===
    // Role.ADMIN` TRƯỚC). Áp CÙNG rào chắn với việc tắt isRootAdmin ở trên
    // (nhánh này chỉ chạy khi nhánh trên CHƯA xử lý, tức updateDto không hề
    // gửi kèm isRootAdmin).
    if (
      user.isRootAdmin &&
      updateDto.role !== undefined &&
      updateDto.role !== Role.ADMIN &&
      updateDto.isRootAdmin === undefined
    ) {
      if (callerRole !== Role.ADMIN || !callerIsRootAdmin) {
        throw new ForbiddenException('Chỉ Root Admin mới có quyền đổi role của 1 Root Admin sang role khác');
      }
      const remainingRootAdmins = await this.usersRepository.count({
        where: { isRootAdmin: true } as any,
      });
      if (remainingRootAdmins <= 1) {
        throw new ForbiddenException(
          'Không thể đổi role của Root Admin cuối cùng sang role khác - phải chỉ định ít nhất 1 Root Admin khác trước',
        );
      }
      // Tự động tước cờ - tránh dữ liệu tự mâu thuẫn (role khác 'admin'
      // nhưng isRootAdmin vẫn true).
      (updateDto as any).isRootAdmin = false;
    }

    // ⚠️ FIX PERMISSIONS.md mục 2.2: trước đây endpoint khoá cứng
    // @Roles(ADMIN) ở controller nên không cần check gì thêm ở đây - giờ mở
    // cho Assistant/Manager, phải tự gác bằng canManageUser dựa trên phòng
    // ban HIỆN TẠI của user (trước khi bị sửa).
    const allowed = await UsersAccessHelper.canManageUser(
      this.departmentsRepository,
      user.id,
      user.departmentId,
      callerId,
      callerRole,
      scope,
    );
    if (!allowed) {
      throw new ForbiddenException('Bạn không có quyền sửa thông tin nhân viên này');
    }

    // Nếu Manager đổi departmentId sang phòng ban KHÁC, phòng ban mới đó
    // cũng phải nằm trong phạm vi Manager quản lý - tránh Manager "chuyển"
    // 1 nhân viên đang quản lý được sang phòng ban mình không hề quản lý.
    if (
      callerRole === Role.MANAGER &&
      updateDto.departmentId != null &&
      updateDto.departmentId !== user.departmentId
    ) {
      const managedIds = await UsersAccessHelper.getManagedDepartmentIds(
        this.departmentsRepository,
        callerId,
      );
      if (!managedIds.includes(updateDto.departmentId)) {
        throw new ForbiddenException(
          'Bạn chỉ được chuyển nhân viên sang phòng ban mình đang quản lý',
        );
      }
    }

    // Mã nhân viên: nếu admin đổi sang mã khác, check trùng trước (báo lỗi
    // rõ ràng thay vì để rơi xuống lỗi UNIQUE thô ở tầng DB).
    if (updateDto.employeeCode && updateDto.employeeCode.trim() !== user.employeeCode) {
      const existingCode = await this.usersRepository.findOne({
        where: { employeeCode: updateDto.employeeCode.trim() },
      });
      if (existingCode) {
        throw new ConflictException(`Mã nhân viên "${updateDto.employeeCode}" đã tồn tại`);
      }
    }

    // FIX BUG THẬT: role phải THẬT SỰ tồn tại trong bảng `roles` (chỉ check
    // khi CÓ đổi role - undefined nghĩa là giữ nguyên, không cần validate lại).
    if (updateDto.role) {
      await this.validateRoleExists(updateDto.role);
    }

    // 2. Nếu có password, hash trước. Nếu không, XÓA khỏi DTO để tránh Object.assign chép đè chuỗi rỗng
    if ((updateDto as any).password && (updateDto as any).password.trim() !== '') {
      const bcrypt = require('bcrypt');
      (updateDto as any).password = await bcrypt.hash((updateDto as any).password, 10);
    } else {
      delete (updateDto as any).password;
    }

    // 3. Clone for audit
    const oldData = { ...user };

    // 4. Merge data
    Object.assign(user, updateDto);

    // 5. CRITICAL: PHẢI CÓ SAVE()
    const savedUser = await this.usersRepository.save(user);

    // 6. Không bao giờ echo password hash ra ngoài, kể cả trong audit log
    const safeOldData = omitPassword(oldData as any);
    const safeUser = omitPassword(savedUser as any);

    if (callerId) {
      this.auditService.logActionAsync(
        callerId,
        'UPDATE_USER',
        'user',
        (savedUser as any).id,
        safeOldData,
        safeUser,
      );
    }

    this.logger.log(`[Users] User ID ${savedUser.id} updated. isActive: ${savedUser.isActive}`);

    return safeUser as User;
  }

  async resetPassword(
    id: number,
    dto: ResetPasswordDto,
    callerId: number,
    callerRole: string,
    scope?: string | null,
  ) {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('Không tìm thấy nhân viên');
    }

    // ⚠️ FIX PERMISSIONS.md mục 2.2: endpoint trước đây @Roles(ADMIN) riêng,
    // giờ mở Assistant/Manager - gác lại đúng phạm vi bằng canManageUser.
    const allowed = await UsersAccessHelper.canManageUser(
      this.departmentsRepository,
      user.id,
      user.departmentId,
      callerId,
      callerRole,
      scope,
    );
    if (!allowed) {
      throw new ForbiddenException('Bạn không có quyền đặt lại mật khẩu của nhân viên này');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
    await this.usersRepository.update(id, { password: hashedPassword });

    if (callerId) {
      this.auditService.logActionAsync(
        callerId,
        'RESET_PASSWORD',
        'user',
        id,
        null,
        { targetUserId: id },
      );
    }

    return { success: true, message: 'Đã đặt lại mật khẩu thành công' };
  }

  // ⚠️ Method getProfile()/updateProfile() (Fanpage/Group thủ công) ĐÃ BỊ
  // XOÁ - xem user.entity.ts + users.controller.ts. Dùng
  // `LinkGroupManagersService.listManagedByMe()` thay thế.

  // ==========================================================================
  // PROFILE TỰ PHỤC VỤ (`PATCH /users/me/*`) - CHÍNH MÌNH SỬA, KHÔNG PHẢI
  // ADMIN SỬA NGƯỜI KHÁC (khác create/update/resetPassword ở trên). 3 hành
  // động độc lập, mỗi hành động gate 1 permission riêng (xem migration
  // `AddUserSoftDeleteAndProfilePermissions`) - đúng nguyên tắc PERMISSIONS.md
  // §1.7: mỗi permission chỉ nên tương ứng 1 hành động rõ nghĩa.
  // ==========================================================================

  /**
   * Tự sửa tên/SĐT của chính mình. Không nhận email/role/departmentId/
   * isActive/employeeCode - các trường quản trị đó vẫn chỉ sửa được qua
   * `update()` (ADMIN/ASSISTANT/MANAGER + `users.manage`).
   */
  async updateOwnProfile(userId: number, dto: UpdateOwnProfileDto): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Không tìm thấy tài khoản');
    }

    const oldData = omitPassword(user as any);
    if (dto.name !== undefined) user.name = dto.name;
    if (dto.phone !== undefined) user.phone = dto.phone;

    const saved = await this.usersRepository.save(user);
    const safeUser = omitPassword(saved as any);

    this.auditService.logActionAsync(userId, 'UPDATE_OWN_PROFILE', 'user', userId, oldData, safeUser);
    this.logger.log(`[Users] User ID ${userId} tự sửa profile của chính mình`);

    return safeUser as User;
  }

  /**
   * Tự đổi Email đăng nhập của chính mình. Yêu cầu nhập lại mật khẩu hiện
   * tại để xác nhận (hành động nhạy cảm - email dùng để đăng nhập). Permission
   * `profile.edit_email` mặc định CHỈ Admin - guard thật sự nằm ở Controller
   * (`@RequirePermission`), ở đây chỉ lo nghiệp vụ (check mật khẩu + trùng
   * email).
   */
  async updateOwnEmail(userId: number, dto: UpdateOwnEmailDto): Promise<User> {
    // password có select:false -> phải addSelect thủ công để so khớp
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.id = :userId', { userId })
      .getOne();
    if (!user) {
      throw new NotFoundException('Không tìm thấy tài khoản');
    }

    const isPasswordMatching = await bcrypt.compare(dto.currentPassword, user.password as string);
    if (!isPasswordMatching) {
      throw new UnauthorizedException('Mật khẩu hiện tại không đúng');
    }

    if (dto.email !== user.email) {
      const existing = await this.usersRepository.findOne({ where: { email: dto.email } });
      if (existing) {
        throw new ConflictException('Email đã được sử dụng bởi tài khoản khác');
      }
    }

    const oldEmail = user.email;
    user.email = dto.email;
    const saved = await this.usersRepository.save(user);
    const safeUser = omitPassword(saved as any);

    this.auditService.logActionAsync(userId, 'UPDATE_OWN_EMAIL', 'user', userId, { email: oldEmail }, { email: saved.email });
    this.logger.log(`[Users] User ID ${userId} tự đổi email: ${oldEmail} -> ${saved.email}`);

    return safeUser as User;
  }

  /**
   * Tự đổi mật khẩu của chính mình. Khác `resetPassword()` (Admin đặt lại
   * CHO NGƯỜI KHÁC, không cần mật khẩu cũ) - ở đây bắt buộc `currentPassword`
   * đúng mới cho đổi, và `newPassword`/`confirmNewPassword` phải khớp nhau
   * (validate lại ở tầng Service dù FE đã tự so khớp - không tin riêng FE
   * cho hành động nhạy cảm). Sau khi đổi, thu hồi refresh token hiện tại
   * (giống `AuthService.logout`) - buộc đăng nhập lại ở các thiết bị khác,
   * tránh phiên cũ vẫn dùng được sau khi mật khẩu đã đổi.
   */
  async changeOwnPassword(userId: number, dto: ChangePasswordDto): Promise<{ success: boolean; message: string }> {
    if (dto.newPassword !== dto.confirmNewPassword) {
      throw new BadRequestException('Mật khẩu mới nhập lại không khớp');
    }

    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.id = :userId', { userId })
      .getOne();
    if (!user) {
      throw new NotFoundException('Không tìm thấy tài khoản');
    }

    const isPasswordMatching = await bcrypt.compare(dto.currentPassword, user.password as string);
    if (!isPasswordMatching) {
      throw new UnauthorizedException('Mật khẩu hiện tại không đúng');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
    await this.usersRepository.update(userId, { password: hashedPassword });
    // Thu hồi refresh token hiện tại - đồng bộ hành vi với AuthService.logout,
    // ép các phiên (thiết bị) khác đăng nhập lại sau khi đổi mật khẩu.
    await this.saveRefreshToken(userId, null);

    this.auditService.logActionAsync(userId, 'CHANGE_OWN_PASSWORD', 'user', userId, null, { targetUserId: userId });
    this.logger.log(`[Users] User ID ${userId} tự đổi mật khẩu`);

    return { success: true, message: 'Đã đổi mật khẩu thành công. Vui lòng đăng nhập lại ở các thiết bị khác.' };
  }

  // ==========================================================================
  // XOÁ TÀI KHOẢN (mềm -> cứng) - `users.delete`, mặc định CHỈ Admin, có thể
  // mở rộng qua `/phan-quyen` (supports_scope=FALSE -> không giới hạn theo
  // phòng ban, ai có quyền này xoá được BẤT KỲ ai, đúng như thiết kế quyền
  // Xoá tuyệt đối ở PERMISSIONS.md mục 1).
  //
  // Chặn cứng KHÔNG cho tự xoá chính mình (soft lẫn hard) - phòng trường hợp
  // Admin cuối cùng tự khoá/tự xoá tài khoản của chính mình gây "mồ côi" hệ
  // thống (không còn ai đăng nhập được để khôi phục). Đây là quyết định sản
  // phẩm chủ động, KHÔNG có trong yêu cầu gốc - cần xác nhận lại với chủ dự
  // án nếu muốn cho phép tự xoá chính mình.
  // ==========================================================================

  /**
   * Xoá mềm - chỉ set `deletedAt`/`deletedById`, dữ liệu vẫn còn nguyên vẹn
   * trong DB (nằm ở "thùng rác" `GET /users/trash`). Tài khoản này ngay lập
   * tức KHÔNG login được nữa (`findByEmail`/`findById` tự loại bỏ record có
   * `deletedAt` - xem comment trong `user.entity.ts`), refresh token hiện có
   * cũng bị thu hồi luôn để chặn phiên đang đăng nhập tiếp tục dùng token cũ.
   */
  async softDeleteUser(targetId: number, callerId: number): Promise<{ success: boolean; message: string }> {
    if (targetId === callerId) {
      throw new ForbiddenException('Không thể tự xoá chính mình');
    }

    const user = await this.usersRepository.findOne({ where: { id: targetId } });
    if (!user) {
      throw new NotFoundException('Không tìm thấy tài khoản');
    }

    // ⚠️ MỚI (isRootAdmin) - KHÔNG AI xoá được tài khoản Root Admin qua
    // đường này, kể cả 1 Root Admin khác (đúng yêu cầu "RootAdmin không xoá
    // được người cùng là RootAdmin" - áp dụng chặt hơn 1 bước: chặn LUÔN ở
    // tầng service, không chỉ chặn Root Admin xoá Root Admin, vì Admin
    // thường có `users.delete` cũng không được phép xoá Root Admin). Muốn
    // xoá 1 Root Admin, phải tự tay 1 Root Admin khác gỡ cờ `isRootAdmin`
    // qua `update()` trước (có rào chắn "còn ít nhất 1 Root Admin" riêng).
    if (user.isRootAdmin) {
      throw new ForbiddenException(
        'Không thể xoá tài khoản Root Admin - phải gỡ trạng thái Root Admin của tài khoản này trước',
      );
    }

    await this.usersRepository.update(targetId, {
      deletedAt: new Date(),
      deletedById: callerId,
    } as any);
    await this.saveRefreshToken(targetId, null);

    this.auditService.logActionAsync(callerId, 'SOFT_DELETE_USER', 'user', targetId, null, { targetUserId: targetId });
    this.logger.log(`[Users] User ID ${targetId} đã bị xoá mềm bởi ${callerId}`);

    return { success: true, message: 'Đã chuyển tài khoản vào thùng rác' };
  }

  /** Danh sách tài khoản đang ở "thùng rác" (đã xoá mềm, chưa xoá cứng). */
  async listTrash(): Promise<User[]> {
    return this.usersRepository
      .createQueryBuilder('user')
      .withDeleted()
      .leftJoinAndSelect('user.department', 'department')
      // ⚠️ MỚI - đồng bộ với findOne()/findAll() ở trên, cùng đợt rà soát.
      .leftJoinAndSelect('user.position', 'position')
      .leftJoinAndSelect('user.deletedBy', 'deletedBy')
      .where('user.deletedAt IS NOT NULL')
      .orderBy('user.deletedAt', 'DESC')
      .getMany();
  }

  /** Khôi phục 1 tài khoản đã xoá mềm - chỉ cần clear `deletedAt`/`deletedById`. */
  async restoreUser(targetId: number, callerId: number): Promise<{ success: boolean; message: string }> {
    const user = await this.usersRepository.findOne({
      where: { id: targetId } as any,
      withDeleted: true,
    });
    if (!user || user.deletedAt == null) {
      throw new NotFoundException('Không tìm thấy tài khoản trong thùng rác');
    }

    await this.usersRepository.update(targetId, {
      deletedAt: null,
      deletedById: null,
    } as any);

    this.auditService.logActionAsync(callerId, 'RESTORE_USER', 'user', targetId, null, { targetUserId: targetId });
    this.logger.log(`[Users] User ID ${targetId} đã được khôi phục bởi ${callerId}`);

    return { success: true, message: 'Đã khôi phục tài khoản' };
  }

  /**
   * XOÁ CỨNG - vĩnh viễn, không hoàn tác. BẮT BUỘC tài khoản đã ở trạng thái
   * xoá mềm trước đó (2 bước tách biệt theo đúng yêu cầu chủ dự án: xoá mềm
   * trước, xoá cứng là bước "confirm" riêng sau).
   *
   * Chạy trong 1 transaction (`DataSource.transaction`), 2 giai đoạn:
   *
   * 1. "Assign"/quan hệ hiện hành (còn ý nghĩa nghiệp vụ "ai đang phụ trách
   *    cái gì") -> AUTO FALLBACK gán lại cho CHÍNH NGƯỜI BẤM XOÁ (`callerId`)
   *    thay vì để mất/vỡ FK - đúng yêu cầu "nếu xoá user bị hỏng thì auto
   *    fallback gán cho user nào xoá user đó": `customers.sales_user_id`,
   *    `customers.marketing_user_id`, `departments.manager_user_id`.
   * 2. Bản ghi "assignment"/quan hệ mang tính LỊCH SỬ giao-nhận data (không
   *    phải trạng thái hiện hành) -> XOÁ HẲN theo (đúng yêu cầu "assign hay
   *    các phần liên quan bị xoá theo"): toàn bộ dòng trong
   *    `customer_assignments` có nhắc tới user này (dù là người gán, người
   *    nhận, người gán trước đó, hay người thu hồi).
   * 3. Cột audit trail thuần tuý (không phải "đang sở hữu" cái gì, chỉ là
   *    "ai từng tạo/sửa bản ghi X") -> reassign sang `callerId` khi cột đó
   *    NOT NULL (bắt buộc phải có giá trị hợp lệ, không thể để trống), hoặc
   *    SET NULL khi cột cho phép NULL và việc gán nhầm cho người xoá sẽ làm
   *    sai lệch lịch sử (vd audit_logs.user_id không NULL được -> đành
   *    reassign; users.approved_by_id NULL được -> set NULL cho đúng nghĩa
   *    "không rõ ai duyệt nữa" thay vì bịa ra chủ mới).
   * 4. Các FK đã tự khai `onDelete: 'SET NULL'`/`'CASCADE'` sẵn ở tầng DB
   *    (`customer.created_by_id`/`updated_by_id`, `deposit.created_by_id`,
   *    `customer_note.updated_by`, `customer_group_membership.updated_by`,
   *    `leave_requests.approver_id`/`requester_id`, `link_group.primary_
   *    manager_id`, `link_group_secondary_manager.*`, `link_group_content_
   *    staff.*`, `users.deleted_by_id`) - KHÔNG cần xử lý tay, DB tự lo khi
   *    chạy lệnh DELETE cuối cùng.
   *
   * ⚠️ Khi thêm cột FK trỏ tới `users.id` mới ở bảng khác trong tương lai,
   * PHẢI cập nhật lại danh sách trong hàm này (không có cơ chế tự phát hiện)
   * - nếu quên, lệnh DELETE cuối cùng sẽ ném lỗi FK constraint rõ ràng (an
   * toàn - KHÔNG âm thầm xoá dở dang) chứ không tự ý bỏ qua.
   */
  async hardDeleteUser(targetId: number, callerId: number): Promise<{ success: boolean; message: string }> {
    if (targetId === callerId) {
      throw new ForbiddenException('Không thể tự xoá chính mình');
    }

    const user = await this.usersRepository.findOne({
      where: { id: targetId } as any,
      withDeleted: true,
    });
    if (!user) {
      throw new NotFoundException('Không tìm thấy tài khoản');
    }
    if (user.deletedAt == null) {
      throw new BadRequestException('Phải xoá mềm (chuyển vào thùng rác) trước khi xoá cứng');
    }

    // ⚠️ MỚI (isRootAdmin) - xem giải thích đầy đủ ở softDeleteUser(). Về lý
    // thuyết không thể xảy ra (softDeleteUser đã chặn từ trước nên Root
    // Admin không thể lọt vào thùng rác qua luồng bình thường), nhưng vẫn
    // chặn tường minh ở đây - phòng thủ 2 lớp, không tin tưởng ngầm định
    // rằng dữ liệu trong thùng rác luôn "sạch".
    if (user.isRootAdmin) {
      throw new ForbiddenException('Không thể xoá vĩnh viễn tài khoản Root Admin');
    }

    const safeUserSnapshot = omitPassword(user as any);

    await this.dataSource.transaction(async (manager) => {
      // 1. "Assign" hiện hành -> fallback gán cho người xoá
      await manager.query('UPDATE customers SET sales_user_id = ? WHERE sales_user_id = ?', [callerId, targetId]);
      await manager.query('UPDATE customers SET marketing_user_id = ? WHERE marketing_user_id = ?', [callerId, targetId]);
      await manager.query('UPDATE departments SET manager_user_id = ? WHERE manager_user_id = ?', [callerId, targetId]);

      // 2. Lịch sử giao-nhận data -> xoá hẳn theo
      await manager.query(
        'DELETE FROM customer_assignments WHERE assigned_to_id = ? OR assigned_by_id = ? OR previous_assignee_id = ? OR reclaimed_by_id = ?',
        [targetId, targetId, targetId, targetId],
      );

      // 3a. Audit trail NOT NULL -> reassign cho người xoá (không thể để trống)
      await manager.query('UPDATE customers SET created_by = ? WHERE created_by = ?', [callerId, targetId]);
      await manager.query('UPDATE customers SET created_by_id = ? WHERE created_by_id = ?', [callerId, targetId]);
      await manager.query('UPDATE customers SET updated_by_id = ? WHERE updated_by_id = ?', [callerId, targetId]);
      await manager.query('UPDATE deposits SET created_by = ? WHERE created_by = ?', [callerId, targetId]);
      await manager.query('UPDATE deposits SET created_by_id = ? WHERE created_by_id = ?', [callerId, targetId]);
      await manager.query('UPDATE customer_notes SET created_by = ? WHERE created_by = ?', [callerId, targetId]);
      await manager.query('UPDATE customer_notes SET updated_by = ? WHERE updated_by = ?', [callerId, targetId]);
      await manager.query('UPDATE audit_logs SET user_id = ? WHERE user_id = ?', [callerId, targetId]);

      // 3b. Audit trail NULL được -> set NULL (tránh gán nhầm lịch sử cho người xoá)
      await manager.query('UPDATE users SET approved_by_id = NULL WHERE approved_by_id = ?', [targetId]);
      await manager.query('UPDATE attendance_logs SET matched_user_id = NULL WHERE matched_user_id = ?', [targetId]);

      // 4. Xoá hẳn dòng user - các FK còn lại đã có onDelete SET NULL/CASCADE
      // sẵn ở tầng DB (xem JSDoc phía trên), tự động xử lý khi DELETE chạy.
      await manager.query('DELETE FROM users WHERE id = ?', [targetId]);
    });

    this.auditService.logActionAsync(callerId, 'HARD_DELETE_USER', 'user', targetId, safeUserSnapshot, null);
    this.logger.log(`[Users] User ID ${targetId} đã bị xoá CỨNG (vĩnh viễn) bởi ${callerId}`);

    return { success: true, message: 'Đã xoá vĩnh viễn tài khoản' };
  }

  /**
   * Tạo user từ luồng TỰ ĐĂNG KÝ (AuthService.register) - KHÁC với create()
   * ở trên (dùng cho Admin tự thêm nhân viên, mặc định approved luôn).
   * Ở đây role LUÔN là EMPLOYEE, approvalStatus LUÔN là PENDING - hardcode
   * cứng, không nhận role/approvalStatus từ tham số, để không có đường nào
   * (kể cả lỗi lập trình sau này gọi nhầm) vô tình tạo tài khoản đã duyệt
   * sẵn hoặc có quyền cao hơn EMPLOYEE qua đường tự đăng ký công khai.
   */
  async createPendingRegistration(data: {
    name: string;
    email: string;
    password: string; // đã hash sẵn từ AuthService
    phone?: string;
    departmentId?: number;
    positionId?: number;
  }): Promise<User> {
    // ⚠️ KIỂM TRA TÍNH THỐNG NHẤT DỮ LIỆU: đây là endpoint CÔNG KHAI, ai
    // cũng gọi được (không cần token) - nếu không validate, 1 người bất kỳ
    // có thể gửi `departmentId` bịa (vd 999999) và:
    //  1) Nếu cột department_id có ràng buộc FK (đúng như user.entity.ts đang
    //     khai báo @ManyToOne + @JoinColumn) -> insert sẽ ném lỗi FK thô ở
    //     tầng DB (QueryFailedError), trả về 500 khó hiểu thay vì 400 rõ ràng.
    //  2) Nếu lỡ gửi ID của 1 phòng ban đã bị vô hiệu hoá (isActive=false,
    //     không hiện trong danh sách công khai GET /departments/public) thì
    //     vẫn có thể "lách" gán vào phòng ban đó dù nó không được phép chọn.
    // Nên phải xác nhận phòng ban vừa TỒN TẠI vừa ĐANG ACTIVE trước khi lưu,
    // khớp đúng với danh sách mà form đăng ký công khai đang hiển thị.
    if (data.departmentId != null) {
      const department = await this.departmentsService.findOne(data.departmentId);
      if (!department.isActive) {
        throw new BadRequestException('Phòng ban này hiện không khả dụng để đăng ký');
      }
    }

    // Cùng lý do như departmentId ở trên - Position không có cột isActive
    // (xem position.entity.ts) nên chỉ cần xác nhận TỒN TẠI; findOne() đã tự
    // ném NotFoundException (404) nếu ID bịa, không cần check thêm.
    if (data.positionId != null) {
      await this.positionsService.findOne(data.positionId);
    }

    // Mã nhân viên: đăng ký công khai luôn TỰ SINH (không cho tự đặt tay -
    // tránh spam trùng/đặt mã tuỳ tiện qua form công khai). Retry vài lần
    // nếu đụng race condition hiếm gặp (2 người đăng ký gần như đồng thời).
    const MAX_RETRY = 3;
    let savedUser: User | undefined;
    let lastError: any;

    for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
      const employeeCode = await this.generateNextEmployeeCode();

      const user = this.usersRepository.create({
        name: data.name,
        email: data.email,
        password: data.password,
        phone: data.phone ?? null,
        departmentId: data.departmentId ?? undefined,
        positionId: data.positionId ?? undefined,
        employeeCode,
        role: Role.EMPLOYEE,
        approvalStatus: ApprovalStatus.PENDING,
        isActive: true,
      });

      try {
        savedUser = await this.usersRepository.save(user);
        break;
      } catch (error: any) {
        lastError = error;
        if (error.code === 'ER_DUP_ENTRY') {
          continue;
        }
        throw error;
      }
    }

    if (!savedUser) {
      throw lastError;
    }
    return savedUser;
  }

  /**
   * Danh sách tài khoản đang chờ duyệt - dùng cho màn "Nhân viên" (badge số
   * lượng chờ duyệt + tab riêng). Không phân trang vì số lượng chờ duyệt tại
   * 1 thời điểm thường nhỏ, nếu sau này lớn dần có thể thêm phân trang.
   *
   * FIX PERMISSIONS.md mục 2.8: Admin/Assistant thấy TẤT CẢ (không đổi).
   * Manager CHỈ thấy tài khoản đăng ký vào ĐÚNG phòng ban mình đang quản lý
   * (`department.manager_user_id = viewerId`) - loại khỏi danh sách nếu
   * không khớp, không phải báo lỗi (đây là danh sách, không phải hành động
   * trên 1 bản ghi cụ thể).
   */
  async findPendingApprovals(viewerId: number, viewerRole: string, scope?: string | null): Promise<User[]> {
    const where: any = { approvalStatus: ApprovalStatus.PENDING };

    if (viewerRole !== Role.ADMIN && scope === 'department') {
      const managedIds = await UsersAccessHelper.getManagedDepartmentIds(
        this.departmentsRepository,
        viewerId,
      );
      if (managedIds.length === 0) {
        return []; // Manager chưa quản lý phòng ban nào -> không có gì để duyệt
      }
      where.departmentId = In(managedIds);
    }

    return this.usersRepository.find({
      where,
      // ⚠️ MỚI - đồng bộ với các query khác ở trên: người duyệt (Admin/
      // Assistant/Manager) cần thấy Vị trí mà người tự đăng ký đã chọn
      // (xem RegisterDto.positionId) để duyệt đúng, không chỉ thấy phòng ban.
      relations: ['department', 'position'],
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Duyệt 1 tài khoản tự đăng ký. Admin/Assistant duyệt được mọi phòng ban
   * (không đổi). FIX PERMISSIONS.md mục 2.8: Manager CHỈ duyệt được nếu
   * phòng ban NGƯỜI ĐĂNG KÝ đã chọn (departmentId hiện tại của user, TRƯỚC
   * khi áp overrides) trùng đúng phòng ban mình đang quản lý - nếu không
   * khớp, trả 403 (khác findPendingApprovals chỉ ẩn khỏi danh sách, ở đây
   * là hành động trực tiếp trên 1 bản ghi cụ thể nên phải chặn cứng).
   * Nếu Manager có đổi departmentId lúc duyệt (overrides.departmentId),
   * phòng ban MỚI đó cũng phải nằm trong phạm vi Manager quản lý.
   */
  async approveUser(
    id: number,
    approverId: number,
    approverRole: string,
    scope?: string | null,
    overrides?: { role?: string; departmentId?: number; positionId?: number | null },
  ): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('Không tìm thấy tài khoản');
    }
    if (user.approvalStatus !== ApprovalStatus.PENDING) {
      throw new BadRequestException('Tài khoản này không ở trạng thái chờ duyệt');
    }

    // Scope-based: thay check Role.MANAGER bằng scope='department'
    if (approverRole !== Role.ADMIN && scope === 'department') {
      const managedIds = await UsersAccessHelper.getManagedDepartmentIds(
        this.departmentsRepository,
        approverId,
      );
      if (user.departmentId == null || !managedIds.includes(user.departmentId)) {
        throw new ForbiddenException(
          'Bạn chỉ được duyệt tài khoản đăng ký vào phòng ban mình đang quản lý',
        );
      }
      if (overrides?.departmentId != null && !managedIds.includes(overrides.departmentId)) {
        throw new ForbiddenException(
          'Bạn chỉ được chuyển tài khoản này sang phòng ban mình đang quản lý',
        );
      }
    }

    // FIX BUG THẬT: role phải THẬT SỰ tồn tại trong bảng `roles` (chỉ check
    // khi Admin/Assistant/Manager có ĐỔI role lúc duyệt).
    if (overrides?.role) {
      await this.validateRoleExists(overrides.role);
    }

    // ⚠️ MỚI - đối xứng validate role ở trên. Người duyệt có thể gán/đổi Vị
    // trí ngay lúc duyệt (thay vì phải vào "/users" sửa lại lần 2) - xác
    // nhận Vị trí THẬT SỰ tồn tại, đúng pattern `UsersService.create()`.
    if (overrides?.positionId != null) {
      await this.positionsService.findOne(overrides.positionId);
    }

    user.approvalStatus = ApprovalStatus.APPROVED;
    user.approvedById = approverId;
    user.approvedAt = new Date();
    user.rejectionReason = null;
    if (overrides?.role) user.role = overrides.role;
    if (overrides?.departmentId !== undefined) user.departmentId = overrides.departmentId;
    if (overrides?.positionId !== undefined) user.positionId = overrides.positionId;

    const saved = await this.usersRepository.save(user);

    this.auditService.logActionAsync(
      approverId,
      'APPROVE_USER',
      'user',
      id,
      null,
      { role: saved.role, departmentId: saved.departmentId, positionId: saved.positionId },
    );
    this.logger.log(`[Users] User ID ${id} approved by ${approverId}`);

    return omitPassword(saved as any) as User;
  }

  /**
   * Từ chối 1 tài khoản tự đăng ký. KHÔNG xoá tài khoản (giữ lại lịch sử +
   * lý do từ chối) - chỉ chuyển approvalStatus sang REJECTED, chặn đăng nhập
   * vĩnh viễn (khác PENDING - có thể duyệt sau, REJECTED thì không tự động
   * "chuyển lại" được, cần admin sửa tay qua update() nếu muốn đảo ngược).
   *
   * FIX PERMISSIONS.md mục 2.8: cùng rule với approveUser() - Manager chỉ
   * từ chối được tài khoản đăng ký vào đúng phòng ban mình quản lý.
   */
  async rejectUser(
    id: number,
    approverId: number,
    approverRole: string,
    scope?: string | null,
    reason?: string,
  ): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('Không tìm thấy tài khoản');
    }
    if (user.approvalStatus !== ApprovalStatus.PENDING) {
      throw new BadRequestException('Tài khoản này không ở trạng thái chờ duyệt');
    }

    // Scope-based: thay check Role.MANAGER bằng scope='department'
    if (approverRole !== Role.ADMIN && scope === 'department') {
      const managedIds = await UsersAccessHelper.getManagedDepartmentIds(
        this.departmentsRepository,
        approverId,
      );
      if (user.departmentId == null || !managedIds.includes(user.departmentId)) {
        throw new ForbiddenException(
          'Bạn chỉ được từ chối tài khoản đăng ký vào phòng ban mình đang quản lý',
        );
      }
    }

    user.approvalStatus = ApprovalStatus.REJECTED;
    user.approvedById = approverId;
    user.approvedAt = new Date();
    user.rejectionReason = reason?.trim() || null;

    const saved = await this.usersRepository.save(user);

    this.auditService.logActionAsync(
      approverId,
      'REJECT_USER',
      'user',
      id,
      null,
      { reason: saved.rejectionReason },
    );
    this.logger.log(`[Users] User ID ${id} rejected by ${approverId}`);

    return omitPassword(saved as any) as User;
  }
}