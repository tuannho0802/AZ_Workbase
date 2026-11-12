import * as fs from 'fs';
import * as path from 'path';
import { FANPAGE_FLAG_KEYS } from './fanpage-access.service';

/**
 * LƯỚI AN TOÀN GĐ7 (PLAN_FANPAGE_ANALYTICS mục 14): mọi permission key mà module Fanpage dùng PHẢI
 *  (1) đã được seed bằng migration - key chưa seed khoá vĩnh viễn endpoint với mọi role trừ Root Admin (PERMISSIONS.md mục 4 của hướng dẫn dự án);
 *  (2) có nhãn tiếng Việt trong `resource-labels.ts` - thiếu nhãn thì trang Phân quyền hiện raw key.
 * Đọc mã nguồn dạng chuỗi (không cần DB) nên chạy được trong jest thường.
 */
const FANPAGES_DIR = __dirname;
const MIGRATIONS_DIR = path.resolve(__dirname, '../../database/migrations');
const RESOURCE_LABELS = path.resolve(__dirname, '../../../../frontend/src/lib/permissions/resource-labels.ts');

const controllerSources = fs
  .readdirSync(FANPAGES_DIR)
  .filter((n) => n.endsWith('.controller.ts'))
  .map((n) => fs.readFileSync(path.join(FANPAGES_DIR, n), 'utf8'));

const usedKeys = new Set<string>();
for (const src of controllerSources) {
  for (const m of src.matchAll(/@RequirePermission\('([a-z_]+\.[a-z_]+)'\)/g)) usedKeys.add(m[1]);
}
for (const [, key] of FANPAGE_FLAG_KEYS) usedKeys.add(key);

/** Key thuộc module Fanpage (khác `customers.*` dùng chung, vốn do migration của module Khách hàng seed). */
const fanpageKeys = [...usedKeys].filter((k) => k.startsWith('fanpage')).sort();

const seedSource = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((n) => /Seed.*Fanpage|Fanpage.*Seed/i.test(n))
  .map((n) => fs.readFileSync(path.join(MIGRATIONS_DIR, n), 'utf8'))
  .join('\n');

describe('Fanpage: hợp đồng permission key', () => {
  it('tìm thấy key trong controller (tránh test rỗng vì đổi cấu trúc file)', () => {
    expect(fanpageKeys.length).toBeGreaterThanOrEqual(15);
    expect(fanpageKeys).toContain('fanpages.view');
    expect(fanpageKeys).toContain('fanpage_rankings.view');
  });

  it.each(fanpageKeys)('%s đã được seed trong migration Seed*Fanpage*', (key) => {
    expect(seedSource).toContain(`'${key}'`);
  });

  it('mọi resource của key Fanpage có nhãn trong resource-labels.ts', () => {
    const labels = fs.readFileSync(RESOURCE_LABELS, 'utf8');
    const resources = [...new Set(fanpageKeys.map((k) => k.split('.')[0]))];
    const missing = resources.filter((r) => !new RegExp(`\\b${r}\\s*:`).test(labels));
    expect(missing).toEqual([]);
  });

  it('mọi route của controller Fanpage đều khai @RequirePermission (không route nào chỉ mở theo đăng nhập)', () => {
    const missing: string[] = [];
    // `fanpages-cron.controller.ts` cố ý KHÔNG dùng permission: xác thực bằng CRON_SECRET (không JWT), do dịch vụ Uptime gọi.
    const routedSources = fs
      .readdirSync(FANPAGES_DIR)
      .filter((n) => n.endsWith('.controller.ts') && !n.includes('cron'))
      .map((n) => fs.readFileSync(path.join(FANPAGES_DIR, n), 'utf8'));
    for (const src of routedSources) {
      // Tách theo decorator HTTP; mỗi khối đến decorator kế tiếp phải chứa @RequirePermission.
      const blocks = src.split(/\n\s*@(?=(?:Get|Post|Put|Patch|Delete)\()/).slice(1);
      for (const b of blocks) {
        const head = b.split('\n').slice(0, 6).join('\n');
        if (!head.includes('@RequirePermission(')) missing.push(head.split('\n')[0]);
      }
    }
    expect(missing).toEqual([]);
  });
});
