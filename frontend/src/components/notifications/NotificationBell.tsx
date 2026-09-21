'use client';

import { useState } from 'react';
import { Badge, Button, Popover } from 'antd';
import { BellOutlined } from '@ant-design/icons';
import { useNotificationPoll } from '@/lib/hooks/useNotificationPoll';
import { NotificationPanel } from './NotificationPanel';

/**
 * Chuông ở Header (giữa ngày và avatar). ĐÂY là nơi DUY NHẤT gọi
 * `useNotificationPoll()` - polling 60s + toast thông báo mới.
 */
export function NotificationBell() {
  const { unread } = useNotificationPoll();
  const [open, setOpen] = useState(false);

  return (
    <Popover
      trigger="click"
      placement="bottomRight"
      open={open}
      onOpenChange={setOpen}
      content={<NotificationPanel onClose={() => setOpen(false)} />}
    >
      <Badge count={unread} overflowCount={99} size="small" offset={[-2, 4]}>
        <Button
          type="text"
          shape="circle"
          icon={<BellOutlined style={{ fontSize: 18 }} />}
          aria-label={unread > 0 ? `Thông báo (${unread} chưa đọc)` : 'Thông báo'}
        />
      </Badge>
    </Popover>
  );
}
