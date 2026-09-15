import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { waitUntil } from '@vercel/functions';
import { PeriodicTaskAuditLog } from '../../database/entities/periodic-task-audit-log.entity';
import {
  GetPeriodicTaskAuditLogsDto,
  GetPeriodicTaskAuditLogsGlobalDto,
} from './dto/get-periodic-task-audit-logs.dto';
import { PeriodicTaskAccessHelper } from './helpers/periodic-task-access.helper';
import { AuditService } from '../audit/audit.service';

/**
 * Danh sách action chuẩn hoá cho `periodic_task_audit_logs` (PLAN mục 2.6),
 * bổ sung thêm 4 action `checklist_item_*` cho Phase 6 (PLAN mục 6 Phase 7
 * yêu cầu "quay lại rà soát toàn bộ Phase trước để gắn log đầy đủ", checklist
 * không nằm trong danh sách gốc mục 2.6 nhưng vẫn là 1 hành động sửa dữ liệu
 * của Task nên cần log). Dùng `const` object (không phải TypeScript `enum`)
 * để tránh lặp lại 3 lỗi lint `no-unsafe-enum-comparison` baseline đã ghi
 * nhận ở `periodic-task-access.helper.ts` (xem `WORKFLOW_LOG.md`).
 */
export const PeriodicTaskAuditAction = {
  CREATED: 'created',
  UPDATED: 'updated',
  STATUS_CHANGED: 'status_changed',
  PRIMARY_ASSIGNEE_CHANGED: 'primary_assignee_changed',
  SECONDARY_ASSIGNEE_ADDED: 'secondary_assignee_added',
  SECONDARY_ASSIGNEE_REMOVED: 'secondary_assignee_removed',
  PARENT_LINKED: 'parent_linked',
  PARENT_UNLINKED: 'parent_unlinked',
  CUSTOMER_LINKED: 'customer_linked',
  CUSTOMER_UNLINKED: 'customer_unlinked',
  LOCKED: 'locked',
  UNLOCKED: 'unlocked',
  DELETED: 'deleted',
  CHECKLIST_ITEM_ADDED: 'checklist_item_added',
  CHECKLIST_ITEM_UPDATED: 'checklist_item_updated',
  CHECKLIST_ITEM_REMOVED: 'checklist_item_removed',
  CHECKLIST_ITEMS_REORDERED: 'checklist_items_reordered',
} as const;

export type PeriodicTaskAuditActionType =
  (typeof PeriodicTaskAuditAction)[keyof typeof PeriodicTaskAuditAction];

/**
 * PeriodicTaskAuditService - Phase 7 (CUỐI, PLAN mục 2.6 + mục 6): audit log
 * RIÊNG cho module "Công việc định kỳ", tách khỏi `AuditService` chung
 * (`audit_logs`) - mirror gần như y hệt `AuditService.logAction()`/
 * `logActionAsync()`, chỉ khác tham số `entityType`/`entityId` rời rạc được
 * thay bằng 1 `taskId` FK trực tiếp (PLAN mục 2.6).
 */
@Injectable()
export class PeriodicTaskAuditService {
  private readonly logger = new Logger(PeriodicTaskAuditService.name);

  constructor(
    @InjectRepository(PeriodicTaskAuditLog)
    private readonly auditLogRepository: Repository<PeriodicTaskAuditLog>,
    // AuditModule là @Global() (audit.module.ts) - dùng lại ĐÚNG bảng
    // `audit_logs` chung để ghi "log về hành động dọn dẹp" (mirror chính
    // xác cách `AuditService.bulkDelete()`/`cleanupByDateRange()` tự log lại
    // hành động của chính nó ở dưới), KHÔNG ghi vào `periodic_task_audit_logs`
    // vì bulk-delete/cleanup là hành động vận hành hệ thống, không phải hành
    // động sửa đổi 1 Task cụ thể - tránh vừa xoá vừa tự thêm log mới cùng
    // bảng gây rối logic phân trang ngay sau khi xoá.
    private readonly auditService: AuditService,
  ) {}

  async logAction(
    taskId: number,
    userId: number,
    action: PeriodicTaskAuditActionType,
    oldData?: any,
    newData?: any,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const auditLog = this.auditLogRepository.create({
      taskId,
      userId,
      action,
      oldData,
      newData,
      ipAddress,
      userAgent,
    });
    return await this.auditLogRepository.save(auditLog);
  }

  /**
   * Ghi audit log dạng "fire-and-forget" - mirror ĐÚNG
   * `AuditService.logActionAsync()` (xem JSDoc gốc): dùng `waitUntil()` của
   * Vercel (`@vercel/functions`) để không chặn response chính nhưng vẫn giữ
   * function sống đủ lâu để ghi log xong trước khi Vercel tắt function, thay
   * vì bỏ `await` "tay không". Dùng hàm này ở MỌI call site trong các
   * Service Phase 1-6 (create/update/lock/unlock/delete/link/unlink/
   * checklist...).
   */
  logActionAsync(
    taskId: number,
    userId: number,
    action: PeriodicTaskAuditActionType,
    oldData?: any,
    newData?: any,
    ipAddress?: string,
    userAgent?: string,
  ): void {
    const task = this.logAction(taskId, userId, action, oldData, newData, ipAddress, userAgent).catch(
      (error: any) => {
        this.logger.error(
          `Ghi periodic task audit log thất bại (taskId=${taskId}, action=${action}): ${error?.message}`,
          error?.stack,
        );
      },
    );

    waitUntil(task);
  }

