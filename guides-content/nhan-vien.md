---
title: Nhân viên
slug: nhan-vien
sortOrder: 110
published: false
roles: []
positions: []
departments: []
permissions: [users.view]
---

## Trang này để làm gì

Trang **Quản lý nhân viên** là nơi tạo và quản lý tài khoản đăng nhập: thêm nhân viên, sửa vai trò / phòng ban / vị trí, khoá hoặc mở tài khoản, đặt lại mật khẩu, **duyệt hoặc từ chối** người tự đăng ký, và xoá tài khoản (có thùng rác để khôi phục). Trang có 3 tab: **Danh sách nhân viên**, **Chờ duyệt đăng ký** và **Đã xoá**.

## Ai dùng được & thấy gì

Vào trang cần quyền **Xem nhân viên** (`users.view`). Mỗi việc trên trang cần thêm một quyền riêng:

- **Thêm, Sửa, Reset Pass, Duyệt, Từ chối** cần `users.manage`.
- **Xoá**, tab **Đã xoá**, **Khôi phục** và **Xoá vĩnh viễn** cần `users.delete`.

Theo cấu hình mặc định: Admin, Assistant và Manager có `users.view` và `users.manage`; **chỉ Admin có `users.delete`**. Employee không có quyền nào ở trên (mục menu ẩn; nếu gõ thẳng đường dẫn sẽ bị đưa về trang Khách hàng kèm thông báo “Bạn không có quyền truy cập trang này”). Admin có thể đổi các quyền này ở trang **Phân quyền**, nên bảng dưới là *mặc định*.

Phạm vi nhân viên bạn thấy và quản lý phụ thuộc **phạm vi** của quyền, không phải tên vai trò:

- **Toàn bộ** (mặc định của Admin, Assistant): thấy và quản lý mọi nhân viên.
- **Phòng ban** (mặc định của Manager): chỉ thấy nhân viên thuộc phòng ban mình **quản lý**, cộng với **chính mình**. Phòng ban “mình quản lý” là phòng ban bạn được gán làm Quản lý ở trang Phòng ban, **không nhất thiết là phòng ban bạn thuộc về**.

```az-demo
user-actions-by-viewer
```

```az-demo
users-table viewer=admin
```

```az-demo
users-table viewer=manager
```

Dữ liệu trong mẫu là giả định. Ở bản Manager, bảng chỉ có nhân viên phòng “Kinh doanh 1” (phòng người đó quản lý) và không có tab **Đã xoá**.

## Bắt đầu nhanh

**Thêm một nhân viên**

1. Ở tab **Danh sách nhân viên**, bấm **Thêm nhân viên**.
2. Nhập **Email**, **Họ và tên**, **Mật khẩu**, chọn **Vai trò** (và **Phòng ban**, **Vị trí** nếu cần).
3. Bấm **OK**. Nhân viên đăng nhập được ngay bằng email và mật khẩu bạn vừa đặt.

**Sửa một nhân viên**: bấm **Sửa** ở dòng đó, đổi thông tin rồi bấm **OK**.

**Duyệt người tự đăng ký**: chuyển sang tab **Chờ duyệt đăng ký**, bấm **Duyệt**, kiểm tra lại vai trò / phòng ban / vị trí rồi bấm **Xác nhận duyệt**.

## Cửa sổ Thêm / Sửa nhân viên

```az-demo
user-form mode=create viewer=admin
```

```az-demo
user-form mode=edit viewer=manager
```

| Ô | Ý nghĩa |
|---|---|
| **Email** | Là tên đăng nhập. **Khoá khi Sửa**, không đổi được ở đây. Email đã tồn tại sẽ báo lỗi. |
| **Mã nhân viên** | Để trống thì hệ thống tự sinh mã kế tiếp (AZ001, AZ002...). Tự nhập thì chỉ gồm chữ, số, dấu gạch ngang, tối đa 20 ký tự, và **không được trùng** mã đã có. |
| **Họ và tên** | Bắt buộc, ít nhất 2 ký tự. |
| **Số điện thoại** | Không bắt buộc. Nếu nhập phải là số Việt Nam hợp lệ (bắt đầu 09, 08, 07, 03 hoặc 05, đủ 10 số). |
| **Mật khẩu** | Chỉ có khi **Thêm mới**. Tối thiểu 8 ký tự, có chữ hoa, chữ thường, số và ký tự đặc biệt. Muốn đổi mật khẩu người đã có tài khoản, dùng nút **Reset Pass**. |
| **Vai trò** | Bắt buộc. Danh sách lấy từ các vai trò đang có (kể cả vai trò Admin đã tạo thêm). **Chỉ Admin mới thấy và gán được vai trò Admin**; Assistant và Manager không có lựa chọn này. |
| **Phòng ban** | Phòng ban nhân viên thuộc về. Với Manager (phạm vi Phòng ban) khi **Thêm mới** thì **bắt buộc chọn** một phòng ban mình quản lý. |
| **Vị trí** | Không bắt buộc, không cần cùng phòng ban đã chọn. Xoá lựa chọn rồi lưu để gỡ vị trí cũ. |
| **Người duyệt nghỉ phép (ngoại lệ)** | Chỉ dùng khi nhân viên này cần một Manager cụ thể duyệt nghỉ phép dù không cùng phòng ban với Manager đó. Để trống = duyệt theo Manager của phòng ban như bình thường. Chỉ liệt kê người có vai trò Manager. Chỉ ảnh hưởng module Nghỉ phép. |
| **Trạng thái** | **Hoạt động** hoặc **Khóa**. Tài khoản bị khoá không đăng nhập được. |
| **Root Admin** | Chỉ hiện với **Root Admin**, và chỉ khi Vai trò đang chọn là Admin. Xem mục “Root Admin” bên dưới. |

