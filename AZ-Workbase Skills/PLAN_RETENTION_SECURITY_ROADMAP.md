# PLAN — Retention tự động, Bảo mật phiên đăng nhập & Củng cố hệ thống AZ_Workbase

> Đặt tại `AZ-Workbase Skills/PLAN_RETENTION_SECURITY_ROADMAP.md`. Làm **từng phase một**; xong phase nào tick phase đó và thêm 1 dòng vào `WORKFLOW_LOG.md`.
> **Bản 3 (2026-10-14)** — thêm **mục 3.6** (cờ quốc gia cạnh mọi IP + log lượt truy cập theo từng IP, kể cả whitelist/bị khoá). Cơ sở: `main` @ `32696dd`. Chỉ cập nhật plan, **chưa viết code**.
> **Bản 2 (2026-10-13)** — đã áp dụng 7 quyết định của bạn (mục 1). Cơ sở: đã clone `main` và đọc code thật. Migration lớn nhất hiện có: `1786200000000-AddLoginLockoutToUsers`. Mọi migration mới phải `ls` thư mục `migrations` lúc làm để lấy số lớn hơn (số trong plan chỉ là chỗ giữ).

## 1. Quyết định đã chốt

| # | Chủ đề | Quyết định | Ảnh hưởng |
|---|---|---|---|
| 1 | Cron retention | **Thêm vào `vercel.json`**. Chạy thưa (mỗi **14 ngày** hoặc **1 tháng**), chu kỳ chọn trong FE, lưu DB và hiển thị trong FE | P1 viết lại: cron kích hoạt hằng ngày, endpoint tự kiểm "đến hạn chưa" (xem 3.1 — vì `vercel.json` là file tĩnh nên **không thể đổi lịch từ FE**, chỉ đổi được chu kỳ) |
| 2 | Khoá IP | **10 lần sai/IP thì khoá**. Cấu hình lưu **bảng mới**, **dùng chung với khoá tài khoản** (hiện cố định 5 lần/5 phút) | P3: bảng `security_config`; bỏ hằng số `LOGIN_MAX_FAILED_ATTEMPTS`/`LOGIN_LOCK_MINUTES` |
| 3 | `audit_logs.user_id` | **Cho phép NULL**, ghi cả đăng nhập sai với email chưa tồn tại | P4: migration + sửa entity |
| 4 | Phiên đăng nhập | **Mở rộng JSON** (không tạo bảng `user_sessions`) | P5: JSON v3, **không cần migration** |
| 5 | Hạn hoàn tác | **5 phút** | P7 |
| 6 | Hạn giữ sự kiện bảo mật | **Cấu hình được, lưu trong `security_config`** (mặc định 180 ngày) | P3 (bảng) + P4 (job dọn) |
| 7 | C1 | **Làm kèm Phase 6**: đổi mật khẩu thường cũng ≥ 8 ký tự + regex | C1 rút khỏi "Để sau" |

### Giả định tôi tự đặt (bạn chưa nêu — sửa được trong DB hoặc nói lại là đổi)
- Cửa sổ đếm sai theo IP: **10 phút**. Thời gian khoá IP: **5 phút** (bằng khoá tài khoản hiện tại).
- Mặc định giữ sự kiện bảo mật: **180 ngày**.
- **Bỏ** ngưỡng "số email khác nhau/IP" đã nêu ở bản 1: mỗi lần sai đều tính vào IP bất kể email, nên 1 IP thử 1 mật khẩu trên hàng trăm email vẫn chạm 10 lần và bị khoá — không cần đếm email riêng.
- **Bỏ** khoá IP tăng dần (đã nêu ở bản 1) để đơn giản; thêm sau nếu cần.

## 2. Phân loại yêu cầu

| Nhóm | Nội dung | Trạng thái |
|---|---|---|
| **A. Làm ngay** | A1 Retention tự động · A2 Xoá theo nhiều khoảng · A3 Chặn brute-force theo IP + Admin reset · A4 Bắt buộc `JWT_REFRESH_SECRET` | Plan chi tiết |
| **B. Tính năng mới** | B1 Thiết bị đăng nhập + đăng xuất cưỡng bức · B2 Buộc đổi mật khẩu + hạn mật khẩu (kèm C1) · B3 Trang "Hoạt động bảo mật" (kèm C2) · B4 Thao tác hàng loạt có Hoàn tác · B5 Sức khoẻ hệ thống · B6 Xuất/nhập cấu hình · B7 `loading.tsx` + aria/phím tắt | Plan chi tiết |
| **C. Ghi nhận, làm sau** | C3 Tách service lớn · C4 Giảm `any` · C5 Spec controller · C6 README gốc · C7 (mới) thông báo đăng nhập lộ việc email có tồn tại hay không | Chỉ ghi nhận |
| **D. Không làm** | D1 `?secret=` trong URL cron cũ · D2 `npm audit` 4 moderate (`uuid` trong `exceljs`; FE 0 lỗ hổng) | Không làm |

## 3. Kết quả xác minh trên code thật

| # | Phát hiện | Bằng chứng |
|---|---|---|
| 1 | `handleCleanupCron()` còn nguyên nhưng `@Cron` bị comment, không nơi nào gọi. Đầu file ghi rõ **không dùng `@nestjs/schedule` vì chạy Vercel serverless**. | `audit.service.ts` L8-12, L359-371 |
| 2 | Công tắc lưu vào `settings` (`audit_cleanup_enabled`, `audit_retention_days`) nhưng **không có thứ gì đọc để chạy**. | `audit.service.ts` L305-330 |
| 3 | Đã có xoá **1 khoảng** ngày cho audit (`cleanupByDateRange`) và task audit (`periodic-task-audit.service.ts` L298). | grep |
| 4 | `notifications` chỉ có `purge(id)` thủ công; `attendance_logs` chỉ có `DELETE attendance-logs/cleanup?olderThan=` thủ công. | `notifications.service.ts` L508; `zk-device.controller.ts` L119 |
| 5 | Pattern cron có sẵn: endpoint bảo vệ bằng `CRON_SECRET`. `vercel.json` đã có **2** cron: `zk-device-cron/sync-today` (`0 10 * * 1-5`) và `periodic-tasks-cron/auto-overdue` (`0 2 * * 1-5`). | `periodic-task-reminders-cron.controller.ts`, `vercel.json` |
| 6 | Ngưỡng khoá tài khoản **hằng số cứng**: `LOGIN_MAX_FAILED_ATTEMPTS = 5`, `LOGIN_LOCK_MINUTES = 5` (dùng ở L97, L149-161 và trong text Swagger của controller). | `auth.service.ts` L23-24 |
| 7 | `/auth/login` không có throttle; `AuthService.login(dto)` **không nhận IP**; controller không truyền `req`. Chỉ route trung gian `register` ở FE gắn header `x-az-client-ip`. | `auth.controller.ts` L48-59; grep FE |
| 8 | `auth.service.ts` L44 ký refresh token với fallback `'default-refresh-secret'`, nhưng L301 verify **không có fallback** → thiếu biến thì vừa không an toàn vừa lỗi. | `auth.service.ts` |
| 9 | `audit_logs.user_id` **NOT NULL** + quan hệ `User`; đã có sẵn cột `ip_address` (45) và `user_agent`, `newData` kiểu JSON → đủ chỗ ghi IP/email mà không thêm cột. | `audit-log.entity.ts` |
| 10 | Phiên lưu trong `users.hashed_refresh_token` (TEXT, `select: false`), JSON `{v:2, s:[{h,t}], l}`, tối đa `MAX_REFRESH_SESSIONS = 10`; slot chưa có IP/UA/id. Dữ liệu cũ có thể là chuỗi bcrypt (`$2...`, **không phải JSON**). | `refresh-session-store.util.ts` |
| 11 | `JwtStrategy.validate()` chạy mỗi request, **cache user 10 giây/instance** (`auth-user-cache.util.ts`) và không đọc `hashedRefreshToken` → hiện chưa có cách chặn access token của phiên đã bị thu hồi. | `jwt.strategy.ts` L27-37 |
| 12 | `customers.service.ts` 4297 dòng, `users.service.ts` 1729 dòng (đã đo). `leave-requests` 1396 dòng, ~372 `any` BE / ~288 `any` FE, 20 file có `aria-*`, thiếu `loading.tsx`: **lấy theo báo cáo, chưa đo lại**. | wc |

## 4. Bảng migration (tổng hợp)

| Phase | Migration (số giữ chỗ) | Nội dung |
|---|---|---|
| P1 | `1786300000000-CreateCronRuns` | bảng `cron_runs` |
| P3 | `1786310000000-CreateSecurityConfig` | bảng `security_config` (1 dòng, seed mặc định) |
| P3 | `1786320000000-AddLoginIpSecurity` | bảng `login_ip_blocks` + cột `users.last_login_ip` |
| P3.5 | `1786331000000-CreateLoginIpWhitelist` | bảng `login_ip_whitelist` (IP miễn khoá theo IP) |
| P3.6 | `1786332000000-CreateIpGeoCache` | bảng `ip_geo_cache` (IP → mã quốc gia) |
| P3.6 | `1786333000000-CreateIpAccessLogs` | bảng `ip_access_logs` (chi tiết từng lượt) + `ip_access_stats` (tổng hợp mỗi IP) |
| P3.6 | `1786334000000-AddIpAccessConfigToSecurityConfig` | thêm cột `ip_access_log_retention_days` (90), `ip_access_detail_cap_per_hour` (20) vào `security_config` (cột `ip_access_log_api_enabled` chưa có — đi kèm log request API, xem 3.6.2) |
| P3.6 | `1786337000000-AddApiHitLoggingToIpAccess` | log request API (3.6.2): `security_config.ip_access_log_api_enabled` (1); `ip_access_logs` + `hit_count`, `bucket_minute`, `endpoint_group`, `last_status`, `endpoint` → 80, ENUM `outcome` + `api`, khoá duy nhất `uk_ip_access_logs_bucket`; `ip_access_stats` + `api_hits`, `api_window_started_at`, `api_window_count` |
| P3.7 | `1786336000000-CreateLoginIpBlacklist` | bảng `login_ip_blacklist` (IP bị Admin chặn chủ động, có hạn hoặc vĩnh viễn) |
| P4 | `1786330000000-AllowNullAuditUserId` | `audit_logs.user_id` → `NULL` được |
| P5 | *(không có)* | mở rộng JSON, không đổi schema |
| P6 | `1786340000000-AddPasswordPolicyToUsers` | `must_change_password`, `password_changed_at`, `password_expires_at` |
| P7 | `1786350000000-CreateBulkOperations` | bảng `bulk_operations` |

Quy ước chung: `up()`/`down()` đối xứng, idempotent bằng `hasTable`/`hasColumn` (MySQL không có `ADD COLUMN IF NOT EXISTS`), cột `string | null` khai `type: 'varchar'`, thời gian nghiệp vụ dùng `DATETIME`, **không tự chạy lên DB production**.

---

## PHASE 1 — Retention tự động (A1)

