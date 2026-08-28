# 🔐 PERMISSIONS.md — Quy tắc phân quyền chuẩn (RBAC) toàn hệ thống AZ-Workbase

> **Đây là NGUỒN CHÂN LÝ DUY NHẤT (single source of truth) cho mọi quyết định phân quyền trong dự án.**
> Bất kỳ module/endpoint/trang UI nào xử lý quyền theo role phải tuân theo đúng bảng dưới đây.
> Nếu code hiện tại (BE hoặc FE) khác với tài liệu này → **tài liệu này đúng, code là bug cần sửa**,
> trừ khi tài liệu chưa được cập nhật theo quyết định nghiệp vụ mới nhất (luôn hỏi lại nếu nghi ngờ).
>
> **Cập nhật lần cuối:** 2026-08-28 (rà soát toàn bộ module hiện có trong repo + chốt rule cụ thể cho
> Nghỉ phép/Audit Logs/Duyệt đăng ký — đối chiếu trực tiếp với code, không suy đoán từ tên file/commit)
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

---

## 2. Đối chiếu theo từng module (trạng thái thực tế — đọc trực tiếp code tại thời điểm cập nhật)

> Chú thích: ✅ = đã khớp đúng rule ở mục 1. ⚠️ = chưa rà soát/chưa khớp — cần 1 phiên riêng để sửa.
> 🟦 = có mô hình quyền riêng theo chủ đích (xem mục 1.6), không thuộc thang ✅/⚠️ thông thường.

### 2.1. Khách hàng / Chia Data (`modules/customers`) — ✅ ĐÃ KHỚP

| Hành động | File chịu trách nhiệm |
|---|---|
| Filter Xem (View) | `CustomerAccessHelper.applyViewFilter()` — dùng chung cho `findAll`, `findOne`, `getAssigned`, `getUnassigned`, `getStats*` |
| Filter Sửa (Update) | Gián tiếp qua `findOne()` (dùng lại `applyViewFilter`) — không có bộ điều kiện riêng |
| Xoá | `CustomerAccessHelper.canDelete()` — `role === ADMIN`, không ngoại lệ. Controller `@Delete(':id')` khoá `@Roles(Role.ADMIN)` |
| Gán data (`bulkAssign`) | Có rule chặt hơn 1 chút cho Employee (chỉ gán được KH mình tạo & chưa ai nhận, hoặc đang là sales chính của mình) — xem chú thích trong `customer-access.helper.ts` |
| FE — nút Xoá | `chia-data/page.tsx`, `customers/page.tsx`: `canDelete = user?.role === 'admin'` |
| Spec test khoá hành vi | `customer-access.helper.spec.ts`, phần mở rộng trong `customers.service.spec.ts` |

### 2.2. Users / Profile (`modules/users`) — ⚠️ CHƯA KHỚP

Hiện trạng thực tế (đọc trực tiếp `users.controller.ts`):

| Endpoint | Guard hiện tại | Đúng theo rule mục 1 phải là |
|---|---|---|
| `GET /users/all` | `ADMIN, MANAGER, ASSISTANT, EMPLOYEE` (mọi role, dùng cho dropdown chọn user) | ✅ Đã đúng — endpoint chỉ trả tên/id rút gọn, không nhạy cảm |
| `GET /users` (danh sách phân trang, đầy đủ thông tin) | `@Roles(ADMIN)` | `ADMIN, ASSISTANT` toàn bộ; `MANAGER` chỉ phòng ban quản lý |
| `GET /users/:id` | `@Roles(ADMIN)` | Như trên |
| `GET /users/me` | Không giới hạn role (tự xem bản thân) | ✅ Đúng |
| `GET /users/pending-approvals` | `ADMIN, ASSISTANT` | ✅ Đúng phần này, còn thiếu nhánh `MANAGER` (chỉ user đăng ký vào phòng ban mình quản lý) |
| `POST /users` (tạo mới) | `@Roles(ADMIN)` | `ADMIN, ASSISTANT` toàn quyền; `MANAGER` chỉ tạo trong phòng ban mình quản lý |
| `PATCH /users/:id` (sửa thông tin) | `@Roles(ADMIN)` | Như trên |
| `PATCH /users/:id/approve`, `.../reject` | `ADMIN, ASSISTANT` | ✅ Đúng phần Assistant/Admin, thiếu nhánh Manager (chỉ duyệt được nếu TRÙNG phòng ban mình quản lý — xem mục 2.8, rule đã chốt) |
| `PATCH /users/:id/reset-password` | `@Roles(ADMIN)` | `ADMIN, ASSISTANT` toàn quyền; `MANAGER` chỉ trong phòng ban quản lý |
| `GET /users/:id/profile` | `@Roles(ADMIN)` | `ADMIN, ASSISTANT` xem mọi người; `MANAGER` chỉ phòng ban quản lý; mọi role tự xem bản thân |

