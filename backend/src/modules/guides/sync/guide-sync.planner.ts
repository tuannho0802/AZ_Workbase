import { createHash } from 'crypto';
import { GuideSpec, normalizeContent } from './guide-file.parser';

/** Dạng chuẩn để băm: danh sách đã sắp, nội dung đã chuẩn hoá -> thứ tự/CRLF không làm đổi hash. */
export function canonicalize(spec: GuideSpec): GuideSpec {
  const sorted = (a: string[]) => [...new Set(a)].sort((x, y) => x.localeCompare(y));
  return {
    title: spec.title.trim(),
    slug: spec.slug,
    sortOrder: spec.sortOrder,
    published: !!spec.published,
    roles: sorted(spec.roles),
    positions: sorted(spec.positions),
    departments: sorted(spec.departments),
    excludeRoles: sorted(spec.excludeRoles ?? []),
    excludePositions: sorted(spec.excludePositions ?? []),
    excludeDepartments: sorted(spec.excludeDepartments ?? []),
    permissions: sorted(spec.permissions),
    content: normalizeContent(spec.content),
  };
}

export function hashSpec(spec: GuideSpec): string {
  const c = canonicalize(spec);
  // Thứ tự khoá cố định (không dựa vào thứ tự của object đầu vào).
  const fields: unknown[] = [c.title, c.slug, c.sortOrder, c.published, c.roles, c.positions, c.departments, c.permissions, c.content];
  // Loại trừ chỉ đưa vào hash KHI CÓ: bài không dùng loại trừ giữ nguyên hash cũ (không làm mọi `source_hash` đã lưu bị coi là "đã sửa tay"),
  // còn đổi loại trừ thì hash đổi -> sync nhận ra thay đổi.
  if (c.excludeRoles.length || c.excludePositions.length || c.excludeDepartments.length) {
    fields.push([c.excludeRoles, c.excludePositions, c.excludeDepartments]);
  }
  const payload = JSON.stringify(fields);
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

/** Bài đang có trong DB, đã quy về dạng `GuideSpec` (id -> code/name) kèm hash lần đồng bộ cuối. */
export interface DbGuideState {
  id: number;
  spec: GuideSpec;
  /** Hash lúc `guides:sync` ghi lần cuối; null = bài tạo tay trên UI chưa từng đồng bộ. */
  sourceHash: string | null;
}

export type SyncAction =
  | { kind: 'create'; slug: string; file: GuideSpec; fileHash: string }
  /** DB chưa bị sửa tay kể từ lần sync trước, file đã đổi -> ghi đè an toàn. */
  | { kind: 'update'; slug: string; file: GuideSpec; fileHash: string; id: number; changed: string[] }
  /** Nội dung đã trùng. `adopt` = chưa có hash gốc -> chỉ ghi hash để lần sau phát hiện được sửa tay trên UI. */
  | { kind: 'unchanged'; slug: string; fileHash: string; id: number; adopt: boolean }
  /** DB khác file VÀ DB đã bị sửa (hoặc bài tạo tay chưa từng sync) -> không ghi đè nếu thiếu --force. */
  | { kind: 'conflict'; slug: string; file: GuideSpec; fileHash: string; id: number; changed: string[]; neverSynced: boolean };

export interface OrphanGuide {
  id: number;
  slug: string;
  title: string;
}

export interface SyncPlan {
  actions: SyncAction[];
  /** Bài có trong DB nhưng KHÔNG có file - chỉ thông báo, không bao giờ tự xoá. */
  orphans: OrphanGuide[];
}

/** Tên các trường khác nhau giữa 2 spec (để báo cáo "đổi gì"). */
export function diffFields(a: GuideSpec, b: GuideSpec): string[] {
  const x = canonicalize(a);
  const y = canonicalize(b);
  const keys: Array<keyof GuideSpec> = ['title', 'sortOrder', 'published', 'roles', 'positions', 'departments', 'excludeRoles', 'excludePositions', 'excludeDepartments', 'permissions', 'content'];
  return keys.filter((k) => JSON.stringify(x[k]) !== JSON.stringify(y[k]));
}

/**
 * Hàm THUẦN quyết định việc cần làm cho từng file (không đụng DB):
 *  - chưa có trong DB                                  -> create
 *  - hash DB == hash file                               -> unchanged (adopt nếu chưa lưu hash gốc)
 *  - khác, và DB còn đúng như lần sync trước            -> update
 *  - khác, và DB đã bị sửa / chưa từng sync             -> conflict
 */
export function planSync(files: GuideSpec[], dbGuides: DbGuideState[]): SyncPlan {
  const bySlug = new Map(dbGuides.map((g) => [g.spec.slug, g]));
  const fileSlugs = new Set(files.map((f) => f.slug));
  const actions: SyncAction[] = [];

  for (const file of [...files].sort((a, b) => a.slug.localeCompare(b.slug))) {
    const fileHash = hashSpec(file);
    const db = bySlug.get(file.slug);
    if (!db) {
      actions.push({ kind: 'create', slug: file.slug, file, fileHash });
      continue;
    }
    const dbHash = hashSpec(db.spec);
    if (dbHash === fileHash) {
      actions.push({ kind: 'unchanged', slug: file.slug, fileHash, id: db.id, adopt: db.sourceHash !== fileHash });
      continue;
    }
    const changed = diffFields(db.spec, file);
    if (db.sourceHash !== null && db.sourceHash === dbHash) {
      actions.push({ kind: 'update', slug: file.slug, file, fileHash, id: db.id, changed });
    } else {
      actions.push({ kind: 'conflict', slug: file.slug, file, fileHash, id: db.id, changed, neverSynced: db.sourceHash === null });
    }
  }

  const orphans = dbGuides
    .filter((g) => !fileSlugs.has(g.spec.slug))
    .map((g) => ({ id: g.id, slug: g.spec.slug, title: g.spec.title }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
  return { actions, orphans };
}
