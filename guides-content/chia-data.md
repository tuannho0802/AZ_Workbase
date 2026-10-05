---
title: Chia Data
slug: chia-data
sortOrder: 20
published: false
roles: []
positions: []
departments: []
permissions: [customers.assign]
---

## Trang này để làm gì

Trang **Chia Data** (menu **Chia Data**) dùng để **giao khách hàng cho Sales** và theo dõi khách nào đã có người phụ trách. Bạn chọn nhiều khách một lúc, chọn một hoặc nhiều Sales nhận, hệ thống ghi lại ai gán, gán cho ai và gửi thông báo cho người nhận.

Chỉ người có quyền **Chia data** (`customers.assign`) vào được trang này. Không có quyền, bạn sẽ bị đưa về trang **Khách hàng** kèm thông báo "Bạn không có quyền truy cập trang này".

## Màn hình gồm những gì

- **Hai ô thống kê** ở đầu trang: **Có thể chia** và **Đã assign** (số khách theo bộ lọc hiện tại).
- **Hai tab**:
  - **📋 Có thể chia**: khách **chưa có Sales chính** mà bạn chia được, cộng khách bạn **đang là Sales chính** (để bạn giao lại cho đồng nghiệp).
  - **✅ Đã assign**: khách **đã có Sales chính**, trong phạm vi bạn được **xem** ở trang Khách hàng.
- Cả hai tab đều có ô tìm **Tên, SĐT**, bộ lọc **Trạng thái**, hai ô khoảng ngày (**Ngày nhập** do người nhập tự chọn, **Nhập thực tế** là lúc bản ghi được tạo), ô **3 gần nhất / 5 gần nhất** (số ghi chú hiện trong tooltip cột **Ghi chú gần nhất**) và nút **Làm mới**.

## Ai chia được khách nào

Quyền **Chia data** có **phạm vi** do Admin cấu hình ở trang **Phân quyền**, và phạm vi này **độc lập** với phạm vi xem khách. Hệ thống kiểm tra từng khách:

| Phạm vi quyền Chia data | Chia được |
|---|---|
| **Tất cả** (Admin luôn như vậy) | Mọi khách hàng. |
| **Phòng ban** | Khách thuộc **phòng ban bạn được gán quản lý**. Khách riêng của bạn nhưng thuộc phòng ban khác **không** tính. |
| **Của tôi** | Khách bạn **đang là Sales chính**, hoặc khách **bạn tạo mà chưa ai nhận**. Nếu bạn chỉ là Sales phụ thì **không** chia lại được. |

Bấm đổi phạm vi bên dưới để xem khách nào chia được và khách nào hiện ở tab **Có thể chia**:

```az-demo
assign-rules-by-scope scope=own
```

Khách nằm ngoài phạm vi sẽ báo lỗi riêng cho từng khách; các khách hợp lệ trong cùng lượt vẫn được chia.

## Bắt đầu nhanh: chia data cho Sales

1. Vào tab **📋 Có thể chia**. Lọc nếu cần (nguồn, trạng thái, ngày...).
2. **Tick chọn** các khách (hoặc bấm vào dòng để chọn/bỏ chọn). Lựa chọn **được giữ lại khi sang trang khác**. Muốn bỏ hết, bấm **Bỏ chọn tất cả**.
3. Bấm nút **Chia N khách →**.
4. Trong hộp thoại, mở ô **Chọn Sales nhận data** và chọn **một hoặc nhiều** người. Có thể gõ tên hoặc email để tìm.
5. Bấm **Xác nhận chia cho N Sales**. Hệ thống báo "Đã chia ... khách cho ... Sales"; nếu có khách không chia được sẽ hiện thêm cảnh báo.

```az-demo
assign-flow
```

Cần nhớ:

- Chọn nhiều Sales thì **mỗi khách được gán cho tất cả** những người đó (chia sẻ, **không chia đều**).
- Khách **chưa có Sales chính**: **người đầu tiên bạn chọn** trở thành **Sales chính**, những người còn lại là **Sales phụ**.
- Khách **đã có Sales chính**: Sales chính **giữ nguyên**, người mới thành **Sales phụ**.
- Người **đã được gán sẵn** cho khách đó thì không bị gán trùng.
- Mỗi lần chia tối đa **500 khách** và **50 Sales**.
- Người nhận được **thông báo**, gộp theo người (không phải 1 thông báo cho mỗi khách).
- Chức năng chọn và chia dùng trên **máy tính**; trên điện thoại bạn chỉ xem danh sách.

