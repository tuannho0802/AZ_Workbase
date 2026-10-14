import axiosInstance from './axios-instance';

/** 1 dòng trong danh sách IP bị khoá/đã sai gần đây (GET /security/ip-blocks). */
export interface IpBlockItem {
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

export interface SecurityEvent {
  id: number;
  userId: number | null;
  action: string;
  ipAddress: string | null;
  userAgent: string | null;
  newData: { email?: string; [k: string]: unknown } | null;
  createdAt: string;
  user: { id: number; name: string; email: string } | null;
}
export interface SecurityEventsResponse { data: SecurityEvent[]; total: number; page: number; limit: number; totalPages: number }
export interface SecuritySummary {
  lockedToday: number; failedToday: number; blockedIpsNow: number;
  topUnknownEmails: Array<{ email: string; count: number }>;
}
export interface SecurityConfigValues {
  accountMaxFailedAttempts: number; accountLockMinutes: number; ipMaxFailedAttempts: number;
  ipWindowMinutes: number; ipLockMinutes: number; securityEventRetentionDays: number;
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
};