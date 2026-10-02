# 📘 PLAN: Lấp đầy "Hướng dẫn sử dụng" + Mẫu minh hoạ trực quan theo Role / Quyền / Quản lý phụ trách

> **Trạng thái:** Kế hoạch (chưa code). Viết sau khi `git pull` HEAD `64929eb` (2026-10-02) và đọc trực tiếp:
> `guide-demos.tsx`, `guide-markdown.ts`, `nav-config.tsx`, toàn bộ `app/(dashboard)/*/page.tsx` (grep quyền + component),
> `customers/page.tsx` (cột bảng), `ui-visibility.constants.ts`, `PERMISSIONS.md`, `PLAN_HARDENING.md` (P7),
> `PLAN_POSITION_FIELD_VISIBILITY_ASSIGNMENT_GROUPS.md`.
> **Giới hạn của audit này:** đọc cấu trúc + grep, CHƯA chạy app, CHƯA đọc logic từng service. Mọi mục ghi
> "cần xác nhận" phải đọc code thật ở bước 0 của phase tương ứng trước khi viết hướng dẫn.
> **Không cần migration** cho P0–P6 (trừ quyết định D2 ở mục 3).

---

## 1. Kết quả audit (hiện trạng)

### 1.1. Cơ chế hướng dẫn hiện có (tốt, giữ lại)
- Bài Markdown trong DB (`guides`), lọc xem theo role + vị trí + phòng ban (AND), nháp/xuất bản, audit, Markdown an toàn XSS.
- Khối ```` ```az-demo <id> ```` nhúng mẫu minh hoạ từ `GUIDE_DEMOS` (React tĩnh, dữ liệu cứng, không gọi API, `inert`).
- Hiện có **9 mẫu**: `status-tags`, `source-tags`, `utm-tags`, `row-actions`, `customer-table`, `customer-form`, `header-search`, `permission-note` (+ khung `DemoFrame`).
- Hiện có **1 bài** ("Test hướng dẫn") → trang trống như ảnh.

### 1.2. Phát hiện (đánh số để tham chiếu trong plan)

| # | Phát hiện | Mức | Hệ quả |
|---|---|---|---|
| F1 | Mẫu `customer-table` chỉ **7 cột** (STT, Tên, SĐT, Nguồn, UTM, Trạng thái, FTD). Bảng thật (`customers/page.tsx`) có **Ngày nhập, Họ và tên, SĐT, Nguồn, UTM, Sales (Chính + Phụ), Marketing, Trạng thái, Đã joined nhóm, cột FTD, Ghi chú gần nhất, Thao tác** | Cao | User không hình dung được cột quan trọng nhất (Sales chính/phụ, Marketing) |
| F2 | Mẫu tự dựng lại `<Tag>` thô thay vì dùng component thật đã có (`StatusTag`, `SourceTag`, `UtmTag` chỉ UTM là dùng thật) | Trung bình | Sửa giao diện thật → mẫu lệch (drift) |
| F3 | Mẫu **không có khái niệm người xem**: không thể hiện "Employee thấy gì / Manager thấy gì / Content bị ẩn cột nào" | Cao | Đúng điều bạn muốn mà hệ thống chưa có |
| F4 | `parseDemoId` chỉ lấy token đầu → **không truyền được tham số** (vd `persona=employee`) | Trung bình | 1 mẫu không dùng lại được cho nhiều kịch bản |
| F5 | `DemoFrame` đặt `inert` toàn bộ → không đặt được bộ chọn vai trò **trong** khung | Trung bình | Phải tách vùng điều khiển khỏi vùng `inert` |
| F6 | Guide chỉ lọc theo **role/vị trí/phòng ban**, không theo **permission**. Role tuỳ chỉnh mới / Admin đổi ma trận quyền → ai thấy menu nhưng không thấy guide (hoặc ngược lại) | Trung bình | Xem quyết định D2 |
| F7 | Không có test/CI bảo đảm **mỗi mục menu đều có guide**; trang không có nút "Xem hướng dẫn trang này" | Trung bình | Thêm trang mới là quên viết guide |
| F8 | Hardcode role ở FE: `role === 'admin'` ở `chia-data`, `nhom-lien-ket`, `nhom-toi-quan-ly` (×3), `profile`, `users` (×3); `role === 'manager'` ở `phong-ban` (×2). Trái quy ước "dùng `can()`" | Cần xác nhận | Hành vi thật có thể lệch ma trận quyền → **guide phải mô tả hành vi THẬT**, không chép từ PERMISSIONS.md. (Mới grep, chưa đọc ngữ cảnh, chưa kết luận là bug) |
| F9 | `hieu-suat-cong-viec`, `thong-bao`, `thong-bao/page` không có `can()` và nav không gate permission | Cần xác nhận | Kiểm tra BE có gate không trước khi viết "ai dùng được" |
| F10 | `guide-demos.tsx` dùng lẫn `Alert message=` (cũ) và `Alert title=` (mới) | Thấp | Thống nhất khi tách file |
| F11 | `README_AZWORKBASE_PROJECT.md` đã lỗi thời (đã tự cảnh báo) | Thấp | Không dùng làm nguồn viết guide |

> Việc F8/F9 **không nằm trong phạm vi plan này** — chỉ ghi lại; xử lý riêng sau khi xác nhận.

---

## 2. Kiến trúc đề xuất

### 2.1. Nguồn nội dung = file trong repo, đồng bộ vào DB (để "update nhanh nhất có thể")
```
guides-content/                     # (mới, ở gốc repo)
  khach-hang.md
  chia-data.md
  ...
  _template.md
