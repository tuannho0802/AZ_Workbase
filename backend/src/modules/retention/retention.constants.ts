/**
 * PLAN_RETENTION_SECURITY_ROADMAP — Phase 1 (Retention tự động).
 * Cấu hình từng đối tượng nằm ở bảng `settings` (key/value) — KHÔNG cần migration cho phần này.
 */
export type RetentionTarget = 'audit_logs' | 'task_audit_logs' | 'notifications' | 'attendance_logs';

export const RETENTION_TARGETS: RetentionTarget[] = [
  'audit_logs',
  'task_audit_logs',
  'notifications',
  'attendance_logs',
];

export const RETENTION_JOB = 'retention';
/** Dòng `cron_runs.target` của lần chạy đủ mọi đối tượng (mốc để tính chu kỳ). */
export const RETENTION_ALL = 'all';

export const RETENTION_INTERVAL_KEY = 'retention_cron_interval_days';
export const RETENTION_INTERVAL_DEFAULT = 30;
export const RETENTION_INTERVAL_MIN = 7;
export const RETENTION_INTERVAL_MAX = 90;

/** Số dòng xoá mỗi câu DELETE ... LIMIT và ngân sách thời gian mỗi lần chạy (serverless). */
export const RETENTION_BATCH_SIZE = 5000;
export const RETENTION_TIME_BUDGET_MS = 8000;
/** Dòng `running` cũ hơn mức này coi như đã chết (chạy lại được). */
export const RETENTION_RUNNING_STALE_SECONDS = 600;

export interface RetentionTargetConfig {
  enabledKey: string;
  daysKey: string;
  defaultEnabled: boolean;
  defaultDays: number;
  minDays: number;
}

export const RETENTION_TARGET_CONFIG: Record<RetentionTarget, RetentionTargetConfig> = {
  // enabledKey/daysKey của audit_logs trùng với AuditService.getCleanupSettings() (giữ tương thích).
  audit_logs: {
    enabledKey: 'audit_cleanup_enabled',
    daysKey: 'audit_retention_days',
    defaultEnabled: false,
    defaultDays: 90,
    minDays: 7,
  },
  task_audit_logs: {
    enabledKey: 'task_audit_cleanup_enabled',
    daysKey: 'task_audit_retention_days',
    defaultEnabled: false,
    defaultDays: 90,
    minDays: 7,
  },
  notifications: {
    enabledKey: 'notification_cleanup_enabled',
    daysKey: 'notification_retention_days',
    defaultEnabled: false,
    defaultDays: 60,
    minDays: 7,
  },
  // Dữ liệu chấm công/lương: mặc định TẮT, sàn 365 ngày.
  attendance_logs: {
    enabledKey: 'attendance_cleanup_enabled',
    daysKey: 'attendance_retention_days',
    defaultEnabled: false,
    defaultDays: 365,
    minDays: 365,
  },
};

/** Thông báo CHƯA ĐỌC được giữ lâu hơn thông báo đã đọc. */
export const NOTIFICATION_UNREAD_DAYS_KEY = 'notification_unread_retention_days';
export const NOTIFICATION_UNREAD_DAYS_DEFAULT = 180;
export const NOTIFICATION_UNREAD_DAYS_MIN = 30;

/**
 * Action bảo mật KHÔNG bị job dọn `audit_logs` chung xoá ở mốc 90 ngày (chúng có hạn riêng ở Phase 4).
 * Hiện mới có `UNLOCK_LOGIN`; Phase 4 sẽ thay bằng `SECURITY_AUDIT_ACTIONS` đầy đủ.
 */
export const RETENTION_PROTECTED_AUDIT_ACTIONS: string[] = ['UNLOCK_LOGIN'];
