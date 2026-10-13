import { CustomersService } from './customers.service';

/**
 * [PERF 14A-2] `loadRecentNotesMap()` / `attachRecentNotes()`: top-5 ghi chú/khách cắt trong SQL, dùng chung cho
 * findAll + getUnassigned + getAssigned. Dựng service bằng prototype + mock `notesRepository.query`.
 */
describe('CustomersService recent notes (14A-2)', () => {
  const row = (id: number, customerId: number, name: string | null = 'A') => ({
    id, note: `n${id}`, createdAt: new Date(2026, 0, id), customerId, createdByName: name,
  });
  const build = (rows: any[]) => {
    const service: any = Object.create(CustomersService.prototype);
    service.notesRepository = { query: jest.fn().mockResolvedValue(rows) };
    return service;
  };

  it('không có id -> không query, Map rỗng', async () => {
    const s = build([]);
    expect((await s.loadRecentNotesMap([])).size).toBe(0);
    expect(s.notesRepository.query).not.toHaveBeenCalled();
  });

  it('SQL: top-5 theo PARTITION BY customer_id, tie-break id DESC, tham số đúng số id, chỉ users.name', async () => {
    const s = build([]);
    await s.loadRecentNotesMap([3, 4, 5]);
    const [sql, params] = s.notesRepository.query.mock.calls[0];
    expect(params).toEqual([3, 4, 5]);
    expect(sql).toContain('IN (?,?,?)');
    expect(sql).toContain('ORDER BY created_at DESC, id DESC');
    expect(sql).toContain('n.rn <= 5');
    expect(sql).toContain('u.name AS createdByName');
  });

  it('gom đúng theo khách, giữ thứ tự DB, chốt cứng 5 dòng nếu driver trả dư, ép id/customerId về number', async () => {
    const rows = [1, 2, 3, 4, 5, 6, 7].map((i) => row(i, 10)).concat([{ ...row(20, 11, null), id: '20' as any, customerId: '11' as any }]);
    const map = await build(rows).loadRecentNotesMap([10, 11, 12]);
    expect(map.get(10)!.map((n: any) => n.id)).toEqual([1, 2, 3, 4, 5]);
    expect(map.get(11)).toEqual([{ id: 20, note: 'n20', createdAt: new Date(2026, 0, 20), createdByName: null }]);
    expect(map.has(12)).toBe(false);
  });

  it('attachRecentNotes: gắn recentNotes cho mọi khách (khách 0 note -> []), shape cũ {id,note,createdAt,createdByName}', async () => {
    const s = build([row(1, 10, 'Bob')]);
    const customers: any[] = [{ id: 10 }, { id: 11 }];
    await s.attachRecentNotes(customers);
    expect(customers[0].recentNotes).toEqual([{ id: 1, note: 'n1', createdAt: new Date(2026, 0, 1), createdByName: 'Bob' }]);
    expect(customers[1].recentNotes).toEqual([]);
  });

  it('attachRecentNotes: mảng rỗng -> không query', async () => {
    const s = build([]);
    await s.attachRecentNotes([]);
    expect(s.notesRepository.query).not.toHaveBeenCalled();
  });
});
