# PLAN — Retention tự động, Bảo mật phiên đăng nhập & Củng cố hệ thống AZ_Workbase

> Đặt tại `AZ-Workbase Skills/PLAN_RETENTION_SECURITY_ROADMAP.md`. Làm **từng phase một**; xong phase nào tick phase đó và thêm 1 dòng vào `WORKFLOW_LOG.md`.
> Cơ sở: đã clone `main` ngày 2026-10-13 và đọc code thật. Migration lớn nhất hiện có: `1786200000000-AddLoginLockoutToUsers`. Mọi migration mới phải `ls` lại thư mục `migrations` ở thời điểm làm để lấy số lớn hơn (số đề xuất bên dưới chỉ là chỗ giữ).

## 0. Phân loại yêu cầu

| Nhóm | Nội dung | Trạng thái |
|---|---|---|
| **A. Làm ngay** | A1 Retention tự động (audit, task log, notifications, attendance) · A2 Xoá theo nhiều khoảng · A3 Chặn brute-force theo IP + Admin reset · A4 Bắt buộc `JWT_REFRESH_SECRET` | Plan chi tiết |
| **B. Tính năng mới** | B1 Thiết bị đăng nhập + đăng xuất cưỡng bức · B2 Buộc đổi mật khẩu + hạn mật khẩu · B3 Trang "Hoạt động bảo mật" · B4 Thao tác hàng loạt có Hoàn tác · B5 Sức khoẻ hệ thống · B6 Xuất/nhập cấu hình · B7 `loading.tsx` + aria/phím tắt | Plan chi tiết |
| **C. Ghi nhận, làm sau** | C1 Thống nhất chính sách mật khẩu · C2 Audit cho sự kiện đăng nhập thất bại/khoá/đổi mk lỗi · C3 Tách service lớn · C4 Giảm `any` · C5 Spec cho controller · C6 README gốc | Chỉ ghi nhận |
| **D. Không làm** | D1 `?secret=` trong URL cron (UptimeRobot free không gắn được header) · D2 `npm audit` 4 moderate (`uuid` trong `exceljs`, rủi ro thấp; FE 0 lỗ hổng) | Không làm |

> Ghi chú phụ thuộc: **C2 nên làm trước B3** (trang "Hoạt động bảo mật" cần dữ liệu từ audit). Vì vậy C2 được kéo lên Phase 4 cùng B3, các mục còn lại của nhóm C giữ ở "để sau".

## 1. Kết quả xác minh trên code thật

| # | Phát hiện | Bằng chứng |
|---|---|---|
| 1 | `handleCleanupCron()` còn nguyên nhưng `@Cron` bị comment, không nơi nào gọi. Đầu file ghi rõ **không dùng `@nestjs/schedule` vì chạy Vercel serverless** → không thể chỉ "bỏ comment". | `audit.service.ts` L8-12, L359-371 |
| 2 | Công tắc "bật + số ngày giữ" lưu vào `settings` (`audit_cleanup_enabled`, `audit_retention_days`) nhưng **không có thứ gì đọc để chạy**. | `audit.service.ts` L305-330 |
| 3 | Đã có xoá **1 khoảng** ngày cho audit (`cleanupByDateRange`) và task audit (`periodic-task-audit.service.ts` L298). Chưa có nhiều khoảng. | grep |
| 4 | `notifications` chỉ có `purge(id)` thủ công từng bản ghi. `attendance_logs` chỉ có `DELETE attendance-logs/cleanup?olderThan=` thủ công. | `notifications.service.ts` L508; `zk-device.controller.ts` L119 |
| 5 | Pattern cron đã chạy được ở repo: endpoint bảo vệ bằng `CRON_SECRET` (header `x-cron-secret` / Bearer / `?secret=`), gọi bởi Vercel Cron hoặc UptimeRobot. `vercel.json` hiện có **2** cron (`zk-device-cron/sync-today`, `periodic-tasks-cron/auto-overdue`). | `periodic-task-reminders-cron.controller.ts`, `vercel.json` |
| 6 | `/auth/register` có `@Throttle(5/10 phút)` + `ThrottlerBehindProxyGuard` (đọc `x-az-client-ip`); `/auth/login` **không có throttle**. Khoá chỉ theo tài khoản (`failed_login_attempts`, `locked_until`). | `auth.controller.ts` L32-59 |
| 5b | **Lưu ý IP:** FE và BE là 2 Vercel project riêng; BE chỉ lấy đúng IP người dùng qua header `x-az-client-ip` do FE gắn. Login hiện đi theo đường nào (qua route trung gian FE hay gọi thẳng BE) phải kiểm tra trước khi làm A3. | comment `throttler-behind-proxy.guard.ts` |
| 7 | `auth.service.ts` L44 có fallback `'default-refresh-secret'` khi ký, nhưng L301 **verify** lại đọc `JWT_REFRESH_SECRET` **không fallback**. Thiếu biến → ký bằng secret công khai, verify bằng `undefined`: vừa không an toàn vừa lỗi. | `auth.service.ts` L44, L301 |
| 8 | Phiên đăng nhập hiện lưu trong cột `users.hashed_refresh_token` dạng JSON `{v:2, s:[{h,t}]}`, tối đa `MAX_REFRESH_SESSIONS = 10`. Slot **chỉ có hash + thời điểm**, chưa có IP/User-Agent/tên thiết bị. | `refresh-session-store.util.ts` |
| 9 | `customers.service.ts` 4297 dòng, `users.service.ts` 1729 dòng (đã đo). Số liệu `leave-requests` 1396 dòng, ~372 `any` BE / ~288 `any` FE, 20 file có `aria-*`, thiếu `loading.tsx`: **lấy theo báo cáo, chưa đo lại**. | wc |

