import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { GUIDE_DEMOS, GuideDemoBlock } from './guide-demos';

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

  it('vùng bảng inert, bộ chọn vai trò thì không', () => {
    render(<GuideDemoBlock id="customer-table-by-viewer" />);
    const controls = screen.getByTestId('guide-demo-controls');
    expect(controls.closest('[inert]')).toBeNull();
    expect(screen.getByTestId('demo-toolbar').closest('[inert]')).not.toBeNull();
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

  it('registry gộp đủ 10 mẫu từ các module demos/* (đã tách ở P0b) - thiếu 1 mẫu = bài đã viết bị vỡ', () => {
    expect(GUIDE_DEMOS.map((d) => d.id).sort()).toEqual(
      [
        'customer-form',
        'customer-table',
        'customer-table-by-viewer',
        'header-search',
        'permission-note',
        'row-actions',
        'sales-assignment-cell',
        'source-tags',
        'status-tags',
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
