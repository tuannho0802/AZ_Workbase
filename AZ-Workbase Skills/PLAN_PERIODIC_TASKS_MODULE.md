# 📐 PLAN: Module "Công việc định kỳ" (Periodic Tasks — Daily / Weekly / Monthly / Yearly)

> **Trạng thái tài liệu:** Kế hoạch (CHƯA code). Viết SAU KHI `git clone` bản mới nhất
> (commit `beecdf1`, 2026-09-14) và đọc trực tiếp code thật — không suy đoán từ transcript.
> **Người xác nhận business rule:** Chủ dự án (qua chat, xem mục 1).
> **Phải đọc trước khi code:** `PERMISSIONS.md` (đặc biệt mục 1.7, 1.8), `SKILL_NESTJS_BACKEND.md`,
> `SKILL_DATABASE_MANAGEMENT.md` mục 5 (quy trình migration bắt buộc), `SKILL_FILE_MANAGEMENT.md`.

---

## 0. Đối chiếu với code thật (căn cứ viết plan — KHÔNG suy đoán)

| Khẳng định trong plan | Bằng chứng trong code (đã đọc trực tiếp) |
|---|---|
| RBAC động 3 tầng Position → Department → Global, scope `own/department/all/none` | `database/entities/role-permission.entity.ts`, `common/guards/permission.guard.ts` |
| Chặn thật ở `PermissionGuard` qua `@RequirePermission('resource.action')`, gắn sẵn `request.permissionScope` | `common/guards/permission.guard.ts`, `common/decorators/require-permission.decorator.ts` |
| Phạm vi phòng ban dùng bảng nhiều-nhiều `department_managers`, KHÔNG dùng cột đơn `departments.manager_user_id` (đã deprecated) | `database/entities/department-manager.entity.ts` |
| Pattern chuẩn áp filter Xem/Sửa theo scope (tái dùng cho module mới) | `modules/customers/helpers/customer-access.helper.ts` (`applyViewFilter`, `canManageCustomer`) |
| Pattern "Trạng thái tự quản lý qua Admin" (thay ENUM cứng) đã có sẵn 2 lần | `database/entities/customer-status.entity.ts`, `modules/leave-types/` — cả hai cùng 1 khuôn: `code/name/description/isSystem/color/sortOrder`, permission `{resource}.manage` + `{resource}.delete`, `GET` không cần permission (mở cho mọi user đã đăng nhập để đổ dropdown) |
| Pattern "1 chính + N phụ" đã có sẵn 2 lần, KHÔNG cần bịa mới | `database/entities/customer.entity.ts` (`salesUserId` = chính, cột đơn) + `database/entities/customer-assignment.entity.ts` (lịch sử phụ, có transfer/reclaim) — **hoặc** `database/entities/link-group-secondary-manager.entity.ts` (đơn giản hơn: bảng join thuần add/remove, KHÔNG giữ lịch sử) |
| Phê duyệt (approve) trong dự án này **ĐÃ BỎ** bảng role-pair cứng, chuyển 100% sang permission-scope + `department_managers`, KHÔNG có bảng "approver matrix" riêng | `modules/leave-requests/leave-requests.service.ts` — `isEligibleApprover()`, xem comment dòng 18-20 xác nhận rõ đã thay `ELIGIBLE_APPROVER_ROLES` cứng |
| `UiVisibilityRule` (ẩn field theo Role×Phòng ban×Vị trí) **đã có entity nhưng CHƯA có service/logic strip field nào chạy thật** — Phase 3 của plan khác còn dở dang | `PERMISSIONS.md` mục 1.8 ghi rõ "Phase 3 (UI Visibility Rules) CHƯA làm"; `database/entities/ui-visibility-rule.entity.ts` tồn tại nhưng không có module `ui-visibility` nào gọi nó ngoài entity — xác nhận qua `find modules -maxdepth 1` có thư mục `ui-visibility/` nhưng chỉ chứa DTO, chưa có consumer thật cho field-hide |
| Soft delete bắt buộc, không hard-delete | `SKILL_DATABASE_MANAGEMENT.md` mục "Common Mistakes to Avoid", đối chiếu `customer.entity.ts` có `deletedAt` |
| Migration mới nhất tại thời điểm viết plan | `1781800000000-CreateDepartmentManagers.ts` |
| README gốc có nhắc "Task Management (C Tier)" là tính năng generic **khác**, còn treo trong roadmap lịch sử | `README_AZWORKBASE_PROJECT.md` mục "Phase 2 (Deferred)" |

> ⚠️ **Bắt buộc với Agent thực thi plan này ở MỖI phase:** `git pull` lại lần nữa và
> `ls backend/src/database/migrations | sort | tail -5` để lấy timestamp thật — các số migration
> ở mục 7 chỉ là **dự kiến tại thời điểm viết plan** (base = `1781800000000`), có thể đã có người
> khác thêm migration mới hơn trong lúc bạn đọc file này (10 tài khoản dùng chung repo).

### 0.1. Vì sao đặt tên `periodic_tasks`, không phải `tasks`

