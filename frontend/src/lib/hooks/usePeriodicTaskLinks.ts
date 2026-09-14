import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { periodicTaskLinksApi } from '../api/periodic-task-links.api';

/** CÙNG namespace `'periodic-tasks'` với `usePeriodicTasks.ts` (cố ý) - để
 * `invalidate()` sau khi thêm/gỡ liên kết cũng làm mới luôn danh sách chính
 * và các query con khác (children/parents/rollup của cả 2 đầu cạnh), không
 * cần liệt kê riêng từng id - mirror đúng cách `useCreatePeriodicTask.ts`
 * đang làm cho CRUD Task. */
const LIST_KEY = 'periodic-tasks';

export const useTaskChildren = (taskId: number | null) =>
  useQuery({
    queryKey: [LIST_KEY, 'children', taskId],
    queryFn: () => periodicTaskLinksApi.getChildren(taskId as number),
    enabled: taskId != null,
  });

export const useTaskParents = (taskId: number | null) =>
  useQuery({
    queryKey: [LIST_KEY, 'parents', taskId],
    queryFn: () => periodicTaskLinksApi.getParents(taskId as number),
    enabled: taskId != null,
  });

export const useTaskRollup = (taskId: number | null) =>
  useQuery({
    queryKey: [LIST_KEY, 'rollup', taskId],
    queryFn: () => periodicTaskLinksApi.getRollup(taskId as number),
    enabled: taskId != null,
  });

function useInvalidateTaskLinks() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] });
}

export const useAddTaskLink = () => {
  const invalidate = useInvalidateTaskLinks();
  return useMutation({
    mutationFn: ({ childId, parentTaskId }: { childId: number; parentTaskId: number }) =>
      periodicTaskLinksApi.addLink(childId, parentTaskId),
    onSuccess: invalidate,
  });
};

export const useRemoveTaskLink = () => {
  const invalidate = useInvalidateTaskLinks();
  return useMutation({
    mutationFn: ({ childId, parentTaskId }: { childId: number; parentTaskId: number }) =>
      periodicTaskLinksApi.removeLink(childId, parentTaskId),
    onSuccess: invalidate,
  });
};
