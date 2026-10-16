# AZ-Workbase — Backend (NestJS API)

> API server cho hệ thống quản lý dữ liệu Marketing & Khách hàng AZ-Workbase.
> Xem tài liệu tổng quan toàn dự án (kiến trúc, frontend...) tại [`../README.md`](../README.md).
> Xem quy tắc phân quyền chi tiết tại [`../AZ-Workbase Skills/PERMISSIONS.md`](../AZ-Workbase%20Skills/PERMISSIONS.md).

Stack: **NestJS 11+** · **TypeORM 0.3.x** · **MySQL 8** · **JWT (Passport)** · Deploy dạng **Vercel
Serverless Function** (xem `vercel.json`, `src/main.ts`).

---

## 1. Cài đặt & chạy local

```bash
npm install

# Tạo file .env.development (không commit) với tối thiểu các biến sau:
NODE_ENV=development
PORT=3001
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=root
DB_PASSWORD=your_password
DB_DATABASE=az_workbase
JWT_SECRET=your-jwt-secret
JWT_EXPIRES_IN=1h
JWT_REFRESH_SECRET=your-refresh-secret
JWT_REFRESH_EXPIRES_IN=7d
CORS_ORIGIN=http://localhost:3000

npm run start:dev       # http://localhost:3001, hot reload
# Swagger (API docs tự sinh từ decorator): http://localhost:3001/api/docs
```

### Swagger `/api/docs` — yêu cầu đăng nhập (PLAN_HARDENING P4)

Swagger (`/api/docs`, `/api/docs-json`, `/api/docs-yaml`) được bảo vệ bằng **Basic auth**: trình duyệt tự hiện hộp thoại, nhập **email + mật khẩu của tài khoản hệ thống**.
- Chỉ cho `role = admin` (role cố định), tài khoản phải `is_active`, không bị xoá/từ chối/chờ duyệt. Tài khoản khác hoặc sai mật khẩu -> `401`.
- Sai quá 5 lần / 15 phút / IP -> `429` (+ `Retry-After`). Bộ đếm nằm trong RAM từng instance nên trên Vercel chỉ là lớp giảm thiểu, không phải giới hạn tuyệt đối.
- Việc xác thực không tạo phiên đăng nhập: không lưu refresh token, không ghi `USER_LOGIN`. Thất bại được log bằng `Logger` (không log mật khẩu).
- `/swagger-auth.js` vẫn công khai (chỉ đọc token từ localStorage để pre-authorize nút "Authorize").
- Không cần biến môi trường mới. Tuỳ chọn: `SWAGGER_ENABLED=false` để tắt hẳn Swagger.
- Code: `src/common/security/swagger-basic-auth.middleware.ts`, `AuthService.verifySwaggerAdmin()`.

### Gom lỗi bằng Sentry (PLAN_HARDENING P5)

- `src/instrument.ts` khởi tạo Sentry, được `import` **đầu tiên** trong `main.ts`. `AllExceptionsFilter` chỉ gửi lỗi **5xx** (không gửi 4xx).
- Biến môi trường (Vercel, project Sentry của **BE**): `SENTRY_DSN`. Thiếu DSN hoặc không phải production -> Sentry tự tắt, không gửi gì. `release` lấy từ `VERCEL_GIT_COMMIT_SHA`.
- **Lọc PII bắt buộc** ở `common/observability/sentry-scrub.ts` (`beforeSend`): xoá request/user/extra, che SĐT/email/token trong message. Sửa file này phải chạy lại `sentry-scrub.spec.ts`.
- Trên Vercel, filter đợi `Sentry.flush(2000)` trước khi trả response 5xx (serverless có thể đóng băng hàm ngay sau response).
- **Test local:** `cp .env.sentry-local.example .env.sentry-local`, điền `SENTRY_DSN` của project BE **test**, chạy `npm run sentry:smoke` (`scripts/sentry-smoke.ts`). Script gửi 1 event giả chứa PII qua đúng `scrubEvent`, in event đã lọc, và báo mã HTTP thật từ Sentry (`Sentry.flush()` trả `true` cả khi mạng bị chặn nên không dùng để kết luận). Event có `environment:local`.

### Database Migrations (BẮT BUỘC — không sửa schema DB thủ công)

