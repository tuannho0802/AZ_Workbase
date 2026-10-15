import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Thao tác hàng loạt có thể Hoàn tác trong 5 phút (PLAN_RETENTION_SECURITY_ROADMAP, Phase 7).
 * Cột thời gian là DATETIME và được ghi/so sánh bằng NOW() của DB (raw SQL trong BulkOperationsService),
 * nên không phụ thuộc timezone của app. `payload_*` là JSON do từng loại thao tác tự định nghĩa.
 */
@Entity('bulk_operations')
@Index('idx_bulk_operations_actor', ['actorId', 'id'])
@Index('idx_bulk_operations_expires', ['expiresAt'])
export class BulkOperation {
    @PrimaryGeneratedColumn()
    id: number;

    /** Ví dụ `customer_bulk_status`, `customer_bulk_assign`. */
    @Column({ type: 'varchar', length: 50 })
    type: string;

    @Column({ name: 'actor_id', type: 'int' })
    actorId: number;

    @Column({ name: 'created_at', type: 'datetime' })
    createdAt: Date;

    @Column({ name: 'expires_at', type: 'datetime' })
    expiresAt: Date;

    @Column({ name: 'undone_at', type: 'datetime', nullable: true })
    undoneAt: Date | null;

    @Column({ name: 'undone_by', type: 'int', nullable: true })
    undoneBy: number | null;

    @Column({ name: 'payload_before', type: 'json' })
    payloadBefore: unknown;

    @Column({ name: 'payload_after', type: 'json' })
    payloadAfter: unknown;

    @Column({ name: 'affected_count', type: 'int', default: 0 })
    affectedCount: number;
}