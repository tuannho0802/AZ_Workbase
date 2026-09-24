import { PeriodType } from '../../../common/enums/period-type.enum';
import { computeReminderDate, diffDaysInclusive } from './deadline-reminder.helper';

describe('diffDaysInclusive', () => {
  it('cùng 1 ngày -> 1', () => {
    expect(diffDaysInclusive('2026-09-24', '2026-09-24')).toBe(1);
  });

  it('3 ngày liên tiếp -> 3', () => {
    expect(diffDaysInclusive('2026-09-01', '2026-09-03')).toBe(3);
  });
});

describe('computeReminderDate', () => {
  it('Weekly -> nhắc trước 1 ngày so với period_end_date', () => {
    expect(
      computeReminderDate({
        periodType: PeriodType.WEEKLY,
        periodStartDate: '2026-09-21',
        periodEndDate: '2026-09-27',
      }),
    ).toBe('2026-09-26');
  });

  it('Daily 1 ngày -> nhắc đúng ngày đó', () => {
    expect(
      computeReminderDate({
        periodType: PeriodType.DAILY,
        periodStartDate: '2026-09-24',
        periodEndDate: '2026-09-24',
      }),
    ).toBe('2026-09-24');
  });

  it('Daily 3 ngày (1,2,3) -> nhắc vào ngày GIỮA (ngày 2), đúng ví dụ chủ dự án đưa ra', () => {
    expect(
      computeReminderDate({
        periodType: PeriodType.DAILY,
        periodStartDate: '2026-09-01',
        periodEndDate: '2026-09-03',
      }),
    ).toBe('2026-09-02');
  });

  it('Daily 4 ngày -> ceil(4/2)=2 -> ngày thứ 2 trong khoảng', () => {
    expect(
      computeReminderDate({
        periodType: PeriodType.DAILY,
        periodStartDate: '2026-09-01',
        periodEndDate: '2026-09-04',
      }),
    ).toBe('2026-09-02');
  });

  it('Daily 5 ngày -> ceil(5/2)=3 -> ngày thứ 3 (đúng giữa)', () => {
    expect(
      computeReminderDate({
        periodType: PeriodType.DAILY,
        periodStartDate: '2026-09-01',
        periodEndDate: '2026-09-05',
      }),
    ).toBe('2026-09-03');
  });

  it('Monthly/Yearly -> null (chưa có quy tắc, cố tình chưa nhắc)', () => {
    expect(
      computeReminderDate({
        periodType: PeriodType.MONTHLY,
        periodStartDate: '2026-09-01',
        periodEndDate: '2026-09-30',
      }),
    ).toBeNull();
    expect(
      computeReminderDate({
        periodType: PeriodType.YEARLY,
        periodStartDate: '2026-01-01',
        periodEndDate: '2026-12-31',
      }),
    ).toBeNull();
  });
});
