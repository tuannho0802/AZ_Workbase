---
title: Quản lý Status khách
slug: status-khach
sortOrder: 40
published: false
roles: []
positions: []
departments: []
permissions: [customer_statuses.view]
---

## Trang này để làm gì

Trang **Quản lý Status khách** là nơi Admin cấu hình **danh sách trạng thái của khách hàng**: tên, màu, mô tả và thứ tự hiển thị. Mọi chỗ trong hệ thống có hiện trạng thái khách (ô chọn, Tag màu, bộ lọc) đều lấy danh sách từ trang này, nên thêm hoặc đổi tên một trạng thái ở đây là có hiệu lực ở khắp nơi, không cần nhờ lập trình viên.

## Ai dùng được

Vào trang cần quyền **Xem Trạng thái khách hàng** (`customer_statuses.view`). Theo cấu hình mặc định, cả 4 vai trò Admin, Assistant, Manager và Employee đều có quyền này. Nếu Admin đã thu hồi, bạn sẽ được đưa về trang **Khách hàng**.

Các nút còn lại gate riêng:

| Việc | Cần quyền | Mặc định |
|---|---|---|
| Nút **Thêm trạng thái mới**, nút **Sửa** | `customer_statuses.manage` | Admin, Assistant |
| Nút **Xoá** | `customer_statuses.delete` | Chỉ Admin |

Cột **Thao tác** chỉ hiện khi bạn có ít nhất một trong hai quyền trên. Nút **Xoá** còn bị ẩn ở mọi trạng thái **Hệ thống**, kể cả với Admin.

> Quyền **Xem** chỉ quyết định bạn có thấy trang **quản lý** hay không. Các ô chọn trạng thái ở trang Khách hàng vẫn hoạt động bình thường với mọi nhân viên đã đăng nhập, kể cả khi họ không có quyền Xem này.

## Bảng trạng thái

```az-demo
status-manage-table
```

Phía trên bảng có ô tìm **theo tên hoặc mã trạng thái** và bộ lọc **Loại** (**Hệ thống** hoặc **Tuỳ chỉnh**). Bộ lọc chạy ngay trên trình duyệt, danh sách không phân trang.

| Cột | Ý nghĩa |
|---|---|
| **Trạng thái** | Tag màu đúng như người dùng sẽ thấy ở nơi khác. Tag **Hệ thống** (có ổ khoá) đánh dấu trạng thái mặc định. |
| **Mã (code)** | Giá trị thật được lưu vào dữ liệu khách hàng. Không đổi được sau khi tạo. |
| **Mô tả** | Ghi chú ngắn về ý nghĩa, không bắt buộc. |
| **Đang dùng** | Số khách hàng đang mang trạng thái này (xem lưu ý ở phần Xoá). Dấu **-** nghĩa là chưa có ai dùng. |
| **Thứ tự hiển thị** | Số nhỏ hiện trước trong mọi danh sách chọn. |
| **Thao tác** | **Sửa** và **Xoá** (theo quyền ở trên). |

### 9 trạng thái hệ thống ban đầu

Hệ thống tạo sẵn 9 trạng thái. Bạn **sửa được tên, màu, mô tả, thứ tự** nhưng **không xoá được**.

| Mã (code) | Tên ban đầu |
|---|---|
| `pending` | Chờ xử lý (trạng thái mặc định khi vừa nhập khách) |
| `account_opened` | Đã mở Tài khoản |
| `closed` | Đã chốt |
| `potential` | Deal Tiềm Năng |
| `callback_later` | Liên hệ lại sau |
| `lost` | Deadlead |
| `nurturing_group` | Đang chăm sóc nhóm |
| `ib` | IB |
| `inactive` | Ngừng chăm sóc (xếp cuối danh sách) |

Tên có thể khác ở hệ thống của bạn nếu Admin đã đổi. **Mã thì không bao giờ đổi**, nên tên hiển thị `Deadlead` và mã `lost` vẫn là một trạng thái.

## Bắt đầu nhanh

### 1. Thêm một trạng thái mới

1. Bấm **Thêm trạng thái mới**.
2. Điền **Mã trạng thái (code)**: chỉ chữ thường, số và dấu gạch dưới, tối đa 50 ký tự (ví dụ `callback_later`). Mã đã tồn tại sẽ bị từ chối.
3. Điền **Tên hiển thị** (tối đa 100 ký tự).
4. Chọn **Màu hiển thị** (bắt buộc, mặc định xanh `#1890ff`). Tuỳ chọn thêm **Mô tả** (tối đa 255 ký tự) và **Thứ tự hiển thị**.
5. Bấm **OK**. Thông báo "Đã thêm trạng thái mới".

```az-demo
status-form
```

