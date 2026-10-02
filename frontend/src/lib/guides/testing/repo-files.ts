/**
 * Đọc file ở NGOÀI `frontend/` (nội dung `guides-content/`, migration + hằng số của `backend/`) cho các test "lưới an toàn".
 * CHỈ dùng trong `*.test.ts` - không import từ code chạy ở trình duyệt.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** frontend/src/lib/guides/testing -> gốc repo (lên 5 cấp). */
export const REPO_ROOT = path.resolve(HERE, '../../../../..');
export const GUIDES_CONTENT_DIR = path.join(REPO_ROOT, 'guides-content');
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'backend/src/database/migrations');
const UI_VISIBILITY_FILE = path.join(REPO_ROOT, 'backend/src/modules/ui-visibility/ui-visibility.constants.ts');

function mustExist(p: string, what: string): string {
  if (!fs.existsSync(p)) {
    throw new Error(`Không thấy ${what} tại ${p}. Test lưới an toàn cần chạy trong monorepo đầy đủ (có cả backend/ và guides-content/).`);
  }
  return p;
}

export interface GuideContentFile {
  /** Tên file, vd `khach-hang.md`. */
  name: string;
  slug: string;
  raw: string;
}

/** Mọi bài thật trong `guides-content/` (bỏ `_template.md` và README). */
export function readGuideContentFiles(): GuideContentFile[] {
  mustExist(GUIDES_CONTENT_DIR, 'thư mục guides-content/');
  return fs
    .readdirSync(GUIDES_CONTENT_DIR)
    .filter((n) => n.endsWith('.md') && !n.startsWith('_') && n.toLowerCase() !== 'readme.md')
    .sort()
    .map((name) => ({ name, slug: name.replace(/\.md$/, ''), raw: fs.readFileSync(path.join(GUIDES_CONTENT_DIR, name), 'utf8') }));
}

/**
 * Mọi permission key đã được SEED bởi migration: dòng `('res.act', 'res', 'act', ...` trong `INSERT INTO permissions`.
 * Giới hạn đã biết: không phát hiện key bị migration SAU đó gỡ/đổi tên (chỉ chứng minh "từng được seed").
 */
export function readSeededPermissionKeys(): Set<string> {
  mustExist(MIGRATIONS_DIR, 'thư mục backend migrations');
  const re = /\(\s*'([a-z0-9_]+\.[a-z0-9_]+)'\s*,\s*'([a-z0-9_]+)'\s*,\s*'([a-z0-9_]+)'/g;
  const keys = new Set<string>();
  for (const f of fs.readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith('.ts'))) {
    const src = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
    for (const m of src.matchAll(re)) if (m[1] === `${m[2]}.${m[3]}`) keys.add(m[1]);
  }
  return keys;
}

/** `CUSTOMER_ELEMENT_KEYS` của backend (nguồn thật cho "Ẩn trường/tab theo Vị trí"). */
export function readBackendCustomerElementKeys(): string[] {
  const src = fs.readFileSync(mustExist(UI_VISIBILITY_FILE, 'ui-visibility.constants.ts'), 'utf8');
  const block = /CUSTOMER_ELEMENT_KEYS\s*=\s*\[([\s\S]*?)\]\s*as const/.exec(src);
  if (!block) throw new Error('Không đọc được CUSTOMER_ELEMENT_KEYS từ backend (đổi cách khai báo? sửa regex ở repo-files.ts)');
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/** Permission key khai trong frontmatter `permissions:` (dạng `[a, b]` hoặc block `- a`). */
export function readFrontmatterPermissions(raw: string): string[] {
  const front = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/.exec(raw)?.[1] ?? '';
  const flow = /^permissions:\s*\[([^\]]*)\]/m.exec(front);
  if (flow) return flow[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  const block = /^permissions:[ \t]*(?:#.*)?\r?\n((?:[ \t]*-[ \t]+.*\r?\n?)*)/m.exec(front);
  return block ? [...block[1].matchAll(/-[ \t]+([^\s#]+)/g)].map((m) => m[1].replace(/^['"]|['"]$/g, '')) : [];
}
