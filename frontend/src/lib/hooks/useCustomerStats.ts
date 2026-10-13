import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { CustomerStatsPeriod } from '../types/customer.types';
import { customersApi } from '../api/customers.api';

export const useCustomerStatsBase = () => {
  return useQuery({
    queryKey: ['customer-stats'],
    queryFn: () => customersApi.getStats(),
  });
};

export const useCustomersToday = (enabled: boolean = false) => {
  return useQuery({
    queryKey: ['customers-today'],
    queryFn: () => customersApi.getStatsToday(),
    enabled,
  });
};

export const useCustomersByStatus = (enabled: boolean = false) => {
  return useQuery({
    queryKey: ['customers-by-status'],
    queryFn: () => customersApi.getStatsByStatus(),
    enabled,
  });
};

export const useAllDepositsStats = (enabled: boolean = false, params?: { 
  startDate?: string; 
  endDate?: string;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}) => {
  return useQuery({
    queryKey: ['all-deposits-stats', params?.startDate, params?.endDate, params?.sortBy, params?.sortOrder],
    queryFn: () => customersApi.getAllDepositsStats(params),
    enabled,
  });
};

/** Thống kê khách theo giai đoạn Ngày/Tuần/Tháng/Năm (khối "Thống kê khách hàng" ở /customers). */
export const useCustomerPeriodStats = (period: CustomerStatsPeriod, anchor: string) => {
  return useQuery({
    queryKey: ['customer-stats', 'period', period, anchor],
    queryFn: () => customersApi.getPeriodStats({ period, anchor }),
    staleTime: 60 * 1000,
    // Đổi kỳ: giữ số cũ (mờ đi) thay vì nháy skeleton.
    placeholderData: keepPreviousData,
  });
};