  /**
   * Lịch sử audit của 1 Task, mới nhất trước - dùng cho
   * `GET /periodic-tasks/:id/audit-logs` (PLAN mục 5). Không cần tự kiểm tra
   * quyền xem Task ở đây - Controller đã gọi `tasksService.findOne()` trước
   * (1 cổng gác) nên Task ngoài phạm vi scope đã tự 404 trước khi tới đây.
   */
  async getLogsForTask(taskId: number, filters: GetPeriodicTaskAuditLogsDto) {
    const { page = 1, limit = 20 } = filters;

    const [data, total] = await this.auditLogRepository
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.user', 'user')
      .where('log.taskId = :taskId', { taskId })
      .orderBy('log.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ═══════════════════ TRANG RIÊNG "LỊCH SỬ CÔNG VIỆC ĐỊNH KỲ" ═══════════════════
  // Yêu cầu người dùng: lịch sử hiện chỉ xem được TỪNG Task 1 (getLogsForTask ở
  // trên) - cần 1 trang riêng kiểu "Nhật ký hệ thống" (`audit.controller.ts`)
  // gộp log của MỌI Task trong phạm vi scope người xem, có filter đủ bộ + bulk
  // xoá/dọn dẹp. Mirror gần như y hệt AuditService, chỉ khác nguồn bảng.

  /**
   * Lịch sử audit GỘP của mọi Task (không giới hạn theo 1 taskId cụ thể) -
   * dùng cho `GET /periodic-tasks/audit-logs`. Áp `PeriodicTaskAccessHelper.
   * applyViewFilter()` join qua bảng `periodic_tasks` (alias `task`, ĐÚNG
   * alias mà helper này yêu cầu, xem JSDoc của helper) để đảm bảo user chỉ
   * thấy log của Task nằm trong phạm vi scope (own/department/all) - KHÔNG
   * lộ log của Task ngoài phạm vi dù đã xem được qua endpoint theo-Task
   * (endpoint đó có 1 cổng gác khác ở Controller: `tasksService.findOne()`).
   */
  async getGlobalLogs(
    filters: GetPeriodicTaskAuditLogsGlobalDto,
    viewerId: number,
    viewerRole: string,
    scope?: string | null,
  ) {
    const { page = 1, limit = 20, taskId, userId, action, fromDate, toDate, search } = filters;

    const qb = this.auditLogRepository
      .createQueryBuilder('log')
      .innerJoin('log.task', 'task')
      .addSelect(['task.id', 'task.title', 'task.deletedAt'])
      .leftJoinAndSelect('log.user', 'user')
      .orderBy('log.createdAt', 'DESC');

    PeriodicTaskAccessHelper.applyViewFilter(qb, viewerId, viewerRole, scope);

    if (taskId) {
      qb.andWhere('log.taskId = :taskId', { taskId });
    }
    if (userId) {
      qb.andWhere('log.userId = :userId', { userId });
    }
    if (action) {
      qb.andWhere('log.action = :action', { action });
    }
    if (fromDate) {
      qb.andWhere('log.createdAt >= :fromDate', { fromDate });
    }
    if (toDate) {
      const end = new Date(toDate);
      end.setDate(end.getDate() + 1);
      qb.andWhere('log.createdAt < :toDate', { toDate: end.toISOString() });
    }
    if (search) {
      qb.andWhere('(task.title LIKE :search OR user.name LIKE :search)', { search: `%${search}%` });
    }

    const [data, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Danh sách action cố định (KHÔNG query DISTINCT như `AuditService.
   * getDistinctActions()`) - khác `audit_logs` (action tự do dạng chuỗi bất
   * kỳ do nhiều module khác nhau ghi vào), `periodic_task_audit_logs` CHỈ
   * ghi đúng 16 action đã khai ở `PeriodicTaskAuditAction` (hằng số đóng ở
   * đầu file) - trả thẳng danh sách này cho FE dựng bộ lọc, khỏi tốn 1
   * query DB không cần thiết.
   */
  getDistinctActions(): string[] {
    return Object.values(PeriodicTaskAuditAction);
  }

  /**
   * Xoá hàng loạt theo danh sách ID - CHỈ Admin (Controller gate bằng
   * `@RequirePermission('periodic_tasks.delete')`, permission này vốn đã
   * "chỉ seed Admin", xem PERMISSIONS.md mục periodic_tasks). Tự ghi lại 1
   * dòng vào `audit_logs` CHUNG (không phải bảng vừa xoá) - mirror đúng
   * `AuditService.bulkDelete()`.
   */
  async bulkDelete(ids: number[], adminId: number) {
    await this.auditLogRepository.delete({ id: In(ids) });
    await this.auditService.logAction(
      adminId,
      'ADMIN_BULK_DELETE_TASK_AUDIT_LOGS',
      'periodic_task_audit_log',
      0,
      { ids },
      null,
    );
    return { success: true };
  }

  /** Dọn dẹp theo khoảng ngày - mirror đúng `AuditService.cleanupByDateRange()`. */
  async cleanupByDateRange(from: string, to: string, adminId: number) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    toDate.setDate(toDate.getDate() + 1); // Inclusive

    const count = await this.auditLogRepository.count({
      where: { createdAt: Between(fromDate, toDate) },
    });

    await this.auditLogRepository.delete({
      createdAt: Between(fromDate, toDate),
    });

    await this.auditService.logAction(
      adminId,
      'ADMIN_CLEANUP_TASK_AUDIT_LOGS',
      'periodic_task_audit_log',
      0,
      { from, to, count },
      null,
    );
    return { success: true, count };
  }
}