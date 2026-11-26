import { describe, expect, it } from 'vitest';
import { buildCopyDraftPermissions, mergeGlobalWithOverride } from './override-utils';

const global = [
  { permissionKey: 'customers.view', scope: 'all' as const },
  { permissionKey: 'customers.assign', scope: 'own' as const },
  { permissionKey: 'tasks.create', scope: null },
];

describe('buildCopyDraftPermissions (quyền hiệu lực của nguồn)', () => {
  it('nguồn chưa override -> lấy đúng Toàn cục của role nguồn', () => {
    expect(buildCopyDraftPermissions(global, undefined)).toEqual(global);
  });

  it('áp override: đổi scope, thêm quyền, và scope "none" gỡ quyền Toàn cục', () => {
    const res = buildCopyDraftPermissions(global, [
      { permissionKey: 'customers.view', scope: 'department' },
      { permissionKey: 'customers.assign', scope: 'none' },
      { permissionKey: 'reports.view', scope: 'all' },
    ]);
    expect(res).toEqual([
      { permissionKey: 'customers.view', scope: 'department' },
      { permissionKey: 'tasks.create', scope: null },
      { permissionKey: 'reports.view', scope: 'all' },
    ]);
  });

  it('không bao giờ để lọt scope "none" vào bản nháp', () => {
    const res = buildCopyDraftPermissions(global, [{ permissionKey: 'tasks.create', scope: 'none' }]);
    expect(res.some((p) => p.scope === 'none')).toBe(false);
  });

  it('không làm biến đổi mảng đầu vào', () => {
    const snapshot = JSON.stringify(global);
    mergeGlobalWithOverride(global, [{ permissionKey: 'customers.view', scope: 'none' }]);
    expect(JSON.stringify(global)).toBe(snapshot);
  });
});
