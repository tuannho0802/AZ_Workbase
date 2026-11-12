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

export const METRIC_KEYS = ['followers', 'reach', 'engagement', 'views'] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];
export type PostMetricKey = 'views' | 'likes' | 'comments' | 'shares';

/** Follower nhập tay mới nhất + chênh lệch so với lần nhập trước (kèm số ngày cách nhau). */
export interface LatestMetric {
    date: string;
    followers: number;
    delta: number | null;
    deltaDays: number | null;
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
    /** null = chưa có số liệu follower nào. */
    latestMetrics?: LatestMetric | null;
    /** UTM đang gắn (GĐ5) - BE đã che tên UTM hạn chế người xem không được dùng. */
    utms?: FanpageUtmChip[];
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
    /** Follower tăng/giảm 30 ngày (nhập tay); null = chưa Page nào đủ ≥ 2 mốc. */
    followerGain30d: number | null;
    pagesWithoutMetrics: number;
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
    /** Chỉ Page đang gắn UTM này (GĐ5). */
    utmId?: number;
    cadence?: FanpageCadenceState;
    /** Mặc định BE = 'false' (ẩn Page đã lưu trữ). */
    archived?: 'false' | 'true' | 'all';
    orphan?: 'true';
}

export interface FanpageUserRef {
    id: number;
    name: string;
}

/** Danh mục "Loại bài" (E5a; động, chỉ khoá - không xoá). */
export interface FanpagePostType {
    id: number;
    name: string;
    color: string;
    isLocked: boolean;
    sortOrder: number;
    /** Số bài đang dùng (chỉ có ở GET /fanpage-post-types). */
    postCount?: number;
}

export interface FanpagePostTypePayload {
    name?: string;
    color?: string;
    sortOrder?: number;
}

export interface FanpagePost {
    id: number;
    fanpageId: number;
    postTypeId?: number | null;
    postType?: Pick<FanpagePostType, 'id' | 'name' | 'color' | 'isLocked'> | null;
    title: string | null;
    url: string;
    /** YYYY-MM-DD */
    postedDate: string | null;
    note: string | null;
    views: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
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
    /** GĐ5b: khách do ghi chú này sinh ra (null = ghi chú thường). */
    leadCustomerId?: number | null;
    createdBy: FanpageUserRef | null;
    updatedBy: FanpageUserRef | null;
    createdAt: string;
    updatedAt: string;
}

/** GĐ5b - Lead (khách hàng) nhập từ Page. `phone` BẮT BUỘC (khoá chống trùng, PLAN 15.8). */
export interface FanpageLeadDraft {
    name: string;
    phone: string;
    email?: string;
    /** Bỏ trống = BE dùng nền tảng của Page nếu khớp 1 nguồn đang mở. */
    source?: string;
    note?: string;
}

export interface FanpageLeadRow {
    id: number;
    name: string;
    phone?: string | null;
    email?: string | null;
    source: string;
    status: string;
    inputDate: string | null;
    createdAt: string;
    salesUser?: { id: number; name: string } | null;
    createdBy: { id: number; name: string } | null;
    /** Ghi chú Page đã sinh ra khách này (null = nhập tay trực tiếp). */
    noteId: number | null;
}

export interface FanpageLeadsParams {
    page?: number;
    limit?: number;
    search?: string;
}

