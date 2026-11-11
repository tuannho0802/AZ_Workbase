import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { User } from '../../database/entities/user.entity';
import { FanpageHealthStatus } from '../../database/entities/fanpage-health-status.entity';
import { FanpageAccessService, FanpageCaller } from './fanpage-access.service';

/** Action audit liên quan lịch sử Page. Dùng RIÊNG `audit_logs` nhưng KHÔNG mở `audit.view` cho người dùng thường (PLAN 6.3). */
export const FANPAGE_HISTORY_ACTIONS = ['CREATE_FANPAGE', 'UPDATE_FANPAGE', 'ARCHIVE_FANPAGE', 'UNARCHIVE_FANPAGE'] as const;
/** Số dòng audit tối đa đọc cho 1 Page. */
export const FANPAGE_HISTORY_LIMIT = 200;

export type FanpageHistoryType = 'created' | 'owners' | 'health' | 'tracking' | 'archive';

/** Phần snapshot audit mà lịch sử quan tâm (xem `snapshot()` trong fanpages.service). Bản ghi cũ có thể thiếu trường. */
export interface FanpageAuditSnapshot {
    ownerIds?: number[];
    isActive?: boolean;
    healthStatusId?: number | null;
    healthNote?: string | null;
    isArchived?: boolean;
}

export interface FanpageHistoryDiff {
    type: FanpageHistoryType;
    before: unknown;
    after: unknown;
}

const has = <K extends keyof FanpageAuditSnapshot>(o: FanpageAuditSnapshot | null | undefined, k: K): boolean =>
    o != null && Object.prototype.hasOwnProperty.call(o, k) && o[k] !== undefined;

const sameIds = (a: number[], b: number[]): boolean => {
    const sa = [...a].sort((x, y) => x - y);
    const sb = [...b].sort((x, y) => x - y);
    return sa.length === sb.length && sa.every((v, i) => v === sb[i]);
};

/**
 * Từ 1 dòng audit -> các sự kiện lịch sử (hàm thuần, có test). 1 lần UPDATE có thể sinh nhiều sự kiện.
 * Trường thiếu ở bản ghi cũ coi là "không biết" -> KHÔNG sinh sự kiện (tránh bịa lịch sử).
 * Lưu trữ/bỏ lưu trữ ngầm đổi `is_active` nên chỉ sinh sự kiện `archive`, không sinh thêm `tracking`.
 */
export function diffFanpageAudit(
    action: string,
    before: FanpageAuditSnapshot | null,
    after: FanpageAuditSnapshot | null,
): FanpageHistoryDiff[] {
    if (action === 'CREATE_FANPAGE') {
        return [{ type: 'created', before: null, after: { ownerIds: after?.ownerIds ?? [], healthStatusId: after?.healthStatusId ?? null } }];
    }
    if (action === 'ARCHIVE_FANPAGE') return [{ type: 'archive', before: { archived: false }, after: { archived: true } }];
    if (action === 'UNARCHIVE_FANPAGE') return [{ type: 'archive', before: { archived: true }, after: { archived: false } }];
    if (action !== 'UPDATE_FANPAGE') return [];

    const out: FanpageHistoryDiff[] = [];
    if (has(before, 'ownerIds') && has(after, 'ownerIds') && !sameIds(before!.ownerIds!, after!.ownerIds!)) {
        out.push({ type: 'owners', before: before!.ownerIds, after: after!.ownerIds });
    }
    if (has(before, 'healthStatusId') && has(after, 'healthStatusId')) {
        const noteChanged = (before!.healthNote ?? null) !== (after!.healthNote ?? null);
        if (before!.healthStatusId !== after!.healthStatusId || noteChanged) {
            out.push({
                type: 'health',
                before: { healthStatusId: before!.healthStatusId, healthNote: before!.healthNote ?? null },
                after: { healthStatusId: after!.healthStatusId, healthNote: after!.healthNote ?? null },
            });
        }
    }
    if (has(before, 'isActive') && has(after, 'isActive') && before!.isActive !== after!.isActive) {
        out.push({ type: 'tracking', before: { isActive: before!.isActive }, after: { isActive: after!.isActive } });
    }
    return out;
}

