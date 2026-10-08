---
title: Vị trí
slug: vi-tri
sortOrder: 130
published: false
roles: []
positions: []
departments: []
permissions: [positions.view]
---

## Trang này để làm gì

Trang **Quản lý Vị trí** (mục **Vị trí** ở menu) là danh mục các **Vị trí** như Content, Editor, Media, HR, Director... Vị trí được gắn thêm cho nhân viên **bên cạnh Vai trò (Role)** và dùng để:

1. **Ghi đè quyền** chi tiết hơn Vai trò (cấu hình ở trang **Phân quyền**, tab **Theo Vị trí**).
2. **Ẩn/hiện cột và tab của trang Khách hàng** riêng cho từng Vị trí (cấu hình ngay trên trang này, nút **Hiển thị dữ liệu**).

Mỗi nhân viên có **một** Vai trò (bắt buộc) và **tối đa một** Vị trí (không bắt buộc). Vị trí được gán ở trang **Nhân viên** (hoặc người dùng chọn khi đăng ký, Admin chốt lại khi duyệt).

## Ai dùng được & thấy gì

Vào trang cần quyền **Xem vị trí** (`positions.view`). Mỗi việc trên trang cần thêm một quyền riêng:

| Việc | Cần quyền | Mặc định |
|---|---|---|
| Vào trang, xem danh sách | `positions.view` | Cả 4 vai trò: Admin, Assistant, Manager, Employee |
| Nút **Thêm vị trí**, nút **Sửa** | `positions.manage` | Admin, Assistant |
| Nút **Xoá** | `positions.delete` | Chỉ Admin |
| Nút **Hiển thị dữ liệu** | `roles.manage` (quyền chỉnh Phân quyền) | Chỉ Admin |

Admin có thể đổi các quyền này ở trang **Phân quyền**, nên bảng trên là *mặc định*. Nếu bạn không có `positions.view`, mục menu bị ẩn và gõ thẳng đường dẫn sẽ đưa bạn về trang Khách hàng. Thu quyền này chỉ ẩn **trang quản lý**; các ô chọn Vị trí ở nơi khác (Nhân viên, Chia Data...) vẫn dùng bình thường.

```az-demo
position-table viewer=admin
```

```az-demo
position-table viewer=assistant
```

```az-demo
position-table viewer=employee
```

Dữ liệu trong mẫu là giả định. Với Employee (chỉ có quyền xem), trang không có nút **Thêm vị trí** và **không có cả cột Thao tác**. Dòng "Kiểm soát" trong mẫu cố ý mang nhãn **Hệ thống** để minh hoạ: vị trí Hệ thống không có nút **Xoá**.

## Bắt đầu nhanh

**Thêm một vị trí**

1. Bấm **Thêm vị trí**.
2. Nhập **Mã vị trí** và **Tên vị trí**; có thể chọn **Phòng ban (gợi ý)**, **Mô tả**, **Màu hiển thị (Tag)**.
3. Bấm **OK**. Hệ thống báo “Đã tạo vị trí mới”.

**Gán vị trí cho nhân viên**: vào trang **Nhân viên**, sửa nhân viên và chọn ô **Vị trí**.

**Ẩn cột/tab Khách hàng cho một vị trí**: xem mục “Hiển thị dữ liệu” bên dưới.

## Cửa sổ Thêm / Sửa vị trí

```az-demo
position-form mode=create
```

```az-demo
position-form mode=edit
```

| Ô | Ý nghĩa |
|---|---|
| **Mã vị trí** | Chỉ khi **Thêm**. Chỉ chữ thường, số và dấu gạch dưới (ví dụ `content`, `hr`), tối đa 50 ký tự. **Không đổi được sau khi tạo** (cửa sổ Sửa không có ô này). Trùng mã sẽ báo “Mã vị trí ... đã tồn tại”. |
| **Tên vị trí** | Bắt buộc, tối đa 100 ký tự. Hệ thống chỉ kiểm tra trùng **Mã**, không kiểm tra trùng Tên. |
| **Phòng ban (gợi ý, không bắt buộc)** | Chỉ để nhóm hiển thị trong danh sách. **Không** ràng buộc nhân viên phải thuộc phòng ban đó mới được gán vị trí. |
| **Mô tả (tuỳ chọn)** | Ghi chú ngắn, tối đa 255 ký tự. |
| **Màu hiển thị (Tag)** | Màu Tag vị trí ở bảng và các nơi liên quan (chi tiết khách hàng, chọn Sales/Marketing phụ trách...). |

## Giải thích bảng danh sách

- **Mã vị trí**, **Tên vị trí** (Tag màu), **Phòng ban (gợi ý)**, **Mô tả** (hiện “—” nếu trống).
- **Loại**: **Hệ thống** (vàng) hoặc **Tuỳ chỉnh**. Các vị trí mẫu có sẵn (CEO, HR, IT, Director, Content, Editor, Media) đều là **Tuỳ chỉnh**.
- **Thao tác**: **Hiển thị dữ liệu**, **Sửa**, **Xoá** theo quyền của bạn. Cột này không hiện nếu bạn không có quyền nào trong ba quyền tương ứng.
- **Bộ lọc** phía trên bảng: ô **Tìm theo tên hoặc mã vị trí...** (không phân biệt hoa thường), ô **Phòng ban** và ô **Loại**. Bảng xếp theo tên A đến Z, không phân trang.

## Vị trí và quyền: thứ tự ưu tiên

Với mỗi hành động, hệ thống tìm quyền của một Vai trò theo thứ tự, gặp tầng nào có cấu hình thì dùng tầng đó:

**Vị trí** → **Phòng ban** → **Toàn cục**