**Mục tiêu:** `audit_logs`, log task, `notifications`, `attendance_logs` không phình vô hạn; Admin bật/tắt, đặt số ngày giữ **và chu kỳ chạy** ngay trên FE; công tắc **thực sự có tác dụng**.

### 1.1 Kiến trúc: cron kích hoạt hằng ngày + endpoint tự kiểm "đến hạn"

`vercel.json` là file tĩnh nên lịch trong đó **không đổi được từ FE**. Vì vậy:

- Thêm 1 cron vào `vercel.json`, **kích hoạt hằng ngày** (chi phí gần như 0):
  ```json
  { "path": "/api/system-cron/retention", "schedule": "0 20 * * *" }
  ```
  (20:00 UTC = 03:00 giờ VN.)
- Endpoint `GET /api/system-cron/retention` (bảo vệ bằng `CRON_SECRET`, Vercel tự gửi `Authorization: Bearer`; so sánh `timingSafeEqual`, **không** thêm `?secret=`):
  1. Đọc **chu kỳ** từ `settings`; tìm lần chạy **thành công** gần nhất trong `cron_runs`.
  2. Chưa đủ chu kỳ → trả `{ skipped: true, reason: 'NOT_DUE', nextDueAt }`, **không làm gì**.
  3. Đến hạn → chạy từng đối tượng đang bật, ghi `cron_runs` + 1 dòng audit `SYSTEM_RETENTION_RUN`.
- Chu kỳ tuỳ chọn trong FE: **14 ngày / 30 ngày / tuỳ chỉnh N ngày** (7–90). Lưu ở `settings`: `retention_cron_interval_days` (mặc định 30). FE hiện **"Lần chạy gần nhất"** và **"Lần chạy tiếp theo (dự kiến)"** = lần thành công gần nhất + chu kỳ.
- Đổi chu kỳ trong FE → áp dụng ngay từ lần kích hoạt kế tiếp (đã quá hạn thì chạy ở lần kích hoạt kế tiếp).
- **Chạy dở thì làm tiếp:** xoá theo lô (`DELETE … LIMIT 5000`, ngân sách ~8 giây). Nếu chưa xoá hết thì ghi `status='partial'` và lần kích hoạt **ngày hôm sau** làm tiếp ngay, không chờ hết chu kỳ.
- Cutoff luôn tính bằng đồng hồ DB (`NOW() - INTERVAL ? DAY`); idempotent.
- **Giờ chạy trong ngày** do `vercel.json` quyết định (cố định 03:00 VN). Nếu muốn FE chọn giờ thì cron phải kích hoạt theo giờ — chỉ làm được trên gói Vercel cho phép; **không đưa vào phạm vi này**.

> ⚠️ **Phải kiểm tra trước khi sửa `vercel.json`:** hiện đã có 2 cron. Gói Hobby giới hạn **2 cron** và mỗi cron tối đa **1 lần/ngày**; thêm cái thứ 3 sẽ làm **deploy lỗi**. Cách xử lý: nếu gói đang dùng không cho cron thứ 3 → **không thêm vào `vercel.json`** mà gọi `RetentionService.runIfDue()` từ bên trong endpoint `periodic-tasks-cron/auto-overdue` (đã chạy thứ 2–6 lúc 02:00); chu kỳ 14/30 ngày nên chạy ngày thường là đủ. Cách xử lý này không cần đổi `vercel.json`.

### 1.2 Cấu hình theo đối tượng (bảng `settings`, không cần migration cho phần này)

| Đối tượng | Khoá enabled / days | Mặc định | Quy tắc riêng |
|---|---|---|---|
| `audit_logs` | `audit_cleanup_enabled` / `audit_retention_days` (đã có) | 90 ngày | **Loại trừ** các action bảo mật (chúng có hạn riêng ở P4) |
| `periodic_task_audit_logs` | `task_audit_cleanup_enabled` / `task_audit_retention_days` | 90 ngày | Giống audit |
| `notifications` | `notification_cleanup_enabled` / `notification_retention_days` | 60 ngày | Chỉ xoá thông báo **đã đọc**; chưa đọc giữ thêm (vd 180 ngày) |
| `attendance_logs` | `attendance_cleanup_enabled` / `attendance_retention_days` | **Tắt** | Dữ liệu chấm công/lương: tối thiểu 365 ngày, cảnh báo rõ trên UI |
| *(P4)* sự kiện bảo mật | đọc từ `security_config.security_event_retention_days` | 180 ngày | Xem Phase 4 |
| *(P7)* `bulk_operations` hết hạn | không có công tắc, luôn dọn | — | Dọn bản ghi đã quá `expires_at` |

DTO: `retentionDays` `@IsInt() @Min(7)` (attendance `@Min(365)`). Quyền: audit/task audit dùng `audit.manage` (đã có); notifications/attendance dùng permission sẵn có của module đó — **không tạo key mới** trừ khi đã seed.

### 1.3 Việc phải làm

**Backend**
- [ ] `RetentionService` (`runIfDue()`, `runAll()`, `runTarget()`, `getSettings()`, `updateSettings()`); chuyển thân `handleCleanupCron()` vào đây, giữ comment `// [AGENT] OLD CODE`.
- [ ] Controller `system-cron/retention` (sao cách bảo vệ của `periodic-task-reminders-cron.controller.ts`).
- [ ] Endpoint admin: `GET/PUT /system/retention-settings` (gồm chu kỳ), `POST /system/retention/run-now?target=&dryRun=true` (xem trước số dòng sẽ xoá).
- [ ] Sửa comment sai lệch ở đầu `audit.service.ts`.
- [ ] Spec: chưa đến hạn → `NOT_DUE`, không xoá; đến hạn → xoá đúng cutoff; `enabled=false` bỏ qua; `partial` được làm tiếp hôm sau; dryRun không ghi; sai/thiếu `CRON_SECRET` bị từ chối.

**Frontend**
- [ ] Component dùng chung `RetentionSettingsPanel`: Switch + số ngày cho từng đối tượng, **chọn chu kỳ (14 ngày / 30 ngày / tuỳ chỉnh)**, hiện "Lần chạy gần nhất (xoá N dòng)" và "Lần chạy tiếp theo", nút "Chạy thử".
- [ ] Gắn vào trang audit (`audit-logs/page.tsx`) và trang log task (`lich-su-cong-viec/page.tsx`); gate bằng `can('audit.manage')`.

**Migration** `1786300000000-CreateCronRuns`: `cron_runs(id, job, target, started_at DATETIME, finished_at DATETIME, status, affected INT, message TEXT)`.

### 1.4 Tiêu chí xong
- [ ] Bật Switch + 90 ngày + chu kỳ 14 ngày → gọi endpoint lần đầu: xoá log cũ; gọi lại ngay: `NOT_DUE`.
- [ ] Tắt Switch → đến hạn vẫn không xoá đối tượng đó.
- [ ] FE hiện đúng "Lần chạy tiếp theo" sau khi đổi chu kỳ.
- [ ] `tsc --noEmit`, `nest build`, `jest`, `vitest run`, `next build` pass (dán kết quả thật).

---

## PHASE 2 — Xoá theo nhiều khoảng chọn (A2)

- DTO `ranges: { from, to }[]` — `@ArrayMinSize(1) @ArrayMaxSize(20)`, `from <= to`, mỗi khoảng ≤ 366 ngày, **gộp khoảng chồng lấn** trước khi chạy.
- Endpoint mới (giữ endpoint 1 khoảng cũ): `POST /audit/cleanup-ranges`, `POST /periodic-tasks/audit-logs/cleanup-ranges`; `dryRun=true` trả `{ perRange: [{from,to,count}], total }`.
- 1 transaction, **1 dòng audit** ghi mọi khoảng + số dòng mỗi khoảng. Ghi audit **sau** khi xoá; **chặn khoảng có `to` ≥ hôm nay** (tự cắt về hôm qua) để không xoá mất vết của chính lần xoá.
- Xoá theo lô trong từng khoảng như 1.3.
- **Sự kiện bảo mật (P4):** bản xem trước hiển thị riêng số sự kiện bảo mật trong khoảng; chỉ xoá chúng khi Admin tick "Bao gồm sự kiện bảo mật".
- FE: nhiều `RangePicker` (thêm/bớt) → "Xem trước" (bảng số dòng từng khoảng) → "Xác nhận xoá" (gõ "XOA").
- [ ] Spec: khoảng chồng lấn được gộp; khoảng ngược → 400; dryRun không xoá; đúng 1 audit; mặc định không xoá sự kiện bảo mật.

---

## PHASE 3 — Khoá đăng nhập theo IP + cấu hình dùng chung + bắt buộc secret (A3, A4)

### 3.1 Bảng cấu hình `security_config` (dùng chung cho khoá tài khoản và khoá IP)

Migration `1786310000000-CreateSecurityConfig` — **1 dòng duy nhất** (`id = 1`), seed mặc định:

| Cột | Mặc định | Ý nghĩa |
|---|---|---|
| `account_max_failed_attempts` | 5 | Sai liên tiếp bao nhiêu lần thì khoá **tài khoản** (thay `LOGIN_MAX_FAILED_ATTEMPTS`) |
| `account_lock_minutes` | 5 | Khoá tài khoản bao lâu (thay `LOGIN_LOCK_MINUTES`) |
| `ip_max_failed_attempts` | **10** | Sai bao nhiêu lần trên **1 IP** trong cửa sổ thì khoá IP |
| `ip_window_minutes` | 10 *(giả định)* | Cửa sổ đếm |
| `ip_lock_minutes` | 5 *(giả định)* | Khoá IP bao lâu |
| `security_event_retention_days` | 180 *(giả định)* | Hạn giữ sự kiện bảo mật (dùng ở P4) |
| `updated_by`, `updated_at` | — | Ai sửa/ khi nào |

- Entity `SecurityConfig` + `SecurityConfigService.get()` có **cache bộ nhớ ~30 giây** (đọc mỗi lần đăng nhập, không để thêm 1 query/lần).
- **Kẹp giá trị hợp lệ:** attempts 3–100, minutes 1–1440, retention 30–3650. Giá trị ngoài khoảng (vd ai đó đặt `0` trong DB) → dùng mặc định + `logger.warn`, **không bao giờ** để cấu hình tắt mất bảo vệ.
- Sửa được **trực tiếp trong DB** (như bạn nêu) **và** bằng form nhỏ cho Admin ở trang "Hoạt động bảo mật" (P4); lưu ghi audit `UPDATE_SECURITY_CONFIG` (giá trị cũ/mới).
- [ ] Thay các hằng số ở `auth.service.ts` (L23-24, L97, L149-161), text Swagger ở controller ("5 lần/5 phút"), và mọi chỗ FE/spec đang hardcode "5 phút"/"5 lần" bằng giá trị lấy từ config (thông báo "Bạn còn N lần thử…" dùng giá trị thật).

### 3.2 Khoá theo IP

Migration `1786320000000-AddLoginIpSecurity`: bảng `login_ip_blocks(id, ip VARCHAR(45) UNIQUE, failed_count INT, window_started_at DATETIME, blocked_until DATETIME NULL, last_email VARCHAR(255) NULL, created_at, updated_at)` + cột `users.last_login_ip VARCHAR(45) NULL`.