export interface FanpageHistoryEvent {
    id: string;
    type: FanpageHistoryType;
    at: Date;
    actor: { id: number; name: string } | null;
    before: unknown;
    after: unknown;
}

/** Id -> tên để FE hiển thị (không phải tự tra). */
const idList = (v: unknown): number[] => (Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : []);

/** Timeline đổi người phụ trách / tình trạng / theo dõi / lưu trữ của 1 Page (E2). Quyền = `fanpages.view` trên Page đó. */
@Injectable()
export class FanpageHistoryService {
    constructor(
        @InjectRepository(AuditLog)
        private readonly auditRepo: Repository<AuditLog>,
        @InjectRepository(User)
        private readonly userRepo: Repository<User>,
        @InjectRepository(FanpageHealthStatus)
        private readonly healthRepo: Repository<FanpageHealthStatus>,
        private readonly access: FanpageAccessService,
    ) { }

    async list(fanpageId: number, user: FanpageCaller): Promise<FanpageHistoryEvent[]> {
        await this.access.assertPageAccess(user, 'fanpages.view', fanpageId, 'Bạn không có quyền xem Page này');

        const logs = await this.auditRepo.find({
            where: { entityType: 'fanpage', entityId: fanpageId, action: In([...FANPAGE_HISTORY_ACTIONS]) },
            order: { createdAt: 'DESC', id: 'DESC' },
            take: FANPAGE_HISTORY_LIMIT,
        });

        const raw: Array<{ log: AuditLog; diff: FanpageHistoryDiff }> = [];
        for (const log of logs) {
            for (const diff of diffFanpageAudit(log.action, log.oldData ?? null, log.newData ?? null)) raw.push({ log, diff });
        }

        // 1 truy vấn gộp cho tên người dùng, 1 cho tên tình trạng (không N+1).
        const userIds = new Set<number>();
        const healthIds = new Set<number>();
        for (const { log, diff } of raw) {
            if (log.userId != null) userIds.add(log.userId);
            if (diff.type === 'owners' || diff.type === 'created') {
                const b = diff.before;
                const a = diff.type === 'created' ? (diff.after as { ownerIds?: number[] }).ownerIds : diff.after;
                [...idList(b), ...idList(a)].forEach((i) => userIds.add(i));
            }
            if (diff.type === 'health' || diff.type === 'created') {
                for (const side of [diff.before, diff.after]) {
                    const id = (side as { healthStatusId?: number | null } | null)?.healthStatusId;
                    if (typeof id === 'number') healthIds.add(id);
                }
            }
        }
        const [users, statuses] = await Promise.all([
            userIds.size ? this.userRepo.find({ where: { id: In([...userIds]) }, select: ['id', 'name'] }) : Promise.resolve([] as User[]),
            healthIds.size ? this.healthRepo.find({ where: { id: In([...healthIds]) }, select: ['id', 'name'] }) : Promise.resolve([] as FanpageHealthStatus[]),
        ]);
        const userName = new Map(users.map((u) => [u.id, u.name]));
        const statusName = new Map(statuses.map((s) => [s.id, s.name]));

        const named = (ids: unknown) => idList(ids).map((id) => ({ id, name: userName.get(id) ?? `#${id}` }));
        const health = (side: unknown) => {
            const s = side as { healthStatusId?: number | null; healthNote?: string | null } | null;
            if (!s) return null;
            const id = s.healthStatusId ?? null;
            return { healthStatusId: id, healthStatusName: id == null ? null : (statusName.get(id) ?? `#${id}`), healthNote: s.healthNote ?? null };
        };

        return raw.map(({ log, diff }, idx) => {
            let before = diff.before;
            let after = diff.after;
            if (diff.type === 'owners') {
                before = named(diff.before);
                after = named(diff.after);
            } else if (diff.type === 'created') {
                after = { owners: named((diff.after as { ownerIds?: number[] }).ownerIds), health: health(diff.after) };
            } else if (diff.type === 'health') {
                before = health(diff.before);
                after = health(diff.after);
            }
            return {
                id: `${log.id}:${diff.type}:${idx}`,
                type: diff.type,
                at: log.createdAt,
                actor: log.userId != null ? { id: log.userId, name: userName.get(log.userId) ?? `#${log.userId}` } : null,
                before,
                after,
            };
        });
    }
}