**Kết luận:** Module này đang **CHẶT HƠN** mức cần thiết (chỉ Admin, chưa mở cho Assistant/Manager theo
đúng rule mới) — không phải lỗ hổng bảo mật, nhưng KHÔNG khớp yêu cầu nghiệp vụ hiện tại. → **Cần 1
phiên riêng: tạo `UsersAccessHelper` (pattern giống `CustomerAccessHelper`) và áp dụng lại toàn bộ.**

### 2.3. Máy chấm công (`modules/zk-device`) — ⚠️ CHƯA KHỚP

Toàn bộ `zk-device.controller.ts` hiện khoá cứng `@Roles(Role.ADMIN)` **ở mức class** (mọi endpoint: xem
trạng thái máy, map user, đồng bộ log, xem bảng công, kể cả xoá log `cleanup`...). Theo rule mới,
Assistant phải thao tác được ngang Admin (trừ riêng endpoint xoá log), Manager giới hạn xem/thao tác
chấm công của nhân viên thuộc phòng ban mình quản lý. `zk-device-cron.controller.ts` (nội bộ, cron job
gọi) và `adms.controller.ts` (`/iclock/*`, máy chấm công gọi thẳng qua giao thức riêng — KHÔNG qua JWT,
không áp RBAC người dùng được) không thuộc phạm vi rule này. **Chưa thực hiện — cần 1 phiên riêng.**

### 2.4. Nhóm liên kết (`modules/link-groups`) — 🟦 hỗn hợp: CRUD chung ⚠️ chưa khớp / Quản lý chính-phụ 🟦 mô hình riêng

- `link-categories.controller.ts`, `link-groups.controller.ts` (CRUD Category/Group nói chung — tạo,
  sửa, khoá/mở, xoá): toàn bộ đang khoá `@Roles(Role.ADMIN)`. Theo rule mục 1, Assistant phải CRUD được
  ngang Admin (trừ riêng **Xoá** — phải tách thành `role === ADMIN` độc lập, không gộp chung decorator
  với các hành động sửa khác). Manager theo rule cần giới hạn theo phòng ban — module này hiện **chưa
  có khái niệm phòng ban gắn với Category/Group**, cần bàn thêm hướng thiết kế nếu muốn áp dụng.
  **Chưa thực hiện — cần 1 phiên riêng.**
- `GET /link-groups` (danh sách group cho checklist "tham gia nhóm" khi tạo/sửa khách hàng): **cố ý mở
  cho MỌI user đã đăng nhập**, không áp rule mục 1 — đây là dữ liệu tham chiếu (danh mục), không phải
  dữ liệu cần phân quyền xem. Không đổi.
- `customer-group-memberships.controller.ts` (checklist khách hàng đã-join nhóm nào): theo hướng
  self-view cho Employee, ✅ đúng hướng.
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

### 2.5. Nguồn Media (`modules/media-sources`) — ⚠️ CHƯA KHỚP

Cùng pattern với 2.4 (CRUD Category chung): `media-sources.controller.ts` toàn bộ mutation (`create`,
`update`, `lock`, `unlock`, `remove`) đang khoá `@Roles(Role.ADMIN)`. `GET /media-sources` (danh sách để
chọn "Nguồn" khi tạo khách hàng) cố ý mở cho mọi user — không đổi. Theo rule mới, Assistant cần CRUD
ngang Admin (trừ xoá). **Chưa thực hiện — cần 1 phiên riêng.**

