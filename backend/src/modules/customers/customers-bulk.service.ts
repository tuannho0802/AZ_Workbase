import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Customer } from '../../database/entities/customer.entity';
import { CustomerStatus } from '../../database/entities/customer-status.entity';
import { AssignmentStatus, CustomerAssignment } from '../../database/entities/customer-assignment.entity';
import { AuditService } from '../audit/audit.service';
import { todayVnStr } from '../../common/utils/date-vn.util';
import { CustomerAccessHelper } from './helpers/customer-access.helper';
import { BulkOperationsService, BulkUndoContext, BulkUndoResult } from '../bulk-operations/bulk-operations.service';
import { BULK_TYPE_CUSTOMER_ASSIGN, BULK_TYPE_CUSTOMER_STATUS } from '../bulk-operations/bulk-operations.constants';

/** Ảnh chụp TRƯỚC của 1 khách khi đổi trạng thái hàng loạt. */
export interface BulkStatusBeforeItem {
    id: number;
    status: string;
    closedDate: string | null;
    updatedById: number | null;
}

/** Ảnh chụp TRƯỚC của 1 khách khi chia data hàng loạt. `touched` = lần chia này đã ghi vào hàng `customers` (đặt Sales chính). */
export interface BulkAssignBeforeItem {
    id: number;
    salesUserId: number | null;
    assignedDate: string | null;
    updatedById: number | null;
    touched: boolean;
}

export interface BulkStatusResult {
    succeeded: number[];
    /** Khách đã đúng trạng thái đích - không ghi gì. */
    unchanged: number[];
    failed: Array<{ id: number; reason: string }>;
    operationId: number | null;
    undoExpiresInSeconds: number | null;
}

/** DATE của MySQL: driver trả chuỗi 'YYYY-MM-DD'; nếu là Date thì lấy phần ngày UTC. */
export function toDateOnly(v: unknown): string | null {
    if (v === null || v === undefined || v === '') return null;
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return String(v).slice(0, 10);
}

/**
 * Đổi trạng thái hàng loạt + logic HOÀN TÁC cho `customer_bulk_status` / `customer_bulk_assign`
 * (PLAN_RETENTION_SECURITY_ROADMAP, Phase 7). Tách khỏi `CustomersService` (đã > 4000 dòng).
 *
 * Mọi ghi dùng QueryBuilder `UPDATE` theo cột (đúng cách `bulkAssign` đang dùng) nên không dính lỗi
 * "relation đã load đè cột FK" của `.save()` (SKILL_NESTJS_BACKEND §13).
 */
@Injectable()
export class CustomersBulkService implements OnModuleInit {
    private readonly logger = new Logger(CustomersBulkService.name);

    constructor(
        @InjectRepository(Customer) private readonly customersRepository: Repository<Customer>,
        @InjectRepository(CustomerStatus) private readonly customerStatusRepository: Repository<CustomerStatus>,
        private readonly auditService: AuditService,
        private readonly bulkOperations: BulkOperationsService,
    ) { }

    onModuleInit(): void {
        this.bulkOperations.registerHandler(BULK_TYPE_CUSTOMER_STATUS, (em, ctx) => this.undoStatus(em, ctx));
        this.bulkOperations.registerHandler(BULK_TYPE_CUSTOMER_ASSIGN, (em, ctx) => this.undoAssign(em, ctx));
    }

    // ───────────────────────── Đổi trạng thái hàng loạt ─────────────────────────

