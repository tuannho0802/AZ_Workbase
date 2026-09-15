import { useMutation, useQueryClient } from '@tanstack/react-query';
import { periodicTaskChecklistItemsApi } from '../api/periodic-task-checklist-items.api';

/** CÙNG namespace `'periodic-tasks'` (mirror
 * `usePeriodicTaskSecondaryAssignees.ts`) - `checklistItems` chỉ nằm trong
 * response của `GET /:id` (`usePeriodicTask(id)`), nên invalidate cả
 * namespace để query detail tự fetch lại thay vì phải liệt kê riêng key con. */
const LIST_KEY = 'periodic-tasks';

function useInvalidatePeriodicTaskChecklistItems() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] });
}

export const useAddTaskChecklistItem = () => {
  const invalidate = useInvalidatePeriodicTaskChecklistItems();
  return useMutation({
    mutationFn: ({ taskId, content }: { taskId: number; content: string }) =>
      periodicTaskChecklistItemsApi.create(taskId, content),
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
      data: { content?: string; isDone?: boolean };
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

export const useReorderTaskChecklistItems = () => {
  const invalidate = useInvalidatePeriodicTaskChecklistItems();
  return useMutation({
    mutationFn: ({ taskId, itemIds }: { taskId: number; itemIds: number[] }) =>
      periodicTaskChecklistItemsApi.reorder(taskId, itemIds),
    onSuccess: invalidate,
  });
};
