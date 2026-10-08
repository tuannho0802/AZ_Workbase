---
title: Phòng ban
slug: phong-ban
sortOrder: 120
published: false
roles: []
positions: []
departments: []
permissions: [departments.view]
---

## Trang này để làm gì

Trang **Quản lý phòng ban** (mục **Phòng ban** ở menu) là nơi tạo và sửa danh sách phòng ban, chọn **màu Tag** cho từng phòng, và quan trọng nhất là **gán Quản lý (Manager)** cho phòng đó. Người được gán ở đây quyết định **phạm vi “Phòng ban”** của chính họ ở nhiều trang khác (Khách hàng, Nhân viên, Nghỉ phép, Chấm công...). Trang cũng có nút **Xem** để mở danh sách nhân viên của một phòng, và nút **Xoá** (kèm di dời nhân viên).

## Ai dùng được & thấy gì

Vào trang cần quyền **Xem phòng ban** (`departments.view`). Mỗi việc trên trang cần thêm một quyền riêng:

| Việc | Cần quyền | Mặc định |
|---|---|---|
| Vào trang, xem danh sách | `departments.view` | Cả 4 vai trò: Admin, Assistant, Manager, Employee |
| Nút **Thêm phòng ban**, nút **Sửa** | `departments.manage` | Admin, Assistant |
| Nút **Xoá** | `departments.delete` | Chỉ Admin |
| Nút **Xem** (danh sách nhân viên của phòng) | `users.view` | Admin, Assistant, Manager |

Admin có thể đổi các quyền này ở trang **Phân quyền**, nên bảng trên là *mặc định*. Nếu bạn không có `departments.view`, mục menu bị ẩn và gõ thẳng đường dẫn sẽ đưa bạn về trang Khách hàng.

Thu quyền **Xem phòng ban** chỉ ẩn trang quản lý này. Các ô chọn phòng ban ở nơi khác (ví dụ khi tạo khách hàng) vẫn hoạt động cho mọi người đã đăng nhập.

```az-demo
department-table viewer=admin
```

```az-demo
department-table viewer=assistant
```

```az-demo
department-table viewer=employee
```

Dữ liệu trong mẫu là giả định. Với Employee (mặc định chỉ có quyền xem), trang không có nút **Thêm phòng ban** và **không có cả cột Thao tác**.

## Bắt đầu nhanh

**Thêm một phòng ban**

1. Bấm **Thêm phòng ban**.
2. Nhập **Tên phòng ban**, có thể thêm **Mô tả** và chọn **Màu hiển thị (Tag)**.
3. Bấm **OK**. Hệ thống báo “Đã tạo phòng ban mới”.

**Gán Quản lý cho phòng ban**

1. Ở dòng phòng ban, bấm **Sửa**.
2. Ở ô **Quản lý phòng ban (Manager)**, chọn một hoặc nhiều người.
3. Bấm **OK**.

Ô **Quản lý** và công tắc **Trạng thái hoạt động** **chỉ có khi Sửa**, không có khi Thêm mới. Muốn gán Quản lý cho phòng vừa tạo, tạo xong hãy bấm **Sửa**.

## Cửa sổ Thêm / Sửa phòng ban

```az-demo
department-form mode=create
```

```az-demo
department-form mode=edit
```

| Ô | Ý nghĩa |
|---|---|
| **Tên phòng ban** | Bắt buộc, tối đa 100 ký tự. **Không được trùng** tên phòng đã có (kể cả phòng đã bị tắt trạng thái, xem bên dưới); trùng sẽ báo “Tên phòng ban đã tồn tại”. |
| **Mô tả (tuỳ chọn)** | Ghi chú ngắn, hiện ở cột **Mô tả**. |
| **Màu hiển thị (Tag)** | Màu của Tag phòng ban trong bảng và ở các nơi liên quan (Vị trí, chi tiết khách hàng, chọn Sales/Marketing phụ trách...). Mặc định xanh `#1890ff`. |
| **Quản lý phòng ban (Manager)** | Chỉ khi Sửa. Chọn **nhiều** người cùng quản lý một phòng. Danh sách thay thế **toàn bộ** danh sách cũ: ai không còn được chọn sẽ bị gỡ; để trống rồi lưu thì gỡ hết. Chỉ chọn được người có vai trò **Admin, Assistant hoặc Manager** và tài khoản **đang hoạt động**. |
| **Trạng thái hoạt động** | Chỉ khi Sửa. Xem mục “Tắt trạng thái hoạt động” bên dưới trước khi gạt. |

