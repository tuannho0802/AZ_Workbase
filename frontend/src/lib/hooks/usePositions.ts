import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  positionsApi,
  Position,
  CreatePositionPayload,
  UpdatePositionPayload,
} from '../api/positions.api';

const POSITIONS_KEY = ['positions'];
const EMPTY_POSITIONS: Position[] = [];

export const usePositions = () => {
  const { data, isLoading } = useQuery({
    queryKey: POSITIONS_KEY,
    queryFn: positionsApi.getAll,
    staleTime: 5 * 60 * 1000, // 5 phút - danh mục Vị trí ít đổi, giống Department
  });

  return {
    positions: (data as Position[]) ?? EMPTY_POSITIONS,
    isLoading,
  };
};

function useInvalidatePositions() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: POSITIONS_KEY });
}

export const useCreatePosition = () => {
  const invalidate = useInvalidatePositions();
  return useMutation({
    mutationFn: (data: CreatePositionPayload) => positionsApi.create(data),
    onSuccess: invalidate,
  });
};

export const useUpdatePosition = () => {
  const invalidate = useInvalidatePositions();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdatePositionPayload }) =>
      positionsApi.update(id, data),
    onSuccess: invalidate,
  });
};

export const useDeletePosition = () => {
  const invalidate = useInvalidatePositions();
  return useMutation({
    mutationFn: (id: number) => positionsApi.remove(id),
    onSuccess: invalidate,
  });
};
