# PLAN — Nâng cấp module Fanpage: theo dõi nhịp đăng, thống kê, liên kết UTM, vận hành (Nhóm A–E)

> **Đặt file tại:** `AZ-Workbase Skills/PLAN_FANPAGE_ANALYTICS.md`
> **Đối chiếu lại code (2026-11-11):** đã kiểm tra `origin/main` HEAD `e2ff1aa` — `UiVisibilityService.getHiddenElementKeys`, key `tab:deposits`, `CustomerAccessHelper.applyViewFilter`, `UtmAccessHelper.canUse` đều tồn tại đúng như mô tả; migration lớn nhất vẫn là `1786380000000`.
> **Cơ sở:** đọc trực tiếp code `origin/main` HEAD `cde9954` (2026-11-10, "Add Multi owner and color Tag"). Mọi đường dẫn bên dưới là file thật tại thời điểm đó.
> **Trạng thái:** ĐỀ XUẤT **v1.1 (2026-11-11)** — đã chốt Q1, Q6, Q7 (xem mục 2 và 3.7–3.8); các câu còn lại dùng mặc định. Chưa chạy build/test, chưa đụng DB.
> **Thay đổi v1.1:** (1) 1 UTM gắn được nhiều Page + quy tắc quy kết khách/tiền chặt chẽ (3.7); (2) xếp hạng chỉ tính người phụ trách có đóng góp dữ liệu, có phân quyền xem (3.8); (3) hiện tiền nạp trong báo cáo Page, có phân quyền riêng + tôn trọng ẩn UI `tab:deposits`; (4) thêm 3 permission key, bỏ setting bật/tắt xếp hạng.
> **Thay đổi v1.2 (2026-11-11, Q10/Q11 đã chốt theo đề xuất):** thêm **Lead (khách hàng) nhập thủ công + tạo từ Ghi chú tiến trình** (mục 15, GĐ5b, Q10–Q11, X28–X32). Đụng tới quy tắc quy kết 3.7 (R2/R5) → đọc mục 15.3 trước khi làm GĐ5.
> **Ràng buộc đã chốt:** KHÔNG dùng API Meta/nền tảng khác, KHÔNG có tính năng auto lead *(nghĩa là không tự kéo lead từ Meta/nền tảng; Lead mục 15 do **người dùng chủ động** nhập hoặc tick trong ghi chú, không vi phạm ràng buộc này)*. Mọi số liệu = **nhập tay** hoặc **dữ liệu nội bộ sẵn có** (bài đăng, khách hàng/UTM).

---

## 0. Mục tiêu & nguyên tắc thiết kế

### 0.1. Nhóm chức năng (giữ nguyên mã A–E của danh sách đề xuất)

| Nhóm | Mục | Tóm tắt |
|---|---|---|
| A | A1–A5 | Thẻ KPI, cột "Đăng gần nhất/Bài 30 ngày", heatmap lịch đăng, export Excel, tự nhận nền tảng + chuẩn hoá URL |
| B | B1–B5 | Mục tiêu nhịp đăng, nhắc việc, tab "Hôm nay", nhập nhiều URL, xếp hạng đóng góp (có phân quyền) |
| C | C1–C5 | Snapshot chỉ số nhập tay, lưới nhập nhanh, ảnh Insights, chỉ số từng bài, mục tiêu tháng |
| D | D1–D3 | Gắn Page ↔ UTM, báo cáo Page → khách/chốt/tiền nạp (có phân quyền), "khách trên mỗi bài" |
| E | E1–E5 | Tình trạng Page (danh mục động), timeline bàn giao, Page mồ côi, lưu trữ thay xoá cứng, phân loại bài |

### 0.2. Năm nguyên tắc để các nhóm KHÔNG xung đột nhau

1. **Một nguồn sự thật cho mọi trạng thái suy ra.** "Đang theo dõi", "im lặng", "nguy cơ trễ", "mồ côi" được tính ĐÚNG MỘT chỗ ở BE (mục 3). KPI, cột bảng, nhắc việc, tab Hôm nay, badge sidebar, export đều đọc kết quả đó. FE không tự tính lại.
2. **Một hàm dựng scope cho mọi truy vấn Page.** Danh sách, overview, today, stats, export dùng chung 1 query builder đã áp scope own/department/all. Nếu mỗi endpoint tự viết scope, số trên thẻ KPI sẽ lệch số trong bảng.
3. **Chỉ cộng thêm, không đổi nghĩa dữ liệu cũ.** Cột mới đều nullable/có default; `isActive`, `postCount`, `ownerIds` giữ nguyên hành vi (BE đang chạy, FE cũ vẫn chạy trong lúc deploy).
4. **Mỗi khái niệm một chỗ trên UI.** Không thêm 2 công tắc nghĩa gần nhau (mục 3.1 chốt: Theo dõi / Lưu trữ / Tình trạng có vai trò khác nhau, UI chỉ bày đúng thứ người dùng cần).
5. **Không thêm mục menu mới.** Tất cả nằm trong `/fanpage` dưới dạng Tab. Lý do kỹ thuật: `nav-guide-coverage.test.ts` bắt buộc mỗi mục `NAV_ITEMS` có `guides-content/<slug>.md` + ánh xạ `guide-slugs.ts`; thêm mục menu = thêm việc và test đỏ nếu quên.

---

## 1. Hiện trạng (đã đọc code thật)

| Hạng mục | Thực tế | Vị trí |
|---|---|---|
| Bảng | `fanpages`, `fanpage_owners` (N-N), `fanpage_posts`, `fanpage_notes`, `fanpage_platforms` | `backend/src/database/entities/fanpage*.entity.ts` |
| Bài đăng | `url` NOT NULL, `posted_date` **NULLABLE** (DATE thuần), `title`, `note`; index `(fanpage_id, posted_date)` đã có | `fanpage-post.entity.ts` |
| Danh sách | Trả `postCount`, `noteCount` bằng `loadRelationCountAndMap` (2 query đếm phụ), JOIN `owners` nên 1 Page = nhiều dòng thô, KHÔNG phân trang BE (FE phân trang 20/trang) | `fanpages.service.ts:52-108` |
| Scope | `FanpageAccessService.resolveScopes()` + `FanpageAccessHelper.allows()`; flags từng Page trả về cho FE (`canEdit`, `canManagePosts`…) | `fanpage-access.service.ts` |
| Permission | 9 key `fanpages.*`, `fanpage_posts.*`, `fanpage_notes.*`, `fanpage_platforms.manage` | `PERMISSIONS.md` §2.20 |
| Xoá | `fanpages.delete` (chỉ Admin) → CASCADE xoá bài + ghi chú | `fanpage.entity.ts` |
| Thông báo | `NotificationEntityType = 'customer' \| 'periodic_task'`; catalog dùng `RecipientRelation`; `emit()` có `dedupeSuffix` | `notifications/catalog/event-catalog.ts` |
| Cron | `vercel.json` đã dùng **2/2 cron** của gói Hobby (`zk-device-cron`, `auto-overdue`); nhắc deadline chạy bằng dịch vụ Uptime ngoài gọi endpoint có `CRON_SECRET` | `vercel.json`, `periodic-task-reminders-cron.controller.ts` |
| UTM | `customers.utm_id` (FK), `utms` có `visibility shared/restricted`, quản lý chính/phụ; **đã có** `UtmStatsService` (đếm khách theo trạng thái động, áp `customers.view` scope) | `utms/utm-stats.service.ts` |
| FE | `/fanpage` = 1 bảng + `ListFilterBar` + Drawer (Bài đăng / Ghi chú); `recharts` đã có; `ChartSkeleton`, `UtmStatsTab` dùng làm mẫu | `app/(dashboard)/fanpage/page.tsx`, `components/utms/UtmStatsTab.tsx` |
| Sidebar badge | Cache **60 giây theo từng user**, tự xoá cache khi có request ghi (CPU đang là mối quan tâm — xem `PLAN_CPU_OPTIMIZATION_ROUND2.md`) | `sidebar-badges.service.ts` |
| `exceljs` | Đã có ở BE; mẫu export: `leave-requests/leave-export.excel.ts` (tách model thuần + writer) | `backend/package.json` |

> ⚠️ **Trùng tên cần tránh:** `profile/page.tsx` có mục "Fanpage / Group đang quản lý" — đó là **Nhóm liên kết (link-groups)**, KHÔNG phải module `fanpages`. Mọi nhãn UI mới phải gọi rõ "Page" (module này), không dùng chữ "Group".

---

## 2. Quyết định (Q1, Q6, Q7 đã chốt 2026-11-11)

| # | Câu hỏi | Đề xuất mặc định (dùng nếu không trả lời) | Ảnh hưởng nếu đổi |
|---|---|---|---|
| Q1 ✅ | 1 UTM thuộc bao nhiêu Page? | **ĐÃ CHỐT: 1 UTM gắn được NHIỀU Page**, kèm quy tắc quy kết chặt (3.7): mỗi UTM có đúng 1 **Page chính** (ghi công), các Page còn lại là "tham gia" (hiện riêng, không cộng vào tổng) | Khách/tiền không bao giờ bị cộng trùng; số theo đúng phạm vi dữ liệu khách của người xem |
| Q2 | Ngưỡng "im lặng"? | **3 ngày** mặc định toàn hệ thống (lưu bảng `settings`, Admin sửa được) | Mỗi Page có ngưỡng riêng làm UI form phức tạp hơn |
| Q3 | Tuần tính từ ngày nào? | **Thứ Hai → Chủ Nhật, giờ VN** | Đổi sang CN → đổi luôn tiến độ tuần/nhắc việc |
| Q4 | Nhắc việc gửi cho ai? | **Tất cả người phụ trách của Page** (mỗi người tự tắt được trong Tuỳ chọn thông báo) | Chỉ người chính → ít ồn hơn nhưng Page nhiều người dễ "ai cũng nghĩ người kia lo" |
| Q5 | Gọi cron nhắc việc bằng cách nào? | **Endpoint mới `fanpages-cron/reminders` + thêm 1 monitor Uptime** (giống nhắc deadline) | Phương án B: gắn chung vào handler `deadline-reminders` (không cần cấu hình mới nhưng 1 lỗi có thể ảnh hưởng nhắc deadline — phải bọc try/catch) |
| Q6 ✅ | Xếp hạng nhân viên (B5)? | **ĐÃ CHỐT:** chỉ xếp hạng nhân viên **là người phụ trách Page VÀ có đóng góp dữ liệu** cho Page đó (bài đăng, số liệu); xem được qua **permission riêng có scope** (giống thống kê). Bỏ setting bật/tắt, quyền thay thế | Xem 3.8 cho định nghĩa chính xác |
| Q7 ✅ | Số tiền nạp có hiện trong báo cáo Page (D3)? | **ĐÃ CHỐT: CÓ**, gắn permission riêng `fanpage_revenue.view` (scope) + phạm vi khách + tôn trọng ẩn UI `tab:deposits`. Chỉ hiện **Tổng nạp**, KHÔNG hiện rút/nạp thực (xem 3.7) | Mở thêm rút/nạp thực là việc riêng, phải tuân rule "không để suy ra số đã ẩn" |
| Q10 ✅ | Khách có `fanpage_id` (Lead nhập tay) và khách quy qua UTM: ghi công thế nào? | **ĐÃ CHỐT (2026-11-11): `fanpage_id` ưu tiên hơn UTM** (mỗi khách vẫn ≤ 1 Page ghi công, Σ chính == Tổng giữ nguyên) — chi tiết 15.3 | Giữ "UTM là nguồn duy nhất" thì Lead nhập tay hiện trong tab Drawer nhưng **không** vào thống kê Page → hai con số khác nhau, dễ bị hỏi |
| Q11 ✅ | Lead tạo từ Page mặc định gán ai? | **ĐÃ CHỐT: không gán Sales** (khách vào luồng chia data sẵn có), `created_by` = người tạo, `source` = tên nền tảng của Page nếu khớp 1 nguồn đang mở ở `media_sources`, nếu không thì bắt chọn; **không** tự set `marketingUserId` (tránh bắn thông báo `customer.created` ngoài ý muốn); **SĐT bắt buộc** khi tạo Lead từ Page (khoá chống trùng, xem 15.8) | Auto set Marketing = người tạo sẽ bắn thông báo `customer.created` tới chính họ/nhóm khác — cần bạn xác nhận |
| Q8 | Bài "lên kế hoạch" (E5b)? | **Không làm ở v1** (chỉ gắn loại nội dung E5a) | Làm thì `posts.url` phải nullable + mọi phép đếm phải lọc `status = posted` (mục 4, X4) |
| Q9 | Ai được export (A4)? | Mặc định **giống `fanpages.view`** (có scope) | Hạn chế hơn: chỉ Admin/Assistant/Manager |

