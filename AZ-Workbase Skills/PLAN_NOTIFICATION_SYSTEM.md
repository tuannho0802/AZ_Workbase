# 🔔 PLAN: Hệ thống Thông báo (Notification) — Tự động + Thủ công

> **Trạng thái:** DỰ THẢO v2. **Phase 0 + 1 đã xong (2026-09-21)** — xem `WORKFLOW_LOG.md`. Mục 11 vẫn chờ chủ dự án chốt (Phase 1 dùng đề xuất mặc định). **Đã lệch plan:** 5.1/11.13 `is_read` là cột ghi được (không phải cột sinh) — lý do trong WORKFLOW_LOG.
> **v2 (2026-09-21):** thêm **Thông báo thủ công** (kiểu "email nội bộ": người gửi chọn 1/nhiều/toàn bộ user, theo dõi ai đã đọc/chưa đọc). Các mục có thay đổi/thêm mới được đánh dấu **[MỚI v2]**.
> **Đối chiếu code:** HEAD `f8ea812` (2026-09-21; commit này chỉ sửa `roles.service.spec.ts`). Mọi khẳng định "hiện trạng" ở mục 0 đều đọc trực tiếp từ code/lệnh thật.
> **Vị trí đặt file:** `AZ-Workbase Skills/PLAN_NOTIFICATION_SYSTEM.md` (cùng chỗ các `PLAN_*.md` khác).

---

## 0. Đối chiếu code thật (căn cứ viết plan)

| # | Hiện trạng đã xác minh | Hệ quả cho thiết kế |
|---|---|---|
| 0.1 | Backend chạy **Vercel serverless** (`backend/vercel.json`, builder `@vercel/node`). `AuditService.logActionAsync()` dùng `waitUntil()` của `@vercel/functions`; comment đầu `audit.service.ts` ghi rõ "không có process sống lâu, không có cron tự chạy". | **Không** dùng WebSocket/SSE tự host, không dùng `@nestjs/schedule`, không pub/sub in-memory giữa các request. Xem mục 2.3. |
| 0.2 | `AuditModule` là `@Global()` → mọi service inject `AuditService` không cần import module. | Làm `NotificationsModule` `@Global()` theo đúng mẫu → tránh phụ thuộc vòng `customers ↔ notifications`. |
| 0.3 | Có **2 bảng audit**: `audit_logs` (customer, note, deposit, assignment…) và `periodic_task_audit_logs` (task, FK `task_id`). Cả hai có endpoint dọn dẹp/xoá hàng loạt của Admin. | Notification **không** được suy ra từ audit log. Xem 2.1. |
| 0.4 | Customer có ~14 điểm ghi audit trong `customers.service.ts` (CREATE/UPDATE/DELETE/RESTORE/HARD_DELETE_CUSTOMER, CREATE/UPDATE/DELETE_NOTE, CREATE/DELETE_DEPOSIT, ASSIGN_CUSTOMER, UPDATE_ASSIGNMENT, RECLAIM_ASSIGNMENT) + `IMPORT_CUSTOMERS` ở `customers.import.service.ts`. | Danh sách "điểm móc" (hook point). Không có `.transaction(` trong `customers.service.ts` → emit ngay sau `save()` là đủ. |
| 0.5 | Task có 17 action chuẩn hoá trong `PeriodicTaskAuditAction`. | Danh mục event Task ánh xạ gần 1-1 vào enum này. |
| 0.6 | `bulkAssign(customerIds[], salesUserIds[])` ghi audit trong vòng `forEach` (1 dòng/khách). | **Không** notify từng dòng; gộp theo người nhận (mục 4.3). |
| 0.7 | Customer có `salesUserId`, `marketingUserId`, `createdById`; `customer_assignments` (ACTIVE = sales được chia). Task có `primaryAssigneeId`, `createdById`, `periodic_task_secondary_assignees`, `periodic_task_customers`. | Cơ sở xác định "người nhận theo quan hệ" (mục 4.2). |
| 0.8 | FE `customers/page.tsx` **đã có** deep-link `/customers?id=<id>`. Trang Công việc định kỳ **chưa có** deep-link nào. | Giữ `?id=`, thêm tham số mới `focus` (mục 7.3). |
| 0.9 | Bảng Customer phân trang server-side; trang Task có 3 view không phân trang (`limit: 100`, lọc giao khoảng kỳ). | Khó khăn thật của "nhảy tới đúng bản ghi" → mục 7.4. |
| 0.10 | FE đã polling 60s cho badge sidebar; `QueryClient` mặc định `refetchOnWindowFocus: false`. Header ở `(dashboard)/layout.tsx`. | Chuông đặt cạnh ngày/avatar; tái dùng pattern polling. |
| 0.11 | Mẫu cron nội bộ: `zk-device-cron.controller.ts` (`CRON_SECRET`, so sánh `!==`). `vercel.json` có 1 cron `keep-alive` ngày 1 lần. (`storage-cron.controller.ts` được nhắc trong `storage.service.ts` nhưng **file không tồn tại**.) | Dọn thông báo cũ = 1 controller cron theo mẫu `zk-device-cron`. |
| 0.12 | `PermissionGuard` **cho qua** khi endpoint không khai `@RequirePermission`. `antd` = **6.3.5**, `next` = 16.2.1. | Inbox cá nhân chỉ cần `JwtAuthGuard`; dùng API antd 6. |
| 0.13 **[MỚI]** | `PermissionGuard` gắn `request.permissionScope` (`own`/`department`/`all`), đọc bằng decorator `@GetPermissionScope()` (đã dùng ở `users.controller.ts`). Permission mới = migration `INSERT INTO permissions` + `INSERT INTO role_permissions … SELECT … FROM roles r, permissions p WHERE r.code IN (…)` (mẫu `1782100000000-SeedPeriodicTasksPermissions.ts`, `1783200000000-SplitPeriodicTasksAuditViewPermission.ts`). | Quyền gửi/xem thông báo thủ công đi qua **đúng cơ chế RBAC động hiện có**, có scope, cấu hình được ở `/phan-quyen`. Xem 6.7. |
| 0.14 **[MỚI]** | `GET /users/all` **cố tình không gắn permission** và trả **mọi user `isActive`** (kèm `department`, `position`), không lọc scope (`users.service.findEmployees`). Ngược lại `GET /users` lọc bằng `UsersAccessHelper.applyViewFilter(qb, userId, role, scope)` (Manager = phòng ban mình quản lý qua `department_managers` + chính mình; Employee = chính mình). | FE có thể đổ danh sách chọn người nhận từ `/users/all`, nhưng **BE bắt buộc tự kiểm scope người nhận lúc gửi** — không được tin danh sách FE gửi lên (nếu không, Manager gửi được cho user ngoài phòng ban). Tái dùng `UsersAccessHelper`. |
| 0.15 **[MỚI]** | Migration mới nhất trong repo: `1783200000000`. Không có module/entity `notification*` nào đang tồn tại (đã `grep`). | Không xung đột tên. Vẫn phải `ls` lại trước khi tạo file. |

---

## 1. Tóm tắt nghiệp vụ

1. **Thông báo tự động (Automation)** — hệ thống tự ghi nhận một số hành động rồi gửi thông báo **riêng** cho đúng người liên quan. **Chỉ chọn một số hành động.**
2. **Người nhận phụ thuộc quan hệ/vị trí** (Sales phụ trách, Marketing phụ trách…), có thể bật/tắt theo từng người.
3. **Phạm vi tự động trước mắt:** (a) Customer & liên quan; (b) Task & liên quan.
4. **Bấm vào thông báo tự động → đi thẳng tới đúng Khách hàng / Task**, phần đó **nhấp nháy 2–3 lần rồi giữ viền khác biệt**.
5. **[MỚI v2] Thông báo thủ công (Manual)** — giống email nội bộ:
   - Người gửi (Admin hoặc role/vị trí được cấp quyền) soạn **tiêu đề + nội dung**, chọn **1 người / nhiều người / toàn bộ user** làm người nhận.
   - Mỗi người nhận có trạng thái **đã đọc / chưa đọc** (cột `is_read`).
   - Người gửi (và role có quyền xem) **kiểm tra được ai đã đọc, ai chưa** cho từng thông báo đã gửi.
   - Thông báo thủ công dùng **chung hộp thư (chuông) và cơ chế polling** với thông báo tự động — người nhận chỉ có 1 nơi để xem.

**Ngoài phạm vi Phase đầu (chỉ chừa chỗ mở rộng):** email/Telegram/Zalo, digest, realtime bên thứ ba, cấu hình rule theo Vị trí bởi Admin, thông báo cho Nghỉ phép/Chấm công/Nhóm liên kết, lên lịch gửi hẹn giờ, file đính kèm, trả lời/hội thoại 2 chiều.

---

## 2. Research & quyết định kiến trúc

