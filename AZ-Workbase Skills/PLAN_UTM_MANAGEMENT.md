# PLAN — Chuyển cột UTM (nhập tay) thành danh mục UTM chọn nhanh, có Quản lý chính/phụ

> **Đặt file tại:** `AZ-Workbase Skills/PLAN_UTM_MANAGEMENT.md`
> **Cơ sở:** đọc trực tiếp code trên `origin/main` HEAD `aaaa7dd` (2026-09-29). Mọi `file:dòng` bên dưới là vị trí thật tại thời điểm đó.
> **Trạng thái:** KẾ HOẠCH — chưa code. Có **7 câu hỏi cần chủ dự án chốt** ở mục 12 (kèm đề xuất mặc định để làm được ngay).

---

## 0. Mục tiêu (nguyên văn yêu cầu → cách đáp ứng)

| Yêu cầu | Cách đáp ứng |
|---|---|
| UTM đang nhập tay, muốn **Select dropdown** như Nhóm liên kết | Component `UtmSelect` (tìm kiếm + chọn + "＋ Tạo UTM mới" ngay trong dropdown) thay ô Input |
| **Giữ hết data UTM đã nhập**, sync thành **1 bảng riêng**, không mất dữ liệu | Bảng `utms` + backfill từ `customers.campaign` + **bảng backup nguyên văn** + kiểm tra đối soát (mục 4) |
| **Không conflict** khi match data cũ | Xử lý 12 tình huống xung đột cụ thể (mục 5): khác hoa/thường/dấu, rỗng, KH đã xoá mềm, ghi song song, import Excel… |
| Mỗi UTM **do User tạo**, **trao quyền qua quản lý phụ** (giống Nhóm liên kết) | `primary_manager_id` (người tạo) + bảng `utm_secondary_managers`; chính thêm/xoá phụ; phân quyền Dynamic RBAC (mục 6) |
| Có **migration** cho bảng đó và **phân quyền** | 3 migration tách bạch (DDL / dữ liệu / permission) + 5 permission key (mục 4, 6) |

---

## 1. Hiện trạng (đã đọc code thật)

### 1.1. Dữ liệu UTM hiện nay
- Cột `customers.campaign` — `varchar(100) NULL`, **không FK, không unique, không validate** (`customer.entity.ts:41-42`).
- **Nhãn UI không thống nhất** cho cùng 1 dữ liệu: `UTM` (form `CustomerForm.tsx:480`, cột bảng `customers/page.tsx:750`, export `customers-export.service.ts:176`), `Chiến dịch` (`CustomerInfoTab.tsx:77`, `ReportCustomerDetailModal.tsx:114`, `AuditDiffViewer.tsx:148`), `Campaign` (`chia-data/page.tsx:617`).
- Hệ quả nhập tay: "FB_Q4", "fb_q4", "FB Q4 ", "FB-Q4" là 4 giá trị khác nhau → báo cáo/lọc bị phân mảnh.

### 1.2. Mọi chỗ ĐỌC/GHI `campaign` (phải xử lý khi đổi)
| Nơi | Vị trí | Việc phải làm |
|---|---|---|
| Tạo KH | `customers.service.ts:285` (`normalizeSearchableText`) | nhận `utmId`, gán `campaign = utm.name` |
| Sửa KH | `customers.service.ts:1949-1963` | như trên; chỉ validate quyền khi **utmId thay đổi** |
| DTO tạo | `dto/create-customer.dto.ts:53` (`campaign?: string`) | thêm `utmId?: number`; `campaign` giữ ở chế độ tương thích (deprecated) |
| Import Excel | `customers.import.service.ts:131,218` (cột "chiến dịch") | resolve tên → `utm_id` (mục 5, case 7) |
| Search | `customers.service.ts:556` (FULLTEXT), `:601` (LIKE) | **không đổi** nếu giữ snapshot `campaign` (quyết định D1) |
| FULLTEXT index | `ft_customers_search (name, email, campaign)` (migration `1777000000000`, `1777100000000`) | **không đụng** |
| Audit snapshot | `customers.service.ts:484` | thêm `utmId`; nhãn ở `AuditDiffViewer.tsx:148` → "UTM" |
| Export | `customers-export.service.ts:176,212` | cột "UTM" vẫn lấy `campaign` (snapshot = tên UTM) |
| Report chi tiết KH | `reports-customer-detail.service.ts:157`, `reports.types.ts:400` | thêm `utm {id,name,color}`; đổi nhãn |
| Chia data | `chia-data/page.tsx:111,232,617` | đổi nhãn "UTM", hiển thị Tag |
| Lọc danh sách | `customer-filters.dto.ts` (có `source`, `groupId`; **chưa có** lọc UTM) | thêm `utmId` |
| Dọn khoảng trắng lạ | migration `1784000000000` đã xử lý `name/email/campaign` | dữ liệu cũ đã sạch NBSP/zero-width → backfill dễ hơn |

> Lưu ý: 2 file `zk-device.service.ts`, `sequential-attendance-reader.util.ts` khớp grep `utm` chỉ vì chuỗi `timeoutMs` — **không liên quan**.

### 1.3. Cơ chế Nhóm liên kết cần mirror (đã đọc)
- Entity: `link_groups` (`primary_manager_id` NULL → users, `is_active`, `sort_order`), `link_group_secondary_managers` (UNIQUE `group_id,user_id`, `added_by_id`), `link_group_content_staff`.
- Helper thuần `LinkGroupAccessHelper`: `canManage(userId, hasBroadAccess, primaryId, secondaryIds, contentIds)`, `canEditSecondaryManagers(userId, hasBroadAccess, primaryId)` — **chỉ Quản lý chính hoặc quyền rộng mới thêm/xoá quản lý phụ**.
- `LinkGroupManagersService.hasBroadAccess()`: Root Admin luôn true; còn lại hỏi `PermissionsService.hasPermission(role,'link_groups.manage')`.
- Endpoint: `GET /link-groups/managed-by-me`, `GET/POST/DELETE /link-groups/:id/managers`, `GET /link-groups/customer-counts`, `GET /link-groups/:id/customers` (lọc theo **scope `customers.view`** của người xem).
- `GET /link-groups` cố ý **không** `@RequirePermission` (mọi role đăng nhập dùng cho dropdown ở CustomerForm); key `link_groups.view` chỉ gate sidebar/trang FE.
- Permission: `link_groups.view` (4 role), `.manage` (admin, assistant), `.delete` (admin), `.my_managed` (4 role — tách riêng để Admin tắt trang CRUD không làm mất trang cá nhân; migration `1781600000000`).
- Audit: `ADD_LINK_GROUP_MANAGER` / `REMOVE_LINK_GROUP_MANAGER` (+ nhãn ở `frontend/src/lib/api/audit-meta.ts:155`).
- ⚠️ Khác biệt cần biết: `customers.source` **không được BE đối chiếu** với `media_sources` (grep không thấy validate) → UTM sẽ làm **chặt hơn** Nguồn: validate thật ở BE.

