import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ThrottlerGuard } from '@nestjs/throttler';
import { PERMISSION_KEY } from '../../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { NotificationBroadcastsController } from './notification-broadcasts.controller';

/**
 * Khoá hợp đồng bảo mật của `/notification-broadcasts/*` (PLAN 6.7) - khác
 * `NotificationsController` (hộp thư cá nhân, chỉ JwtAuthGuard): mọi endpoint
 * ở đây PHẢI đi qua `PermissionGuard` với ĐÚNG permission key tương ứng hành
 * động CRUD (view/create/edit/delete) - lệch 1 key cũng đủ mở/khoá nhầm
 * quyền cho toàn bộ role. Theo mẫu `notifications.controller.spec.ts`.
 */
describe('NotificationBroadcastsController', () => {
  it('bảo vệ bằng JwtAuthGuard + PermissionGuard ở mức class', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      NotificationBroadcastsController,
    ) as unknown[];
    expect(guards).toContain(JwtAuthGuard);
    expect(guards).toContain(PermissionGuard);
  });

  it.each([
    ['preview', 'notification_broadcasts.create'],
    ['send', 'notification_broadcasts.create'],
    ['listSent', 'notification_broadcasts.view'],
    ['getOne', 'notification_broadcasts.view'],
    ['listRecipients', 'notification_broadcasts.view'],
    ['update', 'notification_broadcasts.edit'],
    ['remove', 'notification_broadcasts.delete'],
  ])('%s khai đúng @RequirePermission("%s")', (methodName, expectedKey) => {
    const proto = NotificationBroadcastsController.prototype as unknown as Record<
      string,
      (...args: unknown[]) => unknown
    >;
    const handler = proto[methodName];
    expect(handler).toBeDefined();
    expect(Reflect.getMetadata(PERMISSION_KEY, handler)).toBe(expectedKey);
  });

  it('send() gắn thêm ThrottlerGuard ở mức method (chặn spam gửi)', () => {
    const proto = NotificationBroadcastsController.prototype as unknown as Record<
      string,
      (...args: unknown[]) => unknown
    >;
    const methodGuards = Reflect.getMetadata(GUARDS_METADATA, proto.send) as unknown[];
    expect(methodGuards).toContain(ThrottlerGuard);
  });

  it('không có endpoint "lạ" nào ngoài 7 endpoint đã khoá permission ở trên', () => {
    const proto = NotificationBroadcastsController.prototype as unknown as Record<
      string,
      unknown
    >;
    const methodNames = Object.getOwnPropertyNames(proto).filter(
      (name) => name !== 'constructor',
    );
    expect(methodNames.sort()).toEqual(
      ['preview', 'send', 'listSent', 'getOne', 'listRecipients', 'update', 'remove'].sort(),
    );
  });

  it('chuyển đúng userId/scope từ decorator xuống service - không nhận recipientId/senderId từ client', () => {
    const service: any = {
      preview: jest.fn(),
      send: jest.fn(),
      listSent: jest.fn(),
      getOne: jest.fn(),
      listRecipients: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    const c = new NotificationBroadcastsController(service);

    c.preview(7, 'all', { audience: { type: 'USERS', userIds: [1] } } as any);
    c.send(7, 'department', { title: 't', body: 'b', audience: { type: 'USERS', userIds: [1] } } as any);
    c.listSent(7, 'manager', 'own', { limit: 10 } as any);
    c.getOne(7, 'manager', 'own', 5);
    c.listRecipients(7, 'manager', 'own', 5, { limit: 10 } as any);
    c.update(7, 'manager', 'own', 5, { title: 'x' } as any);
    c.remove(7, 'admin', 'all', 5);

    expect(service.preview).toHaveBeenCalledWith(7, 'all', {
      audience: { type: 'USERS', userIds: [1] },
    });
    expect(service.send).toHaveBeenCalledWith(7, 'department', {
      title: 't',
      body: 'b',
      audience: { type: 'USERS', userIds: [1] },
    });
    expect(service.listSent).toHaveBeenCalledWith(7, 'manager', 'own', { limit: 10 });
    expect(service.getOne).toHaveBeenCalledWith(5, 7, 'manager', 'own');
    expect(service.listRecipients).toHaveBeenCalledWith(5, 7, 'manager', 'own', { limit: 10 });
    expect(service.update).toHaveBeenCalledWith(5, 7, 'manager', 'own', { title: 'x' });
    expect(service.remove).toHaveBeenCalledWith(5, 7, 'admin', 'all');
  });
});
