# 📸 PLAN: Avatar User (self-set) + Ảnh đính kèm Nghỉ phép qua Cloudflare R2

**Version:** 1.0.0 | **Ngày tạo:** 2026-09-08 | **Status:** 📋 Planning — CHƯA triển khai |
**Author:** AI Agent (theo yêu cầu chủ dự án qua chat) | **File liên quan bắt buộc đọc trước khi code:**
[`PERMISSIONS.md`](./PERMISSIONS.md) · [`SKILL_DATABASE_MANAGEMENT.md`](./SKILL_DATABASE_MANAGEMENT.md) ·
[`SKILL_NESTJS_BACKEND.md`](./SKILL_NESTJS_BACKEND.md) · [`SKILL_NEXTJS_FRONTEND.md`](./SKILL_NEXTJS_FRONTEND.md)

> Tài liệu này là **PLAN** (chưa phải code thật). Khi bắt đầu triển khai, agent phải đọc lại file này +
> đọc code thật hiện tại (theo đúng rule ở `README.md` gốc — không tin trạng thái cũ quá 30 phút) vì có
> thể đã có phiên khác code trước một phần.

---

## 0. Bối cảnh & Quyết định kiến trúc đã chốt

Đã verify THẬT (không suy đoán) trước khi viết plan này:

| Việc đã verify | Kết quả |
|---|---|
| `leave_requests.attachment_url` (varchar 500) | ✅ **Đã tồn tại từ migration `AddLeaveSystem`**, DTO backend đã nhận `dto.attachmentUrl`, nhưng **Frontend chưa có UI** — không cần migration mới cho cột này |
| Multer (`FileInterceptor`) | ✅ Đã dùng sẵn ở `customers.controller.ts` (import Excel) — pattern quen thuộc trong repo |
| Pattern permission "tự sửa của mình" | ✅ Đã có sẵn (`profile.edit_info`, `profile.edit_email`, `profile.change_password` — seed mặc định scope `own`) — Avatar sẽ nhân bản đúng pattern này |
| `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` | ✅ Cài + `tsc --noEmit` + `nest build` **pass sạch** trong đúng setup TypeScript/NestJS của repo |
| Backend deploy Serverless trên Vercel | ⚠️ **Giới hạn CỨNG 4.5MB/request body** ở tầng nền tảng (AWS Lambda) — không thể tăng bằng cấu hình NestJS |
| Filesystem của Vercel Serverless | ⚠️ Ephemeral/read-only ngoài `/tmp` — **không thể lưu ảnh vào ổ đĩa local**, bắt buộc dùng object storage ngoài |
| `frontend/next.config.js` | ⚠️ Chưa có `images.remotePatterns` — cần thêm domain R2 nếu dùng `next/image` |

**Quyết định kiến trúc:**

1. **Upload thẳng từ trình duyệt lên R2 bằng Presigned URL — KHÔNG đẩy file qua NestJS backend.**
   Né được giới hạn 4.5MB, không tốn thời gian chạy Lambda cho việc truyền file, đúng khuyến nghị chính
   thức của Vercel cho bài toán "upload file lớn trên serverless".
2. **Dùng 2 bucket R2 riêng biệt** (khác chính sách truy cập, không trộn 1 bucket):
   - `az-workbase-avatars` — **public-read** (qua custom domain hoặc `r2.dev`), phục vụ trực tiếp qua CDN,
     không cần permission check mỗi lần hiển thị (ảnh đại diện vốn không nhạy cảm, ai trong hệ thống cũng
     thấy được ở dropdown/table).
   - `az-workbase-private` — **KHÔNG public**, chỉ truy cập qua **Presigned GET URL** do backend cấp SAU
     khi kiểm tra permission (`leave_requests.view`/`leave_requests.request` theo đúng scope). Lý do: ảnh
     đính kèm nghỉ phép có thể là giấy khám bệnh — **dữ liệu sức khoẻ nhạy cảm**, không được public.

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
- Resize/nén ảnh phía server (dùng resize phía client bằng `<canvas>` — xem mục 7.2, tránh phụ thuộc
  `sharp` vốn có native binary dễ gây rắc rối khi bundle lên Vercel serverless).
- Cho Admin/Manager set avatar hộ người khác.
- Cloudflare CDN/DNS cho toàn bộ domain (phần 2 trong report Gemini) — đây là việc riêng, không phụ
  thuộc phase này.

---

## 2. Kiến trúc tổng thể (luồng xử lý)

### 2.1 Luồng Avatar (bucket public)

