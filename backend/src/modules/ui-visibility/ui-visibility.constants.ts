/**
 * Danh mục `resource`/`element_key` CỐ ĐỊNH trong code - Admin CHỈ được
 * bật/tắt (visible=true/false) qua UI, KHÔNG được tự thêm key tuỳ ý (đúng
 * triết lý bảng `permissions` gốc - xem PERMISSIONS.md mục 1.7 và
 * PLAN_POSITION_FIELD_VISIBILITY_ASSIGNMENT_GROUPS.md mục 3.5).
 *
 * Mở rộng resource/element_key mới PHẢI đi kèm:
 *  1. Thêm entry vào đúng danh sách bên dưới.
 *  2. Nếu là `field:*` (có field thật trên response entity) - thêm logic
 *     strip tương ứng vào `UiVisibilityService.stripHiddenCustomerFields()`
 *     (hoặc hàm strip tương ứng của resource đó nếu không phải `customers`).
 *  3. Nếu là `tab:*` (chỉ ẩn UI, không có field cần xoá ở BE) - thêm ghi chú
 *     rõ API con tương ứng ĐÃ có permission gate riêng đúng đắn (không dựa
 *     vào việc ẩn tab FE làm lớp bảo mật duy nhất).
 */

export const UI_VISIBILITY_RESOURCES = ['customers'] as const;
export type UiVisibilityResource = (typeof UI_VISIBILITY_RESOURCES)[number];

/**
 * `field:*` - có field thật trên response `Customer`, PHẢI được xoá khỏi
 * object trả về ở tầng service (KHÔNG set null - xem PLAN mục 2.5), áp dụng
 * cho cả `findAll()` lẫn `findOne()`.
 *
 * `tab:*` - KHÔNG có field tương ứng trên object `Customer` (data nằm ở API
 * con riêng: `/customers/:id/deposits`, `/customers/:id/assignments`,
 * `/customers/:id/group-memberships`) - ẩn THUẦN Ở FE (không render tab),
 * các API con đó đã tự gate đúng theo action permission hiện có
 * (`customers.edit` cho deposits POST, `customer_group_memberships.set` cho
 * groups...) nên gõ thẳng URL vẫn bị chặn đúng - KHÔNG dựa vào ẩn tab FE làm
 * lớp bảo mật.
 */
export const CUSTOMER_ELEMENT_KEYS = [
  'field:sales_assignment',
  'field:marketing_assignment',
  'field:assigned_date',
  'field:closed_date',
  'tab:deposits',
  'tab:assignments',
  'tab:groups',
] as const;
export type CustomerElementKey = (typeof CUSTOMER_ELEMENT_KEYS)[number];

const ELEMENT_KEYS_BY_RESOURCE: Record<UiVisibilityResource, readonly string[]> = {
  customers: CUSTOMER_ELEMENT_KEYS,
};

export function getElementKeysForResource(resource: string): readonly string[] | undefined {
  return ELEMENT_KEYS_BY_RESOURCE[resource as UiVisibilityResource];
}

export function isValidResource(resource: string): resource is UiVisibilityResource {
  return (UI_VISIBILITY_RESOURCES as readonly string[]).includes(resource);
}
