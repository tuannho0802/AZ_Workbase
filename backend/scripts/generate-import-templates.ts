/**
 * Sinh file mẫu import khách hàng (tĩnh) bằng exceljs -> frontend/public/templates/.
 * Chạy: `npm run templates:generate` (trong backend/). Chỉ cần chạy lại khi đổi cột import
 * (xem customers.import.service.ts). Commit file .xlsx sinh ra; FE chỉ trỏ link tải,
 * không còn thư viện Excel nào chạy ở trình duyệt.
 */
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';

const OUT_DIR = path.resolve(__dirname, '../../frontend/public/templates');
const OUT_FILE = path.join(OUT_DIR, 'AZWorkbase_Template_KhachHang.xlsx');

const HEADERS = [
  'Họ và Tên',
  'Số điện thoại',
  'Email',
  'Nguồn',
  'Chiến dịch',
  'Trạng thái',
  'Broker',
  'Ngày nhập data',
  'Ngày chốt',
  'Ghi chú',
];

const EXAMPLE = [
  'Nguyễn Văn Excel',
  '0912345678',
  'excel@example.com',
  'Facebook',
  'Sale Mùa Hè',
  'pending',
  'Vndirect',
  '10/08/2026',
  '15/08/2026',
  'Khách từ file mẫu',
];

// Cột cần định dạng Text để Excel không làm mất số 0 đầu của SĐT / không tự đổi dd/mm/yyyy thành ngày
const TEXT_COLUMNS = [2, 8, 9]; // Số điện thoại, Ngày nhập data, Ngày chốt (1-based)
const WIDTHS = [24, 16, 26, 14, 18, 14, 14, 16, 14, 30];

async function main() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('KhachHang');

  ws.addRow(HEADERS).font = { bold: true };
  ws.addRow(EXAMPLE);

  WIDTHS.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  TEXT_COLUMNS.forEach((c) => (ws.getColumn(c).numFmt = '@'));
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  fs.mkdirSync(OUT_DIR, { recursive: true });
  await wb.xlsx.writeFile(OUT_FILE);
  // eslint-disable-next-line no-console
  console.log('Đã tạo:', OUT_FILE);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
