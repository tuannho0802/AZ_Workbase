import { NotFoundException, BadRequestException } from '@nestjs/common';
import { IsNull, Not } from 'typeorm';
import {
  NotificationsService,
  decodeCursor,
  encodeCursor,
} from './notifications.service';

/**
 * Mock repository - logic SQL thật (ON DUPLICATE KEY, cursor, cột sinh...) đã được
 * kiểm chứng trên MySQL 8 thật khi phát triển Phase 1; spec này khoá HÀNH VI của
 * service (lọc người nhận, preference, không throw, IDOR, ẩn ≠ xoá).
 */
describe('NotificationsService', () => {
  let service: NotificationsService;
  let notifRepo: any;
  let prefRepo: any;
  let userRepo: any;

  const activeUser = (id: number, name = `U${id}`) => ({
    id,
    name,
    isActive: true,
  });

  beforeEach(() => {
    process.env.NOTIFICATIONS_ENABLED = 'true';
    notifRepo = {
      query: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      exists: jest.fn().mockResolvedValue(true),
      findOne: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      createQueryBuilder: jest.fn(),
    };
    prefRepo = { find: jest.fn().mockResolvedValue([]) };
    userRepo = { find: jest.fn().mockResolvedValue([]) };
    service = new NotificationsService(notifRepo, prefRepo, userRepo);
    jest
      .spyOn((service as any).logger, 'error')
      .mockImplementation(() => undefined);
    jest
      .spyOn((service as any).logger, 'warn')
      .mockImplementation(() => undefined);
  });
  afterEach(() => delete process.env.NOTIFICATIONS_ENABLED);

  const baseEmit = {
    type: 'customer.created' as const,
    actorId: 1,
    actorName: 'Actor',
    entity: { type: 'customer' as const, id: 55 },
    entityName: 'Nguyễn A',
    recipients: { customer: { salesUserId: 2, marketingUserId: 3 } },
  };

  const insertedRecipientIds = (): number[] => {
    const values: unknown[] = notifRepo.query.mock.calls[0][1];
    const width = 16; // số cột INSERT
    const ids: number[] = [];
    for (let i = 0; i < values.length; i += width)
      ids.push(values[i] as number);
    return ids;
  };

  describe('emitNow', () => {
    it('feature flag tắt → no-op (không chạm DB)', async () => {
      delete process.env.NOTIFICATIONS_ENABLED;
      await service.emitNow(baseEmit);
      expect(userRepo.find).not.toHaveBeenCalled();
      expect(notifRepo.query).not.toHaveBeenCalled();
    });

    it('ghi 1 lệnh INSERT cho cả danh sách người nhận', async () => {
      userRepo.find.mockResolvedValue([activeUser(2), activeUser(3)]);
      await service.emitNow(baseEmit);
      expect(notifRepo.query).toHaveBeenCalledTimes(1);
      expect(insertedRecipientIds()).toEqual([2, 3]);
      expect(notifRepo.query.mock.calls[0][0]).toContain(
        'ON DUPLICATE KEY UPDATE id = id',
      );
    });

    it('KHÔNG tự thông báo cho chính người thực hiện', async () => {
      // actor (id=1) đang hoạt động → chỉ bị loại nhờ bước "recipient ≠ actor"
      userRepo.find.mockResolvedValue([activeUser(1), activeUser(3)]);
      await service.emitNow({
        ...baseEmit,
        recipients: { customer: { salesUserId: 1, marketingUserId: 3 } },
      });
      expect(insertedRecipientIds()).toEqual([3]);
    });

    it('bỏ user bị khoá (isActive=false) hoặc không tồn tại', async () => {
      userRepo.find.mockResolvedValue([
        activeUser(2),
        { id: 3, name: 'D', isActive: false },
      ]);
      await service.emitNow(baseEmit);
      expect(insertedRecipientIds()).toEqual([2]);
    });

    it('không ai hợp lệ → không ghi gì', async () => {
      userRepo.find.mockResolvedValue([{ id: 2, name: 'D', isActive: false }]);
      await service.emitNow({
        ...baseEmit,
        recipients: { customer: { salesUserId: 2 } },
      });
      expect(notifRepo.query).not.toHaveBeenCalled();
    });

    it('event bắt buộc (mandatory): KHÔNG tra preference', async () => {
      userRepo.find.mockResolvedValue([activeUser(2), activeUser(3)]);
      await service.emitNow(baseEmit); // customer.created = mandatory
      expect(prefRepo.find).not.toHaveBeenCalled();
    });

    it('event thường: preference tắt → không tạo dòng cho người đó', async () => {
      userRepo.find.mockResolvedValue([activeUser(2), activeUser(3)]);
      prefRepo.find.mockResolvedValue([
        { userId: 3, eventType: 'customer.updated', enabled: false },
      ]);
      await service.emitNow({
        ...baseEmit,
        type: 'customer.updated',
        recipients: { customer: { salesUserId: 2, marketingUserId: 3 } },
      });
      expect(insertedRecipientIds()).toEqual([2]);
    });

    it('event thường: preference bật tường minh hoặc không có dòng → vẫn nhận', async () => {
      userRepo.find.mockResolvedValue([activeUser(2), activeUser(3)]);
      prefRepo.find.mockResolvedValue([
        { userId: 3, eventType: 'customer.updated', enabled: true },
      ]);
      await service.emitNow({ ...baseEmit, type: 'customer.updated' });
      expect(insertedRecipientIds()).toEqual([2, 3]);
    });

    it('event gộp: dùng coalesce_key + ON DUPLICATE KEY tăng occurrences', async () => {
      userRepo.find.mockResolvedValue([activeUser(2)]);
      await service.emitNow({
        ...baseEmit,
        type: 'customer.note_created',
        recipients: { customer: { salesUserId: 2 } },
      });
      const [sql, values] = notifRepo.query.mock.calls[0];
      expect(sql).toContain('occurrences = occurrences + 1');
      expect(values).toContain('customer.note_created:customer:55');
      // dedupe_key phải NULL với event gộp
      expect(values[13]).toBeNull();
    });

    it('event không gộp: coalesce_key NULL, dedupe_key theo suffix', async () => {
      userRepo.find.mockResolvedValue([activeUser(2)]);
      await service.emitNow({
        ...baseEmit,
        dedupeSuffix: 123,
        recipients: { customer: { salesUserId: 2 } },
      });
      const values: unknown[] = notifRepo.query.mock.calls[0][1];
      expect(values[12]).toBeNull();
      expect(values[13]).toBe('customer.created:55:123');
    });

    it('tra tên actor khi thiếu actorName (cùng 1 query user), fallback "Hệ thống"', async () => {
      userRepo.find.mockResolvedValue([activeUser(2), activeUser(1, 'Lan')]);
      await service.emitNow({
        ...baseEmit,
        actorName: undefined,
        recipients: { customer: { salesUserId: 2 } },
      });
      expect(userRepo.find).toHaveBeenCalledTimes(1);
      expect(notifRepo.query.mock.calls[0][1][9]).toContain('Lan');

      notifRepo.query.mockClear();
      userRepo.find.mockResolvedValue([activeUser(2)]);
      await service.emitNow({
        ...baseEmit,
        actorId: null,
        actorName: undefined,
        recipients: { customer: { salesUserId: 2 } },
      });
      expect(notifRepo.query.mock.calls[0][1][9]).toContain('Hệ thống');
    });

    it('params được lọc allowlist trước khi lưu (không lưu SĐT/số tiền)', async () => {
      userRepo.find.mockResolvedValue([activeUser(2)]);
      await service.emitNow({
        ...baseEmit,
        params: { phone: '0901234567', amount: 1000, count: 4 },
        recipients: { customer: { salesUserId: 2 } },
      });
      const paramsJson = notifRepo.query.mock.calls[0][1][11];
      // `entityName` (từ `baseEmit`) được BE tự gộp vào params (để FE
      // highlight tên khách/task trong `title` - xem `emitNow`) - SĐT/số
      // tiền vẫn bị allowlist loại bỏ.
      expect(paramsJson).toBe('{"count":4,"entityName":"Nguyễn A"}');
    });

    it('entityName rỗng (batch) → KHÔNG gộp vào params', async () => {
      userRepo.find.mockResolvedValue([activeUser(2)]);
      await service.emitNow({
        ...baseEmit,
        entityName: '',
        params: { count: 4 },
        recipients: { customer: { salesUserId: 2 } },
      });
      const paramsJson = notifRepo.query.mock.calls[0][1][11];
      expect(paramsJson).toBe('{"count":4}');
    });

    it('batch (entity.id = null) → khoá dùng "batch", không lỗi', async () => {
      userRepo.find.mockResolvedValue([activeUser(7)]);
      await service.emitNow({
        type: 'customer.assigned',
        actorId: 1,
        actorName: 'A',
        entity: { type: 'customer', id: null },
        entityName: '-',
        count: 12,
        params: { entityIds: [1, 2, 3] },
        recipients: { newUserIds: [7] },
      });
      const values: unknown[] = notifRepo.query.mock.calls[0][1];
      expect(values[6]).toBeNull();
      expect(String(values[13])).toMatch(/^customer\.assigned:batch:/);
      expect(values[9]).toContain('12 khách hàng');
    });

    it('manual.broadcast KHÔNG đi qua emit() (bị bỏ qua + cảnh báo)', async () => {
      await service.emitNow({ ...baseEmit, type: 'manual.broadcast' });
      expect(notifRepo.query).not.toHaveBeenCalled();
      expect((service as any).logger.warn).toHaveBeenCalled();
    });

    it('KHÔNG throw khi DB lỗi ở bất kỳ bước nào - chỉ Logger.error (nguyên tắc 1)', async () => {
      userRepo.find.mockRejectedValue(new Error('db down'));
      await expect(service.emitNow(baseEmit)).resolves.toBeUndefined();

      userRepo.find.mockResolvedValue([activeUser(2)]);
      notifRepo.query.mockRejectedValue(new Error('insert failed'));
      await expect(
        service.emitNow({
          ...baseEmit,
          recipients: { customer: { salesUserId: 2 } },
        }),
      ).resolves.toBeUndefined();
      expect((service as any).logger.error).toHaveBeenCalledTimes(2);
    });

    it('emit() (fire-and-forget) không throw đồng bộ', () => {
      userRepo.find.mockRejectedValue(new Error('db down'));
      expect(() => service.emit(baseEmit)).not.toThrow();
    });
  });

  describe('list', () => {
    function fakeQb(rows: any[]) {
      const qb: any = {
        leftJoin: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(rows),
      };
      notifRepo.createQueryBuilder.mockReturnValue(qb);
      return qb;
    }
    const row = (id: number, extra: any = {}) => ({
      id,
      recipientId: 9,
      eventType: 'customer.updated',
      category: 'customer',
      relation: 'X',
      actorId: 1,
      entityType: 'customer',
      entityId: 5,
      subEntityType: null,
      subEntityId: null,
      broadcastId: null,
      title: 't',
      body: 'b',
      params: null,
      occurrences: 1,
      readAt: null,
      createdAt: new Date(1000),
      sortAt: new Date(1000 + id),
      ...extra,
    });

    it('tắt flag → rỗng, không query', async () => {
      delete process.env.NOTIFICATIONS_ENABLED;
      expect(await service.list(9, {})).toEqual({ data: [], nextCursor: null });
      expect(notifRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('LUÔN lọc theo recipientId của người gọi và loại dòng đã ẩn', async () => {
      const qb = fakeQb([]);
      await service.list(9, {});
      expect(qb.where).toHaveBeenCalledWith('n.recipientId = :userId', {
        userId: 9,
      });
      expect(qb.andWhere).toHaveBeenCalledWith('n.dismissedAt IS NULL');
    });

    it('limit+1 để biết còn trang sau; trả nextCursor đúng dòng cuối trang', async () => {
      const qb = fakeQb([row(5), row(4), row(3)]);
      const res = await service.list(9, { limit: 2 });
      expect(qb.limit).toHaveBeenCalledWith(3);
      expect(res.data.map((d) => d.id)).toEqual([5, 4]);
      expect(decodeCursor(res.nextCursor!)).toEqual({
        sortAt: new Date(1004),
        id: 4,
      });
    });

    it('hết dữ liệu → nextCursor null', async () => {
      fakeQb([row(5)]);
      expect((await service.list(9, { limit: 2 })).nextCursor).toBeNull();
    });

    it('unreadOnly + category được áp vào query', async () => {
      const qb = fakeQb([]);
      await service.list(9, { unreadOnly: true, category: 'task' });
      expect(qb.andWhere).toHaveBeenCalledWith('n.readAt IS NULL');
      expect(qb.andWhere).toHaveBeenCalledWith('n.category = :category', {
        category: 'task',
      });
    });

    it('dismissed=true → lọc NGƯỢC LẠI, chỉ lấy dòng ĐÃ ẨN (tab "Đã ẩn")', async () => {
      const qb = fakeQb([]);
      await service.list(9, { dismissed: true });
      expect(qb.andWhere).toHaveBeenCalledWith('n.dismissedAt IS NOT NULL');
      expect(qb.andWhere).not.toHaveBeenCalledWith('n.dismissedAt IS NULL');
    });

    it('thủ công: body lấy từ broadcast; KHÔNG trả đối tượng broadcast (tránh lộ audience_params)', async () => {
      fakeQb([
        row(1, {
          category: 'manual',
          broadcastId: 3,
          body: null,
          broadcast: {
            id: 3,
            body: 'Nội dung',
            audienceParams: { userIds: [1] },
          },
        }),
      ]);
      const [item] = (await service.list(9, {})).data;
      expect(item.body).toBe('Nội dung');
      expect(JSON.stringify(item)).not.toContain('audienceParams');
      expect('broadcast' in item).toBe(false);
    });

    it('isRead suy từ readAt', async () => {
      fakeQb([row(2, { readAt: new Date() }), row(1)]);
      expect((await service.list(9, {})).data.map((d) => d.isRead)).toEqual([
        true,
        false,
      ]);
    });

    it('cursor rác → 400', async () => {
      fakeQb([]);
      await expect(
        service.list(9, { cursor: 'not-a-cursor' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('cursor', () => {
    it('encode/decode round-trip', () => {
      const d = new Date('2026-09-21T10:00:00.123Z');
      expect(decodeCursor(encodeCursor(d, 42))).toEqual({ sortAt: d, id: 42 });
    });
  });

  describe('poll', () => {
    it('tắt flag → 0/0', async () => {
      delete process.env.NOTIFICATIONS_ENABLED;
      expect(await service.poll(9)).toEqual({ unread: 0, version: 0 });
    });

    it('đếm chưa đọc theo read_at IS NULL + chưa ẩn; version = MAX(sort_at) epoch ms', async () => {
      notifRepo.count.mockResolvedValue(4);
      const qb: any = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ version: new Date(5000) }),
      };
      notifRepo.createQueryBuilder.mockReturnValue(qb);
      expect(await service.poll(9)).toEqual({ unread: 4, version: 5000 });
      const where = notifRepo.count.mock.calls[0][0].where;
      expect(where.recipientId).toBe(9);
      expect(where.readAt).toBeDefined();
      expect(where.dismissedAt).toBeDefined();
    });

    it('chưa có thông báo nào → version 0', async () => {
      const qb: any = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ version: null }),
      };
      notifRepo.createQueryBuilder.mockReturnValue(qb);
      expect((await service.poll(9)).version).toBe(0);
    });
  });

  describe('markRead', () => {
    it('chỉ update dòng của mình & CHƯA đọc; set read_at + is_read + coalesce_key=NULL', async () => {
      await service.markRead(9, 5);
      const [where, patch] = notifRepo.update.mock.calls[0];
      expect(where.id).toBe(5);
      expect(where.recipientId).toBe(9);
      expect(where.readAt).toBeDefined(); // IsNull() → giữ nguyên read_at cũ nếu đã đọc
      expect(patch.readAt).toBeInstanceOf(Date);
      expect(patch.isRead).toBe(true);
      expect(patch.coalesceKey).toBeNull();
    });

    it('idempotent: đã đọc rồi (affected=0 nhưng tồn tại) → OK, không lỗi', async () => {
      notifRepo.update.mockResolvedValue({ affected: 0 });
      notifRepo.exists.mockResolvedValue(true);
      await expect(service.markRead(9, 5)).resolves.toEqual({
        id: 5,
        isRead: true,
      });
    });

    it('IDOR: không phải của mình / không tồn tại → 404', async () => {
      notifRepo.update.mockResolvedValue({ affected: 0 });
      notifRepo.exists.mockResolvedValue(false);
      await expect(service.markRead(9, 5)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(notifRepo.exists.mock.calls[0][0].where).toEqual({
        id: 5,
        recipientId: 9,
      });
    });
  });

  describe('markAllRead', () => {
    it('chỉ dòng của mình, chưa đọc, chưa ẩn; lọc category khi có', async () => {
      notifRepo.update.mockResolvedValue({ affected: 7 });
      expect(await service.markAllRead(9, 'task')).toEqual({ updated: 7 });
      const [where] = notifRepo.update.mock.calls[0];
      expect(where.recipientId).toBe(9);
      expect(where.category).toBe('task');
      expect(where.dismissedAt).toBeDefined();
    });

    it('không truyền category → không lọc category (gồm cả thông báo thủ công - PLAN 11.15)', async () => {
      await service.markAllRead(9);
      expect('category' in notifRepo.update.mock.calls[0][0]).toBe(false);
    });
  });

  describe('remove', () => {
    it('IDOR: không phải của mình → 404, không xoá gì', async () => {
      notifRepo.findOne.mockResolvedValue(null);
      await expect(service.remove(9, 5)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(notifRepo.delete).not.toHaveBeenCalled();
      expect(notifRepo.update).not.toHaveBeenCalled();
      expect(notifRepo.findOne.mock.calls[0][0].where).toEqual({
        id: 5,
        recipientId: 9,
      });
    });

    it('thông báo TỰ ĐỘNG: xoá dòng', async () => {
      notifRepo.findOne.mockResolvedValue({ id: 5, broadcastId: null });
      await service.remove(9, 5);
      expect(notifRepo.delete).toHaveBeenCalledWith({ id: 5, recipientId: 9 });
      expect(notifRepo.update).not.toHaveBeenCalled();
    });

    it('thông báo THỦ CÔNG: CHỈ set dismissed_at, KHÔNG xoá dòng, KHÔNG đụng read_at (nguyên tắc 13)', async () => {
      notifRepo.findOne.mockResolvedValue({ id: 5, broadcastId: 3 });
      await service.remove(9, 5);
      expect(notifRepo.delete).not.toHaveBeenCalled();
      const [, patch] = notifRepo.update.mock.calls[0];
      expect(Object.keys(patch)).toEqual(['dismissedAt']);
      expect(patch.dismissedAt).toBeInstanceOf(Date);
    });
  });

  describe('restore', () => {
    it('đảo ngược remove(): set dismissedAt = null, CHỈ match dòng đang ẩn', async () => {
      notifRepo.update.mockResolvedValue({ affected: 1 });
      await service.restore(9, 5);
      expect(notifRepo.update).toHaveBeenCalledWith(
        { id: 5, recipientId: 9, dismissedAt: Not(IsNull()) },
        { dismissedAt: null },
      );
      expect(notifRepo.exists).not.toHaveBeenCalled();
    });

    it('IDOR: không phải của mình / không tồn tại → 404', async () => {
      notifRepo.update.mockResolvedValue({ affected: 0 });
      notifRepo.exists.mockResolvedValue(false);
      await expect(service.restore(9, 5)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('tồn tại nhưng đang KHÔNG ẩn (đã restore trước đó) → idempotent, không throw', async () => {
      notifRepo.update.mockResolvedValue({ affected: 0 });
      notifRepo.exists.mockResolvedValue(true);
      await expect(service.restore(9, 5)).resolves.toEqual({
        id: 5,
        restored: true,
      });
    });
  });
});