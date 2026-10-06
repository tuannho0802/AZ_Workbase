---
title: Báo cáo data lỗi
slug: bao-cao-data-loi
sortOrder: 100
published: false
roles: []
positions: []
departments: []
permissions: [customers.invalid_report]
---

## Trang này để làm gì

Trang **Báo cáo data lỗi** (tên đầy đủ trên trang là *Báo cáo dữ liệu không hợp lệ*) giúp bạn **tìm ra những khách hàng nhập sai, nhập thiếu hoặc bị nhập trùng** để rà soát và sửa. Trang chỉ **liệt kê và thống kê**, không tự sửa, gộp hay xóa khách nào.

Trang có 2 tab:

- **Danh sách**: xem từng khách đang có lỗi, lọc theo nhiều điều kiện.
- **Thống kê**: xem lỗi trùng SĐT/Email phát sinh nhiều hay ít theo thời gian, do ai nhập, ở nhóm nào.

## Ai dùng được

| Việc | Quyền cần có | Mặc định |
|---|---|---|
| Thấy mục **Báo cáo data lỗi** ở menu, mở cả 2 tab | `customers.invalid_report` | Chỉ Admin |

Quyền này **không có phạm vi riêng** (không có Của tôi / Phòng ban / Tất cả). Theo code hiện tại:

- **Admin** thấy mọi khách trong báo cáo.
- **Vai trò khác được Admin cấp quyền** chỉ thấy khách **liên quan đến mình**: khách do mình tạo, mình là Sales phụ trách, mình là Marketing phụ trách, hoặc mình đang được chia (lượt chia còn hiệu lực).

Phạm vi này áp dụng cho **mọi con số**: danh sách, số trên menu và tab Thống kê. Vì vậy người không phải Admin có thể thấy **ít lỗi hơn** Admin, và một cặp khách chỉ được tính là "trùng" khi **cả hai** đều nằm trong phạm vi bạn xem.

Người không có quyền sẽ không thấy mục này ở menu. Nếu gõ thẳng địa chỉ trang, bạn bị đưa về trang Khách hàng kèm thông báo "Bạn không có quyền truy cập trang này".

## Các loại lỗi

Ô **Loại kiểm tra** có 5 lựa chọn, mỗi loại có biểu tượng riêng:

| Loại | Khách bị tính là lỗi khi... |
|---|---|
| ⚠️📞 **Trùng số điện thoại** | Có từ 2 khách (chưa bị xóa) cùng một SĐT. SĐT được so **nguyên văn**, nên `0901234567` và `0901 234 567` là hai giá trị khác nhau, không bị tính trùng |
| ⚠️✉️ **Trùng email** | Có từ 2 khách cùng một email. Email được so sau khi bỏ khoảng trắng hai đầu và **không phân biệt hoa thường** (`A@Gmail.com` trùng `a@gmail.com`) |
| 📵 **Thiếu số điện thoại** | Ô SĐT để trống |
| 📭 **Thiếu email** | Ô Email để trống |
| 📅 **Ngày nhập lớn hơn hiện tại** | **Ngày nhập data** của khách là một ngày sau hôm nay (giờ Việt Nam) |

Điểm cần biết:

- **Không tính trùng Tên.** Hai khách trùng tên là chuyện bình thường nên không bị coi là lỗi.
- Khách đang nằm trong [Thùng rác](/huong-dan/thung-rac) **không được tính** ở mọi loại.
- SĐT hoặc Email để trống **không** bị tính là "trùng" với nhau (chúng thuộc loại Thiếu).
- Khi mới mở trang (hoặc bấm F5), trang luôn vào thẳng loại **Trùng số điện thoại** vì đây là loại hay dùng nhất.

## Bắt đầu nhanh

1. Mở **Báo cáo data lỗi** ở menu. Số trên huy hiệu của mục menu là **số khách hàng** (số dòng) đang có lỗi **trùng SĐT** trong phạm vi bạn xem, không phải số nhóm trùng.
2. Ở tab **Danh sách**, chọn **Loại kiểm tra** cần rà.
3. Thu hẹp bằng các bộ lọc nếu cần (ví dụ chỉ xem khách của một Marketing).
4. Với lỗi trùng, đọc cột **Trùng với ai**: bấm vào tên một khách trùng để mở khách đó ở trang Khách hàng.
5. Sửa, gộp hoặc xóa bớt ở trang [Khách hàng](/huong-dan/khach-hang). Báo cáo sẽ cập nhật lần tải sau (bấm **Làm mới**).

