# 📐 PLAN: Position (Vị trí) + Ẩn/hiện Field-Tab theo Role×Phòng ban×Vị trí + Quản lý phụ trách (Assignment Group Config)

> **Trạng thái tài liệu:** Kế hoạch (chưa code). Được viết SAU KHI đã `git clone` bản mới nhất
> (commit `93f0e8d`, 2026-09-10) và đọc trực tiếp code thật — không suy đoán từ transcript phiên trước.
> **Người yêu cầu xác nhận business rule:** Chủ dự án (qua chat).
> **Phải đọc trước khi code:** `PERMISSIONS.md` mục 1.7, `SKILL_NESTJS_BACKEND.md`,
> `SKILL_DATABASE_MANAGEMENT.md` mục 5 (quy trình migration bắt buộc).

---

## 0. Đối chiếu với code thật (căn cứ để viết plan này — KHÔNG suy đoán)

| Khẳng định trong plan | Bằng chứng trong code (đã đọc trực tiếp) |
|---|---|
| Chưa có khái niệm Position | `backend/src/database/entities/user.entity.ts` không có cột nào liên quan vị trí |
| RBAC đã có override 2 tầng (Toàn cục → Phòng ban) | `role-permission.entity.ts` (cột `department_id`, enum `PermissionScope` có `NONE`), `permissions.service.ts::loadRolePermissionMap()` |
| `PermissionGuard` là nơi chặn thật duy nhất, đọc `user.departmentId` | `backend/src/common/guards/permission.guard.ts` |
| 4 field cần ẩn cho Content, đúng tên field thật | `frontend/src/components/customers/CustomerForm.tsx` dòng 319 (`salesUserId`), 324 (`marketingUserId`), 356 (`assignedDate`), 361 (`closedDate`) |
| Descriptions "Sales phụ trách chính/được chia/Marketing phụ trách" | `CustomerInfoTab.tsx` dòng 51-87 |
| 5 tab thật trong Chi tiết KH | `CustomerDetailDrawer.tsx` — keys: `info`, `notes`, `deposits`, `assignments`, `groups` |
| Bug hardcode tên phòng ban ở FE | `customers/page.tsx` dòng 393-417: `.find((d) => d.name?.toLowerCase().includes('kinh doanh'))` |
| Picker "Chia data" CỐ Ý không lọc phòng ban | `chia-data/page.tsx` dòng ~540: comment "Removed department check for bulk assign" |
| Migration mới nhất hiện có | `1780200000000-AddDenyScopeForDepartmentOverrides.ts` |
| Endpoint mẫu cho override theo phòng ban (dùng làm khuôn cho Position) | `roles.controller.ts`: `GET/PUT/DELETE /roles/:id/department-overrides[/:departmentId]` |

> ⚠️ **Bắt buộc với Agent thực thi plan này:** trước khi code, `git pull` lại lần nữa và `ls
> backend/src/database/migrations | sort | tail -5` để lấy timestamp thật — các số migration
> trong plan (mục 6) chỉ là **dự kiến tại thời điểm viết plan**, có thể đã có người khác thêm
> migration mới hơn `1780200000000` trong lúc bạn đọc file này.

---

## 1. Mục tiêu nghiệp vụ (tóm tắt đúng theo yêu cầu, không suy diễn thêm)

1. Thêm **Position (Vị trí)** dưới Role — 1 User có 1 Role + tối đa 1 Position (optional).
   Position **không bắt buộc** gắn với 1 Department cụ thể (chỉ mang tính tổ chức/gợi ý), ví dụ
   Admin/HR, Admin/IT, Admin/Director, Admin/CEO — cùng Role `admin`, khác Position.
2. Phân quyền **override 3 tầng theo thứ tự ưu tiên**:
   **Override Position → Override Phòng ban → Toàn cục (Global)**.
3. Với 1 tổ hợp Role × Phòng ban × Position cụ thể (ví dụ Employee/Marketing/Content), có thể:
   - Ẩn hẳn 1 số **field dữ liệu khách hàng** (Sales phụ trách, Marketing phụ trách, Ngày nhận
     KH, Ngày chốt) — ẩn ở **CẢ UI lẫn BE** (BE không trả field đó về, không phải chỉ FE giấu đi),
     nhưng KHÔNG được làm hỏng/xoá data thật trong DB — chỉ là ẩn ở tầng hiển thị/API response.
   - Ẩn hẳn 1 số **filter trên bảng danh sách** tương ứng với field đã ẩn.
   - Giới hạn **tab nào hiện trong Chi tiết khách hàng** (ví dụ Content chỉ thấy "Chi tiết" +
     "Ghi chú").
4. Thêm bảng **"Quản lý phụ trách"** (Assignment Group Config) để Admin tự cấu hình qua UI:
   "nhóm phụ trách X gồm N Phòng ban (bắt buộc ≥1) + N Position (tuỳ chọn)" — dùng để các dropdown
   "Sales phụ trách", "Marketing phụ trách", v.v. tự động lọc đúng người theo cấu hình này, **không
   còn hardcode tên phòng ban ở FE** như hiện tại.

---

## 2. Nguyên tắc thiết kế bắt buộc — ĐỌC KỸ TRƯỚC KHI CODE (tránh xung đột/lỗi chéo)

Đây là phần **quan trọng nhất** để bất kỳ AI/Agent nào đọc vào cũng hiểu đúng logic ngay từ đầu,
không tự suy diễn sai giữa các phiên làm việc khác nhau.

### 2.1. ĐÂY LÀ 2 TRỤC PHÂN QUYỀN HOÀN TOÀN KHÁC NHAU — KHÔNG ĐƯỢC GỘP CHUNG

