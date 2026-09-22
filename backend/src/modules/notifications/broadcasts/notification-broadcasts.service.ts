import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Not, Repository } from 'typeorm';
import { NotificationBroadcast } from '../../../database/entities/notification-broadcast.entity';
import { Notification } from '../../../database/entities/notification.entity';
import { User } from '../../../database/entities/user.entity';
import { PermissionScope } from '../../../database/entities/role-permission.entity';
import { AuditService } from '../../audit/audit.service';
import {
  BroadcastAudienceResolver,
  ResolvedAudience,
} from './broadcast-audience.resolver';
import { PreviewBroadcastDto, SendBroadcastDto } from './dto/send-broadcast.dto';
import { UpdateBroadcastDto } from './dto/update-broadcast.dto';
import {
  ListBroadcastRecipientsDto,
  ListBroadcastsDto,
} from './dto/list-broadcasts.dto';

export interface BroadcastListItem {
  id: number;
  title: string;
  body: string;
  senderId: number | null;
  senderName: string | null;
  audienceType: string;
  audienceParams: Record<string, unknown> | null;
  recipientCount: number;
  readCount: number;
  unreadCount: number;
  createdAt: Date;
  updatedAt: Date | null;
}

const isEnabled = () => process.env.NOTIFICATIONS_ENABLED === 'true';

/**
 * [M1] Soạn/gửi + quản lý (Sửa/Xoá) Thông báo THỦ CÔNG - xem
 * `AZ-Workbase Skills/PLAN_NOTIFICATION_SYSTEM.md` mục 6.7.
 *
 * ⚠️ Khác `NotificationsService.emit()` (best-effort, `waitUntil`): gửi thủ
 * công ghi ĐỒNG BỘ trong 1 transaction (PLAN 2.1) - người gửi cần biết chắc
 * "đã gửi tới đúng N người" trước khi request trả về.
 */
