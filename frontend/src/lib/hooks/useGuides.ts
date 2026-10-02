import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    guidesApi,
    CreateGuidePayload,
    GuideListItem,
    GuideDepartmentBrief,
    GuideManageItem,
    GuidePermissionBrief,
    GuidePositionBrief,
    GuideRoleBrief,
    UpdateGuidePayload,
} from '../api/guides.api';

const LIST_KEY = ['guides', 'list'] as const;
const MANAGE_KEY = ['guides', 'manage'] as const;
const ROLE_OPTIONS_KEY = ['guides', 'role-options'] as const;
const POSITION_OPTIONS_KEY = ['guides', 'position-options'] as const;
const DEPARTMENT_OPTIONS_KEY = ['guides', 'department-options'] as const;
const PERMISSION_OPTIONS_KEY = ['guides', 'permission-options'] as const;
const detailKey = (slug: string) => ['guides', 'detail', slug] as const;
const manageDetailKey = (id: number) => ['guides', 'manage-detail', id] as const;

// Cùng lý do EMPTY_* ở useRoles.ts: tránh tạo array mới mỗi render khi data còn undefined.
const EMPTY_LIST: GuideListItem[] = [];
const EMPTY_MANAGE: GuideManageItem[] = [];
const EMPTY_ROLES: GuideRoleBrief[] = [];
const EMPTY_POSITIONS: GuidePositionBrief[] = [];
const EMPTY_DEPARTMENTS: GuideDepartmentBrief[] = [];
const EMPTY_PERMISSIONS: GuidePermissionBrief[] = [];

/** Mục lục guide người gọi được xem (đã xuất bản + đúng role). Mọi role đăng nhập đều gọi được. */
export function useGuideList() {
    const q = useQuery({ queryKey: LIST_KEY, queryFn: () => guidesApi.list(), staleTime: 60_000 });
    return { guides: q.data ?? EMPTY_LIST, isLoading: q.isLoading, isError: q.isError };
}

export function useGuideDetail(slug: string | null) {
    return useQuery({
        queryKey: detailKey(slug ?? ''),
        queryFn: () => guidesApi.getBySlug(slug as string),
        enabled: !!slug,
        staleTime: 30_000,
        retry: false, // 404 (nháp / sai role / đã xoá) không nên thử lại
    });
}

/** CHỈ gọi khi `enabled` (người có `guides.manage`) - nếu không BE trả 403 và interceptor toast lỗi. */
export function useGuideManageList(enabled: boolean) {
    const q = useQuery({
        queryKey: MANAGE_KEY,
        queryFn: () => guidesApi.listManage(),
        enabled,
        staleTime: 15_000,
    });
    return { guides: q.data ?? EMPTY_MANAGE, isLoading: q.isLoading };
}

export function useGuideRoleOptions(enabled: boolean) {
    const q = useQuery({
        queryKey: ROLE_OPTIONS_KEY,
        queryFn: () => guidesApi.listRoleOptions(),
        enabled,
        staleTime: 60_000,
    });
    return { roles: q.data ?? EMPTY_ROLES, isLoading: q.isLoading };
}

export function useGuidePositionOptions(enabled: boolean) {
    const q = useQuery({
        queryKey: POSITION_OPTIONS_KEY,
        queryFn: () => guidesApi.listPositionOptions(),
        enabled,
        staleTime: 60_000,
    });
    return { positions: q.data ?? EMPTY_POSITIONS, isLoading: q.isLoading };
}

export function useGuideDepartmentOptions(enabled: boolean) {
    const q = useQuery({
        queryKey: DEPARTMENT_OPTIONS_KEY,
        queryFn: () => guidesApi.listDepartmentOptions(),
        enabled,
        staleTime: 60_000,
    });
    return { departments: q.data ?? EMPTY_DEPARTMENTS, isLoading: q.isLoading };
}

export function useGuidePermissionOptions(enabled: boolean) {
    const q = useQuery({
        queryKey: PERMISSION_OPTIONS_KEY,
        queryFn: () => guidesApi.listPermissionOptions(),
        enabled,
        staleTime: 60_000,
    });
    return { permissions: q.data ?? EMPTY_PERMISSIONS, isLoading: q.isLoading };
}

export function useGuideManageDetail(id: number | null) {
    return useQuery({
        queryKey: manageDetailKey(id ?? 0),
        queryFn: () => guidesApi.getManageDetail(id as number),
        enabled: id != null,
        // Luôn lấy bản mới nhất khi mở trình soạn - tránh sửa đè lên nội dung cũ.
        staleTime: 0,
        gcTime: 0,
    });
}

function useInvalidateGuides() {
    const qc = useQueryClient();
    return () => qc.invalidateQueries({ queryKey: ['guides'] });
}

export const useCreateGuide = () => {
    const invalidate = useInvalidateGuides();
    return useMutation({
        mutationFn: (data: CreateGuidePayload) => guidesApi.create(data),
        onSuccess: invalidate,
    });
};

export const useUpdateGuide = () => {
    const invalidate = useInvalidateGuides();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: UpdateGuidePayload }) => guidesApi.update(id, data),
        onSuccess: invalidate,
    });
};

export const useDeleteGuide = () => {
    const invalidate = useInvalidateGuides();
    return useMutation({
        mutationFn: (id: number) => guidesApi.remove(id),
        onSuccess: invalidate,
    });
};