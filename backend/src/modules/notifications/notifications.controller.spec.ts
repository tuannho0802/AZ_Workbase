import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PERMISSION_KEY } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { NotificationsController } from './notifications.controller';

/**
 * Khoá hợp đồng bảo mật của hộp thư cá nhân (PLAN 6.5): chỉ JwtAuthGuard, KHÔNG
 * @RequirePermission (mọi user đăng nhập đều có hộp thư của chính mình), và
 * recipientId luôn lấy từ JWT chứ không từ client.
 */
describe('NotificationsController', () => {
  it('bảo vệ bằng JwtAuthGuard ở mức class', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      NotificationsController,
    ) as unknown[];
    expect(guards).toContain(JwtAuthGuard);
  });

  it('không endpoint nào khai @RequirePermission (inbox cá nhân chỉ cần đăng nhập)', () => {
    const proto = NotificationsController.prototype as unknown as Record<
      string,
      unknown
    >;
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === 'constructor') continue;
      expect(
        Reflect.getMetadata(PERMISSION_KEY, proto[name] as object),
      ).toBeUndefined();
    }
  });

  it('chuyển userId từ JWT xuống service - không có tham số recipientId nào từ client', () => {
    const service: any = {
      list: jest.fn(),
      poll: jest.fn(),
      markAllRead: jest.fn(),
      markRead: jest.fn(),
      restore: jest.fn(),
      remove: jest.fn(),
    };
    const c = new NotificationsController(service);
    c.list(7, { limit: 5 });
    c.poll(7);
    c.readAll(7, { category: 'task' });
    c.markRead(7, 11);
    c.restore(7, 11);
    c.remove(7, 11);
    expect(service.list).toHaveBeenCalledWith(7, { limit: 5 });
    expect(service.poll).toHaveBeenCalledWith(7);
    expect(service.markAllRead).toHaveBeenCalledWith(7, 'task');
    expect(service.markRead).toHaveBeenCalledWith(7, 11);
    expect(service.restore).toHaveBeenCalledWith(7, 11);
    expect(service.remove).toHaveBeenCalledWith(7, 11);
  });
});