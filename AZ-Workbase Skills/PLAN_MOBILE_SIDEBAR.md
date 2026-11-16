# PLAN: Cải tiến Mobile + Tuỳ chỉnh Sidebar (DnD)

> Đặt tại `AZ-Workbase Skills/PLAN_MOBILE_SIDEBAR.md`. Căn cứ: code commit `55677ef` (2026-11-12).
> Phạm vi: chỉ tính năng nội bộ, KHÔNG kết nối bên ngoài, KHÔNG auto lead.

## 1. Hiện trạng (đã đọc code thật)

| Hạng mục | Thực tế |
|---|---|
| Sidebar | `(dashboard)/layout.tsx`: AntD `Sider` cố định 220px, thu gọn 64px, **không có breakpoint/Drawer** -> trên mobile vẫn chiếm 64px+ ngang màn hình |
| Menu | AntD `Menu` dựng từ `getVisibleNavItems()` (`lib/nav-config.tsx`, ~35 mục, 1 danh sách phẳng, không nhóm) |
| Header | 1 hàng: logo trang + ô tìm + nút hướng dẫn + ngày + chuông + avatar/tên/role -> tràn ngang ở <768px |
| Content | `m-6` + padding 24px -> mất ~48px chiều ngang mỗi bên trên mobile |
| CSS mobile | Chỉ có `@media (max-width: 768px)` trong `globals.css` cho `.customer-table`/`.ant-card-body` |
| Trạng thái thu gọn | `localStorage['sidebar_collapsed']` (áp dụng cả mobile -> dễ sai) |
| DnD | `@dnd-kit/core` + `sortable` + `utilities` ĐÃ cài (đang dùng ở Kanban/Checklist) -> không thêm dependency |
| Lưu preference theo user | CHƯA có cột/endpoint nào. Có sẵn `GET /users/me` (đã cache bằng `fetchMeCached`) và `PATCH /users/me/*` (tự phục vụ, chỉ JwtAuthGuard) |
| Migration mới nhất | `1786394000000-AddFanpageLeadLinks` -> migration mới phải `> 1786394000000` (kiểm lại bằng `ls` trước khi tạo) |

## 2. Quyết định: lưu layout ở đâu?

**Chọn: DB theo từng user là nguồn chính + localStorage làm cache hiển thị tức thì.**

| Tiêu chí | localStorage | Profile (DB) | Hybrid (chọn) |
|---|---|---|---|
| Đồng bộ giữa PC/điện thoại/trình duyệt | Không | Có | Có |
| Mất khi xoá cache/đổi máy | Có | Không | Không |
| Nháy layout mặc định lúc tải | Không | Có (chờ API) | Không (đọc cache trước) |
| Chi phí BE | 0 | 1 cột + 1 endpoint | Như Profile |
| Rủi ro CPU Vercel (Plan CPU Round 2) | 0 | Thấp nếu **không thêm request** | Thấp |

Lý do chọn hybrid: hệ thống có nhiều tài khoản, người dùng đăng nhập nhiều thiết bị; chỉ localStorage thì layout "biến mất" khi đổi máy.

Ràng buộc để không tăng CPU:
- KHÔNG thêm endpoint GET mới: nhét `uiPreferences` vào response `GET /users/me` sẵn có (đã cache ~7 phút).
- Chỉ gọi `PATCH /users/me/ui-preferences` khi bấm **Lưu** (không auto-save mỗi lần kéo).
- Không polling.

## 3. Thiết kế dữ liệu & quy tắc áp dụng

**Cột mới** `users.ui_preferences` — `JSON NULL` (entity khai `type: 'json'` tường minh, `nullable: true`).

```json
{ "sidebar": { "order": ["customers", "chia-data", "..."], "hidden": ["nguon-media"], "v": 1 } }
```

- Chỉ lưu **key** của mục, KHÔNG lưu nhãn/path/permission -> đổi quyền hay đổi tên mục không làm hỏng layout.
- Áp dụng bằng hàm thuần `applySidebarLayout(visibleItems, layout)`:
  1. Lọc theo `getVisibleNavItems()` TRƯỚC (permission vẫn là luật cao nhất — layout không bao giờ làm hiện mục user không có quyền).
  2. Sắp theo `order`; key không còn tồn tại/không có quyền -> bỏ qua.
  3. Mục mới chưa có trong `order` -> nối vào cuối (không biến mất khi nhóm dev thêm trang).
  4. `hidden` chỉ ẩn khỏi Sidebar; mục vẫn vào được qua Trang chủ + Ctrl+K (tránh "mất menu rồi không biết làm sao").
