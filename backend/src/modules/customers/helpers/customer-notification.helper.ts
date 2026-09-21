import { RecipientContext } from '../../notifications/catalog/recipient-resolvers';

/**
 * HÀM THUẦN (không DB, không Nest) phục vụ việc móc thông báo TỰ ĐỘNG vào
 * `CustomersService` (PLAN_NOTIFICATION_SYSTEM.md Phase 3, mục 4.3/6.3).
 * Tách riêng để test ma trận diff/gộp mà không cần dựng TestingModule.
 *
 * ⚠️ PII: snapshot ở đây CHỈ chứa id + tên khách + trạng thái/ngày chốt/phòng
 * ban - TUYỆT ĐỐI không có SĐT/email/số tiền (nguyên tắc 4).
 */

/** Trạng thái khách hàng "trước khi sửa" / "trước khi xoá" dùng để so sánh. */
export interface CustomerNotifySnapshot {
  id: number;
  name: string;
  salesUserId: number | null;
  marketingUserId: number | null;
  createdById: number | null;
  status: string | null;
  /** 'YYYY-MM-DD' (cột DATE) - đã chuẩn hoá bằng `normalizeDateOnly` */
  closedDate: string | null;
  departmentId: number | null;
  /** `customer_assignments` status ACTIVE (Sales được chia) */
  sharedSalesUserIds: number[];
}

/** Các field so sánh được ở "sau khi sửa". */
export type CustomerNotifyAfter = Pick<
  CustomerNotifySnapshot,
  'salesUserId' | 'marketingUserId' | 'status' | 'closedDate' | 'departmentId'
>;

/**
 * Cột DATE của TypeORM trả về chuỗi 'YYYY-MM-DD', nhưng sau `merge(dto)` giá
 * trị có thể là chuỗi ISO đầy đủ hoặc `Date` → chuẩn hoá về 'YYYY-MM-DD' cho
 * CẢ HAI phía trước khi so sánh, tránh báo "đổi ngày chốt" giả.
 */
export function normalizeDateOnly(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  if (typeof value === 'string') return value.slice(0, 10);
  return null;
}

/** `undefined` (field bị UI Visibility strip / không có trong kết quả) → dùng giá trị dự phòng. */
export function pickDefined<T>(value: T | undefined, fallback: T): T {
  return value === undefined ? fallback : value;
}

export function toRecipientCustomer(
  s: CustomerNotifySnapshot,
): NonNullable<RecipientContext['customer']> {
  return {
    salesUserId: s.salesUserId,
    marketingUserId: s.marketingUserId,
    createdById: s.createdById,
    sharedSalesUserIds: s.sharedSalesUserIds,
  };
}

export interface CustomerNotifyDiff {
  /** Sales/Marketing phụ trách có đổi không */
  ownerFieldsChanged: boolean;
  /** Người MỚI trở thành phụ trách (sales hoặc marketing) */
  newOwnerIds: number[];
  /** Người KHÔNG CÒN là phụ trách nào (không tính người vẫn còn giữ vai trò kia) */
  previousOwnerIds: number[];
  /**
   * Field thuộc allowlist (PLAN 4.3) đổi NGOÀI 2 field phụ trách:
   * `status`, `closedDate`, `departmentId`. Phụ trách đổi đã có event riêng
   * `customer.owner_changed` nên không lặp lại ở `customer.updated`.
   */
  changedFields: string[];
}

const ownerSet = (
  sales: number | null | undefined,
  marketing: number | null | undefined,
): Set<number> => {
  const s = new Set<number>();
  if (typeof sales === 'number') s.add(sales);
  if (typeof marketing === 'number') s.add(marketing);
  return s;
};

