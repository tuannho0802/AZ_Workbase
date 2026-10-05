---
title: Quản lý nguồn
slug: nguon-media
sortOrder: 50
published: false
roles: []
positions: []
departments: []
permissions: [media_sources.view]
---

## Trang này để làm gì

Trang **Quản lý nguồn** (tiêu đề trang: **Quản lý nguồn khách hàng**) là nơi Admin cấu hình **danh sách nguồn khách** như Facebook, TikTok, Google: tên, màu và thứ tự. Danh sách này xuất hiện ở ô **Nguồn** khi thêm khách, ở Tag màu trong bảng khách hàng và ở bộ lọc **Nguồn**. Thêm một nguồn mới ở đây là mọi người chọn được ngay, không cần nhờ lập trình viên.

## Ai dùng được

Vào trang cần quyền **Xem Nguồn Media** (`media_sources.view`). Theo cấu hình mặc định, cả 4 vai trò Admin, Assistant, Manager và Employee đều có. Nếu Admin đã thu hồi, bạn sẽ được đưa về trang **Khách hàng**.

| Việc | Cần quyền | Mặc định |
|---|---|---|
| **Thêm nguồn mới**, **Sửa**, **Khoá / Mở khoá** | `media_sources.manage` | Admin, Assistant (Manager **không** có) |
| **Xoá** | `media_sources.delete` | Chỉ Admin |

Cột **Thao tác** chỉ hiện khi bạn có ít nhất một trong hai quyền trên. Bạn chỉ thấy các nút mà mình được phép dùng.

> Quyền **Xem** chỉ quyết định bạn có thấy trang **quản lý** hay không. Ô **Nguồn** khi thêm khách vẫn tải bình thường với mọi nhân viên đã đăng nhập, kể cả người không có quyền Xem này.

## Bảng nguồn

```az-demo
source-tags
```

Hệ thống tạo sẵn 6 nguồn: Facebook, TikTok, Google, Instagram, LinkedIn và Other. Màu thật do Admin chọn nên có thể khác ảnh minh hoạ.

```az-demo
source-manage-table
```

Phía trên bảng có ô tìm **theo tên nguồn** và bộ lọc **Trạng thái** (**Đang mở** hoặc **Đã khoá**). Bộ lọc chạy ngay trên trình duyệt, danh sách không phân trang.

| Cột | Ý nghĩa |
|---|---|
| **Tên nguồn** | Tag tô đúng màu đã lưu, để bạn thấy màu nào đang gắn với nguồn nào. |
| **Thứ tự hiển thị** | Số nhỏ hiện trước trong mọi danh sách chọn. |
| **Trạng thái** | **Đang mở** (xanh) hoặc **Đã khoá** (đỏ). |
| **Thao tác** | **Sửa**, **Khoá** (hoặc **Mở khoá** nếu nguồn đang khoá) và **Xoá**, theo quyền của bạn. |

> Khác với trang [Quản lý Status khách](/huong-dan/status-khach), nguồn **không có** loại "Hệ thống": mọi nguồn, kể cả 6 nguồn tạo sẵn, đều xoá được khi chưa có khách nào dùng.

## Bắt đầu nhanh

### 1. Thêm một nguồn mới

1. Bấm **Thêm nguồn mới**.
2. Điền **Tên nguồn** (bắt buộc, tối đa 100 ký tự, không được trùng với nguồn đã có).
3. Chọn **Màu hiển thị** (mặc định xanh `#1677ff`).
4. Tuỳ chọn điền **Thứ tự hiển thị** (số nhỏ hơn hiện trước).
5. Bấm **OK**. Thông báo "Đã thêm nguồn mới".

```az-demo
source-form
```

### 2. Sửa một nguồn

1. Bấm **Sửa** ở dòng cần đổi.
2. Đổi **Tên nguồn**, **Màu** hoặc **Thứ tự**.
3. Bấm **OK**. Thông báo "Đã cập nhật nguồn".

> **Đổi tên không đổi dữ liệu cũ.** Khách hàng đã có vẫn giữ nguyên tên nguồn cũ vì hệ thống lưu **tên** chứ không lưu mã. Sau khi đổi tên, nguồn cũ không còn khớp dòng nào nên Tag của các khách đó **mất màu** và tên cũ **không còn trong bộ lọc Nguồn**. Nếu nguồn đã có nhiều khách, hãy **Khoá** nguồn cũ rồi **tạo nguồn mới** thay vì đổi tên. Đổi **màu** hay **thứ tự** thì không có vấn đề này.

