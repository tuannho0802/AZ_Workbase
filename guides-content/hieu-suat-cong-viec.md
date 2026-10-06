---
title: Hiệu suất công việc
slug: hieu-suat-cong-viec
sortOrder: 14
published: false
roles: []
positions: []
departments: []
permissions: []
---

## Trang này để làm gì

Trang **Hiệu suất công việc** thống kê **tỉ lệ hoàn thành, tỉ lệ xong muộn, số việc quá hạn và tiến độ checklist** của [Công việc định kỳ](/huong-dan/cong-viec-dinh-ky), tính theo từng nhân viên trong một khoảng ngày. Mọi người đều dùng được để xem hiệu suất **của chính mình**. Người được cấp quyền rộng hơn còn xem được cả phòng ban hoặc toàn bộ nhân viên.

Vào từ mục **Hiệu suất công việc** ở menu. Bản rút gọn của trang (đổi nút bên trên để xem phạm vi khác nhau):

```az-demo
performance-page scope=department
```

## Ai dùng được & thấy gì

**Ai cũng vào được trang này**, không cần quyền riêng. Thứ quyền quyết định là **bạn xem được của ai**, do quyền **Xem Hiệu suất công việc** (`periodic_tasks.performance_view`) và phạm vi của nó:

| Phạm vi của bạn | Bạn thấy |
|---|---|
| **Không có quyền** hoặc phạm vi **Của mình** | Chỉ **số liệu của chính bạn**. Trang hiện thêm dòng thông báo "Bạn chưa được cấp quyền xem hiệu suất của người khác" và khối **Chi tiết công việc của tôi** ở cuối trang. |
| **Theo phòng ban** | Việc thuộc **phòng ban bạn quản lý**, của mọi nhân viên trong các phòng ban đó. |
| **Toàn bộ** | Mọi nhân viên, mọi phòng ban. |

Theo dữ liệu khởi tạo hệ thống, **chỉ Admin** được cấp quyền này với phạm vi Toàn bộ. Các vai trò khác mặc định chỉ xem **của mình** cho tới khi Admin cấp ở trang **Phân quyền**. Admin có thể đã chỉnh khác mặc định.

Khi không có quyền xem người khác, trang **không báo lỗi**: bạn chỉ bị thu hẹp về dữ liệu của mình. Ba ô lọc **Phòng ban**, **Phụ trách chính**, **Phụ trách phụ** và nút **Chế độ xem** sẽ không hiện, biểu đồ cũng không hiện.

Cạnh tiêu đề có thẻ **Đang xem: …** cho biết bạn đang nhìn ai: "Chỉ của tôi", "Nhân viên: tên", hoặc "Phòng ban của tôi · N nhân viên" / "Toàn bộ · N nhân viên". Bên cạnh đó là **Quyền xem** (Chỉ của tôi / Theo phòng ban / Toàn bộ) khi bạn xem được người khác.

## Bắt đầu nhanh

1. Vào **Hiệu suất công việc**. Trang mở sẵn **Tháng này**.
2. Chọn khoảng ngày khác bằng ô ngày hoặc các nút **Lọc nhanh**: **Tuần này**, **Tuần trước**, **Tháng này**, **Tháng trước**, **90 ngày gần đây**. Các bộ lọc **áp dụng ngay**, không cần bấm nút xác nhận.
3. Đọc các **thẻ số liệu** ở trên và **bảng theo nhân viên** ở dưới.
4. Bấm vào một **thẻ** để xem danh sách việc đứng sau con số đó, hoặc bấm **Chi tiết** ở cuối dòng nhân viên để xem toàn bộ việc của người đó.

## Bộ lọc

| Bộ lọc | Cách dùng |
|---|---|
| **Khoảng ngày** | Lọc theo **kỳ hạn** của việc, không theo ngày tạo. Một việc được tính nếu **kỳ hạn của nó giao với** khoảng ngày bạn chọn (nên việc Tháng hoặc Năm bao trùm khoảng đó vẫn được tính). Tối đa **93 ngày**: chọn dài hơn, hệ thống tự cắt bớt ngày kết thúc và báo "Khoảng ngày tối đa 93 ngày". |
| **Loại kỳ** | Chỉ tính việc thuộc một loại kỳ: Ngày, Tuần, Tháng hoặc Năm. Bỏ trống là tính cả bốn. |
| **Phòng ban** | Chỉ hiện khi bạn xem được người khác. Lọc theo phòng ban của việc. |
| **Phụ trách chính** / **Phụ trách phụ** | Chỉ hiện khi bạn xem được người khác. Chọn một hoặc nhiều nhân viên để thu hẹp danh sách. Danh sách chọn chỉ gồm người **có việc trong kỳ đang lọc**. Hai ô cùng thu hẹp: bảng và thẻ chỉ còn những nhân viên bạn đã chọn ở **một trong hai** ô. |
| **Chế độ xem** | Chỉ hiện khi bạn xem được người khác. **Chỉ của tôi** thu hẹp về riêng bạn; **Cả phòng ban** (hoặc **Nhiều nhân viên**) bỏ thu hẹp. |

