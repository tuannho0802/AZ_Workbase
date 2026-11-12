import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { FanpagesService, normalizeFanpageUrl } from './fanpages.service';
import { FanpageCaller } from './fanpage-access.service';

const user: FanpageCaller = { id: 7, role: 'employee', departmentId: 3 };

const DEFAULT_INSIGHTS = {
  postCount: 0,
  noteCount: 0,
  lastPostDate: null,
  posts30d: 0,
  weekCount: 0,
  isTracked: true,
  isOrphan: false,
  cadence: { state: 'ok', daysSinceLastPost: null, weekCount: 0, target: null, streak: 0, postedToday: false },
};

const relationOps = { addAndRemove: jest.fn() };
const txRepo = {
  update: jest.fn(),
  createQueryBuilder: jest.fn(() => ({ relation: () => ({ of: () => relationOps }) })),
};
const txManager = { getRepository: jest.fn(() => txRepo) };

function build(over: { scopes?: Record<string, string | null>; binary?: boolean } = {}) {
  const repo = {
    findOne: jest.fn(),
    create: jest.fn((x) => x),
    save: jest.fn(async (x) => ({ id: 99, ...x })),
    update: jest.fn(),
    delete: jest.fn(),
    manager: {
      count: jest.fn().mockResolvedValue(0),
      transaction: jest.fn(async (cb: (tx: unknown) => Promise<void>) => cb(txManager)),
    },
  };
  const platformRepo = { findOne: jest.fn().mockResolvedValue({ id: 1, name: 'Facebook', isActive: true }) };
  const healthRepo = { findOne: jest.fn().mockResolvedValue({ id: 1, name: 'Bình thường', isLocked: false, isDefault: true }) };
  const userRepo = { findOne: jest.fn(), find: jest.fn() };
  const flagScopes = {
    canEdit: null,
    canDelete: null,
    canManagePosts: null,
    canDeletePosts: null,
    canManageNotes: null,
    canDeleteNotes: null,
    canManageMetrics: null,
    canDeleteMetrics: null,
    canExport: null,
  };
  const access = {
    scopeOf: jest.fn(async (_u: FanpageCaller, key: string) => over.scopes?.[key] ?? null),
    hasBinary: jest.fn(async () => over.binary ?? true),
    managedDepartmentIds: jest.fn().mockResolvedValue([]),
    resolveScopes: jest.fn().mockResolvedValue({ view: 'own', flagScopes, managed: [] }),
    loadPage: jest.fn(async (id: number): Promise<Record<string, unknown>> => ({ id, name: 'P', url: 'https://x.com/p', platformId: 1, ownerId: 7, isActive: true, owner: { departmentId: 3 }, owners: [{ id: 7, departmentId: 3 }] })),
    buildContext: jest.fn((p, uid) => ({ userId: uid, ownerIds: (p.owners ?? []).map((o: { id: number }) => o.id), ownerDepartmentIds: [3], managedDepartmentIds: [] })),
    flagsFor: jest.fn().mockReturnValue({}),
    assertPageAccess: jest.fn(),
  };
  const audit = { logActionAsync: jest.fn() };
  const scoped = { load: jest.fn().mockResolvedValue([]), countArchived: jest.fn().mockResolvedValue(0) };
  const insights = {
    forPages: jest.fn(async (pages: Array<{ id: number }>) => new Map(pages.map((p) => [p.id, DEFAULT_INSIGHTS]))),
  };
  const metrics = { latestFollowers: jest.fn().mockResolvedValue(new Map()) };
  const utmLinks = { chipsForPages: jest.fn().mockResolvedValue(new Map()), chipsForPage: jest.fn().mockResolvedValue([]) };
  const svc = new FanpagesService(
    repo as never,
    platformRepo as never,
    healthRepo as never,
    userRepo as never,
    access as never,
    audit as never,
    scoped as never,
    insights as never,
    metrics as never,
    utmLinks as never,
  );
  return { svc, repo, platformRepo, healthRepo, userRepo, access, audit, flagScopes, scoped, insights };
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
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Page A', url: 'https://fb.com/a', ownerId: 7, owners: [{ id: 7 }], createdById: 7 }));
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
    await expect(svc.create({ platformId: 1, name: 'A', url: 'https://fb.com/a', ownerIds: [8] }, user)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('giao cho người khác khi scope edit = all -> được', async () => {
    const { svc, repo, userRepo } = build({ scopes: { 'fanpages.edit': 'all' } });
    repo.findOne.mockResolvedValue(null);
    userRepo.findOne.mockResolvedValue({ id: 8, departmentId: 9 });
    await svc.create({ platformId: 1, name: 'A', url: 'https://fb.com/a', ownerIds: [8] }, user);
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ ownerId: 8, owners: [{ id: 8 }], createdById: 7 }));
  });

  it('nhiều người phụ trách: người đầu = chính, lưu đủ danh sách', async () => {
    const { svc, repo, userRepo } = build({ scopes: { 'fanpages.edit': 'all' } });
    repo.findOne.mockResolvedValue(null);
    userRepo.findOne.mockImplementation(async ({ where }: { where: { id: number } }) => ({ id: where.id, departmentId: 9 }));
    await svc.create({ platformId: 1, name: 'A', url: 'https://fb.com/a', ownerIds: [8, 7, 9] }, user);
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ ownerId: 8, owners: [{ id: 8 }, { id: 7 }, { id: 9 }] }));
  });

  it('chỉ chọn chính mình trong danh sách -> không cần scope giao Page', async () => {
    const { svc, repo } = build();
    repo.findOne.mockResolvedValue(null);
    await svc.create({ platformId: 1, name: 'A', url: 'https://fb.com/a', ownerIds: [7] }, user);
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ ownerId: 7, owners: [{ id: 7 }] }));
  });
});

