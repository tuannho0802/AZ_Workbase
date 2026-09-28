import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  periodicTasksApi,
  PeriodicTaskFilterParams,
  CreatePeriodicTaskPayload,
  UpdatePeriodicTaskPayload,
} from '../api/periodic-tasks.api';

const LIST_KEY = 'periodic-tasks';

/** Danh sách phân trang SERVER-SIDE (mirror `useCustomers.ts`) - RBAC
 * view/edit đã được BE tự lọc theo scope (own/department/all) qua
 * `PeriodicTaskAccessHelper`, FE không cần tự lọc lại.
 *
 * `enabled` (Phase 8, PLAN mục Phase 8) - mirror `usePeriodicTask(id)` bên
 * dưới: cho phép trang cha TẮT hẳn query này khi không cần (vd Agenda/
 * Kanban/Calendar dùng 1 query riêng `limit` lớn hơn Table, không nên chạy
 * song song CẢ 2 query cùng lúc khi người dùng chỉ đang xem 1 view). Mặc
 * định `true` - KHÔNG đổi hành vi của mọi nơi gọi hook này từ trước Phase 8. */
export const usePeriodicTasks = (params: PeriodicTaskFilterParams, enabled = true) => {
  return useQuery({
    queryKey: [LIST_KEY, params],
    queryFn: () => periodicTasksApi.getAll(params),
    placeholderData: keepPreviousData,
    enabled,
  });
};

export const usePeriodicTask = (id: number | null) => {
  return useQuery({
    queryKey: [LIST_KEY, 'detail', id],
    queryFn: () => periodicTasksApi.getOne(id as number),
    enabled: id != null,
  });
};

function useInvalidatePeriodicTasks() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] });
}

/** Mark/Unmark quá hạn ảnh hưởng CẢ số liệu + danh sách Task trong Drawer/trang Hiệu suất (query key
 * `periodic-task-performance`, KHÔNG nằm trong namespace `periodic-tasks`) - nếu không invalidate thì Drawer
 * không đổi gì sau khi đánh dấu và nút vẫn bấm lại được. */
function useInvalidateOverdueViews() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
      queryClient.invalidateQueries({ queryKey: ['periodic-task-performance'] }),
    ]);
}

export const useCreatePeriodicTask = () => {
  const invalidate = useInvalidatePeriodicTasks();
  return useMutation({
    mutationFn: (data: CreatePeriodicTaskPayload) => periodicTasksApi.create(data),
    onSuccess: invalidate,
  });
};

export const useUpdatePeriodicTask = () => {
  const invalidate = useInvalidatePeriodicTasks();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdatePeriodicTaskPayload }) =>
      periodicTasksApi.update(id, data),
    onSuccess: invalidate,
  });
};

export const useDeletePeriodicTask = () => {
  const invalidate = useInvalidatePeriodicTasks();
  return useMutation({
    mutationFn: (id: number) => periodicTasksApi.remove(id),
    onSuccess: invalidate,
  });
};

/** Phase 5 (PLAN mục 2.9) - Khoá/Mở khoá, invalidate CẢ namespace `LIST_KEY`
 * (mirror các mutation khác ở file này) để cả bảng danh sách lẫn
 * `usePeriodicTask(id)` (đang mở trong `TaskLinksModal`) tự fetch lại đúng
 * `isLocked` mới nhất. */
export const useLockPeriodicTask = () => {
  const invalidate = useInvalidatePeriodicTasks();
  return useMutation({
    mutationFn: ({ id, lockNote }: { id: number; lockNote?: string }) => periodicTasksApi.lock(id, lockNote),
    onSuccess: invalidate,
  });
};

export const useUnlockPeriodicTask = () => {
  const invalidate = useInvalidatePeriodicTasks();
  return useMutation({
    mutationFn: (id: number) => periodicTasksApi.unlock(id),
    onSuccess: invalidate,
  });
};

/** Đánh dấu / gỡ "Quá hạn" thủ công - invalidate CẢ namespace (bảng, Kanban, Agenda, hiệu suất). */
export const useMarkPeriodicTaskOverdue = () => {
  const invalidate = useInvalidateOverdueViews();
  return useMutation({
    mutationFn: (id: number) => periodicTasksApi.markOverdue(id),
    onSuccess: invalidate,
  });
};

export const useUnmarkPeriodicTaskOverdue = () => {
  const invalidate = useInvalidateOverdueViews();
  return useMutation({
    mutationFn: (id: number) => periodicTasksApi.unmarkOverdue(id),
    onSuccess: invalidate,
  });
};
