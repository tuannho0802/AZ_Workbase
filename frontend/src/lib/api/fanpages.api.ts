import axiosInstance from './axios-instance';

export interface FanpagePlatform {
    id: number;
    name: string;
    color: string;
    isActive: boolean;
    sortOrder: number;
    /** Domain phân tách bằng dấu phẩy ("facebook.com,fb.com") - dùng tự nhận nền tảng khi dán link. */
    urlDomains?: string | null;
    /** Số Page đang dùng nền tảng này (chỉ có ở GET /fanpage-platforms). */
    fanpageCount?: number;
}

/** 5 trạng thái nhịp đăng - DO BE TÍNH (FE chỉ hiển thị, không tự tính lại). */
export type FanpageCadenceState = 'paused' | 'new' | 'silent' | 'at_risk' | 'ok';

export interface FanpageCadence {
    state: FanpageCadenceState;
    daysSinceLastPost: number | null;
    weekCount: number;
    target: number | null;
    /** Số ngày liên tiếp có bài (BE chặn trần 30). */
    streak: number;
    postedToday: boolean;
}

export interface FanpageHealthBrief {
    id: number;
    name: string;
    color: string;
    isBlocking?: boolean;
}

/** Danh mục "Tình trạng Page" (động, chỉ khoá - không xoá). */
export interface FanpageHealthStatus {
    id: number;
    name: string;
    color: string;
    isBlocking: boolean;
    isDefault: boolean;
    isLocked: boolean;
    sortOrder: number;
}

export interface FanpageUserBrief {
    id: number;
    name: string;
    employeeCode?: string;
    departmentId?: number | null;
}

/** Quyền của người xem trên TỪNG Page (BE tính sẵn) - FE ẩn nút theo đây, không tự đoán theo role. */
export interface FanpageFlags {
    canEdit: boolean;
    canDelete: boolean;
    canManagePosts: boolean;
    canDeletePosts: boolean;
    canManageNotes: boolean;
    canDeleteNotes: boolean;
    canManageMetrics?: boolean;
    canDeleteMetrics?: boolean;
    canExport?: boolean;
}

export interface Fanpage {
    id: number;
    platformId: number;
    platform: FanpagePlatform;
    name: string;
    url: string;
    /** Người phụ trách CHÍNH (tương thích ngược). */
    ownerId: number | null;
    owner: FanpageUserBrief | null;
    /** TẤT CẢ người phụ trách (gồm cả người chính). */
    owners: FanpageUserBrief[];
    isActive: boolean;
    createdBy?: { id: number; name: string } | null;
    createdAt: string;
    updatedAt: string;
    /** Tổng bài (kể cả bài chưa có ngày). */
    postCount?: number;
    noteCount?: number;
    /** Ngày đăng gần nhất (YYYY-MM-DD). */
    lastPostDate?: string | null;
    /** Bài trong 30 ngày gần nhất / trong tuần Thứ Hai-CN hiện tại. */
    posts30d?: number;
    weekCount?: number;
    /** isTracked = đang theo dõi + chưa lưu trữ + tình trạng không "ngưng hoạt động". */
    isTracked?: boolean;
    /** Không còn người phụ trách đang hoạt động. */
    isOrphan?: boolean;
    cadence?: FanpageCadence;
    health?: FanpageHealthBrief | null;
    healthStatusId?: number | null;
    healthNote?: string | null;
    targetPostsPerWeek?: number | null;
    archivedAt?: string | null;
    flags: FanpageFlags;
}

/** `GET /fanpages/overview` - cùng scope/nguồn nhịp đăng với danh sách. */
export interface FanpageOverview {
    totalPages: number;
    trackedPages: number;
    pausedPages: number;
    newPages: number;
    okPages: number;
    atRiskPages: number;
    silentPages: number;
    postedTodayPages: number;
    orphanPages: number;
    archivedPages: number;
    postsThisWeek: number;
    posts30d: number;
}

/** 1 dòng của tab "Hôm nay". */
export interface FanpageTodayItem {
    id: number;
    name: string;
    url: string;
    platform: { id: number; name: string; color: string; isActive: boolean };
    ownerId: number | null;
    owners: Array<{ id: number; name: string }>;
    health: FanpageHealthBrief | null;
    lastPostDate: string | null;
    posts30d: number;
    cadence: FanpageCadence;
    isTracked: boolean;
    canManagePosts: boolean;
}

