import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { customersApi } from '../api/customers.api';

/**
 * Thống kê data lỗi (tab Thống kê ở /customers/reports/invalid-data), theo KỲ
 * (`dateFrom`/`dateTo`; bỏ trống = toàn bộ thời gian).
 * `enabled` = chỉ gọi khi tab đang hiển thị và kỳ đã hợp lệ.
 * `keepPreviousData` giữ số liệu cũ khi đổi loại/kỳ để giao diện không nhấp nháy.
 */
export const useInvalidDataStats = (
  params: { invalidType: string; dateFrom?: string; dateTo?: string },
  enabled: boolean = true,
) => {
  return useQuery({
    queryKey: ['invalid-data-stats', params.invalidType, params.dateFrom ?? null, params.dateTo ?? null],
    queryFn: () => customersApi.getInvalidDataStats(params),
    enabled,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
};
