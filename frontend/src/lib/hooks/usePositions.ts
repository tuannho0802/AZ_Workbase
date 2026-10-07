import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  positionsApi,
  Position,
  CreatePositionPayload,
  UpdatePositionPayload,
} from '../api/positions.api';

import { refDataQueryOptions } from '../query-stale';

const POSITIONS_KEY = ['positions'];
const EMPTY_POSITIONS: Position[] = [];

export const usePositions = () => {
  const { data, isLoading } = useQuery({
    queryKey: POSITIONS_KEY,
    queryFn: positionsApi.getAll,
    // [AGENT] OLD CODE (giữ để rollback): staleTime: 5 * 60 * 1000
    ...refDataQueryOptions(), // 9D
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
