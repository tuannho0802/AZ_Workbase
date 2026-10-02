---
title: Bắt đầu với AZWorkbase - dành cho Content
slug: bat-dau-content
sortOrder: 4
published: true
roles: []
positions: []
departments: []
permissions: []
---

## Bài này dành cho ai

Dành cho **Content**. Menu của bạn giống nhóm Sale: gọn, chỉ có trang phục vụ công việc hằng ngày. Điểm khác là Admin có thể **ẩn một số cột/tab theo vị trí Content** (ví dụ cột Sales, Marketing, Nạp tiền) nên bảng Khách hàng của bạn có thể ít cột hơn Sale. Quyền cụ thể do Admin cấu hình.

## Menu của bạn và công dụng từng trang

| Trang | Dùng để làm gì |
|---|---|
| **Trang chủ** | Lối tắt tới các trang bạn được dùng. |
| **Khách hàng** | Xem khách của bạn, thêm khách mới, theo dõi trạng thái và ghi chú. Xem bài [Khách hàng](/huong-dan/khach-hang). |
| **Công việc định kỳ** | Việc lặp lại theo Ngày/Tuần/Tháng/Năm được giao cho bạn. Xem dạng Bảng, Kanban hoặc Lịch tháng, cập nhật trạng thái. |
| **Hiệu suất công việc** | Số liệu công việc của chính bạn: % hoàn thành, xong muộn, quá hạn chưa xong. |
| **Nghỉ phép** | Bấm **Tạo đơn** để xin nghỉ, theo dõi đơn đã gửi (trạng thái, người duyệt) và huỷ đơn khi cần. |
| **Thông báo** | Hộp thư của bạn: tin về khách hàng, công việc và thông báo từ quản lý. |
| **Profile** | Thông tin cá nhân (họ tên, email, phòng ban, vị trí) và Fanpage/Group bạn phụ trách. |
| **Nhóm tôi quản lý** | Các nhóm liên kết (Zalo, Facebook...) mà bạn là quản lý chính hoặc phụ. |
| **Quản lý UTM** | Các UTM bạn quản lý chính/phụ và số khách theo từng UTM; có tab **Thống kê**. |
| **Hướng dẫn sử dụng** | Đọc các bài hướng dẫn. Xem [Hướng dẫn đọc bài](/huong-dan/huong-dan-su-dung). |

## Bảng Khách hàng của Content trông thế nào

Bạn chỉ thấy **khách của mình** (khách bạn tạo hoặc đang liên quan tới bạn). Ví dụ dưới là cấu hình mà Admin ẩn các cột phân công và Nạp tiền cho vị trí Content. **Cấu hình thật của bạn do Admin quyết định**, có thể nhiều hoặc ít cột hơn:

```az-demo
customer-table-by-viewer persona=content
```

## Việc nên làm khi mới bắt đầu

1. Vào **Profile**, kiểm tra thông tin của bạn.
2. Vào **Khách hàng**, thử bộ lọc và bấm vào một dòng để xem chi tiết.
3. Vào **Quản lý UTM** và **Nhóm tôi quản lý** xem bạn đang phụ trách những gì.
4. Vào **Công việc định kỳ** xem hôm nay bạn có việc gì.
5. Cần xin nghỉ: **Nghỉ phép** → **Tạo đơn**.

## Hay gặp

- **Không thấy cột Sales, Marketing hoặc tab Nạp tiền:** Admin đã ẩn theo vị trí của bạn.
- **Không thấy nút Thêm khách hàng / Nhập Excel:** bạn chưa được cấp quyền đó.
- **Vừa được đổi quyền mà menu chưa đổi:** tải lại trang (F5) hoặc đăng nhập lại.

## Xem thêm

- [Bắt đầu sử dụng AZWorkbase](/huong-dan/bat-dau)
- [Khách hàng](/huong-dan/khach-hang)
- [Hướng dẫn đọc bài](/huong-dan/huong-dan-su-dung)