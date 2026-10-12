---
title: Quản lý lưu trữ ảnh
slug: luu-tru-anh
sortOrder: 170
published: false
roles: []
positions: []
departments: []
permissions: [storage.view]
---

## Trang này để làm gì

Trang **Quản lý lưu trữ ảnh** cho biết các ảnh của hệ thống (lưu trên dịch vụ B2) đang chiếm bao nhiêu dung lượng, cho xem ảnh theo từng nhóm, quản lý **Thư viện ảnh chung** và dọn các file không còn dùng.

## Ai dùng được & thấy gì

| Việc | Cần quyền | Mặc định |
|---|---|---|
| Vào trang, xem dung lượng, xem ảnh ở cả 3 nhóm | `storage.view` | Chỉ Admin |
| **Tính lại ngay**, **Đổi hạn mức mềm**, thêm/xoá ảnh ở **Thư viện ảnh chung**, tab **Dọn dẹp Media** | `storage.manage` | Chỉ Admin |

```az-demo
storage-tabs viewer=manage
```

Người chỉ có `storage.view` thấy 3 tab nhóm ảnh và không có tab **Dọn dẹp Media**. Thiếu `storage.view`, mục menu bị ẩn; gõ thẳng đường dẫn sẽ hiện cảnh báo "Bạn không có quyền truy cập trang này" và đưa về trang Khách hàng.

## Bắt đầu nhanh

1. Xem khung **Dung lượng đã dùng** ở đầu trang để biết đã dùng bao nhiêu so với hạn mức mềm.
2. Chọn tab nhóm ảnh cần xem (**Avatar nhân viên**, **Đính kèm nghỉ phép**, **Thư viện ảnh chung**).
3. Cần dọn file thừa: sang tab **Dọn dẹp Media**, chọn file rồi bấm **Xoá đã chọn**.

## Giải thích từng cột / nút / bộ lọc

### Khung Dung lượng đã dùng

```az-demo
storage-usage viewer=manage
```

- Thanh tiến độ hiển thị dạng "đã dùng / hạn mức GB", kèm dòng **Còn lại**. Từ 90% thanh đổi trạng thái cảnh báo, từ 100% chuyển màu lỗi.
- Ba ô nhỏ bên dưới là dung lượng và số file của từng nhóm ảnh.
- "Cập nhật lúc ..." là thời điểm số liệu được tính; đây là **số tính sẵn**, không phải số tức thời. Nút tải lại nhỏ (biểu tượng mũi tên) chỉ đọc lại số tính sẵn.
- **Tính lại ngay** (cần `storage.manage`): liệt kê toàn bộ file trên B2 và cộng lại dung lượng thật. Thao tác này tốn lượt gọi B2 nên không tự chạy; chỉ bấm khi thật sự cần.
- **Đổi hạn mức mềm** (cần `storage.manage`): nhập số GB mới (tối thiểu 1) rồi bấm dấu tick để lưu.
- Nếu khung hiện "Chưa có dữ liệu": số liệu chưa từng được tính. Người có `storage.manage` bấm **Tính lại ngay** để có số ngay.

### Các tab nhóm ảnh

Mỗi tab là một lưới ảnh thu nhỏ, mỗi ảnh có tên file và dung lượng; bấm vào ảnh để xem lớn. Bấm **Tải thêm** để xem tiếp khi còn ảnh.

- **Avatar nhân viên** và **Đính kèm nghỉ phép**: chỉ để xem, hiện ghi chú "Bucket này chỉ xem". Muốn xoá thì dùng tab **Dọn dẹp Media**.
- **Thư viện ảnh chung**: người có `storage.manage` thấy ô kéo thả **Kéo thả hoặc bấm để thêm ảnh vào thư viện chung** (JPEG/PNG/WEBP, tối đa 5MB) và biểu tượng thùng rác trên mỗi ảnh (có bước xác nhận **Xoá ảnh này khỏi thư viện?**).

### Tab Dọn dẹp Media

```az-demo
storage-cleanup
```

Chuyển qua lại giữa **Avatar nhân viên** và **Đính kèm nghỉ phép**. Bảng gồm ảnh nhỏ, **Tên file**, **Dung lượng** (bấm tiêu đề để sắp xếp), **Cập nhật lúc**. Tích chọn các file rồi bấm **Xoá đã chọn (n)**; **Bỏ chọn** để bỏ hết. Mỗi lần xoá tối đa 200 file. Nếu có file lỗi, hệ thống báo "thành công X/Y file, Z file lỗi".

## Quy tắc & lưu ý nghiệp vụ

- **Hạn mức là hạn mức mềm**: B2 không có giới hạn cứng, con số chỉ để theo dõi và tính thanh tiến độ. Vượt hạn mức **không chặn** việc tải ảnh lên.
- **Xoá là xoá thật trên B2 và không hoàn tác được.** Với avatar, hệ thống gỡ avatar khỏi hồ sơ nhân viên đang dùng file đó (người đó quay về không có ảnh); với đính kèm nghỉ phép, hệ thống xoá bản ghi đính kèm khỏi đơn nghỉ phép liên quan. Việc này làm trước khi xoá file thật để không để lại ảnh vỡ.
- Mỗi lần xoá được ghi vào **Nhật ký hệ thống** (xoá từng file, xoá hàng loạt, đổi hạn mức), kèm thông tin avatar/đơn nghỉ phép đã bị gỡ.
- Ảnh trong tab xem được tải bằng đường dẫn tạm thời (khoảng 10 phút); tải lại trang nếu ảnh không hiện sau khi để lâu.
- Thêm ảnh vào các nhóm **Avatar nhân viên** và **Đính kèm nghỉ phép** không làm ở trang này mà ở nơi nghiệp vụ tương ứng (hồ sơ nhân viên, đơn nghỉ phép).

## Vì sao tôi không thấy …?

- Không thấy mục **Quản lý lưu trữ ảnh**: bạn thiếu `storage.view`.
- Không thấy **Tính lại ngay**, **Đổi hạn mức mềm**, ô tải ảnh, biểu tượng thùng rác hay tab **Dọn dẹp Media**: bạn thiếu `storage.manage`.
- Không có thùng rác ở tab **Avatar nhân viên** / **Đính kèm nghỉ phép**: hai nhóm này chỉ xoá được trong tab **Dọn dẹp Media**.
- Dung lượng không đổi sau khi xoá: đây là số tính sẵn, cần **Tính lại ngay** để cập nhật.

## Xem thêm

- [Phân quyền](/huong-dan/phan-quyen)
- [Nhật ký hệ thống](/huong-dan/nhat-ky-he-thong)
- [Nghỉ phép](/huong-dan/nghi-phep)
- [Nhân viên](/huong-dan/nhan-vien)