---

## PHASE 1 — Retention tự động (A1) · ưu tiên cao nhất

**Mục tiêu:** `audit_logs`, log task, `notifications`, `attendance_logs` không phình vô hạn; Admin bật/tắt và đặt số ngày giữ ngay trên FE; công tắc **thực sự có tác dụng**.

### 1.1 Kiến trúc (quyết định chính)

Không dùng `@Cron`. Làm **một endpoint cron duy nhất** theo đúng pattern `CRON_SECRET` đã có:

```
GET /api/system-cron/retention     (header x-cron-secret hoặc Bearer; KHÔNG thêm ?secret= cho endpoint mới)
```

- Mỗi lần chạy: đọc cấu hình từng đối tượng từ `settings` → đối tượng nào `enabled = true` thì xoá bản ghi cũ hơn `retentionDays`.
- **Công tắc FE (Switch) chỉ ghi `settings`**; endpoint cron là bên đọc. Tắt Switch = lần cron tiếp theo bỏ qua đối tượng đó.
- Trả về `{ job, target, deleted, durationMs }` cho từng đối tượng, và ghi 1 dòng audit hệ thống (`SYSTEM_RETENTION_RUN`) cùng 1 dòng vào bảng `cron_runs` (xem 1.4) để Phase 6 hiển thị "lần cron gần nhất".
- **Giới hạn thời gian:** xoá theo lô (`DELETE ... WHERE ... LIMIT 5000` lặp tới hết hoặc tới ngân sách ~8 giây) để không timeout trên serverless; phần còn lại để lần chạy sau. Dùng điều kiện `created_at < cutoff` theo đồng hồ DB (`NOW() - INTERVAL ? DAY`) để không lệch múi giờ.
- **Idempotent:** chạy 2 lần liên tiếp không hại gì.

**Cách gọi (chọn 1, cần bạn quyết định — mục 8):**
- (a) UptimeRobot gọi mỗi ngày — đang dùng sẵn, không đụng `vercel.json`.
- (b) Thêm vào `vercel.json` `crons` (`0 20 * * *` = 03:00 giờ VN). Hiện đã có 2 cron; **kiểm tra giới hạn số cron của gói Vercel đang dùng** trước khi thêm cái thứ 3.

### 1.2 Cấu hình theo đối tượng

Khoá `settings` mới (giữ nguyên 2 khoá audit cũ để tương thích):

| Đối tượng | Khoá enabled / days | Mặc định | Quy tắc riêng |
|---|---|---|---|
| `audit_logs` | `audit_cleanup_enabled` / `audit_retention_days` (đã có) | 90 ngày | Giữ 90 ngày gần nhất |
| `periodic_task_audit_logs` (log task) | `task_audit_cleanup_enabled` / `task_audit_retention_days` | 90 ngày | Giống audit |
| `notifications` | `notification_cleanup_enabled` / `notification_retention_days` | 60 ngày | Chỉ xoá thông báo **đã đọc**; thông báo chưa đọc giữ thêm (hạn riêng, vd 180 ngày) |
| `attendance_logs` | `attendance_cleanup_enabled` / `attendance_retention_days` | **Tắt** | Dữ liệu chấm công/lương: tối thiểu 365 ngày, cảnh báo rõ trên UI, tách quyền |

- DTO: `retentionDays` `@IsInt() @Min(7)` (attendance: `@Min(365)`), `enabled` boolean.
- Quyền: audit/task audit dùng `audit.manage` (đã có); notifications/attendance dùng permission hiện hữu của module đó. **Không tạo key mới nếu chưa seed** — kiểm tra bảng `permissions` trước.

### 1.3 Việc phải làm

**Backend**
- [ ] Tạo `RetentionService` (module `system/` hoặc `audit/`): `runAll()`, `runTarget(target)`, `getSettings()`, `updateSettings()`; tái dùng `handleCleanupCron()` hiện có bằng cách chuyển thân hàm vào `RetentionService` (giữ comment backup `// [AGENT] OLD CODE`).
- [ ] Tạo controller cron `system-cron/retention` (bản sao cách bảo vệ của `periodic-task-reminders-cron.controller.ts`, so sánh secret bằng `timingSafeEqual`).
- [ ] Endpoint admin: `GET/PUT /system/retention-settings`, `POST /system/retention/run-now?target=&dryRun=true` (xem trước số dòng sẽ xoá, nút "Chạy thử").
- [ ] Gỡ comment sai lệch ở đầu `audit.service.ts` (cron nay có thật, qua endpoint).
- [ ] Spec: cutoff đúng biên, `enabled=false` thì không xoá, lô xoá lặp đúng, dryRun không ghi, sai secret → 401/403, thiếu `CRON_SECRET` → báo lỗi như pattern cũ.

