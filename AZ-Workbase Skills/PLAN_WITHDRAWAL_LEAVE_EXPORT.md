# PLAN: Rút tiền (Withdrawal) + Xuất Excel Duyệt phép

> Tạo: 2026-11-02 · **Bản 2 (đã chốt quyết định của chủ dự án)** · Dựa trên code THẬT vừa clone (`main`, migration mới nhất `1786350000000-CreateBulkOperations`).
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
- Quyền xuất = dùng lại `leave_requests.approve` (đã chốt) → không thêm permission/migration cho phần xuất.
- ⚠️ `exceljs` **không hỗ trợ biểu đồ gốc**, nhưng đã chốt cần chart gốc sửa được → xem mục 3.4 (chèn OOXML chart bằng `jszip`).
- Chỗ đang hiển thị "Tổng nạp": thẻ `StatsCards.tsx` (+ `customers/page.tsx`), cột "Nạp tiền" (`totalDeposit30Days`), `CustomerPeriodStats.tsx`, tab Doanh thu ở `reports/`; khung ngày dùng chung `applyDepositDateRange()`.

→ Xuất Excel phải **tái dùng `getStats()`** (không viết lại logic đếm) để số trong file khớp 100% số trên UI.

---

## 1. Quyết định đã chốt

| # | Quyết định |
|---|---|
| Q1 | Rút tiền **dùng lại `customers.edit`** (tạo + sửa ghi chú) và `customers.delete` (xoá, chỉ Admin — giống nạp tiền). **Không tạo permission key mới**, nên migration chỉ tạo bảng `withdrawals`. |
| Q2 | Rút tiền **không làm đổi "Tổng nạp"**. Hiển thị riêng 3 chỉ số: **Tổng nạp** (không tính rút) · **Nạp thực** (= nạp − rút) · **Đã rút** (chỉ tính rút). |
| Q3 | Xuất Excel phép dùng **`leave_requests.approve`**, không tạo key/migration mới. |
| Q4 | Chart trong Excel phải là **chart gốc, sửa được**; và **cho user xem Demo (preview) trước khi xuất**. |

Còn 2 điểm nhỏ mình đặt mặc định (bạn sửa nếu muốn khác):
- 3 chỉ số rút/nạp thực hiện ở: **thẻ thống kê danh sách khách** + **đầu tab Nạp/Rút trong Drawer từng khách**. Cột riêng trong bảng và tab Doanh thu của báo cáo để phase sau.
- Phiếu rút có `amount`, `withdrawal_date`, `broker`, `note` (giống deposit).

---

## 2. PHẦN 1 — Rút tiền + 3 chỉ số

### Thiết kế
- Bảng `withdrawals`: `id`, `customer_id` (FK ON DELETE CASCADE), `amount DECIMAL(15,2)` (+ `DecimalTransformer`), `withdrawal_date DATE`, `broker VARCHAR(100) NULL`, `note TEXT NULL`, `created_by_id INT NULL` (FK users), `created_at`, `updated_at`. Index `(customer_id, withdrawal_date)` và `(withdrawal_date)`. Không copy cột legacy `created_by` của deposits.
- Migration: **chỉ tạo bảng** (+ `down()` xoá bảng). Không seed permission.
- Backend: `customers-withdrawals.service.ts` riêng (tránh phình `customers.service.ts`), route trong `customers.controller.ts` khai báo **trước** `:id`:
  - `POST :id/withdrawals` → `customers.edit` · `GET :id/withdrawals` → `customers.view` · `PATCH withdrawals/:id` (chỉ ghi chú) → `customers.edit` · `DELETE withdrawals/:id` → `customers.delete`
  - Đều qua `assertCustomerAccessible()`; audit `CREATE_WITHDRAWAL` / `UPDATE_WITHDRAWAL_NOTE` / `DELETE_WITHDRAWAL` (xoá lưu snapshot).
- **3 chỉ số**: dùng **cùng khung ngày + cùng phạm vi khách** với "Tổng nạp" (tái dùng `applyDepositDateRange()` hoặc bản tương đương cho `withdrawal_date`), để số luôn khớp bảng.
  - Tổng nạp = SUM(deposits) (không đổi) · Đã rút = SUM(withdrawals) · Nạp thực = Tổng nạp − Đã rút (có thể âm → hiển thị rõ, màu đỏ).
  - Endpoint stats hiện có trả thêm `totalWithdrawal`, `netDeposit` (thêm field, không đổi field cũ → không vỡ FE cũ).