`README_AZWORKBASE_PROJECT.md` (roadmap lịch sử) có nhắc tới 1 module **"Task Management" (C Tier)**
generic — đây là tính năng KHÁC (task/project chung chung kiểu Asana), chưa chắc sẽ không được làm
trong tương lai. Nếu đặt bảng là `tasks` ngay bây giờ, khi module generic đó ra đời sau này sẽ xung
đột tên bảng/domain, phải đổi tên + migrate lại toàn bộ dữ liệu — rủi ro không cần thiết. Đặt tên
`periodic_tasks` ngay từ đầu (rõ nghĩa: "việc định kỳ theo chu kỳ D/W/M/Y") để 2 khái niệm không bao
giờ giẫm chân nhau, kể cả nếu sau này có module Task generic riêng.

---

## 1. Tóm tắt chốt nghiệp vụ (theo đúng xác nhận của chủ dự án, không suy diễn thêm)

1. **KHÔNG có engine tự sinh lặp lại (recurrence).** Mỗi Task (dù gắn nhãn Daily/Weekly/Monthly/
   Yearly) đều do **User tự tay tạo thủ công** qua form — tuỳ Role/Position có quyền tạo hay không.
   → Bỏ hẳn khái niệm `task_templates`/`recurrence_config` đã đề cập ở bản research trước; chỉ còn
   **1 bảng thực thể duy nhất** `periodic_tasks` (không tách Template/Instance nữa vì không còn gì
   để "sinh tự động").
2. **Phân cấp Daily → Weekly → Monthly → Yearly** vẫn cần, nhưng:
   - **Cho phép skip-level** (Daily link thẳng lên Monthly, bỏ qua Weekly).
   - **Cho phép multi-parent** (1 Daily có thể vừa thuộc Weekly A vừa thuộc Weekly B, hoặc vừa
     thuộc Weekly lẫn Monthly cùng lúc).
   - → Về bản chất đây là **DAG (đồ thị có hướng không chu trình)**, không phải cây đơn thuần. Thiết
     kế phải dùng **bảng join cạnh** (edge table), không phải cột `parent_id` đơn.
3. **Không cần cơ chế sinh instance** (pre-generate/on-demand) — đã loại bỏ theo mục 1, hoàn toàn
   thủ công.
4. **Checklist con kiểu Trello — TÁCH RIÊNG thành 1 phase sau**, không nằm trong phạm vi core MVP
   của plan này (xem mục 7, Phase 6).
5. **Trạng thái (status) phải Dynamic** — Admin tự thêm/bớt trạng thái qua UI (không phải ENUM cứng
   `pending/completed/not_completed`), đúng y hệt pattern `customer_statuses`/`leave_types` đã có
   sẵn trong repo.
6. **1 người phụ trách chính + N người phụ trách phụ** cho mỗi Task (giống Sales chính/phụ).
7. **% hoàn thành tự động tính** theo tỷ lệ con đã xong / tổng số con **trực tiếp** (không đệ quy
   xuyên nhiều tầng cộng dồn phức tạp — ví dụ nêu ra: Monthly có 10 Daily con, 1 Daily xong (trạng
   thái "hoàn thành") → Monthly hiển thị 10%). Tính **live** qua query aggregate tại thời điểm đọc,
   không lưu cache (tránh lệch dữ liệu khi Task con đổi trạng thái mà quên đồng bộ cache).
8. **RBAC đầy đủ + ẩn field liên quan Customer nếu role không có quyền** (`customers.view`/
   `customers.create`/`customers.edit`) — ẩn CẢ BE lẫn UI, không chỉ FE giấu đi.
9. **Approve/gate theo permission tuỳ biến riêng** (không phải bảng role-pair cứng kiểu nghỉ phép
   bản cũ đã bị thay thế — dùng đúng cơ chế permission-scope hiện tại của `leave_requests.approve`).
10. **Sửa template giữa chừng** → không áp dụng nữa vì không còn Template (mục 1). Thay vào đó, quy
    tắc tương đương: sửa 1 Task đã có (đổi tiêu đề/mô tả/kỳ hạn...) **không được** tự động sửa các
    Task khác đã link vào nó — mỗi Task là 1 bản ghi độc lập, chỉ có QUAN HỆ (không phải bản sao).
11. **RBAC module này dùng chung Dynamic RBAC engine hiện có**, với permission key riêng theo
    resource `periodic_tasks` (xem mục 4).
12. **Audit riêng cho module này** — bảng `periodic_task_audit_logs` tách khỏi `audit_logs` chung,
    để dễ tra cứu lịch sử theo từng Task mà không lẫn với audit toàn hệ thống.
13. **Naming bảng: `periodic_tasks`** — lý do ở mục 0.1.

---

## 2. Nguyên tắc thiết kế bắt buộc — ĐỌC KỸ TRƯỚC KHI CODE

### 2.1. Đây là 1 THỰC THỂ duy nhất, không tách Template/Instance

