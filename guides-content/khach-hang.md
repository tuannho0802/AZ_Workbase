---
title: Khách hàng
slug: khach-hang
sortOrder: 10
published: true
roles: []
positions: []
departments: []
permissions: [customers.view]
---

## Trang này để làm gì

Trang **Khách hàng** là nơi bạn **xem, tìm, thêm, sửa và theo dõi khách hàng (data)**: ai phụ trách, đang ở trạng thái nào, đã nạp bao nhiêu, ghi chú gần nhất ra sao. Vào từ mục **Khách hàng** ở menu bên trái.

Các nút trên trang (Thêm, Nhập Excel, Xuất Excel, Gán cho Sales, Xoá...) hiện theo quyền của bạn.

## Màn hình gồm những gì

Từ trên xuống dưới có 4 vùng:

1. **Thẻ thống kê**: Tổng khách hàng, Khách mới hôm nay, Chốt thành công, Tổng nạp. Số liệu **đổi theo bộ lọc** bạn đang chọn.
2. **Bộ lọc & Tìm kiếm**: thu hẹp danh sách theo tên, số điện thoại, UTM, nguồn, trạng thái, khoảng ngày...
3. **Thanh nút**: **Làm mới**, **Thêm khách hàng**, **Nhập Excel**, **Xuất Excel**, **Gán cho Sales**.
4. **Bảng khách hàng**: bấm vào **một dòng** để mở **chi tiết** ở khung bên phải. Mặc định khách có **Ngày nhập mới nhất** xếp trên cùng.

## Bạn làm việc với những khách nào

Phạm vi khách hiển thị phụ thuộc vai trò của bạn:

| Bạn là | Danh sách gồm |
|---|---|
| **Admin, Assistant** | **Tất cả** khách hàng. |
| **Manager** | Khách thuộc **phòng ban bạn quản lý**, cộng khách của chính bạn. |
| **Sale, Content, Media** và nhân viên khác (Employee) | **Khách của mình**: khách bạn tạo, khách bạn là Sales chính, khách bạn là Marketing phụ trách, hoặc khách được chia cho bạn. |

Bấm các nút ở **Xem với tư cách** để so sánh bảng theo từng nhóm:

```az-demo
customer-table-by-viewer persona=manager
```

## Những việc thường làm

### 1. Tìm một khách

1. Gõ tên, số điện thoại hoặc UTM vào ô **Tìm kiếm**.
2. Muốn lọc kỹ hơn, chọn thêm **Nguồn**, **Trạng thái**, **UTM**, **Người nhập Data**, nhóm đã tham gia, hoặc khoảng ngày.
3. Muốn bỏ lọc, bỏ chọn từng ô. Ô để trống nghĩa là **không lọc** theo tiêu chí đó.

Khi lọc theo ngày, hãy chọn **cả Từ ngày và Đến ngày** thì bộ lọc mới áp dụng.

### 2. Thêm khách mới

1. Bấm **Thêm khách hàng**.
2. Điền **Họ tên**, **Nguồn**, **Ngày nhập data** (bắt buộc). Các ô còn lại điền nếu có.
3. Bấm **Thêm khách hàng** ở cuối form để lưu.

```az-demo
customer-form
```

Quy tắc khi điền:

- **Ngày nhập data** không được lớn hơn hôm nay.
- **Số điện thoại** không bắt buộc, nhưng nếu nhập phải là số Việt Nam (đầu 09, 08, 07, 03 hoặc 05, đủ 10 số). **Email** nếu nhập phải đúng định dạng.
- **Sales phụ trách / Marketing phụ trách:** nếu bạn thuộc nhóm phụ trách tương ứng, hệ thống **tự điền chính bạn**.
- Nếu SĐT hoặc Email **đã có** trong hệ thống, hộp thoại **"Phát hiện dữ liệu có thể bị trùng"** cho biết ai đã thêm. Bạn **vẫn có thể bấm Vẫn tạo**.

### 3. Xem và sửa chi tiết một khách

