import { describe, it, expect } from 'vitest';
import { parseLinks, truncateSegments } from './linkify';

describe('parseLinks', () => {
  it('text thường không có link', () => {
    expect(parseLinks('Không có gì')).toEqual([{ type: 'text', value: 'Không có gì' }]);
  });
  it('nhận https và giữ text xung quanh', () => {
    expect(parseLinks('Xem https://a.com/x?y=1 nhé')).toEqual([
      { type: 'text', value: 'Xem ' },
      { type: 'link', value: 'https://a.com/x?y=1', href: 'https://a.com/x?y=1' },
      { type: 'text', value: ' nhé' },
    ]);
  });
  it('www. tự thêm https://', () => {
    const [seg] = parseLinks('www.google.com');
    expect(seg).toEqual({ type: 'link', value: 'www.google.com', href: 'https://www.google.com' });
  });
  it('bỏ dấu câu dính đuôi', () => {
    const segs = parseLinks('Link: https://a.com/b.');
    expect(segs[1]).toMatchObject({ type: 'link', value: 'https://a.com/b' });
    expect(segs[2]).toEqual({ type: 'text', value: '.' });
  });
  it('giữ ")" nếu URL có "(" cân bằng, bỏ nếu thừa', () => {
    expect(parseLinks('https://a.com/x_(y)')[0]).toMatchObject({ value: 'https://a.com/x_(y)' });
    expect(parseLinks('(https://a.com/x)')[1]).toMatchObject({ value: 'https://a.com/x' });
  });
  it('nhiều link + xuống dòng', () => {
    const links = parseLinks('a https://x.com\nb http://y.com').filter((s) => s.type === 'link');
    expect(links).toHaveLength(2);
  });
  it('không nhận javascript:', () => {
    expect(parseLinks('javascript:alert(1)').some((s) => s.type === 'link')).toBe(false);
  });
});

describe('truncateSegments', () => {
  it('cắt chữ hiển thị nhưng giữ href đầy đủ', () => {
    const segs = truncateSegments(parseLinks('Xem https://example.com/very/long/path'), 15);
    expect(segs[1]).toMatchObject({ type: 'link', href: 'https://example.com/very/long/path' });
    expect(segs[1].value.endsWith('…')).toBe(true);
  });
  it('không cắt khi ngắn hơn giới hạn', () => {
    const segs = parseLinks('ngắn');
    expect(truncateSegments(segs, 60)).toEqual(segs);
  });
});
