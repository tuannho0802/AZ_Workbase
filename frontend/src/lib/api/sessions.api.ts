import axiosInstance from './axios-instance';

/** 1 thiết bị (phiên) đang đăng nhập - thời gian là SỐ GIÂY trước (BE tính, tránh lệch múi giờ); không có hash. */
export interface SessionView {
    countryCode?: string | null;
    ipKind?: 'public' | 'private';
    geoSource?: string | null;
    id: string;
    device: string;
    ip: string | null;
    createdAgoSeconds: number;
    lastActiveAgoSeconds: number;
    isCurrent: boolean;
}

export const sessionsApi = {
    // ── Của chính mình ──
    listMine: async (): Promise<{ sessions: SessionView[]; currentSid: string | null }> => {
        const res = await axiosInstance.get('/auth/sessions');
        return res.data;
    },
    revokeMine: async (sid: string): Promise<{ success: boolean; removed: number; loggedOutCurrent: boolean }> => {
        const res = await axiosInstance.delete(`/auth/sessions/${encodeURIComponent(sid)}`);
        return res.data;
    },
    revokeMyOthers: async (): Promise<{ success: boolean; removed: number }> => {
        const res = await axiosInstance.delete('/auth/sessions');
        return res.data;
    },

    // ── Admin/Manager: thiết bị của nhân viên (cần `users.sessions`) ──
    listOfUser: async (userId: number): Promise<{ user: { id: number; name: string }; sessions: SessionView[] }> => {
        const res = await axiosInstance.get(`/users/${userId}/sessions`);
        return res.data;
    },
    revokeOfUser: async (userId: number, sid: string): Promise<{ success: boolean; removed: number }> => {
        const res = await axiosInstance.delete(`/users/${userId}/sessions/${encodeURIComponent(sid)}`);
        return res.data;
    },
    revokeAllOfUser: async (userId: number): Promise<{ success: boolean; removed: number }> => {
        const res = await axiosInstance.delete(`/users/${userId}/sessions`);
        return res.data;
    },
};
