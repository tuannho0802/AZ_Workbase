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

## [2026-04-06 15:30] | Real-time Search Select & User Normalization | Status: Success

**Actor:** Agent

**Bối cảnh:** Sales dropdowns hiển thị trống do thiếu dữ liệu name trong DB. Cần một cơ chế tìm kiếm nhân viên trực quan và tin cậy hơn cho việc gán khách hàng.

**Các hạng mục đã hoàn thành:**

### 1. 🔍 Real-time User Search Select
- **SalesUserSelect Component**: Phát triển component Select tùy chỉnh với khả năng tìm kiếm realtime theo Tên và Email.
- **Visual Feedback**: Hiển thị Avatar (màu theo Role), Tag vai trò và Phòng ban ngay trong dropdown.
- **Preview Card**: Thêm thẻ xem trước thông tin chi tiết (Blue Card) ngay phía dưới Select khi đã chọn nhân viên, giúp xác nhận chính xác đối tượng được gán.

### 2. 🧹 User Data Normalization (Backfill)
- **Seed Script**: Tạo và thực thi script `backfill-user-names.ts` để gán tên mẫu cho các user 1-5 (Admin, Sales 1, Sales 2, Manager, Manager 2) đang bị trống trong database.
- **Package Script**: Thêm `npm run seed:users` vào `package.json` backend.

### 3. 🛡️ Robust UI Fallbacks
- **Universal Fallback**: Cập nhật `CustomerForm`, `BulkAssignModal`, `StatModals` và `CustomerInfoTab` để luôn hiển thị `Email` nếu `Name` bị trống hoặc chỉ chứa khoảng trắng (`u.name?.trim() || u.email`).
- **Type Safety**: Cập nhật interface `Customer` và các nested user objects trong `customer.types.ts` để bao gồm trường `email`.

### 4. ⚙️ Backend API Refactor
- **findEmployees**: Nâng cấp service để hỗ trợ tham số `isFullList`. Khi bật, logic sẽ bỏ qua filter theo phòng ban của Manager để trả về toàn bộ danh sách nhân viên đang hoạt động (isActive=true) phục vụ mục đích gán khách hàng linh hoạt.

**Files Changed trong phiên này:**
- `backend/src/modules/users/users.service.ts`
- `backend/src/modules/users/users.controller.ts`
- `backend/src/database/seeds/backfill-user-names.ts`
- `backend/package.json`
- `frontend/src/lib/api/users.api.ts`
- `frontend/src/lib/types/customer.types.ts`
- `frontend/src/components/customers/SalesUserSelect.tsx` (NEW)
- `frontend/src/components/customers/CustomerForm.tsx`
- `frontend/src/components/customers/BulkAssignModal.tsx`
- `frontend/src/components/customers/StatModals.tsx`
- `frontend/src/components/customers/CustomerInfoTab.tsx`

---

## [2026-04-08 15:00] | Migration: Marketing Data (CSV → MySQL) | Status: Success

**Actor:** Agent

**Bối cảnh:** Cần di chuyển toàn bộ dữ liệu Marketing từ hệ thống cũ (file CSV 8,000+ bản ghi) vào database MySQL mới với đầy đủ thông tin Khách hàng, Ghi chú và Nạp tiền (FTD).

**Các hạng mục đã hoàn thành:**

### 1. 🧹 Database Cleanup System
- **clear-test-data.ts**: Phát triển script dọn dẹp dữ liệu test. Sử dụng `SET FOREIGN_KEY_CHECKS = 0` để xóa triệt để dữ liệu trong `deposits`, `customer_notes` và `customers` mà không bị vướng ràng buộc khóa ngoại.
- **Safety**: Đảm bảo reset trạng thái DB về trống trước khi thực hiện import quy mô lớn.

### 2. 🏗️ Robust Import Engine (import-marketing-data.ts)
- **Full Processing**: Xử lý toàn bộ 8,211 dòng của file CSV, chỉ bỏ qua các dòng hoàn toàn trống.
- **Data Transformation**:
    - **Phone**: Chuẩn hóa `84...` → `0...`. Đối với các số trống hoặc "Chưa xin số", gán placeholder duy nhất `MISSING_{rowIndex}` để thỏa mãn ràng buộc `UNIQUE`.
    - **Status Mapping**: Chuyển đổi mã số cũ (`1, 2, 3, 4, 6`) sang ENUM mới (`closed, potential, pending`).
    - **Source Mapping**: Nhận diện thông minh từ UTMSource (`Facebook, TikTok, Google, Instagram`).
- **Resiliency Protections**:
    - **Length Truncation**: Tự động cắt ngắn (truncate) dữ liệu cho các cột `Name`, `Phone`, `Campaign`, `Broker` để tránh lỗi `ER_DATA_TOO_LONG`.
    - **Date Clamping (2038 Protection)**: Phát hiện và xử lý các ngày bị lỗi trong dữ liệu cũ (ví dụ năm 3025). Tự động clamp về năm 2038 cho cột `TIMESTAMP` để tránh lỗi `ER_TRUNCATED_WRONG_VALUE`.
- **Logic Trích xuất**:
    - **FTD (Deposits)**: Nếu cột FTD > 0, tự động tạo bản ghi nạp tiền liên kết với khách hàng.
    - **Notes**: Chuyển đổi cột "Question" thành bản ghi trong bảng `customer_notes`. Cập nhật cột "Note" vào trường ghi chú chính của khách hàng.
- **Audit Fields**: Đồng bộ cả `created_by` (legacy) và `created_by_id` (modern) để tương thích với hệ thống cũ và mới.

### 3. ✅ Verification & Audit
- **100% Data Match**: Đối soát thành công số lượng bản ghi giữa CSV và DB sau khi import.
    - **Customers**: 8,208 records (Khớp chính xác với số dòng có Name trong CSV).
    - **Deposits**: 109 records (FTD > 0).
    - **Notes**: 2,834 records.
- **Automation**: Tích hợp các lệnh `npm run import:clear`, `import:data`, `import:full` vào `package.json` backend.

**Files Changed trong phiên này:**
- `backend/package.json`
- `backend/src/database/import/clear-test-data.ts` (NEW)
- `backend/src/database/import/import-marketing-data.ts` (NEW)
- `backend/src/database/import/debug-import.ts` (NEW/Temporary)

---

## [2026-04-13 12:00] | Professional CSV Import Rewrite (8000+ Records) | Status: Success

**Actor:** Agent

**Bối cảnh:** Import lần trước (2026-04-08) gặp nhiều vấn đề: ngày bị sai năm (2001/2015/2024 thay vì 2025-2026), phone placeholder `MISSING_*` gây ô nhiễm dữ liệu, thiếu xử lý trường hợp NULL, và status mapping không khớp với DB enum thực tế. Cần rewrite toàn bộ import script để xử lý sạch 8000+ bản ghi một lần duy nhất.

**Các hạng mục đã hoàn thành:**

### 1. 🔧 TypeScript Compilation Fix
- **customers.import.service.ts**: Sửa lỗi `TS2322` — `Set<string | null>` không assignable cho `Set<string>`. Fix bằng `as string` cast tại dòng 80.

### 2. 🗄️ Migration Generation
- **AddAssignedDateColumn**: Tạo migration `1776053695502-AddAssignedDateColumn.ts` để đồng bộ schema (indexes, foreign keys, nullable modifiers). Migration không chạy được do conflict với existing schema nhưng columns `assignedDate`, nullable `phone/email` đã tồn tại.

