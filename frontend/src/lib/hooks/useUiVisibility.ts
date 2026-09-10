import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  uiVisibilityApi,
  RoleUiVisibilityRules,
  UpsertUiVisibilityRulesPayload,
  DeleteUiVisibilityRulesQuery,
} from '../api/ui-visibility.api';

const MY_HIDDEN_KEY = (resource: string) => ['ui-visibility-my-hidden', resource];
const ROLE_RULES_KEY = (roleId: number, resource: string) => ['ui-visibility-role-rules', roleId, resource];

const EMPTY_HIDDEN: string[] = [];

/** Self-service - FE dùng để tự ẩn cột/tab của CHÍNH người đang đăng nhập. */
export const useMyHiddenElements = (resource: string) => {
  const { data, isLoading } = useQuery({
    queryKey: MY_HIDDEN_KEY(resource),
    queryFn: () => uiVisibilityApi.getMyHidden(resource),
    staleTime: 30 * 1000, // khớp CACHE_TTL_MS ở BE
  });

  return { hiddenKeys: (data as string[]) ?? EMPTY_HIDDEN, isLoading };
};

/** Admin xem toàn bộ rule (Global + mọi override Phòng ban/Vị trí) của 1 Role. */
export const useRoleUiVisibilityRules = (roleId: number | undefined, resource: string) => {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ROLE_RULES_KEY(roleId ?? 0, resource),
    queryFn: () => uiVisibilityApi.getRoleRules(roleId as number, resource),
    enabled: !!roleId,
    staleTime: 30 * 1000,
  });

  return { rules: data as RoleUiVisibilityRules | undefined, isLoading, refetch };
};

function useInvalidateUiVisibility(roleId: number, resource: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ROLE_RULES_KEY(roleId, resource) });
    // Rule vừa đổi có thể ảnh hưởng CHÍNH người đang thao tác - invalidate
    // luôn my-hidden để FE tự cập nhật ngay, không cần đợi hết staleTime.
    queryClient.invalidateQueries({ queryKey: MY_HIDDEN_KEY(resource) });
  };
}

export const useUpsertUiVisibilityRules = (roleId: number, resource: string) => {
  const invalidate = useInvalidateUiVisibility(roleId, resource);
  return useMutation({
    mutationFn: (payload: UpsertUiVisibilityRulesPayload) =>
      uiVisibilityApi.upsertRoleRules(roleId, payload),
    onSuccess: invalidate,
  });
};

export const useDeleteUiVisibilityRules = (roleId: number, resource: string) => {
  const invalidate = useInvalidateUiVisibility(roleId, resource);
  return useMutation({
    mutationFn: (query: Omit<DeleteUiVisibilityRulesQuery, 'resource'>) =>
      uiVisibilityApi.deleteRoleRules(roleId, { ...query, resource }),
    onSuccess: invalidate,
  });
};
