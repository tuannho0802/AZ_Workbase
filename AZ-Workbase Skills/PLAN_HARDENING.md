# PLAN — Củng cố nền tảng AZ_Workbase (bảo mật, phụ thuộc, giám sát, trải nghiệm)

> Đặt tại `AZ-Workbase Skills/PLAN_HARDENING.md`. Làm **từng phase một**, xong phase nào tick phase đó và ghi 1 dòng vào `WORKFLOW_LOG.md`.
> Cơ sở: rà soát repo `origin/main` HEAD `7a6a5fe` (2026-09-30). **P1–P6 không cần migration DB. P7 (Hướng dẫn động) cần migration.**
> Bản sửa: chốt các quyết định ở mục 8, bỏ "Có gì mới", nâng "Hướng dẫn sử dụng" và "Ctrl+K" thành phase chính thức.

## 0. Phạm vi

**Đã có, không làm:**
- Sao lưu DB: `.github/workflows/db-backup.yml` (GitHub Action -> Google Drive).
- Health check: đã có API keep-alive.
- Cron hiện tại: giữ nguyên, không đụng.
- Nghiệp vụ Task / Customer / UTM / Group / Chấm công / Nghỉ phép: ngoài phạm vi.

**Đã bỏ khỏi plan:** trang "Có gì mới".

**Trong phạm vi:** P1–P8.

## 1. Kết quả xác minh (căn cứ của plan)

| # | Phát hiện | Mức | Bằng chứng |
|---|---|---|---|
| 1 | BE có 16 lỗ hổng prod (11 high). 6 gói trực tiếp sửa được trong khoảng semver (`fixAvailable: true`): `@nestjs/core`, `@nestjs/platform-express`/`multer`, `@nestjs/config`, `@nestjs/swagger`, `mysql2`, `typeorm` | Cao | `npm audit --omit=dev` |
| 2 | `xlsx` 0.18.5 (prototype pollution), **không có bản vá trên npm**. BE **đọc file người dùng upload** (`customers.import.service.ts`: `XLSX.read`, `XLSX.utils`). FE chỉ **ghi** file mẫu (`lib/utils/excel-template.ts`) | Cao (BE) / Thấp (FE) | grep |
| 3 | `exceljs` 4.4.0 có lỗi moderate (`uuid`); bản sửa do npm gợi ý là 3.4.0 (hạ bản chính) -> **không áp dụng** | Thấp | `npm audit` |
| 4 | Không có `helmet` ở BE; `next.config` FE không đặt `headers()`. Token nằm trong storage trình duyệt nên CSP có giá trị | Trung bình | `main.ts`, `next.config.*` |
| 5 | Swagger `/api/docs` mở, không thấy điều kiện môi trường. **Đang dùng trên production có chủ đích** (`swagger-auth.js`, SKILL_NESTJS_BACKEND §14.4) -> không tắt, chỉ bảo vệ | Trung bình | `main.ts` L159 |
| 6 | Có `app/error.tsx`, `app/global-error.tsx`; không có `(dashboard)/error.tsx`; không thấy công cụ gom lỗi | Trung bình | ls, grep |
| 7 | Workflow duy nhất là `db-backup.yml` -> **chưa có CI** chạy tsc/test/build | Trung bình | `.github/workflows` |
| 8 | TypeORM SQLi ở `orderBy` của Update/SoftDelete builder: không thấy dùng `orderBy` trong các builder đó -> ít khả năng bị ảnh hưởng thực tế, vẫn nâng theo P1 | Thấp | grep |
| 9 | Upload ảnh (avatar/đính kèm) đi qua presigned URL thẳng lên B2, chỉ allowlist `content-type` do client khai; import Excel có kiểm tra mimetype/đuôi file | Ghi nhận | `uploads`, `presign-*.dto.ts` |

## 2. Quy trình chung cho mọi phase

1. Mỗi phase = 1 nhánh/commit riêng, **không** kèm `[deploy]` cho tới khi test xong.
2. Trước khi coi là xong, chạy thật và ghi kết quả: BE `npx tsc --noEmit`, `npx nest build`, `npx jest`; FE `npx tsc --noEmit`, `npx vitest run`, `next build`.
3. Chạy `npm install`/`npm audit fix` **trên máy dev (Windows)**, không chạy trên Linux/CI rồi commit lockfile (tránh nhiễu diff gói optional `fsevents`, `@unrs/resolver-binding-*`).
4. Không sửa migration cũ. Phase nào cần migration (P7) thì timestamp phải lớn hơn timestamp lớn nhất đang có (`ls` thư mục migrations sau khi pull), viết `up()`/`down()` đối xứng, để người dùng tự chạy.
5. Xong phase -> tick ô ở mục 9 và thêm 1 dòng vào `WORKFLOW_LOG.md`.

