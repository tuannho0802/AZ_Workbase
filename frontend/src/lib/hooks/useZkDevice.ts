import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zkDeviceApi } from '../api/zk-device.api';
import { AttendanceLogQuery } from '../types/zk-device.types';

export const useDeviceStatus = () => {
  return useQuery({
    queryKey: ['zk-device-status'],
    queryFn: zkDeviceApi.getStatus,
    retry: false, // máy có thể offline - không cần Antd/react-query retry liên tục
    staleTime: 30 * 1000,
  });
};

export const useDeviceUsers = () => {
  return useQuery({
    queryKey: ['zk-device-users'],
    queryFn: zkDeviceApi.getDeviceUsers,
    retry: false,
  });
};

export const useMapDeviceUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, deviceUserId }: { userId: number; deviceUserId: string }) =>
      zkDeviceApi.mapUser(userId, deviceUserId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['zk-device-users'] });
    },
  });
};

export const useUnmapDeviceUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) => zkDeviceApi.unmapUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['zk-device-users'] });
    },
  });
};

export const useSyncDeviceNow = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: zkDeviceApi.syncNow,
    onSuccess: () => {
      // Sync xong -> danh sách log chấm công và trạng thái map đều có thể đổi
      queryClient.invalidateQueries({ queryKey: ['zk-attendance-logs'] });
      queryClient.invalidateQueries({ queryKey: ['zk-device-users'] });
    },
  });
};

export const useAttendanceLogs = (query: AttendanceLogQuery) => {
  return useQuery({
    queryKey: ['zk-attendance-logs', query],
    queryFn: () => zkDeviceApi.getAttendanceLogs(query),
  });
};
