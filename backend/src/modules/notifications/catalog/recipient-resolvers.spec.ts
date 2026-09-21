import {
  EVENT_CATALOG,
  NOTIFICATION_EVENT_TYPES,
  RecipientRelation,
} from './event-catalog';
import { resolveRecipients } from './recipient-resolvers';

const R = RecipientRelation;

describe('resolveRecipients', () => {
  const customerCtx = {
    customer: {
      salesUserId: 2,
      marketingUserId: 3,
      createdById: 9,
      sharedSalesUserIds: [5, 6],
    },
  };
  const taskCtx = {
    task: {
      primaryAssigneeId: 2,
      secondaryAssigneeIds: [5, 6],
      createdById: 9,
    },
  };

  it('customer.created: sales chính + marketing, KHÔNG gồm người tạo/sales được chia', () => {
    expect(resolveRecipients('customer.created', customerCtx)).toEqual([
      { userId: 2, relation: R.CUSTOMER_PRIMARY_SALES },
      { userId: 3, relation: R.CUSTOMER_MARKETING_OWNER },
    ]);
  });

  it('customer.updated / note_created / deleted: sales chính, marketing, sales được chia', () => {
    for (const type of [
      'customer.updated',
      'customer.note_created',
      'customer.deleted',
    ] as const) {
      expect(resolveRecipients(type, customerCtx).map((r) => r.userId)).toEqual(
        [2, 3, 5, 6],
      );
    }
  });

  it('khử trùng: user khớp nhiều relation chỉ nhận 1 lần, giữ relation ưu tiên (đứng trước)', () => {
    const out = resolveRecipients('customer.updated', {
      customer: {
        salesUserId: 2,
        marketingUserId: 2,
        sharedSalesUserIds: [2, 5],
      },
    });
    expect(out).toEqual([
      { userId: 2, relation: R.CUSTOMER_PRIMARY_SALES },
      { userId: 5, relation: R.CUSTOMER_SHARED_SALES },
    ]);
  });

  it('bỏ qua quan hệ chưa có (null/undefined) thay vì lỗi', () => {
    expect(
      resolveRecipients('customer.created', {
        customer: { salesUserId: null, marketingUserId: 3 },
      }),
    ).toEqual([{ userId: 3, relation: R.CUSTOMER_MARKETING_OWNER }]);
    expect(resolveRecipients('customer.created', {})).toEqual([]);
  });

  it('assigned / reclaimed / owner_changed / assignment_changed dùng newUserIds & previousUserIds', () => {
    expect(resolveRecipients('customer.assigned', { newUserIds: [7] })).toEqual(
      [{ userId: 7, relation: R.ASSIGNEE_NEW }],
    );
    expect(
      resolveRecipients('customer.assignment_reclaimed', {
        previousUserIds: [8],
      }),
    ).toEqual([{ userId: 8, relation: R.ASSIGNEE_PREVIOUS }]);
    expect(
      resolveRecipients('customer.owner_changed', {
        newUserIds: [7],
        previousUserIds: [8],
      }),
    ).toEqual([
      { userId: 7, relation: R.ASSIGNEE_NEW },
      { userId: 8, relation: R.ASSIGNEE_PREVIOUS },
    ]);
    // assignment_changed: sales chính cũng được báo nhưng không trùng người mới/cũ
    expect(
      resolveRecipients('customer.assignment_changed', {
        newUserIds: [7],
        previousUserIds: [8],
        customer: { salesUserId: 2 },
      }).map((r) => [r.userId, r.relation]),
    ).toEqual([
      [7, R.ASSIGNEE_NEW],
      [8, R.ASSIGNEE_PREVIOUS],
      [2, R.CUSTOMER_PRIMARY_SALES],
    ]);
  });

  it('task.created chỉ báo phụ trách chính; primary_changed báo mới + cũ', () => {
    expect(resolveRecipients('task.created', taskCtx)).toEqual([
      { userId: 2, relation: R.TASK_PRIMARY_ASSIGNEE },
    ]);
    expect(
      resolveRecipients('task.primary_changed', {
        newUserIds: [4],
        previousUserIds: [2],
      }),
    ).toEqual([
      { userId: 4, relation: R.TASK_ASSIGNEE_NEW },
      { userId: 2, relation: R.TASK_ASSIGNEE_PREVIOUS },
    ]);
  });

  it('task.secondary_added chỉ báo người được thêm; secondary_removed chỉ báo người bị gỡ', () => {
    expect(
      resolveRecipients('task.secondary_added', {
        ...taskCtx,
        newUserIds: [10],
      }),
    ).toEqual([{ userId: 10, relation: R.TASK_ASSIGNEE_NEW }]);
    expect(
      resolveRecipients('task.secondary_removed', {
        ...taskCtx,
        previousUserIds: [5],
      }),
    ).toEqual([{ userId: 5, relation: R.TASK_ASSIGNEE_PREVIOUS }]);
  });

  it('task.status_changed / deleted gồm cả người tạo; task.updated / checklist / locked thì không', () => {
    expect(
      resolveRecipients('task.status_changed', taskCtx).map((r) => r.userId),
    ).toEqual([2, 5, 6, 9]);
    expect(
      resolveRecipients('task.deleted', taskCtx).map((r) => r.userId),
    ).toEqual([2, 5, 6, 9]);
    for (const type of [
      'task.updated',
      'task.checklist_changed',
      'task.locked',
      'task.unlocked',
      'task.customer_linked',
      'task.customer_unlinked',
    ] as const) {
      expect(resolveRecipients(type, taskCtx).map((r) => r.userId)).toEqual([
        2, 5, 6,
      ]);
    }
  });

  it('manual.broadcast KHÔNG suy được người nhận từ quan hệ (do người gửi chọn)', () => {
    expect(
      resolveRecipients('manual.broadcast', {
        ...customerCtx,
        ...taskCtx,
        newUserIds: [1],
      }),
    ).toEqual([]);
  });

  it('mọi event trong catalog đều resolve được mà không throw với ngữ cảnh rỗng', () => {
    for (const type of NOTIFICATION_EVENT_TYPES) {
      expect(() => resolveRecipients(type, {})).not.toThrow();
      expect(EVENT_CATALOG[type].type).toBe(type);
    }
  });
});
