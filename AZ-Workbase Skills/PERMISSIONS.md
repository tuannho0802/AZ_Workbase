# 🔐 PERMISSIONS.md — Quy tắc phân quyền chuẩn (RBAC) toàn hệ thống AZ-Workbase

> **Đây là NGUỒN CHÂN LÝ DUY NHẤT (single source of truth) cho mọi quyết định phân quyền trong dự án.**
> Bất kỳ module/endpoint/trang UI nào xử lý quyền theo role phải tuân theo đúng bảng dưới đây.
> Nếu code hiện tại (BE hoặc FE) khác với tài liệu này → **tài liệu này đúng, code là bug cần sửa**,
> trừ khi tài liệu chưa được cập nhật theo quyết định nghiệp vụ mới nhất (luôn hỏi lại nếu nghi ngờ).
>
> **Cập nhật lần cuối:** 2026-09-08 (sửa bug 403 thật: 2 route sub-resource của Customer -
> `group-memberships` PATCH và `deposits` POST - còn sót permission key cũ `customers.manage` sau cú tách
> `customers.create`/`customers.edit`; cập nhật lại bảng permission catalogue mục 1.7 cho khớp. Trước đó,
> 2026-09-04: migrate TOÀN BỘ 9+1 module sang `PermissionGuard`/`@RequirePermission()` — không còn module
> nào dùng `@Roles()` tĩnh. Đọc mục 1.7 + 3 (dòng 2026-09-08) + 4 để biết chi tiết.)
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

**✅ PHẠM VI ÁP DỤNG THỰC TẾ (2026-09-04 — ĐÃ MIGRATE HOÀN TOÀN):**

Cơ chế Dynamic RBAC **ĐÃ ENFORCE cho TOÀN BỘ 10 module** (2026-09-04). Không còn module nào
dùng `@Roles()` enum tĩnh. Danh mục permission đầy đủ trong DB (sau 2 migration):

