---
title: Bắt đầu sử dụng AZWorkbase
slug: bat-dau
sortOrder: 0
published: true
roles: []
positions: []
departments: []
permissions: []
---

## Trang này để làm gì

Đây là bài đầu tiên cho mọi người: cách nhìn màn hình, cách tìm trang nhanh, và vì sao **menu của bạn có thể khác đồng nghiệp**.

> **Bạn là ai trong công ty?** Trong **Mục lục** (hoặc ở menu **Hướng dẫn sử dụng**) có bài *"Bắt đầu với AZWorkbase"* viết riêng cho từng nhóm: **Admin, Assistant, Sale, Content, Media**. Hãy mở bài đúng với bạn để biết menu của bạn có những trang nào và dùng để làm gì.

## Khung màn hình

- **Menu bên trái (Sidebar):** danh sách các trang bạn được dùng. Bấm biểu tượng thu/mở ở đầu menu để thu gọn. Một số mục có số đếm nhỏ (ví dụ số đơn nghỉ phép đang chờ duyệt).
- **Thanh trên cùng (Header):** tên trang đang mở, ô tìm trang nhanh, nút **Xem hướng dẫn trang này**, ngày hôm nay, chuông thông báo, và ảnh/tên của bạn kèm vai trò. Bấm vào tên của bạn để **Đăng xuất**.
- **Trang chủ:** hiện các thẻ lối tắt tới những trang bạn được phép dùng, kèm mô tả ngắn.

## Tìm trang nhanh (Ctrl + K)

Ở bất kỳ trang nào, bấm vào ô **Tìm trang...** trên Header, hoặc nhấn **Ctrl + K** (máy Mac: **⌘ K**). Gõ tên trang (không cần gõ dấu), dùng phím **↑ ↓** để chọn, **Enter** để mở. Chỉ hiện những trang bạn được phép vào.

```az-demo
header-search
```

## Xem hướng dẫn của trang đang mở

Nút **Xem hướng dẫn trang này** trên Header đưa bạn thẳng tới bài hướng dẫn của trang hiện tại. Nút tự ẩn nếu trang đó chưa có bài hướng dẫn, hoặc bài không dành cho bạn. Cách đọc hướng dẫn: xem bài [Hướng dẫn đọc bài](/huong-dan/huong-dan-su-dung).

## Vì sao tôi thấy khác đồng nghiệp?

Hệ thống phân quyền theo **vai trò** (Admin, Manager, Assistant, Employee hoặc vai trò tuỳ chỉnh) và **Quản trị viên chỉnh quyền từng vai trò**. Vì vậy:

- Menu chỉ hiện những trang bạn có quyền. Thiếu quyền thì trang đó không xuất hiện.
- Trong cùng một trang, **dữ liệu bạn thấy phụ thuộc phạm vi quyền**: chỉ dữ liệu của mình, của phòng ban mình quản lý, hoặc tất cả.
- Quản trị viên có thể **ẩn một số cột/tab** theo vị trí hoặc phòng ban.
- Nút thao tác (Thêm, Nhập Excel, Xoá...) chỉ hiện khi bạn có quyền tương ứng.

Ví dụ bảng Khách hàng nhìn khác nhau tuỳ người xem. Bấm các nút ở **Xem với tư cách** để so sánh:

```az-demo
customer-table-by-viewer persona=sales-primary
```

Khi bạn không đủ quyền làm một việc, hệ thống báo như sau:

```az-demo
permission-note
```

## Vì sao tôi không thấy trang/nút/dữ liệu cần dùng?

1. Kiểm tra bạn có đúng **quyền** không: hỏi Quản trị viên hoặc quản lý của bạn.
2. Dữ liệu có thể **nằm ngoài phạm vi** của bạn (không phải do bạn tạo, không được chia, không thuộc phòng ban bạn quản lý).
3. Cột/tab có thể đã bị **ẩn theo vị trí** hoặc phòng ban của bạn.
4. Vừa được đổi quyền? Tải lại trang (F5) hoặc đăng nhập lại.

## Xem thêm

- [Hướng dẫn đọc bài](/huong-dan/huong-dan-su-dung)
- [Khách hàng](/huong-dan/khach-hang)