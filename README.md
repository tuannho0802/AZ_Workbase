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

```
AZ-Workbase/
│
├── backend/                        # NestJS API Server (deploy: Vercel Serverless Function)
│   ├── src/
│   │   ├── common/
│   │   │   ├── decorators/         # @Roles(), @GetUser()
│   │   │   ├── enums/              # Role enum
│   │   │   ├── filters/            # Global exception filter
│   │   │   └── guards/             # JwtAuthGuard, RolesGuard
│   │   ├── config/
│   │   │   └── database.config.ts  # TypeORM configuration
│   │   ├── database/
│   │   │   ├── entities/           # ⭐ Luôn đọc trước khi sửa Frontend
│   │   │   │   ├── user.entity.ts
│   │   │   │   ├── customer.entity.ts, customer-assignment.entity.ts, customer-note.entity.ts, customer-group-membership.entity.ts
│   │   │   │   ├── department.entity.ts
│   │   │   │   ├── deposit.entity.ts
│   │   │   │   ├── leave-request.entity.ts
│   │   │   │   ├── link-category.entity.ts, link-group.entity.ts, link-group-secondary-manager.entity.ts
│   │   │   │   ├── media-source.entity.ts
│   │   │   │   ├── attendance-log.entity.ts, zk-device-user-cache.entity.ts
│   │   │   │   ├── audit-log.entity.ts
│   │   │   │   └── setting.entity.ts
│   │   │   ├── migrations/         # Schema migrations (bắt buộc, không sửa DB thủ công)
│   │   │   └── seeds/              # Dữ liệu mẫu / import script
│   │   ├── integrations/
│   │   │   └── zk-device/          # Kết nối trực tiếp máy chấm công ZKTeco (giao thức TCP thô)
│   │   ├── modules/
│   │   │   ├── auth/               # Login, JWT, Refresh Token rotation
│   │   │   ├── users/              # CRUD nhân viên, Profile cá nhân (RBAC — xem PERMISSIONS.md §2.2)
│   │   │   ├── customers/          # CRUD khách hàng, Chia Data, Gán/Thu hồi (RBAC — xem PERMISSIONS.md §2.1, ĐÃ CHUẨN)
│   │   │   ├── departments/        # Quản lý phòng ban (manager_user_id dùng cho scope RBAC)
│   │   │   ├── deposits/           # Quản lý nạp tiền (FTD) của khách
│   │   │   ├── leave-requests/     # Xin nghỉ phép + duyệt theo cấp bậc
│   │   │   ├── link-groups/        # Category/Group liên kết (Zalo/FB/Threads...) + checklist đã-join
│   │   │   ├── media-sources/      # Danh mục "Nguồn" (Facebook/TikTok/Google...) cho form khách hàng
│   │   │   ├── zk-device/          # Đồng bộ chấm công từ máy ZKTeco (pull + ADMS push)
│   │   │   └── audit/              # Nhật ký audit log (ai làm gì, khi nào)
│   │   ├── app.controller.ts       # Landing page tại "/"
│   │   └── main.ts                 # Bootstrap (CORS, Swagger, Pipes) + Vercel serverless handler
│   └── .env.development            # ⚠️ Không commit
│
├── frontend/                       # Next.js 16 App
│   ├── src/
│   │   ├── app/
│   │   │   ├── (auth)/login/       # Trang đăng nhập, đăng ký (register/), trạng thái chờ duyệt (account-status/)
│   │   │   └── (dashboard)/        # Các trang sau login
│   │   │       ├── layout.tsx      # Sidebar + Auth guard
│   │   │       ├── customers/, chia-data/, trash-can/   # Khách hàng, chia data, thùng rác
│   │   │       ├── users/          # Quản lý nhân viên + duyệt tài khoản đăng ký mới
│   │   │       ├── profile/, nghi-phep/, duyet-phep/     # Profile, xin/duyệt nghỉ phép
│   │   │       ├── nguon-media/, nhom-lien-ket/, nhom-toi-quan-ly/  # Nguồn, Category/Group liên kết, nhóm mình quản lý
│   │   │       ├── attendance-device/   # Máy chấm công
│   │   │       └── audit-logs/          # Nhật ký audit log
│   │   ├── components/
│   │   │   ├── common/             # Shared components (AntdAppProvider, SimpleList...)
│   │   │   ├── customers/          # Customer-specific components
│   │   │   └── link-groups/        # GroupManagersModal...
│   │   ├── lib/
│   │   │   ├── api/                # Axios instance + API methods (1 file / module BE)
│   │   │   │   ├── axios-instance.ts   # ⭐ Interceptors, token attaching
│   │   │   │   ├── auth.api.ts, users.api.ts, customers.api.ts, link-groups.api.ts, media-sources.api.ts...
│   │   │   ├── hooks/              # React Query hooks (useUsers, useCustomers, useLinkGroups...)
│   │   │   ├── stores/             # Zustand stores
│   │   │   │   └── auth.store.ts   # ⭐ JWT token + Cookie persistence
│   │   │   └── types/              # TypeScript interfaces
│   │   └── middleware.ts           # ⭐ Route protection (Next.js Middleware)
│   └── .env.local                  # ⚠️ Không commit (NEXT_PUBLIC_API_URL...)
│
└── AZ-Workbase Skills/             # 🤖 Hệ thống hướng dẫn cho AI Agent
    ├── SKILL_FILE_MANAGEMENT.md    # Giao thức thao tác của Agent
    ├── SKILL_DATABASE_MANAGEMENT.md# Hướng dẫn quản lý Schema DB
    ├── SKILL_NESTJS_BACKEND.md     # Patterns NestJS chuẩn cho dự án
    ├── SKILL_NEXTJS_FRONTEND.md    # Patterns Next.js chuẩn cho dự án
    ├── README_AZWORKBASE_PROJECT.md# Tài liệu dự án chi tiết
    └── WORKFLOW_LOG.md             # Nhật ký tư duy & hành động chi tiết
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
- **RBAC**: Phân quyền chặt chẽ dựa trên Role và Department.

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
```