---

## 3. Luật nghiệp vụ dùng chung (nguồn sự thật — cài thành hàm thuần có test)

File mới: `backend/src/modules/fanpages/helpers/fanpage-cadence.helper.ts` (+ `.spec.ts`), mirror `utm-stats.helper.ts` (hàm thuần, không phụ thuộc DB).

### 3.1. Ba khái niệm "trạng thái" — vai trò khác nhau, KHÔNG gộp, KHÔNG trùng lặp

| Khái niệm | Cột | Ý nghĩa | Ai đổi | Ảnh hưởng |
|---|---|---|---|---|
| **Theo dõi** | `is_active` (đã có) | Có đang chăm Page này không | Người phụ trách | `false` = "Tạm ngừng": hiện mờ, bị loại khỏi KPI/nhắc việc |
| **Tình trạng thực** (E1) | `health_status_id` → danh mục động | Page ngoài đời đang thế nào: Bình thường / Bị hạn chế / Checkpoint / Bị khoá / Đã bỏ | Người phụ trách | Mỗi tình trạng có cờ `is_blocking` (Bị khoá, Đã bỏ = true) → loại khỏi KPI/nhắc việc |
| **Lưu trữ** (E4) | `archived_at` | Đã đóng hẳn, ẩn khỏi danh sách mặc định | Scope rộng | Ngầm đặt `is_active=false`; vẫn giữ toàn bộ lịch sử |

**Định nghĩa duy nhất:**

```
isTracked = is_active = 1 AND archived_at IS NULL AND (health.is_blocking = 0 OR health IS NULL)
```

Mọi con số "tổng Page", "im lặng", "nguy cơ", "Hôm nay", badge, nhắc việc CHỈ tính Page `isTracked`.

**UI rút gọn (tránh người dùng rối):** form chỉ có 2 điều khiển — ô chọn **"Tình trạng Page"** và công tắc **"Đang theo dõi"** (kèm câu giải thích: *tắt = tạm ngừng, không nhắc việc*). "Lưu trữ" là nút riêng ở menu `⋯` của dòng, không nằm trong form.

### 3.2. Trạng thái nhịp đăng (`cadence.state`) — 1 hàm, 5 giá trị

Đầu vào: `today` (VN), `lastPostDate`, `weekCount` (số bài có `posted_date` trong tuần Thứ Hai–CN hiện tại), `target` (`target_posts_per_week` hoặc null), `silentDays` (setting, mặc định 3), `createdAt` của Page, `isTracked`.

Ưu tiên từ trên xuống, dừng ở dòng khớp đầu tiên:

| Thứ tự | Điều kiện | `state` | Màu + icon (không dùng màu đơn độc) |
|---|---|---|---|
| 1 | `!isTracked` | `paused` | Xám, icon tạm dừng |
| 2 | Page tạo cách đây < `silentDays` ngày VÀ chưa có bài | `new` | Xanh dương nhạt, "Mới" |
| 3 | `lastPostDate` null (đã quá ân hạn) HOẶC `today − lastPostDate ≥ silentDays` | `silent` | Đỏ, icon cảnh báo |
| 4 | Có `target` VÀ `need = target − weekCount > 0` VÀ `need ≥ daysLeftInWeek` (gồm cả hôm nay) | `at_risk` | Cam |
| 5 | Còn lại | `ok` | Xanh lá |

Ghi chú: `daysLeftInWeek` = số ngày còn lại tính cả hôm nay (Thứ Hai = 7, Chủ Nhật = 1). `at_risk` nghĩa là "muốn kịp mục tiêu tuần thì từ giờ phải đăng MỖI ngày còn lại".

Giá trị phụ trả kèm: `daysSinceLastPost`, `weekCount`, `target`, `streak` (số ngày liên tiếp có bài tính đến hôm nay; nếu hôm nay chưa đăng thì tính đến hôm qua và **chưa bị đứt**), `postedToday` (boolean).

### 3.3. Thời gian

- "Hôm nay" luôn = `todayVnStr()` (`common/utils/date-vn.util`), mọi so sánh ngày dùng chuỗi `YYYY-MM-DD`. Cấm `new Date()` rồi `toISOString()` để lấy ngày (dính múi giờ — bug đã từng gặp, SKILL_DATABASE_MANAGEMENT §6).
- Cột ngày nghiệp vụ mới (`snapshot_date`, `month`) dùng `DATE`/`CHAR(7)` thuần giống `posted_date`.
- Bài **không có `posted_date`**: vẫn tính vào `postCount` (tổng), KHÔNG tính vào `lastPostDate`/`weekCount`/`streak`/heatmap. Để giảm trường hợp này: form thêm bài **mặc định ngày = hôm nay** (FE), không đổi BE (vẫn nullable để không phá dữ liệu cũ). Trong Drawer có dòng nhắc "N bài chưa có ngày đăng" + nút sửa nhanh.

### 3.4. Ghi nhận theo người phụ trách (Page có nhiều người)

- **Mức Page:** tổng/KPI đếm Page **1 lần**, không nhân theo số người phụ trách.
- **Tab "Hôm nay":** mức Page. Chỉ cần **một** người trong số người phụ trách đăng là Page biến mất khỏi danh sách "cần đăng" của **tất cả** (tránh nhắc trùng và đăng trùng).
- **Xếp hạng (B5):** theo 3.8 — chỉ người **phụ trách Page và có đóng góp dữ liệu** (bài do chính họ ghi, số liệu do chính họ nhập), không chia đều cho owners.

### 3.5. Quy ước đếm — đặt tên rõ để không gây hiểu nhầm

| Nhãn UI | Nghĩa | Nguồn |
|---|---|---|
| **Tổng bài** | Mọi bài của Page (kể cả chưa có ngày) | `postCount` cũ |
| **Bài 30 ngày** | Bài có `posted_date` trong 30 ngày gần nhất (gồm hôm nay) | tính mới |
| **Nhịp tuần `3/5`** | `weekCount / target` | tính mới |

### 3.6. Tổng hợp số liệu nhiều Page (chart tăng trưởng)

Page không có snapshot đúng ngày → dùng **giá trị gần nhất trước đó** (carry-forward); Page chưa có snapshot nào bị bỏ khỏi tổng và chart ghi chú *"N Page chưa có số liệu"*. Tăng trưởng "so với lần nhập trước" luôn kèm **số ngày cách nhau** (`+120 / 7 ngày`) để không so sánh táo với cam.

### 3.7. Quy kết khách & tiền nạp theo Page (D1/D3) — siết chặt dữ liệu khách hàng

**Bối cảnh dữ liệu:** mỗi khách có **đúng 1** `utm_id`; 1 UTM gắn được **nhiều Page** (Q1). Nếu cộng mọi Page có UTM đó thì 1 khách bị đếm nhiều lần. Quy tắc dưới đây loại bỏ hoàn toàn khả năng đó.

| # | Quy tắc | Hệ quả |
|---|---|---|
| R1 | Mỗi UTM có **đúng 1 Page chính** trong số Page nó được gắn. Page **đầu tiên** gắn UTM tự thành Page chính. | Mỗi khách có tối đa 1 Page "ghi công" |
| R2 | Các số **"ghi công"** của Page (khách mới, % chốt, tiền nạp, Khách/bài) chỉ tính từ UTM mà Page đó là **chính**. | **Σ mọi Page = tổng thật**, không bao giờ vượt |
| R3 | UTM gắn nhưng không phải chính → Page đó chỉ hiện chỉ số **"Tham gia"** (khách + tiền) có nhãn *"Dùng chung — không cộng vào tổng"*; không tham gia xếp hạng, không vào Khách/bài. | Thấy được đóng góp của Page phụ mà không làm sai tổng |
| R4 | Dòng **"Tổng"** = đếm **DISTINCT** khách (và tổng nạp của khách đó) trên tập UTM đã gắn ≥1 Page trong phạm vi — **không** cộng các dòng Page. Bất biến kiểm thử: `Σ cột "chính" == Tổng`. | Đối soát được |
| R5 | Khách không có UTM, hoặc UTM chưa gắn Page nào → dòng **"Chưa quy về Page"** (chỉ scope rộng thấy). | Tổng Page + "Chưa quy" = tổng khách trong phạm vi, khớp báo cáo UTM/khách |
| R6 | **Phạm vi dữ liệu khách:** chỉ đếm khách người gọi được xem theo `customers.view` (dùng đúng `CustomerAccessHelper.applyViewFilter` như `UtmStatsService`), bỏ khách **xoá mềm**. Quyền xem Page **không** mở rộng quyền xem khách. UI luôn ghi *"theo phạm vi dữ liệu của bạn"*. | Hai người xem cùng Page có thể thấy số khác nhau — đúng chủ ý |
| R7 | UTM `restricted` mà người xem không có quyền dùng (`canUse`) → tên bị che thành *"UTM hạn chế"* trong bảng/tooltip (số khách vẫn theo R6). | Không lộ tên chiến dịch hạn chế |
| R8 | **Mốc thời gian:** khách theo `customers.input_date` (cùng chuẩn thống kê UTM); tiền theo `deposits.deposit_date`. UI gắn nhãn rõ *"Khách mới (theo ngày nhập)"* và *"Tiền nạp (theo ngày nạp)"* để không so sánh nhầm hai cohort. | Không hiểu sai số |
| R9 | **Liên kết tính theo hiện tại**, không theo lịch sử: đổi Page chính của UTM thì số cả kỳ cũ dồn theo Page chính mới. Modal đổi phải cảnh báo rõ + ghi audit. | Minh bạch, không có "số ma" |
| R10 | **Gỡ UTM khỏi Page chính** khi UTM còn Page khác → **bị chặn (409)**: phải chọn Page chính mới trước (không tự chuyển ngầm). Gỡ khỏi Page **không phải chính** → bình thường. Gỡ khi là Page duy nhất → UTM về "Chưa quy về Page". | Số không nhảy bất ngờ |

**Quyền thao tác liên kết:**
- Gắn UTM vào Page: `fanpages.edit` trên Page **và** `UtmAccessHelper.canUse` trên UTM.
- Gỡ UTM: cùng điều kiện, hoặc scope `all`/`department` phủ tới Page. UTM hạn chế người sửa không có quyền dùng → chip **khoá**, không gỡ được (tránh phá liên kết của người khác).
- **Đổi Page chính:** cần `fanpages.edit` phủ tới **cả Page đang chính lẫn Page sẽ thành chính** (hoặc scope `all`), vì thao tác này chuyển số liệu giữa hai Page.
- Mọi thao tác ghi audit (`LINK_FANPAGE_UTM`, `UNLINK_FANPAGE_UTM`, `SET_PRIMARY_FANPAGE_UTM`) kèm snapshot; thêm nhãn ở `audit-meta.ts` + test lưới an toàn.

**Tiền nạp (D3) — cổng kiểm soát 4 lớp, thiếu lớp nào là **không trả** trường tiền:**
1. Người gọi có `fanpage_revenue.view` (scope own/department/all quyết định **Page nào** được hiện tiền).
2. Phiếu nạp chỉ tính cho khách trong phạm vi `customers.view` của người gọi (R6), `innerJoin customers` để loại khách xoá mềm (giống thống kê rút tiền hiện có).
3. Không bị Admin ẩn bằng UI Visibility: gọi `UiVisibilityService.getHiddenElementKeys(role, 'customers', departmentId, positionId, isRootAdmin)` — **resource luôn là `'customers'`** (key `tab:deposits` chỉ tồn tại ở resource này), truyền đủ phòng ban/chức vụ/cờ root admin của người gọi (cùng cách `customers-export.service.ts` đang làm; root admin được bỏ qua ẩn). Nếu tập trả về chứa `tab:deposits` → BE **bỏ hẳn** trường tiền khỏi response (không trả `null`, không trả 0), FE ẩn cột. Lưu ý: hiện `tab:deposits` mới được áp ở FE và export khách; đây là lần đầu một báo cáo thống kê tự enforce ở BE nên phải có test riêng. `tab:withdrawals` không ảnh hưởng vì báo cáo Page chỉ hiện Tổng nạp.
4. **Chỉ hiện Tổng nạp.** KHÔNG hiện "đã rút"/"nạp thực": quy ước sẵn có là lộ "nạp thực" cho phép suy ra số rút đã ẩn (`PERMISSIONS.md`, mục Rút tiền).
- Số tiền trả về dạng số (đã chuyển từ chuỗi DECIMAL), đơn vị theo phiếu nạp hiện có; xếp hạng nhân viên **không bao giờ** chứa tiền hay khách (3.8).

### 3.8. Xếp hạng nhân viên (B5) — quy tắc chính xác