Khác với bản research ban đầu (giả định có recurrence engine), bản chốt nghiệp vụ (mục 1.1) xác nhận
**không có sinh tự động** — nên **KHÔNG tạo bảng `periodic_task_templates`**. Mỗi lần Admin/User bấm
"Tạo Task Daily hôm nay" là 1 dòng mới trong `periodic_tasks`, độc lập hoàn toàn, không tham chiếu
ngược về 1 "khuôn mẫu" nào. Việc đơn giản hoá này giúp:
- Không cần cron/job nền (đỡ 1 lớp phức tạp — nhắc lại: dự án chạy Vercel serverless, theo comment
  thật trong `modules/audit/audit.service.ts` là **không có tiến trình nào sống đủ lâu để tự kích
  hoạt cron**, nên may mắn là loại bỏ hẳn nhu cầu cron cho module này luôn, tránh lặp lại rủi ro đã
  từng gặp ở module Audit).
- DB dễ đọc hơn nhiều: 1 bảng chính `periodic_tasks` là đủ để hiểu "đây là 1 công việc cụ thể".

### 2.2. Phân cấp là DAG (multi-parent + skip-level) — dùng bảng cạnh, có chống chu trình

`period_type` là ENUM **CỐ ĐỊNH trong code** (không phải catalog Admin tự thêm như status), vì đây
là thứ tự cấu trúc cứng dùng để validate quan hệ cha-con:

```ts
enum PeriodType { DAILY = 'daily', WEEKLY = 'weekly', MONTHLY = 'monthly', YEARLY = 'yearly' }
const PERIOD_RANK: Record<PeriodType, number> = { daily: 1, weekly: 2, monthly: 3, yearly: 4 };
```

Bảng `periodic_task_links` (child_task_id, parent_task_id) là **cạnh của 1 đồ thị có hướng**. Khi tạo
1 liên kết mới, Service PHẢI:
1. Validate `PERIOD_RANK[parent.periodType] > PERIOD_RANK[child.periodType]` (parent phải "lớn kỳ
   hạn hơn" — skip-level OK, nhưng không cho phép ngang hàng hoặc ngược chiều, vd Weekly không được
   làm cha của Monthly).
2. **Chống chu trình (cycle detection)**: trước khi lưu cạnh `(child, parent)`, chạy BFS/DFS từ
   `parent` đi ngược lên theo các cạnh đã có (`parent` của `parent`...) — nếu gặp lại `child` giữa
   đường, nghĩa là thêm cạnh này sẽ tạo vòng lặp → từ chối (400 Bad Request, thông báo rõ ràng).
   Vì tối đa chỉ 4 tầng (`PERIOD_RANK` chặn ngay từ bước 1 rồi) nên độ sâu duyệt cực nhỏ, không lo
   hiệu năng.
3. Không cho phép trùng cạnh (`UNIQUE(child_task_id, parent_task_id)`).

**Vì sao không dùng closure table đầy đủ:** với độ sâu tối đa cố định là 4 (do `PERIOD_RANK` chặn
cứng), 1 bảng cạnh (edge list) + truy vấn đệ quy nhẹ (CTE `WITH RECURSIVE` hoặc N query lồng nhau
tối đa 3 lần) là đủ nhanh và **dễ debug hơn nhiều** so với closure table (giảm số bảng, giảm rủi ro
đồng bộ sai giữa bảng gốc và bảng closure). Đúng tinh thần yêu cầu "bền vững và dễ debug" của chủ dự
án.

### 2.3. % hoàn thành — tính LIVE, chỉ tính theo con TRỰC TIẾP, không đệ quy cộng dồn

Với ví dụ chủ dự án đưa ra (Monthly có 10 Daily con trực tiếp, 1 Daily "hoàn thành" → Monthly = 10%):
công thức là **đếm con trực tiếp** (không lặn xuống cháu/chắt để cộng dồn lại lần nữa — nếu Weekly đã
tự có % riêng của nó dựa trên Daily con của Weekly, thì Monthly **không** cộng % của Weekly con vào,
mà Monthly tính % của chính nó dựa trên toàn bộ con trực tiếp của Monthly, bất kể con đó là Weekly
hay Daily nhảy cóc — đây là hệ quả tự nhiên của mô hình DAG multi-parent, số Daily nhảy cóc lên thẳng
Monthly và Weekly cũng làm con của Monthly đều được đếm ngang nhau ở tầng Monthly).

```sql
SELECT
  COUNT(*) AS total_children,
  SUM(CASE WHEN s.is_done_state = 1 THEN 1 ELSE 0 END) AS done_children
FROM periodic_task_links l
JOIN periodic_tasks t ON t.id = l.child_task_id AND t.deleted_at IS NULL
JOIN periodic_task_statuses s ON s.id = t.status_id
WHERE l.parent_task_id = :taskId
  AND s.is_excluded_from_rollup = 0;
-- % = done_children / total_children * 100 (nếu total_children = 0 → không hiển thị % / hiển thị "chưa có việc con")
```

Vì `status` là **catalog động** (Admin tự thêm), không thể hardcode "status nào tính là xong" theo
`code` cứng trong logic — 2 cột mới bắt buộc trên `periodic_task_statuses`:
- `is_done_state boolean` — status này có tính là "đã hoàn thành" cho tử số rollup không (Admin có
  thể có nhiều status cùng coi là "xong", vd "Hoàn thành" và "Hoàn thành sớm").
