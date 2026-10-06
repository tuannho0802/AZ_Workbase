---
title: Nhóm tôi quản lý
slug: nhom-toi-quan-ly
sortOrder: 80
published: false
roles: []
positions: []
departments: []
permissions: [link_groups.my_managed]
---

## Trang này để làm gì

**Nhóm tôi quản lý** là trang cá nhân liệt kê các nhóm liên kết (nhóm Zalo, Facebook...) mà **bạn được gán phụ trách**. Từ đây bạn làm được 2 việc:

- Xem ai đang quản lý nhóm và (nếu bạn là Quản lý chính) thêm/gỡ **Quản lý phụ** và **Nhân viên Content**.
- Xem **danh sách khách hàng đã tham gia nhóm** để đối chiếu.

Việc tạo nhóm, sửa URL, ẩn/hiện nhóm và gán Quản lý chính nằm ở trang **Quản lý nhóm liên kết**, xem bài [Quản lý nhóm liên kết](/huong-dan/nhom-lien-ket).

```az-demo
my-groups-table
```

## Ai vào được & thấy nhóm nào

Vào trang cần quyền **Xem trang "Nhóm tôi quản lý"** (`link_groups.my_managed`). Theo cấu hình mặc định, **cả 4 vai trò** đều có quyền này; Admin có thể tắt riêng từng vai trò ở trang **Phân quyền**. Thiếu quyền thì mục không hiện ở menu, và nếu gõ thẳng địa chỉ trang, bạn bị đưa về Trang chủ kèm thông báo "Bạn không có quyền truy cập trang này".

Danh sách nhóm hiện ra tuỳ bạn là ai:

| Bạn là | Thấy những nhóm nào |
|---|---|
| Admin gốc | **Tất cả** nhóm trong hệ thống |
| Người có quyền **Quản lý nhóm liên kết** (`link_groups.manage`, mặc định là Assistant) | **Tất cả** nhóm, giống Admin |
| Nhân viên thường | Chỉ nhóm bạn được gán là **Quản lý chính**, **Quản lý phụ** hoặc **Nhân viên Content** |

Nhóm **đang ẩn** vẫn hiện ở đây (ẩn chỉ ảnh hưởng checklist Nhóm ở form khách hàng).

Với Admin, dòng chú thích đầu trang đổi thành "Bạn đang xem với quyền admin - hiển thị TẤT CẢ nhóm...":

```az-demo
my-groups-table viewer=admin
```

## Bắt đầu nhanh

1. Mở **Nhóm tôi quản lý** ở menu. Nếu bảng trống, bạn chưa được gán vào nhóm nào: nhờ Admin hoặc Quản lý chính của nhóm thêm bạn.
2. Dùng ô **Tìm theo tên nhóm/URL...** hoặc lọc theo **Nền tảng**, **Vai trò của tôi** để tìm nhóm.
3. Bấm **Quản lý** để xem Quản lý chính/phụ và Nhân viên Content của nhóm.
4. Bấm **Xem khách hàng (N)** để mở danh sách khách đã tham gia nhóm.

## Giải thích từng cột và nút

| Cột / Nút | Ý nghĩa |
|---|---|
| Nền tảng | Category của nhóm (Zalo, Facebook...), hiện bằng Tag màu |
| Tên nhóm, URL | Tên nhóm và đường dẫn riêng (bấm URL để mở nhóm ở tab mới) |
| Quản lý chính | Người phụ trách chính, hoặc "Chưa gán" |
| Quản lý phụ | Các Quản lý phụ (Tag), hoặc "Chưa có" |
| Vai trò của tôi | Tag **Admin** (tím) nếu bạn là Admin; tag vàng **Quản lý chính** nếu bạn là Quản lý chính; còn lại là tag xanh **Quản lý phụ** (xem lưu ý bên dưới) |
| **Quản lý** | Mở hộp thoại Quản lý chính/phụ & Nhân viên Content |
| **Xem khách hàng (N)** | Mở danh sách khách đã tham gia nhóm. N là số khách đã tham gia. Chỉ hiện khi bạn có quyền **Xem khách hàng** (`customers.view`) |

Bộ lọc **Vai trò của tôi** (Quản lý chính / Quản lý phụ) chỉ có tác dụng với nhân viên thường; Admin thấy cột này luôn là "Admin" nên lọc không đổi kết quả.