- [ ] **Truyền IP vào login:** `login(@Body() dto, @Req() req)` → `authService.login(dto, ip)`. Dùng 1 helper `getClientIp(req)` chung với `ThrottlerBehindProxyGuard` (`x-az-client-ip`, fallback `req.ip`).
- [ ] ⚠️ **Xác minh trước khi làm:** FE gọi login **trực tiếp BE từ trình duyệt** hay qua route trung gian? Nếu trực tiếp thì `req.ip` đã đúng (Vercel gắn `X-Forwarded-For` theo IP thật). Nếu qua route FE thì route đó phải forward `x-az-client-ip` như `register/route.ts`; không làm bước này thì **mọi người dùng bị tính chung 1 IP** (xem comment trong `throttler-behind-proxy.guard.ts`).
- [ ] **Kiểm tra khoá IP TRƯỚC khi so mật khẩu** (rẻ hơn bcrypt). IP đang khoá → `429` có `code: 'IP_LOCKED'` + `retryAfterSeconds` (FE đã có banner đếm ngược ở trang login, tái dùng).
- [ ] Mỗi lần **sai** (email không tồn tại hoặc sai mật khẩu) tăng bộ đếm IP bằng **1 câu `INSERT … ON DUPLICATE KEY UPDATE` nguyên tử** (đặt lại đếm khi quá `ip_window_minutes`; đặt `blocked_until = NOW() + INTERVAL ip_lock_minutes MINUTE` khi chạm ngưỡng) — tránh race giữa các instance serverless. So sánh thời gian bằng đồng hồ DB.
- [ ] **Không** dùng `@Throttle` trong bộ nhớ cho login (mỗi instance serverless đếm riêng, không đáng tin); bảng DB là nguồn sự thật.
- [ ] Đăng nhập thành công **không** xoá khoá/đếm IP đang chạy (tránh kẻ tấn công dùng 1 tài khoản hợp lệ của mình để đặt lại bộ đếm). Ghi `last_login_ip`.
- Lưu ý: văn phòng dùng chung 1 IP có thể chạm 10 lần sai/10 phút khi nhiều người gõ nhầm; Admin mở khoá 1 chạm (3.3), và nâng ngưỡng bằng DB nếu cần.

### 3.3 Admin xem/Reset

- [ ] `GET /security/ip-blocks` (đang khoá + gần đây), `DELETE /security/ip-blocks/:ip` (mở khoá), audit `UNBLOCK_LOGIN_IP`.
- [ ] Mở rộng "Mở khoá" tài khoản (`PATCH /users/:id/unlock-login`) để hiện thêm `last_login_ip`.
- [ ] Quyền: tái dùng `users.manage`; **không** tạo key mới trừ khi tách (nếu tách → seed migration, giữ bypass `role === 'admin'` ở cả 3 lớp).
- [ ] FE: khối "IP bị khoá" (đếm ngược dùng lại `useCountdown`).
- [ ] Spec: ngưỡng 10 chạm đúng; cửa sổ hết thì đếm lại; thành công không reset; đổi config trong DB có hiệu lực sau ≤ 30 giây; giá trị config sai bị kẹp.

### 3.4 Bắt buộc `JWT_REFRESH_SECRET` (A4)

- [ ] Bỏ fallback `'default-refresh-secret'` (`auth.service.ts` L44); thêm kiểm tra **lúc khởi động**: thiếu `JWT_SECRET`/`JWT_REFRESH_SECRET`, giá trị < 32 ký tự, hoặc 2 secret trùng nhau → `throw`, app không lên. L44 và L301 cùng đọc qua **1 getter**.
- [ ] ⚠️ Xác nhận biến có trên **cả Preview lẫn Production** của Vercel trước khi deploy. Đây là mục dễ gây downtime nhất → **deploy riêng, đầu tiên của Phase 3**.
- [ ] Spec: thiếu biến → ném lỗi; đủ biến → ký/verify khớp.

### 3.5 Whitelist IP (bổ sung theo yêu cầu 2026-10-14)

Mục tiêu: khi có trục trặc (vd văn phòng dùng chung 1 IP gõ nhầm hàng loạt), IP tin cậy **không bị khoá theo IP**; **chỉ khoá email/tài khoản như thường lệ**.

- **Dữ liệu:** migration `1786331000000-CreateLoginIpWhitelist` → bảng `login_ip_whitelist(id, ip VARCHAR(45) UNIQUE, note VARCHAR(255) NULL, created_by INT NULL, created_at DATETIME)`. Chỉ khớp **đúng 1 địa chỉ** (đã chuẩn hoá bằng `normalizeIp`), **không CIDR**; tối đa 200 dòng.
- **Hành vi đăng nhập (`AuthService.login`):** IP trong whitelist → bỏ qua **cả** kiểm tra `IP_LOCKED` **lẫn** bộ đếm sai theo IP (không ghi `login_ip_blocks`, không sinh `LOGIN_IP_BLOCKED`). Khoá theo tài khoản (`LOGIN_LOCKED`, `ACCOUNT_LOCKED`) **không đổi**. `LOGIN_FAILED`, `LOGIN_UNKNOWN_EMAIL` và `last_login_ip` vẫn ghi bằng IP thật.
- **Cache** ~30 giây/instance (`LoginIpWhitelistService`); thêm/xoá xoá cache instance hiện tại, instance khác cập nhật sau ≤ 30 giây. Lỗi DB (vd chưa migrate) → coi như **không** có IP nào được miễn (không vô tình bỏ chặn) + `logger.error`, thử lại sau 5 giây.
- **API** (`users.manage` scope `all` hoặc `role === admin`, như `ip-blocks`; **không tạo permission key mới**): `GET /security/ip-whitelist` (kèm `myIp`), `POST /security/ip-whitelist {ip, note?}`, `DELETE /security/ip-whitelist/:ip`. Thêm IP **đồng thời gỡ** dòng khoá/đếm hiện có của IP đó.
- **Audit:** `IP_WHITELIST_ADDED`, `IP_WHITELIST_REMOVED` (thêm vào `SECURITY_AUDIT_ACTIONS` → được bảo vệ khỏi job dọn audit thường, hiện ở `/security-activity`).
- **FE:** khối "IP được miễn khoá" dưới tab "IP bị khoá" ở `/users` (thêm IP + ghi chú, nút "Dùng IP hiện tại của tôi", gỡ có xác nhận) và nút "Miễn khoá" trên từng dòng IP bị khoá.
- **Rủi ro:** whitelist làm yếu chặn brute-force theo IP cho địa chỉ đó — kẻ tấn công từ IP whitelist vẫn bị chặn ở mức tài khoản nhưng có thể dò **nhiều email** không giới hạn. Chỉ thêm IP tin cậy. Hỗ trợ CIDR/dải IP → làm sau.
- [x] Migration + entity + `LoginIpWhitelistService` + nối vào `AuthService` — *đã làm 2026-10-14; còn: chạy migration `1786331000000`*
- [x] API + audit + FE (khối whitelist, nút "Miễn khoá") — *đã làm 2026-10-14*
- [x] Spec: whitelist không đếm/khoá IP nhưng vẫn khoá tài khoản; cache + lỗi DB fail-closed; add/remove/trùng/trần; quyền (scope department bị 403)

### 3.6 Cờ quốc gia cạnh mọi IP + log lượt truy cập theo từng IP (bổ sung theo yêu cầu 2026-10-14)

Yêu cầu: (a) mọi chỗ hiển thị IP — đặc biệt khi Block IP / Whitelist IP — kèm **cờ của nước** IP đó; (b) **log lượt truy cập của từng IP**, dù IP đang whitelist hay bị khoá.

**Hiện trạng đã xác minh trên code (`main` @ `32696dd`):**
- Repo **chưa có** geo-IP hay thư viện cờ nào (grep `geoip|country|flag|x-vercel-ip-country` ở BE/FE/`package.json`: không có; chỉ `import-marketing-data.ts` có field `Country` không liên quan).
- FE đang render IP ở: `LoginIpBlocksTab.tsx` (cột IP + 2 modal xác nhận), `LoginIpWhitelistSection.tsx` (cột IP, `myIp`, modal gỡ), `security-activity/page.tsx` (cột IP L111 + ô lọc IP), `components/users/LoginLockTag.tsx` (tooltip `lastLoginIp`), `users/page.tsx` (thông báo mở khoá L478), `components/sessions/SessionList.tsx` (L54 `IP:`). `audit.types.ts` và `periodic-task-audit.types.ts` có `ipAddress` nhưng **chưa có UI render** → làm khi có UI. **Loại trừ** `attendance-device/page.tsx` (IP máy chấm công trong LAN, không phải IP người truy cập).
- BE **không có lịch sử từng lượt**: `login_ip_blocks` chỉ là bộ đếm; `users.last_login_ip` chỉ giữ 1 giá trị; và 4.1 **cố ý không ghi** các request bị từ chối vì IP đang khoá (chống phình `audit_logs`). Khoá IP hiện chỉ chặn `POST /auth/login` (không chặn API khác).
- IP lấy bằng `getDirectClientIp(req)` (`common/security/client-ip.ts`).

#### 3.6.1 Cờ quốc gia

- **Nguồn chính (không dependency, không gọi ngoài):** header `x-vercel-ip-country` (mã ISO-3166 alpha-2) do Vercel gắn. Thêm helper `getClientCountry(req)` cạnh `getDirectClientIp`, chuẩn hoá về 2 chữ HOA, giá trị lạ → `null`. Không có header (chạy local) → `null`. ⚠️ **Xác minh trên Preview trước khi làm tiếp** (log thử 1 request) rằng header tới được BE và client không tự đặt đè được — cùng lý do `/auth/login` dùng `getDirectClientIp` thay vì `x-az-client-ip`.
- **Bảng `ip_geo_cache`** (migration `1786332000000`): `ip VARCHAR(45) PK`, `country_code CHAR(2) NULL`, `source ENUM('vercel','manual','private','unknown')` (bỏ `lookup` vì đã chốt không tra cứu ngoài), `resolved_at DATETIME`, `updated_by INT NULL` (Admin sửa tay).
- **`IpGeoService`** (module `security`): `record(ip, countryCode)` (upsert khi login/refresh có header, ghi đè cache cũ **trừ dòng `source = 'manual'`: Admin đã sửa tay thì header Vercel không bao giờ ghi đè**), `resolveMany(ips[])` → `Map<ip, {countryCode, kind}>` bằng **1 query `IN (…)` mỗi trang** (không N+1), `isPrivateIp()` (`10/8`, `172.16/12`, `192.168/16`, `127/8`, `::1`, `fc00::/7`, `fe80::/10`) → `source = 'private'`, FE hiện biểu tượng "Mạng nội bộ" thay cờ.
- **IP chưa có quốc gia** (IP Admin gõ tay vào whitelist, `last_login_ip` cũ, sự kiện bảo mật cũ): hiện **`N/A`** (không dùng `—`), kèm tooltip "Chưa xác định quốc gia". ✅ **Đã chốt 2026-10-14: KHÔNG tra cứu ngoài** — không gửi IP sang bên thứ ba, không triển khai `IP_GEO_LOOKUP_URL` trong P3.6 (nếu sau này cần thì là quyết định riêng).
- **Sửa quốc gia thủ công (đã chốt 2026-10-14):** Admin tự điền/sửa quốc gia cho IP đang `N/A` (hoặc sửa IP sai).
  - API (`users.manage` scope `all`/admin, như `ip-blocks`; **không tạo permission key mới**): `PUT /security/ip-geo/:ip { countryCode }` (ISO-3166 alpha-2, chuẩn hoá HOA, phải thuộc danh sách mã hợp lệ — sai → 400) ghi `source = 'manual'`, `updated_by`; `DELETE /security/ip-geo/:ip` xoá bản sửa tay (quay về dữ liệu Vercel/`N/A`). IP phải qua `normalizeIp`; IP nội bộ (`private`) **không** cho gán quốc gia (trả 400).
  - Audit: `IP_COUNTRY_SET`, `IP_COUNTRY_CLEARED` (ghi giá trị cũ/mới), **thêm vào `SECURITY_AUDIT_ACTIONS`** để được bảo vệ khỏi job dọn audit thường và hiện ở `/security-activity`.
  - FE: nút bút chì cạnh `IpWithFlag` (và trong Drawer lịch sử) mở modal chọn nước (Select có tìm kiếm, danh sách mã ISO + tên bằng `Intl.DisplayNames('vi')`, cờ `flag-icons` ở từng lựa chọn) + nút "Xoá chỉnh sửa tay". **Chỉ hiện khi `can('users.manage')`**; dòng `source = 'manual'` có chấm nhỏ/tooltip "Đã chỉnh tay bởi …".
  - Lưu ý: nước sửa tay chỉ đổi **hiển thị cờ**, không ảnh hưởng whitelist/khoá IP.