### 3. Khoá và mở khoá

Bấm **Khoá** ở dòng nguồn, thông báo "Đã khoá nguồn". Bấm **Mở khoá** để mở lại, thông báo "Đã mở khoá".

Nguồn khoá bị **ẩn khỏi ô Nguồn khi thêm khách mới**. Khách đã dùng nguồn đó vẫn hiển thị bình thường, và khi sửa khách đó, nguồn vẫn hiện nhưng làm mờ kèm Tag **Đã khoá**, không chọn lại cho khách khác được.

```az-demo
source-lock-effect
```

Khoá là cách nên dùng khi một nguồn không còn chạy nữa nhưng đã có dữ liệu.

### 4. Xoá một nguồn

1. Bấm **Xoá** ở dòng nguồn (chỉ Admin có nút này).
2. Đọc câu hỏi xác nhận: chỉ xoá được nếu chưa có khách hàng nào đang dùng nguồn đó.
3. Xác nhận. Thông báo `Đã xoá nguồn "tên nguồn"`.

Nếu đang có khách dùng, hệ thống từ chối kèm số khách và gợi ý dùng **Khoá** thay vì **Xoá**. Khác với Status khách, ở đây hệ thống **không** cho chọn nguồn thay thế.

## Nguồn hiện ra ở đâu

- **Khách hàng**: ô **Nguồn** khi thêm hoặc sửa khách (chỉ nguồn đang mở), cột **Nguồn** của bảng và bộ lọc **Nguồn** (có cả nguồn đã khoá, để lọc được khách cũ).
- **Chia Data** và **Thùng rác**: Tag nguồn có cùng màu.

Xem cách dùng ở [Khách hàng](/huong-dan/khach-hang).

## Quy tắc & lưu ý nghiệp vụ

- **Khoá chỉ ẩn nguồn ở ô chọn trên giao diện.** Hệ thống không dùng khoá để chặn dữ liệu nhập vào từ chỗ khác, ví dụ file Excel vẫn ghi được nguồn đã khoá.
- **Nhập Excel khớp theo tên nguồn, đúng từng chữ.** Cột **Nguồn** trống hoặc ghi tên không có trong danh sách sẽ tự thành **Other**, hệ thống không báo lỗi. Vì vậy nên giữ nguồn **Other**: nếu đã xoá, khách nhập từ Excel vẫn bị gán chữ "Other" nhưng không còn dòng nào khớp để tô màu.
- **Tên nguồn không được trùng nhau**: thêm hoặc đổi tên trùng sẽ báo `Nguồn "…" đã tồn tại`.
- **Số khách dùng nguồn khi xoá không tính khách đã nằm trong Thùng rác.** Nếu một nguồn chỉ còn khách trong Thùng rác dùng, hệ thống vẫn cho xoá, và khi khôi phục các khách đó sẽ mang tên nguồn đã xoá.
- **Danh sách được lưu tạm khoảng 5 phút** trên trình duyệt. Người khác có thể phải tải lại trang mới thấy nguồn vừa thêm hoặc vừa khoá.
- Mọi thao tác thêm, sửa, khoá, mở khoá, xoá đều được ghi vào **Nhật ký hệ thống**.

## Vì sao tôi không thấy …?

- **Không vào được trang, bị đưa về Khách hàng**: bạn không có quyền **Xem Nguồn Media**. Liên hệ Admin.
- **Không thấy nút Thêm, Sửa hoặc Khoá**: bạn thiếu quyền **Tạo/sửa/khoá-mở Nguồn Media**. Theo mặc định Manager không có quyền này.
- **Không thấy nút Xoá**: bạn thiếu quyền **Xoá Nguồn Media** (mặc định chỉ Admin).
- **Không thấy một nguồn trong ô Nguồn khi thêm khách**: nguồn đó đang bị khoá, hoặc bạn cần tải lại trang để lấy danh sách mới.
- **Sửa khách thấy nguồn kèm Tag "Đã khoá" dù chưa ai khoá**: tên nguồn của khách không còn khớp nguồn đang mở nào, thường vì nguồn đã bị đổi tên hoặc xoá. Chọn lại một nguồn hợp lệ cho khách đó.
- **Tag nguồn của một khách không có màu**: tên nguồn của khách không còn khớp dòng nào trong danh sách (thường do đã đổi tên).

## Xem thêm

- [Khách hàng](/huong-dan/khach-hang)
- [Quản lý Status khách](/huong-dan/status-khach)
