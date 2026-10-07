---
title: Duyệt phép
slug: duyet-phep
sortOrder: 16
published: false
roles: []
positions: []
departments: []
permissions: []
---

## Trang này để làm gì

Trang **Quản lý Nghỉ phép** (mục **Duyệt phép** ở menu) là nơi người có quyền **duyệt hoặc từ chối đơn nghỉ phép** của nhân viên, **sửa hộ** đơn khi nhân viên chọn sai, xem **lịch sử xử lý**, **thùng rác** và **thống kê nghỉ phép**. Đơn do nhân viên tự tạo ở trang [Nghỉ phép](/huong-dan/nghi-phep); trang này chỉ là phía xử lý.

Trạng thái đơn và Tag loại phép trông như sau (tên và màu loại phép do Admin cấu hình ở [Quản lý Loại phép](/huong-dan/loai-phep)):

```az-demo
leave-status-tags
```

## Ai dùng được & thấy gì

Để mở trang, bạn cần **ít nhất một** trong hai quyền: **Duyệt/từ chối đơn nghỉ phép** (`leave_requests.approve`) hoặc **Xem danh sách đơn nghỉ phép** (`leave_requests.view`). Thiếu cả hai, hệ thống báo *"Bạn không có quyền truy cập trang này"* và đưa bạn về trang **Khách hàng**. Mục **Duyệt phép** ở menu cũng ẩn theo đúng điều kiện này.

Mỗi tab và mỗi nút có quyền riêng. Cột "Mặc định" là cấu hình ban đầu của hệ thống; nếu Admin đã chỉnh ở trang **Phân quyền** thì bạn sẽ thấy khác.

| Tab / việc | Cần quyền | Mặc định |
|---|---|---|
| Tab **Chờ phê duyệt**, nút **Duyệt**, **Từ chối** | `leave_requests.approve` | Admin và Assistant: mọi đơn. Manager: đơn của phòng ban mình |
| Tab **Lịch sử phê duyệt**, **Thùng rác**, **Thống kê** | `leave_requests.view` | Admin: mọi đơn. Manager và Assistant: theo phòng ban mình quản lý |
| Nút **Sửa** (sửa hộ) | `leave_requests.edit` | Admin và Assistant: mọi đơn. Manager: đơn của phòng ban mình |
| Nút **Huỷ**, **Xoá vĩnh viễn**, ô chọn nhiều dòng | `leave_requests.delete` | Chỉ Admin |

Nhân viên (Employee) mặc định không có quyền nào ở bảng trên, nên không vào được trang này.

Với các quyền có phạm vi, **Admin luôn làm được mọi việc với mọi đơn**. Người khác phụ thuộc phạm vi được cấp:

- **Tất cả**: làm được với đơn của mọi nhân viên.
- **Phòng ban**: chỉ với đơn của nhân viên thuộc **phòng ban bạn được gán quản lý**, cộng thêm nhân viên mà Admin đã gán riêng bạn làm **Người duyệt nghỉ phép (ngoại lệ)** ở hồ sơ nhân viên (dùng khi nhân viên không cùng phòng với Manager nhưng vẫn báo cáo cho Manager đó).

Bảng dưới cho cùng 5 đơn mẫu, mỗi vai trò làm được gì (chọn vai trò bằng tham số `viewer`). Ví dụ Manager của Kinh doanh 1: duyệt được đơn Kinh doanh 1 và đơn của chị Hoa (được gán riêng), không duyệt được đơn Kinh doanh 2:

```az-demo
leave-actions-by-viewer viewer=manager
```

Dùng cùng 5 đơn đó cho Admin và Assistant (mặc định):

```az-demo
leave-actions-by-viewer viewer=admin
```

```az-demo
leave-actions-by-viewer viewer=assistant
```

## Bắt đầu nhanh: duyệt một đơn

1. Mở **Duyệt phép**, ở tab **Chờ phê duyệt**. Tổng số đơn đang chờ trong phạm vi của bạn hiện thành huy hiệu số ở tên tab và ở mục menu (không đổi khi bạn lọc hay chuyển trang).
2. Xem hàng đơn: người gửi, phòng ban, loại phép, thời gian, **Khung giờ** (nếu có), lý do. Bấm nút ở cột **Đính kèm** để xem ảnh (ví dụ giấy khám bệnh).
3. Bấm **Duyệt**, xác nhận ở hộp thoại *"Duyệt đơn nghỉ phép?"*. Hoặc bấm **Từ chối**, **nhập lý do** rồi bấm **Xác nhận từ chối**.

