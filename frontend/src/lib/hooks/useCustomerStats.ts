import { useQuery } from '@tanstack/react-query';
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

export const useAllDepositsStats = (enabled: boolean = false) => {
  return useQuery({
    queryKey: ['all-deposits-stats'],
    queryFn: () => customersApi.getAllDepositsStats(),
    enabled,
  });
};
