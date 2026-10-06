---
title: Lịch sử Công việc
slug: lich-su-cong-viec
sortOrder: 13
published: false
roles: []
positions: []
departments: []
permissions: [periodic_tasks.audit_view]
---

## Trang này để làm gì

Trang **Lịch sử Công việc** gom **nhật ký thay đổi của mọi Công việc định kỳ** vào một nơi: ai đã làm gì, vào lúc nào, trên việc nào, và giá trị **trước và sau** khi đổi. Bạn dùng trang này để tra ngược khi cần biết "ai đã đổi trạng thái việc này", "ai khoá việc", "checklist bị xoá lúc nào".

Vào từ mục **Lịch sử Công việc** ở menu. Nếu chỉ cần lịch sử của **một** việc, bấm nút **Lịch sử** ngay trên dòng việc ở trang [Công việc định kỳ](/huong-dan/cong-viec-dinh-ky) (xem phần cuối).

Trang chia theo tuần, mỗi tuần là một bảng:

```az-demo
task-audit-page
```

Nhật ký này **tách riêng** khỏi **Nhật ký hệ thống**. Các thay đổi của Công việc định kỳ chỉ nằm ở đây; **Nhật ký hệ thống** chỉ giữ hai nhóm liên quan: cấu hình [Trạng thái công việc](/huong-dan/trang-thai-cong-viec) và thao tác xoá/dọn dẹp lịch sử của Admin (xem phần Xoá).

## Ai dùng được & thấy gì

Vào trang cần quyền **Xem Lịch sử Công việc** (`periodic_tasks.audit_view`). Quyền này **có phạm vi** và tách riêng với quyền xem danh sách Công việc, nên Admin có thể bật một mà tắt cái kia. Khi được tách, quyền được sao chép nguyên từ quyền xem Công việc, vì vậy mặc định:

| Vai trò | Phạm vi lịch sử bạn thấy |
|---|---|
| **Admin** | Mọi việc. Admin luôn thấy hết. |
| **Assistant** | Mọi việc. |
| **Manager** | Việc thuộc **phòng ban bạn quản lý**. |
| **Employee** | Việc **bạn tạo**, việc bạn **Phụ trách chính** và việc bạn là **Phụ trách phụ**. |

Phạm vi do hệ thống lọc sẵn: bạn **không** thấy dòng log của việc nằm ngoài phạm vi, kể cả khi biết đúng mã dòng. Admin có thể đã chỉnh khác mặc định ở trang **Phân quyền**.

Nếu bạn không có quyền, mục menu bị ẩn. Vào thẳng đường dẫn sẽ hiện thông báo "Bạn không có quyền truy cập trang này" và đưa bạn về trang **Khách hàng**.

Phần xoá có quyền riêng, xem phần "Xoá lịch sử" bên dưới.

## Bảng lịch sử

Dưới tiêu đề có số tổng bản ghi (theo bộ lọc hiện tại). Mỗi dòng có các cột:

| Cột | Ý nghĩa |
|---|---|
| **Thời gian** | Giờ:phút:giây và ngày xảy ra thay đổi. |
| **Công việc** | Tên việc bị thay đổi. |
| **Người thực hiện** | Tên người làm, kèm thẻ vai trò (Admin, Manager, Assistant, Employee). |
| **Hành động** | Loại thay đổi, dạng thẻ màu (xem bảng bên dưới). |

### Gom theo tuần

- Mỗi tuần (Thứ 2 đến Chủ nhật) là một ô gập/mở, ghi khoảng ngày và số bản ghi. Tuần hiện tại có thẻ **Tuần này**. Tuần mới nhất tự mở khi vào trang.
- Dữ liệu của tuần **chỉ tải khi bạn mở** ô đó, nên trang vẫn nhanh dù lịch sử dài. Tuần có hơn 20 bản ghi sẽ có phân trang riêng bên trong.
- Phân trang ở **cuối trang đếm theo tuần**, không đếm theo dòng. Mặc định 4 tuần mỗi trang, chọn được 2, 4 hoặc 8. Dòng tổng ghi dạng "N tuần (M bản ghi)".
- Trên điện thoại, mỗi dòng là một thẻ nhỏ. Bấm **Xem chi tiết** trên thẻ để mở giá trị trước/sau.

### Xem giá trị trước/sau

Mở rộng một dòng (bấm vào mũi tên đầu dòng) để xem chi tiết. Chi tiết chỉ tải khi bạn mở. Bảng chi tiết có hai cột: **Trường thông tin** và **Nội dung thay đổi**.

