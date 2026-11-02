# PLAN: Rút tiền (Withdrawal) + Xuất Excel Duyệt phép

> Tạo: 2026-11-02 · Dựa trên code THẬT vừa clone (`main`, migration mới nhất `1786350000000-CreateBulkOperations`).
> Đặt vào `AZ-Workbase Skills/PLAN_WITHDRAWAL_LEAVE_EXPORT.md`. Mỗi lần xong 1 phase → tick `[x]` + append 1 dòng vào `WORKFLOW_LOG.md`.

---

## 0. Hiện trạng đã xác minh trong code

### Nạp tiền (deposit)
- Entity `database/entities/deposit.entity.ts`: `amount DECIMAL(15,2)` + `DecimalTransformer` (bắt buộc), `deposit_date DATE`, `broker`, `note`, `created_by_id` (+ cột legacy `created_by` NOT NULL — **KHÔNG copy sang bảng mới**).
- `modules/deposits/deposits.module.ts` chỉ là vỏ rỗng. Toàn bộ logic nạp tiền nằm trong `customers.controller.ts` + `customers.service.ts` (file service đã ~2000+ dòng):
  - `POST :id/deposits` → `customers.edit` · `GET :id/deposits` → `customers.view` (5 bản ghi gần nhất)
  - `PATCH deposits/:id` (chỉ sửa ghi chú) → `customers.edit` · `DELETE deposits/:id` → `customers.delete` (chỉ Admin)
  - Mọi thao tác đi qua `assertCustomerAccessible()` (phạm vi theo scope) và `auditService.logActionAsync` (`CREATE_DEPOSIT`, `UPDATE_DEPOSIT_NOTE`, `DELETE_DEPOSIT`).
- FE: tab "Nạp tiền" trong `components/customers/CustomerDetailDrawer.tsx` (gate bằng `isTabHidden('tab:deposits')`), `DepositForm.tsx`, `CustomerDepositTable.tsx`.
- Khuôn mẫu migration permission: `1783800000000-AddCustomersExportPermission.ts` (INSERT `permissions` + `role_permissions` theo role).

### Duyệt phép (leave-requests)
- **Đã có sẵn** `LeaveRequestsStatsService.getStats()` → `LeaveStatsResult` gồm: `summary` (requests/approved/rejected/pending/approvalRate…), `byType`, `byDepartment`, `byEmployee` (requests, approved, rejected, pending, supplementary, approvalRate), `trend`, `byWeekday`, `frequency`. Gate `leave_requests.view`, kỳ báo cáo kế thừa `QueryReportDto`, áp scope bằng `applyApproverScope`.
- FE `duyet-phep/LeaveStatsTab.tsx` (604 dòng, recharts) đã hiển thị đúng các số này.
- `exceljs` đã có (BE), nạp lười qua `common/utils/exceljs-loader.ts`; pattern tải file: `attendance-export` / `customers-export` (BE trả buffer, FE `responseType: 'blob'`).
- **Chưa có** permission `leave_requests.export`.
- ⚠️ `exceljs` **không hỗ trợ biểu đồ gốc** → xem mục 3.4.

→ Xuất Excel phải **tái dùng `getStats()`** (không viết lại logic đếm) để số trong file khớp 100% số trên UI.

---

## 1. Các điểm cần bạn chốt TRƯỚC khi code (mình đã đề xuất mặc định)

| # | Câu hỏi | Mặc định mình sẽ làm nếu bạn không đổi |
|---|---|---|
| Q1 | "Phân quyền nằm chung migration hiện tại" — hiểu là: **1 migration duy nhất** vừa tạo bảng `withdrawals` vừa seed permission (không tách 2 file)? | Có. 1 file migration, `up()`/`down()` đối xứng |
| Q2 | Permission rút tiền: tạo key mới hay dùng lại `customers.edit/delete`? | Key mới: `customers.withdrawal_create`, `customers.withdrawal_edit`, `customers.withdrawal_delete`; **xem** dùng lại `customers.view` |
| Q3 | Rút tiền có làm đổi "Tổng nạp" / báo cáo Doanh thu hiện tại không? | **Không** (giữ nguyên mọi số nạp, tránh đụng bug lệch tổng nạp từng gặp). Chỉ thêm "Tổng rút" riêng trong tab khách hàng; Net (nạp − rút) để phase sau nếu bạn muốn |
| Q4 | Trường của phiếu rút? | Giống deposit: `amount`, `withdrawal_date`, `broker`, `note` (+ audit trail) |
| Q5 | Quyền xuất Excel phép: key mới `leave_requests.export` hay dùng `leave_requests.view`? | Key mới `leave_requests.export` (cùng kiểu `customers.export`), seed scope giống `leave_requests.view` theo từng role → **cần thêm 1 migration riêng** |
| Q6 | Biểu đồ trong Excel (mục 3.4) chọn cách nào? | Hybrid: mọi form có thanh dữ liệu (data bar) + riêng form "Báo cáo + biểu đồ" chèn **ảnh PNG** do FE render từ chính chart recharts đang hiển thị |

