# PLAN: Tối ưu Fluid Active CPU — Đợt 2 (dựa trên log đo thật)

> **Nguồn số liệu:** `az-workbase-backend-log-export-2026-10-06T07-17-35.csv` (Vercel Logs, `CPU_TIMING=true`),
> 259 request trong 28 phút (06:49–07:17 UTC), CPU cộng dồn ≈ 14,98 s, xếp hạng bằng
> `backend/scripts/cpu-timing-report.mjs`.
> **Mẫu nhỏ (chắc 1–3 người dùng)** → thứ hạng mang tính tương đối. Mỗi mục dưới đây đều có bước
> **đo lại** trước/sau; không tin con số "ước tính hiệu quả" cho tới khi đo.
>
> **Trạng thái code khi lập plan:** repo đã gồm idle-aware polling (`2febea0`), preflight sớm + cache URL
> avatar (`b305b50`), tín hiệu quyền `permSig` (`73f5560`). Plan này là phần CÒN LẠI.
>
> **Quy tắc chung cho MỌI mục (theo `Repository Context & Rules` + custom instructions):**
> 1. `git pull` trước khi làm; đọc file thật, không tin báo cáo phiên khác.
> 2. Sửa theo diff, giữ code cũ bằng comment `// [AGENT] OLD CODE`.
> 3. Chạy thật: BE `npx tsc --noEmit` + `npx nest build` + `npx jest`; FE `npx tsc --noEmit` + `npx vitest run`
>    (bỏ qua 4 lỗi `logo.png` có sẵn). Dán kết quả thật, không mô tả suông.
> 4. Migration (nếu có): timestamp **lớn hơn** số lớn nhất đang có (`ls backend/src/database/migrations`),
>    có `up()`/`down()`, không sửa migration cũ, không tự chạy lên production.
> 5. Cuối mỗi mục: thêm 1 entry vào `WORKFLOW_LOG.md` (chỉ append).
> 6. **Mỗi mục = 1 commit riêng** để rollback độc lập.

---

## 0. Tổng quan thứ tự & phụ thuộc

| Thứ tự | Mục | Chiếm CPU (log) | Rủi ro | Cần migration | Phụ thuộc |
|---|---|---|---|---|---|
| 0 | Chuẩn bị đo & baseline | — | Không | Không | — |
| 1 | Kiểm tra `JWT_EXPIRES_IN` (401 dày) | 3,2% (401) + góp vào #2 | Rất thấp | Không | — |
| 2 | `POST /auth/refresh` + lỗi bcrypt cắt 72 byte | 12,4% | **Trung bình** (đụng đăng nhập) | Không (2C mới cần) | 1 |
| 3 | `GET /periodic-tasks` | 19,1% | Thấp–TB | Có thể (index) | 0 |
| 4 | `GET /users/me` (3 nơi gọi) | 7,1% | Thấp | Không | — |
| 5 | `sidebar/badges` + `notifications/poll` | 6,7% + 6,7% | Thấp | Không | 0 |
| 6 | Dữ liệu tham chiếu tải lại mỗi lần mở trang | ≈ 15% (cộng nhiều route) | Thấp (A) / TB (B) | Không | — |
| 7 | `GET /customers`, `keep-alive`, các route nhỏ | 5,3% / 2,3% | Thấp | Không | 0 |
| 9 | **(MỚI 2026-10-07)** Phát hiện từ log prod: 401 khi mở app, refetch dây chuyền sau thêm checklist, `users/all` trùng, `departments` no-cache | 10% request (401) + ≈ 16% thời gian xử lý (chuỗi checklist) | Thấp–TB | Không | 1, 3 |
| 11 | **(MỚI 2026-10-07)** Rà soát code lần 3: `AuditService.logAction` dùng `save()`, recharts import tĩnh, `console.error` ở JwtStrategy | Chưa đo (ước lượng: giảm round-trip DB mỗi thao tác ghi; giảm JS lần đầu của trang báo cáo) | Rất thấp | Không | — |
| 8 | Đo lại sau cùng & chốt | — | — | — | 1–7, 9 |

Làm tuần tự **1 → 2 → 3 → 4 → 6A → 5 → 7 → 9 → 11** (9A có thể làm sớm vì độc lập, rủi ro thấp). Mục 2 và 3 đáng làm nhất (≈ 31% CPU của mẫu).

---

## Mục 0 — Chuẩn bị đo & baseline

**Mục tiêu:** có số "trước" để so sánh, và không commit nhầm log.

**Việc cần làm**
- [ ] Chuyển file CSV ra khỏi repo (đang nằm ở `backend/scripts/`) hoặc thêm vào `.gitignore`:
      `backend/scripts/*.csv`, `backend/*.csv`, `out.csv`. File chứa request id + user agent.
- [ ] Áp patch `cpu-report-friendly-error.patch` nếu chưa áp (báo lỗi thiếu file dễ hiểu).
- [ ] Chạy baseline và lưu bảng vào `WORKFLOW_LOG.md`:
      `node scripts/cpu-timing-report.mjs <file.csv> --top 25 --csv baseline.csv`
- [ ] Ghi baseline (từ log hiện tại) để so sau này:

| Route | Số lần | TB (ms) | Tổng (ms) | % |
|---|---|---|---|---|
| GET /periodic-tasks | 33 | 86,9 | 2867 | 19,1 |
| POST /auth/refresh | 12 | 154,7 | 1856 | 12,4 |
| GET /users/me | 32 | 33,3 | 1064 | 7,1 |
| GET /notifications/poll | 27 | 37,2 | 1004 | 6,7 |
| GET /sidebar/badges | 11 | 91,0 | 1001 | 6,7 |
| GET /customers | 5 | 158,9 | 794 | 5,3 |

**Cách đo công bằng ở các mục sau:** cùng người dùng, cùng kịch bản thao tác (mở trang chủ → Công việc định kỳ →
mở modal Liên kết → Nghỉ phép → đổi trang), cùng khoảng 30 phút; so **TB (ms)** và **số lần** từng route,
không so tổng CPU (phụ thuộc lượng thao tác). Đo ≥ 200 request mới kết luận.

**Tiêu chí hoàn thành:** có `baseline.csv` + bảng trên trong WORKFLOW_LOG; CSV không còn trong `git status`.

---

## Mục 1 — Kiểm tra `JWT_EXPIRES_IN` (nguồn của cụm 401)

**Bằng chứng (log):** 38 request 401 (15% số request), đi **theo đợt** 3–12 request cùng giây rồi tới
`/auth/refresh`: 06:49:00, 06:49:48, 06:50:41, 06:58:53, 06:59:29, 07:07:40, 07:09:28, 07:12:36.
Khoảng cách giữa các đợt có lúc chỉ 36–50 giây. Access token 1 giờ (`README`/`.env.example`: `JWT_EXPIRES_IN=1h`)
không thể hết hạn dày như vậy.

**Giả thuyết cần xác minh (chưa phải kết luận):**
- (a) Production đang đặt `JWT_EXPIRES_IN` ngắn (vd `1m`/`5m` để thử nghiệm). **Khả năng cao nhất.**
- (b) Nhiều tài khoản/phiên cùng hết hạn lệch nhau (ít khả năng với tần suất này).

**Các bước**
- [ ] Vào Vercel → Project backend → Settings → Environment Variables, xem `JWT_EXPIRES_IN` (cả Production/Preview).
- [ ] Nếu ngắn do thử nghiệm: đặt `1h` (khớp README) → redeploy. Nếu ngắn **có chủ đích** (bảo mật): ghi lý do
      vào WORKFLOW_LOG và chấp nhận chi phí refresh; bỏ qua phần giảm CPU của mục này.
- [ ] (Tuỳ chọn, ưu tiên thấp) FE **refresh chủ động**: trong `frontend/src/lib/api/axios-instance.ts`, request
      interceptor đọc `exp` từ access token (giải mã base64, không cần thư viện), nếu còn < 60 s thì gọi
      refresh (dùng chung cờ `isRefreshing`) **trước** khi gửi → không còn đợt 10 request 401. 401 chỉ tốn 3,2%
      CPU nên chỉ làm nếu sau mục 1 vẫn còn nhiều 401.

**Kiểm thử:** đo lại 30 phút: số 401 và số `/auth/refresh` phải giảm mạnh (kỳ vọng ≈ 1 refresh/giờ/phiên).

**Rủi ro/rollback:** đổi env + redeploy; rollback = đặt lại giá trị cũ. Token hiện có vẫn hợp lệ theo `exp` cũ.

**Tiêu chí hoàn thành:** `/auth/refresh` ≤ 1 lần/giờ/phiên trong log; 401 < 3% số request.

---

## Mục 2 — `POST /auth/refresh` (12,4% CPU) và lỗi bcrypt cắt 72 byte

### 2.0. Bối cảnh & bằng chứng
- 12 lần × ≈ 155 ms. Mỗi lần chạy `bcrypt.compare` + `bcrypt.hash` (cost 10)
  (`auth.service.ts#refresh` → `usersService.saveRefreshToken`, `users.service.ts:222`).
- **Lỗi thiết kế đã xác minh bằng thử nghiệm:** bcrypt chỉ đọc **72 byte đầu**. Refresh token là JWT; 72 byte đầu
  = header + vài ký tự đầu của payload (`{"sub":5,"emai…`), **chưa tới `iat`/`exp`**. Vì vậy 2 refresh token khác
  nhau của cùng user có thể so khớp là **bằng nhau** → cơ chế "Token reuse detected" gần như không hoạt động
  (token cũ vẫn dùng được tới khi hết 7 ngày) — vừa là lỗ hổng bảo mật vừa là chi phí CPU vô ích.
- **Bằng chứng race nhiều tab trong log:** các cặp refresh cách nhau 2–3 giây (06:58:55 & 06:58:58; 06:59:30 &
  06:59:33; 07:07:41 & 07:07:43). FE chỉ chống trùng **trong 1 tab** (`isRefreshing` là biến module,
  `axios-instance.ts`), nên 2 tab/phiên vẫn refresh song song.

### 2.1. Nguyên tắc & thứ tự triển khai (BẮT BUỘC theo thứ tự)
> Nếu sửa BE (băm SHA-256, bật phát hiện tái sử dụng thật) **trước** khi FE chống race nhiều tab,
> người dùng mở 2 tab sẽ bị đá ra đăng nhập. Vì vậy: **2A (FE) → deploy → 2B (BE) → quan sát → 2C (nếu cần)**.

### 2A. FE: chỉ 1 lần refresh cho mọi tab (không cần BE)
**File:** `frontend/src/lib/api/axios-instance.ts` (+ `lib/stores/auth.store.ts` nếu cần).
- [ ] Trước khi gọi `/auth/refresh`, bọc trong **Web Locks API**:
      `navigator.locks.request('az-auth-refresh', async () => { ... })` (fallback: không có `navigator.locks`
      thì giữ hành vi cũ).
