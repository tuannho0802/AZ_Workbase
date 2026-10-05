---
title: Quản lý nhóm liên kết
slug: nhom-lien-ket
sortOrder: 70
published: false
roles: []
positions: []
departments: []
permissions: [link_groups.view]
---

## Trang này để làm gì

Công ty có nhiều nhóm chat/cộng đồng trên **Zalo, Facebook, Instagram, Threads...**. Trang **Quản lý nhóm liên kết** là nơi lập danh sách các nhóm đó và quy định ai phụ trách từng nhóm. Danh sách chia 2 tầng:

- **Category (nền tảng)**: Zalo, Facebook, Threads... Mỗi Category có một màu riêng.
- **Nhóm**: một nhóm cụ thể thuộc Category, **mỗi nhóm có một URL riêng**. Tên nhóm không được trùng trong cùng một Category.

Các nhóm **đang hiện** chính là các dòng bạn thấy ở checklist **Nhóm** khi mở một khách hàng (bật/tắt "khách đã tham gia nhóm nào").

```az-demo
link-group-table
```

Bấm dấu **+** ở đầu dòng Category để mở bảng Nhóm bên trong. Khi bạn gõ vào ô tìm kiếm hoặc chọn lọc **Trạng thái nhóm**, các Category còn kết quả tự mở sẵn.

## Ai dùng được

Vào trang cần quyền **Xem nhóm liên kết** (`link_groups.view`). Theo cấu hình mặc định, **cả 4 vai trò** (Admin, Assistant, Manager, Employee) đều có quyền này, nên ai cũng mở được trang. Nhưng nút bấm thì tuỳ quyền:

| Việc | Quyền | Mặc định |
|---|---|---|
| Xem danh sách Category và Nhóm | `link_groups.view` | Mọi vai trò |
| **Thêm / Sửa** Category và Nhóm, **Khoá / Mở khoá** Category, **Ẩn / Hiện lại** Nhóm, **gán Quản lý chính** khi tạo/sửa nhóm | `link_groups.manage` | Admin, Assistant |
| **Xoá** Category hoặc Nhóm | `link_groups.delete` | Chỉ Admin |

Manager và Employee mặc định chỉ **xem**: trang không có nút "Thêm category mới", cột **Thao tác** chỉ hiện khi bạn có việc để làm. Admin có thể đổi quyền ở trang **Phân quyền**, nên bảng trên có thể khác thực tế ở công ty bạn.

> Danh sách nhóm đang hiện còn được dùng ở form khách hàng cho **mọi nhân viên**, nên nhân viên không vào trang này vẫn tick được nhóm cho khách của mình (nếu có quyền cập nhật nhóm của khách).

## Bắt đầu nhanh (người có quyền Thêm/Sửa)

1. Bấm **Thêm category mới**, nhập tên (ví dụ `Zalo`), chọn **màu hiển thị** và **thứ tự hiển thị** (số nhỏ hiện trước). Tên Category không được trùng.
2. Ở dòng Category vừa tạo, bấm **Thêm nhóm**.
3. Nhập **Tên nhóm** và **URL nhóm** (phải đúng định dạng đường dẫn, ví dụ `https://zalo.me/g/abcxyz`), tuỳ chọn **Thứ tự** và **Quản lý chính**.
4. Sau khi nhóm được tạo, bấm **Quản lý phụ / Content** ở dòng nhóm để thêm Quản lý phụ và Nhân viên Content.

## Giải thích cột và nút

**Bảng Category**

| Cột / Nút | Ý nghĩa |
|---|---|
| Category (nền tảng) | Tên nền tảng, hiện bằng Tag màu |
| Số nhóm | Số nhóm đang được liệt kê trong Category (khi đang lọc, số này chỉ đếm nhóm khớp bộ lọc) |
| Trạng thái | **Đang mở** hoặc **Đã khoá** |
| Thêm nhóm / Sửa | Tạo nhóm mới trong Category / đổi tên, màu, thứ tự |
| Khoá / Mở khoá | Đánh dấu Category đã khoá (xem mục Quy tắc bên dưới) |
| Xoá | Chỉ xoá được khi Category **chưa có nhóm nào** |

**Bảng Nhóm** (nằm trong Category)

