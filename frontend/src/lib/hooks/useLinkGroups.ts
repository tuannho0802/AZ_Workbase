import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  linkCategoriesApi,
  linkGroupsApi,
  linkGroupManagersApi,
  customerGroupMembershipsApi,
  LinkCategory,
  LinkGroup,
  GroupManagersResult,
} from '../api/link-groups.api';

const CATEGORY_KEY = ['link-categories'];
const GROUP_KEY = ['link-groups'];
const MANAGED_BY_ME_KEY = ['link-groups', 'managed-by-me'];
const groupManagersKey = (groupId: number) => ['link-groups', groupId, 'managers'];

// ⚠️ QUAN TRỌNG - nguồn gốc bug infinite loop ở CustomerForm.tsx:
// TRƯỚC ĐÂY các hook dưới đây fallback bằng `data ?? []` - literal `[]` này
// tạo ra 1 ARRAY MỚI (reference mới) ở MỖI LẦN RENDER bất cứ khi nào `data`
// còn undefined (vd query đang `enabled: false`, hoặc chưa fetch xong lần
// đầu). Nơi gọi hook (CustomerForm.tsx) có `useEffect(..., [joinableGroups])`
// - vì reference đổi mỗi render, effect chạy lại mỗi render, bên trong effect
// lại gọi setState -> re-render -> data vẫn undefined -> `[]` mới lại được
// tạo -> effect chạy lại -> lặp vô hạn ("Maximum update depth exceeded").
// Fix: dùng 1 hằng số EMPTY_ARRAY dùng CHUNG, KHÔNG BAO GIỜ tạo mới - giữ
// nguyên 1 reference duy nhất suốt vòng đời app khi chưa có data thật.
const EMPTY_LINK_CATEGORIES: LinkCategory[] = [];
const EMPTY_LINK_GROUPS: LinkGroup[] = [];
const EMPTY_GROUP_MANAGERS: GroupManagersResult[] = [];

/** activeOnly=true -> chỉ category chưa khoá (dùng để lọc theo nguồn khi tạo/sửa khách hàng) */
export const useLinkCategories = (activeOnly = false) => {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: [...CATEGORY_KEY, activeOnly],
    queryFn: () => linkCategoriesApi.getAll(activeOnly),
    staleTime: 5 * 60 * 1000,
  });

  return { categories: (data as LinkCategory[]) ?? EMPTY_LINK_CATEGORIES, isLoading, isError, error };
};

/**
 * @param categoryId lọc theo 1 category - truyền undefined để KHÔNG gọi API
 * (dùng khi chưa xác định được category tương ứng, vd chưa chọn Nguồn).
 */
export const useLinkGroups = (categoryId: number | undefined, activeOnly = true) => {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: [...GROUP_KEY, categoryId, activeOnly],
    queryFn: () => linkGroupsApi.getAll(categoryId, activeOnly),
    enabled: categoryId != null,
    staleTime: 60 * 1000,
  });

  return { groups: (data as LinkGroup[]) ?? EMPTY_LINK_GROUPS, isLoading, isError, error };
};

/** Lấy TẤT CẢ group (mọi category, kể cả ẩn) - dùng cho trang quản lý admin */
export const useAllLinkGroups = () => {
  const { data, isLoading } = useQuery({
    queryKey: [...GROUP_KEY, 'all'],
    queryFn: () => linkGroupsApi.getAll(undefined, false),
    staleTime: 60 * 1000,
  });
  return { groups: (data as LinkGroup[]) ?? EMPTY_LINK_GROUPS, isLoading };
};

function useInvalidateCategories() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: CATEGORY_KEY });
}

function useInvalidateGroups() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: GROUP_KEY });
}

// ── Category mutations ──
export const useCreateLinkCategory = () => {
  const invalidate = useInvalidateCategories();
  return useMutation({ mutationFn: linkCategoriesApi.create, onSuccess: invalidate });
};

export const useUpdateLinkCategory = () => {
  const invalidate = useInvalidateCategories();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name?: string; color?: string; sortOrder?: number } }) =>
      linkCategoriesApi.update(id, data),
    onSuccess: invalidate,
  });
};

