/**
 * LƯỚI AN TOÀN chống lệch (PLAN_GUIDES_CONTENT §2.4): mẫu minh hoạ và bài trong `guides-content/` không được nhắc tới thứ
 * KHÔNG có thật - key ẩn trường, permission key, id mẫu, tham số mẫu. Sai -> test đỏ ngay ở PR thay vì người dùng thấy guide sai.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GUIDE_DEMOS } from './guide-demos';
import { DEMO_PERSONAS } from './demo-kit/personas';
import { extractDemoSpecs } from './guide-markdown';
import {
  readBackendCustomerElementKeys,
  readFrontmatterPermissions,
  readGuideContentFiles,
  readSeededPermissionKeys,
} from './testing/repo-files';

const seeded = readSeededPermissionKeys();
const guideFiles = readGuideContentFiles();

describe('contract: bộ đọc seed/hằng số (phát hiện regex bị mục khi cấu trúc BE đổi)', () => {
  it('đọc được danh sách permission đã seed (đủ nhiều + có các key nền tảng)', () => {
    expect(seeded.size).toBeGreaterThan(60);
    for (const k of ['customers.view', 'customers.assign', 'guides.manage', 'roles.view']) expect(seeded.has(k)).toBe(true);
  });
  it('đọc được CUSTOMER_ELEMENT_KEYS của backend', () => {
    const keys = readBackendCustomerElementKeys();
    expect(keys.length).toBeGreaterThanOrEqual(5);
    expect(keys.every((k) => /^(field|tab):[a-z_]+$/.test(k))).toBe(true);
  });
});

describe('contract (a): key ẩn trường/tab của persona ∈ CUSTOMER_ELEMENT_KEYS backend', () => {
  const valid = new Set(readBackendCustomerElementKeys());
  it.each(DEMO_PERSONAS.map((p) => [p.id, p.hiddenKeys] as const))('persona %s', (_id, hiddenKeys) => {
    expect(hiddenKeys.filter((k) => !valid.has(k))).toEqual([]);
  });
});

describe('contract (b): permission key được nhắc tới đều có thật (đã seed)', () => {
  it.each(DEMO_PERSONAS.map((p) => [p.id, p.permissions] as const))('persona %s', (_id, permissions) => {
    expect(permissions.filter((k) => !seeded.has(k))).toEqual([]);
  });

  it('chuỗi dạng `resource.action` trong mã nguồn mẫu minh hoạ phải là key đã seed', () => {
    const dir = __dirname;
    const files = [
      path.join(dir, 'guide-demos.tsx'),
      ...['demo-kit', 'demos'].flatMap((d) =>
        fs
          .readdirSync(path.join(dir, d))
          .filter((n) => /\.tsx?$/.test(n) && !/\.test\./.test(n))
          .map((n) => path.join(dir, d, n)),
      ),
    ];
    const actions = new Set([...seeded].map((k) => k.split('.')[1]));
    const unknown: string[] = [];
    for (const f of files) {
      for (const m of fs.readFileSync(f, 'utf8').matchAll(/'([a-z][a-z0-9_]*)\.([a-z][a-z0-9_]*)'/g)) {
        const key = `${m[1]}.${m[2]}`;
        // Chỉ xét chuỗi "trông như" permission: action là 1 action thật của hệ thống (tránh báo nhầm tên file, số thập phân...).
        if (actions.has(m[2]) && !seeded.has(key)) unknown.push(`${path.basename(f)}: ${key}`);
      }
    }
    expect(unknown).toEqual([]);
  });

  it.each(guideFiles.map((g) => [g.name, g.raw] as const))('guides-content/%s: permissions ở frontmatter đều đã seed', (_n, raw) => {
    expect(readFrontmatterPermissions(raw).filter((k) => !seeded.has(k))).toEqual([]);
  });
});

describe('contract (c)+(d): id + tham số mẫu trong guides-content/*.md', () => {
  const demoById = new Map(GUIDE_DEMOS.map((d) => [d.id, d]));

  it('registry GUIDE_DEMOS: id hợp lệ, không trùng', () => {
    const ids = GUIDE_DEMOS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  it.each(guideFiles.map((g) => [g.name, g.raw] as const))('%s', (_n, raw) => {
    const problems: string[] = [];
    for (const spec of extractDemoSpecs(raw)) {
      const demo = demoById.get(spec.id);
      if (!demo) {
        problems.push(`mẫu "${spec.id}" không có trong GUIDE_DEMOS`);
        continue;
      }
      for (const t of spec.invalid) problems.push(`mẫu "${spec.id}": token sai cú pháp "${t}"`);
      for (const [k, v] of Object.entries(spec.params)) {
        const allowed = demo.params?.[k];
        if (!allowed) problems.push(`mẫu "${spec.id}": tham số lạ "${k}"`);
        else if (!allowed.includes(v)) problems.push(`mẫu "${spec.id}": ${k}=${v} không hợp lệ (cho phép: ${allowed.join(', ')})`);
      }
    }
    expect(problems).toEqual([]);
  });
});
