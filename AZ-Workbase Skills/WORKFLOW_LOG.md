# WORKFLOW LOG — AZ-WORKBASE PROJECT
> **Giao thức:** Chỉ APPEND, không bao giờ xóa/ghi đè entry cũ.
> **Kích hoạt bằng lệnh:** `"Log this action"` hoặc `"Ghi nhận quy trình này"`

---

## [2026-04-01 10:47] | Khởi tạo Hệ thống Skills & Workflow | Status: Success

**Actor:** Agent (Khởi tạo theo yêu cầu User)

**Nền tảng đã Audit:**

Tôi đã đọc toàn bộ source code (local + GitHub `tuannho0802/AZ_Workbase`) và nhận diện được kiến trúc hệ thống như sau:

### Stack Công nghệ:
- **Backend:** NestJS (TypeScript), TypeORM, MySQL, JWT (Passport), Bcrypt, Swagger
- **Frontend:** Next.js 14 (App Router), React Query (TanStack), Zustand (+ js-cookie), Ant Design
- **Auth:** JWT Stateless với Access Token (1h) + Refresh Token (7d), lưu vào Cookie qua Zustand persist

### Modules đã nhận diện:

| Module | Backend Path | Frontend Path | Chức năng |
|---|---|---|---|
| **Auth** | `modules/auth` | `app/(auth)/login` | Đăng nhập, Refresh Token, JWT Strategy |
| **Users** | `modules/users` | `app/(dashboard)/users` | CRUD Nhân viên, RBAC (Admin/Manager/Employee) |
| **Customers** | `modules/customers` | `app/(dashboard)/customers` | CRUD Khách hàng, Giao cho nhân viên |
| **Departments** | `modules/departments` | (dùng trong forms) | Quản lý phòng ban |
| **Deposits** | `modules/deposits` | (tích hợp Customer) | Quản lý nạp tiền của khách |

### Entities đã Audit (Database Schema):
- **users**: `id, email, password (bcrypt), name, role (ENUM), departmentId, isActive (TINYINT), lastLoginAt`
- **customers**: `id, name, phone, email, source (ENUM), campaign, salesUserId, status (ENUM), departmentId, note, inputDate, soft-delete (deletedAt)`
- **departments**: `id, name`
- **deposits**: Liên kết với Customer
- **customer_notes**: Liên kết với Customer

### Các Bug đã Fix trong phiên làm việc này:
1. **FindEmployees ẩn User bị khóa** → Removed `isActive=true` default filter
2. **isActive undefined** → Removed custom `.select()` từ QueryBuilder → TypeORM tự map
3. **403 sai khi DB có is_active=1** → Changed `if(!user.isActive)` → `if(Number(user.isActive) === 0)`
4. **Axios NO TOKEN warning** → Thêm Whitelist cho `/auth/login` và `/auth/register`
5. **SSR Zustand ghi đè Cookie** → Thêm `typeof window === 'undefined'` guard
6. **Mất từ phòng ban trên bảng** → Thêm `leftJoinAndSelect('user.department', 'department')`

**Files Changed trong phiên này:**
- `frontend/src/lib/stores/auth.store.ts` — SSR cookie guard
- `frontend/src/lib/api/axios-instance.ts` — Auth route whitelist
- `frontend/src/app/(auth)/login/page.tsx` — 401/403 error handling
- `frontend/src/app/(dashboard)/users/page.tsx` — isActive display, Spin loading, debug logs
- `backend/src/modules/auth/auth.service.ts` — isActive type check, ForbiddenException, audit log
- `backend/src/modules/users/users.service.ts` — Remove isActive filter, add leftJoin, preserve password on update

---