- **Cập nhật**: giá trị cũ gạch ngang, mũi tên, rồi giá trị mới tô nền xanh.
- **Tạo mới hoặc thêm vào** (tạo việc, thêm Phụ trách phụ, thêm Checklist): cột đổi tên thành **Giá trị mới**, kèm dấu **+**.
- **Xoá hoặc gỡ ra** (xoá việc, gỡ Phụ trách phụ, gỡ Khách hàng): cột đổi tên thành **Giá trị cũ**, kèm biểu tượng thùng rác.
- Chỉ hiện các trường **có thay đổi**. Nếu không có trường nào khác nhau, hộp trống ghi "Dữ liệu chính không thay đổi".
- Giá trị nhạy cảm như mật khẩu, token **không bao giờ** hiện.
- Log cũ ghi trước khi hệ thống lưu tên có thể chỉ hiện "ID: 5 (dữ liệu cũ, chưa có tên)". Đó là hạn chế của dữ liệu cũ, không phải lỗi hiển thị.

Một dòng minh hoạ, mở ra xem trước/sau (đây là mẫu của modal lịch sử từng việc, cách đọc giống hệt):

```az-demo
task-audit-row
```

Tên trường hiện bằng tiếng Việt: Tiêu đề, Mô tả, Loại kỳ, Ngày bắt đầu kỳ, Ngày kết thúc kỳ, Trạng thái, Phụ trách chính, Phòng ban, Màu, Đang khoá, Ghi chú khoá, Nội dung, Đã xong, Vị trí.

## Các loại hành động

Bộ lọc **Loại hành động** liệt kê đủ 21 loại dưới đây (kể cả loại chưa từng xảy ra trong dữ liệu của bạn):

| Nhóm | Hành động (tên hiển thị) |
|---|---|
| Việc | Tạo mới, Cập nhật, Đổi trạng thái, Xoá, Khôi phục |
| Người phụ trách | Đổi Phụ trách chính, Thêm Phụ trách phụ, Gỡ Phụ trách phụ |
| Liên kết | Liên kết Task cha, Huỷ liên kết Task cha, Gắn Khách hàng, Gỡ Khách hàng |
| Khoá & Quá hạn | Khoá, Mở khoá, Đánh dấu quá hạn, Gỡ đánh dấu quá hạn |
| Checklist | Thêm Checklist item, Sửa Checklist item, Xoá Checklist item, Sắp xếp lại Checklist, Tick/Bỏ tick hàng loạt Checklist (theo đổi trạng thái) |

Dòng **Tick/Bỏ tick hàng loạt** xuất hiện khi bạn đổi trạng thái một việc và hệ thống tự tick hoặc bỏ tick các mục checklist theo (xem [Công việc định kỳ](/huong-dan/cong-viec-dinh-ky)).

## Bắt đầu nhanh

### 1. Tìm lịch sử của một việc hoặc một người

1. Gõ một phần **tên Công việc** hoặc **tên người thực hiện** vào ô tìm.
2. Bấm **Lọc** hoặc nhấn Enter. Ô tìm **không lọc ngay khi gõ**.
3. Mở ô tuần cần xem, rồi mở rộng dòng để xem trước/sau.

### 2. Lọc theo loại hành động và khoảng ngày

1. Chọn **Loại hành động** (ví dụ **Đổi trạng thái**).
2. Chọn khoảng ngày.
3. Bấm **Lọc**. Hai bộ lọc kết hợp với ô tìm (điều kiện cùng đúng).

Đổi một ô lọc mà chưa bấm **Lọc** thì bảng chưa đổi. Nút mũi tên tròn bên cạnh **Lọc** xoá hết bộ lọc và tải lại từ đầu.

## Xoá lịch sử (chỉ người có quyền Xoá phạm vi Toàn bộ)

Hai thao tác này dọn nhật ký, **không xoá Công việc**. Nút chỉ hiện khi bạn có quyền **Xoá Công việc định kỳ** với phạm vi **Toàn bộ** (mặc định chỉ Admin). Quyền Xoá phạm vi hẹp hơn (ví dụ chỉ việc của mình) **không** đủ: những người này không thấy nút, và nếu gọi thẳng thì hệ thống từ chối.

```az-demo
task-audit-cleanup
```

**Xoá các dòng đã chọn** (chỉ trên máy tính):

