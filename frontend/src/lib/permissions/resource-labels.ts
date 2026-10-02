/**
 * Nhãn tiếng Việt của từng nhóm quyền (resource). Dùng chung cho trang Phân quyền và ô chọn quyền ở Hướng dẫn,
 * để cùng 1 resource luôn hiện cùng 1 tên. Resource chưa có nhãn -> hiện raw key (xem `resourceLabel`).
 */
export const RESOURCE_LABEL: Record<string, string> = {
  customers: 'Khách hàng',
  // ⚠️ BỔ SUNG (rà soát bảng điều khiển phân quyền 2026-09-08): resource
  // `customer_notes` đã tách riêng khỏi `customers.note` từ migration
  // `1779200000000-SplitCustomerNotesPermissions.ts` (3 permission
  // customer_notes.create/edit/delete) nhưng label bị thiếu ở đây -
  // trước đây rơi vào nhánh fallback `?? resource` nên Admin nhìn thấy
  // nhóm quyền hiện raw key "customer_notes" xấu và khó hiểu thay vì tên
  // tiếng Việt như các resource khác.
  customer_notes: 'Ghi chú khách hàng',
  // ⚠️ MỚI (2026-09-08): tách riêng khỏi `customers.edit` -
  // `customer_group_memberships.set` (bật/tắt "đã tham gia nhóm" ở tab
  // "Nhóm" trong chi tiết KH, và lúc tạo mới KH) - xem PERMISSIONS.md mục 3.
  customer_group_memberships: 'Tham gia nhóm (Checklist KH)',
  leave_requests: 'Nghỉ phép',
  attendance: 'Chấm công',
  reports: 'Báo cáo',
  // ⚠️ "users" gộp chung 2 trang: "/users" (Nhân viên) VÀ "/profile" (chế độ
  // xem Profile người khác) - CÙNG 1 permission users.view, không tách
  // riêng permission cho Profile (đúng kiến trúc, tránh trùng lặp permission
  // cho cùng 1 khả năng) - đổi label để Admin thấy rõ phạm vi ảnh hưởng thật,
  // không hiểu lầm là chỉ liên quan trang "Nhân viên".
  users: 'Nhân viên & Profile',
  // MỚI (migration AddUserSoftDeleteAndProfilePermissions): 3 permission
  // "tự phục vụ" (`profile.edit_info`/`profile.change_password`/
  // `profile.edit_email`) - tách riêng resource `profile` khỏi `users` vì
  // đây là hành động CHÍNH MÌNH làm trên hồ sơ CỦA MÌNH (PATCH /users/me/*),
  // khác hẳn `users.manage` (Admin/Assistant/Manager sửa NGƯỜI KHÁC).
  profile: 'Hồ sơ cá nhân (Tự phục vụ)',
  roles: 'Phân quyền',
  departments: 'Phòng ban',
  link_groups: 'Nhóm liên kết',
  // 6 key utms.* (migration SeedUtmPermissions) - tránh rơi vào fallback `?? resource`.
  utms: 'UTM',
  media_sources: 'Nguồn Media',
  audit: 'Nhật ký hệ thống',
  // ⚠️ BỔ SUNG (2026-09-10, cùng lúc tách `assignment_groups.manage` thành
  // view/create/update/delete): resource này trước đó rơi vào fallback
  // `?? resource`, Admin nhìn thấy nhóm quyền hiện raw key
  // "assignment_groups" thay vì tên tiếng Việt như các resource khác.
  assignment_groups: 'Quản lý phụ trách',
  leave_types: 'Loại phép',
  // ⚠️ BỔ SUNG (2026-09-10, cùng lúc tách `customer_statuses.manage` thành
  positions: 'Vị trí',
  customer_statuses: 'Trạng thái khách hàng',
  // ⚠️ BỔ SUNG (2026-09-10, cùng lúc tách `customer_statuses.manage` thành
  // view/create/update/delete): resource này trước đó rơi vào fallback
  // `?? resource`, Admin nhìn thấy nhóm quyền hiện raw key
  // "customer_statuses" thay vì tên tiếng Việt như các resource khác.
  storage: 'Lưu trữ hình ảnh',
  uploads: 'Tải lên hình ảnh',
  // ⚠️ BỔ SUNG (2026-09-15, phát hiện lúc làm FE Phase 5 "Khoá/Mở khoá" module
  // Công việc định kỳ): 2 resource này có từ Phase 1 (`periodic_tasks`) và
  // migration `CreatePeriodicTaskStatuses` (`periodic_task_statuses`) nhưng
  // CHƯA từng có label ở đây - rơi vào fallback `?? resource`, Admin nhìn
  // thấy toàn bộ nhóm quyền "Công việc định kỳ" (view/create/edit/delete/
  // approve/edit_locked/link_customer...) hiện raw key xấu thay vì tiếng
  // Việt, không riêng 2 permission mới của Phase 5.
  periodic_tasks: 'Công việc định kỳ',
  periodic_task_statuses: 'Trạng thái công việc định kỳ',
  notification_broadcasts: 'Thông báo thủ công',
  guides: 'Hướng dẫn sử dụng',
};

export const resourceLabel = (resource: string): string => RESOURCE_LABEL[resource] ?? resource;
