import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PeriodicTaskChecklistItem } from '../../database/entities/periodic-task-checklist-item.entity';
import { PeriodicTask } from '../../database/entities/periodic-task.entity';
import { PeriodicTasksService, RequestingUser } from './periodic-tasks.service';
import { PeriodicTaskLinksService, LinkedChildChecklistEntry } from './periodic-task-links.service';
import { CreatePeriodicTaskChecklistItemDto } from './dto/create-periodic-task-checklist-item.dto';
import { UpdatePeriodicTaskChecklistItemDto } from './dto/update-periodic-task-checklist-item.dto';
import { ReorderPeriodicTaskChecklistItemsDto } from './dto/reorder-periodic-task-checklist-items.dto';
import { PeriodicTaskAuditService, PeriodicTaskAuditAction } from './periodic-task-audit.service';
import { isCompletedTask, resolveTickTargetStatus } from './helpers/task-status.helper';
import { CHECKLIST_PAGE_SIZE, PeriodicTaskChecklistItemsQueryDto } from './dto/periodic-task-checklist-page.dto';

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

  /**
   * Notification Phase 2 (PLAN mục 4.4): `task.checklist_changed` - GỘP
   * (coalesce=true trong catalog) nên nhiều lượt thêm/sửa/xoá liên tiếp
   * trong lúc người nhận CHƯA ĐỌC chỉ tăng `occurrences` trên 1 dòng, không
   * spam nhiều dòng. Gọi cho `create()`/`update()`/`remove()` - CỐ Ý KHÔNG
   * gọi cho `reorder()` (PLAN: "checklist_items_reordered im lặng").
   */
  private emitChecklistChanged(taskId: number, task: PeriodicTask, actorId: number): void {
    void this.tasksService.notifyTaskSafely('checklist_changed', async () => {
      const secondaryAssigneeIds = await this.tasksService.getSecondaryAssigneeIds(taskId);
      this.tasksService.emitTaskNotification({
        type: 'task.checklist_changed',
        actorId,
        entity: { type: 'periodic_task', id: taskId },
        entityName: task.title,
        recipients: {
          task: { primaryAssigneeId: task.primaryAssigneeId, secondaryAssigneeIds },
        },
      });
    });
  }

  /** Danh sách item của 1 Task, sắp xếp theo `position` tăng dần. */
  private async queryItems(taskId: number): Promise<PeriodicTaskChecklistItem[]> {
    return this.checklistRepo.find({
      where: { taskId },
      order: { position: 'ASC', id: 'ASC' },
    });
  }

  /** Tổng số item + số item đã xong của Task - ĐÚNG 1 query gom nhóm (không kéo dữ liệu về đếm). */
  private async getSummary(taskId: number): Promise<{ total: number; done: number }> {
    const row = await this.checklistRepo
      .createQueryBuilder('item')
      .select('COUNT(item.id)', 'total')
      .addSelect('SUM(CASE WHEN item.is_done = 1 THEN 1 ELSE 0 END)', 'done')
      .where('item.task_id = :taskId', { taskId })
      .getRawOne<{ total: number | string | null; done: number | string | null }>();
    return { total: Number(row?.total ?? 0), done: Number(row?.done ?? 0) };
  }

  /**
   * [PERF] Số liệu cho FE ghi thẳng vào cache thay vì refetch `GET /periodic-tasks` (limit 100):
   * `summary` = CHỈ item (modal dùng nhảy trang), `checklistProgress` = item + Task con (nhãn "X/Z" của list).
   * 2 truy vấn song song, cùng công thức với `attachChecklistProgressToList()`.
   */
  private async computeProgress(
    taskId: number,
    user: RequestingUser,
    scope?: string | null,
  ): Promise<{ summary: { total: number; done: number }; checklistProgress: { done: number; total: number } }> {
    const [summary, children] = await Promise.all([
      this.getSummary(taskId),
      this.linksService.getChildrenChecklistProgressBatch([taskId], user.id, user.role, scope),
    ]);
    const child = children.get(taskId);
    return {
      summary,
      checklistProgress: { done: summary.done + (child?.done ?? 0), total: summary.total + (child?.total ?? 0) },
    };
  }

  /**
   * Checklist item của 1 Task, PHÂN TRANG SERVER-SIDE (tối đa `CHECKLIST_PAGE_SIZE`
   * dòng/trang). Chỉ 2 truy vấn nhẹ chạy song song, KHÔNG kéo cả checklist về:
   *  1. `getChecklistSummaryForView()` - cổng gác xem + COUNT/SUM toàn Task (để FE tính % và số trang),
   *  2. trang dữ liệu `ORDER BY position, id LIMIT/OFFSET` (dùng index
   *     `idx_periodic_task_checklist_items_task_position`). `total`/`done` là của TOÀN BỘ Task, không chỉ trang này.
   */
  async findPage(
    taskId: number,
    dto: PeriodicTaskChecklistItemsQueryDto,
    userId: number,
    userRole: string,
    scope?: string | null,
  ) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? CHECKLIST_PAGE_SIZE;
    const hideDone = dto.hideDone === true;

    // Sort theo ngày tạo (mới nhất/cũ nhất) - `id` làm tie-breaker ổn định. Bỏ trống =
    // thứ tự tay (`position`) như trước đây nên client cũ không đổi hành vi.
    const order =
      dto.sort === 'newest'
        ? { createdAt: 'DESC' as const, id: 'DESC' as const }
        : dto.sort === 'oldest'
          ? { createdAt: 'ASC' as const, id: 'ASC' as const }
          : { position: 'ASC' as const, id: 'ASC' as const };

    // [PERF] Cổng gác xem + COUNT/SUM gộp 1 truy vấn (trước: assertCanView rồi mới tới getSummary). Trang dữ liệu chạy
    // song song; nếu cổng gác 404 thì kết quả trang bị bỏ, không lộ dữ liệu.
    const [summary, data] = await Promise.all([
      this.tasksService.getChecklistSummaryForView(taskId, userId, userRole, scope),
      this.checklistRepo.find({
        where: hideDone ? { taskId, isDone: false } : { taskId },
        order,
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    // `total`/`done` luôn là của TOÀN BỘ Task (FE tính % tiến độ); `filteredTotal` là số dòng
    // sau khi áp bộ lọc ẩn/hiện hoàn thành - dùng cho phân trang.
    const filteredTotal = hideDone ? summary.total - summary.done : summary.total;

    return {
      data,
      total: summary.total,
      done: summary.done,
      filteredTotal,
      page,
      limit,
      totalPages: Math.ceil(filteredTotal / limit),
    };
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
  ): Promise<{
    item: PeriodicTaskChecklistItem;
    total: number;
    done: number;
    /** Tiến độ nhãn "X/Z" của list (item + Task con) - FE ghi thẳng vào cache list thay vì refetch (9B-1). */
    checklistProgress: { done: number; total: number };
  }> {
    const task = await this.tasksService.findForChecklist(taskId, user.id, user.role, scope);
    await this.tasksService.assertEditableWhenLocked(task, user);

    // Guard "thêm checklist vào Task ĐÃ HOÀN THÀNH": FE hỏi lại, chọn "Chưa hoàn thành, cần làm tiếp" -> reopen=true.
    // Đổi status/kỳ TRƯỚC khi ghi item (đổi lỗi -> item chưa được tạo, không lệch trạng thái).
    if (dto.reopen === true && isCompletedTask(task.status)) {
      await this.tasksService.changeStatusByCode(task, 'in_progress', user, scope, { extendPeriodEndToToday: true });
    }

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

    this.emitChecklistChanged(taskId, task, user.id);

    // Trả item vừa tạo + tổng mới (FE nhảy tới trang cuối để thấy item vừa thêm) -
    // KHÔNG trả lại cả danh sách.
    // [PERF] đếm item + Task con song song (xem `computeProgress`); `total/done` CHỈ đếm item, nhãn list = item + Task con.
    const { summary, checklistProgress } = await this.computeProgress(taskId, user, scope);
    return { item: created, total: summary.total, done: summary.done, checklistProgress };
  }

  /** Sửa nội dung và/hoặc `isDone` của 1 checklist item. */
  async update(
    taskId: number,
    itemId: number,
    dto: UpdatePeriodicTaskChecklistItemDto,
    user: RequestingUser,
    scope?: string | null,
  ): Promise<PeriodicTaskChecklistItem & { checklistProgress?: { done: number; total: number }; statusChanged?: boolean }> {
    const task = await this.tasksService.findForChecklist(taskId, user.id, user.role, scope);
    await this.tasksService.assertEditableWhenLocked(task, user);

    const item = await this.findItemOrFail(taskId, itemId);
    const before = { ...item };
    const { nextStatusCode, ...itemChanges } = dto;

    // Guard ÉP TRONG BE: tick (chưa xong -> xong) trên Task To-do luôn kéo Task sang in_progress (hoặc status FE xin
    // nếu tiến lên). Đổi status TRƯỚC khi lưu tick: lỗi thì tick chưa lưu -> không bao giờ có tick trong Task To-do.
    let statusChanged = false;
    if (itemChanges.isDone === true && !item.isDone) {
      const target = resolveTickTargetStatus(task.status?.code, nextStatusCode);
      if (target) {
        await this.tasksService.changeStatusByCode(task, target, user, scope);
        statusChanged = true;
      }
    }
    const isDoneToggled = itemChanges.isDone !== undefined && itemChanges.isDone !== item.isDone;

    Object.assign(item, itemChanges);
    // [PERF] `repo.save()` trên entity đã nạp vẫn chạy thêm 1 SELECT theo id trước khi UPDATE. Item đã được nạp ở
    // `findItemOrFail` nên chỉ UPDATE đúng các cột thật sự đổi (bỏ qua giá trị undefined).
    // [AGENT] OLD CODE (giữ lại để rollback): await this.checklistRepo.save(item);
    const changes: Partial<Pick<PeriodicTaskChecklistItem, 'content' | 'isDone'>> = {};
    if (itemChanges.content !== undefined) changes.content = itemChanges.content;
    if (itemChanges.isDone !== undefined) changes.isDone = itemChanges.isDone;
    if (Object.keys(changes).length > 0) {
      await this.checklistRepo.update({ id: item.id, taskId }, changes);
      item.updatedAt = new Date();
    }

    this.auditService.logActionAsync(
      taskId,
      user.id,
      PeriodicTaskAuditAction.CHECKLIST_ITEM_UPDATED,
      { itemId, content: before.content, isDone: before.isDone },
      { itemId, content: item.content, isDone: item.isDone },
    );

    this.emitChecklistChanged(taskId, task, user.id);

    // [PERF] Trả kèm tiến độ để FE ghi vào cache list thay vì refetch cả `GET /periodic-tasks`.
    // - `statusChanged`: Guard đã đổi status Task -> dòng list đổi nhiều hơn nhãn, FE refetch đầy đủ.
    // - Chỉ đổi nội dung (isDone không đổi) -> nhãn không đổi, không cần truy vấn thêm.
    if (statusChanged) return { ...item, statusChanged: true };
    if (!isDoneToggled) return item;
    const { checklistProgress } = await this.computeProgress(taskId, user, scope);
    return { ...item, checklistProgress };
  }

  /** Xoá 1 checklist item (hard delete, mirror `removeSecondaryAssignee()`). */
  async remove(
    taskId: number,
    itemId: number,
    user: RequestingUser,
    scope?: string | null,
  ): Promise<{ deleted: true; checklistProgress: { done: number; total: number } }> {
    const task = await this.tasksService.findForChecklist(taskId, user.id, user.role, scope);
    await this.tasksService.assertEditableWhenLocked(task, user);

    const item = await this.findItemOrFail(taskId, itemId);
    await this.checklistRepo.remove(item);

    this.auditService.logActionAsync(taskId, user.id, PeriodicTaskAuditAction.CHECKLIST_ITEM_REMOVED, {
      itemId,
      content: item.content,
    });

    this.emitChecklistChanged(taskId, task, user.id);

    // [PERF] như `update()`: trả tiến độ mới để FE ghi cache, không refetch list.
    const { checklistProgress } = await this.computeProgress(taskId, user, scope);
    return { deleted: true, checklistProgress };
  }

  /**
   * Đổi chỗ 1 item với item LIỀN KỀ (lên/xuống) theo thứ tự toàn Task - hoạt động
   * XUYÊN TRANG (FE chỉ có 10 item/trang nên không thể gửi hoán vị đầy đủ như
   * `reorder()`). Không có item liền kề (đã ở đầu/cuối) -> `{ moved: false }`.
   * Nếu 2 item trùng `position` (hiếm - 2 lượt thêm đồng thời) thì đánh lại số
   * thứ tự cho cả Task để phép đổi chỗ có hiệu lực thật.
   */
  async move(
    taskId: number,
    itemId: number,
    direction: 'up' | 'down',
    user: RequestingUser,
    scope?: string | null,
  ): Promise<{ moved: boolean }> {
    const task = await this.tasksService.findForChecklist(taskId, user.id, user.role, scope);
    await this.tasksService.assertEditableWhenLocked(task, user);

    const item = await this.findItemOrFail(taskId, itemId);
    const up = direction === 'up';

    const neighbor = await this.checklistRepo
      .createQueryBuilder('item')
      .where('item.taskId = :taskId', { taskId })
      .andWhere(
        up
          ? '(item.position < :pos OR (item.position = :pos AND item.id < :id))'
          : '(item.position > :pos OR (item.position = :pos AND item.id > :id))',
        { pos: item.position, id: item.id },
      )
      .orderBy('item.position', up ? 'DESC' : 'ASC')
      .addOrderBy('item.id', up ? 'DESC' : 'ASC')
      .limit(1)
      .getOne();

    if (!neighbor) return { moved: false };

    if (neighbor.position !== item.position) {
      await Promise.all([
        this.checklistRepo.update({ id: item.id, taskId }, { position: neighbor.position }),
        this.checklistRepo.update({ id: neighbor.id, taskId }, { position: item.position }),
      ]);
    } else {
      const all = await this.queryItems(taskId);
      const ids = all.map((i) => i.id);
      const a = ids.indexOf(item.id);
      const b = ids.indexOf(neighbor.id);
      [ids[a], ids[b]] = [ids[b], ids[a]];
      await Promise.all(ids.map((id, index) => this.checklistRepo.update({ id, taskId }, { position: index })));
    }

    // Im lặng như `reorder()` (PLAN: "checklist_items_reordered im lặng") - chỉ ghi lịch sử.
    this.auditService.logActionAsync(taskId, user.id, PeriodicTaskAuditAction.CHECKLIST_ITEMS_REORDERED, null, {
      itemId,
      direction,
    });

    return { moved: true };
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
    const task = await this.tasksService.findForChecklist(taskId, user.id, user.role, scope);
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