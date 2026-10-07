---
title: Báo cáo doanh số
slug: bao-cao-doanh-so
sortOrder: 85
published: false
roles: []
positions: []
departments: []
permissions: [reports.view]
---

## Trang này để làm gì

Trang **Báo cáo doanh số** cho biết **tiền nạp** và **data khách hàng** trong một kỳ (tuần, tháng, quý, năm hoặc khoảng tự chọn): ai mang về bao nhiêu doanh thu, bao nhiêu data mới, bao nhiêu khách đã chốt, đã join nhóm, đã nạp. Trang có 6 tab, mỗi tab trả lời một câu hỏi khác nhau (xem bảng bên dưới).

## Ai dùng được & thấy gì

Vào trang cần quyền **Xem báo cáo doanh số** (`reports.view`). Theo cấu hình mặc định: Admin, Assistant và Manager có quyền này; **Employee thì không** (mục menu ẩn, và nếu gõ thẳng đường dẫn sẽ bị đưa về trang Khách hàng kèm thông báo “Bạn không có quyền truy cập trang này”). Admin có thể cấp quyền cho vai trò khác trong trang **Phân quyền**.

Phạm vi số liệu phụ thuộc vào **phạm vi xem** của quyền này, không phải tên vai trò:

- **Toàn bộ** (mặc định của Admin, Assistant): thấy số của mọi nhân viên, và có thẻ tổng ghi “… toàn hệ thống”.
- **Phòng ban** (mặc định của Manager): thấy khách thuộc phòng ban mình quản lý **cộng** khách của chính mình; thẻ tổng ghi “… của bạn” và **không có** tổng toàn hệ thống.
- **Của tôi** (khi Admin cấp cho vai trò khác): chỉ số của chính mình.

```az-demo
report-revenue-by-viewer viewer=admin
```

```az-demo
report-revenue-by-viewer viewer=manager
```

```az-demo
report-revenue-by-viewer viewer=own
```

Ví dụ trên là bản rút gọn của tab **Doanh thu**; số liệu và tên là giả định.

## Bắt đầu nhanh

1. Vào **Báo cáo doanh số**. Trang mở ở tab **Doanh thu**, kỳ mặc định là **Tuần** chứa hôm nay.
2. Chọn kỳ ở ô đầu hàng (**Tuần**, **Tháng**, **Quý**, **Năm**, **Tuỳ chọn**), rồi chọn một ngày/tháng/quý/năm. Dòng **Đang xem: dd/mm/yyyy → dd/mm/yyyy** cho biết khoảng ngày thật đang được tính.
3. Xem các thẻ số ở trên, rồi bảng **theo nhân viên** ở dưới. Có thể chuyển giữa dạng bảng và biểu đồ (cột dọc, cột ngang, tròn) và gõ **Tìm theo tên nhân viên...** để lọc.
4. Muốn biết con số đó là những khách nào: **bấm vào chính con số** (thẻ hoặc ô trong bảng) để mở danh sách khách.
5. Số không cập nhật ngay khi có khoản nạp mới: bấm **Làm mới**.

Kỳ và ngày bạn chọn được **giữ khi chuyển giữa các tab** (6 tab dùng chung một kỳ).

## Kỳ báo cáo luôn là khoảng lịch trọn vẹn

Chọn một ngày thì hệ thống lấy **cả tuần / tháng / quý / năm chứa ngày đó**, không phải “N ngày gần đây”. Tuần tính từ **Thứ Hai đến Chủ Nhật**. Kỳ chưa kết thúc thì số liệu vẫn còn tăng thêm cho tới hết kỳ.

```az-demo
report-period-explainer period=week
```

```az-demo
report-period-explainer period=quarter
```

Với **Tuỳ chọn**, chọn khoảng **Từ ngày → Đến ngày**; kỳ so sánh (ở tab Marketing) là khoảng cùng số ngày ngay trước đó.

## 6 tab, mỗi tab một câu hỏi

