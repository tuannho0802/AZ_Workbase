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
  // Khoảng ngày đã lọc để ghi vào DB (null = không giới hạn). CHỈ ảnh hưởng
  // bước match/insert, KHÔNG giảm được thời gian tải từ máy (xem backend).
  fromDate: string | null;
  toDate: string | null;
  recordsInRange: number;
  // Số log THẬT SỰ máy báo có (qua getInfo().logCounts) - null nếu không lấy được.
  expectedLogCount: number | null;
  // true nếu sau khi đã thử lại vẫn có thể thiếu data - cần hiển thị cảnh báo rõ cho admin.
  partialFetch: boolean;
  fetchAttempts: number;
  fetchWarning: string | null;
  insertedNew: number;
  matchedToUser: number;
  unmatchedDeviceUserIds: string[];
  invalidTimeCount: number;
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
  deviceUserName: string | null; // tên trên máy (từ cache) - có cho MỌI log, kể cả đã khớp nhân viên
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

export type AttendanceStatus =
  | 'on_time'
  | 'late'
  | 'early_leave'
  | 'late_and_early'
  | 'missing_checkout';

export interface AttendanceSummaryRow {
  userId: number | null; // null nếu là user CHƯA map với nhân viên hệ thống
  userName: string; // tên nhân viên nếu đã map, hoặc tên/UID trên máy nếu chưa map
  isMapped: boolean;
  deviceUserId: string; // mã user trên máy - luôn có, kể cả khi đã map
  // Tên đăng ký TRÊN MÁY (từ cache) - có giá trị cho CẢ user đã map lẫn chưa
  // map (khác `userName`: với user đã map, `userName` là tên hệ thống, còn
  // field này luôn là tên trên máy - dùng làm phụ đề "(tên trên máy)" ở UI).
  // null nếu cache chưa có tên (vd user đã bị xoá khỏi máy từ trước).
  deviceUserName: string | null;
  date: string; // YYYY-MM-DD (giờ VN)
  checkIn: string;
  checkOut: string | null;
  workHours: number | null;
  isLate: boolean;
  isEarlyLeave: boolean;
  status: AttendanceStatus;
  logCount: number;
}

export interface AttendanceSummaryQuery {
  page?: number;
  limit?: number;
  userId?: number;
  from?: string;
  to?: string;
}

export interface PaginatedAttendanceSummary {
  data: AttendanceSummaryRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}