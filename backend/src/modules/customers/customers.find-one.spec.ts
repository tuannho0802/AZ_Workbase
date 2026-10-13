import { CustomersService } from './customers.service';
import { CustomerNotFoundException } from './exceptions/customer.exceptions';

/**
 * [PERF 14A-1] `findOne()` (detail) không còn join deposits×notes + User đầy đủ; `update()`/`remove()` dùng
 * `findForMutation()` nhẹ. Dựng service bằng prototype + mock repo (không cần Nest TestingModule).
 */
describe('CustomersService.findOne / findForMutation (14A-1)', () => {
  const chain = (result: any) => {
    const calls: { joins: string[]; selects: string[][]; where: string[] } = { joins: [], selects: [], where: [] };
    const qb: any = {
      leftJoinAndSelect: jest.fn((rel: string) => (calls.joins.push(`S:${rel}`), qb)),
      leftJoin: jest.fn((rel: string) => (calls.joins.push(`J:${rel}`), qb)),
      addSelect: jest.fn((cols: string[]) => (calls.selects.push(cols), qb)),
      where: jest.fn((w: string) => (calls.where.push(w), qb)),
      andWhere: jest.fn((w: string) => (calls.where.push(w), qb)),
      orderBy: jest.fn(() => qb),
      getOne: jest.fn().mockResolvedValue(result),
      getMany: jest.fn().mockResolvedValue(result),
    };
    return { qb, calls };
  };

  const build = (customer: any | null, notes: any[] = [], depositCount = 0, assignments: any[] = []) => {
    const main = chain(customer);
    const noteQ = chain(notes);
    const assignQ = chain(assignments);
    const service: any = Object.create(CustomersService.prototype);
    service.customersRepository = { createQueryBuilder: jest.fn(() => main.qb) };
    service.notesRepository = { createQueryBuilder: jest.fn(() => noteQ.qb) };
    service.assignmentRepository = { createQueryBuilder: jest.fn(() => assignQ.qb) };
    service.depositsRepository = { count: jest.fn().mockResolvedValue(depositCount) };
    service.uiVisibilityService = {
      getHiddenElementKeys: jest.fn().mockResolvedValue(new Set()),
      stripHiddenCustomerFields: jest.fn((c: any) => c),
    };
    return { service, main, noteQ, assignQ };
  };

  const base = () => ({ id: 5, name: 'K', salesUserId: 2, salesUser: { id: 2, name: 'S' } });

  it('findOne: KHÔNG join deposits/notes vào query chính; User chỉ id/name/role (+position id/name/color)', async () => {
    const { service, main } = build(base());
    await service.findOne(5, 1, 'admin', null);

    const joined = main.calls.joins.join(',');
    expect(joined).not.toContain('customer.deposits');
    expect(joined).not.toContain('customer.notes');
    expect(joined).not.toContain('S:customer.salesUser'); // không còn leftJoinAndSelect User đầy đủ
    expect(joined).not.toContain('S:customer.createdBy');
    const flat = main.calls.selects.flat();
    expect(flat).toEqual(expect.arrayContaining(['salesUser.id', 'salesUser.name', 'salesUser.role', 'createdBy.name', 'salesUserPosition.name']));
    expect(flat.some((c) => /\.(email|phone|employeeCode|annualLeaveBalance)$/.test(c))).toBe(false);
  });

  it('findOne: trả notes (query riêng, tên người tạo/sửa) + depositCount, không có key deposits', async () => {
    const notes = [{ id: 2, createdByUser: { id: 1, name: 'A' } }, { id: 1 }];
    const { service, noteQ } = build(base(), notes, 7);
    const res = await service.findOne(5, 1, 'admin', null);

    expect(res.notes).toBe(notes);
    expect(res.depositCount).toBe(7);
    expect(res).not.toHaveProperty('deposits');
    expect(noteQ.calls.selects.flat()).toEqual(expect.arrayContaining(['noteCreator.id', 'noteCreator.name', 'noteUpdater.id', 'noteUpdater.name']));
    expect(service.depositsRepository.count).toHaveBeenCalledWith({ where: { customerId: 5 } });
  });

  it('findOne: activeAssignees vẫn gộp Sales chính (shape cũ), assignedTo chỉ cột cần thiết', async () => {
    const { service, assignQ } = build(base(), [], 0, [{ assignedTo: { id: 9, name: 'P' } }]);
    const res = await service.findOne(5, 1, 'admin', null);

    expect(res.activeAssignees.map((u: any) => u.id)).toEqual([2, 9]); // sales chính đứng đầu như cũ
    expect(assignQ.calls.joins.join(',')).not.toContain('S:assignment.assignedTo');
  });

  it('findOne: không thấy/ngoài phạm vi -> CustomerNotFoundException, KHÔNG chạy query phụ', async () => {
    const { service } = build(null);
    await expect(service.findOne(5, 1, 'employee', 'own')).rejects.toBeInstanceOf(CustomerNotFoundException);
    expect(service.depositsRepository.count).not.toHaveBeenCalled();
    expect(service.notesRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('findOne: UI Visibility vẫn strip SAU khi gán activeAssignees', async () => {
    const { service } = build(base());
    service.uiVisibilityService.getHiddenElementKeys.mockResolvedValue(new Set(['field:sales_assignment']));
    service.uiVisibilityService.stripHiddenCustomerFields.mockImplementation((c: any) => {
      expect(c.activeAssignees).toBeDefined();
      return c;
    });
    await service.findOne(5, 1, 'admin', null, 3, 4, false);
    expect(service.uiVisibilityService.stripHiddenCustomerFields).toHaveBeenCalledTimes(1);
  });

  it('findForMutation: chỉ sales/marketing/department/utm; KHÔNG deposits/notes/assignees/createdBy; 404 khi ngoài phạm vi', async () => {
    const { service, main } = build(base());
    const c = await service.findForMutation(5, 1, 'admin', null);
    expect(c.id).toBe(5);
    const joined = main.calls.joins.join(',');
    for (const bad of ['deposits', 'notes', 'createdBy', 'updatedBy']) expect(joined).not.toContain(bad);
    expect(main.calls.selects.flat()).toEqual(expect.arrayContaining(['salesUser.id', 'salesUser.name', 'marketingUser.id', 'marketingUser.name']));
    expect(service.depositsRepository.count).not.toHaveBeenCalled();

    const miss = build(null);
    await expect(miss.service.findForMutation(5, 1, 'employee', 'own')).rejects.toBeInstanceOf(CustomerNotFoundException);
  });
});
