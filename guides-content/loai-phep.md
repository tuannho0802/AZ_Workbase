---
title: Quản lý Loại phép
slug: loai-phep
sortOrder: 45
published: false
roles: []
positions: []
departments: []
permissions: [leave_types.view]
---

## Trang này để làm gì

Trang **Quản lý Loại đơn nghỉ phép** (mục **Quản lý Loại phép** ở menu) là nơi cấu hình **danh sách loại phép**: tên, màu, mô tả, thứ tự hiển thị, và hai cờ quyết định cách tính: **Hưởng lương** và **Trừ phép năm**. Danh sách này là nguồn của ô **Loại phép** khi nhân viên tạo đơn ở [Nghỉ phép](/huong-dan/nghi-phep), khi người duyệt sửa hộ ở [Duyệt phép](/huong-dan/duyet-phep), và của các Tag màu, bộ lọc nghỉ phép khắp hệ thống. Thêm hoặc đổi tên một loại ở đây có hiệu lực ngay, không cần nhờ lập trình viên.

## Ai dùng được

Vào trang cần quyền **Xem Loại đơn nghỉ phép** (`leave_types.view`). Theo cấu hình mặc định, cả 4 vai trò Admin, Assistant, Manager và Employee đều có quyền này. Nếu Admin đã thu hồi, bạn sẽ được đưa về trang **Nghỉ phép**.

Các nút còn lại có quyền riêng:

| Việc | Cần quyền | Mặc định |
|---|---|---|
| Nút **Thêm loại phép mới**, nút **Sửa** | `leave_types.manage` | Admin, Assistant |
| Nút **Xoá** | `leave_types.delete` | Chỉ Admin |

Thu quyền **Xem** chỉ ẩn trang quản lý này. Mọi nhân viên đã đăng nhập vẫn **thấy được danh sách loại phép trong ô chọn khi tạo đơn**, dù không có quyền vào trang này.

## Bảng loại phép

```az-demo
leave-type-table
```

| Cột | Ý nghĩa |
|---|---|
| **Loại phép** | Tên hiển thị, Tag màu. Dấu khoá **Hệ thống** cho biết đây là loại có sẵn. |
| **Mã (code)** | Giá trị thật lưu vào mỗi đơn nghỉ phép. Không đổi được sau khi tạo. |
| **Hưởng lương** | *Có lương* hoặc *Không lương*. |
| **Ký hiệu chấm công** | Ký hiệu loại phép này tạo ra ở bảng Tổng hợp chấm công: có lương là **P** (cả ngày) và **X/2** (nửa ngày); không lương là **KL** (cả ngày) và **1/2K** (nửa ngày). Cột này chỉ để minh hoạ, không lưu riêng. |
| **Trừ phép năm** | *Có* nếu đơn dùng loại này khi được duyệt sẽ trừ vào số ngày phép năm của nhân viên. |
| **Đang dùng** | Số đơn nghỉ phép đang dùng loại này. Con số **tính mọi đơn**, kể cả đơn đã từ chối, đã hủy và đơn trong thùng rác. |
| **Thứ tự hiển thị** | Số nhỏ hơn hiện trước trong ô chọn loại phép. |

**Các bộ lọc** phía trên bảng: ô tìm theo *tên hoặc mã*, **Hưởng lương** (Có lương, Không lương) và **Loại** (Hệ thống, Tuỳ chỉnh). Bảng không phân trang.

### Bảy loại phép hệ thống có sẵn

| Tên mặc định | Mã | Hưởng lương | Trừ phép năm |
|---|---|---|---|
| Phép năm | `annual` | Có | **Có** |
| Nghỉ ốm | `sick` | Có | **Có** |
| Thai sản | `maternity` | Có | Không |
| Nghỉ bù | `compensatory` | Có | Không |
| Gặp khách | `meet_client` | Có | Không |
| Đi trễ | `late_arrival` | Có | Không |
| Không lương | `unpaid` | Không | Không |

Đây là giá trị lúc khởi tạo; tên, màu và cờ có thể đã được Admin đổi nên trang của bạn có thể khác.

## Thêm hoặc sửa một loại phép

1. Bấm **Thêm loại phép mới** (hoặc **Sửa** ở hàng muốn đổi).
2. Điền các trường (bảng dưới), rồi bấm **OK**.

```az-demo
leave-type-form
```

