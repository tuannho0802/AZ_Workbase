import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { waitUntil } from '@vercel/functions';
import { PeriodicTask } from '../../database/entities/periodic-task.entity';
import { PeriodicTaskStatus } from '../../database/entities/periodic-task-status.entity';
import { PeriodicTaskSecondaryAssignee } from '../../database/entities/periodic-task-secondary-assignee.entity';
import { User } from '../../database/entities/user.entity';
import { Department } from '../../database/entities/department.entity';
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
// ⚠️ Notification Phase 2: NotificationsModule là @Global() (mirror
// AuditModule/Customer Phase 3) nên không cần import module - tránh phụ
// thuộc vòng. `EmitInput` re-export để các service con (checklist/customers/
// secondary-assignees) build đúng shape khi gọi `emitTaskNotification()`.
import { NotificationsService, EmitInput } from '../notifications/notifications.service';

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
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
    @InjectRepository(DepartmentManager)
    private readonly departmentManagerRepo: Repository<DepartmentManager>,
    // ⚠️ Notification Phase 2: CHỈ dùng để đọc `secondaryAssigneeIds` làm
    // recipients (xem `getSecondaryAssigneeIds()`) - không ghi gì vào bảng
    // này (ghi/xoá vẫn thuộc `PeriodicTaskSecondaryAssigneesService`).
    @InjectRepository(PeriodicTaskSecondaryAssignee)
    private readonly secondaryAssigneeRepo: Repository<PeriodicTaskSecondaryAssignee>,
    private readonly permissionsService: PermissionsService,
    private readonly auditService: PeriodicTaskAuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private readonly logger = new Logger(PeriodicTasksService.name);

  // ═════════════════ THÔNG BÁO TỰ ĐỘNG (Notification Phase 2) ═════════════════
  // Nguyên tắc mirror Y HỆT Customer Phase 3 (PLAN mục 3): (1) KHÔNG BAO GIỜ
  // làm hỏng nghiệp vụ chính - mọi đoạn chuẩn bị thông báo bọc try/catch +
  // Logger.error; (2) chỉ emit SAU KHI đã ghi DB nghiệp vụ thành công; (3)
  // khi `NOTIFICATIONS_ENABLED` tắt thì KHÔNG thêm bất kỳ query nào vào
  // luồng cũ. Khác Customer ở chỗ đây là "cổng DUY NHẤT" cho CẢ module Task
  // (mirror ý tưởng "1 nguồn áp filter duy nhất" của RBAC nhưng áp cho
  // notification): `PeriodicTaskChecklistItemsService`,
  // `PeriodicTaskCustomersService`, `PeriodicTaskSecondaryAssigneesService`
  // đều đã inject sẵn `PeriodicTasksService` (dùng cho `findOne()`/
  // `assertEditableWhenLocked()`) nên gọi qua 2 hàm public bên dưới thay vì
  // tự inject thêm `NotificationsService` ở 4 file khác nhau.

  /** Pass-through `NotificationsService.emit()` - xem JSDoc ở trên. */
  emitTaskNotification(input: EmitInput): void {
    this.notificationsService.emit(input);
  }

  /**
   * Chạy phần chuẩn bị + `emit()` thông báo trong `waitUntil()` (như
   * `CustomersService.notifySafely()`), nuốt mọi lỗi. Trả về Promise CHỈ để
   * test `await`.
   */
  notifyTaskSafely(label: string, run: () => void | Promise<void>): Promise<void> {
    const task = (async () => {
      try {
        if (!this.notificationsService.isEnabled()) return;
        await run();
      } catch (error) {
        const err = error as Error;
        this.logger.error(`Chuẩn bị thông báo Task thất bại (${label}): ${err?.message}`, err?.stack);
      }
    })();
    try {
      waitUntil(task);
    } catch {
      // Ngoài môi trường Vercel: promise vẫn chạy, không cần waitUntil.
    }
    return task;
  }

  /**
   * `secondaryAssigneeIds` hiện tại của 1 Task - dùng làm
   * `recipients.task.secondaryAssigneeIds` cho các sự kiện gửi tới TOÀN BỘ
   * "stakeholder" (chính + phụ), vd `task.updated`/`task.status_changed`/
   * `task.checklist_changed`/`task.customer_linked`/`task.locked`/
   * `task.deleted`. Trả mảng rỗng ngay khi tắt flag - không tốn query.
   */
  async getSecondaryAssigneeIds(taskId: number): Promise<number[]> {
    if (!this.notificationsService.isEnabled()) return [];
    const rows = await this.secondaryAssigneeRepo.find({
      where: { taskId },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }

  /**
   * Trạng thái mặc định khi tạo Task không truyền `statusId` - dùng đúng
   * status hệ thống `code='not_started'` seed sẵn ở
   * `CreatePeriodicTaskStatuses1781900000000`.
   */
  /**
   * Trạng thái mặc định khi tạo Task không truyền `statusId` - dùng đúng
   * status hệ thống `code='not_started'` seed sẵn ở
   * `CreatePeriodicTaskStatuses1781900000000`.
   *
   * ⚠️ Trả về CẢ ENTITY (không chỉ `id` như bản cũ `getDefaultStatusId()`) -
   * cần đủ `name`/`color` để dựng audit snapshot "Tạo mới" đọc được ngay
   * (xem `buildAuditSnapshot()` + mục cải tiến audit log bên dưới), tránh
   * phải query lại lần 2.
   */
  private async getDefaultStatus(): Promise<PeriodicTaskStatus> {
    const defaultStatus = await this.statusRepo.findOne({ where: { code: 'not_started' } });
    if (!defaultStatus) {
      throw new BadRequestException(
        'Không tìm thấy trạng thái mặc định "not_started" - hệ thống Trạng thái công việc định kỳ chưa được khởi tạo đúng',
      );
    }
    return defaultStatus;
  }

  /**
   * ⚠️ Trả về CẢ ENTITY (trước đây `Promise<void>`, chỉ ném lỗi nếu không
   * tồn tại) - lý do đổi: cần đủ `name`/`color` của status MỚI để dựng audit
   * snapshot đọc được (xem `buildAuditSnapshot()`) mà KHÔNG cần query lại
   * lần 2 - tái dùng đúng kết quả của lần kiểm tra tồn tại này.
   */
  private async assertStatusExists(statusId: number): Promise<PeriodicTaskStatus> {
    const status = await this.statusRepo.findOne({ where: { id: statusId } });
    if (!status) {
      throw new BadRequestException(`Trạng thái với ID ${statusId} không tồn tại`);
    }
    return status;
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
   * ⚠️ CẢI TIẾN AUDIT LOG (báo lỗi thật từ người dùng - trang "Lịch sử Công
   * việc định kỳ" hiển thị "Trạng thái: 2" / "Dữ liệu phức hợp" thay vì tên
   * đọc được): dựng 1 snapshot "sạch" cho `oldData`/`newData` của audit log,
   * THAY THẾ việc trước đây log thẳng `{ ...task }`/`saved` (raw entity).
   *
   * 2 vấn đề gốc rễ của cách làm cũ:
   *  1. Entity `PeriodicTask` có CẢ cột FK thô (`statusId`/`primaryAssigneeId`/
   *     `departmentId`) LẪN object quan hệ (`status`/`primaryAssignee`/
   *     `department`) - spread `{ ...task }` đưa CẢ 2 vào snapshot, khiến
   *     FE hiển thị 2 dòng "Trạng thái" trùng nhau (1 dòng đọc được, 1 dòng
   *     chỉ có số ID thô).
   *  2. Sau khi đổi `statusId`/`primaryAssigneeId`/`departmentId`, code gán
   *     tạm object quan hệ dạng `{ id }` (CỐ Ý - xem comment "BUG THẬT
   *     2026-09-15" ở `update()`, cần thiết để TypeORM ghi đúng FK xuống
   *     DB) - nhưng object rút gọn này mất hết `name`/`color`, nếu log
   *     thẳng vào audit thì FE không có gì để hiển thị ngoài raw object.
   *
   * Hàm này giải quyết CẢ 2: chỉ chọn lọc field có ý nghĩa với end-user,
   * và cho phép truyền `overrides` để dùng ENTITY ĐẦY ĐỦ (đã tự fetch riêng
   * ở `create()`/`update()` - xem `assertStatusExists()`/`assertUserExists()`
   * giờ trả về cả entity) thay vì object rút gọn `{ id }` đang gắn tạm trên
   * `task`/`saved` cho mục đích persist.
   *
   * `createdBy`/`updatedBy` KHÔNG đưa vào đây - luôn TRÙNG với cột "Người
   * thực hiện" mà chính dòng audit log đã hiển thị riêng (`log.user`), đưa
   * vào chỉ gây nhiễu (đã xác nhận qua ảnh chụp màn hình người dùng gửi:
   * dòng "updatedBy: Trống → Dữ liệu phức hợp" không mang thêm thông tin gì).
   */
  private buildAuditSnapshot(
    task: PeriodicTask,
    overrides?: {
      status?: PeriodicTaskStatus | null;
      primaryAssignee?: User | null;
      department?: Department | null;
    },
  ): Record<string, unknown> {
    const status = overrides && 'status' in overrides ? overrides.status : (task.status ?? null);
    const primaryAssignee =
      overrides && 'primaryAssignee' in overrides ? overrides.primaryAssignee : (task.primaryAssignee ?? null);
    const department =
      overrides && 'department' in overrides ? overrides.department : (task.department ?? null);

    return {
      title: task.title,
      description: task.description,
      periodType: task.periodType,
      periodStartDate: task.periodStartDate,
      periodEndDate: task.periodEndDate,
      status: status ? { id: status.id, code: status.code, name: status.name, color: status.color } : null,
      primaryAssignee: primaryAssignee ? { id: primaryAssignee.id, name: primaryAssignee.name } : null,
      department: department ? { id: department.id, name: department.name } : null,
      color: task.color,
      isLocked: task.isLocked,
      lockNote: task.lockNote,
      note: task.note,
    };
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

    // Luôn lấy CẢ ENTITY status (không chỉ id) - dùng thẳng cho cả cột FK
    // lẫn audit snapshot "Tạo mới", tránh phải query lại lần 2 (xem
    // `buildAuditSnapshot()`).
    const status = dto.statusId ? await this.assertStatusExists(dto.statusId) : await this.getDefaultStatus();

    // Auto-fill departmentId từ phòng ban của primaryAssignee lúc tạo nếu
    // không truyền - CHỈ là giá trị khởi tạo, sửa tự do sau đó (PLAN mục 2.10).
    const departmentId = dto.departmentId ?? primaryAssignee.departmentId ?? null;
    const department =
      departmentId != null ? await this.departmentRepo.findOne({ where: { id: departmentId } }) : null;

    const task = this.taskRepo.create({
      title: dto.title,
      description: dto.description ?? null,
      periodType: dto.periodType,
      periodStartDate: dto.periodStartDate,
      periodEndDate: dto.periodEndDate,
      statusId: status.id,
      primaryAssigneeId: dto.primaryAssigneeId,
      departmentId,
      createdById: userId,
      note: dto.note ?? null,
      color: dto.color ?? null,
    });

    const saved = await this.taskRepo.save(task);

    // Phase 7 (PLAN mục 2.6): audit log `created`, gọi SAU khi có `saved.id`
    // thật (fire-and-forget, không chặn response - xem JSDoc `logActionAsync`).
    // Dùng `buildAuditSnapshot()` + entity đầy đủ vừa fetch ở trên (KHÔNG
    // log thẳng `saved` - `saved` chỉ có `statusId`/`primaryAssigneeId`/
    // `departmentId` dạng số, không có tên/màu để FE hiển thị - xem JSDoc
    // `buildAuditSnapshot`).
    this.auditService.logActionAsync(
      saved.id,
      userId,
      PeriodicTaskAuditAction.CREATED,
      null,
      this.buildAuditSnapshot(saved, { status, primaryAssignee, department }),
    );

    // Notification Phase 2 (PLAN mục 4.4): chỉ báo cho phụ trách chính -
    // `emit()` tự loại nếu actor (người tạo) trùng chính người phụ trách.
    void this.notifyTaskSafely('created', () =>
      this.emitTaskNotification({
        type: 'task.created',
        actorId: userId,
        entity: { type: 'periodic_task', id: saved.id },
        entityName: saved.title,
        recipients: { task: { primaryAssigneeId: saved.primaryAssigneeId } },
      }),
    );

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
    // `oldData` đúng cho audit log. Giữ RIÊNG `beforeStatusId`/
    // `beforePrimaryAssigneeId` (để so sánh đổi/không đổi bên dưới - vẫn cần
    // giá trị SỐ thô cho phép so sánh `!==` đơn giản) tách khỏi `before` (bản
    // ĐỌC ĐƯỢC dùng để ghi log - xem `buildAuditSnapshot()`).
    const beforeStatusId = task.statusId;
    const beforePrimaryAssigneeId = task.primaryAssigneeId;
    const before = this.buildAuditSnapshot(task);

    // Giữ sẵn entity ĐẦY ĐỦ (name/color/...) của status/primaryAssignee/
    // department cho audit "after" - mặc định = giá trị hiện có trên `task`
    // (đã load đủ qua `findOne()`), CHỈ ghi đè khi field đó thật sự đổi bên
    // dưới (xem từng nhánh `if`).
    let newStatus: PeriodicTaskStatus | null = task.status ?? null;
    let newPrimaryAssignee: User | null = task.primaryAssignee ?? null;
    let newDepartment: Department | null = task.department ?? null;

    if (dto.periodStartDate !== undefined || dto.periodEndDate !== undefined) {
      this.assertPeriodDatesValid(
        dto.periodStartDate ?? task.periodStartDate,
        dto.periodEndDate ?? task.periodEndDate,
      );
    }

    if (dto.primaryAssigneeId !== undefined) {
      newPrimaryAssignee = await this.assertUserExists(dto.primaryAssigneeId, 'Người phụ trách chính');
      task.primaryAssigneeId = dto.primaryAssigneeId;
      // BUG THẬT (2026-09-15, xem WORKFLOW_LOG): `findOne()` gọi
      // `leftJoinAndSelect` nên `task.primaryAssignee` (relation) đã có
      // sẵn trong bộ nhớ, trỏ tới Entity CŨ - nếu chỉ đổi cột FK
      // `primaryAssigneeId` mà không đổi luôn `primaryAssignee`, TypeORM
      // `.save()` ưu tiên relation object đã load, khiến FK không thực sự
      // được ghi xuống DB (xem SKILL_NESTJS_BACKEND.md mục 13, "TypeORM
      // Relation Precedence in Update"). Set relation bằng object rút gọn
      // `{ id }` để đồng bộ với cột FK vừa đổi - vẫn giữ nguyên fix này
      // (bắt buộc cho persist), entity ĐẦY ĐỦ ở `newPrimaryAssignee` phía
      // trên CHỈ dùng cho audit log, không gán vào `task`.
      task.primaryAssignee = { id: dto.primaryAssigneeId } as User;
    }

    if (dto.statusId !== undefined) {
      newStatus = await this.assertStatusExists(dto.statusId);
      task.statusId = dto.statusId;
      // Cùng bug như `primaryAssignee` ở trên - đây chính là nguyên nhân
      // Kanban kéo-thả đổi cột: PATCH trả 200 (object JS trong bộ nhớ đã
      // đổi `statusId`) nhưng DB không đổi thật, nên GET lại sau đó (Table/
      // Kanban refetch) vẫn thấy Task ở trạng thái cũ. Tương tự trên: entity
      // đầy đủ nằm ở `newStatus`, `task.status` vẫn chỉ gán `{ id }`.
      task.status = { id: dto.statusId } as PeriodicTaskStatus;
    }

    if (dto.title !== undefined) task.title = dto.title;
    if (dto.description !== undefined) task.description = dto.description ?? null;
    if (dto.periodType !== undefined) task.periodType = dto.periodType;
    if (dto.periodStartDate !== undefined) task.periodStartDate = dto.periodStartDate;
    if (dto.periodEndDate !== undefined) task.periodEndDate = dto.periodEndDate;
    // Sửa tự do sau khi tạo, kể cả về null (PLAN mục 2.10) - CHỈ áp dụng khi
    // field THẬT SỰ có mặt trong body (không phải "undefined nghĩa là xoá").
    if (dto.departmentId !== undefined) {
      task.departmentId = dto.departmentId;
      task.department = dto.departmentId != null ? ({ id: dto.departmentId } as Department) : null;
      newDepartment =
        dto.departmentId != null ? await this.departmentRepo.findOne({ where: { id: dto.departmentId } }) : null;
    }
    if (dto.note !== undefined) task.note = dto.note ?? null;
    if (dto.color !== undefined) task.color = dto.color ?? null;

    task.updatedById = user.id;
    task.updatedBy = { id: user.id } as User;

    const saved = await this.taskRepo.save(task);

    // ⚠️ CẢI TIẾN AUDIT LOG (xem JSDoc `buildAuditSnapshot`): dùng snapshot
    // ĐỌC ĐƯỢC (entity đầy đủ đã resolve ở trên qua `newStatus`/
    // `newPrimaryAssignee`/`newDepartment`) thay vì log thẳng `saved` (raw
    // entity, quan hệ vừa đổi chỉ còn `{ id }` sau bug-fix persist ở trên).
    const after = this.buildAuditSnapshot(saved, {
      status: newStatus,
      primaryAssignee: newPrimaryAssignee,
      department: newDepartment,
    });

    // Phase 7 (PLAN mục 2.6): action `updated` chung cho MỌI lần PATCH, cộng
    // thêm 2 action CHUYÊN BIỆT `status_changed`/`primary_assignee_changed`
    // nếu đúng field đó thật sự đổi giá trị (1 lần PATCH có thể ghi nhiều
    // dòng audit nếu đổi cùng lúc nhiều field quan trọng - đúng ý PLAN liệt
    // kê đây là các action TÁCH BIỆT nhau, không phải biến thể của nhau).
    this.auditService.logActionAsync(saved.id, user.id, PeriodicTaskAuditAction.UPDATED, before, after);
    if (dto.statusId !== undefined && beforeStatusId !== saved.statusId) {
      this.auditService.logActionAsync(
        saved.id,
        user.id,
        PeriodicTaskAuditAction.STATUS_CHANGED,
        { status: before.status },
        { status: after.status },
      );
    }
    if (dto.primaryAssigneeId !== undefined && beforePrimaryAssigneeId !== saved.primaryAssigneeId) {
      this.auditService.logActionAsync(
        saved.id,
        user.id,
        PeriodicTaskAuditAction.PRIMARY_ASSIGNEE_CHANGED,
        { primaryAssignee: before.primaryAssignee },
        { primaryAssignee: after.primaryAssignee },
      );
    }

    // Notification Phase 2 (PLAN mục 4.4): 3 event ĐỘC LẬP có thể cùng phát
    // ra từ 1 lần PATCH (đúng tinh thần audit log ở trên - không phải biến
    // thể của nhau). `task.updated` CHỈ báo khi đổi title/kỳ hạn/mô tả (PLAN
    // "chỉ báo khi đổi title, periodStartDate/EndDate, description") - đổi
    // status/phụ trách/phòng ban/note/màu KHÔNG tự động kích `task.updated`
    // (status/phụ trách đã có event riêng; phòng ban/note/màu cố ý im lặng).
    const statusChanged = dto.statusId !== undefined && beforeStatusId !== saved.statusId;
    const primaryChanged = dto.primaryAssigneeId !== undefined && beforePrimaryAssigneeId !== saved.primaryAssigneeId;
    const coreFieldsChanged =
      dto.title !== undefined ||
      dto.periodStartDate !== undefined ||
      dto.periodEndDate !== undefined ||
      dto.description !== undefined;

    if (statusChanged || primaryChanged || coreFieldsChanged) {
      void this.notifyTaskSafely('update', async () => {
        const entity = { type: 'periodic_task' as const, id: saved.id };
        const entityName = saved.title;

        if (primaryChanged) {
          this.emitTaskNotification({
            type: 'task.primary_changed',
            actorId: user.id,
            entity,
            entityName,
            recipients: {
              newUserIds: saved.primaryAssigneeId != null ? [saved.primaryAssigneeId] : [],
              previousUserIds: beforePrimaryAssigneeId != null ? [beforePrimaryAssigneeId] : [],
            },
          });
        }

        // 2 event còn lại gửi tới TOÀN BỘ stakeholder (chính + phụ) - chỉ
        // query `secondaryAssigneeIds` 1 LẦN, dùng chung cho cả 2 nếu cần.
        if (statusChanged || coreFieldsChanged) {
          const secondaryAssigneeIds = await this.getSecondaryAssigneeIds(saved.id);
          const stakeholders = {
            primaryAssigneeId: saved.primaryAssigneeId,
            secondaryAssigneeIds,
          };

          if (statusChanged) {
            this.emitTaskNotification({
              type: 'task.status_changed',
              actorId: user.id,
              entity,
              entityName,
              recipients: { task: { ...stakeholders, createdById: saved.createdById } },
              params: { toStatus: newStatus?.name },
            });
          }

          if (coreFieldsChanged) {
            this.emitTaskNotification({
              type: 'task.updated',
              actorId: user.id,
              entity,
              entityName,
              recipients: { task: stakeholders },
            });
          }
        }
      });
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
    // ⚠️ CẢI TIẾN: bỏ `lockedById` khỏi snapshot (trước đây log thêm field
    // này) - LUÔN trùng giá trị `user.id` đã hiển thị sẵn ở cột "Người thực
    // hiện" của chính dòng audit log, chỉ gây nhiễu (cùng nguyên tắc đã áp
    // dụng cho `updatedBy`/`createdBy` ở `buildAuditSnapshot()`).
    this.auditService.logActionAsync(
      saved.id,
      user.id,
      PeriodicTaskAuditAction.LOCKED,
      null,
      { lockNote: saved.lockNote },
    );

    // Notification Phase 2: báo cho toàn bộ stakeholder mỗi lần gọi lock()
    // (kể cả gọi lại trên Task đã khoá sẵn - idempotent nhưng vẫn là 1 hành
    // động lock thật, mirror đúng cách audit log không lọc trùng ở trên).
    void this.notifyTaskSafely('locked', async () => {
      const secondaryAssigneeIds = await this.getSecondaryAssigneeIds(saved.id);
      this.emitTaskNotification({
        type: 'task.locked',
        actorId: user.id,
        entity: { type: 'periodic_task', id: saved.id },
        entityName: saved.title,
        recipients: { task: { primaryAssigneeId: saved.primaryAssigneeId, secondaryAssigneeIds } },
      });
    });

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

    void this.notifyTaskSafely('unlocked', async () => {
      const secondaryAssigneeIds = await this.getSecondaryAssigneeIds(saved.id);
      this.emitTaskNotification({
        type: 'task.unlocked',
        actorId: user.id,
        entity: { type: 'periodic_task', id: saved.id },
        entityName: saved.title,
        recipients: { task: { primaryAssigneeId: saved.primaryAssigneeId, secondaryAssigneeIds } },
      });
    });

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

    // Dùng `buildAuditSnapshot()` thay vì log thẳng `task` (raw entity) -
    // cùng lý do đã sửa ở `create()`/`update()`: `task` có cả cột FK thô lẫn
    // object quan hệ, spread thẳng gây trùng dòng "Trạng thái" ở FE.
    this.auditService.logActionAsync(id, userId, PeriodicTaskAuditAction.DELETED, this.buildAuditSnapshot(task), null);

    // Notification Phase 2: báo cho stakeholder + người tạo - dùng `task`
    // (entity đã fetch trước `softDelete()`) làm nguồn dữ liệu, không cần
    // query lại (giống cách `buildAuditSnapshot(task)` ở dòng trên).
    void this.notifyTaskSafely('deleted', async () => {
      const secondaryAssigneeIds = await this.getSecondaryAssigneeIds(id);
      this.emitTaskNotification({
        type: 'task.deleted',
        actorId: userId,
        entity: { type: 'periodic_task', id },
        entityName: task.title,
        recipients: {
          task: {
            primaryAssigneeId: task.primaryAssigneeId,
            secondaryAssigneeIds,
            createdById: task.createdById,
          },
        },
      });
    });

    return { deleted: true };
  }

  /** Dùng nội bộ Phase 2 (rollup) - lấy danh sách id phòng ban user đang quản lý. */
  async getManagedDepartmentIds(userId: number): Promise<number[]> {
    return DepartmentManagerHelper.getManagedDepartmentIds(this.departmentManagerRepo, userId);
  }
}