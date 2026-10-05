---
title: Quản lý UTM
slug: quan-ly-utm
sortOrder: 60
published: false
roles: []
positions: []
departments: []
permissions: [utms.my_managed, customers.view]
---

## Trang này để làm gì

**UTM** là tên chiến dịch quảng cáo gắn cho từng khách hàng, ví dụ `FB_Q4` hay `TT_Summer`. Trang **Quản lý UTM** là nơi tạo và chăm sóc danh sách UTM đó: ai phụ trách UTM nào, UTM nào đang mở hay đã khoá, UTM nào bị trùng cần gộp, và mỗi UTM đang có bao nhiêu khách.

Danh sách này xuất hiện ở ô **UTM** khi thêm hoặc sửa khách, ở Tag màu trong bảng khách hàng và ở bộ lọc **UTM**.

```az-demo
utm-tags
```

UTM đã khoá hiện mờ và gạch ngang.

## Ai dùng được

Vào trang cần **cả hai** quyền: **Vào trang Quản lý UTM** (`utms.my_managed`) và **Xem khách hàng** (`customers.view`). Thiếu một trong hai, mục **Quản lý UTM** không hiện ở menu, và nếu mở bằng đường dẫn trực tiếp bạn sẽ nhận thông báo "Bạn không có quyền truy cập trang này" rồi bị đưa về trang chủ. Lý do cần xem khách: UTM gắn với khách hàng, và số khách của mỗi UTM chỉ đếm trong phạm vi khách bạn được xem.

Theo cấu hình mặc định, Admin, Assistant và Manager có quyền vào trang. Employee **không** có, trừ nhân viên thuộc phòng ban **Marketing** (được cấp riêng, xem bảng dưới). Mỗi quyền có **phạm vi**:

| Việc | Quyền | Admin / Assistant | Manager | Employee Marketing |
|---|---|---|---|---|
| Xem tab **Tất cả UTM** và **Thống kê** | `utms.view` | Tất cả | Phòng ban mình quản lý | UTM mình là chính/phụ |
| **Tạo UTM** | `utms.create` | Có | Có | Có |
| **Sửa**, **Khoá/Mở khoá**, **Gộp**, **Gợi ý trùng** | `utms.edit` | Tất cả | Phòng ban mình quản lý | UTM mình là chính/phụ |
| **Thêm/gỡ Quản lý phụ**, **Chuyển Quản lý chính** | `utms.assign` | Tất cả | Phòng ban mình quản lý | UTM mình là chính/phụ |
| **Xoá** | `utms.delete` | Chỉ Admin | Không | Không |

Phạm vi thật do Admin cấu hình ở trang **Phân quyền** nên có thể khác bảng trên. **Gộp** và **Gợi ý trùng** chỉ dành cho người có quyền Sửa UTM ở phạm vi **Tất cả**.

> Nhân viên không có các quyền trên vẫn **chọn UTM bình thường** ở form khách hàng và thấy Tag UTM ở bảng khách. Quyền ở đây chỉ quyết định bạn có **quản lý** UTM hay không.

## Quản lý chính và Quản lý phụ

Mỗi UTM có **một Quản lý chính** (người tạo UTM, hoặc người được chuyển giao) và có thể có nhiều **Quản lý phụ**. Quyền trên một UTM cụ thể phụ thuộc vai trò của bạn với UTM đó:

| Việc | Quản lý chính | Quản lý phụ | Người có phạm vi rộng |
|---|---|---|---|
| Đổi **mô tả**, **màu** | Có | Có | Có |
| **Khoá / Mở khoá** | Có | Có | Có |
| Đổi **tên**, đổi **Hiển thị** (Mọi người / Riêng tư) | Có | **Không** | Có |
| Thêm/gỡ Quản lý phụ, chuyển Quản lý chính | Có | **Không** | Có |

"Phạm vi rộng" là quyền ở phạm vi **Tất cả**, hoặc phạm vi **Phòng ban** với UTM có Quản lý chính thuộc phòng ban mình quản lý. UTM chưa có Quản lý chính (thường là UTM nhập từ dữ liệu cũ) chỉ người có phạm vi **Tất cả** thao tác được.