### 2.1. Nguồn sự thật: bảng `notifications` riêng, KHÔNG suy ra từ audit log

| Phương án | Ưu | Nhược | Kết luận |
|---|---|---|---|
| A. Đọc `audit_logs`/`periodic_task_audit_logs` rồi sinh thông báo | Không sửa call site | 2 schema khác nhau; action thô; Admin dọn log là mất; audit best-effort; khó xác định người nhận | ❌ |
| B. Gọi thẳng `notificationsService.emit()` tại từng call site, **module `@Global()`** giống `AuditModule` | Đơn giản, cùng mẫu code đã có; call site đã có sẵn entity | Phải nhớ gọi ở ≈30 điểm — giảm rủi ro bằng danh mục event có kiểu + test | ✅ **Chọn** |
| C. `@nestjs/event-emitter` | Tách rời hơn | Thêm dependency, listener bất đồng bộ trên serverless vẫn phải `waitUntil` | ⏸ Dự phòng |
| D. Transactional outbox + worker | Đảm bảo không mất | Cần worker tần suất cao; Vercel Hobby chỉ cron 1 lần/ngày | ⏸ Khi "mất thông báo" là không chấp nhận được |
| E. Hàng đợi ngoài (BullMQ/QStash) | Retry, tách tải | Thêm hạ tầng + chi phí | ⏸ Khi quy mô/kênh ngoài tăng |

Đánh đổi chấp nhận với **thông báo tự động**: ghi **best-effort** (`waitUntil`, lỗi chỉ log).

**[MỚI v2] Thông báo thủ công dùng chế độ khác:** ghi **đồng bộ, trong 1 transaction** (mục 6.7). Lý do: người gửi cần biết chắc "đã gửi tới N người" và cần trang theo dõi đọc/chưa đọc chính xác; mất thông báo thủ công im lặng là không chấp nhận được, khác với thông báo tự động (chỉ mang tính nhắc việc).

### 2.2. Mô hình lưu: 1 dòng / 1 người nhận (fan-out on write)

Người nhận mỗi sự kiện tự động rất ít (≤ ~10) nên ghi trực tiếp mỗi người 1 dòng. Đọc inbox = `WHERE recipient_id = ?`, đếm chưa đọc bằng index `(recipient_id, read_at)`.

**[MỚI v2] Thông báo thủ công cũng fan-out 1 dòng/người** — đây chính là thứ tạo ra cột `is_read` theo từng người, và là lý do chọn fan-out thay vì "1 dòng chung + bảng đã đọc": trang theo dõi chỉ là `GROUP BY`/`WHERE` trên cùng bảng, không cần thêm cơ chế. Khác với tự động, thông báo thủ công có thêm **bảng cha `notification_broadcasts`** (1 dòng/lần gửi) giữ nội dung một lần duy nhất, tránh nhân bản nội dung dài × N người.

Các mẹo giữ nguyên: cursor pagination `(sort_at, id)`; gộp (coalesce) khi chưa đọc (chỉ tự động); idempotency `UNIQUE (recipient_id, dedupe_key)`; dọn dẹp định kỳ.

### 2.3. Cách đẩy tới trình duyệt: **polling nhẹ** (Phase đầu)

Trên Vercel, WebSocket native mới ở beta (06/2026), gắn với **một function instance**, đóng khi hết `maxDuration` và **không fan-out sang thiết bị/tab/người dùng khác**; SSE chịu trần thời lượng function. Thông báo của dự án là "A làm → **B** nhận" nên các cơ chế này không đáp ứng. **Chọn polling 30–60s** bằng React Query (dừng khi tab ẩn, refetch khi focus). Pusher/Ably là tuỳ chọn Phase 7. Thông báo thủ công đi qua đúng kênh polling này (độ trễ ≤ 60s).

---

## 3. Nguyên tắc thiết kế BẮT BUỘC

1. **Thông báo tự động không bao giờ làm hỏng nghiệp vụ chính.** `emit()` không throw; lỗi → `Logger.error` (không `console.*`).
2. **Chỉ emit SAU KHI ghi DB xong** (sau `save()` thành công).
3. **Không tự thông báo cho chính người thực hiện** (`recipient ≠ actor`), chỉ gửi cho user `isActive`.
4. **Thông báo TỰ ĐỘNG không lưu PII/số tiền**: cấm SĐT, email, số tiền FTD; chỉ tên khách/tiêu đề task, tên người thực hiện, tên trạng thái. **[MỚI v2]** Thông báo THỦ CÔNG là văn bản do người gửi tự viết nên hệ thống không kiểm soát được nội dung: form soạn có dòng cảnh báo "Không đưa SĐT/email/số tiền của khách vào nội dung", và mọi lần gửi đều ghi audit (mục 6.7).
5. **Người nhận LUÔN do BE quyết định.** Tự động: suy từ quan hệ thật. **[MỚI v2]** Thủ công: người gửi chọn, nhưng BE **resolve lại và kiểm scope** (`UsersAccessHelper`), không tin danh sách FE.
6. **IDOR:** endpoint inbox lấy `recipientId` từ JWT, không từ param/body. Đọc/sửa/xoá thông báo của người khác → 404. **[MỚI v2]** Endpoint theo dõi (`/notification-broadcasts/:id…`) kiểm quyền theo scope của `notification_broadcasts.view`: scope không đủ → **404** (không lộ sự tồn tại).
7. **Quyền truy cập bản ghi được kiểm tra lúc CLICK**, không lúc gửi.
8. **Render text an toàn:** `title/body` chỉ render dạng text (`white-space: pre-wrap`), **cấm** `dangerouslySetInnerHTML`; BE cắt độ dài: tự động `title ≤ 200`, `body ≤ 500`; **thủ công** `title ≤ 200`, `body ≤ 2000`.
9. **Migration:** timestamp mới **lớn hơn** timestamp lớn nhất sau `git pull` + `ls` (hiện `1783200000000`); `up()/down()` đối xứng; `synchronize: false`; cột nullable khai `type` tường minh; boolean dùng `BooleanTransformer`. **Không** tự chạy migration lên DB thật.
10. **FE:** `App.useApp()` (không `message`/`notification` tĩnh), API antd 6 (`title`); gating bằng `can('permission.key')`, không hardcode role.
11. **[MỚI v2] Thông báo thủ công luôn "bắt buộc"** (`mandatory`): người nhận **không tắt được** qua tuỳ chọn cá nhân — nếu không, trạng thái đọc/chưa đọc và mục đích "thông báo toàn công ty" mất ý nghĩa.
12. **[MỚI v2] Người nhận được chốt (snapshot) tại thời điểm gửi.** User được tạo sau đó **không** nhận thông báo "toàn bộ" cũ. Ghi rõ trên UI để tránh hiểu nhầm.
13. **[MỚI v2] Không để mất dấu vết đọc:** người nhận "xoá" thông báo thủ công khỏi hộp thư chỉ **ẩn** (`dismissed_at`), không xoá dòng — nếu xoá, người gửi sẽ thấy sai số liệu. Dọn dẹp định kỳ cũng không đụng thông báo thủ công trong thời hạn lưu (mục 6.6).

---

## 4. Danh mục sự kiện (Event catalog)

### 4.1. Cách đọc bảng
- **Quan hệ (relation)** = vai trò của người nhận đối với bản ghi tại thời điểm xảy ra sự kiện.
- **Bắt buộc** = người dùng không tắt được. Còn lại tắt/bật được trong tuỳ chọn cá nhân.
- **Gộp** = coalesce khi chưa đọc. "Điểm móc" = chỗ code hiện ghi audit.

### 4.2. Quan hệ người nhận (`RecipientRelation`)

| Miền | Relation | Lấy từ đâu |
|---|---|---|
| Customer | `CUSTOMER_PRIMARY_SALES` | `customer.salesUserId` |
| Customer | `CUSTOMER_MARKETING_OWNER` | `customer.marketingUserId` |
| Customer | `CUSTOMER_SHARED_SALES` | `customer_assignments` status ACTIVE |
| Customer | `CUSTOMER_CREATOR` | `customer.createdById` |
| Customer | `ASSIGNEE_NEW` / `ASSIGNEE_PREVIOUS` | người được gán / bị thay |
| Task | `TASK_PRIMARY_ASSIGNEE` | `task.primaryAssigneeId` |
| Task | `TASK_SECONDARY_ASSIGNEE` | `periodic_task_secondary_assignees` |
| Task | `TASK_CREATOR` | `task.createdById` |
| Task | `TASK_ASSIGNEE_NEW` / `TASK_ASSIGNEE_PREVIOUS` | phụ trách mới/cũ |
| **[MỚI]** Manual | `MANUAL_RECIPIENT` | người được người gửi chọn (đã BE resolve + kiểm scope) |