Thẻ số liệu, biểu đồ và bảng luôn **cùng một bộ lọc**, nên chọn nhân viên thì cả ba cùng đổi. Nút **Làm mới** ở góc phải tải lại dữ liệu.

## Các thẻ số liệu

Trang có **chín thẻ**. Bấm vào thẻ nào, hộp thoại danh sách việc của đúng thẻ đó mở ra (xem phần "Danh sách việc sau mỗi thẻ").

| Thẻ | Ý nghĩa |
|---|---|
| **Tổng Task của mình** (hoặc **Tổng Task phụ trách chính** khi xem người khác) | Số việc mà nhân viên là **Phụ trách chính** trong kỳ. **Mọi tỉ lệ bên dưới tính trên nhóm này.** |
| **Tổng Task phụ trách phụ** | Số việc của người khác mà nhân viên là **Phụ trách phụ**. Chỉ để tham khảo, **không** tính vào các tỉ lệ. |
| **% Hoàn thành** | (Đúng hạn + Xong muộn) chia cho tổng việc chính. |
| **% Xong muộn** | Trong số việc **đã xong**, bao nhiêu phần trăm xong muộn. |
| **Quá hạn chưa xong** | Số việc chưa xong mà đã bị tính là quá hạn. |
| **Checklist Task của mình** (hoặc **… phụ trách chính**) | Số mục checklist đã tick trên tổng số mục, của các việc mà nhân viên là Phụ trách chính. |
| **Checklist Task phụ trách phụ** | Tương tự, cho các việc mà nhân viên là Phụ trách phụ. |
| **% Đang làm** | Phần trăm việc **đang ở** trạng thái mã `in_progress` ngay lúc bạn xem. |
| **% Đang xem xét** | Phần trăm việc **đang ở** trạng thái mã `in_review` ngay lúc bạn xem. |

Khi xem nhiều người, các thẻ **cộng số đếm của từng người rồi mới tính lại phần trăm**, không lấy trung bình các phần trăm. Vì vậy người có nhiều việc ảnh hưởng nhiều hơn tới tổng.

Màu của số: **% Hoàn thành** từ 80% trở lên màu xanh, từ 50% màu vàng, dưới 50% màu đỏ. Tag **% Xong muộn**: 0% xanh, tới 20% vàng, trên 20% đỏ.

## Bảng theo nhân viên

Mỗi dòng là **một nhân viên** (người Phụ trách chính). Bấm tiêu đề cột để sắp xếp. Bảng chia trang 20 nhân viên.

| Cột | Ý nghĩa |
|---|---|
| **Nhân viên** | Tên người. |
| **Tổng Task của mình** | Việc Phụ trách chính trong kỳ. |
| **Tổng Task phụ trách phụ** | Việc Phụ trách phụ. Không tính vào các tỉ lệ. |
| **Đúng hạn** | Việc đã xong và xong **kịp** (xem phần "Cách tính"). |
| **Xong muộn** | Việc đã xong nhưng **muộn**. |
| **Quá hạn chưa xong** | Việc chưa xong và đã bị tính quá hạn. |
| **Đang trong hạn** | Việc chưa xong nhưng **chưa bị tính là trễ**. Chỉ để tham khảo, không trừ điểm. |
| **% Hoàn thành** | Thanh tiến độ, màu theo mức. |
| **% Xong muộn** | Tag màu. |
| **% Đang làm** / **% Đang xem xét** | Rê chuột vào tag để xem "số việc/tổng". |
| **Checklist Task của mình** / **Checklist Task phụ trách phụ** | Dạng "đã tick/tổng"; rê chuột để xem phần trăm. Dấu — nghĩa là không có mục checklist nào. |
| **Thao tác** | Nút **Chi tiết**. Số trong ngoặc là tổng số việc **Xong muộn + Quá hạn chưa xong**, để gợi ý nhanh có bao nhiêu việc cần để ý. Nút luôn bấm được dù số này bằng 0. |