| Trường | Bắt buộc | Lưu ý |
|---|---|---|
| **Mã loại phép (code)** | Có (khi thêm) | Chỉ **chữ thường, số và dấu gạch dưới** (ví dụ `meet_client`), tối đa 50 ký tự. **Không trùng** mã đã có, nếu trùng báo *"Mã loại phép … đã tồn tại"*. Khoá sau khi tạo. |
| **Tên hiển thị** | Có | Tối đa 100 ký tự. |
| **Mô tả** | Không | Tối đa 255 ký tự. |
| **Màu hiển thị** | Có | Màu của Tag ở mọi nơi. |
| **Hưởng lương** | Không | Mặc định *Có lương*. Quyết định ký hiệu chấm công (P / X/2 hay KL / 1/2K). |
| **Trừ phép năm khi được duyệt** | Không | Mặc định *Không trừ*. |
| **Thứ tự hiển thị** | Không | Số nguyên từ 0, mặc định 0. |

Loại phép **Hệ thống** vẫn sửa được tên, màu, mô tả, hai cờ và thứ tự; chỉ **mã giữ nguyên**, và **không xoá được**.

## Hai cờ ảnh hưởng đến đâu

- **Trừ phép năm** quyết định có kiểm tra và trừ số phép năm còn lại hay không:
  - Lúc nhân viên **tạo đơn**: nếu không đủ phép, hệ thống chặn với thông báo *"Không đủ phép năm. Còn lại: … ngày, cần: … ngày"*.
  - Lúc người duyệt **duyệt đơn**: số ngày của đơn bị trừ.
  - Khi người có quyền **Huỷ** một đơn đã duyệt: số ngày được hoàn lại.
- **Hưởng lương** quyết định ký hiệu ở bảng **Tổng hợp chấm công** (**Máy chấm công**): *P* và *X/2* tính công, *KL* và *1/2K* không lương.

**Đổi cờ không tính lại những gì đã xảy ra.** Hệ thống chỉ áp dụng cờ mới cho các lần duyệt, huỷ về sau; số phép đã trừ trước đó giữ nguyên. Riêng khi huỷ một đơn đã duyệt, số ngày hoàn lại được tính **theo cờ hiện tại** của loại phép chứ không theo lúc duyệt. Vì vậy, khi đã có đơn được duyệt, hãy cẩn thận khi bật hoặc tắt **Trừ phép năm**: số phép của nhân viên có thể lệch.

## Xoá một loại phép

Chỉ người có quyền **Xoá** thấy nút **Xoá**, và **chỉ ở loại Tuỳ chỉnh** (loại Hệ thống không có nút này).

- **Chưa có đơn nào dùng**: hộp thoại hỏi xác nhận rồi xoá.
- **Đang có đơn dùng**: hộp thoại cảnh báo *"Đang có N đơn nghỉ phép dùng loại phép này"* và **bắt buộc chọn một loại phép thay thế** (nút **Xoá** bị khoá cho tới khi bạn chọn). Toàn bộ đơn đang dùng loại cũ được chuyển sang loại bạn chọn, rồi loại cũ mới bị xoá. Hai việc này làm cùng lúc: nếu một bước lỗi, không có gì thay đổi.

```az-demo
leave-type-delete-fallback
```

Sau khi xoá, thông báo cho biết số đơn đã được chuyển. Lưu ý:

- **Không hoàn tác được.** Các đơn đã chuyển sang loại mới và không tự quay lại.
- Chuyển đơn **không tính lại phép năm** đã trừ trước đó. Nên chọn loại thay thế có **cùng cách trừ phép năm** với loại bị xoá.
- Bạn có thể chọn một loại **Hệ thống** làm loại thay thế.

## Quy tắc & lưu ý nghiệp vụ

- **Đổi tên và màu** có hiệu lực ngay ở mọi nơi, kể cả đơn cũ, vì đơn chỉ lưu **mã**.
- **Mã không đổi được**: nếu đặt sai mã, hãy tạo loại mới, chuyển đơn bằng cách xoá loại sai (kèm loại thay thế) rồi dùng loại mới.
- Thêm, sửa và xoá loại phép đều ghi vào **Nhật ký hệ thống**.

## Vì sao tôi không thấy …?

- **Không vào được trang, bị đưa về Nghỉ phép**: bạn thiếu quyền Xem Loại đơn nghỉ phép. Liên hệ Admin.
- **Không thấy nút Thêm hoặc Sửa**: thiếu quyền Tạo/sửa Loại đơn nghỉ phép.
- **Không thấy nút Xoá**: thiếu quyền Xoá, hoặc đó là loại **Hệ thống**.
- **Loại phép không hiện trong ô chọn khi tạo đơn**: kiểm tra đã thêm đúng loại ở trang này; ô chọn lấy toàn bộ danh sách, sắp theo **Thứ tự hiển thị**.
- **Ký hiệu chấm công không như mong muốn**: kiểm tra cờ **Hưởng lương** của loại phép đó.

## Xem thêm

- [Nghỉ phép](/huong-dan/nghi-phep)
- [Duyệt phép](/huong-dan/duyet-phep)
