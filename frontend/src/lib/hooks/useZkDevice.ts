import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zkDeviceApi } from '../api/zk-device.api';
import { attendanceExportApi } from '../api/attendance-export.api';
import { AttendanceLogQuery, AttendanceSummaryQuery } from '../types/zk-device.types';

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
      // Sync xong -> log chấm công, trạng thái map, VÀ bảng tổng hợp/bảng
      // chấm công đều có thể đổi. Trước đây thiếu invalidate
      // 'zk-attendance-summary' - đây chính là 1 phần nguyên nhân "lệch pha"
      // dữ liệu hiển thị: sync xong nhưng tab Tổng hợp/Bảng chấm công vẫn
      // hiện dữ liệu cache cũ cho tới khi người dùng tự đổi filter/F5.
      queryClient.invalidateQueries({ queryKey: ['zk-attendance-logs'] });
      queryClient.invalidateQueries({ queryKey: ['zk-attendance-summary'] });
      queryClient.invalidateQueries({ queryKey: ['zk-device-users'] });
    },
  });
};

export const useRematchDeviceLogs = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: zkDeviceApi.rematch,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['zk-attendance-logs'] });
      queryClient.invalidateQueries({ queryKey: ['zk-attendance-summary'] });
    },
  });
};

export const useAttendanceLogs = (query: AttendanceLogQuery) => {
  return useQuery({
    queryKey: ['zk-attendance-logs', query],
    queryFn: () => zkDeviceApi.getAttendanceLogs(query),
  });
};

export const useAttendanceSummary = (query: AttendanceSummaryQuery) => {
  return useQuery({
    queryKey: ['zk-attendance-summary', query],
    queryFn: () => zkDeviceApi.getAttendanceSummary(query),
  });
};

export const useCleanupAttendanceLogs = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (olderThan: string) => zkDeviceApi.cleanupAttendanceLogs(olderThan),
    onSuccess: () => {
      // Xoá xong -> danh sách log + bảng tổng hợp đều có thể đổi (log cũ bị
      // xoá sẽ không còn xuất hiện) - invalidate cả 2 để UI cập nhật ngay.
      queryClient.invalidateQueries({ queryKey: ['zk-attendance-logs'] });
      queryClient.invalidateQueries({ queryKey: ['zk-attendance-summary'] });
    },
  });
};

// 3 hook export Excel - không cần invalidate gì (chỉ tải file xuống, không
// đổi dữ liệu) - dùng useMutation chỉ để có sẵn isPending/error nhất quán
// với các action khác trong trang, không phải vì cần cache.
export const useExportAttendanceLogs = () => {
  return useMutation({ mutationFn: attendanceExportApi.exportLogs });
};

export const useExportAttendanceSummary = () => {
  return useMutation({ mutationFn: attendanceExportApi.exportSummary });
};

export const useExportMonthlyAttendance = () => {
  return useMutation({ mutationFn: attendanceExportApi.exportMonthly });
};