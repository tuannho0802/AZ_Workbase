import { ForbiddenException } from '@nestjs/common';
import { RootAdminGuard } from './root-admin.guard';

const ctx = (user: unknown) => ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as never;

describe('RootAdminGuard', () => {
  const guard = new RootAdminGuard();

  it('role=admin VÀ isRootAdmin=true -> cho qua', () => {
    expect(guard.canActivate(ctx({ role: 'admin', isRootAdmin: true }))).toBe(true);
  });

  it.each([
    ['admin thường (isRootAdmin=false)', { role: 'admin', isRootAdmin: false }],
    ['admin thiếu isRootAdmin', { role: 'admin' }],
    ['role khác dù isRootAdmin=true', { role: 'manager', isRootAdmin: true }],
    ['employee', { role: 'employee', isRootAdmin: false }],
    ['isRootAdmin dạng chuỗi/số (không phải boolean true)', { role: 'admin', isRootAdmin: 1 }],
    ['không có user', undefined],
  ])('chặn: %s', (_name, user) => {
    expect(() => guard.canActivate(ctx(user))).toThrow(ForbiddenException);
  });
});