- Đây là thứ tự **tuyến tính**, không phải tổ hợp “Phòng ban × Vị trí”.
- Cấu hình theo Vị trí áp dụng cho nhân viên mang vị trí đó **bất kể họ thuộc phòng ban nào**.
- Phần ghi đè **quyền hành động** làm ở trang **Phân quyền**, không làm ở trang này.

## Hiển thị dữ liệu (ẩn/hiện cột và tab Khách hàng)

Bấm **Hiển thị dữ liệu** (cần `roles.manage`) để mở ngăn **Cấu hình hiển thị dữ liệu - Vị trí "..."**.

```az-demo
position-visibility state=inherit
```

```az-demo
position-visibility state=override
```

1. **Chọn Role** ở ô trên cùng. Bắt buộc, vì mỗi Role được cấu hình riêng (cùng một Vị trí có thể gắn với nhiều Role).
2. Gạt từng mục **Hiện / Ẩn**. Có 7 mục: 4 **cột dữ liệu** (Sales phụ trách, Marketing phụ trách, Ngày nhận khách, Ngày chốt khách) và 3 **tab trong chi tiết khách hàng** (Lịch sử nạp tiền (FTD), Phân công, Nhóm khách hàng).
3. Bấm **Lưu** (mờ cho tới khi bạn đổi gì đó). Hệ thống báo “Đã lưu cấu hình hiển thị cho Vị trí ...”.
4. Muốn quay lại như cũ, bấm **Gỡ override**. Nút này chỉ hiện khi vị trí đã có cấu hình riêng.

Điều cần biết:

- Ngăn mở ra ở trạng thái **đang có hiệu lực** (đã gộp Toàn cục/Phòng ban với cấu hình riêng của vị trí). Mặc định mọi mục là **Hiện**.
- Cấu hình áp dụng cho **mọi nhân viên có đúng Role đó và đang mang Vị trí này**, bất kể phòng ban.
- Cột bị ẩn bị **bỏ hẳn khỏi dữ liệu máy chủ trả về**, không chỉ ẩn ở giao diện; bộ lọc liên quan trên trang Khách hàng cũng tự ẩn. Riêng **tab** chỉ ẩn ở giao diện (dữ liệu của tab vẫn có quyền riêng).
- Bấm **Lưu** sẽ lưu **cả 7 mục** thành cấu hình riêng của vị trí (kể cả mục bạn không đổi). Về sau, nếu Admin đổi cấu hình chung ở các mục đó thì vị trí này **không đổi theo** cho tới khi **Gỡ override**.
- **Gỡ override** chỉ xoá cấu hình của **Role đang chọn** cho vị trí này; các Role khác giữ nguyên.
- Tài khoản **Admin gốc (Root Admin)** luôn thấy đủ, không bị ẩn. Admin thường vẫn có thể bị ẩn.
- Người bị đổi cấu hình có thể cần **tải lại trang** (hoặc chờ vài phút) mới thấy thay đổi.

## Xoá vị trí

Cần quyền `positions.delete` (mặc định chỉ Admin). Vị trí **Hệ thống** không có nút **Xoá**.

```az-demo
position-delete variant=has-users
```

```az-demo
position-delete variant=free
```

- Hệ thống **từ chối** nếu còn nhân viên đang mang vị trí này (kể cả tài khoản đang bị khoá) và báo số nhân viên. Hãy vào trang **Nhân viên** đổi hoặc gỡ vị trí cho họ trước.
- Khi xoá thành công, **các cấu hình gắn với vị trí đó bị xoá theo**: ghi đè quyền theo Vị trí, cấu hình Hiển thị dữ liệu, vị trí đó trong các **nhóm phụ trách**, và việc giới hạn bài hướng dẫn theo vị trí đó.
- Xoá không hoàn tác được từ giao diện.

## Quy tắc & lưu ý

- **Mã vị trí** là định danh cố định: chọn kỹ khi tạo, vì không sửa được.
- Tạo, sửa, xoá vị trí và lưu/gỡ cấu hình Hiển thị dữ liệu đều được ghi vào **Nhật ký hệ thống**.
- Một nhân viên chỉ có **một** vị trí. Đổi vị trí của họ làm họ nhận cấu hình của vị trí mới.

## Vì sao tôi không thấy …?

- **Không thấy mục Vị trí trong menu**: tài khoản của bạn chưa có `positions.view`. Nhờ Admin cấp ở trang **Phân quyền**.
- **Không có nút Thêm vị trí / Sửa**: bạn chưa có `positions.manage`.
- **Không có nút Xoá**: bạn chưa có `positions.delete`, hoặc vị trí đó mang nhãn **Hệ thống**.
- **Không có nút Hiển thị dữ liệu**: bạn chưa có `roles.manage` (mặc định chỉ Admin).
- **Nhân viên mang vị trí không thấy cột Sales/Marketing phụ trách hoặc tab FTD**: có thể vị trí của họ đang bị ẩn mục đó. Mở **Hiển thị dữ liệu**, chọn đúng Role của họ để kiểm tra.
- **Vừa đổi cấu hình mà nhân viên chưa thấy khác**: nhờ họ tải lại trang.

## Xem thêm

- [Nhân viên](/huong-dan/nhan-vien): gán Vị trí cho nhân viên.
- [Phòng ban](/huong-dan/phong-ban): tầng ghi đè quyền theo phòng ban.
- [Quản lý phụ trách](/huong-dan/quan-ly-phu-trach): lọc người được chọn theo Phòng ban và Vị trí.
- [Khách hàng](/huong-dan/khach-hang): các cột và tab có thể bị ẩn theo Vị trí.
