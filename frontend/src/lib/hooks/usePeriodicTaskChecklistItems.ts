import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { periodicTaskChecklistItemsApi, type ChecklistListOptions } from '../api/periodic-task-checklist-items.api';
import { createInvalidationDebouncer, type InvalidationDebouncer } from '../utils/invalidationDebouncer';
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

/** [9B-2] Cửa sổ gộp + trần chờ cho các invalidate PHỤ sau khi thêm item (xem `invalidationDebouncer.ts`). */
export const SECONDARY_INVALIDATE_DELAY_MS = 1500;
export const SECONDARY_INVALIDATE_MAX_WAIT_MS = 5000;

/** Mỗi QueryClient 1 debouncer (modal + inline cùng thêm vào 1 task phải gộp chung). */
const debouncers = new WeakMap<QueryClient, InvalidationDebouncer>();
function getDebouncer(queryClient: QueryClient): InvalidationDebouncer {
  let d = debouncers.get(queryClient);
  if (!d) {
    d = createInvalidationDebouncer(SECONDARY_INVALIDATE_DELAY_MS, SECONDARY_INVALIDATE_MAX_WAIT_MS);
    debouncers.set(queryClient, d);
  }
  return d;
}

const isOwnChecklistPage = (queryKey: readonly unknown[], taskId: number) =>
  queryKey[1] === 'checklist-page' && queryKey[2] === taskId;

/**
 * [9B-1] Sau khi THÊM/TICK/XOÁ item: ghi nhãn "X/Z" từ response BE vào cache danh sách (KHÔNG refetch `GET /periodic-tasks`
 * limit 100), đánh dấu list stale (`refetchType: 'none'`) để lần mở/focus sau tự làm tươi.
 *
 * [9B-2] Trang checklist của CHÍNH task refetch NGAY (người dùng đang nhìn, phải thấy item mới). Các query PHỤ
 * (detail, Task con của task cha, rollup task khác, performance...) được GỘP: thêm liên tiếp N lần chỉ refetch 1 lần
 * sau lần cuối (trễ tối đa `SECONDARY_INVALIDATE_MAX_WAIT_MS`). Chỉ có tác dụng khi các view phụ đó đang mở.
 */
function useApplyChecklistProgress() {
  const queryClient = useQueryClient();
  // `progress` vắng = thay đổi KHÔNG làm đổi nhãn "X/Z" (sửa nội dung, đổi chỗ) -> không đụng cache list.
  return (taskId: number, progress?: { done: number; total: number }) => {
    if (progress) {
      queryClient.setQueriesData(
        { queryKey: [LIST_KEY], predicate: (query) => isPeriodicTaskListKey(query.queryKey) },
        (old: unknown) => patchTaskChecklistProgress(old, taskId, progress),
      );
      queryClient.invalidateQueries({
        queryKey: [LIST_KEY],
        predicate: (query) => isPeriodicTaskListKey(query.queryKey),
        refetchType: 'none',
      });
    }
    // NGAY: trang checklist của chính task.
    queryClient.invalidateQueries({
      queryKey: [LIST_KEY],
      predicate: (query) => isOwnChecklistPage(query.queryKey, taskId),
    });
    // GỘP: mọi query phụ còn lại.
    // [AGENT] OLD CODE (9B-1, giữ lại để rollback): invalidate phụ chạy ngay trong từng lần onSuccess:
    //   queryClient.invalidateQueries({ queryKey: [LIST_KEY], predicate: (q) => !isPeriodicTaskListKey(q.queryKey) && shouldRefetchAfterChecklistChange(q.queryKey, taskId) });
    //   queryClient.invalidateQueries({ queryKey: ['periodic-task-performance'] });
    getDebouncer(queryClient).schedule(taskId, () => {
      queryClient.invalidateQueries({
        queryKey: [LIST_KEY],
        predicate: (query) =>
          !isPeriodicTaskListKey(query.queryKey) &&
          !isOwnChecklistPage(query.queryKey, taskId) &&
          shouldRefetchAfterChecklistChange(query.queryKey, taskId),
      });
      queryClient.invalidateQueries({ queryKey: ['periodic-task-performance'] });
    });
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
  const applyProgress = useApplyChecklistProgress();
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
    // [AGENT] OLD CODE (giữ lại để rollback): onSuccess: (_data, variables) => invalidate(variables.taskId),
    onSuccess: (data, variables) => {
      const toggled = variables.data.isDone !== undefined;
      // Guard đổi status Task (BE báo `statusChanged`), hoặc BE cũ không trả tiến độ khi tick -> refetch đầy đủ như cũ.
      if (data?.statusChanged || (toggled && !data?.checklistProgress)) {
        invalidate(variables.taskId);
        return;
      }
      // Tick/bỏ tick: ghi nhãn từ BE. Chỉ sửa nội dung: nhãn không đổi (progress undefined).
      applyProgress(variables.taskId, toggled ? data.checklistProgress : undefined);
    },
  });
};

export const useRemoveTaskChecklistItem = () => {
  const invalidate = useInvalidatePeriodicTaskChecklistItems();
  const applyProgress = useApplyChecklistProgress();
  return useMutation({
    mutationFn: ({ taskId, itemId }: { taskId: number; itemId: number }) =>
      periodicTaskChecklistItemsApi.remove(taskId, itemId),
    // [AGENT] OLD CODE (giữ lại để rollback): onSuccess: (_data, variables) => invalidate(variables.taskId),
    onSuccess: (data, variables) => {
      if (!data?.checklistProgress) {
        invalidate(variables.taskId); // BE cũ chưa trả tiến độ -> refetch đầy đủ
        return;
      }
      applyProgress(variables.taskId, data.checklistProgress);
    },
  });
};

export const useMoveTaskChecklistItem = () => {
  const applyProgress = useApplyChecklistProgress();
  return useMutation({
    mutationFn: ({ taskId, itemId, direction }: { taskId: number; itemId: number; direction: 'up' | 'down' }) =>
      periodicTaskChecklistItemsApi.move(taskId, itemId, direction),
    // Đổi chỗ KHÔNG đổi tiến độ/status -> không đụng cache list; chỉ làm tươi trang checklist của task (+ query phụ gộp).
    // [AGENT] OLD CODE (giữ lại để rollback): onSuccess: (_data, variables) => invalidate(variables.taskId),
    onSuccess: (_data, variables) => applyProgress(variables.taskId),
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
