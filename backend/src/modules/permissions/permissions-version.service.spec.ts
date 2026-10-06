jest.mock('@vercel/functions', () => ({ waitUntil: jest.fn() }));

import { PermissionsVersionService, PERMISSIONS_VERSION_CACHE_TTL_MS } from './permissions-version.service';

describe('PermissionsVersionService', () => {
  const repo = { findOne: jest.fn(), query: jest.fn() };
  let service: PermissionsVersionService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    service = new PermissionsVersionService(repo as any);
  });

  it('chưa có dòng settings -> version 0', async () => {
    repo.findOne.mockResolvedValue(null);
    expect(await service.get()).toBe(0);
  });

  it('cache đọc trong TTL, hết TTL thì đọc lại', async () => {
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValue(1000);
    repo.findOne.mockResolvedValue({ value: '4' });
    expect(await service.get()).toBe(4);
    expect(await service.get()).toBe(4);
    expect(repo.findOne).toHaveBeenCalledTimes(1);
    now.mockReturnValue(1000 + PERMISSIONS_VERSION_CACHE_TTL_MS + 1);
    await service.get();
    expect(repo.findOne).toHaveBeenCalledTimes(2);
  });

  it('lỗi DB -> trả undefined, KHÔNG throw, KHÔNG cache lỗi', async () => {
    repo.findOne.mockRejectedValueOnce(new Error('db down')).mockResolvedValueOnce({ value: '2' });
    expect(await service.get()).toBeUndefined();
    expect(await service.get()).toBe(2);
  });

  it('bumpNow chạy upsert tăng 1 và xoá cache để lần đọc sau lấy giá trị mới', async () => {
    repo.findOne.mockResolvedValueOnce({ value: '4' }).mockResolvedValueOnce({ value: '5' });
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
    repo.findOne.mockResolvedValue({ value: '7' });
    const base = await service.buildSig({ role: 'employee', departmentId: 1, positionId: 2 });
    expect(base).toBe('7:employee:1:2:0');
    expect(await service.buildSig({ role: 'manager', departmentId: 1, positionId: 2 })).not.toBe(base);
    expect(await service.buildSig({ role: 'employee', departmentId: 3, positionId: 2 })).not.toBe(base);
    expect(await service.buildSig({ role: 'employee', departmentId: 1, positionId: null })).not.toBe(base);
    expect(await service.buildSig({ role: 'employee', departmentId: 1, positionId: 2, isRootAdmin: true })).not.toBe(base);
  });

  it('buildSig trả undefined khi không đọc được version', async () => {
    repo.findOne.mockRejectedValue(new Error('x'));
    expect(await service.buildSig({ role: 'employee' })).toBeUndefined();
  });
});
