---
title: Hướng dẫn soạn bài
slug: huong-dan-soan-bai
sortOrder: 6
published: true
roles: [admin, assistant]
positions: []
departments: []
permissions: []
---

## Bài này dành cho ai

Dành cho **Admin** và **Assistant**: cách **tạo, sửa, xoá và xuất bản** bài hướng dẫn. Người chỉ cần đọc bài hãy xem [Hướng dẫn đọc bài](/huong-dan/huong-dan-su-dung).

Việc soạn bài dùng quyền **Quản lý Hướng dẫn sử dụng** (cấp ở trang **Phân quyền**). Người có quyền này sẽ có thêm:

- Nút **Tạo** ở đầu Mục lục.
- Nút **Sửa** và **Xoá** ở đầu mỗi bài.
- Các bài **Nháp** (có nhãn *Nháp* cạnh tên), và mọi bài đã xuất bản dù bài đó giới hạn cho nhóm nào.

## Tạo bài mới

1. Vào **Hướng dẫn sử dụng**, bấm **Tạo**. Hộp thoại **Tạo hướng dẫn** mở ra.
2. Điền các ô (xem bảng dưới).
3. Viết nội dung ở tab **Soạn Markdown**. Bấm tab **Xem trước** để kiểm tra giao diện.
4. Bấm **Lưu**. Thành công sẽ có thông báo **Đã tạo hướng dẫn**.

| Ô | Cách điền |
|---|---|
| **Tiêu đề** | Bắt buộc, tối đa 200 ký tự. Ví dụ: *Cách thêm khách hàng mới*. |
| **Slug (đường dẫn)** | Phần cuối của địa chỉ bài (`/huong-dan/<slug>`). Bỏ trống để hệ thống tự sinh từ tiêu đề. Chỉ gồm chữ thường, số, gạch ngang. |
| **Thứ tự** | Số nguyên, **số nhỏ hiện trước** trong Mục lục. |
| **Xuất bản** | Bật = người thuộc đối tượng xem được. Tắt = **bản nháp**, chỉ người có quyền soạn thấy. |
| **Role được xem** | Chọn một hoặc nhiều vai trò. Để trống = mọi vai trò. |
| **Vị trí được xem** | Chọn vị trí. Để trống = mọi vị trí. |
| **Phòng ban được xem** | Chọn phòng ban. Để trống = mọi phòng ban. |
| **Cần quyền để xem** | Chọn một hoặc nhiều quyền (gom theo nhóm như trang Phân quyền). Người xem phải có **tất cả** quyền đã chọn. Đổi ma trận quyền thì bài tự ẩn/hiện theo. |

### Chọn "ai được xem" cho đúng

- Để trống một ô = không giới hạn theo mục đó. Để trống cả bốn ô = **mọi người** đăng nhập đều xem được. Chỉ dùng cho bài chung như *Hướng dẫn đọc bài*.
- **Bài dành riêng cho một nhóm thì phải chọn đúng nhóm đó.** Ví dụ bài dành cho Sale: chọn **Vị trí được xem = Sale**; bài dành cho Admin: chọn **Role được xem = Admin**. Nếu để trống, bài sẽ hiện cho **tất cả mọi người**.
- **Giữa các ô là "VÀ":** người xem phải thoả tất cả ô đã chọn. Ví dụ Role = Employee **và** Vị trí = Content.
- **Trong cùng một ô** chỉ cần thuộc **một** mục đã chọn. Ví dụ Role = Admin, Assistant: người nào thuộc một trong hai đều xem được.
- Bài về một trang cụ thể nên chọn **Cần quyền để xem** bằng đúng quyền để vào trang đó (ví dụ bài Khách hàng cần *Xem khách hàng*), để người không có quyền không thấy bài thừa.

## Sửa, ẩn, xoá bài

- **Sửa:** mở bài, bấm **Sửa**, chỉnh rồi bấm **Lưu** (hiện **Đã cập nhật hướng dẫn**).
- **Ẩn tạm (chưa xoá):** sửa bài và tắt **Xuất bản**. Bài thành bản nháp, người đọc không thấy nữa.
- **Xoá:** bấm **Xoá**, xác nhận **Xoá**. Bài bị xoá mềm và đường dẫn (slug) được giải phóng để dùng lại.

> **Lưu ý về bài do IT Team quản lý:** một số bài được IT Team quản lý bằng tệp nguồn. Nếu bạn **sửa tay trên giao diện** những bài này, bản của bạn sẽ lệch với bản của IT và lần cập nhật sau của IT sẽ báo xung đột. Muốn đổi nội dung các bài đó, hãy báo IT Team.

## Viết nội dung bằng Markdown

Hộp soạn dùng Markdown, hỗ trợ **bảng** và **danh sách việc cần làm**.

- Tiêu đề mục: `## Tiêu đề mục`. Danh sách: dòng bắt đầu bằng `-` hoặc `1.`.
- **Chữ đậm:** `**chữ đậm**`. Dùng cho tên nút, tên cột đúng như trên màn hình.
- **Liên kết nội bộ:** `[Khách hàng](/huong-dan/khach-hang)` mở ngay trong ứng dụng. Chỉ liên kết tới bài **đã có thật**, kẻo người đọc gặp trang trống. Liên kết ngoài (https) mở tab mới.
- **Ảnh:** chỉ nhận địa chỉ **https://**.
- **Không dùng HTML thô** (thẻ như `<script>`, `<img>` sẽ hiện thành chữ) và liên kết kiểu `javascript:` bị loại bỏ để đảm bảo an toàn.

## Chèn hình minh hoạ

Hình minh hoạ là **bản mô phỏng giao diện** với dữ liệu giả, nhúng vào bài để người đọc hình dung màn hình thật. Người đọc cuộn, rê chuột xem được, bấm thử không lưu gì.

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

## Cấu trúc một bài nên theo

1. **Trang này để làm gì** (1 đến 2 câu).
2. **Ai dùng được & thấy gì.**
3. **Bắt đầu nhanh** (3 đến 5 bước đánh số).
4. **Giải thích từng cột / nút / bộ lọc**, chỉ những thứ thật sự có trên trang.
5. **Quy tắc & lưu ý nghiệp vụ.**
6. **Mẹo & lưu ý** (nếu có).
7. **Xem thêm** (liên kết sang bài liên quan).

## Kiểm tra trước khi bật Xuất bản

- Tên cột, tên nút **khớp đúng chữ trên giao diện thật**.
- Mọi quyền nhắc tới **có thật** và mô tả đúng hành vi hiện tại (ai thấy, ai bấm được).
- Mọi hình minh hoạ hiện bình thường ở **Xem trước** (không có khung cảnh báo).
- Đã chọn đúng đối tượng xem và quyền cần có.
- Đăng nhập thử bằng một tài khoản thuộc đối tượng đó để chắc chắn bài hiện ra.

## Khi cần xử lý

- **Cần các nút Tạo/Sửa/Xoá:** nhờ Admin cấp quyền *Quản lý Hướng dẫn sử dụng* ở trang **Phân quyền**.
- **Người khác báo không thấy bài:** kiểm tra bài đã **Xuất bản** chưa và các ô role/vị trí/phòng ban/quyền có đang giới hạn quá hẹp không.
- **Mẫu minh hoạ hiện khung cảnh báo:** tên mẫu hoặc tham số sai; chọn lại ở ô **Chèn mẫu minh hoạ**.

## Xem thêm

- [Hướng dẫn đọc bài](/huong-dan/huong-dan-su-dung)
- [Bắt đầu sử dụng AZWorkbase](/huong-dan/bat-dau)