Nội dung thông báo tự động có **biến thể theo relation**. Ví dụ `customer.created`:
- `CUSTOMER_PRIMARY_SALES`: "**{actor}** vừa tạo khách hàng **{name}** và giao cho bạn phụ trách."
- `CUSTOMER_MARKETING_OWNER`: "**{actor}** vừa tạo khách hàng **{name}** (Marketing phụ trách: bạn)."

### 4.3. Customer

| Event | Điểm móc (audit hiện có) | Người nhận (mặc định) | Bắt buộc | Gộp |
|---|---|---|---|---|
| `customer.created` | `CREATE_CUSTOMER` | sales chính, marketing | Có (nếu được chỉ định) | — |
| `customer.assigned` | `ASSIGN_CUSTOMER` (`bulkAssign()`) | người được gán (phân biệt "Sales phụ trách chính" / "Sales được chia") | **Có** | **Gộp theo lần gọi** |
| `customer.assignment_changed` | `UPDATE_ASSIGNMENT` | người mới, người cũ, sales chính | Có (mới/cũ) | — |
| `customer.assignment_reclaimed` | `RECLAIM_ASSIGNMENT` | người bị thu hồi lượt | Có | — |
| `customer.owner_changed` | `UPDATE_CUSTOMER` khi `salesUserId`/`marketingUserId` đổi | phụ trách mới, cũ | Có | — |
| `customer.updated` | `UPDATE_CUSTOMER` | sales chính, marketing, sales được chia | Không | Có (theo khách) |
| `customer.note_created` | `CREATE_NOTE` | sales chính, marketing, sales được chia (trừ tác giả) | Không | Có (theo khách) |
| `customer.deleted` | `DELETE_CUSTOMER` (xoá mềm) | sales chính, marketing, sales được chia | Không | — |

- **`customer.updated`**: chỉ báo khi đổi field thuộc **allowlist**: `status`, `salesUserId`, `marketingUserId`, `closedDate`, `departmentId`. Field khác **im lặng**. So sánh dùng `before`/`saved` ở `update()` (`buildCustomerAuditSnapshot`).
- **`customer.assigned` (batch)**: `bulkAssign` biết sẵn `targetUsers` và `authorizedCustomers` → **1 lần `emit` cho mỗi người nhận**: "Bạn được chia **N** khách hàng". N = 1 → đích trỏ thẳng khách; N > 1 → `params.entityIds` (≤ 50) và đích là danh sách (7.3).
- **Mặc định TẮT (Phase sau):** `UPDATE_NOTE`, `DELETE_NOTE`, `RESTORE_CUSTOMER`, `CREATE/DELETE_DEPOSIT` (không đưa số tiền), `IMPORT_CUSTOMERS`, `HARD_DELETE_CUSTOMER`.

### 4.4. Task (Công việc định kỳ)

| Event | Action audit tương ứng | Người nhận (mặc định) | Bắt buộc | Gộp |
|---|---|---|---|---|
| `task.created` | `created` | phụ trách chính (nếu ≠ người tạo) | Có | — |
| `task.primary_changed` | `primary_assignee_changed` | phụ trách mới, cũ | Có | — |
| `task.secondary_added` | `secondary_assignee_added` | người được thêm | **Có** | — |
| `task.secondary_removed` | `secondary_assignee_removed` | người bị gỡ | Có | — |
| `task.status_changed` | `status_changed` | phụ trách chính, phụ, người tạo (trừ actor) | Không | — |
| `task.updated` | `updated` | phụ trách chính, phụ | Không | Có (theo task) |
| `task.customer_linked` / `_unlinked` | `customer_linked/unlinked` | phụ trách chính, phụ | Không | Có |
| `task.checklist_changed` | `checklist_item_added/updated/removed` | phụ trách chính, phụ (trừ actor) | Không | **Có** (theo task) |
| `task.locked` / `task.unlocked` | `locked/unlocked` | phụ trách chính, phụ | Không | — |
| `task.deleted` | `deleted` | phụ trách chính, phụ, người tạo | Không | — |

- `checklist_items_reordered` **im lặng**. `task.updated`: chỉ báo khi đổi `title`, `periodStartDate/EndDate`, `description`.
- **Phase sau:** `parent_linked/unlinked`; **"khách hàng liên quan update" (chéo miền)** — cần chủ dự án chốt (11.9).

### 4.5. **[MỚI v2]** Thông báo thủ công

| Event | Nguồn | Người nhận | Bắt buộc | Gộp |
|---|---|---|---|---|
| `manual.broadcast` | `POST /notification-broadcasts` (người có quyền `notification_broadcasts.send` soạn tay) | do người gửi chọn: **USERS** (1 hoặc nhiều user), **DEPARTMENTS** (mọi user active của các phòng ban chọn), **ALL** (toàn bộ user active, trừ người gửi) | **Có** (nguyên tắc 11) | **Không** (mỗi lần gửi là 1 thông báo độc lập) |

- `category = 'manual'`, `relation = 'MANUAL_RECIPIENT'`, `actor_id = người gửi`.
- Người gửi **không tự nhận bản của mình** (loại khỏi danh sách; nếu sau khi loại mà rỗng → 400). Muốn tự thử, gửi cho user khác/tài khoản test.
- **Ràng buộc scope người gửi** (chi tiết 6.7): `all` → mọi loại đối tượng; `department` → chỉ user thuộc phòng ban mình quản lý (`UsersAccessHelper`), **không** có lựa chọn ALL; scope `own`/không có quyền → 403.

---

## 5. Thiết kế Database

### 5.1. Bảng `notifications` (mỗi người nhận 1 dòng) — **có bổ sung v2**

