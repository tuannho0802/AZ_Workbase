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

Trang **Khách hàng** là nơi xem, tìm, thêm, sửa và theo dõi toàn bộ khách hàng (data) mà bạn được phép thấy: ai phụ trách, đang ở trạng thái nào, đã nạp bao nhiêu, ghi chú gần nhất ra sao. Vào từ mục **Khách hàng** ở menu.

## Ai dùng được & thấy gì

Bạn cần quyền **Xem khách hàng** (`customers.view`). Quyền này có 3 phạm vi, do Quản trị viên chọn cho từng vai trò ở trang Phân quyền:

| Phạm vi | Bạn thấy |
|---|---|
| Tất cả | Mọi khách hàng. |
| Phòng ban | Khách thuộc phòng ban bạn quản lý, **cộng thêm** khách của chính bạn. |
| Của tôi | Khách bạn tạo, khách bạn là Sales chính, khách bạn là Marketing phụ trách, và khách đang được chia cho bạn. |

Bảng dưới là ví dụ với cấu hình mặc định (Quản trị viên có thể đổi). Bấm các nút ở **Xem với tư cách** để so sánh dòng, cột và nút thay đổi thế nào:

```az-demo
customer-table-by-viewer persona=manager
```

Các nút còn phụ thuộc quyền riêng: **Thêm khách hàng** cần quyền tạo, **Nhập Excel** cần quyền nhập, **Xuất Excel** cần quyền xuất, **Gán cho Sales** cần quyền chia data, đổi trạng thái ngay trên bảng và nút **Chỉnh sửa** cần quyền sửa, cột **Thao tác** (nút Xoá) cần quyền xoá.

## Bắt đầu nhanh

1. Vào **Khách hàng**. Danh sách mặc định xếp theo **Ngày nhập mới nhất** lên đầu.
2. Dùng bộ lọc phía trên bảng để tìm (xem mục "Bộ lọc").
3. Bấm vào **một dòng** để mở chi tiết khách ở khung bên phải (Drawer).
4. Cần thêm khách mới: bấm **Thêm khách hàng**, điền form, bấm **Thêm khách hàng** để lưu.
5. Cần chia khách cho Sales: tick chọn các dòng rồi bấm **Gán cho Sales (số dòng)**.

## Thẻ thống kê ở đầu trang

Có 4 thẻ, **số liệu đổi theo đúng bộ lọc đang áp dụng**:

- **Tổng khách hàng**
- **Khách mới hôm nay** (bấm để xem danh sách)
- **Chốt thành công** (bấm để xem theo trạng thái)
- **Tổng nạp (30 ngày, USD)** (bấm để xem chi tiết). Khi bạn lọc theo ngày, tên thẻ đổi thành **Tổng nạp (theo ngày lọc, USD)**. Thẻ này bị ẩn nếu vị trí/phòng ban của bạn bị ẩn thông tin Nạp tiền.

## Các cột của bảng

Mẫu dưới là bảng với dữ liệu giả. Dữ liệu thật của bạn do phạm vi quyền quyết định.

```az-demo
customer-table
```

| Cột | Ý nghĩa |
|---|---|
| **STT** | Số thứ tự trong trang đang xem. |
| **Ngày nhập** | Ngày nhập data. Bấm tiêu đề cột để sắp xếp. |
| **Họ và tên** | Tên khách. Biểu tượng **ⓘ** cạnh tên: rê chuột để xem **Tạo bởi** (ai, lúc nào) và **Sửa cuối**. |
| **SĐT** | Số điện thoại. Nếu để trống sẽ hiện chữ mờ "Chưa có SDT". |
| **Nguồn** | Nguồn khách (Facebook, TikTok...), tag màu. |
| **UTM** | Tag UTM của khách (khi chưa gắn UTM từ danh mục sẽ hiện chữ cũ). |
| **Sales (Chính + Phụ)** | Xem mục "Sales chính, Sales phụ, Marketing" bên dưới. |
| **Marketing** | Người Marketing phụ trách. Chưa có thì hiện "Chưa gán". |
| **Trạng thái** | Tag trạng thái. Có quyền sửa thì đây là ô chọn, **bấm đổi ngay trên bảng**, không cần mở form. |
| **Đã joined nhóm** | Các nhóm khách đã tham gia; nhóm thứ hai trở đi gộp thành `+N` (rê chuột xem tên). Chưa tham gia: "Chưa join". |
| **Nạp tiền** | Tổng tiền nạp (USD) trong khoảng ngày ghi dưới tiêu đề cột. |
| **Ghi chú gần nhất** | Rê chuột để xem các ghi chú mới nhất. Ô **Ghi chú gần nhất** trên thanh công cụ chọn hiện 3 hoặc 5 ghi chú. |
| **Thao tác** | Chỉ có nút **Xoá**, và **chỉ hiện khi bạn có quyền Xoá khách hàng**. Không có quyền thì cả cột này biến mất. |