| Permission key | Resource | Mô tả ngắn |
|---|---|---|
| `customers.view` | customers | Xem KH (scope: own/department/all) |
| `customers.assign` | customers | Chia data KH |
| `customers.note` | customers | Ghi chú KH |
| `customers.create` | customers | Tạo mới KH (tách từ `customers.manage` cũ - xem cảnh báo dưới bảng) |
| `customers.edit` | customers | Sửa thông tin KH — **đồng thời gate luôn 1 sub-resource**: `POST /customers/:id/deposits` (nạp tiền). ⚠️ KHÔNG còn gate `PATCH .../group-memberships/:groupId` nữa kể từ 2026-09-08 — xem `customer_group_memberships.set` bên dưới |
| `customer_group_memberships.set` | customer_group_memberships | **MỚI (2026-09-08).** Bật/tắt trạng thái "đã tham gia nhóm" của 1 khách hàng (`PATCH /customers/:id/group-memberships/:groupId`) — permission RIÊNG, tách khỏi `customers.edit` để Admin cấu hình độc lập qua `/phan-quyen` và cho phép use case tick nhóm ngay lúc tạo mới KH không phụ thuộc `customers.edit`. Mặc định seed: Admin/Assistant `all`, Manager `department`, Employee `own`. `GET .../group-memberships` (xem checklist) vẫn dùng `customers.view`, không đổi |
| `customers.manage` | customers | ⚠️ **LEGACY - KHÔNG dùng cho route mới.** Còn sót lại trong DB chỉ vì lịch sử (trước khi tách thành `create`/`edit`), hiện KHÔNG route nào của module `customers` còn dùng key này. Không seed mặc định cho Employee — nếu vô tình bật lại permission này ở `/phan-quyen` cũng không có tác dụng gì thêm ngoài các quyền admin/assistant/manager gốc đã có sẵn |
| `customers.import` | customers | Import từ Excel |
| `customers.delete` | customers | Xoá KH — chỉ Admin |
| `customers.invalid_report` | customers | Report data lỗi |
| `customers.trash_manage` | customers | Thùng rác KH |
| `leave_requests.request` | leave_requests | Tạo/xem đơn của mình |
| `leave_requests.view` | leave_requests | Xem đơn của người khác |
| `leave_requests.approve` | leave_requests | Duyệt/từ chối đơn |
| `leave_requests.delete` | leave_requests | Xoá đơn — chỉ Admin |
| `attendance.view` | attendance | Xem bảng chấm công |
| `attendance.manage` | attendance | Đồng bộ/map chấm công |
| `attendance.delete` | attendance | Xoá log — chỉ Admin |
| `reports.view` | reports | Xem báo cáo doanh số |
| `users.view` | users | Xem danh sách nhân viên |
| `users.manage` | users | Tạo/sửa/duyệt nhân viên |
| `users.delete` | users | Khoá/xoá nhân viên — chỉ Admin |
| `departments.view` | departments | Xem phòng ban |
| `departments.manage` | departments | Tạo/sửa phòng ban |
| `departments.delete` | departments | Xoá phòng ban — chỉ Admin |
| `link_groups.view` | link_groups | Xem nhóm liên kết |
| `link_groups.manage` | link_groups | Tạo/sửa nhóm |
| `link_groups.delete` | link_groups | Xoá nhóm — chỉ Admin |
| `media_sources.view` | media_sources | Xem nguồn media |
| `media_sources.manage` | media_sources | Tạo/sửa nguồn media |
| `media_sources.delete` | media_sources | Xoá nguồn — chỉ Admin |
| `audit.view` | audit | Xem nhật ký hệ thống |
| `audit.manage` | audit | Cấu hình/dọn dẹp audit log |
| `roles.view` | roles | Xem trang Phân quyền |
| `roles.manage` | roles | Chỉnh ma trận quyền — chỉ Admin |
| `positions.manage` | positions | **MỚI (2026-09-10).** Tạo/sửa Vị trí (POST/PATCH /positions) — bảng cấu hình toàn cục, không có scope (mọi user thấy chung 1 danh mục, không theo phòng ban). Seed mặc định: Admin/Assistant = `all` (thực chất là quyền nhị phân vì `supportsScope=false`, giá trị scope luôn NULL). **KHÔNG còn bao gồm xoá** (xem `positions.delete`). Xem mục 1.8 để biết Position dùng để làm gì |
| `positions.view` | positions | **MỚI (2026-09-10, fix bug audit).** Xem danh mục Vị trí (GET /positions, GET /positions/:id) — tách riêng khỏi `positions.manage` giống cặp `departments.view`/`departments.manage`. Seed mặc định: CẢ 4 role (admin/assistant/manager/employee) = quyền nhị phân, vì đây chỉ là danh mục tham chiếu dùng cho dropdown khi tạo/sửa/đăng ký tài khoản, không phải hành động nhạy cảm. `GET /positions/public` (không cần đăng nhập, chỉ id/name) dùng riêng cho form `POST /auth/register` |
| `positions.delete` | positions | **MỚI (2026-09-10, fix bug audit lần 2).** Xoá Vị trí (DELETE /positions/:id) — tách riêng khỏi `positions.manage`, mirror đúng cặp `departments.manage`/`departments.delete`. Seed mặc định: CHỈ `admin` (giống `departments.delete`), KHÔNG gán cho Assistant dù Assistant có `positions.manage` |

Nghĩa là: Admin vào trang Phân quyền **BẬT/TẮT bất kỳ permission nào ở bảng trên** → BE **thật sự
chặn/mở** ngay (không cần deploy), FE **tự ẩn/hiện** trong tối đa 60 giây.

→ **Việc cần làm tiếp:** Không còn backlog migration — tất cả đã xong.

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

### 1.8. Position (Vị trí) — tầng override THỨ 3, ưu tiên CAO NHẤT (thêm 2026-09-10, ĐANG TRIỂN KHAI)

> Kế hoạch đầy đủ:
> `AZ-Workbase Skills/PLAN_POSITION_FIELD_VISIBILITY_ASSIGNMENT_GROUPS.md`. Trạng thái tại thời điểm
> cập nhật mục này: **Phase 1 + Phase 2 (Position nền tảng + Override Action Permission theo Position)
> đã code + build + test xong** (xem WORKFLOW_LOG.md ngày 2026-09-10). **Phase 3 (UI Visibility Rules)
> và Phase 4 (Assignment Group Config) CHƯA làm** — đừng nhầm là đã xong toàn bộ plan.