export interface FanpageTodayResponse {
    /** Hôm nay theo giờ VN (YYYY-MM-DD). */
    today: string;
    daysLeftInWeek: number;
    needAction: FanpageTodayItem[];
    postedToday: FanpageTodayItem[];
    ok: FanpageTodayItem[];
    counts: { needAction: number; postedToday: number; ok: number };
}

export type FanpageHistoryType = 'created' | 'owners' | 'health' | 'tracking' | 'archive';

export interface FanpageHistoryEvent {
    id: string;
    type: FanpageHistoryType;
    at: string;
    actor: { id: number; name: string } | null;
    before: unknown;
    after: unknown;
}

export interface FanpageListResponse {
    data: Fanpage[];
    capabilities: { canCreate: boolean; canAssignOwner: boolean };
}

export interface FanpageFilters {
    platformId?: number;
    ownerId?: number;
    isActive?: 'true' | 'false';
    search?: string;
    healthStatusId?: number;
    cadence?: FanpageCadenceState;
    /** Mặc định BE = 'false' (ẩn Page đã lưu trữ). */
    archived?: 'false' | 'true' | 'all';
    orphan?: 'true';
}

export interface FanpageUserRef {
    id: number;
    name: string;
}

export interface FanpagePost {
    id: number;
    fanpageId: number;
    title: string | null;
    url: string;
    /** YYYY-MM-DD */
    postedDate: string | null;
    note: string | null;
    createdBy: FanpageUserRef | null;
    updatedBy: FanpageUserRef | null;
    createdAt: string;
    updatedAt: string;
}

export interface FanpageNote {
    id: number;
    fanpageId: number;
    note: string;
    editCount: number;
    createdBy: FanpageUserRef | null;
    updatedBy: FanpageUserRef | null;
    createdAt: string;
    updatedAt: string;
}

export interface CreateFanpagePayload {
    platformId: number;
    name: string;
    url: string;
    /** Phần tử đầu = người phụ trách chính. Bỏ trống khi tạo = chính người tạo. */
    ownerIds?: number[];
    healthStatusId?: number;
    healthNote?: string | null;
    /** 1-35; null = bỏ mục tiêu. */
    targetPostsPerWeek?: number | null;
}

export type UpdateFanpagePayload = Partial<CreateFanpagePayload> & { isActive?: boolean };

export interface FanpagePostPayload {
    url: string;
    title?: string | null;
    postedDate?: string | null;
    note?: string | null;
}

export interface FanpagePlatformPayload {
    name?: string;
    color?: string;
    sortOrder?: number;
    /** "" = xoá. */
    urlDomains?: string | null;
}

export interface FanpageHealthStatusPayload {
    name?: string;
    color?: string;
    isBlocking?: boolean;
    sortOrder?: number;
}