- **Đủ điều kiện xếp hạng (user U, Page P) khi:** U ∈ người phụ trách của P (`fanpage_owners`) **và** U có **đóng góp dữ liệu** trên P trong kỳ.
- **Đóng góp dữ liệu** = (a) bài đăng do **chính U ghi** (`fanpage_posts.created_by_id = U`, có `posted_date` trong kỳ, bài **không** bị trùng URL) + (b) lần nhập số liệu do **chính U tạo** (`fanpage_metric_snapshots.created_by_id = U`, mỗi (Page, ngày) tính 1; sửa lại không tính thêm).
- **Không xếp hạng:** người nhập hộ nhưng không phụ trách Page đó (Admin/Manager/Assistant nhập giúp) — dữ liệu họ nhập vẫn lưu và vẫn tính vào thống kê Page, chỉ là không vào bảng xếp hạng; chú thích cuối bảng *"N bài do người không phụ trách ghi — không tính xếp hạng"*. Người không có đóng góp nào trong kỳ **không có dòng** (không hiện hạng 0).
- Chỉ xét Page `isTracked` (3.1).
- **Cột hiển thị:** Số bài · Lần nhập số liệu · Số Page đóng góp · % tuần đạt nhịp (trên các Page U đã đóng góp; Page nhiều người phụ trách tính cho **mọi** người đã đóng góp trong tuần đó). **Không có điểm tổng hợp ẩn**; mặc định sắp theo Số bài, bấm tiêu đề cột để đổi — tránh công thức người dùng không hiểu. Không có khách, không có tiền.
- **Quyền xem — `fanpage_rankings.view` (có scope):** `own` = chỉ thấy dòng của chính mình; `department` = nhân viên có phòng ban thuộc phòng ban mình quản lý; `all` = tất cả. **Thứ hạng tính trong tập người xem được phép thấy** (không lộ vị trí so với người ngoài phạm vi). Không có key → khối ẩn trên UI và endpoint trả 403.

---

## 4. Ma trận xung đột & cách xử lý

| Mã | Cặp/nhóm dễ xung đột | Rủi ro thực tế | Cách chặn |
|---|---|---|---|
| X1 | `is_active` ↔ E1 tình trạng ↔ E4 lưu trữ | 3 công tắc nghĩa gần nhau, KPI mỗi chỗ tính khác | `isTracked` duy nhất (3.1); UI chỉ 2 điều khiển |
| X2 | A2 "im lặng" ↔ B1 mục tiêu ↔ B2 nhắc ↔ B3 Hôm nay ↔ A1 KPI | Cùng 1 Page bị tô đỏ ở bảng nhưng không có trong Hôm nay | Cùng đọc `cadence.state` từ BE (3.2); FE cấm tự tính |
| X3 | List ↔ Overview ↔ Today ↔ Stats ↔ Export | Scope lệch → thẻ KPI "12 Page" nhưng bảng chỉ 10 dòng | Chung `FanpageScopedQuery` (mục 6.2); test đối chiếu: `overview.total === list.length` cho từng role |
| X4 | E5b bài "lên kế hoạch" ↔ cadence | Bài chưa đăng làm sai `lastPostDate` | Hoãn E5b (Q8). Nếu sau này làm: mọi phép đếm lọc `status='posted'` |
| X5 | `posted_date` NULL ↔ A2/A3/B1 | Bài cũ không có ngày không vào nhịp | 3.3: mặc định ngày hôm nay ở form + cảnh báo trong Drawer; không ép NOT NULL |
| X6 | Nhiều owner ↔ B2 nhắc ↔ B5 xếp hạng | Nhắc trùng, tính điểm nhân đôi | 3.4 + dedupe `emit()` theo (Page, mốc); xếp hạng theo người ghi bài |
| X7 | C1 snapshot ↔ C2 lưới nhập ↔ nhập lẻ trong Drawer | Trùng bản ghi cùng ngày | `UNIQUE (fanpage_id, snapshot_date)` + upsert; lưới và Drawer gọi **cùng** service |
| X8 | B1 mục tiêu tuần ↔ C5 mục tiêu tháng | Hai nơi đặt mục tiêu bài đăng, mâu thuẫn | B1 = **nhịp đăng** (kích hoạt nhắc). C5 = **kết quả** chỉ gồm *follower tăng thêm/tháng*, chỉ để báo cáo, **không** kích hoạt nhắc, **không** có mục tiêu số bài |
| X9 | D1 UTM ↔ Page nhiều-nhiều (Q1 đã chốt) | Khách/tiền bị cộng trùng khi 1 UTM gắn nhiều Page | Mô hình **Page chính / Page tham gia** (3.7 R1–R4): ghi công chỉ cho Page chính, Tổng đếm DISTINCT; ràng buộc DB `UNIQUE(primary_utm_id)` đảm bảo ≤1 Page chính/UTM; test bất biến `Σ chính == Tổng` |
| X10 | D1 ↔ UTM `visibility='restricted'` | Gắn UTM hạn chế để xem lén thống kê; hoặc gỡ phá liên kết của người khác | Gắn/gỡ cần `fanpages.edit` + `canUse` (hoặc scope rộng); chip khoá khi không có quyền dùng; tên UTM hạn chế bị che (R7) |
| X11 | D1/D3 ↔ scope khách hàng | Chủ Page thấy số khách/tiền của khách mình không được xem | Luôn áp `CustomerAccessHelper.applyViewFilter` với scope `customers.view` của người gọi (R6); quyền xem Page không mở rộng quyền xem khách; UI ghi "theo phạm vi dữ liệu của bạn" |
| X12 | D1 ↔ **Gộp UTM** (UtmMergeModal đã có) và xoá UTM | `fanpage_utms` trỏ UTM đã gộp/xoá; 2 UTM gộp có Page chính khác nhau | FK `ON DELETE CASCADE`; thêm bước **remap `fanpage_utms`** trong transaction gộp: khử trùng (Page đã gắn cả 2 UTM chỉ giữ 1 dòng), **Page chính của UTM đích được giữ**, Page chính của UTM nguồn thành "tham gia"; có test + audit |
| X13 | D3 tiền ↔ phân quyền tiền ↔ UI Visibility | Lộ tiền cho người không được xem; Admin đã ẩn `tab:deposits` nhưng báo cáo Page vẫn hiện | Cổng 4 lớp (3.7): `fanpage_revenue.view` + phạm vi khách + tôn trọng `tab:deposits` (BE bỏ hẳn trường) + chỉ Tổng nạp; test từng lớp |
| X14 | E4 lưu trữ ↔ `fanpages.delete` CASCADE | Xoá nhầm mất cả số liệu | Xoá cứng chỉ được từ tab "Đã lưu trữ", confirm hiển thị số bài/snapshot/ghi chú sẽ mất (đếm thật) |
| X15 | B2 nhắc ↔ giới hạn cron Vercel Hobby (2/2) | Không thể thêm cron thứ 3 | Q5: endpoint `CRON_SECRET` + Uptime ngoài; dedupe nên gọi lặp an toàn |
| X16 | A1/B3 badge ↔ CPU backend | Poll badge mỗi phút nặng DB | Badge `fanpage` chỉ **1 query gộp** + dùng sẵn cache 60s/user; chỉ tính cho user có `fanpages.view`; ghi bài/Page đã nằm trong cơ chế xoá cache khi có request ghi |
| X17 | Mở rộng list ↔ JOIN owners nhân dòng | Đếm sai khi JOIN thêm bảng | KHÔNG JOIN thêm vào query chính. Sau khi lấy danh sách Page, chạy **1 truy vấn gộp theo `fanpage_id IN (...)`** cho bài/ghi chú/snapshot/UTM (thay 2 `loadRelationCountAndMap` hiện tại) |
| X18 | Route `GET /fanpages/overview`, `/today`, `/export`, `/stats/*` ↔ `GET /fanpages/:id` | `ParseIntPipe` bắt "overview" → 400 | Khai báo các route tĩnh **trước** `@Get(':id')` trong `fanpages.controller.ts` (test e2e nhẹ cho từng route) |
| X19 | Permission mới ↔ FE hardcode role | Ẩn/hiện sai role tuỳ chỉnh | Mọi nút gate bằng `can('key')` / `flags` từ BE, cấm `role === 'admin'` (quy tắc mục 4 custom instructions) |
| X20 | Key permission chưa seed | Khoá vĩnh viễn endpoint cho mọi role trừ admin | Migration seed permission chạy **trước** khi deploy code dùng key (3 migration tách bạch như plan UTM) |
| X21 | Notification: thêm entity `fanpage` | `event-catalog.spec`, `recipient-resolvers`, FE `resolve-link.ts` không biết kiểu mới → thông báo bấm không đi đâu | Checklist GĐ3: sửa catalog + resolver + `resolve-link.ts` (+test) cùng 1 PR |
| X22 | React Query | Thêm bài xong, thẻ KPI/Hôm nay/badge vẫn cũ | Chuẩn hoá `fanpageKeys` factory + bảng "hành động → key phải invalidate" (mục 8.7) |
| X23 | Nhiều tài khoản cùng tạo migration | Trùng timestamp | `ls backend/src/database/migrations` lấy số lớn nhất tại thời điểm làm (hiện là `1786380000000`); luôn lớn hơn |
| X24 | Lưới nhập C2 ↔ người khác vừa sửa cùng Page/ngày | Ghi đè im lặng | Payload kèm `updatedAt` đã đọc; BE trả lỗi **từng dòng** nếu đã đổi → FE tô dòng đó, hỏi "Ghi đè?" |
| X25 | Đổi **Page chính** của UTM ↔ số liệu lịch sử | Số kỳ cũ "nhảy" giữa 2 Page, hai người xem số khác nhau | R9–R10: modal cảnh báo, cần quyền trên cả 2 Page, chặn gỡ Page chính khi còn Page khác, ghi audit |
| X26 | Xếp hạng ↔ nhập hộ / Page nhiều người phụ trách | Admin nhập hộ được lên hạng; điểm nhân đôi | 3.8: chỉ người phụ trách có đóng góp của chính mình; bài trùng URL không tính; sửa số liệu không tính thêm; không có điểm tổng hợp ẩn |
| X27 | Xếp hạng/Thống kê ↔ phạm vi xem | Người scope `own` thấy hạng so với người ngoài phạm vi | Hạng tính trong tập người xem được phép thấy; `own` chỉ thấy dòng mình |
| X28 | Lead nhập tay (`customers.fanpage_id`) ↔ quy kết UTM (3.7) | Cùng 1 khách bị ghi công cho 2 Page (1 theo UTM, 1 theo `fanpage_id`) → Σ vượt Tổng | Q10: `fanpage_id` ưu tiên; hàm quy kết 1 chỗ (`fanpage-outcomes`); test bất biến `Σ chính == Tổng` có thêm ca khách có cả `fanpage_id` lẫn UTM khác Page |
| X29 | Tạo khách từ Ghi chú ↔ `CustomersService.create` (không nhận `EntityManager`, tự `save` bằng repo riêng) | Không thể đặt 'tạo khách + lưu ghi chú' vào 1 transaction nếu không sửa hàm lõi của Customers | Thứ tự **tạo khách → lưu ghi chú**; khách lỗi (trùng SĐT, validate) → trả 4xx, **chưa lưu ghi chú**; ghi chú lỗi sau khi khách đã tạo (hiếm) → xoá mềm khách vừa tạo + audit. **Không sửa chữ ký `create()`** |
| X30 | SĐT trùng: `customers.phone` có **UNIQUE toàn cục** (kể cả bản ghi xoá mềm, index `IDX_88acd889…`) | Lead nhập từ Page trùng khách của người khác ngoài phạm vi xem → lỗi `DuplicatePhoneException` | Gọi `checkDuplicateContact` trước (cùng modal cảnh báo như trang Khách hàng); **không** 'gắn lại khách cũ vào Page' vì sẽ lộ/đổi khách ngoài phạm vi; thông báo chỉ nêu tối thiểu như hàm đó đang làm |
| X31 | Quyền ghi chú Page ≠ quyền tạo khách | Người có `fanpage_notes.manage` nhưng không có `customers.create` tạo khách ké qua ghi chú | BE kiểm **cả hai** (endpoint ghi chú có `lead` ⇒ thêm `scopeOf(user,'customers.create')`); FE ẩn mục 'Thêm khách' theo `can('customers.create')` |
| X32 | Tab Data khách hàng ↔ scope `customers.view` | Người xem Page thấy số khách ≠ người khác (scope own/department) | Luôn `CustomerAccessHelper.applyViewFilter`; nhãn *"theo phạm vi dữ liệu của bạn"*; số trên badge tab = số trong bảng (cùng 1 query) |

---

## 5. Thiết kế dữ liệu (migration)

Quy ước: `IF NOT EXISTS`, `up()`/`down()` đối xứng, cột `string | null` trong entity khai `type: 'varchar'`, `synchronize:false` giữ nguyên, **không sửa migration cũ**, không tự chạy lên DB thật.