> **Lưu ý cột "Vai trò của tôi":** ngoài Admin, trang chỉ phân biệt "Quản lý chính" và "Quản lý phụ". Nếu bạn vào nhóm với tư cách **Nhân viên Content** hoặc nhờ quyền rộng (Assistant), cột vẫn hiện tag "Quản lý phụ" dù thực tế vai trò của bạn khác. Đây chỉ là nhãn hiển thị, không đổi quyền thật của bạn.

## Hộp thoại "Quản lý"

Hộp thoại này giống hệt hộp thoại **Quản lý phụ / Content** ở trang Quản lý nhóm liên kết (có ảnh minh hoạ ở [bài đó](/huong-dan/nhom-lien-ket)).

| Việc | Admin | Quản lý chính | Quản lý phụ | Nhân viên Content |
|---|---|---|---|---|
| **Mở** hộp thoại, xem danh sách | Có | Có | Có | Có |
| Thêm / gỡ Quản lý phụ, Nhân viên Content | Có | Có | Không | Không |
| Đổi **Quản lý chính** | Không (làm ở trang Quản lý nhóm liên kết) | Không | Không | Không |

- Người không có quyền sửa thấy hộp thoại ở chế độ chỉ xem, kèm dòng "Chỉ Quản lý chính (hoặc admin) mới có quyền thêm/xoá...".
- Trên giao diện, nút **Thêm** và nút gỡ chỉ hiện với **Admin** và **Quản lý chính** của nhóm đó.
- Nhóm chưa có Quản lý chính thì chỉ Admin thêm được người.

## Hộp thoại "Khách hàng trong nhóm"

```az-demo
group-customers-modal
```

- Chỉ **xem**: không sửa, không gỡ khách khỏi nhóm ở đây.
- Chỉ hiện khách **đã tham gia** nhóm (đã được tick "đã tham gia" ở tab **Nhóm** của khách hàng) và **chưa bị xoá** (khách trong Thùng rác không hiện, cũng không được tính vào N).
- Bộ lọc: tìm theo tên/SĐT, **Nguồn**, **Trạng thái**, **Sales**, **Marketing**, khoảng **Ngày nhập**. Bấm **Xoá bộ lọc** để về ban đầu. Mỗi trang 10 khách.
- Cột **Ngày nhập** là ngày nhập khách, rê chuột vào để xem giờ nhập thực tế. Cột **Ngày join nhóm** là ngày khách được đánh dấu đã tham gia nhóm.

### Phạm vi khách hiện ở đây khác với trang Khách hàng

Danh sách này **không áp phạm vi xem** của trang Khách hàng (Của tôi / Phòng ban / Tất cả). Người được xem nhóm sẽ thấy **mọi khách đã tham gia nhóm đó**, kể cả khách không thuộc phạm vi bình thường của bạn. Điều kiện duy nhất là bạn có quyền `customers.view` và được xem nhóm.

Tuy vậy, cột **Sales chính** và **Marketing** vẫn theo cấu hình ẩn trường: nếu Admin đã ẩn "Sales phụ trách" hoặc "Marketing phụ trách" cho vị trí/phòng ban của bạn (ví dụ vị trí Content), các cột đó hiện **—**.

## Vì sao tôi không thấy...?

- **Không có mục "Nhóm tôi quản lý" ở menu:** vai trò của bạn đã bị tắt quyền xem trang. Nhờ Admin kiểm tra.
- **Bảng trống:** bạn chưa là Quản lý chính, phụ hay Nhân viên Content của nhóm nào. Dòng gợi ý trong bảng cũng nói vậy.
- **Không thấy nút "Xem khách hàng":** bạn thiếu quyền `customers.view`.
- **N bằng 0 / danh sách khách trống:** chưa ai được tick "đã tham gia" nhóm này, hoặc các khách đó đã nằm trong Thùng rác. Tick tham gia nhóm làm ở tab **Nhóm** của khách hàng, xem [Khách hàng](/huong-dan/khach-hang).
- **Nhóm vừa được gán nhưng chưa thấy:** danh sách được lưu tạm khoảng 30 giây, tải lại trang nếu cần.
- **Không thấy nút Thêm trong hộp thoại Quản lý:** bạn không phải Admin hay Quản lý chính của nhóm đó.

## Xem thêm

- [Quản lý nhóm liên kết](/huong-dan/nhom-lien-ket)
- [Khách hàng](/huong-dan/khach-hang)
- [Quản lý phụ trách](/huong-dan/quan-ly-phu-trach) (cấu hình ai được chọn làm Quản lý phụ / Content)