---

## 2. Các quyết định thiết kế

| # | Quyết định | Lý do | Phương án bị loại |
|---|---|---|---|
| **D1** | **Giữ `customers.campaign` làm bản "snapshot tên"**, thêm `customers.utm_id` (FK). Ghi: `campaign = utm.name`. Đổi tên UTM → cascade cập nhật snapshot | FULLTEXT ngram, export, report, audit, chia-data đều đang đọc `campaign` → không phải dựng lại index/sửa 10+ chỗ; **rollback rẻ** (cột cũ còn nguyên) | Xoá `campaign` + JOIN: sạch hơn nhưng phải rebuild FULLTEXT, sửa mọi truy vấn, rollback khó. Có thể làm ở giai đoạn sau (mục 11) |
| **D2** | Bảng riêng `utms` (không dùng chung `link_groups`) | Khác miền dữ liệu; nhưng **sao chép đúng pattern** (primary + secondary + helper + permission) | Nhét vào `link_groups`: lẫn nghiệp vụ Zalo/FB group |
| **D3** | Sở hữu = `primary_manager_id` (mặc định **người tạo**) + `utm_secondary_managers` (n-n). **Không** có "content staff" | Không có khái niệm tương đương ở UTM | — |
| **D4** | Có cột `visibility ENUM('shared','restricted')`, **mặc định `shared`** | `shared` = mọi người chọn được (đúng mục tiêu "dropdown nhanh, không gõ lại"); `restricted` = chỉ chính/phụ/quyền rộng → dùng khi muốn "trao quyền" theo nghĩa *ai được dùng*. Tạo sẵn cột để khỏi migration lại (**Q1**) | Chỉ có 1 chế độ: mất linh hoạt |
| **D5** | Tên UTM **UNIQUE theo collation `utf8mb4_unicode_ci`** (không phân biệt hoa/thường **và dấu**) | Chặn tái tạo lộn xộn ngay tại DB, kể cả khi 2 người tạo cùng lúc | Unique ở tầng app: dính race |
| **D6** | Chủ sở hữu UTM cũ (backfill) = **NULL**; `visibility='shared'` | Không đoán chủ; không vô tình trao quyền sửa cho ai. Admin/Assistant (quyền rộng) gán chủ sau; có gợi ý "người dùng nhiều nhất" ở giai đoạn 6 (**Q3**) | Tự gán người dùng nhiều nhất làm chính: rủi ro họ đổi tên ảnh hưởng người khác |
| **D7** | `campaign` text vẫn được BE chấp nhận ở **chế độ tương thích**: resolve theo tên (CI); chưa có → tạo mới nếu user có `utms.create`, không thì 400 | FE cũ còn cache/API script không gãy trong lúc chuyển giao | Ngắt cứng: dễ lỗi lúc deploy |
| **D8** | Xoá UTM chỉ khi **0 KH tham chiếu** (tính cả KH đã xoá mềm); còn KH → 400 "hãy Khoá hoặc Gộp" | Không mất liên kết dữ liệu | `ON DELETE SET NULL`: âm thầm mất UTM của KH |
| **D9** | Phạm vi quản lý: **chính** = sửa tên/màu/mô tả, khoá/mở, đổi visibility, thêm/xoá phụ, chuyển chính; **phụ** = xem, sửa mô tả/màu, khoá/mở, xem KH của UTM, được dùng UTM restricted; **không** đổi tên/visibility/quản lý phụ/xoá (**Q2**) | Tên là "danh tính" UTM — đổi tên cascade lên nhiều KH nên giữ ở người chính | Phụ được đổi tên: rủi ro cao hơn |

---

## 3. Mô hình dữ liệu

### 3.1. DDL (chuẩn hoá theo cách các migration hiện có viết — `hasTable/hasColumn`, `ENGINE=InnoDB`, `utf8mb4_unicode_ci`)

```sql
-- 1) Danh mục UTM
CREATE TABLE `utms` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,                       -- = độ dài customers.campaign
  `description` varchar(255) NULL,
  `color` varchar(20) NOT NULL DEFAULT '#1677ff',
  `visibility` enum('shared','restricted') NOT NULL DEFAULT 'shared',
  `is_active` tinyint NOT NULL DEFAULT 1,
  `primary_manager_id` int NULL,
  `created_by_id` int NULL,
  `sort_order` int NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_utms_name` (`name`),                 -- CI + AI nhờ collation bảng
  KEY `IDX_utms_primary_manager` (`primary_manager_id`),
  KEY `IDX_utms_is_active` (`is_active`),
  CONSTRAINT `FK_utms_primary_manager` FOREIGN KEY (`primary_manager_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  CONSTRAINT `FK_utms_created_by` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2) Quản lý phụ (mirror link_group_secondary_managers)
CREATE TABLE `utm_secondary_managers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `utm_id` int NOT NULL,
  `user_id` int NOT NULL,
  `added_by_id` int NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_utm_secondary_utm_user` (`utm_id`,`user_id`),
  KEY `IDX_utm_secondary_user` (`user_id`),
  CONSTRAINT `FK_utm_secondary_utm`  FOREIGN KEY (`utm_id`)      REFERENCES `utms`(`id`)  ON DELETE CASCADE,
  CONSTRAINT `FK_utm_secondary_user` FOREIGN KEY (`user_id`)     REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `FK_utm_secondary_addby` FOREIGN KEY (`added_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3) Backup nguyên văn (KHÔNG có FK tới customers: KH bị xoá cứng sau này không làm mất/khoá backup)