- **Không dùng** thư viện geo-IP offline (kiểu `geoip-lite`): file dữ liệu nặng, rủi ro vượt `maxLambdaSize: 50mb` của `backend/vercel.json` (**chưa đo**).
- **Làm giàu DTO:** thêm `countryCode: string | null` và `ipKind: 'public' | 'private'` cạnh mọi field IP ở: `GET /security/ip-blocks`, `GET /security/ip-whitelist` (cả `myIp`), `GET /security/events` (`ipAddress`), `GET /users` (`lastLoginIp`), response `PATCH /users/:id/unlock-login`, `GET /auth/sessions`, `GET /users/:id/sessions`. Mỗi endpoint gọi `resolveMany` **1 lần** cho cả trang.
- **FE:** component dùng chung `components/common/IpWithFlag.tsx` (`ip`, `countryCode`, `ipKind`; tooltip tên nước bằng `Intl.DisplayNames('vi')`; không có quốc gia → hiện `N/A`). Cờ vẽ bằng **SVG/CSS, KHÔNG dùng emoji** vì Windows không render emoji cờ (chỉ hiện 2 chữ cái) — dự án có người dùng Windows. ✅ **Đã duyệt 2026-10-14: thêm dependency FE `flag-icons`** (import CSS 1 lần ở layout dashboard, dùng class `fi fi-xx`; kiểm tra bản mới nhất tương thích Next 16 / bundle khi cài). Thay `<Text code>{ip}</Text>` ở 6 chỗ liệt kê trên; chuỗi `message.success(...)` chỉ là text nên ghi dạng `IP 1.2.3.4 (VN)`.
- **Cảnh báo khi thêm whitelist:** nếu quốc gia của IP đang thêm **khác** quốc gia của `myIp` → hiện cảnh báo vàng trong modal (không chặn). Giảm rủi ro whitelist nhầm IP lạ.
- Hạn chế cần biết: quốc gia = nơi IP **thoát ra Internet**; VPN/proxy cho ra cờ nước khác với vị trí thật.

#### 3.6.2 Log lượt truy cập theo từng IP

- **Định nghĩa "lượt truy cập" (✅ ĐÃ CHỐT 2026-10-14):** `POST /auth/login` (**mọi kết quả**), `POST /auth/refresh` **và mọi request API đã đăng nhập**. Vì ghi từng request vào MySQL trên serverless rất tốn (xem `PLAN_CPU_OPTIMIZATION_ROUND2`), request API đã đăng nhập **không ghi từng dòng** mà gom theo thùng (xem "Log request API đã đăng nhập" bên dưới).
- **Log request API đã đăng nhập (gom theo thùng):**
  - **Điểm hook:** 1 global interceptor/middleware chạy **sau** `JwtAuthGuard` (có `req.user`), không nhét vào `JwtStrategy.validate()` (đường nóng, đã có cache 10 giây).
  - **Thùng 1 phút:** mỗi `(ip, user_id, endpoint_group, phút)` = 1 dòng trong `ip_access_logs` với `hit_count`; request tiếp theo trong cùng thùng chỉ tăng `hit_count` (`INSERT … ON DUPLICATE KEY UPDATE`, khoá duy nhất `(ip, user_id, endpoint_group, bucket_minute)`). Thêm cột `hit_count INT`, `bucket_minute DATETIME`, `endpoint_group VARCHAR(60)`, `last_status INT`.
  - **Giảm số lần ghi:** cache trong instance theo khoá thùng — chỉ **lần đầu** của thùng ghi DB; số đếm các lần sau ghi dồn khi sang thùng mới hoặc khi instance hết hạn cache, nên `hit_count` của request API là **số xấp xỉ (có thể thấp hơn thật)**. Ghi rõ trên UI. `ip_access_stats.total_hits` vẫn cộng chính xác cho login/refresh, và xấp xỉ cho API.
  - **Lưu route mẫu, không lưu URL thô:** `GET /customers/:id`, không lưu query string/giá trị id/body (tránh lộ dữ liệu khách hàng và token trên URL). `endpoint_group` = tên controller (vd `customers`).
  - **Loại trừ:** `OPTIONS`, `/api/docs*`, health, endpoint cron (`*-cron/*`), và request chưa qua xác thực (đã có login/refresh ở trên).
  - **Công tắc dừng khẩn cấp:** `security_config.ip_access_log_api_enabled` (mặc định **bật**, vì bạn yêu cầu); tắt được từ DB/form mà không cần deploy nếu đo thấy CPU/DB tăng quá mức.
  - **Lưu ý hành vi (không đổi trong phase này):** khoá IP chỉ chặn `POST /auth/login`, nên IP "bị khoá" có access token còn hạn **vẫn gọi API được**. Log này sẽ làm lộ rõ điều đó trong Drawer; nếu muốn chặn cả API theo IP thì là quyết định riêng, chưa nằm trong plan.
- **Bảng riêng, không dùng `audit_logs`:** 4.1 cố ý không ghi lượt bị khoá để `audit_logs` khỏi phình; nay cần ghi hết nên tách bảng với retention riêng, **không sửa 4.1**, trang "Hoạt động bảo mật" giữ nguyên.
- **`ip_access_logs`** (migration `1786333000000`): `id BIGINT AI`, `ip VARCHAR(45)`, `country_code CHAR(2) NULL`, `endpoint VARCHAR(40)`, `outcome ENUM('success','wrong_password','unknown_email','account_locked','ip_locked','refresh_ok','refresh_failed')`, `ip_status ENUM('normal','whitelisted','blocked')` (**ảnh chụp trạng thái IP tại thời điểm đó**, vì whitelist/khoá đổi theo thời gian), `user_id INT NULL`, `email VARCHAR(255) NULL` (làm sạch đúng quy tắc 4.1: ≤ 255 ký tự, không phải email → `"[không phải email]"`, **không bao giờ** ghi mật khẩu/token), `user_agent VARCHAR(255) NULL`, `created_at DATETIME`. Index `(ip, created_at)` và `(created_at)`. Cột `string | null` khai `type: 'varchar'` tường minh.
- **`ip_access_stats`** (cùng migration): `ip VARCHAR(45) PK`, `total_hits`, `success_hits`, `failed_hits`, `blocked_hits`, `suppressed_hits` (INT), `first_seen_at`, `last_seen_at`, `last_outcome`, `last_country_code`, `detail_window_started_at`, `detail_window_count`. Cập nhật bằng **1 câu `INSERT … ON DUPLICATE KEY UPDATE` nguyên tử** (cùng kiểu 3.2, đồng hồ DB). Danh sách "mọi IP" đọc từ bảng này, **không `COUNT` trên bảng log**.
- **Chống phình khi bị tấn công** (IP bị khoá spam hàng nghìn request): **luôn** cộng bộ đếm trong `ip_access_stats`, nhưng chỉ ghi dòng chi tiết tối đa `security_config.ip_access_detail_cap_per_hour` dòng/IP/giờ (mặc định **20**; kẹp 1–1000); vượt thì chỉ tăng `suppressed_hits`. Việc đếm cap nằm **trong chính câu upsert** (`detail_window_*`) để không thêm query — chi tiết SQL chốt khi làm.
- **Điểm gọi:** `AuthService.login` ở **mọi nhánh** (đang bị `IP_LOCKED`, IP whitelist, email lạ, sai mật khẩu, `ACCOUNT_LOCKED`, thành công) và luồng refresh. IP whitelist **vẫn ghi đủ** (`ip_status = 'whitelisted'`). Ghi log bọc `try/catch`, lỗi chỉ `logger.warn` — **không bao giờ** làm hỏng đăng nhập; `await` (không fire-and-forget vì serverless có thể cắt sau khi trả response). Ước tính thêm 1–2 câu SQL/lần login → **đo CPU/DB sau khi bật**.
- **Retention:** thêm đối tượng `ip_access_logs` vào `RetentionService` (P1), cùng mẫu `security_events` (cờ `ip_access_log_cleanup_enabled`, xoá theo lô có ngân sách thời gian), hạn giữ `security_config.ip_access_log_retention_days` (mặc định **90**, kẹp 7–3650; migration `1786334000000`). `ip_access_stats` giữ lại (1 dòng/IP, nhỏ).
- **API** (`users.manage` scope `all` hoặc `role === admin`, như `ip-blocks`; **không tạo permission key mới**):
  - `GET /security/ip-access` — danh sách IP từ `ip_access_stats`; lọc `status=all|blocked|whitelisted`, tìm theo IP, sắp theo `last_seen_at`, phân trang; kèm `countryCode`, trạng thái **hiện tại** (join `login_ip_blocks`/`login_ip_whitelist`).
  - `GET /security/ip-access/:ip` — tóm tắt + log phân trang (lọc `outcome`, khoảng ngày).
- **FE:** (1) tab mới **"Lượt truy cập IP"** cạnh "IP bị khoá" ở `/users`; (2) bấm vào IP ở tab "IP bị khoá", khối whitelist và `/security-activity` mở **Drawer "Lịch sử truy cập IP x"**: cờ + tên nước, tag trạng thái hiện tại (Bị khoá / Whitelist / Thường), thẻ tổng hợp (tổng lượt, thành công, thất bại, bị chặn, lần đầu/gần nhất), bảng log (giờ, kết quả, trạng thái IP lúc đó, email/tài khoản, thiết bị). ⚠️ `/security-activity` gate bằng `audit.manage` còn endpoint dùng `users.manage` → ở trang đó **ẩn link bấm IP khi thiếu `can('users.manage')`**, không để lộ rồi báo 403.

