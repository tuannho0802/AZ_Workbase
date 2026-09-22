import axiosInstance from './axios-instance';
import type {
  ListNotificationsParams,
  NotificationCategory,
  NotificationListResponse,
  NotificationPollResponse,
} from '../types/notification.types';

/**
 * Hộp thư CÁ NHÂN - chỉ cần đăng nhập (BE lấy `recipientId` từ JWT, không nhận
 * từ client). Khớp `NotificationsController` (`/notifications/*`).
 */
export const notificationsApi = {
  list: async (params: ListNotificationsParams = {}): Promise<NotificationListResponse> => {
    const response = await axiosInstance.get<NotificationListResponse>('/notifications', { params });
    return response.data;
  },

  /** Endpoint polling nhẹ (60s): số chưa đọc + version. */
  poll: async (): Promise<NotificationPollResponse> => {
    const response = await axiosInstance.get<NotificationPollResponse>('/notifications/poll');
    return response.data;
  },

  /** Idempotent - đã đọc rồi thì BE giữ nguyên `readAt` cũ. */
  markRead: async (id: number): Promise<{ id: number; isRead: true }> => {
    const response = await axiosInstance.patch<{ id: number; isRead: true }>(`/notifications/${id}/read`);
    return response.data;
  },

  markAllRead: async (category?: NotificationCategory): Promise<{ updated: number }> => {
    const response = await axiosInstance.patch<{ updated: number }>('/notifications/read-all', undefined, {
      params: category ? { category } : undefined,
    });
    return response.data;
  },

  /** Tự động: xoá dòng. Thủ công: chỉ ẨN khỏi hộp thư (BE lo phần này). */
  remove: async (id: number): Promise<{ id: number; removed: true }> => {
    const response = await axiosInstance.delete<{ id: number; removed: true }>(`/notifications/${id}`);
    return response.data;
  },

  /** Đảo ngược `remove()` cho thông báo thủ công đã ẩn - tab "Đã ẩn". */
  restore: async (id: number): Promise<{ id: number; restored: true }> => {
    const response = await axiosInstance.patch<{ id: number; restored: true }>(`/notifications/${id}/restore`);
    return response.data;
  },

  /**
   * Xoá VĨNH VIỄN (hard delete, không khôi phục được) - chỉ dùng ở tab "Đã ẩn"
   * cho thông báo đã qua bước `remove()`. BE chặn 404 nếu chưa ẩn trước.
   */
  purge: async (id: number): Promise<{ id: number; purged: true }> => {
    const response = await axiosInstance.delete<{ id: number; purged: true }>(`/notifications/${id}/permanent`);
    return response.data;
  },
};