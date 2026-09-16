import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { PeriodicTaskLink } from '../../database/entities/periodic-task-link.entity';
import { PeriodicTask } from '../../database/entities/periodic-task.entity';
import { PERIOD_RANK } from '../../common/enums/period-type.enum';
import { PeriodicTasksService, RequestingUser } from './periodic-tasks.service';
import { PeriodicTaskAccessHelper } from './helpers/periodic-task-access.helper';
import { CreatePeriodicTaskLinkDto } from './dto/create-periodic-task-link.dto';
import { PeriodicTaskAuditService, PeriodicTaskAuditAction } from './periodic-task-audit.service';

/**
 * PeriodicTaskLinksService - Phase 2 (PLAN mục 6): liên kết phân cấp DAG
 * (multi-parent + skip-level) + rollup % - xem PLAN mục 2.2, 2.3.
 *
 * ⚠️ Mọi thao tác ĐỀU gọi `PeriodicTasksService.findOne()` trước (đúng
 * nguyên tắc "1 cổng gác" đã dùng ở `update()`/`remove()` Phase 1) - Task
 * (cả con LẪN cha) ngoài phạm vi scope của người gọi sẽ tự 404 trước khi
 * kịp chạm bước validate rank/cycle, tránh rò rỉ sự tồn tại của Task ngoài
 * phạm vi qua thông báo lỗi rank/cycle.
 */
@Injectable()
export class PeriodicTaskLinksService {
  constructor(
    @InjectRepository(PeriodicTaskLink)
    private readonly linkRepo: Repository<PeriodicTaskLink>,
    @InjectRepository(PeriodicTask)
    private readonly taskRepo: Repository<PeriodicTask>,
    private readonly tasksService: PeriodicTasksService,
    private readonly auditService: PeriodicTaskAuditService,
  ) { }

  /**
   * Chống chu trình (PLAN mục 2.2 bước 2): BFS đi NGƯỢC LÊN từ `parentId`
   * qua các cạnh đã có (tìm cha của `parentId`, rồi cha của cha...) - nếu
   * gặp lại `childId` giữa đường, nghĩa là `childId` đang là TỔ TIÊN của
   * `parentId` -> thêm cạnh (childId, parentId) sẽ tạo vòng lặp.
   * Độ sâu tối đa 4 tầng (do PERIOD_RANK chặn cứng ở bước 1) nên không lo
   * hiệu năng dù duyệt bằng vòng lặp thay vì CTE đệ quy.
   */
  private async wouldCreateCycle(childId: number, parentId: number): Promise<boolean> {
    let frontier = [parentId];
    const visited = new Set<number>([parentId]);

    while (frontier.length > 0) {
      const links = await this.linkRepo.find({ where: { childTaskId: In(frontier) } });
      const nextFrontier: number[] = [];

      for (const link of links) {
        if (link.parentTaskId === childId) {
          return true;
        }
        if (!visited.has(link.parentTaskId)) {
          visited.add(link.parentTaskId);
          nextFrontier.push(link.parentTaskId);
        }
      }

      frontier = nextFrontier;
    }

    return false;
  }