```
Mỗi file có frontmatter:
```md
---
title: Khách hàng
slug: khach-hang
sortOrder: 10
published: true
roles: []          # rỗng = mọi role (đúng quy ước guide_roles)
positions: []
departments: []
---
Nội dung Markdown + khối ```az-demo ... ```
```
- Script `npm run guides:sync` (backend) **upsert theo slug** qua `GuidesService` (có audit, có `updatedBy`), so **hash nội dung** để bỏ qua bài không đổi; mặc định **dry-run**, chỉ ghi khi có `--apply`.
- **Không tự chạy lên DB production** (quy ước dự án): bạn chạy tay và xác nhận.
- Soạn trên UI vẫn dùng được; nếu bài sửa tay trên UI khác hash trong file thì script **báo xung đột, không ghi đè** (cờ `--force` mới ghi).
- Lý do: sửa 1 file → commit → sync ≈ 1 phút, có lịch sử git, review được, AI/tài khoản nào cũng sửa được cùng 1 chỗ.

### 2.2. Bộ mẫu minh hoạ tách theo module
```
frontend/src/lib/guides/
  demo-kit/
    sample-people.ts     # nhân sự mẫu: Admin, Assistant, Manager KD, Sales A (chính), Sales B (phụ), Marketing M, Content C
    personas.ts          # định nghĩa "người xem": role, phòng ban, vị trí, permission+scope, hidden element keys
    sample-customers.ts  # khách mẫu: có/không sales chính, có sales phụ, có marketing, UTM khoá...
    compute-view.ts      # HÀM THUẦN: (persona, rows) -> {rows hiển thị, cột ẩn, nút hiện}
  demos/
    customers.demos.tsx
    assign.demos.tsx
    periodic-tasks.demos.tsx
    leave.demos.tsx
    notifications.demos.tsx
    admin.demos.tsx
    ...
  guide-demos.tsx        # chỉ còn registry: gộp mảng từ demos/*.tsx
```
Nguyên tắc:
1. **Dùng component thật** (`StatusTag`, `SourceTag`, `UtmTag`, `renderSalesTag`-tương đương…) thay vì dựng lại; chỗ nào component thật gọi API/hook thì tách phần "trình bày" thuần ra (presentational) rồi cả trang thật lẫn demo cùng dùng → hết drift (F2).
2. **Mở rộng fence**: ```` ```az-demo customer-table persona=employee-sales ```` — tham số dạng `key=value`, **whitelist** theo từng mẫu (id lạ/tham số lạ → khung cảnh báo như hiện nay, không throw) (F4).
3. **`DemoFrame` có `controls`** (vùng ngoài `inert`): bộ chọn vai trò "Xem với tư cách: Admin | Assistant | Manager | Sales chính | Sales phụ | Marketing | Content" (F5). Vùng bảng vẫn `inert`.
4. **Một nguồn sự thật cho quy tắc hiển thị**: `compute-view.ts` mô phỏng đúng quy tắc trong `PERMISSIONS.md` + `ui-visibility` (phạm vi `own/department/all`, ẩn cột theo `field:*`, nút theo permission). Có **test lưới an toàn** (xem 2.4).

### 2.3. Mẫu "bảng khách hàng theo người xem" (yêu cầu trọng tâm)
Mẫu `customer-table-by-viewer` hiển thị đúng như bảng thật, đổi theo persona:

| Persona (mẫu) | Dòng thấy | Cột ẩn | Nút trên dòng |
|---|---|---|---|
| Admin | Tất cả | — | Xem, Sửa, Chia sẻ, **Xoá** (chỉ Admin có `customers.delete`) |
| Assistant | Tất cả | — | Xem, Sửa, Chia sẻ (không Xoá) |
| Manager (KD) | Chỉ phòng ban mình quản lý | — | Xem, Sửa, Chia sẻ |
| Sales chính | Khách mình tạo / mình là Sales chính / được chia | — | Xem, Sửa, Chia sẻ (chỉ khách mình là chính hoặc tự tạo & chưa gán) |
| Sales phụ | Khách được chia | — | Xem (+Sửa nếu có quyền); **không** Chia sẻ |
| Marketing | Khách mình phụ trách marketing | tuỳ cấu hình | theo quyền |
| Content | Theo override Vị trí | `field:sales_assignment`, `field:marketing_assignment`, `field:assigned_date`, `field:closed_date` (ví dụ trong PLAN_POSITION…) | Xem; Drawer chỉ còn tab Chi tiết + Ghi chú |

