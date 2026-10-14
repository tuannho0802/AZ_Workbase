---
title: Hoạt động bảo mật
slug: hoat-dong-bao-mat
sortOrder: 155
published: false
roles: []
positions: []
departments: []
permissions: [audit.manage]
---

## Trang này để làm gì

Trang **Hoạt động bảo mật** cho Admin xem các sự kiện liên quan đến đăng nhập và bảo mật: đăng nhập sai, tài khoản hoặc IP bị khoá, mở khoá, đổi mật khẩu, đăng xuất cưỡng bức thiết bị... Đồng thời chỉnh các ngưỡng khoá đăng nhập (bao nhiêu lần sai thì khoá, khoá bao lâu, giữ sự kiện bao lâu). Khác với **Nhật ký hệ thống** (ai sửa dữ liệu gì), trang này tập trung vào **ai đang cố đăng nhập, từ đâu**.

## Ai dùng được & thấy gì

Vào trang cần quyền **Quản lý nhật ký** (`audit.manage`), mặc định có ở Admin. Nếu thiếu quyền, mục menu bị ẩn và gõ thẳng đường dẫn sẽ đưa bạn về Trang chủ. Quyền này vừa xem sự kiện vừa **lưu được cấu hình** ở cuối trang.

## Bắt đầu nhanh

1. Mở **Hoạt động bảo mật**. Dải số phía trên cho biết tình hình hôm nay.
2. Muốn tìm một sự kiện cụ thể, dùng thanh bộ lọc phía trên bảng (loại sự kiện, IP, email/tên tài khoản, khoảng ngày).
3. Muốn đổi ngưỡng khoá, kéo xuống khối **Cấu hình bảo mật đăng nhập**, sửa số rồi bấm **Lưu cấu hình**.

## Giải thích từng cột / nút / bộ lọc

### Dải số tổng quan

- **Lần khoá hôm nay**: số lần tài khoản hoặc IP bị khoá trong ngày.
- **Lần đăng nhập sai hôm nay**: số lượt nhập sai mật khẩu hoặc email trong ngày.
- **IP đang bị khoá**: số IP đang bị chặn đăng nhập tại thời điểm xem.
- **Email lạ bị thử nhiều (7 ngày)**: các email **chưa có trong hệ thống** mà người lạ đã thử đăng nhập nhiều nhất, kèm số lần. Nhiều lần liên tục thường là dò tài khoản.

### Bộ lọc và bảng sự kiện

- **Loại sự kiện**: chọn một loại (đăng nhập sai, khoá tài khoản, khoá IP, mở khoá, đổi mật khẩu...).
- **IP (tiền tố)**: gõ phần đầu của địa chỉ IP (ví dụ `113.` hoặc `113.161`) rồi bấm tìm.
- **Email / tên tài khoản**: tìm theo email hoặc tên người dùng.
- **Khoảng ngày** và nút **Làm mới**.
- Các cột: **Thời gian**, **Sự kiện** (nhãn màu), **Tài khoản / Email**, **IP**, **Thiết bị**. Với email chưa có trong hệ thống, cột tài khoản ghi "Không xác định (email chưa có trong hệ thống)" và hiện email đã gõ ở dưới.

### Cấu hình bảo mật đăng nhập

| Ô | Ý nghĩa |
|---|---|
| **Khoá tài khoản sau (lần sai)** | Số lần sai liên tiếp trên **một tài khoản** thì khoá tài khoản đó |
| **Thời gian khoá tài khoản** | Khoá bao nhiêu phút |
| **Khoá IP sau (lần sai)** | Số lần sai trên **một IP** (kể cả với nhiều email khác nhau) thì khoá IP đó |
| **Cửa sổ đếm sai theo IP** | Đếm lần sai của IP trong bao nhiêu phút gần nhất |
| **Thời gian khoá IP** | Khoá IP bao nhiêu phút |
| **Giữ sự kiện bảo mật** | Số ngày giữ các sự kiện ở bảng này trước khi bị dọn |

Giá trị mặc định lúc cài là 5 lần / 5 phút cho tài khoản, 10 lần / cửa sổ 10 phút / khoá 5 phút cho IP, và giữ sự kiện 180 ngày. Dưới mỗi ô có ghi **khoảng hợp lệ**; giá trị ngoài khoảng sẽ bị từ chối.

## Quy tắc & lưu ý nghiệp vụ

- Đổi cấu hình **có hiệu lực sau tối đa 30 giây**, không cần đăng nhập lại hay khởi động lại.
- Việc lưu cấu hình được ghi lại trong **Nhật ký hệ thống** (giá trị cũ và mới).
- Đăng nhập thành công **không** xoá bộ đếm sai của IP đang chạy.
- Sự kiện bảo mật được giữ riêng theo số ngày ở ô **Giữ sự kiện bảo mật**, không bị dọn cùng đợt với nhật ký thường.
- Mở khoá thủ công: **tài khoản** ở trang [Nhân viên](/huong-dan/nhan-vien), **IP** ở tab **IP bị khoá** cũng trong trang Nhân viên. Tab đó và khối **IP được miễn khoá** (whitelist) cần thêm quyền quản lý nhân viên phạm vi toàn hệ thống.

## Vì sao tôi không thấy …?

- Không thấy mục **Hoạt động bảo mật** ở menu: bạn thiếu `audit.manage`.
- Không thấy một lượt đăng nhập sai vừa xảy ra: bấm **Làm mới**, kiểm tra bộ lọc và khoảng ngày; số liệu dải tổng quan có thể trễ tới 30 giây.
- Sự kiện cũ biến mất: đã quá số ngày ở **Giữ sự kiện bảo mật**.
- Email trong cột tài khoản hiện "[không phải email]": người dùng đã gõ nhầm chuỗi khác (ví dụ mật khẩu) vào ô email nên hệ thống không lưu nguyên văn.

## Xem thêm

- [Nhật ký hệ thống](/huong-dan/nhat-ky-he-thong)
- [Nhân viên](/huong-dan/nhan-vien)
- [Phân quyền](/huong-dan/phan-quyen)