CREATE TABLE `customer_campaign_backup` (
  `customer_id` int NOT NULL,
  `campaign_raw` varchar(100) NULL,
  `utm_id` int NULL,
  `backed_up_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`customer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4) Cột liên kết trên customers (nullable vĩnh viễn: KH không có UTM là hợp lệ)
ALTER TABLE `customers`
  ADD COLUMN `utm_id` int NULL AFTER `campaign`,
  ADD KEY `IDX_customers_utm_id` (`utm_id`),
  ADD CONSTRAINT `FK_customers_utm` FOREIGN KEY (`utm_id`) REFERENCES `utms`(`id`) ON DELETE RESTRICT;
```

> `updated_at` của `customers`/`utms` là `ON UPDATE CURRENT_TIMESTAMP` → xem **bẫy** ở 4.2 (backfill không được làm nhảy `updated_at` của khách).

### 3.2. Entity TypeORM (theo quy ước dự án)
- `database/entities/utm.entity.ts`, `utm-secondary-manager.entity.ts` — copy cấu trúc `LinkGroup`/`LinkGroupSecondaryManager`.
- Cột `string | null` **khai `type: 'varchar'` tường minh** (`description`) — tránh `DataTypeNotSupportedError` (quy tắc §5 Custom Instructions).
- `is_active`: theo cách `LinkGroup.isActive` đang dùng. **Cảnh báo BooleanTransformer/QueryBuilder** (`SKILL_NESTJS_BACKEND.md` mục 10): trong `QueryBuilder.where()` truyền `1/0`, không truyền `true/false`.
- `Customer`: thêm
  ```ts
  @Column({ name: 'utm_id', type: 'int', nullable: true })
  utmId: number | null;

  @ManyToOne(() => Utm, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'utm_id' })
  utm: Utm | null;
  ```
- `synchronize: false` giữ nguyên. Đăng ký entity vào module + `typeorm` config.
- ⚠️ **Xoá cứng User**: `users.service.ts` `hardDeleteUser` (~dòng 1089–1200) xử lý thủ công các FK trỏ tới `users` (có nhắc `link_group.primary_manager…`). Phải **thêm** `utms.primary_manager_id`, `utms.created_by_id`, `utm_secondary_managers.user_id/added_by_id` vào đó (DB đã `SET NULL/CASCADE` nhưng cần đồng bộ với danh sách/ghi chú của hàm này + thêm test).

---

## 4. MIGRATION — 3 file, thứ tự cố định

> **Timestamp:** origin hiện có migration lớn nhất `1784900000000`. Đề xuất `1785000000000 / 1785100000000 / 1785200000000`. **Khi implement phải `ls src/database/migrations` để lấy số thật** (10 tài khoản cùng làm việc — tránh trùng).
> Tuân thủ: `up()/down()` đối xứng, dùng `hasTable/hasColumn` (idempotent), **không sửa migration cũ**, **không tự chạy lên DB production** — chủ dự án tự chạy `npm run migration:run` sau khi xem pre-flight.

### 4.0. Pre-flight (chạy tay TRƯỚC, chỉ đọc) — để biết quy mô & mức trùng lặp

```sql
-- (a) collation thật của cột
SELECT COLUMN_NAME, COLLATION_NAME FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'campaign';

-- (b) quy mô
SELECT COUNT(*) AS tong_kh,
       SUM(campaign IS NOT NULL AND TRIM(campaign) <> '') AS co_utm,
       COUNT(DISTINCT BINARY TRIM(campaign)) AS bien_the_nguyen_van,
       COUNT(DISTINCT TRIM(campaign) COLLATE utf8mb4_unicode_ci) AS utm_sau_khi_gop_hoa_thuong_dau
FROM customers;                       -- gồm cả KH đã xoá mềm (raw SQL không lọc deleted_at)

