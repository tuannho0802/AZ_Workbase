import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PERMISSION_KEY } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { GuidesController } from './guides.controller';

type Handler = (...args: unknown[]) => unknown;
const proto = GuidesController.prototype as unknown as Record<string, Handler>;

/** Khoá hợp đồng bảo mật của /guides/*: nhóm quản trị PHẢI gác guides.manage, nhóm xem KHÔNG gác. */
describe('GuidesController', () => {
  it('JwtAuthGuard + PermissionGuard ở mức class', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, GuidesController) as unknown[];
    expect(guards).toContain(JwtAuthGuard);
    expect(guards).toContain(PermissionGuard);
  });

  it.each(['listManage', 'listRoleOptions', 'getManageDetail', 'create', 'update', 'remove'])(
    '%s khai @RequirePermission("guides.manage")',
    (name) => {
      expect(Reflect.getMetadata(PERMISSION_KEY, proto[name])).toBe('guides.manage');
    },
  );

  it.each(['list', 'getBySlug'])('%s KHÔNG gắn permission (mọi role đăng nhập đều xem được)', (name) => {
    expect(Reflect.getMetadata(PERMISSION_KEY, proto[name])).toBeUndefined();
  });

  it('không có endpoint lạ ngoài 8 endpoint đã khoá', () => {
    const names = Object.getOwnPropertyNames(GuidesController.prototype).filter((n) => n !== 'constructor');
    expect(names.sort()).toEqual(
      ['list', 'listManage', 'listRoleOptions', 'getManageDetail', 'create', 'update', 'remove', 'getBySlug'].sort(),
    );
  });

  it('route tĩnh manage/* khai TRƯỚC :slug (Nest khớp theo thứ tự khai báo)', () => {
    const order = Object.getOwnPropertyNames(GuidesController.prototype);
    expect(order.indexOf('listManage')).toBeLessThan(order.indexOf('getBySlug'));
    expect(order.indexOf('getManageDetail')).toBeLessThan(order.indexOf('getBySlug'));
  });

  it('manage/roles khai TRƯỚC manage/:id (tránh "roles" bị ParseIntPipe -> 400)', () => {
    const order = Object.getOwnPropertyNames(GuidesController.prototype);
    expect(order.indexOf('listRoleOptions')).toBeLessThan(order.indexOf('getManageDetail'));
  });
});
