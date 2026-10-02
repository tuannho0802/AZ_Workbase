import { describe, expect, it } from 'vitest';
import {
  buildDemoFence,
  isExternalUrl,
  parseDemoId,
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