**Frontend**
- [ ] Trang audit (`audit-logs/page.tsx`) và trang log task (`lich-su-cong-viec/page.tsx`): Switch "Tự động dọn" + ô số ngày + nút "Chạy thử (xem số dòng)" + dòng "Lần chạy gần nhất: … xoá N dòng".
- [ ] Gate bằng `can('audit.manage')`, không hardcode role.

**Migration** (`1786300000000-CreateCronRuns`): bảng `cron_runs(id, job, target, started_at DATETIME, finished_at DATETIME, status, affected INT, message TEXT)`. Dùng `DATETIME` (không `TIMESTAMP`) theo SKILL DB; `up()`/`down()` đối xứng, idempotent bằng `hasTable`.

### 1.4 Tiêu chí xong
- [ ] Bật Switch + 90 ngày → gọi endpoint → log cũ hơn 90 ngày biến mất, log mới còn nguyên.
- [ ] Tắt Switch → gọi endpoint → không xoá gì.
- [ ] `tsc --noEmit`, `nest build`, `jest`, `vitest run`, `next build` đều pass (dán kết quả thật).

---

## PHASE 2 — Xoá theo nhiều khoảng chọn (A2)

**Mục tiêu:** chọn nhiều khoảng ngày rời nhau và xoá một lần; có xem trước; có ghi nhận.

- DTO mới `ranges: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }[]` — `@ArrayMinSize(1) @ArrayMaxSize(20)`, `from <= to`, từng khoảng không vượt trần (vd 366 ngày), **gộp các khoảng chồng lấn** trước khi chạy.
- Endpoint mới (giữ nguyên endpoint 1 khoảng cũ để không vỡ FE hiện tại):
  - `POST /audit/cleanup-ranges` · `POST /periodic-tasks/audit-logs/cleanup-ranges` (+ tuỳ chọn cho `attendance-logs` nếu muốn)
  - Tham số `dryRun=true` trả `{ perRange: [{from,to,count}], total }`.
- Thực thi trong **1 transaction**, **1 dòng audit** ghi toàn bộ danh sách khoảng + số dòng mỗi khoảng (`ADMIN_CLEANUP_AUDIT_LOGS_RANGES`).
- **Quan trọng:** xoá audit sẽ xoá luôn vết của chính hành động xoá nếu khoảng ngày bao phủ hôm nay → luôn ghi dòng audit *sau* khi xoá và **chặn khoảng có `to` ≥ hôm nay** (hoặc tự cắt tới hôm qua).
- Xoá theo lô trong từng khoảng (như 1.1) để không timeout.
- FE: bộ chọn nhiều `RangePicker` (thêm/bớt khoảng) → nút "Xem trước" hiện bảng số dòng từng khoảng → "Xác nhận xoá" (modal nhập lại số tổng dòng hoặc gõ "XOA").
- [ ] Spec: khoảng chồng lấn được gộp; khoảng ngược bị 400; dryRun không xoá; 1 audit duy nhất.

---

## PHASE 3 — Chặn brute-force theo IP + Admin reset + bắt buộc secret (A3, A4)

### 3.1 Throttle `/auth/login` theo IP (A3)

Vấn đề: một IP thử 1 mật khẩu thông dụng trên hàng trăm email thì khoá theo tài khoản không bắt được.

- [ ] Thêm `@UseGuards(ThrottlerBehindProxyGuard)` + `@Throttle` cho `POST /auth/login` (đề xuất 20 lần/10 phút/IP — **số cần bạn chốt**; nên cao hơn register vì văn phòng dùng chung 1 IP công ty).
- [ ] **Đếm theo cặp (IP, email) và theo IP riêng**: `ThrottlerGuard` mặc định lưu bộ nhớ từng instance serverless → **không đáng tin** trên Vercel. Vì vậy dùng **bảng DB** làm nguồn sự thật cho khoá IP.
- Bảng `login_ip_blocks` (migration `1786310000000`): `id, ip VARCHAR(45), failed_count INT, window_started_at DATETIME, blocked_until DATETIME NULL, last_email VARCHAR(255), distinct_emails INT, created_at, updated_at`, unique `uk_ip`.
- Quy tắc: IP sai ≥ N lần **hoặc** thử ≥ M email khác nhau trong cửa sổ → khoá IP X phút (cấp bậc tăng dần). So sánh thời gian bằng đồng hồ DB (`NOW()`), như `locked_until`.
- Đăng nhập thành công **không** reset khoá IP đang chạy (tránh kẻ tấn công dùng 1 tài khoản của chính mình để xoá đếm).
- Lưu `last_login_ip` (và `last_login_at` đã có) vào `users` để Admin xem (cột `last_login_ip VARCHAR(45) NULL`).
- Lấy IP: dùng đúng nguồn như `ThrottlerBehindProxyGuard` (`x-az-client-ip`, fallback `req.ip`). **Xác minh login đang đi đường nào** (xem 5b); nếu login gọi thẳng BE từ trình duyệt thì `req.ip` đã đúng, còn nếu qua route FE thì FE phải forward header.
- Thông báo 429 giữ `retryAfterSeconds` (FE đã có banner đếm ngược ở trang login).