## Giải thích bảng danh sách

- **Tên phòng ban**: Tag màu theo màu bạn đã chọn.
- **Mô tả**: hiện “—” nếu để trống.
- **Quản lý (Manager)**: mỗi người hiện thành một thẻ nhỏ gồm tên và vai trò; hiện **Chưa gán** nếu phòng chưa có ai quản lý.
- **Trạng thái**: **Đang hoạt động** (xanh) hoặc **Ngừng hoạt động** (đỏ).
- **Thao tác**: **Xem**, **Sửa**, **Xoá** theo quyền của bạn. Cột này không hiện nếu bạn không có quyền nào trong ba quyền tương ứng.
- **Bộ lọc** phía trên bảng: ô **Tìm theo tên phòng ban...** (lọc ngay trên danh sách đang có, không phân biệt hoa thường) và ô **Trạng thái**. Bảng không phân trang.
- Bấm **Xem** để mở ngăn **Nhân viên phòng “...”** (mô tả ngay bên dưới).

### Ngăn Nhân viên phòng ban

```az-demo
department-drawer
```

- Danh sách lấy theo **phạm vi xem nhân viên của bạn**: Admin và Assistant thấy đủ; Manager chỉ thấy nhân viên của phòng mình **quản lý** (và chính mình).
- Có cả tài khoản **đang bị khoá** và người **đang chờ duyệt đăng ký**; người mới nhất hiện trước, tối đa 100 người.
- Nhãn vàng **Manager** hiện với người có **vai trò** Manager, không phụ thuộc người đó có được gán quản lý phòng này hay không.
- Bấm vào một dòng để mở hồ sơ của người đó.

## “Quản lý phòng ban” khác với “thuộc phòng ban”

Đây là điểm dễ nhầm nhất. Một người có thể **thuộc** phòng A (hồ sơ nhân viên ghi phòng A) nhưng được gán **quản lý** phòng B. Phạm vi “Phòng ban” của họ ở các trang khác được tính theo **phòng họ quản lý (phòng B)**, không phải phòng họ thuộc về.

- Muốn Manager thấy và xử lý dữ liệu của một phòng, hãy **gán họ làm Quản lý của phòng đó ở trang này**. Chỉ sửa phòng ban trong hồ sơ nhân viên là chưa đủ.
- Một phòng có thể có **nhiều** Quản lý, và một người có thể quản lý **nhiều** phòng.
- Việc **khoá tài khoản** hay **đổi vai trò** một Manager **không tự gỡ** họ khỏi danh sách Quản lý của phòng. Xem mục lỗi khi lưu bên dưới.

## Xoá phòng ban

Cần quyền `departments.delete` (mặc định chỉ Admin). Hộp thoại **Xoá phòng ban** có hai dạng:

```az-demo
department-delete variant=with-users
```

```az-demo
department-delete variant=empty
```

- Hệ thống luôn phải còn **ít nhất một phòng ban**. Nút **Xoá** ẩn khi trong danh sách chỉ còn một phòng đang hoạt động.
- Nếu phòng còn nhân viên, bạn **bắt buộc chọn phòng ban đích** để di dời họ sang trước khi xoá. Hệ thống không tự chọn hộ; phòng đích phải khác phòng đang xoá. Sau khi xoá, thông báo cho biết đã di dời bao nhiêu nhân viên.
- Xoá phòng ban **không hoàn tác được** từ giao diện. Hãy xem kỹ những thứ bị ảnh hưởng dưới đây.

**Thứ được giữ lại nhưng mất liên kết phòng ban**: khách hàng thuộc phòng đó (không mất dữ liệu, chỉ không còn phòng ban, gán lại sau được), công việc định kỳ gắn phòng đó, và các **Vị trí** đang gắn với phòng đó.

**Thứ bị xoá theo phòng ban**: danh sách Quản lý của phòng; các **ghi đè quyền theo phòng ban** trong Ma trận quyền; cấu hình **ẩn/hiện giao diện theo phòng ban**; phòng đó trong các **nhóm phụ trách**; và việc giới hạn bài hướng dẫn theo phòng đó.

Hệ thống ghi một dòng **Xoá phòng ban** vào Nhật ký hệ thống, kèm tên, mô tả, màu, số nhân viên đã di dời, phòng đích và số khách hàng bị ảnh hưởng.

## Tắt trạng thái hoạt động

