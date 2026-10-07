---
title: Gửi thông báo
slug: gui-thong-bao
sortOrder: 51
published: false
roles: []
positions: []
departments: []
permissions: [notification_broadcasts.create]
---

## Trang này để làm gì

Trang **Gửi thông báo** (mục **Gửi thông báo** ở menu) cho phép bạn **soạn và gửi một thông báo thủ công** tới nhân viên, phòng ban hoặc toàn công ty. Người nhận thấy thông báo trong hộp thư của họ (loại **Thông báo**, có dòng “Từ … đến …”), xem [Thông báo](/huong-dan/thong-bao). Muốn xem lại những gì đã gửi, ai đã đọc, sửa hoặc xoá, vào [Thông báo đã gửi](/huong-dan/thong-bao-da-gui).

## Ai dùng được & thấy gì

Cần quyền **Soạn & gửi Thông báo thủ công** (`notification_broadcasts.create`). Theo cấu hình mặc định:

| Vai trò | Gửi được không | Gửi cho ai |
|---|---|---|
| Admin | Có | Bất kỳ ai, kể cả **Toàn bộ nhân viên** |
| Manager | Có | Chỉ nhân viên thuộc **phòng ban bạn quản lý** |
| Assistant, Employee | Không | Menu không hiện; vào thẳng đường dẫn sẽ bị đưa về trang Thông báo |

Quyền này có **phạm vi gửi** (Toàn bộ / Phòng ban) và Admin có thể đổi trong trang **Phân quyền**, nên nếu bạn được cấp thêm quyền thì phạm vi áp dụng đúng như cấu hình của bạn. Phạm vi **Phòng ban** (Manager) không có lựa chọn **Toàn bộ nhân viên**; hệ thống cũng kiểm tra lại ở máy chủ, không chỉ ẩn nút.

```az-demo
broadcast-audience-rules
```

## Bắt đầu nhanh

1. Vào **Gửi thông báo**. Nhập **Tiêu đề** (tối đa 200 ký tự) và **Nội dung** (tối đa 2000 ký tự, chữ thuần).
2. Ở **Người nhận**, chọn một trong các kiểu: **Chọn người nhận** (chọn từng nhân viên), **Theo phòng ban**, hoặc **Toàn bộ nhân viên** (chỉ phạm vi Toàn bộ).
3. Bấm **Xem trước người nhận**. Hệ thống tính ra số người sẽ nhận, kèm vài tên làm ví dụ.
4. Kiểm tra lại, rồi bấm **Gửi tới N người**. Gửi cho Toàn bộ hoặc từ 20 người trở lên sẽ hỏi xác nhận thêm một lần.
5. Gửi xong, trang chuyển sang [Thông báo đã gửi](/huong-dan/thong-bao-da-gui).

```az-demo
broadcast-compose viewer=admin state=draft
```

Sau khi bấm **Xem trước người nhận**, nút **Gửi** mới bật:

```az-demo
broadcast-compose viewer=manager state=previewed
```

## Giải thích từng phần

- **Khung cảnh báo vàng**: không đưa SĐT, email hay số tiền của khách hàng vào nội dung. Thông báo gửi cho nhiều người nên dữ liệu khách có thể bị lộ.
- **Xem trước người nhận**: bắt buộc trước khi gửi. Nếu bạn sửa tiêu đề, nội dung hoặc người nhận **sau khi** xem trước, nút Gửi tắt lại và phải xem trước lần nữa.
- **Gửi tới N người**: N là số người thật sự nhận. Hệ thống ghi rõ nếu có người bị loại (ví dụ người nằm ngoài phạm vi hoặc tài khoản đã khoá).
- **Huỷ**: xoá sạch form, **không** gửi gì.

## Quy tắc & lưu ý

- **Người nhận được chốt ngay lúc gửi.** Nhân viên vào công ty hoặc đổi phòng ban sau đó sẽ không nhận bản này.
- **Bạn không tự nhận bản của mình.** Nếu bạn nằm trong nhóm người nhận, hệ thống bỏ bạn ra khỏi danh sách.
- **Một lần gửi tối đa 2000 người** (theo cấu hình mặc định của máy chủ). Vượt quá sẽ bị từ chối, hãy chia nhỏ theo phòng ban.
- **Giới hạn tốc độ: 10 lần gửi mỗi giờ** cho mỗi tài khoản. Quá giới hạn thì phải chờ.
- Cửa sổ chọn **Chọn người nhận** liệt kê toàn bộ nhân viên để tìm cho tiện, nhưng nếu bạn chọn người ngoài phạm vi (Manager chọn người phòng khác), máy chủ **từ chối** cả lần gửi và báo lỗi.
- Nếu tính năng thông báo đang bị tắt ở máy chủ, lần gửi sẽ báo “Tính năng thông báo đang tắt”. Báo Admin để bật.
- Gửi xong có thể **sửa hoặc xoá** ở trang [Thông báo đã gửi](/huong-dan/thong-bao-da-gui) nếu bạn có quyền tương ứng.

## Vì sao tôi không thấy / không gửi được …?

- **Không thấy mục Gửi thông báo**: tài khoản chưa có quyền `notification_broadcasts.create`. Nhờ Admin cấp trong **Phân quyền**.
- **Không có nút Toàn bộ nhân viên**: phạm vi gửi của bạn là Phòng ban, không phải Toàn bộ.
- **Nút Gửi bị mờ**: chưa bấm **Xem trước người nhận**, hoặc đã sửa nội dung sau khi xem trước.
- **Báo “Không có người nhận hợp lệ”**: sau khi loại bạn và người không hợp lệ, danh sách trống (ví dụ phòng ban chỉ có mình bạn).
- **Báo “Phòng ban ngoài phạm vi quản lý của bạn”**: bạn chọn phòng ban mà bạn không phải người quản lý.

## Xem thêm

- [Thông báo đã gửi](/huong-dan/thong-bao-da-gui)
- [Thông báo](/huong-dan/thong-bao)
