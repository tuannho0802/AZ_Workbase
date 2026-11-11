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
    FanpagePlatform,
    FanpagePlatformPayload,
    FanpagePost,
    FanpagePostPayload,
    FanpageUserBrief,
    UpdateFanpagePayload,
} from '../api/fanpages.api';

const KEY = ['fanpages'] as const;
const PLATFORM_KEY = ['fanpage-platforms'] as const;
const HEALTH_KEY = ['fanpage-health-statuses'] as const;

/** Factory queryKey. Mọi key nằm dưới `KEY` nên invalidate `KEY` làm mới cả list/overview/today/detail. */
export const fanpageKeys = {
    all: KEY,
    list: (filters: FanpageFilters) => [...KEY, 'list', filters] as const,
    overview: () => [...KEY, 'overview'] as const,
    today: () => [...KEY, 'today'] as const,
    detail: (id: number | null) => [...KEY, 'detail', id] as const,
    posts: (id: number | null) => [...KEY, 'posts', id] as const,
    notes: (id: number | null) => [...KEY, 'notes', id] as const,
    history: (id: number | null) => [...KEY, 'history', id] as const,
    ownerOptions: () => [...KEY, 'owner-options'] as const,
};

// Hằng số DÙNG CHUNG - KHÔNG tạo `[]` mới mỗi render (tránh vòng lặp vô hạn ở effect phụ thuộc mảng).
const EMPTY_PLATFORMS: FanpagePlatform[] = [];
const EMPTY_OWNERS: FanpageUserBrief[] = [];
const EMPTY_POSTS: FanpagePost[] = [];
const EMPTY_NOTES: FanpageNote[] = [];
const EMPTY_HEALTH: FanpageHealthStatus[] = [];
const EMPTY_HISTORY: FanpageHistoryEvent[] = [];

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
    const { data, isLoading } = useQuery({
        queryKey: fanpageKeys.detail(id),
        queryFn: () => fanpagesApi.get(id as number),
        enabled: id != null,
        staleTime: 30 * 1000,
    });
    return { fanpage: data, isLoading };
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

export const useCreateFanpageNote = (fanpageId: number) => {
    const invalidate = useInvalidateFanpages();
    return useMutation({ mutationFn: (note: string) => fanpagesApi.createNote(fanpageId, note), onSuccess: invalidate });
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