-- (c) nhóm bị gộp (để xem trước thứ sẽ hợp nhất)
SELECT TRIM(campaign) COLLATE utf8mb4_unicode_ci AS khoa, GROUP_CONCAT(DISTINCT BINARY TRIM(campaign) SEPARATOR ' | ') AS cac_bien_the, COUNT(*) AS so_kh
FROM customers WHERE campaign IS NOT NULL AND TRIM(campaign) <> ''
GROUP BY khoa HAVING COUNT(DISTINCT BINARY TRIM(campaign)) > 1 ORDER BY so_kh DESC;
```
Nếu (a) trả collation khác `utf8mb4_unicode_ci` (vd `utf8mb4_0900_ai_ci`) vẫn OK vì các câu JOIN dưới đây **ép COLLATE tường minh 2 vế** (tránh lỗi "Illegal mix of collations").

### 4.1. Migration 1 — `CreateUtmsSystem` (thuần DDL)
Tạo `utms`, `utm_secondary_managers`, `customer_campaign_backup`, cột `customers.utm_id` + index + FK (mục 3.1), mỗi bước kiểm tra `hasTable/hasColumn`.
- Thêm cột nullable là thao tác nhẹ; **thêm index + FK trên bảng `customers` lớn** có thể mất thời gian → chạy ngoài giờ cao điểm (đo bằng (b) ở 4.0).
- `down()`: gỡ FK → gỡ index → xoá cột `utm_id` → xoá `utm_secondary_managers` → `utms` → `customer_campaign_backup` (chỉ khi được hỏi rõ; xem cảnh báo rollback 9.3).

### 4.2. Migration 2 — `BackfillUtmsFromCustomerCampaign` (thuần DML, chạy trong transaction)

Tách riêng khỏi DDL vì DDL MySQL auto-commit, còn DML mới rollback được khi kiểm tra sai.

**Các bước (mỗi bước idempotent — chạy lại không hỏng):**

1. **Backup nguyên văn — `INSERT IGNORE`** (chỉ chép lần đầu; chạy lại **không ghi đè** bằng giá trị đã chuẩn hoá):
   ```sql
   INSERT IGNORE INTO customer_campaign_backup (customer_id, campaign_raw)
   SELECT id, campaign FROM customers WHERE campaign IS NOT NULL AND campaign <> '';
   ```
2. **Lấy các biến thể + số lần dùng** (chuẩn hoá: gộp khoảng trắng, trim):
   ```sql
   SELECT TRIM(REGEXP_REPLACE(campaign, '[[:space:]]+', ' ')) AS name, COUNT(*) AS cnt
   FROM customers
   WHERE campaign IS NOT NULL AND TRIM(REGEXP_REPLACE(campaign, '[[:space:]]+', ' ')) <> ''
   GROUP BY BINARY TRIM(REGEXP_REPLACE(campaign, '[[:space:]]+', ' '))
   ORDER BY cnt DESC, name ASC;
   ```
3. **Chèn UTM tuần tự trong TypeScript** theo thứ tự trên → biến thể **phổ biến nhất được chèn trước và trở thành tên hiển thị**; các biến thể còn lại (chỉ khác hoa/thường/dấu) đụng UNIQUE và bị bỏ qua:
   ```sql
   INSERT INTO utms (name, visibility, is_active) VALUES (?, 'shared', 1)
   ON DUPLICATE KEY UPDATE id = id;
   ```
   (Vòng lặp trong TS thay vì `INSERT … SELECT … ORDER BY` để thứ tự **xác định** — số UTM phân biệt thường chỉ vài trăm.)
4. **Gán `utm_id` — theo lô** (vd 5.000 id/lô; **không** khoá cả bảng):
   ```sql
   UPDATE customers c
   JOIN utms u
     ON u.name COLLATE utf8mb4_unicode_ci
      = TRIM(REGEXP_REPLACE(c.campaign, '[[:space:]]+', ' ')) COLLATE utf8mb4_unicode_ci
   SET c.utm_id = u.id,
       c.updated_at = c.updated_at            -- ⚠️ BẪY: gán lại chính nó để MySQL KHÔNG tự bump updated_at
   WHERE c.utm_id IS NULL
     AND c.campaign IS NOT NULL AND c.campaign <> ''
     AND c.id BETWEEN :from AND :to;
   ```
   > **Bẫy `updated_at`:** `customers.updated_at` là `ON UPDATE CURRENT_TIMESTAMP` và giao diện đang hiển thị "Sửa cuối" từ đó (tooltip audit). Nếu quên dòng `c.updated_at = c.updated_at`, **toàn bộ khách hàng** sẽ hiện như vừa được sửa lúc chạy migration.
5. **Chuẩn hoá snapshot** `campaign = utm.name` (bản gốc đã có ở backup):
   ```sql
   UPDATE customers c JOIN utms u ON u.id = c.utm_id
   SET c.campaign = u.name, c.updated_at = c.updated_at
   WHERE BINARY c.campaign <> BINARY u.name AND c.id BETWEEN :from AND :to;
   ```
6. **Ghi `backup.utm_id`** để đối soát ngược:
   ```sql
   UPDATE customer_campaign_backup b JOIN customers c ON c.id = b.customer_id
   SET b.utm_id = c.utm_id WHERE b.utm_id IS NULL;
   ```
7. **Đối soát — sai một điều kiện là `throw` → rollback toàn bộ DML:**
   - (a) KH có UTM không rỗng mà `utm_id IS NULL` = **0**.
   - (b) KH có UTM không rỗng mà không có dòng backup = **0** *(chỉ kiểm ở lần chạy đầu)*.
   - (c) **Không KH nào bị gán sai UTM:**
     ```sql
     SELECT COUNT(*) FROM customers c
     JOIN customer_campaign_backup b ON b.customer_id = c.id
     JOIN utms u ON u.id = c.utm_id
     WHERE TRIM(REGEXP_REPLACE(b.campaign_raw,'[[:space:]]+',' ')) COLLATE utf8mb4_unicode_ci <> u.name COLLATE utf8mb4_unicode_ci;  -- phải = 0
     ```
   - (d) `COUNT(utms)` = số nhóm "gộp hoa/thường/dấu" ở pre-flight (c).
   - Ghi log tổng kết qua `Logger`: số KH, số UTM tạo, số biến thể đã gộp, số KH được gán.

**`down()`:** khôi phục nguyên văn từ backup, không đụng KH tạo sau migration:
```sql
UPDATE customers c JOIN customer_campaign_backup b ON b.customer_id = c.id
SET c.campaign = b.campaign_raw, c.utm_id = NULL, c.updated_at = c.updated_at;
```

**Chạy lại/bù (catch-up):** ngoài migration, cung cấp script idempotent `npm run utm:backfill` (tái dùng đúng hàm của bước 1–6, chỉ xử lý dòng `utm_id IS NULL AND campaign <> ''`) để vá các KH phát sinh trong khoảng chuyển giao (mục 9.1).

### 4.3. Migration 3 — `SeedUtmPermissions`
Mirror `1778500000000` + `1781600000000`: `INSERT INTO permissions … ON DUPLICATE KEY UPDATE` rồi `INSERT INTO role_permissions … SELECT`. Bảng key ở mục 6.1. `down()` xoá `role_permissions` rồi `permissions` theo key.

---

## 5. Xử lý xung đột khi khớp dữ liệu (đây là phần "không conflict")

| # | Tình huống | Cách xử lý |
|---|---|---|
| 1 | Chỉ khác **hoa/thường / dấu / khoảng trắng đầu-cuối-giữa** ("FB Q4", "fb q4", "FB  Q4 ") | Gộp **1 UTM**; tên hiển thị = biến thể phổ biến nhất; nguyên văn còn ở backup |
| 2 | Chuỗi rỗng / toàn khoảng trắng / NBSP | `utm_id = NULL`, `campaign` giữ nguyên (không tạo UTM rỗng) |
| 3 | **Khác nhau thật nhưng trông giống** ("FB-Q4", "FB_Q4", "FBQ4") | **KHÔNG tự gộp** (không đoán ý người dùng). Có báo cáo "UTM gợi ý trùng" + chức năng **Gộp** (giai đoạn 6) |
| 4 | KH **đã xoá mềm / trong thùng rác** | Vẫn backfill (raw SQL không lọc `deleted_at`) → khôi phục KH không bị mất UTM |
| 5 | KH mới tạo **trong lúc đang migrate** (FE/BE cũ ghi `campaign` text) | BE mới ở chế độ tương thích (D7) tự resolve; phần sót vá bằng `npm run utm:backfill` (9.1) |
| 6 | 2 người **tạo cùng tên cùng lúc** | UNIQUE bắt `ER_DUP_ENTRY` → trả UTM đã có (nếu được dùng) hoặc `409` "UTM đã tồn tại — nhờ {quản lý chính} thêm bạn làm quản lý phụ" |
| 7 | **Import Excel** cột "chiến dịch" | Resolve tên (CI+AI) → `utm_id`. Tên **chưa có**: user có `utms.create` → tạo 1 lần cho cả file (gom theo tên) và **liệt kê UTM sẽ tạo trong phần xem trước/kết quả**; user không có quyền → dòng đó báo lỗi rõ ràng, không tạo. UTM `restricted` mà user không được dùng → lỗi dòng |
| 8 | UTM đã **khoá** (`is_active=0`) nhưng KH cũ còn dùng | Giữ nguyên hiển thị; **không** cho chọn mới; sửa KH mà không đổi UTM vẫn lưu được (chỉ validate khi `utmId` đổi) |
| 9 | UTM `restricted` mà user sửa KH đang mang UTM đó | BE luôn trả kèm `utm {id,name,color}` bất kể quyền; giữ nguyên OK; **không** được đổi sang UTM restricted khác khi không có quyền |
| 10 | **Đổi tên UTM** | Cascade `UPDATE customers SET campaign = :newName, updated_at = updated_at WHERE utm_id = :id` theo lô; ghi **1** audit `UPDATE_UTM` kèm `affectedCustomers` (không ghi audit từng KH để tránh ngập log) |
| 11 | Client gửi **cả `utmId` và `campaign` mâu thuẫn** | BE lấy `utmId` làm chuẩn, **bỏ qua** `campaign` |
| 12 | `utmId` trỏ tới UTM không tồn tại / bị khoá / user không có quyền dùng | `400` (không tồn tại/khoá) / `403` (không được dùng) — thông báo tiếng Việt cụ thể |

---

## 6. Phân quyền

### 6.1. Permission key mới (Dynamic RBAC — bảng `permissions`, phải **seed trước** khi dùng `@RequirePermission`)

| Key | Ý nghĩa | Scope | Mặc định seed |
|---|---|---|---|
| `utms.view` | Xem tab **"Tất cả UTM"** trong trang Quản lý UTM | không | admin, assistant, manager, employee |
| `utms.create` | Tạo UTM mới (kể cả "＋ Tạo nhanh" trong dropdown, và tạo khi import) | không | admin, assistant, manager, employee |
| `utms.manage` | **Quyền rộng**: sửa/khoá/đổi visibility mọi UTM, gán/gỡ quản lý chính-phụ, chuyển chủ, **Gộp** | không | admin, assistant |
| `utms.delete` | Xoá UTM (khi 0 KH) | không | admin |
| `utms.my_managed` | Vào trang "Quản lý UTM" + tab **"UTM tôi quản lý"** (tách riêng theo bài học `link_groups.my_managed`: Admin tắt `view` không làm mất trang cá nhân) | không | admin, assistant, manager, employee |

> `utms.create` **cho cả Employee** theo đúng yêu cầu "mỗi UTM đều có thể do User tạo". Admin vẫn tắt/bật riêng từng role qua trang Phân quyền; override theo **phòng ban/vị trí** hoạt động tự động vì key nhị phân (`supports_scope = FALSE`) đi qua `PermissionsService` như mọi key khác.

### 6.2. Ma trận theo người dùng (áp cho từng UTM)

| Hành động | Root Admin | Quyền rộng (`utms.manage`) | Quản lý **chính** | Quản lý **phụ** | User khác có `utms.create` | User khác |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Thấy trong dropdown (`shared`) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Thấy/chọn UTM `restricted` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Tạo UTM (thành **chính**) | ✅ | ✅ | — | — | ✅ | ❌ |
| Đổi tên / visibility | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Sửa mô tả / màu | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Khoá / mở khoá | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Thêm/xoá **quản lý phụ** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Chuyển quyền chính | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Gộp UTM | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Xoá UTM (0 KH) | ✅ | cần `utms.delete` | ❌ | ❌ | ❌ | ❌ |
| Xem **KH thuộc UTM** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |

> **Quyền quản lý UTM KHÔNG mở rộng quyền xem khách hàng.** Danh sách KH của UTM luôn lọc theo **scope `customers.view`** của người xem (đúng cách `link-group-customers.service.ts` đang làm). Đây là điểm an toàn dữ liệu quan trọng nhất của plan này.

### 6.3. Quy tắc bắt buộc (Custom Instructions §4)
1. **Bypass `role === 'admin'` (Root Admin) giữ đủ 3 lớp**: `PermissionGuard`, `RolesService.getMyPermissions()`, và `UtmManagersService.hasBroadAccess()` (mirror `LinkGroupManagersService.hasBroadAccess`). Không chỉ 1 lớp.
2. Helper thuần `UtmAccessHelper` (không phụ thuộc DB, dễ test): `canManage`, `canEditNameAndVisibility`, `canEditSecondaryManagers`, `canUse` — nhận `hasBroadAccess` đã tính sẵn ở tầng service.
3. **FE:** mọi nút/menu dùng `can('utms.x')` + cờ `myRole` từ API, **không hardcode** `role === 'admin'`. BE 403 endpoint nào thì FE phải ẩn UI đó trước.
4. Route tĩnh (`managed-by-me`, `customer-counts`, `recent`, `duplicates`) khai **trước** `:id` (bài học Nest khớp theo thứ tự — xem `periodic-tasks.controller.ts`).
5. `GET /utms` **không** `@RequirePermission` (chỉ `JwtAuthGuard`+`PermissionGuard` cấp class) — vì mọi nhân viên thêm KH đều cần dropdown; nhưng **lọc danh sách theo quyền dùng** ở service (khác `GET /link-groups`: UTM có `restricted`).
6. Rate-limit tạo UTM bằng `ThrottlerGuard` (đã dùng ở Thông báo) — chống spam tạo rác.

---

## 7. Backend — thiết kế chi tiết

### 7.1. Module `modules/utms/`
```
utms.module.ts
utms.controller.ts              # CRUD + lists
utm-managers.controller.ts      # managers + managed-by-me
utms.service.ts                 # CRUD, resolveByName(), merge(), cascade rename
utm-managers.service.ts         # hasBroadAccess, add/remove/transfer
utm-customers.service.ts        # counts + listCustomers (áp scope customers.view)
helpers/utm-access.helper.ts    # + .spec.ts
dto/{create-utm,update-utm,add-utm-manager,merge-utm,utm-query}.dto.ts
*.spec.ts                       # mỗi service/helper/controller
```
Import `CustomersModule`/`PermissionsModule`/`AuditModule`; export `UtmsService` (để `CustomersService` + import gọi `resolveForCustomer()`).

### 7.2. Endpoint

| Method & path | Guard | Ai được | Ghi chú |
|---|---|---|---|
| `GET /utms?q=&activeOnly=&limit=` | JwtAuth | mọi user | Chỉ trả UTM **được dùng** (shared + mình quản lý + quyền rộng); kèm `myRole: 'primary'\|'secondary'\|null`. Tìm theo tên (CI). `limit` mặc định 50 |
| `GET /utms/recent` | JwtAuth | mọi user | 5 UTM user dùng gần đây (giai đoạn 6) |
| `GET /utms/managed-by-me` | JwtAuth | mọi user | Mirror `link-groups/managed-by-me`; quyền rộng → trả tất cả |
| `GET /utms/customer-counts` | `customers.view` | — | Đếm KH theo UTM **đã áp scope** |
| `GET /utms/duplicates` | `utms.manage` | — | Gợi ý UTM giống nhau (bỏ ký tự không chữ-số + hạ chữ) |
| `POST /utms` | `utms.create` (+Throttle) | — | Người tạo = `primary_manager_id` = `created_by_id`; `409` nếu trùng tên |
| `PATCH /utms/:id` | JwtAuth + helper | chính/quyền rộng (tên, visibility); phụ (mô tả, màu) | Đổi tên → cascade snapshot (mục 5-10) |
| `PATCH /utms/:id/deactivate` `/activate` | JwtAuth + helper | chính, phụ, quyền rộng | |
| `POST /utms/:id/merge` `{targetId}` | `utms.manage` | — | Chuyển mọi `utm_id`+`campaign` từ nguồn sang đích; xoá nguồn; 1 audit |
| `DELETE /utms/:id` | `utms.delete` | — | `400` nếu còn KH tham chiếu (tính cả xoá mềm) |
| `GET /utms/:id/managers` | JwtAuth + helper | chính/phụ/quyền rộng | |
| `POST /utms/:id/managers` `{userId}` | JwtAuth + helper | chính, quyền rộng | Chặn: đã là chính; đã là phụ (409); user không tồn tại/khoá (400) |
| `DELETE /utms/:id/managers/:userId` | JwtAuth + helper | chính, quyền rộng | |
| `PATCH /utms/:id/primary-manager` `{userId}` | JwtAuth + helper | chính, quyền rộng | Người mới nếu đang là phụ → tự gỡ khỏi phụ |
| `GET /utms/:id/customers` | `customers.view` | chính/phụ/quyền rộng | Lọc theo scope `customers.view` |

### 7.3. Tích hợp vào Customers
- `CreateCustomerDto`/`UpdateCustomerDto`: `utmId?: number | null` (`@IsOptional @IsInt`), giữ `campaign?` (`@ApiProperty deprecated`). `forbidNonWhitelisted` đang bật nên **phải khai đủ** field mới.
- Hàm `UtmsService.resolveForCustomer({utmId?, campaign?}, caller)` trả `{utmId, name} | null`:
  1. `utmId === null` → xoá cả `utm_id` lẫn `campaign`.
  2. có `utmId` → kiểm tra tồn tại + `is_active` + `canUse` → `campaign = utm.name`.
  3. chỉ có `campaign` (tương thích) → `normalizeSearchableText` → tìm theo tên (CI); chưa có → tạo nếu `utms.create`, else `400`.
- `customers.service.ts`: sửa `create` (~285), `update` (~1949–1963), `buildCustomerAuditSnapshot` (~484 thêm `utmId`), truy vấn danh sách `leftJoin('customer.utm','utm')` chỉ chọn `id,name,color` (không kéo cả entity), filter `utmId` ở `customer-filters.dto.ts` + `customer-query.dto.ts` + nơi áp filter.
- **Không** đụng `applyCustomerSearch` (FULLTEXT vẫn trên `campaign`).
- `customers.import.service.ts`: thêm bước resolve theo case 7; gom UTM mới theo tên để tạo 1 lần; đưa danh sách UTM sẽ tạo vào kết quả/preview.
- `reports-customer-detail.service.ts`: thêm `utm`; đổi nhãn.

### 7.4. Audit (đăng ký ở `audit-meta.ts`, mirror `ADD_LINK_GROUP_MANAGER`)
`CREATE_UTM`, `UPDATE_UTM` (kèm `affectedCustomers` khi đổi tên), `ACTIVATE_UTM`, `DEACTIVATE_UTM`, `DELETE_UTM`, `MERGE_UTM`, `ADD_UTM_MANAGER`, `REMOVE_UTM_MANAGER`, `TRANSFER_UTM_OWNER`. Payload theo mẫu `buildMemberAuditPayload` (id + **tên**, không lộ FK thô). Thêm `utmId: 'UTM'` vào `AuditDiffViewer.tsx`.

### 7.5. Bảo mật/hiệu năng
- Không log dữ liệu nhạy cảm; UTM không chứa PII nhưng vẫn không đưa nội dung tự do vào thông báo.
- Index đủ: `utms.name` (unique), `customers.utm_id`, `utm_secondary_managers(user_id)`.
- `customer-counts`: 1 truy vấn `GROUP BY utm_id` đã áp `CustomerAccessHelper.applyViewFilter` — không N+1.
- Transaction: `merge`, `rename+cascade`, `delete` chạy trong `queryRunner` transaction; cascade theo lô 5.000.

---

## 8. Frontend — thiết kế chi tiết

### 8.1. Thành phần mới
| File | Nội dung |
|---|---|
| `lib/api/utms.api.ts` | client cho mọi endpoint mục 7.2 + types (`Utm`, `UtmManagers`) |
| `lib/hooks/useUtms.ts` | `useUtmOptions(q)` (staleTime ~60s, debounce 300ms, invalidate khi tạo/sửa), `useManagedUtms`, mutation hooks (mirror `useLinkGroups.ts`) |
| `components/customers/UtmSelect.tsx` | Ant Design `Select showSearch`, option = `Tag` màu + tên; `allowClear`; **nhóm "Dùng gần đây" lên đầu** (giai đoạn 6); footer **"＋ Tạo UTM “{từ đang gõ}”"** chỉ khi `can('utms.create')` và không trùng chính xác → POST → tự chọn; UTM khoá **ẩn** khỏi danh sách trừ khi đang là giá trị hiện tại (gắn "(đã khoá)"); chống bấm đúp (loading guard — `SKILL_NEXTJS_FRONTEND.md` 8.2) |
| `app/(dashboard)/quan-ly-utm/page.tsx` | Trang quản lý (8.3) |
| `components/utms/UtmFormModal.tsx`, `UtmManagersModal.tsx`, `UtmMergeModal.tsx`, `UtmDuplicatesPanel.tsx` | Tái dùng cấu trúc modal quản lý phụ của `nhom-toi-quan-ly`/`nhom-lien-ket` |

### 8.2. Sửa chỗ hiện có
- `CustomerForm.tsx:480` — `<Form.Item name="campaign" label="UTM">` → `name="utmId"` + `UtmSelect`. (Form.Item khác giữ nguyên.)
- `customers/page.tsx:750` — cột "UTM": hiển thị `Tag` màu theo `record.utm`; dòng phụ ở `:215-217` dùng `record.utm?.name ?? record.campaign`. Thêm **bộ lọc UTM** trong `CustomerFilters.tsx` (đặt cạnh Nguồn).
- **Thống nhất nhãn = "UTM"** ở `CustomerInfoTab.tsx:77`, `ReportCustomerDetailModal.tsx:114`, `chia-data/page.tsx:617`, `AuditDiffViewer.tsx:148`.
- Types: `customer.types.ts:91` thêm `utmId?: number | null; utm?: {id;name;color} | null`; `reports.types.ts:400`, `chia-data/page.tsx:111` tương tự.
- Nav (`nav-config.tsx`): mục **"Quản lý UTM"** (`key: 'quan-ly-utm'`), `permission: 'utms.my_managed'`, đặt gần "Nhóm tôi quản lý". Trang tự kiểm `can('utms.my_managed')` như `nhom-toi-quan-ly/page.tsx:34`.

### 8.3. Trang `/quan-ly-utm`
- **Tab "UTM tôi quản lý"** (mọi người có `utms.my_managed`): UTM mình là chính/phụ (quyền rộng → tất cả).
- **Tab "Tất cả UTM"** (chỉ hiện khi `can('utms.view')`): toàn bộ UTM mình thấy được.
- Cột: Tên (Tag màu), Mô tả, Hiển thị (`shared`/`restricted`), Quản lý chính, Quản lý phụ (avatar + `+N` tooltip — đúng quy ước "Sales phụ" ở `SKILL_NEXTJS_FRONTEND.md` 13.2), **Số KH** (đã áp scope), Trạng thái, Thao tác.
- Nút "Thêm UTM" (`can('utms.create')`); menu thao tác theo `myRole` + `can()`: Sửa, Khoá/Mở, Quản lý phụ, Chuyển chính, Gộp (`utms.manage`), Xoá (`utms.delete`).
- Banner "Có N UTM có thể trùng" → mở `UtmDuplicatesPanel` (chỉ `utms.manage`).
- `Space` dùng `orientation` (không `direction`) — theo `SKILL_NEXTJS_FRONTEND.md` 8.4; `message`/`modal` dùng `App.useApp()`.

### 8.4. UX "chọn nhanh, không gõ lại"
Dropdown mở ra là thấy ngay UTM dùng gần đây → gõ 1–2 ký tự để lọc → Enter. Muốn UTM mới: gõ tên → "＋ Tạo" (nếu chưa có) — nếu **đã tồn tại** (kể cả khác hoa/thường/dấu) thì chỉ hiển thị mục có sẵn, **không cho tạo trùng**.

---

## 9. Rollout & Rollback

### 9.1. Thứ tự triển khai (tránh "khoảng trống" ghi dữ liệu)
1. **Backup DB** đầy đủ + chạy **pre-flight 4.0**, gửi kết quả để chốt (Q6).
2. Chạy **Migration 1** (DDL) + **Migration 3** (permission) — chưa ảnh hưởng người dùng.
3. Deploy **BE mới** (có chế độ tương thích D7): FE cũ vẫn gửi `campaign` text → BE tự resolve/ tạo `utm_id`.
4. Chạy **Migration 2** (backfill) — ngoài giờ cao điểm; theo dõi log tổng kết.
5. Chạy `npm run utm:backfill` **một lần nữa** để vá KH phát sinh giữa bước 3–4 (idempotent).
6. Deploy **FE mới** (`UtmSelect`, trang quản lý, lọc, nhãn "UTM").
7. Theo dõi 1–2 tuần (số UTM `restricted`, số lần tạo trùng bị chặn, lỗi 400/403 ở customers). Sau đó cân nhắc tắt chế độ tương thích cho API trực tiếp (giữ cho Import).

> Vercel: commit message thêm `[deploy]` mới build (theo `README_AZWORKBASE_PROJECT.md`). Migration **do chủ dự án chạy tay** trên DB thật.

### 9.2. Tiêu chí nghiệm thu (Definition of Done)
- [ ] Pre-flight và Migration 2 cho **cùng số**: `KH có UTM = KH có utm_id`; kiểm tra (c) = 0; `#utms` = số nhóm gộp.
- [ ] `updated_at`/"Sửa cuối" của KH **không đổi** sau backfill (mẫu ≥ 20 KH).
- [ ] `backup` có đủ nguyên văn; mở 5 KH cũ so nguyên văn (backup) ↔ UTM hiển thị.
- [ ] FULLTEXT: tìm theo UTM (`campaign`) vẫn ra đúng như trước.
- [ ] Export "UTM" giống dữ liệu trước migration.
- [ ] Ma trận 6.2 đúng cho từng vai trò (Employee tạo được; phụ không thêm được phụ; Manager không thấy KH ngoài scope).
- [ ] `tsc --noEmit`, `nest build`, `jest` (BE), `vitest` + `tsc` (FE) — dán kết quả thật; controller spec khoá guard/permission từng route (mirror `notification-broadcasts.controller.spec.ts`).

