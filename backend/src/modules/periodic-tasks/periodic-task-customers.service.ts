import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PeriodicTaskCustomer } from '../../database/entities/periodic-task-customer.entity';
import { Customer } from '../../database/entities/customer.entity';
import { CustomerAccessHelper } from '../customers/helpers/customer-access.helper';
import { PermissionsService } from '../permissions/permissions.service';
import { PermissionScope } from '../../database/entities/role-permission.entity';
import { Role } from '../../common/enums/role.enum';
import { PeriodicTasksService } from './periodic-tasks.service';
import { LinkPeriodicTaskCustomersDto } from './dto/link-periodic-task-customers.dto';
import { PeriodicTaskAuditService, PeriodicTaskAuditAction } from './periodic-task-audit.service';

/** Chủ thể gọi request - đúng shape `GetUser()` decorator trả về (xem
 * `JwtStrategy.validate()`), cần đủ field để tự tra permission `customers.view`
 * ĐỘC LẬP với scope của `periodic_tasks.*` đã được `PermissionGuard` tính sẵn. */
export interface RequestingUser {
  id: number;
  role: string;
  isRootAdmin?: boolean;
  departmentId?: number | null;
  positionId?: number | null;
}

/**
 * PeriodicTaskCustomersService - Phase 3 (PLAN mục 6): gắn Customer vào Task
 * + ẩn field theo quyền, KHÔNG phụ thuộc `UiVisibilityRule` (còn dở dang ở
 * plan khác) - tự kiểm tra trực tiếp (PLAN mục 2.4).
 *
 * 2 lớp permission tách biệt, cả 2 đều bắt buộc cho POST/DELETE:
 *  1. `periodic_tasks.edit` - đã gate ở Controller/`PermissionGuard` (mirror
 *     mọi endpoint sửa Task khác).
 *  2. `periodic_tasks.link_customer` - permission NHỊ PHÂN riêng, PHẢI tự
 *     kiểm tra thêm ở đây (Controller CHỈ khai được 1 `@RequirePermission()`
 *     mỗi route - xem JSDoc `RequirePermission` decorator).
 *
 * Danh sách Customer hợp lệ để CHỌN/xem lại LUÔN chạy qua
 * `CustomerAccessHelper.applyViewFilter()` với scope THẬT của permission
 * `customers.view` (tự tra riêng qua `PermissionsService`, KHÔNG dùng scope
 * của `periodic_tasks.*` - đây là 2 permission độc lập).
 */
@Injectable()
export class PeriodicTaskCustomersService {
  constructor(
    @InjectRepository(PeriodicTaskCustomer)
    private readonly linkRepo: Repository<PeriodicTaskCustomer>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    private readonly tasksService: PeriodicTasksService,
    private readonly permissionsService: PermissionsService,
    private readonly auditService: PeriodicTaskAuditService,
  ) { }

  /** Lối thoát hiểm ĐỒNG BỘ với `PermissionGuard` - CHỈ Root Admin (role=admin
   * VÀ isRootAdmin=true) không bao giờ bị chặn, bất kể `role_permissions`. */
  private isRootAdmin(user: RequestingUser): boolean {
    return user.role === Role.ADMIN && !!user.isRootAdmin;
  }

  /** Kiểm tra permission NHỊ PHÂN `periodic_tasks.link_customer` - ném 403
   * nếu thiếu (PLAN mục 2.4 bước 1 + spec bắt buộc "không có link_customer
   * -> 403 khi POST"). */
  private async assertCanLinkCustomer(user: RequestingUser): Promise<void> {
    if (this.isRootAdmin(user)) return;

    const { allowed } = await this.permissionsService.hasPermission(
      user.role,
      'periodic_tasks.link_customer',
      user.departmentId,
      user.positionId,
    );
    if (!allowed) {
      throw new ForbiddenException('Bạn không có quyền gắn Khách hàng vào Công việc định kỳ');
    }
  }

  /** Tra scope THẬT của `customers.view` cho user hiện tại - độc lập hoàn
   * toàn với scope của `periodic_tasks.*` (2 permission khác nhau). */
  private async getCustomersViewAccess(
    user: RequestingUser,
  ): Promise<{ hasAccess: boolean; scope: PermissionScope | null }> {
    if (this.isRootAdmin(user)) {
      return { hasAccess: true, scope: PermissionScope.ALL };
    }
    const { allowed, scope } = await this.permissionsService.hasPermission(
      user.role,
      'customers.view',
      user.departmentId,
      user.positionId,
    );
    return { hasAccess: allowed, scope };
  }