Kèm 3 mẫu phụ để giải thích "vì sao":
- `sales-assignment-cell`: ô **Sales (Chính + Phụ)** — Sales chính = Tag nền xanh; Sales phụ = badge `+N` có Tooltip danh sách (theo `SKILL_NEXTJS_FRONTEND §13.2`, **cần đối chiếu `renderSalesTag` thật**).
- `assignment-group-picker`: cấu hình ở **Quản lý phụ trách** (Nhóm = Phòng ban ≥1 + Vị trí tuỳ chọn) → danh sách người hiện trong ô chọn "Sales phụ trách / Marketing phụ trách". Hiển thị cặp *cấu hình → kết quả dropdown* với nhân sự mẫu.
- `customer-drawer-tabs`: 5 tab thật (`info, notes, deposits, assignments, groups`) và tab nào bị ẩn theo `tab:*`.

### 2.4. Chống lệch (làm 1 lần ở P0, đỡ phải nhớ về sau)
- `guide-demos.contract.test.ts`: (a) mọi `element_key` dùng trong persona ∈ `CUSTOMER_ELEMENT_KEYS` của BE; (b) mọi permission key dùng trong demo ∈ danh sách permission đã seed (đọc từ migrations/`PERMISSIONS.md` bảng key); (c) mọi id trong `guides-content/*.md` có trong `GUIDE_DEMOS`; (d) tham số fence hợp lệ.
- `nav-guide-coverage.test.ts`: mỗi `NAV_ITEMS[].key` có đúng 1 file `guides-content/<slug>.md` (map slug ở 2.5). Thêm trang mới mà quên guide → test đỏ (đúng tinh thần `audit-meta.test.ts` đã có).
- Mỗi trang dashboard có nút **"Xem hướng dẫn trang này"** trỏ `/huong-dan/<slug>` (ẩn nếu người xem không được xem guide đó — BE đã trả 404).
- Mục PR checklist: "Sửa trang/permission → cập nhật `guides-content/<slug>.md`".

### 2.5. Map slug ↔ trang (30 mục menu, khớp `NAV_ITEMS`)
`khach-hang`, `chia-data`, `cong-viec-dinh-ky`, `lich-su-cong-viec`, `hieu-suat-cong-viec`, `nghi-phep`, `thong-bao`, `gui-thong-bao`, `thong-bao-da-gui`, `huong-dan-su-dung`, `profile`, `nhom-toi-quan-ly`, `bao-cao-doanh-so`, `duyet-phep`, `nhat-ky-he-thong`, `nhan-vien`, `phong-ban`, `vi-tri`, `quan-ly-phu-trach`, `loai-phep`, `status-khach`, `trang-thai-cong-viec`, `thung-rac`, `nguon-media`, `nhom-lien-ket`, `quan-ly-utm`, `may-cham-cong`, `bao-cao-data-loi`, `phan-quyen`, `luu-tru-anh`.
Thêm bài tổng: `bat-dau` (cách dùng menu, Ctrl+K, vai trò & phạm vi xem — dùng mẫu `header-search`, `permission-note`).

---

## 3. Quyết định cần chốt (mặc định đề xuất — nếu bạn không phản hồi sẽ làm theo mặc định)

| # | Quyết định | Mặc định đề xuất |
|---|---|---|
| D1 | Nguồn nội dung | File `guides-content/*.md` + `guides:sync` (mục 2.1); vẫn cho sửa tay trên UI |
| D2 | Lọc guide theo **permission** (F6): thêm cột `guides.required_permission` (nullable) → BE ẩn guide nếu người xem thiếu quyền đó. **Cần 1 migration** (timestamp > `1785600000000`, `up()/down()`, cột `varchar` tường minh) | **Làm** — khi Admin đổi ma trận quyền, guide tự khớp menu; nếu chưa muốn migration thì để role/vị trí/phòng ban như hiện tại và chấp nhận lệch với role tuỳ chỉnh |
| D3 | Phạm vi persona | 7 persona ở 2.3; mở rộng sau nếu cần |
| D4 | Trang quá phức tạp để dựng lại (Lịch/Kanban, biểu đồ Hiệu suất, Ma trận quyền) | Dựng **bản rút gọn** bằng dữ liệu mẫu; không dùng ảnh chụp (guide chỉ nhận ảnh https qua B2 presign, và ảnh sẽ lỗi thời nhanh) |
| D5 | Ngôn ngữ | Tiếng Việt, xưng "bạn", mỗi bài ≤ 1 màn hình cuộn cho mục "Bắt đầu nhanh" |

---

## 4. Khuôn mẫu 1 bài hướng dẫn (dùng cho cả 30 trang)

1. **Trang này để làm gì** (1–2 câu).
2. **Ai dùng được & thấy gì** — bảng theo persona (dùng mẫu `*-by-viewer` nếu trang có phạm vi dữ liệu).
3. **Bắt đầu nhanh** — 3–5 bước đánh số, mỗi bước kèm mẫu minh hoạ nếu có.
4. **Giải thích từng cột / nút / bộ lọc** (chỉ cái thật sự có trên trang).
5. **Quy tắc & lưu ý nghiệp vụ** (ràng buộc, thứ gì không xoá được, ảnh hưởng sang trang khác).
6. **Lỗi thường gặp / "Vì sao tôi không thấy…"** (thiếu quyền, ngoài phạm vi, bị ẩn theo vị trí).
7. **Xem thêm** — link guide liên quan.

