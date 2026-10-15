import {
    ConflictException,
    ForbiddenException,
    GoneException,
    Injectable,
    InternalServerErrorException,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Role } from '../../common/enums/role.enum';
import { AuditService } from '../audit/audit.service';
import { BULK_UNDO_AUDIT_ACTION, BULK_UNDO_WINDOW_SECONDS } from './bulk-operations.constants';

export interface BulkOperationRecordInput {
    type: string;
    actorId: number;
    payloadBefore: unknown;
    payloadAfter: unknown;
    affectedCount: number;
}

export interface BulkOperationRecorded {
    operationId: number;
    /** Số giây còn lại để hoàn tác, tính từ lúc ghi (đồng hồ DB quyết định hạn thật). */
    undoExpiresInSeconds: number;
}

export interface BulkUndoResult {
    restored: number;
    skipped: Array<{ id: number; reason: string }>;
}

export interface BulkUndoContext {
    operationId: number;
    actorId: number;
    undoneBy: number;
    before: any;
    after: any;
}

/** Hàm hoàn tác của 1 loại thao tác; chạy TRONG transaction của `undo()` (lỗi ném ra = rollback toàn bộ). */
export type BulkUndoHandler = (em: EntityManager, ctx: BulkUndoContext) => Promise<BulkUndoResult>;

interface BulkOperationRow {
    id: number;
    type: string;
    actor_id: number;
    undone_at: Date | string | null;
    payload_before: unknown;
    payload_after: unknown;
    expired: number | string | boolean;
}

/** MySQL trả cột JSON đã parse, MariaDB trả chuỗi (JSON = LONGTEXT) -> chấp nhận cả hai. */
function parseJson(value: unknown): any {
    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        } catch {
            return null;
        }
    }
    return value ?? null;
}

/**
 * Thao tác hàng loạt có Hoàn tác (PLAN_RETENTION_SECURITY_ROADMAP, Phase 7).
 *
 * - `record()` chạy TRONG transaction của thao tác gốc (cùng `EntityManager`) -> ảnh chụp trước luôn khớp thay đổi.
 * - Hạn hoàn tác (`expires_at = NOW() + 5 phút`) và mọi so sánh hết hạn đều theo đồng hồ DB, không theo đồng hồ app.
 * - Module khác đăng ký logic hoàn tác qua `registerHandler()` (tránh import vòng giữa các module).
 */
@Injectable()
export class BulkOperationsService {
    private readonly logger = new Logger(BulkOperationsService.name);
    private readonly handlers = new Map<string, BulkUndoHandler>();

    constructor(
        private readonly dataSource: DataSource,
        private readonly auditService: AuditService,
    ) { }

    registerHandler(type: string, handler: BulkUndoHandler): void {
        this.handlers.set(type, handler);
    }

    async record(em: EntityManager, input: BulkOperationRecordInput): Promise<BulkOperationRecorded> {
        const res = await em.query(
            `INSERT INTO bulk_operations (type, actor_id, created_at, expires_at, payload_before, payload_after, affected_count) ` +
            `VALUES (?, ?, NOW(), NOW() + INTERVAL ? SECOND, ?, ?, ?)`,
            [
                input.type,
                input.actorId,
                BULK_UNDO_WINDOW_SECONDS,
                JSON.stringify(input.payloadBefore),
                JSON.stringify(input.payloadAfter),
                input.affectedCount,
            ],
        );
        return { operationId: Number(res.insertId), undoExpiresInSeconds: BULK_UNDO_WINDOW_SECONDS };
    }

    /**
     * Dấu thời gian sửa cuối (`UNIX_TIMESTAMP(updated_at)`, dạng CHUỖI để không mất phần thập phân) của các khách.
     * Dùng để phát hiện "bị sửa sau thao tác" lúc hoàn tác, không phụ thuộc timezone.
     */
    async readCustomerStamps(em: EntityManager, customerIds: number[]): Promise<Map<number, string>> {
        const map = new Map<number, string>();
        if (customerIds.length === 0) return map;
        const rows: Array<{ id: number | string; ut: string | number }> = await em.query(
            `SELECT id, UNIX_TIMESTAMP(updated_at) AS ut FROM customers WHERE id IN (${customerIds.map(() => '?').join(',')})`,
            customerIds,
        );
        for (const r of rows) map.set(Number(r.id), String(r.ut));
        return map;
    }

    async undo(operationId: number, user: { id: number; role: string }): Promise<BulkUndoResult> {
        const result = await this.dataSource.transaction(async (em) => {
            // FOR UPDATE: 2 lần bấm Hoàn tác đồng thời chỉ có 1 lần chạy, lần kia thấy `undone_at` và nhận 409.
            const rows: BulkOperationRow[] = await em.query(
                `SELECT id, type, actor_id, undone_at, payload_before, payload_after, (expires_at < NOW()) AS expired ` +
                `FROM bulk_operations WHERE id = ? FOR UPDATE`,
                [operationId],
            );
            const op = rows[0];
            if (!op) throw new NotFoundException('Không tìm thấy thao tác hàng loạt');
            // Chỉ người thực hiện (hoặc Admin) - kiểm tra TRƯỚC khi lộ trạng thái hết hạn/đã hoàn tác.
            if (Number(op.actor_id) !== user.id && user.role !== Role.ADMIN) {
                throw new ForbiddenException('Chỉ người thực hiện hoặc Admin mới được hoàn tác thao tác này');
            }
            if (op.undone_at) throw new ConflictException('Thao tác này đã được hoàn tác trước đó');
            if (Number(op.expired) === 1 || op.expired === true || op.expired === '1') {
                throw new GoneException('Đã quá hạn hoàn tác (5 phút)');
            }
            const handler = this.handlers.get(op.type);
            if (!handler) {
                this.logger.error(`[BulkUndo] Chưa đăng ký handler cho type="${op.type}" (operationId=${operationId})`);
                throw new InternalServerErrorException('Loại thao tác này chưa hỗ trợ hoàn tác');
            }
            const outcome = await handler(em, {
                operationId,
                actorId: Number(op.actor_id),
                undoneBy: user.id,
                before: parseJson(op.payload_before),
                after: parseJson(op.payload_after),
            });
            await em.query(`UPDATE bulk_operations SET undone_at = NOW(), undone_by = ? WHERE id = ?`, [user.id, operationId]);
            return { outcome, type: op.type };
        });

        this.auditService.logActionAsync(user.id, BULK_UNDO_AUDIT_ACTION, 'bulk_operation', operationId, null, {
            type: result.type,
            restored: result.outcome.restored,
            skipped: result.outcome.skipped.length,
        });
        return result.outcome;
    }
}