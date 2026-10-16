'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { leaveRequestsApi, LeaveCalendarQuery } from '../api/leave-requests.api';
import { LEAVE_WEEK_LIST_KEY } from './useLeaveWeekList';

export type LeaveCalendarMode = 'mine' | 'scoped';

/**
 * Lịch tháng nghỉ phép. queryKey bắt đầu bằng `LEAVE_WEEK_LIST_KEY` có chủ đích: mọi chỗ
 * đã invalidate danh sách nghỉ phép (tạo/sửa/huỷ/duyệt/từ chối/xoá) tự làm tươi luôn lịch,
 * không cần thêm điểm invalidate riêng.
 */
export function useLeaveCalendar(mode: LeaveCalendarMode, query: LeaveCalendarQuery, enabled = true) {
  const q = useQuery({
    queryKey: [LEAVE_WEEK_LIST_KEY, 'calendar', mode, JSON.stringify(query)],
    queryFn: () => (mode === 'mine' ? leaveRequestsApi.getMineCalendar(query) : leaveRequestsApi.getCalendar(query)),
    enabled,
    placeholderData: keepPreviousData, // đổi tháng không nháy trắng
    staleTime: 30_000,
  });
  return { items: q.data ?? EMPTY_ITEMS, isLoading: q.isLoading, isFetching: q.isFetching };
}

// Hằng số module-level thay vì literal [] (tránh vòng lặp useEffect - xem frontend/README mục 4).
const EMPTY_ITEMS: import('../api/leave-requests.api').LeaveCalendarItem[] = [];
