# AZ-Workbase CRM System

> **Hệ thống Quản lý Dữ liệu Marketing & Khách hàng cho doanh nghiệp.**
> Stack: **Next.js 16** (Frontend) + **NestJS 11** (Backend) + **MySQL** (Database)

---

## 🏗 Tech Stack

| Layer | Technology | Version | Port |
|---|---|---|---|
| Frontend | Next.js (App Router) | 16.x | 3000 |
| UI Library | Ant Design | 6.x | — |
| State | Zustand + React Query | Latest | — |
| Backend | NestJS (TypeScript) | 11+ | 3001 |
| ORM | TypeORM | 0.3.x | — |
| Database | MySQL | 8.x | 3306 |
| Auth | JWT (Passport) + Bcrypt | — | — |

---

## 📁 Cấu trúc thư mục

> Cây dưới đây chỉ nêu các cấp quan trọng — danh sách đầy đủ đã nhiều lần lỗi thời, luôn lấy bằng lệnh:
> `ls backend/src/modules`, `ls backend/src/database/entities`, `ls backend/src/database/migrations | sort | tail`,
> `ls "frontend/src/app/(dashboard)"`.

```
AZ-Workbase/
├── backend/                        # NestJS API Server (deploy: Vercel Serverless Function, cron khai trong vercel.json)
│   ├── src/
│   │   ├── common/
│   │   │   ├── decorators/         # @RequirePermission(), @GetPermissionScope(), @GetUser(), @AllowWhenPasswordChangeRequired()
│   │   │   ├── guards/             # JwtAuthGuard, PermissionGuard (RBAC động), RootAdminGuard, ThrottlerBehindProxyGuard
│   │   │   ├── interceptors/       # CacheControl (ETag), PasswordChangeRequired
│   │   │   ├── security/           # IP access log / whitelist / blacklist / block, IP geo, Swagger Basic auth, SecurityController
│   │   │   ├── observability/      # Sentry (lọc PII), boot/DB timing
│   │   │   ├── validators/         # password-policy (dùng chung cho 5 DTO mật khẩu)
│   │   │   └── enums/, filters/, logger/, middleware/, utils/
│   │   ├── config/                 # Cấu hình TypeORM
│   │   ├── database/
│   │   │   ├── entities/           # ⭐ Luôn đọc trước khi sửa Frontend
│   │   │   ├── migrations/         # Bắt buộc, không sửa DB thủ công
│   │   │   └── seeds/, import/     # Seed / backfill / import Excel
│   │   ├── integrations/zk-device/ # Kết nối trực tiếp máy chấm công ZKTeco (TCP thô)
│   │   ├── modules/                # 1 module = 1 domain — bảng đầy đủ ở mục "Module & API chính" bên dưới
│   │   └── main.ts                 # Bootstrap (CORS, Swagger, Pipes) + Vercel serverless handler
│   ├── scripts/                    # guides-sync, generate-import-templates, sentry-smoke, test-b2-presign... (KHÔNG phải code sản phẩm)
│   └── .env.development            # ⚠️ Không commit
│
├── frontend/                       # Next.js 16 App
│   ├── src/
│   │   ├── app/(auth)/             # login, register, account-status, change-password-required
│   │   ├── app/(dashboard)/        # Các trang sau login, route đặt tên tiếng Việt (danh sách: frontend/README.md)
│   │   ├── components/             # common, customers, guides, leave-requests, link-groups, notifications, periodic-tasks, security, sessions, system, users, utms, audit
│   │   ├── lib/                    # api (1 file / module BE), hooks, stores, types, permissions, guides, observability, utils
│   │   ├── lib/nav-config.tsx      # ⭐ Sidebar/menu + gate quyền theo permission
│   │   └── proxy.ts                # ⭐ Route protection (Next.js 16 đổi tên từ middleware.ts)
│   └── .env.local                  # ⚠️ Không commit (NEXT_PUBLIC_API_URL...)
│
├── guides-content/                 # Nội dung Markdown cho trang "Hướng dẫn sử dụng" — đồng bộ lên DB bằng `npm run guides:sync` (backend/; dry-run trước, rồi `--apply`)
│
└── AZ-Workbase Skills/             # 🤖 Tài liệu cho AI Agent
    ├── PERMISSIONS.md              # ⭐ Nguồn chân lý phân quyền (RBAC)
    ├── SKILL_FILE_MANAGEMENT.md, SKILL_DATABASE_MANAGEMENT.md, SKILL_NESTJS_BACKEND.md, SKILL_NEXTJS_FRONTEND.md
    ├── PLAN_*.md                   # Kế hoạch theo từng tính năng — trạng thái ghi ở đầu mỗi file
    ├── README_AZWORKBASE_PROJECT.md# ⚠️ Roadmap gốc (lịch sử), không phản ánh tiến độ thật
    └── WORKFLOW_LOG.md             # Nhật ký thay đổi (chỉ APPEND, không sửa entry cũ)
```

