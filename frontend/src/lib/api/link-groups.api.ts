import axiosInstance from './axios-instance';

export interface LinkCategory {
  id: number;
  name: string;
  color: string;
  isLocked: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface LinkGroup {
  id: number;
  categoryId: number;
  name: string;
  url: string;
  isActive: boolean;
  sortOrder: number;
  category?: LinkCategory;
  createdAt: string;
  updatedAt: string;
}

export interface GroupMembershipRow {
  categoryId: number;
  categoryName: string;
  categoryColor: string;
  groupId: number;
  groupName: string;
  groupUrl: string;
  joined: boolean;
  joinedAt: string | null;
}

export const linkCategoriesApi = {
  /** activeOnly=true -> chỉ category chưa khoá (dùng cho dropdown chọn khi tạo group / lọc theo nguồn) */
  getAll: async (activeOnly = false): Promise<LinkCategory[]> => {
    const response = await axiosInstance.get<LinkCategory[]>('/link-categories', {
      params: activeOnly ? { activeOnly: true } : undefined,
    });
    return response.data;
  },

  create: async (data: { name: string; color?: string; sortOrder?: number }): Promise<LinkCategory> => {
    const response = await axiosInstance.post<LinkCategory>('/link-categories', data);
    return response.data;
  },

  update: async (id: number, data: { name?: string; color?: string; sortOrder?: number }): Promise<LinkCategory> => {
    const response = await axiosInstance.patch<LinkCategory>(`/link-categories/${id}`, data);
    return response.data;
  },

  lock: async (id: number): Promise<LinkCategory> => {
    const response = await axiosInstance.patch<LinkCategory>(`/link-categories/${id}/lock`);
    return response.data;
  },

  unlock: async (id: number): Promise<LinkCategory> => {
    const response = await axiosInstance.patch<LinkCategory>(`/link-categories/${id}/unlock`);
    return response.data;
  },

  remove: async (id: number): Promise<{ deleted: true }> => {
    const response = await axiosInstance.delete<{ deleted: true }>(`/link-categories/${id}`);
    return response.data;
  },
};

export const linkGroupsApi = {
  /**
   * @param categoryId lọc theo 1 category cụ thể (optional).
   * @param activeOnly true = chỉ lấy group chưa bị ẩn.
   */
  getAll: async (categoryId?: number, activeOnly = false): Promise<LinkGroup[]> => {
    const response = await axiosInstance.get<LinkGroup[]>('/link-groups', {
      params: {
        ...(categoryId != null ? { categoryId } : {}),
        ...(activeOnly ? { activeOnly: true } : {}),
      },
    });
    return response.data;
  },

  create: async (data: { categoryId: number; name: string; url: string; sortOrder?: number }): Promise<LinkGroup> => {
    const response = await axiosInstance.post<LinkGroup>('/link-groups', data);
    return response.data;
  },

  update: async (id: number, data: { name?: string; url?: string; sortOrder?: number }): Promise<LinkGroup> => {
    const response = await axiosInstance.patch<LinkGroup>(`/link-groups/${id}`, data);
    return response.data;
  },

  activate: async (id: number): Promise<LinkGroup> => {
    const response = await axiosInstance.patch<LinkGroup>(`/link-groups/${id}/activate`);
    return response.data;
  },

  deactivate: async (id: number): Promise<LinkGroup> => {
    const response = await axiosInstance.patch<LinkGroup>(`/link-groups/${id}/deactivate`);
    return response.data;
  },

  remove: async (id: number): Promise<{ deleted: true }> => {
    const response = await axiosInstance.delete<{ deleted: true }>(`/link-groups/${id}`);
    return response.data;
  },
};

export const customerGroupMembershipsApi = {
  /** Checklist toàn bộ group đang active (kèm category) + trạng thái đã join của 1 customer */
  getForCustomer: async (customerId: number): Promise<GroupMembershipRow[]> => {
    const response = await axiosInstance.get<GroupMembershipRow[]>(
      `/customers/${customerId}/group-memberships`,
    );
    return response.data;
  },

  setMembership: async (customerId: number, groupId: number, joined: boolean) => {
    const response = await axiosInstance.patch(
      `/customers/${customerId}/group-memberships/${groupId}`,
      { joined },
    );
    return response.data;
  },
};