### 9.3. Rollback
- **Trước bước 6 (chưa có FE mới):** `migration:revert` Migration 2 → khôi phục nguyên văn từ backup; dữ liệu `campaign` vẫn đúng nên hệ thống cũ chạy bình thường.
- **Sau khi FE mới chạy:** chỉ nên **revert code** (giữ nguyên bảng/cột) — vì `campaign` luôn còn nguyên nghĩa (D1) nên bản cũ vẫn chạy đúng. Chỉ `down()` Migration 1 khi thật sự cần bỏ tính năng; **UTM/quản lý phụ tạo sau migration sẽ mất** (cột `campaign` của KH vẫn giữ tên).
- Bảng `customer_campaign_backup` **giữ ít nhất 1 chu kỳ phát hành** trước khi xoá bằng 1 migration riêng do chủ dự án duyệt.

---

## 10. Kế hoạch triển khai theo giai đoạn (ước lượng 1 dev, chưa gồm chờ duyệt)

| GĐ | Nội dung | File chính | Ước lượng |
|---|---|---|---|
| **0** | Chốt Q1–Q7; chạy pre-flight 4.0 | — | 0,5 ngày |
| **1** | Entity + Migration 1 & 3 + `UtmAccessHelper` + `UtmsService` CRUD + managers + spec | `entities/utm*.ts`, `migrations/1785…`, `modules/utms/*` | 2–3 ngày |
| **2** | Migration 2 (backfill) + script `utm:backfill` + kiểm thử trên **bản sao DB thật** | `migrations/1785…Backfill*`, `database/scripts/` | 1–1,5 ngày |
| **3** | Tích hợp Customers (DTO, create/update, filter, audit, report) + chế độ tương thích + Import + `hardDeleteUser` | `customers.service.ts`, `customers.import.service.ts`, `users.service.ts` | 1,5–2 ngày |
| **4** | FE: `UtmSelect`, CustomerForm, cột/lọc bảng, thống nhất nhãn, types | `UtmSelect.tsx`, `CustomerForm.tsx`, `customers/page.tsx` … | 1,5–2 ngày |
| **5** | FE: trang `/quan-ly-utm` + modal quản lý phụ + nav + audit-meta | `quan-ly-utm/page.tsx`, `components/utms/*` | 2 ngày |
| **6** | Gộp UTM, gợi ý trùng, "Dùng gần đây", gợi ý chủ sở hữu cho UTM cũ | `UtmMergeModal`, `/utms/duplicates`, `/utms/recent` | 1,5 ngày |
| **7** | QA đầy đủ, cập nhật tài liệu, rollout theo 9.1 | `PERMISSIONS.md` §2.13, `WORKFLOW_LOG.md`, README | 1 ngày |
| | **Tổng** | | **≈ 11–14 ngày** |