---

## 🚀 Hướng dẫn chạy local

### 1. Backend (NestJS)
```bash
cd backend
npm install
# Tạo file .env.development (xem .env.development.example)
npm run start:dev       # Chạy trên http://localhost:3001
# Swagger Docs: http://localhost:3001/api/docs

# Database Migrations
npm run migration:show    # Xem trạng thái migrations
npm run migration:run     # Chạy migrations mới
npm run migration:revert  # Hoàn tác migration gần nhất

# Backblaze B2 (upload avatar/file đính kèm — xem AZ-Workbase Skills/PLAN_AVATAR_LEAVE_ATTACHMENT_BACKBLAZE_B2.md)
# Điền đủ biến B2_* vào .env.development (xem .env.development.example) trước khi chạy:
npm run b2:test-presign   # Test presigned PUT/GET URL lên B2 (đọc riêng .env.development, không qua ConfigModule)
```

### 2. Frontend (Next.js)
```bash
cd frontend
npm install
# Tạo file .env.local với:
# NEXT_PUBLIC_API_URL=http://localhost:3001/api
npm run dev             # Chạy trên http://localhost:3000
```

### 🛡️ Security Features
- **Refresh Token Rotation**: Mỗi khi refresh token được sử dụng, một cặp token mới sẽ được phát và token cũ bị thu hồi.
- **Reuse Detection**: Nếu một Refresh Token cũ được sử dụng lại (nghi ngờ bị đánh cắp), hệ thống sẽ ngay lập tức thu hồi TOÀN BỘ các phiên đăng nhập của người dùng đó (Single-session enforcement).
- **Password Hashing**: Sử dụng Bcrypt (10 rounds).
- **RBAC động**: quyền tra từ bảng `role_permissions` qua `@RequirePermission()` + `PermissionGuard` (xem mục Phân quyền bên dưới).
- **Chính sách mật khẩu thống nhất** (`common/validators/password-policy.ts`, tối thiểu 8 ký tự) cho đăng ký / tạo / reset / đổi mật khẩu; có hạn mật khẩu và **buộc đổi mật khẩu** (`PasswordChangeRequiredInterceptor`, trang `/change-password-required`).
- **Phiên đăng nhập**: xem thiết bị & đăng xuất cưỡng bức nhân viên (permission `users.sessions`).
- **Theo dõi IP**: log IP đăng nhập/gọi API, whitelist / blacklist / khoá IP (`/api/security/*`, trang `/security-activity`).
- **Swagger** `/api/docs` nằm sau Basic auth (chỉ `role = admin`); đặt `SWAGGER_ENABLED=false` để tắt hẳn. **Sentry** gom lỗi 5xx (lọc PII) ở cả BE và FE.
- **Hoàn tác thao tác hàng loạt** trong 5 phút (`modules/bulk-operations`); **Retention** tự động dọn dữ liệu cũ (`modules/retention`); trang **Sức khoẻ hệ thống** chỉ Root Admin.

### Environment Variables cần thiết (Backend):
```env
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

# Backblaze B2 (S3-compatible) — bắt buộc nếu chạy npm run b2:test-presign hoặc module uploads
B2_ENDPOINT=https://s3.us-west-004.backblazeb2.com
B2_REGION=us-west-004
B2_ACCESS_KEY_ID=your_key_id
B2_SECRET_ACCESS_KEY=your_application_key
B2_BUCKET_AVATARS=az-imgs-avatars-workbase
B2_BUCKET_LEAVE_ATTACHMENTS=az-imgs-leave-request-workbase
```
> Danh sách đầy đủ (bao gồm `ZK_DEVICE_*`, `CRON_SECRET`, `SENTRY_DSN`, `SWAGGER_ENABLED`...) luôn xem `backend/.env.development.example` — bảng trên chỉ liệt kê phần cốt lõi để chạy được app.