| Trục | Bảng | Câu hỏi trả lời | Default khi không có rule | Ai enforce |
|---|---|---|---|---|
| **Action permission** (đã có sẵn) | `role_permissions` | "Role này có được LÀM hành động X không, phạm vi Y?" | **Deny** (không có dòng = không có quyền) | `PermissionGuard` |
| **UI/Field visibility** (MỚI, plan này thêm) | `ui_visibility_rules` | "Role/Phòng ban/Position này có được THẤY field/tab X không?" | **Allow** (không có dòng = hiện, vì mặc định hiện hết, chỉ ẩn khi có rule tường minh) | Service layer (strip field khỏi response) + FE hook |

> ⚠️ Lý do 2 default ngược nhau là **CHỦ ĐÍCH**, không phải bug: action permission mặc định
> deny vì đó là an ninh truy cập; UI visibility mặc định "hiện" vì hầu hết Role/Position không
> cần cấu hình gì cả, chỉ những trường hợp đặc biệt (như Content) mới cần ẩn bớt. Nếu 1 Agent
> sau này đổi default của `ui_visibility_rules` thành "deny" thì TOÀN BỘ field/tab của mọi
> Role sẽ biến mất ngay khi bảng này còn trống — đây là bug nghiêm trọng, phải tránh.

### 2.2. Thứ tự ưu tiên override — ÁP DỤNG GIỐNG HỆT NHAU cho CẢ 2 trục ở trên

```
Position override (department_id = NULL, position_id = X)
        ▼ (nếu không có dòng cho position này)
Department override (department_id = Y, position_id = NULL)
        ▼ (nếu không có dòng cho phòng ban này)
Toàn cục / Global (department_id = NULL, position_id = NULL)
        ▼ (nếu không có dòng nào cả)
Default cứng của trục đó (deny cho permission / allow cho visibility)
```

- **1 dòng override chỉ được set 1 trong 2: `department_id` HOẶC `position_id`, không set cả
  hai cùng lúc.** Lý do: user yêu cầu đây là 3 TẦNG kế thừa tuyến tính (Position → Phòng ban →
  Toàn cục), KHÔNG phải ma trận tổ hợp (Phòng ban × Position). Nếu sau này có nhu cầu thật
  "riêng Content của phòng Marketing khác Content của phòng khác" (tổ hợp), đó là thay đổi
  kiến trúc lớn hơn, phải hỏi lại chủ dự án trước khi mở rộng — **không tự ý làm** trong plan
  này.
- Vì vậy khi resolve, **KHÔNG dùng `departmentId` của user để lọc dòng position-override** (vì
  dòng position-override không có `department_id`). Thuật toán đúng:
  1. Query 3 tập rời nhau: `global` (`dept IS NULL AND pos IS NULL`), `deptRows` (`dept = user.departmentId AND pos IS NULL`), `posRows` (`pos = user.positionId AND dept IS NULL`) — user chỉ cần có `departmentId`/`positionId` tương ứng, không cần khớp cả hai.
  2. Merge map: bắt đầu từ `global`, ghi đè bằng `deptRows`, ghi đè tiếp bằng `posRows` (thứ tự
     merge quyết định độ ưu tiên — merge sau cùng thắng).
  3. Sentinel `NONE`/`visible=false` tường minh ở tầng override cao hơn PHẢI thắng, kể cả khi
     tầng thấp hơn đang "allow" — đây chính là lý do cần merge tuần tự đúng thứ tự, không phải
     "OR" cộng dồn.

### 2.3. KHÔNG được đụng vào cơ chế Action Permission hiện có khi thêm Position

- `role_permissions` (bảng đã có `department_id`) — plan này **thêm cột mới** `position_id`
  (nullable) vào ĐÚNG bảng này, KHÔNG tạo bảng song song, để tái dùng 100% logic merge/cache/
  invalidate đã có trong `PermissionsService`. Chỉ mở rộng chữ ký hàm thêm tham số
  `positionId?: number | null`.
- **KHÔNG đổi hành vi của bất kỳ Role/Department nào đang chạy** nếu user đó chưa có
  `positionId` (NULL) — với `positionId = null`, toàn bộ hệ thống phải hoạt động **y hệt hôm
  nay** (chỉ Global + Department override, đúng như trước khi có plan này). Đây là điều kiện
  bắt buộc để không phá hệ thống đang chạy cho ~10 tài khoản dùng chung repo.
- Route bypass admin ở `PermissionGuard` (role === ADMIN luôn full quyền) **giữ nguyên, không
  đổi** — Position không áp dụng cho nhánh bypass này (Admin luôn full bất kể Position gì).

### 2.4. Field/Tab visibility CHỈ áp dụng cho role KHÔNG PHẢI admin

- Đúng tinh thần "lối thoát hiểm" đã có ở `PermissionGuard`: `role === 'admin'` luôn thấy toàn
  bộ field + toàn bộ tab, **bất kể Position/Department override đang cấu hình gì** — tránh
  trường hợp Admin tự cấu hình nhầm rồi tự khoá mắt chính mình (giống nguyên tắc đã ghi ở
  `PERMISSIONS.md` mục 1.7 cho `roles.manage`).
- Assistant: theo đúng rule chung của dự án ("Assistant = Admin trừ Xoá") — **mặc định KHÔNG bị
  ẩn field/tab nào** trừ khi Admin cố tình tạo override cho Position của Assistant đó (hiếm khi
  xảy ra, nhưng kỹ thuật vẫn cho phép vì Assistant cũng có thể có Position).

### 2.5. Ẩn field ở BE phải là **xoá field khỏi object trả về**, không phải trả `null`

- Trả về `null`/`undefined` cho field bị ẩn vẫn để lộ **sự tồn tại** của field đó trong response
  JSON (Content vẫn thấy key `salesUserId: null` trong DevTools Network tab — không phải ẩn thật
  sự, chỉ là ẩn ở UI). Yêu cầu của chủ dự án là ẩn **cả BE lẫn UI** để đảm bảo bảo mật — nghĩa là
  phải dùng `delete responseObj.salesUserId` (hoặc build DTO response KHÔNG bao gồm key đó ngay
  từ đầu), không set `null`.
