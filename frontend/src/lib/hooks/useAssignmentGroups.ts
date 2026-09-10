import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  assignmentGroupsApi,
  AssignmentGroupConfig,
  AssignmentGroupUser,
  CreateAssignmentGroupPayload,
  UpdateAssignmentGroupPayload,
} from '../api/assignment-groups.api';

const ASSIGNMENT_GROUPS_KEY = ['assignment-groups'];
const EMPTY_CONFIGS: AssignmentGroupConfig[] = [];
const EMPTY_USERS: AssignmentGroupUser[] = [];

export const useAssignmentGroups = () => {
  const { data, isLoading } = useQuery({
    queryKey: ASSIGNMENT_GROUPS_KEY,
    queryFn: assignmentGroupsApi.getAll,
    staleTime: 60 * 1000,
  });

  return {
    configs: (data as AssignmentGroupConfig[]) ?? EMPTY_CONFIGS,
    isLoading,
  };
};

// Danh sách user hợp lệ theo 1 config `key` (vd 'sales'/'marketing'/'content_staff')
// - dùng để thay hardcode dò tên phòng ban ở customers/page.tsx và lọc
// `position.code==='content'` ở GroupManagersModal.tsx. Query rỗng nếu
// `key` rỗng (tránh gọi API khi chưa sẵn sàng).
export const useAssignmentGroupUsers = (key?: string) => {
  const { data, isLoading } = useQuery({
    queryKey: ['assignment-group-users', key],
    queryFn: () => assignmentGroupsApi.getUsers(key as string),
    enabled: !!key,
    staleTime: 60 * 1000,
  });

  return {
    users: (data as AssignmentGroupUser[]) ?? EMPTY_USERS,
    isLoading: !!key && isLoading,
  };
};

function useInvalidateAssignmentGroups() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ASSIGNMENT_GROUPS_KEY });
    // Xoá luôn cache `assignment-group-users` (mọi key) vì sửa config có
    // thể đổi danh sách user hợp lệ của bất kỳ dropdown nào đang dùng nó.
    queryClient.invalidateQueries({ queryKey: ['assignment-group-users'] });
  };
}

export const useCreateAssignmentGroup = () => {
  const invalidate = useInvalidateAssignmentGroups();
  return useMutation({
    mutationFn: (data: CreateAssignmentGroupPayload) => assignmentGroupsApi.create(data),
    onSuccess: invalidate,
  });
};

export const useUpdateAssignmentGroup = () => {
  const invalidate = useInvalidateAssignmentGroups();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateAssignmentGroupPayload }) =>
      assignmentGroupsApi.update(id, data),
    onSuccess: invalidate,
  });
};

export const useDeleteAssignmentGroup = () => {
  const invalidate = useInvalidateAssignmentGroups();
  return useMutation({
    mutationFn: (id: number) => assignmentGroupsApi.remove(id),
    onSuccess: invalidate,
  });
};
