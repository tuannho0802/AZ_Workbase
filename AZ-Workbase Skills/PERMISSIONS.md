# 🔐 PERMISSIONS.md — Quy tắc phân quyền chuẩn (RBAC) toàn hệ thống AZ-Workbase

> **Đây là NGUỒN CHÂN LÝ DUY NHẤT (single source of truth) cho mọi quyết định phân quyền trong dự án.**
> Bất kỳ module/endpoint/trang UI nào xử lý quyền theo role phải tuân theo đúng bảng dưới đây.
> Nếu code hiện tại (BE hoặc FE) khác với tài liệu này → **tài liệu này đúng, code là bug cần sửa**,
> trừ khi tài liệu chưa được cập nhật theo quyết định nghiệp vụ mới nhất (luôn hỏi lại nếu nghi ngờ).
>
> **Cập nhật lần cuối:** 2026-04-24 (phiên rà soát toàn diện `chia-data`/`customers`)
> **Người yêu cầu xác nhận rule:** Chủ dự án (qua chat trực tiếp với Agent)

---

## 1. Nguyên tắc cốt lõi (áp dụng cho MỌI module, MỌI API, MỌI trang UI)

| Role | Phạm vi XEM (View) | Phạm vi SỬA (Create/Update) | XOÁ (Delete) |
|---|---|---|---|
| **Admin** | Toàn bộ dữ liệu, mọi phòng ban | Toàn bộ | ✅ Được |
| **Assistant** | Toàn bộ dữ liệu, **bất chấp phòng ban** (ngang Admin) | Toàn bộ (ngang Admin) | ❌ **Không** — ẩn hẳn nút xoá, khoá endpoint |
| **Manager** | Chỉ dữ liệu thuộc **phòng ban mình quản lý** (`department.manager_user_id = mình`) | Chỉ trong phạm vi phòng ban mình quản lý | ❌ **Không** — ẩn hẳn nút xoá, khoá endpoint |
| **Employee** | Chỉ dữ liệu **của bản thân** (tự tạo / đang là người phụ trách chính / đang được gán) | Chỉ trong phạm vi trên | ❌ **Không** |

### Diễn giải quan trọng (đúng nguyên văn yêu cầu nghiệp vụ)

- **Assistant = Admin trừ Xoá.** Không chỉ riêng module Khách hàng — điều này áp dụng cho **TẤT CẢ**
  hành động quản trị khác: khoá/mở tài khoản (`isActive`), đặt lại mật khẩu, sửa thông tin User (tên,
  SĐT, phòng ban, role...), quản lý chấm công (map user máy chấm công, đồng bộ log...), quản lý
  Category/Group liên kết, v.v. Assistant **KHÔNG bị giới hạn theo phòng ban** — xem/sửa được mọi
  phòng ban giống hệt Admin. Điểm khác biệt DUY NHẤT với Admin là **không có quyền xoá/gỡ bỏ bất kỳ
  thứ gì** (xoá user, xoá khách hàng, xoá phòng ban, xoá category/group, hard-delete...).

- **Manager = Assistant nhưng bị khoanh vùng theo phòng ban mình quản lý.** Được xem và làm **mọi
  hành động** (trừ xoá) giống Assistant, nhưng giới hạn phạm vi tác động là phòng ban mà chính họ là
  `manager_user_id` (không phải phòng ban họ *thuộc về* — 1 Manager có thể được xếp vào phòng ban A
  nhưng đang **quản lý** phòng ban B, thì phạm vi hành động là phòng ban B).

- **Employee** chỉ xem/sửa (trừ xoá) dữ liệu của **chính mình**: do mình tạo ra, mình đang là người
  phụ trách chính (primary), hoặc đang được gán (assignment còn hiệu lực) — bao gồm cả **Profile bản
  thân** và **các nhóm (Group) được gán cho mình**. Employee không có quyền quản trị bất kỳ ai khác.

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
   trong nhiều file (dễ quên 1 chỗ, xem mục 3 "Lịch sử" bên dưới - bug gốc `getAssigned()` thiếu hẳn
   filter chính là do không tái dùng 1 helper chung).
5. **FE**: nút Xoá chỉ hiện khi `user.role === 'admin'` — không viết điều kiện phức tạp kiểu
   `role === 'admin' || (role === 'assistant' && isOwner)`. Dropdown/filter phụ (không phải nút hành
   động) có thể lọc theo phạm vi Xem để UX gọn hơn, nhưng đây chỉ là tối ưu trải nghiệm, không phải
   yêu cầu bảo mật bắt buộc.

---

## 2. Đối chiếu theo từng module (trạng thái thực tế tại thời điểm cập nhật tài liệu)

> Chú thích: ✅ = đã khớp đúng rule ở mục 1. ⚠️ = chưa rà soát/chưa khớp — cần 1 phiên riêng để sửa.

