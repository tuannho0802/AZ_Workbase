import {
  GUIDE_CONTENT_MAX,
  GUIDE_PERMISSION_KEY_REGEX,
  GUIDE_PERMISSIONS_MAX,
  GUIDE_SLUG_MAX,
  GUIDE_SLUG_REGEX,
} from '../dto/create-guide.dto';

/**
 * Bài hướng dẫn ở dạng "chuẩn" - dùng chung cho file `guides-content/*.md` (nguồn) và trạng thái trong DB (đích),
 * để 2 bên băm/so sánh được với nhau. Role/vị trí = `code`, phòng ban = `name` (không dùng id vì id khác nhau giữa các môi trường).
 */
export interface GuideSpec {
  title: string;
  slug: string;
  sortOrder: number;
  published: boolean;
  roles: string[];
  positions: string[];
  departments: string[];
  /** LOẠI TRỪ (thắng "được xem"): cùng kiểu mã với roles/positions/departments. */
  excludeRoles: string[];
  excludePositions: string[];
  excludeDepartments: string[];
  permissions: string[];
  content: string;
}

export class GuideFileError extends Error {
  constructor(
    public readonly file: string,
    message: string,
  ) {
    super(`${file}: ${message}`);
    this.name = 'GuideFileError';
  }
}

const ALLOWED_KEYS = new Set(['title', 'slug', 'sortOrder', 'published', 'roles', 'positions', 'departments', 'permissions', 'excludeRoles', 'excludePositions', 'excludeDepartments']);
const LIST_MAX = 100;
const TITLE_MAX = 200;

/** CRLF -> LF, bỏ khoảng trắng/xuống dòng thừa ở cuối: cùng 1 nội dung luôn ra cùng 1 hash dù soạn trên Windows hay UI. */
export function normalizeContent(content: string): string {
  return content.replace(/\r\n?/g, '\n').replace(/\s+$/, '');
}

function stripQuotes(v: string): string {
  const t = v.trim();
  if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) {
    return t.slice(1, -1);
  }
  return t;
}

/** Cắt chú thích ` # ...` ở cuối giá trị (không cắt nếu `#` nằm trong dấu nháy). */
function stripComment(v: string): string {
  const t = v.trim();
  const q = t[0];
  if (q === '"' || q === "'") {
    const end = t.indexOf(q, 1);
    return end === -1 ? t : t.slice(0, end + 1);
  }
  return t.replace(/\s+#.*$/, '').trim();
}

function parseFlowList(file: string, key: string, raw: string): string[] {
  const body = stripComment(raw);
  if (!body.startsWith('[') || !body.endsWith(']')) {
    throw new GuideFileError(file, `"${key}" phải là danh sách dạng [a, b] hoặc []`);
  }
  const inner = body.slice(1, -1).trim();
  if (!inner) return [];
  return inner.split(',').map((s) => stripQuotes(s)).filter((s) => s.length > 0);
}

function parseBool(file: string, key: string, raw: string): boolean {
  const v = stripQuotes(stripComment(raw)).toLowerCase();
  if (v === 'true') return true;
  if (v === 'false') return false;
  throw new GuideFileError(file, `"${key}" phải là true hoặc false`);
}

function parseIntStrict(file: string, key: string, raw: string): number {
  const v = stripQuotes(stripComment(raw));
  if (!/^\d+$/.test(v)) throw new GuideFileError(file, `"${key}" phải là số nguyên không âm`);
  return Number(v);
}

/** Tách khối frontmatter `--- ... ---` khỏi phần thân Markdown. */
function splitFrontmatter(file: string, raw: string): { front: string[]; body: string } {
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  if (lines[0].trim() !== '---') throw new GuideFileError(file, 'thiếu frontmatter: file phải bắt đầu bằng dòng ---');
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (end === -1) throw new GuideFileError(file, 'frontmatter không có dòng --- đóng');
  return { front: lines.slice(1, end), body: lines.slice(end + 1).join('\n') };
}

/** Parser YAML tối giản (đủ cho frontmatter của guide): `key: value`, danh sách `[a, b]` hoặc `- item`, chú thích `#`. */
function parseFrontmatterLines(file: string, lines: string[]): Map<string, string | string[]> {
  const out = new Map<string, string | string[]>();
  let listKey: string | null = null;
  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const item = /^\s+-\s+(.*)$/.exec(line) ?? /^-\s+(.*)$/.exec(line);
    if (item && listKey) {
      (out.get(listKey) as string[]).push(stripQuotes(stripComment(item[1])));
      continue;
    }
    const m = /^([A-Za-z][A-Za-z0-9]*):(?:\s+(.*)|\s*)$/.exec(line);
    if (!m) throw new GuideFileError(file, `dòng frontmatter không hợp lệ: "${line.trim()}"`);
    const [, key, value = ''] = m;
    if (!ALLOWED_KEYS.has(key)) {
      throw new GuideFileError(file, `khoá frontmatter lạ "${key}" (cho phép: ${[...ALLOWED_KEYS].join(', ')})`);
    }
    if (out.has(key)) throw new GuideFileError(file, `khoá "${key}" khai báo 2 lần`);
    if (stripComment(value) === '') {
      // `key:` rỗng -> danh sách dạng block ở các dòng sau (chỉ hợp lệ với khoá kiểu danh sách).
      out.set(key, []);
      listKey = key;
    } else {
      out.set(key, value);
      listKey = null;
    }
  }
  return out;
}

