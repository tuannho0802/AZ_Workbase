import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { GUIDE_DEMOS, GuideDemoBlock } from '../guide-demos';
import { DemoActionsBar } from './periodic-tasks.demos';
import { DEMO_TASKS, DEMO_TODAY } from '../demo-kit/sample-tasks';
import { TASK_PERSONAS } from '../demo-kit/task-personas';
import { TASK_ACTION, computeTaskRowActions } from '../demo-kit/compute-task-view';
import { canMarkOverdue, canUnmarkOverdue } from '@/lib/utils/periodicTaskOverdue';

const TASK_DEMO_IDS = [
  'task-by-viewer',
  'task-actions-by-viewer',
  'task-kanban',
  'task-calendar',
  'task-agenda',
  'period-type-tags',
  'task-status-tags',
  'task-assignees',
  'task-checklist',
  'task-audit-row',
];

describe('mẫu Công việc định kỳ: đăng ký + render', () => {
  it('đủ 10 mẫu trong GUIDE_DEMOS', () => {
    const ids = new Set(GUIDE_DEMOS.map((d) => d.id));
    for (const id of TASK_DEMO_IDS) expect(ids.has(id)).toBe(true);
  });
  it.each(TASK_DEMO_IDS)('render %s không lỗi', (id) => {
    const { container } = render(<GuideDemoBlock id={id} />);
    expect(screen.queryByText(/Không có mẫu minh hoạ/)).toBeNull();
    expect(screen.queryByText(/Tham số không hợp lệ/)).toBeNull();
    expect(container.textContent?.length).toBeGreaterThan(10);
  });
});

describe('task-by-viewer: đổi persona đổi danh sách + nút', () => {
  const rowCount = () => document.querySelectorAll('.ant-table-row').length;

  it('Admin thấy 10 việc, có "Tạo Công việc mới" và tab Thùng rác; đổi sang Manager còn 6 việc, mất Thùng rác', () => {
    render(<GuideDemoBlock id="task-by-viewer" params={{ persona: 'admin' }} />);
    expect(rowCount()).toBe(10);
    expect(screen.getByText('Tạo Công việc mới')).toBeTruthy();
    expect(screen.getAllByText('Thùng rác').length).toBeGreaterThan(0);

    fireEvent.click(within(screen.getByTestId('guide-demo-controls')).getByText('Manager'));
    expect(rowCount()).toBe(6);
    expect(screen.queryByText('Thùng rác')).toBeNull();
  });
  it('Employee chưa được giao: bảng trống; thiếu quyền Xem: không có bảng', () => {
    render(<GuideDemoBlock id="task-by-viewer" params={{ persona: 'employee-unassigned' }} />);
    expect(rowCount()).toBe(0);
    expect(screen.getByText('Không có Công việc nào trong phạm vi của bạn')).toBeTruthy();
    fireEvent.click(within(screen.getByTestId('guide-demo-controls')).getByText('Thiếu quyền Xem'));
    expect(document.querySelector('.ant-table')).toBeNull();
    expect(screen.queryByText('Tạo Công việc mới')).toBeNull();
  });
  it('tham số persona ngoài whitelist -> cảnh báo', () => {
    render(<GuideDemoBlock id="task-by-viewer" params={{ persona: 'hacker' }} />);
    expect(screen.getByText(/Tham số không hợp lệ/)).toBeTruthy();
  });
});

/** CHỐNG DRIFT: nút do `TaskActionsBar` THẬT vẽ ra phải khớp danh sách `computeTaskRowActions` (nguồn cho ma trận + bài viết). */
describe('DemoActionsBar (component thật) ↔ computeTaskRowActions', () => {
  const normalize = (text: string): string => {
    const t = text.trim();
    if (t.startsWith('Checklist')) return TASK_ACTION.checklist;
    if (t.startsWith('Khách hàng')) return TASK_ACTION.customers;
    if (t.startsWith('Đánh dấu quá hạn') || t.startsWith('Gỡ quá hạn')) return TASK_ACTION.overdue;
    return t;
  };
  const cases = TASK_PERSONAS.filter((p) => p.id !== 'no-permission').flatMap((p) => DEMO_TASKS.map((t) => [p.id, t.id] as const));

  it.each(cases)('persona %s - việc #%i', (personaId, taskId) => {
    const task = DEMO_TASKS.find((t) => t.id === taskId)!;
    const persona = TASK_PERSONAS.find((p) => p.id === personaId)!;
    const { container, unmount } = render(<DemoActionsBar task={task} personaId={personaId} />);
    const buttons = [...container.querySelectorAll('button')];
    const rendered = buttons.map((b) => normalize(b.textContent ?? ''));
    const expected = computeTaskRowActions(task, persona, canMarkOverdue(task, DEMO_TODAY) || canUnmarkOverdue(task));
    expect(rendered).toEqual(expected.visible);
    const disabled = buttons.filter((b) => b.disabled).map((b) => normalize(b.textContent ?? ''));
    expect(disabled).toEqual(expected.disabled);
    unmount();
  });
});