### 2.6. Nghỉ phép (`modules/leave-requests`) — ⚠️ CHƯA KHỚP (rule đã chốt lại, code chưa cập nhật theo)

`leave-requests.controller.ts` hiện **không dùng `@Roles` decorator ở tầng controller** — toàn bộ logic
"ai được duyệt đơn của ai" nằm trong service, theo cơ chế duyệt chéo phòng ban dựa trên `RolePriority`
(`ADMIN:4, MANAGER:3, ASSISTANT:2, EMPLOYEE:1` — người priority cao hơn duyệt được đơn của người priority
thấp hơn, không phụ thuộc phòng ban — xem `WORKFLOW_LOG.md` mục 2026-04-16).

**Rule ĐÚNG đã chốt (thay thế hoàn toàn cơ chế `RolePriority` chéo phòng ban ở trên):**

| Người xin nghỉ có role | Ai được duyệt đơn này |
|---|---|
| `admin` | Chỉ `admin` (kể cả admin khác duyệt cho admin — admin không tự giới hạn theo phòng ban) |
| `assistant` | Chỉ `admin` |
| `manager` | `assistant` hoặc `admin` |
| `employee` | `manager` **CÙNG phòng ban với employee đó** (không cho Manager phòng ban khác duyệt), hoặc `assistant`, hoặc `admin` |

Khác biệt quan trọng so với cơ chế `RolePriority` cũ: **không còn thuần tuý "priority cao hơn thì duyệt
được"** — cụ thể `assistant` (priority 2) KHÔNG được duyệt đơn của `assistant` khác dù cùng priority hay
thấp hơn theo cách hiểu cũ, và `manager` chỉ được duyệt đơn `employee` **đúng phòng ban mình quản lý**
(không phải "priority cao hơn thì duyệt được của mọi phòng ban" như trước). **Chưa sửa code trong phiên
này — cần viết lại hàm xác định "người duyệt hợp lệ" trong `leave-requests.service.ts` theo đúng bảng
trên, kèm spec test khoá hành vi cho từng cặp role.**

### 2.7. Audit Logs (`modules/audit`) — ⚠️ CHƯA KHỚP (rule đã chốt lại, code chưa cập nhật theo)

`audit.controller.ts`: 2 endpoint đầu dùng `@Roles(ADMIN, MANAGER)`, 4 endpoint còn lại `@Roles(ADMIN)`.

**Rule ĐÚNG đã chốt:** CHỈ `admin` và `assistant` được xem Audit Logs (không phân biệt phòng ban, xem
toàn bộ). `manager` và `employee` bị chặn hoàn toàn — **403 Forbidden**, không có ngoại lệ (kể cả xem
audit log của phòng ban mình quản lý cũng không được — đây là ngoại lệ có chủ đích so với rule chung ở
mục 1, vì audit log là dữ liệu nhạy cảm mức hệ thống, không phải dữ liệu nghiệp vụ theo phòng ban).
**Chưa sửa code — cần đổi toàn bộ 6 endpoint trong `audit.controller.ts` thành `@Roles(ADMIN, ASSISTANT)`
đồng nhất (bỏ `MANAGER` khỏi 2 endpoint đang có).**

### 2.8. Xác thực & Đăng ký tài khoản (`modules/auth`) — ⚠️ CHƯA KHỚP (rule đã chốt lại, code chưa cập nhật theo)

Employee/nhân viên mới có thể tự đăng ký (`POST /auth/register`), tài khoản ở trạng thái `pending` cho
tới khi được duyệt (`PATCH /users/:id/approve`, hiện `@Roles(ADMIN, ASSISTANT)`).

**Rule ĐÚNG đã chốt:** `manager` **CŨNG được duyệt đăng ký mới**, nhưng **CHỈ khi phòng ban người đăng
ký chọn TRÙNG với phòng ban mà chính manager đó đang quản lý** (`department.manager_user_id = manager
đang duyệt`). `admin`/`assistant` vẫn duyệt được mọi phòng ban như hiện tại, không đổi. **Chưa sửa
code — cần: (1) thêm `MANAGER` vào `@Roles()` của `PATCH /users/:id/approve` và `.../reject` và
`GET /users/pending-approvals`, (2) trong service, khi role là `manager`, lọc thêm điều kiện
`departmentId` của user đang chờ duyệt phải khớp phòng ban manager đó quản lý — nếu không khớp thì trả
403 (endpoint approve/reject) hoặc loại khỏi danh sách (endpoint pending-approvals).**

