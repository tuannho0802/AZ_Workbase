import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { NotificationBroadcastsService } from './notification-broadcasts.service';
import { PermissionScope } from '../../../database/entities/role-permission.entity';

describe('NotificationBroadcastsService', () => {
  let service: NotificationBroadcastsService;

  const mockBroadcastRepo = {
    createQueryBuilder: jest.fn(),
    findOne: jest.fn(),
  };
  const mockNotificationRepo = {
    createQueryBuilder: jest.fn(),
  };
  const mockUserRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    manager: { getRepository: () => ({ find: jest.fn().mockResolvedValue([]) }) },
  };
  const mockAuditService = { logAction: jest.fn() };

  let transactionManager: any;
  const mockDataSource = {
    transaction: jest.fn((cb: any) => cb(transactionManager)),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NOTIFICATIONS_ENABLED = 'true';
    transactionManager = {
      create: jest.fn((_entity: any, data: any) => data),
      save: jest.fn((data: any) => Promise.resolve({ id: 42, ...data })),
      insert: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn(() => ({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(undefined),
      })),
    };

    service = new NotificationBroadcastsService(
      mockDataSource as any,
      mockBroadcastRepo as any,
      mockNotificationRepo as any,
      mockUserRepo as any,
      mockAuditService as any,
    );
  });

  describe('send()', () => {
    it('scope không hợp lệ (own) -> ném lỗi từ resolver, KHÔNG mở transaction', async () => {
      await expect(
        service.send(1, PermissionScope.OWN, {
          title: 'T',
          body: 'B',
          audience: { type: 'USERS', userIds: [2] } as any,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it('gửi thành công: ghi broadcast + insert đúng số dòng notifications, audit KHÔNG chứa body', async () => {
      mockUserRepo.find.mockResolvedValue([{ id: 2, isActive: true, departmentId: 1 }]);
      mockUserRepo.findOne.mockResolvedValue({ id: 1, name: 'Sếp' });

      const result = await service.send(1, PermissionScope.ALL, {
        title: 'Thông báo',
        body: 'Nội dung bí mật',
        audience: { type: 'USERS', userIds: [2] } as any,
      });

      expect(result).toEqual({ id: 42, recipientCount: 1 });
      expect(transactionManager.insert).toHaveBeenCalledWith(
        expect.anything(),
        expect.arrayContaining([expect.objectContaining({ recipientId: 2, broadcastId: 42 })]),
      );
      expect(mockAuditService.logAction).toHaveBeenCalledWith(
        1,
        'SEND_NOTIFICATION_BROADCAST',
        'notification_broadcast',
        42,
        null,
        expect.not.objectContaining({ body: expect.anything() }),
      );
    });

    it('tính năng tắt (NOTIFICATIONS_ENABLED != true) -> 400, không gọi transaction', async () => {
      process.env.NOTIFICATIONS_ENABLED = 'false';
      await expect(
        service.send(1, PermissionScope.ALL, {
          title: 'T',
          body: 'B',
          audience: { type: 'USERS', userIds: [2] } as any,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe('findAccessible() qua update()/remove() - IDOR', () => {
    it('scope own, broadcast của người khác -> 404 (không lộ tồn tại)', async () => {
      mockBroadcastRepo.findOne.mockResolvedValue({ id: 5, senderId: 99, deletedAt: null });
      await expect(
        service.update(5, 1, 'manager', PermissionScope.OWN, { title: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('scope all -> sửa được broadcast của người khác', async () => {
      const broadcast = { id: 5, senderId: 99, title: 'cũ', deletedAt: null };
      mockBroadcastRepo.findOne.mockResolvedValue(broadcast);
      const res = await service.update(5, 1, 'admin', PermissionScope.ALL, { title: 'mới' });
      expect(res.title).toBe('mới');
      expect(broadcast.title).toBe('mới');
    });

    it('không truyền title lẫn body -> 400', async () => {
      mockBroadcastRepo.findOne.mockResolvedValue({ id: 5, senderId: 1, deletedAt: null });
      await expect(service.update(5, 1, 'manager', PermissionScope.OWN, {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('remove()', () => {
    it('xoá: xoá cứng toàn bộ dòng notifications của broadcast + soft-delete broadcast', async () => {
      const broadcast: any = { id: 7, senderId: 1, deletedAt: null };
      mockBroadcastRepo.findOne.mockResolvedValue(broadcast);

      const result = await service.remove(7, 1, 'manager', PermissionScope.OWN);

      expect(result).toEqual({ id: 7, removed: true });
      expect(transactionManager.delete).toHaveBeenCalledWith(expect.anything(), { broadcastId: 7 });
      expect(broadcast.deletedAt).toBeInstanceOf(Date);
      expect(mockAuditService.logAction).toHaveBeenCalledWith(
        1,
        'DELETE_NOTIFICATION_BROADCAST',
        'notification_broadcast',
        7,
        null,
        null,
      );
    });

    it('đã bị xoá trước đó (deletedAt != null trong DB) -> 404 vì findAccessible chỉ tìm deletedAt IS NULL', async () => {
      mockBroadcastRepo.findOne.mockResolvedValue(null);
      await expect(service.remove(7, 1, 'manager', PermissionScope.OWN)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