- "Trang chủ" luôn ghim đầu, không kéo/ẩn được.
- Nút **Khôi phục mặc định** -> `ui_preferences.sidebar = null`.
- BE validate: mảng string, tối đa 100 phần tử, mỗi key ≤ 64 ký tự, `@IsOptional`, whitelist DTO. Không cần permission mới (dữ liệu cá nhân, giống `me/profile`).

## 4. Các giai đoạn (mỗi giai đoạn tự kiểm chứng được)

### GĐ M0 — Nền tảng mobile dùng chung
- Hook `useIsMobile()` (AntD `Grid.useBreakpoint`, mobile = `< lg`), dùng chung toàn FE.
- `export const viewport` ở `app/layout.tsx` (`width=device-width`, `viewportFit: 'cover'`) + safe-area cho thiết bị tai thỏ.
- Token khoảng cách: Content `m-2 p-3` mobile / `m-6 p-6` desktop.
- Quy ước tối thiểu: vùng bấm ≥ 40px, không gây cuộn ngang toàn trang.
- **Kiểm tra:** `tsc --noEmit`, vitest cho hook.

### GĐ S1 — Sidebar trên Mobile (làm trước, không đụng DnD)
- `< lg`: ẩn Sider cố định, thay bằng **Drawer** trái mở từ nút hamburger ở Header; chọn mục xong tự đóng.
- `>= lg`: giữ hành vi hiện tại (thu gọn/mở rộng).
- `sidebar_collapsed` chỉ áp dụng desktop (không để trạng thái desktop làm hỏng mobile).
- Header mobile gọn: ẩn ngày + ô tìm rút thành icon + ẩn tên/role chỉ giữ avatar; logo trang rút gọn.
- Footer rút gọn, Content dùng token M0.
- **Kiểm tra:** 360px / 390px / 768px / 1280px: mở-đóng Drawer, badge hiển thị, đổi trang, highlight đúng mục.

### GĐ S2 — Tuỳ chỉnh Sidebar (PC) — chỉ logic + UI, lưu localStorage
- Hàm thuần `applySidebarLayout` + `reorder` + test (mục mới, mục mất quyền, mục lạ, layout rỗng).
- Nút **Tuỳ chỉnh** (icon `SettingOutlined`) ở đầu Sider, chỉ hiện `>= lg`.
- Bấm vào -> Sidebar vào **chế độ sửa**: thay `Menu` bằng danh sách `@dnd-kit/sortable` (tay cầm kéo, nút ẩn/hiện mắt), có **Lưu / Huỷ / Khôi phục mặc định**. Dùng `PointerSensor` + `KeyboardSensor` (kéo bằng bàn phím để truy cập được).
- Mobile: không có nút Tuỳ chỉnh (đúng yêu cầu DnD chỉ PC) nhưng **vẫn hiển thị theo thứ tự đã lưu**.
- Tạm lưu vào `localStorage['az-sidebar-layout-v1:<userId>']` (**kèm userId** để máy dùng chung không lộ layout của người trước; xoá khi logout).
- **Kiểm tra:** kéo thả, Huỷ không lưu, F5 giữ nguyên, tài khoản khác role không bị lộ mục.

### GĐ S3 — Đồng bộ theo user (DB)
- Migration `AddUiPreferencesToUsers` (timestamp > mới nhất, `up()`/`down()` đối xứng, `IF NOT EXISTS`).
- Entity + DTO + `PATCH /users/me/ui-preferences`; trả `uiPreferences` trong `GET /users/me`.
- FE: Lưu -> PATCH + cập nhật localStorage; khi vào app lấy từ `/users/me` (cache) và ghi đè localStorage nếu khác. Lỗi mạng khi lưu -> giữ bản local, báo toast, thử lại lần Lưu sau.
- Test BE (service + DTO) và FE (merge cache vs server).
- **Việc người dùng làm:** backup DB -> `migration:run` -> xác nhận. (Không tự chạy lên production.)

### GĐ P — Rà từng trang (mobile)
Mỗi trang làm xong là dừng để bạn kiểm tra rồi mới sang trang tiếp. Checklist chung cho mỗi trang:
1. Không cuộn ngang toàn trang ở 360px.
2. Bảng: giữ `scroll.x` trong khung hoặc chuyển Card (theo mẫu `/customers` đã có).
3. Bộ lọc: gập được / Drawer trên mobile.
4. Modal -> full-width (hoặc Drawer đáy) trên mobile; nút hành động dính đáy.
5. Tabs cuộn ngang, nút ≥ 40px, chữ ≥ 13px.
6. Không đổi logic/permission — chỉ bố cục.

