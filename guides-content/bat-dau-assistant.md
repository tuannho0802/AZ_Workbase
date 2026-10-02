---
title: Bắt đầu với AZWorkbase - dành cho Assistant
slug: bat-dau-assistant
sortOrder: 2
published: true
roles: [assistant]
positions: []
departments: []
permissions: []
---

## Bài này dành cho ai

Dành cho **Assistant** (trợ lý). Assistant thấy gần như **đủ menu như Admin** và làm được hầu hết thao tác.

**Khác biệt chính so với Admin:**

- **Không có quyền Xoá khách hàng**: bảng Khách hàng không có cột **Thao tác** (nút Xoá).
- Theo mô tả của vai trò, Assistant **không quản lý phân quyền**: không tạo vai trò hay sửa quyền của người khác.
- Quyền **soạn hướng dẫn** mặc định chỉ có Admin. Muốn soạn bài, hãy nhờ Admin cấp quyền *Quản lý Hướng dẫn sử dụng* ở trang Phân quyền.

> Menu thật của bạn có thể khác bảng dưới nếu Admin đã chỉnh quyền. Gặp trang/nút không thấy, hãy hỏi Admin.

Với bảng Khách hàng, bấm **Assistant** ở ô **Xem với tư cách** để thấy đúng những gì bạn thấy:

```az-demo
customer-table-by-viewer persona=assistant
```

## Menu của Assistant và công dụng từng trang

### Nhóm dùng hằng ngày

| Trang | Dùng để làm gì |
|---|---|
| **Trang chủ** | Lối tắt tới các trang bạn được dùng. |
| **Khách hàng** | Xem, tìm, thêm, sửa khách; nhập/xuất Excel. **Không xoá** được. Xem bài [Khách hàng](/huong-dan/khach-hang). |
| **Chia Data** | Gán khách hàng cho Sales phụ trách. |
| **Công việc định kỳ** | Tạo và theo dõi việc lặp lại theo Ngày/Tuần/Tháng/Năm. |
| **Lịch sử Công việc** | Nhật ký thay đổi của các công việc định kỳ. |
| **Hiệu suất công việc** | Thống kê % hoàn thành, xong muộn, quá hạn theo nhân viên. |
| **Nghỉ phép** | Tạo và theo dõi đơn nghỉ phép của chính bạn. |
| **Duyệt phép** | Duyệt hoặc từ chối đơn nghỉ phép của nhân viên. |
| **Báo cáo doanh số** | Doanh thu và số khách theo Cá nhân, Phòng ban hoặc Tổng tất cả. |
| **Báo cáo data lỗi** | Danh sách khách bị nhập sai hoặc thiếu thông tin để sửa. |
| **Thùng rác** | Khôi phục khách đã xoá (nếu menu của bạn có mục này). |

### Thông báo và cá nhân

| Trang | Dùng để làm gì |
|---|---|
| **Thông báo** | Hộp thư cá nhân: thông báo về khách hàng, công việc và tin từ quản lý. |
| **Gửi thông báo** | Soạn và gửi thông báo tới nhân viên hoặc cả phòng ban. |
| **Thông báo đã gửi** | Xem lại thông báo đã gửi và ai đã đọc, ai chưa đọc. |
| **Profile** | Thông tin cá nhân và Fanpage/Group bạn phụ trách. |
| **Nhóm tôi quản lý** | Các nhóm liên kết bạn là quản lý chính hoặc phụ. |
| **Quản lý UTM** | UTM bạn quản lý và số khách theo từng UTM. |
| **Hướng dẫn sử dụng** | Đọc hướng dẫn. Xem [Hướng dẫn đọc bài](/huong-dan/huong-dan-su-dung) và [Hướng dẫn soạn bài](/huong-dan/huong-dan-soan-bai). |

### Quản trị con người và tổ chức

| Trang | Dùng để làm gì |
|---|---|
| **Nhân viên** | Quản lý tài khoản, duyệt đăng ký mới. |
| **Phòng ban** | Danh sách phòng ban và Manager quản lý từng phòng ban. |
| **Vị trí** | Các vị trí (Content, Editor, HR...) và cấu hình ẩn/hiện dữ liệu theo vị trí. |
| **Phân quyền** | Xem ma trận quyền của các vai trò (sửa quyền thuộc về Admin). |
| **Máy chấm công** | Ghép nhân viên với máy chấm công, xem bảng chấm công và nhật ký. |

### Cấu hình danh mục (các lựa chọn xuất hiện trong ô chọn)

| Trang | Dùng để làm gì |
|---|---|
| **Quản lý phụ trách** | Quyết định ai xuất hiện trong ô chọn Sales/Marketing/Content phụ trách. |
| **Quản lý Status khách** | Trạng thái khách hàng (tên, màu). |
| **Quản lý nguồn** | Nguồn khách (Facebook, TikTok...). |
| **Quản lý nhóm liên kết** | Danh mục và các nhóm Zalo/Facebook/Threads... |
| **Quản lý Loại phép** | Loại nghỉ phép. |
| **Quản lý Trạng thái công việc** | Trạng thái của công việc định kỳ. |

### Hệ thống

| Trang | Dùng để làm gì |
|---|---|
| **Nhật ký hệ thống** | Lịch sử thao tác của toàn hệ thống, dùng khi cần truy vết. |
| **Quản lý lưu trữ ảnh** | Xem dung lượng lưu trữ ảnh và tệp đính kèm. |

## Việc nên làm khi mới bắt đầu

1. Xem **Profile** của bạn đã đúng họ tên, phòng ban, vị trí chưa.
2. Mở **Khách hàng** và thử bộ lọc, bấm vào một dòng để xem chi tiết.
3. Mở **Công việc định kỳ** và **Thông báo** để biết việc đang chờ bạn.
4. Cần thêm quyền nào đó (ví dụ soạn hướng dẫn)? Nhờ Admin cấp.

## Xem thêm

- [Bắt đầu sử dụng AZWorkbase](/huong-dan/bat-dau)
- [Khách hàng](/huong-dan/khach-hang)
- [Hướng dẫn đọc bài](/huong-dan/huong-dan-su-dung)