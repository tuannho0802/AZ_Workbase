# 📸 PLAN: Avatar User (self-set) + Ảnh đính kèm Nghỉ phép qua Backblaze B2

**Version:** 2.0.0 | **Ngày cập nhật:** 2026-09-08 | **Status:** 📋 Planning — CHƯA triển khai |
**Author:** AI Agent (theo yêu cầu chủ dự án qua chat) | **File liên quan bắt buộc đọc trước khi code:**
[`PERMISSIONS.md`](./PERMISSIONS.md) · [`SKILL_DATABASE_MANAGEMENT.md`](./SKILL_DATABASE_MANAGEMENT.md) ·
[`SKILL_NESTJS_BACKEND.md`](./SKILL_NESTJS_BACKEND.md) · [`SKILL_NEXTJS_FRONTEND.md`](./SKILL_NEXTJS_FRONTEND.md)

> ⚠️ **Đây là bản thay thế file `PLAN_AVATAR_LEAVE_ATTACHMENT_CLOUDFLARE_R2.md` (v1.0.0).** Provider đổi
> từ Cloudflare R2 sang **Backblaze B2** vì R2 bắt nhập thẻ tín dụng ngay từ lúc tạo tài khoản — rủi ro
> chủ dự án muốn tránh. Kiến trúc tổng thể (presigned URL, 2 bucket tách vai trò) giữ nguyên tinh thần,
> nhưng có 1 thay đổi quan trọng: **cả 2 bucket đều Private** (B2 tính phí kích hoạt bucket Public $1 +
> yêu cầu thẻ nếu tài khoản chưa có payment history) — xem quyết định kiến trúc mục 0.
>
> Tài liệu này là **PLAN** (chưa phải code thật). Khi bắt đầu triển khai, agent phải đọc lại file này +
> đọc code thật hiện tại (theo đúng rule ở `README.md` gốc — không tin trạng thái cũ quá 30 phút) vì có
> thể đã có phiên khác code trước một phần.

---

## 0. Bối cảnh & Quyết định kiến trúc đã chốt

Đã verify THẬT (không suy đoán) trước khi viết plan này:

| Việc đã verify | Kết quả |
|---|---|
| `leave_requests.attachment_url` (varchar 500) | ✅ **Đã tồn tại từ migration `AddLeaveSystem`**, DTO backend đã nhận `dto.attachmentUrl`, nhưng **Frontend chưa có UI** — không cần migration mới cho cột này |
| Multer (`FileInterceptor`) | ✅ Đã dùng sẵn ở `customers.controller.ts` (import Excel) — pattern quen thuộc trong repo, KHÔNG dùng cho luồng này (xem lý do ở mục 2) |
| Pattern permission "tự sửa của mình" | ✅ Đã có sẵn (`profile.edit_info`, `profile.edit_email`, `profile.change_password` — seed mặc định scope `own`) — Avatar sẽ nhân bản đúng pattern này |
| `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` | ✅ Cài + `tsc --noEmit` + `nest build` **pass sạch** trong đúng setup TypeScript/NestJS của repo (verify khi còn dùng R2, SDK không đổi khi chuyển sang B2 vì cùng chuẩn S3-compatible) |
| Backend deploy Serverless trên Vercel | ⚠️ **Giới hạn CỨNG 4.5MB/request body** ở tầng nền tảng (AWS Lambda) — không thể tăng bằng cấu hình NestJS |
| Filesystem của Vercel Serverless | ⚠️ Ephemeral/read-only ngoài `/tmp` — **không thể lưu ảnh vào ổ đĩa local**, bắt buộc dùng object storage ngoài |
| **Cloudflare R2 — ĐÃ LOẠI** | ❌ Bắt nhập thẻ tín dụng ngay lúc tạo tài khoản (dù free tier không tính phí) — chủ dự án từng bị AWS tự đóng tài khoản sau 6 tháng free plan, không muốn lặp lại rủi ro gắn thẻ vào dịch vụ cloud nữa |
| **Backblaze B2 — bucket Public** | ⚠️ Đã thử tạo bucket Public thật trên B2 console → UI bắt nhập **thẻ tín dụng** ("payment history required, hoặc trả $1 một lần") mới cho phép bật Public. **Quyết định: KHÔNG dùng Public cho bucket nào cả** — xem hệ quả kiến trúc ngay dưới đây. |
| Bucket thật đã tạo trên B2 console | ✅ `az-imgs-avatars-workbase` (Private) và `az-imgs-leave-request-workbase` (Private), cùng endpoint `s3.us-west-004.backblazeb2.com`, Encryption Disabled, Object Lock Disabled |
| CORS Rules qua UI B2 | ⚠️ UI console chỉ cho chọn preset (share với mọi origin / 1 origin cố định / không share) — **KHÔNG có ô dán JSON rule tuỳ chỉnh nhiều origin + nhiều operation trên UI**. Muốn set rule multi-origin + đúng operation `s3_put`/`s3_get` bắt buộc dùng **B2 CLI** (`b2 bucket update --cors-rules`). |
| `frontend/next.config.js` | ⚠️ Chưa có `images.remotePatterns` — cần thêm hostname B2 nếu dùng `next/image`, nhưng xem lưu ý mục 6.1 (URL presigned đổi mỗi lần ký → giảm lợi ích cache của `next/image`) |

**Quyết định kiến trúc:**

1. **Upload thẳng từ trình duyệt lên B2 bằng Presigned URL (chuẩn S3) — KHÔNG đẩy file qua NestJS
   backend.** Né được giới hạn 4.5MB, không tốn thời gian chạy Lambda cho việc truyền file, đúng khuyến
   nghị chính thức của Vercel cho bài toán "upload file lớn trên serverless". B2 hỗ trợ đầy đủ chuẩn
   Presigned PUT/GET qua S3-compatible API — code dùng `@aws-sdk/client-s3` giữ nguyên 100%, chỉ đổi
   `endpoint`/`region`/`credentials`.