Spec layout chi tiết từng trang xem **mục 8**. Thứ tự đề xuất (theo mức dùng hằng ngày):

| Đợt | Trang |
|---|---|
| P1 | Trang chủ `/`, Khách hàng `/customers`, Chia Data |
| P2 | Công việc định kỳ, Hiệu suất công việc, Lịch sử công việc |
| P3 | Nghỉ phép, Duyệt phép, Thông báo (+ Gửi/Đã gửi), Profile |
| P4 | Quản lý UTM, Quản lý Fanpage, Nhóm liên kết, Nhóm tôi quản lý, Báo cáo doanh số |
| P5 | Nhóm Quản trị: Nhân viên, Phòng ban, Phân quyền, Vị trí, Audit, Bảo mật, Thùng rác... |
| P6 | Các trang CRUD danh mục nhỏ (Loại phép, Status khách, Nguồn media...) |

## 5. Rủi ro & lưu ý
- `selectedKey` trong `layout.tsx` đang là chuỗi `includes()` dài, dễ sai khi thêm route; chỉ chỉnh khi thêm nhóm mới, KHÔNG refactor lan man trong các GĐ trên.
- AntD `Menu` không hỗ trợ kéo thả -> vì vậy dùng danh sách sortable riêng ở chế độ sửa (không hack Menu).
- Header `PageGuideButton` / `CommandPaletteHost` / `NotificationBell` phải còn hoạt động trong Header gọn.
- Lưu ý diff nhỏ: sửa trực tiếp file có sẵn, chỉ tách component mới (`SidebarCustomizer`, `useSidebarLayout`, `lib/sidebar-layout.ts`).
- Cuối mỗi GĐ: `tsc --noEmit`, `npx vitest run`, `next build`, rồi mới ghi 1 entry vào `WORKFLOW_LOG.md`.

## 6. Chiến lược kiểm thử (3 tầng)

> ⚠️ `jsdom` KHÔNG tính layout/CSS thật (không có chiều rộng, không áp `@media`). Test tự động chỉ kiểm được **cấu trúc DOM theo viewport giả lập**; còn "có tràn ngang không, có bị che không" PHẢI kiểm tay. Không được báo "mobile ổn" chỉ vì vitest xanh.

| Tầng | Công cụ | Kiểm được | Không kiểm được |
|---|---|---|---|
| A. Spec tự động | `vitest` + `@testing-library/react` (đã có) | Drawer vs Sider, Card vs Table, nút hiện/ẩn theo viewport, thứ tự/ẩn mục, logic thuần, quyền | Tràn ngang, khoảng cách, chồng lấp, cảm giác chạm |
| B. Kiểm tay | Chrome DevTools device mode + máy thật (iOS Safari, Android Chrome) | Toàn bộ giao diện thật | Không lặp lại tự động được |
| C. (Tuỳ chọn) Visual regression | Playwright screenshot | So ảnh trước/sau | **Chưa có trong repo** -> thêm dev dependency, chỉ làm khi bạn đồng ý |

**Hạ tầng test cần thêm ở M0** (vì `vitest.setup.ts` hiện polyfill `matchMedia` luôn trả `matches: false`, nên `useBreakpoint()` coi mọi màn hình là "nhỏ nhất" -> không giả lập được desktop/mobile):
- `src/test-utils/viewport.ts`: `setViewport(width)` — mock `matchMedia` có đọc `min-width`/`max-width`, phát sự kiện `change`; `resetViewport()` trong `afterEach`.
- Hằng số dùng chung: `VIEWPORTS = { phoneSmall: 320, phone: 360, phoneLarge: 390, tablet: 768, laptop: 1280 }`.
- Quy ước đặt tên: `<Component>.mobile.test.tsx` cạnh component (vitest chỉ nhận `*.test.ts(x)`, nên KHÔNG dùng đuôi `.spec`).

## 7. Checklist kiểm tra chi tiết theo giai đoạn