---

## 2. PHẦN 1 — Rút tiền (Withdrawal)

### Thiết kế
- Bảng mới `withdrawals`: `id`, `customer_id` (FK → customers, ON DELETE CASCADE), `amount DECIMAL(15,2)` (+ `DecimalTransformer`), `withdrawal_date DATE`, `broker VARCHAR(100) NULL`, `note TEXT NULL`, `created_by_id INT NULL` (FK users), `created_at`, `updated_at`. Index: `(customer_id, withdrawal_date)`, `(withdrawal_date)`.
- Permission seed: 3 key mới `supports_scope = TRUE`; `role_permissions` sao chép scope từ `customers.edit` (create/edit) và `customers.delete` (delete) → mặc định ai nạp được thì rút được, ai xoá nạp được thì xoá rút được (Admin only).
- Backend: **không** nhét thêm vào `customers.service.ts` — tạo `customers-withdrawals.service.ts` trong module customers (giống `customers-export.service.ts`) để giảm xung đột merge giữa các tài khoản. Route khai báo **trước** `@Patch(':id')`/`@Delete(':id')`:
  - `POST customers/:id/withdrawals`, `GET customers/:id/withdrawals`, `PATCH customers/withdrawals/:id` (chỉ sửa ghi chú, như deposit), `DELETE customers/withdrawals/:id`.
  - Mọi route qua `assertCustomerAccessible()`; audit: `CREATE_WITHDRAWAL`, `UPDATE_WITHDRAWAL_NOTE`, `DELETE_WITHDRAWAL` (snapshot đầy đủ trước khi xoá).
- FE: tab "Rút tiền" cạnh "Nạp tiền" trong `CustomerDetailDrawer`; `WithdrawalForm`, `CustomerWithdrawalTable`, `lib/api`, hook, type; nút gate bằng `can('customers.withdrawal_*')` (không hardcode role); thêm `tab:withdrawals` vào `ui-visibility.constants.ts`.

### Phases
- [ ] **W0** Chốt Q1–Q4. `git pull` + `ls migrations` lấy timestamp thật (> `1786350000000`).
- [ ] **W1** Entity `withdrawal.entity.ts` + đăng ký entity/module + migration (bảng + permission + role_permissions) + `down()`.
- [ ] **W2** DTO (`create-withdrawal.dto.ts`, `update-withdrawal-note.dto.ts`), service, controller, audit actions.
- [ ] **W3** FE: type/api/hook/form/table + tab trong Drawer + gate permission + ui-visibility.
- [ ] **W4** Tích hợp phụ: audit log FE (nhãn action mới), thùng rác/xoá khách (cascade), export khách (nếu cần cột Tổng rút).
- [ ] **W5** Test + docs (`PERMISSIONS.md` §2.1 + catalogue, `WORKFLOW_LOG.md`, guide khách hàng).

### ✅ Checklist sau MỖI lần handle — Rút tiền
1. Migration: timestamp > số lớn nhất hiện có; không sửa migration cũ; `IF NOT EXISTS` khi phù hợp; chạy thử `up` → `down` → `up` trên DB trống.
2. Key permission trong `@RequirePermission(...)` **đã được seed** trong migration (key không tồn tại = khoá vĩnh viễn trừ Admin).
3. `role === 'admin'` vẫn bypass ở đủ 3 lớp (`PermissionGuard`, `RolesService.getMyPermissions()`, helper tự check) — không phá khi thêm key.
4. Seed `role_permissions`: kiểm tra có sao chép đúng cả **override theo phòng ban** (`department_id`) hay chỉ Toàn cục; query không xoá nhầm override.
5. `amount` có `DecimalTransformer`; DTO `@Min(0.01)`; không `any` mới.
6. Route 2 đoạn (`withdrawals/:id`) không bị `:id` nuốt; Manager ngoài phòng ban → 404, không rò dữ liệu.
7. Audit: có log CREATE/UPDATE/DELETE, delete lưu snapshot; không log dữ liệu nhạy cảm thừa.
8. FE: nút/tab ẩn đúng khi thiếu quyền (không để user bấm rồi 403); số tiền `Number(val)`, ngày format bằng dayjs; Space dùng đúng API antd v6 (không `direction` cũ); dùng `App.useApp()` cho message/modal.
9. Số "Tổng nạp" / báo cáo Doanh thu **không đổi** (so sánh trước–sau trên cùng dữ liệu).
10. `tsc --noEmit` BE + FE, `nest build`, `npx jest` (customers) + `npx vitest run` (FE) — dán kết quả thật.
11. `console.log` = 0 ở BE (dùng `Logger`); không đổi `synchronize`.
12. Cập nhật `PERMISSIONS.md` + append `WORKFLOW_LOG.md`.