```az-demo
utm-managers
```

Bấm **Quản lý** ở dòng UTM để mở hộp thoại này. Ai cũng bấm được nút, nhưng chỉ **thành viên của UTM** (chính hoặc phụ) hoặc người có phạm vi xem rộng mới xem được danh sách; các nút Thêm, Gỡ, Chuyển chỉ hiện với người được phép.

1. **Thêm Quản lý phụ**: chọn nhân viên rồi bấm **Thêm**. Không chọn được người đang là Quản lý chính hoặc đã là phụ. Thông báo "Đã thêm Quản lý phụ".
2. **Gỡ Quản lý phụ**: bấm biểu tượng thùng rác ở dòng người đó, xác nhận **Gỡ**.
3. **Chuyển Quản lý chính**: chọn người nhận, bấm **Chuyển quyền chính**, xác nhận. Người nhận trở thành Quản lý chính; nếu họ đang là phụ thì tự bị gỡ khỏi danh sách phụ. **Quản lý chính cũ không tự thành Quản lý phụ**, nên có thể mất quyền với UTM này ngay sau khi chuyển. Muốn giữ lại thì thêm họ làm Quản lý phụ.

Chỉ chọn được nhân viên đang hoạt động.

## Các tab của trang

Phía trên các tab có nút **Tạo UTM** (cần quyền Tạo). Số trong ngoặc ở tên tab là số UTM của tab đó.

| Tab | Ai thấy | Nội dung |
|---|---|---|
| **UTM của tôi** | Mọi người vào được trang | UTM đang mở mà bạn là Quản lý chính hoặc phụ |
| **Tất cả UTM** | Có quyền Xem UTM | UTM đang mở trong phạm vi quyền của bạn |
| **Thống kê** | Có quyền Xem UTM | Số khách và tỷ lệ theo trạng thái (xem mục riêng bên dưới) |
| **UTM đã khoá** | Mọi người vào được trang | UTM đã khoá. Có quyền Xem UTM thì thấy cả phạm vi rộng, không thì chỉ UTM của mình |
| **Gợi ý trùng** | Có quyền Sửa UTM phạm vi Tất cả | Các nhóm UTM tên gần giống nhau |

```az-demo
utm-table
```

Màu và tên thật do mỗi nơi cấu hình nên có thể khác ảnh minh hoạ. Mỗi tab có bộ cột riêng:

| Cột | Ý nghĩa | Tab có cột này |
|---|---|---|
| **UTM** | Tag màu, kèm nhãn **Riêng tư** hoặc **Đã khoá** nếu có | Tất cả |
| **Mô tả** | Ghi chú của UTM | UTM của tôi, Tất cả UTM |
| **Vai trò của tôi** | **Quản lý chính** hoặc **Quản lý phụ** | UTM của tôi |
| **Quản lý chính**, **Quản lý phụ** | Người phụ trách ("Chưa gán" / "Chưa có" nếu trống) | Tất cả |
| **Hiển thị** | **Công khai** hoặc **Riêng tư** | Tất cả UTM |
| **Số KH** | Số khách của UTM (xem lưu ý bên dưới) | Tất cả |
| **Ngày khoá** | Lúc UTM bị khoá | UTM đã khoá |
| **Ngày tạo** | Lúc tạo UTM | Tất cả |
| **Thao tác** | Các nút theo quyền | Tất cả |

> **Số KH chỉ tính khách chưa vào Thùng rác và nằm trong phạm vi bạn được xem.** Vì vậy nó có thể nhỏ hơn số khách thật của UTM, kể cả bằng 0 khi UTM vẫn còn khách ở Thùng rác hoặc khách của người khác.

Phía trên bảng có ô **Tìm theo tên/mô tả UTM**, khoảng ngày **Tạo từ ngày / Đến ngày** và các ô chọn: **Vai trò của tôi** (tab UTM của tôi), **Quản lý chính** (tab Tất cả UTM và UTM đã khoá), **Hiển thị**, **Sắp xếp**. Các bộ lọc chạy ngay trên danh sách đã tải. Đổi tab thì bộ lọc và các dòng đã chọn được xoá về mặc định. Mỗi trang hiện 20 UTM, đổi được thành 10, 50 hoặc 100.