- [ ] **Trong lock**, đọc lại token mới nhất từ store/storage (tab khác có thể vừa refresh xong): nếu access token
      hiện tại **khác** token đã gây 401 → bỏ qua gọi API, dùng luôn token mới để thử lại request.
- [ ] Chỉ khi token vẫn như cũ mới gọi `/auth/refresh`, rồi `setTokens(...)`.
- [ ] Đảm bảo store đồng bộ giữa tab: nếu `zustand persist` chưa tự cập nhật khi tab khác ghi, thêm lắng nghe
      sự kiện `storage` (hoặc rehydrate trong lock). **Cần xác minh cơ chế lưu thật (localStorage vs cookie
      `auth-storage`, xem `middleware.ts`) trước khi code** — không giả định.
- [ ] Giữ nguyên hàng đợi `failedQueue` trong cùng tab.

**Test (vitest):** mock `navigator.locks`; 2 request 401 đồng thời → chỉ 1 lần gọi `axios.post('/auth/refresh')`;
tab giả lập có token đã đổi → không gọi refresh; không có `navigator.locks` → fallback hoạt động.
**Thủ công:** mở 2 tab, ép cả 2 hết hạn token → log BE chỉ có 1 `/auth/refresh`, không tab nào bị đá ra login.

### 2B. BE: băm refresh token bằng SHA-256 (tiết kiệm CPU + bật reuse-detection thật)
**File:** `backend/src/modules/users/users.service.ts` (`saveRefreshToken`, dòng ~222),
`backend/src/modules/auth/auth.service.ts` (`refresh`, dòng ~267), thêm util `common/utils/refresh-token-hash.util.ts`.
- [ ] Util mới:
  - `hashRefreshToken(token) → 'sha256:' + createHash('sha256').update(token).digest('hex')`
  - `verifyRefreshToken(token, stored) → Promise<boolean>`: nếu `stored` bắt đầu bằng `sha256:` →
    `timingSafeEqual` (so độ dài trước); ngược lại (hash bcrypt cũ, bắt đầu `$2`) → `bcrypt.compare` (**tương thích
    ngược**, 1 lần cuối).
- [ ] `saveRefreshToken`: dùng `hashRefreshToken` thay `bcrypt.hash` (cột `hashed_refresh_token` là `TEXT` — đủ chỗ,
      không cần migration).
- [ ] `auth.service.refresh`: dùng `verifyRefreshToken`. Giữ nguyên nhánh "reuse detected" (thu hồi toàn bộ phiên).
- [ ] Khi xác thực bằng hash bcrypt cũ thành công → vẫn xoay token như hiện tại (hash mới sẽ là `sha256:`), nên
      **không ai bị đăng xuất** khi deploy.
- [ ] Login (`auth.service.ts:117`) cũng đi qua `saveRefreshToken` → tự dùng SHA-256.
- [ ] **Không** log token; log reuse dùng `userId` như hiện tại (tuân thủ quy tắc logging).

**Test (jest):** hash/verify đúng & sai; so sánh hằng thời gian; hash cũ bcrypt vẫn qua; **2 token khác nhau của cùng
user → verify sai** (bằng chứng lỗi 72 byte đã hết); refresh thành công ghi hash dạng `sha256:`; reuse → xoá hash.
**Đo:** `/auth/refresh` TB phải giảm từ ≈ 155 ms xuống chỉ còn phần verify JWT + 2 query (kỳ vọng < 30 ms — **cần đo**).

### 2C. (Chỉ làm nếu cần) Khoảng grace cho mạng chập chờn / client không có Web Locks
**Điều kiện kích hoạt:** sau 2B, log production vẫn xuất hiện `[SECURITY] Token reuse detected` lặp lại ở người dùng
thật (không phải tấn công).
- [ ] Migration mới (timestamp > lớn nhất hiện có, dùng `ADD COLUMN IF NOT EXISTS`):
      `previous_hashed_refresh_token TEXT NULL`, `refresh_rotated_at DATETIME NULL` (**DATETIME**, không TIMESTAMP — quy ước timezone).
- [ ] Khi xoay: lưu hash hiện tại vào `previous_*`, đặt `refresh_rotated_at = NOW()`.
- [ ] Khi token gửi lên khớp `previous_*` **và** < 30 s kể từ `refresh_rotated_at` → cấp access token mới, **không** coi là reuse,
      **không** xoay lần nữa (FE tab đó sẽ lấy token mới từ tab kia nhờ 2A).
- [ ] Ngoài 30 s → reuse thật → thu hồi như cũ.
- [ ] Spec: trong/ngoài cửa sổ grace; cập nhật `users.service`/`auth.service` spec.

### 2D. Rollout & theo dõi
1. Deploy 2A (FE). Quan sát 1–2 ngày: số `/auth/refresh` không còn cặp song song.
2. Deploy 2B (BE). Theo dõi 48 giờ: đếm dòng `Token reuse detected` trong Vercel Logs.
3. Nếu có reuse bất thường → làm 2C hoặc rollback 2B (revert commit; hash `sha256:` đã lưu sẽ khiến token hiện tại
   không verify được bằng bcrypt → người dùng phải đăng nhập lại 1 lần; ghi chú rõ khi rollback).

**Tiêu chí hoàn thành:** `/auth/refresh` TB < 40 ms; không còn cặp refresh song song; không có reuse giả; test xanh.

---

## Mục 3 — `GET /periodic-tasks` (19,1% CPU — nặng nhất)

### 3.0. Bằng chứng (log) & cái đã xác minh trong code
- 33 lần, TB 86,9 ms, p95 254 ms, **max 544 ms** (06:55:03). Thường xuất hiện **thành cặp cùng giây** với CPU khác
  hẳn nhau (vd 34 ms & 192 ms; 40 ms & 544 ms).
- **BE (`periodic-tasks.service.ts#findAll`, `periodic-tasks.controller.ts#findAll`):** mỗi lần gọi chạy
  `getManyAndCount()` (**2 truy vấn**: COUNT + SELECT với **5 `leftJoinAndSelect`**: status, primaryAssignee,
  department, createdBy, updatedBy) rồi **3 bước nối tiếp**: `attachChecklistProgressToList` (1 truy vấn + `getChildrenChecklistProgressBatch`),
  `attachSecondaryAssigneesToList` (1), `attachCustomerCountToList` (1) ⇒ **≥ 6–7 truy vấn / request**.
  `limit` tối đa 100 (`@Max(100)`).
- **FE:** view mặc định là `agenda` → gọi list **`limit: 100`** (`cong-viec-dinh-ky/page.tsx`, `nonTableFilters`).
  `TaskLinksModal` luôn được mount sẵn (ẩn bằng `open`); khi mở sẽ gọi **tới 2 list `limit: 100`**
  (`candidateParams` và `childCandidateParams`) — có thể đúng 2 truy vấn "cặp cùng giây". Mọi mutation (kể cả tick
  checklist) `invalidateQueries(['periodic-tasks'])` ⇒ refetch **mọi** list đang mở.
- QueryClient mặc định `staleTime: 30s`, `refetchOnWindowFocus: false`.

> **Chưa biết:** truy vấn nào thật sự tốn CPU (hydrate 100 × 5 quan hệ? `getChildrenChecklistProgressBatch`?
> thiếu index?). → **bắt buộc đo trước khi sửa** (bước 3A).

### 3A. Đo (không đổi hành vi)
- [ ] Thêm đo thời gian từng bước trong controller `findAll`, **bật bằng env** `CPU_TIMING=true`, dùng `Logger`
      (không `console.log`): log 1 dòng `[PT-List] total=… count+select=… checklist=… secondary=… customerCount=… rows=… limit=…`.
- [ ] Bật TypeORM `maxQueryExecutionTime` đã có (1000 ms); tạm hạ xuống 100 ms trên preview để thấy truy vấn chậm.
- [ ] Trên DB (preview/staging, **không phải production**): `EXPLAIN` truy vấn SELECT chính với `periodEndDate >= ? AND periodStartDate <= ?`
      + `ORDER BY periodStartDate DESC, id DESC`; kiểm tra index hiện có trên `periodic_tasks`
      (`period_start_date`, `period_end_date`, `deleted_at`, `primary_assignee_id`, `status_id`). Ghi kết quả vào WORKFLOW_LOG.
- [ ] Chạy 30 phút → lấy bảng thời gian từng bước → **chọn đúng phương án ở 3B**.

### 3B. Phương án BE (chọn theo kết quả 3A, mỗi cái 1 commit)
1. **Thu hẹp cột đã join** (nếu hydrate là điểm nghẽn): thay `leftJoinAndSelect` của `createdBy`/`updatedBy`/`primaryAssignee`
   bằng `leftJoin` + `addSelect(['createdBy.id','createdBy.name', …])` chỉ các cột FE thật sự dùng.
   - [ ] Trước khi sửa: `grep` FE xem `createdBy`/`updatedBy`/`primaryAssignee`/`department`/`status` dùng field nào
         (nhớ: audit tooltip dùng `fullName`/`name` — xem SKILL_NEXTJS_FRONTEND mục 14); **không bỏ field FE đang đọc**.
   - [ ] Spec: response vẫn đủ field cũ.
2. **Chạy song song 3 bước `attach*`** bằng `Promise.all` (mỗi hàm chỉ cần danh sách task gốc) rồi gộp theo `id`.
   *Giảm thời gian chờ (wall), gần như **không** giảm CPU — chỉ làm nếu 3A cho thấy wall time là vấn đề.* Lưu ý pool
   `connectionLimit: 3` (database.config) nên song song tối đa 3 truy vấn.
3. **Index** (chỉ nếu EXPLAIN cho thấy quét bảng): migration mới thêm index tổng hợp phù hợp
   (vd `(deleted_at, period_start_date, period_end_date)`), `CREATE INDEX IF NOT EXISTS`-tương đương cho MySQL (kiểm tra
   tồn tại trước), có `down()`.
4. **Bỏ COUNT thừa khi không cần phân trang** cho view `agenda/kanban/calendar` (chỉ cần dữ liệu ≤ 100): thêm tham số
   (vd `withTotal=false`) → bỏ truy vấn COUNT. *Chỉ làm nếu FE các view đó không dùng `total`* — grep xác minh trước.
5. **Giảm `limit: 100` mặc định** ở view agenda nếu quy mô thực tế nhỏ hơn (vài chục task) — cần xác nhận với chủ dự án
   vì đổi hành vi hiển thị (cuộn/ phân trang).

### 3C. Phương án FE
- [ ] `TaskLinksModal.tsx`: nếu `candidateParams` và `childCandidateParams` **giống nhau** → dùng chung 1 query
      (React Query đã dedupe theo key, nhưng hai params thường khác `dateFrom/dateTo` — kiểm tra thực tế trước).
- [ ] Chỉ bật query ứng viên **khi người dùng mở đúng dropdown/tab cần** (không bật cả hai ngay khi mở modal); dùng
      `limit` nhỏ + **search phía server** (đã có mô hình ở `useCustomers`) thay vì tải 100 task.
