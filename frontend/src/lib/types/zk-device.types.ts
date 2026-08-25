export interface DeviceStatus {
  connected: boolean;
  ip: string;
  port: number;
  [key: string]: any; // node-zklib info trả thêm field tuỳ firmware (vd userCounts, logCounts...)
}

export interface DeviceUser {
  uid: number; // số thứ tự nội bộ trong máy - KHÔNG dùng để map
  userId: string; // mã user trên máy - dùng để map với nhân viên
  name: string;
  role: number;
  cardno: number;
  mappedUserId: number | null;
  mappedUserName: string | null;
}

export interface SyncSummary {
  startedAt: string;
  finishedAt: string;
  totalFetchedFromDevice: number;
  insertedNew: number;
  matchedToUser: number;
  unmatchedDeviceUserIds: string[];
}

export interface AttendanceLog {
  id: number;
  deviceSerialNumber: string;
  deviceUserId: string;
  userSn: number | null;
  recordTime: string;
  statusCode: string | null;
  verifyMode: string | null;
  matchedUserId: number | null;
  matchedUser: { id: number; name: string } | null;
  source: 'device_pull' | 'device_push';
  syncedAt: string;
}

export interface AttendanceLogQuery {
  page?: number;
  limit?: number;
  userId?: number;
  matched?: 'matched' | 'unmatched';
  from?: string;
  to?: string;
}

export interface PaginatedAttendanceLogs {
  data: AttendanceLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