### 5.1. Chuỗi migration (3 file DDL + 1 file seed quyền, tách bạch)

| # | Tên | Nội dung |
|---|---|---|
| M1 | `AddFanpageCadenceHealthArchive` | `fanpages`: `target_posts_per_week TINYINT UNSIGNED NULL`, `health_status_id INT NULL` (FK), `health_note VARCHAR(255) NULL`, `health_changed_at` (kiểu như `utms.locked_at`), `archived_at` (cùng kiểu). Bảng mới `fanpage_health_statuses` (`id, name, color, is_blocking, is_default, is_locked, sort_order`) + **seed 5 dòng** (Bình thường [default], Bị hạn chế, Checkpoint, Bị khoá [blocking], Đã bỏ [blocking]) + **backfill** mọi Page cũ → "Bình thường". Index `IDX_fanpages_health`, `IDX_fanpages_archived`. `fanpage_platforms.url_domains VARCHAR(255) NULL` (+ seed domain cho nền tảng trùng tên Facebook/TikTok/Instagram/YouTube nếu có; **chỉ UPDATE dòng đang rỗng**) |
| M2 | `CreateFanpageMetrics` | `fanpage_metric_snapshots` (`id, fanpage_id FK CASCADE, snapshot_date DATE, followers/reach/engagement/views INT UNSIGNED NULL, note VARCHAR(255) NULL, created_by_id, updated_by_id, created_at, updated_at`; **UNIQUE** `(fanpage_id, snapshot_date)`; INDEX `snapshot_date`). `fanpage_targets` (`id, fanpage_id FK CASCADE, month CHAR(7) 'YYYY-MM', target_follower_gain INT UNSIGNED NULL`; UNIQUE `(fanpage_id, month)`). `fanpage_posts` thêm `views/likes/comments/shares INT UNSIGNED NULL`, `metrics_updated_at`, `post_type_id INT NULL`. Bảng `fanpage_post_types` (`id, name, color, is_locked, sort_order`) |
| M3 | `CreateFanpageUtms` | `fanpage_utms` (`id, fanpage_id FK CASCADE, utm_id FK CASCADE, primary_utm_id INT NULL, created_by_id, created_at`). **UNIQUE `(fanpage_id, utm_id)`** (không gắn trùng cặp); **UNIQUE `primary_utm_id`** + `CHECK (primary_utm_id IS NULL OR primary_utm_id = utm_id)` ⇒ `primary_utm_id = utm_id` nghĩa là Page này là **Page chính**, `NULL` là "tham gia"; MySQL cho nhiều NULL nên DB tự đảm bảo mỗi UTM ≤ 1 Page chính. INDEX `utm_id`. Không cần cột `is_primary` riêng (tránh hai nguồn sự thật). `CHECK` cần MySQL ≥ 8.0.16 (README dự án nêu MySQL 8.0+): kiểm tra phiên bản DB thật trước khi chạy M3; nếu thấp hơn, bỏ `CHECK` và chặn bằng service + test |
| M4 | `SeedFanpageAnalyticsPermissions` | **8 key** mới (mục 7), seed theo bảng mặc định ở mục 7 (khai rõ `department_id` NULL hay cụ thể) + 1 setting |

Không có migration nào xoá/đổi kiểu cột cũ. Không thêm UNIQUE lên `fanpage_posts.url` (dữ liệu cũ có thể trùng → migration sẽ lỗi); chống trùng làm ở service (mục 6.4).

### 5.2. Setting mới (bảng `settings`, không cần migration cấu trúc)

| key | Mặc định | Dùng cho |
|---|---|---|
| `fanpage.silent_days` | `3` | Q2 ngưỡng im lặng |

(Seed trong M4 bằng `INSERT ... ON DUPLICATE KEY` không ghi đè giá trị đã có.)

---

## 6. Thiết kế Backend

### 6.1. Cấu trúc file (thêm vào `backend/src/modules/fanpages/`)

```
helpers/fanpage-cadence.helper.ts        # 3.2 - hàm thuần + spec
helpers/fanpage-metrics.helper.ts        # delta, carry-forward, bucket tuần/tháng + spec
helpers/fanpage-url.helper.ts            # chuẩn hoá URL bài/Page, nhận domain→nền tảng + spec
fanpage-scoped-query.ts                  # 6.2 - 1 chỗ dựng QB + áp scope
fanpage-overview.service.ts              # overview + today + badge count
fanpage-metrics.service.ts               # snapshots, grid bulk, targets
fanpage-stats.service.ts                 # growth / posts-by-week / top-posts
fanpage-outcomes.service.ts              # D1/D3: quy kết khách + tiền theo 3.7 (tái dùng CustomerAccessHelper, UiVisibilityService)
fanpage-rankings.service.ts              # B5 theo 3.8
fanpage-utms.service.ts                  # gắn/gỡ UTM, Page chính, chặn 409 (3.7 R1/R10)
fanpage-export.service.ts + fanpage-export.excel.ts   # mirror leave-export
fanpage-reminders.service.ts + fanpages-cron.controller.ts
fanpage-statuses.service.ts, fanpage-post-types.service.ts   # mirror fanpage-platforms.service.ts (khoá, KHÔNG xoá)
```

### 6.2. `FanpageScopedQuery` (chống xung đột X3, X17)

- Tách phần dựng scope hiện nằm inline ở `fanpages.service.ts::list` thành 1 hàm dùng chung: `buildScopedIds(user, filters)` trả **danh sách `fanpage_id`** đã áp scope + bộ lọc (nền tảng, owner, tình trạng, lưu trữ, tìm kiếm).
- Mọi endpoint (list, overview, today, stats, export, badge) lấy ID từ đây rồi chạy truy vấn gộp theo `IN (:...ids)`.
- Giữ nguyên các subquery `fanpage_owners` đã viết (và nhớ: `BooleanTransformer` không chạy trong QueryBuilder → truyền `1/0`).
- Danh sách có thể lên hàng trăm Page: truy vấn gộp theo ID chạy theo lô 500 ID/lần.

### 6.3. Endpoints (thứ tự khai báo: route tĩnh trước `:id`)

| Method + route | Permission | Ghi chú |
|---|---|---|
| `GET /fanpages` *(mở rộng)* | `fanpages.view` | Thêm trường: `cadence{state,daysSinceLastPost,weekCount,target,streak,postedToday}`, `posts30d`, `lastPostDate`, `health{id,name,color}`, `latestMetrics{followers,date,delta,deltaDays}`, `utms[]`, `isOrphan`. Thêm filter: `healthStatusId`, `cadence`, `archived=false\|true\|all` (**mặc định `false`**), `orphan=true`, `utmId`. Trường cũ giữ nguyên |
| `GET /fanpages/overview?range=` | `fanpages.view` | Số cho thẻ KPI + `pagesWithoutMetrics` |
| `GET /fanpages/today` | `fanpages.view` | Page `isTracked` có `state ∈ {silent, at_risk}` hoặc chưa đăng hôm nay, nhóm theo mức khẩn |
| `GET /fanpages/stats/growth?range=&groupBy=` | `fanpage_stats.view` | Chuỗi follower theo tuần/tháng (3.6) |
| `GET /fanpages/stats/posts?range=` | `fanpage_stats.view` | Số bài theo tuần (chart). Xếp hạng theo người có endpoint riêng bên dưới |
| `GET /fanpages/stats/top-posts?range=&limit=` | `fanpage_stats.view` | Xếp theo `likes+comments+shares`, bỏ bài NULL |
| `GET /fanpages/stats/outcomes?range=` | `fanpage_stats.view` | D1/D3 theo 3.7. Trả: dòng từng Page (chính / tham gia), dòng "Tổng", dòng "Chưa quy về Page" (scope rộng). **Trường tiền chỉ có khi qua đủ cổng 4 lớp** (có `fanpage_revenue.view`, không bị ẩn `tab:deposits`) |
| `GET /fanpages/stats/rankings?range=` | `fanpage_rankings.view` | B5 theo 3.8; thứ hạng tính trong tập người xem được thấy |
| `GET /fanpages/export` | `fanpages.export` | `.xlsx`, trần 20.000 dòng/sheet |
| `PATCH /fanpages/:id/archive` · `/unarchive` | `fanpages.edit` | Ghi audit |
| `GET /fanpages/:id/history` | `fanpages.view` | E2: chỉ các sự kiện đổi người phụ trách, tình trạng, theo dõi, lưu trữ; **không** mở `audit.view` cho người dùng thường |
| `GET /fanpages/:id/heatmap?weeks=12` | `fanpages.view` | Chỉ `{date,count}` |
| `PUT /fanpages/:id/utms` | `fanpages.edit` + `canUse` | Thay toàn bộ tập UTM (cùng kiểu `ownerIds`); UTM mới gắn lần đầu tự là Page chính; gỡ Page chính khi còn Page khác → 409 (R10) |
| `PATCH /fanpages/:id/utms/:utmId/primary` | `fanpages.edit` trên **cả hai** Page (hoặc scope `all`) | Đặt Page này làm Page chính của UTM (R9); ghi audit |
| `POST /fanpages/:id/posts/bulk` | `fanpage_posts.manage` | Tối đa 50 URL, 1 transaction, trả `created[]`, `skipped[{url,reason}]` |
| `GET /fanpages/:id/snapshots?from&to` | `fanpages.view` | |
| `PUT /fanpages/:id/snapshots/:date` · `DELETE …` | `fanpage_metrics.manage` · `fanpage_metrics.delete` | Upsert (X7) |
| `GET /fanpage-metrics/grid?date=` | `fanpage_metrics.manage` | Các Page trong scope + giá trị lần trước |
| `PUT /fanpage-metrics/bulk` | `fanpage_metrics.manage` | Kiểm tra từng dòng, lỗi trả theo dòng (X24) |
| `PUT /fanpages/:id/targets/:month` | `fanpage_metrics.manage` | C5 |
| `GET/POST/PATCH /fanpage-health-statuses` (+ `lock/unlock`) | xem `fanpages.view` · sửa `fanpage_statuses.manage` | Không có DELETE |
| `GET/POST/PATCH /fanpage-post-types` (+ `lock/unlock`) | xem `fanpages.view` · sửa `fanpage_post_types.manage` | Không có DELETE |
| `GET /fanpages-cron/reminders` | `CRON_SECRET` (không JWT) | Q5; mirror `PeriodicTaskRemindersCronController` |

### 6.4. Quy tắc validate

- **URL bài đăng (A5):** chuẩn hoá để so trùng — hạ chữ thường host, bỏ `#fragment`, bỏ tham số theo dõi (`utm_*`, `fbclid`, `mibextid`…), bỏ dấu `/` cuối. **Trùng trong cùng Page → 409** kèm `existingPostId` + ngày đăng. (Chỉ chặn ở service, không thêm UNIQUE DB.)
- **Snapshot:** số không âm; ngày không ở tương lai; ít nhất 1 chỉ số có giá trị. Giảm >50% so với lần trước chỉ là **cảnh báo FE** (không chặn) để bắt lỗi gõ nhầm.
- **`target_posts_per_week`:** 1–35, hoặc null = không đặt.
- **Gắn UTM (Q1: nhiều Page):** UTM đã thuộc Page khác vẫn gắn được — Page mới là "tham gia", FE hiện chip *"Dùng chung với Page X, Y"* và "⭐ Page chính: Z". Muốn thành Page chính phải dùng thao tác riêng (cần quyền cả hai Page, R9). Gỡ Page chính khi UTM còn Page khác → 409 kèm danh sách Page để chọn chính mới (R10).

### 6.5. Hiệu năng (CPU Fluid đang bị theo dõi)

- Không thêm query theo từng dòng. List thêm đúng **1 truy vấn gộp cho bài** (`MAX(posted_date)`, đếm 30 ngày, đếm tuần, đếm tổng — dùng index `(fanpage_id, posted_date)` có sẵn), **1 cho snapshot mới nhất + trước đó** (cửa sổ `ROW_NUMBER` hoặc 2 truy vấn ngắn), 1 cho UTM. Thay thế 2 `loadRelationCountAndMap` hiện tại nên **tổng số query không tăng**.
- `overview`/`today`: cache ngắn trong bộ nhớ instance (30–60 giây, theo user) theo mẫu của sidebar badges, xoá cache khi có request ghi.
- Heatmap/stats: giới hạn khoảng thời gian tối đa 366 ngày (cùng ngưỡng UTM stats).
- Export: ghi từng dòng vào workbook, không nạp toàn bộ entity vào RAM.

---

## 7. Phân quyền