## Tab Danh sách

```az-demo
invalid-data-table type=duplicate
```

**Tiêu đề và các thẻ:** góc trên bên phải hiện số **khách hàng** đang có lỗi (thẻ xanh dương). Ở loại trùng còn có thẻ cam **N nhóm trùng**. Hai số này khác nhau: *N nhóm trùng* là số **giá trị SĐT/Email** đang bị lặp, còn *khách hàng* là số **dòng**, vì một giá trị trùng thường ứng với từ 2 khách trở lên.

**Khung cảnh báo (chỉ ở loại trùng):** màu vàng "Phát hiện N … bị trùng" khi có trùng, màu xanh "Không phát hiện … nào bị trùng" khi sạch. Báo cáo chỉ liệt kê; việc gộp hay xóa bạn tự quyết.

### Cột trên bảng

| Cột | Ý nghĩa |
|---|---|
| Khách hàng | Tên khách, kèm email nhỏ phía dưới (ở loại Trùng email thì email đã nằm ở cột nhóm nên không lặp lại) |
| Số điện thoại / Email (trùng lặp) | Ở loại trùng: các khách **cùng giá trị** được tô cùng màu Tag và **gộp thành một ô**. Ở loại Trùng email, email sai cú pháp (thiếu `@` hoặc thiếu tên miền) có thêm Tag đỏ **Sai định dạng** |
| Trùng với ai | Chỉ ở loại trùng: tên các khách khác cùng giá trị (hiện tối đa 2 tên, còn lại gộp thành **+N**, rê chuột để xem đủ). Bấm tên để mở khách đó ở trang Khách hàng |
| Ngày nhập data | Ngày do người nhập tự chọn (chỉ có ngày) |
| Ngày nhập thực tế | Thời điểm khách thật sự được tạo trong hệ thống (có giờ phút) |
| Trạng thái | Trạng thái khách, tô đúng màu đã cấu hình |
| Sales / Marketing phụ trách | Người phụ trách; hiện **Chưa gán** nếu chưa có |
| Người tạo | Người nhập khách; hiện **Hệ thống** nếu không có người tạo |
| Đã tham gia nhóm | **Chưa join** hoặc tên nhóm đầu tiên, các nhóm còn lại gộp thành **+N** |

**Thứ tự:** mặc định xếp theo **Ngày nhập thực tế**, mới nhất lên đầu. Ở loại trùng, các dòng cùng một cụm luôn đứng **liền nhau**; cụm nào có khách mới nhập gần đây nhất sẽ lên trên. Mỗi trang 20 dòng.

### Bộ lọc

Mọi bộ lọc tự áp dụng ngay khi bạn chọn (riêng ô tìm kiếm bấm Enter hoặc biểu tượng tìm).

| Bộ lọc | Cách dùng |
|---|---|
| **Loại kiểm tra** | Chọn 1 trong 5 loại ở trên |
| **Trạng thái** | Theo trạng thái khách |
| **Sales phụ trách / Marketing phụ trách** | Chọn từ danh sách người thuộc nhóm phụ trách tương ứng |
| **Người tạo** | Chỉ gồm những người đã từng tạo ít nhất 1 khách |
| **Nhóm cụ thể** | Chọn một nhóm liên kết (kể cả nhóm đã ẩn, có hậu tố "(đã ẩn)") |
| **Đã tham gia nhóm** | Khi chưa chọn nhóm cụ thể: "Đã joined ít nhất 1 nhóm" hoặc "Chưa joined nhóm nào". Khi đã chọn nhóm cụ thể: "Đã/Chưa joined nhóm này" |
| **Ngày nhập** | Lọc theo **Ngày nhập data** |
| **Ngày nhập thực tế** | Lọc theo thời điểm tạo thật |
| **Tìm kiếm** | Khớp theo tên, email, tên chiến dịch, hoặc SĐT (SĐT thường khớp theo **phần đầu** chuỗi bạn gõ) |
| **Xóa bộ lọc** | Chỉ hiện khi đang có bộ lọc; đưa các bộ lọc về ban đầu (không đổi Loại kiểm tra) |
| **Làm mới** | Tải lại danh sách |

