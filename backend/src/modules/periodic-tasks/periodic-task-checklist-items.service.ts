import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PeriodicTaskChecklistItem } from '../../database/entities/periodic-task-checklist-item.entity';
import { PeriodicTasksService, RequestingUser } from './periodic-tasks.service';
import { PeriodicTaskLinksService, LinkedChildChecklistEntry } from './periodic-task-links.service';
import { CreatePeriodicTaskChecklistItemDto } from './dto/create-periodic-task-checklist-item.dto';
import { UpdatePeriodicTaskChecklistItemDto } from './dto/update-periodic-task-checklist-item.dto';
import { ReorderPeriodicTaskChecklistItemsDto } from './dto/reorder-periodic-task-checklist-items.dto';
import { PeriodicTaskAuditService, PeriodicTaskAuditAction } from './periodic-task-audit.service';

/**
 * PeriodicTaskChecklistItemsService - Phase 6 (PLAN mục 6): checklist con
 * kiểu Trello cho Công việc định kỳ. Mirror
 * `PeriodicTaskSecondaryAssigneesService` (Phase 4) về nguyên tắc "1 cổng
 * gác" (`tasksService.findOne()` trước MỌI thao tác) + `assertEditableWhenLocked()`
 * cho các hàm SỬA dữ liệu (create/update/remove/reorder) - Task đang khoá
 * (`is_locked=true`) mà thiếu `periodic_tasks.edit_locked` -> 403, đúng PLAN
 * mục 2.9 ("ÁP DỤNG cho MỌI nơi sửa dữ liệu của/thuộc về 1 Task").
 *
 * KHÔNG có permission/scope riêng cho checklist (đã chốt PLAN mục 6 Phase 6)
 * - CHỈ CẦN `periodic_tasks.edit` (đã gate ở Controller/`PermissionGuard`
 * cho các route sửa) và `periodic_tasks.view` (route GET danh sách) - thừa
 * hưởng nguyên vẹn quyền của chính Task cha.
 *
 * Phase 9 (tích hợp Task con vào chung Checklist): `attachLinkedChildrenChecklist()`
 * dưới đây là 1 luồng HOÀN TOÀN TÁCH BIỆT khỏi `queryItems()`/CRUD ở trên -
 * KHÔNG đọc/ghi bảng `periodic_task_checklist_items` chút nào, chỉ tính LIVE
 * từ `PeriodicTaskLinksService.getChildrenChecklist()`. Xem JSDoc đầy đủ ở đó.
 */
@Injectable()
export class PeriodicTaskChecklistItemsService {
  constructor(
    @InjectRepository(PeriodicTaskChecklistItem)
    private readonly checklistRepo: Repository<PeriodicTaskChecklistItem>,
    private readonly tasksService: PeriodicTasksService,
    private readonly linksService: PeriodicTaskLinksService,
    private readonly auditService: PeriodicTaskAuditService,
  ) {}

  /** Danh sách item của 1 Task, sắp xếp theo `position` tăng dần. */
  private async queryItems(taskId: number): Promise<PeriodicTaskChecklistItem[]> {
    return this.checklistRepo.find({
      where: { taskId },
      order: { position: 'ASC', id: 'ASC' },
    });
  }

  /**
   * Danh sách checklist item của 1 Task, có kiểm tra quyền xem qua
   * `tasksService.findOne()` (mirror pattern `getChildren()`/`getParents()`
   * của Phase 2 - `periodic_tasks.view`, không cần `periodic_tasks.edit`).
   */
  async findAllForTask(
    taskId: number,
    userId: number,
    userRole: string,
    scope?: string | null,
  ): Promise<PeriodicTaskChecklistItem[]> {
    await this.tasksService.findOne(taskId, userId, userRole, scope);
    return this.queryItems(taskId);
  }

  /**
   * Tìm 1 item, đảm bảo thuộc đúng `taskId` (không rò rỉ checklist của Task
   * khác qua `itemId` - spec bắt buộc PLAN mục 6) - NotFoundException nếu
   * item không tồn tại hoặc thuộc Task khác.
   */
  private async findItemOrFail(taskId: number, itemId: number): Promise<PeriodicTaskChecklistItem> {
    const item = await this.checklistRepo.findOne({ where: { id: itemId, taskId } });
    if (!item) {
      throw new NotFoundException(`Không tìm thấy checklist item ID ${itemId} trong Công việc này`);
    }
    return item;
  }

