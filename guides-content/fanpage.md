---
title: Quản lý Fanpage
slug: fanpage
sortOrder: 65
published: true
roles: []
positions: []
departments: []
permissions: [fanpages.view]
---

## Trang này để làm gì

Mỗi nhân viên có thể phụ trách nhiều **Page** (kênh) trên Facebook, TikTok, Instagram... Trang **Quản lý Fanpage** giúp bạn trả lời nhanh bốn câu hỏi:

- **Hôm nay tôi cần đăng bài ở Page nào?** (tab **Hôm nay**)
- **Page nào đang bị bỏ quên hoặc sắp trễ mục tiêu tuần?** (tab **Danh sách**)
- **Follower và bài đăng tăng giảm ra sao?** (tab **Nhập số liệu** và **Thống kê**)
- **Page nào mang về khách hàng?** (khối **Page → Khách & Tiền nạp**)

Mỗi Page là **một link**, thuộc **một nền tảng** và có **một hoặc nhiều người phụ trách**.

## Ai dùng được & thấy gì

Vào trang cần quyền **Xem Fanpage** (`fanpages.view`). Phạm vi xem tính theo **người phụ trách** Page:

| Phạm vi | Thấy các Page |
|---|---|
| Của tôi | Page mình phụ trách |
| Phòng ban | Page mình phụ trách + Page của nhân viên thuộc phòng ban mình quản lý |
| Tất cả | Mọi Page |

Theo cấu hình mặc định: Admin / Assistant xem **Tất cả**, Manager xem **Phòng ban**, Employee xem **Của tôi**. Phạm vi thật do Admin cấu hình ở trang **Phân quyền** nên có thể khác.

Các tab và nút chỉ hiện khi bạn có quyền tương ứng:

| Bạn thấy | Cần quyền | Mặc định |
|---|---|---|
| Tab **Hôm nay**, **Danh sách**, **Đã lưu trữ** | `fanpages.view` | Cả 4 vai trò |
| Tab **Nhập số liệu** | `fanpage_metrics.manage` | Cả 4 vai trò |
| Tab **Thống kê** | `fanpage_stats.view` | Cả 4 vai trò |
| Khối **Xếp hạng đóng góp** | `fanpage_rankings.view` | Admin, Assistant, Manager (Employee không có) |
| Cột **Tiền nạp** trong thống kê | `fanpage_revenue.view` (và thêm điều kiện ở mục *Quy tắc*) | Admin, Assistant, Manager |
| Nút **Xuất Excel** | `fanpages.export` | Cả 4 vai trò |
| Nút **Nền tảng** / **Tình trạng** / **Loại bài** | `fanpage_platforms.manage` / `fanpage_statuses.manage` / `fanpage_post_types.manage` | Admin, Assistant |
| Nút **Thêm Page** | `fanpages.create` | Cả 4 vai trò |

Người chỉ có phạm vi **Của tôi** mở trang là vào thẳng tab **Hôm nay**; người xem phạm vi rộng hơn vào tab **Danh sách**. Các nút Sửa, Xoá, thêm/sửa bài đăng và ghi chú chỉ hiện khi bạn có quyền tương ứng **trên đúng Page đó**.

## Bắt đầu nhanh

1. Bấm **Thêm Page**, chọn **Nền tảng**, nhập **Tên Page** và **Link Page** (bắt đầu bằng `http://` hoặc `https://`), có thể đặt **mục tiêu số bài mỗi tuần**, rồi bấm **Thêm**.
2. Mỗi ngày mở tab **Hôm nay**: Page nào cần đăng sẽ nằm trong mục **Cần đăng bài**. Bấm **Thêm bài**, dán URL bài vừa đăng (ngày mặc định là hôm nay) rồi lưu — Page tự chuyển xuống mục đã đăng.
3. Mỗi tuần mở tab **Nhập số liệu**, nhập follower (và reach, tương tác, lượt xem nếu có) cho các Page, bấm **Lưu**.
4. Mở tab **Thống kê** để xem biểu đồ tăng trưởng, số bài theo tuần và top bài.

