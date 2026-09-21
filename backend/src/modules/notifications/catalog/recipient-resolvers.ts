import {
  EVENT_CATALOG,
  NotificationEventType,
  RecipientRelation,
} from './event-catalog';

/**
 * Hàm THUẦN (không DB, không Nest) xác định "ai nhận" từ ngữ cảnh mà call site
 * đã có sẵn (PLAN 6.2: resolver ưu tiên dữ liệu call site, chỉ query khi thiếu).
 * Thuần → test ma trận event × relation dễ dàng.
 */
export interface RecipientContext {
  customer?: {
    salesUserId?: number | null;
    marketingUserId?: number | null;
    createdById?: number | null;
    /** `customer_assignments` status ACTIVE */
    sharedSalesUserIds?: number[];
  };
  task?: {
    primaryAssigneeId?: number | null;
    secondaryAssigneeIds?: number[];
    createdById?: number | null;
  };
  /** Người được gán / phụ trách MỚI (customer.* và task.*) */
  newUserIds?: number[];
  /** Người bị thay / bị gỡ / bị thu hồi */
  previousUserIds?: number[];
}

export interface ResolvedRecipient {
  userId: number;
  relation: RecipientRelation;
}

function idsFor(relation: RecipientRelation, ctx: RecipientContext): number[] {
  const single = (v: number | null | undefined): number[] =>
    typeof v === 'number' ? [v] : [];

  switch (relation) {
    case RecipientRelation.CUSTOMER_PRIMARY_SALES:
      return single(ctx.customer?.salesUserId);
    case RecipientRelation.CUSTOMER_MARKETING_OWNER:
      return single(ctx.customer?.marketingUserId);
    case RecipientRelation.CUSTOMER_SHARED_SALES:
      return ctx.customer?.sharedSalesUserIds ?? [];
    case RecipientRelation.CUSTOMER_CREATOR:
      return single(ctx.customer?.createdById);
    case RecipientRelation.TASK_PRIMARY_ASSIGNEE:
      return single(ctx.task?.primaryAssigneeId);
    case RecipientRelation.TASK_SECONDARY_ASSIGNEE:
      return ctx.task?.secondaryAssigneeIds ?? [];
    case RecipientRelation.TASK_CREATOR:
      return single(ctx.task?.createdById);
    case RecipientRelation.ASSIGNEE_NEW:
    case RecipientRelation.TASK_ASSIGNEE_NEW:
      return ctx.newUserIds ?? [];
    case RecipientRelation.ASSIGNEE_PREVIOUS:
    case RecipientRelation.TASK_ASSIGNEE_PREVIOUS:
      return ctx.previousUserIds ?? [];
    default:
      // MANUAL_RECIPIENT không suy ra từ quan hệ - do notification-broadcasts chọn.
      return [];
  }
}

/**
 * Trả danh sách người nhận đã KHỬ TRÙNG: 1 user khớp nhiều relation chỉ giữ
 * relation đứng TRƯỚC trong `EVENT_CATALOG[type].relations`.
 * KHÔNG lọc actor / user bị khoá / preference - việc đó thuộc `emit()`.
 */
export function resolveRecipients(
  type: NotificationEventType,
  ctx: RecipientContext,
): ResolvedRecipient[] {
  const def = EVENT_CATALOG[type];
  const seen = new Set<number>();
  const out: ResolvedRecipient[] = [];
  for (const relation of def.relations) {
    for (const userId of idsFor(relation, ctx)) {
      if (!Number.isInteger(userId) || seen.has(userId)) continue;
      seen.add(userId);
      out.push({ userId, relation });
    }
  }
  return out;
}