**Khái niệm:** `Position` (bảng `positions`) là 1 lớp phân quyền chi tiết hơn Role, đặt DƯỚI Role (vd
Role `employee` + Position `content`/`editor`/`media`, hoặc Role `admin` + Position `hr`/`it`/`director`/
`ceo`). 1 User có 1 Role (bắt buộc) + tối đa 1 Position (`users.position_id`, **luôn nullable, KHÔNG bắt
buộc**). `positions.department_id` **chỉ mang tính gợi ý hiển thị**, KHÔNG ràng buộc user phải thuộc
đúng phòng ban đó mới chọn được Position tương ứng.

**Thứ tự ưu tiên override — TUYẾN TÍNH 3 TẦNG (không phải ma trận tổ hợp Phòng ban × Vị trí):**

```
Override theo Vị trí (position_id ≠ NULL, department_id = NULL)
        ▼ (nếu không có dòng)
Override theo Phòng ban (department_id ≠ NULL, position_id = NULL)
        ▼ (nếu không có dòng)
Toàn cục / Global (cả hai đều NULL)
```

1 dòng `role_permissions` chỉ được set `department_id` HOẶC `position_id`, không cả hai. Dòng override
Position **không lọc theo `departmentId` của user** — áp dụng bất kể user đang thuộc phòng ban nào (đây
là điểm dễ nhầm nhất khi đọc code `PermissionsService.loadRolePermissionMap()`).

**Endpoint mới (`roles.controller.ts`, quyền `roles.manage`, mirror y hệt `department-overrides` đã có
ở mục 1.7):**

| Endpoint | Ghi chú |
|---|---|
| `GET /roles/:id/position-overrides` | Danh sách override theo Vị trí của Role này |
| `PUT /roles/:id/position-overrides/:positionId` | Ghi đè toàn bộ quyền của Role cho 1 Vị trí cụ thể |
| `DELETE /roles/:id/position-overrides/:positionId` | Xoá override |

`GET /roles/my-permissions` giờ tính CẢ override Position của chính user gọi (BE tự đọc
`user.positionId` từ JWT/DB, FE không cần truyền gì thêm).

**Module CRUD Position mới:** `positions/` (`GET/POST/PATCH/DELETE /positions`, quyền
`positions.manage`) — chặn xoá nếu Position đang có User gán hoặc `isSystem=true` (KHÔNG dựa vào FK
`ON DELETE SET NULL` để âm thầm gỡ Position khỏi User, dù kỹ thuật vẫn an toàn — chặn tường minh để
Admin chủ động xử lý trước).

**⚠️ Bug đã phát hiện & sửa khi audit lại BE (2026-09-10, trước khi làm FE):**
1. `GET /positions`/`GET /positions/:id` trước đây gate CHUNG với `positions.manage` (chỉ Admin/Assistant)
   — Manager (scope='department' trên `users.manage`) không list được Position để chọn khi tạo nhân viên
   (403). Đã tách permission `positions.view` riêng (xem bảng permission ở trên), gán cho cả 4 role, giữ
   nguyên `positions.manage` chỉ Admin/Assistant cho CUD.
2. `POST /auth/register` (đăng ký công khai) hoàn toàn không có field `positionId` lẫn endpoint public để
   lấy danh mục — đã thêm `GET /positions/public` (mirror `GET /departments/public`, không cần đăng nhập,
   chỉ id/name) + field `positionId` (tuỳ chọn) vào `RegisterDto`/`AuthService.register()`/
   `UsersService.createPendingRegistration()` (có validate tồn tại, ném `NotFoundException` nếu ID bịa,
   giống hệt cách `departmentId` đang được validate ở luồng này).
3. `CreateUserDto`/`UpdateUserDto` (Admin/Manager tạo/sửa nhân viên) trước đây cũng thiếu field
   `positionId` — `ValidationPipe` global (`whitelist: true`) tự strip field này nếu client gửi lên, khiến
   KHÔNG CÓ CÁCH NÀO gán Position cho User qua bất kỳ luồng nào. Đã thêm vào cả 2 DTO.
4. `JwtStrategy.validate()` (`request.user`) trước đây thiếu `positionId` — `PermissionGuard` đọc đúng
   `user.positionId` nhưng luôn nhận `undefined`, khiến MỌI override theo Position (Phase 2) không có
   hiệu lực trên request thật dù DB cấu hình đúng. Đã thêm `positionId: user.positionId` vào object trả
   về của `validate()`.