describe('FanpagesService.update', () => {
  it('scope edit không phủ tới Page -> 403', async () => {
    const { svc, access } = build();
    access.loadPage.mockResolvedValue({ id: 1, ownerId: 99, url: 'u', name: 'n', platformId: 1, isActive: true, owner: { departmentId: 3 }, owners: [{ id: 99, departmentId: 3 }] });
    await expect(svc.update(1, { name: 'X' }, user)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('đổi người phụ trách khi chỉ có scope own -> 403', async () => {
    const { svc, access, flagScopes } = build();
    (flagScopes as Record<string, string | null>).canEdit = 'own';
    await expect(svc.update(1, { ownerIds: [8] }, user)).rejects.toBeInstanceOf(ForbiddenException);
    expect(access.loadPage).toHaveBeenCalled();
  });

  it('sửa tên hợp lệ dùng repo.update (không save) + audit', async () => {
    const { svc, repo, audit, flagScopes } = build();
    (flagScopes as Record<string, string | null>).canEdit = 'own';
    await svc.update(1, { name: 'Tên mới' }, user);
    expect(txRepo.update).toHaveBeenCalledWith(1, { name: 'Tên mới' });
    expect(audit.logActionAsync).toHaveBeenCalledWith(7, 'UPDATE_FANPAGE', 'fanpage', 1, expect.any(Object), expect.any(Object));
  });

  it('thêm/gỡ người phụ trách (scope all) -> addAndRemove đúng tập + ownerId = người đầu', async () => {
    const { svc, access, userRepo, flagScopes } = build({ scopes: { 'fanpages.edit': 'all' } });
    (flagScopes as Record<string, string | null>).canEdit = 'all';
    access.loadPage.mockResolvedValue({ id: 1, ownerId: 7, url: 'u', name: 'n', platformId: 1, isActive: true, owner: { id: 7 }, owners: [{ id: 7, departmentId: 3 }, { id: 5, departmentId: 3 }] });
    userRepo.findOne.mockResolvedValue({ id: 8, departmentId: 9 });
    txRepo.update.mockClear();
    relationOps.addAndRemove.mockClear();
    await svc.update(1, { ownerIds: [8, 7] }, user);
    expect(txRepo.update).toHaveBeenCalledWith(1, { ownerId: 8 });
    expect(relationOps.addAndRemove).toHaveBeenCalledWith([8], [5]);
  });

  it('scope department: gỡ người ngoài phòng ban quản lý -> 403', async () => {
    const { svc, access, flagScopes } = build({ scopes: { 'fanpages.edit': 'department' } });
    (flagScopes as Record<string, string | null>).canEdit = 'department';
    access.managedDepartmentIds.mockResolvedValue([3]);
    access.loadPage.mockResolvedValue({ id: 1, ownerId: 7, url: 'u', name: 'n', platformId: 1, isActive: true, owner: { id: 7 }, owners: [{ id: 7, departmentId: 3 }, { id: 5, departmentId: 99 }] });
    await expect(svc.update(1, { ownerIds: [7] }, user)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('FanpagesService.create - tình trạng Page + mục tiêu tuần', () => {
  it('bỏ trống tình trạng -> dùng dòng mặc định', async () => {
    const { svc, repo } = build();
    repo.findOne.mockResolvedValue(null);
    await svc.create({ platformId: 1, name: 'A', url: 'https://fb.com/a' }, user);
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ healthStatusId: 1, healthNote: null, targetPostsPerWeek: null }));
  });

  it('chọn tình trạng đã khoá -> 400', async () => {
    const { svc, repo, healthRepo } = build();
    repo.findOne.mockResolvedValue(null);
    healthRepo.findOne.mockResolvedValue({ id: 4, name: 'Bị khoá', isLocked: true });
    await expect(svc.create({ platformId: 1, name: 'A', url: 'https://fb.com/a', healthStatusId: 4 }, user)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('tình trạng không tồn tại -> 400', async () => {
    const { svc, repo, healthRepo } = build();
    repo.findOne.mockResolvedValue(null);
    healthRepo.findOne.mockResolvedValue(null);
    await expect(svc.create({ platformId: 1, name: 'A', url: 'https://fb.com/a', healthStatusId: 99 }, user)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lưu mục tiêu tuần + ghi chú tình trạng đã cắt khoảng trắng', async () => {
    const { svc, repo } = build();
    repo.findOne.mockResolvedValue(null);
    await svc.create({ platformId: 1, name: 'A', url: 'https://fb.com/a', targetPostsPerWeek: 5, healthNote: '  chờ kháng nghị ' }, user);
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ targetPostsPerWeek: 5, healthNote: 'chờ kháng nghị' }));
  });
});

describe('FanpagesService.update - tình trạng, mục tiêu tuần, lưu trữ', () => {
  const pageRow = (over: Record<string, unknown> = {}) => ({
    id: 1, ownerId: 7, url: 'u', name: 'n', platformId: 1, isActive: true, healthStatusId: 1, healthNote: null,
    targetPostsPerWeek: null, archivedAt: null, owner: { id: 7, departmentId: 3 }, owners: [{ id: 7, departmentId: 3 }], ...over,
  });

  it('đổi tình trạng -> patch có healthStatusId + healthChangedAt', async () => {
    const { svc, flagScopes, access, healthRepo } = build();
    (flagScopes as Record<string, string | null>).canEdit = 'own';
    access.loadPage.mockResolvedValue(pageRow());
    healthRepo.findOne.mockResolvedValue({ id: 2, name: 'Bị hạn chế', isLocked: false });
    txRepo.update.mockClear();
    await svc.update(1, { healthStatusId: 2 }, user);
    expect(txRepo.update).toHaveBeenCalledWith(1, expect.objectContaining({ healthStatusId: 2, healthChangedAt: expect.any(Date) }));
  });

  it('đặt lại đúng tình trạng đang dùng -> không patch, không kiểm tra khoá', async () => {
    const { svc, flagScopes, access, healthRepo } = build();
    (flagScopes as Record<string, string | null>).canEdit = 'own';
    access.loadPage.mockResolvedValue(pageRow({ healthStatusId: 4 }));
    healthRepo.findOne.mockClear();
    txRepo.update.mockClear();
    await svc.update(1, { healthStatusId: 4 }, user);
    expect(healthRepo.findOne).not.toHaveBeenCalled();
    expect(txRepo.update).not.toHaveBeenCalled();
  });

  it('chọn tình trạng đã khoá -> 400', async () => {
    const { svc, flagScopes, access, healthRepo } = build();
    (flagScopes as Record<string, string | null>).canEdit = 'own';
    access.loadPage.mockResolvedValue(pageRow());
    healthRepo.findOne.mockResolvedValue({ id: 4, name: 'Bị khoá', isLocked: true });
    await expect(svc.update(1, { healthStatusId: 4 }, user)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('đặt/xoá mục tiêu tuần', async () => {
    const { svc, flagScopes, access } = build();
    (flagScopes as Record<string, string | null>).canEdit = 'own';
    access.loadPage.mockResolvedValue(pageRow({ targetPostsPerWeek: 3 }));
    txRepo.update.mockClear();
    await svc.update(1, { targetPostsPerWeek: 5 }, user);
    expect(txRepo.update).toHaveBeenCalledWith(1, { targetPostsPerWeek: 5 });
    txRepo.update.mockClear();
    await svc.update(1, { targetPostsPerWeek: null }, user);
    expect(txRepo.update).toHaveBeenCalledWith(1, { targetPostsPerWeek: null });
  });

  it('ghi chú tình trạng rỗng -> null (xoá)', async () => {
    const { svc, flagScopes, access } = build();
    (flagScopes as Record<string, string | null>).canEdit = 'own';
    access.loadPage.mockResolvedValue(pageRow({ healthNote: 'cũ' }));
    txRepo.update.mockClear();
    await svc.update(1, { healthNote: '   ' }, user);
    expect(txRepo.update).toHaveBeenCalledWith(1, { healthNote: null });
  });

  it('sửa Page đã lưu trữ -> 409', async () => {
    const { svc, flagScopes, access } = build();
    (flagScopes as Record<string, string | null>).canEdit = 'own';
    access.loadPage.mockResolvedValue(pageRow({ archivedAt: new Date() }));
    await expect(svc.update(1, { name: 'X' }, user)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('FanpagesService.archive / unarchive', () => {
  const live = { id: 1, ownerId: 7, url: 'u', name: 'n', platformId: 1, isActive: true, archivedAt: null, owners: [{ id: 7 }] };

  it('lưu trữ: đặt archivedAt + ngầm tắt theo dõi + audit ARCHIVE_FANPAGE', async () => {
    const { svc, repo, access, audit } = build();
    access.assertPageAccess.mockResolvedValue(live);
    await svc.archive(1, user);
    expect(access.assertPageAccess).toHaveBeenCalledWith(user, 'fanpages.edit', 1, expect.any(String));
    expect(repo.update).toHaveBeenCalledWith(1, { archivedAt: expect.any(Date), isActive: false });
    expect(audit.logActionAsync).toHaveBeenCalledWith(7, 'ARCHIVE_FANPAGE', 'fanpage', 1, expect.objectContaining({ isArchived: false }), expect.any(Object));
  });

  it('lưu trữ Page đã lưu trữ -> 409, không ghi gì', async () => {
    const { svc, repo, access } = build();
    access.assertPageAccess.mockResolvedValue({ ...live, archivedAt: new Date() });
    await expect(svc.archive(1, user)).rejects.toBeInstanceOf(ConflictException);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('không phủ scope fanpages.edit -> 403 giữ nguyên, không ghi gì', async () => {
    const { svc, repo, access } = build();
    access.assertPageAccess.mockRejectedValue(new ForbiddenException('x'));
    await expect(svc.archive(1, user)).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('bỏ lưu trữ: archivedAt = null + theo dõi lại + audit UNARCHIVE_FANPAGE', async () => {
    const { svc, repo, access, audit } = build();
    access.assertPageAccess.mockResolvedValue({ ...live, archivedAt: new Date(), isActive: false });
    await svc.unarchive(1, user);
    expect(repo.update).toHaveBeenCalledWith(1, { archivedAt: null, isActive: true });
    expect(audit.logActionAsync).toHaveBeenCalledWith(7, 'UNARCHIVE_FANPAGE', 'fanpage', 1, expect.any(Object), expect.any(Object));
  });

  it('bỏ lưu trữ Page chưa lưu trữ -> 409', async () => {
    const { svc, access } = build();
    access.assertPageAccess.mockResolvedValue(live);
    await expect(svc.unarchive(1, user)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('FanpagesService.list', () => {
  const mk = (id: number) => ({ id, name: `P${id}`, platformId: 1, isActive: true, healthStatus: { id: 1, name: 'Bình thường', color: '#52c41a', isBlocking: false }, owners: [] });

  it('không có quyền xem -> 403 và không chạm DB', async () => {
    const { svc, access, scoped } = build();
    access.resolveScopes.mockResolvedValue({ view: null, flagScopes: {}, managed: [] });
    await expect(svc.list(user, {})).rejects.toBeInstanceOf(ForbiddenException);
    expect(scoped.load).not.toHaveBeenCalled();
  });

  it('trả health thay cho quan hệ healthStatus + nhịp đăng/đếm bài + cờ quyền', async () => {
    const { svc, scoped } = build();
    scoped.load.mockResolvedValue([mk(1)]);
    const { data } = await svc.list(user, {});
    expect(data[0]).toEqual(expect.objectContaining({ id: 1, health: { id: 1, name: 'Bình thường', color: '#52c41a', isBlocking: false }, isTracked: true, isOrphan: false, posts30d: 0 }));
    expect(data[0]).not.toHaveProperty('healthStatus');
    expect(data[0]).toHaveProperty('cadence');
    expect(data[0]).toHaveProperty('flags');
  });

  it('lọc cadence SAU khi tính insights, không đẩy cadence xuống SQL', async () => {
    const { svc, scoped, insights } = build();
    scoped.load.mockResolvedValue([mk(1), mk(2), mk(3)]);
    const silent = { ...DEFAULT_INSIGHTS, cadence: { ...DEFAULT_INSIGHTS.cadence, state: 'silent' } };
    insights.forPages.mockResolvedValue(new Map([[1, silent], [2, DEFAULT_INSIGHTS], [3, silent]]) as never);
    const { data } = await svc.list(user, { cadence: 'silent', platformId: 2 });
    expect(data.map((r) => r.id)).toEqual([1, 3]);
    expect(scoped.load).toHaveBeenCalledWith(user, expect.anything(), { platformId: 2 });
  });
});
