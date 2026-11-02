import type * as ExcelJS from 'exceljs';
import { loadExcelJS } from '../../common/utils/exceljs-loader';
import { ChartSpec, injectCharts } from '../../common/utils/xlsx-chart-injector';
import type {
  ExportCell,
  ExportChartModel,
  ExportColumn,
  ExportModel,
  ExportSheet,
  ExportTable,
} from './leave-export.model';

/**
 * [PLAN_WITHDRAWAL_LEAVE_EXPORT - L3] Ghi `ExportModel` ra file .xlsx bằng exceljs. Preview (FE) và file
 * này cùng đọc 1 model => xem gì xuất nấy. Chỉ lo ĐỊNH DẠNG; mọi con số/chuỗi (đã chống formula
 * injection) do `buildLeaveExportModel` quyết định. Chart (form E/F, L5): chèn bằng xlsx-chart-injector sau khi
 * exceljs ghi xong; chart tham chiếu THẲNG vùng ô của bảng (sửa số trong Excel thì chart đổi theo).
 */

const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1677FF' } };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' } };
const TOTAL_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F5FF' } };
const THIN: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
  left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
  bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
  right: { style: 'thin', color: { argb: 'FFD9D9D9' } },
};
const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" -> "DD/MM/YYYY" (cắt chuỗi thuần, không dựng Date để khỏi dính lệch múi giờ). */
export function ymdToDmy(ymd: string): string {
  return YMD.test(ymd) ? ymd.split('-').reverse().join('/') : ymd;
}

function toExcelValue(cell: ExportCell, col: ExportColumn): ExcelJS.CellValue {
  if (cell === null || cell === undefined || cell === '') return null;
  if (col.type === 'date' && typeof cell === 'string' && YMD.test(cell)) {
    // Ngày thuần -> Date UTC 00:00 để Excel hiểu là ngày thật (lọc/sắp xếp được), numFmt dd/mm/yyyy.
    return new Date(`${cell}T00:00:00.000Z`);
  }
  return cell;
}

/** Vị trí thật của 1 bảng trên sheet (1-based) - để quy chart ra vùng ô. */
interface TablePlacement {
  headerRow: number;
  firstDataRow: number;
  rowCount: number;
}

