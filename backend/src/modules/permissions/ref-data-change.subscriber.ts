import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type {
    EntitySubscriberInterface,
    InsertEvent,
    QueryRunner,
    RecoverEvent,
    RemoveEvent,
    SoftRemoveEvent,
    TransactionCommitEvent,
    TransactionRollbackEvent,
    UpdateEvent,
} from 'typeorm';
import { PermissionsVersionService, RefDataDomain } from './permissions-version.service';

/**
 * Bảng -> danh mục (domain) mà FE cache lâu và chỉ làm mới khi `refSig` đổi (xem PLAN_CPU_OPTIMIZATION_ROUND2 - 9D).
 * Gồm cả bảng mà payload của danh mục có JOIN/đếm từ đó:
 *  - `GET /departments` trả kèm `employees` (users đang hoạt động) và `managers` (department_managers + users);
 *  - `GET /positions` trả kèm quan hệ `department`;
 *  - `GET /roles` trả kèm ma trận `role_permissions` toàn cục.
 */
export const REF_DATA_TABLE_DOMAINS: Readonly<Record<string, readonly RefDataDomain[]>> = {
    departments: ['departments', 'positions', 'users'], // users/all JOIN department
    department_managers: ['departments'],
    positions: ['positions', 'users'], // users/all JOIN position
    roles: ['roles'],
    role_permissions: ['roles'],
    customer_statuses: ['customer_statuses'],
    periodic_task_statuses: ['periodic_task_statuses'],
    leave_types: ['leave_types'],
    media_sources: ['media_sources'],
};

/** Với `users`: chỉ các cột nằm trong payload `GET /departments` mới đáng bump (đăng nhập/refresh token KHÔNG bump). */
export const USER_COLUMNS_AFFECTING_DEPARTMENTS: ReadonlySet<string> = new Set([
    'name',
    'role',
    'departmentId',
    'department',
    'isActive',
    // Xoá mềm user = `update(id, { deletedAt })` (users.service#softDeleteUser) -> user rời danh sách `employees`/`managers`.
    'deletedAt',
]);

/**
 * [AGENT] NEW: với `users`: bump domain `users` (payload GET /users/all = cả entity + department + position + avatar).
 * Chỉ BỎ QUA khi cột đổi toàn là cột kỹ thuật (đăng nhập/refresh token/cập nhật mốc) - tránh bump mỗi lần login.
 */
export const USER_COLUMNS_IGNORED_FOR_USERS_DOMAIN: ReadonlySet<string> = new Set([
    'hashedRefreshToken',
    'lastLoginAt',
    'updatedAt',
    'password',
]);

/**
 * Bắt MỌI lần ghi vào các bảng trên (save / insert / update / delete qua QueryBuilder đều phát sự kiện) rồi tăng
 * `refdata_version:<domain>` - nên service mới/sửa sau này KHÔNG thể "quên bump". Không bắt được: SQL thô
 * (`.query()`), migration, seed, sửa tay trong DB -> các trường hợp đó dựa vào lưới `staleTime` ở FE (2 giờ).
 *
 * Đúng thời điểm: trong transaction thì GOM lại và chỉ bump SAU KHI COMMIT (bump sớm hơn sẽ cho máy khác refetch
 * ra dữ liệu cũ rồi cache 2 giờ); rollback thì bỏ. Ngoài transaction: gom các sự kiện cùng 1 tick thành 1 lần bump.
 */
@Injectable()
export class RefDataChangeSubscriber implements EntitySubscriberInterface {
    private readonly pendingByRunner = new WeakMap<QueryRunner, Set<RefDataDomain>>();
    private immediate = new Set<RefDataDomain>();
    private flushScheduled = false;

    constructor(
        @InjectDataSource() dataSource: DataSource,
        private readonly versionService: PermissionsVersionService,
    ) {
        dataSource.subscribers.push(this);
    }

    afterInsert(event: InsertEvent<any>): void {
        this.record(event.metadata.tableName, event.queryRunner);
    }

    afterUpdate(event: UpdateEvent<any>): void {
        if (event.metadata.tableName === 'users') {
            // save(): `updatedColumns` có tên cột đổi thật. QueryBuilder.update(): chỉ có `entity` = các giá trị được set.
            const changed =
                event.updatedColumns.length > 0 || event.updatedRelations.length > 0
                    ? [...event.updatedColumns.map((c) => c.propertyName), ...event.updatedRelations.map((r) => r.propertyName)]
                    : Object.keys((event.entity as object | undefined) ?? {});
            const affectsDepartments = changed.some((c) => USER_COLUMNS_AFFECTING_DEPARTMENTS.has(c));
            const affectsUsers = changed.some((c) => !USER_COLUMNS_IGNORED_FOR_USERS_DOMAIN.has(c));
            if (!affectsDepartments && !affectsUsers) return;
            this.record('users', event.queryRunner, [
                ...(affectsDepartments ? (['departments'] as const) : []),
                ...(affectsUsers ? (['users'] as const) : []),
            ]);
            return;
        }
        this.record(event.metadata.tableName, event.queryRunner);
    }

    afterRemove(event: RemoveEvent<any>): void {
        this.record(event.metadata.tableName, event.queryRunner);
    }

    // `repository.softDelete()/restore()` (QueryBuilder) và `softRemove()/recover()` phát 2 sự kiện này thay vì afterUpdate/afterRemove.
    afterSoftRemove(event: SoftRemoveEvent<any>): void {
        this.record(event.metadata.tableName, event.queryRunner);
    }

    afterRecover(event: RecoverEvent<any>): void {
        this.record(event.metadata.tableName, event.queryRunner);
    }

    afterTransactionCommit(event: TransactionCommitEvent): void {
        const pending = this.pendingByRunner.get(event.queryRunner);
        if (!pending || pending.size === 0) return;
        this.pendingByRunner.delete(event.queryRunner);
        this.versionService.bumpRef([...pending]);
    }

    afterTransactionRollback(event: TransactionRollbackEvent): void {
        this.pendingByRunner.delete(event.queryRunner);
    }

    private record(tableName: string, queryRunner: QueryRunner | undefined, override?: readonly RefDataDomain[]): void {
        const domains = override ?? (tableName === 'users' ? (['departments', 'users'] as const) : REF_DATA_TABLE_DOMAINS[tableName]);
        if (!domains) return;

        if (queryRunner?.isTransactionActive) {
            const set = this.pendingByRunner.get(queryRunner) ?? new Set<RefDataDomain>();
            domains.forEach((d) => set.add(d));
            this.pendingByRunner.set(queryRunner, set);
            return;
        }

        domains.forEach((d) => this.immediate.add(d));
        if (this.flushScheduled) return;
        this.flushScheduled = true;
        // Gom mọi sự kiện cùng 1 tick (vd. xoá rồi chèn lại danh sách manager) thành 1 lần bump.
        void Promise.resolve().then(() => {
            this.flushScheduled = false;
            const batch = [...this.immediate];
            this.immediate = new Set();
            this.versionService.bumpRef(batch);
        });
    }
}