Tiêu chí "xong" cho mỗi bài: mọi tên cột/nút **khớp đúng chữ trên UI thật**; mọi permission nhắc tới **tồn tại**; đã đối chiếu với code ở bước 0; nút Xuất bản bật.

---

## 5. Lộ trình theo phase

> Cỡ: **S** ≈ ≤ nửa phiên · **M** ≈ 1 phiên · **L** ≈ 2+ phiên. Mỗi phase = 1 commit riêng (không kèm `[deploy]` tới khi bạn duyệt), xong thì ghi `WORKFLOW_LOG.md`. Trước mỗi phase: `git pull` lại, đọc trang thật, chạy `tsc` + `vitest`/`jest`.

### P0 — Nền tảng (làm TRƯỚC, cỡ L)
- [ ] Tách `guide-demos.tsx` → `demo-kit/` + `demos/*` + registry (giữ nguyên 9 id cũ để bài cũ không vỡ). Thống nhất `Alert title=` (F10).
- [x] (P0a - 2026-10-02) `DemoFrame` thêm `controls`; fence hỗ trợ `key=value` (whitelist theo từng mẫu); `parseDemoSpec` + test (F4, F5).
- [x] (P0a) `demo-kit/personas.ts` + `sample-customers.ts` + `compute-view.ts` + test (đối chiếu `CustomerAccessHelper.applyViewFilter`, `CUSTOMER_ELEMENT_KEYS`). Còn thiếu: test contract đọc danh sách permission đã seed (2.4b).
- [x] (P0a) `customer-table` = bảng 12 cột thật (13 với Thao tác) + mẫu `customer-table-by-viewer` + `sales-assignment-cell`; ô Sales/Marketing/Joined tách ra `components/customers/CustomerCells.tsx` dùng chung với trang thật. `StatusTag`/`SourceTag` vẫn là Tag tĩnh vì bản thật gọi API.
- [ ] (P0b) Tách nốt `guide-demos.tsx` → `demos/*` theo module (hiện mới tách `demos/customers.demos.tsx` + `demo-kit/`).
- [ ] `guides-content/` + `_template.md` + `guides:sync` (dry-run mặc định, hash, báo xung đột).
- [ ] Test lưới an toàn 2.4 (`contract`, `nav-guide-coverage`) + nút "Xem hướng dẫn trang này" ở layout dashboard.
- [x] (D2 - ĐÃ LÀM 2026-10-02) migration `1785700000000-AddGuideRequiredPermission` + BE lọc + trình soạn chọn permission. **Bạn tự chạy migration.**
- [x] (P0a - 2026-10-02) "Cần quyền để xem" nhiều quyền (AND) + Select gom nhóm theo resource: migration `1785800000000-CreateGuidePermissions` (bảng `guide_permissions`, sao chép dữ liệu cũ, KHÔNG drop cột cũ). **Bạn tự chạy migration.**
- **Xong khi:** bài `bat-dau` + `khach-hang` đầy đủ lên được qua `guides:sync --apply`; đổi persona trong mẫu bảng thấy dòng/cột/nút đổi đúng; test xanh.

### P1 — Dữ liệu khách hàng (ưu tiên cao nhất, cỡ L)
Thứ tự: `khach-hang` → `chia-data` → `quan-ly-phu-trach` → `status-khach` → `nguon-media` → `quan-ly-utm` → `nhom-lien-ket` → `nhom-toi-quan-ly` → `thung-rac` → `bao-cao-data-loi`.

### P2 — Công việc & Nghỉ phép (cỡ L)
`cong-viec-dinh-ky` → `trang-thai-cong-viec` → `lich-su-cong-viec` → `hieu-suat-cong-viec` → `nghi-phep` → `duyet-phep` → `loai-phep`.

### P3 — Thông báo & cá nhân (cỡ M)
`thong-bao` → `gui-thong-bao` → `thong-bao-da-gui` → `profile` → `huong-dan-su-dung` → `bao-cao-doanh-so`.

### P4 — Quản trị tổ chức & hệ thống (cỡ L)
`nhan-vien` → `phong-ban` → `vi-tri` → `phan-quyen` → `nhat-ky-he-thong` → `may-cham-cong` → `luu-tru-anh`.

### P5 — Hoàn thiện (cỡ S)
- [ ] Rà lại toàn bộ guide với app thật theo từng role (đăng nhập thử 4 role + 1 role tuỳ chỉnh).
- [ ] (Tuỳ chọn, mở P8 GĐ2) Ctrl+K tìm cả tiêu đề hướng dẫn user được xem.
- [ ] Cập nhật `PERMISSIONS.md` mục 2.14 (nếu D2) + dòng quy trình "sửa trang → sửa guide" vào `SKILL_NEXTJS_FRONTEND.md`.

---

## 6. Chi tiết theo từng trang

