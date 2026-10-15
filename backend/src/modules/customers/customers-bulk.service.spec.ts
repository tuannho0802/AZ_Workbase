import { BadRequestException } from '@nestjs/common';
import { Customer } from '../../database/entities/customer.entity';
import { AssignmentStatus, CustomerAssignment } from '../../database/entities/customer-assignment.entity';
import { CustomersBulkService, toDateOnly } from './customers-bulk.service';
import { BULK_TYPE_CUSTOMER_ASSIGN, BULK_TYPE_CUSTOMER_STATUS } from '../bulk-operations/bulk-operations.constants';

describe('CustomersBulkService (P7)', () => {
    // QueryBuilder ghi (UPDATE) ghi lại mọi lệnh set/where để assert.
    const updates: Array<{ entity: unknown; set: Record<string, unknown>; ids?: number[]; where: unknown[] }> = [];
    const makeUpdateQb = () => {
        const rec: (typeof updates)[number] = { entity: null, set: {}, where: [] };
        const qb: Record<string, jest.Mock> = {};
        qb.update = jest.fn((e: unknown) => ((rec.entity = e), qb));
        qb.set = jest.fn((v: Record<string, unknown>) => ((rec.set = v), qb));
        qb.whereInIds = jest.fn((ids: number[]) => ((rec.ids = ids), qb));
        qb.where = jest.fn((...a: unknown[]) => (rec.where.push(a), qb));
        qb.andWhere = jest.fn((...a: unknown[]) => (rec.where.push(a), qb));
        qb.execute = jest.fn(async () => (updates.push(rec), {}));
        return qb;
    };
    const em = { createQueryBuilder: jest.fn(() => makeUpdateQb()), query: jest.fn() };

    const visibleQb = { select: jest.fn(), where: jest.fn(), andWhere: jest.fn(), getMany: jest.fn() };
    const customersRepo = {
        createQueryBuilder: jest.fn(() => visibleQb),
        manager: { transaction: jest.fn(async (cb: (e: unknown) => unknown) => cb(em)) },
    };
    const statusRepo = { findOne: jest.fn() };
    const audit = { logActionAsync: jest.fn() };
    const bulkOps = {
        record: jest.fn(),
        readCustomerStamps: jest.fn(),
        registerHandler: jest.fn(),
    };
    let service: CustomersBulkService;

    beforeEach(() => {
        jest.clearAllMocks();
        updates.length = 0;
        em.query.mockReset();
        visibleQb.select.mockReturnValue(visibleQb);
        visibleQb.where.mockReturnValue(visibleQb);
        visibleQb.andWhere.mockReturnValue(visibleQb);
        statusRepo.findOne.mockResolvedValue({ id: 1, code: 'closed' });
        bulkOps.record.mockResolvedValue({ operationId: 77, undoExpiresInSeconds: 300 });
        bulkOps.readCustomerStamps.mockResolvedValue(new Map([[1, '111'], [2, '222']]));
        service = new CustomersBulkService(customersRepo as never, statusRepo as never, audit as never, bulkOps as never);
    });

    it('onModuleInit đăng ký đúng 2 handler hoàn tác', () => {
        service.onModuleInit();
        expect(bulkOps.registerHandler).toHaveBeenCalledWith(BULK_TYPE_CUSTOMER_STATUS, expect.any(Function));
        expect(bulkOps.registerHandler).toHaveBeenCalledWith(BULK_TYPE_CUSTOMER_ASSIGN, expect.any(Function));
    });

    describe('toDateOnly', () => {
        it('chuẩn hoá về YYYY-MM-DD', () => {
            expect(toDateOnly(null)).toBeNull();
            expect(toDateOnly('')).toBeNull();
            expect(toDateOnly('2026-10-15')).toBe('2026-10-15');
            expect(toDateOnly('2026-10-15T00:00:00.000Z')).toBe('2026-10-15');
            expect(toDateOnly(new Date('2026-10-15T00:00:00.000Z'))).toBe('2026-10-15');
        });
    });

    describe('bulkUpdateStatus', () => {
        const user = { id: 9, role: 'employee' };

        it('400 khi trạng thái không tồn tại - không đụng DB', async () => {
            statusRepo.findOne.mockResolvedValue(null);
            await expect(service.bulkUpdateStatus([1], 'zzz', user, 'own')).rejects.toBeInstanceOf(BadRequestException);
            expect(customersRepo.createQueryBuilder).not.toHaveBeenCalled();
        });

        it('khách ngoài phạm vi/đã vào thùng rác -> failed; đã đúng trạng thái -> unchanged; không ghi gì nếu không có gì đổi', async () => {
            visibleQb.getMany.mockResolvedValue([{ id: 2, status: 'closed', closedDate: '2026-10-01', updatedById: 1 }]);
            const res = await service.bulkUpdateStatus([1, 2], 'closed', user, 'own');
            expect(res.failed).toHaveLength(1);
            expect(res.failed[0].id).toBe(1);
            expect(res.unchanged).toEqual([2]);
            expect(res.succeeded).toEqual([]);
            expect(res.operationId).toBeNull();
            expect(customersRepo.manager.transaction).not.toHaveBeenCalled();
        });

        it('đổi sang closed: đặt ngày chốt cho khách CHƯA có, giữ ngày chốt cũ cho khách đã có; ghi ảnh chụp trước + audit', async () => {
            visibleQb.getMany.mockResolvedValue([
                { id: 1, status: 'pending', closedDate: null, updatedById: 4 },
                { id: 2, status: 'lost', closedDate: '2026-09-01', updatedById: null },
            ]);
            const res = await service.bulkUpdateStatus([1, 2], 'closed', user, 'all');

            expect(res.succeeded).toEqual([1, 2]);
            expect(res.operationId).toBe(77);
            expect(res.undoExpiresInSeconds).toBe(300);

            const withDate = updates.find((u) => u.ids?.join() === '1')!;
            const keepDate = updates.find((u) => u.ids?.join() === '2')!;
            expect(withDate.set).toMatchObject({ status: 'closed', updatedById: 9 });
            expect(withDate.set.closedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            expect(keepDate.set).toEqual({ status: 'closed', updatedById: 9 });

            const rec = bulkOps.record.mock.calls[0][1];
            expect(rec.type).toBe(BULK_TYPE_CUSTOMER_STATUS);
            expect(rec.actorId).toBe(9);
            expect(rec.affectedCount).toBe(2);
            expect(rec.payloadBefore.items).toEqual([
                { id: 1, status: 'pending', closedDate: null, updatedById: 4 },
                { id: 2, status: 'lost', closedDate: '2026-09-01', updatedById: null },
            ]);
            expect(rec.payloadAfter).toEqual({
                status: 'closed',
                stamps: [{ id: 1, ut: '111' }, { id: 2, ut: '222' }],
            });
            expect(audit.logActionAsync).toHaveBeenCalledTimes(2);
            expect(audit.logActionAsync).toHaveBeenCalledWith(9, 'UPDATE_CUSTOMER', 'customer', 2, { status: 'lost' }, { status: 'closed' });
        });

        it('trạng thái đích khác closed: KHÔNG đụng closedDate (1 câu UPDATE)', async () => {
            statusRepo.findOne.mockResolvedValue({ id: 2, code: 'potential' });
            visibleQb.getMany.mockResolvedValue([{ id: 1, status: 'pending', closedDate: null, updatedById: null }]);
            await service.bulkUpdateStatus([1], 'potential', user, 'all');
            expect(updates).toHaveLength(1);
            expect(updates[0].set).toEqual({ status: 'potential', updatedById: 9 });
        });

        it('loại trùng ID đầu vào', async () => {
            visibleQb.getMany.mockResolvedValue([{ id: 1, status: 'pending', closedDate: null, updatedById: null }]);
            const res = await service.bulkUpdateStatus([1, 1, 1], 'potential', user, 'all');
            expect(res.succeeded).toEqual([1]);
        });
    });

    describe('hoàn tác trạng thái', () => {
        const getHandler = (type: string) => {
            service.onModuleInit();
            return bulkOps.registerHandler.mock.calls.find((c) => c[0] === type)![1] as (e: unknown, c: unknown) => Promise<any>;
        };

        it('khôi phục status/closedDate/updatedById; bỏ qua khách bị sửa sau (updated_at đổi), đã vào thùng rác hoặc biến mất', async () => {
            em.query.mockResolvedValueOnce([
                { id: 1, deleted_at: null, ut: '111' }, // khớp -> hoàn tác
                { id: 2, deleted_at: null, ut: '999' }, // bị sửa sau
                { id: 3, deleted_at: new Date(), ut: '333' }, // vào thùng rác
                // id 4: biến mất
            ]);
            const res = await getHandler(BULK_TYPE_CUSTOMER_STATUS)(em, {
                undoneBy: 9,
                before: {
                    items: [
                        { id: 1, status: 'pending', closedDate: null, updatedById: 4 },
                        { id: 2, status: 'lost', closedDate: null, updatedById: 4 },
                        { id: 3, status: 'lost', closedDate: null, updatedById: 4 },
                        { id: 4, status: 'lost', closedDate: null, updatedById: 4 },
                    ],
                },
                after: { status: 'closed', stamps: [{ id: 1, ut: '111' }, { id: 2, ut: '222' }, { id: 3, ut: '333' }, { id: 4, ut: '444' }] },
            });

            expect(res.restored).toBe(1);
            expect(res.skipped.map((s: { id: number }) => s.id).sort()).toEqual([2, 3, 4]);
            expect(updates).toHaveLength(1);
            expect(updates[0].ids).toEqual([1]);
            expect(updates[0].set).toEqual({ status: 'pending', closedDate: null, updatedById: 4 });
        });

        it('gom khách có cùng trạng thái cũ vào 1 câu UPDATE', async () => {
            em.query.mockResolvedValueOnce([
                { id: 1, deleted_at: null, ut: '1' },
                { id: 2, deleted_at: null, ut: '2' },
                { id: 3, deleted_at: null, ut: '3' },
            ]);
            const res = await getHandler(BULK_TYPE_CUSTOMER_STATUS)(em, {
                undoneBy: 9,
                before: {
                    items: [
                        { id: 1, status: 'pending', closedDate: null, updatedById: 4 },
                        { id: 2, status: 'pending', closedDate: null, updatedById: 4 },
                        { id: 3, status: 'lost', closedDate: '2026-01-01', updatedById: 4 },
                    ],
                },
                after: { stamps: [{ id: 1, ut: '1' }, { id: 2, ut: '2' }, { id: 3, ut: '3' }] },
            });
            expect(res.restored).toBe(3);
            expect(updates).toHaveLength(2);
            expect(updates.find((u) => u.ids?.length === 2)?.ids).toEqual([1, 2]);
        });
    });

    describe('hoàn tác chia data', () => {
        const handler = () => {
            service.onModuleInit();
            return bulkOps.registerHandler.mock.calls.find((c) => c[0] === BULK_TYPE_CUSTOMER_ASSIGN)![1] as (e: unknown, c: unknown) => Promise<any>;
        };

        it('trả lại Sales chính cho khách bị đặt; thu hồi các lượt chia đã tạo (chỉ ACTIVE)', async () => {
            em.query.mockResolvedValueOnce([
                { id: 100, deleted_at: null, ut: '10' },
                { id: 101, deleted_at: null, ut: '55' }, // không bị ghi vào hàng customers -> không so updated_at
            ]);
            const res = await handler()(em, {
                undoneBy: 9,
                before: {
                    items: [
                        { id: 100, salesUserId: null, assignedDate: null, updatedById: 3, touched: true },
                        { id: 101, salesUserId: 8, assignedDate: '2026-05-01', updatedById: 3, touched: false },
                    ],
                },
                after: {
                    assignments: [{ id: 900, customerId: 100 }, { id: 901, customerId: 101 }],
                    stamps: [{ id: 100, ut: '10' }],
                },
            });

            expect(res).toEqual({ restored: 2, skipped: [] });
            const custUpdate = updates.find((u) => u.entity === Customer)!;
            expect(custUpdate.ids).toEqual([100]);
            expect(custUpdate.set).toEqual({ salesUserId: null, assignedDate: null, updatedById: 3 });
            const asgUpdate = updates.find((u) => u.entity === CustomerAssignment)!;
            expect(asgUpdate.set).toMatchObject({ status: AssignmentStatus.RECLAIMED, reclaimedById: 9 });
            expect(asgUpdate.where).toContainEqual(['id IN (:...ids)', { ids: [900, 901] }]);
            expect(asgUpdate.where).toContainEqual(['status = :active', { active: AssignmentStatus.ACTIVE }]);
        });

        it('khách bị đặt Sales chính nhưng đã bị sửa sau -> bỏ qua CẢ khách và các lượt chia của khách đó', async () => {
            em.query.mockResolvedValueOnce([
                { id: 100, deleted_at: null, ut: '99999' }, // đã đổi
                { id: 101, deleted_at: null, ut: '1' },
            ]);
            const res = await handler()(em, {
                undoneBy: 9,
                before: {
                    items: [
                        { id: 100, salesUserId: null, assignedDate: null, updatedById: 3, touched: true },
                        { id: 101, salesUserId: 8, assignedDate: null, updatedById: 3, touched: false },
                    ],
                },
                after: {
                    assignments: [{ id: 900, customerId: 100 }, { id: 901, customerId: 101 }],
                    stamps: [{ id: 100, ut: '10' }],
                },
            });

            expect(res.restored).toBe(1);
            expect(res.skipped).toHaveLength(1);
            expect(res.skipped[0].id).toBe(100);
            expect(updates.find((u) => u.entity === Customer)).toBeUndefined();
            const asgUpdate = updates.find((u) => u.entity === CustomerAssignment)!;
            expect(asgUpdate.where).toContainEqual(['id IN (:...ids)', { ids: [901] }]);
        });

        it('khách đã vào thùng rác -> bỏ qua, không thu hồi gì nếu không còn khách nào hoàn tác được', async () => {
            em.query.mockResolvedValueOnce([{ id: 101, deleted_at: new Date(), ut: '1' }]);
            const res = await handler()(em, {
                undoneBy: 9,
                before: { items: [{ id: 101, salesUserId: 8, assignedDate: null, updatedById: 3, touched: false }] },
                after: { assignments: [{ id: 901, customerId: 101 }], stamps: [] },
            });
            expect(res.restored).toBe(0);
            expect(res.skipped).toHaveLength(1);
            expect(updates).toHaveLength(0);
        });
    });
});