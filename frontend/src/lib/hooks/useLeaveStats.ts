import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { leaveRequestsApi } from '../api/leave-requests.api';
import type { ReportQuery } from '../types/reports.types';
import type { LeaveStatsFilters, LeaveStatsRequestsQuery } from '../types/leave-stats.types';

/**
 * `enabled`: period=custom cần ĐỦ customFrom+customTo mới gọi API (tránh 400 lúc người dùng mới bấm "Tuỳ chọn"),
 * và chỉ gọi khi tab đang được phép hiển thị (`allowed`, tức có `leave_requests.view`).
 */
export const useLeaveStats = (query: ReportQuery, filters: LeaveStatsFilters, allowed = true) => {
    const ready = query.period !== 'custom' || (!!query.customFrom && !!query.customTo);
    return useQuery({
        queryKey: ['leave-requests', 'stats', query, filters],
        queryFn: () => leaveRequestsApi.getStats({ ...query, ...filters }),
        enabled: allowed && ready,
        staleTime: 60 * 1000,
        placeholderData: keepPreviousData,
    });
};

/** Mini Table đơn nghỉ (drill-down) - chỉ gọi khi modal mở (`enabled`) và kỳ tuỳ chọn đã đủ 2 đầu. */
export const useLeaveStatsRequests = (query: ReportQuery, params: LeaveStatsRequestsQuery, enabled: boolean) => {
    const ready = query.period !== 'custom' || (!!query.customFrom && !!query.customTo);
    return useQuery({
        queryKey: ['leave-requests', 'stats', 'requests', query, params],
        queryFn: () => leaveRequestsApi.getStatsRequests({ ...query, ...params }),
        enabled: enabled && ready,
        staleTime: 30 * 1000,
        placeholderData: keepPreviousData,
    });
};