- Áp dụng ở **service layer**, sau khi entity → DTO nhưng TRƯỚC khi trả về controller, cho cả
  `findAll()` (danh sách + export Excel nếu có) và `findOne()` (chi tiết) — 1 helper dùng chung,
  đúng nguyên tắc "1 nguồn áp filter duy nhất" giống `CustomerAccessHelper.applyViewFilter()`.
- ⚠️ Field bị ẩn khỏi response tuyệt đối **KHÔNG được xoá/null trong DB** — chỉ xoá ở tầng
  response object, tạo mới ngay trước khi return. Không bao giờ gọi `save()` sau khi xoá field.

### 2.6. Vị trí (Position) là optional trên User — không được ép buộc

- Cột `users.position_id` phải `nullable: true`. Rất nhiều user hiện tại (toàn bộ user đang có
  trong production) sẽ có `position_id = NULL` ngay sau migration — hệ thống phải hoạt động
  bình thường với NULL (coi như không có override Position nào, fallback về Department/Global).
- **KHÔNG** thêm bất kỳ ràng buộc NOT NULL, không bắt buộc chọn Position khi tạo/sửa User.

### 2.7. Migration — tuân thủ đúng `SKILL_DATABASE_MANAGEMENT.md` mục 5

- Mỗi migration mới PHẢI có `up()` và `down()` đối xứng, dùng `IF NOT EXISTS` khi có thể.
- KHÔNG sửa lại 6 migration liệt kê ở mục 6 dưới đây nếu chúng **đã được chạy** trên môi trường
  bất kỳ (kể cả staging) — nếu phát hiện lỗi sau khi đã chạy, viết migration MỚI để fix-forward.
- Timestamp phải LỚN HƠN timestamp lớn nhất thật sự có trong thư mục migrations tại **thời điểm
  code** (không phải thời điểm viết plan này) — luôn `ls` lại trước khi đặt tên file.

### 2.8. Không phá vỡ hành vi hiện tại của "Chia data" (bulk-assign) picker

- Comment trong `chia-data/page.tsx` đã nói rõ picker "Chọn Sales nhận data" **cố tình** không
  lọc theo phòng ban (BE cho phép gán khách hàng cho bất kỳ ai đang active). Plan này **KHÔNG
  đổi hành vi mặc định đó** — bảng "Quản lý phụ trách" (mục 5) là 1 cơ chế **tuỳ chọn, độc lập**
  cho các dropdown "Sales phụ trách"/"Marketing phụ trách" trong `CustomerFilters`/`CustomerForm`.
  Việc có áp dụng nó cho picker "Chia data" hay không là quyết định nghiệp vụ riêng, **để phase
  sau, phải hỏi lại chủ dự án**, không tự ý đổi trong phase này.

---

## 3. Kiến trúc dữ liệu mới

### 3.1. Bảng `positions`

```sql
CREATE TABLE positions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(50) NOT NULL UNIQUE,       -- bất biến sau khi tạo, vd 'content', 'director', 'hr'
  name VARCHAR(100) NOT NULL,             -- tên hiển thị, sửa thoải mái, vd "Content"
  department_id INT NULL,                 -- gợi ý tổ chức, KHÔNG ràng buộc cứng (xem 2.6/mục 1)
  description VARCHAR(255) NULL,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
);
```

- `department_id` trên `positions` **chỉ để hiển thị gợi ý** trong UI quản lý Position (nhóm
  Position theo phòng ban cho dễ nhìn) — **KHÔNG dùng field này để ràng buộc** "User thuộc phòng
  ban A chỉ được chọn Position có department_id = A". User có thể chọn bất kỳ Position nào bất
  kể phòng ban của họ (đúng yêu cầu "không bắt buộc").
- `code` bất biến sau khi tạo (giống `roles.code`) — vì override sau này có thể tham chiếu theo
  `position_id` (khoá ngoại số), không phải theo `code` trực tiếp, nên rủi ro "mồ côi" thấp hơn
  `roles.code`, nhưng vẫn giữ quy ước bất biến để nhất quán & dễ audit log.
- KHÔNG xoá cứng (`DELETE`) 1 Position đang có User gán — chặn ở service layer giống
  `roles.service.ts` chặn xoá Role đang có User (xem `RolesService`).

### 3.2. Cột mới trên `users`

```sql
ALTER TABLE users ADD COLUMN position_id INT NULL;
ALTER TABLE users ADD CONSTRAINT fk_users_position FOREIGN KEY (position_id) REFERENCES positions(id) ON DELETE SET NULL;
```

- `ON DELETE SET NULL`: xoá 1 Position không làm hỏng User, chỉ về lại trạng thái "không có
  Position" (giống hệt cách `department_id` đang xử lý trên `customers`).

### 3.3. Mở rộng `role_permissions` — override tầng Position

```sql
ALTER TABLE role_permissions ADD COLUMN position_id INT NULL;
ALTER TABLE role_permissions ADD CONSTRAINT fk_role_permissions_position FOREIGN KEY (position_id) REFERENCES positions(id) ON DELETE CASCADE;
```

- Ràng buộc nghiệp vụ (enforce ở **service layer**, KHÔNG ở DB CHECK — theo đúng comment sẵn có
  trong `AddDenyScopeForDepartmentOverrides.ts` về việc tránh phụ thuộc tính năng CHECK constraint
  không đồng nhất giữa các phiên bản MySQL): **1 dòng chỉ được set `department_id` HOẶC
  `position_id`, không cả hai** — validate trong `RolesService.updatePositionOverride()`.
- Tái sử dụng NGUYÊN VẸN enum `PermissionScope` đã có (`own/department/all/none`) — dòng override
  Position dùng `scope = 'none'` với ý nghĩa **giống hệt** như đã định nghĩa cho Department (từ
  chối tường minh, không phải "không có dòng").