| Key mới | Loại | Scope | Seed mặc định | Dùng cho |
|---|---|---|---|---|
| `fanpages.export` | có scope | own/department/all | Admin/Assistant=all, Manager=department, Employee=own *(Q9)* | A4 |
| `fanpage_metrics.manage` | có scope | so với người phụ trách Page | như `fanpages.view` | C1, C2, C4*, C5 |
| `fanpage_metrics.delete` | có scope | | **chỉ Admin = all** | Xoá snapshot |
| `fanpage_stats.view` | có scope | own/department/all (theo Page) | như `fanpages.view` (Admin/Assistant=all, Manager=department, Employee=own) | Mở **tab Thống kê** (tăng trưởng, nhịp đăng, top bài, Page→Khách **không tiền**) |
| `fanpage_rankings.view` | có scope | own = chỉ dòng mình · department = người thuộc phòng ban mình quản lý · all | Admin/Assistant=all, Manager=department, **Employee=KHÔNG** | Khối Xếp hạng (3.8) |
| `fanpage_revenue.view` | có scope | quyết định **Page nào** được hiện tiền nạp (vẫn bị chặn bởi phạm vi khách, 3.7) | Admin=all, Assistant=all, Manager=department, **Employee=KHÔNG** (Admin mở dần theo override phòng ban, ví dụ Marketing) | Cột/ô Tiền nạp (D3) |
| `fanpage_statuses.manage` | nhị phân | — | Admin, Assistant | Danh mục Tình trạng Page |
| `fanpage_post_types.manage` | nhị phân | — | Admin, Assistant | Danh mục Loại bài |

\* C4 (số liệu từng bài) dùng `fanpage_posts.manage` sẵn có vì là sửa bài đăng — không tạo key riêng.

**Lớp quyền chồng nhau (giao của các điều kiện, không phải hoặc):**
- Xem **tiền nạp** = `fanpage_revenue.view` (Page trong scope) ∩ khách trong `customers.view` scope ∩ không bị ẩn `tab:deposits`. Có key nhưng bị ẩn UI → không thấy tiền.
- Xem **số khách theo Page** = `fanpage_stats.view` ∩ `customers.view` scope (3.7 R6).
- Xem **xếp hạng** = `fanpage_rankings.view` (scope quyết định tập người thấy được).
- Tab **Thống kê** chỉ hiện khi `can('fanpage_stats.view')`; thẻ KPI nhịp đăng ở tab Danh sách vẫn thuộc `fanpages.view`.

**Cố ý KHÔNG thêm key** cho: lưu trữ/bỏ lưu trữ (= `fanpages.edit`), gắn/gỡ UTM (= `fanpages.edit` + `canUse`), đổi Page chính (= `fanpages.edit` trên cả hai Page). Ít key hơn = ma trận phân quyền của Admin gọn hơn.

**Việc bắt buộc đi kèm:**
- Mở rộng `FANPAGE_FLAG_KEYS` (`fanpage-access.service.ts`) thêm `canManageMetrics`, `canDeleteMetrics`, `canExport` → FE ẩn nút theo flags, không đoán.
- Cập nhật `PERMISSIONS.md` §2.20, `lib/permissions/resource-labels.ts`, `lib/api/audit-meta.ts` (+ `audit-meta.test.ts`).
- Giữ lối thoát hiểm admin ở cả 3 lớp (`PermissionGuard`, `RolesService.getMyPermissions()`, `FanpageAccessService.scopeOf` đã có `isRootAdmin`) — không viết helper kiểm quyền mới bỏ sót bypass.
- Ma trận có 2 tầng (Toàn cục / override phòng ban): migration seed phải khai rõ `department_id IS NULL` hay cụ thể (bài học bug xoá nhầm override).

---

## 8. Thiết kế UI/UX

### 8.1. Nguyên tắc

1. **Câu hỏi đầu tiên người dùng có là "hôm nay tôi cần làm gì?"** → người chỉ có scope `own` mở `/fanpage` là vào thẳng tab **Hôm nay**; Manager/Admin vào tab **Danh sách** (có thẻ KPI).
2. **Mỗi màn hình 1 hành động chính** (nút xanh duy nhất): Hôm nay = "Thêm bài"; Danh sách = "Thêm Page"; Nhập số liệu = "Lưu".
3. **Nhập ít nhất có thể:** ngày mặc định hôm nay; nền tảng tự nhận từ link; ô số liệu cho phép dán nhiều dòng từ Excel; lần nhập trước hiện mờ cạnh ô để so sánh.
4. **Màu luôn đi kèm icon + chữ** (không chỉ dựa vào màu — tránh người mù màu và in trắng đen). Bảng màu cố định toàn module: Xanh lá = ổn · Cam = nguy cơ · Đỏ = im lặng · Xám = tạm ngừng · Xanh nhạt = mới.
5. **Hiện dần theo nhu cầu (progressive disclosure):** cột Followers/UTM chỉ xuất hiện khi có dữ liệu; khách và tiền chỉ xuất hiện khi người dùng có quyền (tab Thống kê/Drawer); Page chưa có số liệu hiện lời mời *"Nhập số liệu đầu tiên"* thay vì cột trống toàn dấu `—`.
6. **Có đường lùi:** mọi thao tác ghi hàng loạt có xem trước; mọi thông báo thành công có "Hoàn tác" khi khả thi (xoá snapshot mềm không làm — thay bằng confirm rõ ràng).
7. **Trạng thái rỗng, đang tải, lỗi đều có thiết kế** (`Empty` có hướng dẫn bước kế tiếp, `ChartSkeleton`, `Result` + nút thử lại).
8. **Đồng bộ trạng thái lên URL** (`?tab=&cadence=&range=&owner=`): mở lại đúng chỗ, gửi link cho đồng nghiệp, nút Back không mất bộ lọc.

### 8.2. Khung trang `/fanpage`

```
Quản lý Fanpage                         [Nền tảng ⚙] [Tình trạng ⚙] [Xuất Excel ⬇] [+ Thêm Page]
┌ Hôm nay ┬ Danh sách ┬ Thống kê ┬ Nhập số liệu ┐   ← Tabs (ẩn tab người dùng không có quyền)
```

- Tab **Thống kê** chỉ hiện khi `can('fanpage_stats.view')`; tab **Nhập số liệu** khi `can('fanpage_metrics.manage')`. Nút ⚙/⬇ chỉ hiện khi `can(...)`. Dưới 768px: các nút phụ gộp vào menu `⋯`.
- Không thêm mục menu (nguyên tắc 5). `guides-content/fanpage.md` (hiện `published: false`) được viết nội dung và chuyển `published: true` ở GĐ7.

### 8.3. Tab "Danh sách" (A1, A2, A5, E1, E3, E4, D1)

```
┌───────────┬───────────┬───────────┬───────────┬───────────┬──────────────┐
│ Page      │ Bài tuần  │ ⚠ Im lặng │ ◔ Nguy cơ │ 👤 Chưa có │ ▲ Follower   │
│ theo dõi  │ này       │           │   trễ     │  người chăm│  30 ngày     │
│   24      │  31 / 40  │    3      │    5      │     1      │  +1.240      │
└───────────┴───────────┴───────────┴───────────┴───────────┴──────────────┘
 (bấm thẻ = lọc bảng bên dưới, thẻ đang lọc có viền; bấm lần nữa = bỏ lọc)
 [Tìm...] [Nền tảng▾] [Người phụ trách▾] [Tình trạng▾] [Kỳ: 30 ngày▾]  [Hiện đã lưu trữ ☐]

 Page / Nền tảng        Người phụ trách   Tình trạng   Nhịp đăng              Followers      UTM          ⋯
 ● Review Sàn A  [FB]   [An][Bình]        ● Bình thường ▓▓▓░░ 3/5 · hôm qua    12.400 ▲+120/7n   3 UTM         👁 ✎ ⋯
 ● Tin Gold  [TikTok]   [Chi]             ◐ Hạn chế     ▓░░░░ 1/5 · 5 ngày ⚠   8.100  —          —            👁 ✎ ⋯
 ○ Page cũ  [IG]  (mờ)  [Nam]             ⛔ Bị khoá     Tạm ngừng             —              —             👁 ✎ ⋯
```

Chi tiết:
- **Giảm cột:** gộp "Nền tảng" + "Tên Page" thành 1 ô 2 dòng; cột "Ghi chú (đếm)" chuyển thành tooltip trong ô Nhịp đăng; "Tổng bài" nằm trong tooltip. Mặc định tối đa ~7 cột để không phải cuộn ngang.
- **Ô Nhịp đăng** = thanh tiến độ `weekCount/target` + chữ tương đối ("hôm qua", "5 ngày trước") + icon trạng thái; tooltip hiện ngày đầy đủ, streak, tổng bài, bài 30 ngày. Page không đặt mục tiêu: chỉ hiện chữ "Đăng gần nhất" (không thanh).
- **Cột Followers** ẩn nếu không Page nào có dữ liệu; ô trống có nút nhỏ "＋ Nhập" (chỉ khi `canManageMetrics`). **Cột UTM** chỉ hiện số UTM đã gắn (chip, bấm mở Drawer). **Số khách và tiền nạp KHÔNG hiện ở danh sách** — chỉ ở tab Thống kê và Drawer, nơi đã qua cổng quyền 3.7 (giảm bề mặt lộ dữ liệu và giảm tải truy vấn).
- **Menu `⋯` mỗi dòng:** Lưu trữ / Bỏ lưu trữ, Đổi người phụ trách (nếu scope rộng), Xoá (chỉ hiện ở tab Đã lưu trữ — X14).
- **Mobile (<768px):** bảng thành danh sách thẻ (mỗi Page 1 thẻ: tên, nhịp, nút "Thêm bài").
- **Chọn nhiều dòng** (checkbox) → thanh hành động nổi: "Giao lại người phụ trách", "Đặt mục tiêu tuần", "Đổi tình trạng" — chỉ hiện hành động mà `flags` cho phép trên **mọi** dòng đã chọn; dòng không đủ quyền hiện lý do ("3 Page bạn không có quyền sửa").

### 8.4. Tab "Hôm nay" (B3)

```
Hôm nay, Thứ Tư 11/11 — bạn có 3 Page cần đăng bài
┌────────────────────────────────────────────────────────────┐
│ 🔴 Tin Gold [TikTok]   Chưa đăng 5 ngày          [+ Thêm bài]│
│ 🟠 Review Sàn A [FB]   Mới 3/5 tuần, còn 4 ngày  [+ Thêm bài]│
│ 🟠 Forex Việt [FB]     Mới 2/5 tuần, còn 4 ngày  [+ Thêm bài]│
└────────────────────────────────────────────────────────────┘
Đã đăng hôm nay (2)  ▸ (thu gọn)        Đang ổn (19) ▸ (thu gọn)
```

- Nút **"+ Thêm bài"** mở modal rút gọn đã chọn sẵn Page + ngày hôm nay; chỉ 1 ô bắt buộc (URL); Enter để lưu; lưu xong thẻ tự chuyển xuống "Đã đăng hôm nay" và hiện toast "Hoàn tác" 5 giây.
- Khi hết việc: màn hình xanh *"Hôm nay bạn đã đăng đủ 🎉"* + liên kết tới tab Thống kê.
- Badge đỏ trên menu "Fanpage" = số Page đang cần hành động (cùng nguồn với tab này, X2/X16).

### 8.5. Tab "Thống kê" (A3, C1, C4, D1, D3, B5)

Bộ chọn kỳ duy nhất ở đầu tab (Tuần này / Tháng này / 30 ngày / Tuỳ chỉnh) áp cho mọi biểu đồ.

| Khối | Nội dung | Ghi chú |
|---|---|---|
| Tăng trưởng follower | Line chart (recharts) tổng + chọn tối đa 5 Page để so sánh | Chú thích "N Page chưa có số liệu" (3.6) |
| Nhịp đăng theo tuần | Bar chart số bài/tuần (đường ngang = tổng mục tiêu) | Cùng trục thời gian với khối trên |
| Top bài hiệu quả | Bảng 10 dòng + link mở bài | Chỉ bài có số liệu; chú thích "N bài chưa nhập số liệu" |
| Page → Khách & Tiền nạp | Bảng theo 8.5.1 (Page chính / tham gia / Tổng / Chưa quy về Page) | Ghi "theo phạm vi dữ liệu của bạn" (R6); bấm dòng mở `UtmStatsCustomersDrawer` tái sử dụng; cột Tiền chỉ khi qua cổng 4 lớp |
| Xếp hạng đóng góp | Theo 8.5.2 | **Chỉ hiện khi** `can('fanpage_rankings.view')` |

- Mỗi khối là 1 Card có skeleton riêng; khối lỗi không làm hỏng khối khác.
- Mọi biểu đồ có bảng số liệu bật/tắt phía dưới (truy cập và sao chép dễ).

