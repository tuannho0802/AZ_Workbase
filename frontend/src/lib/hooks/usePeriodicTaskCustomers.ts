import { useMutation, useQueryClient } from '@tanstack/react-query';
import { periodicTaskCustomersApi } from '../api/periodic-task-customers.api';

/** CÙNG namespace `'periodic-tasks'` (mirror `usePeriodicTaskLinks.ts`) - sau
 * khi gắn/gỡ Customer, `linkedCustomers` chỉ nằm trong response của
 * `GET /:id` (`usePeriodicTask(id)`), nên invalidate cả namespace để query
 * detail tự fetch lại thay vì phải liệt kê riêng key con. */
const LIST_KEY = 'periodic-tasks';

function useInvalidatePeriodicTaskCustomers() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] });
}

export const useAddTaskCustomers = () => {
  const invalidate = useInvalidatePeriodicTaskCustomers();
  return useMutation({
    mutationFn: ({ taskId, customerIds }: { taskId: number; customerIds: number[] }) =>
      periodicTaskCustomersApi.addCustomers(taskId, customerIds),
    onSuccess: invalidate,
  });
};

export const useRemoveTaskCustomer = () => {
  const invalidate = useInvalidatePeriodicTaskCustomers();
  return useMutation({
    mutationFn: ({ taskId, customerId }: { taskId: number; customerId: number }) =>
      periodicTaskCustomersApi.removeCustomer(taskId, customerId),
    onSuccess: invalidate,
  });
};
