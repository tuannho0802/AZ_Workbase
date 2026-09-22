'use client';

import { useState } from 'react';
import { Button, Empty, Segmented, Spin, Switch, Card, Typography } from 'antd';
import { BellOutlined } from '@ant-design/icons';
import { useNotificationList, useNotificationMutations } from '@/lib/hooks/useNotifications';
import { useNotificationActions } from '@/lib/hooks/useNotificationActions';
import { NotificationRow } from '@/components/notifications/NotificationRow';
import type { NotificationCategory } from '@/lib/types/notification.types';

const { Title } = Typography;

type ViewFilter = 'all' | NotificationCategory | 'hidden';

const VIEW_OPTIONS: { label: string; value: ViewFilter }[] = [
  { label: 'Tất cả', value: 'all' },
  { label: 'Khách hàng', value: 'customer' },
  { label: 'Công việc', value: 'task' },
  { label: 'Thông báo', value: 'manual' },
  // Chỉ thông báo THỦ CÔNG mới có khái niệm "ẩn" (dismissedAt) - tự động bị
  // xoá cứng ngay khi bấm "Xoá" nên không có gì để xem lại ở đây (PLAN 7.1 mở
  // rộng, xem `notifications.service.ts` `remove()`/`restore()`).
  { label: 'Đã ẩn', value: 'hidden' },
];

/**
 * Trang đầy đủ hộp thư (PLAN 7.1): lọc theo loại + chỉ chưa đọc, cursor
 * "Tải thêm", Đọc tất cả (theo loại đang chọn), Xoá/Ẩn từng cái, và tab
 * "Đã ẩn" để xem lại + khôi phục thông báo thủ công đã ẩn trước đó.
 * Chỉ cần đăng nhập - hộp thư luôn là của CHÍNH người dùng (BE lấy từ JWT).
 *
 * ⚠️ ĐIỀU CHỈNH GIAO DIỆN (2026-09-22, phản hồi chủ dự án): trước đây trang
 * không có tiêu đề/icon (đi thẳng vào hàng bộ lọc), khác với các trang khác
 * trong app đều có header dạng "icon + tên trang" (vd `nghi-phep`,
 * `duyet-phep`). Thêm header đồng bộ + bọc khối bộ lọc/danh sách trong
 * `Card` (thay vì `div` border trần) cho nhất quán style toàn app.
 */
export default function NotificationsPage() {
  const [view, setView] = useState<ViewFilter>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);

  const hiddenView = view === 'hidden';
  const category = hiddenView || view === 'all' ? undefined : view;

  const list = useNotificationList({
    limit: 20,
    // "Chỉ chưa đọc" không có ý nghĩa ở tab "Đã ẩn" (ẩn rồi thì không còn
    // hiện badge chưa đọc) - luôn bỏ qua để tránh danh sách trống gây hiểu nhầm.
    unreadOnly: !hiddenView && unreadOnly ? true : undefined,
    dismissed: hiddenView || undefined,
    category,
  });
  const { markAllRead, remove, restore } = useNotificationMutations();
  const { open } = useNotificationActions();

  const items = list.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <BellOutlined style={{ fontSize: 22, color: '#1890ff' }} />
        <Title level={4} style={{ margin: 0 }}>
          Thông báo
        </Title>
      </div>

      <Card
        styles={{ body: { padding: '16px 16px 0' } }}
        style={{ marginBottom: 16 }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            paddingBottom: 16,
          }}
        >
          <Segmented<ViewFilter> value={view} onChange={setView} options={VIEW_OPTIONS} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {!hiddenView && (
              <>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <Switch size="small" checked={unreadOnly} onChange={setUnreadOnly} />
                  Chỉ chưa đọc
                </label>
                <Button
                  loading={markAllRead.isPending}
                  disabled={markAllRead.isPending}
                  onClick={() => markAllRead.mutate(category)}
                >
                  Đọc tất cả
                </Button>
              </>
            )}
          </div>
        </div>
      </Card>

      <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
        {list.isLoading ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <Spin />
          </div>
        ) : items.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                hiddenView
                  ? 'Chưa ẩn thông báo nào'
                  : unreadOnly
                    ? 'Không có thông báo chưa đọc'
                    : 'Chưa có thông báo nào'
              }
            style={{ padding: '48px 0' }}
          />
        ) : (
          items.map((item) => (
            <NotificationRow
              key={item.id}
              item={item}
              onOpen={open}
              onRemove={(n) => remove.mutate(n.id)}
              mode={hiddenView ? 'hidden' : 'active'}
              onRestore={(n) => restore.mutate(n.id)}
            />
          ))
        )}
      </div>

      {list.hasNextPage && (
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <Button loading={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>
            Tải thêm
          </Button>
        </div>
      )}
    </div>
  );
}