---

## 3. PHẦN 2 — Xuất Excel "Duyệt phép"

### 3.1 Các form xuất (người dùng chọn trong Modal)
| Form | Dạng | Nội dung |
|---|---|---|
| **A. Tổng hợp theo nhân viên** | Table | Nhân viên, Phòng ban, Số đơn, **Đã duyệt**, **Từ chối**, Chờ duyệt, Bổ sung, Tổng ngày xin, Ngày đã duyệt, **Tỷ lệ duyệt %** (từ `byEmployee`) |
| **B. Chi tiết từng đơn** | Table | Nhân viên, Phòng ban, Loại phép, Từ–Đến, Số ngày, Trạng thái, Người duyệt, Lý do từ chối, Bổ sung?, Ngày tạo (giới hạn số dòng) |
| **C. Theo phòng ban & loại phép** | Table (2 sheet) | `byDepartment` (quân số, tỷ lệ tham gia, TB ngày/người) + `byType` |
| **D. Ma trận Nhân viên × Tháng** | Pivot (dạng khác) | Hàng = nhân viên, cột = tháng/tuần trong kỳ, ô = số đơn (hoặc ngày đã duyệt); có tổng hàng/cột + color scale |
| **E. Báo cáo + biểu đồ** | Table + chart | Sheet KPI (`summary`) + bảng A + biểu đồ: cột chồng Duyệt/Từ chối/Chờ theo nhân viên (top N), cơ cấu loại phép, xu hướng theo thời gian |
| **F. Gói đầy đủ** | Nhiều sheet | A + B + C + D (+ E nếu có ảnh) trong 1 file |

### 3.2 Backend
- Permission: `leave_requests.export` (Q5) — migration riêng, seed scope giống `leave_requests.view` theo role (khuôn `AddCustomersExportPermission`).
- Endpoint `POST /leave-requests/export` (POST vì có thể kèm ảnh chart), khai báo **trước** các route `:id`. DTO kế thừa `QueryLeaveStatsDto` + `form` (enum A–F) + `chartImages?` (khai đủ field vì `forbidNonWhitelisted`). Giới hạn: kích thước ảnh, ≤ 4 ảnh, kiểm tra magic bytes PNG; cap số dòng form B (vd 5000) và báo rõ khi bị cắt (giới hạn body/response ~4.5MB của Vercel).
- Service mới `leave-requests-export.service.ts`:
  - Lấy dữ liệu bằng `LeaveRequestsStatsService.getStats()` / `getRequests()` — **cùng scope** với UI (Manager chỉ phòng ban mình, v.v.).
  - Tách các hàm dựng bảng thành hàm thuần (nhận `LeaveStatsResult` → mảng hàng) để unit test không cần ExcelJS.
  - Dùng `loadExcelJS()`; style header/border như `customers-export.service.ts`.
  - Chống công thức độc (ô bắt đầu bằng `= + - @` ở cột lý do/tên → thêm `'`), ngày dùng `toYmd` (không serialize `Date` — tránh bug lệch múi giờ đã gặp).
  - Tên file: `Thong-ke-nghi-phep_<from>_<to>.xlsx`; controller gửi buffer theo `sendXlsx` như attendance-export.
- Audit: ghi 1 log `EXPORT_LEAVE_REQUESTS` (ai, form, kỳ, số dòng).

### 3.3 Frontend
- Nút "Xuất Excel" trong `LeaveStatsTab` (dùng luôn `PeriodSelector`/bộ lọc đang chọn) → Modal chọn form A–F (+ xem trước kỳ, phòng ban, loại phép), gate `can('leave_requests.export')`.
- API client theo `attendance-export.api.ts` (`responseType: 'blob'`, parse blob lỗi để hiện message BE).
- Form E/F: chụp các chart recharts hiện có thành PNG phía FE rồi gửi kèm (xem 3.4). Chặn bấm đúp khi đang xuất (`loading`).
- Hook/permission: dùng `useMyPermissions().can(...)`, không hardcode role.

