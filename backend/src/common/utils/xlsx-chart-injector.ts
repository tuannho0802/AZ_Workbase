/**
 * [PLAN_WITHDRAWAL_LEAVE_EXPORT - L1] Chèn BIỂU ĐỒ GỐC (chart Excel sửa được) vào file .xlsx do `exceljs` ghi.
 *
 * `exceljs` không có API chart. Cách làm: sau khi `workbook.xlsx.writeBuffer()`, mở zip bằng `jszip`
 * (dependency của exceljs) và thêm các part OOXML:
 *   xl/charts/chartN.xml, xl/drawings/drawingN.xml (+ _rels), <drawing r:id> trong sheet XML,
 *   quan hệ trong xl/worksheets/_rels/sheetN.xml.rels và Override trong [Content_Types].xml.
 * Chart tham chiếu THẲNG vùng ô trên sheet (`'Sheet'!$B$2:$B$10`) => sửa số trong Excel thì chart đổi theo.
 * Kèm cache (strCache/numCache) để trình xem không tính lại (LibreOffice, preview) vẫn vẽ đúng.
 *
 * Không dùng canvas/dịch vụ ngoài. Nạp `jszip` lười (như `exceljs-loader`) để không tốn CPU khi cold start.
 * Thứ tự phần tử XML bám đúng ECMA-376 (Excel rất nghiêm: sai thứ tự = "file bị hỏng").
 */
import type JSZipType from 'jszip';

export type ChartType = 'barStacked' | 'doughnut' | 'line';

export interface ChartSeries {
  /** Tên series (hiển thị ở legend). */
  name: string;
  /** Ô chứa tên series, A1 (vd `B1`) - sửa tên trong Excel thì legend đổi. */
  nameRef: string;
  /** Vùng giá trị, A1 (vd `B2:B10`). */
  valuesRef: string;
  /** Giá trị hiện tại (cache); `null` = ô trống. Độ dài phải bằng số hạng mục. */
  values: Array<number | null>;
  /** Màu hex 6 ký tự không có `#` (vd `2E7D32`). Bỏ trống = để Excel tự chọn. Donut dùng `pointColors`. */
  color?: string;
}

export interface ChartSpec {
  type: ChartType;
  title: string;
  /** Tên sheet CHỨA dữ liệu (cũng là sheet đặt chart). */
  sheetName: string;
  /** Vùng nhãn hạng mục, A1 (vd `A2:A10`). */
  categoriesRef: string;
  categories: string[];
  series: ChartSeries[];
  /** Donut: màu từng lát (hex 6 ký tự). */
  pointColors?: string[];
  /** Vị trí đặt chart (chỉ số 0-based, `to` không gồm): cột/hàng trái-trên → phải-dưới. */
  anchor: { fromCol: number; fromRow: number; toCol: number; toRow: number };
}

const NS_C = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_R =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_XDR =
  'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';
const NS_PKG_REL =
  'http://schemas.openxmlformats.org/package/2006/relationships';
const REL_DRAWING = `${NS_R}/drawing`;
const REL_CHART = `${NS_R}/chart`;
const CT_DRAWING = 'application/vnd.openxmlformats-officedocument.drawing+xml';
const CT_CHART =
  'application/vnd.openxmlformats-officedocument.drawingml.chart+xml';
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

const CELL_RE = /^\$?([A-Z]{1,3})\$?(\d+)$/;
const RANGE_RE = /^\$?([A-Z]{1,3})\$?(\d+):\$?([A-Z]{1,3})\$?(\d+)$/;
const HEX6_RE = /^[0-9A-Fa-f]{6}$/;

export function loadJSZip(): typeof JSZipType {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('jszip') as typeof JSZipType;
}

/** Escape text/attribute XML + loại ký tự điều khiển (XML 1.0 không cho phép, Excel báo hỏng file). */
export function xmlEscape(s: string): string {
  return (
    String(s)
      // eslint-disable-next-line no-control-regex -- cố ý: loại ký tự điều khiển cấm trong XML 1.0
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  );
}

