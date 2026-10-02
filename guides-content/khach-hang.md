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

Bạn cần quyền **Xem khách hàng** để thấy trang này.

## Bạn thấy những khách nào?

Mỗi người thấy **một phạm vi khác nhau**, do Admin cài cho từng vai trò. Đây là điều khiến bảng của bạn khác bảng của đồng nghiệp.

| Bạn là | Bạn thấy |
|---|---|
| **Admin, Assistant** | **Tất cả** khách hàng. |
| **Manager** | Khách thuộc **phòng ban bạn quản lý**, cộng thêm khách của chính bạn. |
| **Sale, Content, Media** và nhân viên khác (Employee) | **Chỉ khách của mình**: khách bạn tạo, bạn là Sales chính, bạn là Marketing phụ trách, hoặc đang được chia cho bạn. |

Bấm các nút ở **Xem với tư cách** để so sánh dòng, cột và nút thay đổi thế nào theo từng người:

```az-demo
customer-table-by-viewer persona=manager
```

> Bảng trên là ví dụ theo **cấu hình mặc định**. Admin có thể đổi phạm vi xem, nên màn hình thật của bạn có thể khác.

## Làm quen màn hình

Từ trên xuống dưới, trang có 4 vùng:

1. **Thẻ thống kê** ở đầu trang: Tổng khách hàng, Khách mới hôm nay, Chốt thành công, Tổng nạp. Số liệu **đổi theo bộ lọc** bạn đang chọn.
2. **Bộ lọc** để thu hẹp danh sách (nguồn, trạng thái, Sales, ngày nhập...).
3. **Thanh nút**: **Làm mới**, **Thêm khách hàng**, **Nhập Excel**, **Xuất Excel**, **Gán cho Sales**. Nút nào bạn không có quyền thì **không hiện**.
4. **Bảng khách hàng**. Bấm vào **một dòng** để mở **chi tiết** ở khung bên phải.

Mặc định danh sách xếp **Ngày nhập mới nhất** lên đầu.

## Những việc thường làm

### Tìm một khách

1. Gõ tên, số điện thoại hoặc UTM vào ô **Tìm kiếm**.
2. Muốn lọc kỹ hơn, chọn thêm **Nguồn**, **Trạng thái**, **UTM**, **Người nhập Data**, nhóm đã tham gia, hoặc khoảng ngày.
3. Muốn xoá bộ lọc, bỏ chọn từng ô. Để trống một ô nghĩa là **không lọc** theo tiêu chí đó.

Lưu ý khi lọc theo ngày: phải chọn **cả Từ ngày và Đến ngày** thì bộ lọc mới áp dụng. Chỉ chọn một ô sẽ có cảnh báo vàng "Chọn để áp dụng bộ lọc".

### Thêm khách mới

1. Bấm **Thêm khách hàng** (cần quyền tạo).
2. Điền **Họ tên**, **Nguồn**, **Ngày nhập data** (bắt buộc). Các ô còn lại điền nếu có.
3. Bấm **Thêm khách hàng** ở cuối form để lưu.

```az-demo
customer-form
```

Quy tắc khi điền:

- **Ngày nhập data** không được lớn hơn hôm nay.
- **Số điện thoại** không bắt buộc, nhưng nếu nhập phải là số Việt Nam (đầu 09, 08, 07, 03 hoặc 05, đủ 10 số). **Email** nếu nhập phải đúng định dạng.
- **Sales phụ trách / Marketing phụ trách:** nếu bạn thuộc nhóm phụ trách tương ứng, hệ thống **tự điền chính bạn**.
- Nếu SĐT hoặc Email **đã có** trong hệ thống, hộp thoại **"Phát hiện dữ liệu có thể bị trùng"** cho biết ai đã thêm. Bạn **vẫn có thể bấm Vẫn tạo**, hệ thống không chặn.

### Xem và sửa chi tiết một khách

Bấm vào dòng khách. Khung chi tiết có các tab:

| Tab | Dùng để |
|---|---|
| **Chi tiết** | Xem toàn bộ thông tin. Bấm **Chỉnh sửa** (cần quyền sửa) rồi **Lưu thay đổi**. |
| **Ghi chú** | Thêm ghi chú mới (chọn loại, bật 🔥 nếu quan trọng), sửa hoặc xoá ghi chú. |
| **Nạp tiền** | Xem lịch sử nạp tiền của khách. |
| **Chia data** | Xem ai đang được chia khách này; gán thêm, sửa hoặc **Thu hồi** lượt gán. |
| **Nhóm** | Bật/tắt khách đã tham gia nhóm nào. |

Tab **Nạp tiền**, **Chia data**, **Nhóm** có thể bị Admin ẩn theo vị trí hoặc phòng ban của bạn.

### Đổi trạng thái nhanh

Nếu bạn có quyền sửa, cột **Trạng thái** là ô chọn: **bấm đổi ngay trên bảng**, không cần mở form. Không có quyền sửa thì chỉ hiện chữ.

### Chia data cho Sales

1. Tick chọn các dòng khách trong bảng (cần quyền chia data; chức năng này không có trên điện thoại).
2. Bấm **Gán cho Sales (số dòng)**.
3. Chọn một hoặc nhiều Sales ở ô **Chọn Sales nhận data**, có thể ghi **Lý do**, rồi bấm **Xác nhận gán**.

Cần nhớ:

- Chọn nhiều Sales thì **mỗi khách được gán cho tất cả** những người đó (chia sẻ, không chia đều).
- Khách **chưa có Sales chính**: **người đầu tiên trong danh sách chọn** thành Sales chính. Khách đã có Sales chính: người mới thành **Sales phụ**.
- Bạn chỉ gán được khách trong phạm vi quyền **chia data** của bạn, và phạm vi này **chặt hơn phạm vi xem**:
  - *Tất cả*: mọi khách.
  - *Phòng ban*: **chỉ** khách thuộc phòng ban bạn quản lý (khách riêng của bạn nằm ngoài các phòng ban đó **không** gán được).
  - *Của tôi*: khách bạn là Sales chính, hoặc khách bạn tạo mà chưa ai nhận.
- Khách nằm ngoài phạm vi sẽ báo lỗi riêng cho từng khách; các khách hợp lệ vẫn được gán.

Có trang riêng cho việc chia data: **Chia Data** ở menu (nếu bạn được cấp quyền).

### Nhập khách từ Excel

1. Bấm **Nhập Excel** (cần quyền nhập).
2. Bấm **Tải file mẫu (.xlsx)** và điền theo mẫu. Hai cột **Họ và Tên** và **Số điện thoại** là bắt buộc.
3. Kéo thả file vào ô (hoặc bấm để chọn). Chỉ nhận **.xlsx** hoặc **.csv (UTF-8)**, tối đa **5MB và 1000 dòng**.
4. Bấm **Nhập dữ liệu**.

Quy tắc khi nhập:

- Mỗi khách nhập vào có **Sales chính là chính bạn** và thuộc phòng ban của bạn.
- Dòng bị **từ chối** nếu: họ tên trống; SĐT trống hoặc sai định dạng; SĐT **đã có trong hệ thống** (tính cả khách đang nằm trong Thùng rác); SĐT trùng ngay trong file; ngày nhập lớn hơn hôm nay.
- Nguồn không có trong danh mục sẽ chuyển thành **Other**; trạng thái không hợp lệ sẽ thành **pending**. Ngày ghi dạng `dd/mm/yyyy`.
- Xong sẽ báo số khách nhập thành công và số dòng bỏ qua. Dòng lỗi hiện thành bảng **Dòng / Họ và tên / SĐT / Lý do bị từ chối** để bạn sửa lại file.

> Khác với form thêm tay: **nhập Excel bắt buộc có SĐT**.

### Xuất Excel

Bấm **Xuất Excel** (cần quyền xuất). Chọn bộ lọc cho file xuất ra (để trống = xuất toàn bộ khách bạn được phép xem) rồi bấm **Xuất Excel** trong hộp thoại.

### Xoá khách

Chỉ người có quyền **Xoá khách hàng** (mặc định là Admin) mới thấy cột **Thao tác** với nút Xoá. Bấm Xoá và xác nhận. Khách bị xoá được đưa vào **Thùng rác** (xoá mềm), chưa mất hẳn.

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
| **Trạng thái** | Trạng thái của khách (đổi nhanh được nếu có quyền sửa). |
| **Đã joined nhóm** | Các nhóm khách đã tham gia; nhóm thứ hai trở đi gộp thành `+N` (rê chuột xem tên). Chưa tham gia: "Chưa join". |
| **Nạp tiền** | Tổng tiền nạp (USD) trong khoảng ngày ghi dưới tiêu đề cột. |
| **Ghi chú gần nhất** | Rê chuột để xem các ghi chú mới nhất. Ô **Ghi chú gần nhất** trên thanh công cụ chọn hiện 3 hoặc 5 ghi chú. |
| **Thao tác** | Nút **Xoá**; chỉ hiện nếu bạn có quyền Xoá. |

Có thể bấm tiêu đề để sắp xếp theo: **Ngày nhập**, **Họ và tên**, **SĐT**, **Trạng thái**, **Nạp tiền**.

> Bảng **không có** nút Xem/Sửa/Chia sẻ trên từng dòng. Muốn xem hoặc sửa, bấm vào dòng; muốn chia data, tick dòng rồi **Gán cho Sales**.

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

### Thẻ thống kê

- **Tổng khách hàng**, **Khách mới hôm nay**, **Chốt thành công**: bấm vào thẻ để xem danh sách tương ứng.
- **Tổng nạp (30 ngày, USD)**: bấm để xem chi tiết. Khi bạn lọc theo ngày, tên thẻ đổi thành **Tổng nạp (theo ngày lọc, USD)**. Thẻ này **bị ẩn** nếu vị trí hoặc phòng ban của bạn bị ẩn thông tin Nạp tiền.

## Trên điện thoại

Bộ lọc thu trong mục **Bộ lọc & Tìm kiếm** và danh sách hiện dạng **thẻ** thay vì bảng. Chia data bằng **Gán cho Sales** không dùng được trên điện thoại.

## Vì sao tôi không thấy...?

- **Không thấy một khách:** khách nằm ngoài phạm vi xem của bạn (không phải bạn tạo, không phải Sales/Marketing của khách, chưa được chia, không thuộc phòng ban bạn quản lý).
- **Không thấy cột Sales, Marketing, hoặc tab Nạp tiền/Chia data/Nhóm:** Admin đã ẩn theo vị trí hoặc phòng ban của bạn.
- **Không có nút Thêm khách hàng, Nhập Excel, Xuất Excel hoặc Gán cho Sales:** bạn chưa có quyền tương ứng.
- **Trạng thái chỉ là chữ, không bấm đổi được:** bạn chưa có quyền sửa khách hàng.
- **Không có cột Thao tác:** bạn chưa có quyền Xoá khách hàng.
- **Số trên thẻ thống kê khác đồng nghiệp:** số liệu luôn theo phạm vi quyền và bộ lọc của chính bạn.

Cần thêm quyền, hãy nhờ Admin chỉnh ở trang **Phân quyền**.

## Xem thêm

- [Bắt đầu sử dụng AZWorkbase](/huong-dan/bat-dau)
- [Hướng dẫn đọc bài](/huong-dan/huong-dan-su-dung)