### 3.2 Admin xem/Reset khoá IP

- [ ] `GET /security/ip-blocks` (đang bị khoá + lịch sử gần đây), `DELETE /security/ip-blocks/:ip` (mở khoá IP), ghi audit `UNBLOCK_LOGIN_IP`.
- [ ] Mở rộng "Mở khoá" tài khoản hiện có (`PATCH /users/:id/unlock-login`) để hiện thêm IP đăng nhập gần nhất; Admin có thể mở cả khoá IP lẫn khoá tài khoản.
- [ ] Quyền: tái dùng `users.manage` như nút "Mở khoá" hiện tại, **không tạo key mới** trừ khi cần tách (nếu tách → seed migration, nhớ bypass `role === 'admin'` ở cả 3 lớp theo quy ước RBAC).
- [ ] FE: tab/khối "IP bị khoá" ngay trong trang quản lý người dùng; đếm ngược dùng lại `useCountdown`.

### 3.3 Bắt buộc `JWT_REFRESH_SECRET` (A4)

- [ ] Bỏ fallback `'default-refresh-secret'` (`auth.service.ts` L44). Thêm kiểm tra **lúc khởi động** (trong `bootstrap()` hoặc `ConfigModule` validate): thiếu `JWT_SECRET` hoặc `JWT_REFRESH_SECRET`, hoặc giá trị ngắn (<32 ký tự) / bằng nhau → `throw` ngay, app không lên.
- [ ] Thống nhất L44 và L301 cùng đọc qua 1 getter duy nhất.
- [ ] ⚠️ **Trước khi deploy:** xác nhận biến đã có trên **cả Preview lẫn Production** của Vercel — fail-fast sẽ làm môi trường thiếu biến không khởi động được. Đây là mục dễ gây downtime nhất, deploy riêng, không kèm thay đổi khác.
- [ ] Spec: thiếu biến → ném lỗi; đủ biến → ký/verify khớp.

---

## PHASE 4 — Audit sự kiện bảo mật (C2, kéo lên) + Trang "Hoạt động bảo mật" (B3)

- [ ] Ghi audit cho: `LOGIN_FAILED`, `ACCOUNT_LOCKED`, `LOGIN_IP_BLOCKED`, `UNLOCK_LOGIN` (đã có), `UNBLOCK_LOGIN_IP`, `PASSWORD_CHANGE_FAILED`, `PASSWORD_CHANGED`, `FORCE_LOGOUT`, `SESSION_REVOKED`.
  - Hiện chỉ `USER_LOGIN` thành công có audit; các sự kiện trên chỉ có `logger.warn`.
  - Cẩn thận khối lượng ghi: `LOGIN_FAILED` do kẻ tấn công có thể làm phình `audit_logs` → **gộp**: chỉ ghi khi chạm ngưỡng khoá, hoặc tối đa 1 dòng/(IP, email)/phút. Không bao giờ ghi mật khẩu/token.
  - `audit_logs.user_id` hiện `NOT NULL` + FK `users` — đăng nhập sai với email không tồn tại không có user. Quyết định: ghi vào `metadata` với `user_id` hệ thống, hoặc cho phép `NULL` (cần migration). Chốt ở mục 8.
- [ ] Trang `/security-activity` (Admin): lọc theo loại sự kiện, IP, tài khoản, khoảng ngày; thẻ tổng hợp (số lần khoá hôm nay, IP bị khoá hiện tại); nút mở khoá nhanh. Dùng lại `paginateByWeek` như trang audit.
- [ ] Permission: tái dùng `audit.manage`; thêm menu sidebar bằng `can('audit.manage')`.
- [ ] Các bản ghi sự kiện bảo mật chịu retention ở Phase 1 (có thể đặt hạn dài hơn riêng, vd 180 ngày — chốt ở mục 8).

---

## PHASE 5 — Quản lý phiên & thiết bị (B1)

**Hiện trạng:** tối đa 10 phiên, nhưng slot chỉ có hash → chưa thể liệt kê "thiết bị".

### 5.1 Lựa chọn lưu trữ (cần quyết định)
- **Phương án A (khuyến nghị): bảng `user_sessions`** — `id (uuid), user_id, token_hash, device_label, user_agent, ip, created_at, last_used_at DATETIME, revoked_at NULL, revoked_by NULL`. Liệt kê/đăng xuất từng thiết bị bằng truy vấn đơn giản; không đụng giới hạn kích thước TEXT; đếm "đang đăng nhập trên bao nhiêu thiết bị" bằng `COUNT`.
- **Phương án B: mở rộng JSON v3** trong `hashed_refresh_token` (thêm `id, ua, ip, last` vào slot) — không cần bảng mới nhưng khó truy vấn tổng hợp toàn hệ thống (Admin xem ai đang online nhiều thiết bị).
- Khuyến nghị A, chuyển đổi êm: đọc song song store cũ trong cửa sổ chuyển tiếp (`LEGACY_GRACE` như util hiện có), giữ giới hạn 10 phiên/user (xoá phiên cũ nhất khi vượt).