function xmlUnescape(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h) =>
      String.fromCodePoint(parseInt(h, 16)),
    )
    .replace(/&amp;/g, '&');
}

/** `B2` -> `$B$2`, `B2:B10` -> `$B$2:$B$10`. Throw nếu sai định dạng (tránh sinh chart tham chiếu hỏng). */
export function toAbsoluteRef(ref: string): string {
  const r = RANGE_RE.exec(ref);
  if (r) return `$${r[1]}$${r[2]}:$${r[3]}$${r[4]}`;
  const c = CELL_RE.exec(ref);
  if (c) return `$${c[1]}$${c[2]}`;
  throw new Error(`Tham chiếu ô không hợp lệ: "${ref}"`);
}

/** Tên sheet trong công thức: luôn bọc '...' và nhân đôi dấu nháy đơn (an toàn cho tên có dấu cách/tiếng Việt). */
export function quoteSheetName(name: string): string {
  return `'${name.replace(/'/g, "''")}'`;
}

function sheetRef(sheetName: string, ref: string): string {
  return `${quoteSheetName(sheetName)}!${toAbsoluteRef(ref)}`;
}

function fill(color?: string): string {
  if (!color) return '';
  if (!HEX6_RE.test(color)) throw new Error(`Màu không hợp lệ: "${color}"`);
  return `<c:spPr><a:solidFill><a:srgbClr val="${color.toUpperCase()}"/></a:solidFill></c:spPr>`;
}

function lineFill(color?: string): string {
  if (!color) return '';
  if (!HEX6_RE.test(color)) throw new Error(`Màu không hợp lệ: "${color}"`);
  const c = color.toUpperCase();
  return `<c:spPr><a:ln w="28575" cap="rnd"><a:solidFill><a:srgbClr val="${c}"/></a:solidFill><a:round/></a:ln></c:spPr>`;
}

function strRef(formula: string, values: string[]): string {
  const pts = values
    .map((v, i) => `<c:pt idx="${i}"><c:v>${xmlEscape(v)}</c:v></c:pt>`)
    .join('');
  return `<c:strRef><c:f>${xmlEscape(formula)}</c:f><c:strCache><c:ptCount val="${values.length}"/>${pts}</c:strCache></c:strRef>`;
}

function numRef(formula: string, values: Array<number | null>): string {
  const pts = values
    .map((v, i) =>
      v === null || v === undefined || !Number.isFinite(v)
        ? ''
        : `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`,
    )
    .join('');
  return `<c:numRef><c:f>${xmlEscape(formula)}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${values.length}"/>${pts}</c:numCache></c:numRef>`;
}

function validate(spec: ChartSpec): void {
  if (!spec.series.length) throw new Error('Chart cần ít nhất 1 series');
  if (spec.type === 'doughnut' && spec.series.length !== 1)
    throw new Error('Donut chỉ nhận đúng 1 series');
  for (const s of spec.series) {
    if (s.values.length !== spec.categories.length) {
      throw new Error(
        `Series "${s.name}": ${s.values.length} giá trị nhưng có ${spec.categories.length} hạng mục`,
      );
    }
  }
  const a = spec.anchor;
  if (
    !(
      a.toCol > a.fromCol &&
      a.toRow > a.fromRow &&
      a.fromCol >= 0 &&
      a.fromRow >= 0
    )
  ) {
    throw new Error('anchor không hợp lệ');
  }
}

