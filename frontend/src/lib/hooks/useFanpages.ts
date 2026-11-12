import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SIDEBAR_BADGES_QUERY_KEY } from './useSidebarBadgeCounts';
import {
    fanpagesApi,
    CreateFanpagePayload,
    FanpageFilters,
    FanpageHealthStatus,
    FanpageHealthStatusPayload,
    FanpageHistoryEvent,
    FanpageNote,
    CreateFanpageLeadPayload,
    CreateFanpageNotePayload,
    FanpageLeadsParams,
    FanpagePlatform,
    FanpagePlatformPayload,
    FanpagePost,
    FanpagePostPayload,
    FanpagePostType,
    FanpagePostTypePayload,
    BulkPostsPayload,
    FanpageUserBrief,
    OutcomeCustomersParams,
    BulkSnapshotRow,
    FanpageGridResponse,
    FanpageSnapshot,
    FanpageTarget,
    SnapshotPayload,
    StatsRange,
    UpdateFanpagePayload,
} from '../api/fanpages.api';

const KEY = ['fanpages'] as const;
const PLATFORM_KEY = ['fanpage-platforms'] as const;
const HEALTH_KEY = ['fanpage-health-statuses'] as const;
const POST_TYPE_KEY = ['fanpage-post-types'] as const;

/** Factory queryKey. Mọi key nằm dưới `KEY` nên invalidate `KEY` làm mới cả list/overview/today/detail. */
export const fanpageKeys = {
    all: KEY,
    list: (filters: FanpageFilters) => [...KEY, 'list', filters] as const,
    overview: () => [...KEY, 'overview'] as const,
    today: () => [...KEY, 'today'] as const,
    detail: (id: number | null) => [...KEY, 'detail', id] as const,
    posts: (id: number | null) => [...KEY, 'posts', id] as const,
    notes: (id: number | null) => [...KEY, 'notes', id] as const,
    customers: (id: number | null, params?: unknown) => [...KEY, 'customers', id, params ?? null] as const,
    history: (id: number | null) => [...KEY, 'history', id] as const,
    ownerOptions: () => [...KEY, 'owner-options'] as const,
    snapshots: (id: number | null) => [...KEY, 'snapshots', id] as const,
    targets: (id: number | null) => [...KEY, 'targets', id] as const,
    heatmap: (id: number | null, weeks: number) => [...KEY, 'heatmap', id, weeks] as const,
    grid: (date: string) => [...KEY, 'grid', date] as const,
    stats: (kind: string, params: unknown) => [...KEY, 'stats', kind, params] as const,
};

// Hằng số DÙNG CHUNG - KHÔNG tạo `[]` mới mỗi render (tránh vòng lặp vô hạn ở effect phụ thuộc mảng).
const EMPTY_PLATFORMS: FanpagePlatform[] = [];
const EMPTY_OWNERS: FanpageUserBrief[] = [];
const EMPTY_POSTS: FanpagePost[] = [];
const EMPTY_NOTES: FanpageNote[] = [];
const EMPTY_HEALTH: FanpageHealthStatus[] = [];
const EMPTY_POST_TYPES: FanpagePostType[] = [];
const EMPTY_HISTORY: FanpageHistoryEvent[] = [];
const EMPTY_SNAPSHOTS: FanpageSnapshot[] = [];
const EMPTY_TARGETS: FanpageTarget[] = [];

/** `enabled=false` khi user không có `fanpages.view` - tránh bắn request rồi dính 403. */
export const useFanpages = (filters: FanpageFilters, enabled = true) => {
    const { data, isLoading, isFetching } = useQuery({
        queryKey: fanpageKeys.list(filters),
        queryFn: () => fanpagesApi.list(filters),
        enabled,
        staleTime: 30 * 1000,
        placeholderData: keepPreviousData,
    });
    return {
        fanpages: data?.data ?? [],
        capabilities: data?.capabilities ?? { canCreate: false, canAssignOwner: false },
        isLoading,
        isFetching,
    };
};