> Cột "Quyền" lấy từ `NAV_ITEMS` + `can('…')` **trong file page** (grep). Quyền trong component con / BE: **đọc ở bước 0**.
> "Mẫu cần có" = id mẫu minh hoạ đề xuất (🆕 mới, ♻️ có sẵn cần nâng cấp).

### P1 — Dữ liệu khách hàng

**1. Khách hàng** — `/customers` · slug `khach-hang`
- Quyền vào trang: `customers.view` (scope own/department/all). Hành động trong trang: `customers.create`, `customers.import`, `customers.export`, `customers.edit`, `customers.assign`, `customers.delete` (chỉ Admin).
- Thành phần thật: `StatsCards`, `CustomerFilters`, bảng (12 cột, F1), `CustomerStatusSelect` (đổi trạng thái ngay trên bảng **chỉ khi có `customers.edit`**, không quyền → Tag tĩnh), `ImportExcelModal`, `ExportCustomersModal`, `BulkAssignModal`, `CustomerForm`, `CustomerDetailDrawer` (5 tab: Chi tiết, Ghi chú, Nạp tiền, Gán data, Nhóm).
- Mẫu cần có: ♻️`customer-table` (12 cột) · 🆕`customer-table-by-viewer` · 🆕`sales-assignment-cell` · 🆕`customer-filters` · 🆕`customer-stats-cards` · 🆕`customer-drawer-tabs` · ♻️`customer-form` (đủ trường thật, đánh dấu trường bị ẩn theo vị trí) · 🆕`import-excel-steps` · ♻️`row-actions`.
- Nội dung phải có: phạm vi xem theo vai trò; **Sales chính vs Sales phụ vs Marketing**; ẩn cột/tab theo Vị trí (ví dụ Content); UTM khoá hiện mờ; trạng thái/nguồn lấy từ danh mục Admin cấu hình; quy trình import (xlsx/csv, lỗi thường gặp); ai xoá được; "Vì sao tôi không thấy khách X".
- Cần xác nhận khi viết: nhãn cột thật (title ở dòng 713–842 của page), cột FTD, điều kiện hiện từng nút ở cột Thao tác.

**2. Chia Data** — `/chia-data` · slug `chia-data`
- Quyền vào trang: `customers.assign`. Trong trang: `customers.delete`; có `role === 'admin'` (F8 → xác nhận).
- Thành phần: 2 danh sách *chưa gán / đã gán*, `CustomerDetailDrawer`, `StatusTag`, `SourceTag`, chọn người nhận, lịch sử gán.
- Mẫu: 🆕`assign-flow` (chọn khách → chọn người → kết quả Chính/Phụ) · 🆕`assign-rules-by-viewer` (ai được chia: Admin/Manager tất cả; Employee chỉ khách mình tạo & chưa ai nhận, hoặc mình là Sales chính) · ♻️`row-actions`.
- Nội dung: quy tắc "người đầu tiên được gán = Sales chính, sau đó là Sales phụ" (`SKILL_NESTJS_BACKEND §12.1`, **xác nhận lại bằng code**); thu hồi/sửa lượt gán; icon 👤 đánh dấu data của mình (`SKILL_NEXTJS_FRONTEND §13.3`); picker cố ý **không lọc phòng ban** (ghi trong PLAN_POSITION… — xác nhận còn đúng).

**3. Quản lý phụ trách** — `/quan-ly-phu-trach` · slug `quan-ly-phu-trach`
- Quyền: `assignment_groups.view`; `create`/`update`/`delete`.
- Thành phần: `ColorPickerField`, `ListFilterBar`, form nhóm (Phòng ban ≥1 + Vị trí tuỳ chọn).
- Mẫu: 🆕`assignment-group-picker` (cấu hình → dropdown kết quả) · 🆕`assignment-group-form`.
- Nội dung: nhóm phụ trách quyết định **ai xuất hiện trong ô "Sales phụ trách / Marketing phụ trách"**; thay thế hardcode tên phòng ban cũ; ví dụ cấu hình 2 nhóm Sales & Marketing; hệ quả khi xoá/sửa nhóm.

**4. Quản lý Status khách** — `/quan-ly-status-khach` · slug `status-khach`
- Quyền: `customer_statuses.view` / `manage` / `delete`.
- Mẫu: ♻️`status-tags` · 🆕`status-manage-table`.
- Nội dung: màu/tên trạng thái hiện ở Khách hàng, Chia data, Thùng rác; xoá trạng thái đang dùng thì sao (**xác nhận ở BE**); thứ tự hiển thị.

**5. Quản lý nguồn** — `/nguon-media` · slug `nguon-media`
- Quyền: `media_sources.view` / `manage` / `delete`; có Khoá/Mở khoá nguồn (audit `LOCK_MEDIA_SOURCE`).
- Mẫu: ♻️`source-tags` · 🆕`source-manage-table`.
- Nội dung: nguồn khoá còn hiện ở khách cũ nhưng không chọn mới được (**xác nhận**).

