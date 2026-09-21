/**
 * DANH MỤC SỰ KIỆN THÔNG BÁO (PLAN_NOTIFICATION_SYSTEM.md mục 4).
 *
 * Nguồn sự thật DUY NHẤT cho: event nào tồn tại, thuộc miền nào, gửi cho
 * những quan hệ (relation) nào, có "bắt buộc" (người dùng không tắt được) hay
 * "gộp khi chưa đọc" (coalesce) không, và câu chữ theo từng relation.
 *
 * ⚠️ PII: template CHỈ được dùng tên người thực hiện, tên khách/tiêu đề task,
 * số lượng, tên trạng thái. CẤM SĐT, email, số tiền (nguyên tắc 4). `params`
 * cũng bị lọc qua allowlist ở `sanitizeParams()`.
 *
 * Text thuần - FE render `white-space: pre-wrap`, không HTML/markdown.
 */

export enum NotificationCategory {
  CUSTOMER = 'customer',
  TASK = 'task',
  MANUAL = 'manual',
}

export enum RecipientRelation {
  // Customer
  CUSTOMER_PRIMARY_SALES = 'CUSTOMER_PRIMARY_SALES',
  CUSTOMER_MARKETING_OWNER = 'CUSTOMER_MARKETING_OWNER',
  CUSTOMER_SHARED_SALES = 'CUSTOMER_SHARED_SALES',
  CUSTOMER_CREATOR = 'CUSTOMER_CREATOR',
  ASSIGNEE_NEW = 'ASSIGNEE_NEW',
  ASSIGNEE_PREVIOUS = 'ASSIGNEE_PREVIOUS',
  // Task
  TASK_PRIMARY_ASSIGNEE = 'TASK_PRIMARY_ASSIGNEE',
  TASK_SECONDARY_ASSIGNEE = 'TASK_SECONDARY_ASSIGNEE',
  TASK_CREATOR = 'TASK_CREATOR',
  TASK_ASSIGNEE_NEW = 'TASK_ASSIGNEE_NEW',
  TASK_ASSIGNEE_PREVIOUS = 'TASK_ASSIGNEE_PREVIOUS',
  // Manual (Phase M1)
  MANUAL_RECIPIENT = 'MANUAL_RECIPIENT',
}

export type NotificationEntityType = 'customer' | 'periodic_task';

export const NOTIFICATION_EVENT_TYPES = [
  // Customer
  'customer.created',
  'customer.assigned',
  'customer.assignment_changed',
  'customer.assignment_reclaimed',
  'customer.owner_changed',
  'customer.updated',
  'customer.note_created',
  'customer.deleted',
  // Task
  'task.created',
  'task.primary_changed',
  'task.secondary_added',
  'task.secondary_removed',
  'task.status_changed',
  'task.updated',
  'task.customer_linked',
  'task.customer_unlinked',
  'task.checklist_changed',
  'task.locked',
  'task.unlocked',
  'task.deleted',
  // Manual (không đi qua emit(); do notification-broadcasts ghi ở Phase M1)
  'manual.broadcast',
] as const;

export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

/** Dữ liệu điền vào câu chữ. Chỉ chứa thông tin KHÔNG nhạy cảm. */
export interface TemplateInput {
  actorName: string;
  /** Tên khách hàng / tiêu đề task */
  entityName: string;
  /** Số lượng (batch), mặc định 1 */
  count: number;
  params: Record<string, unknown>;
}

export interface RenderedText {
  title: string;
  body?: string;
}

type Template = (input: TemplateInput) => RenderedText;