- [ ] `usePeriodicTasks`: đặt `staleTime` riêng (vd 60 s) cho list; **giữ** invalidate sau mutation nhưng thu hẹp:
      tick checklist chỉ cần cập nhật `checklistProgress` của 1 task → `setQueryData` cập nhật tại chỗ thay vì
      `invalidateQueries` toàn bộ `['periodic-tasks']` (cẩn thận đồng bộ với `useGuardedUpdatePeriodicTask`).
- [ ] Không đụng hành vi `keepPreviousData`.

**Trạng thái triển khai (2026-10-06):**
- [x] 3A — Đo: bật env `CPU_TIMING=true` → log `[PT-List] total/findAll/checklist/secondary/customerCount` (controller) và
      `[PT-List] select/count/rows` (service). **Chưa có số đo thật** — cần bật trên preview 30 phút rồi chọn tiếp 3B.1/3B.2.
- [x] 3B.3 — Index: **bỏ**, đã có `idx_periodic_tasks_period_range (period_start_date, period_end_date)` (migration 1784400000000).
- [x] 3B.4 — Bỏ COUNT thừa: `findAll` dùng `getMany()`; chỉ chạy `getCount()` khi trang đầy (rows == limit) hoặc trang rỗng ở page > 1.
      `total` trả về GIỐNG HỆT trước (không đổi shape, không cần đổi FE). Mọi view dưới `limit` dòng tiết kiệm 1 truy vấn (COUNT + 5 join).
- [x] 3C — FE: query ứng viên "Công việc cha" trong `TaskLinksModal` chỉ bật khi `canEditLinks` (Select chỉ render khi có quyền sửa).
- [ ] 3B.1 (thu hẹp cột join), 3B.2 (`Promise.all` attach*), 3B.5 (giảm limit 100) — **chờ số đo 3A**.
- [ ] 3C còn lại (`setQueryData` khi tick checklist, `staleTime` riêng, ứng viên search server-side) — chưa làm: đổi hành vi cache
      cần đo trước; tick checklist đang `invalidate` toàn bộ `['periodic-tasks']`.

**Test:** BE — spec `periodic-tasks.service` + controller (response shape không đổi, có/không `withTotal`);
FE — vitest cho hook/modal (số lần gọi API khi mở modal, khi tick checklist).
**Đo lại:** TB và số lần `GET /periodic-tasks` trong kịch bản chuẩn (Mục 0).

**Rủi ro/rollback:** đổi shape response = hỏng UI → luôn giữ field cũ; mỗi phương án 1 commit để revert riêng.

**Tiêu chí hoàn thành:** TB < 50 ms (kỳ vọng — cần đo), p95 < 150 ms, số lần/giờ giảm ≥ 30% trong cùng kịch bản.

---

## Mục 4 — `GET /users/me` (7,1% CPU, 32 lần/28 phút)

### 4.0. Bằng chứng & cái đã xác minh
- 32 lần ≈ 1,1 lần/phút — **nhiều hơn** chu kỳ 8 phút của vòng refresh avatar. Có **3 nơi gọi độc lập, không dùng chung cache**:
  1. `(dashboard)/layout.tsx` — `usersApi.getMe()` gọi trực tiếp: **ngay khi mount**, mỗi 8 phút khi đang hoạt động, và khi người dùng hoạt động lại sau > 8 phút.
  2. `useMe()` (`lib/hooks/useMe.ts`, key `['users','me']`, `staleTime 60s`) — trang chủ/profile.
  3. `profile/page.tsx:120` — gọi trực tiếp `usersApi.getMe()`.
- BE: mỗi lần `findById(id, ['department','position'])` + ký URL avatar (đã cache từ `b305b50`). TB 33 ms, nhưng p95 127 ms.

### 4.1. Các bước
- [ ] **Hợp nhất** 3 nơi gọi về **một query key** `ME_KEY`:
  - `layout.tsx`: thay `usersApi.getMe()` bằng `queryClient.fetchQuery({ queryKey: ME_KEY, queryFn: usersApi.getMe, staleTime: AVATAR_REFRESH_MS })`
    rồi merge avatar vào auth store như hiện tại → nếu `useMe`/trang khác vừa tải trong vòng 8 phút thì **không gọi lại**.
  - `profile/page.tsx`: dùng `useMe()` khi `isSelf` (giữ `getUserDetail` cho người khác).
  - `useMe`: nâng `staleTime` lên 5 phút. **Không** để dữ liệu hồ sơ cũ sau khi chính user sửa: các mutation
    `me/profile`, `me/avatar`, `me/email` phải `invalidateQueries(ME_KEY)` (kiểm tra đã có chưa, thiếu thì thêm).
- [ ] Giữ cơ chế "tự lành" avatar (URL ký 60 phút; cache BE 30 phút) — **không** kéo dài quá 8 phút mà không kiểm tra `reuseUntil`.
- [ ] Tín hiệu `permSig` (đã có) vẫn `invalidate` `['my-permissions']`… — cân nhắc thêm `ME_KEY` vì role/phòng ban/vị trí
      nằm trong `/users/me` (xác nhận FE nào đọc `me.department/position` để quyết định).

**Trạng thái triển khai (2026-10-06):**
- [x] Hợp nhất về `ME_KEY` (`lib/hooks/useMe.ts`: export `ME_KEY`, `fetchMeCached`, `refreshMe`).
- [x] `layout.tsx`: vòng tự-lành avatar dùng `fetchMeCached(queryClient, 7 phút)` (7 < nhịp 8 phút để không lỡ nhịp; << 60 phút TTL URL avatar).
- [x] `profile/page.tsx`: xem chính mình dùng cache chung; tải đầu `force=false` (cache ≤ 60s), sau khi sửa hồ sơ/email/avatar `force=true` (gọi API + ghi lại cache).
- [x] `useMe`: `staleTime` 60s → 5 phút. Avatar mutation đã `invalidate(['users'])` (khớp tiền tố → phủ cả `['users','me']`).
- [x] `usePermissionChangeSignal`: thêm `invalidate(ME_KEY)` (role/phòng ban/vị trí nằm trong `/users/me`).
- Test mới: `lib/hooks/useMe.test.tsx` (1 request cho layout+trang khác; dedupe đồng thời; quá hạn → gọi lại 1 lần; refreshMe ghi cache; invalidate → gọi lại).
- Chưa làm: kéo dài nhịp quá 8 phút (giữ tự lành avatar); chưa đo — cần đo lại số `GET /users/me` sau deploy.

**Test:** vitest — mount layout + `useMe` + profile → đúng **1** request `/users/me` trong 8 phút; sau mutation profile → refetch;
activity-resume > 8 phút → refetch 1 lần.
**Đo lại:** số lần `GET /users/me` giảm ≥ 50% trong cùng kịch bản; TB không tăng.

**Rủi ro:** hiển thị Vị trí/Phòng ban cũ tối đa 5 phút nếu Admin vừa đổi → giảm nhẹ nhờ `permSig` invalidate.

**Tiêu chí hoàn thành:** ≤ 1 request `/users/me`/8 phút/phiên đang hoạt động; test xanh.

---

## Mục 5 — `sidebar/badges` (6,7%) và `notifications/poll` (6,7%)

### 5.0. Bằng chứng
- `sidebar/badges`: 11 lần, TB 91 ms, p95 303 ms (cao nhất mỗi lần trong nhóm poll).
- `notifications/poll`: 27 lần, TB 37 ms (đã tăng nhẹ vì thêm truy vấn đọc `permissions_version`, cache 10 s/instance).
- Hai hook poll chạy **2 request riêng** mỗi chu kỳ (120 s và 180 s), mỗi request chạy đủ JwtStrategy/guard.

### 5A. Đo từng badge (không đổi hành vi)
- [ ] `sidebar-badges.service.ts#getBadges`: khi `CPU_TIMING=true`, log thời gian từng job (`invalidData`, `trash`, `pendingUsers`,
      `leaveApprovals`, `myPendingLeave`, `tasks`) bằng `Logger` → tìm badge nặng nhất.
- [ ] Nghi ngờ chính: `countDuplicatePhoneRecords` (quét trùng SĐT toàn bảng khách; **đã có cache 180 s** nhưng chỉ khi cùng `user:role:scope`)
      và `periodicTasksService.countAssignedByStatusCodes` (join theo phạm vi). **Cần số đo mới kết luận.**

### 5B. Phương án (chọn theo 5A)
1. Tối ưu truy vấn của badge nặng nhất (index / bỏ join thừa / dùng `COUNT` có điều kiện 1 truy vấn như đã làm ở `getStats`).
2. Tăng TTL cache `invalidData` nếu 5A xác nhận là badge nặng (đổi `INVALID_DATA_CACHE_TTL_MS`); chấp nhận số lệch tối đa TTL.
3. **Gộp poll thông báo vào `/sidebar/badges`** (đưa `unread` + `version` + `permSig` vào response badges; giữ `/notifications/poll`
   tương thích): giảm **số invocation** (1 thay vì 2 mỗi chu kỳ) — lợi ích chủ yếu ở **số lần gọi**, CPU mỗi lần gọi
   của route nhẹ gần như không đổi. Chỉ làm nếu muốn giảm invocation; cần sửa cả `useNotificationPoll` và `useSidebarBadgeCounts`
   (cùng `queryKey` hiện đang chia sẻ — xem comment trong `useSidebarBadgeCounts.ts`) → **rủi ro trung bình**, test kỹ toast thông báo.
4. **KHÔNG** cache toàn bộ response badges theo user vài chục giây: số badge sẽ lệch ngay sau thao tác (duyệt nghỉ phép, nhận task).
   Nếu vẫn muốn, phải kèm invalidate theo sự kiện (phức tạp) — để sau.

**⚠️ GHI CHÚ — 5B CẦN CHECK SAU (5A đã xong code, CHƯA có số đo; 5B chưa làm):**
1. Bật `CPU_TIMING=true` trên preview ~30 phút → lọc log `[Badges]` → dán 30–50 dòng. Tắt biến sau khi đo.
2. Xác định badge nặng nhất (`invalidData` / `tasks` / `leaveApprovals`…) và tỉ lệ `invalidData.cache=MISS`.
3. Nếu `invalidData` nặng + MISS cao: chạy `EXPLAIN` cho `countDuplicatePhoneRecords` (`GROUP BY customer.phone` toàn bảng khách trong phạm vi xem)
   → kiểm tra `customers.phone` có index và truy vấn có dùng không (5B.1) TRƯỚC khi tăng TTL (5B.2). Cache khoá theo `user:role:scope` → N user = N lần quét riêng;
   cân nhắc cache theo `role:scope` (chỉ khi scope không phụ thuộc user, cẩn thận nhánh `own` theo `userId`).
4. Nếu `tasks` nặng: kiểm `countAssignedByStatusCodes` (join theo phạm vi).
5. Nếu không badge nào nặng → ghi kết luận "không đáng tối ưu thêm" vào WORKFLOW_LOG (tiêu chí hoàn thành mục 5).
6. 5B.3 (gộp poll vào `/sidebar/badges`) chỉ giảm số invocation, rủi ro trung bình — quyết sau khi có số đo.

