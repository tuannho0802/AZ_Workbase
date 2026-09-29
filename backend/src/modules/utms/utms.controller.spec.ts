import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ThrottlerGuard } from '@nestjs/throttler';
import { PERMISSION_KEY } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { UtmsController } from './utms.controller';

type Handler = (...args: unknown[]) => unknown;
const proto = UtmsController.prototype as unknown as Record<string, Handler>;

/** Khoá hợp đồng bảo mật của /utms/*: sai 1 key = mở/khoá nhầm quyền cho cả role. */
describe('UtmsController', () => {
  it('JwtAuthGuard + PermissionGuard ở mức class', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, UtmsController) as unknown[];
    expect(guards).toContain(JwtAuthGuard);
    expect(guards).toContain(PermissionGuard);
  });

  it.each([
    ['listScoped', 'utms.view'],
    ['create', 'utms.create'],
    ['update', 'utms.edit'],
    ['deactivate', 'utms.edit'],
    ['activate', 'utms.edit'],
    ['remove', 'utms.delete'],
    ['addManager', 'utms.assign'],
    ['removeManager', 'utms.assign'],
    ['transferPrimary', 'utms.assign'],
  ])('%s khai đúng @RequirePermission("%s")', (name, key) => {
    expect(Reflect.getMetadata(PERMISSION_KEY, proto[name])).toBe(key);
  });

  // Employee không có utms.view/create vẫn phải dùng dropdown + thấy tag: các GET này KHÔNG được gác permission.
  it.each(['findUsable', 'managedByMe', 'getOne', 'getManagers'])('%s KHÔNG gắn permission (tránh 403 cho Employee)', (name) => {
    expect(Reflect.getMetadata(PERMISSION_KEY, proto[name])).toBeUndefined();
  });

  it('create() gắn ThrottlerGuard (chống spam tạo UTM rác)', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, proto.create) as unknown[]).toContain(ThrottlerGuard);
  });

  it('không có endpoint lạ ngoài 13 endpoint đã khoá', () => {
    const names = Object.getOwnPropertyNames(UtmsController.prototype).filter((n) => n !== 'constructor');
    expect(names.sort()).toEqual(
      [
        'findUsable', 'managedByMe', 'listScoped', 'create', 'getOne', 'update', 'deactivate',
        'activate', 'remove', 'getManagers', 'addManager', 'removeManager', 'transferPrimary',
      ].sort(),
    );
  });

  it('route tĩnh (managed-by-me, scoped) khai TRƯỚC :id để không bị nuốt', () => {
    const order = Object.getOwnPropertyNames(UtmsController.prototype);
    expect(order.indexOf('managedByMe')).toBeLessThan(order.indexOf('getOne'));
    expect(order.indexOf('listScoped')).toBeLessThan(order.indexOf('getOne'));
  });
});
