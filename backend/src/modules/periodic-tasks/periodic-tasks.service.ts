import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PeriodicTask } from '../../database/entities/periodic-task.entity';
import { PeriodicTaskStatus } from '../../database/entities/periodic-task-status.entity';
import { User } from '../../database/entities/user.entity';
import { DepartmentManager } from '../../database/entities/department-manager.entity';
import { DepartmentManagerHelper } from '../departments/helpers/department-manager.helper';
import { PermissionsService } from '../permissions/permissions.service';
import { Role } from '../../common/enums/role.enum';
import { CreatePeriodicTaskDto } from './dto/create-periodic-task.dto';
import { UpdatePeriodicTaskDto } from './dto/update-periodic-task.dto';
import { PeriodicTaskFiltersDto } from './dto/periodic-task-filters.dto';
import { LockPeriodicTaskDto } from './dto/lock-periodic-task.dto';
import { PeriodicTaskAccessHelper } from './helpers/periodic-task-access.helper';
import { PeriodicTaskAuditService, PeriodicTaskAuditAction } from './periodic-task-audit.service';

/** Chủ thể gọi request - đúng shape `GetUser()` decorator trả về (xem
 * `JwtStrategy.validate()`), mirror `RequestingUser` ở
 * `PeriodicTaskCustomersService` (Phase 3) - cần đủ `departmentId`/
 * `positionId` để tự tra permission `periodic_tasks.edit_locked` ĐỘC LẬP
 * với scope của `periodic_tasks.edit`/`periodic_tasks.approve` đã tính sẵn
 * ở Controller (Phase 5). */
export interface RequestingUser {
  id: number;
  role: string;
  isRootAdmin?: boolean;
  departmentId?: number | null;
  positionId?: number | null;
}

/**
 * PeriodicTasksService - Phase 1 (PLAN mục 6): Status catalog + Task CRUD cơ
 * bản + RBAC view/create/edit/delete. Liên kết cha-con
 * (`periodic_task_links` - Phase 2), Customer (`periodic_task_customers` -
 * Phase 3), phụ trách phụ (`periodic_task_secondary_assignees` - Phase 4)
 * đều nằm ở service riêng. Khoá/mở khoá (`is_locked`/Phase 5) nằm NGAY
 * trong service này (`lock()`/`unlock()`/`assertEditableWhenLocked()`) vì
 * đụng trực tiếp cột trên chính `periodic_tasks`, không phải bảng con.
 */
@Injectable()
export class PeriodicTasksService {
  constructor(
    @InjectRepository(PeriodicTask)
    private readonly taskRepo: Repository<PeriodicTask>,
    @InjectRepository(PeriodicTaskStatus)
    private readonly statusRepo: Repository<PeriodicTaskStatus>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(DepartmentManager)
    private readonly departmentManagerRepo: Repository<DepartmentManager>,
    private readonly permissionsService: PermissionsService,
    private readonly auditService: PeriodicTaskAuditService,
  ) {}

  /**
   * Trạng thái mặc định khi tạo Task không truyền `statusId` - dùng đúng
   * status hệ thống `code='not_started'` seed sẵn ở
   * `CreatePeriodicTaskStatuses1781900000000`.
   */
  private async getDefaultStatusId(): Promise<number> {
    const defaultStatus = await this.statusRepo.findOne({ where: { code: 'not_started' } });
    if (!defaultStatus) {
      throw new BadRequestException(
        'Không tìm thấy trạng thái mặc định "not_started" - hệ thống Trạng thái công việc định kỳ chưa được khởi tạo đúng',
      );
    }
    return defaultStatus.id;
  }

  private async assertStatusExists(statusId: number): Promise<void> {
    const exists = await this.statusRepo.findOne({ where: { id: statusId } });
    if (!exists) {
      throw new BadRequestException(`Trạng thái với ID ${statusId} không tồn tại`);
    }
  }

