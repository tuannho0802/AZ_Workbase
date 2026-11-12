---
title: Quản lý Fanpage
slug: fanpage
sortOrder: 65
published: false
roles: []
positions: []
departments: []
permissions: [fanpages.view]
---

## Trang này để làm gì

Mỗi nhân viên có thể phụ trách nhiều **Page** (kênh) trên các nền tảng như Facebook, TikTok, Instagram... Trang **Quản lý Fanpage** là nơi lưu danh sách Page đó: mỗi Page là **một link**, thuộc **một nền tảng** và có **một người phụ trách**. Trong từng Page, bạn ghi lại **bài đăng** (nhập tay) và **ghi chú tiến trình** để theo dõi quá trình phát triển Page.

## Ai dùng được & thấy gì

Vào trang cần quyền **Xem Fanpage** (`fanpages.view`). Phạm vi xem tính theo **người phụ trách** Page:

| Phạm vi | Thấy các Page |
|---|---|
| Của tôi | Page mình phụ trách |
| Phòng ban | Page mình phụ trách + Page của nhân viên thuộc phòng ban mình quản lý |
| Tất cả | Mọi Page |

Theo cấu hình mặc định: Admin / Assistant xem **Tất cả**, Manager xem **Phòng ban**, Employee xem **Của tôi**. Phạm vi thật do Admin cấu hình ở trang **Phân quyền** nên có thể khác. Các nút **Sửa**, **Xoá**, thêm/sửa bài đăng và ghi chú chỉ hiện khi bạn có quyền tương ứng **trên đúng Page đó**.

## Bắt đầu nhanh

1. Bấm **Thêm Page**, chọn **Nền tảng**, nhập **Tên Page** và **Link Page** (bắt đầu bằng `http://` hoặc `https://`), bấm **Thêm**.
2. Bấm tên Page (hoặc biểu tượng con mắt) để mở khung chi tiết.
3. Tab **Bài đăng**: bấm **Thêm bài đăng**, nhập **URL bài đăng**, ngày đăng và ghi chú (nếu có).
4. Tab **Ghi chú tiến trình**: gõ nội dung rồi bấm **Thêm ghi chú** để ghi lại diễn biến của Page.

## Giải thích từng cột / nút / bộ lọc

- **Bộ lọc**: ô tìm theo tên hoặc link Page, **Nền tảng**, **Người phụ trách** (chỉ hiện khi bạn xem được Page của người khác), **Trạng thái**.
- **Bài đăng / Ghi chú**: số bài đăng và số ghi chú của Page.
- **Trạng thái**: *Đang theo dõi* hoặc *Ngừng theo dõi*. Ngừng theo dõi vẫn giữ nguyên bài đăng và ghi chú.
- **Nền tảng** (nút trên đầu trang, chỉ người có quyền quản lý nền tảng): thêm, đổi tên, đổi màu, khoá/mở nền tảng.
- **Ghi chú tiến trình**: hiện người ghi, giờ ghi; ghi chú đã sửa có nhãn *Đã sửa N lần*.

## Quy tắc & lưu ý nghiệp vụ

- **Link Page không được trùng** với Page khác trong hệ thống (dấu `/` ở cuối được bỏ qua khi so sánh).
- Người tạo Page mặc định là người phụ trách. Chỉ người có quyền Sửa Fanpage phạm vi **Phòng ban** hoặc **Tất cả** mới giao Page cho người khác (phòng ban: chỉ giao trong phòng ban mình quản lý).
- **Nền tảng đã khoá** không chọn được cho Page mới; Page cũ vẫn hiện đúng tên nền tảng. Nền tảng không xoá được.
- **Xoá Page, bài đăng, ghi chú** mặc định chỉ **Admin**. Xoá Page sẽ xoá luôn toàn bộ bài đăng và ghi chú của Page đó.

## Data khách hàng của Page (Lead)

Mở một Page → tab **Data khách hàng** (chỉ hiện khi bạn có quyền xem Khách hàng).

- **Thêm khách:** bấm **Thêm khách**, nhập Họ tên, **Số điện thoại (bắt buộc)**, Email, Nguồn, Ghi chú. Nếu để trống Nguồn, hệ thống dùng nền tảng của Page khi trùng với một nguồn đang mở; nếu không trùng bạn phải chọn nguồn.
- **Thêm từ Ghi chú tiến trình:** khi viết ghi chú, mở mục **＋ Thêm khách hàng từ ghi chú này** để tạo khách cùng lúc. Cần quyền ghi chú Page **và** quyền tạo Khách hàng.
- **Trùng số điện thoại:** hệ thống cảnh báo và **không lưu** (kể cả ghi chú). Khách cũ không tự gắn vào Page.
- **Bạn thấy gì:** danh sách theo phạm vi dữ liệu khách hàng của bạn — hai người có thể thấy số khách khác nhau trên cùng một Page.
- **Sửa/xoá khách:** bấm biểu tượng mở sang trang Khách hàng (đúng quyền sửa/xoá của bạn).
- **Tính vào thống kê Page:** khách nhập từ Page ghi công cho đúng Page đó (ưu tiên hơn UTM). Mỗi khách chỉ ghi công cho một Page nên tổng không bị đếm trùng.
- Page đã lưu trữ không thêm khách mới được — bỏ lưu trữ trước.
