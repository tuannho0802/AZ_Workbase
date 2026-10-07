---
title: Thông báo
slug: thong-bao
sortOrder: 50
published: false
roles: []
positions: []
departments: []
permissions: []
---

## Trang này để làm gì

Trang **Thông báo** là **hộp thư cá nhân** của bạn: mọi thông báo hệ thống gửi riêng cho bạn (được chia khách, đổi trạng thái công việc, thông báo do Admin gửi…) đều nằm ở đây. Chuông ở góc trên cùng bên phải (Header) chỉ cho xem nhanh 20 thông báo mới nhất; muốn xem đầy đủ, lọc và quản lý, bấm **Xem tất cả** trong chuông để vào trang này.

## Ai dùng được & thấy gì

Mọi người đã đăng nhập đều có hộp thư, **không cần quyền riêng** nào. Hộp thư luôn là của **chính bạn**: bạn không xem được thông báo của người khác và người khác cũng không xem được của bạn.

## Ba loại thông báo

```az-demo
notification-kinds
```

Cột nhãn màu chính là bộ lọc ở đầu trang: **Khách hàng**, **Công việc**, **Thông báo** (thông báo thủ công do người khác gửi).

## Bắt đầu nhanh

1. Bấm chuông ở Header, hoặc vào mục **Thông báo** ở menu. Dòng đậm, nền xanh nhạt, có chấm xanh bên phải là thông báo **chưa đọc**.
2. Bấm vào một dòng để **đọc và đi tới đúng chỗ** (xem bảng ở trên). Thông báo được đánh dấu đã đọc ngay khi bạn bấm.
3. Dùng hàng bộ lọc để thu hẹp: chọn loại, hoặc bật **Chỉ chưa đọc**.
4. Bấm **Đọc tất cả** để đánh dấu đã đọc cả hộp thư, hoặc chỉ riêng loại đang chọn.

## Giải thích từng phần trên trang

```az-demo
notification-list view=all
```

- **Tất cả / Khách hàng / Công việc / Thông báo**: lọc theo loại. **Đọc tất cả** chỉ áp dụng cho loại đang chọn (đang ở Tất cả thì đọc hết).
- **Chỉ chưa đọc**: chỉ hiện thông báo chưa đọc. Công tắc này không dùng ở tab **Đã ẩn**.
- **×N** cạnh giờ (ví dụ ×3): hệ thống đã **gộp nhiều lần cập nhật** của cùng một việc khi bạn chưa đọc, để hộp thư không bị ngập. Dòng nổi lên đầu với nội dung mới nhất.
- **Từ … đến …**: chỉ có ở thông báo thủ công, cho biết ai gửi.
- **Không khả dụng**: khách hoặc công việc đó đã bị xoá nên không mở được nữa.
- **Tải thêm**: mỗi lần hiện 20 thông báo, bấm để xem tiếp.

## Ẩn, khôi phục và xoá vĩnh viễn

Nút **✕** (Ẩn thông báo) **không xoá** thông báo mà chỉ cất khỏi hộp thư. Thông báo đã ẩn nằm ở tab **Đã ẩn**, nơi bạn có thể **Khôi phục** hoặc **Xoá vĩnh viễn**.

```az-demo
notification-hide-flow
```

```az-demo
notification-list view=hidden
```

- **Xoá vĩnh viễn** có hộp xác nhận và **không hoàn tác được**.
- Muốn xoá hẳn một thông báo thì phải **Ẩn trước**: hệ thống từ chối xoá vĩnh viễn thông báo đang hiện, để tránh bấm nhầm mất thông báo chưa đọc.
- Thông báo đã ẩn không còn được tính vào số chưa đọc trên chuông.

## Quy tắc & lưu ý

- Trình duyệt **tự kiểm tra thông báo mới khoảng 2 phút một lần**, nên thông báo có thể đến chậm đôi chút. Khi có thông báo mới, góc màn hình hiện thông báo nổi, tối đa 3 cái mỗi lần, phần dư gộp thành “và N thông báo mới khác”. Lần kiểm tra đầu tiên khi mở phiên không hiện thông báo nổi.
- Nội dung thông báo chỉ hiển thị dạng chữ thuần.
- Thông báo **tự động** (Khách hàng, Công việc) do hệ thống tạo theo sự kiện (được chia khách, đổi trạng thái việc…). Muốn gửi thông báo cho người khác, xem [Gửi thông báo](/huong-dan/gui-thong-bao).

## Vì sao tôi không thấy …?

- **Không thấy thông báo mình mong đợi**: kiểm tra bộ lọc đang chọn (loại, Chỉ chưa đọc), và tab **Đã ẩn**, có thể bạn đã ẩn nó.
- **Bấm vào không chuyển trang**: khách hoặc công việc đã bị xoá (dòng có nhãn **Không khả dụng**), hoặc đó là thông báo thủ công nên chi tiết mở ngay trong cửa sổ.
- **Số trên chuông khác số dòng trong trang**: số trên chuông chỉ đếm thông báo **chưa đọc và chưa ẩn**.

## Xem thêm

- [Gửi thông báo](/huong-dan/gui-thong-bao)
- [Bắt đầu](/huong-dan/bat-dau)
