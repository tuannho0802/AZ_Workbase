'use client';

import { useCallback, useMemo } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { leaveRequestsApi, LeaveListFilters, LeaveRequest } from '../api/leave-requests.api';

export type LeaveListKind = 'mine' | 'pending' | 'history';

const FETCHERS = {
  mine: leaveRequestsApi.getMinePaged,
  pending: leaveRequestsApi.getPendingPaged,
  history: leaveRequestsApi.getHistoryPaged,
} as const;

/** Prefix queryKey PHA 1 - dùng để invalidate sau approve/reject/edit/create/cancel. */
export const LEAVE_WEEK_LIST_KEY = 'leave-week-list';

/**
 * Week-mode 2 pha cho danh sách nghỉ phép (mirror cách audit-logs dùng
 * `WeeklyLazySection`):
 * - PHA 1 (hook này, react-query): chỉ lấy `weeks` (tuần + số đơn) của trang
 *   hiện tại + tổng - KHÔNG kèm bản ghi nào, rất nhẹ.
 * - PHA 2 (`fetchWeek`, do `WeeklyLazySection` gọi khi user MỞ 1 panel tuần):
 *   chỉ tải đơn của đúng tuần đó, phân trang thật ở DB.
 *
 * `resetKey` gồm cả `dataUpdatedAt` của PHA 1 -> sau mỗi lần invalidate/refetch
 * (duyệt, từ chối, sửa, tạo, huỷ...) cache PHA 2 của các tuần tự bị bỏ, panel
 * đang mở tải lại dữ liệu mới.
 */
export function useLeaveWeekList(
  kind: LeaveListKind,
  filters: LeaveListFilters,
  page: number,
  weeksPerPage: number,
  enabled = true,
) {
  const queryClient = useQueryClient();
  const filterKey = JSON.stringify(filters);

  const query = useQuery({
    queryKey: [LEAVE_WEEK_LIST_KEY, kind, filterKey, page, weeksPerPage],
    queryFn: () => FETCHERS[kind]({ ...filters, page, weeksPerPage }),
    enabled,
    // Giữ trang cũ trong lúc đổi trang/filter để không nháy trắng danh sách.
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const fetchWeek = useCallback(
    async (weekStart: string, weekPage: number, weekLimit: number) => {
      const r = await FETCHERS[kind]({ ...filters, page, weeksPerPage, weekStart, weekPage, weekLimit });
      return { data: (r.data ?? []) as LeaveRequest[], weekTotal: r.weekTotal };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind, filterKey, page, weeksPerPage],
  );

  const resetKey = useMemo(
    () => `${kind}|${filterKey}|${page}|${weeksPerPage}|${query.dataUpdatedAt}`,
    [kind, filterKey, page, weeksPerPage, query.dataUpdatedAt],
  );

  return {
    weeks: query.data?.weeks ?? [],
    totalWeeks: query.data?.totalWeeks ?? 0,
    totalRecords: query.data?.total ?? 0,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    fetchWeek,
    resetKey,
    refetch: query.refetch,
    invalidateAll: () => queryClient.invalidateQueries({ queryKey: [LEAVE_WEEK_LIST_KEY] }),
  };
}

/** Invalidate mọi list nghỉ phép + badge sidebar (gọi sau mutation). */
export function useInvalidateLeaveLists() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [LEAVE_WEEK_LIST_KEY] });
    queryClient.invalidateQueries({ queryKey: ['badge-count', 'duyet-phep'] });
    queryClient.invalidateQueries({ queryKey: ['badge-count', 'nghi-phep'] });
  }, [queryClient]);
}