---

## P1 — Nâng gói BE có lỗ hổng (semver-safe)

**Mục tiêu:** đóng các lỗ hổng high mà không đổi API.
**Việc:**
- [ ] Lần lượt nâng: `@nestjs/core` + `@nestjs/platform-express` (+ `multer`) -> `@nestjs/config` -> `@nestjs/swagger` -> `typeorm` -> `mysql2`. Mỗi gói xong chạy tsc + jest rồi mới sang gói kế.
- [ ] Sau cùng chạy lại `npm audit --omit=dev` (mong đợi còn `xlsx`, `exceljs`).
- [ ] **TLS tới Aiven:** Aiven MySQL bắt buộc TLS. Kiểm tra `database.config` đang bật `ssl` kèm CA của Aiven (`rejectUnauthorized: true`, CA lấy từ biến môi trường, không commit). Nếu đang để `rejectUnauthorized: false` thì sửa lại sau khi nâng `mysql2`.
- [ ] Không dùng `npm audit fix --force`.

**Kiểm tra tay sau khi nâng:** đăng nhập/refresh token, upload file import khách, Swagger `/api/docs` mở được và `swagger-auth.js` còn chạy, một luồng ghi có transaction (tạo user hoặc gán khách).
**Rủi ro:** thấp–trung bình. **Rollback:** revert commit lockfile.
**Xong khi:** tsc/build/jest xanh, audit không còn high ở các gói trực tiếp trừ `xlsx`.

## P2 — Thay `xlsx` (BE trước, FE sau)

**Mục tiêu:** bỏ phụ thuộc không còn được vá khỏi đường **đọc** file không tin cậy.

**BE (`customers.import.service.ts`):**
- [ ] Viết lại phần đọc bằng `exceljs` (đã có sẵn). Giữ nguyên hợp đồng đầu ra (cùng cấu trúc dòng, cùng thông báo lỗi).
- [ ] **Hỗ trợ `.xlsx` và `.csv`** (exceljs đọc CSV qua `workbook.csv.read`). CSV: xử lý UTF-8 có/không BOM để không lỗi tiếng Việt, tự nhận dấu phân cách `,` / `;`.
- [ ] **`.xls` cũ: không hỗ trợ.** Hiện chưa ai dùng; nếu người dùng chọn `.xls` thì trả thông báo rõ ràng ("Vui lòng lưu lại dưới dạng .xlsx hoặc .csv"). Cập nhật allowlist mimetype/đuôi file cho khớp.
- [ ] Giới hạn kích thước file và số dòng tối đa khi đọc (chống file phình to gây tốn RAM).
- [ ] Cập nhật `customers.import.service.spec.ts` (đang tạo file test bằng `xlsx`) sang `exceljs`; thêm case CSV.
- [ ] Đối chiếu với 1–2 file mẫu thật: ô ngày, số điện thoại bắt đầu bằng `0` (không mất số 0), ô trống, dòng tiêu đề.

**FE (`lib/utils/excel-template.ts`, chỉ ghi file mẫu):**
- [ ] **Chọn: file mẫu tĩnh** `public/templates/*.xlsx`, sinh 1 lần bằng script dùng `exceljs` (devDependency), FE chỉ trỏ link tải. Không thêm gì vào bundle, không còn thư viện chạy ở trình duyệt.
- [ ] Nếu file mẫu **phụ thuộc dữ liệu động** (ví dụ dropdown phòng ban lấy từ API) thì dùng `exceljs` với `dynamic import` (chỉ tải khi bấm nút), không import tĩnh.
- [ ] Bỏ SheetJS bản CDN (khó kiểm soát phiên bản, CSP phải mở thêm) và CSV làm file mẫu (mất định dạng cột/dropdown).

**Gỡ `xlsx`** khỏi `package.json` của BE và FE khi không còn import nào.
**Xong khi:** `grep -r "from 'xlsx'"` không còn kết quả, test import pass, import thử file `.xlsx` và `.csv` thật cho kết quả giống bản cũ.

## P3 — Header bảo mật