### 7.1 M0 — Nền tảng
**Spec tự động**
- [ ] `useIsMobile`: 320/360/390/768 -> `true`; 992/1280 -> `false`; đổi viewport giữa chừng -> cập nhật (không cần reload).
- [ ] `useIsMobile` không gây lỗi hydration: lần render đầu server/client khớp (không nhấp nháy sai layout) — kiểm bằng render 2 lần.
- [ ] `setViewport` hoạt động với `Grid.useBreakpoint` của AntD (xs/sm/md/lg/xl đúng ngưỡng).

**Kiểm tay**
- [ ] `export const viewport` có mặt trong HTML (xem `<meta name="viewport">`); không bị zoom khi focus input iOS (input ≥ 16px).
- [ ] Thiết bị tai thỏ: nội dung không bị che bởi notch/thanh Home (safe-area).
- [ ] Đọc `node_modules/next/dist/docs/` về `viewport` trước khi viết (repo cảnh báo Next 16 khác bản cũ — theo `AGENTS.md`).

### 7.2 S1 — Sidebar mobile
**Spec tự động (`layout.mobile.test.tsx`)**
- [ ] `<lg`: KHÔNG render `Sider` cố định; có nút hamburger; bấm -> Drawer mở; chọn mục -> `router.push` đúng path + Drawer đóng.
- [ ] `>=lg`: render `Sider` như cũ; KHÔNG có hamburger; nút thu gọn vẫn hoạt động.
- [ ] Danh sách mục trong Drawer == danh sách mục trên Sider (cùng `getVisibleNavItems`, cùng thứ tự).
- [ ] Badge (`CountBadge`) hiển thị đúng trong Drawer cho các key: `invalidData`, `trash`, `pendingUsers`, `leaveApprovals`, `myPendingLeave`, `taskTodo`, `taskInProgress`, `fanpageToDo`, thông báo.
- [ ] Mục đang đứng được highlight đúng (`selectedKey`) ở cả 2 chế độ — test các route dễ nhầm: `/customers/reports/invalid-data`, `/thong-bao/gui`, `/thong-bao/da-gui`, `/nhom-toi-quan-ly`.
- [ ] `localStorage['sidebar_collapsed']`: chỉ ảnh hưởng desktop; mobile không đọc/ghi.
- [ ] Role không có quyền -> không thấy mục (employee không thấy Phân quyền...), cả trong Drawer.
- [ ] Chưa đăng nhập/chưa hydrate -> vẫn hiện màn "Đang đồng bộ..." (không vỡ).

**Kiểm tay (360 / 390 / 768 / 1280, dọc + ngang)**
- [ ] Không cuộn ngang toàn trang ở bất kỳ trang nào đang mở.
- [ ] Drawer: vuốt/bấm nền để đóng, nút đóng ≥ 40px, cuộn được khi 35 mục (không bị cắt dưới do thanh trình duyệt: dùng `dvh`).
- [ ] Header: chuông thông báo, tìm nhanh (Ctrl+K có mở được bằng icon), nút hướng dẫn, avatar/Đăng xuất đều chạm được; không chồng chữ.
- [ ] Mở Drawer rồi xoay màn hình -> không vỡ.
- [ ] Đổi trang bằng Drawer rồi bấm Back của trình duyệt -> không kẹt Drawer mở.

### 7.3 S2 — Tuỳ chỉnh Sidebar (PC, localStorage)
**Spec thuần `lib/sidebar-layout.test.ts`**
- [ ] `order` rỗng/`null`/`undefined` -> trả đúng thứ tự mặc định.
- [ ] `order` có key không tồn tại (mục đã bị xoá khỏi code) -> bỏ qua, không lỗi.
- [ ] `order` có key user KHÔNG còn quyền -> không hiện (permission thắng layout).
- [ ] Mục mới chưa có trong `order` -> nối cuối theo thứ tự mặc định.
- [ ] `order` trùng key -> chỉ giữ lần đầu.
- [ ] `hidden` chứa mục -> ẩn khỏi sidebar nhưng `getVisibleNavItems` / Trang chủ / Ctrl+K VẪN còn mục đó.
- [ ] `hidden` ẩn hết -> sidebar chỉ còn Trang chủ (không crash).
- [ ] `reorder(from, to)`: kéo lên đầu, xuống cuối, cùng vị trí (no-op), index sai (không crash).
- [ ] Layout JSON hỏng/đổi `v` -> rơi về mặc định, không throw.
- [ ] Hàm thuần, không mutate mảng đầu vào (`Object.freeze` input).

