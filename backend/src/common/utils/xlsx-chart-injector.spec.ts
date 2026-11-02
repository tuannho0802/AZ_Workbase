import { loadExcelJS } from './exceljs-loader';
import {
  ChartSpec,
  buildChartXml,
  injectCharts,
  loadJSZip,
  quoteSheetName,
  toAbsoluteRef,
  xmlEscape,
} from './xlsx-chart-injector';

const bar = (over: Partial<ChartSpec> = {}): ChartSpec => ({
  type: 'barStacked',
  title: 'Đơn nghỉ theo nhân viên',
  sheetName: 'Tổng hợp',
  categoriesRef: 'A2:A4',
  categories: ['An', 'Bình', 'Chi'],
  series: [
    {
      name: 'Đã duyệt',
      nameRef: 'B1',
      valuesRef: 'B2:B4',
      values: [1, 2, 3],
      color: '2E7D32',
    },
    {
      name: 'Từ chối',
      nameRef: 'C1',
      valuesRef: 'C2:C4',
      values: [0, null, 1],
      color: 'C62828',
    },
  ],
  anchor: { fromCol: 0, fromRow: 6, toCol: 8, toRow: 24 },
  ...over,
});

const doughnut = (): ChartSpec => ({
  type: 'doughnut',
  title: 'Cơ cấu loại phép',
  sheetName: 'Tổng hợp',
  categoriesRef: 'G2:G3',
  categories: ['Phép năm', 'Nghỉ ốm'],
  series: [
    { name: 'Số đơn', nameRef: 'H1', valuesRef: 'H2:H3', values: [10, 5] },
  ],
  pointColors: ['1976D2', 'E64A19'],
  anchor: { fromCol: 9, fromRow: 6, toCol: 16, toRow: 24 },
});

const line = (sheetName = 'Tổng hợp'): ChartSpec => ({
  type: 'line',
  title: 'Xu hướng',
  sheetName,
  categoriesRef: 'A2:A3',
  categories: ['T1', 'T2'],
  series: [
    {
      name: 'Số đơn',
      nameRef: 'B1',
      valuesRef: 'B2:B3',
      values: [3, 4],
      color: '1976D2',
    },
  ],
  anchor: { fromCol: 0, fromRow: 30, toCol: 8, toRow: 48 },
});

