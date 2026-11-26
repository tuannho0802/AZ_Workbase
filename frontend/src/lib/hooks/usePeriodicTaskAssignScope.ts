import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { periodicTasksApi } from '../api/periodic-tasks.api';
import { useMyPermissions } from './useMyPermissions';

/**
 * Lọc dropdown Người/Phòng ban theo scope của 1 permission Công việc định kỳ.
 * scope = 'department' => CHỈ hiện người/phòng ban thuộc phòng ban mình quản lý;
 * scope khác (all/own/admin) => không lọc. FE chỉ để UX - BE vẫn chặn 403 ở create/edit.
 */
export function usePeriodicTaskAssignScope() {
  const { scope } = useMyPermissions();
  const needsDept = ['view', 'create', 'edit'].some((k) => scope(`periodic_tasks.${k}`) === 'department');

  const { data: managedIds } = useQuery({
    queryKey: ['periodic-tasks', 'managed-departments'],
    queryFn: periodicTasksApi.getManagedDepartmentIds,
    enabled: needsDept,
    staleTime: 5 * 60 * 1000,
  });

  /** null = không giới hạn; Set = chỉ các phòng ban này. */
  const allowedFor = useCallback(
    (permKey: string): Set<number> | null =>
      scope(permKey) === 'department' ? new Set(managedIds ?? []) : null,
    [scope, managedIds],
  );

  const filterUsers = useCallback(
    <T extends { id: number; departmentId?: number | null; department?: { id: number } | null }>(
      list: T[],
      permKey: string,
      keepIds: Array<number | null | undefined> = [],
    ): T[] => {
      const allowed = allowedFor(permKey);
      if (!allowed) return list;
      return list.filter((u) => keepIds.includes(u.id) || allowed.has((u.departmentId ?? u.department?.id) as number));
    },
    [allowedFor],
  );

  const filterDepartments = useCallback(
    <T extends { id: number }>(list: T[], permKey: string): T[] => {
      const allowed = allowedFor(permKey);
      return allowed ? list.filter((d) => allowed.has(d.id)) : list;
    },
    [allowedFor],
  );

  return { filterUsers, filterDepartments };
}
