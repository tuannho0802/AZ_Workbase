import axiosInstance from './axios-instance';
import {
  DeviceStatus,
  DeviceUser,
  SyncSummary,
  AttendanceLogQuery,
  PaginatedAttendanceLogs,
  AttendanceSummaryQuery,
  PaginatedAttendanceSummary,
} from '../types/zk-device.types';

export const zkDeviceApi = {
  getStatus: async (): Promise<DeviceStatus> => {
    const response = await axiosInstance.get('/zk-device/status');
    return response.data;
  },

  getDeviceUsers: async (): Promise<DeviceUser[]> => {
    const response = await axiosInstance.get('/zk-device/device-users');
    return response.data;
  },

  mapUser: async (userId: number, deviceUserId: string) => {
    const response = await axiosInstance.post('/zk-device/map-user', {
      userId,
      deviceUserId,
    });
    return response.data;
  },

  unmapUser: async (userId: number) => {
    const response = await axiosInstance.delete(`/zk-device/map-user/${userId}`);
    return response.data;
  },

  /** payload rỗng/undefined = đồng bộ toàn bộ (như cũ). Truyền from/to (YYYY-MM-DD) để chỉ đồng bộ 1 khoảng ngày - nhẹ hơn, nhanh hơn. */
  syncNow: async (payload?: { from?: string; to?: string }): Promise<SyncSummary> => {
    const response = await axiosInstance.post('/zk-device/sync', payload || {});
    return response.data;
  },

  rematch: async (): Promise<{ updated: number }> => {
    const response = await axiosInstance.post('/zk-device/rematch');
    return response.data;
  },

  getAttendanceLogs: async (
    params?: AttendanceLogQuery,
  ): Promise<PaginatedAttendanceLogs> => {
    const response = await axiosInstance.get('/zk-device/attendance-logs', { params });
    return response.data;
  },

  getAttendanceSummary: async (
    params?: AttendanceSummaryQuery,
  ): Promise<PaginatedAttendanceSummary> => {
    const response = await axiosInstance.get('/zk-device/attendance-summary', { params });
    return response.data;
  },

  // Xoá vĩnh viễn log chấm công cũ hơn `olderThan` (YYYY-MM-DD) - KHÔNG THỂ
  // HOÀN TÁC, dùng để dọn dẹp bảng attendance_logs khi đã tích luỹ quá lâu.
  cleanupAttendanceLogs: async (
    olderThan: string,
  ): Promise<{ deleted: number; olderThan: string }> => {
    const response = await axiosInstance.delete('/zk-device/attendance-logs/cleanup', {
      params: { olderThan },
    });
    return response.data;
  },
};