export const fanpagesApi = {
    list: async (filters: FanpageFilters): Promise<FanpageListResponse> =>
        (await axiosInstance.get<FanpageListResponse>('/fanpages', { params: filters })).data,

    get: async (id: number): Promise<Fanpage> => (await axiosInstance.get<Fanpage>(`/fanpages/${id}`)).data,

    overview: async (): Promise<FanpageOverview> => (await axiosInstance.get<FanpageOverview>('/fanpages/overview')).data,

    today: async (): Promise<FanpageTodayResponse> => (await axiosInstance.get<FanpageTodayResponse>('/fanpages/today')).data,

    history: async (id: number): Promise<FanpageHistoryEvent[]> =>
        (await axiosInstance.get<FanpageHistoryEvent[]>(`/fanpages/${id}/history`)).data,

    archive: async (id: number): Promise<Fanpage> => (await axiosInstance.patch<Fanpage>(`/fanpages/${id}/archive`)).data,

    unarchive: async (id: number): Promise<Fanpage> => (await axiosInstance.patch<Fanpage>(`/fanpages/${id}/unarchive`)).data,

    ownerOptions: async (): Promise<FanpageUserBrief[]> =>
        (await axiosInstance.get<FanpageUserBrief[]>('/fanpages/owner-options')).data,

    create: async (data: CreateFanpagePayload): Promise<Fanpage> => (await axiosInstance.post<Fanpage>('/fanpages', data)).data,

    update: async (id: number, data: UpdateFanpagePayload): Promise<Fanpage> =>
        (await axiosInstance.patch<Fanpage>(`/fanpages/${id}`, data)).data,

    remove: async (id: number): Promise<void> => {
        await axiosInstance.delete(`/fanpages/${id}`);
    },

    // ── Bài đăng ──
    listPosts: async (fanpageId: number): Promise<FanpagePost[]> =>
        (await axiosInstance.get<FanpagePost[]>(`/fanpages/${fanpageId}/posts`)).data,

    createPost: async (fanpageId: number, data: FanpagePostPayload): Promise<FanpagePost> =>
        (await axiosInstance.post<FanpagePost>(`/fanpages/${fanpageId}/posts`, data)).data,

    updatePost: async (fanpageId: number, postId: number, data: Partial<FanpagePostPayload>): Promise<FanpagePost> =>
        (await axiosInstance.patch<FanpagePost>(`/fanpages/${fanpageId}/posts/${postId}`, data)).data,

    removePost: async (fanpageId: number, postId: number): Promise<void> => {
        await axiosInstance.delete(`/fanpages/${fanpageId}/posts/${postId}`);
    },

    // ── Ghi chú tiến trình ──
    listNotes: async (fanpageId: number): Promise<FanpageNote[]> =>
        (await axiosInstance.get<FanpageNote[]>(`/fanpages/${fanpageId}/notes`)).data,

    createNote: async (fanpageId: number, note: string): Promise<FanpageNote> =>
        (await axiosInstance.post<FanpageNote>(`/fanpages/${fanpageId}/notes`, { note })).data,

    updateNote: async (fanpageId: number, noteId: number, note: string): Promise<FanpageNote> =>
        (await axiosInstance.patch<FanpageNote>(`/fanpages/${fanpageId}/notes/${noteId}`, { note })).data,

    removeNote: async (fanpageId: number, noteId: number): Promise<void> => {
        await axiosInstance.delete(`/fanpages/${fanpageId}/notes/${noteId}`);
    },

    // ── Nền tảng ──
    listPlatforms: async (activeOnly = false): Promise<FanpagePlatform[]> =>
        (await axiosInstance.get<FanpagePlatform[]>('/fanpage-platforms', { params: activeOnly ? { activeOnly: true } : undefined }))
            .data,

    createPlatform: async (data: FanpagePlatformPayload & { name: string }): Promise<FanpagePlatform> =>
        (await axiosInstance.post<FanpagePlatform>('/fanpage-platforms', data)).data,

    updatePlatform: async (id: number, data: FanpagePlatformPayload): Promise<FanpagePlatform> =>
        (await axiosInstance.patch<FanpagePlatform>(`/fanpage-platforms/${id}`, data)).data,

    lockPlatform: async (id: number): Promise<FanpagePlatform> =>
        (await axiosInstance.patch<FanpagePlatform>(`/fanpage-platforms/${id}/lock`)).data,

    unlockPlatform: async (id: number): Promise<FanpagePlatform> =>
        (await axiosInstance.patch<FanpagePlatform>(`/fanpage-platforms/${id}/unlock`)).data,

    // ── Tình trạng Page ──
    listHealthStatuses: async (activeOnly = false): Promise<FanpageHealthStatus[]> =>
        (
            await axiosInstance.get<FanpageHealthStatus[]>('/fanpage-health-statuses', {
                params: activeOnly ? { activeOnly: true } : undefined,
            })
        ).data,

    createHealthStatus: async (data: FanpageHealthStatusPayload & { name: string }): Promise<FanpageHealthStatus> =>
        (await axiosInstance.post<FanpageHealthStatus>('/fanpage-health-statuses', data)).data,

    updateHealthStatus: async (id: number, data: FanpageHealthStatusPayload): Promise<FanpageHealthStatus> =>
        (await axiosInstance.patch<FanpageHealthStatus>(`/fanpage-health-statuses/${id}`, data)).data,

    lockHealthStatus: async (id: number): Promise<FanpageHealthStatus> =>
        (await axiosInstance.patch<FanpageHealthStatus>(`/fanpage-health-statuses/${id}/lock`)).data,

    unlockHealthStatus: async (id: number): Promise<FanpageHealthStatus> =>
        (await axiosInstance.patch<FanpageHealthStatus>(`/fanpage-health-statuses/${id}/unlock`)).data,
};
