import {
  AUTO_TITLE_MAX,
  EVENT_CATALOG,
  NOTIFICATION_EVENT_TYPES,
  PARAMS_ENTITY_IDS_MAX,
  RecipientRelation,
  renderNotification,
  sanitizeParams,
  truncate,
} from './event-catalog';

describe('event-catalog', () => {
  const PII = /(\b0\d{9}\b|@[a-z0-9-]+\.[a-z]{2,}|\$\s?\d|\d+\s?USD)/i;

  it('mọi event có template default và khai đủ relation', () => {
    for (const type of NOTIFICATION_EVENT_TYPES) {
      const def = EVENT_CATALOG[type];
      expect(typeof def.templates.default).toBe('function');
      expect(def.relations.length).toBeGreaterThan(0);
    }
  });

  it('event bắt buộc đúng theo PLAN 4.3/4.4/4.5', () => {
    const mandatory = NOTIFICATION_EVENT_TYPES.filter(
      (t) => EVENT_CATALOG[t].mandatory,
    ).sort();
    expect(mandatory).toEqual(
      [
        'customer.created',
        'customer.assigned',
        'customer.assignment_changed',
        'customer.assignment_reclaimed',
        'customer.owner_changed',
        'task.created',
        'task.primary_changed',
        'task.secondary_added',
        'task.secondary_removed',
        'manual.broadcast',
      ].sort(),
    );
  });

  it('event gộp (coalesce) đúng theo PLAN; manual không gộp và không emit được', () => {
    const coalesced = NOTIFICATION_EVENT_TYPES.filter(
      (t) => EVENT_CATALOG[t].coalesce,
    ).sort();
    expect(coalesced).toEqual(
      [
        'customer.updated',
        'customer.note_created',
        'task.updated',
        'task.customer_linked',
        'task.customer_unlinked',
        'task.checklist_changed',
      ].sort(),
    );
    expect(EVENT_CATALOG['manual.broadcast'].emittable).toBe(false);
    expect(EVENT_CATALOG['manual.broadcast'].coalesce).toBe(false);
  });

  it('template: KHÔNG rò PII kể cả khi params chứa SĐT/email/số tiền (snapshot mọi event × relation)', () => {
    const params = sanitizeParams({
      phone: '0901234567',
      email: 'a@b.com',
      amount: 5000,
      toStatus: 'Hoàn thành',
    })!;
    for (const type of NOTIFICATION_EVENT_TYPES) {
      const def = EVENT_CATALOG[type];
      for (const relation of def.relations) {
        const out = renderNotification(def, relation, {
          actorName: 'Trần B',
          entityName: 'Khách A',
          count: 3,
          params,
        });
        expect(out.title).not.toMatch(PII);
        expect(out.body ?? '').not.toMatch(PII);
      }
    }
  });

  it('biến thể theo relation của customer.created', () => {
    const def = EVENT_CATALOG['customer.created'];
    const input = { actorName: 'Lan', entityName: 'Nam', count: 1, params: {} };
    expect(
      renderNotification(def, RecipientRelation.CUSTOMER_PRIMARY_SALES, input)
        .title,
    ).toBe('Lan vừa tạo khách hàng Nam và giao cho bạn phụ trách.');
    expect(
      renderNotification(def, RecipientRelation.CUSTOMER_MARKETING_OWNER, input)
        .title,
    ).toBe('Lan vừa tạo khách hàng Nam (Marketing phụ trách: bạn).');
  });

  it('customer.assigned: batch (N>1) và phân biệt Sales chính / được chia', () => {
    const def = EVENT_CATALOG['customer.assigned'];
    const base = {
      actorName: 'Lan',
      entityName: 'Nam',
      params: {} as Record<string, unknown>,
    };
    expect(
      renderNotification(def, RecipientRelation.ASSIGNEE_NEW, {
        ...base,
        count: 5,
      }).title,
    ).toContain('5 khách hàng');
    expect(
      renderNotification(def, RecipientRelation.ASSIGNEE_NEW, {
        ...base,
        count: 1,
        params: { isPrimary: true },
      }).title,
    ).toContain('Sales phụ trách chính');
    expect(
      renderNotification(def, RecipientRelation.ASSIGNEE_NEW, {
        ...base,
        count: 1,
      }).title,
    ).toContain('Sales được chia');
  });

  it('title bị cắt ≤ 200 ký tự', () => {
    const out = renderNotification(
      EVENT_CATALOG['customer.updated'],
      RecipientRelation.CUSTOMER_PRIMARY_SALES,
      {
        actorName: 'A',
        entityName: 'x'.repeat(1000),
        count: 1,
        params: {},
      },
    );
    expect(out.title.length).toBeLessThanOrEqual(AUTO_TITLE_MAX);
    expect(out.title.endsWith('…')).toBe(true);
  });

  describe('sanitizeParams (chốt chặn PII)', () => {
    it('vứt key ngoài allowlist', () => {
      expect(
        sanitizeParams({
          phone: '0901',
          email: 'a@b.c',
          amount: 1,
          note: 'x',
          count: 2,
        }),
      ).toEqual({ count: 2 });
    });
    it('undefined / toàn key lạ → null', () => {
      expect(sanitizeParams(undefined)).toBeNull();
      expect(sanitizeParams({ phone: '0901' })).toBeNull();
    });
    it('entityIds: chỉ số nguyên, cắt còn 50', () => {
      const ids = Array.from({ length: 80 }, (_, i) => i + 1);
      const out = sanitizeParams({ entityIds: [...ids, 'x', 1.5] })!;
      expect((out.entityIds as number[]).length).toBe(PARAMS_ENTITY_IDS_MAX);
    });
    it('changedFields: chỉ field trong allowlist customer', () => {
      expect(
        sanitizeParams({
          changedFields: ['status', 'phone', 'email', 'closedDate'],
        }),
      ).toEqual({
        changedFields: ['status', 'closedDate'],
      });
    });
    it('chuỗi dài bị cắt 100; object lồng bị bỏ', () => {
      const out = sanitizeParams({
        toStatus: 'y'.repeat(500),
        senderName: { x: 1 } as unknown as string,
      })!;
      expect((out.toStatus as string).length).toBe(100);
      expect(out.senderName).toBeUndefined();
    });
  });

  it('truncate', () => {
    expect(truncate('abc', 5)).toBe('abc');
    expect(truncate('abcdef', 5)).toBe('abcd…');
  });
});
