'use client';

import { useState } from 'react';
import { Button, Empty, Segmented, Spin, Switch } from 'antd';
import { useNotificationList, useNotificationMutations } from '@/lib/hooks/useNotifications';
import { useNotificationActions } from '@/lib/hooks/useNotificationActions';
import { NotificationRow } from '@/components/notifications/NotificationRow';
import type { NotificationCategory } from '@/lib/types/notification.types';

type CategoryFilter = 'all' | NotificationCategory;

const CATEGORY_OPTIONS: { label: string; value: CategoryFilter }[] = [
  { label: 'Tất cả', value: 'all' },
  { label: 'Khách hàng', value: 'customer' },
  { label: 'Công việc', value: 'task' },
  { label: 'Thông báo', value: 'manual' },
];

/**
 * Trang đầy đủ hộp thư (PLAN 7.1): lọc theo loại + chỉ chưa đọc, cursor
 * "Tải thêm", Đọc tất cả (theo loại đang chọn), Xoá/Ẩn từng cái.
 * Chỉ cần đăng nhập - hộp thư luôn là của CHÍNH người dùng (BE lấy từ JWT).
 */
export default function NotificationsPage() {
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);

  const list = useNotificationList({
    limit: 20,
    unreadOnly: unreadOnly || undefined,
    category: category === 'all' ? undefined : category,
  });
  const { markAllRead, remove } = useNotificationMutations();
  const { open } = useNotificationActions();

  const items = list.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <Segmented<CategoryFilter> value={category} onChange={setCategory} options={CATEGORY_OPTIONS} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <Switch size="small" checked={unreadOnly} onChange={setUnreadOnly} />
            Chỉ chưa đọc
          </label>
          <Button
            loading={markAllRead.isPending}
            disabled={markAllRead.isPending}
            onClick={() => markAllRead.mutate(category === 'all' ? undefined : category)}
          >
            Đọc tất cả
          </Button>
        </div>
      </div>

      <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden' }}>
        {list.isLoading ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <Spin />
          </div>
        ) : items.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={unreadOnly ? 'Không có thông báo chưa đọc' : 'Chưa có thông báo nào'}
            style={{ padding: '48px 0' }}
          />
        ) : (
          items.map((item) => (
            <NotificationRow key={item.id} item={item} onOpen={open} onRemove={(n) => remove.mutate(n.id)} />
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
