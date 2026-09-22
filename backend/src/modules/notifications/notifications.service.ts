import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { waitUntil } from '@vercel/functions';
import { Notification } from '../../database/entities/notification.entity';
import { NotificationPreference } from '../../database/entities/notification-preference.entity';
import { User } from '../../database/entities/user.entity';
import {
  EVENT_CATALOG,
  NotificationEntityType,
  NotificationEventType,
  renderNotification,
  sanitizeParams,
} from './catalog/event-catalog';
import {
  RecipientContext,
  resolveRecipients,
} from './catalog/recipient-resolvers';
import { ListNotificationsDto } from './dto/list-notifications.dto';

/**
 * Dữ liệu 1 lần phát sự kiện TỰ ĐỘNG. Call site đã có sẵn entity nên truyền
 * thẳng ngữ cảnh (PLAN 6.2) - `emit()` KHÔNG tự query lại quan hệ.
 */
export interface EmitInput {
  type: NotificationEventType;
  /** Người thực hiện (bị loại khỏi danh sách nhận); null = hệ thống */
  actorId: number | null;
  /** Tên hiển thị của actor. Thiếu → tự tra 1 query cùng lượt kiểm tra user */
  actorName?: string;
  /** `id = null` cho thông báo gộp nhiều bản ghi (batch, đích là danh sách) */
  entity: { type: NotificationEntityType; id: number | null };
  subEntity?: { type: string; id: number };
  /** Tên khách hàng / tiêu đề task - KHÔNG chứa SĐT/email/số tiền */
  entityName: string;
  /** Số lượng bản ghi (batch), mặc định 1 */
  count?: number;
  recipients: RecipientContext;
  /** Bị lọc qua allowlist trước khi lưu (xem `sanitizeParams`) */
  params?: Record<string, unknown>;
  /** Khoá chống trùng cho sự kiện KHÔNG gộp (vd `updatedAt` ms); mặc định = now */
  dedupeSuffix?: string | number;
}

export interface NotificationResponse {
  id: number;
  eventType: string;
  category: string;
  relation: string;
  actorId: number | null;
  entityType: string | null;
  entityId: number | null;
  subEntityType: string | null;
  subEntityId: number | null;
  broadcastId: number | null;
  title: string;
  body: string | null;
  params: Record<string, unknown> | null;
  occurrences: number;
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
  sortAt: Date;
}

const NOTIFICATION_INSERT_COLUMNS = [
  'recipient_id',
  'actor_id',
  'event_type',
  'category',
  'relation',
  'entity_type',
  'entity_id',
  'sub_entity_type',
  'sub_entity_id',
  'title',
  'body',
  'params',
  'coalesce_key',
  'dedupe_key',
  'created_at',
  'sort_at',
] as const;

/**
 * NƠI DUY NHẤT đánh dấu "đã đọc": set `read_at` (nguồn sự thật) + `is_read`
 * (cột phái sinh, giữ đồng bộ) + `coalesce_key = NULL` (để sự kiện kế tiếp tạo
 * dòng mới thay vì gộp vào dòng đã đọc). Mọi chỗ ghi trạng thái đọc (kể cả cron
 * dọn dẹp / broadcast sau này) PHẢI dùng hàm này.
 */
export function buildReadPatch(now: Date = new Date()) {
  return { readAt: now, isRead: true, coalesceKey: null };
}

/** Cursor = base64url("<sortAtMs>.<id>") - opaque với client */
export function encodeCursor(sortAt: Date, id: number): string {
  return Buffer.from(`${sortAt.getTime()}.${id}`).toString('base64url');
}

