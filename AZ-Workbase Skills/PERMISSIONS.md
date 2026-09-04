# 🔐 PERMISSIONS.md — Quy tắc phân quyền chuẩn (RBAC) toàn hệ thống AZ-Workbase

> **Đây là NGUỒN CHÂN LÝ DUY NHẤT (single source of truth) cho mọi quyết định phân quyền trong dự án.**
> Bất kỳ module/endpoint/trang UI nào xử lý quyền theo role phải tuân theo đúng bảng dưới đây.
> Nếu code hiện tại (BE hoặc FE) khác với tài liệu này → **tài liệu này đúng, code là bug cần sửa**,
> trừ khi tài liệu chưa được cập nhật theo quyết định nghiệp vụ mới nhất (luôn hỏi lại nếu nghi ngờ).
>
> **Cập nhật lần cuối:** 2026-08-28 (thêm mục 1.7 + 2.10 — tài liệu hoá hệ thống Permission tuỳ chỉnh
> (Dynamic RBAC: `RoleEntity`/`Permission`/`RolePermission`, `PermissionGuard`, trang `/phan-quyen`) vừa
> hoàn thành. **QUAN TRỌNG:** cơ chế mới này hiện CHỈ enforce cho đúng module `roles`/`permissions` —
> 9 module còn lại (2.1→2.9) VẪN dùng `@Roles()` tĩnh y hệt trước, CHƯA migrate. Đọc kỹ mục 1.7 để không
> hiểu nhầm phạm vi áp dụng. Đã verify: backend `tsc`/`nest build` sạch, **272/272 test pass** (18 suite,
> tăng từ 203 — thêm `roles.service.spec.ts`, `permissions.service.spec.ts`, và các spec module Reports/
> Attendance-export mới không thuộc phạm vi tài liệu này); frontend `tsc`/`next build` sạch.
> **Người xác nhận rule:** Chủ dự án (qua chat trực tiếp với Agent)

---

## 1. Nguyên tắc cốt lõi (áp dụng cho MỌI module, MỌI API, MỌI trang UI — không có ngoại lệ ngầm)

| Role | Phạm vi XEM (View) | Phạm vi SỬA (Create/Update) | XOÁ (Delete) |
|---|---|---|---|
| **Admin** | Toàn bộ dữ liệu, mọi phòng ban | Toàn bộ | ✅ Được |
| **Assistant** | Toàn bộ dữ liệu, **bất chấp phòng ban** (ngang Admin) | Toàn bộ (ngang Admin) | ❌ **Không** — ẩn hẳn nút xoá, khoá endpoint |
| **Manager** | Chỉ dữ liệu thuộc **phòng ban mình quản lý** (`department.manager_user_id = mình`) | Chỉ trong phạm vi phòng ban mình quản lý | ❌ **Không** — ẩn hẳn nút xoá, khoá endpoint |
| **Employee** | Chỉ dữ liệu **của bản thân** (tự tạo / đang là người phụ trách chính / đang được gán) | Chỉ trong phạm vi trên | ❌ **Không** |

### Diễn giải quan trọng (đúng nguyên văn yêu cầu nghiệp vụ, áp dụng cho MỌI module — kể cả Profile/User)

- **Assistant = Admin trừ Xoá, không có ngoại lệ nào khác.** Không chỉ riêng module Khách hàng — điều
  này áp dụng cho **TẤT CẢ** hành động quản trị, bao gồm cụ thể (liệt kê rõ vì đã từng gây hiểu nhầm):
  - Khoá/mở tài khoản (`isActive`)
  - Đặt lại mật khẩu (`reset-password`) của bất kỳ user nào
  - Sửa thông tin User: tên, SĐT, phòng ban, role, email...
  - Duyệt/từ chối đăng ký tài khoản mới (`approve`/`reject`)
  - Quản lý chấm công: map user máy chấm công, đồng bộ log (`sync`), sửa/gán log chấm công
  - Quản lý Category/Group liên kết, Nguồn Media (media-sources)
  - Toàn bộ CRUD Khách hàng, Chia data, Deposit, Nghỉ phép...

  Assistant **KHÔNG bị giới hạn theo phòng ban** — xem/sửa được mọi phòng ban giống hệt Admin. Điểm
  khác biệt DUY NHẤT với Admin là **không có quyền xoá/gỡ bỏ bất kỳ thứ gì** (xoá user, xoá khách hàng,
  xoá phòng ban, xoá category/group, xoá log chấm công, hard-delete dưới mọi hình thức).

- **Manager = Assistant nhưng bị khoanh vùng theo phòng ban mình quản lý.** Được xem và làm **mọi
  hành động** (trừ xoá) giống Assistant — bao gồm cả các mục liệt kê ở trên (khoá tài khoản, đổi mật
  khẩu, sửa thông tin user, chấm công...) — nhưng giới hạn phạm vi tác động là phòng ban mà chính họ là
  `manager_user_id` (không phải phòng ban họ *thuộc về* — 1 Manager có thể được xếp vào phòng ban A
  nhưng đang **quản lý** phòng ban B, thì phạm vi hành động là phòng ban B).

- **Employee** chỉ xem/sửa (trừ xoá) dữ liệu của **chính mình**: do mình tạo ra, mình đang là người
  phụ trách chính (primary), hoặc đang được gán (assignment/quản lý còn hiệu lực) — bao gồm cả **Profile
  bản thân** và **các nhóm (Group) được gán cho mình** (chính hoặc phụ). Employee không có quyền quản
  trị bất kỳ ai khác, không xem được thông tin nhạy cảm (lương, chấm công, profile...) của người khác.

### Quy tắc kỹ thuật bắt buộc khi implement

1. **BE luôn là nơi chặn thật sự.** FE chỉ ẩn UI cho gọn mắt (UX) — không bao giờ được coi FE filter
   là lớp bảo mật. Mọi endpoint list/get/update/delete đều phải tự áp lại đúng bảng phân quyền, kể cả
   khi FE đã lọc trước đó.
2. **1 nguồn áp filter duy nhất cho cả Xem lẫn Sửa trong từng module** — tránh viết 2 bộ điều kiện
   riêng rẽ rồi bị lệch nhau theo thời gian. Pattern chuẩn tham khảo:
   `backend/src/modules/customers/helpers/customer-access.helper.ts`
   (`CustomerAccessHelper.applyViewFilter()` dùng chung cho `findAll`/`findOne`/`getAssigned`/
   `getUnassigned`/`getStats*`, và `update()`/`remove()` đều gọi `findOne()` làm cổng gác trước khi
   sửa/xoá — không cần bộ điều kiện "canUpdate" riêng dễ lệch khỏi filter Xem).
3. **Xoá luôn là 1 hàm/điều kiện tách riêng, cực kỳ đơn giản** (`role === ADMIN`), không có ngoại lệ,
   không có logic "trừ khi là người tạo ra bản ghi" — vì Assistant/Manager/Employee **không bao giờ**
   được xoá dù là dữ liệu của chính họ.
4. **Khi thêm module mới có khái niệm "phòng ban"**, viết 1 helper tương tự
   `CustomerAccessHelper.applyViewFilter()` cho module đó — không copy-paste điều kiện role rải rác
   trong nhiều file (dễ quên 1 chỗ — bug gốc `getAssigned()` thiếu hẳn filter chính là do không tái
   dùng 1 helper chung, xem mục 3 "Lịch sử" bên dưới).
5. **FE**: nút Xoá chỉ hiện khi `user.role === 'admin'` — không viết điều kiện phức tạp kiểu
   `role === 'admin' || (role === 'assistant' && isOwner)`. Dropdown/filter phụ (không phải nút hành
   động) có thể lọc theo phạm vi Xem để UX gọn hơn, nhưng đây chỉ là tối ưu trải nghiệm, không phải
   yêu cầu bảo mật bắt buộc.
6. **Ngoại lệ có chủ đích, KHÔNG tính là vi phạm rule ở mục 1:** vài tính năng có mô hình quyền riêng vì
   bản chất nghiệp vụ khác (không phải "xem theo phòng ban") — ví dụ "Quản lý chính/phụ" của từng
   LinkGroup (xem mục 2.4) cho phép 1 Employee được gán làm quản lý XEM/THAO TÁC trên đúng group đó dù
   không phải Admin/Assistant/Manager phòng ban. Đây là quyền **theo tài nguyên cụ thể** (resource-level
   ownership), KHÁC với RBAC theo role ở mục 1 — 2 tầng quyền này hoạt động **song song, không thay thế
   nhau**: Admin/Assistant vẫn luôn full quyền; Manager vẫn theo phòng ban; còn cơ chế "chính/phụ" chỉ
   mở thêm 1 lối truy cập hẹp cho đúng Employee được gán, không nới quyền chung của Employee.
7. **Hệ thống Permission tuỳ chỉnh (Dynamic RBAC) — MỚI, xem mục 1.7 ngay dưới đây.** Đây KHÔNG thay thế
   rule tĩnh ở mục 1-6 (rule đó vẫn là "hợp đồng" cho toàn bộ 9 module hiện có) — đây là 1 TẦNG BỔ SUNG,
   hiện chỉ áp dụng cho đúng module `roles`/`permissions`. Đọc kỹ mục 1.7 trước khi thêm permission mới
   hoặc tưởng nhầm cả app đã "tự do hoá" theo Admin tuỳ chỉnh — CHƯA đúng, mới chỉ 1 module.

### 1.7. Hệ thống Permission tuỳ chỉnh (Dynamic RBAC) — cơ chế MỚI, đọc kỹ phạm vi áp dụng

> Thêm 2026-08-28 (sau khi merge nhánh `Feat: Add module, service for role and permission and also
> guard dynamic for it` → `Feat: Wiring endpoints for UI to use` → `Feat: create hooks to use Role and
> page for it`). Đây là thay đổi kiến trúc LỚN NHẤT kể từ khi tài liệu này ra đời — đọc hết mục này
> trước khi động vào bất kỳ thứ gì liên quan `roles`/`permissions`/`RolePermission`.

**Mục tiêu nghiệp vụ (nguyên văn yêu cầu chủ dự án):** Admin (end-user, không cần dev) tự tạo Role mới,
tự bật/tắt từng quyền cho từng Role qua UI — không cần sửa code/deploy lại. Khi Admin đổi ma trận quyền,
**API và UI phải đồng bộ ngay** (BE thật sự chặn, FE thật sự ẩn/disable — không phải chỉ 1 trong 2).

**3 khái niệm cốt lõi (đọc entity gốc để hiểu đầy đủ — `database/entities/{role,permission,
role-permission}.entity.ts`):**

| Khái niệm | Là gì | Ai sửa được |
|---|---|---|
| `RoleEntity` (bảng `roles`) | 1 vai trò — gồm 4 role hệ thống (`admin/manager/assistant/employee`, `isSystem=true`, không xoá được, `code` bất biến) + role tuỳ chỉnh Admin tự tạo (vd `mkt_manager`) | Admin (qua `roles.manage`) — tạo/sửa tên/xoá (role tuỳ chỉnh, chưa gán ai) |
| `Permission` (bảng `permissions`) | 1 quyền **THẬT SỰ được code enforce**, dạng `resource.action` (vd `customers.assign`) | **KHÔNG ai sửa qua UI** — chỉ mở rộng khi dev thêm tính năng mới có kiểm tra quyền tương ứng, kèm migration seed. Cố ý chặn Admin tự đặt permission tuỳ ý — tránh tạo "quyền ảo" không ai enforce, Admin tưởng đã khoá nhưng thực ra không có tác dụng gì |
| `RolePermission` (bảng `role_permissions`) | Ma trận thật: "Role X có Permission Y, phạm vi Z (`own`/`department`/`all`)". KHÔNG có dòng = không có quyền | Admin (qua `roles.manage`), chỉnh qua Drawer ở trang `/phan-quyen` |

**⚠️ QUAN TRỌNG NHẤT — phạm vi áp dụng THỰC TẾ hiện tại (đừng hiểu nhầm):**

Cơ chế này **CHỈ ĐANG ENFORCE cho đúng module `roles`/`permissions` (trang "Phân quyền")**. Toàn bộ 9
module còn lại ở mục 2 (Khách hàng, Users, ZK Device, Link Groups, Media Sources, Nghỉ phép, Audit Logs,
Đăng ký, Phòng ban) **VẪN dùng `@Roles()` enum tĩnh y hệt trước đây**, chưa migrate sang đọc từ
`role_permissions`. Nghĩa là: hôm nay, nếu Admin vào trang Phân quyền và tắt quyền "Khách hàng" của
Manager, **KHÔNG có tác dụng gì** — module Customer chưa đọc bảng này. Chỉ 2 permission thật sự có tác
dụng ngay bây giờ: `roles.view` (xem trang Phân quyền) và `roles.manage` (sửa được ma trận). Các dòng
`role_permissions` khác đã được seed sẵn (đúng theo hành vi `@Roles()` hiện tại của từng module — xem
migration `AddCustomRbacSystem`) nhưng **chỉ mang tính "ghi lại đúng luật hiện có" để UI hiển thị nhất
quán**, chưa phải nguồn enforce thật.

→ **Hệ quả cho công việc tương lai:** migrate dần TỪNG module sang đọc `RolePermission` (thay `@Roles()`
tĩnh bằng `@RequirePermission()` + `PermissionGuard`) là việc CÒN THIẾU, không phải bug — xem mục 4.

**Cách hoạt động kỹ thuật (đúng nguyên tắc "API và UI đồng bộ" — mục 1, quy tắc kỹ thuật #1):**

- **BE**: `PermissionGuard` (`common/guards/permission.guard.ts`) đọc metadata từ decorator
  `@RequirePermission('resource.action')`, tra `role_permissions` theo `user.role` — 403 nếu không có
  dòng khớp. Đây là nơi chặn THẬT SỰ, y hệt nguyên tắc cũ với `@Roles()`, chỉ khác nguồn dữ liệu (DB thay
  vì hardcode).
- **FE**: `GET /roles/my-permissions` (mở cho MỌI user đã đăng nhập, không cần quyền gì — tự hỏi "quyền
  của chính tôi" không thể bị chính cơ chế phân quyền chặn, nếu không sẽ tự khoá luôn UI của chính mình)
  trả về `{ [permissionKey]: scope | null }`. Hook `useMyPermissions()` (`lib/hooks/useMyPermissions.ts`)
  là **hook DUY NHẤT** toàn app dùng để quyết định hiện/ẩn UI cho phần đã migrate — `can(key)` trả
  true/false, `scope(key)` trả phạm vi. `staleTime=60s` — Admin đổi ma trận quyền, UI người khác tự cập
  nhật trong tối đa 60s không cần F5 (riêng chính Admin vừa đổi thì cập nhật ngay, do
  `useUpdateRolePermissions` tự invalidate `my-permissions` sau khi lưu).
- **`nav-config.tsx`** hỗ trợ SONG SONG 2 cơ chế trên cùng 1 mảng `NAV_ITEMS`: field `roles: string[] |
  null` (tĩnh, dùng cho 9 module chưa migrate) và field `permission?: string` (động, hiện CHỈ mục "Phân
  quyền" dùng `permission: 'roles.view'`). Item nào có `permission` thì BỎ QUA `roles` — xem comment
  trong chính file đó để biết quy tắc chọn dùng field nào khi thêm mục nav mới.
- **Trang `/phan-quyen`** (`app/(dashboard)/phan-quyen/page.tsx`) tự áp dụng ĐÚNG cơ chế nó quản lý:
  chặn cả ở mức route (redirect + toast nếu thiếu `roles.view`, phòng trường hợp gõ thẳng URL bỏ qua
  sidebar) lẫn từng nút hành động (`roles.manage` quyết định hiện nút Tạo/Sửa/Xoá/Lưu ma trận, thiếu thì
  chỉ xem read-only).

**Endpoint đầy đủ (`roles.controller.ts`, tất cả qua `JwtAuthGuard` + `PermissionGuard`):**

| Endpoint | Quyền cần | Ghi chú |
|---|---|---|
| `GET /roles/my-permissions` | Không cần gì (chỉ cần đăng nhập) | Self-referential fix — không thể đòi `roles.view` để hỏi "tôi có quyền gì", vì FE cần gọi API này TRƯỚC KHI biết mình có `roles.view` hay không |
| `GET /roles` | `roles.view` | Danh sách Role kèm ma trận quyền đầy đủ |
| `GET /permissions` | `roles.view` | Danh mục permission hệ thống (để UI vẽ ma trận theo `resource`) |
| `POST /roles` | `roles.manage` | Tạo Role tuỳ chỉnh |
| `PATCH /roles/:id` | `roles.manage` | Sửa tên/mô tả (không đổi được `code`) |
| `DELETE /roles/:id` | `roles.manage` | Không xoá được role hệ thống hoặc role đang có người dùng |
| `PATCH /roles/:id/permissions` | `roles.manage` | Ghi đè TOÀN BỘ ma trận quyền của 1 Role |

**An toàn đã cài sẵn (đọc `roles.service.ts` để xác nhận):** không cho xoá 4 role hệ thống, không cho
xoá role đang có user gán, không cho đổi `code` sau khi tạo (tránh mồ côi `users.role` — cột này giờ là
`VARCHAR(50)` + FK tới `roles.code`, không còn ENUM cứng). **Chưa có** cơ chế chặn Admin tự khoá hết
quyền `roles.manage` của chính role mình đang mang (tự khoá cửa) — xem mục 4.

---

## 2. Đối chiếu theo từng module (trạng thái thực tế — đọc trực tiếp code tại thời điểm cập nhật)

> Chú thích: ✅ = đã khớp đúng rule ở mục 1 (hoặc, riêng mục 2.10, khớp đúng cơ chế riêng của chính nó -
> xem mục 1.7). ⚠️ = chưa rà soát/chưa khớp — cần 1 phiên riêng để sửa. 🟦 = có mô hình quyền riêng theo
> chủ đích (xem mục 1.6), không thuộc thang ✅/⚠️ thông thường.
>
> **9 module 2.1→2.9 dùng `@Roles()` tĩnh (enum `Role` cũ) — mục 2.10 (`roles`/`permissions`) là module
> DUY NHẤT dùng cơ chế Permission tuỳ chỉnh động (mục 1.7). 2 cơ chế này SONG SONG, module nào dùng cơ
> chế nào đã ghi rõ trong tiêu đề từng mục con — đừng nhầm lẫn khi đọc.**

### 2.1. Khách hàng / Chia Data (`modules/customers`) — ✅ ĐÃ KHỚP (6 sub-resource đã vá xong)

| Hành động | File chịu trách nhiệm |
|---|---|
| Filter Xem (View) | `CustomerAccessHelper.applyViewFilter()` — dùng chung cho `findAll`, `findOne`, `getAssigned`, `getUnassigned`, `getStats*` |
| Filter Sửa (Update) | Gián tiếp qua `findOne()` (dùng lại `applyViewFilter`) — không có bộ điều kiện riêng |
| Xoá | `CustomerAccessHelper.canDelete()` — `role === ADMIN`, không ngoại lệ. Controller `@Delete(':id')` khoá `@Roles(Role.ADMIN)` |
| Gán data (`bulkAssign`) | Có rule chặt hơn 1 chút cho Employee (chỉ gán được KH mình tạo & chưa ai nhận, hoặc đang là sales chính của mình) — xem chú thích trong `customer-access.helper.ts` |
| FE — nút Xoá | `chia-data/page.tsx`, `customers/page.tsx`: `canDelete = user?.role === 'admin'` |
| Spec test khoá hành vi | `customer-access.helper.spec.ts`, phần mở rộng trong `customers.service.spec.ts` |

**✅ ĐÃ VÁ (2026-08-28, đối chiếu trực tiếp từng dòng code, xác nhận sau khi merge) — cả 6 endpoint
sub-resource phát hiện thiếu filter ở lần rà soát trước đã được sửa:**

| Endpoint | File/hàm | Đã sửa thành |
|---|---|---|
| `POST /customers/:id/notes` | `createNote()` | Gọi `assertCustomerAccessible(customerId, userId, userRole)` trước khi ghi |
| `GET /customers/:id/deposits` | `getDeposits()` | Gọi `assertCustomerAccessible()` trước khi đọc |
| `POST /customers/:id/deposits` | `createDeposit()` | Gọi `assertCustomerAccessible()` — Manager không còn tạo được deposit ngoài phòng ban quản lý |
| `DELETE /customers/deposits/:id` | Controller | Đổi `@Roles(ADMIN, MANAGER)` → `@Roles(Role.ADMIN)` — đúng rule Xoá tuyệt đối ở mục 1 |
| `GET /customers/:id/assignment-history` | `getAssignmentHistory()` | Gọi `assertCustomerAccessible()` |
| `GET/PATCH /customers/:id/group-memberships*` | `customer-group-memberships.service.ts` | Thêm `assertCustomerAccessible()` riêng (dùng `customerRepo.createQueryBuilder()` + `CustomerAccessHelper.applyViewFilter()`) — có spec test riêng khoá hành vi (`customer-group-memberships.service.spec.ts`) |

Toàn bộ 6 điểm trên giờ đi qua đúng "1 nguồn áp filter duy nhất" (`assertCustomerAccessible`/
`applyViewFilter`), không còn endpoint nào bỏ sót.

### 2.2. Nhân viên (`modules/users`) — ✅ ĐÃ KHỚP

Đối chiếu trực tiếp `users.controller.ts` + `UsersAccessHelper` (`helpers/users-access.helper.ts`,
pattern giống hệt `CustomerAccessHelper`):

| Endpoint | Guard hiện tại |
|---|---|
| `GET /users/all` (dropdown rút gọn) | `ADMIN, MANAGER, ASSISTANT, EMPLOYEE` — ✅ đúng, không nhạy cảm |
| `GET /users` (danh sách đầy đủ) | `ADMIN, ASSISTANT, MANAGER` + `UsersAccessHelper.applyViewFilter()` (Manager chỉ thấy phòng ban mình quản lý + chính mình) |
| `GET /users/:id` | Như trên |
| `GET /users/me` | Không giới hạn role (tự xem bản thân) — ✅ đúng |
| `GET /users/pending-approvals` | `ADMIN, ASSISTANT, MANAGER` — Manager chỉ thấy user đăng ký vào phòng ban mình quản lý (`getManagedDepartmentIds`) |
| `POST /users` (tạo mới) | `ADMIN, ASSISTANT, MANAGER` — Manager chỉ tạo được trong phòng ban mình quản lý |
| `PATCH /users/:id` (sửa) | `ADMIN, ASSISTANT, MANAGER` + `UsersAccessHelper.canManageUser()` |
| `PATCH /users/:id/approve`, `.../reject` | `ADMIN, ASSISTANT, MANAGER` — Manager chỉ duyệt/từ chối đúng phòng ban mình quản lý (khớp rule §2.8) |
| `PATCH /users/:id/reset-password` | `ADMIN, ASSISTANT, MANAGER` + `canManageUser()` |
| `GET/PUT /users/:id/profile` | `ADMIN, ASSISTANT, MANAGER` + `canManageUser()`; role khác chỉ tự xem/sửa của chính mình |

Không có endpoint Xoá user (đúng thiết kế — chỉ có `isActive=false` qua `update()`). Spec test:
`users.service.spec.ts` (278 dòng, cover đủ approve/reject/create/update/resetPassword theo từng role).

### 2.3. Máy chấm công (`modules/zk-device`) — ✅ ĐÃ KHỚP

Đối chiếu trực tiếp `zk-device.controller.ts`: `@Roles(ADMIN, ASSISTANT, MANAGER)` áp ở mức class, Manager
bị giới hạn theo phòng ban ngay trong từng service method (`mapUser`, `unmapUser`, `getAttendanceLogs`,
`getAttendanceSummary` — lọc theo `matchedUser.departmentId IN (:...deptIds)`). Riêng
`DELETE /attendance-logs/cleanup` (xoá vĩnh viễn log) tách decorator riêng `@Roles(Role.ADMIN)` — đúng
rule Xoá tuyệt đối. `zk-device-cron.controller.ts` (nội bộ) và `adms.controller.ts` (`/iclock/*`, máy
chấm công gọi thẳng, không qua JWT) không thuộc phạm vi rule RBAC người dùng.

### 2.4. Nhóm liên kết (`modules/link-groups`) — ✅ ĐÃ KHỚP (CRUD chung) / 🟦 Quản lý chính-phụ (mô hình riêng, không đổi)

- `link-categories.controller.ts`, `link-groups.controller.ts` (CRUD Category/Group nói chung — tạo,
  sửa, khoá/mở): **✅ đối chiếu trực tiếp từng dòng decorator, xác nhận đúng 100%** — toàn bộ mutation
  (`create`, `update`, `lock`/`unlock`, `activate`/`deactivate`) đã là `@Roles(ADMIN, ASSISTANT)`; riêng
  `Delete` đã tách decorator độc lập `@Roles(ADMIN)`, không gộp chung với các hành động sửa khác — đúng
  rule Xoá ở mục 1.
  **Quyết định đã chốt (chủ dự án, 2026-08-28):** Manager **KHÔNG** có quyền ghi ở module này (không
  giống Customer/ZK Device — Manager không bị giới hạn theo phòng ban ở đây, mà bị loại hẳn khỏi quyền
  ghi). Lý do: module này chưa có khái niệm phòng ban gắn với Category/Group (câu hỏi thiết kế treo từ
  trước) — thay vì chờ thiết kế xong mới xử lý, chủ dự án chốt luôn hướng an toàn: chỉ Admin/Assistant
  được CRUD, Manager chỉ có quyền Xem (giống Employee, qua `GET /link-groups` mở cho mọi user đã đăng
  nhập — xem gạch đầu dòng tiếp theo). Nếu sau này có nhu cầu phân quyền Category/Group theo phòng ban,
  cần 1 quyết định thiết kế riêng, không suy ra ngầm từ rule mục 1.
- `GET /link-groups` (danh sách group cho checklist "tham gia nhóm" khi tạo/sửa khách hàng): **cố ý mở
  cho MỌI user đã đăng nhập**, không áp rule mục 1 — đây là dữ liệu tham chiếu (danh mục), không phải
  dữ liệu cần phân quyền xem. Không đổi.
- `customer-group-memberships.controller.ts` (checklist khách hàng đã-join nhóm nào): ✅ đã áp
  `CustomerAccessHelper.applyViewFilter()` qua `assertCustomerAccessible()` (xem mục 2.1) — đúng hướng
  self-view/phòng ban theo đúng phạm vi Customer liên quan. Spec test đã cập nhật khớp implementation
  thật (`customer-group-memberships.service.spec.ts` — trước đó mock sai `findOne`, nay dùng đúng
  `createQueryBuilder`).
- **`link-group-managers.controller.ts` + `link-group-managers.service.ts` (MỚI — "Quản lý chính/phụ"
  theo từng Group cụ thể) — 🟦 mô hình quyền riêng theo chủ đích, xem mục 1.6:**
  - `GET /link-groups/managed-by-me`: Admin thấy TẤT CẢ group; user thường CHỈ thấy group mình là quản
    lý chính hoặc phụ.
  - `GET /link-groups/:id/managers`: chỉ Admin/quản lý chính/quản lý phụ của group đó mới xem được.
  - `POST /link-groups/:id/managers`, `DELETE /link-groups/:id/managers/:userId` (thêm/xoá quản lý phụ):
    chỉ Admin hoặc **chính quản lý chính** của group đó — quản lý phụ KHÔNG được thêm/xoá quản lý phụ
    khác.
  - Logic thuần tách riêng ở `helpers/link-group-access.helper.ts` (`canManage`, `canEditSecondaryManagers`),
    có spec test riêng (`link-group-access.helper.spec.ts`, `link-group-managers.service.spec.ts`).
  - **Lưu ý:** đây KHÔNG phải "Xoá" theo nghĩa mục 1 (xoá bản ghi dữ liệu) — chỉ là gỡ 1 quan hệ phân
    công quản lý, tương đương "bỏ gán sales" ở Customer, nên quản lý chính (dù không phải Admin) vẫn
    được phép gỡ quản lý phụ mà không vi phạm rule "Employee không bao giờ được xoá".

### 2.5. Nguồn Media (`modules/media-sources`) — ✅ ĐÃ KHỚP

**Đối chiếu trực tiếp từng dòng decorator, xác nhận đúng 100%** — `media-sources.controller.ts`: toàn bộ
mutation (`create`, `update`, `lock`, `unlock`) đã là `@Roles(ADMIN, ASSISTANT)`; `remove` (Xoá) đã tách
riêng `@Roles(ADMIN)`. `GET /media-sources` (danh sách để chọn "Nguồn" khi tạo khách hàng) cố ý mở cho
mọi user — không đổi.

**Quyết định đã chốt (chủ dự án, 2026-08-28):** giống hệt §2.4 — Manager **KHÔNG** có quyền ghi ở module
này, chỉ Admin/Assistant CRUD (Assistant không Xoá). Cùng lý do: module chưa có khái niệm phòng ban gắn
với Media Source, chủ dự án chốt hướng an toàn thay vì để treo.

### 2.6. Nghỉ phép (`modules/leave-requests`) — ✅ ĐÃ KHỚP

**Đối chiếu trực tiếp `leave-requests.service.ts` (2026-08-28) — xác nhận cơ chế `RolePriority` chéo
phòng ban cũ đã bị THAY THẾ HOÀN TOÀN** bằng 2 bảng tra cứu cố định đúng rule đã chốt, không còn tồn tại
bất kỳ tham chiếu `RolePriority` nào ngoài comment giải thích lịch sử:

```ts
const ELIGIBLE_APPROVER_ROLES: Record<string, string[]> = {
  [Role.ADMIN]: [Role.ADMIN],
  [Role.ASSISTANT]: [Role.ADMIN],
  [Role.MANAGER]: [Role.ASSISTANT, Role.ADMIN],
  [Role.EMPLOYEE]: [Role.MANAGER, Role.ASSISTANT, Role.ADMIN],
};
```

| Người xin nghỉ có role | Ai được duyệt đơn này |
|---|---|
| `admin` | Chỉ `admin` |
| `assistant` | Chỉ `admin` |
| `manager` | `assistant` hoặc `admin` |
| `employee` | `manager` **CÙNG phòng ban với employee đó** (`department.manager_user_id = approverId`), hoặc `assistant`, hoặc `admin` |

- `approve()`/`reject()` đều gọi chung 1 hàm `isEligibleApprover()` — đúng nguyên tắc kỹ thuật #2 (1
  nguồn áp filter duy nhất). Khi `approverRole === MANAGER`, kiểm tra thêm
  `department.findOne({ id: requesterDepartmentId, managerUserId: approverId })` — nếu không khớp,
  ném `ForbiddenException` ngay (không có ngoại lệ "priority cao hơn thì vẫn duyệt được" như cơ chế cũ).
- `findPending()`/`findHistory()` dùng bảng ngược `VIEWER_SEES_REQUESTER_ROLES` (suy trực tiếp từ bảng
  trên) + áp thêm `departmentId IN (:...managedIds)` khi viewer là Manager — đối xứng đúng với
  `approve()`/`reject()`, tránh trường hợp thấy được trong danh sách nhưng bấm duyệt lại bị chặn (hoặc
  ngược lại).
- Manager chưa quản lý phòng ban nào (`managedIds.length === 0`) → trả về `[]` ngay, không query thêm.

**Spec test mới (2026-08-28, trước đó module này hoàn toàn chưa có file spec nào):**
`leave-requests.service.spec.ts` — 19 test, cover đủ toàn bộ ma trận role-cặp (bao gồm case dễ hiểu nhầm
nhất: `assistant` KHÔNG tự duyệt được cho `assistant` khác dù cùng "priority" theo cách hiểu cũ; `manager`
khác phòng ban bị chặn dù đúng role).

### 2.7. Audit Logs (`modules/audit`) — ✅ ĐÃ KHỚP

**Đối chiếu trực tiếp `audit.controller.ts` (2026-08-28) — xác nhận cả 6/6 endpoint đã đồng nhất
`@Roles(Role.ADMIN, Role.ASSISTANT)`** (`GET /`, `GET /actions`, `GET /settings`, `POST /settings`,
`DELETE /cleanup`, `DELETE /bulk`) — không còn endpoint nào dùng `MANAGER` như trước. `manager` và
`employee` bị chặn hoàn toàn (403), không có ngoại lệ theo phòng ban — đúng rule đã chốt: audit log là dữ
liệu nhạy cảm mức hệ thống, không phải dữ liệu nghiệp vụ theo phòng ban. Có comment trong code tham chiếu
thẳng tới mục này của tài liệu, giải thích rõ đây là ngoại lệ có chủ đích cho việc `DELETE` (cleanup vận
hành hệ thống, khác với rule Xoá=chỉ-Admin áp cho dữ liệu nghiệp vụ ở mục 1).

### 2.8. Xác thực & Đăng ký tài khoản (`modules/auth`) — ✅ ĐÃ KHỚP

Employee/nhân viên mới có thể tự đăng ký (`POST /auth/register`, không cần token — luôn tạo
`role=EMPLOYEE`, `approvalStatus=PENDING` bất kể input, xem `UsersService.createPendingRegistration()`),
tài khoản ở trạng thái chờ duyệt cho tới khi được xử lý qua `PATCH /users/:id/approve`/`.../reject`.

**Rule ĐÚNG đã chốt — xác nhận code khớp 100% (đối chiếu trực tiếp `users.service.ts`,
2026-08-28):** `manager` **CŨNG được duyệt đăng ký mới**, nhưng **CHỈ khi phòng ban người đăng ký chọn
TRÙNG với phòng ban mà chính manager đó đang quản lý** (`department.manager_user_id = manager đang
duyệt`). `admin`/`assistant` vẫn duyệt được mọi phòng ban, không đổi.

- `PATCH /users/:id/approve`, `.../reject`, `GET /users/pending-approvals`: cả 3 đều
  `@Roles(ADMIN, ASSISTANT, MANAGER)` — đúng như yêu cầu.
- `approveUser()`/`rejectUser()`: khi `approverRole === MANAGER`, kiểm tra
  `user.departmentId` (phòng ban người đăng ký ĐÃ chọn lúc tự đăng ký) có nằm trong
  `getManagedDepartmentIds(approverId)` không — nếu không khớp, ném `ForbiddenException` ngay (chặn cứng
  trên 1 bản ghi cụ thể, khác `findPendingApprovals` chỉ ẩn khỏi danh sách). Nếu Manager đổi
  `departmentId` ngay lúc duyệt (`overrides.departmentId`), phòng ban MỚI đó cũng phải nằm trong phạm vi
  Manager quản lý — không cho "lách" chuyển sang phòng ban khác không phải của mình.
- `findPendingApprovals()`: Manager chỉ thấy user đăng ký vào đúng phòng ban mình quản lý; nếu chưa quản
  lý phòng ban nào thì trả `[]` ngay.
- Toàn bộ logic dùng chung `UsersAccessHelper.getManagedDepartmentIds()` — không viết lại điều kiện riêng
  (đúng nguyên tắc kỹ thuật #2/#4 ở mục 1).

**Spec test:** đã bổ sung 9 test case mới vào `users.service.spec.ts` (trước đó hoàn toàn chưa che phủ
nhánh Manager dù code đã đúng) — cover đủ: duyệt đúng phòng ban, sai phòng ban, override sang phòng ban
không quản lý, user chưa có `departmentId`, và cùng bộ case cho `rejectUser`/`findPendingApprovals`.

*(Mục này mô tả chi tiết rule "duyệt đăng ký" theo góc nhìn nghiệp vụ auth/registration; xem mục 2.2 để
có bức tranh đầy đủ toàn bộ module Users bao gồm cả các hành động quản trị khác.)*

### 2.9. Phòng ban (`modules/departments`) — ✅ ĐÃ KHỚP (blocker đã được giải quyết)

**Đối chiếu trực tiếp `departments.controller.ts`, `departments.service.ts`, 2 DTO (2026-08-28):**

| Endpoint | Guard hiện tại | Đúng theo rule mục 1 |
|---|---|---|
| `GET /departments/public` | Không cần đăng nhập (chỉ trả `id`, `name`) — dùng cho dropdown ở trang tự đăng ký | ✅ Đúng, cố ý mở công khai |
| `GET /departments` | Mọi role đã đăng nhập (không có `@Roles`) | ✅ Đúng — danh mục tham chiếu, không phải dữ liệu cần phân quyền xem |
| `GET /departments/:id` | Mọi role đã đăng nhập | ✅ Đúng, cùng lý do trên |
| `POST /departments` (tạo mới) | `@Roles(ADMIN, ASSISTANT)` | ✅ Đúng |
| `PATCH /departments/:id` (sửa, gồm gán Manager) | `@Roles(ADMIN, ASSISTANT)` | ✅ Đúng |
| Xoá phòng ban | Không tồn tại endpoint xoá | ✅ Không cần giới hạn gì thêm |

**🎉 Blocker trước đây ĐÃ ĐƯỢC GIẢI QUYẾT** — `UpdateDepartmentDto` giờ có field `managerUserId?: number
| null`, và `DepartmentsService.update()` validate chặt trước khi gán:

1. `managerUserId = null` → gỡ Manager, không cần validate thêm.
2. `managerUserId` là số → bắt buộc user đó phải **tồn tại**, có `role === MANAGER`, và đang
   `isActive === true` — nếu sai bất kỳ điều kiện nào, ném lỗi rõ ràng (`NotFoundException`/
   `BadRequestException`), không cho gán nhầm.
3. Field này được `destructure` riêng trước khi `merge()` phần còn lại của DTO — tránh TypeORM merge đè
   nhầm giá trị đã validate.

Nhờ đó, cột `department.manager_user_id` (nguồn chân lý duy nhất cho phạm vi Manager, dùng bởi
`CustomerAccessHelper`, `UsersAccessHelper`, `leave-requests.service.ts`, `zk-device.service.ts`) giờ **có
thể set qua API chính thức** (`PATCH /departments/:id`), không còn phải sửa tay qua DB nữa — rule "Manager
theo phòng ban" ở TẤT CẢ module khác giờ vận hành được đầy đủ trong thực tế.

**Spec test mới:** `departments.service.spec.ts` (11 test) — cover đủ: gỡ Manager, gán hợp lệ, user không
tồn tại, sai role, bị khoá tài khoản, và không đụng `managerUserId` nếu DTO không truyền field này.

**Còn thiếu (không phải bug, chỉ là chưa làm — thuộc phạm vi FE, chủ dự án nói tính sau):** Frontend hiện
chưa có UI chọn Manager cho phòng ban (trang quản lý Department nói chung còn chưa có, chỉ dùng
`GET /departments/public` ở trang đăng ký) — Admin/Assistant hiện phải gọi thẳng API `PATCH
/departments/:id` (qua Swagger hoặc công cụ khác) để gán Manager cho tới khi có UI.

### 2.10. Phân quyền tuỳ chỉnh (`modules/roles`, `modules/permissions`) — ✅ ĐÃ KHỚP (module TỰ enforce chính nó)

Xem mục 1.7 để hiểu đầy đủ kiến trúc. Đối chiếu nhanh trạng thái tuân thủ của chính module này:

| Hành động | File chịu trách nhiệm |
|---|---|
| Guard | `PermissionGuard` + `@RequirePermission()` — KHÔNG dùng `@Roles()` tĩnh (module duy nhất trong 10 module hiện có làm vậy — hợp lý, vì đây chính là module ĐỊNH NGHĨA hệ thống quyền) |
| FE — ẩn/hiện mục nav "Phân quyền" | `nav-config.tsx` (`permission: 'roles.view'`) + `getVisibleNavItems()` trong `layout.tsx`/`page.tsx` (trang chủ) |
| FE — chặn vào thẳng URL | `phan-quyen/page.tsx` — `useEffect` redirect + `message.warning` nếu thiếu `roles.view`, cùng pattern `audit-logs/page.tsx` nhưng dùng permission động thay vì role tĩnh |
| FE — ẩn nút Tạo/Sửa/Xoá/Lưu ma trận | `canManage = can('roles.manage')` — thiếu thì Drawer chuyển read-only (`Segmented`/`Checkbox` disabled), có `Alert` báo rõ "Chỉ xem" |
| Xoá | Không áp rule "chỉ Admin" tuyệt đối như mục 1 — thay vào đó chặn theo nghiệp vụ riêng: không xoá được role hệ thống, không xoá được role đang có user gán (xem `roles.service.ts`). Đây là **ngoại lệ có chủ đích** (mục 1.6) vì bản chất "xoá 1 Role" khác hẳn "xoá 1 bản ghi dữ liệu nghiệp vụ" |
| Spec test | `roles.service.spec.ts`, `permissions.service.spec.ts` |

---

## 3. Lịch sử quyết định & rà soát

| Ngày | Nội dung | Chi tiết |
|---|---|---|
| 2026-04-16 | "Freedom Mode" — bỏ ràng buộc phòng ban, phân quyền theo Owner/Assignee | **ĐÃ BỊ THAY THẾ** bởi rule mục 1 (Manager quay lại bị giới hạn theo phòng ban quản lý) |
| 2026-04-17 | Users module bị siết về `ADMIN`-only hoàn toàn (bug trước đó lộ cho Manager/Employee) | Đúng hướng về bảo mật, nhưng chưa mở lại cho Assistant/Manager theo rule mới → xem mục 2.2 |
| 2026-04-24 | Phát hiện `getAssigned()` (API `/customers/assigned`) hoàn toàn thiếu filter phân quyền — Employee thấy được data của toàn bộ user khác | Đã fix + viết spec khoá hành vi — xem mục 2.1 |
| 2026-04-24 | Ban hành rule tổng chính thức, rà soát riêng module Customer/Chia Data khớp 100% | Xem mục 2.1 |
| 2026-08-28 | Rà soát lại toàn bộ repo sau khi có thêm nhiều module mới (đăng ký/duyệt tài khoản, Media Sources, Quản lý chính/phụ Link Group) — đối chiếu TRỰC TIẾP với code hiện tại (không suy đoán) | Cập nhật mục 2.1 → 2.8, phát hiện thêm 2 module mới chưa khớp (Media Sources §2.5, Audit Logs §2.7 cần xác nhận lại), xác nhận tính năng "Quản lý chính/phụ" Link Group (§2.4) đã đúng mô hình quyền riêng theo chủ đích |
| 2026-08-28 | Chốt rule cụ thể cho 3 mục còn treo: duyệt nghỉ phép (§2.6 — thay hẳn cơ chế `RolePriority` chéo phòng ban bằng bảng role-cặp cụ thể, Manager bắt buộc cùng phòng ban với Employee), Audit Logs (§2.7 — chỉ Admin+Assistant, Manager/Employee 403 tuyệt đối, không có ngoại lệ theo phòng ban), duyệt đăng ký tài khoản (§2.8 — thêm nhánh Manager nhưng bắt buộc trùng phòng ban quản lý) | Cả 3 mục chuyển từ "cần hỏi lại chủ dự án" sang "đã chốt rule, chưa sửa code" — ưu tiên implement ở phiên tiếp theo, xem mục 4 |
| 2026-08-28 (tiếp) | Rà soát module còn thiếu (`departments/`) sau khi pull thêm nhiều commit mới (đăng ký tài khoản, duyệt approval, `GroupPickerModal`, `SimpleList`...) — thêm mục 2.9. Phát hiện **blocker quan trọng**: `department.manager_user_id` (nguồn xác định phạm vi Manager, đang được `CustomerAccessHelper` dùng thật) hiện KHÔNG có endpoint nào để set/đổi qua API — chỉ sửa được thủ công qua DB. Xác nhận đối chiếu trực tiếp từng dòng code cho toàn bộ 9 module hiện có trong repo (không còn module nào chưa đối chiếu) | Xem mục 2.9. Chỉ cập nhật tài liệu (README gốc, `backend/README.md`, `frontend/README.md`, `PERMISSIONS.md`) — KHÔNG sửa source trong phiên này theo yêu cầu chủ dự án. Nhân tiện phát hiện và sửa version stack ghi sai trong docs (Next.js 14→16, NestJS 10+→11+, Ant Design 5→6) |
| 2026-08-28 (rà soát endpoint chi tiết) | Theo yêu cầu chủ dự án "rà soát các file theo thống kê từ PERMISSIONS.md, báo cáo endpoint chưa tuân thủ rule" — dump toàn bộ decorator `@Roles`/`@Controller`/`@Get`/`@Post`/`@Patch`/`@Delete` của cả 14 controller hiện có, đối chiếu từng dòng. Phát hiện module Customer (§2.1) — dù đã đánh dấu ✅ ĐÃ KHỚP từ trước — thực ra có **6 endpoint sub-resource hoàn toàn không áp filter phạm vi** (`POST/GET :id/notes`, `deposits`, `assignment-history`, `group-memberships`), trong đó `DELETE /customers/deposits/:id` vi phạm trực tiếp rule Xoá (cho phép Manager xoá). Đây là phát hiện MỚI, chưa từng được ghi nhận ở các lần rà soát trước — đổi trạng thái §2.1 từ ✅ sang ⚠️ khớp một phần | Xem mục 2.1 (bảng chi tiết + mức độ nghiêm trọng từng endpoint) và mục 4 (đã thêm mục 0b ưu tiên sửa). Chỉ cập nhật `PERMISSIONS.md` — KHÔNG sửa source theo đúng yêu cầu |
| 2026-08-28 (chốt §2.4/§2.5) | Sau khi pull + merge code mới nhất (~13 conflict, chủ yếu do build song song Media Sources/Link Groups), đối chiếu TRỰC TIẾP từng dòng decorator của `link-groups.controller.ts`, `link-categories.controller.ts`, `media-sources.controller.ts` — xác nhận cả 3 đã đúng 100% rule (CRUD = `ADMIN, ASSISTANT`; Xoá tách riêng `ADMIN`), không cần sửa code. Chủ dự án chốt luôn câu hỏi thiết kế còn treo ở §2.4/§2.5 (Manager theo phòng ban): **Manager không có quyền ghi ở 3 module này**, chỉ Admin/Assistant CRUD. Đồng thời phát hiện thêm 1 file spec lệch khỏi implementation thật (`customer-group-memberships.service.spec.ts` — mock `customerRepo.findOne`, thật ra code dùng `createQueryBuilder()` qua `CustomerAccessHelper.applyViewFilter()`; và `customers.service.spec.ts` thiếu `find` trong mock khai báo ban đầu, gây lỗi kiểu ở TypeScript dù chạy runtime vẫn qua) — đã sửa cả 2, chạy lại **toàn bộ suite: 11/11 test suite, 165/165 test PASS** | Xem mục 2.4, 2.5, mục 4 (mục 5 đánh dấu ✅ xong) |
| 2026-08-28 (rà soát toàn diện lần 2 — chốt phiên) | Đối chiếu TRỰC TIẾP từng dòng code (không tin trạng thái ghi sẵn trong tài liệu) cho TOÀN BỘ 9 module. Phát hiện §2.6 (Nghỉ phép), §2.7 (Audit Logs), §2.8 (Duyệt đăng ký), §2.9 (Phòng ban) đã được sửa đúng rule trong code từ phiên trước nhưng tài liệu vẫn ghi nhầm ⚠️ CHƯA KHỚP — xác nhận và chuyển cả 4 mục sang ✅. Viết bổ sung 3 file spec khoá lại các rule vừa xác nhận (trước đó code đúng nhưng chưa từng có test che phủ nhánh Manager): `users.service.spec.ts` (+9 test nhánh Manager cho approve/reject/pending-approvals), `departments.service.spec.ts` (mới, 11 test validate `managerUserId`), `leave-requests.service.spec.ts` (mới, 19 test toàn bộ ma trận role-cặp). Chạy toàn bộ suite: **13/13 test suite, 203/203 test PASS** (tăng từ 165), `tsc --noEmit` sạch, `nest build` sạch. **Kết luận: 9/9 module giờ khớp 100% với rule ở mục 1 — không còn module nào ⚠️ hoặc blocker treo ở tầng Backend.** Dọn lại mục 4 "Việc cần làm tiếp theo": toàn bộ 7 mục cũ đã hoàn tất, chỉ còn 2 việc dạng nice-to-have (không phải bug/thiếu rule) | Xem mục 2.6→2.9 (nội dung đã sửa trong phiên trước, phiên này chỉ xác nhận + bổ sung test + chốt tài liệu), mục 4 (viết lại gọn) |

---

## 4. Việc cần làm tiếp theo

**✅ Toàn bộ rule Backend ở mục 1 đã được áp dụng đầy đủ cho 9/9 module (§2.1 → §2.9) — không còn mục nào
⚠️ hoặc blocker treo.** Danh sách 7 việc từng liệt kê ở các phiên trước (users.controller/service theo
`UsersAccessHelper`, `leave-requests.service.ts` theo bảng role-cặp, `audit.controller.ts` đồng nhất
`ADMIN, ASSISTANT`, `zk-device.controller.ts`, `link-groups`/`link-categories`/`media-sources`,
`departments.controller.ts`, cập nhật lại mục 2) **đều đã hoàn tất** — xem changelog ở mục 3 để tra lại
từng mục đã sửa ở phiên nào.

Chỉ còn 2 việc dạng **nice-to-have** (không phải bug, không phải rule còn thiếu):

1. **Spec test cho `zk-device.service.ts`** — code đã đúng rule (Manager lọc theo phòng ban qua
   `matchedUser.departmentId IN (:...deptIds)`, xem §2.3) nhưng module này hiện chưa có file spec nào cả
   (không phải riêng phần phân quyền — toàn bộ service chưa được test). Ưu tiên thấp hơn 3 file spec vừa
   thêm vì đây là module duy nhất còn thiếu test tổng thể, không riêng nhánh Manager.
2. **UI chọn Manager cho phòng ban ở Frontend** (xem §2.9) — hiện chưa có trang quản lý Department nói
   chung, Admin/Assistant phải gọi thẳng `PATCH /departments/:id` (qua Swagger) để gán `managerUserId`.
   Chủ dự án đã xác nhận **để tính sau**, không phải blocker cho rule Backend (API đã hoạt động đầy đủ).