Bấm vào dòng khách. Khung chi tiết có các tab:

| Tab | Dùng để |
|---|---|
| **Chi tiết** | Xem toàn bộ thông tin. Bấm **Chỉnh sửa** rồi **Lưu thay đổi**. |
| **Ghi chú** | Thêm ghi chú mới (chọn loại, bật 🔥 nếu quan trọng), sửa hoặc xoá ghi chú. |
| **Nạp tiền** | Xem lịch sử nạp tiền của khách. |
| **Chia data** | Xem ai đang được chia khách này; gán thêm, sửa hoặc **Thu hồi** lượt gán. |
| **Nhóm** | Bật/tắt khách đã tham gia nhóm nào. |

### 4. Đổi trạng thái nhanh

Cột **Trạng thái** là ô chọn: **bấm đổi ngay trên bảng**, không cần mở form.

### 5. Chia data cho Sales

1. Tick chọn các dòng khách trong bảng (chức năng này dùng trên máy tính).
2. Bấm **Gán cho Sales (số dòng)**.
3. Chọn một hoặc nhiều Sales ở ô **Chọn Sales nhận data**, có thể ghi **Lý do**, rồi bấm **Xác nhận gán**.

Cần nhớ:

- Chọn nhiều Sales thì **mỗi khách được gán cho tất cả** những người đó (chia sẻ, không chia đều).
- Khách **chưa có Sales chính**: **người đầu tiên trong danh sách chọn** thành Sales chính. Khách đã có Sales chính: người mới thành **Sales phụ**.
- Bạn gán được khách trong phạm vi quyền **chia data** của bạn:
  - *Tất cả*: mọi khách.
  - *Phòng ban*: khách thuộc phòng ban bạn quản lý.
  - *Của tôi*: khách bạn là Sales chính, hoặc khách bạn tạo mà chưa ai nhận.
- Khách nằm ngoài phạm vi sẽ báo lỗi riêng cho từng khách; các khách hợp lệ vẫn được gán.

Ngoài ra có trang riêng cho việc chia data: **Chia Data** ở menu.

### 6. Nhập khách từ Excel

1. Bấm **Nhập Excel**.
2. Bấm **Tải file mẫu (.xlsx)** và điền theo mẫu. Hai cột **Họ và Tên** và **Số điện thoại** là bắt buộc.
3. Kéo thả file vào ô (hoặc bấm để chọn). Nhận file **.xlsx** hoặc **.csv (UTF-8)**, tối đa **5MB và 1000 dòng**.
4. Bấm **Nhập dữ liệu**.

Quy tắc khi nhập:

- Mỗi khách nhập vào có **Sales chính là chính bạn** và thuộc phòng ban của bạn.
- Dòng bị **từ chối** nếu: họ tên trống; SĐT trống hoặc sai định dạng; SĐT **đã có trong hệ thống** (tính cả khách đang nằm trong Thùng rác); SĐT trùng ngay trong file; ngày nhập lớn hơn hôm nay.
- Nguồn không có trong danh mục sẽ chuyển thành **Other**; trạng thái không hợp lệ sẽ thành **pending**. Ngày ghi dạng `dd/mm/yyyy`.
- Xong sẽ báo số khách nhập thành công và số dòng bỏ qua. Dòng lỗi hiện thành bảng **Dòng / Họ và tên / SĐT / Lý do bị từ chối** để bạn sửa lại file.

> Khác với form thêm tay: **nhập Excel bắt buộc có SĐT**.

### 7. Xuất Excel

Bấm **Xuất Excel**, chọn bộ lọc cho file xuất ra (để trống = xuất toàn bộ khách bạn xem được) rồi bấm **Xuất Excel** trong hộp thoại.

### 8. Xoá khách

Người có quyền **Xoá khách hàng** (mặc định là Admin) có cột **Thao tác** với nút Xoá. Bấm Xoá và xác nhận. Khách bị xoá được đưa vào **Thùng rác** (xoá mềm), chưa mất hẳn.

```az-demo
row-actions
```

