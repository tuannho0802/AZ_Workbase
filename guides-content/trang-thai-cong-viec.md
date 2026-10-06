---
title: Quản lý Trạng thái công việc
slug: trang-thai-cong-viec
sortOrder: 12
published: false
roles: []
positions: []
departments: []
permissions: [periodic_task_statuses.view]
---

## Trang này để làm gì

Trang **Quản lý Trạng thái công việc** là nơi cấu hình **danh sách Trạng thái của Công việc định kỳ**: tên, màu, mô tả, thứ tự và hai công tắc quyết định trạng thái đó có được tính là *xong* hay không. Ô chọn **Trạng thái** khi tạo/sửa việc, Tag màu, bộ lọc và **các cột của Kanban** đều lấy danh sách từ trang này, nên thêm hoặc đổi một trạng thái ở đây có hiệu lực ngay ở khắp nơi, không cần nhờ lập trình viên.

Vào từ mục **Quản lý Trạng thái công việc** ở menu, hoặc nút **Quản lý Trạng thái** ở đầu trang [Công việc định kỳ](/huong-dan/cong-viec-dinh-ky).

Màu và tên của Tag trạng thái trông như sau (tên và màu thật do Admin cấu hình, có thể khác ví dụ):

```az-demo
task-status-tags
```

## Ai dùng được

Vào trang cần quyền **Xem Trạng thái công việc định kỳ** (`periodic_task_statuses.view`). Theo cấu hình mặc định, cả 4 vai trò Admin, Assistant, Manager và Employee đều có quyền này. Nếu Admin đã thu hồi, bạn sẽ được đưa về trang **Công việc định kỳ**.

Các nút còn lại gate riêng:

| Việc | Cần quyền | Mặc định |
|---|---|---|
| Nút **Thêm trạng thái mới**, nút **Sửa** | `periodic_task_statuses.manage` | Admin, Assistant |
| Nút **Xoá** | `periodic_task_statuses.delete` | Chỉ Admin |

Cột **Thao tác** chỉ hiện khi bạn có ít nhất một trong hai quyền trên. Nút **Xoá** còn bị ẩn ở mọi trạng thái **Hệ thống** (có ổ khoá), kể cả với Admin.

> Quyền **Xem** chỉ quyết định bạn có thấy trang **quản lý** hay không. Ô chọn Trạng thái ở trang Công việc định kỳ vẫn hoạt động bình thường với mọi nhân viên đã đăng nhập, kể cả khi họ không có quyền Xem này.

## Bảng trạng thái

```az-demo
task-status-manage-table
```

Phía trên bảng có ô tìm **theo tên hoặc mã trạng thái** và bộ lọc **Loại** (**Hệ thống** hoặc **Tuỳ chỉnh**). Bộ lọc chạy ngay trên trình duyệt, danh sách không phân trang.

| Cột | Ý nghĩa |
|---|---|
| **Trạng thái** | Tag màu đúng như người dùng sẽ thấy ở nơi khác. Biểu tượng **ổ khoá** vàng đánh dấu trạng thái Hệ thống (rê chuột để xem giải thích). |
| **Mã (code)** | Giá trị thật được lưu vào dữ liệu việc. Không đổi được sau khi tạo. |
| **Mô tả** | Ghi chú ngắn về ý nghĩa, không bắt buộc. |
| **Tính % hoàn thành** | **Hoàn thành** (xanh) nếu trạng thái này được tính là đã xong, **Chưa tính** nếu không. Xem phần "Hai công tắc" bên dưới. |
| **Đang dùng** | Số Công việc định kỳ đang ở trạng thái này (xem lưu ý ở phần Xoá). Số **0** nghĩa là chưa có việc nào. |
| **Thứ tự hiển thị** | Số nhỏ hiện trước trong ô chọn **và là thứ tự các cột Kanban**. |
| **Thao tác** | **Sửa** và **Xoá** (theo quyền ở trên). |

### 5 trạng thái hệ thống

Hệ thống có sẵn 5 trạng thái (đều có ổ khoá). Bạn **sửa được tên, màu, mô tả, thứ tự và hai công tắc** nhưng **không xoá được**.

| Mã (code) | Tên ban đầu | Ý nghĩa | Tính % hoàn thành |
|---|---|---|---|
| `not_started` | To-Do | Mặc định khi vừa tạo việc | Chưa tính |
| `in_progress` | Đang làm | Việc đang được làm | Chưa tính |
| `in_review` | Xem xét | Đang được Manager hoặc Mentor xem xét, đánh giá lại | Chưa tính |
| `completed` | Hoàn thành | Đã hoàn thành qua giai đoạn Review hoặc Đánh giá xong | Hoàn thành |
| `not_completed` | Không hoàn thành | Được đánh giá là không hoàn thành | Chưa tính |

