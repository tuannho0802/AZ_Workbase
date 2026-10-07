---
title: Thông báo đã gửi
slug: thong-bao-da-gui
sortOrder: 52
published: false
roles: []
positions: []
departments: []
permissions: [notification_broadcasts.view]
---

## Trang này để làm gì

Trang **Thông báo đã gửi** là **lịch sử các thông báo thủ công** đã gửi qua [Gửi thông báo](/huong-dan/gui-thong-bao). Ở đây bạn xem từng lần gửi đã đến ai, **ai đã đọc / chưa đọc**, và (nếu có quyền) **sửa** hoặc **xoá** lần gửi đó.

## Ai dùng được & thấy gì

Vào trang cần quyền **Xem lịch sử Thông báo thủ công** (`notification_broadcasts.view`). Theo cấu hình mặc định, Admin và Manager có quyền này; Assistant và Employee thì không (vào thẳng đường dẫn sẽ bị đưa về trang Thông báo).

```az-demo
broadcast-sent-actions
```

Phạm vi xem mặc định: **Admin thấy mọi lần gửi**, **Manager chỉ thấy lần do chính mình gửi**. Hai trang này khác phạm vi với trang Khách hàng: ở đây không có mức “Phòng ban”, chỉ có “Toàn bộ” hoặc “Của tôi”. Admin có thể đổi trong trang **Phân quyền**.

Ví dụ với Admin (thấy tất cả, có lọc **Người gửi**, có nút Xoá):

```az-demo
broadcast-sent-table viewer=admin
```

Ví dụ với Manager (chỉ lần của mình, không có lọc **Người gửi**, không có nút Xoá):

```az-demo
broadcast-sent-table viewer=manager
```

## Bắt đầu nhanh

1. Vào **Thông báo đã gửi**. Danh sách xếp theo lần gửi mới nhất trước, mỗi lần hiện 20 dòng, bấm **Tải thêm** để xem tiếp.
2. Dùng hàng bộ lọc để tìm: **Tìm theo tiêu đề** (gõ rồi nhấn Enter hoặc bấm biểu tượng tìm), **Đối tượng** (Chọn người nhận / Theo phòng ban / Toàn bộ nhân viên), **Người gửi** (chỉ phạm vi Toàn bộ), và khoảng ngày gửi **Từ ngày → Đến ngày**.
3. Bấm vào một dòng để mở **ngăn chi tiết** bên phải.
4. Cần gửi mới thì bấm **Soạn thông báo mới** (cần quyền gửi), cửa sổ soạn mở ngay tại trang.

## Giải thích từng cột

- **Tiêu đề**: nếu lần gửi đã được sửa, bên dưới có dòng “Đã chỉnh sửa lúc …”.
- **Người gửi**: tên và vai trò người gửi.
- **Thời gian**: lúc gửi.
- **Đối tượng**: **Toàn bộ**, **N phòng ban**, hoặc **N người**.
- **Tiến độ đọc**: thanh tiến độ và số “đã đọc/tổng”.
- **Thao tác**: nút bút chì (Sửa) và thùng rác (Xoá), chỉ hiện khi bạn có quyền tương ứng.

## Ngăn chi tiết

```az-demo
broadcast-sent-drawer
```

- Hiện đầy đủ nội dung, số **Đã đọc**, **Chưa đọc** và **Đối tượng**.
- Danh sách người nhận có 3 tab: **Tất cả**, **Chưa đọc**, **Đã đọc**, và ô **Tìm theo tên**.
- Cột **Trạng thái**: **Đã đọc** (kèm thời điểm đọc), **Chưa đọc**, hoặc **Đã khoá** nếu tài khoản người nhận đang bị khoá.

## Sửa và xoá

- **Sửa** (cần `notification_broadcasts.edit`): đổi **Tiêu đề** (tối đa 200 ký tự) và **Nội dung** (tối đa 2000 ký tự). Tiêu đề mới cập nhật ngay trong hộp thư của mọi người nhận; nội dung luôn lấy bản mới nhất khi họ mở thông báo. **Không thể đổi người nhận** sau khi gửi.
- **Xoá** (cần `notification_broadcasts.delete`, mặc định chỉ Admin; có hộp xác nhận “Xoá thông báo này?”): thông báo biến mất khỏi **mọi hộp thư người nhận**, **không hoàn tác**. Khác với việc người nhận tự bấm Ẩn ở [Thông báo](/huong-dan/thong-bao), đây là xoá hẳn với tất cả. Hệ thống vẫn giữ bản ghi nội bộ của lần gửi và dòng nhật ký để đối chiếu ai đã gửi gì.
- Cả Sửa và Xoá đều được ghi vào **Nhật ký hệ thống**.

## Quy tắc & lưu ý

- Số **đã đọc / chưa đọc** tính trên tất cả bản gửi đi, kể cả người nhận đã khoá tài khoản (họ vẫn nằm trong “chưa đọc”) hoặc đã tự ẩn thông báo.
- Người nhận được chốt lúc gửi (xem [Gửi thông báo](/huong-dan/gui-thong-bao)); nhân viên vào sau không xuất hiện trong danh sách.
- Người nhận đã bị xoá khỏi hệ thống hiện tên là “(Đã xoá)”.

## Vì sao tôi không thấy …?

- **Không thấy mục Thông báo đã gửi**: chưa có quyền `notification_broadcasts.view`.
- **Không thấy lần gửi của người khác**: phạm vi xem của bạn là “Của tôi”; chỉ Admin (phạm vi Toàn bộ) thấy của mọi người.
- **Không có nút Soạn thông báo mới / Sửa / Xoá**: thiếu quyền gửi (`create`), sửa (`edit`) hoặc xoá (`delete`) tương ứng.
- **Không có ô lọc Người gửi**: ô này chỉ có ở phạm vi Toàn bộ.

## Xem thêm

- [Gửi thông báo](/huong-dan/gui-thong-bao)
- [Thông báo](/huong-dan/thong-bao)
