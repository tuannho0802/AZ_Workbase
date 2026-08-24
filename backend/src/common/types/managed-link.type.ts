/**
 * Một link Fanpage/Group mà User được phân công quản lý.
 * Lưu dưới dạng JSON array trong cột `users.profile`.
 *
 * Ví dụ giá trị cột `profile`:
 * [
 *   { "type": "fanpage", "name": "AZ Land - Fanpage chính", "url": "https://facebook.com/az.land" },
 *   { "type": "group", "name": "AZ Land - Group nội bộ", "url": "https://facebook.com/groups/azland" }
 * ]
 */
export type ManagedLinkType = 'fanpage' | 'group';

export interface ManagedLink {
  type: ManagedLinkType;
  name: string;
  url: string;
}
