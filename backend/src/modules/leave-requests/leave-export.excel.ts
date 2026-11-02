import type * as ExcelJS from 'exceljs';
import { loadExcelJS } from '../../common/utils/exceljs-loader';
import type { ExportCell, ExportColumn, ExportModel, ExportTable } from './leave-export.model';

/**
 * [PLAN_WITHDRAWAL_LEAVE_EXPORT - L3] Ghi `ExportModel` ra file .xlsx bằng exceljs. Preview (FE) và file
 * này cùng đọc 1 model => xem gì xuất nấy. Chỉ lo ĐỊNH DẠNG; mọi con số/chuỗi (đã chống formula
 * injection) do `buildLeaveExportModel` quyết định. Chart (form E/F) thêm ở L5 qua xlsx-chart-injector.
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

function writeTable(ws: ExcelJS.Worksheet, table: ExportTable, startRow: number, showTitle: boolean): number {
  let r = startRow;
  if (showTitle) {
    const t = ws.getRow(r++);
    t.getCell(1).value = table.title;
    t.getCell(1).font = { bold: true, size: 12 };
  }
  const headerRowNo = r;
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

  if (table.rows.length > 0) {
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

export interface LeaveExcelMeta {
  exportedByName?: string;
  generatedAtText?: string;
}

export async function buildLeaveExportBuffer(model: ExportModel, meta: LeaveExcelMeta = {}): Promise<Buffer> {
  const ExcelJSLib = loadExcelJS();
  const wb = new ExcelJSLib.Workbook();
  wb.creator = 'AZ Workbase';
  wb.created = new Date();

  for (const sheet of model.sheets) {
    const ws = wb.addWorksheet(sheet.name);
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

    const multi = sheet.tables.length > 1;
    sheet.tables.forEach((t, i) => {
      const firstHeaderRow = r + (multi ? 1 : 0);
      r = writeTable(ws, t, r, multi) + 1;
      if (i === 0 && !multi) ws.views = [{ state: 'frozen', ySplit: firstHeaderRow, xSplit: 0 }];
    });
  }

  const ab = await wb.xlsx.writeBuffer();
  return Buffer.from(ab);
}
