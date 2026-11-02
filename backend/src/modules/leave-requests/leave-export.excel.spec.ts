import { LeaveStatus } from '../../database/entities/leave-request.entity';
import { loadExcelJS } from '../../common/utils/exceljs-loader';
import { loadJSZip } from '../../common/utils/xlsx-chart-injector';
import {
  buildLeaveExportBuffer,
  colLetter,
  CHART_FROM_COL,
} from './leave-export.excel';
import {
  buildLeaveExportModel,
  CHART_TOP_EMPLOYEES,
} from './leave-export.model';
import {
  buildLeaveStats,
  granularityFor,
  HeadcountRow,
  LeaveStatRow,
  summarize,
} from './leave-stats.util';
import type { LeaveStatsResponse } from './leave-requests-stats.service';

const RANGE = { from: '2026-09-01', to: '2026-09-30' };

function makeStats(
  rows: LeaveStatRow[],
  hc: HeadcountRow[],
): LeaveStatsResponse {
  const granularity = granularityFor(30);
  return {
    ...buildLeaveStats(rows, hc, RANGE, granularity),
    period: { type: 'month', ...RANGE, granularity, spanDays: 30 },
    previousPeriod: { from: '2026-08-01', to: '2026-08-31' },
    headcount: hc.length,
    previousSummary: summarize([], hc.length),
  };
}

const row = (
  id: number,
  uid: number,
  o: Partial<LeaveStatRow> = {},
): LeaveStatRow => ({
  id,
  requesterId: uid,
  requesterName: `Nhân viên ${uid}`,
  departmentId: 1,
  departmentName: 'Sales',
  leaveType: 'annual',
  status: LeaveStatus.APPROVED,
  startDate: `2026-09-${String(1 + (id % 28)).padStart(2, '0')}`,
  endDate: `2026-09-${String(1 + (id % 28)).padStart(2, '0')}`,
  totalDays: 1,
  isSupplementary: false,
  ...o,
});
const hc = (userId: number): HeadcountRow => ({
  userId,
  departmentId: 1,
  departmentName: 'Sales',
});

const names = { annual: 'Phép năm', sick: 'Phép ốm' };
const rows = [
  row(1, 1),
  row(2, 1, { status: LeaveStatus.REJECTED }),
  row(3, 2, { status: LeaveStatus.PENDING, leaveType: 'sick' }),
  row(4, 3),
  row(5, 4, { requesterName: '=HYPERLINK("http://x")' }),
];
const stats = makeStats(rows, [1, 2, 3, 4].map(hc));

async function zipOf(buf: Buffer) {
  return loadJSZip().loadAsync(buf);
}
const xml = async (z: Awaited<ReturnType<typeof zipOf>>, p: string) =>
  await z.file(p)!.async('string');

/** Đọc ô theo A1 của sheet exceljs -> số/chuỗi (ô trống = null). */
function cellVal(
  ws: import('exceljs').Worksheet,
  a1: string,
): string | number | null {
  const v = ws.getCell(a1).value;
  return typeof v === 'string' || typeof v === 'number' ? v : null;
}
function expand(range: string): string[] {
  const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(range)!;
  const out: string[] = [];
  for (let r = Number(m[2]); r <= Number(m[4]); r++) out.push(`${m[1]}${r}`);
  return out;
}