**MVP dùng được (GĐ 0→5)** ≈ 9–11 ngày; GĐ 6 có thể phát hành sau.

---

## 11. Việc có thể làm sau (không nằm trong phạm vi hiện tại)
- **Bỏ hẳn `customers.campaign`** (chỉ dùng JOIN `utms`) sau khi ổn định vài chu kỳ: cần dựng lại FULLTEXT trên `utms.name` + sửa mọi nơi đọc `campaign`. Chỉ nên làm khi có nhu cầu thật.
- **Category cho UTM** (giống `link_categories`) hoặc gắn UTM ↔ Nguồn (`media_sources`) để dropdown lọc theo Nguồn đã chọn. Chưa làm ở v1 vì dữ liệu cũ dùng 1 UTM ở nhiều Nguồn → không backfill đúng được.
- Báo cáo hiệu quả theo UTM (số KH, tỉ lệ chốt, FTD theo UTM) trong trang Báo cáo doanh số — dữ liệu chuẩn hoá sẵn sàng sau plan này.
- Thông báo khi được thêm làm quản lý phụ (dùng catalog thông báo; không đưa PII).

---

## 12. Câu hỏi cần chủ dự án chốt (kèm mặc định tôi sẽ dùng nếu không nhận được trả lời)

| # | Câu hỏi | Mặc định đề xuất |
|---|---|---|
| **Q1** | "Trao quyền" của UTM nghĩa là **ai được sửa/quản lý UTM** (giống Nhóm liên kết — ai cũng *dùng* được) hay **ai được dùng UTM** (UTM riêng tư)? | Mặc định `shared` (ai cũng dùng); cột `visibility` có sẵn để bật `restricted` theo từng UTM |
| **Q2** | Quản lý **phụ** được làm gì? | Theo D9: sửa mô tả/màu, khoá/mở, xem KH — **không** đổi tên/visibility/quản lý phụ/xoá |
| **Q3** | UTM **cũ** (backfill) chưa có chủ: để trống hay gán người dùng nhiều nhất? | Để trống; Admin/Assistant gán sau, có gợi ý ở GĐ 6 |
| **Q4** | Import Excel gặp UTM **chưa có**: tự tạo hay báo lỗi dòng? | Tự tạo nếu người import có `utms.create` (liệt kê ở kết quả); không có quyền → lỗi dòng |
| **Q5** | Employee có được **tạo** UTM không? | Có (`utms.create` cho cả 4 role) + rate-limit; Admin tắt được theo role |
| **Q6** | Số KH và số UTM phân biệt hiện tại? (kết quả pre-flight 4.0) | Cần để chọn kích thước lô backfill và khung giờ chạy |
| **Q7** | Có muốn **tự động gộp** biến thể kiểu "FB-Q4"/"FB_Q4" không? | **Không** tự gộp; chỉ gợi ý + nút Gộp thủ công |

---

## 13. Tài liệu phải cập nhật khi làm xong
- `PERMISSIONS.md`: thêm **§2.13 UTM (`modules/utms`)** — bảng 5 key, ma trận 6.2, ghi rõ "quản lý UTM không mở rộng quyền xem KH"; cập nhật mục 1.7 (danh sách key) và §3 (changelog).
- `README.md` / `README_AZWORKBASE_PROJECT.md`: thêm module `utms` vào cấu trúc thư mục; `SKILL_DATABASE_MANAGEMENT.md`: thêm bẫy `updated_at` khi UPDATE hàng loạt + mẫu backfill có backup.
- `WORKFLOW_LOG.md`: 1 entry mỗi giai đoạn (chỉ **append**).