**Test:** `sidebar-badges.service.spec` (không đổi hành vi theo permission; lỗi 1 badge không hỏng badge khác); FE poll tests.
**Tiêu chí hoàn thành:** TB `sidebar/badges` < 60 ms (kỳ vọng — cần đo) hoặc kết luận có chủ đích "không đáng tối ưu thêm" ghi vào log.

---

## Mục 6 — Dữ liệu tham chiếu tải lại mỗi lần mở trang (≈ 15% CPU cộng dồn)

### 6.0. Bằng chứng
Các route gần như tĩnh: `roles/colors` (8 lần, 61 ms), `guides` (5, 97 ms), `positions` (2, 140 ms), `departments` (4, 63 ms),
`customer-statuses` (7, 44 ms), `periodic-task-statuses` (7, 39 ms), `media-sources` (7, 24 ms), `assignment-groups/:key/users` (9, 37 ms).
Chúng bị gọi **cả loạt trong cùng 1 giây** khi tải lại trang (vd 07:14:23) vì cache React Query nằm trong RAM — mất khi F5.
Hiện `staleTime`: departments 5 phút, media-sources 5 phút, customer-statuses 60 s, guides 60 s, mặc định 30 s (vd `roles/colors` — cần xác minh hook).

### 6A. Nâng `staleTime` + invalidate theo mutation (an toàn, làm trước)
- [ ] Liệt kê từng endpoint tham chiếu → hook FE tương ứng → có mutation nào sửa dữ liệu đó không (trang Admin).
- [ ] Đặt `staleTime` 5–10 phút cho: `roles/colors`, `positions`, `customer-statuses`, `periodic-task-statuses`, `departments`, `media-sources`.
- [ ] **Mỗi mutation của dữ liệu đó phải `invalidateQueries` đúng key** (nếu thiếu → bug "sửa xong không thấy đổi").
      Lập bảng kiểm trong WORKFLOW_LOG: `endpoint | hook | staleTime | mutation | invalidate OK?`.
- [ ] Không đổi `guides` quá 60 s nếu nội dung được sync thường xuyên (`guides-sync.ts`); xem lại sau.
- *Giới hạn:* 6A chỉ giảm số lần gọi **trong 1 phiên SPA**, không giúp khi F5.

### 6B. (Tuỳ chọn, sau 6A) Giữ cache qua F5
- [ ] `@tanstack/query-sync-storage-persister` + `persistQueryClient` **chỉ whitelist** các key tham chiếu ở 6A
      (`shouldDehydrateQuery`), lưu `sessionStorage` (không phải localStorage), `maxAge` ≤ 10 phút.
- [ ] `buster` = id người dùng **+** `permSig` (hoặc xoá cache khi đăng xuất/đổi user) → **không lộ chéo** giữa 2 tài khoản dùng chung trình duyệt.
- [ ] **Không** persist dữ liệu theo người dùng/nhạy cảm (`my-permissions`, `users/me`, danh sách khách…).
- Rủi ro trung bình (lộ chéo, dữ liệu cũ sau F5) → chỉ làm nếu 6A chưa đủ và đo thấy F5 là thói quen thật.

### 6C. Không làm (đã cân nhắc)
- `Cache-Control: max-age` dài ở BE: chính trình duyệt của admin vừa sửa vẫn nhận bản cũ từ HTTP cache (không có cơ chế version đáng tin) —
  loại như đã thống nhất ở phiên trước.

**Trạng thái triển khai 6A (2026-10-06):**
- [x] Liệt kê endpoint → hook → mutation (bảng kiểm trong WORKFLOW_LOG, mục 6).
- [x] Nâng `staleTime` lên 5 phút (hằng số `REFERENCE_DATA_STALE_MS`, `lib/query-stale.ts`) cho: `roles/colors` (30 s), `customer-statuses` (60 s),
      `periodic-task-statuses` (60 s), `guides` (60 s / 30 s). `departments`, `positions`, `media-sources` ĐÃ 5 phút từ trước + đã invalidate đủ → không đổi.
- [x] Mọi mutation đã invalidate đúng key (kiểm bằng test). `roles/colors` được phủ bởi invalidate `['roles']` (khớp tiền tố) của `useCreateRole/UpdateRole/DeleteRole/UpdateRolePermissions`.
- [x] `guides` (mục lục `useGuideList` 60 s → 5 phút; chi tiết `useGuideDetail` 30 s → 5 phút) — chủ dự án xác nhận chưa cần cập nhật dần. Query quản trị/tuỳ chọn
      của màn sửa guide (`manage` 15 s, `*-options` 60 s, `manage-detail` 0) GIỮ NGUYÊN. Mutation guide đã invalidate `['guides']` (tiền tố).
- [x] `assignment-groups/:key/users` giữ 60 s: danh sách đổi theo việc sửa Phòng ban/Vị trí của nhân viên
      (mutation ở trang Nhân viên KHÔNG invalidate key này) → nâng TTL cần thêm invalidate ở mutation user; để sau.
- [ ] 6B (giữ cache qua F5) — chưa làm, chỉ làm nếu đo thấy 6A chưa đủ.
- Đánh đổi: Admin sửa màu Role / trạng thái ở máy khác → máy này thấy thay đổi chậm tối đa 5 phút (máy của chính Admin đổi thì thấy ngay).

**Test:** vitest cho từng hook đổi `staleTime` + mutation invalidate; thủ công: sửa 1 mục tham chiếu → thấy đổi ngay.
**Tiêu chí hoàn thành:** số request nhóm tham chiếu trong kịch bản chuẩn giảm ≥ 40%; không có báo cáo "sửa xong không đổi".

---

## Mục 7 — Các route còn lại

### 7A. `GET /customers` (5 lần, TB 159 ms, p95 302 ms)
- [ ] Chỉ 5 mẫu → **chưa đủ**. Thu thêm log; dùng cùng kỹ thuật đo từng bước như Mục 3A (`getStats` đã tối ưu ở phiên trước).
- [ ] Nếu vẫn nặng: kiểm `leftJoinAndSelect` thừa, strip field theo `UiVisibility` (xem `CustomersService.findAll`), index tìm kiếm (`FULLTEXT` đã có hướng ở `verify-fulltext-stopword.ts`).

### 7B. `HEAD /keep-alive` (11 lần, TB 31 ms, max 227 ms)
- Do Uptime monitor gọi (~5 phút/lần, theo WORKFLOW_LOG 2026-09-29), chạy cả khi không ai dùng; mỗi lần `SELECT 1` + `logger.log`.
- [ ] Đối chiếu chu kỳ với `idleTimeout` trong `database.config.ts` (**giữ có chủ đích** vì Aiven cắt kết nối rảnh) — chỉ nới chu kỳ (vd 10 phút)
      nếu `idleTimeout` cho phép; **không** bỏ keep-alive.
- [ ] Cho `HEAD` bỏ `logger.log` mỗi lần (giảm ghi log), giữ log khi lỗi.

**Trạng thái triển khai Mục 7 (2026-10-06):**
- [x] 7A — Đo: `CustomersService.findAll` khi `CPU_TIMING=true` log 1 dòng `[Cust-List] total=… build=… main=… count=… mapDeposit=… assignees=… joinedGroups=… notes=… visibility=… rows=… limit=… search=0|1`
      (`main`/`count` là thời gian chờ từng nhánh `Promise.all`, tính từ lúc bắt đầu chạy song song). Tắt env → hành vi và response y như cũ. **Chưa có số đo thật** —
      bật trên preview ~30 phút (thao tác lọc/tìm/đổi trang), lọc log `[Cust-List]`, dán 30–50 dòng rồi mới chọn phương án (bỏ join thừa / thu hẹp cột / index / FULLTEXT). Tắt biến sau khi đo.
- [x] 7B — `GET|HEAD /keep-alive`: HEAD (Uptime monitor) không còn `logger.log` mỗi lần; GET thủ công vẫn log; lỗi luôn log. `SELECT 1` và reconnect giữ nguyên.
      **Không nới chu kỳ ping:** `idleTimeout` pool = 30 s (<< 5 phút) nên ping 5 phút không giữ được connection; giá trị còn lại là đánh thức function/Aiven, và chu kỳ do Uptime
      cấu hình ngoài code — chỉ nới (vd 10 phút) nếu chủ dự án xác nhận Aiven không ngủ trong khoảng đó. Chưa có bằng chứng → giữ 5 phút.
- [ ] 7C — theo dõi, chưa làm gì (mẫu ít).

### 7C. `PATCH /leave-requests/:id/approve` (2 lần, 196 ms), `roles/my-permissions` (10 lần, 37 ms), `users/all` (9 lần, 42 ms)
- Mẫu quá ít/hành động thủ công → **chưa làm gì**, đưa vào danh sách theo dõi ở lần đo sau.

---

## Mục 9 — Phát hiện từ log PROD 2026-10-07 (bổ sung)

> **Nguồn:** `az-workbase-backend-log-export-2026-10-07T02-16-39.json` (Vercel Logs **production**, `CPU_TIMING=false`),
> 01:50–02:16 UTC (26 phút), **719 request thật** (4512 dòng log, gộp theo `requestId`), ~10 người dùng, 15 instance.
> **Giới hạn:** log chỉ có `durationMs` (thời gian chạm tường, gồm cả chờ DB), **không phải CPU hoạt động Fluid** → các tỷ lệ dưới đây
> là tương đối. Log không có user id nên không tách theo người dùng được. Mọi mục đều phải **đo lại** như các mục trước.
> **Trạng thái code khi lập mục này:** `main` @ `4e595e7`. **Đính chính (2026-10-07, sau khi đọc code thật):** Mục 2A (khoá liên-tab) **ĐÃ CÓ**
> trong `frontend/src/lib/auth/shared-refresh.ts` (Web Locks + đọc lại localStorage, có test). Bản đầu của mục này chỉ grep `axios-instance.ts`
> nên ghi nhầm là chưa có. Phần **chưa có** là đọc `exp` của token để refresh chủ động (đã làm ở 9A bên dưới).

### 9.0. Số liệu tổng quan (prod)
| Chỉ số | Giá trị |
|---|---|
| Phân bố status | 200: 221 · 304: 168 (23%) · 204 (OPTIONS): 225 (31%) · 401: 73 (10%) · 201: 32 |
| Thời gian xử lý TB | 200: 359 ms · **304: 351 ms** · 204: 65 ms (trung vị 7 ms) · 401: 131 ms · 201: 714 ms |
| Tổng thời gian xử lý | ≈ 185 s (304: 58,9 s · OPTIONS: 14,5 s · 401: 9,6 s) |
| Route tốn nhất (tổng) | `POST /periodic-tasks/:id/checklist-items` 24 lần · 18,1 s · TB 752 ms; `GET /periodic-tasks` 44 lần · 13,3 s; `sidebar/badges` 12,6 s; `notifications/poll` 11,7 s |
| Lỗi (`level=error`) | Chỉ 1 loại: `DEP0169 url.parse()` của Node — không phải lỗi nghiệp vụ |