export interface EventDefinition {
  type: NotificationEventType;
  category: NotificationCategory;
  entityType: NotificationEntityType | null;
  /** Người dùng KHÔNG tắt được (bỏ qua notification_preferences) */
  mandatory: boolean;
  /** Gộp vào dòng CHƯA ĐỌC cùng (event, entity) thay vì tạo dòng mới */
  coalesce: boolean;
  /** Bật mặc định khi người dùng chưa cấu hình gì */
  defaultEnabled: boolean;
  /** Có đi qua emit() không (manual.broadcast thì không) */
  emittable: boolean;
  /**
   * Các relation nhận thông báo, THEO THỨ TỰ ƯU TIÊN: 1 user khớp nhiều
   * relation chỉ nhận 1 thông báo, ứng với relation đứng TRƯỚC.
   */
  relations: RecipientRelation[];
  /** Câu chữ theo relation; `default` là fallback bắt buộc. */
  templates: Partial<Record<RecipientRelation, Template>> & {
    default: Template;
  };
}

const R = RecipientRelation;

const CUSTOMER_STAKEHOLDERS: RecipientRelation[] = [
  R.CUSTOMER_PRIMARY_SALES,
  R.CUSTOMER_MARKETING_OWNER,
  R.CUSTOMER_SHARED_SALES,
];
const TASK_STAKEHOLDERS: RecipientRelation[] = [
  R.TASK_PRIMARY_ASSIGNEE,
  R.TASK_SECONDARY_ASSIGNEE,
];

const t =
  (title: (i: TemplateInput) => string): Template =>
  (i) => ({
    title: title(i),
  });

