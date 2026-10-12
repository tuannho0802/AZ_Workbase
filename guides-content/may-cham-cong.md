---
title: Máy chấm công
slug: may-cham-cong
sortOrder: 160
published: false
roles: []
positions: []
departments: []
permissions: [attendance.view]
---

## Trang này để làm gì

Trang **Máy chấm công** hiển thị giờ vào/ra của nhân viên lấy từ máy chấm công vân tay/khuôn mặt, gắn mỗi **mã trên máy** với một **nhân viên trong hệ thống**, và tổng hợp thành bảng theo ngày, theo tháng. Góc phải phía trên có chấm trạng thái kết nối tới máy (**Đã kết nối**, **Mất kết nối** hoặc **Không kết nối được tới máy**).

## Ai dùng được & thấy gì

Trang có 4 tab: **Mapping nhân viên**, **Bảng chấm công**, **Tổng hợp chấm công**, **Logs chấm công**.

| Việc | Cần quyền | Mặc định |
|---|---|---|
| Vào trang, xem 4 tab, xuất Excel | `attendance.view` | Admin, Assistant, Manager |
| **Đồng bộ ngay**, **Gán nhân viên** / **Đổi mapping**, **Gỡ** | `attendance.manage` | Admin, Assistant, Manager |
| **Dọn dẹp log cũ** (xoá vĩnh viễn) | `attendance.delete` | Chỉ Admin |

Phạm vi xem phụ thuộc cấu hình ở **Phân quyền**. Với phạm vi **Phòng ban quản lý**, bạn chỉ thấy chấm công của nhân viên **đã map** thuộc phòng ban bạn quản lý (log chưa map bị ẩn); nếu bạn chưa quản lý phòng ban nào thì bảng trống. Nếu thiếu `attendance.view`, mục menu bị ẩn và gõ thẳng đường dẫn sẽ đưa bạn về trang Khách hàng.

## Bắt đầu nhanh

1. Mở tab **Mapping nhân viên**, với mỗi mã trên máy còn thẻ cam **Chưa map**, bấm **Gán nhân viên** rồi chọn nhân viên tương ứng.
2. Bấm **Đồng bộ ngay**, chọn khoảng ngày (ví dụ **Hôm nay**) và **Bắt đầu đồng bộ**.
3. Sang tab **Bảng chấm công** để xem kết quả theo ngày, hoặc **Tổng hợp chấm công** để xem theo tháng.

## Giải thích từng cột / nút / bộ lọc

### Tab Mapping nhân viên

```az-demo
zk-mapping viewer=manage
```

- Cột **Mã User (máy)**, **Tên trên máy**, **Trạng thái map** (thẻ **Đã map** kèm nhân viên, hoặc **Chưa map**), **Thao tác** (chỉ người có `attendance.manage` thấy).
- **Gán nhân viên** / **Đổi mapping**: chọn nhân viên trong hệ thống cho mã máy đó.
- **Gỡ**: gỡ mapping khi map nhầm. Log cũ đã đồng bộ **vẫn giữ nguyên**; chỉ log mới sau khi gỡ mới thành chưa khớp.
- **Đồng bộ ngay**: mở hộp thoại chọn khoảng ngày (**Hôm nay**, **1 tuần gần đây**, **1 tháng gần đây**, **3 tháng gần đây**, **1 năm gần đây**, **Toàn bộ (không giới hạn)** hoặc **Tuỳ chọn khoảng ngày khác**). Chọn khoảng hẹp sẽ nhanh hơn. Xong hệ thống hiện kết quả: tổng log đọc từ máy, số ghi mới, số đã khớp nhân viên, mã máy còn chưa map, số dòng bị bỏ qua do lỗi giờ, và tự **khớp lại** các log cũ trước đây chưa map nay đã có mapping.
- Nếu kết quả báo **có thể chưa lấy đủ dữ liệu từ máy**, bấm **Đồng bộ ngay** thêm một lần.

### Tab Bảng chấm công

```az-demo
attendance-table tab=summary
```

Mỗi dòng là **một nhân viên trong một ngày**: **Ngày**, **Nhân viên**, **Giờ vào** (lượt quẹt sớm nhất), **Giờ ra** (lượt quẹt muộn nhất), **Tổng giờ làm**, **Trạng thái**. Bộ lọc: **Lọc theo nhân viên**, khoảng ngày, **Tải lại**, **Xuất Excel**.

Cách tính trạng thái (giờ Việt Nam):