  /** Thêm 1 checklist item mới vào CUỐI danh sách (PLAN mục 6, endpoint mục 5). */
  async create(
    taskId: number,
    dto: CreatePeriodicTaskChecklistItemDto,
    user: RequestingUser,
    scope?: string | null,
  ): Promise<PeriodicTaskChecklistItem[]> {
    const task = await this.tasksService.findOne(taskId, user.id, user.role, scope);
    await this.tasksService.assertEditableWhenLocked(task, user);

    const maxPosition = await this.checklistRepo
      .createQueryBuilder('item')
      .select('MAX(item.position)', 'max')
      .where('item.taskId = :taskId', { taskId })
      .getRawOne<{ max: number | null }>();

    const nextPosition = (maxPosition?.max ?? -1) + 1;

    const created = this.checklistRepo.create({
      taskId,
      content: dto.content,
      position: nextPosition,
      createdById: user.id,
    });
    await this.checklistRepo.save(created);

    this.auditService.logActionAsync(taskId, user.id, PeriodicTaskAuditAction.CHECKLIST_ITEM_ADDED, null, {
      content: created.content,
    });

    return this.queryItems(taskId);
  }

  /** Sửa nội dung và/hoặc `isDone` của 1 checklist item. */
  async update(
    taskId: number,
    itemId: number,
    dto: UpdatePeriodicTaskChecklistItemDto,
    user: RequestingUser,
    scope?: string | null,
  ): Promise<PeriodicTaskChecklistItem[]> {
    const task = await this.tasksService.findOne(taskId, user.id, user.role, scope);
    await this.tasksService.assertEditableWhenLocked(task, user);

    const item = await this.findItemOrFail(taskId, itemId);
    const before = { ...item };
    Object.assign(item, dto);
    await this.checklistRepo.save(item);

    this.auditService.logActionAsync(
      taskId,
      user.id,
      PeriodicTaskAuditAction.CHECKLIST_ITEM_UPDATED,
      { itemId, content: before.content, isDone: before.isDone },
      { itemId, content: item.content, isDone: item.isDone },
    );

    return this.queryItems(taskId);
  }

  /** Xoá 1 checklist item (hard delete, mirror `removeSecondaryAssignee()`). */
  async remove(
    taskId: number,
    itemId: number,
    user: RequestingUser,
    scope?: string | null,
  ): Promise<PeriodicTaskChecklistItem[]> {
    const task = await this.tasksService.findOne(taskId, user.id, user.role, scope);
    await this.tasksService.assertEditableWhenLocked(task, user);

    const item = await this.findItemOrFail(taskId, itemId);
    await this.checklistRepo.remove(item);

    this.auditService.logActionAsync(taskId, user.id, PeriodicTaskAuditAction.CHECKLIST_ITEM_REMOVED, {
      itemId,
      content: item.content,
    });

    return this.queryItems(taskId);
  }

  /**
   * Sắp xếp lại toàn bộ checklist item của Task theo thứ tự `itemIds`
   * (PLAN mục 6, spec bắt buộc "reorder (position)"). `itemIds` PHẢI khớp
   * 1-1 (không thiếu/thừa) với tập item hiện có - nếu không khớp ->
   * BadRequestException, tránh reorder "chui" item của Task khác hoặc làm
   * mất item khỏi danh sách một cách âm thầm.
   */
  async reorder(
    taskId: number,
    dto: ReorderPeriodicTaskChecklistItemsDto,
    user: RequestingUser,
    scope?: string | null,
  ): Promise<PeriodicTaskChecklistItem[]> {
    const task = await this.tasksService.findOne(taskId, user.id, user.role, scope);
    await this.tasksService.assertEditableWhenLocked(task, user);

    const currentItems = await this.queryItems(taskId);
    const currentIds = new Set(currentItems.map((i) => i.id));
    const requestedIds = new Set(dto.itemIds);

    if (
      currentIds.size !== requestedIds.size ||
      ![...currentIds].every((id) => requestedIds.has(id))
    ) {
      throw new BadRequestException(
        'itemIds phải là hoán vị đầy đủ của toàn bộ checklist item hiện có trong Công việc này',
      );
    }

    await Promise.all(
      dto.itemIds.map((id, index) =>
        this.checklistRepo.update({ id, taskId }, { position: index }),
      ),
    );

    this.auditService.logActionAsync(
      taskId,
      user.id,
      PeriodicTaskAuditAction.CHECKLIST_ITEMS_REORDERED,
      null,
      { itemIds: dto.itemIds },
    );

    return this.queryItems(taskId);
  }