@Injectable()
export class NotificationBroadcastsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(NotificationBroadcast)
    private readonly broadcastRepository: Repository<NotificationBroadcast>,
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly auditService: AuditService,
  ) {}

  // ───────────────────────────── Gửi ─────────────────────────────

  async preview(
    senderId: number,
    scope: string | null | undefined,
    dto: PreviewBroadcastDto,
  ): Promise<{ recipientCount: number; sample: string[]; excludedCount: number }> {
    const resolved = await BroadcastAudienceResolver.resolve(
      this.userRepository,
      dto.audience,
      senderId,
      scope,
    );
    const sampleUsers = await this.userRepository.find({
      where: { id: resolved.userIds.slice(0, 5) as any },
      select: { id: true, name: true },
    });
    // Giữ đúng thứ tự lấy mẫu, không phụ thuộc thứ tự trả về của SQL.
    const nameById = new Map(sampleUsers.map((u) => [u.id, u.name]));
    const sample = resolved.userIds
      .slice(0, 5)
      .map((id) => nameById.get(id))
      .filter((n): n is string => !!n);

    return {
      recipientCount: resolved.userIds.length,
      sample,
      excludedCount: resolved.excludedCount,
    };
  }

  async send(
    senderId: number,
    scope: string | null | undefined,
    dto: SendBroadcastDto,
  ): Promise<{ id: number; recipientCount: number }> {
    if (!isEnabled()) {
      throw new BadRequestException('Tính năng thông báo đang tắt');
    }

    const resolved: ResolvedAudience = await BroadcastAudienceResolver.resolve(
      this.userRepository,
      dto.audience,
      senderId,
      scope,
    );

    // `params.senderName` (PLAN 6.2) - tra LUÔN từ DB (không tin JWT payload,
    // vốn không có field `name` - xem `jwt.strategy.ts`).
    const sender = await this.userRepository.findOne({
      where: { id: senderId },
      select: { id: true, name: true },
    });
    const senderName = sender?.name ?? 'Người dùng';

    const result = await this.dataSource.transaction(async (manager) => {
      const broadcast = manager.create(NotificationBroadcast, {
        senderId,
        title: dto.title,
        body: dto.body,
        audienceType: dto.audience.type,
        audienceParams:
          dto.audience.type === 'USERS'
            ? { userIds: dto.audience.userIds }
            : dto.audience.type === 'DEPARTMENTS'
              ? { departmentIds: dto.audience.departmentIds }
              : null,
        recipientCount: resolved.userIds.length,
      });
      const savedBroadcast = await manager.save(broadcast);

      const now = new Date();
      const rows = resolved.userIds.map((userId) =>
        manager.create(Notification, {
          recipientId: userId,
          actorId: senderId,
          eventType: 'manual.broadcast',
          category: 'manual',
          relation: 'MANUAL_RECIPIENT',
          entityType: null,
          entityId: null,
          broadcastId: savedBroadcast.id,
          title: dto.title,
          body: null,
          params: { senderName },
          coalesceKey: null,
          dedupeKey: `manual:${savedBroadcast.id}:${userId}`,
          createdAt: now,
          sortAt: now,
        }),
      );
      // Batch insert 1 lệnh - đủ nhỏ trong trần 2000 dòng (PLAN 6.7 bước 5).
      await manager
        .createQueryBuilder()
        .insert()
        .into(Notification)
        .values(rows)
        .execute();

      return savedBroadcast;
    });

    await this.auditService.logAction(
      senderId,
      'SEND_NOTIFICATION_BROADCAST',
      'notification_broadcast',
      result.id,
      null,
      // Cố ý KHÔNG ghi `body` vào audit (PLAN nguyên tắc 4 / bước 6).
      { title: dto.title, audienceType: dto.audience.type, recipientCount: resolved.userIds.length },
    );

    return { id: result.id, recipientCount: resolved.userIds.length };
  }

  // ───────────────────────────── Sửa ─────────────────────────────

  /**
   * Sửa `title`/`body` của 1 lần đã gửi. Người nhận thấy nhãn "Đã chỉnh sửa"
   * (dựa vào `updatedAt != null`). `title` được đồng bộ lại vào từng dòng
   * `notifications.title` (denormalized) - `body` luôn đọc qua JOIN nên
   * không cần đụng tới các dòng đó.
   */
  async update(
    id: number,
    callerId: number,
    callerRole: string,
    scope: string | null | undefined,
    dto: UpdateBroadcastDto,
  ): Promise<BroadcastListItem> {
    const broadcast = await this.findAccessible(id, callerId, callerRole, scope);

    if (dto.title === undefined && dto.body === undefined) {
      throw new BadRequestException('Không có nội dung nào để sửa');
    }

    await this.dataSource.transaction(async (manager) => {
      const now = new Date();
      if (dto.title !== undefined) broadcast.title = dto.title;
      if (dto.body !== undefined) broadcast.body = dto.body;
      broadcast.updatedAt = now;
      await manager.save(broadcast);

      if (dto.title !== undefined) {
        await manager
          .createQueryBuilder()
          .update(Notification)
          .set({ title: dto.title })
          .where('broadcast_id = :id', { id })
          .execute();
      }
    });

    await this.auditService.logAction(
      callerId,
      'UPDATE_NOTIFICATION_BROADCAST',
      'notification_broadcast',
      id,
      null,
      { titleChanged: dto.title !== undefined, bodyChanged: dto.body !== undefined },
    );

    return this.toListItem(broadcast, 0, 0);
  }

  // ───────────────────────────── Xoá ─────────────────────────────

  /**
   * Xoá HẲN 1 lần gửi khỏi MỌI hộp thư người nhận (yêu cầu chủ dự án - khác
   * PLAN v2 gốc chỉ cho người nhận tự ẩn). `notification_broadcasts` chỉ
   * soft-delete (`deleted_at`) để còn audit/đối chiếu ai đã gửi gì; các dòng
   * `notifications` fan-out thì XOÁ CỨNG (không phải dữ liệu cần giữ lịch sử
   * theo module này - đúng hành vi `DELETE /notifications/:id` đã áp dụng
   * cho thông báo TỰ ĐỘNG trong cùng bảng).
   */
  async remove(
    id: number,
    callerId: number,
    callerRole: string,
    scope: string | null | undefined,
  ): Promise<{ id: number; removed: true }> {
    const broadcast = await this.findAccessible(id, callerId, callerRole, scope);

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(Notification, { broadcastId: id });
      broadcast.deletedAt = new Date();
      await manager.save(broadcast);
    });

    await this.auditService.logAction(
      callerId,
      'DELETE_NOTIFICATION_BROADCAST',
      'notification_broadcast',
      id,
      null,
      null,
    );

    return { id, removed: true };
  }

  // ───────────────────────────── Xem ─────────────────────────────

  async listSent(
    callerId: number,
    callerRole: string,
    scope: string | null | undefined,
    dto: ListBroadcastsDto,
  ) {
    const limit = dto.limit ?? 20;
    const qb = this.broadcastRepository
      .createQueryBuilder('b')
      .leftJoin('b.sender', 'sender')
      .addSelect(['sender.id', 'sender.name'])
      .where('b.deletedAt IS NULL');

    this.applyViewScope(qb, callerId, callerRole, scope);

    if (dto.cursor) {
      const cursorId = Number(dto.cursor);
      if (!Number.isInteger(cursorId)) {
        throw new BadRequestException('Cursor không hợp lệ');
      }
      qb.andWhere('b.id < :cursorId', { cursorId });
    }

    const rows = await qb
      .orderBy('b.id', 'DESC')
      .limit(limit + 1)
      .getMany();

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const counts = await this.readCountsFor(page.map((b) => b.id));

    return {
      data: page.map((b) =>
        this.toListItem(b, counts.get(b.id)?.read ?? 0, counts.get(b.id)?.unread ?? 0),
      ),
      nextCursor: hasMore ? String(page[page.length - 1].id) : null,
    };
  }

  async getOne(
    id: number,
    callerId: number,
    callerRole: string,
    scope: string | null | undefined,
  ): Promise<BroadcastListItem> {
    const broadcast = await this.findAccessible(id, callerId, callerRole, scope);
    const counts = await this.readCountsFor([id]);
    return this.toListItem(broadcast, counts.get(id)?.read ?? 0, counts.get(id)?.unread ?? 0);
  }

  async listRecipients(
    id: number,
    callerId: number,
    callerRole: string,
    scope: string | null | undefined,
    dto: ListBroadcastRecipientsDto,
  ) {
    // 404 nếu ngoài scope - không lộ sự tồn tại (PLAN nguyên tắc 6).
    await this.findAccessible(id, callerId, callerRole, scope);

    const limit = dto.limit ?? 20;
    const qb = this.notificationRepository
      .createQueryBuilder('n')
      .leftJoin('n.recipient', 'recipient')
      .addSelect(['recipient.id', 'recipient.name', 'recipient.isActive'])
      .leftJoin('recipient.department', 'department')
      .addSelect(['department.id', 'department.name'])
      .where('n.broadcastId = :id', { id });

    if (dto.status === 'read') qb.andWhere('n.readAt IS NOT NULL');
    if (dto.status === 'unread') qb.andWhere('n.readAt IS NULL');
    if (dto.search) {
      qb.andWhere('recipient.name LIKE :search', { search: `%${dto.search}%` });
    }
    if (dto.cursor) {
      qb.andWhere('n.id < :cursor', { cursor: dto.cursor });
    }

    const rows = await qb
      .orderBy('n.id', 'DESC')
      .limit(limit + 1)
      .getMany();

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    return {
      data: page.map((n) => ({
        notificationId: n.id,
        userId: n.recipientId,
        name: n.recipient?.name ?? null,
        department: n.recipient?.department?.name ?? null,
        isActive: n.recipient?.isActive ?? false,
        isRead: n.isRead,
        readAt: n.readAt,
        dismissed: n.dismissedAt !== null,
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  // ───────────────────────────── helpers ─────────────────────────────

  /** Áp scope lên QueryBuilder alias 'b' (notification_broadcasts). */
  private applyViewScope(
    qb: ReturnType<Repository<NotificationBroadcast>['createQueryBuilder']>,
    callerId: number,
    callerRole: string,
    scope: string | null | undefined,
  ) {
    if (scope === PermissionScope.ALL) return qb;
    // own (mặc định seed cho manager) và mọi giá trị khác -> chỉ lần do
    // chính mình gửi (KHÔNG có "department" cho module này - PLAN 6.7).
    qb.andWhere('b.senderId = :callerId', { callerId });
    return qb;
  }

  /** Lấy 1 broadcast + kiểm scope - 404 nếu không có quyền/ngoài phạm vi/đã xoá. */
  private async findAccessible(
    id: number,
    callerId: number,
    callerRole: string,
    scope: string | null | undefined,
  ): Promise<NotificationBroadcast> {
    const broadcast = await this.broadcastRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!broadcast) throw new NotFoundException('Không tìm thấy thông báo đã gửi');

    if (scope !== PermissionScope.ALL && broadcast.senderId !== callerId) {
      throw new NotFoundException('Không tìm thấy thông báo đã gửi');
    }
    return broadcast;
  }

  private async readCountsFor(
    broadcastIds: number[],
  ): Promise<Map<number, { read: number; unread: number }>> {
    const map = new Map<number, { read: number; unread: number }>();
    if (broadcastIds.length === 0) return map;

    const rows = await this.notificationRepository
      .createQueryBuilder('n')
      .select('n.broadcastId', 'broadcastId')
      .addSelect('SUM(CASE WHEN n.readAt IS NOT NULL THEN 1 ELSE 0 END)', 'read')
      .addSelect('SUM(CASE WHEN n.readAt IS NULL THEN 1 ELSE 0 END)', 'unread')
      .where('n.broadcastId IN (:...ids)', { ids: broadcastIds })
      .groupBy('n.broadcastId')
      .getRawMany<{ broadcastId: number; read: string; unread: string }>();

    for (const r of rows) {
      map.set(r.broadcastId, { read: Number(r.read), unread: Number(r.unread) });
    }
    return map;
  }

  private toListItem(
    b: NotificationBroadcast,
    readCount: number,
    unreadCount: number,
  ): BroadcastListItem {
    return {
      id: b.id,
      title: b.title,
      body: b.body,
      senderId: b.senderId,
      senderName: (b as any).sender?.name ?? null,
      audienceType: b.audienceType,
      audienceParams: b.audienceParams,
      recipientCount: b.recipientCount,
      readCount,
      unreadCount,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    };
  }
}
