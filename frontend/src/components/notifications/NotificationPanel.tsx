'use client';

import { useState } from 'react';
import { Button, Empty, Segmented, Spin } from 'antd';
import { useRouter } from 'next/navigation';
import { useNotificationList, useNotificationMutations } from '@/lib/hooks/useNotifications';
import { useNotificationActions } from '@/lib/hooks/useNotificationActions';
import { NotificationRow } from './NotificationRow';

type Tab = 'all' | 'unread';

/** Nội dung Popover của chuông: 20 thông báo mới nhất + Tất cả/Chưa đọc + Đọc tất cả. */
export function NotificationPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('all');
  const list = useNotificationList({ limit: 20, unreadOnly: tab === 'unread' });
  const { markAllRead, remove } = useNotificationMutations();
  const { open } = useNotificationActions();

  const items = list.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <div style={{ width: 380, maxWidth: '86vw' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8 }}>
        <Segmented<Tab>
          size="small"
          value={tab}
          onChange={setTab}
          options={[
            { label: 'Tất cả', value: 'all' },
            { label: 'Chưa đọc', value: 'unread' },
          ]}
        />
        <Button
          type="link"
          size="small"
          loading={markAllRead.isPending}
          disabled={markAllRead.isPending}
          onClick={() => markAllRead.mutate(undefined)}
        >
          Đọc tất cả
        </Button>
      </div>

      <div style={{ maxHeight: 420, overflowY: 'auto', margin: '0 -12px', borderTop: '1px solid #f0f0f0' }}>
        {list.isLoading ? (
          <div style={{ padding: 32, textAlign: 'center' }}>
            <Spin />
          </div>
        ) : items.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={tab === 'unread' ? 'Không có thông báo chưa đọc' : 'Chưa có thông báo nào'}
            style={{ padding: '24px 0' }}
          />
        ) : (
          <>
            {items.map((item) => (
              <NotificationRow
                key={item.id}
                item={item}
                onOpen={(n) => {
                  open(n);
                  onClose();
                }}
                onRemove={(n) => remove.mutate(n.id)}
              />
            ))}
            {list.hasNextPage && (
              <div style={{ padding: 8, textAlign: 'center' }}>
                <Button size="small" type="link" loading={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>
                  Tải thêm
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ paddingTop: 8, textAlign: 'center', borderTop: '1px solid #f0f0f0' }}>
        <Button
          type="link"
          size="small"
          onClick={() => {
            router.push('/thong-bao');
            onClose();
          }}
        >
          Xem tất cả
        </Button>
      </div>
    </div>
  );
}
