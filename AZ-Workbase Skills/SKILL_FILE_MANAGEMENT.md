# SKILL: FILE MANAGEMENT PROTOCOL
**Version:** 1.0.0 | **Ngày tạo:** 2026-04-01 | **Author:** AI Agent

---

## 1. QUY TẮC ĐỌC/GHI TỔNG QUÁT

### 1.1 Quy tắc BẮT BUỘC trước khi sửa bất kỳ file nào:
1. **Kiểm tra Schema Database TRƯỚC**: Mở các file `*.entity.ts` tại `backend/src/database/entities/` để xác nhận kiểu dữ liệu, tên cột thực tế (snake_case), và các quan hệ (@ManyToOne/@OneToMany).
2. **Kiểm tra DTO TRƯỚC**: Đọc `create-*.dto.ts` và `update-*.dto.ts` tương ứng tại `backend/src/modules/<module>/dto/` để biết Backend chấp nhận trường gì, kiểu gì.
3. **Kiểm tra API Contract**: Xác nhận Controller `*.controller.ts` đang expose endpoint nào, nhận Params/Body gì, trả về format ra sao.
4. **Chỉ sau 3 bước trên** mới được phép chạm vào file Frontend.

### 1.2 Thứ tự ưu tiên khi sửa bug:
```
DB Schema (entity.ts) → DTO → Service → Controller → Frontend API → Hook → Page Component
```

### 1.3 Quy tắc kiểu dữ liệu quan trọng:
| Kiểu DB (MySQL) | Kiểu TypeORM Entity | Kiểu Frontend |
|---|---|---|
| `TINYINT(1)` | `boolean` (có thể ra 0/1) | Luôn dùng `Number(val) === 1` hoặc `Boolean(val)` |
| `INT` | `number` | Luôn `Number(val)` khi gửi lên API |
| `ENUM` | `string` | Luôn `.toLowerCase()` để match Enum Backend |
| `DATE` / `TIMESTAMP` | `Date` | Format bằng `dayjs` trước khi hiển thị |

---

## 2. GIAO THỨC WORKFLOW LOG

### 2.1 Điều kiện ghi log:
- Agent **CHỈ ĐƯỢC GHI** vào `WORKFLOW_LOG.md` khi người dùng ra lệnh rõ ràng:
  - `"Log this action"` hoặc `"Ghi nhận quy trình này"` (tiếng Việt/Anh đều chấp nhận).
  - Hoặc sau khi hoàn thành một Task lớn và muốn đánh dấu mốc lịch sử.

### 2.2 Quy tắc BẤT BIẾN khi ghi log:
- ❌ **NGHIÊM CẤM** ghi đè hoặc xóa các entry cũ.
- ✅ **CHỈ ĐƯỢC APPEND** (Viết thêm vào cuối file).
- Không được chỉnh sửa timestamp của entry cũ.

### 2.3 Định dạng entry log chuẩn:
```markdown
## [YYYY-MM-DD HH:mm] | [Tên Task/Action] | [Status: Success/Failed/In-Progress]

**Actor:** Agent / User
**Files Changed:**
- `path/to/file.ts` — Mô tả thay đổi ngắn gọn

**Root Cause (nếu là bug fix):**
> Nguyên nhân gốc rễ...

**Solution:**
> Giải pháp đã áp dụng...

**Notes:**
> Ghi chú thêm nếu có...

---
```

---

## 3. QUY TẮC AN TOÀN (SAFETY RULES)

### 3.1 NGHIÊM CẤM:
- Bao giờ cũng `delete` hoặc`drop` bất kỳ bảng DB hoặc cột nào mà không có lệnh tường minh từ người dùng.
- Không tự ý thay đổi file `*.env` hoặc `*.env.development`.
- Không tự ý thay đổi `database.config.ts` hay Migration files.
- Không bao giờ commit file `hash.txt` hoặc bất kỳ file chứa thông tin nhạy cảm.

### 3.2 Luôn backup logic cũ bằng comment trước khi thay thế:
```typescript
// [AGENT] OLD CODE (giữ lại để rollback):
// const isActive = record.isActive === 1;
// [AGENT] NEW CODE:
const isActive = Number(record.isActive) === 1;
```

---

## 4. CẤU TRÚC THƯ MỤC DỰ ÁN

```
AZ-Workbase/
├── backend/                        # NestJS API Server (Port 3001)
│   ├── src/
│   │   ├── common/                 # Guards, Filters, Decorators, Enums
│   │   ├── config/                 # TypeORM config
│   │   ├── database/
│   │   │   ├── entities/           # ⭐ NGUỒN SỰ THẬT - Luôn đọc trước
│   │   │   ├── migrations/         # Schema version history
│   │   │   └── seeds/              # Dữ liệu mẫu
│   │   └── modules/
│   │       ├── auth/               # JWT Login/Refresh
│   │       ├── users/              # CRUD nhân viên
│   │       ├── customers/          # CRUD khách hàng
│   │       ├── departments/        # Quản lý phòng ban
│   │       └── deposits/           # Quản lý nạp tiền
│   └── .env.development            # Config môi trường dev
│
├── frontend/                       # Next.js 14 App (Port 3000)
│   ├── src/
│   │   ├── app/
│   │   │   ├── (auth)/login/       # Trang đăng nhập
│   │   │   └── (dashboard)/        # Các trang chính sau login
│   │   ├── components/             # Shared UI components
│   │   └── lib/
│   │       ├── api/                # Axios instance + API methods
│   │       ├── hooks/              # React Query hooks
│   │       ├── stores/             # Zustand state stores
│   │       └── types/              # TypeScript interfaces
│   └── src/middleware.ts           # Route protection (JWT check)
│
└── AZ-Workbase Skills/             # 🤖 Tài liệu hướng dẫn cho Agent
    ├── SKILL_FILE_MANAGEMENT.md    # (file này) — Giao thức thao tác
    ├── SKILL_DATABASE_MANAGEMENT.md
    ├── SKILL_NESTJS_BACKEND.md
    ├── SKILL_NEXTJS_FRONTEND.md
    ├── README_AZWORKBASE_PROJECT.md
    └── WORKFLOW_LOG.md             # Nhật ký tư duy & hành động
```

---

## 5. CÁCH RA LỆNH CHO AGENT

| Bạn muốn... | Câu lệnh ví dụ |
|---|---|
| Đọc & hiểu module | `"Audit module Customers cho tôi"` |
| Sửa bug | `"Fix lỗi X tại file Y, nguyên nhân là Z"` |
| Ghi nhận vào log | `"Log this action"` hoặc `"Ghi nhận quy trình này"` |
| Đồng bộ DB & UI | `"Đồng bộ trường X từ entity sang Frontend"` |
| Kiểm tra trước khi deploy | `"Review toàn bộ thay đổi trước khi commit"` |
