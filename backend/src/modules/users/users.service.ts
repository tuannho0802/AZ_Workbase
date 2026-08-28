import { Injectable, Logger } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { User } from '../../database/entities/user.entity';
import { Department } from '../../database/entities/department.entity';
import { Role } from '../../common/enums/role.enum';
import { ManagedLink } from '../../common/types/managed-link.type';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import { ConflictException, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuditService } from '../audit/audit.service';
import { ApprovalStatus } from '../../common/enums/approval-status.enum';
import { DepartmentsService } from '../departments/departments.service';
import { UsersAccessHelper } from './helpers/users-access.helper';

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
    private readonly auditService: AuditService,
    private readonly departmentsService: DepartmentsService,
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    // password có select: false trong entity -> phải addSelect thủ công vì cần so khớp lúc login
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.email = :email', { email })
      .getOne();
  }

  async findById(id: number): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  async findOne(id: number, currentUserId: number, currentUserRole: string): Promise<User | null> {
    const user = await this.usersRepository.findOne({ where: { id }, relations: ['department'] });
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

  async findAll(userId: number, userRole: string, options: { role?: string; departmentId?: number; isActive?: boolean; search?: string; page?: number; limit?: number }) {
    const { role, departmentId, isActive, search, page = 1, limit = 20 } = options;

    const queryBuilder = this.usersRepository.createQueryBuilder('user')
      .leftJoinAndSelect('user.department', 'department')
      .where('1=1');

    // ⚠️ FIX PERMISSIONS.md mục 2.2: trước đây có comment "Visibility logic:
    // All roles can see all users (Department agnostic)" - KHÔNG áp filter
    // gì cả, mọi role đã đăng nhập (kể cả Employee) thấy được toàn bộ danh
    // sách phân trang đầy đủ thông tin. Giờ dùng UsersAccessHelper: Admin/
    // Assistant thấy tất cả; Manager chỉ phòng ban mình quản lý (+ chính
    // mình); Employee chỉ chính mình.
    UsersAccessHelper.applyViewFilter(queryBuilder, userId, userRole);

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

  async create(
    createDto: CreateUserDto,
    creatorId: number,
    creatorRole: string,
  ): Promise<User> {
    // 1. Check email exists
    const existing = await this.usersRepository.findOne({
      where: { email: createDto.email },
    });

    if (existing) {
      throw new ConflictException('Email đã tồn tại');
    }

    // ⚠️ FIX PERMISSIONS.md mục 2.2: Manager chỉ được tạo user TRONG phòng
    // ban mình quản lý - bắt buộc phải truyền departmentId (không cho để
    // trống rồi mặc định) và departmentId đó phải nằm trong danh sách phòng
    // ban mà chính Manager này đang là `manager_user_id`. Admin/Assistant
    // không bị giới hạn (tạo được ở bất kỳ phòng ban nào, kể cả không chọn).
    if (creatorRole === Role.MANAGER) {
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

    // 3. Create entity
    const user = this.usersRepository.create({
      ...createDto,
      password: hashedPassword,
    });

    // 4. CRITICAL: PHẢI CÓ SAVE()
    const savedUser = await this.usersRepository.save(user);

    // 5. Không bao giờ echo password hash ra ngoài, kể cả trong audit log
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
  ): Promise<User> {
    // 1. Tìm user
    const user = await this.usersRepository.findOne({ 
      where: { id } 
    });

    if (!user) {
      throw new NotFoundException('Không tìm thấy nhân viên');
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

  /**
   * Lấy danh sách Fanpage/Group (profile) của 1 user.
   * ⚠️ profile có select: false trong entity -> phải addSelect thủ công.
   * Quyền (FIX PERMISSIONS.md mục 2.2): trước đây chỉ check
   * `role !== ADMIN && id !== currentUserId` -> Assistant/Manager bị chặn
   * xem profile người khác dù đúng rule phải xem được (Assistant ngang
   * Admin, Manager trong phòng ban quản lý). Giờ dùng chung canManageUser -
   * cần biết departmentId của user mục tiêu trước khi check.
   */
  async getProfile(
    id: number,
    currentUserId: number,
    currentUserRole: string,
  ): Promise<{ id: number; profile: ManagedLink[] }> {
    const target = await this.usersRepository.findOne({
      where: { id },
      select: ['id', 'departmentId'],
    });
    if (!target) {
      throw new NotFoundException('Không tìm thấy nhân viên');
    }

    const allowed = await UsersAccessHelper.canManageUser(
      this.departmentsRepository,
      target.id,
      target.departmentId,
      currentUserId,
      currentUserRole,
    );
    if (!allowed) {
      throw new ForbiddenException('Bạn không có quyền xem profile của nhân viên này');
    }

    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.profile')
      .where('user.id = :id', { id })
      .getOne();

    if (!user) {
      throw new NotFoundException('Không tìm thấy nhân viên');
    }

    return { id: user.id, profile: user.profile ?? [] };
  }

  /**
   * Thay thế (replace) toàn bộ profile của 1 user bằng danh sách link mới.
   * FIX PERMISSIONS.md mục 2.2: trước đây chỉ Admin (enforced qua
   * @Roles(ADMIN) ở controller, không check gì ở service) - giờ controller
   * mở thêm Assistant/Manager, phải tự gác bằng canManageUser ở đây.
   */
  async updateProfile(
    id: number,
    dto: UpdateUserProfileDto,
    callerId: number,
    callerRole: string,
  ): Promise<{ id: number; profile: ManagedLink[] }> {
    const existing = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.profile')
      .where('user.id = :id', { id })
      .getOne();

    if (!existing) {
      throw new NotFoundException('Không tìm thấy nhân viên');
    }

    const allowed = await UsersAccessHelper.canManageUser(
      this.departmentsRepository,
      existing.id,
      existing.departmentId,
      callerId,
      callerRole,
    );
    if (!allowed) {
      throw new ForbiddenException('Bạn không có quyền sửa profile của nhân viên này');
    }

    const oldProfile = existing.profile ?? [];
    const newProfile = dto.profile;

    // CRITICAL: dùng update() thay vì save(entity) vì `profile` là select:false -
    // nếu load entity không addSelect rồi save(), TypeORM có thể ghi đè profile
    // thành NULL do field không nằm trong entity đã load.
    await this.usersRepository
      .createQueryBuilder()
      .update(User)
      .set({ profile: newProfile })
      .where('id = :id', { id })
      .execute();

    if (callerId) {
      this.auditService.logActionAsync(
        callerId,
        'UPDATE_USER_PROFILE',
        'user',
        id,
        { profile: oldProfile },
        { profile: newProfile },
      );
    }

    this.logger.log(
      `[Users] Profile updated for user ID ${id} by ${callerId}`,
    );

    return { id, profile: newProfile };
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

    const user = this.usersRepository.create({
      name: data.name,
      email: data.email,
      password: data.password,
      phone: data.phone ?? null,
      departmentId: data.departmentId ?? undefined,
      role: Role.EMPLOYEE,
      approvalStatus: ApprovalStatus.PENDING,
      isActive: true,
    });
    return this.usersRepository.save(user);
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
  async findPendingApprovals(viewerId: number, viewerRole: string): Promise<User[]> {
    const where: any = { approvalStatus: ApprovalStatus.PENDING };

    if (viewerRole === Role.MANAGER) {
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
      relations: ['department'],
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
    overrides?: { role?: string; departmentId?: number },
  ): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('Không tìm thấy tài khoản');
    }
    if (user.approvalStatus !== ApprovalStatus.PENDING) {
      throw new BadRequestException('Tài khoản này không ở trạng thái chờ duyệt');
    }

    if (approverRole === Role.MANAGER) {
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

    user.approvalStatus = ApprovalStatus.APPROVED;
    user.approvedById = approverId;
    user.approvedAt = new Date();
    user.rejectionReason = null;
    if (overrides?.role) user.role = overrides.role;
    if (overrides?.departmentId !== undefined) user.departmentId = overrides.departmentId;

    const saved = await this.usersRepository.save(user);

    this.auditService.logActionAsync(
      approverId,
      'APPROVE_USER',
      'user',
      id,
      null,
      { role: saved.role, departmentId: saved.departmentId },
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
    reason?: string,
  ): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('Không tìm thấy tài khoản');
    }
    if (user.approvalStatus !== ApprovalStatus.PENDING) {
      throw new BadRequestException('Tài khoản này không ở trạng thái chờ duyệt');
    }

    if (approverRole === Role.MANAGER) {
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