**⚠️ Bug/thiếu sót phát hiện thêm khi rà soát lần 2 (2026-09-10, trước khi làm FE) — đã sửa:**
5. `DELETE /positions/:id` trước đây gate CHUNG với `positions.manage` (cùng permission với tạo/sửa) —
   không tách được quyền "được sửa nhưng không được xoá" như pattern `departments.manage`/
   `departments.delete` đã có sẵn. Đã thêm permission `positions.delete` riêng (migration
   `AddPositionsDeletePermission1780600000000`, seed CHỈ cho `admin`, giống hệt cách `departments.delete`
   đang được seed), đổi `@RequirePermission` của endpoint DELETE sang `positions.delete`.
   `positions.manage` (POST/PATCH) giữ nguyên không đổi.
6. Các query load `User` (`UsersService.findOne`/`findAll`/`listTrash`/`findPendingApprovals`) chỉ join
   quan hệ `department`, KHÔNG join `position` — dù entity đã khai quan hệ `position` đầy đủ, response
   của GET /users, GET /users/:id, GET /users/trash, GET /users/pending-approvals đều thiếu object
   `position` (chỉ có `positionId` thô), khiến FE không thể hiển thị tên Vị trí ở bảng Nhân viên/Chi tiết/
   Thùng rác/Duyệt đăng ký. Đã thêm `'position'` vào relations/`leftJoinAndSelect` ở cả 4 chỗ.
   **CHƯA sửa** `UsersService.findById()` (dùng bởi `JwtStrategy.validate()` MỌI request + `GET /users/me`)
   — đây là bug CŨ, có SẴN từ trước với cả `department` (không load relation nào), CỐ TÌNH không đụng vào
   vì `findById()` chạy trên mọi request đã đăng nhập (thêm JOIN ở đây ảnh hưởng hiệu năng toàn hệ thống,
   không riêng gì Position) — nếu muốn Trang Profile tự xem chính mình hiển thị đúng Department/Position,
   cần sửa RIÊNG ở `UsersController.getProfile()` (dùng 1 query có relations khác, không tái sử dụng
   `findById()`), không nằm trong phạm vi đợt sửa Position này.

Xem chi tiết đầy đủ ở `WORKFLOW_LOG.md` 2 entry ngày 2026-09-10 ("Audit BE Phase 1+2 Position" và bản ghi
tiếp theo về `positions.view`).