Các cột có thể sắp xếp: **Ngày nhập, Họ và tên, SĐT, Trạng thái, Nạp tiền**.

> Bảng **không có** nút Xem/Sửa/Chia sẻ trên từng dòng. Xem và sửa làm trong khung chi tiết (bấm vào dòng); chia data làm bằng cách tick chọn dòng rồi **Gán cho Sales**.

### Tag trạng thái và nguồn

Màu và tên do Quản trị viên cấu hình ở **Quản lý Status khách** và **Quản lý nguồn**:

```az-demo
status-tags
```

```az-demo
source-tags
```

## Sales chính, Sales phụ, Marketing

- **Sales chính:** người chịu trách nhiệm chính của khách, hiện bằng **tag xanh dương**.
- **Sales được chia (Sales phụ):** những người được chia thêm để hỗ trợ, gộp thành tag **`+N`**; rê chuột để xem tên.
- **Marketing phụ trách:** tag màu tím, tách riêng khỏi Sales.
- Chưa có ai: hiện chữ mờ **Chưa gán**.

```az-demo
sales-assignment-cell
```

Những ai xuất hiện trong danh sách chọn "Sales phụ trách" / "Marketing phụ trách" do **Quản lý phụ trách** cấu hình (phòng ban và vị trí nào được coi là Sales/Marketing).

## Bộ lọc

Phía trên bảng. Để trống một ô nghĩa là không lọc theo tiêu chí đó.

- **Tìm kiếm** theo tên, SĐT, UTM...
- **Nguồn**, **Trạng thái**, **UTM**
- **Sales (Phòng Kinh Doanh)**, **Marketing (Phòng Marketing)** (bị ẩn nếu vị trí của bạn bị ẩn thông tin này)
- **Người nhập Data**
- **Đã joined nhóm**: *Đã joined ít nhất 1 nhóm* hoặc *Chưa joined nhóm nào*
- **Nhóm cụ thể**
- **Từ ngày** / **Đến ngày** (theo ngày nhập). **Phải chọn đủ cả hai** mới áp dụng, nếu chỉ chọn một ô sẽ có cảnh báo vàng "Chọn để áp dụng bộ lọc".

Khi dùng điện thoại, bộ lọc thu trong mục **Bộ lọc & Tìm kiếm** và danh sách hiện dạng thẻ thay vì bảng.

## Thêm khách hàng

Bấm **Thêm khách hàng** (cần quyền tạo). Form chia thành các phần:

```az-demo
customer-form
```

- **Họ tên** và **Nguồn** và **Ngày nhập data** là bắt buộc. Ngày nhập **không được lớn hơn hôm nay**.
- **Số điện thoại** là tuỳ chọn, nhưng nếu nhập phải đúng số Việt Nam (đầu 09, 08, 07, 03 hoặc 05, đủ 10 số). **Email** nếu nhập phải đúng định dạng.
- **UTM:** chọn hoặc tạo UTM.
- **Tham gia nhóm:** bấm để chọn tự do trong các nhóm đang hoạt động (không cần trùng với Nguồn).
- **Sales phụ trách / Marketing phụ trách:** khi tạo mới, nếu bạn thuộc nhóm phụ trách tương ứng, hệ thống **tự điền chính bạn**. Hai ô này bị ẩn nếu vị trí của bạn bị ẩn trường phân công.
- **Ngày nhận KH**, **Ngày chốt**, **Trạng thái**, **Ghi chú**.

**Cảnh báo trùng:** nếu SĐT hoặc Email đã có trong hệ thống (kể cả khách do người khác nhập), một hộp thoại **"Phát hiện dữ liệu có thể bị trùng"** cho biết ai đã thêm. Bạn **vẫn có thể bấm Vẫn tạo** (hoặc **Vẫn lưu** khi sửa), hệ thống không chặn.

## Chi tiết khách hàng (bấm vào dòng)

Khung chi tiết có các tab:

- **Chi tiết:** thông tin đầy đủ, gồm Người tạo data, Sales phụ trách chính, Sales được chia, Marketing phụ trách. Nút **Chỉnh sửa** (cần quyền sửa) mở form sửa, lưu bằng **Lưu thay đổi**.
- **Ghi chú (N):** thêm ghi chú mới (chọn loại, bật 🔥 nếu quan trọng), sửa hoặc xoá ghi chú.
- **Nạp tiền (N):** lịch sử nạp tiền của khách.
- **Chia data (N):** ai đang được chia khách này. Bạn có thể **gán thêm Sales**, **sửa** hoặc **Thu hồi** lượt gán (thu hồi không hoàn tác được; chỉ làm được với lượt gán bạn có quyền can thiệp).
- **Nhóm:** bật/tắt khách đã tham gia nhóm nào.

Tab **Nạp tiền**, **Chia data**, **Nhóm** có thể bị ẩn theo vị trí/phòng ban của bạn.

## Chia data cho Sales