2. **Dùng 2 bucket B2 riêng biệt, NHƯNG cả 2 đều Private** (khác với plan R2 cũ vốn định để bucket
   avatar Public):
   - `az-imgs-avatars-workbase` — **Private**. Vì không bật Public được nếu không nhập thẻ, avatar sẽ
     hiển thị qua **Presigned GET URL** giống hệt cơ chế của ảnh đính kèm nghỉ phép, chỉ khác **TTL dài
     hơn nhiều** (khuyến nghị 1 giờ thay vì 10 phút) vì avatar không nhạy cảm và được xin ký lại tự động
     mỗi lần API trả về thông tin user (xem mục 5.4a).
   - `az-imgs-leave-request-workbase` — **Private**, chỉ truy cập qua **Presigned GET URL** do backend
     cấp SAU khi kiểm tra permission (`leave_requests.view`/`leave_requests.request` theo đúng scope).
     Lý do: ảnh đính kèm nghỉ phép có thể là giấy khám bệnh — **dữ liệu sức khoẻ nhạy cảm**, không được
     public. TTL ngắn (10 phút), ký on-demand khi người dùng bấm "Xem ảnh".

3. **Hệ quả quan trọng của việc bỏ Public:** cột `avatar_url` trong DB **đổi bản chất giống
   `attachment_url`** — lưu **object key** (vd `avatars/12/a1b2c3.webp`), KHÔNG lưu URL trực tiếp. Mọi
   endpoint trả về thông tin user cho FE (`GET /users`, `GET /users/me`, `GET /users/:id`, và bất kỳ
   chỗ nào serialize object `User` có avatar) phải tự ký lại thành Presigned GET URL trước khi trả về —
   xem helper dùng chung ở mục 5.4a. Đây là điểm khác biệt lớn nhất so với plan R2 gốc (v1.0.0), agent
   triển khai cần đọc kỹ mục này trước khi code.

---

## 1. Phạm vi (Scope)

1. **Avatar User** — nhân viên tự upload ảnh đại diện. Có phân quyền qua Dynamic RBAC
   (permission mới `profile.edit_avatar`), mặc định **scope `own`** cho cả 4 role — khớp yêu cầu
   "mặc định chỉ của mình cho Employee", đồng thời Admin vẫn có thể mở rộng scope sau qua `/phan-quyen`
   nếu sau này muốn cho Admin/Manager set avatar hộ người khác (KHÔNG làm trong phase 1).
2. **Ảnh đính kèm Nghỉ phép** — tái dùng cột `attachment_url` có sẵn, build luồng upload + hiển thị ở
   FE (`nghi-phep/page.tsx` khi tạo đơn, `duyet-phep/page.tsx` khi xem để duyệt). Gate bằng permission
   **đã có sẵn** `leave_requests.request` (tạo/sửa đơn của mình) — không cần permission mới.

**KHÔNG nằm trong phạm vi phase 1** (ghi rõ để tránh scope creep khi triển khai):
- Resize/nén ảnh phía server (dùng resize phía client bằng `<canvas>` — xem mục 6.3, tránh phụ thuộc
  `sharp` vốn có native binary dễ gây rắc rối khi bundle lên Vercel serverless).
- Cho Admin/Manager set avatar hộ người khác.
- Custom domain / CDN riêng cho B2 — dùng thẳng endpoint `s3.us-west-004.backblazeb2.com` qua presigned
  URL, không cần domain riêng vì không có bucket nào Public.

---

## 2. Kiến trúc tổng thể (luồng xử lý)

### 2.1 Luồng Avatar (bucket Private — khác plan R2 cũ)

```
[Browser]                         [NestJS Backend]                    [Backblaze B2 - avatars]
   │  1. POST /uploads/avatar/presign                                          │
   │     (Content-Type: image/webp)                                            │
   ├──────────────────────────────►│                                           │
   │                                │ 2. Check permission profile.edit_avatar  │
   │                                │    (luôn tự động = chính user gọi)       │
   │                                │ 3. Sinh key: avatars/{userId}/{uuid}.webp│
   │                                │ 4. getSignedUrl(PutObjectCommand)        │
   │  5. { uploadUrl, key }         │───────────────────────────────────────►  │
   │◄───────────────────────────────                                          │
   │                                                                           │
   │  6. PUT file trực tiếp lên uploadUrl (KHÔNG qua NestJS)                   │
   ├───────────────────────────────────────────────────────────────────────► │
   │  7. 200 OK từ B2                                                         │
   │◄─────────────────────────────────────────────────────────────────────── │
   │                                │                                           │
   │  8. PATCH /users/me/avatar    │                                           │
   │     { key }                   │                                           │
   ├──────────────────────────────►│ 9. Lưu avatar_url = key vào DB           │
   │                                │ 10. (optional) Xoá key avatar CŨ trên B2 │
   │                                │ 11. Ký Presigned GET (TTL 1h) cho key mới│
   │  12. 200 OK + user.avatarUrl  │────────────────────────────────────────► │
   │      (= presigned GET URL)    │                                           │
   │◄───────────────────────────────                                          │
   │                                                                           │
   │  ── Mỗi lần load lại trang cần hiển thị avatar (bảng NV, sidebar...) ──  │
   │  13. GET /users, /users/me, /users/:id                                   │
   ├──────────────────────────────►│ 14. Đọc key từ DB → ký lại GET (TTL 1h)  │
   │  15. { ...user, avatarUrl:    │────────────────────────────────────────► │
   │        presignedGetUrl }      │                                           │
   │◄───────────────────────────────                                          │
```