```az-demo
leave-approve-table
```

### Duyệt và từ chối làm gì

- **Duyệt**: đơn thành **Đã duyệt**, hệ thống ghi tên bạn ở cột **Người duyệt** và thời điểm xử lý. Nếu loại phép được bật *Trừ phép năm* (mặc định là *Phép năm* và *Nghỉ ốm*), số phép năm còn lại của nhân viên **bị trừ ngay lúc duyệt** đúng bằng số ngày của đơn.
- **Từ chối**: bắt buộc nhập lý do, nếu để trống hệ thống nhắc *"Vui lòng nhập lý do từ chối"*. Đơn thành **Từ chối**, nhân viên thấy lý do ở bảng của họ. Số phép không thay đổi.
- Chỉ đơn **Chờ duyệt** mới duyệt hoặc từ chối được. Nếu đơn vừa bị người khác xử lý, thao tác báo lỗi và bạn cần tải lại danh sách.

**Lưu ý khi duyệt phép năm**: hệ thống chỉ kiểm tra "còn đủ phép" **lúc nhân viên tạo đơn**, không kiểm tra lại lúc bạn duyệt. Nếu nhân viên gửi nhiều đơn chờ cùng lúc, tổng số ngày có thể vượt số phép còn lại. Hãy cân nhắc trước khi duyệt các đơn trừ phép năm cùng một người.

## Sửa hộ một đơn

Khi nhân viên chọn sai ngày hay sai loại, người có quyền **Sửa** bấm **Sửa** ở hàng đơn để mở hộp thoại **Sửa đơn nghỉ phép**. Bạn đổi được **Loại phép**, **Thời gian nghỉ**, **Thời lượng** và **Lý do**, rồi bấm **Lưu thay đổi**.

- Chỉ sửa được đơn **Chờ duyệt** hoặc **Đã duyệt**. Đơn **Từ chối** và **Đã hủy** không sửa được.
- Số ngày được **tính lại** theo ngày mới (tính theo lịch, gồm cả thứ Bảy, Chủ nhật; nửa ngày chỉ có tác dụng khi nghỉ đúng 1 ngày).
- Nếu đơn **đã duyệt**, hệ thống tự cân lại phép năm: hoàn số ngày cũ rồi trừ số ngày mới (nếu loại phép có trừ phép năm). Nếu nhân viên không đủ phép cho số ngày mới, thao tác bị chặn với thông báo *"Không đủ phép năm để sửa đơn…"* và số phép giữ nguyên.
- Hộp thoại này **không** có ô **Khung giờ**; khung giờ của đơn giữ nguyên.
- Giống lúc tạo đơn, việc sửa **không kiểm tra trùng ngày** với đơn khác.
- Mỗi lần sửa được ghi vào **Nhật ký hệ thống** kèm giá trị trước và sau.

## Lịch sử phê duyệt

Tab này liệt kê đơn **Đã duyệt** và **Từ chối** trong phạm vi bạn xem. Ngoài các cột như tab Chờ duyệt, bạn thấy thêm **Trạng thái**, **Người duyệt**, **Ngày xử lý** và **Lý do từ chối**.

- **Bộ lọc**: ô tìm theo *tên, email, lý do*, **Phòng ban**, **Loại phép**, **Trạng thái**, khoảng ngày (**Từ ngày**, **Đến ngày**). Tab Chờ phê duyệt chỉ có ô tìm, Phòng ban và Loại phép.
- Danh sách chia theo **tuần**: mỗi dải là một tuần và chỉ tải đơn của tuần đó khi bạn mở ra. Phân trang tính theo **số tuần** mỗi trang (2, 4 hoặc 8), không phải số đơn.
- Người có quyền sửa thấy nút **Sửa** ở đơn Đã duyệt. Người có quyền xoá thấy thêm nút **Huỷ**.

## Huỷ đơn, Thùng rác và Xoá vĩnh viễn

Chỉ người có quyền `leave_requests.delete` (mặc định là Admin) làm các việc này.