**Mục tiêu:** giảm thiệt hại XSS/clickjacking, không làm hỏng app.
**BE:**
- [ ] Thêm `helmet` trong `main.ts`. Swagger tải script từ `cdnjs.cloudflare.com`: tắt/nới CSP của helmet riêng cho `/api/docs` để không hỏng Swagger.
- [ ] Kiểm tra `crossOriginResourcePolicy` không chặn FE gọi API/ảnh.

**FE (`next.config`):**
- [ ] Thêm `headers()`: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `Strict-Transport-Security`.
- [ ] CSP: **Report-Only trước** (1–2 tuần), rồi mới enforce. Cần cho phép: `style-src 'unsafe-inline'` (antd CSS-in-JS), `img-src` domain B2/CDN ảnh, `connect-src` domain API **và domain Sentry (P5)**, font nếu dùng.

**Rủi ro:** CSP dễ chặn nhầm. **Rollback:** xoá cấu hình `headers()`.
**Xong khi:** mọi trang chính mở bình thường, console không còn vi phạm CSP, Swagger vẫn dùng được.

## P4 — Bảo vệ Swagger bằng đăng nhập (không tắt)

**Mục tiêu:** `/api/docs` chỉ vào được sau khi đăng nhập; vẫn dùng được trên production.
**Cách chọn: Basic auth kiểm tra bằng tài khoản thật của hệ thống, chỉ cho `role = admin`.**
Lý do: trình duyệt tự hiện hộp thoại đăng nhập khi mở trang (không cần code giao diện), dùng lại email/mật khẩu sẵn có (không thêm secret mới để quản lý), và chặn được cả tab lẫn `/api/docs-json`. JWT Bearer không hợp vì điều hướng trang không gửi được header `Authorization`.
**Việc:**
- [ ] Middleware chỉ áp cho `/api/docs*` (kể cả `-json`, `-yaml`, `/swagger-auth.js` giữ công khai nếu chỉ chứa mã đọc token): đọc header Basic, kiểm tra email + mật khẩu bằng logic bcrypt của `AuthService`, yêu cầu user `is_active` và `role === 'admin'` (role cố định, đúng quy ước RBAC của dự án). Sai -> `401` kèm `WWW-Authenticate: Basic`.
- [ ] Giới hạn số lần thử sai (rate limit riêng cho đường dẫn này). Không log mật khẩu; log thất bại bằng `Logger`, không `console.log`.
- [ ] Đảm bảo `swagger-auth.js` vẫn hoạt động sau khi đổi.
- [ ] Ghi chú vào README backend. Không cần biến môi trường mới; (tuỳ chọn) `SWAGGER_ENABLED=false` để tắt hoàn toàn nếu sau này muốn.

**Xong khi:** mở `/api/docs` không đăng nhập bị hỏi mật khẩu; tài khoản admin vào được; tài khoản không phải admin và sai mật khẩu bị từ chối.

## P5 — Gom lỗi (Sentry) + error boundary theo vùng

**Mục tiêu:** biết lỗi thật trước khi người dùng báo; lỗi một trang không đẩy cả app ra màn hình lỗi.
**Cách chọn: Sentry** (SDK chính thức cho cả Next.js và NestJS, có source map, gắn release theo commit, gói miễn phí đủ cho quy mô hiện tại, có sẵn cơ chế lọc dữ liệu). Không chọn công cụ tự host vì thêm việc vận hành.
**Việc:**
- [ ] Tạo `src/app/(dashboard)/error.tsx`: lỗi chỉ thay vùng nội dung, giữ sidebar/header.
- [ ] Cài Sentry cho FE (`@sentry/nextjs`) và BE (`@sentry/nestjs`). BE gắn vào `AllExceptionsFilter`: chỉ gửi lỗi 5xx, **không** gửi 4xx (401/403/validation) để khỏi nhiễu.
- [ ] **Bắt buộc scrub PII** (`sendDefaultPii: false` + `beforeSend`): token, header `Authorization`/`Cookie`, body request, số điện thoại/email/tên khách, nội dung ghi chú. Hệ thống chứa PII khách hàng nên không được đẩy nguyên payload lên dịch vụ ngoài. Tắt Session Replay (hoặc mask toàn bộ).
- [ ] Đặt `release` theo commit SHA; tắt trên môi trường dev.
- [ ] Thêm domain Sentry vào `connect-src` của CSP (P3).

**Xong khi:** ném thử 1 lỗi ở FE và 1 lỗi ở BE thấy trên dashboard Sentry, payload không chứa PII.