function seriesXml(spec: ChartSpec, s: ChartSeries, i: number): string {
  const tx = `<c:tx>${strRef(sheetRef(spec.sheetName, s.nameRef), [s.name])}</c:tx>`;
  const cat = `<c:cat>${strRef(sheetRef(spec.sheetName, spec.categoriesRef), spec.categories)}</c:cat>`;
  const val = `<c:val>${numRef(sheetRef(spec.sheetName, s.valuesRef), s.values)}</c:val>`;
  const head = `<c:idx val="${i}"/><c:order val="${i}"/>${tx}`;

  if (spec.type === 'barStacked') {
    return `<c:ser>${head}${fill(s.color)}<c:invertIfNegative val="0"/>${cat}${val}</c:ser>`;
  }
  if (spec.type === 'line') {
    const marker =
      '<c:marker><c:symbol val="circle"/><c:size val="5"/></c:marker>';
    return `<c:ser>${head}${lineFill(s.color)}${marker}${cat}${val}<c:smooth val="0"/></c:ser>`;
  }
  // doughnut: màu theo từng lát (dPt)
  const dpts = spec.categories
    .map((_c, idx) => {
      const color = spec.pointColors?.[idx];
      return color
        ? `<c:dPt><c:idx val="${idx}"/><c:bubble3D val="0"/>${fill(color)}</c:dPt>`
        : '';
    })
    .join('');
  const dLbls =
    '<c:dLbls><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr><c:showLegendKey val="0"/><c:showVal val="0"/>' +
    '<c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/><c:showLeaderLines val="1"/></c:dLbls>';
  return `<c:ser>${head}${dpts}${dLbls}${cat}${val}</c:ser>`;
}

const AX_CAT = 50010;
const AX_VAL = 50020;

function axesXml(): string {
  return (
    `<c:catAx><c:axId val="${AX_CAT}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/>` +
    `<c:axPos val="b"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/>` +
    `<c:tickLblPos val="nextTo"/><c:crossAx val="${AX_VAL}"/><c:crosses val="autoZero"/><c:auto val="1"/>` +
    `<c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>` +
    `<c:valAx><c:axId val="${AX_VAL}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/>` +
    `<c:axPos val="l"/><c:majorGridlines/><c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="out"/>` +
    `<c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="${AX_CAT}"/><c:crosses val="autoZero"/>` +
    `<c:crossBetween val="between"/></c:valAx>`
  );
}

/** XML của 1 part `xl/charts/chartN.xml`. Export riêng để unit test/kiểm tra XSD. */
export function buildChartXml(spec: ChartSpec): string {
  validate(spec);
  const sers = spec.series.map((s, i) => seriesXml(spec, s, i)).join('');
  let plot: string;
  if (spec.type === 'barStacked') {
    plot =
      `<c:barChart><c:barDir val="col"/><c:grouping val="stacked"/><c:varyColors val="0"/>${sers}` +
      `<c:gapWidth val="60"/><c:overlap val="100"/><c:axId val="${AX_CAT}"/><c:axId val="${AX_VAL}"/></c:barChart>${axesXml()}`;
  } else if (spec.type === 'line') {
    plot =
      `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${sers}` +
      `<c:marker val="1"/><c:axId val="${AX_CAT}"/><c:axId val="${AX_VAL}"/></c:lineChart>${axesXml()}`;
  } else {
    plot = `<c:doughnutChart><c:varyColors val="1"/>${sers}<c:firstSliceAng val="0"/><c:holeSize val="55"/></c:doughnutChart>`;
  }

  const title =
    `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1400" b="1"/></a:pPr>` +
    `<a:r><a:rPr lang="vi-VN" sz="1400" b="1"/><a:t>${xmlEscape(spec.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`;

  return (
    XML_HEAD +
    `<c:chartSpace xmlns:c="${NS_C}" xmlns:a="${NS_A}" xmlns:r="${NS_R}"><c:roundedCorners val="0"/>` +
    `<c:chart>${title}<c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>${plot}</c:plotArea>` +
    `<c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>` +
    `</c:chartSpace>`
  );
}

