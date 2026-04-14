import axiosInstance from './axios-instance';
import { PaginatedResponse, Customer } from '../types/customer.types';

export interface AssignmentHistory {
  id: number;
  customerId: number;
  assignedById: number;
  assignedToId: number;
  previousAssigneeId: number | null;
  status: 'active' | 'transferred' | 'reclaimed';
  reason: string | null;
  assignedAt: string;
  reclaimedAt: string | null;
  assignedBy?: { id: number; name: string; email?: string };
  assignedTo?: { id: number; name: string; email?: string };
  previousAssignee?: { id: number; name: string; email?: string } | null;
}

export const assignmentsApi = {
  /** Lấy danh sách khách hàng chưa được assign */
  getUnassigned: async (params?: {
    page?: number;
    limit?: number;
    search?: string;
    source?: string;
    creatorId?: number;  // lọc theo người tạo (Data Owner)
  }): Promise<PaginatedResponse<Customer>> => {
    const response = await axiosInstance.get('/customers/unassigned', { params });
    return response.data;
  },

  /** Gán hàng loạt khách hàng cho nhiều Sales (1:N) */
  bulkAssign: async (data: {
    customerIds: number[];
    salesUserIds: number[];
    reason?: string;
  }) => {
    const response = await axiosInstance.patch('/customers/bulk-assign', data);
    return response.data;
  },

  /** Lịch sử gán của 1 khách hàng */
  getAssignmentHistory: async (customerId: number): Promise<AssignmentHistory[]> => {
    const response = await axiosInstance.get(`/customers/${customerId}/assignment-history`);
    return response.data;
  },

  /** Lấy danh sách khách hàng đã được gán */
  getAssignedCustomers: async (params: {
    page?: number;
    limit?: number;
    salesUserId?: number;
    sourceUserId?: number;
    search?: string;
  }) => {
    const response = await axiosInstance.get('/customers/assigned', { params });
    return response.data;
  },
};