- **Đi muộn**: giờ vào sau 09:00.
- **Về sớm**: giờ ra trước 18:00.
- **Thiếu chấm ra**: ngày đó chỉ có 1 lượt quẹt (giờ ra hiện "—", chưa suy ra được giờ ra thật nên không tính về sớm).
- **Đúng giờ**, **Đi muộn & về sớm** theo hai điều kiện trên.
- Các lượt quẹt của cùng một người cách nhau **dưới 2 tiếng** được coi là một lượt có mặt (giữ lượt đầu), để quẹt lặp không bị hiểu thành giờ vào/ra khác nhau.

### Tab Tổng hợp chấm công

Bảng theo **tháng** (chọn tháng ở ô **MM/YYYY**), có **Lọc theo nhân viên**, dòng **Ngày công chuẩn tháng**, **Xuất Excel**. Mỗi nhân viên một dòng với các cột **STT**, **Họ và tên**, **Vị trí**, các ngày trong tháng, **Ngày công thực tế**, **Ngày nghỉ** (**Hưởng lương**, **Không lương**), **Số ngày nghỉ phép còn lại**, **Ghi chú** (liệt kê các ngày đi trễ/về sớm và số phút). Ký hiệu mỗi ngày:

- **X** đi làm; **X/2** nghỉ nửa ngày hưởng lương; **1/2K** nghỉ nửa ngày không lương
- **P** nghỉ phép hưởng lương; **KL** nghỉ không lương cả ngày
- **-** chỉ chấm công 1 lần (thiếu chấm vào/ra)

Rê chuột vào ký hiệu để xem giải thích và lý do.

### Tab Logs chấm công

```az-demo
attendance-table tab=logs
```

Đây là **log thô** từng lượt quẹt: **Thời gian**, **Nhân viên** (hoặc thẻ cam **Chưa khớp: ...**), **Nguồn**, **Mã máy**. **Nguồn** là **Máy tự đẩy** (máy gửi lên ngay khi quẹt) hoặc **Đồng bộ thủ công** (do bấm **Đồng bộ ngay**). Bộ lọc: **Lọc theo nhân viên** (gồm cả mã máy chưa map), **Trạng thái khớp** (**Đã khớp** / **Chưa khớp**), khoảng ngày, **Tải lại**, **Xuất Excel**.

**Dọn dẹp log cũ** (chỉ `attendance.delete`): chọn một ngày, hệ thống xoá vĩnh viễn mọi log **trước** ngày đó sau một bước xác nhận cuối. Không hoàn tác được.

## Quy tắc & lưu ý nghiệp vụ

- **Giờ lưu theo giờ máy.** Hệ thống coi giờ trên máy chấm công là giờ Việt Nam và lưu **nguyên văn** (cột kiểu DATETIME), không cộng trừ múi giờ. Vì vậy nếu **đồng hồ trên máy bị sai**, giờ chấm công cũng sai theo; hãy chỉnh lại giờ trên máy.
- Log có thể đến theo 2 đường: máy tự đẩy khi quẹt, và đồng bộ thủ công. Ngoài ra, quản trị có thể cấu hình một dịch vụ giám sát bên ngoài gọi định kỳ để tự đồng bộ log của ngày hôm nay (lịch gọi do bên cấu hình quyết định, không nằm trong ứng dụng); nếu thiếu dữ liệu, hãy bấm **Đồng bộ ngay**.
- Nhân viên chỉ có chấm công khi mã máy của họ đã được **map**. Log đến trước khi map vẫn được lưu và sẽ được khớp lại ở lần đồng bộ sau.
- **Gỡ** mapping không xoá log cũ.
- Bảng chấm công chỉ **gộp để hiển thị**; log thô ở tab **Logs chấm công** vẫn giữ nguyên để tra soát.

## Vì sao tôi không thấy …?

- Không thấy mục **Máy chấm công**: bạn thiếu `attendance.view`.
- Không thấy nút **Đồng bộ ngay**, **Gán nhân viên**, **Gỡ** và cột **Thao tác**: bạn thiếu `attendance.manage`.
- Không thấy **Dọn dẹp log cũ**: chỉ người có `attendance.delete` (mặc định Admin).
- Không thấy chấm công của một nhân viên: kiểm tra mã máy đã **map** chưa, khoảng ngày đang lọc, và phạm vi **Phòng ban quản lý** của bạn có bao gồm họ không.
- Báo **Mất kết nối** nhưng vẫn có dữ liệu: log máy tự đẩy lên không phụ thuộc chấm trạng thái; **Đồng bộ ngay** thì cần kết nối tới máy.

## Xem thêm

- [Nghỉ phép](/huong-dan/nghi-phep)
- [Nhân viên](/huong-dan/nhan-vien)
- [Phân quyền](/huong-dan/phan-quyen)