```bash
npm run migration:show                          # Xem migration nào đã/chưa chạy
npm run migration:run                            # Chạy các migration mới
npm run migration:revert                         # Hoàn tác migration gần nhất
npm run migration:generate --name=TenMigration    # Tự sinh migration từ thay đổi entity (kiểm tra kỹ output trước khi commit)
```

Mọi migration nằm ở `src/database/migrations/`, đặt tên theo timestamp tăng dần
(`<epoch_ms>-MoTaNgan.ts`). Xem `AZ-Workbase Skills/SKILL_DATABASE_MANAGEMENT.md` để biết quy ước chi
tiết (idempotent bằng `hasColumn`/`hasTable`, luôn viết cả `up()` lẫn `down()`...).

### Test

```bash
npm run test          # Unit test (Jest) — chạy TRƯỚC khi commit bất kỳ thay đổi logic nào
npm run test:watch
npm run test:cov
npm run test:e2e
```

Quy ước: mỗi service quan trọng có file `*.service.spec.ts` cạnh nó (mock Repository qua
`getRepositoryToken`), logic phân quyền thuần (không phụ thuộc DB) tách ra `helpers/*.helper.ts` kèm
`*.helper.spec.ts` riêng để test nhanh, không cần mock TypeORM — xem
`modules/customers/helpers/customer-access.helper.spec.ts` và
`modules/link-groups/helpers/link-group-access.helper.spec.ts` làm ví dụ mẫu.

---

## 2. Cấu trúc thư mục

> Cây chỉ nêu các cấp quan trọng; danh sách đầy đủ luôn lấy bằng `ls` (đã nhiều lần lỗi thời).

```
backend/src/
├── common/
│   ├── decorators/      # @RequirePermission(), @GetPermissionScope(), @GetUser(), @AllowWhenPasswordChangeRequired()
│   ├── enums/            # Role, AssignmentStatus, ApprovalStatus, AttendanceSource, PeriodType...
│   ├── filters/           # Global exception filter (chuẩn hoá response lỗi; gửi 5xx lên Sentry)
│   ├── guards/            # JwtAuthGuard, PermissionGuard (RBAC động), RootAdminGuard, ThrottlerBehindProxyGuard
│   ├── interceptors/       # CacheControlInterceptor (revalidate qua ETag), PasswordChangeRequiredInterceptor
│   ├── logger/, middleware/ # QuietBootLogger, cpu-timing
│   ├── observability/      # Sentry (instrument + lọc PII), boot/DB-connection timing
│   ├── security/           # IP access log / whitelist / blacklist / block, IP geo, security headers, Swagger Basic auth, SecurityController
│   ├── validators/          # password-policy (chính sách mật khẩu dùng chung)
│   └── utils/               # date-vn, auth-user-cache, cache-probe-registry, keepalive-gate, ...
├── config/
│   └── database.config.ts  # Cấu hình TypeORM (đọc từ biến môi trường)
├── database/
│   ├── entities/            # ⭐ ĐỌC TRƯỚC khi sửa bất kỳ field nào ở Frontend
│   ├── migrations/          # Toàn bộ thay đổi schema — xem mục 1
│   └── seeds/, import/       # Script seed dữ liệu mẫu, backfill, import Excel/CSV marketing data
├── integrations/
│   └── zk-device/            # Giao thức TCP thô của máy chấm công ZKTeco (KHÔNG qua NestJS DI, chạy độc lập)
├── modules/                  # 1 module = 1 domain nghiệp vụ, xem bảng mục 3
├── app.controller.ts          # Landing page tại "/"
└── main.ts                    # Bootstrap: CORS, Swagger, ValidationPipe, cache Express app cho Vercel serverless
```

### Script tiện ích & cron

```bash
npm run guides:sync          # Đồng bộ guides-content/*.md -> DB (dry-run trước, rồi thêm --apply; báo XUNG ĐỘT nếu DB đã sửa tay trên UI)
npm run templates:generate    # Sinh file mẫu import Excel
npm run seed | seed:customers | seed:backfill | seed:users | utm:backfill | audit:redact-secrets
npm run import:data | import:clear | import:full
npm run zk:test | b2:test-presign | sentry:smoke
```