```az-demo
user-form mode=edit viewer=root
```

## Giải thích bảng danh sách

- **Mã NV**: mã nhân viên; dòng chưa có mã hiện “—”.
- **Chức vụ**: vai trò của nhân viên, tô màu theo màu Admin đặt cho vai trò đó. Người là Root Admin có thêm nhãn vàng **Root Admin**.
- **Phòng ban**, **Vị trí**: hiện “-” nếu chưa gán.
- **Trạng thái**: **Đang hoạt động** (xanh), **Không hoạt động** (đỏ, tài khoản bị khoá), **Đang chờ duyệt** (cam) hoặc **Đã bị từ chối** (đỏ).
- **Bộ lọc** phía trên bảng: ô **Tìm theo tên, email, mã NV...**, và các ô **Vai trò**, **Phòng ban**, **Vị trí**, **Trạng thái**. Đổi bộ lọc thì bảng quay về trang 1. Ô tìm kiếm hiện **chỉ tìm theo tên và email**, dù gợi ý trong ô có ghi “mã NV”.
- **Làm mới**: tải lại trang.
- Trên điện thoại, mỗi nhân viên hiện thành một thẻ với cùng các nút **Sửa**, **Reset Pass** và nút xoá (hình thùng rác).

## Các thao tác trên một nhân viên

| Nút | Ai thấy | Việc làm |
|---|---|---|
| **Sửa** | Có `users.manage`, và nhân viên đó nằm trong phạm vi của bạn | Mở cửa sổ **Sửa thông tin nhân viên**. |
| **Reset Pass** | Như **Sửa** | Mở **Đặt lại mật khẩu cho: ...**, nhập **Mật khẩu mới** (ít nhất 8 ký tự) và xác nhận. Người đó dùng mật khẩu mới ở lần đăng nhập kế tiếp. |
| **Xoá** | Có `users.delete` (mặc định chỉ Admin) | Chuyển tài khoản vào **thùng rác** (xoá mềm). **Không hiện** với chính bạn và với Root Admin. |

Xoá mềm không mất dữ liệu: người đó **không đăng nhập được ngay lập tức**, dữ liệu vẫn giữ nguyên, và có thể khôi phục ở tab **Đã xoá**.

## Duyệt đăng ký mới

Người tự đăng ký ở trang đăng nhập **luôn** vào trạng thái **Đang chờ duyệt** với vai trò Employee, và chưa đăng nhập được. Tab **Chờ duyệt đăng ký** liệt kê họ, kèm **Mã NV**, **Liên hệ**, **Phòng ban đăng ký**, **Vị trí đăng ký** và **Ngày đăng ký**; chữ **Chưa chọn** nghĩa là người đó bỏ trống ô đó. Số trên tab cho biết còn bao nhiêu người đang chờ.

- **Duyệt**: mở cửa sổ **Duyệt tài khoản**, cho phép bạn **chốt lại Vai trò, Phòng ban, Vị trí** chính thức (không phải cứ theo ý người đăng ký) rồi bấm **Xác nhận duyệt**. Từ lúc này người đó đăng nhập được.
- **Từ chối**: mở cửa sổ **Từ chối tài khoản**, có ô **Lý do từ chối (không bắt buộc)**. Tài khoản bị từ chối **không còn trong Danh sách nhân viên**, không đăng nhập được, và được chuyển vào tab **Đã xoá** kèm nhãn “Bị từ chối đăng ký” và lý do.
- Manager (phạm vi Phòng ban) chỉ thấy và chỉ duyệt / từ chối được người đăng ký vào **phòng ban mình quản lý**. Nếu Manager đổi phòng ban lúc duyệt, phòng ban mới cũng phải là phòng ban mình quản lý. Chỉ Admin duyệt được ai đó thành vai trò Admin.
- Mỗi người chỉ xử lý được một lần: tài khoản đã duyệt hoặc đã từ chối thì không còn ở trạng thái chờ.

## Thùng rác: tab Đã xoá

Chỉ người có `users.delete` thấy tab này. Mỗi dòng cho biết **Đã xoá lúc**, **Người xoá** và **Lý do xoá** (có nội dung khi là tài khoản bị từ chối đăng ký).

