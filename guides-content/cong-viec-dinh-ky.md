---
title: Công việc định kỳ
slug: cong-viec-dinh-ky
sortOrder: 11
published: false
roles: []
positions: []
departments: []
permissions: [periodic_tasks.view]
---

## Trang này để làm gì

Trang **Công việc định kỳ** là nơi bạn **lập, giao, theo dõi và chốt các đầu việc lặp theo kỳ** (Ngày, Tuần, Tháng, Năm): ai phụ trách, kỳ hạn bao giờ, đang ở trạng thái nào, đã xong bao nhiêu mục. Vào từ mục **Công việc định kỳ** ở menu bên trái.

Mỗi công việc là **một kỳ cụ thể**, do người dùng **tự tạo từng kỳ** (hệ thống không tự sinh việc cho kỳ sau). Các nút trên trang hiện theo quyền của bạn.

## Loại kỳ và Trạng thái

**Loại kỳ** có 4 giá trị cố định, mỗi loại một màu:

```az-demo
period-type-tags
```

Khi tạo việc, bạn **tự chọn khoảng thời gian của kỳ** (từ ngày nào đến ngày nào). Hệ thống không tự suy ra đầu/cuối tuần, tháng, năm. **Ngày cuối kỳ chính là hạn chót**: đúng ngày cuối kỳ thì chưa tính quá hạn.

**Trạng thái** do Admin cấu hình ở **Quản lý Trạng thái** (tên và màu có thể khác ví dụ dưới đây). Bỏ trống khi tạo thì dùng mặc định "Chưa hoàn thành".

```az-demo
task-status-tags
```

Hai trạng thái có mã hệ thống **in_review** và **done** được tính là *đã xong phần việc*: việc ở trạng thái này không bị coi là quá hạn.

## Màn hình gồm những gì

1. **Bộ lọc**: tìm theo tiêu đề, Loại kỳ, Trạng thái, nút **Của tôi** (việc bạn phụ trách chính hoặc phụ), Phụ trách chính, Phụ trách phụ, Phòng ban, khoảng ngày (Từ ngày, Đến ngày) và các nút nhanh **Hôm nay, Tuần này, Tuần trước, Tháng này, Tháng trước** (tuần bắt đầu từ Thứ Hai).
2. **Chuyển kiểu xem**: **Bảng**, **Xem theo Ngày** (mặc định), **Kanban**, **Lịch tháng**, và **Thùng rác** (chỉ người có quyền quản lý Thùng rác).
3. **Nút trên đầu trang**: **Tạo Công việc mới** (cần quyền Tạo) và **Quản lý Trạng thái** (cần quyền xem Trạng thái công việc).
4. Công tắc **Nút thao tác gọn (chỉ icon)** thu các nút thành biểu tượng, rê chuột để xem tên.

### Xem theo Ngày

Việc được gộp theo từng ngày, mặc định mở đúng hôm nay (hoặc ngày gần nhất có việc). Đây là kiểu dễ nhất để biết hôm nay phải làm gì.

```az-demo
task-agenda
```

### Kanban

Mỗi cột là một Trạng thái. **Kéo thả** thẻ sang cột khác để đổi trạng thái, nhưng chỉ khi bạn có quyền Sửa và việc **không bị khoá** (hoặc bạn có quyền sửa việc đang khoá). Thẻ có checklist xong 100% tự thu gọn thành 1-2 dòng để cột đỡ dài. Mẫu dưới đây là bản tĩnh, không kéo được.

```az-demo
task-kanban
```

### Lịch tháng

Mỗi ô ngày hiện các việc có kỳ hạn **phủ ngày đó**. Việc Tuần, Tháng, Năm sẽ xuất hiện lặp lại ở mọi ngày trong kỳ. Rê chuột vào tên việc để xem chi tiết.

```az-demo
task-calendar
```

## Bạn làm việc với những công việc nào

Danh sách chỉ gồm việc **trong phạm vi quyền Xem** của bạn:

| Bạn là | Danh sách gồm |
|---|---|
| **Admin, Assistant** | **Tất cả** công việc. |
| **Manager** | Công việc thuộc **phòng ban bạn quản lý**. Khác trang Khách hàng: **không cộng thêm** việc riêng của bạn nếu việc đó thuộc phòng ban khác. |
| **Employee** (Sale, Content, Media...) | Việc **bạn tạo**, việc bạn là **Phụ trách chính**, hoặc việc bạn được thêm làm **Phụ trách phụ**. |

Đó là cấu hình mặc định; Admin có thể đổi ở trang **Phân quyền**. Bấm các nút **Xem với tư cách** để so sánh danh sách và nút thao tác theo từng nhóm:

```az-demo
task-by-viewer persona=manager
```

## Những việc thường làm

### 1. Tạo công việc cho một kỳ

1. Bấm **Tạo Công việc mới**.
2. Nhập **Tiêu đề**, chọn **Loại kỳ** và **Khoảng thời gian của kỳ**, chọn **Người phụ trách chính** (bắt buộc).
3. Điền thêm nếu cần: **Mô tả**, **Phòng ban** (để trống thì tự theo người phụ trách), **Trạng thái**, **Màu Task**, **Ghi chú**, **Phụ trách phụ**, **Khách hàng liên quan** (cần quyền gắn Khách hàng).
4. Bấm lưu.

Muốn làm tiếp kỳ sau, bạn tạo một công việc mới cho kỳ đó.

### 2. Phụ trách chính và Phụ trách phụ

Mỗi việc có **một** Phụ trách chính và có thể có nhiều Phụ trách phụ. Phụ trách phụ **thấy và sửa được** việc, nhưng **không được xoá** (khi quyền Xoá của bạn ở phạm vi "Chỉ của mình").