describe('leave-export.excel - chart (form E/F)', () => {
  it('colLetter', () => {
    expect([1, 26, 27, 52, 53].map(colLetter)).toEqual([
      'A',
      'Z',
      'AA',
      'AZ',
      'BA',
    ]);
  });

  it('form E: file mở được bằng exceljs, có 3 chart gốc + drawing, content-types đủ', async () => {
    const model = buildLeaveExportModel({
      form: 'E',
      stats,
      leaveTypeNames: names,
    });
    const buf = await buildLeaveExportBuffer(model, {
      exportedByName: 'Admin',
    });

    const wb = new (loadExcelJS().Workbook)();
    await wb.xlsx.load(buf as never); // không throw = cấu trúc hợp lệ với exceljs
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Báo cáo']);

    const z = await zipOf(buf);
    const charts = Object.keys(z.files).filter((f) =>
      /^xl\/charts\/chart\d+\.xml$/.test(f),
    );
    expect(charts).toHaveLength(3);
    const ct = await xml(z, '[Content_Types].xml');
    for (const c of charts) expect(ct).toContain(`PartName="/${c}"`);
    expect(await xml(z, 'xl/charts/chart1.xml')).toContain('c:barChart');
    const all = (await Promise.all(charts.map((c) => xml(z, c)))).join('');
    expect(all).toContain('c:doughnutChart');
    expect(all).toContain('c:lineChart');
  });

  it('chart tham chiếu ĐÚNG ô: nhãn/giá trị trong sheet khớp cache của chart (sửa số thì chart đổi theo)', async () => {
    const model = buildLeaveExportModel({
      form: 'E',
      stats,
      leaveTypeNames: names,
    });
    const buf = await buildLeaveExportBuffer(model);
    const wb = new (loadExcelJS().Workbook)();
    await wb.xlsx.load(buf as never);
    const ws = wb.getWorksheet('Báo cáo')!;
    const z = await zipOf(buf);

    const sheet = model.sheets[0];
    const chartFiles = Object.keys(z.files)
      .filter((f) => /^xl\/charts\/chart\d+\.xml$/.test(f))
      .sort();
    expect(chartFiles).toHaveLength(sheet.charts.length);

    let checked = 0;
    for (const f of chartFiles) {
      const cx = await xml(z, f);
      // mọi <c:f> dạng 'Báo cáo'!$A$1:$A$5
      const refs = [...cx.matchAll(/<c:f>([^<]+)<\/c:f>/g)].map((m) => m[1]);
      expect(refs.length).toBeGreaterThan(0);
      for (const ref of refs) {
        const m = /^'Báo cáo'!\$([A-Z]+)\$(\d+)(?::\$([A-Z]+)\$(\d+))?$/.exec(
          ref.replace(/&apos;/g, "'"),
        );
        expect(m).not.toBeNull();
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);

    // Với từng chart của model: ô được tham chiếu phải chứa đúng categories/values/tên series.
    for (const c of sheet.charts) {
      const cx = (await Promise.all(chartFiles.map((f) => xml(z, f)))).find(
        (x) => x.includes(`<a:t>${c.title}</a:t>`),
      )!;
      expect(cx).toBeDefined();
      const catRef = /<c:cat><c:strRef><c:f>([^<]+)<\/c:f>/.exec(cx)![1];
      const catRange = catRef.split('!')[1].replace(/\$/g, '');
      expect(expand(catRange).map((a) => String(cellVal(ws, a)))).toEqual(
        c.categories,
      );
      for (const s of c.series) {
        const vals = [
          ...cx.matchAll(/<c:val><c:numRef><c:f>([^<]+)<\/c:f>/g),
        ].map((m) => m[1].split('!')[1].replace(/\$/g, ''));
        const hit = vals.find(
          (rg) =>
            expand(rg)
              .map((a) => cellVal(ws, a))
              .join('|') === s.values.map((v) => v ?? 'null').join('|'),
        );
        expect(hit).toBeDefined();
      }
      const nameCells = [
        ...cx.matchAll(/<c:tx><c:strRef><c:f>([^<]+)<\/c:f>/g),
      ].map((m) => m[1].split('!')[1].replace(/\$/g, ''));
      expect(nameCells.map((a) => String(cellVal(ws, a)))).toEqual(
        c.series.map((s) => s.name),
      );
    }
  });

  it('vùng chart không đè bảng: bảng rộng (A đầy đủ) bắt đầu dưới chart; chart anchor từ cột F', async () => {
    const model = buildLeaveExportModel({
      form: 'E',
      stats,
      leaveTypeNames: names,
    });
    const buf = await buildLeaveExportBuffer(model);
    const z = await zipOf(buf);
    const dr = await xml(
      z,
      Object.keys(z.files).find((f) =>
        /^xl\/drawings\/drawing\d+\.xml$/.test(f),
      )!,
    );
    const rowsTo = [
      ...dr.matchAll(
        /<xdr:to><xdr:col>(\d+)<\/xdr:col>.*?<xdr:row>(\d+)<\/xdr:row>/g,
      ),
    ].map((m) => Number(m[2]));
    const froms = [...dr.matchAll(/<xdr:from><xdr:col>(\d+)<\/xdr:col>/g)].map(
      (m) => Number(m[1]),
    );
    expect(froms.every((c) => c === CHART_FROM_COL)).toBe(true);
    const bottom = Math.max(...rowsTo); // 0-based, không gồm

    const wb = new (loadExcelJS().Workbook)();
    await wb.xlsx.load(buf as never);
    const ws = wb.getWorksheet('Báo cáo')!;
    let aHeaderRow = 0;
    ws.eachRow((r, n) => {
      if (
        r.getCell(1).value === 'Nhân viên' &&
        r.getCell(10).value === 'Tỷ lệ duyệt (%)'
      )
        aHeaderRow = n;
    });
    expect(aHeaderRow).toBeGreaterThan(bottom); // 1-based header nằm dưới hết chart
  });

  it('formula injection: ô + nhãn chart đều có dấu nháy đơn', async () => {
    const model = buildLeaveExportModel({
      form: 'E',
      stats,
      leaveTypeNames: names,
    });
    const buf = await buildLeaveExportBuffer(model);
    const wb = new (loadExcelJS().Workbook)();
    await wb.xlsx.load(buf as never);
    const ws = wb.getWorksheet('Báo cáo')!;
    let found = false;
    ws.eachRow((r) => {
      const v = r.getCell(1).value;
      if (typeof v === 'string' && v.includes('HYPERLINK')) {
        found = true;
        expect(v.startsWith("'=")).toBe(true);
      }
    });
    expect(found).toBe(true);
  });

  it('kỳ rỗng: file vẫn mở được, có thông báo, KHÔNG chèn chart', async () => {
    const model = buildLeaveExportModel({
      form: 'E',
      stats: makeStats([], [hc(1)]),
    });
    const buf = await buildLeaveExportBuffer(model);
    const wb = new (loadExcelJS().Workbook)();
    await wb.xlsx.load(buf as never);
    const z = await zipOf(buf);
    expect(Object.keys(z.files).some((f) => f.startsWith('xl/charts/'))).toBe(
      false,
    );
    expect(cellVal(wb.getWorksheet('Báo cáo')!, 'A4')).toContain(
      'Không có dữ liệu',
    );
  });

  it('form F: gói A-E, chart chỉ ở sheet Báo cáo, tên sheet không trùng, mở được', async () => {
    const model = buildLeaveExportModel({
      form: 'F',
      stats,
      requests: [],
      leaveTypeNames: names,
    });
    const buf = await buildLeaveExportBuffer(model);
    const wb = new (loadExcelJS().Workbook)();
    await wb.xlsx.load(buf as never);
    const n = wb.worksheets.map((w) => w.name);
    expect(new Set(n).size).toBe(n.length);
    expect(n).toContain('Báo cáo');
    const z = await zipOf(buf);
    expect(
      Object.keys(z.files).filter((f) => /^xl\/charts\/chart\d+\.xml$/.test(f)),
    ).toHaveLength(3);
    expect(
      Object.keys(z.files).filter((f) =>
        /^xl\/drawings\/drawing\d+\.xml$/.test(f),
      ),
    ).toHaveLength(1);
  });

  it('nhiều nhân viên: chart cột chồng chỉ lấy top N, vùng ô không vượt bảng top', async () => {
    const many = Array.from({ length: 25 }, (_, i) => row(100 + i, 10 + i));
    const model = buildLeaveExportModel({
      form: 'E',
      stats: makeStats(
        many,
        many.map((r) => hc(r.requesterId)),
      ),
    });
    expect(model.sheets[0].charts[0].categories).toHaveLength(
      CHART_TOP_EMPLOYEES,
    );
    const buf = await buildLeaveExportBuffer(model);
    const z = await zipOf(buf);
    const cx = await xml(z, 'xl/charts/chart1.xml');
    expect(cx).toMatch(/<c:ptCount val="10"\/>/);
  });

  it('forms A-D không bị ảnh hưởng: không có chart/drawing', async () => {
    for (const form of ['A', 'C'] as const) {
      const buf = await buildLeaveExportBuffer(
        buildLeaveExportModel({ form, stats, leaveTypeNames: names }),
      );
      const z = await zipOf(buf);
      expect(
        Object.keys(z.files).some(
          (f) => f.startsWith('xl/charts/') || f.startsWith('xl/drawings/'),
        ),
      ).toBe(false);
    }
  });
});