| Tab | Trả lời câu hỏi | Điểm cần nhớ |
|---|---|---|
| **Doanh thu** | Mỗi Sales mang về bao nhiêu tiền? Nạp lần đầu vs nạp lại? | Tiền quy về **Sales chính** của khách |
| **Doanh số khách** | Bao nhiêu data mới, đã chốt, đã join nhóm; tỷ lệ chốt / join nhóm / nạp? | Mỗi chỉ số tính theo mốc ngày riêng |
| **Chất lượng data** | Data mới của kỳ giờ đang ở trạng thái nào? | Chia theo **trạng thái hiện tại**, danh sách trạng thái lấy từ trang quản lý Status khách |
| **Marketing** | Marketing phụ trách / Người tạo data đem về bao nhiêu? | Quy về Marketing và Người tạo, **độc lập** với Sales |
| **Chất lượng nhóm** | Mỗi Fanpage/Group đang “nuôi” khách tốt tới đâu? | Có mục **Gợi ý xử lý nhanh** |
| **Chất lượng UTM** | Mỗi UTM đem về khách chất lượng ra sao? | Chia 3 góc nhìn: **Tất cả / Hoạt động / Đã khoá** |

### Tab Doanh thu

- Các thẻ: **Tổng doanh thu toàn hệ thống** (hoặc **… của bạn**), **Khách đã nạp trong kỳ**, **Nạp lần đầu (FTD)**, **Nạp lại**, **Tỷ lệ nạp (data mới)**, **Tỷ lệ chốt (data mới)**.
- Biểu đồ **Giai đoạn nạp theo ngày** (hoặc **theo tháng**): cột xếp chồng là tiền nạp lần đầu + nạp lại, đường là số khách nạp.
- Bảng **Doanh thu theo nhân viên**: **Doanh thu**, **Khách nạp**, **Số khoản nạp**, **Nạp lần đầu**, **Nạp lại**, **TB / khách nạp**.
- Nút **Xem khách** ở mỗi dòng (hoặc ô **Kiểm tra khách của 1 Sales...** ở đầu trang) mở danh sách toàn bộ khách của Sales đó, có các thẻ chuyển nhanh giữa **Data mới**, **Đã chốt**, **Đã join nhóm**, **Có nạp**, **Nạp lần đầu**, **Nạp lại**.

### Tab Doanh số khách

Thẻ **Tổng data**, **Đã chốt**, **Đã join nhóm**, và 3 thẻ tỷ lệ: **Tỷ lệ chốt**, **Tỷ lệ join nhóm**, **Tỷ lệ nạp tiền**. Bảng **theo nhân viên** (cột đầu là **Nhân viên (Sales chính)**) có đủ 3 số và 3 tỷ lệ; ở ô tỷ lệ, số trong ngoặc là tử số, bấm vào để xem khách.

### Tab Chất lượng data

Có một thẻ cho **mỗi trạng thái** khách (kèm % trên tổng data), rồi bảng theo nhân viên với một cột cho mỗi trạng thái. Ô chọn **Đánh giá theo trạng thái** quyết định trạng thái nào được tô thành thanh tỷ lệ và dùng để sắp xếp.

### Tab Marketing

Lọc theo **Marketing phụ trách**, **Người tạo data**, **Nguồn** (có lựa chọn **(Chưa gán Marketing)** và **(Không rõ người tạo)**). Các thẻ KPI có so với **kỳ trước**, kèm xu hướng, xếp hạng, và khối **Đối soát: Người tạo vs Marketing phụ trách** (nếu phần “Người tạo ≠ Marketing” lớn thì số theo hai chiều sẽ lệch nhau, nên xem cả hai bảng). Với phạm vi **Của tôi**, trang hiện thông báo **Bạn chỉ xem được số liệu của chính mình** và chỉ tính khách mà bạn là Marketing phụ trách hoặc người tạo data.

### Tab Chất lượng nhóm

Chọn **Tất cả nền tảng** / một nền tảng, **Tất cả nhóm** / một nhóm để thu hẹp mọi số. Cột **Đánh giá** chỉ chấm điểm nhóm đủ số thành viên tối thiểu (rê chuột vào tiêu đề cột để xem). Khối **Gợi ý xử lý nhanh** tự liệt kê nhóm **cần xử lý** (tỷ lệ nạp dưới 40%), nhóm **làm tốt, nên nhân rộng** (trên 80%) và nhóm trống / không ai nạp. Xem thêm [Nhóm liên kết](/huong-dan/nhom-lien-ket).

### Tab Chất lượng UTM

