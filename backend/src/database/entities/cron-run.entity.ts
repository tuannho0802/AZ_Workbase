import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Nhật ký các lần chạy job tự động (hiện chỉ `retention`). Cột thời gian là DATETIME và được ghi
 * bằng NOW() của DB (raw SQL trong RetentionService) nên không phụ thuộc timezone của app.
 * Xem PLAN_RETENTION_SECURITY_ROADMAP.md Phase 1.
 */
@Entity('cron_runs')
@Index('idx_cron_runs_job_target', ['job', 'target', 'id'])
export class CronRun {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 50 })
  job: string;

  /** 'all' = chạy theo lịch/đủ mọi đối tượng (mốc tính chu kỳ); khác = chạy tay 1 đối tượng. */
  @Column({ type: 'varchar', length: 50 })
  target: string;

  @Column({ name: 'started_at', type: 'datetime' })
  startedAt: Date;

  @Column({ name: 'finished_at', type: 'datetime', nullable: true })
  finishedAt: Date | null;

  /** running | success | partial | failed */
  @Column({ type: 'varchar', length: 20 })
  status: string;

  @Column({ type: 'int', default: 0 })
  affected: number;

  @Column({ type: 'text', nullable: true })
  message: string | null;
}