  /**
   * Gán `parentTaskId` (dto) làm cha của `childId` (:id path) - validate rank
   * (PLAN mục 2.2 bước 1), chống trùng cạnh (bước 3), chống chu trình (bước 2).
   * Phase 5: kiểm tra thêm `assertEditableWhenLocked()` trên Task CON (`:id`
   * path - phía đang bị PATCH) - Task cha bị khoá không chặn (không phải
   * Task đang được sửa trực tiếp qua route này).
   */
  async addLink(
    childId: number,
    dto: CreatePeriodicTaskLinkDto,
    user: RequestingUser,
    scope?: string | null,
  ): Promise<PeriodicTaskLink> {
    const parentId = dto.parentTaskId;

    if (childId === parentId) {
      throw new BadRequestException('Không thể gán 1 Công việc làm cha của chính nó');
    }

    // "1 cổng gác" - cả 2 đầu cạnh đều phải nằm trong phạm vi scope người gọi
    // được xem, nếu không sẽ tự 404 ở đây trước khi chạm bước rank/cycle.
    const child = await this.tasksService.findOne(childId, user.id, user.role, scope);
    const parent = await this.tasksService.findOne(parentId, user.id, user.role, scope);
    await this.tasksService.assertEditableWhenLocked(child, user);

    if (PERIOD_RANK[parent.periodType] <= PERIOD_RANK[child.periodType]) {
      throw new BadRequestException(
        `Công việc cha (kỳ "${parent.periodType}") phải có kỳ hạn LỚN HƠN Công việc con (kỳ "${child.periodType}") - không cho phép ngang hàng hoặc ngược chiều`,
      );
    }

    const existing = await this.linkRepo.findOne({
      where: { childTaskId: childId, parentTaskId: parentId },
    });
    if (existing) {
      throw new BadRequestException('Liên kết này đã tồn tại');
    }

    if (await this.wouldCreateCycle(childId, parentId)) {
      throw new BadRequestException(
        'Không thể tạo liên kết này vì sẽ tạo thành vòng lặp (cycle) trong quan hệ cha-con',
      );
    }

    const link = this.linkRepo.create({
      childTaskId: childId,
      parentTaskId: parentId,
      createdById: user.id,
    });
    const saved = await this.linkRepo.save(link);

    // Phase 7 (PLAN mục 2.6): audit log gắn vào Task CON (`childId`, phía
    // `:id` path đang được PATCH liên kết) - Task cha không đổi dữ liệu của
    // chính nó nên không cần log thêm 1 dòng phía cha.
    //
    // ⚠️ FIX BUG THẬT (đợt rà soát toàn bộ audit log - cùng lớp bug
    // `positionId`): trước đây log thẳng `parentTaskId` (số thô) - `parent`
    // đã được fetch đầy đủ ở trên (bắt buộc phải tồn tại để validate rank),
    // dùng lại tiêu đề của nó thay vì để lộ ID vô nghĩa.
    // Dùng key `name` (không phải `title`) cho object con - `AuditDiffViewer`
    // (generic object handling) chỉ nhận diện `.name`/`.code`, xem
    // `formatValue()`.
    this.auditService.logActionAsync(childId, user.id, PeriodicTaskAuditAction.PARENT_LINKED, null, {
      parentTask: { id: parent.id, name: parent.title },
    });

    return saved;
  }

  async removeLink(
    childId: number,
    parentId: number,
    user: RequestingUser,
    scope?: string | null,
  ): Promise<{ deleted: true }> {
    const child = await this.tasksService.findOne(childId, user.id, user.role, scope);
    await this.tasksService.assertEditableWhenLocked(child, user);

    const existing = await this.linkRepo.findOne({
      where: { childTaskId: childId, parentTaskId: parentId },
    });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy liên kết này');
    }

    await this.linkRepo.remove(existing);

    // ⚠️ FIX BUG THẬT (xem chú thích ở `addLink()`): resolve tiêu đề Task cha
    // thay vì log raw `parentTaskId`.
    const parentTask = await this.taskRepo.findOne({ where: { id: parentId }, select: ['id', 'title'] });
    this.auditService.logActionAsync(childId, user.id, PeriodicTaskAuditAction.PARENT_UNLINKED, {
      parentTask: { id: parentId, name: parentTask?.title ?? null },
    });