| Cột / Nút | Ý nghĩa |
|---|---|
| Tên nhóm, URL | Tên và đường dẫn riêng của nhóm (bấm URL để mở nhóm ở tab mới) |
| Thứ tự | Số nhỏ hiện trước trong Category |
| Trạng thái | **Đang hiện** hoặc **Đang ẩn** |
| Quản lý chính/phụ | Tag vàng là Quản lý chính, Tag xanh `+N phụ` là số Quản lý phụ. Chưa gán thì hiện "Chưa gán chính" |
| Nhân viên Content | Số nhân viên Content của nhóm, hoặc "Chưa có" |
| Sửa | Đổi tên, URL, thứ tự, Quản lý chính |
| Quản lý phụ / Content | Mở hộp thoại bên dưới |
| Ẩn / Hiện lại | Ẩn nhóm khỏi checklist hoặc hiện lại |
| Xoá | Xoá hẳn nhóm (có điều kiện, xem bên dưới) |

## Quản lý chính, Quản lý phụ và Nhân viên Content

Mỗi nhóm có **một Quản lý chính** và có thể có nhiều **Quản lý phụ** và **Nhân viên Content**.

```az-demo
group-managers
```

| Việc | Admin | Quản lý chính | Quản lý phụ | Nhân viên Content |
|---|---|---|---|---|
| **Mở** hộp thoại (nút Quản lý phụ / Content) | Có | Có | Có | Có |
| Thêm / gỡ **Quản lý phụ** | Có | Có | Không | Không |
| Thêm / gỡ **Nhân viên Content** | Có | Có | Không | Không |

- Chỉ Admin và Quản lý chính mới thấy nút **Thêm** và nút gỡ. Người còn lại thấy hộp thoại ở chế độ chỉ xem kèm dòng giải thích.
- Một người **không thể vừa là Quản lý chính vừa là Quản lý phụ** (hoặc Nhân viên Content) của cùng một nhóm, và không thêm trùng được một người hai lần. Quản lý phụ và Nhân viên Content thì được phép trùng nhau.
- Danh sách người để chọn không phải toàn công ty: **Quản lý chính** và **Quản lý phụ** lấy từ cấu hình "Quản lý chính / Quản lý phụ - Nhóm liên kết", **Nhân viên Content** lấy từ cấu hình "Nhân viên Content". Admin chỉnh các cấu hình này ở trang **Quản lý phụ trách**. Mặc định là nhân viên Phòng Marketing, riêng Content còn lọc theo vị trí Content.
- Nút **Quản lý phụ / Content** chỉ hiện với Admin và người đã được gán vào nhóm đó. Nhóm chưa có Quản lý chính thì chỉ Admin thêm được Quản lý phụ/Content.
- Người được gán chỉ cần là nhân viên đang hoạt động; tài khoản đã khoá không thêm được.

Quản lý chính, Quản lý phụ và Nhân viên Content đều thấy nhóm của mình ở trang **Nhóm tôi quản lý**.

## Quy tắc và lưu ý

- **Ẩn khác Xoá.** Nhóm **đang ẩn** biến khỏi checklist Nhóm ở khách hàng, nhưng dữ liệu "đã tham gia" đã tick trước đó vẫn được giữ nguyên. Cần dừng dùng một nhóm thì hãy **Ẩn**.
- **Xoá nhóm** chỉ thành công khi chưa có dữ liệu "tham gia" nào của khách gắn với nhóm đó; nếu có, hệ thống báo số lượng và gợi ý dùng Ẩn. Bản ghi được đếm kể cả khi khách đã được tắt lại khỏi nhóm hoặc đang nằm trong Thùng rác, nên một nhóm từng được dùng thường không xoá được: hãy Ẩn.
- **Xoá Category** chỉ thành công khi Category không còn nhóm nào. Phải xoá hoặc chuyển hết nhóm trước.
- **Khoá Category hiện chỉ là đánh dấu.** Nút Khoá chỉ đổi Tag thành "Đã khoá"; nhóm trong Category đó vẫn thêm mới được và vẫn hiện ở checklist khách như bình thường. Muốn thực sự ngừng dùng thì Ẩn từng nhóm.
- **Không có liên hệ với "Nguồn".** Dòng chú thích đầu trang gợi ý đặt tên Category trùng tên Nguồn, nhưng thực tế checklist Nhóm ở form khách hàng hiện **tất cả nhóm đang hiện**, không lọc theo nguồn của khách.
- **Đổi tên nhóm không ảnh hưởng** dữ liệu "đã tham gia" của khách (liên kết theo nhóm, không theo tên).
- Mọi thao tác thêm, sửa, ẩn, khoá, xoá và đổi Quản lý phụ/Content đều được ghi vào **Nhật ký hệ thống**.
