import type { CountBadgeItem } from '@/components/common/CountBadge';
import { TASK_IN_PROGRESS_COUNT_KEY } from '@/lib/hooks/useSidebarBadgeCounts';

/**
 * Props badge cho 1 mục nav, dùng CHUNG cho sidebar (layout.tsx) và card
 * trang chủ (page.tsx) để tooltip/màu không lệch giữa 2 nơi.
 * Mục không có cấu hình riêng chỉ trả `{ count }` như cũ.
 */
export function getNavBadgeProps(
  itemKey: string,
  counts: Record<string, number>,
): CountBadgeItem & { extra?: CountBadgeItem[] } {
  if (itemKey === 'cong-viec-dinh-ky') {
    return {
      count: counts[itemKey],
      title: 'Việc của tôi đang To-Do (chưa bắt đầu)',
      extra: [
        {
          count: counts[TASK_IN_PROGRESS_COUNT_KEY],
          color: '#faad14',
          textColor: '#262626',
          title: 'Việc của tôi đang làm (in progress)',
        },
      ],
    };
  }
  return { count: counts[itemKey] };
}