Cron (Vercel, khai trong `vercel.json`): `/api/zk-device-cron/sync-today` (T2–T6 10:00) và
`/api/periodic-tasks-cron/auto-overdue` (T2–T6 02:00). Endpoint `/api/system-cron/retention` (Retention) KHÔNG nằm trong
`vercel.json` — gọi từ ngoài, bắt buộc secret `CRON_SECRET` qua header `x-cron-secret` hoặc `Authorization: Bearer`.

---

## 3. Danh sách module (`src/modules/`)

> Trạng thái/quy tắc phân quyền của từng module: xem [`PERMISSIONS.md`](../AZ-Workbase%20Skills/PERMISSIONS.md) mục 2
> (nguồn sự thật duy nhất — không lặp lại ở đây để khỏi lệch).

| Module | Mô tả |
|---|---|
| `auth/` | Đăng nhập, đăng ký, JWT access + refresh token rotation, reuse detection, buộc đổi mật khẩu |
| `users/` | CRUD nhân viên, profile cá nhân, duyệt/từ chối tài khoản đăng ký, phiên đăng nhập (`:id/sessions`) |
| `customers/` | CRUD khách hàng, chia data, gán/thu hồi, ghi chú, deposit, import/export Excel — pattern mẫu cho module khác |
| `customer-statuses/` | Danh mục status khách |
| `assignment-groups/` | Nhóm phân công (cấu hình theo phòng ban / vị trí) |
| `bulk-operations/` | Ghi nhận thao tác hàng loạt + hoàn tác ≤ 5 phút (handler: `CUSTOMER_STATUS`, `CUSTOMER_ASSIGN`) |
| `departments/`, `positions/` | Phòng ban (`manager_user_id` làm mốc scope Manager), vị trí (tầng override quyền thứ 3) |
| `roles/`, `permissions/`, `ui-visibility/` | RBAC động: role, `role_permissions`, override phòng ban/vị trí, cache phiên bản permission, ẩn UI theo role |
| `leave-requests/`, `leave-types/` | Xin nghỉ phép, duyệt chéo phòng ban theo `RolePriority`, loại phép |
| `link-groups/` | Category/Group liên kết, checklist đã-join, Quản lý chính/phụ theo Group |
| `media-sources/` | Danh mục "Nguồn" cho form khách hàng |
| `utms/` | Quản lý UTM, quản lý chính/phụ, thống kê, tích hợp khách hàng |
| `periodic-tasks/`, `periodic-task-statuses/` | Công việc định kỳ (checklist, người phụ, audit, auto-overdue), trạng thái, hiệu suất |
| `notifications/` | Hộp thư cá nhân, catalog thông báo, thông báo thủ công (broadcasts) |
| `guides/` | Hướng dẫn sử dụng (Markdown trong DB; phạm vi xem theo role/vị trí/phòng ban/permission; sync từ `guides-content/`) |
| `reports/` | Báo cáo doanh số, chất lượng data, marketing, drill-down chi tiết |
| `storage/`, `uploads/` | Dung lượng + thư viện media, presigned upload Backblaze B2 (avatar, file đính kèm nghỉ phép) |
| `sidebar-badges/` | Poll/badge gộp cho sidebar (giảm số request) |
| `retention/` | Dọn dữ liệu cũ tự động (`audit_logs`, `task_audit_logs`, `notifications`, `attendance_logs`, `security_events`, `ip_access_logs`; luôn dọn thêm `bulk_operations` quá hạn hoàn tác), cấu hình chu kỳ |
| `system/` | Sức khoẻ hệ thống (`GET /system/health`) và Reset hệ thống — chỉ Root Admin (`RootAdminGuard`) |
| `zk-device/` | Chấm công: kéo chủ động qua TCP, nhận đẩy ADMS (`adms.controller.ts`, KHÔNG qua JWT), cron đồng bộ |
| `attendance-export/` | Xuất báo cáo chấm công |
| `audit/` | Nhật ký audit log |
| `deposits/` | Chỉ có `deposits.module.ts` — logic nạp tiền thực tế nằm trong `customers/` |

Ngoài `modules/`, phần bảo mật dùng chung nằm ở `common/security/` (IP access, whitelist/blacklist, `SecurityController`
tại `/api/security/*`).