**6. Quản lý UTM** — `/quan-ly-utm` · slug `quan-ly-utm`
- Quyền vào: `utms.my_managed` **và** `customers.view` (`requireAll`). Trong trang: `utms.view`, `utms.create`.
- Thành phần: `UtmFormModal`, `UtmManagersModal` (Quản lý chính/phụ), `UtmMergeModal` (gộp), `UtmCustomersModal`, `UtmStatsTab`, `BulkActionBar`.
- Mẫu: ♻️`utm-tags` · 🆕`utm-table` · 🆕`utm-merge-steps` · 🆕`utm-managers`.
- Nội dung: Quản lý chính/phụ; chuyển Quản lý chính; gộp UTM (không hoàn tác — **xác nhận**); khoá UTM; vì sao cần `customers.view`.

**7. Quản lý nhóm liên kết** — `/nhom-lien-ket` · slug `nhom-lien-ket`
- Quyền: `link_groups.view` / `manage` / `delete`; có `role === 'admin'` (F8).
- Thành phần: `ListFilterBar`, `SalesUserSelect`, `GroupManagersModal`.
- Mẫu: 🆕`link-group-table` · 🆕`group-managers`.
- Nội dung: Category/Group (Zalo/FB…), Quản lý chính-phụ, ẩn/hiện nhóm, khoá category, "đã joined nhóm" ở bảng khách liên quan thế nào.

**8. Nhóm tôi quản lý** — `/nhom-toi-quan-ly` · slug `nhom-toi-quan-ly`
- Quyền: `link_groups.my_managed`; `customers.view`; có `role === 'admin'` ×3 (F8).
- Thành phần: `GroupCustomersModal`, `GroupManagersModal`.
- Mẫu: 🆕`my-groups-table` · 🆕`group-customers-modal`.
- Nội dung: chỉ thấy nhóm mình là Quản lý chính/phụ; xem khách trong nhóm; Admin thấy khác gì (**xác nhận**).

**9. Thùng rác** — `/trash-can` · slug `thung-rac`
- Quyền: `customers.trash_manage`; xoá vĩnh viễn: `customers.hard_delete`.
- Thành phần: bảng khách đã xoá + `SourceTag`.
- Mẫu: 🆕`trash-table` · ♻️`row-actions` (Khôi phục / Xoá vĩnh viễn).
- Nội dung: xoá = xoá mềm; ai khôi phục/xoá vĩnh viễn; mất data vĩnh viễn; (khớp `PERMISSIONS.md` — chỉ Admin xoá).

**10. Báo cáo data lỗi** — `/customers/reports/invalid-data` · slug `bao-cao-data-loi`
- Quyền: `customers.invalid_report`.
- Thành phần: `InvalidDataStatsTab`, `StatusTag`.
- Mẫu: 🆕`invalid-data-table` · 🆕`invalid-stats`.
- Nội dung: thế nào là "data lỗi" (**xác nhận định nghĩa ở BE**), cách xử lý/lọc.

### P2 — Công việc & Nghỉ phép

**11. Công việc định kỳ** — `/cong-viec-dinh-ky` · slug `cong-viec-dinh-ky`
- Quyền: `periodic_tasks.view` (scope own/department/all). Hành động: `create`, `edit`, `edit_locked`, `delete`, `approve`, `link_customer`, `trash_manage`; xem `periodic_task_statuses.view`, `customers.view`.
- Thành phần: 3 chế độ xem (Kanban, Calendar, Agenda), `TaskActionsBar`, `TaskAssignees`, `TaskChecklistModal`, `TaskCustomersModal`, `TaskLinksModal`, `TaskAuditLogsModal`, `TaskTrashTab`, `PeriodTypeTag`.
- Mẫu: 🆕`task-kanban` · 🆕`task-calendar` · 🆕`task-agenda` · 🆕`task-actions-by-viewer` · 🆕`period-type-tags` (Ngày/Tuần/Tháng/Năm) · 🆕`task-checklist`.
- Nội dung: tạo thủ công từng kỳ; phạm vi theo role (admin+assistant=all, manager=department, employee=own — theo seed migration `1782100000000`); khoá/duyệt; liên kết khách; thùng rác.

**12. Quản lý Trạng thái công việc** — `/quan-ly-trang-thai-cong-viec` · slug `trang-thai-cong-viec`
- Quyền: `periodic_task_statuses.view` / `manage` / `delete`. Mẫu: 🆕`task-status-tags`, 🆕`task-status-manage-table`. Nội dung: màu/ý nghĩa trạng thái; trạng thái "khoá" chặn sửa (**xác nhận**); tác động tới Kanban.

**13. Lịch sử Công việc** — `/lich-su-cong-viec` · slug `lich-su-cong-viec`
- Quyền: `periodic_tasks.audit_view`; dọn dẹp/xoá hàng loạt: `periodic_tasks.delete`.
- Thành phần: `LazyAuditDiff`, `TaskAuditLogsModal`, `WeeklyLazySection`.
- Mẫu: 🆕`task-audit-row` (diff trước/sau) · 🆕`task-audit-cleanup`. Nội dung: đọc diff; lọc theo khoảng ngày; dọn dẹp không hoàn tác; log tách riêng khỏi "Nhật ký hệ thống".

