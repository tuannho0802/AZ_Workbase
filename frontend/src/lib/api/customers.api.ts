import axiosInstance from './axios-instance';
import { Customer, PaginatedResponse, CustomerStats, Deposit } from '../types/customer.types';

export const customersApi = {
  getCustomers: async (params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    source?: string;
    salesUserId?: number;
    marketingUserId?: number;
    creatorId?: number;
    departmentId?: number;
    sortField?: string;
    sortOrder?: 'ASC' | 'DESC';
    dateFrom?: string;
    dateTo?: string;
    joinedGroups?: 'joined' | 'not_joined';
  }): Promise<PaginatedResponse<Customer>> => {
    const response = await axiosInstance.get('/customers', { params });
    return response.data;
  },

  // Danh sách "Người nhập Data" cho dropdown filter - CHỈ user đã từng tạo
  // >=1 khách hàng (tách riêng khỏi Marketing vì người nhập data có thể ở
  // phòng ban khác) - xem CustomersController.getCreators().
  getCreators: async (): Promise<{ id: number; name: string }[]> => {
    const response = await axiosInstance.get('/customers/creators');
    return response.data;
  },

  getStats: async (params?: Record<string, unknown>): Promise<CustomerStats> => {
    const response = await axiosInstance.get('/customers/stats', { params });
    return response.data;
  },

  getStatsToday: async (): Promise<{ todayList: Customer[]; historyList: Customer[] }> => {
    const response = await axiosInstance.get('/customers/stats/today');
    return response.data;
  },

  getStatsByStatus: async (): Promise<{ closed: Customer[]; notClosed: Customer[] }> => {
    const response = await axiosInstance.get('/customers/stats/by-status');
    return response.data;
  },

  /**
   * Report data cũ đang vi phạm quy tắc "Ngày nhập data không được ở
   * tương lai" (inputDate > hôm nay theo giờ VN) — hữu ích để rà soát các
   * bản ghi nhập sai từ trước khi có validation này.
   *
   * `invalidType` cũng nhận 'duplicate_phone'/'duplicate_email' (cảnh báo
   * khách hàng bị trùng SĐT/Email, không tính trùng Tên) — 2 loại này BE
   * trả kèm `duplicateGroupCount` (số GIÁ TRỊ đang bị trùng, khác `total`
   * là số DÒNG khách hàng) và mỗi dòng data có thêm `duplicateGroupKey` để
   * FE tô nhóm liền kề — xem customer.types.ts.
   */
  getInvalidDataReport: async (params?: {
    invalidType?: string;
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    // ⚠️ MỚI (yêu cầu người dùng): filter Người tạo/Sales phụ trách/
    // Marketing phụ trách - ĐÚNG tên param dùng chung với getCustomers().
    salesUserId?: number;
    marketingUserId?: number;
    creatorId?: number;
    // ⚠️ MỚI (yêu cầu người dùng: filter + cột "Đã tham gia nhóm") - ĐÚNG
    // tên param/kiểu dữ liệu dùng chung với getCustomers() ở /customers.
    joinedGroups?: 'joined' | 'not_joined';
  }): Promise<
    PaginatedResponse<Customer> & {
      checkedAgainst: string;
      invalidType: string;
      duplicateGroupCount?: number;
    }
  > => {
    const response = await axiosInstance.get('/customers/reports/invalid-data', { params });
    return response.data;
  },

  /**
   * Kiểm tra SĐT/Email đã tồn tại ở khách hàng khác (BẤT KỲ phạm vi nào,
   * không chỉ trong quyền xem của người gọi) TRƯỚC khi tạo/sửa - phục vụ
   * Modal cảnh báo "SĐT này đã được X thêm..." ở `CustomerForm.tsx`.
   * BE cố tình chỉ trả về thông tin TỐI THIỂU (không có id/SĐT/Email đầy
   * đủ/note của khách hàng đã tồn tại đó) - xem
   * `CustomersService.checkDuplicateContact()`.
   */
  checkDuplicateContact: async (params: {
    phone?: string;
    email?: string;
    excludeId?: number;
  }): Promise<{
    hasDuplicate: boolean;
    phoneMatch: { creatorName: string; salesUserName: string | null; groupNames: string[] } | null;
    emailMatch: { creatorName: string; salesUserName: string | null; groupNames: string[] } | null;
  }> => {
    const response = await axiosInstance.get('/customers/check-duplicate', { params });
    return response.data;
  },

  getAllDepositsStats: async (params?: { 
    startDate?: string; 
    endDate?: string;
    sortBy?: string;
    sortOrder?: 'ASC' | 'DESC';
  }): Promise<Deposit[]> => {
    const response = await axiosInstance.get('/customers/stats/deposits', { params });
    return response.data;
  },

  createCustomer: async (data: any): Promise<Customer> => {
    const response = await axiosInstance.post<Customer>('/customers', data);
    return response.data;
  },

  getCustomer: async (id: number): Promise<Customer> => {
    const response = await axiosInstance.get(`/customers/${id}`);
    return response.data;
  },

  updateCustomer: async (id: number, data: any): Promise<Customer> => {
    const response = await axiosInstance.patch<Customer>(`/customers/${id}`, data);
    return response.data;
  },

  createNote: async (id: number, data: { note: string; noteType?: string; isImportant?: boolean }) => {
    const response = await axiosInstance.post(`/customers/${id}/notes`, data);
    return response.data;
  },

  updateNote: async (
    customerId: number,
    noteId: number,
    data: { note?: string; noteType?: string; isImportant?: boolean },
  ) => {
    const response = await axiosInstance.patch(`/customers/${customerId}/notes/${noteId}`, data);
    return response.data;
  },

  deleteNote: async (customerId: number, noteId: number) => {
    const response = await axiosInstance.delete(`/customers/${customerId}/notes/${noteId}`);
    return response.data;
  },

  createDeposit: async (id: number, data: { amount: number; depositDate: string; broker?: string; note?: string }) => {
    const response = await axiosInstance.post(`/customers/${id}/deposits`, data);
    return response.data;
  },

  getCustomerDeposits: async (id: number): Promise<Deposit[]> => {
    const response = await axiosInstance.get(`/customers/${id}/deposits`);
    return response.data;
  },

  deleteDeposit: async (id: number) => {
    const response = await axiosInstance.delete(`/customers/deposits/${id}`);
    return response.data;
  },

  deleteCustomer: async (id: number) => {
    const response = await axiosInstance.delete(`/customers/${id}`);
    return response.data;
  },

  getTrash: async (params?: { page?: number; limit?: number; search?: string; source?: string; salesUserId?: number; deletedById?: number; dateFrom?: string; dateTo?: string }): Promise<PaginatedResponse<Customer>> => {
    const response = await axiosInstance.get('/customers/trash', { params });
    return response.data;
  },

  restoreCustomer: async (id: number) => {
    const response = await axiosInstance.patch(`/customers/trash/${id}/restore`);
    return response.data;
  },

  hardDeleteCustomer: async (id: number) => {
    const response = await axiosInstance.delete(`/customers/trash/${id}/hard-delete`);
    return response.data;
  },
};