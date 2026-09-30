import type { CountBadgeItem } from '@/components/common/CountBadge';
import { TASK_IN_PROGRESS_COUNT_KEY } from '@/lib/hooks/useSidebarBadgeCounts';

/**
 * Props badge cho 1 mục nav, dùng CHUNG cho sidebar (layout.tsx) và card
 * trang chủ (page.tsx) để tooltip/màu không lệch giữa 2 nơi.
 * MỌI mục có badge số đều có tooltip giải thích đang đếm gì (`NAV_BADGE_TITLES`)
 * - key khớp `key` trong nav-config / map của `useSidebarBadgeCounts()`.
 */
export const NAV_BADGE_TITLES: Record<string, string> = {
  'invalid-data-report': 'Số khách hàng có data lỗi (trùng SĐT) cần xử lý',
  'trash-can': 'Số khách hàng đang nằm trong thùng rác',
  users: 'Số nhân viên mới đăng ký đang chờ duyệt',
  'duyet-phep': 'Số đơn nghỉ phép đang chờ bạn duyệt',
  'nghi-phep': 'Số đơn nghỉ phép của bạn đang chờ duyệt',
  'thong-bao': 'Số thông báo chưa đọc',
  'cong-viec-dinh-ky': 'Việc của tôi đang To-Do (chưa bắt đầu)',
};

export function getNavBadgeProps(
  itemKey: string,
  counts: Record<string, number>,
): CountBadgeItem & { extra?: CountBadgeItem[] } {
  if (itemKey === 'cong-viec-dinh-ky') {
    return {
      count: counts[itemKey],
      title: NAV_BADGE_TITLES[itemKey],
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
  return { count: counts[itemKey], title: NAV_BADGE_TITLES[itemKey] };
}