1. Tick chọn các dòng khách trong bảng (cần quyền chia data; chức năng này không có trên điện thoại).
2. Bấm **Gán cho Sales (N)**.
3. Chọn một hoặc nhiều Sales ở ô **Chọn Sales nhận data**, có thể ghi **Lý do** (tuỳ chọn), rồi bấm **Xác nhận gán**.

Lưu ý:

- Nếu chọn nhiều Sales, **mỗi khách được gán cho tất cả** những người đó (chia sẻ, không chia đều).
- Khách **chưa có Sales chính** sẽ lấy **người đầu tiên trong danh sách chọn** làm Sales chính; khách đã có Sales chính thì người mới thành Sales phụ.
- Bạn chỉ gán được khách trong phạm vi quyền **chia data** của bạn. Khác với phạm vi xem, phạm vi gán chặt hơn:
  - *Tất cả*: mọi khách.
  - *Phòng ban*: **chỉ** khách thuộc phòng ban bạn quản lý (khách riêng của bạn nhưng nằm ngoài các phòng ban đó **không** gán được).
  - *Của tôi*: khách bạn là Sales chính, hoặc khách bạn tạo mà chưa ai nhận.
- Khách nằm ngoài phạm vi sẽ báo lỗi riêng cho từng khách ("Bạn không có quyền chia khách hàng ... không thuộc quản lý của bạn"); các khách hợp lệ vẫn được gán.

Trang [Chia Data](/huong-dan/chia-data) chuyên cho việc này.

## Nhập khách từ Excel

Bấm **Nhập Excel** (cần quyền nhập).

1. Bấm **Tải file mẫu (.xlsx)** và điền theo mẫu. Các cột trong mẫu: Họ và Tên, Số điện thoại, Email, Nguồn, Chiến dịch, Trạng thái, Broker, Ngày nhập data, Ngày chốt, Ghi chú. **Bắt buộc có hai cột Họ và Tên, Số điện thoại.**
2. Kéo thả file vào ô (hoặc bấm để chọn). Chỉ nhận **.xlsx hoặc .csv (UTF-8)**, không nhận .xls; tối đa **5MB và 1000 dòng**.
3. Bấm **Nhập dữ liệu**.

Quy tắc khi nhập:

- Mỗi khách nhập vào có **Sales chính là chính bạn**, và thuộc phòng ban của bạn.
- Dòng bị từ chối nếu: họ tên trống; SĐT trống hoặc sai định dạng Việt Nam; SĐT **đã tồn tại trong hệ thống** (tính cả khách đã nằm trong Thùng rác); SĐT trùng ngay trong file; ngày nhập lớn hơn hôm nay; UTM không hợp lệ.
- Nguồn không có trong danh mục sẽ chuyển thành **Other**; trạng thái không hợp lệ sẽ thành **pending**. Ngày ghi dạng `dd/mm/yyyy`.
- Kết quả hiện thông báo số khách nhập thành công và số dòng bỏ qua; dòng lỗi hiện thành bảng **Dòng / Họ và tên / SĐT / Lý do bị từ chối** để bạn sửa lại file.

> Lưu ý: nhập Excel **bắt buộc có SĐT**, còn form thêm tay thì SĐT là tuỳ chọn.

## Xuất Excel

Bấm **Xuất Excel** (cần quyền xuất). Trong hộp thoại, chọn bộ lọc cho file xuất ra (để trống = xuất toàn bộ khách bạn được phép xem) rồi bấm **Xuất Excel**.

## Xoá khách hàng

Chỉ người có quyền **Xoá khách hàng** thấy cột **Thao tác**. Bấm nút Xoá, xác nhận **Xóa**. Khách bị xoá được đưa vào [Thùng rác](/huong-dan/thung-rac) (xoá mềm), không mất ngay.

```az-demo
row-actions
```

## Vì sao tôi không thấy...?

- **Không thấy một khách:** khách nằm ngoài phạm vi xem của bạn (không phải bạn tạo, không phải Sales/Marketing của khách, chưa được chia, không thuộc phòng ban bạn quản lý).
- **Không thấy cột Sales hoặc Marketing, tab Nạp tiền/Chia data/Nhóm:** Quản trị viên đã ẩn theo vị trí hoặc phòng ban của bạn.
- **Không có nút Thêm khách hàng / Nhập Excel / Xuất Excel / Gán cho Sales:** thiếu quyền tương ứng.
- **Trạng thái chỉ là chữ, không bấm đổi được:** bạn không có quyền sửa khách hàng.
- **Không có cột Thao tác:** bạn không có quyền Xoá khách hàng.
- **Thẻ thống kê ít hơn bảng của đồng nghiệp:** số liệu luôn theo phạm vi quyền và bộ lọc của chính bạn.

Cần thêm quyền, hãy nhờ Quản trị viên chỉnh ở trang Phân quyền.

## Xem thêm

- [Bắt đầu sử dụng AZWorkbase](/huong-dan/bat-dau)
- [Chia Data](/huong-dan/chia-data)
- [Thùng rác](/huong-dan/thung-rac)