- FE: tab "Rút tiền" cạnh "Nạp tiền" (`CustomerDetailDrawer`), `WithdrawalForm`, `CustomerWithdrawalTable`; `StatsCards` thêm 2 thẻ (Nạp thực, Đã rút) cạnh "Tổng nạp"; nút gate `can('customers.edit')`/`can('customers.delete')`; thêm `tab:withdrawals` vào `ui-visibility.constants.ts` và **ẩn 2 thẻ mới cùng cờ ẩn với "Tổng nạp"** (không để lộ số tiền khi Admin đã ẩn tab nạp).

### Phases
- [x] **W0** `git pull`, lấy timestamp migration thật (> `1786350000000`).
- [x] **W1** Entity + đăng ký + migration tạo bảng (`up`/`down`).
- [x] **W2** DTO + service + controller + audit. *(Đã làm: danh sách trả tối đa 50 phiếu mới nhất; xoá cũng kiểm tra phạm vi khách; nhãn audit FE để W5.)*
- [ ] **W3** Mở rộng stats BE: `totalWithdrawal`, `netDeposit` (cùng khung ngày/scope) + test.
- [ ] **W4** FE: tab Rút tiền, form, bảng, 3 chỉ số (StatsCards + đầu tab), ui-visibility.
- [ ] **W5** Audit log FE (nhãn action mới), kiểm tra xoá khách/thùng rác, docs (`PERMISSIONS.md` §2.1, `WORKFLOW_LOG.md`, guide khách hàng).

### ✅ Checklist sau MỖI lần handle — Rút tiền
1. Migration: timestamp > số lớn nhất hiện có; không sửa migration cũ; chạy thử `up → down → up` trên DB trống.
2. Mọi route rút tiền dùng key **đã tồn tại** (`customers.edit/view/delete`); Employee có `customers.edit` thì tạo được phiếu rút cho khách của mình.
3. Admin bypass vẫn đủ 3 lớp (không đổi, nhưng test lại 1 lần).
4. `amount` có `DecimalTransformer`; DTO `@Min(0.01)`; FE dùng `Number(val)`.
5. Route 2 đoạn `withdrawals/:id` không bị `:id` nuốt; Manager ngoài phòng ban → 404.
6. **Tổng nạp không đổi** so với trước khi có rút tiền (so trên cùng dữ liệu); **Nạp thực = Tổng nạp − Đã rút** đúng khi lọc theo ngày / trạng thái "Đã chốt" (tránh lặp bug lệch tổng nạp cũ).
7. Số 3 chỉ số khớp với bảng/Drawer cùng khung ngày; trường hợp không có rút → Đã rút = 0, Nạp thực = Tổng nạp; Nạp thực âm hiển thị đúng.
8. Ẩn đúng khi `tab:deposits`/`tab:withdrawals` bị ẩn theo Position/Department.
9. Audit có CREATE/UPDATE/DELETE; xoá lưu snapshot.
10. FE: `App.useApp()`, antd v6 API đúng, chặn bấm đúp, không hardcode role.
11. `tsc --noEmit` BE+FE, `nest build`, `npx jest` (customers), `npx vitest run` — dán kết quả thật; không `console.log`.
12. Cập nhật `PERMISSIONS.md` + append `WORKFLOW_LOG.md`.

---

## 3. PHẦN 2 — Xuất Excel "Duyệt phép" (chart gốc + Demo trước khi xuất)