1. Tick ô chọn ở đầu các dòng cần xoá. Nút **Xóa đã chọn (N)** hiện ra.
2. Bấm nút, gõ đúng `XÁC NHẬN` rồi bấm OK. Gõ sai sẽ báo "Mã xác nhận không đúng".
3. Thông báo "Đã xóa thành công N bản ghi".

> Số **N** là tổng số dòng bạn đã tick, có thể gồm cả dòng ở tuần đang đóng. Hãy nhìn số trong nút trước khi xác nhận.

**Dọn dẹp theo thời gian** (có cả trên điện thoại):

1. Bấm **Dọn dẹp theo thời gian**.
2. Chọn khoảng ngày cần dọn, gõ `XÁC NHẬN`, bấm OK.
3. Thông báo "Đã dọn dẹp thành công N bản ghi".

> **Không hoàn tác được.** Dọn dẹp theo thời gian xoá **mọi** bản ghi lịch sử trong khoảng ngày đã chọn, **của tất cả Công việc**, và **không áp dụng bộ lọc đang chọn** (ô tìm, loại hành động). Chọn khoảng ngày cẩn thận.

Mỗi lần xoá hoặc dọn dẹp đều được ghi vào **Nhật ký hệ thống** (tên hành động "Admin xóa nhật ký công việc định kỳ hàng loạt" và "Admin dọn dẹp nhật ký công việc định kỳ"). Chính thao tác này **không** tạo dòng mới trong Lịch sử Công việc.

## Quy tắc & lưu ý nghiệp vụ

- **Chỉ xem, không sửa.** Không ai sửa được nội dung một dòng lịch sử. Chỉ có thể xoá theo cách ở trên.
- **Việc hệ thống tự làm không có dòng ở đây.** Hệ thống tự **đánh dấu Quá hạn** khi qua hạn kỳ, và tự **khoá** việc khi quá hạn hơn 7 ngày. Hai việc này không có người thực hiện nên **không ghi vào Lịch sử Công việc**. Muốn biết vì sao một việc đang Quá hạn hoặc bị khoá mà không có dòng nào, đây là lý do. Chỉ khi người dùng bấm tay mới có dòng **Đánh dấu quá hạn / Khoá**.
- **Phạm vi do quyền quyết định.** Hai người xem cùng trang có thể thấy tập log khác nhau. Đó là bình thường, không phải lỗi.
- Quyền **Xem Lịch sử Công việc** là quyền của **trang này**. Lịch sử của **từng việc** (nút **Lịch sử** trên dòng việc) chỉ cần bạn xem được việc đó, và không phụ thuộc quyền này.

## Lịch sử của từng việc

Ở trang [Công việc định kỳ](/huong-dan/cong-viec-dinh-ky), nút **Lịch sử** trên mỗi dòng việc mở hộp thoại "Lịch sử audit" của riêng việc đó: các dòng xếp từ mới đến cũ, mở từng dòng để xem trước/sau, phân trang 20/50/100 bản ghi. Nút này luôn hiện nếu bạn xem được việc. Hộp thoại **không có** nút xoá.

## Vì sao tôi không thấy …?

- **Không thấy mục Lịch sử Công việc ở menu hoặc bị đưa về Khách hàng**: bạn không có quyền **Xem Lịch sử Công việc**. Liên hệ Admin.
- **Không thấy log của một việc mà tôi biết có tồn tại**: việc đó nằm ngoài phạm vi quyền của bạn (xem bảng phạm vi), hoặc thay đổi đó do hệ thống tự làm nên không có log.
- **Không thấy log ở tuần cũ**: tuần cũ nằm ở trang phân trang sau, hoặc đã bị Admin dọn dẹp. Thử đổi số tuần mỗi trang hoặc bấm trang kế.
- **Bảng không đổi khi tôi chọn bộ lọc**: bạn chưa bấm **Lọc**.
- **Không thấy ô chọn, nút Xóa đã chọn hoặc Dọn dẹp**: bạn thiếu quyền Xoá phạm vi Toàn bộ. Trên điện thoại cũng **không có** ô chọn và nút **Xóa đã chọn**; chỉ còn **Dọn dẹp theo thời gian**.
- **Chi tiết hiện "ID: …" thay cho tên**: log cũ không lưu tên tại thời điểm đó.

## Xem thêm

- [Công việc định kỳ](/huong-dan/cong-viec-dinh-ky)
- [Quản lý Trạng thái công việc](/huong-dan/trang-thai-cong-viec) (cấu hình tên, màu trạng thái hiện trong dòng "Đổi trạng thái")