## P6 — CI kiểm tra tự động khi push/PR

**Mục tiêu:** phát hiện lỗi build/test trước khi deploy.
**Việc:**
- [ ] `.github/workflows/ci.yml`, chạy khi PR và push `main`: BE `npm ci` -> `tsc --noEmit` -> `nest build` -> `jest`; FE `npm ci` -> `tsc --noEmit` -> `vitest run` -> `next build`.
- [ ] Cache `node_modules` theo lockfile. Chạy BE và FE song song.
- [ ] Không đụng luồng deploy Vercel/`[deploy]` hiện có.
- [ ] (Tuỳ chọn) `npm audit --omit=dev --audit-level=high` ở chế độ chỉ cảnh báo, không chặn.

**Xong khi:** một PR thử có check xanh; cố ý làm hỏng type thì check đỏ.

## P7 — Hướng dẫn sử dụng động (CRUD, phân quyền, mặc định chỉ Admin)

**Mục tiêu:** trang hướng dẫn mà người có quyền tự soạn/sửa/xoá được, mỗi vai trò chỉ thấy phần dành cho mình. **Phase này cần migration.**

**Dữ liệu (migration mới, timestamp > mọi migration hiện có):**
- [ ] Bảng `guides`: `id`, `title`, `slug` (unique), `content` (TEXT, Markdown), `sort_order`, `is_published`, `created_by`, `updated_by`, `created_at`, `updated_at`, `deleted_at` (xoá mềm, đúng quy ước dự án).
- [ ] Bảng `guide_roles` (`guide_id`, `role_id`): guide hiển thị cho những role nào. Không có dòng nào = mọi role đăng nhập đều thấy. Dùng `roles` động của hệ thống, không hardcode tên role.
- [ ] Seed permission mới trong cùng migration: `guides.manage` (tạo/sửa/xoá/xuất bản, **gán mặc định chỉ role `admin`**). Xem guide **không cần permission riêng**: ai đăng nhập cũng xem được guide đã xuất bản và đúng role của mình. Người dùng khác được cấp `guides.manage` qua ma trận quyền sẵn có (Toàn cục hoặc override phòng ban).
- [ ] Cột `string | null` trong entity khai `type: 'varchar'` tường minh.

**Backend (`modules/guides/`):**
- [ ] `GET /guides` (danh sách theo role người gọi, chỉ bản đã xuất bản), `GET /guides/:slug`, và nhóm quản trị `POST/PATCH/DELETE /guides`, `GET /guides/manage/all` dùng `@RequirePermission('guides.manage')`. Admin cố định vẫn bypass ở `PermissionGuard`, `RolesService.getMyPermissions()` như quy ước.
- [ ] DTO có validation; ghi `AuditService.logAction` cho create/update/delete; dùng `Logger`.
- [ ] Kiểm tra quyền xem ở BE (không chỉ ẩn ở FE): user không thuộc role được gán thì `404/403`.

**Frontend:**
- [ ] Trang `/huong-dan`: sidebar mục lục + vùng nội dung. Mục menu hiển thị cho mọi role đăng nhập.
- [ ] Nút Tạo/Sửa/Xoá/Xuất bản chỉ hiện khi `can('guides.manage')` (hook `useMyPermissions`), không hardcode `role === 'admin'`.
- [ ] Trình soạn: Markdown có xem trước, chọn role được xem, thứ tự sắp xếp, bật/tắt xuất bản.
- [ ] **Render Markdown an toàn:** dùng `react-markdown` **không bật HTML thô** (hoặc thêm sanitize), chặn `javascript:` trong link. Đây là nội dung do người dùng nhập nên là nguồn XSS, đặc biệt khi token nằm trong storage.
- [ ] Hình ảnh trong guide: giai đoạn đầu chỉ cho link ảnh/đính kèm bằng luồng presign B2 sẵn có; không tự viết luồng upload mới.
- [ ] Cập nhật tài liệu: thêm `guides.manage` vào `PERMISSIONS.md`.

**Xong khi:** admin tạo/sửa/xoá được; user thường chỉ thấy guide đúng role và không thấy nút quản trị; user được cấp `guides.manage` thao tác được; gọi API trực tiếp bằng token user thường vào endpoint quản trị nhận `403`; test BE cho phân quyền pass.

## P8 — Tìm kiếm nhanh Ctrl+K (chuyển trang theo quyền)

