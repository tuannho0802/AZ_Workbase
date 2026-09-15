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

/**
 * useTaskLinksAmong - Phase 8 (PLAN mục Phase 8): 1 query DUY NHẤT cho toàn
 * bộ `taskIds` của 1 view (Table/Agenda/Kanban/Calendar đang hiển thị) - lấy
 * cạnh liên kết để dựng UI "nối/xếp hàng" (`buildTaskLinkChains`). `taskIds`
 * được sort trước khi đưa vào `queryKey` để tránh refetch thừa khi thứ tự
 * mảng đổi (vd sort lại Table) nhưng TẬP hợp ID không đổi.
 */
export const useTaskLinksAmong = (taskIds: number[], enabled = true) => {
  const sortedIds = [...taskIds].sort((a, b) => a - b);
  return useQuery({
    queryKey: [LIST_KEY, 'links-among', sortedIds],
    queryFn: () => periodicTaskLinksApi.getLinksAmong(sortedIds),
    enabled: enabled && sortedIds.length > 0,
    // Cạnh liên kết ít khi đổi trong lúc đang xem 1 trang - giữ cache 30s để
    // không gọi lại API này mỗi lần re-render nhỏ (vd gõ ô tìm kiếm khác).
    staleTime: 30_000,
  });
};

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