# AZ-Workbase — Backend (NestJS API)

> API server cho hệ thống quản lý dữ liệu Marketing & Khách hàng AZ-Workbase.
> Xem tài liệu tổng quan toàn dự án (kiến trúc, frontend...) tại [`../README.md`](../README.md).
> Xem quy tắc phân quyền chi tiết tại [`../AZ-Workbase Skills/PERMISSIONS.md`](../AZ-Workbase%20Skills/PERMISSIONS.md).

Stack: **NestJS 11+** · **TypeORM 0.3.x** · **MySQL 8** · **JWT (Passport)** · Deploy dạng **Vercel
Serverless Function** (xem `vercel.json`, `src/main.ts`).

---

## 1. Cài đặt & chạy local

```bash
npm install

# Tạo file .env.development (không commit) với tối thiểu các biến sau:
NODE_ENV=development
PORT=3001
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=root
DB_PASSWORD=your_password
DB_DATABASE=az_workbase
JWT_SECRET=your-jwt-secret
JWT_EXPIRES_IN=1h
JWT_REFRESH_SECRET=your-refresh-secret
JWT_REFRESH_EXPIRES_IN=7d
CORS_ORIGIN=http://localhost:3000

npm run start:dev       # http://localhost:3001, hot reload
# Swagger (API docs tự sinh từ decorator): http://localhost:3001/api/docs
```

### Database Migrations (BẮT BUỘC — không sửa schema DB thủ công)

```bash
npm run migration:show                          # Xem migration nào đã/chưa chạy
npm run migration:run                            # Chạy các migration mới
npm run migration:revert                         # Hoàn tác migration gần nhất
npm run migration:generate --name=TenMigration    # Tự sinh migration từ thay đổi entity (kiểm tra kỹ output trước khi commit)
```

Mọi migration nằm ở `src/database/migrations/`, đặt tên theo timestamp tăng dần
(`<epoch_ms>-MoTaNgan.ts`). Xem `AZ-Workbase Skills/SKILL_DATABASE_MANAGEMENT.md` để biết quy ước chi
tiết (idempotent bằng `hasColumn`/`hasTable`, luôn viết cả `up()` lẫn `down()`...).

### Test

```bash
npm run test          # Unit test (Jest) — chạy TRƯỚC khi commit bất kỳ thay đổi logic nào
npm run test:watch
npm run test:cov
npm run test:e2e
```

Quy ước: mỗi service quan trọng có file `*.service.spec.ts` cạnh nó (mock Repository qua
`getRepositoryToken`), logic phân quyền thuần (không phụ thuộc DB) tách ra `helpers/*.helper.ts` kèm
`*.helper.spec.ts` riêng để test nhanh, không cần mock TypeORM — xem
`modules/customers/helpers/customer-access.helper.spec.ts` và
`modules/link-groups/helpers/link-group-access.helper.spec.ts` làm ví dụ mẫu.

---

## 2. Cấu trúc thư mục

```
backend/src/
├── common/
│   ├── decorators/      # @Roles(), @GetUser()
│   ├── enums/            # Role, AssignmentStatus, ApprovalStatus, AttendanceSource...
│   ├── filters/           # Global exception filter (chuẩn hoá response lỗi)
│   ├── guards/            # JwtAuthGuard, RolesGuard
│   ├── interceptors/       # CacheControlInterceptor (revalidate qua ETag, KHÔNG cache mù cho resource hay đổi)
│   └── utils/              # date-vn.util.ts (giờ Việt Nam, xem lưu ý §4)
├── config/
│   └── database.config.ts  # Cấu hình TypeORM (đọc từ biến môi trường)
├── database/
│   ├── entities/            # ⭐ ĐỌC TRƯỚC khi sửa bất kỳ field nào ở Frontend
│   ├── migrations/          # Toàn bộ thay đổi schema — xem mục 1
│   └── seeds/, import/       # Script seed dữ liệu mẫu, import Excel/CSV marketing data
├── integrations/
│   └── zk-device/            # Giao thức TCP thô của máy chấm công ZKTeco (KHÔNG qua NestJS DI, chạy độc lập)
├── modules/                  # 1 module = 1 domain nghiệp vụ, xem bảng mục 3
├── app.controller.ts          # Landing page tại "/"
└── main.ts                    # Bootstrap: CORS, Swagger, ValidationPipe, cache Express app cho Vercel serverless
```

---

## 3. Danh sách module (`src/modules/`)

