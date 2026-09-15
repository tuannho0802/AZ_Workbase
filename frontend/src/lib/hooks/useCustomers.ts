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
  marketingUserId?: number;
  creatorId?: number;
  departmentId?: number;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  joinedGroups?: 'joined' | 'not_joined';
}

/**
 * `enabled` (mặc định `true` - KHÔNG đổi hành vi chỗ gọi cũ, mirror đúng
 * pattern `usePeriodicTasks(params, enabled)`): bắt buộc truyền `false` ở
 * bất kỳ nơi nào gọi hook này để phục vụ 1 tính năng PHỤ (vd ô tìm Khách
 * hàng để gắn vào module khác) mà người dùng có thể KHÔNG có `customers.view`
 * - thiếu `enabled` sẽ khiến hook tự bắn `GET /customers` ngay khi component
 * mount (bất kể có đang hiển thị UI đó hay không), Backend trả 403 đúng
 * (RBAC hoạt động đúng) nhưng FE vẫn toast lỗi lặp lại nhiều lần do
 * React Query tự retry - bug thật đã gặp ở `cong-viec-dinh-ky/page.tsx` và
 * `TaskLinksModal.tsx` (2026-09-15, xem WORKFLOW_LOG).
 */
export const useCustomers = (params: CustomerFilterParams, enabled = true) => {
  return useQuery({
    queryKey: ['customers', params],
    queryFn: () => customersApi.getCustomers(params),
    placeholderData: keepPreviousData,
    enabled,
  });
};