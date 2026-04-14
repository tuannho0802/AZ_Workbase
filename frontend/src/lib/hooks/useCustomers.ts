import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { customersApi } from '../api/customers.api';

export interface CustomerFilterParams {
  page?: number;
  limit?: number;
  sortField?: string;
  sortOrder?: 'ASC' | 'DESC';
  status?: string;
  source?: string;
  salesUserId?: number;
  departmentId?: number;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

export const useCustomers = (params: CustomerFilterParams) => {
  return useQuery({
    queryKey: ['customers', params],
    queryFn: () => customersApi.getCustomers(params),
    placeholderData: keepPreviousData,
  });
};
