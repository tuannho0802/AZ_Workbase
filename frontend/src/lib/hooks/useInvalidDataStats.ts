import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { customersApi } from '../api/customers.api';

/**
 * Thống kê data lỗi (tab Thống kê ở /customers/reports/invalid-data).
 * `enabled` = chỉ gọi khi tab đang hiển thị (tránh tải thống kê nặng lúc chỉ xem Danh sách).
 * `keepPreviousData` giữ số liệu cũ khi đổi loại/khung ngày để biểu đồ không nhấp nháy.
 */
export const useInvalidDataStats = (params: { invalidType: string; days: number }, enabled: boolean = true) => {
  return useQuery({
    queryKey: ['invalid-data-stats', params.invalidType, params.days],
    queryFn: () => customersApi.getInvalidDataStats(params),
    enabled,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
};
