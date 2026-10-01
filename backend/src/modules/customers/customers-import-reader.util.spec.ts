import * as ExcelJS from 'exceljs';
import {
  detectImportFormat,
  readImportFile,
  zipDeclaredUncompressedSize,
  IMPORT_MAX_UNCOMPRESSED_BYTES,
} from './customers-import-reader.util';

const xlsxBuffer = async (aoa: any[][]) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('S');
  aoa.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
};
const f = (originalname: string, buffer: Buffer, mimetype = 'application/octet-stream') => ({ originalname, mimetype, buffer });

describe('customers-import-reader.util', () => {
  it('xlsx: ô trống = "", bỏ dòng trống hoàn toàn, giữ số/chuỗi, trả số dòng thật', async () => {
    const buf = await xlsxBuffer([['A', 'B', 'C'], ['x', 1, null], [null, null, null], ['y', '0901', 'z']]);
    const { rows, rowNumbers } = await readImportFile(f('a.xlsx', buf));
    expect(rows).toEqual([
      { A: 'x', B: 1, C: '' },
      { A: 'y', B: '0901', C: 'z' },
    ]);
    expect(rowNumbers).toEqual([2, 4]);
  });

  it('xlsx: ô công thức lấy kết quả, richText nối chuỗi', async () => {
    const buf = await xlsxBuffer([
      ['A', 'B'],
      [{ formula: '1+1', result: 2 }, { richText: [{ text: 'Xin ' }, { text: 'chào' }] }],
    ]);
    const { rows } = await readImportFile(f('a.xlsx', buf));
    expect(rows[0]).toEqual({ A: 2, B: 'Xin chào' });
  });

  it('xlsx: header trống bị bỏ, header trùng lấy cột đầu', async () => {
    const buf = await xlsxBuffer([['A', '', 'A'], ['1', '2', '3']]);
    const { rows } = await readImportFile(f('a.xlsx', buf));
    expect(rows).toEqual([{ A: '1' }]);
  });

  it('zip bomb: kích thước giải nén khai báo quá lớn -> từ chối trước khi nạp vào exceljs', async () => {
    const buf = await xlsxBuffer([['A'], ['1']]);
    expect(zipDeclaredUncompressedSize(buf)).toBeLessThan(IMPORT_MAX_UNCOMPRESSED_BYTES);
    // sửa trường "uncompressed size" của entry đầu tiên trong central directory thành ~1GB
    const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    const cd = buf.readUInt32LE(eocd + 16);
    const bad = Buffer.from(buf);
    bad.writeUInt32LE(1024 * 1024 * 1024, cd + 24);
    expect(zipDeclaredUncompressedSize(bad)).toBeGreaterThan(IMPORT_MAX_UNCOMPRESSED_BYTES);
    return expect(readImportFile(f('a.xlsx', bad))).rejects.toThrow('File quá lớn sau khi giải nén');
  });

  it('zip hỏng (cắt cụt) -> báo sai định dạng, không crash', async () => {
    const buf = await xlsxBuffer([['A'], ['1']]);
    await expect(readImportFile(f('a.xlsx', buf.subarray(0, buf.length - 30)))).rejects.toThrow('File không đúng định dạng Excel/CSV');
  });

  it('csv: CRLF, dấu ngoặc kép chứa dấu phẩy và xuống dòng', async () => {
    const csv = 'A,B\r\n"x, y","l1\nl2"\r\n';
    const { rows } = await readImportFile(f('a.csv', Buffer.from(csv), 'text/csv'));
    expect(rows).toEqual([{ A: 'x, y', B: 'l1\nl2' }]);
  });

  it('csv: nhị phân (có byte NUL) -> từ chối; không phải UTF-8 -> báo bảng mã', async () => {
    await expect(readImportFile(f('a.csv', Buffer.from([65, 0, 66])))).rejects.toThrow('File không đúng định dạng Excel/CSV');
    await expect(readImportFile(f('a.csv', Buffer.from([0x41, 0x2c, 0xe9, 0x0a])))).rejects.toThrow('UTF-8');
  });

  it('detectImportFormat: .csv chứa nội dung zip bị từ chối; không đuôi + mimetype csv -> csv', () => {
    expect(() => detectImportFormat(f('a.csv', Buffer.from([0x50, 0x4b, 3, 4])))).toThrow();
    expect(detectImportFormat(f('data', Buffer.from('a,b'), 'text/csv'))).toBe('csv');
  });

  it('prototype pollution: tiêu đề "__proto__" không làm ô nhiễm Object.prototype', async () => {
    const csv = '__proto__,constructor\nx,y\n';
    await readImportFile(f('a.csv', Buffer.from(csv), 'text/csv'));
    expect(({} as any).x).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'x')).toBe(false);
  });
});
