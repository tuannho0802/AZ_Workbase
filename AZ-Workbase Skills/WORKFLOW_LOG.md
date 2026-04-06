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

## [2026-04-01 11:06] | Triển khai Refresh Token Rotation | Status: Success

**Actor:** Agent

**Bối cảnh:** Hệ thống trước đó không có DB-side validation cho Refresh Token. Refresh Token bị đánh cắp có thể dùng mãi mãi để lấy Access Token mới.

**Cơ chế đã triển khai (Rotation + Reuse Detection):**
1. **Login**: Tạo refresh_token → `bcrypt.hash(10)` → Lưu vào `users.hashed_refresh_token` trong DB.
2. **Refresh**: Verify JWT signature → `bcrypt.compare(tokenGửiLên, DB_hash)` → Nếu khớp: phát cặp mới + cập nhật hash (ROTATION) → Nếu không khớp: xóa hash trong DB + 401 (DETECTION).
3. **Logout**: `saveRefreshToken(userId, null)` → Vô hiệu hóa hoàn toàn khả năng refresh.

**Files Changed:**
- `backend/src/database/entities/user.entity.ts` — Thêm cột `hashedRefreshToken` (`type: text, nullable, select: false`)
- `backend/src/modules/users/users.service.ts` — Thêm `saveRefreshToken()` và `findByIdWithRefreshToken()`
- `backend/src/modules/auth/auth.service.ts` — Rewrite: `generateTokens()`, `login()`, `refresh()` (Rotation + Detection), `logout()`
- `backend/src/modules/auth/auth.controller.ts` — Thêm `POST /auth/logout` endpoint (JwtAuthGuard)
- `frontend/src/lib/stores/auth.store.ts` — `logout()` gọi API backend, `logoutLocal()` dùng cho interceptor
- `frontend/src/lib/api/axios-instance.ts` — Dùng `logoutLocal()` khi refresh fail, đảm bảo cả 2 tokens được lưu vào Cookie sau rotation

**Security Note — Reuse Detection Flow:**
Token cũ bị dùng lại → `bcrypt.compare` fail → Log `[SECURITY] Token reuse detected for user ID: X` → `hashedRefreshToken = null` trong DB → Cả người dùng thật và kẻ tấn công đều bị forced logout.

---

## [2026-04-02 11:55] | Production Hardening & Infrastructure Cleanup | Status: Success

**Actor:** Agent

**Bối cảnh:** Toàn bộ hệ thống AZ-Workbase CRM đã hoàn thiện về mặt tính năng. Đây là giai đoạn tối ưu hóa, chuẩn hóa và dọn dẹp để đưa hệ thống vào trạng thái Production-Ready.

**Các hạng mục đã hoàn thành:**

### 1. 🛡️ Security Hardening (Refresh Token Rotation)
- **Hoàn thiện Rotation logic**: Đã fix logic xoay vòng Refresh Token trong `AuthService`. Mỗi lần refresh thành công, hash của token cũ trong DB bị ghi đè bằng hash của token mới.
- **Reuse Detection**: Triển khai cơ chế phát hiện sử dụng lại (Reuse Detection). Nếu một token cũ (đã bị xoay vòng) được gửi lên, hệ thống sẽ xóa `hashedRefreshToken` trong DB, buộc tất cả các phiên đăng nhập hiện tại của người dùng đó phải đăng nhập lại.
- **BCRYPT Hashing**: Toàn bộ Refresh Token được băm bằng `bcrypt` trước khi lưu trữ để bảo mật tuyệt đối.

### 2. 🗄️ Standardized Migration System (TypeORM)
- **Fix CLI SyntaxError**: Sửa lỗi `SyntaxError: missing ) after argument list` trên Windows bằng cách cập nhật script `package.json` trỏ thẳng vào `node_modules/typeorm/cli.js`.
- **Migration-First Policy**: Thiết lập quy tắc thay đổi schema bắt buộc qua migration. Đã tạo migration `1743472800000-AddHashedRefreshTokenToUsers.ts` để đồng bộ DB.
- **Data Normalization (BooleanTransformer)**: Tạo `BooleanTransformer` để tự động map `TINYINT(1)` (MySQL) sang `boolean` (TypeScript). Đã áp dụng cho `User.isActive`, `Department.isActive`, `CustomerNote.isImportant`.

### 3. 🧹 Cleanup & Observability
- **Xóa debug logs**: Đã dọn dẹp sạch sẽ toàn bộ `console.log` dư thừa tại:
    - Frontend: `axios-instance.ts`, `auth.store.ts`, `users/page.tsx`, `layout.tsx`. 
    - Loại bỏ các dòng log nhạy cảm (Token, User ID, Path tracking).
- **NestJS Logger**: Thay thế `console.log` ở Backend bằng `Logger` của NestJS (`AuthService`, `UsersService`). Giúp log tập trung, dễ quản lý và chuyên nghiệp hơn.

### 4. 📝 Documentation Update
- **README.md**: Cập nhật lệnh Migration và sơ lược kiến trúc bảo mật mới.
- **Skills Folder**: Cập nhật `SKILL_DATABASE_MANAGEMENT.md` và `SKILL_FILE_MANAGEMENT.md` với các quy chuẩn mới về Logging và Migration.

**Files Changed trong phiên này:**
- `backend/package.json`
- `backend/src/database/entities/*.entity.ts`
- `backend/src/modules/auth/auth.service.ts`
- `backend/src/modules/users/users.service.ts`
- `frontend/src/lib/api/axios-instance.ts`
- `frontend/src/lib/stores/auth.store.ts`
- `frontend/src/app/(dashboard)/users/page.tsx`
- `frontend/src/app/(dashboard)/layout.tsx`