export const useFanpage = (id: number | null) => {
    const { data, isLoading, isError } = useQuery({
        queryKey: fanpageKeys.detail(id),
        queryFn: () => fanpagesApi.get(id as number),
        enabled: id != null,
        staleTime: 30 * 1000,
    });
    // `isError`: Page không tồn tại / không còn quyền xem (vd link thông báo cũ) - Drawer phải báo rõ, KHÔNG quay Spin mãi.
    return { fanpage: data, isLoading, isError };
};

/** Số cho thẻ KPI - cùng scope/nguồn với danh sách. */
export const useFanpageOverview = (enabled = true) => {
    const { data, isLoading } = useQuery({
        queryKey: fanpageKeys.overview(),
        queryFn: fanpagesApi.overview,
        enabled,
        staleTime: 30 * 1000,
    });
    return { overview: data, isLoading };
};

/** Tab "Hôm nay". staleTime 0: thêm bài xong thẻ phải chuyển nhóm ngay, quay lại tab luôn lấy số mới. */
export const useFanpageToday = (enabled = true) => {
    const { data, isLoading } = useQuery({
        queryKey: fanpageKeys.today(),
        queryFn: fanpagesApi.today,
        enabled,
        staleTime: 0,
    });
    return { today: data, isLoading };
};

export const useFanpageHistory = (fanpageId: number | null) => {
    const { data, isLoading } = useQuery({
        queryKey: fanpageKeys.history(fanpageId),
        queryFn: () => fanpagesApi.history(fanpageId as number),
        enabled: fanpageId != null,
        staleTime: 30 * 1000,
    });
    return { events: data ?? EMPTY_HISTORY, isLoading };
};

export const useFanpageHealthStatuses = (activeOnly = false, enabled = true) => {
    const { data, isLoading } = useQuery({
        queryKey: [...HEALTH_KEY, activeOnly],
        queryFn: () => fanpagesApi.listHealthStatuses(activeOnly),
        enabled,
        staleTime: 60 * 1000,
    });
    return { statuses: data ?? EMPTY_HEALTH, isLoading };
};

export const useFanpagePostTypes = (activeOnly = false, enabled = true) => {
    const { data, isLoading } = useQuery({
        queryKey: [...POST_TYPE_KEY, activeOnly],
        queryFn: () => fanpagesApi.listPostTypes(activeOnly),
        enabled,
        staleTime: 60 * 1000,
    });
    return { postTypes: data ?? EMPTY_POST_TYPES, isLoading };
};

export const useFanpageOwnerOptions = (enabled = true) => {
    const { data } = useQuery({
        queryKey: fanpageKeys.ownerOptions(),
        queryFn: fanpagesApi.ownerOptions,
        enabled,
        staleTime: 5 * 60 * 1000,
    });
    return { owners: data ?? EMPTY_OWNERS };
};

export const useFanpagePlatforms = (activeOnly = false, enabled = true) => {
    const { data, isLoading } = useQuery({
        queryKey: [...PLATFORM_KEY, activeOnly],
        queryFn: () => fanpagesApi.listPlatforms(activeOnly),
        enabled,
        staleTime: 60 * 1000,
    });
    return { platforms: data ?? EMPTY_PLATFORMS, isLoading };
};

function useInvalidateFanpages() {
    const qc = useQueryClient();
    return () => qc.invalidateQueries({ queryKey: KEY });
}

/** Thay đổi làm đổi "số Page cần đăng" (bài, mục tiêu, tình trạng, theo dõi, lưu trữ, người phụ trách) -> làm mới thêm badge sidebar. */
function useInvalidateFanpagesAndBadge() {
    const qc = useQueryClient();
    return () => Promise.all([qc.invalidateQueries({ queryKey: KEY }), qc.invalidateQueries({ queryKey: SIDEBAR_BADGES_QUERY_KEY })]);
}

