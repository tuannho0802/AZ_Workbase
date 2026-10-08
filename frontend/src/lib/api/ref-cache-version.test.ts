import { describe, it, expect, beforeEach } from 'vitest';
import {
  bumpDomainNonce,
  noteMutationForRefCache,
  pathOf,
  readRefCacheState,
  refVersionFor,
  resetRefCacheState,
  writeRefCacheState,
} from './ref-cache-version';

describe('ref-cache-version', () => {
  beforeEach(() => resetRefCacheState());

  it('chỉ các đường dẫn danh mục được cache có version; đường khác (me, customers...) KHÔNG có', () => {
    for (const p of [
      '/departments', '/users/all', '/roles/colors', '/positions',
      '/customer-statuses', '/periodic-task-statuses', '/leave-types', '/media-sources', '/link-categories', '/link-groups',
    ]) {
      expect(refVersionFor(p, 7)).toBe('7.0.0.0');
    }
    for (const p of ['/users/me', '/roles/my-permissions', '/customers', '/link-groups/managed-by-me', '/link-groups/customer-counts', '/departments/public', '/users']) {
      expect(refVersionFor(p, 7)).toBeUndefined();
    }
  });

  it('danh mục mới dùng đúng domain refSig của nó (statuses đổi KHÔNG làm đổi khoá media-sources)', () => {
    writeRefCacheState({ sig: { customer_statuses: 1, media_sources: 1 }, epoch: 0 });
    const media = refVersionFor('/media-sources', 7);
    writeRefCacheState({ sig: { customer_statuses: 2, media_sources: 1 } });
    expect(refVersionFor('/media-sources', 7)).toBe(media);
    expect(refVersionFor('/customer-statuses', 7)).toBe('7.0.0.2');
  });

  it('mutation vào danh mục mới tăng nonce', () => {
    for (const p of ['/leave-types/3', '/media-sources', '/link-groups/5/managers', '/customer-statuses/1']) {
      expect(noteMutationForRefCache('PATCH', p)).toBe(true);
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

  it('guides: /guides và /guides/:slug có version, /guides/manage/* thì KHÔNG', () => {
    writeRefCacheState({ userId: 7, permSig: '3:employee:1:2:0', sig: {}, epoch: 0 });
    expect(refVersionFor('/guides', 7)).toBe('7.0.0.0.p3-employee-1-2-0');
    expect(refVersionFor('/guides/huong-dan-a', 7)).toBe('7.0.0.0.p3-employee-1-2-0');
    for (const p of ['/guides/manage/all', '/guides/manage/12', '/guides/a/b']) expect(refVersionFor(p, 7)).toBeUndefined();
  });

  it('domain theo quyền: permSig đổi -> khoá đổi; permSig của user khác không được dùng', () => {
    writeRefCacheState({ userId: 7, permSig: 'a', sig: {}, epoch: 0 });
    const v1 = refVersionFor('/utms/scoped', 7);
    writeRefCacheState({ permSig: 'b' });
    expect(refVersionFor('/utms/scoped', 7)).not.toBe(v1);
    expect(refVersionFor('/zk-device/attendance-summary', 8)).toBeUndefined(); // permSig của user 7, không dùng cho user 8
    // domain không phụ thuộc quyền thì permSig không ảnh hưởng
    expect(refVersionFor('/storage/usage', 7)).toBe('7.0.0.0');
  });

  it('mutation guides/utms/storage/zk-device chỉ đổi khoá của đúng domain, không đụng nonce chung', () => {
    writeRefCacheState({ userId: 7, permSig: 'a', sig: {}, epoch: 0 });
    const dept = refVersionFor('/departments', 7);
    const att = refVersionFor('/zk-device/attendance-logs', 7);
    expect(noteMutationForRefCache('POST', '/zk-device/sync')).toBe(true);
    expect(refVersionFor('/departments', 7)).toBe(dept);
    expect(refVersionFor('/zk-device/attendance-logs', 7)).not.toBe(att);
    const util = refVersionFor('/utms', 7);
    expect(noteMutationForRefCache('PATCH', '/utms/3')).toBe(true);
    expect(refVersionFor('/utms', 7)).not.toBe(util);
    expect(refVersionFor('/departments', 7)).toBe(dept);
  });

  it('bumpDomainNonce (nút Làm mới) đổi khoá domain đó', () => {
    writeRefCacheState({ userId: 7, permSig: 'a', sig: {}, epoch: 0 });
    const before = refVersionFor('/storage/usage', 7);
    bumpDomainNonce('storage');
    expect(refVersionFor('/storage/usage', 7)).not.toBe(before);
  });
});