---

## 🔐 Phân quyền (RBAC)

> **Nguồn chân lý đầy đủ:** [`AZ-Workbase Skills/PERMISSIONS.md`](<./AZ-Workbase%20Skills/PERMISSIONS.md>)
> — bảng dưới đây chỉ là tóm tắt nhanh, có thay đổi rule luôn sửa ở file PERMISSIONS.md trước.

**Cơ chế hiện tại là RBAC động** — không còn `@Roles()` tĩnh ở controller:
- `role` cố định (`admin`, `assistant`, `manager`, `employee`) cùng role tuỳ chỉnh; quyền nằm ở bảng `permissions` / `role_permissions`, route khai bằng `@RequirePermission('resource.action')`.
- Ma trận nhiều tầng: **Toàn cục** → override theo **phòng ban** → override theo **vị trí** (ưu tiên cao nhất) — PERMISSIONS.md §1.7, §1.8. Mỗi permission có scope dữ liệu (vd `all`, `department`) lấy qua `@GetPermissionScope()`.
- `role = admin` luôn có lối thoát hiểm; route hardcode Root Admin (`RootAdminGuard`: reset hệ thống, sức khoẻ hệ thống) không nằm trong ma trận.
- FE ẩn/hiện UI bằng `can('permission.key')` (hook `useMyPermissions`), KHÔNG hardcode `role === 'admin'`. BE luôn là nơi chặn thật.

Bảng dưới là **rule scope dữ liệu gốc** (PERMISSIONS.md §1); ma trận thật có thể đã được chỉnh ở trang Phân quyền.

| Role | Xem (View) | Sửa (Create/Update) | Xoá |
|---|---|---|---|
| `admin` | Toàn bộ, mọi phòng ban | Toàn bộ | ✅ |
| `assistant` | Toàn bộ, **bất chấp phòng ban** (ngang admin) | Toàn bộ (ngang admin) | ❌ — chỉ khác admin đúng 1 điểm này |
| `manager` | Chỉ phòng ban **mình đang quản lý** (`department.manager_user_id = mình`) | Chỉ phòng ban mình quản lý | ❌ |
| `employee` | Chỉ dữ liệu của **bản thân** (tự tạo / sales chính / đang được gán) | Chỉ dữ liệu của bản thân | ❌ |

Rule áp dụng thống nhất cho **mọi module** (khách hàng, chấm công, quản lý nhân viên, khoá tài khoản,
đổi mật khẩu, nhóm liên kết...) — không có ngoại lệ ngầm định theo module. Trạng thái rà soát/khớp rule
của từng module cụ thể xem PERMISSIONS.md mục 2.

---

## 🤖 Hướng dẫn sử dụng AI Agent

Agent đã được trang bị bộ Skills tại thư mục `AZ-Workbase Skills/`. Để sử dụng hiệu quả:

### Ra lệnh cho Agent:

| Mục tiêu | Câu lệnh |
|---|---|
| Fix bug cụ thể | `"Fix lỗi [mô tả]. File liên quan: [path]"` |
| Kiểm tra trước khi sửa | `"Audit module [tên] trước khi tôi thay đổi"` |
| Đồng bộ DB với UI | `"Đồng bộ trường [X] từ entity sang Frontend display"` |
| Ghi nhật ký | `"Log this action"` hoặc `"Ghi nhận quy trình này"` |
| Review thay đổi | `"Review và giải thích toàn bộ thay đổi hôm nay"` |

### Nguyên tắc Agent luôn tuân theo:
1. **Đọc entity trước** — Không bao giờ giả định kiểu dữ liệu.
2. **Kiểm tra DTO** — Không gửi field không được khai báo.
3. **Không xóa Hash mật khẩu** — Chỉ hash nếu có password mới.
4. **Không auto-commit** — Luôn để người dùng review trước khi git commit.
5. **Đọc `PERMISSIONS.md` trước khi thêm/sửa bất kỳ `@Roles()` hoặc điều kiện ẩn/hiện UI theo role nào**
   — không tự suy đoán rule, không copy decorator từ module khác nếu chưa xác nhận module đó đã khớp.