function asList(file: string, key: string, v: string | string[] | undefined): string[] {
  if (v === undefined) return [];
  const list = Array.isArray(v) ? v : parseFlowList(file, key, v);
  const unique = [...new Set(list)];
  if (unique.length > LIST_MAX) throw new GuideFileError(file, `"${key}" tối đa ${LIST_MAX} phần tử`);
  return unique;
}

function asScalar(file: string, key: string, v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  if (Array.isArray(v)) throw new GuideFileError(file, `"${key}" phải là một giá trị, không phải danh sách`);
  return v;
}

/**
 * Đọc 1 file `guides-content/<slug>.md`. `fileName` là tên file (vd `khach-hang.md`) - slug trong frontmatter PHẢI khớp tên file
 * để 1 file = 1 bài, không thể lỡ tay ghi đè bài khác. Mọi vi phạm ném `GuideFileError` (đã kèm tên file).
 */
export function parseGuideFile(fileName: string, raw: string): GuideSpec {
  const { front, body } = splitFrontmatter(fileName, raw);
  const fm = parseFrontmatterLines(fileName, front);

  const title = stripQuotes(stripComment(asScalar(fileName, 'title', fm.get('title')) ?? ''));
  if (!title) throw new GuideFileError(fileName, 'thiếu "title"');
  if (title.length > TITLE_MAX) throw new GuideFileError(fileName, `"title" tối đa ${TITLE_MAX} ký tự`);

  const slug = stripQuotes(stripComment(asScalar(fileName, 'slug', fm.get('slug')) ?? ''));
  if (!slug) throw new GuideFileError(fileName, 'thiếu "slug"');
  if (slug.length > GUIDE_SLUG_MAX || !GUIDE_SLUG_REGEX.test(slug)) {
    throw new GuideFileError(fileName, `slug "${slug}" không hợp lệ (chữ thường, số, gạch ngang; ≤ ${GUIDE_SLUG_MAX} ký tự)`);
  }
  const expected = fileName.replace(/\.md$/i, '');
  if (slug !== expected) throw new GuideFileError(fileName, `slug "${slug}" phải trùng tên file ("${expected}")`);
  if (slug === 'manage') throw new GuideFileError(fileName, 'slug "manage" được dành riêng cho hệ thống');

  const sortRaw = asScalar(fileName, 'sortOrder', fm.get('sortOrder'));
  const sortOrder = sortRaw === undefined ? 0 : parseIntStrict(fileName, 'sortOrder', sortRaw);
  if (sortOrder > 100000) throw new GuideFileError(fileName, '"sortOrder" tối đa 100000');

  const pubRaw = asScalar(fileName, 'published', fm.get('published'));
  const published = pubRaw === undefined ? false : parseBool(fileName, 'published', pubRaw);

  const permissions = asList(fileName, 'permissions', fm.get('permissions'));
  if (permissions.length > GUIDE_PERMISSIONS_MAX) {
    throw new GuideFileError(fileName, `"permissions" tối đa ${GUIDE_PERMISSIONS_MAX} key`);
  }
  for (const k of permissions) {
    if (k.length > 100 || !GUIDE_PERMISSION_KEY_REGEX.test(k)) {
      throw new GuideFileError(fileName, `permission "${k}" không hợp lệ (dạng resource.action)`);
    }
  }

  const roles = asList(fileName, 'roles', fm.get('roles'));
  const positions = asList(fileName, 'positions', fm.get('positions'));
  const departments = asList(fileName, 'departments', fm.get('departments'));
  const excludeRoles = asList(fileName, 'excludeRoles', fm.get('excludeRoles'));
  const excludePositions = asList(fileName, 'excludePositions', fm.get('excludePositions'));
  const excludeDepartments = asList(fileName, 'excludeDepartments', fm.get('excludeDepartments'));
  for (const [inc, exc, key] of [
    [roles, excludeRoles, 'roles/excludeRoles'],
    [positions, excludePositions, 'positions/excludePositions'],
    [departments, excludeDepartments, 'departments/excludeDepartments'],
  ] as const) {
    const both = inc.filter((v) => exc.includes(v));
    if (both.length) {
      throw new GuideFileError(fileName, `"${both.join('", "')}" vừa được xem vừa bị loại trừ (${key}) - mỗi giá trị chỉ nằm ở 1 danh sách`);
    }
  }

  const content = normalizeContent(body.replace(/^\n+/, ''));
  if (!content) throw new GuideFileError(fileName, 'nội dung (sau frontmatter) không được để trống');
  if (content.length > GUIDE_CONTENT_MAX) throw new GuideFileError(fileName, `nội dung tối đa ${GUIDE_CONTENT_MAX} ký tự`);

  return {
    title,
    slug,
    sortOrder,
    published,
    roles,
    positions,
    departments,
    excludeRoles,
    excludePositions,
    excludeDepartments,
    permissions,
    content,
  };
}

/** Các id mẫu minh hoạ (```az-demo <id> ...) mà bài nhúng - dùng cho test contract/đối chiếu `GUIDE_DEMOS` ở FE. */
export function extractDemoIds(content: string): string[] {
  const ids: string[] = [];
  const re = /^```az-demo[ \t]*\n([^\n]*)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    const id = m[1].trim().split(/\s+/)[0];
    if (id) ids.push(id);
  }
  return ids;
}
