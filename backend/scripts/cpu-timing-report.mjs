#!/usr/bin/env node
/**
 * Xếp hạng CPU theo route từ log `[CpuTiming]` (bật bằng env CPU_TIMING=true trên Vercel).
 *
 * Dùng:  node scripts/cpu-timing-report.mjs <file-log | -> [--top 20] [--exclude HEAD,OPTIONS] [--csv out.csv] [--solo]
 *   --solo: chỉ tính dòng có `inflight=1` (request chạy một mình, cpu đáng tin; cần log sinh bởi bản có Mục 12I).
 * Chỉ tìm chuỗi `cpu=12.3ms wall=140ms GET /api/customers/:id 200` nên không phụ thuộc định dạng
 * file log (text/JSON/CSV đều được). Không cần thư viện ngoài.
 *
 * ⚠ `process.cpuUsage()` tính cho CẢ process: request chạy song song trên cùng instance bị lẫn CPU
 * của nhau -> chỉ dùng SO SÁNH TƯƠNG ĐỐI giữa các route; mẫu càng lớn (vài giờ) càng đáng tin.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const file = args.find((a, i) => (a === '-' || !a.startsWith('--')) && !(i > 0 && args[i - 1].startsWith('--')));
if (!file) {
  console.error('Thiếu file log. Ví dụ: node scripts/cpu-timing-report.mjs vercel-logs.txt --top 20');
  process.exit(1);
}
const top = Number(opt('--top', 20));
const exclude = new Set(opt('--exclude', 'OPTIONS').split(',').filter(Boolean).map((s) => s.toUpperCase()));
const csvOut = opt('--csv', null);

let text;
try {
  text = readFileSync(file === '-' ? 0 : file, 'utf8');
} catch (err) {
  if (err.code === 'ENOENT') {
    console.error(`Không tìm thấy file log: ${file}`);
    console.error('Hãy lưu log từ Vercel (Project -> Logs -> lọc "CpuTiming" -> copy/export) vào 1 file rồi truyền ĐÚNG đường dẫn file đó.');
    console.error('Thử script bằng log mẫu: dán vài dòng dạng `[CpuTiming] cpu=12.3ms wall=140ms GET /api/users/me 200` vào file .txt.');
    process.exit(1);
  }
  throw err;
}
// [Mục 12I] `inflight=N up=Ns` là tuỳ chọn (log cũ không có) -> vẫn khớp.
const RE = /cpu=([\d.]+)ms\s+wall=([\d.]+)ms\s+([A-Z]+)\s+(\S+)\s+(\d{3})(?:\s+inflight=(\d+)\s+up=(\d+)s)?/g;
const solo = args.includes('--solo'); // chỉ tính request chạy một mình (inflight=1) -> cpu không bị lẫn request khác

const routes = new Map();
let total = 0;
let skipped = 0;
for (const m of text.matchAll(RE)) {
  const [, cpu, wall, method, path, status, inflight] = m;
  if (exclude.has(method) || (solo && inflight !== '1')) {
    skipped++;
    continue;
  }
  const key = `${method} ${path.split('?')[0]}`;
  const r = routes.get(key) ?? { n: 0, cpu: [], wall: 0, status: new Map() };
  r.n++;
  r.cpu.push(Number(cpu));
  r.wall += Number(wall);
  r.status.set(status, (r.status.get(status) ?? 0) + 1);
  routes.set(key, r);
  total += Number(cpu);
}

const pct = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};
const rows = [...routes.entries()]
  .map(([route, r]) => {
    const sum = r.cpu.reduce((a, b) => a + b, 0);
    return {
      route,
      n: r.n,
      sum,
      share: total ? (sum / total) * 100 : 0,
      avg: sum / r.n,
      p95: pct(r.cpu, 95),
      max: Math.max(...r.cpu),
      status: [...r.status].map(([s, c]) => `${s}×${c}`).join(' '),
    };
  })
  .sort((a, b) => b.sum - a.sum);

if (!rows.length) {
  console.error('Không tìm thấy dòng [CpuTiming] nào. Kiểm tra CPU_TIMING=true và bộ lọc log.');
  process.exit(2);
}

const n = rows.reduce((a, r) => a + r.n, 0);
console.log(`Tổng: ${n} request${skipped ? ` (bỏ qua ${skipped} request ${[...exclude, ...(solo ? ["không chạy một mình"] : [])].join("/")})` : ''}, CPU cộng dồn ${(total / 1000).toFixed(2)}s\n`);
console.log('#  Route'.padEnd(54) + 'Số lần  CPU tổng(ms)      %   TB(ms)  p95(ms)  Max(ms)  Status');
rows.slice(0, top).forEach((r, i) => {
  console.log(
    `${String(i + 1).padStart(2)} ${r.route.padEnd(50)}${String(r.n).padStart(6)}${r.sum.toFixed(1).padStart(14)}${r.share.toFixed(1).padStart(7)}${r.avg.toFixed(1).padStart(9)}${r.p95.toFixed(1).padStart(9)}${r.max.toFixed(1).padStart(9)}  ${r.status}`,
  );
});

const most = [...rows].sort((a, b) => b.n - a.n)[0];
const heavy = rows.filter((r) => r.n >= 3).sort((a, b) => b.avg - a.avg)[0];
console.log('\nGợi ý đọc:');
console.log(`- Gọi NHIỀU nhất: ${most.route} (${most.n} lần) -> giảm tần suất (poll/idle, gộp request, cache).`);
if (heavy) console.log(`- Nặng nhất MỖI LẦN (>=3 mẫu): ${heavy.route} (TB ${heavy.avg.toFixed(1)}ms) -> tối ưu handler/query.`);
console.log(`- Chiếm CPU nhiều nhất: ${rows[0].route} (${rows[0].share.toFixed(1)}%).`);
if (n < 200) console.log(`- ⚠ Mới ${n} mẫu - quá ít để kết luận, nên gom log 1–2 giờ.`);

if (csvOut) {
  const head = 'route,count,cpu_total_ms,share_pct,avg_ms,p95_ms,max_ms,status\n';
  writeFileSync(csvOut, head + rows.map((r) => [`"${r.route}"`, r.n, r.sum.toFixed(1), r.share.toFixed(1), r.avg.toFixed(1), r.p95.toFixed(1), r.max.toFixed(1), `"${r.status}"`].join(',')).join('\n') + '\n');
  console.log(`\nĐã ghi ${csvOut}`);
}