#### 8.5.1. Khối "Page → Khách & Tiền nạp"

```
Kỳ: 30 ngày · theo phạm vi dữ liệu của bạn                         [Ẩn UTM dùng chung ☐]
 Page            Khách mới*   % chốt   Khách/bài   Tiền nạp**    Tham gia (không cộng tổng)
 Review Sàn A       18         22%       1,8        $12.400       +6 khách · +$3.100 (2 UTM dùng chung)
 Tin Gold           11         9%        0,7        $2.050        —
 ────────────────────────────────────────────────────────────────
 Tổng (khách khác nhau)  29    17%                  $14.450
 Chưa quy về Page         7  (khách không có UTM / UTM chưa gắn Page)       [chỉ scope rộng]
 * theo ngày nhập khách   ** theo ngày nạp   ⓘ Page chính ghi công; Page tham gia hiện riêng
```
- Cột **Tiền nạp** (và "+$ tham gia") **biến mất hoàn toàn** khi người xem không qua đủ cổng 4 lớp; không hiện ô khoá hay số 0 (tránh suy luận).
- Bấm số khách → mở danh sách khách (tái dùng `UtmStatsCustomersDrawer`) đã lọc đúng phạm vi người xem.
- Ô "Tham gia" có tooltip liệt kê UTM dùng chung và Page chính của từng UTM (tên UTM hạn chế bị che, R7).
- Dòng Tổng luôn đếm khách DISTINCT (R4) và **bằng tổng cột "Khách mới" của các Page chính**; phần "Tham gia" không cộng vào. Hover dòng Tổng hiện câu giải thích đó.

#### 8.5.2. Khối "Xếp hạng đóng góp"

```
Xếp hạng người phụ trách có đóng góp dữ liệu · kỳ 30 ngày               (phạm vi: phòng Marketing)
 #  Nhân viên    Số bài ▼   Lần nhập số liệu   Số Page   % tuần đạt nhịp
 1  Bình           42            9                4          88%
 2  An             37           12                3          100%
 …
 ⓘ Chỉ tính người phụ trách Page và dữ liệu do chính họ nhập · 5 bài do người không phụ trách ghi không tính
```
- Không có khách, không có tiền, không có điểm tổng hợp. Bấm tiêu đề cột để đổi cách sắp.
- Người scope `own` chỉ thấy một dòng *"Đóng góp của bạn"* (không thấy người khác); thiếu quyền → khối không render.

### 8.6. Tab "Nhập số liệu" (C2) và Drawer chi tiết

**Lưới nhập nhanh**

```
Ngày số liệu: [11/11/2026 ▾]   Hiện: ◉ Page chưa nhập hôm nay  ○ Tất cả    [Lưu 3 thay đổi]
 Page            Followers        Reach          Tương tác      Ghi chú
 Review Sàn A    [12.520] (12.400) [ 5.200] (—)   [  310] (—)    [        ]
 Tin Gold        [      ] (8.100)  [      ]       [      ]       [        ]
```
- Số trong ngoặc mờ = lần nhập trước; ô vừa sửa tô nền nhạt; thanh trên cùng đếm số thay đổi chưa lưu.
- **Dán từ Excel** nhiều dòng/cột vào ô đầu tiên của dòng; Tab/Enter di chuyển ô; rời tab khi chưa lưu → hỏi xác nhận.
- Lưu: dòng lỗi (âm, giảm >50% nghi gõ nhầm, bị người khác sửa trước) tô viền và nêu lý do ngay dòng; dòng hợp lệ vẫn lưu. Giảm >50% là cảnh báo có nút "Vẫn lưu".

**Drawer chi tiết Page** — tabs: **Tổng quan** (mới) · Bài đăng · Ghi chú · Số liệu (mới) · Lịch sử (mới)
- *Tổng quan:* 4 chỉ số lớn (Nhịp tuần, Streak, Follower + delta, Khách) + **heatmap 12 tuần** (lưới CSS tự vẽ, không thêm thư viện; ô theo số bài; bấm ô → chuyển sang tab Bài đăng lọc đúng ngày) + hộp "Mục tiêu đăng/tuần" chỉnh tại chỗ + danh sách UTM đã gắn (chọn bằng `UtmSelect` chế độ nhiều; mỗi chip hiện **⭐ Page chính** hoặc *"Dùng chung với Page X, Y"*; chip UTM hạn chế không có quyền dùng bị khoá + che tên; đổi Page chính qua modal cảnh báo R9) + khối **Khách & Tiền nạp của Page này** (cùng cổng quyền 3.7) + dòng nhắc "N bài chưa có ngày".
- *Bài đăng:* thêm nút **"Dán nhiều link"** (B4): textarea mỗi dòng 1 URL → bảng xem trước (✓ hợp lệ / ⚠ trùng / ✕ sai) → "Thêm N bài"; cột Loại bài (tag màu); cột Số liệu bài (View/Like/Cmt/Share) sửa nhanh tại chỗ, ô trống hiện `＋`.
- *Số liệu:* chart follower của Page + bảng snapshot, nút "＋ Thêm số liệu" mở modal 1 dòng (cùng service với lưới).
- *Lịch sử:* timeline đổi người phụ trách / tình trạng / theo dõi / lưu trữ (E2).

### 8.7. Quy tắc đồng bộ dữ liệu phía FE (X22)

Chuẩn hoá `fanpageKeys` trong `lib/hooks/useFanpages.ts`: `list(filters)`, `overview(range)`, `today()`, `stats(kind, params)`, `detail(id)`, `posts(id)`, `snapshots(id)`, `grid(date)`.

| Hành động | Invalidate |
|---|---|
| Thêm/sửa/xoá bài, dán nhiều link | `list`, `overview`, `today`, `detail(id)`, `posts(id)`, `stats('posts'/'top')`, badge sidebar |
| Lưu snapshot / lưới | `list`, `overview`, `stats('growth')`, `snapshots(id)`, `grid` |
| Đổi mục tiêu tuần / tình trạng / theo dõi / lưu trữ | `list`, `overview`, `today`, `detail(id)`, badge |
| Gắn/gỡ UTM | `list`, `stats('outcomes')`, `detail(id)` |
| Đổi người phụ trách | `list`, `overview`, `today`, `detail(id)` (+ có thể mất quyền xem Page → đóng Drawer) |

### 8.8. Nhãn & văn bản

Dùng tiếng Việt thống nhất: "Page", "Người phụ trách", "Tình trạng Page", "Nhịp đăng", "Đang theo dõi", "Lưu trữ". Cấm dùng "Group" cho module này (xem cảnh báo mục 1). Mọi toast/lỗi viết hành động tiếp theo ("Link này đã có ở bài ngày 05/11 — mở bài đó?").

---

## 9. Nhắc việc & thông báo (B2)

| Sự kiện mới | Điều kiện | Chống trùng (`dedupeSuffix`) |
|---|---|---|
| `fanpage.silent` | `state='silent'` tại các **mốc** 3, 7, 14, 30 ngày chưa đăng | `<mốc>` (mỗi Page + mỗi mốc đúng 1 thông báo/người) |
| `fanpage.weekly_at_risk` | Lần đầu `state='at_risk'` trong tuần | `<ngày Thứ Hai của tuần>` |

Việc phải sửa cùng một lúc (X21):
- `NotificationEntityType` thêm `'fanpage'`; `RecipientRelation.FANPAGE_OWNER` + case trong `recipient-resolvers.ts` (+ `.spec`); 2 entry trong `event-catalog.ts` (`mandatory:false`, `defaultEnabled:true`, `coalesce:false`) (+ `event-catalog.spec`); FE `lib/notifications/resolve-link.ts` (+test) đưa tới `/fanpage?id=<id>` (mở Drawer) và nhãn trong trang Tuỳ chọn thông báo.
- `fanpage-reminders.service.ts`: chỉ chạy **sau 17:00 giờ VN** (người đã có cả ngày để đăng), thoát sớm nếu chưa tới giờ; dùng `findEmittedEntityIds` để bỏ qua Page đã nhắc trước khi query người nhận; chỉ xét Page `isTracked`; idempotent nên Uptime gọi lặp không sao.
- Q5 mặc định: `FanpagesCronController` mới (mirror controller nhắc deadline, `assertSecret` y hệt) → bạn thêm **1 monitor Uptime** gọi mỗi 30 phút: `GET https://<domain>/api/fanpages-cron/reminders?secret=<CRON_SECRET>`. Không đụng `vercel.json` (đang đủ 2/2 cron).
- Nội dung thông báo không chứa dữ liệu nhạy cảm (chỉ tên Page, số ngày).

---

## 10. Lộ trình triển khai

Mỗi giai đoạn **độc lập deploy được** và có giá trị riêng; không giai đoạn nào sửa đổi hành vi cũ.

### GĐ0 — Chốt quyết định (0,5 ngày)
- [x] Q1, Q6, Q7 đã chốt (2026-11-11). Còn lại Q2–Q5, Q8, Q9: xác nhận dùng mặc định hoặc đổi.
- [ ] `git pull`, `ls` thư mục migrations để lấy timestamp thật (X23).

### GĐ1 — Nền tảng dữ liệu & luật tính toán (BE) — *chưa có thay đổi nhìn thấy*
- [ ] M1 (cadence/tình trạng/lưu trữ/domain nền tảng) + entity + seed + backfill; M4 (8 key + 1 setting).
- [ ] `fanpage-cadence.helper` + `fanpage-url.helper` (+ spec đầy đủ: biên tuần, Thứ Hai/Chủ Nhật, bài NULL ngày, streak khi hôm nay chưa đăng, trang mới).
- [ ] `FanpageScopedQuery`; refactor `list` dùng nó và thay 2 `loadRelationCountAndMap` bằng truy vấn gộp (**kiểm tra số query không tăng**).
- [ ] List trả thêm `cadence/posts30d/lastPostDate/health/isOrphan`; filter mới; `archived=false` mặc định.
- [ ] `archive/unarchive`, `history`, danh mục `fanpage-health-statuses`, chống trùng URL bài (409), `PUT` đặt `target_posts_per_week`.
- [ ] Route tĩnh khai trước `:id` (X18).
- **Hoàn thành khi:** `tsc --noEmit`, `nest build`, jest toàn bộ pass; spec đối chiếu `overview` = `list` mỗi role.

### GĐ2 — FE khung Tab + A1, A2, A5, E1, E3, E4 *(giá trị thấy ngay)*
- [ ] Tabs + đồng bộ URL; thẻ KPI bấm-để-lọc; cột Nhịp đăng; `CadenceBadge`, `HealthTag`; form Page thêm Tình trạng + công tắc Theo dõi + mục tiêu tuần.
- [ ] Menu `⋯`: Lưu trữ/Bỏ lưu trữ; tab "Đã lưu trữ" + xoá có đếm số liệu sẽ mất (X14).
- [ ] Modal "Tình trạng ⚙" (mirror `FanpagePlatformsModal`); tự nhận nền tảng khi dán link; kiểm tra trùng URL bài hiển thị thân thiện.
- [ ] Mặc định ngày hôm nay ở form bài; Drawer tab **Tổng quan** (chưa có heatmap) + tab **Lịch sử**.
- [ ] `fanpageKeys` factory; mobile card list; empty/loading/error states.
- **Hoàn thành khi:** `tsc` sạch (ngoại trừ lỗi `logo.png` sẵn có), eslint file đổi sạch, vitest pass, click-through trình duyệt 4 role.

### GĐ3 — Nhịp đăng chủ động: B1, B2, B3 + badge
- [ ] Tab **Hôm nay** + modal thêm bài nhanh + toast Hoàn tác.
- [ ] `FanpageRemindersService`, `FanpagesCronController`, 2 event + resolver + catalog + FE `resolve-link` (X21); gọi thử bằng `dryRun` trước.
- [ ] Badge sidebar `fanpage` (1 query gộp, dùng cache 60s có sẵn; thêm vào `BadgeCacheInvalidationMiddleware` đường dẫn ghi của Fanpage).
- [ ] Hướng dẫn bạn thêm monitor Uptime (mục 9).
- **Hoàn thành khi:** test dedupe (gọi 2 lần cùng ngày = 1 thông báo), test múi giờ quanh 17:00 VN và nửa đêm.

### GĐ4 — Số liệu & biểu đồ: C1, C2, C4, C5, A3
- [ ] M2; `fanpage-metrics.service` (upsert, bulk theo dòng, optimistic theo `updatedAt`); helper delta/carry-forward/bucket.
- [ ] Tab **Nhập số liệu** (lưới, dán từ Excel, cảnh báo giảm >50%), modal 1 dòng trong Drawer, tab Drawer **Số liệu**.
- [ ] Tab **Thống kê** (gate `fanpage_stats.view`): tăng trưởng, nhịp đăng theo tuần, top bài; số liệu từng bài (ô sửa tại chỗ); mục tiêu tháng; heatmap 12 tuần. (Khối Page→Khách và Xếp hạng thêm ở GĐ5/GĐ6.)
- [ ] Cột Followers + delta trong bảng; thẻ KPI "Follower 30 ngày".
- **Hoàn thành khi:** test carry-forward, test hai người sửa cùng ô (X24), test Page không có snapshot không làm tổng sai.

