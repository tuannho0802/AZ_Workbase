---
title: Hướng dẫn sử dụng - đọc và soạn bài
slug: huong-dan-su-dung
sortOrder: 5
published: true
roles: []
positions: []
departments: []
permissions: []
---

## Trang này để làm gì

Trang **Hướng dẫn sử dụng** là nơi đọc các bài hướng dẫn dùng hệ thống. Ai đăng nhập cũng đọc được; **người có quyền soạn bài** còn tạo, sửa, xoá và xuất bản bài tại đây. Bài này gồm hai phần: cách **đọc** và cách **soạn**.

## Đọc hướng dẫn

1. Bấm **Hướng dẫn sử dụng** ở menu bên trái.
2. Chọn bài trong **Mục lục** (cột trái). Bài đang mở được tô sáng.
3. Muốn xem bài của trang bạn đang làm việc, bấm nút **Xem hướng dẫn trang này** trên thanh trên cùng; nút tự ẩn nếu trang đó chưa có bài hoặc bài không dành cho bạn.

Mục lục chỉ liệt kê bài **đã xuất bản** và **đúng đối tượng của bạn**. Không thấy một bài có thể do bài còn là nháp, hoặc bài giới hạn theo vai trò, vị trí, phòng ban hay quyền mà bạn không thuộc.

## Soạn bài (cần quyền `guides.manage`)

Quyền **Quản lý Hướng dẫn sử dụng** (`guides.manage`) mặc định chỉ có Admin; Admin có thể cấp thêm ở trang Phân quyền. Người có quyền này thấy thêm:

- Nút **Tạo** ở đầu Mục lục.
- Nút **Sửa** và **Xoá** ở đầu mỗi bài.
- Thấy cả bài **Nháp** (có nhãn *Nháp* cạnh tên) và luôn xem được mọi bài đã xuất bản.

### Tạo bài mới

1. Bấm **Tạo**. Hộp thoại **Tạo hướng dẫn** mở ra.
2. Điền các ô (bảng bên dưới).
3. Viết nội dung ở tab **Soạn Markdown**, bấm tab **Xem trước** để kiểm tra giao diện.
4. Bấm **Lưu**. Thành công sẽ có thông báo **Đã tạo hướng dẫn**.

| Ô | Cách điền |
|---|---|
| **Tiêu đề** | Bắt buộc, tối đa 200 ký tự. Ví dụ: *Cách thêm khách hàng mới*. |
| **Slug (đường dẫn)** | Phần cuối của địa chỉ bài (`/huong-dan/<slug>`). Bỏ trống để hệ thống tự sinh từ tiêu đề. Chỉ gồm chữ thường, số, gạch ngang. |
| **Thứ tự** | Số nguyên, **số nhỏ hiện trước** trong Mục lục. |
| **Xuất bản** | Bật = mọi người thuộc đối tượng xem được. Tắt = **bản nháp**, chỉ người có quyền soạn thấy. |
| **Role được xem** | Chọn một hoặc nhiều vai trò. Để trống = mọi vai trò. |
| **Vị trí được xem** | Chọn vị trí. Để trống = mọi vị trí. |
| **Phòng ban được xem** | Chọn phòng ban. Để trống = mọi phòng ban. |
| **Cần quyền để xem** | Chọn một hoặc nhiều quyền (gom theo nhóm như trang Phân quyền). Người xem phải có **tất cả** quyền đã chọn. Đổi ma trận quyền thì bài tự ẩn/hiện theo. |

**Cách các ô đối tượng kết hợp:**

- Để trống một ô = không giới hạn theo mục đó. Để trống cả bốn ô = mọi người đăng nhập đều xem được.
- **Giữa các ô là AND:** người xem phải thoả tất cả ô đã chọn (ví dụ Role = Employee **và** Vị trí = Sales **và** có đủ quyền đã chọn).
- **Trong cùng một ô** role/vị trí/phòng ban chỉ cần thuộc **một** trong các mục đã chọn.
- Nên chọn **Cần quyền để xem** bằng đúng quyền để vào trang đó (ví dụ bài Khách hàng cần Xem khách hàng), để người không có quyền không thấy bài thừa.

### Sửa và xoá bài

- **Sửa:** mở bài, bấm **Sửa**, chỉnh rồi bấm **Lưu** (**Đã cập nhật hướng dẫn**).
- **Xoá:** bấm **Xoá**, xác nhận **Xoá**. Bài bị **xoá mềm** và slug được giải phóng để dùng lại.
- Muốn gỡ bài khỏi người đọc nhưng chưa xoá: sửa và tắt **Xuất bản**.