```
[Browser]                         [NestJS Backend]                    [Cloudflare R2 - avatars]
   │  1. POST /uploads/avatar/presign                                          │
   │     (Content-Type: image/webp)                                            │
   ├──────────────────────────────►│                                           │
   │                                │ 2. Check permission profile.edit_avatar  │
   │                                │    (luôn tự động = chính user gọi)       │
   │                                │ 3. Sinh key: avatars/{userId}/{uuid}.webp│
   │                                │ 4. getSignedUrl(PutObjectCommand)        │
   │  5. { uploadUrl, publicUrl,   │───────────────────────────────────────►  │
   │       key }                   │                                           │
   │◄───────────────────────────────                                          │
   │                                                                           │
   │  6. PUT file trực tiếp lên uploadUrl (KHÔNG qua NestJS)                   │
   ├───────────────────────────────────────────────────────────────────────► │
   │  7. 200 OK từ R2                                                         │
   │◄─────────────────────────────────────────────────────────────────────── │
   │                                │                                           │
   │  8. PATCH /users/me/avatar    │                                           │
   │     { avatarUrl: publicUrl }  │                                           │
   ├──────────────────────────────►│ 9. Lưu avatar_url vào DB                 │
   │                                │ 10. (optional) Xoá key avatar CŨ trên R2 │
   │  11. 200 OK + user mới        │────────────────────────────────────────► │
   │◄───────────────────────────────                                          │
```

### 2.2 Luồng ảnh đính kèm Nghỉ phép (bucket private)

```
[Browser]                         [NestJS Backend]                    [Cloudflare R2 - private]
   │ 1. POST /leave-requests/attachments/presign                              │
   │    (khi đang điền form tạo đơn, CHƯA có leaveRequestId)                  │
   ├──────────────────────────────►│                                          │
   │                                │ 2. Check permission leave_requests.request│
   │                                │ 3. Key: leave-attachments/{userId}/{uuid}.jpg│
   │  4. { uploadUrl, key }         │──────────────────────────────────────► │
   │◄───────────────────────────────                                          │
   │ 5. PUT file thẳng lên R2 (private, không public URL)                     │
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

⚠️ **Điểm khác biệt quan trọng so với Avatar:** cột `attachment_url` trong DB lưu **object key** (vd
`leave-attachments/12/a1b2c3.jpg`), **KHÔNG lưu URL đã ký** (vì presigned URL có `expiresIn`, hết hạn là
vỡ link). Tên cột `attachment_url` giữ nguyên (không đổi tên tránh phải sửa nhiều chỗ), nhưng bản chất
giá trị lưu trong đó là **key**, không phải URL đầy đủ — cần ghi rõ comment này trong entity khi sửa.

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
      COMMENT 'URL public ảnh đại diện trên Cloudflare R2 (bucket az-workbase-avatars)';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users DROP COLUMN avatar_url;`);
  }
}
```

Entity `user.entity.ts` thêm:
```typescript
@Column({ name: 'avatar_url', type: 'varchar', length: 500, nullable: true })
avatarUrl: string | null;
```

### 3.2 `leave_requests.attachment_url` — KHÔNG cần migration

Cột đã tồn tại. Chỉ cần sửa comment trong entity cho đúng bản chất mới (lưu key, không phải URL đầy đủ)
và thêm helper build lại URL khi trả về cho FE (xem mục 5.6).

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

## 4. Cloudflare R2 — cần chuẩn bị gì (chi tiết từng bước ở mục 9)

- 1 tài khoản Cloudflare (miễn phí đủ dùng — free tier 10GB storage/tháng, không phí egress).
- 2 R2 bucket: `az-workbase-avatars` (public) và `az-workbase-private` (private).
- 1 API Token phạm vi R2 (Object Read & Write), scope đúng 2 bucket trên — KHÔNG dùng Global API Key.
- Lấy: `Account ID`, `Access Key ID`, `Secret Access Key`.
- CORS config cho cả 2 bucket (cho phép `PUT` từ domain frontend thật).
- (Tuỳ chọn) Custom domain cho bucket avatars nếu không muốn dùng URL `r2.dev` mặc định.

---

## 5. Backend changes

### 5.1 Env vars mới (thêm vào `.env.development.example` + Vercel dashboard)

```bash
# Cloudflare R2
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key_id
R2_SECRET_ACCESS_KEY=your_secret_access_key
R2_BUCKET_AVATARS=az-workbase-avatars
R2_BUCKET_PRIVATE=az-workbase-private
R2_AVATARS_PUBLIC_BASE_URL=https://avatars.azworkbase.com   # hoặc URL r2.dev nếu chưa gắn domain riêng
```

⚠️ Theo `SKILL_FILE_MANAGEMENT.md` mục 3.1: **KHÔNG tự ý sửa `.env.development`/`.env.production` thật**
— chỉ thêm dòng mẫu vào `.env.development.example`, người dùng tự điền giá trị thật + tự set trên Vercel
dashboard.

### 5.2 Package cần cài

```bash
cd backend
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

