import { normalizeUtmName } from './utm-backfill.util';

describe('normalizeUtmName', () => {
  it('trim + gộp khoảng trắng (kể cả NBSP)', () => {
    expect(normalizeUtmName('  FB   Q4 ')).toBe('FB Q4');
    expect(normalizeUtmName('TikTok\u00a0X')).toBe('TikTok X');
  });
  it('bỏ ký tự zero-width, giữ nguyên hoa/thường và dấu', () => {
    expect(normalizeUtmName('Chiến\u200B dịch')).toBe('Chiến dịch');
    expect(normalizeUtmName('FB_Q4')).toBe('FB_Q4');
  });
  it('chuỗi chỉ toàn khoảng trắng -> rỗng', () => {
    expect(normalizeUtmName(' \u00a0 \t')).toBe('');
  });
});