**Kết luận chung:** không có vòng lặp gọi API dư thừa nghiêm trọng. `refresh` chỉ chạy 1 lần mỗi đợt 401 (14 dòng = 7 OPTIONS + 7 POST),
không còn thấy cặp refresh song song như log 06/10. Chỉ có 10 GET trùng thật trong 5 giây (sau khi loại các retry sau 401).

### 9.1. Về 304 — đã xác minh, KHÔNG phải lỗi
- 304 tốn **351 ms TB, gần bằng 200 (359 ms)**: Express sinh weak ETag **sau khi** handler chạy xong → server vẫn chạy đủ query DB,
  chỉ không gửi lại body. **304 tiết kiệm băng thông, KHÔNG tiết kiệm CPU/invocation.** Muốn giảm CPU phải giảm **số lần gọi**.
- Phân bố 304: `notifications/poll` 27 (đúng thiết kế: số chưa đọc không đổi) · `roles/my-permissions` 20 · `users/all` 15 ·
  `periodic-tasks/links` 15 · `departments` 11 · `roles/colors` 10 · `guides` 8 · `positions`/`customer-statuses`/`media-sources`/
  `assignment-groups/sales/users` 7 mỗi route.
- Phần lớn nhóm tham chiếu (`my-permissions`, `colors`, `departments`, `guides`, `positions`…) rơi vào **lúc mở app/F5 và lúc retry sau 401**
  (xem 9A) chứ không phải polling → xử lý ở 9A + Mục 6, không cần làm gì riêng cho "304".
- [ ] Không đổi gì ở cơ chế ETag. Ghi nhận vào WORKFLOW_LOG để lần sau không ai "tối ưu 304" vô ích.

### 9A. Đợt 401 khi mở app với access token đã hết hạn (ưu tiên cao, độc lập) — ✅ ĐÃ LÀM (2026-10-07, chờ deploy + đo)
**Bằng chứng (log):** 73 request 401 (10%), chia **7 đợt** (02:05, 02:07, 02:11, 02:12, 02:13…), mỗi đợt 8–9 request **cùng giây**:
`departments, positions, sidebar/badges, roles/colors, notifications/poll, users/me, guides, roles/my-permissions` (đúng bộ query lúc mở app).
Chuỗi lặp lại mỗi đợt: 8 `OPTIONS` → 8 `GET 401` → `OPTIONS` + `POST /auth/refresh` → **gửi lại 8 request** (đa số 304/200).
⇒ mỗi đợt tốn ≈ 8 invocation 401 + 8 retry, rồi các route tham chiếu chạy lại. Nguyên nhân: user mở lại app sau > `JWT_EXPIRES_IN` (1h, đã đặt đúng) nên token đã hết hạn **trước** khi gửi request đầu tiên.

**Việc cần làm — ĐÃ LÀM** (chính là mục "refresh chủ động, ưu tiên thấp" của Mục 1 — nay có bằng chứng prod nên nâng lên làm):
- [ ] `frontend/src/lib/api/axios-instance.ts`, request interceptor: giải mã `exp` từ access token (base64url của đoạn payload, **không cần thư viện**, bọc try/catch — token lỗi thì bỏ qua và gửi như cũ).
      Nếu `exp - now < 60 s` (kể cả đã hết hạn) → gọi refresh **trước** rồi mới gửi request; dùng chung cờ/hàng đợi `isRefreshing` + `failedQueue` hiện có để 8 request song song chỉ đợi 1 lần refresh.
- [ ] Không refresh chủ động cho chính `/auth/refresh` và `/auth/login` (tránh đệ quy); đồng hồ máy lệch → vẫn còn nhánh 401 cũ làm lưới an toàn (**giữ nguyên**, không bỏ).
- [ ] Giữ code cũ bằng comment `// [AGENT] OLD CODE`; không đổi BE.
- [x] ~~(Tuỳ chọn) bọc refresh trong `navigator.locks`~~ — **không cần**: 9A dùng lại `refreshAccessTokenShared` (đã có khoá liên-tab).

**Đã triển khai (file thật):**
- `lib/auth/token-expiry.ts` — `getJwtExpMs`, `isAccessTokenExpiring` (đọc `exp`, lỗi → `null` → gửi như cũ).
- `lib/auth/proactive-refresh.ts` — `ensureFreshAccessToken`: dùng chung 1 promise cho request song song, **cooldown 30 s** (chặn vòng refresh khi đồng hồ client lệch), trả `auth-failed` khi BE từ chối refresh (→ đăng xuất ngay, không refresh lần 2) / `skipped` khi lỗi mạng.
- `lib/api/axios-instance.ts` — request interceptor chuyển `async`, gọi `ensureFreshAccessToken` (bỏ qua mọi route `/auth/*`); response interceptor thêm nhánh `_proactiveAuthFailed`. Code cũ giữ bằng comment `[AGENT] OLD CODE`. **Lưới 401 giữ nguyên.**
- Test: `token-expiry.test.ts` (4), `proactive-refresh.test.ts` (5), `proactive-refresh.integration.test.ts` (4, dùng `axiosInstance` thật + adapter giả).

**Số đo thật từ test tích hợp (mở app với token hết hạn, 8 request song song):**
| | Request tới BE | 401 | `/auth/refresh` |
|---|---|---|---|
| TRƯỚC 9A (mô phỏng bằng test "lưới 401") | 16 | 8 | 1 |
| SAU 9A | **8** | **0** | **1** |

**Test (vitest):** token còn hạn → không gọi refresh; token hết hạn + 8 request đồng thời → đúng **1** `axios.post('/auth/refresh')` và 8 request đều gửi với token mới, **không request nào nhận 401**; token không giải mã được → gửi như cũ; refresh lỗi → logout như hiện tại.
**Đo (sau deploy):** 30 phút cùng kịch bản (mở app sau > 1h không dùng): số 401 giảm từ 73 → gần 0; số `GET` trùng sau 401 biến mất. Nếu thấy `/auth/refresh` ≥ 2 lần trong 30 giây ở cùng người dùng → nghi lệch đồng hồ, xem cooldown.
**Rủi ro/rollback:** đụng luồng đăng nhập/refresh (cùng khu vực Mục 2) → revert 1 commit; lưới 401 cũ vẫn còn nên rủi ro thấp–TB.
**Tiêu chí hoàn thành:** 401 < 2% số request; mỗi lần mở app sau hết hạn chỉ có 1 `/auth/refresh` và không có đợt 8 request 401.

### 9B. Thêm/tick checklist item → refetch dây chuyền (nặng nhất mẫu này) — 9B-0 ✅, 9B-1 (nhánh THÊM) ✅ ĐÃ LÀM 2026-10-07, chờ deploy + đo
**Bằng chứng (log):** 24 `POST .../checklist-items` (TB **752 ms**, tổng 18,1 s; 9 lần cho task 128, 6 cho task 123; trung vị 14 s giữa 2 lần, 6 lần cách nhau < 10 s).
Ngay sau **mỗi** POST (≤ 3 s, cùng trình duyệt): **24 × `GET /periodic-tasks`** (limit 100, TB 301 ms) + **25 × `GET .../checklist-items`** (TB 270 ms).
⇒ chuỗi này ≈ **30 s / 185 s (~16%)** thời gian xử lý của 26 phút.

**Đã xác minh trong code:** `usePeriodicTaskChecklistItems.ts` đã thu hẹp invalidate (predicate `shouldRefetchAfterChecklistChange`) — vẫn **cố ý** refetch list để cập nhật nhãn "X/Z" và `['periodic-task-performance']`. Đây là hành vi thiết kế, không phải bug; mục này chỉ là **tối ưu thêm**, làm sau khi 3B/3C đã đo xong.

**Đã xác minh bằng test (2026-10-07):** `frontend/src/lib/hooks/periodicTaskChecklistCallCount.test.tsx` (8 kịch bản, hook + API + `axiosInstance` thật, adapter giả) — số lần gọi **chính xác** cho mỗi lần thêm 1 mục:
| Kịch bản | Kết quả đo |
|---|---|
| S1 Agenda + modal checklist mở | 1 POST + **0 GET `/periodic-tasks`** (9B-1; trước: 1, khớp log prod 24 POST → 24 list) + **1 GET `/:id/checklist-items`** |
| S2 + Task con của CHÍNH task, `links-among`, `children`, `parents` | **0** (đã tối ưu đúng) |
| S2 + `rollup` của chính task | ✅ 9B-0: **0** (trước: 1); list cũng 0 (9B-1) |
| S3/S4/S5 (9B-2) | refetch phụ chuyển từ "ngay" sang "sau 1,5 s" (vẫn đúng 1 lần) |
| S13/S14 (mới, 9B-2) | 5 lần thêm liên tiếp: query phụ 1 lần/loại (trước: 5), checklist-items 5; `reopen` không gộp |
| S9–S12 (mới, 9B-1) | cache list nhận đúng số BE, dòng khác không đổi, list stale; `reopen`/BE cũ → fallback 1 list; mở lại list → 1 refetch lấy số thật |
| S3 Task CHA mở `linked-children-page` | 1 (đúng thiết kế: hiển thị tiến độ) |
| S4 mở chi tiết `GET /:id` | 1 |
| S5 trang Hiệu suất đang mở | +1 (`performance` luôn bị invalidate) |
| S6 modal đóng | 9B-1: chỉ 1 POST, **không** GET nào (trước: 1 list) |
| S7 thêm 5 mục liên tiếp | 5 POST + **0 list** (trước: 5) + 5 checklist-items |
| S8 thêm 5 mục dồn dập (adapter tức thì) | 5 POST + **0 list** (trước: 5) + 5 checklist-items; ở prod POST ~750 ms nên refetch bị huỷ-và-gọi-lại, request đã tới BE vẫn tốn |

Khi làm 9B-1/9B-2, **cập nhật đúng các con số này** — đó là bằng chứng giảm.