**Spec component (`SidebarCustomizer.test.tsx`)**
- [ ] Nút Tuỳ chỉnh chỉ có ở `>=lg`; KHÔNG có ở mobile.
- [ ] Bấm Tuỳ chỉnh -> vào chế độ sửa; Huỷ -> thoát, không đổi gì; Lưu -> ghi `localStorage` đúng key có `<userId>`.
- [ ] Nút Lưu bị khoá khi chưa có thay đổi; chặn bấm đúp khi đang lưu.
- [ ] Khôi phục mặc định -> xoá key, về thứ tự gốc.
- [ ] Kéo bằng bàn phím (Space -> mũi tên -> Space) đổi thứ tự đúng.
- [ ] Mục "Trang chủ" không kéo được, không ẩn được.
- [ ] Đổi user (logout -> login user khác) -> không dùng layout của user trước.
- [ ] Admin đổi quyền (`usePermissionChangeSignal`) khi đang ở chế độ sửa -> danh sách cập nhật, không crash.

**Kiểm tay (PC)**
- [ ] Kéo thả mượt với 35 mục; danh sách cuộn được trong khi kéo (`autoScroll`); không kéo nhầm khi chỉ click.
- [ ] Sidebar đang thu gọn 64px -> tự mở rộng khi vào chế độ sửa (hoặc ẩn nút) — không được sửa trong trạng thái chỉ có icon.
- [ ] Rời trang khi chưa Lưu -> có xác nhận (không mất thay đổi âm thầm).
- [ ] F5 giữ layout; mở tab mới giữ layout; mở ở trình duyệt khác (chưa có S3) thì mặc định — đúng dự kiến.
- [ ] Dark mode hệ thống không làm vỡ màu chế độ sửa (layout hiện hardcode nền trắng).

### 7.4 S3 — Đồng bộ DB
**BE (jest)**
- [ ] DTO: nhận `sidebar.order` (mảng string ≤ 100, mỗi key ≤ 64 ký tự, whitelist, `forbidNonWhitelisted`); từ chối: không phải mảng, phần tử không phải string, key quá dài, > 100 phần tử, field lạ.
- [ ] `PATCH /users/me/ui-preferences` chỉ sửa **chính mình** (lấy `userId` từ JWT, không nhận id từ body/param) — test không thể sửa user khác (IDOR).
- [ ] Gửi `sidebar: null` -> xoá layout (reset).
- [ ] `GET /users/me` trả `uiPreferences` (null khi chưa có); các field cũ không đổi (avatar, isRootAdmin...).
- [ ] Không cần permission mới; vẫn bắt JwtAuthGuard (chưa login -> 401).
- [ ] Không ghi `audit_logs` cho thao tác này (dữ liệu giao diện, tránh rác log) — chốt rõ, ghi vào `PERMISSIONS.md`.
- [ ] Cột `type: 'json'` khai tường minh (tránh `DataTypeNotSupportedError`); `down()` đối xứng; `IF NOT EXISTS`.

**FE (vitest)**
- [ ] Lưu: PATCH thành công -> cập nhật cache `['users','me']` + localStorage; PATCH lỗi -> giữ bản local, toast lỗi, cho thử lại.
- [ ] Khi vào app: server mới hơn local -> ghi đè local; server `null` + local có -> xử lý rõ ràng (đề xuất: server `null` thắng nếu user đã Reset ở máy khác).
- [ ] Không phát sinh request GET mới (đếm số request ở màn hình đầu tiên so với trước).

**Kiểm tay**
- [ ] 2 thiết bị cùng tài khoản: sửa ở máy A -> máy B thấy sau khi tải lại/hết cache `/users/me` (~7 phút) — chấp nhận, không cần realtime.
- [ ] Sửa đồng thời 2 máy -> bản lưu sau thắng (last-write-wins), không lỗi.
- [ ] Network tab: Lưu = đúng 1 PATCH; kéo thả không gọi API.
- [ ] Đã backup DB trước `migration:run`; chạy `migration:show` xác nhận; thử `migration:revert` trên DB staging.