### 3. 🏗️ Complete Import Script Rewrite (import-marketing-data.ts)
- **parseDate()**: Viết mới hoàn toàn:
    - Format chính: `DD/MM/YYYY` (chuẩn Việt Nam)
    - Validation: Year range 2020-2030, month 1-12, day 1-31, rollover detection
    - Reject time-format strings (`00:00.0`, `56:16.7`) chứa ký tự `:`
    - Fallback: `YYYY-MM-DD` format
- **normalizePhone()**: Xử lý toàn diện:
    - Chuyển `84xxxxxxxxx` → `0xxxxxxxxx`
    - Reject placeholder text (`Chưa xin số`, `Chưa có`, `N/A`)
    - Validate format: bắt đầu bằng `0`, 10-11 chữ số
    - Trả `null` thay vì placeholder — phone không hợp lệ = NULL trong DB
- **mapStatus()**: Mapping chính xác với DB enum `['closed', 'pending', 'potential', 'lost', 'inactive']`:
    - `0→pending`, `1→closed`, `2→potential`, `3→pending`, `4→pending`
    - `5→lost`, `6→pending`, `7→inactive`, `8→pending`
    - ~~`0→new`~~, ~~`5→rejected`~~ đã gây 2231 lỗi `Data truncated` ở run 1
- **Source Mapping**: Sử dụng `includes()` thay vì exact match:
    - `Facebook`, `TikTok`, `Google`, `Instagram`, `LinkedIn` → mapped trực tiếp
    - Tất cả nguồn khác (Zalo, Telegram, Form, Cá nhân, Khách cá nhân, GG Sheet) → `Other`
    - ~~`Zalo`~~ đã gây 1 lỗi `Data truncated` vì không nằm trong DB enum
- **Date Fallback Chain**: `Date column` → `CreateDate column` → `new Date()`
    - 2073 rows có `Date` trống nay được xử lý thay vì bị skip

### 4. ⚡ Performance Optimization
- Thêm `SET FOREIGN_KEY_CHECKS = 0` và `SET UNIQUE_CHECKS = 0` quanh transaction
- Import 8089 records trong **29.7 giây** (vs ~19s cho 5861 records ở run 1)

### 5. ✅ Final Results (Run 3 — Clean)

| Metric | Run 1 | Run 2 | Run 3 (Final) |
|---|---|---|---|
| Customers | 5,861 | 6,016 | **8,089** |
| Notes | 2,568 | 2,665 | **2,743** |
| Deposits | 106 | 106 | **107** |
| Duplicates | 116 | 118 | **119** |
| Errors | **2,231** | **2,074** | **0** ✅ |
| Root Cause | Status enum | Empty dates | — |

### 6. 🐛 Bugs Found & Fixed Across 3 Iterations
1. **Status `'new'`/`'rejected'` không tồn tại trong DB enum** → 2231 `Data truncated` errors
2. **Source `'Zalo'` không tồn tại trong DB enum** → 1 `Data truncated` error
3. **2073 rows không có inputDate** → Bị skip hoàn toàn → Fix bằng fallback chain

**Files Changed trong phiên này:**
- `backend/src/modules/customers/customers.import.service.ts` — TS2322 fix
- `backend/src/database/import/import-marketing-data.ts` — **Complete rewrite**
- `backend/src/database/migrations/1776053695502-AddAssignedDateColumn.ts` (NEW)

**Git Commit:** `946f095` — `Fix: The migration dataset with database`

---

## [2026-04-16 14:00] | Hierarchical Leave Approval & Department-Agnostic RBAC | Status: Success

**Actor:** Agent

**Bối cảnh:** Cần triển khai hệ thống duyệt phép theo cấp bậc (không phụ thuộc phòng ban) và chuyển đổi module Khách hàng sang cơ chế phân quyền "Freedom Mode" dựa trên quyền sở hữu (Owner) và bàn giao (Assignee).

**Các hạng mục đã hoàn thành:**

### 1. 🛡️ Hierarchical Leave Approval System
- **Cơ chế duyệt chéo phòng ban**: Loại bỏ ràng buộc `departmentId` khi duyệt phép. Manager/Assistant có thể duyệt đơn của cấp dưới thuộc bất kỳ phòng ban nào nếu `RolePriority` của người duyệt cao hơn người gửi.
- **Role Priority Mapping**: `ADMIN: 4, MANAGER: 3, ASSISTANT: 2, EMPLOYEE: 1`. 
- **Approval Logic**: Query `findPending` và `findHistory` được lọc bằng `CASE WHEN` hoặc logic so sánh Priority trực tiếp trong QueryBuilder.
- **Ant Design Context Fix**: Giải quyết triệt để lỗi `"Static function can not consume context"` bằng cách sử dụng `App` wrapper và `App.useApp()` hook cho bảng `duyet-phep`.
- **Double-Submission Prevention**: Thêm trạng thái `isProcessing` và `confirmLoading` cho các nút Duyệt/Từ chối để tránh gửi yêu cầu trùng lặp hoặc gây lỗi 401 khi token đang refresh.

### 2. 🔓 Department-Agnostic Customer RBAC (Freedom Mode)
- **Ownership & Assignment Model**: Phân quyền khách hàng dựa trên:
    - **Owner**: Người tạo bản ghi (`createdById`).
    - **Assignee**: Người được giao xử lý (`salesUserId`).
- **CustomerAccessHelper**: Triển khai Helper tập trung để áp dụng bộ lọc `Brackets` cho tất cả các query Read/Stats/Update/Delete.
- **CRUD Permissions**:
    - **Update**: Cả Owner và Assignee đều có quyền chỉnh sửa, chia data và nạp tiền (Freedom).
    - **Delete**: Ràng buộc nghiêm ngặt — Chỉ **Owner** hoặc **Admin** mới có quyền xóa khách hàng.
- **Synchronized Sidebar**:
    - Mở khóa tab "Khách hàng", "Chia Data" và "Nhân viên" cho TẤT CẢ các Role.
    - Ẩn tab "Duyệt phép" duy nhất đối với Role `EMPLOYEE`.
- **Global User Visibility**: Cho phép mọi Role xem danh sách nhân viên (Tab Users) để phục vụ việc tìm kiếm và bàn giao dữ liệu chéo phòng ban.

### 3. 🛠️ Bug Fixes & Refactoring
- **TypeScript Type Safety**: 
    - Sửa lỗi mismatch `SelectQueryBuilder<Customer>` vs `SelectQueryBuilder<Deposit>` bằng cách sử dụng Generic type `<any>` trong helper.
    - Cập nhật `UnauthorizedCustomerAccessException` constructor hỗ trợ truyền message tùy chọn.
- **Dashboard Synchronization**: Các Badge thống kê tại Dashboard và Trang Khách hàng tự động lọc dữ liệu chuẩn xác theo túi dữ liệu của User đang đăng nhập.

**Files Changed trong phiên này:**
- `backend/src/modules/leave-requests/leave-requests.service.ts`
- `backend/src/modules/users/users.service.ts` & `users.controller.ts`
- `backend/src/modules/customers/customers.service.ts` & `customers.controller.ts`
- `backend/src/modules/customers/helpers/customer-access.helper.ts` (NEW)
- `backend/src/modules/customers/exceptions/customer.exceptions.ts`
- `frontend/src/app/(dashboard)/layout.tsx` (Sidebar sync)
- `frontend/src/app/(dashboard)/duyet-phep/page.tsx` (Antd Fix + Processing logic)