export const useLockLinkCategory = () => {
  const invalidate = useInvalidateCategories();
  return useMutation({ mutationFn: (id: number) => linkCategoriesApi.lock(id), onSuccess: invalidate });
};

export const useUnlockLinkCategory = () => {
  const invalidate = useInvalidateCategories();
  return useMutation({ mutationFn: (id: number) => linkCategoriesApi.unlock(id), onSuccess: invalidate });
};

export const useDeleteLinkCategory = () => {
  const invalidate = useInvalidateCategories();
  return useMutation({ mutationFn: (id: number) => linkCategoriesApi.remove(id), onSuccess: invalidate });
};

// ── Group mutations ──
export const useCreateLinkGroup = () => {
  const invalidate = useInvalidateGroups();
  return useMutation({ mutationFn: linkGroupsApi.create, onSuccess: invalidate });
};

export const useUpdateLinkGroup = () => {
  const invalidate = useInvalidateGroups();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: { name?: string; url?: string; sortOrder?: number; primaryManagerId?: number | null };
    }) => linkGroupsApi.update(id, data),
    onSuccess: invalidate,
  });
};

export const useActivateLinkGroup = () => {
  const invalidate = useInvalidateGroups();
  return useMutation({ mutationFn: (id: number) => linkGroupsApi.activate(id), onSuccess: invalidate });
};

export const useDeactivateLinkGroup = () => {
  const invalidate = useInvalidateGroups();
  return useMutation({ mutationFn: (id: number) => linkGroupsApi.deactivate(id), onSuccess: invalidate });
};

export const useDeleteLinkGroup = () => {
  const invalidate = useInvalidateGroups();
  return useMutation({ mutationFn: (id: number) => linkGroupsApi.remove(id), onSuccess: invalidate });
};

// ── Membership mutation (đứng riêng, không cache theo react-query vì luôn
// gắn với 1 customer cụ thể đang mở trong Drawer/Form - để component tự
// quản lý state cục bộ, tránh cache key rườm rà) ──
export const useSetGroupMembership = () => {
  return useMutation({
    mutationFn: ({ customerId, groupId, joined }: { customerId: number; groupId: number; joined: boolean }) =>
      customerGroupMembershipsApi.setMembership(customerId, groupId, joined),
  });
};

// ── Quản lý chính/phụ theo từng LinkGroup ──

/**
 * Danh sách nhóm mà user hiện tại được xem trong tính năng "Quản lý nhóm
 * liên kết" - admin thấy TẤT CẢ, user thường CHỈ thấy nhóm mình là Quản lý
 * chính hoặc phụ. Dùng cho trang "Nhóm tôi quản lý".
 */
export const useManagedByMe = () => {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: MANAGED_BY_ME_KEY,
    queryFn: () => linkGroupManagersApi.listManagedByMe(),
    staleTime: 30 * 1000,
  });

  return {
    groups: (data as GroupManagersResult[]) ?? EMPTY_GROUP_MANAGERS,
    isLoading,
    isError,
    error,
    refetch,
  };
};

/** Xem quản lý chính/phụ của 1 group cụ thể - dùng trong modal quản lý */
export const useGroupManagers = (groupId: number | undefined) => {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: groupId != null ? groupManagersKey(groupId) : ['link-groups', 'managers', 'disabled'],
    queryFn: () => linkGroupManagersApi.getManagers(groupId as number),
    enabled: groupId != null,
    staleTime: 15 * 1000,
  });

  return { managers: data as GroupManagersResult | undefined, isLoading, isError, error };
};

export const useAddSecondaryManager = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, userId }: { groupId: number; userId: number }) =>
      linkGroupManagersApi.addSecondaryManager(groupId, userId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: MANAGED_BY_ME_KEY });
      queryClient.invalidateQueries({ queryKey: GROUP_KEY });
      queryClient.invalidateQueries({ queryKey: groupManagersKey(variables.groupId) });
    },
  });
};

export const useRemoveSecondaryManager = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, userId }: { groupId: number; userId: number }) =>
      linkGroupManagersApi.removeSecondaryManager(groupId, userId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: MANAGED_BY_ME_KEY });
      queryClient.invalidateQueries({ queryKey: GROUP_KEY });
      queryClient.invalidateQueries({ queryKey: groupManagersKey(variables.groupId) });
    },
  });
};