## Các tab trên trang

### Hôm nay

Danh sách việc cần làm của bạn: các Page đang theo dõi mà **chưa đăng hôm nay**.

- **Cần đăng bài**: Page im lặng hoặc có nguy cơ trễ mục tiêu tuần, kèm số ngày còn lại trong tuần (tính cả hôm nay).
- **Đã đăng hôm nay** và **Đang ổn**: thu gọn bên dưới.
- Chỉ cần **một** người phụ trách đăng là Page biến mất khỏi danh sách của **tất cả** người phụ trách Page đó.
- Hết việc sẽ hiện *"Hôm nay không còn Page nào cần đăng gấp"*.
- Mục **Fanpage** ở thanh bên có **số đỏ** = số Page đang cần hành động (cùng nguồn với tab này).

### Danh sách

Phía trên là các **thẻ thống kê** — bấm vào thẻ để lọc bảng, bấm lần nữa để bỏ lọc:

| Thẻ | Nghĩa |
|---|---|
| Tổng Page | Số Page (kèm số đang theo dõi) |
| Im lặng | Lâu chưa có bài mới |
| Nguy cơ trễ tuần | Phải đăng mỗi ngày còn lại mới kịp mục tiêu tuần |
| Đã đăng hôm nay | Số Page đã có bài hôm nay |
| Bài tuần này | Số bài từ Thứ Hai đến nay (kèm số bài 30 ngày) |
| Follower 30 ngày | Tăng giảm follower trong 30 ngày |
| Chưa có người phụ trách | Người phụ trách đã nghỉ hoặc bị khoá |

**Bộ lọc**: ô tìm theo tên hoặc link Page, **Nền tảng**, **Người phụ trách** (chỉ hiện khi bạn xem được Page của người khác), **Tình trạng Page**, **UTM**, **Theo dõi**.

**Cột trong bảng**:

- **Nhịp đăng**: thanh `số bài tuần này / mục tiêu`, kèm "đăng gần nhất" và trạng thái. Di chuột để xem ngày đăng cuối, chuỗi ngày liên tiếp, tổng bài và số bài 30 ngày.
- **Tình trạng**: tình trạng thực của Page ngoài đời (ví dụ Bình thường, Bị hạn chế, Bị khoá...).
- **Người phụ trách**: người đầu tiên là người phụ trách chính.

Menu **⋯** ở mỗi dòng có **Lưu trữ** (và **Xoá vĩnh viễn** ở tab **Đã lưu trữ**).

**Trạng thái nhịp đăng** (luôn kèm biểu tượng và chữ, không chỉ màu):

| Trạng thái | Khi nào |
|---|---|
| ⏸ Tạm ngừng | Page không còn được theo dõi |
| ✦ Mới | Page mới tạo, chưa quá hạn chờ bài đầu tiên |
| ⚠ Im lặng | Chưa đăng bài quá số ngày quy định (mặc định **3 ngày**) |
| ◔ Nguy cơ trễ | Còn thiếu bài so với mục tiêu tuần và số bài thiếu ≥ số ngày còn lại |
| ✓ Ổn | Còn lại |

### Nhập số liệu

Lưới nhập nhanh theo ngày: mỗi dòng là một Page, các cột Follower, Reach, Tương tác, Lượt xem và Ghi chú.

- Số **trong ngoặc mờ** là lần nhập trước để bạn so sánh.
- Có thể **dán nhiều dòng/cột từ Excel** vào ô đầu tiên; dùng Tab/Enter để di chuyển ô.
- Chọn **Page chưa nhập** để chỉ thấy Page còn thiếu ngày đó, hoặc **Tất cả**.
- Dòng lỗi được tô viền đỏ và nêu lý do; **dòng hợp lệ vẫn được lưu**.
- Số **giảm hơn 50%** so với lần trước bị coi là có thể gõ nhầm: hệ thống hỏi lại, bạn xác nhận mới lưu.
- Nếu người khác vừa sửa cùng ô trước bạn, hệ thống báo để bạn tải lại thay vì ghi đè âm thầm.
- Đổi ngày hoặc rời tab khi chưa lưu sẽ có hộp xác nhận bỏ thay đổi.

