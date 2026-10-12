---
title: Nhật ký hệ thống
slug: nhat-ky-he-thong
sortOrder: 150
published: false
roles: []
positions: []
departments: []
permissions: [audit.view]
---

## Trang này để làm gì

Trang **Nhật ký hệ thống** ghi lại **ai đã làm gì, lúc nào** trên hệ thống: sửa khách hàng, chia data, đổi quyền, duyệt nghỉ phép, xoá dữ liệu... Dùng để tra cứu khi cần biết ai đã thay đổi một thông tin, hoặc kiểm tra một thao tác có thật sự xảy ra hay không.

## Ai dùng được & thấy gì

Vào trang cần quyền **Xem nhật ký** (`audit.view`). Các việc dọn dẹp cần thêm **Quản lý nhật ký** (`audit.manage`).

| Việc | Cần quyền |
|---|---|
| Vào trang, xem tab **Danh sách nhật ký** và **Đăng nhập**, mở **Chi tiết** | `audit.view` |
| Nút **Dọn dẹp theo thời gian**, ô chọn dòng + nút **Xóa đã chọn**, tab **Cài đặt dọn dẹp** | `audit.manage` |

Mặc định cả hai quyền được cấp cho Admin và Assistant; Admin có thể đổi ở trang **Phân quyền**. Nếu thiếu `audit.view`, mục menu bị ẩn và gõ thẳng đường dẫn sẽ đưa bạn về trang Khách hàng.

## Bắt đầu nhanh

1. Mở **Nhật ký hệ thống**. Nhật ký được gom theo **tuần**, mở một tuần để xem các dòng.
2. Dùng thanh bộ lọc phía trên (người thực hiện, loại hành động, đối tượng, khoảng ngày) rồi bấm **Lọc**.
3. Bấm biểu tượng **Chi tiết** (chữ i) ở cuối dòng để xem dữ liệu **trước và sau** khi thay đổi.

## Giải thích từng cột / nút / bộ lọc

### Cách đọc một dòng

```az-demo
audit-row kind=customer
```

- **Thời gian**: giờ:phút:giây ở trên, ngày/tháng/năm ở dưới.
- **Người thực hiện**: tên người làm và nhãn vai trò của họ.
- **Hành động**: nhãn có màu mô tả việc đã làm (ví dụ **Sửa khách hàng**, **Sửa quyền của Role**, **Admin dọn dẹp nhật ký**).
- **Đối tượng**: loại dữ liệu bị tác động (chữ nhỏ viết hoa, ví dụ KHÁCH HÀNG, ROLE / PHÂN QUYỀN) và tên cụ thể. Với khách hàng, bấm tên để mở khách hàng đó; nhãn **Đã xóa** hoặc dòng "(Khách hàng đã xóa)" nghĩa là khách hàng đã vào thùng rác hoặc bị xoá.
- **Chi tiết**: mở ngăn **Chi tiết hành động** gồm phần **Ngữ cảnh** (khách hàng, hành động, đối tượng, thời gian) và **Dữ liệu thay đổi**.

```az-demo
audit-row kind=role
```

### Bộ lọc

```az-demo
audit-filters tab=main
```

- **Người thực hiện...**: chọn chính xác một nhân viên từ danh sách (gõ tên hoặc email để tìm).
- **Tìm tên khách hàng...**: gõ tay tên khách hàng rồi nhấn Enter hoặc **Lọc**.
- **Loại hành động**: chọn theo 2 cấp **Nhóm → Hành động** (Khách hàng & Data, Nhân viên & Tài khoản, Phân quyền, Chấm công, Nghỉ phép...). Có thể gõ để tìm cả tên nhóm lẫn tên hành động.
- **Đối tượng**: lọc theo loại dữ liệu (Khách hàng, Nhân viên, Role / Phân quyền, Phòng ban, Vị trí...).
- **Khoảng ngày** và nút **Lọc**. Nút mũi tên tròn đặt lại bộ lọc.

### Tab Đăng nhập

Log đăng nhập được tách riêng để không làm rối danh sách chính (tab **Danh sách nhật ký** không hiện lượt đăng nhập). Tab **Đăng nhập** chỉ có lọc theo người đăng nhập và khoảng ngày, và chỉ tải khi bạn mở tab lần đầu.

```az-demo
audit-filters tab=login
```

### Dọn dẹp (cần `audit.manage`)

- **Dọn dẹp theo thời gian**: chọn khoảng ngày, gõ **XÁC NHẬN** để xoá mọi nhật ký trong khoảng đó (gồm cả ngày cuối).
- **Xóa đã chọn (N)**: tích các dòng ở danh sách rồi xoá, cũng phải gõ **XÁC NHẬN**. Nút chỉ hiện trên máy tính, khi đã chọn ít nhất một dòng.
- Tab **Cài đặt dọn dẹp**: công tắc **Tự động dọn dẹp** và **Thời gian lưu giữ (ngày)** (mặc định 90). Bấm **Lưu cấu hình** rồi xác nhận để lưu (xem lưu ý bên dưới về tự động dọn dẹp).

## Quy tắc & lưu ý nghiệp vụ

- Nhật ký chỉ **ghi lại**, không sửa được. Xoá nhật ký **không hoàn tác** được.
- Chính việc dọn dẹp cũng được ghi lại (**Admin dọn dẹp nhật ký**, **Admin xóa nhật ký hàng loạt**, **Cập nhật cấu hình dọn dẹp nhật ký**), nên vẫn biết ai đã xoá.
- Nhật ký cũ có thể còn hành động đã bị gỡ khỏi hệ thống; khi đó nhãn hiển thị là tên suy ra từ mã hành động.
- Công tắc **Tự động dọn dẹp** hiện **chỉ lưu cấu hình**: tiến trình tự xoá lúc 3:00 sáng trong mã nguồn đang bị tắt nên nhật ký **không** tự mất theo số ngày lưu giữ. Muốn dọn, dùng **Dọn dẹp theo thời gian**.

## Vì sao tôi không thấy …?

- Không thấy mục **Nhật ký hệ thống** ở menu: bạn thiếu `audit.view`.
- Không thấy nút **Dọn dẹp theo thời gian**, ô tích dòng hoặc tab **Cài đặt dọn dẹp**: bạn thiếu `audit.manage`.
- Không thấy lượt đăng nhập trong danh sách chính: chúng nằm ở tab **Đăng nhập**.
- Không thấy một thao tác vừa làm: bấm nút làm mới ở thanh bộ lọc, kiểm tra khoảng ngày đang lọc, hoặc nhật ký đã bị dọn.

## Xem thêm

- [Phân quyền](/huong-dan/phan-quyen)
- [Thùng rác](/huong-dan/thung-rac)