### GĐ5 — Liên kết nghiệp vụ: D1, D3 (Q1, Q7 đã chốt) — **giai đoạn nhạy cảm nhất, làm kỹ nhất**
- [ ] M3 (`fanpage_utms` + `primary_utm_id` UNIQUE + CHECK).
- [ ] `fanpage-utms.service`: gắn/gỡ, Page đầu tiên tự thành chính, đổi Page chính (quyền cả hai Page), chặn 409 khi gỡ Page chính còn Page khác (R10), kiểm tra `canUse`, audit 3 action + nhãn `audit-meta.ts` + test lưới an toàn.
- [ ] **Remap `fanpage_utms` trong luồng gộp UTM** (X12): khử trùng, giữ Page chính của UTM đích; test.
- [ ] `fanpage-outcomes.service`: quy kết theo 3.7 (R1–R10), tái dùng `CustomerAccessHelper.applyViewFilter` + `utm-stats.helper` (khoảng ngày); dòng Tổng DISTINCT; dòng "Chưa quy về Page".
- [ ] **Cổng tiền 4 lớp** (3.7): `fanpage_revenue.view` + phạm vi khách + `UiVisibilityService.getHiddenElementKeys` (`tab:deposits`) + chỉ Tổng nạp; BE **bỏ hẳn** trường khi không qua cổng.
- [ ] FE: chọn UTM nhiều + chip Page chính/dùng chung trong Drawer; khối Page → Khách & Tiền nạp (8.5.1); lọc Page theo UTM; modal đổi Page chính (cảnh báo R9).
- **Hoàn thành khi (hợp đồng số liệu, bắt buộc xanh):**
  - `Σ cột "chính" của mọi Page == Tổng DISTINCT` với dữ liệu có UTM dùng chung cho 2–3 Page.
  - Cùng Page, 4 role (Admin/Manager/Assistant/Employee) + khách ngoài phạm vi → số khách đúng bằng đếm trực tiếp theo `customers.view` scope của từng người; khách xoá mềm không tính.
  - Có `fanpage_revenue.view` nhưng bị ẩn `tab:deposits` → response **không có** trường tiền; không có key → không có trường tiền; có đủ → tiền khớp `SUM(deposits)` của đúng tập khách trong phạm vi.
  - UTM `restricted` + người xem không `canUse` → tên bị che, số vẫn đúng phạm vi.
  - Gỡ Page chính khi còn Page khác → 409; gộp UTM không tạo dòng trùng, giữ Page chính đích.

### GĐ5b — Lead (khách hàng) thủ công + Ghi chú tiến trình (mục 15) — *làm SAU M3/GĐ5 hoặc cùng lúc, vì đụng quy tắc quy kết*
- [x] Chốt Q10, Q11. `git pull`, `ls` migrations lấy timestamp thật (đã dùng `1786394000000`; lớn nhất trước đó `1786393000000`).
- [x] M5 `AddFanpageLeadLinks`; entity `customer.entity.ts` + `fanpage-note.entity.ts`.
- [x] BE: `GET/POST /fanpages/:id/customers`; `FanpageNoteDto.lead?`; `fanpage-leads.service` (gọi `CustomersService.create`, KHÔNG viết lại luật tạo khách); sửa `fanpage-outcomes` theo 15.3 (nếu GĐ5 đã làm).
- [x] FE: tab Drawer **Data khách hàng** + mục "Thêm khách" trong form ghi chú, gate `can('customers.view'|'customers.create')`.
- **Hoàn thành khi:** các test ở 15.6 xanh; `tsc --noEmit`, `nest build`, jest, vitest pass. *(2026-11-12: code + spec đã viết; `tsc --noEmit` BE/FE + `nest build` sạch; jest/vitest CHƯA chạy theo yêu cầu.)*

### GĐ6 — Hoàn thiện: B4, B5, A4, E5a, C3
- [x] Dán nhiều link (BE bulk + FE xem trước).
- [x] Export Excel (sheet Page / Bài đăng / Số liệu; sheet Số liệu chỉ khi có quyền xem; sheet Khách chỉ khi qua phạm vi khách; **cột tiền chỉ khi qua cổng 4 lớp 3.7**; mirror `leave-export` tách model thuần + test).
- [x] Danh mục Loại bài + cột/tag.
- [x] **Xếp hạng (B5)** theo 3.8: `fanpage-rankings.service` + endpoint `stats/rankings` (gate `fanpage_rankings.view`, scope own/department/all); test: người nhập hộ không lên hạng, bài trùng URL không tính, sửa snapshot không tính thêm, thứ hạng tính trong tập người xem được thấy, `own` chỉ thấy dòng mình.
- [ ] C3 ảnh Insights *(2026-11-12: CHƯA làm — tách plan riêng, không chặn GĐ6)*: **chỉ làm nếu** cơ chế upload hiện có dùng lại được (đối chiếu `PLAN_AVATAR_LEAVE_ATTACHMENT_BACKBLAZE_B2.md` và `leave-request-attachment`); nếu không, tách thành plan riêng, không chặn các mục khác.
- [ ] (Không làm ở v1: E5b bài lên kế hoạch — Q8.)
- **Trạng thái GĐ6 (2026-11-12):** code + spec đã viết; `tsc --noEmit` BE sạch, FE chỉ còn 4 lỗi `logo.png` có sẵn từ trước; jest/vitest **CHƯA chạy** theo yêu cầu.

### GĐ7 — QA, tài liệu, rollout
- [ ] Viết `guides-content/fanpage.md` (đặt `published: true`); cập nhật `PERMISSIONS.md` §2.20, `resource-labels.ts`, `audit-meta.ts`; `nav-guide-coverage.test` vẫn xanh (không thêm mục menu).
- [ ] Bảng test 4 role × từng tab (mục 11); thử với ≥ 300 Page và ≥ 20.000 bài (seed giả) đo thời gian `list/overview/today`.
- [ ] Thêm 1 dòng `WORKFLOW_LOG.md` mỗi GĐ hoàn tất (theo lệnh của bạn).

---

## 11. Kế hoạch kiểm thử

| Lớp | Nội dung bắt buộc |
|---|---|
| Unit BE (jest) | `cadence.helper` (≥ 25 ca biên), `metrics.helper`, `url.helper`, scope helper khi thêm flag, reminders (dedupe, giờ), URL trùng, bulk (lỗi từng dòng) |
| Tích hợp BE | `overview.total === list.length` mỗi role; scope `own/department/all` trên mọi endpoint mới; route tĩnh không bị `:id` nuốt; export không vượt trần |
| Hợp đồng số liệu khách/tiền (D1/D3) | Các test "Hoàn thành khi" của GĐ5 chạy trên dữ liệu seed có UTM dùng chung; test cổng tiền từng lớp; test chuỗi `Σ chính == Tổng` chạy lại mỗi khi sửa `fanpage-outcomes.service` |
| Xếp hạng (B5) | Điều kiện đủ hạng (3.8), phạm vi `own/department/all`, không lộ khách/tiền |
| FE (vitest) | `fanpageColors`, `CadenceBadge` (5 trạng thái, có icon+chữ), lưới nhập (dán, cảnh báo, dòng lỗi), bảng xem trước dán link, invalidate đúng key (8.7), gate nút bằng `flags`/`can` |
| Thủ công 4 role | Admin / Manager / Assistant / Employee: thấy đúng tab, đúng số, nút ẩn đúng, thông báo bấm đúng đích |
| Phi chức năng | `nest build`, `next build` hoặc ít nhất `tsc --noEmit`, đếm số query của `list` trước/sau (không tăng), đo CPU endpoint badge/overview |

Quy tắc báo cáo: chỉ báo "xong" sau khi chạy thật và dán kết quả thật (số test pass, không lỗi tsc). Migration chỉ đưa file, **bạn tự chạy** sau khi backup.

---

## 12. Rollout & Rollback

1. Backup DB → chạy M1 → M2 → M3 → M4 theo thứ tự (M4 trước khi deploy code dùng key mới — X20).
2. Deploy BE trước, FE sau (BE tương thích ngược, FE cũ vẫn chạy).
3. Thêm monitor Uptime (GĐ3) **sau** khi deploy và thử `dryRun`.
4. Cấp `fanpage_rankings.view` / `fanpage_revenue.view` cho đúng vai trò trong ma trận phân quyền (mặc định chặt: Employee không có; Admin mở dần theo override phòng ban).
5. **Rollback:** mọi cột mới nullable → code cũ bỏ qua được; tắt nhắc việc bằng cách gỡ monitor Uptime; `down()` của từng migration đối xứng nhưng **không chạy `down` khi đã có số liệu thật** (mất dữ liệu snapshot) — ưu tiên fix-forward.

---

## 13. Rủi ro còn lại

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Nhân viên không nhập số liệu tuần → biểu đồ trống | Cao | Tab Hôm nay + lưới "Page chưa nhập" + nhắc nhẹ trong thông báo tuần (mở rộng B2 nếu cần, không làm v1) |
| Số liệu nhập tay thiếu chính xác | Trung bình | Hiện rõ "nhập tay bởi X lúc Y", cảnh báo giảm bất thường, cho phép ghi chú |
| Truy vấn gộp chậm khi nhiều bài | Trung bình | Dùng index sẵn có, lô 500 ID, cache ngắn, đo ở GĐ7 |
| Người dùng thấy quá nhiều thứ cùng lúc | Trung bình | Hiện dần (8.1-5), tab mặc định theo vai trò, ẩn cột/khối không có dữ liệu |
| Người dùng hiểu nhầm "Page chính / tham gia" | Trung bình | Chip + tooltip giải thích ở mọi nơi, nhãn "Dùng chung — không cộng vào tổng", dòng "Chưa quy về Page" để đối soát |
| Đổi Page chính làm số lịch sử dịch chuyển | Trung bình | R9/R10: cảnh báo, quyền cả hai Page, audit, chặn gỡ ngầm |
| Lộ tiền nạp qua tổ hợp số (ví dụ trừ nhau) | Cao | Chỉ Tổng nạp, không rút/nạp thực, bỏ hẳn trường khi bị ẩn `tab:deposits`, không hiện tiền ở danh sách/xếp hạng/export khi thiếu cổng |
| Phụ thuộc kỷ luật gắn UTM đúng Page | Trung bình | Gợi ý "N UTM chưa thuộc Page nào" cho scope rộng; dòng "Chưa quy về Page" |
| Migration trùng timestamp giữa nhiều tài khoản | Thấp | X23 |
| Migration chưa từng chạy trên MySQL thật (`CreateFanpageOwners` còn treo theo log) | Trung bình | Chạy và click-through bản hiện tại trước khi bắt đầu GĐ1 |

---

## 14. Checklist đồng bộ tài liệu/mã khi làm xong từng GĐ

- [ ] `PERMISSIONS.md` §2.20 (8 key mới + seed + scope + quy tắc giao của các lớp quyền tiền/khách/xếp hạng, mục 7) và quy tắc Page chính/tham gia (3.7)
- [ ] `frontend/src/lib/permissions/resource-labels.ts`
- [ ] `frontend/src/lib/api/audit-meta.ts` + test
- [ ] `backend/src/modules/notifications/catalog/*` + `frontend/src/lib/notifications/resolve-link.ts` (GĐ3)
- [ ] `guides-content/fanpage.md` + `guide-slugs.ts` (không thêm slug mới vì không thêm menu)
- [ ] `sidebar-badges` + `badge-cache-invalidation.middleware` (GĐ3)
- [ ] `WORKFLOW_LOG.md` (append, khi bạn ra lệnh)
- [ ] (v1.2) `PERMISSIONS.md`: ghi rõ Lead dùng lại `customers.*`, không key mới; thêm `GET/POST /fanpages/:id/customers` + `lead` của ghi chú; `guides-content/fanpage.md` mục Data khách hàng

---

## 15. Lead (khách hàng) thủ công + tích hợp Ghi chú tiến trình (v1.2)

### 15.1. Mục tiêu
- Nhập khách hàng (Lead) **thủ công** ngay trong Drawer Page, tab **Data khách hàng**.
- Khi **Ghi chú tiến trình** có tick "Thêm khách hàng", hệ thống tạo khách và khách xuất hiện ở tab Data khách hàng của Page đó.
- Không có quyền khách hàng thì **không render** tab/nút (không render rồi báo 403).
- Dùng lại `customers` + `CustomersService.create`; **không** tạo bảng Lead riêng, **không** nhân đôi luật tạo khách (chống trùng, validate nguồn/trạng thái, UTM, audit `CREATE_CUSTOMER`, thông báo `customer.created`).