*(Đã verify: cài + build sạch trong repo này, không xung đột dependency, ~21MB thêm vào
`node_modules` — không ảnh hưởng đáng kể tới giới hạn 50MB `maxLambdaSize` đã cấu hình sẵn trong
`vercel.json` vì AWS SDK v3 modular, phần thật sự bundle vào function nhỏ hơn nhiều so với size gói).*

### 5.3 Module mới `uploads` (`backend/src/modules/uploads/`)

```
uploads/
├── uploads.module.ts
├── uploads.controller.ts
├── uploads.service.ts        # wrap S3Client, tạo presigned URL, xoá object
└── dto/
    ├── presign-avatar.dto.ts       # { contentType: string }
    └── presign-attachment.dto.ts   # { contentType: string }
```

`uploads.service.ts` — logic cốt lõi:
```typescript
@Injectable()
export class UploadsService {
  private readonly s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
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
      new PutObjectCommand({ Bucket: process.env.R2_BUCKET_AVATARS, Key: key, ContentType: contentType }),
      { expiresIn: 300 }, // 5 phút
    );
    const publicUrl = `${process.env.R2_AVATARS_PUBLIC_BASE_URL}/${key}`;
    return { uploadUrl, publicUrl, key };
  }

  async presignAttachmentUpload(userId: number, contentType: string) {
    // Tương tự nhưng dùng R2_BUCKET_PRIVATE, KHÔNG trả publicUrl
  }

  async getAttachmentViewUrl(key: string) {
    return getSignedUrl(
      this.s3,
      new GetObjectCommand({ Bucket: process.env.R2_BUCKET_PRIVATE, Key: key }),
      { expiresIn: 600 }, // 10 phút — đủ xem, không quá dài
    );
  }

  async deleteAvatar(key: string) {
    await this.s3.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_AVATARS, Key: key }));
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
  return this.usersService.updateOwnAvatar(req.user.id, dto.avatarUrl, dto.oldKey);
}
```

```typescript
// users.service.ts
async updateOwnAvatar(userId: number, avatarUrl: string, oldKey?: string) {
  await this.usersRepository.update(userId, { avatarUrl });
  if (oldKey) {
    // best-effort, không throw nếu lỗi xoá object cũ — không chặn luồng chính
    this.uploadsService.deleteAvatar(oldKey).catch(err =>
      this.logger.warn(`Không xoá được avatar cũ: ${oldKey}`, err),
    );
  }
  return this.findOne(userId);
}
```

### 5.5 DTO mới