Giống tab nhóm nhưng theo UTM: chọn **Tất cả UTM / Tất cả Sales / Tất cả Marketing**, đổi góc nhìn giữa **Tất cả**, **Hoạt động**, **Đã khoá**. Có thêm lịch sử nạp, số khách nạp lại, số ngày TB từ lúc khách vào hệ thống đến khoản nạp đầu tiên. Xem thêm [Quản lý UTM](/huong-dan/quan-ly-utm).

Rê chuột vào tiêu đề từng thẻ ở các tab để xem định nghĩa chính xác của số đó.

## Mỗi chỉ số tính theo ngày nào

Đây là điểm dễ nhầm nhất: các chỉ số **không** cùng dùng một mốc ngày, nên **đừng tự lấy số này chia số kia** để ra tỷ lệ.

```az-demo
report-metric-dates
```

Hệ quả thực tế:

- Một khách nhập từ tháng trước, **chốt trong kỳ này**, vẫn được đếm vào **Đã chốt** của kỳ này nhưng không nằm trong **Data mới** của kỳ này.
- **Doanh thu** tính theo **ngày nạp**, không quan trọng khách được tạo lúc nào.
- **FTD + Nạp lại = Doanh thu** (mỗi khoản nạp thuộc đúng một nhóm); khoản nạp sớm nhất của khách là FTD, các khoản sau là nạp lại.
- Các **tỷ lệ** chỉ tính trên **data mới của kỳ** theo tình trạng **hiện tại** của khách, nên luôn ≤ 100%.

## Màu của các tỷ lệ

Mọi tỷ lệ % ở trang này dùng chung ngưỡng màu: **dưới 40% đỏ**, **từ 40% đến 80% vàng**, **trên 80% xanh**.

## Danh sách khách và chi tiết một khách

Bấm vào một con số sẽ mở bảng **Mini Table** liệt kê đúng những khách tạo nên con số đó:

- Ô **Tìm tên, SĐT, email...**, lọc **Trạng thái**, **Nguồn**, khoảng **Ngày nhập từ → đến**, và các nút nhanh **Hôm nay / Tuần này / Tuần trước / Tháng này** (bấm lại nút đang chọn để bỏ lọc).
- Mỗi trang hiện 10 khách; phạm vi dữ liệu **luôn khớp** với tab bạn đang xem.
- Bấm **Xem** ở một dòng để mở chi tiết (chỉ xem, không sửa): **Thông tin chung**, **Lịch sử nạp** (chia nạp đầu / nạp lại), **Ghi chú**, **Dòng thời gian**.

Muốn sửa khách thật, vào trang [Khách hàng](/huong-dan/khach-hang).

## Quy tắc & lưu ý

- Báo cáo **tính trực tiếp từ dữ liệu mỗi lần mở**, không lưu sẵn. Khách đổi trạng thái hoặc khoản nạp nhập trễ sẽ thay đổi số của kỳ tương ứng.
- Doanh thu và số khách ở tab Doanh thu / Doanh số khách / Chất lượng data **gắn với Sales chính** của khách (xem [Chia data](/huong-dan/chia-data)). Khách chưa có Sales chính không có dòng riêng trong các bảng theo nhân viên.
- Khách trong **Thùng rác** không được tính vào báo cáo.

## Vì sao tôi không thấy …?

- **Không thấy mục Báo cáo doanh số**: chưa có quyền `reports.view` (mặc định Employee không có).
- **Không có thẻ “… toàn hệ thống”**: phạm vi xem của bạn là Phòng ban hoặc Của tôi; chỉ Admin hoặc vai trò có phạm vi Toàn bộ mới thấy tổng toàn hệ thống.
- **Thiếu một nhân viên trong bảng**: nhân viên đó không có doanh thu / data trong kỳ này, hoặc khách của họ nằm ngoài phạm vi xem của bạn.
- **Số thấp hơn mong đợi**: kiểm tra dòng **Đang xem** có đúng kỳ không (kỳ là cả khoảng lịch, và tuần bắt đầu từ Thứ Hai), rồi bấm **Làm mới**.
- **Tỷ lệ không bằng “đã chốt ÷ tổng data” bạn tự tính**: do mốc ngày khác nhau; tỷ lệ chính thức dùng data mới của kỳ.

## Xem thêm

- [Khách hàng](/huong-dan/khach-hang)
- [Chia data](/huong-dan/chia-data)
- [Nhóm liên kết](/huong-dan/nhom-lien-ket)
- [Quản lý UTM](/huong-dan/quan-ly-utm)