Số liệu do nhân viên **nhập tay**, không tự lấy từ Facebook/TikTok.

### Thống kê

Chọn kỳ **30 ngày**, **90 ngày** hoặc **12 tháng** ở đầu tab. Mỗi khối tải riêng nên một khối lỗi không làm hỏng khối khác:

- **Tăng trưởng follower**: tổng và so sánh giữa các Page. Page không có số liệu đúng ngày dùng **giá trị gần nhất trước đó**; Page chưa từng nhập số liệu được ghi chú riêng và không làm sai tổng.
- **Số bài theo tuần**: số bài mỗi tuần so với mục tiêu.
- **Top bài**: các bài có nhiều thích + bình luận + chia sẻ nhất (chỉ tính bài đã nhập số liệu).
- **Page → Khách & Tiền nạp**: xem mục bên dưới.
- **Xếp hạng đóng góp**: chỉ hiện khi bạn có quyền xem xếp hạng.

#### Page → Khách & Tiền nạp

Bảng cho biết mỗi Page mang về bao nhiêu khách, dựa trên **UTM** gắn cho Page (xem tab **UTM** trong khung chi tiết).

- Một UTM có thể gắn cho nhiều Page nhưng chỉ có **một Page chính**. Chỉ **Page chính** được ghi công khách và tiền; các Page còn lại hiện ở cột **Tham gia** với nhãn *"Dùng chung — không cộng vào Tổng"*.
- Dòng **Tổng** đếm khách **khác nhau** (không cộng các dòng), nên luôn bằng tổng cột ghi công của các Page chính.
- Dòng **Chưa quy về Page**: khách không có UTM, hoặc UTM chưa có Page chính (chỉ người xem phạm vi rộng thấy).
- Số khách tính **theo phạm vi dữ liệu khách hàng của bạn**: hai người cùng xem một Page có thể thấy số khác nhau.
- Khách tính theo **ngày nhập khách**, tiền theo **ngày nạp**.

#### Xếp hạng đóng góp

Xếp hạng người phụ trách có đóng góp dữ liệu trong kỳ, gồm **Số bài đã ghi**, **Lần nhập số liệu**, **Số Page** và **% tuần đạt nhịp**. Không có điểm tổng hợp ẩn, không có khách hay tiền. Bấm tiêu đề cột để đổi cách sắp xếp.

- Chỉ tính **người phụ trách Page** và dữ liệu do **chính họ** ghi. Người nhập hộ không phụ trách Page không lên hạng (dữ liệu vẫn được lưu).
- Bài trùng link chỉ tính một lần; sửa lại số liệu không tính thêm.
- Thứ hạng tính **trong nhóm người bạn được phép xem**: phạm vi *Của tôi* chỉ thấy dòng của mình.

### Đã lưu trữ

Page đã đóng hẳn: ẩn khỏi danh sách chính, bị loại khỏi thống kê và nhắc việc nhưng **giữ nguyên toàn bộ lịch sử**. Có thể **Bỏ lưu trữ** bất cứ lúc nào. **Xoá vĩnh viễn** chỉ làm được từ tab này.

## Khung chi tiết của một Page

Bấm tên Page để mở. Các tab:

- **Tổng quan**: nhịp tuần, chuỗi ngày đăng liên tiếp, follower, biểu đồ nhiệt 12 tuần và mục tiêu đăng mỗi tuần (sửa tại chỗ).
- **Thông tin**: nền tảng, link, người phụ trách, theo dõi, tình trạng.
- **Bài đăng**: thêm, sửa, xoá bài; xem mục *Dán nhiều link*.
- **Số liệu**: biểu đồ follower của Page và bảng số liệu, có nút thêm số liệu.
- **UTM**: gắn hoặc gỡ UTM cho Page, đổi Page chính.
- **Data khách hàng**: chỉ hiện khi bạn có quyền xem Khách hàng.
- **Ghi chú tiến trình**: ghi lại diễn biến của Page.
- **Lịch sử**: ai đã đổi người phụ trách, tình trạng, trạng thái theo dõi hoặc lưu trữ, và khi nào.

