import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    fanpagesApi,
    CreateFanpagePayload,
    FanpageFilters,
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

// Hằng số DÙNG CHUNG - KHÔNG tạo `[]` mới mỗi render (tránh vòng lặp vô hạn ở effect phụ thuộc mảng).
const EMPTY_PLATFORMS: FanpagePlatform[] = [];
const EMPTY_OWNERS: FanpageUserBrief[] = [];
const EMPTY_POSTS: FanpagePost[] = [];
const EMPTY_NOTES: FanpageNote[] = [];

/** `enabled=false` khi user không có `fanpages.view` - tránh bắn request rồi dính 403. */
export const useFanpages = (filters: FanpageFilters, enabled = true) => {
    const { data, isLoading, isFetching } = useQuery({
        queryKey: [...KEY, 'list', filters],
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
        queryKey: [...KEY, 'detail', id],
        queryFn: () => fanpagesApi.get(id as number),
        enabled: id != null,
        staleTime: 30 * 1000,
    });
    return { fanpage: data, isLoading };
};

export const useFanpageOwnerOptions = (enabled = true) => {
    const { data } = useQuery({
        queryKey: [...KEY, 'owner-options'],
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

export const useCreateFanpage = () => {
    const invalidate = useInvalidateFanpages();
    return useMutation({ mutationFn: (data: CreateFanpagePayload) => fanpagesApi.create(data), onSuccess: invalidate });
};

export const useUpdateFanpage = () => {
    const invalidate = useInvalidateFanpages();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: UpdateFanpagePayload }) => fanpagesApi.update(id, data),
        onSuccess: invalidate,
    });
};

export const useDeleteFanpage = () => {
    const invalidate = useInvalidateFanpages();
    return useMutation({ mutationFn: (id: number) => fanpagesApi.remove(id), onSuccess: invalidate });
};

// ── Bài đăng ──
export const useFanpagePosts = (fanpageId: number | null) => {
    const { data, isLoading } = useQuery({
        queryKey: [...KEY, 'posts', fanpageId],
        queryFn: () => fanpagesApi.listPosts(fanpageId as number),
        enabled: fanpageId != null,
        staleTime: 30 * 1000,
    });
    return { posts: data ?? EMPTY_POSTS, isLoading };
};

// Mutation bài đăng/ghi chú invalidate cả KEY gốc để cột đếm ở danh sách cập nhật theo.
export const useCreateFanpagePost = (fanpageId: number) => {
    const invalidate = useInvalidateFanpages();
    return useMutation({ mutationFn: (data: FanpagePostPayload) => fanpagesApi.createPost(fanpageId, data), onSuccess: invalidate });
};

export const useUpdateFanpagePost = (fanpageId: number) => {
    const invalidate = useInvalidateFanpages();
    return useMutation({
        mutationFn: ({ postId, data }: { postId: number; data: Partial<FanpagePostPayload> }) =>
            fanpagesApi.updatePost(fanpageId, postId, data),
        onSuccess: invalidate,
    });
};

export const useDeleteFanpagePost = (fanpageId: number) => {
    const invalidate = useInvalidateFanpages();
    return useMutation({ mutationFn: (postId: number) => fanpagesApi.removePost(fanpageId, postId), onSuccess: invalidate });
};

// ── Ghi chú ──
export const useFanpageNotes = (fanpageId: number | null) => {
    const { data, isLoading } = useQuery({
        queryKey: [...KEY, 'notes', fanpageId],
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