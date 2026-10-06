import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GUIDE_DEMOS, GuideDemoBlock } from '../guide-demos';
import { DEMO_PERFORMANCE_ROWS, rowsForScope } from './task-performance.demos';
import { DEMO_TASKS } from '../demo-kit/sample-tasks';
import { aggregateRows } from '@/lib/utils/periodicTaskPerformance';

describe('mẫu Hiệu suất công việc: đăng ký + render', () => {
  it.each(['performance-page', 'performance-chart', 'own-performance'])('%s có trong GUIDE_DEMOS và render không lỗi', (id) => {
    expect(GUIDE_DEMOS.some((d) => d.id === id)).toBe(true);
    const { container } = render(<GuideDemoBlock id={id} />);
    expect(screen.queryByText(/Không có mẫu minh hoạ/)).toBeNull();
    expect(screen.queryByText(/Tham số không hợp lệ/)).toBeNull();
    expect(container.textContent?.length).toBeGreaterThan(10);
  });

  it('performance-page: nhận đúng 3 giá trị scope, giá trị lạ hiện khung cảnh báo', () => {
    for (const scope of ['own', 'department', 'all']) {
      const { unmount } = render(<GuideDemoBlock id="performance-page" params={{ scope }} />);
      expect(screen.queryByText(/Tham số không hợp lệ/)).toBeNull();
      unmount();
    }
    render(<GuideDemoBlock id="performance-page" params={{ scope: 'root' }} />);
    expect(screen.getByText(/Tham số không hợp lệ/)).toBeTruthy();
  });

  it('performance-page scope=own: chỉ 1 dòng, có thông báo thiếu quyền, không có ô lọc người khác', () => {
    render(<GuideDemoBlock id="performance-page" params={{ scope: 'own' }} />);
    expect(screen.getByText(/chưa được cấp quyền xem hiệu suất của người khác/)).toBeTruthy();
    expect(screen.getAllByText('Sales An').length).toBeGreaterThan(0);
    expect(screen.queryByText('Sales Bình')).toBeNull();
    expect(screen.queryByText('Phụ trách chính...')).toBeNull();
    expect(screen.getByText(/Đang xem: Chỉ của tôi/)).toBeTruthy();
  });

  it('performance-page scope=all: đủ 5 nhân viên và tên 9 thẻ đúng chữ trên trang thật', () => {
    render(<GuideDemoBlock id="performance-page" params={{ scope: 'all' }} />);
    for (const n of ['Sales An', 'Sales Bình', 'Quản lý Nam', 'Sales Dũng', 'Marketing Mai']) {
      expect(screen.getAllByText(n).length).toBeGreaterThan(0);
    }
    for (const t of ['Tổng Task phụ trách chính', 'Tổng Task phụ trách phụ', '% Hoàn thành', '% Xong muộn', 'Quá hạn chưa xong', 'Checklist Task phụ trách chính', 'Checklist Task phụ trách phụ', '% Đang làm', '% Đang xem xét']) {
      expect(screen.getAllByText(t).length).toBeGreaterThan(0);
    }
    expect(screen.getByText(/Đang xem: Toàn bộ · 5 nhân viên/)).toBeTruthy();
  });

  it('performance-page: đổi bộ chọn phạm vi thì đổi số nhân viên', () => {
    render(<GuideDemoBlock id="performance-page" params={{ scope: 'all' }} />);
    fireEvent.click(screen.getByText('Theo phòng ban'));
    expect(screen.getByText(/Đang xem: Phòng ban của tôi · 3 nhân viên/)).toBeTruthy();
    expect(screen.queryByText('Sales Dũng')).toBeNull();
  });

  it('own-performance: Sales An có 2 việc Phụ trách chính và 1 việc Phụ trách phụ', () => {
    render(<GuideDemoBlock id="own-performance" />);
    expect(screen.getByText('Phụ trách chính (2)')).toBeTruthy();
    expect(screen.getByText('Phụ trách phụ (1)')).toBeTruthy();
    expect(screen.getByText('Chi tiết công việc của tôi')).toBeTruthy();
  });
});

describe('dữ liệu mẫu Hiệu suất nhất quán', () => {
  it('mỗi người: Tổng = Đúng hạn + Xong muộn + Quá hạn + Đang trong hạn', () => {
    for (const r of DEMO_PERFORMANCE_ROWS) {
      expect(r.total).toBe(r.completedOnTime + r.completedLate + r.overdueNotCompleted + r.pendingFuture);
    }
  });

  it('% khớp công thức BE: hoàn thành = (đúng+muộn)/tổng; xong muộn = muộn/(đúng+muộn)', () => {
    const an = DEMO_PERFORMANCE_ROWS.find((r) => r.userId === 4)!;
    expect(an.completionRatePercent).toBe(Math.round((6 / 8) * 1000) / 10);
    expect(an.lateRatePercent).toBe(Math.round((1 / 6) * 1000) / 10);
  });

  it('thẻ cộng số đếm rồi tính lại %, không trung bình các %', () => {
    const t = aggregateRows(DEMO_PERFORMANCE_ROWS);
    const completed = DEMO_PERFORMANCE_ROWS.reduce((a, r) => a + r.completedOnTime + r.completedLate, 0);
    const total = DEMO_PERFORMANCE_ROWS.reduce((a, r) => a + r.total, 0);
    expect(t.completionRatePercent).toBe(Math.round((completed / total) * 1000) / 10);
  });

  it('phạm vi: own = 1 người, department = 3 người Kinh doanh 1, all = 5', () => {
    expect(rowsForScope('own').map((r) => r.userId)).toEqual([4]);
    expect(rowsForScope('department').map((r) => r.userId).sort()).toEqual([3, 4, 5]);
    expect(rowsForScope('all')).toHaveLength(5);
  });

  it('mọi nhân viên mẫu có trong bộ người mẫu của Công việc', () => {
    const names = new Set(DEMO_TASKS.flatMap((t) => [t.primaryAssignee?.name, ...(t.secondaryAssignees ?? []).map((u) => u.name)]));
    for (const r of DEMO_PERFORMANCE_ROWS) expect(names.has(r.userName)).toBe(true);
  });
});