#### 3.6.3 Việc phải làm

- [ ] Xác minh `x-vercel-ip-country` tới được BE trên Preview (và không giả mạo được từ client). *(chưa có bằng chứng đã xác minh trên Preview)*
- [x] 3 migration (số giữ chỗ ở mục 4 — **lúc làm phải `ls` thư mục `migrations` để lấy số lớn hơn mọi số hiện có, kể cả số giữ chỗ P6/P7**); `up()`/`down()` đối xứng, idempotent (`hasTable`/`hasColumn`).
- [x] Cài `flag-icons` ở FE (đã duyệt); component `IpWithFlag` có fallback `N/A`.
- [x] Sửa quốc gia thủ công: `PUT/DELETE /security/ip-geo/:ip` + audit `IP_COUNTRY_SET`/`IP_COUNTRY_CLEARED` + modal FE; spec: dòng `manual` không bị header Vercel ghi đè, mã sai → 400, IP nội bộ → 400, thiếu quyền → 403 và FE ẩn nút.
- [x] Entity `IpGeoCache`, `IpAccessLog`, `IpAccessStats`; `IpGeoService`, `IpAccessLogService`; helper `getClientCountry` (+ spec).
- [x] Nối `AuthService.login` (mọi nhánh) + refresh; `IpGeoService.record` khi có header.
- [x] Global interceptor log request API đã đăng nhập theo thùng 1 phút (mục 3.6.2): route mẫu, bộ loại trừ, cache khoá thùng trong instance, công tắc `ip_access_log_api_enabled`; spec: cùng thùng chỉ 1 lần ghi DB, URL thô/query không bao giờ được lưu, route loại trừ không ghi, lỗi ghi log không làm hỏng request. *(Đã làm 2026-10-15: `IpAccessApiLogInterceptor` + `IpAccessApiLogService` + `APP_INTERCEPTOR` trong `SecurityModule`; chỉ ghi request đã QUA guard — 401/403 do guard chặn không được ghi; còn: chạy migration `1786337000000`)*
- [x] **Setting lưu được và sửa được (đã chốt 2026-10-14):** migration seed mặc định `ip_access_log_retention_days = 90`, `ip_access_detail_cap_per_hour = 20`, `ip_access_log_api_enabled = 1`; thêm 3 trường này vào form chỉnh `security_config` ở `/security-activity` (P4.3) và `SecurityConfigService` (kẹp giá trị, cache 30 giây, audit `UPDATE_SECURITY_CONFIG` ghi giá trị cũ/mới). Đổi giá trị có hiệu lực ≤ 30 giây, không cần deploy. *(Đã đủ 3/3 từ 2026-10-15: thêm `ip_access_log_api_enabled` — DTO, `SecurityConfigService`, công tắc ở `/security-activity`)*
- [x] Làm giàu DTO ở 7 endpoint nêu ở 3.6.1; cập nhật type FE (`security.api.ts`, `users.api.ts`, `sessions.api.ts`, `audit.types.ts`).
- [x] API `GET /security/ip-access[/:ip]` + thêm 2 cột `security_config` (kẹp giá trị, cache 30 giây như 3.1).
- [x] Retention `ip_access_logs` trong `RetentionService`.
- [x] FE: `IpWithFlag`, thay 6 chỗ render IP, tab "Lượt truy cập IP", Drawer lịch sử, cảnh báo whitelist khác quốc gia.
- [x] Spec: lượt của IP **whitelist** và **bị khoá** đều được ghi đúng `ip_status`; vượt cap/giờ chỉ tăng `suppressed_hits`; lỗi ghi log không làm hỏng login; `resolveMany` 1 query/trang; IP nội bộ → `private`; header quốc gia lạ → `null`; email làm sạch; link IP ẩn khi thiếu quyền.
- [ ] Verify thật theo mục 6.8 (BE `tsc`/`nest build`/`jest`, FE `tsc`/`vitest`/`next build`) rồi tick mục 9 + 1 dòng `WORKFLOW_LOG.md`. *(làm sau khi xong 2 mục chưa tick ở trên)*

### 3.7 Khoá IP CHỦ ĐỘNG — blacklist (bổ sung theo yêu cầu 2026-10-15)
**Vấn đề:** 3.2 chỉ khoá **bị động** — IP phải sai đủ `ip_max_failed_attempts` (mặc định 10) lần mới bị khoá, và khoá tự hết sau `ip_lock_minutes` (5 phút). Admin thấy 1 IP đáng ngờ (dò nhiều email, quốc gia lạ ở tab "Theo dõi IP") nhưng **không có cách chặn ngay**, và không có cách chặn **lâu dài**.

**Mục tiêu:** Admin tự đưa 1 IP vào **blacklist** (chặn đăng nhập ngay, không chờ chạm ngưỡng), có thể đặt hạn (1 giờ / 24 giờ / 7 ngày / 30 ngày) hoặc **vĩnh viễn**, gỡ được bất kỳ lúc nào.

**Quyết định thiết kế (theo khuôn whitelist 3.5, không đụng bộ đếm 3.2):**
- **Dữ liệu:** migration `1786336000000-CreateLoginIpBlacklist` → bảng `login_ip_blacklist(id, ip VARCHAR(45) UNIQUE, reason VARCHAR(255) NULL, expires_at DATETIME NULL, created_by INT NULL, created_at DATETIME)`. `expires_at = NULL` = vĩnh viễn. Chỉ khớp **đúng 1 địa chỉ** (`normalizeIp`), không CIDR; tối đa 500 dòng. **Không** thêm cột/ENUM vào `login_ip_blocks`, `ip_access_logs`, `ip_access_stats`.
- **Thứ tự ưu tiên khi đăng nhập:** `blacklist` → `whitelist` → khoá IP bị động (3.2) → khoá tài khoản. IP đang bị chặn chủ động bị từ chối **trước cả khi so mật khẩu** (rẻ hơn bcrypt), dù mật khẩu đúng.
- **Kết quả bị chặn:** `403` + `code: 'IP_BANNED'` (không có `retryAfterSeconds` vì không tự hết theo phút), thông báo chung "Địa chỉ mạng của bạn đã bị chặn. Vui lòng liên hệ quản trị viên." — không lộ lý do/hạn. Không tăng bộ đếm, không sinh sự kiện bảo mật cho mỗi request bị từ chối (tránh phình bảng audit, như `IP_LOCKED`).
- **Áp dụng cả `auth/refresh`:** phiên đang mở từ IP bị chặn sẽ bị đẩy ra ở lần làm mới token kế tiếp (≤ thời hạn access token); FE interceptor đã tự `logout` khi refresh lỗi. **Không** chặn toàn bộ API bằng guard ở bản này (access token còn hạn vẫn gọi được tới khi hết hạn) — ghi nhận ở "Đánh đổi" bên dưới.
- **Ghi log theo dõi IP (3.6):** lượt bị chặn được ghi với `outcome = 'ip_locked'`, `ip_status = 'blocked'` (tái dùng giá trị ENUM sẵn có → **không ALTER bảng log lớn**). Cột "Trạng thái" ở tab Theo dõi IP hiện thêm **Bị chặn chủ động** (`currentStatus = 'banned'`, tính bằng JOIN `login_ip_blacklist`).
- **Quan hệ với whitelist:** thêm IP vào blacklist **đồng thời gỡ** khỏi whitelist (và xoá dòng khoá bị động); thêm vào whitelist **đồng thời gỡ** khỏi blacklist. 1 IP không bao giờ ở cả hai.
- **Hàng rào an toàn (chặn Admin tự khoá mình):** từ chối (409) nếu IP là **IP hiện tại của người thao tác**; từ chối IP **nội bộ/loopback** (`ipKind` ≠ công cộng — chặn `::1` sẽ khoá cả môi trường dev/LAN); từ chối IP không hợp lệ (400).
- **Cache:** `LoginIpBlacklistService` giữ `Map<ip, expiresAt|null>` **15 giây**/instance (ngắn hơn whitelist 30 giây vì mục đích là chặn gấp); thêm/gỡ xoá cache instance hiện tại. Dòng hết hạn bị bỏ qua khi kiểm tra (`expires_at > NOW()`), dòng hết hạn quá 30 ngày được dọn khi `list()`. Lỗi DB (vd chưa migrate) → coi như **không có IP nào bị chặn** + `logger.error` (không để lỗi bảng phụ làm sập đăng nhập của mọi người).
- **API** (`users.manage` scope `all` hoặc `role === admin`, như `ip-blocks`/`ip-whitelist`; **không tạo permission key mới**): `GET /security/ip-blacklist`, `POST /security/ip-blacklist {ip, reason?, durationHours?}` (`durationHours` bỏ trống/`null` = vĩnh viễn; 1–8760), `DELETE /security/ip-blacklist/:ip`.
- **Audit:** `IP_BLACKLIST_ADDED`, `IP_BLACKLIST_REMOVED` (thêm vào `SECURITY_AUDIT_ACTIONS` → hiện ở `/security-activity` và được bảo vệ khỏi job dọn audit thường; cập nhật map nhãn FE của trang đó).
- **FE (trang Nhân viên `/users`, tab IP):**
  - Khối mới **"IP bị chặn chủ động"** cạnh khối whitelist: form (IP, lý do, **thời hạn** 1 giờ/24 giờ/7 ngày/30 ngày/Vĩnh viễn), bảng (IP + cờ, lý do, người chặn, còn lại/Vĩnh viễn, nút **Gỡ chặn** có xác nhận).
  - Nút **"Chặn IP"** trên từng dòng của tab "IP bị khoá" (IP sai nhiều nhưng chưa đủ ngưỡng, hoặc đang khoá tạm muốn nâng thành chặn hẳn) → mở modal chọn thời hạn + lý do (có xác nhận).
  - Ẩn toàn bộ khi thiếu quyền (dùng `useCanEditIpCountry` / `can('users.manage')` scope all như khối whitelist), không để bấm rồi 403.
  - Trang login hiển thị thông báo `IP_BANNED` (không có đồng hồ đếm ngược).
