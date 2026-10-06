---
title: Thùng rác
slug: thung-rac
sortOrder: 90
published: false
roles: []
positions: []
departments: []
permissions: [customers.trash_manage]
---

## Trang này để làm gì

Khi một khách hàng bị **Xóa** ở trang Khách hàng, khách đó chưa mất hẳn mà được chuyển vào **Thùng rác** (xóa mềm). Từ trang **Thùng rác** bạn có thể:

- **Khôi phục** khách về lại trang Khách hàng.
- **Xóa vĩnh viễn** khách khỏi hệ thống (không lấy lại được).

```az-demo
trash-lifecycle
```

## Ai dùng được

| Việc | Quyền cần có | Mặc định |
|---|---|---|
| Xóa khách (đưa vào Thùng rác) | `customers.delete` | Chỉ Admin |
| Vào trang, xem danh sách, **Khôi phục** | `customers.trash_manage` | Chỉ Admin |
| **Xóa vĩnh viễn** | `customers.hard_delete` | Chỉ Admin |

Hai quyền ở trang Thùng rác được tách riêng: một vai trò có thể được cấp "xem và khôi phục" mà **không** có "xóa vĩnh viễn". Khi đó nút **Xóa vĩnh viễn** ẩn hẳn khỏi bảng.

```az-demo
trash-table viewer=restore-only
```

Admin có thể đổi quyền ở trang **Phân quyền**, nên thực tế ở công ty bạn có thể khác bảng trên. Người không có quyền vào trang sẽ không thấy mục **Thùng rác** ở menu; nếu gõ thẳng địa chỉ trang, bạn bị đưa về trang Khách hàng kèm thông báo "Bạn không có quyền truy cập trang này".

## Bắt đầu nhanh

1. Mở **Thùng rác** ở menu. Góc trên có huy hiệu đỏ là **tổng số khách đang nằm trong thùng rác**.
2. Tìm khách cần xử lý bằng ô tìm kiếm và các bộ lọc (xem bên dưới).
3. Muốn lấy lại khách: bấm biểu tượng **Khôi phục** (mũi tên quay lại) ở cột **Thao tác**, rồi xác nhận **Khôi phục**.
4. Muốn xóa hẳn (nếu bạn có quyền): bấm biểu tượng thùng rác đỏ **Xóa vĩnh viễn**, đọc kỹ cảnh báo rồi xác nhận.

## Giải thích cột, bộ lọc và nút

```az-demo
trash-table
```

| Cột | Ý nghĩa |
|---|---|
| STT | Số thứ tự theo trang |
| Họ và tên, SĐT, Nguồn, Sales phụ trách | Thông tin khách lúc bị xóa |
| Ngày tạo | Ngày khách được tạo trong hệ thống |
| Ngày xóa | Thời điểm khách bị đưa vào Thùng rác |
| Người xóa | Ai đã bấm Xóa, hiện kèm vai trò. Hiện **—** nếu không xác định được (xem mục Lưu ý) |
| Thao tác | **Khôi phục** và (nếu có quyền) **Xóa vĩnh viễn** |

**Bộ lọc** (đều lọc phía máy chủ, mỗi trang 20 khách, sắp xếp khách xóa gần nhất lên đầu):

- **Tìm tên, SĐT...**: khớp theo tên, email, tên chiến dịch, hoặc SĐT (thường khớp theo phần đầu chuỗi bạn gõ).
- **Nguồn**, **Sales phụ trách**, **Người xóa**: chọn từ danh sách. Danh sách người dùng chung cho cả hai ô, vì ai cũng có thể là người bấm Xóa.
- **Xóa từ / Xóa đến**: lọc theo **ngày xóa**, không phải ngày nhập khách.
- **Xóa bộ lọc** đưa mọi bộ lọc về ban đầu; **Làm mới** tải lại danh sách.

Trên điện thoại (màn hình hẹp), bảng đổi thành từng thẻ khách với hai nút **Khôi phục** và **Xóa vĩnh viễn** to hơn, nội dung tương tự.