    return { deleted: true };
  }

  async getChildren(
    taskId: number,
    userId: number,
    userRole: string,
    scope?: string | null,
  ): Promise<PeriodicTask[]> {
    await this.tasksService.findOne(taskId, userId, userRole, scope);

    return this.taskRepo
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.status', 'status')
      .leftJoinAndSelect('task.primaryAssignee', 'primaryAssignee')
      .leftJoinAndSelect('task.department', 'department')
      .innerJoin('periodic_task_links', 'link', 'link.child_task_id = task.id')
      .where('link.parent_task_id = :taskId', { taskId })
      .andWhere('task.deletedAt IS NULL')
      .orderBy('task.periodStartDate', 'DESC')
      .getMany();
  }

  async getParents(
    taskId: number,
    userId: number,
    userRole: string,
    scope?: string | null,
  ): Promise<PeriodicTask[]> {
    await this.tasksService.findOne(taskId, userId, userRole, scope);

    return this.taskRepo
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.status', 'status')
      .leftJoinAndSelect('task.primaryAssignee', 'primaryAssignee')
      .leftJoinAndSelect('task.department', 'department')
      .innerJoin('periodic_task_links', 'link', 'link.parent_task_id = task.id')
      .where('link.child_task_id = :taskId', { taskId })
      .andWhere('task.deletedAt IS NULL')
      .orderBy('task.periodStartDate', 'DESC')
      .getMany();
  }

  /**
   * getLinksAmong - Phase 8 (PLAN mục Phase 8): trả về TOÀN BỘ cạnh cha-con
   * mà CẢ 2 đầu đều nằm trong `taskIds` - phục vụ UI "nối/xếp hàng" các Task
   * đã liên kết ở Table/Agenda/Kanban/Calendar (FE gọi 1 LẦN cho cả danh
   * sách Task đang hiển thị, KHÔNG gọi lặp theo từng Task - tránh N+1 y hệt
   * lý do `getChildren`/`getParents` chỉ tra 1 Task/lần không phù hợp cho
   * trường hợp này).
   *
   * RBAC: KHÔNG tin `taskIds` do FE gửi lên là đã đúng phạm vi (FE có thể bị
   * sửa/giả mạo) - tự lọc lại qua `applyViewFilter()` (đúng nguyên tắc "1
   * nguồn áp filter duy nhất") để lấy tập ID THẬT SỰ nằm trong phạm vi xem
   * của người gọi, rồi chỉ truy vấn cạnh trong tập đã lọc đó - Task ngoài
   * phạm vi (dù ID có được truyền lên) sẽ không bao giờ lộ ra trong kết quả,
   * kể cả gián tiếp qua việc "có cạnh nối tới ID X" (không leak sự tồn tại).
   */
  async getLinksAmong(
    taskIds: number[],
    userId: number,
    userRole: string,
    scope?: string | null,
  ): Promise<{ edges: Array<{ parentTaskId: number; childTaskId: number }> }> {
    if (taskIds.length === 0) return { edges: [] };

    const qb = this.taskRepo
      .createQueryBuilder('task')
      .select('task.id', 'id')
      .where('task.id IN (:...taskIds)', { taskIds })
      .andWhere('task.deletedAt IS NULL');
    PeriodicTaskAccessHelper.applyViewFilter(qb, userId, userRole, scope);
    const visibleRows: Array<{ id: number }> = await qb.getRawMany();
    const visibleIds = visibleRows.map((r) => r.id);
    if (visibleIds.length === 0) return { edges: [] };

    // Cả 2 điều kiện `In()` đều bắt buộc (AND mặc định của `.find()`) - cạnh
    // chỉ được trả về khi CẢ child LẪN parent đều thuộc `visibleIds`.
    const links = await this.linkRepo.find({
      where: { childTaskId: In(visibleIds), parentTaskId: In(visibleIds) },
    });

    return {
      edges: links.map((l) => ({ parentTaskId: l.parentTaskId, childTaskId: l.childTaskId })),
    };
  }

  /**
   * % hoàn thành LIVE (PLAN mục 2.3) - chỉ đếm con TRỰC TIẾP, không đệ quy
   * cộng dồn xuyên nhiều tầng. `percent = null` khi `totalChildren = 0` (FE
   * tự hiển thị "chưa có việc con" thay vì "0%" gây hiểu nhầm).
   */
  async getRollup(
    taskId: number,
    userId: number,
    userRole: string,
    scope?: string | null,
  ): Promise<{ totalChildren: number; doneChildren: number; percent: number | null }> {
    await this.tasksService.findOne(taskId, userId, userRole, scope);

    const rows: Array<{ total_children: string; done_children: string }> = await this.linkRepo.manager.query(
      `SELECT
         COUNT(*) AS total_children,
         SUM(CASE WHEN s.is_done_state = 1 THEN 1 ELSE 0 END) AS done_children
       FROM periodic_task_links l
       JOIN periodic_tasks t ON t.id = l.child_task_id AND t.deleted_at IS NULL
       JOIN periodic_task_statuses s ON s.id = t.status_id
       WHERE l.parent_task_id = ?
         AND s.is_excluded_from_rollup = 0`,
      [taskId],
    );

    const totalChildren = Number(rows[0]?.total_children ?? 0);
    const doneChildren = Number(rows[0]?.done_children ?? 0);
    const percent = totalChildren > 0 ? Math.round((doneChildren / totalChildren) * 10000) / 100 : null;

    return { totalChildren, doneChildren, percent };
  }
}