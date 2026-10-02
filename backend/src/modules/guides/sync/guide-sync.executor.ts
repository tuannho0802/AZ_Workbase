import { DbGuideState, OrphanGuide, planSync, SyncAction } from './guide-sync.planner';
import { GuideSpec } from './guide-file.parser';

/** Cổng truy cập DB của `guides:sync` - tách ra để orchestration test được bằng store giả (không cần MySQL). */
export interface SyncStore {
  loadDbGuides(): Promise<DbGuideState[]>;
  /** Ném Error (tiếng Việt) nếu role/vị trí/phòng ban/permission trong spec không tồn tại. */
  assertRefsExist(spec: GuideSpec): Promise<void>;
  create(spec: GuideSpec): Promise<{ id: number }>;
  update(id: number, spec: GuideSpec): Promise<void>;
  setSourceHash(id: number, hash: string): Promise<void>;
}

export interface SyncOptions {
  /** false (mặc định của CLI) = chạy thử, KHÔNG ghi gì vào DB. */
  apply: boolean;
  /** true = ghi đè cả bài đang xung đột (DB đã bị sửa tay). */
  force: boolean;
  /** Chỉ xử lý các slug này (rỗng/undefined = tất cả). */
  only?: string[];
}

export type SyncStatus = 'create' | 'update' | 'forced' | 'unchanged' | 'adopt' | 'conflict' | 'error';

export interface SyncResultItem {
  slug: string;
  status: SyncStatus;
  /** true = đã thật sự ghi vào DB (luôn false khi chạy thử). */
  applied: boolean;
  detail?: string;
}

export interface SyncReport {
  items: SyncResultItem[];
  orphans: OrphanGuide[];
  /** Có lỗi / xung đột chưa xử lý -> CLI thoát mã 1. */
  hasProblems: boolean;
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function executeSync(files: GuideSpec[], store: SyncStore, opts: SyncOptions): Promise<SyncReport> {
  const only = opts.only?.length ? new Set(opts.only) : null;
  const selected = only ? files.filter((f) => only.has(f.slug)) : files;

  const plan = planSync(selected, await store.loadDbGuides());
  const items: SyncResultItem[] = [];

  const write = async (a: Extract<SyncAction, { kind: 'create' | 'update' | 'conflict' }>, status: SyncStatus) => {
    // Kiểm tra tham chiếu CẢ khi chạy thử để bắt lỗi gõ sai code/tên trước khi --apply.
    await store.assertRefsExist(a.file);
    if (!opts.apply) {
      items.push({ slug: a.slug, status, applied: false, detail: 'changed' in a ? a.changed.join(', ') : undefined });
      return;
    }
    let id: number;
    if (a.kind === 'create') id = (await store.create(a.file)).id;
    else {
      await store.update(a.id, a.file);
      id = a.id;
    }
    await store.setSourceHash(id, a.fileHash);
    items.push({ slug: a.slug, status, applied: true, detail: 'changed' in a ? a.changed.join(', ') : undefined });
  };

  for (const action of plan.actions) {
    try {
      switch (action.kind) {
        case 'create':
          await write(action, 'create');
          break;
        case 'update':
          await write(action, 'update');
          break;
        case 'conflict':
          if (opts.force) {
            await write(action, 'forced');
          } else {
            items.push({
              slug: action.slug,
              status: 'conflict',
              applied: false,
              detail: action.neverSynced
                ? `bài đã có trong DB nhưng chưa từng đồng bộ từ file (khác ở: ${action.changed.join(', ')})`
                : `DB đã bị sửa tay trên UI kể từ lần sync trước (khác ở: ${action.changed.join(', ')})`,
            });
          }
          break;
        case 'unchanged':
          if (action.adopt && opts.apply) await store.setSourceHash(action.id, action.fileHash);
          items.push({ slug: action.slug, status: action.adopt ? 'adopt' : 'unchanged', applied: action.adopt && opts.apply });
          break;
      }
    } catch (e) {
      items.push({ slug: action.slug, status: 'error', applied: false, detail: msg(e) });
    }
  }

  return {
    items,
    orphans: only ? [] : plan.orphans,
    hasProblems: items.some((i) => i.status === 'error' || i.status === 'conflict'),
  };
}