### 2.2 Luồng ảnh đính kèm Nghỉ phép (bucket Private, TTL ngắn hơn)

```
[Browser]                         [NestJS Backend]                    [Backblaze B2 - leave-request]
   │ 1. POST /leave-requests/attachments/presign                              │
   │    (khi đang điền form tạo đơn, CHƯA có leaveRequestId)                  │
   ├──────────────────────────────►│                                          │
   │                                │ 2. Check permission leave_requests.request│
   │                                │ 3. Key: leave-attachments/{userId}/{uuid}.jpg│
   │  4. { uploadUrl, key }         │──────────────────────────────────────► │
   │◄───────────────────────────────                                          │
   │ 5. PUT file thẳng lên B2 (private, không public URL)                     │
   ├───────────────────────────────────────────────────────────────────────► │
   │ 6. POST /leave-requests { ...form, attachmentKey: key }                  │
   ├──────────────────────────────►│ 7. Lưu attachment_url = key (KHÔNG lưu   │
   │                                │    presigned URL — URL hết hạn theo TTL)│
   │                                                                          │
   │  ── Khi cần XEM lại (duyệt-phep) ──                                      │
   │ 8. GET /leave-requests/:id/attachment-url                                │
   ├──────────────────────────────►│ 9. Check permission leave_requests.view/ │
   │                                │    approve (đúng scope), rồi mới ký GET  │
   │  10. { viewUrl, expiresIn }    │────────────────────────────────────────►│
   │◄───────────────────────────────                                          │
```

⚠️ **Điểm khác biệt quan trọng:** cả cột `avatar_url` (users) và `attachment_url` (leave_requests) giờ
đều lưu **object key**, KHÔNG lưu URL đầy đủ (vì presigned URL có `expiresIn`, hết hạn là vỡ link). Tên
cột giữ nguyên (không đổi tên tránh phải sửa nhiều chỗ), nhưng bản chất giá trị lưu trong đó là **key**
— cần ghi rõ comment này trong entity khi sửa. Khác biệt duy nhất giữa 2 luồng là **TTL** và **thời điểm
ký**: avatar ký lại tự động mỗi lần trả user object (TTL dài, không cần route riêng để "xem"), attachment
ký on-demand qua 1 route riêng khi người dùng chủ động bấm xem (TTL ngắn).

---

## 3. Database changes

### 3.1 Migration mới — thêm cột avatar cho `users`

> ⚠️ Theo `SKILL_DATABASE_MANAGEMENT.md` mục 5: **luôn `ls src/database/migrations | sort | tail`
> để lấy timestamp lớn nhất THẬT TẠI THỜI ĐIỂM CODE** (không dùng số cứng dưới đây nếu đã có người khác
> thêm migration mới hơn). Tại thời điểm viết plan này, migration mới nhất là
> `1779700000000-AddUserSoftDeleteAndProfilePermissions.ts` → dùng timestamp `1779800000000` trở lên.

```typescript
// backend/src/database/migrations/1779800000000-AddAvatarUrlToUsers.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAvatarUrlToUsers1779800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500) NULL
      COMMENT 'Object KEY (không phải URL đầy đủ) trên Backblaze B2, bucket az-imgs-avatars-workbase (Private) — luôn ký lại thành Presigned GET URL trước khi trả về FE';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users DROP COLUMN avatar_url;`);
  }
}
```

Entity `user.entity.ts` thêm:
```typescript
// Lưu Ý: cột này lưu OBJECT KEY trên B2 (bucket az-imgs-avatars-workbase, Private),
// KHÔNG PHẢI URL. Phải qua UsersService.signAvatarUrl() để có URL hiển thị được — xem mục 5.4a.
@Column({ name: 'avatar_url', type: 'varchar', length: 500, nullable: true })
avatarUrl: string | null;
```

### 3.2 `leave_requests.attachment_url` — KHÔNG cần migration

Cột đã tồn tại. Chỉ cần sửa comment trong entity cho đúng bản chất mới (lưu key, không phải URL đầy đủ,
provider B2 thay vì R2) và thêm helper build lại URL khi trả về cho FE (xem mục 5.6).

### 3.3 Permission mới — seed trong CÙNG migration hoặc file riêng

Theo đúng khuôn `1779700000000-AddUserSoftDeleteAndProfilePermissions.ts` (bảng `permissions` +
`role_permissions`):

```typescript
// Gộp vào cùng file 1779800000000-AddAvatarUrlToUsers.ts, hoặc tách file riêng
// 1779800000001-AddProfileEditAvatarPermission.ts (khuyến nghị TÁCH — 1 migration 1 mục đích,
// đúng tinh thần "fix-forward" của SKILL_DATABASE_MANAGEMENT.md).

await queryRunner.query(`
  INSERT INTO permissions (\`key\`, resource, action, supports_scope, description) VALUES
  ('profile.edit_avatar', 'profile', 'edit_avatar', TRUE, 'Tự đổi ảnh đại diện của chính mình')
`);

await queryRunner.query(`
  INSERT INTO role_permissions (role_id, permission_id, scope)
  SELECT r.id, p.id, 'own'
  FROM roles r, permissions p
  WHERE p.key = 'profile.edit_avatar'
    AND r.code IN ('admin', 'assistant', 'manager', 'employee');
`);
```

`down()` tương ứng: `DELETE FROM permissions WHERE \`key\` = 'profile.edit_avatar'` (role_permissions tự
xoá theo do FK — kiểm tra `ON DELETE CASCADE` của bảng `role_permissions`, nếu không có thì `DELETE`
tường minh trước).

**Cập nhật bảng permission catalogue trong `PERMISSIONS.md` mục 1.7** — thêm dòng
`profile.edit_avatar | profile | Tự đổi ảnh đại diện` — đây là **nguồn chân lý duy nhất**, PHẢI cập nhật
mỗi khi thêm permission mới, không được bỏ qua.