---

## 🔐 Phân quyền (RBAC)

> **Nguồn chân lý đầy đủ:** [`AZ-Workbase Skills/PERMISSIONS.md`](<./AZ-Workbase%20Skills/PERMISSIONS.md>)
> — bảng dưới đây chỉ là tóm tắt nhanh, có thay đổi rule luôn sửa ở file PERMISSIONS.md trước.

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

> Danh sách đầy đủ + chi tiết request/response: Swagger tại `http://localhost:3001/api/docs` (local)
> hoặc domain backend + `/api/docs` (production). Bảng dưới đây chỉ liệt kê nhóm endpoint chính.

| Module | Base path | Mô tả ngắn |
|---|---|---|
| Auth | `/api/auth/*` | `login`, `register`, `refresh` — JWT access + refresh token rotation |
| Users | `/api/users/*` | CRUD nhân viên, profile, duyệt/từ chối tài khoản đăng ký mới |
| Customers | `/api/customers/*` | CRUD khách hàng, chia data, gán/thu hồi, ghi chú, deposit, import Excel |
| Departments | `/api/departments/*` | Quản lý phòng ban |
| Leave Requests | `/api/leave-requests/*` | Xin nghỉ phép, duyệt đơn |
| Link Groups | `/api/link-categories/*`, `/api/link-groups/*` | Category/Group liên kết, checklist đã-join, quản lý chính/phụ theo group |
| Media Sources | `/api/media-sources/*` | Danh mục "Nguồn" khách hàng |
| ZK Device | `/api/zk-device/*`, `/iclock/*` | Đồng bộ chấm công (kéo chủ động + nhận đẩy tự động ADMS) |
| Audit | `/api/audit-logs/*` | Nhật ký audit log |

Xem chi tiết cấu trúc từng module tại [`backend/README.md`](./backend/README.md) và
[`frontend/README.md`](./frontend/README.md).