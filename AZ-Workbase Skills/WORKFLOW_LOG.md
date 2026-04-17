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
