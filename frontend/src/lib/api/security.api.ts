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

export const securityApi = {
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