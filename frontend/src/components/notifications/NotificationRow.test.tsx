import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NotificationRow } from './NotificationRow';
import { NotificationDetailModal } from './NotificationDetailModal';
import { useNotificationUiStore } from '@/lib/stores/notification-ui.store';
import { useAuthStore } from '@/lib/stores/auth.store';
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

  it('bấm nội dung → onOpen; bấm nút ẩn → onRemove và KHÔNG kích hoạt onOpen', () => {
    const onOpen = vi.fn();
    const onRemove = vi.fn();
    const item = make();
    render(<NotificationRow item={item} onOpen={onOpen} onRemove={onRemove} />);

    fireEvent.click(screen.getByText(item.title));
    expect(onOpen).toHaveBeenCalledWith(item);

    onOpen.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Ẩn thông báo' }));
    expect(onRemove).toHaveBeenCalledWith(item);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('thông báo thủ công cũng dùng chung nút "Ẩn" (mọi loại đều chỉ ẩn, không xoá cứng)', () => {
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

  it('mode="hidden": hiện nút Khôi phục + Xoá vĩnh viễn (có Popconfirm xác nhận), không hiện nút Ẩn', async () => {
    const onRestore = vi.fn();
    const onPurge = vi.fn();
    const item = make();
    render(
      <NotificationRow
        item={item}
        onOpen={vi.fn()}
        onRemove={vi.fn()}
        mode="hidden"
        onRestore={onRestore}
        onPurge={onPurge}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Ẩn thông báo' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Khôi phục thông báo' }));
    expect(onRestore).toHaveBeenCalledWith(item);

    // Xoá vĩnh viễn phải qua Popconfirm - bấm nút icon chỉ MỞ popover, chưa gọi onPurge.
    fireEvent.click(screen.getByRole('button', { name: 'Xoá vĩnh viễn' }));
    expect(onPurge).not.toHaveBeenCalled();
    expect(await screen.findByText('Xoá vĩnh viễn thông báo này?')).toBeInTheDocument();

    // Sau khi mở, có 2 phần tử tên "Xoá vĩnh viễn": nút icon gốc + nút xác nhận
    // trong Popconfirm - bấm nút xác nhận (phần tử cuối) mới thực sự gọi onPurge.
    const purgeButtons = screen.getAllByRole('button', { name: 'Xoá vĩnh viễn' });
    fireEvent.click(purgeButtons[purgeButtons.length - 1]);
    expect(onPurge).toHaveBeenCalledWith(item);
  });

  it('có params.entityName khớp trong title → tô sáng bằng <mark>, không đổi nội dung chữ', () => {
    const { container } = render(
      <NotificationRow
        item={make({ params: { entityName: 'Nguyễn Văn B' } })}
        onOpen={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    const mark = container.querySelector('mark');
    expect(mark).not.toBeNull();
    expect(mark?.textContent).toBe('Nguyễn Văn B');
    expect(container.textContent).toContain('An vừa cập nhật khách hàng Nguyễn Văn B.');
  });

  it('params.entityName KHÔNG khớp title (vd bị truncate) → không tô, vẫn hiện đủ text', () => {
    const { container } = render(
      <NotificationRow
        item={make({ params: { entityName: 'Không tồn tại trong title' } })}
        onOpen={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(container.querySelector('mark')).toBeNull();
    expect(screen.getByText('An vừa cập nhật khách hàng Nguyễn Văn B.')).toBeInTheDocument();
  });

  it('có params.actorName khớp trong title → thay bằng UserMiniCard (Avatar + tên), KHÔNG hiện Tag Vai trò (yêu cầu "bỏ role")', () => {
    const { container } = render(
      <NotificationRow
        item={make({ params: { actorName: 'An' } })}
        onOpen={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    // Tên actor vẫn hiện đủ (bên trong UserMiniCard) - không split mất chữ.
    expect(screen.getAllByText('An').length).toBeGreaterThan(0);
    // "bỏ role" - UserMiniCard nhận hideRoleTag, không có Tag nào render.
    expect(container.querySelector('.ant-tag')).toBeNull();
    // entityName (nếu có) vẫn tô <mark> song song, không bị actorName che mất.
    expect(screen.getByText('Nguyễn Văn B.', { exact: false })).toBeInTheDocument();
  });

  it('có cả params.actorName VÀ params.entityName → actorName ra UserMiniCard, entityName vẫn ra <mark>, không chồng lấn', () => {
    const { container } = render(
      <NotificationRow
        item={make({ params: { actorName: 'An', entityName: 'Nguyễn Văn B' } })}
        onOpen={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    const mark = container.querySelector('mark');
    expect(mark).not.toBeNull();
    expect(mark?.textContent).toBe('Nguyễn Văn B');
    expect(screen.getAllByText('An').length).toBeGreaterThan(0);
    expect(container.textContent).toContain('vừa cập nhật khách hàng');
  });

  it('category="manual" → hiện dòng "Từ [sender] đến [người đang xem]" dùng UserMiniCard, bỏ role', () => {
    useAuthStore.setState({ isAuthenticated: true, user: { id: 9, name: 'Nguyễn Văn Xem' } as never });
    const { container } = render(
      <NotificationRow
        item={make({
          category: 'manual',
          eventType: 'manual.broadcast',
          entityType: null,
          entityId: null,
          title: 'Họp toàn công ty lúc 9h',
          params: { senderName: 'Quản trị viên' },
        })}
        onOpen={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByText('Từ')).toBeInTheDocument();
    expect(screen.getByText('đến')).toBeInTheDocument();
    expect(screen.getByText('Quản trị viên')).toBeInTheDocument();
    expect(screen.getByText('Nguyễn Văn Xem')).toBeInTheDocument();
    expect(container.querySelector('.ant-tag')).toBeNull();
    useAuthStore.setState({ isAuthenticated: false, user: null });
  });

  it('category="manual" thiếu senderName (thông báo hệ thống cũ) → fallback "Hệ thống"', () => {
    render(
      <NotificationRow
        item={make({
          category: 'manual',
          eventType: 'manual.broadcast',
          entityType: null,
          entityId: null,
          params: null,
        })}
        onOpen={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByText('Hệ thống')).toBeInTheDocument();
  });

  it('category !== "manual" → KHÔNG hiện dòng "Từ ... đến ..."', () => {
    render(<NotificationRow item={make()} onOpen={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.queryByText('Từ')).not.toBeInTheDocument();
    expect(screen.queryByText('đến')).not.toBeInTheDocument();
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