    async bulkUpdateStatus(
        customerIds: number[],
        status: string,
        user: { id: number; role: string },
        scope?: string | null,
    ): Promise<BulkStatusResult> {
        const exists = await this.customerStatusRepository.findOne({ where: { code: status } });
        if (!exists) {
            throw new BadRequestException(
                `Trạng thái "${status}" không tồn tại. Vui lòng kiểm tra lại ở Quản lý status Khách.`,
            );
        }

        const ids = Array.from(new Set(customerIds));
        // 1 query lấy mọi khách trong phạm vi XEM/SỬA của caller (cùng bộ lọc với update() đơn lẻ).
        const qb = this.customersRepository
            .createQueryBuilder('customer')
            .select(['customer.id', 'customer.status', 'customer.closedDate', 'customer.updatedById'])
            .where('customer.id IN (:...ids)', { ids })
            .andWhere('customer.deletedAt IS NULL');
        CustomerAccessHelper.applyViewFilter(qb, user.id, user.role, scope);
        const visible = await qb.getMany();
        const visibleMap = new Map(visible.map((c) => [c.id, c]));

        const result: BulkStatusResult = {
            succeeded: [],
            unchanged: [],
            failed: [],
            operationId: null,
            undoExpiresInSeconds: null,
        };
        const toChange: Customer[] = [];
        for (const id of ids) {
            const c = visibleMap.get(id);
            if (!c) {
                result.failed.push({ id, reason: 'Không tìm thấy khách hàng (có thể đã vào Thùng rác hoặc ngoài phạm vi của bạn)' });
            } else if (c.status === status) {
                result.unchanged.push(id);
            } else {
                toChange.push(c);
            }
        }
        if (toChange.length === 0) return result;

        const today = todayVnStr();
        const changedIds = toChange.map((c) => c.id);
        const before: BulkStatusBeforeItem[] = toChange.map((c) => ({
            id: c.id,
            status: c.status,
            closedDate: toDateOnly(c.closedDate),
            updatedById: c.updatedById ?? null,
        }));

        // Giống update(): chuyển sang 'closed' thì tự đặt ngày chốt NẾU chưa có.
        const needClosedDate = status === 'closed' ? toChange.filter((c) => !c.closedDate).map((c) => c.id) : [];
        const keepClosedDate = status === 'closed' ? toChange.filter((c) => !!c.closedDate).map((c) => c.id) : changedIds;

        const recorded = await this.customersRepository.manager.transaction(async (em) => {
            if (needClosedDate.length > 0) {
                await em
                    .createQueryBuilder()
                    .update(Customer)
                    .set({ status, closedDate: today as unknown as Date, updatedById: user.id })
                    .whereInIds(needClosedDate)
                    .execute();
            }
            if (keepClosedDate.length > 0) {
                await em.createQueryBuilder().update(Customer).set({ status, updatedById: user.id }).whereInIds(keepClosedDate).execute();
            }
            const stamps = await this.bulkOperations.readCustomerStamps(em, changedIds);
            return this.bulkOperations.record(em, {
                type: BULK_TYPE_CUSTOMER_STATUS,
                actorId: user.id,
                payloadBefore: { items: before },
                payloadAfter: { status, stamps: changedIds.map((id) => ({ id, ut: stamps.get(id) ?? null })) },
                affectedCount: changedIds.length,
            });
        });

        // Audit từng khách (fire-and-forget như bulkAssign). Diff chỉ gồm field thật sự đổi.
        for (const c of toChange) {
            const closedChanged = status === 'closed' && !c.closedDate;
            this.auditService.logActionAsync(
                user.id,
                'UPDATE_CUSTOMER',
                'customer',
                c.id,
                { status: c.status, ...(closedChanged ? { closedDate: null } : {}) },
                { status, ...(closedChanged ? { closedDate: today } : {}) },
            );
        }

        result.succeeded = changedIds;
        result.operationId = recorded.operationId;
        result.undoExpiresInSeconds = recorded.undoExpiresInSeconds;
        return result;
    }

    // ───────────────────────── Hoàn tác ─────────────────────────

    /** Đọc trạng thái HIỆN TẠI (kể cả đã xoá mềm) của các khách để phát hiện xung đột. */
    private async readCurrent(
        em: EntityManager,
        ids: number[],
    ): Promise<Map<number, { deleted: boolean; ut: string }>> {
        const map = new Map<number, { deleted: boolean; ut: string }>();
        if (ids.length === 0) return map;
        const rows: Array<{ id: number | string; deleted_at: unknown; ut: string | number }> = await em.query(
            `SELECT id, deleted_at, UNIX_TIMESTAMP(updated_at) AS ut FROM customers WHERE id IN (${ids.map(() => '?').join(',')})`,
            ids,
        );
        for (const r of rows) map.set(Number(r.id), { deleted: r.deleted_at !== null && r.deleted_at !== undefined, ut: String(r.ut) });
        return map;
    }