- **Rủi ro / đánh đổi:** (1) chặn nhầm IP dùng chung (văn phòng/CGNAT) chặn **mọi người** sau IP đó → luôn hiện cảnh báo trong modal xác nhận, ưu tiên đặt hạn thay vì vĩnh viễn; (2) trễ ≤ 15 giây giữa các instance serverless; (3) kẻ tấn công đổi IP thì né được (blacklist là công cụ phản ứng nhanh, không thay thế khoá bị động); (4) access token còn hạn từ IP vừa bị chặn vẫn dùng được tới khi hết hạn — muốn cắt ngay phải làm guard toàn cục hoặc kèm `FORCE_LOGOUT` các phiên của IP đó → **để sau** (xem "ĐỂ SAU" C8).
- **Để sau:** nút "Chặn" ngay trên tab **Theo dõi IP** và trong ngăn Chi tiết IP; CIDR/dải IP; chặn theo quốc gia; chặn cả `register`/các route công khai khác.
- [x] Migration + entity + `LoginIpBlacklistService` (cache, list, add, remove, `isBanned`) + nối vào `AuthService.login`/`refresh`
- [x] `whitelist.add` gỡ blacklist; `blacklist.add` gỡ whitelist + dòng khoá bị động
- [x] API + audit + `SECURITY_AUDIT_ACTIONS` + hàng rào (IP hiện tại, IP nội bộ)
- [x] `currentStatus = 'banned'` ở `IpAccessLogService` + FE type `IpCurrentStatus`
- [x] FE: `LoginIpBlacklistSection`, nút "Chặn IP" ở `LoginIpBlocksTab`, thông báo `IP_BANNED` ở trang login
- [x] Spec: IP bị chặn bị từ chối trước bcrypt kể cả mật khẩu đúng; hết hạn thì cho qua; vĩnh viễn; whitelist/blacklist loại trừ nhau; không tự chặn IP hiện tại/IP nội bộ; lỗi DB fail-open; quyền (scope department bị 403); refresh bị chặn
- [x] Cập nhật guide `nhan-vien.md`, `hoat-dong-bao-mat.md`, `PERMISSIONS.md` (không có key mới), `WORKFLOW_LOG.md`
- **Trạng thái 3.7 (2026-10-15): ĐÃ LÀM xong code + spec + docs.** Verify: BE `tsc` sạch, `nest build`, `jest` 145 suite/2255 test pass; FE `tsc` chỉ còn lỗi `logo.png` có sẵn. **Còn:** chạy migration `1786336000000` trên DB, `npm run guides:sync`, deploy. Chưa kiểm tay trên trình duyệt (chặn thử 1 IP công cộng khác IP của mình rồi đăng nhập từ IP đó).
- **Đã chốt khi làm (lệch/bổ sung so với bản plan đầu):** blacklist đọc `expires_at` bằng đồng hồ DB (`TIMESTAMPDIFF`) rồi quy ra epoch instance (không lệch múi giờ); `add` trên IP đã có dòng = **gia hạn/ghi đè** (ON DUPLICATE KEY UPDATE) thay vì lỗi trùng; trần 500 chỉ đếm dòng **còn hiệu lực**; lượt `refresh` bị chặn ghi `outcome = 'ip_locked'` (ENUM sẵn có); trang login giữ nguyên ở /login với Alert cố định (không chuyển sang `/account-status` như các 403 khác).


---

## PHASE 4 — Audit sự kiện bảo mật (C2) + trang "Hoạt động bảo mật" (B3)

### 4.1 Ghi sự kiện (kể cả email chưa tồn tại)

- [ ] Migration `1786330000000-AllowNullAuditUserId`: `ALTER TABLE audit_logs MODIFY user_id INT NULL` (FK giữ `ON DELETE RESTRICT`, vẫn hợp lệ với NULL). Entity: `userId: number | null`, quan hệ `nullable: true`; `down()` phải chặn/dọn dòng NULL trước khi đặt lại NOT NULL.
- [ ] Thêm `AuditService.logSecurityEvent({ userId?: number | null, action, ip, userAgent, detail })` (không đụng chữ ký `logAction` hiện có để khỏi vỡ ~mọi nơi đang gọi). Dùng cột có sẵn `ip_address`/`user_agent`, đưa email vào `newData`.
- [ ] Các action (hằng số `SECURITY_AUDIT_ACTIONS` dùng chung cho trang này và job dọn): `LOGIN_FAILED`, `LOGIN_UNKNOWN_EMAIL`, `ACCOUNT_LOCKED`, `LOGIN_IP_BLOCKED`, `UNLOCK_LOGIN` (đã có), `UNBLOCK_LOGIN_IP`, `PASSWORD_CHANGE_FAILED`, `PASSWORD_CHANGED`, `FORCE_LOGOUT`, `SESSION_REVOKED`, `UPDATE_SECURITY_CONFIG`, và (bổ sung P3.5) `IP_WHITELIST_ADDED`, `IP_WHITELIST_REMOVED`.
- **Ghi mọi lần sai** (theo yêu cầu). Phần phình dữ liệu bị chặn bởi chính ngưỡng IP: sau khi IP chạm 10 lần thì các request bị từ chối vì IP khoá **không** ghi từng dòng — chỉ ghi **1 dòng `LOGIN_IP_BLOCKED`** lúc bắt đầu khoá.
- **Làm sạch email trước khi lưu:** cắt ≤ 255 ký tự; nếu giá trị **không đúng định dạng email** (người dùng hay dán nhầm mật khẩu vào ô email) thì lưu `"[không phải email]"` thay vì chuỗi gốc. **Không bao giờ** ghi mật khẩu/token.
- Phản hồi cho người dùng **không đổi** (xem C7 về thông báo lộ email).
- Spec: email không tồn tại có dòng audit `userId = null`; ô email chứa chuỗi không phải email không bị lưu nguyên văn; IP khoá không sinh dòng mỗi request.

### 4.2 Dọn sự kiện bảo mật

- [ ] Thêm đối tượng `security_events` vào `RetentionService` (P1): xoá các dòng `audit_logs` có `action IN (SECURITY_AUDIT_ACTIONS)` cũ hơn `security_config.security_event_retention_days`.
- [ ] Job dọn audit chung (P1) thêm điều kiện `action NOT IN (SECURITY_AUDIT_ACTIONS)` để chúng không bị xoá ở mốc 90 ngày.

### 4.3 Trang `/security-activity` (Admin)

- [ ] Lọc theo loại sự kiện, IP, email/tài khoản, khoảng ngày (dùng lại `paginateByWeek` như trang audit); thẻ tổng hợp (số lần khoá hôm nay, IP đang khoá, email lạ bị thử nhiều nhất); mở khoá nhanh tài khoản/IP.
- [ ] Form chỉnh `security_config` (ngưỡng tài khoản, ngưỡng IP, hạn giữ sự kiện).
- [ ] Quyền: tái dùng `audit.manage`; menu sidebar bằng `can('audit.manage')`. Hiển thị `userId = null` là "Không xác định (email chưa có trong hệ thống)" — rà các màn audit hiện tại để không crash khi `user` rỗng.

---

## PHASE 5 — Quản lý phiên & thiết bị (B1) — **mở rộng JSON, không migration**

Quyết định: giữ lưu trong `users.hashed_refresh_token`, nâng định dạng lên **v3**.

### 5.1 Định dạng

```json
{ "v":3, "s":[ { "id":"a1b2c3d4e5f6", "h":"<sha256>", "t":<epochSec>, "c":<tạoLúc>, "l":<hoạtĐộngCuốiLúc>, "ip":"1.2.3.4", "ua":"<≤160 ký tự>" } ], "l": null }
```
- `id` ổn định xuyên suốt các lần rotate refresh token (chỉ `h`, `t`, `l` đổi); `sid` = `id` được đưa vào payload access/refresh token.
- `parseRefreshStore` đọc cả **v2** (slot cũ chưa có `id` → `id = h.slice(0,12)`, hiển thị "Thiết bị không rõ") và v3; ghi lại dạng v3 ở lần ghi kế tiếp. Chuỗi bcrypt cũ vẫn giữ nhánh `LEGACY_GRACE` hiện có.
- Dung lượng: 10 slot × ~350 byte ≈ 3,5 KB, nằm trong giới hạn TEXT.
- Giữ `MAX_REFRESH_SESSIONS = 10` (vượt thì loại slot cũ nhất).

### 5.2 Việc phải làm

- [ ] Mở rộng `refresh-session-store.util.ts` (+ cập nhật `refresh-session-store.util.spec.ts`: v2→v3, rotate giữ `id`, thu hồi 1 slot, vượt 10 slot).
- [ ] Ghi `ip` + `ua` + `c` khi đăng nhập, cập nhật `l` khi refresh (lấy IP bằng `getClientIp`, P3). Nhãn thiết bị (vd "Chrome · Windows") suy ra từ UA bằng hàm regex nhỏ, **không thêm dependency**.
- [ ] **Chống race khi đọc-sửa-ghi 1 cột TEXT:** dùng đúng cơ chế mà luồng refresh hiện tại đang dùng (kiểm tra trước; nếu chưa có thì dùng transaction + `SELECT … FOR UPDATE` trên dòng user). Không tự nghĩ cách thứ hai.
- [ ] **Hiệu lực ngay khi đăng xuất cưỡng bức:** `JwtStrategy.validate()` hiện **không** đọc `hashedRefreshToken` (cột `select:false`, cache user 10 giây). Thêm kiểm tra `sid` còn trong store, có **cache riêng ~15 giây/instance** (cùng kiểu `auth-user-cache.util.ts`) → độ trễ tối đa ≈ 15 giây, không thêm 1 query/mỗi request. Access token phát hành **trước** lần deploy này không có `sid` → bỏ qua kiểm tra (tự hết hạn). Phiên bị thu hồi → `401 SESSION_REVOKED`; FE thử refresh, thất bại → đăng xuất im lặng (hành vi 401 hiện có). **Đo CPU/DB sau khi bật** (theo `PLAN_CPU_OPTIMIZATION_ROUND2`).
- [ ] Endpoint người dùng: `GET /auth/sessions` (đánh dấu "thiết bị hiện tại"), `DELETE /auth/sessions/:id`, `DELETE /auth/sessions` (đăng xuất mọi thiết bị khác).
- [ ] Endpoint Admin: `GET /users/:id/sessions`, `DELETE /users/:id/sessions[/:sid]` (1 hoặc tất cả); dùng `canManageUser` như nút "Mở khoá"; **Manager không cưỡng bức được Admin**; audit `FORCE_LOGOUT`/`SESSION_REVOKED`.
- [ ] **Số thiết bị mỗi tài khoản:** tính **ở ứng dụng** — đọc cột `hashed_refresh_token` của đúng các user trong trang hiện tại rồi `parseRefreshStore().s.length`. **Không** dùng `JSON_LENGTH` trong SQL vì dòng cũ chứa chuỗi bcrypt (không phải JSON) sẽ gây lỗi.
- [ ] FE: màn "Thiết bị đang đăng nhập" trong hồ sơ cá nhân; cột "Số thiết bị" + nút "Đăng xuất thiết bị" ở trang quản lý người dùng.
- [ ] Đổi/reset mật khẩu → thu hồi mọi phiên khác (kiểm code hiện tại đã làm chưa).

### 5.3 Đánh đổi cần biết
- "Hoạt động gần nhất" chỉ cập nhật khi refresh nên **chỉ chính xác theo chu kỳ access token**, không phải thời gian thực.
- Không truy vấn SQL xuyên người dùng được (vd "ai đang có > 3 thiết bị") — phải quét ở ứng dụng; chấp nhận được với quy mô nhân sự hiện tại.
- Không lưu lịch sử phiên đã thu hồi; lịch sử nằm ở audit (`FORCE_LOGOUT`, `SESSION_REVOKED`).

---

## PHASE 6 — Buộc đổi mật khẩu + hạn mật khẩu (B2) + chính sách mật khẩu thống nhất (C1)

