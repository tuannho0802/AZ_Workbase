import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import { PasswordChangeRequiredInterceptor } from './password-change-required.interceptor';
import { ALLOW_WHEN_PASSWORD_CHANGE_REQUIRED } from '../decorators/allow-when-password-change-required.decorator';

const ctx = (user: any, allowed = false): ExecutionContext =>
  ({
    getType: () => 'http',
    getHandler: () => (allowed ? { [ALLOW_WHEN_PASSWORD_CHANGE_REQUIRED]: true } : {}),
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as any;

describe('PasswordChangeRequiredInterceptor', () => {
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((_k, targets: any[]) => !!targets[0]?.[ALLOW_WHEN_PASSWORD_CHANGE_REQUIRED]);
  const it_ = new PasswordChangeRequiredInterceptor(reflector);
  const next = { handle: jest.fn(() => of('ok')) };
  beforeEach(() => next.handle.mockClear());

  it('không đăng nhập -> cho qua', () => {
    it_.intercept(ctx(undefined), next);
    expect(next.handle).toHaveBeenCalled();
  });
  it('đăng nhập, không bị buộc -> cho qua', () => {
    it_.intercept(ctx({ id: 1, passwordChangeRequired: false }), next);
    expect(next.handle).toHaveBeenCalled();
  });
  it('bị buộc + endpoint thường -> 403 PASSWORD_CHANGE_REQUIRED', () => {
    try {
      it_.intercept(ctx({ id: 1, passwordChangeRequired: true }), next);
      fail('phải ném lỗi');
    } catch (e: any) {
      expect(e).toBeInstanceOf(ForbiddenException);
      expect(e.getResponse().code).toBe('PASSWORD_CHANGE_REQUIRED');
      expect(e.getResponse().reason).toBe('MUST_CHANGE');
    }
    expect(next.handle).not.toHaveBeenCalled();
  });
  it('hết hạn -> reason EXPIRED', () => {
    try {
      it_.intercept(ctx({ id: 1, passwordChangeRequired: true, passwordExpired: true }), next);
      fail('phải ném lỗi');
    } catch (e: any) {
      expect(e.getResponse().reason).toBe('EXPIRED');
    }
  });
  it('bị buộc + endpoint được phép (đổi mật khẩu/logout/me) -> cho qua', () => {
    it_.intercept(ctx({ id: 1, passwordChangeRequired: true }, true), next);
    expect(next.handle).toHaveBeenCalled();
  });
});
