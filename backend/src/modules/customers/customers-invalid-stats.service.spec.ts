import {
  CustomersInvalidStatsService,
  STATS_MAX_DAYS,
  STATS_MIN_DAYS,
  shiftDateStr,
} from './customers-invalid-stats.service';

/**
 * Mock QueryBuilder chainable: mọi hàm builder trả về chính nó; `getCount()` /
 * `getRawMany()` lấy kết quả từ hàng đợi theo THỨ TỰ gọi (service gọi tuần tự
 * xác định: 4 count tổng quan -> 2 raw khoá trùng -> count mẫu số -> raw thành viên).
 * Dùng role 'admin' để `applyViewFilter` không thêm điều kiện (chỉ test logic thống kê).
 */
function makeService(counts: number[], raws: unknown[][], users: Array<{ id: number; name: string }> = []) {
  const countQueue = [...counts];
  const rawQueue = [...raws];
  const qb: Record<string, jest.Mock> = {};
  ['select', 'addSelect', 'where', 'andWhere', 'groupBy', 'having'].forEach((m) => {
    qb[m] = jest.fn().mockReturnValue(qb);
  });
  qb.getCount = jest.fn().mockImplementation(async () => countQueue.shift() ?? 0);
  qb.getRawMany = jest.fn().mockImplementation(async () => rawQueue.shift() ?? []);
  const customerRepo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
  const userRepo = { find: jest.fn().mockResolvedValue(users) };
  const service = new CustomersInvalidStatsService(customerRepo as never, userRepo as never);
  return { service, customerRepo, userRepo, qb };
}

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