### Ô "Chọn Sales nhận data" hiện những ai?

Chỉ những người thuộc nhóm phụ trách **Sales phụ trách** (Phòng ban + Vị trí do Admin cấu hình ở trang [Quản lý phụ trách](/huong-dan/quan-ly-phu-trach)), đang hoạt động và đã được duyệt. Nếu danh sách trống hoặc thiếu người, hãy báo Admin kiểm tra nhóm này.

## Tab "Đã assign" và quản lý lượt gán

Bấm vào một dòng ở tab **✅ Đã assign** để mở **chi tiết khách ngay tại trang** (không rời trang). Vào tab **Chia data** trong khung chi tiết để xem **Lịch sử gán data**:

- **Người nhận** (kèm tag **Sales chính**), **Trạng thái** (Đang hoạt động / Đã chuyển giao / Đã thu hồi), **Người gán**, **Lý do**, **Ngày gán**.
- **Gán thêm Sales**: thêm người nhận mới cho khách này.
- **Sửa**: đổi người nhận hoặc lý do của một lượt gán đang hoạt động.
- **Thu hồi**: huỷ một lượt gán đang hoạt động.

Quy tắc khi sửa/thu hồi:

- Làm được khi bạn là Admin, có phạm vi **Tất cả**, hoặc là người **quản lý phòng ban** của khách (phạm vi **Phòng ban**), hoặc (phạm vi **Của tôi**) **chính bạn là người đã gán** lượt đó. Ngoài ra hệ thống báo "Bạn không có quyền sửa/thu hồi lượt gán data này".
- Thu hồi **Sales chính**: Sales được gán **sớm nhất** còn lại sẽ lên làm Sales chính. Nếu không còn ai, khách **quay về chưa gán** và xuất hiện lại ở tab **Có thể chia**.
- Đổi người nhận của lượt đang là Sales chính thì **Sales chính đổi theo** người mới.
- Chỉ sửa/thu hồi được lượt đang **hoạt động**.

Sau khi sửa/thu hồi, khách có thể chuyển giữa hai tab, nên cả hai danh sách tự làm mới.

## Giải thích từng cột

| Cột | Ý nghĩa |
|---|---|
| **Tên khách hàng** | Biểu tượng ⓘ cho xem người tạo và người sửa cuối. Tag **👤** xanh = bạn đang là Sales phụ trách chính khách này. |
| **SĐT**, **Nguồn**, **Trạng thái**, **UTM** | Như trang Khách hàng. **Trạng thái ở đây chỉ để xem**, muốn đổi hãy làm ở trang Khách hàng. |
| **Ghi chú gần nhất** | Ghi chú mới nhất, rê chuột để xem 3 hoặc 5 ghi chú gần nhất. |
| **Sales Phụ trách chính** (tab Đã assign) | Tag xanh = Sales chính; badge **+N** = số Sales được chia, rê chuột xem tên. |
| **Người tạo** | Người nhập khách vào hệ thống. |
| **Ngày nhập** / **Ngày nhập thực tế** | Ngày người nhập tự chọn / ngày giờ thật bản ghi được tạo. |
| **Thao tác** | Nút xoá, **chỉ hiện nếu bạn có quyền Xoá khách hàng** (xoá = đưa vào Thùng rác). |

Bộ lọc **Data Owner** (tab Có thể chia), **Người phụ trách chính** và **Sales được chia** (tab Đã assign) chỉ hiện khi phạm vi xem của bạn rộng hơn "của tôi". **Người phụ trách chính** khớp cả Sales lẫn Marketing phụ trách.

## Vì sao tôi không thấy / không chia được …?

- **Không thấy trang Chia Data**: bạn chưa được cấp quyền **Chia data**. Liên hệ Admin.
- **Khách không hiện ở "Có thể chia"**: khách đã có Sales chính khác, hoặc nằm ngoài phạm vi chia của bạn (xem bảng ở trên).
- **Bấm Chia báo "không có quyền chia khách hàng không thuộc quản lý của bạn"**: khách đó ngoài phạm vi quyền Chia data của bạn.
- **Ô chọn Sales thiếu người**: người đó chưa thuộc nhóm **Sales phụ trách**, đang bị khoá hoặc chưa được duyệt tài khoản.
- **Không thấy nút Xoá**: bạn không có quyền Xoá khách hàng.

## Xem thêm

- [Khách hàng](/huong-dan/khach-hang)
- [Quản lý phụ trách](/huong-dan/quan-ly-phu-trach)
