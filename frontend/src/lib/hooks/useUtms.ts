import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  utmsApi,
  UtmView,
  UtmOption,
  UtmBrief,
  UtmCustomersParams,
  CreateUtmPayload,
  UtmDuplicateGroup,
  UtmStatsParams,
} from '../api/utms.api';

const UTM_KEY = ['utms'] as const;

// Hằng số DÙNG CHUNG - KHÔNG tạo `[]` mới mỗi render (tránh vòng lặp vô hạn ở effect phụ thuộc mảng,
// cùng bẫy đã gặp ở useLinkGroups.ts).
const EMPTY_OPTIONS: UtmOption[] = [];
const EMPTY_VIEWS: UtmView[] = [];
const EMPTY_BRIEFS: UtmBrief[] = [];
const EMPTY_DUPS: UtmDuplicateGroup[] = [];
const EMPTY_COUNTS: Record<number, number> = {};

/**
 * UTM ĐƯỢC PHÉP DÙNG cho dropdown. `enabled=false` khi dropdown chưa mở để không bắn request thừa.
 * BE không gắn permission cho endpoint này nên Employee không bị 403.
 */
export const useUsableUtms = (q: string | undefined, enabled = true, activeOnly = true) => {
  const { data, isLoading, isFetching } = useQuery({
    queryKey: [...UTM_KEY, 'usable', q ?? '', activeOnly],
    queryFn: () => utmsApi.getUsable({ q: q || undefined, activeOnly: activeOnly || undefined, limit: 50 }),
    enabled,
    staleTime: 30 * 1000,
  });
  return { utms: data ?? EMPTY_OPTIONS, isLoading, isFetching };
};

export const useRecentUtms = (enabled = true) => {
  const { data } = useQuery({
    queryKey: [...UTM_KEY, 'recent'],
    queryFn: utmsApi.getRecent,
    enabled,
    staleTime: 60 * 1000,
  });
  return { recent: data ?? EMPTY_BRIEFS };
};

export const useManagedUtms = (enabled = true) => {
  const { data, isLoading } = useQuery({
    queryKey: [...UTM_KEY, 'managed-by-me'],
    queryFn: utmsApi.getManagedByMe,
    enabled,
    staleTime: 30 * 1000,
  });
  return { utms: data ?? EMPTY_VIEWS, isLoading };
};

/** Tab "Tất cả UTM" - chỉ bật khi có `utms.view` (nếu không BE trả 403). */
export const useScopedUtms = (enabled: boolean) => {
  const { data, isLoading } = useQuery({
    queryKey: [...UTM_KEY, 'scoped'],
    queryFn: utmsApi.getScoped,
    enabled,
    staleTime: 30 * 1000,
  });
  return { utms: data ?? EMPTY_VIEWS, isLoading };
};

/** Số KH theo UTM - chỉ bật khi có `customers.view` (BE đòi permission này). */
export const useUtmCustomerCounts = (enabled: boolean) => {
  const { data } = useQuery({
    queryKey: [...UTM_KEY, 'customer-counts'],
    queryFn: utmsApi.getCustomerCounts,
    enabled,
    staleTime: 30 * 1000,
  });
  return { counts: data ?? EMPTY_COUNTS };
};

/**
 * Thống kê UTM theo ngày nhập khách. Key nằm dưới `['utms']` nên mọi mutation UTM/khách (đã invalidate `['utms']`)
 * tự làm mới. `keepPreviousData`: đổi khoảng ngày/UTM không nháy trắng biểu đồ.
 */
export const useUtmStats = (params: UtmStatsParams, enabled: boolean) =>
  useQuery({
    queryKey: [...UTM_KEY, 'stats', params],
    queryFn: () => utmsApi.getStats(params),
    enabled,
    staleTime: 30 * 1000,
    placeholderData: keepPreviousData,
  });

export const useUtmCustomers = (utmId: number | null, params: UtmCustomersParams) =>
  useQuery({
    queryKey: [...UTM_KEY, utmId, 'customers', params],
    queryFn: () => utmsApi.getCustomers(utmId as number, params),
    enabled: utmId != null,
    placeholderData: (prev) => prev,
  });

export const useUtmManagers = (utmId: number | null) => {
  const { data, isLoading } = useQuery({
    queryKey: [...UTM_KEY, utmId, 'managers'],
    queryFn: () => utmsApi.getManagers(utmId as number),
    enabled: utmId != null,
  });
  return { managers: data, isLoading };
};

/** Chỉ bật khi user có quyền sửa scope `all` (BE chặn 403 nếu không). */
export const useUtmDuplicates = (enabled: boolean) => {
  const { data, isLoading } = useQuery({
    queryKey: [...UTM_KEY, 'duplicates'],
    queryFn: utmsApi.getDuplicates,
    enabled,
  });
  return { groups: data ?? EMPTY_DUPS, isLoading };
};

function useInvalidateUtms() {
  const queryClient = useQueryClient();
  // Đổi tên/màu/gộp UTM ảnh hưởng cả danh sách khách hàng (tag UTM + snapshot campaign) -> làm mới luôn.
  return () => {
    queryClient.invalidateQueries({ queryKey: UTM_KEY });
    queryClient.invalidateQueries({ queryKey: ['customers'] });
  };
}

export const useCreateUtm = () => {
  const invalidate = useInvalidateUtms();
  return useMutation({ mutationFn: (data: CreateUtmPayload) => utmsApi.create(data), onSuccess: invalidate });
};

export const useUpdateUtm = () => {
  const invalidate = useInvalidateUtms();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateUtmPayload> }) => utmsApi.update(id, data),
    onSuccess: invalidate,
  });
};

export const useSetUtmActive = () => {
  const invalidate = useInvalidateUtms();
  return useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      active ? utmsApi.activate(id) : utmsApi.deactivate(id),
    onSuccess: invalidate,
  });
};

export const useBulkSetUtmActive = () => {
  const invalidate = useInvalidateUtms();
  return useMutation({
    mutationFn: ({ ids, active }: { ids: number[]; active: boolean }) => utmsApi.bulkSetActive(ids, active),
    onSuccess: invalidate,
  });
};

export const useBulkDeleteUtm = () => {
  const invalidate = useInvalidateUtms();
  return useMutation({ mutationFn: (ids: number[]) => utmsApi.bulkDelete(ids), onSuccess: invalidate });
};

export const useDeleteUtm = () => {
  const invalidate = useInvalidateUtms();
  return useMutation({ mutationFn: (id: number) => utmsApi.remove(id), onSuccess: invalidate });
};

export const useMergeUtm = () => {
  const invalidate = useInvalidateUtms();
  return useMutation({
    mutationFn: ({ sourceId, targetId }: { sourceId: number; targetId: number }) => utmsApi.merge(sourceId, targetId),
    onSuccess: invalidate,
  });
};

export const useAddUtmManager = () => {
  const invalidate = useInvalidateUtms();
  return useMutation({
    mutationFn: ({ utmId, userId }: { utmId: number; userId: number }) => utmsApi.addManager(utmId, userId),
    onSuccess: invalidate,
  });
};

export const useRemoveUtmManager = () => {
  const invalidate = useInvalidateUtms();
  return useMutation({
    mutationFn: ({ utmId, userId }: { utmId: number; userId: number }) => utmsApi.removeManager(utmId, userId),
    onSuccess: invalidate,
  });
};

export const useTransferUtmPrimary = () => {
  const invalidate = useInvalidateUtms();
  return useMutation({
    mutationFn: ({ utmId, userId }: { utmId: number; userId: number }) => utmsApi.transferPrimary(utmId, userId),
    onSuccess: invalidate,
  });
};