Một người chỉ làm Phụ trách phụ (không có việc chính) vẫn có dòng riêng, với **Tổng Task của mình** bằng 0 và các tỉ lệ hiện dấu —.

Dấu **—** ở ô tỉ lệ nghĩa là **mẫu số bằng 0** (chưa có việc nào, hoặc chưa có việc nào xong), không phải lỗi.

## Cách tính

### Đơn vị đo là Phụ trách chính

Hiệu suất của một người = các việc mà người đó là **Phụ trách chính**. Việc Phụ trách phụ chỉ được **đếm riêng** ở hai cột và hai thẻ "phụ trách phụ", không cộng vào tổng hay tỉ lệ.

### Thế nào là "đã xong"

Một việc được coi là **đã xong** kể từ **lần đầu tiên** nó chuyển sang:

- trạng thái mã `in_review` (Xem xét), **hoặc**
- một trạng thái được bật công tắc **Tính là Hoàn thành** (ví dụ **Hoàn thành**).

Mốc thời gian lấy từ **lịch sử đổi trạng thái** của việc (chính là các dòng "Đổi trạng thái" ở [Lịch sử Công việc](/huong-dan/lich-su-cong-viec)). Nghĩa là: **kể cả sau này việc bị chuyển sang trạng thái khác, nó vẫn được tính là đã xong ở lần đầu đạt mốc**. Việc được tạo thẳng ở trạng thái "đã xong" (không có lần đổi nào) lấy **ngày tạo** làm mốc.

### Đúng hạn hay muộn: ân hạn 7 ngày

So **ngày đạt mốc xong** với **kỳ hạn + 7 ngày** (ngày cuối của kỳ cộng 7 ngày ân hạn):

| Tình huống (ví dụ việc có kỳ hạn **10/10**, ân hạn tới **17/10**) | Kết quả |
|---|---|
| Xong ngày 08/10 hoặc 15/10 | **Đúng hạn** |
| Xong ngày 18/10 trở đi | **Xong muộn** |
| Chưa xong, đã bị tính quá hạn (xem bên dưới) | **Quá hạn chưa xong** |
| Chưa xong, chưa bị tính quá hạn | **Đang trong hạn** |

Nhờ ân hạn, một việc quá kỳ hạn vài ngày nhưng xong trong 7 ngày vẫn là **Đúng hạn**.

### Khi nào chưa xong bị tính là "Quá hạn chưa xong"

Một việc **chưa xong** bị tính **Quá hạn chưa xong** nếu **một trong hai** đúng:

1. Hôm nay đã **quá kỳ hạn + 7 ngày**; hoặc
2. Việc đang mang dấu **Quá hạn** và đã qua kỳ hạn. Dấu này do **hệ thống tự gắn** khi việc đã quá kỳ hạn **từ 3 ngày trở lên** (quét tự động mỗi đêm), hoặc do người có quyền duyệt **Đánh dấu quá hạn** bằng tay (làm được ngay sau kỳ hạn).

Vì hệ thống tự gắn dấu sau 3 ngày, trên thực tế việc chưa xong thường chuyển sang **Quá hạn chưa xong** từ ngày thứ 3 sau kỳ hạn, **không đợi đủ 7 ngày**. Thời điểm chính xác phụ thuộc lịch quét tự động (có thể trễ khoảng một giờ). Ân hạn 7 ngày vẫn có tác dụng ở chiều **xong**: xong trong 7 ngày vẫn là Đúng hạn, và khi đó số **Quá hạn chưa xong** giảm đi.

Việc đã mang dấu Quá hạn mà sau đó được **kéo dài kỳ** thì dấu cũ không còn hiệu lực (kỳ hạn mới chưa qua). Xem [Công việc định kỳ](/huong-dan/cong-viec-dinh-ky).

### Việc bị loại khỏi tính toán

Việc ở trạng thái được bật công tắc **Loại khỏi % rollup** bị bỏ khỏi **cả tử số lẫn mẫu số** (không tính vào Tổng, không tính vào checklist). Việc đã **xoá** cũng không được tính. Xem [Quản lý Trạng thái công việc](/huong-dan/trang-thai-cong-viec).

### % Đang làm và % Đang xem xét là ảnh chụp lúc xem

