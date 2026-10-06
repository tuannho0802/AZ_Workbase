import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TaskMiniCardView } from './TaskMiniCard';
import type { PeriodicTask } from '@/lib/api/periodic-tasks.api';

// Hạn kỳ rất xa trong quá khứ -> luôn đủ 3 ngày quá hạn bất kể ngày chạy test.
const overdueTask = {
  id: 1,
  title: 'Việc trễ',
  periodType: 'daily',
  periodStartDate: '2020-01-01',
  periodEndDate: '2020-01-02',
  status: { id: 1, code: 'in_progress', name: 'Đang làm', color: '#1677ff', isDoneState: false },
  overdueMarkedAt: null,
} as unknown as PeriodicTask;

const doneTask = { ...overdueTask, status: { ...overdueTask.status, code: 'completed', name: 'Hoàn thành', isDoneState: true } } as PeriodicTask;

describe('TaskMiniCard - cờ Quá hạn ở mọi mật độ (kể cả thu gọn)', () => {
  it.each(['full', 'compact', 'mini'] as const)('density=%s + flagOverdue -> hiện cờ "Quá hạn"', (density) => {
    render(<TaskMiniCardView task={overdueTask} density={density} flagOverdue assigneesSlot={<span />} />);
    expect(screen.getByText(/Quá hạn \d+ ngày/)).toBeTruthy();
  });

  it('không bật flagOverdue -> không hiện cờ tự động (giữ hành vi cũ)', () => {
    render(<TaskMiniCardView task={overdueTask} density="mini" assigneesSlot={<span />} />);
    expect(screen.queryByText(/Quá hạn/)).toBeNull();
  });

  it('Task đã Hoàn thành (completed) -> không cờ', () => {
    render(<TaskMiniCardView task={doneTask} density="mini" flagOverdue assigneesSlot={<span />} />);
    expect(screen.queryByText(/Quá hạn/)).toBeNull();
  });
});