Tên có thể khác ở hệ thống của bạn nếu Admin đã đổi. **Mã thì không bao giờ đổi.** Dòng mô tả dưới tiêu đề trang vẫn nhắc "3 trạng thái hệ thống" là cách viết cũ; thực tế hiện có 5.

## Bắt đầu nhanh

### 1. Thêm một trạng thái mới

1. Bấm **Thêm trạng thái mới**.
2. Điền **Mã trạng thái (code)**: chỉ chữ thường, số và dấu gạch dưới, tối đa 50 ký tự (ví dụ `waiting_client`). Mã đã tồn tại sẽ bị từ chối.
3. Điền **Tên hiển thị** (tối đa 100 ký tự).
4. Chọn **Màu hiển thị** (bắt buộc, mặc định xanh `#1890ff`). Tuỳ chọn thêm **Mô tả** (tối đa 255 ký tự) và **Thứ tự hiển thị** (mặc định 0).
5. Bật hoặc tắt hai công tắc **Tính là Hoàn thành (cho % rollup)** và **Loại khỏi % rollup** (mặc định đều tắt).
6. Bấm **OK**. Thông báo "Đã thêm trạng thái mới".

```az-demo
task-status-form
```

> **Nghĩ kỹ mã trước khi lưu.** Mã được ghi thẳng vào dữ liệu việc và không sửa được. Nếu gõ nhầm mã, cách duy nhất là tạo trạng thái mới đúng mã rồi xoá trạng thái cũ (kèm chuyển việc sang trạng thái mới).

### 2. Sửa một trạng thái

1. Bấm **Sửa** ở dòng cần đổi.
2. Đổi **Tên hiển thị**, **Mô tả**, **Màu**, **Thứ tự** hoặc hai công tắc. Ô **Mã** bị khoá.
3. Bấm **OK**. Thông báo "Đã cập nhật trạng thái".

Việc đang dùng trạng thái đó tự hiện tên và màu mới ở mọi nơi.

### 3. Xoá một trạng thái

Chỉ xoá được trạng thái **Tuỳ chỉnh**, và chỉ khi bạn có quyền Xoá.

- **Không có việc nào đang dùng**: hộp thoại hỏi xác nhận rồi xoá.
- **Đang có việc dùng**: hộp thoại hiện cảnh báo "Đang có N Công việc định kỳ dùng trạng thái này" và **bắt buộc** chọn một **trạng thái thay thế**. Nút **Xoá** chỉ bật sau khi bạn chọn. Hệ thống chuyển toàn bộ việc đó sang trạng thái thay thế và xoá trạng thái cũ trong cùng một lần, nên không bao giờ bị dở dang.

```az-demo
task-status-delete-fallback
```

Trạng thái thay thế có thể là **bất kỳ trạng thái nào khác**, kể cả trạng thái hệ thống. Sau khi xoá, thông báo cho biết đã chuyển bao nhiêu việc.

> **Không hoàn tác được.** Sau khi chuyển, hệ thống không nhớ việc nào từng thuộc trạng thái cũ. Nếu chỉ muốn gọi khác đi, hãy **đổi tên** hoặc **đổi màu** thay vì xoá.

## Hai công tắc: Tính là Hoàn thành và Loại khỏi % rollup

Đây là phần khác biệt so với trang Status khách. Hai công tắc cho hệ thống biết cách *đếm* việc ở trạng thái này.

| Công tắc | Khi bật |
|---|---|
| **Tính là Hoàn thành (cho % rollup)** | Việc ở trạng thái này được tính là **đã xong**. |
| **Loại khỏi % rollup** | Việc ở trạng thái này **không được tính** vào cả tử số lẫn mẫu số của % hoàn thành. Hợp với trạng thái như "Đã huỷ": không phải xong, cũng không phải còn treo. |

Công tắc **Tính là Hoàn thành** hiện đang tác động tới:

- **% hoàn thành của việc cha**: ở modal Liên kết, mỗi việc con ở trạng thái "tính là Hoàn thành" được đếm là xong. Việc con ở trạng thái **Loại khỏi % rollup** bị bỏ khỏi cả tử số lẫn mẫu số.
- **Tiến độ trên nút Checklist** (dạng "đã xong/tổng"): việc con liên kết được đếm là xong theo cùng quy tắc.
- **Hộp thoại xác nhận khi đổi trạng thái**: đổi một việc còn mục checklist chưa tick sang trạng thái "tính là Hoàn thành" sẽ hỏi "Bạn đã hoàn thành Task?"; chọn Có thì hệ thống tick hết các mục.
- **Trang Hiệu suất công việc**: việc ở trạng thái này được tính là đã xong; việc ở trạng thái **Loại khỏi % rollup** bị trừ khỏi tổng.
- **Nhắc deadline tự động**: chỉ nhắc các việc **Ngày/Tuần** chưa ở trạng thái "tính là Hoàn thành" (khi dịch vụ nhắc được bật).