function buildDrawingXml(specs: ChartSpec[]): string {
  const anchors = specs
    .map((spec, i) => {
      const a = spec.anchor;
      const pos = (c: number, r: number) =>
        `<xdr:col>${c}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${r}</xdr:row><xdr:rowOff>0</xdr:rowOff>`;
      return (
        `<xdr:twoCellAnchor><xdr:from>${pos(a.fromCol, a.fromRow)}</xdr:from><xdr:to>${pos(a.toCol, a.toRow)}</xdr:to>` +
        `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${i + 2}" name="Chart ${i + 1}"/><xdr:cNvGraphicFramePr/>` +
        `</xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic>` +
        `<a:graphicData uri="${NS_C}"><c:chart xmlns:c="${NS_C}" xmlns:r="${NS_R}" r:id="rId${i + 1}"/></a:graphicData></a:graphic>` +
        `</xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`
      );
    })
    .join('');
  return (
    XML_HEAD +
    `<xdr:wsDr xmlns:xdr="${NS_XDR}" xmlns:a="${NS_A}">${anchors}</xdr:wsDr>`
  );
}

function relsXml(
  rels: Array<{ id: string; type: string; target: string }>,
): string {
  const body = rels
    .map(
      (r) =>
        `<Relationship Id="${r.id}" Type="${r.type}" Target="${xmlEscape(r.target)}"/>`,
    )
    .join('');
  return (
    XML_HEAD + `<Relationships xmlns="${NS_PKG_REL}">${body}</Relationships>`
  );
}

/** Map tên sheet -> đường dẫn part (vd `xl/worksheets/sheet1.xml`) từ workbook.xml + workbook.xml.rels. */
async function mapSheetPaths(zip: JSZipType): Promise<Map<string, string>> {
  const wb = await zip.file('xl/workbook.xml')?.async('string');
  const rels = await zip.file('xl/_rels/workbook.xml.rels')?.async('string');
  if (!wb || !rels)
    throw new Error('File xlsx thiếu workbook.xml hoặc workbook.xml.rels');

  const relTarget = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const tag = m[0];
    const id = /\bId="([^"]*)"/.exec(tag)?.[1];
    const target = /\bTarget="([^"]*)"/.exec(tag)?.[1];
    if (id && target) relTarget.set(id, target);
  }

  const out = new Map<string, string>();
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const tag = m[0];
    const name = /\bname="([^"]*)"/.exec(tag)?.[1];
    const rid = /\br:id="([^"]*)"/.exec(tag)?.[1];
    const target = rid ? relTarget.get(rid) : undefined;
    if (name && target) {
      const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
      out.set(xmlUnescape(name), path);
    }
  }
  return out;
}

function nextFreeIndex(zip: JSZipType, prefix: string): number {
  let max = 0;
  zip.forEach((p) => {
    if (p.startsWith(prefix)) {
      const n = Number(/(\d+)\.xml$/.exec(p)?.[1] ?? 0);
      if (n > max) max = n;
    }
  });
  return max + 1;
}

/** Chèn `<drawing r:id="..."/>` đúng vị trí theo schema (trước legacyDrawing/tableParts/extLst, nếu không có thì cuối). */
function insertDrawingTag(sheetXml: string, rId: string): string {
  if (/<drawing\b/.test(sheetXml)) {
    throw new Error(
      'Sheet đã có drawing (ảnh/chart) - injector chưa hỗ trợ gộp',
    );
  }
  const tag = `<drawing xmlns:r="${NS_R}" r:id="${rId}"/>`;
  const m =
    /<(legacyDrawing|legacyDrawingHF|picture|oleObjects|controls|webPublishItems|tableParts|extLst)\b/.exec(
      sheetXml,
    );
  if (m && m.index !== undefined)
    return sheetXml.slice(0, m.index) + tag + sheetXml.slice(m.index);
  const end = sheetXml.lastIndexOf('</worksheet>');
  if (end < 0) throw new Error('sheet XML không hợp lệ (thiếu </worksheet>)');
  return sheetXml.slice(0, end) + tag + sheetXml.slice(end);
}

