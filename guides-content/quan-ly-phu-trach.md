---
title: Quản lý phụ trách
slug: quan-ly-phu-trach
sortOrder: 30
published: true
roles: []
positions: []
departments: []
permissions: [assignment_groups.view]
---

## Trang này để làm gì

Trang **Quản lý phụ trách** quyết định **ai xuất hiện trong các ô chọn người phụ trách** trên toàn hệ thống: "Sales phụ trách", "Marketing phụ trách", "Nhân viên Content", "Quản lý chính/phụ" của nhóm liên kết... Admin cấu hình một lần ở đây, không cần nhờ lập trình viên khi tổ chức thay đổi.

Mỗi **nhóm phụ trách** gồm:

- **Phòng ban** (**bắt buộc** chọn ít nhất 1): chỉ nhân viên thuộc các phòng ban này mới được liệt kê.
- **Vị trí** (**tuỳ chọn**): nếu chọn, chỉ nhân viên có đúng các vị trí này; để trống = **không lọc theo vị trí**.

Chỉ nhân viên **đang hoạt động** và **đã được duyệt tài khoản** mới được liệt kê.

## Ai dùng được

Vào trang cần quyền **Xem Quản lý phụ trách** (`assignment_groups.view`). Các nút còn lại gate riêng:

| Nút | Cần quyền |
|---|---|
| **Thêm nhóm phụ trách** | `assignment_groups.create` |
| **Sửa** | `assignment_groups.update` |
| **Xoá** | `assignment_groups.delete` |

Không có quyền xem thì bạn bị đưa về trang **Khách hàng**. Cột **Thao tác** chỉ hiện khi bạn có quyền Sửa hoặc Xoá.

## Nhóm phụ trách ảnh hưởng đến đâu

Có 5 nhóm **hệ thống** được tạo sẵn, mỗi nhóm điều khiển một chỗ cụ thể:

| Key | Điều khiển | Mặc định ban đầu |
|---|---|---|
| `sales` | Ô **Sales phụ trách** khi thêm/sửa khách, bộ lọc Sales ở trang Khách hàng, ô **Chọn Sales nhận data** ở [Chia Data](/huong-dan/chia-data) | Phòng ban có tên chứa "kinh doanh" |
| `marketing` | Ô **Marketing phụ trách** và bộ lọc Marketing ở trang Khách hàng | Phòng ban có tên chứa "marketing" |
| `content_staff` | Ô **Nhân viên Content** ở trang Quản lý nhóm liên kết | Phòng Marketing, vị trí Content |
| `link_group_primary_manager` | Ô **Quản lý chính** của nhóm liên kết | Phòng Marketing |
| `link_group_secondary_manager` | Ô **Quản lý phụ** của nhóm liên kết | Phòng Marketing |

Xem ví dụ: đổi Phòng ban/Vị trí của nhóm **Sales phụ trách** thì danh sách trong ô chọn đổi theo.

```az-demo
assignment-group-picker
```

## Bắt đầu nhanh

### 1. Sửa một nhóm có sẵn

1. Bấm **Sửa** ở dòng nhóm cần đổi (ví dụ **Sales phụ trách**).
2. Chọn lại **Phòng ban** (ít nhất 1) và, nếu muốn thu hẹp, **Vị trí**.
3. Có thể đổi **Tên hiển thị**, **Mô tả** và **màu** Tag của nhóm.
4. Bấm **OK** để lưu. Thông báo "Đã cập nhật Quản lý phụ trách".

**Key không đổi được** sau khi tạo (nó là định danh mà hệ thống dùng để tra danh sách).

### 2. Thêm nhóm mới

1. Bấm **Thêm nhóm phụ trách**.
2. Điền **Key** (chỉ chữ thường, số, dấu gạch dưới, tối đa 50 ký tự), **Tên hiển thị**, **Phòng ban** (bắt buộc), **Vị trí** (tuỳ chọn), **Mô tả**.
3. Bấm **OK**. Key đã tồn tại sẽ bị từ chối.

```az-demo
assignment-group-form
```

> Nhóm mới tạo là nhóm **Tuỳ chỉnh**. Một ô chọn trên giao diện chỉ dùng nhóm **khi lập trình đã gắn đúng key đó vào ô**. Vì vậy thêm nhóm mới **không làm thay đổi** các ô chọn đang có ở 5 nhóm hệ thống phía trên; muốn dùng nhóm mới ở đâu, cần nhờ đội lập trình gắn vào.

### 3. Xoá một nhóm

Chỉ xoá được nhóm **Tuỳ chỉnh**: bấm **Xoá**, đọc cảnh báo rồi xác nhận. Nhóm **Hệ thống** không có nút Xoá (hệ thống từ chối nếu cố xoá) vì nhiều ô chọn phụ thuộc vào chúng.

## Giải thích từng cột và bộ lọc

| Cột | Ý nghĩa |
|---|---|
| **Key** | Định danh dùng nội bộ. |
| **Tên** | Tên hiển thị, tô màu theo màu bạn đặt. |
| **Phòng ban (bắt buộc)** | Các phòng ban được liệt kê. Nếu trống, hiện "Chưa cấu hình - dropdown sẽ rỗng". |
| **Vị trí (tuỳ chọn)** | Các vị trí được lọc. Trống = "Không lọc theo vị trí". |
| **Loại** | **Hệ thống** (không xoá được) hoặc **Tuỳ chỉnh**. |
| **Thao tác** | **Sửa** / **Xoá** theo quyền. |

Bộ lọc phía trên bảng: ô tìm theo **tên hoặc key**, lọc theo **Phòng ban**, lọc theo **Loại**.

## Quy tắc & lưu ý

- Nhóm **không có phòng ban nào** thì ô chọn tương ứng **trống hoàn toàn** (hệ thống không tự lấy "mọi phòng ban" để tránh lộ người ngoài ý muốn).
- Xoá nhóm tuỳ chỉnh đang dùng sẽ làm các ô gắn key đó **trả về danh sách rỗng** cho tới khi tạo lại nhóm cùng key.
- Nhóm này **chỉ lọc danh sách người hiện trong ô chọn**. Nó **không** thay đổi quyền xem hay quyền chia khách của ai; việc đó do trang **Phân quyền** quyết định.
- Người đã được gán từ trước nhưng nay **không còn khớp** nhóm vẫn giữ nguyên lượt gán cũ; chỉ khi chọn mới họ mới không còn xuất hiện.
- Mọi lần tạo, sửa, xoá đều được ghi vào **Nhật ký hệ thống**.

## Vì sao tôi không thấy …?

- **Không thấy menu/trang này**: bạn chưa có quyền **Xem Quản lý phụ trách**.
- **Không thấy nút Thêm/Sửa/Xoá**: thiếu quyền tương ứng (create/update/delete).
- **Một nhân viên không hiện trong ô chọn Sales**: phòng ban hoặc vị trí của họ không nằm trong nhóm `sales`, hoặc tài khoản đang bị khoá/chưa duyệt. Kiểm tra hồ sơ ở trang **Nhân viên**.
- **Ô chọn trống hoàn toàn**: nhóm tương ứng chưa chọn phòng ban nào hoặc đã bị xoá.

## Xem thêm

- [Chia Data](/huong-dan/chia-data)
- [Khách hàng](/huong-dan/khach-hang)