describe('shiftDateStr', () => {
  it('cộng/trừ ngày, qua ranh giới tháng và năm', () => {
    expect(shiftDateStr('2026-09-28', -1)).toBe('2026-09-27');
    expect(shiftDateStr('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDateStr('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDateStr('2026-09-28', 0)).toBe('2026-09-28');
  });
});

describe('CustomersInvalidStatsService.getStats', () => {
  it('duplicate_phone: tính đúng KPI, mức nghiêm trọng, Top người nhập và cụm lớn nhất', async () => {
    const keysPhone = [
      { dupKey: '0901111111', cnt: '3' },
      { dupKey: '0902222222', cnt: 2 },
    ];
    const keysEmail = [{ dupKey: 'a@x.com', cnt: 2 }];
    const members = [
      // Cụm A: 3 bản, 2 Sales khác nhau -> "trùng khác Sales"
      { id: 1, dup_key: '0901111111', sales_user_id: 10, created_by_id: 5, created_at: daysAgo(10) },
      { id: 2, dup_key: '0901111111', sales_user_id: 11, created_by_id: 6, created_at: daysAgo(0.001) },
      { id: 3, dup_key: '0901111111', sales_user_id: 11, created_by_id: 6, created_at: new Date() },
      // Cụm B: 2 bản cùng Sales, bản dư nhập cách đây 200 ngày (ngoài khung xu hướng)
      { id: 4, dup_key: '0902222222', sales_user_id: 10, created_by_id: 5, created_at: daysAgo(300) },
      { id: 5, dup_key: '0902222222', sales_user_id: 10, created_by_id: 5, created_at: daysAgo(200) },
    ];
    const { service, userRepo } = makeService(
      [100, 2, 7, 9, 50], // total, future, missingPhone, missingEmail, totalWithValue
      [keysPhone, keysEmail, members],
      [
        { id: 5, name: 'Nhân viên 5' },
        { id: 6, name: 'Nhân viên 6' },
        { id: 10, name: 'Sales 10' },
        { id: 11, name: 'Sales 11' },
      ],
    );

    const res = await service.getStats(1, 'admin', null, 'duplicate_phone', 7);

    expect(res.days).toBe(7);
    expect(res.overview).toEqual({
      totalCustomers: 100,
      future_date: 2,
      missing_phone: 7,
      missing_email: 9,
      duplicate_phone: { groups: 2, customers: 5 },
      duplicate_email: { groups: 1, customers: 2 },
    });

    const d = res.duplicate!;
    expect(d.totalWithValue).toBe(50);
    expect(d.groupCount).toBe(2);
    expect(d.affectedCustomers).toBe(5);
    expect(d.redundantCount).toBe(3);
    expect(d.duplicateRatePercent).toBe(10); // 5/50
    expect(d.maxGroupSize).toBe(3);
    expect(d.crossSalesGroups).toBe(1);
    expect(d.sameSalesGroups).toBe(1);
    expect(d.sizeDistribution).toEqual([
      { label: '2 bản ghi', groups: 1 },
      { label: '3 bản ghi', groups: 1 },
      { label: '4 bản ghi', groups: 0 },
      { label: '5+ bản ghi', groups: 0 },
    ]);

    // Trend: đủ 7 ngày liên tục; chỉ 2 bản dư của cụm A nằm trong khung, bản dư cụm B (200 ngày) bị loại.
    expect(d.trend).toHaveLength(7);
    expect(d.trend.reduce((s, t) => s + t.redundant, 0)).toBeGreaterThanOrEqual(1);
    expect(d.trend.reduce((s, t) => s + t.redundant, 0)).toBeLessThanOrEqual(2);

    // Top người nhập: tính trên bản SAU bản gốc: NV6 = 2 (id 2,3), NV5 = 1 (id 5).
    expect(d.topCreators).toEqual([
      { userId: 6, name: 'Nhân viên 6', redundantCount: 2 },
      { userId: 5, name: 'Nhân viên 5', redundantCount: 1 },
    ]);

    // Top cụm: A (3 bản) trước B (2 bản).
    expect(d.topGroups.map((g) => [g.key, g.size, g.distinctSales])).toEqual([
      ['0901111111', 3, 2],
      ['0902222222', 2, 1],
    ]);
    expect(d.topGroups[0].salesNames.sort()).toEqual(['Sales 10', 'Sales 11']);
    // Tên người dùng chỉ tra 1 lần cho cả Top người nhập + Sales của Top cụm.
    expect(userRepo.find).toHaveBeenCalledTimes(1);
  });

  it('loại lỗi không phải trùng lặp: chỉ trả tổng quan, duplicate = null', async () => {
    const { service } = makeService([10, 1, 2, 3], [[], []]);
    const res = await service.getStats(1, 'admin', null, 'missing_phone');
    expect(res.duplicate).toBeNull();
    expect(res.overview.totalCustomers).toBe(10);
    expect(res.overview.duplicate_phone).toEqual({ groups: 0, customers: 0 });
  });

  it('không có cụm trùng: trả về khung trống nhưng trend vẫn đủ ngày, tỷ lệ = 0', async () => {
    const { service, userRepo } = makeService([10, 0, 0, 0, 8], [[], []]);
    const res = await service.getStats(1, 'admin', null, 'duplicate_email', 14);
    const d = res.duplicate!;
    expect(d.groupCount).toBe(0);
    expect(d.duplicateRatePercent).toBe(0);
    expect(d.trend).toHaveLength(14);
    expect(d.topGroups).toEqual([]);
    expect(userRepo.find).not.toHaveBeenCalled();
  });

  it('không có khách nào có giá trị: tỷ lệ = null (tránh chia cho 0)', async () => {
    const { service } = makeService([0, 0, 0, 0, 0], [[], []]);
    const res = await service.getStats(1, 'admin', null, 'duplicate_phone');
    expect(res.duplicate!.duplicateRatePercent).toBeNull();
  });

  it('kẹp `days` trong [MIN, MAX] và dùng mặc định khi không hợp lệ', async () => {
    const big = await makeService([0, 0, 0, 0, 0], [[], []]).service.getStats(1, 'admin', null, 'duplicate_phone', 1000);
    expect(big.days).toBe(STATS_MAX_DAYS);
    expect(big.duplicate!.trend).toHaveLength(STATS_MAX_DAYS);

    const small = await makeService([0, 0, 0, 0, 0], [[], []]).service.getStats(1, 'admin', null, 'duplicate_phone', 1);
    expect(small.days).toBe(STATS_MIN_DAYS);

    const nan = await makeService([0, 0, 0, 0, 0], [[], []]).service.getStats(1, 'admin', null, 'duplicate_phone', NaN);
    expect(nan.days).toBe(30);
  });

  it('bỏ qua cụm bị thu hẹp còn 1 bản do phạm vi quyền xem', async () => {
    const keys = [{ dupKey: '0903333333', cnt: 2 }];
    const members = [{ id: 9, dup_key: '0903333333', sales_user_id: 1, created_by_id: 1, created_at: new Date() }];
    const { service } = makeService([5, 0, 0, 0, 5], [keys, [], members]);
    const res = await service.getStats(1, 'admin', null, 'duplicate_phone');
    expect(res.duplicate!.groupCount).toBe(0);
    expect(res.duplicate!.affectedCustomers).toBe(0);
  });
});
