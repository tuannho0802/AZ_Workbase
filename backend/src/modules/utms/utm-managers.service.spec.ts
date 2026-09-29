import { ForbiddenException, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { UtmManagersService } from './utm-managers.service';
import { UtmsService, UtmCaller } from './utms.service';
import { UtmSecondaryManager } from '../../database/entities/utm-secondary-manager.entity';
import { Utm } from '../../database/entities/utm.entity';

const utm = (over: Record<string, unknown> = {}) => ({
  id: 1, name: 'FB_Q4', primaryManagerId: 10, primaryManager: { id: 10, name: 'Chính', email: 'c@x', role: 'employee', departmentId: 5 },
  secondaryManagers: [] as any[], ...over,
});

describe('UtmManagersService', () => {
  let svc: UtmManagersService;
  const secondaryRepo: any = { create: jest.fn((x) => x), save: jest.fn(), remove: jest.fn() };
  const userRepo: any = { findOneBy: jest.fn() };
  const tx: any = { delete: jest.fn(), update: jest.fn() };
  const dataSource: any = { transaction: jest.fn(async (cb) => cb(tx)) };
  const audit: any = { logActionAsync: jest.fn() };
  const scopes: Record<string, string | null> = {};
  let current: any;
  const utmsService = {
    loadUtm: jest.fn(async () => current),
    scopeOf: jest.fn(async (_u: UtmCaller, key: string) => scopes[key] ?? null),
    managedDepartmentIds: jest.fn(async () => [] as number[]),
    buildContext: (u: any, userId: number, managed: number[]) =>
      new UtmsService({} as any, {} as any, {} as any, {} as any, {} as any).buildContext(u, userId, managed),
  } as unknown as UtmsService;
  const me: UtmCaller = { id: 10, role: 'employee' };

  beforeEach(() => {
    jest.clearAllMocks();
    for (const k of Object.keys(scopes)) delete scopes[k];
    scopes['utms.assign'] = 'own';
    current = utm();
    userRepo.findOneBy.mockResolvedValue({ id: 5, name: 'Nhân', email: 'n@x' });
    svc = new UtmManagersService(undefined as any, secondaryRepo, userRepo, dataSource, utmsService, audit);
  });

  it('chính (scope own) thêm phụ được + audit ADD_UTM_MANAGER', async () => {
    await svc.addSecondaryManager(1, 5, me);
    expect(secondaryRepo.save).toHaveBeenCalledWith({ utmId: 1, userId: 5, addedById: 10 });
    expect(audit.logActionAsync).toHaveBeenCalledWith(10, 'ADD_UTM_MANAGER', 'utm', 1, null, expect.objectContaining({ userId: 5, userName: 'Nhân' }));
  });
  it('không có utms.assign nhưng utms.edit scope ALL -> thêm/gỡ phụ + chuyển chính được', async () => {
    scopes['utms.assign'] = null;
    scopes['utms.edit'] = 'all';
    current = utm({ primaryManagerId: 99, secondaryManagers: [{ userId: 6, user: { id: 6, name: 'P', email: 'p@x' } }] });
    await svc.addSecondaryManager(1, 5, me);
    await svc.removeSecondaryManager(1, 6, me);
    await svc.transferPrimary(1, 5, me);
    expect(secondaryRepo.save).toHaveBeenCalled();
    expect(secondaryRepo.remove).toHaveBeenCalled();
    expect(tx.update).toHaveBeenCalledWith(Utm, 1, { primaryManagerId: 5 });
  });
  it('utms.edit scope DEPARTMENT: được khi chính của UTM thuộc phòng ban mình quản lý, không thì 403', async () => {
    scopes['utms.assign'] = null;
    scopes['utms.edit'] = 'department';
    current = utm({ primaryManagerId: 99, primaryManager: { id: 99, name: 'C', email: 'c@x', role: 'employee', departmentId: 5 } });
    (utmsService.managedDepartmentIds as jest.Mock).mockResolvedValueOnce([5]);
    await svc.addSecondaryManager(1, 5, me);
    expect(secondaryRepo.save).toHaveBeenCalled();
    secondaryRepo.save.mockClear();
    (utmsService.managedDepartmentIds as jest.Mock).mockResolvedValueOnce([7]);
    await expect(svc.addSecondaryManager(1, 5, me)).rejects.toBeInstanceOf(ForbiddenException);
    expect(secondaryRepo.save).not.toHaveBeenCalled();
  });
  it('utms.edit scope OWN (dù là chính) KHÔNG tự cho sửa chính/phụ nếu thiếu utms.assign -> 403', async () => {
    scopes['utms.assign'] = null;
    scopes['utms.edit'] = 'own';
    await expect(svc.addSecondaryManager(1, 5, me)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.transferPrimary(1, 5, me)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('getManagers.canEdit phản ánh quyền sửa theo utms.edit scope rộng', async () => {
    scopes['utms.assign'] = null;
    scopes['utms.edit'] = 'all';
    scopes['utms.view'] = 'all';
    current = utm({ primaryManagerId: 99 });
    expect((await svc.getManagers(1, me)).canEdit).toBe(true);
  });
  it('Quản lý phụ KHÔNG được thêm phụ khác -> 403', async () => {
    current = utm({ primaryManagerId: 99, secondaryManagers: [{ userId: 10, user: { id: 10 } }] });
    await expect(svc.addSecondaryManager(1, 5, me)).rejects.toBeInstanceOf(ForbiddenException);
    expect(secondaryRepo.save).not.toHaveBeenCalled();
  });
  it('không có utms.assign (scope null) -> 403 dù là chính', async () => {
    scopes['utms.assign'] = null;
    await expect(svc.addSecondaryManager(1, 5, me)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('không thêm chính làm phụ (400), không thêm trùng (409), user khoá/không tồn tại (400)', async () => {
    await expect(svc.addSecondaryManager(1, 10, me)).rejects.toBeInstanceOf(BadRequestException);
    current = utm({ secondaryManagers: [{ userId: 5, user: { id: 5 } }] });
    await expect(svc.addSecondaryManager(1, 5, me)).rejects.toBeInstanceOf(ConflictException);
    current = utm();
    userRepo.findOneBy.mockResolvedValue(null);
    await expect(svc.addSecondaryManager(1, 5, me)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('thêm đồng thời -> ER_DUP_ENTRY thành 409', async () => {
    secondaryRepo.save.mockRejectedValue({ code: 'ER_DUP_ENTRY' });
    await expect(svc.addSecondaryManager(1, 5, me)).rejects.toBeInstanceOf(ConflictException);
  });
  it('gỡ phụ: audit mang tên người bị gỡ; không phải phụ -> 404', async () => {
    current = utm({ secondaryManagers: [{ userId: 5, user: { id: 5, name: 'Nhân', email: 'n@x' } }] });
    await svc.removeSecondaryManager(1, 5, me);
    expect(audit.logActionAsync).toHaveBeenCalledWith(10, 'REMOVE_UTM_MANAGER', 'utm', 1, expect.objectContaining({ userName: 'Nhân' }), null);
    current = utm();
    await expect(svc.removeSecondaryManager(1, 5, me)).rejects.toBeInstanceOf(NotFoundException);
  });
  it('chuyển chính: gỡ khỏi phụ + đổi chính trong 1 transaction', async () => {
    await svc.transferPrimary(1, 5, me);
    expect(tx.delete).toHaveBeenCalledWith(UtmSecondaryManager, { utmId: 1, userId: 5 });
    expect(tx.update).toHaveBeenCalledWith(Utm, 1, { primaryManagerId: 5 });
    expect(audit.logActionAsync).toHaveBeenCalledWith(10, 'TRANSFER_UTM_OWNER', 'utm', 1, expect.any(Object), expect.objectContaining({ primaryManagerId: 5 }));
  });
  it('chuyển chính cho chính mình -> 400; phụ không được chuyển -> 403', async () => {
    await expect(svc.transferPrimary(1, 10, me)).rejects.toBeInstanceOf(BadRequestException);
    current = utm({ primaryManagerId: 99, secondaryManagers: [{ userId: 10, user: { id: 10 } }] });
    await expect(svc.transferPrimary(1, 5, me)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('getManagers: người lạ 403; thành viên xem được, canEdit đúng', async () => {
    current = utm({ primaryManagerId: 99 });
    await expect(svc.getManagers(1, me)).rejects.toBeInstanceOf(ForbiddenException);
    current = utm();
    const r = await svc.getManagers(1, me);
    expect(r.canEdit).toBe(true);
    current = utm({ primaryManagerId: 99 });
    scopes['utms.view'] = 'all';
    expect((await svc.getManagers(1, me)).canEdit).toBe(false);
  });
});