## Khôi phục làm gì

- Khách quay lại trang Khách hàng **y như trước khi xóa**: thông tin, ghi chú, nạp tiền, lượt chia Sales, nhóm đã tham gia đều còn nguyên vì khi xóa mềm không có gì bị xóa đi.
- Cột **Người xóa** được xóa trắng; lần xóa sau sẽ ghi lại người xóa mới.
- Khôi phục được ghi vào **Nhật ký hệ thống** (hành động khôi phục khách hàng).
- Khách chỉ khôi phục được khi **đang ở trong Thùng rác**.

## Xóa vĩnh viễn làm gì

- Chỉ xóa được khách **đã nằm trong Thùng rác** (phải xóa mềm trước).
- Khách bị xóa **hẳn khỏi cơ sở dữ liệu** cùng với dữ liệu gắn theo khách: **ghi chú, các khoản nạp tiền, lượt chia Sales, trạng thái tham gia nhóm và liên kết với công việc định kỳ**. Không có cách lấy lại.
- Hệ thống vẫn ghi vào **Nhật ký hệ thống** một dòng kèm bản chụp thông tin khách lúc bị xóa, để sau này còn biết khách nào đã bị xóa và ai làm.
- Hệ thống **không tự dọn** Thùng rác theo thời gian: khách nằm đó đến khi có người khôi phục hoặc xóa vĩnh viễn.

## Quy tắc và lưu ý

- **Mọi người có quyền vào trang đều thấy toàn bộ Thùng rác.** Danh sách không lọc theo phạm vi xem (Của tôi / Phòng ban / Tất cả) như trang Khách hàng. Vì vậy hãy chỉ cấp quyền `customers.trash_manage` cho người thực sự cần.
- **Khách trong Thùng rác biến khỏi các trang khác**: Khách hàng, Chia data, số liệu thống kê, danh sách khách của nhóm liên kết. Một số trang quản lý (như Quản lý trạng thái, Nguồn) chỉ đếm khách còn hiện nên có thể báo "không có khách dùng" dù vẫn còn khách trong Thùng rác. Khi khôi phục, các giá trị này có thể đã bị đổi hoặc xóa trong thời gian đó.
- **Cột "Người xóa" có thể hiện —**: khách bị xóa từ trước khi hệ thống ghi cột này và nhật ký cũ không còn thông tin. Với khách cũ, hệ thống tự dò lại từ Nhật ký hệ thống; dò được thì hiện tên và lần sau sẽ lưu luôn.
- **Bộ lọc "Người xóa" chưa tìm thấy khách cũ** cho tới khi tên người xóa của họ được dò lại ở một lần xem danh sách không lọc theo ô này.
- **Chưa có chức năng khôi phục hoặc xóa vĩnh viễn hàng loạt**: thao tác từng khách một.
- **Chưa thể "xem chi tiết"** khách ngay trong Thùng rác. Muốn xem nội dung đầy đủ, hãy khôi phục rồi mở ở trang Khách hàng.

## Vì sao tôi không thấy...?

- **Không có mục Thùng rác ở menu:** vai trò của bạn không có quyền `customers.trash_manage`.
- **Không có nút Xóa vĩnh viễn:** bạn có quyền khôi phục nhưng thiếu `customers.hard_delete`.
- **Không thấy nút Xóa ở trang Khách hàng:** thiếu quyền `customers.delete`; khách còn phải nằm trong phạm vi xem của bạn.
- **Khách vừa xóa chưa thấy ở đây:** bấm **Làm mới**, hoặc kiểm tra bộ lọc đang bật (đặc biệt khoảng **Xóa từ / Xóa đến**).
- **Không tìm thấy khách bằng SĐT:** ô tìm kiếm thường khớp SĐT theo **phần đầu**, hãy gõ từ số đầu tiên.

## Xem thêm

- [Khách hàng](/huong-dan/khach-hang)
- [Chia data](/huong-dan/chia-data)