export const useCreateFanpage = () => {
    const invalidate = useInvalidateFanpagesAndBadge();
    return useMutation({ mutationFn: (data: CreateFanpagePayload) => fanpagesApi.create(data), onSuccess: invalidate });
};

export const useUpdateFanpage = () => {
    const invalidate = useInvalidateFanpagesAndBadge();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: UpdateFanpagePayload }) => fanpagesApi.update(id, data),
        onSuccess: invalidate,
    });
};

export const useDeleteFanpage = () => {
    const invalidate = useInvalidateFanpagesAndBadge();
    return useMutation({ mutationFn: (id: number) => fanpagesApi.remove(id), onSuccess: invalidate });
};

export const useArchiveFanpage = () => {
    const invalidate = useInvalidateFanpagesAndBadge();
    return useMutation({
        mutationFn: ({ id, archive }: { id: number; archive: boolean }) => (archive ? fanpagesApi.archive(id) : fanpagesApi.unarchive(id)),
        onSuccess: invalidate,
    });
};

// ── Bài đăng ──
export const useFanpagePosts = (fanpageId: number | null) => {
    const { data, isLoading } = useQuery({
        queryKey: fanpageKeys.posts(fanpageId),
        queryFn: () => fanpagesApi.listPosts(fanpageId as number),
        enabled: fanpageId != null,
        staleTime: 30 * 1000,
    });
    return { posts: data ?? EMPTY_POSTS, isLoading };
};

// Mutation bài đăng/ghi chú invalidate cả KEY gốc để cột đếm ở danh sách cập nhật theo.
export const useCreateFanpagePost = (fanpageId: number) => {
    const invalidate = useInvalidateFanpagesAndBadge();
    return useMutation({ mutationFn: (data: FanpagePostPayload) => fanpagesApi.createPost(fanpageId, data), onSuccess: invalidate });
};

export const useBulkCreateFanpagePosts = (fanpageId: number) => {
    const invalidate = useInvalidateFanpagesAndBadge();
    return useMutation({ mutationFn: (data: BulkPostsPayload) => fanpagesApi.bulkCreatePosts(fanpageId, data), onSuccess: invalidate });
};

export const useUpdateFanpagePost = (fanpageId: number) => {
    const invalidate = useInvalidateFanpagesAndBadge();
    return useMutation({
        mutationFn: ({ postId, data }: { postId: number; data: Partial<FanpagePostPayload> }) =>
            fanpagesApi.updatePost(fanpageId, postId, data),
        onSuccess: invalidate,
    });
};

export const useDeleteFanpagePost = (fanpageId: number) => {
    const invalidate = useInvalidateFanpagesAndBadge();
    return useMutation({ mutationFn: (postId: number) => fanpagesApi.removePost(fanpageId, postId), onSuccess: invalidate });
};

// ── Ghi chú ──
export const useFanpageNotes = (fanpageId: number | null) => {
    const { data, isLoading } = useQuery({
        queryKey: fanpageKeys.notes(fanpageId),
        queryFn: () => fanpagesApi.listNotes(fanpageId as number),
        enabled: fanpageId != null,
        staleTime: 30 * 1000,
    });
    return { notes: data ?? EMPTY_NOTES, isLoading };
};

/** Thêm Lead làm đổi số Khách (bảng Page → Khách `stats('outcomes')`, tab Data khách hàng), danh sách Khách hàng toàn hệ thống và badge. */
function useInvalidateFanpageLeads() {
    const qc = useQueryClient();
    return () =>
        Promise.all([
            qc.invalidateQueries({ queryKey: KEY }), // customers(id), detail(id), notes(id), stats('outcomes')
            qc.invalidateQueries({ queryKey: ['customers'] }),
            qc.invalidateQueries({ queryKey: SIDEBAR_BADGES_QUERY_KEY }),
        ]);
}