### 3.1 Các form xuất
| Form | Dạng | Nội dung |
|---|---|---|
| **A. Tổng hợp theo nhân viên** | Table | Nhân viên, Phòng ban, Số đơn, **Đã duyệt**, **Từ chối**, Chờ duyệt, Bổ sung, Tổng ngày xin, Ngày đã duyệt, **Tỷ lệ duyệt %** |
| **B. Chi tiết từng đơn** | Table | Nhân viên, Phòng ban, Loại phép, Từ–Đến, Số ngày, Trạng thái, Người duyệt, Lý do từ chối, Bổ sung?, Ngày tạo (có cap số dòng) |
| **C. Theo phòng ban & loại phép** | Table (2 sheet) | `byDepartment` + `byType` |
| **D. Ma trận Nhân viên × Tháng** | Pivot | Hàng = nhân viên, cột = tháng/tuần, ô = số đơn (hoặc ngày duyệt), tổng hàng/cột + color scale |
| **E. Báo cáo + biểu đồ** | Table + **chart gốc** | KPI + bảng A + chart cột chồng Duyệt/Từ chối/Chờ theo nhân viên (top N), chart tròn/donut cơ cấu loại phép, chart đường xu hướng |
| **F. Gói đầy đủ** | Nhiều sheet | A + B + C + D + E |

### 3.2 Kiến trúc: 1 "model" dùng chung cho Demo và file Excel
- Hàm thuần `buildLeaveExportModel(form, stats, rows)` → `ExportModel { sheets: [{ name, tables[], charts[] }] }` (chart = `{ type: 'barStacked'|'doughnut'|'line', title, categories, series[] }`).
- **Preview** và **Excel** cùng đọc `ExportModel` → xem gì xuất nấy (không lệch).
- Endpoints (gate `leave_requests.approve`, scope của chính key này, khai báo **trước** `:id`):
  - `POST /leave-requests/export/preview` → trả `ExportModel` đã cắt gọn (mỗi bảng ≤ ~20 dòng + cờ `truncated`, tổng số dòng thật).
  - `POST /leave-requests/export` → trả `.xlsx`.
  - DTO kế thừa `QueryLeaveStatsDto` + `form` (A–F); khai đủ field vì `forbidNonWhitelisted`. Không còn nhận ảnh từ FE.
- Dữ liệu lấy qua `LeaveRequestsStatsService.getStats()`/`getRequests()` (không viết lại logic đếm).
- ⚠️ **Rủi ro scope**: các hàm stats hiện áp scope của `leave_requests.view`; export gate bằng `approve` nên `@GetPermissionScope()` sẽ trả scope của **approve**. Phải xác nhận (a) `leave_requests.approve` có `supports_scope`, (b) `applyApproverScope` hiểu scope này, (c) người có `approve` nhưng không có `view` vẫn lấy được dữ liệu đúng phạm vi và **không rộng hơn** phạm vi duyệt của họ.
- Audit `EXPORT_LEAVE_REQUESTS` (ai, form, kỳ, số dòng).

### 3.3 Frontend — Modal Demo → Xuất
- Nút "Xuất Excel" trong `LeaveStatsTab` (dùng luôn bộ lọc/kỳ đang chọn), hiện khi `can('leave_requests.approve')` (và tab đang xem được).
- Modal 2 bước: **(1) chọn form A–F → (2) Demo**: render từ `ExportModel` bằng `antd Table` (ô tối đa 20 dòng, ghi chú "còn N dòng") + **recharts** vẽ đúng series/loại chart sẽ có trong Excel; nút "Quay lại chọn form" / "**Xuất Excel**". Chỉ khi bấm Xuất mới gọi endpoint tải file (blob, theo `attendance-export.api.ts`).
- Chặn bấm đúp, loading rõ, lỗi blob parse ra message BE.

### 3.4 Chart gốc sửa được — kỹ thuật & rủi ro
- `exceljs` không có API chart. Hướng: sau khi `exceljs` ghi xong buffer, dùng **`jszip`** (là dependency của exceljs, kiểm tra có sẵn trong `node_modules`) để **chèn OOXML**: `xl/charts/chartN.xml`, `xl/drawings/drawingN.xml` (+ `_rels`), thêm `<drawing r:id>` vào sheet XML, cập nhật `[Content_Types].xml`. Chart tham chiếu thẳng vùng ô của bảng dữ liệu trên cùng sheet ⇒ sửa số trong Excel thì chart đổi theo.
- Không dùng canvas native / dịch vụ ngoài (Vercel + ràng buộc không kết nối ngoài).
- **Phase spike bắt buộc (L1) trước khi làm tiếp**: tạo file mẫu 3 loại chart, kiểm tra (a) mở được và sửa được trong Excel, (b) render bằng LibreOffice trong sandbox (convert → PDF/PNG xem ảnh), (c) không báo "file bị hỏng". Nếu spike thất bại hoặc quá rủi ro → dừng và hỏi lại bạn (phương án dự phòng: ảnh PNG).
- Tách module `common/utils/xlsx-chart-injector.ts` + unit test cho từng loại chart; nạp lười như `exceljs-loader`.