> **Lọc ở loại trùng hoạt động theo cụm.** Một cụm trùng được giữ lại nếu **có ít nhất 1 khách** thỏa **tất cả** bộ lọc đang bật, và khi đó trang hiện **đủ mọi khách trong cụm** (kể cả khách không thỏa bộ lọc). Nhờ vậy bạn luôn thấy trọn cả cặp đang trùng. Ví dụ: lọc Sales = An sẽ ra cả khách của Bình nếu họ trùng SĐT với một khách của An.

## Tab Thống kê

```az-demo
invalid-stats
```

Tab này đo **mức độ lỗi trong một kỳ**. Nó chỉ tải khi bạn mở tab, và dùng cùng quyền với tab Danh sách.

**Kỳ thống kê** áp cho **mọi thẻ, biểu đồ và bảng** bên dưới, tính theo **Ngày nhập thực tế** (giờ Việt Nam). Các mốc có sẵn: 7 ngày, 30 ngày (mặc định), 90 ngày, Tháng này, Tháng trước, Tuỳ chọn, Toàn bộ. Kỳ Tuỳ chọn tối đa **366 ngày**; chọn dài hơn thì hệ thống tự lùi ngày bắt đầu và báo bạn.

**Đối tượng thống kê** chuyển giữa 📞 Số điện thoại và ✉️ Email cho phần chi tiết trùng.

### Hiểu "bản gốc" và "bản dư"

Với mỗi SĐT/Email trùng, khách được nhập **sớm nhất** là **bản gốc** (kể cả nhập ngoài kỳ). Các khách nhập **sau** là **bản dư**. Thống kê đếm **bản dư có ngày nhập thực tế nằm trong kỳ**, tức số bản trùng *phát sinh thêm* trong kỳ, chứ không phải toàn bộ trùng tồn đọng. Muốn xem toàn bộ trùng đang có, dùng tab Danh sách.

### 5 thẻ tổng quan

- **Thẻ Trùng SĐT / Trùng email:** số lớn là **bản trùng phát sinh** trong kỳ, kèm số nhóm. Bấm thẻ để chọn đối tượng xem chi tiết bên dưới.
- **Thẻ Thiếu SĐT / Thiếu email / Ngày nhập > hiện tại:** số khách nhập trong kỳ bị lỗi đó, kèm tỷ lệ phần trăm trên số khách nhập trong kỳ. Bấm thẻ để **mở tab Danh sách** với đúng loại lỗi và đúng khoảng ngày đang xem.
- Số màu đỏ khi lớn hơn 0, màu xanh khi bằng 0.

### Chi tiết loại trùng đang chọn

| Phần | Nội dung |
|---|---|
| **Tỷ lệ nhập trùng** | Bản dư trong kỳ chia cho số khách nhập trong kỳ có SĐT/Email. Đỏ từ 5%, cam từ 1%, xanh dưới 1% |
| **Bản ghi trùng phát sinh** | Số bản dư trong kỳ, kèm mức tăng giảm so với **kỳ liền trước cùng độ dài** (không có khi chọn Toàn bộ) |
| **Số SĐT/Email bị trùng** | Số cụm và số khách liên quan |
| **Cụm lớn nhất** | Cụm có nhiều bản ghi nhất |
| **Trùng khác Sales / khác Marketing / nằm nhiều nhóm** | Số cụm có từ 2 Sales (hoặc 2 Marketing, hoặc ≥ 2 nhóm liên kết) khác nhau. Đây là các cụm đáng lo nhất, vì nguy cơ 2 người cùng chăm 1 khách mà không biết |
| **Biểu đồ xu hướng** | Số bản dư theo **ngày** (kỳ tới 92 ngày) hoặc theo **tháng** (kỳ dài hơn). Đột biến thường do một đợt nhập hàng loạt |
| **Mức độ nghiêm trọng** | 3 biểu đồ tròn theo Sales, theo Marketing, theo Nhóm liên kết |
| **Top người nhập / Top Marketing** | Tối đa 10 người có nhiều bản dư nhất trong kỳ, gợi ý ai cần được nhắc kiểm tra khách đã tồn tại trước khi nhập |
| **Phân bố kích thước cụm** | Số cụm theo số bản ghi |
| **Nhóm liên kết bị trùng khách nhiều nhất / Cặp nhóm trùng chung** | Cho biết nhóm nào, cặp nhóm nào hay bị nhập lại khách |
| **Top cụm trùng nhiều nhất** | Tối đa 10 SĐT/Email trùng nhiều nhất. Bấm **Xem** để sang tab Danh sách với giá trị đó đã điền sẵn vào ô tìm kiếm |