- **Khôi phục**: tài khoản đăng nhập được lại và quay về **Danh sách nhân viên**. Riêng tài khoản từng bị **từ chối đăng ký** thì khi khôi phục sẽ quay về **Đang chờ duyệt** để duyệt lại, chứ không tự có quyền đăng nhập.
- **Xoá vĩnh viễn**: chỉ làm được với tài khoản **đã ở thùng rác** (phải xoá mềm trước). **Không thể hoàn tác.** Khách hàng, khoản nạp và các dữ liệu khác đang đứng tên người đó sẽ **chuyển sang cho chính bạn** (người bấm xoá); lịch sử giao nhận data liên quan đến người đó bị xoá hẳn. Hãy chắc chắn trước khi bấm **Tôi hiểu, xoá vĩnh viễn**.

## Root Admin

**Root Admin** là Admin đặc biệt luôn giữ đủ quyền dù ma trận phân quyền của vai trò Admin có bị sửa hay thu hồi thế nào. Có thể có nhiều Root Admin.

- Chỉ **Root Admin** thấy công tắc **Root Admin** ở cửa sổ Thêm / Sửa, và chỉ khi Vai trò đang chọn là Admin.
- Mỗi lần **đổi** trạng thái Root Admin của ai đó, bạn phải nhập lại **Mật khẩu hiện tại của bạn** (mật khẩu của chính bạn, không phải của người kia).
- Bạn **không tự đổi** được trạng thái Root Admin của chính mình, phải nhờ Root Admin khác.
- Không gỡ được **Root Admin cuối cùng** của hệ thống; phải chỉ định ít nhất một người khác trước.
- Tài khoản Root Admin **không xoá được** (cả xoá mềm lẫn xoá vĩnh viễn) cho tới khi gỡ trạng thái Root Admin.

## Quy tắc & lưu ý

- **Không tự làm với chính mình**: bạn không tự đổi **Vai trò** của mình, không tự chuyển mình sang **Khóa** (ô **Trạng thái** ẩn khi bạn sửa chính mình), và không tự xoá mình. Cần thì nhờ người khác có quyền.
- **Phòng ban khi sửa (Manager)**: Manager chỉ chuyển được nhân viên sang phòng ban mình quản lý.
- **Đổi có hiệu lực nhanh**: khi bạn đổi vai trò, phòng ban hoặc khoá một tài khoản, quyền của người đó cập nhật gần như ngay (trong khoảng vài giây).
- **Ai làm gì được ghi vào Nhật ký hệ thống**: tạo, sửa, duyệt, từ chối, đặt lại mật khẩu, xoá, khôi phục và xoá vĩnh viễn.
- **Người duyệt nghỉ phép (ngoại lệ) nên đặt ở bước Sửa**: ô này có cả ở cửa sổ **Thêm nhân viên mới**, nhưng hiện máy chủ chỉ nhận giá trị này khi **Sửa**. Nếu chọn ngay lúc thêm mà bị báo lỗi, hãy bỏ trống, tạo xong rồi bấm **Sửa** để chọn.
- Danh sách phân trang, mặc định 20 dòng mỗi trang.

## Vì sao tôi không thấy …?

- **Không thấy mục Nhân viên trong menu**: tài khoản của bạn chưa có quyền `users.view`. Nhờ Admin cấp ở trang **Phân quyền**.
- **Thấy danh sách nhưng không có nút Sửa / Reset Pass / Thêm nhân viên**: bạn có xem nhưng chưa có `users.manage`.
- **Không thấy nút Xoá hay tab Đã xoá**: chưa có `users.delete` (mặc định chỉ Admin).
- **Không thấy nút Xoá ở một dòng**: dòng đó là chính bạn hoặc là Root Admin.
- **Manager không thấy một nhân viên**: người đó không thuộc phòng ban bạn **quản lý** (kể cả khi bạn cùng thuộc phòng ban đó nhưng không được gán làm Quản lý). Nhờ Admin kiểm tra ở trang **Phòng ban**.
- **Không thấy người vừa đăng ký trong Danh sách nhân viên**: họ đang ở tab **Chờ duyệt đăng ký**, hoặc đã bị từ chối nên nằm ở **Đã xoá**.
- **Không chọn được vai trò Admin**: chỉ Admin được gán vai trò này.
- **Không sửa được Email**: Email là tên đăng nhập, bị khoá khi Sửa. Người dùng tự đổi email ở trang **Profile** nếu được cấp quyền.

## Xem thêm

- [Profile](/huong-dan/profile): người dùng tự đổi tên, số điện thoại, mật khẩu của mình.
- [Duyệt phép](/huong-dan/duyet-phep): “Người duyệt nghỉ phép (ngoại lệ)” ảnh hưởng ai duyệt đơn.
- [Thùng rác](/huong-dan/thung-rac): thùng rác khách hàng, khác với tab **Đã xoá** của nhân viên.
