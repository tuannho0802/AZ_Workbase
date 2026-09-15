import { useMutation, useQueryClient } from '@tanstack/react-query';
import { periodicTaskSecondaryAssigneesApi } from '../api/periodic-task-secondary-assignees.api';

/** CÙNG namespace `'periodic-tasks'` (mirror `usePeriodicTaskCustomers.ts`) -
 * `secondaryAssignees` chỉ nằm trong response của `GET /:id`
 * (`usePeriodicTask(id)`), nên invalidate cả namespace để query detail tự
 * fetch lại thay vì phải liệt kê riêng key con. */
const LIST_KEY = 'periodic-tasks';

function useInvalidatePeriodicTaskSecondaryAssignees() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] });
}

export const useAddTaskSecondaryAssignee = () => {
  const invalidate = useInvalidatePeriodicTaskSecondaryAssignees();
  return useMutation({
    mutationFn: ({ taskId, userId }: { taskId: number; userId: number }) =>
      periodicTaskSecondaryAssigneesApi.addSecondaryAssignee(taskId, userId),
    onSuccess: invalidate,
  });
};

export const useRemoveTaskSecondaryAssignee = () => {
  const invalidate = useInvalidatePeriodicTaskSecondaryAssignees();
  return useMutation({
    mutationFn: ({ taskId, userId }: { taskId: number; userId: number }) =>
      periodicTaskSecondaryAssigneesApi.removeSecondaryAssignee(taskId, userId),
    onSuccess: invalidate,
  });
};