### 7.5 Checklist chung mọi giai đoạn (trước khi báo "xong")
- [ ] `npx tsc --noEmit` sạch, `npx vitest run` toàn bộ xanh (dán số file/test thật), `next build` OK; BE: `nest build` + `npx jest`.
- [ ] Không `console.log` thừa; không `any`; label tiếng Việt.
- [ ] Dùng `App.useApp()` cho `message/modal` (không gọi static); `Space` dùng `orientation` nếu AntD cảnh báo `direction`.
- [ ] Không đổi logic phân quyền; `role === 'admin'` bypass vẫn nguyên ở 3 lớp.
- [ ] Sửa bằng diff trên file có sẵn; chỉ tạo file mới cho component/hook mới; giữ comment `[AGENT] OLD CODE` khi thay logic cũ.
- [ ] Thêm 1 entry vào `WORKFLOW_LOG.md` (chỉ append) + tick mục 12 của plan này.

## 8. Spec layout mobile từng trang

**Ngưỡng:** mobile `< 992px` (AntD `lg`); điện thoại nhỏ `< 576px`. **Mẫu dùng chung** (không tạo abstraction trước khi có ≥ 3 trang cần):
- Bảng: giữ `scroll.x` **trong khung** (không cuộn cả trang) hoặc Card nếu cột > 5 và hành động quan trọng (theo mẫu `/customers` đang có).
- Filter: 1 nút "Bộ lọc" mở Drawer đáy hoặc gập `Collapse`; nút Tìm/Xoá bộ lọc dính đáy.
- Modal -> `width: '100%'`, `style.top: 0`, nội dung cuộn, footer dính đáy; Form 1 cột (`Col xs={24}`).
- Tabs: `overflow-x` cuộn, không xuống dòng. Nút hành động chính ≥ 40px. DatePicker/Select popup không tràn khỏi màn hình.
- Mỗi trang: **1 file test** `*.mobile.test.tsx` (Tầng A) + **checklist tay** (Tầng B) ở bảng dưới.

**Checklist tay chung cho MỌI trang (360px / 390px / 768px):**
- [ ] Không cuộn ngang toàn trang · [ ] Không chữ bị cắt/đè nhau · [ ] Bấm được mọi nút (≥ 40px, không bị che bởi thanh dưới)
- [ ] Trạng thái loading/empty/lỗi 403/500 hiển thị đúng · [ ] Đúng cho từng role có quyền vào trang (admin/manager/assistant/employee)
- [ ] Desktop 1280px KHÔNG đổi so với trước (đối chiếu ảnh chụp trước khi sửa).

### Đợt P1
| Trang | Thành phần hiện có | Spec layout mobile | Test tự động | Kiểm tay riêng |
|---|---|---|---|---|
| `/` Trang chủ | 1 Card, lưới thẻ từ `NAV_ITEMS` | Lưới 1 cột `<576`, 2 cột `<992`; thẻ cao ≥ 56px; thứ tự thẻ = thứ tự mặc định (không theo layout tuỳ chỉnh — chốt) | Thẻ == mục sidebar; không thẻ cho mục thiếu quyền | Chạm cả thẻ để vào trang |
| `/customers` (1306 dòng) | 2 Table, Card view mobile đã có, `.mobile-toolbar`, `CustomerDetailDrawer` | Giữ Card view; filter gập; thẻ thống kê 2 cột; bulk bar dính đáy; phân trang `simple`; Drawer chi tiết full-width | Mobile render Card không Table; bulk bar hiện khi chọn; filter gập/mở | Hiệu ứng highlight từ thông báo (`notif-focus-flash`) trên Card; chọn nhiều + đổi trạng thái; tổng nạp khớp bảng |
| `/chia-data` (1572) | 2 Table, 1 Modal, Tabs | Tabs cuộn ngang; mỗi bảng -> Card + checkbox; thanh "Gán data" dính đáy; Modal gán full-screen | Tabs/Modal theo viewport; nút gán chỉ hiện khi có `customers.assign` | Chọn nhiều + gán; chỉ-Primary/Shared đúng nhãn "Sales phụ trách chính/được chia" |

### Đợt P2
| Trang | Thành phần | Spec layout mobile | Test tự động | Kiểm tay riêng |
|---|---|---|---|---|
| `/cong-viec-dinh-ky` (1932; 12 Form, 3 Modal, 2 Table, Kanban dnd-kit) | Bảng + Kanban + checklist | Kanban: cột cuộn ngang có snap hoặc chuyển danh sách theo trạng thái; `TouchSensor` có `delay`/`tolerance` để **không tranh cuộn**; Modal checklist full-screen; filter vào Drawer | Kanban dùng sensor touch ở mobile; Modal full-width | Kéo thẻ bằng cảm ứng không làm cuộn trang; tạo/sửa công việc; đánh dấu quá hạn |
| `/hieu-suat-cong-viec` (717; 4 Card, nhiều chart, 1 Table) | Thẻ thống kê + chart + Drawer | Chart `responsive`, chiều cao cố định ~220px; thẻ 1–2 cột; Drawer chi tiết full-width | Render không lỗi ở 360px (chart mock) | Chart không tràn, tooltip chạm được; bộ lọc khoảng ngày dùng được |
| `/lich-su-cong-viec` (532; 3 Card) | Danh sách nhật ký | Mỗi nhật ký 1 Card dọc, diff cuộn trong khung | Có render Card | Chuỗi dài không đẩy tràn |