export function decodeCursor(cursor: string): { sortAt: Date; id: number } {
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  const match = /^(\d{1,16})\.(\d{1,10})$/.exec(decoded);
  if (!match) throw new BadRequestException('Cursor không hợp lệ');
  const ms = Number(match[1]);
  const id = Number(match[2]);
  const sortAt = new Date(ms);
  if (Number.isNaN(sortAt.getTime()))
    throw new BadRequestException('Cursor không hợp lệ');
  return { sortAt, id };
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(NotificationPreference)
    private readonly preferenceRepository: Repository<NotificationPreference>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Feature flag (PLAN mục 10): mặc định TẮT cho tới khi migration
   * `CreateNotifications` đã chạy và chủ dự án bật `NOTIFICATIONS_ENABLED=true`.
   * Tắt → `emit()` no-op, list/poll trả rỗng (không chạm bảng chưa tồn tại).
   */
  isEnabled(): boolean {
    return process.env.NOTIFICATIONS_ENABLED === 'true';
  }

  // ───────────────────────────── GHI (tự động) ─────────────────────────────

  /**
   * Phát sự kiện, KHÔNG chặn request (fire-and-forget qua `waitUntil` như
   * `AuditService.logActionAsync`). KHÔNG BAO GIỜ throw (nguyên tắc 1) - chỉ
   * gọi SAU KHI đã ghi DB nghiệp vụ thành công (nguyên tắc 2).
   */
  emit(input: EmitInput): void {
    const task = this.emitNow(input);
    try {
      waitUntil(task);
    } catch {
      // Ngoài môi trường Vercel: promise vẫn chạy, không cần waitUntil.
    }
  }

  /** Bản `await` được của `emit()` - dùng cho test; cũng KHÔNG bao giờ throw. */
  async emitNow(input: EmitInput): Promise<void> {
    try {
      if (!this.isEnabled()) return;

      const def = EVENT_CATALOG[input.type];
      if (!def || !def.emittable) {
        this.logger.warn(
          `Bỏ qua emit: event "${input.type}" không hợp lệ hoặc không emit được`,
        );
        return;
      }

      // (2) Ai nhận theo quan hệ  (3a) loại chính người thực hiện
      const candidates = resolveRecipients(input.type, input.recipients).filter(
        (r) => r.userId !== input.actorId,
      );
      if (candidates.length === 0) return;

      // (3b) Chỉ user đang hoạt động; tra luôn tên actor nếu thiếu (1 query)
      const lookupIds = candidates.map((c) => c.userId);
      const needActorName = !input.actorName && input.actorId !== null;
      if (needActorName) lookupIds.push(input.actorId as number);
      const users = await this.userRepository.find({
        where: { id: In(lookupIds) },
        select: { id: true, name: true, isActive: true },
      });
      const userById = new Map(users.map((u) => [u.id, u]));
      let recipients = candidates.filter(
        (c) => !!userById.get(c.userId)?.isActive,
      );
      if (recipients.length === 0) return;

      // (4) Preference - event `mandatory` bỏ qua hoàn toàn (không cần query)
      if (!def.mandatory) {
        const prefs = await this.preferenceRepository.find({
          where: {
            userId: In(recipients.map((r) => r.userId)),
            eventType: input.type,
          },
        });
        const prefByUser = new Map(prefs.map((p) => [p.userId, p.enabled]));
        recipients = recipients.filter(
          (r) => prefByUser.get(r.userId) ?? def.defaultEnabled,
        );
        if (recipients.length === 0) return;
      }

      // (5) Render + (6) ghi 1 lần cho cả danh sách
      const actorName =
        input.actorName ??
        (input.actorId !== null
          ? userById.get(input.actorId)?.name
          : undefined) ??
        'Hệ thống';
      // ⚠️ `entityName` đã có sẵn trong PARAM_ALLOWLIST nhưng trước đây KHÔNG
      // BAO GIỜ được gộp vào `params` thực tế (chỉ dùng để render `title`
      // rồi mất) - FE cần giá trị này để highlight tên khách hàng/task trong
      // dòng thông báo (không suy ngược từ `title` vì actorName có thể trùng
      // 1 phần chuỗi). Bỏ qua chuỗi rỗng (batch `entityName: ''`).
      const params = sanitizeParams({
        ...input.params,
        ...(input.entityName ? { entityName: input.entityName } : {}),
      });
      const paramsJson = params ? JSON.stringify(params) : null;
      const now = new Date();
      const coalesceKey = def.coalesce
        ? `${input.type}:${input.entity.type}:${input.entity.id ?? 'batch'}`
        : null;
      const dedupeKey = def.coalesce
        ? null
        : `${input.type}:${input.entity.id ?? 'batch'}:${input.dedupeSuffix ?? now.getTime()}`;

      const values: unknown[] = [];
      for (const r of recipients) {
        const text = renderNotification(def, r.relation, {
          actorName,
          entityName: input.entityName,
          count: input.count ?? 1,
          params: params ?? {},
        });
        values.push(
          r.userId,
          input.actorId,
          input.type,
          def.category,
          r.relation,
          input.entity.type,
          input.entity.id,
          input.subEntity?.type ?? null,
          input.subEntity?.id ?? null,
          text.title,
          text.body ?? null,
          paramsJson,
          coalesceKey,
          dedupeKey,
          now,
          now,
        );
      }

      await this.notificationRepository.query(
        this.buildInsertSql(recipients.length, def.coalesce),
        values,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Ghi thông báo thất bại (type=${input.type}, entity=${input.entity.type}:${input.entity.id}): ${err?.message}`,
        err?.stack,
      );
    }
  }

  /**
   * - Gộp (coalesce): trùng `(recipient_id, coalesce_key)` = đang có dòng CHƯA
   *   ĐỌC → tăng `occurrences`, đẩy lên đầu, cập nhật nội dung mới nhất.
   *   (Dòng đã đọc có `coalesce_key = NULL` nên KHÔNG bị gộp - tạo dòng mới.)
   * - Không gộp: trùng `(recipient_id, dedupe_key)` = gọi lặp cùng sự kiện →
   *   no-op (`id = id`). Cố ý KHÔNG dùng `INSERT IGNORE` để lỗi khác (FK...)
   *   không bị nuốt thành warning.
   */
  private buildInsertSql(rowCount: number, coalesce: boolean): string {
    const placeholder = `(${NOTIFICATION_INSERT_COLUMNS.map(() => '?').join(', ')})`;
    const rows = Array.from({ length: rowCount }, () => placeholder).join(', ');
    const onDuplicate = coalesce
      ? `occurrences = occurrences + 1,
         sort_at = VALUES(sort_at),
         actor_id = VALUES(actor_id),
         relation = VALUES(relation),
         title = VALUES(title),
         body = VALUES(body),
         params = VALUES(params)`
      : 'id = id';
    return `INSERT INTO notifications (${NOTIFICATION_INSERT_COLUMNS.join(', ')})
            VALUES ${rows}
            ON DUPLICATE KEY UPDATE ${onDuplicate}`;
  }

  // ───────────────────────── ĐỌC (hộp thư cá nhân) ─────────────────────────

  async list(userId: number, dto: ListNotificationsDto) {
    if (!this.isEnabled())
      return { data: [] as NotificationResponse[], nextCursor: null };

    const limit = dto.limit ?? 20;
    const qb = this.notificationRepository
      .createQueryBuilder('n')
      // Chỉ nạp `body` của broadcast (KHÔNG nạp audience_params - chứa danh sách
      // người nhận khác, không được lộ cho người nhận).
      .leftJoin('n.broadcast', 'b')
      .addSelect(['b.id', 'b.body'])
      .where('n.recipientId = :userId', { userId })
      .andWhere(dto.dismissed ? 'n.dismissedAt IS NOT NULL' : 'n.dismissedAt IS NULL');

    if (dto.unreadOnly) qb.andWhere('n.readAt IS NULL');
    if (dto.category)
      qb.andWhere('n.category = :category', { category: dto.category });

    if (dto.cursor) {
      const { sortAt, id } = decodeCursor(dto.cursor);
      qb.andWhere(
        '(n.sortAt < :cursorSortAt OR (n.sortAt = :cursorSortAt AND n.id < :cursorId))',
        {
          cursorSortAt: sortAt,
          cursorId: id,
        },
      );
    }

    const rows = await qb
      .orderBy('n.sortAt', 'DESC')
      .addOrderBy('n.id', 'DESC')
      .limit(limit + 1)
      .getMany();

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];

    return {
      data: page.map((n) => this.toResponse(n)),
      nextCursor: hasMore && last ? encodeCursor(last.sortAt, last.id) : null,
    };
  }

  /** Endpoint gọi nhiều nhất: 2 query có index. */
  async poll(userId: number): Promise<{ unread: number; version: number }> {
    if (!this.isEnabled()) return { unread: 0, version: 0 };

    const unread = await this.notificationRepository.count({
      where: { recipientId: userId, readAt: IsNull(), dismissedAt: IsNull() },
    });
    const raw = await this.notificationRepository
      .createQueryBuilder('n')
      .select('MAX(n.sortAt)', 'version')
      .where('n.recipientId = :userId', { userId })
      .andWhere('n.dismissedAt IS NULL')
      .getRawOne<{ version: Date | string | null }>();

    const version = raw?.version ? new Date(raw.version).getTime() : 0;
    return { unread, version: Number.isNaN(version) ? 0 : version };
  }

  /**
   * Idempotent: chỉ set `read_at` LẦN ĐẦU (giữ nguyên thời điểm đọc cũ) và
   * `coalesce_key = NULL` để sự kiện kế tiếp tạo dòng mới thay vì gộp vào dòng đã đọc.
   * Không phải của mình → 404 (không lộ sự tồn tại của thông báo người khác).
   */
  async markRead(
    userId: number,
    id: number,
  ): Promise<{ id: number; isRead: true }> {
    const result = await this.notificationRepository.update(
      { id, recipientId: userId, readAt: IsNull() },
      buildReadPatch(),
    );
    if (!result.affected) {
      const exists = await this.notificationRepository.exists({
        where: { id, recipientId: userId },
      });
      if (!exists) throw new NotFoundException('Không tìm thấy thông báo');
    }
    return { id, isRead: true };
  }

  /** Mặc định CÓ đánh dấu cả thông báo thủ công (PLAN 11.15). */
  async markAllRead(
    userId: number,
    category?: 'customer' | 'task' | 'manual',
  ): Promise<{ updated: number }> {
    if (!this.isEnabled()) return { updated: 0 };
    const result = await this.notificationRepository.update(
      {
        recipientId: userId,
        readAt: IsNull(),
        dismissedAt: IsNull(),
        ...(category ? { category } : {}),
      },
      buildReadPatch(),
    );
    return { updated: result.affected ?? 0 };
  }

  /**
   * - Tự động: xoá dòng.
   * - Thủ công (`broadcast_id` khác NULL): CHỈ set `dismissed_at` - "ẩn" khác
   *   "xoá", nếu xoá thì người gửi thấy sai số liệu đã đọc (nguyên tắc 13).
   */
  async remove(
    userId: number,
    id: number,
  ): Promise<{ id: number; removed: true }> {
    const row = await this.notificationRepository.findOne({
      where: { id, recipientId: userId },
      select: { id: true, broadcastId: true },
    });
    if (!row) throw new NotFoundException('Không tìm thấy thông báo');

    if (row.broadcastId !== null) {
      await this.notificationRepository.update(
        { id, recipientId: userId, dismissedAt: IsNull() },
        { dismissedAt: new Date() },
      );
    } else {
      await this.notificationRepository.delete({ id, recipientId: userId });
    }
    return { id, removed: true };
  }

  /**
   * Khôi phục 1 thông báo THỦ CÔNG đã ẩn (đảo ngược `remove()` cho trường
   * hợp `broadcastId != null`) - tab "Đã ẩn" ở trang `/thong-bao` (PLAN 7.1
   * mở rộng). Thông báo TỰ ĐỘNG không có khái niệm này (đã xoá cứng, không
   * còn dòng để khôi phục) - route chỉ có ý nghĩa với thủ công, nhưng vẫn
   * chấp nhận gọi cho tự động (không match `dismissedAt IS NOT NULL` nào →
   * `affected = 0` → 404, không cần nhánh check riêng theo `broadcastId`).
   */
  async restore(
    userId: number,
    id: number,
  ): Promise<{ id: number; restored: true }> {
    const result = await this.notificationRepository.update(
      { id, recipientId: userId, dismissedAt: Not(IsNull()) },
      { dismissedAt: null },
    );
    if (!result.affected) {
      const exists = await this.notificationRepository.exists({
        where: { id, recipientId: userId },
      });
      if (!exists) throw new NotFoundException('Không tìm thấy thông báo');
      // Tồn tại nhưng không match `dismissedAt IS NOT NULL` - đã ở trạng
      // thái hiện sẵn (không phải lỗi, giữ idempotent như `markRead`).
    }
    return { id, restored: true };
  }

  // ───────────────────────────── helpers ─────────────────────────────

  private toResponse(n: Notification): NotificationResponse {
    return {
      id: n.id,
      eventType: n.eventType,
      category: n.category,
      relation: n.relation,
      actorId: n.actorId,
      entityType: n.entityType,
      entityId: n.entityId,
      subEntityType: n.subEntityType,
      subEntityId: n.subEntityId,
      broadcastId: n.broadcastId,
      title: n.title,
      // Thủ công: nội dung đầy đủ nằm ở broadcast (dòng notifications.body = NULL)
      body: n.broadcastId !== null ? (n.broadcast?.body ?? null) : n.body,
      params: n.params,
      occurrences: n.occurrences,
      // Suy từ read_at (nguồn sự thật) - không phụ thuộc cột phái sinh is_read
      isRead: n.readAt !== null && n.readAt !== undefined,
      readAt: n.readAt,
      createdAt: n.createdAt,
      sortAt: n.sortAt,
    };
  }
}