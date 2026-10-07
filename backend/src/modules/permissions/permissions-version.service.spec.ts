jest.mock('@vercel/functions', () => ({ waitUntil: jest.fn() }));

import {
  PermissionsVersionService,
  PERMISSIONS_VERSION_CACHE_TTL_MS,
  PERMISSIONS_VERSION_KEY,
  REF_DATA_DOMAINS,
  refDataVersionKey,
} from './permissions-version.service';

const row = (key: string, value: string) => ({ key, value });
const perm = (value: string) => [row(PERMISSIONS_VERSION_KEY, value)];

describe('PermissionsVersionService', () => {
  const repo = { find: jest.fn(), query: jest.fn() };
  let service: PermissionsVersionService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    service = new PermissionsVersionService(repo as any);
  });

  it('chưa có dòng settings -> version 0', async () => {
    repo.find.mockResolvedValue([]);
    expect(await service.get()).toBe(0);
  });

  it('cache đọc trong TTL, hết TTL thì đọc lại', async () => {
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValue(1000);
    repo.find.mockResolvedValue(perm('4'));
    expect(await service.get()).toBe(4);
    expect(await service.get()).toBe(4);
    expect(repo.find).toHaveBeenCalledTimes(1);
    now.mockReturnValue(1000 + PERMISSIONS_VERSION_CACHE_TTL_MS + 1);
    await service.get();
    expect(repo.find).toHaveBeenCalledTimes(2);
  });

  it('lỗi DB -> trả undefined, KHÔNG throw, KHÔNG cache lỗi', async () => {
    repo.find.mockRejectedValueOnce(new Error('db down')).mockResolvedValueOnce(perm('2'));
    expect(await service.get()).toBeUndefined();
    expect(await service.get()).toBe(2);
  });

  it('bumpNow chạy upsert tăng 1 và xoá cache để lần đọc sau lấy giá trị mới', async () => {
    repo.find.mockResolvedValueOnce(perm('4')).mockResolvedValueOnce(perm('5'));
    expect(await service.get()).toBe(4);
    repo.query.mockResolvedValue(undefined);
    await service.bumpNow();
    expect(repo.query).toHaveBeenCalledWith(expect.stringContaining('ON DUPLICATE KEY UPDATE'), expect.any(Array));
    expect(await service.get()).toBe(5);
  });

  it('bumpNow lỗi DB -> không throw', async () => {
    repo.query.mockRejectedValue(new Error('x'));
    await expect(service.bumpNow()).resolves.toBeUndefined();
  });

  it('buildSig đổi khi version, role, phòng ban, vị trí hoặc root-admin đổi', async () => {
    repo.find.mockResolvedValue(perm('7'));
    const base = await service.buildSig({ role: 'employee', departmentId: 1, positionId: 2 });
    expect(base).toBe('7:employee:1:2:0');
    expect(await service.buildSig({ role: 'manager', departmentId: 1, positionId: 2 })).not.toBe(base);
    expect(await service.buildSig({ role: 'employee', departmentId: 3, positionId: 2 })).not.toBe(base);
    expect(await service.buildSig({ role: 'employee', departmentId: 1, positionId: null })).not.toBe(base);
    expect(await service.buildSig({ role: 'employee', departmentId: 1, positionId: 2, isRootAdmin: true })).not.toBe(base);
  });

  it('buildSig trả undefined khi không đọc được version', async () => {
    repo.find.mockRejectedValue(new Error('x'));
    expect(await service.buildSig({ role: 'employee' })).toBeUndefined();
  });

  describe('refSig (9D)', () => {
    it('LUÔN đủ mọi domain; domain chưa có dòng = 0', async () => {
      repo.find.mockResolvedValue([row(refDataVersionKey('departments'), '7'), row(refDataVersionKey('roles'), '2')]);
      const sig = await service.getRefSig();
      expect(Object.keys(sig!).sort()).toEqual([...REF_DATA_DOMAINS].sort());
      expect(sig).toMatchObject({ departments: 7, roles: 2, positions: 0, media_sources: 0 });
    });

    it('permSig và refSig dùng CHUNG 1 query (không thêm lượt DB)', async () => {
      repo.find.mockResolvedValue([...perm('3'), row(refDataVersionKey('positions'), '5')]);
      expect(await service.buildSig({ role: 'employee' })).toBe('3:employee:0:0:0');
      expect((await service.getRefSig())!.positions).toBe(5);
      expect(await service.get()).toBe(3);
      expect(repo.find).toHaveBeenCalledTimes(1);
      // 1 query lọc đúng permissions_version + 7 key refdata (không quét cả bảng settings).
      const where = repo.find.mock.calls[0][0].where.key;
      expect(where.value).toEqual([PERMISSIONS_VERSION_KEY, ...REF_DATA_DOMAINS.map(refDataVersionKey)]);
    });

    it('lỗi DB -> getRefSig trả undefined, KHÔNG throw (poll vẫn chạy)', async () => {
      repo.find.mockRejectedValue(new Error('db down'));
      await expect(service.getRefSig()).resolves.toBeUndefined();
    });

    it('giá trị lạ/hỏng trong settings -> coi là 0', async () => {
      repo.find.mockResolvedValue([row(refDataVersionKey('departments'), 'abc')]);
      expect((await service.getRefSig())!.departments).toBe(0);
    });

    it('bumpRefNow: 1 câu upsert nhiều dòng, đúng key, khử trùng lặp, xoá cache', async () => {
      repo.find.mockResolvedValueOnce([row(refDataVersionKey('departments'), '1')]).mockResolvedValueOnce([row(refDataVersionKey('departments'), '2')]);
      expect((await service.getRefSig())!.departments).toBe(1);
      repo.query.mockResolvedValue(undefined);
      await service.bumpRefNow(['departments', 'positions', 'departments']);
      expect(repo.query).toHaveBeenCalledTimes(1);
      const [sql, params] = repo.query.mock.calls[0];
      expect(sql).toContain('ON DUPLICATE KEY UPDATE');
      expect(sql.match(/\(\?, \?, \?\)/g)).toHaveLength(2);
      expect(params.filter((_: string, i: number) => i % 3 === 0)).toEqual([refDataVersionKey('departments'), refDataVersionKey('positions')]);
      expect((await service.getRefSig())!.departments).toBe(2); // cache đã bị xoá -> đọc lại DB
    });

    it('bumpRef([]) không làm gì; bumpRefNow lỗi DB -> không throw', async () => {
      service.bumpRef([]);
      expect(repo.query).not.toHaveBeenCalled();
      repo.query.mockRejectedValue(new Error('x'));
      await expect(service.bumpRefNow(['roles'])).resolves.toBeUndefined();
    });

    it('bump quyền (permissions_version) KHÔNG đụng tới key refdata và ngược lại', async () => {
      repo.query.mockResolvedValue(undefined);
      await service.bumpNow();
      expect(repo.query.mock.calls[0][1][0]).toBe(PERMISSIONS_VERSION_KEY);
      await service.bumpRefNow(['leave_types']);
      expect(repo.query.mock.calls[1][1][0]).toBe(refDataVersionKey('leave_types'));
    });
  });
});