Phương án (chọn 1, đo trước/sau; mỗi cái 1 commit):
- [x] **9B-1 — ✅ ĐÃ LÀM cho nhánh THÊM item (2026-10-07).** BE `create()` trả thêm `checklistProgress` (tính bằng `attachChecklistProgressToList` — item + Task con; lưu ý `total/done` cũ CHỈ đếm item nên không dùng được cho nhãn). FE `useAddTaskChecklistItem`: `setQueriesData` ghi đúng số của BE vào dòng task trong cache list, list `invalidate(refetchType:'none')`, các query khác vẫn refetch. **Fallback refetch đầy đủ** khi `reopen=true` (BE đổi status/kỳ) hoặc BE chưa trả `checklistProgress`. **CHƯA làm nhánh tick/sửa/xoá/di chuyển:** `update()` chỉ trả `item` (không có tiến độ) và tick có thể đổi status → cần đổi response BE (9B-1b), chưa có bằng chứng log (prod chỉ thấy 24 POST). Giữ nguyên mô tả gốc bên dưới: **9B-1 (khuyến nghị):** `onSuccess` của `useAddTaskChecklistItem`/`useUpdateTaskChecklistItem`: cập nhật nhãn tiến độ của đúng task trong cache list bằng `setQueryData` (dựa response POST/PATCH nếu BE đã trả `checklistProgress`; nếu chưa thì **thêm vào response**, không refetch list) và đặt `invalidateQueries({ queryKey: [LIST_KEY], refetchType: 'none' })` cho list để lần focus/mở sau mới refetch. Chỉ refetch trang checklist đang mở.
- [x] ✅ ĐÃ LÀM (2026-10-07) — đã đọc BE `getRollup` (chỉ đếm trạng thái Task CON, không đọc checklist) → bỏ qua `rollup` của CHÍNH `taskId`; rollup của task KHÁC (Task cha) vẫn refetch. S2 đo: rollup 1 → 0. **9B-0 (nhỏ, an toàn, nên làm trước):** thêm `rollup` vào danh sách bỏ qua của `shouldRefetchAfterChecklistChange` **chỉ nếu** xác minh `GET /:id/rollup` không phụ thuộc số mục checklist (đọc BE `getRollup` trước — nếu rollup tính tiến độ từ checklist thì phải GIỮ refetch).
- [x] **9B-2 — ✅ ĐÃ LÀM (2026-10-07) với PHẠM VI THU HẸP.** Sau 9B-1 list đã không refetch, nên "gộp refetch list" không còn đối tượng. Phần còn gộp được là các query PHỤ khi đang mở (detail, Task con của task cha, rollup task khác, performance): trailing debounce 1,5 s, trần chờ 5 s (`invalidationDebouncer.ts`, dùng trong `useApplyChecklistProgress`). **KHÔNG gộp** trang checklist của chính task (phải hiện item mới ngay + modal nhảy trang theo `res.total`) và nhánh fallback `reopen`/BE cũ. Đo (S13, 5 lần thêm liên tiếp, đủ 3 view phụ mở): query phụ 5 → **1** mỗi loại, `checklist-items` vẫn 5, list vẫn 0. **Lợi ích thực tế nhỏ:** log prod chỉ có chuỗi list + checklist-items, chưa thấy các view phụ này mở cùng lúc; đây là bảo hiểm, rollback = revert 1 commit (code cũ giữ bằng comment). Mô tả gốc: debounce gộp invalidate ~1–2 s khi người dùng thêm liên tiếp (6 lần cách nhau < 10 s).
- [ ] **9B-3 (BE, nếu vẫn chậm):** đo `POST` 752 ms — Guard đổi status/kỳ Task trong cùng request (xem comment ở hook) có thể là nguồn; bật `CPU_TIMING` trên **preview** (không phải prod), log từng bước trong `addChecklistItem`, `EXPLAIN` truy vấn tính tiến độ. **Chưa kết luận** vì log prod không có thời gian từng bước.

**Test:** tick/thêm item → nhãn "X/Z" ở list vẫn đúng ngay (không đợi refetch) và đúng sau F5; 5 lần thêm liên tiếp → ≤ 1–2 `GET /periodic-tasks`.
**Rủi ro:** nhãn lệch nếu BE đổi status/tiến độ ngoài dự đoán của FE → luôn lấy số từ response BE, không tự cộng trừ ở FE; rollback = revert commit (quay lại invalidate như cũ).
**Tiêu chí hoàn thành:** số `GET /periodic-tasks` sau mỗi lần thêm checklist giảm từ 1 → ≤ 0,3 (đo ≥ 20 lần thêm); nhãn không lệch.

### 9C. `GET /users/all` — nhiều nơi tự gọi, không dùng chung cache — ✅ ĐÃ LÀM (2026-10-07, chờ deploy + đo)
**Bằng chứng (log):** 37 lần/26 phút (15 lần 304); 6/10 GET trùng thật là `users/all`, có cặp cách nhau **0,1–0,2 s** (02:03:42, 02:07:00 ×2, 02:07:26).
**Đã xác minh trong code (grep):** `usersApi.getAllForSelect()` được gọi ở ≥ 8 nơi, mỗi nơi tự `useQuery`/gọi trực tiếp:
`UtmManagersModal`, `CustomerAssignmentsTab`, `BulkAssignModal`, `SalesUserSelect`, `useBroadcastCompose`, và **gọi thẳng không qua cache** ở `trash-can/page.tsx:152` (`.then(setSalesOptions)`) và `customers/page.tsx:506`.
(`getUsersList` ở `useUsers.ts` cũng gọi cùng route `/users/all`, khác query string.)
**Đã xác minh (2026-10-07, đọc code):** 5 `useQuery` (`UtmManagersModal`, `CustomerAssignmentsTab`, `BulkAssignModal`, `SalesUserSelect`, `useBroadcastCompose`) **cùng `queryKey: ['users-for-select']`, `staleTime` 5 phút** → **đã dedupe tốt**, không cần hook chung. Phần gây trùng THẬT chỉ là:
(1) `trash-can/page.tsx:152` (`useEffect` gọi thẳng, không cache); (2) `customers/page.tsx:506` (`fetchSalesUsers` gọi thẳng, không cache); (3) `useUsers.ts` dùng key riêng `['users-list', role]` nhưng cùng route `/users/all`.

- [ ] ~~Tạo hook dùng chung + thay 5 chỗ `useQuery`~~ — **không cần** (đã dùng chung key).
- [x] Chỉ sửa 2 chỗ gọi trực tiếp (`trash-can/page.tsx:152`, `customers/page.tsx:506`) → `queryClient.fetchQuery({ queryKey: ['users-for-select'], queryFn: usersApi.getAllForSelect, staleTime: 5 * 60 * 1000 })` để dùng chung cache; cân nhắc gộp `useUsers` (`users-list`) khi `role` không truyền.
- [x] (users/page.tsx tạo/sửa/xoá mềm, TrashTab khôi phục, profile xoá mềm → `invalidateUserLists`; helper ở `useUsers.ts`) Invalidate key này khi tạo/sửa/khoá/xoá nhân viên và khi đổi Phòng ban/Vị trí (theo quy tắc Mục 6A: **liệt kê mutation → invalidate**, không nâng TTL nếu chưa có invalidate).
- [x] (`usersForSelectCache.test.tsx`, 4 test) Test: mở 2 modal dùng danh sách người dùng liên tiếp → chỉ 1 `GET /users/all`; sửa nhân viên → danh sách tươi.
**Tiêu chí hoàn thành:** `GET /users/all` trùng < 5 s về 0; số lần/phiên giảm ≥ 40% (cùng kịch bản).

### 9D. Danh mục ít đổi (departments, positions, roles, statuses, leave-types, media-sources) — "chỉ gọi lại khi dữ liệu thật sự đổi" — ✅ ĐÃ LÀM (2026-10-07), chờ deploy + đo
**Bằng chứng/đã xác minh trong code:** `departments.controller.ts:40` dùng `CacheControlInterceptor(300, true)` → header `private, no-cache`, tham số `300` bị bỏ qua, mỗi lần gọi đều chạm server (log: 21 request, TB 410 ms, cộng 16 lần 401). Các hook danh mục khác chỉ dùng `staleTime` 30 s–5 phút nên vẫn hỏi lại định kỳ.
**Quyết định của chủ dự án (thay cho 2 phương án (a)/(b) cũ):** KHÔNG chọn `max-age` HTTP. Thay vào đó: **không kiểm tra định kỳ; chỉ tải lại khi có thay đổi dữ liệu**, theo cơ chế version "đi nhờ" `/notifications/poll` (đã có sẵn `permissions_version` → `permSig` → `usePermissionChangeSignal`). **Lưới an toàn `staleTime` = 2 giờ** (không dùng `Infinity`; chủ dự án đã giảm đề xuất 6 giờ xuống 2 giờ).

**Thiết kế**
- **BE:** tổng quát hoá `PermissionsVersionService` thành bộ đếm theo từng bảng trong bảng `settings` có sẵn (không migration schema): key `refdata_version:<domain>` với domain ∈ `departments`, `positions`, `roles` (kèm `roles/colors`), `customer_statuses`, `periodic_task_statuses`, `leave_types`, `media_sources`. `bump(domain)` dùng lại đúng câu `INSERT ... ON DUPLICATE KEY UPDATE value = value + 1` (nguyên tử, fire-and-forget qua `waitUntil`, không bao giờ throw). Gắn `bump` vào MỌI `create/update/remove` (và lock/unlock của media-sources, gán/bỏ manager của departments) của service tương ứng. `/notifications/poll` trả thêm `refSig: { departments: n, ... }`; **đọc gộp chung 1 query** với `permissions_version` (`WHERE key = 'permissions_version' OR key LIKE 'refdata_version:%'`), cache RAM 10 s/instance như hiện tại → **không thêm request, không thêm lượt DB**. Giữ nguyên `permSig`.
- **FE:** thêm `useRefDataChangeSignal(refSig)` (cùng kiểu `usePermissionChangeSignal`, gọi đúng 1 lần trong `useNotificationPoll`): lần đầu chỉ ghi mốc; khác mốc của DOMAIN nào thì chỉ invalidate đúng key của domain đó (đổi phòng ban không kéo refetch vị trí/status). Đổi user đăng nhập → đặt lại mốc. BE cũ chưa trả `refSig` → bỏ qua, chạy bằng lưới 2 giờ. Các hook danh mục: `staleTime: REFERENCE_DATA_STALE_MS` mới = **2 giờ** (`lib/query-stale.ts`), `refetchOnMount: false`; invalidate sau mutation cục bộ giữ nguyên.
- **HTTP cache GIỮ `private, no-cache`** (tức 9D(a) ở tầng HTTP). **TUYỆT ĐỐI không** đổi sang `max-age`: khi `invalidate` kích hoạt refetch, trình duyệt có thể trả bản HTTP-cache cũ → dữ liệu cũ dù đã có tín hiệu. Lần refetch hiếm hoi luôn hỏi server (thường 304 nhờ ETag).
- **Gom chỗ lệch cache trước khi bật** (nếu không cơ chế mới bỏ sót): `chia-data/page.tsx:167` (`axiosInstance.get('/departments')` gọi thẳng) và `useBroadcastCompose.ts:69` (key riêng `['departments-for-select']`, không bao giờ bị invalidate) → dùng chung key `['departments']`.
- `permissions` (danh sách quyền) và ma trận quyền: giữ nguyên cơ chế `permSig` hiện có, không thêm bộ đếm.

