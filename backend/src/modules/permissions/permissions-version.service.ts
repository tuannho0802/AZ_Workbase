import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { waitUntil } from '@vercel/functions';
import { Setting } from '../../database/entities/setting.entity';

export const PERMISSIONS_VERSION_KEY = 'permissions_version';
/**
 * [Reset hệ thống] "Epoch" toàn hệ thống: Root Admin bấm "Reset hệ thống" -> +1. FE thấy `epoch` trong poll đổi thì
 * làm mới TOÀN BỘ cache React Query; BE coi cache quyền/ẩn-hiện UI/badge (theo từng instance) mang epoch cũ là hết hạn.
 */
export const SYSTEM_EPOCH_KEY = 'system_epoch';
// Cache đọc ngắn/instance: nhiều user cùng instance chỉ tốn 1 query/10s. Bump xoá cache ngay trên instance xử lý.
export const PERMISSIONS_VERSION_CACHE_TTL_MS = 10_000;

/**
 * [PLAN_CPU_OPTIMIZATION_ROUND2 - 9D] Danh mục ÍT ĐỔI mà FE cache lâu (staleTime 2 giờ) và chỉ tải lại khi `refSig` của
 * đúng domain đó đổi. Mỗi domain có 1 bộ đếm riêng trong bảng `settings` (key `refdata_version:<domain>`), không cần migration.
 * ⚠️ Khớp với `REF_DATA_QUERY_KEYS` ở FE (`useRefDataChangeSignal.ts`) - thêm domain thì sửa cả 2 phía.
 */
export const REF_DATA_DOMAINS = [
  'departments',
  'positions',
  'roles',
  'customer_statuses',
  'periodic_task_statuses',
  'leave_types',
  'media_sources',
  'users', // [AGENT] NEW: GET /users/all (dropdown nhân viên) - cache HTTP 30 phút, đổi khoá bằng refSig.users
  'link_categories', // [AGENT] NEW: GET /link-categories - cache HTTP 30 phút
  'link_groups', // [AGENT] NEW: GET /link-groups (kèm category + quản lý chính/phụ + nhân viên content) - cache HTTP 30 phút
] as const;
export type RefDataDomain = (typeof REF_DATA_DOMAINS)[number];
export const REF_DATA_VERSION_KEY_PREFIX = 'refdata_version:';
export const refDataVersionKey = (domain: RefDataDomain): string => `${REF_DATA_VERSION_KEY_PREFIX}${domain}`;

/** Bản chụp phiên bản: permissions_version + MỌI domain (chưa có dòng = 0 để FE luôn có mốc ổn định). */
interface VersionSnapshot {
  permissions: number;
  epoch: number;
  ref: Record<RefDataDomain, number>;
}

export interface PermissionSigUser {
  role: string;
  departmentId?: number | null;
  positionId?: number | null;
  isRootAdmin?: boolean;
}

/**
 * "Phiên bản quyền" toàn cục, lưu ở bảng `settings` có sẵn (key `permissions_version`) - KHÔNG cần
 * bảng/migration mới và dùng chung được giữa nhiều instance Vercel (khác biến trong RAM).
 *
 * `bump()` được gọi từ `PermissionsService.invalidate()` và `UiVisibilityService.invalidate()` -
 * đúng các chỗ mọi thao tác sửa ma trận quyền/override/ẩn-hiện UI/role đã gọi sẵn, nên không thể sót.
 * `/notifications/poll` trả kèm `permSig` = phiên bản + role/phòng ban/vị trí HIỆN TẠI của user
 * (lấy từ JwtStrategy), nên đổi role/phòng ban/vị trí của chính user cũng đổi chữ ký mà không cần bump.
 * FE thấy `permSig` đổi thì refetch quyền ngay (xem usePermissionChangeSignal).
 */
@Injectable()
export class PermissionsVersionService {
  private readonly logger = new Logger(PermissionsVersionService.name);
  // [AGENT] OLD CODE (giữ lại để rollback): private cached: { value: number; expiresAt: number } | null = null;
  // [AGENT] NEW CODE (9D): 1 bản chụp chung cho permissions_version + refdata_version:* -> `permSig` và `refSig` dùng CHUNG 1 query.
  private cached: { snapshot: VersionSnapshot; expiresAt: number } | null = null;