export const EVENT_CATALOG: Record<NotificationEventType, EventDefinition> = {
  // ─────────────────────────── CUSTOMER ───────────────────────────
  'customer.created': {
    type: 'customer.created',
    category: NotificationCategory.CUSTOMER,
    entityType: 'customer',
    mandatory: true,
    coalesce: false,
    defaultEnabled: true,
    emittable: true,
    relations: [R.CUSTOMER_PRIMARY_SALES, R.CUSTOMER_MARKETING_OWNER],
    templates: {
      [R.CUSTOMER_PRIMARY_SALES]: t(
        (i) =>
          `${i.actorName} vừa tạo khách hàng ${i.entityName} và giao cho bạn phụ trách.`,
      ),
      [R.CUSTOMER_MARKETING_OWNER]: t(
        (i) =>
          `${i.actorName} vừa tạo khách hàng ${i.entityName} (Marketing phụ trách: bạn).`,
      ),
      default: t((i) => `${i.actorName} vừa tạo khách hàng ${i.entityName}.`),
    },
  },
  'customer.assigned': {
    type: 'customer.assigned',
    category: NotificationCategory.CUSTOMER,
    entityType: 'customer',
    mandatory: true,
    coalesce: false,
    defaultEnabled: true,
    emittable: true,
    relations: [R.ASSIGNEE_NEW],
    templates: {
      default: (i) => {
        const role =
          i.params.isPrimary === true
            ? 'Sales phụ trách chính'
            : 'Sales được chia';
        return {
          title:
            i.count > 1
              ? `${i.actorName} chia cho bạn ${i.count} khách hàng (${role}).`
              : `${i.actorName} chia cho bạn khách hàng ${i.entityName} (${role}).`,
        };
      },
    },
  },
  'customer.assignment_changed': {
    type: 'customer.assignment_changed',
    category: NotificationCategory.CUSTOMER,
    entityType: 'customer',
    mandatory: true,
    coalesce: false,
    defaultEnabled: true,
    emittable: true,
    relations: [R.ASSIGNEE_NEW, R.ASSIGNEE_PREVIOUS, R.CUSTOMER_PRIMARY_SALES],
    templates: {
      [R.ASSIGNEE_NEW]: t(
        (i) => `${i.actorName} chuyển khách hàng ${i.entityName} cho bạn.`,
      ),
      [R.ASSIGNEE_PREVIOUS]: t(
        (i) =>
          `${i.actorName} đã chuyển khách hàng ${i.entityName} khỏi danh sách của bạn.`,
      ),
      default: t(
        (i) =>
          `${i.actorName} thay đổi người được chia khách hàng ${i.entityName}.`,
      ),
    },
  },
  'customer.assignment_reclaimed': {
    type: 'customer.assignment_reclaimed',
    category: NotificationCategory.CUSTOMER,
    entityType: 'customer',
    mandatory: true,
    coalesce: false,
    defaultEnabled: true,
    emittable: true,
    relations: [R.ASSIGNEE_PREVIOUS],
    templates: {
      default: t(
        (i) =>
          `${i.actorName} đã thu hồi lượt chia khách hàng ${i.entityName} của bạn.`,
      ),
    },
  },
  'customer.owner_changed': {
    type: 'customer.owner_changed',
    category: NotificationCategory.CUSTOMER,
    entityType: 'customer',
    mandatory: true,
    coalesce: false,
    defaultEnabled: true,
    emittable: true,
    relations: [R.ASSIGNEE_NEW, R.ASSIGNEE_PREVIOUS],
    templates: {
      [R.ASSIGNEE_NEW]: t(
        (i) =>
          `${i.actorName} giao khách hàng ${i.entityName} cho bạn phụ trách.`,
      ),
      [R.ASSIGNEE_PREVIOUS]: t(
        (i) =>
          `${i.actorName} đã đổi người phụ trách khách hàng ${i.entityName} (không còn là bạn).`,
      ),
      default: t(
        (i) => `${i.actorName} đổi người phụ trách khách hàng ${i.entityName}.`,
      ),
    },
  },
  'customer.updated': {
    type: 'customer.updated',
    category: NotificationCategory.CUSTOMER,
    entityType: 'customer',
    mandatory: false,
    coalesce: true,
    defaultEnabled: true,
    emittable: true,
    relations: CUSTOMER_STAKEHOLDERS,
    templates: {
      default: t(
        (i) => `${i.actorName} vừa cập nhật khách hàng ${i.entityName}.`,
      ),
    },
  },
  'customer.note_created': {
    type: 'customer.note_created',
    category: NotificationCategory.CUSTOMER,
    entityType: 'customer',
    mandatory: false,
    coalesce: true,
    defaultEnabled: true,
    emittable: true,
    relations: CUSTOMER_STAKEHOLDERS,
    templates: {
      default: t(
        (i) =>
          `${i.actorName} vừa thêm ghi chú cho khách hàng ${i.entityName}.`,
      ),
    },
  },
  'customer.deleted': {
    type: 'customer.deleted',
    category: NotificationCategory.CUSTOMER,
    entityType: 'customer',
    mandatory: false,
    coalesce: false,
    defaultEnabled: true,
    emittable: true,
    relations: CUSTOMER_STAKEHOLDERS,
    templates: {
      default: t((i) => `${i.actorName} đã xoá khách hàng ${i.entityName}.`),
    },
  },

  // ───────────────────────────── TASK ─────────────────────────────
  'task.created': {
    type: 'task.created',
    category: NotificationCategory.TASK,
    entityType: 'periodic_task',
    mandatory: true,
    coalesce: false,
    defaultEnabled: true,
    emittable: true,
    relations: [R.TASK_PRIMARY_ASSIGNEE],
    templates: {
      default: t(
        (i) =>
          `${i.actorName} vừa tạo công việc ${i.entityName} và giao cho bạn phụ trách.`,
      ),
    },
  },
  'task.primary_changed': {
    type: 'task.primary_changed',
    category: NotificationCategory.TASK,
    entityType: 'periodic_task',
    mandatory: true,
    coalesce: false,
    defaultEnabled: true,
    emittable: true,
    relations: [R.TASK_ASSIGNEE_NEW, R.TASK_ASSIGNEE_PREVIOUS],
    templates: {
      [R.TASK_ASSIGNEE_NEW]: t(
        (i) =>
          `${i.actorName} giao công việc ${i.entityName} cho bạn phụ trách.`,
      ),
      [R.TASK_ASSIGNEE_PREVIOUS]: t(
        (i) =>
          `${i.actorName} đã đổi người phụ trách công việc ${i.entityName} (không còn là bạn).`,
      ),
      default: t(
        (i) => `${i.actorName} đổi người phụ trách công việc ${i.entityName}.`,
      ),
    },
  },
  'task.secondary_added': {
    type: 'task.secondary_added',
    category: NotificationCategory.TASK,
    entityType: 'periodic_task',
    mandatory: true,
    coalesce: false,
    defaultEnabled: true,
    emittable: true,
    relations: [R.TASK_ASSIGNEE_NEW],
    templates: {
      default: t(
        (i) =>
          `${i.actorName} thêm bạn làm người phụ công việc ${i.entityName}.`,
      ),
    },
  },
  'task.secondary_removed': {
    type: 'task.secondary_removed',
    category: NotificationCategory.TASK,
    entityType: 'periodic_task',
    mandatory: true,
    coalesce: false,
    defaultEnabled: true,
    emittable: true,
    relations: [R.TASK_ASSIGNEE_PREVIOUS],
    templates: {
      default: t(
        (i) => `${i.actorName} đã gỡ bạn khỏi công việc ${i.entityName}.`,
      ),
    },
  },
  'task.status_changed': {
    type: 'task.status_changed',
    category: NotificationCategory.TASK,
    entityType: 'periodic_task',
    mandatory: false,
    coalesce: false,
    defaultEnabled: true,
    emittable: true,
    relations: [...TASK_STAKEHOLDERS, R.TASK_CREATOR],
    templates: {
      default: (i) => {
        const to =
          typeof i.params.toStatus === 'string' ? i.params.toStatus : null;
        return {
          title: to
            ? `${i.actorName} chuyển công việc ${i.entityName} sang "${to}".`
            : `${i.actorName} đổi trạng thái công việc ${i.entityName}.`,
        };
      },
    },
  },
  'task.updated': {
    type: 'task.updated',
    category: NotificationCategory.TASK,
    entityType: 'periodic_task',
    mandatory: false,
    coalesce: true,
    defaultEnabled: true,
    emittable: true,
    relations: TASK_STAKEHOLDERS,
    templates: {
      default: t(
        (i) => `${i.actorName} vừa cập nhật công việc ${i.entityName}.`,
      ),
    },
  },
  'task.customer_linked': {
    type: 'task.customer_linked',
    category: NotificationCategory.TASK,
    entityType: 'periodic_task',
    mandatory: false,
    coalesce: true,
    defaultEnabled: true,
    emittable: true,
    relations: TASK_STAKEHOLDERS,
    templates: {
      default: t(
        (i) =>
          `${i.actorName} vừa liên kết khách hàng vào công việc ${i.entityName}.`,
      ),
    },
  },
  'task.customer_unlinked': {
    type: 'task.customer_unlinked',
    category: NotificationCategory.TASK,
    entityType: 'periodic_task',
    mandatory: false,
    coalesce: true,
    defaultEnabled: true,
    emittable: true,
    relations: TASK_STAKEHOLDERS,
    templates: {
      default: t(
        (i) =>
          `${i.actorName} vừa gỡ liên kết khách hàng khỏi công việc ${i.entityName}.`,
      ),
    },
  },
  'task.checklist_changed': {
    type: 'task.checklist_changed',
    category: NotificationCategory.TASK,
    entityType: 'periodic_task',
    mandatory: false,
    coalesce: true,
    defaultEnabled: true,
    emittable: true,
    relations: TASK_STAKEHOLDERS,
    templates: {
      default: t(
        (i) =>
          `${i.actorName} vừa thay đổi checklist của công việc ${i.entityName}.`,
      ),
    },
  },
  'task.locked': {
    type: 'task.locked',
    category: NotificationCategory.TASK,
    entityType: 'periodic_task',
    mandatory: false,
    coalesce: false,
    defaultEnabled: true,
    emittable: true,
    relations: TASK_STAKEHOLDERS,
    templates: {
      default: t((i) => `${i.actorName} đã khoá công việc ${i.entityName}.`),
    },
  },
  'task.unlocked': {
    type: 'task.unlocked',
    category: NotificationCategory.TASK,
    entityType: 'periodic_task',
    mandatory: false,
    coalesce: false,
    defaultEnabled: true,
    emittable: true,
    relations: TASK_STAKEHOLDERS,
    templates: {
      default: t((i) => `${i.actorName} đã mở khoá công việc ${i.entityName}.`),
    },
  },
  'task.deleted': {
    type: 'task.deleted',
    category: NotificationCategory.TASK,
    entityType: 'periodic_task',
    mandatory: false,
    coalesce: false,
    defaultEnabled: true,
    emittable: true,
    relations: [...TASK_STAKEHOLDERS, R.TASK_CREATOR],
    templates: {
      default: t((i) => `${i.actorName} đã xoá công việc ${i.entityName}.`),
    },
  },

  // ──────────────────────────── MANUAL ────────────────────────────
  // Không đi qua emit(): dòng được ghi trực tiếp bởi notification-broadcasts
  // (Phase M1, đồng bộ trong transaction). Khai ở đây để: (1) trang Tuỳ chọn
  // biết `manual.broadcast` là bắt buộc, (2) resolve-link/FE dùng chung enum.
  'manual.broadcast': {
    type: 'manual.broadcast',
    category: NotificationCategory.MANUAL,
    entityType: null,
    mandatory: true,
    coalesce: false,
    defaultEnabled: true,
    emittable: false,
    relations: [R.MANUAL_RECIPIENT],
    templates: {
      default: t((i) => i.entityName),
    },
  },
};