**⚠️ Bug đã phát hiện & sửa trong lúc code phase này:** `PermissionsService.invalidate(roleCode,
departmentId)` (dùng để xoá cache sau khi Admin lưu override) trước đây dựng lại đúng 1 cacheKey khớp
CHÍNH XÁC — sau khi cache key có thêm chiều `positionId`, cách này bỏ sót các user cùng phòng ban nhưng
có Position khác nhau (cache stale tối đa 30s). Đã sửa thành quét + so khớp đúng 1 dimension được
truyền, bỏ qua dimension còn lại — có test khoá hành vi ở `permissions.service.spec.ts` (nhóm
`invalidate - BUG FIX`).

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
| `GET/PATCH /customers/:id/group-memberships*` | `customer-group-memberships.service.ts` | Thêm `assertCustomerAccessible()` riêng (dùng `customerRepo.createQueryBuilder()` + `CustomerAccessHelper.applyViewFilter()`) — có spec test riêng khoá hành vi (`customer-group-memberships.service.spec.ts`). **Cập nhật 2026-09-08:** `PATCH` đổi permission key sang `customer_group_memberships.set` (tách riêng khỏi `customers.edit`) — xem mục 1.7 và mục 3 |

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
| 2026-09-08 (bug thật: 403 khi Employee tick "đã join nhóm") | Chủ dự án báo lỗi thật `PATCH /customers/:id/group-memberships/:groupId` trả 403 "Bạn không có quyền thực hiện hành động này" cho user role Employee ngay lúc vừa tạo khách hàng, dù user này tạo/sửa khách hàng bình thường không lỗi. Đối chiếu trực tiếp code xác nhận nguyên nhân: migration `1778900000000-SplitCustomersManagePermission` đã tách `customers.manage` → `customers.create`/`customers.edit` cho route CRUD chính của `customers.controller.ts`, nhưng **bỏ sót 2 route**: `customer-group-memberships.controller.ts` (`PATCH :id/group-memberships/:groupId`) và `customers.controller.ts` (`POST :id/deposits`) — cả 2 vẫn đòi `customers.manage`, permission NÀY CHỈ được seed cho admin/assistant/manager (`1778600000000-AddDetailedRbacPermissions`), Employee dù có `customers.edit` cũng không tự có. Bảng permission catalogue ở mục 1.7 cũng bị lệch theo (vẫn ghi `customers.manage` = "Tạo/sửa KH", chưa từng cập nhật theo cú tách). **Đã sửa code**: đổi `@RequirePermission('customers.manage')` → `@RequirePermission('customers.edit')` ở cả 2 route trên (nhất quán: ai sửa được KH thì cũng thao tác được sub-resource của KH đó). `customers.manage` vẫn giữ trong bảng `permissions` (không xoá, không có route nào tham chiếu nữa, đánh dấu LEGACY). Verify: `tsc --noEmit` BE sạch, `jest customers.service.spec.ts customer-group-memberships` 48/48 PASS | Xem mục 1.7 (bảng permission catalogue đã sửa), `customer-group-memberships.controller.ts`, `customers.controller.ts` |
| 2026-09-08 (tiếp — tách riêng permission "Tham gia nhóm", theo yêu cầu chủ dự án) | Sau khi vá bug 403 ở trên, chủ dự án yêu cầu thêm: (1) 1 permission RIÊNG cho hành động tick "đã tham gia nhóm", tách khỏi `customers.edit`, có mục điều khiển riêng trên `/phan-quyen`; (2) mặc định scope Employee = `own` (chỉ data của chính mình); (3) hỗ trợ use case tick chọn nhóm ngay lúc tạo mới khách hàng. Kiểm tra trực tiếp code xác nhận: (a) use case "tick nhóm lúc tạo mới" **đã có sẵn ở FE** từ trước (`CustomerForm.tsx` — `GroupPickerModal` + gọi `setMembership()` ngay sau `POST /customers` khi tạo mới) — bug 403 vừa vá ở trên đã đủ để luồng này chạy được với `customers.edit`, chỉ là chưa có permission riêng theo đúng ý muốn tách bạch; (b) phát hiện thêm 1 bug thật KHÁC ở FE: `CustomerGroupMembershipsTab.tsx` (Switch bật/tắt ở tab "Nhóm" khi XEM chi tiết KH) đang check `can('customers.manage')` — permission LEGACY từ trước khi tách `customers.create`/`customers.edit` (2026-09-08 sáng), không khớp với bất kỳ permission nào Backend thực sự đang enforce ở route PATCH này kể từ 2 lần đổi liên tiếp trong ngày — khiến Switch bị ẩn (hiện Tag read-only) sai cho nhiều role dù Backend đáng lẽ cho phép. **Đã sửa**: (1) Migration mới `1779600000000-AddCustomerGroupMembershipSetPermission` — thêm permission `customer_group_memberships.set`, seed mặc định Admin/Assistant=`all`, Manager=`department`, Employee=`own` (đúng bảng chuẩn mục 1); (2) Đổi `@RequirePermission()` của `PATCH :id/group-memberships/:groupId` sang key mới; (3) Đổi `CustomerGroupMembershipsTab.tsx`: `can('customers.manage')` → `can('customer_group_memberships.set')`; (4) Thêm `RESOURCE_LABEL['customer_group_memberships']` ở `phan-quyen/page.tsx` để Admin thấy tên tiếng Việt thay vì raw key. `GET .../group-memberships` (xem checklist) và luồng tạo mới KH **không đổi gì thêm** — đã hoạt động đúng khi Employee có permission mới ở scope `own`. Verify: `tsc --noEmit` BE sạch, migration chạy thử `migration:run`/`migration:revert` OK trên DB test, `jest` toàn bộ suite PASS (xem số liệu ở cuối phiên) | Xem mục 1.7 (permission catalogue), mục 2.1 (bảng sub-resource), `1779600000000-AddCustomerGroupMembershipSetPermission.ts`, `customer-group-memberships.controller.ts`, `CustomerGroupMembershipsTab.tsx`, `phan-quyen/page.tsx` |

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