/**
 * perf-fanpage.ts - đo thời gian + số truy vấn của các endpoint Fanpage với dữ liệu giả lớn (PLAN_FANPAGE_ANALYTICS GĐ7).
 *
 *   PERF_CONFIRM=yes npm run perf:fanpage                      # seed (nếu chưa có) + đo, mặc định 300 Page / 20.000 bài
 *   PERF_CONFIRM=yes npm run perf:fanpage -- --pages=500 --posts=50000 --runs=7
 *   PERF_CONFIRM=yes npm run perf:fanpage -- --cleanup         # xoá toàn bộ dữ liệu giả do script này tạo
 *
 * ⚠️ GHI DỮ LIỆU GIẢ vào DB đích (biến môi trường DB_*, xem data-source.ts). Vì vậy script TỪ CHỐI chạy nếu:
 *   - thiếu PERF_CONFIRM=yes, hoặc
 *   - DB_HOST không phải localhost/127.0.0.1, hoặc
 *   - tên DB không chứa "perf" hoặc "test".
 * KHÔNG trỏ vào DB dev/staging/production dùng chung. Dữ liệu giả gắn nhãn `perf.local` (email/URL) và tên `PERF-...` nên --cleanup chỉ xoá đúng phần đó.
 *
 * Đo bằng người gọi Root Admin (scope `all` = trường hợp nặng nhất; không phụ thuộc bảng role_permissions).
 * Số truy vấn đếm qua logger của DataSource (mỗi lần gọi service, không tính seed).
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { todayVnStr } from '../src/common/utils/date-vn.util';
import { FanpageCaller } from '../src/modules/fanpages/fanpage-access.service';
import { FanpageExportService } from '../src/modules/fanpages/fanpage-export.service';
import { FanpageOverviewService } from '../src/modules/fanpages/fanpage-overview.service';
import { FanpageRankingsService } from '../src/modules/fanpages/fanpage-rankings.service';
import { FanpageStatsService } from '../src/modules/fanpages/fanpage-stats.service';
import { FanpageTodayService } from '../src/modules/fanpages/fanpage-today.service';
import { FanpagesService } from '../src/modules/fanpages/fanpages.service';

const TAG_DOMAIN = 'perf.local';

interface Args {
  pages: number;
  posts: number;
  runs: number;
  cleanup: boolean;
}

function parseArgs(argv: string[]): Args {
  const num = (k: string, d: number) => {
    const a = argv.find((x) => x.startsWith(`--${k}=`));
    const v = a ? Number(a.split('=')[1]) : d;
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : d;
  };
  return { pages: num('pages', 300), posts: num('posts', 20000), runs: num('runs', 5), cleanup: argv.includes('--cleanup') };
}

function assertSafeTarget(): void {
  const host = process.env.DB_HOST ?? '';
  const db = (process.env.DB_DATABASE ?? '').toLowerCase();
  const problems: string[] = [];
  if (process.env.PERF_CONFIRM !== 'yes') problems.push('thiếu PERF_CONFIRM=yes');
  if (!['localhost', '127.0.0.1'].includes(host)) problems.push(`DB_HOST="${host}" không phải localhost/127.0.0.1`);
  if (!db.includes('perf') && !db.includes('test')) problems.push(`tên DB "${db}" không chứa "perf" hoặc "test"`);
  if (problems.length) {
    console.error(`❌ Từ chối chạy (script ghi dữ liệu giả): ${problems.join('; ')}.`);
    process.exit(2);
  }
}

/** Số nguyên giả-ngẫu nhiên lặp lại được (mulberry32) để hai lần chạy cùng tham số cho cùng dữ liệu. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function addDays(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}

async function insertChunks(ds: DataSource, table: string, cols: string[], rows: unknown[][], chunk = 1000): Promise<void> {
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const ph = part.map(() => `(${cols.map(() => '?').join(',')})`).join(',');
    await ds.query(`INSERT INTO \`${table}\` (${cols.map((c) => `\`${c}\``).join(',')}) VALUES ${ph}`, part.flat());
  }
}

async function cleanup(ds: DataSource): Promise<void> {
  await ds.query(`DELETE FROM fanpages WHERE url LIKE ?`, [`https://${TAG_DOMAIN}/%`]); // posts/snapshots/owners cascade
  await ds.query(`DELETE FROM fanpage_platforms WHERE name LIKE 'PERF-%'`);
  await ds.query(`DELETE FROM fanpage_post_types WHERE name LIKE 'PERF-%'`);
  await ds.query(`DELETE FROM fanpage_health_statuses WHERE name LIKE 'PERF-%'`);
  await ds.query(`DELETE FROM users WHERE email LIKE ?`, [`%@${TAG_DOMAIN}`]);
  await ds.query(`DELETE FROM departments WHERE name LIKE 'PERF-%'`);
  console.log('🧹 Đã xoá dữ liệu giả của script perf-fanpage.');
}

async function seed(ds: DataSource, args: Args): Promise<{ rootId: number }> {
  const existing = await ds.query(`SELECT COUNT(*) AS n FROM fanpages WHERE url LIKE ?`, [`https://${TAG_DOMAIN}/%`]);
  const have = Number(existing[0].n);
  const rootRows = await ds.query(`SELECT id FROM users WHERE email = ?`, [`root@${TAG_DOMAIN}`]);
  if (have >= args.pages && rootRows[0]) {
    console.log(`↺ Đã có ${have} Page giả — bỏ qua seed (dùng --cleanup rồi chạy lại nếu muốn đổi quy mô).`);
    return { rootId: rootRows[0].id };
  }
  if (have > 0) await cleanup(ds);

  const rand = rng(20261112);
  const today = todayVnStr();
  const t0 = Date.now();

  await ds.query(`INSERT INTO departments (name) VALUES ('PERF-A'),('PERF-B'),('PERF-C'),('PERF-D')`);
  const depts: number[] = (await ds.query(`SELECT id FROM departments WHERE name LIKE 'PERF-%' ORDER BY id`)).map((r: { id: number }) => r.id);

  const userRows: unknown[][] = [['PF000', `root@${TAG_DOMAIN}`, 'x', 'Perf Root', 'admin', 1, null]];
  for (let i = 1; i <= 60; i++) {
    userRows.push([`PF${String(i).padStart(3, '0')}`, `u${i}@${TAG_DOMAIN}`, 'x', `Perf User ${i}`, 'employee', 0, depts[i % depts.length]]);
  }
  await insertChunks(ds, 'users', ['employee_code', 'email', 'password', 'name', 'role', 'is_root_admin', 'department_id'], userRows);
  const users: number[] = (await ds.query(`SELECT id FROM users WHERE email LIKE ? ORDER BY id`, [`%@${TAG_DOMAIN}`])).map((r: { id: number }) => r.id);
  const rootId = users[0];
  const staff = users.slice(1);

  await ds.query(`INSERT INTO fanpage_platforms (name, color, is_active, sort_order) VALUES ('PERF-Facebook','#1677ff',1,1),('PERF-TikTok','#eb2f96',1,2),('PERF-Instagram','#722ed1',1,3)`);
  const platforms: number[] = (await ds.query(`SELECT id FROM fanpage_platforms WHERE name LIKE 'PERF-%' ORDER BY id`)).map((r: { id: number }) => r.id);
  await ds.query(`INSERT INTO fanpage_health_statuses (name, color, is_blocking, is_default, sort_order) VALUES ('PERF-Bình thường','#52c41a',0,0,1),('PERF-Bị khoá','#cf1322',1,0,2)`);
  const health: number[] = (await ds.query(`SELECT id FROM fanpage_health_statuses WHERE name LIKE 'PERF-%' ORDER BY id`)).map((r: { id: number }) => r.id);
  await ds.query(`INSERT INTO fanpage_post_types (name, color, sort_order) VALUES ('PERF-Tin tức','#1677ff',1),('PERF-Review','#52c41a',2),('PERF-Video','#fa8c16',3)`);
  const types: number[] = (await ds.query(`SELECT id FROM fanpage_post_types WHERE name LIKE 'PERF-%' ORDER BY id`)).map((r: { id: number }) => r.id);

  // Page: ~85% theo dõi, ~7% tạm ngừng, ~5% bị khoá (blocking), ~3% lưu trữ.
  const pageRows: unknown[][] = [];
  for (let i = 1; i <= args.pages; i++) {
    const r = rand();
    const isActive = r < 0.93 ? 1 : 0;
    const blocked = r >= 0.93 && r < 0.98;
    const archived = r >= 0.98;
    const owner = staff[Math.floor(rand() * staff.length)];
    pageRows.push([
      platforms[i % platforms.length], `PERF-Page ${i}`, `https://${TAG_DOMAIN}/page-${i}`, owner, archived ? 0 : isActive,
      rand() < 0.7 ? 3 + Math.floor(rand() * 5) : null, blocked ? health[1] : health[0], rootId, archived ? new Date() : null,
    ]);
  }
  await insertChunks(ds, 'fanpages', ['platform_id', 'name', 'url', 'owner_id', 'is_active', 'target_posts_per_week', 'health_status_id', 'created_by_id', 'archived_at'], pageRows);
  const pages: Array<{ id: number; owner_id: number }> = await ds.query(`SELECT id, owner_id FROM fanpages WHERE url LIKE ? ORDER BY id`, [`https://${TAG_DOMAIN}/%`]);

  const ownerRows: unknown[][] = [];
  for (const p of pages) {
    ownerRows.push([p.id, p.owner_id]);
    if (rand() < 0.25) {
      const other = staff[Math.floor(rand() * staff.length)];
      if (other !== p.owner_id) ownerRows.push([p.id, other]);
    }
  }
  await insertChunks(ds, 'fanpage_owners', ['fanpage_id', 'user_id'], ownerRows);

  // Bài đăng: ngày lệch về gần đây (≈ 150 ngày), 3% không có ngày, ~60% có số liệu tương tác.
  const postRows: unknown[][] = [];
  for (let i = 1; i <= args.posts; i++) {
    const p = pages[Math.floor(rand() * pages.length)];
    const noDate = rand() < 0.03;
    const daysAgo = Math.floor(Math.pow(rand(), 1.6) * 150);
    const withMetrics = rand() < 0.6;
    postRows.push([
      p.id, `Bài ${i}`, `https://${TAG_DOMAIN}/p/${p.id}/${i}`, noDate ? null : addDays(today, -daysAgo),
      withMetrics ? Math.floor(rand() * 500) : null, withMetrics ? Math.floor(rand() * 80) : null, withMetrics ? Math.floor(rand() * 30) : null,
      types[i % types.length], rand() < 0.8 ? p.owner_id : staff[Math.floor(rand() * staff.length)],
    ]);
  }
  await insertChunks(ds, 'fanpage_posts', ['fanpage_id', 'title', 'url', 'posted_date', 'likes', 'comments', 'shares', 'post_type_id', 'created_by_id'], postRows);

  // Snapshot: mỗi Page ~12 lần nhập (mỗi tuần), follower tăng dần.
  const snapRows: unknown[][] = [];
  for (const p of pages) {
    let followers = 1000 + Math.floor(rand() * 20000);
    for (let w = 11; w >= 0; w--) {
      if (rand() < 0.15) continue;
      followers += Math.floor(rand() * 200);
      snapRows.push([p.id, addDays(today, -w * 7), followers, Math.floor(followers * rand()), Math.floor(followers * rand() * 0.1), p.owner_id]);
    }
  }
  await insertChunks(ds, 'fanpage_metric_snapshots', ['fanpage_id', 'snapshot_date', 'followers', 'reach', 'engagement', 'created_by_id'], snapRows);

  console.log(`🌱 Seed xong trong ${((Date.now() - t0) / 1000).toFixed(1)}s: ${pages.length} Page, ${args.posts} bài, ${snapRows.length} snapshot, ${ownerRows.length} dòng người phụ trách.`);
  return { rootId };
}

interface Measure {
  name: string;
  ms: number[];
  queries: number[];
  rows?: number;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  assertSafeTarget();

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const ds = app.get(DataSource);

  try {
    if (args.cleanup) {
      await cleanup(ds);
      return;
    }
    const { rootId } = await seed(ds, args);
    const caller: FanpageCaller & { name?: string } = { id: rootId, role: 'admin', isRootAdmin: true, departmentId: null, positionId: null, name: 'Perf Root' };

    const fanpages = app.get(FanpagesService);
    const overview = app.get(FanpageOverviewService);
    const today = app.get(FanpageTodayService);
    const stats = app.get(FanpageStatsService);
    const rankings = app.get(FanpageRankingsService);
    const exporter = app.get(FanpageExportService);

    let counter = 0;
    const original = ds.logger;
    ds.logger = {
      logQuery: () => { counter++; },
      logQueryError: (...a: unknown[]) => original.logQueryError(...(a as Parameters<typeof original.logQueryError>)),
      logQuerySlow: () => undefined,
      logSchemaBuild: () => undefined,
      logMigration: () => undefined,
      log: () => undefined,
    };

    const cases: Array<[string, () => Promise<unknown>, (r: unknown) => number | undefined]> = [
      ['GET /fanpages (list, scope all)', () => fanpages.list(caller, {} as never), (r) => (r as unknown[]).length],
      ['GET /fanpages/overview', () => overview.overview(caller), (r) => (r as { totalPages: number }).totalPages],
      ['GET /fanpages/today', () => today.today(caller), undefined as never],
      ['badge fanpageToDo (countNeedAction)', () => today.countNeedAction(caller), undefined as never],
      ['GET /fanpages/stats/growth', () => stats.growth(caller, {} as never), undefined as never],
      ['GET /fanpages/stats/posts', () => stats.posts(caller, {} as never), undefined as never],
      ['GET /fanpages/stats/top-posts', () => stats.topPosts(caller, {} as never), undefined as never],
      ['GET /fanpages/stats/rankings', () => rankings.rankings(caller, {} as never), undefined as never],
      ['GET /fanpages/export (buildModel)', () => exporter.buildModel(caller, {} as never), undefined as never],
    ];

    const results: Measure[] = [];
    for (const [name, fn, rowsOf] of cases) {
      const m: Measure = { name, ms: [], queries: [] };
      for (let i = 0; i < args.runs + 1; i++) {
        counter = 0;
        const t = process.hrtime.bigint();
        const res = await fn();
        const ms = Number(process.hrtime.bigint() - t) / 1e6;
        if (i === 0) continue; // lần đầu = khởi động pool/cache, bỏ khỏi thống kê
        m.ms.push(ms);
        m.queries.push(counter);
        if (rowsOf) m.rows = rowsOf(res);
      }
      results.push(m);
    }
    ds.logger = original;

    const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
    console.log(`\nMôi trường: ${args.pages} Page · ${args.posts} bài · ${args.runs} lần đo (bỏ lần khởi động) · caller = Root Admin (scope all)\n`);
    console.log('| Endpoint | min (ms) | median (ms) | max (ms) | số truy vấn |');
    console.log('|---|---:|---:|---:|---:|');
    for (const m of results) {
      console.log(`| ${m.name} | ${Math.min(...m.ms).toFixed(0)} | ${med(m.ms).toFixed(0)} | ${Math.max(...m.ms).toFixed(0)} | ${med(m.queries)} |`);
    }
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