---

## 4. Backblaze B2 — đã chuẩn bị (chi tiết từng bước ở mục 9)

- 1 tài khoản Backblaze (miễn phí, **không cần thẻ tín dụng** — đã verify thật).
- 2 bucket đã tạo thật trên console, cả 2 **Private**:
  - `az-imgs-avatars-workbase`
  - `az-imgs-leave-request-workbase`
  - Cả 2 cùng endpoint: `s3.us-west-004.backblazeb2.com`, Encryption Disabled, Object Lock Disabled.
- ⏳ **Còn thiếu (chưa làm xong tại thời điểm viết plan này):**
  - Application Key (Read & Write, scope đúng 2 bucket trên — KHÔNG dùng Master Application Key).
  - CORS Rules cho cả 2 bucket — **phải làm qua B2 CLI**, UI console không hỗ trợ JSON rule tuỳ chỉnh
    nhiều origin. Rule cần: `allowedOperations: ["s3_put", "s3_get", "s3_head"]`,
    `allowedOrigins: ["https://azworkbase.com", "http://localhost:3000"]`.
- Lấy: `keyID`, `applicationKey` (secret, chỉ hiện 1 lần), `bucketId` mỗi bucket, `Endpoint`.

---

## 5. Backend changes

### 5.1 Env vars mới (thêm vào `.env.development.example` + Vercel dashboard)

```bash
# Backblaze B2 (S3-compatible)
B2_ENDPOINT=https://s3.us-west-004.backblazeb2.com
B2_REGION=us-west-004
B2_ACCESS_KEY_ID=your_key_id
B2_SECRET_ACCESS_KEY=your_application_key
B2_BUCKET_AVATARS=az-imgs-avatars-workbase
B2_BUCKET_LEAVE_ATTACHMENTS=az-imgs-leave-request-workbase
```

⚠️ Theo `SKILL_FILE_MANAGEMENT.md` mục 3.1: **KHÔNG tự ý sửa `.env.development`/`.env.production` thật**
— chỉ thêm dòng mẫu vào `.env.development.example`, người dùng tự điền giá trị thật + tự set trên Vercel
dashboard.

### 5.2 Package cần cài

```bash
cd backend
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

*(Không đổi so với plan R2 — B2 dùng chung chuẩn S3-compatible API, cùng 1 SDK, đã verify build sạch.)*

### 5.3 Module mới `uploads` (`backend/src/modules/uploads/`)

```
uploads/
├── uploads.module.ts
├── uploads.controller.ts
├── uploads.service.ts        # wrap S3Client, tạo presigned PUT/GET, xoá object
└── dto/
    ├── presign-avatar.dto.ts       # { contentType: string }
    └── presign-attachment.dto.ts   # { contentType: string }
```

`uploads.service.ts` — logic cốt lõi:
```typescript
@Injectable()
export class UploadsService {
  private readonly s3 = new S3Client({
    region: process.env.B2_REGION,
    endpoint: process.env.B2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.B2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.B2_SECRET_ACCESS_KEY!,
    },
  });

  private readonly ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

  async presignAvatarUpload(userId: number, contentType: string) {
    if (!this.ALLOWED_TYPES.includes(contentType)) {
      throw new BadRequestException('Chỉ chấp nhận JPEG/PNG/WEBP');
    }
    const ext = contentType.split('/')[1];
    const key = `avatars/${userId}/${randomUUID()}.${ext}`;
    const uploadUrl = await getSignedUrl(
      this.s3,
      new PutObjectCommand({ Bucket: process.env.B2_BUCKET_AVATARS, Key: key, ContentType: contentType }),
      { expiresIn: 300 }, // 5 phút để upload
    );
    return { uploadUrl, key }; // KHÔNG có publicUrl nữa — bucket Private
  }

  async presignAttachmentUpload(userId: number, contentType: string) {
    // Tương tự nhưng dùng B2_BUCKET_LEAVE_ATTACHMENTS
  }

  /** Dùng cho CẢ avatar (TTL dài) lẫn attachment (TTL ngắn) — truyền bucket + ttl khác nhau */
  async signGetUrl(bucket: string, key: string, expiresIn: number) {
    return getSignedUrl(
      this.s3,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn },
    );
  }

  async deleteAvatar(key: string) {
    await this.s3.send(new DeleteObjectCommand({ Bucket: process.env.B2_BUCKET_AVATARS, Key: key }));
  }
}
```

`uploads.controller.ts`:
```typescript
@Controller('uploads')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class UploadsController {
  @Post('avatar/presign')
  @RequirePermission('profile.edit_avatar')
  presignAvatar(@Body() dto: PresignAvatarDto, @Request() req) {
    return this.uploadsService.presignAvatarUpload(req.user.id, dto.contentType);
  }
}
```
*(Endpoint presign cho attachment nghỉ phép đặt trong `leave-requests.controller.ts` luôn — xem 5.6 —
vì cần check ownership của đơn, không thuộc về module uploads chung chung.)*

### 5.4 Sửa `users.controller.ts` + `users.service.ts` — endpoint xác nhận avatar

```typescript
// users.controller.ts
@Patch('me/avatar')
@RequirePermission('profile.edit_avatar')
async updateOwnAvatar(@Body() dto: UpdateOwnAvatarDto, @Request() req) {
  return this.usersService.updateOwnAvatar(req.user.id, dto.key);
}
```

```typescript
// users.service.ts
async updateOwnAvatar(userId: number, newKey: string) {
  const user = await this.findRawById(userId); // KHÔNG qua signAvatarUrl() ở bước này
  const oldKey = user.avatarUrl; // vẫn là key cũ, chưa ký
  await this.usersRepository.update(userId, { avatarUrl: newKey });
  if (oldKey) {
    // best-effort, không throw nếu lỗi xoá object cũ — không chặn luồng chính
    this.uploadsService.deleteAvatar(oldKey).catch(err =>
      this.logger.warn(`Không xoá được avatar cũ: ${oldKey}`, err),
    );
  }
  return this.findOne(userId); // findOne() PHẢI tự ký lại avatarUrl trước khi trả về — xem 5.4a
}
```

### 5.4a Helper ký lại avatar URL — BẮT BUỘC dùng chung, không copy-paste logic ký

> Đây là phần **KHÁC BIỆT LỚN NHẤT** so với plan R2 cũ (v1.0.0) — vì bucket avatar giờ Private, avatar
> không còn là 1 URL tĩnh lưu sẵn trong DB nữa mà phải ký lại **mỗi lần trả response**.

```typescript
// users.service.ts (hoặc tách UploadsService.signAvatarUrl() rồi inject vào UsersService)
private readonly AVATAR_GET_TTL = 3600; // 1 giờ — avatar không nhạy cảm, TTL dài để giảm số lần ký

