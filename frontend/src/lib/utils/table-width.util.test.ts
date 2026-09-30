import { describe, it, expect } from 'vitest';
import { sumColumnWidths } from './table-width.util';

describe('sumColumnWidths', () => {
  it('cộng width dạng số', () => {
    expect(sumColumnWidths([{ width: 240 }, { width: 100 }])).toBe(340);
  });
  it('cột không có width / width chuỗi tính bằng fallback (chừa chỗ, không bị nén về 0)', () => {
    expect(sumColumnWidths([{ width: 200 }, {}, { width: '20%' }], 150)).toBe(500);
  });
  it('mặc định fallback 160', () => {
    expect(sumColumnWidths([{}])).toBe(160);
  });
  it('mảng rỗng -> 0', () => {
    expect(sumColumnWidths([])).toBe(0);
  });
});