  /**
   * Đính field `checklistItems` vào response 1 Task (dùng ở
   * `PeriodicTasksController.findOne()`) - KHÔNG cần ẩn theo quyền, mirror
   * `attachSecondaryAssignees()` (Phase 4): ai xem được Task thì xem được
   * luôn checklist con.
   */
  async attachChecklistItems<T extends object>(
    task: T,
  ): Promise<T & { checklistItems: PeriodicTaskChecklistItem[] }> {
    const taskId = (task as unknown as { id: number }).id;
    const checklistItems = await this.queryItems(taskId);
    return { ...task, checklistItems };
  }

  /**
   * attachLinkedChildrenChecklist - Phase 9: đính field `linkedChildrenChecklist`
   * vào response 1 Task (dùng ở `PeriodicTasksController.findOne()`, sau
   * `attachChecklistItems()`) - mirror CÁCH GẮN (`{...task, field}`) nhưng
   * NGUỒN DỮ LIỆU hoàn toàn khác: gọi `PeriodicTaskLinksService.
   * getChildrenChecklist()` (tính LIVE từ `periodic_task_links` + trạng thái
   * THẬT của từng Task con), KHÔNG chạm bảng `periodic_task_checklist_items`.
   *
   * CỐ Ý nhận thêm `userId`/`userRole`/`scope` (khác `attachChecklistItems()`
   * ở trên không cần) - vì `getChildrenChecklist()` lọc lại Task con theo
   * phạm vi scope người gọi (xem JSDoc ở đó), không "ai xem được Task cha thì
   * xem được hết" như checklist item thường.
   */
  async attachLinkedChildrenChecklist<T extends object>(
    task: T,
    userId: number,
    userRole: string,
    scope?: string | null,
  ): Promise<T & { linkedChildrenChecklist: LinkedChildChecklistEntry[] }> {
    const taskId = (task as unknown as { id: number }).id;
    const linkedChildrenChecklist = await this.linksService.getChildrenChecklist(
      taskId,
      userId,
      userRole,
      scope,
    );
    return { ...task, linkedChildrenChecklist };
  }

  /**
   * attachChecklistProgressToList - đính `checklistProgress: { done, total }`
   * vào từng Task của danh sách (dùng ở `PeriodicTasksController.findAll()`)
   * để FE hiện nhãn "X/Z" trên nút Checklist ở MỌI view (Bảng/Ngày/Kanban)
   * mà không cần gọi `GET /:id` từng Task.
   *
   * CÙNG cách đếm với modal Checklist: `total` = số checklist item thật +
   * số Task con trực tiếp (Phase 9); `done` = item `is_done` + Task con có
   * `status.is_done_state`. Chỉ 2 query gom nhóm cho cả trang (không N+1).
   * Task chưa có gì -> `{ done: 0, total: 0 }` (FE ẩn nhãn, không tô màu).
   */
  async attachChecklistProgressToList<T extends { id: number }>(
    tasks: T[],
    userId: number,
    userRole: string,
    scope?: string | null,
  ): Promise<Array<T & { checklistProgress: { done: number; total: number } }>> {
    if (tasks.length === 0) return [];
    const taskIds = tasks.map((t) => t.id);

    const itemRows = await this.checklistRepo
      .createQueryBuilder('item')
      .select('item.task_id', 'taskId')
      .addSelect('COUNT(item.id)', 'total')
      .addSelect('SUM(CASE WHEN item.is_done = 1 THEN 1 ELSE 0 END)', 'done')
      .where('item.task_id IN (:...taskIds)', { taskIds })
      .groupBy('item.task_id')
      .getRawMany<{ taskId: number | string; total: number | string; done: number | string | null }>();

    const itemProgress = new Map<number, { done: number; total: number }>();
    for (const row of itemRows) {
      itemProgress.set(Number(row.taskId), { done: Number(row.done ?? 0), total: Number(row.total) });
    }

    const childProgress = await this.linksService.getChildrenChecklistProgressBatch(
      taskIds,
      userId,
      userRole,
      scope,
    );

    return tasks.map((task) => {
      const items = itemProgress.get(task.id);
      const children = childProgress.get(task.id);
      return {
        ...task,
        checklistProgress: {
          done: (items?.done ?? 0) + (children?.done ?? 0),
          total: (items?.total ?? 0) + (children?.total ?? 0),
        },
      };
    });
  }
}
