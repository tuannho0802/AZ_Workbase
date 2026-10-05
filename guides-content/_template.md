---
title: Tên trang (hiển thị ở mục lục)
slug: ten-bai            # PHẢI trùng tên file (ten-bai.md); chữ thường, số, gạch ngang
sortOrder: 10            # số nhỏ hiện trước
published: false         # false = nháp (chỉ người có guides.manage thấy); đổi true khi đã đối chiếu xong
roles: []                # code role được xem; [] = mọi role. Ví dụ: [admin, manager]
positions: []            # code vị trí được xem; [] = mọi vị trí
departments: []          # TÊN phòng ban được xem; [] = mọi phòng ban. Ví dụ: ["Kinh doanh 1"]
permissions: []          # người xem phải có TẤT CẢ quyền này (AND). Ví dụ: [customers.view]
excludeRoles: []         # (tuỳ chọn) code role BỊ LOẠI TRỪ, thắng "được xem". Ví dụ: [employee]
excludePositions: []     # (tuỳ chọn) code vị trí bị loại trừ. Ví dụ: [media] = mọi người xem được, trừ Media
excludeDepartments: []   # (tuỳ chọn) TÊN phòng ban bị loại trừ. Không được trùng với danh sách "được xem" cùng chiều
---

## Trang này để làm gì

1–2 câu: trang giải quyết việc gì, ai dùng.

## Ai dùng được & thấy gì

Bảng theo vai trò (hoặc mẫu `*-by-viewer` nếu trang có phạm vi dữ liệu).

```az-demo
customer-table-by-viewer persona=manager
```

## Bắt đầu nhanh

1. Bước 1 …
2. Bước 2 …
3. Bước 3 …

## Giải thích từng cột / nút / bộ lọc

Chỉ viết những gì THẬT SỰ có trên trang, đúng chữ trên giao diện.

## Quy tắc & lưu ý nghiệp vụ

- Ràng buộc, thứ không xoá được, ảnh hưởng sang trang khác.

## Vì sao tôi không thấy …?

- Thiếu quyền / ngoài phạm vi / bị ẩn theo vị trí.

## Xem thêm

- [Bài liên quan](/huong-dan/ten-bai-khac)
