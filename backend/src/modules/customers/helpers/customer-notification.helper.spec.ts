import {
  CustomerNotifySnapshot,
  diffCustomerForNotification,
  excludeRecipients,
  groupBulkAssignForNotification,
  normalizeDateOnly,
  pickDefined,
} from './customer-notification.helper';

const snap = (over: Partial<CustomerNotifySnapshot> = {}): CustomerNotifySnapshot => ({
  id: 1,
  name: 'K1',
  salesUserId: 5,
  marketingUserId: null,
  createdById: 2,
  status: 'pending',
  closedDate: null,
  departmentId: 1,
  sharedSalesUserIds: [],
  ...over,
});

describe('customer-notification.helper', () => {
  describe('normalizeDateOnly', () => {
    it('chuẩn hoá string ISO / Date / rỗng về YYYY-MM-DD hoặc null', () => {
      expect(normalizeDateOnly('2026-09-21')).toBe('2026-09-21');
      expect(normalizeDateOnly('2026-09-21T10:00:00.000Z')).toBe('2026-09-21');
      expect(normalizeDateOnly(new Date('2026-09-21T00:00:00.000Z'))).toBe('2026-09-21');
      expect(normalizeDateOnly(null)).toBeNull();
      expect(normalizeDateOnly(undefined)).toBeNull();
      expect(normalizeDateOnly('')).toBeNull();
      expect(normalizeDateOnly(new Date('invalid'))).toBeNull();
    });
  });

  describe('pickDefined', () => {
    it('undefined → fallback; null là giá trị hợp lệ (không phải fallback)', () => {
      expect(pickDefined(undefined, 5)).toBe(5);
      expect(pickDefined<number | null>(null, 5)).toBeNull();
      expect(pickDefined(0, 5)).toBe(0);
    });
  });

  describe('diffCustomerForNotification', () => {
    const after = (over = {}) => ({
      salesUserId: 5, marketingUserId: null, status: 'pending', closedDate: null, departmentId: 1, ...over,
    });

    it('không đổi gì → không có thay đổi nào', () => {
      expect(diffCustomerForNotification(snap(), after())).toEqual({
        ownerFieldsChanged: false, newOwnerIds: [], previousOwnerIds: [], changedFields: [],
      });
    });

    it('đổi sales 5→8: 8 là mới, 5 là cũ; KHÔNG tính vào changedFields', () => {
      const d = diffCustomerForNotification(snap(), after({ salesUserId: 8 }));
      expect(d.ownerFieldsChanged).toBe(true);
      expect(d.newOwnerIds).toEqual([8]);
      expect(d.previousOwnerIds).toEqual([5]);
      expect(d.changedFields).toEqual([]);
    });

    it('sales cũ vẫn là marketing → KHÔNG bị coi là "không còn phụ trách"', () => {
      const before = snap({ salesUserId: 5, marketingUserId: 5 });
      const d = diffCustomerForNotification(before, after({ salesUserId: 8, marketingUserId: 5 }));
      expect(d.newOwnerIds).toEqual([8]);
      expect(d.previousOwnerIds).toEqual([]);
    });

    it('gỡ sales (→ null): người cũ nhận "không còn là bạn", không có người mới', () => {
      const d = diffCustomerForNotification(snap(), after({ salesUserId: null }));
      expect(d.newOwnerIds).toEqual([]);
      expect(d.previousOwnerIds).toEqual([5]);
    });

    it('thêm marketing null→6', () => {
      const d = diffCustomerForNotification(snap(), after({ marketingUserId: 6 }));
      expect(d.newOwnerIds).toEqual([6]);
      expect(d.previousOwnerIds).toEqual([]);
    });

    it('allowlist: status/closedDate/departmentId; so ngày theo YYYY-MM-DD (không báo giả do khác định dạng)', () => {
      const before = snap({ closedDate: '2026-09-21' });
      expect(
        diffCustomerForNotification(before, after({ closedDate: '2026-09-21T00:00:00.000Z' })).changedFields,
      ).toEqual([]);
      expect(
        diffCustomerForNotification(before, after({ status: 'closed', closedDate: '2026-09-22', departmentId: 2 })).changedFields,
      ).toEqual(['status', 'closedDate', 'departmentId']);
    });
  });

  describe('excludeRecipients', () => {
    it('loại các id đã được báo khỏi sales/marketing/được chia', () => {
      const out = excludeRecipients(
        { salesUserId: 8, marketingUserId: 6, createdById: 2, sharedSalesUserIds: [8, 9] },
        [8],
      );
      expect(out.salesUserId).toBeNull();
      expect(out.marketingUserId).toBe(6);
      expect(out.sharedSalesUserIds).toEqual([9]);
    });
  });

  describe('groupBulkAssignForNotification', () => {
    const customers = [
      { id: 100, name: 'K100', salesUserId: null },
      { id: 101, name: 'K101', salesUserId: 9 },
    ];

    it('chỉ salesUserIds[0] có thể là phụ trách chính, và chỉ với khách chưa có sales', () => {
      const groups = groupBulkAssignForNotification({
        customers,
        salesUserIds: [5, 6],
        createdPairKeys: new Set(['100-5', '101-5', '100-6', '101-6']),
      });
      expect(groups).toEqual([
        { targetUserId: 5, isPrimary: true, customers: [{ id: 100, name: 'K100' }] },
        { targetUserId: 5, isPrimary: false, customers: [{ id: 101, name: 'K101' }] },
        {
          targetUserId: 6, isPrimary: false,
          customers: [{ id: 100, name: 'K100' }, { id: 101, name: 'K101' }],
        },
      ]);
    });

    it('cặp đã tồn tại → bỏ; nhưng nếu người đó vừa THÀNH phụ trách chính thì vẫn báo', () => {
      const groups = groupBulkAssignForNotification({
        customers,
        salesUserIds: [5],
        createdPairKeys: new Set(), // lượt gán active 100-5, 101-5 đã có sẵn
      });
      expect(groups).toEqual([
        { targetUserId: 5, isPrimary: true, customers: [{ id: 100, name: 'K100' }] },
      ]);
    });

    it('khử trùng lặp salesUserIds', () => {
      const groups = groupBulkAssignForNotification({
        customers: [customers[1]],
        salesUserIds: [6, 6],
        createdPairKeys: new Set(['101-6']),
      });
      expect(groups).toHaveLength(1);
    });
  });
});
