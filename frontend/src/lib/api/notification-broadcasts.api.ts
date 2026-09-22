import axiosInstance from './axios-instance';

/**
 * Client cho `/notification-broadcasts/*` (Thông báo THỦ CÔNG - PLAN mục
 * 6.7/7.7, M1+M2). Khác `notifications.api.ts` (hộp thư cá nhân): đây là
 * soạn/gửi + quản lý (Sửa/Xoá) - gate bằng permission động
 * `notification_broadcasts.view/create/edit/delete`.
 */

export type BroadcastAudienceType = 'USERS' | 'DEPARTMENTS' | 'ALL';

export interface BroadcastAudiencePayload {
  type: BroadcastAudienceType;
  userIds?: number[];
  departmentIds?: number[];
}

export interface PreviewBroadcastResponse {
  recipientCount: number;
  sample: string[];
  excludedCount: number;
}

export interface SendBroadcastResponse {
  id: number;
  recipientCount: number;
}

export interface BroadcastListItem {
  id: number;
  title: string;
  body: string;
  senderId: number | null;
  senderName: string | null;
  audienceType: BroadcastAudienceType;
  audienceParams: { userIds?: number[]; departmentIds?: number[] } | null;
  recipientCount: number;
  readCount: number;
  unreadCount: number;
  createdAt: string;
  updatedAt: string | null;
}

export interface ListSentResponse {
  data: BroadcastListItem[];
  nextCursor: string | null;
}

export type BroadcastRecipientStatus = 'all' | 'read' | 'unread';

export interface BroadcastRecipient {
  notificationId: number;
  userId: number;
  name: string | null;
  department: string | null;
  isActive: boolean;
  isRead: boolean;
  readAt: string | null;
  dismissed: boolean;
}

export interface ListRecipientsResponse {
  data: BroadcastRecipient[];
  nextCursor: number | null;
}

export const notificationBroadcastsApi = {
  preview: async (audience: BroadcastAudiencePayload): Promise<PreviewBroadcastResponse> => {
    const response = await axiosInstance.post<PreviewBroadcastResponse>(
      '/notification-broadcasts/preview',
      { audience },
    );
    return response.data;
  },

  send: async (payload: {
    title: string;
    body: string;
    audience: BroadcastAudiencePayload;
  }): Promise<SendBroadcastResponse> => {
    const response = await axiosInstance.post<SendBroadcastResponse>(
      '/notification-broadcasts',
      payload,
    );
    return response.data;
  },

  listSent: async (params: { cursor?: string; limit?: number } = {}): Promise<ListSentResponse> => {
    const response = await axiosInstance.get<ListSentResponse>('/notification-broadcasts', { params });
    return response.data;
  },

  getOne: async (id: number): Promise<BroadcastListItem> => {
    const response = await axiosInstance.get<BroadcastListItem>(`/notification-broadcasts/${id}`);
    return response.data;
  },

  listRecipients: async (
    id: number,
    params: { status?: BroadcastRecipientStatus; search?: string; cursor?: number; limit?: number } = {},
  ): Promise<ListRecipientsResponse> => {
    const response = await axiosInstance.get<ListRecipientsResponse>(
      `/notification-broadcasts/${id}/recipients`,
      { params },
    );
    return response.data;
  },

  update: async (
    id: number,
    payload: { title?: string; body?: string },
  ): Promise<BroadcastListItem> => {
    const response = await axiosInstance.patch<BroadcastListItem>(
      `/notification-broadcasts/${id}`,
      payload,
    );
    return response.data;
  },

  remove: async (id: number): Promise<{ id: number; removed: true }> => {
    const response = await axiosInstance.delete<{ id: number; removed: true }>(
      `/notification-broadcasts/${id}`,
    );
    return response.data;
  },
};
