import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RootAdminGuard } from '../../common/guards/root-admin.guard';
import { PERMISSION_KEY } from '../../common/decorators/require-permission.decorator';
import { SystemController } from './system.controller';

describe('SystemController — khoá guard (chỉ Root Admin)', () => {
  it('cả controller dùng JwtAuthGuard rồi RootAdminGuard (health + reset cùng bị khoá)', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, SystemController) as unknown[];
    expect(guards).toEqual([JwtAuthGuard, RootAdminGuard]);
  });

  it('KHÔNG gate bằng @RequirePermission (không cấp được qua trang Phân quyền)', () => {
    const proto = SystemController.prototype as unknown as Record<string, unknown>;
    expect(Reflect.getMetadata(PERMISSION_KEY, proto.health as object)).toBeUndefined();
    expect(Reflect.getMetadata(PERMISSION_KEY, SystemController)).toBeUndefined();
  });

  it('health chuyển cờ fresh (1/true) sang service, mặc định không fresh', async () => {
    const getHealth = jest.fn().mockResolvedValue({});
    const ctl = new SystemController({} as never, { getHealth } as never);
    await ctl.health();
    await ctl.health('1');
    await ctl.health('true');
    await ctl.health('0');
    expect(getHealth.mock.calls.map((c) => c[0])).toEqual([{ fresh: false }, { fresh: true }, { fresh: true }, { fresh: false }]);
  });
});
