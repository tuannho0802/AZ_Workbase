/**
 * Kiểm tra quyền "quản lý chính/phụ" của 1 LinkGroup - giống tinh thần
 * CustomerAccessHelper nhưng đơn giản hơn (không có khái niệm "owner tạo
 * ra" - chỉ có primary/secondary manager, do ADMIN/ASSISTANT gán).
 *
 * ⚠️ BUG ĐÃ SỬA (phát hiện khi rà soát dynamic RBAC): bản trước tự nhận
 * tham số `userRole` rồi so sánh cứng `userRole === Role.ADMIN` ngay trong
 * helper - thiếu hẳn `Role.ASSISTANT` (vi phạm trực tiếp rule xuyên suốt dự
 * án "Assistant = Admin trừ Xoá, không có ngoại lệ nào khác"), và HOÀN TOÀN
 * không biết gì về `role_permissions`/role tuỳ chỉnh Admin tự tạo qua trang
 * Phân quyền - dù Admin cấp quyền `link_groups.manage` cho 1 role tuỳ chỉnh
 * (vd "team_lead"), code này vẫn luôn trả `false` cho role đó vì chỉ nhận
 * đúng chuỗi `'admin'`.
 *
 * => SỬA: helper KHÔNG tự quyết định "role nào có quyền rộng" nữa - nhận
 * thẳng `hasBroadAccess: boolean` đã được tầng SERVICE tính sẵn (qua
 * `PermissionsService.hasPermission(role, 'link_groups.manage')` + luôn có
 * lối thoát hiểm cứng cho `Role.ADMIN` - xem `LinkGroupManagersService.
 * hasBroadLinkGroupAccess()`). Nhờ vậy helper vẫn là hàm thuần (dễ unit
 * test, không phụ thuộc DB), còn logic "ai có quyền rộng" chỉ có ĐÚNG 1 nơi
 * quyết định (service), khớp đúng nguyên tắc "1 nguồn áp filter duy nhất"
 * đã áp dụng cho toàn bộ các module khác trong dự án.
 */
export class LinkGroupAccessHelper {
  /**
   * Có được XEM/thao tác trên nhóm này không - true nếu có quyền rộng
   * (`hasBroadAccess`, do tầng service tính), HOẶC là quản lý chính, HOẶC
   * nằm trong danh sách quản lý phụ.
   */
  static canManage(
    userId: number,
    hasBroadAccess: boolean,
    primaryManagerId: number | null,
    secondaryManagerUserIds: number[],
  ): boolean {
    if (hasBroadAccess) return true;
    if (primaryManagerId != null && primaryManagerId === userId) return true;
    return secondaryManagerUserIds.includes(userId);
  }

  /**
   * Có quyền THÊM/XOÁ quản lý phụ không - CHỈ người có quyền rộng
   * (`hasBroadAccess`) hoặc CHÍNH quản lý chính của nhóm đó (quản lý phụ
   * KHÔNG có quyền thêm/xoá quản lý phụ khác - đúng theo yêu cầu nghiệp vụ:
   * "quản lý chính có quyền thêm hoặc xoá quản lý phụ").
   */
  static canEditSecondaryManagers(
    userId: number,
    hasBroadAccess: boolean,
    primaryManagerId: number | null,
  ): boolean {
    if (hasBroadAccess) return true;
    return primaryManagerId != null && primaryManagerId === userId;
  }
}