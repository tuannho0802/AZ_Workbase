import { describe, expect, it } from 'vitest';
import {
  buildDemoFence,
  extractDemoSpecs,
  isExternalUrl,
  parseDemoId,
  parseDemoSpec,
  sanitizeImageUrl,
  sanitizeLinkUrl,
} from './guide-markdown';

describe('sanitizeLinkUrl', () => {
  it.each([
    'https://example.com/a?b=1',
    'http://example.com',
    'mailto:a@b.com',
    'tel:+84901234567',
    '/customers',
    '#muc-2',
    '?tab=1',
    'trang/abc',
  ])('cho qua %s', (u) => expect(sanitizeLinkUrl(u)).toBe(u));

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'java\tscript:alert(1)',
    'java\nscript:alert(1)',
    ' \u0001javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    '//evil.com',
    '/\\evil.com',
    'file:///etc/passwd',
    '',
  ])('chặn %j', (u) => expect(sanitizeLinkUrl(u)).toBe(''));

  it('null/undefined -> rỗng', () => {
    expect(sanitizeLinkUrl(null)).toBe('');
    expect(sanitizeLinkUrl(undefined)).toBe('');
  });
});

describe('sanitizeImageUrl', () => {
  it('chỉ nhận https', () => {
    expect(sanitizeImageUrl('https://b2.example.com/a.png?X-Sig=1')).toBe('https://b2.example.com/a.png?X-Sig=1');
    expect(sanitizeImageUrl('http://example.com/a.png')).toBe('');
    expect(sanitizeImageUrl('data:image/png;base64,AAAA')).toBe('');
    expect(sanitizeImageUrl('javascript:alert(1)')).toBe('');
    expect(sanitizeImageUrl('https://a.com/x y.png')).toBe('');
    expect(sanitizeImageUrl('https://a.com/\u0000x.png')).toBe('');
  });
});

describe('helpers', () => {
  it('isExternalUrl', () => {
    expect(isExternalUrl('https://a.com')).toBe(true);
    expect(isExternalUrl('mailto:a@b.com')).toBe(true);
    expect(isExternalUrl('/customers')).toBe(false);
  });
  it('parseDemoId lấy từ đầu tiên', () => {
    expect(parseDemoId('  status-tags \n')).toBe('status-tags');
    expect(parseDemoId('')).toBe('');
  });
  it('buildDemoFence khớp parseDemoId', () => {
    const fence = buildDemoFence('utm-tags');
    expect(fence).toContain('```az-demo\nutm-tags\n```');
  });
});

describe('parseDemoSpec', () => {
  it('chỉ id', () => {
    expect(parseDemoSpec('status-tags\n')).toEqual({ id: 'status-tags', params: {}, invalid: [] });
  });
  it('id + tham số key=value', () => {
    expect(parseDemoSpec('customer-table-by-viewer persona=sales-primary')).toEqual({
      id: 'customer-table-by-viewer',
      params: { persona: 'sales-primary' },
      invalid: [],
    });
  });
  it('chỉ đọc dòng đầu', () => {
    expect(parseDemoSpec('a persona=x\nb persona=y').params).toEqual({ persona: 'x' });
  });
  it('token sai cú pháp -> invalid (không nhận HTML/URL)', () => {
    const r = parseDemoSpec('a persona=<script> url=https://x.com Persona=x k=');
    expect(r.params).toEqual({});
    expect(r.invalid).toHaveLength(4);
  });
  it('rỗng', () => {
    expect(parseDemoSpec('')).toEqual({ id: '', params: {}, invalid: [] });
  });
});

describe('extractDemoSpecs', () => {
    it('lấy id + tham số của mọi khối az-demo, bỏ qua khối code khác', () => {
        const md = ['Mở đầu', '```az-demo', 'status-tags', '```', '', '```ts', 'const a = 1', '```', '', '```az-demo', 'customer-table-by-viewer persona=manager', '```'].join('\n');
        expect(extractDemoSpecs(md)).toEqual([
            { id: 'status-tags', params: {}, invalid: [] },
            { id: 'customer-table-by-viewer', params: { persona: 'manager' }, invalid: [] },
        ]);
    });
    it('chịu CRLF và báo token sai cú pháp', () => {
        const specs = extractDemoSpecs('```az-demo\r\ncustomer-table persona=Manager\r\n```');
        expect(specs[0].id).toBe('customer-table');
        expect(specs[0].invalid).toEqual(['persona=Manager']);
    });
    it('không có khối nào -> mảng rỗng', () => {
        expect(extractDemoSpecs('chỉ có chữ')).toEqual([]);
    });
});
