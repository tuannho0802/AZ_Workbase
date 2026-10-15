import axiosInstance from './axios-instance';

/** 1 dòng trong danh sách IP bị khoá/đã sai gần đây (GET /security/ip-blocks). */
/** Cờ quốc gia do BE gắn cạnh mỗi IP (P3.6). `private` = IP mạng nội bộ (không thuộc quốc gia nào). */
export interface IpGeoFields {
    countryCode?: string | null;
    ipKind?: 'public' | 'private';
    /** 'manual' = Admin sửa tay. */
    geoSource?: 'vercel' | 'manual' | 'private' | 'unknown' | null;
}

export interface IpBlockItem extends IpGeoFields {
    id: number;
    ip: string;
    failedCount: number;
    lastEmail: string | null;
    /** Số giây còn khoá (0 = hiện không khoá, chỉ là bộ đếm gần đây). */
    lockedSeconds: number;
    /** Cập nhật gần nhất cách đây bao nhiêu giây (tính bằng đồng hồ DB, không lệch múi giờ). */
    updatedAgoSeconds: number;
}

export interface IpBlocksResponse {
    items: IpBlockItem[];
    config: { ipMaxFailedAttempts: number; ipWindowMinutes: number; ipLockMinutes: number };
}

/** 1 dòng whitelist IP (GET /security/ip-whitelist). */
export interface IpWhitelistItem extends IpGeoFields {
    id: number;
    ip: string;
    note: string | null;
    createdByName: string | null;
    createdAgoSeconds: number;
}
export interface IpWhitelistResponse { items: IpWhitelistItem[]; myIp: string | null; myIpCountryCode?: string | null; myIpKind?: 'public' | 'private' }

export type IpAccessOutcome = 'success' | 'wrong_password' | 'unknown_email' | 'account_locked' | 'ip_locked' | 'denied' | 'refresh_ok' | 'refresh_failed' | 'api';
export type IpCurrentStatus = 'normal' | 'whitelisted' | 'blocked' | 'banned';

/** 1 dòng blacklist IP (GET /security/ip-blacklist) — khoá CHỦ ĐỘNG (P3.7). `remainingSeconds = null` = vĩnh viễn. */
export interface IpBlacklistItem extends IpGeoFields {
    id: number;
    ip: string;
    reason: string | null;
    createdByName: string | null;
    remainingSeconds: number | null;
    createdAgoSeconds: number;
}
export interface IpBlacklistResponse { items: IpBlacklistItem[]; myIp: string | null }

/** 1 dòng "Theo dõi IP" (GET /security/ip-access). Thời gian là SỐ GIÂY TRƯỚC (BE tính, tránh lệch múi giờ). */
export interface IpAccessItem extends IpGeoFields {
    ip: string;
    totalHits: number;
    successHits: number;
    failedHits: number;
    blockedHits: number;
    suppressedHits: number;
    /** Request API đã đăng nhập (XẤP XỈ, gom thùng 1 phút) — đã gồm trong totalHits. */
    apiHits: number;
    lastOutcome: IpAccessOutcome | null;
    lastCountryCode?: string | null;
    firstSeenAgoSeconds: number;
    lastSeenAgoSeconds: number;
    currentStatus: IpCurrentStatus;
}
export interface IpAccessListResponse { items: IpAccessItem[]; total: number; page: number; limit: number }
export interface IpAccessLogRow {
    id: string; endpoint: string; endpointGroup: string | null; hitCount: number; lastStatus: number | null;
    outcome: IpAccessOutcome; ipStatus: IpCurrentStatus;
    userId: number | null; userName: string | null; email: string | null; userAgent: string | null; agoSeconds: number;
}
export interface IpAccessDetailResponse extends IpGeoFields {
    ip: string;
    summary: Omit<IpAccessItem, 'ip' | 'lastOutcome' | 'lastCountryCode' | keyof IpGeoFields>;
    total: number; page: number; limit: number;
    logs: IpAccessLogRow[];
}

export interface SecurityEvent {
  id: number;
  userId: number | null;
  action: string;
  ipAddress: string | null;
  userAgent: string | null;
  newData: { email?: string; [k: string]: unknown } | null;
  createdAt: string;
  user: { id: number; name: string; email: string } | null;
  countryCode?: string | null;
  ipKind?: 'public' | 'private';
  geoSource?: string | null;
}
export interface SecurityEventsResponse { data: SecurityEvent[]; total: number; page: number; limit: number; totalPages: number }
export interface SecuritySummary {
  lockedToday: number; failedToday: number; blockedIpsNow: number;
  topUnknownEmails: Array<{ email: string; count: number }>;
}
export interface SecurityConfigValues {
  accountMaxFailedAttempts: number; accountLockMinutes: number; ipMaxFailedAttempts: number;
  ipWindowMinutes: number; ipLockMinutes: number; securityEventRetentionDays: number;
  ipAccessLogRetentionDays: number; ipAccessDetailCapPerHour: number; ipAccessLogApiEnabled: number;
}
export interface SecurityEventsParams {
  page?: number; limit?: number; action?: string; ip?: string; search?: string; fromDate?: string; toDate?: string;
}