/** Thêm 1 relationship vào file .rels (tạo mới nếu chưa có), trả về rId mới. */
function addSheetRel(
  existing: string | undefined,
  type: string,
  target: string,
): { xml: string; rId: string } {
  if (!existing) {
    return { xml: relsXml([{ id: 'rId1', type, target }]), rId: 'rId1' };
  }
  const ids = [...existing.matchAll(/\bId="rId(\d+)"/g)].map((m) =>
    Number(m[1]),
  );
  const rId = `rId${(ids.length ? Math.max(...ids) : 0) + 1}`;
  const rel = `<Relationship Id="${rId}" Type="${type}" Target="${xmlEscape(target)}"/>`;
  const end = existing.lastIndexOf('</Relationships>');
  if (end < 0) throw new Error('sheet rels không hợp lệ');
  return { xml: existing.slice(0, end) + rel + existing.slice(end), rId };
}

/**
 * Chèn các chart vào file xlsx (Buffer do `exceljs` ghi) và trả Buffer mới. Chart được nhóm theo `sheetName`;
 * mỗi sheet có đúng 1 drawing chứa mọi chart của sheet đó. `charts` rỗng -> trả nguyên buffer gốc.
 */
export async function injectCharts(
  xlsx: Buffer,
  charts: ChartSpec[],
): Promise<Buffer> {
  if (charts.length === 0) return xlsx;
  charts.forEach(validate);

  const JSZip = loadJSZip();
  const zip = await JSZip.loadAsync(xlsx);
  const sheetPaths = await mapSheetPaths(zip);

  const bySheet = new Map<string, ChartSpec[]>();
  for (const c of charts) {
    if (!sheetPaths.has(c.sheetName))
      throw new Error(`Không tìm thấy sheet "${c.sheetName}" trong file`);
    bySheet.set(c.sheetName, [...(bySheet.get(c.sheetName) ?? []), c]);
  }

  let contentTypes = await zip.file('[Content_Types].xml')?.async('string');
  if (!contentTypes) throw new Error('File xlsx thiếu [Content_Types].xml');
  const overrides: string[] = [];

  for (const [sheetName, specs] of bySheet) {
    const sheetPath = sheetPaths.get(sheetName) as string;
    const drawingIdx = nextFreeIndex(zip, 'xl/drawings/drawing');
    const drawingPath = `xl/drawings/drawing${drawingIdx}.xml`;

    const drawingRels: Array<{ id: string; type: string; target: string }> = [];
    for (let i = 0; i < specs.length; i++) {
      const chartIdx = nextFreeIndex(zip, 'xl/charts/chart');
      const chartPath = `xl/charts/chart${chartIdx}.xml`;
      zip.file(chartPath, buildChartXml(specs[i]));
      overrides.push(
        `<Override PartName="/${chartPath}" ContentType="${CT_CHART}"/>`,
      );
      drawingRels.push({
        id: `rId${i + 1}`,
        type: REL_CHART,
        target: `../charts/chart${chartIdx}.xml`,
      });
    }
    zip.file(drawingPath, buildDrawingXml(specs));
    zip.file(
      `xl/drawings/_rels/drawing${drawingIdx}.xml.rels`,
      relsXml(drawingRels),
    );
    overrides.push(
      `<Override PartName="/${drawingPath}" ContentType="${CT_DRAWING}"/>`,
    );

    const sheetFileName = sheetPath.split('/').pop() as string;
    const relsPath = `xl/worksheets/_rels/${sheetFileName}.rels`;
    const existingRels = await zip.file(relsPath)?.async('string');
    const { xml: newRels, rId } = addSheetRel(
      existingRels,
      REL_DRAWING,
      `../drawings/drawing${drawingIdx}.xml`,
    );
    zip.file(relsPath, newRels);

    const sheetXml = await zip.file(sheetPath)?.async('string');
    if (!sheetXml) throw new Error(`Thiếu part ${sheetPath}`);
    zip.file(sheetPath, insertDrawingTag(sheetXml, rId));
  }

  const end = contentTypes.lastIndexOf('</Types>');
  if (end < 0) throw new Error('[Content_Types].xml không hợp lệ');
  contentTypes =
    contentTypes.slice(0, end) + overrides.join('') + contentTypes.slice(end);
  zip.file('[Content_Types].xml', contentTypes);

  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