  // [PERF] Single-flight: `poll` gọi get/getRefSig/getEpoch + mỗi lần kiểm quyền đều gọi `getEpoch()` song song -> khi cache hết hạn
  // TRƯỚC ĐÂY mỗi lời gọi tự query `settings` (cache chỉ ghi SAU khi query xong) = nhiều query y hệt cùng lúc trên pool 3 kết nối.
  // Giờ các lời gọi đồng thời dùng chung 1 query đang chạy. `gen` tăng khi xoá cache để query cũ đang bay không ghi đè bản mới.
  private loading: Promise<VersionSnapshot | undefined> | null = null;
  private gen = 0;

  constructor(@InjectRepository(Setting) private readonly settingRepo: Repository<Setting>) {}

  private dropCache(): void {
    this.cached = null;
    this.loading = null;
    this.gen++;
  }

  /** Đọc 1 lần TẤT CẢ bộ đếm (1 query, `key IN (...)`), cache 10 s/instance. KHÔNG throw - lỗi trả `undefined` và không cache. */
  private async load(): Promise<VersionSnapshot | undefined> {
    const now = Date.now();
    if (this.cached && this.cached.expiresAt > now) return this.cached.snapshot;
    if (this.loading) return this.loading;
    const gen = this.gen;
    const task = this.fetchSnapshot(now, gen).finally(() => {
      if (this.loading === task) this.loading = null;
    });
    this.loading = task;
    return task;
  }

  private async fetchSnapshot(now: number, gen: number): Promise<VersionSnapshot | undefined> {
    try {
      const rows = await this.settingRepo.find({
        where: { key: In([PERMISSIONS_VERSION_KEY, SYSTEM_EPOCH_KEY, ...REF_DATA_DOMAINS.map(refDataVersionKey)]) },
      });
      const byKey = new Map(rows.map((r) => [r.key, Number(r.value) || 0]));
      const ref = {} as Record<RefDataDomain, number>;
      for (const d of REF_DATA_DOMAINS) ref[d] = byKey.get(refDataVersionKey(d)) ?? 0; // chưa có dòng = 0
      const snapshot: VersionSnapshot = {
        permissions: byKey.get(PERMISSIONS_VERSION_KEY) ?? 0,
        epoch: byKey.get(SYSTEM_EPOCH_KEY) ?? 0,
        ref,
      };
      if (gen === this.gen) this.cached = { snapshot, expiresAt: now + PERMISSIONS_VERSION_CACHE_TTL_MS };
      return snapshot;
    } catch (err) {
      this.logger.warn(`Không đọc được phiên bản (permissions/refdata): ${err instanceof Error ? err.message : String(err)}`);
      return undefined; // không cache lỗi
    }
  }

  /** Đọc phiên bản hiện tại. KHÔNG BAO GIỜ throw - lỗi trả `undefined` (poll vẫn chạy, FE bỏ qua tín hiệu). */
  async get(): Promise<number | undefined> {
    return (await this.load())?.permissions;
  }

  /** [Reset hệ thống] Epoch hiện tại (chưa có dòng = 0). KHÔNG BAO GIỜ throw - lỗi đọc trả `undefined` (poll vẫn chạy, FE/BE bỏ qua). */
  async getEpoch(): Promise<number | undefined> {
    return (await this.load())?.epoch;
  }

  /** Epoch + thời điểm đổi gần nhất, đọc THẲNG từ DB (không cache) - dùng cho cooldown của Reset hệ thống. */
  async getEpochState(): Promise<{ value: number; updatedAt: Date | null }> {
    const row = await this.settingRepo.findOne({ where: { key: SYSTEM_EPOCH_KEY } });
    return { value: row ? Number(row.value) || 0 : 0, updatedAt: row?.updatedAt ?? null };
  }