### 2.1. Khách hàng / Chia Data (`modules/customers`) — ✅ ĐÃ KHỚP (rà soát 2026-04-24)

| Hành động | File chịu trách nhiệm |
|---|---|
| Filter Xem (View) | `CustomerAccessHelper.applyViewFilter()` — dùng chung cho `findAll`, `findOne`, `getAssigned`, `getUnassigned`, `getStats*` |
| Filter Sửa (Update) | Gián tiếp qua `findOne()` (dùng lại `applyViewFilter`) — không có bộ điều kiện riêng |
| Xoá | `CustomerAccessHelper.canDelete()` — `role === ADMIN`, không ngoại lệ. Controller `@Delete(':id')` khoá `@Roles(Role.ADMIN)` |
| Gán data (`bulkAssign`) | Có rule chặt hơn 1 chút cho Employee (chỉ gán được KH mình tạo & chưa ai nhận, hoặc đang là sales chính của mình) — xem chú thích trong `customer-access.helper.ts` |
| FE — nút Xoá | `chia-data/page.tsx`, `customers/page.tsx`: `canDelete = user?.role === 'admin'` (đã sửa 2026-04-24, trước đó có bug cho cả Manager/Assistant/Employee tự xoá data của mình) |
| FE — dropdown filter phụ | "Data Owner"/"Lọc theo Sales" ở `chia-data` lọc theo phạm vi Xem (Manager chỉ thấy user trong phòng ban mình quản lý; Employee ẩn hẳn dropdown); riêng "Chọn Sales nhận data" ở modal Chia data **giữ nguyên full danh sách mọi role** vì BE cố ý cho gán cho bất kỳ ai active, không giới hạn phòng ban |
| Spec test khoá hành vi | `customer-access.helper.spec.ts` (17 test), phần mở rộng trong `customers.service.spec.ts` (+16 test) |

### 2.2. Users / Profile (`modules/users`) — ⚠️ CHƯA KHỚP, cần rà soát riêng

Hiện trạng thực tế (đọc trực tiếp `users.controller.ts`):

| Endpoint | Guard hiện tại | Đúng theo rule mục 1 phải là |
|---|---|---|
| `GET /users` (danh sách phân trang) | `@Roles(ADMIN)` | `ADMIN, ASSISTANT` toàn bộ; `MANAGER` chỉ phòng ban quản lý |
| `GET /users/:id` | `@Roles(ADMIN)` | Như trên |
| `POST /users` (tạo mới) | `@Roles(ADMIN)` | `ADMIN, ASSISTANT` toàn quyền; `MANAGER` chỉ tạo trong phòng ban mình quản lý |
| `PATCH /users/:id` (sửa thông tin) | `@Roles(ADMIN)` | Như trên |
| `PATCH /users/:id/reset-password` | `@Roles(ADMIN)` | `ADMIN, ASSISTANT` toàn quyền; `MANAGER` chỉ trong phòng ban quản lý |
| `PATCH /users/:id/approve`, `.../reject` | `ADMIN, ASSISTANT` | ✅ Đã đúng phần Assistant, nhưng thiếu nhánh Manager (chỉ duyệt user đăng ký vào phòng ban mình quản lý) |
| Khoá/mở tài khoản (`isActive`) | Gộp chung trong `PATCH /users/:id` | Cần tách rule rõ như trên |
| `GET /users/:id/profile` | `@Roles(ADMIN)` cho xem người khác; tự xem bản thân mọi role | ✅ Về cơ bản đúng hướng, nhưng thiếu nhánh Assistant/Manager xem người khác không cần là Admin |

**Kết luận:** Module này đang **CHẶT HƠN** mức cần thiết (chỉ Admin, chưa mở cho Assistant/Manager theo
đúng rule mới) — không phải lỗ hổng bảo mật, nhưng KHÔNG khớp yêu cầu nghiệp vụ hiện tại
("Assistant làm được ngang ngửa Admin... lock account hay chấm công hay sửa pass, đổi thông tin User").
→ **Cần 1 phiên riêng để nới quyền cho Assistant (toàn quyền trừ xoá) và Manager (giới hạn phòng ban
mình quản lý)**, theo đúng pattern `CustomerAccessHelper` (nên tạo `UsersAccessHelper` tương tự).

### 2.3. Máy chấm công (`modules/zk-device`) — ⚠️ CHƯA KHỚP

Toàn bộ controller hiện khoá cứng `@Roles(Role.ADMIN)` ở mức class (mọi endpoint: xem trạng thái máy,
map user, đồng bộ log, xem bảng công...). Theo rule mới, Assistant phải thao tác được ngang Admin
(trừ endpoint xoá log `DELETE attendance-logs/cleanup`), Manager giới hạn xem/thao tác chấm công của
nhân viên thuộc phòng ban mình quản lý. **Chưa thực hiện — cần 1 phiên riêng.**

