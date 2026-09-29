import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { periodicTaskChecklistItemsApi, type ChecklistListOptions } from '../api/periodic-task-checklist-items.api';

/** CÙNG namespace `'periodic-tasks'` (mirror `usePeriodicTaskSecondaryAssignees.ts`) -
 * các query trang checklist nằm dưới namespace này nên mọi mutation chỉ cần invalidate
 * namespace là cả trang checklist lẫn nhãn "X/Z" ở danh sách Task tự refetch. */
const LIST_KEY = 'periodic-tasks';

function useInvalidatePeriodicTaskChecklistItems() {
  const queryClient = useQueryClient();
  // BE có thể đổi status/kỳ Task ngay trong request tick/thêm checklist (Guard) -> làm tươi cả hiệu suất.
  return () => {
    queryClient.invalidateQueries({ queryKey: [LIST_KEY] });
    queryClient.invalidateQueries({ queryKey: ['periodic-task-performance'] });
  };
}

export const useAddTaskChecklistItem = () => {
  const invalidate = useInvalidatePeriodicTaskChecklistItems();
  return useMutation({
    mutationFn: ({ taskId, content, reopen }: { taskId: number; content: string; reopen?: boolean }) =>
      periodicTaskChecklistItemsApi.create(taskId, content, reopen),
    onSuccess: invalidate,
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
    onSuccess: invalidate,
  });
};

export const useRemoveTaskChecklistItem = () => {
  const invalidate = useInvalidatePeriodicTaskChecklistItems();
  return useMutation({
    mutationFn: ({ taskId, itemId }: { taskId: number; itemId: number }) =>
      periodicTaskChecklistItemsApi.remove(taskId, itemId),
    onSuccess: invalidate,
  });
};

export const useMoveTaskChecklistItem = () => {
  const invalidate = useInvalidatePeriodicTaskChecklistItems();
  return useMutation({
    mutationFn: ({ taskId, itemId, direction }: { taskId: number; itemId: number; direction: 'up' | 'down' }) =>
      periodicTaskChecklistItemsApi.move(taskId, itemId, direction),
    onSuccess: invalidate,
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