### Dán nhiều link bài đăng

Trong tab **Bài đăng**, bấm **Dán nhiều link**: mỗi dòng một link (**tối đa 50 link** mỗi lần), chọn **Ngày đăng** và **Loại bài** chung cho cả lô. Bảng xem trước báo từng dòng:

- ✓ **Hợp lệ**
- ⚠ **Trùng trong danh sách** hoặc **Đã có trong Page** (kèm ngày của bài đã có)
- ✕ **Không phải link** hoặc **Link quá dài**

Bấm **Thêm N bài**: các dòng hợp lệ được ghi cùng lúc, dòng lỗi bị bỏ qua và hiện lý do.

### Loại bài

Mỗi bài có thể gán một **Loại bài** (ví dụ Tin tức, Review, Video) hiển thị bằng thẻ màu. Người có quyền bấm nút **Loại bài** để thêm, đổi tên, đổi màu, khoá/mở. Loại đã khoá không chọn được cho bài mới nhưng bài cũ vẫn giữ.

### Gắn UTM cho Page

- Page **đầu tiên** gắn một UTM tự thành **Page chính** của UTM đó.
- **Đổi Page chính** làm số liệu cả các kỳ cũ dồn sang Page chính mới — hộp xác nhận sẽ cảnh báo trước. Cần quyền sửa trên **cả hai** Page.
- **Gỡ UTM khỏi Page chính** khi UTM còn Page khác sẽ bị chặn: hãy chọn Page chính mới trước.
- UTM hạn chế mà bạn không có quyền dùng hiện tên *"UTM hạn chế"* và bị khoá, không gỡ được.

## Data khách hàng của Page (Lead)

Mở một Page → tab **Data khách hàng** (chỉ hiện khi bạn có quyền xem Khách hàng).

- **Thêm khách:** bấm **Thêm khách**, nhập Họ tên, **Số điện thoại (bắt buộc)**, Email, Nguồn, Ghi chú. Nếu để trống Nguồn, hệ thống dùng nền tảng của Page khi trùng với một nguồn đang mở; nếu không trùng bạn phải chọn nguồn.
- **Thêm từ Ghi chú tiến trình:** khi viết ghi chú, mở mục **＋ Thêm khách hàng từ ghi chú này** để tạo khách cùng lúc. Cần quyền ghi chú Page **và** quyền tạo Khách hàng.
- **Trùng số điện thoại:** hệ thống cảnh báo và **không lưu** (kể cả ghi chú). Khách cũ không tự gắn vào Page.
- **Bạn thấy gì:** danh sách theo phạm vi dữ liệu khách hàng của bạn — hai người có thể thấy số khách khác nhau trên cùng một Page.
- **Sửa/xoá khách:** bấm biểu tượng mở sang trang Khách hàng (đúng quyền sửa/xoá của bạn).
- **Tính vào thống kê Page:** khách nhập từ Page ghi công cho đúng Page đó (ưu tiên hơn UTM). Mỗi khách chỉ ghi công cho một Page nên tổng không bị đếm trùng.
- Page đã lưu trữ không thêm khách mới được — bỏ lưu trữ trước.

## Xuất Excel

Nút **Xuất Excel** (đầu trang) xuất file theo **bộ lọc đang áp dụng ở danh sách**:

- Sheet **Page** và **Bài đăng** — luôn có.
- Sheet **Số liệu** — khi bạn có quyền xem số liệu.
- Sheet **Khách & Tiền nạp** — khi bạn có quyền xem Thống kê **và** có phạm vi xem khách hàng; cột tiền chỉ có khi qua đủ điều kiện ở mục *Quy tắc*.
- Mỗi sheet tối đa **20.000 dòng**; vượt quá sẽ có ghi chú, hãy thu hẹp bộ lọc để xuất phần còn lại.

## Nhắc việc tự động

Hệ thống gửi thông báo cho **mọi người phụ trách** Page (tắt/bật trong trang tuỳ chọn thông báo):