- `is_excluded_from_rollup boolean` — status này có bị loại khỏi cả tử số lẫn mẫu số không (vd
  "Đã huỷ" — không tính là xong, cũng không tính là "còn treo", loại hẳn khỏi phép chia).

Tính **live tại thời điểm đọc** (không lưu cột `progress_percent` trên `periodic_tasks`), lý do: nếu
lưu cache, mỗi lần đổi status 1 Task con phải nhớ tìm NGƯỢC toàn bộ cha (kể cả multi-parent, skip-
level) để cập nhật lại — dễ quên 1 nhánh giữa nhiều lần sửa code sau này (rủi ro y hệt bug thật đã
từng xảy ra với `getAssigned()` thiếu filter, ghi trong `PERMISSIONS.md` mục 3 lịch sử: quên đồng bộ
1 chỗ → bug âm thầm). Đánh đổi: query aggregate mỗi lần xem chi tiết — chấp nhận được vì độ sâu tối
đa 4 tầng, số con trực tiếp mỗi Task hiếm khi vượt vài chục.

### 2.4. Ẩn field liên quan Customer — dùng permission CÓ SẴN, KHÔNG phụ thuộc `UiVisibilityRule` (Phase 3 chưa xong)

Theo bằng chứng ở mục 0 (`UiVisibilityRule` mới có entity, chưa có service/consumer thật), **không
được** xây plan này phụ thuộc vào 1 hạ tầng generic đang dở dang của plan khác — sẽ tự khoá chính
plan này vào tiến độ của 1 việc không liên quan. Thay vào đó, module `periodic-tasks` **tự thực hiện
kiểm tra trực tiếp**, độc lập:

1. Permission MỚI `periodic_tasks.link_customer` — bật/tắt **tính năng** "cho phép gắn Khách hàng
   vào Task" ở tầng UI. Không có quyền này → FE ẩn hẳn phần chọn Customer trong form Task, BE cũng
   chặn `POST/DELETE .../customers` (403).
2. Ngay cả khi CÓ `periodic_tasks.link_customer`, danh sách Customer để CHỌN (search/select nhanh)
   vẫn phải chạy qua **`CustomerAccessHelper.applyViewFilter()` y hệt module Customer** — không tự
   viết bộ lọc riêng (tránh lệch quyền giữa 2 module, đúng nguyên tắc "1 nguồn áp filter duy nhất").
   → Người chỉ có `customers.view` scope=`own` thì trong Task cũng chỉ tìm/chọn được đúng Customer
   của họ, không phải toàn bộ Customer trong hệ thống.
3. Ở response GET Task, field `linkedCustomers` (nếu có) chỉ trả về những Customer mà **người đang
   xem** có quyền thấy — chạy lại `applyViewFilter`/`canManageCustomer` cho từng Customer đã link,
   Customer nào ngoài phạm vi thì **xoá khỏi mảng trả về** (không trả `null`/ẩn theo tên — xoá hẳn
   phần tử, đúng nguyên tắc "ẩn ở BE là xoá khỏi response, không phải trả rỗng" học từ
   `PLAN_POSITION_...` mục 2.5).
4. Nếu user hoàn toàn không có `customers.view` (không scope nào) → xoá hẳn key `linkedCustomers`
   khỏi object trả về (không phải mảng rỗng `[]` — mảng rỗng vẫn để lộ "trường này tồn tại", đúng lo
   ngại chủ dự án nêu).

### 2.5. "1 chính + N phụ" — chọn theo mẫu `link_group_secondary_managers` (không theo `customer_assignments`)

2 mẫu có sẵn trong repo khác nhau ở 1 điểm: `customer_assignments` giữ **lịch sử đầy đủ**
(transferred/reclaimed/lý do — vì nghiệp vụ "chia data khách" cần biết ai từng sở hữu), còn
`link_group_secondary_managers` là **bảng join thuần** (add/remove, không giữ lịch sử) vì nghiệp vụ
không yêu cầu.

→ Chọn mẫu **`link_group_secondary_managers`** cho Task: nghiệp vụ "phụ trách phụ 1 công việc" gần
với "quản lý phụ 1 group" hơn là "chia quyền sở hữu khách hàng" (không có khái niệm transfer/reclaim
cho người phụ trách phụ 1 Task). Nếu sau này chủ dự án cần xem lịch sử "ai từng được thêm/gỡ khỏi
Task nào, khi nào" — dùng đúng `periodic_task_audit_logs` (mục 2.6) để tra, không cần trường riêng.

- **Chính**: cột đơn `periodic_tasks.primary_assignee_id` (bắt buộc, NOT NULL).
- **Phụ**: bảng `periodic_task_secondary_assignees` (task_id, user_id, added_by_id, created_at) —
  hard delete khi gỡ (không soft-delete, đúng mẫu gốc).

### 2.6. Audit riêng — mirror schema `audit_logs` nhưng bảng độc lập, có thêm `task_id` FK trực tiếp

```
periodic_task_audit_logs (id, task_id FK→periodic_tasks ON DELETE CASCADE, user_id, action,
  old_data JSON, new_data JSON, ip_address, user_agent, created_at)
```

