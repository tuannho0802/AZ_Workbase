# AZ-Workbase — Frontend (Next.js App)

> Giao diện quản lý dữ liệu Marketing & Khách hàng AZ-Workbase.
> Xem tài liệu tổng quan toàn dự án tại [`../README.md`](../README.md).
> Xem quy tắc phân quyền chi tiết tại [`../AZ-Workbase Skills/PERMISSIONS.md`](../AZ-Workbase%20Skills/PERMISSIONS.md)
> — mọi ẩn/hiện UI theo role đều phải khớp tài liệu đó (BE luôn là nơi chặn thật, FE chỉ ẩn cho gọn mắt).

Stack: **Next.js 16 (App Router)** · **Ant Design 6** · **TanStack Query (React Query)** · **Zustand** ·
Deploy: **Vercel** (`output: 'standalone'`).

---

## 1. Cài đặt & chạy local

```bash
npm install

# Tạo file .env.local (không commit):
NEXT_PUBLIC_API_URL=http://localhost:3001/api

npm run dev      # http://localhost:3000
npm run build && npm run start   # build production để kiểm tra trước khi deploy
```

---

## 2. Cấu trúc thư mục

> Chỉ nêu các cấp quan trọng — danh sách route đầy đủ: `ls "src/app/(dashboard)"`.

```
frontend/src/
├── app/
│   ├── (auth)/                # Layout riêng, KHÔNG có sidebar: login, register, account-status, change-password-required
│   └── (dashboard)/            # Layout có sidebar, bắt buộc đăng nhập (xem proxy.ts)
│       ├── layout.tsx           # Sidebar + Auth guard (dùng lib/nav-config.tsx)
│       ├── customers/, chia-data/, trash-can/, quan-ly-status-khach/   # Khách hàng, chia data, thùng rác, status khách
│       ├── users/, profile/, phong-ban/, vi-tri/, phan-quyen/            # Nhân viên, profile, phòng ban, vị trí, phân quyền (RBAC)
│       ├── nghi-phep/, duyet-phep/, quan-ly-loai-phep/                    # Nghỉ phép
│       ├── nguon-media/, nhom-lien-ket/, nhom-toi-quan-ly/, quan-ly-utm/, quan-ly-phu-trach/
│       ├── cong-viec-dinh-ky/, hieu-suat-cong-viec/, lich-su-cong-viec/, quan-ly-trang-thai-cong-viec/   # Công việc định kỳ
│       ├── reports/, thong-bao/, huong-dan/                               # Báo cáo, thông báo, hướng dẫn sử dụng
│       ├── attendance-device/                                              # Máy chấm công
│       ├── audit-logs/, security-activity/, storage-img/, system-health/   # Audit, IP/phiên, lưu trữ ảnh, sức khoẻ hệ thống (Root Admin)
│       └── error.tsx            # Error boundary theo vùng nội dung
├── components/                # common, customers, guides, leave-requests, link-groups, notifications, periodic-tasks,
│                                security, sessions, system, users, utms, audit
├── lib/
│   ├── api/                    # 1 file `*.api.ts` / module BE, dùng chung `axios-instance.ts` (interceptor gắn token)
│   ├── hooks/                   # React Query hooks (`use<Resource>`), quy ước fallback mảng rỗng phải dùng
│   │                              hằng số module-level (`EMPTY_ARRAY`), KHÔNG dùng literal `[]` trực tiếp — xem mục 4
│   ├── stores/                   # Zustand (auth.store.ts — JWT + cookie persistence, command-palette, notification-ui)
│   ├── permissions/, nav-config.tsx   # Gate quyền: `can('permission.key')` qua `useMyPermissions`; mục nav khai `permission`/`rootAdminOnly`
│   ├── guides/                   # Nội dung/slug hướng dẫn phía FE (guide-slugs.ts)
│   ├── observability/            # Sentry options + lọc PII
│   ├── types/, utils/            # Interface khớp 1-1 response BE; helper thuần
│   └── query-*.ts, poll-schedule.ts   # Cấu hình React Query (persist/retry/stale) và lịch poll
└── proxy.ts                    # Next.js 16 (đổi tên từ middleware.ts) — chặn (dashboard) khi chưa đăng nhập, chặn (auth) khi đã đăng nhập
```

---

### Gom lỗi bằng Sentry (PLAN_HARDENING P5)