export interface FanpageLeadsResponse {
    data: FanpageLeadRow[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    /** Scope customers.view đang áp - hiện nhãn "theo phạm vi dữ liệu của bạn" (X32). */
    customerScope: string;
}

export type CreateFanpageLeadPayload = FanpageLeadDraft;

export interface CreateFanpageNotePayload {
    note: string;
    /** Tạo kèm khách từ ghi chú (cần thêm quyền customers.create). */
    lead?: FanpageLeadDraft;
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

export type BulkSkipReason = 'invalid_url' | 'too_long' | 'duplicate_in_batch' | 'duplicate_existing';

/** `POST /fanpages/:id/posts/bulk` (B4). */
export interface BulkPostsPayload {
    urls: string[];
    postedDate?: string | null;
    postTypeId?: number | null;
}

export interface BulkPostsResponse {
    requested: number;
    created: Array<{ id: number; url: string; postedDate: string | null }>;
    skipped: Array<{ url: string; reason: BulkSkipReason; existingPostId?: number; existingPostedDate?: string | null }>;
}

/** `GET /fanpages/stats/rankings` (B5, PLAN 3.8) - chỉ cột đóng góp dữ liệu, không khách/tiền. */
export interface RankingRow {
    userId: number;
    name: string;
    employeeCode: string | null;
    posts: number;
    snapshots: number;
    pages: number;
    weeksTracked: number;
    weeksOnTarget: number;
    /** 0-100; null = chưa có tuần nào để xét. */
    targetRate: number | null;
    rank: number;
    isMe: boolean;
}

export interface RankingsResponse {
    from: string;
    to: string;
    scope: 'own' | 'department' | 'all';
    rows: RankingRow[];
    nonOwnerPosts: number;
}

export interface FanpagePostPayload {
    postTypeId?: number | null;
    url: string;
    title?: string | null;
    postedDate?: string | null;
    note?: string | null;
    views?: number | null;
    likes?: number | null;
    comments?: number | null;
    shares?: number | null;
}

// ── Số liệu định kỳ / thống kê (GĐ4) ──
export interface FanpageSnapshot {
    id: number;
    fanpageId: number;
    /** YYYY-MM-DD */
    snapshotDate: string;
    followers: number | null;
    reach: number | null;
    engagement: number | null;
    views: number | null;
    note: string | null;
    createdBy: FanpageUserRef | null;
    updatedBy: FanpageUserRef | null;
    createdAt: string;
    /** Gửi lại làm `expectedUpdatedAt` khi sửa (X24). */
    updatedAt: string;
}

/** `undefined` = giữ nguyên, `null` = xoá giá trị đó. */
export interface SnapshotPayload {
    followers?: number | null;
    reach?: number | null;
    engagement?: number | null;
    views?: number | null;
    note?: string | null;
    expectedUpdatedAt?: string | null;
    confirmDrop?: boolean;
}

export interface BulkSnapshotRow extends SnapshotPayload {
    fanpageId: number;
}

export interface BulkRowError {
    fanpageId: number;
    code: 'NO_ACCESS' | 'INVALID' | 'STALE' | 'SUSPICIOUS_DROP';
    message: string;
    currentUpdatedAt?: string | null;
}

export interface BulkSaveResponse {
    date: string;
    saved: Array<{ fanpageId: number; updatedAt: string }>;
    errors: BulkRowError[];
}

export interface FanpageGridRow {
    fanpageId: number;
    name: string;
    url: string;
    platform: { id: number; name: string; color: string };
    current: (Pick<FanpageSnapshot, 'followers' | 'reach' | 'engagement' | 'views' | 'note'> & { updatedAt: string }) | null;
    previous: (Pick<FanpageSnapshot, 'followers' | 'reach' | 'engagement' | 'views'> & { date: string }) | null;
}

export interface FanpageGridResponse {
    date: string;
    rows: FanpageGridRow[];
}

export interface FanpageTarget {
    /** YYYY-MM */
    month: string;
    targetFollowerGain: number | null;
    actualGain: number | null;
}

/** Chip UTM của 1 Page (GĐ5). `locked` = UTM hạn chế người xem không được dùng: tên đã bị che, không gỡ/đổi chính được. */
export interface FanpageUtmChip {
    utmId: number;
    name: string;
    color: string | null;
    isActive: boolean;
    restricted: boolean;
    locked: boolean;
    /** true = Page này là Page CHÍNH (ghi công) của UTM. */
    isPrimary: boolean;
    primaryFanpage: { id: number; name: string } | null;
    sharedWith: Array<{ id: number; name: string }>;
}

/** Body 409 khi gỡ Page chính còn Page khác dùng chung (R10). */
export interface FanpageUtmBlocked {
    utmId: number;
    utmName: string;
    otherPages: Array<{ id: number; name: string }>;
}

/** Chỉ số 1 nhóm (ghi công / tham gia). `deposit` CHỈ có khi qua cổng tiền 4 lớp - không có = không hiển thị. */
export interface OutcomeBucket {
    customers: number;
    closed: number;
    closeRate: number | null;
    utmCount: number;
    deposit?: number;
}

export interface OutcomeUtmRow {
    utmId: number;
    name: string;
    locked: boolean;
    isPrimary: boolean;
    primaryFanpage: { id: number; name: string } | null;
    customers: number;
    deposit?: number;
}

export interface PageOutcomeRow {
    fanpageId: number;
    name: string;
    archived: boolean;
    posts: number;
    customersPerPost: number | null;
    primary: OutcomeBucket;
    participating: OutcomeBucket;
    utms: OutcomeUtmRow[];
}

/** `GET /fanpages/stats/outcomes`. */
export interface OutcomesResponse {
    from: string;
    to: string;
    statsScope: string;
    /** null = người xem không có `customers.view` -> mọi số = 0. */
    customerScope: string | null;
    hasRevenue: boolean;
    pages: PageOutcomeRow[];
    total: { customers: number; closed: number; closeRate: number | null; deposit?: number };
    /** null = không hiển thị (chỉ scope rộng mới có). */
    unassigned: { customers: number; closed: number } | null;
}

export interface OutcomeCustomersParams extends StatsRange {
    kind: 'primary' | 'participating';
    fanpageId: number;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
}

export interface OutcomeCustomerRow {
    id: number;
    name: string;
    phone?: string;
    status: string;
    inputDate: string | null;
    utm: { id: number; name: string; color: string | null; isActive: boolean } | null;
    salesUser?: { id: number; name: string } | null;
    marketingUser?: { id: number; name: string } | null;
    [key: string]: unknown;
}

export interface OutcomeCustomersResponse {
    data: OutcomeCustomerRow[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export interface StatsRange {
    from?: string;
    to?: string;
}

export interface GrowthResponse {
    from: string;
    to: string;
    groupBy: 'week' | 'month';
    points: Array<{ key: string; total: number; pagesWithData: number }>;
    perPage: Array<{ id: number; name: string; values: Array<number | null> }>;
    pagesWithoutMetrics: number;
    totalPages: number;
    gain: { total: number; pagesWithGain: number };
    pageRows: Array<{ id: number; name: string; followers: number; latestDate: string; gain: number; baselineDate: string }>;
    pages: Array<{ id: number; name: string }>;
}

export interface PostsStatsResponse {
    from: string;
    to: string;
    weeks: Array<{ weekStart: string; weekEnd: string; count: number }>;
    totalPosts: number;
    weeklyTarget: number;
}

export interface TopPostRow {
    id: number;
    fanpageId: number;
    fanpageName: string;
    title: string | null;
    url: string;
    postedDate: string | null;
    views: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
    interactions: number;
}

export interface TopPostsResponse {
    from: string;
    to: string;
    posts: TopPostRow[];
    postsWithoutMetrics: number;
}

export interface HeatmapResponse {
    from: string;
    to: string;
    weeks: number;
    cells: Array<{ date: string; count: number; future: boolean }>;
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

    bulkCreatePosts: async (fanpageId: number, data: BulkPostsPayload): Promise<BulkPostsResponse> =>
        (await axiosInstance.post<BulkPostsResponse>(`/fanpages/${fanpageId}/posts/bulk`, data)).data,

    removePost: async (fanpageId: number, postId: number): Promise<void> => {
        await axiosInstance.delete(`/fanpages/${fanpageId}/posts/${postId}`);
    },

    // ── Ghi chú tiến trình ──
    listNotes: async (fanpageId: number): Promise<FanpageNote[]> =>
        (await axiosInstance.get<FanpageNote[]>(`/fanpages/${fanpageId}/notes`)).data,

    createNote: async (fanpageId: number, payload: CreateFanpageNotePayload): Promise<FanpageNote> =>
        (await axiosInstance.post<FanpageNote>(`/fanpages/${fanpageId}/notes`, payload)).data,

    // ── GĐ5b: Data khách hàng (Lead) của Page ──
    listLeads: async (fanpageId: number, params: FanpageLeadsParams): Promise<FanpageLeadsResponse> =>
        (await axiosInstance.get<FanpageLeadsResponse>(`/fanpages/${fanpageId}/customers`, { params })).data,

    createLead: async (fanpageId: number, payload: CreateFanpageLeadPayload): Promise<FanpageLeadRow> =>
        (await axiosInstance.post<FanpageLeadRow>(`/fanpages/${fanpageId}/customers`, payload)).data,

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

    // ── Loại bài (E5a) ──
    listPostTypes: async (activeOnly = false): Promise<FanpagePostType[]> =>
        (await axiosInstance.get<FanpagePostType[]>('/fanpage-post-types', { params: activeOnly ? { activeOnly: true } : undefined })).data,

    createPostType: async (data: FanpagePostTypePayload & { name: string }): Promise<FanpagePostType> =>
        (await axiosInstance.post<FanpagePostType>('/fanpage-post-types', data)).data,

    updatePostType: async (id: number, data: FanpagePostTypePayload): Promise<FanpagePostType> =>
        (await axiosInstance.patch<FanpagePostType>(`/fanpage-post-types/${id}`, data)).data,

    lockPostType: async (id: number): Promise<FanpagePostType> => (await axiosInstance.patch<FanpagePostType>(`/fanpage-post-types/${id}/lock`)).data,

    unlockPostType: async (id: number): Promise<FanpagePostType> => (await axiosInstance.patch<FanpagePostType>(`/fanpage-post-types/${id}/unlock`)).data,

    // ── Số liệu định kỳ / thống kê (GĐ4) ──
    listSnapshots: async (fanpageId: number): Promise<FanpageSnapshot[]> =>
        (await axiosInstance.get<FanpageSnapshot[]>(`/fanpages/${fanpageId}/snapshots`)).data,

    upsertSnapshot: async (fanpageId: number, date: string, data: SnapshotPayload): Promise<FanpageSnapshot> =>
        (await axiosInstance.put<FanpageSnapshot>(`/fanpages/${fanpageId}/snapshots/${date}`, data)).data,

    removeSnapshot: async (fanpageId: number, date: string): Promise<void> => {
        await axiosInstance.delete(`/fanpages/${fanpageId}/snapshots/${date}`);
    },

    listTargets: async (fanpageId: number): Promise<FanpageTarget[]> =>
        (await axiosInstance.get<FanpageTarget[]>(`/fanpages/${fanpageId}/targets`)).data,

    setTarget: async (fanpageId: number, month: string, target: number | null): Promise<void> => {
        await axiosInstance.put(`/fanpages/${fanpageId}/targets/${month}`, { targetFollowerGain: target });
    },

    heatmap: async (fanpageId: number, weeks = 12): Promise<HeatmapResponse> =>
        (await axiosInstance.get<HeatmapResponse>(`/fanpages/${fanpageId}/heatmap`, { params: { weeks } })).data,

    grid: async (date: string): Promise<FanpageGridResponse> =>
        (await axiosInstance.get<FanpageGridResponse>('/fanpage-metrics/grid', { params: { date } })).data,

    bulkSave: async (data: { date: string; rows: BulkSnapshotRow[] }): Promise<BulkSaveResponse> =>
        (await axiosInstance.put<BulkSaveResponse>('/fanpage-metrics/bulk', data)).data,

    statsGrowth: async (params: StatsRange & { groupBy?: 'week' | 'month'; pageIds?: number[] }): Promise<GrowthResponse> =>
        (
            await axiosInstance.get<GrowthResponse>('/fanpages/stats/growth', {
                params: { ...params, pageIds: params.pageIds?.length ? params.pageIds.join(',') : undefined },
            })
        ).data,

    statsPosts: async (params: StatsRange): Promise<PostsStatsResponse> =>
        (await axiosInstance.get<PostsStatsResponse>('/fanpages/stats/posts', { params })).data,

    setUtms: async (fanpageId: number, utmIds: number[]): Promise<FanpageUtmChip[]> =>
        (await axiosInstance.put<FanpageUtmChip[]>(`/fanpages/${fanpageId}/utms`, { utmIds })).data,

    setPrimaryUtm: async (fanpageId: number, utmId: number): Promise<FanpageUtmChip[]> =>
        (await axiosInstance.patch<FanpageUtmChip[]>(`/fanpages/${fanpageId}/utms/${utmId}/primary`)).data,

    statsOutcomes: async (params: StatsRange): Promise<OutcomesResponse> =>
        (await axiosInstance.get<OutcomesResponse>('/fanpages/stats/outcomes', { params })).data,

    statsOutcomeCustomers: async (params: OutcomeCustomersParams): Promise<OutcomeCustomersResponse> =>
        (await axiosInstance.get<OutcomeCustomersResponse>('/fanpages/stats/outcomes/customers', { params })).data,

    statsRankings: async (params: StatsRange): Promise<RankingsResponse> =>
        (await axiosInstance.get<RankingsResponse>('/fanpages/stats/rankings', { params })).data,

    statsTopPosts: async (params: StatsRange & { limit?: number }): Promise<TopPostsResponse> =>
        (await axiosInstance.get<TopPostsResponse>('/fanpages/stats/top-posts', { params })).data,
};
