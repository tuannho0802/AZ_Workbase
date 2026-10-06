import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { GUIDE_DEMOS, GuideDemoBlock } from './guide-demos';
import { DemoFrame } from './demo-kit/DemoFrame';

describe('GuideDemoBlock - tham số & persona', () => {
  it('id lạ -> cảnh báo', () => {
    render(<GuideDemoBlock id="khong-co" />);
    expect(screen.getByText(/Không có mẫu minh hoạ/)).toBeTruthy();
  });

  it('tham số lạ / giá trị ngoài whitelist -> cảnh báo, không render bảng', () => {
    const { unmount } = render(<GuideDemoBlock id="customer-table-by-viewer" params={{ persona: 'hacker' }} />);
    expect(screen.getByText(/Tham số không hợp lệ/)).toBeTruthy();
    expect(screen.queryByTestId('guide-demo')).toBeNull();
    unmount();
    render(<GuideDemoBlock id="status-tags" params={{ persona: 'admin' }} />);
    expect(screen.getByText(/không nhận tham số/)).toBeTruthy();
  });

  it('token sai cú pháp -> cảnh báo', () => {
    render(<GuideDemoBlock id="status-tags" invalid={['x=<b>']} />);
    expect(screen.getByText(/Tham số không hợp lệ/)).toBeTruthy();
  });

  it('bảng theo người xem: Admin có cột Thao tác, đổi sang Content thì mất cột Sales và Thao tác', () => {
    render(<GuideDemoBlock id="customer-table-by-viewer" params={{ persona: 'admin' }} />);
    expect(screen.getAllByText('Thao tác').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sales (Chính + Phụ)').length).toBeGreaterThan(0);

    const controls = screen.getByTestId('guide-demo-controls');
    fireEvent.click(within(controls).getByText('Content (ví dụ ẩn cột)'));
    expect(screen.queryByText('Thao tác')).toBeNull();
    expect(screen.queryByText('Sales (Chính + Phụ)')).toBeNull();
    expect(screen.getAllByText('Trạng thái').length).toBeGreaterThan(0);
  });

  it('vùng mẫu KHÔNG inert (cuộn/rê chuột được) và bảng có thanh cuộn ngang riêng', () => {
    const { container } = render(<GuideDemoBlock id="customer-table-by-viewer" />);
    const body = screen.getByTestId('guide-demo-body');
    expect(body.closest('[inert]')).toBeNull();
    expect(screen.getByTestId('guide-demo-controls').closest('[inert]')).toBeNull();
    expect(container.querySelector('[inert]')).toBeNull();
    // antd Table với scroll.x -> có vùng cuộn riêng (kéo thanh cuộn ngang được vì không bị inert)
    expect(body.querySelector('.ant-table-content')).not.toBeNull();
  });

  it('bấm thử không có tác dụng thật: link không điều hướng, form không submit', () => {
    render(
      <DemoFrame title="t">
        <a href="/khac" data-testid="lk">
          link
        </a>
        <form data-testid="fm">
          <button type="submit">gửi</button>
        </form>
      </DemoFrame>,
    );
    expect(fireEvent.click(screen.getByTestId('lk'))).toBe(false); // false = đã preventDefault
    expect(fireEvent.submit(screen.getByTestId('fm'))).toBe(false);
  });

  it('tick ô chọn dòng trong mẫu hoạt động được (tương tác để xem, không lưu gì)', () => {
    render(<GuideDemoBlock id="customer-table-by-viewer" params={{ persona: 'manager' }} />);
    const boxes = screen.getAllByRole('checkbox');
    const rowBox = boxes[boxes.length - 1] as HTMLInputElement; // ô chọn của 1 dòng dữ liệu
    expect(rowBox.checked).toBe(false);
    fireEvent.click(rowBox);
    expect(rowBox.checked).toBe(true);
  });

  it('customer-table cũ vẫn dùng được, không có bộ chọn vai trò', () => {
    render(<GuideDemoBlock id="customer-table" />);
    expect(screen.queryByTestId('guide-demo-controls')).toBeNull();
    expect(screen.getAllByText('Ghi chú gần nhất').length).toBeGreaterThan(0);
  });

  it('giữ nguyên 9 id cũ (bài đã viết không vỡ) + mẫu mới', () => {
    const ids = GUIDE_DEMOS.map((d) => d.id);
    for (const id of ['status-tags', 'source-tags', 'utm-tags', 'row-actions', 'customer-table', 'customer-form', 'header-search', 'permission-note']) {
      expect(ids).toContain(id);
    }
    expect(ids).toContain('customer-table-by-viewer');
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it('registry gộp đủ 51 mẫu từ các module demos/* (10 Khách hàng/chung + 4 Chia data/Quản lý phụ trách + 3 Status khách + 3 Quản lý nguồn + 3 Quản lý UTM + 4 Nhóm liên kết / Nhóm tôi quản lý + 2 Thùng rác + 2 Báo cáo data lỗi + 12 Công việc định kỳ + 3 Trạng thái công việc + 2 Lịch sử công việc + 3 Hiệu suất công việc) (đã tách ở P0b) - thiếu 1 mẫu = bài đã viết bị vỡ', () => {
    expect(GUIDE_DEMOS.map((d) => d.id).sort()).toEqual(
      [
        'assign-flow',
        'assign-rules-by-scope',
        'assignment-group-form',
        'assignment-group-picker',
        'customer-form',
        'customer-table',
        'customer-table-by-viewer',
        'group-customers-modal',
        'group-managers',
        'header-search',
        'invalid-data-table',
        'invalid-stats',
        'link-group-table',
        'my-groups-table',
        'own-performance',
        'performance-chart',
        'performance-page',
        'period-type-tags',
        'permission-note',
        'row-actions',
        'sales-assignment-cell',
        'source-form',
        'source-lock-effect',
        'source-manage-table',
        'source-tags',
        'status-delete-fallback',
        'status-form',
        'status-manage-table',
        'status-tags',
        'task-actions-by-viewer',
        'task-agenda',
        'task-assignees',
        'task-audit-cleanup',
        'task-audit-page',
        'task-audit-row',
        'task-by-viewer',
        'task-calendar',
        'task-checklist',
        'task-create-modal',
        'task-kanban',
        'task-links',
        'task-status-delete-fallback',
        'task-status-form',
        'task-status-manage-table',
        'task-status-tags',
        'trash-lifecycle',
        'trash-table',
        'utm-managers',
        'utm-merge-steps',
        'utm-table',
        'utm-tags',
      ].sort(),
    );
  });

  it.each(GUIDE_DEMOS.map((d) => [d.id] as const))('mẫu %s render được (không cảnh báo, không throw)', (id) => {
    const { container } = render(<GuideDemoBlock id={id} />);
    // permission-note LÀ 1 Alert cảnh báo theo thiết kế -> chỉ chặn 2 khung lỗi của GuideDemoBlock, không chặn mọi Alert.
    expect(container.textContent).not.toMatch(/Không có mẫu minh hoạ|Tham số không hợp lệ/);
    expect(container.textContent?.length).toBeGreaterThan(0);
  });
});
