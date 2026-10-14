import { SecurityActivityService } from './security-activity.service';

function makeQb() {
  const qb: any = {};
  for (const m of ['select', 'leftJoin', 'addSelect', 'where', 'andWhere', 'orderBy', 'addOrderBy', 'offset', 'limit']) {
    qb[m] = jest.fn().mockReturnValue(qb);
  }
  qb.getManyAndCount = jest.fn().mockResolvedValue([[{ id: 1 }], 41]);
  return qb;
}

describe('SecurityActivityService (P4.3)', () => {
  let qb: any;
  let repo: { createQueryBuilder: jest.Mock; query: jest.Mock };
  let service: SecurityActivityService;
  beforeEach(() => {
    qb = makeQb();
    repo = { createQueryBuilder: jest.fn().mockReturnValue(qb), query: jest.fn() };
    service = new SecurityActivityService(repo as any);
  });

  it('listEvents: mặc định chỉ lấy các action bảo mật, phân trang, trả totalPages', async () => {
    const res = await service.listEvents({ page: 3, limit: 20 } as any);
    const [, p] = qb.where.mock.calls[0];
    expect(p.actions).toContain('LOGIN_FAILED');
    expect(qb.offset).toHaveBeenCalledWith(40);
    expect(qb.limit).toHaveBeenCalledWith(20);
    expect(res).toMatchObject({ total: 41, page: 3, limit: 20, totalPages: 3 });
  });

  it('listEvents: lọc 1 action cụ thể', async () => {
    await service.listEvents({ action: 'ACCOUNT_LOCKED' } as any);
    expect(qb.where.mock.calls[0][1].actions).toEqual(['ACCOUNT_LOCKED']);
  });

  it('listEvents: IP lọc theo TIỀN TỐ, ký tự đại diện của người dùng bị bỏ', async () => {
    await service.listEvents({ ip: ' 113.%161._ ' } as any);
    const call = qb.andWhere.mock.calls.find((c: any[]) => String(c[0]).includes('ipAddress'));
    expect(call[1]).toEqual({ ip: '113.161.%' });
  });

  it('listEvents: search tìm cả email trong newData lẫn user.email/name', async () => {
    await service.listEvents({ search: 'ghost%' } as any);
    const call = qb.andWhere.mock.calls.find((c: any[]) => String(c[0]).includes('JSON_EXTRACT'));
    expect(String(call[0])).toContain('user.email LIKE');
    expect(call[1]).toEqual({ like: '%ghost%' });
  });

  it('listEvents: ngày VN -> mốc UTC lùi 7 giờ, toDate là cận trên mở (00:00 ngày kế tiếp)', async () => {
    await service.listEvents({ fromDate: '2026-10-14', toDate: '2026-10-14' } as any);
    const from = qb.andWhere.mock.calls.find((c: any[]) => String(c[0]).includes('>= :from'));
    const to = qb.andWhere.mock.calls.find((c: any[]) => String(c[0]).includes('< :to'));
    expect(from[1].from).toBe('2026-10-13 17:00:00'); // 00:00 ngày 14 giờ VN
    expect(to[1].to).toBe('2026-10-14 17:00:00'); // 00:00 ngày 15 giờ VN
  });

  it('summary: gom số liệu bằng đồng hồ DB; trả số (không phải chuỗi); bỏ email rỗng', async () => {
    repo.query
      .mockResolvedValueOnce([{ locked: '4', failed: '17' }])
      .mockResolvedValueOnce([{ c: '2' }])
      .mockResolvedValueOnce([{ email: 'ghost@x.co', c: '9' }, { email: null, c: '3' }]);
    const s = await service.summary();
    expect(s).toEqual({ lockedToday: 4, failedToday: 17, blockedIpsNow: 2, topUnknownEmails: [{ email: 'ghost@x.co', count: 9 }] });
    const sql = repo.query.mock.calls[0][0] as string;
    expect(sql).toContain('NOW()');
    // số placeholder khớp số tham số
    expect((sql.match(/\?/g) ?? []).length).toBe((repo.query.mock.calls[0][1] as unknown[]).length);
  });

  it('summary: không có dữ liệu -> toàn 0; bảng login_ip_blocks lỗi (chưa migrate) -> 0, không ném', async () => {
    repo.query
      .mockResolvedValueOnce([{ locked: null, failed: null }])
      .mockRejectedValueOnce(new Error('no table'))
      .mockResolvedValueOnce([]);
    expect(await service.summary()).toEqual({ lockedToday: 0, failedToday: 0, blockedIpsNow: 0, topUnknownEmails: [] });
  });
});
