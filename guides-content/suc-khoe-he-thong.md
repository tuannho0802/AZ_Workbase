---
title: Sức khoẻ hệ thống
slug: suc-khoe-he-thong
sortOrder: 156
published: false
roles: [admin]
positions: []
departments: []
permissions: []
---

## Trang này để làm gì

Trang **Sức khoẻ hệ thống** cho Root Admin xem nhanh tình trạng hệ thống: dung lượng các bảng dữ liệu, cron dọn dữ liệu tự động, cache, số phiên đăng nhập và số IP đang bị khoá. Trang chỉ để xem, không có thao tác nào làm thay đổi dữ liệu.

## Ai dùng được & thấy gì

Chỉ **Root Admin** (tài khoản Admin có cờ Root). Admin thường và các vai trò khác không thấy mục menu, và gõ thẳng đường dẫn sẽ bị đưa về Trang chủ. Quyền này không cấp được qua trang Phân quyền.

## Bắt đầu nhanh

1. Mở **Sức khoẻ hệ thống** từ menu (hoặc Ctrl+K).
2. Xem các thẻ phía trên: ứng dụng, cơ sở dữ liệu, phiên đăng nhập, bảo mật đăng nhập.
3. Kéo xuống xem **Cron dọn dữ liệu**, **Dung lượng bảng** và **Cache bộ nhớ**.
4. Bấm **Làm mới** để lấy số liệu mới.

## Giải thích từng phần

- **Cơ sở dữ liệu**: thời gian phản hồi (ms) và phiên bản máy chủ.
- **Phiên đăng nhập**: tổng số phiên đang có và số tài khoản có phiên.
- **Bảng cron**: chu kỳ đang cài, lần chạy gần nhất, lần chạy tiếp theo. Có cảnh báo khi chưa từng chạy, quá hạn (chu kỳ cộng 2 ngày) hoặc lần gần nhất chưa hoàn tất.
- **Dung lượng bảng**: số dòng chỉ là **ước lượng**. Bảng cần dọn được đánh dấu **Cần dọn** và xếp lên đầu. Số liệu được lưu tạm tối đa 5 phút.
- **Cache bộ nhớ**: chỉ phản ánh máy chủ đang trả lời yêu cầu này, vì mỗi instance có cache riêng.

## Quy tắc & lưu ý

- Nếu một phần không đọc được, chỉ phần đó báo lỗi, các phần khác vẫn hiển thị.
- Nút **Làm mới** không truy vấn lại dung lượng bảng quá 1 lần mỗi 30 giây.

## Vì sao tôi không thấy trang này?

- Tài khoản không phải Root Admin.

## Xem thêm

- [Hoạt động bảo mật](/huong-dan/hoat-dong-bao-mat)
