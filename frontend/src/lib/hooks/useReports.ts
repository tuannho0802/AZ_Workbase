import { useQuery } from '@tanstack/react-query';
import { reportsApi } from '../api/reports.api';
import { ReportQuery } from '../types/reports.types';

/**
 * `enabled: isQueryReady(query)` - period=custom cần ĐỦ customFrom+customTo
 * mới gọi API (tránh gọi lúc người dùng mới bấm "Tuỳ chọn" nhưng chưa chọn
 * xong khoảng ngày -> BE sẽ trả lỗi 400 "bắt buộc phải có customFrom/customTo").
 */
function isQueryReady(query: ReportQuery): boolean {
    if (query.period !== 'custom') return true;
    return !!query.customFrom && !!query.customTo;
}

export const useRevenueReport = (query: ReportQuery) => {
    return useQuery({
        queryKey: ['reports', 'revenue', query],
        queryFn: () => reportsApi.getRevenueReport(query),
        enabled: isQueryReady(query),
        staleTime: 60 * 1000,
    });
};

export const useCustomerReport = (query: ReportQuery) => {
    return useQuery({
        queryKey: ['reports', 'customers', query],
        queryFn: () => reportsApi.getCustomerReport(query),
        enabled: isQueryReady(query),
        staleTime: 60 * 1000,
    });
};