async signAvatarUrl(user: User): Promise<User> {
  if (!user.avatarUrl) return user;
  const signedUrl = await this.uploadsService.signGetUrl(
    process.env.B2_BUCKET_AVATARS!,
    user.avatarUrl, // đây là KEY, không phải URL
    this.AVATAR_GET_TTL,
  );
  return { ...user, avatarUrl: signedUrl }; // override tạm cho response, KHÔNG ghi đè lại xuống DB
}
```

**Bắt buộc gọi `signAvatarUrl()` (hoặc map hàng loạt cho danh sách) ở TẤT CẢ các chỗ sau trước khi trả
JSON cho FE** — đây là checklist agent triển khai phải rà từng cái, thiếu 1 chỗ là avatar vỡ ở đúng màn
hình đó:
- `GET /users/me` (`AuthController.getMe` hoặc `UsersController.findMe`)
- `GET /users/:id`
- `GET /users` (danh sách nhân viên — cần map cả mảng `data.map(u => signAvatarUrl(u))`, dùng
  `Promise.all` để ký song song, không await tuần tự từng user)
- Bất kỳ endpoint nào khác eager-load relation `User` và trả `avatarUrl` ra ngoài (vd nếu sau này
  `customers.salesUser`/`createdByUser` có hiển thị avatar ở FE — hiện tại theo scope phase 1 CHƯA có,
  nhưng agent cần tự kiểm tra lại nếu FE sau này thêm avatar vào các bảng khác).

*(Ký presigned URL bằng SDK là tính toán cục bộ (HMAC) bằng secret key có sẵn trong RAM backend — KHÔNG
tốn network call tới B2, nên gọi ký hàng loạt cho cả trang danh sách 50 user không ảnh hưởng hiệu năng
hay quota API B2.)*

### 5.5 DTO mới

```typescript
// dto/presign-avatar.dto.ts
export class PresignAvatarDto {
  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  contentType: string;
}