### 6.1 Quy tắc nghiệp vụ
- **Tự đăng ký** → không buộc đổi, mật khẩu không hết hạn.
- **Mọi tài khoản do Admin hoặc role khác tạo**, và **sau khi Admin reset mật khẩu** → `must_change_password = true`: lần đăng nhập sau **bắt buộc** đổi.
- Form đổi **3 trường**: *Mật khẩu được cấp*, *Mật khẩu mới*, *Nhập lại mật khẩu mới*.
- Hạn mật khẩu **tuỳ chọn**: người tạo/reset chọn **Có hạn (N ngày)** hoặc **Vô hạn**. Hết hạn → buộc đổi lại.

### 6.2 Dữ liệu (`1786340000000-AddPasswordPolicyToUsers`)
`users`: `must_change_password TINYINT(1) NOT NULL DEFAULT 0` (`BooleanTransformer`), `password_changed_at DATETIME NULL`, `password_expires_at DATETIME NULL` (NULL = vô hạn). Người dùng hiện tại: `must_change = 0`, `expires = NULL` (không ép người cũ).

### 6.3 Việc phải làm
- [ ] BE: tạo user / reset-password nhận `passwordExpiryDays?: number | null` (trống/null = vô hạn); đặt cờ + tính `password_expires_at`.
- [ ] Đăng nhập trả `mustChangePassword` (cờ bật **hoặc** `password_expires_at <= NOW()` theo đồng hồ DB).
- [ ] **Chặn ở BE, không chỉ FE:** guard toàn cục chỉ cho `change-password`, `logout`, `me`, `refresh` khi cờ bật; endpoint khác → `403 PASSWORD_CHANGE_REQUIRED`. FE chỉ điều hướng sang trang đổi.
- [ ] `POST /auth/change-password-required`: xác thực mật khẩu được cấp; mật khẩu mới ≠ cũ; áp chính sách (6.4); thành công → tắt cờ, đặt `password_changed_at`, tính hạn mới theo lựa chọn đã chọn, thu hồi các phiên khác (P5), audit `PASSWORD_CHANGED`.
- [ ] FE: trang `/change-password-required` (3 trường) + route guard; dialog tạo/reset người dùng thêm lựa chọn "Hạn mật khẩu: Vô hạn / N ngày".

### 6.4 C1 — chính sách mật khẩu thống nhất (đã chốt làm kèm)
- Tạo **1 hằng số/decorator chung** (`common/validators/password-policy.ts`: ≥ 8 ký tự + regex đang dùng ở `reset-password.dto.ts`) và dùng cho **4 nơi**: `register.dto.ts`, `reset-password.dto.ts`, `change-password.dto.ts` (hiện chỉ `MinLength` 6) và DTO mới ở 6.3.
- Rà các form FE đang validate 6 ký tự để đồng bộ thông báo lỗi.
- Không ép người dùng đang có mật khẩu ngắn đổi lại (chỉ áp khi họ đổi lần sau).
- [ ] Spec: 7 ký tự bị từ chối ở cả 4 nơi; tự đăng ký không bị buộc; tạo bởi admin bị buộc; reset bị buộc; hết hạn bị buộc; vô hạn không bao giờ hết; endpoint khác trả 403.

---

## PHASE 7 — Thao tác hàng loạt có Hoàn tác (B4) — **hạn 5 phút**

- Phạm vi đầu: **đổi trạng thái hàng loạt** và **chia lại sales hàng loạt** (khách hàng).
- Bảng `bulk_operations` (`1786350000000`): `id, type, actor_id, created_at, expires_at DATETIME, undone_at NULL, undone_by NULL, payload_before JSON, payload_after JSON, affected_count`.
- Lúc thao tác: lưu **ảnh chụp trước** (id → trạng thái/sales cũ, gồm cả `customer_assignments`) **trong cùng transaction**; `expires_at = NOW() + INTERVAL 5 MINUTE` (đồng hồ DB); trả `operationId` + số giây còn lại.
- `POST /bulk-operations/:id/undo`: chỉ người thực hiện (hoặc admin); chưa hết hạn/chưa hoàn tác. **Kiểm tra xung đột:** bản ghi nào đã bị sửa sau thao tác (so `updated_at`) thì **bỏ qua và báo**; kết quả `{restored, skipped}`.
- Hoàn tác bằng `merge()` + gán quan hệ tường minh (SKILL BE §13), ghi audit `BULK_UNDO`; giữ quy tắc Primary/Shared (SKILL BE §12).
- FE: toast "Đã cập nhật N khách hàng — **Hoàn tác** (còn 4:58)" dùng `useCountdown`; hết giờ nút biến mất.
- Dọn bản ghi hết hạn bằng cron retention (P1).
- [ ] Spec: hoàn tác đúng; xung đột bị bỏ qua; quá 5 phút → 410; người khác → 403.

---

## PHASE 8 — Trang "Sức khoẻ hệ thống" cho Root Admin (B5)

- Chỉ `role === 'admin'` cố định. Dùng permission mới `system.health.view` **chỉ khi** muốn gate bằng quyền (khi đó phải seed migration và giữ bypass admin ở 3 lớp); mặc định kiểm role admin ở BE + `isAdmin` ở FE.
- `GET /system/health` trả:
  - **Kích thước bảng + số dòng ước lượng** từ `information_schema.tables` (cache 5 phút), cảnh báo bảng vượt ngưỡng — đặc biệt `audit_logs`, `periodic_task_audit_logs`, `notifications`, `attendance_logs`.
  - **Cron:** từ `cron_runs` — lần chạy gần nhất, trạng thái, số bản ghi xoá, **chu kỳ đang cài và lần chạy tiếp theo**; cảnh báo nếu quá hạn (chu kỳ + 2 ngày) mà chưa chạy.
  - **Cache:** liệt kê các cache thực sự có trong code (cache user 10s, cache sid 15s, cache `security_config` 30s, cache ref-data…) với số mục hiện tại; ghi rõ "theo instance hiện tại" vì serverless mỗi instance có cache riêng.
  - **Phiên:** tổng số phiên đang có = quét cột `hashed_refresh_token` các user có giá trị rồi parse (P5).
  - Phiên bản app, ping DB, số IP đang bị khoá.
- FE: trang chỉ-đọc (thẻ + bảng) + nút "Làm mới"; không có hành động nguy hiểm.

---

## PHASE 9 — Xuất / nhập cấu hình JSON (B6)

- **Xuất:** phân quyền (`roles`, `permissions`, `role_permissions` kể cả **override theo phòng ban**), `customer_statuses`, `periodic_task_statuses`, leave types, link categories, `positions`, `ui_visibility_rules`; có thể gồm `security_config` và chu kỳ retention. **Không xuất** user, mật khẩu, token, `settings` chứa secret.
- **Khoá tự nhiên, không dùng id** (`role.key`, `permission.key`, tên/mã phòng ban) để nhân sang môi trường khác vẫn khớp. File có `schemaVersion`, `exportedAt`, `source`, checksum.
- **Nhập 2 bước:** `POST /system/config/import?dryRun=true` trả **diff** → xác nhận → áp trong 1 transaction + audit. Chặn nếu `schemaVersion` không khớp hoặc **permission key không tồn tại** ở môi trường đích (tránh khoá vĩnh viễn endpoint). Luôn giữ bypass `admin`.
- Ma trận quyền phải khai rõ lọc `department_id` (Toàn cục vs Override) — điểm từng gây bug xoá nhầm override. Mặc định chế độ **gộp**; chế độ "thay thế" phải xác nhận riêng.
- Chỉ Root Admin. FE: nút Xuất (tải file) và Nhập (upload + xem diff).
- [ ] Spec: xuất→nhập sang DB trống ra cùng ma trận; permission lạ bị từ chối; dryRun không ghi.

---

## PHASE 10 — `loading.tsx` / skeleton & khả năng truy cập (B7)

- [ ] `loading.tsx` ở `app/(dashboard)/` và route nặng: customers, audit-logs, attendance-device, reports, lich-su-cong-viec (dùng lại `LoadingSkeleton`).
- [x] `(dashboard)/error.tsx` nếu chưa có (đã nêu ở `PLAN_HARDENING.md` — kiểm tra file đó để khỏi làm trùng). *(đã có `app/error.tsx` và `(dashboard)/error.tsx`)*
- [ ] Rà `aria-*` cho bảng lớn: `aria-label` cho nút chỉ có icon, `aria-sort`, `aria-live` cho vùng tải/lỗi, focus rõ, thứ tự Tab.
- [ ] Phím tắt (phối hợp với "Ctrl+K" ở `PLAN_HARDENING`, không làm 2 lần): `/` focus tìm kiếm, `←/→` đổi trang bảng, `Esc` đóng modal; bảng tra phím tắt (`?`).
- [ ] Test `vitest` + Testing Library kiểm `role`/`aria`; xem bằng mắt trên trình duyệt thật (jsdom không chạy animation).

---

## ĐỂ SAU (ghi nhận, chưa làm)

| Mã | Nội dung | Ghi chú |
|---|---|---|
| C3 | Tách `customers.service.ts` (4297), `users.service.ts` (1729), `leave-requests.service.ts` (1396) | Tách theo nghiệp vụ như `customers-period-stats.service.ts`; giữ nguyên public API, test xanh trước/sau. Làm **sau** P1–P6 vì P3/P5/P6 sửa nhiều ở `users.service.ts`/`auth.service.ts`, tách trước sẽ xung đột merge. |
| C4 | Giảm `any` (~372 BE, ~288 FE) | Làm dần theo file đang sửa; bật `no-explicit-any` mức `warn` rồi siết. Chưa đo lại. |
| C5 | Spec controller: `customers`, `leave-requests`, `users`, `roles`, `reports`, `zk-device` | Ưu tiên khoá guard/route (đúng `@RequirePermission` từng endpoint) theo mẫu `periodic-tasks.controller.spec.ts`. |
| C6 | README gốc lỗi thời (Next 14, antd 5, roadmap 4 tuần) | `README_AZWORKBASE_PROJECT.md` đã có banner "lịch sử"; cập nhật `README.md` gốc theo `package.json` thật. |
| C7 | (Mới) `login()` trả "Tài khoản không tồn tại" cho email lạ và "Mật khẩu sai…" cho email có thật → lộ việc email có tồn tại | Chưa sửa vì FE/UX đang dựa vào các thông báo này; cân nhắc gộp 1 thông báo chung sau khi P3–P4 xong. |
| C8 | Cắt NGAY phiên đang mở của IP vừa bị chặn chủ động (guard toàn cục kiểm blacklist, hoặc `FORCE_LOGOUT` các phiên có `ip` đó trong JSON phiên) | Bản P3.7 chỉ chặn `login` + `refresh`; access token còn hạn dùng được tới khi hết hạn. Cùng nhóm: nút "Chặn" trên tab Theo dõi IP / ngăn Chi tiết IP, CIDR, chặn theo quốc gia, chặn `register`. |

## KHÔNG LÀM
- **D1** `?secret=` / xoay secret / so sánh hằng thời gian cho cron **cũ**. (Endpoint cron **mới** ở P1 vẫn dùng `timingSafeEqual` + header, chi phí ~0.)
- **D2** `npm audit` BE 4 moderate (`uuid` trong `exceljs`): rủi ro thấp; không hạ bản `exceljs` theo gợi ý npm.