/** 1 -> A, 26 -> Z, 27 -> AA. */
export function colLetter(n: number): string {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

/** Chart đặt ở cột F (0-based 5) trở đi; bảng rộng hơn mốc này phải nằm DƯỚI vùng chart để không đè nhau. */
export const CHART_FROM_COL = 5;
export const CHART_COLS = 9;
export const CHART_ROWS = 16;
export const CHART_GAP_ROWS = 1;
const CHART_FIRST_ROW = 3; // 0-based => dòng 4 của sheet

function writeTable(
  ws: ExcelJS.Worksheet,
  table: ExportTable,
  startRow: number,
  showTitle: boolean,
  placements: Map<string, TablePlacement>,
  applyFilter: boolean,
): number {
  let r = startRow;
  if (showTitle) {
    const t = ws.getRow(r++);
    t.getCell(1).value = table.title;
    t.getCell(1).font = { bold: true, size: 12 };
  }
  const headerRowNo = r;
  placements.set(table.id, { headerRow: headerRowNo, firstDataRow: headerRowNo + 1, rowCount: table.rows.length });
  const header = ws.getRow(r++);
  table.columns.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.header;
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.border = THIN;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  header.height = 28;

  for (const row of table.rows) {
    const xr = ws.getRow(r++);
    table.columns.forEach((c, i) => {
      const cell = xr.getCell(i + 1);
      cell.value = toExcelValue(row[i], c);
      cell.border = THIN;
      if (c.type === 'date') {
        cell.numFmt = 'dd/mm/yyyy';
        cell.alignment = { horizontal: 'center' };
      } else if (c.type === 'number') {
        cell.alignment = { horizontal: 'right' };
      }
    });
  }

  if (applyFilter && table.rows.length > 0) {
    ws.autoFilter = {
      from: { row: headerRowNo, column: 1 },
      to: { row: headerRowNo + table.rows.length, column: table.columns.length },
    };
  }

  if (table.totalsRow && table.rows.length > 0) {
    const xr = ws.getRow(r++);
    table.columns.forEach((c, i) => {
      const cell = xr.getCell(i + 1);
      cell.value = toExcelValue(table.totalsRow![i], c);
      cell.font = { bold: true };
      cell.fill = TOTAL_FILL;
      cell.border = THIN;
      if (c.type === 'number') cell.alignment = { horizontal: 'right' };
    });
  }

  if (table.note) {
    const n = ws.getRow(r++);
    n.getCell(1).value = table.note;
    n.getCell(1).font = { italic: true, color: { argb: 'FF8C8C8C' } };
  }
  return r;
}

/** Quy `ExportChartModel` (theo tableId/key cột) ra `ChartSpec` (vùng ô A1) của injector. */
export function toChartSpec(
  chart: ExportChartModel,
  sheet: ExportSheet,
  sheetName: string,
  placements: Map<string, TablePlacement>,
  index: number,
): ChartSpec {
  const t = sheet.tables.find((x) => x.id === chart.tableId);
  const pos = placements.get(chart.tableId);
  if (!t || !pos) throw new Error(`Chart "${chart.id}": không thấy bảng "${chart.tableId}" trên sheet "${sheet.name}"`);
  if (pos.rowCount !== chart.categories.length) {
    throw new Error(`Chart "${chart.id}": ${chart.categories.length} hạng mục nhưng bảng có ${pos.rowCount} dòng`);
  }
  const colOf = (key: string) => {
    const i = t.columns.findIndex((c) => c.key === key);
    if (i < 0) throw new Error(`Chart "${chart.id}": bảng "${t.id}" không có cột "${key}"`);
    return colLetter(i + 1);
  };
  const first = pos.firstDataRow;
  const last = pos.firstDataRow + pos.rowCount - 1;
  const range = (key: string) => `${colOf(key)}${first}:${colOf(key)}${last}`;
  const fromRow = CHART_FIRST_ROW + index * (CHART_ROWS + CHART_GAP_ROWS);
  return {
    type: chart.type,
    title: chart.title,
    sheetName,
    categoriesRef: range(chart.categoryKey),
    categories: chart.categories,
    series: chart.series.map((s) => ({
      name: s.name,
      nameRef: `${colOf(s.key)}${pos.headerRow}`,
      valuesRef: range(s.key),
      values: s.values,
      color: s.color,
    })),
    pointColors: chart.pointColors,
    anchor: { fromCol: CHART_FROM_COL, fromRow, toCol: CHART_FROM_COL + CHART_COLS, toRow: fromRow + CHART_ROWS },
  };
}

export interface LeaveExcelMeta {
  exportedByName?: string;
  generatedAtText?: string;
}

export async function buildLeaveExportBuffer(model: ExportModel, meta: LeaveExcelMeta = {}): Promise<Buffer> {
  const ExcelJSLib = loadExcelJS();
  const wb = new ExcelJSLib.Workbook();
  wb.creator = 'AZ Workbase';
  wb.created = new Date();

  const chartSpecs: ChartSpec[] = [];

  for (const sheet of model.sheets) {
    const ws = wb.addWorksheet(sheet.name);
    const placements = new Map<string, TablePlacement>();
    const title = ws.getRow(1);
    title.getCell(1).value = `Báo cáo nghỉ phép - ${model.title}`;
    title.getCell(1).font = { bold: true, size: 14 };
    ws.getRow(2).getCell(1).value =
      `Kỳ: ${ymdToDmy(model.period.from)} - ${ymdToDmy(model.period.to)}` +
      (meta.exportedByName ? `   |   Người xuất: ${meta.exportedByName}` : '') +
      (meta.generatedAtText ? `   |   Xuất lúc: ${meta.generatedAtText}` : '');
    ws.getRow(2).getCell(1).font = { color: { argb: 'FF595959' } };

    let r = 4;
    if (model.isEmpty && model.notice) {
      const n = ws.getRow(r++);
      n.getCell(1).value = model.notice;
      n.getCell(1).font = { italic: true, color: { argb: 'FFD46B08' } };
      r++;
    }

    // Độ rộng cột: lấy max theo mọi bảng trên sheet (các bảng xếp dọc cùng cột).
    const widths: number[] = [];
    for (const t of sheet.tables) {
      t.columns.forEach((c, i) => {
        widths[i] = Math.max(widths[i] ?? 10, c.width ?? 12);
      });
    }
    widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));

    // Vùng chart nằm bên phải (từ cột F); bảng nào rộng hơn mốc đó phải bắt đầu sau khi hết vùng chart.
    const chartBottomRow = sheet.charts.length
      ? CHART_FIRST_ROW + sheet.charts.length * (CHART_ROWS + CHART_GAP_ROWS) + 1 // 1-based, chừa 1 dòng trống
      : 0;

    // Sheet có chart: in ngang, vừa 1 trang rộng để chart không bị cắt đôi khi in/xuất PDF.
    if (sheet.charts.length > 0) {
      ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    }

    const multi = sheet.tables.length > 1;
    sheet.tables.forEach((t, i) => {
      if (t.columns.length > CHART_FROM_COL) r = Math.max(r, chartBottomRow);
      const firstHeaderRow = r + (multi ? 1 : 0);
      // 1 sheet chỉ có 1 autoFilter => gán cho bảng CUỐI (form E đặt bảng A đầy đủ ở cuối).
      r = writeTable(ws, t, r, multi, placements, i === sheet.tables.length - 1) + 1;
      if (i === 0 && !multi) ws.views = [{ state: 'frozen', ySplit: firstHeaderRow, xSplit: 0 }];
    });

    sheet.charts.forEach((c, idx) => chartSpecs.push(toChartSpec(c, sheet, ws.name, placements, idx)));
  }

  const ab = await wb.xlsx.writeBuffer();
  // Không có chart (form A-D, hoặc kỳ rỗng) -> injectCharts trả nguyên buffer.
  return injectCharts(Buffer.from(ab), chartSpecs);
}
