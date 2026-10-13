import { describe, it, expect, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  clearPersistedQueryCache,
  hydratePersistedQueries,
  isPersistableQueryKey,
  PERSIST_MAX_AGE_MS,
  savePersistedQueries,
} from './query-persist';
import { resetRefCacheState, writeRefCacheState } from './api/ref-cache-version';

const KEY = 'az-rq-cache-v1';
const mk = () => new QueryClient();
const seed = (qc: QueryClient, key: unknown[], data: unknown, updatedAt = Date.now()) =>
  qc.setQueryData(key, data, { updatedAt });

describe('query-persist', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetRefCacheState();
  });

  it('whitelist: danh mục/quyền/me/mục lục guide; KHÔNG customers, tasks, nội dung guide, users khác', () => {
    expect(isPersistableQueryKey(['departments'])).toBe(true);
    expect(isPersistableQueryKey(['roles', 'colors'])).toBe(true);
    expect(isPersistableQueryKey(['media-sources', true])).toBe(true);
    expect(isPersistableQueryKey(['guides', 'list'])).toBe(true);
    expect(isPersistableQueryKey(['users', 'me'])).toBe(true);
    expect(isPersistableQueryKey(['my-permissions'])).toBe(true);
    expect(isPersistableQueryKey(['customers', { page: 1 }])).toBe(false);
    expect(isPersistableQueryKey(['periodic-tasks', {}])).toBe(false);
    expect(isPersistableQueryKey(['guides', 'detail', 'x'])).toBe(false);
    expect(isPersistableQueryKey(['roles'])).toBe(false);
    expect(isPersistableQueryKey(['users', 'all'])).toBe(false);
  });

  it('lưu rồi nạp lại: giữ nguyên dữ liệu và updatedAt gốc; chỉ nạp key whitelist', () => {
    const a = mk();
    const t = Date.now() - 60_000;
    seed(a, ['departments'], [{ id: 1 }], t);
    seed(a, ['customers', {}], [{ phone: '0901234567' }]);
    savePersistedQueries(a, 7);
    expect(window.localStorage.getItem(KEY)).not.toContain('0901234567');

    const b = mk();
    expect(hydratePersistedQueries(b, 7)).toBe(1);
    expect(b.getQueryData(['departments'])).toEqual([{ id: 1 }]);
    expect(b.getQueryState(['departments'])?.dataUpdatedAt).toBe(t);
    expect(b.getQueryData(['customers', {}])).toBeUndefined();
  });

  it('khác user -> không nạp và xoá blob', () => {
    const a = mk();
    seed(a, ['departments'], [1]);
    savePersistedQueries(a, 7);
    expect(hydratePersistedQueries(mk(), 8)).toBe(0);
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it('dấu đổi (refSig/permSig/epoch) giữa lúc lưu và lúc nạp -> bỏ hết', () => {
    const a = mk();
    seed(a, ['positions'], [1]);
    writeRefCacheState({ userId: 7, sig: { positions: 1 } });
    savePersistedQueries(a, 7);
    writeRefCacheState({ sig: { positions: 2 } }); // danh mục đổi khi đóng tab
    expect(hydratePersistedQueries(mk(), 7)).toBe(0);

    const c = mk();
    seed(c, ['positions'], [1]);
    savePersistedQueries(c, 7);
    writeRefCacheState({ permSig: 'abc' });
    expect(hydratePersistedQueries(mk(), 7)).toBe(0);
  });

  it('dấu không đổi -> nạp được (poll ghi lại cùng giá trị không làm mất cache)', () => {
    const a = mk();
    seed(a, ['positions'], [1]);
    writeRefCacheState({ userId: 7, sig: { positions: 1, utms: 3 }, epoch: 5 });
    savePersistedQueries(a, 7);
    writeRefCacheState({ userId: 7, sig: { utms: 3, positions: 1 }, epoch: 5 });
    expect(hydratePersistedQueries(mk(), 7)).toBe(1);
  });

  it('không lưu query đã invalidate (tránh lưu dữ liệu cũ kèm dấu mới)', async () => {
    const a = mk();
    seed(a, ['departments'], [1]);
    seed(a, ['positions'], [2]);
    await a.invalidateQueries({ queryKey: ['departments'], refetchType: 'none' });
    savePersistedQueries(a, 7);
    const b = mk();
    expect(hydratePersistedQueries(b, 7)).toBe(1);
    expect(b.getQueryData(['positions'])).toEqual([2]);
    expect(b.getQueryData(['departments'])).toBeUndefined();
  });

  it('quá tuổi tối đa -> không nạp; chưa quá thì nạp', () => {
    const a = mk();
    seed(a, ['departments'], [1], Date.now() - PERSIST_MAX_AGE_MS - 1000);
    seed(a, ['positions'], [2], Date.now() - PERSIST_MAX_AGE_MS + 60_000);
    savePersistedQueries(a, 7);
    const b = mk();
    expect(hydratePersistedQueries(b, 7)).toBe(1);
    expect(b.getQueryData(['positions'])).toEqual([2]);
  });

  it('userId chưa biết: không nạp, và lưu = xoá; blob hỏng/lệch version bị bỏ', () => {
    const a = mk();
    seed(a, ['departments'], [1]);
    savePersistedQueries(a, 7);
    expect(hydratePersistedQueries(mk(), undefined)).toBe(0);
    savePersistedQueries(a, undefined);
    expect(window.localStorage.getItem(KEY)).toBeNull();
    window.localStorage.setItem(KEY, '{hỏng');
    expect(hydratePersistedQueries(mk(), 7)).toBe(0);
    clearPersistedQueryCache();
  });
});
