jest.mock('@vercel/functions', () => ({ waitUntil: jest.fn() }));

import {
  PermissionsVersionService,
  PERMISSIONS_VERSION_CACHE_TTL_MS,
  PERMISSIONS_VERSION_KEY,
  SYSTEM_EPOCH_KEY,
  REF_DATA_DOMAINS,
  refDataVersionKey,
} from './permissions-version.service';

const row = (key: string, value: string) => ({ key, value });
const perm = (value: string) => [row(PERMISSIONS_VERSION_KEY, value)];

describe('PermissionsVersionService', () => {
  const repo = { find: jest.fn(), findOne: jest.fn(), query: jest.fn() };
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

  it('single-flight: get/getRefSig/getEpoch gọi ĐỒNG THỜI -> chỉ 1 query settings', async () => {
    let release!: () => void;
    repo.find.mockImplementation(() => new Promise((resolve) => { release = () => resolve(perm('7')); }));
    const calls = Promise.all([service.get(), service.getRefSig(), service.getEpoch(), service.get(), service.getEpoch()]);
    await new Promise((r) => setImmediate(r));
    release();
    const [v, ref, epoch] = await calls;
    expect(repo.find).toHaveBeenCalledTimes(1);
    expect(v).toBe(7);
    expect(ref).toBeDefined();
    expect(epoch).toBe(0);
  });

  it('single-flight + bump: query đang bay lúc bump KHÔNG ghi đè cache (lần sau đọc lại DB)', async () => {
    let release!: () => void;
    repo.find.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve(perm('1')); }));
    const first = service.get();
    await new Promise((r) => setImmediate(r));
    service.bump();
    release();
    await first;
    repo.find.mockResolvedValueOnce(perm('2'));
    expect(await service.get()).toBe(2);
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

  describe('epoch (Reset hệ thống)', () => {
    it('chưa có dòng = 0; dùng CHUNG 1 query với permSig/refSig', async () => {
      repo.find.mockResolvedValue([]);
      expect(await service.getEpoch()).toBe(0);
      repo.find.mockResolvedValue([...perm('3'), row(SYSTEM_EPOCH_KEY, '6')]);
      service = new PermissionsVersionService(repo as any);
      expect(await service.getEpoch()).toBe(6);
      expect(await service.get()).toBe(3);
      expect(repo.find).toHaveBeenCalledTimes(2); // 1 lần ở service cũ + 1 lần ở service mới
    });

    it('lỗi DB -> getEpoch trả undefined, KHÔNG throw', async () => {
      repo.find.mockRejectedValue(new Error('db down'));
      await expect(service.getEpoch()).resolves.toBeUndefined();
    });

    it('epoch KHÔNG nằm trong permSig (Reset không kích hoạt luồng permSig)', async () => {
      repo.find.mockResolvedValue([...perm('3'), row(SYSTEM_EPOCH_KEY, '6')]);
      expect(await service.buildSig({ role: 'employee' })).toBe('3:employee:0:0:0');
    });

    it('bumpEpoch: upsert đúng key, trả giá trị mới đọc lại từ DB, xoá cache', async () => {
      repo.find.mockResolvedValueOnce([row(SYSTEM_EPOCH_KEY, '1')]).mockResolvedValueOnce([row(SYSTEM_EPOCH_KEY, '2')]);
      expect(await service.getEpoch()).toBe(1);
      repo.query.mockResolvedValue(undefined);
      repo.findOne.mockResolvedValue({ key: SYSTEM_EPOCH_KEY, value: '2', updatedAt: new Date() });
      await expect(service.bumpEpoch()).resolves.toBe(2);
      expect(repo.query.mock.calls[0][1][0]).toBe(SYSTEM_EPOCH_KEY);
      expect(repo.query.mock.calls[0][0]).toContain('ON DUPLICATE KEY UPDATE');
      expect(await service.getEpoch()).toBe(2); // cache đã bị xoá -> đọc lại DB
    });

    it('bumpEpoch lỗi DB -> THROW (khác bumpNow) để người bấm Reset biết thất bại', async () => {
      repo.query.mockRejectedValue(new Error('x'));
      await expect(service.bumpEpoch()).rejects.toThrow('x');
    });

    it('getEpochState: chưa có dòng -> {0, null}; có dòng -> giá trị + updatedAt', async () => {
      repo.findOne.mockResolvedValueOnce(null);
      await expect(service.getEpochState()).resolves.toEqual({ value: 0, updatedAt: null });
      const at = new Date();
      repo.findOne.mockResolvedValueOnce({ key: SYSTEM_EPOCH_KEY, value: '7', updatedAt: at });
      await expect(service.getEpochState()).resolves.toEqual({ value: 7, updatedAt: at });
    });
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
      expect(where.value).toEqual([PERMISSIONS_VERSION_KEY, SYSTEM_EPOCH_KEY, ...REF_DATA_DOMAINS.map(refDataVersionKey)]);
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