---

## [2026-04-17 10:45] | Users Module Security Hardening & TypeORM Dropdown Fix | Status: Success

**Actor:** Agent

**Bối cảnh:** Toàn bộ Module Quản lý Nhân sự (`/users`) đang bị lộ (trước đó Employee/Managers cũng có thể list nhân sự). Màn hình "Chia Data" xuất hiện lỗi 403 Forbidden do API dropdown dùng chung Auth Guard. Ngoài ra Dropdown bị lộ các tài khoản Deactive. Yêu cầu thắt chặt bảo mật Module Users: Chỉ Admin, đồng thời khắc phục rớt API TypeORM và hiển thị Data deactive.

**Các hạng mục đã hoàn thành:**

### 1. 🛡️ Thắt chặt Quyền truy cập Module Nhận sự (CHỈ ADMIN)
- **Frontend Sidebar (`layout.tsx`)**: Tab "Nhân viên" hoàn toàn bị ẩn với Manager, Assistant, và Employee (`user.role === 'admin'` check).
- **Frontend Routing Guard (`users/page.tsx`)**: Bổ sung `useEffect` Kick-out. Bất cứ ai thay đổi URL thành `/users` mà không phải Admin sẽ bị dội ngược về `/customers`. Render Lifecycle trả về `null` trong lúc Redirect để chặn lộ giao diện.
- **Backend Service Defense in Depth (`users.service.ts`)**: Hàm `findOne` chặn toàn bộ request gọi thông tin người khác nếu Role khác Admin. 
- **Controller Decorators (`users.controller.ts`)**: Thu hẹp toàn bộ CRUD endpoint `@Get`, `@Get(':id')`, `@Post`, `@Patch` về chuẩn `@Roles(Role.ADMIN)`. Nhưng vẫn linh động mở riêng `/users/me` cho mọi user lấy thông tin cá nhân.

### 2. 🔗 Phục hồi chức năng Chia Data Dropdown (`/users/all`)
- **Fix lỗi 403 Failed to Assign**: Tách riêng Endpoints list `SalesUserSelect` ra khỏi Auth blocks. Restore endpoint `GET /users/all` trở lại `@Roles(Role.ADMIN, Role.MANAGER, Role.ASSISTANT, Role.EMPLOYEE)` để phục vụ thanh thả Dropdown Select Sales.

### 3. 🐛 Fix Bug "TypeORM QueryBuilder ngưng đọc Boolean Transformer"
- **Nguyên nhân**: Màn dropdown hiện tất cả bao gồm người Mất việc (deactive) thay vì chỉ hiện Account Active. TypeORM `QueryBuilder.where('user.isActive = :active', { active: true })` truyền chuỗi `true` thẳng vào SQLite bypass custom `BooleanTransformer` làm hệ cơ sở dữ liệu ngầm cho vượt qua filter.
- **Giải pháp**: Xóa cấu trúc `createQueryBuilder`, thay toàn bộ hàm `findEmployees` về hàm Native Repository Find: `this.usersRepository.find({ where: { isActive: true } })`. Bộ lọc của Native Find tự rà trúng Transformer đổi từ JS boolean `true` sang Int `1` của DB.

### 4. 🗃️ Switch Table về Backend Pagination
- **Chữa Lỗi Ẩn User Tắt Active**: Module Table danh sách `/users` Frontend ban đầu gọi nhầm endpoint `usersApi.getUsersList()` lấy data từ hàm dropdown, vốn đã lock `isActive: true`.
- Mở lại route trực tiếp về Endpoint Pagination `usersApi.getUsers({ page, limit })`, do backend Controller mặc định không gán `isActive = true` trừ khi có param - do đó Frontend Table tự động load full lịch sử DB hỗ trợ cả các Account "Đã nghỉ việc". Update cột Table mapping màu thẻ "Đang hoạt động" (`green`), và "Không hoạt động" (`default`).

**Files Changed trong phiên này:**
- `AZ-Workbase Skills/SKILL_NESTJS_BACKEND.md` (Update Bug TypeORM)
- `frontend/src/app/(dashboard)/layout.tsx` (Menu render root)
- `frontend/src/app/(dashboard)/users/page.tsx` (Role Guard & Paginated Table hook)
- `frontend/src/components/customers/SalesUserSelect.tsx` (Placeholder updates)
- `backend/src/modules/users/users.service.ts` (Deep Guard, FindOne rules, Find vs QB)
- `backend/src/modules/users/users.controller.ts` (Guards Refactoring)
---

### [2026-04-17 11:20] CHUẨN HÓA "PRIMARY SALES" VÀ "SHARED SALES" TOÀN CRM

**Vấn đề:** Khái niệm gán data (Data Owner) bị nhập nhằng, không rõ ai là người chịu trách nhiệm chính (Primary) và ai là người được cộng tác thêm (Shared). Label "Data Owner" gây hiểu lầm giữa người tạo (Creator) và người trực tiếp chăm sóc.

**Giải pháp & Kỹ thuật:**
1. **Chuẩn hóa Backend Logic:** 
   - Duy trì `salesUserId` (Primary) và mảng `assignments` (Shared).
   - Logic `bulkAssign`: Nếu KH chưa có Primary, người được gán đầu tiên sẽ trở thành Primary. Nếu đã có, thì chỉ thêm vào danh sách Shared.
   - Expand RBAC `/customers/unassigned`: Cho phép Primary Sales nhìn thấy khách mình đang phụ trách trong màn hình chia data để có quyền chủ động chia sẻ data cho người khác.
2. **UI/UX Refactoring:**
   - **Label Consistency:** Đổi "Data Owner" hoặc "Người tạo" thành **"Người tạo"** (Hệ thống/Admin). Đổi "Sales" thành **"Sales (Chính + Phụ)"**.
   - **Visual Hierarchy:** Tại màn hình danh sách, Primary được hiện tên trực tiếp, Shared hiện dưới dạng Badge Tooltip `+N`. Tại Modal Detail, tách rạch ròi 3 dòng: *Người tạo | Phụ trách chính | Sales được chia*.
   - **User Indicator [👤]:** Thêm icon nhận diện cho Primary Sales khi họ truy cập màn hình `/chia-data` để biết khách nào là "của mình".
3. **Security Patch:** Thêm logic 403 Forbidden tại `bulkAssign` cấp Backend, chặn đứng hành vi share data của người khác khi không phải là Admin/Manager hoặc Primary/Creator của data đó.

**Files Changed trong phiên này:**
- `backend/src/database/entities/customer.entity.ts` (Review)
- `backend/src/modules/customers/customers.service.ts` (Authorize & Unassigned Query Logic)
- `frontend/src/lib/types/customer.types.ts` (Extending Type System with `role` and `activeAssignees`)
- `frontend/src/app/(dashboard)/customers/page.tsx` (Table Column UI Refactoring)
- `frontend/src/app/(dashboard)/chia-data/page.tsx` (Tab Renaming & User Identity)
- `frontend/src/components/customers/CustomerInfoTab.tsx` (Modal Details Layout Refactoring & Antd Fix)