---

## 3. Lịch sử các lần rà soát rule này

| Ngày | Nội dung | Chi tiết |
|---|---|---|
| 2026-04-16 | "Freedom Mode" — bỏ ràng buộc phòng ban, phân quyền theo Owner/Assignee | **ĐÃ BỊ THAY THẾ** bởi rule mục 1 (Manager quay lại bị giới hạn theo phòng ban quản lý) |
| 2026-04-17 | Users module bị siết về `ADMIN`-only hoàn toàn (bug trước đó lộ cho Manager/Employee) | Đúng hướng về bảo mật, nhưng chưa mở lại cho Assistant/Manager theo rule mới → xem mục 2.2 |
| 2026-04-24 | Phát hiện `getAssigned()` (API `/customers/assigned`) hoàn toàn thiếu filter phân quyền — Employee thấy được data của toàn bộ user khác | Đã fix + viết spec khoá hành vi — xem mục 2.1 |
| 2026-04-24 | Ban hành rule tổng chính thức, rà soát riêng module Customer/Chia Data khớp 100% | Xem mục 2.1 |
| 2026-08-28 | Rà soát lại toàn bộ repo sau khi có thêm nhiều module mới (đăng ký/duyệt tài khoản, Media Sources, Quản lý chính/phụ Link Group) — đối chiếu TRỰC TIẾP với code hiện tại (không suy đoán) | Cập nhật mục 2.1 → 2.8, phát hiện thêm 2 module mới chưa khớp (Media Sources §2.5, Audit Logs §2.7 cần xác nhận lại), xác nhận tính năng "Quản lý chính/phụ" Link Group (§2.4) đã đúng mô hình quyền riêng theo chủ đích |
| 2026-08-28 | Chốt rule cụ thể cho 3 mục còn treo: duyệt nghỉ phép (§2.6 — thay hẳn cơ chế `RolePriority` chéo phòng ban bằng bảng role-cặp cụ thể, Manager bắt buộc cùng phòng ban với Employee), Audit Logs (§2.7 — chỉ Admin+Assistant, Manager/Employee 403 tuyệt đối, không có ngoại lệ theo phòng ban), duyệt đăng ký tài khoản (§2.8 — thêm nhánh Manager nhưng bắt buộc trùng phòng ban quản lý) | Cả 3 mục chuyển từ "cần hỏi lại chủ dự án" sang "đã chốt rule, chưa sửa code" — ưu tiên implement ở phiên tiếp theo, xem mục 4 |

---

## 4. Việc cần làm tiếp theo (theo thứ tự ưu tiên đề xuất)

1. Tạo `UsersAccessHelper` (pattern giống `CustomerAccessHelper`) và áp dụng lại cho toàn bộ
   `users.controller.ts`/`users.service.ts` — mở quyền Assistant/Manager theo đúng mục 2.2, **kèm luôn
   nhánh Manager duyệt đăng ký theo đúng phòng ban ở mục 2.8** (làm chung 1 phiên vì cùng file).
2. Sửa `leave-requests.service.ts` theo đúng bảng role-cặp mới ở mục 2.6 (bỏ hẳn `RolePriority` chéo
   phòng ban) — kèm spec test cho từng cặp role (đặc biệt case Manager khác phòng ban KHÔNG được duyệt).
3. Sửa `audit.controller.ts`: đồng nhất `@Roles(ADMIN, ASSISTANT)` cho toàn bộ 6 endpoint (mục 2.7).
4. Áp dụng lại rule cho `zk-device.controller.ts` (mục 2.3).
5. Áp dụng lại rule cho `link-categories.controller.ts`/`link-groups.controller.ts` (mục 2.4, phần CRUD
   chung) và `media-sources.controller.ts` (mục 2.5) — tách riêng hành động Xoá khỏi các hành động Sửa
   khác.
6. Sau khi xong từng module, cập nhật lại bảng ở mục 2 từ ⚠️ sang ✅ kèm ngày rà soát.