import axiosInstance from './axios-instance';

export interface MediaSource {
  id: number;
  name: string;
  isLocked: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export const mediaSourcesApi = {
  /** activeOnly=true -> chỉ nguồn chưa khoá (dùng cho dropdown thêm khách hàng) */
  getAll: async (activeOnly = false): Promise<MediaSource[]> => {
    const response = await axiosInstance.get<MediaSource[]>('/media-sources', {
      params: activeOnly ? { activeOnly: true } : undefined,
    });
    return response.data;
  },

  create: async (data: { name: string; sortOrder?: number }): Promise<MediaSource> => {
    const response = await axiosInstance.post<MediaSource>('/media-sources', data);
    return response.data;
  },

  update: async (id: number, data: { name?: string; sortOrder?: number }): Promise<MediaSource> => {
    const response = await axiosInstance.patch<MediaSource>(`/media-sources/${id}`, data);
    return response.data;
  },

  lock: async (id: number): Promise<MediaSource> => {
    const response = await axiosInstance.patch<MediaSource>(`/media-sources/${id}/lock`);
    return response.data;
  },

  unlock: async (id: number): Promise<MediaSource> => {
    const response = await axiosInstance.patch<MediaSource>(`/media-sources/${id}/unlock`);
    return response.data;
  },

  remove: async (id: number): Promise<{ deleted: true }> => {
    const response = await axiosInstance.delete<{ deleted: true }>(`/media-sources/${id}`);
    return response.data;
  },
};