export function isNotificationEventType(
  value: string,
): value is NotificationEventType {
  return (NOTIFICATION_EVENT_TYPES as readonly string[]).includes(value);
}

// ───────────────────────── Giới hạn độ dài ─────────────────────────
export const AUTO_TITLE_MAX = 200;
export const AUTO_BODY_MAX = 500;
/** `params.entityIds` (batch) tối đa 50 phần tử (PLAN 6.4) */
export const PARAMS_ENTITY_IDS_MAX = 50;

/** Cắt chuỗi theo số ký tự, thêm "…" khi bị cắt. */
export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, Math.max(0, max - 1)) + '…';
}

/** Field khách hàng được phép liệt kê trong params.changedFields (allowlist PLAN 4.3) */
export const CUSTOMER_UPDATE_ALLOWLIST = [
  'status',
  'salesUserId',
  'marketingUserId',
  'closedDate',
  'departmentId',
] as const;

/**
 * ⚠️ ALLOWLIST tham số lưu vào `notifications.params` - chốt chặn PII cuối
 * cùng: key lạ (phone, email, amount, ...) bị VỨT, dù call site lỡ truyền vào.
 */
const PARAM_ALLOWLIST = new Set([
  'count',
  'entityIds',
  'isPrimary',
  'changedFields',
  'fromStatus',
  'toStatus',
  'unavailable',
  'senderName',
  'actorName',
  'entityName',
]);

export function sanitizeParams(
  params: Record<string, unknown> | undefined,
): Record<string, unknown> | null {
  if (!params) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (!PARAM_ALLOWLIST.has(key)) continue;
    if (key === 'entityIds') {
      if (!Array.isArray(value)) continue;
      out.entityIds = value
        .filter((v): v is number => Number.isInteger(v))
        .slice(0, PARAMS_ENTITY_IDS_MAX);
    } else if (key === 'changedFields') {
      if (!Array.isArray(value)) continue;
      out.changedFields = value
        .filter((v): v is string => typeof v === 'string')
        .filter((v) =>
          (CUSTOMER_UPDATE_ALLOWLIST as readonly string[]).includes(v),
        );
    } else if (typeof value === 'string') {
      out[key] = truncate(value, 100);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function renderNotification(
  def: EventDefinition,
  relation: RecipientRelation,
  input: TemplateInput,
): RenderedText {
  const template = def.templates[relation] ?? def.templates.default;
  const rendered = template(input);
  return {
    title: truncate(rendered.title, AUTO_TITLE_MAX),
    body: rendered.body ? truncate(rendered.body, AUTO_BODY_MAX) : undefined,
  };
}