  /**
   * Gắn danh sách Customer vào Task (PLAN mục 2.4, endpoint mục 5).
   * `taskScope` = scope của `periodic_tasks.edit` (đã tính sẵn ở
   * `PermissionGuard`/Controller cho route này) - dùng để "1 cổng gác" qua
   * `tasksService.findOne()` trước, KHÔNG liên quan tới scope của
   * `customers.view` bên dưới.
   */
  async addCustomers(
    taskId: number,
    dto: LinkPeriodicTaskCustomersDto,
    user: RequestingUser,
    taskScope?: string | null,
  ): Promise<Customer[]> {
    // 1 cổng gác - Task ngoài phạm vi periodic_tasks.edit của người gọi tự 404.
    const task = await this.tasksService.findOne(taskId, user.id, user.role, taskScope);
    // Phase 5 (PLAN mục 2.9): Task đang khoá mà thiếu `periodic_tasks.edit_locked` -> 403.
    await this.tasksService.assertEditableWhenLocked(task, user);

    // Permission nhị phân riêng - bắt buộc CẢ 2 lớp mới được gắn Customer.
    await this.assertCanLinkCustomer(user);

    const { hasAccess, scope: customerScope } = await this.getCustomersViewAccess(user);
    if (!hasAccess) {
      throw new ForbiddenException('Bạn không có quyền xem Khách hàng nên không thể gắn vào Công việc');
    }

    // Mỗi customerId PHẢI pass CustomerAccessHelper (PLAN mục 2.4 bước 2) -
    // không cho gắn "chui" Customer ngoài phạm vi customers.view của người gọi.
    const uniqueIds = Array.from(new Set(dto.customerIds));
    for (const customerId of uniqueIds) {
      const qb = this.customerRepo
        .createQueryBuilder('customer')
        .select('customer.id')
        .where('customer.id = :id', { id: customerId })
        .andWhere('customer.deletedAt IS NULL');
      CustomerAccessHelper.applyViewFilter(qb, user.id, user.role, customerScope);

      const found = await qb.getOne();
      if (!found) {
        throw new BadRequestException(
          `Khách hàng ID ${customerId} không tồn tại hoặc ngoài phạm vi quyền xem của bạn`,
        );
      }
    }

    // Idempotent add - bỏ qua cạnh đã tồn tại (UNIQUE(task_id, customer_id)
    // ở DB chặn trùng, nhưng lọc trước ở đây để tránh lỗi constraint 500).
    const existing = await this.linkRepo.find({
      where: { taskId, customerId: In(uniqueIds) },
      select: ['customerId'],
    });
    const existingIds = new Set(existing.map((e) => e.customerId));
    const toInsert = uniqueIds.filter((id) => !existingIds.has(id));

    if (toInsert.length > 0) {
      const rows = toInsert.map((customerId) =>
        this.linkRepo.create({ taskId, customerId, linkedById: user.id }),
      );
      await this.linkRepo.save(rows);

      // Phase 7 (PLAN mục 2.6): chỉ log những customerId THẬT SỰ mới thêm
      // (`toInsert`, không phải toàn bộ `uniqueIds` đã gửi lên) - tránh log
      // sai "đã gắn" cho những customerId thật ra đã tồn tại từ trước
      // (idempotent add, xem comment phía trên).
      //
      // ⚠️ FIX BUG THẬT (đợt rà soát toàn bộ audit log - cùng lớp bug
      // `positionId`/`assignedToIds`): trước đây log thẳng `customerIds`
      // (mảng ID số thô) - `AuditDiffViewer` không biết đọc mảng số thuần
      // nên chỉ hiện "N mục", không có tên khách hàng nào. Fetch tên các
      // customer vừa gắn (chỉ những dòng THẬT SỰ mới `toInsert`) để dựng
      // mảng `{id, name}` - viewer đã có sẵn nhánh generic hiển thị mảng
      // object có `.name` dạng Tag (xem `formatValue()`).
      const linkedCustomers = await this.customerRepo.find({
        where: { id: In(toInsert) },
        select: ['id', 'name'],
      });
      this.auditService.logActionAsync(taskId, user.id, PeriodicTaskAuditAction.CUSTOMER_LINKED, null, {
        customers: linkedCustomers.map((c) => ({ id: c.id, name: c.name })),
      });
    }

    return this.getLinkedCustomers(taskId, user);
  }

