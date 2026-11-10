import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { FanpagesService, normalizeFanpageUrl } from './fanpages.service';
import { FanpageCaller } from './fanpage-access.service';

const user: FanpageCaller = { id: 7, role: 'employee', departmentId: 3 };

function build(over: { scopes?: Record<string, string | null>; binary?: boolean } = {}) {
  const repo = {
    findOne: jest.fn(),
    create: jest.fn((x) => x),
    save: jest.fn(async (x) => ({ id: 99, ...x })),
    update: jest.fn(),
    delete: jest.fn(),
    manager: { count: jest.fn().mockResolvedValue(0) },
  };
  const platformRepo = { findOne: jest.fn().mockResolvedValue({ id: 1, name: 'Facebook', isActive: true }) };
  const userRepo = { findOne: jest.fn(), find: jest.fn() };
  const flagScopes = { canEdit: null, canDelete: null, canManagePosts: null, canDeletePosts: null, canManageNotes: null, canDeleteNotes: null };
  const access = {
    scopeOf: jest.fn(async (_u: FanpageCaller, key: string) => over.scopes?.[key] ?? null),
    hasBinary: jest.fn(async () => over.binary ?? true),
    managedDepartmentIds: jest.fn().mockResolvedValue([]),
    resolveScopes: jest.fn().mockResolvedValue({ view: 'own', flagScopes, managed: [] }),
    loadPage: jest.fn(async (id: number) => ({ id, name: 'P', url: 'https://x.com/p', platformId: 1, ownerId: 7, isActive: true, owner: { departmentId: 3 } })),
    buildContext: jest.fn((p, uid) => ({ userId: uid, ownerId: p.ownerId, ownerDepartmentId: 3, managedDepartmentIds: [] })),
    flagsFor: jest.fn().mockReturnValue({}),
    assertPageAccess: jest.fn(),
  };
  const audit = { logActionAsync: jest.fn() };
  const svc = new FanpagesService(repo as never, platformRepo as never, userRepo as never, access as never, audit as never);
  return { svc, repo, platformRepo, userRepo, access, audit, flagScopes };
}

describe('normalizeFanpageUrl', () => {
  it('cắt khoảng trắng và dấu / cuối', () => {
    expect(normalizeFanpageUrl('  https://fb.com/abc// ')).toBe('https://fb.com/abc');
  });
});

describe('FanpagesService.create', () => {
  it('mặc định người tạo là người phụ trách + chuẩn hoá link + ghi audit', async () => {
    const { svc, repo, audit } = build();
    repo.findOne.mockResolvedValue(null);
    await svc.create({ platformId: 1, name: ' Page A ', url: 'https://fb.com/a/' }, user);
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Page A', url: 'https://fb.com/a', ownerId: 7, createdById: 7 }));
    expect(audit.logActionAsync).toHaveBeenCalledWith(7, 'CREATE_FANPAGE', 'fanpage', 99, null, expect.any(Object));
  });

  it('link trùng -> 409', async () => {
    const { svc, repo } = build();
    repo.findOne.mockResolvedValue({ id: 5 });
    await expect(svc.create({ platformId: 1, name: 'A', url: 'https://fb.com/a' }, user)).rejects.toBeInstanceOf(ConflictException);
  });

  it('nền tảng đã khoá -> 400', async () => {
    const { svc, platformRepo } = build();
    platformRepo.findOne.mockResolvedValue({ id: 1, name: 'Zalo', isActive: false });
    await expect(svc.create({ platformId: 1, name: 'A', url: 'https://fb.com/a' }, user)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('giao cho người khác khi scope edit = own -> 403', async () => {
    const { svc, repo } = build({ scopes: { 'fanpages.edit': 'own' } });
    repo.findOne.mockResolvedValue(null);
    await expect(svc.create({ platformId: 1, name: 'A', url: 'https://fb.com/a', ownerId: 8 }, user)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('giao cho người khác khi scope edit = all -> được', async () => {
    const { svc, repo, userRepo } = build({ scopes: { 'fanpages.edit': 'all' } });
    repo.findOne.mockResolvedValue(null);
    userRepo.findOne.mockResolvedValue({ id: 8, departmentId: 9 });
    await svc.create({ platformId: 1, name: 'A', url: 'https://fb.com/a', ownerId: 8 }, user);
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ ownerId: 8, createdById: 7 }));
  });
});

describe('FanpagesService.update', () => {
  it('scope edit không phủ tới Page -> 403', async () => {
    const { svc, access } = build();
    access.loadPage.mockResolvedValue({ id: 1, ownerId: 99, url: 'u', name: 'n', platformId: 1, isActive: true, owner: { departmentId: 3 } });
    await expect(svc.update(1, { name: 'X' }, user)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('đổi người phụ trách khi chỉ có scope own -> 403', async () => {
    const { svc, access, flagScopes } = build();
    (flagScopes as Record<string, string | null>).canEdit = 'own';
    await expect(svc.update(1, { ownerId: 8 }, user)).rejects.toBeInstanceOf(ForbiddenException);
    expect(access.loadPage).toHaveBeenCalled();
  });

  it('sửa tên hợp lệ dùng repo.update (không save) + audit', async () => {
    const { svc, repo, audit, flagScopes } = build();
    (flagScopes as Record<string, string | null>).canEdit = 'own';
    await svc.update(1, { name: 'Tên mới' }, user);
    expect(repo.update).toHaveBeenCalledWith(1, { name: 'Tên mới' });
    expect(audit.logActionAsync).toHaveBeenCalledWith(7, 'UPDATE_FANPAGE', 'fanpage', 1, expect.any(Object), expect.any(Object));
  });
});
