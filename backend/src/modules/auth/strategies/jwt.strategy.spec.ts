import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import { clearAuthUserCache, invalidateAuthUser } from '../../../common/utils/auth-user-cache.util';

describe('JwtStrategy (cache user)', () => {
  const user = { id: 5, email: 'a@b.c', role: 'employee', isActive: true, name: 'A', isRootAdmin: false, departmentId: 1, positionId: null };
  let usersService: { findById: jest.Mock };
  let strategy: JwtStrategy;

  beforeEach(() => {
    clearAuthUserCache();
    usersService = { findById: jest.fn().mockResolvedValue(user) };
    strategy = new JwtStrategy({ get: () => 'secret' } as any, usersService as any);
  });

  it('request thứ 2 cùng user dùng cache, không tra DB lại', async () => {
    await strategy.validate({ sub: 5 });
    await strategy.validate({ sub: 5 });
    expect(usersService.findById).toHaveBeenCalledTimes(1);
  });

  it('invalidateAuthUser buộc tra DB lại', async () => {
    await strategy.validate({ sub: 5 });
    invalidateAuthUser(5);
    await strategy.validate({ sub: 5 });
    expect(usersService.findById).toHaveBeenCalledTimes(2);
  });

  it('user không tồn tại/không active → 401 và KHÔNG cache kết quả null', async () => {
    usersService.findById.mockResolvedValue(null);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(strategy.validate({ sub: 9 })).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(strategy.validate({ sub: 9 })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(usersService.findById).toHaveBeenCalledTimes(2);
  });
});