### Viết nội dung bằng Markdown

Hộp soạn dùng Markdown, hỗ trợ **bảng** và **danh sách việc cần làm**. Một số lưu ý:

- Tiêu đề: `## Tiêu đề mục`. Danh sách: dòng bắt đầu bằng `-` hoặc `1.`.
- **Liên kết nội bộ:** `[Khách hàng](/huong-dan/khach-hang)` mở ngay trong ứng dụng. Liên kết ngoài (https) mở tab mới.
- **Ảnh:** chỉ nhận địa chỉ **https://**.
- **Không dùng HTML thô** (thẻ `<script>`, `<img>`... sẽ hiện thành chữ) và các liên kết kiểu `javascript:` bị loại bỏ, để đảm bảo an toàn.

### Chèn mẫu minh hoạ

Mẫu minh hoạ là bản **giao diện mô phỏng** (dữ liệu giả, không bấm được) nhúng thẳng vào bài, giúp người đọc hình dung màn hình thật.

1. Ở tab **Soạn Markdown**, mở ô **Chèn mẫu minh hoạ** phía trên hộp soạn và chọn mẫu. Hệ thống tự thêm một khối vào cuối nội dung.
2. Khối có dạng như sau (đây là cú pháp, bạn không cần gõ tay):

````text
```az-demo
status-tags
```
````

3. Một số mẫu nhận **tham số** ghi cùng dòng với tên mẫu, ví dụ `customer-table-by-viewer persona=manager`. Tên mẫu hoặc tham số sai sẽ hiện **khung cảnh báo** thay cho mẫu. Bấm **Xem trước** để kiểm tra.

Ví dụ một mẫu hiển thị trong bài:

```az-demo
status-tags
```

### Cấu trúc bài nên theo

1. **Trang này để làm gì** (1 đến 2 câu).
2. **Ai dùng được & thấy gì.**
3. **Bắt đầu nhanh** (3 đến 5 bước đánh số).
4. **Giải thích từng cột / nút / bộ lọc**, chỉ những thứ thật sự có trên trang.
5. **Quy tắc & lưu ý nghiệp vụ.**
6. **Vì sao tôi không thấy...?**
7. **Xem thêm** (liên kết sang bài liên quan).

### Danh sách kiểm tra trước khi bật Xuất bản

- Tên cột, tên nút **khớp đúng chữ trên giao diện thật**, đừng chép từ tài liệu cũ.
- Mọi quyền nhắc tới **có thật**, và mô tả đúng hành vi hiện tại (ai thấy, ai bấm được).
- Mọi mẫu minh hoạ hiện ra bình thường ở **Xem trước** (không có khung cảnh báo).
- Đã chọn đúng đối tượng xem và quyền cần có.
- Đăng nhập thử bằng một tài khoản thuộc đối tượng đó để chắc chắn bài hiện ra.

## Dành cho nhóm kỹ thuật: soạn bài bằng tệp trong kho mã

Ngoài soạn trên giao diện, bài còn có thể viết thành tệp `guides-content/<slug>.md` trong kho mã và đồng bộ vào hệ thống bằng lệnh `guides:sync` (có lịch sử git, dễ kiểm duyệt). Hướng dẫn chi tiết nằm trong `guides-content/README.md`.

Lưu ý quan trọng: nếu một bài đã đồng bộ từ tệp mà bị **sửa tay trên giao diện**, lần đồng bộ sau sẽ báo **xung đột** và không ghi đè (trừ khi dùng `--force`). Vì vậy với bài có tệp nguồn, hãy sửa ở tệp thay vì sửa trên giao diện.

## Vì sao tôi không thấy...?

- **Không thấy nút Tạo/Sửa/Xoá:** bạn chưa có quyền `guides.manage`.
- **Không thấy một bài trong Mục lục:** bài còn là nháp, hoặc bạn không thuộc đối tượng xem (role, vị trí, phòng ban hoặc quyền).
- **Nút Xem hướng dẫn trang này biến mất:** trang đó chưa có bài, hoặc bài không dành cho bạn.
- **Mẫu minh hoạ hiện khung cảnh báo:** tên mẫu hoặc tham số bị sai; chọn lại ở ô **Chèn mẫu minh hoạ**.

## Xem thêm

- [Bắt đầu sử dụng AZWorkbase](/huong-dan/bat-dau)
- [Khách hàng](/huong-dan/khach-hang)