## Bắt đầu nhanh

### 1. Tạo một UTM mới

1. Bấm **Tạo UTM**.
2. Điền **Tên UTM** (bắt buộc, tối đa 100 ký tự). Ví dụ: `D_T01_BOT_AP`.
3. Tuỳ chọn điền **Mô tả** (tối đa 255 ký tự) và chọn **Màu** cho Tag.
4. Chọn **Ai được chọn UTM này?**: **Mọi người** (mặc định) hoặc **Riêng tư**.
5. Bấm **Tạo**. Thông báo "Đã tạo UTM". Bạn trở thành **Quản lý chính** của UTM đó.

**Tên UTM không phân biệt hoa/thường và dấu**, nên `Mua` và `Múa` là một. Dấu gạch thì có phân biệt: `FB-Q4` và `FB_Q4` là hai UTM khác nhau. Nếu tên đã có, hệ thống báo tên đó đã tồn tại và nhắc nhờ Quản lý chính hiện tại thêm bạn làm Quản lý phụ. Khoảng trắng thừa và các ký tự khoảng trắng lạ (hay dính khi dán từ Excel, Zalo) được tự dọn. Việc tạo UTM bị giới hạn **30 lần mỗi giờ** (tính theo địa chỉ mạng); vượt quá sẽ bị từ chối tạm thời.

Bạn cũng có thể tạo nhanh ngay ở ô **UTM** của form khách hàng bằng lựa chọn **Tạo UTM mới** (cần quyền Tạo). Ô này tìm theo tên và có nhóm **Dùng gần đây**.

**Riêng tư** nghĩa là chỉ Quản lý chính, Quản lý phụ và người có quyền xem rộng chọn được UTM này cho khách. Người khác thử chọn sẽ bị từ chối "Bạn không có quyền dùng UTM …".

### 2. Sửa một UTM

1. Bấm **Sửa** ở dòng UTM (nút chỉ hiện khi bạn có quyền sửa UTM đó).
2. Đổi các ô được phép. Nếu bạn chỉ là Quản lý phụ, ô **Tên** và **Hiển thị** bị xám.
3. Bấm **Lưu**. Thông báo "Đã cập nhật UTM".

> **Đổi tên UTM cập nhật luôn tên trên mọi khách đang dùng.** Khác với [Quản lý nguồn](/huong-dan/nguon-media), khách cũ không bị lệch tên. Việc này **không** làm đổi cột "Sửa cuối" của các khách đó. Tên mới vẫn phải khác mọi UTM đã có.

### 3. Khoá và mở khoá

1. Bấm **Khoá** ở dòng UTM, xác nhận **Khoá**. Thông báo `Đã khoá UTM "tên"`.
2. UTM chuyển sang tab **UTM đã khoá**, kèm **Ngày khoá**.
3. Muốn dùng lại, vào tab đó, bấm **Mở khoá**.

UTM đã khoá **không ai chọn được cho khách mới**, kể cả khi gọi từ nơi khác ngoài giao diện: hệ thống từ chối với thông báo UTM đã bị khoá. Khách cũ đang dùng UTM đó **giữ nguyên**. Khoá là cách nên dùng khi chiến dịch đã dừng nhưng vẫn có dữ liệu.

### 4. Khoá, mở khoá hoặc xoá nhiều UTM cùng lúc

Đánh dấu ô vuông ở đầu các dòng, thanh thao tác hàng loạt hiện ra với nút **Khoá (n)** hoặc **Mở khoá (n)** và **Xoá (n)**. Dòng bạn không có quyền sửa lẫn xoá thì không đánh dấu được. Hệ thống xử lý từng UTM một và tự kiểm quyền từng UTM: UTM nào lỗi sẽ được liệt kê kèm lý do trong một hộp thoại, các UTM còn lại vẫn xong bình thường. Dòng thành công được bỏ chọn, dòng lỗi giữ lại để bạn thử lại.

### 5. Xem và gỡ UTM khỏi khách hàng

Bấm **Khách hàng (n)** ở dòng UTM để mở danh sách khách của UTM. Trong hộp thoại:

- Tìm theo **tên hoặc SĐT**, lọc theo **Trạng thái**.
- Người có quyền **Thùng rác** còn thấy bộ lọc **Tất cả (kể cả Thùng rác)**, **Đang dùng** hoặc **Chỉ Thùng rác**, và khôi phục hoặc xoá vĩnh viễn khách ngay tại đây (xoá vĩnh viễn cần quyền riêng).
- Người có quyền **Sửa khách hàng** thấy nút **Sửa nhanh** (mở form khách) và **Gỡ UTM**.

**Gỡ UTM** khiến khách không còn thuộc UTM này, dữ liệu khác của khách giữ nguyên. Thông báo `Đã gỡ UTM khỏi khách hàng "tên"`. Muốn gỡ nhiều khách, đánh dấu rồi bấm gỡ hàng loạt (chỉ trong trang đang xem).

Quản lý một UTM **không mở rộng quyền xem khách**: danh sách này luôn chỉ gồm khách thuộc phạm vi **Xem khách hàng** của bạn.

## Gộp UTM

Khi hai UTM thực chất là một (ví dụ `FB-Q4` và `FB_Q4`), dùng **Gộp** để dồn về một UTM chuẩn.

```az-demo
utm-merge-steps
```

1. Bấm **Gộp** ở dòng UTM **muốn bỏ** (UTM nguồn).
2. Chọn **UTM đích** trong ô **Gộp vào UTM đích**. UTM đang khoá hiện mờ và không chọn được.
3. Đọc cảnh báo **Không thể hoàn tác**, bấm **Gộp**.
4. Thông báo `Đã gộp "nguồn" vào "đích" — chuyển N khách hàng`.

Kết quả: toàn bộ khách của UTM nguồn (**kể cả khách đang ở Thùng rác**) chuyển sang UTM đích và mang tên UTM đích; UTM nguồn bị **xoá**, cùng danh sách Quản lý phụ của nó. Quản lý chính/phụ của UTM đích giữ nguyên. Việc này **không hoàn tác được**, nên hãy kiểm tra kỹ trước khi bấm. Nguồn và đích phải khác nhau, và đích phải đang mở.

### Tab Gợi ý trùng

Tab này liệt kê các nhóm UTM có tên **gần giống** (khác dấu, gạch nối, gạch dưới, khoảng trắng, hoa/thường: `FB-Q4`, `FB_Q4`, `fbq4` cùng nhóm). **Hệ thống không tự gộp**: bạn quyết định UTM nào là bản chuẩn. Mỗi dòng có nút **Gộp vào "tên"**, trong đó "tên" là UTM đang có **nhiều khách nhất** của nhóm (số khách ở đây không tính Thùng rác). Bấm vào để mở hộp thoại Gộp với đích đã chọn sẵn, bạn vẫn đổi được.

## Xoá một UTM

1. Bấm nút thùng rác ở dòng UTM (chỉ người có quyền Xoá thấy, mặc định là Admin).
2. Xác nhận **Xoá**. Thông báo `Đã xoá UTM "tên"`.

Chỉ xoá được UTM **không còn khách nào dùng, tính cả khách trong Thùng rác**. Nếu còn, hệ thống từ chối kèm số khách đang dùng và số khách trong Thùng rác, gợi ý **Khoá** hoặc **Gộp** thay vì xoá. Khác với [Quản lý Status khách](/huong-dan/status-khach), ở đây không có bước chọn UTM thay thế.

> Con số ở nút **Khách hàng (n)** không tính Thùng rác, nên có thể hiện 0 mà vẫn không xoá được UTM. Hãy mở **Khách hàng**, chọn **Chỉ Thùng rác** để xem và xử lý các khách đó.

## Tab Thống kê

Tab này cho biết các khách nhập trong một khoảng ngày đang ở những trạng thái nào, theo từng UTM.