```sql
CREATE TABLE notifications (
  id               INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,   -- INT (không BIGINT) để TypeORM không trả về string
  recipient_id     INT NOT NULL,
  actor_id         INT NULL,                                  -- NULL = hệ thống; thủ công = người gửi
  event_type       VARCHAR(60) NOT NULL,                      -- 'customer.assigned', 'task.status_changed', 'manual.broadcast'...
  category         VARCHAR(20) NOT NULL,                      -- 'customer' | 'task' | 'manual'   [v2: thêm 'manual']
  relation         VARCHAR(40) NOT NULL,                      -- RecipientRelation
  entity_type      VARCHAR(30) NULL,                          -- 'customer' | 'periodic_task' | NULL với thông báo thủ công không đính kèm    [v2: cho phép NULL]
  entity_id        INT NULL,
  sub_entity_type  VARCHAR(30) NULL,
  sub_entity_id    INT NULL,
  broadcast_id     INT UNSIGNED NULL,                         -- [MỚI v2] FK -> notification_broadcasts; NULL với thông báo tự động
  title            VARCHAR(200) NOT NULL,
  body             VARCHAR(500) NULL,                         -- thủ công: để NULL, nội dung đầy đủ nằm ở notification_broadcasts.body
  params           JSON NULL,                                 -- snapshot KHÔNG PII (tự động); thủ công: { senderName }
  occurrences      INT NOT NULL DEFAULT 1,
  coalesce_key     VARCHAR(120) NULL,                         -- chỉ có giá trị khi CHƯA ĐỌC (đọc xong set NULL); thủ công luôn NULL
  dedupe_key       VARCHAR(120) NULL,                         -- thủ công: 'manual:<broadcastId>'
  read_at          DATETIME NULL,                             -- NGUỒN SỰ THẬT của trạng thái đọc
  is_read          TINYINT(1) GENERATED ALWAYS AS (read_at IS NOT NULL) STORED,   -- [MỚI v2] cột is_read theo yêu cầu, suy từ read_at → không thể lệch nhau
  dismissed_at     DATETIME NULL,                             -- [MỚI v2] người nhận ẩn khỏi hộp thư (chỉ dùng cho thủ công); KHÔNG ảnh hưởng is_read
  created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  sort_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE KEY uk_recipient_coalesce (recipient_id, coalesce_key),
  UNIQUE KEY uk_recipient_dedupe   (recipient_id, dedupe_key),     -- thủ công: chống tạo trùng khi retry
  KEY idx_recipient_unread (recipient_id, read_at),
  KEY idx_recipient_sort   (recipient_id, sort_at, id),
  KEY idx_entity           (entity_type, entity_id),
  KEY idx_broadcast_read   (broadcast_id, read_at),                -- [MỚI v2] thống kê đã đọc/chưa đọc theo lần gửi
  CONSTRAINT fk_notif_recipient FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_notif_actor     FOREIGN KEY (actor_id)     REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_notif_broadcast FOREIGN KEY (broadcast_id) REFERENCES notification_broadcasts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Ghi chú:
- **Gộp khi chưa đọc (tự động):** MySQL không có unique index từng phần → `coalesce_key` nullable, đọc xong set `NULL`. Sự kiện gộp: `INSERT … ON DUPLICATE KEY UPDATE occurrences = occurrences + 1, sort_at = NOW(3), …`. Sự kiện không gộp: `INSERT IGNORE` trên `dedupe_key`.
- **`is_read` là cột sinh (STORED generated column), không phải cột ghi được.** Entity khai `@Column({ type: 'tinyint', insert: false, update: false, transformer: new BooleanTransformer() })`. Migration **viết tay** (không dựa `migration:generate` cho cột này); sau khi viết, chạy `migration:generate` thử — phải ra **rỗng** (nếu TypeORM đòi diff cột sinh thì bỏ khai `asExpression`, giữ cột đọc-thuần). Nếu chủ dự án muốn cột `is_read` ghi được độc lập thì xem quyết định 11.13.
- Truy vấn nặng nhất (đếm chưa đọc) vẫn dùng `read_at IS NULL` + `dismissed_at IS NULL` trên index `(recipient_id, read_at)`; `is_read` phục vụ báo cáo/đọc dữ liệu thủ công.
- **Không khai `@OneToMany` ngược** từ `User`/`Customer`/`PeriodicTask`.

### 5.2. **[MỚI v2]** Bảng `notification_broadcasts` (1 dòng / 1 lần gửi thủ công)

```sql
CREATE TABLE notification_broadcasts (
  id               INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  sender_id        INT NULL,                                  -- SET NULL khi user bị xoá cứng (vẫn giữ lịch sử)
  title            VARCHAR(200) NOT NULL,
  body             TEXT NOT NULL,                             -- ≤ 2000 ký tự (validate ở DTO), plain text
  audience_type    VARCHAR(20) NOT NULL,                      -- 'USERS' | 'DEPARTMENTS' | 'ALL'
  audience_params  JSON NULL,                                 -- { userIds: [...] } | { departmentIds: [...] } | NULL với ALL
  entity_type      VARCHAR(30) NULL,                          -- tuỳ chọn: đính kèm liên kết tới Khách hàng/Task (xem 11.16)
  entity_id        INT NULL,
  recipient_count  INT NOT NULL DEFAULT 0,                    -- số người nhận thực tế (snapshot lúc gửi)
  created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  KEY idx_sender_created (sender_id, created_at),
  KEY idx_created (created_at),
  CONSTRAINT fk_broadcast_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

- `audience_params` lưu **bộ lọc người gửi đã chọn** (để hiển thị "Gửi tới: 3 phòng ban") — danh sách người nhận thật nằm ở các dòng `notifications` (snapshot).
- Không lưu số đã đọc: **tính live** bằng `COUNT … WHERE broadcast_id = ? GROUP BY is_read` (index `idx_broadcast_read`), tránh counter lệch.
- Thứ tự tạo bảng trong migration: `notification_broadcasts` **trước** `notifications` (FK).

### 5.3. Bảng `notification_preferences` (tuỳ từng người, mô hình opt-out)

```sql
CREATE TABLE notification_preferences (
  user_id     INT NOT NULL,
  event_type  VARCHAR(60) NOT NULL,
  enabled     TINYINT(1) NOT NULL,        -- BooleanTransformer trong entity
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, event_type),
  CONSTRAINT fk_notifpref_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```
Chỉ có dòng khi người dùng **khác mặc định**. Event `mandatory` (gồm **`manual.broadcast`**) bỏ qua cấu hình tắt. Tắt = **không tạo dòng** thông báo.

### 5.4. Chừa chỗ (chưa làm)
- `notification_rules(event_type, relation, position_id NULL, department_id NULL, enabled)` — Admin cấu hình theo Vị trí/Phòng ban (Phase 7).
- `notification_deliveries(notification_id, channel, status, …)` — kênh email/Telegram.
- **[MỚI v2]** `notification_broadcasts.scheduled_at` (hẹn giờ gửi), `require_ack` (bắt buộc bấm "Đã hiểu") — chưa làm, xem 11.14.

---

## 6. Thiết kế Backend

### 6.1. Cấu trúc module (mirror `audit`)
```
backend/src/modules/notifications/
  notifications.module.ts          @Global()
  notifications.service.ts         emit(), list(), poll(), markRead(), markAllRead(), remove(), cleanup()
  notifications.controller.ts      /notifications/*  (JwtAuthGuard)
  notifications-cron.controller.ts /notifications-cron/cleanup (CRON_SECRET, mẫu zk-device-cron)
  notification-preferences.service.ts
  catalog/event-catalog.ts         danh mục event: mặc định, mandatory, coalesce, template theo relation
  catalog/recipient-resolvers.ts   hàm thuần: (event ctx) → [{userId, relation}]
  broadcasts/                      [MỚI v2]
    notification-broadcasts.controller.ts   /notification-broadcasts/*  (PermissionGuard)
    notification-broadcasts.service.ts      preview(), send(), listSent(), getOne(), listRecipients()
    broadcast-audience.resolver.ts          (audienceDto, sender, scope) → userIds[]  — hàm thuần, dễ test
    dto/ (send-broadcast.dto.ts, preview-broadcast.dto.ts, list-recipients.dto.ts)
  dto/
backend/src/database/entities/notification.entity.ts, notification-preference.entity.ts,
                              notification-broadcast.entity.ts   [MỚI v2]
backend/src/database/migrations/<ts>-CreateNotifications.ts            (3 bảng)
backend/src/database/migrations/<ts+>-SeedNotificationBroadcastPermissions.ts   [MỚI v2]
```

### 6.2. API nội bộ cho các service khác (điểm móc — thông báo TỰ ĐỘNG)
```typescript
this.notificationsService.emit({
  type: 'customer.assigned',
  actorId: callerId,
  entity: { type: 'customer', id: customer.id },
  context: { customer, assignees: targetUsers },   // đã có sẵn tại call site
});
```
`emit()` (không throw): (1) tra catalog → (2) resolver ra `{userId, relation}` → (3) loại actor, user bị khoá → (4) áp preference (trừ mandatory) → (5) render `title/body` theo relation → (6) ghi DB một lần cho cả danh sách → bọc trong `waitUntil()` như `logActionAsync`. Resolver ưu tiên dữ liệu call site; chỉ query khi thiếu (phụ trách phụ Task = 1 query `IN`). Preference = 1 query `WHERE user_id IN (…) AND event_type = ?`.

### 6.3. Điểm móc cụ thể (Phase 2–3)
- **Task** (mirror 1-1 `PeriodicTaskAuditAction`): `periodic-tasks.service.ts`, `periodic-task-secondary-assignees.service.ts`, `periodic-task-customers.service.ts`, `periodic-task-checklist-items.service.ts`. Mỗi chỗ thêm **đúng 1 lệnh emit** cạnh `logActionAsync`.
- **Customer:** `customers.service.ts` — `create`, `update` (diff allowlist), `remove`, `createNote`, `bulkAssign` (gộp theo người nhận **bên ngoài** vòng `forEach` audit), `updateAssignment`, `reclaimAssignment`.

### 6.4. Ghi khi gộp / bão sự kiện (tự động)
- `coalesce_key = "<event_type>:<entityType>:<entityId>"`.
- Batch: tối đa 1 dòng/người/lần gọi; `params.entityIds` cắt 50.
- `dedupe_key = "<event_type>:<entityId>:<updatedAt-ms>"` cho sự kiện không gộp.

### 6.5. Endpoint hộp thư cá nhân (chỉ `JwtAuthGuard`; `recipientId` = `req.user.id`)

| Method | Path | Mục đích |
|---|---|---|
| GET | `/notifications?cursor=&limit=20&unreadOnly=&category=` | Danh sách (`dismissed_at IS NULL`), cursor `(sort_at,id)`, `limit ≤ 50`. Thông báo `manual` **JOIN `notification_broadcasts`** để trả `body` đầy đủ + `senderName` |
| GET | `/notifications/poll` | `{ unread, version }` (`version` = `MAX(sort_at)` epoch ms). 2 query có index — endpoint gọi nhiều nhất |
| PATCH | `/notifications/:id/read` | Đánh dấu đã đọc (set `read_at`, `coalesce_key = NULL`) — 404 nếu không phải của mình. Idempotent: đã đọc rồi thì **giữ nguyên `read_at` cũ** |
| PATCH | `/notifications/read-all?category=` | Đọc tất cả (theo loại) — xem 11.12 về thông báo thủ công |
| DELETE | `/notifications/:id` | **Tự động:** xoá dòng. **Thủ công [MỚI v2]:** chỉ set `dismissed_at` (nguyên tắc 13) |
| GET / PUT | `/notifications/preferences` | Tuỳ chọn cá nhân (bỏ qua `mandatory`) |
| GET | `/notifications-cron/cleanup` | Dọn dẹp, `CRON_SECRET` |

Không thêm permission key cho inbox cá nhân (mọi người dùng đăng nhập đều có hộp thư của mình). **Ghi rõ vào `PERMISSIONS.md`** để lần rà soát sau không tưởng là sót guard.

### 6.6. Dọn dẹp
Cron 1 lần/ngày (khớp Vercel Hobby), xoá theo lô `LIMIT 1000` lặp tới hết:
- **Tự động (`broadcast_id IS NULL`):** đã đọc quá **30 ngày**; chưa đọc quá **90 ngày**.
- **[MỚI v2] Thủ công:** xoá **cả lần gửi** (`DELETE FROM notification_broadcasts WHERE created_at < NOW() - INTERVAL 180 DAY`, các dòng `notifications` tự `ON DELETE CASCADE`). **Không** áp quy tắc 30/90 ngày cho thông báo thủ công, vì người gửi cần dữ liệu đọc/chưa đọc tồn tại đủ lâu để kiểm tra. Con số 180 ngày là đề xuất (11.10).
Endpoint chấp nhận `x-cron-secret` / `?secret=` (mẫu hiện có) **và** `Authorization: Bearer $CRON_SECRET` (cách Vercel Cron gọi); so sánh bằng `crypto.timingSafeEqual`.

### 6.7. **[MỚI v2]** Thông báo thủ công — Backend

**Permission mới (seed bằng migration riêng, theo mẫu `SeedPeriodicTasksPermissions`):**

| Permission | supports_scope | Ý nghĩa | Seed mặc định |
|---|---|---|---|
| `notification_broadcasts.send` | TRUE | Soạn & gửi thông báo thủ công. **Scope giới hạn PHẠM VI NGƯỜI NHẬN:** `all` = bất kỳ user active + chọn "Toàn bộ"; `department` = chỉ user thuộc phòng ban mình quản lý (theo `UsersAccessHelper`/`department_managers`), **không** có "Toàn bộ"; `own`/không dòng = không được gửi | `admin = all`, `manager = department`. **Không seed** `assistant`/`employee` (Admin tự bật ở `/phan-quyen` nếu muốn — đúng ý "tuỳ role") |
| `notification_broadcasts.view` | TRUE | Xem lịch sử thông báo đã gửi + danh sách đã đọc/chưa đọc. Scope `all` = mọi lần gửi của mọi người; các scope còn lại = **chỉ các lần do chính mình gửi** | `admin = all`, `manager = own` |

- Hai key tách riêng (theo nguyên tắc PERMISSIONS.md §1.7 "1 permission = 1 hành động rõ nghĩa") để Admin có thể cho 1 role "được gửi" nhưng "chỉ xem của mình", hoặc "xem tất cả để giám sát" mà không cho gửi.
- Quyền **thu hồi/xoá** một lần gửi (`notification_broadcasts.delete`) **chưa seed** ở đợt này — PERMISSIONS.md cấm "quyền ảo" (key không endpoint nào enforce). Sẽ thêm bằng migration riêng cùng endpoint ở Phase M3.
- Giữ lối thoát hiểm `role === 'admin'` (Root Admin) ở đủ 3 lớp (`PermissionGuard`, `RolesService.getMyPermissions()`, và helper kiểm scope người nhận). Test spec bắt buộc cho từng lớp.

**Endpoint (`/notification-broadcasts`, `JwtAuthGuard + PermissionGuard`):**

| Method | Path | Permission | Mục đích |
|---|---|---|---|
| POST | `/notification-broadcasts/preview` | `send` | Nhận đối tượng chọn → trả `{ recipientCount, sample: [5 tên đầu], excludedCount }` để hiện "Sẽ gửi tới N người" **trước khi bấm Gửi**. Không ghi DB |
| POST | `/notification-broadcasts` | `send` | Gửi. Trả `{ id, recipientCount }` |
| GET | `/notification-broadcasts?cursor=&limit=` | `view` | Lịch sử đã gửi: tiêu đề, người gửi, thời gian, loại đối tượng, `recipientCount`, `readCount`, `unreadCount`. Scope quyết định "của tôi" hay "tất cả" |
| GET | `/notification-broadcasts/:id` | `view` | Chi tiết + nội dung + thống kê. Ngoài scope → **404** |
| GET | `/notification-broadcasts/:id/recipients?status=all\|read\|unread&search=&cursor=&limit=` | `view` | Danh sách người nhận: `userId, name, department, isRead, readAt, dismissed`. Lọc theo trạng thái. Cursor theo `notifications.id` |

**Luồng `send()` (đồng bộ, 1 transaction):**
1. `@GetPermissionScope()` → `scope`. Không có quyền → 403 (do guard).
2. **Validate DTO:** `title` 1–200, `body` 1–2000 (plain text, trim), `audience.type ∈ {USERS, DEPARTMENTS, ALL}`, `userIds` ≤ 500 phần tử, `departmentIds` ≤ 50. `forbidNonWhitelisted` (đã bật toàn cục).
3. **Resolve người nhận ở BE** (`broadcast-audience.resolver`): dựng query user `isActive = true` (+ loại `deleted`/chưa duyệt như `findEmployees`), áp `UsersAccessHelper.applyViewFilter`-tương đương theo `scope` của `notification_broadcasts.send`, **loại người gửi**. Với `USERS`: nếu có id **nằm ngoài scope** → **403 kèm danh sách id bị từ chối** (không âm thầm bỏ qua — tránh người gửi tưởng đã gửi đủ). `ALL` mà scope ≠ `all` → 403.
4. **Giới hạn số người nhận:** `NOTIFICATION_BROADCAST_MAX_RECIPIENTS` (mặc định 2000). Vượt → 400. Kết quả rỗng → 400 "Không có người nhận hợp lệ".
5. **Transaction:** `INSERT notification_broadcasts` → `INSERT INTO notifications (…) SELECT …` **một câu lệnh** (hoặc lô 500 dòng nếu resolve qua id list), với `event_type='manual.broadcast'`, `category='manual'`, `relation='MANUAL_RECIPIENT'`, `dedupe_key='manual:<broadcastId>'`, `title` copy, `body` NULL → `UPDATE notification_broadcasts SET recipient_count = <số dòng thực>` → commit. Lỗi giữa chừng → rollback toàn bộ (không có "gửi được nửa chừng").
6. **Audit:** `auditService.logAction(senderId, 'SEND_NOTIFICATION_BROADCAST', 'notification_broadcast', id, null, { title, audienceType, recipientCount })` — **không ghi `body`** (tránh nhân bản văn bản tự do vào audit). Dùng `logAction` thường (không cần `waitUntil` vì đã đợi commit).
7. Trả kết quả. Người nhận thấy thông báo ở lần poll kế tiếp (≤ 60s).

**Chống lạm dụng:** `@Throttle` cho `POST /notification-broadcasts` (đề xuất 10 lần/giờ/người gửi; dùng `throttler-behind-proxy.guard.ts` đã có) — tránh một tài khoản bị chiếm quyền spam toàn công ty.

**Đọc/chưa đọc chính xác:** `PATCH /notifications/:id/read` chỉ set `read_at` **lần đầu** (`WHERE read_at IS NULL`), nên "thời điểm đọc" trong trang theo dõi là lần mở đầu tiên, không bị ghi đè.

**Người dùng mất quyền/bị khoá sau khi gửi:** không ảnh hưởng — dòng đã ghi vẫn tồn tại. User bị khoá thì trang theo dõi hiển thị tag "Đã khoá" (JOIN `users`), không tính vào tỉ lệ đọc (hiển thị riêng).

---

## 7. Thiết kế Frontend

### 7.1. Chuông + dropdown (header)
- Trong cụm phải của `Header` ở `(dashboard)/layout.tsx`, giữa ngày và avatar. Badge chưa đọc tối đa `99+`.
- Bấm chuông → `Popover`: 20 thông báo mới nhất (cursor), tab **Tất cả / Chưa đọc**, "Đọc tất cả", "Xem tất cả" → `/thong-bao`.
- Mỗi dòng: icon theo `category` (**[MỚI v2]** `manual` = icon loa/📢 + nhãn "Thông báo từ **{senderName}**"), `title`, thời gian tương đối, chấm xanh nếu chưa đọc, `×n` nếu `occurrences > 1`.
- **[MỚI v2] Bấm thông báo thủ công → mở Modal chi tiết** (không điều hướng): người gửi, thời gian, `title`, `body` (`pre-wrap`, text thuần), nút Đóng. Mở modal = gọi `PATCH /:id/read`. Nếu broadcast có đính kèm Khách hàng/Task (11.16) thì có thêm nút "Đi tới …" dùng chung `resolve-link` + highlight.
- Trang `/thong-bao` (đầy đủ + lọc loại, có nút "Ẩn" cho thông báo thủ công) và trang **Tuỳ chọn thông báo** (bật/tắt theo event; event bắt buộc — gồm `manual.broadcast` — bị khoá, kèm tooltip lý do).

### 7.2. Hook & polling
```
lib/api/notifications.api.ts
lib/api/notification-broadcasts.api.ts        [MỚI v2]
lib/hooks/useNotificationPoll.ts     // poll() 60s → nếu `version` tăng: fetch ?limit=5&unreadOnly=true → toast
lib/hooks/useNotifications.ts        // list (infinite, cursor) + mutations
lib/hooks/useNotificationBroadcasts.ts        [MỚI v2]  // preview, send, listSent, detail, recipients
lib/notifications/resolve-link.ts    // registry: (event) → {path, query}; category 'manual' → mở modal
```
- Polling: `refetchInterval: 60_000`, không poll khi tab ẩn, bật `refetchOnWindowFocus` riêng cho query này.
- Toast (antd 6 `notification.open({ title, description, onClick })` qua `App.useApp()`): không toast ở lần poll đầu; tối đa 3 toast/lần, còn lại gộp "Bạn có N thông báo mới". `lastSeenVersion` ở `sessionStorage`.
- Bấm thông báo → `PATCH /:id/read` (không chờ) → điều hướng/mở modal theo `resolveLink()`.

### 7.3. Hợp đồng URL (deep-link — thông báo TỰ ĐỘNG)

`entity_type/entity_id/sub_entity_*` lưu trong DB, FE ánh xạ bằng `resolve-link.ts`:

| Loại | URL |
|---|---|
| Khách hàng | `/customers?focus=<customerId>&nid=<notificationId>` |
| Khách hàng + ghi chú / lượt gán | `…&tab=notes` / `…&tab=assignments` (11.5) |
| Nhiều khách (batch) | `/customers?focusIds=<id1,id2,…>&nid=…` (tối đa 50) |
| Task | `/cong-viec-dinh-ky?focus=<taskId>&nid=<notificationId>` |
| Task + checklist / liên kết / lịch sử | `…&open=checklist\|links\|history` |

Giữ nguyên `?id=` hiện tại (`/chia-data`). `focus` là tham số mới: "đưa vào tầm nhìn + tô sáng". Trang đọc rồi xoá param bằng `router.replace(pathname)` và giữ đích trong state.

### 7.4. "Focus Resolver" — đưa đúng bản ghi vào tầm nhìn
Hook dùng chung `useNotificationFocus(kind)`.

**Khách hàng** (phân trang + sort):
1. Đặt lại bộ lọc & sort về mặc định — `customers/page.tsx` chưa có hàm reset chung (state riêng từng bộ lọc qua `handleFiltersChange`) → Phase 5 gom thành `resetAllFilters()` (kèm lưu bộ lọc cũ để "Khôi phục"). Sort mặc định BE: `createdAt DESC, id DESC`.
2. `GET /customers` kèm **`focusId`** (mới): BE dựng query đã lọc quyền, đếm số dòng đứng **trước** bản ghi theo `ORDER BY` mặc định → tính `page`, trả `meta.focus = { found, page }`. +1 `COUNT` chỉ khi có `focusId`.
3. Không tìm thấy → "không khả dụng" (7.6).

**Task** (3 view không phân trang, `limit: 100`, lọc giao khoảng kỳ):
1. `GET /periodic-tasks/:id` lấy `periodStartDate/EndDate`.
2. Xoá mọi bộ lọc, `dateRange = [start, end]`, giữ view đang chọn; lưu bộ lọc cũ cho "Khôi phục". Lịch tháng nhảy sang tháng của `periodStartDate`.
3. Vẫn không có trong 100 kết quả (kỳ dài như Năm) → **thẻ ghim** "Task từ thông báo".

Cả hai trang hiện banner: "Đang hiển thị theo thông báo — **[Khôi phục bộ lọc]** **[✕]**".

### 7.5. Highlight: nhấp nháy 3 lần → giữ viền khác biệt
CSS chung trong `globals.css`:
```css
@keyframes notif-flash {            /* 3 lần × 0.8s = 2.4s */
  0%, 100% { box-shadow: inset 0 0 0 2px transparent; background-color: transparent; }
  50%      { box-shadow: inset 0 0 0 2px #fa8c16;     background-color: #fff7e6; }
}
.notif-focus-flash  { animation: notif-flash 0.8s ease-in-out 3; }
.notif-focus-marked { box-shadow: inset 0 0 0 2px #fa8c16; background-color: #fffaf0; }
@media (prefers-reduced-motion: reduce) { .notif-focus-flash { animation: none; } }
```
- Dùng `inset box-shadow` (không `outline`) vì `outline` trên `<tr>` antd không nhất quán; dùng chung được cho `TaskMiniCard`.
- Table → `rowClassName` + `onRow` gắn `data-focus-key="customer:55"`; `TaskMiniCard` (một chỗ, phủ Agenda/Kanban/Lịch) + hàng view Bảng nhận prop `focused`.
- Trình tự: dữ liệu tải xong → `requestAnimationFrame` → tìm `[data-focus-key]` (thử lại ≤ ~2s) → `scrollIntoView({ block: 'center', behavior: 'smooth' })` → `notif-focus-flash` → hết animation đổi `notif-focus-marked`.
- Bỏ viền khi: bấm hàng/thẻ khác, `Esc`, ✕ trên banner, rời trang (11.6). `focusIds` tô tất cả bản ghi có trong trang.
- Trợ năng: `prefers-reduced-motion` bỏ nhấp nháy, giữ viền; `aria-live`: "Đã chuyển tới khách hàng …".

### 7.6. Trạng thái lỗi/không khả dụng
| Tình huống | Xử lý |
|---|---|
| 404 / `CustomerNotFoundException` | `message.warning` "Khách hàng không còn tồn tại hoặc bạn không còn quyền truy cập", dòng thông báo mờ + tag "Không khả dụng", không báo lỗi đỏ |
| Thông báo xoá (`*.deleted`) | `params.unavailable = true` lúc gửi → FE không điều hướng |
| Task bị khoá | Vẫn điều hướng, highlight bình thường |
| Đang đứng sẵn đúng trang | `router.push` cùng path vẫn kích hoạt hook (phụ thuộc `searchParams`) |

### 7.7. **[MỚI v2]** Thông báo thủ công — Frontend

**Menu (sidebar, `nav-config.tsx`, dùng field `permission` — không hardcode role):**
- "Gửi thông báo" → `/thong-bao/gui`, `permission: 'notification_broadcasts.send'`.
- "Thông báo đã gửi" → `/thong-bao/da-gui`, `permission: 'notification_broadcasts.view'`.
- Mỗi trang có `useEffect` redirect + `message.warning` nếu thiếu quyền (mẫu `phan-quyen/page.tsx`); chặn vào thẳng URL.

**Trang Soạn & gửi `/thong-bao/gui`:**
1. Ô **Tiêu đề** (đếm ký tự /200), ô **Nội dung** (`Input.TextArea`, đếm /2000, text thuần).
2. **Người nhận** — `Radio.Group`:
   - **Chọn người nhận:** `Select mode="multiple" showSearch` đổ từ `/users/all` (hiện tên + Tag phòng ban/vị trí, tái dùng `SalesUserSelect`-style nếu phù hợp), tối đa 500.
   - **Theo phòng ban:** `Select mode="multiple"` phòng ban.
   - **Toàn bộ nhân viên:** chỉ hiện khi `can('notification_broadcasts.send')` có scope `all` (lấy scope từ `my-permissions`); ẩn với scope `department`. (BE vẫn kiểm lại — FE chỉ là UX.)
3. Dòng cảnh báo cố định: "Không đưa SĐT/email/số tiền của khách hàng vào nội dung. Người nhận được chốt tại thời điểm gửi."
4. Bấm **Xem trước người nhận** → gọi `/preview` → hiện "Sẽ gửi tới **N** người (ví dụ: A, B, C…)"; với `ALL`/N lớn dùng `modal.confirm` xác nhận có ghi số N. Nút **Gửi** chỉ bật sau khi có preview hợp lệ; chống bấm đúp bằng `loading` + `disabled` (SKILL_NEXTJS_FRONTEND §8.2).
5. Gửi thành công → `message.success("Đã gửi tới N người")` → chuyển tới chi tiết lần gửi đó.

**Trang Thông báo đã gửi `/thong-bao/da-gui`:**
- Bảng: Tiêu đề, Người gửi (ẩn nếu scope chỉ "của tôi"), Thời gian, Đối tượng (Tag: "3 người" / "2 phòng ban" / "Toàn bộ"), **Tiến độ đọc** (`Progress` + "42/50 đã đọc"), phân trang cursor.
- Bấm dòng → **Drawer chi tiết**: nội dung đầy đủ; thẻ thống kê (Đã đọc / Chưa đọc / Đã ẩn); `Tabs` **Tất cả · Chưa đọc · Đã đọc**; bảng người nhận: Nhân viên (avatar + tên), Phòng ban, Trạng thái (Tag xanh "Đã đọc" / xám "Chưa đọc"), **Thời điểm đọc** (`HH:mm DD/MM/YYYY`), ô tìm theo tên. Người nhận đã khoá hiện tag "Đã khoá", không tính vào tỉ lệ.
- (Phase M3, tuỳ chọn) nút **"Nhắc người chưa đọc"** (11.15) và **"Xuất danh sách"**.

**Hộp thư người nhận:** như 7.1 — modal chi tiết, không cần biết người gửi có quyền gì.

---

## 8. Bảo mật & riêng tư (checklist)
- [ ] Endpoint inbox không nhận `recipientId` từ client; test đọc/sửa/xoá thông báo người khác → 404.
- [ ] Thông báo **tự động**: `params/title/body` không chứa SĐT, email, số tiền; test snapshot.
- [ ] FE render text thuần, không HTML (cả `title` và `body` thủ công).
- [ ] Người nhận tự động chỉ suy từ quan hệ thật; user `isActive = false` bị loại.
- [ ] Endpoint cron kiểm `CRON_SECRET` bằng `crypto.timingSafeEqual`.
- [ ] `emit()` không throw; test khi DB lỗi vẫn không làm hỏng request chính.
- [ ] Ghi vào `PERMISSIONS.md`: inbox cá nhân chỉ cần đăng nhập, lý do.
- [ ] **[MỚI v2]** `send()` **không tin** `userIds` từ client: test Manager (scope `department`) chọn user ngoài phòng ban → 403; chọn `ALL` → 403; Employee/không quyền → 403.
- [ ] **[MỚI v2]** `GET /notification-broadcasts/:id` và `/recipients` với lần gửi của người khác khi scope không phải `all` → **404**.
- [ ] **[MỚI v2]** Gửi không tạo dòng cho người gửi; không tạo dòng cho user khoá; không tạo trùng khi gọi lại (unique `dedupe_key`).
- [ ] **[MỚI v2]** Mọi lần gửi có audit `SEND_NOTIFICATION_BROADCAST` (không kèm `body`).
- [ ] **[MỚI v2]** `@Throttle` cho `POST /notification-broadcasts`; trần `NOTIFICATION_BROADCAST_MAX_RECIPIENTS`.
- [ ] **[MỚI v2]** Permission `notification_broadcasts.send/view` đã seed **trước** khi `@RequirePermission` dùng (key chưa seed = khoá vĩnh viễn với mọi role trừ Root Admin); Root Admin bypass còn nguyên ở 3 lớp.
- [ ] **[MỚI v2]** Cập nhật `PERMISSIONS.md`: bảng permission (mục 1.7) + section mới "2.11 Thông báo (`modules/notifications`)" mô tả scope đặc thù của `send` (giới hạn người nhận, không phải giới hạn dữ liệu xem).

---

## 9. Kế hoạch kiểm thử

**Backend (jest, 1 service = 1 file spec):**
- `notifications.service.spec.ts`: bỏ actor; bỏ user khoá; preference tắt/`mandatory`; biến thể theo relation; batch `bulkAssign` (N khách × M sales → M dòng); gộp khi chưa đọc + **tạo dòng mới sau khi đã đọc**; idempotency `dedupe_key`; cursor pagination; `poll()`; IDOR; **[MỚI v2]** `DELETE` thông báo thủ công chỉ set `dismissed_at`; `markRead` không ghi đè `read_at` cũ; `unread` không đếm dòng `dismissed_at`.
- `recipient-resolvers.spec.ts`: ma trận event × relation (Customer + Task).
- **[MỚI v2] `broadcast-audience.resolver.spec.ts`:** ma trận (scope `all`/`department`/`own`/không có) × (`USERS`/`DEPARTMENTS`/`ALL`); loại người gửi; loại user khoá; user ngoài scope → từ chối kèm danh sách id; vượt trần → 400; rỗng → 400.
- **[MỚI v2] `notification-broadcasts.service.spec.ts`:** `send()` ghi broadcast + N dòng trong 1 transaction, **rollback khi lỗi giữa chừng** (không còn broadcast mồ côi); `recipient_count` khớp số dòng thật; audit được gọi, không chứa `body`; `listSent`/`getOne`/`listRecipients` theo scope (`all` thấy hết, còn lại chỉ của mình, người khác → 404); lọc `status=read|unread`; thống kê đúng sau khi 1 người đọc.
- Spec các service nghiệp vụ hiện có: assert `notificationsService.emit` gọi đúng type/entity (mock).
- **Kiểm chứng ngược (mutation check)** như `roles.service.spec.ts`: bỏ logic thì test mới phải đỏ — đặc biệt bỏ kiểm scope người nhận thì test 403 phải đỏ.

**Frontend (vitest):** `resolve-link` (mọi loại, kể cả `manual`), `useNotificationPoll` (lần đầu không toast; tăng `version` mới toast; tối đa 3), `useNotificationFocus`, chuyển lớp `flash → marked`; **[MỚI v2]** form soạn (nút Gửi khoá tới khi có preview; ẩn "Toàn bộ" khi scope `department`; chống bấm đúp), bảng người nhận lọc tab Đã đọc/Chưa đọc.

**Tay:** 2 trình duyệt (Sales A giao → Sales B nhận); **[MỚI v2]** Admin gửi "Toàn bộ" → 2–3 tài khoản khác nhau nhận, 1 người mở, 1 người chưa mở → trang theo dõi hiển thị đúng; Manager thử gửi ngoài phòng ban → bị chặn; người nhận ẩn thông báo → người gửi vẫn thấy "đã đọc" đúng.

**Definition of Done mỗi Phase:** `tsc --noEmit` (BE+FE) sạch, `nest build`, `next build`, `jest` + `vitest` toàn bộ xanh, dán số liệu thật; **không** tự chạy migration lên DB thật.

---

## 10. Phân kỳ thực hiện (mỗi Phase = 1 lần code + build + test riêng)

| Phase | Nội dung | Quy mô | Ghi chú |
|---|---|---|---|
| **0** | Chốt mục 11; `git pull` + `ls migrations` lấy timestamp thật | S | Bắt buộc trước code |
| **1** | BE nền tảng: **3 entity** (`notifications`, `notification_preferences`, `notification_broadcasts`) + migration, `NotificationsModule` (Global), catalog, resolver, `emit()`, endpoint list/poll/read/read-all/delete, test | L | Chưa móc vào nghiệp vụ nào. **[v2]** Tạo sẵn cột `broadcast_id/dismissed_at/is_read` ngay từ đầu để khỏi phải migration sửa bảng sau |
| **2** | Móc **Task** (mirror 17 audit action, gồm coalesce checklist) | M | Làm Task trước: action đã chuẩn hoá |
| **3** | Móc **Customer**: create/update (allowlist)/remove/note/assignment + **batch `bulkAssign`** | M–L | Ca khó nhất là gộp batch |
| **4** | FE hộp thư: chuông, dropdown, `/thong-bao`, polling + toast, `resolve-link`, điều hướng cơ bản (dùng `?id=` hiện có) | M | Dùng được ngay không cần highlight |
| **M1 [MỚI v2]** | **BE thủ công:** migration seed 2 permission, `notification-broadcasts` (preview/send/list/detail/recipients), audience resolver, audit, throttle, test (mục 9) | M–L | **Chỉ phụ thuộc Phase 1** — có thể làm song song/ngay sau Phase 1, **không cần** Phase 2–3 |
| **M2 [MỚI v2]** | **FE thủ công:** modal chi tiết trong hộp thư (cần Phase 4), 2 trang `/thong-bao/gui` + `/thong-bao/da-gui`, nav gating, form + preview + Drawer theo dõi đọc/chưa đọc | M | Cần Phase 4 (chuông/poll) + M1 |
| **5** | Deep-link + highlight tự động: `useNotificationFocus`, CSS, BE `focusId` cho `GET /customers`, reset bộ lọc Task, banner, thẻ ghim, trợ năng | M | Phần tinh tế nhất |
| **6** | Tuỳ chọn cá nhân (`notification_preferences` + UI) + cron dọn dẹp (gồm quy tắc 180 ngày cho thủ công) | S–M | |
| **M3 [MỚI v2] (tuỳ chọn)** | `notification_broadcasts.delete` (thu hồi/xoá 1 lần gửi, seed key kèm endpoint), "Nhắc người chưa đọc", xuất danh sách, đính kèm Khách hàng/Task | S–M | Chỉ làm khi cần |
| **7** (tuỳ chọn) | Rule theo Vị trí/Phòng ban, thông báo chéo miền, realtime Pusher/Ably, outbox, kênh ngoài, hẹn giờ gửi | — | Chỉ khi có nhu cầu thật |

**Thứ tự đề xuất nếu muốn có Thông báo thủ công sớm nhất:** 0 → 1 → 4 → M1 → M2 → (2, 3, 5, 6 sau). Triển khai theo: migration → BE (feature flag `NOTIFICATIONS_ENABLED`; `emit()` no-op khi tắt; **[v2]** flag này cũng che các route `/notification-broadcasts` và nav item) → FE.

---

## 11. Quyết định cần chủ dự án chốt (kèm đề xuất mặc định)

**Từ v1:**
1. **`customer.created` báo cho ai?** → Sales chính + Marketing (≠ người tạo). Quản lý phòng ban: tuỳ chọn bật.
2. **Báo FTD/deposit không?** → Không ở Phase đầu; nếu có thì không kèm số tiền.
3. **`customer.updated` báo khi đổi field nào?** → Allowlist `status`, `salesUserId`, `marketingUserId`, `closedDate`, `departmentId`.
4. **Ghi chú:** chỉ báo khi **tạo**; sửa/xoá tắt mặc định?
5. **Bấm thông báo tự động thì làm gì?** → Tô sáng; với ghi chú/lượt gán/checklist **mở luôn Drawer/Modal đúng tab**. Hay chỉ tô sáng?
6. **Viền giữ tới khi nào?** → Tới khi bấm hàng khác / `Esc` / ✕ / rời trang. Hay tới hết phiên (kể cả F5)?
7. **Độ trễ 30–60s có chấp nhận được không?** → Nếu cần tức thời → Pusher/Ably ở Phase 7.
8. **Gói Vercel hiện tại (Hobby/Pro)?**
9. **Khách hàng cập nhật → báo phụ trách các Task liên kết?** → Đề xuất Phase 7.
10. **Thời hạn lưu:** tự động 30 ngày (đã đọc) / 90 ngày (chưa đọc); **[v2]** thủ công **180 ngày** kể từ lúc gửi.
11. **Kênh ngoài** (email/Telegram/Zalo) trong 6 tháng tới? → Quyết định có làm `notification_deliveries` sớm không.
12. **[v1] `task.status_changed`:** mọi thay đổi hay chỉ "Xem xét"/"Hoàn thành"?

**[MỚI v2] — riêng cho Thông báo thủ công:**

13. **Cột `is_read`:** đề xuất **cột sinh từ `read_at`** (`is_read = read_at IS NOT NULL`) — vừa có đúng cột `is_read` như bạn yêu cầu, vừa có thêm thời điểm đọc, và không thể lệch nhau. Phương án khác: `is_read` là cột ghi được độc lập (đơn giản hơn nhưng mất "đọc lúc nào" và có thể lệch nếu code quên set 1 trong 2).
14. **"Đã đọc" nghĩa là gì?** Đề xuất: người nhận **mở chi tiết** (hoặc bấm "Đọc tất cả"). Đây là dấu hiệu "đã mở", không phải bằng chứng đã đọc nội dung. Nếu cần bằng chứng chắc hơn (thông báo quan trọng/nội quy) → thêm tuỳ chọn `require_ack` (người nhận phải bấm "Đã hiểu") — Phase 7.
15. **"Đọc tất cả" có đánh dấu luôn thông báo thủ công là đã đọc không?** Đề xuất: **có** (tránh badge đỏ mãi mãi), kèm ghi chú trên UI người gửi. Phương án chặt hơn: "Đọc tất cả" **bỏ qua** thông báo thủ công, buộc mở từng cái.
16. **Ai được gửi/xem?** Đề xuất seed: `send` = Admin (`all`) + Manager (`department`); `view` = Admin (`all`) + Manager (`own`); Assistant/Employee **không seed** (Admin tự bật ở `/phan-quyen`). Có muốn Assistant được gửi mặc định không? Manager có được gửi "Toàn bộ" không (đề xuất **không**)?
17. **Đối tượng người nhận:** ngoài "chọn user" và "toàn bộ" bạn yêu cầu, đề xuất thêm **"theo phòng ban"** (rất tự nhiên cho Manager). Muốn thêm "theo Vai trò/Vị trí" không?
18. **Đính kèm liên kết Khách hàng/Task** vào thông báo thủ công (bấm vào → tới đúng bản ghi và highlight như thông báo tự động)? Đề xuất **không** ở đợt đầu (M3). Lưu ý rủi ro: người nhận có thể không có quyền xem bản ghi đó.
19. **"Nhắc người chưa đọc"** (đẩy lại thông báo lên đầu hộp thư người chưa đọc, giới hạn 1 lần/24h)? Đề xuất M3.
20. **Trần số người nhận/lần gửi và tần suất:** đề xuất tối đa **2000 người/lần**, **10 lần gửi/giờ/người gửi**. Số lượng nhân sự thực tế hiện tại là bao nhiêu?
21. **Người gửi có tự nhận bản sao không?** Đề xuất **không**; xem lại qua trang "Thông báo đã gửi".

---

## 12. Rủi ro & cách giảm

| Rủi ro | Giảm thiểu |
|---|---|
| Bão thông báo tự động (bulk assign, sửa checklist liên tục) | Gộp theo người nhận + coalesce khi chưa đọc + allowlist field |
| Mất thông báo tự động do `waitUntil` best-effort | Chấp nhận Phase đầu; outbox ở Phase 7 nếu cần |
| Người dùng mất quyền sau khi nhận thông báo | Kiểm quyền lúc click, không lộ PII trong payload tự động |
| Highlight sai khi bản ghi ở trang/bộ lọc khác | Focus Resolver (7.4) + `focusId` phía BE + thẻ ghim dự phòng |
| Quên gắn `emit()` ở điểm móc mới | Danh mục event có kiểu; test ma trận; checklist khi thêm action audit mới |
| Chi phí polling | 1 endpoint 2 query có index, 60s, dừng khi tab ẩn |
| Trùng timestamp migration (10 tài khoản cùng làm) | Luôn `ls` sau `git pull` (đã từng trùng `1777300000000`) |
| **[v2]** Manager/role khác gửi vượt phạm vi (do `/users/all` không lọc scope) | BE resolve + kiểm scope lúc gửi, từ chối kèm danh sách id; test mutation |
| **[v2]** Tài khoản bị chiếm quyền spam toàn công ty | `@Throttle`, trần người nhận, audit mọi lần gửi, quyền `send` tách riêng cấu hình được |
| **[v2]** Nội dung tự do chứa PII khách hàng | Cảnh báo cố định trên form; không ghi `body` vào audit; render text thuần; cân nhắc từ khoá chặn SĐT (Phase sau) |
| **[v2]** Gửi "toàn bộ" 1 lần ghi hàng nghìn dòng trên serverless | `INSERT … SELECT` 1 câu lệnh trong transaction, trần 2000; nếu sau này vượt → chuyển sang lô + hàng đợi (Phase 7) |
| **[v2]** Dọn dẹp làm mất dữ liệu theo dõi đọc | Thông báo thủ công loại khỏi quy tắc 30/90 ngày; xoá theo cả lần gửi sau 180 ngày; "ẩn" ≠ xoá |
| **[v2]** Số liệu "đã đọc" bị hiểu là bằng chứng đã đọc nội dung | Ghi rõ định nghĩa trên UI; `require_ack` ở Phase 7 nếu cần |
| **[v2]** Cột sinh `is_read` làm `migration:generate` sinh diff giả | Viết migration tay; chạy `generate` thử phải ra rỗng; phương án dự phòng ở 11.13 |

---

## 13. Nguồn tham khảo (research)

- Vercel — WebSocket vs SSE (trần thời lượng function): https://vercel.com/i/websocket-vs-server-sent-events
- Ably — WebSockets trên Vercel (beta 06/2026, gắn 1 instance, không fan-out): https://ably.com/vercel/websockets-on-vercel
- Vercel — giới hạn Cron (Hobby: 1 lần/ngày, không retry): https://vercel.com/docs/cron-jobs/usage-and-pricing
- MySQL cho hệ thống thông báo (1 dòng/người nhận, index `(recipient_id, is_read, created_at)`, dọn dẹp định kỳ): https://oneuptime.com/blog/post/2026-03-31-mysql-use-mysql-for-notification-systems/view
- Gộp thông báo khi chưa đọc, polling bằng TanStack Query, fan-out trong serverless: https://github.com/Mahmoud-walid/Chemlab/issues/21
- Idempotency theo cặp (event, người nhận): https://github.com/MS-Arcadia/notification-service
- Đối chiếu code nội bộ cho phần thủ công (v2): `users.service.ts` (`findEmployees`, `findAll` + `UsersAccessHelper`), `users.controller.ts` (`@GetPermissionScope()`), `migrations/1782100000000-SeedPeriodicTasksPermissions.ts`, `migrations/1783200000000-SplitPeriodicTasksAuditViewPermission.ts`, `common/guards/permission.guard.ts`.