## 5. Thứ tự & phụ thuộc

```
P1 Retention ──┬─> P2 Xoá nhiều khoảng
               ├─> P4.2 (dọn sự kiện bảo mật)
               ├─> P7 (dọn bulk_operations)
               └─> P8 (cần cron_runs)
P3 (config + IP + secret) ─> P4 (audit bảo mật + trang) ─> P8
P3 (getClientIp) ─> P5 (ghi ip/ua vào phiên)
P3.5 ─> P3.6 (cờ quốc gia + log truy cập IP; cần P1 `RetentionService` để dọn `ip_access_logs`; làm trước P5 để phiên/`SessionList` dùng chung `IpWithFlag`)
P5 Phiên ─> P6 Đổi mật khẩu (thu hồi phiên sau đổi)
P9, P10 độc lập
```
Thứ tự: **P1 → P2 → P3 → P4 → P5 → P6 → P7 → P8 → P9 → P10.** P3.4 (bắt buộc secret) deploy riêng, đầu tiên trong P3.

## 6. Quy trình chung cho mọi phase
1. Mỗi phase = 1 nhánh/commit riêng, không kèm `[deploy]` cho tới khi test xong.
2. Pull code mới nhất trước khi làm (nhiều tài khoản cùng làm); đọc phần cuối `WORKFLOW_LOG.md` tránh làm trùng.
3. Trước khi sửa: entity → DTO → controller liên quan (SKILL_FILE_MANAGEMENT §1.1).
4. Migration theo bảng mục 4; không sửa migration cũ; không tự chạy lên production.
5. Permission mới phải seed migration **trước** khi dùng `@RequirePermission`; giữ bypass `role === 'admin'` ở `PermissionGuard`, `RolesService.getMyPermissions()` và mọi helper tự kiểm quyền; FE dùng `can('key')`, không hardcode role.
6. Thời gian nghiệp vụ `DATETIME`, so sánh bằng đồng hồ DB; thời gian còn lại gửi dạng **số giây**.
7. BE không dùng `console.log` (dùng `Logger`); không log token/mật khẩu.
8. Trước khi báo xong, chạy thật và dán kết quả: BE `npx tsc --noEmit`, `npx nest build`, `npx jest`; FE `npx tsc --noEmit`, `npx vitest run`, `next build`.
9. Xong phase → tick mục 8 và thêm 1 dòng vào `WORKFLOW_LOG.md`.

## 7. Rủi ro chính

| Rủi ro | Cách giảm |
|---|---|
| Thêm cron thứ 3 vượt giới hạn gói Vercel → deploy lỗi | Kiểm gói trước; phương án dự phòng gọi `runIfDue()` từ cron `auto-overdue` có sẵn |
| Lịch trong `vercel.json` không đổi được từ FE | Cron kích hoạt hằng ngày + kiểm "đến hạn" theo chu kỳ lưu DB |
| Xoá nhầm dữ liệu chấm công/audit | `dryRun` trước, attendance mặc định tắt + sàn 365 ngày, ghi audit sau khi xoá, sự kiện bảo mật cần tick riêng |
| Cron serverless timeout | Xoá theo lô có ngân sách ~8 giây, idempotent, `partial` làm tiếp hôm sau |
| Fail-fast `JWT_REFRESH_SECRET` làm app không lên | Kiểm biến Preview + Production, deploy riêng |
| Mọi người bị tính chung 1 IP nếu login đi qua proxy FE không forward header | Xác minh đường gọi login trước P3.2; dùng `getClientIp` chung |
| Khoá nhầm cả văn phòng (chung IP) | Admin mở khoá 1 chạm; ngưỡng/cửa sổ chỉnh trong DB; khoá chỉ 5 phút |
| Ai đó đặt giá trị config = 0 trong DB tắt mất bảo vệ | Kẹp khoảng hợp lệ + fallback mặc định + warn |
| `audit_logs` phình do tấn công nhiều IP, hoặc lưu nhầm mật khẩu gõ vào ô email | Ngưỡng IP chặn nguồn ghi; retention 180 ngày cấu hình được; làm sạch email, không lưu chuỗi không phải email |
| `ip_access_logs` phình khi IP bị khoá spam request | Luôn cộng `ip_access_stats`, chỉ ghi tối đa N dòng chi tiết/IP/giờ (mặc định 20), retention 90 ngày cấu hình được |
| Log mọi request API đã đăng nhập làm tăng mạnh ghi DB/CPU serverless | Gom theo thùng 1 phút + cache khoá thùng trong instance (chỉ lần đầu của thùng ghi DB), `hit_count` xấp xỉ; công tắc `ip_access_log_api_enabled` tắt được không cần deploy; **đo CPU/DB ngay sau khi bật** |
| Ghi log truy cập tốn thêm 1–2 query/lần login, hoặc làm hỏng đăng nhập khi lỗi DB | `try/catch` + `logger.warn`, không ném lỗi; đo CPU/DB sau khi bật |
| Cờ quốc gia sai (VPN/proxy) hoặc IP thiếu quốc gia | Ghi rõ "nước nơi IP thoát ra"; không tra cứu ngoài (không rò IP); thiếu thì hiện `N/A` và Admin sửa tay được |
| Emoji cờ không hiện trên Windows | Dùng SVG/CSS (`flag-icons`), không dùng emoji |
| Race khi sửa JSON phiên | Dùng cơ chế khoá/so sánh sẵn có của luồng refresh; test đồng thời |
| Đăng xuất cưỡng bức chậm hiệu lực | Kiểm `sid` + cache 15 giây (trễ tối đa ≈ 15 giây); đo CPU sau triển khai |
| Hoàn tác ghi đè dữ liệu người khác vừa sửa | So `updated_at`, bỏ qua bản ghi xung đột và báo |
| Nhập cấu hình làm khoá endpoint | Chặn permission key chưa tồn tại, dryRun diff, mặc định gộp |

## 8. Việc còn cần xác nhận khi bắt tay làm (không chặn việc viết plan)

1. **Gói Vercel cho phép mấy cron?** (quyết định thêm vào `vercel.json` hay dùng phương án dự phòng ở 1.1).
2. **Login gọi BE trực tiếp hay qua route FE?** (quyết định có phải forward `x-az-client-ip` ở P3.2).
3. Chấp nhận **độ trễ ≤ ~15 giây** của đăng xuất cưỡng bức (P5), hay muốn đánh đổi bằng cách thu hẹp thời hạn access token.
4. Các giá trị mặc định ở "Giả định" (mục 1): cửa sổ IP 10 phút, khoá IP 5 phút, giữ sự kiện bảo mật 180 ngày.
5. ✅ **(P3.6) Đã chốt 2026-10-14:** log cả mọi request API đã đăng nhập (gom theo thùng 1 phút, xem 3.6.2).
6. ✅ **(P3.6) Đã chốt 2026-10-14:** chỉ dùng header Vercel, **không tra cứu ngoài**; IP chưa có quốc gia hiện `N/A`, Admin sửa tay được (xem 3.6.1).
7. ✅ **(P3.6) Đã chốt 2026-10-14:** duyệt thêm dependency FE `flag-icons`.
8. ✅ **(P3.6) Đã chốt 2026-10-14:** mặc định **90 ngày** + **20 dòng chi tiết/IP/giờ**, và phải lưu được/sửa được trong setting (xem 3.6.3).

## 9. Checklist tiến độ

- [x] P1 Retention tự động (audit, task log, notifications, attendance) + chu kỳ 14/30 ngày + `cron_runs` + FE — *đã làm 2026-10-14; còn: chạy migration `1786300000000` trên DB + đặt `CRON_SECRET`; cron đang chạy qua phương án dự phòng (gọi từ `auto-overdue`), chưa thêm vào `vercel.json` (xem mục 8 câu 1)*
- [x] P2 Xoá theo nhiều khoảng (audit, task log) — *đã làm 2026-10-14; không migration. Route thực tế là `POST /audit-logs/cleanup-ranges` (plan ghi nhầm `/audit/...`); chữ xác nhận dùng `XÁC NHẬN` (khớp các modal xoá sẵn có) thay vì `XOA`*
- [x] P3.4 Bắt buộc `JWT_REFRESH_SECRET` (deploy riêng) — *đã làm 2026-10-14; còn: xác nhận biến trên cả Preview + Production của Vercel rồi deploy riêng. Độ dài ≥ 32 chỉ bắt buộc khi `NODE_ENV=production` (xem WORKFLOW_LOG)*
- [x] P3.1 Bảng `security_config` + thay hằng số khoá tài khoản — *đã nối 2026-10-14; còn: chạy migration `1786310000000`*
- [x] P3.2 Khoá IP (10 lần) + `login_ip_blocks` + `last_login_ip` — *đã nối 2026-10-14; còn: chạy migration `1786320000000`*
- [x] P3.3 Admin xem/reset khoá IP — *đã nối 2026-10-14 (tab "IP bị khoá" ở /users)*
- [x] P3.5 Whitelist IP (miễn khoá theo IP, vẫn khoá email) — *đã làm 2026-10-14; còn: chạy migration `1786331000000`*
- [ ] P3.6 Cờ quốc gia cạnh mọi IP + log lượt truy cập theo từng IP (whitelist/bị khoá đều ghi) — *đã làm: cờ quốc gia, `IpWithFlag`, sửa tay quốc gia, log `auth/login` + `auth/refresh`, tab Theo dõi IP, retention; log request API đã đăng nhập (3.6.2, đã làm 2026-10-15); CHƯA làm: xác minh header `x-vercel-ip-country` trên Preview; còn: chạy migration `1786332000000`–`1786334000000` và `1786337000000`*
- [x] P4 Audit sự kiện bảo mật (cho phép `user_id` NULL) + dọn theo `security_event_retention_days` + trang "Hoạt động bảo mật" — *đã làm 2026-10-14; còn: chạy migration `1786330000000`; trang dùng phân trang thường thay vì `paginateByWeek`*
- [x] P5 Thiết bị đăng nhập + đăng xuất cưỡng bức (JSON v3) — *code đã có (`/auth/sessions`, `UserSessionsModal`, quyền `users.sessions`); WORKFLOW_LOG 2026-10-15 ghi đã làm; còn: chạy migration `1786335000000`*
- [x] P3.7 Khoá IP chủ động (blacklist, có hạn/vĩnh viễn) + UI trang Nhân viên — *đã làm 2026-10-15; còn: chạy migration `1786336000000`, `guides:sync`, deploy*
- [ ] P6 Buộc đổi mật khẩu + hạn mật khẩu + C1 (≥ 8 ký tự mọi nơi)
- [ ] P7 Thao tác hàng loạt có Hoàn tác (5 phút)
- [ ] P8 Trang Sức khoẻ hệ thống
- [ ] P9 Xuất/nhập cấu hình JSON
- [ ] P10 `loading.tsx` + aria/phím tắt
- [ ] (Để sau) C3 tách service · C4 giảm `any` · C5 spec controller · C6 README gốc · C7 thông báo đăng nhập