---

## 📌 Module & API chính

> Danh sách đầy đủ + chi tiết request/response: Swagger tại `http://localhost:3001/api/docs` (local, cần đăng nhập admin)
> hoặc domain backend + `/api/docs` (production). Bảng dưới đây chỉ liệt kê nhóm endpoint chính.

| Module | Base path | Mô tả ngắn |
|---|---|---|
| Auth | `/api/auth/*` | `login`, `register`, `refresh`, `change-password-required` — JWT access + refresh token rotation |
| Users | `/api/users/*` | CRUD nhân viên, profile, duyệt/từ chối tài khoản đăng ký, phiên đăng nhập (`:id/sessions`) |
| Customers | `/api/customers/*` | CRUD khách hàng, chia data, gán/thu hồi, ghi chú, deposit, import/export Excel |
| Customer Statuses | `/api/customer-statuses/*` | Danh mục status khách |
| Assignment Groups | `/api/assignment-groups/*` | Nhóm phân công (cấu hình theo phòng ban / vị trí) |
| Bulk Operations | `/api/bulk-operations/:id/undo` | Hoàn tác thao tác hàng loạt (≤ 5 phút) |
| Departments / Positions | `/api/departments/*`, `/api/positions/*` | Phòng ban, vị trí |
| Roles & UI Visibility | `/api/roles/*`, `/api/ui-visibility/*` | RBAC động: role, ma trận permission, override phòng ban/vị trí, ẩn UI theo role |
| Leave Requests / Types | `/api/leave-requests/*`, `/api/leave-types/*` | Xin nghỉ phép, duyệt đơn, loại phép |
| Link Groups | `/api/link-categories/*`, `/api/link-groups/*` | Category/Group liên kết, checklist đã-join, quản lý chính/phụ |
| Media Sources | `/api/media-sources/*` | Danh mục "Nguồn" khách hàng |
| UTMs | `/api/utms/*` | Quản lý UTM, quản lý chính/phụ, tích hợp khách hàng |
| Periodic Tasks | `/api/periodic-tasks/*`, `/api/periodic-task-statuses/*`, `/api/periodic-tasks-performance/*` | Công việc định kỳ, trạng thái, hiệu suất; cron `/api/periodic-tasks-cron/auto-overdue` |
| Notifications | `/api/notifications/*`, `/api/notification-broadcasts/*` | Hộp thư cá nhân + thông báo thủ công |
| Guides | `/api/guides/*` | Hướng dẫn sử dụng (lọc theo role / vị trí / phòng ban / permission) |
| Reports | `/api/reports/*` | Báo cáo tổng hợp (doanh số, chất lượng data, marketing) |
| Storage / Uploads | `/api/storage/*`, `/api/uploads/*` | Dung lượng + thư viện media (Backblaze B2), presigned upload |
| Sidebar | `/api/sidebar/poll`, `/api/sidebar/badges` | Badge/poll gộp cho sidebar |
| Security | `/api/security/*` | IP whitelist / blacklist / block / geo / access log |
| System | `/api/system/health`, `/api/system/reset`, `/api/system/retention-settings` | Sức khoẻ hệ thống, reset (Root Admin), cấu hình Retention; cron `/api/system-cron/retention` |
| ZK Device | `/api/zk-device/*`, `/iclock/*`, `/api/zk-device-cron/*` | Đồng bộ chấm công (kéo chủ động + ADMS push + cron) |
| Attendance Export | `/api/attendance-export/*` | Xuất báo cáo chấm công |
| Audit | `/api/audit-logs/*` | Nhật ký audit log |
| Hạ tầng | `/api/ping`, `/api/keep-alive`, `/api/public/*` | Endpoint nhẹ cho health-check / keep-alive (xem controller tương ứng) |

Xem chi tiết cấu trúc từng module tại [`backend/README.md`](./backend/README.md) và
[`frontend/README.md`](./frontend/README.md).