### 2.4. Nhóm liên kết (`modules/link-groups`) — ⚠️ CHƯA KHỚP

`link-categories.controller.ts` và `link-groups.controller.ts`: toàn bộ CRUD (create/update/lock/
activate/deactivate/**delete**) đang khoá `@Roles(Role.ADMIN)`. Theo rule mới, Assistant phải CRUD
được ngang Admin (trừ riêng hành động **xoá** — `DELETE /link-categories/:id`, `DELETE
/link-groups/:id` phải tách riêng thành `role === ADMIN` y hệt customer, KHÔNG gộp chung
`@Roles(ADMIN)` với các hành động sửa khác). Manager theo rule mới cần giới hạn theo phòng ban (module
này hiện chưa có khái niệm phòng ban gắn với Category/Group — cần bàn thêm hướng thiết kế nếu muốn áp
dụng, có thể không áp dụng khái niệm phòng ban cho module này tuỳ quyết định nghiệp vụ).
`customer-group-memberships.controller.ts` (checklist đã-join) đã đúng hướng self-view cho Employee.
**Chưa thực hiện đầy đủ — cần 1 phiên riêng.**

### 2.5. Nghỉ phép (`modules/leave-requests`) — ⚠️ CHƯA ĐỐI CHIẾU LẦN NÀY

Log `WORKFLOW_LOG.md` (2026-04-16) mô tả cơ chế duyệt chéo phòng ban theo `RolePriority`
(`ADMIN:4, MANAGER:3, ASSISTANT:2, EMPLOYEE:1`) — đây là rule RIÊNG cho nghiệp vụ duyệt phép (người có
priority cao hơn duyệt được đơn của người priority thấp hơn, không phụ thuộc phòng ban). **Cần xác
nhận lại với chủ dự án liệu rule này có còn đúng ý muốn sau khi rule tổng ở mục 1 được ban hành, hay
cần đổi thành "Manager chỉ duyệt đơn của phòng ban mình quản lý" để nhất quán.** Chưa sửa trong phiên
này — ghi chú lại để rà soát sau.

### 2.6. Audit Logs (`modules/audit-logs` hoặc tương đương) — ⚠️ CHƯA ĐỐI CHIẾU LẦN NÀY

---

## 3. Lịch sử các lần rà soát rule này

| Ngày | Nội dung | Chi tiết |
|---|---|---|
| 2026-04-16 | "Freedom Mode" — bỏ ràng buộc phòng ban, phân quyền theo Owner/Assignee | **ĐÃ BỊ THAY THẾ** bởi rule mục 1 (Manager quay lại bị giới hạn theo phòng ban quản lý) |
| 2026-04-17 | Users module bị siết về `ADMIN`-only hoàn toàn (bug trước đó lộ cho Manager/Employee) | Đúng hướng về bảo mật, nhưng chưa mở lại cho Assistant/Manager theo rule mới → xem mục 2.2 |
| 2026-04-24 | Phát hiện `getAssigned()` (API `/customers/assigned`) hoàn toàn thiếu filter phân quyền — Employee thấy được data của toàn bộ user khác | Đã fix + viết spec khoá hành vi (33 test mới) — xem mục 2.1 |
| 2026-04-24 | Ban hành rule tổng chính thức (tài liệu này), rà soát riêng module Customer/Chia Data khớp 100%, phát hiện các module khác (Users, ZK-Device, Link-Groups, Leave-Requests) **chưa khớp** rule mới | Xem mục 2.2 → 2.6 — sẽ xử lý ở các phiên tiếp theo |

---

## 4. Việc cần làm tiếp theo (theo thứ tự ưu tiên đề xuất)

1. Tạo `UsersAccessHelper` (pattern giống `CustomerAccessHelper`) và áp dụng lại cho toàn bộ
   `users.controller.ts`/`users.service.ts` — mở quyền Assistant/Manager theo đúng mục 2.2.
2. Áp dụng lại rule cho `zk-device.controller.ts` (mục 2.3).
3. Áp dụng lại rule cho `link-categories.controller.ts`/`link-groups.controller.ts` (mục 2.4) — tách
   riêng hành động Xoá khỏi các hành động Sửa khác.
4. Làm rõ với chủ dự án về rule duyệt phép (mục 2.5) — giữ nguyên "chéo phòng ban theo priority" hay
   đổi thành "chỉ duyệt phòng ban mình quản lý" cho nhất quán với rule tổng.
5. Rà soát Audit Logs (mục 2.6).
6. Sau khi xong từng module, cập nhật lại bảng ở mục 2 từ ⚠️ sang ✅ kèm ngày rà soát.