- File: `src/instrumentation-client.ts` (trình duyệt), `src/instrumentation.ts` + `src/sentry.server.config.ts` (server), option dùng chung ở `lib/observability/sentry-options.ts`, lọc PII ở `lib/observability/sentry-scrub.ts`.
- Biến môi trường (Vercel, project Sentry của **FE**): `NEXT_PUBLIC_SENTRY_DSN` (công khai theo thiết kế), và để upload source map: `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` (bí mật, KHÔNG đặt `NEXT_PUBLIC_`). Thiếu `SENTRY_AUTH_TOKEN` thì build vẫn qua, chỉ bỏ bước upload.
- Không bật Session Replay (màn hình chứa PII khách hàng). Lỗi 4xx của axios bị bỏ qua (`SENTRY_IGNORE_ERRORS`).
- Error boundary theo vùng: `app/(dashboard)/error.tsx` chỉ thay vùng nội dung, giữ Sidebar/Header. Lỗi ở chính `(dashboard)/layout.tsx` rơi về `app/error.tsx`.
- `withSentryConfig` ở v11 import từ `@sentry/nextjs/config` (không phải `@sentry/nextjs`).
- **Test local** (Sentry chỉ bật ở bản build production, `npm run dev` luôn tắt): copy `.env.sentry-local.example` -> `.env.production.local`, điền `NEXT_PUBLIC_SENTRY_DSN` của project FE **test**, `npm run build && npm run start`, mở `/login` bằng cửa sổ ẩn danh (tắt extension chặn quảng cáo), dán vào Console `setTimeout(() => { throw new Error('FE local test') })`. Event có `environment:local`. **Xoá `.env.production.local` sau khi test** (nó ghi đè env của mọi lần build production local).

## 3. Test & build trước khi bàn giao

```bash
npx tsc --noEmit    # Bắt buộc chạy sạch trước khi coi 1 thay đổi là xong
npm run build        # next build — bắt lỗi mà tsc đơn thuần có thể bỏ sót (ESLint, RSC boundary...)
```

Test tự động dùng **Vitest** (file `*.test.ts(x)` cạnh code):

```bash
npm test             # vitest run — chạy toàn bộ
npm run test:watch
npx vitest run <đường-dẫn>   # chạy riêng 1 nhóm, vd src/lib/guides
```

Thay đổi UI/logic quan trọng vẫn cần build + click-through thủ công trước khi bàn giao.

---

## 4. Các lỗi đã từng gặp — đọc trước khi động vào phần liên quan

- **Infinite loop `useEffect` do hook trả về array mới mỗi lần render.** Bất kỳ hook nào fallback bằng
  `data ?? []` (literal `[]` khi `data` còn `undefined`, ví dụ query bị `enabled: false`) sẽ tạo 1
  reference MỚI mỗi render. Nếu reference đó nằm trong dependency array của `useEffect` khác mà bên
  trong lại gọi `setState`, sẽ gây **"Maximum update depth exceeded"**. Luôn dùng 1 hằng số
  `EMPTY_ARRAY`/`EMPTY_<TÊN>` module-level dùng chung thay vì literal `[]` — xem `lib/hooks/useLinkGroups.ts`
  làm ví dụ mẫu đã sửa lỗi này.
- **Cache-Control `max-age` mù ở BE khiến data vừa sửa không hiện trên UI** cho tới khi hard-refresh
  (Ctrl+Shift+R). Đây là lỗi ở tầng BE (`common/interceptors/cache-control.interceptor.ts`), không phải
  React Query — `refetch()` vẫn gọi network nhưng trình duyệt có thể trả thẳng từ HTTP cache nếu response
  trước đó có `Cache-Control: public, max-age=N`. Resource hay bị sửa (customers, link-groups...) nên
  dùng `no-cache` (revalidate qua ETag) thay vì `max-age`.
- **Bảng dùng `table-layout: fixed` (AntD Table) phải khai báo `width` rõ ràng cho MỌI cột.** Cột không
  khai báo width sẽ nhận phần còn lại sau khi trừ các cột khác — thêm 1 cột mới mà không tính lại tỉ lệ
  các cột cũ dễ làm cột còn lại bị bóp quá hẹp, chữ bị wrap từng ký tự.

---

## 5. Học Next.js / Ant Design

- [Next.js Documentation](https://nextjs.org/docs)
- [Ant Design 6 Documentation](https://ant.design/components/overview)
- [TanStack Query Documentation](https://tanstack.com/query/latest)