/** Danh sách Lead của Page (phân trang BE). `enabled=false` khi thiếu `customers.view` - KHÔNG bắn request rồi dính 403. */
export const useFanpageLeads = (fanpageId: number | null, params: FanpageLeadsParams, enabled = true) => {
    const { data, isLoading, isFetching } = useQuery({
        queryKey: fanpageKeys.customers(fanpageId, params),
        queryFn: () => fanpagesApi.listLeads(fanpageId as number, params),
        enabled: enabled && fanpageId != null,
        staleTime: 30 * 1000,
        placeholderData: keepPreviousData,
    });
    return { leads: data, isLoading, isFetching };
};

export const useCreateFanpageLead = (fanpageId: number) => {
    const invalidate = useInvalidateFanpageLeads();
    return useMutation({ mutationFn: (payload: CreateFanpageLeadPayload) => fanpagesApi.createLead(fanpageId, payload), onSuccess: invalidate });
};

export const useCreateFanpageNote = (fanpageId: number) => {
    const invalidateNotes = useInvalidateFanpages();
    const invalidateLeads = useInvalidateFanpageLeads();
    return useMutation({
        mutationFn: (payload: CreateFanpageNotePayload) => fanpagesApi.createNote(fanpageId, payload),
        // Ghi chú có `lead` -> làm mới cả khách/thống kê/badge; ghi chú thường chỉ làm mới Page.
        onSuccess: (_n, vars) => (vars.lead ? invalidateLeads() : invalidateNotes()),
    });
};

export const useUpdateFanpageNote = (fanpageId: number) => {
    const invalidate = useInvalidateFanpages();
    return useMutation({
        mutationFn: ({ noteId, note }: { noteId: number; note: string }) => fanpagesApi.updateNote(fanpageId, noteId, note),
        onSuccess: invalidate,
    });
};

export const useDeleteFanpageNote = (fanpageId: number) => {
    const invalidate = useInvalidateFanpages();
    return useMutation({ mutationFn: (noteId: number) => fanpagesApi.removeNote(fanpageId, noteId), onSuccess: invalidate });
};

// ── Nền tảng ──
function useInvalidatePlatforms() {
    const qc = useQueryClient();
    // Đổi tên/màu/khoá nền tảng ảnh hưởng cả cột "Nền tảng" của danh sách Page.
    return () => Promise.all([qc.invalidateQueries({ queryKey: PLATFORM_KEY }), qc.invalidateQueries({ queryKey: KEY })]);
}

export const useCreateFanpagePlatform = () => {
    const invalidate = useInvalidatePlatforms();
    return useMutation({
        mutationFn: (data: FanpagePlatformPayload & { name: string }) => fanpagesApi.createPlatform(data),
        onSuccess: invalidate,
    });
};

export const useUpdateFanpagePlatform = () => {
    const invalidate = useInvalidatePlatforms();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: FanpagePlatformPayload }) => fanpagesApi.updatePlatform(id, data),
        onSuccess: invalidate,
    });
};

export const useSetFanpagePlatformActive = () => {
    const invalidate = useInvalidatePlatforms();
    return useMutation({
        mutationFn: ({ id, active }: { id: number; active: boolean }) =>
            active ? fanpagesApi.unlockPlatform(id) : fanpagesApi.lockPlatform(id),
        onSuccess: invalidate,
    });
};

// ── Tình trạng Page ──
function useInvalidateHealthStatuses() {
    const qc = useQueryClient();
    // Đổi tên/màu/cờ ngưng hoạt động ảnh hưởng cả cột "Tình trạng", KPI và badge.
    return () =>
        Promise.all([
            qc.invalidateQueries({ queryKey: HEALTH_KEY }),
            qc.invalidateQueries({ queryKey: KEY }),
            qc.invalidateQueries({ queryKey: SIDEBAR_BADGES_QUERY_KEY }),
        ]);
}

export const useCreateFanpageHealthStatus = () => {
    const invalidate = useInvalidateHealthStatuses();
    return useMutation({
        mutationFn: (data: FanpageHealthStatusPayload & { name: string }) => fanpagesApi.createHealthStatus(data),
        onSuccess: invalidate,
    });
};

