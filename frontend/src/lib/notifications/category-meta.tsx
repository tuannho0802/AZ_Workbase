import { NotificationOutlined, ScheduleOutlined, TeamOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';
import type { NotificationCategory } from '../types/notification.types';

export interface CategoryMeta {
  icon: ReactNode;
  color: string;
  label: string;
}

/**
 * Nguồn DUY NHẤT cho icon/màu/nhãn theo `category` - dùng chung cho dòng
 * thông báo (chuông + trang `/thong-bao`, xem `NotificationRow.tsx`) và toast
 * (`useNotificationPoll.ts`) để 2 nơi luôn khớp nhau về mặt hình ảnh.
 */
export const CATEGORY_META: Record<NotificationCategory, CategoryMeta> = {
  customer: { icon: <TeamOutlined />, color: '#1890ff', label: 'Khách hàng' },
  task: { icon: <ScheduleOutlined />, color: '#fa8c16', label: 'Công việc' },
  manual: { icon: <NotificationOutlined />, color: '#722ed1', label: 'Thông báo' },
};

/** Badge tròn-vuông (nền màu nhạt + icon đậm màu) - mirror đúng khối icon ở `NotificationRow.tsx`. */
export function CategoryIconBadge({ category, size = 32 }: { category: NotificationCategory; size?: number }) {
  const meta = CATEGORY_META[category] ?? CATEGORY_META.manual;
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: meta.color,
        background: `${meta.color}1a`,
        fontSize: Math.round(size / 2),
      }}
    >
      {meta.icon}
    </span>
  );
}