1. **Huỷ** (ở tab Lịch sử): đưa đơn **Đã duyệt** hoặc **Từ chối** vào tab **Thùng rác**; đơn đổi thành **Đã hủy**. Hộp thoại xác nhận *"Chuyển đơn vào thùng rác?"* nêu rõ: nếu đơn đã duyệt và loại phép có trừ phép năm, **số ngày đã trừ được hoàn lại** cho nhân viên. Ảnh đính kèm vẫn được giữ.
2. **Xoá vĩnh viễn** (ở tab Thùng rác): xoá hẳn đơn **cùng ảnh đính kèm**, **không khôi phục được**. Đây là cách duy nhất xoá hẳn một đơn; đơn chưa vào thùng rác không xoá vĩnh viễn được.
3. **Chọn nhiều dòng**: tick các ô ở Lịch sử hoặc Thùng rác, thanh *"Đã chọn N đơn"* hiện ra để Huỷ hoặc Xoá vĩnh viễn hàng loạt. Nếu một số đơn không xử lý được, một hộp thoại liệt kê đơn nào và vì sao, các đơn còn lại vẫn được xử lý. Đổi bộ lọc hoặc trang sẽ **bỏ chọn**.

Đơn **Chờ duyệt** **không** có nút Huỷ ở trang này: chỉ chính nhân viên mới huỷ được đơn của mình (ở trang Nghỉ phép). Muốn bỏ một đơn chờ của người khác, hãy duyệt hoặc từ chối trước, rồi Huỷ từ Lịch sử.

Cột **Trước khi xoá** ở Thùng rác cho biết đơn đến từ đâu: *Đã duyệt*, *Từ chối*, hoặc *Chờ duyệt (chủ đơn huỷ)* (nhân viên tự huỷ khi chưa được duyệt). Thùng rác dùng chung quyền Xem với Lịch sử.

## Tab Thống kê

Cùng quyền Xem (`leave_requests.view`). Chọn kỳ, rồi lọc theo **phòng ban** và **loại phép**. Trang hiển thị các chỉ số như *Tổng đơn nghỉ*, *Ngày nghỉ đã duyệt*, *Nhân sự xin nghỉ*, *Tỷ lệ duyệt*, *Tỷ lệ từ chối*, *Đơn bổ sung*, cùng biểu đồ theo thời gian, theo phòng ban và bảng xếp hạng nhân viên. **Số liệu chỉ tính trong phạm vi bạn xem**, nên Manager chỉ thấy phòng mình.

## Quy tắc & lưu ý nghiệp vụ

- **Thao tác bị kiểm tra ở máy chủ**: dù một nút hiện ra, máy chủ vẫn từ chối nếu đơn nằm ngoài phạm vi của bạn (báo *"Bạn không có quyền phê duyệt đơn của người này"*).
- **Đơn bổ sung**: Tag vàng báo đơn được tạo bù cho ngày đã nghỉ (ngày bắt đầu sớm hơn ngày tạo đơn). Hệ thống chỉ đánh dấu, không tự từ chối.
- **Đổi loại phép sau khi đã duyệt** ảnh hưởng số phép (xem phần Sửa hộ). Loại phép còn quyết định ký hiệu ở **Máy chấm công**.
- Duyệt, từ chối, sửa, huỷ và xoá vĩnh viễn đều ghi vào **Nhật ký hệ thống**.
- Trên điện thoại, mỗi đơn là một thẻ với cùng thông tin và cùng các nút.

## Vì sao tôi không thấy …?

- **Không vào được trang, bị đưa về Khách hàng**: bạn không có cả `leave_requests.approve` lẫn `leave_requests.view`. Liên hệ Admin.
- **Không thấy tab Chờ phê duyệt**: thiếu quyền Duyệt/từ chối đơn nghỉ phép. Chỉ có quyền Xem thì bạn thấy Lịch sử, Thùng rác, Thống kê.
- **Không thấy đơn của một nhân viên**: phạm vi của bạn là **Phòng ban** và nhân viên đó không thuộc phòng bạn quản lý (hoặc bạn chưa được gán làm người duyệt riêng của họ).
- **Không thấy nút Sửa**: thiếu quyền Sửa đơn nghỉ phép, hoặc đơn đã **Từ chối** / **Đã hủy**.
- **Không thấy nút Huỷ hay ô chọn nhiều dòng**: thiếu quyền Xoá đơn nghỉ phép.
- **Bấm Huỷ ở đơn Chờ duyệt không được**: đơn chờ chỉ chủ đơn huỷ được. Hãy duyệt hoặc từ chối trước.
- **Đơn đã duyệt không còn ở Lịch sử**: có thể đã được Huỷ vào Thùng rác.

## Xem thêm

- [Nghỉ phép](/huong-dan/nghi-phep)
- [Quản lý Loại phép](/huong-dan/loai-phep)