Khác `audit_logs` chung (`entity_type` + `entity_id` rời rạc, phải JOIN thủ công) — ở đây có FK thật
`task_id` trực tiếp, cho phép `GET /periodic-tasks/:id/audit-logs` join thẳng, nhanh và rõ ràng hơn
khi debug 1 Task cụ thể. Log các action: `created`, `updated`, `status_changed`, `primary_assignee_
changed`, `secondary_assignee_added`, `secondary_assignee_removed`, `parent_linked`, `parent_
unlinked`, `customer_linked`, `customer_unlinked`, `locked` (approve, xem Phase 5), `unlocked`,
`deleted`, `restored`.

### 2.7. Xoá — theo đúng quy ước chung của dự án

`periodic_tasks.delete` là permission riêng (seed mặc định CHỈ role `admin` = `all`, các role khác
KHÔNG có dòng nào — đúng mẫu `customers.delete`/`leave_requests.delete` đã seed trong migration cũ).
Soft delete (`deleted_at`), không hard-delete. Task đã xoá mềm **vẫn giữ nguyên các cạnh
`periodic_task_links`** trỏ tới nó (không cascade xoá cạnh) nhưng mọi query rollup/list PHẢI luôn có
`AND t.deleted_at IS NULL` — đúng như ví dụ SQL ở mục 2.3.

### 2.8. Không đụng vào cơ chế RBAC/entity hiện có

Module này **CHỈ THÊM bảng mới**, không sửa `customers`, `role_permissions`, `department_managers`,
v.v. Điểm chạm duy nhất với module khác: đọc (không ghi) `customers`, `users`, `departments`,
`department_managers` để JOIN/validate. Nếu cần thêm quyền mới liên quan Customer (mục 2.4), đó LUÔN
là permission MỚI riêng của `periodic_tasks` — không sửa lại permission catalogue của module
`customers`.

---

## 3. Thiết kế Schema (DB) — chi tiết từng bảng

```
periodic_task_statuses          (catalog động, Admin CRUD — mirror customer_statuses)
├─ id PK
├─ code            VARCHAR(50) UNIQUE      -- vd 'pending', 'completed', 'not_completed'
├─ name            VARCHAR(100)
├─ description     VARCHAR(255) NULL
├─ color           VARCHAR(20) DEFAULT '#1890ff'
├─ is_system       BOOLEAN DEFAULT FALSE   -- bảo vệ 3 status seed sẵn khỏi bị xoá
├─ is_done_state          BOOLEAN DEFAULT FALSE  -- tính vào tử số rollup %
├─ is_excluded_from_rollup BOOLEAN DEFAULT FALSE -- loại khỏi cả tử số lẫn mẫu số
├─ sort_order      INT DEFAULT 0
├─ created_at, updated_at

periodic_tasks                  (thực thể chính — 1 dòng = 1 công việc cụ thể)
├─ id PK
├─ title                VARCHAR(255) NOT NULL
├─ description          TEXT NULL
├─ period_type           ENUM('daily','weekly','monthly','yearly') NOT NULL   -- cố định trong code
├─ period_start_date     DATE NOT NULL
├─ period_end_date       DATE NOT NULL     -- daily: = start; weekly: start+6; monthly: cuối tháng; yearly: 31/12
├─ status_id             INT FK→periodic_task_statuses NOT NULL
├─ primary_assignee_id   INT FK→users NOT NULL           -- "chính"
├─ department_id         INT FK→departments NULL          -- auto-fill từ phòng ban của primary_assignee lúc tạo
├─ created_by_id         INT FK→users NOT NULL
├─ updated_by_id         INT FK→users NULL
├─ is_locked             BOOLEAN DEFAULT FALSE  -- Phase 5 (approve/gate)
├─ locked_by_id          INT FK→users NULL
├─ locked_at             DATETIME NULL
├─ lock_note             VARCHAR(500) NULL
├─ completed_at          DATETIME NULL
├─ note                  TEXT NULL
├─ deleted_at            TIMESTAMP NULL     -- soft delete
├─ created_at, updated_at
├─ INDEX (period_type), INDEX (status_id), INDEX (primary_assignee_id),
│  INDEX (department_id), INDEX (period_start_date), INDEX (deleted_at)

periodic_task_links              (cạnh DAG — liên kết phân cấp optional, multi-parent, skip-level)
├─ id PK
├─ child_task_id    INT FK→periodic_tasks(id) ON DELETE CASCADE
├─ parent_task_id   INT FK→periodic_tasks(id) ON DELETE CASCADE
├─ created_by_id    INT FK→users
├─ created_at
├─ UNIQUE (child_task_id, parent_task_id)
├─ INDEX (child_task_id), INDEX (parent_task_id)

periodic_task_secondary_assignees  ("phụ" — mirror link_group_secondary_managers)
├─ id PK
├─ task_id      INT FK→periodic_tasks(id) ON DELETE CASCADE
├─ user_id      INT FK→users(id) ON DELETE CASCADE
├─ added_by_id  INT FK→users(id) ON DELETE SET NULL, NULL
├─ created_at
├─ UNIQUE (task_id, user_id)

periodic_task_customers          (link N-N tới Customer — "Khách hôm nay: 1, 2, 3")
├─ id PK
├─ task_id       INT FK→periodic_tasks(id) ON DELETE CASCADE
├─ customer_id   INT FK→customers(id) ON DELETE CASCADE
├─ linked_by_id  INT FK→users(id)
├─ created_at
├─ UNIQUE (task_id, customer_id)
├─ INDEX (task_id), INDEX (customer_id)

periodic_task_audit_logs         (audit riêng cho module này — xem mục 2.6)
├─ id PK
├─ task_id      INT FK→periodic_tasks(id) ON DELETE CASCADE
├─ user_id      INT FK→users
├─ action       VARCHAR(50)
├─ old_data     JSON NULL
├─ new_data     JSON NULL
├─ ip_address   VARCHAR(45) NULL
├─ user_agent   TEXT NULL
├─ created_at
├─ INDEX (task_id), INDEX (created_at)
```

