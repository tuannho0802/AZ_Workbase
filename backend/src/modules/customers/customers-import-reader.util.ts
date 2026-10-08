import { BadRequestException } from '@nestjs/common';
// [AGENT] OLD CODE (giữ để rollback): import * as ExcelJS from 'exceljs';
// NEW (PLAN_CPU_OPTIMIZATION_ROUND2 - Mục 12C): chỉ import KIỂU; runtime nạp lười qua loadExcelJS().
import type * as ExcelJS from 'exceljs';
import { loadExcelJS } from '../../common/utils/exceljs-loader';
import * as Papa from 'papaparse';

/**
 * Đọc file import khách hàng (.xlsx / .csv) thành mảng dòng dạng object
 * `{ [tiêu đề cột]: giá trị }`.
 *
 * [AGENT] Thay thế `xlsx` (SheetJS 0.18.5 — prototype pollution + ReDoS, không có bản vá
 * trên npm) ở đường ĐỌC file không tin cậy. Giữ nguyên hợp đồng đầu ra mà
 * `CustomersImportService` đang dùng (cùng kiểu dữ liệu ô, ô trống = '').
 *
 * - .xlsx  -> exceljs
 * - .csv   -> papaparse (tự nhận dấu phân cách , ; TAB |, bỏ BOM UTF-8; không tự ép
 *             kiểu nên SĐT "0901234567" KHÔNG bị mất số 0)
 * - .xls   -> từ chối, yêu cầu lưu lại thành .xlsx/.csv
 */

export const IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB (giữ nguyên giới hạn cũ)
export const IMPORT_MAX_ROWS = 1000; // giữ nguyên giới hạn cũ
export const IMPORT_MAX_COLUMNS = 50;
/** Tổng dung lượng GIẢI NÉN tối đa của file .xlsx (chống "zip bomb" 5MB nén -> hàng GB RAM). */
export const IMPORT_MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;

export interface ImportSheetData {
  /** Mỗi phần tử là 1 dòng dữ liệu (đã bỏ dòng tiêu đề và dòng trống hoàn toàn). */
  rows: Record<string, any>[];
  /** Số dòng THẬT trong file (1-based, tính cả dòng tiêu đề) của từng phần tử trong `rows`. */
  rowNumbers: number[];
}

type ImportFormat = 'xlsx' | 'csv';

const XLS_MESSAGE = 'Không hỗ trợ file .xls (Excel cũ). Vui lòng lưu lại dưới dạng .xlsx hoặc .csv rồi tải lên.';
const FORMAT_MESSAGE = 'Chỉ chấp nhận file .xlsx hoặc .csv';
const INVALID_MESSAGE = 'File không đúng định dạng Excel/CSV';

const isZip = (b: Buffer) => b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b; // "PK"
const isOle2 = (b: Buffer) =>
  b.length >= 8 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0; // .xls cũ

