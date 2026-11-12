import type * as ExcelJS from 'exceljs';
import { loadExcelJS } from '../../common/utils/exceljs-loader';
import type { ExportCell, ExportColumn } from '../leave-requests/leave-export.model';
import { ymdToDmy } from '../leave-requests/leave-export.excel';
import type { FanpageExportModel, FanpageExportSheet } from './fanpage-export.model';

/**
 * Ghi `FanpageExportModel` ra .xlsx bằng exceljs (mirror `leave-export.excel`). Chỉ lo ĐỊNH DẠNG; mọi con số/chuỗi (đã chống formula
 * injection, đã qua cổng quyền) do `buildFanpageExportModel` quyết định. Mỗi sheet 1 bảng: tiêu đề, dòng kỳ/người xuất, header cố định, autoFilter.
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

function toExcelValue(cell: ExportCell, col: ExportColumn): ExcelJS.CellValue {
    if (cell === null || cell === undefined || cell === '') return null;
    // Ngày thuần -> Date UTC 00:00 để Excel hiểu là ngày thật (lọc/sắp xếp được), numFmt dd/mm/yyyy.
    if (col.type === 'date' && typeof cell === 'string' && YMD.test(cell)) return new Date(`${cell}T00:00:00.000Z`);
    return cell;
}

export interface FanpageExcelMeta {
    exportedByName?: string;
    generatedAtText?: string;
}

function periodText(model: FanpageExportModel): string {
    const { from, to } = model.period;
    if (from && to) return `Kỳ: ${ymdToDmy(from)} - ${ymdToDmy(to)}`;
    if (from) return `Từ ${ymdToDmy(from)}`;
    if (to) return `Đến ${ymdToDmy(to)}`;
    return 'Kỳ: toàn bộ dữ liệu';
}

function writeSheet(wb: ExcelJS.Workbook, model: FanpageExportModel, sheet: FanpageExportSheet, meta: FanpageExcelMeta): void {
    const ws = wb.addWorksheet(sheet.name);
    const t = sheet.table;

    ws.getRow(1).getCell(1).value = `Fanpage - ${t.title}`;
    ws.getRow(1).getCell(1).font = { bold: true, size: 14 };
    ws.getRow(2).getCell(1).value =
        periodText(model) +
        (meta.exportedByName ? `   |   Người xuất: ${meta.exportedByName}` : '') +
        (meta.generatedAtText ? `   |   Xuất lúc: ${meta.generatedAtText}` : '');
    ws.getRow(2).getCell(1).font = { color: { argb: 'FF595959' } };

    t.columns.forEach((c, i) => {
        ws.getColumn(i + 1).width = c.width ?? 12;
    });

    let r = 4;
    const headerRowNo = r;
    const header = ws.getRow(r++);
    t.columns.forEach((c, i) => {
        const cell = header.getCell(i + 1);
        cell.value = c.header;
        cell.fill = HEADER_FILL;
        cell.font = HEADER_FONT;
        cell.border = THIN;
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    });
    header.height = 28;

    for (const row of t.rows) {
        const xr = ws.getRow(r++);
        t.columns.forEach((c, i) => {
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

    if (t.rows.length > 0) {
        ws.autoFilter = { from: { row: headerRowNo, column: 1 }, to: { row: headerRowNo + t.rows.length, column: t.columns.length } };
    }
    ws.views = [{ state: 'frozen', ySplit: headerRowNo, xSplit: 0 }];

    if (t.totalsRow && t.rows.length > 0) {
        const xr = ws.getRow(r++);
        t.columns.forEach((c, i) => {
            const cell = xr.getCell(i + 1);
            cell.value = toExcelValue(t.totalsRow![i], c);
            cell.font = { bold: true };
            cell.fill = TOTAL_FILL;
            cell.border = THIN;
            if (c.type === 'number') cell.alignment = { horizontal: 'right' };
        });
    }

    if (t.rows.length === 0) {
        const n = ws.getRow(r++);
        n.getCell(1).value = 'Không có dữ liệu';
        n.getCell(1).font = { italic: true, color: { argb: 'FFD46B08' } };
    }
    if (t.note) {
        const n = ws.getRow(r++);
        n.getCell(1).value = t.note;
        n.getCell(1).font = { italic: true, color: { argb: 'FF8C8C8C' } };
    }
}

export async function buildFanpageExportBuffer(model: FanpageExportModel, meta: FanpageExcelMeta = {}): Promise<Buffer> {
    const ExcelJSLib = loadExcelJS();
    const wb = new ExcelJSLib.Workbook();
    wb.creator = 'AZ Workbase';
    wb.created = new Date();
    for (const sheet of model.sheets) writeSheet(wb, model, sheet, meta);
    const ab = await wb.xlsx.writeBuffer();
    return Buffer.from(ab);
}