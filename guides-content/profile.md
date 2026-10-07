---
title: Profile
slug: profile
sortOrder: 75
published: false
roles: []
positions: []
departments: []
permissions: []
---

## Trang này để làm gì

Trang **Profile** là hồ sơ tài khoản của bạn: xem thông tin cá nhân, **đổi ảnh đại diện**, **sửa tên / số điện thoại**, **đổi mật khẩu**, và xem các **Fanpage / Group** bạn đang là Quản lý chính hoặc phụ. Nếu bạn có quyền xem nhân viên, trang còn cho xem Profile của người khác.

## Ai dùng được & thấy gì

Mọi người đăng nhập đều vào được **Profile của mình**. Riêng việc **xem Profile người khác** cần quyền **Xem nhân viên** (`users.view`).

```az-demo
profile-actions
```

Theo cấu hình mặc định:

- **Employee**: chỉ thấy Profile của chính mình (tiêu đề “Profile của tôi”).
- **Admin / Assistant**: thấy danh sách mọi nhân viên bên trái, bấm để xem Profile bên phải.
- **Manager**: có danh sách, nhưng chỉ gồm nhân viên **thuộc phòng ban mình quản lý**.

Admin có thể đổi các quyền này trong trang **Phân quyền**.

## Bắt đầu nhanh

1. Mở **Profile** ở menu. Xem thông tin của bạn ở bảng chính.
2. Muốn đổi **ảnh đại diện**: bấm biểu tượng máy ảnh ở góc ảnh, chọn ảnh JPG, PNG hoặc WebP.
3. Muốn sửa **tên / số điện thoại**: bấm **Chỉnh sửa**, sửa rồi bấm **Lưu**.
4. Muốn đổi mật khẩu: bấm **Đổi mật khẩu** và làm theo mục bên dưới.

```az-demo
profile-card viewer=employee
```

## Giải thích từng mục thông tin

- **Email**, **Số điện thoại**, **Phòng ban**, **Vị trí**: thông tin tài khoản. **Phòng ban** và **Vị trí** chỉ để xem, bạn không tự sửa được (nhờ Admin/Manager đổi ở trang Nhân viên).
- **Ngày tham gia** và **Đăng nhập gần nhất**: hệ thống tự ghi.
- **Phép năm còn lại** (ví dụ “9 / 12 ngày (năm 2026)”) và **Phép bù tích lũy**: số ngày phép hiện có, xem thêm ở [Nghỉ phép](/huong-dan/nghi-phep).
- Nhãn **Đang hoạt động** / **Bị khóa**: trạng thái tài khoản.

## Sửa thông tin cá nhân

```az-demo
profile-edit viewer=employee
```

- **Họ và tên**: bắt buộc, tối thiểu 2 ký tự.
- **Số điện thoại**: đúng định dạng số Việt Nam (bắt đầu 09, 08, 07, 03 hoặc 05, đủ 10 số).
- **Email**: mặc định chỉ **Admin** được sửa, các vai trò khác thấy ô này bị khoá với nhãn “Email (không có quyền sửa)”. Khi đổi Email phải **nhập mật khẩu hiện tại** để xác nhận, và Email không được trùng tài khoản khác. Email là tên đăng nhập, nên đổi xong hãy dùng Email mới để đăng nhập.

Ví dụ với Admin (được sửa Email):

```az-demo
profile-edit viewer=admin
```

## Đổi mật khẩu

1. Bấm **Đổi mật khẩu**.
2. Nhập **Mật khẩu hiện tại**, **Mật khẩu mới** (tối thiểu 6 ký tự) và **Nhập lại mật khẩu mới** (phải khớp).
3. Bấm **Đổi mật khẩu** ở cuối cửa sổ.

Sau khi đổi, hệ thống thu hồi phiên đăng nhập đã lưu, nên các thiết bị khác sẽ phải **đăng nhập lại bằng mật khẩu mới**. Nếu quên mật khẩu hiện tại, nhờ Admin đặt lại mật khẩu cho bạn.

## Ảnh đại diện

- Chấp nhận ảnh **JPG, PNG, WebP**.
- Dung lượng tối đa mặc định là **1 MB** (Admin có thể thay đổi giới hạn này).
- Ảnh mới hiện ngay ở Profile sau khi tải lên thành công.

## Fanpage / Group đang quản lý

```az-demo
profile-groups
```

Mục này **tự động** liệt kê các nhóm mà bạn là **Quản lý chính** (biểu tượng vương miện, nhãn vàng) hoặc **Quản lý phụ** (nhãn xanh). Bạn **không sửa trực tiếp** ở đây. Muốn thêm/bớt Quản lý phụ cho nhóm của mình, bấm liên kết đến [Nhóm tôi quản lý](/huong-dan/nhom-toi-quan-ly); việc gán Quản lý chính do Admin làm ở [Nhóm liên kết](/huong-dan/nhom-lien-ket). Bấm **Tải lại** để cập nhật danh sách.

## Xem Profile người khác (Admin / Assistant / Manager)

- Dùng ô **Tìm theo tên, email**, lọc **Phòng ban** và **Chức vụ** để tìm người.
- Bấm vào dòng (hoặc biểu tượng con mắt) để xem Profile bên phải. Trên điện thoại, Profile mở ra toàn màn hình.
- Khi xem **người khác**, bạn chỉ **xem**: không có nút Chỉnh sửa hay Đổi mật khẩu (các việc này chỉ làm trên Profile của chính mình).
- Nếu có quyền **Xoá tài khoản** (mặc định chỉ Admin), nút **Xoá tài khoản** hiện ở Profile người khác. Tài khoản bị chuyển vào [Thùng rác](/huong-dan/thung-rac), có thể khôi phục, và người đó không đăng nhập được nữa ngay lập tức.

## Quy tắc & lưu ý

- Mọi thay đổi hồ sơ (sửa thông tin, đổi Email, đổi mật khẩu) đều được ghi vào **Nhật ký hệ thống**.

## Vì sao tôi không thấy …?

- **Không có nút Chỉnh sửa**: tài khoản của bạn chưa có quyền sửa thông tin cá nhân (`profile.edit_info`) hoặc Email (`profile.edit_email`).
- **Ô Email bị khoá**: chỉ Admin (mặc định) được đổi Email, nhờ Admin đổi hoặc mở quyền.
- **Không có nút Đổi mật khẩu**: thiếu quyền `profile.change_password`.
- **Không đổi được ảnh đại diện**: thiếu quyền `profile.edit_avatar`, hoặc ảnh sai định dạng / quá dung lượng.
- **Không thấy danh sách nhân viên**: thiếu quyền Xem nhân viên (`users.view`), trang chỉ hiện Profile của bạn.
- **Mục Fanpage / Group trống**: bạn chưa được gán làm Quản lý chính/phụ của nhóm nào.

## Xem thêm

- [Nhóm tôi quản lý](/huong-dan/nhom-toi-quan-ly)
- [Nhóm liên kết](/huong-dan/nhom-lien-ket)
- [Nghỉ phép](/huong-dan/nghi-phep)