**(Phase 6 — sau, TÁCH RIÊNG khỏi core, chỉ liệt kê để không quên khi làm tiếp):**
```
periodic_task_checklist_items    (kiểu Trello — item phẳng, KHÔNG có vòng đời/không recurring riêng)
├─ id, task_id FK, content VARCHAR(500), is_done BOOLEAN DEFAULT FALSE,
│  position INT, created_by_id, created_at, updated_at
```

---

## 4. Permission catalogue (seed qua migration, theo đúng khuôn `resource.action`)

| Permission key | supportsScope | Mặc định seed (Admin/Assistant/Manager/Employee) | Ghi chú |
|---|---|---|---|
| `periodic_tasks.view` | true (own/department/all) | all/all/department/own | Xem danh sách + chi tiết |
| `periodic_tasks.create` | true | all/all/department/own | Tạo Task mới (form thủ công) |
| `periodic_tasks.edit` | true | all/all/department/own | Sửa Task, đổi status, gán chính/phụ, tạo/gỡ liên kết cha-con |
| `periodic_tasks.delete` | true, nhưng CHỈ seed cho Admin | all / _(không seed)_ / _(không seed)_ / _(không seed)_ | Xoá mềm — đúng quy ước "chỉ Admin" |
| `periodic_tasks.link_customer` | false (nhị phân) | bật/bật/tắt/tắt *(cần chủ dự án chốt mặc định Manager/Employee — xem mục 8)* | Bật/tắt TÍNH NĂNG gắn Khách hàng vào Task ở UI (xem mục 2.4) |
| `periodic_tasks.approve` | true (own/department/all) | all/all/department/_(không seed)_ | Khoá (lock/approve) 1 Task — Phase 5 |
| `periodic_task_statuses.manage` | false | bật/bật/tắt/tắt | CRUD trạng thái (mirror `customer_statuses.manage`) |
| `periodic_task_statuses.delete` | false | bật/tắt/tắt/tắt | Xoá trạng thái — chỉ Admin (mirror `customer_statuses.delete`) |

`GET /periodic-task-statuses` **không gắn** `@RequirePermission()` (mirror `customer-statuses.
controller.ts` — mở cho mọi user đã đăng nhập để đổ dropdown chọn trạng thái khi tạo/sửa Task).

---

## 5. API Endpoints dự kiến (`periodic-tasks.controller.ts`)

| Method + Path | Permission | Scope filter áp dụng |
|---|---|---|
| `GET /periodic-tasks` | `periodic_tasks.view` | `PeriodicTaskAccessHelper.applyViewFilter()` (mirror `CustomerAccessHelper`) |
| `GET /periodic-tasks/:id` | `periodic_tasks.view` | như trên, 404 nếu ngoài phạm vi |
| `GET /periodic-tasks/:id/rollup` | `periodic_tasks.view` | trả `{ totalChildren, doneChildren, percent }` (mục 2.3) |
| `POST /periodic-tasks` | `periodic_tasks.create` | — |
| `PATCH /periodic-tasks/:id` | `periodic_tasks.edit` | qua `findOne()` trước (đúng pattern "1 cổng gác") |
| `DELETE /periodic-tasks/:id` | `periodic_tasks.delete` | Admin only |
| `POST /periodic-tasks/:id/links` (body: `parentTaskId`) | `periodic_tasks.edit` | validate rank + cycle (mục 2.2) |
| `DELETE /periodic-tasks/:id/links/:parentTaskId` | `periodic_tasks.edit` | |
| `GET /periodic-tasks/:id/children` | `periodic_tasks.view` | liệt kê con trực tiếp |
| `GET /periodic-tasks/:id/parents` | `periodic_tasks.view` | liệt kê cha trực tiếp (multi-parent) |
| `POST /periodic-tasks/:id/secondary-assignees` | `periodic_tasks.edit` | |
| `DELETE /periodic-tasks/:id/secondary-assignees/:userId` | `periodic_tasks.edit` | |
| `POST /periodic-tasks/:id/customers` (body: `customerIds[]`) | `periodic_tasks.edit` + `periodic_tasks.link_customer` | mỗi `customerId` phải pass `CustomerAccessHelper` (mục 2.4.2) |
| `DELETE /periodic-tasks/:id/customers/:customerId` | như trên | |
| `PATCH /periodic-tasks/:id/lock` (Phase 5) | `periodic_tasks.approve` | department scope qua `department_managers` |
| `PATCH /periodic-tasks/:id/unlock` (Phase 5) | `periodic_tasks.approve` | |
| `GET /periodic-tasks/:id/audit-logs` | `periodic_tasks.view` | |
| `GET/POST/PATCH/DELETE /periodic-task-statuses` | xem mục 4 | mirror `customer-statuses.controller.ts` y hệt |