Hai khung cảnh báo có thể xuất hiện: số khách có **Ngày nhập thực tế ở tương lai** (không thuộc kỳ nào kết thúc trước đó nên không có trong số liệu; bấm **Xem toàn bộ** để thấy), và số bản dư **chưa gán Marketing** (không quy được trách nhiệm cho ai).

## Quy tắc và lưu ý

- **Trang chỉ để rà soát.** Không có nút sửa, gộp hay xóa ngay trên trang này. Hãy bấm tên ở cột **Trùng với ai** hoặc vào trang [Khách hàng](/huong-dan/khach-hang) để xử lý.
- **Chưa có xuất Excel** cho báo cáo này.
- **Tab Danh sách và tab Thống kê không cùng một cách đếm.** Danh sách cho thấy **mọi** cụm trùng đang tồn tại (không phụ thuộc kỳ); Thống kê chỉ đếm bản dư **phát sinh trong kỳ**. Hai con số vì thế khác nhau là bình thường.
- **Số trên menu** luôn là số khách của loại Trùng SĐT, không thay đổi theo loại bạn đang xem.
- **Nguyên nhân trùng thường gặp:** người nhập không thấy khách đã có (vì mỗi người chỉ xem được data của mình) nên nhập lại, hoặc cùng một khách được nhập lại mỗi khi vào một nhóm liên kết mới. Form thêm khách có kiểm tra và cảnh báo SĐT/Email đã tồn tại trước khi lưu.
- **Một khách đã bị xóa (vào Thùng rác) hoặc đã sửa SĐT/Email** sẽ tự biến khỏi báo cáo ở lần tải sau.
- Admin có thể đổi quyền ở trang **Phân quyền**, nên thực tế công ty bạn có thể khác bảng mặc định ở trên.

## Vì sao tôi không thấy...?

- **Không có mục Báo cáo data lỗi ở menu:** vai trò của bạn không có quyền `customers.invalid_report`.
- **Tôi thấy ít lỗi hơn Admin:** nếu bạn không phải Admin, báo cáo chỉ tính khách liên quan đến bạn (xem mục *Ai dùng được*).
- **Hai khách giống hệt SĐT nhưng không thấy họ là trùng:** SĐT được so nguyên văn; khác khoảng trắng hay ký tự đều không tính trùng. Hoặc một trong hai khách nằm ngoài phạm vi bạn xem, hoặc đã nằm trong Thùng rác.
- **Danh sách trống dù huy hiệu menu có số:** kiểm tra bộ lọc đang bật (đặc biệt **Ngày nhập thực tế**) và bấm **Xóa bộ lọc**.
- **Tab Thống kê không có số liệu của khách cũ:** khách nhập ngoài kỳ không được đếm. Chọn **Toàn bộ** hoặc kéo dài kỳ.
- **Số khách và số "nhóm trùng" lệch nhau:** bình thường, một nhóm trùng gồm từ 2 khách trở lên.
- **Không tìm thấy khách bằng SĐT:** ô tìm kiếm thường khớp SĐT theo **phần đầu**, hãy gõ từ số đầu tiên.

## Xem thêm

- [Khách hàng](/huong-dan/khach-hang)
- [Thùng rác](/huong-dan/thung-rac)
- [Chia data](/huong-dan/chia-data)
