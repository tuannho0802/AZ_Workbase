import axiosInstance from './axios-instance';
import {
  DeviceStatus,
  DeviceUser,
  SyncSummary,
  AttendanceLogQuery,
  PaginatedAttendanceLogs,
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

  syncNow: async (): Promise<SyncSummary> => {
    const response = await axiosInstance.post('/zk-device/sync');
    return response.data;
  },

  getAttendanceLogs: async (
    params?: AttendanceLogQuery,
  ): Promise<PaginatedAttendanceLogs> => {
    const response = await axiosInstance.get('/zk-device/attendance-logs', { params });
    return response.data;
  },
};
