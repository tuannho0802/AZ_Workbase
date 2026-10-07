---
title: Nghỉ phép
slug: nghi-phep
sortOrder: 15
published: false
roles: []
positions: []
departments: []
permissions: [leave_requests.request]
---

## Trang này để làm gì

Trang **Đơn nghỉ phép của tôi** là nơi bạn **tạo đơn xin nghỉ**, theo dõi đơn đã gửi đang ở bước nào (Chờ duyệt, Đã duyệt, Từ chối, Đã hủy) và **hủy** đơn nếu chưa được duyệt. Trang chỉ hiện đơn **của chính bạn**; người duyệt xem và xử lý đơn ở trang [Duyệt phép](/huong-dan/duyet-phep).

Vào từ mục **Nghỉ phép** ở menu. Bốn trạng thái đơn và các Tag loại phép trông như sau (tên và màu loại phép do Admin cấu hình nên có thể khác ví dụ):

```az-demo
leave-status-tags
```

## Ai dùng được

Cần quyền **Tạo đơn xin nghỉ phép** (`leave_requests.request`). Theo cấu hình mặc định **mọi vai trò** đều có quyền này. Nếu Admin đã thu hồi quyền, mở trang sẽ hiện thông báo *"Bạn không có quyền truy cập trang này"* và bạn được đưa về trang **Khách hàng**.

Trang này **không** có phạm vi theo phòng ban: ai cũng chỉ thấy đơn của mình, kể cả Admin.

## Bắt đầu nhanh: tạo một đơn

1. Bấm **Tạo đơn mới** (góc trên bên phải).
2. Chọn **Loại phép**.
3. Chọn **Thời gian nghỉ** (từ ngày, đến ngày).
4. Chọn **Thời lượng** (mặc định *Cả ngày*), điền **Lý do**; thêm **Khung giờ** hoặc **ảnh đính kèm** nếu cần.
5. Bấm **Tạo đơn**. Đơn vào trạng thái **Chờ duyệt**.

```az-demo
leave-form
```

### Giải thích từng trường

| Trường | Bắt buộc | Lưu ý |
|---|---|---|
| **Loại phép** | Có | Danh sách lấy từ trang [Quản lý Loại phép](/huong-dan/loai-phep), mỗi loại một màu. Phải chọn loại **trước** khi đính kèm ảnh. |
| **Thời gian nghỉ** | Có | Chọn khoảng ngày. Ngày bắt đầu không được sau ngày kết thúc. |
| **Thời lượng** | Không | *Cả ngày*, *Nửa ngày (Sáng)*, *Nửa ngày (Chiều)*. Nửa ngày chỉ có tác dụng khi bạn nghỉ **đúng 1 ngày** (tính là 0,5 ngày). Nghỉ nhiều ngày luôn tính theo số ngày đầy đủ. |
| **Khung giờ (Period Hours)** | Không | Nghỉ theo giờ trong ngày, ví dụ 14:00 - 17:00, bước 15 phút. Phải chọn **đủ cả Từ giờ và Đến giờ** (hoặc để trống cả hai) và giờ bắt đầu phải trước giờ kết thúc. Khung giờ **không làm đổi số ngày**. |
| **Lý do** | Có | Hiện ở bảng và ở trang của người duyệt. |
| **Ảnh đính kèm** | Không | Xem mục bên dưới. |

### Cách tính "Số ngày"

Hệ thống tính **theo lịch, gồm cả ngày bắt đầu và ngày kết thúc, không trừ thứ Bảy, Chủ nhật**. Ví dụ nghỉ từ thứ Sáu đến thứ Hai là 4 ngày. Số này là số hệ thống tự tính khi tạo đơn, bạn không nhập tay.

### Ảnh đính kèm

- Chỉ nhận ảnh **JPG, PNG, WebP**.
- Mặc định tối đa **5 ảnh** mỗi đơn, mỗi ảnh tối đa khoảng **1,5 MB**. Hai giới hạn này là cấu hình hệ thống nên có thể khác ở nơi bạn làm việc; nếu ảnh bị từ chối, hãy làm theo thông báo lỗi trên màn hình.
- Ảnh chỉ được tải lên **đúng lúc bạn bấm Tạo đơn**. Đóng hộp thoại hoặc bấm **Hủy** trước đó thì ảnh không được lưu.
- Sau khi tạo, bấm nút ở cột **Đính kèm** để xem lại ảnh.

## Hai cảnh báo khi chọn ngày

Cả hai chỉ **nhắc nhở**, bạn vẫn tạo được đơn nếu đồng ý:

- **Chọn ngày nghỉ trong quá khứ**: nếu ngày bắt đầu đã qua so với hôm nay, hệ thống hỏi xác nhận vì đơn sẽ được tự đánh dấu **Đơn bổ sung** (tạo bù cho ngày đã nghỉ). Bấm **Huỷ** sẽ xoá ô ngày để bạn chọn lại. Việc đánh dấu chỉ xét **ngày bắt đầu** so với hôm nay và được ghi lúc tạo đơn.
- **Thời gian nghỉ dài hơn 7 ngày**: hệ thống nêu rõ khoảng ngày và tổng số ngày, bạn chọn **Tiếp tục tạo đơn** hoặc **Chọn lại ngày**.

Nếu ngày bắt đầu ở quá khứ, cảnh báo ngày quá khứ hiện trước; cảnh báo >7 ngày chỉ hiện ở lần chọn ngày sau.

## Bảng đơn của tôi

```az-demo
leave-my-requests
```

- **Các bộ lọc** phía trên bảng: ô tìm theo **lý do**, **Loại phép**, **Trạng thái**, khoảng ngày. Đổi bộ lọc là quay về trang 1.
- Bảng chia theo **tuần**: mỗi dải là một tuần và chỉ tải đơn của tuần đó khi bạn mở ra. Phân trang tính theo **số tuần** mỗi trang (2, 4 hoặc 8), không phải số đơn.
- Cột **Người duyệt** có tên khi đơn đã được xử lý; cột **Lý do từ chối** chỉ hiện nội dung với đơn **Từ chối**.
- Trên điện thoại, mỗi đơn là một thẻ với cùng thông tin.

## Hủy đơn

Chỉ đơn **Chờ duyệt** mới có nút **Hủy**. Bấm nút, xác nhận ở hộp thoại *"Hủy đơn nghỉ phép?"*; đơn chuyển sang **Đã hủy** và **ảnh đính kèm của đơn bị xoá**. Việc này không hoàn tác được.

Đơn đã **Đã duyệt** hoặc **Từ chối** không hủy được từ trang này. Nếu cần đổi một đơn đã duyệt, hãy liên hệ người duyệt hoặc Admin.

## Quy tắc & lưu ý nghiệp vụ

- **Phép năm**: với loại phép được Admin bật *trừ phép năm* (mặc định là *Phép năm* và *Nghỉ ốm*), hệ thống **kiểm tra số phép còn lại lúc tạo đơn**; không đủ sẽ báo *"Không đủ phép năm. Còn lại: … ngày, cần: … ngày"* và không tạo đơn. Số phép chỉ **bị trừ khi đơn được duyệt**, không trừ lúc gửi hay lúc bị từ chối/hủy.
- **Trùng ngày không bị chặn**: bạn vẫn tạo được đơn mới dù đã có đơn khác trùng khoảng ngày (kể cả khác loại). Hãy tự kiểm tra để tránh gửi trùng.
- Người duyệt được xác định theo quyền: Admin (hoặc người có phạm vi duyệt "Tất cả") duyệt được mọi đơn; còn lại là Manager/Assistant được gán quản lý **phòng ban của bạn**, hoặc người được gán riêng làm **người duyệt phép** của bạn. Chi tiết ở [Duyệt phép](/huong-dan/duyet-phep).
- Các loại phép khác nhau còn ảnh hưởng cách tính công ở **Máy chấm công**.
- Tạo, hủy đơn đều được ghi vào **Nhật ký hệ thống**.

## Vì sao tôi không thấy …?

- **Không vào được trang, bị đưa về Khách hàng**: bạn thiếu quyền **Tạo đơn xin nghỉ phép**. Liên hệ Admin.
- **Danh sách trống dù đã tạo đơn**: kiểm tra bộ lọc (Loại phép, Trạng thái, khoảng ngày) và thử bấm xoá từng bộ lọc.
- **Không thấy nút Hủy**: đơn không còn ở trạng thái **Chờ duyệt**.
- **Không thấy ô tải ảnh hoạt động**: chưa chọn **Loại phép**, hoặc đã đủ số ảnh tối đa.
- **Không thấy đơn của đồng nghiệp**: trang này chỉ hiện đơn của bạn. Người có quyền xem đơn người khác dùng trang **Duyệt phép**.
- **Thiếu loại phép trong danh sách**: danh sách do Admin quản lý ở **Quản lý Loại phép**.

## Xem thêm

- [Duyệt phép](/huong-dan/duyet-phep)
- [Quản lý Loại phép](/huong-dan/loai-phep)