Hai cột này đếm theo **trạng thái hiện tại**, không phải lịch sử, và **độc lập** với Đúng hạn, Xong muộn, Quá hạn. Một việc có thể **vừa là Quá hạn chưa xong vừa đang Đang làm**: nó được đếm ở cả hai chỗ, và bốn nhóm Đúng hạn / Xong muộn / Quá hạn / Đang trong hạn cộng lại bằng Tổng, còn hai cột này **không** nằm trong phép cộng đó.

Hai cột nhận diện theo **mã** trạng thái `in_progress` và `in_review`. Nếu hệ thống của bạn không có trạng thái mang mã đó, cột sẽ luôn 0%.

## Biểu đồ phân bổ

Khi bạn xem được người khác và có **từ hai nhân viên trở lên** sau khi lọc, trang hiện thêm biểu đồ **Phân bổ Task theo nhân viên**: mỗi người một thanh ngang chia bốn màu **Hoàn thành đúng hạn**, **Hoàn thành muộn**, **Quá hạn chưa xong**, **Đang trong hạn**. Biểu đồ chỉ vẽ **tối đa 20 người có nhiều việc nhất**; muốn xem đủ, dùng bảng bên dưới.

```az-demo
performance-chart
```

## Danh sách việc sau mỗi thẻ

Bấm một thẻ để mở hộp thoại liệt kê **đúng các việc đứng sau con số** của thẻ đó (cùng bộ lọc, cùng nhân viên đã chọn). Tiêu đề hộp thoại ghi rõ bạn đang xem ai.

- Bảng có các cột **Task**, **Loại kỳ**, **Kỳ hạn**, **Trạng thái**, **Tình trạng** (Đúng hạn / Xong muộn / Quá hạn chưa xong / Đang trong hạn), **Phụ trách**, **Checklist**. Với thẻ phụ trách phụ, cột **Tình trạng** là dấu — vì việc phụ không được chấm.
- Sắp xếp theo kỳ hạn **mới nhất trước**, 10 việc mỗi trang.
- Bấm mũi tên đầu dòng để xem các mục checklist. Ở hai thẻ **Checklist**, mọi dòng **mở sẵn**; thẻ khác thì đóng sẵn. Thẻ Checklist chỉ giữ những việc **có** checklist.
- Hộp thoại có bộ lọc riêng (khoảng ngày, **Lọc nhanh**, **Loại kỳ**) bắt đầu bằng đúng bộ lọc của trang để số dòng khớp số trên thẻ. Đổi trong hộp thoại **chỉ ảnh hưởng hộp thoại**. Nút **Đồng bộ theo trang** đưa về đúng bộ lọc của trang.

## Chi tiết công việc của một nhân viên

Bấm **Chi tiết** ở dòng nhân viên: một ngăn bên phải mở ra, tiêu đề "Chi tiết công việc — tên". Ngăn này liệt kê **toàn bộ việc** của người đó, chia hai nhóm **Phụ trách chính** và **Phụ trách phụ**, mỗi nhóm có số việc và phân trang riêng (2 việc mỗi trang). Việc **gần ngày hôm nay nhất** nằm trên cùng, cả việc sắp tới lẫn việc vừa quá hạn.

- Bộ lọc riêng của ngăn: khoảng ngày (mặc định **Tuần này**, khác với trang chính là Tháng này), **Lọc nhanh**, **Loại kỳ**, và công tắc **Chỉ hiển thị Task quá hạn**. Ngăn không đổi bộ lọc của trang.
- Công tắc **Chỉ hiển thị Task quá hạn** giữ các việc đã quá kỳ hạn **từ 3 ngày trở lên** mà chưa xong (việc ở trạng thái Xem xét hoặc Hoàn thành được tính là đã xong). Quy tắc này **không** giống hệt cột **Quá hạn chưa xong** của bảng (cột đó còn tính việc đã mang dấu Quá hạn do người duyệt gắn tay sớm hơn).
- Ngăn chỉ cho xem người nằm trong phạm vi của bạn. Với phạm vi **Theo phòng ban**, việc của nhân viên thuộc phòng ban khác không hiện (ngăn trống). Với phạm vi **Của mình**, mở người khác sẽ bị từ chối.

### Khi bạn chỉ xem được của mình

Dưới bảng sẽ có thêm khối **Chi tiết công việc của tôi** (nền xanh nhạt). Nội dung giống ngăn **Chi tiết** nhưng nhúng thẳng vào trang, mặc định **Tuần này**; khối này không có ô **Loại kỳ** riêng mà lấy theo ô **Loại kỳ** của trang:

```az-demo
own-performance
```

Trong ngăn và khối này, bạn có thể **làm việc trực tiếp** trên từng việc:

- **Đổi trạng thái nhanh**: cần quyền **Sửa Công việc định kỳ**. Việc đang **khoá** cần thêm quyền **Sửa khi đang khoá**. Nếu thiếu quyền, ô chọn bị làm mờ và rê chuột sẽ nêu lý do.
- **Đánh dấu quá hạn**: hiện khi bạn có quyền **Duyệt** và việc đủ điều kiện (đã qua hạn kỳ, chưa xong, chưa mang dấu, còn trong 7 ngày ân hạn).
- **Checklist**: tick trực tiếp nếu bạn sửa được việc đó; bấm để mở đầy đủ.

Sau mỗi thay đổi, số liệu trên trang được tải lại.

## Quy tắc & lưu ý nghiệp vụ

- **Chỉ đo người Phụ trách chính.** Việc phụ không có tỉ lệ riêng.
- **Việc chưa tới hạn không bị trừ điểm.** Chúng nằm ở cột **Đang trong hạn**, vì người dùng có thể chưa kịp cập nhật trạng thái.
- **Quên cập nhật trạng thái sẽ bị tính Quá hạn.** Làm xong rồi nhưng không chuyển sang **Xem xét** hoặc **Hoàn thành** thì việc đó vẫn là chưa xong. Hãy cập nhật trạng thái đúng lúc.
- **Mốc xong là lần đầu đạt trạng thái xong.** Mở lại việc sau đó không xoá mốc này.
- **Giờ tính theo giờ Việt Nam.**
- **Phạm vi do hệ thống lọc.** Hai người cùng mở trang có thể thấy số khác nhau. Đó là bình thường: mỗi người thấy theo quyền của mình.
- **Số trên thẻ có thể khác số trong bảng nếu bạn đang chọn nhân viên**: thẻ, biểu đồ, bảng đều theo nhân viên đã chọn.

## Vì sao tôi không thấy …?

- **Tôi chỉ thấy mỗi dòng của mình, không có ô lọc phòng ban hay nhân viên**: bạn chưa được cấp quyền **Xem Hiệu suất công việc**. Liên hệ Admin để cấp quyền và chọn phạm vi.
- **Tôi là quản lý nhưng không thấy nhân viên của mình**: phạm vi **Theo phòng ban** chỉ gồm việc thuộc phòng ban bạn **được gán quản lý**. Việc của nhân viên mà **phòng ban của việc** không nằm trong số đó sẽ không hiện.
- **Một nhân viên không có trong danh sách chọn**: người đó không có việc nào trong kỳ đang lọc. Đổi khoảng ngày hoặc Loại kỳ.
- **Bảng trống, ghi "Không có Task nào trong khoảng đã chọn"**: không có việc nào có kỳ hạn giao với khoảng ngày bạn chọn, hoặc tất cả đã bị loại khỏi tính toán.
- **Việc của tôi không có trong bảng**: có thể bạn chỉ là **Phụ trách phụ** (khi đó nó nằm ở cột phụ trách phụ), hoặc việc ở trạng thái **Loại khỏi % rollup**, hoặc việc đã bị xoá.
- **Một việc đã xong rồi mà vẫn bị Xong muộn**: mốc xong tính vào ngày bạn **chuyển sang Xem xét hoặc Hoàn thành**, không phải ngày bạn làm xong thật. Xem lịch sử đổi trạng thái ở [Lịch sử Công việc](/huong-dan/lich-su-cong-viec).
- **% Đang làm hoặc % Đang xem xét luôn 0%**: hệ thống chưa có trạng thái mang mã `in_progress` hoặc `in_review`, hoặc chưa việc nào đang ở trạng thái đó.
- **Chọn khoảng ngày dài nhưng bị cắt ngắn**: giới hạn tối đa là 93 ngày.

## Xem thêm

- [Công việc định kỳ](/huong-dan/cong-viec-dinh-ky)
- [Quản lý Trạng thái công việc](/huong-dan/trang-thai-cong-viec) (hai công tắc quyết định việc nào được tính là xong hoặc bị loại)
- [Lịch sử Công việc](/huong-dan/lich-su-cong-viec) (nơi ghi mốc đổi trạng thái mà trang này dùng)