**Mục tiêu:** command palette mở bằng `Ctrl+K` / `Cmd+K`, chỉ liệt kê trang người dùng được phép vào.
**Việc:**
- [ ] Dùng **một nguồn cấu hình menu chung** cho sidebar và Ctrl+K (route, nhãn, permission key). Nếu sidebar hiện đang khai báo riêng thì tách ra dùng chung, tránh hai nơi lệch quyền.
- [ ] Lọc bằng `can('permission.key')` giống sidebar, kể cả các mục ẩn theo `ui-visibility`. Không hiện mục người dùng không có quyền.
- [ ] Tìm không dấu tiếng Việt (bỏ dấu khi so khớp), điều hướng bằng phím mũi tên + Enter, `Esc` để đóng.
- [ ] Giai đoạn 2 (tuỳ chọn, sau P7): tìm cả tiêu đề hướng dẫn mà user được xem.
- [ ] Dùng component antd (Modal + Input + List) hoặc thư viện nhỏ; không thêm thư viện nặng. Có `dynamic import`.

**Xong khi:** Ctrl+K mở được trên mọi trang dashboard, mỗi role chỉ thấy đúng các trang trong sidebar của mình, không xung đột phím tắt với ô nhập liệu.

---

## 8. Quyết định đã chốt

| # | Câu hỏi | Quyết định |
|---|---|---|
| 1 | P2 FE: file mẫu Excel | File mẫu tĩnh sinh bằng `exceljs` (script); nếu cần dữ liệu động thì `exceljs` + `dynamic import` |
| 2 | P2 BE: file `.xls` | Chưa ai dùng; hỗ trợ `.xlsx` + `.csv`, từ chối `.xls` bằng thông báo rõ |
| 3 | P4: bảo vệ Swagger | Basic auth kiểm tra bằng tài khoản thật, chỉ `admin` |
| 4 | P5: công cụ gom lỗi | Sentry, bắt buộc scrub PII |
| 5 | P1: TLS DB | Aiven, bắt buộc TLS -> kiểm tra `ssl` + CA trong `database.config` |
| 6 | Trang "Có gì mới" | Bỏ |
| 7 | Hướng dẫn sử dụng | Làm (P7), động, CRUD, mặc định chỉ Admin quản lý |
| 8 | Ctrl+K | Làm (P8) |

## 9. Theo dõi tiến độ

| Phase | Nội dung | Trạng thái | Ngày xong | Ghi chú |
|---|---|---|---|---|
| P1 | Nâng gói BE có lỗ hổng + TLS Aiven | [x] | 2026-10-01 | Audit prod: 16 -> 5 (còn xlsx high -> P2; exceljs/uuid -> không áp dụng; @nestjs/swagger/js-yaml moderate -> chờ swagger 12). TLS: bỏ fallback `rejectUnauthorized:false` |
| P2 | Thay `xlsx` (BE -> FE), hỗ trợ CSV | [x] | 2026-10-01 | BE: exceljs (.xlsx) + papaparse (.csv); FE: file mẫu tĩnh `public/templates/` sinh bằng `backend/scripts/generate-import-templates.ts`. Đã gỡ `xlsx` khỏi cả 2 package.json; audit prod BE: 0 high |
| P3 | Header bảo mật (BE + FE) | [x] | 2026-10-01 | BE: `helmet` (CSP chặt cho API, nới riêng cho Swagger + landing, CORP cross-origin). FE: `headers()` + CSP **Report-Only** (bật enforce bằng env `CSP_ENFORCE=true`). Chưa xem console trình duyệt thật |
| P4 | Bảo vệ Swagger (Basic auth, admin) | [x] | 2026-10-01 | Middleware Basic auth + `AuthService.verifySwaggerAdmin()` (chỉ role admin), rate limit 5 lần sai/15 phút/IP (RAM từng instance), `SWAGGER_ENABLED=false` để tắt hẳn. Chưa thử trên Vercel thật |
| P5 | Sentry + `(dashboard)/error.tsx` | [ ] | | |
| P6 | CI tự động | [ ] | | |
| P7 | Hướng dẫn sử dụng động (có migration) | [ ] | | |
| P8 | Ctrl+K theo quyền | [ ] | | |

**Thứ tự đề xuất:** P1 -> P2 (BE) -> P6 -> P3 -> P4 -> P5 -> P2 (FE) -> P7 -> P8.
Lý do đưa P6 lên sớm: có CI trước khi làm các phase thay đổi lớn giúp bắt lỗi sớm. P8 sau P7 để có thể tìm luôn hướng dẫn.