---

## 6. Phân kỳ thực hiện (Phase) — mỗi Phase = 1 lần code + build + test riêng, không dồn hết 1 lần

> Lý do bắt buộc phải chia nhỏ (đúng yêu cầu chủ dự án): 10 tài khoản dùng chung repo, mỗi Phase kết
> thúc phải chạy `tsc --noEmit` + `nest build` + `jest` **sạch 100%** trước khi coi là xong, viết 1
> dòng vào `WORKFLOW_LOG.md`, rồi mới sang Phase kế — tránh 1 lần đổi quá lớn gây conflict dồn dập
> với các phiên Claude khác đang code song song.

### Phase 1 — Nền tảng: Status catalog + Task CRUD cơ bản + RBAC view/create/edit/delete
- Migration: tạo `periodic_task_statuses` (+ seed 3 status hệ thống: `pending`/`completed`/
  `not_completed`, `is_done_state` đúng cho `completed`), tạo `periodic_tasks`, seed 4 permission
  `periodic_tasks.view/create/edit/delete` + 2 permission `periodic_task_statuses.manage/delete`.
- Entity, DTO (`CreatePeriodicTaskDto`, `UpdatePeriodicTaskDto`, filter DTO), Service, Controller,
  Module cho cả `periodic-tasks` và `periodic-task-statuses` (2 module con, giống `customers` +
  `customer-statuses` tách riêng).
- `PeriodicTaskAccessHelper.applyViewFilter()` (mirror `CustomerAccessHelper`, dùng `department_
  managers` cho scope `department`, dùng `primaryAssigneeId`/`createdById` cho scope `own`).
- **Spec bắt buộc:** service (CRUD + scope own/department/all + admin bypass), controller (guard
  đúng permission key), access helper (unit test riêng từng nhánh scope).
- **Không** có liên kết cha-con, không Customer, không phụ trách phụ ở Phase này — cố tình để giữ
  Phase nhỏ, dễ review.

### Phase 2 — Liên kết phân cấp DAG (multi-parent, skip-level) + Rollup %
- Migration: tạo `periodic_task_links`.
- `PeriodicTaskLinksService`: validate rank (mục 2.2 bước 1), cycle detection (bước 2), CRUD cạnh.
- Endpoint `GET /:id/rollup`, `GET /:id/children`, `GET /:id/parents`.
- **Spec bắt buộc:** cycle detection (test cả trường hợp cố tình tạo vòng lặp phải bị chặn), skip-
  level hợp lệ, rank sai chiều bị chặn, rollup % đúng công thức mục 2.3 (test cả case
  `is_excluded_from_rollup`), rollup khi `total_children = 0`.

### Phase 3 — Gắn Customer vào Task (kèm ẩn field theo quyền)
- Migration: tạo `periodic_task_customers`, seed permission `periodic_tasks.link_customer`.
- Service: validate từng `customerId` qua `CustomerAccessHelper` (đọc, không sửa file gốc — import
  dùng lại).
- Response DTO: xoá key `linkedCustomers` nếu thiếu quyền (mục 2.4 bước 4).
- **Spec bắt buộc:** không có `link_customer` → 403 khi POST, có quyền nhưng customer ngoài phạm vi
  scope → 400/403 (không cho gắn "chui"), response ẩn đúng field khi thiếu `customers.view`.

### Phase 4 — Phụ trách chính/phụ
- Migration: thêm cột `primary_assignee_id` (đã có từ Phase 1 thực ra — xem lại: **đặt
  `primary_assignee_id` NOT NULL ngay từ Phase 1** vì đây là field lõi bắt buộc của Task, không phải
  tính năng phụ; migration Phase 4 CHỈ tạo bảng `periodic_task_secondary_assignees`).
- Service add/remove phụ trách phụ, mirror `LinkGroupSecondaryManager`.
- **Spec bắt buộc:** add/remove, unique constraint (không thêm trùng), primary khác secondary
  (không cho gán cùng 1 user vừa chính vừa phụ — validate ở service).

### Phase 5 — Approve/Lock (tuỳ chọn, có thể lùi lại nếu chủ dự án muốn ưu tiên phần khác trước)
- Migration: thêm cột `is_locked/locked_by_id/locked_at/lock_note` vào `periodic_tasks`, seed
  permission `periodic_tasks.approve`.
- Service: `lock()`/`unlock()`, kiểm tra quyền qua `department_managers` giống hệt
  `isEligibleApprover()` của `leave-requests.service.ts` (KHÔNG bịa bảng role-pair mới).
- Quy tắc nghiệp vụ cần chốt thêm trước khi code (xem mục 8, câu hỏi 3): khoá 1 Task có tự động khoá
  luôn các Task con của nó không, hay chỉ khoá đúng Task đang thao tác?