---

## 4. Các quy ước quan trọng cần biết trước khi sửa code

- **Giờ Việt Nam (GMT+7) lưu "nguyên văn", KHÔNG quy đổi UTC.** `record_time` (chấm công) và các cột
  ngày-giờ liên quan lưu đúng 6 con số local (năm/tháng/ngày/giờ/phút/giây) đọc trực tiếp từ nguồn (máy
  chấm công hoặc giờ hệ thống VN), bất kể server chạy múi giờ gì. Lý do: `node-zklib` giải mã giờ bằng
  `new Date(y,m,d,h,mi,s)` — phụ thuộc múi giờ TIẾN TRÌNH đang chạy, gây lệch giờ nếu quy đổi UTC trên
  server không đặt GMT+7 (bug đã xảy ra thật, xem `integrations/zk-device/decode-device-time.util.ts` để
  hiểu chi tiết + cách vá).
- **Đọc log chấm công lớn qua WAN phải TUẦN TỰ, không bắn hết chunk cùng lúc** —
  `integrations/zk-device/sequential-attendance-reader.util.ts` thay thế `zk.getAttendances()` gốc của
  `node-zklib` (bắn hết request đồng thời, dễ rớt gói/timeout qua kết nối chậm) bằng cách xin từng
  chunk, có retry riêng cho từng chunk. Có bộ test giả lập giao thức thật ở
  `integrations/zk-device/__tests__/` — chạy `npm test -- sequential-attendance-reader` trước khi sửa
  gì liên quan tới đọc log chấm công.
- **Cache-Control cho resource hay bị sửa dùng `no-cache` (revalidate qua ETag), KHÔNG dùng `max-age`
  mù.** Xem `common/interceptors/cache-control.interceptor.ts` — từng có bug data mới sửa không hiện
  trên UI cho tới khi hard-refresh, do cache `max-age=30` phục vụ response cũ dù đã sửa xong.
- **`Cannot update entity because entity id is not set`** khi bulk-insert kèm `.orIgnore()` — TypeORM cố
  refetch giá trị cột generated (`@CreateDateColumn`...) sau insert, vỡ khi có row bị ignore do trùng
  key (MySQL không trả insertId liên tục). Luôn thêm `.updateEntity(false)` vào
  `createQueryBuilder().insert()...` khi dùng kèm `.orIgnore()` cho bulk insert — xem
  `zk-device.service.ts` (`syncNow()`, `ingestPushAttendance()`) làm ví dụ.
- **RBAC**: đọc `AZ-Workbase Skills/PERMISSIONS.md` TRƯỚC khi thêm bất kỳ `@Roles()` mới nào — không tự
  suy đoán rule, không copy decorator từ module khác nếu chưa xác nhận module đó đã khớp rule hiện hành.

- **Chính sách mật khẩu** nằm MỘT chỗ: `common/validators/password-policy.ts` (dùng ở 5 DTO). Đừng tự thêm regex mật khẩu riêng
  vào DTO mới. Hạn mật khẩu tính theo `NOW()` của DB; người bị buộc đổi (`must_change_password`) chỉ gọi được route gắn
  `@AllowWhenPasswordChangeRequired()`.
- **Hoàn tác hàng loạt**: thao tác mới muốn hỗ trợ undo phải ghi bản ghi `bulk_operations` TRONG CÙNG transaction và đăng ký
  handler (xem `modules/bulk-operations`); `undo()` khoá hàng bằng `FOR UPDATE`, hạn `expires_at` theo giờ DB.
- **Route hardcode Root Admin** (`/system/health`, `/system/reset`) dùng `RootAdminGuard`, không dùng `@RequirePermission`.

---

## 5. Deploy

Deploy dạng Vercel Serverless Function (xem `vercel.json`, `src/main.ts` — Express app được cache theo
container để tránh cold start lặp lại DI container mỗi request). Đường dẫn ADMS Push (`/iclock/cdata`)
KHÔNG có prefix `/api` vì máy chấm công gọi cứng đường dẫn gốc, không cấu hình được prefix.

Biến môi trường production cần thêm (ngoài các biến local ở mục 1): `VERCEL_URL`, `FRONTEND_URL` (CORS
whitelist động).