**14. Hiệu suất công việc** — `/hieu-suat-cong-viec` · slug `hieu-suat-cong-viec`
- Quyền: nav không gate permission; page không có `can()` (F9 → **xác nhận BE**).
- Thành phần: `PerformanceStackedChart`, `OwnPerformanceDetail`, `PerformanceUserTasksDrawer`, `MetricTasksModal`, `PeriodTypeTag`.
- Mẫu: 🆕`performance-chart` (bản rút gọn, D4) · 🆕`own-performance`. Nội dung: cách tính các chỉ số (**đọc BE**); xem của mình vs của người khác theo role.

**15. Nghỉ phép** — `/nghi-phep` · slug `nghi-phep`
- Quyền: `leave_requests.request`. Thành phần: form tạo đơn, `AttachmentUploader`, `AttachmentsViewerButton`, `WeeklyLazySection`.
- Mẫu: 🆕`leave-form` · 🆕`leave-status-tags` · 🆕`leave-my-requests`. Nội dung: tạo/huỷ đơn; loại phép; đính kèm ảnh; trạng thái Chờ/Duyệt/Từ chối; số ngày còn lại (**xác nhận**).

**16. Duyệt phép** — `/duyet-phep` · slug `duyet-phep`
- Quyền vào: `leave_requests.view` **hoặc** `leave_requests.approve` (OR). Hành động: `approve`, `edit` (sửa hộ), `delete` (có scope, mặc định chỉ Admin).
- Mẫu: 🆕`leave-approve-table` · 🆕`leave-actions-by-viewer` (Manager chỉ duyệt đơn phòng ban mình; Admin/Assistant tất cả). Nội dung: duyệt/từ chối/sửa hộ; đơn đã duyệt → thùng rác; huỷ đơn đã duyệt; badge số đơn chờ trên sidebar.

**17. Quản lý Loại phép** — `/quan-ly-loai-phep` · slug `loai-phep`
- Quyền: `leave_types.view` / `manage` / `delete`. Mẫu: 🆕`leave-type-table`. Nội dung: loại phép ảnh hưởng form Nghỉ phép; xoá loại đang dùng (**xác nhận**).

### P3 — Thông báo & cá nhân

**18. Thông báo** — `/thong-bao` · slug `thong-bao`
- Quyền: mọi người (F9 → xác nhận). Thành phần: `NotificationRow`. Mẫu: 🆕`notification-list` (chưa đọc/đã đọc, loại Task/Hệ thống/Thủ công). Nội dung: hộp thư cá nhân; chuông ở Header; đánh dấu đã đọc.

**19. Gửi thông báo** — `/thong-bao/gui` · slug `gui-thong-bao`
- Quyền: `notification_broadcasts.create`. Thành phần: `BroadcastComposeFields`. Mẫu: 🆕`broadcast-compose` (chọn đối tượng nhận). Nội dung: chọn người nhận (role/phòng ban/…), nội dung, hậu quả khi gửi (không thu hồi? **xác nhận**).

**20. Thông báo đã gửi** — `/thong-bao/da-gui` · slug `thong-bao-da-gui`
- Quyền: `notification_broadcasts.view`; `edit`, `delete`, `create`. Thành phần: `SendBroadcastModal`. Mẫu: 🆕`broadcast-sent-table` · 🆕`broadcast-actions-by-viewer`. Nội dung: sửa/xoá thông báo đã gửi ảnh hưởng người đã nhận thế nào (**xác nhận**).

**21. Profile** — `/profile` · slug `profile`
- Quyền: `profile.edit_info`, `profile.edit_email`, `profile.edit_avatar`, `profile.change_password`; xem hồ sơ người khác: `users.view`; `users.delete`; có `role === 'admin'` (F8).
- Thành phần: `AvatarUpload`. Mẫu: 🆕`profile-form-by-viewer` (trường nào sửa được theo `profile.*`) · 🆕`avatar-upload`. Nội dung: tự sửa thông tin/email/mật khẩu; Admin xem/sửa hồ sơ người khác.

**22. Hướng dẫn sử dụng** — `/huong-dan` · slug `huong-dan-su-dung`
- Quyền: mọi người xem; `guides.manage` để soạn. Thành phần: `GuideEditorModal`, `GuideAudienceTags`.
- Mẫu: 🆕`guide-editor-modal` · 🆕`guide-audience-tags` · 🆕`az-demo-fence-example`. Nội dung: **dành cho người soạn** (audience chỉ Admin/`guides.manage`): cách chèn mẫu, chọn role/vị trí/phòng ban (AND), nháp/xuất bản, quy tắc Markdown an toàn.

**23. Báo cáo doanh số** — `/reports` · slug `bao-cao-doanh-so`
- Quyền: `reports.view`. Mẫu: 🆕`sales-report-table` (bản rút gọn). Nội dung: cách tính doanh số/FTD, phạm vi dữ liệu theo role (**đọc BE reports**), bộ lọc ngày.

### P4 — Quản trị