  /** Gỡ 1 Customer khỏi Task - cùng 2 lớp permission như `addCustomers()`. */
  async removeCustomer(
    taskId: number,
    customerId: number,
    user: RequestingUser,
    taskScope?: string | null,
  ): Promise<{ deleted: true }> {
    const task = await this.tasksService.findOne(taskId, user.id, user.role, taskScope);
    await this.tasksService.assertEditableWhenLocked(task, user);
    await this.assertCanLinkCustomer(user);

    const existing = await this.linkRepo.findOne({ where: { taskId, customerId } });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy liên kết Khách hàng này với Công việc');
    }

    await this.linkRepo.remove(existing);

    // ⚠️ FIX BUG THẬT (xem chú thích ở `addCustomers()`): resolve tên thay
    // vì log raw `customerId`.
    const removedCustomer = await this.customerRepo.findOne({
      where: { id: customerId },
      select: ['id', 'name'],
    });
    this.auditService.logActionAsync(taskId, user.id, PeriodicTaskAuditAction.CUSTOMER_UNLINKED, {
      customer: { id: customerId, name: removedCustomer?.name ?? null },
    });

    return { deleted: true };
  }

  /**
   * Query thuần (KHÔNG tự tra permission - nhận sẵn `scope` đã tính) -
   * danh sách Customer đã gắn, lọc lại theo đúng phạm vi `customers.view`
   * (PLAN mục 2.4 bước 3). Tách riêng khỏi việc tra permission để 2 nơi gọi
   * (`addCustomers()` và `attachLinkedCustomers()`) không phải tra
   * `hasPermission()` 2 lần cho cùng 1 request.
   */
  private async queryLinkedCustomers(
    taskId: number,
    user: RequestingUser,
    scope: PermissionScope | null,
  ): Promise<Customer[]> {
    const qb = this.customerRepo
      .createQueryBuilder('customer')
      .leftJoinAndSelect('customer.salesUser', 'salesUser')
      .innerJoin('periodic_task_customers', 'ptc', 'ptc.customer_id = customer.id')
      .where('ptc.task_id = :taskId', { taskId })
      .andWhere('customer.deletedAt IS NULL');
    CustomerAccessHelper.applyViewFilter(qb, user.id, user.role, scope);

    return qb.getMany();
  }

  /** Danh sách Customer đã gắn, tự tra quyền `customers.view` trước - dùng
   * cho response của `addCustomers()` (trả lại danh sách mới nhất). */
  private async getLinkedCustomers(taskId: number, user: RequestingUser): Promise<Customer[]> {
    const { hasAccess, scope } = await this.getCustomersViewAccess(user);
    if (!hasAccess) return [];
    return this.queryLinkedCustomers(taskId, user, scope);
  }

  /**
   * Đính field `linkedCustomers` vào response 1 Task (dùng ở
   * `PeriodicTasksController.findOne()`) - PLAN mục 2.4 bước 3+4:
   *  - Không có `customers.view` (không scope nào) -> XOÁ HẲN key
   *    `linkedCustomers` khỏi object trả về (không phải mảng rỗng `[]`,
   *    tránh lộ ra "trường này tồn tại").
   *  - Có quyền -> trả mảng đã lọc lại đúng phạm vi xem của người đang xem
   *    (không phải phạm vi lúc gắn - 2 người khác quyền xem sẽ thấy khác
   *    nhau với CÙNG 1 Task).
   */
  async attachLinkedCustomers<T extends object>(
    task: T,
    user: RequestingUser,
  ): Promise<T & { linkedCustomers?: Customer[] }> {
    const taskId = (task as unknown as { id: number }).id;
    const { hasAccess, scope } = await this.getCustomersViewAccess(user);
    if (!hasAccess) {
      return task as T & { linkedCustomers?: Customer[] };
    }

    const linkedCustomers = await this.queryLinkedCustomers(taskId, user, scope);
    return { ...task, linkedCustomers };
  }
}