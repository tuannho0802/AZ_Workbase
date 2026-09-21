import { describe, it, expect } from 'vitest';
import { resolveNotificationTarget } from './resolve-link';
import type { NotificationItem } from '../types/notification.types';

const base = (over: Partial<NotificationItem> = {}) => ({
  id: 9,
  category: 'customer' as const,
  eventType: 'customer.updated',
  entityType: 'customer' as string | null,
  entityId: 55 as number | null,
  params: null as Record<string, unknown> | null,
  ...over,
});

describe('resolveNotificationTarget', () => {
  it('khách hàng đơn → dùng ?id= ĐÃ CÓ SẴN ở customers/page.tsx (mở Drawer)', () => {
    expect(resolveNotificationTarget(base())).toEqual({ kind: 'navigate', href: '/customers?id=55' });
  });

  it('khách hàng batch (entityId null) → mở danh sách Khách hàng', () => {
    expect(resolveNotificationTarget(base({ entityId: null, eventType: 'customer.assigned' }))).toEqual({
      kind: 'navigate',
      href: '/customers',
    });
  });

  it('task → hợp đồng URL cuối cùng (focus + nid) của PLAN 7.3', () => {
    expect(
      resolveNotificationTarget(
        base({ category: 'task', eventType: 'task.status_changed', entityType: 'periodic_task', entityId: 12 }),
      ),
    ).toEqual({ kind: 'navigate', href: '/cong-viec-dinh-ky?focus=12&nid=9' });
  });

  it('thông báo thủ công → mở Modal, KHÔNG điều hướng (kể cả khi có entity đính kèm)', () => {
    expect(
      resolveNotificationTarget(base({ category: 'manual', eventType: 'manual.broadcast', entityType: null, entityId: null })),
    ).toEqual({ kind: 'modal' });
    expect(resolveNotificationTarget(base({ category: 'manual', eventType: 'manual.broadcast' }))).toEqual({
      kind: 'modal',
    });
  });

  it('params.unavailable=true → không điều hướng', () => {
    expect(resolveNotificationTarget(base({ params: { unavailable: true } }))).toEqual({ kind: 'unavailable' });
  });

  it('event *.deleted → không điều hướng dù BE quên đặt params.unavailable', () => {
    expect(resolveNotificationTarget(base({ eventType: 'customer.deleted' }))).toEqual({ kind: 'unavailable' });
    expect(
      resolveNotificationTarget(base({ category: 'task', eventType: 'task.deleted', entityType: 'periodic_task' })),
    ).toEqual({ kind: 'unavailable' });
  });

  it('không có entity/loại lạ → none (chỉ đánh dấu đã đọc)', () => {
    expect(resolveNotificationTarget(base({ entityType: null, entityId: null }))).toEqual({ kind: 'none' });
    expect(resolveNotificationTarget(base({ entityType: 'something_else' }))).toEqual({ kind: 'none' });
    expect(resolveNotificationTarget(base({ entityType: 'periodic_task', entityId: null }))).toEqual({ kind: 'none' });
  });
});