**24. Nhân viên** — `/users` · slug `nhan-vien`
- Quyền: `users.view`, `users.manage`, `users.delete`; có `role === 'admin'` ×3 (F8).
- Mẫu: 🆕`users-table` · 🆕`user-actions-by-viewer` · 🆕`user-form`. Nội dung: tạo/sửa/duyệt đăng ký, khoá/mở, đặt lại mật khẩu, gán role/phòng ban/vị trí/Sếp duyệt phép; Assistant = Admin trừ Xoá (theo `PERMISSIONS.md`, **đối chiếu hành vi thật**).

**25. Phòng ban** — `/phong-ban` · slug `phong-ban`
- Quyền: `departments.view` / `manage` / `delete`; `users.view`; có `role === 'manager'` ×2 (F8).
- Mẫu: 🆕`department-table` · 🆕`department-form`. Nội dung: `manager_user_id` = người **quản lý** phòng (khác phòng họ thuộc về) → quyết định phạm vi Manager.

**26. Vị trí** — `/vi-tri` · slug `vi-tri`
- Quyền: `positions.view` / `manage` / `delete`; `roles.manage`. Mẫu: 🆕`position-table`. Nội dung: Vị trí là tầng override ưu tiên cao nhất (Vị trí → Phòng ban → Toàn cục); ví dụ Admin/HR, Employee/Content.

**27. Phân quyền** — `/phan-quyen` · slug `phan-quyen` · **audience chỉ Admin/`roles.view`**
- Quyền: `roles.view`, `roles.manage`; `positions.view`, `departments.view`.
- Thành phần: Drawer ma trận, `ColorPickerField`.
- Mẫu: 🆕`permission-matrix` (rút gọn, D4) · 🆕`override-layers` (Toàn cục → Phòng ban → Vị trí, minh hoạ ghi đè) · 🆕`ui-visibility-matrix` (ẩn field/tab).
- Nội dung: 3 tầng ưu tiên; scope `own/department/all` + `NONE`; lỗi kinh điển "lưu ma trận Toàn cục xoá override" đã sửa (không dặn dò sai); quyền không thể tự đặt (chỉ dev seed).

**28. Nhật ký hệ thống** — `/audit-logs` · slug `nhat-ky-he-thong`
- Quyền: `audit.view`; dọn dẹp: `audit.manage`. Thành phần: `LazyAuditDiff`, `WeeklyLazySection`, `SalesUserSelect`.
- Mẫu: 🆕`audit-row` (nhãn action từ `audit-meta.ts`) · 🆕`audit-filters`. Nội dung: đọc 1 dòng log; lọc theo nhóm action/đối tượng/người; dọn dẹp không hoàn tác.

**29. Máy chấm công** — `/attendance-device` · slug `may-cham-cong`
- Quyền: `attendance.view`; quản lý/đồng bộ: `attendance.manage`; xoá log: `attendance.delete` (chỉ Admin). Mẫu: 🆕`attendance-table` · 🆕`zk-mapping`. Nội dung: map mã máy ↔ nhân viên; đồng bộ/khớp lại log; **giờ lưu theo giờ máy** (lưu ý timezone, theo `decode-device-time.util.ts` — **xác nhận trước khi viết**).

**30. Quản lý lưu trữ ảnh** — `/storage-img` · slug `luu-tru-anh`
- Quyền: `storage.view`, `storage.manage`. Mẫu: 🆕`storage-usage` · 🆕`storage-media-table`. Nội dung: hạn mức dung lượng, giới hạn tải ảnh, xoá file (không hoàn tác), ảnh avatar/đính kèm phép/media-library.

---

## 7. Rủi ro & cách giảm

| Rủi ro | Giảm |
|---|---|
| Guide mô tả sai vì chép từ tài liệu cũ | Bước 0 mỗi trang: đọc page + controller thật; không tin `README_AZWORKBASE_PROJECT.md`/transcript |
| Mẫu lệch UI thật sau này | Dùng component thật + test hợp đồng (2.4) + PR checklist |
| `guides:sync` ghi đè bài người khác sửa trên UI | Mặc định dry-run + so hash + không ghi đè nếu khác (cờ `--force`) |
| Lộ nội dung quản trị cho người không có quyền | Audience hẹp cho `phan-quyen`, `nhat-ky-he-thong`, `huong-dan-su-dung`; D2 nếu chốt |
| Nhiều tài khoản cùng sửa `guide-demos` → xung đột | Tách file theo module (2.2) — mỗi phase đụng file riêng |
| Migration D2 trùng timestamp | `ls` migrations sau khi `pull`, lấy số > lớn nhất (hiện `1785600000000`) |

## 8. Thứ tự làm đề xuất (để thấy kết quả sớm nhất)
1. **P0** (nền tảng) — sau đó trang Khách hàng đã có bảng đúng 12 cột + chuyển vai trò.
2. **P1** theo thứ tự `khach-hang` → `chia-data` → `quan-ly-phu-trach` (3 bài này giải quyết đúng "trống trải" + "hiển thị theo quản lý phụ trách & phân quyền").
3. P2 → P3 → P4 → P5.