  /**
   * [Reset hệ thống] Tăng epoch và TRẢ giá trị mới (nguyên tử ở bước tăng, sau đó đọc lại). Khác `bump()`: CHỜ ghi xong và
   * THROW khi lỗi - để người bấm Reset biết chắc đã thành công. Xoá cache đọc của instance này.
   */
  async bumpEpoch(): Promise<number> {
    try {
      await this.settingRepo.query(
        'INSERT INTO settings (`key`, `value`, `description`) VALUES (?, ?, ?) ' +
          'ON DUPLICATE KEY UPDATE `value` = CAST(`value` AS UNSIGNED) + 1',
        [SYSTEM_EPOCH_KEY, '1', 'Tăng mỗi khi Root Admin bấm "Reset hệ thống" - FE làm mới toàn bộ cache, BE bỏ cache cũ'],
      );
      return (await this.getEpochState()).value;
    } finally {
      this.dropCache(); // lần đọc kế tiếp lấy giá trị mới từ DB
    }
  }

  /**
   * [9D] Phiên bản từng danh mục ít đổi: `{ departments: 7, positions: 2, ... }` (LUÔN đủ mọi domain).
   * KHÔNG throw - lỗi đọc trả `undefined` (poll vẫn chạy, FE giữ mốc cũ).
   */
  async getRefSig(): Promise<Record<RefDataDomain, number> | undefined> {
    const snapshot = await this.load();
    return snapshot ? { ...snapshot.ref } : undefined;
  }

  /** Tăng phiên bản (fire-and-forget qua waitUntil, không chặn request, không throw). */
  bump(): void {
    this.dropCache();
    this.runInBackground(this.bumpNow());
  }

  /** [9D] Tăng phiên bản của các danh mục vừa đổi (fire-and-forget). Gọi bởi `RefDataChangeSubscriber` SAU KHI dữ liệu đã ghi/commit. */
  bumpRef(domains: readonly RefDataDomain[]): void {
    if (domains.length === 0) return;
    this.dropCache();
    this.runInBackground(this.bumpRefNow(domains));
  }

  private runInBackground(task: Promise<void>): void {
    try {
      waitUntil(task);
    } catch {
      // Ngoài Vercel: promise vẫn chạy.
    }
  }

  async bumpNow(): Promise<void> {
    try {
      await this.settingRepo.query(
        'INSERT INTO settings (`key`, `value`, `description`) VALUES (?, ?, ?) ' +
          'ON DUPLICATE KEY UPDATE `value` = CAST(`value` AS UNSIGNED) + 1',
        [PERMISSIONS_VERSION_KEY, '1', 'Tăng mỗi khi quyền/ẩn-hiện UI thay đổi - FE dùng để làm mới quyền ngay'],
      );
    } catch (err) {
      this.logger.error(`Không bump được permissions_version: ${err instanceof Error ? err.stack : String(err)}`);
    } finally {
      this.dropCache(); // lần đọc kế tiếp lấy giá trị mới từ DB
    }
  }

  /** [9D] 1 câu upsert nhiều dòng (nguyên tử từng dòng, `value = value + 1`). Lỗi chỉ log, không throw. */
  async bumpRefNow(domains: readonly RefDataDomain[]): Promise<void> {
    const unique = [...new Set(domains)];
    if (unique.length === 0) return;
    try {
      const placeholders = unique.map(() => '(?, ?, ?)').join(', ');
      const params = unique.flatMap((d) => [refDataVersionKey(d), '1', `Tăng mỗi khi danh mục "${d}" thay đổi - FE tải lại đúng danh mục đó`]);
      await this.settingRepo.query(
        `INSERT INTO settings (\`key\`, \`value\`, \`description\`) VALUES ${placeholders} ` +
          'ON DUPLICATE KEY UPDATE `value` = CAST(`value` AS UNSIGNED) + 1',
        params,
      );
    } catch (err) {
      this.logger.error(`Không bump được refdata_version (${unique.join(',')}): ${err instanceof Error ? err.stack : String(err)}`);
    } finally {
      this.dropCache();
    }
  }

  /** Chữ ký quyền của 1 user: đổi khi phiên bản toàn cục đổi HOẶC role/phòng ban/vị trí/root-admin của user đổi. */
  async buildSig(user: PermissionSigUser): Promise<string | undefined> {
    const version = await this.get();
    if (version === undefined) return undefined;
    return [version, user.role, user.departmentId ?? 0, user.positionId ?? 0, user.isRootAdmin ? 1 : 0].join(':');
  }
}
