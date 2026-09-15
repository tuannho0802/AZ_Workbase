import axiosInstance from './axios-instance';
import { Customer } from '../types/customer.types';

/**
 * periodicTaskCustomersApi - Phase 3 (PLAN_PERIODIC_TASKS_MODULE.md mục 2.4,
 * 5): gắn Khách hàng vào Công việc định kỳ, kèm ẩn field theo quyền.
 * Khớp đúng 2 endpoint của `PeriodicTasksController` phần "Phase 3":
 *   POST   /periodic-tasks/:id/customers   (body: { customerIds: number[] })
 *   DELETE /periodic-tasks/:id/customers/:customerId
 *
 * ⚠️ 2 lớp quyền BE đều tự kiểm tra lại 100% (`PeriodicTaskCustomersService`):
 * `periodic_tasks.edit` (gate ở Controller) + `periodic_tasks.link_customer`
 * (tự inject `PermissionsService`, check thêm trong Service) - FE chỉ ẩn UI
 * cho gọn (`can('periodic_tasks.link_customer')`), KHÔNG phải lớp bảo vệ
 * duy nhất. Danh sách Customer trả về (add) hoặc đính vào Task (`GET /:id`)
 * đã được BE lọc lại đúng phạm vi `customers.view` của người ĐANG XEM.
 */
export const periodicTaskCustomersApi = {
  /** Gắn thêm danh sách Customer vào Task - trả lại toàn bộ danh sách Customer
   * đã gắn (mới nhất, đã lọc theo quyền), không phải chỉ phần vừa thêm. */
  addCustomers: async (taskId: number, customerIds: number[]): Promise<Customer[]> => {
    const response = await axiosInstance.post<Customer[]>(`/periodic-tasks/${taskId}/customers`, {
      customerIds,
    });
    return response.data;
  },

  /** Gỡ 1 Customer khỏi Task. */
  removeCustomer: async (taskId: number, customerId: number): Promise<{ deleted: true }> => {
    const response = await axiosInstance.delete<{ deleted: true }>(
      `/periodic-tasks/${taskId}/customers/${customerId}`,
    );
    return response.data;
  },
};