> **Lưu ý quan trọng.** Cờ **Quá hạn** và việc **tự khoá khi quá hạn kỳ hơn 7 ngày** nhận biết "đã xong phần việc" theo **mã** trạng thái `in_review` hoặc `done`, **không** theo công tắc **Tính là Hoàn thành**. Mã `completed` của trạng thái **Hoàn thành** không nằm trong hai mã này, và một trạng thái do bạn tự thêm cũng vậy. Xem thêm ở [Công việc định kỳ](/huong-dan/cong-viec-dinh-ky).

### Mã trạng thái mà hệ thống dùng riêng

Một vài chức năng tự đổi trạng thái hộ bạn và tìm trạng thái đích **theo mã**:

- `not_started`: trạng thái mặc định khi tạo việc mà không chọn trạng thái.
- `in_progress`: hệ thống tự chuyển việc sang đây khi bạn tick mục checklist đầu tiên của việc đang ở `not_started`, hoặc khi **mở lại** việc đã xong (kéo dài kỳ tới hôm nay nếu kỳ đã qua).
- `in_review` và `done`: nhận biết \"đã xong phần việc\" cho cờ Quá hạn, tự khoá và Hiệu suất (xem lưu ý ở trên). Hệ thống có sẵn `in_review`; mã `done` không có sẵn, chỉ có tác dụng nếu Admin tự thêm.

Vì vậy **đừng đặt lại ý nghĩa** của các mã này. Mã không đổi được sau khi tạo, nên chọn mã ngay từ đầu.

## Trạng thái hiện ra ở đâu

- **Công việc định kỳ**: ô **Trạng thái** khi tạo/sửa việc, bộ lọc **Trạng thái**, Tag màu trên các chế độ xem việc.
- **Kanban**: **mỗi trạng thái là một cột**, xếp theo **Thứ tự hiển thị** từ nhỏ đến lớn. Kéo thẻ sang cột khác là đổi trạng thái (cần quyền Sửa và việc không bị khoá, hoặc bạn có quyền sửa việc đang khoá). Thêm trạng thái mới sẽ có thêm cột; đổi tên, màu, thứ tự có hiệu lực ngay; xoá một trạng thái thì cột biến mất và việc dồn sang cột thay thế.
- **Lịch sử của việc**: dòng "đổi trạng thái" ghi tên trạng thái trước và sau khi đổi.

Xem cách dùng các chế độ xem ở [Công việc định kỳ](/huong-dan/cong-viec-dinh-ky).

## Quy tắc & lưu ý nghiệp vụ

- **"Hệ thống" nghĩa là không xoá được**, không phải "khoá không cho sửa". Ổ khoá chỉ chặn nút **Xoá**; bạn vẫn sửa tên, màu, mô tả, thứ tự và hai công tắc. Trạng thái **không có khái niệm "khoá" việc**: khoá là thuộc tính của từng **công việc**, không phải của trạng thái.
- **Mã (code) bất biến** và không trùng nhau (trùng sẽ báo "Mã trạng thái ... đã tồn tại").
- **Thứ tự hiển thị** quyết định thứ tự trong ô chọn và thứ tự cột Kanban: số nhỏ hiện trước.
- **Số "Đang dùng" không tính việc đã nằm trong Thùng rác.** Nếu một trạng thái chỉ còn việc trong Thùng rác dùng, cột này hiện **0** và hệ thống **không bắt chọn trạng thái thay thế** khi xoá. Vì dữ liệu việc vẫn đang trỏ tới trạng thái đó nên thao tác xoá có thể bị từ chối; hãy khôi phục hoặc xử lý các việc đó trước rồi xoá lại.
- Mọi thao tác thêm, sửa, xoá đều được ghi vào **Nhật ký hệ thống**.

## Vì sao tôi không thấy …?

- **Không vào được trang, bị đưa về Công việc định kỳ**: bạn không có quyền **Xem Trạng thái công việc định kỳ**. Liên hệ Admin.
- **Không thấy nút Thêm hoặc Sửa**: bạn thiếu quyền **Tạo/sửa Trạng thái công việc định kỳ**.
- **Không thấy nút Xoá**: hoặc bạn thiếu quyền **Xoá**, hoặc đây là trạng thái **Hệ thống** (không ai xoá được).
- **Không thấy cột Thao tác**: bạn không có cả quyền Tạo/sửa lẫn quyền Xoá.
- **Không thấy nút Quản lý Trạng thái ở trang Công việc định kỳ**: nút này cũng cần quyền Xem Trạng thái công việc định kỳ.

## Xem thêm

- [Công việc định kỳ](/huong-dan/cong-viec-dinh-ky)
- [Quản lý Status khách](/huong-dan/status-khach) (trang cùng kiểu, dành cho khách hàng)