**Đánh đổi đã chấp nhận**
- Máy/trình duyệt khác thấy thay đổi sau tối đa ~1 chu kỳ poll (2 phút; hoặc ngay khi quay lại tab vì poll có `refetchOnWindowFocus`), không phải tức thì (SSE/WebSocket không phù hợp Vercel serverless). Tab treo > 5 phút ngừng poll, làm mới khi quay lại.
- F5 / mở trang mới vẫn tải 1 lần (QueryClient chưa có persister; persister bị hoãn vì rủi ro lộ chéo tài khoản ở Mục 6B).
- **Rủi ro lớn nhất = sót `bump`** → dữ liệu cũ trên máy khác tới tối đa 2 giờ (nhờ lưới an toàn). Thay đổi ngoài API (migration, seed, sửa SQL tay) không tự bump → khi sửa danh mục bằng migration/SQL phải bump thủ công (hoặc chấp nhận tối đa 2 giờ).

**Việc cần làm (mỗi bước 1 commit, patch là delta trên HEAD đã pull)**
- [x] 9D-1 BE: `RefDataVersionService` (tổng quát hoá, giữ `permSig`), gắn `bump` vào 7 nhóm service, `refSig` trong `/notifications/poll`; jest (bump đúng domain, đọc gộp 1 query, lỗi DB không làm hỏng poll).
- [x] 9D-2 BE: test quét "mọi POST/PATCH/DELETE của controller danh mục đều dẫn tới `bump`" để chống sót.
- [x] 9D-3 FE (⚠️ LỆCH PLAN: KHÔNG đặt `refetchOnMount: false` — react-query v5 làm query đã invalidate không bao giờ refetch khi mở lại trang; mặc định `refetchOnMount: true` + `staleTime` 2 giờ đã đủ; thêm `alwaysFresh` cho 3 trang quản trị status/loại phép/trạng thái công việc vì `inUseCount` đếm từ bảng không bump domain nào; tên hằng thực tế `REF_DATA_SAFETY_STALE_MS` + `refDataQueryOptions()` ở `lib/query-stale.ts`, `REFERENCE_DATA_STALE_MS` 5 phút giữ cho `useGuides`): `useRefDataChangeSignal` + 2 giờ cho hook danh mục; gom 2 chỗ lệch cache ở trên; vitest đếm request qua `axiosInstance` thật (mở nhiều trang/modal → 1 GET; refSig đổi → đúng 1 GET đúng domain; refSig không đổi → 0 GET; BE cũ không có `refSig` → vẫn đúng).
- [~] 9D-4 (WORKFLOW_LOG đã có entry; bảng 9F chờ số đo) Cập nhật bảng "Trước → Sau" (Mục 9F) và `WORKFLOW_LOG.md`.
**Thứ tự deploy:** BE trước hoặc cùng lúc FE. FE mới + BE cũ vẫn đúng nhờ lưới 2 giờ (chỉ chưa có lợi ích tức thời).
**Tiêu chí hoàn thành:** `GET /departments`, `/positions`, `/roles`, statuses, leave-types sau lần tải đầu của phiên → ≈ 0 (chỉ phát sinh khi dữ liệu đổi hoặc qua 2 giờ); sửa phòng ban ở máy A → máy B thấy trong ≤ ~2 phút mà không cần F5.
**Đo:** số `GET` từng route danh mục trên mỗi phiên (cùng kịch bản, ≥ 200 request).

### 9E. Không cần làm (đã cân nhắc từ log prod)
- **Preflight `OPTIONS` (31% số request):** đã trả lời **trước** khi khởi tạo Nest (`respondToPreflight`), TB 65 ms / trung vị 7 ms, `maxAge` đã `7200` (mức tối đa Chrome chấp nhận). Mỗi URL (kể cả khác query của `periodic-tasks`) cần 1 preflight riêng nên không giảm thêm được. **Giữ nguyên.**
- **`HEAD /keep-alive` (12 lần, UptimeRobot ~5 phút):** đã bỏ log (mục 7B). Không nới chu kỳ (xem Phụ lục A).
- **`notifications/poll` 304:** thiết kế đúng; chu kỳ trung vị 12,7 s là cộng dồn của ~10 người dùng (idle-aware polling đã có). Đo lại ở Mục 5.
- **Cảnh báo `DEP0169 url.parse()`:** của thư viện bên thứ ba/Node, không ảnh hưởng CPU; xử lý ở PLAN_HARDENING (cập nhật phụ thuộc), không thuộc plan này.

### 9F. Đo lại sau Mục 9
- [ ] Vì prod đang `CPU_TIMING=false`: so sánh bằng **số request theo route + `durationMs`** (cùng kịch bản, cùng khoảng 30 phút, ≥ 200 request), không so tổng.
- [ ] Bảng "Trước → Sau" cần có: số 401, số `POST /auth/refresh`, `GET /periodic-tasks` sau mỗi POST checklist, `GET /users/all`, `GET /departments`.
- [ ] Thứ tự commit (mỗi mục 1 commit): **9A ✅ → 9C ✅ → 9B-0 ✅ → 9B-1 ✅ → 9B-2 ✅ → 9D (hướng version-signal, 9D-1…9D-4)**. Ghi entry `WORKFLOW_LOG.md` sau mỗi mục.
- [ ] Không bật `CPU_TIMING=true` trên prod để đo mục này (tự tốn CPU); nếu cần chi tiết 9B-3 thì bật trên **preview** ~30 phút rồi tắt.

---

## Mục 10 — Rà soát 2026-10-07 (sau 9D): request nhân bản / thử lại ngầm (bổ sung)

**Bối cảnh:** prod đã tắt debug + `CPU_TIMING`; Uptime chỉ gọi cron 12–24 giờ/lần. Rà code (HEAD `1fdf064`) tìm chỗ còn sinh request thừa. Chưa có số đo log cho Mục 10 — tiêu chí dưới đây đo sau deploy.

### 10A. Máy chấm công hỏi `/iclock/getrequest` mỗi 10 giây — ✅ ĐÃ LÀM (chờ deploy + đo)
- **Bằng chứng trong code:** `adms.controller.ts` trả `Delay=10`; theo giao thức ZKTeco máy hỏi `getrequest` mỗi `Delay` giây (≈ 8.600 lần/ngày/máy). `vercel.json` route `/(.*)` → function Nest nên mỗi lần hỏi là 1 invocation, trong khi `getrequest` luôn trả `OK` (hệ thống không gửi lệnh xuống máy). ⚠️ Số lần thực tế phụ thuộc firmware — cần đối chiếu Vercel logs.
- **Đã làm:** `Delay=86400` (24 giờ). `Realtime=1` giữ nguyên nên log quẹt thẻ vẫn đẩy ngay. `ErrorDelay=30` GIỮ NGUYÊN (retry khi đẩy log lỗi — tăng sẽ làm chậm/mất log).
- **Lưu ý áp dụng:** máy chỉ nhận cấu hình mới ở lần handshake kế tiếp (`GET /iclock/cdata`) → khởi động lại máy hoặc đợi máy handshake lại. Một số firmware giới hạn trần `Delay`; nếu máy bỏ qua giá trị, thử 3600 hoặc 600.
- **Đo:** số request `/iclock/getrequest` mỗi ngày (Vercel logs) trước → sau; kỳ vọng ≈ 1–2/ngày/máy.
- **Rollback:** đổi lại `Delay=10` trong `adms.controller.ts`.

### 10B. `retry: 2` mặc định của QueryClient — ✅ ĐÃ LÀM (chờ deploy + đo)
- **Vấn đề:** `AntdAppProvider.tsx` đặt `retry: 2` → mọi query lỗi 403/404/500 bị gọi 3 lần (chờ 1 s, 2 s). Nặng nhất khi BE trả 403 vì thiếu key permission (mỗi query ×3, lặp mỗi lần mở trang); 401 sau khi refresh thất bại cũng bị gọi lại.
- **Đã làm:** `lib/query-retry.ts#shouldRetryQuery`: lỗi 4xx KHÔNG thử lại; lỗi mạng/5xx thử lại đúng 1 lần. Mutation mặc định không retry (không đổi). `useZkDevice`/`useGuides` (`retry: false`) và `useNotificationPoll` (`retry: 1`) giữ riêng.
- **Test:** `query-retry.test.ts` (4xx → không retry; 5xx/mạng → đúng 1 lần).
- **Đo:** số request lặp cùng URL trong ≤ 3 giây sau 1 phản hồi 4xx → kỳ vọng 0.
- **Rollback:** `retry: 2` như cũ.

### 10C. Gộp `/sidebar/badges` vào poll — ✅ ĐÃ LÀM (chờ deploy + đo)
- **Trước:** mỗi người đang dùng web ≈ 0,5 request/phút `/notifications/poll` (120 s) + 0,33 request/phút `/sidebar/badges` (180 s) ≈ **0,83**. Hai request chạy `JwtStrategy` riêng.
- **Đã làm:** BE thêm `GET /sidebar/poll` (trả đúng hình dạng `/notifications/poll` + `badges`; đếm badge lỗi → bỏ field `badges`, KHÔNG làm hỏng poll). `/notifications/poll` và `/sidebar/badges` GIỮ NGUYÊN cho FE cũ. FE: `notificationsApi.poll` gọi `/sidebar/poll`; `useSidebarBadgeCounts` đọc `data.badges` từ query poll chung, bỏ query badges riêng; `SIDEBAR_BADGES_QUERY_KEY` = key poll (đổi quyền → invalidate poll là làm mới luôn badge). **Sau:** ≈ **0,5 request/phút/người**.
- **Đánh đổi:** badge sidebar làm mới 120 s thay vì 180 s → phần đếm badge chạy nhiều hơn ~50% mỗi request nhưng bớt 1 invocation (JwtStrategy + guard). Số đếm đắt nhất (`invalidData`) vẫn cache RAM 180 s/instance. Nếu đo thấy `/sidebar/poll` nặng hơn tổng cũ → nâng chu kỳ poll lên 180 s hoặc cache `badges` theo user ~150 s ở BE.
- **Thứ tự deploy:** BE trước hoặc cùng lúc FE (FE mới gọi `/sidebar/poll`; BE cũ chưa có route sẽ 404 → badge và chuông thông báo trống tới khi BE lên).
- **Test:** `sidebar-badges.controller.spec.ts` (gộp đủ field; badge lỗi vẫn trả thông báo; permSig/refSig undefined bị bỏ), `useSidebarBadgeCounts.test.tsx` (1 request cho cả hai loại badge, không gọi `/sidebar/badges`; BE cũ không có `badges` vẫn đúng).
- **Rollback:** `notificationsApi.poll` đổi lại `/notifications/poll`, khôi phục query badges riêng trong `useSidebarBadgeCounts` (xem `OLD CODE` trong file).

### 10D. Đã rà, KHÔNG cần làm
- Refresh token 401 dùng 1 lần cho nhiều request (`isRefreshing`/`failedQueue`, `refreshAccessTokenShared`) — không lặp.
- Poll avatar `/users/me` chỉ chạy khi tab hiện và người dùng hoạt động (8 phút).
- BE không có `@Cron`/`@Interval` đang bật; `vercel.json` chỉ có 2 cron/ngày; retry sync máy chấm công có giới hạn (delay 2 s theo chunk).
- `refetchOnWindowFocus` mặc định tắt; chỉ `my-permissions`, `ui-visibility`, poll bật riêng và đều có `staleTime`.

