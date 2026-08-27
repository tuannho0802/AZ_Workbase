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
  // "Quản lý chính" - chỉ admin gán/đổi được (PATCH /link-groups/:id).
  primaryManagerId?: number | null;
  primaryManager?: { id: number; name: string; email: string } | null;
  // "Quản lý phụ" - quản lý qua GroupManagersModal (endpoint /link-groups/:id/managers riêng).
  secondaryManagers?: { user: { id: number; name: string; email: string } }[];
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

// ── Quản lý chính/phụ theo từng LinkGroup ──
// Khớp với `GroupManagersResult` bên backend (LinkGroupManagersService).
export interface GroupManagerUser {
  id: number;
  name: string;
  email: string;
  role: string;
}

export interface SecondaryManagerUser extends GroupManagerUser {
  addedAt: string;
}

export interface GroupManagersResult {
  groupId: number;
  groupName: string;
  primaryManager: GroupManagerUser | null;
  secondaryManagers: SecondaryManagerUser[];
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

  create: async (data: {
    categoryId: number;
    name: string;
    url: string;
    sortOrder?: number;
    // ID "Quản lý chính" - chỉ admin được set (khớp CreateLinkGroupDto ở BE).
    primaryManagerId?: number | null;
  }): Promise<LinkGroup> => {
    const response = await axiosInstance.post<LinkGroup>('/link-groups', data);
    return response.data;
  },

  update: async (
    id: number,
    data: { name?: string; url?: string; sortOrder?: number; primaryManagerId?: number | null },
  ): Promise<LinkGroup> => {
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

export const linkGroupManagersApi = {
  /**
   * Danh sách nhóm mà user hiện tại được xem trong tính năng "Quản lý nhóm
   * liên kết" - admin thấy TẤT CẢ, user thường CHỈ thấy nhóm mình là Quản
   * lý chính hoặc phụ. Khớp GET /link-groups/managed-by-me ở BE.
   */
  listManagedByMe: async (): Promise<GroupManagersResult[]> => {
    const response = await axiosInstance.get<GroupManagersResult[]>('/link-groups/managed-by-me');
    return response.data;
  },

  /** Xem quản lý chính/phụ của 1 group - BE tự chặn 403 nếu không liên quan */
  getManagers: async (groupId: number): Promise<GroupManagersResult> => {
    const response = await axiosInstance.get<GroupManagersResult>(`/link-groups/${groupId}/managers`);
    return response.data;
  },

  /** Thêm 1 Quản lý phụ - chỉ admin hoặc chính Quản lý chính của nhóm đó */
  addSecondaryManager: async (groupId: number, userId: number): Promise<GroupManagersResult> => {
    const response = await axiosInstance.post<GroupManagersResult>(`/link-groups/${groupId}/managers`, {
      userId,
    });
    return response.data;
  },

  /** Gỡ 1 Quản lý phụ - chỉ admin hoặc chính Quản lý chính của nhóm đó */
  removeSecondaryManager: async (groupId: number, userId: number): Promise<GroupManagersResult> => {
    const response = await axiosInstance.delete<GroupManagersResult>(
      `/link-groups/${groupId}/managers/${userId}`,
    );
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