export function detectImportFormat(file: { originalname: string; mimetype: string; buffer: Buffer }): ImportFormat {
  const ext = (file.originalname.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();

  if (ext === 'xls' || isOle2(file.buffer)) {
    throw new BadRequestException(XLS_MESSAGE);
  }
  if (isZip(file.buffer)) {
    // .xlsx là file zip. Đuôi .csv mà nội dung là zip -> sai định dạng.
    if (ext === 'csv') throw new BadRequestException(INVALID_MESSAGE);
    return 'xlsx';
  }
  if (ext === 'xlsx') {
    // Đuôi .xlsx nhưng không phải zip -> file hỏng/giả mạo.
    throw new BadRequestException(INVALID_MESSAGE);
  }
  // Windows/Chrome thường gửi .csv với mimetype application/vnd.ms-excel nên dựa vào đuôi trước.
  const csvMime = ['text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain'];
  if (ext === 'csv' || (ext === '' && csvMime.includes(file.mimetype))) {
    return 'csv';
  }
  throw new BadRequestException(FORMAT_MESSAGE);
}

/**
 * Tổng dung lượng giải nén khai báo trong central directory của file zip.
 * Chỉ đọc metadata (không giải nén) nên rẻ; dùng để chặn zip bomb TRƯỚC khi nạp vào exceljs.
 */
export function zipDeclaredUncompressedSize(buf: Buffer): number {
  // End Of Central Directory (EOCD) nằm ở cuối file (tối đa 64KB comment)
  const minPos = Math.max(0, buf.length - 22 - 0xffff);
  let eocd = -1;
  for (let i = buf.length - 22; i >= minPos; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new BadRequestException(INVALID_MESSAGE);

  const total = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  let sum = 0;
  for (let n = 0; n < total; n++) {
    if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== 0x02014b50) {
      throw new BadRequestException(INVALID_MESSAGE);
    }
    sum += buf.readUInt32LE(offset + 24); // uncompressed size
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return sum;
}

/** Chuyển giá trị ô exceljs về kiểu đơn giản (string | number | boolean) như SheetJS từng trả. */
function cellToValue(v: ExcelJS.CellValue): string | number | boolean {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  if (v instanceof Date) {
    // Ô ngày của Excel -> dd/mm/yyyy (đúng định dạng service đang parse). exceljs trả Date theo UTC.
    const dd = String(v.getUTCDate()).padStart(2, '0');
    const mm = String(v.getUTCMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${v.getUTCFullYear()}`;
  }
  const o = v as any;
  if (o.richText) return o.richText.map((r: any) => r.text).join('');
  if (o.formula !== undefined || o.sharedFormula !== undefined) return cellToValue(o.result ?? '');
  if (o.text !== undefined) return cellToValue(o.text); // hyperlink (vd email tự động thành link)
  if (o.error) return '';
  return '';
}

function toObjects(matrix: { rowNumber: number; cells: any[] }[]): ImportSheetData {
  // Dòng tiêu đề = dòng đầu tiên có dữ liệu
  const headerIdx = matrix.findIndex((r) => r.cells.some((c) => c !== '' && c !== null && c !== undefined));
  if (headerIdx < 0) return { rows: [], rowNumbers: [] };

  const headerRow = matrix[headerIdx].cells;
  if (headerRow.length > IMPORT_MAX_COLUMNS) {
    throw new BadRequestException(`File vượt quá ${IMPORT_MAX_COLUMNS} cột`);
  }

  // Cột tiêu đề trống bị bỏ qua; tiêu đề trùng chỉ lấy cột đầu tiên.
  const columns: { index: number; key: string }[] = [];
  const seen = new Set<string>();
  headerRow.forEach((h, index) => {
    const key = String(h ?? '').trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    columns.push({ index, key });
  });

  const rows: Record<string, any>[] = [];
  const rowNumbers: number[] = [];
  for (const r of matrix.slice(headerIdx + 1)) {
    const isBlank = r.cells.every((c) => c === '' || c === null || c === undefined || (typeof c === 'string' && c.trim() === ''));
    if (isBlank) continue; // như SheetJS: bỏ dòng trống hoàn toàn
    if (rows.length >= IMPORT_MAX_ROWS) {
      throw new BadRequestException(`Tối đa ${IMPORT_MAX_ROWS} dòng mỗi lần nhập`);
    }
    const obj: Record<string, any> = {};
    for (const { index, key } of columns) {
      const c = r.cells[index];
      obj[key] = c === undefined || c === null ? '' : c;
    }
    rows.push(obj);
    rowNumbers.push(r.rowNumber);
  }
  return { rows, rowNumbers };
}

async function readXlsx(buffer: Buffer): Promise<ImportSheetData> {
  if (zipDeclaredUncompressedSize(buffer) > IMPORT_MAX_UNCOMPRESSED_BYTES) {
    throw new BadRequestException('File quá lớn sau khi giải nén');
  }

  // [AGENT] OLD CODE: const workbook = new ExcelJS.Workbook();
  const { Workbook } = loadExcelJS();
  const workbook = new Workbook();
  try {
    await workbook.xlsx.load(buffer as any);
  } catch {
    throw new BadRequestException(INVALID_MESSAGE);
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) return { rows: [], rowNumbers: [] };

  // Chặn sớm sheet có dải ô khổng lồ (vd 1 ô ở XFD1048576) trước khi duyệt từng dòng
  if (sheet.rowCount > IMPORT_MAX_ROWS * 20 + 1) {
    throw new BadRequestException(`Tối đa ${IMPORT_MAX_ROWS} dòng mỗi lần nhập`);
  }
  if (sheet.columnCount > IMPORT_MAX_COLUMNS * 4) {
    throw new BadRequestException(`File vượt quá ${IMPORT_MAX_COLUMNS} cột`);
  }

  const matrix: { rowNumber: number; cells: any[] }[] = [];
  const colCount = Math.min(sheet.columnCount, IMPORT_MAX_COLUMNS * 4);
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const cells: any[] = [];
    for (let c = 1; c <= colCount; c++) {
      cells.push(cellToValue(row.getCell(c).value));
    }
    // cắt đuôi ô trống để so sánh số cột tiêu đề thực
    while (cells.length && (cells[cells.length - 1] === '' || cells[cells.length - 1] === undefined)) cells.pop();
    matrix.push({ rowNumber, cells });
  });
  return toObjects(matrix);
}

function readCsv(buffer: Buffer): ImportSheetData {
  if (buffer.includes(0)) throw new BadRequestException(INVALID_MESSAGE); // nhị phân, không phải CSV

  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw new BadRequestException('File CSV phải được lưu ở bảng mã UTF-8');
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // bỏ BOM UTF-8

  // delimiter: '' => papaparse tự nhận trong [, ; TAB |]. dynamicTyping tắt (mặc định) => giữ nguyên chuỗi.
  const parsed = Papa.parse<string[]>(text, { header: false, skipEmptyLines: false, delimiter: '' });
  const fatal = parsed.errors.find((e) => e.type === 'Quotes');
  if (fatal) throw new BadRequestException(INVALID_MESSAGE);

  const matrix = parsed.data.map((cells, i) => ({ rowNumber: i + 1, cells: cells as any[] }));
  return toObjects(matrix);
}

export async function readImportFile(file: {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}): Promise<ImportSheetData> {
  const format = detectImportFormat(file);
  return format === 'xlsx' ? readXlsx(file.buffer) : readCsv(file.buffer);
}