### Đợt P3
| Trang | Thành phần | Spec layout mobile | Test tự động | Kiểm tay riêng |
|---|---|---|---|---|
| `/nghi-phep` (667; 7 Form, Modal) | Form gửi đơn + danh sách | Form 1 cột; RangePicker mở dạng 1 panel; Modal full-screen; đính kèm ảnh chọn từ máy | Form 1 cột ở mobile | Tải ảnh đính kèm từ điện thoại; Select loại phép |
| `/duyet-phep` (1526; 2 Table, 2 Modal, Tabs, chart) | Danh sách đơn + duyệt/từ chối + tuần | Bảng -> Card; nút Duyệt/Từ chối ≥ 44px, cách nhau đủ để không bấm nhầm; Modal lý do full-screen; Tabs cuộn | Có nút khi có `leave_requests.approve`; không có -> không hiện | Bấm nhầm Duyệt/Từ chối; badge số đơn chờ khớp sidebar |
| `/thong-bao` (145) | Hộp thư | Danh sách 1 cột, chưa đọc nổi bật; chạm mở `NotificationDetailModal` full-screen | Render list + mở modal | Đánh dấu đã đọc; badge giảm |
| `/thong-bao/gui` (111) · `/thong-bao/da-gui` (577) | Form soạn · 2 Table + Drawer + Tabs | Form 1 cột; chọn người nhận (Select multiple) không tràn; bảng "đã gửi" -> Card; Drawer tiến độ đọc full-width | Form/Card theo viewport | Chọn phòng ban/nhiều người; tiến độ đọc |
| `/profile` (852; 10 Form, Drawer, Table, Avatar) | Hồ sơ + Fanpage/Group phụ trách | Form 1 cột; `AvatarUpload` chọn/chụp ảnh trên điện thoại; bảng -> Card/cuộn khung | Form 1 cột | Đổi avatar, email, mật khẩu trên mobile |

### Đợt P4
| Trang | Thành phần | Spec layout mobile | Test tự động | Kiểm tay riêng |
|---|---|---|---|---|
| `/quan-ly-utm` (702; Tabs, Table, chart) | 3 tab (Của tôi/Tất cả/Đã khoá) + Chất lượng | Tabs cuộn ngang; bảng cuộn trong khung, cột đầu sticky; toggle "Ẩn UTM đã khoá" luôn thấy; chart đồng bộ Date filter | Tab/toggle hiện đúng; filter đồng bộ | Mở khách theo UTM (Drawer/Modal) |
| `/fanpage` (548; Tabs, Table) | Tab Hôm nay/Page/Bài đăng/Thống kê + Color Tag filter | Color Tag filter gập vào Drawer; Tab cuộn; bảng -> Card; badge "cần đăng hôm nay" khớp sidebar | Tabs + filter | Nhiều người phụ trách hiển thị gọn; xuất Excel trên mobile |
| `/nhom-lien-ket` (676; 2 Table, 2 Modal, 9 Form) | Category + Group | Bảng -> Card; Modal full-screen; form 1 cột | Modal width | Quản lý chính/phụ |
| `/nhom-toi-quan-ly` (265; Table) | Danh sách nhóm | Card 1 cột | Render Card | — |
| `/reports` (140; Tabs, 5 chart) | Báo cáo doanh số | Tab cuộn; chart 1 cột, cao ~240px | Render không lỗi | Chart cá nhân/phòng ban/tổng đúng số |

