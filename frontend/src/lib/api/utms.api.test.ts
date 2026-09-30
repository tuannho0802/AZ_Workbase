import { describe, expect, it } from 'vitest';
import { serializeStatsParams } from './utms.api';

describe('serializeStatsParams', () => {
  it('utmIds -> chuỗi "1,2,3" (axios mặc định gửi utmIds[]=1 mà BE không hiểu)', () => {
    expect(serializeStatsParams({ from: '2026-09-01', to: '2026-09-30', utmIds: [1, 2, 3] })).toEqual({
      from: '2026-09-01', to: '2026-09-30', utmIds: '1,2,3',
    });
  });

  it('mảng rỗng / undefined -> bỏ hẳn key (= không lọc)', () => {
    expect('utmIds' in serializeStatsParams({ utmIds: [] })).toBe(false);
    expect('utmIds' in serializeStatsParams({})).toBe(false);
  });

  it('giữ nguyên các tham số khác (quản lý chính/phụ, phân trang, trạng thái)', () => {
    expect(serializeStatsParams({ primaryManagerId: 5, secondaryManagerId: 7, page: 2, status: 'closed' } as never)).toEqual({
      primaryManagerId: 5, secondaryManagerId: 7, page: 2, status: 'closed',
    });
  });
});