### 5.2 Việc phải làm
- [ ] Phát hành `sid` (session id) trong access/refresh token; `JwtStrategy.validate()` (đã load user mỗi request) kiểm tra phiên chưa `revoked` → **đăng xuất cưỡng bức có hiệu lực ngay**, không đợi access token hết hạn. Cân nhắc cache ngắn 15–30 giây để tránh thêm 1 query mỗi request (liên quan tối ưu CPU đã làm ở `PLAN_CPU_OPTIMIZATION_ROUND2`).
- [ ] Endpoint người dùng: `GET /auth/sessions`, `DELETE /auth/sessions/:id`, `DELETE /auth/sessions` (đăng xuất mọi thiết bị khác). Đánh dấu "thiết bị hiện tại".
- [ ] Endpoint Admin: `GET /users/:id/sessions`, `DELETE /users/:id/sessions[/:sid]` (đăng xuất cưỡng bức 1 hoặc tất cả), có `canManageUser` như nút "Mở khoá"; audit `FORCE_LOGOUT`. Không cho Manager cưỡng bức đăng xuất Admin.
- [ ] Danh sách người dùng hiện cột "Số thiết bị" (1 query tổng hợp cho cả trang, giống `getLoginLockSecondsMap()`).
- [ ] FE: màn "Thiết bị đang đăng nhập" trong hồ sơ cá nhân; nút "Đăng xuất thiết bị" ở trang quản lý người dùng.
- [ ] Đổi mật khẩu / reset mật khẩu → thu hồi mọi phiên khác (nếu chưa làm vậy; kiểm tra code).
- [ ] Migration `1786320000000-CreateUserSessions`.

---

## PHASE 6 — Buộc đổi mật khẩu + hạn dùng mật khẩu (B2)

### 6.1 Quy tắc nghiệp vụ (theo yêu cầu)
- **Tự đăng ký** → không buộc đổi, mật khẩu không hết hạn.
- **Mọi trường hợp tài khoản do Admin hoặc role khác tạo**, và **sau khi Admin reset mật khẩu** → `must_change_password = true`: lần đăng nhập tiếp theo **bắt buộc** đổi mật khẩu.
- Form đổi: **3 trường** — *Mật khẩu được cấp*, *Mật khẩu mới*, *Nhập lại mật khẩu mới*.
- Hạn dùng mật khẩu **tuỳ chọn**: người tạo/reset chọn **Có hạn (N ngày)** hoặc **Vô hạn**. Hết hạn → buộc đổi lại.

### 6.2 Dữ liệu (migration `1786330000000`)
`users`: `must_change_password TINYINT(1) NOT NULL DEFAULT 0` (dùng `BooleanTransformer`), `password_changed_at DATETIME NULL`, `password_expires_at DATETIME NULL` (NULL = vô hạn). Backfill: mọi user hiện tại `must_change = 0`, `expires = NULL` (không ép người dùng cũ).

### 6.3 Việc phải làm
- [ ] BE: `create user` / `reset-password` nhận thêm `passwordExpiryDays?: number | null` (null/bỏ trống = vô hạn); đặt `must_change_password = true`, tính `password_expires_at`.
- [ ] Đăng nhập trả `mustChangePassword` (true nếu cờ bật **hoặc** `password_expires_at <= NOW()` theo đồng hồ DB).
- [ ] **Chặn ở BE, không chỉ ở FE:** guard toàn cục cho phép duy nhất `change-password`, `logout`, `me`, `refresh` khi `mustChangePassword`; mọi endpoint khác trả `403 PASSWORD_CHANGE_REQUIRED`. FE chỉ điều hướng sang trang đổi.
- [ ] `POST /auth/change-password-required`: xác thực mật khẩu được cấp; mật khẩu mới ≠ mật khẩu cũ; áp chính sách mật khẩu (xem C1); thành công → tắt cờ, đặt `password_changed_at`, tính hạn mới theo cấu hình đã chọn, thu hồi các phiên khác (Phase 5).
- [ ] FE: trang `/change-password-required` (3 trường), middleware/route guard đưa người dùng vào đó; dialog tạo/reset người dùng thêm lựa chọn "Hạn mật khẩu: Vô hạn / N ngày".
- [ ] Audit `PASSWORD_CHANGED` (không ghi giá trị mật khẩu).
- [ ] Spec: tự đăng ký không bị buộc; tạo bởi admin bị buộc; reset bị buộc; hết hạn bị buộc; vô hạn không bao giờ hết hạn; endpoint khác bị 403.

