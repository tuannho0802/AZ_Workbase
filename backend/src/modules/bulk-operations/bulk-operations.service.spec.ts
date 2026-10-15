import { ConflictException, ForbiddenException, GoneException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { Role } from '../../common/enums/role.enum';
import { BulkOperationsService } from './bulk-operations.service';
import { BULK_UNDO_WINDOW_SECONDS } from './bulk-operations.constants';

describe('BulkOperationsService', () => {
    const em = { query: jest.fn() };
    const dataSource = { transaction: jest.fn(async (cb: (e: unknown) => unknown) => cb(em)) };
    const audit = { logActionAsync: jest.fn() };
    let service: BulkOperationsService;

    const opRow = (over: Record<string, unknown> = {}) => ({
        id: 5,
        type: 'customer_bulk_status',
        actor_id: 10,
        undone_at: null,
        payload_before: { items: [1] },
        payload_after: { x: 1 },
        expired: 0,
        ...over,
    });

    beforeEach(() => {
        jest.clearAllMocks();
        em.query.mockReset();
        service = new BulkOperationsService(dataSource as never, audit as never);
    });

    describe('record', () => {
        it('INSERT với hạn 5 phút theo đồng hồ DB và trả operationId', async () => {
            em.query.mockResolvedValueOnce({ insertId: 42 });
            const res = await service.record(em as never, {
                type: 'customer_bulk_status',
                actorId: 3,
                payloadBefore: { a: 1 },
                payloadAfter: { b: 2 },
                affectedCount: 7,
            });
            expect(res).toEqual({ operationId: 42, undoExpiresInSeconds: BULK_UNDO_WINDOW_SECONDS });
            const [sql, params] = em.query.mock.calls[0];
            expect(sql).toContain('NOW() + INTERVAL ? SECOND');
            expect(params).toEqual(['customer_bulk_status', 3, 300, '{"a":1}', '{"b":2}', 7]);
        });
    });

    describe('readCustomerStamps', () => {
        it('danh sách rỗng -> không query', async () => {
            const map = await service.readCustomerStamps(em as never, []);
            expect(map.size).toBe(0);
            expect(em.query).not.toHaveBeenCalled();
        });

        it('giữ dấu thời gian dạng CHUỖI (không mất phần thập phân)', async () => {
            em.query.mockResolvedValueOnce([{ id: '1', ut: '1786350000.123456' }]);
            const map = await service.readCustomerStamps(em as never, [1]);
            expect(map.get(1)).toBe('1786350000.123456');
        });
    });

    describe('undo', () => {
        const user = { id: 10, role: Role.EMPLOYEE };

        it('404 khi không có thao tác', async () => {
            em.query.mockResolvedValueOnce([]);
            await expect(service.undo(5, user)).rejects.toBeInstanceOf(NotFoundException);
        });

        it('403 khi người khác (không phải Admin) hoàn tác', async () => {
            em.query.mockResolvedValueOnce([opRow()]);
            await expect(service.undo(5, { id: 99, role: Role.MANAGER })).rejects.toBeInstanceOf(ForbiddenException);
        });

        it('403 được kiểm TRƯỚC 410/409 (không lộ trạng thái cho người lạ)', async () => {
            em.query.mockResolvedValueOnce([opRow({ expired: 1, undone_at: new Date() })]);
            await expect(service.undo(5, { id: 99, role: Role.EMPLOYEE })).rejects.toBeInstanceOf(ForbiddenException);
        });

        it('409 khi đã hoàn tác', async () => {
            em.query.mockResolvedValueOnce([opRow({ undone_at: new Date() })]);
            await expect(service.undo(5, user)).rejects.toBeInstanceOf(ConflictException);
        });

        it('410 khi quá 5 phút', async () => {
            em.query.mockResolvedValueOnce([opRow({ expired: 1 })]);
            await expect(service.undo(5, user)).rejects.toBeInstanceOf(GoneException);
        });

        it('500 (rõ ràng) khi type chưa có handler, không đánh dấu đã hoàn tác', async () => {
            em.query.mockResolvedValueOnce([opRow({ type: 'khong_co' })]);
            await expect(service.undo(5, user)).rejects.toBeInstanceOf(InternalServerErrorException);
            expect(em.query).toHaveBeenCalledTimes(1);
        });

        it('người thực hiện: chạy handler, đánh dấu undone_at/undone_by, ghi audit BULK_UNDO', async () => {
            const handler = jest.fn().mockResolvedValue({ restored: 3, skipped: [{ id: 9, reason: 'x' }] });
            service.registerHandler('customer_bulk_status', handler);
            em.query.mockResolvedValueOnce([opRow({ payload_before: '{"items":[1]}' })]).mockResolvedValueOnce({});

            const res = await service.undo(5, user);

            expect(res).toEqual({ restored: 3, skipped: [{ id: 9, reason: 'x' }] });
            // MariaDB trả JSON dạng chuỗi -> handler vẫn nhận object
            expect(handler).toHaveBeenCalledWith(em, expect.objectContaining({ operationId: 5, actorId: 10, undoneBy: 10, before: { items: [1] } }));
            const [sql, params] = em.query.mock.calls[1];
            expect(sql).toContain('UPDATE bulk_operations SET undone_at = NOW()');
            expect(params).toEqual([10, 5]);
            expect(audit.logActionAsync).toHaveBeenCalledWith(10, 'BULK_UNDO', 'bulk_operation', 5, null, {
                type: 'customer_bulk_status',
                restored: 3,
                skipped: 1,
            });
        });

        it('Admin được hoàn tác thao tác của người khác', async () => {
            service.registerHandler('customer_bulk_status', jest.fn().mockResolvedValue({ restored: 1, skipped: [] }));
            em.query.mockResolvedValueOnce([opRow()]).mockResolvedValueOnce({});
            await expect(service.undo(5, { id: 1, role: Role.ADMIN })).resolves.toEqual({ restored: 1, skipped: [] });
        });

        it('handler ném lỗi -> KHÔNG đánh dấu undone, KHÔNG ghi audit (transaction rollback)', async () => {
            service.registerHandler('customer_bulk_status', jest.fn().mockRejectedValue(new Error('boom')));
            em.query.mockResolvedValueOnce([opRow()]);
            await expect(service.undo(5, user)).rejects.toThrow('boom');
            expect(em.query).toHaveBeenCalledTimes(1);
            expect(audit.logActionAsync).not.toHaveBeenCalled();
        });
    });
});