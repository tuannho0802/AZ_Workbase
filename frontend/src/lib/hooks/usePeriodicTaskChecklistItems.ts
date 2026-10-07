import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { periodicTaskChecklistItemsApi, type ChecklistListOptions } from '../api/periodic-task-checklist-items.api';
import {
  shouldRefetchAfterChecklistChange,
  isPeriodicTaskListKey,
  patchTaskChecklistProgress,
} from '../utils/periodicTaskInvalidation';

/** CÙNG namespace `'periodic-tasks'` (mirror `usePeriodicTaskSecondaryAssignees.ts`) -
 * các query trang checklist nằm dưới namespace này nên mọi mutation chỉ cần invalidate
 * namespace là cả trang checklist lẫn nhãn "X/Z" ở danh sách Task tự refetch. */
const LIST_KEY = 'periodic-tasks';

function useInvalidatePeriodicTaskChecklistItems() {
  const queryClient = useQueryClient();
  // BE có thể đổi status/kỳ Task ngay trong request tick/thêm checklist (Guard) -> làm tươi cả hiệu suất.
  // [AGENT] OLD CODE (giữ lại để rollback): invalidate CẢ namespace (mỗi lần tick refetch 4+ query đang mở)
  //   return () => {
  //     queryClient.invalidateQueries({ queryKey: [LIST_KEY] });
  //     queryClient.invalidateQueries({ queryKey: ['periodic-task-performance'] });
  //   };
  // NEW: bỏ qua query cấu trúc liên kết + Task con của chính task này (xem periodicTaskInvalidation.ts).
  return (taskId: number) => {
    queryClient.invalidateQueries({
      queryKey: [LIST_KEY],
      predicate: (query) => shouldRefetchAfterChecklistChange(query.queryKey, taskId),
    });
    queryClient.invalidateQueries({ queryKey: ['periodic-task-performance'] });
  };
}

/**
 * [9B-1] Sau khi THÊM item: ghi nhãn "X/Z" từ response BE vào cache danh sách (KHÔNG refetch `GET /periodic-tasks`
 * limit 100), đánh dấu list stale (`refetchType: 'none'`) để lần mở/focus sau tự làm tươi. Các query khác (trang
 * checklist, detail, rollup của task khác, performance...) vẫn refetch đúng như trước.
 */
function useApplyChecklistProgress() {
  const queryClient = useQueryClient();
  return (taskId: number, progress: { done: number; total: number }) => {
    queryClient.setQueriesData(
      { queryKey: [LIST_KEY], predicate: (query) => isPeriodicTaskListKey(query.queryKey) },
      (old: unknown) => patchTaskChecklistProgress(old, taskId, progress),
    );
    queryClient.invalidateQueries({
      queryKey: [LIST_KEY],
      predicate: (query) => isPeriodicTaskListKey(query.queryKey),
      refetchType: 'none',
    });
    queryClient.invalidateQueries({
      queryKey: [LIST_KEY],
      predicate: (query) => !isPeriodicTaskListKey(query.queryKey) && shouldRefetchAfterChecklistChange(query.queryKey, taskId),
    });
    queryClient.invalidateQueries({ queryKey: ['periodic-task-performance'] });
  };
}

export const useAddTaskChecklistItem = () => {
  const invalidate = useInvalidatePeriodicTaskChecklistItems();
  const applyProgress = useApplyChecklistProgress();
  return useMutation({
    mutationFn: ({ taskId, content, reopen }: { taskId: number; content: string; reopen?: boolean }) =>
      periodicTaskChecklistItemsApi.create(taskId, content, reopen),
    // [AGENT] OLD CODE (9B-1, giữ lại để rollback): onSuccess: (_data, variables) => invalidate(variables.taskId),
    onSuccess: (data, variables) => {
      // reopen=true: BE có thể đổi status/kỳ của Task -> dòng list đổi nhiều hơn nhãn => refetch đầy đủ như cũ.
      // BE cũ chưa trả `checklistProgress` => cũng refetch đầy đủ (không tự cộng trừ ở FE).
      if (variables.reopen || !data?.checklistProgress) {
        invalidate(variables.taskId);
        return;
      }
      applyProgress(variables.taskId, data.checklistProgress);
    },
  });
};

export const useUpdateTaskChecklistItem = () => {
  const invalidate = useInvalidatePeriodicTaskChecklistItems();
  return useMutation({
    mutationFn: ({
      taskId,
      itemId,
      data,
    }: {
      taskId: number;
      itemId: number;
      data: { content?: string; isDone?: boolean; nextStatusCode?: 'in_progress' | 'in_review' };
    }) => periodicTaskChecklistItemsApi.update(taskId, itemId, data),
    onSuccess: (_data, variables) => invalidate(variables.taskId),
  });
};

export const useRemoveTaskChecklistItem = () => {
  const invalidate = useInvalidatePeriodicTaskChecklistItems();
  return useMutation({
    mutationFn: ({ taskId, itemId }: { taskId: number; itemId: number }) =>
      periodicTaskChecklistItemsApi.remove(taskId, itemId),
    onSuccess: (_data, variables) => invalidate(variables.taskId),
  });
};

export const useMoveTaskChecklistItem = () => {
  const invalidate = useInvalidatePeriodicTaskChecklistItems();
  return useMutation({
    mutationFn: ({ taskId, itemId, direction }: { taskId: number; itemId: number; direction: 'up' | 'down' }) =>
      periodicTaskChecklistItemsApi.move(taskId, itemId, direction),
    onSuccess: (_data, variables) => invalidate(variables.taskId),
  });
};

/** 1 trang checklist item (tối đa 10). `keepPreviousData` để chuyển trang không nháy trắng. */
export const useTaskChecklistPage = (
  taskId: number | null,
  page: number,
  enabled = true,
  options: ChecklistListOptions = {},
) =>
  useQuery({
    queryKey: [LIST_KEY, 'checklist-page', taskId, page, options.sort ?? 'position', options.hideDone ?? false],
    queryFn: () => periodicTaskChecklistItemsApi.getPage(taskId as number, page, options),
    enabled: enabled && taskId != null,
    placeholderData: keepPreviousData,
  });

/** 1 trang Task con liên kết (tối đa 10). */
export const useLinkedChildrenChecklistPage = (taskId: number | null, page: number, enabled = true) =>
  useQuery({
    queryKey: [LIST_KEY, 'linked-children-page', taskId, page],
    queryFn: () => periodicTaskChecklistItemsApi.getLinkedChildrenPage(taskId as number, page),
    enabled: enabled && taskId != null,
    placeholderData: keepPreviousData,
  });