```typescript
// dto/presign-avatar.dto.ts
export class PresignAvatarDto {
  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  contentType: string;
}

// dto/update-own-avatar.dto.ts
export class UpdateOwnAvatarDto {
  @IsUrl()
  avatarUrl: string;

  @IsOptional()
  @IsString()
  oldKey?: string; // key ảnh cũ trên R2 để dọn rác, FE tự lấy từ user hiện tại trước khi gọi
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
  nếu có → gọi `uploadsService.getAttachmentViewUrl(record.attachmentUrl)` (nhớ: cột này giờ lưu **key**).

- `create()` DTO thêm field nhận key vừa upload (giữ tên `attachmentUrl` cho khỏi vỡ contract cũ, giá trị
  truyền vào là key).

### 5.7 Validate & giới hạn kích thước

Presigned PUT URL kiểu đơn giản (`PutObjectCommand` + `getSignedUrl`) **không tự chặn được dung lượng
file** ở tầng R2 — muốn ép cứng giới hạn size ở tầng storage phải dùng **Presigned POST Policy**
(`createPresignedPost` từ `@aws-sdk/s3-presigned-post`, phức tạp hơn). **Phase 1: chấp nhận rủi ro nhỏ
này**, chặn chủ yếu ở client (resize + validate trước khi xin presign) + validate `Content-Type` ở
backend (đã làm ở 5.3). Nếu sau này cần chặn cứng dung lượng ở server, nâng cấp sang Presigned POST ở
phase 2 — ghi lại thành TODO trong code, không block phase 1.

---

## 6. Frontend changes

### 6.1 `next.config.js` — thêm `images.remotePatterns`

```javascript
images: {
  minimumCacheTTL: 3600,
  formats: ['image/webp', 'image/avif'],
  remotePatterns: [
    { protocol: 'https', hostname: 'avatars.azworkbase.com' }, // hoặc *.r2.dev nếu dùng public dev URL
  ],
},
```

### 6.2 API client mới `lib/api/uploads.api.ts`

```typescript
export const uploadsApi = {
  presignAvatar: async (contentType: string) => {
    const { data } = await axiosInstance.post('/uploads/avatar/presign', { contentType });
    return data as { uploadUrl: string; publicUrl: string; key: string };
  },
  uploadToPresignedUrl: async (uploadUrl: string, file: File) => {
    // Dùng axios "trần" (KHÔNG qua axiosInstance) - không cần gắn JWT, đây là request thẳng tới R2
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
  khi bundle Vercel serverless — xem mục 0 và mục Ngoài phạm vi).
- Chỉ hiện nút đổi avatar khi `can('profile.edit_avatar')` (hook `useMyPermissions`).
- Sau khi confirm thành công → cập nhật lại `useAuthStore` (user.avatarUrl mới) để avatar ở sidebar
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
- [ ] Bucket `az-workbase-private` **KHÔNG bật Public Access**, không gắn custom domain — chỉ truy cập
      qua presigned GET có kiểm tra quyền.
- [ ] Route `GET :id/attachment-url` PHẢI qua 1 hàm gác cổng chung (chủ đơn HOẶC đúng scope
      view/approve) — không phải chỉ 1 `@RequirePermission` tĩnh (xem mục 5.6).
- [ ] API Token R2 tạo ở mục 9 chỉ scope đúng 2 bucket cần dùng, KHÔNG dùng quyền "Admin Read & Write"
      toàn tài khoản Cloudflare.
- [ ] `R2_SECRET_ACCESS_KEY` KHÔNG bao giờ log ra console/response (theo `SKILL_FILE_MANAGEMENT.md`
      mục 6.1 — nguyên tắc "cấm log token nguyên bản" áp dụng tương tự cho secret key này).
- [ ] Presigned URL TTL ngắn (upload: 5 phút, view: 10 phút) — không set TTL dài "cho chắc".
- [ ] Rate limit endpoint `*/presign` (tránh bị spam tạo URL/tốn quota R2) — tận dụng
      `@nestjs/throttler` đã có sẵn trong repo.
- [ ] Xoá avatar cũ trên R2 khi user đổi avatar mới (tránh rác tích luỹ, dù free tier 10GB khá rộng rãi).

---

## 8. Testing checklist

- [ ] `tsc --noEmit` + `nest build` (backend) sạch sau khi thêm module `uploads`.
- [ ] `next build` (frontend) sạch sau khi sửa `next.config.js` + thêm UI.
- [ ] Test thật: Employee A xin presign avatar → PUT ảnh lên R2 → confirm → avatar hiện đúng ở
      sidebar + bảng danh sách nhân viên.
- [ ] Test quyền: revoke `profile.edit_avatar` khỏi role Employee qua `/phan-quyen` → nút đổi avatar ẩn
      ở FE + gọi thẳng API cũng phải 403 (verify BE thật sự chặn, không chỉ ẩn UI).
- [ ] Test đơn nghỉ phép có ảnh đính kèm: tạo đơn kèm ảnh → Manager vào `duyet-phep` xem được ảnh →
      Employee khác (không liên quan) gọi thẳng `GET :id/attachment-url` phải bị 403.
- [ ] Test presigned URL hết hạn: đợi qua TTL rồi thử PUT/GET lại → phải lỗi (xác nhận TTL hoạt động
      đúng, không bị cache/CDN làm URL sống mãi).

---

## 9. HƯỚNG DẪN SETUP CLOUDFLARE R2 — từng bước

> Phần này sẽ được hướng dẫn **trực tiếp, tương tác từng bước** trong chat ngay sau khi bạn lưu xong tài
> liệu này — xem tin nhắn tiếp theo.

### Tóm tắt các bước (checklist tổng quan)

1. Tạo/đăng nhập tài khoản Cloudflare tại `dash.cloudflare.com`.
2. Vào mục **R2 Object Storage** → tạo bucket `az-workbase-avatars`.
3. Tạo bucket thứ 2 `az-workbase-private`.
4. Bật **Public Access** cho `az-workbase-avatars` (qua `r2.dev` URL để bắt đầu nhanh, hoặc gắn custom
   domain nếu đã có domain riêng quản lý trên Cloudflare).
5. Bucket `az-workbase-private` **giữ nguyên private** — không làm gì thêm ở bước này.
6. Tạo **R2 API Token**: R2 → "Manage API Tokens" → "Create API Token" → chọn quyền
   **Object Read & Write**, scope giới hạn đúng 2 bucket vừa tạo (không chọn "Apply to all buckets").
7. Copy lại: `Account ID`, `Access Key ID`, `Secret Access Key` — **Secret Access Key CHỈ hiện 1 LẦN DUY
   NHẤT** lúc tạo token, phải lưu ngay vào chỗ an toàn (password manager), không lưu vào file text/git.
8. Cấu hình **CORS** cho cả 2 bucket (cho phép `PUT`/`GET` từ domain frontend thật, vd
   `https://azworkbase.com` và `http://localhost:3000` cho dev).
9. Điền các giá trị vào `.env.development` (local, KHÔNG commit) + Vercel dashboard → Environment
   Variables (production).
10. (Tuỳ chọn) Test thử bằng `curl` với presigned URL giả lập trước khi code thật.

---

## 10. Thứ tự triển khai đề xuất

1. Setup Cloudflare (mục 9) — làm trước tiên, không phụ thuộc code.
2. Migration `AddAvatarUrlToUsers` + `AddProfileEditAvatarPermission` → chạy `migration:run` ở dev DB.
3. Backend: module `uploads` + sửa `users` module (avatar) — code + test riêng bằng Postman/Swagger
   trước khi đụng vào `leave-requests`.
4. Backend: sửa `leave-requests` module (attachment presign + view-url + ownership guard).
5. Frontend: `next.config.js` + `uploads.api.ts` + UI Avatar ở `profile/page.tsx` — làm xong, test full
   flow avatar trước.
6. Frontend: UI ảnh đính kèm ở `nghi-phep` + `duyet-phep`.
7. Cập nhật `PERMISSIONS.md` (thêm dòng `profile.edit_avatar`) + `WORKFLOW_LOG.md`.
8. Full regression: `tsc --noEmit`, `nest build`, `next build`, test permission thật theo mục 8.

## 11. Rollback plan

- Migration có `down()` đối xứng — `migration:revert` xoá được cột `avatar_url` + permission mới an
  toàn, không ảnh hưởng dữ liệu khác (cột nullable, không có dữ liệu phụ thuộc).
- File ảnh đã upload lên R2 vẫn còn nếu rollback DB — không tự động dọn, xoá tay qua Cloudflare dashboard
  nếu cần dọn sạch khi rollback hẳn tính năng.
- Vì upload đi thẳng browser → R2 (không qua backend), tắt tính năng ở BE (revoke permission qua
  `/phan-quyen` hoặc comment route) là đủ để chặn hoàn toàn, không cần đụng gì ở phía R2.

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
- [ ] `src/database/entities/user.entity.ts` (sửa — thêm `avatarUrl`)
- [ ] `src/database/entities/leave-request.entity.ts` (sửa — comment lại bản chất `attachmentUrl`)
- [ ] `src/modules/uploads/*` (mới — cả module)
- [ ] `src/modules/users/users.controller.ts`, `users.service.ts`, `dto/update-own-avatar.dto.ts` (sửa/mới)
- [ ] `src/modules/leave-requests/leave-requests.controller.ts`, `.service.ts`, `dto/presign-attachment.dto.ts` (sửa/mới)
- [ ] `.env.development.example` (sửa — thêm biến mẫu)
- [ ] `package.json` (sửa — thêm 2 dependency)

**Frontend:**
- [ ] `next.config.js` (sửa — `images.remotePatterns`)
- [ ] `src/lib/api/uploads.api.ts` (mới)
- [ ] `src/lib/types/user.types.ts` (sửa — thêm `avatarUrl`)
- [ ] `src/app/(dashboard)/profile/page.tsx` (sửa — UI upload avatar)
- [ ] `src/app/(dashboard)/layout.tsx` (sửa — Avatar sidebar dùng `src` thật thay vì chỉ initials)
- [ ] `src/app/(dashboard)/nghi-phep/page.tsx` (sửa — UI upload ảnh đính kèm)
- [ ] `src/app/(dashboard)/duyet-phep/page.tsx` (sửa — UI xem ảnh đính kèm)

**Docs:**
- [ ] `AZ-Workbase Skills/PERMISSIONS.md` (sửa — thêm `profile.edit_avatar` vào bảng catalogue mục 1.7)
- [ ] `AZ-Workbase Skills/WORKFLOW_LOG.md` (append — sau khi triển khai xong)

---

**Plan Version:** 1.0.0 | **Last Updated:** 2026-09-08