- Phạm vi UTM hiển thị ở đầu tab ("Tất cả UTM", "UTM thuộc phòng ban bạn quản lý…" hoặc "UTM bạn là Quản lý chính/phụ"). Số liệu tính theo **Ngày nhập khách** và **trạng thái hiện tại** của khách, và **chỉ đếm khách bạn được xem**.
- Mặc định là **30 ngày gần nhất**. Chọn khoảng khác ở ô ngày hoặc dùng gợi ý nhanh (7 ngày qua, 30 ngày qua, Tháng này, Tháng trước, 90 ngày qua). Không chọn được ngày trong tương lai.
- Bộ lọc nhanh: **Quản lý chính**, **Quản lý phụ**, **UTM hoạt động**, **UTM đã khoá**.
- Các thẻ **Khách trong kỳ**, **UTM được thống kê** và số khách theo từng trạng thái kèm tỷ lệ %. Biểu đồ chuyển được giữa **Số lượng** và **Tỷ lệ %**; khoảng trên 92 ngày thì biểu đồ gộp theo **tháng** thay vì theo ngày.
- Màu tỷ lệ: dưới 30% đỏ, từ 30 đến 70% vàng, trên 70% xanh.
- Bấm vào cột biểu đồ hoặc thẻ số liệu để xem danh sách khách tương ứng ngay tại tab.

## Quy tắc & lưu ý nghiệp vụ

- **Tên UTM duy nhất**, không phân biệt hoa/thường và dấu, nhưng có phân biệt gạch nối và gạch dưới.
- **Khoá có hiệu lực thật ở hệ thống**, không chỉ ở giao diện: không chọn UTM đã khoá cho khách mới được. Khách giữ UTM đang có thì không bị kiểm lại.
- **Nhập Excel dùng cột "Chiến dịch" làm UTM.** Hệ thống khớp theo tên UTM. Tên chưa có thì tự tạo UTM mới nếu người nhập có quyền Tạo UTM, nếu không thì dòng đó báo lỗi. Dòng dùng UTM đang khoá hoặc UTM Riêng tư mà người nhập không được dùng cũng báo lỗi.
- **Đổi tên cập nhật tên trên mọi khách**; **Gộp** cũng đổi tên trên khách chuyển sang.
- **Xoá và Gộp đều tính cả khách trong Thùng rác.**
- Người tạo UTM tự là **Quản lý chính**. Chuyển Quản lý chính không giữ lại người cũ làm phụ.
- Mọi thao tác tạo, sửa, khoá, mở khoá, xoá, gộp và đổi Quản lý chính/phụ đều được ghi vào **Nhật ký hệ thống**.

## Vì sao tôi không thấy …?

- **Không có mục Quản lý UTM ở menu, hoặc bị đưa về trang chủ**: bạn thiếu quyền **Vào trang Quản lý UTM** hoặc **Xem khách hàng**. Liên hệ Admin.
- **Không thấy tab Tất cả UTM và Thống kê**: bạn thiếu quyền **Xem UTM**. Bạn vẫn dùng được tab **UTM của tôi** và **UTM đã khoá**.
- **Không thấy nút Tạo UTM**: bạn thiếu quyền **Tạo UTM**.
- **Không thấy nút Sửa hoặc Khoá ở một dòng**: bạn không phải Quản lý chính/phụ của UTM đó và quyền Sửa của bạn không phủ tới nó.
- **Không thấy nút Gộp hoặc tab Gợi ý trùng**: chỉ người có quyền Sửa UTM phạm vi **Tất cả** (và quyền Xem UTM) mới có.
- **Không thấy nút xoá**: bạn thiếu quyền **Xoá UTM** (mặc định chỉ Admin).
- **Không thấy nút Thêm/Chuyển trong hộp thoại Quản lý**: chỉ Quản lý chính hoặc người có phạm vi rộng làm được.
- **Không chọn được một UTM ở form khách hàng**: UTM đó đang bị khoá, hoặc là UTM **Riêng tư** mà bạn không phải thành viên.
- **Khách của tôi không hiện trong danh sách Khách hàng của UTM**: danh sách chỉ gồm khách trong phạm vi **Xem khách hàng** của bạn.

## Xem thêm

- [Khách hàng](/huong-dan/khach-hang)
- [Quản lý nguồn](/huong-dan/nguon-media)
- [Quản lý Status khách](/huong-dan/status-khach)