> **Gộp C1 vào phase này (rẻ, cùng chỗ):** đồng bộ chính sách mật khẩu — `register`/`reset-password` hiện ≥ 8 ký tự + regex, còn `change-password.dto.ts` chỉ `MinLength` 6 (đã thấy). Dùng chung 1 decorator/hằng số cho cả 3 DTO. Nếu bạn muốn **để sau** như đã ghi, tách mục này ra, nhưng khi làm 6.3 thì form đổi bắt buộc nên áp luôn mức 8 ký tự để không tạo mật khẩu yếu hơn mức admin cấp.

---

## PHASE 7 — Thao tác hàng loạt có Hoàn tác (B4)

- Phạm vi đầu tiên: **đổi trạng thái hàng loạt** và **chia lại sales hàng loạt** (khách hàng).
- Bảng `bulk_operations` (migration `1786340000000`): `id, type, actor_id, created_at, expires_at DATETIME, undone_at NULL, undone_by NULL, payload_before JSON, payload_after JSON, affected_count`.
- Luồng: lúc thao tác lưu **ảnh chụp trước** (id → trạng thái/sales cũ, kể cả bản ghi `customer_assignments`) trong cùng transaction; trả `operationId` + `expiresAt` (đề xuất **10 phút**, chốt ở mục 8).
- `POST /bulk-operations/:id/undo`: chỉ người thực hiện (hoặc admin); chưa hết hạn/chưa hoàn tác. **Kiểm tra xung đột**: bản ghi nào đã bị sửa sau thao tác (so `updated_at`) thì **bỏ qua và báo** thay vì ghi đè; kết quả `{restored, skipped}`.
- Thực hiện hoàn tác qua `merge()` + gán quan hệ tường minh (xem SKILL BE §13 về relation precedence), ghi audit `BULK_UNDO`.
- FE: toast "Đã cập nhật N khách hàng — **Hoàn tác** (còn 9:58)" dùng `useCountdown`; sau hết hạn nút biến mất.
- Dọn `bulk_operations` hết hạn bằng chính cron retention (Phase 1) — thêm đối tượng thứ 5.
- [ ] Spec: hoàn tác đúng; xung đột bị bỏ qua; hết hạn bị 410; người khác bị 403; quyền chia sales theo quy tắc Primary/Shared ở SKILL §12 vẫn được giữ khi hoàn tác.

---

## PHASE 8 — Trang "Sức khoẻ hệ thống" cho Root Admin (B5)

- Chỉ `role === 'admin'` cố định (Root Admin). Permission mới `system.health.view` **nếu muốn gate bằng quyền** → phải seed migration, giữ bypass admin ở 3 lớp; hoặc đơn giản dùng kiểm tra role admin ở BE + `isAdmin` ở FE (chốt ở mục 8).
- `GET /system/health` trả:
  - **Kích thước bảng + số dòng ước lượng** từ `information_schema.tables` (cache 5 phút; cảnh báo bảng > ngưỡng), đặc biệt `audit_logs`, `periodic_task_audit_logs`, `notifications`, `attendance_logs`.
  - **Cron gần nhất**: đọc `cron_runs` (Phase 1) — mỗi job: lần chạy cuối, trạng thái, số bản ghi, thời gian; cảnh báo nếu quá hạn (vd retention > 36 giờ chưa chạy).
  - **Cache**: số mục/đang dùng của cache thực tế trong code (cache quyền, ref-data…). **Cần xác định trước** repo đang có những cache nào (`ref-data-change.subscriber` gợi ý có cache dữ liệu tham chiếu) rồi mới đưa số liệu; trên serverless mỗi instance có cache riêng nên ghi rõ "tính theo instance hiện tại".
  - Phiên bản app, uptime instance, kết nối DB (ping), số user đang có phiên (từ Phase 5).
- FE: trang chỉ-đọc, thẻ + bảng, nút "Làm mới". Không có hành động nguy hiểm trên trang này.

---

## PHASE 9 — Xuất / nhập cấu hình JSON (B6)

- **Xuất**: phân quyền (`roles`, `permissions`, `role_permissions` kể cả **override theo phòng ban**), trạng thái khách hàng (`customer_statuses`), trạng thái task (`periodic_task_statuses`), danh mục/loại (leave types, link categories…), `positions`, `ui_visibility_rules`. **Không xuất** user, mật khẩu, token, `settings` chứa secret.
- **Khoá tự nhiên, không dùng id**: tham chiếu bằng `role.key`, `permission.key`, `department.name/code`, để nhân sang môi trường khác (id khác nhau) vẫn khớp.
- File có `schemaVersion`, `exportedAt`, `source`, và checksum.
- **Nhập** (2 bước): `POST /system/config/import?dryRun=true` trả **diff** (thêm/sửa/xoá) → xác nhận → áp dụng trong 1 transaction, ghi audit. Chặn nhập nếu `schemaVersion` không khớp hoặc **permission key không tồn tại** ở môi trường đích (tránh khoá vĩnh viễn endpoint — xem quy tắc RBAC mục 4). Luôn giữ bypass `admin`.
- Nhập ma trận quyền phải khai rõ lọc `department_id` (Toàn cục vs Override) — đây là điểm từng gây bug xoá nhầm override. Mặc định chế độ **gộp**, không xoá; chế độ "thay thế" phải xác nhận riêng.
- Chỉ Root Admin. FE: trang "Cấu hình hệ thống" có nút Xuất (tải file) và Nhập (upload + xem diff).
- [ ] Spec: round-trip xuất→nhập sang DB trống cho ra cùng ma trận; permission lạ bị từ chối; dryRun không ghi.