// dto/update-own-avatar.dto.ts
export class UpdateOwnAvatarDto {
  @IsString()
  key: string; // object key vừa PUT lên B2, KHÔNG còn nhận avatarUrl (không có URL public nữa)
}
```

### 5.6 Sửa `leave-requests` module

- `LeaveRequestsController` thêm 2 route:
  ```typescript
  @Post('attachments/presign')
  @RequirePermission('leave_requests.request')
  presignAttachment(@Body() dto: PresignAttachmentDto, @Request() req) {
    return this.uploadsService.presignAttachmentUpload(req.user.id, dto.contentType);
  }

  @Get(':id/attachment-url')
  @RequirePermission('leave_requests.view') // hoặc leave_requests.request nếu là chính chủ — xem note dưới
  async getAttachmentUrl(@Param('id') id: string, @Request() req, @GetPermissionScope() scope?: string) {
    return this.leaveRequestsService.getAttachmentViewUrl(+id, req.user.id, req.user.role, scope);
  }
  ```
  ⚠️ **Cần quyết định lúc code thật:** route `GET :id/attachment-url` phải cho phép CẢ người tạo đơn
  (dù họ chỉ có `leave_requests.request`, không có `leave_requests.view`) xem lại ảnh của chính đơn mình
  — giống pattern `findOne()`/`update()` của `CustomerAccessHelper` (mục 2 PERMISSIONS.md): 1 hàm gác
  cổng chung kiểm tra "là chủ đơn HOẶC có quyền view/approve theo đúng scope", không phải chỉ check 1
  permission tĩnh.

- `LeaveRequestsService.getAttachmentViewUrl()`: load record, kiểm tra
  `record.requesterId === userId || <có quyền view/approve theo scope>`, nếu không → `ForbiddenException`,
  nếu có → gọi `uploadsService.signGetUrl(process.env.B2_BUCKET_LEAVE_ATTACHMENTS, record.attachmentUrl,
  600)` (10 phút, nhớ: cột này lưu **key**).

- `create()` DTO thêm field nhận key vừa upload (giữ tên `attachmentUrl` cho khỏi vỡ contract cũ, giá trị
  truyền vào là key).

### 5.7 Validate & giới hạn kích thước

Presigned PUT URL kiểu đơn giản (`PutObjectCommand` + `getSignedUrl`) **không tự chặn được dung lượng
file** ở tầng B2 — muốn ép cứng giới hạn size ở tầng storage phải dùng **Presigned POST Policy**
(`createPresignedPost` từ `@aws-sdk/s3-presigned-post`, phức tạp hơn, cần verify riêng B2 hỗ trợ đủ field
Policy hay không — B2 tương thích S3 nhưng không 1:1 100%). **Phase 1: chấp nhận rủi ro nhỏ này**, chặn
chủ yếu ở client (resize + validate trước khi xin presign) + validate `Content-Type` ở backend (đã làm ở
5.3). Nếu sau này cần chặn cứng dung lượng ở server, nâng cấp sang Presigned POST ở phase 2 — ghi lại
thành TODO trong code, không block phase 1.

---

## 6. Frontend changes

### 6.1 `next.config.js` — cân nhắc trước khi dùng `next/image`

```javascript
images: {
  remotePatterns: [
    { protocol: 'https', hostname: 's3.us-west-004.backblazeb2.com' },
  ],
},
```

⚠️ **Lưu ý khác biệt so với plan R2 cũ:** trước đây avatar là URL public tĩnh (cache tốt với
`next/image`). Giờ avatar là **Presigned GET URL đổi query string mỗi lần backend ký lại** (mỗi lần gọi
`GET /users...`) → `next/image` sẽ coi mỗi URL là ảnh khác nhau, cache tối ưu hoá gần như vô dụng, tốn
quota Image Optimization của Vercel một cách không cần thiết. **Khuyến nghị: dùng thẳng `<img src=...>`
thường cho avatar, KHÔNG qua `next/image`**, vì kích thước avatar (resize client-side còn ~512×512) vốn
đã nhỏ, không cần tối ưu hoá thêm ở tầng Next.js.

### 6.2 API client mới `lib/api/uploads.api.ts`

```typescript
export const uploadsApi = {
  presignAvatar: async (contentType: string) => {
    const { data } = await axiosInstance.post('/uploads/avatar/presign', { contentType });
    return data as { uploadUrl: string; key: string }; // không còn publicUrl
  },
  uploadToPresignedUrl: async (uploadUrl: string, file: File) => {
    // Dùng axios "trần" (KHÔNG qua axiosInstance) - không cần gắn JWT, đây là request thẳng tới B2
    await axios.put(uploadUrl, file, { headers: { 'Content-Type': file.type } });
  },
};
```

### 6.3 UI Avatar ở `profile/page.tsx`

- Dùng `antd Upload` với `customRequest` tự viết (KHÔNG dùng `action` mặc định của antd Upload vì luồng
  là 2 bước: xin presign → PUT thẳng → confirm), hoặc đơn giản hơn: `<input type="file">` ẩn + xử lý
  bằng tay, dễ kiểm soát luồng 3 bước hơn `antd Upload`.
- **Resize phía client bằng `<canvas>` trước khi upload** (khuyến nghị max 512×512, giữ tỉ lệ, export
  `image/webp` quality ~0.85) — giảm dung lượng, tránh phụ thuộc `sharp` ở backend (native binary dễ vỡ
  khi bundle Vercel serverless).
- Chỉ hiện nút đổi avatar khi `can('profile.edit_avatar')` (hook `useMyPermissions`).
- Sau khi confirm thành công → response `PATCH /users/me/avatar` trả về `user.avatarUrl` **đã là
  presigned GET URL** (backend tự ký, xem 5.4a) → cập nhật thẳng vào `useAuthStore` để avatar ở sidebar
  (`layout.tsx`) đổi ngay không cần F5.

### 6.4 UI ảnh đính kèm ở `nghi-phep/page.tsx` + `duyet-phep/page.tsx`

- Form tạo đơn nghỉ phép: thêm field upload ảnh optional (giấy khám bệnh...), luồng giống avatar nhưng
  gọi `leaveRequestsApi.presignAttachment()`, lưu `key` tạm trong state form, gửi kèm khi submit `POST
  /leave-requests`.
- Trang duyệt phép (`duyet-phep/page.tsx`): nếu đơn có `attachmentUrl` (key) → hiện nút "Xem ảnh đính
  kèm", bấm vào mới gọi `GET /leave-requests/:id/attachment-url` lấy presigned GET URL rồi mở
  (KHÔNG fetch trước hàng loạt cho cả danh sách — tốn quota gọi API + presigned URL có TTL ngắn).

---

## 7. Bảo mật — checklist bắt buộc trước khi merge

- [ ] Content-Type whitelist ở CẢ presign avatar lẫn presign attachment (chỉ `image/jpeg|png|webp`).
- [ ] Bucket `az-imgs-leave-request-workbase` **giữ nguyên Private**, không được đổi sang Public dù
      UI có gợi ý — dữ liệu sức khoẻ nhạy cảm chỉ truy cập qua presigned GET có kiểm tra quyền.
- [ ] Bucket `az-imgs-avatars-workbase` cũng **giữ Private** (quyết định đã chốt mục 0) — không cần
      bật Public dù avatar không nhạy cảm, tránh phải nhập thẻ.
- [ ] Route `GET :id/attachment-url` PHẢI qua 1 hàm gác cổng chung (chủ đơn HOẶC đúng scope
      view/approve) — không phải chỉ 1 `@RequirePermission` tĩnh (xem mục 5.6).
- [ ] Application Key B2 tạo ở mục 9 chỉ scope đúng 2 bucket cần dùng, KHÔNG dùng Master Application Key
      toàn tài khoản Backblaze.
- [ ] `B2_SECRET_ACCESS_KEY` KHÔNG bao giờ log ra console/response (theo `SKILL_FILE_MANAGEMENT.md`
      mục 6.1 — nguyên tắc "cấm log token nguyên bản" áp dụng tương tự cho secret key này).
- [ ] Presigned URL TTL: upload (PUT) 5 phút cho cả 2 loại; GET avatar 1 giờ; GET attachment 10 phút —
      không set TTL dài "cho chắc", đặc biệt với attachment (dữ liệu nhạy cảm).
- [ ] Rate limit endpoint `*/presign` (tránh bị spam tạo URL/tốn quota B2) — tận dụng
      `@nestjs/throttler` đã có sẵn trong repo.
- [ ] Xoá avatar cũ trên B2 khi user đổi avatar mới (tránh rác tích luỹ, dù free tier 10GB khá rộng rãi).
- [ ] Đã rà đủ TẤT CẢ endpoint trả `avatarUrl` đều gọi qua `signAvatarUrl()` (checklist đầy đủ ở mục
      5.4a) — thiếu 1 chỗ là avatar hiển thị ra **object key thô** (vô nghĩa, không load được ảnh) thay
      vì URL, không phải lỗi bảo mật nhưng là bug hiển thị dễ bị bỏ sót khi review.

---

## 8. Testing checklist

- [ ] `tsc --noEmit` + `nest build` (backend) sạch sau khi thêm module `uploads`.
- [ ] `next build` (frontend) sạch sau khi sửa `next.config.js` + thêm UI.
- [ ] Test thật: Employee A xin presign avatar → PUT ảnh lên B2 → confirm → avatar hiện đúng ở
      sidebar + bảng danh sách nhân viên (verify URL trả về là presigned GET hợp lệ, mở được ảnh).
- [ ] Test quyền: revoke `profile.edit_avatar` khỏi role Employee qua `/phan-quyen` → nút đổi avatar ẩn
      ở FE + gọi thẳng API cũng phải 403 (verify BE thật sự chặn, không chỉ ẩn UI).
- [ ] Test đơn nghỉ phép có ảnh đính kèm: tạo đơn kèm ảnh → Manager vào `duyet-phep` xem được ảnh →
      Employee khác (không liên quan) gọi thẳng `GET :id/attachment-url` phải bị 403.
- [ ] Test presigned URL hết hạn: đợi qua TTL rồi thử PUT/GET lại → phải lỗi (xác nhận TTL hoạt động
      đúng, không bị cache/CDN làm URL sống mãi).
- [ ] Test riêng cho kiến trúc mới (khác plan R2): mở lại trang danh sách nhân viên SAU KHI avatar URL
      cũ (ký lần trước) đã hết TTL 1 giờ → avatar vẫn phải hiện đúng (vì backend ký lại URL mới mỗi lần
      gọi API, không dùng URL cache cũ ở FE).

---

## 9. HƯỚNG DẪN SETUP BACKBLAZE B2 — tiến độ thực tế

### 9.1 Đã làm xong (verify qua console thật)

1. ✅ Tạo tài khoản Backblaze — không cần thẻ.
2. ✅ Tạo bucket `az-imgs-avatars-workbase` — Private, Encryption Disabled, Object Lock Disabled.
3. ✅ Tạo bucket `az-imgs-leave-request-workbase` — Private, Encryption Disabled, Object Lock Disabled.
4. ✅ Xác nhận thử bật Public cho bucket avatar → bị chặn, bắt nhập thẻ hoặc trả $1 → **quyết định bỏ
   hẳn Public, giữ cả 2 Private** (xem mục 0).

### 9.2 Còn lại — làm tiếp khi sẵn sàng

5. ⏳ **Tạo Application Key**: menu **App Keys** (bên trái, không phải trong từng bucket) → **Add a New
   Application Key**. Đặt tên gợi nhớ (vd `azworkbase-uploads`). Ở "Allow access to Bucket(s)" chọn
   scope đúng 2 bucket trên (nếu console chỉ cho chọn 1 bucket/key thì tạo 2 key riêng, mỗi key gắn đúng
   1 bucket — không sao, code vẫn dùng chung 1 `S3Client` với `credentials` tương ứng theo bucket được
   gọi, hoặc đơn giản nhất là dùng 1 Master-scoped-2-bucket key nếu console hỗ trợ). Quyền: **Read and
   Write**. Lưu ngay `keyID` + `applicationKey` (chỉ hiện 1 lần) vào password manager, KHÔNG lưu vào
   file text/git.

6. ⏳ **CORS Rules qua B2 CLI** (bắt buộc, UI không đủ dùng — xem mục 0):
   ```bash
   # Cài B2 CLI (một lần, máy local): https://www.backblaze.com/docs/cloud-storage-command-line-tools
   pip install b2   # hoặc tải binary self-contained theo hướng dẫn chính thức

   # Đăng nhập bằng keyID + applicationKey vừa tạo ở bước 5
   b2 account authorize <keyID> <applicationKey>

   # Tạo file cors-rules.json với nội dung:
   # [
   #   {
   #     "corsRuleName": "azworkbase-frontend-upload",
   #     "allowedOrigins": ["https://azworkbase.com", "http://localhost:3000"],
   #     "allowedOperations": ["s3_put", "s3_get", "s3_head"],
   #     "allowedHeaders": ["*"],
   #     "exposeHeaders": ["ETag"],
   #     "maxAgeSeconds": 3600
   #   }
   # ]

   # Áp cho TỪNG bucket (chạy 2 lần, đổi tên bucket):
   b2 bucket update --cors-rules "$(cat cors-rules.json)" az-imgs-avatars-workbase allPrivate
   b2 bucket update --cors-rules "$(cat cors-rules.json)" az-imgs-leave-request-workbase allPrivate
   ```
   *(Chú ý: giữ nguyên `allPrivate` ở cuối lệnh — đây là tham số bucket type bắt buộc của lệnh
   `update-bucket`/`bucket update`, KHÔNG phải đang bật Public, chỉ là cú pháp CLI yêu cầu khai lại type
   hiện tại của bucket.)*

7. ⏳ Điền `.env.development` (local, KHÔNG commit) + Vercel dashboard → Environment Variables
   (production) theo đúng mục 5.1.

8. ⏳ Test thử bằng `curl` với presigned URL giả lập trước khi code thật (tạo thử 1 script Node nhỏ gọi
   `getSignedUrl` bằng credentials thật, PUT 1 file test bằng `curl -X PUT <url> --upload-file test.jpg`,
   xác nhận 200 OK và file xuất hiện trong bucket qua console).

---

## 10. Thứ tự triển khai đề xuất

1. Hoàn tất phần setup B2 còn thiếu (mục 9.2) — làm trước tiên, không phụ thuộc code.
2. Migration `AddAvatarUrlToUsers` + `AddProfileEditAvatarPermission` → chạy `migration:run` ở dev DB.
3. Backend: module `uploads` + sửa `users` module (avatar, **bao gồm helper `signAvatarUrl()` mục
   5.4a**) — code + test riêng bằng Postman/Swagger trước khi đụng vào `leave-requests`. Rà kỹ checklist
   "tất cả endpoint trả avatarUrl" ngay ở bước này, đừng để tới cuối mới phát hiện thiếu.
4. Backend: sửa `leave-requests` module (attachment presign + view-url + ownership guard).
5. Frontend: `next.config.js` + `uploads.api.ts` + UI Avatar ở `profile/page.tsx` (dùng `<img>` thường,
   không `next/image` — xem 6.1) — làm xong, test full flow avatar trước.
6. Frontend: UI ảnh đính kèm ở `nghi-phep` + `duyet-phep`.
7. Cập nhật `PERMISSIONS.md` (thêm dòng `profile.edit_avatar`) + `WORKFLOW_LOG.md`.
8. Full regression: `tsc --noEmit`, `nest build`, `next build`, test permission thật theo mục 8.

## 11. Rollback plan

- Migration có `down()` đối xứng — `migration:revert` xoá được cột `avatar_url` + permission mới an
  toàn, không ảnh hưởng dữ liệu khác (cột nullable, không có dữ liệu phụ thuộc).
- File ảnh đã upload lên B2 vẫn còn nếu rollback DB — không tự động dọn, xoá tay qua Backblaze console
  nếu cần dọn sạch khi rollback hẳn tính năng.
- Vì upload đi thẳng browser → B2 (không qua backend), tắt tính năng ở BE (revoke permission qua
  `/phan-quyen` hoặc comment route) là đủ để chặn hoàn toàn, không cần đụng gì ở phía B2.

---

## Phụ lục A — Danh sách permission liên quan

| Permission key | Scope mặc định | Dùng ở |
|---|---|---|
| `profile.edit_avatar` (MỚI) | `own` (cả 4 role) | `POST /uploads/avatar/presign`, `PATCH /users/me/avatar` |
| `leave_requests.request` (đã có) | `own` | `POST /leave-requests/attachments/presign` |
| `leave_requests.view` / `leave_requests.approve` (đã có) | theo scope role | `GET /leave-requests/:id/attachment-url` (kết hợp check chủ đơn) |

## Phụ lục B — File sẽ tạo/sửa (checklist đường dẫn)

**Backend:**
- [ ] `src/database/migrations/17798000000XX-AddAvatarUrlToUsers.ts` (mới)
- [ ] `src/database/migrations/17798000000XX-AddProfileEditAvatarPermission.ts` (mới)
- [ ] `src/database/entities/user.entity.ts` (sửa — thêm `avatarUrl`, comment rõ là KEY)
- [ ] `src/database/entities/leave-request.entity.ts` (sửa — comment lại bản chất `attachmentUrl`, đổi
      nhắc "R2" → "B2" nếu có)
- [ ] `src/modules/uploads/*` (mới — cả module)
- [ ] `src/modules/users/users.controller.ts`, `users.service.ts` (sửa — thêm `signAvatarUrl()` mục
      5.4a, rà TẤT CẢ endpoint trả user), `dto/update-own-avatar.dto.ts` (mới)
- [ ] `src/modules/leave-requests/leave-requests.controller.ts`, `.service.ts`, `dto/presign-attachment.dto.ts` (sửa/mới)
- [ ] `.env.development.example` (sửa — thêm biến `B2_*`)
- [ ] `package.json` (sửa — thêm 2 dependency)

**Frontend:**
- [ ] `next.config.js` (sửa — `images.remotePatterns`, nhưng ưu tiên dùng `<img>` thường cho avatar)
- [ ] `src/lib/api/uploads.api.ts` (mới)
- [ ] `src/lib/types/user.types.ts` (sửa — thêm `avatarUrl`)
- [ ] `src/app/(dashboard)/profile/page.tsx` (sửa — UI upload avatar)
- [ ] `src/app/(dashboard)/layout.tsx` (sửa — Avatar sidebar dùng `src` thật thay vì chỉ initials)
- [ ] `src/app/(dashboard)/nghi-phep/page.tsx` (sửa — UI upload ảnh đính kèm)
- [ ] `src/app/(dashboard)/duyet-phep/page.tsx` (sửa — UI xem ảnh đính kèm)

**Docs:**
- [ ] `AZ-Workbase Skills/PERMISSIONS.md` (sửa — thêm `profile.edit_avatar` vào bảng catalogue mục 1.7)
- [ ] `AZ-Workbase Skills/WORKFLOW_LOG.md` (append — sau khi triển khai xong)
- [ ] **Xoá file cũ** `AZ-Workbase Skills/PLAN_AVATAR_LEAVE_ATTACHMENT_CLOUDFLARE_R2.md` (đã thay bằng
      file này) sau khi commit file mới, tránh 2 plan mâu thuẫn tồn tại song song trong repo.

---

**Plan Version:** 2.0.0 | **Last Updated:** 2026-09-08 | **Thay thế:** `PLAN_AVATAR_LEAVE_ATTACHMENT_CLOUDFLARE_R2.md` (v1.0.0)