export const useUpdateFanpageHealthStatus = () => {
    const invalidate = useInvalidateHealthStatuses();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: FanpageHealthStatusPayload }) => fanpagesApi.updateHealthStatus(id, data),
        onSuccess: invalidate,
    });
};

export const useSetFanpageHealthStatusActive = () => {
    const invalidate = useInvalidateHealthStatuses();
    return useMutation({
        mutationFn: ({ id, active }: { id: number; active: boolean }) =>
            active ? fanpagesApi.unlockHealthStatus(id) : fanpagesApi.lockHealthStatus(id),
        onSuccess: invalidate,
    });
};

// ── Loại bài (E5a) ──
function useInvalidatePostTypes() {
    const qc = useQueryClient();
    // Đổi tên/màu/khoá ảnh hưởng cột "Loại bài" trong danh sách bài đăng của mọi Page.
    return () => Promise.all([qc.invalidateQueries({ queryKey: POST_TYPE_KEY }), qc.invalidateQueries({ queryKey: KEY })]);
}

export const useCreateFanpagePostType = () => {
    const invalidate = useInvalidatePostTypes();
    return useMutation({ mutationFn: (data: FanpagePostTypePayload & { name: string }) => fanpagesApi.createPostType(data), onSuccess: invalidate });
};

export const useUpdateFanpagePostType = () => {
    const invalidate = useInvalidatePostTypes();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: FanpagePostTypePayload }) => fanpagesApi.updatePostType(id, data),
        onSuccess: invalidate,
    });
};

export const useSetFanpagePostTypeActive = () => {
    const invalidate = useInvalidatePostTypes();
    return useMutation({
        mutationFn: ({ id, active }: { id: number; active: boolean }) => (active ? fanpagesApi.unlockPostType(id) : fanpagesApi.lockPostType(id)),
        onSuccess: invalidate,
    });
};

// ── Số liệu định kỳ / thống kê (GĐ4) ──
export const useFanpageSnapshots = (fanpageId: number | null) => {
    const { data, isLoading } = useQuery({
        queryKey: fanpageKeys.snapshots(fanpageId),
        queryFn: () => fanpagesApi.listSnapshots(fanpageId as number),
        enabled: fanpageId != null,
        staleTime: 30 * 1000,
    });
    return { snapshots: data ?? EMPTY_SNAPSHOTS, isLoading };
};

export const useFanpageTargets = (fanpageId: number | null) => {
    const { data } = useQuery({
        queryKey: fanpageKeys.targets(fanpageId),
        queryFn: () => fanpagesApi.listTargets(fanpageId as number),
        enabled: fanpageId != null,
        staleTime: 30 * 1000,
    });
    return { targets: data ?? EMPTY_TARGETS };
};

export const useFanpageHeatmap = (fanpageId: number | null, weeks = 12) =>
    useQuery({
        queryKey: fanpageKeys.heatmap(fanpageId, weeks),
        queryFn: () => fanpagesApi.heatmap(fanpageId as number, weeks),
        enabled: fanpageId != null,
        staleTime: 30 * 1000,
    });

/** Lưới nhập: staleTime 0 để mở lại luôn thấy số mới nhất của đồng nghiệp (X24). */
export const useFanpageGrid = (date: string, enabled = true) => {
    const { data, isLoading, isFetching } = useQuery<FanpageGridResponse>({
        queryKey: fanpageKeys.grid(date),
        queryFn: () => fanpagesApi.grid(date),
        enabled,
        staleTime: 0,
        placeholderData: keepPreviousData,
    });
    return { grid: data, isLoading, isFetching };
};

export const useFanpageStatsGrowth = (params: StatsRange & { groupBy?: 'week' | 'month'; pageIds?: number[] }, enabled = true) =>
    useQuery({
        queryKey: fanpageKeys.stats('growth', params),
        queryFn: () => fanpagesApi.statsGrowth(params),
        enabled,
        staleTime: 60 * 1000,
        placeholderData: keepPreviousData,
    });