---

## PHASE 10 — `loading.tsx` / skeleton & khả năng truy cập (B7)

- [ ] Thêm `loading.tsx` ở `app/(dashboard)/` và các route nặng: customers, audit-logs, attendance-device, reports, lich-su-cong-viec. Skeleton dùng lại `LoadingSkeleton` có sẵn trong cấu trúc FE.
- [ ] Thêm `(dashboard)/error.tsx` nếu chưa có (đã nêu ở `PLAN_HARDENING.md`, tránh làm trùng — kiểm tra file đó trước).
- [ ] Rà `aria-*` cho bảng lớn: `aria-label` cho bảng/nút chỉ có icon, `aria-sort`, `aria-live` cho vùng thông báo tải/lỗi, focus rõ ràng, thứ tự Tab.
- [ ] Phím tắt (nếu trùng với "Ctrl+K" ở `PLAN_HARDENING` thì phối hợp, không làm 2 lần): `/` focus ô tìm kiếm, `←/→` đổi trang bảng, `Esc` đóng modal; hiển thị bảng tra phím tắt (`?`).
- [ ] Test: `vitest` + Testing Library kiểm `role`/`aria`; kiểm tra bằng mắt trên trình duyệt thật (jsdom không chạy được animation).

---

## PHÂN LOẠI "ĐỂ SAU" (ghi nhận, chưa làm)

| Mã | Nội dung | Ghi chú |
|---|---|---|
| C1 | Thống nhất chính sách mật khẩu (8 ký tự + regex cho cả tự đổi) | **Nếu làm Phase 6 thì nên làm kèm** (xem cuối Phase 6). Nếu không: người dùng vẫn có thể đổi xuống mật khẩu yếu hơn mức admin đặt. |
| C3 | Tách `customers.service.ts` (4297), `users.service.ts` (1729), `leave-requests.service.ts` (1396) | Tách theo nghiệp vụ như `customers-period-stats.service.ts`; mỗi lần 1 nhóm hàm, giữ nguyên public API, test xanh trước/sau. Làm **sau** Phase 1–5 để tránh xung đột merge trong `users.service.ts`. |
| C4 | Giảm `any` (~372 BE, ~288 FE) | Làm dần theo file đang sửa; bật `@typescript-eslint/no-explicit-any` ở mức `warn` rồi siết. Chưa đo lại số liệu. |
| C5 | Spec cho controller: `customers`, `leave-requests`, `users`, `roles`, `reports`, `zk-device` | Ưu tiên khoá **guard/route** (đúng `@RequirePermission` ở từng endpoint) — theo mẫu `periodic-tasks.controller.spec.ts`. |
| C6 | README gốc lỗi thời (Next 14, antd 5, roadmap 4 tuần) | `README_AZWORKBASE_PROJECT.md` đã có banner "tài liệu lịch sử"; cần cập nhật `README.md` gốc theo `package.json` thật. |

## KHÔNG LÀM

- **D1** `?secret=` / xoay secret / so sánh hằng thời gian cho cron cũ: bỏ qua theo quyết định (UptimeRobot free không gắn header). *Riêng endpoint cron MỚI ở Phase 1 vẫn nên so sánh bằng `timingSafeEqual` và hỗ trợ header — chi phí gần như bằng 0.*
- **D2** `npm audit` BE 4 moderate (`uuid` trong `exceljs`): rủi ro thấp; không hạ bản `exceljs` theo gợi ý npm (đã nêu ở `PLAN_HARDENING.md`).

## 2. Thứ tự & phụ thuộc

```
P1 Retention ─┬─> P2 Xoá nhiều khoảng
              ├─> P8 Sức khoẻ hệ thống (cần cron_runs)
              └─> P7 (dọn bulk_operations hết hạn)
P3 IP + secret ─> P4 Audit bảo mật + trang Hoạt động bảo mật
P5 Phiên/thiết bị ─> P6 Buộc đổi mật khẩu (thu hồi phiên sau đổi)
P9, P10 độc lập
```

Thứ tự đề xuất: **P1 → P2 → P3 → P4 → P5 → P6 → P7 → P8 → P9 → P10.** P3.3 (bắt buộc secret) deploy riêng và đầu tiên trong P3 vì rủi ro downtime.

## 3. Quy trình chung cho mọi phase

