import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GUIDE_DEMOS, GuideDemoBlock } from '../guide-demos';
import { PERIODIC_TASK_AUDIT_ACTION_META } from '@/lib/types/periodic-task-audit.types';

describe('mẫu Lịch sử Công việc: đăng ký + render', () => {
  it.each(['task-audit-page', 'task-audit-cleanup'])('%s có trong GUIDE_DEMOS và render không lỗi', (id) => {
    expect(GUIDE_DEMOS.some((d) => d.id === id)).toBe(true);
    const { container } = render(<GuideDemoBlock id={id} />);
    expect(screen.queryByText(/Không có mẫu minh hoạ/)).toBeNull();
    expect(screen.queryByText(/Tham số không hợp lệ/)).toBeNull();
    expect(container.textContent?.length).toBeGreaterThan(10);
  });

  it('task-audit-page: đúng 4 cột và đánh dấu "Tuần này"', () => {
    render(<GuideDemoBlock id="task-audit-page" />);
    for (const t of ['Thời gian', 'Công việc', 'Người thực hiện', 'Hành động']) {
      expect(screen.getAllByText(t).length).toBeGreaterThan(0);
    }
    expect(screen.getByText('Tuần này')).toBeTruthy();
    expect(screen.getByText('Tuần 05/10 - 11/10/2026')).toBeTruthy();
  });

  it('task-audit-cleanup: cả hai hộp thoại bắt gõ XÁC NHẬN', () => {
    render(<GuideDemoBlock id="task-audit-cleanup" />);
    expect(screen.getAllByPlaceholderText('XÁC NHẬN')).toHaveLength(2);
  });

  it('mọi action dùng trong mẫu đều có nhãn thật', () => {
    for (const a of ['status_changed', 'checklist_item_added', 'locked', 'created', 'primary_assignee_changed']) {
      expect(PERIODIC_TASK_AUDIT_ACTION_META[a]).toBeTruthy();
    }
  });
});
