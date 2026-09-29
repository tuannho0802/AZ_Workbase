import { describe, expect, it } from 'vitest';
import dayjs from 'dayjs';
import { buildCustomerTimeline, filterDepositsByRange, matchQuickRange, QUICK_RANGE_OPTIONS } from './reportCustomerDetail';
import type { ReportCustomerDetail, ReportDepositStage } from '../types/reports.types';

// Thứ Hai 28/09/2026
const NOW = dayjs('2026-09-28T10:00:00');

const dep = (id: number, order: number, depositDate: string, amount = 100): ReportDepositStage => ({
  id, order, stage: order === 1 ? 'ftd' : 'redeposit', amount, depositDate, cumulative: amount * order,
  daysSincePrevious: order === 1 ? null : 5, broker: null, note: null, createdBy: null,
});

describe('quick range', () => {
  it('4 preset: hôm nay / tuần này (T2->CN) / tuần trước / tháng này', () => {
    const fmt = (k: string) => {
      const [a, b] = QUICK_RANGE_OPTIONS.find((o) => o.key === k)!.getRange(NOW);
      return `${a.format('YYYY-MM-DD')}→${b.format('YYYY-MM-DD')}`;
    };
    expect(fmt('today')).toBe('2026-09-28→2026-09-28');
    expect(fmt('thisWeek')).toBe('2026-09-28→2026-10-04');
    expect(fmt('lastWeek')).toBe('2026-09-21→2026-09-27');
    expect(fmt('thisMonth')).toBe('2026-09-01→2026-09-30');
  });

  it('matchQuickRange nhận đúng preset, khoảng tự chọn/rỗng -> null', () => {
    const [a, b] = QUICK_RANGE_OPTIONS[2].getRange(NOW);
    expect(matchQuickRange([a, b], NOW)).toBe('lastWeek');
    expect(matchQuickRange([dayjs('2026-09-02'), dayjs('2026-09-03')], NOW)).toBeNull();
    expect(matchQuickRange(null, NOW)).toBeNull();
    expect(matchQuickRange([null, null], NOW)).toBeNull();
  });
});

describe('filterDepositsByRange', () => {
  const list = [dep(1, 1, '2026-09-01'), dep(2, 2, '2026-09-15'), dep(3, 3, '2026-09-28')];
  it('lọc gồm cả 2 đầu; không range = giữ hết', () => {
    expect(filterDepositsByRange(list, [dayjs('2026-09-15'), dayjs('2026-09-28')]).map((d) => d.id)).toEqual([2, 3]);
    expect(filterDepositsByRange(list, null)).toHaveLength(3);
    expect(filterDepositsByRange([], [dayjs('2026-09-15'), dayjs('2026-09-28')])).toEqual([]);
  });
});

describe('buildCustomerTimeline', () => {
  const detail = {
    customer: {
      id: 1, name: 'A', phone: null, email: null, source: null, campaign: null, broker: null, status: 'closed', note: null,
      inputDate: '2026-09-01', assignedDate: '2026-09-02', closedDate: '2026-09-10', createdAt: '2026-08-31T20:00:00.000Z',
      salesUser: { id: 2, name: 'Sales', departmentName: null }, marketingUser: null, createdBy: null,
    },
    deposits: [dep(1, 1, '2026-09-10', 500), dep(2, 2, '2026-09-20', 250)],
    depositSummary: {} as never,
    careNotes: [],
    groups: [{ id: 7, name: 'Nhóm VIP', joinedAt: '2026-09-05T03:00:00.000Z' }],
  } as ReportCustomerDetail;

  it('sắp theo ngày; cùng ngày (chốt & nạp đầu 10/09) giữ thứ tự vòng đời chốt -> nạp', () => {
    const t = buildCustomerTimeline(detail);
    expect(t.map((e) => e.kind)).toEqual(['created', 'assigned', 'joined', 'closed', 'ftd', 'redeposit']);
    expect(t[4]).toMatchObject({ title: 'Nạp lần đầu (FTD)', detail: '$500.00' });
    expect(t[5].title).toBe('Nạp lại lần 1');
  });

  it('khách mới chưa gán/chưa nạp -> chỉ có mốc nhập data', () => {
    const t = buildCustomerTimeline({
      ...detail,
      customer: { ...detail.customer, assignedDate: null, closedDate: null },
      deposits: [],
      groups: [],
    });
    expect(t.map((e) => e.kind)).toEqual(['created']);
  });
});