**Lưu ý Ant Design:** Cập nhật prop `direction` sang `orientation` cho component `<Space />` để tránh Deprecated warnings.

---

## [2026-04-20 15:45] | Vercel Deployment & Landing Page Integration | Status: Success

**Actor:** Agent

**Bối cảnh:** Di chuyển Backend NestJS lên Vercel dưới dạng Serverless Function. Xử lý triệt để các vấn đề về phục vụ file tĩnh (CSS/JS/Assets) cho Landing Page `/` và Swagger UI `/api/docs`.

**Các hạng mục đã hoàn thành:**

### 1. 🚀 Vercel Deployment Optimization
- **Serverless Architecture**: Cấu hình `vercel.json` sử dụng `@vercel/node` với entry point `src/main.ts`.
- **Static Assets Persistence**: Khắc phục lỗi Vercel không đóng gói thư mục `public/` bằng cách sử dụng `includeFiles` trong `vercel.json` và cấu hình `assets` trong `nest-cli.json` để đồng bộ dữ liệu vào `dist/public`.
- **Routing**: Phân tách luồng xử lý: `/api/(.*)` cho Backend Logic và `/` cho Landing Page.

### 2. 🏠 Premium Landing Page & Root Handling
- **Professional UI**: Triển khai trang Landing Page sang trọng tại `/` sử dụng Tailwind CSS, hỗ trợ Responsive và đầy đủ các thành phần (Hero, Features, Contact).
- **Dynamic Content Removal**: Thay thế phần "Demo Credentials" bằng nút "Contact for Demo" để tăng tính chuyên nghiệp.
- **Root Logic**: Chỉnh sửa `AppController` để đọc và trả về `index.html` từ thư mục `public` khi người dùng truy cập trang gốc.

### 3. 🔍 Smart Static Discovery (`main.ts`)
- **Dual-Path Probing**: Cập nhật `main.ts` để tự động dò tìm thư mục `public` tại cả `process.cwd()` (Local) và `__dirname/../public` (Vercel).
- **Middleware Reordering**: Đăng ký `app.useStaticAssets()` trước khi thiết lập `GlobalPrefix('api')` để đảm bảo các file tĩnh (CSS/Logo/JS) được phục vụ đúng path mà không bị vướng prefix `/api`.

### 4. 🔐 Swagger UI Automation
- **Auto-Authorization**: Tích hợp `swagger-auth.js` qua `customJs` của Swagger UI. Script này tự động đọc `accessToken` từ `localStorage` (được lưu sau khi đăng nhập ở Landing Page) và gán vào header Authorization của Swagger.
- **Zero-Touch Config**: Người dùng không cần phải copy-paste token thủ công vào nút "Authorize".

### 5. 🧹 Infrastructure Cleanup
- **Script Management**: Di chuyển các utility scripts (`check-dates.ts`, `scan-csv.ts`, `verify.ts`) từ thư mục gốc vào `scripts/ts_utility/` để giữ `dist` gọn gàng và tránh lỗi biên dịch của NestJS.
- **Cross-Platform Compatibility**: Chuẩn hóa `package.json` và `nest-cli.json` để hoạt động ổn định trên cả môi trường Windows (dev) và Linux (Vercel).

**Files Changed trong phiên này:**
- `backend/vercel.json` (REWRITE)
- `backend/nest-cli.json` (Assets mapping)
- `backend/src/main.ts` (Static assets logic + Logger)
- `backend/src/app.controller.ts` (Landing page handler)
- `backend/src/app.module.ts` (ServeStatic config)
- `backend/package.json` (Build scripts optimization)
- `backend/public/index.html` (Landing page content)
- `backend/public/swagger-auth.js` (Automation script)

---

## [QUY TRÌNH DEPLOY VERCEL]
1. `npm run build` để kiểm tra lỗi local.
2. Đảm bảo `dist/public` có đầy đủ file.
3. Vercel tự động build từ GitHub.
4. Kiểm tra Vercel Logs: Tìm `[Static] ✅ Found at __dirname path`.

---

## [2026-09-08 18:10] | Backblaze B2 — Setup phase 1 (deps + test script) + Docs audit | Status: Success

**Actor:** Agent

**Bối cảnh:** Chuyển kiến trúc lưu file từ Cloudflare R2 sang Backblaze B2 (xem
`PLAN_AVATAR_LEAVE_ATTACHMENT_BACKBLAZE_B2.md` v2.0.0 — cả 2 bucket Private, không dùng Public vì B2 bắt
thẻ tín dụng để bật Public). Đây là **phase 1/nhiều** của module `uploads` (avatar + ảnh đính kèm nghỉ
phép) — module `uploads` thật CHƯA được code, mới dừng ở bước hạ tầng/dependency.

**Việc đã làm:**
1. Cài `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` ở `backend/`.
2. Thêm khung biến `B2_ENDPOINT`, `B2_REGION`, `B2_ACCESS_KEY_ID`, `B2_SECRET_ACCESS_KEY`,
   `B2_BUCKET_AVATARS`, `B2_BUCKET_LEAVE_ATTACHMENTS` vào `backend/.env.development.example`.
3. Viết script độc lập `backend/scripts/test-b2-presign.ts` (chạy qua `npm run b2:test-presign`) — tự
   đọc `.env.development` bằng `dotenv` (không qua NestJS ConfigModule), tạo presigned PUT/GET, upload +
   tải lại 1 file test để xác nhận credentials + CORS + bucket hoạt động đúng. Đã chạy thật, kết nối
   thành công.
4. **Audit toàn bộ docs trong `AZ-Workbase Skills/` so với code thật** (theo yêu cầu chủ dự án — do
   `WORKFLOW_LOG.md` này đã quá dài để đối chiếu từng dòng lịch sử, chọn cách bỏ qua phần lịch sử cũ,
   chỉ đối chiếu trạng thái HIỆN TẠI):
   - `SKILL_FILE_MANAGEMENT.md` mục 4: sửa lỗi cây thư mục vẽ nhầm `scripts/` là con của `backend/src/`
     — thực tế `scripts/` nằm ngang hàng `src/` (`backend/scripts/`, không phải `backend/src/scripts/`).
   - `README.md` (gốc repo): bổ sung 4 module backend bị thiếu trong danh sách (`permissions/`,
     `roles/`, `reports/`, `attendance-export/` — trước đó chỉ liệt kê 10/14 module thật), thêm
     `backend/scripts/test-b2-presign.ts` vào cây thư mục, thêm block biến môi trường `B2_*` và lệnh
     `npm run b2:test-presign` vào phần "Hướng dẫn chạy local".
   - `PLAN_AVATAR_LEAVE_ATTACHMENT_BACKBLAZE_B2.md` mục 9: đánh dấu bước cài SDK + script test (trước
     đó nằm ở mục 9.2 "Còn lại", số 8, trạng thái ⏳) chuyển thành ✅ ở mục 9.1 "Đã làm xong", kèm chú
     thích rõ script test KHÔNG thay thế các bước còn lại (App Key scope đúng bucket, CORS rule qua B2
     CLI, điền `.env.development`/Vercel dashboard, build module `uploads` thật).
   - `SKILL_DATABASE_MANAGEMENT.md`, `SKILL_NESTJS_BACKEND.md`: đã được cập nhật đúng ở phiên ngay
     trước phiên này (commit `79478fb`) — verify lại thấy khớp code thật (migration baseline không còn
     liệt kê cứng danh sách cũ, cấu trúc module/scripts khớp `ls` thật), không cần sửa thêm.

