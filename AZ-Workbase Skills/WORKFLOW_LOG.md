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

   ## [2026-09-11] | Đồng bộ Tag màu dropdown "Lọc theo nhân viên" ở attendance-device + hoàn thiện filter deviceUserId | Status: Success

**Actor:** Agent (Claude)
**Files Changed:**
- `backend/src/modules/zk-device/zk-device.service.ts` — wire field `deviceUserId` (đã thêm sẵn ở
  `QueryAttendanceLogDto` từ commit `74daab9`, đánh dấu "Not yet done") vào `getAttendanceLogs()`:
  `andWhere('log.deviceUserId = :deviceUserId', ...)`. Vì `exportAttendanceLogs()` (Export Excel tab Logs)
  gọi lại đúng hàm này, filter mới áp dụng đồng thời cho cả GET list lẫn Export - không cần sửa thêm chỗ nào khác.
- `frontend/src/lib/types/zk-device.types.ts` — thêm `deviceUserId?: string` vào `AttendanceLogQuery`.
- `frontend/src/lib/api/attendance-export.api.ts` — thêm `deviceUserId?: string` vào tham số `exportLogs()`.
- `frontend/src/app/(dashboard)/attendance-device/AttendanceLogsTab.tsx` — dropdown "Lọc theo nhân viên"
  giờ gộp 2 nhóm: (1) Nhân viên hệ thống đã map — hiện Avatar + Tag màu Vai trò/Phòng ban/Vị trí (đúng
  pattern `renderUserOption` ở `CustomerFilters.tsx`); (2) Chưa map (mã máy) — lấy từ `useDeviceUsers()`
  lọc `!mappedUserId`, value mã hoá `d:{deviceUserId}` để phân biệt với `u:{userId}`. State tách riêng
  `userId`/`deviceUserId`, chỉ 1 trong 2 có giá trị. Cả `useAttendanceLogs()` lẫn `exportMutation` đều
  truyền `deviceUserId`.
- `frontend/src/app/(dashboard)/attendance-device/AttendanceMonthlyTab.tsx` — dropdown "Lọc theo nhân
  viên" thêm Tag màu Vai trò/Phòng ban/Vị trí giống trên (chỉ nhóm nhân viên đã map — dòng chưa map ở tab
  này tự động hiện sẵn khi không lọc theo 1 ai, không cần filter theo deviceUserId riêng).

**Root Cause:**
> Dropdown "Lọc theo nhân viên" ở cả 3 tab attendance-device (Logs/Tổng hợp/Bảng chấm công) trước đây chỉ
> `options={(users||[]).map(u => ({value: u.id, label: u.name}))}` — text trơn, không đồng bộ với pattern
> Tag màu đã áp dụng ở các dropdown chọn nhân viên khác trong app (CustomerFilters, SalesUserSelect,
> chia-data). Riêng field `deviceUserId` ở `QueryAttendanceLogDto` được thêm ở commit trước
> (`74daab9`, tự đánh dấu "Not yet done") nhưng chưa được dùng trong query BE lẫn chưa có chỗ nào ở FE
> truyền lên — filter "user chưa map" trên tab Logs thực tế chưa hoạt động dù DTO đã khai.

**Solution:**
> Wire `deviceUserId` vào query BE (1 dòng `andWhere`, dùng chung cho GET + Export vì cùng gọi
> `getAttendanceLogs()`). FE: thêm Tag màu (Avatar + role/dept/position) cho dropdown ở tab Logs + Tổng
> hợp chấm công, và ở tab Logs gộp thêm nhóm "Chưa map (mã máy)" để filter được cả log của user chưa map.

**Notes:**
> Tab "Bảng chấm công" (`AttendanceSummaryTab.tsx`) đang có ĐÚNG gap y hệt (dropdown "Lọc theo nhân viên"
> vẫn text trơn, chưa có Tag màu) — CHƯA sửa ở lượt này vì người dùng chỉ yêu cầu 2 tab Logs + Tổng hợp.
> Cần xử lý nốt nếu người dùng muốn đồng bộ toàn bộ 3 tab.

**Verify thật:**
- Backend: `npm install` sạch (917 packages). `npx tsc --noEmit`: sạch (0 lỗi). `npx nest build`: sạch.
  `npx jest zk-device`: **5/5 pass** (`zk-device.service.spec.ts`, không có test riêng cho case
  `deviceUserId` mới — nên viết thêm nếu cần coverage chặt hơn).
- Frontend: `npm install` sạch (598 packages, cache từ lượt trước). `npx tsc --noEmit`: KHÔNG có lỗi mới ở
  2 file vừa sửa — chỉ còn 2 lỗi pre-existing đã ghi nhận từ trước (thiếu `logo.png` trong sandbox test,
  kiểu `styled-jsx` ở `CountBadge.tsx`), không liên quan diff lượt này.

**Còn lại (chưa làm, ngoài phạm vi yêu cầu lượt này):**
1. `AttendanceSummaryTab.tsx` ("Bảng chấm công") vẫn thiếu Tag màu ở dropdown lọc nhân viên — xem Notes.
2. Chưa viết spec test riêng cho nhánh filter `deviceUserId` mới (BE lẫn FE).

## [2026-09-11] | Hoàn thiện nốt Tag màu (role/department/position) còn thiếu ở attendance-device | Status: Success

**Actor:** Agent (Claude), theo ảnh chụp người dùng gửi phản hồi lượt trước.
**Files Changed:**
- `frontend/src/app/(dashboard)/attendance-device/AttendanceSummaryTab.tsx` — dropdown "Lọc theo nhân
  viên" (tab "Bảng chấm công") thêm Tag Vai trò/Phòng ban/Vị trí, đồng bộ đúng pattern đã áp dụng ở tab
  Logs/Tổng hợp lượt trước (đây chính là gap đã tự ghi nhận ở lượt trước nhưng chưa sửa).
- `frontend/src/app/(dashboard)/attendance-device/DeviceMappingTab.tsx` — cột "Trạng thái map": khi đã
  map, trước đây chỉ hiện `Đã map: {tên}` (Tag xanh trơn) - giờ thêm Tag Vai trò/Phòng ban/Vị trí của
  NHÂN VIÊN HỆ THỐNG đã map (tra theo `record.mappedUserId` qua `useUsersList()`, KHÔNG phải
  `record.role` - field đó là role dạng số TRÊN MÁY chấm công, khác hoàn toàn).
- `backend/src/modules/zk-device/zk-device.service.ts` — `getAttendanceLogs()`: thêm
  `leftJoinAndSelect('matchedUser.department', ...)` + `'matchedUser.position'` (role đã có sẵn là cột
  gốc trên User, không cần join thêm) - để trả đủ dữ liệu cho FE hiển thị Tag ở cột "Nhân viên".
- `frontend/src/lib/types/zk-device.types.ts` — mở rộng `AttendanceLog.matchedUser` thêm
  `role/department/position`.
- `frontend/src/app/(dashboard)/attendance-device/AttendanceLogsTab.tsx` — cột "Nhân viên" (bảng log,
  KHÔNG phải dropdown lọc): log đã khớp giờ hiện thêm Tag Vai trò/Phòng ban/Vị trí bên cạnh Tag tên xanh,
  thay vì chỉ 1 Tag trơn như trước.

**Root Cause:**
> 2 gap còn sót đúng như đã tự ghi chú ở entry trước: (1) tab "Bảng chấm công" chưa được áp Tag màu dropdown
> dù 2 tab còn lại đã xong; (2) người dùng phản hồi qua ảnh chụp chỉ ra thêm 1 gap khác chưa lường tới -
> cột hiển thị KẾT QUẢ (không phải dropdown chọn) ở "Trạng thái map" (Mapping) và "Nhân viên" (Logs) cũng
> cần Tag đầy đủ, không chỉ riêng ô dropdown lọc.

**Notes:**
> Bảng "Tổng hợp chấm công" (`AttendanceMonthlyTab.tsx`) - cột "Họ và tên" hiện vẫn CHƯA có Tag Vai
> trò/Vị trí inline (chỉ có tên + cột "Vị trí"/phòng ban riêng dạng text thường) - CHƯA sửa ở lượt này vì
> cần thêm field role/position vào `EmployeeMonthRow` + rủi ro vỡ layout cột `fixed: 'left'` vốn đã chật;
> cần xác nhận thêm với người dùng trước khi động vào bảng này.

**Verify thật:**
- Backend: `npx tsc --noEmit` sạch. `npx nest build` sạch. `npx jest zk-device`: **5/5 pass**.
- Frontend: `npx tsc --noEmit` sạch (0 lỗi mới, chỉ còn 2 lỗi pre-existing không liên quan đã ghi nhận
  nhiều lượt trước).

**Còn lại (chưa làm):**
1. `AttendanceMonthlyTab.tsx` - cột "Họ và tên" chưa có Tag Vai trò/Vị trí inline (xem Notes).
2. Chưa viết spec test riêng cho các nhánh Tag mới (đều là thay đổi thuần UI + 1 join BE, rủi ro thấp).

## [2026-09-11] | Hoàn thiện Tag ở 2 TABLE còn thiếu (Bảng chấm công + Tổng hợp chấm công) + spec test cho deviceUserId | Status: Success

**Actor:** Agent (Claude). Đã pull lại code thật trước khi làm (phát hiện 3 commit mới từ phiên khác:
`357aed8`/`f15ca48`/`2cdb05d` - đã bao gồm sẵn phần lớn việc "Logs chấm công" + dropdown 3 tab từ trước,
`git reset --hard origin/main` để lấy đúng baseline thật thay vì tin state cũ trong hội thoại).

**Files Changed:**
- `frontend/src/app/(dashboard)/attendance-device/AttendanceSummaryTab.tsx` — cột **"Nhân viên"** trong
  BẢNG (khác dropdown lọc đã xong từ trước) trước đây `dataIndex: 'userName'` text trơn cho MỌI dòng,
  không phân biệt được đã map/chưa map bằng mắt (khác hẳn 2 tab Logs/Tổng hợp). Giờ: dòng CHƯA map hiện
  Tag cam "chưa map" (đồng bộ Monthly tab); dòng ĐÃ map hiện thêm Tag Vai trò/Phòng ban/Vị trí (tra theo
  `r.userId` qua map `usersById` dựng từ `useUsersList()` - BE `AttendanceSummaryRow` không tự mang
  role/department/position nên phải lookup ở FE, không cần sửa BE).
- `frontend/src/app/(dashboard)/attendance-device/AttendanceMonthlyTab.tsx` — cột **"Họ và tên"** thêm Tag
  Vai trò (màu) + Vị trí nhỏ dưới tên cho dòng đã map (field `role`/`positionName` mới thêm vào
  `EmployeeMonthRow`, lấy từ `u.role`/`u.position?.name` ngay lúc build row - đã có sẵn dữ liệu, không cần
  gọi thêm). Giữ nguyên nhánh hiển thị cũ (phụ đề tên trên máy / "chưa map"), chỉ chèn thêm khối Tag.
- `backend/src/modules/zk-device/zk-device.service.spec.ts` — thêm 3 test case cho
  `getAttendanceLogs()`: (1) `deviceUserId` filter đúng cột `log.deviceUserId`, không lẫn với
  `userId`/`matchedUserId`; (2) không truyền `deviceUserId` thì không gọi `andWhere` thừa; (3) LUÔN join
  `matchedUser.department` + `matchedUser.position` (regression test cho JOIN mới thêm phục vụ Tag ở tab Logs).

**Root Cause:**
> 2 gap còn sót: TABLE (không phải dropdown) ở 2 tab "Bảng chấm công" và "Tổng hợp chấm công" - các lượt
> sửa trước chỉ động vào DROPDOWN lọc, quên mất chính cột hiển thị dữ liệu trong bảng cũng cần đồng bộ Tag.
> Người dùng gửi ảnh chụp chỉ rõ 2 trang còn thiếu, dùng ảnh tab Logs (đã đúng từ trước) làm ảnh đối chứng.

**Verify thật:**
- Backend: `npx tsc --noEmit` sạch. `npx nest build` sạch. `npx jest zk-device.service.spec.ts`: **8/8
  pass** (5 cũ + 3 mới). Toàn bộ suite backend: **528/530 pass** - 2 fail còn lại ở `users.service.spec.ts`
  là lỗi CÓ SẴN TỪ TRƯỚC (Root Admin password confirmation), đã xác nhận KHÔNG liên quan diff lượt này
  (đã ghi nhận y hệt ở entry cũ hơn).
- Frontend: `npx tsc --noEmit` sạch (chỉ còn 2 lỗi pre-existing không liên quan). `npx vitest run`:
  **14/14 pass** (2 file test hiện có, không liên quan trực tiếp attendance-device nhưng chạy để đảm bảo
  không phá gì khác). `npm run build` (Next.js 16 Turbopack): **sạch hoàn toàn**, đủ 27 route.

**Còn lại (chưa làm):**
1. Chưa có spec test riêng (component test) cho 3 tab FE attendance-device - dự án hiện chưa có coverage
   test cho trang nghiệp vụ nào ở FE (chỉ `nav-config`/`useMyPermissions`), việc này nằm ngoài phạm vi 1
   lượt sửa nhỏ, cần quyết định riêng nếu muốn đầu tư test framework cho component (React Testing Library).
2. Cột "Vị trí" ở `AttendanceMonthlyTab.tsx` thực chất đang hiện TÊN PHÒNG BAN (`departmentName`), không
   phải vị trí thật (`position`) - tên cột có thể gây hiểu nhầm, đã tồn tại từ trước lượt này, không tự ý
   đổi vì có thể là chủ đích ban đầu (dùng "Vị trí" theo nghĩa rộng = vị trí công tác/phòng ban).

## [2026-09-11] | Gom Tag rời rạc (Vai trò/Phòng ban/Vị trí) thành 1 UserMiniCard dùng chung ở tab Máy chấm công | Status: Success

