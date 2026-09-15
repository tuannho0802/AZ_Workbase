import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { waitUntil } from '@vercel/functions';
import { PeriodicTaskAuditLog } from '../../database/entities/periodic-task-audit-log.entity';
import { GetPeriodicTaskAuditLogsDto } from './dto/get-periodic-task-audit-logs.dto';

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
}
