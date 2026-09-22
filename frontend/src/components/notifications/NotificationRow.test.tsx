import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NotificationRow } from './NotificationRow';
import { NotificationDetailModal } from './NotificationDetailModal';
import { useNotificationUiStore } from '@/lib/stores/notification-ui.store';
import type { NotificationItem } from '@/lib/types/notification.types';

const make = (over: Partial<NotificationItem> = {}): NotificationItem => ({
  id: 1,
  eventType: 'customer.updated',
  category: 'customer',
  relation: 'CUSTOMER_PRIMARY_SALES',
  actorId: 2,
  entityType: 'customer',
  entityId: 10,
  subEntityType: null,
  subEntityId: null,
  broadcastId: null,
  title: 'An vừa cập nhật khách hàng Nguyễn Văn B.',
  body: null,
  params: null,
  occurrences: 1,
  isRead: false,
  readAt: null,
  createdAt: '2026-09-21T03:00:00.000Z',
  sortAt: '2026-09-21T03:00:00.000Z',
  ...over,
});

describe('NotificationRow', () => {
  it('chưa đọc: có chấm xanh; đã đọc: không có', () => {
    const { rerender } = render(<NotificationRow item={make()} onOpen={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByLabelText('Chưa đọc')).toBeInTheDocument();
    rerender(<NotificationRow item={make({ isRead: true })} onOpen={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.queryByLabelText('Chưa đọc')).not.toBeInTheDocument();
  });

  it('bấm nội dung → onOpen; bấm nút xoá → onRemove và KHÔNG kích hoạt onOpen', () => {
    const onOpen = vi.fn();
    const onRemove = vi.fn();
    const item = make();
    render(<NotificationRow item={item} onOpen={onOpen} onRemove={onRemove} />);

    fireEvent.click(screen.getByText(item.title));
    expect(onOpen).toHaveBeenCalledWith(item);

    onOpen.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Xoá thông báo' }));
    expect(onRemove).toHaveBeenCalledWith(item);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('thông báo thủ công: nút là "Ẩn" (không phải xoá)', () => {
    render(
      <NotificationRow
        item={make({ category: 'manual', eventType: 'manual.broadcast', entityType: null, entityId: null })}
        onOpen={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Ẩn thông báo' })).toBeInTheDocument();
  });

  it('occurrences > 1 hiện ×n; bản ghi đã xoá hiện "Không khả dụng"', () => {
    render(
      <NotificationRow
        item={make({ occurrences: 3, params: { unavailable: true }, eventType: 'customer.deleted' })}
        onOpen={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByText('×3')).toBeInTheDocument();
    expect(screen.getByText('Không khả dụng')).toBeInTheDocument();
  });

  it('title chứa HTML → render thành TEXT, không tạo phần tử (chống XSS)', () => {
    const { container } = render(
      <NotificationRow
        item={make({ title: '<img src=x onerror=alert(1)><b>đậm</b>' })}
        onOpen={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(screen.getByText('<img src=x onerror=alert(1)><b>đậm</b>')).toBeInTheDocument();
  });
});

describe('NotificationDetailModal', () => {
  it('hiện người gửi + tiêu đề + nội dung dạng text thuần; đóng được', async () => {
    const item = make({
      category: 'manual',
      eventType: 'manual.broadcast',
      title: 'Họp toàn công ty',
      body: '<script>alert(1)</script>\nDòng 2',
      params: { senderName: 'Quản trị viên' },
    });
    const { container } = render(<NotificationDetailModal />);
    expect(screen.queryByText('Họp toàn công ty')).not.toBeInTheDocument();

    useNotificationUiStore.getState().openDetail(item);
    expect(await screen.findByText('Người gửi')).toBeInTheDocument();
    expect(screen.getByText('Quản trị viên')).toBeInTheDocument();
    expect(screen.getByText('Họp toàn công ty')).toBeInTheDocument();
    expect(document.body.querySelector('script')).toBeNull();
    expect(container).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(useNotificationUiStore.getState().detail).toBeNull();
  });

  it('không có senderName (thông báo hệ thống cũ) → hiện "Hệ thống" thay vì để trống', async () => {
    const item = make({
      category: 'manual',
      eventType: 'manual.broadcast',
      title: 'Bảo trì hệ thống',
      body: null,
      params: null,
    });
    render(<NotificationDetailModal />);
    useNotificationUiStore.getState().openDetail(item);
    expect(await screen.findByText('Hệ thống')).toBeInTheDocument();
  });
});