Ở cửa sổ **Sửa** có công tắc **Trạng thái hoạt động**. Hiện tại trang và các ô chọn phòng ban khắp hệ thống chỉ lấy danh sách phòng **đang hoạt động**. Vì vậy khi bạn gạt sang **Ngừng hoạt động** và bấm **OK**:

- Phòng ban **biến khỏi danh sách** này và khỏi các ô chọn phòng ban (kể cả form đăng ký tài khoản). Bộ lọc **Trạng thái** ở trang này cũng vì thế **không tìm lại được** phòng đã tắt.
- Trang **không có nút bật lại**. Nếu lỡ tắt nhầm, hãy nhờ người quản trị kỹ thuật.
- Hệ thống **không tự đổi phòng ban** của các nhân viên đang thuộc phòng đó, và tên phòng vẫn **bị coi là đã dùng** khi đặt tên phòng mới.

Nếu mục đích của bạn là bỏ hẳn phòng ban, hãy dùng **Xoá** (có di dời nhân viên) thay vì tắt trạng thái.

## Quy tắc & lưu ý

- **Đổi Quản lý làm đổi phạm vi dữ liệu của người đó** ở các trang khác. Nếu họ chưa thấy phạm vi mới, nhờ họ tải lại trang.
- **Ai làm gì được ghi vào Nhật ký hệ thống**: tạo, sửa (kèm danh sách Quản lý trước và sau khi đổi) và xoá phòng ban.
- **Màu Tag** là tuỳ chọn thẩm mỹ, nhưng giúp phân biệt phòng ở các bảng khác.
- Danh sách phòng ban mới có thể cần tải lại trang (F5) ở máy người khác mới hiện trong ô chọn.

## Lỗi thường gặp khi lưu

- **“Tên phòng ban đã tồn tại”**: đổi tên khác. Nhớ rằng phòng đã bị tắt trạng thái vẫn giữ tên.
- **Báo lỗi về Manager “đang bị khoá tài khoản”**, “không tìm thấy user”, hoặc “chỉ có thể gán user có vai trò Admin/Assistant/Manager”: trong danh sách Quản lý của phòng vẫn còn một người đã bị khoá, đã bị xoá hoặc đã đổi sang vai trò khác. Họ vẫn hiện ở cột **Quản lý** nhưng **không có trong danh sách chọn**, nên trong ô **Quản lý phòng ban** có thể hiện như một dãy số thay vì tên. Hãy **gỡ người đó khỏi ô** rồi bấm **OK** lại.
- **Xoá báo phòng còn nhân viên dù hộp thoại ghi “không còn nhân viên”**: hộp thoại chỉ đếm nhân viên đang hoạt động, còn khi xoá hệ thống đếm **cả tài khoản bị khoá**. Hãy bấm **Xem** để biết còn ai, rồi chuyển họ sang phòng khác ở trang **Nhân viên** và xoá lại.

## Vì sao tôi không thấy …?

- **Không thấy mục Phòng ban trong menu**: tài khoản của bạn chưa có `departments.view`. Nhờ Admin cấp ở trang **Phân quyền**.
- **Thấy danh sách nhưng không có nút Thêm phòng ban / Sửa**: bạn chưa có `departments.manage`.
- **Không thấy nút Xoá**: bạn chưa có `departments.delete` (mặc định chỉ Admin), hoặc hệ thống chỉ còn một phòng đang hoạt động.
- **Không thấy nút Xem**: bạn chưa có `users.view`.
- **Ngăn Nhân viên ít người hơn bạn nghĩ** (Manager): bạn chỉ thấy nhân viên của phòng mình **quản lý**. Nhờ Admin kiểm tra bạn đã được gán Quản lý phòng đó chưa.
- **Một phòng ban đột nhiên mất**: có thể ai đó đã gạt **Ngừng hoạt động** (xem mục trên) hoặc đã xoá phòng. Kiểm tra ở **Nhật ký hệ thống**.
- **Không chọn được một người vào ô Quản lý**: chỉ chọn được người có vai trò Admin, Assistant hoặc Manager và đang hoạt động.

## Xem thêm

- [Nhân viên](/huong-dan/nhan-vien): đổi phòng ban của một nhân viên, và vì sao Manager chỉ thấy phòng mình quản lý.
- [Duyệt phép](/huong-dan/duyet-phep): Manager duyệt đơn nghỉ phép của phòng ban mình quản lý.
- [Khách hàng](/huong-dan/khach-hang): phạm vi xem khách theo phòng ban.
