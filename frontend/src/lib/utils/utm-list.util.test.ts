import { describe, it, expect } from 'vitest';
import dayjs from 'dayjs';
import type { UtmView } from '@/lib/api/utms.api';
import { filterUtmRows, sortUtmRows } from './utm-list.util';

const mk = (o: Partial<UtmView> & { id: number }): UtmView =>
  ({
    name: `utm${o.id}`,
    description: null,
    color: '#1677ff',
    visibility: 'shared',
    isActive: true,
    sortOrder: 0,
    primaryManager: null,
    secondaryManagers: [],
    myRole: null,
    capabilities: {} as UtmView['capabilities'],
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...o,
  }) as UtmView;

const rows = [
  mk({ id: 1, name: 'B_Ads', createdAt: '2026-09-10T08:00:00.000Z', primaryManager: { id: 7, name: 'An' }, visibility: 'restricted' }),
  mk({ id: 2, name: 'a_Mess', createdAt: '2026-09-20T08:00:00.000Z', isActive: false }),
  mk({ id: 3, name: 'C_Tele', createdAt: '2026-09-20T08:00:00.000Z', primaryManager: { id: 8, name: 'Bình' } }),
];

describe('sortUtmRows', () => {
  it('mặc định = mới nhất; cùng createdAt thì id lớn hơn đứng trước', () => {
    expect(sortUtmRows(rows).map((r) => r.id)).toEqual([3, 2, 1]);
  });
  it('cũ nhất', () => {
    expect(sortUtmRows(rows, 'oldest').map((r) => r.id)).toEqual([1, 2, 3]);
  });
  it('tên A→Z / Z→A không phân biệt hoa thường', () => {
    expect(sortUtmRows(rows, 'name_asc').map((r) => r.id)).toEqual([2, 1, 3]);
    expect(sortUtmRows(rows, 'name_desc').map((r) => r.id)).toEqual([3, 1, 2]);
  });
  it('nhiều khách hàng nhất', () => {
    expect(sortUtmRows(rows, 'customers_desc', { 1: 5, 2: 50, 3: 10 }).map((r) => r.id)).toEqual([2, 3, 1]);
  });
  it('không mutate mảng gốc', () => {
    const copy = [...rows];
    sortUtmRows(rows, 'oldest');
    expect(rows).toEqual(copy);
  });
});

describe('filterUtmRows (filter mới)', () => {
  it('lọc theo Quản lý chính cụ thể và "Chưa gán"', () => {
    expect(filterUtmRows(rows, '', undefined, undefined, { primary: 7 }).map((r) => r.id)).toEqual([1]);
    expect(filterUtmRows(rows, '', undefined, undefined, { primary: 'none' }).map((r) => r.id)).toEqual([2]);
  });
  it('lọc theo Hiển thị', () => {
    expect(filterUtmRows(rows, '', undefined, undefined, { visibility: 'restricted' }).map((r) => r.id)).toEqual([1]);
  });
  it('lọc khoảng ngày tạo gồm cả ngày cuối', () => {
    const range: [dayjs.Dayjs, dayjs.Dayjs] = [dayjs('2026-09-20'), dayjs('2026-09-20')];
    expect(filterUtmRows(rows, '', undefined, undefined, { createdRange: range }).map((r) => r.id).sort()).toEqual([2, 3]);
  });
  it('kết hợp với filter cũ (trạng thái) và tìm kiếm không dấu', () => {
    expect(filterUtmRows(rows, 'mess', 'inactive', undefined).map((r) => r.id)).toEqual([2]);
  });
});
