import { BadRequestException } from '@nestjs/common';
import { addDaysStr, normalizeDateRanges, vnRangeToUtcBounds } from './date-ranges.util';

const TODAY = '2026-10-14';

describe('normalizeDateRanges', () => {
  it('khoảng ngược -> 400', () => {
    expect(() => normalizeDateRanges([{ from: '2026-03-10', to: '2026-03-01' }], TODAY)).toThrow(BadRequestException);
  });

  it('ngày sai định dạng / không có thật -> 400', () => {
    expect(() => normalizeDateRanges([{ from: '2026-3-1', to: '2026-03-02' }], TODAY)).toThrow(BadRequestException);
    expect(() => normalizeDateRanges([{ from: '2026-02-31', to: '2026-03-02' }], TODAY)).toThrow(BadRequestException);
  });

  it('khoảng quá 366 ngày -> 400, đúng 366 ngày thì qua', () => {
    expect(() => normalizeDateRanges([{ from: '2024-01-01', to: '2025-01-02' }], TODAY)).toThrow(BadRequestException); // 367 ngày
    expect(normalizeDateRanges([{ from: '2024-01-01', to: '2024-12-31' }], TODAY).ranges).toHaveLength(1); // 366 ngày (năm nhuận)
  });

  it('rỗng hoặc quá 20 khoảng -> 400', () => {
    expect(() => normalizeDateRanges([], TODAY)).toThrow(BadRequestException);
    const many = Array.from({ length: 21 }, (_, i) => ({ from: addDaysStr('2026-01-01', i * 3), to: addDaysStr('2026-01-01', i * 3) }));
    expect(() => normalizeDateRanges(many, TODAY)).toThrow(BadRequestException);
    expect(normalizeDateRanges(many.slice(0, 20), TODAY).ranges).toHaveLength(20);
  });

  it('cắt `to` về hôm qua (VN) khi khoảng chứa hôm nay/tương lai', () => {
    const r = normalizeDateRanges([{ from: '2026-10-10', to: '2026-10-20' }], TODAY);
    expect(r.ranges).toEqual([{ from: '2026-10-10', to: '2026-10-13' }]);
    expect(r.dropped).toEqual([]);
  });

  it('khoảng nằm trọn từ hôm nay trở đi -> loại và báo trong dropped', () => {
    const r = normalizeDateRanges([{ from: '2026-10-14', to: '2026-10-15' }, { from: '2026-10-01', to: '2026-10-02' }], TODAY);
    expect(r.ranges).toEqual([{ from: '2026-10-01', to: '2026-10-02' }]);
    expect(r.dropped).toEqual([{ from: '2026-10-14', to: '2026-10-15' }]);
  });

  it('gộp khoảng chồng lấn', () => {
    const r = normalizeDateRanges([{ from: '2026-01-10', to: '2026-01-20' }, { from: '2026-01-15', to: '2026-01-25' }], TODAY);
    expect(r.ranges).toEqual([{ from: '2026-01-10', to: '2026-01-25' }]);
  });

  it('gộp khoảng liền kề (ngày kế tiếp) nhưng KHÔNG gộp khi cách 1 ngày trống', () => {
    expect(normalizeDateRanges([{ from: '2026-01-01', to: '2026-01-10' }, { from: '2026-01-11', to: '2026-01-15' }], TODAY).ranges)
      .toEqual([{ from: '2026-01-01', to: '2026-01-15' }]);
    expect(normalizeDateRanges([{ from: '2026-01-01', to: '2026-01-10' }, { from: '2026-01-12', to: '2026-01-15' }], TODAY).ranges)
      .toHaveLength(2);
  });

  it('khoảng nằm lọt trong khoảng khác và đầu vào không theo thứ tự', () => {
    const r = normalizeDateRanges([{ from: '2026-02-01', to: '2026-02-05' }, { from: '2026-01-01', to: '2026-03-01' }], TODAY);
    expect(r.ranges).toEqual([{ from: '2026-01-01', to: '2026-03-01' }]);
  });
});

describe('vnRangeToUtcBounds', () => {
  it('ngày VN 2026-01-10 -> [09/01 17:00 UTC, 10/01 17:00 UTC)', () => {
    expect(vnRangeToUtcBounds({ from: '2026-01-10', to: '2026-01-10' })).toEqual({
      fromUtc: '2026-01-09 17:00:00',
      toUtc: '2026-01-10 17:00:00',
    });
  });
  it('nhiều ngày: cận trên là hết ngày `to` (exclusive)', () => {
    expect(vnRangeToUtcBounds({ from: '2026-01-01', to: '2026-01-31' })).toEqual({
      fromUtc: '2025-12-31 17:00:00',
      toUtc: '2026-01-31 17:00:00',
    });
  });
});