---

## [2026-04-06 13:05] | CRM Standardization & Deposit Module Refactor | Status: Success

**Actor:** Agent

**Bối cảnh:** Cần chuẩn hóa giao diện bảng khách hàng (9 cột) và xử lý triệt để lỗi 500/400 khi thực hiện nghiệp vụ Nạp tiền.

**Các hạng mục đã hoàn thành:**

### 1. 📊 UI Standardization (9-Column Table)
- **Bảng Khách hàng**: Tái cấu trúc bảng tại `CustomersPage.tsx` để hiển thị đúng 9 cột theo yêu cầu: `STT, Ngày nhập, Họ tên, SĐT, Nguồn, UTM, Sales, Trạng thái, Nạp tiền (30 ngày)`.
- **UX Optimization**: Loại bỏ cột "Thao tác" dư thừa. Người dùng có thể click vào bất kỳ vị trí nào trên dòng (row) để mở Drawer chi tiết.
- **Formatting**: Sử dụng `Intl.NumberFormat` để hiển thị tiền tệ (VND) đồng nhất.

### 2. 💰 Deposit Module Hardening
- **Backend Total Calculation**: Cập nhật `findAll` trong `CustomersService` để tính tổng nạp trong 30 ngày gần nhất bằng sub-query tối ưu (Grouping by customerId).
- **Fix 400 Error**: Triển khai `sanitizeAmount` tại `DepositForm.tsx` để loại bỏ ký tự định dạng ($, dấu phẩy) trước khi gửi về API.
- **Fix 500 Error**: 
    - Thêm `@Column({ name: 'customer_id' }) customerId: number` vào `Deposit` entity để QueryBuilder có thể tham chiếu trực tiếp.
    - Sửa lỗi mapping property `deleted_at` -> `deletedAt` trong QueryBuilder.

### 3. 🎨 Ant Design 5.x Migration (Final Sweep)
- **CustomerDetailDrawer.tsx**: Cập nhật `width` -> `size="large"` và refactor `Tabs` sử dụng `items` prop.
- **CustomerForm.tsx**: Chuyển `destroyOnClose` -> `destroyOnHidden` trong `Modal`.
- **CustomerNotesTab.tsx**: Chuẩn hóa component `List` của AntD 5.x.

**Files Changed trong phiên này:**
- `backend/src/database/entities/deposit.entity.ts`
- `backend/src/modules/customers/customers.service.ts`
- `frontend/src/app/(dashboard)/customers/page.tsx`
- `frontend/src/lib/types/customer.types.ts`
- `frontend/src/components/customers/CustomerDetailDrawer.tsx`
- `frontend/src/components/customers/DepositForm.tsx`
- `frontend/src/components/customers/CustomerForm.tsx`

---

## [2026-04-06 14:50] | Audit Trail Persistence & Dashboard Monitoring | Status: Success

**Actor:** Agent

**Bối cảnh:** Sửa lỗi HTTP 500 khi nạp tiền cho khách cũ, chuẩn hóa tiền tệ hệ thống sang USD ($) và cải thiện khả năng theo dõi dữ liệu tại Dashboard.

**Các hạng mục đã hoàn thành:**

### 1. 🛡️ Audit Trail Persistence Fix (HTTP 500)
- **CustomersService**: Cập nhật `createDeposit` để populate đồng thời `createdById` (audit mới) và `createdBy_OLD` (cột legacy `NOT NULL`). Điều này giúp tránh lỗi crash khi lưu deposit cho các khách hàng cũ trong DB.

### 2. 📈 Dashboard Statistics Enhancement
- **Two-Table Today Modal**: Cấu trúc lại Modal "Khách hàng mới hôm nay" thành 2 bảng riêng biệt:
    - **📅 Hôm nay**: Danh sách khách mới nhập trong ngày hiện tại.
    - **🕐 Lịch sử**: 50 bản ghi nhập khách gần nhất (không giới hạn ngày) để Sales/Admin dễ dàng theo dõi dòng dữ liệu liên tục.
- **Backend Data Split**: `getStatsToday` thực hiện 2 query tách biệt (Current Day vs Last 50 History) và trả về object cấu trúc `{ todayList, historyList }`.

### 3. 💵 Currency & Precision Standardization (USD)
- **USD Transition**: Chuyển đổi toàn bộ hiển thị từ `VND (đ)` sang `USD ($)` tại Stats Cards và tất cả các Modals.
- **Decimal Support**: Cập nhật `InputNumber` tại `DepositForm.tsx` hỗ trợ 2 chữ số thập phân (`precision={2}`, `step={0.01}`) để phù hợp với giao dịch USD.
- **Formatting**: Sử dụng locale `en-US` cho các hàm format tiền tệ để hiển thị dấu phẩy ngăn cách hàng nghìn chuẩn quốc tế.

### 4. 🔗 Relation Fix (Sales & Performer N/A)
- **getAllDepositsStats**: Thêm `leftJoinAndSelect` cho `customer.salesUser` và `deposit.createdBy` để hiển thị chính xác tên nhân viên phụ trách và người thực hiện nạp tiền (thay vì N/A).

**Files Changed trong phiên này:**
- `backend/src/modules/customers/customers.service.ts`
- `frontend/src/lib/api/customers.api.ts`
- `frontend/src/components/customers/DepositForm.tsx`
- `frontend/src/components/customers/StatsCards.tsx`
- `frontend/src/components/customers/StatModals.tsx`

---