| Module | Mô tả | Trạng thái RBAC (xem PERMISSIONS.md) |
|---|---|---|
| `auth/` | Đăng nhập, đăng ký (`register`), JWT access + refresh token rotation, reuse detection | ✅ |
| `users/` | CRUD nhân viên, Profile cá nhân, duyệt/từ chối tài khoản đăng ký mới | ⚠️ §2.2 — hiện `ADMIN`-only cho phần lớn endpoint, cần mở cho Assistant/Manager |
| `customers/` | CRUD khách hàng, Chia Data, Gán/Thu hồi (assignment), ghi chú, Deposit (nạp tiền), import Excel | ✅ §2.1 — đã chuẩn, dùng làm pattern mẫu cho các module khác |
| `departments/` | Quản lý phòng ban — `manager_user_id` dùng làm mốc scope RBAC cho Manager ở mọi module khác | ⚠️🚨 §2.9 — CRUD đang `ADMIN`-only (cần mở `ASSISTANT`); **blocker**: không có endpoint nào để set `manager_user_id`, chỉ sửa được qua DB thủ công |
| `deposits/` | Chỉ có `deposits.module.ts` — logic nạp tiền thực tế nằm trong `customers/` (deposit gắn với 1 customer cụ thể) | — |
| `leave-requests/` | Xin nghỉ phép, duyệt chéo phòng ban theo `RolePriority` (không dùng `@Roles`) | ⚠️ §2.6 — cần xác nhận lại rule duyệt |
| `link-groups/` | Category/Group liên kết (Zalo/FB/Threads...), checklist khách hàng đã-join, **Quản lý chính/phụ theo từng Group** (mô hình quyền riêng) | 🟦 §2.4 — phần CRUD chung ⚠️, phần Quản lý chính/phụ đã đúng thiết kế |
| `media-sources/` | Danh mục "Nguồn" (Facebook/TikTok/Google...) cho form khách hàng | ⚠️ §2.5 |
| `zk-device/` | Đồng bộ chấm công: kéo chủ động qua TCP (`zk-device.controller.ts`), nhận đẩy tự động từ máy (`adms.controller.ts`, giao thức ADMS Push — máy gọi thẳng, KHÔNG qua JWT), cron đồng bộ định kỳ (`zk-device-cron.controller.ts`) | ⚠️ §2.3 |
| `audit/` | Nhật ký audit log (ai làm gì, khi nào) | ⚠️ §2.7 — cần xác nhận Assistant có nên xem được không |

---

## 4. Các quy ước quan trọng cần biết trước khi sửa code

- **Giờ Việt Nam (GMT+7) lưu "nguyên văn", KHÔNG quy đổi UTC.** `record_time` (chấm công) và các cột
  ngày-giờ liên quan lưu đúng 6 con số local (năm/tháng/ngày/giờ/phút/giây) đọc trực tiếp từ nguồn (máy
  chấm công hoặc giờ hệ thống VN), bất kể server chạy múi giờ gì. Lý do: `node-zklib` giải mã giờ bằng
  `new Date(y,m,d,h,mi,s)` — phụ thuộc múi giờ TIẾN TRÌNH đang chạy, gây lệch giờ nếu quy đổi UTC trên
  server không đặt GMT+7 (bug đã xảy ra thật, xem `integrations/zk-device/decode-device-time.util.ts` để
  hiểu chi tiết + cách vá).
- **Đọc log chấm công lớn qua WAN phải TUẦN TỰ, không bắn hết chunk cùng lúc** —
  `integrations/zk-device/sequential-attendance-reader.util.ts` thay thế `zk.getAttendances()` gốc của
  `node-zklib` (bắn hết request đồng thời, dễ rớt gói/timeout qua kết nối chậm) bằng cách xin từng
  chunk, có retry riêng cho từng chunk. Có bộ test giả lập giao thức thật ở
  `integrations/zk-device/__tests__/` — chạy `npm test -- sequential-attendance-reader` trước khi sửa
  gì liên quan tới đọc log chấm công.
- **Cache-Control cho resource hay bị sửa dùng `no-cache` (revalidate qua ETag), KHÔNG dùng `max-age`
  mù.** Xem `common/interceptors/cache-control.interceptor.ts` — từng có bug data mới sửa không hiện
  trên UI cho tới khi hard-refresh, do cache `max-age=30` phục vụ response cũ dù đã sửa xong.
- **`Cannot update entity because entity id is not set`** khi bulk-insert kèm `.orIgnore()` — TypeORM cố
  refetch giá trị cột generated (`@CreateDateColumn`...) sau insert, vỡ khi có row bị ignore do trùng
  key (MySQL không trả insertId liên tục). Luôn thêm `.updateEntity(false)` vào
  `createQueryBuilder().insert()...` khi dùng kèm `.orIgnore()` cho bulk insert — xem
  `zk-device.service.ts` (`syncNow()`, `ingestPushAttendance()`) làm ví dụ.
- **RBAC**: đọc `AZ-Workbase Skills/PERMISSIONS.md` TRƯỚC khi thêm bất kỳ `@Roles()` mới nào — không tự
  suy đoán rule, không copy decorator từ module khác nếu chưa xác nhận module đó đã khớp rule hiện hành.

---

## 5. Deploy

Deploy dạng Vercel Serverless Function (xem `vercel.json`, `src/main.ts` — Express app được cache theo
container để tránh cold start lặp lại DI container mỗi request). Đường dẫn ADMS Push (`/iclock/cdata`)
KHÔNG có prefix `/api` vì máy chấm công gọi cứng đường dẫn gốc, không cấu hình được prefix.

Biến môi trường production cần thêm (ngoài các biến local ở mục 1): `VERCEL_URL`, `FRONTEND_URL` (CORS
whitelist động).