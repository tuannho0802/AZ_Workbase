# AZ-Workbase CRM System

> **Hệ thống Quản lý Dữ liệu Marketing & Khách hàng cho doanh nghiệp.**
> Stack: **Next.js 14** (Frontend) + **NestJS** (Backend) + **MySQL** (Database)

---

## 🏗 Tech Stack

| Layer | Technology | Version | Port |
|---|---|---|---|
| Frontend | Next.js (App Router) | 14+ | 3000 |
| UI Library | Ant Design | 5.x | — |
| State | Zustand + React Query | Latest | — |
| Backend | NestJS (TypeScript) | 10+ | 3001 |
| ORM | TypeORM | Latest | — |
| Database | MySQL | 8.x | 3306 |
| Auth | JWT (Passport) + Bcrypt | — | — |

---

## 📁 Cấu trúc thư mục

```
AZ-Workbase/
│
├── backend/                        # NestJS API Server
│   ├── src/
│   │   ├── common/
│   │   │   ├── decorators/         # @Roles()
│   │   │   ├── enums/              # Role enum
│   │   │   ├── filters/            # Global exception filter
│   │   │   └── guards/             # JwtAuthGuard, RolesGuard
│   │   ├── config/
│   │   │   └── database.config.ts  # TypeORM configuration
│   │   ├── database/
│   │   │   ├── entities/           # ⭐ Luôn đọc trước khi sửa Frontend
│   │   │   │   ├── user.entity.ts
│   │   │   │   ├── customer.entity.ts
│   │   │   │   ├── department.entity.ts
│   │   │   │   ├── deposit.entity.ts
│   │   │   │   └── customer-note.entity.ts
│   │   │   ├── migrations/         # Schema migrations
│   │   │   └── seeds/              # Dữ liệu mẫu
│   │   ├── modules/
│   │   │   ├── auth/               # Login, JWT, Refresh Token
│   │   │   ├── users/              # CRUD nhân viên (RBAC)
│   │   │   ├── customers/          # CRUD khách hàng
│   │   │   ├── departments/        # Quản lý phòng ban
│   │   │   └── deposits/           # Quản lý nạp tiền
│   │   └── main.ts                 # Bootstrap (CORS, Swagger, Pipes)
│   └── .env.development            # ⚠️ Không commit
│
├── frontend/                       # Next.js 14 App
│   ├── src/
│   │   ├── app/
│   │   │   ├── (auth)/login/       # Trang đăng nhập
│   │   │   └── (dashboard)/        # Các trang sau login
│   │   │       ├── layout.tsx      # Sidebar + Auth guard
│   │   │       ├── customers/      # Quản lý khách hàng
│   │   │       ├── users/          # Quản lý nhân viên
│   │   │       └── settings/       # Cài đặt
│   │   ├── components/
│   │   │   ├── common/             # Shared components (AntdProvider...)
│   │   │   └── customers/          # Customer-specific components
│   │   ├── lib/
│   │   │   ├── api/                # Axios instance + API methods
│   │   │   │   ├── axios-instance.ts   # ⭐ Interceptors, token attaching
│   │   │   │   ├── auth.api.ts
│   │   │   │   ├── users.api.ts
│   │   │   │   └── customers.api.ts
│   │   │   ├── hooks/              # React Query hooks (useUsers, useCustomers...)
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
```

### 2. Frontend (Next.js)
```bash
cd frontend
npm install
# Tạo file .env.local với:
# NEXT_PUBLIC_API_URL=http://localhost:3001/api
npm run dev             # Chạy trên http://localhost:3000
```

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

| Role | Quyền hạn |
|---|---|
| `admin` | Toàn quyền: CRUD users, customers, departments, deposits |
| `manager` | Xem và quản lý nhân viên/khách hàng trong phòng ban của mình |
| `assistant` | Xem và cập nhật khách hàng được giao |
| `employee` | Xem và cập nhật khách hàng của cá nhân |

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

---

## 📌 API Endpoints chính

| Method | Path | Mô tả | Auth |
|---|---|---|---|
| POST | `/api/auth/login` | Đăng nhập | Public |
| POST | `/api/auth/refresh` | Làm mới token | Public |
| GET | `/api/users/all` | Lấy tất cả nhân viên | Admin, Manager |
| GET | `/api/users` | Danh sách nhân viên có phân trang | Admin, Manager |
| POST | `/api/users` | Tạo nhân viên mới | Admin |
| PATCH | `/api/users/:id` | Cập nhật nhân viên | Admin |
| GET | `/api/customers` | Danh sách khách hàng | Admin, Manager, Employee |
| POST | `/api/customers` | Tạo khách hàng mới | All Logged In |
| GET | `/api/departments` | Danh sách phòng ban | All Logged In |
