import { Role } from '../../../common/enums/role.enum';

/**
 * Kiểm tra quyền "quản lý chính/phụ" của 1 LinkGroup - giống tinh thần
 * CustomerAccessHelper nhưng đơn giản hơn (không có khái niệm "owner tạo
 * ra" - chỉ có primary/secondary manager, do ADMIN gán).
 *
 * Tách thành hàm thuần (nhận primitive id, không nhận cả object có
 * relation) để dễ unit test và không phụ thuộc TypeORM relation đã load
 * hay chưa - nơi gọi (service) chịu trách nhiệm load đủ dữ liệu trước.
 */
export class LinkGroupAccessHelper {
  /**
   * Có được XEM/thao tác trên nhóm này không - true nếu admin, HOẶC là
   * quản lý chính, HOẶC nằm trong danh sách quản lý phụ.
   */
  static canManage(
    userId: number,
    userRole: string,
    primaryManagerId: number | null,
    secondaryManagerUserIds: number[],
  ): boolean {
    if (userRole === Role.ADMIN) return true;
    if (primaryManagerId != null && primaryManagerId === userId) return true;
    return secondaryManagerUserIds.includes(userId);
  }

  /**
   * Có quyền THÊM/XOÁ quản lý phụ không - CHỈ admin hoặc CHÍNH quản lý
   * chính của nhóm đó (quản lý phụ KHÔNG có quyền thêm/xoá quản lý phụ
   * khác - đúng theo yêu cầu nghiệp vụ: "quản lý chính có quyền thêm hoặc
   * xoá quản lý phụ").
   */
  static canEditSecondaryManagers(
    userId: number,
    userRole: string,
    primaryManagerId: number | null,
  ): boolean {
    if (userRole === Role.ADMIN) return true;
    return primaryManagerId != null && primaryManagerId === userId;
  }
}
