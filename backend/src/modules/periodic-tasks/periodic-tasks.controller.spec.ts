import { PeriodicTasksController } from './periodic-tasks.controller';

/**
 * [PERF] `findAll()` chạy 3 bước đính (checklistProgress / secondaryAssignees / customerCount) SONG SONG rồi gộp 1 lần.
 * Test khoá hành vi gộp: đủ field, đúng thứ tự dòng, và `customerCount` VẮNG hẳn khi người xem không có `customers.view`.
 * Controller dựng thẳng bằng mock (không cần Nest TestingModule - guard/decorator không liên quan).
 */
describe('PeriodicTasksController.findAll (gộp 3 bước đính song song)', () => {
  const user = { id: 1, role: 'employee' };
  const rows = [
    { id: 1, title: 'A' },
    { id: 2, title: 'B' },
  ];

  const build = (customerCountImpl: (tasks: any[], u: any) => Promise<any[]>) => {
    const tasksService = { findAll: jest.fn().mockResolvedValue({ data: rows, total: 2, page: 1, limit: 20, totalPages: 1 }) };
    const checklist = {
      attachChecklistProgressToList: jest.fn(async (t: any[]) =>
        t.map((x) => ({ ...x, checklistProgress: { done: x.id, total: 10 } })),
      ),
    };
    const secondary = {
      attachSecondaryAssigneesToList: jest.fn(async (t: any[]) =>
        t.map((x) => ({ ...x, secondaryAssignees: [{ id: 9, name: `S${x.id}` }] })),
      ),
    };
    const customers = { attachCustomerCountToList: jest.fn(customerCountImpl) };
    const controller = new PeriodicTasksController(
      tasksService as any,
      {} as any,
      customers as any,
      secondary as any,
      checklist as any,
      {} as any,
      {} as any,
    );
    return { controller, tasksService, checklist, secondary, customers };
  };

  it('gộp đủ checklistProgress + secondaryAssignees + customerCount, giữ nguyên thứ tự và metadata phân trang', async () => {
    const { controller, checklist, secondary, customers } = build(async (t) =>
      t.map((x) => ({ ...x, customerCount: x.id * 3 })),
    );

    const res = await controller.findAll(user, {} as any, 'own');

    expect(res).toMatchObject({ total: 2, page: 1, limit: 20, totalPages: 1 });
    expect(res.data).toEqual([
      { id: 1, title: 'A', checklistProgress: { done: 1, total: 10 }, secondaryAssignees: [{ id: 9, name: 'S1' }], customerCount: 3 },
      { id: 2, title: 'B', checklistProgress: { done: 2, total: 10 }, secondaryAssignees: [{ id: 9, name: 'S2' }], customerCount: 6 },
    ]);
    // cả 3 bước đều nhận danh sách GỐC (không phụ thuộc kết quả của nhau)
    expect(checklist.attachChecklistProgressToList).toHaveBeenCalledWith(rows, user.id, user.role, 'own');
    expect(secondary.attachSecondaryAssigneesToList).toHaveBeenCalledWith(rows);
    expect(customers.attachCustomerCountToList).toHaveBeenCalledWith(rows, user);
  });

  it('không có quyền customers.view -> KHÔNG có key customerCount (không phải 0)', async () => {
    const { controller } = build(async (t) => t); // đúng hành vi thật: trả nguyên danh sách

    const res = await controller.findAll(user, {} as any, 'own');

    for (const row of res.data) {
      expect(row).not.toHaveProperty('customerCount');
      expect(row).toHaveProperty('checklistProgress');
      expect(row).toHaveProperty('secondaryAssignees');
    }
  });

  it('danh sách rỗng -> data rỗng, không lỗi', async () => {
    const { controller, tasksService } = build(async () => []);
    tasksService.findAll.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
    (controller as any).periodicTaskChecklistItemsService.attachChecklistProgressToList.mockResolvedValue([]);
    (controller as any).periodicTaskSecondaryAssigneesService.attachSecondaryAssigneesToList.mockResolvedValue([]);

    const res = await controller.findAll(user, {} as any, 'own');
    expect(res.data).toEqual([]);
  });
});
