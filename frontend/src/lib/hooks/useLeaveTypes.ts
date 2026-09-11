import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  leaveTypesApi,
  LeaveType,
  CreateLeaveTypePayload,
  UpdateLeaveTypePayload,
} from '../api/leave-types.api';

const QUERY_KEY = ['leave-types'];

export const useLeaveTypes = () => {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => leaveTypesApi.getAll(),
    staleTime: 60 * 1000,
  });

  return {
    leaveTypes: (data as LeaveType[]) ?? [],
    isLoading,
    isError,
    error,
  };
};

function useInvalidateLeaveTypes() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });
}

export const useCreateLeaveType = () => {
  const invalidate = useInvalidateLeaveTypes();
  return useMutation({
    mutationFn: (data: CreateLeaveTypePayload) => leaveTypesApi.create(data),
    onSuccess: invalidate,
  });
};

export const useUpdateLeaveType = () => {
  const invalidate = useInvalidateLeaveTypes();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateLeaveTypePayload }) =>
      leaveTypesApi.update(id, data),
    onSuccess: invalidate,
  });
};

export const useDeleteLeaveType = () => {
  const invalidate = useInvalidateLeaveTypes();
  return useMutation({
    mutationFn: ({ id, fallbackCode }: { id: number; fallbackCode?: string }) =>
      leaveTypesApi.remove(id, fallbackCode),
    onSuccess: invalidate,
  });
};