export const useFanpageStatsPosts = (params: StatsRange, enabled = true) =>
    useQuery({
        queryKey: fanpageKeys.stats('posts', params),
        queryFn: () => fanpagesApi.statsPosts(params),
        enabled,
        staleTime: 60 * 1000,
        placeholderData: keepPreviousData,
    });

export const useFanpageStatsTopPosts = (params: StatsRange & { limit?: number }, enabled = true) =>
    useQuery({
        queryKey: fanpageKeys.stats('top-posts', params),
        queryFn: () => fanpagesApi.statsTopPosts(params),
        enabled,
        staleTime: 60 * 1000,
        placeholderData: keepPreviousData,
    });

export const useFanpageStatsRankings = (params: StatsRange, enabled = true) =>
    useQuery({
        queryKey: fanpageKeys.stats('rankings', params),
        queryFn: () => fanpagesApi.statsRankings(params),
        enabled,
        staleTime: 60 * 1000,
        placeholderData: keepPreviousData,
    });

export const useFanpageStatsOutcomes = (params: StatsRange, enabled = true) =>
    useQuery({
        queryKey: fanpageKeys.stats('outcomes', params),
        queryFn: () => fanpagesApi.statsOutcomes(params),
        enabled,
        staleTime: 60 * 1000,
        placeholderData: keepPreviousData,
    });

/** Mini Table khách khi bấm số khách ở bảng Page → Khách. `params=null` = modal đóng, không bắn request. */
export const useFanpageOutcomeCustomers = (params: OutcomeCustomersParams | null) =>
    useQuery({
        queryKey: fanpageKeys.stats('outcome-customers', params),
        queryFn: () => fanpagesApi.statsOutcomeCustomers(params as OutcomeCustomersParams),
        enabled: params != null,
        placeholderData: keepPreviousData,
    });

/** Gắn/gỡ UTM + đổi Page chính ảnh hưởng cả danh sách Page, chi tiết lẫn khối Thống kê -> làm mới toàn bộ `fanpages`. */
export const useSetFanpageUtms = () => {
    const invalidate = useInvalidateFanpagesAndBadge();
    return useMutation({ mutationFn: ({ id, utmIds }: { id: number; utmIds: number[] }) => fanpagesApi.setUtms(id, utmIds), onSuccess: invalidate });
};

export const useSetFanpagePrimaryUtm = () => {
    const invalidate = useInvalidateFanpagesAndBadge();
    return useMutation({ mutationFn: ({ id, utmId }: { id: number; utmId: number }) => fanpagesApi.setPrimaryUtm(id, utmId), onSuccess: invalidate });
};

export const useBulkSaveSnapshots = () => {
    const invalidate = useInvalidateFanpages();
    return useMutation({ mutationFn: (data: { date: string; rows: BulkSnapshotRow[] }) => fanpagesApi.bulkSave(data), onSuccess: invalidate });
};

export const useUpsertFanpageSnapshot = (fanpageId: number) => {
    const invalidate = useInvalidateFanpages();
    return useMutation({
        mutationFn: ({ date, data }: { date: string; data: SnapshotPayload }) => fanpagesApi.upsertSnapshot(fanpageId, date, data),
        onSuccess: invalidate,
    });
};

export const useDeleteFanpageSnapshot = (fanpageId: number) => {
    const invalidate = useInvalidateFanpages();
    return useMutation({ mutationFn: (date: string) => fanpagesApi.removeSnapshot(fanpageId, date), onSuccess: invalidate });
};

export const useSetFanpageTarget = (fanpageId: number) => {
    const invalidate = useInvalidateFanpages();
    return useMutation({
        mutationFn: ({ month, target }: { month: string; target: number | null }) => fanpagesApi.setTarget(fanpageId, month, target),
        onSuccess: invalidate,
    });
};
