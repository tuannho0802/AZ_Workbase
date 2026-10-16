import axiosInstance from './axios-instance';

export interface SystemResetResponse {
  /** Epoch mới sau khi Reset - mọi client thấy số này trong poll thì làm mới toàn bộ cache. */
  epoch: number;
  resetAt: string;
}

/** Một phần của /system/health: lỗi riêng từng phần, các phần khác vẫn có dữ liệu. */
export type HealthSection<T> = ({ error: false } & T) | { error: true };

export interface HealthTableItem {
  name: string;
  rowsEstimate: number;
  sizeBytes: number;
  watched: boolean;
  warn: boolean;
}

export interface HealthCacheItem {
  key: string;
  label: string;
  ttlSeconds: number;
  /** null = không đọc được số mục của cache này. */
  entries: number | null;
}

export type HealthCronWarnReason = 'NEVER_RAN' | 'OVERDUE' | 'LAST_RUN_INCOMPLETE';

export interface SystemHealth {
  generatedAt: string;
  app: HealthSection<{
    version: string;
    commit: string | null;
    region: string | null;
    nodeEnv: string;
    nodeVersion: string;
    uptimeSeconds: number;
  }>;
  database: HealthSection<{ ok: boolean; pingMs: number; serverVersion: string | null }>;
  tables: HealthSection<{ items: HealthTableItem[]; totalBytes: number; warnCount: number; cachedAt: string; fromCache: boolean }>;
  cron: HealthSection<{
    job: string;
    intervalDays: number;
    lastRun: { status: string; affected: number; message: string | null; ageSeconds: number } | null;
    nextDueInSeconds: number;
    dueNow: boolean;
    warn: boolean;
    warnReason: HealthCronWarnReason | null;
  }>;
  caches: HealthSection<{ scope: 'current_instance'; items: HealthCacheItem[] }>;
  sessions: HealthSection<{ totalSessions: number; usersWithSessions: number }>;
  security: HealthSection<{ activeIpLocks: number; activeIpBans: number }>;
}

export const systemApi = {
  /** Chỉ Root Admin. `fresh` = bỏ qua cache bảng 5 phút (BE vẫn giới hạn tối thiểu 30 giây giữa 2 lần truy vấn). */
  getHealth: async (fresh = false): Promise<SystemHealth> => {
    const response = await axiosInstance.get<SystemHealth>('/system/health', { params: fresh ? { fresh: 1 } : undefined });
    return response.data;
  },

  /** Chỉ Root Admin (BE chặn bằng RootAdminGuard). Cooldown 30 giây - quá sớm trả 429. */
  reset: async (): Promise<SystemResetResponse> => {
    const response = await axiosInstance.post<SystemResetResponse>('/system/reset');
    return response.data;
  },
};