### Phases
- [ ] **L0** `git pull`; xác nhận chữ ký `getStats/getRequests`; kiểm tra rủi ro scope `approve` (mục 3.2).
- [ ] **L1** **Spike chart gốc**: injector 3 loại chart + kiểm tra Excel/LibreOffice (cổng quyết định).
- [ ] **L2** `buildLeaveExportModel` (A, B, C, D) + unit test (kỳ rỗng, nhân viên 0 đơn, tỷ lệ `null`, cap dòng).
- [ ] **L3** Endpoint `preview` + `export` (form A–D, F không chart) + audit + DTO.
- [ ] **L4** FE Modal 2 bước (chọn form → Demo → Xuất) cho form A–D.
- [ ] **L5** Form E/F: thêm chart vào model, preview recharts, injector chèn chart vào file.
- [ ] **L6** Test + docs (`PERMISSIONS.md` §2.6, `guides-content/duyet-phep.md`, `WORKFLOW_LOG.md`).

### ✅ Checklist sau MỖI lần handle — Xuất Excel phép
1. **Khớp UI**: tổng đơn/duyệt/từ chối/chờ trong file = `LeaveStatsTab` cùng kỳ + bộ lọc; **Demo = file xuất** (cùng `ExportModel`).
2. Scope theo `approve`: Manager chỉ phòng ban mình, Employee không xuất được người khác; thử ≥ 3 role; người chỉ có `view` (không `approve`) bị 403.
3. Đơn **Đã huỷ** và đơn trong **Thùng rác** không tính; đơn bổ sung được phân biệt.
4. Route `export`/`export/preview` đứng trước `:id`; DTO khai đủ field (không 400 do `forbidNonWhitelisted`).
5. Kỳ rỗng → file vẫn mở được, có thông báo "Không có dữ liệu", chart không lỗi.
6. Ngày không lệch múi giờ (dùng `toYmd`); số là number.
7. Chống formula injection ở cột text; tên có dấu hiển thị đúng; tên file tải về đúng (RFC 5987).
8. **Chart**: mở bằng Excel được, **sửa số trong ô thì chart đổi**, không báo hỏng file; render LibreOffice OK; vùng tham chiếu đúng khi số hàng thay đổi (top N, kỳ dài).
9. Hiệu năng/payload: kỳ 1 năm toàn công ty trong giới hạn Vercel (~4.5MB); preview chỉ trả ≤ 20 dòng/bảng; cap form B và báo rõ khi bị cắt.
10. Không thêm permission/migration (dùng `approve`); FE ẩn nút khi thiếu quyền.
11. `tsc --noEmit`, `nest build`, `npx jest modules/leave-requests`, `npx vitest run` — dán kết quả thật; không `console.log`.
12. Audit `EXPORT_LEAVE_REQUESTS` ghi được; cập nhật docs + `WORKFLOW_LOG.md`.

---

## 4. Thứ tự & rủi ro
- Thứ tự: **Phần 1 (W0→W5)** rồi **Phần 2 (L0→L6)**. Có thể làm **L1 (spike chart)** sớm song song vì đây là rủi ro lớn nhất của Phần 2.
- Rủi ro chính: (1) chèn OOXML chart gây file lỗi trên Excel; (2) scope của `approve` khác `view`; (3) 3 chỉ số lệch với "Tổng nạp"/bảng khi lọc ngày/trạng thái; (4) xung đột merge ở `customers.controller.ts`, `PERMISSIONS.md`, `WORKFLOW_LOG.md` giữa các tài khoản → pull trước mỗi phase.
- Không làm: auto lead, kết nối bên ngoài; không tự chạy migration lên DB production — chỉ đưa file migration để bạn chạy và xác nhận.