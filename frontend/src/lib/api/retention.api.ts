import axiosInstance from './axios-instance';

export type RetentionTargetKey = 'audit_logs' | 'task_audit_logs' | 'notifications' | 'attendance_logs';

export interface RetentionTargetSetting {
  enabled: boolean;
  retentionDays: number;
}

export interface RetentionSchedule {
  lastRun: { status: string; affected: number; message: string | null; ageSeconds: number } | null;
  /** Số giây tới lần chạy tiếp theo (theo đồng hồ DB). 0 = đến hạn ở lần kích hoạt kế tiếp. */
  nextDueInSeconds: number;
  dueNow: boolean;
}

export interface RetentionSettings {
  intervalDays: number;
  auditLogs: RetentionTargetSetting;
  taskAuditLogs: RetentionTargetSetting;
  notifications: RetentionTargetSetting & { unreadRetentionDays: number };
  attendanceLogs: RetentionTargetSetting;
  schedule: RetentionSchedule;
}

export interface UpdateRetentionSettingsPayload {
  intervalDays?: number;
  auditLogs?: Partial<RetentionTargetSetting>;
  taskAuditLogs?: Partial<RetentionTargetSetting>;
  notifications?: Partial<RetentionTargetSetting> & { unreadRetentionDays?: number };
  attendanceLogs?: Partial<RetentionTargetSetting>;
}

export interface RetentionRunResult {
  dryRun?: boolean;
  status?: 'success' | 'partial' | 'failed';
  affected?: number;
  results?: Array<{ target: RetentionTargetKey; count: number; partial: boolean; from?: string | null; to?: string | null; skipped?: 'DISABLED'; error?: string }>;
}

export const retentionApi = {
  getSettings: async (): Promise<RetentionSettings> => (await axiosInstance.get('/system/retention-settings')).data,

  updateSettings: async (payload: UpdateRetentionSettingsPayload): Promise<RetentionSettings> =>
    (await axiosInstance.put('/system/retention-settings', payload)).data,

  runNow: async (params: { target?: RetentionTargetKey; dryRun?: boolean }): Promise<RetentionRunResult> =>
    // [AGENT] OLD CODE: post('/system/retention/run-now', null, ...) - axios + Content-Type JSON biến `null` thành body chuỗi "null"
    // -> body-parser strict ném SyntaxError -> ServeStatic đổi thành 404 "Cannot POST". Dùng `{}` (JSON hợp lệ).
    (await axiosInstance.post('/system/retention/run-now', {}, {
      params: { target: params.target, dryRun: params.dryRun ? 'true' : 'false' },
    })).data,
};
