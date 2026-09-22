import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { BroadcastAudienceResolver } from './broadcast-audience.resolver';
import { PermissionScope } from '../../../database/entities/role-permission.entity';

/**
 * Ma trận (scope 'all'/'department'/'own'/không có) × (USERS/DEPARTMENTS/ALL)
 * theo kế hoạch test ở PLAN_NOTIFICATION_SYSTEM.md mục 9
 * (`broadcast-audience.resolver.spec.ts`).
 */
describe('BroadcastAudienceResolver', () => {
  const senderId = 1;

  function makeUserRepo(users: Array<{ id: number; isActive: boolean; departmentId: number | null }>) {
    const departmentManagerRepo = { find: jest.fn().mockResolvedValue([]) };
    return {
      find: jest.fn((opts: any) => {
        const where = opts?.where ?? {};
        let result = users;
        if (where.id) {
          const ids: number[] = where.id;
          result = result.filter((u) => ids.includes(u.id));
        }
        if (where.isActive !== undefined) {
          result = result.filter((u) => u.isActive === where.isActive);
        }
        if (where.departmentId !== undefined) {
          const deptIds: number[] = where.departmentId;
          result = result.filter((u) => u.departmentId != null && deptIds.includes(u.departmentId));
        }
        return Promise.resolve(result);
      }),
      manager: { getRepository: () => departmentManagerRepo },
      __departmentManagerRepo: departmentManagerRepo,
    } as any;
  }

  it('scope không có dòng (own/undefined) -> 403, không được gửi', async () => {
    const repo = makeUserRepo([{ id: 2, isActive: true, departmentId: 1 }]);
    await expect(
      BroadcastAudienceResolver.resolve(
        repo,
        { type: 'USERS', userIds: [2] },
        senderId,
        PermissionScope.OWN,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('ALL với scope department -> 403 (chỉ scope all mới được chọn ALL)', async () => {
    const repo = makeUserRepo([{ id: 2, isActive: true, departmentId: 1 }]);
    await expect(
      BroadcastAudienceResolver.resolve(repo, { type: 'ALL' } as any, senderId, PermissionScope.DEPARTMENT),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('ALL với scope all -> lấy mọi user active, loại người gửi', async () => {
    const repo = makeUserRepo([
      { id: senderId, isActive: true, departmentId: 1 },
      { id: 2, isActive: true, departmentId: 1 },
      { id: 3, isActive: false, departmentId: 1 },
    ]);
    const result = await BroadcastAudienceResolver.resolve(
      repo,
      { type: 'ALL' } as any,
      senderId,
      PermissionScope.ALL,
    );
    expect(result.userIds).toEqual([2]);
  });

  it('USERS với scope department, chọn user NGOÀI phòng ban quản lý -> 403 kèm id bị từ chối', async () => {
    const repo = makeUserRepo([
      { id: 2, isActive: true, departmentId: 1 }, // trong phòng ban quản lý
      { id: 3, isActive: true, departmentId: 9 }, // ngoài phạm vi
    ]);
    repo.__departmentManagerRepo.find.mockResolvedValue([{ departmentId: 1 }]);

    await expect(
      BroadcastAudienceResolver.resolve(
        repo,
        { type: 'USERS', userIds: [2, 3] },
        senderId,
        PermissionScope.DEPARTMENT,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('USERS với scope department, mọi user trong phạm vi -> cho qua', async () => {
    const repo = makeUserRepo([{ id: 2, isActive: true, departmentId: 1 }]);
    repo.__departmentManagerRepo.find.mockResolvedValue([{ departmentId: 1 }]);

    const result = await BroadcastAudienceResolver.resolve(
      repo,
      { type: 'USERS', userIds: [2] },
      senderId,
      PermissionScope.DEPARTMENT,
    );
    expect(result.userIds).toEqual([2]);
  });

  it('USERS chứa id không tồn tại/đã khoá (không trả về từ find) -> 403', async () => {
    const repo = makeUserRepo([{ id: 2, isActive: true, departmentId: 1 }]);
    await expect(
      BroadcastAudienceResolver.resolve(
        repo,
        { type: 'USERS', userIds: [2, 999] },
        senderId,
        PermissionScope.ALL,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('loại người gửi khỏi danh sách chọn (không tự nhận bản của mình)', async () => {
    const repo = makeUserRepo([{ id: senderId, isActive: true, departmentId: 1 }]);
    await expect(
      BroadcastAudienceResolver.resolve(
        repo,
        { type: 'USERS', userIds: [senderId] },
        senderId,
        PermissionScope.ALL,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('vượt trần NOTIFICATION_BROADCAST_MAX_RECIPIENTS -> 400', async () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ id: i + 2, isActive: true, departmentId: 1 }));
    const repo = makeUserRepo(many);
    const originalEnv = process.env.NOTIFICATION_BROADCAST_MAX_RECIPIENTS;
    process.env.NOTIFICATION_BROADCAST_MAX_RECIPIENTS = '3';

    let ReloadedResolver!: typeof BroadcastAudienceResolver;
    jest.isolateModules(() => {
      // Re-require với env mới vì hằng số trần đọc 1 lần lúc module load.
      ReloadedResolver = require('./broadcast-audience.resolver').BroadcastAudienceResolver;
    });

    // Không dùng `toBeInstanceOf(BadRequestException)` vì `isolateModules`
    // tạo registry module riêng -> class exception load lại là 1 REFERENCE
    // khác (dù cùng tên) với `BadRequestException` import ở đầu file. Kiểm
    // tra qua `getStatus()` (hành vi thật, không phụ thuộc identity class).
    await expect(
      ReloadedResolver.resolve(
        repo,
        { type: 'USERS', userIds: many.map((u) => u.id) },
        senderId,
        PermissionScope.ALL,
      ),
    ).rejects.toMatchObject({ status: 400 });
    process.env.NOTIFICATION_BROADCAST_MAX_RECIPIENTS = originalEnv;
  });
});