async function makeBook(
  names: string[] = ['Tổng hợp'],
  withTable = false,
): Promise<Buffer> {
  const wb = new (loadExcelJS().Workbook)();
  for (const n of names) {
    const ws = wb.addWorksheet(n);
    ws.addRow(['Nhân viên', 'Đã duyệt', 'Từ chối']);
    ws.addRow(['An', 1, 0]);
    ws.addRow(['Bình', 2, 1]);
    ws.addRow(['Chi', 3, 1]);
    if (withTable) {
      ws.addTable({
        name: 'T1',
        ref: 'A1',
        columns: [
          { name: 'Nhân viên' },
          { name: 'Đã duyệt' },
          { name: 'Từ chối' },
        ],
        rows: [['An', 1, 0]],
      });
    }
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Parse XML strict + kiểm tra namespace bằng `saxes` (dependency của exceljs): thẻ không cân bằng/prefix lạ/ký tự cấm -> lỗi. */
function expectWellFormed(xml: string): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { SaxesParser } = require('saxes');
  const parser = new SaxesParser({ xmlns: true });
  let error: Error | undefined;
  parser.on('error', (e: Error) => {
    error = e;
  });
  parser.write(xml).close();
  expect(error?.message).toBeUndefined();
}

async function unzip(buf: Buffer) {
  return loadJSZip().loadAsync(buf);
}

describe('xlsx-chart-injector', () => {
  describe('helper', () => {
    it('toAbsoluteRef: ô và vùng; throw khi sai định dạng', () => {
      expect(toAbsoluteRef('B2')).toBe('$B$2');
      expect(toAbsoluteRef('B2:B10')).toBe('$B$2:$B$10');
      expect(toAbsoluteRef('$A$1:$C$3')).toBe('$A$1:$C$3');
      expect(() => toAbsoluteRef('B2:')).toThrow('không hợp lệ');
      expect(() => toAbsoluteRef("A1'!B1")).toThrow('không hợp lệ');
    });

    it("quoteSheetName: luôn bọc '...' và nhân đôi dấu nháy", () => {
      expect(quoteSheetName('Tổng hợp')).toBe("'Tổng hợp'");
      expect(quoteSheetName("NV's")).toBe("'NV''s'");
    });

    it('xmlEscape: ký tự đặc biệt + loại ký tự điều khiển', () => {
      expect(xmlEscape('a&b<c>"d"')).toBe('a&amp;b&lt;c&gt;&quot;d&quot;');
      expect(xmlEscape('x\u0001y\u000Bz')).toBe('xyz');
    });
  });

  describe('buildChartXml', () => {
    it('cột chồng: grouping stacked + overlap 100, 2 series, tham chiếu ô tuyệt đối có tên sheet quote', () => {
      const xml = buildChartXml(bar());
      expect(xml).toContain('<c:barDir val="col"/><c:grouping val="stacked"/>');
      expect(xml).toContain('<c:overlap val="100"/>');
      expect(xml.match(/<c:ser>/g)).toHaveLength(2);
      expect(xml).toContain("<c:f>'Tổng hợp'!$B$2:$B$4</c:f>");
      expect(xml).toContain("<c:f>'Tổng hợp'!$A$2:$A$4</c:f>");
      expect(xml).toContain("<c:f>'Tổng hợp'!$B$1</c:f>");
      expect(xml).toContain('<a:srgbClr val="2E7D32"/>');
    });

    it('cache: ô null bị bỏ qua nhưng ptCount vẫn đủ số hạng mục', () => {
      const xml = buildChartXml(bar());
      expect(xml).toContain(
        '<c:ptCount val="3"/><c:pt idx="0"><c:v>0</c:v></c:pt><c:pt idx="2"><c:v>1</c:v></c:pt>',
      );
      expect(xml).not.toContain('<c:pt idx="1"><c:v>null');
    });

    it('donut: dPt theo từng lát + % trên nhãn; đường: marker + smooth=0', () => {
      const d = buildChartXml(doughnut());
      expect(d).toContain('<c:doughnutChart>');
      expect(d.match(/<c:dPt>/g)).toHaveLength(2);
      expect(d).toContain('<c:showPercent val="1"/>');
      expect(d).not.toContain('<c:catAx>');
      const l = buildChartXml(line());
      expect(l).toContain('<c:lineChart>');
      expect(l).toContain('<c:marker><c:symbol val="circle"/>');
      expect(l).toContain('<c:smooth val="0"/>');
    });

    it('tên sheet có dấu nháy được nhân đôi; tiêu đề/nhãn được escape XML', () => {
      const xml = buildChartXml(
        bar({
          sheetName: "NV's",
          title: 'A & <B>',
          categories: ['X&Y', 'Z', 'W'],
        }),
      );
      expect(xml).toContain("<c:f>'NV''s'!$B$2:$B$4</c:f>");
      expect(xml).toContain('<a:t>A &amp; &lt;B&gt;</a:t>');
      expect(xml).toContain('<c:v>X&amp;Y</c:v>');
    });

    it('từ chối đầu vào sai: không series, donut >1 series, lệch độ dài, anchor sai, màu sai', () => {
      expect(() => buildChartXml(bar({ series: [] }))).toThrow(
        'ít nhất 1 series',
      );
      expect(() =>
        buildChartXml({
          ...doughnut(),
          series: [...doughnut().series, ...doughnut().series],
        }),
      ).toThrow('đúng 1 series');
      expect(() => buildChartXml(bar({ categories: ['An'] }))).toThrow(
        'hạng mục',
      );
      expect(() =>
        buildChartXml(
          bar({ anchor: { fromCol: 3, fromRow: 3, toCol: 3, toRow: 9 } }),
        ),
      ).toThrow('anchor');
      const bad = bar();
      bad.series[0].color = 'red';
      expect(() => buildChartXml(bad)).toThrow('Màu không hợp lệ');
    });

    it('kỳ rỗng (0 hạng mục) vẫn sinh XML hợp lệ, không throw', () => {
      const xml = buildChartXml({
        ...bar(),
        categories: [],
        categoriesRef: 'A2:A2',
        series: [
          { name: 'Đã duyệt', nameRef: 'B1', valuesRef: 'B2:B2', values: [] },
        ],
      });
      expect(xml).toContain('<c:ptCount val="0"/>');
    });
  });

  describe('injectCharts', () => {
    it('danh sách rỗng -> trả nguyên buffer gốc', async () => {
      const buf = await makeBook();
      expect(await injectCharts(buf, [])).toBe(buf);
    });

    it('thêm đủ part: chart, drawing, rels, Content_Types, <drawing> trong sheet', async () => {
      const out = await unzip(
        await injectCharts(await makeBook(), [bar(), doughnut()]),
      );
      const names = Object.keys(out.files);
      expect(names).toEqual(
        expect.arrayContaining([
          'xl/charts/chart1.xml',
          'xl/charts/chart2.xml',
          'xl/drawings/drawing1.xml',
          'xl/drawings/_rels/drawing1.xml.rels',
          'xl/worksheets/_rels/sheet1.xml.rels',
        ]),
      );
      const ct = await out.file('[Content_Types].xml')!.async('string');
      expect(ct).toContain(
        'PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"',
      );
      expect(ct).toContain(
        'PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"',
      );
      const sheet = await out.file('xl/worksheets/sheet1.xml')!.async('string');
      expect(sheet).toMatch(/<drawing xmlns:r="[^"]+" r:id="rId1"\/>/);
      const drawing = await out
        .file('xl/drawings/drawing1.xml')!
        .async('string');
      expect(drawing.match(/<xdr:twoCellAnchor>/g)).toHaveLength(2); // 2 chart cùng 1 drawing
      const drels = await out
        .file('xl/drawings/_rels/drawing1.xml.rels')!
        .async('string');
      expect(drels).toContain('Target="../charts/chart1.xml"');
      expect(drels).toContain('Target="../charts/chart2.xml"');
    });

    it('chart ở sheet thứ 2 (tên có dấu nháy) -> gắn đúng sheet2, không đụng sheet1', async () => {
      const out = await unzip(
        await injectCharts(await makeBook(['Tổng hợp', "Xu hướng's"]), [
          line("Xu hướng's"),
        ]),
      );
      const s1 = await out.file('xl/worksheets/sheet1.xml')!.async('string');
      const s2 = await out.file('xl/worksheets/sheet2.xml')!.async('string');
      expect(s1).not.toContain('<drawing');
      expect(s2).toContain('<drawing');
      expect(await out.file('xl/charts/chart1.xml')!.async('string')).toContain(
        "'Xu hướng''s'!$B$2:$B$3",
      );
    });

    it('sheet có Table: <drawing> đứng TRƯỚC <tableParts> (đúng thứ tự schema)', async () => {
      const out = await unzip(
        await injectCharts(await makeBook(['Tổng hợp'], true), [bar()]),
      );
      const sheet = await out.file('xl/worksheets/sheet1.xml')!.async('string');
      expect(sheet).toContain('<tableParts');
      expect(sheet.indexOf('<drawing')).toBeGreaterThan(-1);
      expect(sheet.indexOf('<drawing')).toBeLessThan(
        sheet.indexOf('<tableParts'),
      );
      // rels cũ của sheet (table) được giữ + thêm drawing với rId mới
      const rels = await out
        .file('xl/worksheets/_rels/sheet1.xml.rels')!
        .async('string');
      expect(rels).toContain('relationships/table');
      expect(rels).toContain('relationships/drawing');
      expect(
        new Set([...rels.matchAll(/Id="(rId\d+)"/g)].map((m) => m[1])).size,
      ).toBe(2);
    });

    it('exceljs đọc lại được file đã chèn chart và giữ nguyên dữ liệu ô', async () => {
      const out = await injectCharts(await makeBook(), [bar(), doughnut()]);
      const wb = new (loadExcelJS().Workbook)();
      await wb.xlsx.load(out as any);
      const ws = wb.getWorksheet('Tổng hợp')!;
      expect(ws.getCell('A2').value).toBe('An');
      expect(ws.getCell('B4').value).toBe(3);
    });

    it('mọi part XML sinh ra đều well-formed (không ký tự cấm, escape đúng)', async () => {
      const out = await unzip(
        await injectCharts(await makeBook(), [
          bar({ title: 'A & <B> \u0001' }),
          doughnut(),
          line(),
        ]),
      );
      for (const name of Object.keys(out.files).filter((n) =>
        /(charts|drawings)\/.*\.(xml|rels)$/.test(n),
      )) {
        const xml = await out.file(name)!.async('string');
        expect(xml).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/);
        expectWellFormed(xml);
      }
    });

    it('throw khi sheet không tồn tại hoặc sheet đã có drawing', async () => {
      await expect(
        injectCharts(await makeBook(), [bar({ sheetName: 'Không có' })]),
      ).rejects.toThrow('Không tìm thấy sheet');
      const once = await injectCharts(await makeBook(), [bar()]);
      await expect(injectCharts(once, [line()])).rejects.toThrow(
        'đã có drawing',
      );
    });
  });
});
