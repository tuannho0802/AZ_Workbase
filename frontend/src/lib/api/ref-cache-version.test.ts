import { describe, it, expect, beforeEach } from 'vitest';
import {
  noteMutationForRefCache,
  pathOf,
  readRefCacheState,
  refVersionFor,
  resetRefCacheState,
  writeRefCacheState,
} from './ref-cache-version';

describe('ref-cache-version', () => {
  beforeEach(() => resetRefCacheState());

  it('chỉ 4 đường dẫn được cache có version; đường khác (me, customers...) KHÔNG có', () => {
    expect(refVersionFor('/departments', 7)).toBe('7.0.0.0');
    expect(refVersionFor('/users/all', 7)).toBe('7.0.0.0');
    expect(refVersionFor('/roles/colors', 7)).toBe('7.0.0.0');
    expect(refVersionFor('/positions', 7)).toBe('7.0.0.0');
    for (const p of ['/users/me', '/roles/my-permissions', '/customers', '/customer-statuses', '/departments/public', '/users']) {
      expect(refVersionFor(p, 7)).toBeUndefined();
    }
  });

  it('chưa biết user -> không gắn version (không cache nhầm giữa các tài khoản)', () => {
    expect(refVersionFor('/departments', undefined)).toBeUndefined();
  });

  it('version đổi khi refSig đúng domain / epoch / nonce / user đổi; domain khác đổi thì KHÔNG', () => {
    writeRefCacheState({ sig: { departments: 1, users: 1 }, epoch: 0 });
    const base = refVersionFor('/departments', 7);
    writeRefCacheState({ sig: { departments: 1, users: 2 }, epoch: 0 });
    expect(refVersionFor('/departments', 7)).toBe(base);
    expect(refVersionFor('/users/all', 7)).not.toBe(base);
    writeRefCacheState({ sig: { departments: 2, users: 2 } });
    expect(refVersionFor('/departments', 7)).not.toBe(base);
    const v2 = refVersionFor('/departments', 7);
    writeRefCacheState({ epoch: 1 });
    expect(refVersionFor('/departments', 7)).not.toBe(v2);
    expect(refVersionFor('/departments', 8)).not.toBe(refVersionFor('/departments', 7));
  });

  it('mutation thành công vào danh mục -> tăng nonce; GET hoặc đường khác thì không', () => {
    expect(noteMutationForRefCache('get', '/departments')).toBe(false);
    expect(noteMutationForRefCache('post', '/customers')).toBe(false);
    expect(noteMutationForRefCache('patch', '/users-other')).toBe(false);
    expect(readRefCacheState().nonce).toBe(0);
    const before = refVersionFor('/users/all', 7);
    expect(noteMutationForRefCache('PATCH', '/departments/3')).toBe(true);
    expect(noteMutationForRefCache('post', '/users')).toBe(true);
    expect(readRefCacheState().nonce).toBe(2);
    expect(refVersionFor('/users/all', 7)).not.toBe(before);
  });

  it('mốc được lưu qua localStorage (F5 giữ nguyên)', () => {
    writeRefCacheState({ userId: 7, sig: { departments: 5 }, epoch: 2, nonce: 3 });
    expect(JSON.parse(window.localStorage.getItem('az-ref-cache-state')!)).toMatchObject({ userId: 7, epoch: 2, nonce: 3 });
    expect(readRefCacheState().sig.departments).toBe(5);
  });

  it('pathOf bỏ query', () => {
    expect(pathOf('/users/all?role=x')).toBe('/users/all');
    expect(pathOf(undefined)).toBe('');
  });
});