### Đợt P5 (quản trị — ưu tiên thấp hơn, thường dùng PC)
| Trang | Spec layout mobile | Ghi chú rủi ro |
|---|---|---|
| `/users` (1084; 15 Form, Tabs) | Bảng -> Card; Modal full-screen; Tabs cuộn | Duyệt/từ chối đăng ký, reset mật khẩu: nút xa nhau |
| `/phong-ban`, `/vi-tri` | Bảng -> Card; Drawer/Modal full-width | Gán Manager theo phòng ban |
| `/phan-quyen` (721) | **Ma trận quyền rộng nhất hệ thống**: cuộn ngang trong khung + cột tên quyền sticky; hiện cảnh báo "Nên dùng máy tính để sửa" trên mobile | Tuyệt đối không để lưu nhầm khi cuộn; thao tác nguy hiểm cần xác nhận |
| `/audit-logs` (981; Drawer, 6 Card) | Filter Drawer; mỗi log 1 Card; diff cuộn trong khung | `LazyAuditDiff` không tràn |
| `/security-activity`, `/system-health` | Thẻ 1 cột; bảng cuộn khung | `system-health` chỉ Root Admin |
| `/storage-img`, `/trash-can`, `/attendance-device`, `/customers/reports/invalid-data` | Tabs cuộn; bảng -> Card/cuộn khung; nút Khôi phục/Xoá vĩnh viễn cách xa nhau + xác nhận | Hành động phá huỷ trên mobile |
| `/huong-dan/[[...slug]]` (177) | Nội dung markdown: ảnh `max-width:100%`, bảng/code cuộn trong khung; mục lục gập | Bài dài |
| `(auth)` `/login`, `/change-password-required` | Form giữa màn hình, nút ≥ 44px, không zoom iOS | Kiểm cả khi bàn phím ảo bật |

### Đợt P6 (CRUD danh mục nhỏ — cùng 1 mẫu)
Trang: `nguon-media`, `quan-ly-loai-phep`, `quan-ly-status-khach`, `quan-ly-trang-thai-cong-viec`, `quan-ly-phu-trach`. Cấu trúc giống nhau (1 Table + 2 Modal + Form): **làm xong 1 trang mẫu, bạn duyệt, rồi nhân bản** cho 4 trang còn lại. Spec: bảng cuộn trong khung hoặc Card; Modal full-screen; ColorPicker (`ColorPickerField`) chạm được; xoá có xác nhận.

## 9. Definition of Done cho mỗi trang/giai đoạn
1. Spec tự động (`*.mobile.test.tsx`) + test cũ của trang vẫn xanh.
2. Checklist tay chung + riêng đã tick ở 360/390/768/1280.
3. Desktop 1280px không đổi hành vi/giao diện so với trước.
4. Không thêm request/poll mới (so Network tab).
5. Bạn xác nhận xong mới sang trang kế; entry `WORKFLOW_LOG.md` + tick tiến độ.

## 10. Danh sách hồi quy (chạy lại sau mỗi đợt)
- Đăng nhập -> hết phiên -> refresh token -> vào lại không bị kẹt Drawer/Sidebar.
- Đổi quyền ở Phân quyền -> menu/Drawer tự cập nhật (không cần F5).
- Badge sidebar khớp số liệu trang đích (`invalidData`, `trash`, `pendingUsers`, `leaveApprovals`, `taskTodo`, `fanpageToDo`, thông báo chưa đọc).
- Ctrl+K (CommandPalette) vẫn liệt kê đúng mục theo quyền, **không bị ảnh hưởng bởi layout tuỳ chỉnh/ẩn mục**.
- Nút hướng dẫn trang (`PageGuideButton`) theo `selectedKey` vẫn đúng ở mọi trang.
- Thông báo -> bấm vào -> mở đúng trang + highlight mục tiêu (Table desktop / Card mobile).

## 11. Rollback
- FE: mỗi GĐ là 1 commit/PR riêng (không gộp), commit message KHÔNG kèm `[deploy]` cho tới khi kiểm tay xong (Vercel đang bỏ qua build nếu không có `[deploy]`).
- S3: migration có `down()`; lỡ lỗi -> `migration:revert`; FE đọc `uiPreferences` kiểu "nếu có thì dùng, không có thì mặc định" nên BE chưa deploy vẫn không vỡ FE.
- Layout hỏng của 1 user: nút **Khôi phục mặc định** + (nếu cần) Admin xoá cột `ui_preferences` của user đó bằng SQL data (UPDATE, không đổi cấu trúc bảng).

## 12. Tiến độ
- [ ] M0 Nền tảng
- [ ] S1 Sidebar mobile
- [ ] S2 Tuỳ chỉnh + DnD (localStorage)
- [ ] S3 Đồng bộ DB theo user
- [ ] P1 · [ ] P2 · [ ] P3 · [ ] P4 · [ ] P5 · [ ] P6
