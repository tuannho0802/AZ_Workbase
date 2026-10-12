---
title: Phân quyền
slug: phan-quyen
sortOrder: 140
published: false
roles: []
positions: []
departments: []
permissions: [roles.manage]
---

## Trang này để làm gì

Trang **Phân quyền** cho phép tạo **Role tuỳ chỉnh** và quyết định mỗi Role được làm gì (xem, sửa, xoá, duyệt...) trên từng chức năng. Thay đổi ở đây tác động trực tiếp tới API; Sidebar và các nút bấm tự ẩn/hiện theo trong tối đa khoảng 60 giây, không cần triển khai lại.

## Ai dùng được & thấy gì

Vào trang cần quyền **Xem phân quyền** (`roles.view`). Việc chỉnh sửa cần thêm `roles.manage`.

| Việc | Cần quyền |
|---|---|
| Vào trang, xem danh sách Role, bấm **Xem quyền** | `roles.view` |
| **Tạo Role mới**, **Sửa quyền**, **Sửa tên**, **Xoá** | `roles.manage` |
| Tab **Theo phòng ban** trong ngăn Ma trận quyền: danh sách phòng ban | `departments.view` (thêm vào `roles.manage`) |
| Tab **Theo Vị trí**: danh sách vị trí | `positions.view` (thêm vào `roles.manage`) |

Người chỉ có `roles.view` thấy thanh thông báo "Chỉ xem", các ô tích bị khoá và **không có** các tab Theo phòng ban / Theo Vị trí.

```az-demo
permission-matrix viewer=manage
```

```az-demo
permission-matrix viewer=view
```

## Bắt đầu nhanh

1. Ở bảng **Role**, bấm **Sửa quyền** trên Role cần chỉnh. Ngăn **Ma trận quyền** mở ra ở tab **Toàn cục**.
2. Tích vào quyền muốn bật. Với quyền có phạm vi, chọn **Chỉ của mình**, **Phòng ban quản lý** hoặc **Toàn bộ** (mặc định khi vừa tích là phạm vi hẹp nhất, **Chỉ của mình**).
3. Bấm **Lưu thay đổi**. Muốn khác đi cho một phòng ban hoặc một Vị trí, chuyển sang tab **Theo phòng ban** / **Theo Vị trí**, chọn đối tượng rồi lưu.

## Giải thích từng cột / nút / bộ lọc

**Bảng Role**: cột **Role** (tên có màu, nhãn **Hệ thống** cho Role hệ thống, dòng nhỏ `code:` là mã), **Mô tả**, **Số quyền đang bật** (số quyền trong ma trận Toàn cục), **Thao tác**.

- **Sửa quyền** (hoặc **Xem quyền** nếu bạn chỉ có `roles.view`): mở ngăn Ma trận quyền.
- **Sửa tên**: đổi tên hiển thị, mô tả, màu. **Mã Role (code)** chỉ nhập lúc tạo và không đổi được sau đó.
- **Xoá**: chỉ có ở Role không phải Hệ thống. Khi xoá, những nhân viên đang mang Role đó được chuyển về Role `employee`.

**Ngăn Ma trận quyền**: quyền được nhóm theo chức năng. Mỗi dòng có ô tích, tên hành động, mô tả, và (khi đã tích, quyền có phạm vi) bộ chọn phạm vi. Thẻ cam **Ghi đè** hiện khi dòng đó khác với ma trận Toàn cục.

### Ba tầng ghi đè

Quyền hiệu lực của một người được tính theo thứ tự **Toàn cục → Phòng ban → Vị trí**; tầng sau đè tầng trước. Bỏ tích một quyền ở tầng Phòng ban hoặc Vị trí nghĩa là **tắt quyền đó riêng cho phòng ban/vị trí ấy**, dù Toàn cục đang bật.

```az-demo
override-layers layer=global
```

```az-demo
override-layers layer=position
```

Ở tab Theo phòng ban/Theo Vị trí, chọn đối tượng từ danh sách (mục đang có override ghi thêm "(đang override)"); nút **Gỡ override** đưa đối tượng về dùng lại tầng trước.

### Ẩn/hiện cột và tab

Việc ẩn/hiện cột và tab của trang Khách hàng **không nằm** trong ngăn này. Cấu hình ở trang **Vị trí**, nút **Hiển thị dữ liệu** (xem [Vị trí](/huong-dan/vi-tri)). Quy tắc tầng giống nhau: Vị trí đè Phòng ban đè Toàn cục.

```az-demo
ui-visibility-matrix
```

## Quy tắc & lưu ý nghiệp vụ

- **Phạm vi**: **Chỉ của mình** (dữ liệu của chính mình), **Phòng ban quản lý** (các phòng ban mình quản lý), **Toàn bộ**. Quyền không có phạm vi chỉ có bật/tắt.
- Ma trận **Toàn cục** không có khái niệm "từ chối"; từ chối chỉ có ở override theo phòng ban/Vị trí.
- Lưu ma trận **Toàn cục** chỉ ghi đè phần Toàn cục, **không xoá** các override phòng ban/Vị trí đã đặt.
- Không thể tự tạo quyền mới ở đây: danh mục quyền do đội phát triển thêm sẵn. Trang chỉ bật/tắt các quyền đó.
- Hệ thống chặn gỡ `roles.manage` khỏi Role cuối cùng còn giữ quyền này, để không ai bị khoá khỏi trang Phân quyền.
- Chỉ **Root Admin** (Role `admin` và được đánh dấu Root Admin) luôn có mọi quyền, bất kể ma trận. Admin thường vẫn đi theo ma trận như Role khác.
- Role hệ thống không xoá được; Role tuỳ chỉnh xoá được kể cả khi còn người dùng (họ được chuyển về `employee`).

## Vì sao tôi không thấy …?

- Không thấy mục **Phân quyền** ở menu: bạn thiếu `roles.view`.
- Không có nút **Tạo Role mới**, **Sửa tên**, **Xoá** hoặc tab Theo phòng ban/Theo Vị trí: bạn thiếu `roles.manage`.
- Vào tab Theo phòng ban thấy cảnh báo thiếu quyền: cần thêm `departments.view` (tương tự `positions.view` cho Vị trí).
- Vừa đổi quyền mà người khác chưa thấy thay đổi: chờ tối đa khoảng 60 giây hoặc tải lại trang.

## Xem thêm

- [Vị trí](/huong-dan/vi-tri)
- [Phòng ban](/huong-dan/phong-ban)
- [Nhân viên](/huong-dan/nhan-vien)