```az-demo
task-assignees
```

### 3. Checklist trong một việc

Bấm **Checklist** để chia việc thành các mục nhỏ, tick khi xong, sửa nội dung, xoá hoặc đổi thứ tự (nút Lên/Xuống). Nút hiện kèm tiến độ **đã xong/tổng số** và đổi màu: **đỏ** khi dưới một nửa, **vàng** từ một nửa, **xanh** khi xong đủ. Xem checklist chỉ cần quyền Xem; thêm/tick/sửa cần quyền Sửa. Phần "Task con liên kết" trong modal chỉ để xem: việc con tự được tính xong theo trạng thái thật của nó.

```az-demo
task-checklist
```

### 4. Liên kết việc cha - con

Nút **Liên kết** cho phép nối một việc với **việc cha** (kỳ hạn lớn hơn, ví dụ việc Tuần thuộc việc Tháng) và **việc con**, đồng thời xem **% hoàn thành** gộp từ các việc con. Hệ thống kiểm tra lại thứ bậc kỳ hạn và chặn liên kết vòng tròn. Gắn/gỡ liên kết cần quyền Sửa.

### 5. Gắn Khách hàng vào việc

Khi tạo/sửa việc, người có quyền **gắn Khách hàng** (mặc định Admin và Assistant) chọn khách liên quan. Nút **Khách hàng (N)** trên dòng việc mở danh sách khách đó; nút chỉ hiện khi việc **có khách liên kết** và bạn **được xem Khách hàng**. Bạn chỉ thấy các khách thuộc phạm vi xem Khách hàng của mình.

### 6. Khoá và Mở khoá

Khoá là **thuộc tính của công việc** (không phải một Trạng thái). Việc đang khoá chỉ người có quyền **Sửa khi đang khoá** (mặc định chỉ Admin) mới sửa được, kể cả đổi trạng thái, liên kết, khách, phụ trách phụ, checklist. Có 2 kiểu khoá:

- **Khoá thủ công**: người có quyền Duyệt (Admin, Assistant, Manager trong phòng ban mình) bấm **Khoá**, có thể ghi chú lý do (không bắt buộc). Bấm **Mở khoá** để mở lại bất cứ lúc nào.
- **Khoá tự động**: việc **chưa xong** mà **quá hạn kỳ hơn 7 ngày** (ân hạn) bị hệ thống khoá, ghi chú "Tự động khoá...". Nếu kéo dài kỳ tới hôm nay hoặc tương lai thì khoá tự động tự mở; khoá thủ công thì giữ nguyên.

Nút **Sửa** của việc đang khoá vẫn hiện nhưng **bị mờ** nếu bạn thiếu quyền, rê chuột để xem lý do. Bấm đổi tình huống để so sánh nút theo từng vai trò:

```az-demo
task-actions-by-viewer scenario=locked-manual
```

### 7. Quá hạn

Việc **đã qua hạn kỳ mà chưa xong** được tính là quá hạn. Người có quyền Duyệt có nút **Đánh dấu quá hạn** (chỉ khi còn trong 7 ngày ân hạn) và **Gỡ quá hạn** (khi đã đánh dấu nhầm hoặc việc được kéo dài kỳ). Hệ thống cũng tự đánh dấu việc quá hạn và tự khoá khi hết ân hạn (qua tác vụ định kỳ chạy nền, nên có thể chậm hơn một chút so với lúc hết hạn).

### 8. Xem Lịch sử của một việc

Bấm **Lịch sử** trên dòng việc để xem ai đã làm gì, lúc nào; mở từng dòng để xem giá trị **trước và sau** khi thay đổi. Chỉ xem, không sửa được.

```az-demo
task-audit-row
```

Trang tổng hợp lịch sử của mọi việc nằm ở mục **Lịch sử Công việc** (cần quyền riêng).

### 9. Xoá công việc và Thùng rác

Nút **Xoá** chỉ hiện khi bạn có quyền Xoá (mặc định chỉ Admin). Nếu quyền Xoá của bạn ở phạm vi **Chỉ của mình**, nút chỉ hiện ở việc bạn tạo hoặc bạn là Phụ trách chính. Xoá là **xoá mềm**: việc chuyển vào tab **Thùng rác**. Người có quyền quản lý Thùng rác (mặc định chỉ Admin) có thể **khôi phục** việc, **xoá vĩnh viễn** các việc đã chọn hoặc **dọn sạch** Thùng rác (không thể lấy lại).

## Bảng quyền tóm tắt (mặc định)

| Việc | Admin | Assistant | Manager | Employee |
|---|---|---|---|---|
| Xem, Tạo, Sửa | Tất cả | Tất cả | Phòng ban mình quản lý | Việc của mình |
| Khoá / Mở khoá / Quá hạn (Duyệt) | Tất cả | Tất cả | Phòng ban mình quản lý | Không |
| Sửa khi đang khoá | Có | Không | Không | Không |
| Gắn Khách hàng | Có | Có | Không | Không |
| Xoá | Có | Không | Không | Không |
| Thùng rác | Có | Không | Không | Không |

Admin có thể đổi các quyền này ở trang **Phân quyền**, nên bảng của bạn có thể khác.

## Lưu ý

- Không thấy trang này nghĩa là vai trò của bạn **không có quyền Xem Công việc**; liên hệ Admin nếu cần.
- Việc đã **xong** (in_review, done) không bị coi là quá hạn và không bị khoá tự động.
- Mọi thay đổi quan trọng (đổi trạng thái, đổi người phụ trách, khoá, liên kết, checklist...) đều được ghi vào **Lịch sử** của việc.
