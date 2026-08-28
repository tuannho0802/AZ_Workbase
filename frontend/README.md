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

```
frontend/src/
├── app/
│   ├── (auth)/                # Layout riêng, KHÔNG có sidebar
│   │   ├── login/              # Đăng nhập
│   │   ├── register/           # Tự đăng ký tài khoản (trạng thái pending chờ duyệt)
│   │   └── account-status/     # Trang chờ khi tài khoản chưa được duyệt/bị từ chối
│   └── (dashboard)/            # Layout có sidebar, bắt buộc đăng nhập (xem middleware.ts)
│       ├── layout.tsx           # Sidebar + Auth guard
│       ├── customers/           # Quản lý khách hàng (bảng chính, modal thêm/sửa, chi tiết)
│       ├── chia-data/            # Chia/gán data cho Sales
│       ├── trash-can/             # Khách hàng đã xoá mềm
│       ├── users/                  # Quản lý nhân viên + tab duyệt tài khoản đăng ký mới
│       ├── profile/                 # Trang profile cá nhân
│       ├── nghi-phep/, duyet-phep/   # Xin nghỉ phép / Duyệt đơn nghỉ phép
│       ├── nguon-media/               # Quản lý danh mục "Nguồn" khách hàng
│       ├── nhom-lien-ket/              # Quản lý Category/Group liên kết (Zalo/FB/Threads...)
│       ├── nhom-toi-quan-ly/            # Nhóm mà user hiện tại là Quản lý chính/phụ (xem PERMISSIONS.md §2.4)
│       ├── attendance-device/            # Máy chấm công: trạng thái, map user, đồng bộ, bảng công
│       └── audit-logs/                    # Nhật ký audit log
├── components/
│   ├── common/                  # Component dùng chung (AntdAppProvider, SimpleList...)
│   ├── customers/                 # Component riêng cho module khách hàng (Form, các Tab trong Drawer chi tiết...)
│   ├── link-groups/                # GroupManagersModal (quản lý chính/phụ theo group)
│   └── audit/                       # Component hiển thị audit log
├── lib/
│   ├── api/                     # 1 file `*.api.ts` / module BE, dùng chung `axios-instance.ts` (interceptor gắn token)
│   ├── hooks/                     # React Query hooks (`use<Resource>`), quy ước fallback mảng rỗng phải dùng
│   │                                hằng số module-level (`EMPTY_ARRAY`), KHÔNG dùng literal `[]` trực tiếp — xem mục 4
│   ├── stores/                      # Zustand store (`auth.store.ts` — JWT token + cookie persistence)
│   ├── types/                        # TypeScript interface khớp 1-1 với response BE
│   └── utils/                         # Helper thuần (error-message.util.ts...)
└── middleware.ts                # Next.js Middleware — chặn truy cập (dashboard) khi chưa đăng nhập, chặn (auth) khi đã đăng nhập
```

---

## 3. Test & build trước khi bàn giao

```bash
npx tsc --noEmit    # Bắt buộc chạy sạch trước khi coi 1 thay đổi là xong
npm run build        # next build — bắt lỗi mà tsc đơn thuần có thể bỏ sót (ESLint, RSC boundary...)
```

Dự án hiện chưa có bộ test tự động cho Frontend (khác Backend đã có Jest) — mọi thay đổi UI/logic quan
trọng cần built + click-through thủ công trước khi bàn giao.

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