### 3.4 Quyết định kỹ thuật về biểu đồ (rủi ro lớn nhất)
`exceljs` không tạo biểu đồ gốc; backend chạy Vercel serverless nên không dùng `canvas` native; dịch vụ ngoài (QuickChart…) vi phạm ràng buộc "không kết nối bên ngoài".
| Cách | Ưu | Nhược |
|---|---|---|
| 1. Ảnh PNG từ FE chèn bằng `addImage` | Đẹp, giống đúng chart trên web, không thêm dependency BE | Ảnh tĩnh (không sửa trong Excel); phụ thuộc FE gửi lên |
| 2. Hậu xử lý ZIP để chèn chart gốc (drawing/chart XML) | Chart gốc, sửa được | Phức tạp, dễ hỏng file, khó test |
| 3. Data bar + color scale + thanh `REPT` trong ô | Nhẹ, không phụ thuộc, an toàn | Không phải biểu đồ "thật" |
→ **Đề xuất**: dùng (3) cho form A/C/D để luôn có trực quan, và (1) cho form E/F; nếu FE không gửi ảnh thì E vẫn xuất được với (3). Chỉ cân nhắc (2) nếu bạn bắt buộc chart sửa được trong Excel.

### Phases
- [ ] **L0** Chốt Q5–Q6. `git pull` + kiểm tra `getStats()`/`getRequests()` còn đúng chữ ký.
- [ ] **L1** Hàm dựng bảng thuần cho form A, B, C, D + unit test (kể cả kỳ rỗng, nhân viên 0 đơn, tỷ lệ `null`).
- [ ] **L2** Service ExcelJS (style, data bar, freeze header, auto width) + controller + DTO + migration `leave_requests.export` + audit.
- [ ] **L3** FE: nút + Modal chọn form + gọi API + tải file (form A–D, F không ảnh).
- [ ] **L4** Form E: FE chụp chart → PNG, BE chèn ảnh; fallback không ảnh.
- [ ] **L5** Test + docs (`PERMISSIONS.md` §2.6, `guides-content/duyet-phep.md`, `WORKFLOW_LOG.md`).

### ✅ Checklist sau MỖI lần handle — Xuất Excel phép
1. **Khớp UI**: tổng đơn/duyệt/từ chối/chờ trong file = số trên `LeaveStatsTab` cùng kỳ + cùng bộ lọc (so thủ công 1 kỳ mẫu).
2. Scope: Manager chỉ thấy phòng ban mình, Employee không xuất được dữ liệu người khác; thử ít nhất 3 role.
3. Đơn **Đã huỷ** và đơn trong **Thùng rác** không bị tính (đúng quy ước `leave-stats.util`); đơn bổ sung được phân biệt.
4. Key `leave_requests.export` đã seed; Admin bypass đủ 3 lớp; FE ẩn nút khi thiếu quyền.
5. Route `export` đứng trước `:id`; DTO khai đủ field (không 400 do `forbidNonWhitelisted`).
6. Kỳ rỗng / không có đơn → file vẫn mở được, có thông báo "Không có dữ liệu", không crash.
7. Ngày không lệch múi giờ (so DB vs Excel); số tiền/ngày là number, không phải string.
8. Chống formula injection ở cột text; tên có dấu tiếng Việt hiển thị đúng; tên file tải về đúng (RFC 5987).
9. Hiệu năng: kỳ lớn (1 năm, toàn công ty) trong giới hạn thời gian/payload Vercel; có cap + thông báo cắt.
10. Mở file thật bằng Excel/LibreOffice (header đóng băng, data bar, ảnh chart hiển thị) — render thử bằng LibreOffice trong sandbox.
11. Ảnh chart: validate PNG + giới hạn kích thước ở BE (không tin FE).
12. `tsc --noEmit`, `nest build`, `npx jest modules/leave-requests`, `npx vitest run`, dán kết quả thật; không `console.log`.
13. Audit `EXPORT_LEAVE_REQUESTS` ghi được; cập nhật docs + `WORKFLOW_LOG.md`.

---

## 4. Thứ tự & rủi ro
- Thứ tự đề xuất: **W0→W5 (rút tiền)** trước, rồi **L0→L5 (xuất Excel)**. Hai phần độc lập, nhưng cùng đụng `PERMISSIONS.md`, `WORKFLOW_LOG.md` → pull lại trước mỗi phase để tránh xung đột giữa các tài khoản.
- Rủi ro chính: (1) seed permission thiếu/sai scope → 403 im lặng; (2) lệch số giữa Excel và UI; (3) chart trong Excel (mục 3.4); (4) `customers.service.ts` quá lớn → dùng service riêng.
- Không làm: auto lead, kết nối bên ngoài; không tự chạy migration lên DB production — chỉ đưa file để bạn chạy và xác nhận.