> **Nghĩ kỹ mã trước khi lưu.** Mã được ghi thẳng vào dữ liệu khách hàng và không sửa được. Nếu gõ nhầm mã, cách duy nhất là tạo trạng thái mới đúng mã rồi xoá trạng thái cũ (kèm chuyển khách sang trạng thái mới).

### 2. Sửa một trạng thái

1. Bấm **Sửa** ở dòng cần đổi.
2. Đổi **Tên hiển thị**, **Mô tả**, **Màu** hoặc **Thứ tự**. Ô **Mã** bị khoá.
3. Bấm **OK**. Thông báo "Đã cập nhật trạng thái".

Khách hàng đang dùng trạng thái đó tự hiện tên và màu mới ở mọi nơi, vì dữ liệu của họ chỉ lưu mã.

### 3. Xoá một trạng thái

Chỉ xoá được trạng thái **Tuỳ chỉnh**, và chỉ khi bạn có quyền Xoá.

- **Không có khách nào đang dùng**: hộp thoại hỏi xác nhận rồi xoá.
- **Đang có khách dùng**: hộp thoại hiện cảnh báo "Đang có N khách hàng dùng trạng thái này" và **bắt buộc** chọn một **trạng thái thay thế**. Nút **Xoá** chỉ bật sau khi bạn chọn. Hệ thống chuyển toàn bộ khách đó sang trạng thái thay thế và xoá trạng thái cũ trong cùng một lần, nên không bao giờ bị dở dang.

```az-demo
status-delete-fallback
```

Trạng thái thay thế có thể là **bất kỳ trạng thái nào khác**, kể cả trạng thái hệ thống. Sau khi xoá, thông báo cho biết đã chuyển bao nhiêu khách.

> **Không hoàn tác được.** Sau khi chuyển, hệ thống không nhớ khách nào từng thuộc trạng thái cũ. Hãy cân nhắc **đổi tên** hoặc **đổi màu** thay vì xoá nếu chỉ muốn gọi khác đi.

## Trạng thái hiện ra ở đâu

- **Khách hàng**: ô **Trạng thái** khi thêm/sửa khách, cột **Trạng thái** của bảng (người có quyền Sửa khách hàng đổi nhanh ngay trên bảng, người không có chỉ thấy Tag), bộ lọc **Trạng thái** và các cửa sổ thống kê.
- **Chia Data**: cột và bộ lọc Trạng thái (chỉ để xem).
- **Báo cáo data lỗi** và các cửa sổ danh sách khách ở **UTM**, **Nhóm liên kết**, **Công việc định kỳ**, **Báo cáo**.

Xem thêm cách dùng ở [Khách hàng](/huong-dan/khach-hang).

## Quy tắc & lưu ý nghiệp vụ

- **Phải đúng danh sách**: tạo hoặc sửa khách với một trạng thái không có trong danh sách sẽ bị từ chối với thông báo "Trạng thái ... không tồn tại. Vui lòng kiểm tra lại ở Quản lý status Khách".
- **Nhập Excel dùng mã, không dùng tên**: cột **Trạng thái** trong file phải ghi đúng **mã** (ví dụ `closed`, không phải "Đã chốt"), viết đúng chữ thường. Ô trống hoặc giá trị không khớp mã nào sẽ tự thành **Chờ xử lý** (`pending`), hệ thống không báo lỗi.
- **Thứ tự hiển thị** quyết định thứ tự trong mọi ô chọn: số nhỏ hiện trước, các trạng thái bằng nhau xếp theo thứ tự tạo.
- **Số "Đang dùng" không tính khách đã nằm trong Thùng rác.** Nếu một trạng thái chỉ còn khách trong Thùng rác dùng, cột này hiện **-** và hệ thống **không bắt chọn trạng thái thay thế** khi xoá, nên những khách đó có thể mang mã đã bị xoá (xem mục "Vì sao tôi không thấy" bên dưới).
- Mọi thao tác thêm, sửa, xoá đều được ghi vào **Nhật ký hệ thống**.

## Vì sao tôi không thấy …?

- **Không vào được trang, bị đưa về Khách hàng**: bạn không có quyền **Xem Trạng thái khách hàng**. Liên hệ Admin.
- **Không thấy nút Thêm hoặc Sửa**: bạn thiếu quyền **Tạo/sửa Trạng thái khách hàng**.
- **Không thấy nút Xoá**: hoặc bạn thiếu quyền **Xoá**, hoặc đây là trạng thái **Hệ thống** (không ai xoá được).
- **Một khách hiện Tag xám ghi mã thô, hoặc ô chọn ghi "(không xác định)"**: khách đó mang một mã không còn trong danh sách (ví dụ trạng thái đã bị xoá khi khách đang ở Thùng rác). Chọn lại một trạng thái hợp lệ cho khách đó.

## Xem thêm

- [Khách hàng](/huong-dan/khach-hang)
- [Chia Data](/huong-dan/chia-data)