1. Mỗi phase = 1 nhánh/commit riêng, không kèm `[deploy]` cho tới khi test xong.
2. Pull code mới nhất trước khi làm (nhiều tài khoản cùng làm việc); đọc `WORKFLOW_LOG.md` phần cuối tránh làm trùng.
3. Trước khi sửa: đọc entity → DTO → controller liên quan (SKILL_FILE_MANAGEMENT §1.1).
4. Migration: timestamp lớn hơn số lớn nhất sau khi pull, `up()`/`down()` đối xứng, idempotent (`hasTable`/`hasColumn`), cột `string | null` khai `type: 'varchar'` tường minh, `synchronize: false`, **không tự chạy lên DB production** — chỉ đưa file để bạn chạy.
5. Permission mới: phải có migration seed **trước** khi dùng `@RequirePermission`; giữ bypass `role === 'admin'` ở `PermissionGuard`, `RolesService.getMyPermissions()` và mọi helper tự kiểm quyền; FE dùng `can('key')`, không hardcode role.
6. Thời gian nghiệp vụ dùng `DATETIME`, so sánh bằng đồng hồ DB; thời gian còn lại gửi dạng **số giây** cho FE.
7. Không dùng `console.log` ở BE (dùng `Logger`); không log token/mật khẩu.
8. Trước khi báo xong, chạy thật và dán kết quả: BE `npx tsc --noEmit`, `npx nest build`, `npx jest`; FE `npx tsc --noEmit`, `npx vitest run`, `next build`.
9. Xong phase → tick mục 9 và thêm 1 dòng vào `WORKFLOW_LOG.md`.

## 4. Rủi ro chính

| Rủi ro | Cách giảm |
|---|---|
| Xoá nhầm dữ liệu chấm công/audit | `dryRun` bắt buộc trước, mặc định attendance tắt, sàn tối thiểu ngày giữ, audit hành động xoá (ghi sau khi xoá) |
| Cron serverless timeout | Xoá theo lô có ngân sách thời gian, idempotent, chạy lặp lần sau |
| Fail-fast `JWT_REFRESH_SECRET` làm app không lên | Kiểm biến Preview + Production trước, deploy riêng |
| Throttle trên serverless không chia sẻ bộ nhớ | Khoá IP lưu bảng DB, không dựa `ThrottlerGuard` in-memory |
| Khoá nhầm cả văn phòng (chung IP) | Ngưỡng IP cao hơn ngưỡng tài khoản; Admin reset 1 chạm; khoá tăng dần, không vĩnh viễn |
| Cưỡng bức đăng xuất không có hiệu lực ngay | Kiểm `sid` ở `JwtStrategy.validate()` (+ cache ngắn) |
| Hoàn tác ghi đè dữ liệu người khác vừa sửa | So `updated_at`, bỏ qua bản ghi xung đột và báo |
| Nhập cấu hình khoá endpoint | Chặn permission key chưa tồn tại, dryRun diff, mặc định chế độ gộp |

## 5. Câu hỏi cần bạn chốt trước khi code

1. **Cách gọi cron retention:** UptimeRobot hàng ngày hay thêm vào `vercel.json` (gói Vercel đang dùng cho phép mấy cron)?
2. **Ngưỡng khoá IP:** số lần sai/IP và số email khác nhau/IP trong bao lâu thì khoá, khoá bao nhiêu phút?
3. **`audit_logs.user_id` NOT NULL:** cho phép `NULL` (migration) để ghi đăng nhập sai với email không tồn tại, hay gộp chỉ ghi khi chạm ngưỡng?
4. **Phiên:** chọn bảng `user_sessions` (khuyến nghị) hay mở rộng JSON?
5. **Hạn hoàn tác:** 10 phút có ổn không?
6. **Hạn giữ sự kiện bảo mật:** dùng chung 90 ngày hay dài hơn (vd 180 ngày)?
7. **Trang Sức khoẻ hệ thống:** gate bằng role admin cố định hay thêm permission mới?
8. **Phase 6:** làm kèm C1 (mật khẩu ≥ 8 ký tự cho đổi mật khẩu thường)?

## 6. Checklist tiến độ

- [ ] P1 Retention tự động (audit, task log, notifications, attendance) + Switch FE + `cron_runs`
- [ ] P2 Xoá theo nhiều khoảng (audit, task log)
- [ ] P3.1 Throttle login theo IP + bảng `login_ip_blocks` + `last_login_ip`
- [ ] P3.2 Admin xem/reset khoá IP
- [ ] P3.3 Bắt buộc `JWT_REFRESH_SECRET` (fail-fast)
- [ ] P4 Audit sự kiện bảo mật + trang "Hoạt động bảo mật"
- [ ] P5 Thiết bị đăng nhập + đăng xuất cưỡng bức + số thiết bị
- [ ] P6 Buộc đổi mật khẩu + hạn mật khẩu (+ C1)
- [ ] P7 Thao tác hàng loạt có Hoàn tác
- [ ] P8 Trang Sức khoẻ hệ thống
- [ ] P9 Xuất/nhập cấu hình JSON
- [ ] P10 `loading.tsx` + aria/phím tắt
- [ ] (Để sau) C3 tách service · C4 giảm `any` · C5 spec controller · C6 README gốc