export function diffCustomerForNotification(
  before: CustomerNotifySnapshot,
  after: CustomerNotifyAfter,
): CustomerNotifyDiff {
  const ownerFieldsChanged =
    (before.salesUserId ?? null) !== (after.salesUserId ?? null) ||
    (before.marketingUserId ?? null) !== (after.marketingUserId ?? null);

  const beforeOwners = ownerSet(before.salesUserId, before.marketingUserId);
  const afterOwners = ownerSet(after.salesUserId, after.marketingUserId);
  const newOwnerIds = [...afterOwners].filter((id) => !beforeOwners.has(id));
  const previousOwnerIds = [...beforeOwners].filter((id) => !afterOwners.has(id));

  const changedFields: string[] = [];
  if ((before.status ?? null) !== (after.status ?? null)) changedFields.push('status');
  if (normalizeDateOnly(before.closedDate) !== normalizeDateOnly(after.closedDate))
    changedFields.push('closedDate');
  if ((before.departmentId ?? null) !== (after.departmentId ?? null))
    changedFields.push('departmentId');

  return { ownerFieldsChanged, newOwnerIds, previousOwnerIds, changedFields };
}

/**
 * Bỏ các user đã nhận `owner_changed` khỏi danh sách nhận `customer.updated`
 * để cùng 1 lần sửa không đẩy 2 thông báo cho cùng 1 người.
 */
export function excludeRecipients(
  customer: NonNullable<RecipientContext['customer']>,
  excludeIds: number[],
): NonNullable<RecipientContext['customer']> {
  const ex = new Set(excludeIds);
  const keep = (v: number | null | undefined) =>
    typeof v === 'number' && !ex.has(v) ? v : null;
  return {
    ...customer,
    salesUserId: keep(customer.salesUserId),
    marketingUserId: keep(customer.marketingUserId),
    sharedSalesUserIds: (customer.sharedSalesUserIds ?? []).filter((id) => !ex.has(id)),
  };
}

// ───────────────────────── bulkAssign ─────────────────────────

export interface BulkAssignNotifyGroup {
  targetUserId: number;
  /** true = "Sales phụ trách chính", false = "Sales được chia" */
  isPrimary: boolean;
  customers: { id: number; name: string }[];
}

/**
 * Gộp kết quả `bulkAssign` theo NGƯỜI NHẬN (PLAN 0.6/4.3): KHÔNG 1 thông báo
 * / khách. Mỗi người nhận có tối đa 2 nhóm - "phụ trách chính" và "được chia" -
 * vì template phân biệt 2 vai trò này (chỉ `salesUserIds[0]` mới có thể là
 * phụ trách chính, và chỉ với khách CHƯA có `salesUserId`, đúng như Bước 5
 * của `bulkAssign()`).
 *
 * Một cặp (khách, người) được báo khi: (a) vừa tạo lượt gán mới, HOẶC
 * (b) người đó vừa thành phụ trách chính (kể cả khi lượt gán active đã có sẵn).
 * Lượt gán đã tồn tại và không đổi vai trò → im lặng (không báo lặp).
 */
export function groupBulkAssignForNotification(input: {
  customers: { id: number; name: string; salesUserId: number | null }[];
  salesUserIds: number[];
  /** khoá `${customerId}-${userId}` của các lượt gán VỪA tạo */
  createdPairKeys: Set<string>;
}): BulkAssignNotifyGroup[] {
  const targets = [...new Set(input.salesUserIds)];
  const primaryUserId = input.salesUserIds[0];
  const out: BulkAssignNotifyGroup[] = [];

  for (const targetUserId of targets) {
    const primary: BulkAssignNotifyGroup['customers'] = [];
    const shared: BulkAssignNotifyGroup['customers'] = [];

    for (const c of input.customers) {
      const becomesPrimary = targetUserId === primaryUserId && !c.salesUserId;
      const created = input.createdPairKeys.has(`${c.id}-${targetUserId}`);
      if (!created && !becomesPrimary) continue;
      (becomesPrimary ? primary : shared).push({ id: c.id, name: c.name });
    }

    if (primary.length > 0)
      out.push({ targetUserId, isPrimary: true, customers: primary });
    if (shared.length > 0)
      out.push({ targetUserId, isPrimary: false, customers: shared });
  }
  return out;
}