## Giải thích các cột của bảng

Mẫu dưới là bảng với dữ liệu giả. Bạn có thể kéo thanh cuộn sang ngang để xem đủ cột.

```az-demo
customer-table
```

| Cột | Ý nghĩa |
|---|---|
| **STT** | Số thứ tự trong trang đang xem. |
| **Ngày nhập** | Ngày nhập data. Bấm tiêu đề cột để sắp xếp. |
| **Họ và tên** | Tên khách. Rê chuột vào biểu tượng **ⓘ** để xem **Tạo bởi** (ai, lúc nào) và **Sửa cuối**. |
| **SĐT** | Số điện thoại. Để trống thì hiện chữ mờ "Chưa có SDT". |
| **Nguồn** | Nguồn khách (Facebook, TikTok...), hiện bằng tag màu. |
| **UTM** | Tag UTM của khách. |
| **Sales (Chính + Phụ)** | Sales chính và Sales được chia (xem mục dưới). |
| **Marketing** | Người Marketing phụ trách. Chưa có thì hiện "Chưa gán". |
| **Trạng thái** | Trạng thái của khách (bấm đổi nhanh được). |
| **Đã joined nhóm** | Các nhóm khách đã tham gia; nhóm thứ hai trở đi gộp thành `+N` (rê chuột xem tên). Chưa tham gia: "Chưa join". |
| **Nạp tiền** | Tổng tiền nạp (USD) trong khoảng ngày ghi dưới tiêu đề cột. |
| **Ghi chú gần nhất** | Rê chuột để xem các ghi chú mới nhất. Ô **Ghi chú gần nhất** trên thanh công cụ chọn hiện 3 hoặc 5 ghi chú. |
| **Thao tác** | Nút **Xoá** (dành cho người có quyền Xoá khách hàng). |

Có thể bấm tiêu đề để sắp xếp theo: **Ngày nhập**, **Họ và tên**, **SĐT**, **Trạng thái**, **Nạp tiền**.

> Bảng không có nút Xem/Sửa/Chia sẻ trên từng dòng. Muốn xem hoặc sửa, bấm vào dòng; muốn chia data, tick dòng rồi **Gán cho Sales**.

### Sales chính, Sales phụ, Marketing

- **Sales chính:** người chịu trách nhiệm chính của khách, hiện bằng **tag xanh dương**.
- **Sales phụ (được chia):** những người được chia thêm để hỗ trợ, gộp thành tag **`+N`**; rê chuột để xem tên.
- **Marketing phụ trách:** tag màu tím, tách riêng khỏi Sales.
- Chưa có ai: hiện chữ mờ **Chưa gán**.

```az-demo
sales-assignment-cell
```

Ai xuất hiện trong ô chọn Sales/Marketing phụ trách do Admin cấu hình ở trang **Quản lý phụ trách**.

### Màu của trạng thái và nguồn

Tên và màu do Admin đặt ở **Quản lý Status khách** và **Quản lý nguồn**:

```az-demo
status-tags
```

```az-demo
source-tags
```

## Thẻ thống kê

- **Tổng khách hàng**, **Khách mới hôm nay**, **Chốt thành công**: bấm vào thẻ để xem danh sách tương ứng.
- **Tổng nạp (30 ngày, USD)**: bấm để xem chi tiết. Khi bạn lọc theo ngày, tên thẻ đổi thành **Tổng nạp (theo ngày lọc, USD)**.
- Số liệu luôn tính theo phạm vi khách của bạn và bộ lọc đang chọn, nên mỗi người có thể thấy con số khác nhau.

## Trên điện thoại

Bộ lọc thu trong mục **Bộ lọc & Tìm kiếm** và danh sách hiện dạng **thẻ** thay vì bảng. Chia data bằng **Gán cho Sales** dùng trên máy tính.

## Xem thêm

- [Bắt đầu sử dụng AZWorkbase](/huong-dan/bat-dau)
- [Hướng dẫn đọc bài](/huong-dan/huong-dan-su-dung)
