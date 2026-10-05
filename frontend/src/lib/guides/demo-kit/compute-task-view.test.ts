import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEMO_TASKS, DEMO_TODAY } from './sample-tasks';
import { TASK_PERSONAS, findTaskPersona } from './task-personas';
import { TASK_ACTION, canDeleteTask, canSeeTask, computeTaskPageView, computeTaskRowActions } from './compute-task-view';
import { canMarkOverdue, canUnmarkOverdue } from '@/lib/utils/periodicTaskOverdue';
import { REPO_ROOT } from '../testing/repo-files';

const P = (id: string) => findTaskPersona(id)!;
const T = (id: number) => DEMO_TASKS.find((t) => t.id === id)!;
const ids = (id: string) => computeTaskPageView(DEMO_TASKS, P(id)).rows.map((t) => t.id);
const overdue = (t: (typeof DEMO_TASKS)[number]) => canMarkOverdue(t, DEMO_TODAY) || canUnmarkOverdue(t);
const actions = (personaId: string, taskId: number) => computeTaskRowActions(T(taskId), P(personaId), overdue(T(taskId)));

describe('computeTaskPageView - việc thấy theo phạm vi (đối chiếu PeriodicTaskAccessHelper.applyViewFilter)', () => {
  it('Admin/Assistant (all): thấy tất cả 10 việc', () => {
    expect(ids('admin')).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(ids('assistant')).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
  it('Manager (department): CHỈ phòng ban mình quản lý (Kinh doanh 1), không cộng việc riêng như Khách hàng', () => {
    expect(ids('manager')).toEqual([1, 2, 3, 4, 7, 9]);
  });
  it('Employee (own): việc mình tạo / Phụ trách chính / Phụ trách phụ', () => {
    expect(ids('employee-primary')).toEqual([1, 3, 7]); // An: tạo+chính #1, phụ #3, chính #7
    expect(ids('employee-secondary')).toEqual([1, 2, 3, 9]); // Bình: phụ #1, chính #2, phụ #3, chính #9
  });
  it('Employee chưa được giao: danh sách trống nhưng vẫn có nút Tạo', () => {
    const v = computeTaskPageView(DEMO_TASKS, P('employee-unassigned'));
    expect(v.rows).toEqual([]);
    expect(v.toolbar).toEqual(['Tạo Công việc mới']);
  });
  it('thiếu periodic_tasks.view: không vào được trang, không thấy gì', () => {
    const v = computeTaskPageView(DEMO_TASKS, P('no-permission'));
    expect(v.canViewPage).toBe(false);
    expect(v.rows).toEqual([]);
    expect(v.tabs).toEqual([]);
    expect(v.toolbar).toEqual([]);
  });
  it('tab Thùng rác chỉ có khi trash_manage (mặc định chỉ Admin)', () => {
    for (const p of TASK_PERSONAS) {
      const has = computeTaskPageView(DEMO_TASKS, p).tabs.includes('Thùng rác');
      expect(has).toBe(p.id === 'admin');
    }
  });
  it('canSeeTask khớp computeTaskPageView', () => {
    for (const p of TASK_PERSONAS) {
      expect(DEMO_TASKS.filter((t) => canSeeTask(t, p)).map((t) => t.id)).toEqual(ids(p.id));
    }
  });
});

describe('computeTaskRowActions - nút theo quyền', () => {
  it('Liên kết / Checklist / Lịch sử luôn hiện', () => {
    for (const p of TASK_PERSONAS.filter((x) => x.id !== 'no-permission')) {
      const v = actions(p.id, 1).visible;
      for (const a of [TASK_ACTION.link, TASK_ACTION.checklist, TASK_ACTION.audit]) expect(v).toContain(a);
    }
  });
  it('Khoá/Mở khoá chỉ có approve; Employee không có', () => {
    expect(actions('admin', 1).visible).toContain(TASK_ACTION.lock);
    expect(actions('assistant', 1).visible).toContain(TASK_ACTION.lock);
    expect(actions('manager', 1).visible).toContain(TASK_ACTION.lock);
    expect(actions('employee-primary', 1).visible).not.toContain(TASK_ACTION.lock);
    expect(actions('admin', 9).visible).toContain(TASK_ACTION.unlock);
    expect(actions('admin', 9).visible).not.toContain(TASK_ACTION.lock);
  });
  it('Sửa việc đang khoá: hiện nhưng bị vô hiệu nếu thiếu edit_locked (chỉ Admin có)', () => {
    expect(actions('admin', 9).disabled).toEqual([]);
    for (const id of ['assistant', 'manager']) {
      expect(actions(id, 9).visible).toContain(TASK_ACTION.edit);
      expect(actions(id, 9).disabled).toEqual([TASK_ACTION.edit]);
    }
    expect(actions('employee-secondary', 9).disabled).toEqual([TASK_ACTION.edit]);
  });
  it('khoá tự động (không có người khoá) cũng chặn Sửa như khoá thủ công', () => {
    expect(T(8).isLocked).toBe(true);
    expect(T(8).lockedById).toBeNull();
    expect(actions('assistant', 8).disabled).toEqual([TASK_ACTION.edit]);
  });
  it('Xoá mặc định chỉ Admin; Assistant/Manager/Employee không có nút Xoá', () => {
    expect(actions('admin', 1).visible).toContain(TASK_ACTION.delete);
    for (const id of ['assistant', 'manager', 'employee-primary']) expect(actions(id, 1).visible).not.toContain(TASK_ACTION.delete);
  });
  it('Xoá phạm vi "own" (cấu hình): chỉ việc mình tạo hoặc Phụ trách chính, KHÔNG phải Phụ trách phụ', () => {
    const p = P('employee-delete-own'); // Sales Bình id 5
    expect(canDeleteTask(T(2), p)).toBe(true); // chính #2
    expect(canDeleteTask(T(9), p)).toBe(true); // chính #9
    expect(canDeleteTask(T(1), p)).toBe(false); // chỉ là phụ #1
    expect(canDeleteTask(T(3), p)).toBe(false); // chỉ là phụ #3
  });
  it('nút Khách hàng cần customers.view VÀ việc có khách liên kết (không cần link_customer)', () => {
    expect(T(1).customerCount).toBeGreaterThan(0);
    expect(actions('employee-primary', 1).visible).toContain(TASK_ACTION.customers); // Employee không có link_customer
    expect(actions('admin', 2).visible).not.toContain(TASK_ACTION.customers); // việc #2 không có khách
    const noCustomers = { ...P('admin'), permissions: P('admin').permissions.filter((k) => k !== 'customers.view') };
    expect(computeTaskRowActions(T(1), noCustomers, false).visible).not.toContain(TASK_ACTION.customers);
  });
  it('nút quá hạn: chỉ khi có approve và việc đủ điều kiện (đúng hàm thật với "hôm nay" cố định)', () => {
    expect(actions('admin', 6).visible).toContain(TASK_ACTION.overdue); // quá kỳ, trong ân hạn
    expect(actions('admin', 7).visible).toContain(TASK_ACTION.overdue); // đã đánh dấu -> Gỡ
    expect(actions('admin', 1).visible).not.toContain(TASK_ACTION.overdue); // chưa tới hạn
    expect(actions('employee-primary', 7).visible).not.toContain(TASK_ACTION.overdue);
  });
});

describe('sample-tasks: đủ tình huống như plan §2.7', () => {
  it('có 4 loại kỳ, nhiều trạng thái, khoá thủ công + tự động, checklist, khách liên kết, nhiều người, ≥ 2 phòng ban', () => {
    expect(new Set(DEMO_TASKS.map((t) => t.periodType))).toEqual(new Set(['daily', 'weekly', 'monthly', 'yearly']));
    expect(new Set(DEMO_TASKS.map((t) => t.status?.code)).size).toBeGreaterThanOrEqual(4);
    expect(DEMO_TASKS.some((t) => t.isLocked && t.lockedById != null)).toBe(true);
    expect(DEMO_TASKS.some((t) => t.isLocked && t.lockedById == null)).toBe(true);
    expect(DEMO_TASKS.some((t) => t.checklistProgress)).toBe(true);
    expect(DEMO_TASKS.some((t) => (t.customerCount ?? 0) > 0)).toBe(true);
    expect(DEMO_TASKS.some((t) => (t.secondaryAssignees ?? []).length > 0)).toBe(true);
    expect(new Set(DEMO_TASKS.map((t) => t.departmentId)).size).toBeGreaterThanOrEqual(2);
  });
});

/** Đối chiếu persona với SEED thật trong migration (text) - đổi seed mà quên sửa persona -> đỏ. */
describe('persona ↔ seed migration', () => {
  const mig = (name: string) => fs.readFileSync(path.join(REPO_ROOT, 'backend/src/database/migrations', name), 'utf8');
  const scopeOf = (id: string, key: string) => P(id).scopes[key];

  it('1782100000000: view/create/edit = admin+assistant all, manager department, employee own', () => {
    const src = mig('1782100000000-SeedPeriodicTasksPermissions.ts');
    expect(src).toMatch(/WHEN 'admin' THEN 'all'\s+WHEN 'assistant' THEN 'all'\s+WHEN 'manager' THEN 'department'\s+WHEN 'employee' THEN 'own'/);
    for (const key of ['periodic_tasks.view', 'periodic_tasks.create', 'periodic_tasks.edit']) {
      expect(scopeOf('admin', key)).toBe('all');
      expect(scopeOf('assistant', key)).toBe('all');
      expect(scopeOf('manager', key)).toBe('department');
      expect(scopeOf('employee-primary', key)).toBe('own');
    }
  });
  it('1782100000000: delete mặc định chỉ admin (scope all)', () => {
    expect(mig('1782100000000-SeedPeriodicTasksPermissions.ts')).toMatch(/r\.code = 'admin' AND p\.\\`key\\` = 'periodic_tasks\.delete'/);
    expect(scopeOf('admin', 'periodic_tasks.delete')).toBe('all');
    for (const id of ['assistant', 'manager', 'employee-primary']) expect(P(id).permissions).not.toContain('periodic_tasks.delete');
  });
  it('1782600000000: approve = admin+assistant all + manager department; edit_locked chỉ admin', () => {
    const src = mig('1782600000000-AddPeriodicTaskLockColumns.ts');
    expect(src).toMatch(/WHEN 'admin' THEN 'all'\s+WHEN 'assistant' THEN 'all'\s+WHEN 'manager' THEN 'department'/);
    expect(src).toMatch(/r\.code = 'admin' AND p\.\\`key\\` = 'periodic_tasks\.edit_locked'/);
    expect(scopeOf('admin', 'periodic_tasks.approve')).toBe('all');
    expect(scopeOf('assistant', 'periodic_tasks.approve')).toBe('all');
    expect(scopeOf('manager', 'periodic_tasks.approve')).toBe('department');
    expect(P('employee-primary').permissions).not.toContain('periodic_tasks.approve');
    for (const p of TASK_PERSONAS) expect(p.permissions.includes('periodic_tasks.edit_locked')).toBe(p.id === 'admin');
  });
  it('1782400000000: link_customer = admin + assistant', () => {
    expect(mig('1782400000000-CreatePeriodicTaskCustomers.ts')).toMatch(/r\.code IN \('admin', 'assistant'\) AND p\.\\`key\\` = 'periodic_tasks\.link_customer'/);
    for (const p of TASK_PERSONAS) expect(p.permissions.includes('periodic_tasks.link_customer')).toBe(['admin', 'assistant'].includes(p.id));
  });
  it('1784300000000: trash_manage chỉ admin', () => {
    expect(mig('1784300000000-SeedPeriodicTasksTrashManagePermission.ts')).toMatch(/r\.code = 'admin'/);
    for (const p of TASK_PERSONAS) expect(p.permissions.includes('periodic_tasks.trash_manage')).toBe(p.id === 'admin');
  });
  it('1783200000000: audit_view sao chép từ view (cùng scope)', () => {
    expect(mig('1783200000000-SplitPeriodicTasksAuditViewPermission.ts')).toMatch(/permission_id = \(SELECT id FROM permissions WHERE \\`key\\` = 'periodic_tasks\.view'\)/);
    for (const p of TASK_PERSONAS.filter((x) => x.permissions.includes('periodic_tasks.view'))) {
      expect(p.scopes['periodic_tasks.audit_view']).toBe(p.scopes['periodic_tasks.view']);
    }
  });
});