    /** Lý do bỏ qua 1 khách khi hoàn tác (null = hoàn tác được). `checkStamp=false`: không so `updated_at` (khách không bị lần chia ghi vào). */
    private conflictReason(
        cur: { deleted: boolean; ut: string } | undefined,
        expectedUt: string | null | undefined,
        checkStamp: boolean,
    ): string | null {
        if (!cur) return 'Khách hàng không còn tồn tại';
        if (cur.deleted) return 'Khách hàng đã vào Thùng rác';
        if (checkStamp && (expectedUt ?? null) !== cur.ut) return 'Khách hàng đã được sửa sau thao tác nên không hoàn tác để tránh ghi đè';
        return null;
    }

    private async undoStatus(em: EntityManager, ctx: BulkUndoContext): Promise<BulkUndoResult> {
        const items: BulkStatusBeforeItem[] = ctx.before?.items ?? [];
        const stampMap = new Map<number, string | null>((ctx.after?.stamps ?? []).map((s: { id: number; ut: string | null }) => [s.id, s.ut]));
        const current = await this.readCurrent(em, items.map((i) => i.id));

        const skipped: BulkUndoResult['skipped'] = [];
        // Gom theo (status, closedDate, updatedById) cũ để mỗi nhóm 1 câu UPDATE.
        const groups = new Map<string, { item: BulkStatusBeforeItem; ids: number[] }>();
        for (const item of items) {
            const reason = this.conflictReason(current.get(item.id), stampMap.get(item.id), true);
            if (reason) {
                skipped.push({ id: item.id, reason });
                continue;
            }
            const key = `${item.status}|${item.closedDate ?? ''}|${item.updatedById ?? ''}`;
            const g = groups.get(key);
            if (g) g.ids.push(item.id);
            else groups.set(key, { item, ids: [item.id] });
        }

        let restored = 0;
        for (const { item, ids } of groups.values()) {
            await em
                .createQueryBuilder()
                .update(Customer)
                .set({
                    status: item.status,
                    closedDate: item.closedDate as unknown as Date,
                    updatedById: item.updatedById as unknown as number,
                })
                .whereInIds(ids)
                .execute();
            restored += ids.length;
        }
        return { restored, skipped };
    }

    private async undoAssign(em: EntityManager, ctx: BulkUndoContext): Promise<BulkUndoResult> {
        const items: BulkAssignBeforeItem[] = ctx.before?.items ?? [];
        const assignments: Array<{ id: number; customerId: number }> = ctx.after?.assignments ?? [];
        const stampMap = new Map<number, string | null>((ctx.after?.stamps ?? []).map((s: { id: number; ut: string | null }) => [s.id, s.ut]));
        const current = await this.readCurrent(em, items.map((i) => i.id));

        const skipped: BulkUndoResult['skipped'] = [];
        const restorable: BulkAssignBeforeItem[] = [];
        for (const item of items) {
            // Chỉ khách bị lần chia GHI vào hàng `customers` mới cần so `updated_at`; khách chỉ được thêm Sales chia
            // thì luôn hoàn tác được (trừ khi đã xoá/không còn).
            const reason = this.conflictReason(current.get(item.id), stampMap.get(item.id), item.touched);
            if (reason) skipped.push({ id: item.id, reason });
            else restorable.push(item);
        }
        const okIds = new Set(restorable.map((i) => i.id));

        // 1) Trả lại Sales chính / ngày gán / người sửa cho các khách đã bị đặt Sales chính.
        for (const item of restorable.filter((i) => i.touched)) {
            await em
                .createQueryBuilder()
                .update(Customer)
                .set({
                    salesUserId: item.salesUserId as unknown as number,
                    assignedDate: item.assignedDate as unknown as Date,
                    updatedById: item.updatedById as unknown as number,
                })
                .whereInIds([item.id])
                .execute();
        }

        // 2) Thu hồi các lượt chia lần này đã tạo (chỉ dòng còn ACTIVE; dòng đã bị đổi/thu hồi thủ công thì để nguyên).
        const assignmentIds = assignments.filter((a) => okIds.has(a.customerId)).map((a) => a.id);
        if (assignmentIds.length > 0) {
            await em
                .createQueryBuilder()
                .update(CustomerAssignment)
                .set({
                    status: AssignmentStatus.RECLAIMED,
                    reclaimedAt: () => 'NOW()',
                    reclaimedById: ctx.undoneBy,
                })
                .where('id IN (:...ids)', { ids: assignmentIds })
                .andWhere('status = :active', { active: AssignmentStatus.ACTIVE })
                .execute();
        }
        return { restored: restorable.length, skipped };
    }
}