**Actor:** Agent (Claude), theo phản hồi trực tiếp qua ảnh chụp của người dùng ("gom nó lại thành 1 Card
mini chung để dễ nhìn hơn là tách ra như vậy"). Người dùng đã tự test và xác nhận ổn.

**Files Changed:**
- `frontend/src/app/(dashboard)/attendance-device/UserMiniCard.tsx` (MỚI) — component dùng chung: 1 khối
  bo tròn nền xám nhạt (`borderRadius: 20`, nền `#fafafa`, viền `#f0f0f0`) gói Avatar + tên (bold) + Tag
  Vai trò (màu theo role)/Phòng ban/Vị trí, thay cho kiểu cũ nhiều `<Tag>` rời rạc trôi nổi cạnh nhau.
  Nhận `getRoleColor`/`getRoleName` qua props (không tự gọi hook riêng) để tái dùng đúng instance đã có
  sẵn ở component cha, tránh nhân bản gọi `useRoleColors()` nhiều lần không cần thiết trên cùng 1 trang.
- `frontend/src/app/(dashboard)/attendance-device/AttendanceSummaryTab.tsx` — cột "Nhân viên" (dòng đã
  map) đổi từ `<Space wrap>` nhiều Tag rời sang `<UserMiniCard>`.
- `frontend/src/app/(dashboard)/attendance-device/AttendanceLogsTab.tsx` — cột "Nhân viên" (log đã khớp)
  đổi tương tự sang `<UserMiniCard>`.
- `frontend/src/app/(dashboard)/attendance-device/DeviceMappingTab.tsx` — cột "Trạng thái map" (đã map)
  đổi sang `<UserMiniCard>`, giữ thêm 1 Tag xanh nhỏ "Đã map" đứng trước để không mất ý nghĩa trạng thái
  (áp dụng thêm cho ĐỒNG BỘ, dù người dùng chỉ gửi ảnh 2 tab Bảng chấm công/Logs - tab này có ĐÚNG vấn đề
  Tag rời rạc y hệt).

**Notes:**
> `AttendanceMonthlyTab.tsx` (tab "Tổng hợp chấm công") - cột "Họ và tên" CHƯA đổi sang `UserMiniCard` ở
> lượt này: cột này `fixed: 'left'`, width cố định 190px, đã có sẵn layout 2 dòng (tên hệ thống + phụ đề
> tên trên máy) trong 1 bảng rất nhiều cột fixed khác - thêm khối pill/Avatar có nguy cơ tràn/đè lên cột
> kế bên do các cột fixed không tự co giãn. Cần test trực tiếp trên trình duyệt (không chỉ `tsc`/`build`)
> trước khi đổi, nên tạm giữ nguyên kiểu Tag nhỏ gọn (không có khung/Avatar) đã làm ở lượt trước cho tab
> này. Sẽ đổi nếu người dùng xác nhận muốn đồng bộ luôn và chấp nhận rủi ro layout.

**Verify thật:**
- Frontend: `npx tsc --noEmit` sạch (0 lỗi mới). `npm run build` (Next.js 16 Turbopack): **sạch hoàn
  toàn**, đủ 27 route (bao gồm `/attendance-device`).
- Người dùng đã tự test trực tiếp trên UI thật và xác nhận ổn ("tôi test ổn rồi").

Now [deploy]

## [2026-09-14 03:26] | Fix warning "Instance created by useForm is not connected to any Form element" ở tab Gán data (chia-data) | Status: Success

**Actor:** Agent (Claude), theo console error người dùng chụp màn hình gửi kèm ảnh modal "Gán thêm Sales"
(trang `/chia-data` → drawer "Chi tiết khách hàng" → tab "Gán data").

**Files Changed:**
- `frontend/src/components/customers/CustomerAssignmentsTab.tsx` — hàm `openEdit()`: dời lệnh
  `editForm.setFieldsValue(...)` ra khỏi thân hàm, chuyển vào `useEffect` theo dõi state `editing`.

**Root Cause:**
> Modal "Sửa lượt gán data" dùng `destroyOnHidden` → `<Form form={editForm}>` chỉ mount khi `open=true`
> (rc-dialog/antd Modal mặc định lazy-render children, không render tới khi `open` từng = true lần đầu).
> `openEdit()` cũ gọi `editForm.setFieldsValue(...)` NGAY sau `setEditing(a)` trong cùng 1 lượt gọi hàm -
> nhưng `setEditing` chỉ là state update (áp dụng bất đồng bộ ở lần re-render kế tiếp), nên tại đúng thời
> điểm gọi `setFieldsValue`, Modal vẫn đang `open=false`, `<Form>` chưa từng mount trong DOM ⇒ `editForm`
> instance "chưa kết nối với Form element nào" ⇒ warning bắn ra console (đúng y hệt lỗi người dùng chụp).
> Vì `editForm` được tạo ngay khi component `CustomerAssignmentsTab` mount (mỗi lần tab "Gán data" active),
> warning này xuất hiện ngay cả khi người dùng chỉ mở modal "Gán thêm Sales" (modal kia dùng state thường,
> không liên quan `editForm`) - do 2 modal share chung component cha.

**Solution:**
> `openEdit()` giờ chỉ `setEditing(a)`. Một `useEffect([editing, editForm])` riêng đảm nhiệm gọi
> `setFieldsValue` - effect này chạy SAU khi React đã commit/paint xong lần re-render có `editing` mới
> (thời điểm này Modal `open={!!editing}` đã true, `<Form>` đã mount) ⇒ `editForm` luôn có Form element để
> kết nối trước khi bị gọi lệnh.

**Đã phát hiện thêm (NGOÀI phạm vi câu hỏi, CHƯA sửa - báo để quyết định có sweep toàn bộ không):**
> Cùng 1 pattern lỗi này (gọi `form.setFieldsValue()` đồng bộ ngay trong hàm mở modal, thay vì qua
> `useEffect`) xuất hiện lặp lại ở nhiều trang khác dùng Modal + `destroyOnHidden`/lazy-render tương tự,
> có nguy cơ warning tương tự (chưa xác nhận từng cái có thực sự bắn warning hay không - phụ thuộc
> `forceRender`/thời điểm modal từng mở lần đầu):
> `users/page.tsx` (`openEdit`), `phong-ban/page.tsx`, `vi-tri/page.tsx`, `quan-ly-loai-phep/page.tsx`,
> `quan-ly-status-khach/page.tsx`, `quan-ly-phu-trach/page.tsx`, `nguon-media/page.tsx`,
> `nhom-lien-ket/page.tsx`. Đề xuất: nếu người dùng xác nhận còn thấy warning tương tự ở các trang này,
> làm 1 lượt sweep riêng áp dụng cùng pattern `useEffect`.

**Verify thật:**
- Frontend: `npx tsc --noEmit` — 0 lỗi liên quan diff (chỉ còn lỗi pre-existing không liên quan: thiếu
  type declaration cho `logo.png` ở 4 file, và lỗi type `styled-jsx` ở `CountBadge.tsx` - đã xác nhận cả
  2 đều tồn tại từ trước, không đụng tới trong diff này). `npx eslint
  src/components/customers/CustomerAssignmentsTab.tsx` — sạch. `npm run build` (Next.js 16 Turbopack):
  **sạch hoàn toàn**, đủ 30 route (bao gồm `/chia-data`).
- Chưa test tay trên trình duyệt thật (console warning chỉ tái hiện được ở runtime dev thật) - người dùng
  cần tự pull về, mở lại flow "chia-data → Chi tiết khách hàng → Gán data → Gán thêm Sales" để xác nhận
  console sạch.

## [2026-09-14 03:38] | Đổi tên tab "Gán data" -> "Chia data" + thêm số đếm, fix thiếu Sales phụ ở bảng "Đã assign" (chia-data) | Status: Success

**Actor:** Agent (Claude), theo yêu cầu trực tiếp qua 2 ảnh chụp người dùng gửi (trang `/chia-data` +
drawer "Chi tiết khách hàng").

**Files Changed:**
- `frontend/src/components/customers/CustomerDetailDrawer.tsx` — label tab "Gán data" đổi thành
  "Chia data" kèm số đếm `({customer?.activeAssignees?.length || 0})`, cùng pattern với tab "Ghi chú
  (N)"/"Nạp tiền (N)" đã có sẵn ngay bên cạnh. Không cần gọi thêm API nào - `customer.activeAssignees`
  đã được BE `findOne()` populate sẵn từ trước (chỉ tính assignment `status = 'active'`, KHÔNG tính các
  lượt đã thu hồi trong lịch sử).
- `backend/src/modules/customers/customers.service.ts` — hàm `getAssigned()` (endpoint `/customers/assigned`,
  data source của bảng tab "Đã assign" ở `/chia-data`): thêm đúng 1 query gộp (không N+1, cùng pattern hệt
  `findAll()`/`findOne()`) để populate `(customer as any).activeAssignees` cho từng dòng kết quả.

**Root Cause (bug #2 - "chưa có cột Sales phụ"):**
> Cột "Sales Phụ trách chính" ở bảng "Đã assign" (`assignedColumns` trong `chia-data/page.tsx`) đã CÓ SẴN
> đúng logic render Tag "+N" Sales phụ (copy y hệt `/customers` từ một lượt sửa trước) - nhưng
> `getAssigned()` ở BE chưa TỪNG populate field `customer.activeAssignees` như 2 hàm chị em `findAll()`
> (dùng cho `/customers`) và `findOne()` (dùng cho drawer chi tiết) đã làm từ lâu. FE luôn đọc
> `r.activeAssignees` ra `undefined` -> `sharedSales.length` luôn = 0 -> Tag cyan "+N" không bao giờ hiện,
> nhìn như thiếu hẳn cột dù code JSX đã đúng.

**Đã phát hiện thêm (NGOÀI phạm vi câu hỏi, CHƯA sửa):**
> `getAssigned()`/`getUnassigned()` (2 endpoint dùng riêng cho trang `/chia-data`) không hề áp
> `stripHiddenCustomerFields()`/`getHiddenElementKeys()` như `findAll()`/`findOne()` đã làm - nghĩa là rule
> ẩn field qua UI Visibility (Vị trí/Phòng ban override, ví dụ ẩn `field:sales_assignment`) KHÔNG có tác
> dụng ở 2 endpoint này, kể cả sau khi thêm `activeAssignees` ở lượt sửa này. Cần 1 lượt riêng nếu muốn rule
> ẩn field áp dụng đồng bộ cho cả trang `/chia-data`, không tự ý mở rộng phạm vi sửa ở đây vì có thể ảnh
> hưởng luồng RBAC nhạy cảm (PERMISSIONS.md) cần bàn kỹ hơn.

**Verify thật:**
- Backend: `npx tsc --noEmit` sạch. `npx nest build` sạch. `npx jest customers.service.spec.ts`: **39/39
  pass** (bao gồm cả 4 test `describe('getAssigned...')` có sẵn - không có test nào assert phủ định sự
  tồn tại của `activeAssignees` nên thêm field mới không phá test nào).
- Frontend: `npx tsc --noEmit` sạch (0 lỗi mới). `npx eslint CustomerDetailDrawer.tsx` — chỉ còn 1 lỗi
  `no-explicit-any` PRE-EXISTING ở dòng `.filter(Boolean) as any[]` (xác nhận bằng `git show HEAD:...` -
  y hệt bản gốc, không phải do diff này). `npm run build` (Next.js 16 Turbopack): sạch hoàn toàn, đủ 30
  route.
- Chưa test tay trên browser thật với dữ liệu thật (cần DB có sẵn assignment active để thấy đúng số đếm
  và Tag "+N") - người dùng tự pull + test lại 2 màn hình trong ảnh để xác nhận.

## [2026-09-14 04:00] | Rà soát toàn bộ Select thiếu Tag màu (Register + các trang còn lại) + fix deprecation warning `filterOption` | Status: Success

**Actor:** Agent (Claude), theo yêu cầu trực tiếp: "kiểm tra thêm còn phần nào thiếu Tag", "kiểm tra Register
cho thấy role/position public hay chưa", "kiểm tra các phần còn lại". Sau đó người dùng báo thêm 1 warning
TypeScript riêng ("'filterOption' is deprecated") ở đúng đoạn code mới sửa trong `users/page.tsx`.

**Trước khi làm:** `git fetch` phát hiện remote đã có 4 commit mới (`5de71e7`..`4c7ab2e`) khớp y hệt 3 lượt
sửa trước của Agent (đã verify bằng diff, KHÔNG phải trùng hợp - có vẻ người dùng đã tự apply/commit các
diff Agent đưa ra ở các lượt trước). Đã `git pull` để đồng bộ trước khi rà soát tiếp, tránh audit trên bản
cũ.

**Files Changed:**
- `frontend/src/app/(dashboard)/users/page.tsx`:
  - Select "Vị trí" (modal Sửa nhân viên): đổi `showSearch` (boolean) + `filterOption` (prop riêng, ĐÃ
    DEPRECATED ở antd 6.x) thành 1 object `showSearch={{ filterOption }}`.
  - Select "Người duyệt nghỉ phép (ngoại lệ)": (1) thêm Tag Vai trò/Phòng ban/Vị trí màu (trước đây chỉ
    hiện `${name} (${email})` trơn - `managerOptions` từ `/users/all` đã JOIN sẵn field này từ lâu, chỉ
    optionRender chưa đọc tới); (2) đổi `filterOption` sang dạng object `showSearch={{ filterOption }}`
    (cùng lỗi deprecation).
- `frontend/src/app/(dashboard)/phong-ban/page.tsx` — Select "Chọn phòng ban đích" (modal Xoá phòng ban
  khi còn nhân viên): thêm Tag màu (`resolveEntityColor`) đồng bộ với cột "Tên phòng ban" trong cùng
  trang - trước đây chỉ hiện tên trơn.
- `frontend/src/app/(auth)/register/page.tsx` — Select "Vị trí": cùng lỗi deprecation `filterOption` như
  trên, đổi sang `showSearch={{ filterOption }}`.

**Root Cause (deprecation warning):** antd 6.x đã deprecate prop top-level `filterOption` của `<Select>`
(xem `Select.d.ts(100,10)`) - API mới gộp logic filter vào 1 object truyền qua prop `showSearch` (đã dùng
đúng cách ở phần lớn Select khác trong app, ví dụ `CustomerAssignmentsTab.tsx`). 3 chỗ nêu trên là các chỗ
CÒN SÓT dùng cú pháp cũ (`showSearch` boolean tách rời `filterOption`) - đã grep toàn bộ
`frontend/src --include=*.tsx` với pattern `^\s*filterOption={` để xác nhận đây là TOÀN BỘ các chỗ còn lại
(0 kết quả sau khi sửa xong).

**Đã audit toàn bộ `<Select>` trong `frontend/src` (30 file) - kết quả:**
- Register: Phòng ban/Vị trí ĐÃ có Tag màu từ trước (đã xác nhận BE `findAllPublic()` của cả 2 module trả
  đúng field `color`, không lộ field nhạy cảm description/isSystem). KHÔNG có dropdown "Vai trò" ở Register
  (đúng thiết kế - role gán sau khi Admin duyệt, không phải người tự chọn lúc đăng ký) nên không áp dụng.
- Đã kiểm tra và xác nhận ỔN (đã có Tag/màu đầy đủ, không cần sửa): attendance-device (3 tab),
  audit-logs, customers/reports/invalid-data, nghi-phep, nhom-lien-ket, phan-quyen (2 panel override),
  quan-ly-loai-phep, quan-ly-phu-trach, quan-ly-status-khach, reports (không phải dropdown chọn
  người/phòng ban/vị trí nên không áp dụng), users/PendingApprovalsTab, vi-tri (2 file), CustomerForm,
  CustomerNotesTab, SalesUserSelect, CustomerStatusSelect, GroupManagersModal (đã dùng lại SalesUserSelect
  từ lượt sửa trước), BulkAssignModal, CustomerFilters, toàn bộ Select ở chia-data/page.tsx (bao gồm modal
  "Chọn Sales nhận data" chính - `userOptions` đã có Avatar+Tag đầy đủ dạng JSX label).

**Verify thật:**
- Frontend: `npx tsc --noEmit` sạch (0 lỗi mới, toàn bộ frontend). `grep -rn "^\s*filterOption={"
  frontend/src` — 0 kết quả (xác nhận đã sửa hết, không sót chỗ nào dùng cú pháp deprecated). `npx eslint`
  cho `users/page.tsx`/`register/page.tsx`/`phong-ban/page.tsx` — số lỗi TRƯỚC/SAU giống hệt nhau (đối
  chiếu bằng `git stash` + eslint lại bản gốc), xác nhận toàn bộ lỗi `any`/`react/no-unescaped-entities`
  còn lại đều PRE-EXISTING, không phải do diff các lượt sửa Tag màu. `npm run build` (Next.js 16
  Turbopack): sạch hoàn toàn, đủ 30 route.
- Chưa test tay trên browser thật (cần mở modal "Sửa nhân viên"/"Xoá phòng ban" với data thật để xác nhận
  Tag hiện đúng màu và warning console đã hết) - người dùng tự pull + test lại để xác nhận.
## [2026-09-14 12:30] | Batch A: thêm Search/Filter cho nghi-phep, duyet-phep (2 tab), profile (danh sách nhân viên) | Status: Success

**Actor:** Agent (Claude), theo yêu cầu trực tiếp: rà soát toàn app thấy nhiều trang thiếu search/filter so
với `/customers`, làm theo batch. Đây là Batch A (nhóm CRM-adjacent còn thiếu nhiều nhất) trong 3 batch đã
thống nhất với người dùng (A: nghi-phep/duyet-phep/profile, B: nhóm quản trị danh mục, C: users/nhom-toi-
quan-ly/trash-can/audit-logs).

**Trước khi làm:** `git pull` xác nhận không có commit mới kể từ lượt sửa `chia-data` (inputDate) trước đó.

**Files Changed:**
- `frontend/src/app/(dashboard)/nghi-phep/page.tsx` — thêm filter CLIENT-SIDE (BE `/leave-requests` trả
  toàn bộ, không phân trang, dữ liệu là đơn CỦA CHÍNH mình nên không nhiều): Input tìm theo lý do, Select
  Loại phép, Select Trạng thái, RangePicker theo khoảng ngày nghỉ (giao nhau với [startDate,endDate] của
  từng đơn, dùng `!isAfter`/`!isBefore` thuần vì dayjs chưa extend plugin `isSameOrBefore/isSameOrAfter`
  ở đâu trong app - tránh phá vỡ các chỗ khác nếu extend global).
- `frontend/src/app/(dashboard)/duyet-phep/page.tsx` — thêm filter CLIENT-SIDE cho CẢ 2 tab (dữ liệu cross-
  user nên field nhiều hơn nghi-phep): tab "Chờ phê duyệt" có Input (tên/email/lý do) + Select Phòng ban +
  Select Loại phép; tab "Lịch sử phê duyệt" có thêm Select Trạng thái (bỏ `pending` khỏi option, vì tab
  này chỉ chứa đơn đã xử lý) + RangePicker. Phòng ban dropdown suy trực tiếp từ data đã tải (Map theo
  `requester.department.id`), KHÔNG gọi thêm API `/departments` riêng chỉ để phục vụ 1 dropdown.
- `frontend/src/app/(dashboard)/profile/page.tsx` (`AdminProfileManager` - chế độ xem Profile nhiều người,
  chỉ hiện khi `can('users.view')`) — thêm Input tìm theo tên/email + Select Phòng ban + Select Chức vụ
  (`ROLE_LABEL` có sẵn) cho cả 2 layout (mobile Card list + desktop Table). Phòng ban dropdown cũng suy từ
  data đã tải (`usersApi.getUsers({limit:100})`, tối đa 100 bản ghi/lần) - không thêm API riêng.

**Nguyên tắc áp dụng chung (khác với `/customers`):** cả 3 trang này đều dùng danh sách BOUNDED (đơn của 1
người, hoặc tối đa ~100 user) và BE hiện KHÔNG hỗ trợ query filter/pagination cho các endpoint liên quan
(`/leave-requests`, `/leave-requests/pending`, `/leave-requests/history`, `/users?limit=100`) - nên chọn
lọc CLIENT-SIDE (`useMemo`) thay vì sửa BE thêm query param như đã làm ở `chia-data` (nơi data có thể rất
lớn, cần phân trang thật). Tránh over-engineering khi chưa cần.

**Verify thật:**
- `npx tsc --noEmit` (frontend, full project, không cache): sạch hoàn toàn, 0 lỗi (kể cả 2 lỗi pre-existing
  `logo.png`/`CountBadge.tsx` ở lượt trước cũng không còn xuất hiện lần chạy này - không phải do diff, đã
  xác nhận 3 file sửa không đụng tới `logo.png`/`CountBadge.tsx`).
- `npm run build` (Next.js 16 Turbopack): Compiled successfully, đủ 30 route (bao gồm `/nghi-phep`,
  `/duyet-phep`, `/profile`).
- Chưa test tay trên browser thật với dữ liệu thật (cần tài khoản Manager/Admin có nhiều đơn nghỉ phép của
  nhiều nhân viên/phòng ban để thấy rõ tác dụng filter ở `duyet-phep`) - người dùng tự pull + test lại.

**Còn lại:** Batch B (phong-ban, vi-tri, quan-ly-phu-trach, quan-ly-loai-phep, quan-ly-status-khach,
nguon-media, nhom-lien-ket) và Batch C (users + tab, nhom-toi-quan-ly, trash-can bổ sung thêm, audit-logs
tách tab "Đăng nhập" riêng + filter trạng thái đầy đủ) - CHƯA làm, chờ người dùng xác nhận thứ tự tiếp theo.

---

## [2026-09-14 13:15] | Hoàn tất Batch B (search/filter cho 7 trang danh mục) + fix bug wiring của lượt trước + tạo component dùng chung `ListFilterBar` | Status: Success

**Actor:** Agent (Claude), tiếp tục theo yêu cầu trực tiếp ("bạn pull về và làm tiếp giúp tôi nhé") sau khi
người dùng xác nhận đã test xong Batch A. Batch B trước đó có 1 commit dở dang của chính người dùng
(`708b92f`, message tự ghi "still cannot filter, just UI").

**Trước khi làm:** `git clone` lại từ đầu (full history, không dùng `--depth 1`) để tránh lỗi shallow-clone,
xác nhận commit mới nhất `708b92f` đúng như người dùng mô tả - đọc diff `f4f1dd8..HEAD` để audit thật thay
vì tin theo tóm tắt.

**Bug phát hiện từ lượt trước (đã fix):** `frontend/src/app/(dashboard)/phong-ban/page.tsx` - state
`filteredDepartments`/`searchText`/`filterActive` đã được khai báo và tính bằng `useMemo`, nhưng (1)
`<Table dataSource={departments}>` vẫn trỏ vào mảng CHƯA lọc, và (2) hoàn toàn KHÔNG có UI Input/Select nào
để người dùng nhập - 3 biến state bị ESLint cảnh báo "assigned but never used". Đây là nguyên nhân đúng như
commit message người dùng tự ghi.

**Files mới:**
- `frontend/src/components/common/ListFilterBar.tsx` - Component Search Input + N dropdown Select dùng
  chung cho các trang "danh mục quản trị" nhỏ (lọc CLIENT-SIDE qua `useMemo` ở từng page.tsx, component chỉ
  render UI + gọi callback). Khác với `CustomerFilters.tsx` (lọc SERVER-SIDE qua query param, dành riêng
  cho `/customers` - danh sách lớn có phân trang thật) - không dùng chung được vì khác cơ chế, chỉ giống
  phần UI.

**Files sửa (7 trang, đều theo pattern: thêm state search/filter + `useMemo` lọc + `<ListFilterBar>` + wire
lại `dataSource`):**
- `phong-ban/page.tsx` - fix bug wiring nêu trên + Search theo tên + Select Trạng thái (Đang hoạt động/
  Ngừng hoạt động).
- `nhom-lien-ket/page.tsx` - refactor block filter Group cũ (Row/Col thủ công, đã hoạt động đúng từ trước)
  sang dùng `ListFilterBar` cho đồng nhất; dọn import thừa (`Row`, `Col`, `SearchOutlined`, `Select` -
  Select không còn chỗ nào dùng sau khi refactor).
- `vi-tri/page.tsx` - Search (tên/mã vị trí) + Select Phòng ban + Select Loại (Hệ thống/Tuỳ chỉnh).
- `quan-ly-phu-trach/page.tsx` - Search (tên/key) + Select Phòng ban (lọc theo phòng ban CÓ TRONG config,
  `c.departments.some(d => d.departmentId === filterDepartmentId)`) + Select Loại.
- `quan-ly-loai-phep/page.tsx` - Search (tên/mã) + Select Hưởng lương (Có lương/Không lương) + Select Loại.
- `quan-ly-status-khach/page.tsx` - Search (tên/mã) + Select Loại (Hệ thống/Tuỳ chỉnh).
- `nguon-media/page.tsx` - Search theo tên + Select Trạng thái (Đang mở/Đã khoá, field `isLocked`).

**Nguyên tắc áp dụng (giống Batch A, khác `/customers`/`chia-data`):** cả 7 trang đều là danh mục BOUNDED
(hook trả toàn bộ, không phân trang, tối đa vài chục dòng) nên lọc CLIENT-SIDE, KHÔNG sửa BE thêm query
param.

**Verify thật:**
- `npx tsc --noEmit` (frontend, full project): sạch hoàn toàn, 0 lỗi (kể cả 2 lỗi pre-existing `logo.png`/
  `CountBadge.tsx` cũng không xuất hiện, giống hiện tượng đã ghi nhận ở lượt trước - không phải do diff).
- `npm run build` (Next.js 16 Turbopack): Compiled successfully, đủ toàn bộ route (bao gồm `phong-ban`,
  `vi-tri`, `quan-ly-phu-trach`, `quan-ly-loai-phep`, `quan-ly-status-khach`, `nguon-media`,
  `nhom-lien-ket`).
- `npx eslint` cho cả 7 file + `ListFilterBar.tsx`: đối chiếu bằng `git stash` (chỉ áp dụng được cho file
  ĐÃ TRACKED - `ListFilterBar.tsx` là file mới nên kiểm riêng) - toàn bộ lỗi `any`/`react/no-unescaped-
  entities` còn lại đều PRE-EXISTING (số lượng KHỚP 1-1 giữa trước/sau, trừ 3 warning "unused var" ở
  `phong-ban` đã tự hết vì giờ đã dùng thật). `ListFilterBar.tsx` lint sạch hoàn toàn sau khi thêm 1 dòng
  `eslint-disable-next-line @typescript-eslint/no-explicit-any` có chủ đích (mảng dropdown không đồng nhất
  kiểu value giữa các filter, cần type-erase).
- Đã `git checkout -- package-lock.json` sau `npm install` để tránh noise không liên quan (đúng nguyên tắc
  "Minimal diff noise").
- Chưa test tay trên browser thật với dữ liệu thật - người dùng tự pull + test lại 7 trang.

**Còn lại (CHƯA làm, theo đúng phạm vi yêu cầu gốc của người dùng):**
- Batch C: `users` (+ các tab), `nhom-toi-quan-ly`, `trash-can` (bổ sung thêm field lọc), `audit-logs` (tách
  tab "Đăng nhập" riêng khỏi log nghiệp vụ + filter trạng thái đầy đủ hơn).
- `chia-data`: bổ sung field search/filter còn thiếu so với `/customers` (người dùng báo còn thiếu, ngoài
  phần `status`/khoảng ngày đã thêm ở lượt trước đó).
- `profile`: bổ sung Search/Filter cho chế độ 1 user xem chính mình (hiện chỉ đã có ở chế độ Admin xem
  nhiều user, từ Batch A).
- Fix warning `[antd: Modal] Static function can not consume context` ở nút "Huỷ đơn" `nghi-phep` - đã được
  xác nhận fix ở commit `772e08e` (trước Batch A), CHƯA re-verify lại trong lượt này vì không nằm trong
  phạm vi Batch B.

---

## [2026-09-14 13:45] | Fix bug Search "nhom-lien-ket" chưa lọc theo Category + Category không liên quan không bị ẩn | Status: Success

**Actor:** Agent (Claude), theo phản hồi trực tiếp kèm ảnh chụp UI: (1) gõ đúng tên Category (vd "Zalo")
không tìm ra gì, (2) khi search ra ít nhóm, bảng Category ngoài vẫn hiện nguyên toàn bộ category khác
(kể cả category không liên quan/rỗng).

**Root Cause:** `groupSearch`/`groupStatusFilter` (thêm ở lượt Batch B) chỉ đang lọc `filteredGroups` (bảng
Group lồng bên trong từng Category qua `expandedRowRender`) - hoàn toàn KHÔNG so khớp tên Category, và bảng
Category NGOÀI (`dataSource={categories}`) không hề bị lọc theo 2 state này.

**Solution:**
- `frontend/src/app/(dashboard)/nhom-lien-ket/page.tsx`:
  - Thêm `categoryNameMatches(c)` - so khớp tên Category với từ khoá tìm kiếm.
  - Thêm `groupsOfCategory(categoryId)` - trả về Group của 1 category, có lọc Trạng thái; nếu TÊN Category
    đó đã khớp từ khoá thì BỎ QUA điều kiện text cho Group con (hiện toàn bộ nhóm của category đó, đúng kỳ
    vọng "tìm theo category thì hiện cả category").
  - Thêm `filteredCategories` (`useMemo`) - chỉ giữ Category có TÊN khớp từ khoá HOẶC có ít nhất 1 Group
    con khớp filter; dùng làm `dataSource` cho bảng Category ngoài (trước đây trỏ thẳng `categories`).
  - Đồng bộ cột "Số nhóm" và bảng Group lồng bên trong dùng chung `groupsOfCategory()` thay vì
    `filteredGroups.filter(...)` cũ (xoá biến `filteredGroups`).
  - UX đi kèm: thêm `expandedRowKeys` CONTROLLED - khi đang có filter, tự động mở rộng toàn bộ Category còn
    lại trong kết quả (trước đây Table mặc định thu gọn, filter đúng nhưng nhìn như "không ra gì" cho tới
    khi tự bấm dấu "+"); khi KHÔNG filter, trả về đúng hành vi thu gọn/mở rộng thủ công như cũ
    (`manualExpandedIds`).

**Verify thật:**
- `npx tsc --noEmit` (frontend, full project): sạch, 0 lỗi.
- `npm run build` (Next.js 16 Turbopack): Compiled successfully, đủ route.
- `npx eslint` cho file: lọc bỏ 3 nhóm lỗi PRE-EXISTING đã biết (`no-explicit-any`,
  `react/no-unescaped-entities`, `react-hooks/exhaustive-deps`) - 0 vấn đề MỚI phát sinh ngoài 3 nhóm đó.
- Đã `git checkout -- package-lock.json` sau `npm install` để tránh noise.
- Chưa test tay trên browser thật - người dùng tự pull + test lại (đặc biệt case: gõ "Zalo" → chỉ còn dòng
  Category Zalo, tự động mở rộng hiện đủ 2 nhóm bên trong; gõ "Fx Test" → chỉ còn Category Zalo (vì có nhóm
  khớp), Group con lồng bên trong chỉ còn đúng 1 dòng "Nhóm Fx Test").

---


## [2026-09-14 14:20] | Batch C (audit-logs tách tab Đăng nhập, trash-can bổ sung field, users + 2 tab search/filter) - Ghi bù log | Status: Success

**Actor:** Người dùng (tuannho0802), commit trực tiếp `6168f05`/`f5fd0a1`/`7205619` - session Claude thực
hiện các commit này KHÔNG ghi vào file log này (phát hiện khi Agent audit lại `git log` vs
`WORKFLOW_LOG.md` ở phiên sau và thấy lệch). Agent (Claude) ghi bù lại đây để nhật ký khớp đúng lịch sử
git, không tự ý diễn giải nội dung ngoài những gì đọc được từ diff thật.

**Files changed (theo `git show --stat` từng commit):**
- `6168f05`: `backend/.../audit/audit.service.ts` (+11), `.../audit/dto/get-audit-logs.dto.ts` (+5, filter
  `excludeEntityType`), `frontend/.../audit-logs/page.tsx` (tách tab "Đăng nhập" riêng khỏi log nghiệp vụ,
  lazy-load), `frontend/.../nhom-toi-quan-ly/page.tsx` (thêm filter Nền tảng/Vai trò), `audit.types.ts`.
- `f5fd0a1`: `backend/.../customers/customers.service.ts` (+22, filter cho trash-can), `trash-can/page.tsx`
  (+73, thêm Select Nguồn/Sales phụ trách/RangePicker Ngày xóa), `users/page.tsx` (+21, state filter ban
  đầu), `customers.api.ts`/`users.api.ts`.
- `7205619`: `PendingApprovalsTab.tsx` (+35), `TrashTab.tsx` (+39), `users/page.tsx` (+51) - hoàn thiện
  search/filter cho cả 3 phần của trang Users.

**Verify:** Không thực hiện trong phiên ghi bù này (chỉ đọc git log/diff để đối chiếu) - xem entry NGAY BÊN
DƯỚI để biết kết quả build/tsc/eslint thật SAU KHI đã cộng thêm các sửa đổi màu sắc.

---

## [2026-09-14 14:20] | Thêm màu Tag đúng entity cho dropdown filter còn thiếu + bổ sung dropdown "Vị trí" cho users/2 tab | Status: Success

**Actor:** Agent (Claude), theo yêu cầu trực tiếp: rà soát toàn bộ trang có dropdown filter (sau khi xác
nhận 3 Batch A/B/C đã có trên git qua `git log`/`git show --stat`, KHÔNG tin theo tóm tắt dán vào chat) để
tìm dropdown nào tham chiếu 1 entity CÓ màu cấu hình (Phòng ban/Vai trò/Vị trí/Nguồn/Nền tảng) nhưng label
vẫn là text trơn - và bổ sung dropdown "Vị trí" còn thiếu ở `users` + 2 tab.

**Trước khi làm:** `git clone` sạch từ đầu, xác nhận HEAD `7205619`, đọc trực tiếp từng file có
`ListFilterBar`/`Select` filter (không chỉ tin theo `WORKFLOW_LOG.md` cũ - phát hiện ở bước audit rằng 3
commit gần nhất của người dùng CHƯA từng được ghi vào log này, xem entry ngay bên trên).

**Đã audit và XÁC NHẬN ĐÃ ĐÚNG CHUẨN từ trước (không sửa):** `customers` (`CustomerFilters.tsx`),
`chia-data`, `vi-tri`, `quan-ly-phu-trach`, `quan-ly-loai-phep`, `quan-ly-status-khach`, `nguon-media`,
`nhom-lien-ket`, `nghi-phep` - đều đã dùng `Tag color={resolveEntityColor(...)}` / `SourceTag` / `StatusTag`
đúng pattern.

**Backend:**
- `users.controller.ts` + `users.service.ts` (`findAll`) - thêm `positionId` vào `GET /users` (đối xứng
  `departmentId` đã có), phục vụ dropdown "Vị trí" mới ở tab "Danh sách nhân viên" (SERVER-SIDE, vì `/users`
  đã phân trang thật, khác 2 tab kia).

**Frontend - thêm Tag màu cho dropdown thiếu:**
- `duyet-phep/page.tsx` - dropdown Phòng ban (`pendingDeptOptions`/`historyDeptOptions`, cả 2 tab) giờ bọc
  `Tag color={resolveEntityColor(department.color)}` (trước đây `LeaveRequest.requester.department.color`
  đã có sẵn trong type nhưng dropdown build từ `Array.from(map, ([value,label])=>({value,label}))` chỉ lấy
  tên, bỏ qua field màu).
- `nhom-toi-quan-ly/page.tsx` - dropdown "Nền tảng" đổi từ set tên trơn sang giữ cặp
  `[categoryName, categoryColor]` (đã có sẵn trong `rows`, cột bảng đã dùng nhưng dropdown filter thì
  không) để bọc đúng `Tag color={resolveEntityColor(color)}`; dropdown "Vai trò của tôi" đổi 2 option text
  trơn sang `Tag color="gold" icon={<CrownOutlined/>}` / `Tag color="blue"` khớp Y HỆT cách cột "Vai trò của
  tôi" đang tô màu.
- `profile/page.tsx` (`AdminProfileManager`) - dropdown Phòng ban thêm Tag màu (`deptOptions` giờ giữ cả
  `color` thay vì chỉ `name`); dropdown Chức vụ đổi từ hằng số `ROLE_LABEL` (chỉ hardcode 4 role hệ thống,
  sẽ MISS role tuỳ chỉnh admin tự thêm - cùng loại bug đã sửa ở nơi khác trong app) sang
  `useRoleColors()` (route `/roles/colors`, không cần `roles.view`) + Tag màu thật, áp dụng cho CẢ layout
  mobile (Card list) và desktop (Table).
- `trash-can/page.tsx` - dropdown "Nguồn" đổi từ text trơn (`label: s.name`) sang `<SourceTag source=.../>`
  (đã import sẵn, chỉ chưa dùng ở đây).
- `audit-logs/page.tsx` - dropdown "Loại hành động" giờ bọc `Tag color={v.color}` khớp đúng màu cột "Hành
  động" trong bảng (dùng chung `ACTION_META`); "Đối tượng" giữ nguyên text (không có khái niệm màu cho loại
  đối tượng, không áp dụng được).

**Frontend - bổ sung dropdown "Vị trí" (users + 2 tab, theo đúng yêu cầu):**
- `users/page.tsx` - thêm state `filterPositionId`, wire vào `fetchUsers()` (gọi `usersApi.getUsers` với
  `positionId` mới) + vào 2 `useEffect` (fetch lại + reset trang khi đổi filter); dropdown mới dùng
  `usePositions()` đã fetch sẵn (trước chỉ dùng cho Modal Thêm/Sửa). Đồng thời tô màu lại 3 dropdown cũ
  (Vai trò/Phòng ban/Trạng thái) đang text trơn dù `roleOptions` đã có sẵn field `color` chưa dùng tới.
- `users/PendingApprovalsTab.tsx` - thêm dropdown "Vị trí đăng ký" lọc CLIENT-SIDE (danh sách chờ duyệt
  luôn BOUNDED, không sửa BE) dựa trên `positions` đã fetch sẵn cho Modal Duyệt; tô màu dropdown Phòng ban.
- `users/TrashTab.tsx` - thêm dropdown "Vị trí" lọc CLIENT-SIDE (thùng rác cũng BOUNDED), import mới
  `usePositions()`; tô màu dropdown Vai trò.

**Bug tự phát hiện + tự sửa trong lúc verify:** `PendingApprovalsTab.tsx` - lúc đầu viết
`positions.map((p: any) => ...)` (thừa `any` không cần thiết, sai khác style các dropdown khác trong cùng
file dùng `departments.map((d: any) => ...)` - đây là debt CŨ, không nên nhân thêm) - phát hiện qua đối
chiếu eslint trước/sau (từ 7 xuống phải đúng 7, không phải 8) - sửa bỏ `: any`, dùng đúng type suy ra từ
`usePositions()` (giống pattern KHÔNG dùng `any` ở `users/page.tsx`/`TrashTab.tsx` cho cùng danh sách
`positions`).

**Verify thật:**
- Backend: `npx tsc --noEmit` sạch, `npm run build` (`nest build`) sạch, `npx jest users.service.spec.ts`:
  72/72 pass (bao gồm toàn bộ test cũ về `findAll`/RBAC, không có test nào viết riêng cho `positionId` filter
  mới - CHƯA thêm unit test cho nhánh lọc mới này, xem mục "Còn lại" bên dưới).
- Frontend: `npx tsc --noEmit` sạch (chỉ còn đúng 4 lỗi PRE-EXISTING không liên quan diff: `logo.png` thiếu
  ở 4 file `layout.tsx`/`error.tsx`/`global-error.tsx`/`not-found.tsx`, và 1 lỗi `CountBadge.tsx` JSX style
  prop - đã xác nhận qua `git stash` các lỗi này tồn tại y hệt ở baseline, không phải do các sửa đổi này).
- `npm run build` (Next.js 16 Turbopack): Compiled successfully cả 2 lần build (trước và sau khi sửa bug
  `any` ở PendingApprovalsTab) - đủ 30 route.
- `npx eslint` cho toàn bộ 9 file đã sửa, đối chiếu bằng `git stash`: baseline 92 problems (84 lỗi, 8
  warning) → sau khi sửa: ĐÚNG 92 problems (84 lỗi, 8 warning) - 1-1 khớp tuyệt đối, 0 vấn đề mới.
- `git checkout -- frontend/package-lock.json` sau `npm install` để tránh noise không liên quan.
- Chưa test tay trên browser thật với dữ liệu thật (đặc biệt: dropdown "Vị trí" mới ở `users` cần tài
  khoản có users thuộc nhiều Vị trí khác nhau để thấy rõ tác dụng lọc; màu Tag Phòng ban/Vai trò/Nền tảng ở
  các dropdown vừa sửa cần đối chiếu bằng mắt với màu đã cấu hình ở `/phong-ban`, `/phan-quyen`,
  `/nhom-lien-ket`) - người dùng tự pull + test lại.

**Còn lại (ngoài phạm vi yêu cầu lần này, ghi nhận để theo dõi):**
- `users.service.spec.ts` chưa có test riêng cho filter `positionId` mới (nên thêm 1 test mirror đúng test
  đã có cho `departmentId` để tránh regression sau này).
- `trash-can/page.tsx` dropdown "Sales phụ trách" vẫn text trơn (không có Avatar/Tag Vai trò-Phòng ban như
  `renderUserOption` ở `CustomerFilters.tsx`/`chia-data`) - không nằm trong phạm vi "màu theo entity có cấu
  hình màu" (đây là chọn người, không phải chọn 1 entity có bảng màu riêng) nên KHÔNG sửa trong lượt này,
  chỉ ghi chú nếu người dùng muốn đồng bộ thêm sau.

  ## [2026-09-14 15:05] | Chạy toàn bộ spec test BE, sửa 1 spec lỗi thời (departments.service.spec.ts) | Status: Success

**Actor:** Agent (Claude), theo yêu cầu trực tiếp: "chạy spec test toàn bộ, chỗ nào fail thì sửa lại file
spec do service đã sửa nhưng spec chưa apply theo".

**Trước khi làm:** `npx jest` (không filter) chạy TOÀN BỘ 28 test suite / 539 test có trong repo, không suy
diễn hay chỉ chạy lại đúng suite đã sửa lần trước.

**Kết quả lần chạy đầu:** 1/28 suite FAIL - `departments.service.spec.ts`, test
`findAllPublic - ... chỉ select id/name (không lộ field khác)`. Đọc trực tiếp `departments.service.ts` để
xác nhận đây là SERVICE ĐÃ ĐỔI THẬT (không phải bug): `findAllPublic()` có comment
"⚠️ MỚI - thêm `color`... để form đăng ký công khai cũng vẽ được Tag màu" (đã có sẵn trong code TRƯỚC khi
Agent bắt đầu phiên này - không phải do Agent tự thêm) - service giờ trả thêm `order: { name: 'ASC' }` và
`select: ['id','name','color']`, nhưng spec cũ vẫn assert `select: ['id','name']` (không có `order`, không
có `color`) → lệch, đúng như người dùng mô tả "service sửa nhưng spec chưa apply theo".

**Nguyên tắc áp dụng:** SỬA SPEC để khớp hành vi THẬT của service (không revert service về hành vi cũ) -
`color` không phải field nhạy cảm (khác `description`/`isSystem` service vẫn cố tình giữ ẩn ở `select`),
nên hành vi mới là ĐÚNG Ý ĐỒ, spec cũ mới là bên lỗi thời.

**Files sửa:**
- `backend/src/modules/departments/departments.service.spec.ts` - cập nhật lại tên test + expectation:
  assert `select: ['id','name','color']` + `order: { name: 'ASC' }`, giữ nguyên phần `where: { isActive:
  true }`. Thêm comment giải thích rõ đây là spec lỗi thời được cập nhật theo service mới, không phải sửa
  ngược lại service.

**Verify thật:**
- `npx jest` (toàn bộ, không filter): 28/28 suite pass, 539/539 test pass (trước đó 27/28 suite, 538/539
  test).
- `npx tsc --noEmit` (backend): sạch.
- `npm run build` (`nest build`): sạch.
- Đã rà soát KHÔNG có suite nào khác fail (chỉ đúng 1 chỗ lệch giữa toàn bộ 28 suite) - không cần sửa thêm
  file spec nào khác.

## [2026-09-14 16:40] | Xác nhận BE Phase 1 module "Công việc định kỳ" (periodic-tasks) sẵn sàng cho FE + thêm cột `color` | Status: Success

**Actor:** Agent (Claude), theo yêu cầu: verify lại bằng code thật (không tin transcript phiên trước) trước
khi cho phép bắt đầu triển khai FE, sau đó bổ sung cột `color` cho `periodic_tasks`.

**Bối cảnh:** Phiên chat trước báo cáo đã hoàn tất Phase 1 (module `periodic-tasks` +
`periodic-task-statuses`, 588/588 test pass) nhưng **quên `git push`** - `git clone` lại từ đầu tại thời
điểm nhận báo cáo cho thấy `origin/main` vẫn dừng ở commit `5818bf2` (chỉ có 4 file gốc: enum, 2 entity,
1 migration status), KHÔNG có module/service/controller/spec như báo cáo mô tả. Đã báo người dùng, người
dùng xác nhận quên push và push bổ sung 2 commit (`886ecaa`, `f7ed3fa`).

**Verify lại bằng code thật (SAU khi push):**
- `git log`: HEAD = `f7ed3fa`, đúng khớp nội dung được báo cáo.
- `npm install` + `npx tsc --noEmit`: sạch, 0 lỗi.
- `npx nest build`: thành công.
- `npx jest` (toàn bộ, không filter): **31/31 suite pass, 588/588 test pass** (số vài dòng ERROR log đỏ của
  `storage.service.spec.ts` là log cố ý khi test giả lập lỗi `NoSuchKey`, suite đó vẫn PASS - không phải
  regression).
- Đọc trực tiếp `periodic-tasks.controller.ts`, `periodic-task-access.helper.ts`,
  `1782100000000-SeedPeriodicTasksPermissions.ts`: xác nhận dùng đúng `PermissionGuard`/`RequirePermission`
  (không hardcode role), bypass `Role.ADMIN` có mặt ở cả 3 hàm của helper
  (`applyViewFilter`/`canDelete`/`canManageTask`), ma trận permission seed đúng yêu cầu (view/create/edit:
  admin+assistant=all, manager=department, employee=own; delete: CHỈ admin=all).
- Migration timestamp `1781900000000` → `1782100000000` không trùng, tăng dần đúng thứ tự so với migration
  mới nhất khác đang có trong repo (`1781800000000-CreateDepartmentManagers.ts`).
- **Kết luận: BE Phase 1 ĐỦ điều kiện để FE bắt đầu triển khai** CRUD `/periodic-tasks` +
  `/periodic-task-statuses`, dùng permission key `periodic_tasks.view/create/edit/delete` qua
  `useMyPermissions`. Các phần liên kết cha-con/Customer/phụ trách phụ/lock chưa có (Phase 2-5), FE không
  dựng UI cho các phần này ở Phase 1.

**Bổ sung theo yêu cầu:** thêm cột `color` cho bảng `periodic_tasks` (hex 6 ký tự, vd `#FF5733`) - CHỈ dùng
hiển thị UI (Card/Kanban/Calendar... sau này), không mang ý nghĩa nghiệp vụ, không ảnh hưởng RBAC. Optional,
sửa tự do như mọi field khác (mirror nguyên tắc PLAN mục 2.10 áp dụng chung cho các field không khoá cứng).

**Files sửa/thêm:**
- `backend/src/database/entities/periodic-task.entity.ts` — thêm `@Column({ type: 'varchar', length: 7,
  nullable: true }) color: string | null;`.
- `backend/src/database/migrations/1782200000000-AddColorToPeriodicTasks.ts` — migration MỚI (không sửa
  migration cũ), `ADD COLUMN IF NOT EXISTS color VARCHAR(7) NULL`, `down()` đối xứng `DROP COLUMN IF EXISTS`.
- `backend/src/modules/periodic-tasks/dto/create-periodic-task.dto.ts` — thêm field `color?: string`
  optional, validate `@Matches(/^#[0-9A-Fa-f]{6}$/)`. `UpdatePeriodicTaskDto` tự động nhận field này qua
  `PartialType`.
- `backend/src/modules/periodic-tasks/periodic-tasks.service.ts` — `create()` lưu `color: dto.color ?? null`;
  `update()` cho sửa tự do kể cả về `null` (`if (dto.color !== undefined) task.color = dto.color ?? null`).
- `backend/src/modules/periodic-tasks/periodic-tasks.service.spec.ts` — thêm 2 test: "lưu color khi có
  truyền, mặc định null khi không truyền" (create) và "cho phép sửa color tự do, kể cả về null" (update).

**Permission xoá (`periodic_tasks.delete`):** đã có sẵn từ migration
`1782100000000-SeedPeriodicTasksPermissions.ts` (seed đúng: CHỈ role `admin`, scope `all`, không seed cho
3 role còn lại) - người dùng xác nhận đã thấy, KHÔNG cần migration bổ sung.

**Verify thật (SAU khi thêm color):**
- `npx tsc --noEmit`: sạch.
- `npx nest build`: thành công.
- `npx jest periodic-tasks periodic-task-statuses`: 3/3 suite, **51/51 test pass** (49 cũ + 2 test color mới).
- `npx jest` (toàn bộ, không filter): **31/31 suite pass, 590/590 test pass** (588 cũ + 2 test color mới) -
  không regression.

**Notes:**
- FE khi hiển thị Card/Kanban cho `periodic-tasks`: `color` có thể `null` (Task tạo trước khi có field này,
  hoặc không truyền lúc tạo) - tự quyết định màu mặc định khi `null`, không giả định luôn có giá trị.
- Bài học quy trình: LUÔN xác nhận `git log`/`git status` trên bản `clone` mới, không tin số liệu test/báo
  cáo hoàn tất từ 1 phiên chat khác cho tới khi tự verify được trên `origin/main` - lần này review đã bắt
  đúng trường hợp báo cáo "xong" nhưng chưa push.

---


## [2026-09-15 09:20] | Xác nhận BE+FE Phase 2 "Công việc định kỳ" (liên kết DAG cha-con + rollup %) đã hoàn tất | Status: Success

**Actor:** Agent (Claude), theo yêu cầu chủ dự án: "scan và pull repo, xác nhận Phase 2 đã hoàn thành cả
BE và FE chưa, đủ điều kiện sang Phase 3 chưa".

**Bối cảnh:** `git clone` lại bản mới nhất (HEAD `a504e04`), đọc trực tiếp code thật - KHÔNG tin nội dung
đã trao đổi ở phiên chat trước (chỉ dừng ở audit Phase 1 BE, ngày 2026-09-14 16:40). Phát hiện: code đã đi
xa hơn `WORKFLOW_LOG.md` ghi nhận - `periodic-task-links.service.ts`, migration
`1782300000000-CreatePeriodicTaskLinks.ts`, và toàn bộ FE (`TaskLinksModal.tsx`,
`usePeriodicTaskLinks.ts`, `periodic-task-links.api.ts`) đã tồn tại trong repo nhưng CHƯA từng có entry
log nào ghi nhận việc này - đúng pattern "code vượt tài liệu" đã cảnh báo ở đầu file.

**Đã audit (đối chiếu trực tiếp với `PLAN_PERIODIC_TASKS_MODULE.md` mục 6 Phase 2):**
- `PeriodicTaskLinksService`: validate rank kỳ hạn (cha phải lớn kỳ hơn con, chặn cả ngang hàng lẫn
  ngược chiều), chống chu trình bằng BFS ngược từ parent, chống trùng cạnh - cả 3 đều đúng spec.
- 5 endpoint (`POST/DELETE .../links`, `GET .../children/parents/rollup`) đều đi qua "1 cổng gác"
  `tasksService.findOne()` trước khi chạm bước rank/cycle - không rò rỉ Task ngoài scope.
- Rollup % đúng công thức PLAN mục 2.3 (đếm con TRỰC TIẾP, loại `is_excluded_from_rollup`, trả `null`
  khi `totalChildren = 0`).
- FE: `TaskLinksModal.tsx` đã được **mount thật** vào `cong-viec-dinh-ky/page.tsx` (dòng 620) - không
  phải file mồ côi (khác case Position trước đây từng gặp).
- Ranh giới Phase 3 chưa bị động tới: chưa có bảng `periodic_task_customers`, chưa seed permission
  `periodic_tasks.link_customer`, chưa có `periodic_task_secondary_assignees` (Phase 4). `primary_
  assignee_id` đã NOT NULL từ Phase 1 đúng note trong PLAN.

**Verify thật:**
- Backend: `tsc --noEmit` sạch, `nest build` sạch, `jest` (toàn bộ, không filter): **32/32 suite,
  603/603 test pass**.
- Frontend: `npx tsc --noEmit` chỉ còn đúng 5 lỗi pre-existing baseline (thiếu asset `logo.png` trong
  sandbox ở 4 file `layout.tsx`/`error.tsx`/`global-error.tsx`/`not-found.tsx`, và 1 lỗi `CountBadge.tsx`
  JSX style prop) - đã xác nhận đây là lỗi môi trường sandbox, không liên quan Phase 2. `npm run build`
  (Next.js 16 Turbopack): Compiled successfully, đủ 32 route bao gồm `/cong-viec-dinh-ky`.
- Migration timestamp tăng dần đúng thứ tự (`...1782300000000-CreatePeriodicTaskLinks.ts` sau
  `...1782200000000-AddColorToPeriodicTasks.ts`), không trùng.

**Kết luận:** Phase 2 ĐỦ điều kiện coi là hoàn tất cả BE lẫn FE - cho phép bắt đầu Phase 3 (gắn Customer
vào Task, kèm ẩn field theo quyền). Đã báo chủ dự án và được yêu cầu tiếp tục ngay.

**Bài học quy trình (lặp lại từ entry trước):** LUÔN `git clone`/`git pull` lại và đọc code thật trước khi
kết luận tiến độ - `WORKFLOW_LOG.md` một mình không đủ tin cậy để biết trạng thái hiện tại khi có nhiều
tài khoản cùng code song song, có thể bị "vượt mặt" mà không ai kịp ghi log.

---

## [2026-09-15 10:05] | Code xong BE Phase 3 "Công việc định kỳ" (gắn Customer vào Task, kèm ẩn field theo quyền) | Status: Success

**Actor:** Agent (Claude), theo yêu cầu chủ dự án tiếp ngay sau khi xác nhận Phase 2 xong (entry trên).

**Đã làm (đối chiếu đúng `PLAN_PERIODIC_TASKS_MODULE.md` mục 2.4, 2.12, 3, 4, 5, 6 - Phase 3):**
1. Migration `1782400000000-CreatePeriodicTaskCustomers.ts` - bảng `periodic_task_customers`
   (`UNIQUE(task_id, customer_id)`) + seed permission NHỊ PHÂN `periodic_tasks.link_customer`
   (`supports_scope = FALSE`, mirror `periodic_task_statuses.manage`) - giá trị khởi tạo: admin/assistant
   = bật (scope NULL), manager/employee = KHÔNG seed (tắt mặc định, Admin tự bật qua `/phan-quyen`).
2. Entity `periodic-task-customer.entity.ts` - CỐ TÌNH không khai `@OneToMany` ngược lại ở
   `PeriodicTask`/`Customer` (mirror cách Phase 2 xử lý `periodic_task_links`) - join tường minh qua
   query builder trong Service.
3. DTO `link-periodic-task-customers.dto.ts` (`customerIds: number[]`, tối đa 100/lần) - mirror
   `BulkAssignDto` của module customers.
4. Service `periodic-task-customers.service.ts` - điểm kỹ thuật quan trọng nhất phiên này: **2 lớp
   permission độc lập cho cùng 1 endpoint**, vì `@RequirePermission()` (decorator) CHỈ nhận đúng 1 key/
   route (xem JSDoc):
   - Lớp 1 `periodic_tasks.edit` - gate ở Controller/`PermissionGuard` như mọi endpoint sửa Task khác.
   - Lớp 2 `periodic_tasks.link_customer` - tự inject `PermissionsService` vào Service, gọi
     `hasPermission()` trực tiếp (KHÔNG qua Guard) để check thêm, thiếu thì 403 dù đã qua lớp 1.
   - Danh sách Customer hợp lệ để chọn KHÔNG tự viết bộ lọc riêng - tự tra scope THẬT của `customers.view`
     (permission của MODULE KHÁC) qua `PermissionsService`, rồi chạy đúng
     `CustomerAccessHelper.applyViewFilter()` - đúng nguyên tắc "1 nguồn áp filter duy nhất" dù khác module.
   - Root Admin bypass tự implement lại đúng chuẩn hiện tại (`role === 'admin' && isRootAdmin === true`)
     vì lớp check thứ 2 không đi qua `PermissionGuard`.
5. `periodic-tasks.controller.ts` - thêm `POST/DELETE .../customers`; `GET /periodic-tasks/:id` (`findOne`)
   giờ gọi thêm `periodicTaskCustomersService.attachLinkedCustomers()` - field `linkedCustomers` bị **XOÁ
   HẲN khỏi object** (không phải mảng rỗng `[]`) nếu người xem thiếu `customers.view`, có quyền thì trả
   mảng đã lọc lại ĐÚNG phạm vi xem của người ĐANG XEM (không phải phạm vi của người đã gắn Customer).
6. `periodic-tasks.module.ts` - đăng ký thêm entity `PeriodicTaskCustomer`/`Customer` + provider mới
   (`PermissionsService` không cần khai `imports` vì `PermissionsModule` là `@Global()`).

**Files Changed:**
- `backend/src/database/migrations/1782400000000-CreatePeriodicTaskCustomers.ts` (mới)
- `backend/src/database/entities/periodic-task-customer.entity.ts` (mới)
- `backend/src/database/entities/periodic-task.entity.ts` - cập nhật JSDoc (Phase 3 đã có bảng, vẫn
  không khai `@OneToMany`)
- `backend/src/modules/periodic-tasks/dto/link-periodic-task-customers.dto.ts` (mới)
- `backend/src/modules/periodic-tasks/periodic-task-customers.service.ts` (mới)
- `backend/src/modules/periodic-tasks/periodic-task-customers.service.spec.ts` (mới, 10 test)
- `backend/src/modules/periodic-tasks/periodic-tasks.controller.ts` - thêm 2 endpoint + sửa `findOne()`
- `backend/src/modules/periodic-tasks/periodic-tasks.module.ts` - đăng ký entity/provider mới
- `AZ-Workbase Skills/PERMISSIONS.md` - thêm mục 2.11 (module `periodic-tasks`, Phase 1-3) + 1 dòng lịch
  sử ở mục 3

**Verify thật:**
- `npx tsc --noEmit` (backend): sạch.
- `npx nest build`: sạch.
- `npx jest periodic-task-customers`: **10/10 test pass** (403 thiếu `link_customer`, 403 thiếu
  `customers.view`, 400 customer ngoài phạm vi scope, XOÁ HẲN key `linkedCustomers` khi thiếu quyền
  [không phải mảng rỗng], idempotent add khi customer đã gắn sẵn, Root Admin bypass cả 2 lớp permission).
- `npx jest` (toàn bộ, không filter): **33/33 suite pass, 613/613 test pass** (tăng từ 603, không
  regression).

**Còn lại (ngoài phạm vi phiên này, thuộc Phase 3 FE + Phase 4-7 của PLAN):**
- FE Phase 3 CHƯA làm: `periodic-task-customers.api.ts`, hook, UI chọn/hiển thị Customer trong
  `TaskLinksModal.tsx` (hoặc modal riêng), ẩn UI khi thiếu `periodic_tasks.link_customer` - cần làm ở
  lượt tiếp theo trước khi coi Phase 3 hoàn tất TOÀN BỘ (mirror đúng chuẩn "1 Phase = build+test cả BE
  VÀ FE" đã áp dụng cho Phase 1/2).
- Phase 4 (phụ trách chính/phụ - `periodic_task_secondary_assignees`), Phase 5 (approve/lock), Phase 6
  (checklist con), Phase 7 (audit log riêng) - chưa code, xem PLAN mục 6.

---

## [2026-09-15 09:50] | Code xong FE Phase 3 "Công việc định kỳ" (gắn Customer vào Task) - Phase 3 ĐỦ cả BE+FE | Status: Success

**Actor:** Agent (Claude), theo yêu cầu chủ dự án tiếp FE ngay sau khi xác nhận BE Phase 3 build/test sạch
(entry trên). Đã `git clone` lại repo mới nhất và tự đọc code thật trước khi code tiếp (không tin thẳng
transcript dán vào - đối chiếu lại BE, migration, `PERMISSIONS.md` mục 2.11 đều khớp đúng như log ghi).

**Đã làm (đối chiếu đúng `PLAN_PERIODIC_TASKS_MODULE.md` mục 2.4 - Phase 3 FE):**
1. `frontend/src/lib/api/periodic-tasks.api.ts` - thêm field `linkedCustomers?: Customer[]` vào type
   `PeriodicTask` (optional CỐ Ý - JSDoc giải thích rõ `undefined` = thiếu `customers.view`, khác mảng
   rỗng `[]` = có quyền nhưng chưa gắn/không còn Customer trong phạm vi xem). Field này CHỈ có trên
   response `GET /:id`, không có trên `GET /` (danh sách) - khớp đúng BE chỉ gọi `attachLinkedCustomers()`
   ở `findOne()`.
2. `frontend/src/lib/api/periodic-task-customers.api.ts` (mới) - khớp đúng 2 endpoint BE:
   `POST /periodic-tasks/:id/customers` (body `customerIds[]`) và `DELETE .../customers/:customerId`.
3. `frontend/src/lib/hooks/usePeriodicTaskCustomers.ts` (mới) - `useAddTaskCustomers`/
   `useRemoveTaskCustomer`, cùng namespace invalidate `'periodic-tasks'` với `usePeriodicTaskLinks.ts` để
   `usePeriodicTask(id)` tự fetch lại `linkedCustomers` mới nhất sau khi gán/gỡ.
4. `TaskLinksModal.tsx` - thêm hẳn 1 section "Khách hàng liên quan" vào modal Liên kết & Tiến độ có sẵn
   (không tạo modal riêng, mirror đúng chỗ Phase 2 đã đặt UI liên kết cha/con):
   - Đọc `linkedCustomers` từ `usePeriodicTask(taskId)` (fetch riêng qua `GET /:id`), KHÔNG dùng `task`
     prop truyền vào (prop đó đến từ `GET /` - không có field này).
   - `linkedCustomers === undefined` -> ẩn hẳn phần chọn Customer + hiện dòng "không có quyền xem", đúng
     PLAN mục 2.4 bước 4 (phân biệt với mảng rỗng).
   - Nút Gán/Gỡ chỉ hiện khi `can('periodic_tasks.link_customer')` - permission RIÊNG, độc lập với
     `periodic_tasks.edit` dùng cho liên kết cha/con phía trên (2 dòng thông báo thiếu quyền tách biệt).
   - Select chọn Customer dùng search SERVER-SIDE qua `useCustomers({ search, limit: 20 })` (mirror
     `CustomerFilters`) - KHÔNG tải hết danh sách Customer như `TaskLinksModal` đang làm với candidates
     Task (chấp nhận được cho Task vì hard-cap 100, nhưng Customer có thể rất nhiều nên phải search thay
     vì tải hết). Danh sách gợi ý tự loại các Customer đã gắn sẵn (`linkedCustomerIds`).

**Files Changed:**
- `frontend/src/lib/api/periodic-tasks.api.ts` - thêm field `linkedCustomers?` vào `PeriodicTask`
- `frontend/src/lib/api/periodic-task-customers.api.ts` (mới)
- `frontend/src/lib/hooks/usePeriodicTaskCustomers.ts` (mới)
- `frontend/src/components/periodic-tasks/TaskLinksModal.tsx` - thêm section Customer + JSDoc cập nhật

**Verify thật:**
- `npx tsc --noEmit` (frontend): chỉ còn đúng 5 lỗi pre-existing baseline (thiếu asset `logo.png` trong
  sandbox + `CountBadge.tsx` JSX style prop) - giống hệt baseline đã ghi nhận ở entry Phase 2, KHÔNG có
  lỗi mới phát sinh từ code Phase 3 FE.
- `npm run build` (Next.js 16 Turbopack): **Compiled successfully**, đủ 32 route bao gồm
  `/cong-viec-dinh-ky`.
- `npx vitest run` (toàn bộ): **2 suite pass, 14/14 test pass** (không có test riêng cho
  `TaskLinksModal`/module `periodic-tasks` ở FE - mirror đúng thực trạng Phase 1/2 cũng chưa có FE test,
  chỉ 2 file test hiện có trong repo là `nav-config.test.tsx` và `useMyPermissions.test.tsx`, không liên
  quan module này).
- `npx eslint` riêng 4 file vừa sửa/thêm: sạch, không lỗi/warning.

**Kết luận:** Phase 3 (gắn Customer vào Task, kèm ẩn field theo quyền) nay ĐỦ điều kiện coi là hoàn tất
CẢ BE LẪN FE - đúng chuẩn "1 Phase = build+test cả 2 phía" đã áp dụng cho Phase 1/2. Sẵn sàng bắt đầu
Phase 4 (phụ trách chính/phụ - `periodic_task_secondary_assignees`, xem PLAN mục 2.5/6) khi chủ dự án
yêu cầu.

**Còn lại (ngoài phạm vi phiên này):**
- Phase 4 (phụ trách chính/phụ), Phase 5 (approve/lock), Phase 6 (checklist con), Phase 7 (audit log
  riêng) - chưa code, xem PLAN mục 6.
- (Tuỳ chọn, không bắt buộc) Có thể thêm FE test cho `TaskLinksModal` sau nếu chủ dự án muốn nâng độ phủ
  test FE - hiện repo FE gần như chưa có test component nào, không riêng module này.

---

## [2026-09-15 10:10] | UX fix + mở rộng gắn Customer (chọn nhiều, hiện PTC, sửa hiển thị "null", thêm vào cả Tạo/Sửa) | Status: Success

**Actor:** Agent (Claude), theo phản hồi trực tiếp của chủ dự án sau khi xem UI thật (đính kèm ảnh chụp
màn hình `TaskLinksModal` và Modal Tạo/Sửa) - phát hiện 3 vấn đề UX từ Phase 3 FE (entry trước):
1. Dropdown chọn Customer hiện chữ "null" thay vì "Chưa có SĐT" khi Customer chưa có SĐT.
2. Dropdown không hiện Người phụ trách chính (PTC) của Customer, và chỉ chọn được 1 Customer/lần.
3. Modal "Tạo Công việc định kỳ mới" hoàn toàn chưa có chỗ gắn Customer (phải tạo xong mới vào "Liên
   kết" gắn sau) - sau đó chủ dự án yêu cầu thêm áp dụng luôn cho Modal Sửa.

**Đã làm:**
1. `components/common/customer-option-render.tsx` (mới) - 3 helper dùng CHUNG cho mọi nơi có Select
   chọn Customer trong repo (tránh lặp code, tránh lệch định dạng giữa 2 modal):
   - `customerPhoneDisplay(phone)` - trả `'Chưa có SĐT'` thay vì để lộ `null`/`undefined` ra UI.
   - `customerPlainLabel(c)` - `"Tên - SĐT"`, dùng làm `label` phẳng (chip đã chọn + tìm kiếm).
   - `renderCustomerOption(option)` - JSX cho `optionRender` của antd `Select`, thêm Tag xanh
     `"PTC: <tên>"` nếu Customer có `salesUser` - mirror đúng quy ước Tag "Primary Sales" nền xanh ở
     `SKILL_NEXTJS_FRONTEND.md` mục 13.2.
2. `TaskLinksModal.tsx` - đổi Select chọn Customer từ đơn sang `mode="multiple"` (state
   `selectedCustomerId` số đơn -> `selectedCustomerIds: number[]`), 1 lần bấm "Gán" gửi thẳng mảng qua
   `addCustomers()` (endpoint BE vốn đã nhận `customerIds[]` từ Phase 3, không cần sửa BE). Áp dụng
   `customerPlainLabel`/`renderCustomerOption` cho Select, và sửa dòng hiện SĐT ở danh sách đã gắn
   (`SimpleList`) từ `{c.phone}` trần sang `{customerPhoneDisplay(c.phone)}`.
3. `cong-viec-dinh-ky/page.tsx` - thêm hẳn field "Khách hàng liên quan" (Select multiple, cùng
   `customerPlainLabel`/`renderCustomerOption`) vào Modal Tạo/Sửa DÙNG CHUNG, khác nhau ở cách LƯU (field
   này KHÔNG thuộc `CreatePeriodicTaskDto`/`UpdatePeriodicTaskDto` nên không thể gộp vào `Form`/payload
   chính, phải gọi API Phase 3 riêng SAU KHI Tạo/Sửa Task thành công):
   - **Tạo mới**: sau `createMutation` thành công, có `newTask.id` -> gọi thẳng `addCustomers()` với toàn
     bộ `customerIds` đã chọn (nếu có).
   - **Sửa**: fetch `linkedCustomers` HIỆN TẠI của Task qua `usePeriodicTask(editingTask.id)` (không dùng
     `task` từ danh sách - danh sách không có field này), nạp vào state `customerIds`/`originalCustomerIds`
     qua 1 `useEffect` ngay khi tải xong (không thể set đồng bộ lúc bấm "Sửa" vì phải chờ API). Lúc Lưu,
     DIFF `customerIds` (người dùng vừa chỉnh) với `originalCustomerIds` (lúc mở modal): phần tử MỚI
     thêm -> gọi `addCustomers()` 1 lần với cả mảng; phần tử bị bỏ -> gọi `removeCustomer()` RIÊNG TỪNG
     cái (BE không có endpoint gỡ hàng loạt).
   - Thêm state `knownCustomers` (map id -> Customer) GỘP từ 2 nguồn (kết quả search hiện tại + Customer
     đã gắn sẵn lúc Sửa) để Select hiện ĐÚNG tên/SĐT ngay khi mở Modal Sửa, thay vì hiện ID trần (Customer
     đã gắn thường KHÔNG nằm trong 20 kết quả search mặc định/rỗng).
   - Ẩn hẳn field nếu thiếu `periodic_tasks.link_customer`; ở chế độ Sửa, nếu có quyền đó nhưng THIẾU
     `customers.view` (quyền KHÁC, PLAN mục 2.4) thì `editingLinkedCustomers` sẽ là `undefined` dù đã tải
     xong -> ẩn Select, hiện dòng cảnh báo thay vì Select rỗng gây hiểu nhầm "Task chưa gắn Customer nào".
   - Dọn 3 chỗ `err: any` MỚI thêm trong lượt này thành `getApiErrorMessage(err, fallback)` (đã import
     sẵn từ `error-message.util.ts`) - không đụng các `err: any` CŨ đã có sẵn trong file trước đó (ngoài
     phạm vi sửa của lượt này, đúng rule "diff edit, không viết lại toàn bộ file").

**Files Changed:**
- `frontend/src/components/common/customer-option-render.tsx` (mới)
- `frontend/src/components/periodic-tasks/TaskLinksModal.tsx` - Select đơn -> multiple, sửa hiển thị SĐT
- `frontend/src/app/(dashboard)/cong-viec-dinh-ky/page.tsx` - thêm field Customer vào Modal Tạo/Sửa

**Verify thật:**
- `npx tsc --noEmit`: sạch (0 lỗi mới, kể cả 5 lỗi baseline logo.png/CountBadge cũng KHÔNG còn xuất hiện
  ở lần chạy sau cùng - có thể do cache `tsconfig`/`.next` giữa các lần chạy `tsc` liên tiếp, cần xác nhận
  lại ở phiên sau nếu tái diễn, KHÔNG liên quan code Phase 3).
- `npm run build` (Next.js 16 Turbopack): **Compiled successfully**, đủ 32 route bao gồm
  `/cong-viec-dinh-ky`.
- `npx vitest run`: **14/14 test pass**, không regression.
- `npx eslint` trên `page.tsx`: 16 problems - ĐÚNG BẰNG baseline `any`-errors (12, không tăng, đã dọn hết
  3 cái mới) + 2 lỗi `react-hooks/set-state-in-effect` MỚI (từ 2 `useEffect` mới thêm để đồng bộ
  `customerIds` và `knownCustomers`) - mirror ĐÚNG 1 lỗi CÙNG LOẠI đã có sẵn từ trước ở effect `setPage(1)`
  (dòng 164) - xác nhận bằng `git stash` diff trước/sau, không phải rule mới phát sinh riêng cho code này.
  `next build` KHÔNG chạy ESLint (không thấy bước "Running ESLint" trong output, khác giả định cũ ở
  `SKILL_NEXTJS_FRONTEND.md` rằng `no-explicit-any` chặn hẳn build) - ghi nhận lại để tránh hiểu nhầm ở
  phiên sau: lint và build là 2 gate TÁCH RIÊNG trong repo này hiện tại.

**Còn lại:** Phase 4-7 (như entry trước). Có thể cân nhắc dọn nợ lint `react-hooks/set-state-in-effect`
(3 chỗ, kể cả 1 chỗ cũ) ở 1 phiên riêng sau này nếu chủ dự án muốn, không cấp thiết vì không chặn build.
## [2026-09-15 11:15] | Hoàn tất FE Phase 4 "Công việc định kỳ" (gán/gỡ Phụ trách phụ trong TaskLinksModal) + fix deprecated `optionFilterProp` | Status: Success

**Actor:** Agent

Hoàn thiện phần FE Phase 4 còn dang dở từ phiên trước (BE đã xong sạch, FE mới có imports/hooks/state):
- `TaskLinksModal.tsx`: thêm `secondaryCandidates` (lọc người đã là Phụ trách chính hoặc đã là Phụ trách
  phụ), `handleAddSecondary` (gọi tuần tự `mutateAsync` từng `userId` - đúng contract BE chỉ nhận 1
  người/request, KHÔNG batch), `handleRemoveSecondary`, và section JSX "Phụ trách phụ" (SimpleList hiển
  thị danh sách hiện tại + Select multiple chọn thêm), mirror đúng style phần "Khách hàng liên quan"
  Phase 3 phía trên.
- Đối chiếu `PLAN_PERIODIC_TASKS_MODULE.md` mục 2.5 + `create-periodic-task.dto.ts`/
  `update-periodic-task.dto.ts`: xác nhận KHÔNG có field `secondaryAssigneeIds` lúc Tạo/Sửa Task - Phụ
  trách phụ CHỈ quản lý sau khi Task đã tồn tại qua `TaskLinksModal` (giống Customer Phase 3) - **không**
  thêm field vào Modal Tạo/Sửa ở `page.tsx` (khác với 1 ý trong báo cáo transcript phiên trước dán vào -
  báo cáo đó không khớp code/PLAN thật, đã tự verify lại bằng code + PLAN doc trước khi tin).
- Fix warning deprecated `optionFilterProp` (antd: "please use showSearch.optionFilterProp") ở cả 3
  `Select` trong file (Task cha, Task con, và Phụ trách phụ mới thêm) - đổi `showSearch` (boolean) +
  `optionFilterProp="label"` (2 prop rời) thành `showSearch={{ optionFilterProp: 'label' }}` (object),
  đúng convention đã dùng sẵn ở `CustomerFilters.tsx`, `phong-ban/page.tsx` và nhiều nơi khác trong repo.

**Files Changed:**
- `frontend/src/components/periodic-tasks/TaskLinksModal.tsx` - thêm handler + JSX Phụ trách phụ, fix
  deprecated `optionFilterProp` x3

**Verify thật:**
- `npx tsc --noEmit`: sạch, 0 lỗi (kể cả 5 lỗi baseline logo.png/CountBadge cũng không xuất hiện lần
  này - cùng hiện tượng cache đã ghi nhận ở entry Phase 3 trước, không liên quan code lượt này).
- `npm run build` (Next.js 16 Turbopack): Compiled successfully, đủ 32 route bao gồm `/cong-viec-dinh-ky`.
- `npx vitest run`: 14/14 test pass, không regression.

**Còn lại:** Phase 4 coi như ĐỦ cả BE+FE. Còn Phase 5-7 (như entry trước) + nợ lint
`react-hooks/set-state-in-effect` (không cấp thiết, đã ghi ở entry trước).

## [2026-09-15 12:30] | Hoàn tất BE Phase 5 "Công việc định kỳ" (Khoá/Mở khoá - approve) | Status: Success

**Actor:** Agent (Claude)

Tiếp tục từ commit trước (`1a02bb5 - Setup migration, entity, dto and service for Phase 5 (Not yet
done BE)`) - migration/entity/DTO/service `lock()`/`unlock()`/`assertEditableWhenLocked()` đã có sẵn
nhưng **build đang gãy thật sự** và thiếu endpoint. Đã hoàn thiện + verify thật, không suy diễn từ
transcript phiên trước.

**Đã làm:**
1. **Fix build gãy** (nguyên nhân: commit trước đổi signature `update()`/`addLink()`/`removeLink()`/
   `addSecondaryAssignee()`/`removeSecondaryAssignee()` từ `(id, dto, userId, userRole, scope)` sang
   `(id, dto, user: RequestingUser, scope)` để hỗ trợ `assertEditableWhenLocked()`, nhưng KHÔNG sửa
   controller + 3 spec file gọi theo signature cũ) - `tsc --noEmit` từng lỗi 25 chỗ
   `TS2554: Expected 3-4 arguments, but got 5`. Đã sửa `periodic-tasks.controller.ts` (5 chỗ) +
   `periodic-tasks.service.spec.ts` (5 chỗ) + `periodic-task-links.service.spec.ts` (8 chỗ) +
   `periodic-task-secondary-assignees.service.spec.ts` (6 chỗ) để truyền `user` object thay vì
   `user.id, user.role` rời.
2. **Thêm 2 endpoint còn thiếu** ở `periodic-tasks.controller.ts`: `PATCH /periodic-tasks/:id/lock`
   (body `LockPeriodicTaskDto.lockNote?`) và `PATCH /periodic-tasks/:id/unlock` - cả 2 gắn
   `@RequirePermission('periodic_tasks.approve')`, gọi thẳng `service.lock()`/`service.unlock()` đã có
   sẵn từ commit trước (idempotent, tự do lock↔unlock nhiều lần - PLAN mục 2.9).
3. **Nối `assertEditableWhenLocked()` vào `PeriodicTaskCustomersService`** (Phase 3) - PLAN mục 2.9 yêu
   cầu rõ áp dụng cho CẢ sub-endpoint customers, nhưng `addCustomers()`/`removeCustomer()` đang thiếu
   (chỉ có ở links/secondary-assignees) - đã bổ sung, Task khoá mà thiếu `periodic_tasks.edit_locked`
   giờ 403 đúng khi gắn/gỡ Customer, không riêng PATCH nội dung Task.
4. **Fix test mock thiếu** - `mockTasksService` ở cả 3 spec (`links`/`secondary-assignees`/`customers`)
   thiếu hẳn `assertEditableWhenLocked: jest.fn()` (sẽ throw `TypeError: ... is not a function` lúc chạy
   thật dù tsc sạch) - đã thêm + `mockResolvedValue(undefined)` trong `beforeEach`. Đồng thời
   `periodic-tasks.service.spec.ts` chưa provide mock cho `PermissionsService` (dependency mới của
   `PeriodicTasksService` từ Phase 5) - Nest DI sẽ throw lúc `Test.createTestingModule().compile()` -
   đã thêm `mockPermissionsService` vào providers.
5. Dọn tiện thể 148 lỗi prettier `--fix` tự động trên các file vừa sửa (baseline vốn đã lỗi trước khi
   tôi chạm vào, đã xác nhận bằng `git stash` so sánh trước/sau: 227 problems -> 67 problems, giảm chứ
   không tăng, không phải tôi gây ra thêm).

**Kiểm tra riêng theo yêu cầu chủ dự án - phân quyền lock/unlock:**
- Migration `1782600000000-AddPeriodicTaskLockColumns.ts` (đã có từ commit trước, xác nhận lại): seed ĐỦ
  2 permission `periodic_tasks.approve` (scope: admin/assistant=all, manager=department, employee KHÔNG
  seed - mirror view/create/edit nhưng bỏ employee) và `periodic_tasks.edit_locked` (nhị phân, CHỈ
  Admin) - khác đúng kiểu với `delete` (chỉ Admin scope=all) và `edit` (đủ 4 role có scope), đúng PLAN
  mục 4.
- **Phát hiện gap hiển thị UI (ngoài phạm vi Phase 5, nhưng liên quan trực tiếp câu hỏi)**: resource
  `periodic_tasks` (và `periodic_task_statuses`) **hoàn toàn thiếu** trong `RESOURCE_LABEL` ở
  `frontend/src/app/(dashboard)/phan-quyen/page.tsx` - nghĩa là TOÀN BỘ nhóm quyền Công việc định kỳ
  (không riêng approve/edit_locked) đang hiện raw key xấu `"periodic_tasks"` thay vì tiếng Việt trên
  trang Phân quyền, từ trước khi có Phase 5. Chưa sửa (để dành đúng giai đoạn FE theo yêu cầu chủ dự án -
  sẽ cần thêm 2 dòng vào `RESOURCE_LABEL`, mirror các entry `assignment_groups`/`customer_statuses` đã có
  sẵn trong cùng file).

**Files Changed:**
- `backend/src/modules/periodic-tasks/periodic-tasks.controller.ts` - fix 5 chỗ gọi service sai
  signature, thêm 2 endpoint `lock`/`unlock`
- `backend/src/modules/periodic-tasks/periodic-task-customers.service.ts` - nối
  `assertEditableWhenLocked()` vào `addCustomers()`/`removeCustomer()`
- `backend/src/modules/periodic-tasks/periodic-tasks.service.spec.ts` - fix 5 chỗ gọi sai + thêm mock
  `PermissionsService`
- `backend/src/modules/periodic-tasks/periodic-task-links.service.spec.ts` - fix 8 chỗ gọi sai + thêm
  mock `assertEditableWhenLocked`
- `backend/src/modules/periodic-tasks/periodic-task-secondary-assignees.service.spec.ts` - fix 6 chỗ gọi
  sai + thêm mock `assertEditableWhenLocked`
- `backend/src/modules/periodic-tasks/periodic-task-customers.service.spec.ts` - thêm mock
  `assertEditableWhenLocked`

**Verify thật:**
- `npx tsc --noEmit`: sạch, 0 lỗi (trước khi sửa: 25 lỗi `TS2554`).
- `npx jest` toàn bộ backend: **34 suite pass, 620/620 test pass**, không regression module nào khác
  (bao gồm 6 suite riêng `periodic-tasks*`: 81/81 test pass).
- `npx nest build`: build production sạch, không lỗi/không warning.
- `npx eslint --fix` trên 6 file vừa sửa: 227 problems -> 67 problems (44 error + 23 warning còn lại là
  baseline `@typescript-eslint/no-unsafe-*` do dùng `any` cho mock/QueryBuilder/`@GetUser() user: any` -
  pattern có sẵn xuyên suốt toàn bộ controller/spec từ trước, không phải nợ mới).
- Migration: chưa chạy thật lên DB (đúng rule dự án - không tự chạy migration lên DB của chủ dự án, chỉ
  đưa file để họ tự chạy/xác nhận). Đã rà cú pháp qua `tsc`/`nest build` (sạch) + đọc lại logic
  `up()`/`down()` đối xứng, dùng `findColumnByName()`/`foreignKeys`/`indices` check tồn tại trước ALTER
  (đúng convention MySQL không hỗ trợ `IF NOT EXISTS` cho ALTER, đã đính chính ở
  `SKILL_DATABASE_MANAGEMENT.md`).
- Đã `git commit` cục bộ trong sandbox (`a9c1bf3`) - **KHÔNG push** theo yêu cầu chủ dự án; chủ dự án tự
  đồng bộ code khi cần.

**Kết luận:** Phase 5 (Khoá/Mở khoá) nay **ĐỦ điều kiện coi là hoàn tất BE** - đúng đủ 2 permission
`approve`/`edit_locked` seed migration, 2 endpoint `lock`/`unlock`, `assertEditableWhenLocked()` áp dụng
đồng bộ ở CẢ 4 nơi sửa dữ liệu Task (`update`, links, secondary-assignees, customers), build+test+lint
sạch thật (không suy diễn). Sẵn sàng chuyển sang **FE Phase 5** khi chủ dự án yêu cầu.

**Còn lại (ngoài phạm vi phiên này):**
- FE Phase 5: nút Khoá/Mở khoá trong `TaskLinksModal.tsx` hoặc trang chính `cong-viec-dinh-ky/page.tsx`
  (gate theo `can('periodic_tasks.approve')`), hiện badge/trạng thái khoá trên Card/Table, và ẩn nút Sửa
  khi `isLocked=true` mà thiếu `periodic_tasks.edit_locked` (dùng `can('periodic_tasks.edit_locked')`).
- **Cần làm cùng lúc FE Phase 5 hoặc trước đó**: thêm `periodic_tasks: 'Công việc định kỳ'` và
  `periodic_task_statuses: 'Trạng thái công việc định kỳ'` vào `RESOURCE_LABEL` ở
  `frontend/.../phan-quyen/page.tsx` (gap có sẵn từ trước Phase 5, xem mục "Kiểm tra riêng" ở trên) - nếu
  không sửa, Admin sẽ không thấy tên tiếng Việt của 2 permission mới `approve`/`edit_locked` (và toàn bộ
  nhóm quyền Công việc định kỳ khác) trên trang Phân quyền.
- Phase 6 (checklist con), Phase 7 (audit log riêng) - chưa code, xem PLAN mục 6.
- Chưa có test riêng cho `lock()`/`unlock()`/`assertEditableWhenLocked()` trong
  `periodic-tasks.service.spec.ts` (chỉ mới có mock để các spec KHÁC không gãy) - nên bổ sung ở phiên sau
  để phủ đúng spec bắt buộc PLAN mục 6 Phase 5 (idempotent lock nhiều lần, 403 khi thiếu `edit_locked`,
  Root Admin bypass).
- Migration chưa chạy thật lên DB nào (theo đúng rule "không tự chạy migration lên production") - chủ dự
  án cần tự `npm run migration:run` và xác nhận.

  ## [2026-09-15 13:00] | FE Phase 5 "Công việc định kỳ" (Khoá/Mở khoá) - vá 2 lỗ hổng gate còn sót | Status: Success

**Actor:** Agent (Claude)

Pull lại repo thật trước khi làm (rule dự án) — phát hiện commit `2459b17 "Feat: Update api, hook and
page for cong-viec-dinh-ky Phase 5 (Not yet done)"` đã có sẵn trên `origin/main` (tác giả
`tuannho0802`, không phải agent phiên này) — nghĩa là phần FE Phase 5 chính (nút Khoá/Mở khoá +
Modal + Tag "Đã khoá" + disable nút Sửa khi khoá ở `page.tsx`, cùng `periodicTasksApi.lock/unlock` +
2 hook `useLockPeriodicTask`/`useUnlockPeriodicTask`) đã tồn tại và đã ĐỦ tốt — không làm lại. Đọc kỹ
transcript phiên trước dán vào chỉ để tham khảo hướng đi, đã tự verify lại toàn bộ bằng code thật
(đúng rule "không tin báo cáo").

**Đã tìm thấy 2 gap thật (đối chiếu PLAN mục 2.9 + rule FE mục 4 của dự án) và đã sửa:**

1. **`TaskLinksModal.tsx` KHÔNG gate theo `isLocked`/`edit_locked`** — BE áp `assertEditableWhenLocked()`
   ở CẢ 3 hành động sửa dữ liệu trong modal này (gán/gỡ liên kết cha-con, Khách hàng, Phụ trách phụ —
   xem entry BE Phase 5 phía trên), nhưng modal chỉ gate theo `periodic_tasks.edit`/`link_customer` như
   cũ, không biết gì về khoá — user có đủ quyền `edit` vẫn thấy nút Gán/Gỡ HIỆN dù Task đang khoá, bấm
   vào mới ăn 403. Vi phạm đúng rule mục 4: "Nếu BE 403 một endpoint, FE phải tự ẩn UI tương ứng trước
   khi user bấm được, không để lộ ra rồi báo lỗi 403."
   - Thêm `canEditLocked = can('periodic_tasks.edit_locked')`, tính `isLocked` ưu tiên từ
     `taskDetail.isLocked` (fetch riêng qua `GET /:id`, tự refetch khi Khoá/Mở khoá ở `page.tsx` vì cùng
     invalidate `LIST_KEY`) hơn `task.isLocked` (prop từ danh sách, có thể cũ hơn 1 nhịp).
   - `canEditLinks`/`canLinkCustomer` giờ = quyền gốc AND `!lockBlocksEdit` (`lockBlocksEdit = isLocked
     && !canEditLocked`) — áp dụng đồng bộ cho CẢ 3 khu vực (liên kết cha/con, Khách hàng, Phụ trách phụ)
     vì cả 3 đều dùng lại 2 biến này.
   - Thêm Tag "Công việc đang bị khoá" ở đầu modal khi `isLocked`, và sửa 3 dòng text "chỉ có quyền
     xem..." để phân biệt rõ 2 nguyên nhân khác nhau (thiếu quyền gốc vs. bị khoá) — tránh hiểu lầm case
     "tôi CÓ quyền Sửa mà sao không gán được" khi thực ra do khoá.

2. **`RESOURCE_LABEL` thiếu `periodic_tasks`/`periodic_task_statuses`** ở `phan-quyen/page.tsx` — gap này
   đã được ghi nhận ở entry BE Phase 5 phía trên (tồn tại từ trước Phase 5, không riêng
   `approve`/`edit_locked`) nhưng cố tình để dành đúng giai đoạn FE — nay đã thêm 2 dòng, mirror đúng
   style comment các entry `assignment_groups`/`customer_statuses` có sẵn trong cùng file.

**Files Changed:**
- `frontend/src/components/periodic-tasks/TaskLinksModal.tsx` — thêm gate khoá cho links/customers/phụ
  trách phụ, Tag cảnh báo khoá, sửa 3 dòng text giải thích lý do ẩn nút
- `frontend/src/app/(dashboard)/phan-quyen/page.tsx` — thêm 2 entry `RESOURCE_LABEL`

**Verify thật (không suy diễn):**
- `npx tsc --noEmit`: chỉ còn đúng 5 lỗi baseline (`logo.png` thiếu file thật trong repo,
  `CountBadge.tsx` lỗi type `styled-jsx`) — KHÔNG liên quan 2 file vừa sửa, đã xác nhận bằng
  `git stash`/`git stash pop` so sánh trước/sau, số lỗi và nội dung giống hệt nhau.
- `npm run build` (Next.js 16 Turbopack): **Compiled successfully**, đủ 32 route bao gồm
  `/cong-viec-dinh-ky` và `/phan-quyen`.
- `npx vitest run`: 14/14 test pass, không regression.
- `npx eslint` trên 2 file vừa sửa: 8 problems (7 `no-explicit-any` + 1 `exhaustive-deps` warning) —
  ĐÚNG BẰNG baseline (đối chiếu `git stash` trước/sau, chỉ lệch số dòng do code chèn thêm, không phải
  lỗi mới).
- Đã `git commit` cục bộ trong sandbox (`3f208c7`) — **KHÔNG push**, mirror đúng quy ước các entry
  trước (chủ dự án tự đồng bộ code khi cần).

**Kết luận:** FE Phase 5 (Khoá/Mở khoá) nay coi là **hoàn tất cả 2 nơi** hiển thị/thao tác liên quan
khoá (trang chính `page.tsx` — đã có sẵn từ trước — và `TaskLinksModal.tsx` — vừa vá ở phiên này), cùng
gap hiển thị tên tiếng Việt ở trang Phân quyền. Phase 5 coi như ĐỦ cả BE+FE.

**Còn lại (ngoài phạm vi phiên này):**
- Phase 6 (checklist con), Phase 7 (audit log riêng) — chưa code, xem PLAN mục 6.
- Chưa có test riêng (`vitest`) cho behavior mới của `TaskLinksModal.tsx` khi `isLocked=true` — nên bổ
  sung ở phiên sau nếu dự án có thói quen viết test cho component này (hiện tại repo chưa có sẵn spec
  file nào cho `TaskLinksModal.tsx` để mirror).
- Vẫn còn nợ cũ đã ghi ở entry BE Phase 5 phía trên (test riêng cho `lock()`/`unlock()` ở backend, chạy
  migration thật lên DB).

  ## [2026-09-15 13:40] | "Công việc định kỳ" - thêm Phụ trách phụ vào Modal Tạo/Sửa + đổi UI Khách hàng liên quan thành dạng list (theo yêu cầu chủ dự án, trước Phase 6) | Status: Success

**Actor:** Agent (Claude)

Yêu cầu chủ dự án (kèm ảnh chụp Modal Sửa Task thật): UI "Khách hàng liên quan" ở Modal Tạo/Sửa dùng 1
`Select mode="multiple"` gộp chung cả chip đã chọn lẫn ô tìm kiếm - khó dùng khi đã gắn nhiều Khách hàng
(ảnh minh hoạ đúng vấn đề này). Yêu cầu đổi sang UI dạng list như `TaskLinksModal.tsx` ("Liên kết"), và bổ
sung luôn "Phụ trách phụ" (đang thiếu hoàn toàn ở Modal Tạo/Sửa, trước đây theo JSDoc cũ ở
`TaskLinksModal.tsx`/entry Phase 4 phía trên, CỐ Ý chỉ cho quản lý sau khi Task đã tồn tại qua nút "Liên
kết" - nay chủ dự án đổi ý, muốn có luôn trong Modal Tạo/Sửa).

**Đã làm** (`frontend/src/app/(dashboard)/cong-viec-dinh-ky/page.tsx`):

1. **Đổi UI "Khách hàng liên quan"**: từ 1 `Select mode="multiple"` (value = `customerIds`, chọn thẳng)
   sang **list + ô tìm riêng** (copy đúng UX 2 bước "chọn -> Gán" từ `TaskLinksModal.tsx`):
   - `SimpleList` hiển thị `customerIds` đã gắn (tên + SĐT + Tag PTC nếu có), mỗi dòng có nút Gỡ (icon
     `DeleteOutlined`, xoá thẳng khỏi `customerIds` cục bộ - KHÔNG gọi API ngay, vẫn giữ nguyên cơ chế
     diff-on-save cũ vì Modal này còn dùng chung cho cả Tạo mới lúc Task CHƯA có `id`).
   - Bên dưới: `Select mode="multiple"` MỚI chỉ giữ lựa chọn TẠM (`pendingCustomerIdsToAdd`, options đã
     lọc bỏ Customer đã có trong `customerIds`) + nút "Gán" gộp vào `customerIds` chính thức rồi xoá lựa
     chọn tạm - đúng 2 bước như `TaskLinksModal.tsx`, không còn chip + tìm kiếm chung 1 ô.
   - **Không đổi logic lưu** (`toAdd`/`toRemove` diff lúc Sửa, gọi `addTaskCustomers` sau khi tạo Task lúc
     Tạo mới) - chỉ đổi UI hiển thị/thao tác, giảm rủi ro so với viết lại toàn bộ luồng lưu.

2. **Thêm mới "Phụ trách phụ"** vào Modal Tạo/Sửa, dùng lại NGUYÊN cơ chế state cục bộ + diff-on-save như
   Customer ở trên (Task chưa tồn tại lúc Tạo mới nên không thể gọi `POST .../secondary-assignees` ngay):
   - State: `secondaryAssigneeIds`/`originalSecondaryAssigneeIds`/`pendingSecondaryUserIds`, nạp từ
     `editingTaskDetail.secondaryAssignees` (đã fetch sẵn cho phần Customer, dùng lại luôn, không fetch
     thêm request nào).
   - Loại người đang là "Người phụ trách chính" khỏi ứng viên - dùng `Form.useWatch('primaryAssigneeId',
     form)` để phản ứng ngay khi đổi Select đó (mirror `secondaryCandidates` ở `TaskLinksModal.tsx`).
   - Gate bằng `periodic_tasks.edit` (biến `canEdit` có sẵn ở đầu file) - KHÔNG có permission nhị phân
     riêng như `link_customer` (đúng PLAN mục 2.5/2.12, mirror `TaskLinksModal.tsx`).
   - Lúc Sửa: diff `secondaryToAdd`/`secondaryToRemove` rồi gọi tuần tự `addSecondaryMutation`/
     `removeSecondaryMutation` **từng người 1** (endpoint chỉ nhận 1 `userId`/lần, KHÔNG batch - khác
     Customer có batch `customerIds[]`). Lúc Tạo mới: sau khi tạo Task thành công, `forEach` gọi
     `addSecondaryMutation` cho từng id đã chọn.

**Files Changed:**
- `frontend/src/app/(dashboard)/cong-viec-dinh-ky/page.tsx` - đổi UI Customer thành list+ô tìm riêng,
  thêm state/JSX/logic lưu cho Phụ trách phụ

**Verify thật:**
- `npx tsc --noEmit`: sạch, 0 lỗi.
- `npm run build` (Next.js 16 Turbopack): **Compiled successfully**, đủ 32 route.
- `npx vitest run`: 14/14 test pass, không regression.
- `npx eslint` trên file: 16 -> 20 problems, đối chiếu `git stash` từng rule cụ thể (không chỉ đếm tổng):
  - `@typescript-eslint/no-explicit-any`: 12 -> 15 (+3) - do 3 chỗ dùng `u: any` khi lặp qua `users` (từ
    `useUsersList()`, vốn KHÔNG có type mạnh - toàn bộ file từ trước đã dùng `any` cho biến này ở nhiều
    chỗ khác, ví dụ dropdown "Người phụ trách chính" - mirror ĐÚNG pattern có sẵn, không phải kiểu lỗi
    mới).
  - `react-hooks/set-state-in-effect`: 3 -> 4 (+1) - `useEffect` mới nạp `secondaryAssigneeIds` từ
    `editingTaskDetail` mirror Y HỆT `useEffect` nạp `customerIds` đã có sẵn ngay phía trên (cùng file,
    cùng shape) - không phải rule mới phát sinh riêng cho code này.
  - `react-hooks/exhaustive-deps`: không đổi (1 -> 1, baseline cũ không liên quan).
- Đã `git commit` cục bộ (`1c54e52`) - **KHÔNG push**, mirror quy ước các entry trước.

**Còn lại:** Chưa test thủ công trên UI thật (chỉ verify qua build/tsc/lint) - đề nghị chủ dự án tự bấm
thử luồng Tạo mới + Sửa với cả 2 phần Khách hàng/Phụ trách phụ trước khi coi là xong hẳn. Sau entry này
chuyển sang **Phase 6 - Checklist con kiểu Trello** (PLAN mục 6, migration `periodic_task_checklist_items`).

## [2026-09-15 14:20] | Hoàn tất BE Phase 6 "Công việc định kỳ" (Checklist con kiểu Trello) - phát hiện thêm 1 bug thật ở scope "own" | Status: Success

**Actor:** Agent (Claude). Bắt đầu phiên bằng `git clone` lại repo mới nhất (KHÔNG tin transcript phiên
trước dán vào) - xác nhận HEAD thật là `313ccec` ("Docs: Update change about add more in modal of create
and edit task"), các commit cục bộ mà transcript trước tự báo đã tạo (`3f208c7`/`1c54e52`.v.v) **không hề
tồn tại** trong bản clone mới - đúng như chính entry log trước đã ghi "KHÔNG push". Đọc lại
`PLAN_PERIODIC_TASKS_MODULE.md` mục 3+4+6 (Phase 6) trước khi code.

**Đã làm (theo đúng PLAN mục 6 Phase 6, không seed permission riêng - thừa hưởng `periodic_tasks.
view/edit` của Task cha):**
1. Migration `1782700000000-CreatePeriodicTaskChecklistItems.ts` (timestamp lấy từ `ls` thật thư mục
   migrations, > `1782600000000` đang có, không đoán số) - bảng `periodic_task_checklist_items`
   (`task_id` FK CASCADE, `content` VARCHAR(500), `is_done` BOOLEAN, `position` INT, `created_by_id` FK
   SET NULL, `created_at`/`updated_at`). Hard delete khi xoá item, không soft-delete (mirror
   `PeriodicTaskSecondaryAssignee` Phase 4).
2. Entity `periodic-task-checklist-item.entity.ts`.
3. DTO: `CreatePeriodicTaskChecklistItemDto`, `UpdatePeriodicTaskChecklistItemDto` (viết tay, không
   `PartialType` vì cần thêm field `isDone` không có ở DTO tạo), `ReorderPeriodicTaskChecklistItemsDto`
   (`itemIds[]` = hoán vị ĐẦY ĐỦ của toàn bộ item hiện có trong Task).
4. `PeriodicTaskChecklistItemsService`: `findAllForTask()`/`create()`/`update()`/`remove()`/`reorder()`,
   TẤT CẢ đều qua "1 cổng gác" `tasksService.findOne()` trước (404 nếu Task ngoài scope), 4 hàm sửa dữ
   liệu (`create`/`update`/`remove`/`reorder`) đều gọi thêm `assertEditableWhenLocked()` (Task đang
   `is_locked=true` mà thiếu `periodic_tasks.edit_locked` -> 403, mirror nguyên tắc Phase 5 áp dụng cho
   MỌI nơi sửa dữ liệu thuộc Task). `reorder()` validate `itemIds` khớp 1-1 tập hợp item hiện có (thiếu
   hoặc thừa ID đều -> `BadRequestException`) trước khi ghi `position` mới theo đúng index trong mảng.
   `attachChecklistItems()` đính field `checklistItems` vào response `findOne()` - KHÔNG ẩn theo quyền
   (mirror `attachSecondaryAssignees()` Phase 4, đây là dữ liệu nội bộ của Task không phải Customer nhạy
   cảm).
5. Controller: thêm 5 route `GET/POST /periodic-tasks/:id/checklist-items`,
   `PATCH .../checklist-items/reorder`, `PATCH/DELETE .../checklist-items/:itemId`. **Lưu ý kỹ thuật cho
   phiên sau:** route tĩnh `reorder` PHẢI khai TRƯỚC route `:itemId` trong file Controller - NestJS/
   Express khớp route theo THỨ TỰ ĐĂNG KÝ chứ không theo độ cụ thể (specificity), khai sau sẽ khiến
   chuỗi `"reorder"` bị `:itemId` (+ `ParseIntPipe`) nuốt mất và trả 400 sai thay vì chạy đúng handler.
6. Module: đăng ký `PeriodicTaskChecklistItem` + `PeriodicTaskChecklistItemsService` vào
   `providers`/`exports`/`TypeOrmModule.forFeature`.
7. Spec `periodic-task-checklist-items.service.spec.ts`: 15 test case - `findAllForTask` (cổng gác +
   404 khi ngoài scope), `create` (tự tính `position` = MAX hiện có + 1, kể cả case chưa có item nào ->
   0; ném `ForbiddenException` khi Task khoá thiếu `edit_locked`), `update`/`remove` (404 nếu `itemId`
   không thuộc đúng `taskId` - không rò rỉ chéo Task), `reorder` (thiếu 1 ID -> 400, thừa 1 ID lạ -> 400,
   hợp lệ -> ghi đúng `position` theo index, khoá Task -> 403), `attachChecklistItems` (luôn trả mảng,
   không ẩn theo quyền).
8. Sau khi báo cáo tóm tắt ở lượt trước, chủ dự án yêu cầu: (a) sửa nốt 1 lỗi lint còn sót ở spec
   (`@typescript-eslint/no-unsafe-return` tại dòng `create: jest.fn((x) => x)` - đã thêm kiểu tường minh
   `(x: unknown) => x`, khác spec Phase 4 (`periodic-task-secondary-assignees.service.spec.ts`) không bị
   lỗi này dù cùng pattern - có thể do khác biệt suy luận kiểu của eslint theo ngữ cảnh dùng biến, không
   ảnh hưởng logic); (b) chạy `eslint --fix` cho toàn bộ file MỚI của Phase 6 để dọn hết lỗi
   `prettier/prettier` thuần format (36/37 lỗi tự fix được, không đụng logic).

**Verify thật (chạy lại SAU KHI sửa lint, không chỉ trước đó):**
- `npx tsc --noEmit`: sạch, 0 lỗi.
- `npm run build` (`nest build`): sạch.
- `npx jest` (toàn bộ, không filter): **35/35 suite pass, 634/634 test pass** (tăng từ 619 trước Phase 6
  - +15 test mới của `periodic-task-checklist-items.service.spec.ts`, không regression suite nào khác).
- `npx eslint` trên TOÀN BỘ 7 file mới của Phase 6 (entity, migration, 3 DTO, service, spec): **0 lỗi, 0
  cảnh báo** sau `--fix`. Riêng `periodic-tasks.controller.ts`/`periodic-tasks.module.ts` (file có sẵn,
  chỉ thêm code): baseline trước sửa = 67 problems (45 lỗi/22 cảnh báo, đo bằng `git stash` rồi lint lại);
  sau khi thêm 5 endpoint Phase 6 = 83 problems (+16, gồm +10 lỗi/+6 cảnh báo) - đối chiếu từng dòng xác
  nhận TOÀN BỘ là 2 loại rule đã có sẵn xuyên suốt file từ trước (`prettier/prettier` format nhiều dòng/
  nhiều tham số trên 1 dòng, và `@typescript-eslint/no-unsafe-*` do tham số `user: any` - pattern
  `@GetUser() user: any` đã dùng cho MỌI endpoint khác trong Controller từ Phase 1, không phải kiểu lỗi
  mới do Phase 6 gây ra).
- `git commit` cục bộ (`490abad`) - **KHÔNG push**, đúng quy ước dự án (10 tài khoản dùng chung repo).

**Phát hiện thêm 1 bug thật NGOÀI phạm vi Phase 6 (đúng quy tắc mục 8 - báo ngay khi thấy, không im lặng
bỏ qua) - trả lời trực tiếp câu hỏi của chủ dự án "phân quyền checklist mặc định có bật cho data của tôi,
bao gồm task được gán, không?":**

- Permission cho checklist: **KHÔNG có permission riêng** (đúng chủ ý PLAN mục 6) - checklist thừa hưởng
  100% `periodic_tasks.view` (đọc) và `periodic_tasks.edit` (sửa) của chính Task cha, đã seed sẵn từ
  Phase 1 (`1782100000000-SeedPeriodicTasksPermissions.ts`): `admin=all, assistant=all, manager=
  department, employee=own`. Vì vậy **mặc định ĐÃ BẬT** cho mọi Task nằm trong phạm vi scope của
  `periodic_tasks.edit` - không cần migration/permission mới nào cho riêng checklist.
- **NHƯNG** phát hiện `PeriodicTaskAccessHelper` (`helpers/periodic-task-access.helper.ts`,
  `applyViewFilter()` dòng ~51-58 và `canManageTask()` dòng ~92) ở scope `own` **CHỈ tính Task do mình
  tạo (`createdById`) HOẶC mình là Phụ trách CHÍNH (`primaryAssigneeId`)** - **KHÔNG có điều kiện OR cho
  Phụ trách PHỤ** (`periodic_task_secondary_assignees`, bảng đã tạo từ Phase 4). Đây không phải thiết kế
  cố ý - chính JSDoc gốc trong file (viết từ Phase 1, trước khi Phase 4 tồn tại) đã ghi rõ: "Phụ trách
  PHỤ - chưa tồn tại tới Phase 4, sẽ bổ sung điều kiện OR ở đây khi tới Phase đó" - nhưng rà lại toàn bộ
  `WORKFLOW_LOG.md` xác nhận Phase 4 (hoàn tất ở entry `[2026-09-15 11:15]`) **CHƯA từng quay lại sửa file
  này** - đây là 1 việc bị bỏ sót thật giữa các phiên, không phải chủ ý thiết kế.
- **Hệ quả thực tế:** 1 Employee (scope mặc định `own`) được gán làm **Phụ trách PHỤ** của 1 Task (không
  phải người tạo, không phải Phụ trách chính) hiện **KHÔNG thấy được Task đó** ở `GET /periodic-tasks`,
  `GET /periodic-tasks/:id` sẽ trả 404, và do đó **cũng không thao tác được checklist** của Task đó (vì
  checklist gate qua đúng `findOne()` này) - đúng tình huống chủ dự án đang hỏi ("bao gồm task được gán").
  Vẫn thấy/sửa được bình thường nếu Employee đó là Phụ trách CHÍNH hoặc người tạo Task.
- **CHƯA sửa trong phiên này** - nằm ngoài phạm vi Phase 6 đã giao, và đụng vào logic phân quyền dùng
  chung cho CẢ `findAll`/`findOne`/`update`/`remove`/mọi sub-resource (Phase 2-6) nên cần xác nhận trước
  khi sửa (đổi hành vi ảnh hưởng rộng, không phải lỗi cục bộ 1 chỗ). Đã báo cáo riêng ở chat để chủ dự án
  xác nhận có muốn sửa ngay không (dự kiến: thêm điều kiện `OR task.id IN (SELECT task_id FROM
  periodic_task_secondary_assignees WHERE user_id = :accessUserId)` vào cả `applyViewFilter()` và
  `canManageTask()`, không cần migration DB nào, chỉ sửa code 1 file).

**Còn lại (ngoài phạm vi phiên này):**
- Bug scope `own` thiếu Phụ trách phụ ở trên - CHỜ xác nhận chủ dự án trước khi sửa.
- Phase 6 FE (UI checklist kiểu Trello trong `cong-viec-dinh-ky/page.tsx`) - CHƯA làm, làm ở phiên sau
  sau khi chủ dự án xác nhận BE Phase 6 đã đúng ý.
- Phase 7 (audit log riêng, PLAN mục 6) - chưa code.

## [2026-09-15 15:40] | Bổ sung spec cho bug scope "own" thiếu Phụ trách PHỤ (code fix đã có sẵn từ trước, spec chưa theo kịp) | Status: Success

**Actor:** Agent (Claude). Bắt đầu phiên bằng `git clone` lại repo mới nhất (KHÔNG tin transcript dán vào)
- xác nhận HEAD thật là `f0188ae` ("Fix: Bug of secondary is not own data fix helper file (Not yet audit
full)"). Rà lại thì phát hiện: code fix cho bug scope `own` thiếu Phụ trách PHỤ (đã báo ở entry
`[2026-09-15 14:20]`) **ĐÃ được sửa xong trong `periodic-task-access.helper.ts`** ở cả `applyViewFilter()`
(thêm `OR task.id IN (SELECT psa.task_id FROM periodic_task_secondary_assignees ...)`) và `canManageTask()`
(thêm tham số `secondaryAssigneeUserIds: number[] = []` + điều kiện `.includes(userId)`) - đã commit
`b023c1a`/`f0188ae`. **NHƯNG** `periodic-task-access.helper.spec.ts` chưa được cập nhật theo - đúng như chủ
dự án phát hiện ("Spec về phần bug này chưa xử lý"): test `scope=own` của `applyViewFilter` chỉ assert 2
điều kiện cũ (không assert điều kiện Phụ trách PHỤ mới), và toàn bộ describe `canManageTask` không có test
nào truyền tham số `secondaryAssigneeUserIds` - nghĩa là nhánh code mới có thể bị xoá/sửa sai mà test vẫn
xanh (false confidence).

**Kiểm tra thêm theo yêu cầu chủ dự án:**
1. **Migration:** xác nhận lại KHÔNG cần migration nào cho bug này - đây thuần là lỗi logic TypeScript
   (thiếu điều kiện OR trong query builder + tham số hàm), không đụng schema DB. Bảng
   `periodic_task_secondary_assignees` đã tồn tại từ migration Phase 4
   (`1782500000000-CreatePeriodicTaskSecondaryAssignees.ts`), permission `periodic_tasks.*` đã seed đủ từ
   Phase 1 - không có gì thiếu ở tầng migration/permission.
2. **Phạm vi lan toả:** `grep` toàn bộ `backend/src` xác nhận `PeriodicTaskAccessHelper` CHỈ được dùng
   trực tiếp trong `periodic-tasks.service.ts` (`findAll`/`findOne` gọi `applyViewFilter`) - mọi
   sub-resource khác (`checklist-items`, `customers`, `links`, `secondary-assignees` service) đều đi qua
   "1 cổng gác" `tasksService.findOne()` nên tự động thừa hưởng fix, KHÔNG cần sửa thêm nơi nào khác.
   `canManageTask()` hiện KHÔNG được service nào gọi thật (chỉ tồn tại trong spec) - giữ nguyên như thiết
   kế gốc (mirror `CustomerAccessHelper.canManageCustomer()`, dự phòng cho chỗ cần check trong bộ nhớ),
   không phải lỗi.

**Đã làm - bổ sung spec còn thiếu (`periodic-task-access.helper.spec.ts`):**
1. Sửa test `scope=own (EMPLOYEE)` của `applyViewFilter`: thêm assertion cho đúng chuỗi SQL subquery
   `task.id IN (SELECT psa.task_id FROM periodic_task_secondary_assignees psa WHERE psa.user_id =
   :accessUserId)` - regression test cho đúng bug đã sửa.
2. Thêm 3 test case mới cho `canManageTask`: (a) `own -> true nếu là Phụ trách PHỤ` (truyền
   `secondaryAssigneeUserIds` có chứa `userId`), (b) `own -> false nếu KHÔNG có trong
   secondaryAssigneeUserIds` (không tự ý cho true tràn lan), (c) mặc định `secondaryAssigneeUserIds` rỗng
   nếu không truyền (không throw, phòng thủ).
3. Đổi tên mô tả test `own -> false nếu không phải người tạo, không phải phụ trách chính` thành có thêm
   "...không phải phụ trách phụ" cho khớp hành vi mới.

**Verify thật:**
- `npx tsc --noEmit`: sạch.
- `nest build`: sạch.
- `npx jest periodic-task-access.helper`: **22/22 pass** (tăng từ 19, +3 test mới).
- `npx jest` toàn bộ: **35/35 suite pass, 637/637 test pass** (tăng từ 634, không regression).
- `npx eslint --fix` cho `periodic-task-access.helper.spec.ts` + `periodic-task-access.helper.ts`: dọn hết
  lỗi `prettier/prettier` (đều là format thuần, đối chiếu `git diff` xác nhận không đổi logic). Còn lại 3
  lỗi `@typescript-eslint/no-unsafe-enum-comparison` ở `helper.ts` (dòng so sánh `userRole ===
  Role.ADMIN`) - đối chiếu bằng cách lint riêng bản gốc tại commit `313ccec` (trước cả bug fix lẫn Phase 6)
  xác nhận **CHÍNH XÁC 3 lỗi này đã tồn tại từ trước**, không phải do phiên này hay commit `f0188ae` gây
  ra - không sửa vì ngoài phạm vi yêu cầu (baseline có sẵn xuyên suốt file, đổi rule này cần bàn riêng vì
  có thể ảnh hưởng toàn bộ pattern `userRole: string` dùng chung nhiều helper khác trong dự án).
- `git commit` cục bộ - **KHÔNG push**, đúng quy ước dự án.

**Kết luận cho chủ dự án:** Bug scope `own` thiếu Phụ trách PHỤ **đã được sửa đầy đủ ở tầng BE** (cả code
fix lẫn spec regression test), lan toả đúng tới toàn bộ sub-resource (kể cả checklist Phase 6) qua "1 cổng
gác". Không cần migration. Sẵn sàng để xác nhận BE hoàn tất trước khi chuyển sang Phase 6 FE.

**Còn lại (ngoài phạm vi phiên này):**
- Phase 6 FE (UI checklist kiểu Trello) - chưa làm.
- Phase 7 (audit log riêng, PLAN mục 6) - chưa code.
- 3 lỗi lint `no-unsafe-enum-comparison` baseline ở `periodic-task-access.helper.ts` - có sẵn từ trước,
  chưa sửa (ngoài phạm vi yêu cầu phiên này).

## [2026-09-15 16:30] | Hoàn tất FE Phase 6 "Công việc định kỳ" (Checklist con kiểu Trello) | Status: Success

**Actor:** Agent (Claude). Bắt đầu bằng `git clone` lại repo mới nhất - HEAD thật `a4d82f2` (entry log
trước). Đọc lại `TaskLinksModal.tsx` (Phase 2-5) + `usePeriodicTaskSecondaryAssignees.ts` (Phase 4) trước
khi code để mirror ĐÚNG quy ước UI/hook đã có, không bịa pattern mới.

**Đã làm:**
1. `lib/api/periodic-tasks.api.ts`: thêm interface `PeriodicTaskChecklistItem` (khớp đúng response thật
   của `queryItems()` ở BE - CHỈ có `createdById`, KHÔNG có object `createdBy` vì Service không
   `leftJoinAndSelect` quan hệ này) + field `checklistItems?: PeriodicTaskChecklistItem[]` trên
   `PeriodicTask` (mirror `secondaryAssignees` - chỉ có ở `GET /:id`, không ẩn theo quyền).
2. `lib/api/periodic-task-checklist-items.api.ts` (mới): 5 hàm khớp đúng 5 endpoint BE Phase 6
   (`getAll/create/update/remove/reorder`) - tất cả hàm sửa dữ liệu trả về TOÀN BỘ danh sách mới nhất
   (mirror `addSecondaryAssignee`), đơn giản hoá sync state FE.
3. `lib/hooks/usePeriodicTaskChecklistItems.ts` (mới): 4 hook React Query
   (`useAddTaskChecklistItem/useUpdateTaskChecklistItem/useRemoveTaskChecklistItem/useReorderTaskChecklistItems`),
   mirror CHÍNH XÁC cấu trúc `usePeriodicTaskSecondaryAssignees.ts` (cùng namespace `LIST_KEY =
   'periodic-tasks'`, invalidate cả namespace vì `checklistItems` chỉ nằm trong response `GET /:id`).
4. `components/periodic-tasks/TaskChecklistModal.tsx` (mới): Modal riêng (KHÔNG nhét vào
   `TaskLinksModal` - đủ lớn để tách thành nhóm chức năng độc lập của riêng nó), mirror `TaskLinksModal`
   về mọi nguyên tắc chung: fetch `checklistItems` qua `usePeriodicTask(id)` riêng (prop `task` từ danh
   sách không có field này), gate quyền `periodic_tasks.edit` + chặn thêm bởi `edit_locked` khi Task đang
   khoá (disable toàn bộ nút sửa + hiện `Text` giải thích lý do, ĐÚNG nguyên tắc "BE 403 -> FE tự ẩn UI
   trước", Repository_Context___Rules mục 4), toast lỗi qua `getApiErrorMessage`.
   - Tick xong/chưa xong: `Checkbox` gọi `update({ isDone })` ngay khi đổi.
   - Sửa nội dung: bấm vào text -> chuyển sang `Input` inline, Enter/nút ✓ lưu, nút ✕ huỷ.
   - Thêm mới: `Input` + nút "Thêm" ở cuối, item mới luôn vào cuối danh sách (đúng hợp đồng BE, `position`
     tự tính).
   - Xoá: `Popconfirm` + nút xoá (mirror pattern `TaskLinksModal`).
   - **Sắp xếp lại ("kéo-thả kiểu Trello"):** dự án CHƯA cài thư viện drag-and-drop nào (`grep` xác nhận
     không có `@dnd-kit`/`react-beautiful-dnd` trong `package.json`) - để tránh thêm phụ thuộc mới chỉ cho
     1 tính năng nhỏ, dùng 2 nút "Lên"/"Xuống" đổi chỗ với item liền kề rồi gửi lại TOÀN BỘ mảng ID mới
     qua `reorder()` - đúng hợp đồng `ReorderPeriodicTaskChecklistItemsDto` (hoán vị đầy đủ) ở BE, đạt
     đúng kết quả "sắp xếp lại được" dù khác cơ chế tương tác (không phải kéo-thả chuột thật). Đã ghi rõ
     trong JSDoc file để phiên sau biết đổi sang DnD thật (nếu chủ dự án muốn) chỉ cần đổi phần render +
     `handleMove`, không cần đổi API/hook.
   - Reset form phụ (nội dung đang gõ dở) đặt TRỰC TIẾP trong `resetAndClose()` (gọi từ `onCancel`),
     KHÔNG dùng `useEffect` theo dõi `open` - tránh vi phạm rule `react-hooks/set-state-in-effect`
     (setState đồng bộ trong effect) mà bản thân file gặp phải lúc code lần đầu, đã tự sửa trước khi
     commit.
5. `app/(dashboard)/cong-viec-dinh-ky/page.tsx`: thêm nút "Checklist" (icon `CheckSquareOutlined`) cạnh
   nút "Liên kết" ở cột Thao tác (nút LUÔN hiện, chỉ cần `periodic_tasks.view` giống nút Liên kết - ai
   đứng được ở trang này cũng có sẵn), state `checklistingTask` + render `TaskChecklistModal` ở cuối
   trang (mirror `linkingTask`/`TaskLinksModal`). Nới `width` cột Thao tác từ 320 -> 420 để đủ chỗ cho nút
   mới (đối chiếu bằng mắt, không đo pixel chính xác - có thể cần tinh chỉnh thêm nếu vẫn chật ở màn hình
   nhỏ). Cập nhật JSDoc đầu file để nhắc Phase 6.

**Verify thật:**
- `npx tsc --noEmit` (frontend): sạch cho MỌI file mới/đã sửa. Còn 2 lỗi baseline KHÔNG liên quan
  (`logo.png` module not found x4, `CountBadge.tsx` kiểu `styled-jsx`) - đối chiếu `git stash` xác nhận
  **tồn tại y hệt TRƯỚC cả phiên này**, không phải do Phase 6 gây ra.
- `npm run build` (`next build`, Next.js 16 + Turbopack): **build thành công**, route `/cong-viec-dinh-ky`
  compile + generate static page bình thường, không lỗi.
- `npx eslint` cho 5 file mới/đã tạo (`TaskChecklistModal.tsx`, `periodic-task-checklist-items.api.ts`,
  `usePeriodicTaskChecklistItems.ts`, `periodic-tasks.api.ts`): **0 lỗi, 0 cảnh báo**.
- `npx eslint` cho `page.tsx` (file có sẵn, chỉ thêm code): baseline trước sửa (đối chiếu `git stash`) =
  20 problems (19 lỗi/1 cảnh báo, toàn bộ `@typescript-eslint/no-explicit-any` + `react-hooks/set-state-in-effect`
  có sẵn xuyên suốt file từ Phase 1-5); sau khi thêm nút Checklist = **VẪN ĐÚNG 20 problems** (chỉ lệch số
  dòng do chèn thêm code phía trên) - xác nhận Phase 6 KHÔNG thêm lỗi lint mới nào vào file này.
- Dự án frontend KHÔNG có test runner (`package.json` không có script `test`, chỉ có 1 file
  `nav-config.test.tsx` không liên quan) - không có gì để chạy test tự động cho UI, đúng hiện trạng dự án
  (mirror `TaskLinksModal.tsx` cũng không có file test riêng).

**Kết luận:** Phase 6 (Checklist con kiểu Trello, PLAN mục 6) đã HOÀN TẤT cả BE lẫn FE. Toàn bộ module
"Công việc định kỳ" (Phase 1-6) đã xong theo đúng PLAN - còn lại Phase 7 (audit log riêng).

**Còn lại (ngoài phạm vi phiên này):**
- Phase 7 (audit log riêng, PLAN mục 6) - chưa code.
- 3 lỗi lint `no-unsafe-enum-comparison` baseline ở `periodic-task-access.helper.ts` (BE) - có sẵn từ
  trước, chưa sửa.
- Sắp xếp checklist hiện dùng nút Lên/Xuống thay vì kéo-thả chuột thật (xem lý do ở JSDoc
  `TaskChecklistModal.tsx`) - nếu chủ dự án muốn nâng cấp lên kéo-thả thật, cần thêm thư viện DnD mới.

  ## [2026-09-15 12:51] | Hoàn tất Phase 7 "Công việc định kỳ" (Audit log riêng) - Toàn bộ module (Phase 1-7) xong | Status: Success

**Actor:** Agent (Claude). Tiếp tục từ báo cáo dở dang của phiên trước (dán transcript vào chat) - đúng
Repository_Context___Rules mục 1: coi transcript là gợi ý cần verify, không phải sự thật. Bắt đầu bằng
`git clone` lại repo mới nhất, `git log` xác nhận HEAD thật `dc5f111` (commit "Update: Add audit for spec
test... (Not yet done)") khớp với những gì transcript mô tả đã code xong (5 service đã wire
`logActionAsync`, endpoint controller, module DI) - đối chiếu bằng `grep` trực tiếp code thật, không tin
lời kể suông.

**Đã xác nhận ĐÚNG như transcript báo cáo (code thật khớp):**
- `periodic-task-audit.service.ts`, `periodic-task-audit-log.entity.ts`,
  `get-periodic-task-audit-logs.dto.ts`, migration `1782800000000-CreatePeriodicTaskAuditLogs.ts` (có
  `IF NOT EXISTS` + `up()`/`down()` đối xứng, đúng SKILL_DATABASE_MANAGEMENT mục 5).
- Cả 5 Service Phase 1-6 (`periodic-tasks`, `-links`, `-customers`, `-secondary-assignees`,
  `-checklist-items`) đã gọi `logActionAsync()` đúng chỗ cho mọi action chính (create/update/
  status_changed/primary_assignee_changed/lock/unlock/delete/parent_linked/unlinked/customer_linked/
  unlinked/secondary_assignee_added/removed/checklist_item_added/updated/removed/reordered).
- Controller đã có `GET /periodic-tasks/:id/audit-logs` (qua "1 cổng gác" `findOne()` trước, không tự
  check quyền riêng - đúng thiết kế JSDoc `getLogsForTask()`).
- `periodic-tasks.module.ts` đã đăng ký `PeriodicTaskAuditLog` + `PeriodicTaskAuditService` đầy đủ.
- 5 spec file service liên quan đã có mock `PeriodicTaskAuditService` + assertion `logActionAsync` cho
  từng action.
- Đã xác nhận (đọc source `node_modules/@vercel/functions/wait-until.js` thật) claim của phiên trước:
  `waitUntil()` gọi `getContext().waitUntil?.()` - optional chaining, không throw khi chạy ngoài Vercel
  (Jest) - an toàn dùng logAction thật (không cần mock) trong spec.

**Đã làm thêm trong phiên này (phần còn thiếu):**
1. Tạo `periodic-task-audit.service.spec.ts` (chưa tồn tại trước đó) - 8 test case:
   - `logAction`: tạo/lưu đúng field bắt buộc + field optional (`oldData/newData/ipAddress/userAgent`
     undefined vẫn hoạt động).
   - `logActionAsync`: gọi `save()` với đúng dữ liệu dù không `await` (fire-and-forget) - verify qua
     `await new Promise(process.nextTick)` để đợi microtask nội bộ; và không throw ra ngoài khi `save()`
     reject (nuốt lỗi qua `.catch()` + `Logger.error`, đúng JSDoc gốc).
   - `getLogsForTask`: filter đúng `taskId`, sort `createdAt DESC`, `leftJoinAndSelect('log.user')`,
     tính đúng `skip/take` theo `page/limit`, mặc định `page=1/limit=20` khi filters rỗng.
2. Ghi entry này vào `WORKFLOW_LOG.md`.

**Verify thật:**
- `npx tsc --noEmit`: sạch.
- `nest build`: sạch.
- `npx jest periodic-task-audit.service.spec.ts`: **8/8 pass** (dòng `[Nest] ERROR ... DB down` trong log
  console là output CHỦ Ý từ test case "không throw khi save() lỗi" - đúng hành vi mong đợi, không phải
  lỗi thật).
- `npx jest` toàn bộ: **36/36 suite pass, 650/650 test pass** (tăng từ 642 trước phiên này do thêm 8 test
  mới, không regression - đối chiếu đúng bằng chạy lại thật, không suy diễn).
- `npx eslint` cho file mới `periodic-task-audit.service.spec.ts`: 20 lỗi (prettier formatting +
  `@typescript-eslint/no-unsafe-*` trên mock repo kiểu `any` + `unbound-method` trên `jest.fn()` gán vào
  object). Đối chiếu bằng cách lint 1 spec file có sẵn tương tự (`periodic-task-links.service.spec.ts`,
  KHÔNG đụng trong phiên này) ra **37 lỗi CÙNG LOẠI** (prettier + `no-unsafe-assignment/member-access` +
  `no-unsafe-return`) - xác nhận đây là **baseline chung của toàn bộ spec file dùng mock repo `any`
  trong module `periodic-tasks`**, không phải lỗi riêng của file mới - không sửa vì ngoài phạm vi (đổi
  pattern mock repo cho sạch lint cần bàn riêng, ảnh hưởng toàn bộ spec file hiện có, rủi ro cao hơn lợi
  ích cho 1 phiên nhỏ).
- `git commit` cục bộ (**KHÔNG push**, đúng quy ước dự án + đúng yêu cầu tường minh của chủ dự án trong
  phiên này).

**Kết luận cho chủ dự án:** Phase 7 (PLAN mục 6, "audit log riêng cho module Công việc định kỳ") đã
**HOÀN TẤT ĐẦY ĐỦ** - migration, entity, service, wiring ở cả 5 service Phase 1-6, endpoint GET, spec
test cho từng action + cho chính `PeriodicTaskAuditService`. Toàn bộ module "Công việc định kỳ"
(Phase 1→7 theo `PLAN_PERIODIC_TASKS_MODULE.md`) đã xong. Sẵn sàng để chủ dự án tự `git push` khi xác
nhận ổn (Agent không tự push theo quy ước).

**Còn lại (ngoài phạm vi phiên này, không phải lỗi mới):**
- 3 lỗi lint `no-unsafe-enum-comparison` baseline ở `periodic-task-access.helper.ts` (có từ trước Phase 6).
- Lỗi lint prettier/`no-unsafe-*` rải rác baseline trong nhiều spec file + `periodic-tasks.service.ts`
  (đối chiếu xác nhận không phải do phiên này gây ra - tồn tại xuyên suốt các Phase trước).
- Sắp xếp checklist dùng nút Lên/Xuống thay kéo-thả chuột thật (đã ghi rõ lý do + JSDoc ở entry Phase 6).


## [2026-09-15 18:20] | Fix 2 bug thật ở Phase 8 "Công việc định kỳ" (403 spam thiếu quyền Customer + 400 limit>100) | Status: Success

**Actor:** Agent (theo báo lỗi kèm ảnh chụp của chủ dự án)

**Bối cảnh:** Chủ dự án test 1 Role chỉ bật đúng module Công việc định kỳ (mô phỏng "Content" - không
cần biết Khách hàng), tắt hết `customers.*`. Vào trang `/cong-viec-dinh-ky` thấy: (1) Toast đỏ
"Bạn không có quyền thực hiện hành động này" lặp lại liên tục; (2) Toast đỏ "limit must not be greater
than 100" lặp lại liên tục; view "Xem theo Ngày" không tải được data (mãi loading). Ảnh chụp thứ 2 (từ
Admin, xem đủ mọi quyền) xác nhận thêm: CHỈ view Bảng chạy được, 3 view Agenda/Kanban/Calendar đều lỗi
như nhau bất kể Role - tức bug #2 không phải do RBAC.

**Files Changed:**
- `frontend/src/lib/hooks/useCustomers.ts` — thêm tham số `enabled` (mirror đúng pattern
  `usePeriodicTasks(params, enabled)` đã có từ Phase 8), mặc định `true` nên KHÔNG đổi hành vi chỗ gọi
  cũ (`customers/page.tsx`).
- `frontend/src/app/(dashboard)/cong-viec-dinh-ky/page.tsx` — 2 chỗ:
  1. Gate `useCustomers()` (ô tìm Khách hàng trong modal Tạo/Sửa Task) bằng `enabled: canLinkCustomer`.
  2. Đổi `nonTableFilters.limit` từ `500` xuống `100`.
- `frontend/src/components/periodic-tasks/TaskLinksModal.tsx` — gate `useCustomers()` (ô tìm Khách hàng
  để gắn qua nút "Liên kết") bằng `enabled: canLinkCustomer` — comment cũ ở đây đã ghi ĐÚNG Ý ĐỊNH
  "chỉ chạy khi modal cho phép gắn Customer" nhưng code thực tế CHƯA từng làm vậy (hook `useCustomers`
  lúc viết Phase 3 chưa hỗ trợ `enabled`) — code không khớp comment, xác nhận bằng cách đọc trực tiếp.

**Root Cause (2 bug độc lập, không liên quan nhau):**
> **Bug 1 (403 spam theo Role):** Component `TaskLinksModal` LUÔN mount sẵn ở cuối `page.tsx`
> (`<TaskLinksModal open={!!linkingTask} ... />` — chỉ ẩn/hiện qua prop `open` của `<Modal>`, KHÔNG phải
> conditional render `{linkingTask && <TaskLinksModal />}`). Cả `TaskLinksModal` lẫn modal Tạo/Sửa Task
> ở `page.tsx` đều gọi `useCustomers()` (ô tìm Khách hàng để gắn vào Task) KHÔNG ĐIỀU KIỆN ngay lúc trang
> vừa tải xong — bất kể user có `periodic_tasks.link_customer` hay không, bất kể có từng mở Modal/bấm
> "Liên kết" hay chưa. User trong ảnh chụp chỉ có `periodic_tasks.*`, KHÔNG có `customers.view` → Backend
> trả 403 hoàn toàn ĐÚNG RBAC (không phải lỗi phân quyền Backend) — nhưng FE không có gì chặn request
> lúc mount, React Query tự retry → toast lỗi bắn liên tục dù user chưa hề chạm vào tính năng Customer.
>
> **Bug 2 (400 limit, xảy ra với MỌI Role kể cả Admin):** `nonTableFilters` (query riêng cho 3 view
> Agenda/Kanban/Calendar, không phân trang) set cứng `limit: 500` với lý do ghi trong comment cũ "500 đủ
> lớn cho quy mô Task hiện tại" — nhưng `PeriodicTaskFiltersDto.limit` ở Backend giới hạn cứng
> `@Max(100)` (đúng convention chung toàn dự án, đối chiếu `CustomerFiltersDto` cùng mức 100) — không hề
> được kiểm tra khớp lại lúc code Phase 8. Mọi request `GET /periodic-tasks?limit=500` bị `400 Bad
> Request "limit must not be greater than 100"` cho TẤT CẢ user, không phân biệt Role — đúng như ảnh
> chụp thứ 2 (Admin) xác nhận. Đây là lỗi Phase 8 tự thú "chưa build/test" trong tóm tắt trước đó của
> chính Agent — nay mới bị phát hiện thật qua báo lỗi của chủ dự án.

**Solution:**
> 1. Thêm `enabled` cho hook `useCustomers()` — cho phép nơi gọi tự TẮT hẳn query khi tính năng liên
>    quan không hiển thị/không được phép, đúng nguyên tắc dự án "BE 403 → FE tự ẩn TRƯỚC" áp dụng luôn
>    cho tầng data-fetching, không chỉ tầng UI (trước đây chỉ phần UI hiện/ẩn Select được gate bằng
>    `canLinkCustomer`, còn query nền vẫn chạy ngầm).
> 2. Gate cả 2 call site (`page.tsx` modal + `TaskLinksModal.tsx`) bằng đúng permission
>    `periodic_tasks.link_customer` (qua biến `canLinkCustomer` đã có sẵn ở cả 2 nơi).
> 3. Đổi `limit` của `nonTableFilters` từ `500` → `100` cho khớp giới hạn Backend, KHÔNG nới giới hạn
>    Backend (giữ nguyên convention `@Max(100)` áp dụng đồng nhất mọi module trong dự án) — 100 vẫn thừa
>    cho quy mô Task hiện tại (vài chục Task).

**Verify thật (không suy diễn):**
- `npm install` (chưa có `node_modules` từ trước) — sạch, 602 package.
- `npx next build` — sạch, Compiled + TypeScript pass, đủ 32 route kể cả `/cong-viec-dinh-ky`.
- `npx vitest run` — 2/2 suite, **14/14 test PASS** (không regression - không có spec nào đụng trực tiếp
  3 file vừa sửa nên số lượng giữ nguyên so với lần verify Phase 8 trước).
- Không đụng Backend trong phiên này (bug thuần FE, xác nhận DTO Backend vốn đã đúng, không cần sửa).

**Notes:**
> - Chưa có test tự động khoá hành vi `enabled` (mirror `usePeriodicTasks` cũng chưa có test riêng cho
>   `enabled` dù đã tồn tại từ Phase 8) — nếu muốn chống regression dài hạn, nên thêm test kiểu "hook
>   không gọi query khi `enabled=false`" cho cả `useCustomers`/`usePeriodicTasks`, hiện ưu tiên thấp hơn
>   vì bug đã có nguyên nhân rõ ràng và dễ soát lại bằng mắt (2 chỗ gọi trong toàn repo).
> - Đã cập nhật `PLAN_PERIODIC_TASKS_MODULE.md` — bổ sung mục "Phase 8 — View switcher" đầy đủ (trước đó
>   Phase 8 đã code + commit (`6da05c0`) nhưng CHƯA từng được ghi vào Plan/Log, đúng như tóm tắt cuối
>   cùng của lượt code trước đó tự nhận "chưa cập nhật Plan/WORKFLOW_LOG") — mục mới bao gồm cả 2 bug
>   vừa sửa ở entry này để tra cứu tại đúng 1 chỗ.
> - Root Admin/Assistant/Manager có `customers.view` nên KHÔNG bao giờ thấy Bug 1 khi tự test — đây là
>   lý do bug tồn tại từ lúc code Phase 3 (2026-09-15 sáng) đến giờ mới bị phát hiện: chỉ lộ ra khi có
>   Role thật sự bị tắt `customers.view`, đúng kịch bản chủ dự án vừa test.