- **Page im lặng**: khi Page vượt các mốc **3, 7, 14 và 30 ngày** chưa đăng — mỗi mốc nhắc đúng một lần.
- **Nguy cơ trễ tuần**: lần đầu Page rơi vào trạng thái nguy cơ trong tuần — nhắc một lần mỗi tuần.

Thông báo chỉ gửi **sau 17:00 giờ Việt Nam** cho Page chưa đăng hôm nay, để bạn có cả ngày để đăng. Bấm thông báo sẽ mở thẳng khung chi tiết của Page.

## Quy tắc & lưu ý nghiệp vụ

- **Link Page không được trùng** với Page khác trong hệ thống (dấu `/` ở cuối được bỏ qua khi so sánh). Link **bài đăng** cũng không được trùng trong cùng một Page.
- **Chỉ Page đang theo dõi mới được tính** vào thống kê, thẻ KPI, tab **Hôm nay** và nhắc việc. Page bị tắt **Theo dõi**, đã **lưu trữ** hoặc có tình trạng chặn (như *Bị khoá*, *Đã bỏ*) bị loại ra.
- Bài **không có ngày đăng** vẫn tính vào tổng bài nhưng không tính vào nhịp đăng — hãy luôn điền ngày (ô ngày mặc định là hôm nay).
- Người tạo Page mặc định là người phụ trách. Chỉ người có quyền Sửa Fanpage phạm vi **Phòng ban** hoặc **Tất cả** mới giao Page cho người khác (phòng ban: chỉ giao trong phòng ban mình quản lý).
- **Nền tảng, Tình trạng, Loại bài đã khoá** không chọn được cho dữ liệu mới; dữ liệu cũ vẫn hiện đúng. Các danh mục này không xoá được.
- **Xoá Page, bài đăng, ghi chú, số liệu** mặc định chỉ **Admin**. Xoá Page sẽ xoá luôn toàn bộ bài đăng, ghi chú và số liệu của Page đó — nên ưu tiên **Lưu trữ**.
- **Tiền nạp theo Page** chỉ hiện khi **đủ cả bốn điều kiện**: có quyền xem tiền nạp theo Page; khách nằm trong phạm vi xem khách hàng của bạn; tab **Tiền nạp** của khách hàng không bị Admin ẩn với bạn; và chỉ hiển thị **Tổng nạp**. Thiếu một điều kiện thì cột tiền **biến mất hoàn toàn** (không hiện số 0).

## Vì sao tôi không thấy …?

- **Không thấy tab Nhập số liệu / Thống kê / Xếp hạng, hoặc nút Xuất Excel, Nền tảng, Tình trạng, Loại bài**: tài khoản của bạn chưa được cấp quyền tương ứng — nhờ Admin kiểm tra ở trang **Phân quyền**.
- **Không thấy Page của đồng nghiệp**: phạm vi của bạn là *Của tôi* hoặc *Phòng ban*.
- **Không thấy cột Tiền nạp**: thiếu một trong bốn điều kiện ở mục *Quy tắc* — đây là chủ ý để không lộ dữ liệu.
- **Số khách của tôi khác số của đồng nghiệp trên cùng Page**: số khách tính theo phạm vi khách hàng của từng người.
- **Không thấy tab Data khách hàng**: bạn chưa có quyền xem Khách hàng.
- **Page biến mất khỏi danh sách**: kiểm tra tab **Đã lưu trữ**, hoặc bộ lọc **Theo dõi** đang bật.
- **Page không xuất hiện trong tab Hôm nay**: Page đã đăng hôm nay, đang ổn, hoặc không còn được theo dõi.
- **Không nhận được nhắc việc**: chỉ gửi sau 17:00, cho Page chưa đăng hôm nay; kiểm tra thêm tuỳ chọn thông báo của bạn.

## Xem thêm

- [Quản lý UTM](/huong-dan/quan-ly-utm)
- [Khách hàng](/huong-dan/khach-hang)
- [Thông báo](/huong-dan/thong-bao)
