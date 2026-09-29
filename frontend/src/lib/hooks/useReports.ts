import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { reportsApi } from '../api/reports.api';
import { MarketingReportFilters, ReportCustomerListQuery, ReportQuery } from '../types/reports.types';

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

export const useCustomerQualityReport = (query: ReportQuery) => {
    return useQuery({
        queryKey: ['reports', 'quality', query],
        queryFn: () => reportsApi.getCustomerQualityReport(query),
        enabled: isQueryReady(query),
        staleTime: 60 * 1000,
    });
};

export const useMarketingReport = (query: ReportQuery & MarketingReportFilters) => {
    return useQuery({
        queryKey: ['reports', 'marketing', query],
        queryFn: () => reportsApi.getMarketingReport(query),
        enabled: isQueryReady(query),
        staleTime: 60 * 1000,
        // Đổi bộ lọc/kỳ: giữ số cũ (mờ đi bằng Spin) thay vì nháy về skeleton toàn trang.
        placeholderData: keepPreviousData,
    });
};

/** Danh sách khách của Mini Table drill-down - chỉ gọi khi modal đang mở. */
export const useReportCustomerList = (query: ReportCustomerListQuery, enabled: boolean) => {
    return useQuery({
        queryKey: ['reports', 'customer-list', query],
        queryFn: () => reportsApi.getCustomerList(query),
        enabled: enabled && isQueryReady(query),
        staleTime: 30 * 1000,
        placeholderData: keepPreviousData,
    });
};

/** Chi tiết 1 khách cho modal "Thông tin" - chỉ gọi khi modal đang mở. */
export const useReportCustomerDetail = (id: number | null, context: 'customers' | 'marketing') => {
    return useQuery({
        queryKey: ['reports', 'customer-detail', id, context],
        queryFn: () => reportsApi.getCustomerDetail(id as number, context),
        enabled: id != null,
        staleTime: 30 * 1000,
    });
};