export const securityApi = {
  getEvents: async (params: SecurityEventsParams): Promise<SecurityEventsResponse> =>
    (await axiosInstance.get('/security/events', { params })).data,
  getSummary: async (): Promise<SecuritySummary> => (await axiosInstance.get('/security/summary')).data,
  getActions: async (): Promise<string[]> => (await axiosInstance.get('/security/actions')).data,
  getConfig: async (): Promise<{ config: SecurityConfigValues; limits: Record<keyof SecurityConfigValues, [number, number]> }> =>
    (await axiosInstance.get('/security/config')).data,
  updateConfig: async (patch: Partial<SecurityConfigValues>): Promise<{ config: SecurityConfigValues; changed: string[] }> =>
    (await axiosInstance.put('/security/config', patch)).data,

    // Cần `users.manage` với phạm vi toàn hệ thống (BE trả 403 nếu chỉ scope department).
    getIpBlocks: async (): Promise<IpBlocksResponse> => {
        const response = await axiosInstance.get<IpBlocksResponse>('/security/ip-blocks');
        return response.data;
    },

    // IPv6 chứa ':' nên phải encodeURIComponent.
    unblockIp: async (ip: string): Promise<{ success: boolean; message: string }> => {
        const response = await axiosInstance.delete(`/security/ip-blocks/${encodeURIComponent(ip)}`);
        return response.data;
    },

    // P3.5 — whitelist IP: miễn khoá theo IP (khoá email/tài khoản vẫn như thường).
    getIpWhitelist: async (): Promise<IpWhitelistResponse> => (await axiosInstance.get<IpWhitelistResponse>('/security/ip-whitelist')).data,
    addIpWhitelist: async (ip: string, note?: string): Promise<{ success: boolean; ip: string; clearedBlock: boolean; removedBlacklist?: boolean }> =>
        (await axiosInstance.post('/security/ip-whitelist', { ip, note: note || undefined })).data,
    // P3.6 — quốc gia của IP (sửa tay) + theo dõi lượt truy cập IP. Cần `users.manage` phạm vi `all`.
    setIpCountry: async (ip: string, countryCode: string): Promise<{ success: boolean; ip: string; countryCode: string }> =>
        (await axiosInstance.put(`/security/ip-geo/${encodeURIComponent(ip)}`, { countryCode })).data,
    clearIpCountry: async (ip: string): Promise<{ success: boolean }> =>
        (await axiosInstance.delete(`/security/ip-geo/${encodeURIComponent(ip)}`)).data,
    getIpAccess: async (params: { page?: number; limit?: number; status?: 'all' | 'blocked' | 'whitelisted' | 'banned'; search?: string; fromDate?: string; toDate?: string }): Promise<IpAccessListResponse> =>
        (await axiosInstance.get('/security/ip-access', { params })).data,
    getIpAccessDetail: async (ip: string, params: { page?: number; limit?: number; outcome?: IpAccessOutcome; fromDate?: string; toDate?: string }): Promise<IpAccessDetailResponse> =>
        (await axiosInstance.get(`/security/ip-access/${encodeURIComponent(ip)}`, { params })).data,

    // P3.7 — blacklist IP: chặn CHỦ ĐỘNG (có hạn hoặc vĩnh viễn). `durationHours` null/bỏ trống = vĩnh viễn.
    getIpBlacklist: async (): Promise<IpBlacklistResponse> => (await axiosInstance.get<IpBlacklistResponse>('/security/ip-blacklist')).data,
    addIpBlacklist: async (ip: string, reason?: string, durationHours?: number | null): Promise<{ success: boolean; ip: string; durationHours: number | null; removedWhitelist: boolean }> =>
        (await axiosInstance.post('/security/ip-blacklist', { ip, reason: reason || undefined, durationHours: durationHours ?? undefined })).data,
    removeIpBlacklist: async (ip: string): Promise<{ success: boolean }> =>
        (await axiosInstance.delete(`/security/ip-blacklist/${encodeURIComponent(ip)}`)).data,

    removeIpWhitelist: async (ip: string): Promise<{ success: boolean }> =>
        (await axiosInstance.delete(`/security/ip-whitelist/${encodeURIComponent(ip)}`)).data,
};