### 10E. Việc còn lại
- [ ] Deploy rồi đối chiếu 10A–10C bằng số request theo route (cùng kịch bản, ≥ 200 request), cập nhật bảng "Trước → Sau" ở 9F.
- [ ] Ứng viên sau (chưa làm): nâng chu kỳ poll lên 180 s nếu 10C cho thấy nặng hơn; cache `badges` theo user ở BE.

---

## Mục 11 — Rà soát code 2026-10-07 (HEAD `708cb1c`): 3 việc nhỏ, rủi ro thấp (bổ sung) — ⏳ CHƯA LÀM

**Bối cảnh:** rà code tìm chỗ còn thừa sau Mục 9–10. **Chưa có số đo prod** cho mục này — mức tiết kiệm ghi dưới đây là ước lượng từ code, phải đo trước/sau như từng mục khác. Cả 3 việc độc lập nhau, mỗi việc 1 commit, ghi `WORKFLOW_LOG.md` sau mỗi việc.

### 11A. `AuditService.logAction()` dùng `save()` → đổi sang `insert()` (BE) — ⏳
- **Bằng chứng trong code:** `backend/src/modules/audit/audit.service.ts:26` gọi `this.auditLogRepository.save(auditLog)`. Có 16 chỗ gọi `logAction(` (không tính spec), **không chỗ nào dùng giá trị trả về**. Log chạy trên mọi thao tác ghi quan trọng nên cộng dồn.
- **Giả thuyết cần xác nhận (CHƯA kiểm chứng):** với MySQL, `save()` của TypeORM thường bọc BEGIN/COMMIT và đọc lại cột có giá trị mặc định (`created_at`) → nhiều round-trip hơn 1 câu `INSERT` duy nhất của `insert()`.
- **Bước 0 — đo trước khi sửa:** bật tạm `logging: ['query']` ở môi trường dev/preview (KHÔNG bật ở prod; hiện prod chỉ `['error','warn']`), gọi 1 thao tác có audit, đếm số câu SQL cho 1 lần `logAction`. Nếu `save()` thật sự chỉ 1 INSERT thì HUỶ mục này.
- **Việc làm:** thay bằng `await this.auditLogRepository.insert({ userId, action, entityType, entityId, oldData, newData, ipAddress, userAgent })`. `created_at` do DB điền (`@CreateDateColumn`). Giữ nguyên chữ ký hàm (trả `Promise<void>` hoặc `InsertResult`; xác nhận lại bằng grep rằng 16 chỗ gọi vẫn không dùng kết quả).
- **Cần kiểm trước khi merge:** (1) `ref-data-change.subscriber.ts` là subscriber duy nhất hiện có — xác nhận nó không lắng nghe `AuditLog`; (2) cột JSON `oldData/newData` nhận object như cũ; (3) hành vi lỗi KHÔNG đổi (vẫn `throw`, các chỗ gọi tự quyết định try/catch).
- **Test:** cập nhật `audit.service.spec.ts` — `logAction` gọi `insert` đúng các trường, KHÔNG gọi `save`.
- **Đo sau:** số câu SQL/lần `logAction` (kỳ vọng → 1) và thời gian các route có audit (`PATCH/POST /customers...`, `POST /auth/login`).
- **Rollback:** khôi phục `create()` + `save()` (giữ `OLD CODE` trong comment theo quy ước).

### 11B. `recharts` import tĩnh ở 9 file → tải khi mở tab (FE) — ⏳
- **Bằng chứng trong code:** `recharts` được import tĩnh ở 9 file: `app/(dashboard)/reports/{MarketingReportTab,RevenueReportTab,UtmQualityReportTab,GroupQualityReportTab,ReportChart}.tsx`, `components/utms/UtmStatsTab.tsx`, `components/periodic-tasks/PerformanceStackedChart.tsx`, `components/customers/InvalidDataStatsTab.tsx`, `app/(dashboard)/duyet-phep/LeaveStatsTab.tsx`. Toàn dự án chỉ có 1 chỗ dùng `next/dynamic` (`CommandPaletteHost.tsx`). Biểu đồ nằm trong tab nên người dùng chưa mở tab vẫn tải cả thư viện.
- **Phạm vi lợi ích:** giảm JS lần đầu và thời gian tải của trang Báo cáo, Duyệt phép, Quản lý UTM, Hiệu suất công việc, Báo cáo dữ liệu lỗi. **Không giảm Fluid CPU của BE.**
- **Việc làm:** bọc bằng `dynamic(() => import(...), { ssr: false, loading: () => <Skeleton/> })` ở **nơi page import tab** (không bọc từng biểu đồ con, để thư viện chỉ tải 1 chunk khi tab mở): `reports/page.tsx` (4 tab) và `reports/ReportSection.tsx` (→ `ReportChart`), `quan-ly-utm/page.tsx`, `hieu-suat-cong-viec/page.tsx`, `customers/reports/invalid-data/page.tsx`, `duyet-phep/page.tsx`.
- **Cần lưu ý:** `lib/guides/demos/task-performance.demos.tsx` cũng import `PerformanceStackedChart` (trang Hướng dẫn) — không để vỡ demo; dùng cùng wrapper dynamic hoặc giữ import tĩnh có chủ đích. Tab mặc định đang mở khi vào trang sẽ hiện skeleton một nhịp ngắn — dùng skeleton cùng chiều cao để tránh nhảy layout.
- **Đo:** `next build` — so kích thước First Load JS của các route trên trước/sau (dán số thật vào `WORKFLOW_LOG.md`); mở tab biểu đồ vẫn hiển thị đúng.
- **Test:** `tsc --noEmit`, `next build`, vitest các test render tab (nếu có) vẫn pass; kiểm tay 5 trang trên trình duyệt (chưa thể tự động hoá).
- **Rollback:** đổi lại `import` tĩnh.

### 11C. `console.error` trong `JwtStrategy` → `Logger` (BE) — ⏳
- **Bằng chứng trong code:** `backend/src/modules/auth/strategies/jwt.strategy.ts` dùng `console.error('[JWT STRATEGY] User not found or inactive:', payload.sub)`, trái quy ước `SKILL_FILE_MANAGEMENT.md` §6.1 (cấm `console.*` ở BE, dùng `Logger`).
- **Việc làm:** khai báo `private readonly logger = new Logger(JwtStrategy.name)` và thay bằng `this.logger.warn(...)`. Chỉ log `payload.sub` (id người dùng) — **KHÔNG log token hay nội dung JWT**. Không đổi luồng ném `UnauthorizedException`.
- **Test:** spec hiện có của auth không đổi hành vi; thêm 1 test nhỏ: user không tồn tại/không active → vẫn `UnauthorizedException` và không gọi `console.error`.
- **Đo:** không cần (sửa quy ước/log).
- **Rollback:** khôi phục `console.error`.

### 11D. Thứ tự & tiêu chí hoàn thành
- [ ] 11C (nhỏ nhất) → 11A (sau Bước 0 đo SQL) → 11B (sau khi chốt cách xử lý demo Hướng dẫn).
- [ ] Mỗi việc: `tsc --noEmit` + test liên quan + build thật; ghi `WORKFLOW_LOG.md`.
- [ ] 11A/11B cập nhật bảng "Trước → Sau" ở Mục 8 khi có số đo.

---

## Mục 8 — Đo lại & chốt

- [ ] Sau mỗi mục (2, 3, 4, 6A, 5, 9): thu log 30 phút, chạy script, **so với baseline Mục 0** theo cùng kịch bản.
- [ ] Sau cùng thu log 1–2 giờ (≥ 200 request), lập bảng "Trước → Sau" cho 6 route đầu và ghi vào `WORKFLOW_LOG.md`.
- [ ] **Tắt `CPU_TIMING=true`** trên Vercel sau khi đo (ghi log cũng tốn CPU).
- [ ] Mục nào không đạt tiêu chí: ghi rõ lý do + quyết định (giữ/revert/làm tiếp).

---

## Phụ lục A — Việc KHÔNG nằm trong plan (đã loại có chủ đích)
- Cache toàn bộ response badges theo user (lệch số liệu sau thao tác).
- `max-age` HTTP dài / version trong URL (rủi ro dữ liệu cũ; lộ chéo theo user).
- Bỏ keep-alive DB (Aiven cắt kết nối rảnh).
- Đổi `synchronize`, sửa migration cũ, đổi `.env` (vi phạm quy tắc an toàn).

## Phụ lục B — Rủi ro tổng hợp & thứ tự rollback
| Mục | Hậu quả nếu sai | Rollback |
|---|---|---|
| 2B | Người dùng bị đăng xuất / phải đăng nhập lại | Revert commit; ghi chú: token `sha256:` đã lưu sẽ không verify bằng bcrypt |
| 2A | Không refresh được ở trình duyệt thiếu Web Locks | Có fallback; revert commit |
| 3B-1 | UI thiếu field đã join | Giữ field cũ; revert commit |
| 4 | Hồ sơ/avatar hiển thị cũ | Revert; hoặc giảm `staleTime` |
| 6A | "Sửa xong không đổi" | Thêm invalidate còn thiếu / giảm `staleTime` |
| 6B | Lộ dữ liệu chéo tài khoản | Tắt persister; xoá `sessionStorage` key |
| 9A | Refresh chủ động sai (đồng hồ lệch/token lạ) → vòng refresh | Giữ lưới 401 cũ; revert commit |
| 9B-1 | Nhãn "X/Z" lệch so với DB | Luôn lấy số từ response BE; revert → invalidate như cũ |
| 9C | Danh sách người dùng cũ sau khi sửa nhân viên | Thêm invalidate còn thiếu / giảm `staleTime` (chỉ còn 2 chỗ đổi) |
| 10A | Máy bỏ qua `Delay` lớn / không nhận lệnh sau này | Đổi lại `Delay=10` (hoặc 600); hệ thống hiện không gửi lệnh nên chưa ảnh hưởng |
| 10B | Lỗi mạng chập chờn hiện lỗi sớm hơn (retry 1 thay vì 2) | `retry: 2` như cũ |
| 10C | `/sidebar/poll` nặng hơn tổng 2 request cũ; FE mới + BE cũ → 404 | Đổi URL về `/notifications/poll` + khôi phục query badges; deploy BE trước FE |
| 9D | Sót `bump` → danh mục cũ trên máy khác tới 2 giờ; `max-age` HTTP làm refetch trả bản cũ | Thêm `bump` còn thiếu / giảm `staleTime` lưới an toàn; revert → `staleTime` 5 phút như cũ (`private, no-cache` giữ nguyên) |
| 11A | Mất bản ghi audit nếu `insert()` lệch cột; subscriber/listener không chạy | Khôi phục `save()`; kiểm `audit_logs` có dòng mới sau thao tác |
| 11B | Biểu đồ nháy skeleton / vỡ demo trang Hướng dẫn | Đổi lại `import` tĩnh |
| 11C | Mất log cảnh báo user không hợp lệ (nếu Logger bị tắt) | Khôi phục `console.error` |