  private async assertUserExists(userId: number, fieldLabel: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId, isActive: true } });
    if (!user) {
      throw new BadRequestException(`${fieldLabel} với ID ${userId} không tồn tại hoặc đã bị khóa`);
    }
    return user;
  }

  private assertPeriodDatesValid(periodStartDate: string, periodEndDate: string): void {
    if (new Date(periodEndDate) < new Date(periodStartDate)) {
      throw new BadRequestException('periodEndDate không được nhỏ hơn periodStartDate');
    }
  }

  /**
   * Lối thoát hiểm ĐỒNG BỘ với `PermissionGuard` (mirror
   * `PeriodicTaskCustomersService.isRootAdmin()`) - CHỈ Root Admin (role=admin
   * VÀ isRootAdmin=true) không bao giờ bị chặn bởi `is_locked`.
   */
  private isRootAdmin(user: RequestingUser): boolean {
    return user.role === Role.ADMIN && !!user.isRootAdmin;
  }

  /**
   * Phase 5 (PLAN mục 2.9): nếu Task đang `is_locked=true`, người sửa PHẢI
   * có thêm permission nhị phân `periodic_tasks.edit_locked` (mặc định chỉ
   * Admin, tự thừa hưởng override 3 tầng Position→Department→Global sẵn có
   * của `role_permissions` - không cần code thêm cơ chế override). Gọi ở
   * TẤT CẢ nơi sửa dữ liệu của/thuộc về 1 Task: `update()` ở đây, và các
   * sub-endpoint con (`PeriodicTaskLinksService.addLink/removeLink`,
   * `PeriodicTaskCustomersService.addCustomers/removeCustomer`,
   * `PeriodicTaskSecondaryAssigneesService.addSecondaryAssignee/
   * removeSecondaryAssignee`) - TRỪ chính `lock()`/`unlock()` bên dưới (2
   * hàm đó dùng permission `periodic_tasks.approve` riêng, KHÔNG bị chặn
   * bởi `edit_locked` - nếu không sẽ không ai unlock được 1 Task đang khoá).
   */
  async assertEditableWhenLocked(task: PeriodicTask, user: RequestingUser): Promise<void> {
    if (!task.isLocked) return;
    if (this.isRootAdmin(user)) return;

    const { allowed } = await this.permissionsService.hasPermission(
      user.role,
      'periodic_tasks.edit_locked',
      user.departmentId,
      user.positionId,
    );
    if (!allowed) {
      throw new ForbiddenException(
        'Công việc đang bị khoá, bạn không có quyền sửa khi đang khoá',
      );
    }
  }

  async create(dto: CreatePeriodicTaskDto, userId: number): Promise<PeriodicTask> {
    this.assertPeriodDatesValid(dto.periodStartDate, dto.periodEndDate);

    const primaryAssignee = await this.assertUserExists(dto.primaryAssigneeId, 'Người phụ trách chính');

    const statusId = dto.statusId ?? (await this.getDefaultStatusId());
    if (dto.statusId) {
      await this.assertStatusExists(dto.statusId);
    }

    // Auto-fill departmentId từ phòng ban của primaryAssignee lúc tạo nếu
    // không truyền - CHỈ là giá trị khởi tạo, sửa tự do sau đó (PLAN mục 2.10).
    const departmentId = dto.departmentId ?? primaryAssignee.departmentId ?? null;

    const task = this.taskRepo.create({
      title: dto.title,
      description: dto.description ?? null,
      periodType: dto.periodType,
      periodStartDate: dto.periodStartDate,
      periodEndDate: dto.periodEndDate,
      statusId,
      primaryAssigneeId: dto.primaryAssigneeId,
      departmentId,
      createdById: userId,
      note: dto.note ?? null,
      color: dto.color ?? null,
    });

    const saved = await this.taskRepo.save(task);

    // Phase 7 (PLAN mục 2.6): audit log `created`, gọi SAU khi có `saved.id`
    // thật (fire-and-forget, không chặn response - xem JSDoc `logActionAsync`).
    this.auditService.logActionAsync(saved.id, userId, PeriodicTaskAuditAction.CREATED, null, saved);

    return saved;
  }

  async findAll(filters: PeriodicTaskFiltersDto, userId: number, userRole: string, scope?: string | null) {
    const {
      page = 1,
      limit = 20,
      periodType,
      periodStartDate,
      dateFrom,
      dateTo,
      statusId,
      primaryAssigneeId,
      departmentId,
      search,
    } = filters;

    const qb = this.taskRepo
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.status', 'status')
      .leftJoinAndSelect('task.primaryAssignee', 'primaryAssignee')
      .leftJoinAndSelect('task.department', 'department')
      .leftJoinAndSelect('task.createdBy', 'createdBy')
      .leftJoinAndSelect('task.updatedBy', 'updatedBy')
      .where('task.deletedAt IS NULL');

    PeriodicTaskAccessHelper.applyViewFilter(qb, userId, userRole, scope);

    // Khớp CHÍNH XÁC 1 kỳ (PLAN mục 2.11).
    if (periodType) {
      qb.andWhere('task.periodType = :periodType', { periodType });
    }
    if (periodStartDate) {
      qb.andWhere('task.periodStartDate = :periodStartDate', { periodStartDate });
    }

    // Khớp theo KHOẢNG (range, overlap) - kết hợp AND được với điều kiện trên.
    if (dateFrom) {
      qb.andWhere('task.periodEndDate >= :dateFrom', { dateFrom });
    }
    if (dateTo) {
      qb.andWhere('task.periodStartDate <= :dateTo', { dateTo });
    }

    if (statusId) {
      qb.andWhere('task.statusId = :statusId', { statusId });
    }
    if (primaryAssigneeId) {
      qb.andWhere('task.primaryAssigneeId = :primaryAssigneeId', { primaryAssigneeId });
    }
    if (departmentId) {
      qb.andWhere('task.departmentId = :departmentId', { departmentId });
    }
    if (search) {
      qb.andWhere('task.title LIKE :search', { search: `%${search}%` });
    }

    qb.orderBy('task.periodStartDate', 'DESC').addOrderBy('task.id', 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number, userId: number, userRole: string, scope?: string | null): Promise<PeriodicTask> {
    const qb = this.taskRepo
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.status', 'status')
      .leftJoinAndSelect('task.primaryAssignee', 'primaryAssignee')
      .leftJoinAndSelect('task.department', 'department')
      .leftJoinAndSelect('task.createdBy', 'createdBy')
      .leftJoinAndSelect('task.updatedBy', 'updatedBy')
      .where('task.id = :id', { id })
      .andWhere('task.deletedAt IS NULL');

    PeriodicTaskAccessHelper.applyViewFilter(qb, userId, userRole, scope);

    const task = await qb.getOne();
    if (!task) {
      throw new NotFoundException(`Không tìm thấy Công việc định kỳ với ID ${id}`);
    }
    return task;
  }

  /**
   * ⚠️ Nguyên tắc "1 cổng gác" (đúng PLAN mục 5): PATCH luôn gọi findOne()
   * (đã áp `PeriodicTaskAccessHelper.applyViewFilter`) TRƯỚC khi sửa - Task
   * ngoài phạm vi scope sẽ tự 404 trước khi kịp chạm bước update, không cần
   * thêm 1 bộ điều kiện "canUpdate" riêng dễ lệch khỏi applyViewFilter.
   *
   * Phase 5: sau cổng gác scope, kiểm tra THÊM `assertEditableWhenLocked()`
   * - Task đang khoá mà thiếu `periodic_tasks.edit_locked` -> 403, ÁP DỤNG
   * cho MỌI field kể cả đổi `statusId`/`departmentId`/`primaryAssigneeId`
   * (PLAN mục 6 Phase 5, spec bắt buộc).
   */
  async update(
    id: number,
    dto: UpdatePeriodicTaskDto,
    user: RequestingUser,
    scope?: string | null,
  ): Promise<PeriodicTask> {
    const task = await this.findOne(id, user.id, user.role, scope);
    await this.assertEditableWhenLocked(task, user);

    // Phase 7 (PLAN mục 2.6): chụp lại snapshot TRƯỚC khi mutate để có
    // `oldData` đúng cho audit log (`{ ...task }` - shallow copy đủ dùng vì
    // các field dưới đây đều là kiểu nguyên thuỷ/string, không phải object
    // lồng bị mutate chung tham chiếu).
    const before = { ...task };

    if (dto.periodStartDate !== undefined || dto.periodEndDate !== undefined) {
      this.assertPeriodDatesValid(
        dto.periodStartDate ?? task.periodStartDate,
        dto.periodEndDate ?? task.periodEndDate,
      );
    }

    if (dto.primaryAssigneeId !== undefined) {
      await this.assertUserExists(dto.primaryAssigneeId, 'Người phụ trách chính');
      task.primaryAssigneeId = dto.primaryAssigneeId;
    }

    if (dto.statusId !== undefined) {
      await this.assertStatusExists(dto.statusId);
      task.statusId = dto.statusId;
    }

    if (dto.title !== undefined) task.title = dto.title;
    if (dto.description !== undefined) task.description = dto.description ?? null;
    if (dto.periodType !== undefined) task.periodType = dto.periodType;
    if (dto.periodStartDate !== undefined) task.periodStartDate = dto.periodStartDate;
    if (dto.periodEndDate !== undefined) task.periodEndDate = dto.periodEndDate;
    // Sửa tự do sau khi tạo, kể cả về null (PLAN mục 2.10) - CHỈ áp dụng khi
    // field THẬT SỰ có mặt trong body (không phải "undefined nghĩa là xoá").
    if (dto.departmentId !== undefined) task.departmentId = dto.departmentId;
    if (dto.note !== undefined) task.note = dto.note ?? null;
    if (dto.color !== undefined) task.color = dto.color ?? null;

    task.updatedById = user.id;

    const saved = await this.taskRepo.save(task);

    // Phase 7 (PLAN mục 2.6): action `updated` chung cho MỌI lần PATCH, cộng
    // thêm 2 action CHUYÊN BIỆT `status_changed`/`primary_assignee_changed`
    // nếu đúng field đó thật sự đổi giá trị (1 lần PATCH có thể ghi nhiều
    // dòng audit nếu đổi cùng lúc nhiều field quan trọng - đúng ý PLAN liệt
    // kê đây là các action TÁCH BIỆT nhau, không phải biến thể của nhau).
    this.auditService.logActionAsync(saved.id, user.id, PeriodicTaskAuditAction.UPDATED, before, saved);
    if (dto.statusId !== undefined && before.statusId !== saved.statusId) {
      this.auditService.logActionAsync(
        saved.id,
        user.id,
        PeriodicTaskAuditAction.STATUS_CHANGED,
        { statusId: before.statusId },
        { statusId: saved.statusId },
      );
    }
    if (dto.primaryAssigneeId !== undefined && before.primaryAssigneeId !== saved.primaryAssigneeId) {
      this.auditService.logActionAsync(
        saved.id,
        user.id,
        PeriodicTaskAuditAction.PRIMARY_ASSIGNEE_CHANGED,
        { primaryAssigneeId: before.primaryAssigneeId },
        { primaryAssigneeId: saved.primaryAssigneeId },
      );
    }

    return saved;
  }

  /**
   * Phase 5 (PLAN mục 2.9, 6): bật `is_locked` - idempotent, gọi lại nhiều
   * lần kể cả khi đã khoá không lỗi (chỉ ghi đè lại `lockedBy`/`lockedAt`/
   * `lockNote` mới nhất). Dùng CÙNG "1 cổng gác" `findOne()` với `scope` của
   * `periodic_tasks.approve` (đã tính sẵn ở Controller/`PermissionGuard`) -
   * KHÔNG bịa bảng role-pair riêng (PLAN mục 6 Phase 5), tái dùng nguyên cơ
   * chế own/department/all chung của `PeriodicTaskAccessHelper`.
   */
  async lock(
    id: number,
    dto: LockPeriodicTaskDto,
    user: RequestingUser,
    scope?: string | null,
  ): Promise<PeriodicTask> {
    const task = await this.findOne(id, user.id, user.role, scope);

    task.isLocked = true;
    task.lockedById = user.id;
    task.lockedAt = new Date();
    task.lockNote = dto.lockNote ?? null;

    const saved = await this.taskRepo.save(task);

    // Phase 7: ghi log ngay cả khi gọi lại `lock()` trên Task đã khoá sẵn
    // (idempotent theo PLAN mục 2.9) - vẫn là 1 hành động lock thật (có thể
    // đổi `lockNote` mới), không lọc trùng ở tầng audit.
    this.auditService.logActionAsync(
      saved.id,
      user.id,
      PeriodicTaskAuditAction.LOCKED,
      null,
      { lockNote: saved.lockNote, lockedById: saved.lockedById },
    );

    return saved;
  }

  /** Tắt `is_locked` - tự do gọi lại bất kỳ lúc nào, không giới hạn số lần
   * lock↔unlock (PLAN mục 2.9), cùng permission `periodic_tasks.approve`. */
  async unlock(id: number, user: RequestingUser, scope?: string | null): Promise<PeriodicTask> {
    const task = await this.findOne(id, user.id, user.role, scope);

    task.isLocked = false;
    task.lockedById = null;
    task.lockedAt = null;
    task.lockNote = null;

    const saved = await this.taskRepo.save(task);

    this.auditService.logActionAsync(saved.id, user.id, PeriodicTaskAuditAction.UNLOCKED, null, null);

    return saved;
  }

  /**
   * Xoá mềm - CHỈ Admin (PLAN mục 2.7, mirror `customers.delete`). Vẫn gọi
   * `findOne()` trước để 404 đúng cách nếu Task không tồn tại/đã xoá, sau đó
   * mới kiểm tra quyền Admin qua `PeriodicTaskAccessHelper.canDelete()`.
   */
  async remove(id: number, userId: number, userRole: string): Promise<{ deleted: true }> {
    // Admin có scope='all' cho `periodic_tasks.view` theo seed mặc định nên
    // truyền scope='all' ở đây là AN TOÀN cho luồng xoá (chỉ Admin gọi được
    // route này do @RequirePermission('periodic_tasks.delete') đã chặn ở
    // Controller/PermissionGuard trước khi chạm Service).
    const task = await this.findOne(id, userId, userRole, 'all');

    if (!PeriodicTaskAccessHelper.canDelete(task, userId, userRole)) {
      throw new ForbiddenException('Chỉ Admin mới có quyền xoá Công việc định kỳ');
    }

    await this.taskRepo.softDelete(id);

    this.auditService.logActionAsync(id, userId, PeriodicTaskAuditAction.DELETED, task, null);

    return { deleted: true };
  }

  /** Dùng nội bộ Phase 2 (rollup) - lấy danh sách id phòng ban user đang quản lý. */
  async getManagedDepartmentIds(userId: number): Promise<number[]> {
    return DepartmentManagerHelper.getManagedDepartmentIds(this.departmentManagerRepo, userId);
  }
}