**`PermissionsService.loadRolePermissionMap()` — chữ ký mới:**

```typescript
private async loadRolePermissionMap(
  roleCode: string,
  departmentId?: number | null,
  positionId?: number | null,   // MỚI
): Promise<Map<string, PermissionScope | null>> {
  const cacheKey = `${roleCode}:${departmentId ?? 'global'}:${positionId ?? 'nopos'}`; // MỞ RỘNG cache key
  // ... load 3 tập rời nhau: global / deptRows / posRows (điều kiện xem mục 2.2)
  // ... merge tuần tự: global -> deptRows -> posRows (posRows đè sau cùng)
  // ... xử lý sentinel NONE giống hệt logic đã có cho deptRows, áp dụng thêm cho posRows
}
```

- `hasPermission()` và `getRolePermissions()` thêm tham số `positionId` truyền xuống, giữ
  nguyên chữ ký cũ có default `undefined` để KHÔNG phá code hiện tại đang gọi 2-tham số.

**`PermissionGuard` — thay đổi:**

```typescript
const { allowed, scope } = await this.permissionsService.hasPermission(
  user.role,
  requiredKey,
  user.departmentId,
  user.positionId,   // MỚI — cần user.positionId có mặt trong JWT payload / GetUser()
);
```

→ Cần bổ sung `positionId` vào payload JWT lúc login (`AuthService`) và vào object `user` mà
`JwtStrategy.validate()` trả về, tương tự cách `departmentId` đã có sẵn — đọc kỹ
`jwt.strategy.ts` thật trước khi sửa (chưa đọc trong phiên khảo sát này, PHẢI đọc trước khi code).

### 3.4. Bảng mới `ui_visibility_rules` — ẩn/hiện Field & Tab

```sql
CREATE TABLE ui_visibility_rules (
  id INT PRIMARY KEY AUTO_INCREMENT,
  role_id INT NOT NULL,
  department_id INT NULL,             -- override tầng phòng ban (XOR với position_id)
  position_id INT NULL,               -- override tầng vị trí (XOR với department_id)
  resource VARCHAR(50) NOT NULL,      -- vd 'customers' — cho phép mở rộng resource khác sau này
  element_key VARCHAR(100) NOT NULL,  -- vd 'field:sales_assignment', 'tab:deposits'
  visible BOOLEAN NOT NULL,           -- true/false tường minh, không có sentinel riêng vì bảng
                                       -- này vốn đã "opt-out" (xem 2.1) — 1 dòng visible=true ở
                                       -- tầng cao hơn cũng đủ để "mở lại" cái đã bị tầng thấp ẩn
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_rule (role_id, resource, element_key, department_id, position_id),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
  FOREIGN KEY (position_id) REFERENCES positions(id) ON DELETE CASCADE
);
```

- **Không cần seed dòng nào mặc định** — bảng trống = mọi Role/Department/Position thấy hết mọi
  field/tab (đúng default "allow" ở mục 2.1). Chỉ thêm dòng khi Admin **chủ động ẩn** thứ gì đó
  qua UI (ví dụ 4 dòng cho Employee/Marketing-dept HOẶC Employee/Content-position, tuỳ Admin chọn
  cấu hình ở tầng nào).
- Thuật toán resolve **hệt logic mục 3.3** (global → dept → position, merge tuần tự, tầng sau
  đè tầng trước) nhưng field cần theo dõi là `visible` (boolean) thay vì `scope`.
- `UNIQUE KEY` đảm bảo không tạo 2 dòng trùng nhau (vd 2 dòng `position_id=5` cho cùng
  `element_key='tab:deposits'`) — validate thêm ở service layer để trả lỗi rõ ràng thay vì lỗi
  DB constraint khó hiểu.

### 3.5. Danh mục `element_key` khởi tạo (resource = `'customers'`)

