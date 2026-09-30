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
  /** Chỉ có ở Mini Table của tab Thống kê (khách của nhiều UTM nên cần biết UTM nào). */
  utmId?: number | null;
  utm?: { id: number; name: string; color: string; isActive: boolean } | null;
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

/** Khớp `UtmStatsResult` bên BE (utm-stats.service.ts) - tab "Thống kê" của trang Quản lý UTM. */
export interface UtmStatsStatus {
  code: string;
  name: string;
  color: string;
}

export interface UtmStatsPoint {
  /** 'YYYY-MM-DD' (granularity=day) hoặc 'YYYY-MM' (granularity=month). */
  date: string;
  total: number;
  byStatus: Record<string, number>;
}

export interface UtmStatsUtmRow {
  utmId: number;
  total: number;
  byStatus: Record<string, number>;
}

/** UTM trong phạm vi utms.view kèm Quản lý chính/phụ - nguồn dựng dropdown lọc nhanh của tab Thống kê. */
export interface UtmStatsUtmBrief {
  id: number;
  name: string;
  color: string;
  isActive: boolean;
  primaryManager: { id: number; name: string } | null;
  secondaryManagers: Array<{ id: number; name: string }>;
}

export interface UtmStatsResult {
  range: { from: string; to: string; granularity: 'day' | 'month' };
  /** Scope `utms.view` của người xem: own / department / all. */
  utmScope: 'own' | 'department' | 'all' | string;
  /** Scope `customers.view` áp lên khách; null = không xem được khách nào. */
  customerScope: string | null;
  utmCount: number;
  statuses: UtmStatsStatus[];
  utms: UtmStatsUtmBrief[];
  totals: { total: number; byStatus: Record<string, number> };
  series: UtmStatsPoint[];
  byUtm: UtmStatsUtmRow[];
}

export interface UtmStatsParams {
  from?: string;
  to?: string;
  utmId?: number;
  /** Chỉ các UTM này (BE nhận `1,2,3`). Rỗng/undefined = không lọc theo ID. */
  utmIds?: number[];
  /** Chỉ UTM có Quản lý CHÍNH là user này. */
  primaryManagerId?: number;
  /** Chỉ UTM có user này là Quản lý PHỤ. */
  secondaryManagerId?: number;
}

/** Mini Table khách của tab Thống kê = bộ lọc thống kê + trạng thái/tìm kiếm/phân trang. */
export interface UtmStatsCustomersParams extends UtmStatsParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
}

/** Kết quả thao tác hàng loạt (BE luôn trả 200; từng ID lỗi nằm trong `failed`). */
export interface BulkResult {
  succeeded: number[];
  failed: Array<{ id: number; reason: string }>;
}

/**
 * Axios mặc định gửi mảng dạng `utmIds[]=1&utmIds[]=2` (BE không hiểu) -> gộp thành `utmIds=1,2`.
 * Mảng rỗng bị bỏ hẳn (= không lọc).
 */
export function serializeStatsParams<T extends UtmStatsParams>(params: T): Omit<T, 'utmIds'> & { utmIds?: string } {
  const { utmIds, ...rest } = params;
  return { ...rest, ...(utmIds && utmIds.length > 0 ? { utmIds: utmIds.join(',') } : {}) };
}

export const utmsApi = {
  /** Dropdown: UTM ĐƯỢC PHÉP DÙNG - mọi role đăng nhập (BE không gắn permission). */
  getUsable: async (params?: { q?: string; activeOnly?: boolean; limit?: number }): Promise<UtmOption[]> =>
    (await axiosInstance.get<UtmOption[]>('/utms', { params })).data,

  getRecent: async (): Promise<UtmBrief[]> => (await axiosInstance.get<UtmBrief[]>('/utms/recent')).data,

  getManagedByMe: async (): Promise<UtmView[]> => (await axiosInstance.get<UtmView[]>('/utms/managed-by-me')).data,

  /** Tab "Tất cả UTM" - cần `utms.view` (scope lọc ở BE). */
  getScoped: async (): Promise<UtmView[]> => (await axiosInstance.get<UtmView[]>('/utms/scoped')).data,

  /** Tab "Thống kê" - cần `utms.view` (UTM lọc theo scope) + khách luôn lọc theo `customers.view`. */
  getStats: async (params: UtmStatsParams): Promise<UtmStatsResult> =>
    (await axiosInstance.get<UtmStatsResult>('/utms/stats', { params: serializeStatsParams(params) })).data,

  /** Mini Table khách khi bấm chart/card của tab Thống kê - cần `utms.view`; khách luôn lọc theo `customers.view`. */
  getStatsCustomers: async (params: UtmStatsCustomersParams): Promise<UtmCustomersResponse> =>
    (await axiosInstance.get<UtmCustomersResponse>('/utms/stats/customers', { params: serializeStatsParams(params) })).data,

  getOne: async (id: number): Promise<UtmView> => (await axiosInstance.get<UtmView>(`/utms/${id}`)).data,

  create: async (data: CreateUtmPayload): Promise<UtmView> => (await axiosInstance.post<UtmView>('/utms', data)).data,

  update: async (id: number, data: Partial<CreateUtmPayload>): Promise<UtmView> =>
    (await axiosInstance.patch<UtmView>(`/utms/${id}`, data)).data,

  deactivate: async (id: number): Promise<UtmView> => (await axiosInstance.patch<UtmView>(`/utms/${id}/deactivate`)).data,

  activate: async (id: number): Promise<UtmView> => (await axiosInstance.patch<UtmView>(`/utms/${id}/activate`)).data,

  remove: async (id: number): Promise<{ success: true }> => (await axiosInstance.delete(`/utms/${id}`)).data,

  bulkSetActive: async (ids: number[], active: boolean): Promise<BulkResult> =>
    (await axiosInstance.post<BulkResult>('/utms/bulk/status', { ids, active })).data,

  bulkDelete: async (ids: number[]): Promise<BulkResult> =>
    (await axiosInstance.post<BulkResult>('/utms/bulk/delete', { ids })).data,

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
