# guides-content — nguồn nội dung "Hướng dẫn sử dụng"

Mỗi file `<slug>.md` = 1 bài hướng dẫn. Đồng bộ vào bảng `guides` bằng `guides:sync` (xem `PLAN_GUIDES_CONTENT.md` §2.1).
File bắt đầu bằng `_` (vd `_template.md`) và `README.md` bị bỏ qua.

## Quy trình

1. Sao chép `_template.md` → `<slug>.md` (slug trùng tên file; danh sách slug chuẩn: `frontend/src/lib/guides/guide-slugs.ts`).
2. Viết nội dung. Trước khi viết: đọc trang + controller thật, **không chép từ tài liệu cũ** (mục 4 của plan: tiêu chí "xong").
3. Xoá slug đó khỏi `PENDING_GUIDE_SLUGS` ở `guide-slugs.ts` (test `nav-guide-coverage` đỏ nếu quên).
4. `cd frontend && npx vitest run src/lib/guides` — kiểm tra id/tham số mẫu minh hoạ, permission key, frontmatter.
5. Commit. Sau đó **bạn tự chạy** trên máy có trỏ tới DB đích:

```bash
cd backend
npm run guides:sync                      # CHẠY THỬ - chỉ in kế hoạch, không ghi
npm run guides:sync -- --apply           # ghi thật
npm run guides:sync -- --apply --force   # ghi đè cả bài đang xung đột
npm run guides:sync -- --only=khach-hang # chỉ 1 vài bài
```

## Frontmatter

| Khoá | Bắt buộc | Ý nghĩa |
|---|---|---|
| `title` | ✅ | Tiêu đề (≤ 200 ký tự) |
| `slug` | ✅ | Trùng tên file; chữ thường/số/gạch ngang |
| `sortOrder` | | Số nguyên ≥ 0, nhỏ hiện trước (mặc định 0) |
| `published` | | `true`/`false` (mặc định `false` = nháp) |
| `roles` | | **code** role được xem; `[]` = mọi role |
| `positions` | | **code** vị trí được xem; `[]` = mọi vị trí |
| `departments` | | **tên** phòng ban được xem; `[]` = mọi phòng ban |
| `permissions` | | key quyền người xem phải có **tất cả** (AND) |
| `excludeRoles` | | **code** role bị LOẠI TRỪ (không xem được); `[]` = không loại trừ role nào |
| `excludePositions` | | **code** vị trí bị loại trừ. Ví dụ bài cho mọi người trừ Media: `excludePositions: [media]` |
| `excludeDepartments` | | **tên** phòng ban bị loại trừ |

Các chiều role/vị trí/phòng ban/quyền kết hợp bằng AND (như trình soạn trên UI).

**Loại trừ thắng "được xem":** người thuộc BẤT KỲ mục `exclude*` nào thì không xem được (người không có giá trị ở chiều đó, vd chưa có vị trí, không bị loại trừ theo chiều đó). Cùng 1 giá trị không được nằm ở cả `positions` và `excludePositions` (tương tự role/phòng ban) - `guides:sync` báo lỗi. Người có `guides.manage` vẫn xem được để xem trước. Đổi `exclude*` được tính là thay đổi nội dung (đi vào hash) nên `guides:sync` sẽ cập nhật lên DB.

## Cách `guides:sync` quyết định

| Tình trạng | Hành động |
|---|---|
| Chưa có bài với slug đó | **Tạo** |
| DB trùng file | Không đổi (lần đầu chỉ ghi hash gốc) |
| File đổi, DB chưa bị sửa tay từ lần sync trước | **Cập nhật** |
| File đổi **và** DB đã bị sửa tay trên UI (hoặc bài tạo tay chưa từng sync) | **XUNG ĐỘT** — không ghi đè; thêm `--force` để file thắng |
| Có trong DB, không có file | Chỉ liệt kê, **không bao giờ xoá** |

Mọi lần ghi đi qua `GuidesService` (kiểm tra hợp lệ + transaction + audit `CREATE_GUIDE`/`UPDATE_GUIDE`). Cần migration `1785900000000-AddGuideSourceHash` (cột `guides.source_hash`) trước khi chạy `--apply`.
