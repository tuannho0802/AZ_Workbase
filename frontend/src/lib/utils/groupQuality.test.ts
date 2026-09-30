import { describe, expect, it } from 'vitest';
import type { GroupQualityRow } from '@/lib/types/reports.types';
import { normalizeText } from './marketingReport';
import {
  MIN_SAMPLE_MEMBERS,
  buildGroupInsights,
  filterGroupRows,
  groupHealth,
  groupRates,
  rankValue,
  topGroups,
} from './groupQuality';

const mk = (o: Partial<GroupQualityRow>): GroupQualityRow => ({
  groupId: 1,
  groupName: 'Nhóm A',
  categoryId: 1,
  categoryName: 'Zalo',
  categoryColor: '#1677ff',
  isActive: true,
  primaryManager: null,
  members: 0,
  newJoins: 0,
  depositedMembers: 0,
  closedMembers: 0,
  newJoinsDeposited: 0,
  newJoinsClosed: 0,
  periodDepositors: 0,
  periodRevenue: 0,
  lifetimeRevenue: 0,
  newJoinsLifetimeRevenue: 0,
  avgDaysToFirstDeposit: null,
  byStatus: {},
  ...o,
});

describe('groupRates', () => {
  it('tính tỷ lệ đúng và không chia cho 0', () => {
    const r = groupRates(mk({ members: 20, depositedMembers: 10, closedMembers: 5, newJoins: 8, newJoinsDeposited: 4, newJoinsClosed: 2, lifetimeRevenue: 5000, newJoinsLifetimeRevenue: 1600 }));
    expect(r).toMatchObject({ depositRate: 50, closeRate: 25, newJoinDepositRate: 50, newJoinCloseRate: 25, notDeposited: 10, newJoinNotDeposited: 4, revenuePerNewJoin: 200 });
    expect(r.revenuePerMember).toBe(250);
    expect(r.revenuePerDepositor).toBe(500);
    const empty = groupRates(mk({}));
    expect(empty).toMatchObject({ depositRate: null, closeRate: null, newJoinDepositRate: null, revenuePerMember: null, revenuePerDepositor: null, notDeposited: 0, newJoinNotDeposited: 0, revenuePerNewJoin: null });
  });
});

describe('groupHealth', () => {
  it('nhóm trống / ít mẫu không bị chấm điểm', () => {
    expect(groupHealth(mk({})).key).toBe('empty');
    expect(groupHealth(mk({ members: MIN_SAMPLE_MEMBERS - 1, depositedMembers: 0 })).key).toBe('small');
  });
  it('dùng ngưỡng <40 đỏ, 40-80 vàng, >80 xanh theo tỷ lệ nạp', () => {
    expect(groupHealth(mk({ members: 10, depositedMembers: 3 })).key).toBe('low');
    expect(groupHealth(mk({ members: 10, depositedMembers: 4 })).key).toBe('mid');
    expect(groupHealth(mk({ members: 10, depositedMembers: 8 })).key).toBe('mid'); // đúng 80% vẫn vàng
    expect(groupHealth(mk({ members: 10, depositedMembers: 9 })).key).toBe('high');
  });
});

describe('rank + top', () => {
  const rows = [
    mk({ groupId: 1, groupName: 'A', members: 20, depositedMembers: 10, lifetimeRevenue: 500 }),
    mk({ groupId: 2, groupName: 'B', members: 3, depositedMembers: 3, lifetimeRevenue: 900 }),
    mk({ groupId: 3, groupName: 'C', members: 10, depositedMembers: 9, lifetimeRevenue: 100 }),
    mk({ groupId: 4, groupName: 'D' }),
  ];
  it('tỷ lệ chỉ xếp cho nhóm đủ mẫu (B 100% nhưng chỉ 3 thành viên nên bị loại)', () => {
    expect(rankValue(rows[1], 'depositRate')).toBeNull();
    expect(topGroups(rows, 'depositRate', 5).map((x) => x.name)).toEqual(['C', 'A']);
  });
  it('chỉ số tuyệt đối xếp giảm dần và bỏ nhóm = 0', () => {
    expect(topGroups(rows, 'lifetimeRevenue', 10).map((x) => x.name)).toEqual(['B', 'A', 'C']);
    expect(topGroups(rows, 'members', 2).map((x) => x.name)).toEqual(['A', 'C']);
  });
});

describe('buildGroupInsights', () => {
  const rows = [
    mk({ groupId: 1, groupName: 'Yếu lớn', members: 100, depositedMembers: 10 }),
    mk({ groupId: 2, groupName: 'Yếu nhỏ', members: 10, depositedMembers: 1 }),
    mk({ groupId: 3, groupName: 'Tốt', members: 20, depositedMembers: 19, lifetimeRevenue: 900 }),
    mk({ groupId: 4, groupName: 'Trống' }),
    mk({ groupId: 5, groupName: 'Không ai nạp', members: 8, depositedMembers: 0 }),
    mk({ groupId: 6, groupName: 'Ít mẫu', members: 2, depositedMembers: 0 }),
  ];
  it('phân loại đúng và sắp nhóm cần xử lý theo SỐ KHÁCH CHƯA NẠP giảm dần', () => {
    const i = buildGroupInsights(rows);
    expect(i.needsAttention.map((r) => r.groupName)).toEqual(['Yếu lớn', 'Yếu nhỏ', 'Không ai nạp']);
    expect(i.bestPractice.map((r) => r.groupName)).toEqual(['Tốt']);
    expect(i.emptyGroups.map((r) => r.groupName)).toEqual(['Trống']);
    expect(i.zeroDeposit.map((r) => r.groupName)).toEqual(['Không ai nạp']); // nhóm "Ít mẫu" bị loại
  });
  it('tôn trọng limit', () => {
    expect(buildGroupInsights(rows, 1).needsAttention).toHaveLength(1);
  });
});

describe('filterGroupRows', () => {
  const rows = [
    mk({ groupId: 1, groupName: 'Nhóm Sài Gòn', members: 5 }),
    mk({ groupId: 2, groupName: 'Nhóm Hà Nội', categoryName: 'Telegram', primaryManager: { id: 1, name: 'Nguyễn Văn Lâm', role: null, departmentName: null, departmentColor: null, positionName: null, positionColor: null } }),
  ];
  it('tìm không phân biệt hoa thường/dấu theo tên nhóm, Category, quản lý; ẩn nhóm trống', () => {
    expect(filterGroupRows(rows, { search: 'sai gon' }, normalizeText).map((r) => r.groupId)).toEqual([1]);
    expect(filterGroupRows(rows, { search: 'telegram' }, normalizeText).map((r) => r.groupId)).toEqual([2]);
    expect(filterGroupRows(rows, { search: 'lam' }, normalizeText).map((r) => r.groupId)).toEqual([2]);
    expect(filterGroupRows(rows, { hideEmpty: true }, normalizeText).map((r) => r.groupId)).toEqual([1]);
  });
});