**Files Changed trong phiên này:**
- `backend/package.json`, `backend/package-lock.json` — thêm 2 dependency B2.
- `backend/.env.development.example` — thêm block biến `B2_*`.
- `backend/scripts/test-b2-presign.ts` (mới).
- `AZ-Workbase Skills/SKILL_FILE_MANAGEMENT.md` — sửa cây thư mục mục 4.
- `README.md` — bổ sung module list, biến môi trường, lệnh B2 test.
- `AZ-Workbase Skills/PLAN_AVATAR_LEAVE_ATTACHMENT_BACKBLAZE_B2.md` — cập nhật tiến độ mục 9.

**Notes:**
> Chưa code module `uploads/` thật (entity `avatarUrl`, DTO presign, controller/service) — đó vẫn là
> việc tiếp theo, đi theo đúng thứ tự đề xuất ở mục 10 của file PLAN. Các bước setup B2 còn lại (App Key
> scope đúng bucket, CORS rule qua B2 CLI, điền secret thật vào `.env.development`/Vercel dashboard) vẫn
> ⏳ chưa làm.

---

---

## [2026-09-10] | Audit BE Position (Phase 1+2) + fix 2 bug thật + granular CRUD permission | Status: Success

**Actor:** Agent

**Bối cảnh:** Audit lại toàn bộ BE Position (Phase 1 + Phase 2 của
`PLAN_POSITION_FIELD_VISIBILITY_ASSIGNMENT_GROUPS.md`, đã code ở phiên trước) trước khi bắt đầu triển
khai FE, theo yêu cầu chủ dự án. Lưu ý: 1 phiên trước đó có báo cáo đã append entry log này + thêm test
`findAllPublic()` nhưng khi audit thật KHÔNG thấy 2 việc đó tồn tại trong repo (pattern "báo cáo nhưng
chưa thật sự push/lưu" đã ghi nhận ở mục "Key learnings" của project) — entry này mới là bản ghi thật.

**Đã xác nhận đúng (không cần sửa):** `positionId` đã có trong `JwtStrategy.validate()`,
`positions.view` đã tách riêng khỏi `positions.manage` (Manager list được Position khi tạo nhân viên),
3 luồng tạo tài khoản (tự đăng ký / Admin tạo / Admin sửa) đều có field `positionId` đối xứng
`departmentId`, 3 lớp bypass admin (`PermissionGuard`, `RolesService.getMyPermissions`,
`LinkGroupManagersService`) còn nguyên vẹn. `tsc --noEmit` + `nest build` sạch, `jest`: 24/24 suites,
452/452 tests pass trước khi sửa gì thêm.

**Bug/thiếu sót phát hiện thêm + đã sửa trong phiên này:**
1. `DELETE /positions/:id` gate chung `positions.manage` với tạo/sửa - không tách được quyền theo yêu
   cầu "đủ CRUD, Admin bật/tắt chi tiết từng quyền". Thêm permission `positions.delete` riêng (migration
   `1780600000000-AddPositionsDeletePermission.ts`, seed CHỈ `admin`, mirror đúng
   `departments.manage`/`departments.delete`), đổi decorator endpoint DELETE.
2. `UsersService.findOne()`/`findAll()`/`listTrash()`/`findPendingApprovals()` không join quan hệ
   `position` (chỉ join `department`) - response API thiếu object `position`, FE không hiển thị được tên
   Vị trí dù `positionId` đã lưu đúng. Thêm `'position'` vào relations/`leftJoinAndSelect` ở cả 4 chỗ.

**Cố tình CHƯA sửa (ngoài phạm vi):** `UsersService.findById()` (dùng bởi `JwtStrategy.validate()` mọi
request + `GET /users/me`) không load relation nào (kể cả `department`) - bug CŨ, có sẵn từ trước Position,
không đụng vào vì đây là hot path chạy mọi request đã đăng nhập.

**Files Changed:**
- `backend/src/database/migrations/1780600000000-AddPositionsDeletePermission.ts` (mới)
- `backend/src/modules/positions/positions.controller.ts` — đổi `@RequirePermission` endpoint DELETE
- `backend/src/modules/users/users.service.ts` — thêm relation `'position'` ở 4 method
- `AZ-Workbase Skills/PERMISSIONS.md` — cập nhật mục 1.8, mục 2 (bảng permission)

**Verify thật:** `tsc --noEmit` sạch, `nest build` sạch, `jest`: 24/24 suites, 452/452 tests pass (không
regression) sau khi sửa.

**Còn lại (chưa làm, thuộc phạm vi FE - lượt tiếp theo):** trang CRUD `/vi-tri`, field chọn Vị trí ở form
tạo/sửa nhân viên + form đăng ký công khai, tab "Theo Vị trí" ở trang Phân quyền, hiển thị Vị trí ở
Profile, mục nav-config.

---

## [2026-09-10] | Wire FE tab "Theo Vị trí" vào trang Phân quyền (hoàn tất Phase 2 Position ở FE) | Status: Success

**Actor:** Agent

**Bối cảnh:** `git clone` lại bản mới nhất (commit `7138b58`), đọc trực tiếp code thật (không dựa
transcript phiên trước dán vào chat). Xác nhận: BE Position (Phase 1+2, bao gồm `positions.delete`
tách riêng, DI fix `UsersModule` import `PositionsModule`) đã đúng như báo cáo — `tsc --noEmit`,
`nest build`, `jest` (24/24 suites, 452/452 tests) đều sạch trước khi sửa gì thêm.

Phát hiện: `PositionOverridesPanel.tsx`, `positions.api.ts`, `usePositions.ts`, và các hook
`usePositionOverrides`/`useUpdatePositionOverride`/`useDeletePositionOverride` trong `useRoles.ts`
đã có sẵn (đúng như commit log), NHƯNG `PositionOverridesPanel` là **file mồ côi** — chưa được
import/mount ở đâu cả. Drawer "Ma trận quyền" (`RolePermissionsDrawer` trong `phan-quyen/page.tsx`)
chỉ có 2 tab (`global`/`department`), thiếu hẳn tab thứ 3 dù tên commit "Add PositionOverridePanel in
phan-quyen page" gợi ý đã xong.

**Đã làm (frontend, `frontend/src/app/(dashboard)/phan-quyen/page.tsx`):**
1. Import `PositionOverridesPanel`, `useUpdatePositionOverride`, `useDeletePositionOverride`.
2. `RolePermissionsEditor`: thêm prop `positionId?: number` mirror `departmentId` — mở rộng
   `isSaving`, `isOverridden`, và `handleSave` (gộp chung nhánh diff-tính-override cho cả 2 loại,
   chỉ rẽ nhánh mutation gọi ở cuối: `updateDeptMutation`/`deleteDeptMutation` vs
   `updatePosMutation`/`deletePosMutation`).
3. `RolePermissionsDrawer`: tab state đổi `'global' | 'department'` → thêm `'position'`, Segmented
   thêm option "Theo Vị trí", nhận thêm prop `canManagePositions`, render `PositionOverridesPanel`
   khi `tab === 'position'`.
4. `PhanQuyenPage`: thêm `canManagePositions = can('positions.view')`, truyền xuống
   `RolePermissionsDrawer`.

**Verify thật:**
- Backend: `tsc --noEmit` sạch, `nest build` sạch, `jest` 24/24 suites/452/452 tests pass (không
  đụng BE trong phiên này, chỉ verify lại để chắc chắn trước khi báo "đủ điều kiện" ở lượt trước).
- Frontend: `npx tsc --noEmit` — 3 lỗi thấy được (`logo.png` module not found ở 2 file,
  `styled-jsx` prop `jsx` ở `CountBadge.tsx`) đã xác nhận là **lỗi môi trường sandbox pre-existing**
  (thiếu `next-env.d.ts` chưa generate, không liên quan thay đổi trong phiên này — đã `git stash`
  đối chiếu, y hệt lỗi trước khi sửa). `npm run build` (Next.js 16, Turbopack) chạy **sạch hoàn
  toàn**, generate đủ 26 route tĩnh bao gồm `/phan-quyen`, không có lỗi TypeScript nào trong quá
  trình `Running TypeScript` của build thật.

**Files Changed:**
- `frontend/src/app/(dashboard)/phan-quyen/page.tsx` — wire `PositionOverridesPanel` vào Drawer (chi
  tiết ở trên).
- `AZ-Workbase Skills/PERMISSIONS.md` — cập nhật mục 1.8, ghi rõ FE tab "Theo Vị trí" đã xong.

**Còn lại (ngoài phạm vi phiên này, thuộc Phase 3/4 của PLAN_POSITION...):** UI Visibility Rules (ẩn
field/tab dữ liệu khách hàng theo Role×Phòng ban×Position — bảng `ui_visibility_rules` CHƯA tồn tại,
CHƯA có migration nào cho bảng này) và Assignment Group Config (nhóm phụ trách tự cấu hình). Đây
chính là phần "quyền nhỏ/chi tiết hơn Global và Department override" nếu chủ dự án muốn tiếp tục
theo đúng tinh thần mục 1/3 của PLAN — cần xác nhận lại phạm vi trước khi code (bảng mới, migration
mới, helper ẩn field ở service layer).

## [2026-09-10 13:02] | Wire UI Visibility (Phase 3) vào hệ thống thật + seed Position mẫu + spec còn thiếu | Status: Success

**Actor:** Agent

**Bối cảnh:** `git clone` lại bản mới nhất (commit `a8cec5b "Update: ui-visibility add dto, constant and
service"`), đọc trực tiếp code thật. Xác nhận: `UiVisibilityRule` entity, migration
`1780700000000-CreateUiVisibilityRules.ts`, DTOs, và `UiVisibilityService` (merge 3 tầng
Position->Department->Global, `stripHiddenCustomerFields()`) đã viết đúng — NHƯNG chưa có
`Module`/`Controller`, chưa đăng ký ở `app.module.ts`, và `CustomersService` chưa gọi strip field
nào cả (code "chết", không có tác dụng thật trên response API).

**Đã làm (phần 1 - wire UI Visibility vào hệ thống thật):**
1. `backend/src/modules/ui-visibility/ui-visibility.controller.ts` (mới) — 3 endpoint admin CRUD
   (`GET/PUT/DELETE roles/:id/ui-visibility-rules`, gate `roles.manage`) + 1 endpoint self-service
   `GET /ui-visibility/my-hidden` (không cần permission, ai cũng xem được của bản thân).
2. `backend/src/modules/ui-visibility/ui-visibility.module.ts` (mới) — export `UiVisibilityService`.
3. `backend/src/app.module.ts` — import `UiVisibilityModule`.
4. `backend/src/modules/customers/customers.module.ts` — import `UiVisibilityModule`.
5. `backend/src/modules/customers/customers.service.ts` — inject `UiVisibilityService`, gọi
   `getHiddenElementKeys()` + `stripHiddenCustomerFields()` ở CUỐI `findAll()`/`findOne()` (2 tham số
   mới `callerDepartmentId`/`callerPositionId`, optional, không phá lời gọi cũ).
6. `backend/src/modules/customers/customers.controller.ts` — `findAll()`/`findOne()` truyền thêm
   `user.departmentId`/`user.positionId` xuống service.
7. `backend/src/modules/customers/customers.service.spec.ts` — thêm mock `UiVisibilityService`
   (provider mới làm 1 suite fail DI trước khi sửa).

**Đã làm (phần 2 - theo yêu cầu tiếp theo trong lượt này):**
8. `backend/src/database/migrations/1780800000000-SeedSamplePositions.ts` (mới) — seed data-only
   migration, KHÔNG đổi schema, nạp 7 Position mẫu đúng ví dụ trong PLAN mục 1: `ceo`, `hr`, `it`,
   `director` (Admin-tier), `content`, `editor`, `media` (Employee-tier, phòng Marketing).
   `department_id` tra theo TÊN phòng ban (không hardcode id, vì id khác nhau giữa các môi trường
   dùng chung migration này), fallback NULL nếu không tìm thấy tên khớp — idempotent qua
   `ON DUPLICATE KEY UPDATE code = code`. `is_system = FALSE` cho toàn bộ (data mẫu, không phải
   Position lõi bị code hardcode phụ thuộc — đã grep xác nhận không có chỗ nào so sánh cứng theo
   `code` Position).
9. `backend/src/modules/ui-visibility/ui-visibility.service.spec.ts` (mới, spec còn thiếu) — 21 test:
   bypass admin, opt-out mặc định khi bảng trống, thứ tự merge Global->Department->Position, cache
   TTL + `invalidate()`, `stripHiddenCustomerFields()` cho từng element_key, validate
   `upsertRoleRules()`/`deleteRoleRules()` (role/department/position không tồn tại, set cả
   departmentId+positionId, element_key sai danh mục, rollback transaction khi lỗi), `getRoleRules()`
   gom đúng 3 nhóm.

**Verify thật:** `tsc --noEmit` sạch, `nest build` sạch, `jest`: 25/25 suites, 473/473 tests pass
(452 cũ + 21 mới, không regression).

**Còn lại (chưa làm, lượt sau):**
- FE: hook `useMyHiddenElements`, ẩn cột + filter trên bảng khách hàng theo `element_key`, ẩn field
  trong modal chi tiết (Sales/Marketing phụ trách), tab thứ 3 "Hiển thị dữ liệu" ở trang `/phan-quyen`
  (song song 2 tab Action Permission đã có).
- Tab `deposits`/`assignments`/`groups` ở modal chi tiết khách hàng — ẩn thuần FE theo `tab:*`
  element_key (API con đã tự gate riêng, không dựa vào ẩn tab FE làm lớp bảo mật duy nhất).
- Bảng "Quản lý phụ trách" (Assignment Group Config) — CHƯA bắt đầu, phase riêng theo yêu cầu gốc.
- File migration seed Position (`1780800000000`) mới viết trong sandbox — CHƯA chạy trên DB thật,
  người dùng cần tự `npm run migration:run` sau khi copy file vào đúng vị trí.


## [2026-09-10 14:10] | Trang CRUD /vi-tri (Position) + Drawer cấu hình UI Visibility theo Vị trí | Status: Success

**Actor:** Agent

**Bối cảnh:** `git clone` fresh, xác nhận commit mới nhất thật `bf1a467`. Đọc HANDOFF cuối
`WORKFLOW_LOG.md` (mục "CHƯA làm" #1 và #3) — BE Position + UI Visibility đã đầy đủ từ trước,
nhưng chưa có `page.tsx` nào cho `/vi-tri` cả (Admin trước đây phải thao tác qua Postman/DB).

**Đã làm (chỉ FE, KHÔNG đổi BE):**
- `frontend/src/lib/api/ui-visibility.api.ts` (mới) — client khớp đúng `ui-visibility.controller.ts`
  (4 endpoint: `GET my-hidden`, `GET/PUT/DELETE roles/:id/ui-visibility-rules`).
- `frontend/src/lib/hooks/useUiVisibility.ts` (mới) — `useMyHiddenElements`, `useRoleUiVisibilityRules`,
  `useUpsertUiVisibilityRules`, `useDeleteUiVisibilityRules` (React Query, invalidate cả `my-hidden`
  lẫn cache rule khi lưu — mirror đúng pattern `useInvalidateDepartmentOverrides` ở `useRoles.ts`).
- `frontend/src/app/(dashboard)/vi-tri/page.tsx` (mới) — CRUD Vị trí đầy đủ (mirror cấu trúc
  `/phong-ban`): bảng danh sách (mã/tên/phòng ban gợi ý/mô tả/loại hệ thống-tuỳ chỉnh), Modal
  tạo/sửa (chặn sửa `code` sau khi tạo — đúng `UpdatePositionDto`), Modal xoá (BE tự chặn nếu
  `isSystem` hoặc đang có nhân viên gán, FE không tự đoán trước — theo đúng thông điệp lỗi trả về).
  Gate theo `positions.view`/`positions.manage`/`positions.delete` (redirect `/customers` nếu thiếu
  `positions.view`, khớp pattern `/phong-ban`).
- `frontend/src/app/(dashboard)/vi-tri/PositionVisibilityDrawer.tsx` (mới) — Drawer "Hiển thị dữ liệu"
  mở từ mỗi dòng Vị trí: chọn Role trước (rule luôn gắn 1 Role, 1 Vị trí có thể có nhiều Role) → hiển
  thị TRẠNG THÁI HIỆU LỰC đã merge Global→Position override của đúng Vị trí đó (áp dụng lại đúng
  nguyên tắc `mergeGlobalWithOverride` ở `DepartmentOverridesPanel.tsx`, nhưng cho trục UI Visibility
  thay vì Action Permission) → Switch bật/tắt từng `field:*`/`tab:*` (nhãn tiếng Việt cứng, PHẢI đồng
  bộ tay với `CUSTOMER_ELEMENT_KEYS` ở BE nếu sau này thêm resource/key mới) → nút "Lưu" (PUT replace
  toàn bộ scope Position) + "Gỡ override" (DELETE, quay về dùng chung Toàn cục/Phòng ban). Gate quyền
  `roles.manage` (tái dùng đúng permission BE yêu cầu ở `ui-visibility.controller.ts`, KHÔNG phải
  `positions.manage` — 2 quyền độc lập).
- `frontend/src/lib/nav-config.tsx` — thêm mục sidebar "Vị trí" (`/vi-tri`, icon `IdcardOutlined`),
  gate `positions.view`, đặt ngay sau "Phòng ban" (đã đổi 1 dòng import icon + 1 object NAV_ITEMS).

**Quyết định thiết kế cần lưu ý cho phiên sau:**
- Drawer chỉ cấu hình scope **Position** (khớp đúng bối cảnh trang `/vi-tri`) — scope **Global** và
  **Department** cho UI Visibility (mục #4 cũ trong HANDOFF: tab "Hiển thị dữ liệu" ở Drawer
  `/phan-quyen`) **VẪN CHƯA LÀM** — 2 scope đó nên đặt ở `/phan-quyen` (nơi tự nhiên hơn để so sánh
  cả 3 tầng cùng lúc, giống Action Permission đã làm), không nhét thêm vào đây kẻo trùng UX.
- Effective-state hiển thị trong Drawer CHỈ merge Global + Position (không phải Global + Department +
  Position đầy đủ 3 tầng) vì Drawer không biết trước user sẽ thuộc phòng ban nào khi mang Vị trí này —
  đây là giới hạn CÓ CHỦ Ý, không phải bug (đã ghi rõ trong JSDoc component).

**Verify thật:**
- Backend: KHÔNG đổi gì, không chạy lại (đã verify ở entry trước, không có thay đổi liên quan).
- Frontend: `npm install` sạch. `npx tsc --noEmit`: CHỈ còn đúng 3 lỗi pre-existing giống các lượt
  trước (thiếu `logo.png` trong sandbox ở `layout.tsx`/`not-found.tsx`, kiểu `styled-jsx` ở
  `CountBadge.tsx`) — xác nhận qua `git status --short` là các file đó KHÔNG nằm trong diff của lượt
  này. `npm run build` (Next.js 16 Turbopack) **sạch hoàn toàn**, generate đủ **27 route** (thêm route
  `/vi-tri` mới so với 26 route ở lượt trước).
- 1 lỗi type thật đã sửa trong lúc code: AntD 6 đổi API `Divider` — prop `orientation="left"` (dùng để
  canh trái tiêu đề) giờ chỉ nhận `'horizontal' | 'vertical'` (đổi ý nghĩa hoàn toàn, dùng thay cho
  `type`), API tương ứng để canh tiêu đề trái/phải/giữa đã đổi tên thành `titlePlacement`. Cùng loại
  gotcha với mục 8.4 `SKILL_NEXTJS_FRONTEND.md` (`Space direction` → `orientation`) — nên bổ sung thêm
  ghi chú riêng cho `Divider` vào skill đó nếu phiên sau gặp lại chỗ khác dùng `orientation="left"` cũ.

**Còn lại (chưa làm, theo đúng thứ tự ưu tiên cũ trong HANDOFF trước, trừ mục #1 vừa xong 1 phần):**
1. Dropdown Position song song Role ở form nhân viên/filter/nav-config khác (nếu còn sót).
2. FE thật sự DÙNG `my-hidden` để ẩn cột/field/tab/filter trên `CustomerTable` + Customer Detail Modal
   (route `/vi-tri` mới chỉ có UI CẤU HÌNH rule, chưa có nơi nào ÁP DỤNG rule đó lên bảng khách hàng).
3. Tab "Hiển thị dữ liệu" (scope Global/Department) ở Drawer `/phan-quyen`.
4. Assignment Group Config ("Quản lý phụ trách") — vẫn hoàn toàn chưa bắt đầu, cần viết PLAN trước khi
   code (xem chi tiết đầy đủ ở HANDOFF entry trước, mục 5 — không lặp lại ở đây để tránh phình log).
## [2026-09-11 12:54] | Hoàn thiện Loại đơn nghỉ phép động (spec test + FE + đồng bộ chấm công) | Status: Success

**Actor:** Agent

**Bối cảnh:** Tiếp nối 3 commit trước đó cùng ngày (`Feat: Setup dynamic leave-type`, `Update: Add
migration for it`, `Feat: Setup module leave-type`, `Update: Add api and hooks for leave-type in UI`) -
lượt này verify lại toàn bộ claim của phiên trước bằng code thật (KHÔNG tin transcript), rồi hoàn thiện
3 phần còn thiếu: spec test BE, trang quản lý FE + đăng ký nav, và đồng bộ 3 nơi FE còn dùng enum
`leaveType` cứng (`nghi-phep`, `duyet-phep`, `AttendanceMonthlyTab`) sang đọc động từ `useLeaveTypes()`.

**Files Changed:**
- `backend/src/modules/leave-types/leave-types.service.spec.ts` (MỚI) — 18 test case, mirror đúng
  `customer-statuses.service.spec.ts`: findAll/findOne/getByCode/assertExists/create/update/remove
  (kể cả nhánh fallback khi xoá loại phép đang có đơn dùng).
- `frontend/src/app/(dashboard)/quan-ly-loai-phep/page.tsx` (MỚI) — trang CRUD Loại đơn nghỉ phép,
  mirror `quan-ly-status-khach/page.tsx`, thêm 2 field so với template (`isPaid` Switch,
  `deductsAnnualBalance` Switch) + cột minh hoạ ký hiệu chấm công P/X-2/KL/1-2K theo `isPaid`.
- `frontend/src/lib/nav-config.tsx` — thêm mục sidebar "Quản lý Loại phép" (`/quan-ly-loai-phep`,
  icon `TagOutlined` mới import để tránh trùng icon với mục khác), gate `leave_types.view` (đặt ngay
  trước "Quản lý Status khách"). `layout.tsx` tự động lấy từ `NAV_ITEMS` nên KHÔNG cần sửa thêm.
- `frontend/src/app/(dashboard)/nghi-phep/page.tsx` — bỏ `LEAVE_TYPE_MAP` cứng (5 loại phép hardcode),
  thay bằng `leaveTypeMap`/`leaveTypeOptions` dựng động từ `useLeaveTypes()` (useMemo theo `leaveTypes`):
  dùng cho cột "Loại phép" trong bảng, `MyLeaveMobileCard` (nhận thêm prop `leaveTypeMap`), và dropdown
  "Loại phép" khi tạo đơn (`Select options`) — giờ loại phép tuỳ chỉnh thêm ở `/quan-ly-loai-phep` sẽ
  tự xuất hiện, không cần sửa code.
- `frontend/src/app/(dashboard)/duyet-phep/page.tsx` — tương tự: bỏ `LEAVE_TYPE_MAP` cứng, thay bằng
  `leaveTypeMap` động; áp dụng cho `PendingMobileCard`, `HistoryMobileCard` (cả 2 nhận thêm prop
  `leaveTypeMap`), cột "Loại phép" ở cả `pendingColumns` và `historyColumns`. Trang này không có dropdown
  tạo đơn nên không cần sửa phần Select.
- `frontend/src/app/(dashboard)/attendance-device/AttendanceMonthlyTab.tsx` — bỏ hằng số
  `LEAVE_TYPE_LABEL` cứng + logic `const isUnpaid = leave.leaveType === 'unpaid'` so sánh cứng theo 1
  string duy nhất; thay bằng `leaveTypeInfoMap` (useMemo từ `useLeaveTypes()`, map `code -> {name,
  isPaid}`) — cờ `isPaid` từ DB giờ quyết định đúng dấu chấm công `P`/`X/2` (hưởng lương) hay
  `KL`/`1/2K` (không lương) cho MỌI loại phép, kể cả loại tuỳ chỉnh mới thêm (trước đây loại tuỳ chỉnh
  sẽ luôn bị tính nhầm thành "hưởng lương" vì không khớp chuỗi `'unpaid'`). Giữ fallback
  `leave.leaveType === 'unpaid'` CHỈ dùng khi `leaveTypeInfoMap` chưa load xong hoặc gặp code lạ không
  còn tồn tại trong bảng `leave_types` (dữ liệu cũ), tránh hiển thị sai lúc trang vừa mở.

**Quyết định thiết kế cần lưu ý cho phiên sau:**
- 2 loại phép mới theo yêu cầu ban đầu (`meet_client` "Gặp khách", `late_arrival` "Đi trễ") đã được seed
  sẵn ở migration `1781500000000-CreateLeaveTypes.ts` từ phiên trước (đã verify lại bằng code thật, không
  phải chỉ tin báo cáo) — is_paid mặc định theo đúng yêu cầu gốc: `meet_client` = true (hưởng lương, tính
  P/X-2), `late_arrival` = false (không lương, tính KL/1-2K). Nếu nghiệp vụ thực tế khác đi, sửa trực
  tiếp ở `/quan-ly-loai-phep` (Admin/Assistant), KHÔNG cần sửa code hay chạy lại migration.
- `AttendanceMonthlyTab.tsx` giờ phụ thuộc `useLeaveTypes()` để tính đúng dấu chấm công — nếu API
  `/leave-types` lỗi hoặc chậm, `leaveTypeInfoMap` rỗng tạm thời và toàn bộ đơn nghỉ trong tháng đang xem
  sẽ tạm thời rơi vào nhánh fallback (chỉ đúng cho đúng code `'unpaid'`, các loại phép không lương khác
  sẽ tạm hiển thị SAI thành P/X-2 cho tới khi `useLeaveTypes()` load xong) — chấp nhận được vì
  `staleTime: 60s` của hook khiến lần load sau gần như luôn có cache, nhưng cần biết nếu debug sau này.

**Verify thật:**
- Backend: `npm install` sạch (917 packages). `npx tsc --noEmit`: sạch. `npx jest`: **18/18 pass** riêng
  `leave-types.service.spec.ts`; toàn bộ suite: **525/527 pass** (2 fail còn lại ở `users.service.spec.ts`
  là lỗi CÓ SẴN TỪ TRƯỚC, không liên quan `leave-types` — đã xác nhận qua nội dung lỗi: về xác nhận mật
  khẩu khi gỡ Root Admin cuối cùng).
- Frontend: `npm install` sạch (598 packages). `npx tsc --noEmit`: KHÔNG có lỗi mới, chỉ còn đúng các lỗi
  pre-existing đã ghi nhận ở entry trước (thiếu `logo.png` trong sandbox, kiểu `styled-jsx` ở
  `CountBadge.tsx`) — xác nhận không liên quan diff lượt này. `npm run build` (Next.js 16 Turbopack)
  **sạch hoàn toàn**, generate đủ 27 route (thêm `/quan-ly-loai-phep` so với lượt trước). `npx vitest run`
  toàn bộ: **14/14 pass** (gồm `nav-config.test.tsx` 8 test, permission key `leave_types.view` khớp
  regex `^[a-z_]+\.[a-z_]+$` được test kiểm tra tự động).

**Còn lại (chưa làm, ngoài phạm vi yêu cầu 3 mục của lượt này):**
1. Chưa có UI hiển thị "Ký hiệu chấm công" ở chính trang `/quan-ly-loai-phep` dạng cột riêng dễ nhìn hơn
   (hiện đã có ở bảng, nhưng chưa có phần chú thích tổng hợp riêng như bảng mẫu gốc yêu cầu ban đầu:
   X/X-2/1-2K/P/KL kèm mô tả) — có thể cần nếu người dùng cuối (không phải dev) sẽ tự cấu hình.
2. Chưa viết spec test/E2E cho 3 file FE vừa sửa (`nghi-phep`, `duyet-phep`, `AttendanceMonthlyTab`) —
   hiện tại FE của dự án chỉ có `vitest` cho vài file (`nav-config`, `useMyPermissions`), chưa có coverage
   cho các trang nghiệp vụ chính này (kể cả trước lượt này).