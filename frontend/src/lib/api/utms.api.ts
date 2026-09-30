import axiosInstance from './axios-instance';

// Khớp `UtmView`/`UtmManagersResult` bên BE (utms.service.ts, utm-managers.service.ts).
export type UtmVisibility = 'shared' | 'restricted';

export interface UtmCapabilities {
  canEditIdentity: boolean;
  canEditMeta: boolean;
  canAssign: boolean;
  canDelete: boolean;
}

export interface UtmView {
  id: number;
  name: string;
  description: string | null;
  color: string;
  visibility: UtmVisibility;
  isActive: boolean;
  /** Thời điểm khoá gần nhất - chỉ có khi isActive = false. */
  lockedAt: string | null;
  sortOrder: number;
  primaryManager: { id: number; name: string; role?: string } | null;
  secondaryManagers: Array<{ id: number; name: string; role?: string }>;
  myRole: 'primary' | 'secondary' | null;
  capabilities: UtmCapabilities;
  createdAt: string;
  updatedAt: string;
}

/** Item của `GET /utms` (dropdown) - gọn hơn UtmView. */
export interface UtmOption {
  id: number;
  name: string;
  description: string | null;
  color: string;
  visibility: UtmVisibility;
  isActive: boolean;
  primaryManagerId: number | null;
  myRole: 'primary' | 'secondary' | null;
}

export interface UtmBrief {
  id: number;
  name: string;
  color: string;
}

export interface UtmManagerUser {
  id: number;
  name: string;
  email: string;
  role: string;
}

export interface UtmManagersResult {
  utmId: number;
  utmName: string;
  primaryManager: UtmManagerUser | null;
  secondaryManagers: Array<UtmManagerUser & { addedAt: string }>;
  canEdit: boolean;
}

export interface UtmDuplicateGroup {
  utms: Array<{ id: number; name: string; isActive: boolean; customerCount: number }>;
}

export interface UtmCustomerRow {
  id: number;
  name: string;
  phone: string | null;
  source: string;
  status: string;
  inputDate: string | null;
  createdAt: string;
  /** Có giá trị = khách đang nằm trong Thùng rác (chỉ xuất hiện khi gọi với `trashed` include/only). */
  deletedAt?: string | null;
  salesUser?: { id: number; name: string } | null;
  marketingUser?: { id: number; name: string } | null;
}

export interface UtmCustomersParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  /** exclude (mặc định) | include (lẫn Thùng rác) | only (chỉ Thùng rác) - include/only đòi `customers.trash_manage`. */
  trashed?: 'exclude' | 'include' | 'only';
}

export interface UtmCustomersResponse {
  data: UtmCustomerRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CreateUtmPayload {
  name: string;
  description?: string | null;
  color?: string;
  visibility?: UtmVisibility;
}

export const utmsApi = {
  /** Dropdown: UTM ĐƯỢC PHÉP DÙNG - mọi role đăng nhập (BE không gắn permission). */
  getUsable: async (params?: { q?: string; activeOnly?: boolean; limit?: number }): Promise<UtmOption[]> =>
    (await axiosInstance.get<UtmOption[]>('/utms', { params })).data,

  getRecent: async (): Promise<UtmBrief[]> => (await axiosInstance.get<UtmBrief[]>('/utms/recent')).data,

  getManagedByMe: async (): Promise<UtmView[]> => (await axiosInstance.get<UtmView[]>('/utms/managed-by-me')).data,

  /** Tab "Tất cả UTM" - cần `utms.view` (scope lọc ở BE). */
  getScoped: async (): Promise<UtmView[]> => (await axiosInstance.get<UtmView[]>('/utms/scoped')).data,

  getOne: async (id: number): Promise<UtmView> => (await axiosInstance.get<UtmView>(`/utms/${id}`)).data,

  create: async (data: CreateUtmPayload): Promise<UtmView> => (await axiosInstance.post<UtmView>('/utms', data)).data,

  update: async (id: number, data: Partial<CreateUtmPayload>): Promise<UtmView> =>
    (await axiosInstance.patch<UtmView>(`/utms/${id}`, data)).data,

  deactivate: async (id: number): Promise<UtmView> => (await axiosInstance.patch<UtmView>(`/utms/${id}/deactivate`)).data,

  activate: async (id: number): Promise<UtmView> => (await axiosInstance.patch<UtmView>(`/utms/${id}/activate`)).data,

  remove: async (id: number): Promise<{ success: true }> => (await axiosInstance.delete(`/utms/${id}`)).data,

  /** `{ [utmId]: số KH }` đã áp scope `customers.view` - cần `customers.view`. */
  getCustomerCounts: async (): Promise<Record<number, number>> =>
    (await axiosInstance.get<Record<number, number>>('/utms/customer-counts')).data,

  getCustomers: async (id: number, params: UtmCustomersParams): Promise<UtmCustomersResponse> =>
    (await axiosInstance.get<UtmCustomersResponse>(`/utms/${id}/customers`, { params })).data,

  getDuplicates: async (): Promise<UtmDuplicateGroup[]> =>
    (await axiosInstance.get<UtmDuplicateGroup[]>('/utms/duplicates')).data,

  merge: async (sourceId: number, targetId: number): Promise<{ success: true; movedCustomers: number; target: UtmView }> =>
    (await axiosInstance.post(`/utms/${sourceId}/merge`, { targetId })).data,

  // ── Quản lý chính/phụ ──
  getManagers: async (id: number): Promise<UtmManagersResult> =>
    (await axiosInstance.get<UtmManagersResult>(`/utms/${id}/managers`)).data,

  addManager: async (id: number, userId: number): Promise<UtmManagersResult> =>
    (await axiosInstance.post<UtmManagersResult>(`/utms/${id}/managers`, { userId })).data,

  removeManager: async (id: number, userId: number): Promise<UtmManagersResult> =>
    (await axiosInstance.delete<UtmManagersResult>(`/utms/${id}/managers/${userId}`)).data,

  transferPrimary: async (id: number, userId: number): Promise<UtmManagersResult> =>
    (await axiosInstance.patch<UtmManagersResult>(`/utms/${id}/primary-manager`, { userId })).data,
};