> Giống triết lý `permissions` catalogue (mục 1.7 PERMISSIONS.md): danh sách này CỐ ĐỊNH trong
> code, Admin CHỈ được bật/tắt qua UI, KHÔNG tự thêm `element_key` tuỳ ý qua UI (tránh tạo "khoá
> ảo" không component nào thật sự đọc).

| `element_key` | Ý nghĩa | Nơi BE phải strip field | Nơi FE phải ẩn |
|---|---|---|---|
| `field:sales_assignment` | Sales phụ trách chính + Sales được chia | `salesUserId`, `salesUser`, `activeAssignees` (phần liên quan sales) trong response `Customer` | Cột "Sales (Chính + Phụ)" trong `customers/page.tsx`; field `salesUserId` + dropdown Sales trong `CustomerForm.tsx`/`CustomerFilters.tsx`; dòng "Sales phụ trách chính"/"Sales được chia" trong `CustomerInfoTab.tsx` |
| `field:marketing_assignment` | Marketing phụ trách | `marketingUserId`, `marketingUser` | Cột "Marketing" trong bảng; field `marketingUserId` trong Form/Filters; dòng "Marketing phụ trách" trong `CustomerInfoTab.tsx` |
| `field:assigned_date` | Ngày nhận KH | `assignedDate` | Field `assignedDate` trong `CustomerForm.tsx`; dòng "Ngày nhận KH" trong `CustomerInfoTab.tsx` |
| `field:closed_date` | Ngày chốt | `closedDate` | Field `closedDate` trong `CustomerForm.tsx`; dòng "Ngày chốt" trong `CustomerInfoTab.tsx`; filter Trạng thái="closed" KHÔNG bị ảnh hưởng (khác trục dữ liệu) |
| `tab:deposits` | Tab "Nạp tiền" | *(tab riêng, không phải field trên response Customer — chặn Ở FE bằng cách không render tab; BE endpoint `POST/GET .../deposits` vẫn giữ nguyên gate theo `customers.edit`/`customers.view` như hiện tại, KHÔNG đổi)* | Không render item `key: 'deposits'` trong `items` array của `CustomerDetailDrawer.tsx` |
| `tab:assignments` | Tab "Gán data" | *(tương tự trên)* | Không render item `key: 'assignments'` |
| `tab:groups` | Tab "Nhóm" | *(tương tự trên)* | Không render item `key: 'groups'` |

- Tab `info` (Chi tiết) và `notes` (Ghi chú) **KHÔNG có `element_key`** — luôn hiện, không thể ẩn
  qua cơ chế này (đúng yêu cầu Content luôn còn đúng 2 tab này). Nếu tương lai cần ẩn cả 2 tab
  này cho 1 Role nào đó, đó là quyết định nghiệp vụ mới, phải hỏi lại — không tự thêm.
- ⚠️ Với `tab:deposits`/`tab:assignments`/`tab:groups`: đây là ẩn **thuần UI** (không có field
  tương ứng trên object `Customer` để strip ở BE, vì data nằm ở API con riêng
  `/customers/:id/deposits`, `/customers/:id/assignments`, `/customers/:id/group-memberships`).
  Ẩn tab ở FE là đủ để đạt mục tiêu "Content chỉ thấy 2 tab" — nhưng **PHẢI đối chiếu lại** rằng
  các API con đó đã tự có permission gate riêng đúng đắn (chúng đã có: `customers.edit` cho
  deposits POST, `customer_group_memberships.set` cho groups...) để nếu Content gõ thẳng URL API
  con vẫn bị chặn đúng theo action permission hiện có — **không dựa vào việc ẩn tab FE làm lớp
  bảo mật** (đúng nguyên tắc chung mục 1 rule 1 của `PERMISSIONS.md`).

### 3.6. Bảng mới `assignment_group_configs` + 2 bảng join — "Quản lý phụ trách"

```sql
CREATE TABLE assignment_group_configs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  `key` VARCHAR(50) NOT NULL UNIQUE,   -- bất biến, vd 'sales', 'marketing', 'content_staff'
  name VARCHAR(100) NOT NULL,          -- tên hiển thị, sửa thoải mái, vd "Sales phụ trách"
  description VARCHAR(255) NULL,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,  -- 'sales'/'marketing' seed sẵn = is_system=true, không xoá được
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE assignment_group_config_departments (   -- N+1, BẮT BUỘC ≥1 dòng để config có hiệu lực
  id INT PRIMARY KEY AUTO_INCREMENT,
  config_id INT NOT NULL,
  department_id INT NOT NULL,
  UNIQUE KEY uk_config_dept (config_id, department_id),
  FOREIGN KEY (config_id) REFERENCES assignment_group_configs(id) ON DELETE CASCADE,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE
);

CREATE TABLE assignment_group_config_positions (     -- N, TUỲ CHỌN
  id INT PRIMARY KEY AUTO_INCREMENT,
  config_id INT NOT NULL,
  position_id INT NOT NULL,
  UNIQUE KEY uk_config_pos (config_id, position_id),
  FOREIGN KEY (config_id) REFERENCES assignment_group_configs(id) ON DELETE CASCADE,
  FOREIGN KEY (position_id) REFERENCES positions(id) ON DELETE CASCADE
);
```

**Quy tắc resolve danh sách user hợp lệ cho 1 config (`AssignmentGroupsService.resolveUsers(key)`):**

```
user hợp lệ  =  user.isActive = true
             AND user.approvalStatus = 'approved'
             AND user.department_id IN (departments của config)
             AND (
                   config KHÔNG có dòng position nào    -- không giới hạn theo position
                   OR user.position_id IN (positions của config)
                 )
```

- Department là **bắt buộc** (đúng yêu cầu "Phòng ban là bắt buộc") — 1 config không có dòng
  department nào thì trả về danh sách rỗng (không fallback "tất cả phòng ban" — tránh lộ data
  ngoài ý muốn nếu Admin quên cấu hình).
- Position là **tuỳ chọn** (đúng yêu cầu "vị trí là tuỳ chọn") — không có dòng position = không
  lọc thêm theo position, chỉ cần đúng phòng ban.
- **Seed mặc định 2 config `is_system=true` để giữ nguyên hành vi hiện tại ngay sau migration**
  (không phá UX đang chạy cho các tài khoản khác):
  - `key='sales'`, tự động thêm 1 dòng `assignment_group_config_departments` trỏ tới phòng ban
    đầu tiên có tên chứa "kinh doanh" (không phân biệt hoa/thường) tại thời điểm chạy migration —
    **giữ đúng logic** đang có ở `customers/page.tsx` dòng 401-403, chỉ chuyển từ hardcode FE
    sang cấu hình DB.
  - `key='marketing'`, tương tự với tên chứa "marketing".
  - Nếu migration chạy trên môi trường KHÔNG có phòng ban nào khớp tên (vd DB test trống) → seed
    config nhưng để trống danh sách phòng ban, Admin tự vào UI "Quản lý phụ trách" thêm sau —
    KHÔNG throw lỗi migration.

**API mới (`assignment-groups.controller.ts`, permission mới `assignment_groups.manage` cho
CRUD, đọc `GET /assignment-groups/:key/users` chỉ cần đăng nhập — giống triết lý
`my-permissions` vì đây là data hỗ trợ hiển thị dropdown, không phải hành động nhạy cảm):**

| Endpoint | Quyền | Mô tả |
|---|---|---|
| `GET /assignment-groups` | `assignment_groups.manage` | Danh sách config kèm departments/positions đã gán |
| `POST /assignment-groups` | `assignment_groups.manage` | Tạo config mới (key tuỳ chỉnh, không phải `sales`/`marketing`) |
| `PATCH /assignment-groups/:id` | `assignment_groups.manage` | Sửa tên/mô tả + ghi đè toàn bộ danh sách department/position (giống pattern "replace toàn bộ" của `UpdateRolePermissionsDto`) |
| `DELETE /assignment-groups/:id` | `assignment_groups.manage` | Không xoá được config `is_system=true` |
| `GET /assignment-groups/:key/users` | Chỉ cần đăng nhập | Trả `{id, name}[]` user hợp lệ theo `key` — FE gọi thay cho logic hardcode hiện tại |

---

## 4. Thay đổi Backend chi tiết (theo đúng thứ tự bắt buộc ở `SKILL_NESTJS_BACKEND.md`)

### 4.1. Entity mới/sửa

1. `database/entities/position.entity.ts` — **MỚI**.
2. `database/entities/user.entity.ts` — thêm `@Column({ name: 'position_id', nullable: true }) positionId: number;` + `@ManyToOne(() => Position) @JoinColumn({ name: 'position_id' }) position: Position;`.
3. `database/entities/role-permission.entity.ts` — thêm `positionId`/`position` (giống hệt cặp `departmentId`/`department` đã có).
4. `database/entities/ui-visibility-rule.entity.ts` — **MỚI**.
5. `database/entities/assignment-group-config.entity.ts`,
   `assignment-group-config-department.entity.ts`,
   `assignment-group-config-position.entity.ts` — **MỚI** (3 file, đúng chuẩn 1 entity/file của
   dự án).

### 4.2. DTO mới/sửa

- `modules/positions/dto/{create,update}-position.dto.ts`.
- `modules/roles/dto/update-role-permissions.dto.ts` — **tái sử dụng nguyên vẹn** cho endpoint
  `PUT /roles/:id/position-overrides/:positionId` (giống cách `department-overrides` đang dùng
  chung DTO này) — không cần DTO mới.
- `modules/ui-visibility/dto/update-ui-visibility.dto.ts` — mảng `{elementKey, visible}[]`, style
  "replace toàn bộ" giống `UpdateRolePermissionsDto`.
- `modules/assignment-groups/dto/{create,update}-assignment-group.dto.ts`.

### 4.3. Service

- `PositionsService` — CRUD + chặn xoá Position đang có User gán (đối chiếu `roles.service.ts`
  để copy đúng pattern chặn xoá).
- `PermissionsService` — sửa `loadRolePermissionMap`/`hasPermission`/`getRolePermissions` theo
  mục 3.3. Cache key đổi format → **phải xoá cache cũ hoàn toàn khi deploy** (restart service là
  đủ, cache chỉ ở memory theo instance, không phải Redis — xác nhận lại trong `permissions.service.ts` dòng 11: `Cache theo TỪNG INSTANCE serverless`).
- `RolesService` — thêm `getPositionOverrides()`, `updatePositionOverride()`,
  `deletePositionOverride()` — copy gần như y hệt 3 hàm `*DepartmentOverride*` đang có, đổi
  `departmentId` → `positionId`. Sửa `getMyPermissions(roleCode, departmentId)` →
  `getMyPermissions(roleCode, departmentId, positionId)`.
- `UiVisibilityService` (**MỚI**) — chứa:
  - `loadHiddenElementKeys(roleId, resource, departmentId?, positionId?): Promise<Set<string>>` —
    thuật toán mục 3.4 (opt-out, merge tuần tự).
  - `getMyHiddenElements(roleCode, resource, departmentId?, positionId?)` — dùng cho endpoint
    self-service giống `my-permissions`.
  - `stripHiddenCustomerFields(customerDto, hiddenKeys: Set<string>)` — helper thuần hàm, map
    `element_key` → field cần xoá (bảng mục 3.5), dùng chung cho `findAll`/`findOne`/export Excel
    (nếu module `customers` có export — cần kiểm tra lại khi code, chưa xác nhận trong khảo sát
    này).
  - Cache tương tự `PermissionsService` (TTL ngắn, theo instance) — **KHÔNG dùng chung cache map
    với `PermissionsService`** dù cùng pattern, vì 2 trục dữ liệu độc lập (mục 2.1) — tránh
    nhầm lẫn khi debug sau này nếu gộp chung.
- `AssignmentGroupsService` (**MỚI**) — CRUD config + `resolveUsers(key)` theo mục 3.6. Chặn xoá
  config `is_system=true`.

### 4.4. Controller

- `PositionsController` (`/positions`) — quyền `positions.manage` (permission mới, seed
  Admin/Assistant=`all`, Manager/Employee=không có).
- `RolesController` — thêm 3 endpoint `position-overrides` (copy pattern `department-overrides`,
  mục 3.6 nêu rõ URL).
- `UiVisibilityController` (`/ui-visibility`) — `GET /ui-visibility/my-hidden?resource=customers`
  (chỉ cần đăng nhập, tự trả field/tab bị ẩn của CHÍNH mình — đúng nguyên tắc self-referential đã
  áp dụng cho `my-permissions`), + `GET/PUT/DELETE /ui-visibility/roles/:id/rules` cho Admin cấu
  hình qua `/phan-quyen` (quyền `roles.manage` — tái dùng, KHÔNG tạo quyền mới, vì đây vẫn là
  "cấu hình phân quyền", thuộc đúng phạm vi module `roles` đang enforce chính nó).
- `AssignmentGroupsController` (`/assignment-groups`) — theo mục 3.6.
- **Sửa** `CustomersController`/`CustomersService`: sau khi `findOne()`/`findAll()` build xong
  response, gọi `UiVisibilityService.stripHiddenCustomerFields()` trước khi return — đọc kỹ
  `customers.service.ts` thật (CHƯA đọc chi tiết trong khảo sát này, PHẢI đọc trước khi code) để
  chèn đúng chỗ, không phá `applyViewFilter()` đang có.

### 4.5. Migration (dự kiến — PHẢI re-verify timestamp thật trước khi code, xem cảnh báo mục 0)

| # | Tên file dự kiến | Nội dung |
|---|---|---|
| 1 | `178030000000?-AddPositionsTable.ts` | Tạo bảng `positions`; thêm cột `position_id` nullable + FK vào `users` |
| 2 | `178040000000?-AddPositionOverrideToRolePermissions.ts` | Thêm cột `position_id` nullable + FK vào `role_permissions` |
| 3 | `178050000000?-CreateUiVisibilityRules.ts` | Tạo bảng `ui_visibility_rules` (không seed dữ liệu) |
| 4 | `178060000000?-CreateAssignmentGroupConfigs.ts` | Tạo 3 bảng `assignment_group_configs` + 2 bảng join; seed 2 config `sales`/`marketing` + auto-map phòng ban theo tên (mục 3.6) |
| 5 | `178070000000?-AddPositionAndAssignmentGroupPermissions.ts` | Seed `Permission` mới: `positions.manage`, `assignment_groups.manage` + seed `RolePermission` mặc định (Admin/Assistant = `all`; Manager/Employee = không có dòng nào) |

> Đánh dấu `?` vì đây là con số **dự kiến nối tiếp `1780200000000`** — Agent thực thi PHẢI tự
> tính lại timestamp thật (xem mục 0/2.7), đây chỉ là ví dụ minh hoạ thứ tự & số lượng migration
> cần có, không phải giá trị final.

---

## 5. Thay đổi Frontend chi tiết (theo đúng `SKILL_NEXTJS_FRONTEND.md`)

### 5.1. Hooks mới

- `lib/hooks/useMyHiddenElements.ts` — gọi `GET /ui-visibility/my-hidden?resource=customers`,
  style giống hệt `useMyPermissions.ts` (staleTime 60s), trả về `isHidden(elementKey): boolean`.
- `lib/hooks/useAssignmentGroupUsers.ts` — gọi `GET /assignment-groups/:key/users`, dùng
  `useQuery` với `queryKey: ['assignment-group-users', key]`.
- `lib/hooks/usePositions.ts` — CRUD Position, style giống `useDepartments.ts` (đọc file này
  trước khi code để khớp convention).

### 5.2. Sửa các component đang hardcode/không lọc

| File | Thay đổi |
|---|---|
| `customers/page.tsx` | XOÁ đoạn `.find((d) => d.name?.toLowerCase().includes('kinh doanh'))` (dòng 393-417) → thay bằng `useAssignmentGroupUsers('sales')` / `useAssignmentGroupUsers('marketing')`. Cột "Sales (Chính + Phụ)" và "Marketing" trong `columns` bọc điều kiện `!isHidden('field:sales_assignment')` / `!isHidden('field:marketing_assignment')` |
| `CustomerFilters.tsx` | Ẩn hẳn 2 `<Col>` chứa dropdown Sales/Marketing khi `isHidden(...)` tương ứng — không chỉ ẩn field trong Form mà cả filter, đúng yêu cầu "loại bỏ luôn các phần filter ở trên bảng khách hàng nếu liên quan" |
| `CustomerForm.tsx` | Bọc `<Form.Item name="salesUserId">`, `marketingUserId`, `assignedDate`, `closedDate` bằng điều kiện `!isHidden(...)` tương ứng |
| `CustomerInfoTab.tsx` | Bọc các `<Descriptions.Item>` tương ứng (Sales phụ trách chính, Sales được chia, Marketing phụ trách, Ngày nhận KH, Ngày chốt) bằng điều kiện ẩn — Ant Design `Descriptions` cho phép item là `null`/`false` trong mảng con mà không lỗi layout (xác nhận cú pháp cụ thể khi code — hiện tại file dùng JSX trực tiếp trong `<Descriptions>`, có thể cần chuyển sang mảng `items` để dễ điều kiện hoá, đọc kỹ Ant Design version thật của dự án — xem "Ant Design 6.x" ghi trong `SKILL_NEXTJS_FRONTEND.md` mục 8 trước khi chọn cách viết) |
| `CustomerDetailDrawer.tsx` | Build mảng `items` bằng cách filter theo `isHidden('tab:deposits')` v.v. trước khi truyền vào `<Tabs items={...}>`, thay vì khai báo cứng mảng 5 phần tử như hiện tại |

### 5.3. Trang quản trị mới

- `/positions` (hoặc thêm vào trang User Management hiện có) — CRUD Position, chọn Department
  gợi ý (optional select).
- Mở rộng `/phan-quyen`:
  - Thêm tab/segment "Override theo Vị trí" cạnh tab "Override theo Phòng ban" đã có (đọc
    `phan-quyen/page.tsx` thật để biết cấu trúc tab hiện tại trước khi thêm — CHƯA đọc trong
    khảo sát này).
  - Thêm mục "Hiển thị dữ liệu" (matrix Role × field/tab key, có chọn tầng Global/Department/
    Position tương tự cách chọn override phòng ban hiện tại) — dùng `RESOURCE_LABEL` pattern đã
    có sẵn ở `phan-quyen/page.tsx` để hiện tên tiếng Việt cho `element_key`.
- `/quan-ly-phu-trach` (trang mới) — CRUD `assignment_group_configs`: chọn N phòng ban (bắt
  buộc), N vị trí (tuỳ chọn) cho mỗi config; hiển thị rõ 2 config hệ thống `sales`/`marketing`
  không xoá được (giống UI "role hệ thống" không xoá được ở `/phan-quyen`).

---

## 6. Danh mục Permission mới cần seed (bổ sung bảng mục 1.7 `PERMISSIONS.md`)

| Permission key | Resource | Mô tả | Seed mặc định |
|---|---|---|---|
| `positions.manage` | positions | CRUD Vị trí | Admin/Assistant = `all` (không cần scope thật vì Position là bảng cấu hình toàn cục, không theo phòng ban — set `supportsScope=false`) |
| `assignment_groups.manage` | assignment_groups | CRUD "Quản lý phụ trách" | Admin/Assistant = `all`, `supportsScope=false` |

- **KHÔNG** tạo permission riêng cho "ui_visibility" — dùng lại `roles.manage` (đúng lý do đã nêu
  ở mục 4.4, vì bản chất đây vẫn là cấu hình phân quyền, thuộc phạm vi module `roles`).
- Sau khi thêm, **PHẢI cập nhật lại `PERMISSIONS.md` mục 1.7** (bảng catalogue) trong cùng lượt
  code — đúng quy tắc dự án "PERMISSIONS.md là nguồn chân lý, luôn cập nhật liên tục".

---

## 7. Trình tự triển khai (phases) — để không phá hệ thống đang chạy giữa chừng

> Nguyên tắc chung: sau MỖI phase, hệ thống phải build được + toàn bộ test hiện có (203+ test)
> vẫn PASS + hành vi cũ (khi `positionId = null`, không có `ui_visibility_rules` nào) phải giữ
> nguyên 100%.

1. **Phase 1 — Position nền tảng (BE trước, không đổi UX nào):**
   Migration #1, entity `Position`, `PositionsService/Controller`, thêm `positionId` vào JWT +
   `GetUser()`. Chưa đổi `PermissionGuard`/`PermissionsService`. → Verify: `tsc --noEmit`,
   `jest`, tạo thử 1 Position qua Swagger, gán cho 1 user test, xác nhận không ảnh hưởng gì khác.

2. **Phase 2 — Override Position cho Action Permission:**
   Migration #2, sửa `PermissionsService`/`PermissionGuard`/`RolesService` theo mục 3.3, 3 endpoint
   `position-overrides`. → Verify: viết test riêng cho `permissions.service.spec.ts` (case
   position override thắng department override thắng global — dùng đúng thứ tự merge mục 2.2),
   chạy lại toàn bộ suite cũ để đảm bảo không có regression (đặc biệt case `positionId=null`).

3. **Phase 3 — UI Visibility Rules (field + tab):**
   Migration #3, `UiVisibilityService/Controller`, sửa `CustomersService` strip field, FE hook
   `useMyHiddenElements`, sửa 5 file FE ở mục 5.2. → Verify: tạo user test Employee/Marketing/
   Content, set rule ẩn 4 field + 3 tab, xác nhận **response API thật sự không có field đó**
   (check bằng `curl`/Postman, không chỉ nhìn UI), UI ẩn đúng cột/filter/tab.

4. **Phase 4 — Assignment Group Config ("Quản lý phụ trách"):**
   Migration #4, #5, `AssignmentGroupsService/Controller`, trang `/quan-ly-phu-trach`, sửa
   `customers/page.tsx` dùng API mới thay hardcode. → Verify: sau migration, dropdown "Sales phụ
   trách"/"Marketing phụ trách" ở trang Khách hàng phải cho ra **ĐÚNG danh sách y hệt** trước khi
   đổi (do đã seed đúng department theo tên) — đây là bài test hồi quy quan trọng nhất của phase
   này.

5. **Phase 5 — Dọn tài liệu:** cập nhật `PERMISSIONS.md` (mục 1.7 + thêm mục 2.11 cho module
   `positions`/`assignment_groups`), `WORKFLOW_LOG.md` (append, không sửa đè), README nếu có nhắc
   cấu trúc entity.

---

## 8. Checklist verify trước khi báo "xong" (đúng `SKILL_FILE_MANAGEMENT.md` + custom instructions)

- [ ] `tsc --noEmit` sạch cả `backend/` và `frontend/`.
- [ ] `nest build` (backend) và `next build` (hoặc tối thiểu `tsc --noEmit`) chạy thật, dán kết
      quả thật.
- [ ] `jest` toàn bộ suite — dán số liệu thật (bao nhiêu suite/test pass), đặc biệt các spec liên
      quan `permissions.service.spec.ts`, `customers.service.spec.ts`, `roles.service.spec.ts`.
- [ ] Test tay bằng Postman/Swagger: 1 user KHÔNG có Position vẫn hoạt động y hệt trước khi có
      plan này (regression quan trọng nhất).
- [ ] Test tay: user có Position `content` (Employee/Marketing) → API `/customers` response
      KHÔNG chứa key `salesUserId`/`marketingUserId`/`assignedDate`/`closedDate`.
- [ ] Test tay: cùng user trên, UI Chi tiết KH chỉ hiện 2 tab Chi tiết + Ghi chú.
- [ ] Test tay: dropdown Sales/Marketing ở trang Khách hàng cho kết quả giống hệt trước khi migrate
      sang Assignment Group Config.
- [ ] Cập nhật `PERMISSIONS.md` trong cùng lượt nếu có thay đổi thật.

---

## 9. Ngoài phạm vi plan này (Out of scope — không tự ý làm thêm)

- **KHÔNG** đổi hành vi picker "Chọn Sales nhận data" ở modal Chia data (mục 2.8) — giữ nguyên
  full danh sách user active, trừ khi chủ dự án yêu cầu riêng ở phiên khác.
- **KHÔNG** cho phép override tổ hợp Department × Position cùng lúc (mục 2.2) — chỉ 3 tầng tuyến
  tính đúng yêu cầu gốc.
- **KHÔNG** tự thêm `element_key` mới ngoài 7 key ở mục 3.5 mà không có yêu cầu nghiệp vụ cụ thể
  — catalogue này cố định, mở rộng khi có tính năng mới thật sự cần, kèm migration seed (đúng
  triết lý bảng `permissions` gốc).
- **KHÔNG** đổi cơ chế Action Permission (`role_permissions`) theo hướng opt-out — giữ nguyên
  default deny, chỉ trục UI Visibility mới là opt-out (mục 2.1).
