import { BadRequestException } from '@nestjs/common';
import { MAX_LIST_RANGE_DAYS, addDaysToDateString, resolveListWindow } from './list-window.helper';

describe('resolveListWindow', () => {
  // 2026-09-24 là Thứ Năm -> tuần này = 2026-09-21 (T2) .. 2026-09-27 (CN)
  const today = '2026-09-24';

  it('không truyền gì -> mặc định TUẦN NÀY (T2 -> CN), defaulted=true', () => {
    expect(resolveListWindow({}, today)).toEqual({ dateFrom: '2026-09-21', dateTo: '2026-09-27', defaulted: true });
  });

  it('hôm nay là Chủ nhật vẫn thuộc tuần bắt đầu từ Thứ 2 trước đó', () => {
    expect(resolveListWindow({}, '2026-09-27')).toMatchObject({ dateFrom: '2026-09-21', dateTo: '2026-09-27' });
  });

  it('hôm nay là Thứ 2 -> tuần bắt đầu chính hôm nay', () => {
    expect(resolveListWindow({}, '2026-09-21')).toMatchObject({ dateFrom: '2026-09-21', dateTo: '2026-09-27' });
  });

  it('chỉ có periodStartDate (khớp chính xác 1 kỳ) -> không ép khoảng', () => {
    expect(resolveListWindow({ periodStartDate: '2026-09-14' }, today)).toEqual({ dateFrom: null, dateTo: null, defaulted: false });
  });

  it('truyền đủ 2 biên hợp lệ -> giữ nguyên', () => {
    expect(resolveListWindow({ dateFrom: '2026-09-01', dateTo: '2026-09-30' }, today)).toEqual({
      dateFrom: '2026-09-01', dateTo: '2026-09-30', defaulted: false,
    });
  });

  it('chỉ có dateFrom -> dateTo = +6 ngày; chỉ có dateTo -> dateFrom = -6 ngày', () => {
    expect(resolveListWindow({ dateFrom: '2026-09-10' }, today)).toMatchObject({ dateFrom: '2026-09-10', dateTo: '2026-09-16' });
    expect(resolveListWindow({ dateTo: '2026-09-10' }, today)).toMatchObject({ dateFrom: '2026-09-04', dateTo: '2026-09-10' });
  });

  it('chấp nhận chuỗi ISO có giờ', () => {
    expect(resolveListWindow({ dateFrom: '2026-09-01T00:00:00.000Z', dateTo: '2026-09-07T23:59:59Z' }, today)).toMatchObject({
      dateFrom: '2026-09-01', dateTo: '2026-09-07',
    });
  });

  it('dateFrom > dateTo -> 400', () => {
    expect(() => resolveListWindow({ dateFrom: '2026-09-10', dateTo: '2026-09-01' }, today)).toThrow(BadRequestException);
  });

  it(`vượt ${MAX_LIST_RANGE_DAYS} ngày -> 400, đúng ${MAX_LIST_RANGE_DAYS} ngày -> OK`, () => {
    expect(() => resolveListWindow({ dateFrom: '2026-01-01', dateTo: '2026-12-31' }, today)).toThrow(BadRequestException);
    const to = addDaysToDateString('2026-01-01', MAX_LIST_RANGE_DAYS - 1);
    expect(resolveListWindow({ dateFrom: '2026-01-01', dateTo: to }, today).defaulted).toBe(false);
    const tooLong = addDaysToDateString('2026-01-01', MAX_LIST_RANGE_DAYS);
    expect(() => resolveListWindow({ dateFrom: '2026-01-01', dateTo: tooLong }, today)).toThrow(BadRequestException);
  });

  it('ngày không hợp lệ -> 400 (không crash 500)', () => {
    expect(() => resolveListWindow({ dateFrom: '2026-13-45', dateTo: '2026-14-01' }, today)).toThrow(BadRequestException);
  });
});