- **Spec bắt buộc:** eligible approver đúng theo scope, task đã lock thì `PATCH .../edit` bị chặn
  sửa (trừ Admin?), audit log ghi đúng action `locked`/`unlocked`.

### Phase 6 — Checklist con kiểu Trello (tách riêng theo đúng yêu cầu chủ dự án — làm SAU CÙNG)
- Migration: tạo `periodic_task_checklist_items`.
- CRUD item phẳng trong 1 Task, không có quyền/scope riêng (thừa hưởng quyền `periodic_tasks.edit`
  của chính Task cha — không cần permission riêng cho checklist).
- **Spec bắt buộc:** CRUD + reorder (`position`), không rò rỉ checklist của Task ngoài phạm vi xem.

### Phase 7 (cuối) — Audit log riêng, hoàn thiện toàn module
- Migration: tạo `periodic_task_audit_logs`.
- `PeriodicTaskAuditService.logAction()` (mirror `AuditService.logAction()`), gọi ở TẤT CẢ service
  action từ Phase 1→6 (create/update/delete/link/unlink/lock/unlock/checklist...) — **quay lại rà
  soát toàn bộ Phase trước để gắn log đầy đủ**, không chỉ áp dụng cho action mới từ Phase 7 trở đi.
- **Spec bắt buộc:** mỗi action chính ở Phase 1-6 đều có ít nhất 1 dòng audit tương ứng (test bằng
  cách gọi service thật rồi query lại bảng audit).

---

## 7. Migration list dự kiến (timestamp CHỈ là placeholder — phải `ls` lại thật trước khi code)

| # | Timestamp dự kiến (base sau `1781800000000`) | Tên | Phase |
|---|---|---|---|
| 1 | `1781900000000` | `CreatePeriodicTaskStatuses` | 1 |
| 2 | `1782000000000` | `CreatePeriodicTasks` | 1 |
| 3 | `1782100000000` | `SeedPeriodicTasksPermissions` | 1 |
| 4 | `1782200000000` | `CreatePeriodicTaskLinks` | 2 |
| 5 | `1782300000000` | `CreatePeriodicTaskCustomers` | 3 |
| 6 | `1782400000000` | `AddPeriodicTaskLinkCustomerPermission` | 3 |
| 7 | `1782500000000` | `CreatePeriodicTaskSecondaryAssignees` | 4 |
| 8 | `1782600000000` | `AddPeriodicTaskLockColumns` | 5 |
| 9 | `1782700000000` | `AddPeriodicTasksApprovePermission` | 5 |
| 10 | `1782800000000` | `CreatePeriodicTaskChecklistItems` | 6 |
| 11 | `1782900000000` | `CreatePeriodicTaskAuditLogs` | 7 |

---

## 8. Câu hỏi còn mở — cần chốt trước khi bắt đầu Phase tương ứng (không tự suy đoán)

1. **`periodic_tasks.link_customer` mặc định cho Manager/Employee** nên bật hay tắt? (mục 4 đang để
   trống — ảnh hưởng UX ngay từ ngày đầu triển khai Phase 3.)
2. **`department_id` của Task** tự auto-fill theo phòng ban của `primary_assignee_id` lúc tạo — cho
   phép Admin/Manager đổi tay sau đó không, hay khoá cứng theo người phụ trách chính?
3. **Phase 5 (lock):** khoá 1 Task cha có tự động khoá luôn Task con (cascade lock) không, hay mỗi
   Task tự lock độc lập (Weekly bị khoá không ảnh hưởng gì tới Daily con của nó)?
4. **Task đã bị khoá (`is_locked=true`)** — Admin có được sửa "vượt rào" không, hay tuyệt đối không
   ai sửa được cho tới khi unlock (kể cả Admin)?
5. **Có cần filter theo khoảng thời gian tuỳ ý** (vd xem tất cả Task Daily trong tháng 9) ở
   `GET /periodic-tasks`, hay chỉ cần filter theo `period_type` + `period_start_date` đơn lẻ?

---

## 9. Checklist trước khi bắt đầu code MỖI Phase (bắt buộc, áp dụng cho mọi Agent/tài khoản)

- [ ] `git pull` lại repo, đọc lại đúng file entity/migration liên quan (không tin trạng thái ghi
      trong plan này nếu đã cách lúc viết quá lâu).
- [ ] `ls backend/src/database/migrations | sort | tail -5` lấy timestamp thật, không dùng số ở
      mục 7 nếu đã có migration mới hơn.
- [ ] Đọc lại đúng mục 2 (nguyên tắc) tương ứng Phase sắp làm trước khi viết dòng code đầu tiên.
- [ ] Sau khi code xong Phase: chạy `tsc --noEmit`, `nest build`, `jest <module liên quan>` — dán
      kết quả PASS thật, không mô tả suông.
- [ ] Ghi 1 entry mới vào `WORKFLOW_LOG.md` (không sửa/xoá entry cũ, chỉ append) mô tả Phase vừa
      xong, file đã đổi, kết quả test.
- [ ] KHÔNG bắt đầu Phase kế tiếp trong cùng 1 lượt nếu Phase hiện tại chưa build+test sạch.