### 15.2. Dữ liệu (migration M5 `AddFanpageLeadLinks`, timestamp > `1786391000000`, lấy lại bằng `ls`)
| Bảng | Thay đổi | Lý do |
|---|---|---|
| `customers` | `fanpage_id INT NULL`, FK → `fanpages(id)` **ON DELETE SET NULL**, **INDEX gộp** `IDX_customers_fanpage_input (fanpage_id, input_date, deleted_at)` — phục vụ tab Lead và thống kê khi dữ liệu lớn | Page xoá cứng (cascade bài/ghi chú) **không được** kéo theo mất khách |
| `fanpage_notes` | `lead_customer_id INT NULL`, FK → `customers(id)` **ON DELETE SET NULL**, **UNIQUE** `UQ_fanpage_notes_lead_customer` (MySQL cho nhiều NULL) | Truy vết ghi chú nào sinh ra khách; đặt ở bảng ghi chú để **không thêm cột thứ 2 vào bảng `customers`** vốn đã rộng và nóng |

- Entity: cột `int | null` khai `type: 'int'` tường minh; `IF NOT EXISTS`; `up()/down()` đối xứng; không sửa migration cũ; không tự chạy lên DB thật.
- Không đổi nghĩa dữ liệu cũ: khách cũ `fanpage_id = NULL`.

### 15.3. Quy kết khách theo Page — sửa 3.7 (Q10)
Mỗi khách ghi công cho **tối đa 1 Page**, theo thứ tự ưu tiên:
1. `customers.fanpage_id` khác NULL → Page đó (Lead nhập tay là ý định rõ ràng của người dùng).
2. Ngược lại → Page chính của `utm_id` (R1–R4 như cũ).
3. Không có cả hai → "Chưa quy về Page" (R5).

Hệ quả: R2/R4/R5 và X9 áp dụng trên hàm quy kết **một chỗ** (`fanpage-outcomes`); bất biến `Σ chính == Tổng DISTINCT` giữ nguyên. Nếu Q10 chọn phương án "UTM là nguồn duy nhất" thì bỏ bước 1, tab Drawer vẫn dùng `fanpage_id` để liệt kê nhưng ghi rõ *"Lead nhập tay — chưa tính vào thống kê Page"*.

### 15.4. Backend
| Endpoint | Permission | Ghi chú |
|---|---|---|
| `GET /fanpages/:id/customers` *(khai trước `:id`-động theo X18 nếu trùng pattern)* | `customers.view` **và** thấy được Page (`fanpages.view` scope) | Lọc `CustomerAccessHelper.applyViewFilter`, bỏ xoá mềm, phân trang BE (khác danh sách Page), cùng 1 query cho bảng và số đếm badge (X32) |
| `POST /fanpages/:id/customers` | `customers.create` **và** thấy được Page | Gọi `CustomersService.create({... , fanpageId})` kèm `caller` để UTM/nguồn được validate; `source` mặc định theo Q11; **`phone` bắt buộc** (validate riêng ở DTO Lead, không đổi `CreateCustomerDto` chung); gọi `checkDuplicateContact` ở bước xem trước (FE) và bắt `DuplicatePhoneException` ở BE |
| `POST /fanpages/:id/notes` *(mở rộng)* | `fanpage_notes.manage` (giữ nguyên) **+ `customers.create` khi có `lead`** | `FanpageNoteDto.lead?: {name, phone, email?, source?, note?}` (`phone` bắt buộc); luồng theo X29 |
| Sửa/xoá Lead | `PATCH/DELETE /customers/:id` có sẵn | **Không thêm endpoint**; tab Drawer chỉ gọi lại endpoint Khách hàng (giữ nguyên `customers.edit/delete` + scope + audit) |

- Cột `fanpage_id` chỉ được set ở 2 đường trên; `UpdateCustomerDto` **không** nhận `fanpageId` ở v1 (tránh đổi Page ngầm, làm nhảy số liệu — cùng tinh thần R9).
- Page lưu trữ (E4): vẫn cho thêm Lead? **Mặc định chặn khi Page đã lưu trữ** (409, nhãn "Bỏ lưu trữ Page trước") — hỏi lại nếu bạn muốn khác.
- Sửa/xoá ghi chú gốc **không** sửa/xoá khách đã sinh ra (khách là dữ liệu độc lập); xoá ghi chú → `lead_customer_id` giữ nguyên trong audit snapshot.
- Audit: dùng `CREATE_CUSTOMER` sẵn có; ghi chú có `lead` thêm `leadCustomerId` vào snapshot `CREATE_FANPAGE_NOTE`. Không cần action mới ⇒ không cần nhãn `audit-meta.ts` mới (vẫn chạy `audit-meta.test.ts`).
- Invalidate sidebar badge nếu có: đường ghi `POST /fanpages/:id/customers` thêm vào `BadgeCacheInvalidationMiddleware`.

### 15.5. Phân quyền & UI
- **Không thêm permission key mới** (giảm tải ma trận; X20 không phát sinh). Dùng `customers.view/create/edit/delete`.
- Tab **Data khách hàng** chỉ render khi `can('customers.view')`; nút "Thêm khách" khi `can('customers.create')`; sửa/xoá từng dòng khi `can('customers.edit'|'customers.delete')` **và** theo cờ quyền từng khách nếu API Khách hàng trả (không tự đoán). Mục "Thêm khách hàng" trong form ghi chú: `can('fanpage_notes.manage') && can('customers.create')`. **Cấm** `role === 'admin'` (X19). BE vẫn là nguồn quyết định cuối.
- Giữ lối thoát hiểm admin ở cả 3 lớp: dùng `scopeOf`/`PermissionGuard` sẵn có, không viết helper kiểm quyền mới.
- Tôn trọng UI Visibility của resource `customers` (cột/tab Admin đã ẩn không được lộ lại ở tab này: không hiện tiền nạp/rút trong bảng Lead).
- Cột: Tên · SĐT · Trạng thái (tag theo `customer_statuses` động) · Sales · Ngày nhập · Nguồn ghi chú (liên kết "từ ghi chú" nếu có `lead_customer_id`) · audit tooltip chuẩn.
- Form ghi chú: textarea ghi chú + collapse "＋ Thêm khách hàng từ ghi chú này"; nếu trùng SĐT hiện đúng modal cảnh báo của trang Khách hàng, **không lưu ghi chú** cho tới khi người dùng sửa/bỏ tick.
- `fanpageKeys` thêm `customers(id)`. Bảng invalidate (8.7): thêm/sửa/xoá Lead → `customers(id)`, `detail(id)`, `stats('outcomes')`, badge; ghi chú có `lead` → `notes(id)` **và** `customers(id)`.
- Nhãn UI gọi rõ "Page"; không dùng chữ "Group" (xem cảnh báo mục 1). Không thêm mục menu (nguyên tắc 5).

### 15.6. Kiểm thử bắt buộc
- Bộ test **chống đếm trùng ở 15.8** là điều kiện bắt buộc, chạy cùng bộ dưới đây.
- BE: tạo Lead thủ công (có `fanpage_id`, audit, thông báo); ghi chú+`lead` thành công; **SĐT trùng ⇒ 4xx và KHÔNG có ghi chú mới**; ghi chú lỗi sau khi tạo khách ⇒ khách bị xoá mềm; thiếu `customers.create` ⇒ 403 dù có `fanpage_notes.manage`; Page lưu trữ ⇒ 409; `GET` chỉ trả khách trong `customers.view` scope của **từng role** (4 role) và bỏ xoá mềm; số đếm == số dòng; khách có `fanpage_id` + UTM Page khác ⇒ chỉ ghi công 1 Page (bất biến Σ).
- FE (vitest): ẩn/hiện tab, nút, mục ghi chú theo `can()` với role tuỳ chỉnh (không phải 'admin'); mất quyền giữa chừng ⇒ tab biến mất, không render 403.
- Chạy thật `tsc --noEmit`, `nest build`, `next build`/`tsc`, jest, vitest; dán kết quả thật. Ghi 1 dòng `WORKFLOW_LOG.md` khi bạn ra lệnh.

### 15.8. Chống đếm trùng từ Fanpage (bắt buộc — đã chốt)

**Nguyên tắc:** trùng với dữ liệu khách **sẵn có** là chấp nhận được (không phải lỗi của Fanpage, vẫn do luật trùng SĐT hiện hành xử lý). Nhưng **mọi con số của Fanpage không bao giờ được đếm 1 khách hai lần**. Chặn ở 4 tầng, tầng nào cũng đủ để tự nó ngăn lỗi:

| Tầng | Cơ chế | Chống được |
|---|---|---|
| 1. Cấu trúc dữ liệu | Quan hệ khách→Page là **1 cột** `customers.fanpage_id` (không có bảng N-N) ⇒ 1 khách tối đa 1 Page | Khách thuộc 2 Page |
| 2. Ràng buộc DB | `UNIQUE fanpage_notes.lead_customer_id` ⇒ 1 khách chỉ được 1 ghi chú sinh ra; `customers.phone` UNIQUE sẵn có | 2 ghi chú cùng sinh 1 khách; 2 khách cùng SĐT |
| 3. Luật tạo | **SĐT bắt buộc** cho Lead từ Page (khoá chống trùng; khách không SĐT thì bấm đúp/gõ lại sẽ nhân đôi vì không có khoá nào chặn). Có `checkDuplicateContact` trước khi tạo; nút gửi có `loading` + khoá chống bấm đúp (FE) và `Idempotency` theo (Page, SĐT) ở BE bằng chính UNIQUE phone | Bấm đúp, retry mạng, 2 người nhập cùng SĐT |
| 4. Truy vấn | Mọi số đếm/bảng Lead chỉ `COUNT(DISTINCT customers.id)` trên **bảng `customers`**, lọc `fanpage_id` rồi mới (nếu cần) tra UTM; **cấm JOIN `fanpage_notes`/`deposits`/bảng N-N vào truy vấn đếm** (JOIN làm nhân dòng, giống X17). Tên "từ ghi chú" lấy bằng truy vấn phụ `IN (...)` sau đó | Nhân dòng do JOIN |

**Xử lý khi SĐT trùng khách sẵn có (không phải lỗi đếm):** chặn tạo, hiện modal cảnh báo như trang Khách hàng (chỉ nêu người tạo/sales/nhóm, không lộ `id`/SĐT đầy đủ). **Không** tự gắn khách cũ vào Page (tránh lộ/đổi khách ngoài phạm vi và tránh số Page nhảy). Muốn quy khách cũ về Page: người có `customers.edit` đổi qua luồng riêng (ngoài v1, đã có R9 khi làm).

**Thứ tự quy kết một chỗ** (15.3) dùng đúng một hàm `resolveCreditedPage(customer)` ở `fanpage-outcomes`; tab Lead, thẻ KPI, báo cáo Page → Khách, export **đều gọi hàm/truy vấn này**, không tự viết lại.

**Test bất biến (phải xanh trước khi hoàn thành GĐ5b):**
- Dữ liệu mẫu: khách chỉ có UTM (Page A chính), khách chỉ có `fanpage_id` (Page B), khách có cả hai khác Page (`fanpage_id`=B, UTM→A), khách không có cả hai, khách xoá mềm. Kỳ vọng: Σ cột "chính" của mọi Page + "Chưa quy" = Tổng DISTINCT trong phạm vi; khách có cả hai chỉ xuất hiện ở B.
- Tạo Lead 2 lần cùng SĐT (tuần tự và song song 2 request) ⇒ đúng 1 khách, request còn lại nhận lỗi trùng.
- Ghi chú sinh khách, sau đó cố gắn thêm ghi chú thứ 2 vào cùng khách ⇒ bị UNIQUE chặn.
- Số trên badge tab == số dòng bảng == số trong thống kê Page (cùng phạm vi người xem).

### 15.7. Rủi ro riêng
| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Người dùng tưởng Lead nhập tay luôn hiện với mọi người xem Page | Trung bình | Nhãn "theo phạm vi dữ liệu của bạn" (X32) |
| Số thống kê Page đổi sau khi có Lead nhập tay | Trung bình | Q10 + hộp giải thích R-ưu-tiên; test bất biến Σ |
| `phone` UNIQUE cả bản ghi xoá mềm → "compensating delete" ở X29 làm kẹt SĐT | Trung bình | Dùng đường xoá mềm sẵn có của khách; nếu lỗi ghi chú thật sự xảy ra, SĐT giữ ở thùng rác (Admin khôi phục/xoá cứng) — nêu rõ trong thông báo lỗi |